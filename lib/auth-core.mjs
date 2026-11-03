import {betterAuth} from 'better-auth/minimal';
import {emailOTP} from 'better-auth/plugins/email-otp';
import {createAuthMiddleware, APIError} from 'better-auth/api';
import {normalizeBYUEmail} from './account-policy.mjs';
import {errorResponse, json, readJSON, requireSameOrigin} from './http.mjs';

// Every allowlisted flow below carries an `email` body field that must be an
// exact BYU address. `codeSends` are the paths that trigger an email delivery
// and therefore consume the per-address send quota.
const EMAIL_FLOWS = ['/sign-up/email', '/sign-in/email', '/email-otp/send-verification-otp', '/email-otp/verify-email', '/email-otp/request-password-reset', '/email-otp/reset-password'];
const OTP_TYPES = ['email-verification', 'forget-password'];
const CODE_SENDS = ['/sign-up/email', '/email-otp/send-verification-otp', '/email-otp/request-password-reset'];

/** @param {{database: import('better-auth').BetterAuthOptions['database'], secret: string, baseURL: string, sendCode: ((data: {email: string, otp: string, type: string}) => Promise<void>) | null, reserveSend: (email: string) => Promise<boolean>}} options */
export function createAccountAuth({database, secret, baseURL, sendCode, reserveSend}) {
  // Plugin init closures (the verification-email sender) capture the root
  // AuthContext, while endpoint handlers see a per-request copy. Capturing the
  // root here lets the before-hook propagate mail failures at both levels.
  let rootContext = null;
  return betterAuth({
    appName: 'BYU Calendar', database, secret, baseURL,
    trustedOrigins: [new URL(baseURL).origin],
    user: {modelName: 'authUser'},
    account: {modelName: 'authAccount'},
    verification: {modelName: 'authVerification'},
    session: {modelName: 'authSession', expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: {enabled: false}},
    emailAndPassword: {
      enabled: true, minPasswordLength: 8, maxPasswordLength: 128,
      // Accounts stay unusable until the emailed code proves mailbox ownership;
      // verifying the code (below) is what creates the first session.
      requireEmailVerification: true, autoSignIn: false, revokeSessionsOnPasswordReset: true,
      async onPasswordReset({user}) {
        // Recovery also verifies the mailbox. A pending signup code must not
        // remain an alternate way to create a session with the old credentials.
        await rootContext.internalAdapter.deleteVerificationByIdentifier(`email-verification-otp-${user.email}`);
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      async beforeEmailVerification(user) {
        if (user.emailVerified) throw new APIError('BAD_REQUEST', {message: 'This email is already verified. Sign in with your password.'});
      },
    },
    advanced: {
      cookiePrefix: 'byu-calendar',
      useSecureCookies: new URL(baseURL).protocol === 'https:',
      ipAddress: {ipAddressHeaders: ['x-real-ip']},
    },
    rateLimit: {
      enabled: true, storage: 'database', modelName: 'authRateLimit', window: 60, max: 60,
      customRules: {
        '/sign-up/email': {window: 60, max: 5},
        '/sign-in/email': {window: 60, max: 10},
        '/email-otp/send-verification-otp': {window: 60, max: 5},
        '/email-otp/verify-email': {window: 60, max: 5},
        '/email-otp/request-password-reset': {window: 60, max: 5},
        '/email-otp/reset-password': {window: 60, max: 5},
      },
    },
    hooks: {before: createAuthMiddleware(async ctx => {
      if (!EMAIL_FLOWS.includes(ctx.path)) return;
      const email = normalizeBYUEmail(ctx.body?.email);
      if (!email) throw new APIError('BAD_REQUEST', {message: 'Use your @byu.edu or @student.byu.edu email.'});
      if (ctx.path === '/email-otp/send-verification-otp') {
        if (!OTP_TYPES.includes(ctx.body.type)) throw new APIError('BAD_REQUEST', {message: 'Use a supported email code.'});
        if (ctx.body.type === 'email-verification') {
          // A verification code must never become a way to sign in to an
          // already-verified account; passwords own that path.
          const existing = await ctx.context.internalAdapter.findUserByEmail(email);
          if (existing?.user?.emailVerified) throw new APIError('BAD_REQUEST', {message: 'This email is already verified. Sign in with your password.'});
        }
      }
      if (CODE_SENDS.includes(ctx.path)) {
        if (!sendCode) throw new APIError('SERVICE_UNAVAILABLE', {message: 'Email verification is not available yet. Please check back soon.'});
        if (!await reserveSend(email)) throw new APIError('TOO_MANY_REQUESTS', {message: 'Please wait before requesting another code.'});
        // Better Auth's default background helper catches and logs mail
        // failures. Propagate them instead, so a request never claims an
        // unsent code was sent — including sign-up's plugin-owned send chain.
        const propagate = async promise => { await promise; };
        ctx.context.runInBackgroundOrAwait = propagate;
        if (rootContext) rootContext.runInBackgroundOrAwait = propagate;
      }
      return {context: {body: {...ctx.body, email}}};
    })},
    plugins: [emailOTP({
      otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: 'hashed', resendStrategy: 'rotate',
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({email, otp, type}) {
        if (!sendCode) throw new APIError('SERVICE_UNAVAILABLE', {message: 'Email verification is not available yet.'});
        // Await delivery so a failed email is never reported as sent.
        try { await sendCode({email, otp, type}); }
        catch { throw new APIError('SERVICE_UNAVAILABLE', {message: 'We could not send your code. Please try again shortly.'}); }
      },
    }), {
      id: 'byu-calendar-root-context', version: '1',
      init(context) { rootContext = context; },
    }],
  });
}

// Expose only the flows this application supports: password sign-up/sign-in,
// emailed verification codes, emailed password resets, and logout. No OTP
// sign-in, profile/email mutation, or unverified-account endpoints are public.
export async function handleAccountAuth(request, auth, origin) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '');
    const allowed = ['/sign-up/email', '/sign-in/email', '/email-otp/send-verification-otp', '/email-otp/verify-email', '/email-otp/request-password-reset', '/email-otp/reset-password', '/sign-out'];
    if (request.method !== 'POST' || !allowed.includes(path)) return json({error: 'Not found.'}, 404);
    requireSameOrigin(request, origin);
    const body = await readJSON(request, 4096);
    if (!auth) return json({error: 'Email verification is not available yet. Please check back soon.'}, 503);
    const headers = new Headers(request.headers); headers.delete('content-length');
    const response = await auth.handler(new Request(request.url, {method: 'POST', headers, body: JSON.stringify(body)}));
    const responseHeaders = new Headers(response.headers); responseHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, {status: response.status, headers: responseHeaders});
  } catch (error) { return errorResponse(error); }
}

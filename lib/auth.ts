import {env} from 'cloudflare:workers';
import {drizzle} from 'drizzle-orm/d1';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {database} from '../db';
import * as schema from '../db/schema';
import {createAccountAuth} from './auth-core.mjs';
import {permissionsFor} from './account-policy.mjs';
import {consumeQuota} from './community-store.mjs';
import {staffStateFor} from './staff-server.mjs';
import type {AccountState} from '../app/types';

export function authConfiguration() {
  const secret = env.BETTER_AUTH_SECRET || '';
  let origin = '';
  try {
    const url = new URL(env.BETTER_AUTH_URL || '');
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) origin = url.origin;
  } catch { /* No authentication until explicitly configured. */ }
  const configured = secret.length >= 32 && Boolean(origin);
  return {secret, origin, configured, emailReady: configured && Boolean(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM)};
}

export function accountAuth() {
  const config = authConfiguration();
  if (!config.configured) return null;
  const db = database();
  return createAccountAuth({
    database: drizzleAdapter(drizzle(db, {schema}), {provider: 'sqlite', schema, transaction: false}),
    secret: config.secret, baseURL: config.origin,
    reserveSend: async email => {
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)))).map(n => n.toString(16).padStart(2, '0')).join('');
      return await consumeQuota(db, `email-minute:${hash}`, 1, 60) && await consumeQuota(db, `email-hour:${hash}`, 6, 3600);
    },
    sendCode: config.emailReady ? async ({email, otp, type}) => {
      // Both templates keep the "... code is NNNNNN" phrase; local sandboxes
      // and integration tests intercept delivery by matching it.
      const message = type === 'forget-password'
        ? {subject: `${otp} is your BYU Calendar password reset code`, text: `Your BYU Calendar password reset code is ${otp}.\n\nUse it to set a new password for your account. It expires in 10 minutes and can only be used once.\nIf you did not request this code, you can ignore this email.\n\nBYU Calendar is an independent student project, not an official BYU service.`}
        : {subject: `${otp} is your BYU Calendar verification code`, text: `Your BYU Calendar account verification code is ${otp}.\n\nEnter it where you started signing up to verify your email and finish signing in. It expires in 10 minutes and can only be used once.\nIf you did not request this code, you can ignore this email.\n\nBYU Calendar is an independent student project, not an official BYU service.`};
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: {Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({from: env.AUTH_EMAIL_FROM, to: [email], ...message}),
      });
      if (!response.ok) throw new Error('Email delivery failed.');
      await response.body?.cancel();
    } : null,
  });
}

export async function readAccount(request: Request): Promise<AccountState> {
  const auth = accountAuth();
  const session = auth ? await auth.api.getSession({headers: request.headers}) : null;
  const user = session?.user ? {id: session.user.id, email: session.user.email, name: session.user.name, emailVerified: session.user.emailVerified} : null;
  const staff = user ? await staffStateFor(database(), user.id) : null;
  return {user, permissions: permissionsFor(user, env.CALENDAR_ADMIN_EMAILS || ''), emailReady: authConfiguration().emailReady, staff};
}

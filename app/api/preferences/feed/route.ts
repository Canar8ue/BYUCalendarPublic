import {readAccount, authConfiguration} from '../../../../lib/auth';
import {isVerifiedBYUUser} from '../../../../lib/account-policy.mjs';
import {feedToken} from '../../../../lib/feed.mjs';
import {json, errorResponse, RequestError} from '../../../../lib/http.mjs';

export const dynamic = 'force-dynamic';

// Hands the signed-in member the personal subscription URL. The token is
// derived, not stored, so this endpoint never writes anything; revoking it
// means rotating the auth secret.
export async function GET(request: Request) {
  try {
    const {user} = await readAccount(request);
    if (!user || !isVerifiedBYUUser(user)) throw new RequestError(401, 'Sign in with a verified BYU email to get a personal calendar link.');
    const config = authConfiguration();
    if (config.secret.length < 32 || !config.origin) throw new RequestError(503, 'Calendar subscriptions are not configured yet.');
    const token = await feedToken(user.id, config.secret);
    const url = `${config.origin}/api/calendar/ics?t=${encodeURIComponent(token)}`;
    return json({url, webcal: url.replace(/^https?:\/\//, 'webcal://')});
  } catch (error) { return errorResponse(error); }
}

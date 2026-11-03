import {database} from '../../../../db';
import {readAccount} from '../../../../lib/auth';
import {readRsvps} from '../../../../lib/rsvp-server.mjs';
import {isVerifiedBYUUser} from '../../../../lib/account-policy.mjs';
import {json, errorResponse} from '../../../../lib/http.mjs';

// The public RSVP list for one event. Hidden members never appear. Everyone
// sees the avatar and the first initial; verified members also see the name
// and BYU email behind the hover.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const account = await readAccount(request);
    const viewerIsMember = Boolean(account.user && isVerifiedBYUUser(account.user));
    const id = new URL(request.url).searchParams.get('id') || '';
    return json(await readRsvps(database(), id, viewerIsMember));
  } catch (error) { return errorResponse(error); }
}

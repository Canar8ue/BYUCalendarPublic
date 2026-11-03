import {database} from '../../../db';
import {readAccount, authConfiguration} from '../../../lib/auth';
import {readPublicProfile, writePublicProfile} from '../../../lib/rsvp-server.mjs';
import {json, errorResponse, readJSON, requireSameOrigin} from '../../../lib/http.mjs';

// A member's public profile: an optional avatar (a client-resized data URL)
// shown on RSVP lists, and the switch that hides them from those lists.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const {user} = await readAccount(request);
    if (!user) return json({avatar: null, hidden: false});
    return json(await readPublicProfile(database(), user.id));
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    const {user} = await readAccount(request);
    if (!user) return json({error: 'Sign in to update your public profile.'}, 401);
    requireSameOrigin(request, authConfiguration().origin);
    const input = await readJSON(request, 320000);
    return json(await writePublicProfile(database(), user.id, input));
  } catch (error) { return errorResponse(error); }
}

import {database} from '../../../../db';
import {readAccount, authConfiguration} from '../../../../lib/auth';
import {requestStaffStatus} from '../../../../lib/staff-server.mjs';
import {json, errorResponse, readJSON, requireSameOrigin} from '../../../../lib/http.mjs';

// A verified BYU member asks for professor/staff standing in their field.
// Directory-listed addresses verify immediately; everyone else waits for an
// administrator's approval in /moderation.
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const account = await readAccount(request);
    requireSameOrigin(request, authConfiguration().origin);
    const input = await readJSON(request, 2048);
    return json(await requestStaffStatus(database(), account, input));
  } catch (error) { return errorResponse(error); }
}

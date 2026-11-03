import {database} from '../../../../db';
import {readAccount, authConfiguration} from '../../../../lib/auth';
import {listStaffAccounts, resolveStaffAccount} from '../../../../lib/staff-server.mjs';
import {invalidateCalendar} from '../../../../lib/calendar-server';
import {json, errorResponse, readJSON, requireSameOrigin} from '../../../../lib/http.mjs';

// Administrator review of BYU professor/staff requests: the pending queue,
// approve/deny, and revoke for accounts whose standing changed.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return json({requests: await listStaffAccounts(database(), await readAccount(request))}); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const account = await readAccount(request);
    requireSameOrigin(request, authConfiguration().origin);
    const input = await readJSON(request, 2048);
    const result = await resolveStaffAccount(database(), account, input);
    // Approval or revocation changes which listings read as BYU-official.
    invalidateCalendar();
    return json(result);
  } catch (error) { return errorResponse(error); }
}

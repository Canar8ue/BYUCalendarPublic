import {refreshCalendar} from '../../../lib/calendar-server';
import {authConfiguration} from '../../../lib/auth';
import {json, errorResponse, requireRefreshOrigin} from '../../../lib/http.mjs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    requireRefreshOrigin(request, authConfiguration().origin || new URL(request.url).origin);
    return json(await refreshCalendar(new URL(request.url).searchParams.get('force') === '1'));
  } catch (error) { return errorResponse(error); }
}

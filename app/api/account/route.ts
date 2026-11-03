import {readAccount} from '../../../lib/auth';
import {json, errorResponse} from '../../../lib/http.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return json(await readAccount(request)); }
  catch (error) { return errorResponse(error); }
}

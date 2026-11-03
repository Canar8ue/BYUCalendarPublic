import {accountAuth, authConfiguration} from '../../../../lib/auth';
import {handleAccountAuth} from '../../../../lib/auth-core.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleAccountAuth(request, accountAuth(), authConfiguration().origin || new URL(request.url).origin);
}
export async function GET(request: Request) {
  return handleAccountAuth(request, null, '');
}

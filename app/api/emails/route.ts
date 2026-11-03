import {inboxRequest} from '../../../lib/inbox-server';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => inboxRequest(request, 'list');

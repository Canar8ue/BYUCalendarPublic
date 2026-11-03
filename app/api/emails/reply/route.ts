import {inboxRequest} from '../../../../lib/inbox-server';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => inboxRequest(request, 'reply');

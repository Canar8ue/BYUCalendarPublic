import {inboundWebhook} from '../../../../lib/inbox-server';
export const dynamic = 'force-dynamic';
// Public Resend webhook receiver; the Svix signature over the raw body is the
// authentication, so no same-origin or session check applies here.
export const POST = (request: Request) => inboundWebhook(request);

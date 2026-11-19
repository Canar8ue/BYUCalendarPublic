import {suggestInterestRequest} from '../../../../lib/inbox-server';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => suggestInterestRequest(request);

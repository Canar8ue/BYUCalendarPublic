import {communityRequest} from '../../../../lib/community-server';
export const dynamic = 'force-dynamic';
export const POST = (request: Request) => communityRequest(request, 'update');

import {communityRequest} from '../../../../lib/community-server';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => communityRequest(request, 'mine');

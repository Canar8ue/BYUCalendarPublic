import {recommendationsRequest} from '../../../lib/profile-server';
export const dynamic='force-dynamic';
export async function GET(request: Request){return recommendationsRequest(request);}

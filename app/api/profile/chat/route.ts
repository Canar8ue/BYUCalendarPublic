import {profileChatRequest} from '../../../../lib/profile-server';
export const dynamic='force-dynamic';
export async function POST(request: Request){return profileChatRequest(request);}

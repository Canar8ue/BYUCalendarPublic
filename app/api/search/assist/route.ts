import {searchAssistRequest} from '../../../../lib/search-assist-server';
export const dynamic='force-dynamic';
export async function POST(request: Request){return searchAssistRequest(request);}

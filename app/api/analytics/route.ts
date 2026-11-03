import {analyticsRequest} from '../../../lib/analytics-server';
export const dynamic='force-dynamic';
export async function POST(request: Request){return analyticsRequest(request,'record');}
export async function GET(request: Request){return analyticsRequest(request,'summary');}

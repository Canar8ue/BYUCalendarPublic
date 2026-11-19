import {readCalendarJSON} from '../../../lib/calendar-server';
export const dynamic='force-dynamic';
export async function GET(){try{return new Response(await readCalendarJSON(),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}catch(error){console.error(error);return Response.json({error:'The calendar could not be loaded. Please try again.'},{status:503});}}

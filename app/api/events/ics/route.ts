import {readCalendar} from '../../../../lib/calendar-server';
import {eventSlug,exportICS} from '../../../../lib/search.mjs';
export const dynamic='force-dynamic';
// Serves one event as a real text/calendar URL so mobile Safari offers its
// native "Add to Calendar" sheet; desktop browsers download the same file.
export async function GET(request:Request){try{
 const id=(new URL(request.url).searchParams.get('id')||'').trim();
 if(!id||id.length>200)return Response.json({error:'Event not found.'},{status:404});
 const event=(await readCalendar()).events.find(e=>e.id===id);
 if(!event)return Response.json({error:'Event not found.'},{status:404});
 const filename='byu-event-'+(eventSlug(event.title)||'event')+'.ics';
 return new Response(exportICS([event]),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="'+filename+'"','Cache-Control':'no-store'}});
}catch(error){console.error(error);return Response.json({error:'The calendar could not be loaded. Please try again.'},{status:503});}}

import {readCalendar} from '../../../../lib/calendar-server';
import {eventSlug,exportICS} from '../../../../lib/search.mjs';
export const dynamic='force-dynamic';
// Serves one event as a text/calendar download. It is an attachment rather
// than an inline document so iPhone Safari saves the file instead of opening a
// blank page; the app's calendar picker downloads the same blob client-side.
export async function GET(request:Request){try{
 const id=(new URL(request.url).searchParams.get('id')||'').trim();
 if(!id||id.length>250)return Response.json({error:'Event not found.'},{status:404});
 const event=(await readCalendar()).events.find(e=>e.id===id);
 if(!event)return Response.json({error:'Event not found.'},{status:404});
 const filename='byu-event-'+(eventSlug(event.title)||'event')+'.ics';
 return new Response(exportICS([event]),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="'+filename+'"','Cache-Control':'no-store'}});
}catch(error){console.error(error);return Response.json({error:'The calendar could not be loaded. Please try again.'},{status:503});}}

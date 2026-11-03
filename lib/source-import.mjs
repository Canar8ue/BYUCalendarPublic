import {load} from 'cheerio/slim';
import {parseICS,clean,classify,enrichBYU} from './catalog.mjs';

// Website adapters stay server-side. Follow only event links on the configured site.
export function sameSite(value,base){
  try{const u=new URL(value,base);return u.protocol==='https:'&&u.origin===new URL(base).origin&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function listingLinks(html,source){
  const $=load(html),links=new Set();
  const modules=$('.ListUpcomingEvents, .ListAthleticEvent, .SearchResultsModule, .SearchResults, .SearchSnippet, .ListCalendar, .ListEvent');
  $('table.ListUpcomingEvents-table a[href], [class*="Promo"][class*="Event-title"] a[href], .SearchSnippet [class*="-title"] a[href]').each((_,el)=>{
    const href=sameSite($(el).attr('href'),source.url);if(href)links.add(href);
  });
  // ACME also places upcoming events in dated links on its home page.
  if(source.id==='acme')$('main a[href]').each((_,el)=>{const href=sameSite($(el).attr('href'),source.url);if(href&&new URL(href).pathname.startsWith('/event/'))links.add(href);});
  if(!modules.length&&!links.size)throw new Error('The event listing format changed.');
  const next=$('a[rel="next"], .Pagination-next a, a.Pagination-next, .SearchResultsModule-nextPage a, a.SearchResultsModule-nextPage').first().attr('href');
  return {links:[...links],next:next?sameSite(next,source.url):null};
}
export function eventPage(html,url){
  const $=load(html);
  const feed=$('a[href]').toArray().map(el=>sameSite($(el).attr('href'),url)).find(href=>href&&new URL(href).pathname==='/_event.ics');
  if(!feed)throw new Error('Event has no calendar download.');
  const body=$('.EventPage-eventBody, .EventPage-articleBody').first();
  body.find('script,style').remove();
  return {feed,description:clean(body.html()||'')};
}
export async function remoteText(url,signal){
  const initial=new URL(url);
  if(initial.protocol!=='https:'||initial.username||initial.password)throw new Error('Unsupported source URL.');
  const timeout=AbortSignal.timeout(18000);
  const requestSignal=signal?AbortSignal.any([signal,timeout]):timeout;
  let current=initial.href;
  for(let redirects=0;redirects<=5;redirects++){
    // fetch's automatic redirects bypass the event-link origin checks. Validate
    // every hop before making any connection to the redirect destination.
    const response=await fetch(current,{redirect:'manual',headers:{Accept:'text/calendar, application/json;q=0.9, text/html;q=0.8'},signal:requestSignal});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      await response.body?.cancel();
      const next=location?sameSite(location,current):null;
      if(!next||redirects===5)throw new Error('Source redirect is outside its origin or exceeds the redirect limit.');
      current=next;continue;
    }
    if(!response.ok){await response.body?.cancel();throw new Error(`Source returned HTTP ${response.status}`);}
    if(Number(response.headers.get('content-length'))>8_000_000){await response.body?.cancel();throw new Error('Source is too large.');}
    const reader=response.body?.getReader();if(!reader)throw new Error('Source returned no content.');
    const decoder=new TextDecoder();let bytes=0,value='';
    try{
      while(true){const {done,value:chunk}=await reader.read();if(done)break;bytes+=chunk.length;if(bytes>8_000_000){await reader.cancel();throw new Error('Source is too large.');}value+=decoder.decode(chunk,{stream:true});}
      return value+decoder.decode();
    }finally{reader.releaseLock();}
  }
  throw new Error('Source exceeded the redirect limit.');
}
async function metadata(source,read,now){
  const base=source.metadata||(source.id==='byu'?'https://calendar.byu.edu/api/Events.json':null);if(!base)return [];
  const min=new Date(now);min.setDate(min.getDate()-45);const max=new Date(now);max.setFullYear(max.getFullYear()+1);const details=[];
  for(let page=0;page<8;page++){
    const url=new URL(base);url.search=new URLSearchParams({categories:'all','event[min][date]':min.toISOString().slice(0,10),'event[max][date]':max.toISOString().slice(0,10),limit:'500',offset:String(page*500)}).toString();
    const data=JSON.parse(await read(url.href));if(!Array.isArray(data))throw new Error('Unexpected event metadata.');
    details.push(...data);if(data.length<500)return details;
  }
  throw new Error('Metadata exceeded the page limit.');
}
function validateDurations(events){
  return events.map(e=>!e.allDay&&e.end&&Date.parse(e.end)-Date.parse(e.start)>31*86400000?{...e,end:null,description:e.description+'\n\nThe source lists an unusually long duration. End time needs confirmation; check the original event.'}:e);
}
// BYU Athletics publishes its all-sports schedule through a JSON endpoint the
// website itself calls. Titles follow the same "<sport> vs. <opponent>" shape
// as BYU's own calendar so overlapping home games merge instead of repeating.
function instant(value){
  const time=Date.parse(value||'');
  return Number.isFinite(time)?new Date(time).toISOString():null;
}
function sportsRecord(row,source){
  const sport=clean(row?.schedule?.sport?.name||row?.schedule?.name||'');
  const start=instant(row?.datetime);
  if(!sport||!start)return null;
  const ranked=clean(row.opponent_name||'').replace(/^(?:No\.?\s*\d+)\s*/i,'');
  const fallback=clean(row.opponent?.name||'');
  const opponent=/^(?:tba|tbd)$/i.test(ranked)&&fallback?fallback:ranked;
  if(!opponent)return null;
  const away=row.neutral_event_preposition==='at'||row.venue_type==='away';
  const location=[clean(row.location),clean(row.venue)].filter(Boolean).join(' / ');
  let end=instant(row.datetime_end);
  if(end&&end<=start)end=null;
  const notes=[];
  if(row.is_exhibition)notes.push('Exhibition contest.');
  if(row.is_conference)notes.push('Conference contest.');
  if(row.tournament_id)notes.push('Tournament play.');
  if(row.tba==='time_tba'&&!row.is_all_day)notes.push('Start time was listed as TBA; confirm it before traveling.');
  else if(row.tba==='date_tba')notes.push('The source lists this date as TBA; confirm it before traveling.');
  // The venue name stays in the location field only; repeating it here would let a
  // venue like "… Golf Club" trip the Clubs interest tag in classify().
  const record=classify({id:`${source.id}-${row.id}`,title:`${sport} ${away?'at':'vs.'} ${opponent}`,description:notes.join(' '),start,end,allDay:!!row.is_all_day,location,url:source.url,sourceId:source.id,sourceName:source.name,category:source.category,cancelled:false,sourceUpdated:null,timeTba:row.tba==='time_tba'&&!row.is_all_day});
  if(!record.allDay)return record;
  // The API stores all-day ranges as calendar dates with an inclusive end, while
  // the calendar stores all-day values as date-only strings with an exclusive end
  // (.ics and Google export reject timestamps for all-day events).
  const startDay=start.slice(0,10);
  const endDay=end?new Date(Date.parse(end.slice(0,10)+'T00:00:00Z')+86400000).toISOString().slice(0,10):null;
  return {...record,start:startDay,end:endDay};
}
export function sportsSchedule(payload,source){
  const rows=payload?.data;
  if(!Array.isArray(rows))throw new Error('Unexpected schedule data.');
  const records=rows.map(row=>sportsRecord(row,source)).filter(Boolean);
  if(rows.length&&!records.length)throw new Error('The schedule format changed.');
  return records;
}
async function importSportsSchedule(source,read){
  const events=[];
  for(let page=1;page<=8;page++){
    const url=new URL(source.feed);
    url.search=new URLSearchParams({'filter[hide_from_all_sports_schedule]':'false','filter[upcoming]':'true',sort:'datetime',include:'schedule.sport,opponent',per_page:'300',page:String(page)}).toString();
    const payload=JSON.parse(await read(url.href));
    events.push(...sportsSchedule(payload,source));
    if(page>=(Number(payload?.meta?.last_page)||1))return events;
  }
  throw new Error('Schedule exceeded the page limit.');
}
export async function importSource(source,{now=new Date(),previous=[],read}={}){
  const deadline=AbortSignal.timeout(90000);read||=(url=>remoteText(url,deadline));
  if(source.kind==='sports-schedule')return {events:validateDurations(await importSportsSchedule(source,read)),warning:null};
  if(source.kind!=='brightspot-pages'){
    let events=parseICS(await read(source.feed),source,now),warning=null;
    if(source.ownHost)events=events.filter(e=>new URL(e.url).origin===new URL(source.url).origin);
    if(source.metadata||source.id==='byu'){
      try{events=enrichBYU(events,await metadata(source,read,now));}
      catch{warning='Calendar updated; detailed descriptions could not be refreshed.';const old=new Map(previous.map(e=>[e.id,e]));events=events.map(e=>{const prior=old.get(e.id);return prior&&prior.sourceUpdated===e.sourceUpdated?classify({...e,description:prior.description,location:prior.location}):e;});}
    }
    return {events:validateDurations(events),warning};
  }
  const links=new Set(),pages=new Set();let next=source.url;
  while(next){
    if(pages.has(next)||pages.size>=8)throw new Error('Event pagination could not be completed.');pages.add(next);
    const listing=listingLinks(await read(next),source);listing.links.forEach(link=>links.add(link));next=listing.next;
    if(links.size>120)throw new Error('Event listing exceeded the import limit.');
  }
  const queue=[...links],events=[],failed=[];
  // A few concurrent detail downloads keep page sources responsive without flooding a site.
  await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
    while(queue.length){const url=queue.shift();try{
      const detail=eventPage(await read(url),url);
      const records=parseICS(await read(detail.feed),source,now);
      events.push(...records.map(e=>classify({...e,url,description:detail.description||e.description})));
    }catch{failed.push(url);}}
  }));
  if(failed.length===links.size&&links.size)throw new Error('Event details could not be imported.');
  // An isolated failed page must not erase its previous verified events.
  events.push(...previous.filter(e=>failed.includes(e.url)));
  return {events:validateDurations([...new Map(events.map(e=>[e.id,e])).values()]),warning:failed.length?`${failed.length} event pages could not refresh. Previous details are retained.`:null};
}

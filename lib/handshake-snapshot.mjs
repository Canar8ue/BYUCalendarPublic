import {classify,clean} from './catalog.mjs';

// Require an explicit offset; never reinterpret an exported instant as local time.
function timestamp(value){
  if(typeof value!=='string')return null;
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if(!match)return null;
  const [,year,month,day,hour,minute,second,offset]=match;
  const days=new Date(Date.UTC(+year,+month,0)).getUTCDate();
  if(+year<2000||+month<1||+month>12||+day<1||+day>days||+hour>23||+minute>59||+second>59)return null;
  if(offset!=='Z'&&(+offset.slice(1,3)>23||+offset.slice(4)>59))return null;
  const time=Date.parse(value);
  return Number.isFinite(time)?new Date(time).toISOString():null;
}

function text(value){return typeof value==='string'&&!/^(?:n\/?a|null|undefined)$/i.test(value.trim())?clean(value):'';}

function locationFor(row){
  const room=text(row.roomAndBuilding),summary=text(row.locationSummary);
  const candidate=room||summary;
  // The export uses this combined placeholder for unknown venues, not confirmed online events.
  if(/^(?:virtual|online)\s*[/|]\s*(?:tbd|tba|to be determined)$/i.test(candidate))return {location:'',note:`Location in export: ${candidate}. Attendance format is unconfirmed.`};
  // Avoid repeating the city when the summary repeats a more specific venue.
  const parts=candidate.split(/\s+\|\s+/).filter(Boolean);
  return {location:parts.filter((part,i)=>!parts.some((other,j)=>j!==i&&other.length>part.length&&other.includes(part))).join(' | '),note:''};
}

export function parseHandshakeSnapshot(rows,{importedAt=new Date().toISOString()}={}){
  const imported=timestamp(importedAt);
  if(!imported)throw new Error('Handshake import timestamp must include a valid date and timezone offset.');
  if(!Array.isArray(rows)||!rows.length)throw new Error('Handshake export must be a non-empty array of event listings.');
  const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',year:'numeric',month:'long',day:'numeric'}).format(new Date(imported));
  const events=new Map();
  for(const [index,row] of rows.entries()){
    const fail=message=>{throw new Error(`Handshake row ${index+1}: ${message}`);};
    if(!row||typeof row!=='object'||Array.isArray(row))fail('expected an event object.');
    const id=String(row.id??'');
    if(!/^[1-9]\d{0,19}$/.test(id))fail('a numeric event ID is required.');
    const title=text(row.title),host=text(row.host),start=timestamp(row.startDate);
    if(!title)fail('a title is required.');
    if(!start)fail('startDate must be a valid timestamp with a timezone offset.');
    let url;
    try{url=new URL(row.url);}catch{fail('a Handshake event URL is required.');}
    if(url.origin!=='https://app.joinhandshake.com'||url.username||url.password||url.search||url.hash||url.pathname!==`/stu/events/${id}`)fail('expected a credential-free Handshake event URL matching the event ID.');
    let end=timestamp(row.endDate),endNote='';
    if(!end||end<=start||Date.parse(end)-Date.parse(start)>31*86400000){
      if(text(row.endDate))endNote='The export has an invalid end time; check the original listing for the event duration.';
      end=null;
    }
    const {location,note}=locationFor(row);
    const description=[host?`Hosted by ${host}.`:'',note,endNote,`Imported from a user-provided Handshake export on ${date}. This listing does not refresh automatically. Check the original listing for details, eligibility, and changes; Handshake sign-in may be required.`].filter(Boolean).join('\n\n');
    // Explicitly copy event fields only. Do not pass through account or attendee data.
    const sourceTags=[];
    if(/\b(?:Acc|MAcc)\b/i.test(title))sourceTags.push('Accounting');
    if(/\bFin\b/.test(title))sourceTags.push('Finance');
    if(/\bIS\b/.test(title))sourceTags.push('IS');
    if(/\bCS\b/.test(title))sourceTags.push('Computer Science');
    const event=classify({id:`handshake-${id}`,title,description,start,end,allDay:false,location,url:url.href,sourceId:'handshake',sourceName:'Handshake',organization:host,category:'Career & business',sourceTags,sourceUpdated:null,cancelled:false});
    const previous=events.get(event.id);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(event))fail('conflicting listings use the same event ID.');
    events.set(event.id,event);
  }
  return [...events.values()].sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
}

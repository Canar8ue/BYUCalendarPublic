import {localDate,lastDay,INTEREST_TAGS,safeUrl} from './catalog.mjs';
export function dayKey(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function shift(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function parseSearch(query,now=new Date()){
 let text=query.toLowerCase().trim();const tags=[];const labels=[];if(/\bIS\b/.test(query)){tags.push('IS');labels.push('IS');text=text.replace(/\bis\b/,' ');}let start=null,end=null,after=null;const today=dayKey(now);const weekday=new Date(today+'T12:00:00Z').getUTCDay();
 const dateRules=[[/\bnext week\b/,shift(today,(8-weekday)%7||7),null,'Next week'],[/\bthis week\b/,today,shift(today,(7-weekday)%7),'This week'],[/\bthis weekend\b/,shift(today,weekday===0?0:(6-weekday+7)%7),null,'This weekend'],[/\btomorrow\b/,shift(today,1),shift(today,1),'Tomorrow'],[/\btoday\b/,today,today,'Today'],[/\bthis month\b/,today,new Date(Date.UTC(now.getFullYear(),now.getMonth()+1,0)).toISOString().slice(0,10),'This month']];
 for(const [pattern,s,e,label] of dateRules){if(pattern.test(text)){start=s;end=e||shift(s,label==='Next week'?6:1);labels.push(label);text=text.replace(pattern,' ');break;}}
 const match=text.match(/\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);if(match){let hour=+match[1];if(match[3]==='pm'&&hour<12)hour+=12;else if(match[3]==='am'&&hour===12)hour=0;else if(!match[3]&&hour<8)hour+=12;after=hour*60+(+(match[2]||0));labels.push('After '+(hour%12||12)+':'+(match[2]||'00')+' '+(hour>=12?'PM':'AM'));text=text.replace(match[0],' ');}
 // "Shows" and its synonyms describe a kind of listing rather than a word that
 // appears in event text, so they become the Performances tag and are stripped;
 // a specific art form ("ballet") also keeps matching the event text itself.
 const genericShow=/\b(?:shows|performances?|showcases?)\b/g;
 const artsWord=/\b(?:ballet|ballroom|concerts?|recitals?|dancers?|dancing|dance|theat(?:re|er)|musicals?|operas?|choirs?|orchestras?|opera|improv|comedy|spectacular)\b/;
 if(genericShow.test(text)||artsWord.test(text)){tags.push('Performances');labels.push('Performances');text=text.replace(genericShow,' ');}
 const rules=[[/\bfree food\b/,'Food provided'],[/\b(?:food|pizza|lunch|dinner)\b/,'Food provided'],[/\b(?:snacks|cookies|refreshments)\b/,'Snacks'],[/\b(?:drinks|soda|beverages)\b/,'Drinks'],[/\b(?:free|no cost)\b/,'Free admission'],[/\bimportant\b/,'Important'],[/\b(?:in person|in-person|on campus)\b/,'In person'],[/\b(?:online|virtual|digital|remote)\b/,'Online'],[/\b(?:open invite|open to everyone)\b/,'Open invite'],[/\b(?:information systems)\b/,'IS'],[/\bais\b/,'AIS'],[/\bclubs?\b/,'Clubs'],[/\bnetworking\b/,'Networking'],[/\bworkshops?\b/,'Workshops'],[/\b(?:recruiting|career fair)\b/,'Recruiting'],[/\b(?:entrepreneurship|startups?)\b/,'Entrepreneurship']];
 for(const [pattern,tag] of rules)if(pattern.test(text)){tags.push(tag);labels.push(tag);text=text.replace(pattern,' ');}
 for(const tag of INTEREST_TAGS.filter(t=>!['IS','AIS','Clubs','Networking','Workshops','Recruiting','Entrepreneurship'].includes(t))){const pattern=new RegExp('\\b'+tag.toLowerCase()+'\\b');if(pattern.test(text)){tags.push(tag);labels.push(tag);text=text.replace(pattern,' ');}}
 const words=text.replace(/\b(?:what|is|happening|show|me|find|events?|with|that|have|has|are|the|and|for|at|to|a|an|please|i|want|need|looking|like|feel|into|see|some|any|something|anything|go|going|attend|there|would|could|idea|maybe|around|good|best)\b/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean);return {tags:[...new Set(tags)],labels:[...new Set(labels)],start,end,after,words};
}
const interestSet=new Set(INTEREST_TAGS);
function hasInterestTag(eventTags,tag){
 if(tag==='IS'||tag==='AIS'||tag==='IS / AIS')return eventTags.includes('IS')||eventTags.includes('AIS');
 return eventTags.includes(tag);
}
export function matchesEvent(event,query,categories=[],tags=[],now=new Date()){
 const intent=typeof query==='string'?parseSearch(query,now):query;
 if(categories.length&&!categories.includes(event.category))return false;
 const interestTags=tags.filter(t=>interestSet.has(t)||t==='IS / AIS');
 const detailTags=tags.filter(t=>!interestSet.has(t)&&t!=='IS / AIS');
 if(interestTags.length&&!interestTags.some(t=>hasInterestTag(event.tags,t)))return false;
 if(!detailTags.every(t=>event.tags.includes(t)))return false;
 if(!intent.tags.every(t=>hasInterestTag(event.tags,t)))return false;
 const date=localDate(event);if(intent.start&&lastDay(event)<intent.start||intent.end&&date>intent.end)return false;
 if(intent.after!==null){if(event.allDay)return false;const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(event.start)).split(':').map(Number);if(p[0]*60+p[1]<intent.after)return false;}
 const haystack=`${event.title} ${event.description} ${event.location} ${event.category} ${event.sourceName} ${event.tags.join(' ')}`.toLowerCase();return intent.words.every(word=>haystack.includes(word));
}
// One-line description of a saved filter set, for the Saved menu and the save
// dialogs. The bar renders a lone AIS tag as "IS / AIS" too, so a set stored
// with only AIS reads the same way; a stored pair collapses to the single label.
export function savedViewSummary(query,categories=[],tags=[]){
 const interest=tags.filter((t,i)=>t==='AIS'?(!tags.includes('IS')&&tags.indexOf(t)===i):tags.indexOf(t)===i).map(t=>t==='IS'||t==='AIS'?'IS / AIS':t);
 return [query,...categories,...interest].filter(Boolean).join(' · ')||'All events';
}
// iCalendar TEXT escaping, date compaction, and 73-byte line folding are shared
// by the one-shot export and the live subscription feed so the two can never
// disagree about how a value is written.
export function icsEscape(value){
 return String(value||'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/,/g,'\\,').replace(/;/g,'\\;');
}
export function icsCompactDate(value,allDay=false){
 // Date and URI fields are not iCalendar TEXT: reject line breaks instead of
 // applying text escaping, even if a future importer supplies unsafe data.
 if(typeof value!=='string'||!(allDay?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/).test(value))throw new Error('Invalid calendar export date.');
 return value.replace(/[-:]/g,'').replace(/\.\d{3}/,'');
}
export function foldICalLines(lines){
 return lines.map(line=>{const chunks=[];let current='',length=0;for(const char of line){const bytes=new TextEncoder().encode(char).length;if(length+bytes>73){chunks.push(current);current=' ';length=1;}current+=char;length+=bytes;}chunks.push(current);return chunks.join('\r\n');}).join('\r\n')+'\r\n';
}
export function exportICS(events){
 const escape=icsEscape,compact=icsCompactDate;
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//BYU Calendar//Campus Events//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:BYU Calendar'];
 for(const e of events){
  const url=safeUrl(e.url);
  lines.push('BEGIN:VEVENT','UID:'+escape(e.id)+'@byu-calendar','DTSTAMP:'+compact(new Date().toISOString()),(e.allDay?'DTSTART;VALUE=DATE:':'DTSTART:')+compact(e.start,e.allDay));
  if(e.end)lines.push((e.allDay?'DTEND;VALUE=DATE:':'DTEND:')+compact(e.end,e.allDay));
  lines.push('SUMMARY:'+escape(e.title),'DESCRIPTION:'+escape((e.description||'')+(url?'\n\nSource: '+url:'')),'LOCATION:'+escape(e.location),...(url?['URL:'+url]:[]),...(e.cancelled?['STATUS:CANCELLED']:[]),'END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return foldICalLines(lines);
}

// Shared filename stem for single-event calendar files, on the web and in the
// served .ics route.
export function eventSlug(title){
 return String(title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);
}
// Google's template link is the only dependable "add to my calendar" handoff
// on Android, where Chrome files an .ics away as a download instead of
// offering it to the calendar app. Times arrive as UTC ISO strings (all-day
// ends exclusive), which is exactly what the dates parameter expects.
export function googleCalendarUrl(event){
 const stamp=(value,allDay)=>{
  const shape=allDay?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  if(typeof value!=='string'||!shape.test(value))return null;
  return value.replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 };
 const start=stamp(event.start,event.allDay);
 if(!start)return null;
 const end=event.end?stamp(event.end,event.allDay):null;
 const details=[(event.description||'').length>600?(event.description||'').slice(0,600).trimEnd()+'…':(event.description||''),safeUrl(event.url)?'Source: '+event.url:'','From BYU Calendar: https://byucalendar.com/events/'+encodeURIComponent(event.id)].filter(Boolean).join('\n\n');
 const params=new URLSearchParams();
 params.set('action','TEMPLATE');
 params.set('text',event.title||'BYU event');
 params.set('dates',end?start+'/'+end:(event.allDay?start+'/'+start:start));
 if(event.location)params.set('location',event.location);
 if(details)params.set('details',details);
 return 'https://calendar.google.com/calendar/render?'+params.toString();
}
// Platform-aware personal-calendar handoff: Android opens Google Calendar,
// iPhone/iPad opens a served .ics URL that Safari turns into its native
// add-to-calendar sheet (iPadOS reports a Macintosh user agent), and desktop
// keeps the plain .ics file download.
export function personalCalendarKind(userAgent,maxTouchPoints){
 const ua=String(userAgent||'');
 if(/Android/.test(ua))return 'google';
 if(/iPhone|iPad|iPod/.test(ua))return 'apple';
 if(/Macintosh/.test(ua)&&(maxTouchPoints||0)>1)return 'apple';
 return 'download';
}

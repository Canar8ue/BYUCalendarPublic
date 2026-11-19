import {localDate,lastDay,INTEREST_TAGS,safeUrl,displayCategory,displayTag} from './catalog.mjs';
export function dayKey(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function shift(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
// Queries joined by "and", "or", "&", or "+" ("finance and info sessions") ask
// for the results of several searches at once — not the narrow reading where
// one event must contain every word. Such a query is split on its separators
// and each part is parsed like a standalone search; matchesEvent unions the
// parts. Splitting preserves case because IS detection reads the original
// casing, and parts that carry no signal (filler like "something") are dropped
// so they cannot turn the union into everything.
const SEPARATOR=/\b(?:and|or)\b|\s+[+&]\s+/i;
const MAX_SEARCH_PARTS=5;
function parseSearchOne(query,now){
 let text=query.toLowerCase().trim();const tags=[];const labels=[];if(/\bIS\b/.test(query)&&(/[a-z]/.test(query)||query.trim().split(/\s+/).length<=2)){tags.push('IS');labels.push('IS');text=text.replace(/\bis\b/,' ');}let start=null,end=null,after=null;const today=dayKey(now);const weekday=new Date(today+'T12:00:00Z').getUTCDay();
 const [year,month]=today.split('-').map(Number);
 const dateRules=[[/\bnext week\b/,shift(today,(8-weekday)%7||7),null,'Next week'],[/\bthis week\b/,today,shift(today,(7-weekday)%7),'This week'],[/\bthis weekend\b/,shift(today,weekday===0?0:(6-weekday+7)%7),null,'This weekend'],[/\btomorrow\b/,shift(today,1),shift(today,1),'Tomorrow'],[/\btoday\b/,today,today,'Today'],[/\bthis month\b/,today,new Date(Date.UTC(year,month,0)).toISOString().slice(0,10),'This month']];
 for(const [pattern,s,e,label] of dateRules){if(pattern.test(text)){start=s;end=e||shift(s,label==='Next week'?6:1);labels.push(label);text=text.replace(pattern,' ');break;}}
 // On Sunday, "this weekend" ends today rather than including Monday.
 if(labels.includes('This weekend')&&weekday===0)end=start;
 const match=text.match(/\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);if(match){let hour=+match[1];const minute=+(match[2]||0);if(minute<60&&((match[3]&&hour>=1&&hour<=12)||(!match[3]&&hour>=0&&hour<=23))){if(match[3]==='pm'&&hour<12)hour+=12;else if(match[3]==='am'&&hour===12)hour=0;else if(!match[3]&&hour>=1&&hour<8)hour+=12;after=hour*60+minute;labels.push('After '+(hour%12||12)+':'+String(minute).padStart(2,'0')+' '+(hour>=12?'PM':'AM'));text=text.replace(match[0],' ');}}
 // "Shows" and its synonyms describe a kind of listing rather than a word that
 // appears in event text, so they become the Performances tag and are stripped;
 // a specific art form ("ballet") also keeps matching the event text itself.
 const genericShow=/\b(?:shows|performances?|showcases?)\b/g;
 const artsWord=/\b(?:ballet|ballroom|concerts?|recitals?|dancers?|dancing|dance|theat(?:re|er)|musicals?|operas?|choirs?|orchestras?|opera|improv|comedy|spectacular)\b/;
 if(genericShow.test(text)||artsWord.test(text)){tags.push('Performances');labels.push('Performances');text=text.replace(genericShow,' ');}
 const rules=[[/\bfree food\b/,'Food provided'],[/\b(?:free\s+)?(?:food|pizza|lunch|dinner)\b/,'Food provided'],[/\b(?:free\s+)?(?:snacks|cookies|refreshments)\b/,'Snacks'],[/\b(?:free\s+)?(?:drinks|soda|beverages)\b/,'Drinks'],[/\b(?:free|no cost)\b/,'Free admission'],[/\bimportant\b/,'Important'],[/\b(?:in person|in-person|on campus)\b/,'In person'],[/\b(?:online|virtual|digital|remote)\b/,'Online'],[/\b(?:open invite|open to everyone)\b/,'Open invite'],[/\b(?:information systems)\b/,'IS'],[/\bais\b/,'AIS'],[/\bclubs?\b/,'Clubs'],[/\bnetworking\b/,'Networking'],[/\bworkshops?\b/,'Workshops'],[/\b(?:recruiting|career fair)\b/,'Recruiting'],[/\b(?:entrepreneurship|startups?)\b/,'Entrepreneurship']];
 for(const [pattern,tag] of rules)if(pattern.test(text)){tags.push(tag);labels.push(tag);text=text.replace(pattern,' ');}
 for(const tag of INTEREST_TAGS.filter(t=>!['IS','AIS','Clubs','Networking','Workshops','Recruiting','Entrepreneurship'].includes(t))){const pattern=new RegExp('\\b'+tag.toLowerCase()+'\\b');if(pattern.test(text)){tags.push(tag);labels.push(tag);text=text.replace(pattern,' ');}}
 const cleaned=text.replace(/\b(?:i['\u2019](?:m|ll|d|ve)|(?:you|we|they)['\u2019](?:re|ll|d|ve)|(?:he|she|it|that|what|who|where|when|why|how|there|here)['\u2019]s|let['\u2019]s)\b/g,' ').replace(/\b(?:what|is|happening|show|me|find|events?|with|that|have|has|are|the|and|or|for|at|to|a|an|please|i|want|need|looking|like|feel|into|see|some|any|something|anything|go|going|attend|there|would|could|idea|maybe|around|good|best)\b/g,' ');
 const words=cleaned.replace(/['\u2019]/g,'').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean);return {tags:[...new Set(tags)],labels:[...new Set(labels)],start,end,after,words};
}
function carriesSignal(intent){return intent.tags.length>0||intent.words.length>0||intent.start!==null||intent.end!==null||intent.after!==null;}
export function parseSearch(query,now=new Date()){
 const parts=query.split(SEPARATOR).map(part=>part.trim()).filter(Boolean);
 if(parts.length>1&&parts.length<=MAX_SEARCH_PARTS){
  const intents=parts.map(part=>parseSearchOne(part,now)).filter(carriesSignal);
  if(intents.length>1){
   // The split query's own fields stay usable for surfaces that read one
   // intent (map-day jump, SHOWING chips), so the parent mirrors its parts:
   // dates from the first part that has them, labels merged from all.
   const first=intents[0];
   return {tags:first.tags,labels:[...new Set(intents.flatMap(intent=>intent.labels))],start:intents.find(intent=>intent.start!==null)?.start??null,end:intents.find(intent=>intent.end!==null)?.end??null,after:intents.find(intent=>intent.after!==null)?.after??null,words:first.words,any:intents};
  }
  if(intents.length===1)return intents[0];
 }
 return parseSearchOne(query,now);
}
const interestSet=new Set(INTEREST_TAGS);
function hasInterestTag(eventTags,tag){
 if(tag==='IS'||tag==='AIS'||tag==='IS / AIS')return eventTags.includes('IS')||eventTags.includes('AIS');
 return eventTags.includes(tag);
}
// Search words tolerate the way people actually type: apostrophes come and go
// ("womens tennis" must find "Women's Tennis", in either apostrophe spelling),
// and small typos still hit. Query words and haystack tokens both drop
// apostrophes, then a word matches a token by substring (the established
// recall, so "info" still finds "information") or within a length-scaled edit
// distance — none under four characters, one from four, two from eight — so
// short words cannot fuzz onto everything while "tenis"/"wommen" still land.
function tokenHaystack(event){
 const tags=Array.isArray(event?.tags)?event.tags.join(' '):'';
 return [event?.title,event?.description,event?.location,event?.category,event?.sourceName,tags].filter(Boolean).join(' ').toLowerCase().replace(/['\u2019]/g,'').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
function typoTolerance(word){return word.length>=8?2:word.length>=4?1:0;}
function editDistance(a,b){
 const m=a.length,n=b.length;if(!m||!n)return m||n;
 let prev=Array.from({length:n+1},(_,i)=>i);
 for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}
 return prev[n];
}
function singleWordInTokens(word,tokens){
 const tolerance=typoTolerance(word);
 for(const token of tokens){
  if(token.includes(word))return true;
  if(tolerance&&Math.abs(token.length-word.length)<=tolerance&&editDistance(word,token)<=tolerance)return true;
 }
 return false;
}
function wordInTokens(word,tokens){
 const parts=word.toLowerCase().replace(/['\u2019]/g,'').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
 return parts.length>0&&parts.every(part=>singleWordInTokens(part,tokens));
}
export function matchesEvent(event,query,categories=[],tags=[],now=new Date()){
 const parsed=typeof query==='string'?parseSearch(query,now):query;
 if(categories.length&&!categories.includes(event.category))return false;
 const interestTags=tags.filter(t=>interestSet.has(t)||t==='IS / AIS');
 const detailTags=tags.filter(t=>!interestSet.has(t)&&t!=='IS / AIS');
 if(interestTags.length&&!interestTags.some(t=>hasInterestTag(event.tags,t)))return false;
 if(!detailTags.every(t=>event.tags.includes(t)))return false;
 // A joined query unions its parts: an event satisfying any one part's full
 // reading is a result for the whole query. Tokens are shared across parts.
 let tokens=null;const haystackTokens=()=>tokens||(tokens=tokenHaystack(event));
 return parsed.any?parsed.any.some(intent=>intentMatches(event,intent,haystackTokens)):intentMatches(event,parsed,haystackTokens);
}
function intentMatches(event,intent,haystackTokens){
 if(!intent.tags.every(t=>hasInterestTag(event.tags,t)))return false;
 const date=localDate(event);if(intent.start&&lastDay(event)<intent.start||intent.end&&date>intent.end)return false;
 if(intent.after!==null){if(event.allDay||event.timeTba)return false;const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(event.start)).split(':').map(Number);if(p[0]*60+p[1]<intent.after)return false;}
 const tokens=haystackTokens();return intent.words.every(word=>wordInTokens(word,tokens));
}
// One-line description of a saved filter set, for the Saved menu and the save
// dialogs. The bar renders a lone AIS tag as "IS / AIS" too, so a set stored
// with only AIS reads the same way; a stored pair collapses to the single label.
export function savedViewSummary(query,categories=[],tags=[]){
 const interest=tags.filter((t,i)=>t==='AIS'?(!tags.includes('IS')&&tags.indexOf(t)===i):tags.indexOf(t)===i).map(t=>t==='IS'||t==='AIS'?'IS / AIS':displayTag(t));
 return [query,...categories.map(displayCategory),...interest].filter(Boolean).join(' · ')||'All Events';
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
// Outlook on the web uses its own "compose" deeplink. BYU accounts are school
// accounts in Microsoft 365, so outlook.office.com is the host that resolves
// for the calendar's audience; the same template fills title, dates, place,
// and description for personal Outlook accounts after sign-in.
export function outlookCalendarUrl(event){
 const stamp=(value,allDay)=>{
  const shape=allDay?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  if(typeof value!=='string'||!shape.test(value))return null;
  return allDay?value:value.replace(/\.\d{3}/,'');
 };
 const start=stamp(event.start,event.allDay);
 if(!start)return null;
 const end=event.end?stamp(event.end,event.allDay):null;
 const body=[(event.description||'').length>600?(event.description||'').slice(0,600).trimEnd()+'…':(event.description||''),safeUrl(event.url)?'Source: '+event.url:'','From BYU Calendar: https://byucalendar.com/events/'+encodeURIComponent(event.id)].filter(Boolean).join('\n\n');
 const params=new URLSearchParams();
 params.set('path','/calendar/action/compose');
 params.set('rru','addevent');
 params.set('subject',event.title||'BYU event');
 params.set('startdt',start);
 if(end)params.set('enddt',end);
 if(event.allDay)params.set('allday','true');
 if(event.location)params.set('location',event.location);
 if(body)params.set('body',body);
 return 'https://outlook.office.com/calendar/0/deeplink/compose?'+params.toString();
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

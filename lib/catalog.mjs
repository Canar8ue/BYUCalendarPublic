import ICAL from 'ical.js';

export const SOURCES = [
  {id:'byu',name:'BYU Events',url:'https://calendar.byu.edu',feed:'https://calendar.byu.edu/iCal/export/all',category:'Campus life'},
  {id:'byucougars',name:'BYU Athletics',url:'https://byucougars.com/all-sports-schedule',kind:'sports-schedule',feed:'https://byucougars.com/website-api/schedule-events',category:'Sports & recreation',note:'Official BYU Athletics all-sports schedule (every team, home and away). Times listed as TBA are placeholders; confirm kickoff and tip-off times before traveling.'},
  ...[['cet','Entrepreneurship','Career & business'],['mba','MBA','Career & business'],['emba','Executive MBA','Career & business'],['events','Marriott featured','Academic'],['calendar','Marriott School','Career & business'],['esr','Ballard Center','Career & business'],['gmc','Global Business','Career & business'],['bsisys','Information Systems','Career & business'],['mism','MISM','Career & business']].map(([id,name,category])=>({id:'marriott-'+id,name,url:'https://marriott.byu.edu/calendar/',feed:`https://calendar.google.com/calendar/ical/${id}%40marriottschool.net/public/basic.ics`,category})),
  {id:'ais',name:'AIS',url:'https://byu-ais.byu.edu/activities',feed:'https://calendar.google.com/calendar/ical/ais.byu%40gmail.com/public/basic.ics',category:'Career & business',tags:['IS','AIS','Clubs'],note:'Public AIS calendar. Some event details are only announced in Slack.'},
  {id:'accounting-society',name:'Accounting Society',url:'https://accountingsociety.byu.edu/',kind:'brightspot-pages',category:'Career & business',tags:['Accounting','Clubs']},
  {id:'engineering',name:'Engineering',url:'https://engineering.byu.edu/calendar',feed:'https://engineering.byu.edu/iCal/export/all',metadata:'https://engineering.byu.edu/api/Events.json',ownHost:true,category:'Academic',tags:['Engineering']},
  {id:'math',name:'Mathematics',url:'https://math.byu.edu/calendar',feed:'https://math.byu.edu/iCal/export/all',metadata:'https://math.byu.edu/api/Events.json',ownHost:true,category:'Academic',tags:['Math']},
  {id:'cs',name:'Computer Science',url:'https://cs.byu.edu/department/event-calendar',kind:'brightspot-pages',category:'Academic',tags:['Computer Science']},
  {id:'acme',name:'ACME',url:'https://acme.byu.edu/',kind:'brightspot-pages',category:'Academic',tags:['Math','ACME']},
  {id:'life-sciences',name:'Life Sciences',url:'https://lifesciences.byu.edu/month',feed:'https://lifesciences.byu.edu/iCal/export/all',metadata:'https://lifesciences.byu.edu/api/Events.json',ownHost:true,category:'Academic',tags:['Life Sciences']},
  {id:'kennedy',name:'Kennedy Center',url:'https://kennedy.byu.edu/events',kind:'brightspot-pages',category:'Academic',tags:['International']},
  {id:'law',name:'BYU Law',url:'https://law.byu.edu/',feed:'https://25livepub.collegenet.com/calendars/homepagecalendar.ics',category:'Academic',tags:['Law'],note:'Public law school calendar. Check each event for attendance requirements.'},
  {id:'marketing',name:'Marketing Association',url:'https://ma.byu.edu/calendar',feed:'https://calendar.google.com/calendar/ical/9q9n2s6t2s01mvjqc12qeqhil8%40group.calendar.google.com/public/basic.ics',category:'Career & business',tags:['Marketing','Clubs'],note:'Public association calendar; currently no upcoming events published.'},
  {id:'yserve',name:'Y-Serve',url:'https://yserve.byu.edu/events-and-activities',feed:'https://outlook.office365.com/owa/calendar/295d4683499c43f685e5431f94aef90f@byu.edu/0d566f7d2d48408da14f10dd102b40071247470032483096802/calendar.ics',category:'Campus life',note:'Published Y-Serve volunteer calendar. Weekly service programs recur across the year; confirm shift details on the Y-Serve site.'},
  {id:'club-directory',name:'BYU Student Organizations',url:'https://clubs.byu.edu/',kind:'snapshot',category:'Campus life',tags:['Clubs'],note:'Snapshot collected September 14, 2026. Automatic updates need a published feed; confirm changes with the club.'},
  {id:'handshake',name:'Handshake',url:'https://app.joinhandshake.com/stu/events',kind:'snapshot',category:'Career & business',note:'Imported event snapshot; does not refresh automatically. Check Handshake for changes and eligibility; sign-in may be required.'},
];
export const INTEREST_TAGS=['IS','AIS','Accounting','Finance','Marketing','Engineering','Computer Science','Math','ACME','Life Sciences','International','Law','Performances','Clubs','Networking','Workshops','Recruiting','Entrepreneurship'];
export const CATEGORIES=[{id:'Campus life',color:'blue'},{id:'Career & business',color:'green'},{id:'Arts & culture',color:'purple'},{id:'Sports & recreation',color:'orange'},{id:'Faith & learning',color:'teal'},{id:'Academic',color:'slate'}];
export const UNCONNECTED=[
 {id:'slack',name:'AIS · Slack',url:'https://marriott.byu.edu/infosys/get-involved/student-organizations/ais/',note:'An AIS workspace app or an organizer-provided calendar feed is needed.'},
 {id:'social',name:'Instagram & Facebook',url:'https://www.instagram.com',note:'Club account connections are needed. Social posts are not being imported.'}
 ,{id:'bap',name:'Beta Alpha Psi',url:'https://marriott.byu.edu/clubs/directory/',note:'Listed in the club directory, but the linked club website is unavailable. A current calendar is needed.'}
];
export function clean(value=''){return String(value==null||value==='null'||value==='undefined'?'':value).replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<br\s*\/?>|<\/p>|<\/div>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:39|x27);|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n/g,'\n\n').trim();}
export function safeUrl(value){try{if(typeof value!=='string'||/[\u0000-\u0020\u007f]/.test(value))return '';const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function civilToISO(value,zone='America/Denver'){
  const parts=String(value).match(/\d+/g);if(!parts||parts.length<3)return null;
  const [y,m,d,h=0,min=0,s=0]=parts.map(Number);const target=Date.UTC(y,m-1,d,h,min,s);let instant=target;
  try{for(let i=0;i<3;i++){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(x=>[x.type,x.value]));const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);const delta=target-shown;instant+=delta;if(!delta)break;}}catch{return null;}return new Date(instant).toISOString();
}
// Exchange/Outlook published calendars label TZIDs with Windows zone names, which
// Intl cannot interpret (civilToISO would drop every record). CLDR mappings for the
// zones a BYU feed is likely to use; unknown names keep existing behavior.
const WINDOWS_ZONES={'Mountain Standard Time':'America/Denver','US Mountain Standard Time':'America/Phoenix','Pacific Standard Time':'America/Los_Angeles','Central Standard Time':'America/Chicago','Eastern Standard Time':'America/New_York','Alaskan Standard Time':'America/Anchorage','Hawaiian Standard Time':'Pacific/Honolulu','GMT Standard Time':'Europe/London'};
function timeISO(t,defaultZone='America/Denver'){
  if(!t)return null;if(t.isDate)return t.toString().slice(0,10);
  if(t.zone?.tzid==='UTC')return t.toJSDate().toISOString();
  const tzid=t.zone?.tzid&&t.zone.tzid!=='floating'?WINDOWS_ZONES[t.zone.tzid]||t.zone.tzid:null;
  return civilToISO(t.toString(),tzid||defaultZone);
}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
export function classify(event,meta={}){
  const t=clean(event.title),d=clean(event.description);const text=`${t} ${d}`.toLowerCase();const hints=`${meta.CategoryName||''} ${meta.DeptNames||''} ${meta.TagsNames||''} ${event.url}`.toLowerCase();
  let category=event.category||'Campus life';
  if(/academiccalendar|academic calendar|tuition|withdraw|semester|add.drop|grades due|final exam/.test(hints+' '+t.toLowerCase()))category='Academic';
  else if(/athletics|sport|volleyball|basketball|football|soccer|rugby|cross country|swim|softball|baseball/.test(hints+' '+t.toLowerCase()))category='Sports & recreation';
  else if(/arts.entertainment|onstage|music|theatre|theater|concert|film|dance|museum|exhibition/.test(hints+' '+t.toLowerCase()))category='Arts & culture';
  else if(/devotional|forum|religious|scripture|wheatley/.test(hints+' '+t.toLowerCase()))category='Faith & learning';
  else if(/career|recruit|network|entrepreneur|business|internship|professional|marriott|mba/.test(hints+' '+t.toLowerCase()))category='Career & business';
  if(event.sourceId==='handshake')category='Career & business';
  const tags=new Set(event.sourceTags||SOURCES.find(s=>s.id===event.sourceId)?.tags||[]);
  if(/\baccounting\b|beta alpha psi|\baccountancy\b/.test(text))tags.add('Accounting');
  if(/\bmarketing\b/.test(text))tags.add('Marketing');
  if(/\bfinance\b|investment banking/.test(text))tags.add('Finance');
  if(/\bengineers?(?:ing)?\b/.test(text))tags.add('Engineering');
  if(/computer science|cyber ?(?:security|defense)|\bprogramming\b|\bcoding\b|\bhackathon\b|(?<!dress\s)\bcode\b(?!\s+of\b)/.test(text)||/\bCS\b/.test(t))tags.add('Computer Science');
  // Majors in titles ("Tabling — CS, IS, Engineering, Math") tag from the title
  // alone: long descriptions mention mathematics in biographies and course
  // history far from the event's actual subject.
  if(/\bmath\b|\bmathematics\b/.test(t.toLowerCase()))tags.add('Math');
  if(/\blife sciences\b|\bbiology\b|neurosci|neuroanatomy/.test(text))tags.add('Life Sciences');
  if(/\blaw school\b|\blaw society\b|\blegal\b/.test(text))tags.add('Law');
  if(/\bacme\b|\bsnacme\b/.test(text)){tags.add('ACME');tags.add('Math');}
  if(/\binformation systems\b|\bis department\b|\bis major|\bmism\b/.test(text)||/\bIS\b/.test(t)||/bsisys|mism/.test(event.sourceId))tags.add('IS');
  if(/\bais\b|association for information systems/.test(text))tags.add('AIS');
  // A golf/country/tennis club is a venue, not a student organization.
  if(/(?<!golf\s)(?<!country\s)(?<!tennis\s)(?<!yacht\s)\bclub|student organization/.test(text))tags.add('Clubs');
  // Performing-arts listings (dance showcases, concerts, recitals) rarely carry an
  // interest tag of their own, so the words themselves are the evidence. Bare
  // "show(s)" counts only in titles, where it is a noun, not a description verb.
  if(/\b(?:performances?|recitals?|concerts?|ballet|ballroom|dancers?|dancing|dance|theat(?:re|er)|musicals?|operas?|choirs?|orchestras?|opera|improv|comedy|showcase|spectacular|talent show|variety show|magic show|film screening|movie night)\b/.test(text)||/\bshows?\b(?!\s+(?:how|up|on|off|that|you|us|times?))/.test(t))tags.add('Performances');
  if(/network|meet.*professional/.test(text))tags.add('Networking');
  if(/workshop|hands.on|training/.test(text))tags.add('Workshops');
  if(/career fair|recruit|internship|employer/.test(text))tags.add('Recruiting');
  if(/entrepreneur|startup|start.up|pitch|big idea/.test(text)||event.sourceId==='marriott-cet')tags.add('Entrepreneurship');
  let food=/(?:(?:free|complimentary)\s+(?:pizza|food|lunch|dinner|breakfast|meal|tacos|pancakes)|(?:pizza|food|lunch|dinner|breakfast|meal|tacos)\s+(?:will be\s+)?(?:provided|served)|enjoy.{0,40}(?:food|pizza)|food\s+provided)/i.test(text)?'yes':/\bno food\b/.test(text)?'no':null;
  let snacks=/(?:snacks|cookies|refreshments)\s+(?:will be\s+)?(?:provided|served)|(?:free|complimentary)\s+(?:snacks|cookies|refreshments|treats)/.test(text)?'yes':null;
  let drinks=/(?:drinks|soda|beverages)\s+(?:will be\s+)?(?:provided|served)|(?:free|complimentary)\s+(?:drinks|soda|beverages)|pizza and soda/.test(text)?'yes':null;
  // Treat foods that are unambiguously snack items (candy, cookies, fudge, etc.) as snacks, never full meals; word-boundary "candy" keeps Skullcandy out.
  const treatFoods=/\b(?:cookies?|brownies?|fudge|truffles?|donuts?|doughnuts?|muffins?|candy|candies|chocolates?|hot cocoa|ice cream|sweet rolls?|cinnamon rolls?)\b/;
  const mealFoods=/\b(?:pizza|food|lunch|dinner|breakfast|meal|tacos|pancakes)\b/;
  const plain=text.replace(/[^\p{L}\p{N}\s'-]/gu,' ').replace(/\s+/g,' ');
  if(/(?:pizza|pita pit|chick-fil-a(?: nuggets)?|food|lunch|dinner|breakfast|meal|tacos)\s+(?:(?:will be|is|are)\s+)?(?:provided|served)/.test(plain))food='yes';
  if(/(?:pizza|food|lunch|dinner|meal)\s+and\s+(?:drinks|snacks|refreshments)\s+(?:(?:will be|are)\s+)?(?:provided|served)/.test(plain))food='yes';
  if(/(?:enjoy|eat|grab|pick up).{0,30}\b(?:pie|pizza|lunch|dinner|tacos)\b/.test(plain))food='yes';
  if(/(?:pick up|enjoy|grab|come for).{0,50}\b(?:snacks|refreshments)\b/.test(plain))snacks='yes';
  if(/(?:enjoy|served|provided).{0,40}\bmilk\b|\bmilk\b.{0,25}(?:served|provided)|chocolate milk/.test(plain))drinks='yes';
  // Label-style listings ("Refreshments: Crumbl cookies") and invitation phrasing ("there will be pizza", "with Costco pizza and mint brownies", "enjoy treats").
  if(/\brefreshments?\s*:/.test(text)&&treatFoods.test(plain))snacks='yes';
  if(/\brefreshments?\s*:/.test(text)&&!treatFoods.test(plain)&&!mealFoods.test(plain))snacks=snacks??'yes';
  if(/(?:there (?:will|'ll) be|with|plus|includes?)\s+(?:free\s+)?[^.]{0,30}\bpizza\b/.test(plain))food='yes';
  if(/(?:there (?:will|'ll) be|with|plus|includes?|enjoy|stay for|come for)\s+(?:free\s+)?[^.]{0,30}\btreats\b/.test(plain))snacks='yes';
  if(/(?:with|plus|includes?)\s+(?:free\s+)?[^.]{0,30}(?:cookies?|brownies?|fudge|truffles?|donuts?|doughnuts?|candy|chocolates?|ice cream)/.test(plain))snacks='yes';
  if(/(?:no|without)\s+(?:free\s+)?(?:food|meals?|pizza)|(?:food|meals?)\s+(?:(?:is|will be)\s+)?not\s+(?:provided|served|available)/.test(text))food='no';if(/(?:no|without)\s+(?:free\s+)?(?:snacks|refreshments|candy|treats|sweets)|(?:snacks|refreshments)\s+(?:(?:are|will be)\s+)?not\s+(?:provided|served|available)/.test(text))snacks='no';if(/(?:no|without)\s+(?:free\s+)?(?:drinks|beverages)|(?:drinks|beverages)\s+(?:(?:are|will be)\s+)?not\s+(?:provided|served|available)/.test(text))drinks='no';
  let free=meta.IsFree==='true'?true:meta.IsFree==='false'?false:null;
  // Do not confuse free food with free admission, nor placeholder $0 ticket records with free events.
  if(meta.TicketsExist?.trim()==='Yes'&&!/free\b|no charge|complimentary admission/.test(text))free=null;
  if(/free admission|free event|no charge|admission is free|\nfree(?:\n|\s*\()/.test(text))free=true;
  if(/(?:\$\d+(?:\.\d+)?\s*\)?\s*(?:is\s+)?required|(?:assessment|admission|ticket).{0,25}\$\d+.{0,20}required)/.test(text))free=false;
  const audience=/members.only|members only/.test(text)?'Members only':/all byu students|all students/.test(text)?'BYU students':/open to (?:the public|everyone|all)|everyone (?:is )?welcome|all are welcome/.test(text)?'Open invite':null;
  const location=clean(event.location);const virtual=/zoom|virtual|online|webinar/.test(location.toLowerCase());const physical=!!location&&!virtual&&!/^tbd|tba|to be|various|see /i.test(location);
  const streaming=/broadcast live|livestream|live.stream|streamed|join.{0,20}(?:zoom|online)/.test(text);
  const format=physical?(streaming?'Hybrid':'In person'):virtual?'Online':null;
  // Project direction (2026-09-15): tables at events in the Tanner Building (TNRB) customarily set out free candy/chocolates — snack-only evidence, never "Food provided" without explicit food in the source.
  const tannerCandy=snacks==null&&physical&&/\b(?:tanner|tnrb)\b/.test(location.toLowerCase());
  if(tannerCandy)snacks='yes';
  if(food==='yes'||(snacks==='yes'&&!tannerCandy))tags.add('Food provided');if(snacks==='yes')tags.add('Snacks');if(drinks==='yes')tags.add('Drinks');if(free===true)tags.add('Free admission');if(audience==='Open invite'||audience==='BYU students')tags.add('Open invite');if(format==='In person'||format==='Hybrid')tags.add('In person');if(format==='Online'||format==='Hybrid')tags.add('Online');if(/rsvp|register|registration|tickets required/.test(text)||meta.TicketsExist?.trim()==='Yes')tags.add('RSVP / tickets');
  return {...event,title:t,description:d,location,category,tags:[...tags],food,snacks,drinks,free,audience,format,snacksImplied:tannerCandy||undefined};
}
// Moderator corrections stored in D1 (event_overrides) layer onto the merged
// calendar at read time, so the next source refresh cannot revert them. A
// location change re-derives only the attendance format and its In
// person/Online tags, with the same wording rules as classify; every other
// derived fact keeps the value the merged calendar already carries.
export function applyEventOverrides(events,overrides){
 if(!overrides.length)return events;
 const byId=new Map(overrides.map(o=>[o.id,o]));
 return events.map(event=>{
  const override=byId.get(event.id);
  if(!override)return event;
  const next={...event,...override.patch,overridden:true,moderatedAt:override.at||null};
  if(override.patch.location!==undefined){
   const location=next.location;const text=`${next.title} ${next.description}`.toLowerCase();
   const virtual=/zoom|virtual|online|webinar/.test(location.toLowerCase());
   const physical=!!location&&!virtual&&!/^tbd|tba|to be|various|see /i.test(location);
   const streaming=/broadcast live|livestream|live.stream|streamed|join.{0,20}(?:zoom|online)/.test(text);
   const format=physical?(streaming?'Hybrid':'In person'):virtual?'Online':null;
   if(format!==event.format){
    next.format=format;
    const tags=next.tags.filter(t=>t!=='In person'&&t!=='Online');
    if(format==='In person'||format==='Hybrid')tags.push('In person');
    if(format==='Online'||format==='Hybrid')tags.push('Online');
    next.tags=tags;
   }
  }
  return next;
 });
}
export function parseICS(raw,source,now=new Date()){
  if(!raw.includes('BEGIN:VCALENDAR'))throw new Error('Source did not return a calendar.');
  const root=new ICAL.Component(ICAL.parse(raw));for(const tz of root.getAllSubcomponents('vtimezone')){const id=tz.getFirstPropertyValue('tzid');if(id)ICAL.TimezoneService.register(new ICAL.Timezone({component:tz,tzid:id}));}
  const min=new Date(now);min.setDate(min.getDate()-45);const max=new Date(now);max.setFullYear(max.getFullYear()+1);
  const comps=root.getAllSubcomponents('vevent');const exceptions=new Map();for(const c of comps){if(c.getFirstPropertyValue('recurrence-id')){const uid=c.getFirstPropertyValue('uid');if(!exceptions.has(uid))exceptions.set(uid,[]);exceptions.get(uid).push(c);}}
  const records=[];
  for(const c of comps){if(c.getFirstPropertyValue('recurrence-id'))continue;const e=new ICAL.Event(c,{exceptions:[]});if(!e.startDate)continue;for(const ex of exceptions.get(e.uid)||[])try{e.relateException(new ICAL.Event(ex,{exceptions:[]}));}catch{}
    const add=(item,start,end,occurrence)=>{const begins=timeISO(start,root.getFirstPropertyValue('x-wr-timezone')||'America/Denver');if(!begins||new Date(begins)>max)return;let ends=timeISO(end);if(!ends||ends<=begins)ends=null;if(new Date(ends||begins)<min)return;
      const url=safeUrl(item.component.getFirstPropertyValue('url'))||source.url;
      const title=clean(item.summary||'Untitled event');
      const record=classify({id:`${source.id}-${hash(String(e.uid)+(e.isRecurring()?'|'+occurrence:''))}`,title,description:clean(item.description),start:begins,end:ends,allDay:start.isDate,location:clean(item.location),url,sourceId:source.id,sourceName:source.name,category:source.category,cancelled:String(item.component.getFirstPropertyValue('status')).toUpperCase()==='CANCELLED',sourceUpdated:timeISO(item.component.getFirstPropertyValue('last-modified'))});
      // BYU's own calendar publishes TBA contests at a sentinel 11:19 AM local
      // time; the athletics API says time_tba, but this feed's only evidence is
      // the sentinel itself. A :19 minute makes a real 11:19 listing vanishingly
      // rare, and the TBA label always tells visitors to confirm anyway.
      if(source.id==='byu'&&!record.allDay&&/^11:19/.test(timeFormatter.format(new Date(begins))))record.timeTba=true;
      records.push(record);};
    if(e.isRecurring()){const iter=e.iterator();let n=0,next;while((next=iter.next())&&n++<30000){if(next.toString().slice(0,10)>max.toISOString().slice(0,10))break;if(next.toString().slice(0,10)<min.toISOString().slice(0,10))continue;const detail=e.getOccurrenceDetails(next);add(detail.item,detail.startDate,detail.endDate,next.toString());}if(n>=30000)throw new Error('Recurring source exceeded safe expansion limit.');}
    else add(e,e.startDate,e.endDate,e.startDate.toString());
  }
  return records;
}
export function enrichBYU(events,details){const byUrl=new Map(details.map(d=>[d.FullUrl,d]));return events.map(e=>{const m=byUrl.get(e.url);if(!m)return e;return classify({...e,description:clean(m.Description||m.ShortDescription||e.description),location:clean(m.LocationName||e.location)},m);});}
// Generic titles cannot prove that different organizations share an event.
const GENERIC_TITLE=/^(?:opening|closing)social$|^weeklymeeting$|^clubmeeting$/;
const ABBREVIATIONS={grad:'graduate',info:'information',mtg:'meeting',univ:'university'};
function titleTokens(title=''){
  return title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .map(t=>t.length>3&&t.endsWith('s')?t.slice(0,-1):t)
    .map(t=>ABBREVIATIONS[t]||t);
}
function charDice(a,b){
  if(!a.length||!b.length)return 0;
  const grams=s=>{const out=new Set();for(let i=0;i<s.length-1;i++)out.add(s.slice(i,i+2));return out;};
  const A=grams(a),B=grams(b);let shared=0;for(const g of A)if(B.has(g))shared++;
  return 2*shared/(A.size+B.size);
}
// Same event published with drift, extra title words, or double-posted. Never lets
// a generic title merge two organizations, and audience variants ("Break-out room;
// GSCM" vs "; Marketing") stay separate because their distinguishing tokens differ.
function titlesDuplicate(a,b){
  const ta=titleTokens(a.title),tb=titleTokens(b.title);
  if((GENERIC_TITLE.test(ta.join(''))||GENERIC_TITLE.test(tb.join('')))&&(a.organization||a.sourceId)!==(b.organization||b.sourceId))return false;
  if(ta.join('|')===tb.join('|'))return true;
  const setA=new Set(ta),setB=new Set(tb);
  const [small,big]=setA.size<=setB.size?[setA,setB]:[setB,setA];
  const insideSmall=()=>{let inside=true;for(const t of small)if(!big.has(t)){inside=false;break;}return inside;};
  if(small.size>=2&&small.size/big.size>=0.5&&insideSmall())return true;
  // All-day campus-calendar entries ("Thanksgiving" / "Holiday - Thanksgiving") share a
  // date and a head word; a similarity floor keeps distinct notices like
  // "Registration" vs "Registration Deadline" apart.
  if(a.allDay&&b.allDay&&small.size===1&&big.size<=4&&insideSmall()&&charDice(a.title.toLowerCase().replace(/[^a-z0-9]/g,''),b.title.toLowerCase().replace(/[^a-z0-9]/g,''))>=0.7)return true;
  if(a.start===b.start&&charDice(a.title.toLowerCase().replace(/[^a-z0-9]/g,''),b.title.toLowerCase().replace(/[^a-z0-9]/g,''))>=0.9)return true;
  return false;
}
function timeCompatible(a,b){
  if(a.start===b.start)return true;
  if(a.allDay!==b.allDay||localDate(a)!==localDate(b))return false;
  if(a.allDay)return true;
  return Math.abs(Date.parse(a.start)-Date.parse(b.start))<=30*60000;
}
// The all-sports schedule publishes placeholder times ("TBA") that differ from
// the placeholder BYU's own calendar uses for the same home game, so the
// 30-minute drift rule can leave a contest listed twice. Same sport, opponent,
// and local day is the same contest. Only merges across sources, so a
// same-source doubleheader (two rows, one site) still stays two rows.
const MATCHUP_TITLE=/^(.+?)\s+(?:vs\.?|at)\s+(.+)$/i;
function matchupKey(event){
  if(event.category!=='Sports & recreation')return null;
  const match=String(event.title).match(MATCHUP_TITLE);
  if(!match)return null;
  const sport=match[1].toLowerCase().replace(/[^a-z0-9]/g,''),opponent=match[2].toLowerCase().replace(/[^a-z0-9]/g,'');
  return sport&&opponent?sport+'>'+opponent+'@'+localDate(event):null;
}
function sameMatchup(a,b){
  if((a.organization||a.sourceId)===(b.organization||b.sourceId))return false;
  const key=matchupKey(a);return !!key&&key===matchupKey(b);
}
// Snapshot provenance footers are fixed boilerplate; richness compares only
// source-provided content so a snapshot record cannot outrank an informative one.
const PROVENANCE_TAIL=/(?:\n+Hosted by [^\n.]*\.)?(?:\n+(?:The export has an invalid end time[^]*?|Imported from a user-provided Handshake export[^]*?|Collected from the public BYU Student Organizations calendar[^]*?))$/;
function informativeLength(desc=''){return desc.replace(PROVENANCE_TAIL,'').trim().length;}
// The event dialog shows the same footers separately, at the bottom.
export function splitDescriptionProvenance(desc=''){const tail=desc.match(PROVENANCE_TAIL)?.[0]||'';return {description:tail?desc.slice(0,desc.length-tail.length).trimEnd():desc,provenance:tail.trim()};}
function richer(a,b){return informativeLength(b.description)-informativeLength(a.description)||b.tags.length-a.tags.length||b.title.length-a.title.length||(a.id<b.id?-1:1);}
function absorb(target,extra){
  if(informativeLength(extra.description)>informativeLength(target.description))target.description=extra.description;
  if(extra.url!==target.url&&!target.additionalSources.some(s=>s.url===extra.url))target.additionalSources.push({name:extra.sourceName,url:extra.url});
  target.tags=[...new Set([...target.tags,...extra.tags])];
  for(const field of ['location','end','format','audience','organization'])if(!target[field]&&extra[field])target[field]=extra[field];
 if(extra.timeTba)target.timeTba=true; // TBA evidence from any source survives the merge
  for(const field of ['food','snacks','drinks','free']){if(target[field]==null)target[field]=extra[field];else if(extra[field]!=null&&target[field]!==extra[field])target[field]=null;}
  if(extra.snacks==='yes'&&!extra.snacksImplied)target.snacksImplied=undefined; // explicit snack evidence from any source outranks the Tanner inference
  return target;
}
export function mergeEvents(events){
  const grouped=new Map();
  for(const e of events){
    const title=e.title.toLowerCase().replace(/^byu\s+/,'').replace(/[^a-z0-9]/g,'');
    const generic=/^(?:opening|closing)social$|^weeklymeeting$|^clubmeeting$/.test(title);
    const key=title+'|'+e.start+(generic?'|'+(e.organization||e.sourceId):'');
    const previous=grouped.get(key);
    if(!previous){grouped.set(key,{...e,additionalSources:[]});continue;}
    absorb(previous,{...e,additionalSources:[]});
  }
  // Second pass over same-day pairs: collapse near-identical listings the exact
  // key above cannot catch, keeping the richest record as the survivor.
  const merged=[...grouped.values()];
  const buckets=new Map();
  for(let i=0;i<merged.length;i++){const key=localDate(merged[i]);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);}
  const parent=merged.map((_,i)=>i);
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  // A cross-source matchup merge must stay one-to-one: without this, a doubleheader
  // listed by both sources would chain all four rows into a single event.
  const sources=merged.map(e=>new Set([e.organization||e.sourceId]));
  for(const bucket of buckets.values())for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++){
    const a=bucket[i],b=bucket[j];
    const matchup=sameMatchup(merged[a],merged[b]);
    if(!matchup&&(!timeCompatible(merged[a],merged[b])||!titlesDuplicate(merged[a],merged[b])))continue;
    const ra=find(a),rb=find(b);if(ra===rb)continue;
    if(matchup){let chain=false;for(const source of sources[rb])if(sources[ra].has(source)){chain=true;break;}if(chain)continue;}
    const root=Math.min(ra,rb),child=Math.max(ra,rb);
    parent[child]=root;
    for(const source of sources[child])sources[root].add(source);
  }
  const groups=new Map();
  for(let i=0;i<merged.length;i++){const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(merged[i]);}
  return [...groups.values()].map(group=>{
    const [survivor,...rest]=group.sort(richer);
    for(const extra of rest)absorb(survivor,extra);
    const detailTags={'Food provided':survivor.food==='yes'||(survivor.snacks==='yes'&&!survivor.snacksImplied),Snacks:survivor.snacks==='yes',Drinks:survivor.drinks==='yes','Free admission':survivor.free===true};
    // 'Free food' is retired; free-food phrasing already produces 'Food provided'.
    survivor.tags=survivor.tags.filter(tag=>tag!=='Free food'&&(!(tag in detailTags)||detailTags[tag]));
    return survivor;
  }).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
}
const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',hour:'numeric',minute:'2-digit'});
export function localDate(event){if(event.allDay)return event.start.slice(0,10);return dateFormatter.format(new Date(event.start));}
export function timeLabel(event){return event.allDay?'All day':event.timeTba?'TBA':timeFormatter.format(new Date(event.start));}

export function lastDay(event){if(!event.end)return localDate(event);const end=new Date(event.end);end.setTime(end.getTime()-1);return event.allDay?end.toISOString().slice(0,10):dateFormatter.format(end);}
export function eventDays(event){const first=localDate(event),last=lastDay(event),out=[];const d=new Date(first+'T12:00:00Z');for(let i=0;i<400;i++){const key=d.toISOString().slice(0,10);if(key>last)break;out.push(key);d.setUTCDate(d.getUTCDate()+1);}return out;}

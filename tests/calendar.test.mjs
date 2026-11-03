import test from 'node:test';
import assert from 'node:assert/strict';
import ICAL from 'ical.js';
import {parseICS,classify,clean,civilToISO,eventDays,mergeEvents,splitDescriptionProvenance,timeLabel} from '../lib/catalog.mjs';
import {parseSearch,matchesEvent,exportICS,eventSlug,googleCalendarUrl,personalCalendarKind,savedViewSummary} from '../lib/search.mjs';
import {listingLinks,eventPage,importSource,sameSite,sportsSchedule} from '../lib/source-import.mjs';
import {parseClubSnapshot} from '../lib/club-snapshot.mjs';
import {parseHandshakeSnapshot} from '../lib/handshake-snapshot.mjs';
import {SOURCES,UNCONNECTED,INTEREST_TAGS} from '../lib/catalog.mjs';
import {applyEventOverrides} from '../lib/catalog.mjs';
import {takeMeThereUrl} from '../lib/campus-map.mjs';
const source={id:'test',name:'Test',url:'https://calendar.byu.edu',category:'Campus life'};
const now=new Date('2026-09-14T18:00:00Z');
const wrap=s=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+s+'\r\nEND:VCALENDAR';
const record=(start,end='',more='')=>`BEGIN:VEVENT\r\nUID:stable-123\r\nSUMMARY:Campus meetup\r\nDTSTART${start}\r\n${end?'DTEND'+end+'\r\n':''}${more}\r\nEND:VEVENT`;
test('Denver conversion changes offset at DST boundaries',()=>{assert.equal(civilToISO('2026-09-17 18:00:00'),'2026-09-18T00:00:00.000Z');assert.equal(civilToISO('2026-12-17 18:00:00'),'2026-12-18T01:00:00.000Z');});
const mstZone='BEGIN:VTIMEZONE\r\nTZID:Mountain Standard Time\r\nBEGIN:STANDARD\r\nDTSTART:16010101T020000\r\nTZOFFSETFROM:-0600\r\nTZOFFSETTO:-0700\r\nRRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=1SU;BYMONTH=11\r\nEND:STANDARD\r\nBEGIN:DAYLIGHT\r\nDTSTART:16010101T020000\r\nTZOFFSETFROM:-0700\r\nTZOFFSETTO:-0600\r\nRRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=2SU;BYMONTH=3\r\nEND:DAYLIGHT\r\nEND:VTIMEZONE';
test('Exchange Windows TZIDs map to IANA zones through DST',()=>{
 const tzd=';TZID=Mountain Standard Time';
 const summer=parseICS(wrap(mstZone+'\r\n'+record(`${tzd}:20260917T080000`,`${tzd}:20260917T090000`)),source,now)[0];
 assert.equal(summer.start,'2026-09-17T14:00:00.000Z');
 const winter=parseICS(wrap(mstZone+'\r\n'+record(`${tzd}:20261217T080000`,`${tzd}:20261217T090000`)),source,now)[0];
 assert.equal(winter.start,'2026-12-17T15:00:00.000Z');
});
test('rescheduling keeps single-event identity and repairs impossible end time',()=>{const a=parseICS(wrap(record(':20260917T180000Z',':20260917T170000Z')),source,now)[0];const b=parseICS(wrap(record(':20260917T190000Z')),source,now)[0];assert.equal(a.id,b.id);assert.equal(a.end,null);});
test('recurrence exclusions and moved instances retain original occurrence identities',()=>{const recurring=record(':20260915T180000Z',':20260915T190000Z','RRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE:20260922T180000Z');const exception='BEGIN:VEVENT\r\nUID:stable-123\r\nRECURRENCE-ID:20260929T180000Z\r\nSUMMARY:Moved meetup\r\nDTSTART:20260929T200000Z\r\nDTEND:20260929T210000Z\r\nEND:VEVENT';const events=parseICS(wrap(recurring+'\r\n'+exception),source,now);assert.equal(events.length,2);assert.equal(events[1].start,'2026-09-29T20:00:00.000Z');});
test('all-day ranges exclude DTEND and match searches during the event',()=>{const e=parseICS(wrap(record(';VALUE=DATE:20260923',';VALUE=DATE:20260926')),source,now)[0];assert.deepEqual(eventDays(e),['2026-09-23','2026-09-24','2026-09-25']);assert.ok(matchesEvent(e,'today',[],[],new Date('2026-09-24T18:00:00Z')));});
test('unknown locations and negated perks never produce positive filters',()=>{const e=classify({title:'Campus meetup',description:'No free food. Snacks not provided.',location:null,url:'',sourceId:'test'});assert.equal(clean(null),'');assert.equal(e.format,null);assert.equal(e.food,'no');assert.equal(e.snacks,'no');assert.ok(!e.tags.includes('Food provided'));assert.ok(!e.tags.includes('Free food'));});
test('interest tags follow majors, clubs, and fields named in listings',()=>{
 // Titles that enumerate majors tag every major they name.
 const tabling=classify({title:'Fast Enterprises Tabling-CS, IS, Engineering, Math',description:'',location:'TNRB',url:'',sourceId:'handshake'});
 for(const tag of ['IS','Engineering','Computer Science','Math'])assert.ok(tabling.tags.includes(tag),tag);
 // Coding activities tag Computer Science, including "Kids Who Code".
 const coding=classify({title:'Kids Who Code',description:'Volunteers help kids learn how to code.',location:'Library',url:'',sourceId:'yserve'});
 assert.ok(coding.tags.includes('Computer Science'));
 // Engineering societies tag Engineering even when the word only appears in the host line.
 const shpe=classify({title:'SHPE Leadership Talk',description:'Hosted by Society Of Hispanic Professional Engineers (SHPE).',location:'',url:'',sourceId:'club-directory'});
 assert.ok(shpe.tags.includes('Engineering'));
 // Neuroscience and law-school mentions tag their fields.
 const brain=classify({title:'Brain Cadaver Neuroanatomy Night',description:'Hosted by Neuroscience Journal Association.',location:'',url:'',sourceId:'club-directory'});
 assert.ok(brain.tags.includes('Life Sciences'));
 const law=classify({title:'Breakfast with alumni',description:'Held at the J. Reuben Clark Law School.',location:'',url:'',sourceId:'byu'});
 assert.ok(law.tags.includes('Law'));
 // Incidental biography math and dress codes never tag.
 const devotional=classify({title:'Devotional: Elder Joni L. Koch',description:'He earned a degree in mathematics before his call.',location:'',url:'',sourceId:'byu'});
 assert.ok(!devotional.tags.includes('Math'));
 const dance=classify({title:'Opening Social',description:'Semi-formal dress code applies.',location:'',url:'',sourceId:'club-directory'});
 assert.ok(!dance.tags.includes('Computer Science'));
});
test('label-style refreshments, invitation phrasing, and Tanner tables are snack evidence',()=>{
 const labeled=classify({title:'Gallery FHE',description:'Programs at 7:00 PM.\nRefreshments: Crumbl cookies\nFREE.',location:'Education in Zion Gallery',url:'',sourceId:'test'});
 assert.equal(labeled.snacks,'yes');assert.ok(labeled.tags.includes('Snacks'));
 const phrased=classify({title:'Welcome back activity',description:'An activity with Costco pizza and BYU mint brownies.',location:'WSC',url:'',sourceId:'test'});
 assert.equal(phrased.food,'yes');assert.equal(phrased.snacks,'yes');
 const treats=classify({title:'Hike & Light the Y',description:'Hike to the top, light the Y, and enjoy treats at the bottom of the trail.',location:'Y Trail',url:'',sourceId:'test'});
 assert.equal(treats.snacks,'yes');
 const tanner=classify({title:'Employer Q&A',description:'Come ask questions.',location:'TNRB 408',url:'',sourceId:'test'});
 assert.equal(tanner.snacks,'yes');assert.ok(tanner.tags.includes('Snacks'));
 const noCandy=classify({title:'Halloween Family Night',description:'Note: There will be no candy at this event.',location:'Tanner Building',url:'',sourceId:'test'});
 assert.equal(noCandy.snacks,'no');assert.ok(!noCandy.tags.includes('Snacks'));
 const metaphor=classify({title:'Brain Candy FHE',description:'An activity that is like a treat for your mind.',location:'JFSB',url:'',sourceId:'test'});
 assert.equal(metaphor.snacks,null);
});
test('food is distinct from admission, dates and ordinary is are understood',()=>{const e=classify({title:'Campus meetup',description:'Free pizza provided. All BYU students welcome.',location:'Tanner Building',url:'',sourceId:'test',start:'2026-09-17T23:30:00Z',allDay:false});assert.equal(e.free,null);assert.ok(matchesEvent(e,'free food this week after 5 pm',[],[],now));assert.deepEqual(parseSearch('what is happening today',now).tags,[]);assert.deepEqual(parseSearch('IS networking',now).tags,['IS','Networking']);assert.deepEqual(parseSearch('free food',now).tags,['Food provided']);assert.deepEqual(parseSearch('free food this week',now).tags,['Food provided']);});
test('duplicates retain provenance and exports are valid calendars',()=>{const a=parseICS(wrap(record(':20260917T180000Z')),source,now)[0];const merged=mergeEvents([a,{...a,sourceId:'other',sourceName:'Other',url:'https://example.com'}]);assert.equal(merged.length,1);assert.equal(merged[0].additionalSources.length,1);const calendar=new ICAL.Component(ICAL.parse(exportICS(merged)));assert.equal(calendar.getAllSubcomponents('vevent').length,1);});

test('club identity supplies subject filters and combined food statements are recognized',()=>{
 const e=classify({title:'Opening Social',description:'Pizza and drinks will be provided.',sourceId:'accounting-society',url:'',location:'TNRB 408',start:'2026-09-18T01:00:00Z',allDay:false});
 assert.ok(matchesEvent(e,'accounting clubs food drinks',[],[],now));assert.equal(e.free,null);
 const snack=classify({...e,sourceId:'engineering',description:'Pick up merch and snacks while you look!'});assert.equal(snack.snacks,'yes');
 assert.equal(clean('Learn &#x2014; connect &#128075;'),'Learn — connect 👋');
});
test('dedupe keeps richer details and separates generic socials from different clubs',()=>{
 const a=parseICS(wrap(record(':20260917T180000Z')),source,now)[0];
 const b=classify({...a,sourceId:'cs',sourceName:'Computer Science',title:'BYU '+a.title,description:'Pizza and drinks will be provided.'});
 const merged=mergeEvents([a,b]);assert.equal(merged.length,1);assert.equal(merged[0].food,'yes');assert.match(merged[0].description,/Pizza/);
 assert.equal(mergeEvents([{...a,title:'Opening Social'},{...b,title:'Opening Social'}]).length,2);
});
test('free-food phrasing maps to Food provided and the retired tag never surfaces',()=>{
 const e=classify({title:'Study night',description:'Free pizza for everyone.',sourceId:'test',url:'',location:'WSC',start:'2026-09-17T23:00:00Z',allDay:false});
 assert.ok(!e.tags.includes('Free food'));assert.ok(e.tags.includes('Food provided'));
 const legacy=mergeEvents([{...e,tags:['Free food','Food provided']}]);
 assert.ok(!legacy[0].tags.includes('Free food'));assert.ok(legacy[0].tags.includes('Food provided'));
});
test('near-duplicate listings collapse and keep the richest source content',()=>{
 const base={start:'2026-11-04T02:00:00.000Z',allDay:false,location:'WSC',sourceId:'byu',sourceName:'BYU Events',url:'https://calendar.byu.edu/clubs',category:'Campus life',cancelled:false,sourceUpdated:null};
 const live=classify({...base,title:'Clubs Night',description:'Clubs Night is every Tuesday night from 7:00–10:00 p.m.'});
 const drift=classify({...base,title:'Clubs Night!',start:'2026-11-04T02:30:00.000Z',sourceId:'club-directory',sourceName:'BYU Student Organizations',url:'https://clubs.byu.edu/clubs-night',description:'Hosted by BYUSA Clubs Area.'});
 const merged=mergeEvents([drift,live]);
 assert.equal(merged.length,1);assert.equal(merged[0].sourceId,'byu');assert.match(merged[0].description,/every Tuesday/);
 assert.ok(merged[0].additionalSources.some(s=>s.url==='https://clubs.byu.edu/clubs-night'));
 const day={start:'2026-11-26',end:null,allDay:true,sourceId:'byu',sourceName:'BYU Events',url:'https://calendar.byu.edu',category:'Academic',cancelled:false,sourceUpdated:null};
 const holidays=mergeEvents([
  classify({...day,title:'Thanksgiving'}),
  classify({...day,title:'Holiday - Thanksgiving',sourceId:'law',sourceName:'BYU Law',url:'https://law.byu.edu/holiday',description:'University holiday; no classes.'}),
  classify({...day,title:'University Holiday - Thanksgiving',sourceId:'marriott-mba',sourceName:'MBA',url:'https://marriott.byu.edu/calendar/'}),
 ]);
 assert.equal(holidays.length,1);assert.match(holidays[0].description,/no classes/);assert.ok(holidays[0].additionalSources.length>=2);
 const room={start:'2026-09-30T00:00:00.000Z',allDay:false,sourceId:'handshake',sourceName:'Handshake',category:'Career & business',cancelled:false,sourceUpdated:null,location:'',url:''};
 const sessions=mergeEvents([
  classify({...room,title:'Melaleuca: Information Session (Break-out room; Finance, Accounting)',description:'Hosted by Melaleuca.'}),
  classify({...room,title:'Melaleuca: Information Session (Break-out room; GSCM)',url:'https://app.joinhandshake.com/stu/events/2',description:'Hosted by Melaleuca.'}),
 ]);
 assert.equal(sessions.length,2);
 const social={start:'2026-09-18T01:00:00.000Z',allDay:false,sourceId:'club-directory',sourceName:'BYU Student Organizations',category:'Campus life',cancelled:false,sourceUpdated:null,location:'',description:'Welcome night.'};
 const socials=mergeEvents([
  classify({...social,title:'WiCyS Opening Social',url:'https://clubs.byu.edu/a',organization:'WiCyS'}),
  classify({...social,title:'Opening Social',url:'https://clubs.byu.edu/b',organization:'Accounting Society'}),
 ]);
 assert.equal(socials.length,2);
});
test('snapshot boilerplate does not outrank informative descriptions when deduping',()=>{
 const info=classify({title:'Church of Jesus Christ Info Session',description:'The Church of Jesus Christ, one of our AIS sponsors, will come to campus so you can learn about career opportunities.',sourceId:'ais',sourceName:'AIS',url:'https://byu-ais.byu.edu/activities',start:'2026-09-16T23:00:00.000Z',end:'2026-09-17T00:00:00.000Z',allDay:false,location:'',category:'Career & business',cancelled:false,sourceUpdated:null});
 const snapshot=classify({title:'The Church of Jesus Christ of Latter-day Saints: Info Session (IS)',description:'Hosted by The Church of Jesus Christ.\n\nImported from a user-provided Handshake export on September 14, 2026. This listing does not refresh automatically. Check the original listing for details, eligibility, and changes; Handshake sign-in may be required.',sourceId:'handshake',sourceName:'Handshake',url:'https://app.joinhandshake.com/stu/events/1',start:'2026-09-16T23:00:00.000Z',end:'2026-09-17T00:00:00.000Z',allDay:false,location:'',category:'Career & business',cancelled:false,sourceUpdated:null});
 const merged=mergeEvents([snapshot,info]);
 assert.equal(merged.length,1);assert.equal(merged[0].sourceId,'ais');assert.match(merged[0].description,/AIS sponsors/);
 assert.ok(merged[0].additionalSources.some(s=>s.name==='Handshake'&&s.url==='https://app.joinhandshake.com/stu/events/1'));
});
test('website discovery stays on site and reads dates from downloads instead of stale URL slugs',async()=>{
 const club={id:'accounting-society',name:'Accounting Society',url:'https://accountingsociety.byu.edu/',kind:'brightspot-pages',category:'Career & business'};
 const listing='<div class="ListUpcomingEvents"><table class="ListUpcomingEvents-table"><a href="/old-2025-01-01">Updated event</a><a href="https://attacker.example/event">Ignore</a></table></div>';
 assert.deepEqual(listingLinks(listing,club).links,[club.url+'old-2025-01-01']);assert.equal(sameSite('http://127.0.0.1/',club.url),null);
 const detail='<a href="/_event.ics?e=stable">Add to Calendar</a><div class="EventPage-eventBody">Pizza provided.</div>';
 assert.equal(eventPage(detail,club.url).feed,club.url+'_event.ics?e=stable');
 const read=async url=>url===club.url?listing:url.includes('_event.ics')?wrap(record(':20261029T170000Z',':20261029T180000Z')):detail;
 const imported=await importSource(club,{now,read});assert.equal(imported.events[0].start,'2026-10-29T17:00:00.000Z');assert.equal(imported.events[0].food,'yes');assert.equal(imported.events[0].url,club.url+'old-2025-01-01');
});
test('partial page failures retain known events and unexpected layouts fail instead of erasing data',async()=>{
 const club={id:'cs',name:'Computer Science',url:'https://cs.byu.edu/calendar',kind:'brightspot-pages'};
 const listing='<div class="ListUpcomingEvents"><table class="ListUpcomingEvents-table"><a href="/good">Good</a><a href="/offline">Offline</a></table></div>';
 const old={...parseICS(wrap(record(':20260917T180000Z')),source,now)[0],url:'https://cs.byu.edu/offline'};
 const read=async url=>{if(url.endsWith('/offline'))throw new Error('Offline');return url===club.url?listing:url.includes('_event.ics')?wrap(record(':20260918T180000Z')):'<a href="/_event.ics?e=good">Add</a>';};
 const result=await importSource(club,{now,read,previous:[old]});assert.equal(result.events.length,2);assert.match(result.warning,/1 event pages/);assert.ok(result.events.some(e=>e.id===old.id));
 assert.throws(()=>listingLinks('<main>Login</main>',club),/format changed/);
});
test('the all-sports schedule maps to calendar records and follows the API across pages',async()=>{
 const athletics={id:'byucougars',name:'BYU Athletics',url:'https://byucougars.com/all-sports-schedule',kind:'sports-schedule',feed:'https://byucougars.com/website-api/schedule-events',category:'Sports & recreation'};
 const rows=[
  {id:1,datetime:'2026-10-23T00:30:00.000000Z',datetime_end:null,is_all_day:false,opponent_name:'No. 25 Colorado',neutral_event_preposition:'vs',venue_type:'home',location:'Provo, Utah',venue:'Smith Fieldhouse',schedule:{sport:{name:"Women's Volleyball"}},is_conference:true},
  {id:2,datetime:'2026-10-24T18:00:00.000000Z',datetime_end:'2026-10-24T17:00:00.000000Z',is_all_day:false,opponent_name:'UCF',venue_type:'away',location:'Orlando, Florida',venue:'Acrisure Bounce House',schedule:{sport:{name:'Football'}},tba:'time_tba',is_conference:true},
  {id:3,datetime:'2026-11-09T15:00:00.000000Z',is_all_day:false,opponent_name:'TBA',opponent:{name:'Big 12'},venue_type:'away',location:'',schedule:{sport:{name:"Women's Soccer"}}},
 ];
 const records=sportsSchedule({data:rows},athletics);
 assert.equal(records.length,3);
 assert.equal(records[0].title,"Women's Volleyball vs. Colorado");
 assert.equal(records[0].start,'2026-10-23T00:30:00.000Z');
 assert.equal(records[0].end,null);
 assert.equal(records[0].location,'Provo, Utah / Smith Fieldhouse');
 assert.equal(records[0].category,'Sports & recreation');
 assert.match(records[0].description,/Conference contest/);
 assert.equal(records[1].title,'Football at UCF');
 assert.equal(records[1].end,null); // the source's end predates the start, so it is withheld
 assert.match(records[1].description,/TBA/);
 assert.equal(records[2].title,"Women's Soccer at Big 12");
 // All-day ranges become date-only values with an exclusive end so .ics export works.
 const allDay=sportsSchedule({data:[{id:6,datetime:'2027-05-14T00:00:00.000000Z',datetime_end:'2027-05-16T00:00:00.000000Z',is_all_day:true,opponent_name:'Big 12 Softball Tournament',venue_type:'away',location:'Oklahoma City, Oklahoma',schedule:{sport:{name:'Softball'}}}]},athletics)[0];
 assert.equal(allDay.start,'2027-05-14');
 assert.equal(allDay.end,'2027-05-17'); // the source's inclusive May 16 end
 assert.match(exportICS([allDay]),/DTSTART;VALUE=DATE:20270514/);
 assert.ok(googleCalendarUrl(allDay));
 // A malformed row is skipped instead of failing the whole source.
 const mixed=sportsSchedule({data:[{...rows[0],id:7,datetime:'not a date'},rows[0]]},athletics);
 assert.equal(mixed.length,1);
 const dateTba=sportsSchedule({data:[{...rows[0],id:8,tba:'date_tba'}]},athletics)[0];
 assert.match(dateTba.description,/date as TBA/);
 // A venue whose name contains "Club" must not leak the Clubs interest tag.
 const clubVenue=sportsSchedule({data:[{...rows[0],id:4,location:"Lihu'e, HI",venue:'Ocean Course at Hokuala Golf Club'}]},athletics)[0];
 assert.equal(clubVenue.location,"Lihu'e, HI / Ocean Course at Hokuala Golf Club");
 assert.ok(!clubVenue.tags.includes('Clubs'));
 const clubTournament=sportsSchedule({data:[{...rows[0],id:5,opponent_name:'The Preserve Golf Club Collegiate',schedule:{sport:{name:"Men's Golf"}}}]},athletics)[0];
 assert.ok(!clubTournament.tags.includes('Clubs'));
 // A real student organization still tags Clubs.
 assert.ok(classify({title:'Finance Club Opening Social',description:'',sourceId:'test'}).tags.includes('Clubs'));
 const seen=[];
 const read=async url=>{seen.push(url);return JSON.stringify({data:[rows[0]],meta:{last_page:2,current_page:url.includes('page=1')?1:2}});};
 const imported=await importSource(athletics,{read});
 assert.equal(imported.events.length,2); // both pages are read
 assert.equal(new URL(seen[0]).searchParams.get('filter[upcoming]'),'true');
 assert.equal(new URL(seen[0]).searchParams.get('per_page'),'300');
 await assert.rejects(()=>importSource(athletics,{read:async()=>JSON.stringify({data:[{id:9}]})}),/format changed/);
 await assert.rejects(()=>importSource(athletics,{read:async()=>JSON.stringify({error:'down'})}),/Unexpected schedule data/);
});
test('TBA start times read as TBA from both placeholder conventions',()=>{
 // The athletics API states time_tba directly.
 const athletics={id:'byucougars',name:'BYU Athletics',url:'https://byucougars.com/all-sports-schedule',category:'Sports & recreation'};
 const tba=sportsSchedule({data:[{id:11,datetime:'2026-10-23T05:11:00.000000Z',is_all_day:false,opponent_name:'Utah',venue_type:'home',location:'Provo, Utah',schedule:{sport:{name:'Football'}},tba:'time_tba'}]},athletics)[0];
 assert.equal(tba.timeTba,true);
 assert.equal(timeLabel(tba),'TBA');
 // BYU's own feed marks TBA contests with the 11:19 AM local sentinel (17:19Z in daylight time).
 const byuSource={id:'byu',name:'BYU Events',url:'https://calendar.byu.edu',category:'Campus life'};
 const sentinel=parseICS(wrap(record(':20260917T171900Z',':20260917T191900Z')),byuSource,now)[0];
 assert.equal(sentinel.timeTba,true);
 assert.equal(timeLabel(sentinel),'TBA');
 // Ordinary times on the same feed stay real times.
 const ordinary=parseICS(wrap(record(':20260917T230000Z',':20260918T000000Z')),byuSource,now)[0];
 assert.equal(ordinary.timeTba,undefined);
 assert.equal(timeLabel(ordinary),'5:00 PM');
 // TBA evidence survives a merge: whichever record wins, the flag stays.
 const merged=mergeEvents([classify({title:'Campus meetup',description:'',start:'2026-09-17T23:30:00.000Z',allDay:false,sourceId:'test',timeTba:true}),{...ordinary,description:'A fuller description wins the merge and must not drop the TBA evidence.'}]);
 assert.equal(merged.length,1);
 assert.equal(merged[0].timeTba,true);
 assert.equal(timeLabel(merged[0]),'TBA');
});
test('placeholder kickoff times never duplicate an athletics contest across sources',()=>{
 const base={allDay:false,location:'Smith Fieldhouse',category:'Sports & recreation',cancelled:false,sourceUpdated:null};
 const calendar=classify({...base,title:"Women's Volleyball vs. Colorado",start:'2026-10-22T23:19:00.000Z',sourceId:'byu',sourceName:'BYU Events',url:'https://calendar.byu.edu/athletics/womens-volleyball-vs-colorado-2026-10-22',description:'Volleyball hosts Colorado at the Smith Fieldhouse.'});
 const athletics=classify({...base,title:"Women's Volleyball vs. Colorado",start:'2026-10-23T00:30:00.000Z',sourceId:'byucougars',sourceName:'BYU Athletics',url:'https://byucougars.com/all-sports-schedule',description:''});
 const merged=mergeEvents([calendar,athletics]);
 assert.equal(merged.length,1);
 assert.equal(merged[0].sourceId,'byu');
 assert.ok(merged[0].additionalSources.some(s=>s.name==='BYU Athletics'));
 // Two different sports against the same opponent on the same day are two events.
 const soccer=classify({...base,title:"Women's Soccer vs. Utah",start:'2026-10-23T19:00:00.000Z',sourceId:'byu',sourceName:'BYU Events',url:'https://calendar.byu.edu/athletics/womens-soccer-vs-utah'});
 const volleyball=classify({...base,title:"Women's Volleyball vs. Utah",start:'2026-10-23T19:00:00.000Z',sourceId:'byucougars',sourceName:'BYU Athletics',url:'https://byucougars.com/all-sports-schedule'});
 assert.equal(mergeEvents([soccer,volleyball]).length,2);
 // A doubleheader listed twice by one source is left alone (placeholder times never bridge it).
 const twinA=classify({...base,title:"Men's Tennis at ITA",start:'2026-11-05T17:00:00.000Z',sourceId:'byucougars',sourceName:'BYU Athletics',url:'https://byucougars.com/all-sports-schedule'});
 const twinB=classify({...base,title:"Men's Tennis at ITA",start:'2026-11-05T21:00:00.000Z',sourceId:'byucougars',sourceName:'BYU Athletics',url:'https://byucougars.com/all-sports-schedule'});
 assert.equal(mergeEvents([twinA,twinB]).length,2);
 // A doubleheader listed by both sources stays two games: a cross-source matchup
 // merge is one-to-one, so it cannot chain four rows into a single event.
 const game1=classify({...base,title:'Softball vs. Utah State',start:'2026-04-10T19:00:00.000Z',sourceId:'byu',sourceName:'BYU Events',url:'https://calendar.byu.edu/athletics/softball-vs-utah-state-1'});
 const game2=classify({...base,title:'Softball vs. Utah State',start:'2026-04-10T21:00:00.000Z',sourceId:'byu',sourceName:'BYU Events',url:'https://calendar.byu.edu/athletics/softball-vs-utah-state-2'});
 const ath1=classify({...base,title:'Softball vs. Utah State',start:'2026-04-10T19:30:00.000Z',sourceId:'byucougars',sourceName:'BYU Athletics',url:'https://byucougars.com/all-sports-schedule'});
 const ath2=classify({...base,title:'Softball vs. Utah State',start:'2026-04-10T21:30:00.000Z',sourceId:'byucougars',sourceName:'BYU Athletics',url:'https://byucougars.com/all-sports-schedule'});
 const doubleheader=mergeEvents([game1,game2,ath1,ath2]);
 assert.equal(doubleheader.length,2);
 assert.ok(doubleheader.every(e=>e.additionalSources.some(s=>s.name==='BYU Athletics')));
});
test('club snapshots preserve explicit next-year dates and keep unknown details unknown',()=>{
 const capture={capturedAt:'2026-09-14T22:00:00Z',calendarYear:2026,rows:[{title:'Clubs Rush',organization:'BYUSA Clubs Area',date:'Tuesday, January 12 2027 12:00 PM',location:'WSC Garden Court'},{title:'Opening Social',organization:'Women in Finance',date:'Tuesday, September 15 7:00 PM',location:'TBA'}]};
 const result=parseClubSnapshot(capture);assert.equal(result[0].start,'2027-01-12T19:00:00.000Z');assert.equal(result[1].end,null);assert.equal(result[1].format,null);assert.equal(result[1].food,null);assert.ok(result[1].tags.includes('Finance'));assert.match(result[1].description,/does not refresh automatically/);assert.ok(result[0].id.length<100);
});

const handshakeRow={id:'1953435',title:'Employer session (Internship; Acc, MAcc, MISM)',host:'Example Employer',startDate:'2026-09-14T17:00:00-06:00',endDate:'2026-09-14T18:00:00-06:00',roomAndBuilding:'Tanner Building, Provo, Utah',locationSummary:'Tanner Building, Provo, Utah | Provo, Utah',cityState:'Provo, Utah',url:'https://app.joinhandshake.com/stu/events/1953435'};
const handshakeOptions={importedAt:'2026-09-14T20:00:00Z'};
test('Handshake imports preserve offset instants, stable IDs, search, and export',()=>{
 const [event]=parseHandshakeSnapshot([handshakeRow],handshakeOptions);
 assert.equal(event.id,'handshake-1953435');assert.equal(event.start,'2026-09-14T23:00:00.000Z');assert.equal(event.end,'2026-09-15T00:00:00.000Z');assert.equal(event.location,handshakeRow.roomAndBuilding);
 assert.equal(event.sourceUpdated,null);assert.match(event.description,/Hosted by Example Employer/);assert.match(event.description,/September 14, 2026/);assert.match(event.description,/does not refresh automatically/);
 assert.ok(matchesEvent(classify(event),'handshake accounting IS',['Career & business'],[],now));assert.ok(matchesEvent(event,'Example Employer',[],[],now));
 const [moved]=parseHandshakeSnapshot([{...handshakeRow,startDate:'2027-02-03T08:00:00-07:00',endDate:'2027-02-03T09:00:00-07:00'}],handshakeOptions);
 assert.equal(moved.id,event.id);assert.equal(moved.start,'2027-02-03T15:00:00.000Z');
 const exported=new ICAL.Event(new ICAL.Component(ICAL.parse(exportICS([event]))).getFirstSubcomponent('vevent'));
 assert.equal(exported.startDate.toJSDate().toISOString(),event.start);assert.equal(exported.component.getFirstPropertyValue('url'),event.url);
 assert.equal(SOURCES.find(s=>s.id==='handshake').kind,'snapshot');assert.ok(!UNCONNECTED.some(s=>s.id==='handshake'));
});
test('Handshake placeholders and bad ends remain unknown, including after database reclassification',()=>{
 const [event]=parseHandshakeSnapshot([{...handshakeRow,host:'N/A',roomAndBuilding:'',locationSummary:'Virtual / TBD',endDate:handshakeRow.startDate}],handshakeOptions);
 const stored=classify(event);
 assert.equal(stored.location,'');assert.equal(stored.format,null);assert.equal(stored.end,null);assert.equal(stored.free,null);assert.equal(stored.food,null);assert.equal(stored.audience,null);assert.ok(!stored.tags.includes('Online'));assert.ok(!stored.tags.includes('In person'));assert.doesNotMatch(stored.description,/Hosted by N\/A/);assert.match(stored.description,/invalid end time/);
 const [online]=parseHandshakeSnapshot([{...handshakeRow,roomAndBuilding:'',locationSummary:'Virtual'}],handshakeOptions);assert.equal(classify(online).format,'Online');
 const [tbd]=parseHandshakeSnapshot([{...handshakeRow,roomAndBuilding:'To Be Determined, Provo, Utah'}],handshakeOptions);assert.equal(tbd.format,null);
 const [music]=parseHandshakeSnapshot([{...handshakeRow,title:'Careers in Music'}],handshakeOptions);assert.equal(classify(music).category,'Career & business');
});
test('Handshake validation rejects bad dates, unsafe URLs, and conflicting IDs without copying private fields',()=>{
 for(const patch of [{startDate:'2026-09-14T17:00:00'},{startDate:'2026-02-30T17:00:00-07:00'},{url:handshakeRow.url+'?token=private'},{url:'https://example.com/stu/events/1953435'},{url:'https://user:password@app.joinhandshake.com/stu/events/1953435'},{id:'1953436'},{title:''}])assert.throws(()=>parseHandshakeSnapshot([{...handshakeRow,...patch}],handshakeOptions),/Handshake row 1/);
 assert.throws(()=>parseHandshakeSnapshot([],handshakeOptions),/non-empty array/);
 assert.throws(()=>parseHandshakeSnapshot([handshakeRow,{...handshakeRow,title:'Conflicting record'}],handshakeOptions),/conflicting/);
 const events=parseHandshakeSnapshot([handshakeRow,{...handshakeRow,attendees:['private'],accountEmail:'private@example.com',token:'private'}],handshakeOptions);
 assert.equal(events.length,1);assert.doesNotMatch(JSON.stringify(events),/private|attendees|accountEmail|token/);
 const merged=mergeEvents([{...events[0],id:'public-event',sourceId:'byu',sourceName:'BYU Events',url:'https://calendar.byu.edu/event'},events[0]]);
 assert.equal(merged.length,1);assert.ok(merged[0].additionalSources.some(s=>s.name==='Handshake'&&s.url===handshakeRow.url));assert.ok(matchesEvent(merged[0],'handshake',[],[],now));
 const [second]=parseHandshakeSnapshot([{...handshakeRow,id:'1953436',url:'https://app.joinhandshake.com/stu/events/1953436'}],handshakeOptions);
 const sameSource=mergeEvents([events[0],second]);assert.equal(sameSource.length,1);assert.equal(sameSource[0].additionalSources[0].url,second.url);
 const [subjects]=parseHandshakeSnapshot([{...handshakeRow,title:'Employer session (Fin, IS, CS)'}],handshakeOptions);assert.ok(matchesEvent(classify(subjects),'handshake finance IS computer science',[],[],now));
});
test('snapshot provenance footers split out of the displayed description',()=>{
 const handshake=splitDescriptionProvenance('Hosted by The Church of Jesus Christ.\n\nCome learn about careers in the Church.\n\nImported from a user-provided Handshake export on September 14, 2026. This listing does not refresh automatically. Check the original listing for details, eligibility, and changes; Handshake sign-in may be required.');
 assert.equal(handshake.description,'Hosted by The Church of Jesus Christ.\n\nCome learn about careers in the Church.');
 assert.match(handshake.provenance,/Imported from a user-provided Handshake export on September 14, 2026/);
 const club=splitDescriptionProvenance('Meet the clubs.\n\nHosted by BYUSA Clubs Area.\n\nCollected from the public BYU Student Organizations calendar on 2026-09-14. This listing does not refresh automatically; check the club for changes.');
 assert.equal(club.description,'Meet the clubs.');
 assert.match(club.provenance,/Hosted by BYUSA Clubs Area\./);
 assert.match(club.provenance,/Collected from the public BYU Student Organizations calendar/);
 const badEnd=splitDescriptionProvenance('Employer booth day.\n\nThe export has an invalid end time; check the original listing for the event duration.');
 assert.equal(badEnd.description,'Employer booth day.');
 assert.match(badEnd.provenance,/invalid end time/);
 const plain=splitDescriptionProvenance('A normal community listing. Hosted by a student club, everyone welcome.');
 assert.equal(plain.description,'A normal community listing. Hosted by a student club, everyone welcome.');
 assert.equal(plain.provenance,'');
 assert.deepEqual(splitDescriptionProvenance(''),{description:'',provenance:''});
});

test('performance listings are tagged and natural show searches reach them',()=>{
 const dance=classify({title:'World of Dance (Matinee)',description:'Doors open 30 minutes before curtain.',location:'Richards Building',url:'https://calendar.byu.edu/world-of-dance',sourceId:'byu',sourceName:'BYU Events',category:'Arts & culture',start:'2026-09-19T20:00:00.000Z',end:'2026-09-19T22:00:00.000Z',allDay:false,cancelled:false,sourceUpdated:null});
 assert.ok(dance.tags.includes('Performances'),'dance in the title is performance evidence');
 const recital=classify({title:'Faculty Recital',description:'An evening of solo performances.',location:'Madsen Recital Hall',url:'',sourceId:'byu'});assert.ok(recital.tags.includes('Performances'));
 const spectacular=classify({title:'BYU Spectacular',description:'',location:'Marriott Center',url:'',sourceId:'byu'});assert.ok(spectacular.tags.includes('Performances'));
 const fair=classify({title:'STEM Career Fair',description:'Meet 40 employers with open internships.',location:'WSC Ballroom',url:'',sourceId:'byu'});assert.ok(!fair.tags.includes('Performances'));
 const workshop=classify({title:'Resume Workshop',description:'This session shows you how to structure a resume.',location:'WSC',url:'',sourceId:'byu'});assert.ok(!workshop.tags.includes('Performances'),'description verbs like "shows" are not performance evidence');
 // The user-reported regression: "shows this weekend" found nothing even with
 // dance performances in inventory, because the listings carried no tag.
 const parsed=parseSearch('shows this weekend',now);
 assert.ok(parsed.tags.includes('Performances'));assert.deepEqual(parsed.words,[]);
 assert.equal(parsed.start,'2026-09-19');assert.equal(parsed.end,'2026-09-20');
 assert.ok(matchesEvent(dance,'shows this weekend',[],[],now));
 const natural=parseSearch('I want to go to a ballet',now);
 assert.ok(natural.tags.includes('Performances'));assert.deepEqual(natural.words,['ballet']);
 const ballet=classify({title:'The Nutcracker',description:'The classic holiday ballet performed by the theatre ballet company.',location:'Harris Fine Arts Center',url:'',sourceId:'byu',start:'2026-12-05T02:00:00.000Z',end:'2026-12-05T04:00:00.000Z',allDay:false,cancelled:false,sourceUpdated:null});
 assert.ok(matchesEvent(ballet,'I want to go to a ballet',[],[],now));
 assert.ok(!matchesEvent(dance,'ballet',[],[],now),'a dance listing without the word stays out of a ballet search');
 const concert=parseSearch('a concert after 5 pm',now);assert.ok(concert.tags.includes('Performances'));assert.deepEqual(concert.words,['concert']);assert.ok(concert.after===1020);
 assert.ok(INTEREST_TAGS.includes('Performances'),'the tag is a selectable interest filter');
});

test('personal calendar handoff: platform kinds and Google template links',()=>{
 assert.equal(personalCalendarKind('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36',0),'google');
 assert.equal(personalCalendarKind('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',0),'apple');
 assert.equal(personalCalendarKind('Mozilla/5.0 (iPad; CPU OS 17_0)',0),'apple');
 // iPadOS 13+ masquerades as Macintosh; touch points unmask it.
 assert.equal(personalCalendarKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',5),'apple');
 assert.equal(personalCalendarKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',0),'download');
 assert.equal(personalCalendarKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64)',0),'download');
 const timed=googleCalendarUrl({id:'abc-123',title:'IS Career Night: Pizza & Panel',description:'Panel with alumni.',start:'2026-09-18T22:00:00.000Z',end:'2026-09-19T00:00:00.000Z',allDay:false,location:'TNRB 408',url:'https://events.byu.edu/is-night'});
 const parsed=new URL(timed);
 assert.equal(parsed.origin,'https://calendar.google.com');
 assert.equal(parsed.pathname,'/calendar/render');
 assert.equal(parsed.searchParams.get('action'),'TEMPLATE');
 assert.equal(parsed.searchParams.get('dates'),'20260918T220000Z/20260919T000000Z');
 assert.equal(parsed.searchParams.get('text'),'IS Career Night: Pizza & Panel');
 assert.equal(parsed.searchParams.get('location'),'TNRB 408');
 assert.ok(parsed.searchParams.get('details').includes('Source: https://events.byu.edu/is-night'));
 assert.ok(parsed.searchParams.get('details').includes('From BYU Calendar: https://byucalendar.com/events/abc-123'));
 // All-day ends are exclusive in the stored model and in the template link.
 const allDay=new URL(googleCalendarUrl({id:'hol-1',title:'University Holiday',description:'',start:'2026-11-26',end:'2026-11-27',allDay:true,location:'',url:''}));
 assert.equal(allDay.searchParams.get('dates'),'20261126/20261127');
 // Malformed dates and unsafe source URLs fall back instead of producing links.
 assert.equal(googleCalendarUrl({id:'x',title:'Bad',description:'',start:'not-a-date',end:null,allDay:false,location:'',url:''}),null);
 const unsafe=googleCalendarUrl({id:'x',title:'Unsafe',description:'',start:'2026-09-18T22:00:00.000Z',end:null,allDay:false,location:'',url:'javascript:alert(1)'});
 assert.equal(new URL(unsafe).searchParams.get('details').includes('Source:'),false);
 assert.equal(eventSlug('IS Career Night: Pizza & Panel!'),'is-career-night-pizza-panel');
});

test('"Take me there" hands venues to the platform map app with a Provo destination',()=>{
 const desktop='Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
 const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
 // A campus building code resolves to the full building name and university.
 const url=new URL(takeMeThereUrl({location:'TNRB 240',format:null},desktop,0));
 assert.equal(url.origin,'https://www.google.com');
 assert.equal(url.pathname,'/maps/dir/');
 assert.equal(url.searchParams.get('destination'),'N. Eldon Tanner Building, Brigham Young University, Provo, UT');
 // Apple devices get Apple Maps; iPadOS masquerades as Macintosh with touch.
 assert.equal(new URL(takeMeThereUrl({location:'WSC 101',format:null},iphone,0)).origin,'https://maps.apple.com');
 assert.equal(new URL(takeMeThereUrl({location:'WSC 101',format:null},'Mozilla/5.0 (Macintosh)',3)).origin,'https://maps.apple.com');
 // Off-campus venues keep their text when a city is present and gain one when not.
 assert.equal(decodeURIComponent(takeMeThereUrl({location:'Business Career Center, Provo',format:'In person'},desktop,0)).includes('Business Career Center, Provo'),true);
 assert.equal(decodeURIComponent(takeMeThereUrl({location:'Village Chapel',format:'In person'},desktop,0)).includes('Village Chapel, Provo, UT'),true);
 // Virtual, placeholder, and linked locations never produce directions.
 for(const location of ['Virtual / TBD','To Be Determined','Zoom link in description','https://meet.google.com/xyz','']) assert.equal(takeMeThereUrl({location,format:null},desktop,0),null);
 assert.equal(takeMeThereUrl({location:'WSC 101',format:'Online'},desktop,0),null);
 // Salt Lake locations must not be mislabeled with Provo.
 const saltLake=takeMeThereUrl({location:'BYU Salt Lake Center',format:'In person'},desktop,0);
 assert.ok(saltLake.includes('BYU%20Salt%20Lake%20Center'));
 assert.ok(!saltLake.includes('Provo'));
});

test('moderator overrides patch events at read time and re-derive attendance format',()=>{
 const online={id:'byu-1',title:'Weekly seminar',description:'Seminar talk with guests.',start:'2026-09-24T18:00:00.000Z',end:null,allDay:false,location:'Zoom',url:'https://events.byu.edu/x',sourceId:'byu',sourceName:'BYU Events',category:'Academic',tags:['Online'],food:null,snacks:null,drinks:null,free:null,audience:null,format:'Online',cancelled:false,sourceUpdated:null};
 // Unrelated events pass through untouched; unknown ids never match.
 assert.equal(applyEventOverrides([online],[])[0],online);
 assert.deepEqual(applyEventOverrides([online],[{id:'other',patch:{},at:null}])[0],online);
 // Adding a real room flips the attendance format and its tags.
 const [patched]=applyEventOverrides([online],[{id:'byu-1',patch:{location:'TNRB 240'},at:'2026-09-21T18:00:00.000Z'}]);
 assert.equal(patched.location,'TNRB 240');
 assert.equal(patched.format,'In person');
 assert.ok(patched.tags.includes('In person')&&!patched.tags.includes('Online'));
 assert.equal(patched.overridden,true);
 assert.equal(patched.moderatedAt,'2026-09-21T18:00:00.000Z');
 // Title and description corrections apply literally; clearing a location works.
 const [retitled]=applyEventOverrides([online],[{id:'byu-1',patch:{title:'Distinguished seminar',description:''},at:null}]);
 assert.equal(retitled.title,'Distinguished seminar');
 assert.equal(retitled.description,'');
 assert.equal(retitled.format,'Online');
 const [cleared]=applyEventOverrides([online],[{id:'byu-1',patch:{location:''},at:null}]);
 assert.equal(cleared.location,'');
 assert.equal(cleared.format,null);
 assert.ok(!cleared.tags.includes('Online')&&!cleared.tags.includes('In person'));
});

test('interest filters match inclusively (OR) with IS/AIS equivalence while perk filters narrow (AND)',()=>{
 const finFood=classify({title:'Finance Dinner',description:'Free dinner provided.',location:'TNRB 151',url:'',sourceId:'finance-society',category:'Career & business',start:'2026-09-18T00:00:00Z',allDay:false});
 const aisOnly={...classify({title:'Tech Meet',description:'Come meet peers.',location:'TNRB 240',url:'',sourceId:'test',category:'Career & business',start:'2026-09-18T01:00:00Z',allDay:false}),tags:['AIS','In person']};
 // Selecting both Finance and Accounting matches an event that only has Finance (inclusive OR).
 assert.equal(matchesEvent(finFood,'',['Career & business'],['Finance','Accounting'],now),true);
 // Selecting IS matches an AIS-tagged event and vice versa.
 assert.equal(matchesEvent(aisOnly,'',[],['IS'],now),true);
 assert.equal(matchesEvent({...aisOnly,tags:['IS']},'',[],['AIS'],now),true);
 // Adding a perk filter narrows (AND) on top of the inclusive interest match.
 assert.equal(matchesEvent(finFood,'',[],['Finance','Accounting','Food provided'],now),true);
 assert.equal(matchesEvent(aisOnly,'',[],['IS','Food provided'],now),false);
});

test('saved set summaries read like the filter bar and never double up IS/AIS',()=>{
 assert.equal(savedViewSummary('',[],[]),'All events');
 assert.equal(savedViewSummary('this week',[],['IS','Clubs','Food provided']),'this week · IS / AIS · Clubs · Food provided');
 // A pair stored by the picks chat or an older filter set collapses to one label.
 assert.equal(savedViewSummary('',[],['IS','AIS']),'IS / AIS');
 // An AIS-only set is described the way the bar renders its AIS tag.
 assert.equal(savedViewSummary('',['Academic'],['AIS']),'Academic · IS / AIS');
 // Duplicates and empty entries never leak into the label.
 assert.equal(savedViewSummary('',['Academic','Academic'],['Clubs','','Clubs']),'Academic · Academic · Clubs');
});


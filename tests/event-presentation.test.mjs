import test from 'node:test';
import assert from 'node:assert/strict';
import {eventJsonLd,eventDateLabel,eventTimeLabel,eventVenueLabel,isUpcomingEvent,jsonLdText,splitDescriptionLinks} from '../lib/event-presentation.mjs';
import {classify,mergeEvents} from '../lib/catalog.mjs';

const event=patch=>({id:'test-event',title:'Campus event',description:'Source-provided details.',start:'2026-11-05T17:00:00.000Z',end:null,allDay:false,location:'2330 WSC',format:'In person',sourceId:'byu',sourceName:'BYU Events',tags:[],free:null,cancelled:false,...patch});

test('unknown hours stay date-only in search data and never expose placeholder end times',()=>{
 const e=event({timeTba:true,end:'2026-11-05T18:11:00.000Z'});
 const json=eventJsonLd(e);
 assert.equal(json.startDate,'2026-11-05');
 assert.equal(json.endDate,undefined);
 assert.equal(eventTimeLabel(e),'TBA');
 assert.match(eventDateLabel(e),/2026/);
 assert.doesNotMatch(JSON.stringify(json),/18:11|10:00/);
});

test('legacy snapshots recover explicit source TBA evidence without guessing from ordinary times',()=>{
 const e=classify(event({sourceId:'byucougars',description:'Start time was listed as TBA; confirm it before traveling.'}));
 assert.equal(e.timeTba,true);
 assert.equal(eventTimeLabel(e),'TBA');
 assert.equal(eventJsonLd(e).startDate,'2026-11-05');
 assert.equal(classify(event({sourceId:'byucougars',description:'Venue TBA.'})).timeTba,undefined);
});

test('away and unknown venues never gain a Provo address',()=>{
 for(const location of ['Rome, GA','Boulder, Colorado / CU Events Center','Salt Lake City, Utah / Rice-Eccles Stadium']){
  const json=eventJsonLd(event({location}));
  assert.equal(json.location.name,location);
  assert.equal(json.location.address,undefined);
 }
 for(const location of ['','TBD','To Be Determined, Provo, Utah, United States'])assert.equal(eventJsonLd(event({location,format:null})).location,undefined);
 assert.equal(eventVenueLabel(event({location:''})),'Location not listed');
});

test('BYU placeholders stay TBA through winter, including stored 17:19 UTC values',()=>{
 for(const start of ['2026-09-11T17:19:00.000Z','2026-11-11T17:19:00.000Z','2026-11-11T18:19:00.000Z']){
  const record=classify(event({start}));
  assert.equal(record.timeTba,true,start);
  assert.equal(eventTimeLabel(record),'TBA');
 }
 assert.equal(classify(event({start:'2026-11-11T18:05:00.000Z'})).timeTba,undefined);
});

test('bad multiweek contest ends are withheld while tournament and all-day ranges survive',()=>{
 const record=classify(event({title:'Football vs. Arizona State',start:'2026-11-01T02:15:00.000Z',end:'2026-11-15T03:15:00.000Z'}));
 assert.equal(record.end,null);
 assert.match(record.description,/End time needs confirmation/);
 assert.equal(isUpcomingEvent(record,new Date('2026-11-10T18:00:00Z')),false);
 const tournament=classify(event({title:'Women’s Golf at Invitational',start:'2026-11-11T15:00:00.000Z',end:'2026-11-14T21:00:00.000Z'}));
 assert.equal(tournament.end,'2026-11-14T21:00:00.000Z');
 const soccerTournament=classify(event({title:"Women's Soccer vs. Big 12",description:'Tournament play.',start:'2026-11-09T15:00:00.000Z',end:'2026-11-14T21:00:00.000Z'}));
 assert.equal(soccerTournament.end,'2026-11-14T21:00:00.000Z');
 const allDay=classify(event({title:'Football vs. Arizona State',allDay:true,start:'2026-11-01',end:'2026-11-15'}));
 assert.equal(allDay.end,'2026-11-15');
});

test('duration warnings do not change which source survives deduplication',()=>{
 const bad=classify(event({id:'bad-end',title:'Football vs. Example',description:'Short source detail.',end:'2026-11-19T19:00:00.000Z'}));
 const detailed=classify(event({id:'detailed',title:'Football vs. Example',description:'A longer published announcement with confirmed venue and attendance details.',start:'2026-11-05T17:15:00.000Z',sourceId:'other',url:'https://example.com'}));
 assert.equal(mergeEvents([bad,detailed])[0].id,'detailed');
});

test('a uniquely resolved campus venue has the same name in visible and structured facts',()=>{
 const e=event({location:'2330 WSC'});
 assert.match(eventVenueLabel(e),/Wilkinson/i);
 assert.equal(eventJsonLd(e).location.name,eventVenueLabel(e));
 assert.equal(eventJsonLd(e).location.address.addressLocality,'Provo');
});

test('real instants retain their Denver offset across the repeated DST hour',()=>{
 assert.equal(eventJsonLd(event({start:'2026-11-01T07:30:00.000Z'})).startDate,'2026-11-01T01:30:00-06:00');
 assert.equal(eventJsonLd(event({start:'2026-11-01T08:30:00.000Z'})).startDate,'2026-11-01T01:30:00-07:00');
});

test('all-day exclusive ends and cancelled events preserve their actual dates',()=>{
 const json=eventJsonLd(event({allDay:true,start:'2026-11-05',end:'2026-11-07',cancelled:true}));
 assert.equal(json.startDate,'2026-11-05');
 assert.equal(json.endDate,'2026-11-06');
 assert.equal(json.eventStatus,'https://schema.org/EventCancelled');
});

test('free admission does not invent ticket availability, an organizer, an image, or a virtual join URL',()=>{
 const json=eventJsonLd(event({free:true,format:'Online',location:'Virtual'}));
 assert.equal(json.isAccessibleForFree,true);
 for(const key of ['offers','organizer','image'])assert.equal(json[key],undefined);
 assert.equal(json.location.url,undefined);
});

test('ongoing events need a published end; unknown durations and cancelled listings are handled honestly',()=>{
 const now=new Date('2026-11-05T18:00:00Z');
 assert.equal(isUpcomingEvent(event({end:'2026-11-05T19:00:00Z'}),now),true);
 assert.equal(isUpcomingEvent(event(),now),false);
 assert.equal(isUpcomingEvent(event({end:'2026-11-05T17:30:00Z'}),now),false);
 assert.equal(isUpcomingEvent(event({timeTba:true}),now),true);
 assert.equal(isUpcomingEvent(event({timeTba:true,cancelled:true}),now),false);
});

test('a source description cannot close its structured-data script',()=>{
 const json=eventJsonLd(event({description:'Text </script><script>alert(1)</script>'}));
 const text=jsonLdText(json);
 assert.ok(!text.includes('<'));
 assert.equal(JSON.parse(text).description,json.description);
});

test('structured attendance modes, hybrid venues mentioning Zoom, and invalid dates degrade cleanly',()=>{
 const hybrid=event({format:'Hybrid',location:'JSB 140 (also streamed on Zoom)'});
 assert.equal(eventVenueLabel(hybrid),'JSB 140 (also streamed on Zoom)');
 const hybridJson=eventJsonLd(hybrid);
 assert.equal(hybridJson.eventAttendanceMode,'https://schema.org/MixedEventAttendanceMode');
 assert.equal(eventJsonLd(event({format:'Online',location:'Zoom'})).eventAttendanceMode,'https://schema.org/OnlineEventAttendanceMode');
 assert.equal(eventJsonLd(event({format:'In person',location:'WSC 201'})).eventAttendanceMode,'https://schema.org/OfflineEventAttendanceMode');
 assert.equal(eventJsonLd(event({timeTba:true,start:'2026-11-05T07:19:00.000Z',end:'2026-11-06T08:00:00.000Z'})).endDate,undefined);
 assert.equal(eventDateLabel(event({start:'not-a-date'})),'Date not listed');
 assert.equal(eventTimeLabel(event({start:'not-a-date'})),'TBA');
});

test('splitDescriptionLinks turns URLs in prose into clean link segments without trailing punctuation',()=>{
 assert.deepEqual(
  splitDescriptionLinks('Make an appointment (https://byushareyourhair.youcanbook.me/)! Or visit https://byu.edu.'),
  [
   {text:'Make an appointment ('},
   {text:'https://byushareyourhair.youcanbook.me/',href:'https://byushareyourhair.youcanbook.me/'},
   {text:')! Or visit '},
   {text:'https://byu.edu',href:'https://byu.edu/'},
   {text:'.'},
  ]
 );
});

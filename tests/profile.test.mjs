// Domain rules for "Picked for you": the chat clamp (tapped options and
// typed free responses), answer canonicalization onto the calendar
// vocabularies, decaying taste counters, and the deterministic
// recommendation pass. No Worker runtime needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChatPrompt,interpretChatStep,canonicalAnswer,canonicalFreeText,profileFromAnswers,profileEmpty,mergeProfiles,decayedScore,nextActivityScore,scoreEvent,recommendEvents,ACTIVITY_HALF_LIFE_MS} from '../lib/profile.mjs';

const now=new Date('2026-09-28T18:00:00Z');
const answers=[
  {question:'What do you study or care about?',key:'interests',options:['Information systems','AIS']},
  {question:'Free food matter?',key:'food',options:['Free food']},
];

test('the chat prompt carries the vocabularies and answers, never secrets',()=>{
  const messages=buildChatPrompt(answers,now);
  assert.equal(messages.length,2);assert.equal(messages[0].role,'system');
  assert.match(messages[0].content,/Today is 2026-09-28/);
  assert.match(messages[0].content,/Information Systems|AIS/);
  assert.match(messages[0].content,/Campus life/);
  assert.match(messages[1].content,/What do you study/);
  assert.doesNotMatch(messages[0].content,/Bearer|API_KEY|sk-/);
  const empty=buildChatPrompt([],now);
  assert.match(empty[1].content,/\(none yet\)/);
});

test('chat steps are clamped to question/key/option shapes',()=>{
  const good=JSON.stringify({question:'Which subjects do you care about?',key:'interests',options:['Information systems','Accounting','Not sure'],multiple:true});
  assert.deepEqual(interpretChatStep('```json\n'+good+'\n```'),{done:false,question:'Which subjects do you care about?',key:'interests',options:['Information systems','Accounting','Not sure'],multiple:true});
  const done=interpretChatStep('Great — {"done":true,"summary":"IS events with free food"} thanks!');
  assert.deepEqual(done,{done:true,summary:'IS events with free food'});
  // Bad keys, too-short questions, and fewer than two options are rejected outright.
  assert.equal(interpretChatStep(JSON.stringify({question:'Which subjects do you care about?',key:'Bad Key!',options:['a','b']})),null);
  assert.equal(interpretChatStep(JSON.stringify({question:'Hi?',key:'ok',options:['a','b']})),null);
  assert.equal(interpretChatStep(JSON.stringify({question:'Which subjects do you care about?',key:'ok',options:['only one']})),null);
  assert.equal(interpretChatStep('no json here'),null);
  // Overlong options are trimmed to 36 characters, extras dropped past five.
  const trimmed=interpretChatStep(JSON.stringify({question:'Which subjects do you care about?',key:'kind',options:['x'.repeat(80),'aa','bb','cc','dd','ee','ff']}));
  assert.equal(trimmed.options.length,5);assert.ok(trimmed.options[0].length<=36);
});

test('answers canonicalize onto the real vocabularies and caps hold',()=>{
  assert.equal(canonicalAnswer('Information systems'),'IS');
  assert.equal(canonicalAnswer('free food'),'Food provided');
  assert.equal(canonicalAnswer('Career & business'),'Career & business');
  assert.equal(canonicalAnswer('robotics'),'');
  assert.equal(canonicalAnswer('none of these'),'');
  const profile=profileFromAnswers([
    {question:'q1',key:'interests',options:['IS','ais','Accounting','Finance','Marketing']},
    {question:'q2',key:'more',options:['Engineering','Computer Science','Math','ACME','Life Sciences']},
    {question:'q3',key:'even-more',options:['International','Law']},
    {question:'q4',key:'kind',options:['Career & business','made up kind']},
    {question:'q5',key:'details',options:['Free food','Online','Free admission','Snacks','Drinks']},
    {question:'q6',key:'over-cap-details',options:['Open invite','In person','Also made up']},
    {question:'q7',key:'skip',options:['Not sure']},
  ]);
  assert.equal(profile.interests.length,10);assert.ok(profile.interests.includes('AIS'));
  assert.deepEqual(profile.categories,['Career & business']);
  assert.equal(profile.details.length,5);
  assert.ok(profileEmpty({interests:[],categories:[],details:[]}));
  assert.ok(!profileEmpty(profile));
});

test('free-response text is mined for vocabulary terms, acronyms stay case-sensitive',()=>{
  assert.deepEqual(canonicalFreeText("I'm in IS and I love free food").sort(),['Food provided','IS']);
  assert.deepEqual(canonicalFreeText('information systems with a CS minor').sort(),['Computer Science','IS']);
  assert.deepEqual(canonicalFreeText('I go to devotionals and study math'),['Faith & learning','Math']);
  assert.deepEqual(canonicalFreeText('mostly online career workshops').sort(),['Career & business','Online','Workshops']);
  // The English word "is" never becomes the IS interest; lowercase "ais" neither.
  assert.deepEqual(canonicalFreeText('what is this even'),[]);
  assert.deepEqual(canonicalFreeText('im in is, lowercase'),[]);
  // Unrecognized chatter contributes nothing, and neither does emptiness.
  assert.deepEqual(canonicalFreeText('robotics and spaceships'),[]);
  assert.deepEqual(canonicalFreeText('   '),[]);
  // Typed answers flow into the stored profile exactly like tapped options.
  const typed=profileFromAnswers([{question:'q',key:'interests',options:[],free:"I'm in IS, I like AIS, and free food matters"}]);
  assert.deepEqual([...typed.interests].sort(),['AIS','IS']);
  assert.deepEqual(typed.details,['Food provided']);
  // Mixed answering: tapped options and typed words in one reply.
  const mixed=profileFromAnswers([{question:'q',key:'interests',options:['Accounting'],free:'plus networking'}]);
  assert.deepEqual([...mixed.interests].sort(),['Accounting','Networking']);
});

test('the chat prompt shows the model the member\'s typed words',()=>{
  const messages=buildChatPrompt([{question:'Subjects?',key:'interests',options:[],free:'IS and free food'}],now);
  assert.match(messages[1].content,/typed: IS and free food/);
  assert.match(messages[0].content,/own words/);
});

test('taste counters decay with a 45-day half-life',()=>{
  const stamp='2026-09-28T18:00:00.000Z';
  assert.equal(decayedScore(4,stamp,now.getTime()),4);
  const half=decayedScore(4,stamp,now.getTime()+ACTIVITY_HALF_LIFE_MS);
  assert.ok(Math.abs(half-2)<0.001);
  const quarter=decayedScore(4,stamp,now.getTime()+2*ACTIVITY_HALF_LIFE_MS);
  assert.ok(Math.abs(quarter-1)<0.001);
  assert.equal(nextActivityScore(4,stamp,3,now.getTime()),7);
  // A stale counter decays before the new action is added.
  const aged=nextActivityScore(4,'2026-06-01T00:00:00.000Z',3,now.getTime());
  assert.ok(aged>3&&aged<7);
});

const base={description:'',location:'TNRB 260',url:'https://byu.edu',allDay:false,cancelled:false,end:null,sourceId:'byu',sourceName:'BYU Events',category:'Career & business',sourceUpdated:null};
const event=overrides=>({...base,id:'byu:test',title:'Test event',start:'2026-10-01T17:00:00.000Z',tags:[],...overrides});

test('scoring excludes saved, cancelled, past, and distant events',()=>{
  const profile={interests:['IS'],categories:[],details:[]};
  assert.equal(scoreEvent(event({id:'saved-one'}),{profile,savedIds:['saved-one'],now}),null);
  assert.equal(scoreEvent(event({cancelled:true}),{profile,now}),null);
  assert.equal(scoreEvent(event({start:'2026-09-01T17:00:00.000Z'}),{profile,now}),null);
  assert.equal(scoreEvent(event({start:'2026-12-20T17:00:00.000Z'}),{profile,now}),null);
});

test('scoring blends stated interests, activity, and freshness with readable reasons',()=>{
  const profile={interests:['IS','Networking'],categories:['Career & business'],details:[]};
  const activity=new Map([['IS',3],['Accounting',2]]);
  const strong=scoreEvent(event({tags:['IS','Networking','Clubs']}),{profile,activity,now});
  const weak=scoreEvent(event({tags:['Accounting']}),{profile,activity,now});
  assert.ok(strong.score>weak.score);
  // Stated interest 2.5 + activity 2*3 + second tag 2.5 + category 1.5 + freshness.
  assert.ok(strong.score>8.5);
  assert.deepEqual(strong.reasons,['IS','Networking','Career & business']);
  // The weak event carries a neighbor boost (Accounting borders the stated
  // Networking), its activity drift, and the stated category preference.
  assert.deepEqual(weak.reasons,['Related: Accounting','Career & business']);
  const fresh=scoreEvent(event({tags:['Accounting'],start:'2026-09-29T17:00:00.000Z'}),{profile,activity,now});
  assert.ok(fresh.score>weak.score,'sooner events rank above identical later ones');
});

test('one stated interest reaches its neighbors so picks stay general',()=>{
  const profile={interests:['IS'],categories:[],details:[]};
  // An AIS club night and a CS lecture both rank for an IS member…
  const ais=scoreEvent(event({id:'ais',title:'AIS social',tags:['AIS','Clubs'],start:'2026-09-30T17:00:00.000Z'}),{profile,now});
  const cs=scoreEvent(event({id:'cs',title:'CS lecture',tags:['Computer Science'],start:'2026-10-02T17:00:00.000Z'}),{profile,now});
  assert.ok(ais&&ais.score>=1.5,'AIS events clear the bar for IS members');
  assert.ok(ais.reasons.includes('Related: AIS'));
  assert.ok(cs&&cs.score>=1.5);
  // …and unrelated events no longer drop below the bar: preferences rank the
  // calendar, they never filter it. Related events simply land above them.
  const random=scoreEvent(event({id:'random',title:'Random social',tags:[],category:'Campus life',start:'2026-09-30T17:00:00.000Z'}),{profile,now});
  const law=scoreEvent(event({id:'law',title:'Law review',tags:['Law'],category:'Academic',start:'2026-09-30T17:00:00.000Z'}),{profile,now});
  assert.ok(random&&law&&random.score>=1.5&&law.score>=1.5,'unrelated nearby events still make the list');
  assert.ok(ais.score>law.score&&cs.score>law.score,'related events outrank unrelated ones');
  assert.ok(law.reasons.every(label=>!label.startsWith('Related: ')),'unrelated events never claim a match');
  // The interest's home category carries a small implied weight with its label.
  const career=scoreEvent(event({id:'career',title:'Recruiting mixer',tags:['Recruiting'],start:'2026-09-30T17:00:00.000Z'}),{profile,now});
  assert.ok(career&&career.score>=1.5);
  assert.ok(career.reasons.includes('Career & business'));
  // End to end: an IS-only profile surfaces the AIS social first, with the
  // general event still present behind it.
  const picks=recommendEvents([
    event({id:'ais',title:'AIS social',tags:['AIS','Clubs'],start:'2026-09-30T17:00:00.000Z'}),
    event({id:'random',title:'Random social',tags:[],category:'Campus life',start:'2026-09-30T17:00:00.000Z'}),
  ],{profile,activityRows:[],savedIds:[],now});
  assert.deepEqual(picks.map(pick=>pick.id),['ais','random']);
});

test('partial chat storage merges into the stored profile instead of wiping it',()=>{
  const existing={interests:['IS','AIS'],categories:[],details:['Food provided']};
  const merged=mergeProfiles(existing,{interests:['Accounting'],categories:['Campus life'],details:[]});
  assert.deepEqual([...merged.interests].sort(),['AIS','Accounting','IS']);
  assert.deepEqual(merged.details,['Food provided'],'an exchange that says nothing new keeps what is stored');
  assert.deepEqual(merged.categories,['Campus life']);
  // Caps still hold after a merge; existing values keep their seats first.
  const ten=Array.from({length:10},(_,i)=>'I'+i);
  const capped=mergeProfiles({interests:ten,categories:[],details:[]},{interests:['Extra'],categories:[],details:[]});
  assert.equal(capped.interests.length,10);
  assert.ok(!capped.interests.includes('Extra'));
  // Empty or missing profiles merge cleanly either way.
  assert.deepEqual(mergeProfiles(null,{interests:['IS'],categories:[],details:[]}).interests,['IS']);
  assert.deepEqual(mergeProfiles(existing,{interests:[],categories:[],details:[]}).interests,['IS','AIS']);
});

test('a stated detail lifts matching events without filtering the rest',()=>{
  // The reported case: answering "Food provided" must raise food events, not
  // reduce My calendar to food events only.
  const profile={interests:[],categories:[],details:['Food provided']};
  const food=scoreEvent(event({id:'food',title:'Pizza night',tags:['Food provided'],start:'2026-09-30T17:00:00.000Z'}),{profile,now});
  const plain=scoreEvent(event({id:'plain',title:'Guest lecture',tags:[],start:'2026-09-30T18:00:00.000Z'}),{profile,now});
  assert.ok(food&&food.score>=1.5);
  assert.ok(food.reasons.includes('Food provided'));
  assert.ok(plain&&plain.score>=1.5,'non-matching events stay on the calendar');
  assert.ok(food.score>plain.score,'the preference ranks food events above the rest');
  const picks=recommendEvents([
    event({id:'food',title:'Pizza night',tags:['Food provided'],start:'2026-09-30T17:00:00.000Z'}),
    event({id:'plain',title:'Guest lecture',tags:[],start:'2026-09-30T18:00:00.000Z'}),
  ],{profile,activityRows:[],savedIds:[],now});
  assert.deepEqual(picks.map(pick=>pick.id),['food','plain'],'both appear; the preference only orders them');
});

test('matches fill the picks before any general campus fill',()=>{
  // 30 food-tagged events outrank every general one for a food-only profile:
  // the picks belong to the matches, and general fill waits for spare slots.
  const profile={interests:[],categories:[],details:['Food provided']};
  const events=[];
  for(let i=0;i<30;i++)events.push(event({id:'food-'+i,title:'Food event '+i,tags:['Food provided'],start:new Date(Date.parse('2026-09-29T17:00:00.000Z')+i*86400000).toISOString()}));
  events.push(event({id:'general-1',title:'Guest lecture',tags:[],category:'Academic',start:'2026-09-30T22:00:00.000Z'}));
  const picks=recommendEvents(events,{profile,activityRows:[],savedIds:[],now,limit:24});
  assert.equal(picks.length,24);
  assert.ok(!picks.some(pick=>pick.id==='general-1'),'plentiful matches leave no room for general fill');
  assert.equal(picks[0].id,'food-0','the strongest match still ranks first');
  // With fewer matches than slots, general fill takes exactly the remainder.
  const sparse=recommendEvents(events.slice(0,2).concat(events.at(-1)),{profile,activityRows:[],savedIds:[],now,limit:24});
  assert.ok(sparse.some(pick=>pick.id==='general-1'));
  assert.equal(sparse.filter(pick=>pick.reasons[0]==='Campus pick').length,1);
});

test("an AIS member who likes free food gets AIS, IS-related, and food events",()=>{
  // The owner's example: telling the chat "I'm into AIS and I also like free
  // food" fills the picks with AIS events, IS-related events, and free food
  // across campus (snack tables included) — general campus fill comes last
  // and only when matches run short.
  const profile={interests:['AIS'],categories:[],details:['Food provided']};
  const picks=recommendEvents([
    event({id:'general-1',title:'Intramurals',tags:[],category:'Sports & recreation',start:'2026-09-30T22:00:00.000Z'}),
    event({id:'ais-1',title:'AIS networking social',tags:['AIS','Networking'],start:'2026-09-30T17:00:00.000Z'}),
    event({id:'is-1',title:'IS webinar',tags:['IS'],start:'2026-10-01T17:00:00.000Z'}),
    event({id:'food-1',title:'KPMG pizza lunch',tags:['Food provided'],category:'Campus life',start:'2026-10-02T17:00:00.000Z'}),
    event({id:'snack-1',title:'Study break',tags:['Snacks'],category:'Campus life',start:'2026-10-02T18:00:00.000Z'}),
  ],{profile,activityRows:[],savedIds:[],now});
  assert.deepEqual(picks.map(pick=>pick.id),['ais-1','is-1','food-1','snack-1','general-1']);
  assert.deepEqual(picks[0].reasons,['AIS','Related: Networking','Career & business']);
  assert.deepEqual(picks[1].reasons,['Related: IS','Career & business']);
  assert.deepEqual(picks[2].reasons,['Food provided']);
  assert.deepEqual(picks[3].reasons,['Related: Snacks']);
  assert.deepEqual(picks[4].reasons,['Campus pick']);
  // A stated detail also lifts its neighbors on an event with no interest tag.
  const snack=scoreEvent(event({id:'snack-2',title:'Candy table',tags:['Snacks'],start:'2026-09-30T17:00:00.000Z'}),{profile,now});
  assert.ok(snack&&snack.score>=1.5);
  assert.ok(snack.reasons.includes('Related: Snacks'));
});

test('recommendations rank, cap, exclude saved events, and stay quiet without signal',()=>{
  const profile={interests:['IS'],categories:[],details:[]};
  const events=[
    event({id:'a',title:'AIS social',tags:['IS','AIS','Clubs'],start:'2026-09-30T17:00:00.000Z'}),
    event({id:'b',title:'Accounting night',tags:['Accounting'],start:'2026-09-30T18:00:00.000Z'}),
    event({id:'c',title:'IS workshop later',tags:['IS'],start:'2026-10-20T17:00:00.000Z'}),
    event({id:'d',title:'Unrelated',tags:[],start:'2026-09-30T19:00:00.000Z'}),
  ];
  const picks=recommendEvents(events,{profile,activityRows:[{kind:'tag',value:'IS',score:2}],savedIds:['a'],now,limit:2});
  // With the base score, the general and Accounting events also make the cut
  // behind the stated-interest picks.
  assert.deepEqual(picks.map(p=>p.id),['c','b']);
  const ranked=recommendEvents(events,{profile,activityRows:[{kind:'tag',value:'IS',score:2}],savedIds:[],now,limit:10});
  assert.deepEqual(ranked.map(p=>p.id),['a','c','b','d']);
  assert.ok(ranked[0].reasons.includes('IS'));
  // No profile and no activity: nothing clears the bar, so the panel shows its prompt instead.
  assert.deepEqual(recommendEvents(events,{profile:null,activityRows:[],now}),[]);
  // Activity alone carries a pick and opens the base-score fill behind it.
  const activityOnly=recommendEvents(events,{profile:null,activityRows:[{kind:'tag',value:'Accounting',score:4}],now});
  assert.deepEqual(activityOnly.map(p=>p.id),['b','a','d','c']);
  // General fill says so honestly instead of claiming a match.
  assert.deepEqual(activityOnly.find(p=>p.id==='d').reasons,['Campus pick']);
});

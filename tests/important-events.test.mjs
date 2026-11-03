// Domain rules for the curated Important registry: signature once-a-year
// events match conservatively (title-anchored), everything else stays
// untouched, and important listings lead their day in every listing order.
import test from 'node:test';
import assert from 'node:assert/strict';
import {IMPORTANT_TAG,importantLabel,applyImportantEvents,dayOrder} from '../lib/important-events.mjs';

const base={description:'',location:'PROVO',url:'https://byu.edu',allDay:false,cancelled:false,end:null,tags:[],sourceId:'byu',sourceName:'BYU Events',category:'Campus life',sourceUpdated:null};
const event=overrides=>({...base,id:'byu:test',title:'Test event',start:'2026-10-01T17:00:00.000Z',...overrides});

test('the big STEM fair is important, nearby wording is not',()=>{
  assert.equal(importantLabel(event({title:'STEM Career Fair'})),'Annual STEM fair');
  assert.equal(importantLabel(event({title:'BYU STEM Fair 2027'})),'Annual STEM fair');
  assert.equal(importantLabel(event({title:'Engineering Career Fair'})),'');
  assert.equal(importantLabel(event({title:'STEM research symposium'})),'');
  // A description mention alone never qualifies a listing.
  assert.equal(importantLabel(event({title:'Club night',description:'Come before the STEM Career Fair'})),'');
});

test('devotionals and forums with senior speakers are important; ordinary ones are not',()=>{
  assert.equal(importantLabel(event({title:'Devotional: Elder David A. Bednar',category:'Faith & learning'})),'Apostle or president address');
  assert.equal(importantLabel(event({title:'University Forum',description:'Speaker: President C. Shane Reese, BYU President'})),'Apostle or president address');
  assert.equal(importantLabel(event({title:'Forum: A Conversation with the First Presidency'})),'Apostle or president address');
  assert.equal(importantLabel(event({title:'Devotional: Sarah Chen, Student Body Officer'})),'');
  // Honorific without a capitalized name, outside the devotional series, never qualifies.
  assert.equal(importantLabel(event({title:'AIS social',description:'the club president announced pizza'})),'');
  assert.equal(importantLabel(event({title:'Devotional',description:'speaker to be announced'})),'');
});

test('the Utah vs BYU football game is important; other football is not',()=>{
  assert.equal(importantLabel(event({title:'BYU Football vs. Utah Utes',category:'Sports & recreation'})),'Utah vs BYU football');
  assert.equal(importantLabel(event({title:'Utah Utes at BYU Cougars Football'})),'Utah vs BYU football');
  assert.equal(importantLabel(event({title:'BYU Football vs. Gonzaga'})),'');
  assert.equal(importantLabel(event({title:'Utah Jazz watch party'})),'');
});

test('flagging adds the label and tag once, and leaves other events alone',()=>{
  const [flagged,plain]=applyImportantEvents([
    event({id:'a',title:'STEM Career Fair'}),
    event({id:'b',title:'Ordinary club social'}),
  ]);
  assert.equal(flagged.important,'Annual STEM fair');
  assert.deepEqual(flagged.tags,[IMPORTANT_TAG]);
  assert.equal(applyImportantEvents([flagged])[0].tags.length,1); // idempotent tag
  assert.equal(plain.important,undefined);
  assert.deepEqual(plain.tags,[]);
});

test('important events lead their day; timed events precede ordinary all-day events',()=>{
  const morning=event({id:'morning',title:'Morning social',start:'2026-10-01T16:00:00.000Z'});
  const signature=applyImportantEvents([event({id:'sig',title:'STEM Career Fair',start:'2026-10-01T21:00:00.000Z'})])[0];
  const afternoon=event({id:'after',title:'Afternoon workshop',start:'2026-10-01T18:00:00.000Z'});
  const ordinaryAllDay=event({id:'holiday',title:'Campus Spirit Week',start:'2026-10-01',allDay:true});
  assert.deepEqual([ordinaryAllDay,signature,afternoon,morning].sort(dayOrder).map(e=>e.id),['sig','morning','after','holiday']);
  // Important all-day entries still lead ordinary timed events.
  const allDay=applyImportantEvents([event({id:'allday',title:'Utah Utes at BYU Cougars Football',start:'2026-10-01',allDay:true})])[0];
  assert.deepEqual([afternoon,allDay].sort(dayOrder).map(e=>e.id),['allday','after']);
});

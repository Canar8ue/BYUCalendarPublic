import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrompt,extractJSON,interpretAssist,cachedInterpretation,rememberInterpretation,ASSIST_TAGS,ASSIST_CATEGORIES} from '../lib/search-assist.mjs';

const now=new Date('2026-09-21T18:00:00Z');
const good=JSON.stringify({summary:'Dance performances this weekend',tags:['Performances'],categories:['Arts & culture'],start:'2026-09-26',end:'2026-09-27',afterMinutes:null,words:['ballet','nutcracker']});

test('the prompt carries the vocabulary and the current Denver date, never secrets',()=>{
 const messages=buildPrompt('I want to go to a ballet',now);
 assert.equal(messages.length,2);assert.equal(messages[1].role,'user');assert.equal(messages[1].content,'I want to go to a ballet');
 assert.match(messages[0].content,/Today is 2026-09-21 \(Monday\)/);
 assert.match(messages[0].content,/Performances/);
 assert.match(messages[0].content,/Arts & culture/);
 assert.doesNotMatch(messages[0].content,/api\.z\.ai|Bearer|API_KEY|sk-/);
});

test('model output is extracted from fences and prose and clamped to the vocabulary',()=>{
 const fenced=interpretAssist('Here you go:\n```json\n'+good+'\n```\nLet me know!',now);
 assert.equal(fenced.summary,'Dance performances this weekend');
 assert.deepEqual(fenced.intent.tags,['Performances']);
 assert.deepEqual(fenced.intent.categories,['Arts & culture']);
 assert.equal(fenced.intent.start,'2026-09-26');assert.equal(fenced.intent.end,'2026-09-27');
 assert.deepEqual(fenced.intent.words,['ballet','nutcracker']);
 // Unknown tags and categories are dropped, casing is normalized, dates swap when reversed, junk words are cleaned.
 const clamped=interpretAssist(JSON.stringify({summary:'x'.repeat(130)+' \n ok',tags:['performances','Made Up','FOOD PROVIDED'],categories:['arts & culture','Nope'],start:'2026-09-27',end:'2026-09-26',afterMinutes:9999,words:['Ballet!','a','','info session','info session','nutcracker','x','y','z']}),now);
 assert.deepEqual(clamped.intent.tags,['Performances','Food provided']);
 assert.deepEqual(clamped.intent.categories,['Arts & culture']);
 assert.equal(clamped.intent.start,'2026-09-26');assert.equal(clamped.intent.end,'2026-09-27');
 assert.equal(clamped.intent.after,null);
 assert.deepEqual(clamped.intent.words,['ballet','info session','nutcracker']);
 assert.ok(clamped.summary.length<=140&&clamped.summary.endsWith('ok'));
 // Distant dates are dropped; end without start is dropped.
 assert.equal(interpretAssist(JSON.stringify({tags:['Clubs'],start:'2019-01-01'}),now).intent.start,null);
 assert.equal(interpretAssist(JSON.stringify({tags:['Clubs'],start:'2199-01-01'}),now).intent.start,null);
 assert.equal(interpretAssist(JSON.stringify({tags:['Clubs'],end:'2026-10-01'}),now).intent.end,null);
 // A bare keyword search keeps the words only.
 const keyword=interpretAssist(JSON.stringify({summary:'Nutcracker',words:['nutcracker']}),now);
 assert.deepEqual(keyword.intent.tags,[]);assert.deepEqual(keyword.intent.words,['nutcracker']);
});

test('unusable model output fails honestly instead of inventing filters',()=>{
 assert.equal(interpretAssist('Sorry, I cannot help with that.'),null);
 assert.equal(interpretAssist('{"tags":["Made Up"],"words":[]'),null);
 assert.equal(interpretAssist('{"tags":[],"categories":[],"start":null,"end":null,"afterMinutes":null,"words":[]}'),null);
 assert.equal(interpretAssist(null),null);
 assert.equal(extractJSON('no json at all'),null);
 assert.ok(ASSIST_TAGS.includes('RSVP / tickets'));
 assert.equal(ASSIST_CATEGORIES.length,6);
});

test('identical queries hit the short-lived cache and the cache is bounded',()=>{
 rememberInterpretation('I want to go to a ballet',{intent:{tags:['Performances'],categories:[],start:null,end:null,after:null,words:['ballet']},summary:'Ballet performances'},Date.now());
 assert.ok(cachedInterpretation('  i WANT to go to a ballet  '));
 assert.equal(cachedInterpretation('a different question'),null);
 for(let i=0;i<350;i++)rememberInterpretation('query '+i,{intent:{tags:[],categories:[],start:null,end:null,after:null,words:[]},summary:''},Date.now());
 assert.equal(cachedInterpretation('I want to go to a ballet'),null,'oldest entries are evicted past the cap');
});

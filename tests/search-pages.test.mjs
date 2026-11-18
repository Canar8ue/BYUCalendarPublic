import test from 'node:test';
import assert from 'node:assert/strict';
import {SEARCH_PAGES,findSearchPage,requestSearchPage,searchPageWindow,searchPageEvents} from '../lib/search-pages.mjs';
import {parseSearch} from '../lib/search.mjs';

const event=patch=>({id:'fixture',title:'Campus event',description:'',start:'2026-11-05T17:00:00Z',end:null,allDay:false,cancelled:false,tags:[],category:'Campus life',location:'WSC',sourceName:'BYU Events',...patch});

test('only three deliberate date searches receive a canonical search page',()=>{
 assert.equal(SEARCH_PAGES.length,3);
 assert.equal(findSearchPage(' Events   THIS weekend ').href,'/?q=Events+this+weekend');
 assert.equal(findSearchPage('today').key,'today');
 assert.equal(requestSearchPage({q:'Events this week'}).key,'week');
 for(const params of [{q:'pizza this weekend'},{q:'Events today',tags:'Clubs'},{q:'Events today',event:'some-id'},{q:['Events today','Events this week']},{q:'Events today',view:'map'}])assert.equal(requestSearchPage(params),null);
});

test('weekend boundaries use Mountain dates and never include Monday on Sunday',()=>{
 const page=findSearchPage('this weekend');
 assert.deepEqual([searchPageWindow(page,new Date('2026-10-31T23:00:00Z')).start,searchPageWindow(page,new Date('2026-10-31T23:00:00Z')).end],['2026-10-31','2026-11-01']);
 const sunday=searchPageWindow(page,new Date('2026-11-01T18:00:00Z'));
 assert.equal(sunday.start,'2026-11-01');
 assert.equal(sunday.end,'2026-11-01');
 assert.equal(parseSearch('events this weekend',new Date('2026-11-01T18:00:00Z')).end,'2026-11-01');
 const lateSunday=searchPageWindow(findSearchPage('today'),new Date('2026-11-02T06:30:00Z'));
 assert.equal(lateSunday.start,'2026-11-01');
});

test('planning results include published ongoing events but exclude ended, cancelled, and out-of-window starts',()=>{
 const now=new Date('2026-11-05T18:00:00Z');
 const rows=[event({id:'ended',end:'2026-11-05T17:30:00Z'}),event({id:'ongoing',end:'2026-11-05T19:00:00Z'}),event({id:'unknown-end'}),event({id:'future',start:'2026-11-05T21:00:00Z'}),event({id:'tomorrow',start:'2026-11-06T17:00:00Z'}),event({id:'cancelled',start:'2026-11-05T22:00:00Z',cancelled:true})];
 assert.deepEqual(searchPageEvents(rows,findSearchPage('today'),now).map(e=>e.id),['ongoing','future']);
});

test('chronology compares Mountain calendar days before all-day and UTC timestamp strings',()=>{
 const rows=[event({id:'tuesday-all-day',allDay:true,start:'2026-11-10'}),event({id:'monday-evening',start:'2026-11-10T02:00:00Z'})];
 assert.deepEqual(searchPageEvents(rows,findSearchPage('this week'),new Date('2026-11-09T18:00:00Z')).map(e=>e.id),['monday-evening','tuesday-all-day']);
});

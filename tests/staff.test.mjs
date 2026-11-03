import test from 'node:test';
import assert from 'node:assert/strict';
import {STAFF_AREAS, staffArea, eventInStaffArea} from '../lib/staff.mjs';
import {autoVerifyArea, AUTO_VERIFIED_STAFF} from '../lib/staff-directory.mjs';

const event=overides=>({id:'x',title:'Listing',description:'',start:'2026-11-05T23:00:00.000Z',end:null,allDay:false,location:'',url:'',sourceId:'byu',sourceName:'BYU Events',category:'Campus life',tags:[],cancelled:false,sourceUpdated:null,...overides});

test('staff areas are unique and every area resolves',()=>{
 const ids=STAFF_AREAS.map(area=>area.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const area of STAFF_AREAS){assert.equal(staffArea(area.id)?.id,area.id);assert.ok(area.label);assert.ok(Array.isArray(area.sourceIds));}
 assert.equal(staffArea('not-an-area'),null);
});

test('a listing belongs to a staff area by source or by interest tag',()=>{
 // Source match: a law-school calendar listing.
 assert.equal(eventInStaffArea(event({sourceId:'law'}),'law'),true);
 // Community submissions match through their tags.
 assert.equal(eventInStaffArea(event({sourceId:'community',tags:['AIS']}),'marriott'),true);
 assert.equal(eventInStaffArea(event({sourceId:'community',tags:['Accounting']}),'marriott'),true);
 // Out-of-area source listings and tagless community listings never match.
 assert.equal(eventInStaffArea(event({sourceId:'law'}),'marriott'),false);
 assert.equal(eventInStaffArea(event({sourceId:'community',tags:['Clubs']}),'law'),false);
 assert.equal(eventInStaffArea(event({sourceId:'byu'}),'not-an-area'),false);
});

test('BYU staff areas cover the department feeds the calendar carries',()=>{
 // The area a professor would pick must own the feeds their events come from.
 assert.ok(staffArea('marriott').sourceIds.includes('ais'));
 assert.ok(staffArea('math').sourceIds.includes('acme'));
 assert.ok(staffArea('athletics').sourceIds.includes('byucougars'));
 assert.ok(staffArea('engineering').sourceIds.includes('engineering'));
});

test('the auto-allow directory matches byu.edu mailboxes to its published entries',()=>{
 // Exact published address, plain byu.edu form, and subdomain-listed local parts.
 assert.equal(autoVerifyArea('mike@cs.byu.edu'), 'computer-science');
 assert.equal(autoVerifyArea('mclain@byu.edu'), 'engineering');
 assert.equal(autoVerifyArea('asayc@byu.edu'), 'law'); // listed as asayc@law.byu.edu
 assert.equal(autoVerifyArea('nobody@byu.edu'), null);
 assert.equal(autoVerifyArea('nobody@law.byu.edu'), null);
 assert.ok(AUTO_VERIFIED_STAFF.size >= 150, 'the researched directory carries a real population');
});

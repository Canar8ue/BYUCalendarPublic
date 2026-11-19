import test from 'node:test';
import assert from 'node:assert/strict';
import {STAFF_AREAS, staffArea, eventInStaffArea} from '../lib/staff.mjs';
import {autoVerifyArea, AUTO_VERIFIED_STAFF} from '../lib/staff-directory.mjs';

const event = overides => ({
  id: 'x', title: 'Listing', description: '', start: '2026-11-05T23:00:00.000Z',
  end: null, allDay: false, location: '', url: '', sourceId: 'byu', sourceName: 'BYU Events',
  category: 'Campus life', tags: [], cancelled: false, sourceUpdated: null, ...overides,
});

const fixtureDirectory = new Map(Object.entries({
  'demo.cs@cs.byu.edu': 'computer-science',
  'demo.eng@byu.edu': 'engineering',
  'demo.law@law.byu.edu': 'law',
  'demo.marriott@byu.edu': 'marriott',
  'demo.kennedy@byu.edu': 'kennedy',
  'demo.life@byu.edu': 'life-sciences',
}));

test('staff areas are unique and every area resolves', () => {
  const ids = STAFF_AREAS.map(area => area.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const area of STAFF_AREAS) {
    assert.equal(staffArea(area.id)?.id, area.id);
    assert.ok(area.label);
    assert.ok(Array.isArray(area.sourceIds));
  }
  assert.equal(staffArea('not-an-area'), null);
});

test('a listing belongs to a staff area by source or by interest tag', () => {
  assert.equal(eventInStaffArea(event({sourceId: 'law'}), 'law'), true);
  assert.equal(eventInStaffArea(event({sourceId: 'community', tags: ['AIS']}), 'marriott'), true);
  assert.equal(eventInStaffArea(event({sourceId: 'community', tags: ['Accounting']}), 'marriott'), true);
  assert.equal(eventInStaffArea(event({sourceId: 'law'}), 'marriott'), false);
  assert.equal(eventInStaffArea(event({sourceId: 'byu', tags: ['AIS']}), 'marriott'), false);
  assert.equal(eventInStaffArea(event({sourceId: 'byu', communityTags: [{tag: 'AIS'}]}), 'marriott'), false);
  assert.equal(eventInStaffArea(event({sourceId: 'community', tags: ['Clubs']}), 'law'), false);
  assert.equal(eventInStaffArea(event({sourceId: 'byu'}), 'not-an-area'), false);
});

test('BYU staff areas cover the department feeds the calendar carries', () => {
  assert.ok(staffArea('marriott').sourceIds.includes('ais'));
  assert.ok(staffArea('math').sourceIds.includes('acme'));
  assert.ok(staffArea('athletics').sourceIds.includes('byucougars'));
  assert.ok(staffArea('engineering').sourceIds.includes('engineering'));
});

test('public repository bundles zero hardcoded personal BYU emails', () => {
  assert.equal(AUTO_VERIFIED_STAFF.size, 0);
});

test('auto-allow matching validates exact entries and strict @byu.edu subdomain matching only', () => {
  assert.equal(autoVerifyArea('demo.cs@cs.byu.edu', fixtureDirectory), 'computer-science');
  assert.equal(autoVerifyArea('demo.cs@byu.edu', fixtureDirectory), 'computer-science');
  assert.equal(autoVerifyArea('demo.eng@byu.edu', fixtureDirectory), 'engineering');
  assert.equal(autoVerifyArea('demo.law@byu.edu', fixtureDirectory), 'law');
  assert.equal(autoVerifyArea('demo.law@student.byu.edu', fixtureDirectory), null);
  assert.equal(autoVerifyArea('demo.law@other.byu.edu', fixtureDirectory), null);
  assert.equal(autoVerifyArea('nobody@byu.edu', fixtureDirectory), null);
});

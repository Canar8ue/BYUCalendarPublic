import test from 'node:test';
import assert from 'node:assert/strict';
import {listingInputDates, changeListingDateMode} from '../lib/community.mjs';

test('listing form dates use Mountain time and inclusive all-day last days', () => {
  assert.deepEqual(listingInputDates({allDay:false,start:'2026-11-12T01:00:00Z',end:'2026-11-12T03:00:00Z'}),{start:'2026-11-11T18:00',end:'2026-11-11T20:00'});
  assert.deepEqual(listingInputDates({allDay:true,start:'2026-11-11',end:'2026-11-14'}),{start:'2026-11-11',end:'2026-11-13'});
  assert.deepEqual(listingInputDates(),{start:'',end:''});
});

test('switching date modes preserves dates and midnight-exclusive ends', () => {
  assert.deepEqual(changeListingDateMode({start:'2026-11-11T18:00',end:'2026-11-12T00:00'},true),{start:'2026-11-11',end:'2026-11-11'});
  assert.deepEqual(changeListingDateMode({start:'2026-11-11',end:'2026-11-11'},false),{start:'2026-11-11T00:00',end:'2026-11-12T00:00'});
  assert.deepEqual(changeListingDateMode({start:'',end:''},true),{start:'',end:''});
  assert.deepEqual(changeListingDateMode({start:'',end:''},false),{start:'',end:''});
});

test('mode conversions respect leap days, year rollover and unknown ends', () => {
  assert.deepEqual(changeListingDateMode({start:'2028-02-29',end:'2028-02-29'},false),{start:'2028-02-29T00:00',end:'2028-03-01T00:00'});
  assert.deepEqual(changeListingDateMode({start:'2026-12-31T18:00',end:'2027-01-01T00:00'},true),{start:'2026-12-31',end:'2026-12-31'});
  assert.deepEqual(changeListingDateMode({start:'2026-11-11T18:00',end:''},true),{start:'2026-11-11',end:''});
  assert.deepEqual(changeListingDateMode({start:'2026-11',end:'bad-date'},false),{start:'',end:''});
  assert.deepEqual(changeListingDateMode({start:'2026-11-11T18:00',end:'badT00:00'},true),{start:'2026-11-11',end:''});
});

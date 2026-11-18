import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDays, campusDate, readCalendarLocation} from '../lib/calendar-view.mjs';
import {createPreferenceQueue} from '../lib/preference-queue.mjs';
import {parseSearch, matchesEvent} from '../lib/search.mjs';
import {parseICS} from '../lib/catalog.mjs';
import {takeMeThereUrl} from '../lib/campus-map.mjs';
import {feedToken, verifyFeedToken} from '../lib/feed.mjs';

test('shared links restore every calendar view and discard unknown filter values', () => {
  for (const view of ['week', 'month', 'list', 'map']) assert.equal(readCalendarLocation('?view=' + view).view, view);
  assert.deepEqual(readCalendarLocation('?view=bad&categories=Academic,bad,Academic&tags=AIS,Snacks,bad,AIS&q=hello'), {
    view: 'list', categories: ['Academic'], tags: ['AIS', 'Snacks'], query: 'hello',
  });
  assert.equal(readCalendarLocation('?q=' + 'a'.repeat(1000)).query.length, 500);
  assert.deepEqual(readCalendarLocation('?tags=RSVP+%2F+tickets').tags, ['RSVP / tickets']);
});

test('week and month grids share Sunday-first dates across month, year and leap boundaries', () => {
  for (const day of ['2026-11-01', '2026-12-31', '2027-01-01', '2028-02-29']) {
    const anchor = new Date(day + 'T12:00:00');
    const days = calendarDays(anchor, 'week');
    assert.equal(days.length, 7);
    assert.equal(days[0].date.getDay(), 0);
    assert.equal(days[6].date.getDay(), 6);
    assert.ok(days.some(entry => entry.key === day));
    assert.equal(calendarDays(anchor, 'month').length, 42);
    assert.equal(calendarDays(anchor, 'month')[0].date.getDay(), 0);
  }
  assert.deepEqual(calendarDays(new Date('2026-11-01T12:00:00'), 'week').map(entry => entry.key),
    ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
});

test('month searches and the visible current period use the Denver date at UTC boundaries', () => {
  for (const [instant, first, end] of [
    ['2026-11-01T01:00:00Z', '2026-10-31', '2026-10-31'],
    ['2027-01-01T02:00:00Z', '2026-12-31', '2026-12-31'],
    ['2028-03-01T01:00:00Z', '2028-02-29', '2028-02-29'],
  ]) {
    const now = new Date(instant), intent = parseSearch('this month', now), anchor = campusDate(now);
    assert.equal(intent.start, first);
    assert.equal(intent.end, end);
    assert.equal(anchor.getMonth() + 1, Number(first.slice(5, 7)));
    assert.equal(anchor.getDate(), Number(first.slice(8)));
  }
});

test('after-hour searches exclude unknown TBA times instead of matching their placeholder', () => {
  const event = {title: 'Game', start: '2026-11-11T02:00:00Z', allDay: false, tags: [], description: '', location: ''};
  assert.equal(matchesEvent(event, 'after 5 pm'), true);
  assert.equal(matchesEvent({...event, timeTba: true}, 'after 5 pm'), false);
});

test('floating ICS start and end both inherit the calendar timezone', () => {
  const raw = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-TIMEZONE:America/New_York', 'BEGIN:VEVENT', 'UID:floating', 'SUMMARY:Workshop', 'DTSTART:20261112T090000', 'DTEND:20261112T100000', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const [event] = parseICS(raw, {id: 'test', name: 'Test', url: 'https://example.com'}, new Date('2026-11-10T12:00:00Z'));
  assert.equal(event.start, '2026-11-12T14:00:00.000Z');
  assert.equal(event.end, '2026-11-12T15:00:00.000Z');
});

test('out-of-town directions preserve the published address on Google and Apple Maps', () => {
  for (const address of ['Rome, GA', 'Boulder, Colorado / CU Events Center', 'Springville, UT 84663', 'Spanish Fork Library (80 S Main St, Spanish Fork, UT 84660, United States)']) {
    const google = new URL(takeMeThereUrl({location: address}, 'Windows'));
    const apple = new URL(takeMeThereUrl({location: address}, 'iPhone'));
    assert.equal(google.searchParams.get('destination'), address);
    assert.equal(apple.searchParams.get('daddr'), address);
  }
});

test('a personal feed token rejects extra trailing segments', async () => {
  const token = await feedToken('member', 'test-secret');
  assert.equal(await verifyFeedToken(token, 'test-secret'), 'member');
  for (const suffix of ['.extra', '.', '..']) assert.equal(await verifyFeedToken(token + suffix, 'test-secret'), null);
});

test('overlapping saves wait for acknowledgement and retain both changes', async () => {
  let state = {saved: [], views: []}, release;
  const gate = new Promise(resolve => {release = resolve;});
  const writes = [];
  const queue = createPreferenceQueue(() => state, async next => {
    writes.push(next);
    if (writes.length === 1) await gate;
    state = next;
    return next;
  });
  const first = queue(current => ({...current, saved: [...current.saved, 'one']}));
  const second = queue(current => ({...current, saved: [...current.saved, 'two']}));
  const third = queue(current => ({...current, views: ['my-filter']}));
  await Promise.resolve();
  assert.equal(writes.length, 1);
  release();
  await Promise.all([first, second, third]);
  assert.deepEqual(state, {saved: ['one', 'two'], views: ['my-filter']});
});

test('a failed save does not commit state or prevent the next save', async () => {
  let state = [], attempt = 0;
  const queue = createPreferenceQueue(() => state, async next => {
    if (++attempt === 1) throw new Error('Service unavailable');
    state = next;
  });
  const first = queue(current => [...current, 'failed']);
  const second = queue(current => [...current, 'kept']);
  await assert.rejects(first, /Service unavailable/);
  await second;
  assert.deepEqual(state, ['kept']);
});

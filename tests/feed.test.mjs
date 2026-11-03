// Live calendar subscription rules: the public feed mirrors the on-screen
// filters, the personal feed is authenticated by a signed token instead of a
// session, and every document uses stable UIDs so a refresh updates events
// instead of duplicating them in the subscriber's calendar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  feedFilter, feedSearch, feedSummary, feedEvents, savedFeedEvents,
  buildCalendarFeed, feedToken, verifyFeedToken, FEED_EVENT_CAP,
} from '../lib/feed.mjs';

const base = {description: '', location: 'WSC 201', url: 'https://byu.edu/event', allDay: false, cancelled: false, end: null, tags: [], sourceId: 'byu', sourceName: 'BYU Events', category: 'Campus life', sourceUpdated: null};
const event = overrides => ({...base, id: 'byu:test', title: 'Test event', start: '2026-11-04T19:00:00.000Z', ...overrides});
const now = new Date('2026-11-01T18:00:00.000Z');
const params = query => new URLSearchParams(query);

test('the feed filter accepts only known vocabulary and survives junk', () => {
  const filter = feedFilter(params('q=free%20food&categories=Campus%20life,Fake%20category&tags=IS,Food%20provided,Not%20a%20tag'));
  assert.equal(filter.query, 'free food');
  assert.deepEqual(filter.categories, ['Campus life']);
  assert.deepEqual(filter.tags, ['IS', 'Food provided']);
  const empty = feedFilter(params(''));
  assert.deepEqual(empty, {query: '', categories: [], tags: []});
  // Control characters are stripped from a hand-edited query rather than folded.
  assert.equal(feedFilter(params('q=a%00b')).query, 'ab');
  assert.equal(feedFilter(params('q=' + 'x'.repeat(400))).query.length, 200);
});

test('the canonical feed link round-trips through the same parser the route uses', () => {
  const filter = {query: 'IS networking', categories: ['Career & business'], tags: ['IS', 'In person']};
  const search = feedSearch(filter);
  assert.deepEqual(feedFilter(params(search)), filter);
  assert.equal(feedSearch({query: '', categories: [], tags: []}), '');
});

test('the feed name collapses IS and AIS the way the filter bar does', () => {
  assert.equal(feedSummary({query: '', categories: [], tags: []}), '');
  assert.equal(feedSummary({query: '', categories: [], tags: ['IS', 'AIS']}), 'IS / AIS');
  assert.equal(feedSummary({query: '', categories: ['Campus life'], tags: ['AIS']}), 'Campus life · IS / AIS');
  assert.equal(feedSummary({query: 'this week', categories: [], tags: ['Clubs', 'AIS', 'AIS']}), 'this week · Clubs · IS / AIS');
});

test('the public feed mirrors filters and rolls its window forward', () => {
  const events = [
    event({id: 'past', title: 'Last month', start: '2026-09-01T19:00:00.000Z'}),
    event({id: 'yesterday', title: 'Yesterday', start: '2026-10-31T19:00:00.000Z'}),
    event({id: 'today', title: 'Career night', start: '2026-11-01T19:00:00.000Z', tags: ['IS', 'Clubs'], category: 'Career & business'}),
    event({id: 'future', title: 'Free pizza social', start: '2026-11-05T19:00:00.000Z', tags: ['Food provided']}),
  ];
  const all = feedEvents(events, feedFilter(params('')), now).map(e => e.id);
  // Yesterday is kept so a feed fetched just after midnight still shows it;
  // anything older has left the rolling window.
  assert.deepEqual(all, ['yesterday', 'today', 'future']);
  const career = feedEvents(events, feedFilter(params('categories=Career%20%26%20business')), now).map(e => e.id);
  assert.deepEqual(career, ['today']);
  const food = feedEvents(events, feedFilter(params('q=free%20food')), now).map(e => e.id);
  assert.deepEqual(food, ['future']);
  const tag = feedEvents(events, feedFilter(params('tags=IS')), now).map(e => e.id);
  assert.deepEqual(tag, ['today']);
});

test('the public feed is bounded so one huge source cannot produce an endless document', () => {
  const events = Array.from({length: FEED_EVENT_CAP + 60}, (_, index) => event({id: 'byu:' + index, start: '2026-12-01T19:00:00.000Z'}));
  assert.equal(feedEvents(events, feedFilter(params('')), now).length, FEED_EVENT_CAP);
});

test('a feed document carries the hints calendar apps use to poll it', () => {
  const ics = buildCalendarFeed([event({id: 'byu:123', title: 'Career night'})], {name: 'BYU Calendar — Career & business', description: 'Live subscription', origin: 'https://byucalendar.com', now});
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /X-WR-CALNAME:BYU Calendar — Career & business/);
  assert.match(ics, /X-WR-CALDESC:Live subscription/);
  assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
  assert.match(ics, /X-PUBLISHED-TTL:PT1H/);
  assert.match(ics, /BEGIN:VEVENT\r\nUID:byu:123@byu-calendar\r\nDTSTAMP:20261101T180000Z/);
  assert.match(ics, /DTSTART:20261104T190000Z/);
  assert.match(ics, /SUMMARY:Career night/);
  assert.match(ics, /END:VEVENT\r\nEND:VCALENDAR/);
});

test('the UID is the event id, so a refresh updates instead of duplicating', () => {
  const first = buildCalendarFeed([event({id: 'byu:stable'})], {now});
  const second = buildCalendarFeed([event({id: 'byu:stable', title: 'Renamed', sourceUpdated: '2026-11-02T12:00:00.000Z'})], {now: new Date('2026-11-02T12:05:00Z')});
  assert.equal(first.match(/UID:([^\r]+)/)[1], second.match(/UID:([^\r]+)/)[1]);
  assert.match(second, /LAST-MODIFIED:20261102T120000Z/);
  assert.match(second, /SEQUENCE:0/);
  // An unparsable source timestamp is omitted rather than written as garbage.
  assert.doesNotMatch(buildCalendarFeed([event({sourceUpdated: 'not-a-date'})], {now}), /LAST-MODIFIED/);
});

test('cancellations reach subscribers instead of quietly disappearing', () => {
  const ics = buildCalendarFeed([event({id: 'byu:cancelled', cancelled: true, title: 'Cancelled club night'})], {now});
  assert.match(ics, /SUMMARY:Cancelled club night/);
  assert.match(ics, /STATUS:CANCELLED/);
});

test('feed text is escaped and folded at the 75-octet line limit', () => {
  const ics = buildCalendarFeed([event({
    id: 'byu:escape',
    title: 'Workshop, part 1; bring notes',
    description: 'Line one\r\nLine two ' + 'very long '.repeat(30),
    location: 'HBLL, Room 2230',
  })], {now});
  assert.match(ics, /SUMMARY:Workshop\\, part 1\\; bring notes/);
  assert.match(ics, /DESCRIPTION:Line one\\nLine two/);
  assert.match(ics, /LOCATION:HBLL\\, Room 2230/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'line over 75 octets: ' + line.slice(0, 40));
  // Continuation lines begin with a single space, per RFC 5545.
  assert.ok(ics.split('\r\n').some(line => line.startsWith(' ') && line.trim().length > 0));
});

test('an all-day event keeps a date-only value and exclusive end', () => {
  const ics = buildCalendarFeed([event({id: 'byu:all-day', allDay: true, start: '2026-11-04', end: '2026-11-07'})], {now});
  assert.match(ics, /DTSTART;VALUE=DATE:20261104/);
  assert.match(ics, /DTEND;VALUE=DATE:20261107/);
});

test('the personal feed lists saved events by id and drops ids that no longer resolve', () => {
  const events = [
    event({id: 'a', start: '2026-11-05T19:00:00.000Z'}),
    event({id: 'b', start: '2026-11-02T19:00:00.000Z'}),
    event({id: 'old', start: '2026-01-02T19:00:00.000Z'}),
  ];
  const listed = savedFeedEvents(events, ['a', 'missing', 'b', 'old'], now).map(e => e.id);
  assert.deepEqual(listed, ['b', 'a']);
});

test('the personal subscription token round-trips and rejects tampering', async () => {
  const secret = 'a-test-secret-that-is-at-least-32-characters-long';
  const token = await feedToken('user-123', secret);
  assert.equal(await verifyFeedToken(token, secret), 'user-123');
  assert.equal(await verifyFeedToken(token, 'another-secret-that-is-at-least-32-chars'), null);
  const [payload] = token.split('.');
  const forged = (await feedToken('user-999', secret)).split('.')[1];
  assert.equal(await verifyFeedToken(payload + '.' + forged, secret), null, 'payload and signature must match');
  assert.equal(await verifyFeedToken(token.slice(0, -2), secret), null);
  assert.equal(await verifyFeedToken('', secret), null);
  assert.equal(await verifyFeedToken('not-a-token', secret), null);
  assert.equal(await verifyFeedToken(null, secret), null);
  assert.equal(await verifyFeedToken('a.'.repeat(400), secret), null);
});

test('the token never contains the raw user id', async () => {
  const token = await feedToken('user-123', 'a-test-secret-that-is-at-least-32-characters-long');
  assert.ok(!token.includes('user-123'));
});

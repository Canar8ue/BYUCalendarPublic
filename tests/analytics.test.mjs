// Aggregate usage-analytics unit and D1 tests (isolated database).
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {isBot, deviceClass, cleanReferrer, normalizeAnalyticsEvents, recordAnalytics, analyticsSummary, ANALYTICS_RETENTION_DAYS} from '../lib/analytics.mjs';

let mf, db;
before(async () => {
  mf = new Miniflare({modules: true, script: 'export default {fetch(){return new Response("test");}}', compatibilityDate: '2026-05-01', d1Databases: ['DB']});
  db = await mf.getD1Database('DB');
  for (const file of ['0000_pink_scarlet_spider.sql', '0001_byu_accounts_community.sql', '0002_moderator_inbox.sql', '0003_usage_analytics.sql']) {
    const statements = readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '').split(';').map(s => s.trim()).filter(Boolean);
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
});
after(async () => { await mf?.dispose(); });

test('bot user agents are recognized without catching real browsers', () => {
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'python-requests/2.31', 'curl/8.0', 'HeadlessChrome/120', 'bingpreview']) assert.ok(isBot(ua), ua);
  for (const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', 'Mozilla/5.0 (Linux; Android 14; Pixel 8)']) assert.ok(!isBot(ua), ua);
});

test('devices fall into desktop, mobile, and tablet classes', () => {
  assert.equal(deviceClass('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'mobile');
  assert.equal(deviceClass('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'mobile');
  assert.equal(deviceClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop');
});

test('referrer normalization keeps only external hosts', () => {
  assert.equal(cleanReferrer('https://byucalendar.com/?q=clubs', 'byucalendar.com'), '');
  assert.equal(cleanReferrer('https://www.google.com/search?q=byu+calendar', 'byucalendar.com'), 'google.com');
  assert.equal(cleanReferrer('not a url', 'byucalendar.com'), '');
  assert.equal(cleanReferrer('', 'byucalendar.com'), '');
});

test('client events are validated, clipped, and capped before storage', () => {
  const rows = normalizeAnalyticsEvents([
    {type: 'view', name: '/'},
    {type: 'search', name: 'x'.repeat(400), detail: '0'},
    {type: 'event_view', name: 'byu-123', detail: 'byu'},
    {type: 'nonsense', name: 'evil'},
    null,
    {type: 'save'},
    {type: 'view_switch', detail: 'map'},
  ], {country: 'us', device: 'mobile', referrer: 'google.com'});
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => r.type), ['view', 'search', 'event_view', 'view_switch']);
  assert.equal(rows[1].name.length, 120);
  assert.equal(rows[1].country, 'US');
  assert.equal(rows[1].device, 'mobile');
  assert.equal(rows[1].referrer, 'google.com');
  const capped = normalizeAnalyticsEvents(Array.from({length: 40}, (_, i) => ({type: 'view', name: '/' + i})), {});
  assert.equal(capped.length, 24);
});

test('recordAnalytics stores rows under Denver day keys and expires old rows', async () => {
  const now = new Date('2026-09-18T20:00:00Z'); // 2:00 PM Denver
  const count = await recordAnalytics(db, [
    {type: 'view', name: '/', country: 'US', device: 'desktop', referrer: null},
    {type: 'search', name: 'free food', detail: '0', country: 'US', device: 'desktop', referrer: null},
  ], now);
  assert.equal(count, 2);
  const stored = await db.prepare("SELECT ts,day,type,name,detail FROM analytics_events ORDER BY type").all();
  assert.equal(stored.results.length, 2);
  assert.equal(stored.results[0].day, '2026-09-18');
  // A row past the retention horizon disappears on the next write.
  await db.prepare("INSERT INTO analytics_events (ts,day,type,name) VALUES ('2020-01-01T00:00:00Z','2020-01-01','view','/old')").run();
  await recordAnalytics(db, [{type: 'view', name: '/events/x'}], new Date(now.getTime() + 2 * 3600000));
  const remaining = await db.prepare('SELECT COUNT(*) AS n FROM analytics_events').first();
  assert.equal(remaining.n, 3);
  const horizon = await db.prepare('SELECT COUNT(*) AS n FROM analytics_events WHERE day<?').bind(new Date(now.getTime() - ANALYTICS_RETENTION_DAYS * 86400000).toISOString().slice(0, 10)).first();
  assert.equal(horizon.n, 0);
});

test('analyticsSummary aggregates traffic, zero-result searches, inventory, and community counts', async () => {
  const now = new Date('2026-09-18T20:00:00Z');
  await db.prepare('DELETE FROM analytics_events').run();
  const day = n => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
  const insert = (d, type, name, detail) => db.prepare('INSERT INTO analytics_events (ts,day,type,name,detail,country,device,referrer) VALUES (?,?,?,?,?,?,?,?)').bind(d + 'T12:00:00Z', d, type, name || '', detail || null, 'US', 'mobile', 'reddit.com').run();
  await insert(day(2), 'view', '/');
  await insert(day(2), 'view', '/events/abc');
  await insert(day(2), 'view', '/events/abc');
  await insert(day(1), 'search', 'free food', '5');
  await insert(day(1), 'search', 'free food', '0');
  await insert(day(1), 'search', 'ais slack', '0');
  await insert(day(1), 'event_view', 'abc', 'byu');
  await insert(day(1), 'export', null, 'single');
  await insert(day(40), 'view', '/ancient'); // outside the 30-day window
  await db.prepare("INSERT INTO auth_user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('u1','A','a@byu.edu',1,0,0)").run();
  await db.prepare("INSERT INTO auth_user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('u2','B','b@byu.edu',0,0,0)").run();
  await db.prepare("INSERT INTO community_listings (id,user_id,payload,created_at) VALUES ('c1','u1','{}','2026-09-01T00:00:00Z')").run();
  await db.prepare("INSERT INTO listing_reports (id,event_id,user_id,reason,details,event_snapshot,status,created_at) VALUES ('r1','abc','u1','Wrong details','x','{}','open','2026-09-01T00:00:00Z')").run();
  const calendar = {
    events: [
      {id: 'abc', title: 'Pizza social', start: '2026-09-20T01:00:00.000Z', end: null, allDay: false, location: 'TNRB 110', cancelled: false, category: 'Campus life', tags: ['Food provided', 'Clubs']},
      {id: 'def', title: 'Old event', start: '2026-08-01T01:00:00.000Z', end: null, allDay: false, location: '', cancelled: false, category: 'Academic', tags: []},
      {id: 'ghi', title: 'Cancelled fair', start: '2026-09-22T01:00:00.000Z', end: null, allDay: false, location: 'WSC', cancelled: true, category: 'Career & business', tags: []},
    ],
    sources: [{id: 'byu', name: 'BYU Events', url: 'https://calendar.byu.edu', count: 2, lastSuccess: '2026-09-18T00:00:00Z', error: null, enabled: true}],
  };
  const summary = await analyticsSummary(db, calendar, now);
  assert.equal(summary.days.length, 30);
  assert.equal(summary.totals.views30, 3);
  assert.ok(summary.totals.views7 <= summary.totals.views30);
  assert.equal(summary.totals.searches30, 3);
  assert.equal(summary.totals.exports30, 1);
  assert.equal(summary.topPages[0].name, '/events/abc');
  assert.equal(summary.topPages[0].count, 2);
  const freeFood = summary.topSearches.find(s => s.name === 'free food');
  assert.equal(freeFood.count, 2);
  assert.equal(freeFood.zeros, 1);
  assert.ok(summary.zeroResultSearches.some(s => s.name === 'ais slack'));
  assert.deepEqual(summary.referrers, [{name: 'reddit.com', count: 3}]);
  assert.equal(summary.inventory.upcomingEvents, 1); // cancelled and past events excluded
  assert.equal(summary.inventory.totalEvents, 3);
  assert.equal(summary.inventory.byCategory[0].name, 'Campus life');
  assert.deepEqual(summary.inventory.topTags[0], {name: 'Food provided', count: 1});
  assert.equal(summary.inventory.nextDays.length, 14);
  assert.equal(summary.community.accountsTotal, 2);
  assert.equal(summary.community.accountsVerified, 1);
  assert.equal(summary.community.listings, 1);
  assert.equal(summary.community.reportsOpen, 1);
});

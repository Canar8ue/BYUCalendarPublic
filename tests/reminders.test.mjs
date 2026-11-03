// Domain rules for the daily digest: dispatch window, event selection, email
// rendering, and the signed unsubscribe token. No Worker runtime needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {digestWindow, selectDigestEvents, digestTimeLabel, digestDayLabel, buildDigestEmail, unsubscribeToken, verifyUnsubscribeToken} from '../lib/reminders.mjs';

const day = '2026-09-29';
const now = new Date('2026-09-29T13:00:00Z'); // 7:00 AM MDT
const base = {description: '', location: 'TNRB 260', url: 'https://byu.edu', allDay: false, cancelled: false, end: null, tags: []};
const event = overrides => ({...base, id: 'byu:test', title: 'Test event', start: '2026-09-29T17:00:00.000Z', ...overrides});

test('the digest window opens at 7:00 AM Mountain and closes before 10:00 AM, across DST', () => {
  assert.deepEqual(digestWindow(new Date('2026-09-28T12:59:00Z')), {day: '2026-09-28', hour: 6, active: false});
  assert.deepEqual(digestWindow(new Date('2026-09-28T13:00:00Z')), {day: '2026-09-28', hour: 7, active: true});
  assert.deepEqual(digestWindow(new Date('2026-09-28T15:59:00Z')).active, true);
  assert.deepEqual(digestWindow(new Date('2026-09-28T16:00:00Z')).active, false);
  assert.deepEqual(digestWindow(new Date('2026-01-15T14:00:00Z')), {day: '2026-01-15', hour: 7, active: true});
});

test('selection keeps only saved events still happening on the digest day', () => {
  const events = [
    event({id: 'byu:missing', title: 'Not saved', start: '2026-09-29T18:00:00.000Z'}),
    event({id: 'byu:tomorrow', title: 'Tomorrow', start: '2026-09-30T17:00:00.000Z'}),
    event({id: 'byu:ended', title: 'Already over', start: '2026-09-29T12:00:00.000Z', end: '2026-09-29T12:30:00.000Z'}),
    event({id: 'byu:cancelled', title: 'Cancelled meetup', start: '2026-09-29T19:00:00.000Z', cancelled: true}),
    event({id: 'byu:later', title: 'Evening session', start: '2026-09-29T23:00:00.000Z'}),
    event({id: 'byu:ongoing', title: 'Morning workshop', start: '2026-09-29T14:00:00.000Z', end: '2026-09-29T16:30:00.000Z'}),
    event({id: 'byu:allday', title: 'All-day fair', start: '2026-09-29', allDay: true}),
    event({id: 'byu:spanning', title: 'Multi-day festival', start: '2026-09-28', end: '2026-09-30', allDay: true}),
  ];
  const saved = ['byu:gone', 'byu:tomorrow', 'byu:ended', 'byu:cancelled', 'byu:later', 'byu:ongoing', 'byu:allday', 'byu:spanning'];
  const picked = selectDigestEvents(events, saved, day, now);
  assert.deepEqual(picked.map(e => e.id), ['byu:spanning', 'byu:allday', 'byu:ongoing', 'byu:later']);
  assert.deepEqual(selectDigestEvents(events, [], day, now), []);
});

test('time labels use Mountain Time and all-day events stay worded plainly', () => {
  assert.equal(digestTimeLabel(event({start: '2026-09-29T17:00:00.000Z', end: '2026-09-29T18:30:00.000Z'})), '11:00 AM–12:30 PM');
  assert.equal(digestTimeLabel(event({start: '2026-09-29T17:00:00.000Z'})), '11:00 AM');
  assert.equal(digestTimeLabel(event({allDay: true, start: day})), 'All day');
  assert.equal(digestDayLabel(day), 'Tuesday, September 29');
});

test('the digest email renders plain and HTML versions with escaped source text', () => {
  const email = buildDigestEmail({
    name: 'Casey Morgan', day,
    events: [
      event({id: 'byu:one', title: 'AIS weekly meeting', start: '2026-09-29T17:00:00.000Z'}),
      event({id: 'byu:two', title: '<script>alert("x")</script> Social', location: 'WSC "Garden" Court', start: '2026-09-29T18:00:00.000Z'}),
    ],
    unsubscribeUrl: 'https://byucalendar.com/api/reminders/unsubscribe?u=abc&t=token',
    origin: 'https://byucalendar.com',
  });
  assert.equal(email.subject, 'BYU Calendar: your saved events for Tuesday, September 29');
  assert.ok(email.text.includes('Hi Casey,'), email.text);
  assert.ok(email.text.includes('You saved 2 events on BYU Calendar for Tuesday, September 29'));
  assert.ok(email.text.includes('11:00 AM'), email.text);
  assert.ok(email.text.includes('AIS weekly meeting\n  11:00 AM · TNRB 260\n  https://byucalendar.com/events/byu%3Aone'));
  assert.ok(email.text.includes('Unsubscribe: https://byucalendar.com/api/reminders/unsubscribe?u=abc&t=token'));
  assert.ok(email.html.includes('&lt;script&gt;'), email.html);
  assert.ok(!email.html.includes('<script>'), email.html);
  assert.ok(email.html.includes('WSC &quot;Garden&quot; Court'), email.html);
  assert.ok(email.html.includes('unsubscribe?u=abc&t=token'), email.html);
  const single = buildDigestEmail({name: '', day, events: [event({id: 'byu:one', title: 'Only one'})], unsubscribeUrl: 'https://byucalendar.com/x'});
  assert.ok(single.text.includes('You saved an event on BYU Calendar'), single.text);
  assert.ok(single.text.startsWith('Hi there,'), single.text);
});

test('unsubscribe tokens are URL-safe HMACs that reject tampering', async () => {
  const token = await unsubscribeToken('user-123', 'test-secret-value-at-least-32-chars-long!');
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.ok(await verifyUnsubscribeToken('user-123', token, 'test-secret-value-at-least-32-chars-long!'));
  assert.equal(await verifyUnsubscribeToken('user-123', 'x'.repeat(token.length), 'test-secret-value-at-least-32-chars-long!'), false);
  assert.equal(await verifyUnsubscribeToken('user-999', token, 'test-secret-value-at-least-32-chars-long!'), false);
  assert.equal(await verifyUnsubscribeToken('user-123', token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'), 'test-secret-value-at-least-32-chars-long!'), false);
  assert.equal(await verifyUnsubscribeToken('user-123', 'short', 'test-secret-value-at-least-32-chars-long!'), false);
  assert.equal(await verifyUnsubscribeToken('user-123', token, 'another-secret-value-at-least-32-chars!!'), false);
});

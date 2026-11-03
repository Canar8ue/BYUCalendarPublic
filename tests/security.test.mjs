import test from 'node:test';
import assert from 'node:assert/strict';
import ICAL from 'ical.js';
import {remoteText} from '../lib/source-import.mjs';
import {safeUrl} from '../lib/catalog.mjs';
import {exportICS} from '../lib/search.mjs';
import {readJSON, requireRefreshOrigin} from '../lib/http.mjs';

test('refresh accepts only the exact public origin — browsers and the header-carrying cron — and rejects everything else', () => {
  const origin = 'https://byucalendar.com';
  const request = headers => new Request('http://byucalendar.com/api/refresh', {method: 'POST', headers});
  assert.doesNotThrow(() => requireRefreshOrigin(request({origin, 'sec-fetch-site': 'same-origin'}), origin));
  assert.doesNotThrow(() => requireRefreshOrigin(request({origin}), origin)); // server cron sends the origin explicitly
  for (const headers of [
    {}, // headerless scripts must not trigger refreshes
    {origin: 'https://evil.example', 'sec-fetch-site': 'same-origin'},
    {origin: 'https://untrusted.byucalendar.com', 'sec-fetch-site': 'same-site'},
    {origin: 'null'}, {origin: 'not a URL'}, {origin: ''},
    {origin: 'http://byucalendar.com'},
    {'sec-fetch-site': 'cross-site'}, {'sec-fetch-site': 'same-site'},
    {origin, 'sec-fetch-site': 'cross-site'},
  ]) assert.throws(() => requireRefreshOrigin(request(headers), origin), error => error.status === 403, JSON.stringify(headers));
});

test('source redirects cannot connect to another origin, downgrade TLS, or include credentials', async t => {
  const calls = [];
  let destination;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    return new Response('', {status: 302, headers: {location: destination}});
  });
  for (destination of ['http://127.0.0.1:8788/api/account', 'http://169.254.169.254/latest/meta-data/', 'https://evil.example/feed', '//evil.example/feed', 'http://calendar.byu.edu/feed', 'https://user:password@calendar.byu.edu/feed']) {
    calls.length = 0;
    await assert.rejects(remoteText('https://calendar.byu.edu/start'), /redirect/);
    assert.deepEqual(calls, ['https://calendar.byu.edu/start']);
  }
});

test('source downloads allow bounded same-origin redirects and cancel rejected responses', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(url);
    return calls.length === 1 ? new Response('', {status: 307, headers: {location: '/calendar.ics'}}) : new Response('calendar data');
  });
  assert.equal(await remoteText('https://calendar.byu.edu/start'), 'calendar data');
  assert.deepEqual(calls, ['https://calendar.byu.edu/start', 'https://calendar.byu.edu/calendar.ics']);
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({cancel() {cancelled = true;}}), {headers: {'content-length': '8000001'}});
  await assert.rejects(remoteText('https://calendar.byu.edu/start'), /too large/);
  assert.equal(cancelled, true);
  calls.length = 0;
  globalThis.fetch = async url => {calls.push(url); return new Response('', {status: 302, headers: {location: '/loop'}});};
  await assert.rejects(remoteText('https://calendar.byu.edu/start'), /redirect limit/);
  assert.equal(calls.length, 6);
});

test('source and request size limits also apply when content-length is absent or incorrect', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) {controller.enqueue(new Uint8Array(8_000_001));},
    cancel() {cancelled = true;},
  }), {headers: {'content-length': '1'}}));
  await assert.rejects(remoteText('https://calendar.byu.edu/start'), /too large/);
  assert.equal(cancelled, true);
  for (const headers of [{'Content-Type': 'application/json'}, {'Content-Type': 'application/json', 'Content-Length': '1'}]) {
    await assert.rejects(readJSON(new Request('https://byucalendar.com/api/listings', {method: 'POST', headers, body: JSON.stringify({description: 'a'.repeat(100)})}), 50), error => error.status === 413);
  }
});

test('calendar export keeps CR/LF payloads inside text and excludes unsafe URL fields', () => {
  const event = {id: 'test\rUID:forged', title: 'Title\r\nATTENDEE:forged', description: 'Details\rBEGIN:VALARM\nACTION:DISPLAY', location: 'WSC\rLOCATION:elsewhere', start: '2026-10-01T18:00:00.000Z', allDay: false, url: 'https://example.com/\r\nBEGIN:VALARM'};
  const output = exportICS([event]);
  assert.equal(output.replaceAll('\r\n', '').includes('\r'), false);
  const calendar = new ICAL.Component(ICAL.parse(output));
  const events = calendar.getAllSubcomponents('vevent');
  assert.equal(events.length, 1);
  assert.equal(events[0].getAllSubcomponents().length, 0);
  assert.equal(events[0].getAllProperties('attendee').length, 0);
  assert.equal(events[0].getAllProperties('uid').length, 1);
  assert.equal(events[0].getFirstPropertyValue('description'), event.description.replace(/\r/g, '\n'));
  assert.equal(events[0].getFirstPropertyValue('url'), null);
  assert.throws(() => exportICS([{...event, start: '2026-10-01T18:00:00Z\r\nATTENDEE:forged'}]), /export date/);
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.com/', 'https://example.com/\r\nBEGIN:VEVENT']) assert.equal(safeUrl(url), '');
  assert.equal(safeUrl('https://calendar.byu.edu/event?q=1'), 'https://calendar.byu.edu/event?q=1');
});

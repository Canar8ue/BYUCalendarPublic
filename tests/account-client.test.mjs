import test from 'node:test';
import assert from 'node:assert/strict';
import {getJSON, postJSON} from '../app/account-client.ts';

test('default reads remain usable and explicit timeouts reach the request', async t => {
  const signals = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {signals.push(options.signal);return Response.json({ok: true});});
  assert.deepEqual(await getJSON('/api/events'), {ok: true});
  assert.equal(signals[0], undefined);
  await getJSON('/api/events', 5000);
  assert.ok(signals[1] instanceof AbortSignal);
  assert.equal(signals[1].aborted, false);
});

test('network timeouts and proxy error pages show useful retry messages', async t => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => {throw new DOMException('timed out', 'TimeoutError');});
  await assert.rejects(getJSON('/api/events', 5000), /Check your connection and try again/);
  await assert.rejects(postJSON('/api/preferences', {}), /may still complete/);
  mocked.mock.mockImplementation(async () => new Response('<html>Restarting</html>', {status: 503}));
  await assert.rejects(getJSON('/api/events'), /briefly unavailable/);
  await assert.rejects(postJSON('/api/preferences', {}), /briefly unavailable/);
});

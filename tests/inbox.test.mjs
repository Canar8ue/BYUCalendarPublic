// Moderator inbox domain rules: Svix webhook signature verification, inbound
// payload normalization, HTML-to-text extraction, and reply validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyWebhookSignature} from '../lib/webhook-sig.mjs';
import {normalizeInboundEmail, htmlToText, buildPreview, parseReadInput, parseReply, INBOX_BODY_LIMIT, INBOX_REPLY_LIMIT} from '../lib/inbox.mjs';

const SECRET = 'whsec_' + Buffer.from('unit-test-signing-secret-byucalendar').toString('base64');

function sign(secret, id, timestamp, payload) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return 'v1,' + createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
}

function signedHeaders(secret, payload, {id = 'msg_test_1', timestamp = String(Math.floor(Date.now() / 1000)), signature} = {}) {
  return new Headers({
    'svix-id': id, 'svix-timestamp': timestamp,
    'svix-signature': signature || sign(secret, id, timestamp, payload),
  });
}

test('webhook signatures accept valid Svix headers and reject tampering', async () => {
  const payload = JSON.stringify({type: 'email.received', data: {email_id: 'abc'}});
  assert.ok(await verifyWebhookSignature(SECRET, signedHeaders(SECRET, payload), payload));
  const second = sign(SECRET, 'msg_2', String(Math.floor(Date.now() / 1000)), payload);
  assert.ok(await verifyWebhookSignature(SECRET, signedHeaders(SECRET, payload, {id: 'msg_2', signature: `v1,bogussignature ${second}`}), payload), 'accepts v1 entries after an earlier signature');
  assert.equal(await verifyWebhookSignature(SECRET, signedHeaders(SECRET, payload), payload + ' '), false, 'tampered body');
  assert.equal(await verifyWebhookSignature('whsec_' + Buffer.from('another-secret').toString('base64'), signedHeaders(SECRET, payload), payload), false, 'wrong secret');
  assert.equal(await verifyWebhookSignature(SECRET, signedHeaders(SECRET, payload, {timestamp: String(Math.floor(Date.now() / 1000) - 3600)}), payload), false, 'stale timestamp');
  assert.equal(await verifyWebhookSignature(SECRET, new Headers({'svix-id': 'x'}), payload), false, 'missing headers');
  assert.equal(await verifyWebhookSignature('', signedHeaders(SECRET, payload), payload), false, 'unconfigured secret');
  assert.equal(await verifyWebhookSignature('whsec_!!!notbase64', signedHeaders(SECRET, payload), payload), false, 'undecodable secret');
});

test('inbound payloads are normalized and mail for other addresses is refused', () => {
  const inbox = 'privacy@byucalendar.com';
  const data = {email_id: 'Email-1', from: 'Citizen@Example.com ', to: ['someone@byucalendar.com', inbox], subject: '  Data \nrequest\r\n for BYU Calendar  ', message_id: '<msg-1@example.com>', created_at: '2026-09-17T12:00:00.000Z'};
  const record = normalizeInboundEmail(data, inbox);
  assert.ok(record);
  assert.equal(record.id, 'Email-1');
  assert.equal(record.fromAddress, 'citizen@example.com');
  assert.equal(record.subject, 'Data request for BYU Calendar');
  assert.equal(record.receivedAt, '2026-09-17T12:00:00.000Z');
  assert.equal(normalizeInboundEmail({...data, to: ['other@byucalendar.com']}, inbox), null, 'mail for other addresses is not stored');
  assert.equal(normalizeInboundEmail({...data, email_id: ''}, inbox), null, 'missing id');
  assert.equal(normalizeInboundEmail({...data, email_id: 'bad id!'}, inbox), null, 'unexpected id characters');
  assert.equal(normalizeInboundEmail({...data, from: 'not-an-email'}, inbox), null, 'invalid sender');
  assert.equal(normalizeInboundEmail(null, inbox), null);
  const fallback = normalizeInboundEmail({...data, created_at: 'not-a-date'}, inbox);
  assert.ok(!Number.isNaN(new Date(fallback.receivedAt).getTime()), 'unparsable dates fall back to now');
});

test('HTML bodies reduce to readable plain text', () => {
  const text = htmlToText('<html><head><style>p{color:red}</style></head><body><script>alert(1)</script><p>Hello there,</p><p> Please <b>delete</b> my data.<br>Thanks!</p><style>.x{}</style></body></html>');
  assert.ok(!text.includes('alert'), 'scripts are removed');
  assert.ok(!text.includes('color:red'), 'styles are removed');
  assert.match(text, /Hello there,\s*\n\s*Please delete my data\.\s*\n\s*Thanks!/);
  assert.equal(htmlToText('   '), '');
  assert.equal(htmlToText(null), '');
});

test('previews take the first non-empty line and respect the length bound', () => {
  assert.equal(buildPreview('  \n\nFirst real line.\nSecond line.'), 'First real line.');
  assert.equal(buildPreview('x'.repeat(500)), 'x'.repeat(160));
  assert.equal(buildPreview(''), '');
});

test('read and reply submissions are validated', () => {
  assert.deepEqual(parseReadInput({id: 'Email-1'}), {id: 'Email-1'});
  assert.throws(() => parseReadInput({id: ''}), /Check your submission/);
  assert.throws(() => parseReadInput({}), /Check your submission/);
  assert.deepEqual(parseReply({id: 'Email-1', body: '  On it.  '}), {id: 'Email-1', body: 'On it.'});
  assert.throws(() => parseReply({id: 'Email-1', body: '   '}), /Write a reply/);
  assert.throws(() => parseReply({id: 'Email-1', body: 'x'.repeat(INBOX_REPLY_LIMIT + 1)}), /under/);
  assert.throws(() => parseReply({body: 'hi'}), /Check your submission/);
  assert.ok(INBOX_BODY_LIMIT >= INBOX_REPLY_LIMIT);
});

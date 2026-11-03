import {env} from 'cloudflare:workers';
import {database} from '../db';
import {readAccount, authConfiguration} from './auth';
import {json, errorResponse, readJSON, readBodyText, requireSameOrigin, RequestError} from './http.mjs';
import {verifyWebhookSignature} from './webhook-sig.mjs';
import {normalizeInboundEmail, htmlToText, buildPreview, parseReadInput, parseReply, INBOX_BODY_LIMIT} from './inbox.mjs';
import {consumeQuota} from './community-store.mjs';
import type {AccountState} from '../app/types';

// The moderator inbox: mail sent to the public contact address arrives
// through Resend's inbound webhook and is answered from the same address.
// Receiving and replying both depend on configuration, so every path reports
// an honest "not configured" state instead of pretending.

const WEBHOOK_BODY_LIMIT = 262144;
const REPLY_DAILY_LIMIT = 20;

export function inboxConfiguration() {
  const address = (env.CALENDAR_INBOX_ADDRESS || 'privacy@byucalendar.com').trim().toLowerCase();
  const apiKey = env.RESEND_API_KEY || '';
  const secret = env.RESEND_INBOUND_SECRET || '';
  return {address, apiKey, secret, ready: Boolean(apiKey && secret)};
}

function requireInboxModerator(account: AccountState) {
  if (!account.user) throw new RequestError(401, 'Sign in with your BYU email to review messages.');
  if (!account.permissions.reviewReports) throw new RequestError(403, 'The message inbox is available to calendar administrators.');
  return account.user;
}

type InboxRow = Record<string, string | null>;

function serializeEmail(row: InboxRow, replies: InboxRow[]) {
  return {
    id: row.id, fromAddress: row.from_address, toAddress: row.to_address, subject: row.subject, preview: row.preview,
    bodyText: row.body_text, receivedAt: row.received_at, readAt: row.read_at, repliedAt: row.replied_at,
    replies: replies.map(reply => ({id: reply.id, toAddress: reply.to_address, subject: reply.subject, bodyText: reply.body_text, sentBy: reply.sent_by, sentAt: reply.sent_at})),
  };
}

async function listInbox(db: ReturnType<typeof database>) {
  const config = inboxConfiguration();
  if (!config.ready) return {configured: false, inboxAddress: config.address, emails: []};
  const [emails, replies] = await Promise.all([
    db.prepare('SELECT * FROM inbound_emails ORDER BY received_at DESC LIMIT 100').all(),
    db.prepare('SELECT * FROM email_replies ORDER BY sent_at').all(),
  ]);
  const byThread = new Map<string, InboxRow[]>();
  for (const reply of replies.results as InboxRow[]) {
    const list = byThread.get(reply.inbound_id as string) || [];
    list.push(reply);
    byThread.set(reply.inbound_id as string, list);
  }
  return {configured: true, inboxAddress: config.address, emails: (emails.results as InboxRow[]).map(row => serializeEmail(row, byThread.get(row.id as string) || []))};
}

async function markRead(db: ReturnType<typeof database>, input: unknown) {
  const data = parseReadInput(input);
  const result = await db.prepare('UPDATE inbound_emails SET read_at=COALESCE(read_at,?) WHERE id=?').bind(new Date().toISOString(), data.id).run();
  if (!result.meta.changes) throw new RequestError(404, 'That message is no longer in the inbox.');
  return {ok: true};
}

async function sendReply(db: ReturnType<typeof database>, user: NonNullable<AccountState['user']>, input: unknown) {
  const config = inboxConfiguration();
  if (!config.ready) throw new RequestError(503, 'The inbox is not connected yet.');
  const data = parseReply(input);
  const row = await db.prepare('SELECT * FROM inbound_emails WHERE id=?').bind(data.id).first() as InboxRow | null;
  if (!row || typeof row.from_address !== 'string') throw new RequestError(404, 'That message is no longer in the inbox.');
  if (!(await consumeQuota(db, `inbox-replies:${user.id}`, REPLY_DAILY_LIMIT, 86400))) {
    throw new RequestError(429, 'You have reached today’s reply limit. Please try again tomorrow.');
  }
  const subject = row.subject && String(row.subject).startsWith('Re:') ? String(row.subject) : `Re: ${row.subject || 'your message'}`;
  const text = `${data.body}\n\n—\nBYU Calendar · https://byucalendar.com\nIndependent student project, not an official BYU service.`;
  const headers = row.message_id ? {'In-Reply-To': row.message_id, 'References': row.message_id} : undefined;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: {Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({from: `BYU Calendar <${config.address}>`, to: [row.from_address], subject, text, ...(headers ? {headers} : {})}),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    // Resend rejects senders on unverified domains; surface an honest failure
    // and let the moderator retry after the DNS records are in place.
    throw new RequestError(502, 'The reply could not be sent right now. Check that byucalendar.com is verified for sending in Resend, then try again.');
  }
  await response.body?.cancel();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO email_replies(id,inbound_id,to_address,subject,body_text,sent_by,sent_at) VALUES(?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), row.id, row.from_address, subject, text, user.email, now),
    db.prepare('UPDATE inbound_emails SET replied_at=?, read_at=COALESCE(read_at,?) WHERE id=?').bind(now, now, row.id),
  ]);
  return {ok: true};
}

export async function inboxRequest(request: Request, action: 'list' | 'read' | 'reply') {
  try {
    const account = await readAccount(request);
    const user = requireInboxModerator(account);
    const db = database();
    if (action === 'list') return json(await listInbox(db));
    requireSameOrigin(request, authConfiguration().origin);
    const input = await readJSON(request);
    if (action === 'read') return json(await markRead(db, input));
    return json(await sendReply(db, user, input));
  } catch (error) { return errorResponse(error); }
}

async function fetchInboundContent(apiKey: string, emailId: string) {
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: {Authorization: `Bearer ${apiKey}`}, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error('Inbound content unavailable.'); }
  const data = await response.json() as {text?: unknown; html?: unknown};
  return {text: typeof data.text === 'string' ? data.text : '', html: typeof data.html === 'string' ? data.html : ''};
}

// Resend webhook receiver. The Svix signature over the raw body is the only
// authentication; a 503 asks Resend to retry, and inserts are idempotent by
// the email id because delivery is at-least-once.
export async function inboundWebhook(request: Request) {
  try {
    const config = inboxConfiguration();
    const raw = await readBodyText(request, WEBHOOK_BODY_LIMIT);
    if (!(await verifyWebhookSignature(config.secret, request.headers, raw))) throw new RequestError(401, 'Invalid webhook signature.');
    const payload = JSON.parse(raw) as {type?: unknown; data?: Record<string, unknown>};
    if (payload?.type !== 'email.received' || !payload.data) return json({received: false});
    const record = normalizeInboundEmail(payload.data, config.address);
    if (!record) return json({received: false});
    const content = await fetchInboundContent(config.apiKey, record.id);
    const text = ((content.text.trim() && content.text) || htmlToText(content.html)).slice(0, INBOX_BODY_LIMIT);
    const db = database();
    await db.prepare('INSERT INTO inbound_emails(id,from_address,to_address,subject,preview,body_text,message_id,received_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .bind(record.id, record.fromAddress, record.toAddress, record.subject, buildPreview(text), text, record.messageId || null, record.receivedAt).run();
    return json({received: true});
  } catch (error) {
    // RequestErrors carry their status; anything else (bad JSON, content
    // fetch failure) becomes a 503 so Resend retries the delivery.
    return errorResponse(error);
  }
}

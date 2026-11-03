import {env} from 'cloudflare:workers';
import {database} from '../db';
import {readCalendar} from './calendar-server';
import {authConfiguration} from './auth';
import {json, errorResponse, requireRefreshOrigin, RequestError} from './http.mjs';
import {digestWindow, selectDigestEvents, buildDigestEmail, unsubscribeToken, verifyUnsubscribeToken} from './reminders.mjs';

// The daily digest: one morning email per member summarizing the events they
// saved for that day. It is strictly opt-in — nobody is emailed until they
// turn it on. A server-cron POST with the shared dispatch token drives it;
// per-user state in email_digests keeps every run idempotent per day.

const SEND_CAP = 200;

export function digestConfiguration() {
  const origin = authConfiguration().origin || 'https://byucalendar.com';
  return {origin, apiKey: env.RESEND_API_KEY || '', from: env.AUTH_EMAIL_FROM || '', ready: Boolean(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM)};
}

function unsubscribeSecret() {
  const secret = env.BETTER_AUTH_SECRET || '';
  if (secret.length < 32) throw new RequestError(503, 'Email preferences are not configured yet.');
  return secret;
}

export async function setDigestOptIn(userId: string, optedIn: boolean) {
  // last_day survives the toggle so turning the digest back on later never
  // produces a second email on a day one was already sent.
  await database().prepare("INSERT INTO email_digests(user_id,opted_in,last_day) VALUES(?,?,'') ON CONFLICT(user_id) DO UPDATE SET opted_in=excluded.opted_in")
    .bind(userId, optedIn ? 1 : 0).run();
  return {ok: true};
}

export async function readDigestOptIn(userId: string) {
  const row = await database().prepare('SELECT opted_in FROM email_digests WHERE user_id=?').bind(userId).first<{opted_in: number}>();
  return Boolean(row?.opted_in);
}

type DigestMember = {user_id: string; email: string; name: string};

async function sendDigest(db: ReturnType<typeof database>, config: ReturnType<typeof digestConfiguration>, member: DigestMember, day: string, events: ReturnType<typeof selectDigestEvents>) {
  const token = await unsubscribeToken(member.user_id, unsubscribeSecret());
  const unsubscribeUrl = `${config.origin}/api/reminders/unsubscribe?u=${encodeURIComponent(member.user_id)}&t=${token}`;
  const email = buildDigestEmail({name: member.name, day, events, unsubscribeUrl, origin: config.origin});
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: {Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json'},
    // List-Unsubscribe headers keep mailbox providers happy; the one-click POST
    // lands on the same endpoint as the plain link.
    body: JSON.stringify({
      from: config.from, to: [member.email], subject: email.subject, text: email.text, html: email.html,
      headers: {'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'},
    }),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return false; // last_day stays behind, so the next run retries this member.
  }
  await response.body?.cancel();
  await db.prepare('INSERT INTO email_digests(user_id,opted_in,last_day,last_sent_at,last_count) VALUES(?,1,?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_day=excluded.last_day,last_sent_at=excluded.last_sent_at,last_count=excluded.last_count')
    .bind(member.user_id, day, new Date().toISOString(), events.length).run();
  return true;
}

export async function dispatchDigests(force = false) {
  const config = digestConfiguration();
  if (!config.ready) throw new RequestError(503, 'Digest email is not configured.');
  const now = new Date(), window = digestWindow(now);
  if (!window.active && !force) return {day: window.day, skipped: 'The digest sends between 7:00 and 10:00 AM Mountain Time.'};
  const db = database();
  const rows = (await db.prepare('SELECT u.id AS user_id, u.email AS email, u.name AS name, COALESCE(d.opted_in,0) AS opted_in, COALESCE(d.last_day,\'\') AS last_day FROM auth_user u LEFT JOIN email_digests d ON d.user_id=u.id WHERE u.emailVerified=1')
    .all<DigestMember & {opted_in: number; last_day: string}>()).results;
  const pending = rows.filter(row => row.opted_in === 1 && row.last_day !== window.day);
  if (!pending.length) return {day: window.day, eligible: 0, sent: 0};
  const calendar = await readCalendar();
  let sent = 0;
  for (let offset = 0; offset < pending.length && sent < SEND_CAP; offset += 100) {
    const chunk = pending.slice(offset, offset + 100);
    const placeholders = chunk.map(() => '?').join(',');
    const prefs = new Map((await db.prepare(`SELECT user_id, payload FROM user_preferences WHERE user_id IN (${placeholders})`)
      .bind(...chunk.map(member => member.user_id)).all<{user_id: string; payload: string}>()).results
      .map(row => [row.user_id, row.payload]));
    for (const member of chunk) {
      if (sent >= SEND_CAP) break;
      const saved = JSON.parse(prefs.get(member.user_id) || 'null')?.saved;
      if (!Array.isArray(saved) || !saved.length) continue;
      const events = selectDigestEvents(calendar.events, saved, window.day, now);
      if (!events.length) continue;
      if (await sendDigest(db, config, member, window.day, events)) sent++;
    }
  }
  return {day: window.day, eligible: pending.length, sent};
}

let dispatching = false;
export async function dispatchRequest(request: Request) {
  try {
    const config = digestConfiguration();
    requireRefreshOrigin(request, config.origin);
    const token = env.REMINDERS_DISPATCH_TOKEN || '';
    // Origin alone is not authentication; the cron additionally holds a shared
    // secret, so this endpoint is inert to anyone without it.
    if (!token || request.headers.get('authorization') !== `Bearer ${token}`) throw new RequestError(403, 'Not authorized.');
    if (dispatching) return json({skipped: 'A dispatch is already running.'});
    dispatching = true;
    try { return json(await dispatchDigests(new URL(request.url).searchParams.get('force') === '1')); }
    finally { dispatching = false; }
  } catch (error) { return errorResponse(error); }
}

function digestPage(title: string, message: string, origin: string, status: number) {
  const safeTitle = title.replace(/[<>&"]/g, '');
  const safeMessage = message.replace(/[<>&"]/g, '');
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><meta name="robots" content="noindex"></head>`
    + `<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#202124;background:#ffffff;margin:0">`
    + `<div style="max-width:560px;margin:12vh auto 0;padding:0 20px">`
    + `<h1 style="font-size:22px;margin:0 0 12px">${safeTitle}</h1><p style="margin:0 0 24px;color:#5f6368">${safeMessage}</p>`
    + `<a href="${origin}/account" style="background:#1a73e8;color:#ffffff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block">Account settings</a>`
    + `</div></body></html>`,
    {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}},
  );
}

export async function unsubscribeRequest(request: Request) {
  const config = digestConfiguration();
  try {
    const params = new URL(request.url).searchParams;
    const userId = params.get('u') || '';
    if (!userId || !(await verifyUnsubscribeToken(userId, params.get('t'), unsubscribeSecret()))) {
      throw new RequestError(403, 'That unsubscribe link is not valid or has expired.');
    }
    const exists = await database().prepare('SELECT 1 AS ok FROM auth_user WHERE id=?').bind(userId).first();
    if (!exists) throw new RequestError(404, 'That account no longer exists.');
    await setDigestOptIn(userId, false);
    if (request.method === 'POST') return new Response('Unsubscribed', {status: 200, headers: {'Cache-Control': 'no-store'}});
    return digestPage('Unsubscribed', 'You will not receive any more daily digest emails. Your saved events and filters are untouched, and you can turn the digest back on in your account settings.', config.origin, 200);
  } catch (error) {
    if (request.method === 'POST') return errorResponse(error);
    const status = error instanceof RequestError ? error.status : 503;
    const message = error instanceof RequestError ? error.message : 'This action is temporarily unavailable. Please try again.';
    return digestPage(status === 403 ? 'Link not valid' : 'Something went wrong', message, config.origin, status);
  }
}

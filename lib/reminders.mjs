// Daily digest of saved events: event selection, email rendering, and the
// signed unsubscribe token are pure functions so the rules can be tested
// without a Worker runtime. Everything interprets days in Mountain Time.
import {localDate, lastDay} from './catalog.mjs';

export const DIGEST_TIME_ZONE = 'America/Denver';
const longDateFormatter = new Intl.DateTimeFormat('en-US', {timeZone: DIGEST_TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric'});
const timeFormatter = new Intl.DateTimeFormat('en-US', {timeZone: DIGEST_TIME_ZONE, hour: 'numeric', minute: '2-digit'});

// The digest fires on the first dispatch run at or after 7:00 AM Mountain and
// keeps going through 9:59 AM as a catch-up for a briefly unavailable server.
// Later in the day the email would arrive stale, so that day is skipped.
export function digestWindow(now, timeZone = DIGEST_TIME_ZONE) {
  const day = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone, hour: 'numeric', hourCycle: 'h23'}).formatToParts(now).map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  return {day, hour, active: hour >= 7 && hour < 10};
}

// Saved events happening on the digest day: multi-day events count as long as
// they still span today; cancelled listings and events already over are left
// out so the email only describes things still worth attending.
export function selectDigestEvents(events, savedIds, day, now) {
  const byId = new Map(events.map(event => [event.id, event]));
  const picked = [];
  for (const id of savedIds) {
    const event = byId.get(id);
    if (!event || event.cancelled) continue;
    if (localDate(event) > day || lastDay(event) < day) continue;
    if (!event.allDay && event.end && Date.parse(event.end) <= now.getTime()) continue;
    picked.push(event);
  }
  return picked.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

export function digestTimeLabel(event) {
  if (event.allDay) return 'All day';
  const start = timeFormatter.format(new Date(event.start));
  if (!event.end) return start;
  const end = timeFormatter.format(new Date(event.end));
  return end === start ? start : `${start}–${end}`;
}

export function digestDayLabel(day) {
  return longDateFormatter.format(new Date(`${day}T12:00:00Z`));
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function buildDigestEmail({name, day, events, unsubscribeUrl, origin = 'https://byucalendar.com'}) {
  const dayLabel = digestDayLabel(day);
  const firstName = (String(name || '').trim().split(/\s+/)[0]) || 'there';
  const subject = `BYU Calendar: your saved events for ${dayLabel}`;
  const lines = events.map(event => ({
    title: event.title,
    when: digestTimeLabel(event),
    where: event.location ? ` · ${event.location}` : '',
    url: `${origin}/events/${encodeURIComponent(event.id)}`,
  }));
  const text = [
    `Hi ${firstName},`,
    '',
    `You saved ${events.length === 1 ? 'an event' : `${events.length} events`} on BYU Calendar for ${dayLabel}:`,
    '',
    ...lines.map(line => `• ${line.title}\n  ${line.when}${line.where}\n  ${line.url}`),
    '',
    `Open your calendar: ${origin}`,
    '',
    `You get this email at most once per day about events you saved. Unsubscribe: ${unsubscribeUrl}`,
    `Manage this in your account settings: ${origin}/account`,
    '',
    'BYU Calendar is an independent student project, not an official BYU service.',
  ].join('\n');
  const items = lines.map(line =>
    `<li style="margin:0 0 14px"><a href="${line.url}" style="color:#1a73e8;font-weight:600;text-decoration:none">${escapeHtml(line.title)}</a><br><span style="color:#5f6368;font-size:14px">${escapeHtml(line.when)}${escapeHtml(line.where)}</span></li>`,
  ).join('');
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#202124;max-width:560px;margin:0 auto">`
    + `<h2 style="font-size:20px;margin:0 0 12px">Your saved events for ${escapeHtml(dayLabel)}</h2>`
    + `<p style="margin:0 0 18px">Hi ${escapeHtml(firstName)}, here is what you saved on <a href="${origin}" style="color:#1a73e8">BYU Calendar</a> for today.</p>`
    + `<ul style="list-style:none;padding:0;margin:0 0 20px">${items}</ul>`
    + `<p style="margin:0 0 20px"><a href="${origin}" style="background:#1a73e8;color:#ffffff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block">Open your calendar</a></p>`
    + `<p style="font-size:12px;color:#5f6368;margin:0">You get this email at most once per day about events you saved. `
    + `<a href="${unsubscribeUrl}" style="color:#1a73e8">Unsubscribe</a> · <a href="${origin}/account" style="color:#1a73e8">Settings</a><br>`
    + `BYU Calendar is an independent student project, not an official BYU service.</p></div>`;
  return {subject, text, html};
}

// The unsubscribe link is safe to click from any mail client without a
// session, so its authority is an HMAC of the user id under the auth secret.
const encoder = new TextEncoder();
export async function unsubscribeToken(userId, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`digest-unsubscribe:${userId}`)));
  let binary = '';
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function verifyUnsubscribeToken(userId, token, secret) {
  let expected;
  try { expected = await unsubscribeToken(userId, secret); } catch { return false; }
  if (typeof token !== 'string' || token.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return difference === 0;
}

// Live calendar subscription: a filter-aware .ics feed that a calendar app
// polls on its own schedule, plus a personal saved-events feed whose authority
// is a signed token (calendar apps cannot carry a browser session). Everything
// here is pure or Web Crypto only, so the rules are testable outside a Worker.
import {localDate, lastDay, safeUrl, CATEGORIES, INTEREST_TAGS} from './catalog.mjs';
import {matchesEvent, icsEscape, icsCompactDate, foldICalLines} from './search.mjs';
import {dayOrder} from './important-events.mjs';

export const FEED_ORIGIN = 'https://byucalendar.com';
export const FEED_PATH = '/api/calendar/ics';
export const FEED_EVENT_CAP = 2500;
export const FEED_MAX_EVENTS_PER_QUERY = 200;
export const FEED_MAX_TAGS = 12;
export const FEED_MAX_CATEGORIES = 6;

// Perks and interests both travel as `tags` in the URL. Only known vocabulary
// is accepted, so a hand-edited URL cannot smuggle arbitrary filter text into
// the feed.
export const FEED_DETAIL_TAGS = ['Food provided', 'Snacks', 'Drinks', 'Free admission', 'Open invite', 'In person', 'Online', 'Important'];
const KNOWN_TAGS = new Set([...INTEREST_TAGS, ...FEED_DETAIL_TAGS]);
const KNOWN_CATEGORIES = new Set(CATEGORIES.map(category => category.id));

function tidy(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function list(value) {
  return typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
}

// Reads the same q/categories/tags shape the calendar UI keeps in its URL, so
// subscribing to what you are looking at produces the same event set.
export function feedFilter(params) {
  const query = tidy(params.get('q'), FEED_MAX_EVENTS_PER_QUERY).replace(/[\u0000-\u001f]/g, '');
  const categories = [...new Set(list(params.get('categories')).filter(category => KNOWN_CATEGORIES.has(category)))].slice(0, FEED_MAX_CATEGORIES);
  const tags = [...new Set(list(params.get('tags')).filter(tag => KNOWN_TAGS.has(tag)))].slice(0, FEED_MAX_TAGS);
  return {query, categories, tags};
}

export function feedSearch({query, categories, tags}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (categories.length) params.set('categories', categories.join(','));
  if (tags.length) params.set('tags', tags.join(','));
  return params.toString();
}

// One unbroken label for the calendar name, using the same IS/AIS pairing the
// filter bar shows.
export function feedSummary({query = '', categories = [], tags = []}) {
  const interests = tags
    .filter((tag, index) => (tag === 'AIS' ? !tags.includes('IS') && tags.indexOf(tag) === index : tags.indexOf(tag) === index))
    .map(tag => (tag === 'IS' || tag === 'AIS' ? 'IS / AIS' : tag));
  return [query, ...categories, ...interests].filter(Boolean).join(' · ');
}

function shiftDay(day, delta) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

// A subscription is re-read for as long as it is installed, so the window is
// rolling: yesterday onward. Keeping one past day means a feed fetched just
// after midnight still shows what happened last night.
export function feedEvents(events, filter, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Denver'}).format(now);
  const from = shiftDay(today, -1);
  const picked = events.filter(event => lastDay(event) >= from && matchesEvent(event, filter.query || '', filter.categories, filter.tags, now));
  return picked
    .sort((a, b) => localDate(a).localeCompare(localDate(b)) || dayOrder(a, b))
    .slice(0, FEED_EVENT_CAP);
}

// Saved events as a feed: the member's own order is irrelevant, so the same
// rolling window and day ordering apply. A saved id that no longer resolves is
// simply absent — the calendar app keeps its own copy until the next fetch.
export function savedFeedEvents(events, savedIds, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Denver'}).format(now);
  const from = shiftDay(today, -1);
  const byId = new Map(events.map(event => [event.id, event]));
  return savedIds
    .map(id => byId.get(id))
    .filter(event => event && lastDay(event) >= from)
    .sort((a, b) => localDate(a).localeCompare(localDate(b)) || dayOrder(a, b))
    .slice(0, FEED_EVENT_CAP);
}

function lastModified(value) {
  try {
    return icsCompactDate(value);
  } catch {
    return null;
  }
}

// A full VCALENDAR document with the hints calendar apps use to decide how
// often to re-read the URL. UIDs are the event id, which is what keeps a
// refresh an update instead of a duplicate; exported and subscribed copies of
// the same event therefore collapse in the calendar app.
export function buildCalendarFeed(events, {name = 'BYU Calendar', description = '', origin = FEED_ORIGIN, now = new Date()} = {}) {
  const stamp = icsCompactDate(now.toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BYU Calendar//Campus Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsEscape(name),
    ...(description ? ['X-WR-CALDESC:' + icsEscape(description)] : []),
    'X-WR-TIMEZONE:America/Denver',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    'SOURCE;VALUE=URI:' + origin + FEED_PATH,
  ];
  for (const event of events) {
    const url = safeUrl(event.url);
    const modified = event.sourceUpdated ? lastModified(event.sourceUpdated) : null;
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + icsEscape(event.id) + '@byu-calendar',
      'DTSTAMP:' + stamp,
      ...(modified ? ['LAST-MODIFIED:' + modified, 'SEQUENCE:0'] : []),
      (event.allDay ? 'DTSTART;VALUE=DATE:' : 'DTSTART:') + icsCompactDate(event.start, event.allDay),
    );
    if (event.end) lines.push((event.allDay ? 'DTEND;VALUE=DATE:' : 'DTEND:') + icsCompactDate(event.end, event.allDay));
    lines.push(
      'SUMMARY:' + icsEscape(event.title),
      'DESCRIPTION:' + icsEscape((event.description || '') + (url ? '\n\nSource: ' + url : '')),
      'LOCATION:' + icsEscape(event.location),
      ...(url ? ['URL:' + url] : []),
      ...(event.cancelled ? ['STATUS:CANCELLED'] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return foldICalLines(lines);
}

// The personal feed link is pasted into a calendar app, so it has to work with
// no session: the token itself carries the member id under an HMAC of the auth
// secret, in its own namespace so it can never stand in for another signed
// link.
const encoder = new TextEncoder();

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function feedMac(userId, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode('calendar-feed:' + userId)));
}

export async function feedToken(userId, secret) {
  return base64url(encoder.encode(userId)) + '.' + base64url(await feedMac(userId, secret));
}

export async function verifyFeedToken(token, secret) {
  if (typeof token !== 'string' || !token || token.length > 400) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  let userId = '';
  try {
    userId = new TextDecoder().decode(fromBase64url(payload));
  } catch {
    return null;
  }
  if (!userId || userId.length > 120) return null;
  let expected;
  try {
    expected = base64url(await feedMac(userId, secret));
  } catch {
    return null;
  }
  if (mac.length !== expected.length) return null;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ mac.charCodeAt(index);
  return difference === 0 ? userId : null;
}

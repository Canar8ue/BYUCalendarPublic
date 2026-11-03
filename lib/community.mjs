import {z} from 'zod';
import {CATEGORIES, INTEREST_TAGS, civilToISO, classify} from './catalog.mjs';
import {RequestError} from './http.mjs';

export const COMMUNITY_TAGS = [...INTEREST_TAGS, 'Food provided', 'Snacks', 'Drinks', 'Free admission', 'Open invite', 'In person', 'Online'];
export const REPORT_REASONS = ['Incorrect details', 'Cancelled event', 'Duplicate listing', 'Incorrect tags', 'Spam or inappropriate content', 'Other'];
const text = (min, max) => z.string().trim().min(min).max(max).refine(s => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s), 'Remove unsupported control characters.');
const eventId = text(1, 250);
const httpsURL = text(1, 2000).refine(value => {
  try { const u = new URL(value); return !/[\u0000-\u0020\u007f]/.test(value) && u.protocol === 'https:' && !u.username && !u.password; }
  catch { return false; }
}, 'Use an HTTPS link without spaces or embedded credentials.').transform(value => new URL(value).href);
const listingSchema = z.object({
  submissionId: z.string().uuid(), title: text(3, 160), organizer: text(2, 120), description: text(20, 5000),
  start: text(10, 16), end: z.string().max(16).default(''), allDay: z.boolean(),
  category: z.enum(CATEGORIES.map(c => c.id)), location: text(2, 240), url: httpsURL,
}).strict();
const tagSchema = z.object({eventId, tag: z.enum(COMMUNITY_TAGS), note: text(10, 500)}).strict();
const reportSchema = z.object({eventId, reason: z.enum(REPORT_REASONS), details: text(10, 1500)}).strict();
const reviewSchema = z.object({id: text(1, 100), action: z.enum(['dismiss', 'hide', 'restore', 'clear-tags'])}).strict();
// Edits carry the existing event id instead of a new submission id; the store
// reuses the id so tags, reports, and moderation stay attached.
const listingEditSchema = listingSchema.omit({submissionId: true}).extend({id: eventId}).strict();
// Moderator corrections for source listings are a partial patch stored as JSON
// and layered over the merged calendar at read time. Empty text clears the
// stored value; at least one correctable field must change.
const eventOverrideSchema = z.object({
  id: eventId, title: text(3, 160).optional(), description: text(0, 5000).optional(),
  location: text(0, 240).optional(), category: z.enum(CATEGORIES.map(c => c.id)).optional(), url: httpsURL.optional(),
}).strict().refine(value => Object.keys(value).length > 1, 'Choose at least one detail to correct.');
const moderationActionSchema = z.object({id: eventId, action: z.enum(['delete', 'restore', 'revert'])}).strict();

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new RequestError(400, result.error.issues[0]?.message || 'Check your submission.');
  return result.data;
}

const civilFormatter = new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
function calendarTime(value, allDay) {
  if (!(allDay ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).test(value)) throw new RequestError(400, 'Enter a valid date and time.');
  const instant = civilToISO(value);
  if (!instant || civilFormatter.format(new Date(instant)).replace(' ', 'T').slice(0, allDay ? 10 : 16) !== value) throw new RequestError(400, 'That date or Mountain Time does not exist. Choose another time.');
  // A fall-back hour occurs twice. Do not silently choose an occurrence.
  if (!allDay && [-3600000, 3600000].some(delta => civilFormatter.format(new Date(Date.parse(instant) + delta)).replace(' ', 'T') === value)) throw new RequestError(400, 'That Mountain Time occurs twice during the daylight-saving change. Choose an unambiguous time.');
  return allDay ? value : instant;
}

export function parseListing(input, now = new Date()) {
  const data = parse(listingSchema, input);
  const start = calendarTime(data.start, data.allDay);
  // In the form, an all-day end is the last day included; ICS uses an exclusive end.
  let end = data.end ? calendarTime(data.end, data.allDay) : null;
  if (data.allDay) end = new Date(Date.parse(end || start) + 86400000).toISOString().slice(0, 10);
  if (end && end <= start) throw new RequestError(400, 'The end must be after the start.');
  const startsAt = Date.parse(data.allDay ? civilToISO(start) : start);
  if (startsAt < now.getTime() - 86400000 || startsAt > now.getTime() + 366 * 86400000) throw new RequestError(400, 'Choose a date from today through the next year.');
  if (end && Date.parse(end) - Date.parse(start) > 31 * 86400000) throw new RequestError(400, 'Listings may last at most 31 days.');
  const event = classify({id: `community:${data.submissionId}`, title: data.title, description: data.description, start, end, allDay: data.allDay, location: data.location, url: data.url, sourceId: 'community', sourceName: `Community · ${data.organizer}`, category: data.category, cancelled: false, sourceUpdated: now.toISOString()});
  return {...event, category: data.category, community: true, organizer: data.organizer};
}
export const parseTag = input => parse(tagSchema, input);
export const parseReport = input => parse(reportSchema, input);
export const parseReview = input => parse(reviewSchema, input);
export const parseListingEdit = input => parse(listingEditSchema, input);
export const parseEventOverride = input => parse(eventOverrideSchema, input);
export const parseModerationAction = input => parse(moderationActionSchema, input);

export function addCommunityData(events, listings, tags, hiddenIds) {
  const hidden = new Set(hiddenIds);
  const byEvent = new Map();
  for (const row of tags) {
    if (!byEvent.has(row.event_id)) byEvent.set(row.event_id, []);
    byEvent.get(row.event_id).push({id: row.id, tag: row.tag, note: row.note});
  }
  return [...events, ...listings].filter(event => !hidden.has(event.id)).map(event => {
    const communityTags = (byEvent.get(event.id) || []).filter(row => !event.tags.includes(row.tag));
    return {...event, communityTags, tags: [...new Set([...event.tags, ...communityTags.map(t => t.tag)])]};
  }).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

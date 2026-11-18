// Server-side RSVP bookkeeping: event_saves rows mirror each member's saved
// list (written on every preferences save), public profiles carry the avatar
// and hide switch, and the RSVP read shapes entries for the viewer. Never
// imported by client code.
import {cleanAvatar, rsvpEntry} from './rsvp.mjs';
import {RequestError} from './http.mjs';

// Called with the full post-validation saved list; mirrors it into the public
// RSVP table so the preferences payload stays the single source of truth.
export async function syncEventSaves(db, userId, savedIds, preferencePayload) {
  const next = [...new Set(savedIds)];
  const statements = [];
  if (preferencePayload !== undefined) statements.push(db.prepare('INSERT INTO user_preferences(user_id,payload) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload').bind(userId, JSON.stringify(preferencePayload)));
  // Determine removals inside the same transaction as the new preference
  // payload. A read-before-write diff can retain stale RSVPs under overlap.
  statements.push(db.prepare('DELETE FROM event_saves WHERE user_id=? AND event_id NOT IN (SELECT value FROM json_each(?))').bind(userId, JSON.stringify(next)));
  const now = new Date().toISOString();
  // Keep each statement below D1's parameter limit even at 2,000 saved IDs.
  for (let offset = 0; offset < next.length; offset += 30) {
    const chunk = next.slice(offset, offset + 30);
    statements.push(db.prepare('INSERT INTO event_saves(user_id,event_id,saved_at) VALUES ' + chunk.map(() => '(?,?,?)').join(',') + ' ON CONFLICT DO NOTHING').bind(...chunk.flatMap(id => [userId, id, now])));
  }
  await db.batch(statements);
}

export async function readRsvps(db, eventId, viewerIsMember) {
  if (typeof eventId !== 'string' || !eventId || eventId.length > 250) throw new RequestError(400, 'Choose an event.');
  const {results} = await db.prepare(`SELECT s.user_id,u.name,u.email,COALESCE(p.hidden,0) AS hidden,COALESCE(p.avatar,'') AS avatar
    FROM event_saves s JOIN auth_user u ON u.id=s.user_id LEFT JOIN public_profiles p ON p.user_id=s.user_id
    WHERE s.event_id=? AND NOT EXISTS (SELECT 1 FROM listing_moderation m WHERE m.event_id=s.event_id AND m.hidden=1) ORDER BY s.saved_at`).bind(eventId).all();
  const visible = results.filter(row => !row.hidden);
  return {count: visible.length, members: visible.map(row => rsvpEntry(row, viewerIsMember))};
}

export async function readPublicProfile(db, userId) {
  const row = await db.prepare('SELECT avatar,hidden FROM public_profiles WHERE user_id=?').bind(userId).first();
  return {avatar: row?.avatar || null, hidden: Boolean(row?.hidden)};
}

export async function writePublicProfile(db, userId, input) {
  const patch = {};
  if (input?.avatar !== undefined) {
    const avatar = cleanAvatar(input.avatar);
    if (avatar === undefined) throw new RequestError(400, 'Choose a PNG, JPEG, or WebP picture under about 200 KB.');
    patch.avatar = avatar;
  }
  if (typeof input?.hidden === 'boolean') patch.hidden = input.hidden ? 1 : 0;
  if (!Object.keys(patch).length) throw new RequestError(400, 'Nothing to update.');
  const existing = await db.prepare('SELECT user_id,avatar,hidden FROM public_profiles WHERE user_id=?').bind(userId).first();
  const avatar = patch.avatar !== undefined ? patch.avatar : existing?.avatar ?? null;
  const hidden = patch.hidden !== undefined ? patch.hidden : existing?.hidden ?? 0;
  await db.prepare(`INSERT INTO public_profiles(user_id,avatar,hidden,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET avatar=excluded.avatar,hidden=excluded.hidden,updated_at=excluded.updated_at`)
    .bind(userId, avatar, hidden, new Date().toISOString()).run();
  return {avatar, hidden: Boolean(hidden)};
}

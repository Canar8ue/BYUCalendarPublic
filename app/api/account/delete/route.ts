import {z} from 'zod';
import {readAccount, authConfiguration} from '../../../../lib/auth';
import {requireContributor} from '../../../../lib/community-store.mjs';
import {database} from '../../../../db';
import {json, readJSON, requireSameOrigin, errorResponse, RequestError} from '../../../../lib/http.mjs';
export const dynamic = 'force-dynamic';
const schema = z.object({confirm: z.literal('DELETE')}).strict();

// Permanently deletes the signed-in account and every row it owns. D1
// batches are atomic, so either the whole account disappears or nothing does.
export async function POST(request: Request) {
  try {
    const user = requireContributor(await readAccount(request));
    requireSameOrigin(request, authConfiguration().origin);
    const parsed = schema.safeParse(await readJSON(request, 100));
    if (!parsed.success) throw new RequestError(400, 'Type DELETE to confirm account deletion.');
    const db = database();
    await db.batch([
      // The user's community content — children of their listings first.
      db.prepare(`DELETE FROM community_tags WHERE event_id IN (SELECT id FROM community_listings WHERE user_id=?)`).bind(user.id),
      db.prepare(`DELETE FROM listing_moderation WHERE event_id IN (SELECT id FROM community_listings WHERE user_id=?)`).bind(user.id),
      db.prepare('DELETE FROM community_tags WHERE user_id=?').bind(user.id),
      db.prepare('DELETE FROM listing_reports WHERE user_id=? OR reviewed_by=?').bind(user.id, user.id),
      db.prepare('DELETE FROM listing_moderation WHERE reviewed_by=?').bind(user.id),
      db.prepare('DELETE FROM event_overrides WHERE reviewed_by=?').bind(user.id),
      db.prepare('DELETE FROM community_listings WHERE user_id=?').bind(user.id),
      // Everything the account itself owns.
      db.prepare('DELETE FROM user_preferences WHERE user_id=?').bind(user.id),
      db.prepare('DELETE FROM email_digests WHERE user_id=?').bind(user.id),
      db.prepare('DELETE FROM profile_activity WHERE user_id=?').bind(user.id),
      db.prepare('DELETE FROM user_profiles WHERE user_id=?').bind(user.id),
      db.prepare('DELETE FROM auth_session WHERE userId=?').bind(user.id),
      db.prepare('DELETE FROM auth_account WHERE userId=?').bind(user.id),
      db.prepare('DELETE FROM auth_verification WHERE identifier=?').bind(user.email),
      db.prepare('DELETE FROM auth_user WHERE id=?').bind(user.id),
    ]);
    return json({ok: true});
  } catch (error) { return errorResponse(error); }
}

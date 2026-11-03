import {z} from 'zod';
import {database} from '../../../db';
import {readAccount, authConfiguration} from '../../../lib/auth';
import {isVerifiedBYUUser} from '../../../lib/account-policy.mjs';
import {requireContributor} from '../../../lib/community-store.mjs';
import {readDigestOptIn} from '../../../lib/reminders-server';
import {syncEventSaves} from '../../../lib/rsvp-server.mjs';
import {json, readJSON, requireSameOrigin, errorResponse, RequestError} from '../../../lib/http.mjs';
export const dynamic = 'force-dynamic';
const list = z.array(z.string().max(250));
// The note travels with each saved id so My calendar can name an event after
// its source stops publishing it. It is pruned to the saved set on every write,
// so it cannot grow into an archive of everything a member ever looked at.
const savedNote = z.object({title: z.string().trim().min(1).max(300), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), location: z.string().max(200).optional(), sourceName: z.string().max(120).optional()}).strict();
const preferenceSchema = z.object({saved: list.max(2000), views: z.array(z.object({id: z.string().max(100), name: z.string().trim().min(1).max(60), query: z.string().max(500), tags: list.max(50), categories: list.max(20)}).strict()).max(30), savedMeta: z.record(z.string().max(250), savedNote).optional()}).strict();
const MAX_SAVED_NOTES = 400;

export async function GET(request: Request) {
  try {
    const {user} = await readAccount(request);
    if (!user || !isVerifiedBYUUser(user)) return json({saved: [], views: [], savedMeta: {}, digestOptedIn: false, signedIn: false});
    const db = database();
    const [row, digestOptedIn] = await Promise.all([
      db.prepare('SELECT payload FROM user_preferences WHERE user_id=?').bind(user.id).first<{payload: string}>(),
      readDigestOptIn(user.id),
    ]);
    return json({...row ? JSON.parse(row.payload) : {saved: [], views: [], savedMeta: {}}, digestOptedIn, signedIn: true});
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const user = requireContributor(await readAccount(request));
    requireSameOrigin(request, authConfiguration().origin);
    const result = preferenceSchema.safeParse(await readJSON(request, 200000));
    if (!result.success) throw new RequestError(400, 'Invalid saved calendar.');
    const saved = new Set(result.data.saved);
    const savedMeta = Object.entries(result.data.savedMeta ?? {}).filter(([id]) => saved.has(id)).slice(0, MAX_SAVED_NOTES);
    const payload = {...result.data, savedMeta: Object.fromEntries(savedMeta)};
    await database().prepare('INSERT INTO user_preferences(user_id,payload) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload').bind(user.id, JSON.stringify(payload)).run();
    // The saved list doubles as the public RSVP record (unless the member
    // hides themselves), so every save mirrors into event_saves.
    await syncEventSaves(database(), user.id, result.data.saved);
    return json({ok: true});
  } catch (error) { return errorResponse(error); }
}

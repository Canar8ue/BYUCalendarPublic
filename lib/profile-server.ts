import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {database} from '../db';
import {readCalendar} from './calendar-server';
import {readAccount, authConfiguration} from './auth';
import {requireContributor, consumeQuota} from './community-store.mjs';
import {json, errorResponse, readJSON, requireSameOrigin, RequestError} from './http.mjs';
import {buildChatPrompt, interpretChatStep, profileFromAnswers, profileEmpty, mergeProfiles, recommendEvents, ACTIVITY_WEIGHTS, nextActivityScore, CHAT_MAX_STEPS, PROFILE_INTERESTS, PROFILE_DETAILS} from './profile.mjs';

// "Picked for you" personalization: a short chat (tappable options or the
// member's own typed words) builds a stored interest profile, signed-in
// activity (views, saves, shares, map/directions, exports) feeds decaying
// taste counters, and a deterministic scorer turns both into recommendations.
// The chat model only ever phrases the questions — ranking happens here from
// the calendar's own vocabularies.

// Same provider configuration as smart search: the owner's DeepSeek key (or
// tested alternative) from .env.accounts; without it the chat reports
// unavailable and My calendar simply keeps its saved events.
async function requestChatStep(answers: ChatAnswer[]) {
  const base = (env.SEARCH_ASSIST_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = env.SEARCH_ASSIST_MODEL || 'deepseek-flash';
  try {
    const response = await fetch(base + '/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: {Authorization: `Bearer ${env.SEARCH_ASSIST_API_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model, thinking: {type: 'disabled'}, messages: buildChatPrompt(answers), temperature: 0.4, max_tokens: 400}),
    });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const payload = await response.json() as {choices?: {message?: {content?: string}}[]};
    return interpretChatStep(payload.choices?.[0]?.message?.content);
  } catch { return null; }
}

const answerSchema = z.object({question: z.string().min(1).max(160), key: z.string().min(1).max(30), options: z.array(z.string().min(1).max(60)).max(6), free: z.string().max(300).optional()}).strict();
const chatSchema = z.object({answers: z.array(answerSchema).max(CHAT_MAX_STEPS).default([]), restart: z.boolean().optional()}).strict();

type ChatAnswer = z.infer<typeof answerSchema>;

export async function readProfile(userId: string) {
  const row = await database().prepare('SELECT payload FROM user_profiles WHERE user_id=?').bind(userId).first<{payload: string}>();
  try { return row ? JSON.parse(row.payload) : null; } catch { return null; }
}

async function storeProfile(userId: string, profile: unknown) {
  await database().prepare('INSERT INTO user_profiles(user_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at')
    .bind(userId, JSON.stringify(profile), new Date().toISOString()).run();
}

export async function profileChatRequest(request: Request) {
  try {
    const user = requireContributor(await readAccount(request));
    requireSameOrigin(request, authConfiguration().origin);
    if (!env.SEARCH_ASSIST_API_KEY) throw new RequestError(503, 'Personal picks are not configured yet.');
    const parsed = chatSchema.safeParse(await readJSON(request, 20000));
    if (!parsed.success) throw new RequestError(400, 'Check your answers and try again.');
    const db = database();
    if (parsed.data.restart) {
      // Tuning the picks starts the member over completely: the stored profile
      // and the activity-built taste counters both clear, so the rebuilt picks
      // reflect only what the new conversation says.
      await db.batch([
        db.prepare('DELETE FROM user_profiles WHERE user_id=?').bind(user.id),
        db.prepare('DELETE FROM profile_activity WHERE user_id=?').bind(user.id),
      ]);
      parsed.data.answers = [];
    }
    if (!await consumeQuota(db, `profile-chat:${user.id}`, 60, 86400)) throw new RequestError(429, 'That is enough chat for today. Please try again tomorrow.');
    // Progressive storage: every exchange is merged into the stored profile
    // before the model is asked for the next question, so a typed answer
    // takes effect immediately — even if the member closes the dialog
    // mid-conversation or the model call fails. A skipped answer contributes
    // nothing, so it cannot wipe what is already stored; a completed
    // conversation (below) replaces the profile wholesale.
    if (parsed.data.answers.length > 0) {
      const partial = profileFromAnswers(parsed.data.answers);
      if (!profileEmpty(partial)) {
        await storeProfile(user.id, {...mergeProfiles(await readProfile(user.id), partial), updatedAt: new Date().toISOString()});
      }
    }
    // A finished conversation (or the step cap) stores the profile and stops
    // asking; the model sees only the question/answer wording, never events
    // or account data.
    if (parsed.data.answers.length >= CHAT_MAX_STEPS) {
      const profile = profileFromAnswers(parsed.data.answers);
      await storeProfile(user.id, {...profile, updatedAt: new Date().toISOString()});
      return json({done: true, summary: 'Your picks are ready.', profile});
    }
    const step = await requestChatStep(parsed.data.answers);
    if (!step) throw new RequestError(503, 'The picks chat is briefly unavailable. Try again in a moment.');
    if (step.done) {
      const profile = profileFromAnswers(parsed.data.answers);
      await storeProfile(user.id, {...profile, updatedAt: new Date().toISOString()});
      return json({done: true, summary: step.summary, profile});
    }
    return json({done: false, step});
  } catch (error) { return errorResponse(error); }
}

// Activity beacons resolve to category/tag taste counters only — never a
// per-event browsing history — and only for events that actually exist in the
// merged calendar, so arbitrary ids cannot forge tastes.
export async function profileActivityRequest(request: Request) {
  try {
    const user = requireContributor(await readAccount(request));
    requireSameOrigin(request, authConfiguration().origin);
    const input = await readJSON(request, 1000);
    const type = String(input?.type || '');
    const eventId = String(input?.eventId || '');
    if (!(type in ACTIVITY_WEIGHTS) || !eventId || eventId.length > 250) return json({ok: false});
    const db = database();
    if (!await consumeQuota(db, `profile-activity:${user.id}`, 400, 86400)) return json({ok: false});
    const calendar = await readCalendar();
    const event = calendar.events.find(item => item.id === eventId);
    if (!event || event.cancelled) return json({ok: false});
    const signals = [{kind: 'category', value: event.category},
      ...event.tags.filter(tag => PROFILE_INTERESTS.includes(tag) || PROFILE_DETAILS.includes(tag)).map(tag => ({kind: 'tag', value: tag}))];
    const rows = (await db.prepare("SELECT kind,value,score,updated_at FROM profile_activity WHERE user_id=?").bind(user.id).all<{kind: string; value: string; score: number; updated_at: string}>()).results;
    const known = new Map(rows.map(row => [row.kind + '|' + row.value, row]));
    const now = new Date().toISOString();
    const weight = ACTIVITY_WEIGHTS[type as keyof typeof ACTIVITY_WEIGHTS];
    await db.batch(signals.map(signal => {
      const existing = known.get(signal.kind + '|' + signal.value);
      const score = existing ? nextActivityScore(existing.score, existing.updated_at, weight) : weight;
      return db.prepare(`INSERT INTO profile_activity(user_id,kind,value,score,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(user_id,kind,value) DO UPDATE SET score=excluded.score,updated_at=excluded.updated_at`)
        .bind(user.id, signal.kind, signal.value, score, now);
    }));
    return json({ok: true});
  } catch (error) { return errorResponse(error); }
}

export async function recommendationsRequest(request: Request) {
  try {
    const user = requireContributor(await readAccount(request));
    const db = database();
    const [profile, activity, preferenceRow] = await Promise.all([
      readProfile(user.id),
      db.prepare('SELECT kind,value,score FROM profile_activity WHERE user_id=?').bind(user.id).all<{kind: string; value: string; score: number}>(),
      db.prepare('SELECT payload FROM user_preferences WHERE user_id=?').bind(user.id).first<{payload: string}>(),
    ]);
    let savedIds: string[] = [];
    try { const payload = JSON.parse(preferenceRow?.payload || 'null'); if (Array.isArray(payload?.saved)) savedIds = payload.saved; } catch {/* empty preferences */}
    const calendar = await readCalendar();
    const picks = recommendEvents(calendar.events, {profile, activityRows: activity.results, savedIds, limit: 24});
    return json({hasProfile: !profileEmpty(profile), profile: profile ?? null, picks});
  } catch (error) { return errorResponse(error); }
}

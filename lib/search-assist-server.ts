import {env} from 'cloudflare:workers';
import {database} from '../db';
import {authConfiguration} from './auth';
import {json, errorResponse, readJSON, requireSameOrigin, RequestError} from './http.mjs';
import {consumeQuota} from './community-store.mjs';
import {isBot} from './analytics.mjs';
import {buildPrompt, interpretAssist, cachedInterpretation, rememberInterpretation} from './search-assist.mjs';

// Any OpenAI-compatible chat endpoint works. Default is DeepSeek's flash
// model (measured ~1.5s per interpretation); the owner's z.ai GLM coding
// plan is the tested alternative — set SEARCH_ASSIST_BASE_URL to
// https://api.z.ai/api/coding/paas/v4 and SEARCH_ASSIST_MODEL to
// glm-5.3-flash. The key lives only in server env files (.env.accounts /
// .env.search), never in Git or the client bundle; without it the endpoint
// reports unavailable and the calendar quietly keeps its deterministic search.
async function requestInterpretation(query: string) {
  const base = (env.SEARCH_ASSIST_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const model = env.SEARCH_ASSIST_MODEL || 'deepseek-flash';
  try {
    const response = await fetch(base + '/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {Authorization: `Bearer ${env.SEARCH_ASSIST_API_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model, thinking: {type: 'disabled'}, messages: buildPrompt(query), temperature: 0.2, max_tokens: 500}),
    });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const payload = await response.json() as {choices?: {message?: {content?: string}}[]};
    return interpretAssist(payload.choices?.[0]?.message?.content);
  } catch { return null; }
}

// Public same-origin backup for empty deterministic searches: bot-filtered,
// per-address capped, memoized, and honest about being unavailable.
export async function searchAssistRequest(request: Request) {
  try {
    if (!env.SEARCH_ASSIST_API_KEY) throw new RequestError(503, 'Smart search interpretation is not configured.');
    // Same-origin enforcement works even in sandboxes where authentication
    // env is absent: behind the HTTPS proxy request.url is http, so compare
    // on host with the scheme the browser actually sends.
    let origin = authConfiguration().origin;
    if (!origin) origin = 'https://' + new URL(request.url).host;
    requireSameOrigin(request, origin);
    const userAgent = request.headers.get('user-agent') || '';
    if (isBot(userAgent)) return json({intent: null, summary: ''});
    const input = await readJSON(request, 2000);
    const query = typeof input?.query === 'string' ? input.query.trim().slice(0, 300) : '';
    if (!query || !/\p{L}|\p{N}/u.test(query)) throw new RequestError(400, 'Enter a search phrase to interpret.');
    const cached = cachedInterpretation(query);
    if (cached) return json({...cached, cached: true});
    const address = request.headers.get('x-real-ip') || 'local';
    if (!await consumeQuota(database(), `search-assist:${address}`, 40, 86400)) {
      throw new RequestError(429, 'Too many smart searches today. Please try again tomorrow.');
    }
    const result = await requestInterpretation(query);
    if (!result) throw new RequestError(503, 'Smart search could not interpret that phrase right now.');
    rememberInterpretation(query, result);
    return json({...result, cached: false});
  } catch (error) { return errorResponse(error); }
}

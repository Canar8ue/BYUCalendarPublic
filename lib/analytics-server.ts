import {database} from '../db';
import {readAccount, authConfiguration} from './auth';
import {readCalendar} from './calendar-server';
import {json, errorResponse, readJSON, requireSameOrigin, RequestError} from './http.mjs';
import {requireContributor, consumeQuota} from './community-store.mjs';
import {isBot, deviceClass, cleanReferrer, normalizeAnalyticsEvents, recordAnalytics, analyticsSummary} from './analytics.mjs';

// Public beacon intake (same-origin only, bot-filtered, quota-capped) and the
// moderator-gated dashboard summary. Recording stores aggregate rows only.
export async function analyticsRequest(request: Request, action: 'record' | 'summary') {
  try {
    if (action === 'record') {
      const userAgent = request.headers.get('user-agent') || '';
      if (isBot(userAgent)) return json({recorded: 0});
      requireSameOrigin(request, authConfiguration().origin);
      const input = await readJSON(request, 8000);
      const rows = normalizeAnalyticsEvents(input?.events, {
        country: request.headers.get('cf-ipcountry') || '',
        device: deviceClass(userAgent),
        referrer: cleanReferrer(request.headers.get('referer'), new URL(request.url).host),
      });
      if (!rows.length) return json({recorded: 0});
      const db = database();
      // A per-address daily cap keeps a runaway page from flooding the table;
      // the quota key is transient (action_limits), not part of analytics rows.
      const address = request.headers.get('x-real-ip') || 'local';
      if (!await consumeQuota(db, `analytics:${address}`, 2000, 86400)) return json({recorded: 0});
      return json({recorded: await recordAnalytics(db, rows)});
    }
    const account = await readAccount(request);
    requireContributor(account);
    if (!account.permissions.reviewReports) throw new RequestError(403, 'Usage analytics are available to calendar administrators.');
    const db = database();
    return json(await analyticsSummary(db, await readCalendar()));
  } catch (error) { return errorResponse(error); }
}

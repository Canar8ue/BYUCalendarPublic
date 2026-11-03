import {database} from '../../../../db';
import {readCalendar} from '../../../../lib/calendar-server';
import {authConfiguration} from '../../../../lib/auth';
import {feedFilter, feedSummary, feedEvents, savedFeedEvents, buildCalendarFeed, verifyFeedToken, FEED_ORIGIN} from '../../../../lib/feed.mjs';

export const dynamic = 'force-dynamic';

// The live subscription endpoint. Calendar apps re-read this URL on their own
// schedule, so it must work without a session: a public feed reads the filters
// in its query string, and a personal feed authenticates with a signed token
// that carries the member id. Everything is served from the same 30-second
// merged-calendar memo the site uses, so polling costs no extra source fetches.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = url.searchParams;
    const origin = authConfiguration().origin || FEED_ORIGIN;
    const token = params.get('t') || params.get('token') || '';
    const calendar = await readCalendar();

    if (token) {
      const secret = authConfiguration().secret;
      const userId = secret.length >= 32 ? await verifyFeedToken(token, secret) : null;
      if (!userId) return Response.json({error: 'This subscription link is not valid.'}, {status: 403, headers: {'Cache-Control': 'no-store'}});
      const row = await database().prepare('SELECT payload FROM user_preferences WHERE user_id=?').bind(userId).first<{payload: string}>();
      let saved: unknown = [];
      try { saved = JSON.parse(row?.payload || 'null')?.saved; } catch { saved = []; }
      const events = savedFeedEvents(calendar.events, Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []);
      return new Response(buildCalendarFeed(events, {
        name: 'BYU Calendar — My saved events',
        description: 'Events you saved on BYU Calendar. This link is personal; anyone who has it can read these events.',
        origin,
      }), {headers: {'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="byu-calendar-saved.ics"', 'Cache-Control': 'private, no-store'}});
    }

    const filter = feedFilter(params);
    const events = feedEvents(calendar.events, filter);
    const summary = feedSummary(filter);
    return new Response(buildCalendarFeed(events, {
      name: summary ? `BYU Calendar — ${summary}` : 'BYU Calendar',
      description: summary
        ? `BYU campus events matching ${summary}. Live subscription from BYU Calendar.`
        : 'Every upcoming BYU campus event from the connected calendars on byucalendar.com.',
      origin,
    }), {headers: {'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="byu-calendar.ics"', 'Cache-Control': 'public, max-age=300'}});
  } catch (error) {
    console.error(error);
    return Response.json({error: 'The calendar could not be loaded. Please try again.'}, {status: 503});
  }
}

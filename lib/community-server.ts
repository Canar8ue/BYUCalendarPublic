import {database} from '../db';
import {readAccount, authConfiguration} from './auth';
import {readCalendar, invalidateCalendar} from './calendar-server';
import {json, errorResponse, readJSON, requireSameOrigin} from './http.mjs';
import {publishListing, updateListing, deleteListing, readMyListings, publishTag, submitReport, readReports, reviewReport, moderateEvent, readModerationInventory, requireContributor} from './community-store.mjs';
import {staffEditGrant} from './staff-server.mjs';

export async function communityRequest(request: Request, action: 'listing' | 'update' | 'delete' | 'mine' | 'tag' | 'report' | 'review' | 'reports' | 'moderate' | 'inventory') {
  try {
    const account = await readAccount(request);
    const user = requireContributor(account);
    const db = database();
    if (action === 'reports') return json({reports: await readReports(db, account)});
    if (action === 'mine') return json({listings: await readMyListings(db, account)});
    if (action === 'inventory') return json(await readModerationInventory(db, account));
    requireSameOrigin(request, authConfiguration().origin);
    const input = await readJSON(request);
    const findEvent = async (id: string) => (await readCalendar()).events.find(e => e.id === id);
    // The first-listing flag drives the author's post-publish prompt to Your
    // listings, so it is decided before this insert adds the row. A replay of
    // the member's own submission id can only happen when a row already
    // exists, which makes the count non-zero and the flag false.
    if (action === 'listing') { const prior = await db.prepare('SELECT COUNT(*) AS n FROM community_listings WHERE user_id=?').bind(user.id).first<{n: number}>(); const result = await publishListing(db, account, input, await staffEditGrant(db, account)); invalidateCalendar(); return json({event: result, first: !prior?.n, approvalStatus: result.approvalStatus}, 201); }
    if (action === 'update') { const result = await updateListing(db, account, input); invalidateCalendar(); return json({event: result}); }
    if (action === 'delete') { const result = await deleteListing(db, account, input); invalidateCalendar(); return json(result); }
    if (action === 'tag') { const result = await publishTag(db, account, input, findEvent); invalidateCalendar(); return json(result); }
    if (action === 'report') return json(await submitReport(db, account, input, findEvent));
    if (action === 'moderate') { const result = await moderateEvent(db, account, input, findEvent, await staffEditGrant(db, account)); invalidateCalendar(); return json(result); }
    const reviewed = await reviewReport(db, account, input); // hide/restore/clear-tags change public listings
    invalidateCalendar();
    return json(reviewed);
  } catch (error) { return errorResponse(error); }
}

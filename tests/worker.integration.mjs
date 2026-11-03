// Run after building: node --test tests/worker.integration.mjs
// The real production Worker runs against an isolated, disposable D1 database.
// Resend is intercepted here; no messages are sent to any real inbox.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHmac,createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {NAVIGATION_URL} from '../public/explorer/game/navigation-data.mjs';

let mf, db, memberCookie, reviewerCookie, eventId;
const origin = 'http://localhost:8790';
const codes = new Map(); let ip = 1;
const sent = [];
const inboundSecret = 'whsec_' + Buffer.from('integration-inbound-secret').toString('base64');
before(async () => {
  mf = new Miniflare({
    modules: ['index.js', ...readdirSync('dist/server', {recursive: true}).filter(path => path !== 'index.js' && /\.m?js$/.test(path))].map(path => ({type: 'ESModule', path: 'dist/server/' + path.replaceAll('\\', '/')})),
    compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'], assets: {directory: 'dist/client', routerConfig: {has_user_worker: true}},
    bindings: {BETTER_AUTH_SECRET: 'isolated-worker-test-secret-not-for-production-123456789', BETTER_AUTH_URL: origin, RESEND_API_KEY: 'test-intercepted-no-network', AUTH_EMAIL_FROM: 'BYU Calendar <signin@auth.byucalendar.com>', RESEND_INBOUND_SECRET: inboundSecret, CALENDAR_ADMIN_EMAILS: 'reviewer@byu.edu', SEARCH_ASSIST_API_KEY: 'test-assist-key', REMINDERS_DISPATCH_TOKEN: 'test-dispatch-token'},
    outboundService: async request => {
      if (new URL(request.url).hostname === 'api.resend.com') {
        if (request.method === 'GET') return Response.json({text: 'Please delete my data from the calendar. Thanks, Citizen', html: '<p>Please delete my data.</p>'});
        const body = await request.json();
        if (body.to[0] === 'delivery-error@byu.edu') return Response.json({error: 'test failure'}, {status: 503});
        const code = body.text?.match(/code is (\d{6})/)?.[1];
        if (code) codes.set(body.to[0], code); else sent.push(body);
        return Response.json({id: 'test-email'});
      }
      if (new URL(request.url).hostname === 'api.deepseek.com') {
        const body = await request.json();
        assert.equal(body.messages[0].role, 'system');
        assert.ok(String(body.messages[0].content).includes('Respond with ONLY a JSON object'));
        const system = String(body.messages[0].content);
        if (system.includes('onboarding assistant')) {
          const step = JSON.stringify({question: 'Which subjects do you care about?', key: 'interests', options: ['Information systems', 'Accounting', 'Not sure'], multiple: true});
          return Response.json({choices: [{message: {role: 'assistant', content: '```json\n' + step + '\n```'}}]});
        }
        const query = body.messages[1].content;
        const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
        const answer = /unparseable/.test(query) ? 'Sorry, I cannot help with that.'
          : JSON.stringify({summary: 'Ballet performances soon', tags: ['Performances'], categories: [], start: soon, end: soon, afterMinutes: null, words: ['ballet']});
        return Response.json({choices: [{message: {role: 'assistant', content: '```json\n' + answer + '\n```'}}]});
      }
      return new Response('External requests disabled in integration tests.', {status: 503});
    },
  });
  db = await mf.getD1Database('DB');
  for (const file of ['0000_pink_scarlet_spider.sql', '0001_byu_accounts_community.sql', '0002_moderator_inbox.sql', '0003_usage_analytics.sql', '0004_event_moderation.sql', '0005_email_digests.sql', '0006_profile_picks.sql', '0007_digest_opt_in.sql', '0008_staff_accounts.sql', '0009_event_saves_profiles.sql']) {
    const statements = readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '').split(';').map(s => s.trim()).filter(Boolean);
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
});
after(async () => { await mf?.dispose(); });

test('the refresh endpoint rejects cross-site refresh posts', async () => {
  const blocked = await request('/api/refresh', null, '', {origin: 'https://evil.example', 'sec-fetch-site': 'cross-site'});
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).error, 'Origin mismatch');
  for (const headers of [
    {origin: 'https://untrusted.localhost', 'sec-fetch-site': 'same-site'},
    {origin: 'https://evil.example', 'sec-fetch-site': 'same-origin'},
    {origin: 'null'}, {origin: 'invalid origin'},
  ]) assert.equal((await request('/api/refresh', null, '', headers)).status, 403);
});

test('the built Worker applies browser security headers without blocking its campus iframe', async () => {
  for (const path of ['/', '/signin', '/account', '/api/account']) {
    const response = await request(path, null, '', {}, 'GET');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN', path);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/, path);
    assert.match(response.headers.get('content-security-policy'), /object-src 'none'/, path);
    assert.match(response.headers.get('strict-transport-security'), /^max-age=\d+/, path);
  }
});

test('the built Worker invalidates pending signup verification after password recovery', async () => {
  const email = 'recovered-signup@byu.edu';
  assert.equal((await request('/api/auth/sign-up/email', {name: 'Recovery Test', email, password: 'first-password-123'})).status, 200);
  const staleOTP = codes.get(email);
  await db.prepare("DELETE FROM action_limits WHERE key LIKE 'email-minute:%'").run();
  assert.equal((await request('/api/auth/email-otp/request-password-reset', {email})).status, 200);
  assert.equal((await request('/api/auth/email-otp/reset-password', {email, otp: codes.get(email), password: 'new-password-123'})).status, 200);
  const stale = await request('/api/auth/email-otp/verify-email', {email, otp: staleOTP});
  assert.notEqual(stale.status, 200);
  assert.ok(!stale.headers.getSetCookie().some(value => value.includes('session_token=')));
  assert.equal((await request('/api/auth/sign-in/email', {email, password: 'new-password-123'})).status, 200);
});

function request(path, body, cookie = '', headers = {}, method = 'POST', rawBody) {
  return mf.dispatchFetch(origin + path, {method, headers: {origin, cookie, 'Content-Type': 'application/json', 'x-real-ip': `198.51.100.${ip++}`, ...headers}, ...(method === 'GET' && !rawBody ? {} : {body: rawBody ?? JSON.stringify(body)})});
}
async function login(email, password = 'worker-test-pass-123') {
  // Sign-up emails the verification code itself (the worker allows one send
  // per address per minute, so no second send happens here).
  const up = await request('/api/auth/sign-up/email', {name: 'Worker Test', email, password});
  assert.equal(up.status, 200, await up.text());
  const verified = await request('/api/auth/email-otp/verify-email', {email, otp: codes.get(email)});
  assert.equal(verified.status, 200, await verified.clone().text());
  assert.match(verified.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(verified.headers.get('set-cookie'), /SameSite=Lax/i);
  return verified.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
}

test('the built Worker serves pages and enforces BYU permissions at every HTTP endpoint', async () => {
  for (const path of ['/', '/signin', '/account', '/listings/new', '/moderation', '/moderation/analytics']) assert.equal((await request(path, null, '', {}, 'GET')).status, 200, path);
  const signedOut = await (await request('/api/account', null, '', {}, 'GET')).json();
  assert.equal(signedOut.user, null); assert.equal(signedOut.permissions.addListings, false);
  for (const path of ['/api/listings', '/api/listings/tags', '/api/listings/reports']) {
    assert.equal((await request(path, {}, '', {'x-legacy-user-id': 'fake', 'x-legacy-user-email': 'fake@byu.edu'})).status, 401);
  }
  memberCookie = await login('member@student.byu.edu');
  reviewerCookie = await login('reviewer@byu.edu');
  const account = await (await request('/api/account', null, memberCookie, {}, 'GET')).json();
  assert.equal(account.permissions.addListings, true); assert.equal(account.permissions.reviewReports, false);
  assert.equal((await request('/api/moderation/reports', null, memberCookie, {}, 'GET')).status, 403);
  assert.equal((await request('/api/auth/sign-in/email-otp', {email: 'member@student.byu.edu', otp: '123456'})).status, 404);
  assert.equal((await request('/api/auth/sign-in/email', {email: 'member@student.byu.edu', password: 'wrong-password'})).status, 401);
  // A password account exists but its email was never verified: no session.
  const unverified = await request('/api/auth/sign-up/email', {name: 'Unverified', email: 'unverified@student.byu.edu', password: 'worker-test-pass-123'});
  assert.equal(unverified.status, 200, await unverified.text());
  assert.equal((await request('/api/auth/sign-in/email', {email: 'unverified@student.byu.edu', password: 'worker-test-pass-123'})).status, 403);
  // Delivery failures surface instead of claiming a code was sent.
  assert.equal((await request('/api/auth/sign-up/email', {name: 'Failing', email: 'delivery-error@byu.edu', password: 'worker-test-pass-123'})).status, 503);
});

test('the built Worker publishes a listing and tags, stores private reports, and isolates bookmarks', async () => {
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const input = {submissionId: crypto.randomUUID(), title: 'Integration campus gathering', organizer: 'Test club', description: 'Students meet to share ideas and learn together.', category: 'Campus life', location: 'WSC 201', url: 'https://clubs.byu.edu/', allDay: false, start: day + 'T18:00', end: ''};
  assert.equal((await request('/api/listings', input, memberCookie, {origin: 'https://evil.example'})).status, 403);
  const published = await request('/api/listings', input, memberCookie);
  assert.equal(published.status, 201, await published.clone().text());
  eventId = (await published.json()).event.id;
  const tag = await request('/api/listings/tags', {eventId, tag: 'IS', note: 'An Information Systems community event.'}, memberCookie);
  assert.equal(tag.status, 200, await tag.text());
  const report = await request('/api/listings/reports', {eventId, reason: 'Incorrect details', details: 'Private test report for a corrected room.'}, memberCookie);
  assert.equal(report.status, 200, await report.text());
  const calendar = await (await request('/api/events', null, '', {}, 'GET')).json();
  const event = calendar.events.find(e => e.id === eventId);
  assert.equal(event.community, true); assert.ok(event.tags.includes('IS'));
  assert.ok(!JSON.stringify(calendar).includes('Private test report'));
  assert.ok(!JSON.stringify(calendar).includes('member@student.byu.edu'));
  const saved = await request('/api/preferences', {saved: [eventId], views: []}, memberCookie, {}, 'PUT');
  assert.equal(saved.status, 200, await saved.text());
  assert.deepEqual((await (await request('/api/preferences', null, memberCookie, {}, 'GET')).json()).saved, [eventId]);
  assert.deepEqual((await (await request('/api/preferences', null, reviewerCookie, {}, 'GET')).json()).saved, []);
  const review = await (await request('/api/moderation/reports', null, reviewerCookie, {}, 'GET')).json();
  assert.equal(review.reports.length, 1);
  assert.equal((await request('/api/moderation/reports', {id: review.reports[0].id, action: 'hide'}, reviewerCookie)).status, 200);
  assert.ok(!(await (await request('/api/events', null, '', {}, 'GET')).json()).events.some(e => e.id === eventId));
  await request('/api/auth/sign-out', {}, memberCookie);
  assert.equal((await request('/api/listings', input, memberCookie)).status, 401);
});

test('the served single-event ICS hands off to native calendar apps', async () => {
  const calendar = await (await request('/api/events', null, '', {}, 'GET')).json();
  const event = calendar.events.find(e => e.end && !e.allDay);
  assert.ok(event, 'expected a timed event in the merged calendar');
  const served = await request('/api/events/ics?id=' + encodeURIComponent(event.id), null, '', {}, 'GET');
  assert.equal(served.status, 200);
  assert.match(served.headers.get('content-type'), /text\/calendar/);
  assert.match(served.headers.get('content-disposition'), /inline/);
  const body = await served.text();
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, new RegExp('UID:' + event.id));
  assert.equal((await request('/api/events/ics?id=does-not-exist', null, '', {}, 'GET')).status, 404);
  assert.equal((await request('/api/events/ics', null, '', {}, 'GET')).status, 404);
});

test('usage analytics record from the site only and summarize for moderators only', async () => {
  const member = await login('analytics-member@student.byu.edu');
  const reviewer = reviewerCookie || await login('reviewer@byu.edu');
  assert.equal((await request('/api/analytics', {events: [{type: 'view', name: '/'}]}, '', {origin: 'https://evil.example', 'sec-fetch-site': 'cross-site'})).status, 403);
  const beacon = await request('/api/analytics', {events: [{type: 'view', name: '/'}, {type: 'search', name: 'free food', detail: '0'}, {type: 'made-up', name: 'evil'}]});
  assert.equal(beacon.status, 200);
  assert.equal((await beacon.json()).recorded, 2);
  const bot = await request('/api/analytics', {events: [{type: 'view', name: '/'}]}, '', {'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://google.com/bot.html)'});
  assert.equal((await bot.json()).recorded, 0, 'bot beacons are acknowledged but never stored');
  const stored = await db.prepare("SELECT type,name,detail FROM analytics_events ORDER BY type").all();
  assert.equal(stored.results.length, 2);
  assert.equal(stored.results[0].type, 'search');
  assert.equal((await request('/api/analytics', null, '', {}, 'GET')).status, 401, 'signed-out summary access is rejected');
  assert.equal((await request('/api/analytics', null, member, {}, 'GET')).status, 403, 'non-moderator summary access is rejected');
  const summary = await (await request('/api/analytics', null, reviewer, {}, 'GET')).json();
  assert.ok(summary.totals.views30 >= 1);
  assert.ok(summary.topSearches.some(s => s.name === 'free food' && s.zeros === 1));
  assert.ok(Array.isArray(summary.sources) && summary.sources.length > 0);
  assert.ok(summary.inventory.upcomingEvents > 0);
  assert.equal(summary.community.accountsTotal >= 2, true);
});

test('server-rendered event pages expose Event structured data and 404 cleanly', async () => {
  const calendar = await (await request('/api/events', null, '', {}, 'GET')).json();
  const event = calendar.events.find(e => e.end && !e.allDay);
  assert.ok(event, 'expected a timed event in the merged calendar');
  const page = await request('/events/' + encodeURIComponent(event.id), null, '', {}, 'GET');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('application/ld+json'), 'event page embeds JSON-LD');
  assert.ok(html.includes('"@type":"Event"'), 'JSON-LD is a schema.org Event');
  assert.ok(html.includes(event.title), 'event title renders');
  assert.ok(html.includes('rel="canonical"') || html.includes("rel='canonical'"), 'canonical URL present');
  assert.ok(html.includes('/?event='), 'links back into the live calendar');
  assert.equal((await request('/events/does-not-exist-at-all', null, '', {}, 'GET')).status, 404);
  // Browsing to a stale event id must not leak an error page.
  const gone = await request('/events/does-not-exist-at-all', null, '', {}, 'GET');
  assert.ok(!(await gone.text()).includes('stack'));
});

test('topic landing pages render live matches and unknown topics 404', async () => {
  const topic = await request('/topics/free-food', null, '', {}, 'GET');
  assert.equal(topic.status, 200);
  const html = await topic.text();
  assert.match(html, /Food provided/i);
  assert.match(html, /href="\/topics\//);
  assert.match(html, /Browse these in the live calendar/);
  assert.equal((await request('/topics/definitely-not-a-topic', null, '', {}, 'GET')).status, 404);
});

test('the sitemap advertises core, topic, and event URLs', async () => {
  const sitemap = await request('/sitemap.xml', null, '', {}, 'GET');
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.match(xml, /<urlset/);
  assert.match(xml, /https:\/\/byucalendar\.com\/<\/loc>/);
  assert.match(xml, /\/topics\/free-food<\/loc>/);
  assert.match(xml, /\/events\/[a-z0-9-]+<\/loc>/);
  assert.doesNotMatch(xml, /\/signin|\/moderation|\/api\//);
});

test('the built Worker resets passwords through emailed codes and revokes old sessions', async () => {
  const email = 'resetter@student.byu.edu';
  const oldCookie = await login(email);
  // The real per-address send limit allows one email per minute; clear the
  // quota row so the reset code can be sent right after the sign-up code.
  await db.prepare("DELETE FROM action_limits WHERE key LIKE 'email-minute:%'").run();
  assert.equal((await request('/api/auth/email-otp/request-password-reset', {email})).status, 200);
  const reset = await request('/api/auth/email-otp/reset-password', {email, otp: codes.get(email), password: 'worker-test-pass-456'});
  assert.equal(reset.status, 200, await reset.text());
  const revoked = await (await request('/api/account', null, oldCookie, {}, 'GET')).json();
  assert.equal(revoked.user, null);
  assert.equal((await request('/api/auth/sign-in/email', {email, password: 'worker-test-pass-123'})).status, 401);
  assert.equal((await request('/api/auth/sign-in/email', {email, password: 'worker-test-pass-456'})).status, 200);
});

test('the built Worker receives privacy mail through the signed webhook and lets moderators reply', async () => {
  const inbox = 'privacy@byucalendar.com';
  const payloadData = {email_id: 'inbound-test-1', from: 'citizen@example.com', to: [inbox], subject: 'Privacy request', message_id: '<msg-1@example.com>', created_at: new Date().toISOString()};
  function signedWebhook(data, secret = inboundSecret) {
    const body = JSON.stringify({type: 'email.received', created_at: new Date().toISOString(), data});
    const id = 'msg_' + Math.random().toString(36).slice(2), timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signature = 'v1,' + createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
    return request('/api/emails/inbound', null, '', {'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature, 'Content-Type': 'application/json'}, 'POST', body);
  }
  assert.equal((await request('/api/emails', null, '', {}, 'GET')).status, 401, 'inbox list requires sign-in');
  assert.equal((await request('/api/emails/inbound', {type: 'email.received', data: payloadData})).status, 401, 'unsigned webhook posts are rejected');
  assert.equal((await signedWebhook(payloadData, 'whsec_' + Buffer.from('wrong-secret').toString('base64'))).status, 401, 'wrong-secret webhook posts are rejected');
  memberCookie = memberCookie || await login('member@student.byu.edu');
  reviewerCookie = reviewerCookie || await login('reviewer@byu.edu');
  // An earlier test signs the shared member session out, so use a fresh
  // non-moderator account for the permission checks here.
  const inboxerCookie = await login('inboxer@student.byu.edu');
  assert.equal((await request('/api/emails', null, inboxerCookie, {}, 'GET')).status, 403, 'non-moderators cannot list the inbox');
  const stored = await signedWebhook(payloadData);
  assert.equal(stored.status, 200, await stored.clone().text());
  assert.equal((await stored.json()).received, true);
  assert.equal((await signedWebhook(payloadData)).status, 200, 'at-least-once replay succeeds');
  const skipped = await signedWebhook({...payloadData, email_id: 'inbound-test-2', to: ['other@byucalendar.com']});
  assert.deepEqual(await skipped.json(), {received: false}, 'mail for other addresses is acknowledged but not stored');
  const list = await (await request('/api/emails', null, reviewerCookie, {}, 'GET')).json();
  assert.equal(list.configured, true);
  assert.equal(list.inboxAddress, inbox);
  assert.equal(list.emails.length, 1, 'replays and other-recipient mail are not duplicated');
  const message = list.emails[0];
  assert.equal(message.fromAddress, 'citizen@example.com');
  assert.match(message.bodyText, /delete my data/);
  assert.equal(message.readAt, null);
  assert.equal((await request('/api/emails/reply', {id: message.id, body: 'Working on it.'}, inboxerCookie)).status, 403, 'non-moderators cannot reply');
  const reply = await request('/api/emails/reply', {id: message.id, body: '  We removed your data. Sorry for the trouble.  '}, reviewerCookie);
  assert.equal(reply.status, 200, await reply.clone().text());
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to[0], 'citizen@example.com');
  assert.match(sent[0].from, /privacy@byucalendar\.com/);
  assert.equal(sent[0].subject, 'Re: Privacy request');
  assert.equal(sent[0].headers['In-Reply-To'], '<msg-1@example.com>');
  assert.match(sent[0].text, /We removed your data/);
  assert.equal((await request('/api/emails/reply', {id: 'missing-id', body: 'hi'}, reviewerCookie)).status, 404);
  assert.equal((await request('/api/emails/read', {id: message.id}, reviewerCookie)).status, 200);
  const after = await (await request('/api/emails', null, reviewerCookie, {}, 'GET')).json();
  assert.equal(after.emails.length, 1);
  assert.ok(after.emails[0].readAt, 'read marker stored');
  assert.ok(after.emails[0].repliedAt, 'replied marker stored');
  assert.equal(after.emails[0].replies.length, 1);
  assert.equal(after.emails[0].replies[0].sentBy, 'reviewer@byu.edu');
  assert.match(after.emails[0].replies[0].bodyText, /We removed your data/);
});

test('the built Worker lets authors update and delete only their own listings', async () => {
  const authorCookie = await login('editor@student.byu.edu');
  const otherCookie = await login('other@student.byu.edu');
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const input = {submissionId: crypto.randomUUID(), title: 'Editable campus gathering', organizer: 'Editor club', description: 'Students meet to share ideas and learn together.', category: 'Campus life', location: 'WSC 202', url: 'https://clubs.byu.edu/', allDay: false, start: day + 'T18:00', end: ''};
  const created = await request('/api/listings', input, authorCookie);
  const createdBody = await created.json();
  assert.equal(created.status, 201, JSON.stringify(createdBody));
  const id = createdBody.event.id;

  assert.equal((await request('/api/listings/mine', null, '', {}, 'GET')).status, 401);
  const mine = await (await request('/api/listings/mine', null, authorCookie, {}, 'GET')).json();
  assert.ok(mine.listings.some(e => e.id === id));
  assert.ok(!(await (await request('/api/listings/mine', null, otherCookie, {}, 'GET')).json()).listings.some(e => e.id === id));

  const fields = {id, title: 'Edited campus gathering', organizer: 'Editor club', description: 'Students meet to share ideas and learn together. Now with updates.', category: 'Campus life', location: 'WSC 203', url: 'https://clubs.byu.edu/', start: day + 'T18:00', end: '', allDay: false};
  assert.equal((await request('/api/listings/update', fields, otherCookie)).status, 403);
  const update = await request('/api/listings/update', fields, authorCookie);
  assert.equal(update.status, 200, await update.text());
  const calendar = await (await request('/api/events', null, '', {}, 'GET')).json();
  const edited = calendar.events.find(e => e.id === id);
  assert.equal(edited.title, 'Edited campus gathering');
  assert.equal(edited.location, 'WSC 203');

  assert.equal((await request('/api/listings/delete', {id}, otherCookie)).status, 403);
  assert.equal((await request('/api/listings/delete', {id}, authorCookie)).status, 200);
  assert.ok(!((await (await request('/api/events', null, '', {}, 'GET')).json()).events.some(e => e.id === id)));
  assert.ok(!(await (await request('/api/listings/mine', null, authorCookie, {}, 'GET')).json()).listings.some(e => e.id === id));
});

test('smart search interpretation is same-origin, model-backed, clamped, and cached', async () => {
  const blocked = await request('/api/search/assist', {query: 'I want to go to a ballet'}, '', {origin: 'https://evil.example', 'sec-fetch-site': 'cross-site'});
  assert.equal(blocked.status, 403);
  assert.equal((await request('/api/search/assist', {query: '   '})).status, 400);
  const assisted = await request('/api/search/assist', {query: 'I want to go to a ballet soon'});
  assert.equal(assisted.status, 200, await assisted.clone().text());
  const body = await assisted.json();
  assert.equal(body.cached, false);
  assert.deepEqual(body.intent.tags, ['Performances']);
  assert.equal(body.intent.start, new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));
  assert.deepEqual(body.intent.words, ['ballet']);
  assert.match(body.summary, /Ballet performances/);
  // A repeated query is served from the cache without a second model call.
  const repeat = await request('/api/search/assist', {query: 'I want to go to a ballet soon'});
  assert.equal((await repeat.json()).cached, true);
  // Garbage model output degrades to an honest 503 rather than empty filters.
  const broken = await request('/api/search/assist', {query: 'unparseable phrase request'});
  assert.equal(broken.status, 503);
});

test('moderators correct, hide, and restore source listings over HTTP', async () => {
  const pick = async () => (await (await request('/api/events', null, '', {}, 'GET')).json()).events.find(e => !e.community && e.location);
  const target = await pick();
  assert.ok(target, 'expected a source listing with a location in the merged calendar');
  // Members cannot use the moderation endpoint (an earlier test signs the shared member out).
  const plainMember = await login('plain-member@byu.edu');
  assert.equal((await request('/api/moderation/events', {action: 'update', id: target.id, location: 'WSC 101'}, plainMember)).status, 403);
  assert.equal((await request('/api/moderation/events', {action: 'delete', id: target.id}, plainMember)).status, 403);
  // A moderator adds a campus location; the merged calendar reflects it read-time.
  const corrected = await request('/api/moderation/events', {action: 'update', id: target.id, location: 'Tanner Building 240'}, reviewerCookie);
  assert.equal(corrected.status, 200, await corrected.clone().text());
  const correctedEvent = (await (await request('/api/events', null, '', {}, 'GET')).json()).events.find(e => e.id === target.id);
  assert.equal(correctedEvent.location, 'Tanner Building 240');
  assert.equal(correctedEvent.overridden, true);
  // The inventory lists the correction for the review page.
  let inv = await (await request('/api/moderation/events', null, reviewerCookie, {}, 'GET')).json();
  assert.ok(inv.overrides.some(o => o.id === target.id && o.location === 'Tanner Building 240'));
  // Hiding removes the listing from the feed but keeps it restorable with its title.
  assert.equal((await request('/api/moderation/events', {action: 'delete', id: target.id}, reviewerCookie)).status, 200);
  assert.ok(!((await (await request('/api/events', null, '', {}, 'GET')).json()).events.some(e => e.id === target.id)));
  inv = await (await request('/api/moderation/events', null, reviewerCookie, {}, 'GET')).json();
  const hiddenRow = inv.hidden.find(h => h.id === target.id);
  assert.ok(hiddenRow && hiddenRow.title);
  assert.equal((await request('/api/moderation/events', {action: 'restore', id: target.id}, reviewerCookie)).status, 200);
  assert.ok((await (await request('/api/events', null, '', {}, 'GET')).json()).events.some(e => e.id === target.id));
  // Reverting the correction restores the source location.
  assert.equal((await request('/api/moderation/events', {action: 'revert', id: target.id}, reviewerCookie)).status, 200);
  const reverted = (await (await request('/api/events', null, '', {}, 'GET')).json()).events.find(e => e.id === target.id);
  assert.equal(reverted.location, target.location);
  assert.ok(!reverted.overridden);
});

test('the daily digest is opt-in, emails opted members once per day, and honors unsubscribe', async () => {
  const email = 'digest-member@student.byu.edu';
  const cookie = await login(email, 'digest-test-pass-123');
  // An event later today (Mountain Time) with no end always lands in today's digest.
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Denver'}).format(new Date());
  const input = {submissionId: crypto.randomUUID(), title: 'Integration digest meetup', organizer: 'Digest club', description: 'Daily digest verification event.', category: 'Campus life', location: 'TNRB 260', url: 'https://clubs.byu.edu/', allDay: false, start: today + 'T23:59', end: ''};
  const published = await request('/api/listings', input, cookie);
  assert.equal(published.status, 201, await published.clone().text());
  const listingId = (await published.json()).event.id;
  assert.equal((await request('/api/preferences', {saved: [listingId], views: []}, cookie, {}, 'PUT')).status, 200);
  assert.equal((await (await request('/api/preferences', null, cookie, {}, 'GET')).json()).digestOptedIn, false);
  // The digest is off until the member opts in: saved events alone send nothing.
  assert.equal((await request('/api/reminders/dispatch?force=1', null, '', {authorization: 'Bearer test-dispatch-token'})).status, 200);
  assert.ok(!sent.some(message => message.to[0] === email), 'no digest goes out without an explicit opt-in');
  assert.equal((await request('/api/preferences/digest', {optedIn: true}, cookie)).status, 200);
  // Only the cron holding the shared dispatch token may trigger a send.
  assert.equal((await request('/api/reminders/dispatch', null, '')).status, 403);
  assert.equal((await request('/api/reminders/dispatch', null, '', {authorization: 'Bearer wrong-token'})).status, 403);
  const digest = await request('/api/reminders/dispatch?force=1', null, '', {authorization: 'Bearer test-dispatch-token'});
  assert.equal(digest.status, 200, await digest.clone().text());
  assert.equal((await digest.json()).sent, 1);
  const sentEmail = sent.find(message => message.to[0] === email);
  assert.ok(sentEmail, 'the digest email was intercepted');
  assert.match(sentEmail.subject, /saved events/);
  assert.ok(sentEmail.text.includes('Integration digest meetup'), sentEmail.text);
  assert.ok(sentEmail.text.includes('/events/' + encodeURIComponent(listingId)));
  assert.match(sentEmail.headers['List-Unsubscribe'], /unsubscribe\?u=/);
  assert.equal(sentEmail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  // The per-day mark keeps an immediately repeated run from sending again.
  const again = await request('/api/reminders/dispatch?force=1', null, '', {authorization: 'Bearer test-dispatch-token'});
  assert.equal((await again.json()).sent, 0);
  // The signed unsubscribe link flips the setting without a session.
  const unsubUrl = new URL(sentEmail.headers['List-Unsubscribe'].replace(/^<|>$/g, ''));
  assert.equal((await request(`/api/reminders/unsubscribe?u=${encodeURIComponent(unsubUrl.searchParams.get('u'))}&t=tampered`, null, '', {}, 'GET')).status, 403);
  const good = await request('/api/reminders/unsubscribe?' + unsubUrl.searchParams, null, '', {}, 'GET');
  assert.equal(good.status, 200, await good.clone().text());
  assert.match(await good.text(), /unsubscribed/i);
  assert.equal((await (await request('/api/preferences', null, cookie, {}, 'GET')).json()).digestOptedIn, false);
  const optedOut = await request('/api/reminders/dispatch?force=1', null, '', {authorization: 'Bearer test-dispatch-token'});
  assert.equal((await optedOut.json()).sent, 0);
  // Re-enabling from the account toggle never re-sends a day that already went out.
  assert.equal((await request('/api/preferences/digest', {optedIn: true}, cookie)).status, 200);
  const reenabled = await request('/api/reminders/dispatch?force=1', null, '', {authorization: 'Bearer test-dispatch-token'});
  assert.equal((await reenabled.json()).sent, 0);
  // The toggle is account-gated and strictly validated.
  assert.equal((await request('/api/preferences/digest', {optedIn: true})).status, 401);
  assert.equal((await request('/api/preferences/digest', {optedIn: 'yes'}, cookie)).status, 400);
});

test('personal picks: chat builds a profile, activity feeds tastes, and signature events are marked', async () => {
  const cookie = await login('picks-member@student.byu.edu');
  // All three endpoints are members-only; the chat and activity beacons are
  // additionally same-origin.
  assert.equal((await request('/api/profile/chat', {answers: []})).status, 401);
  assert.equal((await request('/api/profile/activity', {type: 'save', eventId: 'x'})).status, 401);
  assert.equal((await request('/api/recommendations', null, '', {}, 'GET')).status, 401);
  assert.equal((await request('/api/profile/chat', {answers: []}, cookie, {origin: 'https://evil.example'})).status, 403);
  assert.equal((await request('/api/profile/activity', {type: 'save', eventId: 'x'}, cookie, {origin: 'https://evil.example'})).status, 403);
  // The model phrases the first question; the clamped shape comes through.
  const first = await (await request('/api/profile/chat', {answers: []}, cookie)).json();
  assert.equal(first.done, false);
  assert.equal(first.step.key, 'interests');
  assert.ok(first.step.options.length >= 2);
  // A typed answer takes effect immediately, before the conversation
  // completes — a member who closes the dialog mid-chat keeps what they typed.
  const partialMember = await login('progressive-member@student.byu.edu');
  const partial = await (await request('/api/profile/chat', {answers: [{question: 'Which subjects do you care about?', key: 'interests', options: [], free: "I'm in AIS club and I'm an IS student"}]}, partialMember)).json();
  assert.equal(partial.done, false, 'the model asked its next question');
  const partialPicks = await (await request('/api/recommendations', null, partialMember, {}, 'GET')).json();
  assert.equal(partialPicks.hasProfile, true);
  assert.deepEqual([...partialPicks.profile.interests].sort(), ['AIS', 'IS']);
  assert.ok(partialPicks.picks.length > 0);
  assert.ok(partialPicks.picks.some(pick => pick.reasons.includes('IS') || pick.reasons.includes('AIS')), 'IS/AIS events surface from the partial profile');
  // A follow-up exchange that contributes nothing new cannot wipe the mined
  // interests.
  await request('/api/profile/chat', {answers: [{question: 'Which subjects do you care about?', key: 'interests', options: [], free: 'AIS club'}, {question: 'Anything else?', key: 'extra', options: []}]}, partialMember);
  const afterSkip = await (await request('/api/recommendations', null, partialMember, {}, 'GET')).json();
  assert.deepEqual([...afterSkip.profile.interests].sort(), ['AIS', 'IS']);
  // A finished conversation stores the canonicalized profile ("Information
  // systems" -> IS) without another model call.
  const finished = await (await request('/api/profile/chat', {answers: Array(5).fill({question: 'Which subjects do you care about?', key: 'interests', options: ['Information systems']})}, cookie)).json();
  assert.equal(finished.done, true);
  assert.deepEqual(finished.profile.interests, ['IS']);
  // Typed free-response answers canonicalize the same way, on the server.
  const typed = await (await request('/api/profile/chat', {answers: Array(5).fill({question: 'Which subjects do you care about?', key: 'interests', options: [], free: "I'm in IS and I go to AIS stuff — free food is a plus"})}, cookie)).json();
  assert.equal(typed.done, true);
  assert.deepEqual([...typed.profile.interests].sort(), ['AIS', 'IS']);
  assert.deepEqual(typed.profile.details, ['Food provided']);
  assert.equal((await request('/api/profile/chat', {answers: [{question: 'q', key: 'k', options: [], free: 'x'.repeat(301)}]}, cookie)).status, 400);
  // Signature events carry the Important marker end to end, including
  // community submissions, because flagging is layered at read time.
  const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const fair = await request('/api/listings', {submissionId: crypto.randomUUID(), title: 'STEM Career Fair', organizer: 'Career center', description: 'Employers across science, technology, engineering, and math recruit on campus.', category: 'Career & business', location: 'WSC Ballroom', url: 'https://byu.edu/', allDay: false, start: day + 'T19:00', end: ''}, cookie);
  assert.equal(fair.status, 201, await fair.clone().text());
  const fairId = (await fair.json()).event.id;
  const calendar = await (await request('/api/events', null, '', {}, 'GET')).json();
  const flagged = calendar.events.find(e => e.id === fairId);
  assert.equal(flagged.important, 'Annual STEM fair');
  assert.ok(flagged.tags.includes('Important'));
  // Activity resolves only for real calendar listings; ghost ids do nothing.
  assert.equal((await (await request('/api/profile/activity', {type: 'save', eventId: fairId}, cookie)).json()).ok, true);
  assert.equal((await (await request('/api/profile/activity', {type: 'event_view', eventId: 'byu:ghost'}, cookie)).json()).ok, false);
  assert.equal((await (await request('/api/profile/activity', {type: 'nonsense', eventId: fairId}, cookie)).json()).ok, false);
  // Tastes from real activity surface as ranked picks with reasons.
  const picks = await (await request('/api/recommendations', null, cookie, {}, 'GET')).json();
  assert.equal(picks.hasProfile, true);
  const pick = picks.picks.find(p => p.id === fairId);
  assert.ok(pick, 'expected the STEM fair among picks');
  assert.ok(pick.reasons.length > 0);
  // Tuning the picks restarts the member completely: restart clears the
  // stored profile and the activity taste counters, so the rebuilt picks
  // reflect only what the new conversation says.
  const restarted = await (await request('/api/profile/chat', {restart: true}, cookie)).json();
  assert.equal(restarted.done, false, 'the model asks a fresh first question');
  const wiped = await (await request('/api/recommendations', null, cookie, {}, 'GET')).json();
  assert.equal(wiped.hasProfile, false);
  assert.equal(wiped.profile, null);
  assert.deepEqual(wiped.picks, [], 'activity tastes cleared with the profile');
  // The next conversation rebuilds the profile from its answers alone.
  const rebuilt = await (await request('/api/profile/chat', {answers: Array(5).fill({question: 'Which subjects do you care about?', key: 'interests', options: [], free: 'AIS and free food'})}, cookie)).json();
  assert.equal(rebuilt.done, true);
  const fresh = await (await request('/api/recommendations', null, cookie, {}, 'GET')).json();
  assert.equal(fresh.hasProfile, true);
  assert.deepEqual([...fresh.profile.interests], ['AIS']);
  assert.deepEqual(fresh.profile.details, ['Food provided']);
  assert.ok(fresh.picks.length > 0, 'picks rebuild from the new answers');
});


test('the live subscription feed serves calendar apps and keeps personal links signed', async () => {
  const subscriber = await login('subscriber@student.byu.edu');

  // The public feed needs no session and advertises its own refresh cadence.
  const publicFeed = await request('/api/calendar/ics', null, '', {}, 'GET');
  assert.equal(publicFeed.status, 200);
  assert.match(publicFeed.headers.get('content-type'), /text\/calendar/);
  const publicBody = await publicFeed.text();
  assert.match(publicBody, /^BEGIN:VCALENDAR/);
  assert.match(publicBody, /X-WR-CALNAME:BYU Calendar/);
  assert.match(publicBody, /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
  assert.match(publicBody, /END:VCALENDAR\r\n$/);

  // A filtered subscription is named after what it contains, and unknown
  // vocabulary in a hand-edited URL is dropped rather than echoed back.
  const filtered = await (await request('/api/calendar/ics?q=career&categories=Not%20A%20Category', null, '', {}, 'GET')).text();
  assert.match(filtered, /X-WR-CALNAME:BYU Calendar — career/);

  // Personal links are only issued to a verified member...
  assert.equal((await request('/api/preferences/feed', null, '', {}, 'GET')).status, 401);
  const event = (await (await request('/api/events', null, '', {}, 'GET')).json()).events.find(candidate => !candidate.cancelled && new Date(candidate.end || candidate.start).getTime() > Date.now());
  assert.ok(event, 'expected an upcoming event in the seed');

  // ...the note kept for a saved event is stored with it, and a note for an
  // event that is not saved is pruned instead of accumulating.
  const note = {title: event.title.slice(0, 200), day: new Date(event.start).toISOString().slice(0, 10)};
  assert.equal((await request('/api/preferences', {saved: [event.id], views: [], savedMeta: {[event.id]: note, 'byu:ghost': note}}, subscriber, {}, 'PUT')).status, 200);
  const stored = await (await request('/api/preferences', null, subscriber, {}, 'GET')).json();
  assert.deepEqual(Object.keys(stored.savedMeta), [event.id]);
  assert.equal(stored.savedMeta[event.id].title, note.title);
  // A note that is not shaped like a calendar day is rejected outright.
  assert.equal((await request('/api/preferences', {saved: [event.id], views: [], savedMeta: {[event.id]: {...note, day: 'next tuesday'}}}, subscriber, {}, 'PUT')).status, 400);

  const issued = await (await request('/api/preferences/feed', null, subscriber, {}, 'GET')).json();
  assert.match(issued.url, /^http:\/\/localhost:8790\/api\/calendar\/ics\?t=/);
  assert.match(issued.webcal, /^webcal:\/\/localhost:8790\//);

  // The link works from a calendar app with no cookie at all.
  const personalUrl = new URL(issued.url);
  const personal = await request(personalUrl.pathname + personalUrl.search, null, '', {}, 'GET');
  assert.equal(personal.status, 200);
  const personalBody = await personal.text();
  assert.match(personalBody, /X-WR-CALNAME:BYU Calendar — My saved events/);
  assert.ok(personalBody.includes('UID:' + event.id + '@byu-calendar'), 'the saved event is in the personal feed');
  // A tampered token is refused rather than serving someone else's calendar.
  assert.equal((await request(personalUrl.pathname + personalUrl.search.slice(0, -3) + 'aaa', null, '', {}, 'GET')).status, 403);
});

test('an unknown address renders the custom off-the-calendar page with a real 404', async () => {
  const missing = await request('/no-such-page?from=test', null, '', {}, 'GET');
  assert.equal(missing.status, 404);
  const body = await missing.text();
  assert.match(body, /Page not found/);
  assert.match(body, /Lost on Campus/);
  assert.doesNotMatch(body, /Campus found|Adventure is out there/);
  assert.match(body, /Back to the calendar/);
});


test('campus explorer has a direct entrance without eagerly mounting the game', async () => {
  const response = await request('/explore', null, '', {}, 'GET');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /Lost on Campus/);
  assert.match(html, />\s*Play\s*</, 'the entrance offers a Play button');
  assert.match(html, /href="\/"/);
  assert.match(html, /rel="canonical"[^>]*href="https:\/\/byucalendar\.com\/explore"/);
  assert.doesNotMatch(html, /<iframe\b/i, 'the world must not mount before the player chooses Play');
});

test('unknown pages keep a real 404 and working calendar recovery before the game starts', async () => {
  const response = await request('/a-missing-campus-page-for-integration', null, '', {}, 'GET');
  assert.equal(response.status, 404);
  const html = await response.text();
  assert.match(html, /Page not found/);
  assert.match(html, /Lost on Campus/);
  assert.match(html, />\s*Play\s*</, 'the missing-page entrance offers a Play button');
  assert.match(html, /Back to the calendar/);
  assert.match(html, /href="\/"/);
  assert.doesNotMatch(html, /<iframe\b/i);
});

test('the campus game entry serves a separate grounded model while the ordinary map stays small', async () => {
  const response = await request('/explorer/index.html?v=20261026game1', null, '', {}, 'GET');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /<canvas\b[^>]*id="world"/);
  assert.match(html, /<script\b[^>]*type="importmap"/);
  const entry = html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/);
  assert.ok(entry, 'the standalone game should reference a module entry');
  const entryPath = new URL(entry[1], origin + '/explorer/index.html');
  assert.equal(entryPath.origin, origin, 'game source stays on this origin');
  const moduleResponse = await request(entryPath.pathname + entryPath.search, null, '', {}, 'GET');
  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get('content-type'), /(?:javascript|ecmascript)/);
  const gameSource=await moduleResponse.text();
  assert.match(gameSource,/\/explorer\/campus\/campus_web\.glb/);
  assert.match(gameSource,/Race gate/);
  assert.match(gameSource,/bestRuns/);
  assert.match(gameSource,/campus-common-table/, 'the production bundle includes the final campus activity');
  assert.match(gameSource,/campusActivities/, 'the production bundle carries additive campus saves');
  const stylesheet=html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/);
  assert.ok(stylesheet);
  const cssPath=new URL(stylesheet[1],origin+'/explorer/index.html');
  const cssResponse=await request(cssPath.pathname,null,'',{},'GET');
  assert.equal(cssResponse.status,200);
  const css=await cssResponse.text();
  assert.match(css,/\.race-hud\b/);
  assert.match(css,/\.race-result\b/);
  assert.match(css,/\.campus-journal-filters\b/, 'the filtered campus journal ships in the production stylesheet');
  assert.doesNotMatch(html,/game\/play\.css/, 'race styles ship in the same hashed production stylesheet');
  const model = await request('/campus/campus_web.glb?v=20261015', null, '', {}, 'GET');
  assert.equal(model.status, 200);
  const ordinaryBytes = new Uint8Array(await model.arrayBuffer());
  const signature = ordinaryBytes.slice(0, 4);
  assert.deepEqual([...signature], [0x67, 0x6c, 0x54, 0x46], 'shared campus model remains a GLB asset');
  assert.equal(ordinaryBytes.length,4_614_272);
  const gameModel=await request('/explorer/campus/campus_web.glb?v=20261102buildings2',null,'',{},'GET');
  assert.equal(gameModel.status,200);
  const gameBytes=new Uint8Array(await gameModel.arrayBuffer());
  assert.equal(gameBytes.length,8_788_124);
  const navigation=JSON.parse(readFileSync('public'+NAVIGATION_URL,'utf8'));
  assert.equal(createHash('sha256').update(gameBytes).digest('hex'),navigation.modelSha256);
  const gameCatalog=await request('/explorer/campus/coordinates.json?v=20261102buildings2',null,'',{},'GET');
  assert.equal(gameCatalog.status,200);
  const deliveredCatalog=await gameCatalog.json();
  assert.deepEqual(deliveredCatalog,JSON.parse(readFileSync('public/explorer/campus/coordinates.json','utf8')),'the built game must serve its matching current catalog');
  assert.equal(deliveredCatalog.features.length,527);
  for(const id of ['r4871647','w60110296'])assert.match(deliveredCatalog.features.find(f=>f.id===id).notes,/November 2026 Part 2/);
});

test('the built Worker verifies BYU staff, labels their events officially, and scopes their edits', async () => {
  const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const adminCookie = reviewerCookie || await login('reviewer@byu.edu');
  const staffCookie = await login('prof-law@byu.edu');
  const studentCookie = await login('student-two@student.byu.edu');
  // Requests require a verified session and a real area; unknown areas fail.
  assert.equal((await request('/api/staff/request', {area: 'law'}, '')).status, 401, 'staff requests need a session');
  assert.equal((await request('/api/staff/request', {area: 'not-an-area'}, staffCookie)).status, 400);
  assert.equal((await request('/api/staff/request', {area: 'law'}, staffCookie)).status, 200);
  assert.equal((await (await request('/api/account', null, staffCookie, {}, 'GET')).json()).staff.status, 'pending');
  // Only administrators can review requests.
  assert.equal((await request('/api/moderation/staff', null, studentCookie, {}, 'GET')).status, 403);
  assert.equal((await request('/api/moderation/staff', {userId: 'x', action: 'approve'}, studentCookie)).status, 403);
  const queue = await (await request('/api/moderation/staff', null, adminCookie, {}, 'GET')).json();
  const request0 = queue.requests.find(row => row.email === 'prof-law@byu.edu');
  assert.ok(request0, 'the pending request appears in the queue');
  assert.equal(request0.status, 'pending');
  assert.equal((await request('/api/moderation/staff', {userId: request0.userId, action: 'approve'}, adminCookie)).status, 200);
  const staffAccount = await (await request('/api/account', null, staffCookie, {}, 'GET')).json();
  assert.equal(staffAccount.staff.status, 'verified'); assert.equal(staffAccount.staff.area, 'law');
  // A verified staff listing reads as a BYU-added event; a student listing does not.
  const staffListing = {submissionId: crypto.randomUUID(), title: 'Law careers conversation', organizer: 'BYU Law School', description: 'Faculty host a conversation about legal careers with students.', category: 'Academic', location: 'JRCB 205', url: 'https://law.byu.edu/', allDay: false, start: day + 'T17:00', end: ''};
  assert.equal((await request('/api/listings', staffListing, staffCookie)).status, 201, 'staff listing publishes');
  const studentListing = {submissionId: crypto.randomUUID(), title: 'Student pickup basketball', organizer: 'Campus club', description: 'An open basketball night for every skill level on campus.', category: 'Sports & recreation', location: 'RB courts', url: 'https://clubs.byu.edu/', allDay: false, start: day + 'T19:00', end: ''};
  const published = await request('/api/listings', studentListing, studentCookie);
  assert.equal(published.status, 201, await published.clone().text());
  const publishedEvent = (await published.json()).event;
  const calendar = await (await request('/api/events', null, '', {}, 'GET')).json();
  const official = calendar.events.find(e => e.title === 'Law careers conversation');
  const ordinary = calendar.events.find(e => e.id === publishedEvent.id);
  assert.equal(official.byuOfficial, true); assert.equal(official.community, true);
  assert.equal(ordinary.byuOfficial, undefined); assert.equal(ordinary.community, true);
  // Staff can correct a law-school source listing, but not an out-of-area one,
  // and can never hide or delete.
  const lawSource = calendar.events.find(e => e.sourceId === 'law' && !e.community);
  assert.ok(lawSource, 'seed calendar carries law listings');
  const corrected = await request('/api/moderation/events', {action: 'update', id: lawSource.id, location: 'JRCB - confirmed room'}, staffCookie);
  assert.equal(corrected.status, 200, await corrected.clone().text());
  const outside = calendar.events.find(e => e.sourceId === 'byu' && e.category !== 'Academic');
  assert.equal((await request('/api/moderation/events', {action: 'update', id: outside.id, location: 'Nowhere'}, staffCookie)).status, 403, 'out-of-area edits are refused');
  assert.equal((await request('/api/moderation/events', {action: 'delete', id: lawSource.id}, staffCookie)).status, 403, 'staff cannot hide listings');
  assert.equal((await request('/api/moderation/events', {action: 'update', id: lawSource.id, location: 'JRCB - student attempt'}, studentCookie)).status, 403, 'students cannot correct source listings');
  const after = await (await request('/api/events', null, '', {}, 'GET')).json();
  assert.equal(after.events.find(e => e.id === lawSource.id).location, 'JRCB - confirmed room');
  // Revoking takes the official label and the edit rights back.
  assert.equal((await request('/api/moderation/staff', {userId: request0.userId, action: 'revoke'}, adminCookie)).status, 200);
  const revokedAccount = await (await request('/api/account', null, staffCookie, {}, 'GET')).json();
  assert.equal(revokedAccount.staff.status, 'denied');
  const afterRevoke = await (await request('/api/events', null, '', {}, 'GET')).json();
  assert.equal(afterRevoke.events.find(e => e.title === 'Law careers conversation').byuOfficial, undefined);
  assert.equal((await request('/api/moderation/events', {action: 'update', id: lawSource.id, location: 'JRCB - after revoke'}, staffCookie)).status, 403, 'revoked staff lose area edits');
});

test('directory-listed BYU staff verify automatically at request time', async () => {
  const staffCookie = await login('mclain@byu.edu');
  const response = await request('/api/staff/request', {area: 'engineering'}, staffCookie);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).status, 'verified');
  const account = await (await request('/api/account', null, staffCookie, {}, 'GET')).json();
  assert.equal(account.staff.autoVerified, true);
  assert.equal(account.staff.area, 'engineering');
  // The queue marks it verified with the auto flag for administrators.
  const queue = await (await request('/api/moderation/staff', null, reviewerCookie || await login('reviewer@byu.edu'), {}, 'GET')).json();
  const row = queue.requests.find(r => r.email === 'mclain@byu.edu');
  assert.ok(row && row.status === 'verified' && row.autoVerified === true);
});

test('saving events builds RSVP lists with avatar profiles and privacy rules', async () => {
  const cookieA = await login('rsvp-a@byu.edu');
  const cookieB = await login('rsvp-b@student.byu.edu');
  const events = (await (await request('/api/events', null, '', {}, 'GET')).json()).events;
  const target = events[0];
  assert.equal((await request('/api/preferences', {saved: [target.id], views: []}, cookieA, {}, 'PUT')).status, 200);
  assert.equal((await request('/api/preferences', {saved: [target.id], views: []}, cookieB, {}, 'PUT')).status, 200);
  // Signed-out visitors see initials only, never names or emails.
  const anonymous = await (await request('/api/events/rsvp?id=' + encodeURIComponent(target.id), null, '', {}, 'GET')).json();
  assert.equal(anonymous.count, 2);
  assert.ok(anonymous.members.every(m => m.initial && !('name' in m) && !('email' in m)));
  // Verified members see the name and BYU email.
  const seen = await (await request('/api/events/rsvp?id=' + encodeURIComponent(target.id), null, cookieA, {}, 'GET')).json();
  assert.ok(seen.members.every(m => typeof m.name === 'string' && /@(student\.)?byu\.edu$/.test(m.email)));
  // Avatars must be real picture data URLs; anything else is rejected.
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal((await request('/api/profile', {avatar: tiny}, cookieA, {}, 'PUT')).status, 200);
  assert.equal((await request('/api/profile', {avatar: 'data:image/svg+xml;base64,PHN2Zw=='}, cookieA, {}, 'PUT')).status, 400);
  assert.equal((await request('/api/profile', {avatar: tiny}, '', {}, 'PUT')).status, 401);
  const withAvatar = await (await request('/api/events/rsvp?id=' + encodeURIComponent(target.id), null, '', {}, 'GET')).json();
  assert.ok(withAvatar.members.some(m => m.avatar === tiny), 'the avatar reaches every viewer');
  // Hiding removes the member from the list entirely.
  assert.equal((await request('/api/profile', {hidden: true}, cookieA, {}, 'PUT')).status, 200);
  const hidden = await (await request('/api/events/rsvp?id=' + encodeURIComponent(target.id), null, cookieB, {}, 'GET')).json();
  assert.equal(hidden.count, 1);
  assert.ok(hidden.members.every(m => m.email !== 'rsvp-a@byu.edu'));
  // Unsaving leaves the list, and unknown events answer empty.
  assert.equal((await request('/api/preferences', {saved: [], views: []}, cookieB, {}, 'PUT')).status, 200);
  assert.equal((await (await request('/api/events/rsvp?id=' + encodeURIComponent(target.id), null, cookieB, {}, 'GET')).json()).count, 0);
  assert.equal((await (await request('/api/events/rsvp?id=no-such-event', null, '', {}, 'GET')).json()).count, 0);
});

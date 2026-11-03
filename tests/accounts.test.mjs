import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import * as schema from '../db/schema.ts';
import {createAccountAuth, handleAccountAuth} from '../lib/auth-core.mjs';
import {normalizeBYUEmail, permissionsFor, safeReturnTo} from '../lib/account-policy.mjs';
import {parseListing, addCommunityData} from '../lib/community.mjs';
import {publishListing, updateListing, deleteListing, readMyListings, publishTag, submitReport, readReports, reviewReport, moderateEvent, readModerationInventory, communityCalendar, consumeQuota} from '../lib/community-store.mjs';
import {readJSON, requireSameOrigin} from '../lib/http.mjs';
import {matchesEvent, exportICS} from '../lib/search.mjs';

const origin = 'http://localhost:8789';
const secret = 'test-only-account-secret-which-is-long-and-never-used-in-production';
const PASSWORD = 'test-password-123';
let mf, db, auth, member, admin;
const mail = new Map(); let ip = 1;
before(async () => {
  mf = new Miniflare({modules: true, script: 'export default {fetch(){return new Response("test");}}', compatibilityDate: '2026-05-01', d1Databases: ['DB']});
  db = await mf.getD1Database('DB');
  for (const file of ['0000_pink_scarlet_spider.sql', '0001_byu_accounts_community.sql', '0004_event_moderation.sql', '0008_staff_accounts.sql']) {
    const statements = readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '').split(';').map(s => s.trim()).filter(Boolean);
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  auth = makeAuth();
  member = await login('member@student.byu.edu');
  admin = await login('reviewer@byu.edu');
  admin.account.permissions = permissionsFor(admin.account.user, 'reviewer@byu.edu');
});
after(async () => { await mf?.dispose(); });

function makeAuth(sendCode = async ({email, otp}) => { mail.set(email, otp); }) {
  // Three sends per minute per address: sign-up auto-send, an explicit
  // verification resend, and one recovery send all fit inside one login().
  return createAccountAuth({database: drizzleAdapter(drizzle(db, {schema}), {provider: 'sqlite', schema, transaction: false}), secret, baseURL: origin, sendCode, reserveSend: email => consumeQuota(db, 'test-email:' + email, 3, 60)});
}
async function call(path, body, options = {}) {
  return handleAccountAuth(new Request(origin + '/api/auth' + path, {method: 'POST', headers: {'Content-Type': 'application/json', origin, 'x-real-ip': `198.51.100.${ip++}`, ...options.headers}, body: JSON.stringify(body)}), options.auth || auth, origin);
}
async function login(email, password = PASSWORD) {
  const normalized = normalizeBYUEmail(email);
  const up = await call('/sign-up/email', {name: 'Test User', email, password});
  assert.equal(up.status, 200, await up.text());
  const sent = await call('/email-otp/send-verification-otp', {email: normalized, type: 'email-verification'});
  assert.equal(sent.status, 200, await sent.text());
  const result = await call('/email-otp/verify-email', {email: normalized, otp: mail.get(normalized)});
  assert.equal(result.status, 200, await result.clone().text());
  const cookie = result.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const session = await auth.api.getSession({headers: new Headers({cookie})});
  assert.ok(session?.user.emailVerified);
  return {cookie, account: {user: session.user, emailReady: true, permissions: permissionsFor(session.user)}};
}
const tomorrow = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
function listing(overrides = {}) {
  return {submissionId: crypto.randomUUID(), title: 'Student project showcase', organizer: 'Campus builders', description: 'Meet students and see their latest projects. Bring a friend.', start: tomorrow() + 'T18:00', end: tomorrow() + 'T19:00', allDay: false, category: 'Campus life', location: 'WSC 101', url: 'https://clubs.byu.edu/', ...overrides};
}
const anonymous = {user: null, permissions: permissionsFor(null)};
const unverified = {user: {id: 'fake', email: 'member@byu.edu', emailVerified: false}, permissions: permissionsFor(null)};
const outsider = {user: {id: 'fake', email: 'member@example.com', emailVerified: true}, permissions: permissionsFor(null)};

test('only exact BYU domains and verified server identities grant permissions', () => {
  assert.equal(normalizeBYUEmail(' Member@Student.BYU.edu '), 'member@student.byu.edu');
  for (const email of ['a@byu.edu.evil.com', 'a@evilbyu.edu', 'a@sub.byu.edu', 'a@byui.edu', 'a@@byu.edu', 'a b@byu.edu']) assert.equal(normalizeBYUEmail(email), null);
  for (const user of [null, unverified.user, outsider.user]) assert.equal(permissionsFor(user).addListings, false);
  assert.equal(member.account.permissions.addListings, true);
  assert.equal(member.account.permissions.reviewReports, false);
  assert.equal(admin.account.permissions.reviewReports, true);
  assert.equal(permissionsFor({...member.account.user, role: 'admin'}).reviewReports, false);
});

test('password signup proves ownership, normalizes addresses, and stores a hashed code', async () => {
  const signedIn = await login(' NEW.Student@BYU.EDU ');
  assert.equal(signedIn.account.user.email, 'new.student@byu.edu');
  assert.match(signedIn.cookie, /byu-calendar\.session_token=/);
  const replay = await call('/email-otp/verify-email', {email: 'new.student@byu.edu', otp: mail.get('new.student@byu.edu')});
  assert.notEqual(replay.status, 200);
  // Verification codes only go to existing accounts; sign hash@byu.edu up first.
  assert.equal((await call('/sign-up/email', {name: 'Hash Test', email: 'hash@byu.edu', password: PASSWORD})).status, 200);
  const response = await call('/email-otp/send-verification-otp', {email: 'hash@byu.edu', type: 'email-verification'});
  assert.equal(response.status, 200);
  const rows = await db.prepare('SELECT value FROM auth_verification WHERE identifier = ?').bind('email-verification-otp-hash@byu.edu').all();
  assert.ok(rows.results.length >= 1);
  for (const row of rows.results) assert.ok(!row.value.includes(mail.get('hash@byu.edu')));
  const publicBody = await response.text(); assert.ok(!publicBody.includes(mail.get('hash@byu.edu')));
});

test('password sign-up stays locked until the emailed code verifies, then signs in with the password', async () => {
  const email = 'passwords@byu.edu', password = 'a-sufficient-password';
  const up = await call('/sign-up/email', {name: 'Pass Test', email, password});
  const upBody = await up.json();
  assert.equal(up.status, 200, JSON.stringify(upBody));
  assert.equal(upBody.user.emailVerified, false);
  assert.equal((await call('/sign-up/email', {name: 'Short', email: 'weak@byu.edu', password: 'short'})).status, 400);
  assert.equal((await call('/sign-in/email', {email, password: 'wrong-password'})).status, 401);
  assert.equal((await call('/sign-in/email', {email, password})).status, 403);
  const verified = await call('/email-otp/verify-email', {email, otp: mail.get(email)});
  assert.equal(verified.status, 200, await verified.clone().text());
  assert.ok(verified.headers.getSetCookie().some(value => value.startsWith('byu-calendar.session_token=')));
  assert.equal((await call('/sign-in/email', {email, password: 'wrong-password'})).status, 401);
  const signedIn = await call('/sign-in/email', {email, password});
  assert.equal(signedIn.status, 200, await signedIn.clone().text());
  assert.ok(signedIn.headers.getSetCookie().some(value => value.startsWith('byu-calendar.session_token=')));
  // Verification codes can never become a passwordless way into a verified account.
  assert.equal((await call('/email-otp/send-verification-otp', {email, type: 'email-verification'})).status, 400);
});

test('emailed reset codes change passwords, revoke sessions, and never leak unknown addresses', async () => {
  const email = 'resetter@byu.edu', password = 'first-password-1', newPassword = 'second-password-2';
  const user = await login(email, password);
  assert.equal((await call('/sign-in/email', {email, password})).status, 200);
  assert.equal((await call('/email-otp/request-password-reset', {email})).status, 200);
  assert.equal((await call('/email-otp/reset-password', {email, otp: mail.get(email), password: newPassword})).status, 200);
  assert.equal(await auth.api.getSession({headers: new Headers({cookie: user.cookie})}), null);
  assert.equal((await call('/sign-in/email', {email, password})).status, 401);
  assert.equal((await call('/sign-in/email', {email, password: newPassword})).status, 200);
  assert.equal((await call('/email-otp/request-password-reset', {email: 'missing@byu.edu'})).status, 200);
  assert.equal(mail.has('missing@byu.edu'), false);
});

test('password recovery invalidates pending signup codes instead of leaving a passwordless login', async () => {
  const email = 'recovered-signup@byu.edu';
  assert.equal((await call('/sign-up/email', {name: 'Recovery Test', email, password: PASSWORD})).status, 200);
  const oldVerificationCode = mail.get(email);
  assert.equal((await call('/email-otp/request-password-reset', {email})).status, 200);
  assert.equal((await call('/email-otp/reset-password', {email, otp: mail.get(email), password: 'recovered-password-123'})).status, 200);
  const stale = await call('/email-otp/verify-email', {email, otp: oldVerificationCode});
  assert.notEqual(stale.status, 200, 'A signup code must not create a session after password recovery.');
  assert.ok(!stale.headers.getSetCookie().some(value => value.includes('session_token=')));
});

test('bad domains, unsupported auth flows, cross-origin requests, and missing email delivery fail closed', async () => {
  assert.equal((await call('/email-otp/send-verification-otp', {email: 'a@gmail.com', type: 'email-verification'})).status, 400);
  assert.equal((await call('/email-otp/send-verification-otp', {email: 'a@byu.edu', type: 'sign-in'})).status, 400);
  assert.equal((await call('/sign-in/email-otp', {email: 'a@byu.edu', otp: '123456'})).status, 404);
  assert.equal((await call('/update-user', {emailVerified: true})).status, 404);
  assert.equal((await call('/email-otp/send-verification-otp', {email: 'wait@byu.edu', type: 'email-verification'}, {headers: {origin: 'https://evil.example'}})).status, 403);
  assert.equal((await call('/sign-up/email', {name: 'Waiting', email: 'wait@byu.edu', password: 'longenough1'}, {auth: makeAuth(null)})).status, 503);
  assert.equal((await call('/email-otp/send-verification-otp', {email: 'wait@byu.edu', type: 'email-verification'}, {auth: makeAuth(null)})).status, 503);
  assert.equal(mail.has('wait@byu.edu'), false);
  // Delivery failures surface through an unverified account's resend, and
  // through sign-up itself, instead of claiming a code was sent.
  assert.equal((await call('/sign-up/email', {name: 'Halfway', email: 'half@byu.edu', password: 'longenough1'})).status, 200);
  assert.equal((await call('/email-otp/send-verification-otp', {email: 'half@byu.edu', type: 'email-verification'}, {auth: makeAuth(async () => {throw new Error('Provider secret must not escape');})})).status, 503);
  assert.equal((await call('/sign-up/email', {name: 'Failing', email: 'fail-up@byu.edu', password: 'longenough1'}, {auth: makeAuth(async () => {throw new Error('Provider secret must not escape');})})).status, 503);
  const headers = new Headers({'x-legacy-user-id': member.account.user.id, 'x-legacy-user-email': member.account.user.email});
  assert.equal(await auth.api.getSession({headers}), null);
});

test('wrong, expired, and replayed codes cannot verify accounts; resends are throttled', async () => {
  const email = 'attempts@byu.edu';
  assert.equal((await call('/sign-up/email', {name: 'Attempts Test', email, password: PASSWORD})).status, 200);
  for (let i = 0; i < 2; i++) assert.equal((await call('/email-otp/send-verification-otp', {email, type: 'email-verification'})).status, 200);
  assert.equal((await call('/email-otp/send-verification-otp', {email, type: 'email-verification'})).status, 429);
  const wrong = mail.get(email) === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.notEqual((await call('/email-otp/verify-email', {email, otp: wrong})).status, 200);
  assert.notEqual((await call('/email-otp/verify-email', {email, otp: mail.get(email)})).status, 200);
  const expiredEmail = 'expired@byu.edu';
  assert.equal((await call('/sign-up/email', {name: 'Expiry Test', email: expiredEmail, password: PASSWORD})).status, 200);
  await call('/email-otp/send-verification-otp', {email: expiredEmail, type: 'email-verification'});
  await db.prepare('UPDATE auth_verification SET expiresAt=0 WHERE identifier LIKE ?').bind('%' + expiredEmail + '%').run();
  assert.notEqual((await call('/email-otp/verify-email', {email: expiredEmail, otp: mail.get(expiredEmail)})).status, 200);
});

test('signed cookies are required and sign-out revokes the session', async () => {
  const user = await login('logout@byu.edu');
  assert.equal(await auth.api.getSession({headers: new Headers({cookie: user.cookie + 'tampered'})}), null);
  const out = await call('/sign-out', {}, {headers: {cookie: user.cookie}});
  assert.equal(out.status, 200);
  assert.equal(await auth.api.getSession({headers: new Headers({cookie: user.cookie})}), null);
});

test('every contribution rejects anonymous, unverified, and non-BYU accounts', async () => {
  const unavailableDB = new Proxy({}, {get() {throw new Error('An unauthorized request reached the database.');}});
  for (const account of [anonymous, unverified, outsider]) {
    for (const mutate of [publishListing, publishTag, submitReport]) await assert.rejects(mutate(unavailableDB, account, {}, () => null), e => e.status === 401 || e.status === 403);
  }
});

test('listings publish immediately, survive source replacement, and never expose account IDs', async () => {
  const input = listing();
  const event = await publishListing(db, member.account, input);
  assert.equal((await publishListing(db, member.account, input)).id, event.id);
  assert.equal(event.community, true);
  const initial = await communityCalendar(db, []);
  assert.ok(initial.some(e => e.id === event.id));
  assert.ok((await communityCalendar(db, [])).some(e => e.id === event.id));
  assert.ok(!JSON.stringify(initial).includes(member.account.user.email));
  assert.ok(!JSON.stringify(initial).includes(member.account.user.id));
  assert.match(exportICS([event]), /Student project showcase/);
  await assert.rejects(publishListing(db, member.account, listing({userId: admin.account.user.id})), e => e.status === 400);
});

test('authors can edit and delete only their own listings', async () => {
  const event = await publishListing(db, member.account, listing());
  const find = async id => (await communityCalendar(db, [])).find(e => e.id === id);
  const input = {id: event.id, title: 'Renamed project showcase', organizer: 'Campus builders', description: 'Meet students and see their latest projects. The showcase now includes demos.', start: tomorrow() + 'T18:00', end: tomorrow() + 'T19:00', allDay: false, category: 'Campus life', location: 'WSC 101', url: 'https://clubs.byu.edu/'};
  const updated = await updateListing(db, member.account, input);
  assert.equal(updated.id, event.id); // identity is stable, so tags stay attached
  assert.equal((await find(event.id)).title, 'Renamed project showcase');
  await assert.rejects(updateListing(db, admin.account, {...input, title: 'Hijacked showcase'}), e => e.status === 403);
  await assert.rejects(updateListing(db, member.account, {...input, id: 'community:' + crypto.randomUUID()}), e => e.status === 404);
  await assert.rejects(updateListing(db, member.account, {...input, description: 'too short'}), e => e.status === 400);
  const mine = await readMyListings(db, member.account);
  assert.ok(mine.some(e => e.id === event.id));
  assert.ok(!(await readMyListings(db, admin.account)).some(e => e.id === event.id));
  await assert.rejects(readMyListings(db, anonymous), e => e.status === 401);
  await publishTag(db, member.account, {eventId: event.id, tag: 'IS', note: 'The listing is for Information Systems students.'}, find);
  await submitReport(db, member.account, {eventId: event.id, reason: 'Incorrect details', details: 'Private report that disappears with the listing.'}, find);
  await assert.rejects(deleteListing(db, admin.account, {id: event.id}), e => e.status === 403);
  await deleteListing(db, member.account, {id: event.id});
  assert.equal(await find(event.id), undefined);
  for (const table of ['community_tags', 'listing_reports', 'listing_moderation']) {
    const left = await db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE event_id=?`).bind(event.id).first();
    assert.equal(left.c, 0, table);
  }
  await assert.rejects(updateListing(db, member.account, input), e => e.status === 404);
});

test('community tags enter search without rewriting source facts; duplicate tags are harmless', async () => {
  const event = await publishListing(db, member.account, listing());
  const find = async id => (await communityCalendar(db, [])).find(e => e.id === id);
  const input = {eventId: event.id, tag: 'Food provided', note: 'The organizer confirmed that pizza is included.'};
  await publishTag(db, member.account, input, find);
  assert.equal((await publishTag(db, member.account, input, find)).alreadyAdded, true);
  const updated = await find(event.id);
  assert.ok(matchesEvent(updated, '', [], ['Food provided']));
  assert.equal(updated.food, event.food);
  assert.deepEqual(updated.communityTags.map(t => t.tag), ['Food provided']);
  await assert.rejects(publishTag(db, member.account, {...input, tag: 'made-up-tag'}, find), e => e.status === 400);
  await assert.rejects(publishTag(db, member.account, {...input, eventId: 'missing'}, find), e => e.status === 404);
});

test('a delayed delete cannot remove a listing ID recreated by another author', async () => {
  const input = listing();
  const original = await publishListing(db, member.account, input);
  // Pause at the transaction boundary after the first ownership read. Another
  // request deletes the old row and a different author reuses its public ID.
  const interleaved = {
    prepare: (...args) => db.prepare(...args),
    async batch(statements) {
      await deleteListing(db, member.account, {id: original.id});
      await publishListing(db, admin.account, {...input, title: 'The new author owns this event'});
      await publishTag(db, admin.account, {eventId: original.id, tag: 'IS', note: 'A tag on the replacement listing.'}, async () => ({tags: []}));
      return db.batch(statements);
    },
  };
  await assert.rejects(deleteListing(interleaved, member.account, {id: original.id}), error => error.status === 409);
  const replacement = (await readMyListings(db, admin.account)).find(event => event.id === original.id);
  assert.equal(replacement.title, 'The new author owns this event');
  assert.equal((await db.prepare('SELECT COUNT(*) count FROM community_tags WHERE event_id=?').bind(original.id).first()).count, 1);
});

test('reports are private, deduplicated, and actionable only by reviewers', async () => {
  const event = await publishListing(db, member.account, listing());
  const find = async id => (await communityCalendar(db, [])).find(e => e.id === id);
  await publishTag(db, member.account, {eventId: event.id, tag: 'IS', note: 'The listing is for Information Systems students.'}, find);
  const input = {eventId: event.id, reason: 'Incorrect details', details: 'Private report: organizer has cancelled the event.'};
  const report = await submitReport(db, member.account, input, find);
  assert.equal((await submitReport(db, member.account, input, find)).alreadyReported, true);
  assert.ok(await find(event.id));
  assert.ok(!JSON.stringify(await communityCalendar(db, [])).includes('Private report:'));
  await assert.rejects(readReports(db, member.account), e => e.status === 403);
  await assert.rejects(reviewReport(db, member.account, {id: report.id, action: 'hide'}), e => e.status === 403);
  assert.ok((await readReports(db, admin.account)).some(r => r.id === report.id));
  await reviewReport(db, admin.account, {id: report.id, action: 'hide'});
  assert.equal(await find(event.id), undefined);
  await reviewReport(db, admin.account, {id: report.id, action: 'restore'});
  assert.ok(await find(event.id));
  await reviewReport(db, admin.account, {id: report.id, action: 'clear-tags'});
  assert.deepEqual((await find(event.id)).communityTags, []);
});

test('moderators edit and delete any listing; source corrections survive read time', async () => {
  const sourceEvents = [{id: 'test-src-1', title: 'Seminar on foundations', description: 'Weekly department seminar.', start: tomorrow() + 'T18:00:00.000Z', end: null, allDay: false, location: 'Zoom', url: 'https://math.byu.edu/', sourceId: 'math', sourceName: 'Mathematics', category: 'Academic', tags: ['Online'], food: null, snacks: null, drinks: null, free: null, audience: null, format: 'Online', cancelled: false, sourceUpdated: null}];
  const find = async id => (await communityCalendar(db, sourceEvents)).find(e => e.id === id);
  await db.prepare("INSERT INTO source_snapshots (id,payload,last_success,lock_until) VALUES (?,?,'2026-09-21T00:00:00Z',0) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind('test-src', JSON.stringify(sourceEvents)).run();
  const memberListing = await publishListing(db, member.account, listing());
  // Moderation powers fail closed for ordinary members.
  await assert.rejects(moderateEvent(db, member.account, {action: 'delete', id: memberListing.id}), e => e.status === 403);
  await assert.rejects(readModerationInventory(db, member.account), e => e.status === 403);
  // A moderator edits a member's community listing through the full form.
  await moderateEvent(db, admin.account, {action: 'update', id: memberListing.id, title: 'Moderated showcase', organizer: 'Campus builders', description: 'Meet students and see their latest projects. Moderator corrected.', start: tomorrow() + 'T18:00', end: tomorrow() + 'T19:00', allDay: false, category: 'Campus life', location: 'TNRB 101', url: 'https://clubs.byu.edu/'});
  assert.equal((await find(memberListing.id)).title, 'Moderated showcase');
  // A moderator adds a location to a source listing that had only a Zoom link.
  await moderateEvent(db, admin.account, {action: 'update', id: 'test-src-1', location: 'TNRB 240', description: 'Weekly department seminar, now in person.'}, find);
  const corrected = (await communityCalendar(db, sourceEvents)).find(e => e.id === 'test-src-1');
  assert.equal(corrected.location, 'TNRB 240');
  assert.equal(corrected.format, 'In person');
  assert.ok(corrected.tags.includes('In person') && !corrected.tags.includes('Online'));
  assert.equal(corrected.overridden, true);
  let inventoryData = await readModerationInventory(db, admin.account);
  assert.equal(inventoryData.overrides.find(o => o.id === 'test-src-1').location, 'TNRB 240');
  // Deleting a source listing hides it durably and records a snapshot for display.
  await moderateEvent(db, admin.account, {action: 'delete', id: 'test-src-1'}, find);
  assert.equal(await find('test-src-1'), undefined);
  inventoryData = await readModerationInventory(db, admin.account);
  assert.equal(inventoryData.hidden.find(h => h.id === 'test-src-1').title, 'Seminar on foundations');
  // Restoring brings the hidden listing back with its correction still applied.
  await moderateEvent(db, admin.account, {action: 'restore', id: 'test-src-1'});
  assert.equal((await communityCalendar(db, sourceEvents)).find(e => e.id === 'test-src-1').location, 'TNRB 240');
  // Reverting the correction returns the untouched source text.
  await moderateEvent(db, admin.account, {action: 'revert', id: 'test-src-1'});
  assert.equal((await communityCalendar(db, sourceEvents)).find(e => e.id === 'test-src-1').location, 'Zoom');
  // Community deletions remain a full cascade.
  await moderateEvent(db, admin.account, {action: 'delete', id: memberListing.id});
  assert.equal(await find(memberListing.id), undefined);
  for (const table of ['community_tags', 'listing_reports', 'listing_moderation']) {
    const left = await db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE event_id=?`).bind(memberListing.id).first();
    assert.equal(left.c, 0, table);
  }
  // Validation: corrections must change a known field and use real vocabulary.
  await assert.rejects(moderateEvent(db, admin.account, {action: 'update', id: 'test-src-1'}, find), e => e.status === 400);
  await assert.rejects(moderateEvent(db, admin.account, {action: 'update', id: 'test-src-1', category: 'Bogus'}, find), e => e.status === 400);
  await assert.rejects(moderateEvent(db, admin.account, {action: 'update', id: 'test-src-1', url: 'http://insecure.example'}, find), e => e.status === 400);
  await assert.rejects(moderateEvent(db, admin.account, {action: 'delete', id: 'test-src-unknown'}, find), e => e.status === 404);
});

test('date validation uses Mountain Time, inclusive all-day form ends, and rejects invalid and ambiguous times', () => {
  const now = new Date('2026-09-14T12:00:00Z');
  const winter = parseListing(listing({start: '2026-12-17T18:00', end: '2026-12-17T19:00'}), now);
  assert.equal(winter.start, '2026-12-18T01:00:00.000Z');
  const allDay = parseListing(listing({start: '2026-09-17', end: '2026-09-19', allDay: true}), now);
  assert.equal(allDay.end, '2026-09-20');
  for (const values of [{start: '2026-11-01T01:30', end: ''}, {start: '2027-03-14T02:30', end: ''}, {start: '2027-02-30T18:00', end: ''}, {url: 'javascript:alert(1)'}, {url: 'https://user:password@byu.edu/'}, {url: 'https://byu.edu/\r\nBEGIN:VEVENT'}]) assert.throws(() => parseListing(listing(values), now), e => e.status === 400);
});

test('quotas remain atomic under concurrency and reset after expiry', async () => {
  const results = await Promise.all(Array.from({length: 12}, () => consumeQuota(db, 'concurrent', 3, 60, 1000)));
  assert.equal(results.filter(Boolean).length, 3);
  assert.equal(await consumeQuota(db, 'concurrent', 3, 60, 61001), true);
});

test('request bounds, origin checks, and return destinations reject bypasses', async () => {
  assert.throws(() => requireSameOrigin(new Request(origin, {method: 'POST'}), origin), e => e.status === 403);
  await assert.rejects(readJSON(new Request(origin, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({large: 'x'.repeat(100)})}), 40), e => e.status === 413);
  assert.equal(safeReturnTo('//evil.example'), '/');
  assert.equal(safeReturnTo('/\\evil.example'), '/');
  assert.equal(safeReturnTo('/api/auth/sign-out'), '/');
  assert.equal(safeReturnTo('/?q=clubs&event=abc'), '/?q=clubs&event=abc');
  const source = {id: 'source', title: 'Source listing', start: '2026-10-01', tags: [], food: 'no'};
  assert.equal(addCommunityData([source], [], [{id: 'tag', event_id: 'source', tag: 'Food provided', note: 'Community claim'}], [])[0].food, 'no');
});

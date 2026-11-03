// Explicit local sandbox for testing account UI before email delivery is configured.
// No Resend calls leave this process; only the supplied test address can sign in.
import {readFileSync, readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';
import {normalizeBYUEmail} from '../lib/account-policy.mjs';

const email = normalizeBYUEmail(process.argv[2]);
if (!email) throw new Error('Usage: node scripts/preview-accounts.mjs <test-address@byu.edu>');
const mf = new Miniflare({
  host: '127.0.0.1', port: 8790,
  modules: ['index.js', ...readdirSync('dist/server', {recursive: true}).filter(path => path !== 'index.js' && /\.m?js$/.test(path))]
    .map(path => ({type: 'ESModule', path: 'dist/server/' + path.replaceAll('\\', '/')})),
  compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'], d1Persist: resolve('.wrangler/account-sandbox/d1'),
  assets: {directory: 'dist/client', routerConfig: {has_user_worker: true}},
  bindings: {
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), BETTER_AUTH_URL: 'http://127.0.0.1:8790',
    RESEND_API_KEY: 'local-sandbox-intercepted', AUTH_EMAIL_FROM: 'Local sandbox <test@example.invalid>',
    CALENDAR_ADMIN_EMAILS: process.argv[3] || '',
  },
  outboundService: async request => {
    if (new URL(request.url).hostname === 'api.resend.com') {
      const body = await request.json();
      if (body.to[0] !== email) return new Response('Only the configured local test account can request codes.', {status: 503});
      console.log('LOCAL TEST ONLY — verification code:', body.text.match(/code is (\d{6})/)[1]);
      return Response.json({id: 'local-sandbox'});
    }
    return new Response('External requests are disabled in the account sandbox.', {status: 503});
  },
});

try {
  const db = await mf.getD1Database('DB');
  for (const [table, file] of [['source_snapshots', '0000_pink_scarlet_spider.sql'], ['auth_user', '0001_byu_accounts_community.sql'], ['inbound_emails', '0002_moderator_inbox.sql'], ['analytics_events', '0003_usage_analytics.sql'], ['event_overrides', '0004_event_moderation.sql'], ['email_digests', '0005_email_digests.sql'], ['user_profiles', '0006_profile_picks.sql'], ['staff_accounts', '0008_staff_accounts.sql'], ['event_saves', '0009_event_saves_profiles.sql']]) {
    if (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first()) continue;
    const statements = readFileSync('drizzle/' + file, 'utf8').replaceAll('--> statement-breakpoint', '').split(';').map(s => s.trim()).filter(Boolean);
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  // Migration 0007 alters an existing table, so the table-exists skip above
  // cannot cover it; the column itself is the idempotency marker.
  const digestColumns = await db.prepare("SELECT name FROM pragma_table_info('email_digests')").all();
  if (!digestColumns.results.some(column => column.name === 'opted_in')) {
    const statements = readFileSync('drizzle/0007_digest_opt_in.sql', 'utf8').replaceAll('--> statement-breakpoint', '').split(';').map(s => s.trim()).filter(Boolean);
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  console.log('LOCAL ACCOUNT SANDBOX:', String(await mf.ready) + 'signin');
  console.log('Only the supplied test address is accepted. Codes appear in this terminal; no email is sent.');
  console.log('Data persists separately in .wrangler/account-sandbox. Restarting signs out test sessions.');
} catch (error) {
  await mf.dispose();
  throw error;
}
process.on('SIGINT', async () => { await mf.dispose(); process.exit(0); });

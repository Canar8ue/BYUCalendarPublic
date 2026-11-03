# BYU accounts and community listings

**Activated September 16, 2026**: the account system is live with password sign-up/sign-in and Resend email delivery from `auth.byucalendar.com` (verified domain). Migration 0001 was applied to live D1 on September 15, 2026, when the account build first deployed in its safe coming-soon state.

**September 18, 2026**: the moderator message inbox went live (migration 0002 applied to live D1). Mail to `privacy@byucalendar.com` arrives through Resend Inbound, appears at `/moderation/emails`, and moderators reply from the same address. `CALENDAR_ADMIN_EMAILS` lists the team's BYU administrator addresses. The one remaining setup step is adding the receiving MX record in Cloudflare DNS (see below).

## Sign-in and permissions

Visitors can browse and export without an account. `/signin` accepts only exact `@byu.edu` and `@student.byu.edu` addresses. Creating an account takes a name, a BYU email, and a password (8–128 characters); Better Auth emails a six-digit verification code through Resend, and entering that code verifies the mailbox and signs the account in. Accounts cannot sign in with a password until their email is verified, and verification codes are never issued to an already-verified address, so a password stays the only way into a verified account. Forgot-password flows email a one-use code; completing a reset sets the new password, revokes existing sessions, satisfies email verification, and invalidates any pending signup-verification code. This verifies mailbox ownership, not current enrollment or institutional affiliation beyond that mailbox.

| Action | Who can use it |
| --- | --- |
| Save events and filters | A verified BYU account |
| Add a listing | A verified BYU account; publishes immediately |
| Edit your own listing | The verified account that published it (30 edits/day); the event keeps its identity, tags, and moderation state |
| Delete your own listing | The verified account that published it; also removes that listing's community tags, reports, and moderation row |
| Add a tag and explanatory note | A verified BYU account; publishes immediately |
| Report a listing | A verified BYU account; report stays private |
| Review reports, hide/restore listings, remove community tags | A verified BYU account explicitly listed in `CALENDAR_ADMIN_EMAILS` |
| Edit, delete, or correct any listing (September 21, 2026, pending deploy) | The same `CALENDAR_ADMIN_EMAILS` moderators. Community submissions are edited or cascade-deleted in place; source events take a read-time correction patch (`event_overrides`, so refreshes cannot revert it) or a durable hide recorded with a display snapshot. Hidden and corrected listings are listed on the moderation page with Restore and Revert buttons. |
| Read and reply to the privacy message inbox | The same `CALENDAR_ADMIN_EMAILS` moderators |

Community listings carry a community label and organizer name. Community tag notes are public and shown separately from source-provided tags. Adding a food/admission tag does not rewrite the original source facts. Refreshing external feeds preserves community listings, tags, and moderation decisions. Reports include an event snapshot so reviewers can act even if an external source changes. Reports do not automatically hide events.

Authors manage their own listings from the event dialog: the server decides authorship from the signed-in session (via a private `/api/listings/mine` check), and the public event feed never exposes who authored a listing. Edits re-run full listing validation and keep the event id, so tags and moderation survive; edits do not lift a moderator's hide. Deleting is author-only and irreversible; administrators continue to use reversible hide/restore.

No first-user administrator rule exists. An empty administrator list means nobody can access `/moderation`. Public event responses exclude account email addresses, author IDs, and report contents. Legacy platform identity headers are ignored; bookmarks under former placeholder IDs are not automatically moved to new accounts because there is no verified identity mapping.

## What is needed to enable email

| Server binding | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | A randomly generated secret of at least 32 characters; keep stable across restarts |
| `BETTER_AUTH_URL` | Exact public origin, normally `https://byucalendar.com`; local tests can use `http://127.0.0.1:8789` |
| `RESEND_API_KEY` | A Resend key authorized to send from your verified domain |
| `AUTH_EMAIL_FROM` | Sender on that domain, e.g. `BYU Calendar <signin@auth.byucalendar.com>` |
| `CALENDAR_ADMIN_EMAILS` | Comma-separated BYU email addresses permitted to review reports and the message inbox |
| `RESEND_INBOUND_SECRET` | Resend webhook signing secret (`whsec_…`) verifying inbound-email deliveries |
| `CALENDAR_INBOX_ADDRESS` | Optional inbox address; defaults to `privacy@byucalendar.com` |
| `REMINDERS_DISPATCH_TOKEN` | Shared secret the server cron sends as `Authorization: Bearer …` to `POST /api/reminders/dispatch`; generate with `openssl rand -hex 32`. Without it the dispatch endpoint rejects every request. |

The Resend domain `auth.byucalendar.com` is verified (configured September 2026); keys live only in the server's private environment file, never in Git, the public source registry, or the browser bundle. If the key is rotated or the domain changes, update the server's `.env.accounts` file and restart the service.

## Daily digest of saved events

Verified members who turn the digest on receive at most one digest email per day (added September 28, 2026, and switched from default-on to **opt-in** later that day via migration `0007`). It is off until the member enables it, then lists their saved events happening that day in Mountain Time — multi-day events stay listed until they end; cancelled or already-finished events are left out. A server cron POSTs `POST /api/reminders/dispatch` every 15 minutes with the `Origin` header and the `REMINDERS_DISPATCH_TOKEN` bearer secret; the endpoint sends only between 7:00 and 10:00 AM Mountain Time (so a brief outage still delivers that morning) and marks each member's sent day in the `email_digests` D1 table (opt-in flag from migration `0007`, per-day dedupe from `0005`), which makes repeated runs idempotent. `?force=1` bypasses only the time window, never the per-day dedupe. Members with no saved events that day receive nothing.

The preference works in both directions without support: the toggle on `/account` (`POST /api/preferences/digest`, `{optedIn: boolean}`), and the signed unsubscribe link in every digest email (`GET/POST /api/reminders/unsubscribe?u=<user id>&t=<HMAC token>` plus `List-Unsubscribe` headers for one-click). The link's authority is an HMAC of the user id under `BETTER_AUTH_SECRET`, so no session is required and links cannot be forged. Re-enabling never re-sends a day that already went out. Resend daily volume caps still apply — digests share the same account as verification and reset email.

## Moderator message inbox

`/moderation/emails` (same `CALENDAR_ADMIN_EMAILS` gate as report review) lists mail sent to `privacy@byucalendar.com`, shows the plain-text body, and answers from the same address. How it works:

- **Receiving** — Resend Inbound accepts mail for the domain and POSTs an `email.received` webhook to `/api/emails/inbound`. The endpoint verifies the Svix signature over the raw body (`RESEND_INBOUND_SECRET`, 5-minute timestamp tolerance), keeps only mail addressed to the configured inbox address, fetches the full content from `GET /api.resend.com/emails/receiving/{id}`, reduces HTML bodies to text, and stores it in the `inbound_emails` D1 table. Delivery is at-least-once, so inserts are idempotent by Resend's email id, and failures return 503 so Resend retries. Mail for other addresses at the domain is acknowledged but never stored. Only text is stored and rendered — HTML is never re-displayed, and attachments are ignored.
- **Replying** — `POST /api/emails/reply` (same-origin, moderator session) sends plain text through `POST /api.resend.com/emails` from `BYU Calendar <privacy@byucalendar.com>` with `In-Reply-To`/`References` headers so the requester's mail client threads it. Replies are stored in `email_replies`, mark the message read/replied, and are limited to 20 per moderator per day. Sending requires the `byucalendar.com` sending domain to stay verified in Resend (it is, since September 2026).
- **Listing** — `GET /api/emails` returns the 100 most recent messages with their replies to moderators; `POST /api/emails/read` marks one read. When `RESEND_INBOUND_SECRET` is absent, the page and API report "not configured" instead of pretending.

Setup completed September 18, 2026 via the Resend API (key used server-side only): receiving was enabled on the existing verified `byucalendar.com` domain (PATCH `/domains/:id` capabilities), a webhook was created for `https://byucalendar.com/api/emails/inbound` with the `email.received` event, and its signing secret is in `.env.accounts` as `RESEND_INBOUND_SECRET`. The team then supplied a Cloudflare API token, stored **only** in Git-ignored env files — `.env.cloudflare` in the repo root (matched by the `.env*` ignore rule) and a mode-600 copy on the server; the value is never written to tracked files. That token added the receiving MX record (MX `byucalendar.com → inbound-smtp.us-east-1.amazonaws.com`, priority 10, the only root MX), Resend verified the domain with receiving enabled, and a real end-to-end test email arrived in `inbound_emails`. Live checks on September 18: unsigned webhook posts and signed-out inbox requests both 401, a correctly-signed test webhook passed signature verification, and `/moderation/emails` served 200.

For the self-hosted Wrangler runtime, use an `.env.accounts` file in the app directory with `KEY="value"` entries, owned by the service user and mode `600`. The repository's systemd unit now passes that **absolute path** using Wrangler's `--env-file`. Install the revised unit when activating this release. The file sits outside `dist/`, so rebuilding and uploading the app preserves it. Do not place persistent credentials inside the generated build directory. `.env*` and `.dev.vars*` are Git-ignored.

For a local built preview, use an absolute path to a private `.env.accounts` file:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --env-file C:/absolute/path/to/.env.accounts --local --persist-to .wrangler/accounts-preview --ip 127.0.0.1 --port 8789 --inspector-port 0
```

With missing email settings, the page clearly says verification is coming soon and disables sending. There is no developer sign-in bypass or publicly retrievable code. Merely setting the email variables indicates configuration is present; a real delivery test is still needed to confirm that Resend and the mailbox accept the message.

## Database and release steps

Migration `drizzle/0001_byu_accounts_community.sql` adds authentication, quotas, community content, and report/moderation tables. `drizzle/0002_moderator_inbox.sql` (September 18, 2026) adds the `inbound_emails` and `email_replies` tables. `drizzle/0004_event_moderation.sql` (September 21, 2026) adds the `event_overrides` table and the `listing_moderation.snapshot` column used by moderator corrections and restorable hides; it was applied to live D1 the same day, with the state directory backed up first, immediately before that evening's release. They do not replace source snapshots or preferences. Existing installations need 0001 followed by 0002; new databases need 0000, 0001, and 0002. Apply each migration once and record completion. The deployment helper does not apply D1 migrations automatically.

Before deploying this account release to the existing server:

1. Upload `drizzle/0001_byu_accounts_community.sql` into the server's `drizzle/` directory.
2. Pause the refresh cron and stop `byucalendar.service`, then back up the entire `.wrangler/state/` directory while it is not being written.
3. From the app directory on the server, apply the migration with the existing runtime/config:

   ```bash
   node --import ./scripts/sites-env.mjs ./runtime/node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_byu_accounts_community.sql
   ```

4. Create the private `.env.accounts` file when ready, install the systemd unit (`deploy/byucalendar-colo.service`) to `/etc/systemd/system/byucalendar.service`, and run `sudo systemctl daemon-reload`.
5. Deploy the built code using `bash deploy/update.sh`, then restore the refresh cron. Check `/api/events` and `/api/account`. Missing email config should leave contributions gated and browsing operational.
6. Once Resend is configured, verify delivery to an actual authorized BYU inbox, complete sign-in, publish a real intended listing/tag, submit a report, and verify the chosen administrator can review it. Verify sign-out removes contribution access.

Do not run these production steps merely to test the feature. The local integration suite exercises the same Worker against isolated D1 state. Backups now contain private account/session and report data as well as bookmarks; restrict access accordingly.

## Security and operating limits

- Passwords are 8–128 characters, stored as scrypt hashes in the credential account row, and checked with a generic invalid-credentials response. Password sign-in is refused until the emailed code has verified the address. Completing a password reset revokes all of that account's sessions.
- Codes expire after ten minutes, rotate on resend, are stored hashed, allow five attempts, and cannot be reused after successful verification. Verification-type codes go only to existing, not-yet-verified accounts; reset requests never reveal whether an address has an account.
- Sessions use signed HttpOnly cookies, SameSite=Lax, and Secure on HTTPS. Sessions last up to 30 days and are revoked on sign-out. Changing the secret signs everyone out.
- Writes require the configured same-origin request and a verified server-side session. Request payloads are bounded and validated. Listing times use America/Denver; nonexistent or ambiguous daylight-saving times are rejected.
- Sending is limited to one code per minute and six per hour per normalized address. Auth endpoints also have IP limits. The trusted `x-real-ip` value must be overwritten by the reverse proxy; keep Wrangler bound to loopback. The current Cloudflare-proxied Nginx setup may group visitors behind edge IPs, so assess limits if legitimate users encounter throttling.
- Per-account daily limits: 10 listings, 30 listing edits, 50 tags, 20 reports. Duplicate tag/event pairs and report/event/account pairs are deduplicated. Listing retries use a submission ID.
- User contributions are rendered as text. Reference URLs require HTTPS without credentials or control characters; the server does not fetch submitted URLs.
- Public moderation has a private review page, but no notification emails or automated spam classification. Periodically review reports. Self-service listing editing and deletion exist (September 16, 2026); account deletion and automated retention cleanup are future work.

## Verification

To manually test accounts without real email, first build and then run `node scripts/preview-accounts.mjs <test-address@byu.edu>`. Open `http://127.0.0.1:8790/signin`. Only the supplied address can sign up and request codes, which are printed in that local terminal (sign-up, verification resend, and password reset all work there). No email or external fetch is sent. This sandbox keeps its own database in `.wrangler/account-sandbox` and has no administrators. Test accounts persist; restarting signs out sessions. It does not configure or bypass authentication in the production Worker. Never deploy the sandbox script as the live server.

```powershell
npm test
node node_modules/typescript/bin/tsc --noEmit
node scripts/run-framework.mjs build
npm run test:worker
```

The account suite uses Better Auth, Drizzle, and a real isolated D1 database. The Worker integration suite loads the freshly built production modules, intercepts Resend with synthetic messages, and checks HTTP authentication, permissions, immediate publication, report privacy/moderation, account-specific bookmarks, and logout. It never emails a real address. Always rebuild before `test:worker`.

Core files: `lib/auth.ts` (Worker configuration/Resend), `lib/auth-core.mjs` (Better Auth and allowed flows), `lib/account-policy.mjs` (BYU/domain permissions), `lib/community.mjs` (validation and public overlays), `lib/community-store.mjs` (persistence/quotas), `lib/community-server.ts` (HTTP authorization), and `lib/http.mjs` (bounded requests/errors). UI routes are `/signin`, `/account`, `/listings/new`, and `/moderation`; existing event dialogs contain tag/report forms.

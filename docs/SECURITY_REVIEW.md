# Security review — September 17, 2026

This is a source and local-runtime review of the BYU Calendar application. It
covers the Worker routes, Better Auth flows, D1 authorization and writes,
server-side source importers, calendar export, browser-facing UI, build
dependencies, and the self-hosted deployment helper. It is an evidence-backed
review of the checked-out code, not a guarantee that future changes or an
external service are safe.

## Findings fixed

- Password recovery now removes any pending signup-verification code for the
  account. Before this change, somebody who had obtained an old signup code
  could still use it after a password reset had verified the address.
- Server-side source downloads use HTTPS, reject credentials, manually inspect
  every redirect, stay on the configured origin, enforce a redirect limit, and
  keep an 8 MiB streaming bound. A source URL is not a user-controlled fetch
  endpoint.
- The public refresh route rejects cross-site and sibling-origin browser
  requests while retaining the headerless local cron path. Malformed Origin
  values are handled as a normal 403 instead of becoming a server error.
- Listing deletion performs the ownership check inside the same D1 transaction
  as each child and parent delete. A stale request cannot delete a replacement
  listing with the same public ID.
- `.ics` export text is escaped and folded without allowing CR/LF field
  injection. Dates are strict, and unsafe or credential-bearing source URLs are
  omitted from exported URL fields.
- The password-reset page now actually collects a new password and confirms it.
- Responses receive `nosniff`, same-origin framing, a strict referrer policy,
  a restrictive permissions policy, and a baseline CSP. Both `/` and nested
  routes are covered by the Vinext configuration.
- The production and server-runtime dependency locks were updated. The
  initial audit reported 19 vulnerable packages (9 high, 9 moderate, 1 low);
  the root application and the separately installed Wrangler runtime now both
  report zero vulnerabilities with `npm audit`.
- `deploy/update.sh` stages the build and locked runtime before stopping the
  service, validates the remote directory, swaps the two directories together,
  checks a local health endpoint, and restores both previous directories on a
  failed activation. D1 state and the account environment stay outside the
  release swap.

## Verification

The review added regression coverage for stale verification codes, refresh
origins, importer redirects and size bounds, JSON limits, export injection,
the deletion race, and deployment activation/rollback. On September 17 the
following checks passed:

- 47 domain/account/source/export tests.
- 7 built-Worker HTTP integration tests.
- 4 deployment activation and rollback tests using stubbed service/network
  commands and temporary fixtures.
- TypeScript checking, focused ESLint, a production build, and a Drizzle
  schema export without changing a database.
- A local browser smoke check at the default viewport and 390×844. The map
  iframe loaded under the new headers, the password-recovery controls were
  reachable on a phone layout, and the page had no horizontal overflow.
- A structured repository scan found no tracked environment/private-key files
  and no credential-shaped seed values. The scan did not print or inspect
  private runtime secret values.

The React Server Components denial-of-service advisory that prompted the React
upgrade is documented by the [React security advisory](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g).

## Remaining operational work

These items remain after the review and deployment:

- The reviewed changes were deployed to `byucalendar.com` on September 17
  through the staged helper. The post-deploy checks returned 200 for the
  homepage, sign-in, privacy, events, and account endpoints; the new headers
  were present; cross-site refresh returned 403; and the prior build/runtime
  is kept on the server as a timestamped `release-backup-*` directory.
- The Resend API key was previously shared during setup and still needs to be
  revoked and replaced in the server's `.env.accounts` file. Do this
  before treating the deployment as fully remediated.
- A real authorized BYU inbox delivery test and administrator allowlist still
  need owner-provided addresses. The local account and Worker tests intercept
  email and never send to a real inbox.
- The baseline CSP deliberately omits `script-src` because this Vinext build
  still emits inline hydration scripts. Add nonce support before tightening it
  further. The reverse proxy should also be reviewed for the trusted client-IP
  header used by auth rate limiting.
- This review did not attempt destructive production probes or claim complete
  coverage of dependencies, the operating system, Nginx, Cloudflare, or future
  source data. Keep running the lockfile audit and the focused tests after
  dependency or route changes.


## October 26, 2026 — local campus game expansion scope

The game expansion is local and has not been deployed or independently penetration-tested. Production audio assets are self-hosted; no credential or external account API is shipped to browsers. Asset integrity is checked in the explorer audio suite.

Save JSON imports remain capped at 100 KB and validated against supported versions/known content; progress is local and not an authoritative leaderboard. The host retains strict same-origin/source message checks and opt-in loading. Navigation loading and audio fetching are same-origin, and Exit disposes media, requests, timers, object URLs and GPU resources. Existing calendar/account authorization and APIs are unchanged by this game-only expansion.


### October 27 publication

The previously reviewed local game was published through the staged rollback-capable deploy helper. Production served all 25 audio files with exact local inventory hashes. Database state, account configuration, refresh/digest cron and unrelated services were preserved. This operational verification is not a new penetration-test claim.

# BYU Calendar

A calendar app inspired by the CareerLaunchpad design system: Archivo, Roboto, Roboto Mono, Material colors, and hard bordered cards.

## What is connected

`lib/catalog.mjs` defines the source registry; live adapters use a public source allowlist. Twenty live sources are configured: BYU Events; nine Marriott feeds; AIS; Accounting Society; Engineering; Mathematics; Computer Science; ACME; Life Sciences; Kennedy Center; BYU Law; and Marketing Association. Fourteen currently publish upcoming events. A separate, clearly labeled BYU Student Organizations snapshot adds 119 listings from 48 clubs collected on September 14, 2026. A reviewed Handshake snapshot adds 227 event listings imported September 14, 2026 (224 additional calendar entries after merging). AIS Slack, social account imports, and Beta Alpha Psi remain unconnected.

`lib/source-import.mjs` imports ICS feeds, enriches BYU Brightspot calendar records from their public Events JSON endpoints, and follows dated event listings to their published per-event ICS downloads. It never derives dates from URL slugs, which are often stale. Math and Life Sciences feeds syndicate the main BYU calendar; only records linking to the department's own hostname are added as department records. Sources and event URLs remain linked in the UI. See [the source audit](SOURCE_AUDIT.md) for exact URLs, coverage, and gaps.

`node scripts/refresh-seed.mjs` refreshes the distributable public snapshots using the same adapters as the app, preserving previous snapshots on failure. It preserves both the club directory and Handshake snapshots without refreshing them. `node scripts/import-club-snapshot.mjs <capture.json>` imports public browser-observed club rows with an explicit calendar year and capture date; uncertain food, end-time, and attendance fields stay unknown. The raw capture format is `{capturedAt, calendarYear, rows: [{title, organization, date, location}], details?: [{url, snapshot}]}`. These snapshots do not refresh automatically. New manual captures update existing installations only when their import timestamp is newer. Listing-only bookmark IDs depend on title, club, and start, so rescheduling may change them.

The checked-in `data/seed.json` contains real source snapshots for the first load. It is not demo data. D1 stores current snapshots, source check times, errors, and refresh leases. A successful refresh replaces that source's snapshot atomically, so edits and explicit cancellations take effect. Failed imports retain the previous snapshot. Matching titles and starts are merged, including an optional BYU prefix, while generic opening/closing socials from different organizations remain separate. A second pass collapses same-day near-duplicates the exact key cannot catch: identical titles with start drift of at most 30 minutes, one title's words contained in a longer variant (holidays, "Grad School Fair"/"Graduate School Fair"), and double-posted listings with near-identical wording. Audience variants such as the Melaleuca "Break-out room; GSCM" vs "; Marketing" sessions stay separate because their distinguishing tokens differ. Each collapsed group keeps the record with the most source-provided content (snapshot provenance boilerplate is ignored when comparing descriptions), unions the tags and source links, and fills missing fields. Richer descriptions and additional source links are retained.

## Handshake snapshot imports

Run `node scripts/import-handshake-snapshot.mjs Handshake/handshake_events_complete.json` after reviewing a new export. The input is a non-empty JSON array of event objects with `id`, `title`, `host`, `startDate`, `endDate`, `roomAndBuilding`, `locationSummary`, `cityState`, and `url`. Starts require explicit timezone offsets; valid timestamps become UTC instants and display in Mountain Time. The importer copies only listing fields, validates credential-free event links against the event ID, fails on invalid starts or conflicting IDs before changing the seed, and withholds invalid/missing end times. Exact duplicate IDs collapse. Source IDs remain stable when events move.

The supplied file has 227 unique IDs covering September 14, 2026 through March 18, 2027. Its 14 “Virtual / TBD” placeholders do not establish online attendance; 39 other venues are “To Be Determined.” The one equal start/end time is withheld. Hosts marked N/A stay unknown; Acc/MAcc, Fin, IS, and CS in titles support the corresponding interest filters. Fees, food, and eligibility are not assumed. Every imported listing carries an import-date notice and a Handshake link that may require sign-in. The original capture time and live source update times are absent, so sourceUpdated remains null.

Only reviewed, normalized listings enter the shared seed and D1 snapshots. Raw account exports in `Handshake/` are ignored by Git. No account tokens, attendees, or appointments were found in the supplied input; a future export still needs review. This does not connect a Handshake account or provide live synchronization. Later imports replace the stored snapshot when their import timestamp is newer. Matching titles/starts merge while retaining distinct original links, including duplicates within Handshake.

## Automatic updates

The browser calls `POST /api/refresh` on opening and every five minutes while open. Each source is refreshed at most hourly, or every five minutes when a visitor explicitly requests a refresh. Failed sources retry after 15 minutes. Database leases prevent concurrent imports of the same source. Sources are fetched sequentially with timeouts and streaming size bounds. Website adapters allow three concurrent detail downloads, a 90-second deadline, at most eight listing pages and 120 event links, with same-origin links only. A failed detail page retains its previous events; an unexpected listing structure fails without replacing the source snapshot. The club directory and Handshake snapshots are excluded from live refresh. Metadata enrichment failure does not remove the calendar inventory.

The existing self-hosted server has a cron job calling the local refresh endpoint every 20 minutes, so live sources also update while no visitor is present. A second cron entry POSTs the digest dispatch endpoint every 15 minutes; it emails each verified member who opted in at most once per morning with the saved events happening that day (the digest is off by default; turn it on from `/account` or off via the email's unsubscribe link — see [ACCOUNTS.md](ACCOUNTS.md)). Other local previews refresh on visits and while open. Do not store private calendar tokens in client code or in the source registry.

## Search and data quality

Smart search is a deterministic phrase parser, with no paid AI API or API key required. It understands the supported date ranges, after-time phrases, interests, food, and attendance format; remaining terms are matched against the event text. It is not unrestricted semantic or fuzzy search. "Free food" and food words map to the "Food provided" filter; the separate "Free food" tag was retired on September 15, 2026 because it duplicated "Food provided" on every record that carried it. Topic tags are derived from source metadata and text. Food and audience details require source evidence; unknown fields remain unknown. Literal nulls and explicit negative statements are handled. Calendar time is America/Denver, including daylight saving time. Multi-day all-day events treat the source end date as exclusive. Recurring rules and exception dates are expanded with ical.js.

## Important events

`lib/important-events.mjs` is the curated registry of signature once-a-year events (added September 28, 2026): the big STEM career fair, devotionals/forums whose speaker is an apostle, prophet, or president, and the Utah vs BYU football game. Rules are title-anchored and deliberately conservative — a description mention alone never qualifies, and the speaker rule requires an honorific followed by a capitalized name so "club president announced" cannot trip it. Flagging layers at read time over the merged calendar (stored snapshots stay untouched; community listings are covered), so next year's occurrences mark themselves and source refreshes cannot lose the tag. Flagged events get `event.important` (the label shown in the UI) plus the `Important` tag, which flows through tag filters, phrase search ("important"), and the AI-assist vocabulary; they sort first within every day. **To cover a new signature event, add a rule to `IMPORTANT_RULES` and a case to `tests/important-events.test.mjs` with positives and near-misses — never widen `classify()` heuristics for this.**

## Personal picks

My calendar shows a "Picked for you" panel (added September 28, 2026) backed by three endpoints: `POST /api/profile/chat` (quick-reply onboarding; question wording from the same configured chat model and `SEARCH_ASSIST_*` env as smart search, clamped in `lib/profile.mjs`, 60 calls/day per member), `POST /api/profile/activity` (signed-in event actions resolve through the merged calendar into decaying category/tag counters — 45-day half-life, never per-event history), and `GET /api/recommendations` (deterministic scoring in `lib/profile.mjs`: stated interests, activity, details, category, and a freshness nudge; saved events excluded; threshold 2; top 12 with reason chips). State lives in `user_profiles` and `profile_activity` (migration `0006`). No model involvement in ranking.

## Search engine visibility

The app ships SEO basics from `app/layout.tsx` and static files in `public/`: a canonical URL, Open Graph and Twitter card metadata, `robots.txt` (which also excludes the sign-in, account, moderation, listing, and API paths), `sitemap.xml` for the homepage, `site.webmanifest`, PNG icons, a 1200×630 `og-image.png`, and JSON-LD structured data (Organization + WebSite with a search action pointing at `/?q={term}`). Regenerate only the social preview with `node scripts/generate-og-image.mjs`; its path-only vector master is `logos/svg/69-banner-og-campus.svg`, rendered with Sharp at exactly 1200×630 without installed fonts. The September 16 design uses bold typography and a weekly calendar illustration. `node scripts/generate-seo-images.mjs` calls the same OG renderer and also regenerates the icon fallbacks. The metadata assumes the production origin `https://byucalendar.com`. Search Console ownership verification and indexing happen outside the repository.

## Saved calendars

The account implementation uses Better Auth with BYU email verification through Resend. Bookmarks and saved filters use the verified account’s stable ID in D1. Mock sign-in is disabled; legacy identity headers are not trusted. Existing preferences under old identity IDs are not automatically reassigned. The account release is active on the self-hosted server. See [account setup](ACCOUNTS.md) for permissions, the required migration, and activation steps. Source records that disappear entirely from a feed may cease to appear in saved calendars; the app does not maintain a historical archive of removed records. Downloads are ordinary `.ics` snapshots, not live external subscriptions.

## Security review

The September 17, 2026 source and local-runtime review is recorded in
[SECURITY_REVIEW.md](SECURITY_REVIEW.md). Keep the lockfile and the bounded importer/export tests in
sync when dependencies or server-side routes change. The review fixes were
deployed on September 17 and verified at the public origin; rotate the Resend
key separately before considering account operations fully remediated.

## Development

### 3D campus map assets and matching

September 22 local addition: `valley_lod.glb` and `valley-context.js` provide
optional distant scenery after the campus is ready (38,268 bytes, 3,932
triangles, one draw call, no textures). Keep these files when publishing the
static map. See [terrain maintenance](CAMPUS_TERRAIN.md) for source data,
rebuilding, and the 50 KB / 5,000-triangle budget. The scenery has no picking IDs
and does not run an idle loop. The ordinary map retains the smaller October 5
GLB/catalog pair; the October 27 grounded pair is game-only in
`public/explorer/campus/`.
`/campus/*` assets are unhashed and cached up to 4 hours, so any change to
them requires bumping the shared `?v=20261027mapsplit1` token: in `index.html`
(`calendar-map.css` stylesheet link and `calendar-map.js` script tag), in
`calendar-map.js` (the `valley-context.js` import, and the `campus_web.glb` and
`coordinates.json` loads), and in `valley-context.js` (the `valley_lod.glb`
URL). Bump all six together. The game shares the valley URL but loads its own
grounded model and matching catalog from `/explorer/campus/` (pair token
`20261102buildings2` locally; `20261027ground1` deployed). Never overwrite the normal map with that larger model during
game sync. Version the native game host/entry/imports after source changes
(local `20261102buildings2`; deployed `20261027play3`); production modules are content-hashed. Rebuild
explorer navigation after changing its geometry/collision. Its `_SURFACE`
attribute must survive batching/compression alongside `_FEATURE_ID`.

Deployed September 16, 2026 to byucalendar.com. Search/filter changes automatically frame matching pins. Building selection opens the event dialog only after the camera reports its completed flight; cancelled flights do not open stale dialogs.

The secondary Map view uses `app/campus-map.tsx` and the isolated, same-origin Three.js viewer in `public/campus/`. The GLB and `coordinates.json` are a paired export from the BYUCampus Blender project; replace both together. Retain `ATTRIBUTION.md` and vendor licenses. Rebuild the lookup with `node scripts/index-campus-locations.mjs` after replacing coordinates. The checked-in lookup groups building parts and excludes planned/unverified features. Venue aliases belong in `lib/campus-map.mjs`; add only aliases with known campus anchors, then run `tests/campus-map.test.mjs`.

Counts, category rings, location dialogs, and exports use the existing filtered daily events in America/Denver, including multi-day events. URL parameters `view=map`, `date=YYYY-MM-DD`, and `place=<catalog id>` preserve map state alongside existing filters. The iframe validates message origin/source, loads local assets only on demand, and renders on interaction. Location cards remain available if WebGL fails. Unknown/online/off-campus venues stay accessible in the unpinned day list; do not guess their coordinates from an event title or organizer.

Browser smoke checks: toggle Map, change day, apply category/detail/search filters, click a count and a building, follow “See on Map” from an event, reload its URL, and check phone width. Nearby pins use collision spacing and leader lines; confirm each count selects its own venue after camera movement.

Use Node 22.13+ and the package lockfile. Run `npm run install:ci`, `npm run db:generate` after schema changes, and `npm run dev`. On this Windows host the npm shim could not resolve npm, so direct `node scripts/run-framework.mjs dev` and `node scripts/run-framework.mjs build` were used successfully. The underlying npm CLI is at `C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js`.

Local D1 migrations use the built config:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_pink_scarlet_spider.sql
```

A fresh database also needs `drizzle/0001_byu_accounts_community.sql` using the same command with that filename. Existing databases need only migrations not already applied. Do not replay applied production migrations. The account preview uses separate `.wrangler/accounts-preview` state. Production runs on the self-hosted server; see the account guide before deploying schema changes.

Checks: `npm test`, `node node_modules/typescript/bin/tsc --noEmit`, the production build, then `npm run test:worker`. Account tests use isolated D1; the built Worker tests intercept Resend and never email a real inbox. The tests cover Denver offsets, rescheduling identity, recurrence exceptions, multi-day overlap, missing/negated details, search, club tagging, duplicate provenance, website imports with stale URL dates, origin bounds, partial source failures, snapshot dates, Handshake date/URL validation, ambiguous locations, stable IDs, field allowlisting, valid exports, bounded redirects, request sizes, export injection, authorization races.


## Lost on Campus game — live play refinement, October 28, 2026

The opt-in game is live at `/explore` and on real 404 pages. Use the framework wrapper build so game modules/CSS are hashed. The normal map uses the small model in `public/campus/`; the game uses the larger grounded pair in `public/explorer/campus/`. Recorded audio and hashed navigation JSON are checked-in source assets; normal builds do not call an external API.

Local save payload version 2 retains the existing byucalendar-explorer-v1 key and migrates older earned progress. The October 28 play refinement adds validated `trackedQuest`, `bestRuns` (max 240 samples/course), route-trail/ghost preferences and one-time medal rewards without changing the save version. This data is separate from account/calendar preferences and remains local/editable. No D1 migration or production environment variable is needed. Stop a local preview Worker before rebuilding on Windows if it holds dist open.

`racing.mjs` owns boost/medals/checkpoint/ghost rules; `quest-state.mjs` owns next-objective resolution. `play.css` refines the game HUD and race screens; `build-explorer.mjs` combines it with `game.css` and `district.css` into one hashed stylesheet. Always use the framework wrapper for a full release build.

The local October 28 expansion Part 1 introduced revision `20261028movement1`; the current local source revision is `20261102district3`; the deployed revision remains `20261027play3` until publication. `locomotion.mjs` owns meter-based impact/recovery/acceleration rules, and `controls.mjs` owns the shared keyboard/touch basis, camera look and wheel limits. Local controls now use Shift for optional mouse lock, C for sprint/faster riding and F for braking. Falls are transient and do not change the save schema. No geometry/collision-index/navigation changes are included. Keep fictional NPC/booth promotions distinct from real calendar events.

The local Part 2 rendering increment uses `valley-rendering.mjs` to split the existing Y into a depth-biased material group only in the game. Keep depth testing/writing and front-face culling; do not change the shared valley asset or its normal-map token for this runtime-only correction. It adds one game draw call. `scripts/audit-explorer-y.mjs` and `tests/explorer-y.test.mjs` check actual decoded geometry and material preservation. Preserve the latest master and intentional HBLL openings when making subsequent reference-supported repairs.

Game verification adds explorer audio/navigation/progress/world/actor suites, a 69-target bidirectional collision audit, real browser story/finale/audio/controls checks and the unchanged Worker/TypeScript/build/lint gates. Physical-phone and full-length human pacing review remain release gates.

The local November 2 Part 3 district adds authored activities/dialogue, safely
routed recurring students, Maya's fictional stand, Jun's visual phrase, Sofia's
composition board and live character map markers. `campusLife` is additive to
save version 2; activity rewards use the existing one-time claim registry, and
the Cookie crew outfit/Nora workshop deck require completed activity state.
The legacy completion percentage still describes the original adventure;
district stories have their own journal count. `district-collision.mjs` clips
movement against visible counter/board furniture, while the campus model and
navigation network remain unchanged. Run `node scripts/audit-explorer-district.mjs`
after changing student anchors, path following, furniture or collision rules.
It checks the actual decoded model and NPC transit, including the furniture
wrapper. No D1 migration, external service or new audio key.


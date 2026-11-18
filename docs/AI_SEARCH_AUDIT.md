# AI search visibility audit

Observed **November 4, 2026, 9:14 PM MST** (America/Denver). Scope: source review, the public calendar response, and 16 live HTML pages. The original audit made no application changes or deployment; the November 5 implementation and publication are recorded below.

The owner reports roughly 300 indexed pages, with more awaiting indexing. That is the starting baseline, not an indexing failure diagnosed by this audit. Existing event URLs, Share links, canonical tags, Event structured data, server-rendered topic lists, original-source links, and the sitemap already provide a useful foundation.

Google says its AI search features use the same SEO foundations; there is no special AI markup or text-file requirement. These recommendations aim to make the site's information accurate, useful, accessible, and easy to cite. None is a promise of a particular ranking or AI citation. [Google AI features guidance](https://developers.google.com/search/docs/appearance/ai-features)

## Verified inventory

The public feed held 2,628 merged records; 2,007 were noncancelled with a last event day on or after November 4. This is a day-based count, not a count of sessions still available at the observation time. The source contains 31 topic definitions, despite older handoff references to 32.

| Observation | Scope and implication |
| --- | --- |
| 15 upcoming records carry `timeTba` | The calendar knows these starts are uncertain; the event-page structured-data formatter ignores the flag. |
| 347 upcoming records have an empty location | The event-page template still inserts a university venue and Provo address into their structured data. |
| 1,243 upcoming records lack `sourceUpdated` | A useful freshness display needs to distinguish organizer modification time from successful source-fetch time. |
| 194 upcoming records have no substantive description; 644 have fewer than 120 characters | Counts exclude separated import-provenance text. Short text is an enrichment opportunity, not proof of poor ranking or a required word count. |
| 1,066 upcoming records are Y-Serve occurrences across 17 titles | These are legitimate repeated opportunities. A series overview could add context beyond another copy of the same description. |
| 22 of 31 topic pages have no incoming links from other topic pages | Derived from the template's fixed first-eight linking rule. The sitemap still advertises them. |

Local, ignored evidence: `output/seo-2026-11-04/aio-calendar-snapshot.json`, `aio-data-audit.json`, `aio-pages-audit.json`, and saved HTML responses. `aio-audit.mjs` reproduces the public-data sampling. Counts will change with refreshes.

## 1. Correct the event facts exposed to search systems — first priority

**Evidence:** `app/events/[id]/page.tsx:25–48` builds JSON-LD separately from the visible facts at lines 81–88. `denverStamp()` always converts a timed start, regardless of `timeTba`. Every non-online record gets an address fixed to Provo, UT, and an empty venue becomes “Brigham Young University.”

Live examples:

| Page | Visible information | Structured-data contradiction |
| --- | --- | --- |
| [Men's Tennis at ITA](https://byucalendar.com/events/byucougars-25478) | TBA; Rome, GA | Precise 10:00 AM Mountain start; address says Provo, UT. |
| [Women's Tennis vs. ITA Sectional Championships](https://byucalendar.com/events/byucougars-25569) | TBA start, but an 11:11 PM end still appears | Start and end publish precise placeholder times; Los Angeles venue gets a Provo address. |
| [Women's Volleyball at Colorado](https://byucalendar.com/events/byucougars-25244) | Boulder, Colorado / CU Events Center | Address says Provo, UT. |
| [Wealth Management Info Session](https://byucalendar.com/events/marriott-events-1soryfd) | Location not listed | Structured data asserts a university venue in Provo. |

**Change:** share a factual presentation layer between visible facts and JSON-LD. For a known event date with unknown hours, use the verified calendar date without a precise time; suppress uncertain end times. Check source date semantics before changing TBA date handling—UTC placeholder conversion can cross a calendar-day boundary. Supply venue/address facts only when supported by source fields or an unambiguous campus-location match. Preserve unknown locations as unknown. Add the year to visible event dates, especially lists spanning into 2027.

**Why this matters:** AI answers should not receive conflicting time or location claims from the same page. Google's event guidance permits date-only starts when hours are unknown. Its structured-data policies require accurate representation. [Event date/location guidance](https://developers.google.com/search/docs/appearance/structured-data/event), [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

**Other semantic cleanup in the same formatter:** `VirtualLocation.url` currently points to our event page, rather than a verified participation URL; organizer falls back to the publishing feed name; free admission automatically implies `InStock`; every event uses the same generic image. Keep source identity separate from a confirmed organizer, avoid asserting ticket availability without evidence, and use relevant images only when rights and source support are established. Google event-rich-result eligibility is separate from ordinary indexing and AI citations; do not fabricate fields to satisfy validation.

**Verification:** add meaningful cases to `tests/worker.integration.mjs` for TBA starts/ends, known away venues, missing venues, real campus venues, and dates crossing DST. Existing integration coverage checks that Event markup exists but does not assert these facts.

## 2. Make a few pages answer immediate student questions — largest content opportunity

**Evidence:** `lib/topics.mjs` defines subject/category pages, not dated planning pages. `app/topics/[slug]/page.tsx:35–50` shows the first 12 matches from the whole upcoming inventory. For example, the recruiting page mixes November events with spring 2027 fairs, without years in the visible date labels. The free-food page displays 12 of 42 matches, with date/time/location/source but no per-row food or admission context.

**Change:** extend the existing topic system with a small set of stable, server-rendered planning pages:

- BYU events today.
- BYU events this week.
- BYU events this weekend.

Improve the existing free-food, clubs, and recruiting pages before adding more category variations. Give each a short direct answer, explicit Mountain Time date range, current event list, and source links. The free-food page could have a “This week” section. The recruiting page could distinguish the next career fairs from recruiter information sessions.

Answers should expose what the data actually supports: food mentioned by the organizer, confirmed free admission, audience, registration requirements, and known venue. Keep food provision, free admission, and open attendance separate. Unknown requirements should remain unknown. Existing `matchesEvent` and date helpers supply much of the filtering, but window boundaries and sort order need review before reuse.

Correct topic sorting by Mountain calendar day and known start time. In the sampled free-food HTML, all-day “Pies with Professors” on November 10 appears before two November 9 evening events because sorting uses raw start strings.

**Acceptance:** a reader or text-only client can answer “what is happening this week?” from the page without submitting a search; every listed event belongs to the stated date window; no already-ended event is described as still available; unknown ends do not get invented. Include source-provided eligibility and honest empty states. Preserve the simple existing visual style.

This is a content strategy inference, not a documented special AI ranking factor. Google's people-first guidance emphasizes original usefulness and added value beyond republishing sources. [Helpful-content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

## 3. Publish a clear identity and source-methodology page

**Evidence:** the site already identifies itself as independent in its footer, privacy page, and Organization markup. Event pages link to original publishers. Manual club records already carry a visible snapshot warning in their description provenance. Preserve those strengths.

However, source coverage and update details are primarily inside the client-side coverage dialog (`app/calendar-app.tsx`). There is no dedicated public About or Sources route. The global description at `app/layout.tsx:6` says “All BYU campus events,” while the coverage dialog correctly says the site does not include every event. Topic footers broadly describe automatic updates even when some matches come from manual snapshots.

**Change:** add a concise public `/about` or `/sources` page explaining who maintains the project, what it aggregates, how deduplication and evidence-based tags work, which sources refresh, which are dated snapshots, and how to report a correction. Name Jarin publicly only in the form the owner wants published. Link it from event/topic pages and the footer. Use an accurate global description such as “Search BYU events from university, department, and club calendars.” Retain the independent-project disclosure.

Join event pages to source status where helpful. Label `sourceUpdated` as an organizer/source modification time; label `lastSuccess` as a successful retrieval, not human verification. For snapshots, show the captured/imported date and warning. Do not replace missing timestamps with today's date. `lib/calendar-server.ts` already returns the per-source status needed for this.

**Acceptance:** a visitor can find the maintainer, provenance, coverage limits, and correction path without opening a dialog; the same coverage claims appear in visible copy and metadata. Better source transparency is useful to readers; a ranking uplift is not established by this audit.

## 4. Connect the useful topic pages to each other

**Evidence:** `app/topics/[slug]/page.tsx:60` selects `TOPICS.filter(...).slice(0,8)` for every page. Only the first nine topic definitions receive links from that component across the whole graph. Clubs, recruiting, engineering, performances, and 18 other topics receive none. Event tag links at `app/events/[id]/page.tsx:103` lead to homepage filter URLs, rather than the corresponding server-rendered topic pages.

**Change:** provide a compact topic directory or footer link to one; choose related topics by subject; link event tags to their matching topic pages where a mapping exists. A career event should lead to recruiting/networking and its relevant subject, rather than a fixed sequence of food/format topics. Preserve filter behavior for unmatched tags. A few normal links can do this without adding buttons to every calendar row.

**Acceptance:** all 31 topics are reachable through ordinary navigation, event pages link to relevant collections, and existing share URLs remain stable. This strengthens a working discovery system; it does not replace the sitemap.

## 5. Add recurring-program context where it helps

The sampled inventory includes 526 “Adapted Institute” occurrences and 262 “Stop and Serve” occurrences. Repeated dates are real records, so this audit does not recommend deleting, merging, canonicalizing, or noindexing them merely because descriptions repeat.

**Change:** consider a volunteer-program overview or series page with verified purpose, full building name, attendance conditions, source schedule, exceptions, and the next available sessions. The existing campus-location resolver can expand unambiguous building codes. Existing descriptions can supply supported facts; additional claims require source review. This gives the site a more useful reference page while retaining occurrence-level Share and calendar links.

**Acceptance:** series descriptions add practical value, session dates still resolve to their own pages, and no registration, admission, or membership rule is inferred without evidence.

## Smaller fixes and checks

- Topic social metadata currently inherits the homepage `og:title` and `og:url`; confirmed on all five sampled topics. Set each topic's title, description, and URL consistently in `generateMetadata`. This improves shared previews; it is not a proven AI ranking lever.
- The homepage initially serves loading content, and robots blocks `/api/`, which its client uses for event data. Google supports JavaScript rendering, but this combination deserves a URL Inspection rendered-HTML check. It does not prove Google sees a blank page. If necessary, render useful public content on the server; keep private APIs protected and avoid a broad robots change. Event/topic pages already render their main content on the server. [JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- New editorial pages need their own canonical URLs and sitemap entries. Add structured data only when it describes visible content accurately; schema volume is not the objective.

## Recommended implementation order and measurement

1. Correct event facts and add fact-level regression coverage.
2. Add the source/methodology page and align coverage/freshness copy.
3. Improve existing high-value topics, add three planning pages, and repair related-topic navigation together.
4. Pilot one volunteer-series guide; expand only if useful to students.

Use Search Console query/page baselines for “byu calendar,” “byu events,” “byu events this week,” “free food at byu,” club activities, and recruiting. Search demand and current positions were not verified here. Compare impressions, clicks, and indexed status over consistent time windows, noting deployments and semester/event seasonality. Manually sample a fixed set of Google AI prompts with date, location/account context, and cited URLs; treat those observations as variable snapshots.

Google reports AI feature traffic within Search Console's overall Web performance data. This audit has no separate AI-only performance baseline. Referrer counts alone also cannot reliably distinguish Google's AI results from ordinary search. [AI measurement guidance](https://developers.google.com/search/docs/appearance/ai-features)

Application changes should follow the project's domain/Worker/type/build checks and real-browser verification requirements. This audit added documentation and ignored evidence only; no product tests or deployment were necessary.

## Implementation — November 5, 2026 (published)

The owner approved items 1–3 and clarified the date-page approach: reuse the existing search URLs, rather than create another page design. The implemented scope is:

- `/?q=Events+today`, `/?q=Events+this+week`, and `/?q=Events+this+weekend` return matching public event rows in the initial HTML, specific titles/date ranges, and individual canonical URLs. Equivalent simple query wording maps to those canonical URLs; other searches/filter combinations retain the normal homepage metadata. The browser subsequently loads the full calendar. About us links to all three views, and the sitemap includes them.
- Known event ends determine whether a session is ongoing; no missing duration is invented. Results sort by Mountain calendar day, multi-day rows group under the relevant day of the requested window, and Sunday weekend searches exclude Monday. Ordinary row clicks still open the dialog; event titles also have stable `/events/...` links.
- Event pages use shared date/time/venue facts with safe JSON-LD serialization. TBA hours stay date-only, placeholder end hours are suppressed, and years/date ranges are visible. Only unambiguous campus matches receive a Provo address; away venue names and unknown locations are preserved honestly. Generic event images, assumed stock, unverified organizer identities, and invented virtual join URLs are omitted. Old snapshots recover explicit adapter TBA evidence on read.
- Existing food/club/recruiting topics show supported food, admission, audience, registration and snapshot information. All topics use correct local-day ordering, years and date ranges, individual social metadata, and links to the shared About/footer. The mobile topic-date flex basis is reset to avoid an empty gap before the event title.
- `/about` credits Tanner Abbott, Jarin Canar (linked to jarin.dev), Nelson Lunt, and Austin Pence as BYU Information Systems majors. It explains the team's website role, organizer-maintained source calendars, community additions, evidence-based details, manual imports, source retrieval dates, and corrections. Privacy and About us share their style and remain together on one line, in that order, when the surrounding footer wraps.

No database migration or environment change is required. The campus model/game assets and existing event Share URLs are unchanged. The broader topic-directory/series-guide suggestions in items 4–5 were not part of this implementation.

Verification: 336 domain tests, 28 built-Worker integration tests (including new fact/canonical/server-result/About checks), TypeScript, and the production build pass. Lint on touched sources holds the captured starting baseline of five existing errors and two warnings; no new findings. Real-browser checks at 1280px and 390px cover the About credits, canonical search navigation, retained dialog behavior, TBA event pages, topic layout, no horizontal overflow, and matched Privacy/About footer styling and placement. Browser Share-sheet/clipboard completion was not established in the in-app browser; its unchanged URL construction and ordinary event-link behavior were reviewed separately. Logs and preview images are in ignored `tmp/aio-*.log` and `output/seo-2026-11-04/` files.

This work was published on November 5 at the owner's request to "publish all," using the current application tree, including the existing account/game/staff-directory work. The deployment did not stage, commit, or push repository files.

### About us style follow-up — November 5, 2026

At the owner's request, About us now reuses Privacy's `AccountShell`, `policy-page`, heading and numbered section styles. Both pages have the same white page layout, header/back link, 700px content width, 38px title, 21px section headings and 14.5px body typography. The shared footer accepts the existing account-footer style so Privacy and About us retain matching links. Obsolete About card/section overrides were removed. All page content, source details, metadata and dated search links are retained.

Verified production build, TypeScript, clean lint on the three changed components, 28/28 Worker integration tests, matching computed desktop typography/width, and 390px mobile layout with no horizontal overflow and About us directly after Privacy on the same footer line. Updated preview images: `output/seo-2026-11-04/about-privacy-{desktop,mobile}.jpg`. This styling follow-up is included in the November 5 production release.

## Production publication — November 5, 2026

The staged release helper completed its production build, locked-runtime installation, activation, and local health check. Only `byucalendar.service` was restarted. The prior code/runtime is retained at `~/byucalendar/release-backup-20261105T160939Z-2785`. Existing D1 state was preserved; no migration, environment, or cron change was made. Log: ignored `tmp/ai-search-deploy-20261105.log`.

Public HTTP checks at 9:14 AM MST confirmed homepage, Privacy, About us, and Explore return 200. The calendar API still returned 2,628 events across 28 sources, matching the pre-deployment count. All three date searches have their individual canonical URL, matching date range, and event links in the initial HTML: today 29 rows; this week 40 initial rows from 73 matches; weekend 16 rows. The sitemap contains all three URLs and About us. Live TBA and away-event markup is date-only with the source venue (no invented Provo address); a missing-venue listing omits location. Account health is 200 at the origin and the service is active. Evidence: ignored `tmp/ai-search-live-{before,after}-20261105.json` and `tmp/verify-ai-search-live-20261105.mjs`.

Production browser checks confirmed About and Privacy share a 700px content width and 38px title at 1280px. At 390px About and the hydrated weekend calendar have no horizontal overflow; Privacy and About us remain on the same footer line. Navigating from About to This weekend retains 16 matching events for November 7–8, and opening an event still shows the dialog with TBA time and the original-source link. Screenshots: ignored `output/seo-2026-11-04/about-live-{desktop,mobile}.jpg`. Google indexing and AI-search placement were not measured by these deployment checks.

# Public source audit — September 14, 2026 (updated October 17, 2026)

This is a broad discovery pass, not a claim that every BYU event is public or included. Source event counts overlap; the app merges matching listings.

## Newly integrated

| Official source | Import method | Upcoming records observed | Coverage |
| --- | --- | ---: | --- |
| [AIS activities](https://byu-ais.byu.edu/activities) | Public Google ICS, linked from Activities | 120 | IS Academy, Tech Talks, webinars, employer sessions and socials. Some details are only in Slack. |
| [Accounting Society](https://accountingsociety.byu.edu/) | Homepage event listings → detail pages → `/_event.ics` | 8 | Fall socials, panels, career prep and case competition. Dates come from ICS, not stale URL slugs. |
| [Engineering](https://engineering.byu.edu/calendar) | `/iCal/export/all` + `/api/Events.json` | 45 | Club Rush, Snack & Study, leadership workshops, SIOY and fairs. |
| [Mathematics](https://math.byu.edu/calendar) | Same calendar endpoints; filter to Math-hosted links | 25 | Seminars, APEX, recruiting sessions, talks and deadlines. |
| [Computer Science](https://cs.byu.edu/department/event-calendar) | Listing → event detail → per-event ICS | 7 | Meet the Labs, cyber defense tryouts, seminars and fairs. |
| [ACME](https://acme.byu.edu/) | Homepage event links → per-event ICS | 1 | SNACME. Math links already covered by Mathematics. |
| [Life Sciences](https://lifesciences.byu.edu/month) | Calendar ICS + Events JSON; own-host records | 10 | Opening social, student activities, research and wellness. |
| [Kennedy Center](https://kennedy.byu.edu/events) | Search listing → detail → per-event ICS | 25 | Global Environmental Studies Club pizza party, international careers, films, lectures and study abroad. |
| [BYU Law](https://law.byu.edu/) | Linked 25Live public calendar ICS | 67 | Public law-school listings including academic dates. Attendance restrictions vary. |
| [Marketing Association](https://ma.byu.edu/calendar) | Linked public Google ICS | 0 | The feed is reachable but has no upcoming records. Newer MA events appear in the club-directory snapshot. |
| [BYU Student Organizations](https://clubs.byu.edu/) | Public browser-observed snapshot | 119 | 48 organizations. Explicitly **not** automatically refreshed. |
| [BYU Athletics](https://byucougars.com/all-sports-schedule) | Athletics all-sports JSON (`website-api/schedule-events`) | 172 | Every team, home and away: football, basketball, volleyball, soccer, baseball, softball, golf, tennis, cross country, track & field, swimming, gymnastics, cheer and fan events. Start times tagged TBA are placeholders. Titles follow the `<sport> vs./at <opponent>` shape so games also listed on the main BYU calendar collapse to one entry with both links. |
| [Y-Serve](https://yserve.byu.edu/events-and-activities) | Published Outlook ICS behind the page's embedded calendar (September 25, 2026) | 1,262 | 13 recurring volunteer programs (Stop and Serve, Adapted Institute, Digital Literacy, clinics, Project Uplift…) expanded into shift occurrences through September 2027. |

Exact feed URLs are in `lib/catalog.mjs`. Website source URLs are refreshed to discover new event links; those links must stay on the configured origin. Page and request bounds intentionally fail rather than silently publish a truncated replacement.

**Y-Serve integration note (September 25, 2026):** the `events-and-activities` page embeds an Outlook publish-to-web calendar whose `.ics` twin lives at the same `outlook.office365.com/owa/calendar/<id>/calendar.ics` path. That feed labels its timezone with the Windows name `Mountain Standard Time`, which `Intl` cannot interpret — `lib/catalog.mjs` now maps common Windows zone names to IANA zones before conversion, so the feed's recurring volunteer shifts expand with correct Mountain Time offsets across DST. The 1,262 upcoming count is dominated by long-running weekly programs (Adapted Institute, Digital Literacy, Stop and Serve); each occurrence is a real volunteer shift, and the calendar note asks visitors to confirm shift details on the Y-Serve site. The feed carries no per-event links, so every record points back to the Y-Serve page.

The Student Organizations public list contained 249 past and future records. The last 119 listings ran from September 14, 2026 through January 12, 2027. We observed the current September 2026 calendar and the explicit January 2027 date. Listing-only records preserve title, host organization, date/time and location; other fields stay unknown. A few directly visited event detail pages add descriptions, end times and deep links. Other entries link to the public directory. There is no verified public feed/export, and the published API documentation route denied access. No sign-in, session extraction, or private API access was used.

Club coverage includes Accounting Society, Women in Finance, Finance Society/Investment Banking Association, Marketing Association, Sales Society, SHRM, Business Management, Global Supply Chain, cybersecurity, SHPE, biomedical engineering, aeronautics, rocketry, operations research, nursing, dietetics, neuroscience, history, geography, cultural clubs, recreation clubs, and performing groups.

## Other sources checked

| Source | Finding |
| --- | --- |
| [APEX](https://apex.byu.edu/apex-calendar) | Links to Math events already imported. |
| [Library events](https://lib.byu.edu/events/) | Current featured events link to the main BYU calendar already imported. |
| [Honors](https://honors.byu.edu/upcoming-events) | Hand-maintained table omits years and includes ambiguous/inconsistent entries. Needs a verified dated export before automatic import. |
| [Statistics](https://statistics.byu.edu/upcoming-events) | Current page contains a photo contest article, not a complete dated event feed. |
| [Y-Serve](https://yserve.byu.edu/) | The September 14 pass found the embedded Outlook calendar but no usable records; the published `calendar.ics` behind the same embed was integrated on September 25, 2026 (see above). |
| [Beta Alpha Psi](https://bap.byu.edu/) | Redirects to an unavailable Wix site. Kept unconnected. |
| [Marriott club directory](https://marriott.byu.edu/clubs/directory) | Redirects to Student Organizations, whose published events were captured above. |
| [Computing, Math, and Science](https://science.byu.edu/schedule-of-events) | The "Schedule of Events" page is a static Alumni Awards day schedule (Friday, February 27, 2026 — already past), not a live calendar; its RSS is empty and `science.byu.edu/iCal/export/all` returns a subset of the main BYU calendar whose UIDs the `byu` source already imports. Skipped to avoid duplicate listings; the college's department events already arrive through `byu`, `math`, and `cs`. |

## Handshake export reviewed and imported

At the user's request, `Handshake/handshake_events_complete.json` was reviewed and imported on September 14, 2026. It contains 227 event IDs with titles, hosts, offset-bearing start/end timestamps, location fields, and credential-free Handshake event links. Dates span September 14, 2026 through March 18, 2027. No account credentials, attendees, or personal appointments were found. These are user-provided event listings; this is not a verified public or institution-wide feed, and the original capture time is not supplied.

The snapshot adds 224 distinct calendar entries: two records match Mathematics listings, and two Dodge & Cox listings share the same normalized title and start. Both Handshake links are retained for that combined event. One Melaleuca entry has identical start/end times and retains an unknown end. Fourteen “Virtual / TBD” placeholders remain unknown attendance formats; 39 “To Be Determined” venues remain unconfirmed. Costs, food, and eligibility are not invented. The importer and source panel label this as an imported snapshot with no automatic refresh. Raw exports remain local and Git-ignored; only normalized listing fields are seeded.

Private AIS Slack, Instagram/Facebook, and member-only club announcements require their own authorized connectors or organizer feeds.

## Data quality and ongoing updates

- Live sources share the app's hourly refresh policy. The browser checks on opening and every five minutes while open. No closed-app scheduler is configured.
- The Student Organizations and Handshake sources are September 14 snapshots and are excluded from those refreshes. A published BYU club feed/API is the preferred next step for unattended updates.
- Food/snack/drink filters require source evidence. A restaurant serving statement and “pizza and drinks provided” are recognized. Free food is separate from free admission.
- Brightspot metadata occasionally contains bad end dates. A timed duration longer than 31 days is withheld and explained in the description; the real start and source link remain.
- An individual source's counts may change or drop to zero as events pass. A reachable calendar with no future listings is distinct from a failed connection.

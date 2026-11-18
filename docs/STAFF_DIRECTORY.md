# BYU staff auto-allow directory — sources and rebuild

`lib/staff-directory.mjs` is the auto-allow list behind instant staff
verification: a verified `@byu.edu` mailbox whose address (or netid) appears
there is verified for its listed area at request time, with no administrator
step. Everything on the list was transcribed from an official, public BYU page.

## Matching rules

- The map keys are the addresses **exactly as published**, including BYU
  subdomains (`asayc@law.byu.edu`, `wheeler@et.byu.edu`).
- Accounts only ever carry `@byu.edu` / `@student.byu.edu`, so `autoVerifyArea`
  matches an exact key first, then any entry with the **same local part on a
  byu.edu subdomain** — the same BYU netid, and email verification already
  proved control of the mailbox. A student cannot reach a professor's entry
  without controlling the professor's netid.
- Shared role inboxes (`engineering@byu.edu`, `mecheng@byu.edu`,
  `lsadvisement@byu.edu`, `csmedia@byu.edu`, `lawevents@law.byu.edu`, …) and
  non-BYU addresses are never listed — including role addresses that a listing
  page associates with a named assistant.
- Adjunct faculty, student employees, and other part-time help are not listed:
  the pass is for full-time BYU faculty and staff.

## Sources (captured 2026-11-04)

| Area | Entries | Source page |
| --- | ---: | --- |
| Law | 103 | https://law.byu.edu/explore/resources/faculty-directory (the page embeds the school's full people index: full-time faculty, librarians, career development, student affairs, dean's office, registrar, IT). Adjunct faculty and student workers excluded. |
| Computer Science | 71 | https://cs.byu.edu/department/active-faculty-and-staff — each profile under `cs.byu.edu/directory/<name>` publishes its own address. Shared lab/office inboxes (`csmedia@`, `cscapstone@`, `csrelations@`, `cs-social1@`) excluded. |
| Life Sciences | 3 | https://lifesciences.byu.edu/directory (only listings that publish personal addresses; department and advisement inboxes excluded) |
| Engineering | 189 | https://engineering.byu.edu/faculty-and-staff-directory (faculty and staff across Chemical, Civil, ECE, Manufacturing, Mechanical, Technology, Dean's office, Student Services, Computing) |
| Marriott School | 12 | Department contact/advisement pages under https://marriott.byu.edu (accountancy, finance, global supply chain, information systems, marketing, MISM, MBA/MPA program pages, advisement center, experiential learning) |
| Kennedy Center | 42 | https://kennedy.byu.edu/kc-directory (director, associate directors, program coordinators, academic advisors, travel and advisement staff) |

## Known gaps, deliberately left unlisted

- **Marriott faculty**: the school's `/directory/details?id=` pages gate every
  contact detail behind reCAPTCHA (`To view contact information, verify you are
  human below`), and its department faculty pages print names and titles only.
  The 12 Marriott entries are staff whose addresses the school publishes on
  contact and advisement pages. Professors there keep the normal administrator
  approval until a public page with their address exists.
- **Math, Athletics**: their public pages publish only shared department inboxes
  (`office@mathematics.byu.edu`), so no personal entries are available.
- **Club presidents and club leaders**: BYU publishes no public club contact
  directory — `clubs.byu.edu` and the Marriott club directory are Mendix apps
  that require a BYU login, and department club pages name faculty advisors
  without addresses. Club verification stays manual. Law's `@club.law.byu.edu`
  addresses are shared club inboxes, not people, and are excluded by rule.
- **CS role accounts**: department media and capstone inboxes belong to shared
  offices/student employees, so they stay off the list even though the
  directory prints them.

## Rebuild procedure

1. Open each source page above (or a new official BYU directory page).
2. Copy every `Name — published email` pair into `AUTO_VERIFIED_STAFF`,
   mapping to the area id from `lib/staff.mjs`. Keep the address exactly as
   published; lowercase is fine (matching lowercases).
3. Skip shared inboxes, generic contacts, assistant-of-role addresses, adjuncts,
   student employees, and any non-BYU address.
4. Update the table above with the capture date and counts.
5. `node --experimental-strip-types --test tests/staff.test.mjs` — the suite
   pins the matching rules, the directory's minimum population, and the
   exclusions.

Only add people a public BYU page itself presents as faculty, staff, or an
official contact. When a person leaves the university, remove their entry;
revocation for an already-verified account is one click in `/moderation`.

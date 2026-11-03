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
  `lsadvisement@byu.edu`, …) and non-BYU addresses are never listed.

## Sources (captured 2026-11-02)

| Area | Entries | Source page |
| --- | ---: | --- |
| Law | 10 | https://law.byu.edu/explore/resources/faculty-directory (faculty directory; the employee directory renders the same first block) |
| Computer Science | 3 | https://cs.byu.edu/department/faculty (names) + individual profiles under cs.byu.edu/directory/ (emails: Goodrich, Killian, Kapp) |
| Life Sciences | 3 | https://lifesciences.byu.edu/directory (only listings that publish personal addresses) |
| Engineering | ~170 | https://engineering.byu.edu/faculty-and-staff-directory (faculty and staff across Chemical, Civil, ECE, Manufacturing, Mechanical, Technology, Dean's office, Student Services, Computing) |

Known gaps, deliberately left unlisted:

- **Math, Marriott, Kennedy, Athletics** publish names without personal emails
  on their index pages (math.byu.edu/faculty, marriott.byu.edu/directory); their
  people use the normal administrator approval.
- **CS beyond three entries**: emails live on ~27 individual profile pages;
  transcribe more from cs.byu.edu/directory/&lt;name&gt; as desired.
- **Club presidents**: BYU's clubs directory does not publish president emails
  publicly; club verification stays manual.

## Rebuild procedure

1. Open each source page above (or a new official BYU directory page).
2. Copy every `Name — published email` pair into `AUTO_VERIFIED_STAFF`,
   mapping to the area id from `lib/staff.mjs`. Keep the address exactly as
   published; lowercase is fine (matching lowercases).
3. Skip shared inboxes, generic contacts, and any non-BYU address.
4. Update the table above with the capture date and counts.
5. `node --experimental-strip-types --test tests/staff.test.mjs` — the suite
   pins the matching rules and the directory's minimum population.

Only add people a public BYU page itself presents as faculty, staff, or an
official contact. When a person leaves the university, remove their entry;
revocation for an already-verified account is one click in `/moderation`.

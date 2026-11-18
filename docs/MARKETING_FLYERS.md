# Printed flyer pilot

Created November 5, 2026 for owner review. The current revision uses `output/pdf/byu-calendar-flyer.pdf` as the visual reference; the owner's sketches supply only the broad placement. Three US Letter portrait flyers are in ignored `output/pdf/`:

- `01-byu-calendar-qr-poster.pdf`: evergreen awareness poster, large QR above an illustrated calendar of event categories.
- `02-finance-business-events-flyer.pdf`: five real Finance/Business listings for November 9-20, 2026, calendar above a filtered QR.
- `03-ais-events-flyer.pdf`: five real AIS listings for the same window, events above a filtered QR.

Shared design: the existing Archivo/Roboto fonts, site blue `#1a73e8`, white space, dark outlines, and a pale blue QR panel with the original flyer's small offset shadow. The general flyer keeps QR above an illustrated calendar. Audience flyers use five readable date/event rows and a brief "See you there" invitation. Finance and AIS lead at 88pt and 100pt respectively, with a smaller "events" label and only "November" as the date heading. Every URL sits directly below its QR. BYU Calendar is the last element at the bottom of all three pages; small footer notes, source-check lines, date-window/year labels, and the Mountain Time caption are removed from the artwork at the owner's request. The real event dates and times remain in the rows; their full year, window, time-zone context, and evidence stay in the manifest and this guide. Refresh or remove dated flyers after November 20. No distribution, email campaign, or other-school rollout was performed.

## Source selection

Current records were collected from the public calendar API on November 5, then checked directly against the organizer feeds:

- [BYU Marriott calendar](https://marriott.byu.edu/calendar/), using its [featured calendar ICS](https://calendar.google.com/calendar/ical/events%40marriottschool.net/public/basic.ics): Women in Finance alumnae panel, McKinsey Latin America info session, BYU KBSA - Qualtrics, Pre-Finance Womens Lunch, and WINFA PEVC.
- [AIS activities](https://byu-ais.byu.edu/activities), using the [public AIS ICS](https://calendar.google.com/calendar/ical/ais.byu%40gmail.com/public/basic.ics): Pies with Professors, November 12 Tech Talks, November 13 A-Team, WAIS Activity, and IS Academy professor panel.

The source manifest at `output/pdf/flyer-event-sources-20261105.json` retains every source record, shortened display text, stable event link, and QR destination. Missing rooms stay unposted/TBD. Pies with Professors is November 10-12 because its November 13 all-day end is exclusive; no hour is invented. A-Team follows the organizer's request to confirm recurring meetings in AIS Slack. No free-admission or food claim was inferred.

QR destinations are the homepage, `/?q=Finance+or+business`, and `/?q=AIS`. Every selected event passes the matching search filter. Event titles and QR areas are clickable in the PDFs.

## Rebuild and next departments

`scripts/generate-campaign-flyers.py` uses ReportLab and the same embedded Archivo and Roboto project fonts as the reference flyer. With a Python environment containing ReportLab:

```powershell
python scripts/generate-campaign-flyers.py --calendar output/pdf/flyer-event-sources-20261105.json
```

That command reproduces this exact source selection. For a fresh batch, update the generator's date range, audience profile, selected IDs/display lines, and filtered QR; pass a fresh calendar API snapshot and verify every selection against organizer sources. Keep the composition and five-event limit consistent. Refine the Finance/AIS pilots before producing posters for other schools.

## Verification and print settings

Print at 100% / Actual size, US Letter portrait, one-sided. No bleed or borderless printer is required. Retain the QR's four-module white margin.

All three revised one-page PDFs were rendered with Poppler and visually inspected. Archivo and Roboto fonts are embedded; QR modules and artwork are vectors. All three QR codes decoded from the rendered 130 DPI pages to the expected destinations. Text stays within the page; brand is the final printed line, URLs are below QR areas, and the audience title is the largest type. Source dates/times and search-filter inclusion are retained from the November 5 organizer checks, with a five-event subset for AIS. Verification is in `output/pdf/flyer-verification-20261105.json`; final PNGs are under `output/pdf/previews/`. Physical print/phone-camera testing has not been performed.

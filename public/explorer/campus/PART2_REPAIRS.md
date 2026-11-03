# Part 2 campus repairs — November 2, 2026

The confirmed JSB and Maeser defects are repaired locally in the current Blender
master and the paired game model/catalog. This completes the requested map-repair
scope. The independent calendar map is preserved. Nothing in this expansion has
been published; human playtesting belongs to the owner.

## Repaired geometry

- **JSB, `r4871647`:** removed the oversized north curtain/canopy that crossed
  the open forecourt. Registered the low north glass bay, recessed entrance and
  adjacent taller glazing to the official plan. Lowered only the north frontage
  with closed roof transitions; retained the courtyard, southern auditorium and
  other elevations. Added the slender eastern masonry/louver/rod spire and the
  west large glazed bays, masonry separators and solid entrance canopy.
- **Maeser, `w60110296`:** replaced the oversized axis-aligned box with the
  official rotated outline, including its rear projection. The long axis is
  about 60.56° from GLB +X toward +Z. The west-facing recessed portico has four
  freestanding columns and two masonry piers, steps, cornice and a simplified
  beehive above the front portico.

Both remain original stylized meshes in the existing campus palette. Heights,
secondary elevations and roof details are approximate. JSB's north roof join at
GLB Z 20.00 is inferred from the aerial, with roughly 2 m uncertainty; the spire
is approximately 19.74 m tall and 1.44 m wide, estimated from photo proportions.
No surveyed height claim or complete four-elevation certification is made.

The official Maeser minimum rectangle measures about 34.25 × 16.76 m; its polygon
area is 512.34 m². These are plan measurements, not enclosed-floor-area claims.
The old 1,463.85 m² mesh projection was 2.86 times that official area. Simply
translating that box could not repair its shape or orientation.

The final source-triangle union is 645.85 m² including stairs/trim, and covers
the official Maeser polygon after a 0.5 m tolerance. Source reproduction:
`scripts/audit_part2_plans.py`. JSB's projected area falls from 3,850.03 to
3,711.57 m² after removing the forecourt decoration; its retained 1.54% uncovered
official patch remains a reference/outline-semantic uncertainty, not an invented wing.

## Evidence and preservation

Source project: the separate BYUCampus Blender workspace.
The pre-repair master SHA256 is
`0aa27000cc2fb7058d9af6f29835dda1f958bb92f3082a59823775ad2421bee0`.
Backups are in its `backups/part2_2026-11-02/`; preceding website game assets and
protected hashes are in this checkout's ignored `tmp/part2-repair-before/`.

The candidate audit changes exactly the two existing JSB/MSRB objects and
preserves **5,776 other meshes** by geometry, colors/attributes, transforms,
visibility and custom-property fingerprints. No feature objects are added or
removed. HBLL's intentional entrance notch and skylights, terrain/paving,
bridges, stadium and all unrelated edits are preserved. All 527 stable feature
IDs and numeric picking indices, coordinate origin/scale and `_SURFACE`
semantics survive export. Ordinary calendar model/catalog/scenery and Part 4
route/height data retain their preceding byte hashes. Independent edits to the
ordinary viewer/pins appeared during final handoff and are preserved as well;
they are outside this building repair and its earlier production build.

Local source evidence is under `audit/part2_repairs_2026-11-02/`:
`registration.json`, `repair-report.json`, `before-geometry.json`,
`after-geometry.json`, `Campus_before.blend`, `Campus_candidate.blend`, and
twenty `before/after-{jsb,msrb}-{north,west,south,east,top}.png` renders.
All ten candidate views were visually reviewed; the photographed north/west
JSB and west Maeser elevations guide the repairs. Viewing a model's other
elevations does not verify them against real photographs.

Independent raw-geometry review found no culling gaps in 3,408 successful JSB
and 3,608 Maeser exterior/roof ray samples. Both edited meshes have zero
nonfinite vertices, degenerate faces or negative-volume closed components.
Open planar window decorations are expected. JSB's altered main shell is closed;
no global double-sided material or blanket normal flip is used.

## References and limits

The [BYU buildings layer](https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/BYU_Campus_Buildings/FeatureServer/0)
supplies the registered plans; its cached geometries match the October 28 live
capture. Retrieval is not a 2026 survey. Dated
[USGS NAIP imagery](https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer),
tile `m_4011151_ne_12_060_20211121`, acquired November 21, 2021 at 0.6 m source
resolution, supports broad plan/roof registration. Upsampling for overlays does
not increase that source detail.

JSB references are the [official map-selected north photo](https://live.staticflickr.com/65535/48643202492_ed028b0cc6_b.jpg),
[Jstark7's July 22, 2020 north photo](https://commons.wikimedia.org/wiki/File:BYU_Joseph_Smith_Building.jpg)
and [Karl L. Greenwood's August 14, 2010 west photo](https://commons.wikimedia.org/wiki/File:BYU_JSB.jpg).
Maeser references are its [official map-selected exterior](https://live.staticflickr.com/65535/48642706508_b3c68eabd5_b.jpg)
and BYU RSC's [beehive/portico account](https://rsc.byu.edu/notes-amateur/beehive-portico).
The official photos' capture dates are unknown. Images are local review
references, never shipped as runtime textures.

Earlier review screens remain
historical evidence. CONE/CONF/ECNB/ECCB appendage associations, the Carillon low
podium and additional secondary-elevation references remain unresolved research
candidates. No unsupported full-height wings were invented. Those questions do
not reopen the two confirmed repairs completed here.

## Reproduction and release checks

In BYUCampus, `scripts/prepare_part2_repairs.py` creates the projected plan
registration. Load the backed-up pre-repair master and run
`scripts/repair_campus_part2.py --inspect`, then the same script without
`--inspect` for a separate candidate. It refuses a source with a different hash
or one already repaired. Use `scripts/run_logged.py`; wait for the completion
marker before the next Blender action. Never rerun historical whole-campus
builders over the current master.

After visual review, promote the candidate and run, sequentially:

```powershell
# From BYUCampus, using the documented Blender launcher / Python 3.12 runtime:
# export_architecture_v2.py --export-only in Blender
node scripts/measure_geometry.mjs
# coordinates.py with the source project's .tools/python packages
node scripts/optimize.mjs
node scripts/validate.mjs
node scripts/verify_coordinates.mjs
node scripts/raycast_smoke.mjs
node scripts/verify_exterior.mjs --output audit/part2_repairs_2026-11-02/web-exterior.json
```

Synchronize only the game GLB/catalog and updated guides. In BYUCalendar:

```powershell
node scripts/audit-explorer-buildings.mjs
node scripts/build-explorer-navigation.mjs --audit-ground
node scripts/build-explorer-navigation.mjs --extend
node scripts/audit-explorer-district.mjs
node scripts/audit-explorer-hike.mjs
npm test
node node_modules/typescript/bin/tsc --noEmit
npm run build
npm run test:worker
```

The new building audit checks the shipped loader/decoder, all triangle IDs and
ground semantics, eleven specific repair fixtures, and dense four-side/roof
culling. It checks that north glass is visible ahead of its backing, that the
canopy has an underside and that Maeser's former excess corners are empty.
It writes `tmp/explorer-buildings-audit.json` without editing assets.

The game model/catalog and native host/import/style cache token is
`20261102buildings2`; the hike data revision remains `20261102hike1` and the
building repair does not change ordinary viewer URLs. A concurrent ordinary-map
pin update uses `20261102pins1`, superseding its prior `20261027mapsplit1` token.
Navigation must pin the final game model SHA256.

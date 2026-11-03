# Campus ground connection — October 27, 2026

**November 2 current-master update:** the confirmed JSB/Maeser Part 2 repairs
now supplement this ground pass. The current detailed GLB is 66,889,016 bytes;
web GLB is 8,788,124 bytes / 809,217 triangles / 70 batches. Ground geometry and
semantics are preserved; the renewed contact/navigation checks pass. See
[PART2_REPAIRS.md](PART2_REPAIRS.md) for current hashes/checks and before/after
evidence. The October measurements below describe that dated release.
BYUCalendar's current local native/model-pair token is `20261102buildings2`;
its ordinary map and `20261102hike1` hike data are unchanged. These repairs have
not been published.

The refined master, detailed GLB, web GLB and paired coordinates include the ground-connection pass. BYUCalendar uses this larger pair only for the 404 and `/explore` game, at `public/explorer/campus/`. Its normal calendar map retains the preceding 4.61 MB model and matching coordinates in `public/campus/`.

The prior overlays had accumulated clearance and local lifts: some ordinary roads stood several meters above terrain at source scale. The game also used a height cutoff that could choose the terrain underneath visible paving. These were separate visual and controller faults.

## Geometry

- 5,019 ordinary road, path, parking, landscape, athletics and field-marking objects were intersected with the terrain's triangle planes and fitted to them. XY outlines, per-face colors and the campus coordinate frame are retained. Redundant coplanar cuts are dissolved within the same color region.
- Nominal clearances in native units: landscape 0.0018; parking 0.0028; road 0.0036; path 0.0045; athletics 0.0032; field marks 0.0042. These small offsets prevent depth flicker after quantization. One native unit is approximately 22.44 meters.
- Seventeen bridges identified in the cached OSM source and four solid landscape objects are preserved. Buildings, terrain shape, vegetation, water and all other untargeted mesh geometry/color/transforms are preserved (759 mesh fingerprints checked before the coplanar cleanup, which only processes the declared changed objects).
- `_FEATURE_ID` is retained. `_SURFACE` additionally survives batching: 0 non-ground, 1 terrain, 2 road, 3 path, 4 parking, 5 landscape, 6 athletics/markings, 7 bridge. This lets the game use the rendered triangles and distinguish an overhead deck from the lower surface.
- Current detailed GLB: 66,746,416 bytes. Web GLB: 8,771,888 bytes, 807,401 triangles, 70 batches. The previous web release was 4,614,272 bytes / 511,307 triangles; exact ground fitting increases the asset and collision cost. Phone performance is unmeasured.

## Verification

The detailed, compressed and decoded GLBs pass validation with zero errors/warnings. All 527 location anchors, 516 mesh feature IDs, per-triangle feature IDs and 35 building-picking checks pass. Maximum feature-bound compression drift remains 0.001176 native units (2.64 cm at source scale).

The actual decoded web model passed 36,236 sampled ground-contact checks, including reachable bridge decks. Ordinary paving samples stay above the terrain; highest measured path clearance is 0.006372 native units (about 14.3 cm). Runtime ground agrees with visible surface samples to floating-point tolerance. This is a sampled check, not a guarantee about every possible movement or camera position.

In BYUCalendar, the larger scooter-radius audit reaches all 69 authored targets. Its generated graph has 3,770 nodes / 3,845 edges, reviewed in both directions. Browser walking and scooter checks around the library confirmed the raised strip no longer crosses the character, and the wheels follow the slope. The cache was deliberately refreshed to exclude the preceding model. Full-length playthroughs and physical-phone checks remain separate.

Reports: `validation/grounding_report.json`, `validation/grounding_web_validation.json`, the ordinary GLB/coordinate/picking reports, and `grounding/scooter.png`.

## Reproduce and continue

Backups of the preceding master, detailed/web GLBs and coordinate files are under `backups/grounding_2026-10-27/`. Original `Campus.blend` and `byu_campus_editable.glb` are untouched.

1. To reproduce, load the backed-up preceding `Campus_refined.blend` and run `scripts/ground_campus.py`, then load its `deliverables/Campus_grounding_review.blend` and run `scripts/simplify_grounding.py`. The grounding script refuses an already-revised scene.
2. Export the reviewed candidate using `export_architecture_v2.py --export-only`; run `measure_geometry.mjs`, `coordinates.py`, `optimize.mjs`, `validate.mjs`, `verify_coordinates.mjs` and `raycast_smoke.mjs` sequentially. Keep the Blender master's placement, scale and feature IDs.
3. After review, promote the candidate to `deliverables/Campus_refined.blend`. Continue ordinary manual edits from that master.
4. `sync_calendar_assets.py` mirrors the grounded pair and this guide to BYUCalendar's `public/explorer/campus/`. It preserves the smaller normal-map GLB/catalog/lookup. Rebuild game navigation after game geometry/controller edits. `build-explorer-navigation.mjs --audit-ground` validates decoded game contact; `--extend` revalidates cached routes before reuse and replans blocked paths. Regenerate the calendar location lookup only when its own normal-map catalog changes.
5. The ordinary map's six asset URLs use `20261027mapsplit1`; the game pair has independent paths and token `20261027ground1`. Only the unchanged valley/vendor files are shared. Native game host/entry/world import version is `20261027gamesplit1`; production game modules are hashed. Change each model and its own catalog together.
6. Repackage only after the GLB/catalog, docs and validation reports agree. The earlier architecture/detail images describe their dated releases; the new ground screenshot is separate.

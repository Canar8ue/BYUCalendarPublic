# Optional valley scenery

The September 22, 2026 map update adds distant Utah Valley and Wasatch terrain
outside the existing campus crop. `public/campus/valley_lod.glb` is a separate
38,268-byte Meshopt asset: 2,432 vertices, 3,932 triangles, one material/draw
call, and no textures. This adds 0.87% to the campus GLB download and 0.81% to
its triangle count. The approximately 1 KB loader uses the existing decoder.

`calendar-map.js` calls `loadValleyContext` only after the campus is ready.
It schedules the optional request during idle time, with a one-second timeout
and a requestAnimationFrame fallback. Failure leaves the original campus
usable. Successful loading changes the sky, adds distance fog, extends the
camera's far plane, and invalidates one frame. No new animation loop, shadows,
terrain-service requests, picking surfaces, or coordinate records are added.

The mesh preserves all 528 upper-edge vertices from the detailed campus
terrain, with progressively coarser rings extending 22 km beyond it. Elevation
blends into the original edge over 350 m; colors blend over 700 m. The valley
floor uses the campus ground color and material, while mountain elevations
transition to green between 1,550 and 1,800 m. Heights
come from a roughly 249 m USGS 3DEP export cached in the Blender project on
September 22. Blue low-basin coloration suggests Utah Lake; it is a generalized
visual approximation, not a surveyed shoreline. See the bundled attribution.

The white hillside Y uses the mapped OpenStreetMap way 81106082 outline,
projected into the same coordinate system. Its faces are clipped at the
coarse terrain's triangle edges and lifted 0.025 model units to avoid depth
flicker. It contributes 54 triangles and 1,888 bytes within the same material
and primitive, so it adds no textures or draw calls. It is scenery only and
does not add a building/catalog entry. The mountains remain green.

The current Y is intentionally stylized: its existing 2.6× size and 120 m
northward offset are retained, with an additional 30% widening perpendicular
to the stem. Length along the stem is unchanged by the width adjustment.
This is a visual landmark, not the original footprint at its exact scale.

## Rebuild

These assets are served unhashed, and the edge/browser caches them up to
4 hours (`Cache-Control: public, max-age=14400` on non-HTML `/campus/*`).
Whenever any of `campus_web.glb`, `calendar-map.css`, `calendar-map.js`,
`valley-context.js`, `valley_lod.glb`, or `coordinates.json` changes, bump the
shared `?v=` token in all six places at once: the stylesheet and script tags in
`index.html`, its import inside `calendar-map.js`, and the `campus_web.glb`,
`coordinates.json`, and `valley_lod.glb` URLs — otherwise returning visitors
keep the old copy for up to 4 hours after a deploy.

The ordinary map retains the 4.61 MB October model/catalog and uses
`20261027mapsplit1` for all six URLs. The game loads the 8.77 MB grounded pair
from `/explorer/campus/` with its own `20261027ground1` token; it shares the
unchanged distant valley mesh and its normal-map token. Preserve `_SURFACE`
with `_FEATURE_ID` and regenerate game navigation after game geometry/collision
edits. See `public/explorer/campus/GROUNDING.md` for the
source pipeline and verification. Game asset sync must preserve the smaller
normal-map model and its paired coordinates.

Source project: the separate BYUCampus Blender workspace.
Use its existing Node dependencies. To refresh the DEM, run
`python scripts/prepare_valley.py` (requires Pillow); otherwise retain the
cached `audit/valley/elevation.json` for reproducibility.

The cached Y outline is `audit/valley/mountain-y.json`. Regenerate it after
changing `audit/valley/y-mountain.osm` using `scripts/prepare_mountain_y.py`
with Python 3.12 and the project's `.tools/python` pyproj/Shapely libraries.

Then build and validate:

```sh
node scripts/build-valley.mjs
node scripts/validate-valley.mjs
```

Copy `deliverables/web/valley_lod.glb` into this repository's `public/campus/`.
Keep `valley-context.js` synchronized between the two viewers. Run
`node --test tests/campus-terrain.test.mjs tests/campus-map.test.mjs`, then the
production build and browser checks. The asset budget is 50 KB, 5,000
triangles, one primitive, and zero textures. Do not ship the source raster.

This addition does not require re-exporting the campus GLB or coordinate
catalog. If the campus crop, scale, origin, or edge changes in the future,
rebuild the backdrop against the new detailed model as well.

### Game-only Y depth correction — October 28, local

The unchanged shared asset still contains one primitive/material. In the game,
`valley-rendering.mjs` recognizes its `mountainY` metadata and separates the
54 white triangles into a second material group. Only that cloned material uses
polygon offset (`factor=-1`, `units=-1`); depth testing/writing and ordinary face
culling remain enabled. The game adds one draw call, with no extra download,
vertex lift, camera-plane change or shared-map cache-token change. Native game
revision is `20261028campus2`; this correction is not published.

The decoded footprint and 378 corner/edge/center samples pass
`node scripts/audit-explorer-y.mjs`; clearance remains 0.0249975–0.0250040 model
units. Campus views at near .0035/far 1600 have less than one estimated 24-bit
depth step of separation. A browser with a confirmed 24-bit depth buffer
reproduced the grazing-angle patchiness and showed a solid Y after the bias.
Day/sunset, motion, near views, mountain occlusion and narrow layout were checked
separately from the geometry audit. This does not make the decorative Y/trail geographically
accurate or add hiking collision.

## Verification

The compressed and decoded backdrop pass glTF validation with no errors or
warnings. All 3,932 triangles face upward and are nondegenerate. No backdrop
surface intersects a vertical ray at any of the 527 campus anchors, and the
existing 35 building-picking checks still pass. Browser timing is a local
desktop comparison, not a measurement on phone hardware. Preserve rendering
only when needed and the existing 1.5 pixel-ratio cap.

September 22 browser checks: east/west scenery and narrow layout inspected;
HBLL pin selection and focus-completion messages passed with the backdrop
present and selection passed with an injected scenery 404. After settling,
the map rendered zero frames during a 1.5-second idle observation. In 70
alternating render/finish pairs after warmup, scenery plus fog versus neither
had equal observed medians: 1.5 ms at 1280 × 744 and 1.3 ms at 375 × 788.
These local, short measurements do not predict every device or view. Raw
results are in the Blender project's `audit/valley/browser.json`. The timing
samples precede the 54-triangle Y addition. Its mapped area and clearance
above the hillside pass the geometry validator, and its appearance was
checked in the website browser.

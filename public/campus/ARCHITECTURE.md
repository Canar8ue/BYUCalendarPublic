# Architecture refinement — October 5, 2026

The revised `Campus_refined.blend` updates **30 building codes / 37 physical mesh parts**. It builds on the earlier refined master, preserving the presentation scale, location frame, stable feature IDs and established campus style.

## October detail and solidity correction

This pass starts from the latest saved master, rather than rebuilding the earlier scene. The preceding master and complete release are preserved in `backups/details_2026-10-05/` in the source workspace.

- Closed facade trims and corrected their winding, along with arched windows, dormer gables, clock faces and practice-facility ends. Ordinary back-face culling stays enabled; opaque building walls are not made transparent or globally double-sided.
- **HBLL:** narrower vertical windows, quieter precast-panel colors and joints replace the broad window grids and estimated diamond ornaments. Later manual changes on the entrance-side facade and the entrance/skylight additions retain their geometry; the unchanged reversed base trim is repaired.
- **Arts Building:** compared the entrance with BYU's [completed 2026 exterior photograph](https://magazine.byu.edu/article/new-byu-arts-building/). Adjusted pale entrance frames, brick side windows and roof coping, and removed the unverified projecting front beam. Footprint, overall massing and stage volumes remain inherited and approximate.
- **Music Building:** removed unsupported rows of arches from the lower solid performance walls. Retained the photographed upper hall arches and glazed lobby.
- **Hinckley Center:** two main window rows beneath the dormers; repaired dormer, roof and clock-face orientation. Secondary elevations remain estimated.
- **Indoor Practice Facility:** broad pale clerestory bands, brick lower walls and pale end panels follow the [builder's photographs](https://www.okland.com/markets/higher-education/byu-indoor-practice-facility/). Translucent panels are represented by opaque colors in the established map style.
- **Tanner:** added the four missing risers and backing between the roof ring and the depressed atrium skylight.
- **Benson:** gave the curved entrance canopy a closed underside and edge faces.
- **JFSB:** extended paving into the exposed courtyard-floor gaps without covering the open courtyard. Four smaller, faceted fountain stones replace the oversized rectangular pillars, using the [courtyard photograph](https://travelphotobase.com/i/USUT/UTP142.JPG) as a proportion guide. Stone dimensions remain approximate.
- **Herald R. Clark:** corrected reversed north wall faces and placed the window relief on the outward side.

Every old decoration replaced in this pass was matched to the current mesh by its coordinates and color. All 5,741 untargeted meshes retain their geometry, colors and transforms. The stadium, Heritage Halls, planned Administration, Marriott Center, roads, terrain and other landmarks are preserved. The feature roster remains 527 records.

`details/` supplies twelve additional exterior review renders. `validation/details_detail_report.json` records the per-object changes; `VALIDATION.md` describes the independent Blender and compressed-web checks. The prior architecture coverage below remains useful background, with these October changes taking precedence.

## Principal changes

- **Harold B. Lee Library:** muted precast-panel relief and narrow vertical windows replace the repeated office facade. The glazed north entrance, hipped glass roof and four low skylights retain the user's latest edits.
- **Tanner Building:** separate seven-level east and four-level west masses, granite-colored bands, continuous glazing, corner cores, an atrium roof opening and glazed connector distinguish its original building and addition.
- Other prominent work includes Kimball's brick tower and floor bands, Eyring's planetarium dome and entrance, Hinckley's roof/dormers/clock tower, JFSB's curved glazing and fountain court, the Music Building's performance volumes, and the older buildings' classical details.
- Removed doubled Eyring outline walls above its actual component roofs, corrected Brimhall's roof cap, and replaced obsolete roof trim on the edited buildings.

## Building coverage and reference links

Descriptions list the modeled changes. A linked visual reference supports material or form choices; it does not verify every dimension or elevation. Rows without a specific visual reference received a lighter facade pass using the source massing and campus context.

| Building | Changes | Reference |
| --- | --- | --- |
| Arts Building (ARTS) | Regular brick side windows, pale entrance frames around glazing, thin dark roof coping and raised stage-house volumes. Updated against the completed 2026 exterior; secondary massing remains approximate. | [Completed exterior](https://magazine.byu.edu/article/new-byu-arts-building/) |
| Ezra Taft Benson Building (BNSN) | Buff masonry science wings, grouped glazing, pale bands and a curved north lobby canopy. | [Visual reference](https://commons.wikimedia.org/wiki/File:BYU_Ezra_Taft_Benson_Building.jpg) |
| George H. Brimhall Building (BRMB) | Buff-brick facade, vertical pilasters, grouped tall windows, shallow entry surrounds and flat parapet roof. | [Visual reference](https://wpa-architecture.com/works/byu-brimhall-bldg-remodel/) |
| Brewster (Sam F) Building (BRWB) | Brick walls, pale framing and larger glazing at the principal elevation. | [Campus map](https://map.byu.edu/); secondary details inferred |
| Clyde (W W) Engineering Building (CB) | Pale structural piers and slender grouped glazing on the retained engineering footprint. | [Visual reference](https://commons.wikimedia.org/wiki/File:Clyde_Building_BYU.JPG) |
| Crabtree (Roland A) Technology Building (CTB) | Warm masonry, grouped windows and projecting pale trim. | [Campus map](https://map.byu.edu/); secondary details inferred |
| Engineering Building (EB) | Rebuilt north glass front with tall pale piers, brick lab wings, deep horizontal lintels and projecting roof canopy. | [Visual reference](https://ece.byu.edu/content/elder-bednar-dedicates-engineering-building) |
| Carl F. Eyring Science Center (ESC) | Pale stone science wings, horizontal window groups, east entrance glass/columns and steps, plus a modeled planetarium dome. | [Visual reference](https://commons.wikimedia.org/wiki/File:ESC_Eyring_Science_Center.jpg) |
| Harold B. Lee Library (HBLL) | Retained the edited north glass entrance pavilion and hipped glazing; muted precast-panel relief and narrow vertical windows, with manual entrance-side facade changes preserved. Roof and facade proportions estimated from photographs. | [Visual reference](https://lib.byu.edu/about/history/) |
| Gordon B. Hinckley Alumni and Visitors Center (HC) | Brick-and-stone facade, hipped slate-colored roof, projecting dormer gables, clock tower and pyramidal tower roof. | [Visual reference](https://www.okland.com/markets/higher-education/byu-gordon-b-hinckley-alumni-visitor-s-center/) |
| Heber J. Grant Building (HGB) | Classical pale masonry, tall upper arched windows, fluted pilasters, cornice and central entrance surround. | [Visual reference](https://ldspioneerarchitecture.blogspot.com/2015/01/byu-heber-j-grant-building.html) |
| Herald R. Clark Building (HRCB) | Warm masonry, two-level windows and pale trim; smaller elevations remain inferred. | [Campus map](https://map.byu.edu/); secondary details inferred |
| Indoor Practice Facility (IPF) | Brick lower walls, broad pale upper panels, shallow barrel roof and longitudinal ribs. Translucent exterior panels are represented by opaque colors. | [Visual reference](https://www.okland.com/markets/higher-education/byu-indoor-practice-facility/) |
| Joseph F. Smith Building (JFSB) | Warm masonry wings, courtyard arches, raised trim, four-level fenestration and curved east glass facade with horizontal sun shades. Courtyard opening retained. | [Visual reference](https://www.tbse.us/byu-joseph-f-smith-building) |
| Knight (Jesse) Building (JKB) | Warm masonry, grouped windows and restrained pale trim on the retained footprint. | [Campus map](https://map.byu.edu/); secondary details inferred |
| J. Reuben Clark Law Building (JRCB) | Tall narrow glazing separated by deeply projecting pale vertical piers and a raised central entrance frame. | [Visual reference](https://law.byu.edu/skills-academies) |
| Joseph Smith Building (JSB) | Masonry wings, grouped windows, north glazing and a projecting canopy. | [Campus map](https://map.byu.edu/); secondary details inferred |
| Spencer W. Kimball Tower (KMBL) | Red-brown brick tower end walls and podium, twelve-level strip glazing, projecting pale floor bands and roof crown on the retained tower footprint. | [Visual reference](https://commons.wikimedia.org/wiki/File:SWKT_BYU.JPG) |
| Life Sciences Building (LSB) | Brick laboratory wings, glazed central spine, silver roof caps, framed upper windows, and valley-facing curtain glazing on the sloped site. | [Visual reference](https://news.byu.edu/news/numbers-byu-life-sciences-building) |
| Thomas L. Martin Building (MARB) | Two-level masonry and window proportions on the retained lecture-hall massing. | [Campus map](https://map.byu.edu/); secondary details inferred |
| Music Building (MB) | Red-brick concert hall, large mostly solid performance volumes, upper arched openings, tiered cornices and glazed lobby. | [Visual reference](https://cfac.byu.edu/articles/school-of-music/byu-school-of-music-building-updates) |
| David O. McKay Building (MCKB) | Buff masonry with a prominent glazed east face and pale horizontal trim. | [Visual reference](https://commons.wikimedia.org/wiki/File:BYU_David_O._McKay_Building.jpg) |
| Monte L. Bean Life Science Museum (MLBM) | Sandstone museum walls with limited openings, northeast entry portico, columns, relief medallions and cornice. | [Visual reference](https://jacobyarchitects.com/portfolio-item/byu-bean-museum/) |
| Museum of Art (MOA) | Muted pink granite planes with panel joints, selective tall glass openings, entry glazing and restrained exhibition banners; removed office-like window grid. | [Visual reference](https://coldspringusa.com/case_study/brigham-young-university-museum-of-fine-arts/) |
| Karl G. Maeser Building (MSRB) | Pale classical facade, west portico with six columns, stepped entablature and beehive roof ornament; removed inappropriate generic brick treatment. | [Visual reference](https://rsc.byu.edu/notes-amateur/beehive-portico) |
| Stephen L. Richards Building (RB) | Clerestory windows, pale piers and larger lower glazing on the sports complex. | [Campus map](https://map.byu.edu/); secondary details inferred |
| George Albert Smith Fieldhouse (SFH) | Solid fieldhouse walls, clerestory openings and piers; flat roof retained. | [Visual reference](https://contentdm.lib.byu.edu/digital/collection/BYUPhotos/id/529/) |
| Talmage Math Sciences / Computer Building (TMCB) | Sparse paired narrow windows, wide brick panels, pale vertical joints and simplified sculpted relief. | [Visual reference](https://commons.wikimedia.org/wiki/File:BYU_James_E._Talmage_Math_Sciences_-_Computer_Building.jpg) |
| N. Eldon Tanner Building (TNRB) | Remade seven-level east wing and lower four-level west addition, granite spandrels, continuous glazing, corner cores, central atrium skylight and glass connector. Footprint retained; dimensions inferred from photographs and aerial guide. | [Visual reference](https://marriott.byu.edu/magazine/feature/coming-to-life) |
| Ernest L. Wilkinson Student Center (WSC) | Warm brick and pale structural trim, broad glass entrances, horizontal glazing, projecting entrance canopy and a stepped roof over the lower wing. | [Visual reference](https://commons.wikimedia.org/wiki/File:BYU_Ernest_L._Wilkinson_Student_Center_Building.JPG) |

Additional useful references: [Tanner aerial and north elevations](https://www.keenanbyu.org/tanner-bldg-guide), [HBLL historic facade panels](https://contentdm.lib.byu.edu/digital/collection/BYUPhotos/id/712/), [JFSB courtyard view](https://travelphotobase.com/i/USUT/UTP142.JPG). The Arts Building originally used a published design rendering; the October pass also uses the completed exterior photograph linked above.

## Roads

Completed **900 East southward from the Music Building area to the southern terrain boundary**, and added mapped portions of 820 North, 700 North, 560 North, Birch Lane and a short 900 North connection. The 19 added road objects total approximately **3.13 km**; that total includes the connecting roads, not just 900 East.

Alignments come from an [OpenStreetMap API extract](https://api.openstreetmap.org/api/0.6/map?bbox=-111.646,40.232,-111.632,40.254) retrieved September 15, 2026. Widths are simplified. Roads end at the existing terrain crop. This pass does not supply lane-level detail, turn rules or routing data.

The centerline audit sampled 1,129 positions along the modeled stretch of 900 East without finding a gap. All 4,492 sampled new-road face centers remained above the terrain. This is sampled coverage, not exhaustive collision analysis.

## Preserved work

The stadium, Heritage Halls, planned Administration Building, Marriott Center and Carillon were explicitly checked against the previous refined master. Every mesh outside the declared building edits, superseded roof details and road additions passed the geometry/color/transform fingerprint comparison. The original inputs remain intact. The earlier refined Blender file and complete delivery archive are retained in `backups/architecture_v1/` in the source workspace.

## Review files

The complete delivery includes `architecture/` with eleven rendered views: library, Tanner, JFSB, Kimball/Eyring, Hinckley, south sciences, music/law, arts/museum, historic buildings, roads and campus overview. `validation/architecture_report.json` contains per-object bounds, IDs and changes; `validation/geometry_validation.json` contains sampled road and geometry checks.

## Accuracy and continuation

These are reference-informed stylized exteriors. Existing footprints are largely inherited; facade dimensions, unseen elevations and some roof forms are estimated. Glass is represented by colored geometry. Smaller buildings and fine ornament remain simplified. The model does not claim construction-plan accuracy or verification of every campus facade.

Continue editing the delivered refined master. The original `refine_campus.py` pipeline rebuilds the older pass from `Campus.blend` and would discard this architecture work. Reproduction and export instructions are recorded in the separate Blender workspace.

Photographs were used as visual references only; they are not texture maps or redistributed image assets in the delivery. Reference images retain their respective rights. See `ATTRIBUTION.md` for map-data and software attribution.

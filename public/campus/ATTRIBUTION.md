# Attribution and references

## Map and terrain

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Retain appropriate attribution when displaying or redistributing this map and its derived location data.
- Original GLB metadata identified building data dated May 31, 2026 and context data dated June 1, 2026. An additional core-campus OSM extract was retrieved September 15, 2026 for landmark positions and notes.
- Terrain provenance in the supplied GLB is [USGS 3D Elevation Program (3DEP)](https://www.usgs.gov/3d-elevation-program). The existing terrain was retained. Its specific DEM acquisition/version and vertical datum were not independently verified.

### September 22, 2026 distant web terrain

`valley_lod.glb` uses a separate [USGS 3DEP elevation-service export](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), retrieved September 22, 2026, at 245 × 245 samples across UTM zone 12N bounds 414000, 4425000, 475000, 4486000 (about 249 m per sample). It is simplified and blended into the original campus edge for visual context. Lake coloration is a generalized low-elevation basin, not a surveyed shoreline. The cached raster and build recipe remain in the BYUCampus source project's `audit/valley/` and `scripts/` directories; visitors receive only the small derived mesh.

## BYU reference data

The web hillside Y uses the [OpenStreetMap mapped outline, way 81106082](https://www.openstreetmap.org/way/81106082), retrieved September 22, 2026 (version 11), with the OSM attribution and ODbL terms above. It is draped onto the simplified terrain as white geometry, intentionally enlarged 2.6×, offset 120 m north and widened another 30% across its stem for appearance. [BYU's description of Y Mountain](https://speeches.byu.edu/talks/michael-a-dunn/why-mountains/) provides landmark context. The delivered letter is stylized, not an exact geographic footprint.

- [BYU campus map](https://map.byu.edu/).
- [BYU Campus Buildings ArcGIS layer](https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/BYU_Campus_Buildings/FeatureServer/0), used to reconcile supported building names and codes.
- [BYU Athletics ArcGIS layer](https://services.arcgis.com/FvF9MZKp3JWPrSkg/arcgis/rest/services/Athletics/FeatureServer/0), used for athletic field linework.
- [BYU Magazine: new Administration Building](https://magazine.byu.edu/article/byu-new-administration-building/), proposed design and expected fall 2028 completion.
- [BYU announcement](https://news.byu.edu/new-administration-building-to-be-built-at-byu) and [Daily Herald coverage with BYU rendering](https://www.heraldextra.com/news/2025/oct/13/campus-construction-byu-to-tear-down-asb-build-new-administration-building/), architectural visual references.

The public-facing Administration Building concept rendering guided a new stylized mesh. The source rendering is not included in this package. Unseen elevations and landscaping are inferred. BYU names, marks, source artwork, and reference materials retain their respective rights; this package does not confer a license to those materials or imply BYU endorsement. The original input model's ownership is not changed by this refinement. No blanket license over all data or artwork is asserted here.

Per-feature URLs and source notes are included in `coordinates.json`.

## Architecture and east-side roads, second pass

`ARCHITECTURE.md` lists the exterior references and modeled changes for 30 building codes. References include BYU Library history, BYU Marriott School, BYU News, BYU Law, Okland, WPA Architecture, Jacoby Architects, Coldspring and linked public building photographs. Photographs informed new geometry and colors; reference photos are not redistributed or applied as textures. Unseen elevations and dimensions remain inferred.

East-side road completion uses an additional OpenStreetMap API extract retrieved September 15, 2026. The added 900 East and connecting road segments retain per-way source URLs in Blender object metadata. The existing OpenStreetMap attribution and ODbL terms also apply to these additions.

### October 5, 2026 exterior detail correction

New comparisons use BYU Magazine's [completed Arts Building exterior](https://magazine.byu.edu/article/new-byu-arts-building/), Okland's [Indoor Practice Facility photographs](https://www.okland.com/markets/higher-education/byu-indoor-practice-facility/) and the previously cited library, Hinckley, Music and [JFSB courtyard](https://travelphotobase.com/i/USUT/UTP142.JPG) photographs. These inform simplified geometry and colors only. Reference images remain in the source audit cache and are not redistributed in the packages or used as textures. Dimensions and unseen details remain approximate.

## Web software

- [Three.js](https://github.com/mrdoob/three), version 0.180.0, MIT license. License text: `web/vendor/LICENSE-three.txt` (or `vendor/LICENSE-three.txt` in the standalone web archive).
- [meshoptimizer](https://github.com/zeux/meshoptimizer), version 0.24.0, MIT license. License text: `web/vendor/LICENSE-meshoptimizer.txt` (or `vendor/LICENSE-meshoptimizer.txt` in the standalone web archive).

The standalone map includes a visible OpenStreetMap, USGS, and BYU source credit. Keep these credits when incorporating it into your website.

# Y Trail source snapshots

Retrieved November 2, 2026. These files reproduce the hiking asset without live
map or elevation-service requests. They are research/build inputs, not additional
downloads requested by gameplay.

- `osm.json`: selected original way/node coordinates and way versions from the
  OpenStreetMap API. **© OpenStreetMap contributors**, available under the
  [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  The OSM-derived route/checkpoint/letter database in `../route.json` is offered
  under that same license. See the [OSM attribution page](https://www.openstreetmap.org/copyright).
- `dem.f32`: 290 × 270 little-endian float32 elevation samples in metres NAVD88,
  north-to-south rows and west-to-east columns. This is a 3 m export of the USGS
  3DEP mosaic, not an upsample of the old 249 m game backdrop.
- `dem.json`: exact USGS query/export requests, export response, snapshot hashes,
  source catalog and five source-selection probes. The selected raster at those
  probes was `UT_Central_QL1_B2_2018`, a 1 m product. USGS elevation data are in
  the public domain; credit **Elevation data courtesy of the U.S. Geological Survey**.
- `references.json`: dated BYU/NAIP visual-reference metadata. The referenced
  photographs/aerial imagery are not embedded as game textures or redistributed
  here. Referenced BYU photographs remain the rights holders' material.

`../heights.bin` is the derived USGS elevation grid in native game Y units; it
retains the elevation data's public-domain status. An OSM license on the route
database does not change the license of independent game code or USGS terrain.


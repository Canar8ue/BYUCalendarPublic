"""Rebuild the game-only Y hike from pinned OSM/USGS source snapshots.

Default operation is offline and deterministic. --refresh downloads a fresh
review candidate into tmp/hike-sources and updates the source snapshots; review
route registration and upstream metadata before accepting that candidate.
Dependencies: Python 3.12+, numpy, Pillow, pyproj. --python-libs may point to an
existing dependency directory; this script never installs packages or edits the
Blender master, calendar map, campus GLB, or campus navigation network.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/explorer/hike"
CACHE = ROOT / "tmp/hike-sources"
UNIT = 0.044571444392204285
ORIGIN = (444718.86736966006, 4455707.985345246)
REVISION = "20261102hike1"
OSM_URL = "https://api.openstreetmap.org/api/0.6/map?bbox=-111.632,40.242,-111.618,40.251"
DEM_SERVICE = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer"
# A three-metre sample grid, with pixel-centred vertices and a 120m trail buffer.
GRID = {"width": 290, "height": 270, "extent": {"xmin": 446525.5, "ymin": 4454805.5, "xmax": 447395.5, "ymax": 4455615.5}, "spacingMeters": 3}
WAY_IDS = ["1114698619", "1028565359", "113628350", "10210957", "81106082"]
# Ordered mapped hairpins, manually checked against the trace and BYU's 2016
# photograph. These are game checkpoints, NOT surveyed numbered-sign positions.
BEND_ORIGINAL_INDICES = [34, 76, 112, 132, 155, 165, 196, 232, 255, 270, 302, 354]


def encoded_json(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf8")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def download(url, destination):
    request = urllib.request.Request(url, headers={"User-Agent": "BYUCalendar-HikeResearch/1.0"})
    with urllib.request.urlopen(request, timeout=55) as response:
        data = response.read(32 * 1024 * 1024 + 1)
    if len(data) > 32 * 1024 * 1024:
        raise ValueError("Source response exceeds 32 MB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return data


def endpoint(service, operation, parameters):
    return service + "/" + operation + "?" + urllib.parse.urlencode(parameters)


def refresh(np, Image):
    CACHE.mkdir(parents=True, exist_ok=True)
    (OUT / "sources").mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).isoformat()
    xml_bytes = download(OSM_URL, CACHE / "osm.xml")
    root = ET.fromstring(xml_bytes)
    nodes = {n.get("id"): n for n in root.findall("node")}
    ways = {}
    for way in root.findall("way"):
        if way.get("id") not in WAY_IDS:
            continue
        ways[way.get("id")] = {"id": way.get("id"), "version": int(way.get("version")), "timestamp": way.get("timestamp"), "tags": {t.get("k"): t.get("v") for t in way.findall("tag")}, "nodes": [{"id": nd.get("ref"), "lon": float(nodes[nd.get("ref")].get("lon")), "lat": float(nodes[nd.get("ref")].get("lat"))} for nd in way.findall("nd")]}
    if set(ways) != set(WAY_IDS):
        raise ValueError("The downloaded OSM extract lacks a required way")
    snapshot = {"retrievedAt": stamp, "source": OSM_URL, "sha256OriginalXml": sha(xml_bytes), "license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors", "ways": ways}
    (OUT / "sources/osm.json").write_bytes(encoded_json(snapshot))

    geometry = {"xmin": -111.632, "ymin": 40.242, "xmax": -111.618, "ymax": 40.251, "spatialReference": {"wkid": 4326}}
    query_parameters = {"f": "json", "where": "1=1", "geometry": json.dumps(geometry), "geometryType": "esriGeometryEnvelope", "inSR": "4326", "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "returnGeometry": "false"}
    query_url = endpoint(DEM_SERVICE, "query", query_parameters)
    query = json.loads(download(query_url, CACHE / "dem-local.json"))
    if query.get("error") or query.get("exceededTransferLimit"):
        raise ValueError("Incomplete USGS source inventory")
    sources = [f["attributes"] for f in query["features"] if f["attributes"]["Category"] == 1]
    checks = []
    for lon, lat in [(-111.6272773, 40.2448522), (-111.625, 40.244), (-111.623, 40.246), (-111.621, 40.248), (-111.6202, 40.24855)]:
        parameters = {"f": "json", "geometry": json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}), "geometryType": "esriGeometryPoint", "returnGeometry": "false", "returnCatalogItems": "true", "pixelSize": "1,1"}
        url = endpoint(DEM_SERVICE, "identify", parameters)
        result = json.loads(download(url, CACHE / ("identify-" + str(len(checks)) + ".json")))
        visible = [f["attributes"] for f, visibility in zip(result.get("catalogItems", {}).get("features", []), result.get("catalogItemVisibilities", [])) if visibility > 0]
        if not visible or any(a.get("LowPS", 100) > 3.1 for a in visible):
            raise ValueError("Cannot certify <=3m source coverage at " + str((lon, lat)))
        checks.append({"lon": lon, "lat": lat, "value": result.get("value"), "visibleSources": visible, "request": url})
    extent = GRID["extent"]
    parameters = {"f": "json", "bbox": ",".join(str(extent[k]) for k in ["xmin", "ymin", "xmax", "ymax"]), "bboxSR": "32612", "imageSR": "32612", "size": f"{GRID['width']},{GRID['height']}", "format": "tiff", "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation", "noData": "-999999", "renderingRule": json.dumps({"rasterFunction": "None"})}
    export_url = endpoint(DEM_SERVICE, "exportImage", parameters)
    export = json.loads(download(export_url, CACHE / "dem-export-auto.json"))
    if "href" not in export:
        raise ValueError("USGS image export failed: " + json.dumps(export))
    tiff_bytes = download(export["href"], CACHE / "dem-auto.tif")
    image = Image.open(CACHE / "dem-auto.tif")
    heights = np.asarray(image, dtype="<f4")
    if heights.shape != (GRID["height"], GRID["width"]) or not np.isfinite(heights).all() or heights.min() < 1000 or heights.max() > 3000:
        raise ValueError("Unexpected dimensions, no-data, or units in USGS terrain")
    if tuple(image.tag_v2[33550])[:2] != (3.0, 3.0):
        raise ValueError("Unexpected GeoTIFF sample spacing")
    (OUT / "sources/dem.f32").write_bytes(heights.tobytes())
    metadata = {"retrievedAt": stamp, "grid": GRID, "crs": "EPSG:32612", "verticalDatum": "NAVD88 metres retained from USGS source; the campus elevation datum has not been independently surveyed or reconciled", "license": "US public domain", "attribution": "Elevation data courtesy of the U.S. Geological Survey", "exportRequest": export_url, "exportResponse": export, "sha256GeoTiff": sha(tiff_bytes), "sha256DemF32": sha(heights.tobytes()), "sourceQuery": query_url, "sourceRasters": sources, "sourceChecks": checks, "selectionNote": "Default multi-resolution mosaic; identify checks record the visible 1m source. LockRaster requests returned no-data and were not used."}
    (OUT / "sources/dem.json").write_bytes(encoded_json(metadata))


def build(np, Transformer):
    sources_dir = OUT / "sources"
    osm = json.loads((sources_dir / "osm.json").read_text(encoding="utf8"))
    dem = json.loads((sources_dir / "dem.json").read_text(encoding="utf8"))
    dem_bytes = (sources_dir / "dem.f32").read_bytes()
    if sha(dem_bytes) != dem["sha256DemF32"]:
        raise ValueError("Pinned DEM snapshot hash mismatch")
    grid = dem["grid"]
    heights = np.frombuffer(dem_bytes, dtype="<f4").reshape((grid["height"], grid["width"]))
    if not np.isfinite(heights).all() or heights.min() < 1000:
        raise ValueError("Pinned DEM contains unsupported values")
    project = Transformer.from_crs(4326, 32612, always_xy=True)
    extent = grid["extent"]
    step = grid["spacingMeters"]
    east0, north0 = extent["xmin"] + step / 2, extent["ymax"] - step / 2

    native_grid = ((heights - 1400) * UNIT).astype("<f4")

    def elevation(east, north):
        u, v = (east - east0) / step, (north0 - north) / step
        if u < 0 or v < 0 or u >= grid["width"] - 1 or v >= grid["height"] - 1:
            raise ValueError("Route/Y lies outside source terrain grid")
        col, row = int(u), int(v)
        tx, tz = u - col, v - row
        # Use the same a,c,b / b,c,d diagonal as hike-world.mjs, including the
        # final float32 native-height precision. Raw DEM traversal passes, so
        # no invented trail grading or along-route smoothing is necessary.
        a, b, c, d = (float(native_grid[row, col]), float(native_grid[row, col+1]), float(native_grid[row+1, col]), float(native_grid[row+1, col+1]))
        native_y = a + (b-a)*tx + (c-a)*tz if tx+tz <= 1 else d + (c-d)*(1-tx) + (b-d)*(1-tz)
        return native_y / UNIT + 1400

    def way(ident):
        return osm["ways"][ident]["nodes"]

    main = way("1114698619")
    top = way("1028565359")
    if main[-1]["id"] != top[0]["id"]:
        raise ValueError("Y route and top connector no longer meet")
    source_nodes = main + top[1:]
    projected = [project.transform(n["lon"], n["lat"]) for n in source_nodes]
    distances = [0.0]
    for a, b in zip(projected, projected[1:]):
        distances.append(distances[-1] + math.dist(a, b))
    # Keep every original corner and subdivide long segments; never shortcut
    # corners or replace the source geography with a generated zigzag.
    samples, original_to_sample = [], {}
    for i, (a, b) in enumerate(zip(projected, projected[1:])):
        original_to_sample[i] = len(samples)
        parts = max(1, math.ceil(math.dist(a, b) / 2.0))
        for n in range(parts):
            t = n / parts
            samples.append((a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, distances[i] + (distances[i+1]-distances[i])*t))
    original_to_sample[len(projected)-1] = len(samples)
    samples.append((*projected[-1], distances[-1]))
    raw_elevations = [elevation(e, n) for e, n, _ in samples]
    graded = raw_elevations
    points = [{"x": round((e-ORIGIN[0])*UNIT, 8), "y": round((h-1400)*UNIT, 8), "z": round((ORIGIN[1]-n)*UNIT, 8), "distanceMeters": round(distance, 4)} for (e,n,distance),h in zip(samples, graded)]
    checkpoints = [{"id": "trailhead", "name": "Y trailhead", "kind": "trailhead", "pointIndex": 0, **points[0]}]
    for number, original_index in enumerate(BEND_ORIGINAL_INDICES, 1):
        index = original_to_sample[original_index]
        checkpoints.append({"id": f"turn-{number}", "name": f"Mapped bend {number}", "kind": "turn", "pointIndex": index, "sourceNodeId": main[original_index]["id"], "positionStatus": "inferred mapped bend; not surveyed numbered-sign location", **points[index]})
    checkpoints.append({"id": "summit", "name": "Top of the Y", "kind": "top", "pointIndex": len(points)-1, **points[-1]})

    branches = []
    for ident, branch_id in [("113628350", "base-spur"), ("10210957", "lower-y-link")]:
        coordinates = [project.transform(n["lon"],n["lat"]) for n in way(ident)]
        branch_points, branch_dist = [], 0.0
        for i, (e,n) in enumerate(coordinates):
            if i:
                branch_dist += math.dist(coordinates[i-1], (e,n))
            nearest = min(range(len(points)), key=lambda j:math.dist((e,n),samples[j][:2]))
            h = graded[nearest] if math.dist((e,n),samples[nearest][:2]) < .05 else elevation(e,n)
            branch_points.append({"x":round((e-ORIGIN[0])*UNIT,8),"y":round((h-1400)*UNIT,8),"z":round((ORIGIN[1]-n)*UNIT,8),"distanceMeters":round(branch_dist,4)})
        branches.append({"id":branch_id,"osmWayId":ident,"points":branch_points})
    base = {"id":"base","name":"Base of the Y","kind":"base","branchId":"base-spur","branchPointIndex":len(branches[0]["points"])-1,**branches[0]["points"][-1]}
    y_nodes = way("81106082")
    if y_nodes[0]["id"] == y_nodes[-1]["id"]:
        y_nodes = y_nodes[:-1]
    y_outline = [[round((e-ORIGIN[0])*UNIT,8),round((ORIGIN[1]-n)*UNIT,8)] for e,n in [project.transform(v["lon"],v["lat"]) for v in y_nodes]]
    native_heights = native_grid.tobytes()
    (OUT / "heights.bin").write_bytes(native_heights)
    length = distances[-1]
    length3d = sum(math.hypot(samples[i+1][2]-samples[i][2],graded[i+1]-graded[i]) for i in range(len(samples)-1))
    grades = [(graded[i+1]-graded[i])/(samples[i+1][2]-samples[i][2]) for i in range(len(samples)-1) if samples[i+1][2] > samples[i][2]]
    route = {"schemaVersion":1,"revision":REVISION,"unit":UNIT,"origin":{"easting":ORIGIN[0],"northing":ORIGIN[1],"elevationOffsetMeters":1400},"terrain":{"url":"/explorer/hike/heights.bin","encoding":"float32-le-native-y","width":grid["width"],"height":grid["height"],"minX":(east0-ORIGIN[0])*UNIT,"minZ":(ORIGIN[1]-north0)*UNIT,"stepX":step*UNIT,"stepZ":step*UNIT,"spacingMeters":step,"sha256":sha(native_heights)},"trailWidthMeters":2.4,"points":points,"branches":branches,"checkpoints":checkpoints,"landmarks":[base],"y":{"outline":y_outline,"osmWayId":"81106082","osmVersion":osm["ways"]["81106082"]["version"],"scale":1,"northOffsetMeters":0,"widthScale":1},"stats":{"planLengthMeters":round(length,2),"surfaceLengthMeters":round(length3d,2),"elevationGainMeters":round(graded[-1]-graded[0],2),"ascentMeters":round(sum(max(0,graded[i+1]-graded[i]) for i in range(len(graded)-1)),2),"startElevationMeters":round(graded[0],2),"topElevationMeters":round(graded[-1],2),"maxGrade":round(max(grades),4),"minGrade":round(min(grades),4),"sourceVertices":len(source_nodes),"routeVertices":len(points),"mappedCheckpoints":12},"accuracy":{"route":"OSM trace checked against BYU 2016 marked photograph; not a surveyed route or present-day signage inventory","checkpoints":"Twelve ordered mapped-bend game checkpoints; official sign positions unverified","terrain":"3m resample of a 1m USGS source; original NAVD88 elevations, no vertical fudge to match published hike statistics","trailGrade":"Unsmoothed triangulated 3m DEM shared by visible terrain and collision; 2.4m width is authored, not a survey","campusConnection":"Assisted trip from campus. The intervening streets are not modeled as walkable geography."},"sources":{"osm":{"url":OSM_URL,"retrievedAt":osm["retrievedAt"],"license":"ODbL-1.0","attribution":"© OpenStreetMap contributors","snapshotSha256":sha((sources_dir/"osm.json").read_bytes())},"dem":{"url":DEM_SERVICE,"retrievedAt":dem["retrievedAt"],"license":"US public domain","attribution":"Elevation data courtesy of the U.S. Geological Survey","snapshotSha256":sha(dem_bytes),"nativeResolutionMeters":1,"verticalDatum":"NAVD88"},"byuReference":{"url":"https://magazine.byu.edu/article/an-ode-to-the-y/","date":"2016","referenceMiles":1.06,"referenceElevationGainFeet":1074,"comparison":"Measured source route retained without length/elevation scaling; source route ends at upper-Y arm and differs from publication's endpoints/measurement."}}}
    (OUT / "route.json").write_bytes(encoded_json(route))
    print(json.dumps({"revision":REVISION,"stats":route["stats"],"routeBytes":len(encoded_json(route)),"heightBytes":len(native_heights),"terrainSha256":sha(native_heights)},indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python-libs", type=Path)
    parser.add_argument("--refresh", action="store_true", help="Fetch a new review candidate; default uses pinned source snapshots")
    args = parser.parse_args()
    if args.python_libs:
        sys.path.insert(0, str(args.python_libs.resolve()))
    import numpy as np
    from PIL import Image
    from pyproj import Transformer
    if args.refresh:
        refresh(np, Image)
    build(np, Transformer)


if __name__ == "__main__":
    main()

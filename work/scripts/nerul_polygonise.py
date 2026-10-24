"""Step 3.4: polygonise the Nerul label map and simplify it as a coverage (shared edges stay shared).

Coordinates are full-res source pixels as (x, -line), the same convention as a QGIS Georeferencer .points file,
so GCPs picked on source.jpeg apply directly (ogr2ogr -gcp x y E N ...). No CRS until georeferenced.

Usage: python nerul_polygonise.py [scale]   (must match a nerul_regions.py run)
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import shapely
from rasterio.features import shapes
from rasterio.transform import Affine
from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[2]
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
OUT = ROOT / "work" / "nerul" / ("half" if SCALE == 0.5 else f"s{SCALE:g}")

SIMPLIFY_PX = 4.0  # source px, ~2 m at the nominal 0.508 m/px
PX_M = 0.508

label = cv2.imread(str(OUT / "labels.png"), cv2.IMREAD_GRAYSCALE)
names = {int(i): c["name"] for i, c in json.loads((OUT / "labels_stats.json").read_text())["classes"].items()}
# pixel (col, row) at SCALE -> source (x, -line)
transform = Affine(1 / SCALE, 0, 0, 0, -1 / SCALE, 0)

geoms, cls = [], []
for geom, val in shapes(label, transform=transform, connectivity=4):
    geoms.append(shape(geom))
    cls.append(int(val))
geoms = np.array(geoms, dtype=object)
print(f"raw polygons {len(geoms)}, vertices {shapely.get_num_coordinates(geoms).sum()}")

# rasterio drops collinear vertices, so a shared edge can have a vertex on one side only; coverage_simplify needs
# them to match. A vertex at every pixel corner makes the coverage valid.
geoms = shapely.segmentize(geoms, 1 / SCALE)
assert shapely.coverage_is_valid(geoms), "raw coverage still invalid after segmentize"
simple = shapely.coverage_simplify(geoms, SIMPLIFY_PX)
assert shapely.coverage_is_valid(simple), "simplified coverage invalid"
simple = shapely.make_valid(simple)
print(f"simplified vertices {shapely.get_num_coordinates(simple).sum()}, "
      f"invalid after make_valid {(~shapely.is_valid(simple)).sum()}")

features = []
for g, c in zip(simple, cls):
    if g.is_empty:
        continue
    features.append({
        "type": "Feature",
        "properties": {"class_id": c, "class": names[c], "area_ha_nominal": round(g.area * PX_M ** 2 / 1e4, 3)},
        "geometry": mapping(g),
    })
out = OUT / "landuse_px.geojson"
out.write_text(json.dumps({"type": "FeatureCollection", "name": "nerul_landuse_px",
                           "_coords": "source.jpeg full-res pixels as (x, -line); not georeferenced",
                           "features": features}))
print(out, len(features), "features")

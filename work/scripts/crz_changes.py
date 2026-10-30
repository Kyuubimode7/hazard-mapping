"""Build CRZ change polygons (2011 -> 2019) from crz_zone_compare.py's output.

Reads data/derived/crz_compare/<zone>.geojson and writes data/derived/crz_changes/<zone>.geojson: one feature
per separate patch, change = grew (only in 2019) or reduced (only in 2011), with area_ha. Patches under
MIN_HA are dropped as slivers from the two maps' digitising differences.
"""
import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/derived/crz_compare"
OUT = ROOT / "data/derived/crz_changes"
ZONES = ["crz1a", "mbuf", "crz2", "ndz", "crz4b", "crz4a"]
CHANGE = {"only_2019": "grew", "only_2011": "reduced"}
MIN_HA = 0.1

to_utm = Transformer.from_crs(4326, 32643, always_xy=True).transform

OUT.mkdir(parents=True, exist_ok=True)
summary = {}
for z in ZONES:
    feats = []
    for f in json.load(open(SRC / f"{z}.geojson", encoding="utf-8"))["features"]:
        p = f["properties"]
        if p["change"] not in CHANGE:
            continue
        g = shape(f["geometry"])
        for part in getattr(g, "geoms", [g]):
            a = transform(to_utm, part).area / 1e4
            if a < MIN_HA:
                continue
            feats.append({"type": "Feature", "geometry": mapping(part),
                          "properties": {"zone": p["zone"], "change": CHANGE[p["change"]], "area_ha": round(a, 2)}})
    json.dump({"type": "FeatureCollection", "features": feats}, open(OUT / f"{z}.geojson", "w"))
    s = summary[z] = {c: [0, 0.0] for c in CHANGE.values()}
    for f in feats:
        s[f["properties"]["change"]][0] += 1
        s[f["properties"]["change"]][1] += f["properties"]["area_ha"]
    print(z, {c: (n, round(a)) for c, (n, a) in s.items()})

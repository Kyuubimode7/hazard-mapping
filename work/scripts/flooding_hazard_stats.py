"""MCGM flooding spots (344_Flooding_Spots) against the at-risk area (seaward of the hazard line).

Needs data/derived/taluk_hazard_faces.geojson. Writes data/derived/flooding_hazard_stats.json for the viewer's
stats panel: totals plus rows by spot type (TYPE: 1 chronic, 2 flooding spot) and by ward.
A spot counts as in hazard if it touches the at-risk area. Areas are in UTM 43N (EPSG:32643).
"""
import json
from pathlib import Path

import shapely
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[2]
SPOTS = ROOT / "data/mcgm_gis_hazard_vectors/mcgm_gis_hazard_vectors/344_Flooding_Spots.geojson"
DER = ROOT / "data/derived"
TYPES = {1: "Chronic flooding spot", 2: "Flooding spot"}

to_utm = Transformer.from_crs(4326, 32643, always_xy=True).transform


def ha(g):
    return transform(to_utm, g).area / 1e4


faces = json.load(open(DER / "taluk_hazard_faces.geojson", encoding="utf-8"))["features"]
risk = unary_union([shapely.make_valid(shape(f["geometry"])) for f in faces if f["properties"]["at_risk"]])
shapely.prepare(risk)


def row(key):
    return {"type": key, "count": 0, "total_count": 0, "area_ha": 0.0, "total_area_ha": 0.0, "population": 0}


by_type, by_ward = {}, {}
for f in json.load(open(SPOTS, encoding="utf-8"))["features"]:
    if not f["geometry"]:
        continue
    p = f["properties"]
    g = shapely.make_valid(shape(f["geometry"]))
    a = ha(g)
    hit = shapely.intersects(risk, g)
    a_in = ha(g.intersection(risk)) if hit else 0.0
    for table, key in ((by_type, TYPES.get(p["TYPE"], "Other")), (by_ward, p["WARD"] or "Unknown")):
        d = table.setdefault(key, row(key))
        d["total_count"] += 1
        d["total_area_ha"] += a
        if hit:
            d["count"] += 1
            d["area_ha"] += a_in
            d["population"] += p["AFFECT_POPULATION"] or 0


def finish(table):
    for d in table.values():
        d["area_ha"], d["total_area_ha"] = round(d["area_ha"], 2), round(d["total_area_ha"], 2)
    return sorted((d for d in table.values() if d["count"]), key=lambda d: -d["count"])


types = list(by_type.values())
stats = {
    "count": sum(d["count"] for d in types),
    "total_count": sum(d["total_count"] for d in types),
    "area_ha": round(sum(d["area_ha"] for d in types), 2),
    "total_area_ha": round(sum(d["total_area_ha"] for d in types), 2),
    "population": sum(d["population"] for d in types),
    "by_type": finish(by_type),
    "by_ward": finish(by_ward),
}
json.dump(stats, open(DER / "flooding_hazard_stats.json", "w"), indent=1)
print(f"{stats['count']} of {stats['total_count']} flooding spots touch the at-risk area")

"""Split MCGM DP 2034 land-use layers by the at-risk (seaward of hazard line) area.

Needs data/derived/taluk_hazard_faces.geojson from hazard_parcels.py. Writes to data/derived/:
  mcgm_dp_hazard/<layer>_in.geojson / <layer>_out.geojson  parts inside / outside the at-risk area,
      each with part_area_ha and hazard_pct (share of the original feature in hazard)
  taluk_hazard_faces.geojson  rewritten with reservation props per face (res_count, res_area_ha,
      res_pct = % of the face covered by reservations, res_breakdown)
  mcgm_{reservations,designations}_hazard_stats.json  totals and per-type figures for the viewer's stats panel
Areas are in UTM 43N (EPSG:32643).
"""
import json
from pathlib import Path

import shapely
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[2]
DP = ROOT / "data/mcgm_dp2034_vectors/mcgm_dp2034_vectors"
DER = ROOT / "data/derived"
OUT = DER / "mcgm_dp_hazard"
LAYERS = ["00_REVISED_PLU_ZONES", "46_PLU_RESERVATION", "47_PLU_DESIGNATION"]
RES = "46_PLU_RESERVATION"
# Layers with stats: file -> (stats name, type field, code field, green-belt code).
# Green belts are left out of every figure; they stay in the split layers.
STATS = {
    RES: ("reservations", "FINAL_RES_MAINTYPE", "FINAL_RES_CODE", "ROS2.7"),
    "47_PLU_DESIGNATION": ("designations", "FINAL_DES_MAINTYPE", "FINAL_DES_CODE", "EOS2.7"),
}


def excluded(name, props):
    _, _, code, gb = STATS[name]
    return str(props.get(code) or "").replace(" ", "").startswith(gb)


def type_of(name, props):
    return str(props.get(STATS[name][1]) or "").strip() or "Other"

DROP = ("SHAPE", "CREATED", "LAST_EDITED")

to_utm = Transformer.from_crs(4326, 32643, always_xy=True).transform


def ha(g):
    return transform(to_utm, g).area / 1e4


def polys(g):
    """Keep only the polygonal part of an intersection/difference result."""
    if g.is_empty:
        return None
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    parts = [p for p in getattr(g, "geoms", []) if p.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(parts) if parts else None


faces_fc = json.load(open(DER / "taluk_hazard_faces.geojson", encoding="utf-8"))
faces = [(f, shapely.make_valid(shape(f["geometry"]))) for f in faces_fc["features"]]
risk = unary_union([g for f, g in faces if f["properties"]["at_risk"]])
shapely.prepare(risk)

OUT.mkdir(parents=True, exist_ok=True)
parts_in = {name: [] for name in STATS}  # (type, geometry inside hazard, feature props, feature ha)
for name in LAYERS:
    feats = json.load(open(DP / f"{name}.geojson", encoding="utf-8"))["features"]
    inside, outside = [], []
    for f in feats:
        if not f["geometry"]:
            continue
        g = shapely.make_valid(shape(f["geometry"]))
        props = {k: v for k, v in f["properties"].items() if not k.startswith(DROP)}
        total = ha(g)
        if shapely.contains(risk, g):
            gi, go = g, None
        elif not shapely.intersects(risk, g):
            gi, go = None, g
        else:
            gi, go = polys(g.intersection(risk)), polys(g.difference(risk))
        for part, bucket in ((gi, inside), (go, outside)):
            if part is None:
                continue
            a = ha(part)
            if a < 1e-4:  # < 1 m² slivers from boundary noise
                continue
            pct = round(100 * a / total, 1) if total else 0
            bucket.append({"type": "Feature", "geometry": mapping(part),
                           "properties": {**props, "part_area_ha": round(a, 3), "hazard_pct": pct if bucket is inside else round(100 - pct, 1)}})
        if name in STATS and gi is not None and ha(gi) >= 1e-4 and not excluded(name, props):
            parts_in[name].append((type_of(name, props), gi, props, total))
    for suffix, fs in (("in", inside), ("out", outside)):
        json.dump({"type": "FeatureCollection", "features": fs}, open(OUT / f"{name}_{suffix}.geojson", "w"))
    print(f"{name}: {len(inside)} parts in hazard, {len(outside)} outside")

# Per-face reservation figures.
res_parts = parts_in[RES]
tree = shapely.STRtree([r[1] for r in res_parts])
for f, g in faces:
    p = f["properties"]
    hits = [res_parts[i] for i in tree.query(g, predicate="intersects")] if p["at_risk"] else []
    by_type, n = {}, 0
    for t, rg, _, _ in hits:
        part = polys(rg.intersection(g))
        if part is None:
            continue
        a = ha(part)
        if a < 1e-4:
            continue
        by_type[t] = by_type.get(t, 0) + a
        n += 1
    face_ha = ha(g)
    area = sum(by_type.values())
    p.update(res_count=n, res_area_ha=round(area, 2), res_pct=round(100 * area / face_ha, 2) if face_ha else 0,
             res_breakdown="; ".join(f"{t} {a:.2f} ha" for t, a in sorted(by_type.items(), key=lambda x: -x[1])))
json.dump(faces_fc, open(DER / "taluk_hazard_faces.geojson", "w"))

# Stats for the panels.
for name, (label, _, _, gb) in STATS.items():
    tot_by_type = {}
    for f in json.load(open(DP / f"{name}.geojson", encoding="utf-8"))["features"]:
        if f["geometry"] and not excluded(name, f["properties"]):
            t = type_of(name, f["properties"])
            a = ha(shapely.make_valid(shape(f["geometry"])))
            c, s_ = tot_by_type.get(t, (0, 0))
            tot_by_type[t] = (c + 1, s_ + a)
    by_type = {}
    for t, g, _, total in parts_in[name]:
        d = by_type.setdefault(t, {"type": t, "count": 0, "fully_in": 0, "area_ha": 0.0})
        d["count"] += 1
        a = ha(g)
        d["area_ha"] += a
        d["fully_in"] += a >= 0.99 * total
    for t, d in by_type.items():
        c, s_ = tot_by_type[t]
        d.update(area_ha=round(d["area_ha"], 2), total_count=c, total_area_ha=round(s_, 2),
                 pct_area=round(100 * d["area_ha"] / s_, 1) if s_ else 0)
    stats = {
        "count": len(parts_in[name]),
        "fully_in": sum(d["fully_in"] for d in by_type.values()),
        "area_ha": round(sum(d["area_ha"] for d in by_type.values()), 2),
        "total_count": sum(c for c, _ in tot_by_type.values()),
        "total_area_ha": round(sum(v for _, v in tot_by_type.values()), 2),
        "excluded": gb + " Green Belt",
        "by_type": sorted(by_type.values(), key=lambda d: -d["area_ha"]),
    }
    json.dump(stats, open(DER / f"mcgm_{label}_hazard_stats.json", "w"), indent=1)
    print(f"{label} in hazard: {stats['count']} of {stats['total_count']}, "
          f"{stats['area_ha']} of {stats['total_area_ha']} ha")

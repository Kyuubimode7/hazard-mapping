"""Compare CRZ zones between the 2011 (NCSCM) and CZMP 2019 maps.

Both years are clipped to the bounding box of the CZMP 2019 taluks (the area the hazard analysis uses).
Writes to data/derived/crz_compare/:
  <zone>.geojson  one feature per change class: both (in both years), only_2019, only_2011, with area_ha
  zone_compare_stats.json  area per zone per year and the overlap, for the viewer's comparison card
Zones without a counterpart in the other year (CRZ IB, CRZ IIIA in 2019; 200-500 m from HTL in 2011)
get a row with one year's area only and no change layer.
Areas are in UTM 43N (EPSG:32643).
"""
import json
from pathlib import Path

import shapely
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[2]
C19 = ROOT / "data/czmp_2019_vectors/czmp_2019_vectors"
C11 = ROOT / "data/CRZ_Notification_2011/vectors_NCSCM"
OUT = ROOT / "data/derived/crz_compare"

# id, label, 2019 file, 2011 file
ZONES = [
    ("crz1a", "CRZ IA", "25_CRZ_IA", "31_zone_CRZ_IA"),
    ("mbuf", "50m Mangrove Buffer · CRZ IA", "26_50m_Mangrove_Buffer_Zone_CRZ_IA", "32_zone_CRZ_IA_mangrove_buffer_50m"),
    ("crz1b", "CRZ IB", "27_CRZ_IB", None),
    ("crz2", "CRZ II", "28_CRZ_II", "34_zone_CRZ_II"),
    ("ndz", "No Development Zone", "29_No_Development_Zone", "35_zone_NDZ"),
    ("crz3a", "CRZ IIIA (50–500m from HTL)", "30_50m_to_500m_from_HTL_CRZ_IIIA", None),
    ("z200500", "200–500m from HTL", None, "36_zone_200_500m_from_HTL"),
    ("crz4b", "CRZ IVB", "32_CRZ_IVB", "38_zone_CRZ_IVB"),
    ("crz4a", "CRZ IVA", "33_CRZ_IVA_Upto_12_NM", "37_zone_CRZ_IVA"),
]

to_utm = Transformer.from_crs(4326, 32643, always_xy=True).transform


def ha(g):
    return transform(to_utm, g).area / 1e4 if not g.is_empty else 0.0


def polys(g):
    if g.is_empty or g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    parts = [p for p in getattr(g, "geoms", []) if p.geom_type in ("Polygon", "MultiPolygon")]
    return shapely.union_all(parts) if parts else shapely.Polygon()


taluks = json.load(open(C19 / "04_Taluk_Boundary.geojson", encoding="utf-8"))["features"]
box = shapely.box(*shapely.union_all([shape(f["geometry"]) for f in taluks]).buffer(0.01).bounds)


def zone(folder, name):
    if name is None:
        return None
    feats = json.load(open(folder / f"{name}.geojson", encoding="utf-8"))["features"]
    gs = [shapely.make_valid(shape(f["geometry"])) for f in feats if f["geometry"]]
    return polys(shapely.clip_by_rect(polys(shapely.union_all(gs)), *box.bounds))


OUT.mkdir(parents=True, exist_ok=True)
rows = []
for zid, label, f19, f11 in ZONES:
    a, b = zone(C19, f19), zone(C11, f11)
    row = {"id": zid, "zone": label,
           "area_2019_ha": round(ha(a), 1) if a is not None else None,
           "area_2011_ha": round(ha(b), 1) if b is not None else None}
    if a is not None and b is not None:
        parts = {"both": polys(a.intersection(b)), "only_2019": polys(a.difference(b)), "only_2011": polys(b.difference(a))}
        areas = {k: ha(g) for k, g in parts.items()}
        row.update({f"{k}_ha": round(v, 1) for k, v in areas.items()})
        feats = [{"type": "Feature", "geometry": mapping(g),
                  "properties": {"zone": label, "change": k, "area_ha": round(areas[k], 1)}}
                 for k, g in parts.items() if not g.is_empty]
        json.dump({"type": "FeatureCollection", "features": feats}, open(OUT / f"{zid}.geojson", "w"))
    rows.append(row)
    print(row)

json.dump({"extent": "Bounding box of the CZMP 2019 taluks", "zones": rows},
          open(OUT / "zone_compare_stats.json", "w"), indent=1)

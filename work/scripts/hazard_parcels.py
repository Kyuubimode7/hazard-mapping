"""Split CZMP taluk polygons by the hazard line; flag the seaward faces as at risk.

Usage: hazard_parcels.py [2019|2011]. 2011 uses the CRZ Notification 2011 (NCSCM) hazard line and HTL
with the same CZMP 2019 taluks, so the two years compare like for like.
Output: data/derived[/crz2011]/taluk_hazard_faces.geojson (EPSG:4326), props taluk, district, at_risk, area_ha.
"""
import json
import sys
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import shape, mapping
import shapely.ops
from shapely.ops import polygonize, unary_union

ROOT = Path(__file__).resolve().parents[2]
YEAR = sys.argv[1] if len(sys.argv) > 1 else "2019"
SRC = ROOT / "data/czmp_2019_vectors/czmp_2019_vectors"
CRZ11 = ROOT / "data/CRZ_Notification_2011/vectors_NCSCM"
# Hazard line and HTL files per year.
LINES = {"2019": (SRC, "20_Hazard_Line.geojson", "18_High_Tide_Line.geojson"),
         "2011": (CRZ11, "27_line_hazard.geojson", "25_line_HTL.geojson")}[YEAR]
OUT = ROOT / "data/derived" / ("" if YEAR == "2019" else "crz" + YEAR)  # served to the web viewer at /data/derived/
M2HA = 1e-4


def load(name, src=SRC):
    return json.load(open(src / name, encoding="utf-8"))["features"]


def area_ha(g):  # local equirectangular approximation at ~19 degN
    lat = g.centroid.y
    k = 111320.0
    return g.area * k * k * np.cos(np.radians(lat)) * M2HA


taluks = [(f["properties"], shapely.make_valid(shape(f["geometry"]))) for f in load("04_Taluk_Boundary.geojson")]
land = unary_union([g for _, g in taluks])
box = shapely.box(*land.buffer(0.01).bounds)  # the hazard line runs far north; clip it to the taluks


def lines(name):
    return unary_union([shapely.clip_by_rect(shape(f["geometry"]), *box.bounds) for f in load(name, LINES[0])])


hazard = lines(LINES[1])


def close_gaps(net, edge, tol=0.01):
    """Bridge each dangling end inside the land to the nearest hazard/taluk line within tol (~1 km).

    The CZMP hazard line has tiny breaks (e.g. two ends 1e-7 deg apart near 72.93E 19.30N) and stops
    tens to hundreds of metres short of taluk edges; any break lets the seaward flood leak inland.
    """
    merged = shapely.line_merge(net)
    ends = {}
    for ln in getattr(merged, "geoms", [merged]):
        if not ln.is_closed:
            for c in (ln.coords[0], ln.coords[-1]):
                k = (round(c[0], 6), round(c[1], 6)); ends[k] = ends.get(k, 0) + 1
    bridges = []
    for (x, y), n in ends.items():
        pt = shapely.Point(x, y)
        if n > 1 or not land.buffer(1e-4).contains(pt):
            continue
        others = unary_union([edge, net.difference(pt.buffer(5e-4))])  # skip the stub the end sits on
        q = shapely.ops.nearest_points(pt, others)[1]
        if pt.distance(q) < tol:
            bridges.append(shapely.LineString([pt, q]))
    print(f"bridged {len(bridges)} dangling hazard-line ends")
    return unary_union([net] + bridges)


hazard = close_gaps(hazard, land.boundary)
htl = lines(LINES[2])

# Node taluk boundaries with the hazard line and build every enclosed face.
edges = unary_union([land.boundary, hazard] + [g.boundary for _, g in taluks])
faces = [p for p in polygonize(edges) if land.contains(p.representative_point())]

# Seaward faces. Along each face's hazard-line edges, step ~20 m from the line toward the nearest
# HTL point: if that lands inside the face, the face is on the sea side there. Faces vote over all
# such samples. Faces without hazard edges (split only by taluk borders) inherit from neighbours.
STEP = 2e-4
hz = hazard.buffer(1e-7)
htl_tree = shapely.STRtree(list(getattr(htl, "geoms", [htl])))
htl_parts = htl_tree.geometries
vote = {}
for i, f in enumerate(faces):
    edge = f.boundary.intersection(hz)
    if edge.length == 0:
        continue
    n = max(5, min(200, int(edge.length / 5e-4)))
    pts = [edge.interpolate(t, normalized=True) for t in np.linspace(0, 1, n)]
    near = htl_tree.nearest(pts)
    sea = 0
    for pt, k in zip(pts, near):
        q = shapely.ops.nearest_points(pt, htl_parts[k])[1]
        d = pt.distance(q)
        if d == 0:
            continue
        t = min(STEP, d / 2) / d
        sea += f.contains(shapely.Point(pt.x + (q.x - pt.x) * t, pt.y + (q.y - pt.y) * t))
    vote[i] = sea / n
risk = {i for i, v in vote.items() if v > 0.5}
idx = shapely.STRtree(faces)
pending = [i for i in range(len(faces)) if i not in vote]
for _ in range(5):
    for i in pending:
        nb = [j for j in idx.query(faces[i]) if j in vote and faces[i].touches(faces[j])]
        if nb:
            vote[i] = 1.0 if all(j in risk for j in nb) else 0.0
            if vote[i]:
                risk.add(i)
    pending = [i for i in pending if i not in vote]

out = []
for i, f in enumerate(faces):
    props = next((p for p, g in taluks if g.contains(f.representative_point())), {})
    out.append({"type": "Feature", "geometry": mapping(f), "properties": {
        "taluk": props.get("Taluk"), "district": props.get("District"),
        "at_risk": i in risk, "sea_vote": round(vote.get(i, -1), 2), "area_ha": round(area_ha(f), 2)}})

OUT.mkdir(parents=True, exist_ok=True)
json.dump({"type": "FeatureCollection", "features": out},
          open(OUT / "taluk_hazard_faces.geojson", "w"))
summary = {}
for f in out:
    p = f["properties"]; s = summary.setdefault(p["taluk"], [0, 0])
    s[0 if p["at_risk"] else 1] += p["area_ha"]
print(f"{len(faces)} faces, {len(risk)} at risk")
for t, (r, s) in summary.items():
    print(f"{t:14s} at risk {r:9.0f} ha   safe {s:9.0f} ha   {100*r/(r+s):5.1f}%")

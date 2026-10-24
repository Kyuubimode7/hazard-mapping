"""Draw the Nerul land-use polygons as vector paths into a PDF (no scan), same page size as the source sheet.

Usage: python nerul_vector_pdf.py [scale]   (must match a nerul_polygonise.py run)
"""
import json
import sys
from pathlib import Path

import pymupdf
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[2]
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
OUT = ROOT / "work" / "nerul" / ("half" if SCALE == 0.5 else f"s{SCALE:g}")

PT = 72 / 200  # source is 200 dpi: 1 source px = 0.36 pt, so the page matches the original sheet
PAGE_W, PAGE_H = 8400 * PT, 12760 * PT

classes = json.loads((OUT / "labels_stats.json").read_text())["classes"]
area = json.loads((OUT / "labels_stats.json").read_text())["area_ha"]
rgb = {c["name"]: tuple(v / 255 for v in c["rgb"]) for c in classes.values()}
fc = json.loads((OUT / "landuse_px.geojson").read_text())

doc = pymupdf.open()
page = doc.new_page(width=PAGE_W, height=PAGE_H)


def pts(ring):
    return [pymupdf.Point(x * PT, -y * PT) for x, y in ring.coords]


# draw white first so coloured polygons sit on top of its outlines
order = sorted(fc["features"], key=lambda f: f["properties"]["class"] != "white")
for f in order:
    g = shape(f["geometry"])
    name = f["properties"]["class"]
    sh = page.new_shape()
    for ring in [g.exterior, *g.interiors]:
        sh.draw_polyline(pts(ring) + [pts(ring)[0]])
    white = name == "white"
    sh.finish(fill=rgb[name], color=(0.75, 0.75, 0.75) if white else (0.25, 0.25, 0.25),
              width=0.3 if white else 0.5, even_odd=True, closePath=True)
    sh.commit()

# legend in the empty right-hand panel (the map was cropped at x = 7000 source px)
x0, y0, sw = 7150 * PT, 3000 * PT, 60
page.insert_text((x0, y0 - 40), "NERUL NODE — LAND USE", fontsize=28, fontname="hebo")
page.insert_text((x0, y0 - 10), "Vectorised from draft DP 2034 sheet (half-size pass). Not georeferenced.",
                 fontsize=11)
y = y0 + 20
for c in sorted(classes.values(), key=lambda c: -area[c["name"]]):
    n = c["name"]
    r = pymupdf.Rect(x0, y, x0 + sw, y + 30)
    page.draw_rect(r, color=(0.25, 0.25, 0.25), fill=rgb[n], width=0.8)
    label = n.replace("_", " ").replace("pg ", "P.G. & ").capitalize()
    if n == "white":
        label = "White (roads, mangroves, NDZ)"
    page.insert_text((x0 + sw + 15, y + 21), f"{label}   {area[n]:,.0f} ha", fontsize=15)
    y += 45
page.insert_text((x0, y + 20), "Areas nominal (printed 1:4000 at 200 dpi).", fontsize=11)

out = OUT / "nerul_landuse_vectors.pdf"
doc.save(out, deflate=True, garbage=3)
print(out, f"{out.stat().st_size / 1e6:.1f} MB", len(order), "polygons")

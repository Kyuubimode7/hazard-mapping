# snigdha-mapping-crz

Mapping Coastal Regulation Zone (CRZ) rules against development-plan land use for Mumbai and Navi Mumbai.

## Layout

- `data/` — downloaded vector data (GeoJSON, EPSG:4326) plus source PDFs. Each `*_vectors/` folder nests a same-named
  subfolder and has a `README.md`, `_manifest.csv` (feature counts, files) and `_service_layers.json` (the source
  service's layer metadata, including coded-value domains).
  - `czmp_2019_vectors/` — Maharashtra CZMP 2019 (NCSCM): HTL/LTL, hazard line, CRZ zones, municipal/village/taluk
    boundaries. Layers 31 (CRZ IIIB) and 34 (CVCA) are empty.
  - `mcgm_dp2034_vectors/` — MCGM Development Plan 2034, 216 layers. Land use: 00 PLU zones (`ZONE_CODE2`),
    46 reservations (`FINAL_RES_MAINTYPE`, proposed public uses, R… codes), 47 designations (`FINAL_DES_MAINTYPE`,
    existing public uses, E… codes).
  - `jnpa_vectors/` — JNPA Land Use Plan 2022 (Uran): proposed/existing land use, PLU zones, nodes/sectors. JNPA
    nodes are JNPA's own, not CIDCO's Navi Mumbai nodes.
  - `midc_vectors/` — MIDC industrial plots; `MIDC_LAND_USE` is numeric, names are in `_service_layers.json`.
  - `mcgm_gis_hazard_vectors/` — MCGM hazard/utility layers (not yet used).
  - `nmmc_dp/nmmc_draft_dp_2018_report.pdf`, `NMMC DP/NERUL_NODE_DP 2034.pdf` — Navi Mumbai sources. **No NMMC
    vector data exists**; NMMC must be digitised.
- `web/` — Vite + React + TypeScript + react-leaflet viewer. Run with `npm --prefix web run dev` (port 5173;
  `.claude/launch.json` has the same config). The dev server serves `../data` at `/data` via a plugin in
  `web/vite.config.ts`, so data is never copied into the app.
  - `web/src/layers.ts` — the whole layer tree: groups → sections → layers, with `classify` (sublayers by attribute),
    `weight`/`dash` (line hierarchy), `hatch` (reservations), `outline` (boundaries). Edit here to add layers.
  - Groups: Boundaries, CRZ · CZMP 2019, Development Plans (MCGM DP 2034, SPA & TPS, JNPA, MIDC). Each group draws in
    its own Leaflet pane with its own opacity slider; basemap is Esri World Imagery with its own slider.
- `qgis/snigdha work file.qgz` — QGIS project. QGIS 3.44 is driven through the QGIS MCP plugin (the plugin's server
  must be started inside QGIS for the MCP tools to connect).

## Working conventions

- Stay inside this project directory; ask before touching anything outside it.
- Don't verify small UI/styling changes in the browser — a type-check (`npx tsc -b` in `web/`) is enough.
- Ask before running arbitrary PyQGIS code in QGIS; plugin tools like add-layer are fine.

## Environment gotchas

- `CURL_CA_BUNDLE` used to point at a missing PostgreSQL cert and broke pip. It was removed from the system
  environment on 2026-10-24; sessions started before that still carry it (`env -u CURL_CA_BUNDLE …` works around it).
- Use the default `python` (3.14, user site-packages). It already has pymupdf, scikit-image, numpy, scipy, pillow,
  and opencv-python-headless 5.0 (added 2026-10-24). scikit-learn is still missing; install it only when step 3.3
  needs it, with `--only-binary :all:` (3.14 lacks wheels for some packages and pip then silently compiles).
- Downloads from files.pythonhosted.org stall partway (pip and browser alike, ~1–2 MB in), so the 3.13 `.venv/`
  install never finished. `.venv/` is a 3.13 venv with nothing useful installed; ignore or delete it. Pip's cache
  already holds the pymupdf and opencv wheels.
- The user's terminal is PowerShell: give `Remove-Item Env:CURL_CA_BUNDLE` etc., not `env -u`.
- No GDAL/ogr on the PATH; QGIS's bundled Python has GDAL.
- `czmp_2019_vectors/23_CRZ_Boundary.geojson` failed to load in QGIS ("Layer is not valid") but loads fine in the web
  app; cause not investigated.

## Next steps

1. ~~Rebuild the Python env~~ — dropped; using system Python 3.14 (see Environment gotchas).
2. ~~Inspect the Nerul DP sheet~~ — done 2026-10-24. `work/scripts/nerul_extract.py` pulls the embedded JPEG
   byte-for-byte to `work/nerul/source.jpeg` (8400 × 12760, the PDF has no other content) plus `preview_4/8.png`.
   Legend crops: `legend.png`, `legend_landuse.png`, `legend_boundary_transport.png`; swatch RGBs in `legend.json`.
   Findings that change step 3:
   - Plot edges are mostly **thin red/orange lines and white road bands**, not black. Sector boundaries are thick dark
     blue and node boundaries crimson. Edge detection must use these colours plus white roads, not only black.
   - The red circles ("N-63", "N-83" …) are reservation stamps with an abbreviation beside them (M, P, LIB, U.H.P.,
     P.G.; see the sheet's abbreviation table). Small reservations are tiny coloured patches next to the stamp
     (e.g. a blue market). Keep the stamp centres plus OCR'd ID and abbreviation as a point layer.
   - Gaothans are residential yellow overdrawn with orange building footprints and an orange dash-dot boundary. Treat
     the orange as linework or noise, not public utility (the utility swatch is #e09d61).
   - Patterned classes: forest = orange hexagon hatch on cream; wholesale = commercial blue with red diagonals. Commercial
     (#66a8e5) vs wholesale and public/semi-public (#fd8371) vs utility (#e09d61) are the likely confusion pairs.
   - Black text (plot numbers, sector numbers, labels) is dense everywhere; mask it before region voting.
3. **Vectorise in pixel space, then georeference** (agreed order — avoids resampling colours and keeps the transform
   re-runnable):
   1. Mask black linework/text and the red stamps (keep stamp positions for OCR → IDs).
      **Half-size pass done 2026-10-24**: `work/scripts/nerul_masks.py [scale]` → `work/nerul/half/`
      (`mask_{dark,blue,red,orange,crimson,other_ink}.png`, `background.png`, `overlay.png`, `stamps.json` in
      full-res pixel coords, `check_*.png` side-by-sides). Method: ink = Lab distance > 22 from a 15 px median
      background (half-size), minus near-white road pixels, plus red pixels whose saturation jumps > 35 above the
      background (red ink on the salmon public fill fails the Lab test). Ink is about 8.5 % of the map. Ink is then
      sorted by hue into dark text, blue sector lines, red, orange (gaothan) and crimson (node boundary); red vs
      orange is only a hint. Plot boundaries are thin olive/grey and land in `other_ink`, which is fine because
      all ink is masked. Stamps: Hough circles on the red+orange mask, ring ≥ 50 % red, ≤ 25 % red at 1.5 r.
      275 candidates, roughly 30–50 false (NMMC dashed boundary, red road edges, gaothans, Karave island).
      Confirm each by reading its ID before use.
   2. Use the black lines as edges: connected regions between lines, each labelled by majority vote against legend
      colours (Lab distance). Handle hatches by blurring at the hatch period or matching a colour mix per region.
      **Half-size pass done 2026-10-24**: `work/scripts/nerul_regions.py [scale]` → `labels.png` (class ids),
      `labels_colour.png`, `labels_stats.json`, `labels_vs_sheet.png`, `lab_*.png` close-ups. Each background pixel
      takes its nearest class (Lab, ≤ 28). Non-ink regions (4-connected, ink dilated 1 px) take their majority class
      when ≥ 75 % agree, about 7.4k of 8.6k regions. Ink and unclassified pixels are filled from the nearest label,
      then same-class specks < 120 px (half-size) are merged into their surroundings. Palette RGBs are sampled from the
      sheet, not the legend. Classes: residential, commercial, industrial, public_semipublic, public_utility,
      pg_recreational, water_creek, transportation, gaothan (#f5c653, the dense core only), white. Nominal areas
      (0.508 m/px from the printed 1:4000) are residential ~376 ha, open space/recreation ~146, public/semi-public ~114,
      water ~503, white ~1022. Known gaps:
      - Mangroves, no-development zone, roads and paper are all "white". The mangrove belt (white with green ticks)
        needs a tick-density detector.
      - The forest class was dropped (its cream matched every road-edge blend) and no hex hatch has been seen on this
        sheet. Wholesale (blue + red diagonals) currently lands as commercial.
      - Tiny reservation patches (markets etc.) survive but are rounded by the 15 px median, and plot lines are gone
        (only land use is kept). Thin grey slivers remain along some dark lines.
   3. If two legend colours keep getting confused, add a scribble-trained random-forest pixel classifier for those
      classes only. SAM / U-Net judged unnecessary for one sheet.
   4. Fill masked pixels from neighbouring regions, polygonise, simplify.
      **Half-size pass done 2026-10-24**: `work/scripts/nerul_polygonise.py [scale]` →
      `work/nerul/half/landuse_px.geojson` (1,878 polygons, ~91k vertices; props `class_id`, `class`,
      `area_ha_nominal`), plus `poly_overlay.png` and `poly_*.png` close-ups. Coords are **full-res source pixels as
      (x, −line)**, the Georeferencer `.points` convention, with no CRS. The pipeline is rasterio `shapes` →
      `shapely.segmentize` to one pixel (rasterio drops collinear vertices, which makes `coverage_is_valid` fail) →
      `coverage_simplify` at 4 source px (~2 m), so neighbours keep identical shared edges. The script asserts the
      coverage is valid before and after. There are no gaps or overlaps. Rough spots: edges wobble slightly along
      straight lines, gaothans (esp. sector 36) break into many small polygons, and 654 of the polygons are
      transportation slivers. The white class (roads, mangroves, no-development zone, paper) is included as-is.
      Order for the full run: `nerul_masks.py 1` → `nerul_regions.py 1` → `nerul_polygonise.py 1`.
      `nerul_vector_pdf.py [scale]` → `nerul_landuse_vectors.pdf`: polygons only as vector paths, page size of the
      source sheet, with a legend. The user reviewed it on 2026-10-24 ("pretty good") and **has feedback still to
      give; ask for it before changing the pipeline**. Visible issues: speck trails along the dashed NMMC/node
      boundaries, mangroves blank white, blobby gaothans. `landuse_px.qml` (QGIS style by class) sits next to the
      GeoJSON.
   5. Pick 10+ well-spread GCPs on the raster in QGIS Georeferencer (NMMC boundary, railway, creeks, junctions), save
      the `.points` file, and apply it to the vectors (`ogr2ogr -gcp … -tps`, or a 2nd-order polynomial).
   6. Snap to existing roads/boundaries; map classes to land-use names consistent with the MCGM zone codes.
   - Work at full resolution for the final run; a half-size copy is fine for tuning.
4. Repeat for the other NMMC nodes, then add an "NMMC" section to the Development Plans group in `web/src/layers.ts`.
5. Open items from earlier: MIDC popups show numeric land-use codes (map them to names); verify "NA" in MCGM PLU zones
   means Natural Areas against the DP legend; CZMP's 7 "Nodal Town of Navi Mumbai" polygons are unnamed slivers plus
   one 83 km² Uran polygon — not usable as node boundaries.

"""Step 3.2: label the regions between the ink by legend colour.

Each pixel of the ink-free background (from nerul_masks.py) gets its nearest palette class in Lab. Connected
non-ink regions then vote: a region whose pixels mostly agree takes the majority class outright, otherwise it
keeps the per-pixel classes (a colour change with no line drawn between). Ink and unclassified pixels take the
label of the nearest labelled pixel.

Usage: python nerul_regions.py [scale]   (must match a nerul_masks.py run)
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
NERUL = ROOT / "work" / "nerul"
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
OUT = NERUL / ("half" if SCALE == 0.5 else f"s{SCALE:g}")

MAX_DE = 28.0  # beyond this from every class, a pixel stays unclassified
VOTE_SHARE = 0.75  # majority needed for a region to take one class

# RGB sampled from the sheet's median background (legend swatches print slightly differently)
CLASSES = [
    (1, "residential", (251, 242, 123)),
    (2, "commercial", (101, 164, 225)),
    (3, "industrial", (138, 111, 179)),
    (4, "public_semipublic", (246, 118, 115)),
    (5, "public_utility", (225, 141, 86)),
    (6, "pg_recreational", (71, 165, 108)),
    (7, "water_creek", (118, 210, 218)),
    (8, "transportation", (180, 173, 180)),
    (9, "gaothan", (245, 198, 83)),
    (10, "white", (254, 254, 252)),  # roads, no-development zone, mangroves, paper
    # no flat "forest" class: its cream swatch matches the white/yellow blend at every road edge, and the
    # forest hex hatch hasn't been seen on this sheet; it would need a pattern detector
]
ids = np.array([c[0] for c in CLASSES], np.uint8)


def to_lab(rgb_or_bgr_img):
    lab = cv2.cvtColor(rgb_or_bgr_img, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab[..., 0] *= 100 / 255
    return lab


bg = cv2.imread(str(OUT / "background.png"))
lab = to_lab(bg)
pal = to_lab(np.array([[c[2][::-1] for c in CLASSES]], np.uint8))[0]

# nearest class per pixel, chunked to keep memory down
cls = np.zeros(bg.shape[:2], np.uint8)
for y in range(0, lab.shape[0], 512):
    d = np.linalg.norm(lab[y:y + 512, :, None, :] - pal[None, None], axis=3)
    k = d.argmin(2)
    cls[y:y + 512] = np.where(d.min(2) <= MAX_DE, ids[k], 0)

ink = np.zeros(bg.shape[:2], bool)
for p in OUT.glob("mask_*.png"):
    ink |= cv2.imread(str(p), cv2.IMREAD_GRAYSCALE) > 0
# thicken by 1 px so hairline gaps in scanned lines don't merge neighbouring plots
ink_sep = cv2.dilate(ink.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0

n, comp = cv2.connectedComponents((~ink_sep).astype(np.uint8), connectivity=4)
# per-component class histogram in one pass
hist = np.zeros((n, len(CLASSES) + 1), np.int64)
np.add.at(hist, (comp.ravel(), cls.ravel()), 1)
hist[0] = 0  # component 0 is the ink
known = hist[:, 1:]
total = known.sum(1)
top = known.argmax(1) + 1
share = np.divide(known.max(1), total, out=np.zeros(n), where=total > 0)
voted = (share >= VOTE_SHARE) & (total > 0)

label = cls.copy()
take = voted[comp] & ~ink_sep
label[take] = top[comp][take].astype(np.uint8)
label[ink_sep] = 0

# fill ink and unclassified pixels from the nearest labelled pixel
missing = label == 0
_, (iy, ix) = ndimage.distance_transform_edt(missing, return_indices=True)
label = label[iy, ix]

# specks: halos around text and road edges filled from the wrong side; merge them into their surroundings.
# small enough that the market/utility patches beside reservation stamps (~300 px at half size) survive
MIN_AREA = int(120 * (SCALE / 0.5) ** 2)
speck = np.zeros(label.shape, bool)
for i, _, _ in CLASSES:
    n_i, comp_i, st, _ = cv2.connectedComponentsWithStats((label == i).astype(np.uint8), connectivity=8)
    small = np.zeros(n_i, bool)
    small[1:] = st[1:, cv2.CC_STAT_AREA] < MIN_AREA
    speck |= small[comp_i]
_, (iy, ix) = ndimage.distance_transform_edt(speck, return_indices=True)
label = label[iy, ix]

cv2.imwrite(str(OUT / "labels.png"), label)
lut = np.zeros((256, 3), np.uint8)
for i, _, rgb in CLASSES:
    lut[i] = rgb[::-1]
colour = lut[label]
cv2.imwrite(str(OUT / "labels_colour.png"), colour)

px_m2 = (1 / SCALE * 0.508) ** 2  # nominal: 200 dpi at the printed 1:4000 → 0.508 m per source pixel
stats = {name: round(float((label == i).sum() * px_m2 / 1e4), 1) for i, name, _ in CLASSES}
(OUT / "labels_stats.json").write_text(json.dumps(
    {"classes": {str(i): {"name": name, "rgb": rgb} for i, name, rgb in CLASSES},
     "area_ha": stats, "regions": int(n - 1), "regions_voted": int(voted.sum()),
     "unclassified_before_fill_pct": round(float((cls == 0).mean() * 100), 2)}, indent=1))
print(json.dumps(stats, indent=1))
print(f"regions {n - 1}, voted {voted.sum()}, unclassified before fill {(cls == 0).mean():.2%}")

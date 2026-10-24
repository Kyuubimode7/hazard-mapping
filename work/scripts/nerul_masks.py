"""Step 3.1: ink masks (text, linework, stamps) for the Nerul DP sheet.

Ink = pixels that differ from the local median background. Lines and text are a few px wide, so a median
wider than them recovers the fill underneath; colour then sorts ink into classes. Colour alone can't do it:
red pen lines and the public-utility fill share hue ~10.

Usage: python nerul_masks.py [scale]   (scale 0.5 = half-size tuning copy, 1.0 = final)
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
NERUL = ROOT / "work" / "nerul"
SCALE = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
OUT = NERUL / ("half" if SCALE == 0.5 else f"s{SCALE:g}")
OUT.mkdir(parents=True, exist_ok=True)

MAP_X1 = int(7000 * SCALE)  # legend/title panel starts right of this
BG_KSIZE = int(31 * SCALE) | 1  # median window, wider than any line or text stroke
INK_DE = 22.0  # Lab distance from background that counts as ink

src = cv2.imread(str(NERUL / "source.jpeg"))
img = src if SCALE == 1 else cv2.resize(src, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_AREA)
img = img[:, :MAP_X1]

bg = cv2.medianBlur(img, BG_KSIZE)
lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
lab_bg = cv2.cvtColor(bg, cv2.COLOR_BGR2LAB).astype(np.float32)
# OpenCV 8-bit Lab: L scaled to 0-255, a/b offset by 128; rescale L to 0-100 for a CIE-ish distance
scale = np.array([100 / 255, 1, 1], np.float32)
de = np.linalg.norm((lab - lab_bg) * scale, axis=2)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
H, S, V = (hsv[..., i].astype(np.int16) for i in range(3))
hsv_bg = cv2.cvtColor(bg, cv2.COLOR_BGR2HSV)
S_bg, V_bg = hsv_bg[..., 1].astype(np.int16), hsv_bg[..., 2].astype(np.int16)

# white road bands differ from the fill too, but they are regions, not ink
ink = (de > INK_DE) & ~((S < 45) & (V > 200))
# red ink on the salmon public/semi-public fill is too close in Lab; it shows as a saturation jump instead
ink |= ((H <= 11) | (H >= 165)) & ((S - S_bg) > 35)

blue = ink & (H >= 105) & (H <= 135) & (S > 90) & (V < 200)  # sector boundaries, sector numbers
crimson = ink & (H >= 150) & (H < 165) & (S > 90)  # node boundary
# red pen lines drift to hue ~12 in the scan and overlap the orange gaothan ink, so the split is only a hint
warm = ink & ((H <= 24) | (H >= 165)) & (S > 90) & (V >= 110)
red = warm & ((H <= 11) | (H >= 165))  # pen lines, stamps, proposed roads
orange = warm & ~red  # gaothan footprints/boundary
# black text: much darker than the local fill; thin strokes go grey at half size so no fixed V cutoff
dark = ink & ((V_bg - V) > 55) & ~(blue | crimson | warm)
other = ink & ~(dark | blue | warm | crimson)

masks = {"dark": dark, "blue": blue, "red": red, "orange": orange, "crimson": crimson, "other_ink": other}
for name, m in masks.items():
    cv2.imwrite(str(OUT / f"mask_{name}.png"), m.astype(np.uint8) * 255)
cv2.imwrite(str(OUT / "background.png"), bg)

# Stamps: red circles, ~45 px across at full res
r = int(round(22 * SCALE))
red_u8 = cv2.morphologyEx(warm.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
circles = cv2.HoughCircles(
    cv2.GaussianBlur(red_u8, (5, 5), 1.5), cv2.HOUGH_GRADIENT, dp=1, minDist=2 * r,
    param1=100, param2=14, minRadius=int(r * 0.7), maxRadius=int(r * 1.4),
)
stamps = []
if circles is not None:
    yy, xx = np.mgrid[-r * 2:r * 2 + 1, -r * 2:r * 2 + 1]
    for cx, cy, cr in circles[0]:
        # keep circles whose ring is actually red along most of its circumference
        ang = np.linspace(0, 2 * np.pi, 48, endpoint=False)
        px = np.clip((cx + cr * np.cos(ang)).astype(int), 0, red.shape[1] - 1)
        py = np.clip((cy + cr * np.sin(ang)).astype(int), 0, red.shape[0] - 1)
        ring = cv2.dilate(red_u8, np.ones((3, 3), np.uint8))[py, px] > 0
        # a stamp is an isolated ring; red road edges that happen to curve have red running on outside it
        ox = np.clip((cx + cr * 1.5 * np.cos(ang)).astype(int), 0, red.shape[1] - 1)
        oy = np.clip((cy + cr * 1.5 * np.sin(ang)).astype(int), 0, red.shape[0] - 1)
        outer = red_u8[oy, ox] > 0
        if ring.mean() >= 0.5 and outer.mean() <= 0.25:
            stamps.append({"x": float(cx / SCALE), "y": float(cy / SCALE), "r": float(cr / SCALE),
                           "ring_cover": round(float(ring.mean()), 2), "outer_cover": round(float(outer.mean()), 2)})
(OUT / "stamps.json").write_text(json.dumps(stamps, indent=1))

# Overlay: ink classes painted over a washed-out copy, stamps ringed
colours = {"dark": (0, 0, 0), "blue": (200, 60, 0), "red": (0, 0, 255), "orange": (0, 140, 255),
           "crimson": (130, 0, 200), "other_ink": (0, 200, 0)}
ov = (img * 0.35 + 255 * 0.65).astype(np.uint8)
for name, m in masks.items():
    ov[m] = colours[name]
for s in stamps:
    cv2.circle(ov, (int(s["x"] * SCALE), int(s["y"] * SCALE)), int(s["r"] * SCALE) + 4, (255, 0, 255), 2)
cv2.imwrite(str(OUT / "overlay.png"), ov)

total = img.shape[0] * img.shape[1]
for name, m in masks.items():
    print(f"{name:10s} {m.sum() / total:6.2%}")
print(f"ink total  {ink.sum() / total:6.2%}   stamps {len(stamps)}")

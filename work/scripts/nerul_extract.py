"""Extract the Nerul DP sheet's embedded JPEG losslessly and write a downsized preview."""
from pathlib import Path

import cv2
import pymupdf

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "data" / "NMMC DP" / "NERUL_NODE_DP 2034.pdf"
OUT = ROOT / "work" / "nerul"
OUT.mkdir(parents=True, exist_ok=True)

doc = pymupdf.open(PDF)
xref = doc[0].get_images(full=True)[0][0]
img = doc.extract_image(xref)
src = OUT / f"source.{img['ext']}"
src.write_bytes(img["image"])  # raw DCT stream, no re-encode
print(src, img["width"], img["height"])

full = cv2.imread(str(src))
for scale, name in [(0.125, "preview_8.png"), (0.25, "preview_4.png")]:
    small = cv2.resize(full, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(OUT / name), small)
    print(name, small.shape)

"""The stores' badge illustrations: renders of the real container models, made into clean pixel art.

`?test=inv&icons` renders every container kind's real model (Poly Haven CC0 bodies converted with lowpix) on a
transparent ground and leaves {kind: dataURL} in `window.__icons`; this script shrinks each to 56 x 40 art pixels
(make_items.shrink_render: cropped, fitted, box-filtered, snapped to the palette, outlined) for the HUD badges.
The window materials themselves are painted in the browser by src/ui/crates/mat.ts (clean stylised pixel art from
palette ramps; v6 "hand-drawn is banned": no strokes, no photo noise).

  python3 src/inv/sprites/make_ui.py --icons renders.json   -> public/inv/ui/kind_<kind>.png (UI_CONTACT=sheet.png)
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_items import master_palette, shrink_render  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "public", "inv", "ui")
ICON_W, ICON_H = 56, 40


def icons(path):
    """the badge illustrations from renders of the real models (make_items.shrink_render: cropped, fitted, box-shrunk,
    snapped to the palette, outlined)"""
    import json
    P, cols = master_palette()
    pal = np.array([[(c >> 16) & 255, (c >> 8) & 255, c & 255, 255] for c in cols] + [[0, 0, 0, 0]] * (256 - len(cols)), np.uint8)
    renders = json.load(open(path))
    sheet = []
    for kind, url in renders.items():
        out = pal[shrink_render(url, ICON_W, ICON_H, P)]
        rgba = Image.fromarray(out, "RGBA")
        rgba.save(os.path.join(OUT, f"kind_{kind}.png"))
        sheet.append(rgba)
        print("icon", kind)
    if os.environ.get("UI_CONTACT"):
        sh = Image.new("RGBA", (len(sheet) * (ICON_W * 3 + 8), ICON_H * 3 + 8), (30, 32, 34, 255))
        for i, im in enumerate(sheet):
            sh.alpha_composite(im.resize((ICON_W * 3, ICON_H * 3), Image.NEAREST), (i * (ICON_W * 3 + 8) + 4, 4))
        sh.save(os.environ["UI_CONTACT"])


def main():
    if "--icons" not in sys.argv:
        sys.exit(__doc__)
    os.makedirs(OUT, exist_ok=True)
    icons(sys.argv[sys.argv.index("--icons") + 1])


if __name__ == "__main__":
    main()

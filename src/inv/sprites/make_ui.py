"""Paint the stores' UI materials and container icons with the user's lowpix tool.

Each container window is drawn in its container's own material; these are the material FIELDS (large textured
surfaces painted with lowpix's stroke brush, then snapped to the master palette) that the browser cuts its frames,
cells and controls from, plus a 32 px painted icon of every container kind for the crate HUD badges.

  python3 src/inv/sprites/make_ui.py            -> public/inv/ui/mat_<name>.png, kind_<kind>.png, contact.png
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np

LOWPIX = os.environ.get("LOWPIX", "/home/user/pukkingdragon123/symmetrical-goggles")
sys.path.insert(0, LOWPIX)
from lowpix.sprite_gen import make, blob, catmull, _L  # noqa: E402
from PIL import Image  # noqa: E402

sys.path.insert(0, os.path.dirname(__file__))
from make_items import master_palette, snap  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "public", "inv", "ui")
W, H = 320, 288


def M(base, steps=6, texture=None, rough=0.35, marks=0.6, length=None, **kw):
    m = {"base": base, "steps": steps, "contrast": kw.pop("contrast", 1.0), "strokes": {"rough": rough, "marks": marks}}
    if length:
        m["strokes"]["length"] = length
    if texture:
        m["texture"] = texture
    m.update(kw)
    return m


def rect(x0, y0, x1, y1, mat, part, z=0, form="flat", **kw):
    return {"type": "polygon", "points": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], "material": mat, "form": form, "part": part, "z": z, **kw}


def spec(mats, shapes, size=(W, H), outline="none"):
    return {"size": list(size), "materials": mats, "shapes": shapes, "outline": outline}


R = np.random.default_rng(7)


# ------------------------------------------------------------------ material fields
def planks(base="#99702a", vertical=False, gloss=False):
    sh, n = [], 0
    step = 24
    for k in range(0, (W if vertical else H) // step + 1):
        a = k * step
        b = [0.25, -0.2, 0.45, -0.35, 0.1, -0.05, 0.3, -0.25, 0.15, -0.4, 0.2, -0.1, 0.35, 0][k % 14]
        sh.append(rect(a, 0, a + step - 1, H, "w", f"p{k}", k, "bevel", bevel=1.6, flow=[0, 1], bias=b) if vertical else
                  rect(0, a, W, a + step - 1, "w", f"p{k}", k, "bevel", bevel=1.6, flow=[1, 0], bias=b))
        for q in range(2):  # knots
            cx, cy = (a + step / 2, R.uniform(10, H - 10)) if vertical else (R.uniform(10, W - 10), a + step / 2)
            if R.random() < 0.55:
                sh.append({"type": "polygon", "points": _L(blob(cx, cy, 3.2 if not vertical else 2.2, 2.2 if not vertical else 3.2, R, 0.2, 8)), "material": "w",
                           "form": "dome", "part": f"p{k}", "z": k + 0.1, "bias": -1.6, "clip": f"p{k}"})
                n += 1
    return spec({"w": M(base, 7, "wood", rough=0.55, marks=1.0, contrast=1.25, spec=0.8 if gloss else 0)}, sh)


def plates(base, cols=2, rows=2, texture="metal", rough=0.22, marks=0.5, frost=False):
    sh = []
    pw, ph = W / cols, H / rows
    for j in range(rows):
        for i in range(cols):
            sh.append(rect(i * pw, j * ph, (i + 1) * pw - 1, (j + 1) * ph - 1, "m", f"pl{i}{j}", 0, "bevel", bevel=2.5, flow=[1, 0.08], bias=[0.15, -0.1, 0.05, -0.2][(i + j * cols) % 4]))
    mats = {"m": M(base, 6, texture, rough=rough, marks=marks)}
    if frost:
        mats["f"] = M("#cfd3cb", 5, "crystal", rough=0.5, marks=1.0)
        for k in range(14):
            cx, cy = R.uniform(0, W), R.uniform(0, H)
            sh.append({"type": "polygon", "points": _L(blob(cx, cy, R.uniform(10, 26), R.uniform(6, 16), R, 0.45, 9, R.uniform(0, 3))), "material": "f",
                       "form": "flat", "part": f"fr{k}", "z": 2 + k * 0.01})
    return spec(mats, sh)


def earth():
    """dug earth: crumbly clods (short strokes, each clod its own part so contact shading cuts it out), darker and
    lighter strata, bedded stones and a few roots"""
    mats = {"m": M("#604b31", 6, "organic", rough=0.85, marks=1.0, length=3), "s": M("#6c6862", 6, "stone", rough=0.3, length=4),
            "r": M("#72502d", 5, "wood", length=4)}
    sh = [rect(0, 0, W, H, "m", "e", 0)]
    for k in range(5):  # darker and lighter strata
        y = R.uniform(0, H)
        sh.append({"type": "polygon", "points": _L([(0, y), (W, y + R.uniform(-8, 8)), (W, y + 14), (0, y + 12)]), "material": "m", "form": "flat", "part": "e", "z": 0.5, "bias": [-0.6, 0.5][k % 2], "clip": "e"})
    for k in range(260):  # clods
        cx, cy, rr = R.uniform(-4, W + 4), R.uniform(-4, H + 4), R.uniform(2.5, 7)
        sh.append({"type": "polygon", "points": _L(blob(cx, cy, rr, rr * R.uniform(0.55, 0.9), R, 0.35, 8, R.uniform(0, 3))), "material": "m", "form": "dome",
                   "part": f"cl{k}", "z": 0.8 + k * 0.001, "bias": float(R.uniform(-0.7, 0.6))})
    for k in range(34):
        cx, cy, rr = R.uniform(0, W), R.uniform(0, H), R.uniform(2.2, 5.5)
        sh.append({"type": "gem", "outer": _L(blob(cx, cy, rr, rr * 0.8, R, 0.25, 7)[::2]), "material": "s", "part": f"st{k}", "z": 2 + k * 0.01, "tilt": 0.8, "table_scale": 0.5})
    for k in range(9):
        x0, y0 = R.uniform(0, W), R.uniform(0, H)
        pts = [(x0 + i * R.uniform(5, 9), y0 + i * R.uniform(2, 6) + math.sin(i) * 3) for i in range(6)]
        sh.append({"type": "stroke", "points": _L(catmull(pts, 3)), "width": [1.4, 1.2, 1.0, 0.8], "material": "r", "form": "cylinder", "part": f"rt{k}", "z": 1.5})
    return spec(mats, sh)


def concrete():
    mats = {"m": M("#898278", 6, "stone", rough=0.5, marks=0.9, length=6), "d": M("#525150", 5, "stone")}
    sh = [rect(0, 0, W, H, "m", "c", 0)]
    for k in range(H // 48 + 1):  # formwork pours
        sh.append(rect(0, k * 48, W, k * 48 + 47, "m", "c", 0.5, "flat", bias=[0.25, -0.15, 0.1, -0.3][k % 4], clip="c"))
    for k in range(26):  # chips and pits
        cx, cy = R.uniform(0, W), R.uniform(0, H)
        sh.append({"type": "polygon", "points": _L(blob(cx, cy, R.uniform(1.2, 3.5), R.uniform(1, 2.6), R, 0.35, 6)), "material": "d", "form": "dome", "part": f"ch{k}", "z": 1 + k * 0.01})
    return spec(mats, sh)


def corrugated(base="#c1b59b"):
    return spec({"m": M(base, 6, "metal", rough=0.2, marks=0.5)}, [rect(0, 0, W, H, "m", "c", 0, "flat", stripes={"from": [0, 0], "to": [W, 0], "period": 8, "duty": 0.45, "amount": 1.4})])


def paper():
    mats = {"p": M("#d6cab0", 5, "cloth", rough=0.3, marks=0.7), "fx": M("#bc913a", 4)}
    sh = [rect(0, 0, W, H, "p", "p", 0)]
    for k in range(10):  # foxing
        cx, cy = R.uniform(0, W), R.uniform(0, H)
        sh.append({"type": "polygon", "points": _L(blob(cx, cy, R.uniform(1, 3), R.uniform(1, 2.5), R, 0.4, 6)), "material": "p", "form": "flat", "part": "p", "z": 1, "bias": -1.4, "clip": "p"})
    sh.append({"type": "stroke", "points": [[W * 0.58, 0], [W * 0.6, H]], "width": 1.0, "material": "p", "form": "flat", "part": "fold", "z": 2, "bias": -0.8})
    return spec(mats, sh)


def brass():
    mats = {"m": M("#946c21", 6, "metal", rough=0.25, marks=0.5, spec=0.8)}
    return spec(mats, [rect(0, 0, W, H, "m", "b", 0, "bevel", bevel=3, flow=[1, 0])])


FIELDS = {
    "crate": lambda: planks("#99702a"),
    "lacquer": lambda: planks("#4e2817", vertical=True, gloss=True),
    "olive": lambda: plates("#616436", 2, 2),
    "hold": lambda: plates("#4b4c28", 3, 2),
    "earth": earth,
    "concrete": concrete,
    "frost": lambda: plates("#8e9190", 2, 2, frost=True),
    "teal": lambda: plates("#407162", 2, 3),
    "corr": lambda: corrugated(),
    "brass": brass,
    "paper": paper,
    "gun": lambda: plates("#3d4346", 3, 2),
}


# ------------------------------------------------------------------ container icons (32 px)
def box3(x, y, w, h, d, mat, part, z=0):
    top = [(x + d * 0.6, y), (x + w + d * 0.6, y), (x + w, y + d * 0.6), (x, y + d * 0.6)]
    front = [(x, y + d * 0.6), (x + w, y + d * 0.6), (x + w, y + d * 0.6 + h), (x, y + d * 0.6 + h)]
    side = [(x + w, y + d * 0.6), (x + w + d * 0.6, y), (x + w + d * 0.6, y + h), (x + w, y + d * 0.6 + h)]
    return [{"type": "polygon", "points": _L(front), "material": mat, "form": "bevel", "bevel": 1.0, "part": part + "f", "z": z},
            {"type": "polygon", "points": _L(top), "material": mat, "form": "flat", "part": part + "t", "z": z + 0.1, "bias": 1.4},
            {"type": "polygon", "points": _L(side), "material": mat, "form": "flat", "part": part + "s", "z": z + 0.1, "bias": -1.5}]


def icon(mats, shapes):
    return {"size": [32, 32], "materials": mats, "shapes": shapes, "outline": "selout"}


def K(base, tex=None, **kw):
    return {"base": base, "steps": 6, "contrast": 1.3, **({"texture": tex} if tex else {}), **kw}


KINDS = {
    "crate": lambda: icon({"w": K("#99702a", "wood"), "d": K("#453624")}, box3(3, 9, 20, 14, 10, "w", "c") + [
        {"type": "polygon", "points": [[9, 9], [26, 9], [24, 14], [7, 14]], "material": "d", "form": "flat", "part": "in", "z": 1}]),
    "st_bin": lambda: icon({"m": K("#616436", "metal"), "d": K("#35351e")}, box3(2, 14, 12, 9, 8, "m", "a") + box3(16, 14, 12, 9, 8, "m", "b", 2) + [
        {"type": "polygon", "points": [[3, 7], [14, 3], [15, 9], [5, 13]], "material": "m", "form": "flat", "part": "lid", "z": 3, "bias": 0.8}]),
    "st_pit": lambda: icon({"e": K("#7a5d3a", "organic"), "h": K("#2a2018"), "s": K("#898278", "stone"), "g": K("#6c8a3a", "organic")}, [
        {"type": "polygon", "points": _L(blob(16, 22, 14, 7.5, np.random.default_rng(3), 0.12, 10)), "material": "e", "form": "dome", "part": "mound", "z": 0},
        {"type": "polygon", "points": _L(blob(16, 19.5, 8, 3.2, np.random.default_rng(5), 0.1, 9)), "material": "h", "form": "flat", "part": "hole", "z": 1},
        {"type": "polygon", "points": _L(blob(16, 21, 6.5, 1.6, np.random.default_rng(6), 0.1, 8)), "material": "e", "form": "flat", "part": "lip", "z": 1.5, "bias": 0.9},
        {"type": "gem", "outer": _L(blob(6, 25, 2.6, 2, np.random.default_rng(7), 0.2, 6)[::2]), "material": "s", "part": "st1", "z": 2, "tilt": 0.8, "table_scale": 0.5},
        {"type": "gem", "outer": _L(blob(26, 26, 2.2, 1.7, np.random.default_rng(8), 0.2, 6)[::2]), "material": "s", "part": "st2", "z": 2, "tilt": 0.8, "table_scale": 0.5},
        {"type": "stroke", "points": [[9, 16], [8, 12], [7, 10]], "width": [1.2, 0.9, 0.6], "material": "g", "form": "flat", "part": "g1", "z": 2},
        {"type": "stroke", "points": [[10, 16], [11, 11], [13, 9]], "width": [1.2, 0.9, 0.6], "material": "g", "form": "flat", "part": "g2", "z": 2},
        {"type": "stroke", "points": [[23, 17], [24, 13], [26, 12]], "width": [1.1, 0.8, 0.6], "material": "g", "form": "flat", "part": "g3", "z": 2}]),
    "st_bunker": lambda: icon({"c": K("#898278", "stone"), "o": K("#9f4621", "stone")}, box3(3, 7, 22, 4, 8, "c", "back") + box3(3, 11, 4, 12, 8, "c", "l", 1) + box3(21, 11, 4, 12, 8, "c", "r", 1) + [
        {"type": "polygon", "points": _L(blob(15, 17, 6, 3, np.random.default_rng(4), 0.3, 8)), "material": "o", "form": "dome", "part": "ore", "z": 0.5}]),
    "st_freezer": lambda: icon({"m": K("#c1b59b", "metal"), "f": K("#cfd3cb", "crystal"), "g": K("#3d4346", "metal")}, box3(3, 6, 17, 20, 7, "m", "b") + box3(21, 13, 7, 13, 5, "g", "comp", 1) + [
        {"type": "polygon", "points": [[3, 10], [20, 10], [20, 13], [3, 13]], "material": "f", "form": "flat", "part": "rime", "z": 2}]),
    "st_tank": lambda: icon({"m": K("#407162", "metal", spec=1.0), "g": K("#639e8b", "liquid"), "c": K("#898278", "stone")}, [
        {"type": "polygon", "points": [[4, 27], [28, 27], [28, 30], [4, 30]], "material": "c", "form": "flat", "part": "base", "z": 0},
        {"type": "polygon", "points": _L(catmull([(8, 27), (8, 7), (11, 3), (21, 3), (24, 7), (24, 27)], 3)), "material": "m", "form": "cylinder", "part": "body", "z": 1, "flow": [0, 1]},
        {"type": "polygon", "points": [[19, 10], [21, 10], [21, 25], [19, 25]], "material": "g", "form": "flat", "part": "glass", "z": 2}]),
    "silo": lambda: icon({"m": K("#c1b59b", "metal"), "r": K("#8c2920", "metal")}, [
        {"type": "polygon", "points": [[9, 11], [23, 11], [23, 29], [9, 29]], "material": "m", "form": "cylinder", "part": "body", "z": 0, "stripes": {"from": [9, 0], "to": [23, 0], "period": 2.5, "duty": 0.5, "amount": 0.9}},
        {"type": "polygon", "points": [[7, 12], [16, 3], [25, 12]], "material": "r", "form": "facets", "part": "roof", "z": 1}]),
    "st_cabinet": lambda: icon({"w": K("#4e2817", "wood", spec=1.0), "g": K("#92bca6", "crystal", spec=1.0), "b": K("#b38737", "metal")}, box3(6, 3, 16, 25, 5, "w", "cab") + [
        {"type": "polygon", "points": [[8, 6 + k * 7], [20, 6 + k * 7], [20, 11 + k * 7], [8, 11 + k * 7]], "material": "g", "form": "flat", "part": f"gl{k}", "z": 2} for k in range(3)] + [
        {"type": "polygon", "points": [[13, 11 + k * 7], [15, 11 + k * 7], [15, 12 + k * 7], [13, 12 + k * 7]], "material": "b", "form": "flat", "part": f"h{k}", "z": 3} for k in range(3)]),
    "st_vault": lambda: icon({"c": K("#898278", "stone"), "b": K("#b38737", "metal", spec=1.0), "e": K("#2b5550", "metal")}, box3(3, 9, 21, 15, 8, "c", "v") + [
        {"type": "ellipse", "center": [13.5, 20], "radii": [6, 5.5], "material": "b", "form": "bevel", "bevel": 1.2, "part": "door", "z": 2},
        {"type": "ellipse", "center": [13.5, 20], "radii": [3.5, 3.2], "material": "e", "form": "dome", "part": "wheel", "z": 3}]),
    "hold": lambda: icon({"m": K("#4b4c28", "metal"), "d": K("#222316")}, box3(3, 11, 21, 10, 9, "m", "t") + [
        {"type": "polygon", "points": [[9, 11], [27, 11], [25, 15], [7, 15]], "material": "d", "form": "flat", "part": "in", "z": 1}]),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    P, cols = master_palette()
    pal = np.array([[(c >> 16) & 255, (c >> 8) & 255, c & 255, 255] for c in cols] + [[0, 0, 0, 0]] * (256 - len(cols)), np.uint8)
    contact = []
    for name, f in FIELDS.items():
        _, im = make(f(), seed=11)
        rgba = Image.fromarray(pal[snap(im, P)], "RGBA")
        rgba.save(os.path.join(OUT, f"mat_{name}.png"))
        contact.append(rgba.crop((0, 0, 120, 90)).resize((240, 180), Image.NEAREST))
        print("field", name)
    for kind, f in KINDS.items():
        _, im = make(f(), seed=5)
        rgba = Image.fromarray(pal[snap(im, P)], "RGBA")
        rgba.save(os.path.join(OUT, f"kind_{kind}.png"))
        contact.append(Image.new("RGBA", (240, 180), (30, 30, 30, 255)))
        contact[-1].alpha_composite(rgba.resize((128, 128), Image.NEAREST), (56, 26))
        print("icon", kind)
    n = len(contact); cn = 6; rows = math.ceil(n / cn)
    sh = Image.new("RGBA", (cn * 246, rows * 186), (16, 18, 20, 255))
    for i, im in enumerate(contact):
        sh.alpha_composite(im, ((i % cn) * 246, (i // cn) * 186))
    if os.environ.get("UI_CONTACT"):
        sh.save(os.environ["UI_CONTACT"])


if __name__ == "__main__":
    main()

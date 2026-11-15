"""Paint every real item with the user's lowpix tool (/home/user/pukkingdragon123/symmetrical-goggles).

Generators where they fit (ore, crystal, nugget, chunk, ingot, potion, gem); hand-written lowpix sprite specs for the
rest (logs, leaves, seeds, specimens, heaps, parts...). Each is rendered at 32 x 32 with lowpix's stroke painter,
snapped to the master palette (src/art/palette.ts), and written as palette indices into src/inv/itemSprites.ts.
A contact sheet goes to --sheet for review.

  python3 src/inv/sprites/make_items.py [--sheet out.png] [--only id,id]
"""
from __future__ import annotations

import argparse
import base64
import math
import os
import re
import sys

import numpy as np

LOWPIX = os.environ.get("LOWPIX", "/home/user/pukkingdragon123/symmetrical-goggles")
sys.path.insert(0, LOWPIX)
from lowpix.sprite_gen import make, blob, catmull, _L  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
S = 32


# ------------------------------------------------------------------ spec helpers
def M(base, steps=7, texture=None, **kw):
    m = {"base": base, "steps": steps, "contrast": kw.pop("contrast", 1.4)}
    if texture:
        m["texture"] = texture
    m.update(kw)
    return m


def poly(points, mat, part, z=0, form="dome", **kw):
    return {"type": "polygon", "points": _L(points), "material": mat, "form": form, "part": part, "z": z, **kw}


def ell(c, r, mat, part, z=0, form="dome", **kw):
    return {"type": "ellipse", "center": list(c), "radii": list(r), "material": mat, "form": form, "part": part, "z": z, **kw}


def stroke(points, width, mat, part, z=0, form="cylinder", **kw):
    return {"type": "stroke", "points": _L(points), "width": width, "material": mat, "form": form, "part": part, "z": z, **kw}


def spec(mats, shapes, sparkle=False):
    return {"size": [S, S], "materials": mats, "shapes": shapes, "outline": "selout", "effects": {"sparkle": "auto"} if sparkle else {}}


def rng(seed):
    return np.random.default_rng(seed)


def box3(x, y, w, h, d, mat, part, z=0, top_bias=1.5, side_bias=-1.6, form="bevel"):
    """a block seen from above-front: a top face, a front face and a right side face"""
    top = [(x + d * 0.6, y), (x + w + d * 0.6, y), (x + w, y + d * 0.6), (x, y + d * 0.6)]
    front = [(x, y + d * 0.6), (x + w, y + d * 0.6), (x + w, y + d * 0.6 + h), (x, y + d * 0.6 + h)]
    side = [(x + w, y + d * 0.6), (x + w + d * 0.6, y), (x + w + d * 0.6, y + h), (x + w, y + d * 0.6 + h)]
    return [poly(front, mat, part + "f", z, form, bevel=1.0, edge={"light": 1.0, "width": 0.8}),
            poly(top, mat, part + "t", z + 0.1, "flat", bias=top_bias),
            poly(side, mat, part + "s", z + 0.1, "flat", bias=side_bias)]


# ------------------------------------------------------------------ families
def heap(colour, texture="organic", seed=1, pebbles=None, top=None, wide=1.0):
    r = rng(seed)
    pts = blob(16, 21, 13 * wide, 8, r, 0.12, 11)
    pts = [(x, min(y, 27.5)) for x, y in pts]
    shapes = [poly(pts, "m", "heap", 0, "dome", edge={"light": 1.0, "width": 0.8})]
    mats = {"m": M(colour, 7, texture, noise=0.3, noise_scale=1.4)}
    if pebbles:
        mats["p"] = M(pebbles, 6, "stone")
        for k in range(4):
            c = (r.uniform(8, 24), r.uniform(18, 26))
            shapes.append(poly(blob(c[0], c[1], 1.6, 1.2, r, 0.25, 6), "p", f"pb{k}", 1 + k * 0.01))
    if top:
        shapes += top(mats)
    return spec(mats, shapes)


def sprout(mats):
    mats["leaf"] = M("#7f8b3f", 6, "moss")
    return [stroke([(16, 15), (16.5, 9)], 1.0, "leaf", "stem", 2),
            poly([(16.5, 11), (11, 7.5), (13, 6), (16.5, 9.5)], "leaf", "lf1", 3, "ridge"),
            poly([(16.5, 10), (22, 6), (21, 9), (17, 11)], "leaf", "lf2", 3, "ridge")]


def logs():
    mats = {"bark": M("#5a3e32", 7, "wood"), "end": M("#c69a5c", 7, "wood", contrast=1.2)}
    sh = []
    for k, (y, x0) in enumerate([(19, 4), (12, 7)]):
        sh.append(stroke([(x0 + 3, y), (x0 + 22, y - 2)], 7.0, "bark", f"log{k}", k * 2, flow=[1, 0]))
        sh.append(ell((x0 + 3, y), (3.0, 3.6), "end", f"end{k}", k * 2 + 1, "flat"))
        sh.append(ell((x0 + 3, y), (1.6, 2.0), "end", f"ring{k}", k * 2 + 1.1, "flat", bias=-1.5))
        sh.append(ell((x0 + 3, y), (0.6, 0.8), "end", f"pith{k}", k * 2 + 1.2, "flat", bias=-2.5))
    return spec(mats, sh)


def leaves():
    mats = {"a": M("#597033", 7, "moss"), "b": M("#77976b", 6, "moss"), "stem": M("#72502d", 5, "wood")}
    sh = [stroke([(16, 29), (16, 18)], 1.2, "stem", "stem", 0)]
    for k, (tip, base, m) in enumerate([((5, 8), (15, 19), "a"), ((27, 7), (17, 18), "a"), ((15, 3), (16, 17), "b"), ((26, 20), (17, 22), "b"), ((6, 21), (15, 23), "a")]):
        bx, by = base; tx, ty = tip
        nx, ny = -(ty - by), (tx - bx); L = math.hypot(nx, ny); nx, ny = nx / L * 3.2, ny / L * 3.2
        mx, my = (bx + tx) / 2, (by + ty) / 2
        pts = catmull([(bx, by), (mx + nx, my + ny), (tx, ty), (mx - nx * 0.8, my - ny * 0.8)], 4, closed=True)
        sh.append(poly(pts, m, f"leaf{k}", 1 + k * 0.1, "ridge", edge={"light": 1.0, "width": 0.7}))
        sh.append(stroke([(bx, by), (tx * 0.85 + bx * 0.15, ty * 0.85 + by * 0.15)], 0.5, m, f"vein{k}", 1.05 + k * 0.1, bias=-1.5, clip=f"leaf{k}"))
    return spec(mats, sh)


def bundle(colour, tie="#7a4b2c", n=8, seed=3):
    r = rng(seed)
    mats = {"f": M(colour, 7, "cloth"), "t": M(tie, 6, "leather")}
    sh = []
    for k in range(n):
        x = 11 + k * 1.4 + r.uniform(-0.4, 0.4)
        sh.append(stroke([(x - 1.5 + k * 0.2, 4 + r.uniform(0, 2)), (x, 16), (x + 1 - k * 0.3, 28)], 1.6, "f", f"s{k}", k * 0.01, flow=[0, 1]))
    sh.append(poly([(9, 10), (24, 10), (24, 13), (9, 13)], "t", "band1", 2, "cylinder"))
    sh.append(poly([(9, 19), (24, 19), (24, 22), (9, 22)], "t", "band2", 2, "cylinder"))
    return spec(mats, sh)


def fruit_like(colour, rx=10, ry=9.5, leaf=True, seed=5, texture="organic", spec_on=True):
    r = rng(seed)
    mats = {"m": M(colour, 7, texture, spec=1.0 if spec_on else 0, spec_threshold=0.93, rim=1.2), "leaf": M("#597033", 6, "moss"), "stem": M("#563d20", 5, "wood")}
    sh = [poly(blob(16, 18.5, rx, ry, r, 0.08, 10), "m", "body", 0, "dome")]
    if leaf:
        sh.append(stroke([(16.5, 10), (17.5, 5)], 1.0, "stem", "stem", 1))
        sh.append(poly(catmull([(17.5, 7), (21, 4), (25.5, 4.5), (21, 7.5)], 4, closed=True), "leaf", "leaf", 2, "ridge"))
    return spec(mats, sh)


def cluster(colour, n=7, r0=3.0, seed=7, base=None, texture="organic", spark=False):
    r = rng(seed)
    mats = {"m": M(colour, 7, texture, spec=1.0, spec_threshold=0.92)}
    sh = []
    if base:
        sh += base(mats)
    pts = [(r.uniform(8, 24), r.uniform(12, 25)) for _ in range(n)]
    for k, (x, y) in enumerate(sorted(pts, key=lambda p: p[1])):
        rr = r0 * r.uniform(0.85, 1.15)
        sh.append(poly(blob(x, y, rr, rr * 0.9, r, 0.12, 8), "m", f"b{k}", 2 + y * 0.01, "dome"))
    return spec(mats, sh, spark)


def basket(mats):
    mats["wk"] = M("#a99c51", 6, "wood")
    return [poly([(5, 18), (27, 18), (24.5, 29), (7.5, 29)], "wk", "basket", 0, "cylinder", stripes={"from": [5, 18], "to": [27, 18], "period": 3, "duty": 0.5, "amount": 0.8})]


def vial(colour, shape="vial", seed=2):
    return ("potion", dict(shape=shape, colour=colour), seed)


def plate_part(colour, texture="metal", holes=True):
    mats = {"m": M(colour, 7, texture, spec=1.0, spec_threshold=0.9)}
    sh = box3(4, 9, 20, 4, 14, "m", "pl")
    if holes:
        mats["h"] = M("#2a2f32", 4)
        for (x, y) in [(7, 18), (21, 18), (9, 11.5), (23, 11.5)]:
            sh.append(ell((x, y), (0.9, 0.7), "h", f"h{x}{y}", 3, "flat"))
    return spec(mats, sh)


def rods(colour, n=3):
    mats = {"m": M(colour, 7, "metal", spec=1.0, spec_threshold=0.9)}
    sh = [stroke([(5 + k * 3, 26 - k), (25 + k * 2, 8 - k)], 2.4, "m", f"r{k}", k, flow=[1, -1]) for k in range(n)]
    return spec(mats, sh)


def gear(colour="#6e7373"):
    mats = {"m": M(colour, 7, "metal", spec=1.0, spec_threshold=0.9), "hole": M("#1c1e20", 3)}
    pts = []
    for i in range(24):
        a = i / 24 * 2 * math.pi
        rr = 12.5 if (i % 3) == 0 else (12.5 if (i % 3) == 1 else 9.5)
        pts.append((16 + rr * math.cos(a), 16 + rr * math.sin(a) * 0.92))
    sh = [poly(pts, "m", "gear", 0, "bevel", bevel=1.5, edge={"light": 1.2, "width": 0.8}),
          ell((16, 16), (6.5, 6), "m", "hub", 1, "dome", bias=0.8), ell((16, 16), (2.6, 2.4), "hole", "hole", 2, "flat")]
    return spec(mats, sh)


def spool(core="#bc913a", wire="#b8703a", texture="metal"):
    mats = {"w": M(wire, 7, texture, spec=1.0, spec_threshold=0.9), "c": M(core, 6, "wood")}
    sh = [ell((8, 16), (4, 11), "c", "flange1", 0, "flat", bias=-1.0), poly([(8, 7), (24, 7), (24, 25), (8, 25)], "w", "coil", 1, "cylinder", flow=[0, 1],
          stripes={"from": [8, 7], "to": [8, 25], "period": 2, "duty": 0.5, "amount": 0.6}), ell((24, 16), (4, 11), "c", "flange2", 2, "flat", bias=0.6), ell((24, 16), (1.5, 2.5), "c", "axle", 3, "flat", bias=-2)]
    return spec(mats, sh)


def sack(colour="#a99c51", label=True):
    mats = {"s": M(colour, 7, "cloth"), "tie": M("#7a4b2c", 5, "leather"), "lab": M("#d6cab0", 5)}
    sh = [poly(catmull([(9, 11), (23, 11), (27, 19), (26, 27), (16, 29), (6, 27), (5, 19)], 4, closed=True), "s", "body", 0, "pillow", bevel=3),
          poly([(11, 11), (21, 11), (19, 6), (22, 3), (16, 5), (10, 3), (13, 6)], "s", "neck", 1, "dome"),
          poly([(10.5, 9.5), (21.5, 9.5), (21.5, 12), (10.5, 12)], "tie", "tie", 2, "cylinder")]
    if label:
        sh.append(poly([(11, 17), (21, 17), (21, 23), (11, 23)], "lab", "lab", 3, "flat", bias=0.5))
    return spec(mats, sh)


def tube_part(glass="#9cc0d6", inner="#d7a856", cap="#3f3d3f"):
    mats = {"g": M(glass, 6, "crystal", spec=1.0, spec_threshold=0.85), "i": M(inner, 6, emissive=0.6), "c": M(cap, 6, "metal")}
    sh = [poly(catmull([(11, 26), (11, 9), (13, 5), (16, 4), (19, 5), (21, 9), (21, 26)], 4), "g", "glass", 0, "cylinder", flow=[0, 1]),
          stroke([(16, 22), (16, 10)], 1.4, "i", "fil", 1, clip="glass"), stroke([(13.5, 18), (18.5, 18)], 1.0, "c", "grid", 1.1, clip="glass"),
          poly([(10, 25), (22, 25), (22, 29), (10, 29)], "c", "base", 2, "cylinder")]
    return spec(mats, sh)


def can(body, band, window=None, drum=False):
    mats = {"b": M(body, 7, "metal", spec=1.0, spec_threshold=0.9), "k": M(band, 6, "metal")}
    sh = [poly([(8, 6), (24, 6), (24, 28), (8, 28)], "b", "body", 0, "cylinder", flow=[0, 1])]
    for y in ([10, 23] if drum else [7, 26]):
        sh.append(poly([(8, y), (24, y), (24, y + 2), (8, y + 2)], "k", f"band{y}", 1, "cylinder"))
    if window:
        mats["w"] = M(window, 6, "liquid", emissive=0.3)
        sh.append(poly([(13, 12), (19, 12), (19, 21), (13, 21)], "w", "win", 2, "flat"))
    return spec(mats, sh)


def board(base, trace, chip="#2f2e31", gold=None):
    mats = {"b": M(base, 6, "stone"), "t": M(trace, 5, "metal", spec=1.0), "c": M(chip, 5)}
    sh = box3(3, 10, 22, 2, 14, "b", "pcb")
    for (a, b) in [((7, 19), (14, 17)), ((14, 17), (14, 13)), ((16, 20), (24, 15)), ((9, 14.5), (20, 12))]:
        sh.append(stroke([a, b], 0.7, "t", f"tr{a}", 3, "ridge", clip="pcbt" if b[1] < 16 else None))
    sh += box3(12, 13, 6, 2, 4, "c", "chip", 4)
    if gold:
        mats["g"] = M(gold, 6, "metal", spec=1.0)
        for k in range(6):
            sh.append(poly([(5 + k * 3, 23), (6.6 + k * 3, 23), (6.6 + k * 3, 25.5), (5 + k * 3, 25.5)], "g", f"pin{k}", 5, "flat"))
    return spec(mats, sh)


def stone(colour, seed=1, texture="stone", marks=None):
    r = rng(seed)
    mats = {"m": M(colour, 7, texture, noise=0.4, noise_scale=1.6)}
    sh = [{"type": "gem", "outer": _L(blob(15, 17, 12, 9.5, r, 0.18, 9)[::3]), "material": "m", "part": "rock", "tilt": 0.8, "table_scale": 0.5,
           "table_offset": [-1.5, -2], "edge": {"light": 1.0, "width": 0.8}},
          {"type": "gem", "outer": _L(blob(25, 23.5, 4, 3.2, r, 0.2, 7)[::3]), "material": "m", "part": "small", "tilt": 0.8, "table_scale": 0.5, "z": 1}]
    if marks:
        sh += marks(mats, r)
    return spec(mats, sh)


# ------------------------------------------------------------------ the catalogue
def catalogue():
    G = {}
    # ---- generators
    for id_, colour, seed in [("ore", "#c36530", 3), ("copper_ore", "#459155", 5), ("gold_ore", "#dcc066", 8), ("gravium", "#8a5ea8", 4)]:
        G[id_] = ("ore", dict(kind="ore", colour=colour), seed)
    for id_, colour, seed in [("crystal", "#c6cbc8", 2), ("lumen_crystal", "#95ccb0", 6), ("amethyst", "#8a5ea8", 3), ("ruby", "#b0354a", 4), ("sulphur", "#d8c84a", 7), ("salt", "#e3e1d7", 9)]:
        G[id_] = ("ore", dict(kind="crystal", colour=colour), seed)
    for id_, colour, seed in [("iron_pellet", "#9f4621", 3), ("glass_bead", "#639e8b", 4), ("saltpetre", "#d6cab0", 5)]:
        G[id_] = ("ore", dict(kind="nugget", colour=colour), seed)
    for id_, colour, seed in [("coal", "#2f2e31", 2), ("malachite", "#2c7240", 4), ("charcoal", "#3f3d3f", 6), ("rock_obsidian", "#1e232c", 8)]:
        G[id_] = ("ore", dict(kind="chunk", colour=colour), seed)
    for id_, colour, seed in [("iron_ingot", "#6e7373", 1), ("copper_ingot", "#b8703a", 2), ("steel_ingot", "#566f79", 3), ("gold_ingot", "#c19e3b", 4),
                              ("brick", "#9d643b", 5), ("concrete", "#898278", 6), ("rubber", "#3f3d3f", 7), ("plastic", "#7f4b2c", 8)]:
        G[id_] = ("ore", dict(kind="ingot", colour=colour), seed)
    for id_, colour, shape, seed in [("water", "#427d74", "flask", 2), ("brine", "#2a625e", "bottle", 3), ("sap", "#d8ac5b", "round", 4), ("bio_oil", "#6b7d22", "bottle", 5),
                                     ("algae_fuel", "#525d1b", "flask", 6), ("acid", "#c5b36e", "round", 7), ("tissue", "#b75248", "vial", 8), ("blood_sample", "#7c1814", "vial", 9),
                                     ("embryo", "#95ccb0", "vial", 10), ("venom_gland", "#8b9d30", "round", 11), ("protein", "#d6cab0", "bottle", 12), ("spore_fungus", "#86628a", "vial", 13),
                                     ("herbicide", "#8b9d30", "bottle", 14)]:
        G[id_] = vial(colour, shape, seed)
    G["seed_crystal"] = ("gem", dict(cut="hexagon", colour="#8a5ea8"), 3)
    G["lumen_lens"] = ("gem", dict(cut="round", colour="#95ccb0"), 4)
    # ---- rocks
    G["rock_granite"] = ("custom", lambda: stone("#898278", 1, marks=lambda m, r: [ell((r.uniform(8, 22), r.uniform(12, 22)), (0.6, 0.5), "m", f"sp{k}", 2 + k * 0.01, "flat", bias=(2.5 if k % 2 else -2.5)) for k in range(10)]), 0)
    G["rock_basalt"] = ("custom", lambda: stone("#3f3d3f", 2), 0)
    G["rock_limestone"] = ("custom", lambda: stone("#c7b589", 3, marks=lambda m, r: [stroke(catmull([(12, 16), (14, 13.5), (16.5, 15), (15, 17.5), (13.5, 16)], 3), 0.6, "m", "shell", 2, bias=-2.2, clip="rock")]), 0)
    G["rock_sandstone"] = ("custom", lambda: stone("#c6ad7b", 4, marks=lambda m, r: [poly([(0, 12 + k * 4), (32, 10 + k * 4), (32, 11.5 + k * 4), (0, 13.5 + k * 4)], "m", f"band{k}", 2, "flat", bias=(-1.4 if k % 2 else 1.0), clip="rock") for k in range(4)]), 0)
    G["rock_slate"] = ("custom", lambda: spec({"m": M("#3f5362", 7, "stone")}, sum([box3(4 + (k % 2) * 2, 21 - k * 4, 19, 2, 8, "m", f"sl{k}", k) for k in range(4)], [])), 0)
    # ---- bio
    G["wood"] = ("custom", logs, 0)
    G["bark"] = ("custom", lambda: spec({"m": M("#5a3e32", 7, "wood")}, [poly(catmull([(4, 14), (18, 9), (24, 12), (22, 18), (8, 22)], 3, closed=True), "m", "b1", 0, "ridge", flow=[1, -0.3]),
                                                                        poly(catmull([(9, 22), (24, 17), (28, 21), (25, 27), (11, 28)], 3, closed=True), "m", "b2", 1, "ridge", flow=[1, -0.3], bias=0.6)]), 0)
    G["leaves"] = ("custom", leaves, 0)
    G["fibre"] = ("custom", lambda: bundle("#c5b36e"), 0)
    G["silk"] = ("custom", lambda: spool("#bc913a", "#decd93", "cloth"), 0)
    G["fruit"] = ("custom", lambda: fruit_like("#bf6346"), 0)
    G["berries"] = ("custom", lambda: cluster("#642a3f", 8, 3.2, 7, basket), 0)
    G["tuber"] = ("custom", lambda: cluster("#9d643b", 3, 6.0, 9, None, "organic"), 0)
    G["kelp"] = ("custom", lambda: spec({"m": M("#407162", 7, "organic", spec=1.0)}, [stroke(catmull([(8 + k * 7, 29), (6 + k * 7, 21), (10 + k * 7, 13), (7 + k * 7, 4)], 4), [2.8, 3.4, 3.0, 1.8], "m", f"k{k}", k, "ridge") for k in range(3)]), 0)
    G["mushroom"] = ("custom", lambda: spec({"cap": M("#966b5a", 7, "organic"), "st": M("#c7b589", 6, "organic")},
                                           [poly([(13, 17), (19, 17), (19.5, 28), (12.5, 28)], "st", "stem", 0, "cylinder"),
                                            poly(catmull([(4, 18), (7, 10), (16, 6), (25, 10), (28, 18), (16, 16)], 4, closed=True), "cap", "cap", 1, "dome"),
                                            ell((10, 12), (1.2, 1), "st", "dot1", 2, "flat"), ell((20, 10), (1, 0.8), "st", "dot2", 2, "flat")]), 0)
    G["meat"] = ("custom", lambda: spec({"m": M("#973537", 7, "organic", spec=1.0), "fat": M("#e0cfa6", 6, "organic"), "bone": M("#c7b589", 6)},
                                       [poly(blob(15, 17, 12, 8.5, rng(4), 0.1, 10), "m", "meat", 0, "dome"),
                                        stroke(catmull([(6, 13), (13, 10.5), (22, 11), (27, 14)], 3), 2.0, "fat", "fat", 1, "ridge", clip="meat"),
                                        stroke([(9, 19), (17, 20.5), (23, 18)], 0.8, "fat", "marb", 1.1, "ridge", clip="meat"),
                                        ell((27, 18), (2.8, 3), "bone", "bone", 2), ell((27.2, 18.2), (1, 1.1), "m", "marrow", 3, "flat", bias=-2)]), 0)
    G["hide"] = ("custom", lambda: spec({"m": M("#765245", 7, "leather")}, [poly(catmull([(5, 6), (12, 4), (20, 4.5), (27, 6), (28, 14), (27, 22), (28, 28), (20, 28), (12, 28), (4, 28), (5, 20), (3.5, 12)], 2, closed=True), "m", "hide", 0, "pillow", bevel=2.5),
                                                                          poly([(14, 5), (18, 5), (18.5, 28), (13.5, 28)], "m", "spine", 1, "flat", bias=-1.2, clip="hide")]), 0)
    G["bone"] = ("custom", lambda: spec({"m": M("#c7b589", 7)}, [stroke([(9, 23), (23, 9)], 4.0, "m", "shaft", 0), ell((7, 23.5), (2.8, 2.8), "m", "k1", 1), ell((9, 26), (2.8, 2.8), "m", "k2", 1),
                                                                 ell((23, 6.5), (2.8, 2.8), "m", "k3", 1), ell((26, 9), (2.8, 2.8), "m", "k4", 1)]), 0)
    G["carbon"] = ("custom", lambda: spec({"m": M("#99702a", 7, "organic"), "t": M("#563d20", 5, "leather")}, box3(4, 8, 18, 14, 10, "m", "bale") +
                                         [poly([(9, 8), (11, 8), (11, 28.5), (9, 28.5)], "t", "c1", 3, "cylinder"), poly([(17, 8), (19, 8), (19, 28.5), (17, 28.5)], "t", "c2", 3, "cylinder")]), 0)
    G["dung"] = ("custom", lambda: heap("#453624", "organic", 4, None, None, 0.8), 0)
    G["egg"] = ("custom", lambda: spec({"e": M("#c7b589", 7, spec=1.0, spec_threshold=0.9), "n": M("#a99c51", 6, "wood"), "sp": M("#5a3e32", 4)},
                                      [poly([(4, 22), (28, 22), (25, 29), (7, 29)], "n", "nest", 0, "cylinder"), ell((16, 14.5), (8, 10), "e", "egg", 1),
                                       ell((13, 11), (0.9, 0.8), "sp", "s1", 2, "flat", clip="egg"), ell((19, 15), (1, 0.8), "sp", "s2", 2, "flat", clip="egg"), ell((14, 18), (0.8, 0.7), "sp", "s3", 2, "flat", clip="egg")]), 0)
    G["plant_cutting"] = ("custom", lambda: spec({"g": M("#9cc0d6", 6, "crystal", spec=1.0), "w": M("#427d74", 6, "liquid"), "l": M("#597033", 6, "moss"), "lid": M("#6e7373", 5, "metal")},
                                                [poly([(9, 14), (23, 14), (23, 29), (9, 29)], "g", "jar", 0, "cylinder"), poly([(9, 19), (23, 19), (23, 29), (9, 29)], "w", "water", 1, "cylinder", clip="jar"),
                                                 stroke([(16, 26), (16.5, 6)], 1.0, "l", "stem", 2), poly(catmull([(16.5, 10), (9, 5), (7, 8), (15, 12)], 3, closed=True), "l", "lf1", 3, "ridge"),
                                                 poly(catmull([(16.5, 8), (24, 3), (26, 6), (18, 10)], 3, closed=True), "l", "lf2", 3, "ridge"), poly([(8, 12), (24, 12), (24, 14.5), (8, 14.5)], "lid", "rim", 4, "cylinder")]), 0)
    # ---- seeds
    G["seed_grass"] = ("custom", lambda: spec({"s": M("#a99c51", 6, "organic"), "g": M("#c5b36e", 6, "organic")},
                                             [stroke([(8 + k * 7, 29), (7 + k * 7.5, 12)], 0.9, "s", f"st{k}", k) for k in range(3)] +
                                             [ell((7 + k * 7.5 + (j % 2) * 2 - 1, 13 - j * 2.2), (1.2, 1.7), "g", f"gr{k}{j}", 3 + k + j * 0.01) for k in range(3) for j in range(4)]), 0)
    G["seed_reed"] = ("custom", lambda: spec({"s": M("#a99c51", 6), "h": M("#72502d", 6, "fur"), "f": M("#e3e1d7", 5, "cloth")},
                                            [stroke([(13, 29), (14, 15)], 1.0, "s", "stem", 0), poly(catmull([(12, 16), (12, 7), (14, 4), (16, 7), (16, 16)], 3, closed=True), "h", "head", 1, "cylinder")] +
                                            [ell((20 + k * 2.5, 6 + k * 4), (1.8, 1.4), "f", f"fl{k}", 2, "dome") for k in range(4)]), 0)
    G["spore_fern"] = ("custom", lambda: spec({"p": M("#d6cab0", 6, "cloth"), "f": M("#507858", 6, "moss"), "d": M("#bc913a", 4)},
                                             [poly([(5, 14), (18, 10), (22, 26), (9, 29)], "p", "twist", 0, "pillow", bevel=2), poly([(18, 10), (25, 6), (23, 12)], "p", "tip", 1),
                                              poly(catmull([(25, 29), (22, 18), (24, 8), (27, 10), (28, 20)], 3, closed=True), "f", "frond", 2, "ridge")] +
                                             [ell((25 + (k % 2), 12 + k * 3.5), (0.8, 0.6), "d", f"d{k}", 3, "flat", clip="frond") for k in range(4)]), 0)
    G["seed_shrub"] = ("custom", lambda: cluster("#451f33", 9, 2.6, 11), 0)
    G["seed_tree"] = ("custom", lambda: spec({"w": M("#b18e59", 6, "organic"), "s": M("#563d20", 6, spec=1.0)},
                                            [poly(catmull([(10, 22), (6, 12), (8, 4), (13, 9), (13, 20)], 3, closed=True), "w", "wing1", 0, "ridge"), ell((11.5, 22), (3, 2.4), "s", "nut1", 1),
                                             poly(catmull([(20, 20), (24, 11), (29, 6), (27, 14), (23, 21)], 3, closed=True), "w", "wing2", 2, "ridge"), ell((21, 21.5), (3, 2.4), "s", "nut2", 3)]), 0)
    G["seed_cone"] = ("custom", lambda: spec({"c": M("#72502d", 7, "wood")},
                                            [stroke([(16, 3), (16, 7)], 1.2, "c", "stalk", 0)] +
                                            [ell((16 + (j - (2 - abs(r - 3) * 0.5) / 2) * 0, 8 + r * 3.2), (6.5 - abs(r - 2.5) * 1.2, 2.2), "c", f"row{r}", 1 + r, "bevel", bevel=1.2, bias=(0.6 if r % 2 else -0.3)) for r in range(6) for j in range(1)]), 0)
    G["seed_palm"] = ("custom", lambda: fruit_like("#99702a", 9, 9.5, False, 6, "fur", False), 0)
    G["seed_bulb"] = ("custom", lambda: spec({"b": M("#9d643b", 7, "organic"), "r": M("#c7b589", 5)},
                                            [poly(catmull([(16, 4), (19, 11), (24, 18), (22, 24), (10, 24), (8, 18), (13, 11)], 3, closed=True), "b", "bulb", 0, "dome", flow=[0, 1])] +
                                            [stroke([(13 + k * 2, 24), (12 + k * 2.6, 29)], 0.7, "r", f"root{k}", 1) for k in range(4)]), 0)
    G["seed_cactus"] = ("custom", lambda: spec({"p": M("#507858", 7, "organic"), "f": M("#bf6346", 6, "organic"), "s": M("#1e232c", 3)},
                                              [poly(catmull([(4, 20), (9, 11), (16, 9), (23, 11), (28, 18), (24, 24), (16, 22), (8, 24)], 3, closed=True), "p", "pod", 0, "dome"),
                                               poly(catmull([(9, 17), (15, 14), (22, 16), (21, 19.5), (15, 20.5), (9.5, 19.5)], 3, closed=True), "f", "flesh", 1, "flat", clip="pod")] +
                                              [ell((11 + k * 2.3, 17.5 + (k % 2)), (0.6, 0.6), "s", f"sd{k}", 2, "flat") for k in range(5)] + [ell((12 + k * 3, 27), (0.7, 0.6), "s", f"sp{k}", 2, "flat") for k in range(4)]), 0)
    G["seed_flower"] = ("custom", lambda: spec({"p": M("#bf6346", 7, "organic"), "d": M("#72502d", 7, "fur"), "s": M("#507858", 6)},
                                              [stroke([(16.5, 21), (17.5, 30)], 1.2, "s", "stem", 0)] +
                                              [poly(catmull([(16 + 4 * math.cos(a), 15 + 4 * math.sin(a)), (16 + 12 * math.cos(a + 0.25), 15 + 11 * math.sin(a + 0.25)), (16 + 12.5 * math.cos(a - 0.15), 15 + 11.5 * math.sin(a - 0.15))], 3, closed=True), "p", f"pt{k}", 1 + k * 0.01, "ridge")
                                               for k, a in enumerate([i / 9 * 2 * math.pi for i in range(9)])] +
                                              [ell((16, 15), (6.5, 6), "d", "disc", 3, "dome")]), 0)
    G["seed_trap"] = ("custom", lambda: spec({"p": M("#6b7d22", 7, "organic", spec=1.0), "r": M("#b0354a", 6, spec=1.0)},
                                            [ell((16, 18), (7.5, 10), "p", "pod", 0), stroke([(16, 9), (16, 28)], 0.6, "p", "seam", 1, "ridge", bias=-2, clip="pod"), ell((16, 8.5), (3.4, 2.4), "r", "seeds", 2), stroke([(16, 28), (16, 31)], 1.2, "p", "stalk", 0.5)]), 0)
    # ---- earth
    G["soil"] = ("custom", lambda: heap("#604b31", "organic", 1, "#6c6862"), 0)
    G["topsoil"] = ("custom", lambda: heap("#30251a", "organic", 2, None, sprout), 0)
    G["clay"] = ("custom", lambda: spec({"m": M("#9d643b", 7, "organic", contrast=1.2)}, box3(5, 9, 16, 11, 10, "m", "clay")), 0)
    G["sand"] = ("custom", lambda: heap("#c6ad7b", "organic", 3, None, None, 1.05), 0)
    G["gravel"] = ("custom", lambda: cluster("#6c6862", 11, 2.8, 13, None, "stone"), 0)
    G["peat"] = ("custom", lambda: spec({"m": M("#30251a", 7, "fur")}, box3(3, 18, 10, 6, 6, "m", "p1") + box3(15, 18, 10, 6, 6, "m", "p2") + box3(9, 9, 10, 6, 6, "m", "p3", 2)), 0)
    G["compost"] = ("custom", lambda: heap("#453624", "organic", 5, "#99702a"), 0)
    G["ash"] = ("custom", lambda: heap("#6c6862", "organic", 6, "#2f2e31"), 0)
    G["crushed_ore"] = ("custom", lambda: cluster("#625952", 12, 2.6, 17, None, "stone"), 0)
    # ---- refined and parts
    G["plank"] = ("custom", lambda: spec({"m": M("#bc913a", 7, "wood")}, sum([box3(3, 20 - k * 5.5, 22, 3, 6, "m", f"pk{k}", k) for k in range(3)], [])), 0)
    G["glass"] = ("custom", lambda: spec({"m": M("#92bca6", 6, "crystal", spec=1.0, spec_threshold=0.85)}, box3(4, 15, 20, 3, 12, "m", "gl0") + box3(5, 9, 18, 3, 11, "m", "gl1", 2)), 0)
    G["feed"] = ("custom", lambda: sack("#a99c51"), 0)
    G["powder"] = ("custom", lambda: can("#72502d", "#3d4346", None, True), 0)
    G["gold_leaf"] = ("custom", lambda: board("#4b2e6c", "#dcc066", "#2f2e31", "#dcc066"), 0)
    G["iron_plate"] = ("custom", lambda: plate_part("#6e7373"), 0)
    G["reinforced_plate"] = ("custom", lambda: spec({"m": M("#616436", 7, "metal", spec=1.0), "s": M("#8e9190", 6, "metal", spec=1.0)}, box3(4, 9, 20, 4, 14, "m", "rp") +
                                                    [stroke([(5, 23), (24, 13)], 1.4, "s", "x1", 3, "ridge"), stroke([(6, 14), (25, 22)], 1.4, "s", "x2", 3.1, "ridge")]), 0)
    G["grav_plate"] = ("custom", lambda: spec({"m": M("#6e7373", 7, "metal", spec=1.0), "g": M("#8a5ea8", 7, "crystal", emissive=0.4)}, box3(4, 10, 20, 4, 12, "m", "gp") + [poly([(8, 12), (22, 12), (19, 15), (6, 15)], "g", "inlay", 3, "flat")]), 0)
    G["iron_rod"] = ("custom", lambda: rods("#6e7373"), 0)
    G["screw"] = ("custom", lambda: spec({"m": M("#8e9190", 7, "metal", spec=1.0)}, [stroke([(12, 12), (26, 26)], 3.0, "m", "shank", 0, "cylinder", stripes={"from": [12, 12], "to": [26, 26], "period": 2.2, "duty": 0.5, "amount": 1.0}),
                                                                                   poly(blob(10, 10, 5.5, 5, rng(2), 0.05, 8), "m", "head", 1, "dome"), stroke([(7.5, 12.5), (12.5, 7.5)], 0.8, "m", "slot", 2, bias=-3, clip="head")]), 0)
    G["gear"] = ("custom", gear, 0)
    G["copper_wire"] = ("custom", lambda: spool("#bc913a", "#b8703a"), 0)
    G["cable"] = ("custom", lambda: spec({"m": M("#2f2e31", 6, "leather", spec=1.0), "c": M("#b8703a", 6, "metal", spec=1.0)},
                                        [stroke(catmull([(16 + 11 * math.cos(a), 16 + 8 * math.sin(a)) for a in np.linspace(0, 5.6, 9)], 3), 2.4, "m", "coil", 0, flow=[1, 0])] +
                                        [stroke(catmull([(16 + 6 * math.cos(a), 16 + 4.5 * math.sin(a)) for a in np.linspace(0.6, 6, 7)], 3), 2.2, "m", "coil2", 1), ell((27, 21), (1.3, 1.1), "c", "end", 2)]), 0)
    G["steel_beam"] = ("custom", lambda: spec({"m": M("#566f79", 7, "metal", spec=1.0)}, box3(3, 6, 22, 2.2, 8, "m", "fl1") + box3(10, 9, 8, 10, 2, "m", "web", 1) + box3(3, 19, 22, 2.2, 8, "m", "fl2", 2)), 0)
    G["rotor"] = ("custom", lambda: spec({"a": M("#8e9190", 6, "metal", spec=1.0), "c": M("#b8703a", 7, "metal", spec=1.0)},
                                        [stroke([(3, 26), (29, 6)], 2.2, "a", "axle", 0)] + [poly(blob(9 + k * 4, 20.5 - k * 3.2, 3.6, 4.6, rng(k + 3), 0.05, 8), "c", f"lam{k}", 1 + k * 0.1, "cylinder") for k in range(4)]), 0)
    G["frame"] = ("custom", lambda: spec({"m": M("#6e7373", 7, "metal", spec=1.0)}, [stroke([a, b], 1.8, "m", f"e{i}", i * 0.1, "ridge") for i, (a, b) in enumerate([((4, 12), (16, 6)), ((16, 6), (28, 12)), ((28, 12), (16, 18)), ((16, 18), (4, 12)),
                                                                                                                                            ((4, 12), (4, 22)), ((16, 18), (16, 28)), ((28, 12), (28, 22)), ((4, 22), (16, 28)), ((16, 28), (28, 22)), ((4, 12), (16, 28)), ((28, 12), (16, 28))])]), 0)
    G["heavy_frame"] = ("custom", lambda: spec({"m": M("#3f5362", 7, "metal", spec=1.0), "h": M("#b27d34", 5), "k": M("#2a323e", 4)}, box3(3, 7, 20, 13, 10, "m", "hf") +
                                              [poly([(3, 26), (23, 26), (23, 29), (3, 29)], "h", "haz", 3, "flat", stripes={"from": [3, 26], "to": [23, 29], "period": 4, "duty": 0.5, "amount": 2.5, "slant": 1})]), 0)
    G["circuit"] = ("custom", lambda: board("#7f4b2c", "#c36530"), 0)
    G["precision_circuit"] = ("custom", lambda: board("#2b5550", "#dcc066", "#2f2e31", "#dcc066"), 0)
    G["vacuum_tube"] = ("custom", lambda: tube_part(), 0)
    G["motor"] = ("custom", lambda: spec({"m": M("#616436", 7, "metal", spec=1.0), "s": M("#8e9190", 6, "metal", spec=1.0), "k": M("#2f2e31", 4)},
                                        [poly([(4, 9), (22, 9), (22, 25), (4, 25)], "m", "body", 0, "cylinder", flow=[0, 1], stripes={"from": [4, 9], "to": [22, 9], "period": 3, "duty": 0.5, "amount": 0.7}),
                                         ell((22, 17), (3, 8), "m", "cap", 1, "dome", bias=0.5), stroke([(24, 17), (29, 17)], 1.6, "s", "shaft", 2), poly([(2, 25), (24, 25), (24, 28), (2, 28)], "k", "foot", 3, "flat")]), 0)
    G["ammo"] = ("custom", lambda: spec({"b": M("#b38737", 7, "metal", spec=1.0), "c": M("#b8703a", 7, "metal", spec=1.0)},
                                       sum([[poly([(5 + k * 8, 13), (11 + k * 8, 13), (11 + k * 8, 28), (5 + k * 8, 28)], "b", f"case{k}", k, "cylinder", flow=[0, 1]),
                                             poly(catmull([(5 + k * 8, 13.5), (6 + k * 8, 7), (8 + k * 8, 4), (10 + k * 8, 7), (11 + k * 8, 13.5)], 3), "c", f"bul{k}", k + 0.1, "cylinder", flow=[0, 1])] for k in range(3)], [])), 0)
    G["servo"] = ("custom", lambda: spec({"m": M("#7b7e48", 7, "metal", spec=1.0), "s": M("#8e9190", 6, "metal", spec=1.0), "r": M("#b13c2b", 4, emissive=0.6)}, box3(4, 11, 16, 12, 8, "m", "sv") +
                                        [ell((14, 9), (6, 2.6), "s", "horn", 4, "bevel"), ell((14, 8.5), (1.2, 0.8), "m", "hub", 5, "flat"), ell((8, 20), (1, 1), "r", "led", 5, "flat")]), 0)
    G["control_unit"] = ("custom", lambda: spec({"m": M("#616436", 7, "metal"), "scr": M("#3e7a6c", 6, emissive=0.7), "b": M("#b38737", 5, "metal", spec=1.0), "r": M("#b13c2b", 4, emissive=0.6)}, box3(3, 8, 20, 14, 9, "m", "cu") +
                                               [poly([(6, 17), (14, 17), (14, 24), (6, 24)], "scr", "screen", 4, "flat"), ell((18, 19), (1.2, 1.2), "b", "k1", 4, "dome"), ell((18, 23), (1.2, 1.2), "r", "k2", 4, "dome")]), 0)
    G["reactor_core"] = ("custom", lambda: spec({"m": M("#54595c", 7, "metal", spec=1.0), "g": M("#62a88f", 6, emissive=0.9), "a": M("#b27d34", 5)},
                                               [poly([(10, 3), (22, 3), (22, 29), (10, 29)], "m", "rod", 0, "cylinder", flow=[0, 1]), poly([(12.5, 8), (19.5, 8), (19.5, 24), (12.5, 24)], "g", "core", 1, "cylinder"),
                                                poly([(10, 5), (22, 5), (22, 7), (10, 7)], "a", "band1", 2, "cylinder"), poly([(10, 25), (22, 25), (22, 27), (10, 27)], "a", "band2", 2, "cylinder")]), 0)
    G["report"] = ("custom", lambda: spec({"p": M("#d6cab0", 6, "cloth"), "i": M("#2a323e", 3), "s": M("#8c2920", 5)},
                                         [poly([(6, 4), (24, 3), (26, 28), (8, 29)], "p", "sheet", 0, "pillow", bevel=1.5)] + [stroke([(9, 8 + k * 3), (20 - (k % 3) * 2, 7.6 + k * 3)], 0.6, "i", f"ln{k}", 1, "flat", clip="sheet") for k in range(6)] +
                                         [poly(blob(19, 23, 4, 3, rng(3), 0.1, 8), "s", "stamp", 2, "flat")]), 0)
    G["tape"] = ("custom", lambda: spec({"m": M("#8e9190", 7, "metal", spec=1.0), "t": M("#2f2e31", 5, "leather")},
                                       [ell((16, 16), (12.5, 12.5), "m", "reel", 0, "bevel", bevel=2), ell((16, 16), (9.5, 9.5), "t", "tape", 1, "cylinder"), ell((16, 16), (3, 3), "m", "hub", 2, "dome")] +
                                       [ell((16 + 6 * math.cos(a), 16 + 6 * math.sin(a)), (1.4, 1.4), "m", f"win{i}", 1.5, "flat", bias=-2) for i, a in enumerate([0.5, 2.6, 4.7])]), 0)
    G["lumen_cell"] = ("custom", lambda: spec({"m": M("#54595c", 7, "metal", spec=1.0), "b": M("#b38737", 6, "metal", spec=1.0), "g": M("#95ccb0", 6, emissive=1.0)},
                                             [poly([(9, 5), (23, 5), (23, 28), (9, 28)], "m", "body", 0, "cylinder"), poly([(12, 10), (20, 10), (20, 23), (12, 23)], "g", "win", 1, "dome"),
                                              poly([(9, 4), (23, 4), (23, 7), (9, 7)], "b", "cap1", 2, "cylinder"), poly([(9, 26), (23, 26), (23, 29), (9, 29)], "b", "cap2", 2, "cylinder"), poly([(14, 1.5), (18, 1.5), (18, 4), (14, 4)], "b", "term", 3)]), 0)
    G["grav_coil"] = ("custom", lambda: spec({"g": M("#66408a", 7, "crystal", emissive=0.4), "c": M("#b8703a", 7, "metal", spec=1.0), "m": M("#6e7373", 6, "metal")},
                                            [poly([(13, 4), (19, 4), (19, 28), (13, 28)], "g", "core", 0, "cylinder")] + [ell((16, 8.5 + k * 3), (6.5, 1.8), "c", f"turn{k}", 1 + k * 0.01, "cylinder") for k in range(6)] +
                                            [poly([(8, 3), (24, 3), (24, 6), (8, 6)], "m", "fl1", 2, "bevel"), poly([(8, 26), (24, 26), (24, 29), (8, 29)], "m", "fl2", 2, "bevel")]), 0)
    return G


# ------------------------------------------------------------------ palette snapping
def master_palette():
    src = open(os.path.join(ROOT, "src/art/palette.ts")).read()
    body = src[src.index("export const RAMPS"):src.index("} as const")]
    cols = sorted(set(int(h, 16) for h in re.findall(r"#([0-9a-fA-F]{6})", body)))
    return np.array([[(c >> 16) & 255, (c >> 8) & 255, c & 255] for c in cols], float), cols


def snap(img, P):
    a = np.asarray(img.convert("RGBA")).astype(float)
    rgb, al = a[..., :3], a[..., 3]
    flat = rgb.reshape(-1, 3)
    rm = (flat[:, None, 0] + P[None, :, 0]) / 2
    d = (2 + rm / 256) * (flat[:, None, 0] - P[None, :, 0]) ** 2 + 4 * (flat[:, None, 1] - P[None, :, 1]) ** 2 + (2 + (255 - rm) / 256) * (flat[:, None, 2] - P[None, :, 2]) ** 2
    idx = d.argmin(1).reshape(al.shape)
    idx[al < 128] = 255
    return idx.astype(np.uint8)


def render(entry):
    kind, params, seed = entry
    if kind == "custom":
        sp = params()
        _, im = make(sp, seed=seed)
    else:
        _, im = make(kind, seed=seed, size=S, **params)
    if im.size != (S, S):
        im = im.resize((S, S), Image.NEAREST)
    return im


def shrink_render(url, W, H, P):
    """a real 3D render (a PNG data URL, transparent ground) made into pixel art: cropped to the model, fitted (aspect
    kept) inside W x H with a pixel clear, shrunk with a box filter on premultiplied colour, lifted a touch, the alpha
    cut, snapped to the palette (indices, 255 = clear) and ringed with a dark ink outline"""
    import base64, io
    big = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGBA")
    x0, y0, x1, y1 = big.getbbox()
    big = big.crop((x0, y0, x1, y1))
    a = np.asarray(big).astype(float)
    a[..., :3] *= a[..., 3:4] / 255
    k = min((W - 2) / big.width, (H - 2) / big.height)
    w, h = max(1, round(big.width * k)), max(1, round(big.height * k))
    small = np.asarray(Image.fromarray(a.astype(np.uint8), "RGBA").resize((w, h), Image.BOX)).astype(float)
    sm = np.zeros((H, W, 4), float)
    ox, oy = (W - w) // 2, (H - h) // 2
    sm[oy:oy + h, ox:ox + w] = small
    al = sm[..., 3]
    rgb = np.where(al[..., None] > 0, sm[..., :3] * 255 / np.maximum(al[..., None], 1), 0)
    rgb = np.clip((rgb - 128) * 1.12 + 132, 0, 255)
    hsv = np.asarray(Image.fromarray(rgb.astype(np.uint8), "RGB").convert("HSV")).astype(float)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.15, 0, 255)
    im = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
    idx = snap(Image.merge("RGBA", (*im.split(), Image.fromarray(np.where(al > 110, 255, 0).astype(np.uint8)))), P)
    solid = idx != 255
    edge = np.zeros_like(solid)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        edge |= np.roll(np.roll(solid, dy, 0), dx, 1) & ~solid
    ink = int(np.argmin(((P - np.array([19, 22, 28])) ** 2).sum(1)))
    idx[edge] = ink
    return idx


# item sprites that are renders of real Poly Haven models (CREDITS.md); a full regeneration keeps them
REAL_IDS = {"concrete", "compost", "rock_granite", "plastic", "bio_oil"}


def real(path, out):
    """item sprites from renders of real models (`?test=inv&icons&glb=id=url,...`): patched into itemSprites.ts"""
    import json
    P, cols = master_palette()
    renders = json.load(open(path))
    src = open(out).read()
    for id_, url in renders.items():
        idx = shrink_render(url, S, S, P)
        line = f"  {id_}: '{base64.b64encode(idx.astype(np.uint8).tobytes()).decode()}',"
        src, n = re.subn(rf"^  {id_}: '[^']*',$", line, src, flags=re.M)
        if not n:
            src = src.replace("\n};\n", "\n" + line + "\n};\n")
        print("real", id_)
    open(out, "w").write(src)


def main():
    if "--real" in sys.argv:
        return real(sys.argv[sys.argv.index("--real") + 1], os.path.join(ROOT, "src/inv/itemSprites.ts"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default=os.path.join(ROOT, "src/inv/itemSprites.ts"))
    a = ap.parse_args()
    G = catalogue()
    ids = [i for i in (a.only.split(",") if a.only else G.keys())]
    P, cols = master_palette()
    out, ims = {}, []
    for id_ in ids:
        try:
            im = render(G[id_])
        except Exception as e:  # report and keep going
            print("FAIL", id_, repr(e)[:200])
            continue
        idx = snap(im, P)
        out[id_] = idx
        ims.append((id_, idx))
    if a.sheet:
        n = len(ims); cols_n = 14; rows = math.ceil(n / cols_n); k = 3
        sh = Image.new("RGBA", (cols_n * (S * k + 6), rows * (S * k + 6)), (21, 24, 28, 255))
        pal = np.array([[(c >> 16) & 255, (c >> 8) & 255, c & 255, 255] for c in cols] + [[0, 0, 0, 0]] * (256 - len(cols)), np.uint8)
        for i, (id_, idx) in enumerate(ims):
            rgba = pal[idx]
            tile = Image.fromarray(rgba, "RGBA").resize((S * k, S * k), Image.NEAREST)
            sh.alpha_composite(tile, ((i % cols_n) * (S * k + 6) + 3, (i // cols_n) * (S * k + 6) + 3))
        sh.save(a.sheet)
        print("sheet", a.sheet, n)
    if not a.only:
        lines = ["// GENERATED by src/inv/sprites/make_items.py with the user's lowpix tool (sprite generators and specs, stroke",
                 "// painter, 32 x 32), snapped to the master palette. Do not edit by hand: change the specs and run the script.",
                 f"export const SPRITE_SIZE = {S};",
                 "export const SPRITE_PAL: number[] = [" + ", ".join("0x%06x" % c for c in cols) + "];",
                 "/** item id -> base64 of SPRITE_SIZE^2 palette indices (255 = clear) */",
                 "export const SPRITES: Record<string, string> = {"]
        old = open(a.out).read() if os.path.exists(a.out) else ""
        for id_, idx in out.items():
            keep = re.search(rf"^  {id_}: '[^']*',$", old, re.M) if id_ in REAL_IDS else None  # renders of real models stay
            lines.append(keep.group(0) if keep else f"  {id_}: '{base64.b64encode(idx.tobytes()).decode()}',")
        lines.append("};")
        open(a.out, "w").write("\n".join(lines) + "\n")
        print("wrote", a.out, len(out))


if __name__ == "__main__":
    main()

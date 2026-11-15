# The hand-drawn UI pieces (paper cards, tabs, chits, luggage tags, tape, pins) painted with lowpix's stroke brush.
#   python3 src/ui/build/craft/make_craft.py   (run with the lowpix repo at /home/user/pukkingdragon123/symmetrical-goggles)
import glob, json, os, subprocess, sys
import tempfile
D = tempfile.mkdtemp()
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'public', 'ui', 'craft')
PAPER = {"base": "#e4dabd", "steps": 4, "hue_shift": 6, "spread": 0.14, "texture": "cloth", "contrast": 0.1}
def wob(pts, seed, amt=0.6):
  import random; r = random.Random(seed)
  return [[round(x + (r.random() - 0.5) * amt * 2), round(y + (r.random() - 0.5) * amt * 2)] for x, y in pts]
def rect(w, h, m=2, seed=1):
  pts = []
  for i in range(5): pts.append([m + (w - 2 * m) * i / 4, m])
  for i in range(1, 5): pts.append([w - m, m + (h - 2 * m) * i / 4])
  for i in range(1, 5): pts.append([w - m - (w - 2 * m) * i / 4, h - m])
  for i in range(1, 4): pts.append([m, h - m - (h - 2 * m) * i / 4])
  return wob(pts, seed)
def sprite(name, size, shapes, outline_color="#221d19", mats=None, outline="black"):
  spec = {"size": size, "paint": "strokes", "light": [-0.6, -0.8, 0.5],
          "materials": {"paper": PAPER, "paper2": {"base": "#f0e8d2", "steps": 4, "spread": 0.12, "texture": "cloth", "contrast": 0.08},
                        "kraft": {"base": "#b98f5c", "steps": 5, "spread": 0.22, "texture": "cloth", "contrast": 0.18},
                        "tape": {"base": "#e8dca0", "steps": 4, "spread": 0.2, "contrast": 0.25},
                        "red": {"base": "#b8382e", "steps": 5, "spec": 1}, "steel": {"base": "#9aa3ab", "steps": 5, "spec": 1},
                        "ink": {"ramp": ["#1d1a17", "#2b2622", "#3b342e"]}, **(mats or {})},
          "shapes": shapes, "outline": outline, "outline_color": outline_color, "outline_corners": True}
  p = os.path.join(D, name + '.json'); json.dump(spec, open(p, 'w'))
  subprocess.run([sys.executable, '-m', 'lowpix', 'sprite', p, '-o', os.path.join(OUT, name + '.png')], cwd='/home/user/pukkingdragon123/symmetrical-goggles', check=True, capture_output=True)
poly = lambda pts, mat, **k: {"type": "polygon", "points": pts, "material": mat, "form": k.pop("form", "pillow"), "bevel": k.pop("bevel", 2), **k}
# a card: paper, inked outline (9-sliced at 12 art px)
sprite('card', [48, 48], [poly(rect(48, 48, 2, 3), 'paper', part='card')])
sprite('card-hi', [48, 48], [poly(rect(48, 48, 2, 3), 'paper2', part='card')])
sprite('card-sel', [48, 48], [poly(rect(48, 48, 2, 3), 'paper2', part='card')], outline_color='#a8321f')
sprite('card-lock', [48, 48], [poly(rect(48, 48, 2, 3), 'kraft', part='card')], outline_color='#4a3a2a')
# a big sheet for the inspector and the guide
sprite('sheet', [96, 96], [poly(rect(96, 96, 2, 9), 'paper', part='s', bevel=3)])
# tabs (category keys), plain and pressed
tab = [[3, 30], [6, 4], [12, 2], [52, 2], [58, 4], [61, 30]]
sprite('tab', [64, 32], [poly(wob(tab, 4, 0.5), 'kraft', part='t')])
sprite('tab-on', [64, 32], [poly(wob(tab, 4, 0.5), 'paper2', part='t')], outline_color='#a8321f')
# a chit (small buttons) and a pressed chit
sprite('chit', [24, 24], [poly(rect(24, 24, 1, 6), 'paper', part='c', bevel=1)])
sprite('chit-on', [24, 24], [poly(rect(24, 24, 1, 6), 'red', part='c', bevel=1)], outline_color='#3a0e0a')
# a luggage tag (route plates on the node map)
tag = [[7, 2], [44, 2], [46, 4], [46, 20], [44, 22], [7, 22], [2, 12]]
sprite('tag', [48, 24], [poly(wob(tag, 7, 0.4), 'paper', part='g', bevel=1), {"type": "ellipse", "center": [9, 12], "radii": [1.6, 1.6], "material": "ink", "form": "flat", "part": "h"}])
sprite('tag-am', [48, 24], [poly(wob(tag, 7, 0.4), 'tape', part='g', bevel=1), {"type": "ellipse", "center": [9, 12], "radii": [1.6, 1.6], "material": "ink", "form": "flat", "part": "h"}], outline_color='#7a4a10')
# tape and a pin
sprite('tape', [32, 12], [poly(wob([[1, 3], [30, 1], [31, 9], [2, 11]], 2, 0.4), 'tape', part='t', bevel=1)], outline_color='#a8996a')
sprite('pin', [14, 14], [{"type": "ellipse", "center": [7, 6], "radii": [4.5, 4.5], "material": "red", "form": "dome", "part": "p"}, {"type": "stroke", "points": [[7, 10], [8, 13]], "width": 1, "material": "steel", "form": "cylinder", "part": "n"}])
print('ok')

# ---- v2 materials (UI REFINED): the planner is an engineer's steel drawer with stamped tabs and blueprint-cloth cards;
# the node map is a cork board. Rivets sit in the 9-slice corners so they never repeat.
STEEL = {"steel_d": {"base": "#5d6873", "steps": 6, "spread": 0.3, "texture": "metal", "contrast": 0.35, "hue_shift": 10},
         "steel_l": {"base": "#9aa6b0", "steps": 6, "spread": 0.25, "texture": "metal", "contrast": 0.3, "hue_shift": 10},
         "rivet": {"base": "#b8c2ca", "steps": 4, "spec": 1},
         "blue": {"base": "#2c5687", "steps": 5, "spread": 0.18, "texture": "cloth", "contrast": 0.22, "hue_shift": 6},
         "blue_l": {"base": "#3a6aa0", "steps": 5, "spread": 0.18, "texture": "cloth", "contrast": 0.22, "hue_shift": 6},
         "blue_k": {"base": "#3d4f63", "steps": 5, "spread": 0.18, "texture": "cloth", "contrast": 0.22, "hue_shift": 6},
         "enamel": {"base": "#e9e2cc", "steps": 4, "spread": 0.16, "texture": "stone", "contrast": 0.16},
         "enamel_r": {"base": "#b23a2c", "steps": 4, "spread": 0.2, "texture": "stone", "contrast": 0.2},
         "brass": {"base": "#b8903a", "steps": 5, "spec": 1, "texture": "metal"},
         "cork": {"base": "#b07a46", "steps": 6, "spread": 0.45, "texture": "organic", "contrast": 0.7, "hue_shift": 12},
         "felt": {"base": "#3f6b3a", "steps": 5, "spread": 0.3, "texture": "cloth", "contrast": 0.4}}
def rivets(w, h, m=4, r=1.6):
  return [{"type": "ellipse", "center": [x, y], "radii": [r, r], "material": "rivet", "form": "dome", "part": "r%d" % i}
          for i, (x, y) in enumerate([(m, m), (w - m - 1, m), (m, h - m - 1), (w - m - 1, h - m - 1)])]
# the drawer: dark brushed steel, riveted
sprite('drawer', [64, 64], [poly(rect(64, 64, 1, 11), 'steel_d', part='d', bevel=3, form='flat', flow=[1, 0]), *rivets(64, 64, 5, 1.8)], mats=STEEL, outline_color='#1b2026')
# a lighter steel plate (strips, the hotbar rail, key caps)
sprite('plate', [32, 32], [poly(rect(32, 32, 1, 12), 'steel_l', part='p', bevel=2, form='flat', flow=[1, 0]), *rivets(32, 32, 3, 1.2)], mats=STEEL, outline_color='#1b2026')
# stamped index tabs
stab = [[2, 31], [4, 6], [9, 2], [55, 2], [60, 6], [62, 31]]
sprite('tab-steel', [64, 32], [poly(wob(stab, 5, 0.3), 'steel_d', part='t', bevel=2, form='flat', flow=[1, 0])], mats=STEEL, outline_color='#1b2026')
sprite('tab-steel-on', [64, 32], [poly(wob(stab, 5, 0.3), 'steel_l', part='t', bevel=2, form='flat', flow=[1, 0])], mats=STEEL, outline_color='#1b2026')
# blueprint cloth cards (weave)
sprite('blue', [48, 48], [poly(rect(48, 48, 2, 3), 'blue', part='c', bevel=1, form='flat')], mats=STEEL, outline_color='#13263d')
sprite('blue-hi', [48, 48], [poly(rect(48, 48, 2, 3), 'blue_l', part='c', bevel=1, form='flat')], mats=STEEL, outline_color='#13263d')
sprite('blue-sel', [48, 48], [poly(rect(48, 48, 2, 3), 'blue_l', part='c', bevel=1, form='flat')], mats=STEEL, outline_color='#f0c24a')
sprite('blue-lock', [48, 48], [poly(rect(48, 48, 2, 3), 'blue_k', part='c', bevel=1, form='flat')], mats=STEEL, outline_color='#1b2026')
sprite('blue-sheet', [96, 96], [poly(rect(96, 96, 2, 9), 'blue', part='s', bevel=1, form='flat')], mats=STEEL, outline_color='#13263d')
# enamel buttons, chipped
sprite('enamel', [24, 24], [poly(rect(24, 24, 1, 6), 'enamel', part='c', bevel=1)], mats=STEEL, outline_color='#1b2026')
sprite('enamel-on', [24, 24], [poly(rect(24, 24, 1, 6), 'enamel_r', part='c', bevel=1)], mats=STEEL, outline_color='#3a0e0a')
# brass badge for gadgets and a felt patch for fields (node map)
sprite('badge', [24, 24], [{"type": "ellipse", "center": [11.5, 11.5], "radii": [10.5, 10.5], "material": "brass", "form": "dome", "part": "b"}], mats=STEEL, outline_color='#3a2a10')
sprite('felt', [32, 32], [poly(wob([[3, 6], [10, 2], [24, 3], [30, 10], [29, 24], [21, 30], [8, 29], [2, 20]], 3, 0.5), 'felt', part='f', bevel=2)], mats=STEEL, outline_color='#1d2a18')
# cork: lowpix's brush quantises granular noise along a swirling flow onto a cork ramp; mirrored to a seamless tile
sys.path.insert(0, '/home/user/pukkingdragon123/symmetrical-goggles')
import numpy as np
from PIL import Image
from lowpix import brush, palette
rng = np.random.default_rng(7); N = 160
def soft(a, r):
  for _ in range(r): a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
  return a
T = soft(rng.random((N, N)), 1) * 0.6 + soft(rng.random((N, N)), 4) * 2.2 + rng.random((N, N)) * 0.5
T = (T - T.min()) / (T.max() - T.min()) * 5.2
ang = soft(rng.random((N, N)) * 6.283, 6)
# periodic fields, painted on a 3 x 3 repeat and cropped from the middle: a seamless tile
T3, a3 = np.tile(T, (3, 3)), np.tile(ang, (3, 3))
F = np.dstack([np.cos(a3 * 3), np.sin(a3 * 3)])
lab = np.zeros(T3.shape, int)
idx = brush.quantise(T3, lab, F, rng, 0, 5, length=2.5, rough=0.7, width=1.0, marks=[(lab >= 0, 'stone')], mark_scale=1.4)[N:2 * N, N:2 * N]
ramp = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in palette.make_ramp('#9c6b3c', 6, hue_shift=12, spread=0.42)], np.uint8)
Image.fromarray(ramp[idx], 'RGB').save(os.path.join(OUT, 'cork.png'))
for j in glob.glob(os.path.join(OUT, '*.json')): os.remove(j)
print('ok v2')

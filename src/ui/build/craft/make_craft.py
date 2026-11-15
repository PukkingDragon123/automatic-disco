# The UI's machined pieces, painted as CLEAN pixel art with lowpix's `flat` finish (per-pixel quantised light, straight
# edges, crisp outlines; no brush strokes, no wobble):
#   python3 src/ui/build/craft/make_craft.py   (run with the lowpix repo at /home/user/pukkingdragon123/symmetrical-goggles)
# The planner is a chunky steel drawer (riveted dark steel, stamped steel tabs, enamel buttons) holding clean blueprint
# cards; the node map is a machined patch bay (bay.png, a steel panel tile with seams and screws). The paper pieces
# (card, sheet, chit, tag) stay for the factory forms, painted the same clean way. All 9-sliced at 2 screen px per art px.
import glob, json, os, subprocess, sys
import tempfile
D = tempfile.mkdtemp()
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'public', 'ui', 'craft')
MATS = {
  "paper": {"base": "#e4dabd", "steps": 4, "spread": 0.18},
  "paper2": {"base": "#f0e8d2", "steps": 4, "spread": 0.16},
  "kraft": {"base": "#b98f5c", "steps": 4, "spread": 0.25},
  "tape": {"base": "#e8dca0", "steps": 3, "spread": 0.2},
  "red": {"base": "#b8382e", "steps": 5, "spec": 1},
  "steel": {"base": "#9aa3ab", "steps": 5, "spec": 1},
  "steel_d": {"base": "#566270", "steps": 5, "spread": 0.35, "spec": 1},
  "steel_l": {"base": "#98a4ae", "steps": 5, "spread": 0.3, "spec": 1},
  "rivet": {"base": "#c4ccd2", "steps": 4, "spec": 1},
  "blue": {"base": "#2b5b8f", "steps": 3, "spread": 0.12},
  "blue_l": {"base": "#356aa3", "steps": 3, "spread": 0.12},
  "blue_k": {"base": "#3b4a5c", "steps": 3, "spread": 0.12},
  "enamel": {"base": "#e9e2cc", "steps": 4, "spread": 0.2},
  "enamel_r": {"base": "#b23a2c", "steps": 4, "spread": 0.25},
  "brass": {"base": "#b8903a", "steps": 5, "spec": 1},
  "ink": {"ramp": ["#1d1a17", "#2b2622", "#3b342e"]},
}


def sprite(name, size, shapes, outline_color="#1b2026", outline="black"):
  spec = {"size": size, "paint": "flat", "light": [-0.6, -0.8, 0.5], "materials": MATS, "shapes": shapes,
          "outline": outline, "outline_color": outline_color, "outline_corners": False}
  p = os.path.join(D, name + '.json'); json.dump(spec, open(p, 'w'))
  subprocess.run([sys.executable, '-m', 'lowpix', 'sprite', p, '-o', os.path.join(OUT, name + '.png')], cwd='/home/user/pukkingdragon123/symmetrical-goggles', check=True, capture_output=True)


def box(w, h, m=1):
  return [[m, m], [w - 1 - m, m], [w - 1 - m, h - 1 - m], [m, h - 1 - m]]


poly = lambda pts, mat, **k: {"type": "polygon", "points": pts, "material": mat, "form": k.pop("form", "pillow"), "bevel": k.pop("bevel", 2), **k}


def rivets(w, h, m=4, r=1.6):
  return [{"type": "ellipse", "center": [x, y], "radii": [r, r], "material": "rivet", "form": "dome", "part": "r%d" % i}
          for i, (x, y) in enumerate([(m, m), (w - m - 1, m), (m, h - m - 1), (w - m - 1, h - m - 1)])]


# ---- paper pieces for the factory forms (clean, straight-edged)
sprite('card', [48, 48], [poly(box(48, 48), 'paper', part='c', bevel=1, form='flat')], outline_color='#2b2622')
sprite('card-hi', [48, 48], [poly(box(48, 48), 'paper2', part='c', bevel=1, form='flat')], outline_color='#2b2622')
sprite('card-sel', [48, 48], [poly(box(48, 48), 'paper2', part='c', bevel=1, form='flat')], outline_color='#a8321f')
sprite('card-lock', [48, 48], [poly(box(48, 48), 'kraft', part='c', bevel=1, form='flat')], outline_color='#4a3a2a')
sprite('sheet', [96, 96], [poly(box(96, 96), 'paper', part='s', bevel=1, form='flat')], outline_color='#2b2622')
tab = [[3, 31], [5, 3], [9, 1], [54, 1], [58, 3], [60, 31]]
sprite('tab', [64, 32], [poly(tab, 'kraft', part='t', bevel=2)], outline_color='#2b2622')
sprite('tab-on', [64, 32], [poly(tab, 'paper2', part='t', bevel=2)], outline_color='#a8321f')
sprite('chit', [24, 24], [poly(box(24, 24), 'enamel', part='c', bevel=2)])
sprite('chit-on', [24, 24], [poly(box(24, 24), 'enamel_r', part='c', bevel=2)], outline_color='#3a0e0a')
tg = [[7, 2], [45, 2], [45, 21], [7, 21], [2, 12]]
sprite('tag', [48, 24], [poly(tg, 'paper', part='g', bevel=1), {"type": "ellipse", "center": [9, 12], "radii": [1.6, 1.6], "material": "ink", "form": "flat", "part": "h"}], outline_color='#2b2622')
sprite('tag-am', [48, 24], [poly(tg, 'tape', part='g', bevel=1), {"type": "ellipse", "center": [9, 12], "radii": [1.6, 1.6], "material": "ink", "form": "flat", "part": "h"}], outline_color='#7a4a10')
sprite('tape', [32, 12], [poly(box(32, 12, 1), 'tape', part='t', bevel=1)], outline_color='#a8996a')
sprite('pin', [14, 14], [{"type": "ellipse", "center": [7, 7], "radii": [4.5, 4.5], "material": "rivet", "form": "dome", "part": "p"}])
# ---- the planner: a chunky steel drawer, stamped tabs, enamel buttons, clean blueprint cards
sprite('drawer', [64, 64], [poly(box(64, 64), 'steel_d', part='d', bevel=5), *rivets(64, 64, 7, 2.6)])
sprite('plate', [32, 32], [poly(box(32, 32), 'steel_l', part='p', bevel=3), *rivets(32, 32, 4, 1.6)])
stab = [[2, 31], [3, 4], [7, 1], [56, 1], [60, 4], [61, 31]]
sprite('tab-steel', [64, 32], [poly(stab, 'steel_d', part='t', bevel=4)])
sprite('tab-steel-on', [64, 32], [poly(stab, 'steel_l', part='t', bevel=4)])
sprite('blue', [48, 48], [poly(box(48, 48), 'blue', part='c', bevel=1, form='flat')], outline_color='#0f2238')
sprite('blue-hi', [48, 48], [poly(box(48, 48), 'blue_l', part='c', bevel=1, form='flat')], outline_color='#0f2238')
sprite('blue-sel', [48, 48], [poly(box(48, 48), 'blue_l', part='c', bevel=1, form='flat')], outline_color='#f0c24a')
sprite('blue-lock', [48, 48], [poly(box(48, 48), 'blue_k', part='c', bevel=1, form='flat')])
sprite('blue-sheet', [96, 96], [poly(box(96, 96), 'blue', part='s', bevel=1, form='flat')], outline_color='#0f2238')
sprite('enamel', [24, 24], [poly(box(24, 24), 'enamel', part='c', bevel=2)])
sprite('enamel-on', [24, 24], [poly(box(24, 24), 'enamel_r', part='c', bevel=2)], outline_color='#3a0e0a')
sprite('badge', [24, 24], [{"type": "ellipse", "center": [11.5, 11.5], "radii": [10.5, 10.5], "material": "brass", "form": "dome", "part": "b"}], outline_color='#3a2a10')
# ---- the node map: a machined patch bay (a 64 art px steel panel with its seams and four screws; it tiles)
sprite('bay', [64, 64], [poly([[0, 0], [63, 0], [63, 63], [0, 63]], 'steel_d', part='b', bevel=3), *rivets(64, 64, 4, 1.8)], outline_color='#14181d')
# ---- the node map's side panels: light steel plates (same slicing as the paper card and sheet)
MATS["steel_hi"] = {"base": "#a9b4bd", "steps": 5, "spread": 0.3, "spec": 1}
MATS["steel_k"] = {"base": "#6a7480", "steps": 5, "spread": 0.3, "spec": 1}
sprite('steel-card', [48, 48], [poly(box(48, 48), 'steel_l', part='c', bevel=3), *rivets(48, 48, 5, 1.6)])
sprite('steel-card-hi', [48, 48], [poly(box(48, 48), 'steel_hi', part='c', bevel=3), *rivets(48, 48, 5, 1.6)])
sprite('steel-card-sel', [48, 48], [poly(box(48, 48), 'steel_hi', part='c', bevel=3), *rivets(48, 48, 5, 1.6)], outline_color='#e0a020')
sprite('steel-card-lock', [48, 48], [poly(box(48, 48), 'steel_k', part='c', bevel=3), *rivets(48, 48, 5, 1.6)])
sprite('steel-sheet', [96, 96], [poly(box(96, 96), 'steel_l', part='s', bevel=4), *rivets(96, 96, 6, 2.0)])
for j in glob.glob(os.path.join(OUT, '*.json')):
  os.remove(j)
for old in ('cork.png', 'felt.png'):
  if os.path.exists(os.path.join(OUT, old)):
    os.remove(os.path.join(OUT, old))
print('ok')

# The hand-drawn UI pieces (paper cards, tabs, chits, luggage tags, tape, pins) painted with lowpix's stroke brush.
#   python3 src/ui/build/craft/make_craft.py   (run with the lowpix repo at /home/user/pukkingdragon123/symmetrical-goggles)
import json, os, subprocess, sys
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

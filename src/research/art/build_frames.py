"""Hand-drawn frames for the progression screens, painted with the user's lowpix stroke brush.

Every frame is a lowpix sprite spec: a paper sheet (polygon, cloth-grain strokes) with an inked outline made of
tapered strokes that wobble and overshoot at the corners, plus tape strips or a pin where a hand would put them.
They are 9-slice sources (128 px, 40 px slices) for CSS border-image at 1:1.

  python3 src/research/art/build_frames.py
"""
import json, os, random, sys
sys.path.insert(0, '/home/user/pukkingdragon123/symmetrical-goggles')
from lowpix.sprite import render_sprite  # noqa: E402

S = 128
HERE = os.path.dirname(os.path.abspath(__file__))
MATS = {
    'paper': {'base': '#ece4d0', 'steps': 3, 'texture': 'cloth', 'contrast': 0.12, 'hue_shift': 0.01},
    'paper2': {'base': '#e2d8c0', 'steps': 3, 'texture': 'cloth', 'contrast': 0.12},
    'ink': {'base': '#2b2622', 'steps': 4, 'contrast': 0.8},
    'red': {'base': '#a8332a', 'steps': 5},
    'amber': {'base': '#e8c070', 'steps': 3, 'texture': 'cloth', 'contrast': 0.14},
    'tape': {'base': '#d8c890', 'steps': 5, 'texture': 'cloth', 'contrast': 0.5},
    'pin': {'base': '#b8382e', 'steps': 6, 'spec': 1},
}

def wob(rng, a, b, n=7, amp=1.4):
    """a hand-drawn line from a to b: n points with a little sideways wobble"""
    (x0, y0), (x1, y1) = a, b
    dx, dy = x1 - x0, y1 - y0
    L = max(1e-6, (dx * dx + dy * dy) ** 0.5)
    nx, ny = -dy / L, dx / L
    pts = []
    for i in range(n):
        t = i / (n - 1)
        o = (rng.random() - 0.5) * 2 * amp * (1 if 0 < i < n - 1 else 0.3)
        pts.append([x0 + dx * t + nx * o, y0 + dy * t + ny * o])
    return pts

def outline(rng, x0, y0, x1, y1, mat='ink', w=2.6, over=3, tile=False):
    """four inked strokes that overshoot their corners a little, like a quick pen line. With tile, the middle of
    each side is a straight band so the 9-slice repeat has no seams (the hand wobble lives near the corners)."""
    out = []
    amp = 0.5 if tile else 1.4
    for a, b in [((x0 - over, y0), (x1 + over * 0.5, y0)), ((x1, y0 - over * 0.5), (x1, y1 + over)),
                 ((x1 + over * 0.6, y1), (x0 - over * 0.4, y1)), ((x0, y1 + over * 0.4), (x0, y0 - over))]:
        pts = wob(rng, a, b, 9, amp)
        out.append({'type': 'stroke', 'points': pts, 'width': [w * 0.7] + [w] * (len(pts) - 2) + [w * 0.55], 'material': mat, 'form': 'ridge'})
    return out

def sheet(rng, x0, y0, x1, y1, mat='paper', jag=1.2):
    pts = wob(rng, (x0, y0), (x1, y0), 6, jag)[:-1] + wob(rng, (x1, y0), (x1, y1), 6, jag)[:-1] + wob(rng, (x1, y1), (x0, y1), 6, jag)[:-1] + wob(rng, (x0, y1), (x0, y0), 6, jag)[:-1]
    return {'type': 'polygon', 'points': pts, 'material': mat, 'form': 'flat', 'part': 'sheet', 'z': -1}

def tape(cx, cy, ang, w=26, h=10):
    import math
    c, s = math.cos(ang), math.sin(ang)
    pts = [[cx + c * dx - s * dy, cy + s * dx + c * dy] for dx, dy in [(-w / 2, -h / 2), (w / 2, -h / 2 + 1), (w / 2 - 1, h / 2), (-w / 2 + 1, h / 2 - 1)]]
    return {'type': 'polygon', 'points': pts, 'material': 'tape', 'form': 'pillow', 'bevel': 2, 'part': 'tape', 'z': 5}

def frame(kind, seed):
    global S
    rng = random.Random(seed)
    small = kind in ('tag', 'key', 'keyhot', 'tab', 'tabon')
    S = 64 if small else 128
    m = 5 if small else 9
    shapes = []
    if kind in ('card', 'note', 'key', 'keyhot', 'tab', 'tabon', 'tag'):
        mat = {'keyhot': 'amber', 'tabon': 'paper', 'tag': 'paper2'}.get(kind, 'paper')
        shapes.append(sheet(rng, m, m, S - m, S - m, mat, 0.6 if kind in ('key', 'keyhot', 'tab', 'tabon') else 1.0))
        shapes += outline(rng, m, m, S - m, S - m, 'ink', (2.6 if kind in ('key', 'keyhot') else 2.0) if small else 2.6, 2 if small else 3, tile=True)
    if kind == 'frame':
        shapes += outline(rng, m, m, S - m, S - m, 'ink', 2.8, tile=True)
    if kind == 'stamp':
        shapes += outline(rng, m + 4, m + 4, S - m - 4, S - m - 4, 'red', 4.0, 2, tile=True)
        shapes += outline(rng, m + 11, m + 11, S - m - 11, S - m - 11, 'red', 1.8, 1, tile=True)
    if kind in ('card', 'frame'):
        shapes.append(tape(m + 6, m + 4, -0.6))
        shapes.append(tape(S - m - 6, S - m - 4, -0.55))
    if kind == 'note':
        shapes.append({'type': 'ellipse', 'center': [S / 2, m + 4], 'radii': [4, 4], 'material': 'pin', 'form': 'dome', 'z': 9})
    return {'size': [S, S], 'paint': 'strokes', 'materials': MATS, 'shapes': shapes, 'outline': 'none', 'inner': 'none',
            'strokes': {'length': 5, 'rough': 0.6}}

def main():
    out = {}
    for i, k in enumerate(['card', 'note', 'frame', 'stamp', 'key', 'keyhot', 'tab', 'tabon', 'tag']):
        img = render_sprite(frame(k, 11 + i * 7), seed=i)
        p = os.path.join(HERE, 'frames', k + '.png')
        img.save(p)
        out[k] = 'frames/' + k + '.png'
        print('ok', k, flush=True)
    json.dump(out, open(os.path.join(HERE, 'frames', 'index.json'), 'w'))

if __name__ == '__main__':
    main()

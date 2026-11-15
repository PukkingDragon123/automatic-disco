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
    'enamel': {'base': '#efe8d4', 'steps': 3, 'spec': 1, 'contrast': 0.07},
    'enamelblue': {'base': '#2a4a78', 'steps': 5, 'spec': 1, 'contrast': 0.5},
    'chip': {'base': '#2b2e31', 'steps': 4, 'texture': 'metal'},
    'steel': {'base': '#8e9592', 'steps': 5, 'texture': 'metal', 'contrast': 0.3, 'spec': 1},
    'rivet': {'base': '#a8aca6', 'steps': 5, 'spec': 1},
    'fibre': {'base': '#efe6d2', 'steps': 3, 'texture': 'cloth', 'contrast': 0.1},
    'fox': {'base': '#b8946a', 'steps': 3},
    'coffee': {'base': '#8a5a34', 'steps': 3},
    'canvas': {'base': '#d8cba8', 'steps': 3, 'texture': 'cloth', 'contrast': 0.2},
    'thread': {'base': '#7a3a2a', 'steps': 3},
    'cork': {'base': '#a87a4c', 'steps': 5, 'texture': 'stone', 'contrast': 0.4},
    'corkdark': {'base': '#6a4626', 'steps': 3},
    'corklight': {'base': '#d0a26a', 'steps': 3},
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

def rivets(m, S):
    out = []
    for x, y in [(m + 7, m + 7), (S - m - 7, m + 7), (m + 7, S - m - 7), (S - m - 7, S - m - 7)]:
        out.append({'type': 'ellipse', 'center': [x, y], 'radii': [3.2, 3.2], 'material': 'rivet', 'form': 'dome', 'z': 8})
    return out

def material(kind, seed):
    """the textured material frames: enamel plate, riveted steel, specimen fibre card, stitched canvas, cork tile"""
    global S
    rng = random.Random(seed)
    S = 128
    m = 6
    sh = []
    if kind == 'enamel':
        sh.append(sheet(rng, m, m, S - m, S - m, 'enamelblue', 0.3))
        sh.append(dict(sheet(rng, m + 9, m + 9, S - m - 9, S - m - 9, 'enamel', 0.2), z=1))
        # chips knocked off the enamel, showing the dark steel under it
        for (cx, cy, r) in [(m + 3, 40, 4), (S - m - 2, 92, 5), (70, S - m - 2, 4), (m + 30, m + 1, 3), (S - m - 14, m + 12, 3)]:
            pts = [[cx + r * (0.8 + rng.random() * 0.5) * __import__('math').cos(a), cy + r * (0.8 + rng.random() * 0.5) * __import__('math').sin(a)] for a in [k * 1.05 for k in range(6)]]
            sh.append({'type': 'polygon', 'points': pts, 'material': 'chip', 'form': 'flat', 'z': 6})
        sh += rivets(m + 1, S)
        sh += outline(rng, m, m, S - m, S - m, 'ink', 2.2, 1, tile=True)
    elif kind == 'metal':
        sh.append({**sheet(rng, m, m, S - m, S - m, 'steel', 0.15), 'flow': [1, 0], 'edge': {'light': 1, 'dark': -1}})
        sh += rivets(m, S)
        sh += outline(rng, m, m, S - m, S - m, 'ink', 2.2, 1, tile=True)
    elif kind == 'fibre':
        sh.append(sheet(rng, m, m, S - m, S - m, 'fibre', 0.8))
        for _ in range(9):
            x, y = rng.choice([(rng.uniform(m + 4, 34), rng.uniform(m + 4, S - m - 4)), (rng.uniform(S - 34, S - m - 4), rng.uniform(m + 4, S - m - 4))])
            sh.append({'type': 'ellipse', 'center': [x, y], 'radii': [rng.uniform(1.0, 2.6)] * 2, 'material': 'fox', 'form': 'flat', 'z': 3})
        # a coffee ring in the lower right corner
        sh.append({'type': 'ellipse', 'center': [S - 26, S - 24], 'radii': [15, 13], 'material': 'coffee', 'form': 'flat', 'z': 4})
        sh.append({'type': 'ellipse', 'center': [S - 26, S - 24], 'radii': [13, 11], 'material': 'fibre', 'form': 'flat', 'z': 5})
        sh += outline(rng, m, m, S - m, S - m, 'ink', 1.4, 1, tile=True)
    elif kind == 'canvas':
        sh.append(sheet(rng, m, m, S - m, S - m, 'canvas', 0.6))
        # stitching round the edge, short dashes of red thread
        for side in range(4):
            for k in range(14):
                t0, t1 = 0.06 + k * 0.064, 0.06 + k * 0.064 + 0.035
                if side == 0: a, b = (m + 6 + t0 * (S - 2 * m - 12), m + 6), (m + 6 + t1 * (S - 2 * m - 12), m + 6)
                elif side == 1: a, b = (S - m - 6, m + 6 + t0 * (S - 2 * m - 12)), (S - m - 6, m + 6 + t1 * (S - 2 * m - 12))
                elif side == 2: a, b = (m + 6 + t0 * (S - 2 * m - 12), S - m - 6), (m + 6 + t1 * (S - 2 * m - 12), S - m - 6)
                else: a, b = (m + 6, m + 6 + t0 * (S - 2 * m - 12)), (m + 6, m + 6 + t1 * (S - 2 * m - 12))
                sh.append({'type': 'stroke', 'points': [list(a), list(b)], 'width': 1.6, 'material': 'thread', 'form': 'cylinder', 'z': 4})
        sh += outline(rng, m, m, S - m, S - m, 'ink', 2.4, 1, tile=True)
    elif kind == 'cork':
        S = 128
        sh.append({'type': 'polygon', 'points': [[-2, -2], [S + 2, -2], [S + 2, S + 2], [-2, S + 2]], 'material': 'cork', 'form': 'flat'})
        for _ in range(170):
            x, y = rng.uniform(0, S), rng.uniform(0, S)
            mat = rng.choice(['corkdark', 'corkdark', 'corklight'])
            r = rng.uniform(0.6, 1.8)
            for ox in (-S, 0, S):
                for oy in (-S, 0, S):
                    if -4 < x + ox < S + 4 and -4 < y + oy < S + 4:
                        sh.append({'type': 'ellipse', 'center': [x + ox, y + oy], 'radii': [r * rng.uniform(0.8, 1.5), r], 'material': mat, 'form': 'flat', 'z': 2})
    elif kind == 'pin':
        S = 32
        sh.append({'type': 'stroke', 'points': [[16, 18], [19, 27]], 'width': 1.4, 'material': 'rivet', 'form': 'cylinder'})
        sh.append({'type': 'ellipse', 'center': [15, 13], 'radii': [7, 6], 'material': 'pin', 'form': 'dome', 'z': 2})
    return {'size': [S, S], 'paint': 'strokes', 'materials': MATS, 'shapes': sh, 'outline': 'selout' if kind == 'pin' else 'none', 'inner': 'none', 'strokes': {'length': 5, 'rough': 0.6}}

def main():
    out = {}
    for i, k in enumerate(['card', 'note', 'frame', 'stamp', 'key', 'keyhot', 'tab', 'tabon', 'tag']):
        img = render_sprite(frame(k, 11 + i * 7), seed=i)
        p = os.path.join(HERE, 'frames', k + '.png')
        img.save(p)
        out[k] = 'frames/' + k + '.png'
        print('ok', k, flush=True)
    for i, k in enumerate(['enamel', 'metal', 'fibre', 'canvas', 'cork', 'pin']):
        img = render_sprite(material(k, 101 + i * 13), seed=50 + i)
        img.save(os.path.join(HERE, 'frames', k + '.png'))
        out[k] = 'frames/' + k + '.png'
        print('ok', k, flush=True)
    json.dump(out, open(os.path.join(HERE, 'frames', 'index.json'), 'w'))

if __name__ == '__main__':
    main()

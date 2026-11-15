"""Machined frames for the progression screens: clean, stylised pixel art (no strokes, no ink, nothing hand-drawn).

Each frame is painted pixel by pixel at HALF resolution from short colour ramps (bevelled steel bezels, enamel faces,
cross-head screws, chamfered corners, brushed metal in long clean runs) and scaled up 2x with nearest neighbour, so a
frame pixel is always a 2x2 block on screen. They stay 9-slice sources at the old sizes (128 px with 40 px slices, the
small keys and tags 64 px with 20 px slices) so the CSS border-image rules are unchanged.

  python3 src/research/art/build_frames.py
"""
import json, os, random
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))

INK = (21, 23, 27, 255)
STEEL = [(58, 63, 68), (92, 99, 106), (133, 141, 147), (170, 177, 180), (210, 215, 214)]
GUN = [(29, 32, 37), (40, 45, 51), (52, 58, 65), (66, 74, 82), (88, 97, 105)]
CREAM = [(196, 188, 166), (217, 209, 187), (232, 225, 205), (243, 238, 223)]
PALE = [(176, 178, 170), (200, 202, 194), (220, 221, 213), (236, 236, 228)]
NAVY = [(20, 38, 64), (31, 58, 96), (46, 84, 134), (74, 114, 168)]
RED = [(90, 26, 22), (138, 38, 32), (178, 58, 46), (216, 96, 74)]
AMBER = [(122, 74, 18), (184, 118, 30), (224, 163, 58), (242, 200, 106)]
BRASS = [(90, 67, 24), (138, 106, 42), (184, 145, 62), (216, 181, 98), (239, 214, 144)]


def rgba(c):
    return c if len(c) == 4 else (c[0], c[1], c[2], 255)


class Canvas:
    def __init__(self, n):
        self.n = n
        self.im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
        self.px = self.im.load()

    def put(self, x, y, c):
        if 0 <= x < self.n and 0 <= y < self.n:
            self.px[x, y] = rgba(c)

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                self.put(x, y, c)

    def ring(self, x0, y0, x1, y1, c):
        """a 1 px rectangle outline, corners included"""
        for x in range(x0, x1):
            self.put(x, y0, c); self.put(x, y1 - 1, c)
        for y in range(y0, y1):
            self.put(x0, y, c); self.put(x1 - 1, y, c)

    def bevel(self, x0, y0, x1, y1, hi, lo):
        """light along the top and left, dark along the bottom and right (one pixel)"""
        for x in range(x0, x1):
            self.put(x, y0, hi); self.put(x, y1 - 1, lo)
        for y in range(y0, y1):
            self.put(x0, y, hi); self.put(x1 - 1, y, lo)
        self.put(x1 - 1, y0, lo); self.put(x0, y1 - 1, lo)

    def chamfer(self, m, k):
        """cut the four corners at 45 degrees (k px) and ink the cut"""
        n = self.n
        for i in range(k):
            for j in range(k - i):
                for (x, y) in ((m + j, m + i), (n - 1 - m - j, m + i), (m + j, n - 1 - m - i), (n - 1 - m - j, n - 1 - m - i)):
                    self.put(x, y, (0, 0, 0, 0))
        for i in range(k + 1):
            j = k - i
            for (x, y) in ((m + j, m + i), (n - 1 - m - j, m + i), (m + j, n - 1 - m - i), (n - 1 - m - j, n - 1 - m - i)):
                self.put(x, y, INK)

    def screw(self, cx, cy, ramp=STEEL):
        """a 4x4 cross-head screw: dark rim, lit upper left, a slot"""
        for (dx, dy, c) in [(0, 0, ramp[1]), (1, 0, ramp[3]), (2, 0, ramp[3]), (3, 0, ramp[1]),
                            (0, 1, ramp[3]), (1, 1, ramp[4]), (2, 1, ramp[2]), (3, 1, ramp[1]),
                            (0, 2, ramp[2]), (1, 2, ramp[2]), (2, 2, ramp[1]), (3, 2, ramp[0]),
                            (0, 3, ramp[1]), (1, 3, ramp[1]), (2, 3, ramp[0]), (3, 3, ramp[0])]:
            self.put(cx - 2 + dx, cy - 2 + dy, c)
        self.put(cx - 1, cy - 1, ramp[0]); self.put(cx, cy, ramp[0])

    def rivet(self, cx, cy, ramp=STEEL):
        """a 2x2 dome rivet"""
        self.put(cx - 1, cy - 1, ramp[4]); self.put(cx, cy - 1, ramp[2]); self.put(cx - 1, cy, ramp[2]); self.put(cx, cy, ramp[0])

    def brushed(self, x0, y0, x1, y1, a, b, rng, run=(5, 18), p=0.35):
        """brushed metal: long horizontal runs of a second tone, clean, no speckle"""
        self.rect(x0, y0, x1, y1, a)
        for y in range(y0, y1):
            x = x0 + rng.randint(0, 6)
            while x < x1:
                L = rng.randint(*run)
                if rng.random() < p:
                    for k in range(x, min(x1, x + L)):
                        self.put(k, y, b)
                x += L + rng.randint(2, 9)

    def out(self, name, scale=2):
        img = self.im.resize((self.n * scale, self.n * scale), Image.NEAREST)
        img.save(os.path.join(HERE, 'frames', name + '.png'))


def plate(name, n, m, bez, face, screws=True, chamf=3, face_ramp=None, brushed=False, seed=1, inset=True, strip=None):
    """a machined plate: an inked, chamfered outline, a bevelled bezel of `bez` px, a face, screws in the corners"""
    rng = random.Random(seed)
    c = Canvas(n)
    lo, hi = m, n - m
    c.rect(lo, lo, hi, hi, INK)
    # the bezel
    if brushed:
        c.brushed(lo + 1, lo + 1, hi - 1, hi - 1, face[2], tuple((a + b) // 2 for a, b in zip(face[2], face[3])), rng, p=0.3)
    else:
        c.rect(lo + 1, lo + 1, hi - 1, hi - 1, face[2])
    c.bevel(lo + 1, lo + 1, hi - 1, hi - 1, face[-1], face[1])
    # the recessed face inside the bezel
    if face_ramp is not None:
        f0, f1 = lo + 1 + bez, hi - 1 - bez
        c.rect(f0, f0, f1, f1, face_ramp[2])
        if inset:
            c.bevel(f0 - 1, f0 - 1, f1 + 1, f1 + 1, face[0], face[-1])
            for x in range(f0, f1):
                c.put(x, f0, face_ramp[1])
            for y in range(f0, f1):
                c.put(f0, y, face_ramp[1])
    if strip is not None:
        for y in range(hi - 4, hi - 2):
            for x in range(lo + 3, hi - 3):
                c.put(x, y, strip[2] if y == hi - 4 else strip[1])
    if screws:
        k = lo + 1 + max(2, bez // 2 + 1)
        for (x, y) in ((k, k), (n - k, k), (k, n - k), (n - k, n - k)):
            c.screw(x, y)
    c.chamfer(lo, chamf)
    c.out(name)


def rim(name, n, m, ramp, w=3, chamf=3):
    """a coloured rim with a hollow centre (stamps, frames)"""
    c = Canvas(n)
    lo, hi = m, n - m
    c.rect(lo, lo, hi, hi, INK)
    c.rect(lo + 1, lo + 1, hi - 1, hi - 1, ramp[2])
    c.bevel(lo + 1, lo + 1, hi - 1, hi - 1, ramp[3], ramp[1])
    c.rect(lo + 1 + w, lo + 1 + w, hi - 1 - w, hi - 1 - w, (0, 0, 0, 0))
    c.ring(lo + 1 + w, lo + 1 + w, hi - 1 - w, hi - 1 - w, INK)
    c.chamfer(lo, chamf)
    c.out(name)


def key(name, n, face, side):
    """a machined push key: inked, chamfered, lit top edge, a deeper bottom edge (it stands proud)"""
    c = Canvas(n)
    lo, hi = 1, n - 1
    c.rect(lo, lo, hi, hi, INK)
    c.rect(lo + 1, lo + 1, hi - 1, hi - 3, face[2])
    c.rect(lo + 1, hi - 3, hi - 1, hi - 1, side)
    for x in range(lo + 1, hi - 1):
        c.put(x, lo + 1, face[3])
    for y in range(lo + 1, hi - 3):
        c.put(lo + 1, y, face[3]); c.put(hi - 2, y, face[1])
    c.rivet(lo + 4, lo + 4, STEEL); c.rivet(hi - 3, lo + 4, STEEL)
    c.chamfer(lo, 2)
    c.out(name)


def panel(name, n=64, seed=7):
    """the research rig's back panel: gunmetal plates, seams and rivets, brushed in long runs; tiles seamlessly"""
    rng = random.Random(seed)
    c = Canvas(n)
    c.brushed(0, 0, n, n, GUN[2], GUN[3], rng, run=(6, 22), p=0.25)
    for s in (0, n // 2):
        for x in range(n):
            c.put(x, s, GUN[0]); c.put(x, s + 1, GUN[4])
        for y in range(n):
            c.put(s, y, GUN[0]); c.put(s + 1, y, GUN[4])
    for s in (0, n // 2):
        for t in (0, n // 2):
            for (dx, dy) in ((4, 4), (n // 2 - 4, 4), (4, n // 2 - 4), (n // 2 - 4, n // 2 - 4)):
                c.rivet(s + dx, t + dy, STEEL)
    c.out(name)


def screw_icon(name):
    c = Canvas(16)
    for y in range(16):
        for x in range(16):
            d = ((x - 7.5) ** 2 + (y - 7.5) ** 2) ** 0.5
            if d < 6.5:
                c.put(x, y, STEEL[3] if x + y < 13 else STEEL[2] if d < 5 else STEEL[1])
            elif d < 7.5:
                c.put(x, y, INK)
    for k in range(4, 12):
        c.put(k, k, STEEL[0]); c.put(k, 15 - k, STEEL[0])
    c.out(name)


def main():
    # plates (9-slice, 64 half-res -> 128, slice 20 -> 40)
    plate('card', 64, 2, 5, STEEL, face_ramp=CREAM, seed=3)                       # machined plate, enamel face
    plate('note', 64, 2, 3, STEEL, screws=False, face_ramp=PALE, seed=4)          # a lighter stamped plate
    plate('enamel', 64, 2, 5, NAVY, face_ramp=CREAM, seed=5)                      # navy-rimmed enamel sign
    plate('metal', 64, 2, 0, STEEL, brushed=True, seed=6, inset=False)            # brushed riveted steel
    plate('fibre', 64, 2, 3, GUN, screws=False, face_ramp=PALE, seed=8)           # a pale plate in a gunmetal rim
    plate('canvas', 64, 2, 5, GUN, face_ramp=CREAM, seed=9)                       # the decision plates
    rim('frame', 64, 2, GUN, w=4)
    rim('stamp', 64, 4, RED, w=3)
    # keys, tabs, tags (32 half-res -> 64, slice 10 -> 20)
    key('key', 32, STEEL, STEEL[1])
    key('keyhot', 32, AMBER, AMBER[0])
    plate('tab', 32, 1, 2, STEEL, screws=False, face_ramp=PALE, chamf=2, seed=10)
    plate('tabon', 32, 1, 2, STEEL, screws=False, face_ramp=CREAM, chamf=2, seed=11, strip=AMBER)
    plate('tag', 32, 1, 0, BRASS, screws=False, chamf=2, seed=12, inset=False)
    panel('cork')
    screw_icon('pin')
    names = ['card', 'note', 'frame', 'stamp', 'key', 'keyhot', 'tab', 'tabon', 'tag', 'enamel', 'metal', 'fibre', 'canvas', 'cork', 'pin']
    json.dump({k: 'frames/' + k + '.png' for k in names}, open(os.path.join(HERE, 'frames', 'index.json'), 'w'))
    print('ok', len(names))


if __name__ == '__main__':
    main()

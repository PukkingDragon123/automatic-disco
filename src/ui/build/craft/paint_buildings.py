# The planner's building illustrations: every building repainted as 2D pixel art with lowpix's brush engine.
#   1. node <scratch>/tools/dump_passes.mjs <passes dir>   (the &stills test page shoots a colour, an id and a normal pass)
#   2. python3 src/ui/build/craft/paint_buildings.py <passes dir>
# Each part (one mesh, split again by colour) gets its own hue-shifted ramp; the rendered light becomes a target tone that
# lowpix's `quantise` lays down in strokes running around the form (from the normal pass), with material marks
# (metal scratches, wood grain, brick). Seams between parts are cut one tone darker, the silhouette is inked, and a soft
# contact shadow sits under the footing. Output: public/ui/build/art/<kind>.png (art pixels, shown at 2x).
import glob, os, sys, colorsys
import numpy as np
from PIL import Image
sys.path.insert(0, '/home/user/pukkingdragon123/symmetrical-goggles')
from lowpix import brush, palette  # noqa: E402

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'public', 'ui', 'build', 'art')
os.makedirs(OUT, exist_ok=True)
INK = np.array([29, 24, 20], float) / 255
STEPS = 6


def load(p):
  return np.asarray(Image.open(p).convert('RGBA'), float) / 255


def down(a, f):  # f x f box
  H, W = a.shape[0] // f, a.shape[1] // f
  return a[:H * f, :W * f].reshape(H, f, W, f, *a.shape[2:]).mean((1, 3))


def shift(a, dy, dx, fill):  # np.roll without the wrap
  o = np.full_like(a, fill)
  H, W = a.shape[:2]
  o[max(dy, 0):H + min(dy, 0), max(dx, 0):W + min(dx, 0)] = a[max(-dy, 0):H + min(-dy, 0), max(-dx, 0):W + min(-dx, 0)]
  return o


def lum(c):
  return c[..., 0] * 0.3 + c[..., 1] * 0.59 + c[..., 2] * 0.11


def kmeans(X, k, it=12, seed=1):
  r = np.random.default_rng(seed)
  C = X[r.choice(len(X), k, replace=False)]
  for _ in range(it):
    d = ((X[:, None, :] - C[None]) ** 2).sum(-1)
    a = d.argmin(1)
    for j in range(k):
      if (a == j).any():
        C[j] = X[a == j].mean(0)
  return a, C


def texture_of(rgb):
  h, l, s = colorsys.rgb_to_hls(*rgb)
  if s < 0.16 or l > 0.8:
    return 'metal'
  if 0.03 < h < 0.13 and l < 0.55:
    return 'wood'
  if h <= 0.03 or h > 0.95:
    return 'stone'
  return 'metal'


def paint(kind, f=2, out_dir=OUT):
  C2, I2, N2 = (load(os.path.join(SRC, f'{kind}.{p}.png')) for p in ('color', 'id', 'normal'))
  a2 = C2[..., 3] > 0.5
  H, W = C2.shape[0] // f, C2.shape[1] // f
  A = down(a2.astype(float), f)
  mask = A >= 0.5
  if mask.sum() < 20:
    return False
  w4 = a2[..., None].astype(float)
  col = down(C2[..., :3] * w4, f) / np.maximum(down(w4, f), 1e-6)
  nrm = down(N2[..., :3] * w4, f) / np.maximum(down(w4, f), 1e-6) * 2 - 1
  # ids: the pixel nearest the centre of each 2x2 block that is covered
  key2 = (np.round(I2[..., 0] * 31) * 1024 + np.round(I2[..., 1] * 31) * 32 + np.round(I2[..., 2] * 31)).astype(int)
  key2 = np.where(a2, key2, -1)
  idk = np.full((H, W), -1)
  for dy, dx in ((f // 2, f // 2), (0, 0), (f - 1, 0), (0, f - 1)):
    k = key2[dy:H * f:f, dx:W * f:f][:H, :W]
    idk = np.where((idk < 0) & (k >= 0), k, idk)
  idk = np.where(mask, idk, -1)
  # split each mesh by hue (lowpix models carry a whole painted atlas on one mesh)
  sub = np.full((H, W), -1)
  parts = []
  for key in np.unique(idk[idk >= 0]):
    m = idk == key
    px = col[m]
    hls = np.array([colorsys.rgb_to_hls(*c) for c in px])
    X = np.stack([hls[:, 2] * np.cos(hls[:, 0] * 6.283), hls[:, 2] * np.sin(hls[:, 0] * 6.283), hls[:, 1] * 0.35], 1)
    k = int(min(4, max(1, len(px) // 40)))
    if k > 1 and X.std(0).sum() > 0.08:
      a, Cc = kmeans(X, k)
      # merge near centres
      remap = list(range(k))
      for i in range(k):
        for j in range(i):
          if np.linalg.norm(Cc[i] - Cc[j]) < 0.14:
            remap[i] = remap[j]
            break
      a = np.array([remap[x] for x in a])
    else:
      a = np.zeros(len(px), int)
    ys, xs = np.nonzero(m)
    for c in np.unique(a):
      sel = a == c
      if sel.sum() < 3 and len(parts):
        continue
      lid = len(parts)
      sub[ys[sel], xs[sel]] = lid
      parts.append(key)
  # orphan pixels (tiny clusters) take a neighbour's part
  for _ in range(4):
    hole = mask & (sub < 0)
    if not hole.any():
      break
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
      nb = shift(sub, dy, dx, -1)
      sub = np.where(hole & (nb >= 0) & (sub < 0), nb, sub)
  sub = np.where(mask & (sub < 0), 0, sub)
  sub = np.where(mask, sub, -1)
  L = lum(col)
  # ramps per part and the target tone (a fractional ramp index)
  T = np.zeros((H, W))
  ramps = []
  marks = []
  for lid in range(len(parts)):
    m = sub == lid
    if not m.any():
      ramps.append(np.zeros((STEPS, 3)))
      continue
    pl = L[m]
    mid = (pl >= np.percentile(pl, 35)) & (pl <= np.percentile(pl, 70))
    base = np.median(col[m][mid] if mid.any() else col[m], 0)
    h, l, s = colorsys.rgb_to_hls(*base)
    base = colorsys.hls_to_rgb(h, min(0.62, max(0.3, l)), min(0.75, s * 1.12))
    hexc = '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in base)
    rp = np.array([[int(x[i:i + 2], 16) / 255 for i in (1, 3, 5)] for x in palette.make_ramp(hexc, STEPS, hue_shift=16, spread=0.82)])
    ramps.append(rp)
    rl = lum(rp)
    # stretch the part's own light range across the ramp so every part reads with shadow, body and highlight
    lo, hi = np.percentile(pl, 4), np.percentile(pl, 97)
    t = (pl - lo) / max(hi - lo, 0.05)
    T[m] = np.clip(t * (STEPS - 1) * 0.8 + 0.3, 0, STEPS - 1)
    marks.append((m, texture_of(base)))
  # flow: around the form (perpendicular to the normal's screen direction), smoothed
  nx, ny = nrm[..., 0], -nrm[..., 1]
  F = np.dstack([ny, -nx])
  n = np.hypot(F[..., 0], F[..., 1])
  F = np.where((n > 0.15)[..., None], F / np.maximum(n, 1e-6)[..., None], np.dstack([np.ones((H, W)), np.zeros((H, W))]))
  F = brush.smooth_flow(F, mask, passes=2)
  rng = np.random.default_rng(abs(hash(kind)) % (2 ** 31))
  protect = mask & (L > 0.92)
  idx = brush.quantise(T, sub, F, rng, 0, STEPS - 1, length=3.4, rough=0.5, overshoot=0.3, width=1.15, marks=marks,
                       mark_scale=0.8, protect=protect)
  # seams: where two meshes meet, the darker side steps down a tone
  for dy, dx in ((0, 1), (1, 0)):
    nb_id = shift(idk, -dy, -dx, -1)
    nb_L = shift(L, -dy, -dx, 0.0)
    seam = mask & (nb_id >= 0) & (nb_id != idk)
    idx = np.where(seam & (L <= nb_L), np.maximum(idx - 1, 0), idx)
    seam2 = mask & shift(seam & (L > nb_L), dy, dx, False)
    idx = np.where(seam2, np.maximum(idx - 1, 0), idx)
  out = np.zeros((H, W, 4))
  for lid, rp in enumerate(ramps):
    m = sub == lid
    out[m, :3] = rp[np.clip(idx[m], 0, STEPS - 1)]
    out[m, 3] = 1
  # contact shadow under the footing
  ys, xs = np.nonzero(mask)
  by = ys.max()
  foot = xs[ys >= by - max(3, (by - ys.min()) // 6)]
  cx, rx = (foot.min() + foot.max()) / 2, (foot.max() - foot.min()) / 2 + 3
  yy, xx = np.mgrid[0:H, 0:W]
  sh = (((xx - cx) / max(rx, 4)) ** 2 + ((yy - (by - 1)) / 3.2) ** 2 <= 1) & ~mask
  out[sh] = [0.04, 0.06, 0.12, 0.42]
  # ink the silhouette (1 px outside); the lit top-left edge is drawn in the part's darkest tone instead
  edge = np.zeros((H, W), bool)
  src = np.full((H, W), -1)
  for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
    nb = shift(mask, dy, dx, False)
    e = nb & ~mask
    nbsub = shift(sub, dy, dx, -1)
    src = np.where(e & (src < 0), nbsub, src)
    edge |= e
  out[edge] = [*INK, 1]
  for dy, dx in ((-1, 0), (0, -1)):  # outside pixel whose inner neighbour is below/right: the lit edge
    nb = shift(mask, dy, dx, False)
    lit = edge & nb & ~shift(mask, -dy, -dx, False)
    for lid, rp in enumerate(ramps):
      m = lit & (shift(sub, dy, dx, -1) == lid)
      out[m, :3] = rp[0] * 0.8 + INK * 0.2
  os.makedirs(out_dir, exist_ok=True)
  Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(out_dir, f'{kind}.png'))
  return True


kinds = sorted({os.path.basename(p).split('.')[0] for p in glob.glob(os.path.join(SRC, '*.color.png'))})
ok = [k for k in kinds if paint(k)]
# small pins for the node map's cork board (half size, painted from the same passes)
for k in ok:
  paint(k, 4, os.path.join(OUT, 's'))
print(len(ok), 'painted;', 'skipped:', sorted(set(kinds) - set(ok)))
# the list the game reads (kinds without a painting fall back to a studio still)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'artlist.ts'), 'w').write(
  '// generated by src/ui/build/craft/paint_buildings.py: the buildings with a painted illustration in public/ui/build/art\n'
  'export const ART_KINDS = new Set<string>(' + repr(sorted(ok)).replace("'", '"') + ');\n')

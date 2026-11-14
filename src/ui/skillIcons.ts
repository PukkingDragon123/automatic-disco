// Hand-pixelled 32x32 icons for every skill-tree node, painted in code: Unit 07 (rock skull, brass lens, olive
// Corps plate, stone arms on pistons, a copper gravity coil) using the part or power each node unlocks. Light falls
// from the top left; solids get a 1px ink outline, glows and beams are laid over afterwards. The golem's colours
// come from the player's look (babyLook.ts), so the icons show *their* machine.
import { Pix, GM, BR, CU, RD, AM, CR, HZ, INK, dv, mixc } from './machine';
import { hashf } from '../limbo/core/rng';
import { makeRamp } from '../limbo/gfx/pixel';
import type { BabyLook } from '../game/babyLook';

// ------------------------------------------------------------------ palettes
export const ORE = [0x1e100a, 0x3a1c0e, 0x5c2e14, 0x8a4a22, 0xb8662e, 0xe08a4a, 0xf4b47a, 0xffdcb4];
export const CARB = [0x07090a, 0x10160e, 0x1a2414, 0x26361c, 0x3a5228, 0x587a36, 0x8ab05a, 0xc4e090];
export const WATER = [0x06142a, 0x0c2446, 0x143a66, 0x1e5486, 0x2c72a8, 0x4a94c8, 0x7cbce4, 0xc4ecfa];
export const SOIL = [0x1c1008, 0x2c1a0c, 0x402614, 0x58361c, 0x724826, 0x8c5c32, 0xa87444, 0xc49462];
const FLESH = [0x140a18, 0x26142c, 0x3c2242, 0x56325c, 0x724878, 0x926496, 0xb68cb8, 0xdcbedc];
const LEAF = [0x0e1a0a, 0x1a2e10, 0x284616, 0x3a621e, 0x528428, 0x72a438, 0x9cc450, 0xd0e888];
const CHROME = [0x16181a, 0x2c3034, 0x4a5056, 0x6c747a, 0x949ca2, 0xbcc4c8, 0xe2e8ea, 0xffffff];
const RUB = [0x0c0b0a, 0x161412, 0x221f1c, 0x2e2a26, 0x3c3832];
const HOT = [0x3a0c02, 0x7a1e04, 0xb83a08, 0xe8640e, 0xff9a22, 0xffc850, 0xfff0a0, 0xffffff];

export interface Kit { rock: number[]; met: number[]; glow: number[]; g: number; moss: number[] }
export function kitFor(L: Pick<BabyLook, 'rock' | 'metal' | 'glow'>): Kit {
  const g = L.glow;
  return {
    rock: makeRamp(L.rock, 8, { spread: 0.78, hueShift: 0.03 }),
    met: makeRamp(L.metal, 7, { spread: 0.72, hueShift: 0.03 }),
    glow: [mixc(g, 0, 0.82), mixc(g, 0, 0.62), mixc(g, 0, 0.38), mixc(g, 0, 0.14), g, mixc(g, 0xffffff, 0.45), mixc(g, 0xffffff, 0.8)],
    g,
    moss: makeRamp(0x5a7a3a, 5, { spread: 0.6 }),
  };
}

// ------------------------------------------------------------------ primitives
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const LX = -0.55, LY = -0.62, LZ = 0.56;
/** lambert from a unit normal, 0..1 */
const lam = (nx: number, ny: number, nz: number) => clamp(nx * LX + ny * LY + nz * LZ, 0, 1);
/** ramp index from light: amb..1 mapped across R */
const ri = (R: number[], l: number, amb = 0.12) => (amb + (1 - amb) * l) * (R.length - 0.6) - 0.2;

/** shaded ellipsoid */
export function ball(p: Pix, cx: number, cy: number, rx: number, ry: number, R: number[], o: { noise?: number; seed?: number; amb?: number; spec?: boolean } = {}) {
  const n = o.noise ?? 0.3, seed = o.seed ?? 1;
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d2 = dx * dx + dy * dy;
    if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2);
    let v = ri(R, lam(dx, dy, nz), o.amb) + (hashf(x >> 1, y >> 1, seed) - 0.5) * n;
    if (o.spec && lam(dx, dy, nz) > 0.93) v = R.length - 1;
    p.set(x, y, dv(R, v, x, y));
  }
}
/** a lumpy boulder: radius wobbles with angle, facets and cracks */
export function rock(p: Pix, cx: number, cy: number, rx: number, ry: number, R: number[], seed = 1, o: { rough?: number; cracks?: number; facet?: number; moss?: number[]; mossK?: number; ang?: number } = {}) {
  const ca = Math.cos(o.ang ?? 0), sa = Math.sin(o.ang ?? 0), big = Math.max(rx, ry);
  const rough = o.rough ?? 0.16, ph = [hashf(seed, 1, 9) * 6.3, hashf(seed, 2, 9) * 6.3, hashf(seed, 3, 9) * 6.3];
  const rr = (a: number) => 1 + rough * (Math.sin(a * 2 + ph[0]) * 0.5 + Math.sin(a * 3 + ph[1]) * 0.35 + Math.sin(a * 5 + ph[2]) * 0.25);
  const fa = o.facet ?? 0.9;
  for (let y = Math.floor(cy - big * 1.4); y <= cy + big * 1.4; y++) for (let x = Math.floor(cx - big * 1.4); x <= cx + big * 1.4; x++) {
    const qx = x + 0.5 - cx, qy = y + 0.5 - cy, lx = qx * ca + qy * sa, ly = -qx * sa + qy * ca;
    const ux = lx / rx, uy = ly / ry, a = Math.atan2(uy, ux), k = rr(a);
    // shading uses the screen-space normal of the rotated ellipse
    const dx = (ux * ca - uy * sa), dy = (ux * sa + uy * ca);
    const d = Math.hypot(dx, dy) / k;
    if (d > 1) continue;
    const ex = dx / k, ey = dy / k, nz = Math.sqrt(Math.max(0, 1 - ex * ex - ey * ey));
    // facets: quantise the normal a little per 3px cell
    const fx = (hashf(Math.floor(x / 3), Math.floor(y / 3), seed + 4) - 0.5) * 0.5 * fa, fy = (hashf(Math.floor(x / 3), Math.floor(y / 3), seed + 5) - 0.5) * 0.5 * fa;
    let v = ri(R, lam(ex + fx, ey + fy, nz)) + (hashf(x, y, seed) - 0.5) * 0.5;
    if (d > 0.86 && ex + ey > 0.2) v -= 0.8;
    let c = dv(R, v, x, y);
    if (o.moss && ey < -0.35 + (hashf(x >> 1, 3, seed) - 0.5) * 0.4 && hashf(x, y, seed + 9) < (o.mossK ?? 0.75)) c = dv(o.moss, 1.5 + lam(ex, ey, nz) * 3, x, y);
    p.set(x, y, c);
  }
  // cracks: short random walks, dark with a lit lower lip
  const nc = o.cracks ?? Math.round((rx * ry) / 30);
  for (let i = 0; i < nc; i++) {
    let x = cx + (hashf(i, seed, 31) - 0.5) * rx * 1.1, y = cy + (hashf(i, seed, 32) - 0.5) * ry * 1.1;
    let a = hashf(i, seed, 33) * 6.3;
    const len = 2 + Math.floor(hashf(i, seed, 34) * Math.min(rx, ry) * 0.8);
    for (let t = 0; t < len; t++) {
      const X = Math.round(x), Y = Math.round(y), c = p.get(X, Y);
      if (c < 0) break;
      p.set(X, Y, R[1]); const b = p.get(X, Y + 1); if (b >= 0 && b !== R[1]) p.set(X, Y + 1, mixc(b, 0xffffff, 0.12));
      a += (hashf(t, i, seed + 35) - 0.5) * 1.2; x += Math.cos(a); y += Math.sin(a);
    }
  }
}
/** a capsule from (x0,y0) to (x1,y1), shaded as a cylinder */
export function cyl(p: Pix, x0: number, y0: number, x1: number, y1: number, r: number, R: number[], o: { cap?: boolean; bands?: number; bandCol?: number } = {}) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
  const cap = o.cap ?? true;
  for (let y = Math.floor(Math.min(y0, y1) - r - 1); y <= Math.max(y0, y1) + r + 1; y++) for (let x = Math.floor(Math.min(x0, x1) - r - 1); x <= Math.max(x0, x1) + r + 1; x++) {
    const qx = x + 0.5 - x0, qy = y + 0.5 - y0, t = qx * ux + qy * uy, s = qx * px + qy * py;
    let d: number;
    if (t < 0) { if (!cap) continue; d = Math.hypot(t, s); } else if (t > L) { if (!cap) continue; d = Math.hypot(t - L, s); } else d = Math.abs(s);
    if (d > r) continue;
    const k = s / r, nz = Math.sqrt(Math.max(0, 1 - k * k));
    let v = ri(R, lam(px * k, py * k, nz), 0.15);
    if (o.bands && t > 0 && t < L && Math.floor(t / o.bands) % 2 === 1) v -= 0.9;
    p.set(x, y, o.bandCol !== undefined && o.bands && t > 0 && t < L && Math.floor(t / o.bands) % 2 === 1 ? o.bandCol : dv(R, v, x, y));
  }
}
/** a bevelled plate */
export function box(p: Pix, x: number, y: number, w: number, h: number, R: number[], o: { rivets?: boolean; seed?: number; chamfer?: number; noise?: number } = {}) {
  const m = R.length, ch = o.chamfer ?? 1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (i + j < ch || (w - 1 - i) + j < ch || i + (h - 1 - j) < ch || (w - 1 - i) + (h - 1 - j) < ch) continue;
    let v = m * 0.5 - (j / h) * 0.9 + (hashf(x + i, y + j, o.seed ?? 3) - 0.5) * (o.noise ?? 0.6);
    if (j === 0 || i === 0) v = m - 1.3; else if (j === h - 1 || i === w - 1) v = 0.8;
    p.set(x + i, y + j, dv(R, v, x + i, y + j));
  }
  if (o.rivets && w > 5 && h > 4) for (const [rx, ry] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]]) { p.set(rx, ry, R[m - 1]); p.set(rx + 1, ry + 1, R[1]); }
}
/** filled polygon with a colour function */
export function poly(p: Pix, pts: [number, number][], col: (x: number, y: number) => number) {
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const xs: number[] = [], yc = y + 0.5;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) { const c = col(x, y); if (c >= 0) p.set(x, y, c); }
  }
}
/** ellipse outline; part: 'back' = upper half, 'front' = lower half */
export function ring(p: Pix, cx: number, cy: number, rx: number, ry: number, col: number, a = 255, part: 'all' | 'back' | 'front' = 'all', dash = 0) {
  const n = Math.ceil((rx + ry) * 4);
  let last = '';
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, x = Math.round(cx + Math.cos(t) * rx - 0.5), y = Math.round(cy + Math.sin(t) * ry - 0.5);
    if (part === 'back' && Math.sin(t) > 0.05) continue;
    if (part === 'front' && Math.sin(t) < -0.05) continue;
    if (dash && Math.floor((i / n) * dash * 2) % 2) continue;
    const k = x + ',' + y; if (k === last) continue; last = k;
    p.set(x, y, col, a);
  }
}
/** a soft dithered glow (drawn over everything) */
export function glow(p: Pix, cx: number, cy: number, r: number, col: number, amax = 150) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r; if (d >= 1) continue;
    const a = (1 - d) * (1 - d);
    const q = a > 0.55 ? 1 : a > 0.25 ? 0.6 : a > 0.08 ? 0.3 : (x + y) % 2 ? 0.15 : 0;
    if (q > 0) p.set(x, y, col, Math.round(amax * q));
  }
}
/** a jagged lightning bolt */
export function zap(p: Pix, x0: number, y0: number, x1: number, y1: number, col: number, seed = 1, hot = 0xffffff) {
  const n = 5, pts: [number, number][] = [[x0, y0]];
  for (let i = 1; i < n; i++) { const t = i / n; pts.push([x0 + (x1 - x0) * t + (hashf(i, seed, 2) - 0.5) * 5, y0 + (y1 - y0) * t + (hashf(i, seed, 3) - 0.5) * 5]); }
  pts.push([x1, y1]);
  for (let i = 0; i + 1 < pts.length; i++) { p.line(pts[i][0] + 1, pts[i][1], pts[i + 1][0] + 1, pts[i + 1][1], col, 150); p.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i % 2 ? col : hot); }
}
/** a 4-point sparkle */
export function spark(p: Pix, x: number, y: number, col = 0xffffff, s = 1) {
  p.set(x, y, col);
  for (let k = 1; k <= s; k++) { const a = k === s ? 150 : 230; p.set(x + k, y, col, a); p.set(x - k, y, col, a); p.set(x, y + k, col, a); p.set(x, y - k, col, a); }
}
/** motion streaks */
export function streaks(p: Pix, x: number, y: number, dx: number, dy: number, n: number, len: number, col: number, gap = 3) {
  const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * gap, sx = x - uy * o, sy = y + ux * o, l = len * (i % 2 ? 0.7 : 1);
    for (let t = 0; t < l; t++) p.set(Math.round(sx - ux * t), Math.round(sy - uy * t), col, Math.round(220 * (1 - t / l)));
  }
}
/** ink outline around every opaque pixel (4-neighbourhood), then a soft drop shadow down-right */
export function outline(p: Pix, col = INK) {
  const W = p.w, H = p.h, a = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) a[i] = p.d[i * 4 + 3] > 160 ? 1 : 0;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && a[y * W + x] === 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) p.set(x, y, col);
  for (let y = H - 1; y > 0; y--) for (let x = W - 1; x > 0; x--) if (p.d[(y * W + x) * 4 + 3] === 0 && (on(x - 1, y - 1) || p.get(x - 1, y - 1) === col)) p.set(x, y, 0x000000, 90);
}

// ------------------------------------------------------------------ the golem's parts
/** the survey head: rock skull, olive brow plate, brass lens with a glowing eye */
export function head(p: Pix, cx: number, cy: number, r: number, K: Kit, o: { antenna?: boolean; look?: number; seed?: number } = {}) {
  const lk = o.look ?? 0.3;
  rock(p, cx, cy, r, r * 0.9, K.rock, o.seed ?? 202, { rough: 0.1, cracks: r > 7 ? 2 : 0, moss: r > 7 ? K.moss : undefined, mossK: 0.5 });
  if (r >= 6) box(p, Math.round(cx - r * 0.75 + lk * 2), Math.round(cy - r * 0.62), Math.round(r * 1.5), Math.max(2, Math.round(r * 0.28)), K.met, { seed: 5 });
  // lens: a brass barrel, chrome ring, dark glass and the eye
  const lx = cx + r * lk, ly = cy + r * 0.08, lr = r * 0.5;
  ball(p, lx, ly, lr + 0.6, lr + 0.6, BR, { noise: 0.2, amb: 0.3 });
  ball(p, lx + 0.3, ly + 0.3, lr * 0.74, lr * 0.74, [INK, 0x0a1414, 0x102222], { noise: 0 });
  const er = Math.max(1.1, lr * 0.42);
  ball(p, lx + 0.4, ly + 0.4, er, er, K.glow.slice(3), { noise: 0, amb: 0.6 });
  p.set(Math.floor(lx - lr * 0.35), Math.floor(ly - lr * 0.35), 0xffffff);
  if (r >= 7) { // jaw grille
    const jx = Math.round(cx - r * 0.25 + lk * 2), jy = Math.round(cy + r * 0.6), jw = Math.round(r * 0.75);
    box(p, jx, jy, jw, 3, GM.slice(1, 8), { chamfer: 0 });
    for (let i = 1; i < jw; i += 2) p.set(jx + i, jy + 1, INK);
  }
  if (o.antenna) {
    const ax = Math.round(cx + r * 0.45), ay = Math.round(cy - r * 0.78);
    p.line(ax, ay, ax + 3, ay - Math.round(r * 0.75), CHROME[5]); p.line(ax + 1, ay, ax + 4, ay - Math.round(r * 0.75), CHROME[3]);
    ball(p, ax + 3.5, ay - r * 0.75 - 1, 1.6, 1.6, RD, { noise: 0, amb: 0.5 });
  }
}
/** a lit lens beam from a point, dashed */
function beam(p: Pix, x0: number, y0: number, x1: number, y1: number, K: Kit) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  for (let t = 0; t < L; t++) {
    const x = Math.round(x0 + ((x1 - x0) * t) / L), y = Math.round(y0 + ((y1 - y0) * t) / L);
    p.set(x, y, K.glow[5], 200); if (t % 3 !== 1) { p.set(x + 1, y, K.glow[4], 120); p.set(x, y + 1, K.glow[3], 90); }
  }
}
/** the chest boulder with its riveted plate and the reactor porthole */
export function torsoPart(p: Pix, cx: number, cy: number, rx: number, ry: number, K: Kit, o: { port?: number } = {}) {
  rock(p, cx, cy, rx, ry, K.rock, 101, { rough: 0.12, moss: K.moss, mossK: 0.45 });
  const pw = Math.round(rx * 1.25), ph = Math.round(ry * 0.95), px = Math.round(cx - pw / 2), py = Math.round(cy - ph / 2 + ry * 0.08);
  box(p, px, py, pw, ph, K.met, { rivets: true, seed: 9 });
  if (pw > 10) { p.hl(px + 2, px + 5, py + ph - 3, CR[1]); p.hl(px + 2, px + 4, py + ph - 5, CR[1]); }
  const pr = o.port ?? Math.max(2, ry * 0.36), qx = px + pw * 0.66, qy = py + ph * 0.48;
  ball(p, qx, qy, pr + 1, pr + 1, BR, { noise: 0.2, amb: 0.3 });
  ball(p, qx + 0.2, qy + 0.2, pr, pr, K.glow.slice(2), { noise: 0, amb: 0.7 });
  p.set(Math.floor(qx - pr * 0.4), Math.floor(qy - pr * 0.4), 0xffffff);
}
/** a stone arm: a shoulder boulder with a plate cap, elongated stones for upper and fore arm, a fist; chrome
 * pistons bridge every gap */
export function arm(p: Pix, pts: [number, number][], K: Kit, o: { fist?: number; seed?: number; claw?: boolean; scale?: number } = {}) {
  const k = o.scale ?? 1, sd = o.seed ?? 400, n = pts.length;
  const seg = (i: number) => { const [a, b] = [pts[i], pts[i + 1]]; return { mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, L: Math.hypot(b[0] - a[0], b[1] - a[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; };
  // pistons first (the stones sit over them)
  for (let i = 0; i + 1 < n; i++) { const [a, b] = [pts[i], pts[i + 1]]; cyl(p, a[0], a[1], b[0], b[1], 1.5 * k, RUB.concat([0x4a4640])); cyl(p, a[0], a[1] + 0.6, b[0], b[1] + 0.6, 0.7 * k, CHROME); }
  // stones along each segment, leaving the joints open so the pistons show
  for (let i = 0; i + 1 < n - 1; i++) { const g = seg(i); rock(p, g.mx, g.my, Math.max(2, g.L * 0.34), 2.6 * k, K.rock, sd + 10 + i, { rough: 0.12, cracks: 0, ang: g.ang }); }
  const [sx, sy] = pts[0];
  rock(p, sx, sy, 3.8 * k, 3.5 * k, K.rock, sd, { rough: 0.12, cracks: 0 });
  ball(p, sx - 0.5, sy - 1.2 * k, 3.2 * k, 2.1 * k, K.met, { noise: 0.3 });
  if (n > 2) { const g = seg(n - 2); cyl(p, g.mx - Math.cos(g.ang) * g.L * 0.1, g.my - Math.sin(g.ang) * g.L * 0.1, g.mx + Math.cos(g.ang) * g.L * 0.1, g.my + Math.sin(g.ang) * g.L * 0.1, 2.2 * k, K.met, { cap: false }); }
  const [fx, fy] = pts[n - 1], fr = o.fist ?? 3.8;
  rock(p, fx, fy, fr, fr * 0.9, K.rock, sd + 7, { rough: 0.12, cracks: 0 });
  if (!o.claw) { const g = seg(n - 2), nx = Math.cos(g.ang), ny = Math.sin(g.ang); for (let j = -1; j <= 1; j++) ball(p, fx + nx * fr * 0.7 - ny * j * 1.7, fy + ny * fr * 0.7 + nx * j * 1.7, 0.9, 0.9, CHROME, { noise: 0 }); }
  else { const g = seg(n - 2), nx = Math.cos(g.ang), ny = Math.sin(g.ang); for (const j of [-1, 1]) cyl(p, fx + nx * fr * 0.5 - ny * j * fr * 0.6, fy + ny * fr * 0.5 + nx * j * fr * 0.6, fx + nx * fr * 1.1 - ny * j * fr * 0.45, fy + ny * fr * 1.1 + nx * j * fr * 0.45, 0.8, CHROME); }
}
/** the gravity coil: stacked brass turns with field light between them */
export function coilPart(p: Pix, cx: number, cy: number, rx: number, n: number, K: Kit, gap = 2.2) {
  for (let i = n - 1; i >= 0; i--) {
    const y = cy + i * gap, r = rx - i * (rx * 0.12);
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2, x = cx + Math.cos(t) * r, yy = y + Math.sin(t) * r * 0.3;
      const front = Math.sin(t) > 0, l = clamp(0.5 - Math.cos(t) * 0.45 + (front ? 0.2 : -0.3), 0, 1);
      p.set(Math.round(x), Math.round(yy), dv(i % 2 ? CU : BR, l * 6 + 1, Math.round(x), Math.round(yy)));
      p.set(Math.round(x), Math.round(yy) + 1, dv(i % 2 ? CU : BR, l * 3, Math.round(x), Math.round(yy) + 1));
    }
  }
}
/** a whole Unit 07 at about 26px tall; s scales it */
export function golem(p: Pix, cx: number, cy: number, s: number, K: Kit, o: { lean?: number; arms?: boolean } = {}) {
  const ln = o.lean ?? 0;
  coilPart(p, cx - ln * 2, cy + 9 * s, 4.5 * s, 3, K, 1.8 * s);
  if (o.arms !== false) {
    arm(p, [[cx - 7.5 * s + ln, cy - 1 * s], [cx - 9 * s + ln, cy + 3 * s], [cx - 9.5 * s + ln, cy + 6.5 * s]], K, { fist: 2.6 * s, seed: 410 });
  }
  torsoPart(p, cx + ln, cy + 1 * s, 6.5 * s, 5.5 * s, K, { port: 1.6 * s });
  if (o.arms !== false) arm(p, [[cx + 7.5 * s + ln, cy - 1 * s], [cx + 9 * s + ln, cy + 3 * s], [cx + 9.5 * s + ln, cy + 6.5 * s]], K, { fist: 2.6 * s, seed: 420 });
  head(p, cx + ln * 2, cy - 8.5 * s, 4.6 * s, K, { look: 0.25 });
}
/** a generic alien creature in profile (convert / print / lab) */
export function critter(p: Pix, cx: number, cy: number, s: number, R = FLESH, o: { eye?: number; legs?: boolean } = {}) {
  ball(p, cx, cy, 6 * s, 4 * s, R, { seed: 7 });
  ball(p, cx + 6 * s, cy - 2.5 * s, 3.4 * s, 3 * s, R, { seed: 8 });
  poly(p, [[cx + 8.5 * s, cy - 3 * s], [cx + 12 * s, cy - 1.5 * s], [cx + 8.5 * s, cy - 0.5 * s]], (x, y) => dv(CR, 2.5 - (y - cy) * 0.2, x, y));
  if (o.legs !== false) for (const lx of [-4, -1, 2, 4.5]) cyl(p, cx + lx * s, cy + 2.5 * s, cx + (lx - 1) * s, cy + 6 * s, 0.8 * s, R);
  for (let i = 0; i < 3; i++) ball(p, cx - 3 * s + i * 2.6 * s, cy - 3.6 * s, 1.2 * s, 1.4 * s, R.slice(2), { seed: 9 + i });
  const e = o.eye ?? 0xffe060; p.set(Math.round(cx + 7 * s), Math.round(cy - 3 * s), e); p.set(Math.round(cx + 7 * s) + 1, Math.round(cy - 3 * s), mixc(e, 0, 0.3));
}
function ground(p: Pix, y: number, R = SOIL, top = LEAF) {
  for (let x = 0; x < 32; x++) for (let j = y; j < 32; j++) {
    const v = 4 - (j - y) * 0.35 + (hashf(x >> 1, j, 3) - 0.5) * 1.2;
    p.set(x, j, j === y || (j === y + 1 && hashf(x, 0, 2) < 0.4) ? dv(top, 3.5 + hashf(x, j, 4), x, j) : dv(R, v, x, j));
  }
}
function pebble(p: Pix, x: number, y: number, r: number, K: Kit, seed: number) { rock(p, x, y, r, r * 0.85, K.rock, seed, { rough: 0.18, cracks: 0 }); }
function oreChunk(p: Pix, x: number, y: number, r: number, seed: number) {
  rock(p, x, y, r, r * 0.85, GM.slice(1, 9), seed, { rough: 0.2, cracks: 0 });
  for (let i = 0; i < r * 1.5; i++) { const a = hashf(i, seed, 1) * 6.3, d = hashf(i, seed, 2) * r * 0.7; const X = Math.round(x + Math.cos(a) * d), Y = Math.round(y + Math.sin(a) * d); p.set(X, Y, ORE[5]); p.set(X + 1, Y, ORE[6]); }
}

// ------------------------------------------------------------------ the icons
type Painter = (p: Pix, K: Kit) => void;
const ICONS: Record<string, Painter> = {
  // ---------------- CHASSIS
  head(p, K) {
    ring(p, 15, 27.5, 9, 2.4, K.glow[3], 255, 'back');
    head(p, 15, 14, 10.5, K, { antenna: true });
    ring(p, 15, 27.5, 9, 2.4, K.glow[4], 255, 'front');
    outline(p);
    ring(p, 15, 27.5, 11, 3, K.glow[3], 120, 'front', 6);
    glow(p, 19, 15, 6, K.g, 70);
    for (const [x, y] of [[5, 22], [26, 24], [9, 29]]) p.set(x, y, K.glow[5]);
  },
  torso(p, K) {
    torsoPart(p, 16, 22, 11, 8.5, K);
    head(p, 16, 6.5, 5.6, K, { look: 0.3 });
    outline(p);
    for (let y = 12; y < 15; y++) if (y % 2) p.set(16, y, K.glow[5]);
    glow(p, 22, 22, 6, K.g, 80);
  },
  armR(p, K) {
    arm(p, [[5, 8], [10, 17], [20, 19], [25, 19]], K, { fist: 5.4, scale: 1.2 });
    outline(p);
    streaks(p, 13, 27, 1, 0, 3, 7, CR[3], 2);
    spark(p, 30, 13, 0xfff0c0, 2); spark(p, 30, 25, 0xfff0c0, 1);
  },
  armL(p, K) {
    arm(p, [[24, 27], [16, 23], [12, 14], [12, 9]], K, { fist: 4, seed: 430, claw: true, scale: 1.2 });
    oreChunk(p, 12, 4, 4.4, 3);
    outline(p);
    ring(p, 12, 4.5, 7, 4.5, K.glow[4], 140, 'all', 5);
    glow(p, 12, 4, 7, K.g, 60);
  },
  coil(p, K) {
    for (let i = 0; i < 4; i++) glow(p, 16, 13 + i * 3.4, 7, K.g, 45);
    coilPart(p, 16, 11, 11, 5, K, 3.4);
    pebble(p, 4, 9, 2.6, K, 300); pebble(p, 28, 14, 2.2, K, 301); pebble(p, 7, 27, 2, K, 302);
    outline(p);
    for (let i = 0; i < 5; i++) for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; if (Math.sin(t) > 0.2) continue; const x = 16 + Math.cos(t) * (11 - i * 1.3), y = 11 + i * 3.4 + 1 + Math.sin(t) * 2.2; if (a % 3 === 0) p.set(Math.round(x), Math.round(y), K.glow[5], 200); }
    ring(p, 16, 26, 7, 1.6, K.glow[4], 160, 'front', 4);
  },
  reactor(p, K) {
    glow(p, 16, 16, 15, K.g, 70);
    ball(p, 16, 16, 13, 13, BR, { noise: 0.25, amb: 0.25 });
    ball(p, 16, 16, 9.8, 9.8, [INK, 0x081010, 0x0c1a1a, 0x102424], { noise: 0 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39; ball(p, 16 + Math.cos(a) * 11.4, 16 + Math.sin(a) * 11.4, 1.3, 1.3, CHROME, { noise: 0 }); }
    // the bloom: petals of light opening around a white core
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.2; poly(p, [[16 + Math.cos(a - 0.35) * 2.5, 16 + Math.sin(a - 0.35) * 2.5], [16 + Math.cos(a) * 8.6, 16 + Math.sin(a) * 8.6], [16 + Math.cos(a + 0.35) * 2.5, 16 + Math.sin(a + 0.35) * 2.5]], (x, y) => dv(K.glow, 3 + 2.5 * (1 - Math.hypot(x - 16, y - 16) / 9), x, y)); }
    ball(p, 16, 16, 3.2, 3.2, [K.glow[4], K.glow[5], K.glow[6], 0xffffff], { noise: 0, amb: 0.8 });
    outline(p);
    p.set(9, 8, 0xffffff, 200); p.set(10, 7, 0xffffff, 140); p.set(8, 9, 0xffffff, 140);
    glow(p, 16, 16, 6, 0xffffff, 90);
  },
  plating1(p, K) {
    box(p, 6, 4, 20, 24, K.met, { rivets: true, chamfer: 3, seed: 11 });
    for (let y = 8; y < 25; y += 4) { p.set(8, y, K.met[1]); p.set(23, y, K.met[1]); }
    box(p, 14, 9, 4, 14, CR.concat([0xf8f0d8]), { chamfer: 0, noise: 0.3 });
    outline(p);
    p.line(8, 6, 11, 6, K.met[6]);
  },
  plating2(p, K) {
    box(p, 3, 7, 18, 22, mixRamp(K.met, 0x000000, 0.25), { rivets: true, chamfer: 3, seed: 12 });
    box(p, 11, 3, 18, 22, K.met, { rivets: true, chamfer: 3, seed: 13 });
    for (const x of [16, 22]) box(p, x, 8, 3, 12, CR.concat([0xf8f0d8]), { chamfer: 0, noise: 0.3 });
    for (let x = 13; x < 27; x += 3) { p.set(x, 22, GM[7]); p.set(x, 23, GM[2]); }
    outline(p);
  },
  plating3(p, K) {
    poly(p, [[4, 4], [28, 4], [28, 20], [16, 29], [4, 20]], (x, y) => dv(GM.slice(2, 9), 4 - y * 0.08 - x * 0.03 + (hashf(x, y, 4) - 0.5) * 0.6, x, y));
    for (let y = 5; y < 10; y++) for (let x = 5; x < 28; x++) p.set(x, y, ((x + y) % 8) < 4 ? (y === 5 ? HZ.yl : HZ.y) : HZ.k);
    for (const x of [11, 16, 21]) box(p, x - 1, 12, 3, 9, CR.concat([0xf8f0d8]), { chamfer: 0, noise: 0.3 });
    for (const [x, y] of [[6, 12], [25, 12], [8, 19], [23, 19], [16, 25]]) { p.set(x, y, GM[9]); p.set(x + 1, y, GM[5]); p.set(x, y + 1, GM[4]); p.set(x + 1, y + 1, GM[2]); }
    outline(p);
  },
  colossus(p, K) {
    for (let x = 0; x < 32; x++) p.set(x, 30, SOIL[3]);
    golem(p, 16, 15, 1.05, K);
    outline(p);
    for (const [x, y] of [[3, 4], [28, 6], [5, 15], [27, 19]]) spark(p, x, y, K.glow[5], 1);
    p.line(8, 31, 12, 29, INK); p.line(24, 31, 21, 29, INK); p.line(16, 31, 16, 29, INK);
    glow(p, 17, 15, 4, K.g, 70);
  },
  // ---------------- HARVEST
  drill(p, K) {
    oreChunk(p, 23, 22, 8.5, 12);
    box(p, 1, 3, 12, 9, K.met, { rivets: true, seed: 14 });
    // the bit: a fluted cone pointing down-right into the seam
    poly(p, [[9, 9], [13, 5], [22, 18]], (x, y) => { const t = ((x - y) % 4 + 4) % 4; return dv(CHROME, (t < 2 ? 5.5 : 3) - (x + y) * 0.04, x, y); });
    outline(p);
    for (const [x, y, c] of [[24, 13, 0xfff0a0], [27, 16, ORE[6]], [19, 12, 0xffffff], [28, 11, ORE[5]], [25, 10, 0xfff0a0]] as [number, number, number][]) spark(p, x, y, c, 1);
    glow(p, 21, 17, 4, 0xffd080, 120);
  },
  excavate(p, K) {
    ground(p, 22);
    for (let x = 14; x < 26; x++) for (let y = 22; y < 22 + Math.round(4 * Math.sin(((x - 14) / 12) * Math.PI)); y++) p.set(x, y, SOIL[1]);
    cyl(p, 3, 3, 12, 14, 2, K.met);
    poly(p, [[9, 10], [20, 13], [21, 21], [12, 20]], (x, y) => dv(GM.slice(2, 9), 5 - (y - 10) * 0.25 + (x - 9) * 0.05, x, y));
    for (let i = 0; i < 4; i++) { p.set(12 + i * 3, 21, CHROME[6]); p.set(12 + i * 3, 22, CHROME[4]); }
    for (let x = 11; x < 20; x++) for (let y = 11; y < 14; y++) if (hashf(x, y, 2) < 0.8) p.set(x + 1, y + 1, dv(SOIL, 4 + hashf(x, y, 3) * 2, x, y));
    pebble(p, 24, 8, 2, { ...K, rock: SOIL }, 5); pebble(p, 28, 13, 1.6, { ...K, rock: SOIL }, 6); pebble(p, 21, 5, 1.3, { ...K, rock: SOIL }, 7);
    outline(p);
  },
  siphon(p, K) {
    for (let y = 21; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, dv(WATER, 4.5 - (y - 21) * 0.32 + (Math.sin(x * 0.7 + y) > 0.6 ? 1 : 0), x, y));
    // hose from top-left down into the pool, with a brass hand pump
    cyl(p, 2, 3, 12, 6, 2.1, RUB.concat([0x4a4640, 0x5a5650]), { bands: 2 });
    cyl(p, 12, 6, 17, 18, 2.1, RUB.concat([0x4a4640, 0x5a5650]), { bands: 2 });
    cyl(p, 17, 17, 17.5, 22, 2.4, BR);
    box(p, 20, 3, 8, 12, WATER.slice(1), { chamfer: 1, rivets: true });
    box(p, 19, 2, 10, 2, BR, { chamfer: 0 });
    outline(p);
    for (let i = 0; i < 4; i++) { const y = 22 + i * 2; ring(p, 17.5, y, 3 + i * 2.5, 0.8 + i * 0.4, WATER[7 - Math.min(3, i)], 200 - i * 40, 'all'); }
    for (const [x, y] of [[14, 12], [11, 7], [6, 5]]) { p.set(x, y, WATER[7]); p.set(x, y + 1, WATER[6]); }
    for (let y = 6; y < 14; y += 2) p.set(24, y, WATER[6]);
  },
  intake(p, K) {
    // a withered plant on the left gives up its carbon to a furnace mouth on the right
    cyl(p, 6, 29, 8, 14, 1.2, SOIL.slice(1, 6), { cap: false }); cyl(p, 8, 14, 4, 8, 1, SOIL.slice(1, 6)); cyl(p, 8, 18, 12, 12, 0.9, SOIL.slice(1, 6));
    for (const [x, y] of [[4, 8], [12, 12], [5, 20]]) ball(p, x, y, 2, 1.4, CARB.slice(2), { seed: x });
    box(p, 16, 6, 15, 21, K.met, { rivets: true, seed: 15 });
    box(p, 18, 10, 11, 12, GM.slice(0, 5), { chamfer: 1 });
    for (let y = 11; y < 21; y++) for (let x = 19; x < 28; x++) p.set(x, y, x % 3 === 0 ? INK : dv(HOT, 3.5 - (y - 11) * 0.12 + hashf(x, y, 5), x, y));
    outline(p);
    for (let i = 0; i < 9; i++) { const t = i / 8, x = 9 + t * 9, y = 14 - Math.sin(t * 3.1) * 4 + (i % 2) * 2; p.set(Math.round(x), Math.round(y), i % 3 ? CARB[6] : CARB[7]); p.set(Math.round(x) + 1, Math.round(y), CARB[4], 160); }
    glow(p, 23, 16, 8, 0xff8a30, 70);
  },
  magnet(p, K) {
    // a red horseshoe magnet hanging from the coil, pulling ore pickups in
    for (let a = 0; a <= 40; a++) {
      const t = Math.PI * (a / 40);
      for (let rr = 6; rr <= 10; rr++) { const x = 12 + Math.cos(t) * rr, y = 13 - Math.sin(t) * rr; p.set(Math.round(x), Math.round(y), dv(RD, 2 + (10 - rr) * 0.2 + (Math.cos(t) * -1.5) + 1.5 - (rr === 10 ? 1 : 0), Math.round(x), Math.round(y))); }
    }
    for (const x of [2, 18]) { box(p, x, 13, 5, 5, RD.slice(2), { chamfer: 0 }); box(p, x, 18, 5, 4, CHROME, { chamfer: 0 }); }
    oreChunk(p, 26, 26, 3.4, 21); oreChunk(p, 13, 28, 2.6, 22); oreChunk(p, 28, 15, 2.4, 23);
    outline(p);
    streaks(p, 24, 24, -1, -1, 2, 5, ORE[6], 3); streaks(p, 12, 26, 0, -1, 1, 3, ORE[6]); streaks(p, 26, 15, -1, 0, 1, 4, ORE[6]);
    for (let a = 0; a < 3; a++) ring(p, 12, 24, 4 + a * 3, 2 + a * 1.4, K.glow[4], 150 - a * 40, 'front', 5);
  },
  tanks(p, K) {
    const cols = [ORE, WATER, CARB];
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 9.5;
      cyl(p, x + 3.5, 8, x + 3.5, 26, 4, GM.slice(1, 9));
      box(p, x + 2, 11, 3, 11, cols[i].slice(2), { chamfer: 0, noise: 0.2 });
      for (let y = 11; y < 11 + (i === 0 ? 4 : i === 1 ? 2 : 6); y++) { p.set(x + 2, y, INK); p.set(x + 3, y, INK); p.set(x + 4, y, INK); }
      for (const y of [9, 24]) { p.hl(x, x + 7, y, BR[5]); p.hl(x, x + 7, y + 1, BR[2]); }
      ball(p, x + 3.5, 5.5, 2, 1.6, BR, { noise: 0.2 });
    }
    outline(p);
  },
  bore(p, K) {
    // a derrick over layered strata, the bit deep in an ore seam
    for (let y = 14; y < 32; y++) for (let x = 0; x < 32; x++) {
      const band = Math.max(0, Math.floor((y - 14 + Math.sin(x * 0.4) * 1.2) / 4.5)), R = [SOIL, K.rock, SOIL, GM.slice(1, 8)][band % 4];
      p.set(x, y, dv(R, 3.5 - (y - 14) * 0.08 + (hashf(x >> 1, y >> 1, band) - 0.5), x, y));
    }
    for (const [x, y] of [[20, 28], [25, 29], [8, 29]]) { p.set(x, y, ORE[6]); p.set(x + 1, y, ORE[5]); p.set(x, y - 1, ORE[7]); }
    for (let y = 14; y < 28; y++) { p.set(15, y, INK); p.set(16, y, CHROME[y % 3 ? 4 : 6]); p.set(17, y, INK); }
    poly(p, [[14, 27], [19, 27], [16.5, 31]], (x, y) => dv(CHROME, 6 - (y - 27), x, y));
    // derrick lattice
    p.line(9, 14, 16, 1, GM[7]); p.line(23, 14, 16, 1, GM[7]); p.line(10, 14, 16, 2, GM[5]); p.line(22, 14, 16, 2, GM[5]);
    for (let k = 0; k < 4; k++) { const y = 4 + k * 3, w = 2 + k * 1.8; p.line(16 - w, y, 16 + w, y + 2, GM[6]); p.line(16 + w, y, 16 - w, y + 2, GM[4]); }
    box(p, 11, 11, 11, 4, K.met, { chamfer: 0 });
    outline(p);
    glow(p, 16.5, 29, 4, 0xffd080, 100);
    spark(p, 13, 29, 0xfff0a0, 1); spark(p, 20, 30, 0xffffff, 1);
  },
  refinery(p, K) {
    // a crucible tipping molten ore into an ingot mould
    box(p, 1, 24, 30, 6, GM.slice(1, 8), { rivets: true });
    box(p, 14, 20, 15, 5, GM.slice(0, 5), { chamfer: 0 });
    for (let x = 15; x < 28; x++) for (let y = 21; y < 24; y++) p.set(x, y, dv(HOT, 5 - (y - 21) * 0.5 + hashf(x, y, 2), x, y));
    poly(p, [[3, 4], [15, 8], [12, 18], [3, 15]], (x, y) => dv(GM.slice(2, 9), 4.5 - (y - 4) * 0.15 - (x - 3) * 0.05 + (hashf(x, y, 3) - 0.5) * 0.6, x, y));
    poly(p, [[4, 5], [14, 8.5], [13, 10], [4, 7.5]], (x, y) => dv(HOT, 6 + hashf(x, y, 1), x, y));
    for (let y = 9; y < 21; y++) { const x = 14 + Math.round((y - 9) * 0.45); p.set(x, y, HOT[6]); p.set(x + 1, y, HOT[5]); p.set(x + 2, y, HOT[4], 200); }
    cyl(p, 0, 11, 5, 11, 1.3, BR);
    outline(p);
    glow(p, 17, 18, 10, 0xff8a30, 90);
    for (const [x, y] of [[20, 14], [24, 17], [12, 22], [27, 12]]) spark(p, x, y, HOT[6], 1);
  },
  // ---------------- GRAVITY
  lift(p, K) {
    for (let i = 0; i < 3; i++) ring(p, 22, 11, 7 + i * 1.5, 2 + i * 0.6, K.glow[3 + i % 2], 255, 'back');
    rock(p, 22, 9, 7, 6, K.rock, 61, { rough: 0.2 });
    head(p, 7.5, 24.5, 6.4, K, { look: 0.45 });
    outline(p);
    for (let i = 0; i < 3; i++) ring(p, 22, 11, 7 + i * 1.5, 2 + i * 0.6, K.glow[4 + i % 2], 255, 'front');
    beam(p, 12, 23, 20, 14, K);
    glow(p, 22, 10, 9, K.g, 60);
    for (const [x, y] of [[18, 21], [26, 19], [29, 4]]) p.set(x, y, K.glow[5]);
  },
  slam(p, K) {
    ground(p, 24, K.rock, K.rock);
    for (const [x, w] of [[5, 5], [21, 6]] as [number, number][]) rock(p, x + w / 2, 24, w / 2, 1.6, K.rock, x, { rough: 0.3, cracks: 0 });
    // a crushing column of field
    poly(p, [[10, 1], [22, 1], [22, 11], [27, 11], [16, 22], [5, 11], [10, 11]], (x, y) => dv(K.glow, 3 + (y % 4 < 2 ? 1 : 0) - (x - 10) * 0.05, x, y));
    outline(p);
    p.line(16, 25, 12, 29, INK); p.line(16, 25, 21, 30, INK); p.line(16, 25, 16, 31, INK); p.line(12, 29, 9, 30, INK);
    for (const [x, y] of [[3, 20], [29, 21], [6, 17], [26, 17]]) spark(p, x, y, 0xffffff, 1);
    streaks(p, 4, 21, -1, 0, 2, 4, CR[3], 2); streaks(p, 28, 21, 1, 0, 2, 4, CR[3], 2);
    glow(p, 16, 22, 7, K.g, 90);
  },
  repulse(p, K) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, r = 11.5; rock(p, 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, 2.6, 2.3, K.rock, 70 + i, { rough: 0.2, cracks: 0 }); }
    ball(p, 16, 16, 3.5, 3.5, K.glow.slice(2), { noise: 0, amb: 0.7 });
    outline(p);
    ring(p, 16, 16, 7, 7, K.glow[5], 220); ring(p, 16, 16, 8, 8, K.glow[3], 140, 'all', 8);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; streaks(p, 16 + Math.cos(a) * 8.5, 16 + Math.sin(a) * 8.5, Math.cos(a), Math.sin(a), 1, 3, K.glow[4]); }
    glow(p, 16, 16, 9, K.g, 100);
  },
  shape(p, K) {
    ground(p, 24);
    // a pillar of earth shoved up through the turf
    poly(p, [[11, 7], [21, 6], [23, 24], [9, 24]], (x, y) => dv(y < 9 ? LEAF : SOIL, (y < 9 ? 4 : 4.5) - (x - 9) * 0.12 - (y - 6) * 0.04 + (hashf(x >> 1, y >> 1, 3) - 0.5) * 1.2, x, y));
    for (let y = 10; y < 24; y += 4) { p.hl(10, 21, y, SOIL[2]); }
    pebble(p, 6, 21, 1.8, K, 81); pebble(p, 26, 20, 2.2, K, 82);
    outline(p);
    poly(p, [[26, 3], [30, 9], [27.5, 9], [27.5, 15], [24.5, 15], [24.5, 9], [22, 9]], () => K.glow[5]);
    glow(p, 16, 24, 9, K.g, 60);
    p.line(8, 25, 4, 28, INK); p.line(24, 25, 28, 28, INK);
  },
  well(p, K) {
    // a spiral sink with debris riding it in
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - 16, dy = (y + 0.5 - 16) * 1.25, r = Math.hypot(dx, dy); if (r > 14) continue;
      const a = Math.atan2(dy, dx), arm2 = Math.sin(a * 2 + Math.log(r + 1) * 4.2);
      if (r < 3) { p.set(x, y, INK); continue; }
      if (arm2 > 0.25) p.set(x, y, dv(K.glow, 1.5 + (1 - r / 14) * 4.5 + arm2, x, y), Math.round(255 * Math.min(1, (14 - r) / 4)));
    }
    for (const [x, y, s] of [[5, 9, 2.4], [26, 22, 2.2], [24, 6, 1.6], [9, 24, 1.8]] as [number, number, number][]) pebble(p, x, y, s, K, x * 3);
    outline(p);
    ring(p, 16, 16, 3.5, 2.8, 0xffffff, 200);
    glow(p, 16, 16, 7, K.g, 80);
  },
  storm(p, K) {
    ground(p, 27, K.rock, SOIL);
    for (let i = 0; i < 9; i++) {
      const t = i / 8, x = 4 + t * 24 + (hashf(i, 1, 3) - 0.5) * 4, y = 4 + (Math.abs(t - 0.5) * 2) * 3 + hashf(i, 2, 3) * 8;
      rock(p, x, y, 2 + hashf(i, 3, 3) * 1.5, 1.8 + hashf(i, 4, 3), K.rock, 90 + i, { rough: 0.2, cracks: 0 });
    }
    outline(p);
    for (let i = 0; i < 9; i++) { const t = i / 8, x = 4 + t * 24 + (hashf(i, 1, 3) - 0.5) * 4, y = 4 + (Math.abs(t - 0.5) * 2) * 3 + hashf(i, 2, 3) * 8; streaks(p, x, y - 2, (16 - x) * 0.05, -1, 1, 3, K.glow[4]); }
    ring(p, 16, 26.5, 6, 1.6, RD[6], 255); ring(p, 16, 26.5, 3, 0.8, RD[5], 255); p.set(16, 26, RD[7]);
    for (let i = 0; i < 3; i++) { p.line(16 + (i - 1) * 4, 15, 16 + (i - 1) * 2, 23, K.glow[5], 180); }
    glow(p, 16, 26, 6, 0xff6a44, 80);
  },
  amp(p, K) {
    for (let i = 0; i < 3; i++) for (let a = -60; a <= 60; a += 4) { const t = (a * Math.PI) / 180, r = 10 + i * 4; for (const sgn of [-1, 1]) p.set(Math.round(16 + sgn * Math.cos(t) * r), Math.round(14 + Math.sin(t) * r), K.glow[5 - i], 230 - i * 60); }
    // a big vacuum tube on a Bakelite socket
    for (let y = 5; y < 22; y++) for (let x = 10; x < 23; x++) {
      const top = y < 9 ? 9 - y : 0, dx = Math.abs(x + 0.5 - 16.5); if (dx > 6.2 - top * 0.9) continue;
      const edge = dx > 5.2 - top * 0.9 || y === 5;
      p.set(x, y, edge ? 0x6a7a7a : 0x1c2a2c, edge ? 255 : 235);
    }
    for (let y = 9; y < 20; y++) { p.set(12, y, GM[5]); p.set(20, y, GM[4]); }
    for (let y = 10; y < 19; y++) { p.set(16, y, AM[6]); p.set(15, y, AM[4], 180); p.set(17, y, AM[4], 180); }
    box(p, 9, 21, 15, 6, [0x0c0b0a, 0x171513, 0x221f1c, 0x2f2b27, 0x3e3933, 0x524b43], { chamfer: 1 });
    for (const x of [11, 16, 21]) p.set(x, 27, CHROME[6]);
    outline(p);
    p.set(12, 7, 0xffffff); p.set(12, 8, 0xc0e0e0);
    glow(p, 16, 14, 7, AM[5], 90);
  },
  // ---------------- COMBAT
  punch(p, K) {
    cyl(p, 0, 15, 9, 15, 1.6, RUB.concat([0x4a4640])); cyl(p, 1, 15, 8, 15, 0.9, CHROME);
    rock(p, 15, 15, 9, 8.5, K.rock, 431, { rough: 0.1, cracks: 1 });
    box(p, 19, 9, 5, 13, K.met, { chamfer: 1 });
    for (let k = 0; k < 4; k++) ball(p, 24.5, 9.5 + k * 3.6, 1.5, 1.5, CHROME, { noise: 0 });
    outline(p);
    for (const [x, y] of [[29, 6], [30, 15], [29, 24]]) spark(p, x, y, 0xfff0c0, 2);
    streaks(p, 4, 15, 1, 0, 3, 5, CR[3], 5);
  },
  rock(p, K) {
    arm(p, [[3, 28], [6, 19], [12, 15]], K, { fist: 4.2, seed: 440, claw: true, scale: 1.15 });
    pebble(p, 24, 7, 5, K, 33);
    outline(p);
    for (let i = 0; i < 6; i++) { const t = i / 5, x = 13 + t * 8, y = 15 - Math.sin(t * 1.6) * 7; p.set(Math.round(x), Math.round(y), CR[4], 220 - i * 25); }
    streaks(p, 20, 10, 1, -0.6, 3, 5, CR[3], 2);
  },
  shrapnel(p, K) {
    glow(p, 16, 16, 11, 0xffd080, 120);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2, r = 9 + (i % 2) * 3; rock(p, 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, 1.6 + (i % 3) * 0.5, 1.4 + (i % 2) * 0.5, K.rock, 50 + i, { rough: 0.35, cracks: 0 }); }
    outline(p);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; streaks(p, 16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, Math.cos(a), Math.sin(a), 1, 4, 0xfff0a0); }
    ball(p, 16, 16, 3.4, 3.4, [HOT[4], HOT[5], HOT[6], 0xffffff], { noise: 0, amb: 0.8 });
    spark(p, 16, 16, 0xffffff, 3);
  },
  boulder(p, K) {
    coilPart(p, 16, 27, 3.6, 2, K, 1.6);
    arm(p, [[9, 20], [6, 15], [7, 10]], K, { fist: 2.6, seed: 450, claw: true, scale: 0.8 });
    arm(p, [[23, 20], [26, 15], [25, 10]], K, { fist: 2.6, seed: 460, claw: true, scale: 0.8 });
    torsoPart(p, 16, 21, 6, 4.8, K, { port: 1.4 });
    head(p, 16, 13.5, 3.6, K, { look: 0.1 });
    rock(p, 16, 5.5, 12, 5.5, K.rock, 77, { rough: 0.12, moss: K.moss, mossK: 0.6 });
    outline(p);
    for (const [x, y] of [[2, 14], [30, 14]]) streaks(p, x, y, 0, -1, 1, 3, CR[3]);
    for (const x of [8, 24]) p.set(x, 12, CR[4]);
  },
  frenzy(p, K) {
    for (let i = 0; i < 3; i++) {
      const y = 6 + i * 9.5, x = 12 + (i === 1 ? 6 : 0);
      cyl(p, 0, y, x - 4, y, 1.2, RUB.concat([0x4a4640]));
      rock(p, x, y, 5, 4.2, K.rock, 470 + i, { rough: 0.12, cracks: 0 });
      for (let k = 0; k < 3; k++) p.set(x + 4, y - 2 + k * 2, CHROME[6]);
    }
    outline(p);
    for (let i = 0; i < 3; i++) { const y = 6 + i * 9.5, x = 12 + (i === 1 ? 6 : 0); streaks(p, x - 6, y, 1, 0, 2, 5, CR[3], 3); spark(p, x + 8, y, 0xfff0c0, 1); }
    spark(p, 29, 16, 0xffffff, 2);
  },
  plow(p, K) {
    for (let x = 0; x < 32; x++) for (let y = 27; y < 32; y++) p.set(x, y, dv(SOIL, 4 - (y - 27) * 0.6 + hashf(x, y, 1), x, y));
    // a bow wave of dirt thrown up ahead of the golem
    poly(p, [[14, 27], [22, 16], [25, 18], [21, 27]], (x, y) => dv(SOIL, 3 + hashf(x >> 1, y >> 1, 4) * 2 - (y - 16) * 0.08, x, y));
    const q = new Pix(32, 32); critter(q, 15, 14, 0.62, FLESH, { legs: true });
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const c = q.get(x, y); if (c >= 0) p.set(x + 12, 20 - y, c); }
    golem(p, 8, 17, 0.62, K, { lean: 2 });
    outline(p);
    streaks(p, 1, 17, -1, 0, 4, 6, CR[3], 3);
    for (const [x, y] of [[24, 13], [28, 17], [19, 14]]) pebble(p, x, y, 1.1, { ...K, rock: SOIL }, x);
    spark(p, 22, 4, 0xfff0c0, 2); spark(p, 29, 9, 0xffffff, 1);
    for (let i = 0; i < 3; i++) ring(p, 8, 28, 4 + i * 2, 1, K.glow[4], 150 - i * 40, 'front', 3);
  },
  servo(p, K) {
    // a hydraulic ram with a pressure gauge in the red
    box(p, 2, 13, 17, 9, RD.slice(1), { rivets: true });
    cyl(p, 19, 17.5, 29, 17.5, 1.6, CHROME);
    box(p, 27, 12, 4, 11, GM.slice(2, 9), { chamfer: 1 });
    cyl(p, 6, 13, 6, 8, 1, BR);
    ball(p, 7, 6, 5, 5, BR, { noise: 0.2 });
    ball(p, 7, 6, 3.6, 3.6, [0xb8ae8a, 0xd2c8a2, 0xe6dcb8], { noise: 0 });
    outline(p);
    p.line(7, 6, 10, 4, RD[5]); p.set(10, 4, RD[6]);
    zap(p, 13, 3, 26, 9, K.glow[5], 3, 0xffffff);
    zap(p, 16, 30, 28, 25, K.glow[5], 5, 0xffffff);
    streaks(p, 31, 17, 1, 0, 3, 3, CR[3], 3);
  },
  // ---------------- FABRICATION
  graft(p, K) {
    ground(p, 27);
    cyl(p, 13, 27, 12, 14, 1.4, LEAF.slice(1, 7), { cap: false });
    p.line(12, 19, 6, 12, LEAF[4]); p.line(13, 16, 20, 9, LEAF[4]);
    ball(p, 6, 10, 4, 3, LEAF, { seed: 4 }); ball(p, 20, 8, 4.4, 3.2, LEAF, { seed: 5 });
    ball(p, 12, 6, 3.6, 4.6, K.glow.slice(0, 6), { seed: 6 });
    // a brass hypo with a glowing charge
    cyl(p, 30, 26, 19, 18, 2, BR); cyl(p, 26, 23, 21, 19.5, 1.1, K.glow.slice(2)); p.line(19, 18, 15, 15, CHROME[6]);
    outline(p);
    for (const [x, y] of [[12, 22], [12, 17], [10, 14], [16, 12]]) { p.set(x, y, K.glow[5]); }
    p.line(13, 26, 13, 13, K.glow[4], 160);
    glow(p, 12, 7, 6, K.g, 80);
  },
  sow(p, K) {
    ground(p, 25);
    // the press: a brass ram over a row of seeds, a sprout coming up
    box(p, 3, 2, 26, 4, GM.slice(1, 8), { rivets: true });
    cyl(p, 16, 6, 16, 11, 1.6, CHROME);
    box(p, 7, 11, 18, 5, BR, { rivets: true });
    for (let i = 0; i < 4; i++) ball(p, 8.5 + i * 5, 20, 1.8, 1.3, SOIL.slice(3).concat([0xe0c090]), { noise: 0 });
    cyl(p, 26, 25, 26, 20, 0.8, LEAF.slice(2)); ball(p, 24, 19, 2.2, 1.4, LEAF, { seed: 2 }); ball(p, 28, 18, 2.2, 1.4, K.glow.slice(1), { seed: 3 });
    outline(p);
    streaks(p, 16, 18, 0, 1, 3, 2, K.glow[4], 4);
  },
  grove(p, K) {
    ground(p, 26);
    for (const [x, h, r] of [[7, 13, 5], [17, 8, 6.5], [26, 14, 4.5]] as [number, number, number][]) {
      cyl(p, x, 27, x, h + r * 0.4, 1.2, SOIL.slice(1, 6), { cap: false });
      ball(p, x, h, r, r * 0.85, K.glow.slice(0, 6), { seed: x });
      ball(p, x - r * 0.3, h + r * 0.2, r * 0.6, r * 0.5, LEAF.slice(2), { seed: x + 1 });
    }
    outline(p);
    for (let x = 7; x < 26; x++) p.set(x, 29 + Math.round(Math.sin(x * 0.7)), K.glow[4], 200);
    for (const [x, y] of [[4, 4], [28, 5], [12, 2]]) p.set(x, y, K.glow[6]);
    glow(p, 17, 9, 9, K.g, 50);
  },
  convert(p, K) {
    // a beaten beast's head with a neural jack in its skull; its eye takes the Veyr's light
    ball(p, 14, 18, 11, 9, FLESH, { seed: 11 });
    poly(p, [[22, 17], [31, 20], [22, 24]], (x, y) => dv(CR, 3 - (y - 17) * 0.25, x, y));
    for (let i = 0; i < 4; i++) ball(p, 5 + i * 4, 10 - (i % 2), 1.4, 2, FLESH.slice(2), { seed: i });
    box(p, 9, 6, 7, 5, BR, { chamfer: 1 });
    cyl(p, 12, 6, 6, 1, 1, RUB.concat([0x4a4640])); cyl(p, 14, 6, 22, 1, 1, RD.slice(2));
    outline(p);
    ball(p, 18, 15, 2.6, 2.6, K.glow.slice(3), { noise: 0, amb: 0.7 }); p.set(17, 14, 0xffffff);
    for (const [x, y] of [[11, 12], [13, 14], [15, 15]]) p.set(x, y, K.glow[5]);
    glow(p, 18, 15, 5, K.g, 90);
    zap(p, 2, 24, 8, 30, K.glow[5], 2);
  },
  command(p, K) {
    // a radio relay mast, and a pack answering its call
    critter(p, 9, 25, 0.42, FLESH, { eye: K.g }); critter(p, 21, 27, 0.42, FLESH, { eye: K.g });
    p.line(16, 21, 16, 5, GM[7]); p.line(17, 21, 17, 5, GM[4]);
    for (let y = 8; y < 21; y += 3) { p.line(13, y + 3, 16, y, GM[6]); p.line(20, y + 3, 17, y, GM[5]); }
    ball(p, 16.5, 4, 1.8, 1.8, RD, { noise: 0, amb: 0.6 });
    outline(p);
    for (let i = 0; i < 3; i++) for (let a = -55; a <= 55; a += 5) { const t = (a * Math.PI) / 180, r = 4 + i * 3.5; for (const sg of [-1, 1]) p.set(Math.round(16.5 + sg * Math.cos(t) * r), Math.round(4 + Math.sin(t) * r), K.glow[5 - i], 230 - i * 50); }
    for (const [x, y] of [[12, 20], [25, 22]]) spark(p, x, y, K.glow[5], 1);
  },
  print(p, K) {
    // a print head laying down a creature layer by layer
    box(p, 1, 1, 30, 5, GM.slice(1, 8), { rivets: true });
    box(p, 12, 6, 9, 6, BR, { rivets: true });
    poly(p, [[14, 12], [19, 12], [16.5, 15]], (x, y) => dv(CHROME, 5 - (y - 12), x, y));
    box(p, 1, 27, 30, 4, GM.slice(1, 7), { chamfer: 0 });
    critter(p, 13, 22, 0.75, FLESH, { legs: true });
    // above the print line the beast is still wire
    for (let y = 14; y < 21; y++) for (let x = 2; x < 30; x++) { const c = p.get(x, y); if (c < 0) continue; if (y < 19) p.set(x, y, (x + y) % 3 === 0 || y === 14 ? K.glow[4] : 0x000000, (x + y) % 3 === 0 || y === 14 ? 255 : 0); }
    outline(p);
    p.hl(4, 28, 19, K.glow[5], 220);
    glow(p, 16.5, 17, 5, K.g, 80);
    spark(p, 16, 16, 0xffffff, 1);
  },
  // ---------------- LAB
  lab(p, K) {
    tank(p, 5, 2, 22, 28, K, (q) => critter(q, 13, 17, 0.72, FLESH, { eye: K.g }));
    outline(p);
    for (const [x, y] of [[11, 8], [20, 12], [15, 6], [18, 22]]) { p.set(x, y, K.glow[6]); p.set(x + 1, y + 1, K.glow[5], 140); }
  },
  splice(p, K) {
    for (let y = 1; y < 31; y++) {
      const a = y * 0.45, x1 = 16 + Math.sin(a) * 9, x2 = 16 - Math.sin(a) * 9, front1 = Math.cos(a) > 0;
      const c1 = y < 16 ? FLESH : K.glow.slice(0, 7), c2 = y < 16 ? ORE : WATER;
      if (y % 3 === 0) p.line(x1, y, x2, y, y < 16 ? CR[2] : CR[3]);
      const s1 = () => { ball(p, x1, y, 2, 1.2, c1, { noise: 0 }); }, s2 = () => { ball(p, x2, y, 2, 1.2, c2, { noise: 0 }); };
      if (front1) { s2(); s1(); } else { s1(); s2(); }
    }
    box(p, 4, 14, 24, 5, BR, { rivets: true });
    outline(p);
    spark(p, 27, 13, 0xffffff, 2);
    glow(p, 16, 16, 7, K.g, 60);
  },
  sequencer(p, K) {
    box(p, 1, 2, 30, 28, K.met, { rivets: true, seed: 22 });
    for (const x of [8, 24]) {
      ball(p, x, 9.5, 5.6, 5.6, GM.slice(1, 9), { noise: 0.2 });
      ball(p, x, 9.5, 4.2, 4.2, [0x2a1a10, 0x3a2414, 0x4a2e18, 0x5a3a1e, 0x6a4626], { noise: 0.1 });
      ball(p, x, 9.5, 1.4, 1.4, CHROME, { noise: 0 });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + (x > 10 ? 1 : 0); p.set(Math.round(x + Math.cos(a) * 2.8), Math.round(9.5 + Math.sin(a) * 2.8), GM[2]); }
    }
    // the tape runs down round a capstan past the read head
    p.line(3, 11, 9, 17, 0x6a4626); p.line(29, 11, 23, 17, 0x6a4626); p.hl(9, 23, 17, 0x6a4626);
    box(p, 13, 14, 6, 4, CHROME, { chamfer: 1 });
    // a gel of gene bands below
    box(p, 4, 20, 24, 8, [0x020805, 0x041209, 0x071e0e, 0x0b3017], { chamfer: 1, noise: 0.2 });
    outline(p);
    for (let i = 0; i < 10; i++) { const x = 6 + i * 2, h = 1 + Math.floor(hashf(i, 2, 7) * 4), c = [K.glow[5], ORE[6], WATER[6], FLESH[6]][i % 4]; for (let k = 0; k < h; k++) p.set(x, 26 - k, c); }
    p.set(16, 15, RD[6]);
  },
  vat(p, K) {
    // a squat riveted vat, a big thing breaching the green
    box(p, 2, 13, 28, 17, GM.slice(1, 9), { rivets: true });
    for (let x = 4; x < 28; x++) for (let y = 12; y < 16; y++) p.set(x, y, dv(K.glow, 4 + (hashf(x, y, 3) - 0.5) * 2 - (y - 12) * 0.4, x, y));
    critter(p, 14, 10, 0.95, FLESH, { legs: false, eye: K.g });
    for (let x = 3; x < 29; x++) for (let y = 13; y < 16; y++) if (p.get(x, y) >= 0 && hashf(x, y, 9) < 0.7) p.set(x, y, dv(K.glow, 4.5 + (hashf(x, y, 3) - 0.5) * 2, x, y));
    for (const y of [17, 25]) { p.hl(3, 28, y, GM[7]); p.hl(3, 28, y + 1, GM[2]); }
    outline(p);
    for (const [x, y, r] of [[6, 7, 1.4], [25, 5, 1.8], [22, 10, 1]] as [number, number, number][]) ring(p, x, y, r, r, K.glow[6], 220);
    glow(p, 16, 13, 10, K.g, 60);
  },
  cloner(p, K) {
    tank(p, 1, 3, 14, 26, K, (q) => critter(q, 6, 17, 0.5, FLESH, { eye: K.g }));
    tank(p, 17, 3, 14, 26, K, (q) => critter(q, 22, 17, 0.5, FLESH, { eye: K.g }));
    cyl(p, 13, 9, 19, 9, 1.4, CU, { cap: false });
    outline(p);
    p.set(16, 9, K.glow[6]); spark(p, 16, 22, K.glow[5], 1);
  },
};
function mixRamp(R: number[], c: number, t: number) { return R.map((x) => mixc(x, c, t)); }
/** a glass specimen tank with brass caps and a green fill; inner draws the specimen */
function tank(p: Pix, x: number, y: number, w: number, h: number, K: Kit, inner: (q: Pix) => void) {
  box(p, x, y, w, 4, BR, { rivets: true });
  box(p, x, y + h - 5, w, 5, BR, { rivets: true });
  for (let j = y + 4; j < y + h - 5; j++) for (let i = x + 1; i < x + w - 1; i++) {
    const k = (i - x) / w, edge = i === x + 1 || i === x + w - 2;
    p.set(i, j, edge ? 0x7a9a90 : dv(K.glow, 1.6 + Math.sin(k * Math.PI) * 1.4 - (j - y) / h * 0.6 + (hashf(i, j, 5) - 0.5) * 0.5, i, j));
  }
  const q = new Pix(32, 32); inner(q);
  for (let j = y + 5; j < y + h - 5; j++) for (let i = x + 2; i < x + w - 2; i++) { const c = q.get(i, j); if (c >= 0) p.set(i, j, mixc(c, K.glow[2], 0.18)); else if (q.a(i - 1, j - 1) || q.a(i + 1, j + 1) || q.a(i - 1, j + 1) || q.a(i + 1, j - 1)) p.set(i, j, K.glow[1]); }
  for (let j = y + 6; j < y + h - 7; j++) p.set(x + 3, j, 0xd8fff0, 120);
}

// ------------------------------------------------------------------ public: icon canvases per look
const cache = new Map<string, Pix>();
const lookKey = (K: Kit) => K.rock.join(',') + K.met[3] + K.g;
/** the 32x32 icon for a node */
export function skillIcon(id: string, K: Kit): Pix {
  const key = id + '|' + lookKey(K);
  let p = cache.get(key);
  if (!p) { p = new Pix(32, 32); (ICONS[id] ?? ICONS.head)(p, K); cache.set(key, p); }
  return p;
}
export const hasIcon = (id: string) => id in ICONS;
/** a greyed / darkened copy (locked) */
export function dimmed(src: Pix, k: number, tint = 0x1a2a30): Pix {
  const p = new Pix(src.w, src.h);
  for (let i = 0; i < src.w * src.h; i++) {
    const a = src.d[i * 4 + 3]; if (!a) continue;
    const r = src.d[i * 4], g = src.d[i * 4 + 1], b = src.d[i * 4 + 2], l = r * 0.3 + g * 0.59 + b * 0.11;
    const c = mixc(mixc((r << 16) | (g << 8) | b, (l << 16) | (l << 8) | l, k), tint, k * 0.55);
    p.d[i * 4] = (c >> 16) & 255; p.d[i * 4 + 1] = (c >> 8) & 255; p.d[i * 4 + 2] = c & 255; p.d[i * 4 + 3] = a;
  }
  return p;
}

// ------------------------------------------------------------------ small glyphs: resources, core cell, branch emblems
/** 9x9 resource glyph */
export function resGlyph(r: 'ore' | 'carbon' | 'water' | 'soil'): Pix {
  const k = 'res:' + r; let p = cache.get(k); if (p) return p;
  p = new Pix(9, 9);
  if (r === 'ore') { rock(p, 4.5, 4.8, 3.6, 3.2, GM.slice(1, 9), 5, { rough: 0.25, cracks: 0 }); for (const [x, y] of [[3, 3], [5, 5], [4, 6], [6, 3]]) p.set(x, y, ORE[6]); p.set(3, 2, ORE[7]); }
  else if (r === 'carbon') { poly(p, [[4.5, 0.5], [8, 4], [6.5, 8.5], [2.5, 8.5], [1, 4]], (x, y) => dv(CARB, 5 - x * 0.4 - y * 0.2 + (x === 4 ? 1.5 : 0), x, y)); p.set(3, 3, CARB[7]); }
  else if (r === 'water') { poly(p, [[4.5, 0], [7.8, 5], [7, 7.5], [4.5, 8.8], [2, 7.5], [1.2, 5]], (x, y) => dv(WATER, 6.5 - Math.hypot(x - 3.5, y - 4) * 0.9, x, y)); p.set(3, 4, 0xffffff); p.set(3, 5, WATER[7]); }
  else { ball(p, 4.5, 5.4, 4, 3, SOIL, { seed: 4, noise: 0.6 }); p.set(5, 1, LEAF[5]); p.set(4, 2, LEAF[6]); p.set(6, 2, LEAF[4]); p.set(5, 2, LEAF[3]); }
  outline(p);
  cache.set(k, p); return p;
}
/** 9x9 core cell: a glass cartridge, brass caps, a green core */
export function cellGlyph(spent = false): Pix {
  const k = 'cell:' + spent; let p = cache.get(k); if (p) return p;
  p = new Pix(9, 9);
  box(p, 2, 0, 5, 2, BR, { chamfer: 0 }); box(p, 2, 7, 5, 2, BR, { chamfer: 0 });
  for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) p.set(x, y, spent ? (x === 2 ? 0x5a6a6a : 0x1a2224) : x === 2 ? 0xd8fff0 : x === 6 ? 0x1b6630 : dv([0x1b6630, 0x288c42, 0x43b65a, 0x7ae088, 0xc0ffc6], 3.4 - Math.abs(x - 4) * 0.9 + (y === 4 ? 0.8 : 0), x, y));
  outline(p);
  cache.set(k, p); return p;
}
/** 16x16 emblem for a branch's junction plate */
export function branchEmblem(b: string, K: Kit): Pix {
  const k = 'em:' + b + lookKey(K); let p = cache.get(k); if (p) return p;
  p = new Pix(16, 16);
  if (b === 'chassis') { torsoPart(p, 8, 11, 5.5, 4.2, K, { port: 1.3 }); head(p, 8, 3.6, 3.2, K); }
  else if (b === 'harvest') { oreChunk(p, 10, 10, 5, 4); poly(p, [[1, 3], [5, 1], [11, 9]], (x, y) => dv(CHROME, 5 - (x + y) * 0.1, x, y)); }
  else if (b === 'gravity') { pebble(p, 8, 6, 3.6, K, 9); }
  else if (b === 'combat') { rock(p, 8, 8, 5.5, 5, K.rock, 431, { rough: 0.1, cracks: 0 }); box(p, 10, 4, 3, 8, K.met, { chamfer: 0 }); for (let i = 0; i < 3; i++) p.set(13, 5 + i * 3, CHROME[6]); }
  else if (b === 'fabrication') { cyl(p, 8, 15, 8, 8, 0.9, LEAF.slice(1, 6), { cap: false }); ball(p, 5, 7, 3, 2.2, LEAF, { seed: 1 }); ball(p, 11, 5, 3.2, 2.4, K.glow.slice(0, 6), { seed: 2 }); }
  else { poly(p, [[6, 1], [10, 1], [10, 6], [14, 14], [2, 14], [6, 6]], (x, y) => (y > 8 ? dv(K.glow, 4 - (y - 8) * 0.25, x, y) : dv([0x3a5a5a, 0x5a7a7a, 0x8aa8a8], 1.5, x, y))); p.hl(5, 10, 1, BR[6]); }
  outline(p);
  if (b === 'gravity') { ring(p, 8, 8, 7, 2.4, K.glow[5], 230); ring(p, 8, 8, 5, 1.6, K.glow[4], 200, 'front'); }
  cache.set(k, p); return p;
}

// Parts grown by the hand-designed bestiary species (bestiary.ts), each placed by the species' own data and built to
// grow out of the body: carapace bands rest their rims on the hide and overlap tail-ward, horn plates shingle in
// rows, a fleece swells round the trunk, horns rise from a collar of skin, fans spread from a fleshy base. Every part
// paints the shadow it casts onto the body under it.
import { RAMPS, type RampName } from '../art/palette';
import { type Region, blade, sac, spline, sheet, hash, addV, scl, norm, cross, lerpV, sub, len, type V3, type Wt } from './kit';
import { type Ctx, hide, interp } from './sculpt';
import { lock, crest, type SpineTs, type HeadCtx } from './parts';
import type { BeastForm, BeastPart } from './bestiary';
import { clamp } from '../core/rand';

const TAU = Math.PI * 2;
const RP = (n: RampName) => RAMPS[n] as unknown as number[];
const at = (S: Ctx, t: number) => clamp(Math.round(t * (S.spine!.pts.length - 1)), 0, S.spine!.pts.length - 1);
/** a point on the trunk's surface at angle a (0 = top) scaled by k, and its outward normal */
function surf(S: Ctx, k: number, a: number, kk = 1): { p: V3; n: V3 } {
  const sp = S.spine!, f = sp.fr[k];
  const n = norm(addV(scl(f.v, Math.cos(a)), scl(f.u, Math.sin(a))));
  return { p: addV(sp.pts[k], addV(scl(f.v, Math.cos(a) * sp.rv[k] * kk), scl(f.u, Math.sin(a) * sp.ru[k] * kk))), n };
}

/** the body-space marks a part leaves on the trunk's hide (contact shadows): applied after the trunk is painted */
export interface BodyMark { t0: number; t1: number; a0: number; a1: number; k: number }

export function growBody(S: Ctx, F: BeastForm, T: SpineTs, W: number, H: number, marks: BodyMark[]) {
  for (const p of F.parts) {
    if (p.k === 'carapace') carapace(S, p, marks);
    else if (p.k === 'plates') plates(S, p);
    else if (p.k === 'wool') wool(S, p, W);
    else if (p.k === 'tailFan') tailFan(S, p, W);
    else if (p.k === 'finCrest') crest(S, T, W, H * p.height / 0.32 * 0.32);
  }
}

// ---------------------------------------------------------------------------------------------- carapace
/** a back-shield of overlapping bands: each band a dome of bone resting its rim on the hide at +-spread, its rear lip
 *  standing proud over the front of the next band */
function carapace(S: Ctx, p: Extract<BeastPart, { k: 'carapace' }>, marks: BodyMark[]) {
  const sp = S.spine!, N = sp.pts.length - 1, CR = S.reg('SHELL', TAU * sp.ru[at(S, (p.t0 + p.t1) / 2)] * p.spread / Math.PI, sp.L * (p.t1 - p.t0) / p.bands * 1.3, 12, 120, 64);
  for (let b = 0; b < p.bands; b++) {
    const ta = p.t0 + ((p.t1 - p.t0) * b) / p.bands, tb = p.t0 + ((p.t1 - p.t0) * (b + 1.3)) / p.bands;
    const rows = 5, cols = 10, grid: V3[][] = [], w: Wt[] = [];
    for (let i = 0; i <= rows; i++) {
      const u = i / rows, t = clamp(ta + (tb - ta) * u, 0, 0.99), k = Math.round(t * N);
      // each row runs rim lip, shell, rim lip: the shell's thickness turns in to meet the hide at both edges
      const row = Array.from({ length: cols + 1 }, (_, j) => {
        const a = -p.spread + (2 * p.spread * j) / cols, dome = Math.cos((a / p.spread) * Math.PI / 2) ** 0.6;
        return surf(S, k, a, 1.02 + (p.lift - 1.02) * dome + u * 0.05 * dome).p;
      });
      grid.push([surf(S, k, -p.spread + 0.05, 0.94).p, ...row, surf(S, k, p.spread - 0.05, 0.94).p]);
      w.push(sp.w[k]);
    }
    // the rear lip: the shell turns down toward the hide, showing its thickness
    const kL = Math.round(clamp(tb, 0, 0.99) * N);
    const lipRow = Array.from({ length: cols + 1 }, (_, j) => { const a = -p.spread + (2 * p.spread * j) / cols; return surf(S, kL, a, 0.95 + (p.lift - 0.95) * Math.cos((a / p.spread) * Math.PI / 2) ** 0.6 * 0.82).p; });
    grid.push([surf(S, kL, -p.spread + 0.05, 0.92).p, ...lipRow, surf(S, kL, p.spread - 0.05, 0.92).p]);
    w.push(sp.w[kL]);
    sheet(S.B, CR, S.gid(), grid, (i) => w[i]);
    marks.push({ t0: tb - 0.012, t1: tb + 0.018, a0: -p.spread, a1: p.spread, k: 0.55 });
  }
  marks.push({ t0: p.t0, t1: Math.min(1, p.t1 + 0.3 / p.bands), a0: p.spread - 0.12, a1: p.spread + 0.06, k: 0.5 });
  marks.push({ t0: p.t0, t1: Math.min(1, p.t1 + 0.3 / p.bands), a0: -p.spread - 0.06, a1: -p.spread + 0.12, k: 0.5 });
  S.paints.push(() => shellPaint(CR, p.ramp, !!p.moss));
}
/** bone shell: lit crown, turned flanks, two ridges, pits, a pale lip over a dark under-edge, optional moss */
function shellPaint(CR: Region, ramp: RampName, moss: boolean) {
  {
    const R = RP(ramp), M = RP('moss'), p = { moss };
    for (let y = 0; y < CR.h; y++) for (let x = 0; x < CR.w; x++) {
      const u = x / CR.w - 0.5, v = y / CR.h, au = Math.abs(u);
      // planes: the lit crown, the turned flanks, two ridges running back, a pale lip over a dark under-edge
      let k = au < 0.18 ? 4 : au < 0.32 ? 3 : 2;
      if (Math.abs(au - 0.25) < 0.02) k = 5; else if (Math.abs(au - 0.27) < 0.02) k = 1;
      if (v > 0.84) k = v > 0.92 ? 0 : 5;
      if (au > 0.47) k = 1;
      if (y % 7 === 3 && (x + (y >> 3)) % 9 < 2 && v < 0.8) k -= 1; // pits
      let c = R[clamp(k, 0, R.length - 1)];
      // moss: drawn ragged patches on the crown of each band, thickest at the front where the band before shelters it
      const mz = 0.06 + 0.16 * hash(Math.floor(v * 9), Math.floor(u * 6 + 3)) * (1 - v);
      if (p.moss && v < 0.7 && au < mz) c = M[clamp(k + (au < mz * 0.5 ? 1 : 0), 0, M.length - 1)];
      CR.set(x, y, c);
    }
  }
}
/** a helm: a cap of bone over the skull from brow to nape, its rim above the eyes, sitting on the head's own profile */
export function helm(S: Ctx, h: HeadCtx, ctrl: V3[], rx: number[], ry: number[], ramp: RampName) {
  const HM = S.fixed('HELM', 16, 12), spread = 0.95, rows = ctrl.length - 3, cols = 8, se = 2 / 2.7, w: Wt = [h.iH, 1];
  const grid: V3[][] = [];
  for (let i = 0; i < rows; i++) {
    const c = ctrl[i], lift = i === 0 ? 1.04 : 1.12 - i * 0.012;
    grid.push(Array.from({ length: cols + 1 }, (_, j) => { const a = -spread + (2 * spread * j) / cols; return addV(c, [Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** se * rx[i] * lift, Math.abs(Math.cos(a)) ** se * ry[i] * lift, 0]); }));
  }
  sheet(S.B, HM, S.gid(), grid, () => w);
  S.paints.push(() => shellPaint(HM, ramp, false));
}

// ---------------------------------------------------------------------------------------------- horn plates
/** rows of horn plates lying back along the body like a cone's scales, each row's tips over the next row's bases */
function plates(S: Ctx, p: Extract<BeastPart, { k: 'plates' }>) {
  const sp = S.spine!, N = sp.pts.length - 1, W = S.rig.width;
  const PL = S.fixed('PLATE2', 10, 12); PL.cut = true;
  for (let r = 0; r < p.rows; r++) {
    const t = p.t0 + ((p.t1 - p.t0) * r) / (p.rows - 1), k = clamp(Math.round(t * N), 0, N - 1), f = sp.fr[k];
    const rad = (sp.ru[k] + sp.rv[k]) / 2, sz = p.size * W * (0.55 + 0.45 * Math.min(1, rad / (W * 0.45)));
    const n = Math.max(3, Math.round((2 * p.spread * rad) / (sz * 0.8)));
    for (let i = 0; i <= n; i++) {
      const a = -p.spread + (2 * p.spread * (i + (r & 1) * 0.5)) / (n + 0.5);
      if (Math.abs(a) > p.spread) continue;
      const { p: base, n: nn } = surf(S, k, a, 0.98);
      const dir = norm(addV(scl(f.d, 1), scl(nn, 0.28))), side = norm(cross(nn, dir));
      const pts: V3[] = [addV(base, scl(dir, -sz * 0.15)), addV(base, scl(dir, sz * 0.45)), addV(base, scl(dir, sz))];
      blade(S.B, PL, pts, [sz * 0.5, sz * 0.62, sz * 0.4], side, [sp.w[k], sp.w[k], sp.w[k]], { offset: -0.5 });
    }
  }
  S.paints.push(() => {
    // a shield of horn pointing tail-ward: lit half, turned half, a keel, a dark rim on the shadow side
    const R = RP(p.ramp);
    for (let y = 0; y < PL.h; y++) for (let x = 0; x < PL.w; x++) {
      const u = (x + 0.5) / PL.w - 0.5, v = (y + 0.5) / PL.h, half = v < 0.55 ? 0.5 : 0.5 * (1 - (v - 0.55) / 0.45) + 0.02;
      if (Math.abs(u) > half) { PL.set(x, y, R[0], 0); continue; }
      let k = u < 0 ? 4 : 3;
      if (Math.abs(u) < 0.04) k = 5;
      if (Math.abs(u) > half - 0.07) k = u < 0 ? 5 : 0;
      if (v < 0.12) k = 1;
      if (y % 4 === 2 && v > 0.2 && v < 0.75) k -= 1;
      PL.set(x, y, R[clamp(k, 0, R.length - 1)], 255);
    }
  });
}

// ---------------------------------------------------------------------------------------------- fleece
/** a fleece: a swelling of long clumped wool round the trunk, heaviest under the belly, its lower edge hanging in locks */
function wool(S: Ctx, p: Extract<BeastPart, { k: 'wool' }>, W: number) {
  const sp = S.spine!, k0 = at(S, Math.max(0, p.t0)), k1 = at(S, p.t1);
  const pts = sp.pts.slice(k0, k1 + 1), n = pts.length;
  const env = (i: number) => { const t = i / Math.max(1, n - 1); return Math.min(1, Math.sin(Math.PI * t) * 1.6) ** 0.5; };
  const RW = S.reg('WOOL', TAU * W * 0.62 * p.puff, len(sub(pts[n - 1], pts[0])) * 1.25, 16, 140, 120);
  sac(S.B, RW, S.gid(), pts, pts.map((_, i) => { const e = 1 + (p.puff - 1) * env(i); return [sp.ru[k0 + i] * e, sp.rv[k0 + i] * e] as [number, number]; }), pts.map((_, i) => sp.w[k0 + i]),
    { n: 22, sq: 2.2, shift: (a, t) => -W * p.hang * 0.25 * Math.max(0, -Math.cos(a)) * Math.sin(Math.PI * t), bump: (a, t) => 0.07 * Math.sin(a * 7 + t * 9) * Math.sin(t * 11 + a * 3) + 0.05 * Math.cos(a * 11 + t * 6), cap: 0.7 });
  S.paints.push(() => hide(S, RW, { L: W * 3, rad: () => W * 0.6, seed: 113, kind: 'body', noPattern: true, clump: 1.7, flow: 1, down: 0.9, belly: 2.5 }));
  // the fringe: locks hanging from the fleece's lower edge
  const SH = S.page.regs.get('SHAG');
  if (SH) for (let i = 1; i < n - 1; i += 2) for (const s of [-1, 1]) {
    const k = k0 + i, e = 1 + (p.puff - 1) * env(i), f = sp.fr[k];
    const base = addV(sp.pts[k], addV(scl(f.u, s * sp.ru[k] * e * 0.8), addV(scl(f.v, -sp.rv[k] * e * 0.62), [0, -W * p.hang * 0.2, 0])));
    const dir = norm([s * 0.3, -1, -0.2]);
    lock(S, base, dir, norm(cross(dir, f.d)), W * (0.3 + p.hang * 0.4), W * 0.36, sp.w[k], 900 + i * 3 + s, SH);
  }
}

// ---------------------------------------------------------------------------------------------- fans
/** a rayed fan of skin from a fleshy base: `rays` bony rays fanning between two directions, a membrane between them */
function fan(S: Ctx, reg: Region, base: V3, dA: V3, dB: V3, L: number, w: Wt, rays = 7, seed = 1) {
  const grid: V3[][] = [];
  for (let i = 0; i < rays; i++) {
    const f = i / (rays - 1), dir = norm(lerpV(dA, dB, f)), l = L * (0.82 + 0.18 * Math.sin(Math.PI * f)) * (0.94 + hash(i, seed) * 0.12);
    grid.push([0.04, 0.35, 0.7, 1].map((u) => addV(base, scl(dir, l * u))));
  }
  sheet(S.B, reg, S.gid(), grid, () => w);
}
function fanPaint(r: Region, ramp: RampName, rays: number) {
  const R = RP(ramp);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const u = x / r.w, v = y / r.h, ray = Math.abs(((v * (rays - 1)) % 1) - 0.5) > 0.42;
    let k = u < 0.12 ? 2 : u < 0.55 ? 3 : 4;
    if (ray) k = u < 0.85 ? 1 : 0;
    if (u > 0.9) k = (Math.floor(v * rays * 2) % 2) ? 1 : 0; // the scalloped dark rim
    r.set(x, y, R[clamp(k, 0, R.length - 1)]);
  }
}
function tailFan(S: Ctx, p: Extract<BeastPart, { k: 'tailFan' }>, W: number) {
  const sp = S.spine!, N = sp.pts.length - 1, k = N - 2, f = sp.fr[k], tip = sp.pts[N - 1];
  const FN = S.fixed('FAN', 12, 14);
  fan(S, FN, tip, norm(addV(scl(f.d, 0.6), scl(f.v, -0.8))), norm(addV(scl(f.d, 0.6), scl(f.v, 0.8))), W * p.size * 1.6, sp.w[k], 7, 3);
  S.paints.push(() => fanPaint(FN, p.ramp, 7));
}
/** gill fans behind the jaw: two rayed frills spreading back and out from fleshy bases */
export function headFans(S: Ctx, h: HeadCtx, p: Extract<BeastPart, { k: 'headFans' }>) {
  const FN = S.fixed('HFAN', 12, 14), iN = S.bi('neck');
  for (const s of [-1, 1]) {
    const base = addV(h.head, [s * h.hw * 0.38, -h.hh * 0.08, -h.hl * 0.08]);
    fan(S, FN, base, norm([s * 0.55, -0.75, -0.55]), norm([s * 0.5, 0.85, -0.45]), h.hw * p.size, [h.iH, 0.75, iN, 0.25], 7, 5 + s);
  }
  S.paints.push(() => fanPaint(FN, p.ramp, 7));
}

// ---------------------------------------------------------------------------------------------- horn and crest
/** a great nose horn rising forward from a collar of skin */
export function greatHorn(S: Ctx, h: HeadCtx, p: Extract<BeastPart, { k: 'horn' }>, collarRamp: number[]) {
  const L = h.hl * p.len, r0 = h.hw * p.base, base = addV(h.head, [0, h.hh * 0.18, h.z0 + h.sl * 0.55]);
  const ctrl: V3[] = [base, addV(base, [0, L * p.rise * 0.22, L * 0.32]), addV(base, [0, L * p.rise * 0.62, L * 0.66]), addV(base, [0, L * p.rise * 1.1, L * 0.9])];
  const hs = spline(ctrl, 14), w: Wt = [h.iH, 1];
  const HR = S.reg('GHORN', TAU * r0, hs.L, 8, 28, 90);
  sac(S.B, HR, S.gid(), hs.pts, hs.t.map((t) => { const r = r0 * (1 - t) ** 0.85 + 0.003; return [r * 0.85, r] as [number, number]; }), hs.pts.map(() => w), { n: 10, sq: 2 });
  // the collar: skin flaring round the horn's root and running into the face
  const CO = S.fixed('HCOL', 10, 6), d0 = norm(sub(hs.pts[2], hs.pts[0]));
  sac(S.B, CO, S.gid(), [addV(base, scl(d0, -r0 * 0.9)), addV(base, scl(d0, r0 * 0.2)), addV(base, scl(d0, r0 * 0.7))], [[r0 * 1.7, r0 * 1.5], [r0 * 1.25, r0 * 1.15], [r0 * 1.02, r0 * 0.94]], [w, w, w], { n: 12, sq: 2.2, start: false, end: false });
  S.paints.push(() => {
    const R = RP(p.ramp);
    // planes of horn: a lit strip, growth rings, a dark root, a worn pale tip
    HR.fill(R, (x, y) => { const f = y / HR.h, c = Math.cos(HR.th(x)); return 1.5 + f * 2.6 + (c > 0.5 ? 1 : c < -0.4 ? -0.7 : 0) + (y % 5 === 0 && f < 0.7 ? -0.9 : 0); });
    CO.fill(collarRamp, (x, y) => 2.6 + (Math.cos(CO.th(x)) > 0.2 ? 0.8 : 0) - (y > CO.h * 0.7 ? 1.4 : 0) + (x % 3 === 0 ? -0.5 : 0));
  });
}
/** a blade of bone running back off the skull, rooted under the skin */
export function skullCrest(S: Ctx, h: HeadCtx, p: Extract<BeastPart, { k: 'crest' }>) {
  const CR = S.fixed('BCREST', 12, 10), w: Wt = [h.iH, 1];
  const pts: V3[] = [0.25, 0.05, -0.2, -0.5, -0.85].map((z, i) => addV(h.head, [0, h.hh * (0.38 + i * 0.06), h.hl * z * p.len]));
  const wd = [0.04, 0.22, 0.36, 0.42, 0.18].map((k) => k * h.hh * p.height / 0.5);
  blade(S.B, CR, pts, wd, norm([0, 1, -0.35]), pts.map(() => w), { offset: -0.12 });
  S.paints.push(() => {
    const R = RP(p.ramp);
    CR.fill(R, (x, y) => { const u = x / CR.w; return (u < 0.2 ? 2 : 3) + (y % 4 === 0 ? -1 : 0) + (u > 0.88 ? -2 : 0); });
  });
}

/** contact shadows and the spiracle row on the trunk's hide (run after the trunk is painted) */
export function markBody(S: Ctx, r: Region, F: BeastForm, marks: BodyMark[], T: SpineTs) {
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const t = (y + 0.5) / r.h, a = r.th(x);
    for (const m of marks) if (t >= m.t0 && t <= m.t1 && a >= m.a0 && a <= m.a1) { r.set(x, y, RAMPS.ink[1]); break; }
  }
  if (F.spiracles) for (let i = 0; i < F.spiracles; i++) for (const s of [-1, 1]) {
    // each spiracle: a dark slit with a pale lip above it
    const t = T.chest + ((T.hips - T.chest) * (i + 0.5)) / F.spiracles, cx = Math.floor(r.X(s * 96)), cy = Math.floor(t * r.h);
    for (let j = -2; j <= 2; j++) { r.set(cx + j * s * 0, cy + j, RAMPS.ink[0]); r.set(cx - 1, cy + j, RAMPS.straw[3]); }
  }
  void interp;
}

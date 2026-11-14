// ANATOMY LIBRARY: coats. The integument of a vertebrate as a recipe per zone: the back, the flanks, the belly, the
// neck and tail, the limbs and feet, the face and muzzle each get a colour (a ramp step: a pale countershaded belly,
// a darker back, stockings on the lower legs, a pale muzzle or a dark mask) and a drawn surface (fur in clumped
// locks combed along the body, overlapping scales of a kind, pebbled hide, folds, glandular warts), and the species
// pattern (stripes, spots and rosettes, bands, saddles, mottling, tail rings) is laid out in body space so it runs
// across every part: from the trunk onto the legs, the tail and the face. Zones meet along drawn, irregular edges
// (a belly line that follows the scale rows or the fur locks), never along a gradient.
//   const C = coatCtx(coat, frame, seed);       frame: the trunk's spine (bodyFrame), landmarks along it
//   piece.paint = coatPaint(C, 'trunk');        'trunk' | 'limb' | 'head' | 'jaw' | 'ear' | 'lid'
import type { RampName } from '../../art/palette';
import type { V3 } from '../kit';
import type { Body, Chart, Piece, Tone } from './core';
import { Px, RP, cell3, h3, cl, type ScaleOpt } from './paint';

export type CoatPattern = 'plain' | 'stripes' | 'spots' | 'rosettes' | 'bands' | 'mottled' | 'saddle' | 'rings' | 'flankSpots' | 'shoulderStripes' | 'dorsal' | 'blotches' | 'speckle';
/** a drawn surface */
export interface Surf {
  /** fur locks: length and width of a lock (m), how far they turn down the sides, root and tip steps */
  fur?: { len: number; width: number; down?: number; root?: number; tip?: number };
  /** scales: width (m), kind, overlap */
  scales?: { size: number; kind?: ScaleOpt['kind']; len?: number; ink?: number };
  /** pebbled hide: cell size (m), depth, pores */
  pebbles?: { size: number; depth?: number; pores?: number };
  /** skin folds round the part (m between folds) */
  folds?: { spacing: number; depth?: number };
  /** glandular warts (amphibians): size (m), share of cells that carry one */
  glands?: { size: number; density: number };
  /** cage creases drawn as ink lines and lit ridges */
  creases?: number;
  /** wet or glossy: glints where the surface turns to the light */
  wet?: number;
}
type C2 = [RampName, number];
export interface Coat {
  base: C2; belly: C2;
  /** a darker back (countershading); otherwise the base runs to the belly line */
  back?: C2;
  /** how far up the flanks the pale belly reaches (radians from the belly's midline; ~1 a deep belly) */
  bellyArc?: number;
  pattern?: { kind: CoatPattern; c: C2; scale?: number; heart?: C2; on?: { limbs?: boolean; head?: boolean; tail?: boolean } };
  /** surfaces per zone; `body` is the fallback */
  surf: { body: Surf; back?: Surf; belly?: Surf; neck?: Surf; tail?: Surf; limb?: Surf; sock?: Surf; foot?: Surf; face?: Surf; muzzle?: Surf; ear?: Surf };
  /** lower legs in another colour (stockings, bare stilts), below `h` metres off the ground */
  socks?: { c: C2; h: number };
  /** the face: a pale muzzle, a dark mask through the eyes, dark tear lines (cats) */
  face?: { muzzle?: C2; mask?: C2; tear?: boolean; chin?: C2; brow?: C2 };
  /** caked mud up the legs to this height (m), healed scars (count), lichen rosettes (count) */
  mud?: { h: number; ramp?: RampName }; scars?: number; lichen?: number;
  /** keratin: claws, hooves, horns, beak */
  horn?: C2; claw?: C2;
}
/** the spine of the body, tail tip to the nape: station centres, frames and arc length, with landmarks */
export interface BodyFrame {
  pts: V3[]; x: V3[]; y: V3[]; cum: number[];
  /** arc length (m from the tail tip) of the rump, the hips, the waist, the shoulders and the root of the neck */
  sRump: number; sHips: number; sShoulder: number; sNeck: number; L: number;
  /** body half width (m) for scaling patterns */
  W: number;
}
export interface CoatCtx { coat: Coat; F: BodyFrame; seed: number; ground: number; zStop: number; skullC: V3 }
export const coatCtx = (coat: Coat, F: BodyFrame, seed: number, o: { zStop?: number; skullC?: V3 } = {}): CoatCtx => ({ coat, F, seed, ground: 0, zStop: o.zStop ?? Infinity, skullC: o.skullC ?? [0, 0, 0] });

/** where a point lies along the body: arc length s from the tail tip, angle a round from the top (+ toward +x) */
export function locate(F: BodyFrame, p: V3): { s: number; a: number; r: number } {
  let best = 0, bd = Infinity, bt = 0;
  for (let k = 0; k + 1 < F.pts.length; k++) {
    const A = F.pts[k], B = F.pts[k + 1], ab0 = B[0] - A[0], ab1 = B[1] - A[1], ab2 = B[2] - A[2], L2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2 || 1e-9;
    const t = cl(((p[0] - A[0]) * ab0 + (p[1] - A[1]) * ab1 + (p[2] - A[2]) * ab2) / L2, 0, 1);
    const dx = p[0] - A[0] - ab0 * t, dy = p[1] - A[1] - ab1 * t, dz = p[2] - A[2] - ab2 * t, d = dx * dx + dy * dy + dz * dz;
    if (d < bd) { bd = d; best = k; bt = t; }
  }
  const A = F.pts[best], B = F.pts[best + 1];
  const c: V3 = [A[0] + (B[0] - A[0]) * bt, A[1] + (B[1] - A[1]) * bt, A[2] + (B[2] - A[2]) * bt];
  const x = F.x[best], y = F.y[best], v: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  return { s: F.cum[best] + (F.cum[best + 1] - F.cum[best]) * bt, a: Math.atan2(v[0] * x[0] + v[1] * x[1] + v[2] * x[2], v[0] * y[0] + v[1] * y[1] + v[2] * y[2]), r: Math.sqrt(bd) };
}

const TAU = Math.PI * 2;
/** a drawn patch round a cell centre: radius by angle in six jittered sectors (an irregular hexagon, never a disc) */
function inPatch(dx: number, dy: number, r: number, id: number, seed: number) {
  const a = Math.atan2(dy, dx), sec = Math.floor(((a + Math.PI) / TAU) * 6) % 6, f = ((a + Math.PI) / TAU) * 6 - Math.floor(((a + Math.PI) / TAU) * 6);
  const r0 = r * (0.7 + 0.45 * h3(id, sec, seed)), r1 = r * (0.7 + 0.45 * h3(id, (sec + 1) % 6, seed));
  return Math.hypot(dx, dy) < r0 + (r1 - r0) * f;
}
/** the species pattern at a point: 0 ground, 1 pattern, 2 a darker heart (rosettes) */
export function patternAt(C: CoatCtx, p: V3, zone: Zone, s: number, a: number): number {
  const pt = C.coat.pattern; if (!pt || pt.kind === 'plain') return 0;
  const F = C.F, W = F.W, k = pt.scale ?? 1, seed = C.seed, aa = Math.abs(a);
  if ((zone === 'limb' || zone === 'sock' || zone === 'foot') && !pt.on?.limbs && pt.kind !== 'stripes' && pt.kind !== 'spots' && pt.kind !== 'rosettes' && pt.kind !== 'speckle') return 0;
  if ((zone === 'face' || zone === 'muzzle') && !pt.on?.head && pt.kind !== 'spots' && pt.kind !== 'speckle') return 0;
  if (zone === 'belly' || zone === 'muzzle') return 0;
  const tail = zone === 'tail';
  switch (pt.kind) {
    case 'stripes': {
      // drawn bands across the flanks (and round the legs), each with its own lean and width, tapering toward the belly
      const sp = W * 0.55 * k;
      if (zone === 'limb' || zone === 'sock') { const u = p[1] / (sp * 0.8), i = Math.floor(u); return Math.abs(u - i - 0.5) < 0.2 + 0.06 * h3(i, 3, seed) ? 1 : 0; }
      const lean = (h3(Math.floor(s / sp), 1, seed) - 0.5) * 0.5, u = (s + aa * W * (0.35 + lean)) / sp, i = Math.floor(u), f = u - i;
      const st = Math.floor(aa * 3) / 3, w = (0.24 + 0.1 * h3(i, 7, seed)) * (1 - st / 2.9);
      // a fork now and then: the stripe splits in two near the back
      const fork = h3(i, 11, seed) < 0.3 && aa < 1.2 ? Math.abs(f - 0.5) < w * 0.35 : false;
      return aa < 2.3 && Math.abs(f - 0.5 - (h3(i, 5, seed) - 0.5) * 0.15) < w && !fork ? 1 : 0;
    }
    case 'spots': case 'flankSpots': case 'speckle': case 'rosettes': {
      if (pt.kind === 'flankSpots' && (aa < 0.8 || aa > 2.1)) return 0;
      const size = W * (pt.kind === 'speckle' ? 0.12 : pt.kind === 'rosettes' ? 0.5 : 0.32) * k * (zone === 'face' ? 0.45 : zone === 'limb' || zone === 'sock' ? 0.6 : 1);
      const c = cell3(p[0], p[1], p[2], size, seed + 3);
      if (h3(c.id, 2, seed) < (pt.kind === 'speckle' ? 0.5 : 0.25)) return 0;
      const dx = p[0] - c.cx, dy = p[1] - c.cy + (p[2] - c.cz) * 0.6;
      const r = size * (0.22 + 0.16 * h3(c.id, 9, seed));
      if (!inPatch(dx, dy, r, c.id, seed)) return 0;
      if (pt.kind !== 'rosettes' || r < size * 0.28) return 1;
      // a rosette: a broken ring of drawn segments round a darker heart
      if (inPatch(dx, dy, r * 0.58, c.id + 7, seed)) return 2;
      return h3(c.id, Math.floor(((Math.atan2(dy, dx) + Math.PI) / TAU) * 5), seed + 11) < 0.3 ? 0 : 1;
    }
    case 'bands': { if (zone === 'limb' || zone === 'sock') return 0; const u = s / (W * 1.1 * k), i = Math.floor(u); return u - i < 0.34 + 0.08 * h3(i, 1, seed) - (aa > 2.4 ? 0.2 : 0) ? 1 : 0; }
    case 'rings': { if (!tail) return 0; const u = s / (W * 0.45 * k), i = Math.floor(u); return u - i < 0.36 ? 1 : 0; }
    case 'saddle': { if (zone === 'limb' || zone === 'sock' || tail || zone === 'face') return 0; const sm = (F.sHips + F.sShoulder) / 2, half = (F.sShoulder - F.sHips) * 0.36; const st = Math.floor(aa * 4) / 4; return Math.abs(s - sm) < half * (1.1 - st * 0.25) + W * 0.06 * (h3(Math.floor(aa * 5), 3, seed) - 0.5) && aa < 1.5 ? 1 : 0; }
    case 'dorsal': return aa < 0.38 + 0.06 * h3(Math.floor(s / (W * 0.2)), 4, seed) && zone !== 'limb' && zone !== 'sock' ? 1 : 0;
    case 'shoulderStripes': { if (s < F.sShoulder - W * 1.4 || s > F.sNeck + W * 0.4 || aa > 2.2) return 0; const u = (s + aa * W * 0.3) / (W * 0.42 * k), i = Math.floor(u); return Math.abs(u - i - 0.5) < 0.18 * (1 - aa / 2.6) ? 1 : 0; }
    case 'mottled': case 'blotches': {
      if (pt.kind === 'mottled' && (aa < 0.7 || aa > 2.2)) return 0;
      const size = W * (pt.kind === 'blotches' ? 0.9 : 0.7) * k, c = cell3(p[0], p[1], p[2], size, seed + 17);
      if (h3(c.id, 5, seed) < 0.45) return 0;
      return inPatch(p[0] - c.cx + (p[2] - c.cz) * 0.5, p[1] - c.cy, size * (0.3 + 0.12 * h3(c.id, 6, seed)), c.id, seed) ? 1 : 0;
    }
  }
  return 0;
}

export type Zone = 'back' | 'flank' | 'belly' | 'neck' | 'tail' | 'limb' | 'sock' | 'foot' | 'face' | 'muzzle' | 'ear';
export type PartKind = 'trunk' | 'limb' | 'foot' | 'head' | 'jaw' | 'ear' | 'lid';
const ZI: Record<Zone, number> = { back: 0, flank: 1, belly: 2, neck: 3, tail: 4, limb: 5, sock: 6, foot: 7, face: 8, muzzle: 9, ear: 10 };
const ZN = Object.keys(ZI) as Zone[];
const surfOf = (c: Coat, z: Zone): Surf => {
  const S = c.surf;
  switch (z) {
    case 'back': return S.back ?? S.body; case 'belly': return S.belly ?? S.body; case 'neck': return S.neck ?? S.body; case 'tail': return S.tail ?? S.body;
    case 'limb': return S.limb ?? S.body; case 'sock': return S.sock ?? S.limb ?? S.body; case 'foot': return S.foot ?? S.sock ?? S.limb ?? S.body;
    case 'face': return S.face ?? S.body; case 'muzzle': return S.muzzle ?? S.face ?? S.body; case 'ear': return S.ear ?? S.face ?? S.body; default: return S.body;
  }
};
const _p: V3 = [0, 0, 0];

/** the flat colours of a coat for the quick build (far LOD) */
export const coatTone = (c: Coat): Tone => ({ ramp: RP(c.base[0]), step: c.base[1], belly: { ramp: RP(c.belly[0]), step: c.belly[1], below: -0.45 } });

/** a painter for one kind of part, drawing the coat's zones from the real surface under every texel */
export function coatPaint(C: CoatCtx, part: PartKind, o: { flow?: number; extra?: (px: Px, ch: Chart) => void; before?: (px: Px, zone: Uint8Array) => void; hipY?: number; light?: number; inner?: V3 } = {}) {
  const f = (ch: Chart, _pc: Piece, b: Body) => {
    const px = new Px(ch, b), gb = px.gb, P = gb.P, N = gb.N, n = px.n, c = C.coat, F = C.F, seed = C.seed;
    if (o.light !== undefined) px.lightK = o.light;
    const zone = new Uint8Array(n), S = new Float32Array(n), A = new Float32Array(n);
    const Rb = RP(c.base[0]), Rbel = RP(c.belly[0]), Rbk = c.back ? RP(c.back[0]) : Rb, Rpat = c.pattern ? RP(c.pattern.c[0]) : Rb, Rh = c.pattern?.heart ? RP(c.pattern.heart[0]) : Rpat;
    const Rsock = c.socks ? RP(c.socks.c[0]) : Rb, Rmuz = c.face?.muzzle ? RP(c.face.muzzle[0]) : Rbel, Rchin = c.face?.chin ? RP(c.face.chin[0]) : Rbel;
    const bellyArc = c.bellyArc ?? 1.0;
    // the belly line follows cells (the scale rows, the fur locks) rather than a smooth curve
    const edgeCell = Math.max(0.01, F.W * 0.09);
    for (let i = 0; i < n; i++) {
      _p[0] = P[i * 3]; _p[1] = P[i * 3 + 1]; _p[2] = P[i * 3 + 2];
      const ny = N[i * 3 + 1];
      let z: Zone, s = 0, a = 0;
      if (part === 'trunk') {
        const l = locate(F, _p); s = l.s; a = l.a;
        const ce = cell3(_p[0], _p[1], _p[2], edgeCell, seed + 29), jit = (h3(ce.id, 1, seed) - 0.5) * 0.35;
        const aa = Math.abs(a);
        z = aa > Math.PI - bellyArc + jit ? 'belly' : s < F.sRump ? 'tail' : s > F.sNeck ? 'neck' : aa < 0.9 + jit ? 'back' : 'flank';
        if (z === 'neck' && aa > Math.PI - bellyArc * 1.15 + jit) z = 'belly';
      } else if (part === 'limb' || part === 'foot') {
        const sockH = c.socks ? c.socks.h : -1;
        z = part === 'foot' ? 'foot' : _p[1] < sockH + (h3(Math.floor(_p[0] * 40 + _p[2] * 40), 3, seed) - 0.5) * 0.02 ? 'sock' : 'limb';
        // the pale inner thigh and armpit
        if (z === 'limb' && o.inner && (N[i * 3] * o.inner[0] + N[i * 3 + 2] * o.inner[2]) > 0.55 && (o.hipY === undefined || _p[1] > o.hipY - F.W * 0.22)) z = 'belly';
        s = _p[1]; a = Math.atan2(N[i * 3], N[i * 3 + 2]);
      } else if (part === 'head' || part === 'jaw' || part === 'lid') {
        const dz = _p[2] - C.skullC[2];
        z = part === 'jaw' ? (ny < -0.25 ? 'belly' : 'muzzle') : dz > C.zStop ? 'muzzle' : ny < -0.55 ? 'belly' : 'face';
        s = F.L + dz; a = Math.atan2(_p[0] - C.skullC[0], _p[1] - C.skullC[1]);
      } else { z = 'ear'; }
      zone[i] = ZI[z]; S[i] = s; A[i] = a;
      // colour: the zone's ramp and step, the pattern over it
      let R = Rb, st = c.base[1];
      if (z === 'belly') { R = part === 'jaw' || part === 'head' ? Rchin : Rbel; st = c.belly[1]; }
      else if (z === 'back' && c.back) { R = Rbk; st = c.back[1]; }
      else if (z === 'sock' || z === 'foot') { if (c.socks) { R = Rsock; st = c.socks.c[1]; } }
      else if (z === 'muzzle' && c.face?.muzzle) { R = Rmuz; st = c.face.muzzle[1]; }
      const pv = z === 'sock' && c.socks ? 0 : patternAt(C, _p, z, s, a);
      if (pv === 1) { R = Rpat; st = c.pattern!.c[1]; } else if (pv === 2) { R = Rh; st = c.pattern!.heart?.[1] ?? c.pattern!.c[1] - 1; }
      px.put(i, R, st);
      if (z === 'flank' && c.back && Math.abs(a) < 1.25) px.step[i] -= 0.3;
    }
    o.before?.(px, zone);
    // the drawn surfaces, one pass per distinct surface over the zones that wear it
    const flow = o.flow ?? (part === 'limb' || part === 'foot' || part === 'ear' ? 1 : -1);
    const groups = new Map<Surf, number[]>();
    for (let zi = 0; zi < ZN.length; zi++) { const sf = surfOf(c, ZN[zi]); let g = groups.get(sf); if (!g) groups.set(sf, (g = [])); g.push(zi); }
    for (const [sf, zs] of groups) {
      const zm = new Uint8Array(16); for (const zi of zs) zm[zi] = 1;
      let any = false; for (let i = 0; i < n; i++) if (zm[zone[i]]) { any = true; break; }
      if (!any) continue;
      const mask = (i: number) => zm[zone[i]];
      if (sf.fur) px.fur({ len: sf.fur.len, width: sf.fur.width, down: sf.fur.down ?? 0.5, flow, mask, seed: seed + 3, root: sf.fur.root, tip: sf.fur.tip });
      if (sf.scales) px.scales({ size: sf.scales.size, kind: sf.scales.kind, len: sf.scales.len, flow, mask, ink: sf.scales.ink, seed: seed + 5 });
      if (sf.pebbles) px.pebbles(sf.pebbles.size, { depth: sf.pebbles.depth, pores: sf.pebbles.pores, mask, seed: seed + 7 });
      if (sf.folds) px.folds(part === 'limb' || part === 'foot' ? [0, 1, 0] : [0, 0.3, 1], [0, 0, 0], sf.folds.spacing, { depth: sf.folds.depth ?? 0.8, mask, seed: seed + 9 });
      if (sf.glands) glands(px, sf.glands.size, sf.glands.density, mask, seed + 13);
      if (sf.creases) px.creaseInk(sf.creases, { mask });
    }
    // the face's marks
    if ((part === 'head' || part === 'lid') && c.face?.mask) { const Rm = RP(c.face.mask[0]); for (let i = 0; i < n; i++) if (zone[i] === ZI.face && Math.abs(P[i * 3 + 1] - C.skullC[1]) < F.W * 0.12 && P[i * 3 + 2] > C.skullC[2] - F.W * 0.1) { px.rampI[i] = px.ramp(Rm); px.step[i] = c.face.mask[1]; } }
    if (c.mud && (part === 'limb' || part === 'foot' || part === 'trunk')) { const h = c.mud.h; px.mud((i) => h + Math.sin(P[i * 3 + 2] * 9 + P[i * 3] * 7) * h * 0.18, RP(c.mud.ramp ?? 'soil'), { clump: Math.max(0.02, h * 0.12), seed }); }
    o.extra?.(px, ch);
    // wet skin and glossy scales catch glints
    for (const [sf, zs] of groups) if (sf.wet) { const zm = new Uint8Array(16); for (const zi of zs) zm[zi] = 1; px.glints(RP('snow'), { mask: (i) => zm[zone[i]], every: sf.wet, size: F.W * 0.08 }); }
    px.flush();
  };
  (f as unknown as { tone: Tone }).tone = part === 'limb' || part === 'foot' ? { ramp: RP((C.coat.socks?.c ?? C.coat.base)[0]), step: (C.coat.socks?.c ?? C.coat.base)[1] } : coatTone(C.coat);
  return f;
}

/** glandular warts: low domed polygons scattered over wet skin, each lit on its upper side with a dark rim and a pore */
export function glands(px: Px, size: number, density: number, mask: (i: number) => number, seed = 13) {
  const P = px.gb.P, N = px.gb.N, L = px.body.light, tpm = 1 / px.mpt;
  for (let i = 0; i < px.n; i++) {
    if (!mask(i)) continue;
    const c = cell3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], size, seed);
    if (h3(c.id, 1, seed) > density) continue;
    const vx = P[i * 3] - c.cx, vy = P[i * 3 + 1] - c.cy, vz = P[i * 3 + 2] - c.cz;
    const nd = vx * N[i * 3] + vy * N[i * 3 + 1] + vz * N[i * 3 + 2], tx = vx - N[i * 3] * nd, ty = vy - N[i * 3 + 1] * nd, tz = vz - N[i * 3 + 2] * nd;
    const r = size * (0.2 + 0.18 * h3(c.id, 2, seed));
    // a polygon in the tangent plane (six jittered sectors)
    const ang = Math.atan2(ty, tx + tz * 0.7), sec = Math.floor(((ang + Math.PI) / TAU) * 6) % 6, rr = r * (0.75 + 0.35 * h3(c.id, sec, seed + 1));
    const d = Math.hypot(tx, ty, tz);
    if (d > rr) continue;
    const face = (tx * L[0] + ty * L[1] + tz * L[2]) / (d || 1), edge = (rr - d) * tpm;
    let mk = edge < 1 ? -1.5 : face > 0.25 ? 1.1 : face < -0.3 ? -0.5 : 0.4;
    if (d < rr * 0.18 && h3(c.id, 4, seed) < 0.5) mk = -1.8; // the gland's pore
    px.mark[i] += mk;
  }
}

/** keratin (claws, hooves, horn sheaths, beaks): growth rings round it, a lit keel, glints, a darker base */
export function keratinPaint(R: RampName, step: number, o: { rings?: number; glint?: boolean } = {}) {
  const f = (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b);
    px.base(() => [RP(R), step]);
    if (o.rings) px.folds([0, 1, 0], [0, 0, 0], o.rings, { depth: 0.5, wob: 0.2 });
    px.creaseInk(0.7);
    if (o.glint !== false) px.glints(RP(R), { every: 0.6, size: 0.02 });
    px.flush();
  };
  (f as unknown as { tone: Tone }).tone = { ramp: RP(R), step };
  return f;
}

// TOOL MODELS · KIT. The shared workshop every tool model is built in: clean stylised pixel textures painted from the
// master ramps at 32 texels per metre (a 64 px tile spans 2 m; every surface's UVs are laid out in metres, so the
// density never changes with a part's size), hard-surface primitives (chamfered boxes, turned lathe parts with sharp
// profile corners, toothed gears, wound coils, braided cables, fins, vents, bolts), stencilled decals (a 3x5 stencil
// face, hazard marks, arrows) and lamps that blink.
//
// One builder, two looks: UI lods ('icon' 'hud' 'hero') get the UI kit's toon material (banded key light, stepped
// metal glints, a rim; the kit's renderer inks the silhouette and the overlaps black), the 'world' lod gets lit
// built-in materials that write the G-buffer with the outline bit, so the game's post pass outlines them black too.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { RAMPS } from '../../art/palette';
import { Px, hash } from '../../ui/kit/px';
import { paintTile, type TileKind } from './paint';
import { toon } from '../../ui/kit/model3d';
import { gbuf, F_EMIT } from '../../gfx/gbuf';

export type Lod = 'icon' | 'hud' | 'hero' | 'world';
export type Ramp = readonly number[];
export type V3 = [number, number, number];
export const R = RAMPS;
export const PI = Math.PI, TAU = Math.PI * 2;
/** texels per metre and the tile size: a 64 px tile spans 2 m */
export const TPM = 32, TILE = 64;
const UVK = TPM / TILE;
export const INKC = 0x0b0d11;
const at = (r: Ramp, i: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];

// ================================================================== textures
interface TexPair { ui: THREE.Texture; world: THREE.Texture; cv: HTMLCanvasElement }
const TEX = new Map<string, TexPair>();
function pair(cv: HTMLCanvasElement): TexPair {
  const mk = (cs: THREE.ColorSpace) => { const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = cs; return t; };
  return { ui: mk(THREE.NoColorSpace), world: mk(THREE.SRGBColorSpace), cv };
}
/** paint a texture once (cached by key) */
export function painted(key: string, w: number, h: number, f: (p: Px) => void): TexPair {
  let t = TEX.get(key); if (t) return t;
  const p = new Px(w, h); f(p); t = pair(p.canvas()); TEX.set(key, t); return t;
}
/** a live canvas texture (screens, gauges): draw into .px then call .push() */
export function liveTex(w: number, h: number) {
  const px = new Px(w, h), cv = px.canvas(), t = pair(cv);
  return { px, t, push() { px.canvas(cv); t.ui.needsUpdate = true; t.world.needsUpdate = true; } };
}
type Painter = (p: Px) => void;
const T = (kind: TileKind, base: number, seed: number, o: { wear?: number; light?: number } = {}): [number, number, Painter] => [64, 64, (p) => { paintTile(p, kind, base, seed, o); }];
const PAINT: Record<string, [number, number, Painter]> = {
  steel: T('metal', R.steel[4], 3),
  chrome: T('polished', R.steel[5], 4),
  frame: T('cast', R.steel[2], 5),
  dark: T('cast', R.steel[1], 11),
  rubber: T('rubber', R.basalt[1], 21),
  brass: T('brass', R.brass[4], 6),
  copper: T('metal', R.copper[4], 7),
  // a coil is wound wire: the winding is geometry (helices, stacked turns); the copper itself is polished
  coil: T('polished', R.copper[5], 8),
  grille: T('cast', R.steel[1], 12),
  hazard: [64, 64, (p) => { for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, ((x + y) % 16) < 8 ? R.ochre[5] : R.ink[1]); }],
  knurl: T('metal', R.steel[3], 14, { wear: 0.8 }),
  glass: T('glass', R.water[3], 15),
  carbon: T('cast', R.basalt[1], 16),
  cable: T('rubber', R.basalt[2], 17),
  ceramic: T('ceramic', R.bone[4], 18),
  ink: [8, 8, (p) => p.rect(0, 0, 8, 8, INKC)],
  fin: T('metal', R.steel[3], 9, { light: 0.4 }),
};
/** a named shared texture (see PAINT), or an enamel paint keyed 'paint:<ramp>:<step>[:seed]', or 'metal:<ramp>:<step>' */
export function texOf(name: string): TexPair {
  const d = PAINT[name];
  if (d) return painted(name, d[0], d[1], d[2]);
  const m = /^paint:(\w+):(\d)(?::(\d+))?$/.exec(name);
  if (m) { const r = (R as Record<string, Ramp>)[m[1]] ?? R.steel; return painted(name, 64, 64, (p) => { paintTile(p, 'paint', at(r, Number(m[2])), Number(m[3] ?? 7) + m[1].length * 13); }); }
  const n = /^metal:(\w+):(\d)$/.exec(name);
  if (n) { const r = (R as Record<string, Ramp>)[n[1]] ?? R.steel; return painted(name, 64, 64, (p) => { paintTile(p, 'metal', at(r, Number(n[2])), 17 + n[1].length); }); }
  return painted('ink', 8, 8, PAINT.ink[2]);
}

// ------------------------------------------------------------------ the stencil face (3 x 5, one texel per cell)
const GL: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
  '-': '000000111000000', '/': '001001010100100', '.': '000000000000010', ' ': '000000000000000', '>': '100010001010100', '+': '000010111010000', '!': '010010010000010', '%': '101001010100101',
};
export function stencil(p: Px, s: string, x: number, y: number, c: number, gap = 1) {
  let cx = x;
  for (const ch of s.toUpperCase()) { const g = GL[ch] ?? GL[' ']; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') p.set(cx + i, y + j, c); cx += 3 + gap; }
  return cx - x - gap;
}
export const stencilW = (s: string, gap = 1) => s.length * (3 + gap) - gap;
export type DecalKind = 'label' | 'stencil' | 'hazard' | 'warn' | 'arrow' | 'bar' | 'chev' | 'dots' | 'flame' | 'bolt' | 'rad';
export interface DecalSpec { kind: DecalKind; text?: string; ramp?: Ramp; ink?: number; w?: number; h?: number }
/** paint a decal's pixels (the size in texels comes from the decal's size in metres at 32 px/m) */
function paintDecal(p: Px, d: DecalSpec) {
  const W = p.w, H = p.h, r = d.ramp ?? R.bone, ink = d.ink ?? R.ink[0];
  if (d.kind === 'label') {
    p.rect(0, 0, W, H, at(r, 4)); p.hl(0, W - 1, 0, at(r, 5)); p.vl(0, 0, H - 1, at(r, 5)); p.hl(0, W - 1, H - 1, at(r, 2)); p.vl(W - 1, 0, H - 1, at(r, 2));
    const tw = stencilW(d.text ?? ''); stencil(p, d.text ?? '', Math.max(1, Math.round((W - tw) / 2)), Math.round((H - 5) / 2), ink);
  } else if (d.kind === 'stencil') {
    const tw = stencilW(d.text ?? ''); stencil(p, d.text ?? '', Math.max(0, Math.round((W - tw) / 2)), Math.round((H - 5) / 2), d.ink ?? at(r, 5));
  } else if (d.kind === 'hazard') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, ((x + y) % 6) < 3 ? R.ochre[5] : R.ink[1]);
  } else if (d.kind === 'chev') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (x + Math.abs(y - (H - 1) / 2)) % 6; p.set(x, y, k < 3 ? at(r, 5) : R.ink[1]); }
  } else if (d.kind === 'warn') {
    // a warning triangle: ochre with an ink rim and a bang
    for (let y = 0; y < H; y++) { const half = ((y + 1) / H) * (W / 2); for (let x = 0; x < W; x++) { const dx = Math.abs(x + 0.5 - W / 2); if (dx <= half) p.set(x, y, dx > half - 1.2 || y === H - 1 ? R.ink[0] : R.ochre[5]); } }
    const cx = Math.floor(W / 2); for (let y = Math.floor(H * 0.35); y < H - 3; y++) p.set(cx, y, R.ink[0]); p.set(cx, H - 2, R.ink[0]);
  } else if (d.kind === 'arrow') {
    const cy = Math.floor(H / 2); for (let x = 0; x < W; x++) { const tip = W - x; const hw = tip < H / 2 + 1 ? tip - 1 : 1; for (let y = -hw; y <= hw; y++) p.set(x, cy + y, at(r, 5)); }
  } else if (d.kind === 'bar') {
    for (let x = 0; x < W; x++) if (hash(x, 3, W) > 0.4) p.vl(x, 0, H - 1, x % 2 ? R.ink[0] : R.ink[1]);
  } else if (d.kind === 'dots') {
    for (let x = 1; x < W; x += 2) p.set(x, Math.floor(H / 2), at(r, 5));
  } else if (d.kind === 'flame') {
    const cx = W / 2; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = (x + 0.5 - cx) / (W / 2), v = y / H; if (Math.abs(u) < Math.sin(v * PI) * (0.6 + v * 0.4)) p.set(x, y, v > 0.6 ? R.rust[5] : R.ochre[6]); }
  } else if (d.kind === 'bolt') {
    const pts = [[0.65, 0], [0.2, 0.55], [0.5, 0.55], [0.3, 1], [0.85, 0.4], [0.55, 0.4], [0.75, 0]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = (x + 0.5) / W, v = (y + 0.5) / H; let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside; } if (inside) p.set(x, y, at(r, 5)); }
  } else if (d.kind === 'rad') {
    const c = (W - 1) / 2; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = x - c, dy = y - c, d0 = Math.hypot(dx, dy), a = Math.atan2(dy, dx); if (d0 < 1.2 || (d0 > 2 && d0 < c + 0.5 && Math.cos(a * 3) > 0.35)) p.set(x, y, R.ink[0]); else if (d0 < c + 0.5) p.set(x, y, R.ochre[5]); }
  }
}

// ================================================================== geometry
const GEO = new Map<string, THREE.BufferGeometry>();
export function cached(key: string, f: () => THREE.BufferGeometry) { let g = GEO.get(key); if (!g) { g = f(); GEO.set(key, g); } return g; }
/** non-indexed, UVs projected per face on its dominant axis in metres (32 px/m); keeps the normals it has */
export function uv32<T extends THREE.BufferGeometry>(geo: T): T {
  const g = (geo.index ? geo.toNonIndexed() : geo) as T;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const p = g.getAttribute('position'), uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const X = p.getX(i + k), Y = p.getY(i + k), Z = p.getZ(i + k);
      let u: number, v: number;
      if (ay >= ax && ay >= az) { u = X; v = Z; } else if (ax >= az) { u = Z; v = Y; } else { u = X; v = Y; }
      uv[(i + k) * 2] = u * UVK + 0.5; uv[(i + k) * 2 + 1] = v * UVK + 0.5;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
/** a chamfered box (centred) */
export function cbox(w: number, h: number, d: number, c = 0.015): THREE.BufferGeometry {
  return cached(`cb${w},${h},${d},${c}`, () => {
    c = Math.min(c, w / 2.2, h / 2.2, d / 2.2);
    const pts: THREE.Vector3[] = [], X = w / 2, Y = h / 2, Z = d / 2;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push(new THREE.Vector3(sx * (X - c), sy * (Y - c), sz * Z), new THREE.Vector3(sx * (X - c), sy * Y, sz * (Z - c)), new THREE.Vector3(sx * X, sy * (Y - c), sz * (Z - c)));
    }
    return uv32(new ConvexGeometry(pts));
  });
}
/** a plain box (for thin plates and fins) */
export function box(w: number, h: number, d: number) { return cached(`bx${w},${h},${d}`, () => uv32(new THREE.BoxGeometry(w, h, d))); }
/** a convex hull of points (wedges, brackets) */
export function hull(pts: V3[]) { return cached('hl' + pts.join(';'), () => uv32(new ConvexGeometry(pts.map((q) => new THREE.Vector3(...q))))); }
/**
 * a turned part: the profile [r, y] runs from the bottom (r = 0 for a closed foot) up the outside and in over the top;
 * every profile corner stays sharp (each segment is its own band), smooth round the axis. UVs: metres round and along.
 */
export function lathe(prof: [number, number][], seg = 16, o: { arc?: number; a0?: number; flat?: boolean } = {}): THREE.BufferGeometry {
  return cached(`la${seg}|${o.arc ?? ''}|${o.a0 ?? ''}|${o.flat ? 'f' : ''}|${prof.join(';')}`, () => {
    const arc = o.arc ?? TAU, a0 = o.a0 ?? 0, pos: number[] = [], nor: number[] = [], uv: number[] = [];
    let acc = 0;
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i], [r1, y1] = prof[i + 1], dr = r1 - r0, dy = y1 - y0, L = Math.hypot(dr, dy);
      if (L < 1e-7) continue;
      const nr = dy / L, ny = -dr / L, rm = Math.max(0.004, (r0 + r1) / 2);
      for (let s = 0; s < seg; s++) {
        const aA = a0 + (arc * s) / seg, aB = a0 + (arc * (s + 1)) / seg, cA = Math.cos(aA), sA = Math.sin(aA), cB = Math.cos(aB), sB = Math.sin(aB);
        const A0 = [r0 * cA, y0, r0 * sA], A1 = [r1 * cA, y1, r1 * sA], B0 = [r0 * cB, y0, r0 * sB], B1 = [r1 * cB, y1, r1 * sB];
        const cM = Math.cos((aA + aB) / 2), sM = Math.sin((aA + aB) / 2);
        const nA = o.flat ? [nr * cM, ny, nr * sM] : [nr * cA, ny, nr * sA], nB = o.flat ? nA : [nr * cB, ny, nr * sB];
        const uA = aA * rm * UVK + 0.25, uB = aB * rm * UVK + 0.25, v0 = acc * UVK + 0.25, v1 = (acc + L) * UVK + 0.25;
        pos.push(...A0, ...A1, ...B0, ...B0, ...A1, ...B1); nor.push(...nA, ...nA, ...nB, ...nB, ...nA, ...nB);
        uv.push(uA, v0, uA, v1, uB, v0, uB, v0, uA, v1, uB, v1);
      }
      acc += L;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  });
}
/** a chamfered cylinder along Y */
export const cyl = (r: number, h: number, seg = 16, c = 0) => lathe(c > 0 ? [[0, -h / 2], [r - c, -h / 2], [r, -h / 2 + c], [r, h / 2 - c], [r - c, h / 2], [0, h / 2]] : [[0, -h / 2], [r, -h / 2], [r, h / 2], [0, h / 2]], seg);
/** a tapered cylinder along Y (r0 at the bottom) */
export const cone = (r0: number, r1: number, h: number, seg = 16) => lathe([[0, -h / 2], [r0, -h / 2], [r1, h / 2], [0, h / 2]], seg);
/** a ring (washer / collar) along Y */
export const ring = (ro: number, ri: number, h: number, seg = 20, c = 0) => lathe([[ri, -h / 2], [ro - c, -h / 2], [ro, -h / 2 + c], [ro, h / 2 - c], [ro - c, h / 2], [ri, h / 2], [ri, -h / 2]], seg);
export const sphere = (r: number, w = 14, h = 10) => cached(`sp${r},${w},${h}`, () => { const g = new THREE.SphereGeometry(r, w, h); g.setAttribute('uv', new THREE.BufferAttribute((g.getAttribute('uv').array as Float32Array).map((v, i) => v * (i % 2 ? PI * r : TAU * r) * UVK), 2)); return g; });
export const torus = (r: number, t: number, rs = 8, ts = 24, arc = TAU) => cached(`to${r},${t},${rs},${ts},${arc}`, () => { const g = new THREE.TorusGeometry(r, t, rs, ts, arc); g.setAttribute('uv', new THREE.BufferAttribute((g.getAttribute('uv').array as Float32Array).map((v, i) => v * (i % 2 ? TAU * t : arc * r) * UVK), 2)); return g; });
/** a toothed gear in the XY plane (axis Z), centred; lightening holes on big ones */
export function gear(r: number, teeth: number, thick: number, o: { depth?: number; hole?: number; holes?: number } = {}): THREE.BufferGeometry {
  return cached(`ge${r},${teeth},${thick},${o.depth},${o.hole},${o.holes}`, () => {
    const dep = o.depth ?? Math.min(0.03, r * 0.18), rr = r - dep, p = TAU / teeth, sh = new THREE.Shape();
    for (let i = 0; i < teeth; i++) {
      const a = i * p, pts = [[rr, a - p * 0.5], [rr, a - p * 0.28], [r, a - p * 0.14], [r, a + p * 0.14], [rr, a + p * 0.28]];
      pts.forEach(([rad, ang], k) => { const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad; if (i === 0 && k === 0) sh.moveTo(x, y); else sh.lineTo(x, y); });
    }
    sh.closePath();
    const hole = o.hole ?? r * 0.18, hp = new THREE.Path(); hp.absarc(0, 0, hole, 0, TAU, true); sh.holes.push(hp);
    const nh = o.holes ?? (r > 0.07 ? 5 : 0);
    for (let i = 0; i < nh; i++) { const a = (i / nh) * TAU, m = (hole + rr) / 2, rh = (rr - hole) * 0.27, q = new THREE.Path(); q.absarc(Math.cos(a) * m, Math.sin(a) * m, rh, 0, TAU, true); sh.holes.push(q); }
    const bev = Math.min(0.004, thick * 0.2);
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 10 });
    g.translate(0, 0, -(thick - bev * 2) / 2);
    return uv32(g);
  });
}
/** a wound coil: a wire helix of `turns` round a radius, along Y, centred */
export function helix(r: number, len: number, turns: number, wire: number, det = 2): THREE.BufferGeometry {
  return cached(`hx${r},${len},${turns},${wire},${det}`, () => {
    const n = Math.max(24, Math.round(turns * (det >= 2 ? 14 : 8))), pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * TAU; pts.push(new THREE.Vector3(Math.cos(a) * r, -len / 2 + t * len, Math.sin(a) * r)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, wire, det >= 2 ? 6 : 4, false);
    return withUV(g, TAU * r * turns, TAU * wire);
  });
}
/** a cable through points (with a slight sag already in them), radius r */
export function cable(pts: V3[], r: number, det = 2): THREE.BufferGeometry {
  return cached(`ca${r},${det},${pts.join(';')}`, () => {
    const c = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), L = c.getLength();
    return withUV(new THREE.TubeGeometry(c, Math.max(8, Math.round(L * (det >= 2 ? 40 : 18))), r, det >= 2 ? 6 : 4, false), L, TAU * r);
  });
}
/** a helix whose radius tapers from r0 (bottom) to r1 (top): drill flutes, augers */
export function helixTaper(r0: number, r1: number, len: number, turns: number, wire: number, det = 2, phase = 0): THREE.BufferGeometry {
  return cached(`ht${r0},${r1},${len},${turns},${wire},${det},${phase}`, () => {
    const n = Math.max(24, Math.round(turns * (det >= 2 ? 16 : 9))), pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n, a = phase + t * turns * TAU, r = r0 + (r1 - r0) * t; pts.push(new THREE.Vector3(Math.cos(a) * r, -len / 2 + t * len, Math.sin(a) * r)); }
    return withUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, wire, det >= 2 ? 5 : 4, false), len * 2, TAU * wire);
  });
}
function withUV(g: THREE.BufferGeometry, lu: number, lv: number) { const a = g.getAttribute('uv'); for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * lu * UVK, a.getY(i) * lv * UVK); return g; }
/** an extruded polygon (XY outline, depth along Z, centred) */
export function prism(pts: [number, number][], depth: number, bev = 0.004): THREE.BufferGeometry {
  return cached(`pr${depth},${bev},${pts.join(';')}`, () => {
    const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
    const b = Math.min(bev, depth * 0.3);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, depth - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1 });
    g.translate(0, 0, -(depth - b * 2) / 2);
    return uv32(g);
  });
}
/** rotations that turn a Y-axis part onto another axis */
export const AX = { x: [0, 0, -PI / 2] as V3, y: [0, 0, 0] as V3, z: [PI / 2, 0, 0] as V3, nx: [0, 0, PI / 2] as V3, nz: [-PI / 2, 0, 0] as V3 };

// ================================================================== materials
export interface Livery { hull: Ramp; hullStep?: number; accent: Ramp; accentStep?: number; glow: Ramp; name: string }
export interface MatOpts { metal?: number; gloss?: number; opacity?: number; emissive?: number; emissiveK?: number; side?: THREE.Side; rim?: number; bright?: number }
const MATS = new Map<string, THREE.Material>();
/** the material for a texture (cached): the kit's toon in the UI, a lit G-buffer material in the world */
export function matOf(tex: string, ui: boolean, o: MatOpts = {}): THREE.Material {
  const key = `${ui ? 'u' : 'w'}|${tex}|${JSON.stringify(o)}`;
  let m = MATS.get(key); if (m) return m;
  const t = texOf(tex);
  if (ui) m = toon({ map: t.ui, metal: o.metal ?? 0, gloss: o.gloss ?? 0.25, opacity: o.opacity, emissive: o.emissive, emissiveK: o.emissiveK, side: o.side, rim: o.rim ?? 0.16, bright: o.bright });
  else {
    const tr = (o.opacity ?? 1) < 1;
    if ((o.metal ?? 0) > 0.3) m = new THREE.MeshPhongMaterial({ map: t.world, shininess: 20 + (o.gloss ?? 0.4) * 60, specular: new THREE.Color(0x404040).multiplyScalar(0.5 + (o.metal ?? 0)), transparent: tr, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: !tr });
    else m = new THREE.MeshLambertMaterial({ map: t.world, transparent: tr, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: !tr });
    if (o.emissive !== undefined) { (m as THREE.MeshLambertMaterial).emissive = new THREE.Color(o.emissive); (m as THREE.MeshLambertMaterial).emissiveIntensity = o.emissiveK ?? 1; }
    gbuf(m, tr ? 0 : o.emissive !== undefined ? F_EMIT + 1 : 1);
  }
  MATS.set(key, m); return m;
}
/** a lamp / glow material of its own (its brightness animates: setGlow) */
export function glowMat(color: number, k: number, ui: boolean, o: { body?: number; opacity?: number } = {}): THREE.Material {
  const base = new THREE.Color(color);
  let m: THREE.Material;
  if (ui) {
    m = toon({ color: o.body ?? color, emissive: color, emissiveK: 1, light: 0.45, opacity: o.opacity, gloss: 0.8 }).clone();
  } else {
    m = gbuf(new THREE.MeshLambertMaterial({ color: o.body ?? color, emissive: base, emissiveIntensity: k, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1 }), (o.opacity ?? 1) < 1 ? 0 : F_EMIT + 1);
  }
  m.userData.glow = { r: base.r, g: base.g, b: base.b };
  setGlowMat(m, k);
  return m;
}
export function setGlowMat(m: THREE.Material, k: number) {
  const gl = m.userData.glow as { r: number; g: number; b: number } | undefined; if (!gl) return;
  const sm = m as THREE.ShaderMaterial;
  if (sm.uniforms?.uEmissive) (sm.uniforms.uEmissive.value as THREE.Vector3).set(gl.r * k, gl.g * k, gl.b * k);
  else (m as THREE.MeshLambertMaterial).emissiveIntensity = k;
}
/** a textured part that glows (a coil heating up, a hot nozzle): its own material, brightness via setGlow */
export function glowTexMat(tex: string, color: number, ui: boolean, o: MatOpts = {}): THREE.Material {
  const t = texOf(tex), base = new THREE.Color(color);
  const m: THREE.Material = ui
    ? toon({ map: t.ui, metal: o.metal ?? 0.8, gloss: o.gloss ?? 0.6, emissive: color, emissiveK: 1, rim: o.rim ?? 0.16 }).clone()
    : gbuf(new THREE.MeshPhongMaterial({ map: t.world, emissive: base, emissiveIntensity: 0, shininess: 40 }), F_EMIT + 1);
  m.userData.glow = { r: base.r, g: base.g, b: base.b };
  setGlowMat(m, 0);
  return m;
}
/** set a glowing mesh's brightness (its own glowMat) */
export function setGlow(o: THREE.Object3D | null | undefined, k: number) {
  if (!o) return;
  o.traverse((n) => { const mm = (n as THREE.Mesh).material; if (!mm) return; for (const m of Array.isArray(mm) ? mm : [mm]) setGlowMat(m, k); });
}

// ================================================================== the builder
export type PaintKey = 'hull' | 'hull2' | 'hullDark' | 'accent' | 'accent2' | 'frame' | 'steel' | 'chrome' | 'dark' | 'rubber' | 'brass' | 'copper' | 'coil' | 'grille' | 'hazard' | 'knurl' | 'glass' | 'carbon' | 'ink' | 'cable' | 'ceramic' | 'fin' | 'bone' | 'red' | 'white' | 'olive';
export interface MeshOpts { name?: string; lvl?: number; det?: number; shadow?: boolean }
/** a part list entry (for callouts: the component's name and the object at its centre) */
export interface Callout { key: string; label: string; obj: THREE.Object3D }
export class Kit {
  readonly ui: boolean;
  /** detail: 0 icon, 1 hud, 2 hero / world */
  readonly det: number;
  readonly callouts: Callout[] = [];
  /** objects shown from an upgrade level on */
  readonly gated: { obj: THREE.Object3D; lvl: number }[] = [];
  constructor(readonly lod: Lod, readonly liv: Livery) {
    this.ui = lod !== 'world';
    this.det = lod === 'icon' ? 0 : lod === 'hud' ? 1 : 2;
  }
  /** a material by its paint key (the livery decides the hull and accent colours) */
  paint(k: PaintKey | string, o: MatOpts = {}): THREE.Material {
    const L = this.liv, rn = (r: Ramp) => Object.keys(R).find((n) => (R as Record<string, Ramp>)[n] === r) ?? 'steel';
    switch (k) {
      case 'hull': return matOf(`paint:${rn(L.hull)}:${L.hullStep ?? 4}`, this.ui, { gloss: 0.45, ...o });
      case 'hull2': return matOf(`paint:${rn(L.hull)}:${(L.hullStep ?? 4) - 1}:3`, this.ui, { gloss: 0.4, ...o });
      case 'hullDark': return matOf(`paint:${rn(L.hull)}:${Math.max(1, (L.hullStep ?? 4) - 2)}:5`, this.ui, { gloss: 0.3, ...o });
      case 'accent': return matOf(`paint:${rn(L.accent)}:${L.accentStep ?? 4}:9`, this.ui, { gloss: 0.45, ...o });
      case 'accent2': return matOf(`paint:${rn(L.accent)}:${(L.accentStep ?? 4) - 1}:11`, this.ui, { gloss: 0.4, ...o });
      case 'bone': return matOf('paint:bone:5', this.ui, { gloss: 0.4, ...o });
      case 'white': return matOf('paint:snow:4', this.ui, { gloss: 0.5, ...o });
      case 'red': return matOf('paint:ruby:4', this.ui, { gloss: 0.5, ...o });
      case 'olive': return matOf('paint:olive:3', this.ui, { gloss: 0.3, ...o });
      case 'frame': return matOf('frame', this.ui, { metal: 0.55, gloss: 0.4, ...o });
      case 'steel': return matOf('steel', this.ui, { metal: 0.8, gloss: 0.5, ...o });
      case 'chrome': return matOf('chrome', this.ui, { metal: 1, gloss: 0.9, ...o });
      case 'dark': return matOf('dark', this.ui, { metal: 0.35, gloss: 0.3, ...o });
      case 'rubber': return matOf('rubber', this.ui, { gloss: 0.08, ...o });
      case 'brass': return matOf('brass', this.ui, { metal: 0.9, gloss: 0.7, ...o });
      case 'copper': return matOf('copper', this.ui, { metal: 0.9, gloss: 0.7, ...o });
      case 'coil': return matOf('coil', this.ui, { metal: 0.85, gloss: 0.7, ...o });
      case 'grille': return matOf('grille', this.ui, { metal: 0.3, ...o });
      case 'hazard': return matOf('hazard', this.ui, { gloss: 0.3, ...o });
      case 'knurl': return matOf('knurl', this.ui, { metal: 0.8, gloss: 0.5, ...o });
      case 'glass': return matOf('glass', this.ui, { gloss: 1, opacity: 0.62, rim: 0.4, ...o });
      case 'carbon': return matOf('carbon', this.ui, { gloss: 0.3, ...o });
      case 'cable': return matOf('cable', this.ui, { gloss: 0.15, ...o });
      case 'ceramic': return matOf('ceramic', this.ui, { gloss: 0.35, ...o });
      case 'fin': return matOf('fin', this.ui, { metal: 0.7, gloss: 0.5, ...o });
      case 'ink': return matOf('ink', this.ui, { gloss: 0, ...o });
      default: return matOf(k, this.ui, o);
    }
  }
  /** a glow material of its own in the livery's energy colour (step 0..4 of its ramp) or any colour */
  glow(step = 3, k = 1, o: { color?: number; body?: number; opacity?: number } = {}) { return glowMat(o.color ?? at(this.liv.glow, step), k, this.ui, o); }
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material | PaintKey | THREE.Material[], parent: THREE.Object3D, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], o: MeshOpts = {}): THREE.Mesh {
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? this.paint(mat) : mat);
    m.position.set(...p); m.rotation.set(...r);
    if (o.name) m.name = o.name;
    if (!this.ui) { m.castShadow = o.shadow !== false; m.receiveShadow = true; }
    if (o.lvl && o.lvl > 1) this.gate(m, o.lvl);
    if (o.det !== undefined && this.det < o.det) return m;
    parent.add(m);
    return m;
  }
  group(parent: THREE.Object3D, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], o: { name?: string; lvl?: number } = {}): THREE.Group {
    const g = new THREE.Group(); g.position.set(...p); g.rotation.set(...r); if (o.name) g.name = o.name;
    if (o.lvl && o.lvl > 1) this.gate(g, o.lvl);
    parent.add(g); return g;
  }
  gate(obj: THREE.Object3D, lvl: number) { this.gated.push({ obj, lvl }); return obj; }
  /** name a component for callouts (the QA sheet labels them; the bench could too) */
  callout(key: string, label: string, obj: THREE.Object3D) { this.callouts.push({ key, label, obj }); return obj; }
  /** hex bolt heads at points on a face whose outward normal is axis ('x' 'y' 'z', '-x' ...) */
  bolts(parent: THREE.Object3D, pts: V3[], r = 0.012, axis = 'z', mat: PaintKey = 'steel', o: MeshOpts = {}) {
    if (this.det < 1 && !o.det) return;
    const rot = axisRot(axis), h = r * 0.9, g = cyl(r, h, 6);
    for (const q of pts) this.mesh(g, mat, parent, q, rot, o);
  }
  /** a ring of bolts round an axis */
  boltRing(parent: THREE.Object3D, rad: number, n: number, axis: 'x' | 'y' | 'z', at0: number, r = 0.011, mat: PaintKey = 'steel', a0 = 0, o: MeshOpts = {}) {
    const pts: V3[] = [];
    for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU, u = Math.cos(a) * rad, v = Math.sin(a) * rad; pts.push(axis === 'x' ? [at0, u, v] : axis === 'y' ? [u, at0, v] : [u, v, at0]); }
    this.bolts(parent, pts, r, axis, mat, o);
  }
  /** a decal: a thin painted plate (size in metres, 32 px/m), facing +Z of its frame */
  decal(parent: THREE.Object3D, d: DecalSpec, w: number, h: number, p: V3, r: V3 = [0, 0, 0], o: MeshOpts = {}) {
    // text is fine print: stencils and labels are painted at twice the density (shown from the hero lod up)
    const text = d.kind === 'label' || d.kind === 'stencil', dens = text ? TPM * 2 : TPM;
    if (text && this.det < 2 && !o.det) return null;
    const W = Math.max(3, Math.round(w * dens)), H = Math.max(3, Math.round(h * dens));
    const tw = text ? Math.max(W, stencilW(d.text ?? '') + 2) : W, th = text ? Math.max(H, 7) : H;
    const key = `dc|${d.kind}|${d.text ?? ''}|${tw}x${th}|${(d.ramp ?? R.bone)[0]}|${d.ink ?? ''}`;
    const t = painted(key, tw, th, (px) => paintDecal(px, d));
    const ww = tw / dens, hh = th / dens;
    const geo = cached(`dg${ww},${hh}`, () => new THREE.PlaneGeometry(ww, hh));
    const mat = this.ui ? toon({ map: t.ui, gloss: 0.3, rim: 0.1 }) : gbuf(new THREE.MeshLambertMaterial({ map: t.world, transparent: false, alphaTest: 0.5 }), 1);
    return this.mesh(geo, mat, parent, p, r, { det: 1, ...o });
  }
  /** a status diode in a black bezel; returns the lens (setGlow it) */
  diode(parent: THREE.Object3D, p: V3, axis = 'z', color?: number, r = 0.014, o: MeshOpts = {}) {
    const g = this.group(parent, p, axisRot(axis));
    this.mesh(ring(r * 1.6, r * 0.9, r * 0.8, 10), 'ink', g, [0, r * 0.2, 0]);
    const lens = this.mesh(sphere(r, 8, 6), this.glow(3, 1, { color }), g, [0, r * 0.35, 0], [0, 0, 0], o);
    lens.scale.set(1, 0.6, 1);
    return lens;
  }
  /** vent slats: a dark recess with n slats across it (in the XY plane of the frame, facing +Z) */
  vent(parent: THREE.Object3D, w: number, h: number, p: V3, r: V3 = [0, 0, 0], n = 0, o: MeshOpts = {}) {
    const g = this.group(parent, p, r);
    this.mesh(box(w, h, 0.01), 'ink', g, [0, 0, 0]);
    const k = n || Math.max(2, Math.round(h / 0.035));
    for (let i = 0; i < k; i++) this.mesh(box(w * 0.96, (h / k) * 0.45, 0.016), 'frame', g, [0, -h / 2 + (i + 0.5) * (h / k), 0.004], [-0.5, 0, 0], { det: 1, ...o });
    this.mesh(box(w + 0.016, 0.012, 0.02), 'dark', g, [0, h / 2 + 0.006, 0.002]);
    this.mesh(box(w + 0.016, 0.012, 0.02), 'dark', g, [0, -h / 2 - 0.006, 0.002]);
    return g;
  }
  /** a stack of cooling fins along Y (round, radius r, from y0 over len) */
  fins(parent: THREE.Object3D, r: number, ri: number, n: number, len: number, p: V3, rot: V3 = [0, 0, 0], o: MeshOpts = {}) {
    const g = this.group(parent, p, rot, o.lvl ? { lvl: o.lvl } : {});
    const t = Math.min(0.012, (len / n) * 0.4);
    for (let i = 0; i < n; i++) this.mesh(ring(r, ri, t, this.det >= 2 ? 20 : 14, t * 0.3), 'fin', g, [0, -len / 2 + (i + 0.5) * (len / n), 0]);
    return g;
  }
  /** a cable with its two ferrules */
  cable(parent: THREE.Object3D, pts: V3[], r = 0.014, mat: PaintKey = 'cable', o: MeshOpts = {}) {
    const m = this.mesh(cable(pts, r, this.det), mat, parent, [0, 0, 0], [0, 0, 0], o);
    if (this.det >= 1) for (const [a, b] of [[0, 1], [pts.length - 1, pts.length - 2]]) {
      const A = new THREE.Vector3(...pts[a]), B = new THREE.Vector3(...pts[b]), d = B.sub(A).normalize();
      const f = this.mesh(cyl(r * 1.5, r * 3, 8), 'steel', parent, [A.x + d.x * r * 1.5, A.y + d.y * r * 1.5, A.z + d.z * r * 1.5], [0, 0, 0], o);
      f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    }
    return m;
  }
}
export function axisRot(axis: string): V3 {
  switch (axis) { case 'x': return AX.x; case '-x': return AX.nx; case 'z': return AX.z; case '-z': return AX.nz; case '-y': return [PI, 0, 0]; default: return AX.y; }
}
/** shortest helpers for animation */
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (cur: number, goal: number, dt: number, up: number, down = up) => cur + (goal - cur) * Math.min(1, dt * (goal > cur ? up : down));
export const tri = (x: number) => 1 - Math.abs(((x % 1) + 1) % 1 * 2 - 1);

// ------------------------------------------------------------------ a meshing gear train (axes along Z)
export interface TrainGear { n: number; ang?: number; at?: [number, number]; paint?: PaintKey; thick?: number; z?: number }
/**
 * gears that really mesh: equal tooth pitch (`arc` metres per tooth on the pitch circle), each placed against the
 * one before at `ang` (radians, from the previous centre), phased so tooth meets gap; `turn(a)` turns the first by a
 * and every other by the ratio (alternating direction). Returns the gear meshes (Z axis) and their centres.
 */
export function gearTrain(k: Kit, parent: THREE.Object3D, list: TrainGear[], o: { arc?: number; dep?: number; thick?: number; z?: number } = {}) {
  const arc = o.arc ?? 0.035, dep = o.dep ?? 0.016, th = o.thick ?? 0.024, z0 = o.z ?? 0;
  const g: { m: THREE.Mesh; pr: number; ph: number; ratio: number }[] = [];
  let cx = 0, cy = 0;
  list.forEach((d, i) => {
    const pr = (d.n * arc) / TAU, r = pr + dep / 2, p = TAU / d.n;
    let ph = 0, ratio = 1;
    if (i === 0) { [cx, cy] = d.at ?? [0, 0]; ph = 0; }
    else {
      const prev = g[i - 1], th0 = d.ang ?? 0;
      cx += Math.cos(th0) * (prev.pr + pr); cy += Math.sin(th0) * (prev.pr + pr);
      const pp = TAU / list[i - 1].n, e1 = prev.ph + 0.5 * pp - th0;
      ph = th0 + PI - (prev.pr * e1) / pr;
      ratio = -prev.ratio * (prev.pr / pr);
      void p;
    }
    const m = k.mesh(gear(r, d.n, d.thick ?? th, { depth: dep }), d.paint ?? (i % 2 ? 'steel' : 'brass'), parent, [cx, cy, z0 + (d.z ?? 0)]);
    m.rotation.z = ph;
    g.push({ m, pr, ph, ratio });
  });
  return { gears: g.map((x) => x.m), centres: g.map((x) => [x.m.position.x, x.m.position.y] as [number, number]), turn(a: number) { for (const x of g) x.m.rotation.z = x.ph + a * x.ratio; } };
}

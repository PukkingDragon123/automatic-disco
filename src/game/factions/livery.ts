// Faction livery and the hardware kit: palettes drawn from the master ramps, stencilled decal atlases (red star,
// five-point star, Cyrillic / Chinese / Latin serials), shared materials, and a small mesh builder that bakes
// primitives into one vertex-coloured, flat-shaded geometry per model (plus one decal and one lamp geometry).
import * as THREE from 'three';
import { gbuf } from '../../gfx/gbuf';
import { RAMPS } from '../../art/palette';
import type { FactionId } from './plan';

export interface Livery {
  hull: number; hull2: number; dark: number; metal: number; trim: number; accent: number; star: number; stencil: number; glass: number; lamp: number; rust: number;
}
const O = RAMPS.olive, S = RAMPS.steel, SR = RAMPS.stampRed, SG = RAMPS.sage, P = RAMPS.paper, GA = RAMPS.glowAmber;
export const LIVERY: Record<FactionId, Livery> = {
  // riveted olive-drab steel, bare-metal machinery, a red star with a pale rim
  soviet: { hull: O[4], hull2: O[3], dark: S[1], metal: S[4], trim: S[5], accent: SR[3], star: SR[3], stencil: P[4], glass: RAMPS.water[2], lamp: GA[4], rust: RAMPS.rust[3] },
  // pale sage enamel, slimmer forms, red bands and a gold-rimmed five-point star
  prc: { hull: SG[5], hull2: SG[4], dark: RAMPS.slate[1], metal: S[5], trim: RAMPS.bone[4], accent: SR[3], star: SR[3], stencil: SR[2], glass: RAMPS.water[2], lamp: GA[4], rust: RAMPS.ochre[3] },
  // an off-white private capsule with safety-amber bands, olive field kit
  expedition: { hull: P[3], hull2: O[4], dark: O[1], metal: S[4], trim: GA[2], accent: GA[3], star: GA[3], stencil: RAMPS.ink[1], glass: RAMPS.water[2], lamp: GA[4], rust: RAMPS.rust[3] },
};

// ------------------------------------------------------------------------------------------------ decal atlas
const SERIALS: Record<FactionId, string[]> = {
  soviet: ['СССР', 'КОСМОС-4', 'Л-3 №047', 'ОПАСНО', 'ВОСТОК-2', 'Т-57 №12', 'ГСМ', 'МОЛОТ-2', 'Р-7 №3', 'СТОП', 'РУДНИК-3', 'ЗАВОД 9', 'ДОТ-4', 'ПУШКА-1'],
  prc: ['中国', '东方红-1', '红旗-7', '八一', '危险', '长征-3', '飞燕-3', '矿-2', '东风-5', '天山', '工-4', '燃料', '哨-6', '炮-2'],
  expedition: ['SURVEY 9', 'KEEP CLEAR', 'NO STEP', 'FUEL', 'CAMP 2', 'RADIO', 'MV-12', 'DANGER', 'HV-7', 'CREW 4', 'TENT B', 'MAST 1', 'POST 3', 'GUN 1'],
};
const NAME_LOCAL: Record<string, string> = {
  ZARYA: 'ЗАРЯ-1', VOSTOK: 'ВОСТОК-1', KOSMOS: 'КОСМОС-1', RASSVET: 'РАССВЕТ-1', MOLNIYA: 'МОЛНИЯ-1', TAYGA: 'ТАЙГА-1',
  HONGQI: '红旗-1', DONGFENG: '东风-1', CHANGZHENG: '长征-1', FEIYAN: '飞燕-1', TIANSHAN: '天山-1', HUANGHE: '黄河-1',
};
/** serial strip index meanings: 0 the nation mark, 1 the base name, 2.. the serials above (in order) */
export type Rect = [number, number, number, number];
export interface Atlas { tex: THREE.CanvasTexture; star: Rect; roundel: Rect; hazard: Rect; plate: Rect; text: Rect[] }
const ATLAS = new Map<string, Atlas>();
const hexCss = (c: number) => '#' + c.toString(16).padStart(6, '0');

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath();
}
/** a two-tone star: each arm split into a lit and a shaded half (the Soviet military star), rimmed */
function bevelStar(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, lit: string, shd: string, rim: string, rimW: number) {
  const r = R * 0.4;
  starPath(g, cx, cy, R + rimW, r + rimW * 0.8); g.fillStyle = rim; g.fill();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5, a1 = a - Math.PI / 5, a2 = a + Math.PI / 5;
    const tx = cx + Math.cos(a) * R, ty = cy + Math.sin(a) * R;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r); g.lineTo(tx, ty); g.closePath(); g.fillStyle = lit; g.fill();
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx, ty); g.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r); g.closePath(); g.fillStyle = shd; g.fill();
  }
}
/** stencil lettering: condensed, with the bridges a sign-painter's stencil leaves, and a little wear */
function stencil(g: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, h: number, col: string, cjk: boolean, seed: number) {
  g.save();
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = c.getContext('2d')!;
  t.fillStyle = col; t.textAlign = 'center'; t.textBaseline = 'middle';
  let fs = Math.floor(h * 0.78);
  const font = (n: number) => (cjk ? `900 ${n}px "WenQuanYi Zen Hei", "Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC", sans-serif` : `bold ${n}px "DejaVu Sans Condensed", "Arial Narrow", "Roboto Condensed", Arial, sans-serif`);
  t.font = font(fs);
  while (t.measureText(s).width > w * 0.94 && fs > 10) { fs--; t.font = font(fs); }
  t.fillText(s, w / 2, h / 2 + (cjk ? 1 : 2));
  // bridges: a thin horizontal tie through the middle, and vertical ties in round letters
  t.globalCompositeOperation = 'destination-out';
  t.fillRect(0, Math.round(h * 0.5) - 1, w, 2);
  let k = seed;
  const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4; i++) { const px = w * (0.15 + rnd() * 0.7), py = h * (0.2 + rnd() * 0.6); t.fillRect(Math.round(px), Math.round(py), 2 + Math.round(rnd() * 3), 2); }
  g.drawImage(c, x, y);
  g.restore();
}

export function atlas(f: FactionId, name = ''): Atlas {
  const key = f + ':' + name;
  const hit = ATLAS.get(key); if (hit) return hit;
  const W = 1024, H = 512;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  const L = LIVERY[f];
  const red = hexCss(SR[3]), redD = hexCss(SR[2]), pale = hexCss(P[4]), gold = hexCss(RAMPS.ochre[5]), ink = hexCss(RAMPS.ink[1]), amber = hexCss(GA[3]);
  // 0: the emblem
  if (f === 'soviet') bevelStar(g, 64, 68, 54, red, redD, pale, 4);
  else if (f === 'prc') { bevelStar(g, 64, 68, 54, red, redD, gold, 5); }
  else { // expedition: a compass rose roundel
    g.fillStyle = ink; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.fillStyle = amber; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = ink; starPath(g, 64, 64, 46, 10, -Math.PI / 2); g.fill();
    g.fillStyle = pale; starPath(g, 64, 64, 30, 6, -Math.PI / 4); g.fill();
  }
  // 1: roundel (star in a ring: unit markings)
  {
    const cx = 192, cy = 64;
    g.fillStyle = f === 'expedition' ? amber : f === 'prc' ? gold : pale; g.beginPath(); g.arc(cx, cy, 58, 0, Math.PI * 2); g.fill();
    g.fillStyle = f === 'expedition' ? ink : redD; g.beginPath(); g.arc(cx, cy, 50, 0, Math.PI * 2); g.fill();
    if (f === 'expedition') { g.fillStyle = amber; g.fillRect(cx - 40, cy - 8, 80, 16); g.fillRect(cx - 8, cy - 40, 16, 80); }
    else bevelStar(g, cx, cy + 3, 40, red, redD, f === 'prc' ? gold : pale, 3);
  }
  // 2: hazard band (diagonal stripes)
  {
    g.save(); g.beginPath(); g.rect(256, 0, 128, 128); g.clip();
    g.fillStyle = f === 'expedition' ? amber : f === 'prc' ? red : pale; g.fillRect(256, 0, 128, 128);
    g.fillStyle = f === 'soviet' ? red : ink;
    for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(256 + i * 32, 128); g.lineTo(256 + i * 32 + 16, 128); g.lineTo(256 + i * 32 + 16 + 128, 0); g.lineTo(256 + i * 32 + 128, 0); g.closePath(); g.fill(); }
    g.restore();
  }
  // 3: a riveted data plate
  {
    g.fillStyle = hexCss(S[5]); g.fillRect(388, 20, 120, 88);
    g.fillStyle = hexCss(S[3]); g.fillRect(392, 24, 112, 80);
    g.fillStyle = hexCss(S[6]); for (const [px, py] of [[396, 28], [496, 28], [396, 96], [496, 96]]) g.fillRect(px, py, 5, 5);
    g.fillStyle = hexCss(S[1]); for (let i = 0; i < 5; i++) g.fillRect(404, 40 + i * 12, 60 + ((i * 37) % 30), 4);
  }
  // text strips: 2 columns x 8 rows of 256 x 48 under the emblems
  const texts = [f === 'soviet' ? 'СССР' : f === 'prc' ? '中国' : 'MERIDIAN', NAME_LOCAL[name] ?? (name || 'BASE 1'), ...SERIALS[f]];
  const rects: Rect[] = [];
  const cjk = f === 'prc';
  const col = hexCss(L.stencil);
  for (let i = 0; i < 16; i++) {
    const cx = (i % 2) * 512, cy = 128 + Math.floor(i / 2) * 48;
    const s = texts[i % texts.length];
    if (i === 0 && f !== 'expedition') stencil(g, s, cx, cy, 256, 48, red, cjk, 7 + i);
    else stencil(g, s, cx, cy, 256, 48, col, cjk && /[一-鿿]/.test(s), 7 + i);
    // the same text in pale stencil for dark hulls (second half of each row)
    stencil(g, s, cx + 256, cy, 256, 48, i === 0 && f !== 'expedition' ? red : pale, cjk && /[一-鿿]/.test(s), 31 + i);
    rects.push([cx / W, 1 - (cy + 48) / H, (cx + 256) / W, 1 - cy / H]);
  }
  for (let i = 0; i < 16; i++) { const r = rects[i]; rects.push([r[0] + 256 / W, r[1], r[2] + 256 / W, r[3]]); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true;
  const sq = (x: number): Rect => [x / W, 1 - 128 / H, (x + 128) / W, 1];
  const a: Atlas = { tex, star: sq(0), roundel: sq(128), hazard: sq(256), plate: sq(384), text: rects };
  ATLAS.set(key, a);
  return a;
}
/** text strip i (0 nation, 1 base name, 2.. serials), dark ink or pale ink */
export const textRect = (a: Atlas, i: number, pale = false) => a.text[(i % 16) + (pale ? 16 : 0)];

// ------------------------------------------------------------------------------------------------ materials
const DECAL = new Map<string, THREE.Material>();
export function decalMat(f: FactionId, name = ''): THREE.Material {
  const key = f + ':' + name;
  let m = DECAL.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: atlas(f, name).tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    gbuf(m, 1);
    DECAL.set(key, m);
  }
  return m;
}
let LAMP: THREE.Material | null = null;
export function lampMat() { return (LAMP ??= gbuf(new THREE.MeshBasicMaterial({ vertexColors: true }), 32)); }
/** a structure's own body material (it flashes when hit and chars when wrecked) */
export function bodyMat(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  gbuf(m, 1);
  return m;
}
const SHARED = new Map<string, THREE.MeshLambertMaterial>();
export function sharedBody(key: string) { let m = SHARED.get(key); if (!m) SHARED.set(key, (m = bodyMat())); return m; }

// ------------------------------------------------------------------------------------------------ the kit
export type V3 = [number, number, number];
export interface KitGeo { body: THREE.BufferGeometry; decal: THREE.BufferGeometry | null; lamp: THREE.BufferGeometry | null }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _n3 = new THREE.Matrix3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** bakes primitives into one flat-shaded vertex-coloured mesh (+ decals on the faction atlas, + self-lit lamps) */
export class Kit {
  private b = { p: [] as number[], n: [] as number[], c: [] as number[] };
  private l = { p: [] as number[], n: [] as number[], c: [] as number[] };
  private d = { p: [] as number[], n: [] as number[], u: [] as number[] };
  /** add any geometry, coloured, placed */
  add(geo: THREE.BufferGeometry, color: number, at: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], lamp = false, q?: THREE.Quaternion) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (q) _q.copy(q); else _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'XYZ'));
    _m.compose(_p.set(at[0], at[1], at[2]), _q, _s.set(scale[0], scale[1], scale[2]));
    _n3.getNormalMatrix(_m);
    const P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute;
    const out = lamp ? this.l : this.b;
    _c.setHex(color);
    for (let i = 0; i < P.count; i++) {
      _a.fromBufferAttribute(P, i).applyMatrix4(_m); out.p.push(_a.x, _a.y, _a.z);
      _b.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); out.n.push(_b.x, _b.y, _b.z);
      out.c.push(_c.r, _c.g, _c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }
  box(w: number, h: number, d: number, at: V3, color: number, rot?: V3) { return this.add(new THREE.BoxGeometry(w, h, d), color, at, rot); }
  cyl(rt: number, rb: number, h: number, at: V3, color: number, seg = 12, rot?: V3) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1), color, at, rot); }
  ball(r: number, at: V3, color: number, seg = 10, half = false, rot?: V3) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.6)), 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI), color, at, rot); }
  cone(r: number, h: number, at: V3, color: number, seg = 12, rot?: V3) { return this.add(new THREE.ConeGeometry(r, h, seg, 1), color, at, rot); }
  torus(R: number, r: number, at: V3, color: number, rot: V3 = [Math.PI / 2, 0, 0], seg = 16) { return this.add(new THREE.TorusGeometry(R, r, 4, seg), color, at, rot); }
  lamp(r: number, at: V3, color: number) { return this.add(new THREE.SphereGeometry(r, 6, 4), color, at, [0, 0, 0], [1, 1, 1], true); }
  lampBox(w: number, h: number, d: number, at: V3, color: number, rot?: V3) { return this.add(new THREE.BoxGeometry(w, h, d), color, at, rot ?? [0, 0, 0], [1, 1, 1], true); }
  /** a strut between two points */
  rod(a: V3, b: V3, r: number, color: number, seg = 6) {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
    const len = _a.distanceTo(_b); if (len < 1e-4) return this;
    const q = new THREE.Quaternion().setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    return this.add(new THREE.CylinderGeometry(r, r, len, seg, 1), color, mid, undefined, undefined, false, q);
  }
  /** a ring of rivet heads round a vertical cylinder of radius R at height y */
  rivetRing(cx: number, y: number, cz: number, R: number, n: number, color: number, s = 0.045) {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.box(s, s, s * 0.6, [cx + Math.cos(a) * R, y, cz + Math.sin(a) * R], color, [0, -a + Math.PI / 2, 0]); }
    return this;
  }
  /** rivets on the flat faces of a seg-sided cylinder (three.js puts vertex k at angle rot + k*2pi/seg, x = sin) */
  rivetPoly(cx: number, y: number, cz: number, R: number, seg: number, per: number, color: number, rot = 0, s = 0.045) {
    for (let k = 0; k < seg; k++) {
      const a0 = rot + (k / seg) * Math.PI * 2, a1 = rot + ((k + 1) / seg) * Math.PI * 2;
      for (let i = 0; i < per; i++) {
        const t = (i + 0.5) / per, x = Math.sin(a0) * R * (1 - t) + Math.sin(a1) * R * t, z = Math.cos(a0) * R * (1 - t) + Math.cos(a1) * R * t;
        this.box(s, s, s * 0.6, [cx + x, y, cz + z], color, [0, (a0 + a1) / 2, 0]);
      }
    }
    return this;
  }
  /** a decal on face i of a seg-sided cylinder rotated by rot (face centre at angle rot + (i + 0.5) * 2pi/seg) */
  faceDecal(r: Rect, w: number, h: number, R: number, seg: number, i: number, y: number, rot = 0, rx = 0, cx = 0, cz = 0) {
    const a = rot + ((i + 0.5) / seg) * Math.PI * 2, ap = R * Math.cos(Math.PI / seg) + 0.014;
    return this.decal(r, w, h, [cx + Math.sin(a) * ap, y, cz + Math.cos(a) * ap], a, rx);
  }
  /** a row of rivets from a to b */
  rivetRow(a: V3, b: V3, n: number, color: number, s = 0.045) {
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); this.box(s, s, s, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], color); }
    return this;
  }
  /** a decal quad (w x h) from the atlas rect, centred at `at`, facing out along yaw ry (0 = +Z), tilted by rx */
  decal(r: Rect, w: number, h: number, at: V3, ry: number, rx = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    const U = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < U.count; i++) U.setXY(i, r[0] + U.getX(i) * (r[2] - r[0]), r[1] + U.getY(i) * (r[3] - r[1]));
    const ng = g.toNonIndexed(); g.dispose();
    _q.setFromEuler(_e.set(rx, ry, 0, 'YXZ'));
    _m.compose(_p.set(at[0], at[1], at[2]), _q, _s.set(1, 1, 1));
    _n3.getNormalMatrix(_m);
    const P = ng.attributes.position as THREE.BufferAttribute, N = ng.attributes.normal as THREE.BufferAttribute, UV = ng.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      _a.fromBufferAttribute(P, i).applyMatrix4(_m); this.d.p.push(_a.x, _a.y, _a.z);
      _b.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); this.d.n.push(_b.x, _b.y, _b.z);
      this.d.u.push(UV.getX(i), UV.getY(i));
    }
    ng.dispose();
    return this;
  }
  build(): KitGeo {
    const mk = (p: number[], n: number[], c?: number[], u?: number[]) => {
      if (!p.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
      if (c) g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      if (u) g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    };
    return { body: mk(this.b.p, this.b.n, this.b.c)!, decal: mk(this.d.p, this.d.n, undefined, this.d.u), lamp: mk(this.l.p, this.l.n, this.l.c) };
  }
}

/** a mesh group from a built kit: body (own or shared material), decals, lamps */
export function kitMesh(k: KitGeo, f: FactionId, name: string, body: THREE.Material): THREE.Group {
  const grp = new THREE.Group();
  const bm = new THREE.Mesh(k.body, body); bm.castShadow = true; bm.receiveShadow = true; grp.add(bm);
  if (k.decal) { const dm = new THREE.Mesh(k.decal, decalMat(f, name)); dm.receiveShadow = true; grp.add(dm); }
  if (k.lamp) grp.add(new THREE.Mesh(k.lamp, lampMat()));
  return grp;
}

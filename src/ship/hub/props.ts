// The ship's furniture, modelled in code at real sizes (metres): consoles and chairs, bunks and lockers, the mess
// table and galley, med beds and the scanner arch, lab benches and specimen tanks, the reactor, server racks and
// the AI core, crates and racks, the pod and its cradle, pipes, cables, screens, posters and the small things
// that make a room lived in. Static parts go into the room's Batch (merged per material); moving or glowing parts
// are separate meshes registered with the room's animators.
import * as THREE from 'three';
import { Batch, Mats, Bin, box, cyl, tube, lathe, extrude, quad, V3, type V } from './kit';
import { posterTex, labelTex, type PosterKind, type Theme } from './tex';
import { limbo, pixHazard, pixConsole } from './pix';
import type { Screens, ScreenKind } from './screens';

export interface Anim { (dt: number, t: number): void }
export interface Ctx {
  B: Batch; M: Mats; bin: Bin; S: Screens; th: Theme;
  /** the room's root (dynamic meshes go here) */
  root: THREE.Object3D;
  anims: Anim[];
  /** lamps that should glow (emissive, bloom) and their light sources */
  lights: THREE.Light[];
  /** named parts the hub drives (the main monitor, the pod, the breach wall, the core) */
  refs: Record<string, any>;
}

// ------------------------------------------------------------------ the shared palette of materials
/** LIMBOPHOBIA's own material textures (pixel art, 32 texels per metre) with a tint per material key */
const LMAT: Record<string, [string, number, { transparent?: boolean; opacity?: number; side?: THREE.Side }?]> = {
  white: ['plastic_white', 0xffffff], cream: ['plastic_beige', 0xffffff], grey: ['metal_grey', 0xffffff], dark: ['metal_dark', 0xffffff],
  black: ['plastic_black', 0xffffff], steel: ['metal_brushed', 0xffffff], chrome: ['chrome', 0xffffff], gun: ['metal_dark', 0xb4bcc2],
  olive: ['metal_painted_green', 0xffffff], orange: ['plastic_yellow', 0xf09060], yellow: ['plastic_yellow', 0xffffff], red: ['plastic_red', 0xffffff],
  teal: ['metal_painted_green', 0x9ad0d0], blue: ['plastic_blue', 0xffffff], rubber: ['rubber_black', 0xffffff], plastic: ['plastic_black', 0xffffff],
  plasticW: ['plastic_white', 0xffffff], wood: ['wood_light', 0xffffff], woodD: ['wood_dark', 0xffffff], leather: ['leather_brown', 0xffffff],
  seat: ['fabric_blue', 0xffffff], seatR: ['fabric_red', 0xffffff], mattress: ['mattress', 0xffffff], sheet: ['towel', 0xffffff], pillow: ['pillow', 0xffffff],
  glass: ['glass', 0xffffff, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }], cable: ['rubber_black', 0xffffff], cableR: ['plastic_red', 0xffffff],
  cableY: ['plastic_yellow', 0xffffff], cableB: ['plastic_blue', 0xffffff], copper: ['metal_brass', 0xe8a070], brass: ['metal_brass', 0xffffff],
  pipe: ['metal_sheet', 0xffffff], pipeR: ['plastic_red', 0xd8a0a0], pipeB: ['plastic_blue', 0xc0c8e0], pipeG: ['metal_painted_green', 0xffffff], pipeY: ['plastic_yellow', 0xe0d0a0],
  soil: ['bark', 0x9a7a60], leaf: ['leaves', 0xffffff, { side: THREE.DoubleSide }], leafD: ['leaves', 0x8aa080, { side: THREE.DoubleSide }], ceramic: ['porcelain', 0xffffff],
  terracotta: ['concrete', 0xd88a5a], rust: ['metal_rusty', 0xffffff], paper: ['paper', 0xffffff], cardboard: ['cardboard', 0xffffff], carpet: ['carpet_rug', 0xffffff],
};
export function mat(c: Ctx, k: string): THREE.Material {
  if (k === 'haz') return c.M.get('haz', { map: pixHazard() });
  const d = LMAT[k];
  if (!d) return c.M.get(k, { color: 0xff00ff });
  const L = limbo(d[0]);
  L.tex.repeat.set(1 / L.mw, 1 / L.mh);
  return c.M.get('L|' + k, { map: L.tex, color: d[1], transparent: d[2]?.transparent, opacity: d[2]?.opacity, side: d[2]?.side, flag: d[2]?.transparent ? 0 : 1 });
}
export const glow = (c: Ctx, color: number, k = 1.8) => c.M.glow('c' + color.toString(16) + '|' + k, color, k);

// ------------------------------------------------------------------ small helpers
const P = Math.PI;
let scrN = 0;
export function screenPanel(c: Ctx, kind: ScreenKind, w: number, h: number, at: { x: number; y: number; z: number; ry?: number; rx?: number }, seed = 1, tint?: number, bezel = 0.04) {
  const tex = c.S.make(kind, Math.round(256 * Math.min(2, Math.max(0.6, w / h * 0.62))), 160, seed, tint);
  const m = c.M.glow('scr|' + (scrN++), 0xffffff, 1.15, tex);
  const g = new THREE.Group(); g.position.set(at.x, at.y, at.z); g.rotation.set(at.rx ?? 0, at.ry ?? 0, 0, 'YXZ');
  const s = new THREE.Mesh(c.bin.g(quad(w, h)), m); s.position.z = 0.012; g.add(s);
  c.root.add(g);
  // the bezel goes in the batch, in the same frame
  g.updateMatrix();
  c.B.push(g.matrix); c.B.add(box(w + bezel * 2, h + bezel * 2, 0.04, 0.01), mat(c, 'black'), { z: -0.01 }); c.B.pop();
  return g;
}
export function poster(c: Ctx, kind: PosterKind, w: number, at: { x: number; y: number; z: number; ry?: number; rz?: number }, seed = 1) {
  const t = posterTex(kind, seed), a = (t as any).aspect ?? 0.73;
  const m = c.M.get('poster|' + kind + seed, { map: t, rough: 0.85, polyOffset: 1, flag: 0 });
  c.B.add(quad(w, w / a), m, { x: at.x, y: at.y, z: at.z, ry: at.ry ?? 0, rz: at.rz ?? 0 });
}
export function sign(c: Ctx, text: string, w: number, at: { x: number; y: number; z: number; ry?: number }, o: { fg?: number; bg?: number; size?: number; font?: string; border?: number; glow?: boolean } = {}) {
  const t = labelTex(text, { size: o.size ?? 64, fg: o.fg ?? 0xe8e4d4, bg: o.bg, border: o.border, font: o.font });
  const a = (t as any).aspect ?? 4;
  const m = o.glow ? c.M.glow('sg|' + text + (o.fg ?? 0), 0xffffff, 1.3, t, { transparent: o.bg === undefined }) : c.M.get('sign|' + text + JSON.stringify(o), { map: t, rough: 0.7, transparent: o.bg === undefined, polyOffset: 1, flag: 0 });
  c.B.add(quad(w, w / a), m, { x: at.x, y: at.y, z: at.z, ry: at.ry ?? 0 });
}

// ------------------------------------------------------------------ seating
/** a swivel office chair, facing +z (seat at 0.47 m) */
export function chair(c: Ctx, o: { x: number; z: number; ry?: number; seat?: string; tall?: boolean }) {
  const B = c.B;
  B.in({ x: o.x, z: o.z, ry: o.ry ?? 0 }, () => {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * P * 2; B.add(box(0.05, 0.04, 0.32, 0.01), mat(c, 'gun'), { x: Math.sin(a) * 0.15, y: 0.07, z: Math.cos(a) * 0.15, ry: a }); B.add(cyl(0.03, 0.03, 0.04, 8), mat(c, 'rubber'), { x: Math.sin(a) * 0.3, y: 0.03, z: Math.cos(a) * 0.3, rz: P / 2 }); }
    B.add(cyl(0.035, 0.035, 0.34, 10), mat(c, 'chrome'), { y: 0.25 });
    B.add(box(0.5, 0.09, 0.48, 0.035), mat(c, o.seat ?? 'seat'), { y: 0.45 });
    B.add(box(0.46, o.tall ? 0.72 : 0.5, 0.08, 0.035), mat(c, o.seat ?? 'seat'), { y: o.tall ? 0.88 : 0.78, z: -0.24, rx: -0.1 });
    B.add(box(0.06, 0.3, 0.04), mat(c, 'gun'), { y: 0.56, z: -0.24 });
    for (const s of [-1, 1]) { B.add(box(0.05, 0.03, 0.3, 0.01), mat(c, 'plastic'), { x: s * 0.27, y: 0.66, z: 0.0 }); B.add(box(0.03, 0.18, 0.03), mat(c, 'gun'), { x: s * 0.27, y: 0.56, z: -0.08 }); }
    if (o.tall) B.add(box(0.3, 0.16, 0.08, 0.03), mat(c, o.seat ?? 'seat'), { y: 1.32, z: -0.3 });
  });
}
export function stool(c: Ctx, x: number, z: number, h = 0.62) {
  c.B.add(cyl(0.18, 0.18, 0.05, 14), mat(c, 'seatR'), { x, y: h, z });
  c.B.add(cyl(0.025, 0.025, h, 8), mat(c, 'chrome'), { x, y: h / 2, z });
  c.B.add(cyl(0.2, 0.22, 0.03, 14), mat(c, 'gun'), { x, y: 0.015, z });
  c.B.add(new THREE.TorusGeometry(0.14, 0.012, 6, 16), mat(c, 'chrome'), { x, y: h * 0.45, z, rx: P / 2 });
}

// ------------------------------------------------------------------ consoles and screens
/** a control console (desk with an angled screen deck), facing +z, w wide; returns nothing (adds a live screen) */
export function console_(c: Ctx, o: { x: number; z: number; ry?: number; w?: number; screens?: ScreenKind[]; paint?: string; seed?: number; low?: boolean }) {
  const B = c.B, w = o.w ?? 1.4, paint = o.paint ?? 'dark';
  const g = new THREE.Group(); g.position.set(o.x, 0, o.z); g.rotation.y = o.ry ?? 0; c.root.add(g); g.updateMatrix();
  B.push(g.matrix);
  // the pedestal and kick recess
  B.add(box(w, 0.08, 0.55), mat(c, 'black'), { y: 0.04, z: -0.05 });
  B.add(box(w, 0.66, 0.62, 0.02), mat(c, paint), { y: 0.41, z: -0.06 });
  // the desk top with a rolled front lip and the angled deck
  B.add(box(w + 0.06, 0.05, 0.78, 0.015), mat(c, 'gun'), { y: 0.76, z: 0.02 });
  B.add(box(w, 0.04, 0.12, 0.02), mat(c, 'rubber'), { y: 0.77, z: 0.38 });
  B.add(box(w, 0.42, 0.06, 0.02), mat(c, paint), { y: 1.0, z: -0.3, rx: -0.42 });
  B.add(box(w + 0.02, 0.06, 0.32), mat(c, paint), { y: 1.2, z: -0.43 });
  // side cheeks with vents
  for (const s of [-1, 1]) { B.add(box(0.04, 0.95, 0.8, 0.012), mat(c, 'gun'), { x: s * (w / 2 + 0.02), y: 0.5, z: -0.04 }); for (let k = 0; k < 4; k++) B.add(box(0.045, 0.02, 0.3), mat(c, 'black'), { x: s * (w / 2 + 0.02), y: 0.3 + k * 0.06, z: 0.05 }); }
  // keyboard, a trackball, button banks with tiny lamps
  B.add(box(0.46, 0.025, 0.16, 0.008), mat(c, 'plastic'), { y: 0.8, z: 0.14 });
  for (let r = 0; r < 4; r++) for (let k = 0; k < 12; k++) B.add(box(0.028, 0.012, 0.028), mat(c, 'plasticW'), { x: -0.2 + k * 0.036, y: 0.815, z: 0.08 + r * 0.035 });
  B.add(new THREE.SphereGeometry(0.035, 10, 8), mat(c, 'red'), { x: 0.32, y: 0.8, z: 0.14 });
  const cols = [0x6ad08a, 0xe0a040, 0x6ad0d8, 0xe0503a];
  for (let k = 0; k < Math.floor(w / 0.12); k++) {
    const x = -w / 2 + 0.1 + k * 0.12;
    B.add(box(0.06, 0.02, 0.05), mat(c, 'plastic'), { x, y: 0.79, z: -0.12 });
    B.add(box(0.03, 0.012, 0.025), glow(c, cols[(k + (o.seed ?? 0)) % 4], 2.2), { x, y: 0.805, z: -0.12 });
  }
  B.pop();
  // the screens on the deck
  const kinds = o.screens ?? ['telemetry'];
  const sw = (w - 0.12) / kinds.length;
  kinds.forEach((k, i) => {
    const lx = -w / 2 + 0.06 + sw * (i + 0.5);
    const p = new V3(lx, 1.0, -0.27).applyMatrix4(g.matrix);
    screenPanel(c, k, sw - 0.06, 0.34, { x: p.x, y: p.y, z: p.z, ry: o.ry ?? 0, rx: -0.42 }, (o.seed ?? 1) + i, undefined, 0.02);
  });
  return g;
}

// ------------------------------------------------------------------ beds, bunks, lockers
/** a double bunk along z (head at -z), x centred; lower mattress top 0.56, upper 1.86 */
export function bunk(c: Ctx, o: { x: number; z: number; seed: number; flip?: boolean }) {
  const B = c.B, L = 2.05, W = 0.95, s = o.seed;
  B.in({ x: o.x, z: o.z, ry: o.flip ? P : 0 }, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(box(0.06, 2.4, 0.06, 0.01), mat(c, 'grey'), { x: sx * (W / 2), y: 1.2, z: sz * (L / 2) });
    for (const y of [0.4, 1.7]) {
      B.add(box(W + 0.04, 0.08, L, 0.01), mat(c, 'grey'), { y });
      B.add(box(W - 0.06, 0.14, L - 0.1, 0.05), mat(c, 'mattress'), { y: y + 0.11 });
      // a rumpled blanket over the lower two thirds, a pillow at the head
      const col = ['seatR', 'seat', 'leather', 'olive'][(s + (y > 1 ? 1 : 0)) % 4];
      B.add(box(W - 0.02, 0.06, L * 0.62, 0.03), mat(c, col === 'olive' ? 'olive' : col), { y: y + 0.2, z: L * 0.17, rx: 0.01 * ((s % 3) - 1) });
      B.add(box(W - 0.0, 0.1, 0.16, 0.04), mat(c, col === 'olive' ? 'olive' : col), { y: y + 0.21, z: -L * 0.13, rx: 0.4 });
      B.add(box(0.52, 0.1, 0.32, 0.05), mat(c, 'pillow'), { x: ((s % 3) - 1) * 0.06, y: y + 0.23, z: -L / 2 + 0.25, ry: ((s * 7) % 5 - 2) * 0.06 });
      // the end boards and the wall-side guard rail
      B.add(box(W, 0.3, 0.03), mat(c, 'grey'), { y: y + 0.2, z: -L / 2 });
      B.add(box(W, 0.18, 0.03), mat(c, 'grey'), { y: y + 0.14, z: L / 2 });
    }
    // upper guard rail on the room side, ladder at the foot
    B.add(box(0.03, 0.03, L * 0.7), mat(c, 'grey'), { x: -W / 2, y: 2.05, z: -L * 0.1 });
    for (let k = 0; k < 5; k++) B.add(box(0.36, 0.025, 0.025), mat(c, 'chrome'), { x: -W / 2 - 0.02, y: 0.6 + k * 0.28, z: L / 2 - 0.25, ry: P / 2 });
    B.add(box(0.025, 1.6, 0.025), mat(c, 'chrome'), { x: -W / 2 - 0.02, y: 1.2, z: L / 2 - 0.42 }); B.add(box(0.025, 1.6, 0.025), mat(c, 'chrome'), { x: -W / 2 - 0.02, y: 1.2, z: L / 2 - 0.08 });
    // a privacy curtain on the upper bunk, half drawn, on a rail
    B.add(box(0.02, 0.02, L), mat(c, 'chrome'), { x: -W / 2 - 0.06, y: 2.42, z: 0 });
    const cur = ['seat', 'olive', 'seatR', 'teal'][s % 4];
    for (let k = 0; k < 5; k++) B.add(box(0.04, 0.62, 0.11, 0.015), mat(c, cur), { x: -W / 2 - 0.06 + (k % 2) * 0.025, y: 2.1, z: L / 2 - 0.08 - k * 0.1 });
    // reading lamps (warm, glowing)
    for (const y of [0.98, 2.28]) { B.add(box(0.12, 0.06, 0.08, 0.015), mat(c, 'gun'), { x: W / 2 - 0.08, y, z: -L / 2 + 0.12 }); B.add(box(0.1, 0.012, 0.06), glow(c, 0xffd090, 2.4), { x: W / 2 - 0.08, y: y - 0.034, z: -L / 2 + 0.12 }); }
  });
}
/** a tall crew locker facing +z */
export function locker(c: Ctx, o: { x: number; z: number; ry?: number; n: number; paint?: string; open?: boolean }) {
  const B = c.B;
  B.in({ x: o.x, z: o.z, ry: o.ry ?? 0 }, () => {
    B.add(box(0.52, 1.95, 0.5, 0.015), mat(c, o.paint ?? 'grey'), { y: 0.975 });
    B.add(box(0.46, 1.86, 0.02), mat(c, o.paint ?? 'grey'), { y: 0.98, z: 0.255 });
    for (let k = 0; k < 6; k++) B.add(box(0.26, 0.012, 0.012), mat(c, 'black'), { y: 1.7 - k * 0.035, z: 0.268 });
    for (let k = 0; k < 6; k++) B.add(box(0.26, 0.012, 0.012), mat(c, 'black'), { y: 0.35 - k * 0.035, z: 0.268 });
    B.add(box(0.03, 0.14, 0.03, 0.01), mat(c, 'chrome'), { x: 0.17, y: 1.05, z: 0.275 });
    B.add(box(0.16, 0.05, 0.005), mat(c, 'cream'), { x: -0.08, y: 1.5, z: 0.267 });
  });
  sign(c, String(o.n).padStart(2, '0'), 0.11, { x: o.x + Math.sin(o.ry ?? 0) * 0.27 - Math.cos(o.ry ?? 0) * 0.08, y: 1.5, z: o.z + Math.cos(o.ry ?? 0) * 0.27 + Math.sin(o.ry ?? 0) * 0.08, ry: o.ry ?? 0 }, { fg: 0x2a2c2e, size: 48, font: "'Jersey', monospace" });
}
/** a medical bed facing +x from its head at (x, z) (head against the wall at +x) */
export function medBed(c: Ctx, o: { x: number; z: number; ry?: number }) {
  const B = c.B;
  B.in({ x: o.x, z: o.z, ry: o.ry ?? 0 }, () => {
    // frame along -x (length 2.1)
    B.add(box(0.12, 0.6, 0.5, 0.02), mat(c, 'grey'), { x: -1.05, y: 0.3 });
    B.add(box(2.0, 0.1, 0.9, 0.02), mat(c, 'white'), { x: -1.05, y: 0.62 });
    B.add(box(1.3, 0.12, 0.82, 0.05), mat(c, 'mattress'), { x: -1.4, y: 0.72 });
    B.add(box(0.75, 0.12, 0.82, 0.05), mat(c, 'mattress'), { x: -0.38, y: 0.86, rz: -0.45 });
    B.add(box(0.4, 0.1, 0.5, 0.04), mat(c, 'pillow'), { x: -0.22, y: 1.0, rz: -0.45 });
    B.add(box(1.2, 0.05, 0.86, 0.02), mat(c, 'sheet'), { x: -1.45, y: 0.8 });
    for (const s of [-1, 1]) { B.add(box(1.0, 0.04, 0.03), mat(c, 'chrome'), { x: -1.2, y: 0.98, z: s * 0.46 }); for (const xx of [-0.75, -1.65]) B.add(box(0.03, 0.22, 0.03), mat(c, 'chrome'), { x: xx, y: 0.86, z: s * 0.46 }); }
    for (const xx of [-0.2, -1.9]) for (const s of [-1, 1]) { B.add(cyl(0.05, 0.05, 0.05, 10), mat(c, 'rubber'), { x: xx, y: 0.05, z: s * 0.36, rx: P / 2 }); B.add(box(0.05, 0.5, 0.05), mat(c, 'grey'), { x: xx, y: 0.32, z: s * 0.36 }); }
    // the IV pole with a bag
    B.add(cyl(0.012, 0.012, 1.9, 6), mat(c, 'chrome'), { x: -0.3, y: 0.95, z: 0.62 });
    B.add(cyl(0.2, 0.2, 0.03, 10), mat(c, 'gun'), { x: -0.3, y: 0.03, z: 0.62 });
    B.add(box(0.12, 0.2, 0.04, 0.02), c.M.get('ivbag', { color: 0xc8e0e0, rough: 0.2, transparent: true, opacity: 0.7 }), { x: -0.3, y: 1.72, z: 0.62 });
  });
}

// ------------------------------------------------------------------ tables, galley, shelves
export function table(c: Ctx, o: { x: number; z: number; w: number; d: number; h?: number; ry?: number; top?: string; legs?: string }) {
  const B = c.B, h = o.h ?? 0.75;
  B.in({ x: o.x, z: o.z, ry: o.ry ?? 0 }, () => {
    B.add(box(o.w, 0.05, o.d, 0.015), mat(c, o.top ?? 'wood'), { y: h - 0.025 });
    B.add(box(o.w - 0.1, 0.06, o.d - 0.1), mat(c, 'gun'), { y: h - 0.08 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(box(0.05, h - 0.05, 0.05, 0.01), mat(c, o.legs ?? 'gun'), { x: sx * (o.w / 2 - 0.1), y: (h - 0.05) / 2, z: sz * (o.d / 2 - 0.1) });
  });
}
/** galley counter run along z at x (facing -x into the room), from z0 to z1 */
export function galley(c: Ctx, x: number, z0: number, z1: number) {
  const B = c.B, L = z1 - z0, zc = (z0 + z1) / 2;
  B.add(box(0.62, 0.86, L, 0.01), mat(c, 'cream'), { x, y: 0.43, z: zc });
  B.add(box(0.66, 0.04, L + 0.02, 0.01), mat(c, 'steel'), { x: x - 0.02, y: 0.88, z: zc });
  B.add(box(0.05, 0.1, L), mat(c, 'black'), { x: x - 0.29, y: 0.05, z: zc });
  // doors and handles
  for (let k = 0; k < Math.floor(L / 0.6); k++) {
    const z = z0 + 0.3 + k * 0.6;
    B.add(box(0.02, 0.66, 0.56), mat(c, 'cream'), { x: x - 0.32, y: 0.45, z });
    B.add(box(0.03, 0.02, 0.2), mat(c, 'chrome'), { x: x - 0.345, y: 0.72, z });
  }
  // a sink, a two-ring hob, splash-back and upper cabinets
  B.add(box(0.44, 0.03, 0.56), mat(c, 'chrome'), { x: x + 0.02, y: 0.895, z: z0 + 0.7 });
  B.add(box(0.36, 0.02, 0.44), mat(c, 'black'), { x: x + 0.02, y: 0.9, z: z0 + 0.7 });
  B.add(cyl(0.015, 0.015, 0.3, 6), mat(c, 'chrome'), { x: x + 0.22, y: 1.03, z: z0 + 0.7 }); B.add(box(0.2, 0.02, 0.02), mat(c, 'chrome'), { x: x + 0.13, y: 1.17, z: z0 + 0.7 });
  B.add(box(0.5, 0.025, 0.6), mat(c, 'black'), { x: x + 0.02, y: 0.9, z: z0 + 1.6 });
  for (const dz of [-0.14, 0.14]) B.add(new THREE.TorusGeometry(0.08, 0.008, 4, 16), glow(c, 0xe0502a, 1.4), { x: x + 0.02, y: 0.915, z: z0 + 1.6 + dz, rx: P / 2 });
  B.add(box(0.04, 0.6, L), mat(c, 'white'), { x: x + 0.31, y: 1.2, z: zc });
  B.add(box(0.38, 0.6, L, 0.01), mat(c, 'cream'), { x: x + 0.12, y: 1.95, z: zc });
  for (let k = 0; k < Math.floor(L / 0.6); k++) { const z = z0 + 0.3 + k * 0.6; B.add(box(0.02, 0.56, 0.56), mat(c, 'cream'), { x: x - 0.08, y: 1.95, z }); B.add(box(0.03, 0.12, 0.02), mat(c, 'chrome'), { x: x - 0.1, y: 1.75, z: z + 0.2 }); }
  // the extractor hood over the hob (with its lamp)
  B.add(box(0.5, 0.18, 0.7, 0.02), mat(c, 'steel'), { x: x + 0.05, y: 1.58, z: z0 + 1.6 });
  B.add(box(0.3, 0.01, 0.2), glow(c, 0xffe0b0, 2), { x: x + 0.05, y: 1.485, z: z0 + 1.6 });
}
export function fridge(c: Ctx, x: number, z: number, ry = -P / 2) {
  const B = c.B;
  B.in({ x, z, ry }, () => {
    B.add(box(0.7, 1.9, 0.68, 0.03), mat(c, 'white'), { y: 0.95 });
    B.add(box(0.68, 0.01, 0.02), mat(c, 'black'), { y: 1.25, z: 0.345 });
    for (const y of [0.9, 1.55]) B.add(box(0.03, 0.3, 0.04, 0.01), mat(c, 'chrome'), { x: 0.28, y, z: 0.36 });
    B.add(box(0.14, 0.05, 0.005), glow(c, 0x6ad0d8, 1.6), { x: -0.18, y: 1.6, z: 0.345 });
  });
}
/** a steel shelving unit (facing +z), filled by the caller */
export function shelving(c: Ctx, o: { x: number; z: number; ry?: number; w?: number; h?: number; d?: number; levels?: number; paint?: string }) {
  const B = c.B, w = o.w ?? 1.8, h = o.h ?? 2.2, d = o.d ?? 0.55, n = o.levels ?? 4;
  B.in({ x: o.x, z: o.z, ry: o.ry ?? 0 }, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(box(0.05, h, 0.05), mat(c, o.paint ?? 'yellow'), { x: sx * (w / 2 - 0.025), y: h / 2, z: sz * (d / 2 - 0.025) });
    for (let k = 0; k < n; k++) { const y = 0.12 + k * ((h - 0.2) / (n - 1)); B.add(box(w, 0.03, d), mat(c, 'gun'), { y }); B.add(box(w, 0.07, 0.03), mat(c, o.paint ?? 'yellow'), { y: y - 0.02, z: d / 2 - 0.015 }); }
    for (const s of [-1, 1]) B.add(box(0.015, h * 0.9, 0.015), mat(c, 'gun'), { x: s * (w / 2 - 0.025), y: h / 2, z: 0, rx: Math.atan2(d, h) * s * 0.0 });
  });
  return { levels: Array.from({ length: n }, (_, k) => 0.12 + k * ((h - 0.2) / (n - 1)) + 0.015) };
}

// ------------------------------------------------------------------ crates and cargo
export function crate(c: Ctx, o: { x: number; y?: number; z: number; w?: number; h?: number; d?: number; ry?: number; kind?: 'olive' | 'grey' | 'orange' | 'white' | 'blue'; label?: string }) {
  const B = c.B, w = o.w ?? 0.8, h = o.h ?? 0.6, d = o.d ?? 0.6, k = o.kind ?? 'olive';
  const paint = k === 'olive' ? 'olive' : k === 'grey' ? 'grey' : k === 'orange' ? 'orange' : k === 'blue' ? 'blue' : 'white';
  B.in({ x: o.x, y: o.y ?? 0, z: o.z, ry: o.ry ?? 0 }, () => {
    B.add(box(w, h, d, 0.02), mat(c, paint), { y: h / 2 });
    // corner caps and ribs
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(box(0.06, h + 0.01, 0.06, 0.008), mat(c, 'gun'), { x: sx * (w / 2 - 0.02), y: h / 2, z: sz * (d / 2 - 0.02) });
    B.add(box(w + 0.01, 0.04, d + 0.01), mat(c, 'gun'), { y: h - 0.03 });
    for (const sx of [-1, 1]) B.add(box(0.12, 0.04, 0.02), mat(c, 'black'), { x: sx * w * 0.25, y: h * 0.7, z: d / 2 + 0.005 });
  });
  if (o.label) {
    const ry = o.ry ?? 0, nx = Math.sin(ry), nz = Math.cos(ry);
    sign(c, o.label, Math.min(w * 0.7, 0.5), { x: o.x + nx * (d / 2 + 0.008), y: (o.y ?? 0) + h * 0.42, z: o.z + nz * (d / 2 + 0.008), ry }, { fg: k === 'white' ? 0x2a2c2e : 0xe8e2cc, size: 40 });
  }
}
export function barrel(c: Ctx, x: number, z: number, paint = 'blue', y = 0) {
  const B = c.B;
  B.add(cyl(0.29, 0.29, 0.88, 18), mat(c, paint), { x, y: y + 0.44, z });
  for (const yy of [0.22, 0.66]) B.add(new THREE.TorusGeometry(0.295, 0.015, 4, 18), mat(c, paint), { x, y: y + yy, z, rx: P / 2 });
  B.add(cyl(0.05, 0.05, 0.02, 8), mat(c, 'gun'), { x: x + 0.15, y: y + 0.885, z });
}

// ------------------------------------------------------------------ pipes, cables, lamps
export function pipeRun(c: Ctx, pts: V[], r: number, paint = 'pipe', clamps = 0.9) {
  c.B.add(tube(pts, r, 8, false), mat(c, paint));
  // clamps and flanges at every bend and every ~clamps metres
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = a.distanceTo(b), dir = b.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir), e = new THREE.Euler().setFromQuaternion(q);
    for (let s = clamps; s < L - 0.1; s += clamps) { const p = a.clone().addScaledVector(dir, s); c.B.add(cyl(r * 1.35, r * 1.35, 0.05, 10), mat(c, 'gun'), { x: p.x, y: p.y, z: p.z, rx: e.x, ry: e.y, rz: e.z }); }
  }
}
export function cable(c: Ctx, pts: V[], r = 0.025, color = 'cable') { c.B.add(tube(pts, r, 6, true), mat(c, color)); }
/** a wall lamp (light bar with a cage) on a wall facing dir (ry), glowing */
export function wallLamp(c: Ctx, x: number, y: number, z: number, ry: number, col = 0xffe2b0, w = 0.6) {
  c.B.in({ x, y, z, ry }, () => {
    c.B.add(box(w, 0.1, 0.1, 0.02), mat(c, 'gun'), { z: 0.05 });
    c.B.add(box(w - 0.08, 0.04, 0.02), glow(c, col, 2.6), { y: -0.02, z: 0.1 });
    for (let k = 0; k < 4; k++) c.B.add(box(0.012, 0.012, 0.1), mat(c, 'gun'), { x: -w / 2 + 0.08 + k * ((w - 0.16) / 3), y: -0.06, z: 0.12 });
  });
}

// ------------------------------------------------------------------ plants (a few hand-shaped leaves on stems in a pot)
export function plant(c: Ctx, x: number, y: number, z: number, s = 1, seed = 1, pot = 'terracotta') {
  const B = c.B;
  B.in({ x, y, z, s }, () => {
    B.add(lathe([[0.0, 0], [0.12, 0], [0.15, 0.24], [0.16, 0.26], [0.0, 0.26]], 12), mat(c, pot));
    B.add(cyl(0.14, 0.14, 0.02, 12), mat(c, 'soil'), { y: 0.25 });
    const n = 7 + (seed % 4);
    for (let i = 0; i < n; i++) {
      const a = i * 2.39 + seed, tilt = 0.5 + ((i * 37 + seed * 11) % 10) / 20, len = 0.28 + ((i * 13 + seed) % 7) * 0.03;
      const leaf = extrude([[0, 0], [0.05, len * 0.3], [0.04, len * 0.7], [0, len], [-0.04, len * 0.7], [-0.05, len * 0.3]], 0.005);
      B.add(leaf, mat(c, i % 3 ? 'leaf' : 'leafD'), { y: 0.26, ry: a, rx: tilt });
    }
  });
}

// ------------------------------------------------------------------ small clutter
export function mug(c: Ctx, x: number, y: number, z: number, paint = 'white', ry = 0) {
  c.B.in({ x, y, z, ry }, () => {
    c.B.add(lathe([[0.0, 0], [0.04, 0], [0.042, 0.095], [0.036, 0.095], [0.034, 0.012], [0, 0.012]], 12), mat(c, paint));
    c.B.add(new THREE.TorusGeometry(0.025, 0.007, 4, 8, P), mat(c, paint), { x: 0.045, y: 0.05, rz: -P / 2 });
    c.B.add(cyl(0.034, 0.034, 0.005, 10), c.M.get('coffee', { color: 0x2a160c, rough: 0.2 }), { y: 0.08 });
  });
}
export function books(c: Ctx, x: number, y: number, z: number, n: number, ry = 0, seed = 1) {
  const cols = ['red', 'blue', 'olive', 'cream', 'teal', 'dark', 'orange'];
  let off = 0;
  c.B.in({ x, y, z, ry }, () => {
    for (let i = 0; i < n; i++) {
      const w = 0.03 + ((i * 7 + seed) % 4) * 0.008, h = 0.18 + ((i * 5 + seed) % 5) * 0.025, lean = i === n - 1 ? 0.25 : 0;
      c.B.add(box(w, h, 0.15, 0.004), mat(c, cols[(i + seed) % cols.length]), { x: off + w / 2, y: h / 2, rz: -lean });
      off += w + 0.004;
    }
  });
}
export function toolbox(c: Ctx, x: number, y: number, z: number, ry = 0, paint = 'red') {
  c.B.in({ x, y, z, ry }, () => {
    c.B.add(box(0.5, 0.22, 0.24, 0.015), mat(c, paint), { y: 0.11 });
    c.B.add(box(0.3, 0.03, 0.03), mat(c, 'black'), { y: 0.27 }); for (const s of [-1, 1]) c.B.add(box(0.03, 0.05, 0.03), mat(c, 'black'), { x: s * 0.14, y: 0.245 });
  });
}
/** a fire extinguisher on its wall bracket */
export function extinguisher(c: Ctx, x: number, z: number, ry: number) {
  c.B.in({ x, z, ry }, () => {
    c.B.add(cyl(0.08, 0.08, 0.5, 12), mat(c, 'red'), { y: 0.9 });
    c.B.add(lathe([[0.08, 0], [0.06, 0.05], [0.025, 0.07], [0, 0.07]], 10), mat(c, 'red'), { y: 1.15 });
    c.B.add(box(0.06, 0.08, 0.06), mat(c, 'black'), { y: 1.23 });
    c.B.add(box(0.2, 0.3, 0.02), mat(c, 'gun'), { y: 0.9, z: -0.1 });
  });
  sign(c, 'FIRE', 0.22, { x: x - Math.sin(ry) * 0.1, y: 1.5, z: z - Math.cos(ry) * 0.1 + 0.0, ry }, { bg: 0xb8382e, fg: 0xf0e8e0, size: 44 });
}
export { P as PI };

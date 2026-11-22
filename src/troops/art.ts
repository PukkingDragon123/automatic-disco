// TROOPS · ART. The pixel glyphs (orders, formations, needs, gear), lit by the kit's sprite shader; the PHYSICAL ORDER
// KEYS (a machined keycap in its well, the order's glyph raised on it in relief: a 3D model the kit renders with its
// toon light and black outline, pressed in 3D); the PORTRAITS (a clone of the unit's own live model, posed as it
// stands, lit by a small key + fill rig fixed to the view, outlined by the kit's ModelView); and the unit materials
// for the cards (the kit's plates over the MATERIAL LIBRARY).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Px, P, INK, stamp, shadeSprite, upscaleRows, mixHex, type Ramp } from '../ui/kit/px';
import { toon, fitRoot, type ModelView } from '../ui/kit/model3d';
import { tex } from '../ui/kit/tex3d';
import type { Troop } from './units';

// ------------------------------------------------------------------ glyphs (# body, + accent, - dark detail)
export const GLYPHS: Record<string, string[]> = {
  move: ['...........', '.#....#....', '.##...##...', '..##...##..', '...##...##.', '....##...##', '...##...##.', '..##...##..', '.##...##...', '.#....#....', '...........'],
  attack: ['.....#.....', '...#####...', '..#..#..#..', '.#...#...#.', '.#.......#.', '####.+.####', '.#.......#.', '.#...#...#.', '..#..#..#..', '...#####...', '.....#.....'],
  stop: ['...#####...', '..#######..', '.#########.', '###########', '###########', '#+++++++++#', '###########', '###########', '.#########.', '..#######..', '...#####...'],
  hold: ['.#########.', '.#########.', '.####+####.', '.####+####.', '.##+++++##.', '.####+####.', '..###+###..', '..#######..', '...#####...', '....###....', '.....#.....'],
  patrol: ['...#.......', '..##.......', '.#########.', '..##.......', '...#.......', '...........', '.......#...', '.......##..', '.#########.', '.......##..', '.......#...'],
  gather: ['...#####...', '.###...###.', '##...#...##', '#....#....#', '.....#.....', '.....#.....', '.....#.....', '.....#.....', '.....#.....', '....###....', '...........'],
  build: ['.########..', '.#########.', '.########..', '....##.....', '....##.....', '....##.....', '....##.....', '....##.....', '....##.....', '...####....', '...........'],
  repair: ['.##.....##.', '.##.....##.', '.###...###.', '..#######..', '...#####...', '....###....', '....###....', '....###....', '...#####...', '...#####...', '....###....'],
  follow: ['.##........', '####.......', '####.......', '.##....##..', '......####.', '......####.', '.##....##..', '####.......', '####.......', '.##........', '...........'],
  guard: ['..#........', '..########.', '..#++++++#.', '..#++++++#.', '..########.', '..#........', '..#........', '..#........', '..#........', '.###.......', '...........'],
  line: ['...........', '...........', '...........', '...........', '##.##.##.##', '##.##.##.##', '...........', '...........', '...........', '...........', '...........'],
  wedge: ['....##.....', '....##.....', '...........', '..##..##...', '..##..##...', '...........', '##......##.', '##......##.', '...........', '...........', '...........'],
  column: ['...##.##...', '...##.##...', '...........', '...##.##...', '...##.##...', '...........', '...##.##...', '...##.##...', '...........', '...##.##...', '...##.##...'],
  heart: ['.##...##.', '####.####', '#########', '####+####', '#########', '.#######.', '..#####..', '...###...', '....#....'],
  morale: ['....#....', '...###...', '..#####..', '#########', '.#######.', '..#####..', '.###.###.', '.##...##.', '.#.....#.'],
  food: ['..#####..', '.#+++++#.', '.#######.', '.#-----#.', '.#######.', '.#-----#.', '.#######.', '.#+++++#.', '..#####..'],
  rest: ['...####..', '..####...', '.####....', '.####....', '.####....', '.#####...', '..######.', '...####..', '.........'],
  maint: ['##.....##', '##.....##', '.#######.', '..#####..', '...###...', '...###...', '...###...', '..#####..', '...###...'],
  battery: ['...###...', '.#######.', '.#+++++#.', '.#+++++#.', '.#######.', '.#-----#.', '.#######.', '.#-----#.', '.#######.'],
  suit: ['..#####..', '.#######.', '##+++++##', '##+++++##', '##+++++##', '#########', '.#######.', '##.....##', '##.....##'],
  gun: ['.........', '.........', '########.', '#########', '###-.....', '##.......', '##.......', '.........', '.........'],
  shell: ['...#.....', '..###....', '..###....', '.#####...', '.#+++#...', '.#####...', '.#####...', '.#####...', '.#####...'],
  mortar: ['......##.', '.....###.', '....###..', '...###...', '..###....', '.###.....', '#####....', '#####....', '.........'],
  rocket: ['....#....', '...###...', '...###...', '...#+#...', '...###...', '...###...', '..#####..', '.##.#.##.', '....#....'],
  claw: ['#...#...#', '#...#...#', '##..#..##', '.##.#.##.', '.#######.', '..#####..', '...###...', '...###...', '...###...'],
  flame: ['....#....', '...##....', '...###...', '..####.#.', '.######..', '.##++###.', '.#++++##.', '..####...', '.........'],
  beam: ['.........', '.........', '###......', '#######+.', '###......', '.........', '.........', '.........', '.........'],
  cloud: ['.........', '...###...', '.#######.', '#########', '#########', '.#######.', '.........', '.........', '.........'],
  range: ['.........', '#.......#', '##.....##', '#########', '##.....##', '#.......#', '.........', '.........', '.........'],
  armour: ['#########', '#########', '##+++++##', '##+###+##', '##+###+##', '.#+###+#.', '..#+++#..', '...###...', '....#....'],
  speed: ['.........', '..######.', '.........', '.########', '.........', '...#####.', '.........', '.........', '.........'],
  scan: ['...###...', '..#...#..', '.#..#..#.', '#..#.#..#', '#.#.+.#.#', '#..#.#..#', '.#..#..#.', '..#...#..', '...###...'],
  hook: ['....#....', '....#....', '....#....', '...###...', '....#....', '..#.#....', '.#..#....', '.#..#....', '..##.....'],
  wrench: ['##.....##', '##.....##', '.#######.', '..#####..', '...###...', '...###...', '...###...', '..#####..', '...###...'],
  part: ['..#####..', '.##+++##.', '##+###+##', '#+#####+#', '#+##-##+#', '#+#####+#', '##+###+##', '.##+++##.', '..#####..'],
  o2: ['...###...', '..#...#..', '.#.....#.', '.#.###.#.', '.#.#.#.#.', '.#.###.#.', '.#.....#.', '..#...#..', '...###...'],
  hunger: ['.#.#.#...', '.#.#.#...', '.#####...', '..###....', '...#.....', '...#.....', '...#.....', '...#.....', '..###....'],
  hit: ['#.......#', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '#.......#'],
  aggressive: ['#.......#', '##.....##', '.##...##.', '..##.##..', '...###...', '..##.##..', '.##...##.', '##.....##', '#.......#'],
  defensive: ['#########', '#########', '##+++++##', '##+++++##', '##+++++##', '.#+++++#.', '..#+++#..', '...###...', '....#....'],
  passive: ['...###...', '..#####..', '.##...##.', '##.....##', '#...+...#', '##.....##', '.##...##.', '..#####..', '...###...'],
  area: ['...###...', '..#####..', '.##+++##.', '.##+++##.', '..#####..', '...###...', '...###...', '....#....', '....#....'],
  plus: ['...###...', '...###...', '...###...', '#########', '#########', '#########', '...###...', '...###...', '...###...'],
  troops: ['..#####..', '.#######.', '#########', '#########', '.#######.', '.##...##.', '.#.....#.', '.........', '.........'],
};
/** how a glyph is coloured: [body, accent, dark] */
export const GPAL: Record<string, [number, number, number]> = {
  cream: [P.bone[5], P.ruby[4], P.bone[2]], amber: [P.glowAmber[3], 0xffffff, P.glowAmber[1]], red: [P.ruby[4], P.bone[6], P.ruby[2]],
  green: [P.malachite[4], P.bone[6], P.malachite[2]], blue: [P.sapphire[4], P.bone[6], P.sapphire[2]], brass: [P.brass[4], P.ruby[4], P.brass[2]],
  steel: [P.steel[5], P.glowAmber[3], P.steel[2]], dim: [P.steel[3], P.steel[4], P.steel[1]], teal: [P.glowTeal[3], 0xffffff, P.glowTeal[1]],
};
const gcache = new Map<string, Px>();
/** a glyph as lit pixel art (scale 1: 11 art px; up 2 grows it with EPX) */
export function glyph(name: string, pal: keyof typeof GPAL | [number, number, number] = 'cream', up = 1): Px {
  const key = name + '|' + String(pal) + '|' + up;
  const hit = gcache.get(key); if (hit) return hit;
  const rows0 = GLYPHS[name] ?? GLYPHS[name.split(':')[0]] ?? GLYPHS.part, rows = up > 1 ? upscaleRows(rows0, up) : rows0;
  const [b, a, d] = Array.isArray(pal) ? pal : GPAL[pal];
  const W = Math.max(...rows.map((r) => r.length)), p = new Px(W + 2, rows.length + 2);
  stamp(p, rows, { '#': b, '+': a, '-': d }, 1, 1);
  shadeSprite(p, { bevel: up > 1 ? 2 : 1, light: 1 });
  gcache.set(key, p);
  return p;
}
/** a glyph canvas at whole-pixel scale */
export function glyphCanvas(name: string, pal: keyof typeof GPAL | [number, number, number] = 'cream', scale = 2, up = 1): HTMLCanvasElement {
  const cv = glyph(name, pal, up).canvas();
  cv.style.width = cv.width * scale + 'px'; cv.style.height = cv.height * scale + 'px'; cv.style.imageRendering = 'pixelated';
  return cv;
}

// ------------------------------------------------------------------ the physical order keys
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const keyGeo = new Map<string, THREE.BufferGeometry[]>();
/** a keycap model: a gunmetal frustum in a rubber well, a cap plate of `cap` enamel, the glyph raised on it */
export function keyModel(name: string, o: { cap?: 'olive' | 'enamel' | 'red' | 'teal' | 'gun' | 'brass'; relief?: number; accent?: number } = {}): () => THREE.Group {
  return () => {
    const root = new THREE.Group();
    // a rubber well, the keycap body in its colour (a machined frustum), a dark printed face, the legend raised in
    // cream enamel (readable at a glance, like a real key's legend)
    const well = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.12, 4, 1), toon({ map: tex('rubber'), color: 0x9a9a9a }));
    well.rotation.y = Math.PI / 4; well.position.y = 0.06; root.add(well);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.56, 0.34, 4, 1), toon({ map: tex(o.cap ?? 'olive'), metal: 0.25, gloss: 0.45 }));
    body.rotation.y = Math.PI / 4; body.position.y = 0.29; body.name = 'cap'; root.add(body);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.6), toon({ map: tex('darkSteel'), gloss: 0.3 }));
    plate.position.y = 0.475; root.add(plate);
    let geos = keyGeo.get(name);
    if (!geos) {
      const rows = GLYPHS[name] ?? GLYPHS.part, H = rows.length, W = Math.max(...rows.map((r) => r.length)), s = 0.54 / Math.max(W, H), rh = o.relief ?? 0.06;
      const body: THREE.BufferGeometry[] = [], acc: THREE.BufferGeometry[] = [];
      rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch !== '#' && ch !== '+') continue; (ch === '#' ? body : acc).push(box(s * 1.02, rh, s * 1.02, (i - (W - 1) / 2) * s, 0.495 + rh / 2, (j - (H - 1) / 2) * s)); } });
      geos = [body.length ? mergeGeometries(body) : new THREE.BufferGeometry(), acc.length ? mergeGeometries(acc) : new THREE.BufferGeometry()];
      keyGeo.set(name, geos);
    }
    const g1 = new THREE.Mesh(geos[0], toon({ map: tex('enamel'), gloss: 0.5, color: 0xfff8e8, bright: 1.15 }));
    const g2 = new THREE.Mesh(geos[1], toon({ color: o.accent ?? 0xe0483a, emissive: o.accent ?? 0xe0483a, emissiveK: 0.35 }));
    g1.name = 'glyph'; root.add(g1, g2);
    return root;
  };
}
/** sink the keycap while pressed (k 0..1) */
export function pressKey(root: THREE.Object3D, k: number) {
  for (const n of ['cap']) { const o = root.getObjectByName(n); if (o) o.position.y = 0.29 - k * 0.08; }
}

// ------------------------------------------------------------------ portraits: the unit's own model
/** a light rig that stays put while the model turns under it (the view's yaw is undone each frame) */
function lightRig(): THREE.Group {
  const g = new THREE.Group(); g.name = 'troopLights';
  // the kit's renderer writes linear light with no tone curve: a strong key, a warm sky fill and a cool rim
  const hemi = new THREE.HemisphereLight(0xfff2dc, 0x6a6058, 5.2); g.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d6, 7.5); key.position.set(-2.2, 3.2, 3); g.add(key); key.target.position.set(0, 0, 0); g.add(key.target);
  const fill = new THREE.DirectionalLight(0xd8e0ff, 2.2); fill.position.set(2.6, 0.6, 2.4); g.add(fill); fill.target.position.set(0, 0, 0); g.add(fill.target);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 3); rim.position.set(2.5, 1.6, -2.5); g.add(rim); rim.target.position.set(0, 0, 0); g.add(rim.target);
  return g;
}
/** a copy of a unit's body as it stands now (shared geometry and materials; userData left behind: it holds the unit) */
export function cloneBody(src: THREE.Object3D): THREE.Object3D {
  const stash: [THREE.Object3D, Record<string, unknown>][] = [];
  src.traverse((o) => { stash.push([o, o.userData]); o.userData = {}; });
  let c: THREE.Object3D;
  try { c = skClone(src); } finally { for (const [o, u] of stash) o.userData = u; }
  c.position.set(0, 0, 0); c.rotation.set(0, 0, 0);
  c.visible = true;
  // the selection flags and the world's helpers stay in the world
  c.traverse((o) => { o.visible = o.visible || o === c; const m = o as THREE.Mesh; if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; } });
  return c;
}
/** a turntable plinth under a portrait (machined gunmetal disc with a brass rim) */
function plinth(r: number): THREE.Group {
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, r * 0.14, 20), toon({ map: tex('gun'), metal: 0.6, gloss: 0.4 })); d.position.y = -r * 0.07; g.add(d);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.07, r * 1.07, r * 0.05, 20), toon({ map: tex('brass'), metal: 0.8 })); ring.position.y = -r * 0.035; g.add(ring);
  return g;
}
/**
 * the portrait build for a ModelView: the unit's body cloned as it stands, with lights that hold still while the
 * view turns (the ModelView is passed in so its yaw can be undone), optionally on a plinth
 */
export function portraitBuild(t: Troop, o: { plinth?: boolean; view?: () => ModelView | null } = {}): () => THREE.Object3D {
  return () => {
    const src = t.visual();
    const root = new THREE.Group();
    if (!src) return root;
    let body: THREE.Object3D;
    try { body = cloneBody(src); } catch (e) { console.warn('troops portrait', e); return root; }
    // robots carry their own scale on the mesh root (humans 0.6 on the rig): keep the clone's local scale
    const holder = new THREE.Group(); holder.add(body);
    const fit = fitBody(holder);
    root.add(fit);
    if (o.plinth) { const r = Math.max(0.35, (fit.userData.fitW as number) * 0.62); root.add(plinth(r)); }
    const rig = lightRig(); root.add(rig);
    root.userData.fitR = (fit.userData.fitR as number) * (o.plinth ? 1.12 : 1); root.userData.fitH = fit.userData.fitH; root.userData.fitW = fit.userData.fitW;
    root.userData.lights = rig;
    return root;
  };
}
/**
 * fitRoot for bodies that may be skinned: the bounds come from each visible mesh's own geometry box (bind space) in
 * its world matrix, so a skinned clone fresh out of the world (bones still holding their old world matrices) frames
 * right
 */
export function fitBody(holder: THREE.Group): THREE.Group {
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  holder.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh || !m.geometry || !m.visible || m.userData.isHull || m.userData.hull) return;
    const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingBox) return;
    tmp.copy(g.boundingBox).applyMatrix4(m.matrixWorld); box.union(tmp);
  });
  if (box.isEmpty()) return fitRoot(holder);
  const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), out = new THREE.Group();
  holder.position.set(-c.x, -box.min.y, -c.z); out.add(holder);
  out.userData.fitR = Math.max(0.001, Math.hypot(sz.x, sz.y, sz.z) / 2); out.userData.fitH = sz.y; out.userData.fitW = Math.max(sz.x, sz.z);
  return out;
}
/** keep a portrait's lights fixed to the view as its turntable spins (call from ViewOpts.anim) */
export function holdLights(root: THREE.Object3D, yaw: number) { const r = root.userData.lights as THREE.Object3D | undefined ?? root.getObjectByName('troopLights'); if (r) r.rotation.y = -yaw; }
/** the model of a robot kind / species design for the production queues (no unit yet) */
export function bareBuild(make: () => THREE.Object3D | null): () => THREE.Object3D {
  return () => {
    const root = new THREE.Group();
    let m: THREE.Object3D | null = null;
    try { m = make(); } catch (e) { console.warn('troops model', e); }
    if (!m) return root;
    const fit = fitRoot(m); root.add(fit, lightRig());
    root.userData.fitR = fit.userData.fitR; root.userData.fitH = fit.userData.fitH; root.userData.fitW = fit.userData.fitW;
    root.userData.lights = root.children[1];
    return root;
  };
}

// ------------------------------------------------------------------ pips, gauges, marks (pixel art)
const pipC = new Map<string, HTMLCanvasElement>();
/** a small diamond pip (lit / dark) in a ramp */
export function pip(ramp: Ramp, on: boolean, w = 4): HTMLCanvasElement {
  const key = ramp.join(',') + on + w; const hit = pipC.get(key); if (hit) return hit;
  const p = new Px(w + 2, w + 2), c = w / 2;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const d = Math.abs(x + 0.5 - c) + Math.abs(y + 0.5 - c); if (d > c + 0.2) continue;
    const lit = x + y < w - 1;
    p.set(x + 1, y + 1, on ? (lit ? ramp[Math.min(ramp.length - 1, 5)] : ramp[3]) : (lit ? P.steel[2] : P.steel[1]));
  }
  if (on) p.set(1 + Math.floor(c) - 1, 1 + Math.floor(c) - 1, mixHex(ramp[Math.min(ramp.length - 1, 6)], 0xffffff, 0.4));
  p.outline(INK);
  const cv = p.canvas(); pipC.set(key, cv); return cv;
}
/** a horizontal gauge: an icon then a glass cell bar (the kit's cellBar) */
export function hpRamp(v: number): Ramp { return v > 0.55 ? P.malachite : v > 0.28 ? P.glowAmber : P.ruby; }
export { P, INK };

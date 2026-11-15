// What is in each room, packed the way a small working ship is: big furniture against the far walls, mid props
// in every gap (racks, lockers, crates, carts, plants, bins), small detail on every surface (mugs, papers, tools,
// books, food, photos, a guitar, laundry), cables on the floor and pipes, ducts, trays, vents and lamps on the
// walls. Furniture is LIMBOPHOBIA's own (its atlas props: racks, terminals, benches, shelving, crates, cabinets,
// the generator...), lowpix pixel-hd conversions of Poly Haven props, and pieces modelled here. Many props answer
// a click with a small action and a sound (refs.props); the key prop opens the room's function. Small life: the
// ship's cat, a cleaning bot, swaying plants, steaming kettles and pots, flickering screens.
import * as THREE from 'three';
import { box, cyl, lathe, quad, V3 } from './kit';
import { ROOMS, type RoomId } from './layout';
import { canvas, toTex, cached, stencilText, hazardTex } from './tex';
import { placeModel } from './models';
import {
  mat, glow, chair, stool, console_, bunk, locker, medBed, table, galley, fridge, shelving, crate, barrel, pipeRun, cable,
  wallLamp, plant, mug, books, toolbox, extinguisher, screenPanel, poster, sign, type Ctx,
} from './props';
import { buildPod } from './pod';
import { beam, motes, steam } from './fx';
import { objDef, objectGeometry } from '../../limbo/world/objects';
import { worldMaterial } from '../../limbo/gfx/materials';
import { registerAllTextures } from '../../limbo/gfx/textures/index';
import '../../limbo/content/textures/materials';
import '../../limbo/content/furniture/b_industrial';
import '../../limbo/content/furniture/b_lab';
import '../../limbo/content/furniture/b_survival';
import '../../limbo/content/furniture/zw_annex';
import { csfx } from '../../ui/cineAudio';

const P = Math.PI;
const FX = -P / 2; // facing -x
const ph = (c: Ctx, id: string, x: number, y: number, z: number, ry = 0, s = 1) => placeModel(c.root, id, { x, y, z, ry, s }, c.M.env);

// ------------------------------------------------------------------ LIMBOPHOBIA's atlas props
let wm: THREE.Material | null = null;
/** a LIMBOPHOBIA object (its own pixel-art atlas model), front facing +z at ry = 0 */
export function lp(c: Ctx, key: string, x: number, z: number, ry = 0, y = 0, s = 1) {
  registerAllTextures();
  const d = objDef(key); if (!d) return null;
  const geo = objectGeometry(d, { uid: 0, key, x: 0, y: 0, rot: 0, state: {} } as any); if (!geo) return null;
  wm ??= worldMaterial({ noVis: true, noFog: true, noGrid: true });
  const m = new THREE.Mesh(geo, wm); m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s); m.castShadow = true; m.receiveShadow = true;
  c.root.add(m);
  return m;
}

// ------------------------------------------------------------------ interactive props
export interface IProp { box: THREE.Box3; label: string; act: () => void }
export function inter(c: Ctx, b: [number, number, number, number, number, number], label: string, act: () => void) {
  ((c.refs.props ??= []) as IProp[]).push({ box: new THREE.Box3(new V3(b[0], b[1], b[2]), new V3(b[3], b[4], b[5])), label, act });
}
/** a short tween on the room's animation clock */
export function tween(c: Ctx, dur: number, f: (k: number) => void) {
  let t = 0, live = true;
  c.anims.push((dt) => { if (!live) return; t += dt; const k = Math.min(1, t / dur); f(k); if (k >= 1) live = false; });
}
/** a wobble: an object rocks and settles */
function jiggle(c: Ctx, o: THREE.Object3D, amt = 0.12) { const r0 = o.rotation.z; tween(c, 0.7, (k) => { o.rotation.z = r0 + Math.sin(k * 22) * amt * (1 - k); }); }
/** a puff of steam that blooms and fades */
function puff(c: Ctx, p: THREE.Vector3, k = 0.45, rise = 0.9) {
  const s = steam(c, p, rise, 10, 0xe8ecec, 0, 1.6);
  const u = (s.material as THREE.ShaderMaterial).uniforms;
  tween(c, 2.4, (t) => { u.uK.value = k * Math.sin(Math.min(1, t * 1.4) * P); if (t >= 1) s.visible = false; });
}
let ac: AudioContext | null = null;
/** a tiny synthesized voice for the ship's cat */
function meow() {
  try {
    ac ??= new AudioContext();
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
    o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(820, t + 0.18); o.frequency.linearRampToValueAtTime(480, t + 0.55);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(f); f.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.65);
  } catch { /* no audio */ }
}
/** an open chord on the quarters' guitar */
function strum() {
  try {
    ac ??= new AudioContext();
    const t = ac.currentTime;
    [196, 247, 294, 392, 494, 587].forEach((fq, i) => { const o = ac!.createOscillator(), g = ac!.createGain(); o.type = 'triangle'; o.frequency.value = fq; g.gain.setValueAtTime(0.0001, t + i * 0.025); g.gain.exponentialRampToValueAtTime(0.05, t + i * 0.025 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); o.connect(g); g.connect(ac!.destination); o.start(t + i * 0.025); o.stop(t + 1.7); });
  } catch { /* no audio */ }
}
/** a hinged door on a pivot that swings open and shut */
function hinge(c: Ctx, o: THREE.Object3D, open = 1.6) { let st = false; return () => { st = !st; const a0 = o.rotation.y, a1 = st ? open : 0; csfx(st ? 'cover' : 'thud', 0.5); tween(c, 0.35, (k) => { o.rotation.y = a0 + (a1 - a0) * (1 - (1 - k) * (1 - k)); }); }; }
/** a lamp that toggles */
function lampToggle(L: THREE.Light, m?: THREE.MeshBasicMaterial) { let on = true; const k0 = L.intensity, c0 = m?.color.clone(); return () => { on = !on; csfx('switch', 0.6); L.intensity = on ? k0 : 0; if (m && c0) m.color.copy(c0).multiplyScalar(on ? 1 : 0.08); }; }
/** a dynamic mesh (not merged), for props that move */
function dyn(c: Ctx, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0) { const me = new THREE.Mesh(c.bin.g(g), m); me.position.set(x, y, z); me.rotation.y = ry; me.castShadow = true; me.receiveShadow = true; c.root.add(me); return me; }

// ------------------------------------------------------------------ small things
/** stars through a window: deep space, and the planet's limb in some */
function spaceTex(seed: number, limb = false) {
  return cached('space|' + seed + limb, () => {
    const [cv, g] = canvas(128, 128);
    g.fillStyle = '#05070d'; g.fillRect(0, 0, 128, 128);
    let s = seed * 9301; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 70; i++) { const b = rnd(); g.fillStyle = b > 0.85 ? '#e8ecff' : b > 0.5 ? '#9aa4c0' : '#4a5470'; g.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 128), 1, 1); }
    if (limb) { g.fillStyle = '#24425a'; for (let y = 90; y < 128; y++) { const w = Math.sqrt(Math.max(0, 140 * 140 - (y - 230) * (y - 230))); g.fillRect(100 - w, y, w * 2, 1); } g.fillStyle = '#5a8aa8'; for (let x = 0; x < 128; x++) { const y = 230 - Math.sqrt(Math.max(0, 140 * 140 - (x - 100) * (x - 100))); g.fillRect(x, Math.round(y), 1, 1); } }
    const t = toTex(cv, { repeat: false }); t.magFilter = THREE.NearestFilter; return t;
  });
}
function window_(c: Ctx, x: number, y: number, z: number, ry: number, w: number, h: number, seed = 1, limb = false, round = false) {
  c.B.add(round ? new THREE.CircleGeometry(w / 2, 20) : quad(w, h), c.M.glow('win|' + seed + limb, 0xffffff, 1.0, spaceTex(seed, limb)), { x, y, z, ry });
  c.B.in({ x, y, z, ry }, () => {
    if (round) c.B.add(new THREE.TorusGeometry(w / 2 + 0.04, 0.06, 6, 20), mat(c, 'gun'));
    else {
      c.B.add(box(w + 0.16, 0.1, 0.1), mat(c, 'gun'), { y: h / 2 + 0.05, z: 0.03 }); c.B.add(box(w + 0.16, 0.12, 0.14), mat(c, 'gun'), { y: -h / 2 - 0.06, z: 0.05 });
      for (const s of [-1, 1]) c.B.add(box(0.1, h, 0.1), mat(c, 'gun'), { x: s * (w / 2 + 0.03), z: 0.03 });
      const n = Math.max(1, Math.round(w / 1.1)); for (let k = 1; k < n; k++) c.B.add(box(0.06, h, 0.06), mat(c, 'gun'), { x: -w / 2 + (k * w) / n, z: 0.03 });
    }
  });
}
function floorLine(c: Ctx, x0: number, z0: number, x1: number, z1: number, w = 0.08, haz = false) {
  const L = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(L, w); g.rotateX(-P / 2);
  if (haz) { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / (w * 4), uv.getY(i)); }
  const m = haz ? c.M.get('floorhaz', { map: hazardTex(), polyOffset: 2, flag: 0 }) : c.M.get('floorline', { color: 0xc89a34, polyOffset: 2, flag: 0 });
  c.B.add(g, m, { x: (x0 + x1) / 2, y: 0.004, z: (z0 + z1) / 2, ry: -Math.atan2(z1 - z0, x1 - x0) });
}
function floorText(c: Ctx, s: string, x: number, z: number, w: number, ry = 0, col = 0xc89a34) {
  const t = cached('ft|' + s + col, () => { const [cv, g] = canvas(256, 64); stencilText(g, s, 128, 48, 48, col, { align: 'center', wear: 1.5, font: 'Title' }); const tx = toTex(cv, { repeat: false }); tx.magFilter = THREE.NearestFilter; return tx; });
  const g = new THREE.PlaneGeometry(w, w / 4); g.rotateX(-P / 2);
  c.B.add(g, c.M.get('ft|' + s + col, { map: t, transparent: true, polyOffset: 3, flag: 0 }), { x, y: 0.005, z, ry });
}
/** a run of overhead conduit along a wall top (pipes, a cable bundle, hangers) */
function conduit(c: Ctx, a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3) {
  for (const [dy, col, r] of [[0, 'pipeB', 0.06], [0.14, 'pipeY', 0.045], [-0.12, 'cable', 0.05]] as [number, string, number][]) pipeRun(c, [a.clone().add(new V3(0, dy, 0)).addScaledVector(out, 0.18), b.clone().add(new V3(0, dy, 0)).addScaledVector(out, 0.18)], r, col, 1.1);
  const L = a.distanceTo(b), dir = b.clone().sub(a).normalize();
  for (let s = 0.4; s < L; s += 1.1) { const p = a.clone().addScaledVector(dir, s).addScaledVector(out, 0.12); c.B.add(box(0.05, 0.42, 0.05), mat(c, 'gun'), { x: p.x, y: p.y, z: p.z }); }
}
/** papers scattered on a surface */
function papers(c: Ctx, x: number, y: number, z: number, n = 3, seed = 1) { for (let i = 0; i < n; i++) c.B.add(box(0.21, 0.003, 0.297), mat(c, i % 3 ? 'paper' : 'white'), { x: x + Math.sin(seed + i * 2.1) * 0.08, y: y + 0.002 + i * 0.002, z: z + Math.cos(seed + i * 1.7) * 0.06, ry: seed + i * 0.6 }); }
/** a plant that sways (a pixel-hd potted plant on a holder) and rustles when poked */
function swayPlant(c: Ctx, id: string, x: number, y: number, z: number, ry = 0) {
  const g = ph(c, id, x, y, z, ry);
  const p0 = Math.random() * 6;
  c.anims.push((_dt, t) => { g.rotation.z = Math.sin(t * 0.9 + p0) * 0.02; g.rotation.x = Math.cos(t * 0.7 + p0) * 0.015; });
  inter(c, [x - 0.3, y, z - 0.3, x + 0.3, y + 1.2, z + 0.3], 'PLANT', () => { csfx('page', 0.6); tween(c, 0.9, (k) => { g.rotation.z = Math.sin(k * 30) * 0.1 * (1 - k); }); });
  return g;
}
/** a mug that steams when poked */
function iMug(c: Ctx, x: number, y: number, z: number, paint = 'white', ry = 0) {
  mug(c, x, y, z, paint, ry);
  inter(c, [x - 0.07, y, z - 0.07, x + 0.07, y + 0.12, z + 0.07], 'MUG', () => { csfx('steam', 0.25); puff(c, new V3(x, y + 0.12, z), 0.35, 0.45); });
}
/** cable bundles snaking across the floor */
function floorCables(c: Ctx, pts: [number, number][], cols = ['cable', 'cableY', 'cableB']) {
  cols.forEach((col, k) => cable(c, pts.map(([x, z], i) => new V3(x + k * 0.06, 0.025, z + (i % 2 ? k * 0.05 : -k * 0.04))), 0.025 + k * 0.004, col));
}

// =================================================================================================== rooms
export function furnish(id: RoomId, c: Ctx) {
  ({ bridge, lab, medbay, core, quarters, workshop, mess, cargo, engineering } as Record<RoomId, (c: Ctx) => void>)[id](c);
  atmos(id, c);
}

function bridge(c: Ctx) {
  const B = c.B, mz = 18.42;
  B.add(cyl(1.2, 1.25, 0.18, 32), mat(c, 'dark'), { x: 0, y: 0.09, z: 13.9 });
  B.add(new THREE.TorusGeometry(1.18, 0.015, 4, 40), glow(c, 0x6ad0d8, 1.8), { x: 0, y: 0.185, z: 13.9, rx: P / 2 });
  chair(c, { x: 0, z: 13.9, seat: 'leather', tall: true });
  B.in({ x: 0, y: 0.18, z: 13.9 }, () => { for (const s of [-1, 1]) { B.add(box(0.16, 0.12, 0.5, 0.03), mat(c, 'dark'), { x: s * 0.38, y: 0.68 }); B.add(box(0.1, 0.01, 0.2), glow(c, s > 0 ? 0x6ad0d8 : 0xe0a040, 1.8), { x: s * 0.38, y: 0.745, z: 0.04 }); } });
  iMug(c, 0.42, 0.94, 14.05, 'red');
  // the holo table (the key prop): the target world turning over a lit glass top
  B.add(cyl(0.3, 0.42, 0.85, 20), mat(c, 'dark'), { x: 0, y: 0.43, z: 15.5 });
  B.add(cyl(0.85, 0.8, 0.08, 32), mat(c, 'gun'), { x: 0, y: 0.89, z: 15.5 });
  B.add(cyl(0.76, 0.76, 0.02, 32), glow(c, 0x5fb8c8, 0.9), { x: 0, y: 0.94, z: 15.5 });
  const holoM = c.M.glow('holo', 0x7fe0f0, 1.6, null, { transparent: true }); (holoM as THREE.MeshBasicMaterial).opacity = 0.55; (holoM as THREE.MeshBasicMaterial).wireframe = true;
  const holo = new THREE.Mesh(c.bin.g(new THREE.IcosahedronGeometry(0.36, 2)), holoM); holo.position.set(0, 1.45, 15.5); c.root.add(holo);
  const ringH = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.54, 0.01, 4, 40)), glow(c, 0x7fe0f0, 2)); ringH.position.copy(holo.position); ringH.rotation.x = 1.2; c.root.add(ringH);
  c.anims.push((_dt, t) => { holo.rotation.y = t * 0.4; ringH.rotation.z = t * 0.25; });
  c.refs.holo = holo;
  console_(c, { x: -1.5, z: 17.65, w: 1.4, screens: ['telemetry', 'radar'], seed: 2 });
  console_(c, { x: 1.5, z: 17.65, w: 1.4, screens: ['nav', 'scan'], seed: 5 });
  chair(c, { x: -1.5, z: 16.7 }); chair(c, { x: 1.5, z: 16.7, ry: 0.25 });
  iMug(c, -0.95, 0.79, 17.8, 'white'); ph(c, 'clipboard', 2.0, 0.79, 17.85, 0.4); papers(c, -2.0, 0.79, 17.8, 3, 2);
  B.add(box(6.6, 2.4, 0.2, 0.04), mat(c, 'black'), { x: 0, y: 2.15, z: mz - 0.05 });
  const mainTex = c.S.make('galaxy', 640, 224, 3);
  const mon = new THREE.Mesh(c.bin.g(quad(6.0, 2.1)), c.M.glow('mainmon', 0xffffff, 1.2, mainTex)); mon.position.set(0, 2.15, mz - 0.16); mon.rotation.y = P; c.root.add(mon);
  c.refs.monitor = mon;
  sign(c, 'UNAA RV-07 MERIDIAN', 2.6, { x: 0, y: 3.27, z: mz - 0.06, ry: P }, { fg: 0xd8d0b8, size: 56 });
  window_(c, 4.85, 2.0, 16.75, Math.atan2(-3.5, -2.4) + P, 3.4, 1.5, 3, true);
  console_(c, { x: 5.45, z: 13.6, ry: -P / 2, w: 1.5, screens: ['crew'], seed: 8, paint: 'gun' });
  chair(c, { x: 4.55, z: 13.6, ry: P / 2 });
  console_(c, { x: -5.45, z: 13.6, ry: P / 2, w: 1.5, screens: ['power', 'reactor'], seed: 11 });
  chair(c, { x: -4.6, z: 13.4, ry: -P / 2 - 0.3 });
  console_(c, { x: -4.55, z: 16.9, ry: Math.atan2(3.5, -2.4) + P, w: 1.3, screens: ['radar'], seed: 21 });
  lp(c, 'radio_console', 3.4, 12.55, 0); lp(c, 'keycard_reader', -0.95, 12.15, 0);
  // the EVA suit locker by the door (it opens)
  B.add(box(1.0, 2.2, 0.62, 0.03), mat(c, 'dark'), { x: -2.4, y: 1.1, z: 12.42 });
  B.add(lathe([[0, 0], [0.2, 0.05], [0.25, 0.5], [0.22, 0.9], [0.1, 1.0], [0, 1.0]], 12), mat(c, 'white'), { x: -2.4, y: 0.55, z: 12.45 });
  B.add(new THREE.SphereGeometry(0.16, 14, 10), mat(c, 'white'), { x: -2.4, y: 1.75, z: 12.45 });
  B.add(box(0.45, 0.1, 0.03), mat(c, 'orange'), { x: -2.4, y: 1.3, z: 12.7 });
  const sd = new THREE.Group(); sd.position.set(-2.88, 1.12, 12.75); c.root.add(sd);
  const sdp = new THREE.Mesh(c.bin.g(box(0.95, 2.0, 0.02)), mat(c, 'glass')); sdp.position.x = 0.475; sd.add(sdp);
  inter(c, [-2.9, 0, 12.1, -1.9, 2.3, 12.8], 'EVA SUIT', hinge(c, sd, -1.3));
  table(c, { x: 5.3, z: 15.2, w: 0.6, d: 0.6, top: 'gun', h: 0.9 });
  ph(c, 'vintage_electric_kettle', 5.3, 0.9, 15.1, -P / 2); iMug(c, 5.12, 0.9, 15.35, 'teal'); iMug(c, 5.45, 0.9, 15.4, 'white', 2);
  steam(c, new V3(5.3, 1.15, 15.1), 0.5, 6, 0xe0e4e4, 0.18, 2.4);
  ph(c, 'binder_notebook', 1.0, 0.79, 17.8, 0.3); ph(c, 'office_notepads', -2.2, 0.79, 17.75, -0.2);
  B.add(box(0.46, 0.5, 0.12, 0.04), mat(c, 'olive'), { x: 1.5, y: 0.9, z: 16.45, rx: -0.3 });
  toolbox(c, -5.4, 0, 15.2, 0.6); swayPlant(c, 'potted_plant_04', 5.4, 0, 12.5, 0.3);
  ph(c, 'vintage_spacecraft_instrument', -5.4, 0.79, 14.2, 1.7);
  floorCables(c, [[-1.0, 17.0], [-0.6, 16.2], [-0.4, 15.0], [-0.3, 14.3]]);
  for (const z of [16.2, 17.1]) B.add(box(0.06, 0.012, 1.2), glow(c, 0x5fb8c8, 1.2), { x: -2.6, y: 0.006, z });
  wallLamp(c, 5.92, 2.95, 13.6, FX, 0xd0e8ff, 0.7);
  conduit(c, new V3(5.95, 3.15, 12.2), new V3(5.95, 3.15, 14.9), new V3(-1, 0, 0));
  poster(c, 'chart', 0.5, { x: 5.9, y: 1.9, z: 14.6, ry: FX });
}

function lab(c: Ctx) {
  const B = c.B, wx = 6.95, x = wx - 0.36;
  B.add(box(0.7, 0.86, 3.6, 0.01), mat(c, 'white'), { x, y: 0.43, z: 8.2 });
  B.add(box(0.76, 0.04, 3.64, 0.01), c.M.get('epoxy', { color: 0x1e2422 }), { x: x - 0.02, y: 0.88, z: 8.2 });
  for (let k = 0; k < 6; k++) { B.add(box(0.02, 0.7, 0.56), mat(c, 'white'), { x: x - 0.36, y: 0.45, z: 6.7 + k * 0.6 }); B.add(box(0.03, 0.02, 0.18), mat(c, 'steel'), { x: x - 0.38, y: 0.75, z: 6.7 + k * 0.6 }); }
  B.add(box(0.3, 0.03, 3.4), mat(c, 'white'), { x: wx - 0.15, y: 1.72, z: 8.2 });
  for (let k = 0; k < 12; k++) { const z = 6.6 + k * 0.28; B.add(cyl(0.05, 0.05, 0.16 + (k % 3) * 0.04, 10), c.M.get('jar' + (k % 4), { color: [0x9fd8a8, 0xd8c898, 0xa8c8e0, 0xe0a8a0][k % 4], transparent: true, opacity: 0.75 }), { x: wx - 0.15, y: 1.83, z }); B.add(cyl(0.052, 0.052, 0.03, 10), mat(c, 'black'), { x: wx - 0.15, y: 1.93 + (k % 3) * 0.02, z }); }
  screenPanel(c, 'dna', 1.1, 0.65, { x: wx - 0.02, y: 2.35, z: 7.3, ry: FX }, 1);
  screenPanel(c, 'scan', 0.8, 0.5, { x: wx - 0.02, y: 2.35, z: 8.8, ry: FX }, 2);
  ph(c, 'industrial_microscope', x - 0.05, 0.9, 9.3, -P / 2); ph(c, 'chemistry_set', x - 0.02, 0.9, 7.0, -P / 2); ph(c, 'bunsen_burner', x - 0.1, 0.9, 8.0, 0.5);
  lp(c, 'centrifuge', x - 0.05, 8.6, -P / 2, 0.9); ph(c, 'retro_multimeter', x - 0.15, 0.9, 9.8, -1.2);
  iMug(c, x - 0.25, 0.9, 7.6, 'teal', 1.2); papers(c, x - 0.15, 0.9, 7.85, 2, 3);
  stool(c, 5.95, 9.0); stool(c, 5.95, 7.6, 0.62);
  sign(c, 'HULL FRAME 14', 0.8, { x: wx - 0.012, y: 2.25, z: 10.7, ry: FX }, { fg: 0x2a302c, size: 40 });
  window_(c, wx - 0.02, 1.6, 11.4, FX, 0.7, 0.7, 7, false, true);
  c.refs.breach = { pos: new V3(...ROOMS.lab.spots.hull_breach.p), normal: new V3(-1, 0, 0) };
  // three specimen tanks against the bow wall (the key prop)
  const fz = 11.45;
  [2.95, 4.05, 5.15].forEach((tx, i) => {
    B.add(cyl(0.44, 0.48, 0.3, 24), mat(c, 'gun'), { x: tx, y: 0.15, z: fz }); B.add(cyl(0.44, 0.44, 0.22, 24), mat(c, 'gun'), { x: tx, y: 2.36, z: fz });
    B.add(cyl(0.37, 0.37, 2.02, 24, true), mat(c, 'glass'), { x: tx, y: 1.29, z: fz });
    const fl = c.M.glow('fluid' + i, [0x58d888, 0x48c8b8, 0x88d858][i], 0.55, null, { transparent: true }); (fl as THREE.MeshBasicMaterial).opacity = 0.42;
    B.add(cyl(0.35, 0.35, 1.85, 20), fl, { x: tx, y: 1.28, z: fz });
    B.add(lathe([[0, 0], [0.08, 0.05], [0.14, 0.2], [0.12, 0.38], [0.06, 0.5], [0.0, 0.52]], 10), c.M.get('spec' + i, { color: [0xc89a8a, 0x8a9ac8, 0xa8b878][i] }), { x: tx, y: 0.95 + i * 0.05, z: fz, rz: 0.3 * (i - 1), rx: 0.2 });
    for (const s of [-1, 1]) pipeRun(c, [new V3(tx + s * 0.22, 2.48, fz), new V3(tx + s * 0.22, 3.15, fz), new V3(tx + s * 0.22, 3.15, 11.85)], 0.033, i === 1 ? 'pipeG' : 'pipe', 2);
    B.add(box(0.28, 0.1, 0.02), glow(c, 0x6ad08a, 1.6), { x: tx, y: 0.22, z: fz - 0.46 });
  });
  const bm = c.M.glow('bubble', 0xd8fff0, 1.2, null, { transparent: true }); (bm as THREE.MeshBasicMaterial).opacity = 0.6;
  const bg = c.bin.g(new THREE.SphereGeometry(0.022, 6, 4)); const bubs: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) { const b = new THREE.Mesh(bg, bm); b.userData.x = [2.95, 4.05, 5.15][i % 3] + (Math.random() - 0.5) * 0.35; b.userData.z = fz + (Math.random() - 0.5) * 0.35; b.userData.ph = Math.random(); c.root.add(b); bubs.push(b); }
  c.anims.push((_dt, t) => { for (const b of bubs) { const u = (t * 0.25 + b.userData.ph) % 1; b.position.set(b.userData.x + Math.sin(t * 2 + b.userData.ph * 9) * 0.03, 0.4 + u * 1.8, b.userData.z); } });
  lp(c, 'lab_cabinet', 6.45, 11.5, P);
  // the island, a fume hood, the grow rack by the door
  table(c, { x: 3.9, z: 8.4, w: 0.9, d: 2.0, h: 0.92, top: 'white' });
  B.add(box(0.46, 0.34, 0.56, 0.03), mat(c, 'white'), { x: 3.9, y: 1.09, z: 7.8 }); B.add(box(0.28, 0.04, 0.02), glow(c, 0x6ad0d8, 2.2), { x: 3.66, y: 1.15, z: 7.8, ry: P / 2 });
  ph(c, 'classic_laptop', 3.85, 0.92, 8.6, -P / 2 + 0.3); ph(c, 'magnifying_glass_01', 4.1, 0.92, 9.0, 1.0);
  for (let k = 0; k < 10; k++) B.add(cyl(0.014, 0.014, 0.12, 6), c.M.get('tube' + (k % 3), { color: [0xd85a4a, 0x5ab8d8, 0xd8c84a][k % 3] }), { x: 4.12, y: 0.98, z: 8.2 + k * 0.045 });
  papers(c, 3.75, 0.92, 9.1, 3, 5); iMug(c, 4.15, 0.92, 7.6, 'white', 0.4);
  stool(c, 3.1, 8.2); stool(c, 3.1, 9.0);
  lp(c, 'fume_hood', 6.5, 6.55, -P / 2);
  shelving(c, { x: 1.65, z: 7.1, ry: P / 2, w: 1.6, h: 1.9, d: 0.55, levels: 3, paint: 'white' });
  for (const y of [0.13, 0.98]) for (let k = 0; k < 3; k++) plant(c, 1.65, y + 0.02, 6.6 + k * 0.5, 0.6, k + 3 + Math.round(y * 5), 'plasticW');
  for (const y of [0.9, 1.75]) B.add(box(0.05, 0.02, 1.5), glow(c, 0xd8a0ff, 2.0), { x: 1.65, y, z: 7.1 });
  swayPlant(c, 'potted_plant_01', 6.4, 0, 10.2, 0.8); swayPlant(c, 'potted_plant_02', 1.75, 0, 11.4, 2.0);
  poster(c, 'bio', 0.5, { x: 6.2, y: 2.05, z: 11.88, ry: P });
  extinguisher(c, 2.0, 11.86, P);
  floorCables(c, [[3.9, 7.4], [3.5, 6.6], [4.8, 6.3], [6.1, 6.3]]);
  conduit(c, new V3(wx, 3.15, 6.2), new V3(wx, 3.15, 11.8), new V3(-1, 0, 0));
  wallLamp(c, wx - 0.02, 3.0, 9.8, FX, 0xe0fff0, 0.8);
  lp(c, 'cryo_pod', 2.2, 10.2, 0);
  for (const [cx, cz, k] of [[5.9, 10.4, 'white'], [6.3, 10.0, 'grey']] as [number, number, 'white' | 'grey'][]) crate(c, { x: cx, z: cz, w: 0.45, h: 0.35, d: 0.4, kind: k, ry: 0.3 });
  ph(c, 'plastic_container', 6.0, 0.35, 10.4, 0.6);
  B.add(box(0.5, 0.8, 0.4, 0.02), mat(c, 'steel'), { x: 3.1, y: 0.4, z: 10.4 }); ph(c, 'medical_box', 3.1, 0.8, 10.4, 0.2); // a sample trolley
  floorCables(c, [[2.9, 10.9], [3.4, 10.0], [4.4, 9.8]], ['cableB', 'cable']);
  inter(c, [x - 0.4, 0.9, 9.1, x + 0.3, 1.4, 9.5], 'MICROSCOPE', () => { csfx('relay', 0.5); });
  inter(c, [3.6, 0.9, 7.5, 4.2, 1.3, 8.1], 'SEQUENCER', () => { csfx('beepHi', 0.4); });
}

function medbay(c: Ctx) {
  const B = c.B, wx = -1.28;
  medBed(c, { x: -1.4, z: 7.9 }); medBed(c, { x: -1.4, z: 11.1 });
  screenPanel(c, 'ekg', 0.6, 0.4, { x: wx - 0.02, y: 1.75, z: 8.75, ry: FX }, 1); screenPanel(c, 'ekg', 0.6, 0.4, { x: wx - 0.02, y: 1.75, z: 10.25, ry: FX }, 2);
  B.add(box(0.12, 0.12, 0.12), mat(c, 'white'), { x: wx - 0.06, y: 2.9, z: 11.1 }); B.add(box(1.3, 0.07, 0.07), mat(c, 'white'), { x: -1.95, y: 2.85, z: 11.1, rz: -0.15 });
  B.add(cyl(0.34, 0.28, 0.12, 20), mat(c, 'white'), { x: -2.55, y: 2.56, z: 11.1 });
  const lm = c.M.live(0xf8fff8, 2.4); B.add(new THREE.CircleGeometry(0.26, 20), lm, { x: -2.55, y: 2.49, z: 11.1, rx: P / 2 });
  const sl = new THREE.PointLight(0xf4fff8, 5, 4, 1.6); sl.position.set(-2.55, 2.2, 11.1); c.root.add(sl);
  inter(c, [-2.9, 2.4, 10.8, -2.2, 2.7, 11.4], 'SURGICAL LAMP', lampToggle(sl, lm as THREE.MeshBasicMaterial));
  beam(c, new V3(-2.55, 2.48, 11.1), new V3(-2.55, 0.78, 11.1), 0.7, 0xf8fff8, 0.18);
  for (let k = 0; k < 3; k++) B.add(box(0.03, 1.7, 0.03), mat(c, 'chrome'), { x: -1.6 - k * 0.55, y: 0.85, z: 9.5 });
  const cur = new THREE.Mesh(c.bin.g(box(1.1, 1.3, 0.02)), c.M.get('curtain', { color: 0x9ac0bc })); cur.position.set(-2.15, 1.0, 9.5); c.root.add(cur);
  inter(c, [-2.8, 0.3, 9.4, -1.5, 1.7, 9.6], 'CURTAIN', () => { csfx('page', 0.5); const s0 = cur.scale.x; tween(c, 0.5, (k) => { cur.scale.x = s0 > 0.5 ? 1 - k * 0.7 : 0.3 + k * 0.7; cur.position.x = -2.15 + (1 - cur.scale.x) * 0.55; }); });
  const ax = -5.3, az = 8.6;
  B.add(box(0.66, 0.75, 1.9, 0.04), mat(c, 'white'), { x: ax, y: 0.375, z: az }); B.add(box(0.58, 0.08, 1.8, 0.04), mat(c, 'mattress'), { x: ax, y: 0.79, z: az });
  const ring = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.9, 0.11, 10, 36, P * 1.2)), mat(c, 'white')); ring.rotation.set(0, P / 2, -0.1 * P); ring.position.set(ax, 0.55, az); ring.castShadow = true; c.root.add(ring);
  const strip = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.8, 0.02, 4, 36, P * 1.2)), glow(c, 0x6ad0d8, 2.4)); strip.rotation.copy(ring.rotation); strip.position.copy(ring.position); c.root.add(strip);
  c.anims.push((_dt, t) => { const z = az + Math.sin(t * 0.6) * 0.6; ring.position.z = z; strip.position.z = z; });
  for (let k = 0; k < 3; k++) { const xx = -6.75 + k * 0.6; B.add(box(0.58, 2.0, 0.48, 0.015), mat(c, 'white'), { x: xx, y: 1.0, z: 11.66 }); B.add(box(0.02, 0.18, 0.03), mat(c, 'steel'), { x: xx + 0.2, y: 1.0, z: 11.41 }); }
  const cabDoor = new THREE.Group(); cabDoor.position.set(-7.03, 1.0, 11.4); c.root.add(cabDoor);
  const cd = new THREE.Mesh(c.bin.g(box(0.56, 1.95, 0.03)), mat(c, 'white')); cd.position.set(0.28, 0, 0); cabDoor.add(cd);
  inter(c, [-7.05, 0, 11.3, -6.5, 2.0, 11.9], 'CABINET', hinge(c, cabDoor, -1.4));
  sign(c, '+', 0.26, { x: -6.15, y: 1.6, z: 11.41, ry: P }, { fg: 0xb8382e, size: 48, font: 'Title' });
  B.add(box(1.8, 0.9, 0.58, 0.01), mat(c, 'white'), { x: -4.25, y: 0.45, z: 11.62 }); B.add(box(1.84, 0.04, 0.62), mat(c, 'steel'), { x: -4.25, y: 0.92, z: 11.62 });
  B.add(box(1.8, 0.68, 0.3, 0.01), mat(c, 'white'), { x: -4.25, y: 1.9, z: 11.77 }); B.add(box(1.7, 0.58, 0.02), mat(c, 'glass'), { x: -4.25, y: 1.9, z: 11.61 });
  ph(c, 'medical_box', -3.8, 0.94, 11.6, P); ph(c, 'medical_tape', -4.4, 0.94, 11.5, 0.4); ph(c, 'plastic_container', -4.9, 0.94, 11.6, 0.2);
  for (let k = 0; k < 7; k++) B.add(cyl(0.04, 0.04, 0.14 + (k % 2) * 0.06, 8), c.M.get('med' + (k % 3), { color: [0xe8e0d0, 0xc04a3a, 0x6aa0c8][k % 3] }), { x: -4.9 + k * 0.2, y: 1.66 + (k % 2) * 0.03, z: 11.78 });
  poster(c, 'firstaid', 0.42, { x: -2.6, y: 1.85, z: 11.88, ry: P }); poster(c, 'eye', 0.38, { x: -1.9, y: 1.85, z: 11.88, ry: P });
  table(c, { x: -6.6, z: 10.0, w: 0.7, d: 1.3, top: 'white' }); chair(c, { x: -6.0, z: 10.0, ry: -P / 2 });
  ph(c, 'classic_laptop', -6.6, 0.75, 10.1, P / 2); iMug(c, -6.7, 0.75, 9.55, 'white'); papers(c, -6.55, 0.75, 10.5, 3, 7);
  ph(c, 'wheelchair_01', -3.6, 0, 7.6, 2.4); swayPlant(c, 'potted_plant_04', -6.75, 0, 7.5, 1.0);
  B.add(cyl(0.18, 0.16, 0.5, 12), mat(c, 'red'), { x: -2.6, y: 0.25, z: 9.15 });
  conduit(c, new V3(wx, 3.15, 7.2), new V3(wx, 3.15, 11.8), new V3(-1, 0, 0));
  wallLamp(c, wx - 0.02, 2.95, 9.5, FX, 0xffffff, 0.8);
}

function core(c: Ctx) {
  const B = c.B, wx = -1.28;
  for (const z of [2.45, 3.1, 3.75, 5.25, 5.9, 6.55]) lp(c, 'server_rack', wx - 0.5, z, -P / 2);
  for (const z of [2.45, 3.75, 5.9]) cable(c, [new V3(wx - 0.6, 2.05, z), new V3(wx - 0.6, 2.6, z), new V3(wx - 0.3, 3.1, z)], 0.03, 'cableB');
  const cx = ROOMS.core.spots.core.p[0], cz = ROOMS.core.spots.core.p[2];
  B.add(cyl(1.3, 1.4, 0.16, 40), mat(c, 'dark'), { x: cx, y: 0.08, z: cz }); B.add(cyl(1.0, 1.05, 0.14, 40), mat(c, 'gun'), { x: cx, y: 0.23, z: cz });
  B.add(new THREE.TorusGeometry(1.32, 0.015, 4, 48), glow(c, 0x6ad08a, 2.2), { x: cx, y: 0.165, z: cz, rx: P / 2 });
  B.add(cyl(0.6, 0.7, 0.5, 24), mat(c, 'dark'), { x: cx, y: 0.55, z: cz }); B.add(cyl(0.62, 0.52, 0.3, 24), mat(c, 'dark'), { x: cx, y: 3.05, z: cz });
  B.add(cyl(0.42, 0.42, 2.3, 24, true), mat(c, 'glass'), { x: cx, y: 1.95, z: cz });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * P * 2; B.add(box(0.05, 2.3, 0.05), mat(c, 'gun'), { x: cx + Math.cos(a) * 0.44, y: 1.95, z: cz + Math.sin(a) * 0.44 }); }
  const heartM = c.M.live(0x7fe0a0, 2.2);
  const heart = new THREE.Mesh(c.bin.g(new THREE.IcosahedronGeometry(0.26, 1)), heartM); heart.position.set(cx, 1.95, cz); c.root.add(heart);
  const r1 = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.36, 0.022, 6, 36)), glow(c, 0x9ff0b8, 2.0)); r1.position.copy(heart.position); c.root.add(r1);
  const r2 = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.31, 0.018, 6, 36)), glow(c, 0x6ad08a, 2.0)); r2.position.copy(heart.position); c.root.add(r2);
  c.refs.coreHeart = heartM;
  let spin = 1;
  c.anims.push((dt, t) => { r1.rotation.set(t * 0.7 * spin, t * 0.4, 0); r2.rotation.set(-t * 0.5 * spin, 0, t * 0.9); heart.rotation.y = t * 0.3; heart.scale.setScalar(1 + Math.sin(t * 2.2) * 0.04); if (!c.refs.coreTalk) heartM.color.setHex(0x7fe0a0).multiplyScalar(1.8 + Math.sin(t * 2.2) * 0.4); spin += (1 - spin) * Math.min(1, dt); });
  for (const [z, col] of [[2.4, 'cableB'], [3.2, 'cable'], [5.6, 'cableY'], [6.4, 'cable']] as [number, string][]) cable(c, [new V3(wx - 0.95, 0.03, z), new V3(-3.0, 0.03, z * 0.7 + cz * 0.3), new V3(cx + 0.8, 0.03, cz + (z - cz) * 0.4)], 0.04, col);
  console_(c, { x: -4.7, z: 6.55, ry: P, w: 1.8, screens: ['wave', 'bars'], seed: 13, paint: 'dark' });
  chair(c, { x: -4.7, z: 5.75, ry: P });
  screenPanel(c, 'eye', 0.9, 0.66, { x: -6.4, y: 2.2, z: 6.9, ry: P }, 3);
  ph(c, 'circuit_board', -5.2, 0.79, 6.6, 0.6); iMug(c, -4.0, 0.79, 6.5, 'dark'); papers(c, -5.5, 0.79, 6.5, 2, 9);
  shelving(c, { x: -6.75, z: 3.6, ry: P / 2, w: 1.8, h: 1.8, d: 0.45, levels: 3, paint: 'gun' });
  for (const y of [0.13, 0.72, 1.31]) for (let k = 0; k < 3; k++) crate(c, { x: -6.75, y, z: 2.95 + k * 0.62, w: 0.4, h: 0.26, d: 0.5, ry: P / 2, kind: (['grey', 'blue', 'white'] as const)[(k + Math.round(y * 3)) % 3] });
  sign(c, 'UNIT 07', 1.1, { x: -5.6, y: 2.9, z: 6.9, ry: P }, { fg: 0x6ad08a, size: 64, glow: true });
  conduit(c, new V3(wx, 3.15, 2.2), new V3(wx, 3.15, 6.8), new V3(-1, 0, 0));
  inter(c, [cx - 0.5, 1.4, cz - 0.5, cx + 0.5, 2.5, cz + 0.5], 'UNIT 07', () => { csfx('beepHi', 0.5); spin = 6; });
}

function quarters(c: Ctx) {
  const B = c.B, wx = -1.28;
  bunk(c, { x: -1.78, z: -4.85, seed: 1 }); bunk(c, { x: -1.78, z: -2.65, seed: 2 });
  for (const [gx, seed] of [[-5.9, 3], [-3.7, 4]] as [number, number][]) { const g = new THREE.Group(); g.position.set(gx, 0, 1.47); g.rotation.y = -P / 2; g.updateMatrix(); B.push(g.matrix); bunk(c, { x: 0, z: 0, seed }); B.pop(); }
  ph(c, 'alarm_clock_01', -1.55, 1.02, -5.7, -P / 2 - 0.3); ph(c, 'portable_cassette_player', -2.0, 0.62, -4.2, 0.3);
  ph(c, 'gamepad', -1.95, 1.95, -2.2, 1.1); ph(c, 'round_spectacles', -1.7, 0.6, -2.0, 0.4); ph(c, 'standing_picture_frame_01', -1.55, 1.02, -3.4, -P / 2);
  ph(c, 'rubber_boots', -2.6, 0, -4.0, 0.3); ph(c, 'rubber_boots', -5.0, 0, 0.6, -0.4);
  books(c, -6.8, 0.62, 1.15, 4, 0, 3); books(c, -4.5, 1.92, 1.2, 3, 0, 6);
  poster(c, 'band', 0.5, { x: wx - 0.01, y: 2.85, z: -4.9, ry: FX, rz: 0.03 }); poster(c, 'pinup', 0.4, { x: wx - 0.01, y: 1.25, z: -3.75, ry: FX, rz: -0.04 });
  poster(c, 'kid', 0.36, { x: -6.3, y: 2.8, z: 1.88, ry: P, rz: 0.05 }); poster(c, 'earth', 0.5, { x: -2.2, y: 2.4, z: 1.88, ry: P });
  poster(c, 'calendar', 0.36, { x: wx - 0.01, y: 1.8, z: -0.8, ry: FX });
  // half-height crew lockers along the low port hull (they stay under the cut; every other one swings open)
  for (let i = 0; i < 8; i++) {
    const z = -5.45 + i * 0.5, paint = i % 3 === 1 ? 'olive' : 'grey';
    B.add(box(0.5, 0.95, 0.48, 0.015), mat(c, paint), { x: -6.62, y: 0.475, z });
    for (let k = 0; k < 4; k++) B.add(box(0.012, 0.012, 0.26), mat(c, 'black'), { x: -6.36, y: 0.75 - k * 0.035, z });
    sign(c, String(i + 1).padStart(2, '0'), 0.1, { x: -6.355, y: 0.58, z: z - 0.1, ry: P / 2 }, { fg: 0x2a2c2e, size: 22, font: 'Body' });
    B.add(box(0.03, 0.12, 0.03, 0.01), mat(c, 'chrome'), { x: -6.35, y: 0.5, z: z + 0.16 });
    const door = new THREE.Group(); door.position.set(-6.36, 0.47, z - 0.23); c.root.add(door);
    if (i % 2 === 0) { const d = new THREE.Mesh(c.bin.g(box(0.03, 0.9, 0.46)), mat(c, paint)); d.position.set(0.0, 0, 0.23); d.castShadow = true; door.add(d); }
    inter(c, [-6.9, 0, z - 0.25, -6.35, 0.95, z + 0.25], `LOCKER ${i + 1}`, i % 2 === 0 ? hinge(c, door, 1.5) : () => { csfx('thud', 0.4); });
    // what sits on top: a cap, a towel, a photo, a radio
    if (i % 4 === 0) B.add(box(0.22, 0.06, 0.2, 0.03), mat(c, ['seatR', 'olive'][i % 2]), { x: -6.62, y: 0.98, z, ry: i });
    if (i % 4 === 2) B.add(box(0.3, 0.04, 0.22, 0.02), mat(c, 'sheet'), { x: -6.62, y: 0.97, z, ry: 0.3 });
  }
  ph(c, 'standing_picture_frame_01', -6.6, 0.95, -4.0, P / 2); ph(c, 'portable_cassette_player', -6.6, 0.95, -2.5, P / 2 + 0.3);
  const rug = new THREE.PlaneGeometry(2.4, 2.0); rug.rotateX(-P / 2);
  B.add(rug, c.M.get('rug', { map: cached('rugtex', () => { const [cv, g] = canvas(96, 80); g.fillStyle = '#6a3a2a'; g.fillRect(0, 0, 96, 80); g.fillStyle = '#c8a050'; g.fillRect(4, 4, 88, 2); g.fillRect(4, 74, 88, 2); g.fillRect(4, 4, 2, 72); g.fillRect(90, 4, 2, 72); g.fillStyle = '#2a4a5a'; g.fillRect(10, 10, 76, 1); g.fillRect(10, 69, 76, 1); for (let i = 0; i < 5; i++) { g.fillStyle = '#c8a050'; g.fillRect(44, 18 + i * 10, 8, 4); } const t = toTex(cv, { repeat: false }); t.magFilter = THREE.NearestFilter; return t; }), polyOffset: 1, flag: 0 }), { x: -4.1, y: 0.006, z: -2.5 });
  table(c, { x: -4.1, z: -2.6, w: 1.1, d: 0.85, top: 'woodD' });
  for (const [dx, dz, r] of [[0, -0.8, 0], [0, 0.8, P], [-0.8, 0, P / 2], [0.75, 0.05, -P / 2]] as [number, number, number][]) chair(c, { x: -4.1 + dx, z: -2.6 + dz, ry: r + 0.15, seat: 'seatR' });
  iMug(c, -4.4, 0.75, -2.8, 'orange', 0.5); iMug(c, -3.8, 0.75, -2.3, 'white', 2.1);
  for (let k = 0; k < 6; k++) B.add(box(0.063, 0.004, 0.088), mat(c, k % 2 ? 'cream' : 'white'), { x: -4.0 + k * 0.05, y: 0.752 + k * 0.001, z: -2.5 + (k % 3) * 0.03, ry: k * 0.4 });
  ph(c, 'portable_cassette_player', -3.8, 0.75, -2.95, 2.6); papers(c, -4.45, 0.75, -2.35, 2, 4);
  // the guitar leaning on the lockers (it strums)
  const gtr = new THREE.Group(); gtr.position.set(-6.2, 0, -1.2); gtr.rotation.set(0, P / 2, 0.22); c.root.add(gtr);
  const body = new THREE.Mesh(c.bin.g(lathe([[0, 0], [0.18, 0.02], [0.2, 0.15], [0.14, 0.28], [0.16, 0.4], [0.12, 0.5], [0, 0.52]], 14)), mat(c, 'wood')); body.scale.set(1, 1, 0.3); body.position.y = 0.05; gtr.add(body);
  const neck = new THREE.Mesh(c.bin.g(box(0.06, 0.62, 0.03)), mat(c, 'woodD')); neck.position.y = 0.86; gtr.add(neck);
  const hole = new THREE.Mesh(c.bin.g(new THREE.CircleGeometry(0.05, 12)), mat(c, 'black')); hole.position.set(0, 0.36, 0.062); gtr.add(hole);
  gtr.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  inter(c, [-6.45, 0, -1.45, -5.95, 1.25, -0.95], 'GUITAR', () => { strum(); jiggle(c, gtr, 0.05); });
  B.add(lathe([[0, 0], [0.22, 0.05], [0.25, 0.3], [0.18, 0.5], [0.05, 0.56], [0, 0.55]], 10), c.M.get('sack', { color: 0x8a8a70 }), { x: -2.6, y: 0, z: -0.6 });
  B.add(box(0.4, 0.05, 0.3, 0.02), mat(c, 'sheet'), { x: -2.55, y: 0.02, z: -0.15, ry: 0.4 });
  swayPlant(c, 'potted_plant_02', -6.7, 0, -0.3, 0.6);
  // a standing lamp (it toggles)
  B.add(cyl(0.14, 0.18, 0.04, 12), mat(c, 'dark'), { x: -5.4, y: 0.02, z: -4.6 }); B.add(cyl(0.015, 0.015, 1.5, 6), mat(c, 'chrome'), { x: -5.4, y: 0.77, z: -4.6 });
  B.add(cyl(0.11, 0.2, 0.22, 12, true), mat(c, 'cream'), { x: -5.4, y: 1.6, z: -4.6 });
  const lmM = c.M.live(0xffd090, 2.4); B.add(new THREE.CircleGeometry(0.18, 12), lmM, { x: -5.4, y: 1.49, z: -4.6, rx: P / 2 });
  const fl = new THREE.PointLight(0xffc080, 4, 4, 1.6); fl.position.set(-5.4, 1.4, -4.6); c.root.add(fl);
  inter(c, [-5.6, 1.3, -4.8, -5.2, 1.75, -4.4], 'LAMP', lampToggle(fl, lmM as THREE.MeshBasicMaterial));
  beam(c, new V3(-5.4, 1.5, -4.6), new V3(-5.2, 0, -4.4), 0.7, 0xffc080, 0.16);
  floorCables(c, [[-1.9, -1.6], [-2.6, -1.4], [-3.2, -1.9]], ['cable', 'cableR']);
  conduit(c, new V3(wx, 3.15, -5.8), new V3(wx, 3.15, 1.8), new V3(-1, 0, 0));
  wallLamp(c, wx - 0.02, 3.0, -1.0, FX, 0xffd8a0, 0.7);
  shipCat(c, [new V3(-3.4, 0, -1.4), new V3(-5.2, 0, -3.6), new V3(-2.8, 0, -3.8), new V3(-4.6, 0, -0.6)]);
}

/** the ship's cat: a small low-poly tabby that walks between spots, sits a while, and meows and dashes when poked */
function shipCat(c: Ctx, path: THREE.Vector3[]) {
  const cat = new THREE.Group(); c.root.add(cat);
  const fur = c.M.get('catfur', { color: 0xc08848 }), dark = c.M.get('catdark', { color: 0x5a3a24 }), white = mat(c, 'white');
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0) => { const me = new THREE.Mesh(c.bin.g(g), m); me.position.set(x, y, z); me.rotation.x = rx; me.castShadow = true; cat.add(me); return me; };
  add(box(0.16, 0.14, 0.34, 0.05), fur, 0, 0.2, 0);
  const head = add(box(0.13, 0.12, 0.12, 0.04), fur, 0, 0.3, 0.2);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(c.bin.g(new THREE.ConeGeometry(0.03, 0.06, 4)), dark); e.position.set(s * 0.04, 0.08, 0); head.add(e); }
  const tail = add(cyl(0.015, 0.02, 0.26, 6), dark, 0, 0.28, -0.22, -0.6);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.05, 0.11], [0.05, 0.11], [-0.05, -0.11], [0.05, -0.11]]) legs.push(add(box(0.04, 0.14, 0.04), x < 0 && z > 0 ? white : fur, x, 0.07, z));
  for (const s of [-1, 1]) add(box(0.06, 0.03, 0.02), dark, s * 0.05, 0.22, 0.05);
  let i = 0, t = 0, wait = 3, run = 1;
  cat.position.copy(path[0]);
  c.anims.push((dt, tt) => {
    tail.rotation.z = Math.sin(tt * 2) * 0.4;
    if (wait > 0) { wait -= dt; legs.forEach((l) => (l.position.y = 0.07)); return; }
    const a = path[i], b = path[(i + 1) % path.length], L = a.distanceTo(b);
    t += (dt * 0.5 * run) / L;
    if (t >= 1) { t = 0; i = (i + 1) % path.length; wait = 2 + Math.random() * 5; run = 1; return; }
    cat.position.lerpVectors(a, b, t); cat.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    legs.forEach((l, k) => (l.position.y = 0.07 + Math.max(0, Math.sin(tt * 12 * run + k * P)) * 0.03));
  });
  const ip: IProp = { box: new THREE.Box3(), label: 'SHIP CAT', act: () => { meow(); wait = 0; run = 3; } };
  ((c.refs.props ??= []) as IProp[]).push(ip);
  c.anims.push(() => { ip.box.setFromCenterAndSize(cat.position.clone().add(new V3(0, 0.2, 0)), new V3(0.5, 0.5, 0.6)); });
  c.refs.cat = cat;
}

function workshop(c: Ctx) {
  const B = c.B, wx = -1.28;
  const px = ROOMS.workshop.spots.pod_cradle.p[0], pz = ROOMS.workshop.spots.pod_cradle.p[2];
  const hatch = new THREE.Group(); hatch.position.set(px, 0, pz); c.root.add(hatch);
  const leaves: THREE.Group[] = [];
  for (const s of [-1, 1]) { const h = new THREE.Group(); h.position.set(s * 1.4, 0, 0); hatch.add(h); const leaf = new THREE.Mesh(c.bin.g(box(1.4, 0.08, 2.8, 0.01)), c.M.get('hatchleaf', { map: hazardTex() })); leaf.position.set(-s * 0.7, -0.035, 0); leaf.receiveShadow = true; h.add(leaf); leaves.push(h); }
  const pit = new THREE.Mesh(c.bin.g(new THREE.BoxGeometry(2.8, 0.02, 2.8)), c.M.glow('pit', 0x050608, 1)); pit.position.set(px, -1.2, pz); c.root.add(pit);
  c.refs.hatch = (k: number) => { leaves.forEach((h, i) => { h.rotation.z = (i === 0 ? 1 : -1) * k * 1.45; }); pit.visible = k > 0.01; };
  c.refs.hatch(0);
  B.add(new THREE.TorusGeometry(1.5, 0.08, 8, 40), mat(c, 'yellow'), { x: px, y: 0.06, z: pz, rx: P / 2 });
  for (let k = 0; k < 4; k++) { const a = (k / 4) * P * 2 + P / 4; B.in({ x: px + Math.cos(a) * 1.35, z: pz + Math.sin(a) * 1.35, ry: -a + P / 2 }, () => { B.add(box(0.28, 0.5, 0.36, 0.03), mat(c, 'dark'), { y: 0.25 }); B.add(box(0.12, 0.12, 0.46, 0.02), mat(c, 'yellow'), { y: 0.5, z: -0.28 }); }); }
  for (const [a, b] of [[[px - 1.9, pz - 1.9], [px + 1.9, pz - 1.9]], [[px - 1.9, pz + 1.9], [px + 1.9, pz + 1.9]], [[px - 1.9, pz - 1.9], [px - 1.9, pz + 1.9]], [[px + 1.9, pz - 1.9], [px + 1.9, pz + 1.9]]] as [number, number][][]) floorLine(c, a[0], a[1], b[0], b[1], 0.2, true);
  floorText(c, 'POD BAY', px, pz + 2.45, 1.8, P);
  const pod = buildPod(c.bin, c.M); pod.root.position.set(px, 0, pz); c.root.add(pod.root);
  c.refs.pod = pod; c.anims.push((dt, t) => pod.update(dt, t));
  // the gantry crane (parked aft; the intro runs it: refs.crane.moveTo(z), setHook(y))
  const cy = 4.1;
  for (const x of [-6.8, -1.7]) for (const z of [-13.6, -6.4]) B.add(box(0.2, cy, 0.2, 0.02), mat(c, 'yellow'), { x, y: cy / 2, z });
  for (const x of [-6.8, -1.7]) B.add(box(0.24, 0.3, 7.6, 0.02), mat(c, 'yellow'), { x, y: cy + 0.15, z: -10 });
  const bridgeG = new THREE.Group(); c.root.add(bridgeG);
  const bb = new THREE.Mesh(c.bin.g(box(5.4, 0.28, 0.32, 0.02)), mat(c, 'yellow')); bb.position.set(-4.25, cy + 0.44, 0); bb.castShadow = true; bridgeG.add(bb);
  const hoist = new THREE.Mesh(c.bin.g(box(0.5, 0.36, 0.5, 0.03)), mat(c, 'dark')); hoist.position.set(px, cy + 0.12, 0); bridgeG.add(hoist);
  const rope = new THREE.Mesh(c.bin.g(cyl(0.015, 0.015, 1, 6)), mat(c, 'black')); bridgeG.add(rope);
  const hook = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.09, 0.028, 6, 12, P * 1.5)), mat(c, 'steel')); bridgeG.add(hook);
  let hookY = 3.0, craneZ = -13.0, craneGoal = -13.0;
  c.refs.crane = { setHook(y: number) { hookY = y; }, moveTo(z: number) { craneGoal = z; }, get z() { return craneZ; } };
  c.anims.push((dt, t) => { craneZ += Math.sign(craneGoal - craneZ) * Math.min(Math.abs(craneGoal - craneZ), dt * 1.2); const y = hookY + Math.sin(t * 0.5) * 0.03; rope.position.set(px, (cy + y) / 2, 0); rope.scale.y = cy - y; hook.position.set(px, y - 0.1, 0); bridgeG.position.z = craneZ; });
  // the workbench (LIMBOPHOBIA's), vice and tools, the tool chest, the welding cart, parts racks, bottles, drums
  lp(c, 'workbench', wx - 0.5, -12.6, -P / 2);
  ph(c, 'bench_vice_01', wx - 0.5, 0.95, -12.0, -P / 2); ph(c, 'adjustable_wrench', wx - 0.45, 0.95, -12.8, 1.2); ph(c, 'pliers', wx - 0.5, 0.95, -13.2, 2.0); ph(c, 'screwdriver', wx - 0.6, 0.95, -12.5, 0.7);
  iMug(c, wx - 0.65, 0.95, -13.4, 'orange');
  lp(c, 'tool_chest', wx - 0.5, -10.8, -P / 2);
  ph(c, 'portable_welding_cart', -2.6, 0, -8.0, 0.4); ph(c, 'korean_fire_extinguisher_01', wx - 0.25, 0, -9.6, -P / 2);
  lp(c, 'shelf_metal', -6.6, -6.55, P); lp(c, 'shelf_metal', -5.6, -6.55, P); lp(c, 'pallet_boxes', -4.5, -6.6, P);
  for (let k = 0; k < 4; k++) B.add(cyl(0.12, 0.12, 1.4, 14), mat(c, ['blue', 'pipeG', 'red', 'blue'][k]), { x: -6.85, y: 0.7, z: -8.2 + k * 0.3 });
  ph(c, 'metal_jerrycan', -6.8, 0, -13.5, 0.2); lp(c, 'generator', -5.8, -13.4, 0.3); lp(c, 'barrel_oil', -6.7, -12.5, 0.4); lp(c, 'cardboard_box', -6.7, -11.6, 1.2);
  lp(c, 'zw_cable_drum', -3.0, -13.4, 0.2); ph(c, 'tool_cart', -2.8, 0, -6.7, 1.3);
  poster(c, 'tools', 0.5, { x: wx - 0.01, y: 1.85, z: -9.9, ry: FX }); poster(c, 'safety', 0.45, { x: -3.2, y: 2.2, z: -6.08, ry: P });
  floorCables(c, [[-2.6, -8.3], [-3.2, -9.0], [-3.3, -10.2]], ['cableR', 'cable']);
  conduit(c, new V3(wx, 3.15, -13.8), new V3(wx, 3.15, -6.2), new V3(-1, 0, 0));
  wallLamp(c, wx - 0.02, 2.75, -12.6, FX, 0xfff0d0, 1.0);
  inter(c, [wx - 0.9, 0.9, -12.3, wx, 1.3, -11.7], 'VICE', () => { csfx('clamp', 0.5); });
  inter(c, [-3.0, 0, -8.4, -2.2, 1.2, -7.6], 'WELDER', () => { csfx('steam', 0.4); puff(c, new V3(-2.6, 1.0, -8.0), 0.5, 0.6); });
}

function mess(c: Ctx) {
  const B = c.B, wx = 6.95;
  galley(c, wx - 0.31, 0.2, 3.8);
  B.add(box(0.6, 0.9, 1.0, 0.01), mat(c, 'dark'), { x: wx - 0.31, y: 0.45, z: 4.4 }); B.add(box(0.64, 0.04, 1.04), mat(c, 'woodD'), { x: wx - 0.33, y: 0.92, z: 4.4 });
  B.add(box(0.38, 0.48, 0.34, 0.03), mat(c, 'steel'), { x: wx - 0.3, y: 1.18, z: 4.2 }); B.add(box(0.1, 0.05, 0.02), glow(c, 0xe0503a, 2.2), { x: wx - 0.5, y: 1.3, z: 4.2, ry: P / 2 });
  ph(c, 'vintage_electric_kettle', wx - 0.35, 0.94, 4.65, -P / 2);
  const ket = steam(c, new V3(wx - 0.35, 1.2, 4.65), 0.6, 8, 0xe0e0e0, 0.2, 2.0);
  inter(c, [wx - 0.55, 0.9, 4.45, wx - 0.15, 1.3, 4.85], 'KETTLE', () => { csfx('steam', 0.6); csfx('beepHi', 0.25); const u = (ket.material as THREE.ShaderMaterial).uniforms; u.uK.value = 0.6; tween(c, 2.5, (k) => { u.uK.value = 0.6 - 0.4 * k; }); });
  for (let k = 0; k < 4; k++) iMug(c, wx - 0.5, 0.94, 4.0 + k * 0.09, ['white', 'red', 'teal', 'orange'][k], k);
  fridge(c, wx - 0.38, 5.45);
  inter(c, [wx - 0.75, 0, 5.1, wx, 1.9, 5.8], 'FRIDGE', () => { csfx('cover', 0.5); csfx('hum', 0.3); });
  ph(c, 'vintage_microwave', wx - 0.32, 0.9, 3.3, -P / 2);
  screenPanel(c, 'galley', 0.45, 0.3, { x: wx - 0.02, y: 1.45, z: 1.0, ry: FX }, 1);
  ph(c, 'pot_enamel_01', wx - 0.3, 0.92, 0.85, 0.3); steam(c, new V3(wx - 0.3, 1.1, 0.85), 0.7, 10, 0xe0e0e0, 0.3, 2.6);
  const sh = shelving(c, { x: 2.6, z: 5.66, ry: P, w: 1.6, h: 2.0, d: 0.45, levels: 4, paint: 'white' });
  sh.levels.slice(1).forEach((y, i) => { ph(c, i % 2 ? 'russian_food_cans_01' : 'long_life_food', 2.2, y, 5.66, P); ph(c, 'plastic_thermos', 3.0 - i * 0.12, y, 5.62, 0.4); });
  B.add(box(0.32, 1.1, 0.32, 0.02), mat(c, 'plasticW'), { x: 4.0, y: 0.55, z: 5.7 }); B.add(cyl(0.14, 0.14, 0.4, 14), c.M.get('water', { color: 0x8ac0d8, transparent: true, opacity: 0.6 }), { x: 4.0, y: 1.3, z: 5.7 });
  inter(c, [3.8, 0, 5.5, 4.2, 1.6, 5.9], 'WATER', () => { csfx('glass', 0.4); });
  poster(c, 'menu', 0.5, { x: 4.9, y: 1.8, z: 5.88, ry: P }); poster(c, 'safety', 0.4, { x: 1.8, y: 2.6, z: 5.88, ry: P, rz: 0.02 });
  table(c, { x: 3.8, z: 3.0, w: 0.9, d: 2.6, h: 0.76, top: 'wood' });
  for (const s of [-1, 1]) { B.add(box(0.34, 0.06, 2.4, 0.02), mat(c, 'wood'), { x: 3.8 + s * 0.85, y: 0.45, z: 3.0 }); for (const dz of [-1.0, 1.0]) B.add(box(0.06, 0.42, 0.3), mat(c, 'gun'), { x: 3.8 + s * 0.85, y: 0.21, z: 3.0 + dz }); }
  ph(c, 'wooden_bowl_01', 3.8, 0.76, 3.0, 0);
  for (const [dx, dz, r] of [[0.0, 0.0, 0], [0.07, 0.06, 1], [-0.06, 0.05, 2], [0.02, -0.07, 3]] as [number, number, number][]) ph(c, 'food_apple_01', 3.8 + dx, 0.8, 3.0 + dz, r);
  ph(c, 'bananas', 3.9, 0.76, 3.9, 0.8); ph(c, 'tea_set_01', 3.65, 0.76, 2.0, 0.3);
  for (const [z, s] of [[2.2, -1], [3.0, 1], [3.8, -1]] as [number, number][]) { B.add(cyl(0.11, 0.09, 0.015, 16), mat(c, 'ceramic'), { x: 3.8 + s * 0.28, y: 0.768, z }); iMug(c, 3.8 + s * 0.28 + 0.13, 0.76, z + 0.1, s > 0 ? 'white' : 'red'); }
  B.add(cyl(0.03, 0.03, 0.16, 8), mat(c, 'red'), { x: 3.7, y: 0.84, z: 2.6 });
  papers(c, 4.0, 0.76, 3.5, 2, 11);
  B.add(cyl(0.2, 0.18, 0.66, 14), mat(c, 'steel'), { x: 1.65, y: 0.33, z: 5.5 });
  lp(c, 'mop_bucket', 1.7, 0.3, P / 2, 0, 0.8);
  swayPlant(c, 'potted_plant_04', 1.55, 0, 2.2, 0.4);
  conduit(c, new V3(wx, 3.15, 0.2), new V3(wx, 3.15, 5.8), new V3(-1, 0, 0));
  wallLamp(c, wx - 0.02, 2.95, 2.0, FX, 0xffe0b0, 0.8);
  cleanBot(c, [new V3(2.2, 0, 0.6), new V3(2.2, 0, 4.8), new V3(5.4, 0, 4.9), new V3(5.4, 0, 0.6)]);
}

/** a disc-shaped cleaning bot that trundles round a loop and spins and beeps when poked */
function cleanBot(c: Ctx, path: THREE.Vector3[]) {
  const g = new THREE.Group(); c.root.add(g);
  const b = new THREE.Mesh(c.bin.g(cyl(0.17, 0.18, 0.08, 18)), mat(c, 'white')); b.position.y = 0.05; b.castShadow = true; g.add(b);
  const top = new THREE.Mesh(c.bin.g(cyl(0.08, 0.08, 0.02, 12)), mat(c, 'dark')); top.position.y = 0.1; g.add(top);
  const led = c.M.live(0x6ad08a, 2); const l = new THREE.Mesh(c.bin.g(new THREE.SphereGeometry(0.018, 6, 4)), led); l.position.set(0, 0.105, 0.12); g.add(l);
  let i = 0, t = 0, spin = 0;
  c.anims.push((dt, tt) => {
    if (spin > 0) { spin -= dt; g.rotation.y += dt * 14; return; }
    const a = path[i], bb = path[(i + 1) % path.length], L = a.distanceTo(bb); t += (dt * 0.32) / L;
    if (t >= 1) { t = 0; i = (i + 1) % path.length; }
    g.position.lerpVectors(a, bb, t); g.rotation.y = Math.atan2(bb.x - a.x, bb.z - a.z) + Math.sin(tt * 3) * 0.05;
    (led as THREE.MeshBasicMaterial).color.setHex(0x6ad08a).multiplyScalar(Math.sin(tt * 4) > 0 ? 2 : 0.4);
  });
  const ip: IProp = { box: new THREE.Box3(), label: 'CLEANING BOT', act: () => { spin = 1.2; csfx('beep', 0.4); csfx('servo', 0.3); } };
  ((c.refs.props ??= []) as IProp[]).push(ip);
  c.anims.push(() => { ip.box.setFromCenterAndSize(g.position.clone().add(new V3(0, 0.1, 0)), new V3(0.5, 0.3, 0.5)); });
}

function cargo(c: Ctx) {
  const B = c.B, wx = 6.95;
  for (const z of [-4.55, -1.45]) {
    const sh = shelving(c, { x: wx - 0.48, z, ry: -P / 2, w: 2.8, h: 2.9, d: 0.9, levels: 4 });
    sh.levels.forEach((y, i) => { for (let k = 0; k < 3; k++) { if ((i + k + Math.round(z)) % 5 === 0) continue; crate(c, { x: wx - 0.48, y, z: z - 0.9 + k * 0.9, w: 0.7, h: 0.5 + ((i + k) % 2) * 0.1, d: 0.7, ry: -P / 2, kind: (['olive', 'grey', 'white', 'blue'] as const)[(i * 3 + k) % 4], label: i === 0 ? ['RATIONS', 'SPARES', 'SEEDS'][k] : undefined }); } });
  }
  for (const [x, z, n] of [[3.6, -5.1, 3], [4.6, -3.6, 2], [2.4, -5.2, 1]] as [number, number, number][]) {
    B.add(box(1.1, 0.14, 0.9, 0.01), mat(c, 'wood'), { x, y: 0.07, z });
    for (let k = 0; k < n; k++) crate(c, { x: x + (k % 2) * 0.05, y: 0.14 + k * 0.55, z, w: 1.0, h: 0.55, d: 0.82, ry: k * 0.05, kind: (['olive', 'grey', 'orange'] as const)[k % 3], label: k === 0 ? 'UNAA' : undefined });
    B.add(box(0.05, 0.14 + n * 0.55 + 0.02, 0.84), mat(c, 'yellow'), { x: x - 0.2, y: (0.14 + n * 0.55) / 2, z });
  }
  crate(c, { x: 5.2, z: -0.5, w: 0.8, h: 0.6, d: 0.6, kind: 'white', label: 'SPECIMEN' }); crate(c, { x: 5.25, y: 0.6, z: -0.55, w: 0.7, h: 0.45, d: 0.5, ry: 0.1, kind: 'white', label: 'BIO-B' });
  barrel(c, 1.75, -0.5, 'blue'); barrel(c, 2.3, -0.4, 'blue'); barrel(c, 1.95, -1.0, 'red');
  ph(c, 'hand_truck', 2.4, 0, -2.0, 0.6); ph(c, 'plastic_crate_01', 4.0, 0, -0.5, 0.3); ph(c, 'plastic_crate_03', 4.0, 0.3, -0.45, -0.2);
  ph(c, 'old_military_crate', 5.6, 0, -5.5, 0.1); lp(c, 'cardboard_stack', 1.75, -5.4, 0.2); lp(c, 'pallet_boxes', 1.75, -3.9, 0.1); lp(c, 'trash_bags', 3.0, -1.6, 0.6);
  floorLine(c, 3.0, -5.9, 3.0, -0.2, 0.08); floorText(c, 'BAY 2', 4.2, -2.4, 1.2, P / 2);
  const net = cached('net', () => { const [cv, g] = canvas(64, 64); g.strokeStyle = '#7a6a48'; g.lineWidth = 2; for (let k = -64; k < 128; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); } const t = toTex(cv, { repeat: false }); t.magFilter = THREE.NearestFilter; return t; });
  B.add(quad(2.4, 2.0), c.M.get('net', { map: net, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, flag: 0 }), { x: 3.6, y: 1.4, z: -0.2, ry: P });
  sign(c, 'CARGO HOLD 2', 1.3, { x: 2.4, y: 2.9, z: -0.1, ry: P }, { fg: 0x1c1b18, bg: 0xd2a23c, size: 48 });
  conduit(c, new V3(wx, 3.15, -5.8), new V3(wx, 3.15, -0.2), new V3(-1, 0, 0));
  wallLamp(c, wx - 0.02, 3.05, -3.0, FX, 0xfff0d8, 0.8);
  inter(c, [4.8, 0, -0.9, 5.6, 1.1, -0.1], 'SPECIMEN CRATE', () => { csfx('crunch', 0.3); });
}

function engineering(c: Ctx) {
  const B = c.B, wx = 6.95;
  const rx = ROOMS.engineering.spots.reactor.p[0], rz = ROOMS.engineering.spots.reactor.p[2];
  B.add(cyl(1.7, 1.8, 0.3, 40), mat(c, 'dark'), { x: rx, y: 0.15, z: rz });
  B.add(new THREE.TorusGeometry(1.62, 0.07, 6, 40), c.M.get('reacthaz', { map: hazardTex() }), { x: rx, y: 0.3, z: rz, rx: P / 2 });
  B.add(cyl(1.15, 1.25, 3.0, 28), mat(c, 'gun'), { x: rx, y: 1.8, z: rz });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * P * 2; B.add(box(0.1, 3.1, 0.14, 0.02), mat(c, 'dark'), { x: rx + Math.cos(a) * 1.22, y: 1.8, z: rz + Math.sin(a) * 1.22, ry: -a }); }
  const slotM = c.M.live(0xffa040, 2.4);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * P * 2 + 0.26; B.add(box(0.12, 1.4, 0.04), slotM, { x: rx + Math.cos(a) * 1.26, y: 1.8, z: rz + Math.sin(a) * 1.26, ry: -a + P / 2 }); }
  const rings: THREE.Mesh[] = [];
  for (const y of [0.8, 2.8]) { const r = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(1.5, 0.14, 10, 40)), mat(c, 'copper')); r.position.set(rx, y, rz); r.rotation.x = P / 2; r.castShadow = true; c.root.add(r); rings.push(r); }
  B.add(cyl(1.0, 1.25, 0.45, 28), mat(c, 'dark'), { x: rx, y: 3.52, z: rz });
  const top = new THREE.Mesh(c.bin.g(new THREE.CircleGeometry(0.62, 28)), slotM); top.position.set(rx, 3.76, rz); top.rotation.x = -P / 2; c.root.add(top);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * P * 2 + P / 4; pipeRun(c, [new V3(rx + Math.cos(a) * 0.8, 3.7, rz + Math.sin(a) * 0.8), new V3(rx + Math.cos(a) * 0.8, 4.1, rz + Math.sin(a) * 0.8), new V3(wx - 0.2, 4.1, rz + Math.sin(a) * 1.1)], 0.1, ['pipeR', 'pipeB', 'pipeR', 'pipeB'][k], 1.2); }
  let surge = 0;
  c.anims.push((dt, t) => { const f = 1 + Math.sin(t * 3.1) * 0.12 + Math.sin(t * 7.3) * 0.05 + surge; surge *= Math.exp(-dt * 1.5); slotM.color.setHex(0xffa040).multiplyScalar(2.2 * f); rings[0].rotation.z = t * 0.2 * (1 + surge * 4); rings[1].rotation.z = -t * 0.2 * (1 + surge * 4); });
  c.refs.reactor = slotM;
  for (let k = 0; k < 18; k++) { const a = (k / 18) * P * 2; if (Math.abs(Math.cos(a) + 1) < 0.3) continue; B.add(box(0.05, 1.05, 0.05), mat(c, 'yellow'), { x: rx + Math.cos(a) * 2.0, y: 0.52, z: rz + Math.sin(a) * 2.0 }); }
  B.add(new THREE.TorusGeometry(2.0, 0.03, 4, 40, P * 1.7), mat(c, 'yellow'), { x: rx, y: 1.05, z: rz, rx: P / 2, rz: P * 1.15 });
  console_(c, { x: 3.0, z: -6.55, ry: P, w: 2.0, screens: ['reactor', 'power'], seed: 17, paint: 'gun' });
  chair(c, { x: 3.0, z: -7.35, ry: P }); iMug(c, 2.2, 0.79, -6.45, 'dark'); papers(c, 3.6, 0.79, -6.5, 2, 13);
  poster(c, 'reactor', 0.5, { x: 5.4, y: 1.95, z: -6.12, ry: P });
  lp(c, 'electrical_cabinet', 6.6, -6.55, P); lp(c, 'fuse_panel_big', 5.7, -6.55, P);
  for (const [z, col] of [[-11.2, 'pipeR'], [-11.8, 'pipeB'], [-12.4, 'pipeY'], [-13.0, 'pipeG']] as [number, string][]) {
    pipeRun(c, [new V3(wx - 0.2, 0.0, z), new V3(wx - 0.2, 3.3, z)], 0.08, col, 0.8);
    const wh = dyn(c, new THREE.TorusGeometry(0.16, 0.03, 6, 14), mat(c, col === 'pipeR' ? 'red' : 'steel'), wx - 0.42, 1.3, z, P / 2);
    inter(c, [wx - 0.6, 1.1, z - 0.2, wx - 0.2, 1.5, z + 0.2], 'VALVE', () => { csfx('steam', 0.5); tween(c, 0.8, (k) => { wh.rotation.z = k * P * 2; }); puff(c, new V3(wx - 0.3, 2.6, z), 0.4, 0.8); });
    B.add(box(0.2, 0.06, 0.06), mat(c, 'gun'), { x: wx - 0.32, y: 1.3, z }); B.add(cyl(0.08, 0.08, 0.04, 14), mat(c, 'white'), { x: wx - 0.32, y: 2.0, z, rz: P / 2 });
  }
  for (const [x, z] of [[6.4, -13.5], [5.5, -13.55]] as [number, number][]) { B.add(cyl(0.38, 0.38, 2.3, 18), mat(c, 'white'), { x, y: 1.15, z }); B.add(new THREE.SphereGeometry(0.38, 14, 8, 0, P * 2, 0, P / 2), mat(c, 'white'), { x, y: 2.3, z }); B.add(cyl(0.4, 0.4, 0.1, 18), mat(c, 'red'), { x, y: 1.55, z }); }
  ph(c, 'small_lpg_tank', 1.7, 0, -13.5, 0.4); ph(c, 'propane_tank', 2.2, 0, -13.6, -0.3); ph(c, 'oil_tin', 2.7, 0, -13.5, 0.8); ph(c, 'metal_jerrycan', 1.7, 0, -12.6, 1.4);
  lp(c, 'generator', 1.9, -11.4, P / 2); lp(c, 'barrel_oil', 6.5, -8.0, 0); lp(c, 'barrel_oil', 6.4, -8.8, 0.6);
  ph(c, 'power_box_01', wx - 0.1, 0.9, -7.6, -P / 2);
  floorCables(c, [[3.0, -7.0], [2.6, -8.6], [rx - 1.7, rz]], ['cableY', 'cable', 'cableR']);
  conduit(c, new V3(wx, 3.15, -13.8), new V3(wx, 3.15, -6.2), new V3(-1, 0, 0));
  wallLamp(c, wx - 0.02, 3.0, -9.6, FX, 0xffd0a0, 0.8);
  inter(c, [rx - 1.3, 0.3, rz - 1.3, rx + 1.3, 1.2, rz + 1.3], 'REACTOR', () => { surge = 1.2; csfx('hum', 0.6); });
}

/** each room's practical accent light, its beams in the haze, dust in the light, steam where something vents */
function atmos(id: RoomId, c: Ctx) {
  const light = (x: number, y: number, z: number, col: number, k: number, d: number) => { const L = new THREE.PointLight(col, k, d, 1.6); L.position.set(x, y, z); c.root.add(L); c.lights.push(L); return L; };
  const box3 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => new THREE.Box3(new V3(x0, y0, z0), new V3(x1, y1, z1));
  if (id === 'bridge') {
    const L = light(0, 2.0, 17.6, 0x5fd0e0, 7, 8);
    light(0, 1.6, 15.5, 0x7fe0f0, 3, 3.5);
    beam(c, new V3(0, 0.96, 15.5), new V3(0, 2.2, 15.5), 0.8, 0x5fd0e0, 0.12);
    motes(c, box3(-2.5, 0.5, 14, 2.5, 3, 18), 60, 0x9fe0f0, 0.5);
    c.anims.push((_dt, t) => { L.intensity = 7 + Math.sin(t * 3.1) * 0.5 + (Math.sin(t * 17) > 0.97 ? 2 : 0); });
  } else if (id === 'lab') {
    const L = light(4.05, 1.5, 11.0, 0x58e08a, 7, 6);
    light(1.9, 1.4, 7.1, 0xc890ff, 3, 3);
    beam(c, new V3(6.83, 2.98, 9.8), new V3(5.6, 0.0, 9.8), 1.0, 0xe8fff0, 0.15);
    for (const tx of [2.95, 4.05, 5.15]) beam(c, new V3(tx, 0.3, 11.45), new V3(tx, 2.25, 11.45), 0.38, 0x58e08a, 0.07);
    motes(c, box3(2.4, 0.4, 9.6, 6, 2.8, 11.8), 50, 0xa8ffc8, 0.5);
    c.anims.push((_dt, t) => { L.intensity = 6.5 + Math.sin(t * 0.8) * 0.8; });
  } else if (id === 'medbay') {
    const sc = light(-5.3, 1.2, 8.6, 0x5fd0e0, 3, 3.5);
    c.anims.push((_dt, t) => { sc.position.z = 8.6 + Math.sin(t * 0.6) * 0.6; });
    motes(c, box3(-3.4, 0.6, 10, -1.6, 2.4, 11.8), 30, 0xffffff, 0.45);
  } else if (id === 'core') {
    const L = light(-4.6, 1.9, 4.5, 0x6ae08a, 9, 7);
    beam(c, new V3(-4.6, 0.3, 4.5), new V3(-4.6, 3.3, 4.5), 0.75, 0x6ae08a, 0.1);
    motes(c, box3(-6.4, 0.4, 2.6, -2.8, 3, 6.4), 60, 0x9fffb8, 0.55);
    c.anims.push((_dt, t) => { L.intensity = 8 + Math.sin(t * 2.2) * 1.6; });
  } else if (id === 'quarters') {
    light(-4.1, 1.7, -2.6, 0xffb070, 5, 5);
    for (const z of [-5.7, -3.5]) beam(c, new V3(-1.42, 0.95, z + 0.12), new V3(-2.0, 0.6, z + 0.6), 0.32, 0xffd090, 0.12);
    motes(c, box3(-6, 0.3, -5, -2.6, 1.9, -0.5), 40, 0xffe0b0, 0.5);
  } else if (id === 'workshop') {
    light(-2.2, 2.0, -12.6, 0xfff0d0, 5, 4.5);
    beam(c, new V3(-1.32, 2.72, -12.6), new V3(-2.3, 0.9, -12.6), 1.0, 0xfff0d0, 0.16);
    light(-4.4, 3.4, -10.4, 0xffe0a0, 6, 6);
    beam(c, new V3(-4.4, 4.2, -10.4), new V3(-4.4, 0.0, -10.4), 1.7, 0xffe8c0, 0.08);
    steam(c, new V3(-6.85, 0.1, -9.2), 1.6, 12, 0xd0d8dc, 0.3, 4.2);
    motes(c, box3(-6.2, 0.4, -12.5, -2.6, 3.5, -8), 60, 0xfff0d0, 0.5);
  } else if (id === 'mess') {
    light(3.8, 1.9, 3.0, 0xffc078, 6, 5);
    light(6.3, 1.3, 0.9, 0xff7a3a, 2.5, 2.5);
    beam(c, new V3(6.83, 2.93, 2.0), new V3(4.6, 0.0, 2.4), 1.2, 0xffe0b0, 0.13);
    motes(c, box3(2.5, 0.4, 1.5, 6, 2.6, 5), 45, 0xffe0b0, 0.45);
  } else if (id === 'cargo') {
    const L = light(2.4, 2.8, -0.6, 0xffa020, 0, 5);
    c.B.add(cyl(0.1, 0.12, 0.18, 10), c.M.glow('beacon', 0xff9020, 1.6), { x: 2.4, y: 3.15, z: -0.2 });
    c.anims.push((_dt, t) => { L.intensity = Math.max(0, Math.sin(t * 4)) * 4; });
    beam(c, new V3(6.83, 3.0, -3.0), new V3(4.6, 0.0, -3.0), 1.2, 0xfff0d8, 0.13);
    motes(c, box3(2, 0.4, -5.6, 6, 2.8, -0.6), 50, 0xfff0d8, 0.4);
  } else if (id === 'engineering') {
    const L = light(4.1, 2.2, -10.4, 0xff9a40, 11, 9);
    c.anims.push((_dt, t) => { L.intensity = 10 + Math.sin(t * 3.1) * 1.4 + Math.sin(t * 7.3) * 0.7; });
    beam(c, new V3(4.1, 3.78, -10.4), new V3(4.1, 6.0, -10.4), 0.9, 0xffa040, 0.14);
    for (const z of [-11.2, -12.4]) steam(c, new V3(6.55, 2.6, z), 1.0, 10, 0xd8dcdc, 0.3, 3.6);
    steam(c, new V3(1.7, 0.15, -9.0), 1.4, 12, 0xd8dcdc, 0.25, 5.0);
    motes(c, box3(1.6, 0.4, -13, 6.6, 3.5, -7), 70, 0xffc080, 0.55);
  }
}
void stool; void locker; void lp;

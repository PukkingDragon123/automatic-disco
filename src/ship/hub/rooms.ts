// What is in each room: the bridge's main monitor, the command dais, helm and nav; the lab's benches, specimen
// tanks and grow racks; the medbay's beds, vitals and scanner arch; the AI core's pillar and racks; eight bunks
// and lockers in the quarters; the workshop's pod cradle, crane and tool wall; the galley and the long table;
// cargo racks; the reactor. Everything at real sizes against the far walls (see layout.ts), lived in: mugs left
// on consoles, posters, a kid's drawing, plants, cables run along the floor, boots under a bunk.
import * as THREE from 'three';
import { box, cyl, tube, lathe, quad, V3 } from './kit';
import { ROOMS, WALL_H, type RoomId } from './layout';
import { canvas, toTex, cached, rgb, stencilText, hazardTex } from './tex';
import { placeModel } from './models';
import {
  mat, glow, chair, stool, console_, bunk, locker, medBed, table, galley, fridge, shelving, crate, barrel, pipeRun, cable,
  wallLamp, plant, mug, books, toolbox, extinguisher, screenPanel, poster, sign, type Ctx,
} from './props';
import { buildPod } from './pod';
import { beam, motes, steam } from './fx';

const P = Math.PI;
const W_PORT = -1.48, W_STBD = 9.75; // the far x walls' inner faces (port rooms, starboard rooms)
const FX = -P / 2; // a quad facing -x
const ph = (c: Ctx, id: string, x: number, y: number, z: number, ry = 0, s = 1) => placeModel(c.root, id, { x, y, z, ry, s }, c.M.env);

/** stars through a window: deep space with a faint nebula and the planet's limb in some */
function spaceTex(seed: number, limb = false) {
  return cached('space|' + seed + limb, () => {
    const [c, g] = canvas(256, 256);
    const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#04060c'); gr.addColorStop(1, '#0a1020'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    let s = seed * 9301;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 160; i++) { const b = rnd(); g.fillStyle = `rgba(${200 + b * 55},${210 + b * 45},255,${0.3 + b * 0.7})`; g.fillRect(rnd() * 256, rnd() * 256, b > 0.9 ? 2 : 1, b > 0.9 ? 2 : 1); }
    g.fillStyle = 'rgba(80,60,120,0.12)'; g.beginPath(); g.ellipse(80, 120, 120, 40, 0.6, 0, 7); g.fill();
    if (limb) { const pg = g.createRadialGradient(200, 420, 150, 200, 420, 260); pg.addColorStop(0, '#2a4a6a'); pg.addColorStop(0.9, '#5a8aa8'); pg.addColorStop(1, 'rgba(120,180,220,0)'); g.fillStyle = pg; g.beginPath(); g.arc(200, 420, 260, 0, 7); g.fill(); }
    return toTex(c, { repeat: false });
  });
}
/** a window in a wall: frame, mullions, glass glowing faintly with the starfield behind */
function window_(c: Ctx, x: number, y: number, z: number, ry: number, w: number, h: number, seed = 1, limb = false, round = false) {
  const m = c.M.glow('win|' + seed + limb, 0xffffff, 1.0, spaceTex(seed, limb));
  const g = round ? new THREE.CircleGeometry(w / 2, 24) : quad(w, h);
  c.B.add(g, m, { x, y, z, ry });
  c.B.in({ x, y, z, ry }, () => {
    if (round) { c.B.add(new THREE.TorusGeometry(w / 2 + 0.04, 0.06, 8, 28), mat(c, 'gun')); for (let k = 0; k < 8; k++) { const a = (k / 8) * P * 2; c.B.add(cyl(0.025, 0.025, 0.03, 6), mat(c, 'steel'), { x: Math.cos(a) * (w / 2 + 0.04), y: Math.sin(a) * (w / 2 + 0.04), z: 0.06, rx: P / 2 }); } }
    else {
      c.B.add(box(w + 0.16, 0.1, 0.1), mat(c, 'gun'), { y: h / 2 + 0.05, z: 0.03 }); c.B.add(box(w + 0.16, 0.12, 0.14), mat(c, 'gun'), { y: -h / 2 - 0.06, z: 0.05 });
      for (const s of [-1, 1]) c.B.add(box(0.1, h, 0.1), mat(c, 'gun'), { x: s * (w / 2 + 0.03), z: 0.03 });
      const n = Math.max(1, Math.round(w / 1.2));
      for (let k = 1; k < n; k++) c.B.add(box(0.06, h, 0.06), mat(c, 'gun'), { x: -w / 2 + (k * w) / n, z: 0.03 });
    }
  });
}
/** floor tape: a straight band of hazard stripes or a yellow line */
function floorLine(c: Ctx, x0: number, z0: number, x1: number, z1: number, w = 0.08, haz = false) {
  const L = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(L, w); g.rotateX(-P / 2);
  if (haz) { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / (w * 4), uv.getY(i)); }
  const m = haz ? c.M.get('floorhaz', { map: hazardTex(), rough: 0.6, polyOffset: 2, flag: 0 }) : c.M.get('floorline', { color: 0xc89a34, rough: 0.6, polyOffset: 2, flag: 0 });
  c.B.add(g, m, { x: (x0 + x1) / 2, y: 0.004, z: (z0 + z1) / 2, ry: -Math.atan2(z1 - z0, x1 - x0) });
}
function floorText(c: Ctx, s: string, x: number, z: number, w: number, ry = 0, col = 0xc89a34) {
  const t = cached('ft|' + s + col, () => { const [cv, g] = canvas(512, 128); stencilText(g, s, 256, 96, 84, col, { align: 'center', wear: 1.5 }); const tx = toTex(cv, { repeat: false }); return tx; });
  const g = new THREE.PlaneGeometry(w, w / 4); g.rotateX(-P / 2);
  c.B.add(g, c.M.get('ft|' + s + col, { map: t, transparent: true, rough: 0.7, polyOffset: 3, flag: 0 }), { x, y: 0.005, z, ry });
}

// =================================================================================================== rooms
export function furnish(id: RoomId, c: Ctx) {
  ({ bridge, lab, medbay, core, quarters, workshop, mess, cargo, engineering } as Record<RoomId, (c: Ctx) => void>)[id](c);
  atmos(id, c);
}

/** each room's practical accent light, its beams in the haze, dust in the light, steam where something vents */
function atmos(id: RoomId, c: Ctx) {
  const r = ROOMS[id];
  const light = (x: number, y: number, z: number, col: number, k: number, d: number) => { const L = new THREE.PointLight(col, k, d, 1.6); L.position.set(x, y, z); c.root.add(L); c.lights.push(L); return L; };
  const box3 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => new THREE.Box3(new V3(x0, y0, z0), new V3(x1, y1, z1));
  if (id === 'bridge') {
    const L = light(0, 2.1, 25.6, 0x5fd0e0, 9, 10); c.refs.monitorLight = L;
    beam(c, new V3(0, 0.96, 22.2), new V3(0, 2.4, 22.2), 0.9, 0x5fd0e0, 0.12);
    motes(c, box3(-3, 0.5, 20, 3, 3, 26), 70, 0x9fe0f0, 0.5);
    c.anims.push((_dt, t) => { L.intensity = 8 + Math.sin(t * 3.1) * 0.6 + (Math.sin(t * 17) > 0.97 ? 2 : 0); });
  } else if (id === 'lab') {
    const L = light(5.6, 1.5, 15.4, 0x58e08a, 9, 7);
    light(2.5, 1.4, 9.6, 0xc890ff, 3.5, 3.5);
    beam(c, new V3(W_STBD - 0.12, 2.98, 12.6), new V3(8.2, 0.0, 12.6), 1.2, 0xe8fff0, 0.16);
    for (const tx of [4.4, 5.6, 6.8]) beam(c, new V3(tx, 0.32, 16.4), new V3(tx, 2.3, 16.4), 0.42, 0x58e08a, 0.08);
    motes(c, box3(3.5, 0.4, 13.5, 8, 2.8, 16.6), 60, 0xa8ffc8, 0.5);
    c.anims.push((_dt, t) => { L.intensity = 8.5 + Math.sin(t * 0.8) * 0.8; });
  } else if (id === 'medbay') {
    light(-2.9, 2.2, 15.2, 0xf4fff8, 5, 4);
    beam(c, new V3(-2.9, 2.46, 15.2), new V3(-2.9, 0.75, 15.2), 0.75, 0xf8fff8, 0.2);
    const sc = light(-7.4, 1.2, 14.4, 0x5fd0e0, 4, 4);
    c.anims.push((_dt, t) => { sc.position.z = 14.4 + Math.sin(t * 0.6) * 0.7; });
    motes(c, box3(-4, 0.6, 14, -2, 2.4, 16.4), 40, 0xffffff, 0.45);
  } else if (id === 'core') {
    const L = light(-6.2, 1.9, 4.6, 0x6ae08a, 12, 9);
    beam(c, new V3(-6.2, 0.3, 4.6), new V3(-6.2, 3.3, 4.6), 0.9, 0x6ae08a, 0.1);
    motes(c, box3(-8.5, 0.4, 2.5, -4, 3, 7), 70, 0x9fffb8, 0.55);
    c.anims.push((_dt, t) => { L.intensity = 11 + Math.sin(t * 2.2) * 2; });
  } else if (id === 'quarters') {
    light(-6.6, 1.7, -6.2, 0xffb070, 6, 6);
    // a standing lamp by the sofa throws a warm cone
    c.B.add(cyl(0.16, 0.2, 0.04, 12), mat(c, 'dark'), { x: -9.3, y: 0.02, z: -2.4 }); c.B.add(cyl(0.015, 0.015, 1.6, 6), mat(c, 'chrome'), { x: -9.3, y: 0.82, z: -2.4 });
    c.B.add(cyl(0.12, 0.22, 0.24, 14, true), mat(c, 'cream'), { x: -9.3, y: 1.7, z: -2.4 });
    c.B.add(new THREE.CircleGeometry(0.2, 14), glow(c, 0xffd090, 2.4), { x: -9.3, y: 1.58, z: -2.4, rx: Math.PI / 2 });
    light(-9.3, 1.5, -2.4, 0xffc080, 4, 4);
    beam(c, new V3(-9.3, 1.6, -2.4), new V3(-9.0, 0.0, -2.6), 0.75, 0xffc080, 0.18);
    for (const z of [-11.6, -9.2, -4.2, -1.8]) beam(c, new V3(-1.62, 0.95, z + 0.12), new V3(-2.2, 0.6, z + 0.6), 0.35, 0xffd090, 0.12);
    motes(c, box3(-9.8, 0.3, -4, -8.6, 1.8, -1), 30, 0xffe0b0, 0.5);
  } else if (id === 'workshop') {
    light(-2.6, 2.0, -22.8, 0xfff0d0, 6, 5);
    beam(c, new V3(-1.6, 2.72, -22.8), new V3(-2.6, 0.9, -22.8), 1.1, 0xfff0d0, 0.17);
    const pd = light(-6.0, 3.6, -19.8, 0xffe0a0, 7, 7);
    beam(c, new V3(-6.0, 4.4, -19.8), new V3(-6.0, 0.0, -19.8), 2.0, 0xffe8c0, 0.08);
    steam(c, new V3(-9.3, 0.1, -17.6), 1.6, 12, 0xd0d8dc, 0.3, 4.2);
    motes(c, box3(-8, 0.4, -22, -4, 3.5, -17.5), 70, 0xfff0d0, 0.5);
    void pd;
  } else if (id === 'mess') {
    light(5.2, 1.9, 1.5, 0xffc078, 7, 6);
    light(W_STBD - 0.6, 1.3, -2.0, 0xff7a3a, 3, 3);
    steam(c, new V3(W_STBD - 0.3, 1.0, -2.15), 0.8, 10, 0xe0e0e0, 0.32, 2.6);
    steam(c, new V3(W_STBD - 0.45, 1.25, 3.1), 0.5, 8, 0xe0e0e0, 0.25, 2.0);
    beam(c, new V3(W_STBD - 0.12, 2.93, 0.0), new V3(6.4, 0.0, 0.4), 1.4, 0xffe0b0, 0.13);
    motes(c, box3(3.5, 0.4, -1, 8, 2.6, 4), 50, 0xffe0b0, 0.45);
  } else if (id === 'cargo') {
    const L = light(4.0, 2.8, -4.6, 0xffa020, 0, 6);
    c.B.add(cyl(0.1, 0.12, 0.18, 10), c.M.glow('beacon', 0xff9020, 1.6), { x: 4.0, y: 3.1, z: -4.16 });
    c.anims.push((_dt, t) => { L.intensity = Math.max(0, Math.sin(t * 4)) * 5; });
    beam(c, new V3(W_STBD - 0.12, 2.98, -10.6), new V3(6.5, 0.0, -10.6), 1.4, 0xfff0d8, 0.14);
    motes(c, box3(3, 0.4, -14, 8.5, 2.8, -6), 60, 0xfff0d8, 0.4);
  } else if (id === 'engineering') {
    const L = light(6.2, 2.2, -21.6, 0xff9a40, 14, 11);
    c.anims.push((_dt, t) => { L.intensity = 13 + Math.sin(t * 3.1) * 1.5 + Math.sin(t * 7.3) * 0.8; });
    beam(c, new V3(6.2, 4.02, -21.6), new V3(6.2, 6.5, -21.6), 1.0, 0xffa040, 0.14);
    for (const z of [-23.2, -24.4]) steam(c, new V3(W_STBD - 0.4, 2.6, z), 1.0, 10, 0xd8dcdc, 0.3, 3.6);
    steam(c, new V3(2.4, 0.15, -19.0), 1.4, 12, 0xd8dcdc, 0.25, 5.0);
    motes(c, box3(3, 0.4, -25, 9, 3.5, -18), 80, 0xffc080, 0.55);
  }
  void r;
}

function bridge(c: Ctx) {
  const B = c.B;
  // the command dais: a low round platform with a step, guide lights round the edge
  B.add(cyl(1.55, 1.6, 0.18, 32), mat(c, 'dark'), { x: 0, y: 0.09, z: 19.4 });
  B.add(cyl(1.3, 1.3, 0.02, 32), c.M.get('dais', { color: 0x2c3238, rough: 0.5, metal: 0.3 }), { x: 0, y: 0.19, z: 19.4 });
  B.add(new THREE.TorusGeometry(1.52, 0.015, 4, 48), glow(c, 0x6ad0d8, 1.8), { x: 0, y: 0.185, z: 19.4, rx: P / 2 });
  // the captain's chair: tall, leather, with armrest consoles
  chair(c, { x: 0, z: 19.4, seat: 'leather', tall: true });
  B.in({ x: 0, y: 0.18, z: 19.4 }, () => {
    for (const s of [-1, 1]) { B.add(box(0.16, 0.12, 0.5, 0.03), mat(c, 'dark'), { x: s * 0.38, y: 0.68, z: 0.02 }); B.add(box(0.1, 0.01, 0.2), glow(c, s > 0 ? 0x6ad0d8 : 0xe0a040, 1.8), { x: s * 0.38, y: 0.745, z: 0.06 }); }
  });
  mug(c, 0.4, 0.94, 19.6, 'red');
  // helm and nav down in front, chairs at their spots
  console_(c, { x: -1.7, z: 23.85, w: 1.6, screens: ['telemetry', 'radar'], seed: 2 });
  console_(c, { x: 1.7, z: 23.85, w: 1.6, screens: ['nav', 'scan'], seed: 5 });
  chair(c, { x: -1.7, z: 22.9 }); chair(c, { x: 1.7, z: 22.9, ry: 0.2 });
  mug(c, -1.05, 0.79, 24.0, 'white'); ph(c, 'clipboard', 2.3, 0.79, 24.05, 0.4);
  // the main monitor across the bow wall, flanked by two tall status panels and a ticker strip
  const mz = 26.88;
  B.add(box(8.4, 3.0, 0.2, 0.04), mat(c, 'black'), { x: 0, y: 1.95, z: mz - 0.05 });
  B.add(box(8.6, 0.16, 0.34, 0.04), mat(c, 'gun'), { x: 0, y: 0.38, z: mz - 0.12 });
  const mainTex = c.S.make('galaxy', 768, 256, 3);
  const mm = c.M.glow('mainmon', 0xffffff, 1.2, mainTex);
  const mon = new THREE.Mesh(c.bin.g(quad(7.6, 2.55)), mm); mon.position.set(0, 1.98, mz - 0.16); mon.rotation.y = P; c.root.add(mon);
  c.refs.monitor = mon; c.refs.monitorTex = mainTex;
  for (const s of [-1, 1]) screenPanel(c, s < 0 ? 'bars' : 'crew', 0.62, 2.0, { x: s * 4.35, y: 1.75, z: mz - 0.1, ry: P }, 7 + s);
  sign(c, 'UNAA  RV-07  MERIDIAN', 3.2, { x: 0, y: 3.22, z: mz - 0.06, ry: P }, { fg: 0xd8d0b8, size: 56 });
  // the starboard windows (full height side), the port side's low consoles under the cut
  window_(c, 6.45, 1.9, 24.55, Math.atan2(-5, -3) + P, 4.6, 1.7, 3, true);
  window_(c, 7.86, 1.85, 18.9, FX, 2.6, 1.5, 4, false);
  console_(c, { x: 7.25, z: 20.2, ry: -P / 2, w: 1.5, screens: ['crew'], seed: 8, paint: 'gun' });
  chair(c, { x: 6.3, z: 20.2, ry: P / 2 });
  console_(c, { x: -7.35, z: 19.6, ry: P / 2, w: 1.9, screens: ['power', 'reactor'], seed: 11 });
  ph(c, 'potted_plant_04', 7.3, 0, 21.6, 0.3);
  ph(c, 'vintage_spacecraft_instrument', -6.9, 0.79, 21.3, 1.7);
  // floor guides
  floorLine(c, -0.8, 17.2, -0.8, 18.0, 0.06); floorLine(c, 0.8, 17.2, 0.8, 18.0, 0.06);
  cable(c, [new V3(-1.2, 0.02, 23.4), new V3(-0.6, 0.02, 22.0), new V3(-0.5, 0.02, 20.6)], 0.03, 'cableB');
  wallLamp(c, 7.86, 2.95, 21.0, FX, 0xd0e8ff, 0.8);
  // the holo table between the dais and the helm: a pedestal, a lit glass top, the target world turning over it
  B.add(cyl(0.32, 0.45, 0.85, 20), mat(c, 'dark'), { x: 0, y: 0.43, z: 22.2 });
  B.add(cyl(0.95, 0.9, 0.08, 32), mat(c, 'gun'), { x: 0, y: 0.89, z: 22.2 });
  B.add(cyl(0.85, 0.85, 0.02, 32), glow(c, 0x5fb8c8, 0.9), { x: 0, y: 0.94, z: 22.2 });
  const holoM = c.M.glow('holo', 0x7fe0f0, 1.6, null, { transparent: true }); (holoM as THREE.MeshBasicMaterial).opacity = 0.55; (holoM as THREE.MeshBasicMaterial).wireframe = true;
  const holo = new THREE.Mesh(c.bin.g(new THREE.IcosahedronGeometry(0.42, 2)), holoM); holo.position.set(0, 1.55, 22.2); c.root.add(holo);
  const ringH = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.62, 0.01, 4, 48)), glow(c, 0x7fe0f0, 2)); ringH.position.copy(holo.position); ringH.rotation.x = 1.2; c.root.add(ringH);
  c.anims.push((dt, t) => { holo.rotation.y = t * 0.4; ringH.rotation.z = t * 0.25; });
  // a sensors station on the port diagonal, an engineering repeater on the starboard wall
  console_(c, { x: -6.15, z: 24.0, ry: Math.atan2(5, -3) + Math.PI, w: 1.6, screens: ['radar', 'scan'], seed: 21 });
  chair(c, { x: -5.4, z: 23.4, ry: Math.atan2(5, -3) + Math.PI + 0.2 });
  console_(c, { x: 7.25, z: 18.1, ry: -P / 2, w: 1.1, screens: ['power'], seed: 23, paint: 'gun' });
  // suit locker by the door: a glass front with an EVA suit hanging behind it
  B.add(box(1.1, 2.3, 0.7, 0.03), mat(c, 'dark'), { x: -3.4, y: 1.15, z: 17.45 });
  B.add(box(0.95, 2.1, 0.02), mat(c, 'glass'), { x: -3.4, y: 1.18, z: 17.82 });
  B.add(lathe([[0, 0], [0.2, 0.05], [0.26, 0.5], [0.24, 0.9], [0.12, 1.0], [0, 1.0]], 12), mat(c, 'white'), { x: -3.4, y: 0.6, z: 17.5 });
  B.add(new THREE.SphereGeometry(0.17, 14, 10), mat(c, 'white'), { x: -3.4, y: 1.82, z: 17.5 });
  B.add(new THREE.CircleGeometry(0.11, 14), c.M.get('visor', { color: 0x2a3a48, rough: 0.05, metal: 0.8, env: 1.6 }), { x: -3.4, y: 1.82, z: 17.68 });
  for (const s of [-1, 1]) B.add(cyl(0.07, 0.06, 0.65, 8), mat(c, 'white'), { x: -3.4 + s * 0.3, y: 1.15, z: 17.5, rz: s * 0.15 });
  B.add(box(0.5, 0.12, 0.03), mat(c, 'orange'), { x: -3.4, y: 1.35, z: 17.72 });
  sign(c, 'EVA 1', 0.4, { x: -3.4, y: 2.42, z: 17.83 }, { fg: 0xe8e2cc, bg: 0x1d2224, size: 44 });
  // guide strips from the door to the dais and round the lower deck, cable trays under the consoles
  floorLine(c, -0.9, 17.3, -0.9, 18.0, 0.05); floorLine(c, 0.9, 17.3, 0.9, 18.0, 0.05);
  B.add(box(0.06, 0.012, 6.2), glow(c, 0x5fb8c8, 1.2), { x: -2.9, y: 0.006, z: 23.4 }); B.add(box(0.06, 0.012, 6.2), glow(c, 0x5fb8c8, 1.2), { x: 2.9, y: 0.006, z: 23.4 });
  cable(c, [new V3(1.2, 0.02, 23.4), new V3(0.6, 0.02, 22.6), new V3(0.4, 0.02, 21.0)], 0.03, 'cable');
  // a coffee station and a crate of charts by the starboard window
  table(c, { x: 7.2, z: 22.0, w: 0.7, d: 0.6, top: 'gun', h: 0.9 });
  ph(c, 'vintage_electric_kettle', 7.2, 0.9, 21.9, -P / 2);
  mug(c, 7.0, 0.9, 22.15, 'teal'); mug(c, 7.35, 0.9, 22.2, 'white', 2);
  ph(c, 'binder_notebook', 1.2, 0.79, 23.95, 0.3);
  ph(c, 'office_notepads', -2.4, 0.79, 24.0, -0.2);
}

function lab(c: Ctx) {
  const B = c.B;
  // the bench along the hull: cabinets, an epoxy worktop, a shelf of jars, the sequencer screen above
  const x = W_STBD - 0.36;
  B.add(box(0.7, 0.86, 4.8, 0.01), mat(c, 'white'), { x, y: 0.43, z: 10.0 });
  B.add(box(0.76, 0.04, 4.84, 0.01), c.M.get('epoxy', { color: 0x1e2422, rough: 0.3 }), { x: x - 0.02, y: 0.88, z: 10.0 });
  for (let k = 0; k < 8; k++) { B.add(box(0.02, 0.7, 0.56), mat(c, 'white'), { x: x - 0.36, y: 0.45, z: 7.9 + k * 0.6 }); B.add(box(0.03, 0.02, 0.18), mat(c, 'steel'), { x: x - 0.38, y: 0.75, z: 7.9 + k * 0.6 }); }
  B.add(box(0.3, 0.03, 4.4), mat(c, 'white'), { x: W_STBD - 0.15, y: 1.72, z: 10.0 });
  for (let k = 0; k < 14; k++) { const z = 8.0 + k * 0.29; B.add(cyl(0.05, 0.05, 0.16 + (k % 3) * 0.04, 10), c.M.get('jar' + (k % 4), { color: [0x9fd8a8, 0xd8c898, 0xa8c8e0, 0xe0a8a0][k % 4], rough: 0.15, transparent: true, opacity: 0.75 }), { x: W_STBD - 0.15, y: 1.83 + (k % 3) * 0.02, z }); B.add(cyl(0.052, 0.052, 0.03, 10), mat(c, 'black'), { x: W_STBD - 0.15, y: 1.93 + (k % 3) * 0.04, z }); }
  screenPanel(c, 'dna', 1.3, 0.75, { x: W_STBD - 0.02, y: 2.35, z: 9.0, ry: FX }, 1);
  screenPanel(c, 'scan', 1.0, 0.6, { x: W_STBD - 0.02, y: 2.35, z: 11.1, ry: FX }, 2);
  ph(c, 'industrial_microscope', x - 0.05, 0.9, 11.4, -P / 2);
  ph(c, 'chemistry_set', x - 0.02, 0.9, 8.4, -P / 2);
  ph(c, 'bunsen_burner', x - 0.1, 0.9, 9.6, 0.5);
  ph(c, 'retro_multimeter', x - 0.12, 0.9, 12.0, -1.2);
  stool(c, 8.3, 11.4); stool(c, 8.4, 9.4, 0.62);
  mug(c, x - 0.25, 0.9, 10.3, 'teal', 1.2);
  // the hull section where the apple goes through: plain plating, an inspection placard, a porthole beyond
  sign(c, 'HULL  FRAME  14', 0.9, { x: W_STBD - 0.012, y: 2.25, z: 13.9, ry: FX }, { fg: 0x2a302c, size: 40 });
  window_(c, W_STBD - 0.02, 1.6, 15.85, FX, 0.8, 0.8, 7, false, true);
  c.refs.breach = { pos: new V3(ROOMS.lab.spots.hull_breach.p[0], ROOMS.lab.spots.hull_breach.p[1], ROOMS.lab.spots.hull_breach.p[2]), normal: new V3(-1, 0, 0) };
  // specimen tanks against the bow wall: glass columns of lit fluid with something growing inside
  const fz = 16.4;
  [4.4, 5.6, 6.8].forEach((tx, i) => {
    B.add(cyl(0.48, 0.52, 0.32, 24), mat(c, 'gun'), { x: tx, y: 0.16, z: fz });
    B.add(cyl(0.48, 0.48, 0.24, 24), mat(c, 'gun'), { x: tx, y: 2.38, z: fz });
    B.add(cyl(0.4, 0.4, 2.02, 24, true), mat(c, 'glass'), { x: tx, y: 1.31, z: fz });
    const fl = c.M.glow('fluid' + i, [0x58d888, 0x48c8b8, 0x88d858][i], 0.55, null, { transparent: true });
    (fl as THREE.MeshBasicMaterial).opacity = 0.42;
    B.add(cyl(0.38, 0.38, 1.85, 20), fl, { x: tx, y: 1.3, z: fz });
    // the specimen: a curled, hand-shaped body
    B.add(lathe([[0, 0], [0.08, 0.05], [0.14, 0.2], [0.12, 0.38], [0.06, 0.5], [0.0, 0.52]], 10), c.M.get('spec' + i, { color: [0xc89a8a, 0x8a9ac8, 0xa8b878][i], rough: 0.5 }), { x: tx, y: 0.95 + i * 0.05, z: fz, rz: 0.3 * (i - 1), rx: 0.2 });
    for (const s of [-1, 1]) pipeRun(c, [new V3(tx + s * 0.25, 2.5, fz), new V3(tx + s * 0.25, 3.2, fz), new V3(tx + s * 0.25, 3.2, 16.85)], 0.035, i === 1 ? 'pipeG' : 'pipe', 2);
    B.add(box(0.3, 0.12, 0.02), glow(c, 0x6ad08a, 1.6), { x: tx, y: 0.24, z: fz - 0.5 });
  });
  const bub = new THREE.Group(); c.root.add(bub);
  const bm = c.M.glow('bubble', 0xd8fff0, 1.2, null, { transparent: true }); (bm as THREE.MeshBasicMaterial).opacity = 0.6;
  const bg = c.bin.g(new THREE.SphereGeometry(0.025, 6, 4));
  const bubs: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) { const b = new THREE.Mesh(bg, bm); b.userData.x = [4.4, 5.6, 6.8][i % 3] + (Math.random() - 0.5) * 0.4; b.userData.z = fz + (Math.random() - 0.5) * 0.4; b.userData.ph = Math.random(); bub.add(b); bubs.push(b); }
  c.anims.push((dt, t) => { for (const b of bubs) { const u = (t * 0.25 + b.userData.ph) % 1; b.position.set(b.userData.x + Math.sin(t * 2 + b.userData.ph * 9) * 0.03, 0.4 + u * 1.85, b.userData.z); } });
  // the terminal by the door end of the bow wall
  console_(c, { x: 2.75, z: 16.35, ry: P, w: 1.3, screens: ['dna'], seed: 4, paint: 'white' });
  chair(c, { x: 2.75, z: 15.6, ry: P + 0.3 });
  poster(c, 'bio', 0.6, { x: 8.2, y: 2.0, z: 16.86, ry: P });
  // the island: a sample table with the sequencer and a laptop
  table(c, { x: 5.4, z: 10.6, w: 1.0, d: 2.6, h: 0.92, top: 'white' });
  B.add(box(0.5, 0.36, 0.6, 0.03), mat(c, 'white'), { x: 5.4, y: 1.1, z: 9.8 });
  B.add(box(0.3, 0.04, 0.02), glow(c, 0x6ad0d8, 2.2), { x: 5.1, y: 1.16, z: 9.8, ry: P / 2 });
  ph(c, 'classic_laptop', 5.3, 0.92, 11.2, -P / 2 + 0.3);
  ph(c, 'magnifying_glass_01', 5.6, 0.92, 11.7, 1.0);
  for (let k = 0; k < 10; k++) B.add(cyl(0.015, 0.015, 0.12, 6), c.M.get('tube' + (k % 3), { color: [0xd85a4a, 0x5ab8d8, 0xd8c84a][k % 3], rough: 0.3 }), { x: 5.62, y: 0.98, z: 10.2 + k * 0.05 });
  stool(c, 4.6, 10.4); stool(c, 4.6, 11.4);
  // a grow rack (seedlings under lamps) by the low corridor wall
  shelving(c, { x: 2.2, z: 9.6, ry: P / 2, w: 2.2, h: 1.9, d: 0.6, levels: 3, paint: 'white' });
  for (const y of [0.13, 0.98]) for (let k = 0; k < 4; k++) plant(c, 2.2, y + 0.02, 8.8 + k * 0.52, 0.65, k + 3 + Math.round(y * 5), 'plasticW');
  for (const y of [0.9, 1.75]) c.B.add(box(0.05, 0.02, 2.0), glow(c, 0xd8a0ff, 2.0), { x: 2.2, y, z: 9.6 });
  ph(c, 'potted_plant_01', 8.9, 0, 15.2, 0.8);
  ph(c, 'potted_plant_02', 3.0, 0, 7.6, 2.0);
  cable(c, [new V3(5.4, 0.02, 9.4), new V3(5.0, 0.02, 8.4), new V3(6.5, 0.02, 7.6), new V3(9.3, 0.02, 7.6)], 0.025, 'cableY');
  wallLamp(c, W_STBD - 0.02, 3.0, 12.6, FX, 0xe0fff0, 0.9);
}

function medbay(c: Ctx) {
  const B = c.B;
  medBed(c, { x: -1.6, z: 10.7 }); medBed(c, { x: -1.6, z: 15.2 });
  screenPanel(c, 'ekg', 0.7, 0.45, { x: W_PORT - 0.02, y: 1.75, z: 11.55, ry: FX }, 1);
  screenPanel(c, 'ekg', 0.7, 0.45, { x: W_PORT - 0.02, y: 1.75, z: 14.35, ry: FX }, 2);
  // a surgical lamp on an arm over bed two
  B.add(box(0.12, 0.12, 0.12), mat(c, 'white'), { x: W_PORT - 0.06, y: 2.9, z: 15.2 });
  B.add(box(1.4, 0.07, 0.07), mat(c, 'white'), { x: -2.2, y: 2.85, z: 15.2, rz: -0.15 });
  B.add(cyl(0.38, 0.32, 0.14, 20), mat(c, 'white'), { x: -2.9, y: 2.55, z: 15.2 });
  B.add(new THREE.CircleGeometry(0.3, 20), glow(c, 0xf8fff8, 2.4), { x: -2.9, y: 2.47, z: 15.2, rx: P / 2 });
  // a privacy screen between the beds
  for (let k = 0; k < 3; k++) { B.add(box(0.03, 1.7, 0.03), mat(c, 'chrome'), { x: -1.8 - k * 0.6, y: 0.85, z: 12.95 }); }
  B.add(box(1.2, 1.3, 0.02), c.M.get('curtain', { color: 0x9ac0bc, rough: 0.9 }), { x: -2.4, y: 1.0, z: 12.95 });
  // the scanner arch over its table
  const ax = -7.4, az = 14.4;
  B.add(box(0.7, 0.75, 2.0, 0.04), mat(c, 'white'), { x: ax, y: 0.375, z: az, ry: 0 });
  B.add(box(0.62, 0.08, 1.9, 0.04), mat(c, 'mattress'), { x: ax, y: 0.79, z: az });
  const arch = new THREE.Group(); arch.position.set(ax, 0, az); c.root.add(arch);
  const ringG = c.bin.g(new THREE.TorusGeometry(1.0, 0.12, 12, 40, P * 1.2));
  const ring = new THREE.Mesh(ringG, mat(c, 'white')); ring.rotation.set(0, P / 2, -0.1 * P); ring.position.y = 0.55; ring.castShadow = true; arch.add(ring);
  const strip = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.89, 0.02, 4, 40, P * 1.2)), glow(c, 0x6ad0d8, 2.4)); strip.rotation.copy(ring.rotation); strip.position.y = 0.55; arch.add(strip);
  c.anims.push((dt, t) => { const z = Math.sin(t * 0.6) * 0.7; ring.position.z = z; strip.position.z = z; });
  B.add(box(1.0, 0.1, 0.24), mat(c, 'gun'), { x: ax, y: 0.05, z: az - 1.15 }); B.add(box(1.0, 0.1, 0.24), mat(c, 'gun'), { x: ax, y: 0.05, z: az + 1.15 });
  // cabinets along the bow wall: tall white units, a counter with a sink, a glass-fronted shelf
  for (let k = 0; k < 3; k++) { const x = -9.3 + k * 0.62; B.add(box(0.6, 2.0, 0.5, 0.015), mat(c, 'white'), { x, y: 1.0, z: 16.66 }); B.add(box(0.02, 0.18, 0.03), mat(c, 'steel'), { x: x + 0.22, y: 1.0, z: 16.4 }); }
  sign(c, '+', 0.3, { x: -8.7, y: 1.6, z: 16.4, ry: P }, { fg: 0xb8382e, size: 120, font: "'Jersey', monospace" });
  B.add(box(2.2, 0.9, 0.6, 0.01), mat(c, 'white'), { x: -6.1, y: 0.45, z: 16.6 });
  B.add(box(2.24, 0.04, 0.64), mat(c, 'steel'), { x: -6.1, y: 0.92, z: 16.6 });
  B.add(box(0.5, 0.03, 0.4), mat(c, 'black'), { x: -6.6, y: 0.93, z: 16.6 });
  B.add(box(2.2, 0.7, 0.3, 0.01), mat(c, 'white'), { x: -6.1, y: 1.9, z: 16.75 });
  B.add(box(2.1, 0.6, 0.02), mat(c, 'glass'), { x: -6.1, y: 1.9, z: 16.59 });
  ph(c, 'medical_box', -5.5, 0.94, 16.6, P);
  ph(c, 'medical_tape', -5.0, 0.94, 16.5, 0.4);
  ph(c, 'plastic_container', -6.9, 0.94, 16.6, 0.2);
  poster(c, 'firstaid', 0.55, { x: -4.2, y: 1.8, z: 16.88, ry: P });
  poster(c, 'eye', 0.5, { x: -3.3, y: 1.8, z: 16.88, ry: P });
  // the doctor's desk by the aft wall
  table(c, { x: -7.6, z: 9.7, w: 1.6, d: 0.7, top: 'white' });
  chair(c, { x: -7.6, z: 10.4, ry: P });
  ph(c, 'classic_laptop', -7.5, 0.75, 9.7, 0.2);
  mug(c, -8.1, 0.75, 9.8, 'white');
  ph(c, 'wheelchair_01', -4.6, 0, 9.9, 2.4);
  ph(c, 'potted_plant_04', -9.2, 0, 12.0, 1.0);
  wallLamp(c, W_PORT - 0.02, 2.95, 13.0, FX, 0xffffff, 1.0);
}

function core(c: Ctx) {
  const B = c.B;
  // server racks along the corridor wall, either side of the door: LED faces glowing
  const led = cached('ledface', () => {
    const [cv, g] = canvas(64, 256); g.fillStyle = '#0c0f0e'; g.fillRect(0, 0, 64, 256);
    for (let y = 6; y < 250; y += 9) { g.fillStyle = '#1c2220'; g.fillRect(4, y, 56, 7); for (let x = 8; x < 56; x += 5) { const r = Math.sin(x * 12.9 + y * 78.2) * 43758.5; const v = r - Math.floor(r); g.fillStyle = v > 0.82 ? '#e0a040' : v > 0.35 ? '#6ad08a' : '#1a3a24'; g.fillRect(x, y + 2, 3, 2); } }
    return toTex(cv, { repeat: false });
  });
  const lm = c.M.glow('led', 0xffffff, 1.3, led);
  for (const z of [1.75, 2.42, 3.09, 3.76, 6.25, 6.92, 7.59, 8.26]) {
    B.add(box(0.95, 2.1, 0.62, 0.015), mat(c, 'black'), { x: W_PORT - 0.48, y: 1.05, z });
    B.add(quad(0.5, 1.8), lm, { x: W_PORT - 0.96, y: 1.08, z, ry: FX });
    B.add(box(0.02, 1.9, 0.04), mat(c, 'chrome'), { x: W_PORT - 0.97, y: 1.05, z: z + 0.27 });
    cable(c, [new V3(W_PORT - 0.6, 2.1, z), new V3(W_PORT - 0.6, 2.6, z), new V3(W_PORT - 0.3, 3.1, z)], 0.03, 'cableB');
  }
  // the core: a stepped round plinth, a glass column, the green heart, two rings turning against each other
  const cx = ROOMS.core.spots.core.p[0], cz = ROOMS.core.spots.core.p[2];
  B.add(cyl(1.7, 1.8, 0.16, 40), mat(c, 'dark'), { x: cx, y: 0.08, z: cz });
  B.add(cyl(1.25, 1.3, 0.14, 40), mat(c, 'gun'), { x: cx, y: 0.23, z: cz });
  B.add(new THREE.TorusGeometry(1.72, 0.015, 4, 60), glow(c, 0x6ad08a, 2.2), { x: cx, y: 0.165, z: cz, rx: P / 2 });
  B.add(cyl(0.7, 0.8, 0.5, 24), mat(c, 'dark'), { x: cx, y: 0.55, z: cz });
  B.add(cyl(0.72, 0.6, 0.3, 24), mat(c, 'dark'), { x: cx, y: 3.05, z: cz });
  B.add(cyl(0.5, 0.5, 2.3, 24, true), mat(c, 'glass'), { x: cx, y: 1.95, z: cz });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * P * 2; B.add(box(0.06, 2.3, 0.06), mat(c, 'gun'), { x: cx + Math.cos(a) * 0.52, y: 1.95, z: cz + Math.sin(a) * 0.52 }); }
  const heartM = c.M.live(0x7fe0a0, 2.2);
  const heart = new THREE.Mesh(c.bin.g(new THREE.IcosahedronGeometry(0.3, 1)), heartM); heart.position.set(cx, 1.95, cz); c.root.add(heart);
  const r1 = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.42, 0.025, 6, 40)), glow(c, 0x9ff0b8, 2.0)); r1.position.copy(heart.position); c.root.add(r1);
  const r2 = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.36, 0.02, 6, 40)), glow(c, 0x6ad08a, 2.0)); r2.position.copy(heart.position); c.root.add(r2);
  c.refs.coreHeart = heartM;
  c.anims.push((dt, t) => {
    r1.rotation.set(t * 0.7, t * 0.4, 0); r2.rotation.set(-t * 0.5, 0, t * 0.9); heart.rotation.y = t * 0.3;
    heart.scale.setScalar(1 + Math.sin(t * 2.2) * 0.04);
    if (!c.refs.coreTalk) heartM.color.setHex(0x7fe0a0).multiplyScalar(1.8 + Math.sin(t * 2.2) * 0.4);
  });
  // cables from the racks across the floor to the plinth
  for (const [z, col] of [[2.4, 'cableB'], [3.2, 'cable'], [6.6, 'cableY'], [7.4, 'cable']] as [number, string][]) cable(c, [new V3(W_PORT - 0.95, 0.03, z), new V3(-3.4, 0.03, z * 0.7 + cz * 0.3), new V3(cx + 0.9, 0.03, cz + (z - cz) * 0.4)], 0.04, col);
  // the operator's console facing the aft... bow wall, with Unit 07's eye above
  console_(c, { x: -3.8, z: 8.35, ry: P, w: 2.0, screens: ['wave', 'bars'], seed: 13, paint: 'dark' });
  chair(c, { x: -3.8, z: 7.4, ry: P });
  screenPanel(c, 'eye', 1.1, 0.8, { x: -6.6, y: 2.2, z: 8.9, ry: P }, 3);
  ph(c, 'circuit_board', -4.4, 0.79, 8.4, 0.6);
  mug(c, -3.0, 0.79, 8.3, 'dark');
  sign(c, 'UNIT 07', 1.4, { x: -8.4, y: 2.9, z: 8.9, ry: P }, { fg: 0x6ad08a, size: 64, glow: true });
}

function quarters(c: Ctx) {
  const B = c.B;
  const units: [number, number][] = [[-10.7, 1], [-8.3, 2], [-3.3, 3], [-0.9, 4]];
  for (const [z, s] of units) bunk(c, { x: -2.0, z, seed: s });
  // between the bunk pairs and at the ends: small shelves of personal things, posters on the wall above
  ph(c, 'alarm_clock_01', -1.75, 1.02, -11.6, -P / 2 - 0.3);
  ph(c, 'portable_cassette_player', -2.3, 0.62, -7.6, 0.3);
  ph(c, 'gamepad', -2.1, 1.95, -9.6, 1.1);
  ph(c, 'round_spectacles', -1.8, 0.6, -2.6, 0.4);
  ph(c, 'decorative_book_set_01', -1.85, 1.95, -0.1, P / 2);
  ph(c, 'standing_picture_frame_01', -1.7, 1.02, -4.1, -P / 2);
  ph(c, 'rubber_boots', -2.9, 0, -9.6, 0.3);
  ph(c, 'rubber_boots', -2.85, 0, -2.1, -0.4);
  poster(c, 'band', 0.55, { x: W_PORT - 0.01, y: 2.95, z: -9.5, ry: FX, rz: 0.03 });
  poster(c, 'pinup', 0.42, { x: W_PORT - 0.01, y: 1.2, z: -6.95, ry: FX, rz: -0.04 });
  poster(c, 'kid', 0.4, { x: W_PORT - 0.01, y: 1.15, z: -4.55, ry: FX, rz: 0.05 });
  poster(c, 'earth', 0.55, { x: W_PORT - 0.01, y: 2.95, z: -2.1, ry: FX });
  // lockers along the bow wall
  for (let i = 0; i < 8; i++) locker(c, { x: -9.3 + i * 0.55, z: 0.66, ry: P, n: i + 1, paint: i % 3 === 1 ? 'olive' : 'grey' });
  poster(c, 'calendar', 0.45, { x: -4.6, y: 1.55, z: 0.9, ry: P });
  poster(c, 'unaa', 0.6, { x: -3.6, y: 1.8, z: 0.9, ry: P });
  // the common corner: a low sofa under the cut hull wall, a rug, a table with cards and mugs
  const sx = -9.25;
  B.add(box(0.85, 0.42, 2.6, 0.06), mat(c, 'seat'), { x: sx, y: 0.21, z: -4.3 });
  B.add(box(0.25, 0.5, 2.6, 0.08), mat(c, 'seat'), { x: sx - 0.32, y: 0.62, z: -4.3 });
  for (const s of [-1, 1]) B.add(box(0.85, 0.55, 0.2, 0.06), mat(c, 'seat'), { x: sx, y: 0.3, z: -4.3 + s * 1.38 });
  ph(c, 'throw_pillows_01', sx + 0.05, 0.42, -4.9, P / 2);
  const rug = new THREE.PlaneGeometry(3.2, 2.4); rug.rotateX(-P / 2);
  B.add(rug, c.M.get('rug', { map: cached('rugtex', () => { const [cv, g] = canvas(256, 192); g.fillStyle = '#6a3a2a'; g.fillRect(0, 0, 256, 192); g.strokeStyle = '#c8a050'; g.lineWidth = 6; g.strokeRect(12, 12, 232, 168); g.strokeStyle = '#2a4a5a'; g.lineWidth = 3; g.strokeRect(26, 26, 204, 140); for (let i = 0; i < 6; i++) { g.fillStyle = '#c8a050'; g.beginPath(); g.moveTo(128, 50 + i * 16); g.lineTo(150, 62 + i * 16); g.lineTo(128, 74 + i * 16); g.lineTo(106, 62 + i * 16); g.fill(); } return toTex(cv, { repeat: false }); }), rough: 0.95, polyOffset: 1, flag: 0 }), { x: -6.6, y: 0.006, z: -6.0 });
  table(c, { x: -6.6, z: -6.2, w: 1.2, d: 0.9, top: 'woodD' });
  for (const [dx, dz, r] of [[0, -0.85, 0], [0, 0.85, P], [-0.85, 0, P / 2]] as [number, number, number][]) chair(c, { x: -6.6 + dx, z: -6.2 + dz, ry: r, seat: 'seatR' });
  mug(c, -6.9, 0.75, -6.4, 'orange', 0.5); mug(c, -6.3, 0.75, -5.9, 'white', 2.1);
  for (let k = 0; k < 5; k++) B.add(box(0.063, 0.004, 0.088), mat(c, k % 2 ? 'cream' : 'white'), { x: -6.5 + k * 0.05, y: 0.752 + k * 0.001, z: -6.1 + (k % 3) * 0.03, ry: k * 0.4 });
  ph(c, 'portable_cassette_player', -6.2, 0.75, -6.55, 2.6);
  books(c, -9.4, 0.42, -3.0, 4, 0, 3);
  ph(c, 'potted_plant_02', -9.3, 0, -1.2, 0.6);
  // a laundry sack and a guitar case leaning on the lockers
  B.add(lathe([[0, 0], [0.25, 0.05], [0.28, 0.3], [0.2, 0.55], [0.05, 0.62], [0, 0.6]], 10), c.M.get('sack', { color: 0x8a8a70, rough: 0.95 }), { x: -4.8, y: 0, z: 0.2 });
  B.add(box(0.36, 1.05, 0.12, 0.05), c.M.get('case', { color: 0x2a2224, rough: 0.6 }), { x: -5.1, y: 0.52, z: 0.25, rz: 0.18, ry: 0.1 });
  wallLamp(c, W_PORT - 0.02, 3.0, -6.0, FX, 0xffd8a0, 0.8);
}

function workshop(c: Ctx) {
  const B = c.B;
  const px = ROOMS.workshop.spots.pod_cradle.p[0], pz = ROOMS.workshop.spots.pod_cradle.p[2];
  // the drop hatch in the deck (two leaves that open downward for the launch), the cradle ring over it
  const hatch = new THREE.Group(); hatch.position.set(px, 0, pz); c.root.add(hatch);
  const leaves: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(s * 1.5, 0.0, 0); hatch.add(hinge);
    const leaf = new THREE.Mesh(c.bin.g(box(1.5, 0.08, 3.0, 0.01)), c.M.get('hatchleaf', { map: hazardTex(), rough: 0.6, metal: 0.3 }));
    leaf.position.set(-s * 0.75, -0.035, 0); leaf.receiveShadow = true; hinge.add(leaf); leaves.push(hinge);
  }
  const pit = new THREE.Mesh(c.bin.g(new THREE.BoxGeometry(3.0, 0.02, 3.0)), c.M.glow('pit', 0x050608, 1)); pit.position.set(px, -1.2, pz); c.root.add(pit);
  c.refs.hatch = (k: number) => { leaves.forEach((h, i) => { h.rotation.z = (i === 0 ? 1 : -1) * k * 1.45; }); pit.visible = k > 0.01; };
  c.refs.hatch(0);
  B.add(new THREE.TorusGeometry(1.75, 0.09, 8, 48), mat(c, 'yellow'), { x: px, y: 0.06, z: pz, rx: P / 2 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * P * 2 + P / 4;
    B.in({ x: px + Math.cos(a) * 1.55, z: pz + Math.sin(a) * 1.55, ry: -a + P / 2 }, () => {
      B.add(box(0.3, 0.5, 0.4, 0.03), mat(c, 'dark'), { y: 0.25 });
      B.add(box(0.14, 0.12, 0.5, 0.02), mat(c, 'yellow'), { y: 0.5, z: -0.3 });
    });
  }
  floorLine(c, px - 2.3, pz - 2.3, px + 2.3, pz - 2.3, 0.22, true); floorLine(c, px - 2.3, pz + 2.3, px + 2.3, pz + 2.3, 0.22, true);
  floorLine(c, px - 2.3, pz - 2.3, px - 2.3, pz + 2.3, 0.22, true); floorLine(c, px + 2.3, pz - 2.3, px + 2.3, pz + 2.3, 0.22, true);
  floorText(c, 'POD BAY', px, pz + 3.0, 2.2, P);
  // the pod itself
  const pod = buildPod(c.bin, c.M); pod.root.position.set(px, 0.0, pz); c.root.add(pod.root);
  c.refs.pod = pod; c.anims.push((dt, t) => pod.update(dt, t));
  // the gantry crane: four yellow posts, two runway beams, a bridge with a hoist over the cradle
  const cy = 4.3;
  for (const x of [-9.4, -2.3]) for (const z of [-26.3, -13.0]) B.add(box(0.22, cy, 0.22, 0.02), mat(c, 'yellow'), { x, y: cy / 2, z });
  for (const x of [-9.4, -2.3]) { B.add(box(0.26, 0.34, 13.6, 0.02), mat(c, 'yellow'), { x, y: cy + 0.17, z: -19.65 }); }
  const bridgeG = new THREE.Group(); bridgeG.position.set(0, 0, pz); c.root.add(bridgeG);
  const bb = new THREE.Mesh(c.bin.g(box(7.4, 0.3, 0.36, 0.02)), mat(c, 'yellow')); bb.position.set(-5.85, cy + 0.5, 0); bb.castShadow = true; bridgeG.add(bb);
  const hoist = new THREE.Mesh(c.bin.g(box(0.6, 0.4, 0.6, 0.03)), mat(c, 'dark')); hoist.position.set(px, cy + 0.15, 0); bridgeG.add(hoist);
  const rope = new THREE.Mesh(c.bin.g(cyl(0.015, 0.015, 1, 6)), mat(c, 'black')); bridgeG.add(rope);
  const hook = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(0.1, 0.03, 6, 12, P * 1.5)), mat(c, 'steel')); bridgeG.add(hook);
  // parked over the aft end; the intro can run it over the cradle (refs.crane.moveTo(z), setHook(y))
  let hookY = 3.1, craneZ = -25.2, craneGoal = -25.2;
  c.refs.crane = { setHook(y: number) { hookY = y; }, moveTo(z: number) { craneGoal = z; }, get z() { return craneZ; } };
  c.anims.push((dt, t) => {
    craneZ += Math.sign(craneGoal - craneZ) * Math.min(Math.abs(craneGoal - craneZ), dt * 1.2);
    const y = hookY + Math.sin(t * 0.5) * 0.03; rope.position.set(px, (cy + y) / 2, 0); rope.scale.y = cy - y; hook.position.set(px, y - 0.1, 0); bridgeG.position.z = craneZ;
  });
  sign(c, 'SWL 4T', 0.6, { x: -6.4, y: cy + 0.5, z: pz - 0.19, ry: P }, { fg: 0x1c1b18, size: 48 });
  // the workbench, vice and tools, the tool wall above it
  const bx = W_PORT - 0.45;
  B.add(box(0.85, 0.08, 2.6, 0.02), mat(c, 'woodD'), { x: bx, y: 0.92, z: -22.8 });
  B.add(box(0.8, 0.84, 2.5, 0.02), mat(c, 'olive'), { x: bx + 0.02, y: 0.44, z: -22.8 });
  for (let k = 0; k < 4; k++) B.add(box(0.02, 0.18, 0.56), mat(c, 'olive'), { x: bx - 0.39, y: 0.68 - (k % 2) * 0.22, z: -23.7 + Math.floor(k / 2) * 1.8 });
  ph(c, 'bench_vice_01', bx - 0.1, 0.96, -21.8, -P / 2);
  ph(c, 'adjustable_wrench', bx - 0.05, 0.96, -22.6, 1.2);
  ph(c, 'cross_pein_hammer', bx - 0.15, 0.96, -23.2, 0.4);
  ph(c, 'pliers', bx, 0.96, -23.6, 2.0);
  ph(c, 'screwdriver', bx - 0.2, 0.96, -22.9, 0.7);
  mug(c, bx - 0.25, 0.96, -24.0, 'orange');
  const tw = cached('toolwall', () => {
    const [cv, g] = canvas(512, 256); g.fillStyle = '#4a4c3a'; g.fillRect(0, 0, 512, 256);
    for (let y = 8; y < 256; y += 16) for (let x = 8; x < 512; x += 16) { g.fillStyle = '#26281e'; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill(); }
    // painted shadow board outlines with tools hung on them
    const tools: [number, number, number, number, string][] = [[40, 40, 22, 150, 'w'], [90, 30, 18, 170, 'w'], [140, 50, 70, 26, 'h'], [140, 110, 60, 22, 'h'], [240, 30, 26, 120, 's'], [290, 30, 20, 110, 's'], [330, 30, 18, 100, 's'], [380, 60, 90, 40, 'd'], [380, 140, 100, 30, 'c']];
    for (const [x, y, w, h, k] of tools) {
      g.fillStyle = '#d8d0b0'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
      g.fillStyle = k === 'h' ? '#8a3a2a' : k === 'd' ? '#c8a03a' : k === 'c' ? '#3a5a8a' : '#a8acaa';
      g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x, y, w, 3);
    }
    stencilText(g, 'TOOLS  RETURN AFTER USE', 256, 236, 18, 0xd8d0b0, { align: 'center' });
    return toTex(cv, { repeat: false });
  });
  B.add(quad(2.5, 1.25), c.M.get('toolwall', { map: tw, rough: 0.8 }), { x: W_PORT - 0.01, y: 1.85, z: -22.8, ry: FX });
  ph(c, 'metal_tool_chest', W_PORT - 0.45, 0, -25.4, -P / 2);
  ph(c, 'portable_welding_cart', -4.2, 0, -16.2, 0.4);
  ph(c, 'korean_fire_extinguisher_01', W_PORT - 0.25, 0, -20.6, -P / 2);
  ph(c, 'tool_cart', -3.4, 0, -24.8, 1.3);
  // racks of pod parts along the bow wall, gas bottles in a cage, jerrycans
  const sh = shelving(c, { x: -6.8, z: -12.42, ry: P, w: 3.6, h: 2.6, d: 0.6, levels: 4 });
  sh.levels.forEach((y, i) => { for (let k = 0; k < 3; k++) crate(c, { x: -8.0 + k * 1.15, y, z: -12.42, w: 0.7 + (k % 2) * 0.2, h: 0.36, d: 0.48, kind: (['grey', 'olive', 'orange'] as const)[(i + k) % 3] }); });
  for (let k = 0; k < 4; k++) B.add(cyl(0.13, 0.13, 1.4, 14), mat(c, ['blue', 'pipeG', 'red', 'blue'][k]), { x: -9.45, y: 0.7, z: -16.2 + k * 0.32 });
  B.add(box(0.36, 1.2, 1.4), c.M.get('cage', { color: 0x3a3c2c, rough: 0.6, metal: 0.4, transparent: true, opacity: 0.0 }), { x: -9.45, y: 0.6, z: -15.7 });
  ph(c, 'metal_jerrycan', -9.3, 0, -26.2, 0.2); ph(c, 'portable_generator', -8.6, 0, -25.9, 0.5);
  poster(c, 'tools', 0.6, { x: W_PORT - 0.01, y: 1.85, z: -20.7, ry: FX });
  poster(c, 'safety', 0.55, { x: -4.2, y: 2.0, z: -12.08, ry: P });
  // the hangar door in the port hull (the cut wall): heavy jambs and a lit lintel post either side
  for (const z of [-24.6, -15.0]) { B.add(box(0.7, 1.4, 0.4, 0.03), mat(c, 'yellow'), { x: -9.7, y: 0.7, z }); B.add(box(0.05, 0.3, 0.1), glow(c, 0xe0503a, 2.2), { x: -9.33, y: 1.2, z }); }
  floorLine(c, -9.2, -24.4, -9.2, -15.2, 0.12, true);
  cable(c, [new V3(-4.2, 0.03, -16.0), new V3(-5.0, 0.03, -17.4), new V3(-4.7, 0.03, -18.4)], 0.03, 'cableR');
  wallLamp(c, W_PORT - 0.02, 2.75, -22.8, FX, 0xfff0d0, 1.2);
}

function mess(c: Ctx) {
  const B = c.B;
  galley(c, W_STBD - 0.31, -3.7, 2.5);
  // coffee station and the fridge toward the bow
  B.add(box(0.62, 0.9, 1.5, 0.01), mat(c, 'dark'), { x: W_STBD - 0.31, y: 0.45, z: 3.4 });
  B.add(box(0.66, 0.04, 1.54), mat(c, 'woodD'), { x: W_STBD - 0.33, y: 0.92, z: 3.4 });
  B.add(box(0.4, 0.5, 0.36, 0.03), mat(c, 'steel'), { x: W_STBD - 0.3, y: 1.19, z: 3.1 });
  B.add(box(0.1, 0.05, 0.02), glow(c, 0xe0503a, 2.2), { x: W_STBD - 0.51, y: 1.3, z: 3.1, ry: P / 2 });
  ph(c, 'vintage_electric_kettle', W_STBD - 0.35, 0.94, 3.75, -P / 2);
  for (let k = 0; k < 4; k++) mug(c, W_STBD - 0.48, 0.94, 3.55 + k * 0.1, ['white', 'red', 'teal', 'orange'][k], k);
  fridge(c, W_STBD - 0.38, 4.75);
  ph(c, 'vintage_microwave', W_STBD - 0.32, 0.9, 1.9, -P / 2);
  screenPanel(c, 'galley', 0.5, 0.32, { x: W_STBD - 0.02, y: 1.45, z: -2.2, ry: FX }, 1);
  ph(c, 'pot_enamel_01', W_STBD - 0.3, 0.92, -2.15, 0.3);
  // pantry shelves on the bow wall with tins and jars, the menu board
  const sh = shelving(c, { x: 7.4, z: 6.62, ry: P, w: 1.8, h: 2.0, d: 0.45, levels: 4, paint: 'white' });
  sh.levels.slice(1).forEach((y, i) => { ph(c, i % 2 ? 'russian_food_cans_01' : 'long_life_food', 6.9, y, 6.62, P); ph(c, 'plastic_thermos', 7.9 - i * 0.15, y, 6.6, 0.4); });
  poster(c, 'menu', 0.6, { x: 5.4, y: 1.8, z: 6.86, ry: P });
  poster(c, 'safety', 0.45, { x: 4.4, y: 1.75, z: 6.86, ry: P, rz: 0.02 });
  // the long table and benches
  table(c, { x: 5.2, z: 1.5, w: 1.0, d: 3.4, h: 0.76, top: 'wood' });
  for (const s of [-1, 1]) { B.add(box(0.36, 0.06, 3.2, 0.02), mat(c, 'wood'), { x: 5.2 + s * 0.9, y: 0.45, z: 1.5 }); for (const dz of [-1.3, 1.3]) B.add(box(0.06, 0.42, 0.3), mat(c, 'gun'), { x: 5.2 + s * 0.9, y: 0.21, z: 1.5 + dz }); }
  ph(c, 'wooden_bowl_01', 5.2, 0.76, 1.5, 0);
  for (const [dx, dz, r] of [[0.0, 0.0, 0], [0.07, 0.06, 1], [-0.06, 0.05, 2], [0.02, -0.07, 3]] as [number, number, number][]) ph(c, 'food_apple_01', 5.2 + dx, 0.8, 1.5 + dz, r);
  ph(c, 'bananas', 5.3, 0.76, 2.4, 0.8);
  ph(c, 'tea_set_01', 5.05, 0.76, 0.5, 0.3);
  for (const [z, s] of [[0.3, -1], [1.5, 1], [2.7, -1]] as [number, number][]) { B.add(cyl(0.12, 0.1, 0.015, 16), mat(c, 'ceramic'), { x: 5.2 + s * 0.3, y: 0.768, z }); mug(c, 5.2 + s * 0.3 + 0.14, 0.76, z + 0.12, ['white', 'red'][Math.abs(s) % 2]); }
  B.add(cyl(0.03, 0.03, 0.16, 8), mat(c, 'red'), { x: 5.1, y: 0.84, z: 1.1 });
  // a trash bin, a water dispenser, a plant on the low wall
  B.add(cyl(0.22, 0.2, 0.7, 14), mat(c, 'steel'), { x: 2.0, y: 0.35, z: -3.4 });
  B.add(box(0.34, 1.1, 0.34, 0.02), mat(c, 'plasticW'), { x: 9.3, y: 0.55, z: 6.3 }); B.add(cyl(0.15, 0.15, 0.42, 14), c.M.get('water', { color: 0x8ac0d8, rough: 0.05, transparent: true, opacity: 0.6 }), { x: 9.3, y: 1.31, z: 6.3 });
  ph(c, 'potted_plant_04', 2.0, CUT_PLANT, 5.6, 0.4);
  wallLamp(c, W_STBD - 0.02, 2.95, 0.0, FX, 0xffe0b0, 1.0);
}
const CUT_PLANT = 0;

function cargo(c: Ctx) {
  const B = c.B;
  // two heavy racks along the hull, loaded
  for (const z of [-12.6, -8.6]) {
    const sh = shelving(c, { x: W_STBD - 0.48, z, ry: -P / 2, w: 3.6, h: 2.9, d: 0.9, levels: 4 });
    sh.levels.forEach((y, i) => { for (let k = 0; k < 3; k++) { if ((i + k + z) % 5 === 0) continue; crate(c, { x: W_STBD - 0.48, y, z: z - 1.15 + k * 1.15, w: 0.8, h: 0.5 + ((i + k) % 2) * 0.1, d: 0.7, ry: -P / 2, kind: (['olive', 'grey', 'white', 'blue'] as const)[(i * 3 + k) % 4], label: i === 0 ? ['RATIONS', 'SPARES', 'SEEDS'][k] : undefined }); } });
  }
  // pallets and stacked crates in the middle, strapped
  for (const [x, z, n] of [[5.0, -12.6, 3], [5.2, -10.2, 2], [3.4, -13.2, 1]] as [number, number, number][]) {
    B.add(box(1.2, 0.14, 1.0, 0.01), mat(c, 'wood'), { x, y: 0.07, z });
    for (let k = 0; k < n; k++) crate(c, { x: x + (k % 2) * 0.05, y: 0.14 + k * 0.62, z, w: 1.1, h: 0.6, d: 0.92, ry: k * 0.05, kind: (['olive', 'grey', 'orange'] as const)[k % 3], label: k === 0 ? 'UNAA' : undefined });
    B.add(box(0.05, 0.14 + n * 0.62 + 0.02, 0.94), mat(c, 'yellow'), { x: x - 0.2, y: (0.14 + n * 0.62) / 2, z });
  }
  // specimen crates (white, biohazard tape) and drums
  crate(c, { x: 7.0, z: -5.0, w: 0.9, h: 0.7, d: 0.7, kind: 'white', label: 'SPECIMEN' });
  crate(c, { x: 7.1, y: 0.7, z: -5.05, w: 0.8, h: 0.5, d: 0.6, ry: 0.1, kind: 'white', label: 'BIO-B' });
  barrel(c, 3.0, -4.7, 'blue'); barrel(c, 3.6, -4.6, 'blue'); barrel(c, 3.25, -5.2, 'red');
  ph(c, 'hand_truck', 3.4, 0, -6.6, 0.6);
  ph(c, 'plastic_crate_01', 6.8, 0, -7.0, 0.3); ph(c, 'plastic_crate_03', 7.4, 0, -6.8, -0.2);
  ph(c, 'old_military_crate', 4.3, 0, -14.3, 0.1);
  ph(c, 'cardboard_box_01', 6.2, 0, -14.4, 0.6);
  // lanes, the bay number, the cargo net on the bow wall
  floorLine(c, 2.4, -14.6, 2.4, -4.4, 0.1); floorLine(c, 8.3, -14.6, 8.3, -4.4, 0.1);
  floorText(c, 'BAY 2', 6.6, -9.7, 1.6, P / 2);
  const net = cached('net', () => { const [cv, g] = canvas(256, 256); g.strokeStyle = '#7a6a48'; g.lineWidth = 4; for (let k = -256; k < 512; k += 28) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 256, 256); g.stroke(); g.beginPath(); g.moveTo(k, 256); g.lineTo(k + 256, 0); g.stroke(); } const t = toTex(cv, { repeat: false }); return t; });
  B.add(quad(3.0, 2.2), c.M.get('net', { map: net, transparent: true, alphaTest: 0.4, rough: 0.9, side: THREE.DoubleSide, flag: 0 }), { x: 5.4, y: 1.4, z: -4.2, ry: P });
  sign(c, 'CARGO HOLD 2', 1.6, { x: 4.0, y: 2.9, z: -4.1, ry: P }, { fg: 0x1c1b18, bg: 0xd2a23c, size: 48 });
  wallLamp(c, W_STBD - 0.02, 3.0, -10.6, FX, 0xfff0d8, 1.0);
}

function engineering(c: Ctx) {
  const B = c.B;
  const rx = ROOMS.engineering.spots.reactor.p[0], rz = ROOMS.engineering.spots.reactor.p[2];
  // the reactor: a hazard-ringed base, the vessel with ribs and viewing slots, field rings, the crown of pipes
  B.add(cyl(2.1, 2.2, 0.3, 48), mat(c, 'dark'), { x: rx, y: 0.15, z: rz });
  B.add(new THREE.TorusGeometry(2.0, 0.08, 6, 48), c.M.get('reacthaz', { map: hazardTex(), rough: 0.6 }), { x: rx, y: 0.3, z: rz, rx: P / 2 });
  B.add(cyl(1.45, 1.55, 3.2, 32), mat(c, 'gun'), { x: rx, y: 1.9, z: rz });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * P * 2; B.add(box(0.12, 3.3, 0.16, 0.02), mat(c, 'dark'), { x: rx + Math.cos(a) * 1.52, y: 1.9, z: rz + Math.sin(a) * 1.52, ry: -a }); }
  const slotM = c.M.live(0xffa040, 2.4);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * P * 2 + 0.26; B.add(box(0.14, 1.5, 0.04), slotM, { x: rx + Math.cos(a) * 1.56, y: 1.9, z: rz + Math.sin(a) * 1.56, ry: -a + P / 2 }); }
  const ringsG = new THREE.Group(); ringsG.position.set(rx, 0, rz); c.root.add(ringsG);
  const rings: THREE.Mesh[] = [];
  for (const y of [0.85, 2.95]) { const r = new THREE.Mesh(c.bin.g(new THREE.TorusGeometry(1.85, 0.16, 10, 48)), mat(c, 'copper')); r.position.y = y; r.rotation.x = P / 2; r.castShadow = true; ringsG.add(r); rings.push(r); }
  B.add(cyl(1.2, 1.5, 0.5, 32), mat(c, 'dark'), { x: rx, y: 3.75, z: rz });
  const top = new THREE.Mesh(c.bin.g(new THREE.CircleGeometry(0.75, 32)), slotM); top.position.set(rx, 4.01, rz); top.rotation.x = -P / 2; c.root.add(top);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * P * 2 + P / 4; pipeRun(c, [new V3(rx + Math.cos(a) * 1.0, 3.9, rz + Math.sin(a) * 1.0), new V3(rx + Math.cos(a) * 1.0, 4.3, rz + Math.sin(a) * 1.0), new V3(W_STBD - 0.2, 4.3, rz + Math.sin(a) * 1.4)], 0.11, ['pipeR', 'pipeB', 'pipeR', 'pipeB'][k], 1.2); }
  c.anims.push((dt, t) => {
    const f = 1 + Math.sin(t * 3.1) * 0.12 + Math.sin(t * 7.3) * 0.05;
    slotM.color.setHex(0xffa040).multiplyScalar(2.2 * f);
    rings[0].rotation.z = t * 0.2; rings[1].rotation.z = -t * 0.2;
  });
  c.refs.reactor = slotM;
  // a guard rail round the reactor with a gap at the catwalk spot
  for (let k = 0; k < 20; k++) { const a = (k / 20) * P * 2; if (Math.abs(Math.cos(a) + 1) < 0.3) continue; B.add(box(0.05, 1.05, 0.05), mat(c, 'yellow'), { x: rx + Math.cos(a) * 2.45, y: 0.52, z: rz + Math.sin(a) * 2.45 }); }
  B.add(new THREE.TorusGeometry(2.45, 0.03, 4, 48, P * 1.7), mat(c, 'yellow'), { x: rx, y: 1.05, z: rz, rx: P / 2, rz: P * 1.15 });
  // the control desk on the bow wall
  console_(c, { x: 4.4, z: -15.55, ry: P, w: 2.6, screens: ['reactor', 'power', 'bars'], seed: 17, paint: 'gun' });
  chair(c, { x: 4.2, z: -16.4, ry: P });
  poster(c, 'reactor', 0.6, { x: 7.4, y: 1.9, z: -15.14, ry: P });
  mug(c, 3.5, 0.79, -15.45, 'dark');
  // manifolds and valve wheels on the hull wall, gauges
  for (const [z, col] of [[-23.2, 'pipeR'], [-23.8, 'pipeB'], [-24.4, 'pipeY'], [-25.0, 'pipeG']] as [number, string][]) {
    pipeRun(c, [new V3(W_STBD - 0.2, 0.0, z), new V3(W_STBD - 0.2, 3.3, z)], 0.08, col, 0.8);
    B.add(new THREE.TorusGeometry(0.18, 0.03, 6, 16), mat(c, col === 'pipeR' ? 'red' : 'steel'), { x: W_STBD - 0.42, y: 1.3, z, ry: P / 2 });
    B.add(box(0.2, 0.06, 0.06), mat(c, 'gun'), { x: W_STBD - 0.32, y: 1.3, z });
    B.add(cyl(0.09, 0.09, 0.04, 16), mat(c, 'white'), { x: W_STBD - 0.32, y: 2.0, z, rz: P / 2 });
  }
  for (const [x, z] of [[8.9, -26.2], [7.9, -26.3]] as [number, number][]) { B.add(cyl(0.42, 0.42, 2.4, 20), mat(c, 'white'), { x, y: 1.2, z }); B.add(new THREE.SphereGeometry(0.42, 16, 8, 0, P * 2, 0, P / 2), mat(c, 'white'), { x, y: 2.4, z }); B.add(cyl(0.44, 0.44, 0.1, 20), mat(c, 'red'), { x, y: 1.6, z }); }
  ph(c, 'small_lpg_tank', 2.4, 0, -26.2, 0.4); ph(c, 'propane_tank', 2.9, 0, -26.3, -0.3);
  ph(c, 'oil_tin', 3.4, 0, -26.1, 0.8); ph(c, 'metal_jerrycan', 2.2, 0, -24.6, 1.4);
  ph(c, 'power_box_01', W_STBD - 0.1, 0.9, -17.0, -P / 2);
  ph(c, 'security_camera_01', W_STBD - 0.1, 3.1, -15.6, -P / 2 - 0.6);
  cable(c, [new V3(4.4, 0.03, -16.0), new V3(4.0, 0.03, -18.6), new V3(rx - 2.2, 0.03, rz)], 0.05, 'cableY');
  cable(c, [new V3(5.0, 0.03, -16.0), new V3(5.4, 0.03, -18.2), new V3(rx - 1.6, 0.03, rz + 1.5)], 0.04, 'cable');
  wallLamp(c, W_STBD - 0.02, 3.0, -19.5, FX, 0xffd0a0, 1.0);
  void WALL_H; void tube;
}

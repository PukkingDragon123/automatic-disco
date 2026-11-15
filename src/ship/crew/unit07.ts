// UNIT 07 aboard the ship: the program's AI as a small floating ball robot, 40 cm across. A glossy ceramic shell
// over a slate belly, painted at native resolution (panel seams with a bevel, screw heads, vent slots, the UNIT 07
// and UNAA stencils, warning chevrons by the thrusters, an amber pinstripe, edge wear along the seams), one big
// sensor eye in a machined bezel (dark glass, a glowing iris with aperture blades, lids that blink and squint), two
// sensor pods like ears with whip antennas, four small vectoring thrusters on the belly with flickering cores, the
// gravity ring round its equator with eight emitter pads, and a hover glow under it. It bobs, banks into its motion,
// looks at things, blinks, talks with its iris, and reaches out with its gravity field (a spiralling beam and a halo
// on what it holds).
//
//   const u = new Unit07(); scene.add(u.root); fxScene?.add(u.fx);   every frame: u.update(dt)
//   u.moveTo(p) / u.pos.copy(p); u.lookAt(p | null); u.grav(target | null); u.say(sec); u.blink(); u.mood = 'alert'
import * as THREE from 'three';
import { Kit } from '../../robots/kit';
import { kitMaterial, kitUniforms } from '../../robots/atlas';
import { gbuf } from '../../gfx/gbuf';
import { unaaAtlas } from './paint';

const PI = Math.PI, TAU = PI * 2;
export const U07_R = 0.2;
export type U07Mood = 'calm' | 'happy' | 'alert' | 'sad' | 'boot';
const EYE: Record<U07Mood, number> = { calm: 0x7fe0c8, happy: 0x9af0b0, alert: 0xffb050, sad: 0x6a9ad8, boot: 0xd8f0e8 };
export const GRAV_COL = 0x9a8cff;

// ------------------------------------------------------------------ the shell, painted
let shellTex: THREE.CanvasTexture | null = null;
function paintShell(): THREE.CanvasTexture {
  if (shellTex) return shellTex;
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  drawShell(c.getContext('2d')!, 2048, 1024);
  shellTex = new THREE.CanvasTexture(c); shellTex.colorSpace = THREE.SRGBColorSpace; shellTex.anisotropy = 8;
  shellTex.wrapS = THREE.RepeatWrapping;
  document.fonts?.ready.then(() => { drawShell(c.getContext('2d')!, 2048, 1024); shellTex!.needsUpdate = true; });
  return shellTex;
}
function drawShell(g: CanvasRenderingContext2D, W: number, H: number) {
  const yOf = (lat: number) => (0.5 - lat / PI) * H; // latitude (radians, + north) -> row
  const xOf = (lon: number) => ((lon / TAU) % 1 + 1) % 1 * W; // longitude: 0 = -x side, PI/2 = front (+z)
  // ceramic above, slate below, a warm grey band between
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#eceae2'); gr.addColorStop(0.42, '#dcdad0'); gr.addColorStop(0.56, '#cfcdc2'); gr.addColorStop(0.575, '#3a4a58'); gr.addColorStop(1, '#2a3440');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // the lit cap: a soft pale bloom on the crown (ceramic glaze)
  // subtle glaze mottling, placed: large faint patches
  for (let i = 0; i < 60; i++) { const x = (i * 337) % W, y = (i * 191) % (H * 0.55); g.fillStyle = `rgba(${i % 2 ? 255 : 0},${i % 2 ? 250 : 0},${i % 2 ? 240 : 0},0.025)`; g.beginPath(); g.ellipse(x, y, 60 + (i % 5) * 20, 18 + (i % 3) * 8, 0, 0, TAU); g.fill(); }
  // the amber pinstripe and the dark band edge
  g.fillStyle = '#c9963a'; g.fillRect(0, yOf(-0.2) - 7, W, 6);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, yOf(-0.2) - 1, W, 3);
  // panel seams: a groove (dark) with a highlight line under it (bevel), latitude rings and meridians, offset per row
  const groove = (x0: number, y0: number, x1: number, y1: number, dark = 'rgba(30,34,40,0.75)') => {
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + 1, y0 + 2); g.lineTo(x1 + 1, y1 + 2); g.stroke();
    g.strokeStyle = dark; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  const lats = [0.95, 0.5, 0.12, -0.42, -0.95];
  for (const la of lats) groove(0, yOf(la), W, yOf(la), la < -0.2 ? 'rgba(10,14,18,0.8)' : undefined);
  const mer = (lon: number, la0: number, la1: number) => groove(xOf(lon), yOf(la0), xOf(lon), yOf(la1), la1 < -0.2 ? 'rgba(10,14,18,0.8)' : undefined);
  for (let i = 0; i < 6; i++) { mer(i / 6 * TAU + 0.26, 0.95, 0.5); }
  for (let i = 0; i < 8; i++) { mer(i / 8 * TAU, 0.5, 0.12); }
  for (let i = 0; i < 8; i++) { mer(i / 8 * TAU + 0.39, -0.42, -0.95); }
  for (let i = 0; i < 4; i++) { mer(i / 4 * TAU + 0.78, 0.12, -0.42); }
  // screws at panel corners
  const screw = (x: number, y: number, dark = false) => {
    g.fillStyle = dark ? '#1a2028' : '#8a8a84'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill();
    g.fillStyle = dark ? '#4a5a68' : '#c8c8c0'; g.beginPath(); g.arc(x - 1, y - 1, 4, 0, TAU); g.fill();
    g.strokeStyle = dark ? '#10161c' : '#5a5a54'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 3, y - 1); g.lineTo(x + 2, y); g.stroke();
  };
  for (let i = 0; i < 8; i++) { const x = xOf(i / 8 * TAU); screw(x + 14, yOf(0.5) + 14); screw(x + 14, yOf(0.12) - 14); screw(x - 14, yOf(0.12) - 14); }
  for (let i = 0; i < 8; i++) { const x = xOf(i / 8 * TAU + 0.39); screw(x + 14, yOf(-0.42) + 14, true); screw(x - 14, yOf(-0.42) + 14, true); }
  // vent slots on the flanks (under the sensor pods) and the belly
  const vents = (cx: number, cy: number, n: number, w: number, dark = false) => { for (let i = 0; i < n; i++) { const y = cy + (i - n / 2) * 11; g.fillStyle = dark ? '#0c1014' : '#3a3c40'; g.fillRect(cx - w / 2, y, w, 5); g.fillStyle = dark ? 'rgba(120,140,160,0.25)' : 'rgba(255,255,255,0.6)'; g.fillRect(cx - w / 2, y + 5, w, 2); } };
  vents(xOf(0) + 0, yOf(-0.05), 4, 60); vents(xOf(PI), yOf(-0.05), 4, 60);
  vents(xOf(PI * 1.5), yOf(0.3), 5, 90); vents(xOf(PI * 1.5), yOf(-0.65), 4, 80, true);
  // stencils: UNIT 07 on both flanks, UNAA on the crown band, a serial on the belly, chevrons by the thrusters
  const stencil = (s: string, x: number, y: number, size: number, col: string, spacing = 6) => {
    g.save(); g.font = `${size}px 'Superwide', 'Jersey', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; (g as unknown as { letterSpacing: string }).letterSpacing = spacing + 'px';
    g.fillStyle = col; g.fillText(s, x, y);
    // stencil bridges and a little wear: drawn gaps, not noise
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.0)'; g.restore();
  };
  stencil('UNIT 07', xOf(0.08), yOf(0.3), 58, '#2a3440'); stencil('UNIT 07', xOf(PI + 0.08), yOf(0.3), 58, '#2a3440');
  stencil('UNAA', xOf(PI * 1.5), yOf(0.72), 40, '#2a3440', 10);
  stencil('AI-07 · RV-07 · UNAA COLONISATION RESEARCH', xOf(PI * 1.5), yOf(-0.3), 22, '#c9c4b4', 3);
  stencil('07', xOf(PI / 2 + 0.75), yOf(0.62), 44, '#b8382e');
  stencil('07', xOf(PI / 2 - 0.75), yOf(0.62), 44, '#b8382e');
  for (const lon of [PI / 4, PI * 3 / 4, PI * 5 / 4, PI * 7 / 4]) {
    const x = xOf(lon), y = yOf(-0.62);
    for (let i = 0; i < 3; i++) { g.fillStyle = i % 2 ? '#1c2228' : '#d9a43a'; g.beginPath(); g.moveTo(x - 40 + i * 22, y - 14); g.lineTo(x - 26 + i * 22, y - 14); g.lineTo(x - 14 + i * 22, y + 14); g.lineTo(x - 28 + i * 22, y + 14); g.closePath(); g.fill(); }
  }
  // a small UNAA flag on the crown, behind the eye
  { const x = xOf(PI * 1.5) - 40, y = yOf(0.86) - 16; g.fillStyle = '#26344a'; g.fillRect(x, y, 80, 34); g.fillStyle = '#dfe3dc'; g.fillRect(x + 34, y, 12, 34); g.fillStyle = '#d9a43a'; g.beginPath(); g.arc(x + 40, y + 17, 6, 0, TAU); g.fill(); }
  // edge wear along the upper seams: chips of warm grey where hands and bumps found the edges, placed by hand
  const chips: [number, number][] = [[0.3, 0.5], [1.1, 0.5], [2.3, 0.5], [3.7, 0.5], [4.6, 0.5], [5.5, 0.5], [0.8, 0.12], [2.0, 0.12], [4.1, 0.12], [5.9, 0.12], [1.6, 0.95], [3.2, 0.95]];
  for (const [lon, la] of chips) { const x = xOf(lon), y = yOf(la); g.fillStyle = 'rgba(120,112,98,0.55)'; g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + 9, y - 1); g.lineTo(x + 6, y + 4); g.lineTo(x - 2, y + 3); g.closePath(); g.fill(); }
  // grime pooled under the band and toward the belly
  const gg = g.createLinearGradient(0, yOf(-0.2), 0, yOf(-0.5)); gg.addColorStop(0, 'rgba(20,16,10,0.0)'); gg.addColorStop(1, 'rgba(20,16,10,0.25)'); g.fillStyle = gg; g.fillRect(0, yOf(-0.2), W, yOf(-0.5) - yOf(-0.2));
}

function glowMat(col: number, opacity = 1): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  gbuf(m, 0); return m;
}
function solidGlow(col: number): THREE.MeshBasicMaterial { const m = new THREE.MeshBasicMaterial({ color: col }); gbuf(m, 32); return m; }

/** a soft round sprite texture for glows (drawn once) */
let softT: THREE.Texture | null = null;
function soft(): THREE.Texture {
  if (softT) return softT;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); softT = new THREE.CanvasTexture(c); return softT;
}
function softMat(col: number, opacity = 1) { const m = new THREE.MeshBasicMaterial({ map: soft(), color: col, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); gbuf(m, 0); return m; }

export class Unit07 {
  readonly root = new THREE.Group();
  /** the bobbing, banking body */
  readonly body = new THREE.Group();
  /** the yaw / pitch head frame (the whole ball turns to look) */
  readonly head = new THREE.Group();
  /** additive effects (beam, halo, glows): add to the scene (or an fx scene) */
  readonly fx = new THREE.Group();
  readonly pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private goal: THREE.Vector3 | null = null; private speedMax = 2.2;
  private lookT: THREE.Vector3 | null = null;
  private yaw = 0; private pitch = 0;
  private t = 0;
  mood: U07Mood = 'calm';
  /** 0 off .. 1 on (boot-up, power) */
  power = 1;
  private iris: THREE.Mesh; private irisRing: THREE.Mesh; private pupil: THREE.Mesh; private blades: THREE.Mesh[] = [];
  private lidU: THREE.Group; private lidD: THREE.Group;
  private blinkT = 2; private blinkK = 0; private squint = 0;
  private talkT = 0;
  private thr: { core: THREE.Mesh; glow: THREE.Mesh }[] = [];
  private pads: THREE.Mesh[] = [];
  private padMat: THREE.MeshBasicMaterial;
  private irisMat: THREE.MeshBasicMaterial; private ringMat: THREE.MeshBasicMaterial;
  private hover: THREE.Mesh; private hoverLight: THREE.PointLight; private eyeLight: THREE.PointLight;
  private antTip: THREE.Mesh[] = [];
  // gravity
  private gT: THREE.Vector3 | null = null; private gK = 0;
  private beam: THREE.Mesh[] = []; private halo: THREE.Mesh; private haloR = 0.2;
  /** a clickable proxy (raycast against this) */
  readonly hit: THREE.Mesh;

  constructor(o: { scale?: number } = {}) {
    const R = U07_R;
    this.root.add(this.body); this.body.add(this.head);
    // ---- the shell
    const shell = new THREE.MeshPhongMaterial({ map: paintShell(), specular: 0x5a5a56, shininess: 70 });
    gbuf(shell, 1);
    const sph = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), shell); sph.castShadow = true; sph.receiveShadow = true;
    this.head.add(sph);
    // ---- hardware from the kit (the UNAA livery page)
    const mats = [kitMaterial(unaaAtlas(), kitUniforms())];
    const k = new Kit(14);
    k.on(this.head);
    // the eye bezel: a machined ring proud of the shell, a deep socket
    const ez = R * 0.86, ey = R * 0.12;
    k.push(0, ey, ez).lathe(0, 0, 0, [[0.066, -0.03], [0.074, -0.004], [0.078, 0.012], [0.072, 0.03], [0.058, 0.034], [0.054, 0.02], [0.05, -0.02]], 28, 'st0', { axis: 'z' }).pop();
    k.push(0, ey, ez).rivets([-0.072, 0, 0.026], [0.072, 0, 0.026], 2, 0.004, 'z', 'dk').rivets([0, 0.072, 0.026], [0, -0.072, 0.026], 2, 0.004, 'z', 'dk').pop();
    k.push(0, ey, ez - 0.004).cyl(0, 0, 0, 0.052, 0.052, 0.03, 24, 'dk', { axis: 'z', caps: 'bot' }).pop();
    // sensor pods ("ears") with whip antennas
    for (const sd of [1, -1]) {
      k.push(sd * R * 0.93, R * 0.25, -R * 0.05, 0, 0, sd * -0.35);
      k.cyl(0, 0, 0, 0.034, 0.03, 0.05, 14, 'pb0', { axis: 'x' }); k.cyl(sd * 0.03, 0, 0, 0.026, 0.026, 0.012, 14, 'st0', { axis: 'x' });
      k.cyl(sd * 0.038, 0, 0, 0.016, 0.016, 0.006, 12, 'lens', { axis: 'x', capReg: 'lens' });
      k.cyl(sd * 0.0, 0.03, -0.012, 0.0028, 0.0018, 0.14, 4, 'dk').pop();
    }
    // the gravity ring round the equator, its emitter sockets
    k.torus(0, -R * 0.06, 0, R * 1.015, 0.011, 48, 6, 'st1');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + PI / 8; k.push(Math.sin(a) * R * 1.02, -R * 0.06, Math.cos(a) * R * 1.02, 0, a, 0).box(0, 0, 0, 0.034, 0.02, 0.012, 'pb1', { ch: 0.003 }).pop(); }
    // four vectoring thrusters on the belly
    const thrAt: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + PI / 4, la = -0.82;
      const p = new THREE.Vector3(Math.sin(a) * Math.cos(la) * R, Math.sin(la) * R, Math.cos(a) * Math.cos(la) * R);
      thrAt.push(p);
      k.pushDir([p.x, p.y, p.z], [p.x * 0.4, -1, p.z * 0.4]);
      k.lathe(0, 0, 0, [[0.026, -0.006], [0.028, 0.004], [0.022, 0.016], [0.026, 0.032], [0.022, 0.034], [0.017, 0.02], [0.012, 0.004]], 14, 'st0', { axis: 'z' });
      k.cyl(0, 0, -0.004, 0.03, 0.03, 0.01, 14, 'pb1', { axis: 'z' }).pop();
    }
    // the antenna mast on the crown, a little behind
    k.push(0, R * 0.96, -R * 0.2, -0.25, 0, 0).cyl(0, 0.0, 0, 0.012, 0.016, 0.024, 10, 'pb1').cyl(0, 0.05, 0, 0.003, 0.003, 0.08, 6, 'st0').pop();
    k.finish(mats);
    // ---- the eye itself: dark glass, an iris that glows, aperture blades, a pupil, the lids
    const glass = new THREE.MeshPhongMaterial({ color: 0x0a1014, specular: 0xbfd8e0, shininess: 120 }); gbuf(glass, 1);
    const eyeG = new THREE.Group(); eyeG.position.set(0, ey, ez + 0.006); this.head.add(eyeG);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 28, 16, 0, TAU, 0, PI * 0.32), glass); lens.rotation.x = PI / 2; lens.position.z = -0.043; eyeG.add(lens);
    this.irisMat = solidGlow(EYE.calm); this.ringMat = solidGlow(EYE.calm);
    this.irisRing = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.034, 32), this.ringMat); this.irisRing.position.z = 0.0105; eyeG.add(this.irisRing);
    this.iris = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.024, 32), this.irisMat); this.iris.position.z = 0.0108; eyeG.add(this.iris);
    const bladeM = new THREE.MeshBasicMaterial({ color: 0x0c1418 }); gbuf(bladeM, 32);
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.006), bladeM); const a = (i / 6) * TAU; b.position.set(Math.cos(a) * 0.018, Math.sin(a) * 0.018, 0.0112); b.rotation.z = a + 0.6; eyeG.add(b); this.blades.push(b); }
    this.pupil = new THREE.Mesh(new THREE.CircleGeometry(0.01, 20), solidGlow(0xf0fff8)); this.pupil.position.z = 0.0114; eyeG.add(this.pupil);
    const lidMat = new THREE.MeshPhongMaterial({ color: 0x2c3640, specular: 0x404850, shininess: 40 }); gbuf(lidMat, 1);
    const lidGeo = new THREE.SphereGeometry(0.058, 24, 8, 0, TAU, 0, PI / 2);
    this.lidU = new THREE.Group(); this.lidD = new THREE.Group();
    const lu = new THREE.Mesh(lidGeo, lidMat); lu.rotation.x = 0; this.lidU.add(lu);
    const ld = new THREE.Mesh(lidGeo, lidMat); ld.rotation.x = PI; this.lidD.add(ld);
    for (const l of [this.lidU, this.lidD]) { l.position.z = -0.04; eyeG.add(l); }
    this.eyeLight = new THREE.PointLight(EYE.calm, 0.6, 1.6, 2); this.eyeLight.position.set(0, 0, 0.08); eyeG.add(this.eyeLight);
    // ---- glows: the gravity pads, thruster cores, the antenna tip, the hover glow
    this.padMat = solidGlow(0x2a3048);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + PI / 8; const p = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.01), this.padMat); p.position.set(Math.sin(a) * (R * 1.02 + 0.0065), -R * 0.06, Math.cos(a) * (R * 1.02 + 0.0065)); p.rotation.y = a; this.head.add(p); this.pads.push(p); }
    for (const p of thrAt) {
      const dir = new THREE.Vector3(p.x * 0.4, -1, p.z * 0.4).normalize();
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.09, 10, 1, true), glowMat(0x9fd8ff, 0.8));
      core.position.copy(p).addScaledVector(dir, 0.075); core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), softMat(0x8ac8ff, 0.7));
      glow.position.copy(p).addScaledVector(dir, 0.036);
      this.head.add(core, glow); this.thr.push({ core, glow });
    }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), solidGlow(0xffb040)); tip.position.set(0, R * 0.96 + 0.088 * Math.cos(0.25), -R * 0.2 - 0.088 * Math.sin(0.25)); this.head.add(tip); this.antTip.push(tip);
    this.hover = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), softMat(0x7ad8e8, 0.55)); this.hover.rotation.x = -PI / 2; this.fx.add(this.hover);
    this.hoverLight = new THREE.PointLight(0x7ad8e8, 1.2, 2.2, 2); this.root.add(this.hoverLight); this.hoverLight.position.y = -R * 1.4;
    // ---- gravity beam and halo
    for (let i = 0; i < 28; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), softMat(GRAV_COL, 0.9)); b.visible = false; this.fx.add(b); this.beam.push(b); }
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40), glowMat(GRAV_COL, 0.6)); this.halo.visible = false; this.fx.add(this.halo);
    this.hit = new THREE.Mesh(new THREE.SphereGeometry(R * 1.3, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); this.root.add(this.hit);
    this.root.scale.setScalar(o.scale ?? 1);
    this.root.userData.unit07 = this;
  }

  // ------------------------------------------------------------------ control
  /** glide to a point (null stops); v: max speed m/s */
  moveTo(p: THREE.Vector3 | null, v = 2.2) { this.goal = p ? p.clone() : null; this.speedMax = v; }
  get moving() { return !!this.goal; }
  place(p: THREE.Vector3) { this.pos.copy(p); this.goal = null; this.vel.set(0, 0, 0); this.root.position.copy(p); }
  lookAt(p: THREE.Vector3 | null) { this.lookT = p ? p.clone() : null; }
  /** face a point at once */
  faceNow(p: THREE.Vector3) { const d = p.clone().sub(this.pos); this.yaw = Math.atan2(d.x, d.z); this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }
  blink() { this.blinkT = 0; }
  /** the iris flickers as if speaking for sec seconds */
  say(sec: number) { this.talkT = Math.max(this.talkT, sec); }
  /** narrow the eye (0 open .. 1 almost shut): focus, suspicion */
  setSquint(k: number) { this.squint = k; }
  /** reach out with the gravity field to a point (follows the Vector3 you pass each frame); null lets go */
  grav(target: THREE.Vector3 | null, radius = 0.2) { this.gT = target; this.haloR = radius; }
  /** where the beam starts (world) */
  emitter(out = new THREE.Vector3()) { return this.head.localToWorld(out.set(0, U07_R * 0.12, U07_R * 0.95)); }

  update(dt: number) {
    this.t += dt; const t = this.t;
    // ---- motion: a damped glide toward the goal, a bob, banking into acceleration
    const acc = new THREE.Vector3();
    if (this.goal) {
      const d = this.goal.clone().sub(this.pos), L = d.length();
      if (L < 0.02) { this.goal = null; } else { const want = d.multiplyScalar(Math.min(this.speedMax, L * 2.2) / L); acc.copy(want).sub(this.vel).multiplyScalar(5); }
    } else acc.copy(this.vel).multiplyScalar(-5);
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);
    const bob = Math.sin(t * 1.9) * 0.018 + Math.sin(t * 3.3) * 0.005;
    this.root.position.set(this.pos.x, this.pos.y + bob * this.power, this.pos.z);
    // banking: roll / pitch against the acceleration (in the body's yaw frame)
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const aSide = acc.x * cy - acc.z * sy, aFwd = acc.x * sy + acc.z * cy;
    this.body.rotation.z += (-aSide * 0.05 - this.body.rotation.z) * Math.min(1, dt * 6);
    this.body.rotation.x += (aFwd * 0.05 + Math.sin(t * 1.3) * 0.03 - this.body.rotation.x) * Math.min(1, dt * 6);
    // ---- look: the whole ball turns (yaw), the head frame pitches
    let wantYaw = this.yaw, wantPitch = this.pitch * 0.9;
    const lt = this.lookT ?? (this.vel.lengthSq() > 0.05 ? this.pos.clone().add(this.vel) : null);
    if (lt) { const d = lt.clone().sub(this.pos); if (d.lengthSq() > 1e-4) { wantYaw = Math.atan2(d.x, d.z); wantPitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); } }
    let dy = wantYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 5); this.pitch += (Math.max(-1, Math.min(1, wantPitch)) - this.pitch) * Math.min(1, dt * 5);
    this.body.rotation.y = this.yaw; this.head.rotation.x = -this.pitch;
    // ---- the eye: colour by mood, power, blinking, squint, talking
    const col = new THREE.Color(EYE[this.mood]);
    const talk = this.talkT > 0 ? 0.7 + 0.3 * Math.abs(Math.sin(t * 17) * Math.sin(t * 5.3)) : 1;
    this.talkT = Math.max(0, this.talkT - dt);
    const pw = this.power;
    this.irisMat.color.copy(col).multiplyScalar(pw * talk * 1.6); this.ringMat.color.copy(col).multiplyScalar(pw * 0.9);
    (this.pupil.material as THREE.MeshBasicMaterial).color.setRGB(0.95 * pw, pw, 0.97 * pw);
    this.eyeLight.color.copy(col); this.eyeLight.intensity = 0.7 * pw * talk;
    const ap = 0.85 + Math.sin(t * 0.7) * 0.08 + (this.mood === 'alert' ? -0.25 : 0) + (this.talkT > 0 ? Math.sin(t * 13) * 0.08 : 0);
    this.iris.scale.setScalar(ap); this.pupil.scale.setScalar(0.7 + ap * 0.4);
    this.blades.forEach((b, i) => { const a = (i / 6) * TAU + t * 0.2; b.position.set(Math.cos(a) * 0.018 * ap, Math.sin(a) * 0.018 * ap, 0.0112); b.rotation.z = a + 0.6; });
    this.blinkT += dt;
    if (this.blinkT > 3 + ((t * 7.13) % 2.5)) this.blinkT = 0;
    const bk = this.blinkT < 0.16 ? Math.sin((this.blinkT / 0.16) * PI) : 0;
    this.blinkK = Math.max(bk, 1 - pw);
    const lid = Math.min(1, this.blinkK + this.squint * 0.55 + (this.mood === 'sad' ? 0.25 : 0));
    this.lidU.rotation.x = -PI / 2 + lid * (PI / 2) * 0.98 - 0.05; this.lidD.rotation.x = PI / 2 - lid * (PI / 2) * 0.5 + 0.05;
    // ---- thrusters, antenna, hover glow
    const thrK = pw * (0.6 + Math.min(1, this.vel.length() * 0.5));
    this.thr.forEach((th, i) => { const f = thrK * (0.75 + Math.sin(t * 37 + i * 2.1) * 0.12 + Math.sin(t * 61 + i) * 0.1); th.core.scale.set(1, f, 1); (th.core.material as THREE.MeshBasicMaterial).opacity = 0.7 * f; (th.glow.material as THREE.MeshBasicMaterial).opacity = 0.6 * f; th.glow.lookAt(th.glow.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -1, 0.0001))); });
    this.antTip.forEach((a) => ((a.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(t * 3) > 0.6 && pw > 0.5 ? 0xffb040 : 0x3a2810)));
    this.hover.position.set(this.root.position.x, this.pos.y - U07_R * 2.6 - bob * 0.5, this.root.position.z);
    this.hover.scale.setScalar(0.9 + Math.sin(t * 2.2) * 0.06);
    (this.hover.material as THREE.MeshBasicMaterial).opacity = 0.35 * pw;
    this.hoverLight.intensity = 1.1 * pw;
    // ---- gravity: pads light up, a spiralling beam to the target, a halo round it
    this.gK += ((this.gT ? 1 : 0) - this.gK) * Math.min(1, dt * 8);
    this.padMat.color.copy(new THREE.Color(0x2a3048).lerp(new THREE.Color(GRAV_COL).multiplyScalar(1.8), this.gK * (0.8 + Math.sin(t * 20) * 0.2)));
    const on = this.gK > 0.02 && !!this.gT;
    this.halo.visible = on; this.beam.forEach((b) => (b.visible = on));
    if (on) {
      const a = this.emitter(), b = this.gT!, mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.25 + a.distanceTo(b) * 0.08, 0));
      const dir = b.clone().sub(a).normalize(), side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(), upv = new THREE.Vector3().crossVectors(side, dir);
      this.beam.forEach((m, i) => {
        const u = ((i / this.beam.length) + t * 0.9) % 1, w = 1 - u;
        const p = a.clone().multiplyScalar(w * w).addScaledVector(mid, 2 * u * w).addScaledVector(b, u * u);
        const ang = u * 14 + t * 6 + (i % 2) * PI, rr = 0.03 + Math.sin(u * PI) * 0.05;
        p.addScaledVector(side, Math.cos(ang) * rr).addScaledVector(upv, Math.sin(ang) * rr);
        m.position.copy(p); m.scale.setScalar((0.5 + Math.sin(u * PI) * 0.7) * this.gK);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.75 * this.gK * Math.sin(u * PI);
        m.quaternion.copy(this.camQ);
      });
      this.halo.position.copy(b); this.halo.scale.setScalar(this.haloR * (1 + Math.sin(t * 9) * 0.06)); this.halo.rotation.set(PI / 2 + Math.sin(t * 1.7) * 0.4, t * 2, 0);
      (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.55 * this.gK;
    }
  }
  /** the camera's orientation, for billboards (set by the owner each frame) */
  camQ = new THREE.Quaternion();
  dispose() { this.root.removeFromParent(); this.fx.removeFromParent(); }
}

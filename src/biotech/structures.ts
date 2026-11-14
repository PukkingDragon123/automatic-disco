// Biotech structures, registered in the factory's building catalogue (registerBuilding: section "Bio-Works") so
// they are placed, powered, targeted by raiders and inspected like every Corps machine, and built with the same
// geometry kit in the same 1957 hardware language: riveted olive enamel, ceramic insulators, copper coils, brass
// caps, poured concrete plinths.
//   FORCE-FIELD GENERATOR  projects a shimmering pixel-lattice dome that pushes every hostile thing out, takes the
//                          shots meant for the machines inside, and flashes where it is struck. Draws power.
//   ENGINEERED HABITAT     a glazed dome on a ring foundation with a climate unit: engineered stock lives, breeds
//                          and produces faster inside and cannot get out.
//   GROWTH VAT TANK        grows a design in a glass tank, fast; with Cloning it grows twins and clones.
//   BIO-REACTOR            burns biomass (carcasses, bio-oil, algae fuel, carbon) into power for the grid.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Creature } from '../game/creature';
import type { Species } from '../game/species';
import type { Biotech, Hostile } from './runtime';
import { registerBuilding } from '../factory/defs';
import { MG } from '../factory/models';
import { L } from '../factory/tex';
import { gbufNone } from '../gfx/gbuf';
import { makeInstance } from '../life/creatureMesh';
import { RAMPS } from '../art/palette';
import { vfx2d } from '../game/vfx2d';
import { clamp } from '../core/rand';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';

type V3 = [number, number, number];
export type Climate = 'temperate' | 'tropical' | 'arid' | 'arctic';
export const CLIMATES: Climate[] = ['temperate', 'tropical', 'arid', 'arctic'];
const CLIMATE_GLASS: Record<Climate, number> = { temperate: RAMPS.sage[5], tropical: RAMPS.teal[5], arid: RAMPS.sand[5], arctic: RAMPS.snow[4] };
export const BT_KINDS = ['bt_field', 'bt_habitat', 'bt_vat', 'bt_reactor'] as const;
export type BtKind = (typeof BT_KINDS)[number];

/** what each structure keeps (attached to its factory building) */
export interface BtState {
  // field
  shield: number; max: number; R: number; down: number; hits: THREE.Vector4[]; hitI: number; up: number; mesh?: THREE.Mesh; U?: Record<string, THREE.IUniform>;
  // habitat
  climate: Climate; glass?: THREE.Mesh; R2: number;
  // vat
  queue: number[]; prog: number; spec?: THREE.Object3D | null; specSp?: number; fluid?: THREE.Mesh; tank?: THREE.Mesh;
  // reactor
  fuel: number; burnt: number; smokeT: number;
  extra: THREE.Object3D[];
}
const S = (b: any): BtState => (b.__bt ??= { shield: 0, max: 0, R: 0, down: 0, hits: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -1)), hitI: 0, up: 0, climate: 'temperate', R2: 3.1, queue: [], prog: 0, fuel: 0, burnt: 0, smokeT: 0, extra: [] });

// ================================================================================================ models
/** a bipyramid "ball" for electrodes and finials */
function knob(m: MG, c: V3, r: number, layer: number, glow = 0) { m.cyl([c[0], c[1] - r * 0.35, c[2]], r * 0.35, r * 0.7, layer, { r1: r, n: 8, glow }); m.cyl([c[0], c[1] + r * 0.35, c[2]], r, r * 0.7, layer, { r1: r * 0.3, n: 8, glow }); }
/** a curved bar along an arc in a vertical plane at azimuth a, from polar angle t0 to t1 on a sphere of radius R */
function rib(m: MG, cy: number, R: number, a: number, t0: number, t1: number, n: number, th: number, layer: number) {
  for (let k = 0; k < n; k++) {
    const p0 = t0 + ((t1 - t0) * k) / n, p1 = t0 + ((t1 - t0) * (k + 1)) / n, pm = (p0 + p1) / 2;
    const len = 2 * R * Math.sin((p1 - p0) / 2) + 0.02;
    const r = R * Math.sin(pm), y = cy + R * Math.cos(pm);
    m.box([Math.cos(a) * r, y, Math.sin(a) * r], [th, len, th], layer, { ry: -a, rz: Math.PI / 2 - pm });
  }
}
function fieldModel(m: MG) {
  m.box([0, 0.14, 0], [1.94, 0.28, 1.94], L.CONCRETE);
  m.box([0, 0.34, 0], [1.72, 0.12, 1.72], L.HAZARD);
  m.box([0, 0.86, 0], [1.3, 0.92, 1.3], L.OLIVE);
  m.box([0, 0.78, 0.66], [0.86, 0.42, 0.03], L.GRILLE);
  m.box([-0.66, 0.86, 0], [0.03, 0.5, 0.7], L.GRILLE);
  m.cyl([0.38, 1.12, 0.665], 0.13, 0.04, L.CREAM, { axis: 'z', n: 10 });
  m.box([0.38, 1.15, 0.69], [0.02, 0.1, 0.01], L.INK, { rz: 0.6 });
  m.box([-0.28, 1.14, 0.665], [0.22, 0.08, 0.03], L.BRASS);
  m.box([0, 1.35, 0], [1.42, 0.07, 1.42], L.GUN);
  // feeder conduits down the sides into the plinth
  for (const s of [-1, 1]) m.cyl([s * 0.72, 0.62, -0.3], 0.06, 0.6, L.COPPER, { n: 6 });
  // the mast: ceramic insulator stack, then the copper coil, then the projector crown
  m.cyl([0, 1.95, 0], 0.15, 1.2, L.STEEL, { n: 8 });
  for (let k = 0; k < 5; k++) m.cyl([0, 1.5 + k * 0.2, 0], 0.32 - k * 0.025, 0.07, L.CREAM, { n: 10 });
  for (let k = 0; k < 7; k++) m.cyl([0, 2.58 + k * 0.065, 0], 0.27, 0.04, L.COPPER, { n: 10, glow: k % 2 ? 1 : 0 });
  m.cyl([0, 3.05, 0], 0.36, 0.05, L.GUN, { n: 12 });
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; m.box([Math.cos(a) * 0.36, 3.12, Math.sin(a) * 0.36], [0.05, 0.28, 0.16], L.STEEL, { ry: -a, rz: 0.35 }); }
  knob(m, [0, 3.26, 0], 0.22, L.TEAL, 1);
  m.lamp([0.55, 1.47, 0.55]);
}
function habitatModel(m: MG) {
  const R = 3.2, cy = 0.5;
  m.cyl([0, 0.22, 0], 3.45, 0.44, L.CONCRETE, { n: 20 });
  m.cyl([0, 0.47, 0], 3.3, 0.08, L.MOSS, { n: 20 });
  m.cyl([0, 0.56, 0], R + 0.08, 0.14, L.STEEL, { n: 20, open: true });
  // eight glazing ribs and a riveted crown
  for (let k = 0; k < 8; k++) rib(m, cy, R + 0.02, (k / 8) * Math.PI * 2 + 0.2, 0.06, Math.PI / 2, 7, 0.07, L.GUN);
  m.cyl([0, cy + R * Math.cos(0.75) , 0], R * Math.sin(0.75) + 0.02, 0.06, L.GUN, { n: 20, open: true });
  m.cyl([0, cy + R - 0.02, 0], 0.32, 0.12, L.BRASS, { n: 10 });
  knob(m, [0, cy + R + 0.18, 0], 0.14, L.BRASS);
  // the airlock on the front
  m.box([0, 0.98, R - 0.05], [1.1, 1.0, 0.6], L.STEEL);
  m.box([0, 0.98, R + 0.26], [0.7, 0.86, 0.04], L.RED);
  m.cyl([0, 1.18, R + 0.29], 0.13, 0.03, L.GLASS, { axis: 'z', n: 10 });
  m.box([0, 0.52, R + 0.26], [1.12, 0.08, 0.02], L.HAZARD);
  // the climate unit on the left: louvred cabinet, fan, a dial, and pipes into the dome
  m.box([-R - 0.55, 0.85, 0.2], [0.8, 1.1, 1.5], L.OLIVE);
  m.box([-R - 0.96, 0.9, 0.2], [0.03, 0.7, 1.1], L.GRILLE);
  m.cyl([-R - 0.55, 1.5, 0.55], 0.32, 0.12, L.GUN, { n: 10 });
  m.cyl([-R - 0.97, 1.15, -0.32], 0.12, 0.03, L.CREAM, { axis: 'x', n: 10 });
  for (const z of [-0.3, 0.6]) m.cyl([-R + 0.05, 1.05, z], 0.07, 0.62, L.COPPER, { axis: 'x', n: 6 });
  m.lamp([-R - 0.55, 1.5, -0.4]);
}
function vatModel(m: MG) {
  m.box([0, 0.1, 0], [1.94, 0.2, 1.94], L.CONCRETE);
  m.cyl([0, 0.45, 0], 0.8, 0.5, L.BRASS, { n: 12 });
  m.cyl([0, 0.72, 0], 0.84, 0.06, L.GUN, { n: 12 });
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; m.box([Math.cos(a) * 0.8, 1.68, Math.sin(a) * 0.8], [0.06, 1.95, 0.06], L.STEEL); }
  m.cyl([0, 2.68, 0], 0.84, 0.06, L.GUN, { n: 12 });
  m.cyl([0, 2.85, 0], 0.82, 0.28, L.BRASS, { r1: 0.62, n: 12 });
  m.cyl([0, 3.1, 0], 0.6, 0.24, L.COPPER, { r1: 0.18, n: 12 });
  // the feed line: a side tank of growth medium, a valve wheel, and a pipe over the top
  m.cyl([0.72, 1.1, -0.66], 0.24, 1.3, L.OLIVE, { n: 10 });
  m.cyl([0.72, 1.82, -0.66], 0.24, 0.14, L.BRASS, { r1: 0.1, n: 10 });
  m.cyl([0.72, 2.4, -0.66], 0.05, 1.0, L.COPPER, { n: 6 });
  m.cyl([0.36, 2.92, -0.33], 0.05, 0.75, L.COPPER, { n: 6, axis: 'x' });
  m.cyl([0.98, 1.25, -0.66], 0.15, 0.03, L.RED, { axis: 'x', n: 10 });
  m.cyl([0.72, 1.4, -0.42], 0.1, 0.03, L.CREAM, { axis: 'z', n: 10 });
  m.ladder(-0.7, 0.62, 0.2, 2.7, -Math.PI / 4);
  m.lamp([0.7, 0.45, 0.7]);
}
function reactorModel(m: MG) {
  m.box([0, 0.15, 0], [2.92, 0.3, 2.92], L.CONCRETE);
  m.cyl([0, 1.25, 0], 1.15, 1.9, L.OLIVE, { n: 14 });
  for (const y of [0.55, 1.25, 1.95]) m.cyl([0, y, 0], 1.19, 0.1, L.STEEL, { n: 14, open: true });
  m.cyl([0, 2.22, 0], 1.15, 0.12, L.GUN, { n: 14 });
  // porthole onto the burn
  m.cyl([0, 1.3, 1.13], 0.36, 0.1, L.BRASS, { axis: 'z', n: 12 });
  m.cyl([0, 1.3, 1.17], 0.27, 0.08, L.LAMP, { axis: 'z', n: 12, glow: 1 });
  // the hopper, the stack, the chute, the gauge
  m.hopper([0, 2.6, 0], 0.45, 1.15, 0.65, L.GUN);
  m.cyl([-0.95, 2.6, -0.95], 0.22, 2.4, L.BRICK, { n: 8 });
  m.cyl([-0.95, 3.85, -0.95], 0.28, 0.12, L.GUN, { n: 8 });
  m.box([0.95, 0.9, 0.95], [0.5, 0.14, 1.0], L.RUST, { ry: -Math.PI / 4, rx: 0.5 });
  m.cyl([1.17, 1.6, 0], 0.16, 0.05, L.CREAM, { axis: 'x', n: 10 });
  m.cyl([-1.25, 0.7, 0.4], 0.08, 0.9, L.COPPER, { n: 6, axis: 'z' });
  m.lamp([0.85, 2.36, 0.6]);
}

// ================================================================================================ the barrier
const BARRIER_VERT = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
/** a lattice of drawn cells over the dome, snapped to a 6 cm art-pixel grid on the surface; levels index a ramp */
const BARRIER_FRAG = /* glsl */`
uniform vec3 uRamp[5]; uniform vec3 uC; uniform float uT, uPow, uUp, uR; uniform vec4 uHits[8];
varying vec3 vW; varying vec3 vN;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  if (uUp <= 0.001) discard;
  vec3 d = vW - uC;
  float az = atan(d.z, d.x), el = asin(clamp(d.y / uR, 0.0, 1.0));
  vec2 s = floor(vec2(az * uR, el * uR) / 0.06) * 0.06;
  vec2 q = s / vec2(0.92, 0.8);
  float row = floor(q.y); q.x += mod(row, 2.0) * 0.5;
  vec2 cell = floor(q), f = fract(q);
  float jx = (h21(cell) - 0.5) * 0.05, jy = (h21(cell + 7.0) - 0.5) * 0.05;
  // a squared-off hex cell: flat top and bottom, chamfered corners
  float e = min(min(f.x - jx, 1.0 - f.x + jx), min(f.y - jy, 1.0 - f.y) * 1.4);
  e = min(e, (min(f.x, 1.0 - f.x) + min(f.y, 1.0 - f.y)) * 0.75);
  float edge = step(e, 0.065);
  float band = step(0.86, fract(el * 1.3 - uT * 0.3 + h21(vec2(cell.x, 3.0)) * 0.06));
  float band2 = step(0.94, fract(az * 0.8 + uT * 0.12));
  float rim = 1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW)));
  float lvl = edge * 2.0 + band * (0.5 + edge) + band2 * edge + step(0.72, rim) + step(0.9, rim);
  for (int i = 0; i < 8; i++) {
    vec4 h = uHits[i];
    if (h.w < 0.0 || h.w > 1.2) continue;
    float dd = length(vW - h.xyz);
    lvl += step(abs(dd - h.w * 3.6), 0.2) * 2.0 * step(h.w, 0.9);
    lvl += step(dd, 0.6 - h.w * 0.4) * 3.0 * step(h.w, 0.22);
  }
  // starved of power the cells drop out and the lattice stutters
  if (h21(cell + floor(uT * 9.0)) > uPow + 0.1) lvl = min(lvl, edge);
  float k = clamp(floor(lvl + 0.001), 0.0, 4.0);
  vec3 col = k < 0.5 ? uRamp[0] : k < 1.5 ? uRamp[1] : k < 2.5 ? uRamp[2] : k < 3.5 ? uRamp[3] : uRamp[4];
  float a = k < 0.5 ? 0.05 : k < 1.5 ? 0.26 : k < 2.5 ? 0.46 : k < 3.5 ? 0.66 : 0.9;
  // pure light: added over the scene, never covering it (alpha stays 0 in the fx layer)
  gl_FragColor = vec4(col * a * uUp * 1.35, 0.0);
}`;
function barrierMesh(R: number): { mesh: THREE.Mesh; U: Record<string, THREE.IUniform> } {
  const ramp = RAMPS.glowTeal.map((c) => new THREE.Color(c));
  const U: Record<string, THREE.IUniform> = {
    uRamp: { value: ramp }, uC: { value: new THREE.Vector3() }, uT: { value: 0 }, uPow: { value: 1 }, uUp: { value: 0 }, uR: { value: R },
    uHits: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, -1)) },
  };
  const m = new THREE.ShaderMaterial({
    vertexShader: BARRIER_VERT, fragmentShader: BARRIER_FRAG, uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 56, 18, 0, Math.PI * 2, 0, Math.PI / 2), m);
  mesh.renderOrder = 4; mesh.frustumCulled = false;
  return { mesh, U };
}

// ================================================================================================ registration
let REG = false;
export function registerBioBuildings() {
  if (REG) return; REG = true;
  registerBuilding({
    kind: 'bt_field', name: 'Force-Field Generator', cat: 'bio', w: 2, d: 2, h: 3.4, power: 12, hp: 900, skill: 'bt_field',
    cost: { ore: 60, iron_pellet: 20, resin: 6, crystal: 4 },
    desc: 'A Tesla mast on a ceramic stack. Powered, it throws a shimmering lattice dome 7 m out that nothing hostile can walk through, and it takes the shots meant for the machines under it. The lattice flashes where it is struck; drained, it drops for a few seconds.',
    hooks: { model: fieldModel, tick: (b, dt) => FIELD.tick(b, dt), placed: (b) => FIELD.placed(b), removed: (b) => FIELD.removed(b), inspect: (b) => FIELD.inspect(b) },
  });
  registerBuilding({
    kind: 'bt_habitat', name: 'Engineered Habitat', cat: 'bio', w: 7, d: 7, h: 4.2, power: 3, hp: 1200, skill: 'bt_habitat', solid: false,
    cost: { soil: 60, ore: 40, glass_bead: 12, silk: 8 },
    desc: 'A glazed dome on a ring foundation, with a climate unit. Engineered stock sent to live here cannot get out, breeds (gene-locked stock breeds only here) and produces half again as fast, more in a climate that suits it. Room for six; each habitat also raises how many allies you can keep.',
    hooks: { model: habitatModel, tick: (b, dt) => HAB.tick(b, dt), placed: (b) => HAB.placed(b), removed: (b) => HAB.removed(b), inspect: (b) => HAB.inspect(b) },
  });
  registerBuilding({
    kind: 'bt_vat', name: 'Growth Vat Tank', cat: 'bio', w: 2, d: 2, h: 3.4, power: 6, hp: 700, skill: 'bt_vat', operable: true,
    cost: { ore: 30, carbon: 40, water: 40 },
    desc: 'A glass tank of warm medium on a brass base. Queue a design in the Bioworks ledger [J]: it grows in the tank in a fraction of a womb\'s time and steps out ready to work. An operator speeds it; with Cloning it grows twins.',
    hooks: { model: vatModel, tick: (b, dt) => VAT.tick(b, dt), placed: (b) => VAT.placed(b), removed: (b) => VAT.removed(b), inspect: (b) => VAT.inspect(b) },
  });
  registerBuilding({
    kind: 'bt_reactor', name: 'Bio-Reactor', cat: 'bio', w: 3, d: 3, h: 3.8, power: -25, hp: 1000, skill: 'bt_reactor', operable: true,
    cost: { ore: 40, soil: 30, carbon: 20 },
    desc: 'A riveted digester and a firebox. It drags in carcasses within 8 m and burns them, then bio-oil, algae fuel and carbon from the stores: 25 MW onto the grid while it has fuel.',
    hooks: { model: reactorModel, tick: (b, dt) => REACT.tick(b, dt), placed: (b) => REACT.placed(b), removed: (b) => REACT.removed(b), inspect: (b) => REACT.inspect(b) },
  });
}

// ================================================================================================ behaviour
let G: Game | null = null;
let BT: Biotech | null = null;
const live = new Set<any>();
const fac = () => (G as any)?.factory ?? null;
const opBoost = (b: any) => (b.operator && !b.operator.dead ? (b.operator.sp.design.genes.includes('operator_hands') ? 1.6 : 1.3) : 1);
const fx = () => G!.fx;

const FIELD = {
  placed(b: any) {
    const s = S(b); live.add(b);
    const big = !!G?.run.skills.has('bt_dome');
    s.R = big ? 9.5 : 7; s.max = big ? 900 : 450; s.shield = s.max * 0.5;
    const { mesh, U } = barrierMesh(s.R);
    mesh.position.set(b.x, b.y, b.z); (U.uC.value as THREE.Vector3).set(b.x, b.y, b.z);
    G!.world.fxScene.add(mesh); s.mesh = mesh; s.U = U; s.extra.push(mesh);
  },
  removed(b: any) { dispose(b); },
  tick(b: any, dt: number) {
    const s = S(b);
    const big = !!G?.run.skills.has('bt_dome');
    if (big && s.R < 9) { s.R = 9.5; s.max = 900; if (s.mesh) { s.mesh.geometry.dispose(); s.mesh.geometry = new THREE.SphereGeometry(s.R, 56, 18, 0, Math.PI * 2, 0, Math.PI / 2); s.U!.uR.value = s.R; } }
    if (!b.on) { b.status = 'offline'; b.running = false; return; }
    if (s.down > 0) { s.down -= dt; b.status = 'working'; b.running = true; if (s.down <= 0) { s.shield = s.max * 0.25; sfx('pulse', 1.4, 0.4 * G!.audible(b.x, b.z)); } return; }
    if (b.sat <= 0.02) { b.status = 'nopower'; b.running = false; return; }
    b.status = 'working'; b.running = true;
    s.shield = Math.min(s.max, s.shield + dt * 30 * b.sat);
  },
  inspect(b: any) { const s = S(b); return `<div>FIELD ${s.down > 0 ? '<b style="color:#a2473a">DOWN</b> · REBOOTING' : b.status === 'working' ? 'UP' : 'OFF'} · SHIELD ${Math.round(s.shield)} / ${s.max} · RADIUS ${s.R} M</div>`; },
};
const HAB = {
  placed(b: any) {
    const s = S(b); live.add(b);
    const g = new THREE.SphereGeometry(3.18, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const m = gbufNone(new THREE.MeshLambertMaterial({ color: CLIMATE_GLASS[s.climate], transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, emissive: new THREE.Color(RAMPS.glowTeal[0]), emissiveIntensity: 0.4 }));
    const glass = new THREE.Mesh(g, m); glass.position.set(b.x, b.y + 0.5, b.z); glass.renderOrder = 3;
    G!.world.scene.add(glass); s.glass = glass; s.extra.push(glass);
  },
  removed(b: any) { dispose(b); },
  tick(b: any, _dt: number) {
    if (!b.on) { b.status = 'offline'; return; }
    b.status = b.sat > 0.02 ? 'working' : 'nopower'; b.running = b.status === 'working';
  },
  inspect(b: any) { const h = BT?.habitats().find((x) => x.b === b); return `<div>CLIMATE ${S(b).climate.toUpperCase()} · ${h ? `${h.pop} / ${h.cap} LIVING HERE` : ''}${b.status === 'nopower' ? ' · <b style="color:#a2473a">CLIMATE UNIT UNPOWERED</b>' : ''}</div>`; },
};
const VAT = {
  placed(b: any) {
    const s = S(b); live.add(b);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.92, 20, 1, true), gbufNone(new THREE.MeshLambertMaterial({ color: RAMPS.water[6], transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })));
    tank.position.set(b.x, b.y + 1.68, b.z); tank.renderOrder = 3;
    const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 1.0, 20), gbufNone(new THREE.MeshLambertMaterial({ color: RAMPS.glowTeal[1], transparent: true, opacity: 0.3, depthWrite: false, emissive: new THREE.Color(RAMPS.glowTeal[1]), emissiveIntensity: 0.9 })));
    fluid.position.set(b.x, b.y + 1.2, b.z); fluid.renderOrder = 2;
    G!.world.scene.add(tank, fluid); s.tank = tank; s.fluid = fluid; s.extra.push(tank, fluid);
  },
  removed(b: any) { dispose(b); },
  tick(b: any, dt: number) {
    const s = S(b);
    if (!b.on) { b.status = 'offline'; b.running = false; return; }
    const sp = s.queue.length ? G!.run.reg.get(s.queue[0]) : null;
    if (!sp) { b.status = 'idle'; b.running = false; s.prog = 0; return; }
    if (b.sat <= 0.02) { b.status = 'nopower'; b.running = false; return; }
    const hive = G!.veyr;
    if (hive.allyCount() >= hive.allyCap()) { b.status = 'blocked'; b.note = 'No room for another ally'; return; }
    b.status = 'working'; b.running = true; b.note = '';
    s.prog += (dt / vatTime(sp)) * b.sat * opBoost(b);
    if (s.prog >= 1) { s.prog = 0; s.queue.shift(); decant(b, sp); }
  },
  inspect(b: any) { const s = S(b), sp = s.queue.length ? G!.run.reg.get(s.queue[0]) : null; return `<div>${sp ? `GROWING ${sp.name.toUpperCase()} ${Math.round(s.prog * 100)}%` : 'TANK EMPTY'} · QUEUE ${s.queue.length} · QUEUE DESIGNS IN THE BIOWORKS LEDGER [J]</div>`; },
};
const REACT = {
  placed(b: any) { live.add(b); },
  removed(b: any) { dispose(b); },
  tick(b: any, dt: number) {
    const s = S(b), f = fac();
    if (!b.on) { b.status = 'offline'; b.running = false; return; }
    // carcasses first: dragged in by the hopper's field
    if (s.fuel < 20) {
      G!.world.near(b.x, b.z, 8, (c) => {
        if (!c.dead || c.digest > 0 || c.bio <= 0.3) return;
        const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz);
        if (d > 2.2) { const k = Math.min(d - 2, 2.5 * dt); c.x += (dx / d) * k; c.z += (dz / d) * k; c.y = G!.world.surfaceY(c.x, c.z); }
        else { const take = Math.min(c.bio, 3 * dt); c.bio -= take; s.fuel += take * 5; s.burnt += take; c.fx.decay.value = Math.min(1, c.fx.decay.value + take * 0.05); if (c.bio <= 0.3) { c.bio = 0; c.fx.dissolve.value = 1; } }
      });
    }
    if (s.fuel < 6) {
      const run = G!.run;
      if (f?.take?.('algae_fuel', 1)) s.fuel += 26;
      else if (f?.take?.('bio_oil', 1)) s.fuel += 20;
      else if (run.res.carbon >= 3) { run.res.carbon -= 3; s.fuel += 15; }
    }
    if (s.fuel <= 0) { b.status = 'starved'; b.running = false; return; }
    s.fuel = Math.max(0, s.fuel - dt * (1 / opBoost(b)));
    b.status = 'working'; b.running = true;
  },
  inspect(b: any) { const s = S(b); return `<div>FUEL ${Math.round(s.fuel)} S · ${b.running ? '25 MW TO THE GRID' : 'COLD: FEED IT CARCASSES, BIO-OIL, ALGAE FUEL OR CARBON'}</div>`; },
};
function dispose(b: any) {
  const s = S(b); live.delete(b);
  for (const o of s.extra) { o.removeFromParent(); const m = o as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material)?.dispose?.(); }
  s.extra = [];
  if (s.spec) { s.spec.removeFromParent(); s.spec = null; }
}

// ------------------------------------------------------------------------------------------------ vats
export function vatTime(sp: Species) { const g = sp.design.genes; return clamp(sp.pheno.buildTime * 0.45 * (g.includes('growth_accel') ? 0.5 : 1), 6, 90); }
export function vatCost(sp: Species) { return { carbon: Math.round(clamp(sp.pheno.cost * 0.25, 8, 90)), water: Math.round(clamp(sp.pheno.cost * 0.2, 6, 70)) }; }
/** queue a species in a vat (pays now). Returns why not, or null */
export function queueVat(b: any, sp: Species): string | null {
  const s = S(b), hive = G!.veyr;
  if (s.queue.length >= 4) return 'Queue full';
  const c = vatCost(sp), why = hive.lack(c); if (why) return why;
  hive.pay(c); s.queue.push(sp.id);
  sfx('squelch', 1.2, 0.5);
  return null;
}
function decant(b: any, sp: Species) {
  const hive = G!.veyr, w = G!.world;
  const twins = G!.run.skills.has('bt_clone') && hive.allyCount() + 2 <= hive.allyCap() ? 2 : 1;
  for (let k = 0; k < twins; k++) {
    let c: Creature | null = null;
    for (let t = 0; t < 6 && !c; t++) { const a = Math.PI / 2 + (k - 0.5) * 0.9 + t * 0.7; c = w.spawn(sp, 'veyr', b.x + Math.cos(a) * (1.8 + sp.pheno.length * 0.4), b.z + Math.sin(a) * (1.8 + sp.pheno.length * 0.4), false); }
    if (!c) continue;
    c.energy = 0.95; c.homeX = c.x; c.homeZ = c.z; c.hp = c.maxHp;
    hive.allies.add(c); (hive as any).mark?.(c);
    c.fx.dissolve.value = 1; (c as any).__print = 1;
    fx().burst(c.x, c.y + c.size * 0.4, c.z, 20, RAMPS.glowTeal[2], { glow: true, speed: 1.2, up: 2, size: 2.4, life: 1, grav: 0 });
    vfx2d.drops(b.x, b.y + 1.0, b.z, 10, { speed: 1.6, up: 2.2, ramp: 'glowTeal', land: 'wet' });
  }
  sfx('birth', 1, 0.7 * G!.audible(b.x, b.z)); sfx('squelch', 0.7, 0.5);
  toast(`<b>${sp.name}</b> decanted from the vat${twins > 1 ? ' (twins)' : ''}`, 'good', 2600);
  G!.emit('print', { species: sp.name, n: twins });
}

// ================================================================================================ per frame
/** the shimmer, the specimens, the smoke, and the barrier's work: push hostiles out, take hits */
export function updateStructures(dt: number, t: number) {
  if (!G || !BT) return;
  const f = fac(); if (!f) return;
  for (const b of [...live]) {
    if (b.dead || !f.buildings.includes(b)) { dispose(b); continue; }
    const s = S(b);
    switch (b.kind) {
      case 'bt_field': {
        const up = b.status === 'working' && s.down <= 0 && b.rise >= 0.99 ? 1 : 0;
        s.up += (up - s.up) * Math.min(1, dt * (up ? 2.5 : 6));
        const U = s.U!; U.uT.value = t; U.uUp.value = s.up * (s.down > 0 ? 0 : 1); U.uPow.value = clamp(b.sat * (0.4 + 0.6 * s.shield / s.max), 0, 1);
        for (let i = 0; i < 8; i++) { const h = s.hits[i]; if (h.w >= 0) h.w += dt; (U.uHits.value as THREE.Vector4[])[i].copy(h); }
        if (s.up > 0.5) shieldWork(b, s, dt);
        if (s.up > 0.1 && Math.random() < dt * 2) vfx2d.play('spark', b.x + (Math.random() - 0.5) * 0.4, b.y + 3.26, b.z + (Math.random() - 0.5) * 0.4, { ramp: 'glowTeal', scale: 0.6 });
        break;
      }
      case 'bt_habitat': {
        const m = s.glass?.material as THREE.MeshLambertMaterial | undefined;
        if (m) { m.color.setHex(CLIMATE_GLASS[s.climate]); m.emissiveIntensity = b.status === 'working' ? 0.45 + 0.05 * Math.sin(t * 1.3) : 0.1; }
        BT.contain({ x: b.x, z: b.z, R: s.R2, b });
        if (b.status === 'working' && Math.random() < dt * 0.6) vfx2d.play('smoke', b.x - 3.75, b.y + 1.6, b.z + 0.55, { ramp: s.climate === 'arctic' ? 'snow' : 'sky', scale: 0.5 });
        break;
      }
      case 'bt_vat': {
        const sp = s.queue.length ? G.run.reg.get(s.queue[0]) : null;
        if (sp && s.specSp !== sp.id) { if (s.spec) s.spec.removeFromParent(); try { s.spec = makeInstance(sp.model).mesh; G.world.scene.add(s.spec); } catch { s.spec = null; } s.specSp = sp.id; }
        if (!sp && s.spec) { s.spec.removeFromParent(); s.spec = null; s.specSp = -1; }
        if (s.spec) {
          const L0 = Math.max(0.3, Math.max(sp!.pheno.length, sp!.pheno.height)), fit = 1.25 / L0;
          s.spec.scale.setScalar(fit * (0.25 + 0.75 * s.prog));
          s.spec.position.set(b.x, b.y + 1.1 + Math.sin(t * 1.1) * 0.05, b.z); s.spec.rotation.set(Math.sin(t * 0.7) * 0.15, t * 0.25, 0);
        }
        if (s.fluid) { const lvl = sp ? 0.5 + 0.5 * Math.min(1, s.prog * 3) : 0.15; s.fluid.scale.y = lvl * 1.85; s.fluid.position.y = b.y + 0.72 + lvl * 0.925; }
        if (sp && b.status === 'working' && Math.random() < dt * 4) vfx2d.play('drop', b.x + (Math.random() - 0.5) * 0.9, b.y + 0.9, b.z + (Math.random() - 0.5) * 0.9, { ramp: 'glowTeal', vel: [0, 0.6, 0], scale: 0.6 });
        break;
      }
      case 'bt_reactor': {
        if (b.running) { s.smokeT -= dt; if (s.smokeT <= 0) { s.smokeT = 0.5; vfx2d.play('smoke', b.x - 0.95, b.y + 4.1, b.z - 0.95, { ramp: 'stone', scale: 1, vel: [0.1, 0.8, 0] }); } }
        break;
      }
    }
  }
}
/** push every hostile out to the shell; take the hits on the machines under it */
function shieldWork(b: any, s: BtState, dt: number) {
  const w = G!.world, R = s.R;
  const strike = (x: number, y: number, z: number, dmg: number) => {
    const h = s.hits[s.hitI]; s.hitI = (s.hitI + 1) % 8; h.set(x, y, z, 0);
    s.shield -= dmg;
    vfx2d.play('spark', x, y, z, { ramp: 'glowTeal', scale: 0.9 });
    if (Math.random() < 0.4) sfx('zap', 1.6, 0.3 * G!.audible(x, z));
    if (s.shield <= 0) { s.shield = 0; s.down = 6; vfx2d.play('shock', b.x, b.y + 2, b.z, { ramp: 'glowTeal', scale: 3 }); sfx('crack', 0.6, 0.8 * G!.audible(b.x, b.z)); toast('A force field has collapsed. It reboots in a few seconds.', 'warn', 2400); }
  };
  const push = (o: { x: number; z: number; radius?: number; vx?: number; vz?: number }, isC: boolean) => {
    const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz) || 0.01, r = o.radius ?? 0.5;
    if (d >= R + r) return;
    const nx = dx / d, nz = dz / d;
    o.x = b.x + nx * (R + r + 0.05); o.z = b.z + nz * (R + r + 0.05);
    if (isC) { const c = o as Creature; const vn = c.vx * nx + c.vz * nz; if (vn < 0) { c.vx -= vn * nx * 1.6; c.vz -= vn * nz * 1.6; } c.y = w.surfaceY(c.x, c.z); }
    const last = (o as any).__ffT ?? -9;
    if (w.time - last > 0.35) { (o as any).__ffT = w.time; const gy = w.surfaceY(b.x + nx * R, b.z + nz * R); strike(b.x + nx * R, Math.max(b.y + 0.4, gy + 0.8), b.z + nz * R, isC ? 6 + ((o as Creature).mass ?? 10) * 0.05 : 10); }
  };
  w.near(b.x, b.z, R + 3, (c) => { if (c.dead || c.faction === 'veyr') return; push(c, true); });
  for (const u of BT!.units$()) if (!u.dead && u.faction !== 'veyr') push(u as Hostile & { radius?: number }, false);
  // the machines under the dome: hits on them land on the shell instead
  const f = fac();
  for (const m of f.buildings) {
    if (m.__ffWrap || m.dead || Math.hypot(m.x - b.x, m.z - b.z) > R) continue;
    const orig = m.damage.bind(m);
    m.__ffWrap = 1;
    m.damage = (n: number, by?: any) => {
      const cover = [...live].find((q) => q.kind === 'bt_field' && !q.dead && S(q).up > 0.5 && S(q).down <= 0 && Math.hypot(q.x - m.x, q.z - m.z) < S(q).R);
      if (cover && n > 0) {
        const qs = S(cover);
        const ax = by?.x ?? cover.x + 1, az = by?.z ?? cover.z, dx = ax - cover.x, dz = az - cover.z, d = Math.hypot(dx, dz) || 1;
        const h = qs.hits[qs.hitI]; qs.hitI = (qs.hitI + 1) % 8; h.set(cover.x + (dx / d) * qs.R, cover.y + 1.6, cover.z + (dz / d) * qs.R, 0);
        qs.shield -= n;
        vfx2d.play('spark', h.x, h.y, h.z, { ramp: 'glowTeal', scale: 1 });
        if (qs.shield <= 0) { qs.shield = 0; qs.down = 6; }
        return;
      }
      orig(n, by);
    };
  }
  void dt;
}

/** habitats for the runtime: where, how big, how full, what climate */
function habitats() {
  const f = fac(); if (!f) return [];
  const out: { x: number; z: number; R: number; cap: number; pop: number; climate: string; b: any }[] = [];
  for (const b of f.buildings) {
    if (b.kind !== 'bt_habitat' || b.dead || b.rise < 0.99) continue;
    const s = S(b);
    let pop = 0; if (BT) for (const w of BT.workers.values()) if (w.job === 'habitat' && w.hab?.b === b) pop++;
    out.push({ x: b.x, z: b.z, R: s.R2, cap: 6, pop, climate: s.climate, b });
  }
  return out;
}
export function cycleClimate(b: any) { const s = S(b); s.climate = CLIMATES[(CLIMATES.indexOf(s.climate) + 1) % CLIMATES.length]; return s.climate; }
export const stateOf = S;

/** wire the structures to a running game */
export function attachStructures(game: Game, bt: Biotech) {
  G = game; BT = bt;
  registerBioBuildings();
  for (const b of [...live]) dispose(b);
  live.clear();
  bt.habitats = habitats;
  bt.fieldAt = (x, z) => { for (const b of live) if (b.kind === 'bt_field' && S(b).up > 0.5 && Math.hypot(b.x - x, b.z - z) < S(b).R) return true; return false; };
  // each habitat raises the ally cap by four
  const hive = game.veyr, prevCap = hive.allyCap.bind(hive);
  hive.allyCap = () => prevCap() + 4 * habitats().length;
  let t = 0;
  game.update$.push((dt) => { t += dt; try { updateStructures(dt, t); } catch (e) { console.error('biotech structures', e); } });
}
registerBioBuildings();

// The FITTING BAY: the lab room re-dressed as an engineering bay when the lab switches to fitting robotic parts.
// Everything is built from the Limbophobia kit (src/limbo: the ModelBuilder's faceted primitives and its atlas of
// hand-painted pixel-art textures, 32 px a metre), so every surface is drawn: riveted steel wall panels with
// vents and hazard signage, a floor grate over concrete, a ceiling of trays and pipes, server racks and tape
// mainframes, a bank of CRTs, a workbench, a tool chest, steel shelving where the parts wait on their racks, power
// cabinets and a transformer humming in the corner. Two industrial robot arms on floor turrets flank the tank; when a
// part is fitted one swings in, its welder flares and sparks fly. Big screens over the bench carry live readouts of
// the worker being built. Light: cold spots on the tank, warm sodium on the walls, the tank's own teal rim light,
// and haze hanging in the beams.
import * as THREE from 'three';
import { ModelBuilder } from '../limbo/gfx/modelBuilder';
import { worldMaterial } from '../limbo/gfx/materials';
import { registerAllTextures } from '../limbo/gfx/textures/index';
import { buildObjGeometry } from '../limbo/world/objects';
import '../limbo/content/textures/materials';
import '../limbo/content/furniture/b_lab';
import '../limbo/content/furniture/b_industrial';
import type { Fx } from '../game/fx';
import { placeModel } from '../ship/hub/models';
import { GN_DECL, gbuf, F_EMIT } from '../gfx/gbuf';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WorkerProfile } from '../life/cyber/roles';
import { SKILLS, SLOT_NAME, CYBER, type Slot } from '../life/cyber/catalog';

const TAU = Math.PI * 2;
// the lowpix-built part models (src/ui/assets/cyber/*.glb, specs beside them), normalised to a unit radius
const PART_URLS = import.meta.glob('./assets/cyber/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const partUrl = (id: string) => { const f = id === 'cy_hydfore' || id === 'cy_hydhind' ? 'cy_hydleg' : id; return Object.entries(PART_URLS).find(([k]) => k.endsWith('/' + f + '.glb'))?.[1]; };
const partCache = new Map<string, Promise<THREE.Object3D | null>>();
let gltf: GLTFLoader | null = null;
export function loadPart(id: string): Promise<THREE.Object3D | null> {
  let p = partCache.get(id); if (p) return p;
  const url = partUrl(id);
  if (!url) { p = Promise.resolve(null); partCache.set(id, p); return p; }
  gltf ??= new GLTFLoader();
  p = gltf.loadAsync(url).then((g) => {
    const root = g.scene;
    root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const src = m.material as THREE.MeshBasicMaterial; const map = src.map ?? null; if (map) { map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.NearestFilter; } m.material = gbuf(new THREE.MeshLambertMaterial({ map, emissive: 0x111111 }), 1); m.castShadow = true; });
    const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2 || 1;
    const holder = new THREE.Group(); root.position.sub(c); holder.add(root); holder.scale.setScalar(1 / r);
    return holder;
  }).catch((e) => { console.warn('cyber part', id, e); return null; });
  partCache.set(id, p);
  return p;
}
const X0 = -6.8, X1 = 6.8, Z0 = -5.2, Z1 = 7, H = 4.8;

const HAZE_V = 'varying vec3 vP; varying vec2 vUv; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const HAZE_F = GN_DECL + `uniform vec3 uCol; uniform float uT, uK; varying vec2 vUv;
void main(){
  // a beam of light in the haze: brightest near the lamp, fading down the cone and toward its edges, drifting motes
  float down = vUv.y, edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float a = pow(down, 1.6) * pow(max(edge, 0.0), 1.4) * uK;
  float mote = step(0.985, fract(sin(floor(vUv.x * 90.0) * 12.9898 + floor((vUv.y + uT * 0.02) * 60.0) * 78.233) * 43758.5453));
  a *= 0.85 + 0.3 * mote;
  gl_FragColor = vec4(uCol * a, a);
  gNormal = vec4(0.5, 0.5, 1.0, 0.0);
}`;

interface Arm { base: THREE.Group; turret: THREE.Group; upper: THREE.Group; lower: THREE.Group; wrist: THREE.Group; tip: THREE.Object3D; l1: number; l2: number; rest: THREE.Vector3; goal: THREE.Vector3; cur: THREE.Vector3; busy: number; side: number }

export class FitBay {
  readonly root = new THREE.Group();
  private mat: THREE.Material; private glow: THREE.Material;
  private arms: Arm[] = [];
  private screens: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; kind: 'profile' | 'skills' | 'scope' }[] = [];
  private hazes: THREE.ShaderMaterial[] = [];
  private rack: THREE.Vector3[] = []; private rackUsed = 0;
  private prof: WorkerProfile | null = null; private slot: Slot = 'tool';
  private t = 0; private scrT = 0; private sparks = 0;
  private weld: THREE.PointLight;
  constructor(readonly fx: Fx) {
    registerAllTextures();
    this.mat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
    this.glow = worldMaterial({ noVis: true, noFog: true, noGrid: true, unlit: true });
    this.root.visible = false;
    this.shell();
    this.props();
    this.arms.push(this.arm(-1), this.arm(1));
    this.cables();
    this.lights();
    this.weld = new THREE.PointLight(0xbfe4ff, 0, 4, 1.6); this.root.add(this.weld);
  }
  private mesh(mb: ModelBuilder, parent: THREE.Object3D = this.root, glow = false) {
    const m = new THREE.Mesh(mb.build(), glow ? this.glow : this.mat); m.castShadow = true; m.receiveShadow = true; m.name = 'lab:bay'; parent.add(m); return m;
  }
  private obj(key: string, x: number, z: number, ry = 0, y = 0, s = 1) {
    const g = buildObjGeometry(key); if (!g) return null;
    const m = new THREE.Mesh(g, this.mat); m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s); m.castShadow = true; m.receiveShadow = true; this.root.add(m); return m;
  }

  // ---------------------------------------------------------------------------------------------- the room
  private shell() {
    const mb = new ModelBuilder();
    // floor: concrete with a steel grate band round the tank and service plates
    mb.box((X0 + X1) / 2, -0.1, (Z0 + Z1) / 2, X1 - X0, 0.1, Z1 - Z0, 'concrete', { bevel: false });
    for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) { if (Math.abs(x + 0.5) < 2 && Math.abs(z + 0.5) < 2) continue; mb.box(x + 0.5, 0, z + 0.5, 0.98, 0.012, 0.98, 'q_floor_grate', { fit: { top: true }, bevel: false }); }
    for (const [x, z] of [[-4.6, 2.6], [4.4, 2.2], [-4.4, -3.2], [4.6, -3.4]]) mb.box(x, 0, z, 0.9, 0.015, 0.9, 'q_manhole', { fit: { top: true }, bevel: false });
    // walls: painted steel panels over a dark plinth, ribs between the panels, a trim line, vents and signs
    const wall = (ax: number, az: number, bx: number, bz: number) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 1.6), dx = (bx - ax) / n, dz = (bz - az) / n, ang = Math.atan2(bz - az, bx - ax);
      for (let i = 0; i < n; i++) {
        const cx = ax + dx * (i + 0.5), cz = az + dz * (i + 0.5);
        mb.push().translate(cx, 0, cz).rotateY(-ang);
        mb.box(0, 0, 0, 1.6, 0.9, 0.12, 'metal_dark', { bevel: false });
        mb.box(0, 0.9, 0, 1.58, 2.3, 0.08, 'metal_painted_green', { uvOffset: [i * 1.7, 0], bevel: false });
        mb.box(0, 3.2, 0, 1.58, H - 3.2, 0.08, 'metal_sheet', { uvOffset: [i * 0.9, 0.3], bevel: false });
        mb.box(0.8, 0, 0.06, 0.12, H, 0.1, 'metal_grey');
        mb.box(0, 3.16, 0.06, 1.6, 0.08, 0.06, 'metal_brass');
        if (i % 3 === 1) mb.box(0, 2.45, 0.05, 0.62, 0.6, 0.03, 'q_vent_wall', { fit: { south: true }, bevel: false });
        if (i % 4 === 2) mb.box(0, 1.55, 0.05, 0.46, 0.34, 0.02, i % 8 === 2 ? 'q_hv_sign' : 'q_caution_sign', { fit: { south: true }, bevel: false });
        mb.pop();
      }
    };
    wall(X0, Z0, X1, Z0);
    wall(X1, Z0, X1, Z1);
    wall(X0, Z1, X0, Z0);
    // ceiling: concrete slab, steel joists, a cable tray and lamp strips
    mb.box(0, H, (Z0 + Z1) / 2, X1 - X0, 0.12, Z1 - Z0, 'ceil_concrete', { bevel: false });
    for (const z of [-3.6, -1.2, 1.2, 3.6]) mb.box(0, H - 0.3, z, X1 - X0, 0.3, 0.2, 'metal_dark');
    mb.box(-2.2, H - 0.62, 0.4, 0.5, 0.08, Z1 - Z0 - 0.6, 'q_rack_deck');
    for (const z of [-3.0, 0.4, 3.4]) for (const x of [-3.6, 3.6]) mb.box(x, H - 0.42, z, 1.4, 0.06, 0.18, 'q_lamp_strip', { emissive: 1.4 });
    this.mesh(mb);
    // wall pipes
    const pb = new ModelBuilder();
    for (const [y, r, t] of [[4.2, 0.08, 'metal_rusty'], [4.0, 0.05, 'plastic_yellow'], [3.82, 0.09, 'metal_grey']] as [number, number, string][]) {
      pb.cylinderX(0, y, Z0 + 0.25, r, X1 - X0 - 0.4, 8, t);
      for (let x = X0 + 0.9; x < X1; x += 1.6) pb.box(x, y - r - 0.04, Z0 + 0.18, 0.06, 0.08, 0.16, 'metal_dark');
    }
    pb.cylinder(X1 - 0.3, 0.3, Z0 + 0.42, 0.08, 3.9, 8, 'metal_rusty');
    this.mesh(pb);
  }
  private props() {
    // the back wall: tape mainframes, a wall of CRTs, server racks, power cabinets
    this.obj('tape_mainframe', -4.4, Z0 + 0.6, 0);
    this.obj('tape_mainframe', -1.9, Z0 + 0.6, 0);
    this.obj('server_rack', 1.1, Z0 + 0.55, 0); this.obj('server_rack', 1.8, Z0 + 0.55, 0); this.obj('server_rack', 2.5, Z0 + 0.55, 0);
    this.obj('electrical_cabinet', 4.0, Z0 + 0.45, 0); this.obj('transformer', 5.5, Z0 + 0.7, 0);
    // left wall: workbench and the tool chest, steel shelving with the parts waiting on it
    this.obj('workbench', X0 + 0.6, -1.6, Math.PI / 2); this.obj('tool_chest', X0 + 0.6, 0.2, Math.PI / 2);
    this.obj('shelf_metal', X0 + 0.55, 1.6, Math.PI / 2); this.obj('shelf_metal', X0 + 0.55, 2.7, Math.PI / 2);
    for (const z of [1.6, 2.7]) for (const y of [0.5, 1.15, 1.8]) this.rack.push(new THREE.Vector3(X0 + 0.62, y + 0.12, z));
    // right wall: terminals, a fume hood (the parts' bath), a cryo pod, the generator, drums
    this.obj('terminal_lab', X1 - 0.6, -2.6, -Math.PI / 2); this.obj('terminal_lab', X1 - 0.6, -1.6, -Math.PI / 2);
    this.obj('fume_hood', X1 - 0.55, 0.3, -Math.PI / 2); this.obj('cryo_pod', X1 - 1.1, 2.4, -Math.PI / 2);
    this.obj('generator', 3.6, 3.6, -0.6); this.obj('barrel_oil', 4.6, 4.4, 0.3); this.obj('barrel_oil', 5.2, 4.0, 1.1);
    this.obj('hazard_barrier', -2.2, 2.6, 0.4); this.obj('hazard_barrier', 2.3, 2.4, -0.5);
    this.obj('pipes_cluster', X1 - 0.35, -4.2, -Math.PI / 2); this.obj('pipes_cluster', X0 + 0.35, -4.2, Math.PI / 2);
    this.obj('lab_cabinet', -5.6, -3.4, Math.PI / 2);
    this.obj('pallet_boxes', -4.9, 4.4, 0.3);
    // real props (Poly Haven CC0, restyled by the user's lowpix converter): the welding cart and gas by the left arm,
    // the tool chest and hand truck by the right, the bench vice and meter on the workbench, extinguisher, camera, lamps
    const P = (id: string, x: number, z: number, ry = 0, y = 0, s = 1) => placeModel(this.root, id, { x, y, z, ry, s });
    P('portable_welding_cart', -3.1, 1.7, 0.7); P('propane_tank', -3.7, 0.7, 0.2); P('small_lpg_tank', -3.35, 0.35, 1.2);
    P('metal_tool_chest', 3.1, 2.0, -0.6); P('hand_truck', 4.7, 1.1, -1.1); P('power_box_01', X1 - 0.12, 1.3, 1.5, -Math.PI / 2);
    P('bench_vice_01', X0 + 0.62, -1.25, Math.PI / 2, 0.98); P('retro_multimeter', X0 + 0.7, -2.0, Math.PI / 2 + 0.3, 0.98); P('circuit_board', X0 + 0.66, -1.65, 0.4, 0.99);
    P('korean_fire_extinguisher_01', 5.9, -2.3, -0.4); P('old_military_crate', -5.2, 3.2, 0.2); P('plastic_crate_03', -4.5, 3.7, -0.3);
    P('security_camera_01', X1 - 0.35, -4.7, -2.4, 3.9); P('industrial_wall_lamp', X0 + 0.08, -0.5, Math.PI / 2, 2.9); P('industrial_wall_lamp', X1 - 0.08, 1.0, -Math.PI / 2, 2.9);
    P('metal_jerrycan', 2.6, 3.2, 0.9); P('oil_tin', 2.9, 3.0, 0.2);
  }
  // ---------------------------------------------------------------------------------------------- robot arms
  /** an industrial arm on a floor turret beside the tank: a yellow upper link and forearm, a wrist and a welder */
  private arm(side: number): Arm {
    const base = new THREE.Group(); base.position.set(side * 2.05, 0, 0.9); this.root.add(base);
    const ped = new ModelBuilder();
    ped.cylinder(0, 0, 0, 0.42, 0.18, 10, 'metal_dark').cylinder(0, 0.18, 0, 0.32, 0.5, 10, 'plastic_yellow').cylinder(0, 0.68, 0, 0.36, 0.08, 10, 'metal_grey');
    ped.box(0, 0.25, 0.3, 0.24, 0.2, 0.06, 'q_caution_sign', { fit: { south: true }, bevel: false });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ped.cylinder(Math.sin(a) * 0.36, 0.17, Math.cos(a) * 0.36, 0.03, 0.03, 6, 'metal_brass'); }
    this.mesh(ped, base);
    const turret = new THREE.Group(); turret.position.y = 0.76; base.add(turret);
    const tb = new ModelBuilder();
    tb.box(0, 0, 0, 0.5, 0.38, 0.56, 'plastic_yellow').cylinderX(0, 0.34, 0, 0.2, 0.62, 10, 'metal_dark').box(0, 0.05, -0.3, 0.28, 0.26, 0.1, 'q_meter_panel', { fit: { north: true } });
    this.mesh(tb, turret);
    const l1 = 1.25, l2 = 1.1;
    const upper = new THREE.Group(); upper.position.y = 0.34; turret.add(upper);
    const ub = new ModelBuilder();
    ub.box(0, 0, 0, 0.26, l1, 0.3, 'plastic_yellow').box(0.15, 0.1, 0, 0.04, l1 * 0.8, 0.2, 'metal_dark').box(-0.15, 0.1, 0, 0.04, l1 * 0.8, 0.2, 'metal_dark');
    ub.cylinder(0, l1 * 0.25, -0.2, 0.06, l1 * 0.55, 8, 'metal_grey').cylinder(0, l1 * 0.75, -0.2, 0.035, l1 * 0.2, 6, 'chrome');
    ub.cylinderX(0, l1, 0, 0.17, 0.42, 10, 'metal_dark');
    ub.box(0, l1 * 0.5, 0.155, 0.16, 0.22, 0.01, 'q_caution_sign', { fit: { south: true }, bevel: false });
    this.mesh(ub, upper);
    const lower = new THREE.Group(); lower.position.y = l1; upper.add(lower);
    const lb = new ModelBuilder();
    lb.box(0, 0, 0, 0.2, l2, 0.22, 'plastic_yellow').cylinder(0.12, l2 * 0.2, 0, 0.03, l2 * 0.6, 6, 'rubber_black').cylinderX(0, l2, 0, 0.12, 0.3, 8, 'metal_dark');
    this.mesh(lb, lower);
    const wrist = new THREE.Group(); wrist.position.y = l2; lower.add(wrist);
    const wb = new ModelBuilder();
    wb.cylinder(0, 0, 0, 0.09, 0.22, 8, 'metal_grey').cylinder(0, 0.22, 0, 0.12, 0.08, 8, 'metal_dark').cylinder(0, 0.3, 0, 0.035, 0.26, 6, 'metal_brass', { rTop: 0.02 });
    wb.cylinder(-0.08, 0.06, 0.06, 0.05, 0.2, 6, 'plastic_red').cylinder(0.08, 0.06, 0.06, 0.05, 0.2, 6, 'plastic_blue');
    this.mesh(wb, wrist);
    const tg = new ModelBuilder(); tg.cylinder(0, 0.55, 0, 0.022, 0.03, 6, 'led_green', { emissive: 2 }); this.mesh(tg, wrist, true);
    const tip = new THREE.Object3D(); tip.position.y = 0.58; wrist.add(tip);
    const rest = new THREE.Vector3(side * 1.6, 2.4, 1.2);
    return { base, turret, upper, lower, wrist, tip, l1, l2, rest, goal: rest.clone(), cur: rest.clone(), busy: 0, side };
  }
  /** two-bone reach in the arm's own vertical plane, the turret yawing to face the goal */
  private solve(a: Arm) {
    const b = a.base.position, sx = a.cur.x - b.x, sz = a.cur.z - b.z;
    a.turret.rotation.y = Math.atan2(sx, sz);
    const sh = new THREE.Vector3(0, 0.76 + 0.34, 0).add(b), dx = Math.hypot(sx, sz), dy = a.cur.y - sh.y;
    const reach = a.l1 + a.l2 + 0.5, D = Math.min(Math.hypot(dx, dy), reach * 0.98);
    const l1 = a.l1, l2 = a.l2 + 0.5;
    const cosB = (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), base = Math.atan2(dx, dy);
    const s = base - Math.acos(Math.max(-1, Math.min(1, cosB)));
    const cosE = (l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2);
    a.upper.rotation.x = s; a.lower.rotation.x = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosE)));
    a.wrist.rotation.x = Math.PI * 0.5 - s - a.lower.rotation.x + 0.3;
  }
  /** an arm swings in to a point on the specimen and welds the part on */
  fitAt(p: THREE.Vector3) {
    const a = this.arms.reduce((best, x) => (Math.abs(x.side - Math.sign(p.x || 1)) < Math.abs(best.side - Math.sign(p.x || 1)) ? x : best), this.arms[0]);
    a.goal.copy(p).add(new THREE.Vector3(a.side * 0.25, 0.15, 0.25)); a.busy = 2.2;
    this.sparks = 1.6;
  }
  // ---------------------------------------------------------------------------------------------- cables, screens
  private cables() {
    const mb = new ModelBuilder();
    // power runs from the ceiling tray down to the arm turrets and the tank cap
    const run = (pts: [number, number, number][], r: number, tex: string) => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1], len = Math.hypot(bx - ax, by - ay, bz - az);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz), new THREE.Vector3(0, 1, 0));
        mb.push().translate(ax, ay, az).matrix(new THREE.Matrix4().extractRotation(m)).rotateX(-Math.PI / 2).cylinder(0, -len, 0, r, len, 6, tex, { caps: false }).pop();
      }
    };
    for (const s of [-1, 1]) {
      run([[s * 2.2, H - 0.62, 0.4], [s * 2.3, 3.0, 0.7], [s * 2.15, 1.4, 0.95], [s * 2.05, 0.95, 0.95]], 0.05, 'rubber_black');
      run([[s * 2.0, H - 0.62, 0.2], [s * 1.9, 3.2, 0.5], [s * 2.0, 1.6, 0.85]], 0.03, s < 0 ? 'plastic_red' : 'plastic_yellow');
    }
    run([[-2.2, H - 0.62, -1.0], [-1.2, 4.2, -0.6], [-0.6, 3.6, -0.4]], 0.06, 'rubber_black');
    run([[-2.2, H - 0.62, -1.6], [-0.4, 4.4, -0.9], [0.2, 3.65, -0.6]], 0.04, 'plastic_blue');
    this.mesh(mb);
  }
  private monitors() {
    // three big readout screens on a steel gantry over the bench line, angled down at the tank
    const frame = new ModelBuilder();
    frame.box(0, 3.2, Z0 + 0.9, 7.6, 0.12, 0.16, 'metal_dark');
    for (const x of [-3.7, 3.7]) frame.box(x, 0, Z0 + 0.9, 0.14, 3.2, 0.14, 'metal_grey');
    this.mesh(frame);
    const kinds: ('profile' | 'skills' | 'scope')[] = ['scope', 'profile', 'skills'];
    kinds.forEach((kind, i) => {
      const x = -2.6 + i * 2.6, w = 2.2, h = 1.3, g = new THREE.Group(); g.position.set(x, 3.95, Z0 + 1.0); g.rotation.x = 0.18; this.root.add(g);
      const bz = new ModelBuilder(); bz.box(0, -h / 2 - 0.08, -0.08, w + 0.16, h + 0.16, 0.14, { all: 'metal_dark', south: 'q_crt_body' }); bz.box(0, h / 2 + 0.08, -0.03, w + 0.2, 0.06, 0.18, 'metal_grey'); this.mesh(bz, g);
      const cv = document.createElement('canvas'); cv.width = 440; cv.height = 260;
      const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gbuf(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), F_EMIT));
      scr.position.z = 0.0; scr.name = 'lab:screen'; g.add(scr);
      this.screens.push({ cv, tex, kind });
    });
  }
  private lights() {
    // cold work lights on the tank, warm sodium washes on the walls, haze cones under each
    for (const [x, z, col, k] of [[-1.6, 1.4, 0xd8ecff, 70], [1.7, -0.8, 0x9fe8ff, 50]] as [number, number, number, number][]) {
      const s = new THREE.SpotLight(col, k, 9, 0.42, 0.6, 1.4); s.position.set(x, H - 0.5, z); s.target.position.set(0, 1.4, 0); this.root.add(s, s.target);
      this.haze(new THREE.Vector3(x, H - 0.5, z), new THREE.Vector3(0, 0.6, 0), 0.08, 1.1, 0xbfe0ff, 0.16);
    }
    for (const [x, z] of [[-5.6, 1.5], [5.4, -2.0]] as [number, number][]) {
      const l = new THREE.PointLight(0xffb060, 9, 7, 1.6); l.position.set(x, 3.6, z); this.root.add(l);
      this.haze(new THREE.Vector3(x, H - 0.45, z), new THREE.Vector3(x, 0.2, z), 0.1, 1.4, 0xffb870, 0.07);
    }
  }
  private haze(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, col: number, k: number) {
    const len = from.distanceTo(to), geo = new THREE.CylinderGeometry(r0, r1, len, 20, 1, true);
    geo.translate(0, -len / 2, 0);
    const m = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(col) }, uT: { value: 0 }, uK: { value: k } }, vertexShader: HAZE_V, fragmentShader: HAZE_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m); mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    mesh.renderOrder = 8; mesh.name = 'lab:haze'; this.root.add(mesh); this.hazes.push(m);
  }
  /** a fitted part waiting on the shelves (its preview model) */
  shelve(geo: THREE.BufferGeometry, tex: THREE.Texture) {
    const at = this.rack[this.rackUsed++ % this.rack.length];
    const m = new THREE.Mesh(geo, gbuf(new THREE.MeshLambertMaterial({ map: tex }), 1)); m.scale.setScalar(0.24); m.position.copy(at).add(new THREE.Vector3(0.05, 0.12, 0)); m.rotation.y = Math.PI / 2 + (this.rackUsed % 3) * 0.4; m.castShadow = true; this.root.add(m);
  }
  setProfile(p: WorkerProfile, slot: Slot) { this.prof = p; this.slot = slot; this.scrT = 0; }

  // ---------------------------------------------------------------------------------------------- candidate parts
  /** the parts that fit the picked slot float round the specimen, each a lowpix-built model turning slowly; the
   *  player drags one onto the body */
  readonly cands: { id: string; obj: THREE.Group; home: THREE.Vector3; pos: THREE.Vector3; held: boolean; hover: number; spin: number }[] = [];
  showCandidates(ids: string[], centre: THREE.Vector3, radius: number) {
    this.clearCandidates();
    const n = ids.length;
    ids.forEach((id, i) => {
      const a = -Math.PI * 0.45 + (n === 1 ? 0.45 * Math.PI : (i / (n - 1)) * Math.PI * 0.9), home = new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius * 0.55 + 0.4).add(centre);
      const obj = new THREE.Group(); obj.position.copy(home); obj.scale.setScalar(0.001); this.root.add(obj);
      loadPart(id).then((m) => { if (m && obj.parent) obj.add(m.clone(true)); });
      this.cands.push({ id, obj, home, pos: home.clone(), held: false, hover: 0, spin: i * 1.7 });
    });
  }
  clearCandidates() { for (const c of this.cands) c.obj.removeFromParent(); this.cands.length = 0; }
  /** which candidate sits under a screen point (by its projected position) */
  candidateAt(x: number, y: number, cam: THREE.Camera): number {
    let best = -1, bd = 70 * 70;
    this.cands.forEach((c, i) => { const p = c.obj.position.clone().project(cam), sx = (p.x * 0.5 + 0.5) * innerWidth, sy = (-p.y * 0.5 + 0.5) * innerHeight, d = (sx - x) ** 2 + (sy - y) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // ---------------------------------------------------------------------------------------------- frame
  update(dt: number) {
    if (!this.root.visible) return;
    this.t += dt; const t = this.t;
    for (const a of this.arms) {
      a.busy = Math.max(0, a.busy - dt);
      if (a.busy <= 0) a.goal.copy(a.rest).add(new THREE.Vector3(Math.sin(t * 0.4 + a.side) * 0.12, Math.sin(t * 0.53 + a.side * 2) * 0.1, Math.cos(t * 0.35) * 0.1));
      a.cur.lerp(a.goal, 1 - Math.exp(-3 * dt));
      this.solve(a);
    }
    // the welder flares while an arm works
    this.sparks = Math.max(0, this.sparks - dt);
    const busy = this.arms.find((a) => a.busy > 0 && a.busy < 1.7);
    if (busy) {
      const p = busy.tip.getWorldPosition(new THREE.Vector3());
      this.weld.position.copy(p); this.weld.intensity = 6 + Math.random() * 14;
      if (Math.random() < 0.6) this.fx.burst(p.x, p.y, p.z, 4, Math.random() < 0.5 ? 0xffd890 : 0xbfe4ff, { glow: true, speed: 2.6, up: 1.2, size: 2, life: 0.45, grav: 6, spread: 1 });
    } else this.weld.intensity = Math.max(0, this.weld.intensity - dt * 40);
    for (const c of this.cands) {
      c.spin += dt * (0.6 + c.hover * 1.6);
      if (!c.held) c.pos.lerp(new THREE.Vector3(c.home.x, c.home.y + Math.sin(t * 1.3 + c.spin) * 0.05, c.home.z), 1 - Math.exp(-6 * dt));
      c.obj.position.copy(c.pos); c.obj.rotation.set(0.25, c.spin, 0);
      const k = 0.62 * (1 + c.hover * 0.25 + (c.held ? 0.15 : 0)); c.obj.scale.setScalar(c.obj.scale.x + (k - c.obj.scale.x) * (1 - Math.exp(-8 * dt)));
    }
    for (const h of this.hazes) h.uniforms.uT.value = t;
    this.scrT -= dt;
    if (this.scrT <= 0) { this.scrT = 0.25; for (const s of this.screens) { this.draw(s.cv, s.kind); s.tex.needsUpdate = true; } }
  }
  private draw(cv: HTMLCanvasElement, kind: 'profile' | 'skills' | 'scope') {
    const g = cv.getContext('2d')!, W = cv.width, Hh = cv.height, t = this.t, p = this.prof;
    g.fillStyle = '#06120a'; g.fillRect(0, 0, W, Hh);
    const ph = '#8fdc96', dim = '#3f7a48';
    g.font = '22px Body, monospace'; g.textBaseline = 'top'; g.fillStyle = ph;
    if (kind === 'profile') {
      g.fillText('UNAA-07 · WORKER PROFILE', 14, 10); g.fillStyle = dim; g.fillRect(14, 34, W - 28, 1);
      g.fillStyle = ph; g.font = '48px Title, monospace'; g.fillText(p ? p.roleName : 'NO SPECIMEN', 14, 44);
      g.font = '22px Body, monospace';
      const rows = p ? [['CARRY', `${p.carry} UNITS`], ['SPEED', `${p.speed.toFixed(1)} M/S`], ['ARMOUR', `${Math.round(p.armour * 100)}%`], ['OBEDIENCE', `${Math.round(p.control * 100)}%`], ['FOOD', `${p.needs.food.toFixed(1)}/MIN`], ['MAINT', `${p.needs.maint.toFixed(1)}/H`]] : [];
      rows.forEach(([k, v], i) => { const x = 14 + (i % 2) * 210, y = 110 + Math.floor(i / 2) * 26; g.fillStyle = dim; g.fillText(k, x, y); g.fillStyle = ph; g.fillText(v, x + 100, y); });
      g.fillStyle = dim; g.fillText(`SLOT > ${SLOT_NAME[this.slot]}`, 14, 196);
      g.fillStyle = ph; g.fillText(p && p.parts.length ? p.parts.map((x) => CYBER[x]?.name.split(' ')[0].toUpperCase()).join(' · ') : 'NO PARTS FITTED', 14, 222);
    } else if (kind === 'skills') {
      g.fillText('JOB SKILLS', 14, 10); g.fillStyle = dim; g.fillRect(14, 34, W - 28, 1);
      SKILLS.forEach((s, i) => {
        const y = 46 + i * 29, v = p ? p.skills[s] : 0;
        g.fillStyle = dim; g.fillText(s.toUpperCase(), 14, y);
        for (let k = 0; k < 20; k++) { g.fillStyle = k < v * 2 ? ph : '#16301c'; g.fillRect(130 + k * 13, y + 3, 10, 14); }
        g.fillStyle = ph; g.fillText(v.toFixed(1), 400, y);
      });
    } else {
      g.fillText('NEURAL LINK · TELEMETRY', 14, 10); g.fillStyle = dim; g.fillRect(14, 34, W - 28, 1);
      for (const [row, amp, f, col] of [[95, 30, 3.1, ph], [175, 22, 5.3, '#d9c060']] as [number, number, number, string][]) {
        g.fillStyle = '#16301c'; for (let x = 14; x < W - 14; x += 22) g.fillRect(x, row - amp - 6, 1, amp * 2 + 12);
        g.fillStyle = col; let py = row;
        for (let x = 14; x < W - 14; x += 2) { const y = row + Math.round(Math.sin(x * 0.045 * f + t * f) * amp * (0.6 + 0.4 * Math.sin(x * 0.01 + t))); g.fillRect(x, Math.min(py, y), 2, Math.abs(y - py) + 2); py = y; }
      }
      g.fillStyle = dim; g.fillText(`MORALE ${p ? Math.round(p.needs.morale * 100) : 0}%   POWER ${p ? (p.needs.power < 0 ? 'CELL' : p.needs.power.toFixed(1)) : '-'}`, 14, 226);
    }
    // scanlines
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < Hh; y += 3) g.fillRect(0, y, W, 1);
  }
}

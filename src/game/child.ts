// The Veyr: Unit 07, a U.S. Planetary Corps machine of 1957, landed as a small survey drone that builds itself up
// into a war machine. The hardware is in robots/golem.ts (five hand-designed stages from the chassis skills:
// drone, frame, hauler, war machine, colossus) drawn from the machine kit and the livery atlas (robots/kit.ts,
// robots/atlas.ts: master-palette pixel paint, one material). This file animates it: the drone bobs, tilts and
// putters on its thruster while the lens iris breathes; the frame turns its head on the neck yoke; arms swing on
// their shoulder bearings with stick cylinders and wrist rams, fingers curl into fists; the coil skirt's petals
// flutter; the stacks smoke and their flaps lift; the colossus walks on hinged legs and the ground jumps. New
// parts fly in and click into place; a new stage unfolds and bolts itself on. The look (babyLook.ts) picks the
// paint, the lamp colour, the lens arrangement, the mast on top, the hands and the build.
import * as THREE from 'three';
import { makeRamp, mixHex } from '../limbo/gfx/pixel';
import { clamp, damp, hash01 } from '../core/rand';
import type { Fx } from './fx';
import { type BabyLook, loadLook } from './babyLook';
import { gbuf } from '../gfx/gbuf';
import { atlasFor, kitMaterial, kitUniforms, lookLivery, type Atlas } from '../robots/atlas';
import { buildGolem, stageOf, type GRig, type GStage } from '../robots/golem';

const TAU = Math.PI * 2;
const N = 128;
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ------------------------------------------------------------------------------------------------ plate steel (lab and mirror pool props)
function tn(x: number, y: number, P: number, s: number) {
  const i0 = Math.floor(x), j0 = Math.floor(y), fx = x - i0, fy = y - j0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (a: number) => ((a % P) + P) % P;
  const a = hash01(w(i0), w(j0), s), b = hash01(w(i0 + 1), w(j0), s), c = hash01(w(i0), w(j0 + 1), s), d = hash01(w(i0 + 1), w(j0 + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, oct = 4, P0 = 4) {
  let v = 0, a = 0.5, t = 0, P = P0;
  for (let o = 0; o < oct; o++) { v += tn((x / N) * P, (y / N) * P, P, s + o * 101) * a; t += a; a *= 0.5; P *= 2; }
  return v / t;
}
class Px {
  readonly d: Uint8Array;
  constructor(readonly w: number, readonly h: number) { this.d = new Uint8Array(w * h * 4); }
  set(x: number, y: number, c: number, a = 255) { const i = (y * this.w + x) * 4; this.d[i] = (c >> 16) & 255; this.d[i + 1] = (c >> 8) & 255; this.d[i + 2] = c & 255; this.d[i + 3] = a; }
  ramp(x: number, y: number, R: number[], k: number, a = 255) { const kk = k + (BAY[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * 0.55; this.set(x, y, R[clamp(Math.round(kk), 0, R.length - 1)], a); }
  tex(repeat = true) {
    const t = new THREE.DataTexture(this.d, this.w, this.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.generateMipmaps = true;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    return t;
  }
}
/** plate steel: panels, bevelled seams, rivets, brushed grain, worn edges, grime and rust (props in the lab and the mirror pool) */
export function paintMetal(base: number, hazard = false) {
  const P = new Px(N, N), M = makeRamp(base, 8, { spread: 0.5, hueShift: 0.02, satShift: 0.02 });
  const Y = makeRamp(0xd0a020, 7, { spread: 0.45 }), B = makeRamp(0x24221e, 5, { spread: 0.5 }), bare = 0xb8b4a8;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const row = y >> 5, sx = (x + (row & 1) * 32) & 63, sy = y & 31;
    const fine = fbm(x, y, 37, 2, 16), grime = fbm(x, y, 41, 3, 4), h = hash01(x, y, 3);
    let k = 4.2 + (fine - 0.5) * 0.9 + (h - 0.5) * 0.5 + (hash01(y, 3, 7) - 0.5) * 0.45 - (grime < 0.4 ? (0.4 - grime) * 5 : 0);
    let R = M;
    if (hazard) { const st = ((x + y) & 31) < 16; R = st ? Y : B; k = (st ? 3.6 : 2.4) + (fine - 0.5) * 0.9 + (h - 0.5) * 0.5 - (grime < 0.4 ? (0.4 - grime) * 4 : 0); }
    const seam = sx === 0 || sy === 0, bev = sx === 1 || sy === 1, sh = sx === 63 || sy === 31;
    if (seam) k = 0.8; else if (bev) k += 1.4; else if (sh) k -= 0.9;
    const dEdge = Math.min(sx, 63 - sx, sy, 31 - sy);
    const rv = (sy === 4 || sy === 27) && sx % 8 === 4 ? 1 : (sx === 4 || sx === 59) && sy % 8 === 4 ? 1 : 0;
    const rvB = ((sy === 5 || sy === 28) && sx % 8 === 5) || ((sx === 5 || sx === 60) && sy % 8 === 5);
    const rvS = ((sy === 5 || sy === 28) && sx % 8 === 4) || ((sx === 5 || sx === 60) && sy % 8 === 4) || ((sy === 4 || sy === 27) && sx % 8 === 5) || ((sx === 4 || sx === 59) && sy % 8 === 5);
    if (rv) { P.set(x, y, mixHex(M[7], 0xffffff, 0.35)); continue; }
    if (rvS) { P.set(x, y, M[5]); continue; }
    if (rvB) { P.set(x, y, M[1]); continue; }
    const wear = dEdge < 3 && fbm(x, y, 47, 2, 8) > 0.58;
    const scratch = Math.abs(((x * 0.7 + y) % 23) - 11) < 0.5 && fbm(x, y, 53, 2, 4) > 0.62;
    if (wear || scratch) { P.set(x, y, mixHex(bare, M[3], 0.25 + h * 0.2)); continue; }
    if (fbm(x, y, 59, 3, 4) > 0.74) { P.set(x, y, mixHex(R[clamp(Math.round(k), 0, R.length - 1)], 0x7a4626, 0.55)); continue; }
    P.ramp(x, y, R, hazard ? Math.min(k, R.length - 1) : k);
  }
  return P.tex();
}
/** box-project UVs onto any geometry */
export function projUV<G extends THREE.BufferGeometry>(g: G, sc = 2.6, seed = 0): G {
  const P = g.attributes.position as THREE.BufferAttribute, Nn = g.attributes.normal as THREE.BufferAttribute, uv: number[] = [];
  const ou = hash01(seed, 1, 3) * 3, ov = hash01(seed, 2, 3) * 3;
  for (let i = 0; i < P.count; i++) {
    const ax = Math.abs(Nn.getX(i)), ay = Math.abs(Nn.getY(i)), az = Math.abs(Nn.getZ(i)), x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const [u, w] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
    uv.push(u * sc + ou, w * sc + ov);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/** a box with rounded edges (BoxGeometry pushed out from an inner box), keeping its six face groups */
export function roundBox(w: number, h: number, d: number, r: number) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), P = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), q = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i); q.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    const o = v.clone().sub(q); if (o.lengthSq() > 1e-9) o.setLength(r); v.copy(q).add(o); P.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------ the golem
/** chassis parts the model can show, by skill id (skills.ts). 'head' is always there. */
export const CHASSIS = ['head', 'torso', 'armR', 'armL', 'coil', 'plating1', 'plating2', 'plating3'] as const;
/** skills that change the build stage without being a part of their own */
export const STAGE_SKILLS = ['reactor', 'colossus'] as const;
export const STAGE_NAMES = ['SURVEY DRONE', 'FRAME', 'HAULER', 'WAR MACHINE', 'COLOSSUS'] as const;
export type Work = 'drill' | 'dig' | 'intake' | 'siphon' | 'graft' | 'grit' | 'convert' | null;
interface Asm { obj: THREE.Object3D; part: string; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3; from: THREE.Vector3; spin: THREE.Vector3; t: number; delay: number; dur: number; unfold: boolean }
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _qa = new THREE.Quaternion(), _ea = new THREE.Euler(), _m = new THREE.Matrix4(), _v = new THREE.Vector3();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const Y_UP = new THREE.Vector3(0, 1, 0);

export class VeyrChild {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  private R: GRig | null = null;
  private mats: THREE.Material[];
  private atlas: Atlas | null = null;
  private U = kitUniforms(); private UL = kitUniforms();
  /** 0 dry .. 1 soaked: the paint darkens, water drips off it (player.ts sets it; others may read it) */
  wet = 0; private dripT = 0;
  private ring: THREE.Mesh;
  private t = 0; private blinkT = 3; private castT = 0; private castAt = new THREE.Vector3(); private smokeT = 1; private putT = 0;
  private waveT = 0; private actT = 4; private act: 'scatter' | 'spin' | 'flex' | 'juggle' | 'tilt' | null = null; private actK = 0;
  private baseScale: number; private grow = 0.72; private growTo = 0.72;
  hatch = 0; // 0 sealed .. 1 out and afloat
  look = new THREE.Vector3();
  /** when set, the head follows this instead of look (the player's aim) */
  aim: THREE.Vector3 | null = null;
  private lookYaw = 0; private lookPitch = 0;
  private look_: BabyLook;
  onCast?: () => void;
  // ---- the player's body (player.ts drives these)
  /** owned chassis parts; null shows the whole machine (the mirror pool, story scenes) */
  parts: Set<string> | null = null;
  /** stage skills (reactor, colossus) passed to setParts, and the ones read from the running game */
  private extraP = new Set<string>(); private extraG = new Set<string>(); private skillT = 0;
  /** show this build stage whatever the parts say (tests, previews) */
  forceStage: GStage | null = null;
  private asm: Asm[] = [];
  /** a part finished flying in and clicked into place */
  onAssembled?: (part: string, at: THREE.Vector3) => void;
  /** lean of the whole rig with acceleration (x: pitch, y: roll) */
  lean = new THREE.Vector2();
  /** arms raised over the head to carry something (0..1); big: both arms */
  hold = 0; holdBig = false; private holdK = 0;
  /** the current job: drill, dig, intake... (null when idle) */
  work: Work = null; private workK = 0; private workKind: Work = null;
  private butt = -1; private thr = -1; private wig = 0;
  private jolt = new THREE.Vector3(); private joltV = new THREE.Vector3();
  private flashC = new THREE.Color(); private flashK = 0; private hurtK = 0;
  /** 0 intact .. 1 wrecked: sparks and smoke */
  damage = 0;
  /** blown apart (hidden until reassembled) */
  broken = false;
  private hoverH = 0.42; private sparkT = 1;
  private ap = 0.6; private apGoal = 0.6;
  private prevP = new THREE.Vector3(); private hasPrev = false; private gait = 0; private gaitV = 0; private vFwd = 0; private stepSide = 0;
  private boltT = 0; private stageFx = 0; private pendingStage: string | null = null;
  constructor(readonly fx: Fx, scale = 1.25, look?: BabyLook, opts: { grown?: boolean; parts?: Iterable<string>; stage?: GStage } = {}) {
    this.look_ = look ?? loadLook();
    this.baseScale = scale;
    if (opts.grown) this.grow = this.growTo = 1;
    if (opts.parts) { this.parts = new Set(['head']); for (const p of opts.parts) this.addKey(p, this.parts, this.extraP); }
    if (opts.stage !== undefined) this.forceStage = opts.stage;
    this.atlas = atlasFor(this.livery(this.look_));
    this.mats = [kitMaterial(this.atlas, this.U), kitMaterial(this.atlas, this.UL)];
    this.root.add(this.rig);
    const rmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    gbuf(rmat, 0);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.008, 4, 36), rmat); this.ring.rotation.x = Math.PI / 2; this.rig.add(this.ring);
    this.setLook(this.look_);
    this.root.visible = false;
  }
  private addKey(p: string, parts: Set<string>, extra: Set<string>) {
    if ((CHASSIS as readonly string[]).includes(p)) parts.add(p);
    else if ((STAGE_SKILLS as readonly string[]).includes(p)) extra.add(p);
  }
  private livery(L: BabyLook) { return lookLivery(L.metal, L.glow, L.rock, L.moss, L.veins); }
  get lookData() { return this.look_; }
  /** the build stage on show: 0 drone, 1 frame, 2 hauler, 3 war machine, 4 colossus */
  get stage(): GStage { return this.R?.stage ?? this.wantStage(); }
  private wantStage(): GStage { return this.forceStage ?? (this.parts ? stageOf((id) => this.has(id)) : 3); }
  /** triangles in the current build */
  get tris() { return this.R?.tris ?? 0; }
  // ---- x-ray: a dithered silhouette in the fx layer, drawn only where something stands between it and the camera
  private ver = 0; private ghostVer = -1;
  private ghostRoot: THREE.Group | null = null; private ghostMat: THREE.ShaderMaterial | null = null;
  private ghosts: { src: THREE.Mesh; g: THREE.Mesh }[] = [];
  attachGhost(fxScene: THREE.Scene) {
    this.ghostRoot = new THREE.Group(); fxScene.add(this.ghostRoot);
    this.ghostMat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(this.look_.glow) }, uA: { value: 0.75 }, uPull: { value: 0.32 } },
      vertexShader: `uniform float uPull;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); wp.xyz += normalize(cameraPosition - wp.xyz) * uPull; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA;
void main() { vec2 p = floor(gl_FragCoord.xy); if (mod(p.x + p.y, 2.0) < 0.5) discard; gl_FragColor = vec4(uCol * uA, uA); }`,
      transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
  }
  /** copy the golem's pose onto its silhouette (call after the root is placed for the frame) */
  syncGhost(show = true) {
    const G = this.ghostRoot, R = this.R;
    if (!G || !R || !this.ghostMat) return;
    G.visible = show && this.root.visible;
    if (!G.visible) return;
    if (this.ghostVer !== this.ver) {
      this.ghostVer = this.ver;
      for (const x of this.ghosts) x.g.removeFromParent();
      this.ghosts = [];
      R.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = new THREE.Mesh(m.geometry, this.ghostMat!);
        g.matrixAutoUpdate = false; g.matrixWorldAutoUpdate = false; g.frustumCulled = false;
        G.add(g); this.ghosts.push({ src: m, g });
      });
      (this.ghostMat.uniforms.uCol.value as THREE.Color).set(this.look_.glow).multiplyScalar(1.3);
    }
    this.ghostMat.uniforms.uPull.value = 0.72 * this.scale;
    this.root.updateMatrixWorld(true);
    for (const { src, g } of this.ghosts) {
      let v = true; for (let o: THREE.Object3D | null = src; o && o !== this.root; o = o.parent) if (!o.visible) { v = false; break; }
      g.visible = v;
      if (v) g.matrixWorld.copy(src.matrixWorld);
    }
  }
  /** repaint for a new look and rebuild */
  setLook(L: BabyLook) {
    this.look_ = { ...L };
    this.atlas = atlasFor(this.livery(L));
    for (const m of this.mats) { (m as THREE.MeshLambertMaterial).map = this.atlas.tex; m.needsUpdate = true; }
    (this.ring.material as THREE.MeshBasicMaterial).color.set(L.glow).multiplyScalar(0.9);
    this.rebuild();
  }
  private rebuild() {
    if (this.R) { this.R.model.removeFromParent(); this.R.geos.forEach((g) => g.dispose()); }
    this.ver++;
    this.asm = [];
    const st = this.wantStage();
    this.R = buildGolem({ look: this.look_, stage: st, has: (id) => this.has(id) }, this.mats);
    this.rig.add(this.R.model);
    this.hasPrev = false;
  }
  /** show exactly these chassis parts (stage skills such as reactor and colossus may be passed along). New ones fly in
   *  from all around and click into place (unless instant); a new stage unfolds and bolts on. Returns what was added */
  setParts(list: Iterable<string>, animate = true): string[] {
    const next = new Set<string>(['head']), nextX = new Set<string>();
    for (const p of list) this.addKey(p, next, nextX);
    const prev = this.parts, prevX = this.extraP;
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((p) => b.has(p));
    if (prev && same(prev, next) && same(prevX, nextX)) return [];
    const added = prev ? [...next].filter((p) => !prev.has(p)) : [];
    const addedX = [...nextX].filter((p) => !prevX.has(p));
    const st0 = this.R?.stage ?? 0;
    this.parts = next; this.extraP = nextX;
    this.rebuild();
    if (!prev) { this.hoverH = this.R!.L.hover; }
    if (animate) this.animateChange(st0, added);
    return [...added, ...(prev ? addedX : [])];
  }
  /** after a rebuild: a higher stage unfolds everything but the head; otherwise just the new parts fly in */
  private animateChange(st0: number, added: string[]) {
    const R = this.R; if (!R) return;
    if (R.stage > st0) {
      this.assemble(Object.keys(R.parts).filter((p) => p !== 'head'), 'unfold');
      this.pendingStage = STAGE_NAMES[R.stage] + ' STAGE';
      this.stageFx = 2.2;
    } else if (added.length) this.assemble(added, 'fly');
  }
  /** a fixed size for the playable golem (no growing with the field); smooth: grow into it over a few seconds */
  setScale(s: number, smooth = false) { if (smooth) this.growTo = s / this.baseScale; else { this.baseScale = s; this.grow = this.growTo = 1; } }
  /** current world scale of the model */
  get scale() { return this.baseScale * this.grow; }
  /** still growing toward a new size */
  get growing() { return Math.abs(this.growTo - this.grow) > 0.01; }
  has(p: string) { return !this.parts || this.parts.has(p) || this.extraP.has(p) || this.extraG.has(p); }
  private assemble(ids: string[], mode: 'fly' | 'scatter' | 'unfold' = 'fly') {
    const R = this.R; if (!R) return;
    let n = 0;
    const scatter = mode === 'scatter', unfold = mode === 'unfold';
    for (const id of ids) for (const obj of R.parts[id] ?? []) {
      const a = Math.random() * TAU, el = 0.25 + Math.random() * 0.9, d = scatter ? 0.9 + Math.random() * 0.8 : 1.6 + Math.random() * 1.2;
      const from = unfold
        ? new THREE.Vector3((Math.random() - 0.5) * 0.12, -0.08 - Math.random() * 0.1, (Math.random() - 0.5) * 0.12)
        : new THREE.Vector3(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d + 0.3, Math.sin(a) * Math.cos(el) * d);
      const spin = unfold
        ? new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.6), 0, (Math.random() - 0.5) * 0.8)
        : new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
      this.asm.push({
        obj, part: id, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone(), from, spin,
        t: 0, delay: unfold ? 0.15 + n * 0.09 : n * (scatter ? 0.06 : 0.12) + (scatter ? Math.random() * 0.2 : 0), dur: unfold ? 0.55 : scatter ? 0.5 : 0.62, unfold,
      });
      obj.visible = false;
      n++;
    }
  }
  /** it starts small and grows with its field (level 1..6); the playable golem keeps a fixed size */
  setGrowth(level: number) { if (this.parts) return; this.growTo = clamp(0.72 + (level - 1) * 0.11, 0.72, 1.3); }
  /** reach toward a point: arms swing up, the jaw drops, the reactor flares */
  cast(at: THREE.Vector3) { this.castT = 1.1; this.castAt.copy(at); this.onCast?.(); }
  /** a little wave */
  wave() { this.waveT = 2.4; }
  // ---- combat and work (player.ts)
  get arms() { return this.R?.arms.map((a) => a.id) ?? []; }
  /** swing a piston punch with an arm (R or L; the free one by default). Returns the arm used */
  punch(side?: 'armR' | 'armL'): 'armR' | 'armL' | null {
    const A = this.R?.arms ?? [];
    const arm = (side && A.find((a) => a.id === side)) || A.find((a) => a.punch < 0) || A[0];
    if (!arm) return null;
    arm.punch = 0;
    return arm.id;
  }
  /** a head-only lunge */
  headbutt() { this.butt = 0; }
  /** swing whatever is held overhead forward */
  throwSwing() { this.thr = 0; }
  /** knocked about by a blow */
  hurt(strength = 1) {
    this.joltV.set((Math.random() - 0.5) * 7 * strength, 0, (Math.random() - 0.5) * 7 * strength);
    this.flash(0xff4a3a, 1); this.hurtK = Math.min(1.2, this.hurtK + 0.6 * strength); this.apGoal = 0.05;
    if (this.R && Math.random() < 0.35 * strength) this.dent();
  }
  /** lens flash (events, damage, level-ups) */
  flash(col: number, k = 1) { this.flashC.set(col); this.flashK = Math.max(this.flashK, k); this.apGoal = 1; }
  /** a happy wiggle */
  wiggle() { this.wig = 1.3; this.flash(0xffffff, 0.8); if (!this.act && this.hatch >= 1) { this.act = this.R?.arms.length ? 'juggle' : 'spin'; this.actK = 0; } }
  /** bend a plate on its bolts */
  dent() {
    const P = this.R?.plates; if (!P || !P.length) return;
    const p = P[Math.floor(Math.random() * P.length)];
    p.rotation.x += (Math.random() - 0.5) * 0.12; p.rotation.z += (Math.random() - 0.5) * 0.12; p.scale.multiply(_a.set(1 - Math.random() * 0.05, 1, 1 - Math.random() * 0.05));
  }
  /** blown apart: the pieces' world positions and sizes, for debris; the model hides until reassemble() */
  shatter(): { p: THREE.Vector3; size: number; metal: boolean }[] {
    const R = this.R, out: { p: THREE.Vector3; size: number; metal: boolean }[] = [];
    if (!R) return out;
    const s = this.baseScale * this.grow * R.scaleK;
    R.model.updateMatrixWorld(true);
    out.push({ p: R.head.getWorldPosition(new THREE.Vector3()), size: 0.13 * s, metal: true });
    if (R.body) { const b = R.body.getWorldPosition(new THREE.Vector3()); out.push({ p: b, size: 0.2 * s, metal: true }, { p: b.clone(), size: 0.12 * s, metal: true }); }
    for (const A of R.arms) for (const o of [A.root, A.fore, A.hand]) out.push({ p: o.getWorldPosition(new THREE.Vector3()), size: 0.08 * s * A.s, metal: true });
    for (const L of R.legs) for (const o of [L.thigh, L.shin, L.foot]) out.push({ p: o.getWorldPosition(new THREE.Vector3()), size: 0.1 * s, metal: true });
    for (const p of R.plates) out.push({ p: p.getWorldPosition(new THREE.Vector3()), size: 0.07 * s, metal: true });
    this.broken = true;
    return out;
  }
  /** come back together: every part flies in from close by */
  reassemble() { this.broken = false; this.rebuild(); this.assemble(Object.keys(this.R?.parts ?? {}), 'scatter'); this.flash(0xffffff, 1.5); }
  /** world points: lens, jaw (the intake), a hand, the carry point over the head */
  headPos(out = new THREE.Vector3()) { out.set(0, 0, 0.22); return this.R ? this.R.head.localToWorld(out) : this.root.getWorldPosition(out); }
  mouthPos(out = new THREE.Vector3()) { out.set(0, 0, 0); return this.R ? this.R.mouth.localToWorld(out) : this.root.getWorldPosition(out); }
  handPos(side: 'armR' | 'armL', out = new THREE.Vector3()) {
    const A = this.R?.arms.find((a) => a.id === side) ?? this.R?.arms[0];
    if (!A) return this.mouthPos(out);
    out.set(0, -0.1 * A.s, 0.02); return A.hand.localToWorld(out);
  }
  holdPos(big: boolean, out = new THREE.Vector3()) {
    const R = this.R;
    if (!R || !R.arms.length) { out.set(0, 0.25, 0.1); return R ? R.head.localToWorld(out) : this.root.getWorldPosition(out); }
    if (big && R.arms.length > 1) { R.arms[0].hand.localToWorld(out.set(0, -0.11, 0)); R.arms[1].hand.localToWorld(_b.set(0, -0.11, 0)); return out.add(_b).multiplyScalar(0.5).add(_a.set(0, 0.06 * this.baseScale, 0)); }
    const A = R.arms.find((a) => a.id === 'armR') ?? R.arms[0];
    return A.hand.localToWorld(out.set(0, -0.13 * A.s, 0.03));
  }
  /** the running game's skill tree, when this is its golem (reactor and colossus are skills, not parts) */
  private pollSkills(dt: number) {
    if (!this.parts) return;
    this.skillT -= dt; if (this.skillT > 0) return;
    this.skillT = 0.4;
    const G = (globalThis as unknown as { __game?: { child?: unknown; run?: { skills?: { has(id: string): boolean } } } }).__game;
    if (!G || G.child !== this || !G.run?.skills) return;
    const sk = G.run.skills, next = new Set<string>(STAGE_SKILLS.filter((k) => sk.has(k)));
    if (next.size === this.extraG.size && [...next].every((k) => this.extraG.has(k))) return;
    const st0 = this.R?.stage ?? 0;
    this.extraG = next;
    this.rebuild(); this.animateChange(st0, []);
  }
  private camShake(a: number, t: number) {
    const G = (globalThis as unknown as { __game?: { child?: unknown; cam?: { shake(a: number, t: number): void } } }).__game;
    if (G && G.child === this) G.cam?.shake(a, t);
  }

  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const h = this.hatch, t = this.t;
    this.root.visible = h > 0.05 && !this.broken;
    this.pollSkills(dt);
    const R = this.R;
    if (!R) return;
    const Lay = R.L, st = R.stage, SK = R.scaleK;
    const g0 = this.grow;
    this.grow += (this.growTo - this.grow) * Math.min(1, dt * 0.8);
    // growing into a bigger frame: the joints spark as it swells
    if (this.parts && Math.abs(this.grow - g0) > dt * 0.02 && Math.random() < dt * 25 && this.root.visible) {
      const p = (R.body ?? R.head).localToWorld(_a.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4));
      this.fx.spray(p.x, p.y, p.z, Math.random() - 0.5, 0.8, Math.random() - 0.5, 3, Math.random() < 0.5 ? 0xe4cd98 : 0xc9a464, { glow: true, speed: 1.5, size: 1.8, life: 0.35, grav: 5 });
    }
    this.root.scale.setScalar(this.baseScale * this.grow);
    const c = Math.min(1, this.castT * 3);
    const torso = !!R.body;
    // what it's busy with
    if (this.work) this.workKind = this.work;
    this.workK = damp(this.workK, this.work ? 1 : 0, 10, dt);
    this.holdK = damp(this.holdK, this.hold, 12, dt);
    const wk = this.workK, kind = this.workKind;
    const busy = wk > 0.05 || this.holdK > 0.05 || R.arms.some((a) => a.punch >= 0) || this.butt >= 0 || this.thr >= 0;
    // idle business: tilt the head at things, spin the head round, flex, run a systems check
    this.actT -= dt;
    if (this.actT <= 0 && !this.act && h >= 1 && c === 0 && !busy && this.wig <= 0) {
      const opts: ('spin' | 'flex' | 'juggle' | 'tilt')[] = ['spin', 'tilt'];
      if (R.arms.length) opts.push('flex', 'juggle');
      this.act = opts[Math.floor(Math.random() * opts.length)]; this.actK = 0;
    }
    if (busy && this.act && this.act !== 'juggle') { this.act = null; this.actT = 3 + Math.random() * 4; }
    let spin = 0, flex = 0, jug = 0, tilt = 0;
    if (this.act) {
      this.actK += dt;
      const d = this.act === 'spin' ? 1.6 : this.act === 'flex' ? 1.8 : this.act === 'tilt' ? 2.2 : 2.4, u = this.actK / d;
      if (this.act === 'spin') spin = u < 1 ? (1 - Math.cos(u * Math.PI)) * Math.PI : 0;
      if (this.act === 'flex') flex = Math.sin(Math.min(1, u) * Math.PI) ** 0.6;
      if (this.act === 'juggle') jug = Math.sin(Math.min(1, u) * Math.PI);
      if (this.act === 'tilt') tilt = Math.sin(Math.min(1, u) * Math.PI) ** 0.5 * (hash01(Math.floor(this.t), 3, 1) < 0.5 ? 1 : -1);
      if (u >= 1) { this.act = null; this.actT = 4 + Math.random() * 6; }
    }
    // springs: a blow knocks the rig about; a happy wiggle
    this.joltV.addScaledVector(this.jolt, -260 * dt); this.joltV.multiplyScalar(Math.exp(-dt * 9)); this.jolt.addScaledVector(this.joltV, dt);
    this.wig = Math.max(0, this.wig - dt);
    const wg = Math.sin(this.wig * 24) * Math.min(1, this.wig * 2) * 0.3;
    // ground speed (the colossus walks it; the drone tilts into it)
    const wp = this.root.getWorldPosition(_v);
    if (this.hasPrev && dt > 0) {
      const vx = (wp.x - this.prevP.x) / dt, vz = (wp.z - this.prevP.z) / dt, yaw = this.root.rotation.y;
      const f = (vx * Math.sin(yaw) + vz * Math.cos(yaw)) / Math.max(0.05, this.baseScale * this.grow * SK);
      this.vFwd = damp(this.vFwd, clamp(f, -6, 6), 6, dt);
    }
    this.prevP.copy(wp); this.hasPrev = true;
    // hover over the ground (a bare drone low and bobbing; the colossus stands)
    this.hoverH = damp(this.hoverH, Lay.hover, 3, dt);
    const rise = clamp((h - 0.1) / 0.6, 0, 1);
    const legs = R.legs.length > 0;
    const bob = legs ? 0 : Math.sin(t * (st === 0 ? 2.1 : 1.2)) * (torso ? 0.05 : 0.035);
    this.rig.position.y = (1 - rise) * -1.3 + rise * (this.hoverH + bob + c * (legs ? 0 : 0.08) + Math.abs(wg) * 0.15);
    const lk = legs ? 0.35 : 1;
    this.rig.rotation.set((Math.sin(t * 0.8) * 0.04 + this.lean.x + this.jolt.x) * lk, wg, (Math.sin(t * 1.0) * 0.05 + this.lean.y + this.jolt.z) * lk + (st === 0 ? tilt * 0.35 + Math.sin(t * 0.6) * 0.06 : 0));
    this.ring.visible = !legs;
    this.ring.position.y = 0.06 - bob * 0.8; this.ring.scale.setScalar((torso ? 0.9 : 0.42) * (1 + Math.sin(t * 3) * 0.05 + c * 0.5));
    (this.ring.material as THREE.MeshBasicMaterial).opacity = rise * (0.25 + c * 0.45);
    // look: the body turns a little, the head turns on its neck (or the whole drone turns)
    const target = this.castT > 0 ? this.castAt : this.aim ?? this.look;
    this.root.updateMatrixWorld();
    const lp = this.root.worldToLocal(_a.copy(target));
    const hy = Lay.headY * SK;
    const wantYaw = clamp(Math.atan2(lp.x, lp.z), -1.2, 1.2), wantPitch = clamp(-Math.atan2(lp.y - hy, Math.hypot(lp.x, lp.z)) * 0.5, -0.35, 0.45);
    this.lookYaw = damp(this.lookYaw, wantYaw, 5, dt); this.lookPitch = damp(this.lookPitch, wantPitch, 5, dt);
    let twist = 0;
    for (const A of R.arms) if (A.punch >= 0) twist += A.k * -0.3 * Math.sin(Math.min(1, A.punch * 1.6) * Math.PI);
    const bend = (kind === 'drill' || kind === 'dig' || kind === 'graft' || kind === 'convert') ? 0.18 * wk : 0;
    if (R.body) {
      R.body.position.set(0, Lay.bodyY + (legs ? -Math.abs(Math.sin(this.gait)) * 0.018 : Math.sin(t * 1.7) * 0.01), -c * 0.03);
      R.body.rotation.set(c * 0.12 + Math.sin(t * 0.9) * 0.025 - flex * 0.08 + bend, this.lookYaw * 0.3 + twist, Math.sin(t * 1.1) * 0.025 + (legs ? Math.sin(this.gait) * 0.03 : 0));
    }
    // the head: lunges for a headbutt, tips down to work, jaw wide for the intake
    let bt = 0;
    if (this.butt >= 0) { this.butt += dt / 0.32; bt = Math.sin(Math.min(1, this.butt) * Math.PI) ** 0.7; if (this.butt >= 1) this.butt = -1; }
    const mouthy = kind === 'intake' || kind === 'siphon' || kind === 'grit';
    const headWork = !R.arms.length && (kind === 'drill' || kind === 'dig');
    const shake = (headWork || (mouthy && !torso)) ? Math.sin(t * 47) * 0.02 * wk : 0;
    const headPitch = this.lookPitch - c * 0.12 + (mouthy || headWork ? 0.35 * wk : 0);
    if (R.neck) {
      R.neck.rotation.set(bt * 0.45, (this.lookYaw - this.lookYaw * 0.3) + spin, 0);
      R.head.rotation.set(headPitch + bt * 0.3, 0, tilt * 0.25 + Math.sin(t * 9) * 0.02 * jug + shake * 4);
    } else {
      R.head.position.set(shake, Math.sin(t * 1.7 - 0.7) * 0.012 + c * 0.03 - (headWork ? 0.06 * wk : 0), bt * 0.24 + (headWork ? 0.06 * wk : 0));
      R.head.rotation.set(headPitch + bt * 0.55, this.lookYaw + spin, Math.sin(t * 0.6) * 0.07 + tilt * 0.45 + shake * 4);
    }
    R.jaw.rotation.x = -(c * 0.5 + flex * 0.25 + (mouthy ? (0.8 + Math.sin(t * 19) * 0.12) * wk : 0) + bt * 0.3);
    // the iris breathes; it shuts on a blink or a blow and opens wide on a flash or a cast
    this.blinkT -= dt;
    let lid = 0;
    if (this.blinkT < 0.22) lid = Math.sin(clamp(this.blinkT / 0.22, 0, 1) * Math.PI);
    if (this.blinkT <= 0) this.blinkT = 3 + Math.random() * 4;
    if (h < 0.8) lid = 1 - clamp((h - 0.6) / 0.2, 0, 1);
    this.apGoal = damp(this.apGoal, 0.55 + Math.sin(t * 0.7) * 0.15 + (hash01(Math.floor(t * 0.5), 9, 4) - 0.5) * 0.3, 1.5, dt);
    this.ap = damp(this.ap, clamp(this.apGoal + c * 0.5 + this.flashK * 0.4, 0, 1) * (1 - lid), 14, dt);
    for (const b of R.iris) b.rotation.z = b.userData.base + this.ap * 1.05;
    // fins flutter on their hinges; the coil petals breathe; the stack flaps lift when they puff
    for (let i = 0; i < R.fins.length; i++) { const f = R.fins[i]; f.userData.base ??= f.rotation.x; f.rotation.x = f.userData.base + Math.sin(t * 5 + i * 1.7) * 0.06 + this.vFwd * 0.03; }
    for (let i = 0; i < R.petals.length; i++) R.petals[i].rotation.x = Math.sin(t * 3.1 + i * 1.1) * 0.05 + c * 0.15 + clamp(this.vFwd * 0.02, -0.1, 0.1) * Math.cos((i / R.petals.length) * TAU);
    // arms
    this.castT = Math.max(0, this.castT - dt);
    this.waveT = Math.max(0, this.waveT - dt);
    const wv = Math.min(1, this.waveT * 1.5) * (1 - c);
    const waver = R.arms.find((a) => a.k > 0) ?? R.arms[0];
    let thrK = 0, thrSwing = 0;
    if (this.thr >= 0) {
      this.thr += dt / 0.42;
      const p = this.thr;
      if (p < 0.3) { thrSwing = (p / 0.3) ** 2; thrK = 1; } else { thrSwing = 1; thrK = 1 - (p - 0.3) / 0.7; }
      if (this.thr >= 1) this.thr = -1;
    }
    for (const A of R.arms) {
      const k = A.k, pad = Math.sin(t * 1.3 + (k > 0 ? 0 : 2)), up = A === waver ? wv : 0, jg = jug * Math.sin(t * 7 + (k > 0 ? 0 : Math.PI));
      let rx = -c * 1.25 + pad * 0.07 - flex * 0.2 - jg * 0.3;
      let rz = k * (0.06 + c * 0.2 + up * 2.4 + flex * 1.3);
      let fx = -0.25 - c * 0.5 - flex * 1.5 - jg * 0.4 + pad * 0.05;
      let ext = 0, fwd = 0, curl = L_CURL[this.look_.arms] + Math.sin(t * 0.9 + k) * 0.05 + jg * 0.6;
      if (wk > 0.01 && kind) {
        let wx = rx, wz = rz, wf = fx, we = 0;
        if (kind === 'drill') { wx = -1.35 + Math.sin(t * 31 + k) * 0.035; wz = k * -0.12; wf = -0.12; we = 0.04; A.spin += dt * 38; curl = 1.2; }
        else if (kind === 'dig') { const ph = t * 7.5 + (k > 0 ? Math.PI : 0); wx = -0.45 - 0.75 * Math.max(0, Math.sin(ph)); wz = k * 0.2; wf = -0.95 * Math.max(0, Math.cos(ph)); we = 0.02; curl = 0.8; }
        else if (kind === 'graft' || kind === 'convert') { wx = -1.15 + Math.sin(t * 5 + k) * 0.08; wz = k * -0.2; wf = -0.45; we = 0.03; curl = 0.2; }
        else { wx = -0.3; wz = k * 0.55; wf = -0.4; curl = 0.4; }
        rx = lerp(rx, wx, wk); rz = lerp(rz, wz, wk); fx = lerp(fx, wf, wk); ext = lerp(ext, we, wk);
      }
      const carry = (this.holdBig || A.id === 'armR' || R.arms.length === 1) ? this.holdK : 0;
      if (carry > 0.01) { rx = lerp(rx, -2.75, carry); rz = lerp(rz, k * (this.holdBig ? -0.3 : -0.12), carry); fx = lerp(fx, this.holdBig ? -0.55 : -0.85, carry); curl = lerp(curl, 0.9, carry); }
      if (thrK > 0 && (this.holdBig || A.id === 'armR' || R.arms.length === 1)) { rx = lerp(rx, lerp(-2.8, -0.75, thrSwing), thrK); fx = lerp(fx, -0.1, thrK * thrSwing); curl = lerp(curl, 0.1, thrK * thrSwing); }
      if (A.punch >= 0) {
        // wind back, then the ram fires the fist out of the forearm
        A.punch += dt / 0.28;
        const p = A.punch;
        let e = 0;
        if (p < 0.22) { const u = p / 0.22; fwd = 0.6 * u; e = -0.2 * u; }
        else if (p < 0.4) { const u = (p - 0.22) / 0.18; fwd = 0.6 + 0.4 * u; e = -0.2 + 1.2 * u; }
        else { const u = (p - 0.4) / 0.6, s = 1 - u * u * (3 - 2 * u); fwd = s; e = s; }
        rx = lerp(rx, -1.58, fwd); rz = lerp(rz, k * -0.15, fwd); fx = lerp(fx, -0.04, fwd); ext = lerp(ext, e * 0.075, fwd); curl = lerp(curl, 1.3, Math.min(1, fwd * 2));
        if (A.punch >= 1) A.punch = -1;
      }
      A.root.position.set(0, 0, fwd * 0.03);
      A.root.rotation.set(rx, 0, rz);
      A.fore.rotation.set(fx, 0, k * up * Math.sin(t * 9) * 0.3);
      A.hand.position.y = A.ram - clamp(ext, -0.01, 0.075) * A.s;
      A.hand.rotation.set(-c * 0.3, Math.sin(t * 0.7 + k) * 0.2 + flex * 0.4 + A.spin, 0);
      for (const f of A.fingers) { const cu = clamp(curl, 0, 1.4) * (f.thumb ? 0.8 : 1); f.prox.rotation.x = f.k * cu * 0.75; f.dist.rotation.x = f.k * cu * 0.85; }
    }
    // the colossus walks: two-bone legs reach for the ground under the hips, footfalls throw dust and shake it
    if (legs) {
      const sp = Math.abs(this.vFwd);
      this.gaitV = damp(this.gaitV, sp, 4, dt);
      const stride = 0.13, rate = this.gaitV / (stride * 2.2);
      this.gait += dt * Math.min(9, rate) * Math.PI;
      const walk = clamp(this.gaitV / 0.25, 0, 1), dir = this.vFwd >= 0 ? 1 : -1;
      for (const L of R.legs) {
        const ph = this.gait + L.ph;
        const hipH = Lay.hipY - 0.02 - Math.abs(Math.sin(this.gait)) * 0.018 * walk;
        const zt = Math.sin(ph) * stride * walk * dir, lift = Math.max(0, Math.cos(ph)) * 0.07 * walk;
        const yt = -(hipH - 0.072 - lift);
        const d = clamp(Math.hypot(zt, yt), 0.05, L.lt + L.ls - 0.002);
        const kneeIn = clamp((L.lt * L.lt + L.ls * L.ls - d * d) / (2 * L.lt * L.ls), -1, 1);
        const knee = Math.PI - Math.acos(kneeIn);
        const beta = Math.acos(clamp((L.lt * L.lt + d * d - L.ls * L.ls) / (2 * L.lt * d), -1, 1));
        const alpha = Math.atan2(zt, -yt) + beta;
        L.thigh.rotation.x = -alpha; L.shin.rotation.x = knee; L.foot.rotation.x = alpha - knee;
        // a footfall
        const down = Math.cos(ph) < 0;
        if (down && !L.plant.x && walk > 0.3 && this.root.visible) {
          const f = L.foot.localToWorld(_a.set(0, -0.07, 0.03));
          this.fx.burst(f.x, f.y, f.z, 6, 0x8a7a65, { speed: 1.2, up: 0.6, size: 2.6, life: 0.6, grav: 3 });
          this.camShake(0.04, 0.12);
        }
        L.plant.x = down ? 1 : 0;
      }
    }
    // pistons follow their bones
    if (R.pistons.length) {
      this.root.updateMatrixWorld(true);
      for (const P of R.pistons) {
        _m.copy(P.from.matrixWorld).invert().multiply(P.to.matrixWorld);
        const b = _b.copy(P.b).applyMatrix4(_m), dl = b.sub(P.a), L = dl.length();
        P.g.position.copy(P.a);
        if (L > 1e-5) P.g.quaternion.setFromUnitVectors(Y_UP, dl.multiplyScalar(1 / L));
        P.rod.position.set(0, L, 0);
      }
    }
    // the dish sweeps, the mast lamp blinks, the shoulder gun follows the look a little
    if (R.dish) R.dish.rotation.y = t * 0.9 + c * 3;
    if (R.bulb) R.bulb.visible = Math.sin(t * 4) > 0.2 || c > 0;
    if (R.gun) R.gun.rotation.set(this.lookPitch * 0.6, this.lookYaw * 0.5, 0);
    // the drone putters on its thruster; the coil and skirt breathe a little glow
    this.putT -= dt;
    if (this.putT <= 0 && h >= 1 && this.root.visible && R.thrusters.length) {
      this.putT = st === 0 ? 0.12 + Math.random() * 0.12 : 0.5 + Math.random() * 0.6;
      const tp = R.thrusters[Math.floor(Math.random() * R.thrusters.length)].getWorldPosition(_a);
      if (st === 0) this.fx.burst(tp.x, tp.y, tp.z, 1, Math.random() < 0.6 ? 0x6f7373 : 0x8e9190, { speed: 0.2, up: -0.3, size: 1.6, life: 0.5, grav: -0.6 });
      if (Math.random() < 0.5) this.fx.burst(tp.x, tp.y, tp.z, 1, this.look_.glow, { glow: true, speed: 0.3, up: -0.6, size: 1.2, life: 0.18, grav: 0 });
    }
    // the stacks smoke (blacker when hurt), the flaps lift with each puff
    this.smokeT -= dt * (1 + c * 6 + this.damage * 4);
    let puff = 0;
    if (this.smokeT <= 0 && h >= 1 && R.exhaust.length && this.root.visible) {
      this.smokeT = 0.5 + Math.random() * 1.2;
      const tip = R.exhaust[Math.floor(Math.random() * R.exhaust.length)];
      const p = tip.getWorldPosition(new THREE.Vector3());
      const sm = this.damage > 0.5;
      this.fx.burst(p.x, p.y, p.z, 1 + Math.round(c * 2) + (sm ? 2 : 0), sm ? 0x2b2e31 : c > 0 ? 0x8e9190 : 0x6f7373, { speed: 0.15, up: 0.5, size: 2, life: 1.1, grav: -0.4 });
      puff = 1;
    }
    for (const f of R.flaps) { f.userData.k = Math.max(puff, (f.userData.k ?? 0) - dt * 2.5); f.rotation.x = -0.15 - f.userData.k * 0.9 - Math.max(0, Math.sin(t * 7)) * 0.05; }
    // wet: darker paint, drips off the lowest parts
    this.U.wet.value = damp(this.U.wet.value, clamp(this.wet, 0, 1), 4, dt); this.UL.wet.value = this.U.wet.value;
    const soak = this.U.wet.value;
    this.dripT -= dt * soak * 16;
    if (this.dripT <= 0 && soak > 0.04 && this.root.visible) {
      this.dripT = 0.4 + Math.random() * 0.8;
      const src = R.arms.length && Math.random() < 0.5 ? R.arms[Math.floor(Math.random() * R.arms.length)].hand : Math.random() < 0.5 && R.body ? R.body : R.head;
      const p = src.localToWorld(_a.set((Math.random() - 0.5) * 0.18, -0.1, (Math.random() - 0.5) * 0.18));
      this.fx.spray(p.x, p.y, p.z, 0, -1, 0, 1 + Math.round(Math.random() * soak), 0x9cb2a5, { speed: 0.4, cone: 0.1, size: 1.6, life: 0.45, grav: 14, jitter: 0.02 });
    }
    // a damaged hull spits sparks
    this.sparkT -= dt * this.damage * 3;
    if (this.sparkT <= 0 && this.root.visible) {
      this.sparkT = 0.3 + Math.random() * 0.9;
      const p = (R.body ?? R.head).localToWorld(_a.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.3) * 0.2, (Math.random() - 0.5) * 0.3));
      this.fx.spray(p.x, p.y, p.z, Math.random() - 0.5, 0.6, Math.random() - 0.5, 4 + Math.round(this.damage * 6), 0xe4cd98, { glow: true, speed: 1.6, size: 1.6, life: 0.3, grav: 6 });
    }
    // lamps and lens: the reactor's glow, a flash on events, a red flush when hit
    this.flashK = Math.max(0, this.flashK - dt * 2.5);
    this.hurtK = Math.max(0, this.hurtK - dt * 3);
    const g = 0.7 + c * 2.0 + Math.max(0, Math.sin(t * 2.0)) * 0.3 + (Math.random() < 0.03 + this.damage * 0.08 ? 0.4 : 0) + (h > 0.7 && h < 1 ? (1 - h) * 6 : 0) + this.flashK * 0.8 + (mouthy ? wk * 0.8 : 0) + (this.has('reactor') ? 0.4 : 0);
    this.U.glow.value = g;
    this.U.flash.value.setRGB(this.hurtK * 0.35, this.hurtK * 0.06, this.hurtK * 0.04);
    this.UL.glow.value = (1.2 + c * 1.4 + this.flashK * 1.5) * (h < 0.8 ? clamp((h - 0.6) / 0.2, 0, 1) : 1);
    this.UL.flash.value.copy(this.flashC).multiplyScalar(this.flashK * 0.35).add(_c.setRGB(this.hurtK * 0.3, 0, 0));
    if (c > 0.3 && Math.random() < dt * 30) {
      const p = R.arms.length ? R.arms[Math.random() < 0.5 ? 0 : R.arms.length - 1].hand.localToWorld(_a.set(0, -0.08, 0.04)) : this.headPos(_a);
      const gc = new THREE.Color(this.look_.glow).multiplyScalar(2.2);
      this.fx.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, gc, 1, 2.5, 0.6, -0.3, 1);
    }
    // a new stage: the welds and bolts spark all over while it unfolds
    if (this.stageFx > 0) {
      this.stageFx -= dt;
      this.boltT -= dt;
      if (this.boltT <= 0 && this.root.visible) {
        this.boltT = 0.05 + Math.random() * 0.08;
        const src = R.body ?? R.head;
        const p = src.localToWorld(_a.set((Math.random() - 0.5) * 0.45, (Math.random() - 0.3) * 0.4, (Math.random() - 0.5) * 0.4));
        this.fx.spray(p.x, p.y, p.z, Math.random() - 0.5, 0.7, Math.random() - 0.5, 5, 0xe4cd98, { glow: true, speed: 1.8, size: 1.6, life: 0.3, grav: 6 });
      }
      if (this.stageFx <= 0 && this.pendingStage) { const s = this.pendingStage; this.pendingStage = null; this.onAssembled?.(s, (R.body ?? R.head).getWorldPosition(new THREE.Vector3())); this.flash(0xe4cd98, 1.2); this.camShake(0.15, 0.3); }
    }
    // parts flying in (or unfolding) to be bolted on
    for (let i = this.asm.length - 1; i >= 0; i--) {
      const a = this.asm[i];
      a.t += dt;
      const u = clamp((a.t - a.delay) / a.dur, 0, 1);
      a.obj.visible = a.t >= a.delay;
      const e = 1 - (1 - u) ** 3, back = u < 1 ? Math.sin(u * Math.PI) * 0.12 * (1 - u) : 0;
      a.obj.position.copy(a.pos).addScaledVector(a.from, 1 - e - back);
      _qa.setFromEuler(_ea.set(a.spin.x * (1 - e), a.spin.y * (1 - e), a.spin.z * (1 - e)));
      a.obj.quaternion.copy(a.quat).multiply(_qa);
      a.obj.scale.copy(a.scale).multiplyScalar(a.unfold ? 0.3 + 0.7 * e : 0.55 + 0.45 * Math.min(1, u * 1.4));
      if (u >= 1) {
        a.obj.position.copy(a.pos); a.obj.quaternion.copy(a.quat); a.obj.scale.copy(a.scale);
        this.asm.splice(i, 1);
        a.obj.updateMatrixWorld(true);
        const at = a.obj.getWorldPosition(new THREE.Vector3());
        this.joltV.x += (Math.random() - 0.5) * 2;
        this.fx.burst(at.x, at.y, at.z, a.unfold ? 6 : 10, 0xe4cd98, { glow: true, speed: 1.6, up: 1.2, size: 1.8, life: 0.35, grav: 5 });
        if (!a.unfold && !this.asm.some((o) => o.part === a.part)) this.onAssembled?.(a.part, at);
      }
    }
    void cam;
  }
}
const _c = new THREE.Color();
/** resting finger curl by hand type */
const L_CURL: Record<string, number> = { fists: 0.9, claws: 0.35, hammers: 0.5 };

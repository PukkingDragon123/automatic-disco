// The U.S. Planetary Corps field laboratory, in three.js. A glass specimen tank of glowing fluid stands in the
// middle of a 1950s lab, its bubbles rising past the specimen that floats inside, slowly turning, lit from below.
// Around it: a bank of consoles with dials and live oscilloscopes, reel-to-reel sequencer cabinets, a centrifuge,
// two field emitters that arc to the tank during an edit, cables and pipes, shelves of specimen jars holding the
// species you have absorbed, chalkboards, the Corps banner, warning signs and hanging work lamps. Dr. Calder and
// two assistants work the stations and react to every edit; Unit 07 hovers at the side, watching.
import * as THREE from 'three';
import { Fx } from '../game/fx';
import { VeyrChild } from '../game/child';
import { loadLook } from '../game/babyLook';
import { calderRig } from '../game/story';
import { Researcher, createResearcher, researcherOutfit, type ResearcherGesture } from '../limbo/entities/researcher';
import type { Appearance } from '../limbo/entities/humanRig';
import type { AnimInput } from '../limbo/entities/humanAnim';
import { worldMaterial } from '../limbo/gfx/materials';
import { registerAllTextures } from '../limbo/gfx/textures/index';
import '../limbo/content/textures/materials';
import { buildSpeciesModel, makeInstance, type SpeciesModel, type CreatureFx } from '../life/creatureMesh';
import { Animator } from '../life/anim';
import { pheno, type Design } from '../life/design';
import { attachRegions, regionHighlight, regUniforms, symbolFor, symbolMaterial, type RegU } from '../life/partPreview';
import { GN_DECL, gbuf, F_HOVER } from '../gfx/gbuf';
import { labTextures, type LabTex } from './labArt';
import { Kit, labMaterials, glowMaterial } from './labGeo';
import type { Species } from '../game/species';
import { sfx } from '../audio/audio';
import { clamp, damp, dampA } from '../core/rand';

const TAU = Math.PI * 2;
const Y = new THREE.Vector3(0, 1, 0);
type V3 = [number, number, number];
/** the specimen's centre in the tank, its fit radius, and the glass */
export const TANK = { c: new THREE.Vector3(0, 1.82, 0), fit: 0.9, r: 1.1, y0: 0.64, y1: 3.02, fluidTop: 2.88, electrode: new THREE.Vector3(0, 4.08, 0) };

// ================================================================================================ the specimen
export class Specimen {
  readonly model: SpeciesModel; readonly mesh: THREE.SkinnedMesh; readonly fx: CreatureFx; readonly anim: Animator; readonly U: RegU;
  readonly regions: Float32Array; readonly s: number; readonly off = new THREE.Vector3(); readonly fly: boolean;
  private wp: Float32Array | null = null; private wpT = -1;
  readonly present = new Set<number>();
  constructor(readonly d: Design) {
    this.model = buildSpeciesModel(d);
    this.regions = attachRegions(this.model);
    for (const r of this.regions) this.present.add(r);
    const inst = makeInstance(this.model);
    this.mesh = inst.mesh; this.fx = inst.fx;
    this.anim = new Animator(this.model.rig, inst.bones, this.mesh);
    this.U = regUniforms();
    regionHighlight(this.mesh.material as THREE.Material, this.U, 'spec');
    this.mesh.frustumCulled = false;
    const g = this.model.geo; g.computeBoundingBox();
    const b = g.boundingBox!, sz = b.getSize(new THREE.Vector3());
    b.getCenter(this.off);
    this.s = clamp((TANK.fit * 2) / Math.max(sz.x, sz.y, sz.z, 0.05), 0.2, 7);
    this.fly = pheno(d).canFly;
  }
  /** animate at true scale (the IK works in metres), then scale and place it in the tank */
  pose(dt: number, yaw: number, at: THREE.Vector3, t: number) {
    const m = this.mesh, rig = this.model.rig;
    m.scale.setScalar(1); m.position.set(0, 0, 0); m.rotation.set(0, yaw, 0); m.updateMatrixWorld(true);
    this.anim.update(dt, { speed: 0, turn: 0, state: this.fly ? 'fly' : 'idle', act: 0, lookYaw: Math.sin(t * 0.43) * 0.55, lookPitch: Math.sin(t * 0.31) * 0.2, ground: () => -rig.rideH * 0.14, air: 0 });
    m.scale.setScalar(this.s);
    const o = this.off.clone().multiplyScalar(this.s).applyAxisAngle(Y, yaw);
    m.position.copy(at).sub(o);
    m.rotation.set(Math.sin(t * 0.7) * 0.04, yaw, Math.sin(t * 0.53) * 0.05);
    m.updateMatrixWorld(true);
    this.wpT += dt;
  }
  /** skinned vertex positions in world space (cached briefly: the idle pose barely moves) */
  private world(): Float32Array {
    if (this.wp && this.wpT < 0.18 && this.wpT >= 0) return this.wp;
    const g = this.model.geo, P = g.attributes.position as THREE.BufferAttribute, SI = g.attributes.skinIndex as THREE.BufferAttribute, SW = g.attributes.skinWeight as THREE.BufferAttribute;
    const sk = this.mesh.skeleton, M = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]).elements);
    const out = this.wp ?? new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      let ox = 0, oy = 0, oz = 0;
      for (let k = 0; k < 4; k++) {
        const w = SW.getComponent(i, k); if (w <= 0) continue;
        const e = M[SI.getComponent(i, k)];
        ox += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); oy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); oz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
      }
      out[i * 3] = ox; out[i * 3 + 1] = oy; out[i * 3 + 2] = oz;
    }
    this.wp = out; this.wpT = 0;
    return out;
  }
  /** the body region under a ray (0 = none) and the hit point */
  pick(ray: THREE.Ray): { reg: number; at: THREE.Vector3 } | null {
    const sph = new THREE.Sphere(TANK.c, TANK.fit * 1.6);
    if (!ray.intersectsSphere(sph)) return null;
    const W = this.world(), idx = this.model.geo.index!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
    let best = Infinity, reg = 0; const at = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
      a.fromArray(W, i0 * 3); b.fromArray(W, i1 * 3); c.fromArray(W, i2 * 3);
      if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
      const d = hit.distanceToSquared(ray.origin);
      if (d < best) { best = d; reg = this.regions[i0]; at.copy(hit); }
    }
    return reg ? { reg, at } : null;
  }
  /** world centre of a region (for pointing at it) */
  centreOf(reg: number): THREE.Vector3 {
    const W = this.world(); const c = new THREE.Vector3(); let n = 0;
    for (let i = 0; i < this.regions.length; i += 3) if (this.regions[i] === reg) { c.x += W[i * 3]; c.y += W[i * 3 + 1]; c.z += W[i * 3 + 2]; n++; }
    return n ? c.multiplyScalar(1 / n) : TANK.c.clone();
  }
  dispose() { this.mesh.removeFromParent(); (this.mesh.material as THREE.Material).dispose(); this.model.geo.dispose(); this.model.tex.dispose(); this.model.depthMat.dispose(); }
}

// ================================================================================================ shaders
const FLUID_V = 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vec4 mv = viewMatrix * wp; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }';
const FLUID_F = GN_DECL + `uniform float uT, uFlash, uBack, uY0, uY1; uniform vec3 uCol, uHot;
varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  float h = clamp((vP.y - uY0) / (uY1 - uY0), 0.0, 1.0);
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  float fr = pow(1.0 - abs(dot(n, v)), 1.6);
  float ang = atan(vP.z, vP.x);
  float c = sin(vP.y * 6.0 - uT * 1.2 + sin(ang * 5.0 + uT * 0.7) * 0.9) * 0.5 + 0.5;
  c = floor(c * 4.0 + 0.5) / 4.0;
  float band = step(0.93, fract(vP.y * 1.6 - uT * 0.25));
  vec3 col = mix(uCol, uHot, (1.0 - h) * 0.5 + uFlash * 0.5) * (0.32 + (1.0 - h) * 0.55 + c * 0.2 + fr * 0.45 + band * 0.2) * (1.0 + uFlash * 1.5);
  float a = clamp((uBack > 0.5 ? 0.16 + fr * 0.2 + (1.0 - h) * 0.12 : 0.05 + fr * 0.3 + (1.0 - h) * 0.06) + band * 0.03 + uFlash * 0.22, 0.0, 0.75);
  gl_FragColor = vec4(col * a, a);
  gNormal = vec4(0.0);
}`;
const GLASS_F = GN_DECL + `uniform float uT; uniform vec3 uTint;
varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  float fr = pow(1.0 - abs(dot(n, v)), 3.0);
  float ang = atan(vP.z, vP.x);
  float s1 = step(abs(fract(ang * 0.159 + 0.08) - 0.5), 0.0045), s2 = step(abs(fract(ang * 0.159 + 0.115) - 0.5), 0.002), s3 = step(abs(fract(ang * 0.159 + 0.62) - 0.5), 0.003);
  float a = clamp(fr * 0.3 + (s1 * 0.32 + s2 * 0.22 + s3 * 0.12) * (0.75 + 0.25 * sin(vP.y * 3.0)), 0.0, 0.6);
  gl_FragColor = vec4(mix(uTint, vec3(1.0), 0.35) * a, a * 0.7);
  gNormal = vec4(0.0);
}`;
const BUB_V = 'attribute float aSize; attribute float aLife; uniform float uScale; varying float vL; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = max(1.0, aSize * uScale / -mv.z); vL = aLife; gl_Position = projectionMatrix * mv; }';
const BUB_F = GN_DECL + `uniform vec3 uCol; varying float vL;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0; float d = length(p);
  if (d > 1.0 || vL <= 0.0) discard;
  float ring = step(0.66, d);
  float hl = step(length(p - vec2(-0.32, -0.32)), 0.26);
  float a = (ring * 0.55 + hl * 0.85 + 0.05) * clamp(vL * 3.0, 0.0, 1.0);
  gl_FragColor = vec4(uCol * (ring * 1.1 + hl * 2.0 + 0.2) * a, a);
  gNormal = vec4(0.0);
}`;
const SCOPE_V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const SCOPE_F = GN_DECL + `uniform float uT, uWild, uSeed, uKind; varying vec2 vUv;
void main(){
  vec2 G = vec2(48.0, 32.0);
  vec2 g = (floor(vUv * G) + 0.5) / G;
  float x = g.x * 6.2831;
  float w;
  if (uKind < 0.5) w = sin(x * (2.0 + uSeed) + uT * 3.0) * 0.26 * (1.0 + uWild * 0.8) + sin(x * 7.3 + uT * 9.0 + uSeed * 5.0) * 0.06 * (1.0 + uWild * 4.0);
  else if (uKind < 1.5) w = (fract(g.x * 3.0 + uT * 0.8) - 0.5) * 0.5 * (1.0 + uWild) + sin(uT * 31.0 + g.x * 90.0) * 0.08 * uWild;
  else w = (step(0.5, fract(g.x * 4.0 + uT * 0.6 + uSeed)) - 0.5) * 0.4 + sin(uT * 23.0 + g.x * 40.0) * 0.06 * uWild;
  float line = step(abs(g.y - 0.5 - w), 1.0 / G.y);
  float sweep = step(abs(fract(uT * 0.4 + uSeed) - g.x), 1.0 / G.x) * 0.25;
  float grid = (mod(floor(vUv.x * G.x), 8.0) < 0.5 || mod(floor(vUv.y * G.y), 8.0) < 0.5) ? 0.16 : 0.0;
  vec2 q = vUv - 0.5; float vig = 1.0 - dot(q, q) * 1.6;
  vec3 c = vec3(0.3, 1.0, 0.5) * (line * 1.9 + grid + sweep + 0.06) * vig;
  gl_FragColor = vec4(c, 1.0);
  gNormal = vec4(0.5, 0.5, 1.0, 33.0);
}`;

// ================================================================================================ scientists
const HALE_APP = { skin: 0xb07a52, hair: 0x18120e, hairStyle: 'short', face: 1, build: 'broad', height: 1.05, bodyShape: 0.0, eyeColor: 0x3a2a1a, facialHair: 'moustache', freckles: 0, scars: 0, age: 0.5, jaw: 3, eyeShape: 0, brows: 3, nose: 3, mouth: 2, ears: 2 } as unknown as Appearance;
export interface Sci {
  rig: Researcher; name: string; home: THREE.Vector3; workYaw: number; work: string; yaw: number;
  mode: 'work' | 'watch' | 'react' | 'cheer'; t: number; act: string; actT: number; actDur: number; say: string[]; quip: number; col: string;
}
const LINES: Record<string, string[][]> = {
  // [Calder, Varga, Hale]
  idle: [["Field's holding at four-twenty.", 'Look at it turn. It watches us back.', 'Write that down, would you?', 'Unit 07 is learning faster than we are.'], ['Cell count stable.', 'Pigment response is remarkable.', 'Sample sheet updated, Doctor.', 'Fluid temperature nominal.'], ['Reel two is running hot.', 'Tape is good to the end, sir.', 'Coils charged.', 'Coffee, anybody?']],
  edit: [['There. Watch the graft take.', 'Beautiful. Hold the field steady.', 'It is rewriting itself.', 'Good. Again, if you like.'], ['The tissue is accepting it!', 'Look at the musculature.', 'Recording the phenotype.', 'Remarkable.'], ['Voltage spike! All good.', 'Sequencer has it.', 'Coils discharging!', 'Whoa! Steady...']],
  splice: [['Cross-lineage. Nobody has ever done that.', 'Two lineages in one body. God help us.'], ['A foreign gene, and it took!', 'That should not be possible.'], ['Splice is holding, sir.', "Machine says it's viable."]],
  plan: [['A whole new body plan. Stand back.', 'Re-growing from the frame up.'], ['It is remaking itself entirely!', 'Full re-growth. Keep the fluid moving.'], ['Big draw on the coils!', 'Hold on to something!']],
  load: [['Bring up that sample.', 'Into the tank with it.'], ['Thawing the specimen now.', 'Sample transferred.'], ['Pulling the reel for that one.', 'Pumping it in.']],
  bad: [["It won't live like that.", 'Something is missing. It cannot feed.'], ['The phenotype will fail, Doctor.', 'That design is not viable.'], ['Machine says no go.', 'Red light on that one.']],
  save: [['File it. Specimen accepted.', 'Well done. Grow it.'], ['Logged and catalogued!', 'Off to the brood vats.'], ['Tape archived!', 'Sequence locked in.']],
};

// ================================================================================================ the lab
interface Jar { sp: Species | null; at: THREE.Vector3; mesh: THREE.Object3D | null; bob: number; r: number }
interface Coil { top: THREE.Vector3; corona: THREE.Mesh }

export class LabScene {
  readonly scene = new THREE.Scene();
  readonly fxs = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 90);
  readonly fx: Fx;
  readonly T: LabTex;
  readonly M: Record<string, THREE.Material>;
  spec: Specimen | null = null;
  private old: Specimen | null = null; private oldT = 0;
  private pending: { d: Design; dramatic: boolean } | null = null; private pendT = 0;
  private inT = 0;
  specYaw = 0.6; turn = 0.22; private hold = 0;
  // camera
  yaw = 0.12; pitch = 0.12; dist = 9; yawGoal = 0.12; pitchGoal = 0.12; distGoal = 9;
  readonly target = new THREE.Vector3(0.3, 1.72, -0.3); readonly targetGoal = new THREE.Vector3(0.3, 1.72, -0.3);
  private shake = 0;
  // tank
  private fluidU = { uT: { value: 0 }, uFlash: { value: 0 }, uBack: { value: 0 }, uY0: { value: TANK.y0 }, uY1: { value: TANK.fluidTop }, uCol: { value: new THREE.Color(0x1aa888) }, uHot: { value: new THREE.Color(0x7affe0) } };
  private bub!: THREE.Points; private bubP!: Float32Array; private bubL!: Float32Array; private bubV!: Float32Array; private surge = 0;
  private tankLight!: THREE.PointLight; private arcLight!: THREE.PointLight; private ringMat!: THREE.MeshBasicMaterial;
  private surface!: THREE.Mesh;
  // machinery
  private scopes: THREE.ShaderMaterial[] = [];
  private reels: { m: THREE.Object3D; w: number }[] = [];
  private rotor: THREE.Object3D | null = null; private rotW = 0.6; private rotGoal = 0.6;
  private coils: Coil[] = [];
  private beacons: { m: THREE.Mesh; ph: number }[] = [];
  private lamps: { light: THREE.PointLight; base: number; ph: number }[] = [];
  private arcT = 0; private arcK = 0; private zapT = 0; private wild = 0;
  private jarGlow!: THREE.Mesh;
  jars: Jar[] = [];
  hoverJar = -1;
  // people
  readonly sci: Sci[] = [];
  readonly child: VeyrChild;
  onSay?: (i: number, text: string) => void;
  private ray = new THREE.Raycaster();
  t = 0;

  constructor() {
    this.T = labTextures();
    this.M = labMaterials(this.T);
    this.fx = new Fx(this.fxs, this.scene);
    this.scene.background = new THREE.Color(0x07090a);
    this.scene.add(this.cam);
    this.lights();
    this.room();
    this.tank();
    this.machines();
    this.dressing();
    this.people();
    this.child = new VeyrChild(this.fx, 1.05, loadLook(), { grown: true });
    this.child.hatch = 1;
    this.child.root.position.set(1.9, 0.7, 0.0);
    this.child.look.copy(TANK.c);
    this.scene.add(this.child.root);
    const jg = new THREE.TorusGeometry(0.2, 0.012, 4, 24); jg.rotateX(Math.PI / 2);
    this.jarGlow = new THREE.Mesh(jg, glowMaterial(0xffd060, 2)); this.jarGlow.visible = false; this.scene.add(this.jarGlow);
  }

  // ---------------------------------------------------------------------------------------------- lights
  private lights() {
    this.scene.add(new THREE.HemisphereLight(0x8a9cb0, 0x2a241e, 0.6));
    const key = new THREE.SpotLight(0xffe2b8, 95, 22, 0.62, 0.55, 1.6);
    key.position.set(1.8, 4.7, 4.2); key.target.position.set(0, 1.3, -0.4);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.camera.near = 1; key.shadow.camera.far = 16;
    this.scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0x9ab0d0, 0.5); fill.position.set(-4, 3, 5); this.scene.add(fill);
    this.tankLight = new THREE.PointLight(0x5affd0, 20, 7.5, 1.4); this.tankLight.position.set(0, 0.85, 0.15); this.scene.add(this.tankLight);
    const top = new THREE.PointLight(0x8affe8, 3, 3, 1.5); top.position.set(0, 2.95, 0); this.scene.add(top);
    this.arcLight = new THREE.PointLight(0xc8d8ff, 0, 10, 1.5); this.arcLight.position.set(0, 3.6, -0.8); this.scene.add(this.arcLight);
    for (const [x, z] of [[-3.6, 0.2], [3.5, 0.4], [0.2, -3.4]] as [number, number][]) {
      const l = new THREE.PointLight(0xffcf90, 9, 9, 1.6); l.position.set(x, 3.55, z); this.scene.add(l);
      this.lamps.push({ light: l, base: 9, ph: Math.random() * 10 });
    }
    // a light that only reaches the part icons riding in front of the camera
    const icon = new THREE.PointLight(0xfff4e8, 2.2, 1.4, 1.2); icon.position.set(0.15, 0.35, 0.1); this.cam.add(icon);
  }

  private add(k: Kit, x = 0, y = 0, z = 0, ry = 0, parent: THREE.Object3D = this.scene) { const g = k.build(this.M); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; }

  // ---------------------------------------------------------------------------------------------- the room
  private room() {
    const k = new Kit();
    const X0 = -6.8, X1 = 6.8, Z0 = -5.2, Z1 = 7, H = 4.8, WAIN = 1.5;
    k.quad('floor', [X0, 0, Z1], [X1, 0, Z1], [X1, 0, Z0], [X0, 0, Z0]);
    // walls: glazed tile wainscot, a black steel dado, plaster above
    const wall = (a: V3, b: V3) => {
      k.quad('tile', [a[0], 0, a[2]], [b[0], 0, b[2]], [b[0], WAIN, b[2]], [a[0], WAIN, a[2]]);
      k.quad('plaster', [a[0], WAIN + 0.08, a[2]], [b[0], WAIN + 0.08, b[2]], [b[0], H, b[2]], [a[0], H, a[2]]);
      const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz), nx = -dz / L * 0.03, nz = dx / L * 0.03;
      k.quad('gun', [a[0] + nx, WAIN, a[2] + nz], [b[0] + nx, WAIN, b[2] + nz], [b[0] + nx, WAIN + 0.08, b[2] + nz], [a[0] + nx, WAIN + 0.08, a[2] + nz]);
      k.quad('gun', [a[0] + nx, 0, a[2] + nz], [b[0] + nx, 0, b[2] + nz], [b[0] + nx, 0.12, b[2] + nz], [a[0] + nx, 0.12, a[2] + nz], undefined, 0x8a8a8a);
    };
    wall([X0, 0, Z0], [X1, 0, Z0]);
    wall([X0, 0, Z1], [X0, 0, Z0]);
    wall([X1, 0, Z0], [X1, 0, Z1]);
    k.quad('concrete', [X0, H, Z0], [X1, H, Z0], [X1, H, Z1], [X0, H, Z1], undefined, 0x9a9a9a);
    // ceiling beams and the pipe run along the back wall
    for (const z of [-3.6, -0.4, 2.8]) k.box(0, H - 0.34, z, X1 - X0, 0.34, 0.22, 'gun', { col: 0x9a9a9a });
    for (const x of [-4.2, 4.2]) k.box(x, H - 0.3, 0.8, 0.2, 0.3, Z1 - Z0, 'gun', { col: 0x8a8a8a });
    for (const [y, r, mat, col] of [[4.25, 0.07, 'copper', 0xffffff], [4.05, 0.05, 'olive', 0xffffff], [3.9, 0.09, 'cream', 0xd8d0c0]] as [number, number, string, number][]) {
      k.tube([[X0, y, Z0 + 0.22], [X1, y, Z0 + 0.22]], r, 8, mat, { col });
      for (let x = X0 + 0.8; x < X1; x += 1.6) k.cyl(x, y - r * 1.4, Z0 + 0.22, r * 1.6, r * 2.8, 8, 'gun').box(x, y, Z0 + 0.1, 0.04, 0.04, 0.24, 'gun');
    }
    // a pipe drops down the right corner to a valve wheel
    k.tube([[X1 - 0.25, 4.25, Z0 + 0.22], [X1 - 0.25, 4.25, Z0 + 0.4], [X1 - 0.25, 0.5, Z0 + 0.4]], 0.07, 8, 'copper');
    k.push().at(X1 - 0.25, 1.4, Z0 + 0.55, 0, Math.PI / 2).torus(0, 0, 0, 0.16, 0.025, 12, 4, 'red').pop();
    // the door on the right wall, posters and boards on the left
    k.push().at(X1 - 0.02, 0, 3.2, -Math.PI / 2);
    k.box(0, 0, 0, 1.2, 2.25, 0.06, 'olive', { dec: 'door' }).box(0, 2.25, 0, 1.36, 0.12, 0.1, 'gun').box(-0.64, 0, 0, 0.08, 2.3, 0.1, 'gun').box(0.64, 0, 0, 0.08, 2.3, 0.1, 'gun');
    k.panel(0, 2.65, 0.04, 0.9, 0.22, 'signAuth');
    k.pop();
    k.push().at(X0 + 0.02, 0, 0, Math.PI / 2);
    k.panel(-2.6, 2.3, 0.0, 0.8, 1.1, 'poster1').panel(-1.5, 2.3, 0, 0.8, 1.1, 'poster2').panel(1.4, 2.25, 0, 1.5, 1.0, 'map').panel(3.2, 1.9, 0, 0.6, 0.8, 'fuse');
    k.box(1.4, 1.72, 0.02, 1.62, 0.04, 0.05, 'oak').box(1.4, 2.76, 0.02, 1.62, 0.04, 0.05, 'oak');
    k.pop();
    // back wall: chalkboard, clock, banner, signs
    k.push().at(0, 0, Z0 + 0.02);
    k.box(-2.65, 1.12, 0.02, 2.9, 0.08, 0.06, 'oak').box(-2.65, 2.62, 0.02, 2.9, 0.08, 0.06, 'oak').box(-4.1, 1.12, 0.02, 0.08, 1.58, 0.06, 'oak').box(-1.2, 1.12, 0.02, 0.08, 1.58, 0.06, 'oak');
    k.panel(-2.65, 1.91, 0.035, 2.82, 1.42, 'chalkA');
    k.box(-2.65, 1.04, 0.1, 2.9, 0.06, 0.14, 'oak'); // chalk ledge
    for (let i = 0; i < 5; i++) k.box(-3.6 + i * 0.22, 1.1, 0.12, 0.08, 0.02, 0.02, 'porcelain', { col: [0xffffff, 0xffe880, 0xffb0c0, 0xffffff, 0xb0d8ff][i] });
    k.push().at(-2.65, 3.25, 0.01, 0, Math.PI / 2); k.cyl(0, 0, 0, 0.27, 0.05, 16, 'gun', { capDec: 'clock' }); k.pop();
    k.panel(5.4, 2.5, 0.03, 0.62, 0.78, 'calendar').panel(-0.9, 1.15, 0.03, 0.56, 0.21, 'signNo');
    k.pop();
    this.add(k);
    // the banner hangs from a pole in front of the back wall, with a little drape
    const b = new Kit();
    const bw = 1.5, bh = 2.5, top = 4.45, bz = Z0 + 0.12, N = 6;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, x0 = -bw / 2 + bw * u0, x1 = -bw / 2 + bw * u1, z0 = bz + Math.sin(u0 * Math.PI * 3) * 0.03, z1 = bz + Math.sin(u1 * Math.PI * 3) * 0.03;
      const [U0, V0, U1, V1] = [(0 + 192 * u0) / 1024, 0, (192 * u1) / 1024, 320 / 1024];
      b.quad('decal', [x0, top - bh, z0], [x1, top - bh, z1], [x1, top, z1], [x0, top, z0], [U0 + 0.25 / 1024, V0 + 0.25 / 1024, U1 - 0.25 / 1024, V1 - 0.25 / 1024]);
    }
    b.push().at(0, top + 0.04, bz, 0, 0, Math.PI / 2).cyl(0, -bw / 2 - 0.12, 0, 0.025, bw + 0.24, 6, 'brass').pop();
    b.ball(-bw / 2 - 0.14, top + 0.04, bz, 0.05, 'brass').ball(bw / 2 + 0.14, top + 0.04, bz, 0.05, 'brass');
    b.cable([-bw / 2, top + 0.05, bz], [0, 4.8, bz - 0.05], -0.1, 0.008, 'rubber').cable([bw / 2, top + 0.05, bz], [0, 4.8, bz - 0.05], -0.1, 0.008, 'rubber');
    this.add(b);
  }

  // ---------------------------------------------------------------------------------------------- the tank
  private tank() {
    const k = new Kit();
    // pedestal
    k.cyl(0, 0, 0, 1.42, 0.12, 24, 'gun').cyl(0, 0.12, 0, 1.3, 0.3, 24, 'navy').cyl(0, 0.42, 0, 1.31, 0.09, 24, 'haz').cyl(0, 0.51, 0, 1.27, 0.07, 24, 'brass').cyl(0, 0.58, 0, 1.18, 0.06, 24, 'gun');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; k.ball(Math.sin(a) * 1.36, 0.12, Math.cos(a) * 1.36, 0.04, 'brass', { segs: 6 }); }
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; k.push().at(Math.sin(a) * 1.25, 0, Math.cos(a) * 1.25, a).box(0, 0, 0.15, 0.32, 0.22, 0.42, 'gun').pop(); }
    k.push().at(0, 0, 0).panel(0, 0.27, 1.31, 0.56, 0.18, 'plaque').pop();
    k.push().at(0, 0, 0, 0.9).panel(0, 0.27, 1.31, 0.3, 0.3, 'signBio').pop();
    k.push().at(0, 0, 0, -0.9).panel(0, 0.27, 1.31, 0.32, 0.32, 'gaugeBig').pop();
    // the grate floor inside the tank and the bubble nozzles
    k.cyl(0, 0.62, 0, 1.08, 0.02, 24, 'gun', { capDec: 'grate' });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.cyl(Math.sin(a) * 0.62, 0.62, Math.cos(a) * 0.62, 0.05, 0.08, 6, 'brass'); }
    // brass struts and bands of the frame
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.26; k.box(Math.sin(a) * 1.14, 0.62, Math.cos(a) * 1.14, 0.06, 2.42, 0.06, 'brass'); }
    k.torus(0, 1.84, 0, 1.13, 0.025, 32, 4, 'brass');
    // the cap: brass ring, riveted drum, dome, insulators and the electrode the field arcs into
    k.cyl(0, 3.02, 0, 1.24, 0.08, 24, 'brass').cyl(0, 3.1, 0, 1.18, 0.3, 24, 'navy').cyl(0, 3.4, 0, 1.2, 0.05, 24, 'brass');
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; k.ball(Math.sin(a) * 1.185, 3.25, Math.cos(a) * 1.185, 0.022, 'brass', { segs: 4 }); }
    k.lathe(0, 3.45, 0, [[1.05, 0], [0.95, 0.16], [0.7, 0.3], [0.36, 0.38], [0.22, 0.4]], 20, 'gun');
    for (let i = 0; i < 4; i++) k.lathe(0, 3.85 + i * 0.05, 0, [[0.09, 0], [0.15, 0.01], [0.15, 0.025], [0.09, 0.04]], 12, 'porcelain');
    k.cyl(0, 3.84, 0, 0.05, 0.12, 8, 'brass');
    k.ball(TANK.electrode.x, TANK.electrode.y, TANK.electrode.z, 0.15, 'brass', { segs: 10 });
    // hoses from the cap into the ceiling, and a pump on the cap
    k.tube([[0.62, 3.42, 0.3], [0.7, 3.9, 0.3], [0.85, 4.5, 0.2], [0.9, 4.8, 0.1]], 0.06, 8, 'copper');
    k.tube([[-0.55, 3.42, -0.4], [-0.66, 4.0, -0.45], [-0.6, 4.8, -0.5]], 0.075, 8, 'rubber');
    k.tube([[0.1, 3.42, -0.8], [0.16, 4.2, -0.9], [0.1, 4.8, -1.0]], 0.05, 8, 'olive');
    k.push().at(-0.75, 3.45, 0.45, 0.6).cbox(0, 0, 0, 0.36, 0.26, 0.3, 0.05, 'olive').cyl(0.22, 0.08, 0, 0.08, 0.04, 10, 'brass').pop();
    // floor: a hazard ring, cables from the machines to the pedestal
    k.lathe(0, 0.005, 0, [[1.86, 0], [1.62, 0]], 32, 'haz');
    const cab = (a: V3, b: V3, col: number, r = 0.045) => k.cable(a, b, 0.0, r, 'rubber', col);
    cab([-1.3, 0.05, 0.3], [-4.0, 0.05, 0.6], 0xffffff); cab([-1.3, 0.05, -0.2], [-4.0, 0.05, -0.9], 0x9a6a6a, 0.035);
    cab([1.0, 0.05, -0.85], [2.5, 0.05, -1.4], 0xffffff, 0.05); cab([-1.0, 0.05, -0.85], [-2.5, 0.05, -1.4], 0xffffff, 0.05);
    cab([0.9, 0.04, 0.9], [3.4, 0.04, 2.0], 0x7a7aa0, 0.03);
    this.add(k);
    // the under-glow ring around the grate: an emitter so it blooms
    this.ringMat = glowMaterial(0x6affd8, 2.4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.03, 4, 48).rotateX(Math.PI / 2), this.ringMat); ring.position.y = 0.645; this.scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.025, 4, 48).rotateX(Math.PI / 2), this.ringMat); ring2.position.y = 3.0; this.scene.add(ring2);
    // fluid: back half darker, front half tints what is inside; a wobbling surface; glass with streaks
    const H = TANK.fluidTop - TANK.y0;
    const mk = (side: THREE.Side, back: number, order: number) => {
      const U = { ...this.fluidU, uBack: { value: back } };
      const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FLUID_V, fragmentShader: FLUID_F, transparent: true, depthWrite: false, premultipliedAlpha: true, side });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(TANK.r - 0.04, TANK.r - 0.04, H, 40, 1, true), m);
      mesh.position.y = TANK.y0 + H / 2; mesh.renderOrder = order; this.fxs.add(mesh);
    };
    mk(THREE.BackSide, 1, 1); mk(THREE.FrontSide, 0, 4);
    const sg = new THREE.CircleGeometry(TANK.r - 0.04, 40, 0, TAU).rotateX(-Math.PI / 2);
    const sm = new THREE.ShaderMaterial({ uniforms: { ...this.fluidU, uBack: { value: 0 } }, vertexShader: FLUID_V, fragmentShader: FLUID_F, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide });
    this.surface = new THREE.Mesh(sg, sm); this.surface.position.y = TANK.fluidTop; this.surface.renderOrder = 3; this.fxs.add(this.surface);
    const gm = new THREE.ShaderMaterial({ uniforms: { uT: this.fluidU.uT, uTint: { value: new THREE.Color(0xb8fff0) } }, vertexShader: FLUID_V, fragmentShader: GLASS_F, transparent: true, depthWrite: false, premultipliedAlpha: true });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(TANK.r, TANK.r, TANK.y1 - TANK.y0, 40, 1, true), gm);
    glass.position.y = (TANK.y0 + TANK.y1) / 2; glass.renderOrder = 5; this.fxs.add(glass);
    // bubbles
    const N = 220;
    this.bubP = new Float32Array(N * 3); this.bubL = new Float32Array(N); this.bubV = new Float32Array(N * 2);
    const size = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.respawn(i, true); size[i] = 0.025 + Math.random() ** 2 * 0.07; }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.bubP, 3).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute('aLife', new THREE.BufferAttribute(this.bubL, 1).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const bm = new THREE.ShaderMaterial({ uniforms: { uScale: this.fx.U.uScale, uCol: { value: new THREE.Color(0xb8fff0) } }, vertexShader: BUB_V, fragmentShader: BUB_F, transparent: true, depthWrite: false, premultipliedAlpha: true });
    this.bub = new THREE.Points(bg, bm); this.bub.frustumCulled = false; this.bub.renderOrder = 2; this.fxs.add(this.bub);
  }
  private respawn(i: number, anywhere = false) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.95, nz = Math.random() < 0.6;
    const na = Math.floor(Math.random() * 6) / 6 * TAU;
    this.bubP[i * 3] = nz ? Math.sin(na) * 0.62 : Math.cos(a) * r; this.bubP[i * 3 + 2] = nz ? Math.cos(na) * 0.62 : Math.sin(a) * r;
    this.bubP[i * 3 + 1] = anywhere ? TANK.y0 + Math.random() * (TANK.fluidTop - TANK.y0) : TANK.y0 + 0.08;
    this.bubL[i] = 1; this.bubV[i * 2] = 0.25 + Math.random() * 0.5; this.bubV[i * 2 + 1] = Math.random() * 10;
  }

  // ---------------------------------------------------------------------------------------------- machinery
  private scopeMesh(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, kind: number) {
    const m = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uWild: { value: 0 }, uSeed: { value: Math.random() }, uKind: { value: kind } }, vertexShader: SCOPE_V, fragmentShader: SCOPE_F });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); s.position.set(x, y, z); parent.add(s);
    this.scopes.push(m);
    return s;
  }
  private machines() {
    // ---- the console bank, along the left, facing the tank
    const bank = new THREE.Group(); bank.position.set(-4.75, 0, 0.25); bank.rotation.y = Math.PI / 2; this.scene.add(bank);
    for (let u = 0; u < 3; u++) {
      const k = new Kit(), x = (u - 1) * 1.24;
      k.push().at(x, 0, 0);
      k.cbox(0, 0, 0, 1.18, 0.92, 0.76, 0.04, u === 1 ? 'cream' : 'gun', { dec: u === 1 ? 'consoleB' : 'consoleA' });
      k.box(0, 0.92, 0, 1.22, 0.04, 0.8, 'gun');
      const zf = 0.38, zb = 0.02, y0 = 0.96, y1 = 1.16;
      k.quad('decal', [-0.57, y0, zf], [0.57, y0, zf], [0.57, y1, zb], [-0.57, y1, zb], 'desk');
      k.tri('gun', [-0.57, y0, zf], [-0.57, y1, zb], [-0.57, y0, zb]); k.tri('gun', [0.57, y0, zf], [0.57, y0, zb], [0.57, y1, zb]);
      k.box(0, 0.96, -0.18, 1.18, 0.95, 0.36, u === 1 ? 'cream' : 'gun');
      k.panel(0, 1.62, 0.005, 0.95, 0.32, u === 1 ? 'consoleA' : 'consoleB');
      k.panel(-0.3, 1.3, 0.005, 0.5, 0.36, 'scopeBezel').panel(0.3, 1.3, 0.005, 0.5, 0.36, u === 2 ? 'blinken' : 'scopeBezel');
      k.box(0, 1.91, -0.2, 1.2, 0.05, 0.42, 'gun');
      if (u === 1) { k.cyl(0.42, 1.96, -0.12, 0.06, 0.05, 8, 'gun'); k.box(-0.35, 1.96, -0.2, 0.24, 0.14, 0.2, 'olive'); }
      k.pop();
      this.add(k, 0, 0, 0, 0, bank);
      this.scopeMesh(bank, x - 0.3, 1.31, 0.012, 0.36, 0.24, u);
      if (u !== 2) this.scopeMesh(bank, x + 0.3, 1.31, 0.012, 0.36, 0.24, (u + 1) % 3);
      if (u === 1) { const bc = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), glowMaterial(0xff4a2a, 2)); bc.position.set(x + 0.42, 2.05, -0.12); bank.add(bc); this.beacons.push({ m: bc, ph: 0 }); }
    }
    // a gooseneck lamp on the bank
    const gl = new Kit();
    gl.cyl(0.9, 1.93, -0.25, 0.08, 0.03, 8, 'gun').tube([[0.9, 1.96, -0.25], [0.9, 2.3, -0.2], [0.8, 2.45, 0.05]], 0.012, 5, 'gun');
    gl.lathe(0.78, 2.32, 0.12, [[0.0, 0.12], [0.05, 0.1], [0.1, 0.02], [0.11, 0]], 10, 'olive');
    this.add(gl, 0, 0, 0, 0, bank);
    const gb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), glowMaterial(0xffe0a0, 2.5)); gb.position.set(0.78, 2.33, 0.12); bank.add(gb);
    // ---- the sequencer: reel-to-reel cabinets along the back wall, a teletype desk in front
    const seq = new Kit();
    for (let i = 0; i < 3; i++) seq.cbox(-5.6 + i * 0.86, 0, -4.82, 0.82, 1.96, 0.7, 0.03, 'gun', { dec: 'reelFace' }).box(-5.6 + i * 0.86, 1.96, -4.82, 0.84, 0.05, 0.72, 'gun');
    seq.box(-6.2, 0, -3.95, 0.36, 0.42, 0.36, 'oak', { dec: 'crate' });
    this.add(seq);
    for (let i = 0; i < 3; i++) for (const [y, w] of [[1.55, 1.3 + i * 0.2], [1.1, -1.1 - i * 0.3]] as [number, number][]) {
      const rk = new Kit(); rk.push().at(0, 0, 0, 0, Math.PI / 2).cyl(0, -0.015, 0, 0.15, 0.03, 18, 'gun', { capDec: 'reelDisc', a0: 0 }).pop();
      const g = this.add(rk); g.position.set(-5.6 + i * 0.86, y, -4.82 + 0.36); this.reels.push({ m: g, w });
    }
    const desk = new Kit();
    desk.push().at(-4.25, 0, -2.72, Math.PI + 0.12);
    desk.box(0, 0, 0, 1.3, 0.74, 0.62, 'olive').box(0, 0.74, 0, 1.36, 0.04, 0.66, 'oak');
    desk.push().at(-0.1, 0.78, 0.05, 0, -0.12).box(0, 0, 0, 0.6, 0.08, 0.26, 'cream', { faces: { top: 'keys' } }).pop();
    desk.box(-0.1, 0.78, -0.16, 0.56, 0.3, 0.24, 'cream').box(-0.1, 0.92, -0.06, 0.4, 0.008, 0.2, 'porcelain', { col: 0xf0ece0 });
    desk.box(0.45, 0.78, -0.05, 0.22, 0.012, 0.3, 'porcelain', { col: 0xece6d4 }).cyl(0.45, 0.78, 0.18, 0.04, 0.09, 8, 'porcelain', { col: 0xe0d8c8 });
    desk.pop();
    this.add(desk);
    // ---- Calder's lectern by the tank: a sloped control desk on a column, with its own scope
    const lec = new THREE.Group(); lec.position.set(-2.08, 0, 1.0); lec.rotation.y = -0.96; this.scene.add(lec);
    const lk = new Kit();
    lk.cyl(0, 0, 0, 0.34, 0.06, 10, 'gun').cyl(0, 0.06, 0, 0.13, 0.84, 8, 'navy').cbox(0, 0.86, -0.05, 0.86, 0.12, 0.5, 0.03, 'cream');
    lk.quad('decal', [-0.42, 0.98, 0.2], [0.42, 0.98, 0.2], [0.42, 1.14, -0.22], [-0.42, 1.14, -0.22], 'desk');
    lk.tri('cream', [-0.42, 0.98, 0.2], [-0.42, 1.14, -0.22], [-0.42, 0.98, -0.22]).tri('cream', [0.42, 0.98, 0.2], [0.42, 0.98, -0.22], [0.42, 1.14, -0.22]);
    lk.box(0, 0.98, -0.28, 0.86, 0.5, 0.12, 'gun').panel(0.2, 1.24, -0.219, 0.36, 0.3, 'scopeBezel').panel(-0.22, 1.24, -0.219, 0.36, 0.26, 'blinken');
    lk.tube([[0, 0.1, -0.1], [0, 0.04, -0.6], [0.4, 0.04, -1.1]], 0.035, 6, 'rubber');
    this.add(lk, 0, 0, 0, 0, lec);
    this.scopeMesh(lec, 0.2, 1.25, -0.212, 0.28, 0.2, 0);
    const lb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), glowMaterial(0x6aff7a, 2)); lb.position.set(-0.36, 1.5, -0.25); lec.add(lb); this.beacons.push({ m: lb, ph: 0.6 });
    // ---- field emitters, flanking the tank
    for (const sx of [-1, 1]) {
      const x = sx * 2.55, z = -1.45, k = new Kit();
      k.cbox(x, 0, z, 0.82, 0.92, 0.82, 0.08, 'navy', { dec: 'coilPlate' }).box(x, 0.92, z, 0.9, 0.05, 0.9, 'gun');
      for (let i = 0; i < 7; i++) k.lathe(x, 0.97 + i * 0.11, z, [[0.1, 0], [0.2, 0.02], [0.2, 0.05], [0.1, 0.08], [0.1, 0.11]], 12, 'porcelain');
      k.cyl(x, 1.74, z, 0.23, 0.06, 14, 'gun').cyl(x, 1.8, z, 0.2, 1.1, 18, 'copper', { caps: false }).cyl(x, 2.9, z, 0.23, 0.06, 14, 'gun');
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; k.box(x + Math.sin(a) * 0.24, 1.8, z + Math.cos(a) * 0.24, 0.03, 1.1, 0.03, 'oak'); }
      k.cyl(x, 2.96, z, 0.05, 0.12, 8, 'brass').torus(x, 3.12, z, 0.36, 0.11, 18, 6, 'brass').ball(x, 3.36, z, 0.08, 'brass');
      k.push().at(x, 0, z, sx * -0.6).panel(0, 1.25, 0.42, 0.42, 0.32, 'signHV').pop();
      this.add(k);
      const cor = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.13, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ab8ff).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      gbuf(cor.material as THREE.Material, 0);
      cor.position.set(x, 3.12, z); this.fxs.add(cor);
      this.coils.push({ top: new THREE.Vector3(x, 3.36, z), corona: cor });
    }
    // ---- the centrifuge, right of the tank
    const cx = 3.35, cz = 0.3, c = new Kit();
    c.cyl(cx, 0, cz, 0.5, 0.12, 18, 'gun').cyl(cx, 0.12, cz, 0.46, 0.66, 18, 'cream').cyl(cx, 0.78, cz, 0.48, 0.06, 18, 'gun');
    c.push().at(cx, 0, cz, -0.75).panel(0, 0.48, 0.47, 0.42, 0.22, 'consoleB').pop();
    c.lathe(cx, 0.84, cz, [[0.42, 0], [0.4, 0.12], [0.3, 0.2], [0.0, 0.24]], 16, 'gun');
    this.add(c);
    const rot = new Kit();
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; rot.push().at(0, 0, 0, a).box(0, -0.02, 0.17, 0.06, 0.04, 0.3, 'brass').cyl(0, -0.08, 0.3, 0.035, 0.16, 6, 'porcelain', { col: [0xff8a6a, 0x8affb0, 0x8ab8ff, 0xffe080][i] }).pop(); }
    rot.cyl(0, -0.06, 0, 0.07, 0.1, 8, 'gun');
    this.rotor = this.add(rot); this.rotor.position.set(cx, 1.13, cz);
    const cb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), glowMaterial(0xff4a2a, 2)); cb.position.set(cx + 0.3, 0.86, cz + 0.32); this.scene.add(cb); this.beacons.push({ m: cb, ph: 1.7 });
  }

  // ---------------------------------------------------------------------------------------------- shelves, lamps, clutter
  private dressing() {
    const k = new Kit(), Z = -4.95;
    // two steel shelf units with oak boards on the back right
    for (const ux of [2.35, 4.4]) {
      for (const sx of [-0.98, 0.98]) for (const sz of [-0.2, 0.2]) k.box(ux + sx, 0, Z + sz, 0.05, 2.75, 0.05, 'gun');
      for (const y of [0.32, 1.02, 1.72, 2.42]) k.box(ux, y, Z, 2.0, 0.045, 0.48, 'oak');
    }
    // three hanging work lamps
    for (const [x, z] of [[-3.6, 0.2], [3.5, 0.4], [0.2, -3.4]] as [number, number][]) {
      k.cable([x, 4.8, z], [x, 3.72, z], 0, 0.012, 'rubber');
      k.lathe(x, 3.48, z, [[0.36, 0], [0.34, 0.04], [0.24, 0.16], [0.08, 0.26], [0.04, 0.3]], 14, 'olive');
      k.lathe(x, 3.481, z, [[0.04, 0.29], [0.08, 0.25], [0.23, 0.15], [0.33, 0.03]], 14, 'cream');
    }
    // a lab bench with glassware on the right, a rolling chalkboard, a stool, a fire extinguisher, crates
    k.push().at(5.7, 0, -1.6, -Math.PI / 2);
    k.box(0, 0, 0, 2.0, 0.86, 0.72, 'cream').box(0, 0.86, 0, 2.08, 0.05, 0.8, 'gun', { col: 0x5a5a5a });
    k.lathe(-0.6, 0.91, 0.05, [[0.1, 0], [0.11, 0.06], [0.04, 0.2], [0.03, 0.3]], 10, 'porcelain', { col: 0xc8ffe8 });
    k.lathe(-0.2, 0.91, -0.05, [[0.07, 0], [0.07, 0.18], [0.03, 0.22], [0.03, 0.3]], 10, 'porcelain', { col: 0xffd8c0 });
    k.cyl(0.25, 0.91, 0.05, 0.03, 0.22, 6, 'porcelain', { col: 0xe8ffb0 }).cyl(0.33, 0.91, 0.05, 0.03, 0.2, 6, 'porcelain', { col: 0xffb0e0 }).cyl(0.41, 0.91, 0.05, 0.03, 0.24, 6, 'porcelain', { col: 0xb0d8ff });
    k.box(0.33, 0.91, 0.05, 0.3, 0.06, 0.08, 'oak');
    k.box(0.75, 0.91, -0.1, 0.3, 0.012, 0.36, 'porcelain', { col: 0xf0ece0 });
    k.pop();
    k.push().at(5.55, 0, 2.15, -2.2);
    k.panel(0, 1.5, 0.02, 1.4, 1.05, 'chalkB').box(0, 0.94, 0, 1.5, 0.06, 0.06, 'oak').box(0, 2.0, 0, 1.5, 0.06, 0.06, 'oak');
    for (const sx of [-0.75, 0.75]) { k.box(sx, 0.12, 0, 0.06, 1.98, 0.06, 'oak'); k.box(sx, 0.08, 0, 0.06, 0.06, 0.6, 'gun'); k.ball(sx, 0.04, 0.28, 0.04, 'rubber').ball(sx, 0.04, -0.28, 0.04, 'rubber'); }
    k.pop();
    k.cyl(-3.2, 0, 1.35, 0.2, 0.05, 8, 'gun').cyl(-3.2, 0.05, 1.35, 0.03, 0.55, 6, 'gun').cyl(-3.2, 0.6, 1.35, 0.2, 0.06, 10, 'oak');
    k.cyl(6.5, 0, -3.9, 0.11, 0.62, 10, 'red').lathe(6.5, 0.62, -3.9, [[0.11, 0], [0.06, 0.08], [0.03, 0.12]], 8, 'red').cyl(6.5, 0.72, -3.9, 0.025, 0.06, 6, 'gun');
    k.box(6.1, 0, 4.6, 0.6, 0.5, 0.5, 'oak', { dec: 'crate' }).box(6.15, 0.5, 4.55, 0.48, 0.4, 0.42, 'oak', { dec: 'crate' });
    k.push().at(6.78, 0, -2.2, -Math.PI / 2).panel(0, 2.3, 0, 0.5, 0.5, 'signRad').pop();
    k.push().at(-6.78, 0, 3.9, Math.PI / 2).panel(0, 1.7, 0, 0.42, 0.42, 'signBio').pop();
    // an air vent and a fuse box over the console bank
    k.push().at(0, 0, -5.18).panel(-0.2, 3.6, 0, 0.6, 0.4, 'vent').pop();
    this.add(k);
    // lamp bulbs (emitters)
    for (const [x, z] of [[-3.6, 0.2], [3.5, 0.4], [0.2, -3.4]] as [number, number][]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glowMaterial(0xffe0a8, 2.4)); b.position.set(x, 3.56, z); this.scene.add(b); }
  }

  // ---------------------------------------------------------------------------------------------- jars
  /** fill the shelves with the species in the list (null slots hold old preserved oddments) */
  setJars(list: (Species | null)[]) {
    for (const j of this.jars) if (j.mesh) { j.mesh.removeFromParent(); }
    for (const g of this.jarObjs) g.removeFromParent();
    this.jars = []; this.jarObjs = [];
    const k = new Kit(), glass = new Kit(), Z = -4.95 + 0.02;
    let n = 0;
    for (const ux of [2.35, 4.4]) for (const y of [0.365, 1.065, 1.765]) for (const dx of [-0.62, 0, 0.62]) {
      const sp = list[n] ?? null, x = ux + dx;
      const at = new THREE.Vector3(x, y + 0.27, Z);
      const lin = sp?.design.lineage;
      const fl = lin === 'arthropod' ? 0xd8b84a : lin === 'vertebrate' ? 0x8ad8b0 : lin === 'annelid' ? 0xd88a8a : lin === 'mollusc' ? 0xb8a0e0 : 0xb8c8a0;
      k.cyl(x, y + 0.045, Z, 0.19, 0.04, 14, 'brass').cyl(x, y + 0.6, Z, 0.185, 0.07, 14, 'brass').cyl(x, y + 0.67, Z, 0.12, 0.03, 10, 'gun');
      k.push().at(x, 0, Z).panel(0, y + 0.2, 0.18, 0.18, 0.07, 'labelJar').pop();
      glass.cyl(x, y + 0.085, Z, 0.17, 0.515, 14, 'glass', { col: fl, caps: false });
      const jar: Jar = { sp, at, mesh: null, bob: Math.random() * 10, r: 0.2 };
      if (!sp) {
        const ids = ['endotherm', 'ferment_gut', 'egg_clutch', 'tentacles', 'fat_stores', 'biolum'];
        const sym = symbolFor(ids[n % ids.length]);
        const m = new THREE.Mesh(sym.geo, symbolMaterial(sym.tex, regUniforms()));
        m.scale.setScalar(0.11); m.position.copy(at); m.castShadow = true; m.userData.sym = sym; this.scene.add(m); jar.mesh = m;
      }
      this.jars.push(jar);
      n++;
    }
    this.jarObjs.push(this.add(k));
    const gm = new THREE.ShaderMaterial({ uniforms: { uT: this.fluidU.uT, uTint: { value: new THREE.Color(0xd8fff0) } }, vertexShader: 'attribute vec3 color; varying vec3 vC; ' + FLUID_V.replace('void main(){', 'void main(){ vC = color;'), fragmentShader: GN_DECL + `varying vec3 vC; varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vec3 n = normalize(vN); vec3 v = normalize(vV); float fr = pow(1.0 - abs(dot(n, v)), 2.0); float a = 0.12 + fr * 0.4; gl_FragColor = vec4(mix(vC, vec3(1.0), fr * 0.6) * a * 0.9, a); gNormal = vec4(0.0); }`, transparent: true, depthWrite: false, premultipliedAlpha: true });
    const g = glass.build({ glass: gm }, false); g.traverse((o) => { o.renderOrder = 6; }); this.fxs.add(g); this.jarObjs.push(g);
    // the species models go in one per frame (each may need sculpting)
    this.jarQueue = this.jars.filter((j) => j.sp);
  }
  private jarQueue: Jar[] = [];
  private jarObjs: THREE.Object3D[] = [];
  private fillJar(j: Jar) {
    if (!j.sp) return;
    const { mesh } = makeInstance(j.sp.model);
    const g = j.sp.model.geo; if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox!, sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const s = 0.27 / Math.max(sz.x, sz.y, sz.z, 0.05);
    mesh.scale.setScalar(s); mesh.rotation.y = 0.9;
    mesh.position.copy(j.at).sub(c.clone().multiplyScalar(s).applyAxisAngle(Y, 0.9));
    mesh.frustumCulled = false;
    mesh.userData.base = mesh.position.clone();
    this.scene.add(mesh); j.mesh = mesh;
  }
  pickJar(ray: THREE.Ray): number {
    let best = -1, bd = Infinity;
    this.jars.forEach((j, i) => { if (!j.sp) return; const s = new THREE.Sphere(j.at, j.r + 0.06); const p = ray.intersectSphere(s, new THREE.Vector3()); if (p) { const d = p.distanceTo(ray.origin); if (d < bd) { bd = d; best = i; } } });
    return best;
  }

  // ---------------------------------------------------------------------------------------------- people
  private people() {
    registerAllTextures(); // before any rig: the clipboard model is built (and cached) on the first one
    const varga = createResearcher({ glasses: true, hair: 'bob', name: 'Dr. I. Varga', blouse: 0xc8a8a0, slacks: false });
    const hale = new Researcher(HALE_APP, worldMaterial({ noVis: true, noFog: true, noGrid: true }));
    (hale as unknown as { ggOverrides: unknown }).ggOverrides = { badge: { col: [150, 70, 52], name: 'Sgt. O. Hale' } };
    hale.setOutfit(researcherOutfit({ slacks: true, blouse: 0x7a8a6a }));
    hale.skin.castShadow = true;
    const calder = calderRig();
    const mk = (rig: Researcher, name: string, home: V3, workYaw: number, work: string, col: string): Sci => {
      rig.root.position.set(...home); rig.root.rotation.y = workYaw; this.scene.add(rig.root);
      return { rig, name, home: new THREE.Vector3(...home), workYaw, work, yaw: workYaw, mode: 'work', t: 2 + Math.random() * 4, act: work, actT: 0, actDur: 99, say: [], quip: 8 + Math.random() * 10, col };
    };
    this.sci.push(mk(calder, 'DR. CALDER', [-2.62, 0, 1.38], 2.18, 'type', '#ffcd6e'));
    this.sci.push(mk(varga, 'DR. VARGA', [2.3, 0, 1.3], -0.55, 'clipboard', '#9fd0ff'));
    this.sci.push(mk(hale, 'SGT. HALE', [-4.25, 0, -3.3], 0.1, 'type', '#b8f0b4'));
  }
  headPos(i: number, out = new THREE.Vector3()) {
    const r = this.sci[i].rig; const h = (r.bones as Record<string, THREE.Object3D> | undefined)?.head ?? (r as unknown as { j: Record<string, THREE.Object3D> }).j?.head;
    if (h) return h.getWorldPosition(out).add(new THREE.Vector3(0, 0.32, 0));
    return out.copy(this.sci[i].home).add(new THREE.Vector3(0, 2, 0));
  }
  /** a line from one of them (and the mouth moves) */
  speak(i: number, kind: keyof typeof LINES, force = false) {
    const s = this.sci[i]; if (!s) return;
    if (!force && s.quip > 0 && kind === 'idle') return;
    const pool = LINES[kind][i]; const text = pool[Math.floor(Math.random() * pool.length)];
    s.rig.say(Math.min(3.2, 0.8 + text.length * 0.05), kind === 'bad' ? 'think' : 'smile');
    s.quip = 9 + Math.random() * 12;
    this.onSay?.(i, text);
  }
  /** everyone reacts: a startle when the arc goes, then a point, a nod, a word */
  react(kind: 'edit' | 'splice' | 'plan' | 'load' | 'bad' | 'save') {
    const talker = kind === 'load' ? 1 : Math.floor(Math.random() * 3);
    this.sci.forEach((s, i) => {
      s.mode = kind === 'save' ? 'cheer' : 'react'; s.t = kind === 'save' ? 3 : 2.6 + i * 0.3; s.actT = 0;
      const big = kind === 'plan' || kind === 'splice' || (kind === 'edit' && Math.random() < 0.4);
      s.act = kind === 'bad' ? '' : kind === 'save' ? '' : big && i !== 0 ? 'shocked' : 'flinch'; s.actDur = s.act === 'shocked' ? 1.2 : 0.35;
      const g: ResearcherGesture = kind === 'bad' ? 'shrug' : kind === 'save' ? 'nod' : i === 0 ? 'point' : i === 1 ? 'clipboard' : 'nod';
      setTimeout(() => { if (s.mode === 'react' || s.mode === 'cheer') s.rig.gesture(g, g === 'point' ? { at: this.spec ? this.spec.centreOf(1) : TANK.c } : {}); }, 380 + i * 160);
      if (kind === 'save') s.rig.playEmote(i === 1 ? 'clap' : 'cheer');
    });
    setTimeout(() => this.speak(talker, kind, true), kind === 'bad' ? 100 : 700);
  }
  private tickPeople(dt: number) {
    const C = TANK.c;
    this.sci.forEach((s, i) => {
      s.t -= dt; s.quip -= dt; s.actT += dt;
      if (s.t <= 0) {
        if (s.mode === 'work') { s.mode = 'watch'; s.t = 3 + Math.random() * 3; s.act = ''; const g: ResearcherGesture[] = ['think', 'clipboard', 'nod', 'point']; const gg = g[Math.floor(Math.random() * g.length)]; s.rig.gesture(gg, gg === 'point' ? { at: C } : {}); if (Math.random() < 0.5) this.speak(i, 'idle'); }
        else { s.mode = 'work'; s.t = 5 + Math.random() * 6; s.act = s.work === 'clipboard' ? '' : s.work; s.actT = 0; s.actDur = 99; if (s.work === 'clipboard') s.rig.gesture('clipboard', { dur: s.t }); }
      }
      const facing = s.mode === 'work' ? s.workYaw : Math.atan2(C.x - s.home.x, C.z - s.home.z);
      s.yaw = dampA(s.yaw, facing, 3.5, dt);
      s.rig.root.rotation.y = s.yaw;
      s.rig.lookAt(s.mode === 'work' ? null : this.spec ? this.spec.mesh.getWorldPosition(new THREE.Vector3()).setY(C.y) : C);
      const act = s.act && s.actT < s.actDur ? s.act : '';
      if (act === '' && (s.mode === 'react') && s.actT > s.actDur) s.act = '';
      const inp: Partial<AnimInput> = { speed: 0, stance: 'stand', full: '', action: act, actionT: s.actT, actionDur: s.actDur === 99 ? 1.6 : s.actDur, fidget: s.mode !== 'react', lookYaw: 0 };
      s.rig.update(dt, inp);
    });
  }

  // ---------------------------------------------------------------------------------------------- specimen
  /** put a design in the tank: instantly, or dissolving the old one out and the new one in */
  setSpecimen(d: Design, dramatic: boolean, instant = false) {
    if (instant || !this.spec) { this.swap(d); this.inT = instant ? 0.0001 : 0.8; return; }
    this.pending = { d: JSON.parse(JSON.stringify(d)), dramatic };
    this.pendT = dramatic ? 0.32 : 0.12;
    if (!this.old) { this.old = this.spec; this.oldT = 0; this.spec = null; }
  }
  private swap(d: Design) {
    const sp = new Specimen(d);
    this.scene.add(sp.mesh);
    sp.fx.dissolve.value = 1;
    this.spec = sp;
    this.inT = 0.8;
    sp.pose(0.016, this.specYaw, TANK.c, this.t);
    sp.mesh.computeBoundingSphere();
  }
  /** the big effect: field emitters arc to the tank, the fluid flashes, bubbles surge, the centrifuge spins up */
  edit(strength = 1) {
    this.arcT = 0.9 + strength * 0.5; this.arcK = strength;
    this.fluidU.uFlash.value = Math.min(0.85, 0.45 + strength * 0.25);
    this.surge = 1.2 + strength;
    this.rotGoal = 9; setTimeout(() => { this.rotGoal = 0.6; }, 2600);
    this.wild = 1;
    this.shake = 0.06 * strength;
    this.child.cast(TANK.c);
    sfx('zap', 1, 0.7); sfx('pulse', 1.4, 0.35 * strength);
  }
  hover(reg: number, mask: number, col: number) {
    if (!this.spec) return;
    this.spec.U.uMask.value = mask; (this.spec.U.uCol.value as THREE.Color).set(col);
    this.spec.fx.flag.value = 1 + (reg ? F_HOVER : 0);
    this.hold = reg ? 1.5 : this.hold;
  }
  pickRegion(mx: number, my: number): { reg: number; at: THREE.Vector3 } | null {
    if (!this.spec || this.inT > 0.4) return null;
    this.ray.setFromCamera(new THREE.Vector2((mx / innerWidth) * 2 - 1, -(my / innerHeight) * 2 + 1), this.cam);
    return this.spec.pick(this.ray.ray);
  }
  rayAt(mx: number, my: number) { this.ray.setFromCamera(new THREE.Vector2((mx / innerWidth) * 2 - 1, -(my / innerHeight) * 2 + 1), this.cam); return this.ray.ray; }
  /** turn the specimen to show a region side-on */
  present(reg: number) {
    if (!this.spec) return;
    const camA = Math.atan2(this.cam.position.x - TANK.c.x, this.cam.position.z - TANK.c.z);
    // most parts read best in profile; faces read best three-quarter
    const want = reg === 3 || reg === 4 || reg === 5 || reg === 6 || reg === 7 ? camA - 0.6 : reg === 10 ? camA + Math.PI * 0.62 : camA - Math.PI / 2;
    this.presentYaw = want; this.hold = 4;
  }
  private presentYaw: number | null = null;
  /** world point a projected label should sit at */
  project(p: THREE.Vector3): [number, number, boolean] { const v = p.clone().project(this.cam); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, v.z < 1]; }

  // ---------------------------------------------------------------------------------------------- frame
  update(dt: number) {
    this.t += dt; const t = this.t;
    // camera
    this.yaw = damp(this.yaw, this.yawGoal, 6, dt); this.pitch = damp(this.pitch, this.pitchGoal, 6, dt); this.dist = damp(this.dist, this.distGoal, 5, dt);
    this.target.lerp(this.targetGoal, 1 - Math.exp(-4 * dt));
    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0; this.shake = Math.max(0, this.shake - dt * 0.12);
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist + sh, this.target.y + Math.sin(this.pitch) * this.dist + sh, this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    this.cam.lookAt(this.target); this.cam.updateMatrixWorld();
    // specimen: dissolve out, swap, dissolve in; float and turn
    if (this.old) { this.oldT += dt; this.old.fx.dissolve.value = Math.min(1, this.oldT / 0.28); this.old.fx.flash.value = 0.8; this.old.pose(dt, this.specYaw, TANK.c, t); }
    if (this.pending) {
      this.pendT -= dt;
      if (this.pendT <= 0) { const p = this.pending; this.pending = null; if (this.old) { this.old.dispose(); this.old = null; } this.swap(p.d); }
    }
    if (this.presentYaw !== null) { this.specYaw = dampA(this.specYaw, this.presentYaw, 2.2, dt); if (Math.abs(((this.presentYaw - this.specYaw + Math.PI * 3) % TAU) - Math.PI) < 0.02) this.presentYaw = null; }
    else if (this.hold > 0) this.hold -= dt; else this.specYaw += dt * this.turn;
    if (this.spec) {
      const s = this.spec;
      if (this.inT > 0) { this.inT = Math.max(0, this.inT - dt); s.fx.dissolve.value = Math.max(0, this.inT / 0.8 - 0.05); s.fx.flash.value = Math.max(s.fx.flash.value, this.inT * 1.1); s.fx.flashCol.value.set(0x7affe0); }
      s.fx.flash.value = Math.max(0, s.fx.flash.value - dt * 2.2);
      s.U.uT.value = t;
      const bob = new THREE.Vector3(0, Math.sin(t * 0.8) * 0.045, 0).add(TANK.c);
      s.pose(dt, this.specYaw, bob, t);
    }
    // fluid, bubbles, glow
    this.fluidU.uT.value = t;
    this.fluidU.uFlash.value = Math.max(0, this.fluidU.uFlash.value - dt * 1.3);
    this.surface.position.y = TANK.fluidTop + Math.sin(t * 1.3) * 0.01;
    this.surge = Math.max(0, this.surge - dt);
    const P = this.bubP, L = this.bubL, V = this.bubV, n = L.length, sp = 1 + this.surge * 1.6;
    for (let i = 0; i < n; i++) {
      V[i * 2 + 1] += dt;
      P[i * 3 + 1] += V[i * 2] * dt * sp * (1 + (P[i * 3 + 1] - TANK.y0) * 0.25);
      P[i * 3] += Math.sin(V[i * 2 + 1] * 3 + i) * dt * 0.06; P[i * 3 + 2] += Math.cos(V[i * 2 + 1] * 2.7 + i) * dt * 0.06;
      if (P[i * 3 + 1] > TANK.fluidTop - 0.02) { L[i] -= dt * 8; if (L[i] <= 0) this.respawn(i); }
    }
    (this.bub.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.bub.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    const fl = this.fluidU.uFlash.value;
    this.tankLight.intensity = 20 * (1 + Math.sin(t * 2.1) * 0.06 + fl * 1.8);
    this.ringMat.color.setRGB(0.42, 1.0, 0.85).multiplyScalar(1.6 + Math.sin(t * 2.1) * 0.2 + fl * 2.5);
    // arcs from the field emitters
    this.arcT = Math.max(0, this.arcT - dt);
    this.zapT -= dt;
    let arcI = 0;
    for (const c of this.coils) { const m = c.corona.material as THREE.MeshBasicMaterial; m.opacity = damp(m.opacity, this.arcT > 0 ? 0.35 + Math.random() * 0.3 : 0.04 + Math.sin(t * 3 + c.top.x) * 0.02, 10, dt); }
    if (this.arcT > 0 && this.zapT <= 0) {
      this.zapT = 0.045;
      for (const c of this.coils) {
        const to = Math.random() < 0.55 ? TANK.electrode.clone() : new THREE.Vector3(Math.sign(c.top.x) * TANK.r * 0.95, TANK.y0 + 0.6 + Math.random() * 2, -0.3 + Math.random() * 0.4);
        this.fx.arc(c.top, to, 0.1 + Math.random() * 0.08, Math.random() < 0.7 ? 0xb8d0ff : 0xe8b8ff, 0.5);
        if (Math.random() < 0.5) this.fx.arc(c.top, to, 0.08, 0xffffff, 0.35);
        if (Math.random() < 0.25) this.fx.burst(to.x, to.y, to.z, 3, 0xb8d0ff, { glow: true, speed: 1.4, up: 0.6, size: 2, life: 0.35, grav: 1 });
        arcI += 1;
      }
      if (Math.random() < 0.3) sfx('zap', 1.2 + Math.random() * 0.4, 0.22 * this.arcK);
      if (Math.random() < 0.3) { const h = this.child.headPos(); this.fx.arc(h, TANK.c.clone().add(new THREE.Vector3(-0.6, 0, 0.7)), 0.12, this.child.lookData.glow, 0.25); }
    }
    this.arcLight.intensity = damp(this.arcLight.intensity, this.arcT > 0 ? 18 + Math.random() * 30 : 0, 18, dt) + arcI * 4;
    // machinery
    this.wild = Math.max(0, this.wild - dt * 0.4);
    for (const s of this.scopes) { s.uniforms.uT.value = t; s.uniforms.uWild.value = this.wild + (this.arcT > 0 ? 0.5 : 0); }
    for (const r of this.reels) r.m.rotation.z -= dt * r.w * (1 + this.wild * 3);
    this.rotW = damp(this.rotW, this.rotGoal, 1.2, dt);
    if (this.rotor) { this.rotor.rotation.y += dt * this.rotW; this.rotor.position.x = 3.35 + Math.sin(t * 40) * 0.002 * this.rotW / 9; }
    for (const b of this.beacons) b.m.visible = Math.sin(t * 4 + b.ph) > -0.1 || this.wild > 0.3;
    for (const l of this.lamps) l.light.intensity = l.base * (1 + Math.sin(t * 13 + l.ph) * 0.01 + (Math.random() < 0.004 ? -0.4 : 0)) + this.arcLight.intensity * 0.05;
    // jars
    if (this.jarQueue.length) { const j = this.jarQueue.shift()!; try { this.fillJar(j); } catch (e) { console.error('jar', e); } }
    for (const j of this.jars) if (j.mesh && j.sp && j.mesh.userData.base) { j.mesh.position.y = (j.mesh.userData.base as THREE.Vector3).y + Math.sin(t * 0.9 + j.bob) * 0.012; j.mesh.rotation.y = 0.9 + Math.sin(t * 0.3 + j.bob) * 0.4; }
    if (this.hoverJar >= 0 && this.jars[this.hoverJar]) { this.jarGlow.visible = true; this.jarGlow.position.copy(this.jars[this.hoverJar].at).setY(this.jars[this.hoverJar].at.y + 0.42); this.jarGlow.scale.setScalar(1 + Math.sin(t * 6) * 0.05); }
    else this.jarGlow.visible = false;
    // people
    this.tickPeople(dt);
    this.child.look.copy(this.spec ? TANK.c : TANK.c);
    this.child.root.position.y = 0.7 + Math.sin(t * 0.6) * 0.04;
    this.child.root.rotation.y = Math.atan2(TANK.c.x - this.child.root.position.x, TANK.c.z - this.child.root.position.z) * 0.6;
    this.child.update(dt, this.cam);
    this.fx.update(dt, innerHeight, this.cam.fov);
  }
  dispose() {
    this.spec?.dispose(); this.old?.dispose();
    for (const j of this.jars) { const sym = j.mesh?.userData.sym as { geo: THREE.BufferGeometry; tex: THREE.Texture } | undefined; if (sym) { sym.geo.dispose(); sym.tex.dispose(); ((j.mesh as THREE.Mesh).material as THREE.Material).dispose(); } }
    // Unit 07's painted textures and rock geometry are its own
    this.child.root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry?.dispose(); for (const mt of Array.isArray(m.material) ? m.material : [m.material]) { (mt as THREE.MeshLambertMaterial).map?.dispose(); mt.dispose(); } });
    for (const s of this.sci) { try { (s.rig as unknown as { dispose?: () => void }).dispose?.(); } catch { /* shared resources */ } }
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name.startsWith('lab:')) m.geometry.dispose(); });
  }
}

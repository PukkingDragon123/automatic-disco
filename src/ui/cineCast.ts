// The cast and props of the cutscenes. The U.S.P.C. recovery team (Dr. Calder, Lt. Hollis the pilot and radio
// man, Dr. Brandt the geologist with the Geiger counter) as LIMBOPHOBIA researcher rigs wrapped in a small actor
// that walks, turns, kneels, gestures, talks and dies; their lander ("Recovery One", a 1950s retro-rocket on four
// legs with a drop-down hatch); hand props (Geiger counter, flashlight with a real spotlight, radio handset); and
// blood decals for the beast's attack.
import * as THREE from 'three';
import { Researcher, researcherOutfit, researcherAppearance, createResearcher, type ResearcherGesture } from '../limbo/entities/researcher';
import type { Appearance } from '../limbo/entities/humanRig';
import { worldMaterial } from '../limbo/gfx/materials';
import { registerAllTextures } from '../limbo/gfx/textures/index';
import { gbuf, GN_DECL } from '../gfx/gbuf';
import { Pix, metal, rivet, text, textW, OL, GM, CR, RD, BR, BK, tex, mat, glowMat, roundelTex, hazardTex } from './cineKit';

const V3 = THREE.Vector3;
let texReady = false;
function ready() { if (!texReady) { registerAllTextures(); texReady = true; } }
const wm = () => worldMaterial({ noVis: true, noFog: true, noGrid: true });

// ------------------------------------------------------------------ the team
/** LIMBOPHOBIA's researcher is a woman; Calder is a man here: same rig, outfit, gestures and face system. */
export const USE_ORIGINAL_LOOK = false;
const CALDER_APP = {
  skin: 0xd9a47c, hair: 0x3a2618, hairStyle: 'short', face: 2, build: 'average', height: 1.03, bodyShape: 0.1, eyeColor: 0x4a6a8a,
  facialHair: 'stubble', freckles: 0.04, scars: 1, age: 0.38, jaw: 2, eyeShape: 1, brows: 1, nose: 2, mouth: 1, ears: 1,
} as unknown as Appearance;
export function calderRig(): Researcher {
  ready();
  if (USE_ORIGINAL_LOOK) return createResearcher({ glasses: true, name: 'Dr. Calder' });
  const r = new Researcher(CALDER_APP, wm());
  (r as any).ggOverrides = { badge: { col: [52, 104, 150], name: 'Dr. Calder' }, glasses: { kind: 'rect', col: [58, 42, 38], thick: 1 } };
  r.setOutfit(researcherOutfit({ glasses: true, slacks: true, blouse: 0x9ab0c0 }));
  r.skin.castShadow = true;
  r.setExpression('smile');
  return r;
}
const HOLLIS_APP = {
  skin: 0x8d5634, hair: 0x1c1612, hairStyle: 'buzz', face: 1, build: 'broad', height: 1.05, bodyShape: 0, eyeColor: 0x3a2a1a,
  facialHair: 'moustache', freckles: 0, scars: 0, age: 0.3, jaw: 3, eyeShape: 0, brows: 2, nose: 3, mouth: 2, ears: 2,
} as unknown as Appearance;
/** Lt. Ray Hollis: pilot, radio man. Olive flight suit, helmet, the radio pack on his back. */
export function hollisRig(): Researcher {
  ready();
  const r = new Researcher(HOLLIS_APP, wm());
  (r as any).ggOverrides = { badge: { col: [90, 110, 60], name: 'Lt. Hollis' } };
  r.setOutfit({
    torso: { tex: 'c_jumpsuit', color: 0x5a6a3a, sleeve: 'long' }, legs: { tex: 'c_slacks', color: 0x56663a }, legsKind: 'pants',
    feet: { tex: 'c_shoes_boot', color: 0x2a2018 }, hands: { tex: 'c_gloves', color: 0x3a2a1c },
    head: { tex: 'c_hardhat', color: 0x5a6a44, hat: 'helmet' }, back: { tex: 'c_backpack', color: 0x4a5236, size: 1.15 },
  });
  r.skin.castShadow = true;
  r.setExpression('neutral');
  return r;
}
/** Dr. Ada Brandt: geologist, the Geiger counter. Field jacket, slacks, boots, her hair up. */
export function brandtRig(): Researcher {
  ready();
  const r = new Researcher(researcherAppearance({ hair: 'bun', hairColor: 0x9c7a46, skin: 0xe8b98f, eyeColor: 0x4a6a3a }), wm());
  (r as any).ggOverrides = { badge: { col: [150, 110, 52], name: 'Dr. Brandt' }, glasses: { kind: 'round', col: [40, 30, 26], thick: 1 } };
  r.setOutfit({
    torso: { tex: 'c_shirt_button', color: 0xc8b48a, sleeve: 'long' }, torsoOuter: { tex: 'c_jacket', color: 0x6a6a44, sleeve: 'long' },
    legs: { tex: 'c_slacks', color: 0x4a4636 }, legsKind: 'pants', feet: { tex: 'c_shoes_boot', color: 0x2e241a },
    eyes: { tex: 'c_glasses', color: 0x2a221c, item: 'glasses' }, head: { tex: 'c_hat_cap', color: 0x6a6448, hat: 'cap' },
  });
  r.skin.castShadow = true;
  r.setExpression('neutral');
  return r;
}

// ------------------------------------------------------------------ an actor
export type Ground = (x: number, z: number) => number;
export class Actor {
  x = 0; z = 0; y = 0; yaw = 0;
  speed = 0; private want = 0;
  private goal: { x: number; z: number; v: number } | null = null;
  full = ''; action = ''; panic = 0; light = false;
  look: THREE.Vector3 | null = null;
  dead = false; visible = true;
  private yawGoal: number | null = null;
  constructor(readonly rig: Researcher, readonly ground: Ground, parent: THREE.Object3D) {
    parent.add(rig.root);
    rig.ragWorld = { ground: (px: number, pz: number) => ground(px, pz) } as any;
  }
  place(x: number, z: number, yaw = this.yaw) { this.x = x; this.z = z; this.y = this.ground(x, z); this.yaw = yaw; this.goal = null; this.speed = 0; this.want = 0; this.sync(); return this; }
  /** walk (or run: v > 2.5) to x, z */
  walkTo(x: number, z: number, v = 1.35) { this.goal = { x, z, v }; this.full = ''; }
  get moving() { return !!this.goal; }
  /** snap to the walk's end */
  arrive() { if (this.goal) { this.x = this.goal.x; this.z = this.goal.z; this.goal = null; } this.speed = 0; this.want = 0; this.y = this.ground(this.x, this.z); this.sync(); }
  face(x: number, z: number) { this.yawGoal = Math.atan2(x - this.x, z - this.z); }
  faceNow(x: number, z: number) { this.yaw = Math.atan2(x - this.x, z - this.z); this.yawGoal = null; }
  gesture(g: ResearcherGesture, o: { hold?: boolean; at?: THREE.Vector3; dur?: number } = {}) { if (!this.dead) this.rig.gesture(g, o); }
  talk(sec: number, expr?: string) { if (!this.dead) this.rig.say(sec, expr); }
  expr(e: string, hold = 2) { this.rig.setExpression(e, hold); }
  hold(item: THREE.Object3D | null, side: 'R' | 'L' = 'R', grip: 'perp' | 'along' | 'auto' | 'raw' = 'along') { this.rig.hold(side, item, grip); }
  die(from: THREE.Vector3, k = 5) {
    if (this.dead) return;
    this.dead = true; this.goal = null;
    const imp = new V3(this.x - from.x, 0.6, this.z - from.z).normalize().multiplyScalar(k);
    this.rig.startRagdoll(new V3(imp.x * 0.6, 1.5, imp.z * 0.6), imp, 'torso_u');
    this.rig.setExpression('pain', 99);
  }
  private sync() {
    const r = this.rig;
    r.root.position.set(this.x, this.y, this.z); r.root.rotation.y = this.yaw; r.root.visible = this.visible;
  }
  update(dt: number) {
    const r = this.rig;
    if (this.dead) { r.update(dt, { speed: 0, ground: (r.ragWorld as any).ground } as any); return; }
    this.want = 0;
    if (this.goal) {
      const dx = this.goal.x - this.x, dz = this.goal.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.12) { this.goal = null; }
      else {
        this.want = this.goal.v;
        const ty = Math.atan2(dx, dz); let dy = ty - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 8);
        const s = Math.min(d, this.speed * dt * Math.max(0.2, Math.cos(dy)));
        this.x += (dx / d) * s; this.z += (dz / d) * s;
      }
    } else if (this.yawGoal !== null) {
      let dy = this.yawGoal - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 5); if (Math.abs(dy) < 0.01) this.yawGoal = null;
    }
    this.speed += (this.want - this.speed) * Math.min(1, dt * 5);
    this.y += (this.ground(this.x, this.z) - this.y) * Math.min(1, dt * 12);
    this.sync();
    r.lookAt(this.look);
    r.update(dt, {
      speed: this.speed, stance: 'stand', full: this.full || '', action: this.action || '', panic: this.panic, fidget: this.speed < 0.1 && !this.action,
      holdingLight: this.light, wx: this.x, wy: this.y, wz: this.z, wyaw: this.yaw, ground: this.ground,
    } as any);
  }
  dispose() { this.rig.root.removeFromParent(); }
}

// ------------------------------------------------------------------ hand props (handle toward -x, business end +x)
export function geiger(): THREE.Group {
  const g = new THREE.Group();
  const body = mat({ color: 0xc8b890, map: null }), dark = mat({ color: 0x2a2620 }), steel = mat({ color: 0x9aa2a8, phong: true });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.08), body); b.position.set(0.02, 0.0, 0); g.add(b);
  const dial = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.005, 0.05), glowMat(0xd8f0a0)); dial.position.set(0.03, 0.047, 0); g.add(dial);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), dark); h.position.set(-0.02, 0.07, 0); g.add(h);
  const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), steel); probe.rotation.z = Math.PI / 2; probe.position.set(0.18, -0.02, 0); g.add(probe);
  return g;
}
export function flashlight(): { g: THREE.Group; light: THREE.SpotLight } {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), mat({ color: 0x3a3e44, phong: true })); body.rotation.z = Math.PI / 2; g.add(body);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.024, 0.05, 8), mat({ color: 0x8a9096, phong: true })); head.rotation.z = Math.PI / 2; head.position.x = 0.12; g.add(head);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 8), glowMat(0xfff4d0)); lens.rotation.y = Math.PI / 2; lens.position.x = 0.146; g.add(lens);
  const light = new THREE.SpotLight(0xfff0d0, 14, 18, 0.42, 0.5, 1.4);
  light.position.set(0.15, 0, 0); light.target.position.set(3, -0.4, 0); g.add(light, light.target);
  return { g, light };
}
export function handset(): THREE.Group {
  const g = new THREE.Group();
  const m = mat({ color: 0x2a2e24 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), m); g.add(b);
  const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.06), m); ear.position.set(0.08, 0.02, 0); g.add(ear);
  const mouth = ear.clone(); mouth.position.x = -0.08; g.add(mouth);
  return g;
}

// ------------------------------------------------------------------ the lander
function hullTex(): THREE.Texture {
  const W = 96, H = 48, p = new Pix(W, H);
  metal(p, 0, 0, W, H, OL, { seed: 21, tile: true, grime: 0.7, scratches: 0.8 });
  for (const x of [0, 24, 48, 72]) p.vl(x, 0, H - 1, OL[1]);
  for (const y of [0, 16, 32]) p.hl(0, W - 1, y, OL[1]);
  for (let x = 4; x < W; x += 8) { rivet(p, x, 2, GM); rivet(p, x, H - 3, GM); }
  for (let x = 0; x < W; x++) for (let y = 20; y < 27; y++) p.set(x, y, y === 20 || y === 26 ? CR[1] : CR[3]);
  text(p, 'U.S.P.C.', 6, 21, 0x1c2e6a); text(p, 'RECOVERY 1', 54, 21, RD[3]);
  const t0 = textW('07'); void t0;
  return tex(p, true);
}
function noseTex(): THREE.Texture {
  const W = 64, H = 32, p = new Pix(W, H);
  metal(p, 0, 0, W, H, CR, { seed: 23, tile: true, grime: 0.5, scratches: 0.6 });
  for (let x = 0; x < W; x++) for (let y = 0; y < 6; y++) p.set(x, y, RD[4 + (y < 2 ? 1 : 0)]);
  for (let x = 0; x < W; x += 16) p.vl(x, 0, H - 1, CR[0]);
  return tex(p, true);
}
export interface Lander { root: THREE.Group; hatch: THREE.Object3D; flame: THREE.Mesh; flameLight: THREE.PointLight; setFlame(k: number, t: number): void; setHatch(u: number): void; hatchPos(out?: THREE.Vector3): THREE.Vector3 }
/** "Recovery One": hull, nose cone, four legs and pads, fins, engine bell, a hatch that drops into a ramp */
export function makeLander(): Lander {
  const root = new THREE.Group();
  const hull = mat({ map: hullTex() }), nose = mat({ map: noseTex() }), steel = mat({ color: 0x6a7076, phong: true, shininess: 30 }), dark = mat({ color: 0x26282a });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 2.6, 12, 1, true), hull); body.position.y = 2.3; body.castShadow = true; root.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 12), steel); cap.position.y = 1.0; root.add(cap);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 1.0, 2.0, 12), nose); cone.position.y = 4.6; cone.castShadow = true; root.add(cone);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), steel); tip.position.y = 5.85; root.add(tip);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4), steel); ant.position.set(0.5, 4.8, 0.3); ant.rotation.z = -0.3; root.add(ant);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), glowMat(0xff3a2a)); beacon.position.set(0.68, 5.35, 0.3); root.add(beacon);
  // portholes
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 4, 12), mat({ color: 0xb08a40, phong: true }));
    ring.position.set(Math.sin(a) * 1.03, 3.0, Math.cos(a) * 1.03); ring.lookAt(ring.position.clone().multiplyScalar(2).setY(3.0)); root.add(ring);
    const gl = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), glowMat(0x9ad8ff)); gl.position.copy(ring.position).multiplyScalar(0.995); gl.lookAt(ring.position.clone().multiplyScalar(2).setY(3.0)); root.add(gl);
  }
  // roundel
  const rd = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat({ map: roundelTex(), side: THREE.DoubleSide }));
  (rd.material as THREE.MeshLambertMaterial).alphaTest = 0.5; (rd.material as THREE.MeshLambertMaterial).transparent = false;
  const ra = Math.PI * 1.2; rd.position.set(Math.sin(ra) * 1.09, 2.2, Math.cos(ra) * 1.09); rd.lookAt(rd.position.clone().multiplyScalar(2).setY(2.2)); root.add(rd);
  // legs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const top = new V3(Math.sin(a) * 1.0, 1.6, Math.cos(a) * 1.0), foot = new V3(Math.sin(a) * 2.3, 0.1, Math.cos(a) * 2.3);
    const L = top.distanceTo(foot);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, L, 6), steel);
    leg.position.copy(top).add(foot).multiplyScalar(0.5); leg.quaternion.setFromUnitVectors(new V3(0, 1, 0), foot.clone().sub(top).normalize()); leg.castShadow = true; root.add(leg);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), steel);
    const b0 = new V3(Math.sin(a) * 1.15, 0.9, Math.cos(a) * 1.15), b1 = foot.clone().lerp(top, 0.35);
    brace.position.copy(b0).add(b1).multiplyScalar(0.5); brace.quaternion.setFromUnitVectors(new V3(0, 1, 0), b1.clone().sub(b0).normalize()); root.add(brace);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.1, 8), steel); pad.position.copy(foot); pad.castShadow = true; root.add(pad);
    // fins between the legs
    const fa = a + Math.PI / 4;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.7), mat({ map: hazardTex() })); fin.position.set(Math.sin(fa) * 1.25, 1.5, Math.cos(fa) * 1.25); fin.rotation.y = fa; root.add(fin);
  }
  // engine bell and flame
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.65, 0.7, 10, 1, true), dark); bell.position.y = 0.6; (bell.material as THREE.Material).side = THREE.DoubleSide; root.add(bell);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 10, 1, true), glowMat(0xffa040, { additive: true, opacity: 0.9 }));
  flame.rotation.x = Math.PI; flame.position.y = -0.9; flame.visible = false; root.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 8, 1, true), glowMat(0xfff0c0, { additive: true }));
  core.position.y = 0.3; flame.add(core);
  const flameLight = new THREE.PointLight(0xff9a40, 0, 16, 1.5); flameLight.position.y = -0.6; root.add(flameLight);
  // hatch: hinged at its bottom edge, drops outward into a ramp
  const hinge = new THREE.Group(); hinge.position.set(0, 1.15, 1.13); root.add(hinge);
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.08), mat({ map: hullTex() })); hatch.position.y = 0.75; hinge.add(hatch);
  for (let i = 0; i < 4; i++) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.05), steel); rung.position.set(0, 0.25 + i * 0.35, 0.06); hinge.add(rung); }
  const dark2 = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.45), glowMat(0x1a1408)); dark2.position.set(0, 1.9, 1.06); root.add(dark2);
  const inner = new THREE.PointLight(0xffd8a0, 0, 4, 2); inner.position.set(0, 1.9, 0.6); root.add(inner);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  flame.castShadow = false; core.castShadow = false;
  return {
    root, hatch: hinge, flame, flameLight,
    setFlame(k, t) {
      flame.visible = k > 0.02;
      const f = 0.85 + Math.sin(t * 41) * 0.08 + Math.sin(t * 67) * 0.07;
      flame.scale.set(k * f, k * (0.9 + Math.sin(t * 29) * 0.15), k * f);
      flameLight.intensity = k * 30 * f;
    },
    setHatch(u) { hinge.rotation.x = u * 1.42; inner.intensity = u * 6; },
    hatchPos(out = new V3()) { return root.localToWorld(out.set(0, 0.1, 2.4)); },
  };
}

// ------------------------------------------------------------------ blood
let bloodT: THREE.Texture | null = null;
function bloodTex() {
  if (bloodT) return bloodT;
  const S = 32, p = new Pix(S, S), c = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = Math.atan2(y - c, x - c), d = Math.hypot(x - c, y - c);
    const r = 9 + Math.sin(a * 5 + 1) * 2.5 + Math.sin(a * 11) * 1.5 + Math.sin(a * 3 + 2) * 2;
    if (d < r) p.set(x, y, d > r - 1.5 ? 0x4a0a08 : (x * 7 + y * 3) % 11 === 0 ? 0xa82a1e : 0x6e120c);
  }
  for (const [x, y, r] of [[4, 6, 1.6], [27, 9, 1.4], [25, 27, 2], [6, 26, 1.2], [29, 18, 1]]) p.disc(x, y, r, 0x5e100a);
  bloodT = tex(p);
  return bloodT;
}
/** a flat pixel blood pool on the ground (grows from small to full with grow(u)) */
export function bloodPool(x: number, y: number, z: number, r: number) {
  const m = new THREE.MeshLambertMaterial({ map: bloodTex(), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  gbuf(m, 0);
  const me = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), m);
  me.rotation.x = -Math.PI / 2; me.rotation.z = Math.random() * Math.PI * 2; me.position.set(x, y + 0.03, z); me.receiveShadow = true;
  return { mesh: me, grow(u: number) { me.scale.setScalar(Math.max(0.05, u)); } };
}
export { BR, BK, GM, CR, RD, OL };

// ------------------------------------------------------------------ a sky for low cutscene cameras
export interface Sky { mesh: THREE.Mesh; set(top: number, hor: number, night: number, sunDir: THREE.Vector3): void }
/** a dome that follows the camera: a banded gradient, stars at night, a sun glow. Writes no outline. */
export function makeSky(): Sky {
  const U = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uNight: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) } };
  const m = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: GN_DECL + `
uniform vec3 uTop, uHor, uSun; uniform float uNight; varying vec3 vDir;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  vec3 col = mix(uHor, uTop, smoothstep(-0.03, 0.6, y));
  col = mix(col, uHor * 0.55, smoothstep(0.0, -0.25, y));
  col = floor(col * 28.0 + 0.5) / 28.0;
  vec3 q = floor(d * 240.0);
  float st = step(0.9972, h(q)) * uNight * smoothstep(0.02, 0.25, y);
  col += vec3(0.9, 0.92, 1.0) * st * (0.5 + 0.5 * h(q + 3.0));
  float sd = max(0.0, dot(d, normalize(uSun)));
  col += vec3(1.0, 0.86, 0.62) * (step(0.9985, sd) * 1.6 + pow(sd, 10.0) * 0.22) * (1.0 - uNight);
  col += vec3(0.85, 0.9, 1.0) * step(0.9992, max(0.0, dot(d, normalize(vec3(-uSun.x, abs(uSun.y) + 0.3, -uSun.z))))) * uNight * 0.9;
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(0.0);
}`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), m);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return {
    mesh,
    set(top, hor, night, sun) {
      const n = Math.min(1, Math.max(0, night));
      U.uTop.value.set(top).lerp(new THREE.Color(0x060a1c), n * 0.9);
      U.uHor.value.set(hor).lerp(new THREE.Color(0x141a34), n * 0.85);
      U.uNight.value = n; U.uSun.value.copy(sun);
    },
  };
}

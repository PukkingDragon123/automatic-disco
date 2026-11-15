// v6 landing, kept simple: a short cinematic drop of the colony pod onto the chosen spot, then control is handed over.
// The game for the region is built first in descent mode (the core waits hidden). Then, in about eight seconds:
// fade in on a low ground camera at the landing site; the pod comes down under its orange-and-white canopy, swaying;
// the chute is cut, the retro rockets light and kick up the dust; touchdown on the four struts (the scorch, the smoke
// and the draped chute of game/podCore.ts), a shock ring of dust; the camera rises into the colony's RTS view while the
// crew step down the ramp; a title card; control. Esc, Space or a click skips to the touchdown.
import * as THREE from 'three';
import type { Game } from './game';
import { buildPod } from '../colony/podModel';
import { Kit, std, glow } from '../colony/kit';
import { CineUI } from '../ui/cineUI';
import { csfx } from '../ui/cineAudio';
import { sfx } from '../audio/audio';
import { vfx2d } from './vfx2d';
import { puffsFor } from './podCore';
import { clamp, lerp } from '../core/rand';

export type Grade = 'BULLSEYE' | 'ON TARGET' | 'CLOSE' | 'WIDE' | 'AUTOPILOT';
/** what a landing earns (applied to the run by the deployment): within 6 m a core cell and ore, close in some ore */
export function bonusFor(g: Grade): { cells: number; res: Partial<Record<'ore' | 'carbon' | 'water' | 'soil', number>>; text: string } {
  if (g === 'BULLSEYE') return { cells: 1, res: { ore: 15, carbon: 10 }, text: '+1 CORE CELL · +15 ORE · +10 CARBON' };
  if (g === 'ON TARGET') return { cells: 0, res: { ore: 12, soil: 8 }, text: '+12 ORE · +8 SOIL' };
  if (g === 'CLOSE' || g === 'AUTOPILOT') return { cells: 0, res: { ore: 6 }, text: '+6 ORE' };
  return { cells: 0, res: {}, text: 'NO DROP BONUS' };
}
export interface DescentResult { x: number; z: number; dist: number; grade: Grade; auto: boolean; water: boolean }
export interface DescentOpts {
  game: Game;
  lz: { x: number; z: number };
  first: boolean; planetName: string;
  onDone?(r: DescentResult): void;
  /** QA: freeze at a moment ('chute', 'retro', 'touch', 'rise') */
  hold?: string | null;
}

const T_CUT = 3.4, T_TOUCH = 5.1, T_RISE = 5.4, T_END = 8.6, H0 = 150;
const _v = new THREE.Vector3();

/** the canopy: twelve gores in weathered orange and white, a vent at the apex, lines down to the riser */
function buildChute() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d')!;
  for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#e6e1d4' : '#c8642c'; g.fillRect(i * 256 / 12, 0, 256 / 12 + 1, 64); }
  g.fillStyle = 'rgba(60,40,20,0.25)'; for (let y = 8; y < 64; y += 14) g.fillRect(0, y, 256, 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const k = new Kit(), cloth = std(0xffffff, { map: tex, rough: 0.9, metal: 0, side: THREE.DoubleSide }), line = std(0x3a3630, { rough: 0.9 });
  const pts: [number, number][] = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 0.42; pts.push([Math.sin(a) * 7.5 + 0.3, Math.cos(a) * 4 - 4]); }
  k.lathe(pts.reverse(), cloth, {}, 24);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.rod([Math.sin(a) * 7.2, -2.9, Math.cos(a) * 7.2], [0, -13, 0], 0.025, line, 3); }
  return k.build('chute', false);
}
/** the retro rockets' plumes under the skirt */
function buildPlumes() {
  const k = new Kit(), m = glow(0xffc070, 2.4, { additive: true, opacity: 0.85 }), m2 = glow(0x9ad8ff, 2, { additive: true, opacity: 0.7 });
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2, x = Math.sin(a) * 1.6, z = Math.cos(a) * 1.6; k.cone(0.32, 2.2, m, { p: [x, -0.2, z], r: [Math.PI, 0, 0] }, 10); k.cone(0.16, 1.4, m2, { p: [x, 0.2, z], r: [Math.PI, 0, 0] }, 8); }
  return k.build('plumes', false);
}

export class GameDescent {
  private g: Game; private ui = new CineUI();
  private pod = buildPod(); private chute = buildChute(); private plumes = buildPlumes();
  private root = new THREE.Group();
  private t = 0; private L: { x: number; z: number; y: number }; private yaw = Math.PI / 4;
  private done = false; private touched = false; private chuteV = new THREE.Vector3(); private chuteFree = false;
  private camA = new THREE.Vector3(); private lookA = new THREE.Vector3();
  private off: (() => void)[] = []; private dustT = 0; private last = 0;
  constructor(readonly o: DescentOpts) {
    const g = (this.g = o.game), R = g.region, N = R.N;
    const f = R.freeNear(clamp(o.lz.x, 8, N - 8), clamp(o.lz.z, 8, N - 8), 12);
    const x = f ? f[0] : clamp(o.lz.x, 8, N - 8), z = f ? f[1] : clamp(o.lz.z, 8, N - 8);
    this.L = { x, z, y: R.heightAt(x, z) };
    this.root.add(this.pod.root, this.chute, this.plumes); this.plumes.visible = false;
    this.pod.root.rotation.y = this.yaw;
    g.world.scene.add(this.root);
    // the ground camera: off the hatch side, low, looking up the fall line
    const a = this.yaw + 0.55;
    this.camA.set(x + Math.sin(a) * 24, 0, z + Math.cos(a) * 24); this.camA.y = R.heightAt(this.camA.x, this.camA.z) + 2.2;
    g.vision.revealAll = true; g.vision.update(0, true);
    g.cineCam = (cam, dt) => this.camera(cam, dt);
    this.ui.letterbox(true, 0.01); this.ui.fade(1, 0); this.ui.fade(0, 1.2); this.ui.showSkip(true);
    this.ui.stamp(`${o.planetName.toUpperCase()} · ${g.regionName.toUpperCase()} · COLONY POD CP-07 INBOUND`, true);
    csfx('wind', 0.5);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === ' ') { e.stopPropagation(); this.skip(); } };
    const click = () => this.skip();
    addEventListener('keydown', key, true); g.engine.canvas.addEventListener('pointerdown', click);
    this.off.push(() => removeEventListener('keydown', key, true), () => g.engine.canvas.removeEventListener('pointerdown', click));
    g.update$.push(this.tick);
    (window as unknown as { __descent?: GameDescent }).__descent = this;
  }
  /** QA: seconds into the drop */
  get time() { return this.t; }
  private skip() { if (this.t < T_TOUCH) this.t = T_TOUCH - 0.01; else if (this.t < T_END - 0.5) this.t = T_END - 0.5; }
  /** the pod's height above the ground at time t */
  private alt(t: number) {
    if (t < T_CUT) return H0 - t * 34;
    const a0 = H0 - T_CUT * 34, k = clamp((t - T_CUT) / (T_TOUCH - T_CUT), 0, 1);
    return a0 * (1 - k) * (1 - k * 0.55) * (1 - k * 0.2);
  }
  private tick = (_simDt: number) => {
    if (this.done) return;
    const now = performance.now(), dt = this.last ? Math.min(1 / 15, (now - this.last) / 1000) : 1 / 60; this.last = now;
    const hold = this.o.hold;
    const frozen = (hold === 'chute' && this.t > 1.8) || (hold === 'retro' && this.t > 4.4) || (hold === 'touch' && this.t > T_TOUCH + 0.4) || (hold === 'rise' && this.t > 6.8);
    if (!frozen) this.t += dt;
    const t = this.t, g = this.g, L = this.L;
    this.ui.update(dt);
    if (!this.touched) {
      const h = this.alt(t), sway = t < T_CUT ? Math.sin(t * 1.7) * 0.09 : Math.sin(t * 3) * 0.03 * (1 - (t - T_CUT) / 2);
      this.pod.root.position.set(L.x + Math.sin(t * 0.8) * (h / H0) * 3, L.y + h, L.z);
      this.pod.root.rotation.set(sway, this.yaw + t * 0.05, sway * 0.6);
      this.pod.update(t, dt, { power: 1 });
      if (!this.chuteFree) {
        this.chute.position.copy(this.pod.root.position).add(_v.set(0, 18, 0)); this.chute.rotation.set(sway * 0.5, t * 0.1, 0);
        const open = clamp(t / 0.8, 0.2, 1); this.chute.scale.set(open, 1, open);
      }
      if (t >= T_CUT && !this.chuteFree) {
        this.chuteFree = true; this.chuteV.set(3.5, 6, 1.5); this.plumes.visible = true;
        csfx('ignite', 0.8); csfx('thrust', 0.7); sfx('pulse', 0.5, 0.6);
        this.ui.stamp('CHUTE CUT · RETRO IGNITION', true);
      }
      if (this.chuteFree) {
        this.chuteV.y -= dt * 4; this.chute.position.addScaledVector(this.chuteV, dt); this.chute.rotation.z += dt * 0.6; this.chute.scale.y = Math.max(0.2, this.chute.scale.y - dt * 0.5);
        this.plumes.position.copy(this.pod.root.position).add(_v.set(0, 0.8, 0)); this.plumes.rotation.y = this.pod.root.rotation.y;
        const fl = 0.8 + Math.random() * 0.4; this.plumes.scale.set(1, fl * (0.6 + clamp(h / 30, 0, 1)), 1);
        // dust off the ground as the plume reaches it
        this.dustT -= dt;
        if (h < 22 && this.dustT <= 0) { this.dustT = 0.06; const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5; vfx2d.play('dust', L.x + Math.cos(a) * r, L.y + 0.2, L.z + Math.sin(a) * r, { scale: 1.4 + (22 - h) / 10 }); }
        if (h < 30 && Math.random() < dt * 20) g.fx.burst(L.x + (Math.random() - 0.5) * 3, L.y + 0.3, L.z + (Math.random() - 0.5) * 3, 3, 0xc8b090, { speed: 4, up: 1.5, size: 4, life: 1.2 });
        g.cam.shake(0.05 * (1 - h / 60), 0.1);
      }
      if (t >= T_TOUCH) this.touchdown();
    } else {
      // the chute settles away downwind; the pod is the colony's now
      if (this.chute.visible) { this.chuteV.y -= dt * 4; this.chute.position.addScaledVector(this.chuteV, dt); if (this.chute.position.y < L.y - 6) this.chute.visible = false; }
    }
    if (t >= T_RISE && t - dt < T_RISE) { this.ui.stampOff(); this.ui.card('COLONY ESTABLISHED', `${g.regionName.toUpperCase()} · SOL 1`, 'UNAA PLANETARY RESEARCH PROGRAM', 'UNAA'); csfx('sting', 0.5); }
    if (t >= T_END - 1.2 && t - dt < T_END - 1.2) { this.ui.cardOff(); this.ui.letterbox(false, 1); }
    if (t >= T_END) this.finish();
  };
  private touchdown() {
    this.touched = true;
    const g = this.g, L = this.L;
    this.pod.root.removeFromParent(); this.plumes.visible = false;
    g.touchdown(L.x, L.z, Math.sin(this.yaw + Math.PI), Math.cos(this.yaw + Math.PI));
    g.emerge();
    const c = g.colony; if (c) { c.pod.yaw = this.yaw; c.pod.model.root.rotation.y = this.yaw; }
    const p = puffsFor(g);
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; vfx2d.play('dust', L.x + Math.cos(a) * 3.5, L.y + 0.2, L.z + Math.sin(a) * 3.5, { scale: 2.2, delay: i * 0.01 }); p.emit(L.x + Math.cos(a) * 3, L.y + 0.4, L.z + Math.sin(a) * 3, { size: 0.8, grow: 4, life: 3, vy: 0.6, ramp: 2, jitter: 1.2 }); }
    vfx2d.play('shock', L.x, L.y + 0.1, L.z, { scale: 3.5 });
    g.cam.shake(0.9, 0.6); csfx('thud', 1); csfx('crunch', 0.6); csfx('steam', 0.8); sfx('hit', 0.4, 1);
    g.world.flora.impulse?.(L.x, L.z, 7, 2.2);
    // the RTS view the camera rises into
    g.cam.followFn(null); g.cam.lookAt(L.x + 2, L.z + 2, true); g.cam.dist = g.cam.distGoal = 34;
    this.ui.stamp('TOUCHDOWN', true);
  }
  private camera(cam: THREE.PerspectiveCamera, dt: number) {
    const t = this.t, L = this.L;
    if (t < T_RISE) {
      const P = this.touched ? new THREE.Vector3(L.x, L.y + 2.5, L.z) : this.pod.root.position.clone().add(_v.set(0, 2, 0));
      this.lookA.lerp(P, this.lookA.lengthSq() ? Math.min(1, dt * 5) : 1);
      cam.position.copy(this.camA); cam.fov = lerp(44, 38, clamp(t / T_TOUCH, 0, 1));
      cam.lookAt(this.lookA); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      return;
    }
    // rise into the game's own camera (which the game has just placed)
    const k = clamp((t - T_RISE) / (T_END - T_RISE - 0.6), 0, 1), e = k * k * (3 - 2 * k);
    const gc = this.g.cam; gc.update(0, this.g.input);
    const to = gc.cam.position.clone(), look = gc.target.clone().add(_v.set(0, 0.5, 0));
    cam.position.lerpVectors(this.camA, to, e);
    const lk = new THREE.Vector3(L.x, L.y + 2.5, L.z).lerp(look, e);
    cam.fov = lerp(38, 36, e); cam.lookAt(lk); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }
  private finish() {
    if (this.done) return; this.done = true;
    const g = this.g, L = this.L;
    g.cineCam = null; g.vision.revealAll = false;
    for (const f of this.off) f();
    this.root.removeFromParent();
    this.ui.dispose();
    g.beginStory();
    const dist = Math.hypot(L.x - this.o.lz.x, L.z - this.o.lz.z);
    this.o.onDone?.({ x: L.x, z: L.z, dist, grade: dist < 6 ? 'BULLSEYE' : dist < 12 ? 'ON TARGET' : 'AUTOPILOT', auto: true, water: false });
  }
}

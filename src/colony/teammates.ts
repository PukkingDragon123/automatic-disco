// The two teammates who came down with the pod. They walk the colony in EVA suits doing jobs (inspect, repair,
// sample, build, defend), have needs (suit oxygen, hunger, fatigue, health, morale) that send them back to the pod,
// and take orders (select one, right-click: walk there / work that). The story agent stages scenes with them
// (`script`) and kills them in a scripted event (`kill`); while staged their AI stands down.
// Their models come from the crew agent's `buildModel(id)` when it exists (src/ship/crew), else a UNAA EVA suit.
import * as THREE from 'three';
import { Kit, std, glow, TAU } from './kit';
import { suitSheet, COL } from './tex';
import type { Colony } from './colony';
import type { Creature } from '../game/creature';
import { clamp, damp, dampA } from '../core/rand';
import { floatText } from '../ui/floatText';
import { sfx } from '../audio/audio';

export type JobKind = 'move' | 'inspect' | 'repair' | 'sample' | 'build' | 'defend' | 'eat' | 'sleep' | 'refill';
export interface Job { k: JobKind; x: number; z: number; target?: unknown; t?: number; label?: string; player?: boolean }
export type CrewState = 'idle' | 'walk' | 'work' | 'inside' | 'dead' | 'scripted';
/** one step of a staged scene */
export type ScriptStep = { walkTo: [number, number]; run?: boolean } | { face: [number, number] } | { anim: 'kneel' | 'wave' | 'point' | 'idle' | 'fall' } | { say: string; t?: number } | { wait: number };

export interface CrewSpec { id: string; name: string; role: 'engineer' | 'biologist'; accent: string }
export const DEFAULT_CREW: CrewSpec[] = [
  { id: 'engineer', name: 'Ines Valdivia', role: 'engineer', accent: COL.orange },
  { id: 'biologist', name: 'Tomas Achterberg', role: 'biologist', accent: '#2b7a6a' },
];
/** the crew agent's model builder (src/ship/crew/*.ts exporting buildModel), found at build time if it exists */
const CREW_MODS = import.meta.glob('../ship/crew/*.ts') as Record<string, () => Promise<unknown>>;
let crewBuild: ((id: string) => unknown) | null = null, crewTried: Promise<void> | null = null;
/** find the crew agent's buildModel (lazily: no import cycle, no cost if it is not there) */
function loadCrewBuilder() {
  crewTried ??= Promise.all(Object.values(CREW_MODS).map((f) => f().catch(() => ({})))).then((ms) => {
    for (const m of ms as { buildModel?: (id: string) => unknown }[]) if (typeof m.buildModel === 'function') { crewBuild = m.buildModel; break; }
  });
  return crewTried;
}
function crewModel(id: string): THREE.Object3D | null {
  if (!crewBuild) return null;
  try { const r = crewBuild(id) as THREE.Object3D | { root?: THREE.Object3D } | null; const o = r && ((r as THREE.Object3D).isObject3D ? r as THREE.Object3D : (r as { root?: THREE.Object3D }).root); if (o) return o; } catch (e) { console.warn('crew.buildModel', e); }
  return null;
}

interface Rig { hips: THREE.Group; torso: THREE.Group; head: THREE.Group; legL: THREE.Group; legR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group; armL: THREE.Group; armR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group; rifle: THREE.Object3D }
const _v = new THREE.Vector3();

export class Teammate {
  readonly root = new THREE.Group();
  readonly id: string; readonly name: string; readonly role: CrewSpec['role'];
  x: number; z: number; y = 0; yaw = 0;
  hp = 100; suit = 100; hunger = 10; fatigue = 10; morale = 75;
  alive = true; state: CrewState = 'idle';
  job: Job | null = null; queue: Job[] = [];
  /** the story has them (no AI) */
  staged = false;
  private rig: Rig | null = null; private ext = false; private suitModel!: THREE.Object3D; extModel: THREE.Object3D | null = null;
  private walkPh = 0; private speed = 0; private workT = 0; private anim: 'kneel' | 'wave' | 'point' | 'idle' | 'fall' | null = null;
  private shotT = 0; private sayT = 0; private thinkT = Math.random();
  readonly flag = { value: 1 };
  causeOfDeath = '';
  constructor(readonly colony: Colony, spec: CrewSpec, x: number, z: number) {
    this.id = spec.id; this.name = spec.name; this.role = spec.role;
    this.x = x; this.z = z;
    this.suitModel = this.buildSuit(spec.accent);
    this.root.add(this.suitModel);
    // the crew agent's model replaces the stand-in suit when its module is there
    loadCrewBuilder().then(() => { const ext = crewModel(spec.id); if (ext && this.alive !== undefined) { this.ext = true; this.suitModel.removeFromParent(); this.rig = null; this.root.add(ext); this.extModel = ext; } });
    colony.g.world.scene.add(this.root);
    this.root.userData.sel = { kind: 'crew', ref: this };
  }
  get short() { return this.name.split(' ')[0].toUpperCase(); }
  get title() { return this.role === 'engineer' ? 'FIELD ENGINEER' : 'EXOBIOLOGIST'; }

  // ------------------------------------------------------------------ the suit
  private buildSuit(accent: string) {
    const cloth = std(0xffffff, { map: suitSheet(accent), rough: 0.85, metal: 0, flag: this.flag });
    const white = std(0xe2dfd5, { rough: 0.6, metal: 0.05, flag: this.flag });
    const dark = std(0x2f3337, { rough: 0.6, metal: 0.4, flag: this.flag });
    const acc = std(new THREE.Color(accent).getHex(), { rough: 0.5, metal: 0.1, flag: this.flag });
    const visor = std(0xb8862c, { rough: 0.08, metal: 0.95, flag: this.flag });
    const steel = std(0x9a9d9e, { rough: 0.32, metal: 0.8, flag: this.flag });
    const G = (p: THREE.Object3D, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
    const top = new THREE.Group();
    const hips = G(top, 0, 0.95, 0), torso = G(hips, 0, 0.08, 0), head = G(torso, 0, 0.62, 0.02);
    const legL = G(hips, 0.12, -0.05, 0), legR = G(hips, -0.12, -0.05, 0), kneeL = G(legL, 0, -0.43, 0), kneeR = G(legR, 0, -0.43, 0);
    const armL = G(torso, 0.27, 0.48, 0), armR = G(torso, -0.27, 0.48, 0), elbowL = G(armL, 0, -0.3, 0), elbowR = G(armR, 0, -0.3, 0);
    const part = (g: THREE.Object3D, f: (k: Kit) => void) => { const k = new Kit(); f(k); g.add(k.build('suit')); };
    part(hips, (k) => { k.box(0.36, 0.2, 0.24, cloth, {}); k.box(0.38, 0.06, 0.26, dark, { p: [0, 0.1, 0] }); k.box(0.1, 0.08, 0.04, acc, { p: [0.12, 0.02, 0.13] }); });
    part(torso, (k) => {
      k.box(0.44, 0.5, 0.3, cloth, { p: [0, 0.3, 0] }); k.box(0.46, 0.12, 0.32, white, { p: [0, 0.5, 0] });
      k.box(0.24, 0.16, 0.06, dark, { p: [0, 0.32, 0.17] }); k.box(0.06, 0.03, 0.02, glow(0x7fd48a, 1.6), { p: [-0.06, 0.36, 0.205] }); k.box(0.04, 0.03, 0.02, glow(0xffa030, 1.8), { p: [0.05, 0.36, 0.205] });
      k.box(0.12, 0.1, 0.02, acc, { p: [0.14, 0.46, 0.16] });
      // life-support pack
      k.box(0.42, 0.56, 0.2, white, { p: [0, 0.32, -0.25] }); k.box(0.36, 0.08, 0.18, acc, { p: [0, 0.08, -0.25] });
      for (const s of [-1, 1]) k.cyl(0.05, 0.05, 0.42, steel, { p: [s * 0.15, 0.36, -0.37] }, 8);
      k.pipe([[0.2, 0.42, -0.15], [0.26, 0.5, 0.0], [0.12, 0.58, 0.12]], 0.022, dark, 8, 5);
      k.rod([-0.15, 0.6, -0.3], [-0.18, 1.05, -0.32], 0.008, steel, 4);
    });
    part(head, (k) => {
      k.cyl(0.13, 0.14, 0.06, dark, { p: [0, 0, 0] }, 14);
      k.sph(0.19, white, { p: [0, 0.16, 0] }, 16, 12);
      k.sph(0.165, visor, { p: [0, 0.16, 0.045] }, 16, 10, Math.PI * 0.9, Math.PI * 0.32, Math.PI * 0.42);
      k.box(0.06, 0.05, 0.08, dark, { p: [0.17, 0.2, 0] }); k.box(0.05, 0.03, 0.03, glow(0xfff1d0, 2.2), { p: [0.17, 0.2, 0.05] });
    });
    for (const [leg, knee] of [[legL, kneeL], [legR, kneeR]] as [THREE.Group, THREE.Group][]) {
      part(leg, (k) => { k.cyl(0.085, 0.075, 0.42, cloth, { p: [0, -0.21, 0] }, 10); k.cyl(0.09, 0.09, 0.05, dark, { p: [0, -0.12, 0] }, 10); });
      part(knee, (k) => { k.sph(0.08, dark, {}, 8, 6); k.cyl(0.07, 0.06, 0.4, cloth, { p: [0, -0.22, 0] }, 10); k.box(0.14, 0.1, 0.26, white, { p: [0, -0.46, 0.04] }); k.box(0.15, 0.03, 0.27, dark, { p: [0, -0.5, 0.04] }); });
    }
    for (const [arm, el, s] of [[armL, elbowL, 1], [armR, elbowR, -1]] as [THREE.Group, THREE.Group, number][]) {
      part(arm, (k) => { k.sph(0.09, white, {}, 10, 8); k.cyl(0.065, 0.06, 0.3, cloth, { p: [0, -0.15, 0] }, 10); k.box(0.1, 0.06, 0.04, acc, { p: [s * 0.06, -0.08, 0] }); });
      part(el, (k) => { k.cyl(0.058, 0.05, 0.27, cloth, { p: [0, -0.14, 0] }, 10); k.cyl(0.062, 0.062, 0.06, dark, { p: [0, -0.27, 0] }, 10); k.box(0.07, 0.1, 0.05, white, { p: [0, -0.34, 0] }); });
    }
    // a carbine on the right forearm (shown when defending)
    const rifle = G(elbowR, 0, -0.32, 0.05);
    part(rifle, (k) => { k.box(0.05, 0.08, 0.5, dark, { p: [0, 0, 0.15] }); k.cyl(0.015, 0.015, 0.25, steel, { p: [0, 0.01, 0.5], r: [Math.PI / 2, 0, 0] }, 6); k.box(0.03, 0.12, 0.05, dark, { p: [0, -0.07, 0.02] }); });
    rifle.visible = false;
    this.rig = { hips, torso, head, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, rifle };
    top.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    return top;
  }

  // ------------------------------------------------------------------ orders and scripts
  order(j: Job, queue = false) { if (!this.alive || this.staged) return; j.player = true; if (queue) this.queue.push(j); else { this.queue = []; this.job = j; } }
  private script$: { steps: ScriptStep[]; i: number; t: number; done: () => void } | null = null;
  /** stage a scene: the AI stands down until it finishes (resolves when done) */
  script(steps: ScriptStep[]): Promise<void> {
    this.staged = true; this.state = 'scripted'; this.job = null;
    return new Promise((res) => { this.script$ = { steps, i: 0, t: 0, done: () => { this.script$ = null; res(); } }; });
  }
  /** hand them back to their own judgement */
  release() { this.staged = false; this.anim = null; if (this.state === 'scripted') this.state = 'idle'; }
  /** the scripted death (or any death): collapses, the colony mourns */
  kill(cause = 'killed') {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this.state = 'dead'; this.anim = 'fall'; this.causeOfDeath = cause; this.job = null; this.queue = [];
    this.colony.teammateDied(this);
  }
  say(text: string, t = 3) { floatText(this.colony.g, this.x, this.y + 2.2, this.z, text, 'info' as never, { life: t }); this.sayT = t; }

  // ------------------------------------------------------------------ the day
  update(dt: number, simDt: number) {
    const c = this.colony, g = c.g;
    if (this.alive && simDt > 0) this.needs(simDt);
    let goal: [number, number] | null = null, run = false;
    if (this.script$) {
      const s = this.script$, st = s.steps[s.i];
      s.t += simDt > 0 ? simDt : dt * (c.g.paused ? 0 : 1);
      if (!st) s.done();
      else if ('walkTo' in st) { goal = st.walkTo; run = !!st.run; if (Math.hypot(st.walkTo[0] - this.x, st.walkTo[1] - this.z) < 0.35) { s.i++; s.t = 0; } }
      else if ('face' in st) { this.yaw = dampA(this.yaw, Math.atan2(st.face[0] - this.x, st.face[1] - this.z), 6, dt); if (s.t > 0.6) { s.i++; s.t = 0; } }
      else if ('anim' in st) { this.anim = st.anim === 'idle' ? null : st.anim; s.i++; s.t = 0; }
      else if ('say' in st) { if (s.t === (simDt > 0 ? simDt : dt)) this.say(st.say, st.t ?? 3); if (s.t > (st.t ?? 3)) { s.i++; s.t = 0; } }
      else if ('wait' in st) { if (s.t > st.wait) { s.i++; s.t = 0; } }
    } else if (this.alive && !this.staged && simDt > 0) {
      this.thinkT -= simDt;
      if (!this.job && this.queue.length) this.job = this.queue.shift()!;
      if (!this.job && this.thinkT <= 0) { this.thinkT = 1.5 + Math.random(); this.job = c.pickJob(this); }
      const j = this.job;
      if (j) {
        const reach = j.k === 'defend' ? 9 : j.k === 'sample' || j.k === 'repair' || j.k === 'build' ? 1.6 : j.k === 'inspect' ? 2.2 : 0.4;
        let tx = j.x, tz = j.z;
        if (j.k === 'defend') { const cr = j.target as Creature; if (!cr || cr.dead) { this.done(); } else { tx = cr.x; tz = cr.z; } }
        if (j.k === 'eat' || j.k === 'sleep' || j.k === 'refill') { const d = c.pod.door; tx = d.x; tz = d.z; }
        const d = Math.hypot(tx - this.x, tz - this.z);
        if (this.job && d > reach) { goal = [tx, tz]; run = j.k === 'defend' || j.k === 'refill' || this.suit < 20; this.state = 'walk'; this.workT = 0; }
        else if (this.job) { this.state = 'work'; this.work(j, simDt, tx, tz); }
      } else this.state = 'idle';
    }
    // walking: straight at the goal, round the pod, never into deep water
    const R = g.region, N = R.N;
    let sp = 0;
    if (goal && this.alive && (simDt > 0 || this.script$)) {
      const step = simDt > 0 ? simDt : 0;
      let dx = goal[0] - this.x, dz = goal[1] - this.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      // steer round the pod's hull (except into the door)
      const px = this.x - c.pod.x, pz = this.z - c.pod.z, pd = Math.hypot(px, pz);
      const toDoor = this.job && (this.job.k === 'eat' || this.job.k === 'sleep' || this.job.k === 'refill');
      if (pd < 4.2 && !toDoor) { const s = Math.sign(px * dz - pz * dx) || 1; dx += (-pz / pd) * s * (1 - pd / 4.2) * 1.4 + (px / pd) * 0.6 * (1 - pd / 4.2); dz += (px / pd) * s * (1 - pd / 4.2) * 1.4 + (pz / pd) * 0.6 * (1 - pd / 4.2); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
      sp = (run ? 3.2 : 1.5) * (this.hp < 40 ? 0.6 : 1) * (0.7 + (this.morale / 100) * 0.3);
      const nx = clamp(this.x + dx * sp * step, 1, N - 1), nz = clamp(this.z + dz * sp * step, 1, N - 1);
      if (!R.isWater(nx, nz) || R.heightAt(nx, nz) > R.water - 0.4) { this.x = nx; this.z = nz; }
      this.yaw = dampA(this.yaw, Math.atan2(dx, dz), 8, dt);
    }
    this.speed = damp(this.speed, sp, 8, dt);
    this.y = g.world.surfaceY(clamp(this.x, 0, N - 0.01), clamp(this.z, 0, N - 0.01));
    // inside the pod (eating, sleeping): hidden
    const inside = this.alive && this.state === 'work' && !!this.job && (this.job.k === 'eat' || this.job.k === 'sleep');
    this.root.visible = !inside;
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.yaw;
    this.animate(dt);
    this.sayT -= dt;
  }
  private done() { this.job = null; this.workT = 0; }
  private needs(dt: number) {
    const c = this.colony, out = !(this.state === 'work' && this.job && (this.job.k === 'eat' || this.job.k === 'sleep' || this.job.k === 'refill'));
    // suit oxygen drains outside; the pod tops it up from the colony tank
    if (out) this.suit = Math.max(0, this.suit - dt * 0.42);
    this.hunger = Math.min(100, this.hunger + dt * 0.11);
    this.fatigue = Math.min(100, this.fatigue + dt * (this.state === 'work' ? 0.1 : 0.06));
    if (this.suit <= 0) { this.hp -= dt * 3.5; if (Math.random() < dt) c.alert(`${this.short}: SUIT O2 EMPTY`, 'bad', new THREE.Vector3(this.x, this.y + 2, this.z), 'suit' + this.id); }
    if (this.hunger >= 100) this.hp -= dt * 0.35;
    if (c.vitals.o2 <= 0 && !out) this.hp -= dt * 2.5;
    if (this.hp <= 0) { this.kill(this.suit <= 0 ? 'suffocated in the field' : this.hunger >= 100 ? 'starved' : 'died of wounds'); return; }
    if (this.hp < 100 && this.hunger < 70 && this.suit > 20) this.hp = Math.min(100, this.hp + dt * 0.1);
    // needs override work
    const j = this.job;
    if (this.suit < 30 && (!j || j.k !== 'refill') && c.vitals.o2 > 2) { this.job = { k: 'refill', x: 0, z: 0, label: 'REFILLING SUIT' }; if (this.suit < 22) this.say('Suit low, heading back.', 2.5); }
    else if (this.hunger > 75 && (!j || (j.k !== 'eat' && j.k !== 'refill' && !j.player)) && c.vitals.food > 0.5) this.job = { k: 'eat', x: 0, z: 0, label: 'EATING' };
    else if (this.fatigue > 88 && (!j || (j.k !== 'sleep' && j.k !== 'refill' && j.k !== 'eat' && !j.player))) this.job = { k: 'sleep', x: 0, z: 0, label: 'SLEEPING' };
    // morale drifts toward what the colony gives them
    const tgt = c.vitals.moraleTarget(this);
    this.morale = damp(this.morale, tgt, 0.05, dt);
  }
  private work(j: Job, dt: number, tx: number, tz: number) {
    const c = this.colony;
    this.workT += dt;
    this.yaw = dampA(this.yaw, Math.atan2(tx - this.x, tz - this.z), 6, dt);
    switch (j.k) {
      case 'move': this.done(); break;
      case 'refill': { const need = 100 - this.suit, take = Math.min(need, dt * 25); if (c.vitals.o2 > 0) { this.suit += take; c.vitals.o2 = Math.max(0, c.vitals.o2 - take * 0.02); } if (this.suit >= 99) this.done(); break; }
      case 'eat': { if (this.workT > 6) { const got = c.vitals.eat(1); this.hunger = Math.max(0, this.hunger - got * 70); this.suit = 100; this.done(); } break; }
      case 'sleep': { this.fatigue = Math.max(0, this.fatigue - dt * 4); this.suit = 100; if (this.fatigue <= 2) this.done(); break; }
      case 'inspect': { if (this.workT > 3) { c.inspected(this, j); this.done(); } break; }
      case 'repair': { const t = j.target as { hp: number; maxHp: number; repair(n: number): void } | undefined; if (!t || t.hp >= t.maxHp) { this.done(); break; } t.repair(dt * 6); if (Math.random() < dt * 8) c.g.fx.burst(tx, this.y + 1, tz, 2, 0x9ad8ff, { glow: true, speed: 2, up: 1, size: 2, life: 0.3 }); if (Math.random() < dt * 2) sfx('zap', 2, 0.05); break; }
      case 'build': { const s = j.target as { done: boolean } | undefined; if (!s || s.done) this.done(); break; }
      case 'sample': { if (this.workT > 4) { c.crewSample(this, j); this.done(); } break; }
      case 'defend': {
        const cr = j.target as Creature;
        this.shotT -= dt;
        if (this.shotT <= 0 && cr && !cr.dead) {
          this.shotT = 0.9 + Math.random() * 0.4;
          const from = new THREE.Vector3(this.x, this.y + 1.3, this.z), to = new THREE.Vector3(cr.x, cr.y + cr.size * 0.4, cr.z);
          c.g.fx.arc(from, to, 0.08, 0xffd080, 0.05);
          c.g.world.damage(cr, 7, null); sfx('crack', 1.6, 0.25);
          if (cr.mind !== 'flee' && Math.random() < 0.3) { cr.mind = 'flee'; cr.fleeT = 3; }
        }
        if (!cr || cr.dead) this.done();
        break;
      }
    }
  }
  private animate(dt: number) {
    const r = this.rig; if (!r) { this.root.position.y += Math.abs(Math.sin(this.walkPh)) * 0.04; this.walkPh += dt * this.speed * 4; return; }
    const sp = this.speed;
    this.walkPh += dt * (2.2 + sp * 2.6);
    const sw = Math.min(1, sp / 2) * 0.55, ph = this.walkPh;
    const working = this.state === 'work' && this.job && ['repair', 'sample', 'build', 'inspect'].includes(this.job.k);
    const kneel = this.anim === 'kneel' || (working && (this.job!.k === 'sample'));
    let hipsY = 0.95 + Math.abs(Math.cos(ph)) * 0.04 * Math.min(1, sp);
    let legL = Math.sin(ph) * sw, legR = -Math.sin(ph) * sw, kneeL = Math.max(0, -Math.sin(ph + 0.8)) * sw * 1.4, kneeR = Math.max(0, Math.sin(ph + 0.8)) * sw * 1.4;
    let armL = -Math.sin(ph) * sw * 0.8, armR = Math.sin(ph) * sw * 0.8, elL = -0.25, elR = -0.25, torso = 0.06 * Math.min(1, sp), armRz = 0, head = 0;
    if (kneel) { hipsY = 0.55; legL = -1.2; kneeL = 1.9; legR = 0.2; kneeR = 1.35; armR = -0.9; elR = -0.6; armL = -0.4; torso = 0.35; head = 0.3; }
    else if (working) { armR = -1.1 + Math.sin(this.workT * 7) * 0.12; elR = -0.4; armL = -0.8; elL = -0.6; torso = 0.15; }
    if (this.anim === 'wave') { armR = 0; armRz = -2.6 + Math.sin(this.workT * 8) * 0.3; this.workT += dt; }
    if (this.anim === 'point') { armR = -1.5; elR = 0; }
    const defending = this.job?.k === 'defend' && this.state === 'work';
    r.rifle.visible = defending || this.job?.k === 'defend';
    if (defending) { armR = -1.45; elR = -0.15; armL = -1.3; elL = -0.8; }
    if (this.state === 'dead' || this.anim === 'fall') {
      // a slow collapse to the ground, then still
      const f = clamp((this as unknown as { fallT?: number }).fallT ?? 0, 0, 1);
      (this as unknown as { fallT: number }).fallT = f + dt * 0.8;
      hipsY = 0.95 - f * 0.78; r.hips.rotation.x = -f * 1.45; legL = f * 0.2; legR = -f * 0.1; kneeL = f * 0.4; kneeR = f * 0.2; armL = -f * 0.6; armR = f * 0.4; torso = 0; head = f * 0.2;
    } else r.hips.rotation.x = 0;
    const k = Math.min(1, dt * 12);
    r.hips.position.y += (hipsY - r.hips.position.y) * k;
    r.legL.rotation.x += (-legL - r.legL.rotation.x) * k; r.legR.rotation.x += (-legR - r.legR.rotation.x) * k;
    r.kneeL.rotation.x += (kneeL - r.kneeL.rotation.x) * k; r.kneeR.rotation.x += (kneeR - r.kneeR.rotation.x) * k;
    r.armL.rotation.x += (armL - r.armL.rotation.x) * k; r.armR.rotation.x += (armR - r.armR.rotation.x) * k; r.armR.rotation.z += (armRz - r.armR.rotation.z) * k;
    r.elbowL.rotation.x += (elL - r.elbowL.rotation.x) * k; r.elbowR.rotation.x += (elR - r.elbowR.rotation.x) * k;
    r.torso.rotation.x += (torso - r.torso.rotation.x) * k; r.head.rotation.x += (head - r.head.rotation.x) * k;
  }
  /** chest height (for labels and beams) */
  chest(out = _v) { return out.set(this.x, this.y + 1.3, this.z); }
  get jobLabel() {
    if (!this.alive) return 'K.I.A.';
    if (this.staged) return 'ON SCENE';
    const j = this.job; if (!j) return 'IDLE';
    if (j.label) return j.label;
    const at = this.state === 'walk' ? 'EN ROUTE: ' : '';
    return at + ({ move: 'MOVING', inspect: 'INSPECTING', repair: 'REPAIRING', sample: 'SAMPLING', build: 'BUILDING', defend: 'DEFENDING', eat: 'EATING', sleep: 'SLEEPING', refill: 'REFILLING SUIT' } as Record<JobKind, string>)[j.k];
  }
  dispose() { this.root.removeFromParent(); }
}
void TAU;

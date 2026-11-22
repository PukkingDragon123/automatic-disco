// THE GUIDE: Teo Barrera, survey lead of the UNAA PATHFINDER (RV-03), the program's earlier mission. Stranded six
// years when the Pathfinder's lander broke up; he has lived beside its cargo pod ever since. He is already at the
// crash site when UNIT 07 comes down, and he teaches through quests and lines on the subtitle strip.
// Built on the Limbophobia human rig the crew uses (src/ship/crew/model.ts): weathered, sun-dark, a long grey beard,
// a scarred face, a patched leather jacket over a faded UNAA field shirt, goggles, a tool belt, knee pads, a pack.
//   new Guide(game) -> { actor, model, camp, x, z, busy, update(dt), hitTest(mx, my), say(text) }
import * as THREE from 'three';
import type { Game } from '../game/game';
import { ROSTER, type CrewDef, type CrewId } from '../ship/crew/roster';
import { buildCrewModel, type CrewModel } from '../ship/crew/model';
import { Actor } from '../ui/cineCast';
import { buildCamp, type Camp } from './camp';
import { anyG } from '../research/util';

export const GUIDE_ID = 'barrera' as CrewId;
const A = (a: Record<string, unknown>) => a as never;
/** Teo's crew card (the rig reads app, outfit, ov and gear; the rest is for the sheets) */
export const GUIDE_DEF = {
  id: GUIDE_ID, name: 'Teo Barrera', short: 'Teo', role: 'Survey Lead (UNAA Pathfinder, stranded)', job: 'Survey Lead', dept: 'Pathfinder Survey', rank: 'Survey Lead',
  age: 54, origin: 'Valparaíso, Chile', heightM: 1.78, body: 'Lean and stringy from six hungry years, sun-dark, a slight stoop',
  look: 'Long grey-brown hair tied back badly, a long grey beard, deep lines and an old scar across the brow, pale squinting eyes.',
  outfitNote: 'A patched brown leather jacket over a faded UNAA field shirt, frayed cargo trousers, mended boots, goggles pushed up, a tool belt, knee pads, a salvaged pack.',
  personality: 'Dry, patient, a little cracked. Talks to himself. Kind once he trusts you. Has buried four crewmates and will not bury more if he can help it.',
  voice: { pitch: 0.78, rate: 0.9, hint: ['Jorge', 'Google español', 'Microsoft Raul', 'Daniel', 'male'], female: false },
  app: A({ skin: 0x9a6442, hair: 0x7a7064, hairStyle: 'long', face: 2, build: 'slim', height: 1.0, bodyShape: 0.2, eyeColor: 0x6a7a70, facialHair: 'beard', freckles: 0.25, scars: 2, age: 0.82, jaw: 5, eyeShape: 3, brows: 2, nose: 5, mouth: 1, ears: 2 }),
  outfit: {
    torso: { tex: 'c_shirt_button', color: 0x9a7a52, sleeve: 'long' }, torsoOuter: { tex: 'c_jacket_leather', color: 0x5a3e2a, sleeve: 'long' },
    legs: { tex: 'c_slacks', color: 0x55503e }, legsKind: 'pants', feet: { tex: 'c_shoes_boot', color: 0x3a2c20 }, hands: { tex: 'c_gloves', color: 0x4a3a2a },
    back: { tex: 'c_backpack', color: 0x5a5a3c, size: 1 },
    cond: { dirt: 2.2 },
  },
  ov: { hairVolume: 1.15 },
  gear: ['goggles', 'toolBelt', 'kneePads', 'wristComp', 'patchL'],
  scale: 1, dept_col: [196, 120, 60], home: 'cargo',
  routine: [], lines: { idle: [], click: [], grief: [], alarm: [] }, clickGesture: 'nod',
} as unknown as CrewDef;
let registered = false;
/** the rig builder reads the roster by id: Teo joins it (he is not crew; the hub never lists him) */
export function registerGuide() { if (registered) return; registered = true; (ROSTER as Record<string, CrewDef>)[GUIDE_ID] = GUIDE_DEF; }

type Mode = 'camp' | 'greet' | 'talk' | 'walk' | 'visit';
const V = THREE.Vector3;
export class Guide {
  readonly camp: Camp;
  readonly model: CrewModel;
  readonly actor: Actor;
  mode: Mode = 'camp';
  /** set while a conversation holds him */
  busy = false;
  /** a small icon floats over his head while he has something to say */
  pending = false;
  private t = 0; private idleT = 4; private home: THREE.Vector3;
  private camp0: THREE.Vector3;
  constructor(readonly g: Game, at: { x: number; z: number; yaw: number }) {
    registerGuide();
    const G = anyG(g), ground = (x: number, z: number) => G.world.surfaceY(Math.max(0, Math.min(G.region.N - 0.01, x)), Math.max(0, Math.min(G.region.N - 0.01, z)));
    this.camp = buildCamp(ground, at.x, at.z, at.yaw);
    G.world.scene.add(this.camp.root);
    this.model = buildCrewModel(GUIDE_ID, { scale: 1 });
    this.model.rig.root.userData.guide = true;
    this.actor = new Actor(this.model.rig, ground, G.world.scene);
    const seat = this.camp.seat.clone().applyAxisAngle(new V(0, 1, 0), at.yaw).add(new V(at.x, 0, at.z));
    this.home = seat; this.camp0 = new V(at.x, 0, at.z);
    const fire = this.fireWorld();
    this.actor.place(seat.x, seat.z, Math.atan2(fire.x - seat.x, fire.z - seat.z));
    this.actor.full = 'sit';
  }
  get x() { return this.actor.x; } get z() { return this.actor.z; }
  fireWorld() { return this.camp.fire.clone().applyAxisAngle(new V(0, 1, 0), this.camp.root.rotation.y).add(new V(this.camp.root.position.x, 0, this.camp.root.position.z)); }
  /** the head, in the world (camera shots, the floating icon) */
  head(out = new V()) { return out.set(this.actor.x, this.actor.y + (this.actor.full === 'sit' ? 1.15 : 1.72), this.actor.z); }
  /** walk up to the pod and wait there (the first minute) */
  greet(pod: { x: number; z: number }) {
    const dx = this.actor.x - pod.x, dz = this.actor.z - pod.z, d = Math.hypot(dx, dz) || 1;
    const stop = new V(pod.x + (dx / d) * 4.6, 0, pod.z + (dz / d) * 4.6);
    this.actor.full = ''; this.mode = 'greet';
    this.actor.walkTo(stop.x, stop.z, 1.2);
    this.target = { x: pod.x, z: pod.z };
  }
  private target: { x: number; z: number } | null = null;
  /** turn to someone and gesture while a line plays */
  speak(sec: number, gesture: 'talk' | 'nod' | 'point' | 'shrug' | 'think' | 'wave' | 'present' = 'talk') { this.actor.talk(sec); if (Math.random() < 0.7) this.actor.gesture(gesture); }
  faceTo(x: number, z: number) { this.actor.face(x, z); }
  /** back to the fire */
  goHome() { this.mode = 'walk'; this.actor.full = ''; this.actor.walkTo(this.home.x, this.home.z, 1.1); }
  update(dt: number) {
    this.t += dt;
    this.camp.update(dt, this.t);
    const a = this.actor;
    if (this.mode === 'greet' && !a.moving && this.target) { a.face(this.target.x, this.target.z); if (this.t > 0) { a.gesture('wave'); this.target = null; } }
    if (this.mode === 'walk' && !a.moving) { this.mode = 'camp'; const f = this.fireWorld(); a.faceNow(f.x, f.z); a.full = 'sit'; }
    if (this.mode === 'camp' && !this.busy) {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = 9 + Math.random() * 12;
        // tend the fire, stretch, look out at the pod
        const r = Math.random();
        if (r < 0.4) { a.full = ''; a.action = 'cook'; setTimeout(() => { if (this.mode === 'camp') { a.action = ''; a.full = 'sit'; } }, 3500); }
        else if (r < 0.7) { a.full = 'sit'; a.gesture('think'); }
        else { a.full = ''; const p = this.camp0.clone().add(new V((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)); a.walkTo(p.x, p.z, 0.9); this.mode = 'walk'; }
      }
    }
    a.update(dt);
  }
  /** screen-space hit on the body (he is small from the RTS camera) */
  hitTest(mx: number, my: number): boolean {
    const G = anyG(this.g);
    const [sx, sy, ok] = G.screenOf(this.actor.x, this.actor.y + 0.9, this.actor.z);
    if (!ok) return false;
    const [, hy] = G.screenOf(this.actor.x, this.actor.y + 1.8, this.actor.z);
    const r = Math.max(22, Math.abs(sy - hy) * 0.8);
    return Math.abs(mx - sx) < r * 0.6 && Math.abs(my - sy) < r * 1.1;
  }
  dispose() { this.actor.dispose(); this.camp.root.removeFromParent(); this.model.dispose(); }
}

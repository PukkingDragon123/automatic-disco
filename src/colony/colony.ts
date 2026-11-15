// THE COLONY: the landed pod as the player. It owns the pod and what is bolted to it (arms on the hardpoints, drones
// on the pad, structures around it), the two teammates, the vitals and their failure, the tool wheel's slots, the
// alerts, time control and the control modes:
//   rts     the free RTS camera over the colony; click to select, right-click to order
//   arm     an arm under direct control: its tip follows the pointer inside its reach, the left button works its tool
//   drone   a drone steered directly: WASD relative to the camera, the pointer aims, the left button works its tool
//   cannon  the gunner's seat (colony/cannon.ts): the barrel view, the pointer aims, the left button fires
//   place   a structure or attachment being placed
// Orders and control work while the game is paused. game.colony is this object; the API is listed in V6.md.
import * as THREE from 'three';
import type { Game } from '../game/game';
import { buildPod, POD_R, type PodModel } from './podModel';
import { Arm, ARM_DEF, type ArmKind } from './arms';
import { Drone, type DroneKind } from './drones';
import { Structure, FIELD_R, type StructKind } from './structures';
import { Teammate, DEFAULT_CREW, type Job } from './teammates';
import { Vitals, type VitalId, type Level } from './vitals';
import { ToolSlots, TOOLS, type ToolId } from './tools';
import { CATALOG, STARTING_CARGO, type CatId } from './catalog';
import { CannonView } from './cannon';
import { FailScreen, type FailReason } from './failScreen';
import { GOLEM_REF, type Creature } from '../game/creature';
import { ITEMS } from '../factory/items';
import { daylight } from '../game/daylight';
import { sfx } from '../audio/audio';
import { floatText } from '../ui/floatText';
import { vfx2d } from '../game/vfx2d';
import { clamp } from '../core/rand';
import { gbuf } from '../gfx/gbuf';
import { Kit, std } from './kit';

export type { FailReason };
export type Sel = { kind: 'pod' } | { kind: 'arm'; ref: Arm } | { kind: 'drone'; ref: Drone } | { kind: 'crew'; ref: Teammate } | { kind: 'struct'; ref: Structure } | { kind: 'creature'; ref: Creature };
export type Ctl =
  | { k: 'rts' }
  | { k: 'arm'; arm: Arm; tool: ToolId; slot: number }
  | { k: 'drone'; drone: Drone; tool: ToolId | null; slot: number }
  | { k: 'cannon'; arm: Arm; slot: number }
  | { k: 'place'; id: CatId; hp?: number };
export type AlertLevel = 'info' | 'good' | 'warn' | 'bad' | 'crit';
export interface Alert { id: number; text: string; level: AlertLevel; t: number; real: number; at?: THREE.Vector3; key?: string; n: number }

/** the colony's stores: a thin adapter over the factory's central stores (the inventory agent's containers later) */
export class Stock {
  constructor(readonly g: Game) {}
  count(id: string) { return ITEMS[id] ? this.g.factory?.count(id) ?? 0 : 0; }
  /** '' when the colony can pay, else what is missing */
  lack(cost: Record<string, number>) {
    for (const [id, n] of Object.entries(cost)) { if (!ITEMS[id]) continue; if (this.count(id) < n) return `Needs ${n - Math.floor(this.count(id))} more ${ITEMS[id].name}`; }
    return '';
  }
  pay(cost: Record<string, number>) { if (this.lack(cost)) return false; for (const [id, n] of Object.entries(cost)) if (ITEMS[id]) this.g.factory.take(id, n); return true; }
  put(id: string, n: number, x?: number, z?: number) { if (!ITEMS[id] || !this.g.factory) return 0; return this.g.factory.add(id, n, x, z); }
}

/** the pod itself: position, heading, hit points (synced with the core building) */
export class PodBase {
  x: number; z: number; y: number; yaw: number;
  hp = 2400; maxHp = 2400; braced = false;
  readonly model: PodModel; readonly flag = { value: 1 };
  constructor(readonly colony: Colony, x: number, z: number, yaw: number) {
    const g = colony.g;
    this.x = x; this.z = z; this.y = g.region.heightAt(x, z); this.yaw = yaw;
    this.model = buildPod();
    this.model.root.position.set(x, this.y, z); this.model.root.rotation.y = yaw;
    this.model.root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) gbuf(m, this.flag); });
    g.world.scene.add(this.model.root);
    this.model.root.userData.sel = { kind: 'pod' };
  }
  /** a pod-local point to world */
  toWorld(p: THREE.Vector3, out = new THREE.Vector3()) { return out.copy(p).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(new THREE.Vector3(this.x, this.y, this.z)); }
  get door() { return this.toWorld(this.model.rampFoot); }
  damage(n: number) {
    if (this.colony.failed) return;
    this.hp = Math.max(0, this.hp - n * (this.braced ? 0.62 : 1));
    if (n > 4) this.colony.alert('POD HULL HIT', 'bad', new THREE.Vector3(this.x, this.y + 3, this.z), 'pod-hit');
  }
  repair(n: number) { this.hp = Math.min(this.maxHp, this.hp + n); }
}

/** what other systems target as "the player" (factions, predators): the pod, standing still */
class PodTarget {
  constructor(readonly c: Colony) {}
  get x() { return this.c.pod.x; } get z() { return this.c.pod.z; } get y() { return this.c.pod.y; }
  get alive() { return this.c.pod.hp > 0 && !this.c.failed; }
  started = true; radius = POD_R; mass = 40000; invuln = 0;
  hurt(n: number) { this.c.pod.damage(n); }
  headPos() { return new THREE.Vector3(this.c.pod.x, this.c.pod.y + 5, this.c.pod.z); }
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ray = new THREE.Raycaster();
interface Thrown { c: Creature; vx: number; vy: number; vz: number; h: number }
interface Lifted { c: Creature; h: number; by: object }

export class Colony {
  readonly pod: PodBase;
  readonly arms: Arm[] = [];
  readonly drones: Drone[] = [];
  readonly structures: Structure[] = [];
  readonly teammates: Teammate[] = [];
  readonly vitals: Vitals;
  readonly slots: ToolSlots;
  readonly stock: Stock;
  readonly cannon: CannonView;
  sel: Sel | null = null;
  ctl: Ctl = { k: 'rts' };
  readonly alerts: Alert[] = [];
  /** crew lost so far (morale) */
  losses = 0;
  failed: FailReason | null = null;
  /** under player control (false during the landing cinematic) */
  ready = false;
  /** the colony keeps time: sols since landing */
  sol = 1; private solT = 0;
  /** the ship link is open (the hub is up; the colony waits, paused) */
  linkOpen = false;
  private alertSeq = 0;
  private thrown: Thrown[] = []; private lifted: Lifted[] = [];
  private fitting: { id: CatId; t: number; total: number; ref: Arm | Drone | null }[] = [];
  private ghost: THREE.Group | null = null; private ghostId: CatId | null = null;
  private hoverT = 0; hover: Sel | null = null;
  private lmb = false; private useCd = 0;
  readonly target = { x: 0, z: 0, y: 0, ok: false };
  private padsUsed = new Set<number>();
  private saveT = 30;
  readonly fail$: FailScreen;
  private podTarget: PodTarget;
  private keysDown = new Set<string>();
  /** steered drone camera: zoom kept separately */
  private seedlings: { m: THREE.Object3D; t: number }[] = [];

  constructor(readonly g: Game, o: { yaw?: number; restore?: unknown } = {}) {
    const core = g.veyr.core!, L = { x: core.x, z: core.z };
    // the core building keeps its role (hit shape, vision, HQ) but the drop pod model is replaced by the colony pod
    const old = core.mesh.userData.podGroup as THREE.Object3D | undefined; if (old) old.visible = false;
    this.pod = new PodBase(this, L.x, L.z, o.yaw ?? Math.PI / 4);
    this.vitals = new Vitals(this);
    this.slots = new ToolSlots(this);
    this.stock = new Stock(g);
    this.cannon = new CannonView(this);
    this.fail$ = new FailScreen(this);
    this.podTarget = new PodTarget(this);
    GOLEM_REF.g = this.podTarget as never;
    // the starting arm: a manipulator on hardpoint 01
    this.addArm('manipulator', 0);
    // the crew step out of the hatch
    const d = this.pod.door;
    DEFAULT_CREW.forEach((spec, i) => this.teammates.push(new Teammate(this, spec, d.x + (i ? 0.9 : -0.9), d.z + 0.4)));
    if (o.restore) this.restore(o.restore); else for (const [id, n] of Object.entries(STARTING_CARGO)) this.stock.put(id, n);
    // keep held keys for drone steering (the Input class tracks them too, but colony keys must not leak into the camera)
    addEventListener('keyup', this.onKeyUp);
    (window as unknown as { __colony?: Colony }).__colony = this;
  }
  private onKeyUp = (e: KeyboardEvent) => { this.keysDown.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); };

  // ------------------------------------------------------------------ building things
  addArm(kind: ArmKind, hpIndex?: number) {
    const used = new Set(this.arms.map((a) => a.hpt.i));
    const free = this.pod.model.hardpoints.filter((h) => !used.has(h.i));
    const hp = hpIndex !== undefined ? this.pod.model.hardpoints[hpIndex] : free[0];
    if (!hp || used.has(hp.i)) return null;
    const a = new Arm(this, kind, hp);
    a.root.traverse((o) => { o.userData.sel = o.userData.sel ?? undefined; });
    a.root.userData.sel = { kind: 'arm', ref: a };
    this.arms.push(a);
    return a;
  }
  addDrone(kind: DroneKind) {
    let pad = 0; while (this.padsUsed.has(pad)) pad++;
    this.padsUsed.add(pad);
    const d = new Drone(this, kind, pad); this.drones.push(d); return d;
  }
  addStructure(kind: StructKind, x: number, z: number, prebuilt = false) { const s = new Structure(this, kind, x, z, prebuilt); this.structures.push(s); return s; }
  /** where drone pad n is (the landing deck behind the pod) */
  padPos(n: number, out = new THREE.Vector3()) {
    const a = this.pod.yaw + Math.PI + (n - 1) * 0.55, r = POD_R + 2.2 + Math.floor(n / 3) * 1.6;
    out.set(this.pod.x + Math.sin(a) * r, 0, this.pod.z + Math.cos(a) * r);
    out.y = this.g.world.surfaceY(clamp(out.x, 0, this.g.region.N - 0.01), clamp(out.z, 0, this.g.region.N - 0.01));
    return out;
  }
  /** '' when an entry can be built now, else why not */
  canBuild(id: CatId): string {
    const e = CATALOG[id];
    if (e.kind === 'arm' && this.arms.length + this.fitting.filter((f) => CATALOG[f.id].kind === 'arm').length >= this.pod.model.hardpoints.length) return 'Every hardpoint is taken';
    if (e.kind === 'drone' && this.drones.length >= 6) return 'The pad holds six drones';
    if (id === 'limb_brace' && this.pod.braced) return 'Already braced';
    if (id === 'limb_mast' && this.boom) return 'Already fitted';
    return this.stock.lack(e.cost);
  }
  /** build an entry: arms on a free hardpoint, drones on the pad, limbs on the pod; structures go to placement */
  build(id: CatId, at?: { x: number; z: number }): string {
    const why = this.canBuild(id); if (why) { sfx('deny'); return why; }
    const e = CATALOG[id];
    if (e.kind === 'structure') {
      if (!at) { this.setCtl({ k: 'place', id }); return ''; }
      const pw = this.placeWhy(at.x, at.z); if (pw) { sfx('deny'); return pw; }
      this.stock.pay(e.cost);
      const s = this.addStructure(e.struct!, at.x, at.z);
      this.alert(`${s.name}: raising`, 'info', new THREE.Vector3(at.x, s.y + 2, at.z));
      sfx('build'); this.g.emit('placed-structure', { kind: s.kind, x: at.x, z: at.z });
      return '';
    }
    this.stock.pay(e.cost);
    let ref: Arm | Drone | null = null;
    if (e.kind === 'arm') { ref = this.addArm(e.arm!); if (ref) (ref as Arm).hp = 1; }
    else if (e.kind === 'drone') { ref = this.addDrone(e.drone!); (ref as Drone).hp = 1; }
    this.fitting.push({ id, t: 0, total: e.time, ref });
    this.alert(`${e.name}: fitting (${e.time} s)`, 'info');
    sfx('build');
    return '';
  }
  /** fitting progress of an arm or drone (1 = done), for the HUD */
  fitOf(ref: unknown) { const f = this.fitting.find((x) => x.ref === ref); return f ? f.t / f.total : 1; }
  get fits() { return this.fitting; }
  private boom: THREE.Object3D | null = null;
  private finishFit(f: { id: CatId; ref: Arm | Drone | null }) {
    const e = CATALOG[f.id];
    if (f.ref) { f.ref.hp = f.ref.maxHp; }
    if (f.id === 'limb_brace') { this.pod.braced = true; this.pod.maxHp = 2400 * 1.6; this.pod.hp += 2400 * 0.6; this.addBrace(); }
    if (f.id === 'limb_mast') this.addBoom();
    this.alert(`${e.name} ready`, 'good');
    this.g.emit('built-attachment', { kind: f.id });
    sfx('done', 1, 0.7);
  }
  private addBrace() {
    const k = new Kit(), m = std(0x59604a, { rough: 0.55, metal: 0.35 }), st = std(0x9a9d9e, { rough: 0.3, metal: 0.8 });
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2, cx = Math.sin(a), cz = Math.cos(a); k.rod([cx * 2.5, 2.2, cz * 2.5], [cx * 4.2, 0.1, cz * 4.2], 0.11, m, 8); k.box(0.7, 0.12, 0.7, st, { p: [cx * 4.2, 0.06, cz * 4.2] }); k.box(1.4, 1.1, 0.12, m, { p: [cx * 2.78, 1.95, cz * 2.78], r: [0, a, 0] }); }
    const g = k.build('brace'); this.pod.model.root.add(g);
  }
  private addBoom() {
    const k = new Kit(), w = std(0xdcd9cf, { rough: 0.5 }), d = std(0x2b2f33, { rough: 0.5, metal: 0.5 });
    k.cyl(0.08, 0.1, 2.6, w, { p: [1.1, 6.6, 0.4] }, 8); k.box(0.7, 0.2, 0.2, d, { p: [1.1, 7.9, 0.4] }); k.sph(0.16, d, { p: [1.1, 8.1, 0.4] }, 10, 8);
    this.boom = k.build('boom'); this.pod.model.root.add(this.boom);
  }
  /** why a structure cannot stand at (x, z) ('' = it can) */
  placeWhy(x: number, z: number) {
    const R = this.g.region;
    if (x < 3 || z < 3 || x > R.N - 3 || z > R.N - 3) return 'Off the map';
    if (R.isWater(x, z)) return 'Not on water';
    if (Math.hypot(x - this.pod.x, z - this.pod.z) < POD_R + 3.2) return 'Too close to the pod';
    for (const s of this.structures) if (Math.hypot(s.x - x, s.z - z) < s.radius + 1.6) return 'Too close to another structure';
    if (this.signalAt(x, z) < 0.99) return 'Out of control range: build a relay mast';
    const h0 = R.heightAt(x, z); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(R.heightAt(x + dx, z + dz) - h0) > 1.3) return 'Too steep';
    return '';
  }
  // ------------------------------------------------------------------ signal, lamps, light
  /** the control signal at (x, z): 1 inside the pod's or a relay's range, fading to 0 four metres past it */
  signalAt(x: number, z: number) {
    const podR = this.boom ? 34 : 26;
    let best = podR - Math.hypot(x - this.pod.x, z - this.pod.z);
    const relays = this.structures.filter((s) => s.kind === 'relay' && s.done && s.hp > 0);
    const on = new Set<Structure>(); let grew = true;
    while (grew) { grew = false; for (const r of relays) { if (on.has(r)) continue; const reach = Math.hypot(r.x - this.pod.x, r.z - this.pod.z) < podR || [...on].some((o) => Math.hypot(o.x - r.x, o.z - r.z) < 30); if (reach) { on.add(r); grew = true; } } }
    for (const r of on) best = Math.max(best, 30 - Math.hypot(x - r.x, z - r.z));
    return clamp(1 + best / 4, 0, 1);
  }
  get controlRadius() { return this.boom ? 34 : 26; }
  lamps() { return this.structures.filter((s) => s.kind === 'lamp' && s.done).length; }
  daylight() { return clamp((daylight.k - 0.16) / 0.84, 0, 1); }
  /** veyr workers in the field (the creature agent's cyborg workers are veyr creatures) */
  workers() { return this.g.world.creatures.filter((c) => c.faction === 'veyr' && !c.dead); }

  // ------------------------------------------------------------------ alerts
  alert(text: string, level: AlertLevel = 'info', at?: THREE.Vector3, key?: string) {
    const now = this.g.world.time;
    if (key) { const a = this.alerts.find((x) => x.key === key && now - x.t < 20); if (a) { a.n++; a.t = now; a.real = performance.now(); return a; } }
    const a: Alert = { id: ++this.alertSeq, text, level, t: now, real: performance.now(), at: at?.clone(), key, n: 1 };
    this.alerts.unshift(a); if (this.alerts.length > 40) this.alerts.pop();
    if (level === 'crit') sfx('spawn-alarm', 1, 0.6); else if (level === 'bad') sfx('deny', 0.8, 0.5);
    this.g.emit('colony-alert', a);
    return a;
  }
  vitalAlarm(k: VitalId, level: Level) {
    const NAME: Record<VitalId, string> = { power: 'POWER', oxygen: 'OXYGEN', food: 'FOOD', integrity: 'POD INTEGRITY', health: 'CREW HEALTH', morale: 'MORALE' };
    this.alert(`${NAME[k]} ${level === 'crit' ? 'CRITICAL' : 'LOW'}`, level === 'crit' ? 'crit' : 'warn', undefined, 'vital-' + k);
    this.g.emit('alarm', { vital: k, level });
  }

  // ------------------------------------------------------------------ control
  setCtl(c: Ctl) {
    const prev = this.ctl;
    if (prev.k === 'arm') { prev.arm.controlled = false; prev.arm.working = false; prev.arm.target = null; }
    if (prev.k === 'drone') { prev.drone.steering = false; prev.drone.working = false; prev.drone.order = prev.drone.docked ? null : { k: 'move', x: prev.drone.x, z: prev.drone.z }; this.g.cam.followFn(null); }
    if (prev.k === 'cannon') { this.cannon.exit(); prev.arm.controlled = false; prev.arm.target = null; }
    if (prev.k === 'place' && this.ghost) { this.ghost.removeFromParent(); this.ghost = null; this.ghostId = null; }
    this.ctl = c;
    this.slots.active = 'slot' in c ? c.slot : -1;
    if (c.k === 'arm') { c.arm.controlled = true; this.sel = { kind: 'arm', ref: c.arm }; }
    if (c.k === 'drone') { c.drone.steering = true; c.drone.order = null; this.sel = { kind: 'drone', ref: c.drone }; this.g.cam.followFn(() => _v2.set(c.drone.x, 0, c.drone.z)); this.g.cam.distGoal = Math.min(this.g.cam.distGoal, 16); }
    if (c.k === 'cannon') { c.arm.controlled = true; this.sel = { kind: 'arm', ref: c.arm }; this.cannon.enter(c.arm); }
    document.body.classList.toggle('c-target', c.k === 'arm' || c.k === 'drone' || c.k === 'place');
    this.g.emit('colony-control', { k: c.k });
  }
  /** back to the free camera (a message on the HUD says why, if given) */
  release(msg?: string) { if (this.ctl.k !== 'rts') { this.setCtl({ k: 'rts' }); if (msg) this.alert(msg, 'warn'); } }
  /** the camera is not the player's to move (a steered drone, the gunner's seat, a cutscene) */
  get camLocked() { return this.ctl.k === 'drone' || this.ctl.k === 'cannon' || this.fail$.on; }
  /** take direct control of a unit by id ('arm:3', 'drone:2', 'struct:5'), running tool t from wheel slot `slot` */
  control(unit: string, tool: ToolId | null = null, slot = -1): string {
    const [kind, sid] = unit.split(':'), id = Number(sid);
    if (kind === 'arm') {
      const a = this.arms.find((x) => x.id === id); if (!a) return 'No such arm';
      if (this.fitOf(a) < 1) return `${a.name} is still being fitted`;
      if (a.hp <= 0) return `${a.name} is knocked out: weld it first`;
      if (a.kind === 'cannon') { this.setCtl({ k: 'cannon', arm: a, slot }); return ''; }
      const t = tool && TOOLS[tool].arms.includes(a.kind) ? tool : this.defaultTool(a);
      this.setCtl({ k: 'arm', arm: a, tool: t, slot });
      sfx('open', 1.2, 0.5);
      return '';
    }
    if (kind === 'drone') {
      const d = this.drones.find((x) => x.id === id); if (!d) return 'No such drone';
      if (this.fitOf(d) < 1) return `${d.name} is still being assembled`;
      if (d.battery < 5) return `${d.name}: battery flat`;
      const t = tool && TOOLS[tool].drones.includes(d.kind) ? tool : (d.kind === 'scout' ? 'scanner' : d.kind === 'carrier' ? 'carry' : 'weld');
      this.setCtl({ k: 'drone', drone: d, tool: t, slot });
      sfx('open', 1.4, 0.5);
      return '';
    }
    if (kind === 'struct') {
      const s = this.structures.find((x) => x.id === id); if (!s) return 'No such structure';
      this.sel = { kind: 'struct', ref: s };
      if (s.kind === 'gravpole') { s.mode = s.mode === 'lift' ? 'push' : s.mode === 'push' ? 'pull' : s.mode === 'pull' ? 'off' : 'lift'; this.alert(`${s.name}: ${s.mode.toUpperCase()}`, 'info'); }
      if (s.kind === 'sensor') this.scanArea(s.x, s.z, 18, s);
      return '';
    }
    return 'Unknown unit';
  }
  defaultTool(a: Arm): ToolId { return a.kind === 'manipulator' ? 'scanner' : a.kind === 'grabber' ? 'grab' : a.kind === 'drill' ? 'drill' : a.kind === 'welder' ? 'weld' : a.kind === 'gravity' ? 'lift' : 'cannon'; }
  /** the wheel: use slot i (take control of its unit with its tool) */
  useSlot(i: number): string {
    const s = this.slots.slots[i];
    if (!s) return 'No such slot';
    if (s.level <= 0) return 'Slot locked: upgrade it with the Upgrader';
    if (!s.tool) return 'Empty slot: assign a tool';
    if (this.slots.active === i && this.ctl.k !== 'rts') { this.release(); return ''; }
    const u = this.slots.unitOf(i);
    if (!u) return `No unit can run the ${TOOLS[s.tool].name}: build one`;
    const ref = this.unitById(u);
    if (ref && 'level' in ref) (ref as { level: number }).level = s.level;
    return this.control(u, s.tool, i);
  }
  unitById(u: string): Arm | Drone | Structure | null {
    const [k, sid] = u.split(':'), id = Number(sid);
    return k === 'arm' ? this.arms.find((x) => x.id === id) ?? null : k === 'drone' ? this.drones.find((x) => x.id === id) ?? null : k === 'struct' ? this.structures.find((x) => x.id === id) ?? null : null;
  }

  // ------------------------------------------------------------------ input (game.ts routes canvas events here first)
  /** true when the colony took the event */
  pointerDown(e: PointerEvent): boolean {
    if (!this.ready || this.fail$.on) return !!this.fail$.on;
    const c = this.ctl;
    if (c.k === 'cannon') { if (e.button === 0) this.cannon.fire(); else if (e.button === 2) this.release(); return true; }
    if (c.k === 'place') {
      if (e.button === 2) { this.release(); return true; }
      if (e.button === 0) { const g = this.g.groundAt(e.clientX, e.clientY); if (g) { const err = this.build(c.id, { x: g.x, z: g.z }); if (err) this.alert(err, 'warn', undefined, 'place-err'); else if (!e.shiftKey) this.release(); } }
      return true;
    }
    if (c.k === 'arm' || c.k === 'drone') {
      if (e.button === 2) { this.release(); return true; }
      if (e.button === 0) {
        // clicking another arm swaps control to it
        const hit = this.pick(e.clientX, e.clientY);
        if (hit?.kind === 'arm' && c.k === 'arm' && hit.ref !== c.arm) { this.control('arm:' + hit.ref.id); return true; }
        this.lmb = true; this.toolDown(); return true;
      }
      return false;
    }
    if (e.button === 0) {
      const hit = this.pick(e.clientX, e.clientY);
      if (!hit) return false;
      sfx('click', 1, 0.6);
      if (hit.kind === 'arm') { this.control('arm:' + hit.ref.id); return true; }
      this.select(hit);
      if (hit.kind === 'drone' && e.detail >= 2) this.control('drone:' + hit.ref.id);
      return true;
    }
    if (e.button === 2) return this.order(e.clientX, e.clientY, e.shiftKey);
    return false;
  }
  pointerUp(e: PointerEvent) { if (e.button === 0 && this.lmb) { this.lmb = false; this.toolUp(); } }
  select(s: Sel | null) {
    const prevFlag = this.selFlag(this.sel); if (prevFlag) prevFlag.value = 1;
    this.sel = s;
    const f = this.selFlag(s); if (f) f.value = 3;
    this.g.emit('colony-select', s);
  }
  private selFlag(s: Sel | null) { if (!s) return null; return s.kind === 'pod' ? this.pod.flag : s.kind === 'drone' || s.kind === 'crew' || s.kind === 'struct' ? s.ref.flag : null; }
  /** right-click: order the selected drone or teammate */
  private order(mx: number, my: number, queue: boolean) {
    const s = this.sel; if (!s) return false;
    const gp = this.g.groundAt(mx, my); if (!gp) return false;
    if (s.kind === 'drone') {
      const d = s.ref; if (this.fitOf(d) < 1) return true;
      if (this.signalAt(gp.x, gp.z) <= 0.05) { this.alert('Out of signal range', 'warn', undefined, 'sig'); sfx('deny'); return true; }
      d.order = { k: 'move', x: gp.x, z: gp.z }; d.docked = false;
      this.ping(gp, 0x7fd48a); sfx('click', 1.3, 0.5); return true;
    }
    if (s.kind === 'crew') {
      const t = s.ref; if (!t.alive) return true;
      const hit = this.pick(mx, my), cr = this.g.pickCreature(mx, my, (c) => !c.dead && c.faction !== 'veyr');
      let job: Job;
      if (cr) job = { k: 'defend', x: cr.x, z: cr.z, target: cr, label: 'ENGAGING' };
      else if (hit?.kind === 'struct' && !hit.ref.done) job = { k: 'build', x: hit.ref.x, z: hit.ref.z, target: hit.ref };
      else if (hit?.kind === 'struct' || hit?.kind === 'drone') job = hit.ref.hp < hit.ref.maxHp ? { k: 'repair', x: hit.ref.x, z: hit.ref.z, target: hit.ref } : { k: 'inspect', x: hit.ref.x, z: hit.ref.z, target: hit.ref };
      else if (hit?.kind === 'pod') job = this.pod.hp < this.pod.maxHp ? { k: 'repair', x: this.pod.door.x, z: this.pod.door.z, target: this.pod } : { k: 'refill', x: 0, z: 0, label: 'BACK TO THE POD' };
      else job = { k: 'move', x: gp.x, z: gp.z };
      t.order(job, queue);
      this.ping(gp, 0xd9a43a); sfx('click', 1.1, 0.5);
      return true;
    }
    return false;
  }
  private ping(p: THREE.Vector3, col: number) { this.g.fx.burst(p.x, p.y + 0.1, p.z, 8, col, { glow: true, up: 0.8, speed: 1.2, size: 2, life: 0.5 }); }
  /** keys: true when used */
  key(e: KeyboardEvent): boolean {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (this.fail$.on) return true;
    if (!this.ready) { return false; }
    if (k === ' ') { this.g.paused = !this.g.paused; sfx('click', this.g.paused ? 0.7 : 1.2, 0.6); this.g.emit('time', { paused: this.g.paused, speed: this.g.speed }); return true; }
    if ((k === '1' || k === '2' || k === '3') && !e.ctrlKey && !e.altKey) { this.setSpeed(Number(k)); return true; }
    if (k === 'Escape') { if (this.ctl.k !== 'rts') { this.release(); return true; } if (this.sel) { this.select(null); return true; } return false; }
    if (k === 'h' || k === 'Home') { this.g.cam.lookAt(this.pod.x, this.pod.z); return true; }
    if (this.ctl.k === 'drone') { this.keysDown.add(k); if ('wasdrf'.includes(k) || k === 'Shift') return true; }
    if (this.ctl.k === 'arm' && (k === '[' || k === ']')) { this.cycleArmTool(k === ']' ? 1 : -1); return true; }
    if (k === 'Enter' && this.sel?.kind === 'drone') { this.control('drone:' + this.sel.ref.id); return true; }
    return false;
  }
  setSpeed(n: number) { this.g.speed = clamp(n, 1, 3); this.g.paused = false; sfx('click', 0.8 + n * 0.2, 0.5); this.g.emit('time', { paused: false, speed: this.g.speed }); }
  togglePause() { this.g.paused = !this.g.paused; this.g.emit('time', { paused: this.g.paused, speed: this.g.speed }); }
  cycleArmTool(d: number) {
    const c = this.ctl; if (c.k !== 'arm') return;
    const ts = (Object.keys(TOOLS) as ToolId[]).filter((t) => TOOLS[t].arms.includes(c.arm.kind));
    const i = ts.indexOf(c.tool); c.tool = ts[(i + d + ts.length) % ts.length]; sfx('click', 1.5, 0.4);
  }
  /** what is under the pointer: an arm, a drone, a teammate, a structure or the pod */
  pick(mx: number, my: number): Sel | null {
    const cam = this.g.cam.cam;
    _ray.setFromCamera(new THREE.Vector2((mx / innerWidth) * 2 - 1, -(my / innerHeight) * 2 + 1), cam);
    const objs: THREE.Object3D[] = [this.pod.model.root, ...this.drones.map((d) => d.root), ...this.teammates.filter((t) => t.root.visible).map((t) => t.root), ...this.structures.map((s) => s.root)];
    const hits = _ray.intersectObjects(objs, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      if ((h.object as THREE.Mesh).material && ((h.object as THREE.Mesh).material as THREE.Material).transparent && (h.object as THREE.Mesh).material instanceof THREE.ShaderMaterial) continue;
      while (o) { const s = o.userData.sel; if (s) return s.kind === 'pod' ? { kind: 'pod' } : s; if (o.userData.arm) return { kind: 'arm', ref: o.userData.arm }; o = o.parent; }
    }
    // small things: a screen-space test for the crew and drones
    let best: Sel | null = null, bd = 26;
    for (const t of this.teammates) { if (!t.root.visible) continue; const [sx, sy, ok] = this.g.screenOf(t.x, t.y + 1, t.z); const d = Math.hypot(sx - mx, sy - my); if (ok && d < bd) { bd = d; best = { kind: 'crew', ref: t }; } }
    for (const d0 of this.drones) { const [sx, sy, ok] = this.g.screenOf(d0.x, d0.y, d0.z); const d = Math.hypot(sx - mx, sy - my); if (ok && d < bd) { bd = d; best = { kind: 'drone', ref: d0 }; } }
    return best;
  }

  // ------------------------------------------------------------------ tools
  private toolDown() {
    const c = this.ctl;
    if (c.k === 'arm') {
      const a = c.arm, t = c.tool, def = TOOLS[t];
      if (!this.vitals.powerOk) { this.alert('NO POWER for the arm', 'warn', undefined, 'nopw'); sfx('deny'); return; }
      if (def.hold) { a.working = true; return; }
      if (this.useCd > 0) return;
      this.useCd = def.cd / (1 + (a.level - 1) * 0.2);
      const p = a.tip(_v);
      if (t === 'scanner') this.scanAt(p, 2.5 + a.level * 0.5, a.name);
      else if (t === 'sampler') this.sampleAt(p, a.name);
      else if (t === 'seeder') this.seedAt(p);
      else if (t === 'grab') this.grabOrThrow(a);
      this.vitals.spend(def.kw * 0.05);
    } else if (c.k === 'drone') {
      const d = c.drone, t = c.tool; if (!t) return;
      const def = TOOLS[t];
      if (def.hold) { d.working = true; return; }
      if (this.useCd > 0) return;
      this.useCd = def.cd;
      const p = d.tip(_v); p.y = this.g.world.surfaceY(p.x, p.z);
      if (t === 'scanner') this.scanAt(p, 4 + d.level, d.name);
      else if (t === 'sampler') this.sampleAt(p, d.name);
      else if (t === 'seeder') this.seedAt(p);
      else if (t === 'carry') this.hookOrDrop(d);
      d.battery = Math.max(0, d.battery - 1.5);
    }
  }
  private toolUp() {
    const c = this.ctl;
    if (c.k === 'arm') { c.arm.working = false; if (c.tool === 'lift') this.dropLifted(c.arm); }
    if (c.k === 'drone') c.drone.working = false;
  }
  /** a scan sweep at p: the nearest creature, else seams (buried ones too), else the plants */
  scanAt(p: THREE.Vector3, r: number, by: string) {
    const g = this.g;
    let cr: Creature | null = null, bd = r;
    g.world.near(p.x, p.z, r, (c) => { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; cr = c; } });
    this.sweep(p, r, 0x7fd48a);
    sfx('zap', 2.4, 0.3);
    if (cr) {
      const c = cr as Creature;
      floatText(g, c.x, c.y + c.size + 0.6, c.z, `SCANNED: ${c.sp.name.toUpperCase()}`, 'good' as never, { life: 2.4 });
      g.emit('scan', { kind: 'creature', species: c.sp.name, sp: c.sp, creature: c, x: c.x, z: c.z, by });
      this.select({ kind: 'creature', ref: c });
      return;
    }
    const found = g.region.scan(p.x, p.z, r + 3);
    const dep = g.region.deposits.find((d) => d.amount > 0 && Math.hypot(d.x - p.x, d.z - p.z) < d.r + r);
    if (found.length || dep) {
      const d = dep ?? g.region.deposits[found[0]];
      floatText(g, d.x, g.region.heightAt(d.x, d.z) + 1.4, d.z, `SEAM: ${(d.item ?? d.ore ?? d.kind).toString().toUpperCase()} · ${Math.round(d.amount)}`, 'good' as never, { life: 2.6 });
      g.emit('scan', { kind: 'deposit', deposit: d, x: d.x, z: d.z, by, revealed: found.length });
      return;
    }
    let plants = 0; g.world.flora.near?.(p.x, p.z, r, () => { plants++; });
    floatText(g, p.x, p.y + 1, p.z, plants ? `FLORA SURVEYED · ${plants} PLANTS` : 'NOTHING OF NOTE', 'info' as never, { life: 2 });
    g.emit('scan', { kind: plants ? 'flora' : 'ground', n: plants, x: p.x, z: p.z, by });
  }
  /** a sensor mast's or scout's area scan */
  scanArea(x: number, z: number, r: number, by: Structure | Drone) {
    let n = 0; this.g.world.near(x, z, r, (c) => { if (!c.dead && c.faction !== 'veyr') { n++; this.g.emit('scan', { kind: 'creature', species: c.sp.name, sp: c.sp, creature: c, x: c.x, z: c.z, by: by.name, passive: true }); } });
    this.g.region.scan(x, z, r);
    this.sweep(new THREE.Vector3(x, this.g.region.heightAt(x, z), z), r, 0x9ad8ff);
    this.alert(`${by.name}: area scan, ${n} contacts`, 'info');
  }
  private sweep(p: THREE.Vector3, r: number, col: number) {
    const fx = this.g.fx, c = new THREE.Color(col).multiplyScalar(2);
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; fx.glow.emit(p.x, p.y + 0.2, p.z, Math.cos(a) * r * 2, 0.2, Math.sin(a) * r * 2, c, 1, 2.5, 0.5, 0, 2.2); }
  }
  sampleAt(p: THREE.Vector3, by: string) {
    const g = this.g; let cr: Creature | null = null, bd = 2.6;
    g.world.near(p.x, p.z, 2.6, (c) => { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; cr = c; } });
    vfx2d.play('spark', p.x, p.y, p.z, { scale: 0.25, ramp: 'glowTeal' as never, emit: 6, speed: 1.6, vel: [0, 1, 0], grav: 2 });
    sfx('squelch', 1.6, 0.4);
    if (cr) {
      const c = cr as Creature;
      if (!c.dead) { g.world.damage(c, 2, null); c.stunT = Math.max(c.stunT, 0.6); }
      const it = ITEMS['specimen'] ? 'specimen' : c.dead && ITEMS['protein'] ? 'protein' : null;
      if (it) this.stock.put(it, 1, c.x, c.z);
      floatText(g, c.x, c.y + c.size + 0.5, c.z, `SAMPLE: ${c.sp.name.toUpperCase()}`, 'good' as never, { life: 2.2 });
      g.emit('sample', { kind: 'creature', species: c.sp.name, sp: c.sp, x: c.x, z: c.z, by, item: it });
      return;
    }
    let plants = 0; g.world.flora.near?.(p.x, p.z, 2, () => { plants++; });
    if (plants) {
      const it = ITEMS['specimen'] ? 'specimen' : 'fruit';
      if (ITEMS[it]) this.stock.put(it, it === 'fruit' ? 2 : 1, p.x, p.z);
      floatText(g, p.x, p.y + 1, p.z, it === 'fruit' ? '+2 FRUIT · PLANT SAMPLE' : 'PLANT SAMPLE', 'good' as never, { life: 2.2 });
      g.emit('sample', { kind: 'plant', x: p.x, z: p.z, by, item: it });
      return;
    }
    const dep = g.region.depositAt(p.x, p.z, 1.5);
    if (ITEMS['soil']) this.stock.put(dep >= 0 ? (g.region.deposits[dep].item ?? 'ore') : 'soil', 1, p.x, p.z);
    floatText(g, p.x, p.y + 1, p.z, dep >= 0 ? 'ROCK CORE' : 'SOIL CORE', 'info' as never, { life: 2 });
    g.emit('sample', { kind: dep >= 0 ? 'rock' : 'soil', x: p.x, z: p.z, by });
  }
  seedAt(p: THREE.Vector3) {
    const g = this.g;
    if (g.region.isWater(p.x, p.z)) { this.alert('Cannot plant in water', 'warn', undefined, 'seed-w'); return; }
    if (ITEMS['seeds'] && this.stock.count('seeds') < 1) { this.alert('No seeds in the stores', 'warn', undefined, 'seed-n'); return; }
    if (ITEMS['seeds']) this.g.factory.take('seeds', 1);
    const k = new Kit(), stem = std(0x597033, { rough: 0.8 }), leaf = std(0x7f8b3f, { rough: 0.7, side: THREE.DoubleSide });
    k.cyl(0.015, 0.02, 0.3, stem, { p: [0, 0.15, 0] }, 5);
    for (let i = 0; i < 3; i++) k.box(0.16, 0.01, 0.07, leaf, { p: [Math.cos(i * 2.1) * 0.08, 0.28 + i * 0.03, Math.sin(i * 2.1) * 0.08], r: [0, -i * 2.1, 0.4] });
    k.cyl(0.12, 0.14, 0.04, std(0x453624, { rough: 1 }), { p: [0, 0.01, 0] }, 7);
    const m = k.build('seedling'); m.position.set(p.x, g.region.heightAt(p.x, p.z), p.z); m.scale.setScalar(0.3); g.world.scene.add(m);
    this.seedlings.push({ m, t: 0 });
    vfx2d.play('dust', p.x, p.y, p.z, { scale: 0.5, ramp: 'soil' as never });
    sfx('grow', 1.2, 0.6);
    floatText(g, p.x, p.y + 0.8, p.z, 'SEED PLANTED', 'good' as never, { life: 1.8 });
    g.emit('plant-seed', { x: p.x, z: p.z });
  }
  private grabOrThrow(a: Arm) {
    const g = this.g;
    if (a.holding) {
      const c = a.holding; a.holding = null;
      const T = this.target, from = a.tip(_v);
      const dx = T.x - from.x, dz = T.z - from.z, d = Math.max(1, Math.hypot(dx, dz)), tFlight = clamp(d / 12, 0.5, 1.4);
      const vy = (T.y - from.y) / tFlight + 0.5 * 14 * tFlight;
      this.thrown.push({ c, vx: dx / tFlight, vy, vz: dz / tFlight, h: from.y });
      sfx('pulse', 1.4, 0.6); g.cam.shake(0.15, 0.2);
      floatText(g, from.x, from.y + 0.8, from.z, 'THROWN', 'warn' as never, { life: 1.2 });
      return;
    }
    const p = a.tip(_v); let best: Creature | null = null, bd = 2.2 + a.level * 0.4;
    g.world.near(p.x, p.z, bd, (c) => { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd && c.mass < 60 * a.level) { bd = d; best = c; } });
    if (!best) { a.float('NOTHING TO GRAB', 'warn'); sfx('deny', 1, 0.4); return; }
    a.holding = best; (best as Creature).mind = 'held'; (best as Creature).order = null;
    sfx('zap', 0.8, 0.6); a.sparks(8, 'violet');
  }
  private hookOrDrop(d: Drone) {
    const g = this.g;
    if (d.carrying) { const c = d.carrying; d.carrying = null; c.air = 0; c.mind = 'idle'; sfx('hit', 1, 0.5); return; }
    const p = d.tip(_v); let best: Creature | null = null, bd = 2.4;
    g.world.near(p.x, p.z, bd, (c) => { const dd = Math.hypot(c.x - p.x, c.z - p.z); if (dd < bd && c.mass < 45) { bd = dd; best = c; } });
    if (!best) { floatText(g, p.x, p.y, p.z, 'NOTHING TO HOOK', 'warn' as never, { life: 1.2 }); return; }
    d.carrying = best; sfx('hit', 1.4, 0.5);
    this.alert(`${d.name} hooked a ${(best as Creature).sp.name}`, 'info');
  }
  /** a carrier came home with something on the hook */
  deliver(d: Drone) {
    const c = d.carrying; if (!c) return; d.carrying = null; c.air = 0;
    if (c.dead) { const it = ITEMS['biomass'] ? 'biomass' : ITEMS['protein'] ? 'protein' : 'carbon'; this.stock.put(it, Math.max(1, Math.round(c.size * 3))); this.alert(`${d.name} delivered: ${c.sp.name} carcass`, 'good'); c.digest = 0; c.bio = 0; c.mesh.visible = false; }
    else { c.x = this.pod.door.x + 1.5; c.z = this.pod.door.z + 1.5; c.mind = 'idle'; this.g.emit('specimen-delivered', { creature: c, sp: c.sp }); this.alert(`${d.name} delivered a live ${c.sp.name}`, 'good'); }
  }
  private dropLifted(by: object) {
    for (let i = this.lifted.length - 1; i >= 0; i--) { const l = this.lifted[i]; if (l.by !== by) continue; this.thrown.push({ c: l.c, vx: 0, vy: 0, vz: 0, h: l.c.y + l.c.air }); this.lifted.splice(i, 1); }
  }
  /** a gravitation pole's field (or a projector) acting on what is inside */
  fieldTick(s: Structure, dt: number) {
    const g = this.g;
    g.world.near(s.x, s.z, FIELD_R, (c) => {
      if (c.dead && c.digest <= 0) return;
      const dx = c.x - s.x, dz = c.z - s.z, d = Math.hypot(dx, dz) || 0.1;
      if (s.mode === 'lift') {
        let l = this.lifted.find((x) => x.c === c); if (!l) { l = { c, h: 0, by: s }; this.lifted.push(l); }
        l.h = Math.min(2.2, l.h + dt * 1.2); c.air = l.h + Math.sin(g.world.time * 2 + c.id) * 0.1; c.stunT = Math.max(c.stunT, 0.3);
      } else if (s.mode === 'push') { const k = (1 - d / FIELD_R) * 5 * dt; c.x += (dx / d) * k; c.z += (dz / d) * k; c.stunT = Math.max(c.stunT, 0.15); if (c.mind !== 'flee' && !c.dead) { c.mind = 'flee'; c.fleeT = 2; } }
      else if (s.mode === 'pull' && d > 1.2) { const k = Math.min(d - 1.2, 3 * dt); c.x -= (dx / d) * k; c.z -= (dz / d) * k; c.stunT = Math.max(c.stunT, 0.15); }
      c.y = g.world.surfaceY(c.x, c.z);
    });
    // anything that drifted out of a lift field falls
    for (let i = this.lifted.length - 1; i >= 0; i--) { const l = this.lifted[i]; if (l.by === s && (Math.hypot(l.c.x - s.x, l.c.z - s.z) > FIELD_R + 0.5 || s.mode !== 'lift')) { this.thrown.push({ c: l.c, vx: 0, vy: 0, vz: 0, h: l.c.y + l.c.air }); this.lifted.splice(i, 1); } }
  }
  private armWork(a: Arm, t: ToolId, dt: number) {
    const g = this.g, p = a.tip(_v), pw = this.vitals.powerOk;
    if (!pw) { a.working = false; return; }
    const lvl = ToolSlots.mult(a.level);
    if (t === 'drill') {
      const R = g.region, gy = g.world.surfaceY(p.x, p.z);
      if (p.y - gy > 0.9) { if (Math.random() < dt * 4) a.float('BIT NOT ON THE GROUND', 'warn'); return; }
      const di = R.depositAt(p.x, p.z, 1.2), acc = (this as unknown as { drillAcc: number });
      acc.drillAcc = (acc.drillAcc ?? 0) + dt * 0.9 * lvl;
      if (Math.random() < dt * 14) vfx2d.play('dust', p.x, gy + 0.1, p.z, { scale: 0.6, ramp: di >= 0 ? 'rust' as never : 'soil' as never });
      if (Math.random() < dt * 10) a.sparks(3);
      if (Math.random() < dt * 5) sfx('crack', 1.8, 0.15);
      g.cam.shake(0.02, 0.1);
      if (acc.drillAcc >= 1) {
        acc.drillAcc -= 1;
        if (di >= 0) { const d = R.deposits[di], item = d.item ?? (d.kind === 'crystal' ? 'crystal' : 'ore'); d.amount = Math.max(0, d.amount - 1); this.stock.put(item, 1, p.x, p.z); floatText(g, p.x, gy + 1.2, p.z, `+1 ${(ITEMS[item]?.name ?? item).toUpperCase()}`, 'good' as never, { life: 1.4 }); g.emit('drilled', { item, x: p.x, z: p.z }); }
        else { const it = ITEMS['gravel'] ? 'gravel' : ITEMS['rocks'] ? 'rocks' : 'soil'; if (Math.random() < 0.5) { this.stock.put(it, 1, p.x, p.z); floatText(g, p.x, gy + 1.2, p.z, `+1 ${(ITEMS[it]?.name ?? it).toUpperCase()}`, 'info' as never, { life: 1.2 }); } }
      }
    } else if (t === 'weld') {
      const tgt = this.weldTarget(p, 2.2);
      if (Math.random() < dt * 16) vfx2d.play('spark', p.x, p.y, p.z, { scale: 0.22, ramp: 'glowTeal' as never, emit: 3, speed: 3, vel: [0, 1, 0], grav: 8 });
      if (Math.random() < dt * 6) sfx('zap', 2.6, 0.08);
      if (tgt) { tgt.repair(dt * 22 * lvl); if (Math.random() < dt * 2) floatText(g, p.x, p.y + 0.6, p.z, 'WELDING', 'good' as never, { life: 0.8 }); }
    } else if (t === 'lift') {
      const T = this.target, r = 3 * lvl;
      g.world.near(T.x, T.z, r, (c) => { let l = this.lifted.find((x) => x.c === c); if (!l) { l = { c, h: 0, by: a }; this.lifted.push(l); } l.h = Math.min(2.6, l.h + dt * 1.6); c.air = l.h; c.stunT = Math.max(c.stunT, 0.3); c.mind = 'held'; });
      if (Math.random() < dt * 20) { const an = Math.random() * Math.PI * 2, rr = Math.random() * r; g.fx.glow.emit(T.x + Math.cos(an) * rr, T.y + 0.1, T.z + Math.sin(an) * rr, 0, 2.2, 0, new THREE.Color(0x9a8aff).multiplyScalar(2), 1, 2.4, 0.8, 0, 0.5); }
      if (Math.random() < dt * 8) g.fx.arc(a.tip(_v2), new THREE.Vector3(T.x, T.y + 1, T.z), 0.12, 0x9a8aff, 0.2);
    }
  }
  /** the most damaged repairable thing within r of p */
  private weldTarget(p: THREE.Vector3, r: number): { hp: number; maxHp: number; repair(n: number): void } | null {
    let best: { hp: number; maxHp: number; repair(n: number): void } | null = null, bk = 1;
    const consider = (x: number, y: number, z: number, o: { hp: number; maxHp: number; repair(n: number): void }, rr = r) => { if (o.hp >= o.maxHp) return; const d = Math.hypot(p.x - x, p.y - y, p.z - z); if (d < rr && o.hp / o.maxHp < bk) { bk = o.hp / o.maxHp; best = o; } };
    consider(this.pod.x, p.y, this.pod.z, this.pod, POD_R + r);
    for (const a of this.arms) { const q = a.pivot(_v2); consider(q.x, q.y, q.z, a, r + 2); }
    for (const d of this.drones) consider(d.x, d.y, d.z, d);
    for (const s of this.structures) consider(s.x, p.y, s.z, s, r + s.radius);
    return best;
  }

  // ------------------------------------------------------------------ crew
  /** what a teammate should do next when nobody told them */
  pickJob(t: Teammate): Job | null {
    const g = this.g, R = this.controlRadius - 4;
    // defend: something hostile close to the pod or the crew
    let threat: Creature | null = null, td = 13;
    g.world.near(this.pod.x, this.pod.z, 16, (c) => { if (c.dead || c.faction === 'veyr') return; const hostile = c.mind === 'hunt' || c.mind === 'attack' || c.mind === 'stalk' || c.sp.role === 'apex' || c.sp.role === 'stalker'; if (!hostile) return; const d = Math.hypot(c.x - t.x, c.z - t.z); if (d < td) { td = d; threat = c; } });
    if (threat) return { k: 'defend', x: (threat as Creature).x, z: (threat as Creature).z, target: threat, label: 'DEFENDING THE COLONY' };
    const unfinished = this.structures.find((s) => !s.done);
    if (unfinished && (t.role === 'engineer' || Math.random() < 0.5)) return { k: 'build', x: unfinished.x, z: unfinished.z, target: unfinished };
    if (t.role === 'engineer') {
      const hurt = [...this.structures, ...this.drones].filter((x) => x.hp < x.maxHp * 0.85).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) return { k: 'repair', x: hurt.x, z: hurt.z, target: hurt };
      if (this.pod.hp < this.pod.maxHp * 0.85) return { k: 'repair', x: this.pod.door.x, z: this.pod.door.z, target: this.pod, label: 'PATCHING THE HULL' };
      const s = this.structures[Math.floor(Math.random() * Math.max(1, this.structures.length))];
      if (s && Math.random() < 0.4) return { k: 'inspect', x: s.x, z: s.z, target: s };
    }
    if (t.role === 'biologist' && Math.random() < 0.6) {
      // a plant or a creature within the colony's ground
      const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * (R - 6), x = this.pod.x + Math.cos(a) * d, z = this.pod.z + Math.sin(a) * d;
      if (!g.region.isWater(x, z)) return { k: 'sample', x, z, label: 'TAKING SAMPLES' };
    }
    if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2, d = 4.5 + Math.random() * 4; return { k: 'inspect', x: this.pod.x + Math.cos(a) * d, z: this.pod.z + Math.sin(a) * d, label: 'INSPECTING' }; }
    return null;
  }
  inspected(t: Teammate, j: Job) { t.morale = Math.min(100, t.morale + 1); this.g.emit('inspect', { by: t.id, target: j.target, x: j.x, z: j.z }); }
  crewSample(t: Teammate, j: Job) { this.sampleAt(new THREE.Vector3(j.x, this.g.region.heightAt(j.x, j.z), j.z), t.short); }
  teammateDied(t: Teammate) {
    this.losses++;
    this.alert(`${t.name.toUpperCase()} IS DEAD · ${t.causeOfDeath.toUpperCase()}`, 'crit', new THREE.Vector3(t.x, t.y + 1, t.z));
    for (const o of this.teammates) if (o.alive) o.morale = Math.max(0, o.morale - 30);
    this.g.emit('teammate-died', { id: t.id, name: t.name, cause: t.causeOfDeath });
  }
  /** the story agent's staging switch: all crew AI stands down (or resumes) */
  stageTeammates(on: boolean) { for (const t of this.teammates) { if (on) { t.staged = true; t.job = null; t.state = t.alive ? 'scripted' : 'dead'; } else t.release(); } }
  teammate(id: string) { return this.teammates.find((t) => t.id === id) ?? null; }
  droneDown(d: Drone) {
    this.alert(`${d.name} DESTROYED`, 'bad', new THREE.Vector3(d.x, d.y, d.z));
    this.g.fx.burst(d.x, d.y, d.z, 30, 0xffa040, { glow: true, speed: 4, up: 3, size: 3, life: 0.8 });
    vfx2d.play('smoke', d.x, d.y, d.z, { scale: 1 });
    if (this.ctl.k === 'drone' && this.ctl.drone === d) this.release();
    d.dispose(); this.drones.splice(this.drones.indexOf(d), 1); this.padsUsed.delete(d.pad);
    if (this.sel?.kind === 'drone' && this.sel.ref === d) this.select(null);
  }
  structureDown(s: Structure) {
    this.alert(`${s.name} DESTROYED`, 'bad', new THREE.Vector3(s.x, s.y + 2, s.z));
    vfx2d.play('smoke', s.x, s.y + 1, s.z, { scale: 2 }); this.g.fx.burst(s.x, s.y + 1, s.z, 40, 0xffa040, { glow: true, speed: 4, up: 4, size: 3, life: 1 });
    s.dispose(); this.structures.splice(this.structures.indexOf(s), 1);
    if (this.sel?.kind === 'struct' && this.sel.ref === s) this.select(null);
  }

  // ------------------------------------------------------------------ failure, the ship link, saves
  /** the colony is lost: collapse (power, oxygen, food, workers), the pod destroyed, or the mission recalled */
  fail(reason: FailReason, detail?: string) {
    if (this.failed) return;
    this.failed = reason;
    this.release();
    this.g.paused = true;
    this.g.emit('colony-fail', { reason, detail });
    this.fail$.show(reason, detail);
  }
  /** open the ship hub through the AI link (the colony pauses while you are up there) */
  shipLink() {
    if (this.failed || this.linkOpen) return;
    this.release();
    this.save();
    const wasPaused = this.g.paused; this.g.paused = true; this.linkOpen = true;
    sfx('open', 0.8, 0.7);
    this.linkBack = () => { this.linkOpen = false; this.linkBack = null; this.g.paused = wasPaused; this.g.emit('ship-link', { open: false }); };
    this.g.emit('ship-link', { open: true });
    const hooks = this.g.opts.hooks as { openShip?: (g: Game, back: () => void) => void } | undefined;
    if (hooks?.openShip) { hooks.openShip(this.g, () => this.linkBack?.()); return; }
    // the ship agent's hub (src/ship/hub/index.ts: openShipHub(fromPlanet)); it is pushed over this screen and pops
    // back to it (game.resume calls resumed())
    const w = window as unknown as { openShipHub?: (fromPlanet: boolean) => void };
    if (typeof w.openShipHub === 'function') { w.openShipHub(true); return; }
    const mods = Object.values(SHIP_MODS);
    if (!mods.length) { this.alert('SHIP AI LINK: the ship does not answer (no hub on this build)', 'warn'); this.linkBack?.(); return; }
    mods[0]().then((m) => {
      const f = (m as { openShipHub?: (fromPlanet: boolean) => void }).openShipHub;
      if (typeof f === 'function') f(true);
      else { this.alert('SHIP AI LINK: the ship does not answer', 'warn'); this.linkBack?.(); }
    }).catch((e) => { console.error('ship link', e); this.alert('SHIP AI LINK: the ship does not answer', 'warn'); this.linkBack?.(); });
  }
  private linkBack: (() => void) | null = null;
  /** the game screen is back on top (the ship hub popped): close the link */
  resumed() { if (this.linkOpen) this.linkBack?.(); }
  get saveKey() { return `oddworld.colony.${this.g.opts.seed}`; }
  snapshot() {
    const f = this.g.factory as unknown as { inventory?: Record<string, number> };
    return {
      v: 1, t: this.g.world.time, sol: this.sol, day: this.g.world.day, vitals: this.vitals.toJSON(), podHp: this.pod.hp, braced: this.pod.braced, boom: !!this.boom, yaw: this.pod.yaw,
      arms: this.arms.map((a) => ({ kind: a.kind, hp: a.hp, i: a.hpt.i })),
      drones: this.drones.map((d) => ({ kind: d.kind, hp: d.hp, battery: d.battery })),
      structures: this.structures.map((s) => ({ kind: s.kind, x: s.x, z: s.z, hp: s.hp, progress: s.progress, mode: s.mode })),
      crew: this.teammates.map((t) => ({ id: t.id, hp: t.hp, alive: t.alive, x: t.x, z: t.z, suit: t.suit, hunger: t.hunger, fatigue: t.fatigue, morale: t.morale })),
      slots: this.slots.toJSON(), losses: this.losses,
      inv: f.inventory ? Object.fromEntries(Object.entries(f.inventory).filter(([, n]) => n > 0)) : {},
    };
  }
  save() { try { localStorage.setItem(this.saveKey, JSON.stringify(this.snapshot())); this.savedAt = { sol: this.sol, t: this.g.world.time }; } catch { /* storage off */ } }
  savedAt: { sol: number; t: number } | null = null;
  loadSave(): ReturnType<Colony['snapshot']> | null { try { const s = localStorage.getItem(this.saveKey); return s ? JSON.parse(s) : null; } catch { return null; } }
  private restore(d: unknown) {
    const s = d as ReturnType<Colony['snapshot']>; if (!s || s.v !== 1) return;
    this.vitals.load(s.vitals); this.pod.hp = s.podHp; this.sol = s.sol ?? 1; this.losses = s.losses ?? 0;
    if (s.braced) { this.pod.braced = true; this.pod.maxHp = 2400 * 1.6; this.addBrace(); }
    if (s.boom) this.addBoom();
    for (const a of this.arms.slice()) { a.dispose(); } this.arms.length = 0;
    for (const a of s.arms) { const arm = this.addArm(a.kind, a.i); if (arm) arm.hp = a.hp; }
    for (const d0 of s.drones) { const d = this.addDrone(d0.kind); d.hp = d0.hp; d.battery = d0.battery; }
    for (const st of s.structures) { const x = this.addStructure(st.kind, st.x, st.z, st.progress >= 1); x.hp = st.hp; x.progress = st.progress; x.mode = st.mode; }
    for (const c of s.crew) { const t = this.teammate(c.id); if (!t) continue; Object.assign(t, { hp: c.hp, x: c.x, z: c.z, suit: c.suit, hunger: c.hunger, fatigue: c.fatigue, morale: c.morale }); if (!c.alive) { t.alive = false; t.state = 'dead'; t.root.visible = false; } }
    this.slots.load(s.slots);
    const f = this.g.factory as unknown as { inventory?: Record<string, number> };
    if (f.inventory) { for (const k of Object.keys(f.inventory)) f.inventory[k] = 0; for (const [k, n] of Object.entries(s.inv ?? {})) if (ITEMS[k]) f.inventory[k] = n; }
    if (typeof s.day === 'number') this.g.world.day = s.day;
    this.savedAt = { sol: this.sol, t: s.t };
  }

  /** QA and screenshots: finish every fitting now; 'full' also bolts on one of everything and stocks the stores */
  qa(what: 'finish' | 'full' | 'upgrader' = 'finish') {
    if (what === 'full') {
      for (const k of ['grabber', 'drill', 'welder', 'cannon', 'gravity'] as ArmKind[]) if (!this.arms.some((a) => a.kind === k)) this.addArm(k);
      for (const k of ['scout', 'carrier', 'repair'] as DroneKind[]) if (!this.drones.some((d) => d.kind === k)) this.addDrone(k);
      const p = this.pod, a = p.yaw;
      const spots: [StructKind, number, number][] = [['gravpole', a + 1.2, 13], ['relay', a + 2.4, 18], ['lamp', a + 0.5, 9], ['lamp', a - 0.6, 9.5], ['sensor', a - 1.6, 12]];
      for (const [k, an, r] of spots) { const x = p.x + Math.sin(an) * r, z = p.z + Math.cos(an) * r; if (!this.placeWhy(x, z)) this.addStructure(k, x, z, true); }
      for (const [id, n] of Object.entries(STARTING_CARGO)) this.stock.put(id, n * 2);
    }
    if (what === 'upgrader') this.slots.setUpgrader({ ready: () => true, name: 'UPGRADER' });
    for (const f of this.fitting.splice(0)) this.finishFit(f);
  }

  // ------------------------------------------------------------------ the frame
  /** dt: real seconds (camera, servos, UI); simDt: game seconds (0 while paused) */
  update(dt: number, simDt: number) {
    const g = this.g, inp = g.input;
    this.useCd = Math.max(0, this.useCd - dt);
    // the pod: hull damage on the model, beacons, the core building's hit points follow the pod's
    const core = g.veyr.core;
    if (core) { if (core.hp < (this as unknown as { coreHp?: number }).coreHp!) this.pod.damage(((this as unknown as { coreHp: number }).coreHp - core.hp)); core.hp = core.maxHp * (this.pod.hp / this.pod.maxHp); (this as unknown as { coreHp: number }).coreHp = core.hp; }
    const alarm = Object.values(this.vitals.levels).some((l) => l === 'crit') ? 1 : 0;
    this.pod.model.update(g.world.time, dt, { link: this.linkOpen, alarm, power: this.vitals.powerOk ? 1 : 0.15 });
    this.pod.model.setDamage(1 - this.pod.hp / this.pod.maxHp);
    if (simDt > 0 && this.pod.hp < this.pod.maxHp * 0.45 && Math.random() < simDt * 3) g.fx.burst(this.pod.x + (Math.random() - 0.5) * 3, this.pod.y + 3 + Math.random() * 2, this.pod.z + (Math.random() - 0.5) * 3, 2, 0x3a3836, { speed: 0.4, up: 1.6, size: 4, life: 1.8 });
    // the pointer on the ground (arm targets, placement)
    const gp = inp.overCanvas ? g.groundAt(inp.mx, inp.my) : null;
    this.target.ok = !!gp; if (gp) { this.target.x = gp.x; this.target.z = gp.z; this.target.y = gp.y; }
    const c = this.ctl;
    if (c.k === 'arm') {
      const a = c.arm;
      if (gp) { const p = a.clampReach(_v.set(gp.x, 0, gp.z)); p.y = g.world.surfaceY(p.x, p.z) + (c.tool === 'drill' ? 0.2 : c.tool === 'lift' ? 3.2 : 0.7); a.target = (a.target ?? new THREE.Vector3()).copy(p); }
      if (a.working && simDt > 0) this.armWork(a, c.tool, simDt);
      if (a.hp <= 0) this.release(`${a.name} is down`);
    }
    if (c.k === 'drone') {
      const d = c.drone, kd = (k: string) => inp.down(k) || this.keysDown.has(k);
      d.input.x = (kd('d') || kd('ArrowRight') ? 1 : 0) - (kd('a') || kd('ArrowLeft') ? 1 : 0);
      d.input.z = (kd('s') || kd('ArrowDown') ? 1 : 0) - (kd('w') || kd('ArrowUp') ? 1 : 0);
      d.input.up = (kd('r') ? 1 : 0) - (kd('f') ? 1 : 0); d.input.boost = kd('Shift');
      if (gp) d.aimYaw = Math.atan2(gp.x - d.x, gp.z - d.z);
      // the camera: zoom and turn while steering (the RTS controls are off)
      const cam = g.cam; if (inp.wheel) cam.distGoal = clamp(cam.distGoal * Math.pow(1.13, inp.wheel), 6, 40);
      if (inp.down('q')) cam.yawGoal += 1.8 * dt; if (inp.down('e')) cam.yawGoal -= 1.8 * dt;
      if (d.working && simDt > 0 && c.tool === 'weld') { const p = d.tip(_v), t = this.weldTarget(p, 3); if (Math.random() < simDt * 14) vfx2d.play('spark', p.x, p.y, p.z, { scale: 0.2, ramp: 'glowTeal' as never, emit: 2, speed: 2.5, vel: [0, 1, 0], grav: 8 }); if (t) t.repair(simDt * 14 * d.level); }
    }
    if (c.k === 'cannon') this.cannon.update(dt, simDt);
    if (c.k === 'place') this.updateGhost(c.id, gp);
    // units
    for (const a of this.arms) a.update(dt, simDt);
    for (const d of this.drones) d.update(dt, simDt);
    for (const s of this.structures) s.update(dt, simDt);
    for (const t of this.teammates) t.update(dt, simDt);
    // held things follow the grabber's tip
    for (const a of this.arms) if (a.holding) { const cr = a.holding, p = a.tip(_v); if (cr.dead && cr.digest <= 0) { a.holding = null; continue; } cr.x = p.x; cr.z = p.z; cr.y = g.world.surfaceY(cr.x, cr.z); cr.air = Math.max(0.1, p.y - cr.y - cr.size * 0.5); cr.stunT = Math.max(cr.stunT, 0.3); cr.mind = 'held'; }
    for (const l of this.lifted) if (l.by instanceof Arm && !(l.by.working && this.ctl.k === 'arm' && this.ctl.arm === l.by)) this.dropLifted(l.by);
    if (simDt > 0) {
      this.tickThrown(simDt);
      this.vitals.update(simDt);
      this.slots.update(simDt);
      for (let i = this.fitting.length - 1; i >= 0; i--) { const f = this.fitting[i]; f.t += simDt; if (f.ref) f.ref.hp = Math.max(1, f.ref.maxHp * (f.t / f.total) * 0.999); if (f.t >= f.total) { this.fitting.splice(i, 1); this.finishFit(f); } }
      for (const s of this.seedlings) { s.t += simDt; s.m.scale.setScalar(Math.min(1.6, 0.3 + s.t / 40)); }
      this.solT += simDt; const dayLen = (g as unknown as { climate?: { dayLength?: number } }).climate?.dayLength ?? 240; if (this.solT >= dayLen) { this.solT -= dayLen; this.sol++; this.alert(`SOL ${this.sol}`, 'info'); }
      this.saveT -= simDt; if (this.saveT <= 0 && !this.failed) { this.saveT = 60; this.save(); }
      // sensor masts and scouts keep the fog back; the colony's ground is seen
      const ex: [number, number, number][] = [];
      for (const s of this.structures) if (s.done) ex.push([s.x, s.z, s.kind === 'sensor' ? 28 : s.kind === 'relay' ? 10 : 7]);
      for (const d of this.drones) if (!d.docked) ex.push([d.x, d.z, d.kind === 'scout' ? 16 : 10]);
      for (const t of this.teammates) if (t.alive) ex.push([t.x, t.z, 9]);
      ex.push([this.pod.x, this.pod.z, this.boom ? 36 : 22]);
      (g.vision as unknown as { extra: [number, number, number][] }).extra = ex;
    }
    // hover (10 Hz): the pod, units and crew light up under the pointer
    this.hoverT -= dt;
    if (this.hoverT <= 0 && this.ctl.k === 'rts') {
      this.hoverT = 0.1;
      const prev = this.selFlag(this.hover); if (prev && prev.value === 5) prev.value = 1;
      this.hover = inp.overCanvas ? this.pick(inp.mx, inp.my) : null;
      const f = this.selFlag(this.hover); if (f && f.value === 1) f.value = 5;
    }
    this.cannon.tickShells(simDt);
  }
  private tickThrown(dt: number) {
    const g = this.g;
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i], c = t.c;
      t.vy -= 14 * dt; c.x = clamp(c.x + t.vx * dt, 1, g.region.N - 1); c.z = clamp(c.z + t.vz * dt, 1, g.region.N - 1); t.h += t.vy * dt;
      c.y = g.world.surfaceY(c.x, c.z); c.air = Math.max(0, t.h - c.y); c.stunT = Math.max(c.stunT, 0.4);
      if (t.h <= c.y) {
        const v = Math.hypot(t.vx, t.vy, t.vz); c.air = 0; this.thrown.splice(i, 1);
        if (v > 4) { g.world.damage(c, v * 2.2, null); vfx2d.play('dust', c.x, c.y, c.z, { scale: 0.8 + c.size * 0.4 }); sfx('hit', Math.max(0.6, c.size), 0.6); g.cam.shake(0.1, 0.2); }
        if (!c.dead) { c.mind = 'flee'; c.fleeT = 3; }
      }
    }
  }
  private updateGhost(id: CatId, gp: THREE.Vector3 | null) {
    const e = CATALOG[id];
    if (!this.ghost || this.ghostId !== id) {
      this.ghost?.removeFromParent();
      const s = new Structure(this, e.struct!, 0, 0, true); s.root.removeFromParent();
      s.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material) { const mm = (m.material as THREE.Material).clone() as THREE.MeshStandardMaterial; mm.transparent = true; mm.opacity = 0.55; mm.depthWrite = false; gbuf(mm, 0); m.material = mm; m.castShadow = false; } });
      this.ghost = s.root; this.ghostId = id; this.ghost.userData.sel = undefined; this.g.world.scene.add(this.ghost);
    }
    if (!gp) { this.ghost.visible = false; return; }
    this.ghost.visible = true; this.ghost.position.set(gp.x, this.g.region.heightAt(gp.x, gp.z), gp.z);
    const ok = !this.placeWhy(gp.x, gp.z);
    this.ghost.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const mm = m.material as THREE.MeshStandardMaterial; if (mm.emissive) { mm.emissive.set(ok ? 0x2a6a3a : 0x8a2018); mm.emissiveIntensity = 0.8; } } });
  }
  dispose() {
    removeEventListener('keyup', this.onKeyUp);
    this.fail$.dispose(); this.cannon.dispose();
    if (GOLEM_REF.g === (this.podTarget as never)) GOLEM_REF.g = null;
    if ((window as unknown as { __colony?: Colony }).__colony === this) (window as unknown as { __colony?: Colony }).__colony = undefined;
  }
}
/** the ship agent's hub module (src/ship/hub/*.ts exporting openShipHub), if it exists in this build */
const SHIP_MODS = import.meta.glob('../ship/hub/index.ts') as Record<string, () => Promise<unknown>>;
export { ARM_DEF };

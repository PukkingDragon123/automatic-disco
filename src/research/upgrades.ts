// BUILD-TO-UNLOCK. Research gives a BLUEPRINT; the UPGRADER builds it from real items and installs it into the pod,
// an arm socket, a tool slot or the drone bay. Nothing is installed by a menu click alone: the parts come out of
// the colony's stores, the gantry needs power and time, and only then does the pod agent's hook see 'upgrade'.
import type { Game } from '../game/game';
import { resolve, pay, canPay, have, anyG } from './util';

export type Target = 'pod' | 'arm' | 'tool' | 'drone';
export const TARGET_NAME: Record<Target, string> = { pod: 'POD CORE', arm: 'ARM SOCKETS', tool: 'TOOL SLOTS', drone: 'DRONE BAY' };
export interface Blueprint { id: string; name: string; target: Target; icon: string; desc: string; effect: string; items: Record<string, number>; time: number; max: number }
const B = (id: string, name: string, target: Target, icon: string, desc: string, effect: string, items: Record<string, number>, time: number, max = 1): Blueprint =>
  ({ id, name, target, icon, desc, effect, items, time, max });

/** item costs are written with alternatives (first id that exists wins), resolved when read */
const RAW: Blueprint[] = [
  B('pod_plating', 'Pod Plating', 'pod', 'shield', 'Riveted plate over the pod shell.', '+50% pod hull', { 'iron_plate': 20, 'screw': 30, 'rubber|resin': 4 }, 30),
  B('pod_capacitor', 'Capacitor Ring', 'pod', 'capacitor', 'A ring of cells under the hatch.', '+60% pod charge', { 'copper_wire': 24, 'circuit': 4, 'glass': 6 }, 40),
  B('pod_sensor', 'Sensor Mast', 'pod', 'lens', 'A folding mast with a lens head.', 'Scanner reach +50%', { 'glass': 8, 'circuit': 3, 'crystal': 4, 'iron_rod': 6 }, 35),
  B('pod_coolant', 'Coolant Loop', 'pod', 'drop', 'Pipes and a radiator fin round the core.', 'Tools cool twice as fast', { 'iron_rod': 12, 'water': 20, 'rubber|resin': 8, 'motor': 1 }, 45),
  B('arm_socket', 'Arm Socket', 'arm', 'armsocket', 'A new mount ring bolted to the pod.', '+1 arm socket', { 'reinforced_plate|iron_plate': 10, 'gear': 8, 'motor': 2, 'servo|motor': 1 }, 60, 2),
  B('arm_grapple', 'Grapple Arm', 'arm', 'claw', 'A three-finger claw on a hydraulic wrist.', 'Lift creatures, crates, boulders', { 'iron_plate': 8, 'gear': 6, 'iron_rod': 6 }, 30),
  B('arm_cutter', 'Cutter Arm', 'arm', 'log', 'A chain blade and a fibre stripper.', 'Fell trees, cut fibre', { 'iron_plate': 6, 'steel_ingot|iron_ingot': 4, 'gear': 4 }, 30),
  B('arm_drill', 'Drill Arm', 'arm', 'drill', 'A tungsten bit on a torque head.', 'Bore ore from seams in reach', { 'iron_plate': 10, 'steel_ingot|iron_ingot': 6, 'motor': 1 }, 40),
  B('arm_welder', 'Welder Arm', 'arm', 'wrench', 'An arc head and a wire feed.', 'Repair buildings and drones', { 'copper_wire': 16, 'iron_plate': 6, 'circuit': 2 }, 40),
  B('arm_long', 'Long Boom', 'arm', 'telescope', 'Nested boom sections, twice the reach.', 'Arm reach x2 on one socket', { 'steel_beam|iron_rod': 10, 'reinforced_plate|iron_plate': 6, 'servo|motor': 2, 'motor': 2 }, 70),
  B('tool_scanner2', 'Deep Scanner', 'tool', 'sensor', 'A ground-penetrating head for the scan tool.', 'Scans pay 50% more data', { 'circuit': 4, 'crystal': 6, 'copper_wire': 10 }, 40),
  B('tool_tractor', 'Tractor Beam', 'tool', 'arcs', 'A field emitter on the tool mount.', 'Pull items and creatures in', { 'crystal': 8, 'copper_wire': 20, 'circuit': 4, 'motor': 1 }, 50),
  B('tool_repair', 'Repair Spray', 'tool', 'cross', 'A sealant nozzle fed from the stores.', 'Patch buildings from the pod', { 'iron_plate': 8, 'rubber|resin': 6, 'copper_wire': 6 }, 35),
  B('tool_cannon', 'Field Cannon', 'tool', 'blast', 'A breech-loaded heavy gun on the pod.', 'The pod can fire on threats', { 'steel_beam|iron_rod': 12, 'reinforced_plate|iron_plate': 10, 'motor': 2, 'circuit': 4 }, 80),
  B('drone_scout', 'Scout Drone', 'drone', 'drone', 'A light quad-rotor with a scan lens.', '+1 scout drone', { 'iron_plate': 6, 'motor': 1, 'circuit': 2, 'glass': 2 }, 35, 3),
  B('drone_hauler', 'Hauler Drone', 'drone', 'crate', 'A heavy lifter with a cargo hook.', '+1 hauler drone', { 'iron_plate': 10, 'motor': 2, 'circuit': 2, 'rotor|gear': 4 }, 45, 3),
  B('drone_builder', 'Builder Drone', 'drone', 'wrench', 'A drone with a welding head and a parts bin.', '+1 builder drone', { 'reinforced_plate|iron_plate': 8, 'motor': 2, 'servo|motor': 1, 'circuit': 3 }, 55, 3),
  B('drone_bay', 'Drone Bay', 'drone', 'hive', 'Two more berths in the pod.', '+2 drone berths', { 'frame|iron_plate': 4, 'reinforced_plate|iron_plate': 8, 'circuit': 4, 'motor': 2 }, 60),
];
export const BLUEPRINTS = RAW;
export const BLUEPRINT: Record<string, Blueprint> = Object.fromEntries(RAW.map((b) => [b.id, b]));
/** a blueprint's cost in real item ids */
export const costOf = (id: string) => resolve(BLUEPRINT[id]?.items ?? {});

export interface Job { id: string; t: number; time: number; at: number }
export interface UpgraderState { job: Job | null; last: string | null; lastT: number }
type Ev = 'install' | 'job';

export class Upgrades {
  private inst = new Map<string, number>();
  /** gravity poles placed: their fields */
  poles: { x: number; z: number; r: number; b?: unknown }[] = [];
  private fns: Record<string, ((d: any) => void)[]> = {};
  constructor(readonly g: Game | null) {}
  on(ev: Ev, fn: (d: any) => void) { (this.fns[ev] ??= []).push(fn); return () => { const a = this.fns[ev]; const i = a?.indexOf(fn) ?? -1; if (i >= 0) a!.splice(i, 1); }; }
  emit(ev: Ev, d: any) { for (const f of this.fns[ev] ?? []) { try { f(d); } catch (e) { console.error('upgrades', ev, e); } } }
  has(id: string) { return (this.inst.get(id) ?? 0) > 0; }
  /** installs of an id, or the sum over ids starting with a prefix ('drone_') */
  count(idOrPrefix: string) { if (this.inst.has(idOrPrefix)) return this.inst.get(idOrPrefix)!; let n = 0; for (const [k, v] of this.inst) if (k.startsWith(idOrPrefix)) n += v; return n; }
  list() { return [...this.inst.entries()].map(([id, n]) => ({ id, n, def: BLUEPRINT[id] })); }
  /** inside any gravity pole's field (my registered poles and the colony's own gravitation poles) */
  reachAt(x: number, z: number) {
    if (this.poles.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= p.r * p.r)) return true;
    const ss = anyG(this.g!)?.colony?.structures ?? [];
    return ss.some((s: any) => s.kind === 'gravpole' && s.done !== false && (s.x - x) ** 2 + (s.z - z) ** 2 <= (s.r ?? s.radius ?? 14) ** 2);
  }
  /** a working Upgrader exists (built, powered): arms, drones, limbs and slot upgrades need one */
  upgraderReady() { const bs = (anyG(this.g!)?.factory?.buildings ?? []) as any[]; return bs.some((b) => b.kind === 'upgrader' && !b.dead && b.on !== false && (b.sat ?? 1) > 0.15); }

  /** can this blueprint be built at an Upgrader now (null: yes) */
  why(id: string, st?: UpgraderState | null): string | null {
    const bp = BLUEPRINT[id]; if (!bp) return 'Unknown';
    const g = this.g as unknown as Record<string, any>;
    if (g?.research && !g.research.unlocked(id)) return 'Blueprint not researched';
    if (this.count(id) >= bp.max) return bp.max > 1 ? `All ${bp.max} installed` : 'Installed';
    if (st?.job) return 'Upgrader busy';
    if (this.g && !canPay(this.g, costOf(id))) return 'Missing parts';
    return null;
  }
  /** what is missing, as [id, have, need] */
  missing(id: string): [string, number, number][] {
    const c = costOf(id), out: [string, number, number][] = [];
    for (const k in c) { const h = this.g ? have(this.g, k) : 0; if (h < c[k]) out.push([k, h, c[k]]); }
    return out;
  }
  /** take the parts and start the gantry */
  start(st: UpgraderState, id: string): boolean {
    if (this.why(id, st)) return false;
    if (this.g && !pay(this.g, costOf(id))) return false;
    const m = anyG(this.g!)?.mastery;
    st.job = { id, t: 0, time: BLUEPRINT[id].time / Math.max(0.3, m?.mod?.('build.speed') ?? 1), at: 0 };
    this.emit('job', { id, st });
    return true;
  }
  /** install now (the Upgrader's job finishing, story rewards, tests) */
  install(id: string, from?: { x: number; z: number }) {
    const bp = BLUEPRINT[id]; if (!bp) return;
    this.inst.set(id, (this.inst.get(id) ?? 0) + 1);
    const g = anyG(this.g!);
    g?.mastery?.gain?.('robotics', 25 + bp.time * 0.3, 'Installed ' + bp.name);
    this.emit('install', { id, target: bp.target, def: bp, from });
    this.fit(id);
    g?.emit?.('upgrade', { id, target: bp.target, n: this.inst.get(id) });
  }
  /** what an install does on the pod (the colony, when it is there): new arms and drones, hull, charge */
  private fit(id: string) {
    const C = anyG(this.g!)?.colony; if (!C) return;
    const ARM: Record<string, string> = { arm_grapple: 'grabber', arm_cutter: 'manipulator', arm_drill: 'drill', arm_welder: 'welder', tool_cannon: 'cannon', tool_tractor: 'gravity' };
    const DRONE: Record<string, string> = { drone_scout: 'scout', drone_hauler: 'carrier', drone_builder: 'repair' };
    try {
      if (ARM[id]) { const a = C.addArm?.(ARM[id]); if (!a) C.alert?.('No free hardpoint: cut an Arm Socket first', 'warn'); else C.alert?.(`${BLUEPRINT[id].name} installed`, 'good'); }
      else if (DRONE[id]) { C.addDrone?.(DRONE[id]); C.alert?.(`${BLUEPRINT[id].name} on the pad`, 'good'); }
      else if (id === 'pod_plating' && C.pod) { C.pod.maxHp = Math.round((C.pod.maxHp ?? 1000) * 1.5); C.pod.hp = Math.min(C.pod.maxHp, (C.pod.hp ?? 0) * 1.5); C.alert?.('Pod plating installed: hull +50%', 'good'); }
      else if (id === 'pod_capacitor' && C.vitals) { C.vitals.batteryCap = Math.round(C.vitals.batteryCap * 1.6); C.alert?.('Capacitor ring installed: charge +60%', 'good'); }
      else C.alert?.(`${BLUEPRINT[id].name} installed`, 'good');
    } catch (e) { console.error('install on pod', id, e); }
  }
  toJSON() { return { inst: [...this.inst] }; }
  load(d: any) { if (d && Array.isArray(d.inst)) this.inst = new Map(d.inst.filter((e: unknown) => Array.isArray(e) && BLUEPRINT[(e as string[])[0]])); }
}

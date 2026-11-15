// The tool wheel's model: eight SLOTS, each holding a TOOL run by a real unit (an arm, a drone or an emplacement).
// A slot can be re-assigned (which tool, which unit) and UPGRADED (levels 1-3: power, reach, recharge); upgrading a
// slot needs the Upgrader machine (the progression agent registers it with `colony.slots.setUpgrader`). Locked slots
// (level 0) open with the first upgrade.
import type { ArmKind } from './arms';
import type { Colony } from './colony';

export type ToolId = 'scanner' | 'grab' | 'drill' | 'weld' | 'cannon' | 'seeder' | 'sampler' | 'lift' | 'carry';
export interface ToolDef {
  id: ToolId; name: string; icon: string; desc: string;
  /** which units can run it: arm kinds, drone kinds, structure kinds */
  arms: ArmKind[]; drones: ('scout' | 'carrier' | 'repair')[]; structs: ('gravpole' | 'sensor')[];
  /** held down to work (drill, torch, field) vs. one click */
  hold: boolean;
  /** power per second while working, or per use */
  kw: number;
  /** seconds between uses (clicks) */
  cd: number;
}
const T = (d: ToolDef) => d;
export const TOOLS: Record<ToolId, ToolDef> = {
  scanner: T({ id: 'scanner', name: 'Scanner', icon: 't-scanner', desc: 'Sweeps a creature, plant or seam at the tool tip: research data, buried ore.', arms: ['manipulator'], drones: ['scout'], structs: ['sensor'], hold: false, kw: 3, cd: 1.2 }),
  sampler: T({ id: 'sampler', name: 'Sampler', icon: 't-sampler', desc: 'Takes a core, a cutting or a tissue sample: specimens for the lab.', arms: ['manipulator'], drones: ['scout'], structs: [], hold: false, kw: 2, cd: 2.5 }),
  seeder: T({ id: 'seeder', name: 'Seed Planter', icon: 't-seeder', desc: 'Drills a seed pod into the ground where the tip points.', arms: ['manipulator'], drones: ['carrier'], structs: [], hold: false, kw: 2, cd: 2 }),
  grab: T({ id: 'grab', name: 'Gravity Grab', icon: 't-grab', desc: 'Click to seize what is under the tip; click again to throw it where you point.', arms: ['grabber'], drones: ['carrier'], structs: [], hold: false, kw: 10, cd: 0.4 }),
  drill: T({ id: 'drill', name: 'Core Drill', icon: 't-drill', desc: 'Hold to bore the seam or rock under the bit. Ore goes to the stores.', arms: ['drill'], drones: [], structs: [], hold: true, kw: 16, cd: 0 }),
  weld: T({ id: 'weld', name: 'Welder', icon: 't-weld', desc: 'Hold on a damaged machine or the hull to weld it whole.', arms: ['welder'], drones: ['repair'], structs: [], hold: true, kw: 10, cd: 0 }),
  cannon: T({ id: 'cannon', name: 'Mass Driver', icon: 't-cannon', desc: 'Take the gunner\'s seat: aim over the barrel, fire a coil-gun slug.', arms: ['cannon'], drones: [], structs: [], hold: false, kw: 40, cd: 3.5 }),
  lift: T({ id: 'lift', name: 'Lift Field', icon: 't-lift', desc: 'Hold to float everything inside the field; let go to drop it.', arms: ['gravity'], drones: [], structs: ['gravpole'], hold: true, kw: 20, cd: 0 }),
  carry: T({ id: 'carry', name: 'Winch Hook', icon: 't-carry', desc: 'Hook what is under the drone and fly it home to the pod.', arms: [], drones: ['carrier'], structs: [], hold: false, kw: 4, cd: 0.5 }),
};
export const TOOL_ORDER: ToolId[] = ['scanner', 'sampler', 'seeder', 'grab', 'drill', 'weld', 'lift', 'cannon', 'carry'];

export interface Slot { tool: ToolId | null; unit: string | null; level: number; cd: number }
export interface Upgrader { ready(): boolean; name?: string; cost?(slot: number, level: number): Record<string, number> }
export const SLOT_UP_COST = (lvl: number): Record<string, number> => (lvl <= 0 ? { circuit: 4, copper_wire: 12 } : lvl === 1 ? { circuit: 8, servo: 2, copper_wire: 20 } : { circuit: 14, servo: 4, crystal: 6 });

export class ToolSlots {
  readonly slots: Slot[] = [];
  /** the slot in use (its unit is under control) */
  active = -1;
  private upgrader: Upgrader | null = null;
  constructor(readonly colony: Colony) {
    for (let i = 0; i < 8; i++) this.slots.push({ tool: null, unit: null, level: i < 4 ? 1 : 0, cd: 0 });
    this.slots[0].tool = 'scanner'; this.slots[1].tool = 'sampler'; this.slots[2].tool = 'seeder';
  }
  /** the progression agent's Upgrader machine (or null when it is gone) */
  setUpgrader(u: Upgrader | null) { this.upgrader = u; }
  get hasUpgrader() { return !!this.upgrader?.ready(); }
  get upgraderName() { return this.upgrader?.name ?? 'UPGRADER'; }
  /** the units that can run a tool right now: ids like 'arm:3', 'drone:2', 'struct:5' */
  candidates(t: ToolId): { id: string; name: string }[] {
    const d = TOOLS[t], c = this.colony, out: { id: string; name: string }[] = [];
    for (const a of c.arms) if (d.arms.includes(a.kind) && a.hp > 0) out.push({ id: 'arm:' + a.id, name: a.name });
    for (const dr of c.drones) if (d.drones.includes(dr.kind) && dr.hp > 0) out.push({ id: 'drone:' + dr.id, name: dr.name });
    for (const s of c.structures) if (s.done && d.structs.includes(s.kind as never)) out.push({ id: 'struct:' + s.id, name: s.name });
    return out;
  }
  /** the unit a slot will drive: its assigned unit if still there, else the first that can */
  unitOf(i: number): string | null {
    const s = this.slots[i]; if (!s?.tool) return null;
    const cs = this.candidates(s.tool);
    if (s.unit && cs.some((c) => c.id === s.unit)) return s.unit;
    return cs[0]?.id ?? null;
  }
  assign(i: number, tool: ToolId | null, unit: string | null = null) {
    const s = this.slots[i]; if (!s || s.level <= 0) return false;
    s.tool = tool; s.unit = unit; s.cd = 0;
    this.colony.g.emit('slot-assign', { slot: i, tool, unit });
    return true;
  }
  /** why slot i cannot be upgraded now ('' = it can) */
  whyNotUpgrade(i: number): string {
    const s = this.slots[i]; if (!s) return 'No such slot';
    if (s.level >= 3) return 'Fully upgraded';
    if (!this.hasUpgrader) return `Build an ${this.upgraderName} to install slot upgrades`;
    return this.colony.stock.lack(this.costOf(i));
  }
  costOf(i: number) { const s = this.slots[i]; return this.upgrader?.cost?.(i, s.level) ?? SLOT_UP_COST(s.level); }
  upgrade(i: number) {
    const why = this.whyNotUpgrade(i); if (why) return why;
    if (!this.colony.stock.pay(this.costOf(i))) return 'Not enough parts';
    this.slots[i].level++;
    this.colony.g.emit('slot-upgrade', { slot: i, level: this.slots[i].level });
    return '';
  }
  /** power and reach multiplier of a slot */
  static mult(level: number) { return level >= 3 ? 1.75 : level === 2 ? 1.35 : 1; }
  update(dt: number) { for (const s of this.slots) s.cd = Math.max(0, s.cd - dt); }
  toJSON() { return this.slots.map((s) => ({ tool: s.tool, unit: s.unit, level: s.level })); }
  load(d: unknown) { if (!Array.isArray(d)) return; d.forEach((x, i) => { if (this.slots[i] && x && typeof x === 'object') { const o = x as Slot; this.slots[i].tool = (o.tool && TOOLS[o.tool]) ? o.tool : null; this.slots[i].unit = typeof o.unit === 'string' ? o.unit : null; this.slots[i].level = Math.max(0, Math.min(3, Number(o.level) || 0)); } }); }
}

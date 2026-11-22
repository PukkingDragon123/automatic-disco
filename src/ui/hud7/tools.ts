// HUD v7 · TOOL DATA. Which tools the colony owns, the four QUICK SLOTS (the colony's tool slots 0-3), and CUSTOM
// TOOLS built on the bench from parts (head = what it does, core = power, grip = handling, mod = an extra). The tool
// logic stays in src/colony (ToolSlots / useSlot); a custom tool runs through its head's base tool, its part stats
// are kept for the pod agent to apply (`customTools(g)`, event 'tool-custom').
import type { Game } from '../../game/game';
import { TOOLS, TOOL_ORDER, type ToolId } from '../../colony/tools';
import type { PartSlot } from '../kit/models';

type G = Game & Record<string, any>;
export interface PartDef { id: string; slot: PartSlot; name: string; desc?: string; base?: ToolId; power?: number; reach?: number; speed?: number; draw?: number; mass?: number; cost: Record<string, number> }
export const PARTS: Record<PartSlot, PartDef[]> = {
  head: [
    { id: 'lens', slot: 'head', name: 'LENS', desc: 'Emitter dish from the scanner. The tool scans: research data and buried ore at long reach.', base: 'scanner', power: 1, reach: 8, cost: { glass: 2, circuit: 1 } },
    { id: 'bit', slot: 'head', name: 'CORE BIT', desc: 'Twin-flute spinning bit from the core drill. The tool bores rock and ore seams; short reach, heavy.', base: 'drill', power: 3, reach: 2, mass: 2, cost: { steel_beam: 1, iron_rod: 2 } },
    { id: 'claw', slot: 'head', name: 'CLAW', desc: 'Three-finger gravity claw from the grab. The tool seizes a thing and throws it where you point.', base: 'grab', power: 2, reach: 5, mass: 1, cost: { servo: 2, iron_plate: 2 } },
    { id: 'torch', slot: 'head', name: 'TORCH', desc: 'Nozzle and arc from the welder. The tool welds damaged machines and hull plates whole.', base: 'weld', power: 2, reach: 2, cost: { copper_wire: 4, iron_rod: 1 } },
  ],
  core: [
    { id: 'cell', slot: 'core', name: 'CELL', desc: 'Fuel cell with a sight glass. Light and frugal: modest output, quick handling.', power: 1, speed: 1, draw: 2, mass: 1, cost: { circuit: 1, copper_wire: 2 } },
    { id: 'reactor', slot: 'core', name: 'REACTOR', desc: 'Pulsing field core. The most output, but it draws hard and is the heaviest core.', power: 3, speed: 0, draw: 6, mass: 3, cost: { crystal: 2, circuit: 2 } },
    { id: 'motor', slot: 'core', name: 'MOTOR', desc: 'Geared motor train. Balanced output and the best handling of the cores.', power: 2, speed: 2, draw: 4, mass: 2, cost: { motor: 1, gear: 2 } },
  ],
  grip: [
    { id: 'pistol', slot: 'grip', name: 'PISTOL GRIP', desc: 'One-hand pistol grip with a trigger guard. Light and quick to swing.', speed: 1, mass: 0, cost: { iron_plate: 1 } },
    { id: 'brace', slot: 'grip', name: 'BRACE', desc: 'Shoulder brace. Steadier, for more output and reach; slower to turn.', power: 1, reach: 2, speed: -1, mass: 2, cost: { iron_rod: 2, iron_plate: 1 } },
    { id: 'handle', slot: 'grip', name: 'T-HANDLE', desc: 'Two-hand T-handle. The fastest handling; a little less reach.', speed: 2, reach: -1, mass: 1, cost: { iron_rod: 1 } },
  ],
  mod: [
    { id: 'none', slot: 'mod', name: 'NONE', desc: 'Nothing bolted on: no extra draw, no extra mass.', cost: {} },
    { id: 'scope', slot: 'mod', name: 'SCOPE', desc: 'Sweeping lens from the scanner. Adds reach for a little draw.', reach: 4, draw: 1, mass: 1, cost: { glass: 1, iron_rod: 1 } },
    { id: 'tank', slot: 'mod', name: 'TANK', desc: 'Seed hopper refitted as a pressure tank. Adds output; draws more and weighs more.', power: 2, draw: 2, mass: 2, cost: { iron_plate: 2 } },
    { id: 'antenna', slot: 'mod', name: 'ANTENNA', desc: 'Rotating beacon from the winch hook. Adds a lot of reach for little draw.', reach: 6, draw: 1, cost: { copper_wire: 3 } },
  ],
};
export const PART_SLOTS: PartSlot[] = ['head', 'core', 'grip', 'mod'];
/** what each bin is for */
export const SLOT_INFO: Record<PartSlot, { name: string; desc: string }> = {
  head: { name: 'HEAD', desc: 'The working end: it decides what the tool does.' },
  core: { name: 'CORE', desc: 'The power plant: output against power draw and mass.' },
  grip: { name: 'GRIP', desc: 'How it is held: handling, steadiness and reach.' },
  mod: { name: 'MOD', desc: 'An optional add-on bolted on top: reach or output.' },
};
/** the stats spelled out, with units (raw part points x k) */
export const STAT_INFO: Record<keyof Stats, { name: string; short: string; unit: string; k: number; signed?: boolean; desc: string }> = {
  power: { name: 'Output', short: 'OUTPUT', unit: 'kW', k: 5, desc: 'work the head does' },
  reach: { name: 'Reach', short: 'REACH', unit: 'm', k: 1, desc: 'how far from the pod it works' },
  speed: { name: 'Handling', short: 'HANDLING', unit: '', k: 1, signed: true, desc: 'how fast it swings and cycles' },
  draw: { name: 'Power draw', short: 'DRAW', unit: 'kW', k: 1, desc: 'taken from the settlement grid while in use' },
  mass: { name: 'Mass', short: 'MASS', unit: 'kg', k: 1, desc: 'heavier tools are steadier but slower' },
};
/** a stat as text: value with its unit ('+2', '15 kW', '8 m') */
export function statText(k: keyof Stats, v: number): string { const i = STAT_INFO[k], n = v * i.k; return (i.signed && n > 0 ? '+' : '') + n + (i.unit ? ' ' + i.unit : ''); }
export const partOf = (slot: PartSlot, id?: string) => PARTS[slot].find((p) => p.id === id) ?? PARTS[slot][0];
export interface CustomTool { id: string; name: string; parts: Record<PartSlot, string>; base: ToolId; stats: Stats }
export interface Stats { power: number; reach: number; speed: number; draw: number; mass: number }
export function statsOf(parts: Record<PartSlot, string>): Stats {
  const s: Stats = { power: 0, reach: 0, speed: 0, draw: 0, mass: 0 };
  for (const sl of PART_SLOTS) { const p = partOf(sl, parts[sl]); s.power += p.power ?? 0; s.reach += p.reach ?? 0; s.speed += p.speed ?? 0; s.draw += p.draw ?? 0; s.mass += p.mass ?? 0; }
  return s;
}
export function costOf(parts: Record<PartSlot, string>): Record<string, number> {
  const c: Record<string, number> = {};
  for (const sl of PART_SLOTS) for (const [k, n] of Object.entries(partOf(sl, parts[sl]).cost)) c[k] = (c[k] ?? 0) + n;
  return c;
}
const spare: Record<string, unknown> = {};
const flags = (g: G) => ((g.run as { flags?: Record<string, unknown> } | undefined)?.flags ?? spare) as Record<string, unknown>;
export function customTools(g: G): CustomTool[] { const v = flags(g)['tools.custom']; return Array.isArray(v) ? v as CustomTool[] : []; }
export function addCustomTool(g: G, t: CustomTool) { flags(g)['tools.custom'] = [...customTools(g), t]; g.emit?.('tool-custom', { tool: t }); }
/** quick slot i shows a custom tool (its id) instead of the colony slot's own tool */
export function quickCustom(g: G, i: number): CustomTool | null { const q = (flags(g)['tools.quick'] ?? {}) as Record<string, string>; const id = q[i]; return id ? customTools(g).find((t) => t.id === id) ?? null : null; }
export function setQuickCustom(g: G, i: number, id: string | null) { const q = { ...((flags(g)['tools.quick'] ?? {}) as Record<string, string>) }; if (id) q[i] = id; else delete q[i]; flags(g)['tools.quick'] = q; }

/** an arsenal entry: a built-in tool or a custom one */
export interface ArmEntry { key: string; tool: ToolId; custom: CustomTool | null; name: string; owned: boolean }
export function arsenal(g: G): ArmEntry[] {
  const c = g.colony, out: ArmEntry[] = [];
  for (const t of TOOL_ORDER) {
    const owned = !c || (c.slots?.candidates?.(t)?.length ?? 0) > 0 || (c.slots?.slots ?? []).some((s: { tool: ToolId | null }) => s.tool === t);
    out.push({ key: t, tool: t, custom: null, name: TOOLS[t].name.toUpperCase(), owned });
  }
  for (const ct of customTools(g)) out.push({ key: ct.id, tool: ct.base, custom: ct, name: ct.name, owned: true });
  return out;
}
export { TOOLS, TOOL_ORDER, type ToolId };

// The ship's own running state, kept between sessions (localStorage 'oddworld.ship'): how the reactor's output is
// shared out across the decks (engineering), the galley's stores (mess), the pod's assembly (workshop). The rooms'
// function screens read and write it; the hub reads it back (a starved deck dims, the pod stands half built).
export interface ShipState {
  /** share of the reactor's output per system, 0..1 each (the bus caps the total at 1) */
  power: { life: number; lab: number; workshop: number; sensors: number; engines: number };
  /** galley stores */
  supplies: { rations: number; water: number; coffee: number; fresh: number; medical: number };
  /** the pod's assembly, 0..1 (the intro builds it; the workshop can finish it) */
  pod: number;
  day: number;
}
const KEY = 'oddworld.ship';
const DEF: ShipState = {
  power: { life: 0.3, lab: 0.2, workshop: 0.15, sensors: 0.15, engines: 0.2 },
  supplies: { rations: 214, water: 1800, coffee: 38, fresh: 12, medical: 40 },
  pod: 1, day: 412,
};
let st: ShipState | null = null;
const fns = new Set<(s: ShipState) => void>();
export function shipState(): ShipState {
  if (st) return st;
  try { const s = localStorage.getItem(KEY); st = s ? { ...DEF, ...JSON.parse(s) } : structuredClone(DEF); } catch { st = structuredClone(DEF); }
  st!.power = { ...DEF.power, ...st!.power }; st!.supplies = { ...DEF.supplies, ...st!.supplies };
  return st!;
}
export function saveShip() { try { localStorage.setItem(KEY, JSON.stringify(shipState())); } catch { /* storage off */ } for (const f of fns) f(shipState()); }
export function onShip(fn: (s: ShipState) => void) { fns.add(fn); return () => { fns.delete(fn); }; }
export function resetShip() { st = structuredClone(DEF); saveShip(); }
/** set one system's share, taking the difference from the others so the bus stays at 100% */
export function setPower(k: keyof ShipState['power'], v: number) {
  const p = shipState().power; v = Math.max(0.05, Math.min(0.6, v));
  const others = (Object.keys(p) as (keyof ShipState['power'])[]).filter((x) => x !== k);
  const rest = 1 - v, sum = others.reduce((a, x) => a + p[x], 0) || 1;
  for (const x of others) p[x] = Math.max(0.03, (p[x] / sum) * rest);
  p[k] = v; saveShip();
}

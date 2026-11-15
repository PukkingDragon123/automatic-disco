// What each room says about itself, and what using it does: hand-drawn callouts pinned to real things in the 3D
// room (leader lines from a paper tag to the reactor, the tanks, a bunk), and each room's function as a VIGNETTE:
// the camera moves in on the key prop and the room shows its state as callouts on the objects, with a few inked
// stamps to act (the reactor's power bus, the galley's meals and coffee, the pod's assembly, the core's save and
// settings). Text is sparse: icons first.
import * as THREE from 'three';
import type { RoomId } from './layout';
import { shipState, saveShip, setPower, type ShipState } from './shipState';
import { settings, setSettings, type Quality } from '../../settings';

export interface Callout { at: [number, number, number]; icon?: string; title?: string; text: () => string; side?: 'l' | 'r' | 'u' | 'd'; /** a dial whose needle shows 0..1 */ gauge?: () => number }
export interface Stamp { label: string; key?: string; icon?: string; run: () => void; disabled?: () => string | false; hot?: boolean }
export interface Vignette { cam: { pos: THREE.Vector3; look: THREE.Vector3; fov: number }; callouts: Callout[]; stamps: (ctx: VCtx) => Stamp[] }
export interface VCtx { actions: Partial<Record<string, () => any>>; redraw: () => void; game: any }
/** the bridge hologram's state (set by the hub when the scan runs) */
export interface HoloState { phase: string; world: string; diff: number; site: string; danger: number; canDeploy: boolean }
let holoState: () => HoloState | null = () => null;
export const setHoloState = (f: () => HoloState | null) => { holoState = f; };
const hs = () => holoState() ?? { phase: 'off', world: '--', diff: 0, site: '--', danger: 0, canDeploy: false };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** inked pips (an html strip the chrome styles) */
export const pips = (v: number, n = 8) => { const k = Math.round(Math.max(0, Math.min(1, v)) * n); return `<span class="pp">${Array.from({ length: n }, (_, i) => `<i${i < k ? ' class="on"' : ''}></i>`).join('')}</span>`; };

// ------------------------------------------------------------------ the crew (the crew agent's API, when loaded)
let crewApi: any = null;
import('../crew/index').then((m) => { crewApi = (m as any).crew ?? (m as any).default ?? null; }).catch(() => { crewApi = null; });
export const crewMood = () => (crewApi?.mood ? crewApi.mood() as number : 0.72);
const moodShift = (d: number) => { try { crewApi?.moodShift?.(d); } catch { /* the crew may not take it */ } };
function crewNames(): { name: string; role: string; alive: boolean }[] {
  if (crewApi?.ids) return crewApi.ids.map((id: string) => { const m = crewApi.member(id); return { name: String(m.name ?? id).split(' ').slice(-1)[0].toUpperCase(), role: String(m.role ?? m.job ?? '').toUpperCase(), alive: !!m.alive }; });
  return ['SOLANO', 'QUINTERO', 'KOWALCZYK', 'CASTELLANOS', 'BAPTISTE', 'MAMANI', 'ARAUJO', 'KRISTIANSEN'].map((name) => ({ name, role: '', alive: true }));
}

// ------------------------------------------------------------------ the room's own callouts (shown while focused)
export const ROOM_CALLOUTS: Record<RoomId, Callout[]> = {
  bridge: [{ at: [0, 3.0, 18.3], icon: 'i_bridge', title: 'MONITOR', text: () => '5 WORLDS', side: 'u' }, { at: [0, 1.5, 15.5], title: 'HOLO TABLE', text: () => 'SCAN', side: 'l' }],
  lab: [{ at: [4.05, 2.4, 11.45], icon: 'i_lab', title: 'TANKS', text: () => '3 / 3 LIVE', side: 'u' }, { at: [6.5, 1.1, 9.3], title: 'SEQUENCER', text: () => 'IDLE', side: 'r' }],
  medbay: [{ at: [-2.4, 1.0, 7.9], icon: 'i_medbay', title: 'BED A', text: () => 'FREE', side: 'd' }, { at: [-5.3, 1.6, 8.6], title: 'SCANNER', text: () => 'OK', side: 'l' }],
  core: [{ at: [-4.6, 2.0, 4.5], icon: 'i_core', title: 'UNIT 07', text: () => 'ONLINE', side: 'u' }, { at: [-1.8, 1.6, 3.1], title: 'MEMORY', text: () => '96%', side: 'r', gauge: () => 0.96 }],
  quarters: [{ at: [-1.8, 2.2, -3.8], icon: 'i_quarters', title: 'BUNKS', text: () => '8 BERTHS', side: 'u' }, { at: [-4.1, 0.9, -2.6], title: 'MORALE', text: () => pct(crewMood()), side: 'd', gauge: () => crewMood() }],
  workshop: [{ at: [-4.4, 2.4, -10.4], icon: 'i_workshop', title: 'POD', text: () => (shipState().pod >= 1 ? 'READY' : `${pct(shipState().pod)} BUILT`), side: 'u', gauge: () => shipState().pod }, { at: [-1.8, 1.2, -12.6], title: 'BENCH', text: () => '42 / 42', side: 'r' }],
  mess: [{ at: [6.6, 1.4, 2.0], icon: 'i_mess', title: 'GALLEY', text: () => `${Math.round(shipState().supplies.rations)} DAYS`, side: 'u', gauge: () => Math.min(1, shipState().supplies.rations / 300) }, { at: [3.8, 1.0, 3.0], title: 'TABLE', text: () => 'SEATS 6', side: 'd' }],
  cargo: [{ at: [6.5, 2.6, -3.0], icon: 'i_cargo', title: 'RACKS', text: () => '61%', side: 'u', gauge: () => 0.61 }, { at: [5.2, 1.3, -0.5], title: 'SPECIMENS', text: () => '2 SEALED', side: 'r' }],
  engineering: [{ at: [4.1, 3.8, -10.4], icon: 'i_engineering', title: 'REACTOR', text: () => `${Math.round(600 + Math.sin(performance.now() / 1100) * 30)} MW`, side: 'u', gauge: () => 0.3 + (Math.sin(performance.now() / 1100) * 30 + 30) / 60 * 0.6 }, { at: [6.6, 1.4, -12.1], title: 'COOLANT', text: () => 'NOMINAL', side: 'r' }],
};

// ------------------------------------------------------------------ the vignettes (each room's function)
const PW: [keyof ShipState['power'], string, string][] = [['life', 'i_medbay', 'LIFE'], ['lab', 'i_lab', 'LAB'], ['workshop', 'i_workshop', 'SHOP'], ['sensors', 'i_bridge', 'SENSE'], ['engines', 'i_engineering', 'DRIVE']];
export const VIGNETTES: Record<RoomId, Vignette> = {
  bridge: {
    cam: { pos: V(2.1, 2.35, 12.55), look: V(0, 1.42, 15.5), fov: 42 },
    callouts: [
      { at: [0, 1.5, 15.5], title: 'SYSTEM', text: () => 'KEPLER-442' },
      { at: [0, 1.5, 15.5], title: 'WORLD', text: () => hs().world },
      { at: [0, 1.5, 15.5], title: 'DIFFICULTY', text: () => (hs().diff ? `${hs().diff} / 5` : '--'), gauge: () => hs().diff / 5 },
      { at: [0, 1.5, 15.5], title: 'SITE', text: () => hs().site },
      { at: [0, 1.5, 15.5], title: 'DANGER', text: () => (hs().canDeploy ? pct(hs().danger) : '--'), gauge: () => hs().danger },
    ],
    stamps: (c) => [
      { label: 'SCAN', key: 'S', hot: hs().phase === 'off', run: () => c.actions.monitor?.() },
      { label: 'SYSTEM', key: 'Y', disabled: () => (hs().phase === 'world' ? false : 'IN SYSTEM'), run: () => c.actions.holoBack?.() },
      { label: 'DEPLOY', key: 'D', hot: hs().canDeploy, disabled: () => (hs().canDeploy ? false : 'PICK A SITE'), run: () => c.actions.deploy?.() },
    ],
  },
  lab: {
    cam: { pos: V(3.0, 1.9, 7.6), look: V(4.05, 1.25, 11.4), fov: 38 },
    callouts: [{ at: [2.95, 1.2, 11.45], title: 'TANK 1', text: () => 'GRAZER EMBRYO', side: 'l' }, { at: [4.05, 1.7, 11.45], title: 'TANK 2', text: () => 'ROOT CULTURE', side: 'u' }, { at: [5.15, 1.2, 11.45], title: 'TANK 3', text: () => 'SPORE BLOOM', side: 'r' }],
    stamps: (c) => [{ label: 'GENE LAB', key: 'G', icon: 'i_lab', hot: true, run: () => c.actions.lab?.() }, { label: 'R&D', key: 'R', run: () => c.actions.rnd?.() }],
  },
  medbay: {
    cam: { pos: V(-5.4, 2.5, 9.5), look: V(-2.2, 0.9, 9.5), fov: 42 },
    callouts: [{ at: [-2.4, 1.0, 7.9], title: 'BED A', text: () => 'FREE', side: 'l' }, { at: [-2.4, 1.0, 11.1], title: 'BED B', text: () => 'FREE', side: 'r' }, { at: [-1.4, 1.8, 9.5], title: 'CREW', text: () => crewNames().slice(0, 4).map((n) => `${n.name}${n.alive ? '' : ' (LOST)'}`).join(' · '), side: 'u' }, { at: [-1.4, 1.4, 9.5], title: '', text: () => crewNames().slice(4).map((n) => `${n.name}${n.alive ? '' : ' (LOST)'}`).join(' · '), side: 'd' }],
    stamps: (c) => [{ label: 'FULL SCAN', key: 'S', icon: 'i_medbay', run: () => c.actions.scan?.() }],
  },
  core: {
    cam: { pos: V(-2.2, 2.6, 2.4), look: V(-4.6, 1.8, 4.5), fov: 40 },
    callouts: [{ at: [-4.6, 2.0, 4.5], icon: 'i_core', title: 'UNIT 07', text: () => '96%', side: 'r' }],
    stamps: (c) => [
      { label: 'SAVE', key: 'S', run: () => c.actions.save?.() }, { label: 'LOAD', key: 'L', run: () => c.actions.load?.() },
      { label: 'NEW MISSION', key: 'N', run: () => c.actions.newGame?.() }, { label: 'SETTINGS', key: 'O', run: () => c.actions.settings?.() },
      { label: 'TITLE', key: 'T', run: () => c.actions.title?.() },
    ],
  },
  quarters: {
    cam: { pos: V(-5.0, 2.6, -5.0), look: V(-2.4, 1.2, -2.0), fov: 44 },
    callouts: [
      { at: [-1.8, 1.0, -4.85], title: 'BUNKS 1-2', text: () => crewNames().slice(0, 2).map((n) => n.name).join(' · '), side: 'l' },
      { at: [-1.8, 1.0, -2.65], title: 'BUNKS 3-4', text: () => crewNames().slice(2, 4).map((n) => n.name).join(' · '), side: 'u' },
      { at: [-5.9, 1.0, 1.47], title: 'BUNKS 5-6', text: () => crewNames().slice(4, 6).map((n) => n.name).join(' · '), side: 'u' },
      { at: [-3.7, 1.0, 1.47], title: 'BUNKS 7-8', text: () => crewNames().slice(6, 8).map((n) => n.name).join(' · '), side: 'r' },
      { at: [-4.1, 0.8, -2.6], title: 'MORALE', text: () => pct(crewMood()), side: 'd', gauge: () => crewMood() },
    ],
    stamps: (c) => [{ label: 'MOVIE NIGHT', key: 'M', run: () => { moodShift(0.06); c.redraw(); } }, { label: 'REST CYCLE', key: 'R', run: () => { moodShift(0.03); c.redraw(); } }],
  },
  workshop: {
    cam: { pos: V(-6.3, 2.9, -13.1), look: V(-4.4, 1.25, -10.4), fov: 42 },
    callouts: [
      { at: [-4.4, 0.25, -10.4], title: 'SHIELD', text: () => (shipState().pod > 0.55 ? 'FITTED' : 'QUEUED'), side: 'd' },
      { at: [-4.4, 1.5, -9.5], title: 'VISOR', text: () => (shipState().pod > 0.55 ? 'GLAZED' : 'QUEUED'), side: 'r' },
      { at: [-5.3, 0.9, -11.2], title: 'LEGS', text: () => (shipState().pod > 0.72 ? 'FOLDED' : 'QUEUED'), side: 'l' },
      { at: [-4.4, 2.3, -10.4], title: 'POD', text: () => (shipState().pod >= 1 ? 'READY' : pct(shipState().pod)), side: 'u', gauge: () => shipState().pod },
    ],
    stamps: (c) => [{ label: shipState().pod >= 1 ? 'POD READY' : 'ASSEMBLE POD', key: 'A', icon: 'i_workshop', hot: shipState().pod < 1, disabled: () => (shipState().pod >= 1 ? 'DONE' : false), run: () => c.actions.assemble?.() }, { label: 'UPGRADES', key: 'U', run: () => c.actions.upgrades?.() }],
  },
  mess: {
    cam: { pos: V(3.4, 2.3, 0.4), look: V(6.5, 1.1, 2.8), fov: 44 },
    callouts: [
      { at: [6.6, 1.5, 1.4], title: 'RATIONS', text: () => `${Math.round(shipState().supplies.rations)} DAYS`, side: 'l', gauge: () => Math.min(1, shipState().supplies.rations / 300) },
      { at: [6.65, 1.3, 4.2], title: 'COFFEE', text: () => `${shipState().supplies.coffee.toFixed(1)} KG`, side: 'r' },
      { at: [6.55, 1.4, 5.45], title: 'FRESH', text: () => `${shipState().supplies.fresh.toFixed(1)} KG`, side: 'u' },
      { at: [3.8, 0.9, 3.0], title: 'MORALE', text: () => pct(crewMood()), side: 'd', gauge: () => crewMood() },
    ],
    stamps: (c) => {
      const s = shipState().supplies;
      return [
        { label: 'SERVE MEAL', key: 'H', icon: 'i_mess', disabled: () => (s.rations < 1 ? 'NO FOOD' : false), run: () => { s.rations -= 1; s.fresh = Math.max(0, s.fresh - 0.5); moodShift(0.04); saveShip(); c.redraw(); } },
        { label: 'BREW COFFEE', key: 'C', disabled: () => (s.coffee < 0.2 ? 'NO COFFEE' : false), run: () => { s.coffee = Math.max(0, s.coffee - 0.2); moodShift(0.015); saveShip(); c.redraw(); } },
      ];
    },
  },
  cargo: {
    cam: { pos: V(2.6, 2.5, -3.0), look: V(6.4, 1.4, -3.0), fov: 46 },
    callouts: [{ at: [6.5, 2.2, -4.55], title: 'RACK A', text: () => 'RATIONS · SPARES', side: 'l' }, { at: [6.5, 2.2, -1.45], title: 'RACK B', text: () => 'SEEDS · TOOLS', side: 'r' }, { at: [5.2, 1.0, -0.5], icon: 'i_cargo', title: 'SPECIMENS', text: () => '2 SEALED', side: 'd' }],
    stamps: (c) => [{ label: 'OPEN POD HOLD', key: 'H', icon: 'i_cargo', disabled: () => (c.actions.hold ? false : 'ON THE SURFACE'), run: () => c.actions.hold?.() }],
  },
  engineering: {
    cam: { pos: V(1.6, 3.0, -6.8), look: V(4.1, 1.9, -10.4), fov: 42 },
    callouts: [{ at: [4.1, 3.8, -10.4], title: 'CORE', text: () => `${Math.round(600 + Math.sin(performance.now() / 1100) * 30)} MW`, side: 'u', gauge: () => 0.3 + (Math.sin(performance.now() / 1100) * 30 + 30) / 60 * 0.6 }, { at: [6.6, 1.4, -12.1], title: 'COOLANT', text: () => '412 K', side: 'r', gauge: () => 0.45 }],
    stamps: (c) => {
      const p = shipState().power;
      const out: Stamp[] = [];
      for (const [k, icon, name] of PW) {
        out.push({ label: `${name} ${Math.round(p[k] * 100)}%`, icon, run: () => { setPower(k, p[k] + 0.05); c.redraw(); } });
      }
      out.push({ label: 'BALANCE', key: 'B', run: () => { Object.assign(p, { life: 0.3, lab: 0.2, workshop: 0.15, sensors: 0.15, engines: 0.2 }); saveShip(); c.redraw(); } });
      return out;
    },
  },
};

/** the settings card (the AI core's SETTINGS stamp): quality, volume, shake */
export function settingsStamps(redraw: () => void): Stamp[] {
  const q = (v: Quality, l: string): Stamp => ({ label: (settings.quality === v ? '[X] ' : '[ ] ') + l, run: () => { setSettings({ quality: v }); redraw(); } });
  return [q('low', 'LOW'), q('medium', 'MEDIUM'), q('high', 'HIGH'),
    { label: `VOLUME ${pips(settings.master, 6)}`, run: () => { setSettings({ master: settings.master >= 1 ? 0 : Math.min(1, settings.master + 0.2) }); redraw(); } },
    { label: `SHAKE ${settings.shake ? 'ON' : 'OFF'}`, run: () => { setSettings({ shake: !settings.shake }); redraw(); } }];
}

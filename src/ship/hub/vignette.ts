// What each room says about itself, and what using it does: hand-drawn callouts pinned to real things in the 3D
// room (leader lines from a paper tag to the reactor, the tanks, a bunk), and each room's function as a VIGNETTE:
// the camera moves in on the key prop and the room shows its state as callouts on the objects, with a few inked
// stamps to act (the reactor's power bus, the galley's meals and coffee, the pod's assembly, the core's save and
// settings). Text is sparse: icons first.
import * as THREE from 'three';
import type { RoomId } from './layout';
import { shipState, saveShip, setPower, type ShipState } from './shipState';
import { settings, setSettings, type Quality } from '../../settings';

export interface Callout { at: [number, number, number]; icon?: string; title?: string; text: () => string; side?: 'l' | 'r' | 'u' | 'd' }
export interface Stamp { label: string; key?: string; icon?: string; run: () => void; disabled?: () => string | false; hot?: boolean }
export interface Vignette { cam: { pos: THREE.Vector3; look: THREE.Vector3; fov: number }; callouts: Callout[]; stamps: (ctx: VCtx) => Stamp[] }
export interface VCtx { actions: Partial<Record<string, () => void>>; redraw: () => void; game: any }

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
  bridge: [{ at: [0, 3.0, 26.6], icon: 'i_bridge', title: 'MAIN MONITOR', text: () => '5 WORLDS IN RANGE' }, { at: [0, 1.6, 22.2], icon: 'i_bridge', title: 'HOLO TABLE', text: () => 'CLICK TO SCAN' }],
  lab: [{ at: [5.6, 2.4, 16.4], icon: 'i_lab', title: 'TANKS', text: () => '3 / 3 LIVE' }, { at: [9.3, 1.1, 11.4], title: 'SEQUENCER', text: () => 'IDLE' }],
  medbay: [{ at: [-2.6, 1.0, 10.7], icon: 'i_medbay', title: 'BED A', text: () => 'FREE' }, { at: [-7.4, 1.6, 14.4], title: 'SCANNER', text: () => 'CALIBRATED' }],
  core: [{ at: [-6.2, 2.0, 4.6], icon: 'i_core', title: 'UNIT 07', text: () => 'ONLINE' }, { at: [-2.4, 1.6, 2.4], title: 'MEMORY', text: () => '96.1%' }],
  quarters: [{ at: [-2.0, 2.2, -9.0], icon: 'i_quarters', title: 'BUNKS', text: () => '8 BERTHS' }, { at: [-6.6, 0.9, -6.2], title: 'MORALE', text: () => pct(crewMood()) }],
  workshop: [{ at: [-6.0, 2.4, -19.8], icon: 'i_workshop', title: 'POD', text: () => (shipState().pod >= 1 ? 'READY' : `${pct(shipState().pod)} BUILT`) }, { at: [-1.9, 1.2, -22.8], title: 'BENCH', text: () => '42 / 42 TOOLS' }],
  mess: [{ at: [9.3, 1.4, -0.4], icon: 'i_mess', title: 'GALLEY', text: () => `${Math.round(shipState().supplies.rations)} DAYS FOOD` }, { at: [5.2, 1.0, 1.5], title: 'TABLE', text: () => 'SEATS 6' }],
  cargo: [{ at: [9.2, 2.6, -10.6], icon: 'i_cargo', title: 'RACKS', text: () => '61% FULL' }, { at: [7.0, 1.3, -5.0], title: 'SPECIMENS', text: () => '2 SEALED' }],
  engineering: [{ at: [6.2, 3.8, -21.6], icon: 'i_engineering', title: 'REACTOR', text: () => `${Math.round(600 + Math.sin(performance.now() / 1100) * 30)} MW` }, { at: [9.4, 1.4, -24.0], title: 'COOLANT', text: () => 'NOMINAL' }],
};

// ------------------------------------------------------------------ the vignettes (each room's function)
const PW: [keyof ShipState['power'], string, string][] = [['life', 'i_medbay', 'LIFE'], ['lab', 'i_lab', 'LAB'], ['workshop', 'i_workshop', 'SHOP'], ['sensors', 'i_bridge', 'SENSE'], ['engines', 'i_engineering', 'DRIVE']];
export const VIGNETTES: Record<RoomId, Vignette> = {
  bridge: {
    cam: { pos: V(3.4, 2.7, 19.4), look: V(0, 1.35, 22.4), fov: 34 },
    callouts: [{ at: [0, 1.6, 22.2], icon: 'i_bridge', title: 'KEPLER-442', text: () => '5 WORLDS · 1 RECOMMENDED', side: 'r' }, { at: [0, 2.6, 26.6], title: 'MONITOR', text: () => 'LONG RANGE SCAN READY', side: 'u' }],
    stamps: (c) => [{ label: 'SCAN THE SYSTEM', key: 'S', icon: 'i_bridge', hot: true, run: () => c.actions.monitor?.() }],
  },
  lab: {
    cam: { pos: V(3.1, 1.9, 12.6), look: V(5.6, 1.25, 16.3), fov: 36 },
    callouts: [{ at: [4.4, 1.2, 16.4], title: 'TANK 1', text: () => 'GRAZER EMBRYO', side: 'l' }, { at: [5.6, 1.6, 16.4], title: 'TANK 2', text: () => 'ROOT CULTURE', side: 'u' }, { at: [6.8, 1.2, 16.4], title: 'TANK 3', text: () => 'SPORE BLOOM', side: 'r' }],
    stamps: (c) => [{ label: 'OPEN GENE LAB', key: 'G', icon: 'i_lab', hot: true, run: () => c.actions.lab?.() }],
  },
  medbay: {
    cam: { pos: V(-6.4, 2.4, 12.9), look: V(-2.6, 0.9, 12.9), fov: 38 },
    callouts: [{ at: [-2.6, 1.0, 10.7], title: 'BED A', text: () => 'FREE', side: 'l' }, { at: [-2.6, 1.0, 15.2], title: 'BED B', text: () => 'FREE', side: 'r' }, { at: [-1.6, 1.8, 13.0], title: 'CREW', text: () => crewNames().slice(0, 4).map((n) => `${n.name}${n.alive ? '' : ' (LOST)'}`).join(' · '), side: 'u' }, { at: [-1.6, 1.4, 13.0], title: '', text: () => crewNames().slice(4).map((n) => `${n.name}${n.alive ? '' : ' (LOST)'}`).join(' · '), side: 'd' }],
    stamps: (c) => [{ label: 'FULL SCAN', key: 'S', icon: 'i_medbay', run: () => c.actions.scan?.() }],
  },
  core: {
    cam: { pos: V(-3.1, 2.7, 2.2), look: V(-6.2, 1.8, 4.6), fov: 36 },
    callouts: [{ at: [-6.2, 2.0, 4.6], icon: 'i_core', title: 'UNIT 07', text: () => 'MEMORY 96% · UPLINK LOCKED', side: 'r' }],
    stamps: (c) => [
      { label: 'SAVE', key: 'S', run: () => c.actions.save?.() }, { label: 'LOAD', key: 'L', run: () => c.actions.load?.() },
      { label: 'NEW MISSION', key: 'N', run: () => c.actions.newGame?.() }, { label: 'SETTINGS', key: 'O', run: () => c.actions.settings?.() },
      { label: 'TITLE', key: 'T', run: () => c.actions.title?.() },
    ],
  },
  quarters: {
    cam: { pos: V(-5.6, 2.5, -6.4), look: V(-2.0, 1.2, -6.0), fov: 40 },
    callouts: [
      { at: [-2.0, 1.0, -10.7], title: 'BUNKS 1-2', text: () => crewNames().slice(0, 2).map((n) => n.name).join(' · '), side: 'l' },
      { at: [-2.0, 1.0, -8.3], title: 'BUNKS 3-4', text: () => crewNames().slice(2, 4).map((n) => n.name).join(' · '), side: 'u' },
      { at: [-2.0, 1.0, -3.3], title: 'BUNKS 5-6', text: () => crewNames().slice(4, 6).map((n) => n.name).join(' · '), side: 'u' },
      { at: [-2.0, 1.0, -0.9], title: 'BUNKS 7-8', text: () => crewNames().slice(6, 8).map((n) => n.name).join(' · '), side: 'r' },
      { at: [-6.6, 0.8, -6.2], icon: 'i_quarters', title: 'MORALE', text: () => `${pips(crewMood())} ${pct(crewMood())}`, side: 'd' },
    ],
    stamps: (c) => [{ label: 'MOVIE NIGHT', key: 'M', run: () => { moodShift(0.06); c.redraw(); } }, { label: 'REST CYCLE', key: 'R', run: () => { moodShift(0.03); c.redraw(); } }],
  },
  workshop: {
    cam: { pos: V(-9.6, 3.1, -24.3), look: V(-6.0, 1.2, -19.8), fov: 34 },
    callouts: [
      { at: [-6.0, 0.25, -19.8], title: 'SHIELD', text: () => (shipState().pod > 0.55 ? 'FITTED' : 'QUEUED'), side: 'd' },
      { at: [-6.0, 1.5, -18.9], title: 'VISOR', text: () => (shipState().pod > 0.55 ? 'GLAZED' : 'QUEUED'), side: 'r' },
      { at: [-6.9, 0.9, -20.6], title: 'LEGS', text: () => (shipState().pod > 0.72 ? 'FOLDED' : 'QUEUED'), side: 'l' },
      { at: [-6.0, 2.3, -19.8], icon: 'i_workshop', title: 'POD', text: () => (shipState().pod >= 1 ? 'READY TO FLY' : `${pct(shipState().pod)} ASSEMBLED`), side: 'u' },
    ],
    stamps: (c) => [{ label: shipState().pod >= 1 ? 'POD READY' : 'ASSEMBLE POD', key: 'A', icon: 'i_workshop', hot: shipState().pod < 1, disabled: () => (shipState().pod >= 1 ? 'DONE' : false), run: () => c.actions.assemble?.() }, { label: 'UPGRADES', key: 'U', run: () => c.actions.upgrades?.() }],
  },
  mess: {
    cam: { pos: V(5.6, 2.2, -0.6), look: V(9.2, 1.1, 0.4), fov: 40 },
    callouts: [
      { at: [9.3, 1.5, -2.0], title: 'RATIONS', text: () => `${Math.round(shipState().supplies.rations)} DAYS`, side: 'l' },
      { at: [9.4, 1.3, 3.1], title: 'COFFEE', text: () => `${shipState().supplies.coffee.toFixed(1)} KG`, side: 'r' },
      { at: [9.2, 1.4, 4.75], title: 'FRESH', text: () => `${shipState().supplies.fresh.toFixed(1)} KG`, side: 'u' },
      { at: [5.2, 0.9, 1.5], icon: 'i_mess', title: 'MORALE', text: () => `${pips(crewMood())}`, side: 'd' },
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
    cam: { pos: V(4.6, 2.4, -10.4), look: V(9.2, 1.4, -10.6), fov: 40 },
    callouts: [{ at: [9.2, 2.2, -12.6], title: 'RACK A', text: () => 'RATIONS · SPARES', side: 'l' }, { at: [9.2, 2.2, -8.6], title: 'RACK B', text: () => 'SEEDS · TOOLS', side: 'r' }, { at: [7.0, 1.0, -5.0], icon: 'i_cargo', title: 'SPECIMENS', text: () => '2 SEALED', side: 'd' }],
    stamps: (c) => [{ label: 'OPEN POD HOLD', key: 'H', icon: 'i_cargo', disabled: () => (c.actions.hold ? false : 'ON THE SURFACE'), run: () => c.actions.hold?.() }],
  },
  engineering: {
    cam: { pos: V(2.7, 3.1, -17.2), look: V(6.2, 1.9, -21.6), fov: 38 },
    callouts: [{ at: [6.2, 3.9, -21.6], icon: 'i_engineering', title: 'CORE', text: () => `${Math.round(600 + Math.sin(performance.now() / 1100) * 30)} MW`, side: 'u' }, { at: [9.4, 1.4, -24.0], title: 'COOLANT', text: () => 'NOMINAL', side: 'r' }],
    stamps: (c) => {
      const p = shipState().power;
      const out: Stamp[] = [];
      for (const [k, icon, name] of PW) {
        out.push({ label: `${name} ${pips(p[k] / 0.6, 6)}`, icon, run: () => { setPower(k, p[k] + 0.05); c.redraw(); } });
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

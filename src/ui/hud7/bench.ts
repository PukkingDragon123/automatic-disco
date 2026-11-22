// HUD v7 · THE WORKSHOP (custom tools; from the arsenal's BENCH, or B in it). The user: "make it like the workshop on
// the space ship". So this IS the ship's workshop: the SHIP HUB (src/ship/hub, the ship agent's) is opened over the
// paused game on its WORKSHOP + HANGAR room, in the hub's own isometric cutaway with its packed props, Limbophobia
// furniture, posters, cables, the pod on its cradle, the crane and the room's lamps, rendered by the game's own
// pipeline. The fabrication rig stands on the room's LIMBOPHOBIA WORKBENCH (its vice and hand tools put away):
//   - the JIG: a machined base plate, a turntable and two sliding jaws holding the tool being built;
//   - a bench GANTRY: two yellow uprights, a beam, a trolley with a hoist and a three-finger claw;
//   - a parts TRAY at the bench's end, where the picked part lands before the claw takes it;
//   - a WELDING ARM bolted to the bench (base, shoulder, elbow, torch) with its own hot light.
// Every part is a real component of the TOOL MODELS agent's detailed tools (parts3d.ts: the scanner's dish, the
// drill's bit and gear train, the grab's claws and core, the welder's nozzle and fuel cell...).
// The 2D layer is the kit's detailed boxes (src/ui/kit/panel.ts): a PARTS panel (category keys, the parts in item
// slots), a SPECS panel (LED readouts, the bill of materials in slots), the FORGE and BACK floating icons.
// Pick a part: it drops into the tray, the gantry runs over, the claw takes it to the jig, the jaws open, it goes on,
// the jaws lock with sparks and a clunk. FORGE: the arm welds (sparks, a hot flickering light), it cools (steam),
// the jaws open and the finished tool rises and spins with its parts working.
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { ShipHub } from '../../ship/hub/hub';
import { matMaterial } from '../../gfx/mat';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import { toon } from '../kit/model3d';
import { tex } from '../kit/tex3d';
import { P } from '../kit/px';
import { uiSfx } from '../kit/sound';
import { tween, ease, burst, placeDust, shake, pop, floatUp, wait } from '../kit/juice';
import { transition } from '../kit/transitions';
import { floatIcon } from '../kit/floatIcon';
import { installKitStyle } from '../kit/style';
import { panel, slotGrid, meter, pkey, slot, section, para, kv, status, keyHint, bindTip, type Panel, type Slot, type Meter, type PKey, type Status, type TipContent } from '../kit/panel';
import { itemIcon, ITEMS } from '../../factory/items';
import type { PartSlot } from '../kit/models';
import { PARTS, PART_SLOTS, SLOT_INFO, STAT_INFO, statText, partOf, statsOf, costOf, addCustomTool, customTools, TOOLS, type Stats, type PartDef } from './tools';
const STAT_KEYS: (keyof Stats)[] = ['power', 'reach', 'speed', 'draw', 'mass'];
import { customModel, partModel, partIcon, fitVisible } from './parts3d';
import type { ToolWidget } from './toolWidget';

type G = Game & Record<string, any>;
type V3 = [number, number, number];
const PI = Math.PI;
const STATS: { k: keyof Stats; name: string; max: number; col: 'amber' | 'teal' | 'green' | 'red' | 'white'; off?: number }[] = [
  { k: 'power', name: 'PWR', max: 8, col: 'amber' }, { k: 'reach', name: 'RCH', max: 14, col: 'teal' }, { k: 'speed', name: 'SPD', max: 5, col: 'green', off: 2 },
  { k: 'draw', name: 'KW', max: 10, col: 'red' }, { k: 'mass', name: 'KG', max: 8, col: 'white' },
];
// the room's workbench (src/ship/hub/rooms.ts: LIMBOPHOBIA's 'workbench' at x -1.78, z -12.6, turned to face -x; its
// top at 0.9 m, 2 m along z, 1 m deep)
const TOP = 0.9, BX = -1.84, JZ = -12.42, TRAY: V3 = [-1.9, TOP, -13.06];
/** the weld arm's yaw that points its reach (local -z) from its base at the jig */
const WY = Math.atan2(-(BX - -1.52), -(JZ - -11.86));
const viewDir = (az: number, el: number) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
const camAt = (look: V3, d: number, az = -2.02, el = 0.6, fov = 30) => { const l = new THREE.Vector3(...look); return { pos: l.clone().addScaledVector(viewDir(az, el), d), look: l, fov }; };
const CAM = { home: () => camAt([-2.2, 0.95, -12.75], 6.6, -2.12, 0.7), fit: () => camAt([-1.95, 1.1, -12.7], 4.6, -2.1, 0.64), forge: () => camAt([-1.95, 1.0, -12.4], 4.8, -1.98, 0.62, 28), reveal: () => camAt([-1.95, 1.15, -12.5], 4.4, -2.05, 0.56, 27) };

// ------------------------------------------------------------------ materials (library, through the game's G-buffer)
const mats = new Map<string, THREE.Material>();
const L = (name: string, o: { color?: number; emissive?: number; hd?: 1 | 2 } = {}) => { const k = name + '|' + (o.color ?? '') + '|' + (o.emissive ?? ''); let m = mats.get(k); if (!m) { m = matMaterial(name, { hd: o.hd ?? 2, color: o.color, emissive: o.emissive }); mats.set(k, m); } return m; };
const glowM = (c: number, k = 1.6) => gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }), F_EMIT);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (a: number, b: number, h: number, n = 16) => new THREE.CylinderGeometry(a, b, h, n);
function M(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]) { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
const YEL = () => L('enamel_white', { color: 0xf0b030 }), GUN = () => L('metal_anodised_grey'), MACH = () => L('metal_machined'), DARK = () => L('panel_anodised_grey', { color: 0x9098a0 }), RUB = () => L('rubber_seal');

interface Rig {
  root: THREE.Group; jaws: THREE.Object3D[]; table: THREE.Object3D; hold: THREE.Group; tray: THREE.Group;
  trolley: THREE.Group; rope: THREE.Mesh; claw: THREE.Group; fingers: THREE.Object3D[]; grip: THREE.Group;
  arm: { yaw: THREE.Group; sh: THREE.Group; el: THREE.Group; tip: THREE.Object3D; flame: THREE.Mesh }; light: THREE.PointLight;
  clamp: number; hookY: number; reveal: number; heat: number;
}
/** the fabrication rig, in ship space, standing on the workshop's bench */
function buildRig(): Rig {
  const root = new THREE.Group(); root.name = 'fab-rig';
  // ---- the jig
  const jig = new THREE.Group(); jig.position.set(BX, TOP, JZ); root.add(jig);
  M(box(0.36, 0.05, 0.66), GUN(), jig, [0, 0.025, 0]);
  M(box(0.3, 0.02, 0.6), MACH(), jig, [0, 0.06, 0]);
  for (const z of [-0.26, 0.26]) for (const x of [-0.14, 0.14]) M(cyl(0.012, 0.012, 0.012, 6), MACH(), jig, [x, 0.076, z]);
  const table = M(cyl(0.13, 0.14, 0.03, 24), DARK(), jig, [0, 0.085, 0]);
  M(cyl(0.06, 0.06, 0.012, 16), MACH(), table, [0, 0.02, 0]);
  const jaws: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const j = new THREE.Group(); j.position.set(0, 0.07, s * 0.24); jig.add(j);
    M(box(0.2, 0.12, 0.05), YEL(), j, [0, 0.06, 0]);
    M(box(0.18, 0.03, 0.012), RUB(), j, [0, 0.1, -s * 0.03]);
    M(cyl(0.012, 0.012, 0.16, 8), MACH(), j, [0, 0.05, s * 0.09], [PI / 2, 0, 0]);
    M(cyl(0.022, 0.022, 0.03, 10), DARK(), j, [0, 0.05, s * 0.17], [PI / 2, 0, 0]);
    M(box(0.1, 0.012, 0.012), MACH(), j, [0, 0.05, s * 0.185]);
    jaws.push(j);
  }
  const hold = new THREE.Group(); hold.position.set(0, 0.2, 0); jig.add(hold);
  // ---- the parts tray (rubber matting in a steel tray)
  const tray = new THREE.Group(); tray.position.set(...TRAY); root.add(tray);
  M(box(0.34, 0.03, 0.3), GUN(), tray, [0, 0.015, 0]);
  M(box(0.3, 0.012, 0.26), RUB(), tray, [0, 0.032, 0]);
  for (const [x, z] of [[-0.16, 0], [0.16, 0]] as [number, number][]) M(box(0.02, 0.05, 0.3), GUN(), tray, [x, 0.035, z]);
  // ---- the gantry: uprights at the bench's back edge, arms out over the top, a beam along the bench
  const GY = 1.78, gx = BX - 0.02;
  for (const z of [-13.52, -11.68]) {
    M(box(0.08, GY - TOP, 0.08), YEL(), root, [-1.4, TOP + (GY - TOP) / 2, z]);
    M(box(0.5, 0.07, 0.07), YEL(), root, [(-1.4 + gx) / 2 - 0.02, GY, z]);
    M(box(0.12, 0.02, 0.12), MACH(), root, [-1.4, TOP + 0.01, z]);
  }
  M(box(0.07, 0.09, 1.92), YEL(), root, [gx, GY + 0.01, -12.6]);
  M(box(0.02, 0.02, 1.9), MACH(), root, [gx - 0.045, GY - 0.03, -12.6]);
  const trolley = new THREE.Group(); trolley.position.set(gx, GY - 0.07, -11.9); root.add(trolley);
  M(box(0.16, 0.08, 0.14), DARK(), trolley);
  M(cyl(0.035, 0.035, 0.1, 12), MACH(), trolley, [0, -0.02, 0], [0, 0, PI / 2]);
  M(box(0.04, 0.02, 0.02), glowM(0xff8a2a, 1.4), trolley, [-0.085, 0.01, 0.04]);
  const rope = M(cyl(0.006, 0.006, 1, 6), L('rubber_seal', { color: 0x404040 }), trolley);
  const claw = new THREE.Group(); trolley.add(claw);
  M(cyl(0.045, 0.05, 0.05, 10), YEL(), claw, [0, 0.03, 0]);
  M(cyl(0.02, 0.02, 0.03, 8), MACH(), claw, [0, -0.005, 0]);
  const fingers: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2, f = new THREE.Group(); f.rotation.y = a; claw.add(f);
    const k = new THREE.Group(); k.position.set(0.04, 0, 0); f.add(k);
    M(box(0.014, 0.07, 0.018), GUN(), k, [0, -0.035, 0]); M(box(0.024, 0.012, 0.02), MACH(), k, [-0.01, -0.07, 0]);
    fingers.push(k);
  }
  const grip = new THREE.Group(); grip.position.y = -0.09; claw.add(grip);
  // ---- the welding arm at the bench's far end
  const base = new THREE.Group(); base.position.set(-1.52, TOP, -11.86); root.add(base);
  M(cyl(0.09, 0.1, 0.05, 14), DARK(), base, [0, 0.025, 0]);
  const yaw = new THREE.Group(); yaw.position.y = 0.05; base.add(yaw);
  M(cyl(0.06, 0.07, 0.1, 12), YEL(), yaw, [0, 0.05, 0]);
  const sh = new THREE.Group(); sh.position.y = 0.11; yaw.add(sh);
  M(cyl(0.04, 0.04, 0.12, 12), MACH(), sh, [0, 0, 0], [0, 0, PI / 2]);
  M(box(0.06, 0.36, 0.07), YEL(), sh, [0, 0.18, 0]);
  const el = new THREE.Group(); el.position.y = 0.36; sh.add(el);
  M(cyl(0.032, 0.032, 0.1, 12), MACH(), el, [0, 0, 0], [0, 0, PI / 2]);
  M(box(0.045, 0.3, 0.05), YEL(), el, [0, 0.15, 0]);
  const tipG = new THREE.Group(); tipG.position.y = 0.3; el.add(tipG);
  M(cyl(0.022, 0.012, 0.1, 10), L('q_pipe_copper'), tipG, [0, 0.05, 0]);
  const tip = new THREE.Object3D(); tip.position.y = 0.11; tipG.add(tip);
  const flame = M(new THREE.ConeGeometry(0.018, 0.06, 8), glowM(0x9ad8ff, 2.4), tipG, [0, 0.13, 0], [PI, 0, 0]); flame.visible = false; flame.castShadow = false;
  const hose = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.0, 0.03, 0.08), new THREE.Vector3(0.05, 0.05, 0.25), new THREE.Vector3(0.12, -0.02, 0.4)]), 16, 0.012, 6);
  M(hose, RUB(), base);
  // the weld's own light (kept in the scene from the start so the light count never changes)
  const light = new THREE.PointLight(0x9ad8ff, 0, 2.2, 2); light.position.set(BX - 0.15, TOP + 0.5, JZ); root.add(light);
  sh.rotation.x = -0.3; el.rotation.x = -0.9; yaw.rotation.y = 2.5;
  return { root, jaws, table, hold, tray, trolley, rope, claw, fingers, grip, arm: { yaw, sh, el, tip, flame }, light, clamp: 1, hookY: 1.45, reveal: 0, heat: 0 };
}

/** the FORGE key: a big red mushroom button in a hazard-striped collar on a steel plinth */
function mForgeKey(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cyl(0.5, 0.56, 0.18, 8), toon({ map: tex('darkSteel', [3, 1]), metal: 0.5 })));
  const col = new THREE.Mesh(cyl(0.42, 0.44, 0.12, 24), toon({ map: tex('hazard', [6, 0.5]) })); col.position.y = 0.15; g.add(col);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 10, 0, PI * 2, 0, PI / 2), toon({ color: P.ruby[5], emissive: P.ruby[3], emissiveK: 0.4, gloss: 0.9 })); cap.position.y = 0.2; cap.scale.y = 0.65; g.add(cap);
  return g;
}

// ================================================================== the workshop (controller + the 2D layer)
export class Bench {
  readonly el: HTMLDivElement; isOpen = false;
  private parts: Record<PartSlot, string> = { head: 'lens', core: 'cell', grip: 'pistol', mod: 'none' };
  private hub: ShipHub | null = null; private rig: Rig | null = null; private offUpd: (() => void) | null = null;
  private busy = false; private slot: PartSlot = 'head'; private t = 0; private crewScan = -9; private crew: THREE.Object3D[] = []; private tmp = new THREE.Vector3();
  private bin: Panel; private spec: Panel; private keys = new Map<PartSlot, PKey>(); private grid: Slot[] = [];
  private meters = new Map<keyof Stats, Meter>(); private bill: HTMLDivElement; private plate: HTMLDivElement;
  private brief: Panel; private state: Status; private binSec: HTMLDivElement; private binDesc: HTMLDivElement; private selSec: HTMLDivElement; private selName: HTMLDivElement; private selDesc: HTMLDivElement; private selRows: HTMLDivElement;
  private toolSec: HTMLDivElement; private works: HTMLDivElement; private billSec: HTMLDivElement; private billRows: HTMLDivElement; private need: Status;
  private forgeKey: ReturnType<typeof floatIcon>; private back: ReturnType<typeof floatIcon>;
  private key = (e: KeyboardEvent) => {
    if (!this.isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!this.busy) this.open(false); return; }
    const i = ['1', '2', '3', '4'].indexOf(e.key); if (i >= 0) { e.preventDefault(); e.stopImmediatePropagation(); this.pickSlot(PART_SLOTS[i]); }
    if (e.key === 'Enter' || e.key === 'f') { e.preventDefault(); e.stopImmediatePropagation(); void this.forge(); }
  };
  constructor(readonly g: G, readonly w: ToolWidget) {
    installKitStyle(); injectCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-ws';
    // ---- the brief: where you are and what to do here
    this.brief = panel({ title: 'SHIP WORKSHOP', tone: 'olive', serial: 'DECK 1 AFT', lamps: ['green'], hazard: false, glands: 1, vents: false, cls: 'h7-ws-brief' });
    this.brief.text('The fabrication bench in the MERIDIAN\'s workshop. Fit one part per bin onto the jig, then FORGE: the tool joins your arsenal.', { dim: true });
    this.state = this.brief.status('Pick a part from the bins on the left.', 'info');
    // ---- PARTS: category keys, the bin's parts in item slots, the selected part spelled out
    this.bin = panel({ title: 'PART BINS', tone: 'gun', serial: 'FAB-06', lamps: ['green', 'amber'], stencil: 'WORKSHOP', glands: 2, cls: 'h7-ws-bin' });
    const keys = document.createElement('div'); keys.className = 'h7-ws-keys';
    PART_SLOTS.forEach((s, i) => { const k = pkey(SLOT_INFO[s].name, () => this.pickSlot(s), { w: 78, h: 32, tone: 'cream', lamp: 'amber', sound: 'tab' }); k.title = `${SLOT_INFO[s].name} bin (key ${i + 1}): ${SLOT_INFO[s].desc}`; keys.append(k); this.keys.set(s, k); });
    this.binSec = section('HEAD BIN', '4 PARTS');
    this.binDesc = para('', { dim: true });
    const grid = slotGrid(8, 4, 72, { gap: 8, numbered: true, onClick: (i) => { const p = PARTS[this.slot][i]; if (p) void this.fit(this.slot, p.id); } });
    this.grid = grid.slots;
    grid.slots.forEach((sl, i) => bindTip(sl.el, () => { const p = PARTS[this.slot][i]; return p ? this.partTip(p) : { title: 'EMPTY BIN SLOT', desc: 'More parts are unlocked through research and found on the planet.', status: ['Locked', 'warn'] }; }));
    this.selSec = section('FITTED ON THE JIG');
    this.selName = document.createElement('div'); this.selName.className = 'k7-t16 h7-ws-name';
    this.selDesc = para('');
    this.selRows = document.createElement('div');
    this.bin.body.append(keys, this.binSec, this.binDesc, grid.el, this.selSec, this.selName, this.selDesc, this.selRows);
    // ---- SPECS: the tool on the jig spelled out, the LED readouts, the bill of materials, what is missing
    this.spec = panel({ title: 'TOOL SPECS', tone: 'gun', serial: 'JIG-3', lamps: ['green', 'red'], knobs: 2, toggles: 2, foot: 30, cls: 'h7-ws-spec' });
    this.toolSec = section('ON THE JIG', 'MK-1');
    this.plate = document.createElement('div'); this.plate.className = 'h7-ws-tool k7-t16';
    this.works = para('', { dim: true });
    const ms = document.createElement('div'); ms.className = 'h7-ws-meters';
    for (const k of STAT_KEYS) { const s = STATS.find((x) => x.k === k)!; const m = meter(STAT_INFO[k].short, 0, { w: 116, col: s.col, value: '0' }); m.el.title = `${STAT_INFO[k].name}: ${STAT_INFO[k].desc}`; this.meters.set(k, m); ms.append(m.el); }
    this.billSec = section('BILL OF MATERIALS', 'NEED / IN STORE');
    this.bill = document.createElement('div'); this.bill.className = 'h7-ws-bill';
    this.billRows = document.createElement('div');
    this.need = status('', 'info');
    const hints = document.createElement('div'); hints.className = 'h7-ws-hints';
    hints.append(keyHint('1-4', 'bins'), keyHint('CLICK', 'fit part'), keyHint('F', 'forge'), keyHint('ESC', 'back'));
    this.spec.body.append(this.toolSec, this.plate, this.works, ms, this.billSec, this.bill, this.billRows, this.need.el, hints);
    // ---- FORGE and BACK as floating icons (Limbophobia's rule: menu buttons float, never boxed), with their keys
    this.forgeKey = floatIcon({ build: mForgeKey, name: 'FORGE', size: [48, 36], nameSize: 32, sound: '', hint: 'F', view: { pitch: 0.7, spin: 0, rock: 0.2 }, onClick: () => void this.forge() });
    this.forgeKey.el.classList.add('h7-ws-forge');
    bindTip(this.forgeKey.el, () => { const short = this.shortfall(); return { title: 'FORGE THE TOOL', desc: 'The arm welds the fitted parts into one tool. It takes the bill of materials from the settlement stores and adds the tool to your arsenal.', status: short.length ? [`Missing ${short.map(([it, n]) => `${n} ${ITEMS[it]?.name ?? it}`).join(', ')}`, 'bad'] : ['All materials in store', 'ok'], hint: [['F', 'forge']] }; });
    this.back = floatIcon({ build: () => fitVisible(customModel({ head: 'lens', core: 'cell', grip: 'pistol' }, 'hud')), name: 'BACK', size: [40, 32], nameSize: 16, sound: 'back', hint: 'Esc', view: { pitch: 0.4 }, onClick: () => { if (!this.busy) this.open(false); } });
    this.back.el.classList.add('h7-ws-back');
    bindTip(this.back.el, () => ({ title: 'BACK TO THE PLANET', desc: 'Leave the workshop; the settlement resumes where you left it.', hint: [['ESC', 'back']] }));
    el.append(this.brief.el, this.bin.el, this.spec.el, this.forgeKey.el, this.back.el);
  }
  /** a part's tooltip: name, what it is, its stats with units, its cost and whether it is fitted */
  private partTip(p: PartDef): TipContent {
    const rows: [string, string | number, string?][] = [];
    for (const k of STAT_KEYS) { const v = (p as unknown as Record<string, number | undefined>)[k]; if (v) rows.push([STAT_INFO[k].name, statText(k, v)]); }
    const cost = Object.entries(p.cost).map(([it, n]) => `${n} ${ITEMS[it]?.name ?? it}`).join(', ');
    if (cost) rows.push(['Cost', cost]);
    const fitted = this.parts[p.slot] === p.id;
    return { title: p.name, sub: `${SLOT_INFO[p.slot].name} PART${p.base ? ' · WORKS AS ' + TOOLS[p.base].name.toUpperCase() : ''}`, desc: p.desc, rows, status: fitted ? ['Fitted on the jig', 'ok'] : ['Click to fit it: the gantry carries it to the jig', 'info'] };
  }
  private shortfall(): [string, number][] {
    if (this.g.__freeParts) return [];
    const st = this.g.storage;
    return Object.entries(costOf(this.parts)).map(([it, n]) => [it, n - (st?.count?.(it) ?? 0)] as [string, number]).filter(([, n]) => n > 0);
  }
  // ---------------------------------------------------------------- open: an iris, the ship's workshop behind it
  open(on: boolean) {
    if (on === this.isOpen) return;
    const r = this.w.el.getBoundingClientRect(), at = { x: r.left + r.width / 2, y: r.top + r.height / 3 };
    if (on) {
      this.isOpen = true;
      void transition('iris', async () => {
        try { await this.enter(); } catch (e) { console.error('workshop', e); }
        if (!this.el.isConnected) document.body.append(this.el);
        this.el.classList.add('on'); document.body.classList.add('h7-ws-open');
        addEventListener('keydown', this.key, true);
        this.syncUI(); this.pickSlot(this.slot, true);
        uiSfx('swishIn', 0.6, 0.8); uiSfx('creak', 0.35);
        await wait(120);
      }, { ...at, ms: 340 });
    } else {
      removeEventListener('keydown', this.key, true);
      void transition('iris', () => { this.isOpen = false; this.el.classList.remove('on'); document.body.classList.remove('h7-ws-open'); this.leave(); uiSfx('close', 0.5); }, { ...at, ms: 300 });
    }
  }
  /** the ship hub on its workshop, the rig on the bench, the camera on the bench */
  private async enter() {
    const engine = (this.g.engine ?? (window as unknown as { __engine?: unknown }).__engine) as import('../../app/engine').Engine | undefined;
    if (!engine) throw new Error('no engine');
    const { ShipHub } = await import('../../ship/hub/hub');
    const was = this.g.paused; this.g.paused = true;
    const hub = this.hub = new ShipHub(engine, { inside: true, fromPlanet: true });
    hub.onDispose(() => { this.g.paused = was; });
    engine.push(hub); engine.start();
    hub.showChrome(false); hub.lockInput(true);
    void hub.focus('workshop', { instant: true });
    void hub.shot(CAM.home(), 0); hub.snap();
    // the bench cleared for the rig: the vice and the hand tools put away
    const room = hub.room('workshop').root;
    room.traverse((o) => { if (/^ph:(bench_vice_01|adjustable_wrench|pliers|screwdriver)$/.test(o.name)) o.visible = false; });
    // and whatever small things the room's clutter pass left on the bench top
    for (const o of room.children) { const p = o.position; if (p.y > 0.85 && p.y < 1.6 && p.x > -2.4 && p.x < -1.2 && p.z > -13.7 && p.z < -11.5) o.visible = false; }
    const rig = this.rig = buildRig(); room.add(rig.root);
    this.mount();
    this.offUpd = hub.onUpdate((dt) => this.frame(dt));
    // two frames so the room is drawn before the iris opens
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
  }
  private leave() {
    this.offUpd?.(); this.offUpd = null;
    const hub = this.hub; this.hub = null; this.rig = null;
    if (hub) { const engine = hub.engine; if (engine.screen === hub) engine.pop(); else hub.dispose(); }
  }
  private frame(dt: number) {
    const rig = this.rig; if (!rig) return;
    this.t += dt;
    // the jaws slide to the clamp, the turntable lifts and spins on the reveal, the tool's parts work
    rig.jaws.forEach((j, i) => { const s = i ? 1 : -1, goal = s * (0.17 + (1 - rig.clamp) * 0.08); j.position.z += (goal - j.position.z) * Math.min(1, dt * 12); });
    rig.hold.position.y = 0.2 + rig.reveal * 0.2; rig.hold.rotation.y += dt * (0.15 + rig.reveal * 4);
    rig.table.rotation.y = rig.hold.rotation.y;
    (rig.hold.userData.update as ((dt: number) => void) | undefined)?.(dt);
    (rig.grip.userData.update as ((dt: number) => void) | undefined)?.(dt);
    // the crew keep working round the ship, but nobody stands in front of the bench while it is in use
    const now = performance.now() / 1000;
    if (now - this.crewScan > (this.crew.length ? 1 : 0.2)) { this.crewScan = now; this.crew = []; this.hub?.scene.traverse((o) => { if (o.children.some((k) => k.userData.crewId)) this.crew.push(o); }); }
    for (const c of this.crew) {
      const p = c.getWorldPosition(this.tmp), near = p.x > -3.4 && p.x < -1.2 && p.z > -14 && p.z < -10.9;
      if (near) { if (c.visible) { c.visible = false; c.userData.wsHid = true; } } else if (c.userData.wsHid) { c.visible = true; c.userData.wsHid = false; }
    }
    // the hoist: the claw hangs at hookY (ship space), the rope runs from the trolley down to it
    const ty = rig.trolley.position.y, y = rig.hookY + Math.sin(this.t * 1.3) * 0.004;
    rig.claw.position.y = y - ty; rig.rope.scale.y = Math.max(0.01, ty - y); rig.rope.position.y = (y - ty) / 2;
    // the weld light flickers with the heat; the arm idles
    rig.light.intensity = rig.heat * (2.2 + Math.random() * 1.6);
    if (!this.busy) { rig.arm.yaw.rotation.y = 2.5 + Math.sin(this.t * 0.5) * 0.05; }
  }
  // ---------------------------------------------------------------- the tool on the jig
  private mount() {
    const rig = this.rig; if (!rig) return;
    rig.hold.clear();
    const m = customModel(this.parts, 'world'), fv = fitVisible(m);
    const s = 0.5 / Math.max(0.001, (fv.userData.fitW as number) || 1);
    fv.scale.setScalar(s); fv.rotation.y = -PI / 2;
    rig.hold.add(fv); rig.hold.userData.update = m.userData.update;
  }
  private screenOf(v: THREE.Vector3) { const c = this.hub!.camera, p = v.clone().project(c); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; }
  private jigTop() { return new THREE.Vector3(BX, TOP + 0.3, JZ); }
  private async trolleyTo(z: number, ms = 700) { const rig = this.rig!, z0 = rig.trolley.position.z; uiSfx('winch', 0.4, 1.1); await tween(ms, (k) => { rig.trolley.position.z = z0 + (z - z0) * k; }, ease.inOutCubic); }
  private async hookTo(y: number, ms = 450) { const rig = this.rig!, y0 = rig.hookY; await tween(ms, (k) => { rig.hookY = y0 + (y - y0) * k; }, ease.inOutCubic); }
  private async clawOpen(open: boolean) { const rig = this.rig!, f0 = rig.fingers[0].rotation.z, g = open ? 0.5 : 0; uiSfx(open ? 'switch' : 'clunk', 0.5); await tween(180, (k) => { for (const f of rig.fingers) f.rotation.z = f0 + (g - f0) * k; }); }
  // ---------------------------------------------------------------- fit a part: tray, gantry, claw, jig
  async fit(slot: PartSlot, id: string) {
    if (this.busy || !this.rig || !this.hub) return;
    if (this.parts[slot] === id) { const k = this.keys.get(slot); if (k) shake(k, 4); uiSfx('error', 0.4); return; }
    this.busy = true; this.pickSlot(slot, true); this.syncUI();
    const rig = this.rig, hub = this.hub;
    try {
      void hub.shot(CAM.fit(), 0.7);
      // the part drops into the tray with a bounce and a puff
      const part = partModel(slot, id, 'world');
      const fv = part ? fitVisible(part) : new THREE.Group();
      fv.scale.setScalar(0.2 / Math.max(0.001, (fv.userData.fitW as number) || 1));
      const inTray = new THREE.Group(); inTray.add(fv); inTray.position.set(0, 0.04, 0); rig.tray.add(inTray);
      await tween(320, (k) => { inTray.position.y = 0.04 + (1 - k) * 0.35; }, ease.outBounce);
      const tp = this.screenOf(new THREE.Vector3(...TRAY)); placeDust(tp.x, tp.y, 0.3, { layer: 'ui', ground: 'metal' });
      // the gantry runs over the tray, the claw drops, grips, lifts
      await Promise.all([this.hookTo(1.5), this.clawOpen(true)]);
      await this.trolleyTo(TRAY[2], 650);
      await this.hookTo(TOP + 0.2, 420);
      await this.clawOpen(false);
      rig.tray.remove(inTray); inTray.position.set(0, -0.06, 0); rig.grip.add(inTray); rig.grip.userData.update = part?.userData.update;
      uiSfx('metal', 0.4, 1.3);
      await this.hookTo(1.5, 380);
      // over the jig: the jaws open, down, the part goes on, the jaws lock with sparks and a knock
      await this.trolleyTo(JZ, 800);
      rig.clamp = 0; uiSfx('winch', 0.4, 1.4);
      await this.hookTo(TOP + 0.42, 450);
      rig.grip.remove(inTray); rig.grip.userData.update = undefined;
      this.parts[slot] = id; this.mount();
      await this.clawOpen(true);
      rig.clamp = 1;
      const sp = this.screenOf(this.jigTop());
      burst(sp.x, sp.y, { n: 26, ramp: P.glowAmber, speed: 300, life: 0.55 }); burst(sp.x, sp.y, { n: 10, ramp: P.sky, speed: 200, life: 0.4 });
      placeDust(sp.x, sp.y + 24, 0.35, { layer: 'ui', ground: 'metal' });
      uiSfx('clunk', 0.7); uiSfx('metal', 0.5, 0.9);
      this.syncUI();
      await this.hookTo(1.45, 380);
      await this.trolleyTo(-11.9, 650);
      void hub.shot(CAM.home(), 0.8);
    } finally { this.busy = false; this.syncUI(); }
  }
  // ---------------------------------------------------------------- FORGE: weld, cool, reveal
  async forge() {
    if (this.busy || !this.rig || !this.hub) return;
    const cost = costOf(this.parts), st = this.g.storage;
    const short = Object.entries(cost).filter(([it, n]) => (st?.count?.(it) ?? 0) < n);
    if (short.length && !this.g.__freeParts) { shake(this.forgeKey.el, 6); uiSfx('error', 0.6); this.bill.querySelectorAll('.short').forEach((e) => pop(e as HTMLElement, 0.5)); return; }
    this.busy = true; this.syncUI(); this.forgeKey.view?.press(1.4); uiSfx('clunk', 0.7); uiSfx('bong', 0.5);
    const rig = this.rig, hub = this.hub, a = rig.arm;
    try {
      void hub.shot(CAM.forge(), 0.8);
      // the arm swings its torch over the jig
      const y0 = a.yaw.rotation.y, s0 = a.sh.rotation.x, e0 = a.el.rotation.x;
      await tween(650, (k) => { a.yaw.rotation.y = y0 + (WY - y0) * k; a.sh.rotation.x = s0 + (-0.75 - s0) * k; a.el.rotation.x = e0 + (-1.4 - e0) * k; }, ease.inOutCubic);
      // weld: sparks, a hot flickering light, the hiss of the torch
      a.flame.visible = true;
      const tEnd = performance.now() + 1700;
      while (performance.now() < tEnd) {
        rig.heat = Math.min(1, rig.heat + 0.2);
        const p = this.screenOf(a.tip.getWorldPosition(new THREE.Vector3()));
        burst(p.x, p.y, { n: 8, ramp: Math.random() < 0.5 ? P.glowAmber : P.sky, speed: 260, life: 0.45, gravity: 900 });
        if (Math.random() < 0.5) uiSfx(Math.random() < 0.5 ? 'scratch' : 'metal', 0.35, 1.3 + Math.random() * 0.4);
        a.el.rotation.x = -1.4 + Math.sin(performance.now() / 90) * 0.05; a.yaw.rotation.y = WY + Math.sin(performance.now() / 160) * 0.14;
        await wait(70);
      }
      a.flame.visible = false;
      // cool: the glow fades, steam puffs off, a hiss
      uiSfx('swishOut', 0.6, 0.7);
      const jp = this.screenOf(this.jigTop());
      for (let i = 0; i < 3; i++) setTimeout(() => placeDust(jp.x + (i - 1) * 30, jp.y, 0.3, { layer: 'ui', ground: 'snow', sound: false }), i * 180);
      await Promise.all([tween(900, (k) => { rig.heat = 1 - k; }), tween(650, (k) => { a.yaw.rotation.y = WY + (2.5 - WY) * k; a.sh.rotation.x = -0.75 + 0.45 * k; a.el.rotation.x = -1.4 + 0.5 * k; }, ease.inOutCubic)]);
      // reveal: the jaws open, the finished tool rises and spins with its parts working
      rig.clamp = 0; uiSfx('winch', 0.4, 1.5);
      void hub.shot(CAM.reveal(), 0.7);
      await tween(500, (k) => { rig.reveal = k; }, ease.outBack);
      if (st && !this.g.__freeParts) for (const [it, n] of Object.entries(cost)) st.take(it, n);
      const head = partOf('head', this.parts.head), n = customTools(this.g).length + 1, name = `${head.name.split(' ').pop()} MK-${n}`;
      addCustomTool(this.g, { id: 'custom_' + Date.now().toString(36), name, parts: { ...this.parts }, base: head.base ?? 'scanner', stats: statsOf(this.parts) });
      const np = this.screenOf(new THREE.Vector3(BX, TOP + 0.75, JZ));
      floatUp(np.x, np.y, name, { size: 32, color: '#ffe39a' });
      burst(np.x, np.y + 40, { n: 30, ramp: P.glowTeal, speed: 320, life: 0.7 });
      uiSfx('confirm', 0.8); uiSfx('slam', 0.4);
      await wait(1900);
      await tween(450, (k) => { rig.reveal = 1 - k; }, ease.inOutCubic);
      rig.clamp = 1; uiSfx('clunk', 0.5);
      void hub.shot(CAM.home(), 0.8); this.syncUI();
    } finally { this.busy = false; rig.heat = 0; this.syncUI(); }
  }
  // ---------------------------------------------------------------- QA: hold a moment of the sequences still (headless shots)
  qaPose(kind: 'home' | 'carry' | 'weld' | 'reveal', slot: PartSlot = 'head', id = 'bit') {
    const rig = this.rig, hub = this.hub; if (!rig || !hub) return;
    const a = rig.arm;
    rig.grip.clear(); rig.grip.userData.update = undefined; this.busy = kind !== 'home';
    rig.clamp = 1; rig.reveal = 0; rig.heat = 0; a.flame.visible = false; rig.trolley.position.z = -11.9; rig.hookY = 1.45;
    a.yaw.rotation.y = 2.5; a.sh.rotation.x = -0.3; a.el.rotation.x = -0.9;
    let cam = CAM.home();
    if (kind === 'carry') {
      const part = partModel(slot, id, 'world'), fv = part ? fitVisible(part) : new THREE.Group();
      fv.scale.setScalar(0.2 / Math.max(0.001, (fv.userData.fitW as number) || 1));
      const g = new THREE.Group(); g.add(fv); g.position.y = -0.06; rig.grip.add(g); rig.grip.userData.update = part?.userData.update;
      rig.trolley.position.z = -12.85; rig.hookY = 1.32; rig.clamp = 0; for (const f of rig.fingers) f.rotation.z = 0;
      cam = CAM.fit();
    }
    if (kind === 'weld') { a.yaw.rotation.y = WY; a.sh.rotation.x = -0.75; a.el.rotation.x = -1.4; a.flame.visible = true; rig.heat = 1; cam = CAM.forge(); }
    if (kind === 'reveal') { rig.clamp = 0; rig.reveal = 1; cam = CAM.reveal(); }
    void hub.shot(cam, 0); hub.snap(); this.syncUI();
    if (kind === 'weld') requestAnimationFrame(() => { const p = this.screenOf(a.tip.getWorldPosition(new THREE.Vector3())); for (let i = 0; i < 3; i++) burst(p.x, p.y, { n: 14, ramp: i % 2 ? P.glowAmber : P.sky, speed: 240, life: 4, gravity: 120 }); });
    if (kind === 'reveal') requestAnimationFrame(() => { const np = this.screenOf(new THREE.Vector3(BX, TOP + 0.75, JZ)); floatUp(np.x, np.y, `${partOf('head', this.parts.head).name.split(' ').pop()} MK-1`, { size: 32, color: '#ffe39a' }); });
  }
  // ---------------------------------------------------------------- the 2D layer
  private pickSlot(s: PartSlot, quiet = false) {
    this.slot = s;
    for (const [k, b] of this.keys) b.setOn(k === s);
    if (!quiet) uiSfx('tab', 0.5);
    const list = PARTS[s];
    (this.binSec.firstChild as HTMLElement).textContent = `${SLOT_INFO[s].name} BIN`; (this.binSec.lastChild as HTMLElement).textContent = `${list.length} PARTS`;
    this.binDesc.textContent = SLOT_INFO[s].desc;
    this.grid.forEach((sl, i) => {
      const p = list[i];
      if (!p) { sl.set({ icon: null, count: null, state: 4, n: '' }); return; }
      sl.set({ icon: p.id === 'none' ? null : partIcon(s, p.id, 54), count: null, state: this.parts[s] === p.id ? 3 : 1, n: String(i + 1) });
    });
    this.showName();
  }
  /** the part fitted in the current bin, spelled out */
  private showName() {
    const p = partOf(this.slot, this.parts[this.slot]);
    (this.selSec.firstChild as HTMLElement).textContent = `FITTED ${SLOT_INFO[this.slot].name}`;
    this.selName.textContent = p.name; this.selDesc.textContent = p.desc ?? '';
    this.selRows.textContent = '';
    for (const k of STAT_KEYS) { const v = (p as unknown as Record<string, number | undefined>)[k]; if (v) this.selRows.append(kv(STAT_INFO[k].name, statText(k, v)).el); }
    const cost = Object.entries(p.cost); if (cost.length) this.selRows.append(kv('Cost', cost.map(([it, n]) => `${n} ${ITEMS[it]?.name ?? it}`).join(', ')).el);
  }
  private syncUI() {
    const st = statsOf(this.parts);
    for (const s of STATS) this.meters.get(s.k)!.set(Math.max(0, st[s.k] + (s.off ?? 0)) / (s.max + (s.off ?? 0)), statText(s.k, st[s.k]));
    const head = partOf('head', this.parts.head), base = TOOLS[head.base ?? 'scanner'], n = customTools(this.g).length + 1;
    this.plate.textContent = `${head.name.split(' ').pop()} MK-${n}`;
    (this.toolSec.lastChild as HTMLElement).textContent = `TOOL ${n}`;
    this.works.textContent = `Works as the ${base.name}: ${base.desc}`;
    // the bill: slots with the item icons, then each line spelled out (need / in store)
    this.bill.textContent = ''; this.billRows.textContent = '';
    const cost = Object.entries(costOf(this.parts)), store = this.g.storage;
    for (const [it, need] of cost) {
      const have = store?.count?.(it) ?? 0, ok = have >= need || !!this.g.__freeParts, name = ITEMS[it]?.name ?? it;
      const s = slot(50, { title: name });
      const im = document.createElement('img'); im.src = itemIcon(it as never, 64); im.width = 34; im.height = 34; im.alt = name;
      s.set({ icon: im, count: need, state: ok ? 1 : 4 });
      bindTip(s.el, () => ({ title: name.toUpperCase(), desc: ITEMS[it]?.desc ?? undefined, rows: [['Needed', need], ['In store', this.g.__freeParts ? 'free (test)' : have]], status: ok ? ['Enough in store', 'ok'] : [`Short by ${need - have}: haul it to a store or craft it`, 'bad'] }));
      if (!ok) s.el.classList.add('short');
      this.bill.append(s.el);
      this.billRows.append(kv(name, `${need} / ${this.g.__freeParts ? 'free' : have}`, { color: ok ? undefined : '#ff8a70' }).el);
    }
    const short = this.shortfall();
    if (this.busy) { this.need.set('The bench is working...', 'busy'); this.state.set('Working: wait for the gantry and the arm to finish.', 'busy'); }
    else if (short.length) { this.need.set(`Missing ${short.map(([it, k]) => `${k} ${ITEMS[it]?.name ?? it}`).join(', ')}. Haul them to a store, or fit cheaper parts.`, 'bad'); this.state.set('Not enough materials to forge this tool yet.', 'warn'); }
    else { this.need.set('All materials in store. Press FORGE (F).', 'ok'); this.state.set('Ready: FORGE builds the tool and adds it to your arsenal.', 'ok'); }
    if (this.isOpen) this.pickSlot(this.slot, true);
  }
}

let css = false;
function injectCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-ws { position: fixed; inset: 0; z-index: 8900; display: none; pointer-events: none; }
.h7-ws.on { display: block; }
body.h7-ws-open .h7-root, body.h7-ws-open .h7-test-bg, body.h7-ws-open .h7-ars { display: none !important; }
.h7-ws > * { pointer-events: auto; }
.h7-ws-brief { position: absolute; left: 50%; top: 10px; width: 560px; transform: translateX(-50%); }
.h7-ws-bin { position: absolute; left: 22px; top: 96px; width: 376px; }
.h7-ws-spec { position: absolute; right: 22px; top: 96px; width: 350px; }
.h7-ws-spec .kmeter { grid-template-columns: 84px auto 1fr; }
.h7-ws-hints { margin-top: 10px; display: flex; flex-wrap: wrap; row-gap: 6px; }
.h7-ws-keys { display: flex; gap: 6px; margin-bottom: 12px; }
.h7-ws-name { color: #ffe39a; min-height: 18px; }
.h7-ws-tool { color: #ffe39a; margin-bottom: 10px; }
.h7-ws-meters { display: flex; flex-direction: column; gap: 6px; }
.h7-ws-bill { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.h7-ws-bill .short .kslot-n { color: #ff7a5a; }
.h7-ws-forge { position: absolute !important; right: 120px; bottom: 26px; --glow: #ff8a6a; }
.h7-ws-back { position: absolute !important; left: 26px; top: 14px; }
`;
  document.head.append(s);
}

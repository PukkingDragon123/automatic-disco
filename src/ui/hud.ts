// The colony HUD (v6): a desktop machine console laid over the RTS view, green phosphor glass set in worn olive and
// gunmetal plates. Regions (see V6.md, POD + COLONY):
//   TOP BAR      colony plate + SHIP AI LINK | the six VITALS gauges | TIME CONTROL (pause, 1x 2x 3x) and the sol clock
//   RIGHT        the MINIMAP (relief, control range, units, contacts, the camera's view) and the ALERTS feed
//   LEFT         the SELECTED-UNIT panel (the pod's panel carries the WORKS catalogue: arms, drones, structures, limbs)
//   BOTTOM-RIGHT the TOOL WHEEL (slots, assignment, upgrades)
//   TOP CENTRE   the control banner while an arm or drone is driven; the PAUSED plate; the collapse countdown
// Bottom-left belongs to the inventory agent's crate HUD and bottom-centre to the logistics build hotbar.
import { el, ui } from './kit';
import { sfx } from '../audio/audio';
import type { Hive } from '../game/hive';
import { type Ability } from '../game/hive';
import type { World } from '../game/world';
import type { Creature } from '../game/creature';
import type { Building } from '../game/buildings';
import type { Vision } from '../game/vision';
import type { RtsCam } from '../app/rtsCam';
import type { Game } from '../game/game';
import type { Climate } from '../game/climate';
import type { Desk } from './desk/desk';
import type { Colony, Sel, Alert } from '../colony/colony';
import { ToolWheel } from './wheel';
import { TOOLS, TOOL_ORDER, type ToolId } from '../colony/tools';
import { CATALOG, CAT_ORDER, type CatKind } from '../colony/catalog';
import { ARM_DEF } from '../colony/arms';
import { ITEMS } from '../factory/items';
import { installHudStyle } from './desk/hudStyle';
import { iconImg } from './desk/hudArt';
import { skin, fontText, platePix, rivet, Pix, R } from './desk/pxPanel';
import { textWidth } from './desk/ink';
import { gaugeFace } from './desk/paint';
import * as THREE from 'three';
import './desk/toolIcons';
import type { VitalId } from '../colony/vitals';

export interface Cmd { icon: string; key: string; name: string; tip: () => string; disabled?: () => string | false; active?: () => boolean; run: () => void; cost?: string }
export interface HudCtx {
  hive: Hive; world: World; vision: Vision; cam: RtsCam;
  game?: Game;
  sel: () => Creature[]; selB: () => Building | null;
  commands: () => Cmd[]; ctxKey: () => string;
  conquest: () => number; regionName: string;
  minimap: (x: number, z: number, button: number) => void;
  openTree: () => void; openBuilder: () => void; openMenu: () => void; openMirror: () => void;
  ability?: (a: Ability) => void;
  armed?: () => Ability | null;
}

const VITALS: { id: VitalId; name: string; icon: string }[] = [
  { id: 'power', name: 'POWER', icon: 'v-power' }, { id: 'oxygen', name: 'OXYGEN', icon: 'v-oxygen' }, { id: 'food', name: 'FOOD', icon: 'v-food' },
  { id: 'integrity', name: 'POD HULL', icon: 'v-integrity' }, { id: 'health', name: 'CREW HEALTH', icon: 'v-health' }, { id: 'morale', name: 'MORALE', icon: 'v-morale' },
];
const COLS = { ok: '#8fe09a', warn: '#e2b04a', crit: '#e0604a' };
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class Hud {
  readonly root: HTMLDivElement;
  readonly dialog: HTMLDivElement;
  readonly objectives: HTMLDivElement;
  readonly wheel: ToolWheel;
  /** the old cockpit desk is retired (kept as a type for the almanac's optional hook) */
  readonly desk: Desk | undefined = undefined;
  climate: Climate | null = null;
  private vitEls: { id: VitalId; el: HTMLDivElement; cv: HTMLCanvasElement; icon: HTMLCanvasElement | null }[] = [];
  private clock!: HTMLDivElement; private timeBtns: HTMLButtonElement[] = []; private pausebar!: HTMLDivElement; private count!: HTMLDivElement;
  private mapCv!: HTMLCanvasElement; private mapBase: HTMLCanvasElement | null = null; private mapT = 0; private mapHd!: HTMLDivElement;
  private alertsEl!: HTMLDivElement; private alertKey = '';
  private viewEl!: HTMLDivElement; private calloutCv!: HTMLCanvasElement; private callT = 0;
  private selEl!: HTMLDivElement; private selHd!: HTMLDivElement; private selRows!: HTMLDivElement; private selActs!: HTMLDivElement; private selWorks!: HTMLDivElement; private selKey = ''; private worksTab: CatKind = 'arm'; private worksKey = '';
  private ctlEl!: HTMLDivElement; private ctlKey = '';
  private wheelInfo!: HTMLDivElement; private cfgEl!: HTMLDivElement; private cfgSlot = -1; private cfgKey = '';
  private tipEl!: HTMLDivElement; private frame!: HTMLDivElement; private alarm!: HTMLDivElement;
  private slow = 0; private t = 0; private flashMsg = ''; private flashT = 0;
  private onResize = () => { this.mapBase = null; };

  constructor(readonly c: HudCtx) {
    installHudStyle();
    this.root = el('div', 'hud cx', ui());
    this.frame = el('div', 'cx-frame', this.root); this.alarm = el('div', 'cx-alarm', this.root);
    this.dialog = el('div', 'hud-dialog', this.root);
    this.objectives = el('div', 'px-dark hud-obj', this.root); this.objectives.style.display = 'none';
    this.tipEl = el('div', 'cx-tip', document.body);
    this.buildTop();
    this.buildMap();
    this.alertsEl = el('div', 'cx-alerts', this.root);
    this.buildSel();
    this.ctlEl = el('div', 'cx-plate gun cx-ctl', this.root);
    skin(this.ctlEl, (w, h) => platePix(w, h, { mat: 'enamel', seed: 63, hazard: true, wear: 0.7 }));
    // the wheel
    const wp = el('div', 'cx-plate cx-wheel', this.root);
    const wcard = el('div', 'cx-plate', wp); wcard.style.cssText = 'left:0;top:150px;width:172px;height:164px'; skin(wcard, (w, h) => platePix(w, h, { mat: 'enamel', seed: 41, rivets: true, wear: 1 }), 'wcard');
    this.wheelInfo = el('div', 'cx-glass info cx-ph', wp);
    this.wheel = new ToolWheel(wp, { colony: () => this.colony, config: (i) => this.openCfg(i), tip: (h, x, y) => this.tip(h, x, y), flash: (m, b) => this.flash(m, b) });
    const cfg = el('button', 'cx-btn cfg', wp, 'CONFIGURE SLOTS'); cfg.onclick = () => this.openCfg(this.wheel.hover >= 0 ? this.wheel.hover : Math.max(0, this.colony?.slots.active ?? 0));
    this.cfgEl = el('div', 'cx-plate cx-slotcfg pe', this.root);
    skin(this.cfgEl, (w, h) => platePix(w, h, { mat: 'enamel', seed: 57, rivets: true, wear: 1.1 }), 'cfg');
    addEventListener('resize', this.onResize);
    this.root.style.display = 'none';
  }
  get colony(): Colony | null { return this.c.game?.colony ?? null; }
  get g() { return this.c.game; }
  setClimate(c: Climate) { this.climate = c; }
  invalidate() { this.selKey = ''; this.worksKey = ''; this.cfgKey = ''; }

  // ------------------------------------------------------------------ top bar
  private buildTop() {
    const top = el('div', 'cx-plate cx-top', this.root);
    
    const id = el('div', 'cx-id', top); skin(id, (w, h) => platePix(w, h, { mat: 'enamel', seed: 5, wear: 1.0 }), 'id');
    const rc = iconImg('u-pod', 56); rc.classList.add('pe'); id.appendChild(rc);
    const tx = el('div', '', id);
    el('div', 't1 cx-sten', tx, 'UNAA · CP-07');
    const t2 = el('div', 't2', tx, esc(this.c.regionName.toUpperCase())); void t2;
    const link = el('button', 'cx-btn blue cx-link', id); link.appendChild(iconImg('v-link', 30)); el('span', '', link, 'SHIP AI LINK');
    link.onclick = (e) => { e.stopPropagation(); sfx('click'); this.colony?.shipLink(); };
    this.hoverTip(link, () => '<b>SHIP AI LINK</b><br>Talk to the ship\'s AI and return to the research ship. The colony waits, paused, until you come back.');
    rc.style.cursor = 'pointer'; rc.onclick = () => { const c = this.colony; if (c) { c.select({ kind: 'pod' }); this.g?.cam.lookAt(c.pod.x, c.pod.z); } };
    const vit = el('div', 'cx-vitals', top);
    for (const v of VITALS) {
      const e = el('div', 'cx-vit', vit), cv = document.createElement('canvas'); e.appendChild(cv); e.appendChild(iconImg(v.icon, 36));
      this.vitEls.push({ id: v.id, el: e, cv, icon: null });
      this.hoverTip(e, () => this.vitalTip(v.id));
    }
    const tm = el('div', 'cx-plate gun cx-time', top);
    skin(tm, (w, h) => platePix(w, h, { mat: 'steel', seed: 77, wear: 0.8 }), 'time');
    const mk = (label: string, tip: string, f: () => void) => { const b = el('button', 'cx-btn', tm, label); b.onclick = (e) => { e.stopPropagation(); f(); }; this.hoverTip(b, () => tip); this.timeBtns.push(b); return b; };
    mk('II', '<b>PAUSE</b> [SPACE]<br>Orders, building and control still work while paused.', () => this.colony?.togglePause());
    mk('1x', '<b>NORMAL SPEED</b> [1]', () => this.colony?.setSpeed(1));
    mk('2x', '<b>FAST</b> [2]', () => this.colony?.setSpeed(2));
    mk('3x', '<b>FASTEST</b> [3]', () => this.colony?.setSpeed(3));
    this.clock = el('div', 'cx-glass clock cx-ph', tm);
    this.pausebar = el('div', 'cx-plate gun cx-pausebar cx-sten', this.root, 'PAUSED');
    skin(this.pausebar, (w, h) => platePix(w, h, { mat: 'enamel', seed: 81, hazard: true, wear: 0.6 }), 'pause');
    this.count = el('div', 'cx-plate gun cx-count', this.root, '<div class="h cx-sten"></div><div class="v"></div>');
    skin(this.count, (w, h) => platePix(w, h, { mat: 'orange', seed: 85, hazard: true }), 'count');
  }
  private vitalTip(id: VitalId) {
    const c = this.colony; if (!c) return '';
    const v = c.vitals;
    switch (id) {
      case 'power': return `<b>POWER</b><br>Battery ${v.battery.toFixed(0)} / ${v.batteryCap} kWh<br>Generation ${v.gen.toFixed(1)} kW · Draw ${v.draw.toFixed(1)} kW<br>${v.gen >= v.draw ? 'Charging' : '<span class="w">Draining: cut loads or add generation</span>'}<br>A flat battery shuts life support down.`;
      case 'oxygen': return `<b>OXYGEN TANK</b> ${v.o2.toFixed(0)}%<br>Scrubbers run on power; the crew breathe it and refill their suits from it; a broken hull leaks.`;
      case 'food': return `<b>FOOD</b> ${v.food.toFixed(1)} meals<br>Rations ${v.rations.toFixed(1)} + edible stores. Sample plants for fruit; grow food.`;
      case 'integrity': return `<b>POD HULL</b> ${Math.round(c.pod.hp)} / ${Math.round(c.pod.maxHp)}<br>Under 55% the hull leaks oxygen. Weld it with a welder arm or a repair drone; the engineer patches it too.`;
      case 'health': return `<b>CREW HEALTH</b> ${pct(v.health)}<br>${c.teammates.map((t) => `${t.short}: ${t.alive ? Math.round(t.hp) + '%' : 'DEAD'}`).join(' · ')}`;
      case 'morale': return `<b>MORALE</b> ${Math.round(v.morale)}<br>Food, air, power, lamps at night, and losses move it. Low morale slows the crew.`;
    }
  }
  private vitBase = new Map<string, Pix>();
  /** a vital as a real instrument (art 52 x 48, shown 2x) on a riveted steel plate: the POWER turbine spinning with the
   *  balance beside its battery lamps, the OXYGEN tank with a sight glass, enamel dials with needles for food, hull,
   *  health and morale; the reading on a stamped bone plate underneath, red when it fails */
  private drawVital(e: { id: VitalId; el: HTMLDivElement; cv: HTMLCanvasElement; icon: HTMLCanvasElement | null }, c: Colony) {
    const W = 52, H = 48, cv = e.cv;
    if (cv.width !== W) { cv.width = W; cv.height = H; }
    let base = this.vitBase.get(e.id);
    if (!base) {
      base = platePix(W, H, { mat: 'steel', seed: 90 + e.id.length * 7, screws: false, wear: 0.5 });
      rivet(base, 3, 3, R.steel); rivet(base, W - 6, 3, R.steel);
      // the reading's stamped plate
      base.rect(8, 36, 36, 10, R.steel[0]); base.rect(9, 37, 34, 8, R.bone[4]); base.hl(9, 42, 37, R.bone[5]); base.hl(9, 42, 44, R.bone[2]);
      if (e.id !== 'power' && e.id !== 'oxygen') { const face = gaugeFace(30, { a0: -2.2, a1: 2.2, ticks: 8, red: [0, 0.25] }); dialBezel(base, 11, 3, 30); base.blit(face, 11, 3); }
      this.vitBase.set(e.id, base);
    }
    const p = new Pix(W, H); p.d.set(base.d);
    const v = c.vitals, lvl = v.levels[e.id], val = Math.max(0, Math.min(1, v.value(e.id))), t = this.t;
    if (e.id === 'power') {
      // the turbine: a steel shroud, four blades turning with the surplus (stalled when flat), a brass hub
      const cx = 22, cy = 18, sp = (v.gen - v.draw) / 8 + (v.battery > 1 ? 0.5 : 0), ang = t * 4 * Math.max(0, sp);
      for (let y = -15; y <= 15; y++) for (let x = -15; x <= 15; x++) { const d = Math.hypot(x + 0.5, y + 0.5); if (d > 15) continue; const l = -((x + 0.5) * 0.6 + (y + 0.5) * 0.8) / (d || 1); p.set(cx + x, cy + y, d > 14 ? R.steel[0] : d > 12 ? R.steel[l > 0.3 ? 5 : l > -0.3 ? 3 : 2] : R.ink[0]); }
      for (let k = 0; k < 4; k++) { const a = ang + (k * Math.PI) / 2; for (let r = 2; r < 12; r++) for (let wdt = -1; wdt <= 1; wdt++) { const x = cx + Math.cos(a) * r - Math.sin(a) * wdt * (r / 6), y = cy + Math.sin(a) * r + Math.cos(a) * wdt * (r / 6); p.set(Math.round(x), Math.round(y), wdt < 0 ? R.steel[5] : wdt > 0 ? R.steel[2] : R.steel[4]); } }
      p.rect(cx - 2, cy - 2, 4, 4, R.brass[4]); p.set(cx - 2, cy - 2, R.brass[5]); p.set(cx + 1, cy + 1, R.brass[2]);
      // the battery: five lamps in a bezel
      p.rect(41, 4, 8, 30, R.steel[0]);
      for (let i = 0; i < 5; i++) { const on = val * 5 > i + 0.3, L = lvl === 'ok' ? R.malachite : lvl === 'warn' ? R.ochre : R.stampRed; p.rect(42, 28 - i * 6, 6, 5, on ? L[Math.min(L.length - 1, 4)] : R.ink[1]); if (on) p.set(42, 28 - i * 6, L[L.length - 1]); }
    } else if (e.id === 'oxygen') {
      // the tank: a lit steel cylinder, a valve, a sight glass with the blue level and bubbles
      const x0 = 15, x1 = 37, y0 = 6, y1 = 34;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const u = (x - x0) / (x1 - x0), cap = y - y0 < 3 || y1 - y < 3; const k = u < 0.15 ? 3 : u < 0.4 ? 5 : u < 0.75 ? 4 : 2; if (cap && (x === x0 || x === x1 - 1)) continue; p.set(x, y, R.sky[Math.max(0, k - (cap ? 1 : 0))]); }
      p.vl(x0 - 1, y0 + 1, y1 - 2, R.ink[0]); p.vl(x1, y0 + 1, y1 - 2, R.ink[0]); p.hl(x0 + 1, x1 - 2, y0 - 1, R.ink[0]); p.hl(x0 + 1, x1 - 2, y1, R.ink[0]);
      p.rect(23, 1, 6, 5, R.steel[3]); p.hl(23, 28, 1, R.steel[5]); p.rect(29, 2, 5, 2, R.brass[4]);
      const gx = 24, gy0 = 10, gy1 = 31, lv = Math.round(gy1 - (gy1 - gy0) * val);
      p.rect(gx - 1, gy0 - 1, 6, gy1 - gy0 + 2, R.steel[0]);
      for (let y = gy0; y < gy1; y++) p.hl(gx, gx + 3, y, y >= lv ? (y === lv ? R.water[6] : R.water[4]) : R.ink[1]);
      for (let i = 0; i < 2; i++) { const by = gy1 - 1 - ((t * 6 + i * 9) % Math.max(1, gy1 - lv)); if (by > lv) p.set(gx + 1 + i, Math.round(by), R.water[6]); }
      p.set(gx, gy0, R.snow[5]);
    } else {
      // a needle on the enamel dial
      const cx = 26, cy = 18, a = -2.2 + 4.4 * val;
      for (let r = 0; r < 11; r++) { const x = Math.round(cx + Math.sin(a) * r), y = Math.round(cy - Math.cos(a) * r); p.set(x, y, R.stampRed[3]); if (r < 6) p.set(x + 1, y, R.stampRed[2]); }
      p.rect(cx - 1, cy - 1, 3, 3, R.steel[2]); p.set(cx - 1, cy - 1, R.steel[5]);
      // an icon on the dial's face for what it measures
      const ico = e.id === 'food' ? [[0, 0, R.moss[4]], [0, -1, R.moss[4]], [-1, -2, R.moss[3]], [1, -2, R.moss[5]], [0, 1, R.soil[3]]] : e.id === 'integrity' ? [[-1, -1, R.steel[3]], [0, -1, R.steel[4]], [1, -1, R.steel[3]], [-1, 0, R.steel[3]], [0, 0, R.steel[2]], [1, 0, R.steel[3]]] : e.id === 'health' ? [[-1, -1, R.stampRed[3]], [1, -1, R.stampRed[3]], [-1, 0, R.stampRed[3]], [0, 0, R.stampRed[3]], [1, 0, R.stampRed[3]], [0, 1, R.stampRed[2]]] : [[-1, -1, R.ink[1]], [1, -1, R.ink[1]], [-1, 1, R.ink[1]], [0, 2, R.ink[1]], [1, 1, R.ink[1]]];
      for (const [dx, dy, col] of ico as [number, number, number][]) p.set(cx + dx, cy + 8 + dy, col);
      p.set(cx - 7, cy - 8, R.snow[5]); p.set(cx - 6, cy - 9, R.snow[5]);
    }
    let main = pct(val);
    if (e.id === 'power') main = `${v.battery.toFixed(0)}KWH`;
    if (e.id === 'food') main = `${v.food.toFixed(0)}`;
    const tk = e.id === 'power' ? v.timers.power : e.id === 'oxygen' ? v.timers.oxygen : e.id === 'food' ? v.timers.food : e.id === 'health' ? v.timers.workers : null;
    const blink = lvl === 'crit' && Math.floor(t * 2.5) % 2 === 0;
    if (tk !== null && tk !== undefined) main = mmss(Math.max(0, tk));
    fontText(p, main, 26, 36, lvl === 'crit' ? (blink ? R.stampRed[1] : R.stampRed[3]) : lvl === 'warn' ? R.ochre[1] : R.ink[1], { align: 'center' });
    if (lvl !== 'ok') { const L = lvl === 'crit' ? R.stampRed[3] : R.ochre[4]; p.rect(3, 40, 3, 3, blink ? R.ink[0] : L); p.rect(W - 6, 40, 3, 3, blink ? R.ink[0] : L); }
    cv.getContext('2d')!.putImageData(p.image(), 0, 0);
    e.el.classList.toggle('crit', lvl === 'crit');
  }

  // ------------------------------------------------------------------ minimap
  private buildMap() {
    const p = el('div', 'cx-plate cx-map pe', this.root);
    skin(p, (w, h) => platePix(w, h, { mat: 'steel', seed: 23, wear: 1.2, rivets: true }), 'map');
    this.mapHd = el('div', 'hd', p, '<span class="cx-sten">SURVEY</span><span class="cx-ph"></span>');
    const scr = el('div', 'cx-glass scr', p);
    this.mapCv = document.createElement('canvas'); scr.appendChild(this.mapCv);
    const at = (e: MouseEvent) => { const g = this.g; if (!g) return null; const r = this.mapCv.getBoundingClientRect(), N = g.region.N; return { x: ((e.clientX - r.left) / r.width) * N, z: ((e.clientY - r.top) / r.height) * N }; };
    let drag = false;
    this.mapCv.addEventListener('pointerdown', (e) => { e.stopPropagation(); const p2 = at(e); if (!p2) return; if (e.button === 2) { this.mapOrder(p2.x, p2.z); return; } drag = true; this.g!.cam.lookAt(p2.x, p2.z); });
    this.mapCv.addEventListener('pointermove', (e) => { if (drag && e.buttons & 1) { const p2 = at(e); if (p2) this.g!.cam.lookAt(p2.x, p2.z); } });
    addEventListener('pointerup', () => { drag = false; });
    this.mapCv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.hoverTip(this.mapCv, () => '<b>SURVEY MAP</b><br>Click to look there · right-click to send the selected drone or teammate.<br><span class="w">*</span> seams · <span class="r">#</span> hostile contacts · dashed ring: control signal');
  }
  private mapOrder(x: number, z: number) {
    const c = this.colony; if (!c?.sel) return;
    const s = c.sel;
    if (s.kind === 'drone') { s.ref.order = { k: 'move', x, z }; s.ref.docked = false; sfx('click', 1.3, 0.5); }
    else if (s.kind === 'crew' && s.ref.alive) { s.ref.order({ k: 'move', x, z }); sfx('click', 1.1, 0.5); }
  }
  /** the relief in art pixels (124 x 124): moss ramp by height, one step brighter on contour lines, a step darker on
   *  slopes facing away from the light, water in the water ramp */
  private paintMapBase() {
    // the region itself in pixel art: ground by its material and height (hill-shaded from the upper left), forest
    // canopy as lit tufts, rivers and lakes in the water ramp (deeper is darker, a pale shore line), contours faint
    const g = this.g!, Rg = g.region, N = Rg.N, S = 132, p = new Pix(S, S), k = N / S;
    const RB: (readonly number[])[] = [R.moss, R.straw, R.soil, R.stone, R.sand, R.soil, R.clay, R.snow, R.basalt, R.rust, R.quartz, R.olive, R.stone, R.basalt];
    let lo = 1e9, hi = -1e9; for (let i = 0; i < N * N; i++) { lo = Math.min(lo, Rg.h[i]); hi = Math.max(hi, Rg.h[i]); }
    const wet = new Uint8Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = (x + 0.5) * k, wz = (y + 0.5) * k, ci = Math.min(N - 1, Math.floor(wz)) * N + Math.min(N - 1, Math.floor(wx));
      if (Rg.isWater(wx, wz)) { wet[y * S + x] = 1; const d = Math.max(0, Rg.water - Rg.heightAt(wx, wz)); p.set(x, y, R.water[d > 1.6 ? 1 : d > 0.7 ? 2 : 3]); continue; }
      const h = Rg.heightAt(wx, wz), hx = Rg.heightAt(wx + 1, wz) - Rg.heightAt(wx - 1, wz), hz = Rg.heightAt(wx, wz + 1) - Rg.heightAt(wx, wz - 1);
      const facing = -(hx * 0.6 + hz * 0.8), kk = (h - lo) / Math.max(0.01, hi - lo);
      const ramp = RB[Rg.b[ci]] ?? R.moss, n = ramp.length;
      let step = Math.round(1.5 + kk * (n - 3)) + (facing > 0.45 ? 1 : facing < -0.45 ? -1 : 0);
      const fo = Rg.forest[ci] ?? 0;
      if (fo > 0.35 && ramp !== R.snow) {
        // canopy tufts: 2x2 crowns on a staggered grid, lit on the upper-left pixel
        const cx = x - ((y >> 1) & 1), on = (cx & 1) === 0 && (y & 1) === 0, tone = fo > 0.7 ? R.moss : R.sage;
        const t2 = Math.max(1, Math.min(tone.length - 2, step));
        p.set(x, y, on ? tone[Math.min(tone.length - 1, t2 + 1)] : (x & 1) && (y & 1) ? tone[Math.max(0, t2 - 1)] : tone[t2]);
        continue;
      }
      if (Math.floor(h / 2) !== Math.floor(Rg.heightAt(wx + k, wz) / 2)) step -= 1;
      p.set(x, y, ramp[Math.max(0, Math.min(n - 1, step))]);
    }
    // a pale line along every shore
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) if (wet[y * S + x] && (!wet[y * S + x - 1] || !wet[(y - 1) * S + x])) p.set(x, y, R.water[5]);
    this.mapBase = p.canvas();
  }
  private drawMap(c: Colony) {
    const g = this.g!, Rg = g.region, N = Rg.N, S = 132, cv = this.mapCv;
    if (!this.mapBase) this.paintMapBase();
    if (cv.width !== S) { cv.width = S; cv.height = S; }
    const x = cv.getContext('2d')!; x.imageSmoothingEnabled = false;
    x.drawImage(this.mapBase!, 0, 0);
    const img = x.getImageData(0, 0, S, S), p = new Pix(S, S); p.d.set(img.data);
    const k = S / N, vis = g.vision, P = (wx: number, wz: number): [number, number] => [Math.floor(wx * k), Math.floor(wz * k)];
    // unseen ground: drop to the darkest steps in a checker of 2 x 2 clusters (the fog of the survey)
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const wx = Math.floor((xx + 0.5) / k), wz = Math.floor((yy + 0.5) / k); if (!vis.seen[wz * N + wx]) { p.shade(xx, yy, 0.55); if ((xx + yy) % 4 === 0) p.shade(xx, yy, 0.8); } }
    // control signal rings: dashed pixel circles
    const ring = (cx: number, cz: number, r: number, col: number) => { const n = Math.max(24, Math.round(r * k * 6)); for (let i = 0; i < n; i++) { if ((i >> 1) % 2) continue; const a = (i / n) * Math.PI * 2, [px, py] = P(cx + Math.cos(a) * r, cz + Math.sin(a) * r); p.set(px, py, col); } };
    ring(c.pod.x, c.pod.z, c.controlRadius, R.stampRed[3]);
    for (const s2 of c.structures) if (s2.kind === 'relay' && s2.done) ring(s2.x, s2.z, 30, R.stampRed[2]);
    // seams: small amber diamonds
    for (const d of Rg.deposits) if (d.amount > 0 && !d.hidden) { const [px, py] = P(d.x, d.z); p.set(px, py - 1, R.ochre[5]); p.set(px - 1, py, R.ochre[4]); p.set(px + 1, py, R.ochre[3]); p.set(px, py + 1, R.ochre[2]); p.set(px, py, R.ochre[6] ?? R.ochre[5]); }
    // contacts
    for (const cr of g.world.creatures) { if (cr.dead || !cr.visibleNow) continue; const [px, py] = P(cr.x, cr.z); const hostile = cr.mind === 'hunt' || cr.mind === 'attack' || cr.sp.role === 'apex'; if (cr.faction === 'veyr') p.set(px, py, R.moss[3]); else if (hostile) { p.set(px - 1, py - 1, R.stampRed[3]); p.set(px + 1, py + 1, R.stampRed[3]); p.set(px + 1, py - 1, R.stampRed[3]); p.set(px - 1, py + 1, R.stampRed[3]); p.set(px, py, R.stampRed[3]); } else p.set(px, py, R.ink[2]); }
    for (const st of g.factions?.structures ?? []) if (!st.dead && vis.seen[Math.floor(st.z) * N + Math.floor(st.x)]) { const [px, py] = P(st.x, st.z); p.rect(px - 1, py - 1, 3, 3, R.stampRed[3]); p.set(px - 1, py - 1, R.coral[5]); }
    for (const s2 of c.structures) { const [px, py] = P(s2.x, s2.z); p.rect(px - 1, py - 1, 3, 3, R.ink[1]); p.set(px, py, s2.done ? R.ochre[4] : R.paper[5]); }
    for (const d of c.drones) { const [px, py] = P(d.x, d.z); p.set(px, py - 1, R.ochre[5]); p.set(px - 1, py, R.ochre[4]); p.set(px + 1, py, R.ochre[4]); p.set(px, py, R.ochre[6] ?? R.ochre[5]); }
    for (const t of c.teammates) if (t.alive) { const [px, py] = P(t.x, t.z); p.rect(px, py, 2, 2, R.sapphire[3]); }
    { const [px, py] = P(c.pod.x, c.pod.z); const D = [[0, -3], [-1, -2], [0, -2], [1, -2], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2], [1, 2], [0, 3]]; for (const [dx, dy] of D) p.set(px + dx, py + dy, Math.abs(dx) + Math.abs(dy) === 3 ? R.ink[1] : dx + dy < 0 ? R.rust[5] : R.rust[3]); }
    // the camera's view: a hard pixel trapezoid
    const cs: [number, number][] = [];
    for (const [sx, sy] of [[0, 62], [innerWidth, 62], [innerWidth, innerHeight], [0, innerHeight]]) { const gp = this.groundRay(sx, sy); if (gp) cs.push(P(gp[0], gp[1])); }
    if (cs.length === 4) for (let i = 0; i < 4; i++) { const [a0, b0] = cs[i], [a1, b1] = cs[(i + 1) % 4]; p.line(Math.max(-2, Math.min(S + 2, a0)), Math.max(-2, Math.min(S + 2, b0)), Math.max(-2, Math.min(S + 2, a1)), Math.max(-2, Math.min(S + 2, b1)), R.snow[5]); }
    x.putImageData(p.image(), 0, 0);
    const hd = this.mapHd.lastElementChild as HTMLElement; hd.textContent = `${Math.round(c.pod.x)}·${Math.round(c.pod.z)}  SIG ${c.controlRadius}M`;
  }
  /** where a screen point's ray meets the ground plane at the pod's height (cheap, for the map's view box) */
  private groundRay(sx: number, sy: number): [number, number] | null {
    const g = this.g!, rc = g.cam.ray(sx, sy), o = rc.ray.origin, d = rc.ray.direction, h = g.colony?.pod.y ?? 0;
    if (d.y > -0.02) { const t = 160; return [o.x + d.x * t, o.z + d.z * t]; }
    const t = Math.min(220, (h - o.y) / d.y); return [o.x + d.x * t, o.z + d.z * t];
  }

  // ------------------------------------------------------------------ alerts
  private drawAlerts(c: Colony) {
    const list = c.alerts.slice(0, 7), key = list.map((a) => a.id + ':' + a.n).join();
    const now = performance.now();
    if (key !== this.alertKey) {
      this.alertKey = key;
      this.alertsEl.innerHTML = '';
      for (const a of list) {
        const e = el('div', `cx-al ${a.level}`, this.alertsEl);
        const dc = document.createElement('canvas'); dc.width = 13; dc.height = 13; const dp = new Pix(13, 13);
        alertIcon(dp, a.level);
        dc.getContext('2d')!.putImageData(dp.image(), 0, 0); e.appendChild(dc);
        el('div', '', e, esc(a.text)); el('div', 'tm', e, this.stamp(a));
        if (a.n > 1) el('div', 'n', e, 'x' + a.n);
        e.onclick = (ev) => { ev.stopPropagation(); if (a.at) this.g?.cam.lookAt(a.at.x, a.at.z); sfx('click', 1.2, 0.4); };
        (e as unknown as { _a: Alert })._a = a;
      }
    }
    for (const e of Array.from(this.alertsEl.children) as HTMLElement[]) { const a = (e as unknown as { _a: Alert })._a; e.classList.toggle('old', now - a.real > 25000); }
  }
  private stamp(a: Alert) { const g = this.g; if (!g) return ''; const d = ((a.t / ((g as unknown as { climate?: { dayLength?: number } }).climate?.dayLength ?? 240)) + 0.25) % 1; return `${String(Math.floor(d * 24)).padStart(2, '0')}:${String(Math.floor((d * 24 * 60) % 60)).padStart(2, '0')}`; }

  // ------------------------------------------------------------------ the selected unit
  private buildSel() {
    this.selEl = el('div', 'cx-plate cx-sel pe', this.root);
    skin(this.selEl, (w, h) => { const p = platePix(w, h, { mat: 'enamel', seed: 11, wear: 1.2, rivets: true }); for (let y = 8; y < 8 + 118; y++) for (let x = 9; x < 9 + 168; x++) p.clear(x, y); return p; });
    this.viewEl = el('div', 'view', this.selEl);
    this.calloutCv = document.createElement('canvas'); this.viewEl.appendChild(this.calloutCv);
    this.selHd = el('div', 'hd', this.selEl);
    const scr = el('div', 'cx-glass scr cx-ph', this.selEl);
    this.selRows = el('div', '', scr);
    this.selActs = el('div', 'acts', this.selEl);
    this.selWorks = el('div', 'cx-works', this.selEl);
    this.selEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  private selName(s: Sel): [string, string, string] {
    switch (s.kind) {
      case 'pod': return ['UNAA COLONY POD CP-07', 'HOME BASE · UNIT 07', 'u-pod'];
      case 'arm': return [s.ref.name, s.ref.def.name.toUpperCase(), CATALOG[('arm_' + s.ref.kind) as keyof typeof CATALOG]?.icon ?? 't-claw'];
      case 'drone': return [s.ref.name, s.ref.def.name.toUpperCase(), s.ref.kind === 'scout' ? 't-scout' : s.ref.kind === 'carrier' ? 't-carrier' : 't-repairdrone'];
      case 'crew': return [s.ref.name.toUpperCase(), s.ref.title, 'v-morale'];
      case 'struct': return [s.ref.name, s.ref.done ? 'AREA STRUCTURE' : 'UNDER CONSTRUCTION', CATALOG[s.ref.cat].icon];
      case 'creature': return [s.ref.sp.name.toUpperCase(), `${s.ref.sp.role.toUpperCase()} · ${s.ref.faction === 'wild' ? 'WILD' : s.ref.faction.toUpperCase()}`, 't-scanner'];
    }
  }
  private bar(v: number, warn = 0.35, crit = 0.15) { const cls = v <= crit ? 'crit' : v <= warn ? 'warn' : ''; return `<div class="cx-bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></div>`; }
  private row(k: string, v: number | null, text: string, warn?: number, crit?: number) { return `<div class="cx-row"><span class="k">${k}</span>${v === null ? '<span></span>' : this.bar(v, warn, crit)}<span class="v">${text}</span></div>`; }
  private drawSel(c: Colony) {
    const s = c.sel;
    this.selEl.classList.toggle('on', !!s);
    if (!s) { this.selKey = ''; return; }
    const ref = (s as { ref?: unknown }).ref;
    const key = s.kind + ':' + ((ref as { id?: unknown })?.id ?? '') + ':' + (s.kind === 'struct' ? s.ref.mode + s.ref.done : '') + (s.kind === 'drone' ? String(s.ref.docked) : '') + c.fits.length;
    if (key !== this.selKey) {
      this.selKey = key;
      const [nm, ty, ic] = this.selName(s);
      this.selHd.innerHTML = '';
      const pic = el('div', 'cx-glass pic', this.selHd); pic.appendChild(iconImg(ic, 64));
      const tx = el('div', '', this.selHd); el('div', 'nm cx-sten', tx, esc(nm)); el('div', 'ty', tx, esc(ty));
      this.buildActs(c, s);
      this.worksKey = '';
    }
    // rows, live
    let h = '';
    const v = c.vitals;
    if (s.kind === 'pod') {
      h += this.row('HULL', c.pod.hp / c.pod.maxHp, pct(c.pod.hp / c.pod.maxHp), 0.45, 0.2);
      h += this.row('BATTERY', v.battery / v.batteryCap, `${v.battery.toFixed(0)}`, 0.3, 0.12);
      h += this.row('GEN/DRAW', null, `${v.gen.toFixed(0)}/${v.draw.toFixed(0)} kW`);
      h += this.row('O2 TANK', v.o2 / 100, pct(v.o2 / 100));
      h += this.row('RATIONS', null, `${v.rations.toFixed(1)}`);
      h += this.row('HARDPOINTS', null, `${c.arms.length} / 6`);
      h += this.row('DRONE PAD', null, `${c.drones.length} / 6`);
    } else if (s.kind === 'arm') {
      const a = s.ref, fit = c.fitOf(a);
      h += this.row('CONDITION', a.hp / a.maxHp, pct(a.hp / a.maxHp), 0.4, 0.15);
      h += this.row('REACH', null, `${a.reach.toFixed(1)} M`);
      h += this.row('POWER', null, `${a.def.idleKW}/${a.def.workKW} kW`);
      h += this.row('SLOT LEVEL', null, `LV ${a.level}`);
      h += `<div class="st">${fit < 1 ? `FITTING · ${Math.round(fit * 100)}%` : a.controlled ? 'UNDER DIRECT CONTROL' : a.hp <= 0 ? 'KNOCKED OUT · WELD IT' : 'PARKED · CLICK TO CONTROL'}</div>`;
    } else if (s.kind === 'drone') {
      const d = s.ref, fit = c.fitOf(d);
      h += this.row('CONDITION', d.hp / d.maxHp, pct(d.hp / d.maxHp), 0.4, 0.15);
      h += this.row('BATTERY', d.battery / d.def.battery, pct(d.battery / d.def.battery), 0.3, 0.12);
      h += this.row('SIGNAL', d.signal(), d.signal() >= 1 ? 'FULL' : d.signal() > 0 ? 'WEAK' : 'LOST', 0.6, 0.2);
      h += `<div class="st">${fit < 1 ? `ASSEMBLING · ${Math.round(fit * 100)}%` : d.steering ? 'STEERED' : d.docked ? 'DOCKED · CHARGING' : d.order ? `ORDER: ${d.order.k.toUpperCase()}` : 'HOVERING'}</div>`;
    } else if (s.kind === 'crew') {
      const t = s.ref;
      h += this.row('HEALTH', t.hp / 100, `${Math.round(t.hp)}`, 0.5, 0.25);
      h += this.row('SUIT O2', t.suit / 100, `${Math.round(t.suit)}`, 0.3, 0.15);
      h += this.row('FED', 1 - t.hunger / 100, `${Math.round(100 - t.hunger)}`, 0.3, 0.12);
      h += this.row('RESTED', 1 - t.fatigue / 100, `${Math.round(100 - t.fatigue)}`, 0.25, 0.1);
      h += this.row('MORALE', t.morale / 100, `${Math.round(t.morale)}`, 0.35, 0.15);
      h += `<div class="st">${t.jobLabel}${t.queue.length ? ` · +${t.queue.length} QUEUED` : ''}</div>`;
    } else if (s.kind === 'struct') {
      const st = s.ref;
      h += this.row('CONDITION', st.hp / st.maxHp, pct(st.hp / st.maxHp), 0.4, 0.15);
      if (!st.done) h += this.row('BUILT', st.progress, pct(st.progress));
      h += this.row('POWER', null, `${st.kw.toFixed(1)} kW`);
      if (st.kind === 'gravpole') h += `<div class="st">FIELD: ${st.mode.toUpperCase()}</div>`;
    } else if (s.kind === 'creature') {
      const cr = s.ref;
      h += this.row('CONDITION', cr.hp / cr.maxHp, pct(cr.hp / cr.maxHp));
      h += this.row('MASS', null, `${Math.round(cr.mass)} KG`);
      h += `<div class="st">${cr.dead ? 'DEAD' : cr.mind.toUpperCase()}</div>`;
    }
    if (h !== (this.selRows as unknown as { _h?: string })._h) { this.selRows.innerHTML = h; (this.selRows as unknown as { _h?: string })._h = h; }
    if (s.kind === 'pod') this.drawWorks(c); else if (this.selWorks.childElementCount) this.selWorks.innerHTML = '';
  }
  private btn(parent: HTMLElement, label: string, f: () => void, tip?: string, cls = '') {
    const b = el('button', 'cx-btn ' + cls, parent, label); b.onclick = (e) => { e.stopPropagation(); sfx('click'); f(); this.selKey = ''; };
    if (tip) this.hoverTip(b, () => tip);
    return b;
  }
  private buildActs(c: Colony, s: Sel) {
    const A = this.selActs; A.innerHTML = '';
    const say = (why: string) => { if (why) this.flash(why, true); };
    if (s.kind === 'pod') {
      this.btn(A, 'SHIP AI LINK', () => c.shipLink(), 'Return to the ship through the AI link (the colony pauses).', 'blue');
      this.btn(A, 'CENTRE VIEW', () => this.g?.cam.lookAt(c.pod.x, c.pod.z));
    } else if (s.kind === 'arm') {
      const a = s.ref;
      this.btn(A, a.kind === 'cannon' ? 'GUNNER\'S SEAT' : 'TAKE CONTROL', () => say(c.control('arm:' + a.id)), 'Drive the arm: its tip follows the pointer inside its reach; the left button works the tool.', 'on');
      for (const t of TOOL_ORDER) if (TOOLS[t].arms.includes(a.kind) && a.kind !== 'cannon') this.btn(A, TOOLS[t].name.toUpperCase(), () => say(c.control('arm:' + a.id, t)), TOOLS[t].desc);
    } else if (s.kind === 'drone') {
      const d = s.ref;
      this.btn(A, 'STEER [ENTER]', () => say(c.control('drone:' + d.id)), 'Fly it yourself: WASD, R/F altitude, Shift boost, the pointer aims, the left button works its tool.', 'on');
      this.btn(A, 'RETURN', () => { d.order = { k: 'return' }; });
      this.btn(A, 'PATROL', () => { const p = c.pod, r = 16; d.order = { k: 'patrol', pts: [0, 1, 2, 3, 4, 5].map((i) => [p.x + Math.cos(i * 1.05) * r, p.z + Math.sin(i * 1.05) * r] as [number, number]), i: 0 }; d.docked = false; }, 'Circle the colony at sixteen metres.');
      if (d.kind === 'scout') this.btn(A, 'AREA SCAN', () => c.scanArea(d.x, d.z, 14, d), 'Scan everything within fourteen metres of the drone.');
    } else if (s.kind === 'crew') {
      const t = s.ref;
      this.btn(A, 'BACK TO POD', () => t.order({ k: 'refill', x: 0, z: 0, label: 'BACK TO THE POD' }));
      this.btn(A, 'HOLD HERE', () => t.order({ k: 'move', x: t.x, z: t.z }));
      this.btn(A, 'OWN JUDGEMENT', () => { t.job = null; t.queue = []; }, 'Clear their orders: they pick their own jobs.');
    } else if (s.kind === 'struct') {
      const st = s.ref;
      if (st.kind === 'gravpole') for (const m of ['lift', 'push', 'pull', 'off'] as const) { const b = this.btn(A, m.toUpperCase(), () => { st.mode = m; }, m === 'lift' ? 'Float everything inside the field.' : m === 'push' ? 'Throw everything out of the field.' : m === 'pull' ? 'Drag everything in toward the pole.' : 'Field off (saves power).'); if (st.mode === m) b.classList.add('on'); }
      if (st.kind === 'sensor') this.btn(A, 'AREA SCAN', () => c.scanArea(st.x, st.z, 18, st));
      this.btn(A, 'CENTRE VIEW', () => this.g?.cam.lookAt(st.x, st.z));
    }
  }
  /** the pod's works: arms, drones, area structures, limbs (costly; parts from the stores) */
  private drawWorks(c: Colony) {
    const key = this.worksTab + '|' + CAT_ORDER.map((id) => c.canBuild(id)).join('|');
    if (key === this.worksKey) return; this.worksKey = key;
    const W = this.selWorks; W.innerHTML = '';
    el('div', 'cx-sten', W, 'POD WORKS').style.cssText = 'margin:2px 0 6px';
    const tabs = el('div', 'cx-tabs', W);
    for (const [k, n] of [['arm', 'ARMS'], ['drone', 'DRONES'], ['structure', 'AREA'], ['limb', 'LIMBS']] as [CatKind, string][]) { const b = el('button', 'cx-btn' + (this.worksTab === k ? ' on' : ''), tabs, n); b.onclick = (e) => { e.stopPropagation(); this.worksTab = k; this.worksKey = ''; sfx('click', 1.3, 0.4); }; }
    const tiles = el('div', 'cx-tiles', W);
    for (const id of CAT_ORDER) {
      const e = CATALOG[id]; if (e.kind !== this.worksTab) continue;
      const why = c.canBuild(id), t = el('div', 'cx-tile' + (why ? ' no' : ''), tiles);
      t.appendChild(iconImg(e.icon, 58));
      const tx = el('div', '', t); el('div', 'n', tx, e.name.toUpperCase());
      el('div', 'c', tx, Object.entries(e.cost).map(([it, n]) => { const have = c.stock.count(it); return `${have >= n ? '<em>' : '<b>'}${n} ${esc(ITEMS[it]?.name ?? it)}${have >= n ? '</em>' : '</b>'}`; }).join(' · ') + ` · ${e.time}s${e.kw ? ` · ${e.kw} kW` : ''}`);
      this.hoverTip(t, () => `<b>${e.name.toUpperCase()}</b><br>${e.desc}${e.kind === 'arm' ? `<br>Reach ${(ARM_DEF[e.arm!].l1 + ARM_DEF[e.arm!].l2).toFixed(1)} m boom` : ''}${why ? `<br><span class="r">${esc(why)}</span>` : '<br><span class="w">CLICK TO BUILD</span>'}`);
      t.onclick = (ev) => { ev.stopPropagation(); const err = c.build(id); if (err) this.flash(err, true); else { sfx('build'); this.worksKey = ''; } };
    }
  }

  // ------------------------------------------------------------------ control banner, wheel info, slot config
  private drawCtl(c: Colony) {
    const k = c.ctl;
    let key = k.k, html = '';
    if (k.k === 'arm') { key += k.arm.id + k.tool; html = `<span class="big cx-sten">${k.arm.name}</span><span class="cx-ph">DIRECT CONTROL · ${TOOLS[k.tool].name.toUpperCase()}</span><span class="keys"><b>LMB</b> ${TOOLS[k.tool].hold ? 'HOLD TO WORK' : 'USE'} ${k.arm.kind === 'manipulator' ? '<b>[ ]</b> TOOL ' : ''}<b>RMB</b>/<b>ESC</b> RELEASE</span>`; }
    else if (k.k === 'drone') { const d = k.drone; key += d.id + Math.round(d.battery / 5) + (d.signal() >= 1 ? 1 : 0); html = `<span class="big cx-sten">${d.name}</span><span class="cx-ph">STEERING · BATT ${Math.round(d.battery)}% · ${d.signal() >= 1 ? 'SIGNAL OK' : '<span style="color:#e2b04a">SIGNAL WEAK</span>'}</span><span class="keys"><b>WASD</b> FLY <b>R</b>/<b>F</b> ALT <b>SHIFT</b> BOOST <b>LMB</b> ${k.tool ? TOOLS[k.tool].name.toUpperCase() : 'TOOL'} <b>RMB</b>/<b>ESC</b> RELEASE</span>`; }
    else if (k.k === 'place') { const t = c.target, why = t.ok ? c.placeWhy(t.x, t.z) : ''; key += k.id + why; html = `<span class="big cx-sten">PLACING · ${CATALOG[k.id].name.toUpperCase()}</span>${why ? `<span style="color:#da876a;font-family:Body,monospace;font-size:22px">${esc(why.toUpperCase())}</span>` : '<span class="cx-ph">CLEAR TO BUILD</span>'}<span class="keys"><b>LMB</b> PLACE <b>SHIFT</b> KEEP PLACING <b>RMB</b>/<b>ESC</b> CANCEL</span>`; }
    if (key !== this.ctlKey) { this.ctlKey = key; this.ctlEl.innerHTML = html; this.ctlEl.classList.toggle('on', !!html); }
  }
  /** the tool plate: the tool's picture, its name, level pips and the icon of the unit that runs it (no prose) */
  private drawWheelInfo(c: Colony) {
    const i = this.wheel.hover >= 0 ? this.wheel.hover : c.slots.active >= 0 ? c.slots.active : this.wheel.focus, s = c.slots.slots[i];
    const u = s.tool ? c.slots.unitOf(i) : null, ref = u ? c.unitById(u) : null;
    const key = `${i}|${s.tool}|${s.level}|${u}|${this.flashT > 0 ? this.flashMsg : ''}|${c.slots.active === i}`;
    if (key === (this.wheelInfo as unknown as { _k?: string })._k) return; (this.wheelInfo as unknown as { _k?: string })._k = key;
    const W = this.wheelInfo; W.innerHTML = '';
    if (this.flashT > 0) { el('div', 'tn', W, 'NO').style.color = '#8c2920'; el('div', 'un', W, esc(this.flashMsg.slice(0, 40))); return; }
    el('div', 'tn', W, s.level <= 0 ? 'LOCKED' : s.tool ? esc(TOOLS[s.tool].name.toUpperCase().split(' ').pop()!) : 'EMPTY');
    const row = el('div', 'wrow', W);
    if (s.tool) row.appendChild(iconImg(TOOLS[s.tool].icon, 64));
    const pips = el('div', 'pips', row); for (let k = 0; k < 3; k++) el('i', k < s.level ? 'on' : '', pips);
    if (ref) { const kind = (ref as { kind?: string }).kind ?? '', ic = u!.startsWith('arm') ? (CATALOG[('arm_' + kind) as keyof typeof CATALOG]?.icon ?? 't-claw') : u!.startsWith('drone') ? (kind === 'scout' ? 't-scout' : kind === 'carrier' ? 't-carrier' : 't-repairdrone') : 't-pole'; const ui = iconImg(ic, 44); ui.classList.add('unit'); row.appendChild(ui); }
    else if (s.tool) { const x = el('div', 'nou', row, '!'); x.title = 'no unit'; }
  }
  openCfg(i: number) { this.cfgSlot = i; this.cfgKey = ''; this.cfgEl.classList.add('on'); }
  private drawCfg(c: Colony) {
    if (this.cfgSlot < 0) { this.cfgEl.classList.remove('on'); return; }
    const i = this.cfgSlot, s = c.slots.slots[i], why = c.slots.whyNotUpgrade(i);
    const key = `${i}|${s.tool}|${s.unit}|${s.level}|${why}|${c.arms.length}|${c.drones.length}|${c.structures.length}`;
    if (key === this.cfgKey) return; this.cfgKey = key;
    const E = this.cfgEl; [...E.querySelectorAll(':scope > :not(.cx-screw)')].forEach((x) => x.remove());
    const hd = el('div', '', E); hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center';
    el('div', 'cx-sten', hd, `SLOT ${i + 1} · LEVEL ${s.level}`);
    const x = el('button', 'cx-btn', hd, 'CLOSE'); x.onclick = (e) => { e.stopPropagation(); this.cfgSlot = -1; sfx('close'); };
    if (s.level > 0) {
      el('div', 'cx-lbl', E, 'TOOL IN THIS SLOT').style.marginTop = '8px';
      const tg = el('div', 'tg', E);
      for (const t of TOOL_ORDER) {
        const n = c.slots.candidates(t).length, b = el('div', 'tt' + (s.tool === t ? ' on' : '') + (n ? '' : ' nu'), tg);
        b.appendChild(iconImg(TOOLS[t].icon, 40)); el('span', '', b, TOOLS[t].name.toUpperCase());
        this.hoverTip(b, () => `<b>${TOOLS[t].name.toUpperCase()}</b><br>${TOOLS[t].desc}<br>${n ? `${n} unit${n > 1 ? 's' : ''} can run it` : '<span class="r">Nothing built can run it yet</span>'}`);
        b.onclick = (e) => { e.stopPropagation(); c.slots.assign(i, t as ToolId); sfx('click', 1.2, 0.5); };
      }
      if (s.tool) {
        el('div', 'cx-lbl', E, 'UNIT');
        const us = el('div', 'units', E), cands = c.slots.candidates(s.tool), cur = c.slots.unitOf(i);
        if (!cands.length) el('div', 'cx-ph', us, 'NO UNIT CAN RUN IT · BUILD ONE IN POD WORKS');
        for (const u of cands) { const b = el('button', 'cx-btn' + (u.id === cur ? ' on' : ''), us, u.name); b.onclick = (e) => { e.stopPropagation(); c.slots.assign(i, s.tool, u.id); sfx('click', 1.2, 0.5); }; }
      }
    }
    const up = el('div', 'cx-glass up cx-ph', E);
    const cost = c.slots.costOf(i);
    up.innerHTML = s.level >= 3 ? 'SLOT FULLY UPGRADED' : `${s.level <= 0 ? 'OPEN THIS SLOT' : `UPGRADE TO LEVEL ${s.level + 1}`}: ${s.level <= 0 ? 'unlocks it' : '+35% power and reach, faster recharge'}<br>${Object.entries(cost).map(([it, n]) => `${n} ${esc(ITEMS[it]?.name ?? it)}`).join(' · ')}${why ? `<br><span style="color:#e0604a">${esc(why)}</span>` : ''}`;
    const ub = el('button', 'cx-btn amber' + (why ? ' off' : ''), E, s.level <= 0 ? 'OPEN SLOT' : 'UPGRADE SLOT'); ub.style.marginTop = '8px';
    ub.onclick = (e) => { e.stopPropagation(); const err = c.slots.upgrade(i); if (err) { sfx('deny'); this.flash(err, true); } else { sfx('build'); sfx('done', 1, 0.6); } this.cfgKey = ''; };
  }

  // ------------------------------------------------------------------ the living vignette
  /** where the selection's live close-up goes (css px), or null when nothing is selected */
  vignetteRect() {
    if (this.root.style.display === 'none' || !this.selEl.classList.contains('on')) return null;
    const r = this.viewEl.getBoundingClientRect(); if (r.width < 10) return null;
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }
  /** the hand-drawn frame over the close-up and its callouts: leader lines from the parts to lettered paper scraps */
  vignetteDrawn(f: { pos: THREE.Vector3; anchors: { p: THREE.Vector3; text: string; warn?: boolean }[] } | null, cam: THREE.PerspectiveCamera, rect: { w: number; h: number }) {
    this.callT -= 1 / 30; if (this.callT > 0) return; this.callT = 0.08;
    const W = Math.round(rect.w / 2), H = Math.round(rect.h / 2), cv = this.calloutCv;
    if (cv.width !== W) { cv.width = W; cv.height = H; }
    const p = new Pix(W, H);
    // the frame: a sketched border, two strips of tape, a pin
    // the window's sunk bevel: shaded on top and left, a lit lip below and right
    p.hl(0, W - 1, 0, R.ink[0]); p.vl(0, 0, H - 1, R.ink[0]); p.hl(1, W - 2, 1, R.ink[1]); p.vl(1, 1, H - 2, R.ink[1]); p.hl(0, W - 1, H - 1, R.bone[5]); p.vl(W - 1, 0, H - 1, R.bone[5]); p.hl(1, W - 2, H - 2, R.bone[3]); p.vl(W - 2, 1, H - 2, R.bone[3]);
    if (f) {
      const used: number[] = [];
      f.anchors.forEach((a, i) => {
        const v = a.p.clone().project(cam); if (v.z > 1) return;
        const ax = Math.round((v.x * 0.5 + 0.5) * W), ay = Math.round((-v.y * 0.5 + 0.5) * H);
        if (ax < 2 || ay < 2 || ax > W - 3 || ay > H - 3) return;
        const left = ax > W / 2, tw = textWidth(a.text) + 6;
        let ly = Math.max(6, Math.min(H - 18, ay - 20 + (i % 2) * 10)); while (used.some((u) => Math.abs(u - ly) < 15)) ly += 15; used.push(ly);
        const lx = left ? 6 : W - 6 - tw;
        // leader: a dot on the part, an inked line to the scrap
        p.rect(ax - 1, ay - 1, 3, 3, a.warn ? R.stampRed[3] : R.ink[1]); p.set(ax, ay, R.paper[5]);
        p.line(ax, ay, left ? lx + tw : lx, ly + 6, a.warn ? R.stampRed[3] : R.ink[0]);
        for (let y = ly; y < ly + 13; y++) for (let x = lx; x < lx + tw; x++) p.set(x, y, a.warn ? R.coral[5] : y === ly ? R.bone[5] : R.bone[4]); p.set(lx + 1, ly + 2, R.steel[4]); p.set(lx + tw - 2, ly + 2, R.steel[4]);
        p.hl(lx, lx + tw - 1, ly + 13, R.ink[0]); p.vl(lx + tw, ly, ly + 13, R.ink[0]);
        fontText(p, a.text, lx + 3, ly + 1, a.warn ? R.stampRed[1] : R.ink[1]);
      });
    }
    cv.getContext('2d')!.putImageData(p.image(), 0, 0);
  }

  // ------------------------------------------------------------------ tooltips, flashes
  private hoverTip(e: HTMLElement, f: () => string) {
    e.addEventListener('pointerenter', (ev) => this.tip(f(), ev.clientX, ev.clientY));
    e.addEventListener('pointermove', (ev) => this.tip(f(), ev.clientX, ev.clientY));
    e.addEventListener('pointerleave', () => this.tip(null));
  }
  tip(html: string | null, x = 0, y = 0) {
    const t = this.tipEl;
    if (!html) { t.style.display = 'none'; return; }
    if (t.innerHTML !== html) t.innerHTML = html;
    t.style.display = 'block';
    const w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = `${Math.min(innerWidth - w - 8, x + 16)}px`; t.style.top = `${Math.min(innerHeight - h - 8, y + 18)}px`;
  }
  flash(msg: string, bad = false) { this.flashMsg = msg; this.flashT = 2.4; void bad; }

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    this.t += dt; this.flashT = Math.max(0, this.flashT - dt);
    const c = this.colony, g = this.g;
    const show = !!c && c.ready && !c.fail$.on;
    this.root.style.display = show ? '' : 'none';
    if (!show || !c || !g) { this.tip(null); return; }
    document.body.classList.toggle('cx-paused', g.paused);
    this.pausebar.classList.toggle('on', g.paused && !c.linkOpen);
    this.timeBtns.forEach((b, i) => b.classList.toggle('on', i === 0 ? g.paused : !g.paused && g.speed === i));
    this.wheel.update(dt);
    this.drawCtl(c);
    this.slow -= dt;
    if (this.slow > 0) return;
    this.slow = 0.15;
    for (const e of this.vitEls) this.drawVital(e, c);
    const day = g.world.day, hh = Math.floor(((day + 0.25) % 1) * 24), mm = Math.floor(((((day + 0.25) % 1) * 24) % 1) * 60);
    const ck = `<span>SOL ${c.sol}</span><small>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${g.paused ? 'PAUSED' : g.speed + 'x'}</small>`;
    if (this.clock.innerHTML !== ck) this.clock.innerHTML = ck;
    const crit = Object.values(c.vitals.levels).includes('crit');
    this.alarm.classList.toggle('on', crit);
    const so = c.vitals.soonest();
    this.count.classList.toggle('on', !!so && c.ctl.k === 'rts');
    if (so) { (this.count.firstElementChild as HTMLElement).textContent = `COLLAPSE · ${so.k === 'workers' ? 'NO WORKERS' : so.k.toUpperCase()}`; (this.count.lastElementChild as HTMLElement).textContent = mmss(Math.max(0, so.t)); }
    this.mapT -= 0.2; if (this.mapT <= 0) { this.mapT = 0.4; this.drawMap(c); }
    this.drawAlerts(c);
    this.drawSel(c);
    this.drawWheelInfo(c);
    this.drawCfg(c);
  }
  key(k: string) {
    if (this.wheel.key(k)) return true;
    return false;
  }
  escape() { if (this.cfgSlot >= 0) { this.cfgSlot = -1; return true; } return false; }
  dispose() { removeEventListener('resize', this.onResize); this.root.remove(); this.tipEl.remove(); document.body.classList.remove('cx-paused'); }
}
/** a bezel round a dial: a lit steel ring */
function dialBezel(p: Pix, x: number, y: number, D: number) {
  const c = (D - 1) / 2, r = D / 2 + 1.6;
  for (let j = -2; j < D + 2; j++) for (let i = -2; i < D + 2; i++) { const dx = i - c, dy = j - c, d = Math.hypot(dx, dy); if (d > r || d < r - 2.2) continue; const l = -(dx * 0.6 + dy * 0.8) / (d || 1); p.set(x + i, y + j, d > r - 0.8 ? R.steel[0] : R.steel[l > 0.3 ? 5 : l > -0.3 ? 3 : 2]); }
}
/** a clean pixel icon for an alert sign: a red triangle with a bang, an amber diamond, a green tick, a steel dot */
function alertIcon(p: Pix, level: string) {
  if (level === 'bad' || level === 'crit') { for (let y = 0; y < 11; y++) { const hw = Math.floor(y / 2); p.hl(6 - hw, 6 + hw, y + 1, y === 10 ? R.stampRed[1] : R.stampRed[3]); p.set(6 - hw, y + 1, R.coral[5]); } p.rect(6, 4, 1, 4, R.bone[5]); p.set(6, 9, R.bone[5]); }
  else if (level === 'warn') { for (let y = 0; y < 11; y++) { const hw = 5 - Math.abs(5 - y); p.hl(6 - hw, 6 + hw, y + 1, R.ochre[4]); p.set(6 - hw, y + 1, R.ochre[5]); p.set(6 + hw, y + 1, R.ochre[2]); } p.rect(6, 3, 1, 5, R.ink[1]); p.set(6, 9, R.ink[1]); }
  else if (level === 'good') { p.line(1, 7, 4, 10, R.moss[4]); p.line(4, 10, 11, 2, R.moss[4]); p.line(1, 8, 4, 11, R.moss[2]); p.line(4, 11, 11, 3, R.moss[2]); }
  else { p.rect(3, 3, 7, 7, R.steel[3]); p.hl(3, 9, 3, R.steel[5]); p.vl(9, 3, 9, R.steel[1]); p.hl(3, 9, 9, R.steel[1]); p.rect(6, 5, 1, 3, R.ink[1]); }
}

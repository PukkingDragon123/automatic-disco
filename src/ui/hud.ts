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
import { iconCanvas, iconImg, screws } from './desk/hudArt';
import './desk/toolIcons';
import { decalSheet, DECAL } from '../colony/tex';
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
    // the wheel
    const wp = el('div', 'cx-plate cx-wheel pe', this.root); screws(wp, 6);
    el('div', 'hd cx-sten', wp, 'TOOL WHEEL');
    this.wheelInfo = el('div', 'cx-glass info cx-ph', wp);
    this.wheel = new ToolWheel(wp, { colony: () => this.colony, config: (i) => this.openCfg(i), tip: (h, x, y) => this.tip(h, x, y), flash: (m, b) => this.flash(m, b) });
    const cfg = el('button', 'cx-btn cfg', wp, 'CONFIGURE SLOTS'); cfg.onclick = () => this.openCfg(this.wheel.hover >= 0 ? this.wheel.hover : Math.max(0, this.colony?.slots.active ?? 0));
    this.cfgEl = el('div', 'cx-plate cx-slotcfg pe', this.root); screws(this.cfgEl, 6);
    addEventListener('resize', this.onResize);
    this.root.style.display = 'none';
  }
  get colony(): Colony | null { return this.c.game?.colony ?? null; }
  get g() { return this.c.game; }
  setClimate(c: Climate) { this.climate = c; }
  invalidate() { this.selKey = ''; this.worksKey = ''; this.cfgKey = ''; }

  // ------------------------------------------------------------------ top bar
  private buildTop() {
    const top = el('div', 'cx-plate cx-top pe', this.root);
    const id = el('div', 'cx-id', top);
    const rc = document.createElement('canvas'); rc.className = 'roundel'; rc.width = 80; rc.height = 80; id.appendChild(rc);
    const [x, y, w] = DECAL.roundel, img = decalSheet().image as HTMLCanvasElement; try { rc.getContext('2d')!.drawImage(img, x, y, w, w, 0, 0, 80, 80); } catch { /* no decal */ }
    const tx = el('div', '', id);
    el('div', 't1 cx-sten', tx, 'UNAA · CP-07');
    const t2 = el('div', 't2', tx, esc(this.c.regionName.toUpperCase())); void t2;
    const link = el('button', 'cx-btn blue cx-link', id); link.appendChild(iconImg('v-link', 30)); el('span', '', link, 'SHIP AI LINK');
    link.onclick = (e) => { e.stopPropagation(); sfx('click'); this.colony?.shipLink(); };
    this.hoverTip(link, () => '<b>SHIP AI LINK</b><br>Talk to the ship\'s AI and return to the research ship. The colony waits, paused, until you come back.');
    rc.style.cursor = 'pointer'; rc.onclick = () => { const c = this.colony; if (c) { c.select({ kind: 'pod' }); this.g?.cam.lookAt(c.pod.x, c.pod.z); } };
    const vit = el('div', 'cx-vitals', top);
    for (const v of VITALS) {
      const e = el('div', 'cx-plate gun cx-vit', vit), cv = document.createElement('canvas'); e.appendChild(cv);
      this.vitEls.push({ id: v.id, el: e, cv, icon: null });
      this.hoverTip(e, () => this.vitalTip(v.id));
    }
    const tm = el('div', 'cx-plate gun cx-time', top);
    const mk = (label: string, tip: string, f: () => void) => { const b = el('button', 'cx-btn', tm, label); b.onclick = (e) => { e.stopPropagation(); f(); }; this.hoverTip(b, () => tip); this.timeBtns.push(b); return b; };
    mk('❚❚', '<b>PAUSE</b> [SPACE]<br>Orders, building and control still work while paused.', () => this.colony?.togglePause());
    mk('1×', '<b>NORMAL SPEED</b> [1]', () => this.colony?.setSpeed(1));
    mk('2×', '<b>FAST</b> [2]', () => this.colony?.setSpeed(2));
    mk('3×', '<b>FASTEST</b> [3]', () => this.colony?.setSpeed(3));
    this.clock = el('div', 'cx-glass clock cx-ph', tm);
    this.pausebar = el('div', 'cx-plate gun cx-pausebar cx-sten', this.root, 'PAUSED · ORDERS ACCEPTED');
    this.count = el('div', 'cx-plate gun cx-count', this.root, '<div class="h cx-sten"></div><div class="v"></div>');
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
  private drawVital(e: { id: VitalId; el: HTMLDivElement; cv: HTMLCanvasElement; icon: HTMLCanvasElement | null }, c: Colony) {
    const dpr = Math.min(2, Math.max(1, devicePixelRatio || 1)), W = 172, H = 50, cv = e.cv;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false;
    const v = c.vitals, lvl = v.levels[e.id], col = COLS[lvl], val = v.value(e.id);
    const meta = VITALS.find((x) => x.id === e.id)!;
    // the glass well
    g.fillStyle = '#0b130e'; g.fillRect(44, 4, 124, 42); g.strokeStyle = '#121410'; g.lineWidth = 2; g.strokeRect(44, 4, 124, 42);
    for (let y = 5; y < 46; y += 3) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(45, y, 122, 1); }
    e.icon ??= iconCanvas(meta.icon, 36 * Math.round(dpr));
    if (e.icon) g.drawImage(e.icon, 5, 7, 36, 36);
    // sparkline of the last two minutes
    const h = v.hist[e.id];
    if (h.length > 1) { g.beginPath(); h.forEach((x, i) => { const px = 112 + (i / 59) * 52, py = 30 - x * 20; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.strokeStyle = 'rgba(143,224,154,0.28)'; g.lineWidth = 1; g.stroke(); }
    g.font = "12px 'Jersey', sans-serif"; g.fillStyle = '#9fb08a'; g.textBaseline = 'top'; g.fillText(meta.name, 50, 7);
    let main = pct(val), sub = '';
    if (e.id === 'power') { main = `${v.battery.toFixed(0)} kWh`; const n = v.gen - v.draw; sub = `${n >= 0 ? '+' : ''}${n.toFixed(1)} kW`; }
    if (e.id === 'oxygen') sub = v.levels.power === 'crit' ? 'SCRUB OFF' : '';
    if (e.id === 'food') { main = `${v.food.toFixed(0)} MEALS`; }
    if (e.id === 'integrity') sub = c.pod.braced ? 'BRACED' : '';
    const tk = e.id === 'power' ? v.timers.power : e.id === 'oxygen' ? v.timers.oxygen : e.id === 'food' ? v.timers.food : e.id === 'health' ? v.timers.workers : null;
    if (tk !== null && tk !== undefined) sub = `⚠ ${mmss(Math.max(0, tk))}`;
    g.font = "21px 'VT', monospace"; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 6; g.fillText(main, 50, 18); g.shadowBlur = 0;
    if (sub) { g.font = "14px 'VT', monospace"; g.textAlign = 'right'; g.fillStyle = tk !== null && tk !== undefined ? COLS.crit : lvl === 'ok' ? '#5fae6c' : col; g.fillText(sub, 164, 8); g.textAlign = 'left'; }
    // segmented bar
    const n = 22, fill = Math.round(val * n);
    for (let i = 0; i < n; i++) { g.fillStyle = i < fill ? col : 'rgba(143,224,154,0.08)'; g.fillRect(50 + i * 5.2, 39, 4, 4); }
    e.el.classList.toggle('crit', lvl === 'crit');
  }

  // ------------------------------------------------------------------ minimap
  private buildMap() {
    const p = el('div', 'cx-plate cx-map pe', this.root); screws(p, 4);
    this.mapHd = el('div', 'hd', p, '<span class="cx-sten">SURVEY</span><span class="cx-ph"></span>');
    const scr = el('div', 'cx-glass scr', p);
    this.mapCv = document.createElement('canvas'); scr.appendChild(this.mapCv);
    const at = (e: MouseEvent) => { const g = this.g; if (!g) return null; const r = this.mapCv.getBoundingClientRect(), N = g.region.N; return { x: ((e.clientX - r.left) / r.width) * N, z: ((e.clientY - r.top) / r.height) * N }; };
    let drag = false;
    this.mapCv.addEventListener('pointerdown', (e) => { e.stopPropagation(); const p2 = at(e); if (!p2) return; if (e.button === 2) { this.mapOrder(p2.x, p2.z); return; } drag = true; this.g!.cam.lookAt(p2.x, p2.z); });
    this.mapCv.addEventListener('pointermove', (e) => { if (drag && e.buttons & 1) { const p2 = at(e); if (p2) this.g!.cam.lookAt(p2.x, p2.z); } });
    addEventListener('pointerup', () => { drag = false; });
    this.mapCv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.hoverTip(this.mapCv, () => '<b>SURVEY MAP</b><br>Click to look there · right-click to send the selected drone or teammate.<br><span class="w">◆</span> seams · <span class="r">■</span> hostile contacts · dashed ring: control signal');
  }
  private mapOrder(x: number, z: number) {
    const c = this.colony; if (!c?.sel) return;
    const s = c.sel;
    if (s.kind === 'drone') { s.ref.order = { k: 'move', x, z }; s.ref.docked = false; sfx('click', 1.3, 0.5); }
    else if (s.kind === 'crew' && s.ref.alive) { s.ref.order({ k: 'move', x, z }); sfx('click', 1.1, 0.5); }
  }
  private paintMapBase() {
    const g = this.g!, R = g.region, N = R.N, c = document.createElement('canvas'); c.width = N; c.height = N;
    const x2 = c.getContext('2d')!, img = x2.createImageData(N, N);
    let lo = 1e9, hi = -1e9; for (let i = 0; i < N * N; i++) { lo = Math.min(lo, R.h[i]); hi = Math.max(hi, R.h[i]); }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, h = R.h[i], o = i * 4;
      const hx = R.h[Math.min(N - 1, x + 1) + z * N] - R.h[Math.max(0, x - 1) + z * N], hz = R.h[x + Math.min(N - 1, z + 1) * N] - R.h[x + Math.max(0, z - 1) * N];
      const shade = Math.max(0.35, Math.min(1.3, 1 - (hx * 0.6 + hz * 0.8) * 0.35));
      const wet = R.isWater(x + 0.5, z + 0.5);
      const k = (h - lo) / Math.max(0.01, hi - lo), contour = Math.abs(((h / 1.5) % 1 + 1) % 1 - 0.5) > 0.44;
      let r: number, gg: number, b: number;
      if (wet) { r = 14; gg = 42; b = 44; }
      else { r = 22 + k * 30; gg = 48 + k * 70; b = 30 + k * 26; r *= shade; gg *= shade; b *= shade; if (contour) { r += 18; gg += 34; b += 16; } }
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    x2.putImageData(img, 0, 0);
    this.mapBase = c;
  }
  private drawMap(c: Colony) {
    const g = this.g!, R = g.region, N = R.N, dpr = Math.min(2, Math.max(1, devicePixelRatio || 1)), S = 268, cv = this.mapCv;
    if (!this.mapBase) this.paintMapBase();
    if (cv.width !== Math.round(S * dpr)) { cv.width = Math.round(S * dpr); cv.height = Math.round(S * dpr); }
    const x = cv.getContext('2d')!; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.imageSmoothingEnabled = false;
    x.drawImage(this.mapBase!, 0, 0, S, S);
    // the fog: unseen ground darker
    const k = S / N, vis = g.vision;
    x.fillStyle = 'rgba(4,8,6,0.55)';
    for (let zz = 0; zz < N; zz += 2) for (let xx = 0; xx < N; xx += 2) if (!vis.seen[zz * N + xx]) x.fillRect(xx * k, zz * k, 2 * k + 0.5, 2 * k + 0.5);
    const P = (wx: number, wz: number): [number, number] => [wx * k, wz * k];
    // control range rings (pod and relays)
    x.setLineDash([4, 4]); x.strokeStyle = 'rgba(143,224,154,0.55)'; x.lineWidth = 1;
    x.beginPath(); x.arc(c.pod.x * k, c.pod.z * k, c.controlRadius * k, 0, Math.PI * 2); x.stroke();
    for (const s of c.structures) if (s.kind === 'relay' && s.done) { x.beginPath(); x.arc(s.x * k, s.z * k, 30 * k, 0, Math.PI * 2); x.stroke(); }
    x.setLineDash([]);
    // seams
    for (const d of R.deposits) if (d.amount > 0 && !d.hidden) { const [px, py] = P(d.x, d.z); x.fillStyle = '#e2b04a'; x.beginPath(); x.moveTo(px, py - 3); x.lineTo(px + 3, py); x.lineTo(px, py + 3); x.lineTo(px - 3, py); x.closePath(); x.fill(); }
    // contacts
    for (const cr of g.world.creatures) { if (cr.dead || !cr.visibleNow) continue; const [px, py] = P(cr.x, cr.z); const hostile = cr.mind === 'hunt' || cr.mind === 'attack' || cr.sp.role === 'apex'; x.fillStyle = cr.faction === 'veyr' ? '#8fe09a' : hostile ? '#e0604a' : 'rgba(200,200,180,0.55)'; x.fillRect(px - 1, py - 1, hostile ? 3 : 2, hostile ? 3 : 2); }
    for (const st of g.factions?.structures ?? []) if (!st.dead && vis.seen[Math.floor(st.z) * N + Math.floor(st.x)]) { const [px, py] = P(st.x, st.z); x.fillStyle = '#e0604a'; x.fillRect(px - 2, py - 2, 5, 5); }
    // structures, drones, crew, the pod
    for (const s of c.structures) { const [px, py] = P(s.x, s.z); x.fillStyle = s.done ? '#e6dfc2' : '#a89a70'; x.fillRect(px - 2, py - 2, 4, 4); }
    for (const d of c.drones) { const [px, py] = P(d.x, d.z); x.fillStyle = '#e2b04a'; x.save(); x.translate(px, py); x.rotate(-d.yaw + Math.PI); x.beginPath(); x.moveTo(0, -4); x.lineTo(3, 3); x.lineTo(-3, 3); x.closePath(); x.fill(); x.restore(); }
    for (const t of c.teammates) if (t.alive) { const [px, py] = P(t.x, t.z); x.fillStyle = '#9ad8ff'; x.fillRect(px - 1.5, py - 1.5, 3, 3); }
    { const [px, py] = P(c.pod.x, c.pod.z); x.fillStyle = '#f0ecdc'; x.strokeStyle = '#1a1c18'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py - 6); x.lineTo(px + 6, py); x.lineTo(px, py + 6); x.lineTo(px - 6, py); x.closePath(); x.fill(); x.stroke(); }
    // the camera's view on the ground
    const corners: [number, number][] = [];
    for (const [sx, sy] of [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]]) { const gp = this.groundRay(sx, sy); if (gp) corners.push(P(gp[0], gp[1])); }
    if (corners.length === 4) { x.strokeStyle = 'rgba(230,240,220,0.8)'; x.beginPath(); corners.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.stroke(); }
    const cs = this.mapHd.lastElementChild as HTMLElement; cs.textContent = `${Math.round(c.pod.x)}·${Math.round(c.pod.z)}  SIG ${c.controlRadius}M`;
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
        el('i', 'lamp', e); el('div', '', e, esc(a.text)); el('div', 'tm', e, this.stamp(a));
        if (a.n > 1) el('div', 'n', e, '×' + a.n);
        e.onclick = (ev) => { ev.stopPropagation(); if (a.at) this.g?.cam.lookAt(a.at.x, a.at.z); sfx('click', 1.2, 0.4); };
        (e as unknown as { _a: Alert })._a = a;
      }
    }
    for (const e of Array.from(this.alertsEl.children) as HTMLElement[]) { const a = (e as unknown as { _a: Alert })._a; e.classList.toggle('old', now - a.real > 25000); }
  }
  private stamp(a: Alert) { const g = this.g; if (!g) return ''; const d = ((a.t / ((g as unknown as { climate?: { dayLength?: number } }).climate?.dayLength ?? 240)) + 0.25) % 1; return `${String(Math.floor(d * 24)).padStart(2, '0')}:${String(Math.floor((d * 24 * 60) % 60)).padStart(2, '0')}`; }

  // ------------------------------------------------------------------ the selected unit
  private buildSel() {
    this.selEl = el('div', 'cx-plate cx-sel pe', this.root); screws(this.selEl, 5);
    this.selHd = el('div', 'hd', this.selEl);
    const scr = el('div', 'cx-glass scr cx-ph', this.selEl);
    this.selRows = el('div', '', scr);
    this.selActs = el('div', 'acts', this.selEl);
    this.selWorks = el('div', 'cx-works', this.selEl);
    this.selEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  private selName(s: Sel): [string, string, string] {
    switch (s.kind) {
      case 'pod': return ['UNAA COLONY POD CP-07', 'HOME BASE · UNIT 07', 'v-integrity'];
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
      const pic = el('div', 'cx-glass pic', this.selHd); pic.appendChild(iconImg(ic, 48));
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
    el('div', 'cx-sten', W, 'POD WORKS').style.cssText = 'font-size:12px;margin:2px 0 6px';
    const tabs = el('div', 'cx-tabs', W);
    for (const [k, n] of [['arm', 'ARMS'], ['drone', 'DRONES'], ['structure', 'AREA'], ['limb', 'LIMBS']] as [CatKind, string][]) { const b = el('button', 'cx-btn' + (this.worksTab === k ? ' on' : ''), tabs, n); b.onclick = (e) => { e.stopPropagation(); this.worksTab = k; this.worksKey = ''; sfx('click', 1.3, 0.4); }; }
    const tiles = el('div', 'cx-tiles', W);
    for (const id of CAT_ORDER) {
      const e = CATALOG[id]; if (e.kind !== this.worksTab) continue;
      const why = c.canBuild(id), t = el('div', 'cx-tile' + (why ? ' no' : ''), tiles);
      t.appendChild(iconImg(e.icon, 44));
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
    else if (k.k === 'place') { const t = c.target, why = t.ok ? c.placeWhy(t.x, t.z) : ''; key += k.id + why; html = `<span class="big cx-sten">PLACING · ${CATALOG[k.id].name.toUpperCase()}</span>${why ? `<span style="color:#e0604a;font-family:VT,monospace;font-size:17px">${esc(why.toUpperCase())}</span>` : '<span class="cx-ph">CLEAR TO BUILD</span>'}<span class="keys"><b>LMB</b> PLACE <b>SHIFT</b> KEEP PLACING <b>RMB</b>/<b>ESC</b> CANCEL</span>`; }
    if (key !== this.ctlKey) { this.ctlKey = key; this.ctlEl.innerHTML = html; this.ctlEl.classList.toggle('on', !!html); }
  }
  private drawWheelInfo(c: Colony) {
    const i = this.wheel.hover >= 0 ? this.wheel.hover : c.slots.active >= 0 ? c.slots.active : this.wheel.focus, s = c.slots.slots[i];
    let h = '';
    if (this.flashT > 0) h = `<div class="tn" style="color:#e2b04a">CANNOT</div><div class="ds" style="color:#e0b090">${esc(this.flashMsg)}</div>`;
    else if (s.level <= 0) h = `<div class="tn">SLOT ${i + 1}</div><div class="un">LOCKED</div><div class="ds">Open it with the Upgrader.</div>`;
    else if (!s.tool) h = `<div class="tn">SLOT ${i + 1}</div><div class="un">EMPTY</div><div class="ds">Right-click to assign a tool.</div>`;
    else { const u = c.slots.unitOf(i), un = u ? (c.unitById(u) as { name?: string } | null)?.name : null; h = `<div class="tn">${TOOLS[s.tool].name.toUpperCase()}</div><div class="un">${un ? 'RUN BY ' + un : '<span style="color:#e0604a">NO UNIT</span>'}</div><div class="ds">${TOOLS[s.tool].desc}</div><div class="lv">SLOT ${i + 1} · LEVEL ${s.level}${c.slots.active === i ? ' · IN USE' : ''}</div>`; }
    if (h !== (this.wheelInfo as unknown as { _h?: string })._h) { this.wheelInfo.innerHTML = h; (this.wheelInfo as unknown as { _h?: string })._h = h; }
  }
  openCfg(i: number) { this.cfgSlot = i; this.cfgKey = ''; this.cfgEl.classList.add('on'); }
  private drawCfg(c: Colony) {
    if (this.cfgSlot < 0) { this.cfgEl.classList.remove('on'); return; }
    const i = this.cfgSlot, s = c.slots.slots[i], why = c.slots.whyNotUpgrade(i);
    const key = `${i}|${s.tool}|${s.unit}|${s.level}|${why}|${c.arms.length}|${c.drones.length}|${c.structures.length}`;
    if (key === this.cfgKey) return; this.cfgKey = key;
    const E = this.cfgEl; [...E.querySelectorAll(':scope > :not(.cx-screw)')].forEach((x) => x.remove());
    const hd = el('div', '', E); hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center';
    el('div', 'cx-sten', hd, `SLOT ${i + 1} · LEVEL ${s.level}`).style.fontSize = '15px';
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
    this.slow = 0.2;
    for (const e of this.vitEls) this.drawVital(e, c);
    const day = g.world.day, hh = Math.floor(((day + 0.25) % 1) * 24), mm = Math.floor(((((day + 0.25) % 1) * 24) % 1) * 60);
    const ck = `<span>SOL ${c.sol}</span><small>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${g.paused ? 'PAUSED' : g.speed + '×'}</small>`;
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

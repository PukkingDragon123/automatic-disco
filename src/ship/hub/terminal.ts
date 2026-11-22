// Each room's function screen: a phosphor terminal in a worn steel housing (pixel-art nine-slice hardware),
// opened by clicking the room's key prop (or its first key). They work: ENGINEERING shares the reactor's output
// between the decks (a starved deck dims) and holds the ship's settings; the MESS keeps the galley's stores and
// serves meals and coffee (crew morale); the MEDBAY scans the crew; the QUARTERS show the roster and morale; the
// WORKSHOP assembles the pod and lists its upgrades; CARGO lists the stores and opens the pod's hold; the AI CORE
// saves, loads and sets; the LAB hands over to the gene lab (the creature agent's Forge).
import type { ShipHub } from './hub';
import type { RoomId } from './layout';
import { ROOMS } from './layout';
import { shipState, saveShip, setPower, type ShipState } from './shipState';
import { csfx } from '../../ui/cineAudio';
import { settings, setSettings, type Quality } from '../../settings';
import { ui } from '../../ui/kit';

export interface TermAction { label: string; key?: string; run: () => void; disabled?: () => string | false }
export interface TermCtx { hub: ShipHub; actions?: Partial<Record<string, () => void>> }

const CSS = /* css */`
.sterm { position: fixed; inset: 0; z-index: 7; display: flex; align-items: center; justify-content: center; background: rgba(2,4,3,0.55); image-rendering: pixelated; font-family: 'Body'; font-size: 22px; color: #9fe0aa; animation: st-in 220ms steps(5); }
@keyframes st-in { 0% { opacity: 0; } 100% { opacity: 1; } }
.sterm .box { width: min(1180px, 92vw); max-height: 88vh; display: flex; flex-direction: column; border: 16px solid transparent; border-image: var(--steel) 8 fill / 16px stretch; }
.sterm .hd { display: flex; align-items: baseline; gap: 22px; padding: 4px 8px 12px; }
.sterm .hd .c { font-family: 'Body'; font-size: 22px; color: #3f8f58; }
.sterm .hd .t { font-family: 'Title'; font-size: 48px; color: #ece8d8; line-height: 1; }
.sterm .hd .s { margin-left: auto; font-size: 22px; color: #7f8a80; }
.sterm .scr { flex: 1; overflow: auto; border: 16px solid transparent; border-image: var(--crt) 8 fill / 16px stretch; padding: 6px 12px; text-shadow: 0 0 4px rgba(127,212,138,0.5); min-height: 360px; }
.sterm .ft { display: flex; gap: 8px; padding-top: 12px; flex-wrap: wrap; }
.sterm .k { display: inline-flex; align-items: center; gap: 12px; padding: 6px 14px 6px 22px; cursor: pointer; border: 16px solid transparent; border-image: var(--key) 8 fill / 16px stretch; font-family: 'Title'; font-size: 24px; color: #dfe6dc; user-select: none; }
.sterm .k:hover { border-image: var(--keyHi) 8 fill / 16px stretch; color: #f4fff2; }
.sterm .k:active { transform: translateY(2px); }
.sterm .k .hk { font-family: 'Body'; font-size: 11px; color: #0c1a10; background: #3f8f58; padding: 0 4px; }
.sterm .k.dis { color: #6a706a; cursor: default; }
.sterm .k.sm { font-size: 24px; padding: 2px 10px 2px 18px; }
.sterm h3 { font-family: 'Title'; font-size: 24px; color: #d6ffd8; margin: 12px 0 6px; font-weight: normal; }
.sterm .row { display: flex; align-items: center; gap: 16px; line-height: 33px; }
.sterm .row .l { flex: 0 0 300px; color: #7fd48a; }
.sterm .row .v { color: #d6ffd8; }
.sterm .row .r { margin-left: auto; color: #7fae88; }
.sterm .seg { display: inline-flex; gap: 2px; }
.sterm .seg i { display: inline-block; width: 11px; height: 22px; background: #14301c; box-shadow: inset 0 -2px 0 #0a1a10; }
.sterm .seg i.on { background: #7fd48a; box-shadow: inset 0 2px 0 #c9f5cf, inset 0 -2px 0 #3f8f58, 0 0 6px rgba(127,212,138,0.5); }
.sterm .seg i.am { background: #d9a43a; box-shadow: inset 0 2px 0 #f0d090, inset 0 -2px 0 #98702c; }
.sterm .seg i.rd { background: #c0463a; box-shadow: inset 0 2px 0 #e08070, inset 0 -2px 0 #72241d; }
.sterm .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 44px; }
.sterm .crew { display: grid; grid-template-columns: 1fr; gap: 0; }
.sterm .dead { color: #6a706a; text-decoration: line-through; }
.sterm .note { color: #7fae88; }
.sterm .warn { color: #d9a43a; }
`;
let styled = false;
function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
const div = (cls: string, p: HTMLElement, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; p.appendChild(e); return e; };
/** a segmented pixel bar, n cells */
export const seg = (v: number, n = 20, warnBelow = -1) => { const k = Math.round(Math.max(0, Math.min(1, v)) * n); const c = v < warnBelow ? 'am' : 'on'; return `<span class="seg">${Array.from({ length: n }, (_, i) => `<i class="${i < k ? c : ''}"></i>`).join('')}</span>`; };

let open: { close: () => void } | null = null;
export function terminalOpen() { return !!open; }
export function closeTerminal() { if (open) { open.close(); return true; } return false; }

/** open a room's function screen */
export function openTerminal(c: TermCtx, id: RoomId) {
  style();
  closeTerminal();
  const r = ROOMS[id], hub = c.hub;
  const root = div('sterm', ui());
  const box = div('box', root);
  div('hd', box, `<span class="c">${r.deck} · ${r.code}</span><span class="t">${TITLES[id]}</span><span class="s">${r.name}</span>`);
  const scr = div('scr', box);
  const ft = div('ft', box);
  const key = (label: string, run: () => void, hk?: string, dis?: string | false) => {
    const k = div('k' + (dis ? ' dis' : ''), ft, `<span>${label}</span>${hk ? `<span class="hk">${hk}</span>` : ''}`);
    k.addEventListener('click', (e) => { e.stopPropagation(); if (dis) { csfx('tick', 0.4); return; } csfx('button', 0.6); run(); });
    k.addEventListener('pointerenter', () => csfx('hover', 0.3));
    return k;
  };
  let timer = 0;
  const close = () => { clearInterval(timer); root.remove(); removeEventListener('keydown', onKey, true); open = null; hub.lockInput(false); csfx('tick', 0.6); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  addEventListener('keydown', onKey, true);
  root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === root) close(); });
  hub.lockInput(true);
  open = { close };
  const draw = () => { scr.innerHTML = ''; ft.innerHTML = ''; BODY[id](scr, key, c, draw); key('◀ BACK', close, 'ESC'); };
  draw();
  // live screens refresh
  timer = window.setInterval(() => { const live = scr.querySelector('[data-live]'); if (live) LIVE[id]?.(live as HTMLElement, c); }, 500);
  csfx('static', 0.3); csfx('beep', 0.4);
}

const TITLES: Record<RoomId, string> = { bridge: 'MAIN MONITOR', lab: 'GENE LAB', medbay: 'CREW HEALTH', core: 'UNIT 07 CORE', quarters: 'CREW + MORALE', workshop: 'POD ASSEMBLY', mess: 'GALLEY STORES', cargo: 'SHIP STORES', engineering: 'POWER + SYSTEMS' };
type Key = (label: string, run: () => void, hk?: string, dis?: string | false) => HTMLElement;

// ------------------------------------------------------------------ the crew (read from the crew agent, when present)
interface CrewRow { id: string; name: string; role: string; alive: boolean }
let crewApi: any = null;
import('../crew/index').then((m) => { crewApi = (m as any).crew ?? (m as any).default ?? null; }).catch(() => { crewApi = null; });
function crewRows(): CrewRow[] {
  if (crewApi?.ids) return crewApi.ids.map((id: string) => { const m = crewApi.member(id); return { id, name: (m.name ?? id).toUpperCase(), role: (m.role ?? m.job ?? '').toUpperCase(), alive: !!m.alive }; });
  return ['LEAD SCIENTIST', 'CAPTAIN', 'MECHANIC', 'PILOT', 'DOCTOR', 'BOTANIST', 'QUARTERMASTER', 'SECURITY'].map((role, i) => ({ id: String(i), name: `CREW ${i + 1}`, role, alive: true }));
}
const mood = () => (crewApi?.mood ? crewApi.mood() as number : 0.72);
const moodShift = (d: number) => { try { crewApi?.moodShift?.(d); } catch { /* the crew may not take it */ } };
const h1 = (s: string, k: number) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= k * 2654435761; return ((h >>> 0) % 1000) / 1000; };

// ------------------------------------------------------------------ the rooms' screens
const BODY: Record<RoomId, (scr: HTMLElement, key: Key, c: TermCtx, redraw: () => void) => void> = {
  bridge(scr, key, c) {
    scr.innerHTML = `<h3>LONG RANGE SCAN · KEPLER-442</h3><div class="row"><span class="l">WORLDS IN RANGE</span><span class="v">5</span></div><div class="row"><span class="l">POD</span><span class="v">${shipState().pod >= 1 ? 'READY' : 'NOT ASSEMBLED'}</span></div><p class="note">Scan the system, pick a world (the easiest is marked), pick the landing site, deploy.</p>`;
    key('OPEN MAIN MONITOR', () => { closeTerminal(); c.actions?.monitor?.(); }, 'M');
  },
  lab(scr, key, c) {
    scr.innerHTML = `<h3>GENE LAB</h3><div class="row"><span class="l">SPECIMEN TANKS</span><span class="v">3 / 3 LIVE</span></div><div class="row"><span class="l">SEQUENCER</span><span class="v">READY</span></div><p class="note">Design engineered life and fit robotic parts to your workers.</p>`;
    key('OPEN GENE LAB', () => { closeTerminal(); c.actions?.lab?.(); }, 'G');
  },
  medbay(scr, key) {
    const rows = crewRows();
    scr.innerHTML = `<h3>CREW VITALS</h3><div data-live class="crew">${rows.map((r) => medRow(r)).join('')}</div>`;
    key('FULL SCAN', () => { csfx('beepHi', 0.4); const l = scr.querySelector('[data-live]') as HTMLElement; l.innerHTML = rows.map((r) => medRow(r, true)).join(''); }, 'S');
  },
  core(scr, key, c) {
    scr.innerHTML = `<h3>UNIT 07 · ONLINE</h3><div class="row"><span class="l">MEMORY</span>${seg(0.961)}<span class="r">96.1%</span></div><div class="row"><span class="l">UPLINK</span><span class="v">LOCKED · UNAA RELAY 4</span></div>${settingsHTML()}`;
    bindSettings(scr);
    key('SAVE MISSION', () => c.actions?.save?.(), 'S');
    key('LOAD MISSION', () => c.actions?.load?.(), 'L');
    key('NEW MISSION', () => c.actions?.newGame?.(), 'N');
    key('TITLE SCREEN', () => { closeTerminal(); c.actions?.title?.(); }, 'T');
  },
  quarters(scr, key, _c, redraw) {
    const rows = crewRows(), m = mood();
    scr.innerHTML = `<h3>CREW MORALE</h3><div class="row"><span class="l">SHIP MORALE</span>${seg(m, 24, 0.35)}<span class="r">${Math.round(m * 100)}%</span></div><h3>ROSTER</h3>${rows.map((r) => `<div class="row ${r.alive ? '' : 'dead'}"><span class="l">${r.name}</span><span class="v">${r.role}</span><span class="r">${r.alive ? 'ABOARD' : 'LOST'}</span></div>`).join('')}`;
    key('MOVIE NIGHT', () => { moodShift(0.06); csfx('chime', 0.4); redraw(); }, 'M');
    key('REST CYCLE', () => { moodShift(0.03); csfx('tick', 0.5); redraw(); }, 'R');
  },
  workshop(scr, key, c, redraw) {
    const p = shipState().pod;
    const stage = ['FRAME', 'PLATING', 'GLAZING + SHIELD', 'LEGS + THRUSTERS', 'AVIONICS'];
    scr.innerHTML = `<h3>CAPSULE POD · UNIT 07</h3>${stage.map((s, i) => { const k = Math.max(0, Math.min(1, p * 5 - i)); return `<div class="row"><span class="l">${s}</span>${seg(k, 20)}<span class="r">${k >= 1 ? 'DONE' : k > 0 ? 'FITTING' : 'QUEUED'}</span></div>`; }).join('')}<h3>UPGRADE SLOTS</h3>${upgradeRows(c)}`;
    key(p >= 1 ? 'POD COMPLETE' : 'ASSEMBLE POD', () => { c.actions?.assemble?.(); setTimeout(redraw, 4200); }, 'A', p >= 1 ? 'POD COMPLETE' : false);
    key('INSPECT POD', () => { closeTerminal(); c.actions?.inspect?.(); }, 'I');
    key('POD UPGRADES', () => { closeTerminal(); c.actions?.upgrades?.(); }, 'U');
  },
  mess(scr, key, _c, redraw) {
    const s = shipState().supplies;
    const R = (l: string, v: number, max: number, u: string) => `<div class="row"><span class="l">${l}</span>${seg(v / max, 20, 0.2)}<span class="r">${Math.round(v)} ${u}</span></div>`;
    scr.innerHTML = `<h3>GALLEY STORES</h3>${R('RATIONS', s.rations, 300, 'DAYS')}${R('WATER', s.water, 2400, 'L')}${R('COFFEE', s.coffee, 60, 'KG')}${R('FRESH PRODUCE', s.fresh, 30, 'KG')}${R('MEDICAL', s.medical, 60, 'KITS')}<div class="row"><span class="l">CREW MORALE</span>${seg(mood(), 20, 0.35)}<span class="r">${Math.round(mood() * 100)}%</span></div><p class="note">Hot meals and coffee lift the crew. The hydroponics in the lab grow fresh produce.</p>`;
    key('SERVE HOT MEAL', () => { s.rations = Math.max(0, s.rations - 1); s.fresh = Math.max(0, s.fresh - 0.5); moodShift(0.04); saveShip(); csfx('chime', 0.35); redraw(); }, 'H', s.rations < 1 ? 'NO RATIONS' : false);
    key('BREW COFFEE', () => { s.coffee = Math.max(0, s.coffee - 0.2); moodShift(0.015); saveShip(); csfx('steam', 0.3); redraw(); }, 'C', s.coffee < 0.2 ? 'NO COFFEE' : false);
  },
  cargo(scr, key, c) {
    const s = shipState().supplies;
    scr.innerHTML = `<h3>HOLD 2 MANIFEST</h3>${[['RATIONS', `${Math.round(s.rations)} DAYS`], ['SEED VAULT A-K', 'SEALED'], ['SPECIMEN CRATES', '2 SEALED'], ['HULL PATCH KITS', '12'], ['POD SPARES', '6 CRATES'], ['COOLANT', '880 L'], ['TOTAL MASS', '31.4 T']].map(([a, b]) => `<div class="row"><span class="l">${a}</span><span class="v">${b}</span></div>`).join('')}`;
    key('OPEN POD HOLD', () => { closeTerminal(); c.actions?.hold?.(); }, 'H', c.actions?.hold ? false : 'NEEDS A SETTLEMENT');
  },
  engineering(scr, key, _c, redraw) {
    const p = shipState().power;
    const names: [keyof ShipState['power'], string][] = [['life', 'LIFE SUPPORT'], ['lab', 'LABORATORY'], ['workshop', 'WORKSHOP'], ['sensors', 'SENSORS'], ['engines', 'ENGINES']];
    scr.innerHTML = `<h3>REACTOR</h3><div data-live></div><h3>POWER BUS</h3>${names.map(([k, n]) => `<div class="row"><span class="l">${n}</span><span class="k sm" data-dn="${k}">-</span>${seg(p[k] / 0.6, 18, 0.12)}<span class="k sm" data-up="${k}">+</span><span class="r">${Math.round(p[k] * 100)}%</span></div>`).join('')}<p class="note">A starved deck dims its lights. Life support under 20% sets the O2 alarm.</p>${settingsHTML()}`;
    LIVE.engineering!(scr.querySelector('[data-live]') as HTMLElement, _c);
    scr.querySelectorAll('[data-up]').forEach((e) => e.addEventListener('click', (ev) => { ev.stopPropagation(); const k = (e as HTMLElement).dataset.up as keyof ShipState['power']; setPower(k, p[k] + 0.05); csfx('switch', 0.4); redraw(); }));
    scr.querySelectorAll('[data-dn]').forEach((e) => e.addEventListener('click', (ev) => { ev.stopPropagation(); const k = (e as HTMLElement).dataset.dn as keyof ShipState['power']; setPower(k, p[k] - 0.05); csfx('switch', 0.4); redraw(); }));
    bindSettings(scr);
    key('BALANCE BUS', () => { Object.assign(p, { life: 0.3, lab: 0.2, workshop: 0.15, sensors: 0.15, engines: 0.2 }); saveShip(); redraw(); }, 'B');
  },
};
const LIVE: Partial<Record<RoomId, (el: HTMLElement, c: TermCtx) => void>> = {
  engineering(el) { const t = performance.now() / 1000, o = 0.62 + Math.sin(t * 0.9) * 0.04; el.innerHTML = `<div class="row"><span class="l">CORE OUTPUT</span>${seg(o, 24)}<span class="r">${Math.round(o * 1000)} MW</span></div><div class="row"><span class="l">COOLANT</span>${seg(0.71, 24)}<span class="r">NOMINAL</span></div>`; },
  medbay(el) { const rows = crewRows(); el.innerHTML = rows.map((r) => medRow(r)).join(''); },
};
function medRow(r: CrewRow, scan = false) {
  if (!r.alive) return `<div class="row dead"><span class="l">${r.name}</span><span class="v">DECEASED</span></div>`;
  const t = performance.now() / 1000, hr = Math.round(58 + h1(r.id, 1) * 30 + Math.sin(t + h1(r.id, 2) * 9) * 3), fat = 0.3 + h1(r.id, 3) * 0.5;
  return `<div class="row"><span class="l">${r.name}</span><span class="v">HR ${hr}</span>${seg(1 - fat * 0.5, 12)}<span class="r">${scan ? (fat > 0.7 ? '<span class="warn">FATIGUED</span>' : 'FIT') : r.role}</span></div>`;
}
function upgradeRows(c: TermCtx) {
  const ups = (c.hub as any).game?.upgrades;
  const ids = ['pod_plating', 'pod_capacitor', 'pod_sensor', 'pod_coolant', 'arm_socket', 'drone_bay'];
  return ids.map((id) => { const has = ups?.has?.(id); return `<div class="row"><span class="l">${id.replace(/_/g, ' ').toUpperCase()}</span><span class="v">${has ? 'INSTALLED' : 'EMPTY'}</span><span class="r">${has ? '' : 'BUILD AN UPGRADER'}</span></div>`; }).join('');
}
function settingsHTML() {
  const q = settings.quality;
  return `<h3>SETTINGS</h3><div class="row"><span class="l">GRAPHICS</span>${(['low', 'medium', 'high'] as Quality[]).map((v) => `<span class="k sm" data-q="${v}" style="${q === v ? 'border-image: var(--keyHi) 8 fill / 16px stretch' : ''}">${v.toUpperCase()}</span>`).join('')}</div>
  <div class="row"><span class="l">MASTER VOLUME</span><span class="k sm" data-vol="-">-</span>${seg(settings.master, 20)}<span class="k sm" data-vol="+">+</span></div>
  <div class="row"><span class="l">SCREEN SHAKE</span><span class="k sm" data-shake="1">${settings.shake ? 'ON' : 'OFF'}</span></div>`;
}
function bindSettings(scr: HTMLElement) {
  scr.querySelectorAll('[data-q]').forEach((e) => e.addEventListener('click', (ev) => { ev.stopPropagation(); setSettings({ quality: (e as HTMLElement).dataset.q as Quality }); csfx('switch', 0.5); scr.querySelectorAll('[data-q]').forEach((x) => ((x as HTMLElement).style.borderImage = (x === e ? 'var(--keyHi) 8 fill / 16px stretch' : ''))); }));
  scr.querySelectorAll('[data-vol]').forEach((e) => e.addEventListener('click', (ev) => { ev.stopPropagation(); const d = (e as HTMLElement).dataset.vol === '+' ? 0.05 : -0.05; setSettings({ master: Math.max(0, Math.min(1, settings.master + d)) }); csfx('switch', 0.5); const s = e.parentElement!.querySelector('.seg'); if (s) s.outerHTML = seg(settings.master, 20); }));
  scr.querySelectorAll('[data-shake]').forEach((e) => e.addEventListener('click', (ev) => { ev.stopPropagation(); setSettings({ shake: !settings.shake }); (e as HTMLElement).textContent = settings.shake ? 'ON' : 'OFF'; csfx('switch', 0.5); }));
}

// The lab's FITTING BAY: where an engineered creature becomes a colony worker. A rocker on the instrument plate
// switches the lab between the gene bench and the bay. In the bay the left screen lists the body's slots (sensor
// head, control collar, tool arm, back rig, power pack, plating, fore and hind limbs) with what is fitted in each;
// pick a slot (or click that part of the specimen in the tank) and the card file below fills with the parts that
// fit it, each spinning in its card window. The right screen is the worker readout: the role the fittings and
// genes add up to, carry and speed, a bar per job skill, armour, sight and obedience, what it needs (food, work
// and rest, maintenance, power, morale) and the bill of real items for every fitted part, checked against the
// stores. Green phosphor on worn machine hardware, drawn at device resolution.
import { el, ui, Tip } from './kit';
import { sfx } from '../audio/audio';
import { enamel, paintEl } from './labPaper';
import { SLOT_NAME, SLOT_DESC, SKILLS, CYBER, type Slot, type Skill } from '../life/cyber/catalog';
import type { WorkerProfile } from '../life/cyber/roles';
import { ITEMS, itemIcon } from '../factory/items';

const CSS = `
.lbf { position: fixed; inset: 0; pointer-events: none; z-index: 4; font-family: 'Body', monospace; --ph: #8fdc96; --ph2: #5fae6a; --ph3: #2f5c38; --glass: #07130b; }
.lbf .crt { position: absolute; pointer-events: auto; padding: calc(9 * var(--k)); box-sizing: border-box; border-radius: calc(5 * var(--k)); box-shadow: 0 calc(3 * var(--k)) calc(10 * var(--k)) rgba(6, 8, 5, 0.6); }
.lbf .glass { position: relative; height: 100%; box-sizing: border-box; border-radius: calc(4 * var(--k)); padding: calc(8 * var(--k)) calc(10 * var(--k)); overflow: hidden;
  background: radial-gradient(120% 90% at 40% 30%, #0f2416 0%, var(--glass) 70%), var(--glass); color: var(--ph); text-shadow: 0 0 calc(3 * var(--k)) rgba(120, 230, 140, 0.35);
  box-shadow: inset 0 0 calc(18 * var(--k)) rgba(0, 0, 0, 0.85), inset 0 0 0 1px rgba(150, 220, 160, 0.12); }
.lbf .glass::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.22) 0 1px, transparent 1px 3px); mix-blend-mode: multiply; }
.lbf .glass::before { content: ''; position: absolute; left: 0; right: 0; height: 30%; top: -30%; pointer-events: none; background: linear-gradient(180deg, transparent, rgba(140, 240, 160, 0.05), transparent); animation: lbf-roll 7s linear infinite; }
@keyframes lbf-roll { to { top: 110%; } }
.lbf .t { font-family: 'Title', monospace; font-size: 24px; letter-spacing: 0.04em; color: var(--ph); border-bottom: 1px solid var(--ph3); padding-bottom: calc(4 * var(--k)); margin-bottom: calc(6 * var(--k)); display: flex; justify-content: space-between; align-items: baseline; }
.lbf .t i { font-style: normal; font-family: 'Body', monospace; font-size: var(--vt); color: var(--ph2); }
.lbf .sub { font-size: var(--vt); color: var(--ph2); line-height: 1.15; }
/* the mode rocker */
.lbf .mode { left: calc(10 * var(--k)); top: calc(8 * var(--k)); display: flex; gap: calc(4 * var(--k)); padding: calc(6 * var(--k)); }
.lbf .mode button { all: unset; cursor: pointer; font-family: 'Body', monospace; font-size: var(--vt); letter-spacing: 0.1em; padding: calc(5 * var(--k)) calc(10 * var(--k)); border-radius: calc(3 * var(--k)); color: #8c917c; background: linear-gradient(#2b2e24, #1b1d17); box-shadow: inset 0 1px 0 rgba(255, 250, 220, 0.12), inset 0 -2px 0 rgba(0, 0, 0, 0.5); }
.lbf .mode button.on { color: var(--ph); background: linear-gradient(#0d2414, #07130b); box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.8), 0 0 calc(6 * var(--k)) rgba(120, 230, 140, 0.25); text-shadow: 0 0 calc(4 * var(--k)) rgba(120, 230, 140, 0.6); }
.lbf .mode button s { display: inline-block; width: calc(6 * var(--k)); height: calc(6 * var(--k)); border-radius: 50%; margin-right: calc(6 * var(--k)); background: #3a3d30; vertical-align: middle; }
.lbf .mode button.on s { background: #9cf2a6; box-shadow: 0 0 calc(5 * var(--k)) #7fe08a; }
/* the slot screen */
.lbf .slots { left: calc(8 * var(--k)); top: calc(76 * var(--k)); width: calc(200 * var(--k)); max-height: calc(100vh - 300 * var(--k)); }
.lbf .slots .glass { overflow-y: auto; scrollbar-width: none; }
.lbf .row { display: grid; grid-template-columns: calc(9 * var(--k)) 1fr; gap: calc(5 * var(--k)); align-items: center; padding: calc(1 * var(--k)) calc(4 * var(--k)); margin: 0 calc(-4 * var(--k)); cursor: pointer; border-radius: 2px; }
.lbf .row > div:last-child { display: flex; justify-content: space-between; gap: calc(6 * var(--k)); white-space: nowrap; overflow: hidden; }
.lbf .row .sub { overflow: hidden; text-overflow: ellipsis; }
.lbf .row:hover { background: rgba(120, 230, 140, 0.08); }
.lbf .row.act { background: var(--ph); color: var(--glass); text-shadow: none; }
.lbf .row.act .sub { color: #13301a; }
.lbf .row .g { width: calc(8 * var(--k)); height: calc(8 * var(--k)); border: 1px solid currentColor; box-sizing: border-box; position: relative; }
.lbf .row.fit .g::after { content: ''; position: absolute; inset: calc(3 * var(--k)); background: currentColor; }
.lbf .row .n { font-size: var(--vt); letter-spacing: 0.06em; line-height: 1.1; }
.lbf .row .sub { font-size: var(--vt); line-height: 1.1; }
.lbf .row.empty .sub { opacity: 0.6; }
.lbf .hint { margin-top: calc(6 * var(--k)); font-size: var(--vt); color: var(--ph2); border-top: 1px dashed var(--ph3); padding-top: calc(5 * var(--k)); line-height: 1.15; }
/* the worker readout */
.lbf .read { right: calc(8 * var(--k)); top: calc(76 * var(--k)); width: calc(214 * var(--k)); max-height: calc(100vh - 300 * var(--k)); }
.lbf .read .glass { overflow-y: auto; scrollbar-width: none; }
.lbf .role { font-family: 'Title', monospace; font-size: var(--tt); letter-spacing: 0.08em; line-height: 1; margin: calc(1 * var(--k)) 0 calc(3 * var(--k)); }
.lbf .kv { display: grid; grid-template-columns: auto 1fr auto 1fr; column-gap: calc(8 * var(--k)); font-size: var(--vt); line-height: 1.2; }
.lbf .kv b { text-align: right; padding-right: calc(4 * var(--k)); }
.lbf .kv b { font-weight: normal; color: var(--ph); }
.lbf .kv span { color: var(--ph2); }
.lbf .h { margin: calc(5 * var(--k)) 0 calc(2 * var(--k)); font-size: var(--vt); color: var(--ph2); letter-spacing: 0.14em; display: flex; align-items: center; gap: calc(6 * var(--k)); }
.lbf .h::after { content: ''; flex: 1; height: 1px; background: var(--ph3); }
.lbf .sk { display: grid; grid-template-columns: calc(66 * var(--k)) 1fr calc(26 * var(--k)); align-items: center; gap: calc(6 * var(--k)); font-size: var(--vt); line-height: 1.15; }
.lbf .sk .bar { height: calc(7 * var(--k)); background: repeating-linear-gradient(90deg, var(--ph3) 0 calc(5 * var(--k)), transparent calc(5 * var(--k)) calc(7 * var(--k))); position: relative; }
.lbf .sk .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: repeating-linear-gradient(90deg, var(--ph) 0 calc(5 * var(--k)), transparent calc(5 * var(--k)) calc(7 * var(--k))); transition: width 380ms steps(10); box-shadow: 0 0 calc(4 * var(--k)) rgba(120, 230, 140, 0.4); }
.lbf .sk.top { color: var(--ph); } .lbf .sk:not(.top) { color: var(--ph2); }
.lbf .cost { display: flex; flex-wrap: wrap; gap: calc(4 * var(--k)); }
.lbf .chip { display: flex; align-items: center; gap: calc(4 * var(--k)); padding: calc(2 * var(--k)) calc(5 * var(--k)) calc(2 * var(--k)) calc(2 * var(--k)); border: 1px solid var(--ph3); font-size: var(--vt); }
.lbf .chip img { width: calc(18 * var(--k)); height: calc(18 * var(--k)); image-rendering: pixelated; }
.lbf .chip.short { border-color: #b8382e; color: #ff9a86; text-shadow: 0 0 calc(3 * var(--k)) rgba(255, 110, 90, 0.4); }
.lbf .parts { font-size: var(--vt); line-height: 1.3; color: var(--ph); }
.lbf .kv1 { display: grid; grid-template-columns: 1fr auto; font-size: var(--vt); line-height: 1.25; }
.lbf .kv1 span { color: var(--ph2); } .lbf .kv1 b { font-weight: normal; color: var(--ph); text-align: right; }
.lbf .parts div::before { content: '> '; color: var(--ph2); }
.lbf .none { color: var(--ph2); font-size: var(--vt); }
.lbf.off .slots, .lbf.off .read { display: none; }
body.lab-fit .lab .lb-tabs, body.lab-fit .lab .lb-right, body.lab-fit .lab .lb-tools, body.lab-fit .lab .lb-left, body.lab-fit .lab .lb-paint { display: none !important; }
@media (max-width: 900px) { .lbf .read { width: calc(220 * var(--k)); } .lbf .slots { width: calc(190 * var(--k)); } }
`;
let injected = false;
function injectCSS() { if (injected) return; injected = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

export interface FitRow { slot: Slot; part: string | null }
export interface FitHandlers { mode(m: 'genes' | 'fit'): void; slot(s: Slot): void }

export class LabFit {
  readonly root: HTMLDivElement;
  private modeBtns: HTMLButtonElement[] = [];
  private slotsBox: HTMLDivElement; private readBox: HTMLDivElement;
  private slotList: HTMLDivElement; private body: HTMLDivElement;
  private painted: HTMLElement[] = [];
  private onResize = () => this.scale();
  constructor(readonly h: FitHandlers) {
    injectCSS();
    this.root = el('div', 'lbf off', ui()) as HTMLDivElement;
    this.scale(); addEventListener('resize', this.onResize);
    const P = (e: HTMLElement, f: (w: number, hh: number) => string) => { this.painted.push(e); paintEl(e, f); return e; };
    // the slot screen
    this.slotsBox = P(el('div', 'crt slots', this.root), (w, hh) => enamel(w, hh, { seed: 67, color: '#3a3d2e', chips: 3 })) as HTMLDivElement;
    const g1 = el('div', 'glass', this.slotsBox);
    el('div', 't', g1, 'FITTING BAY<i>SLOTS</i>');
    this.slotList = el('div', '', g1) as HTMLDivElement;
    el('div', 'hint', g1, 'CLICK A SLOT OR THE SPECIMEN · F: GENES');
    // the worker readout
    this.readBox = P(el('div', 'crt read', this.root), (w, hh) => enamel(w, hh, { seed: 71, color: '#3a3d2e', chips: 4 })) as HTMLDivElement;
    const g2 = el('div', 'glass', this.readBox);
    this.body = el('div', '', g2) as HTMLDivElement;
  }
  private scale() {
    const k = innerHeight >= 1040 ? 2 : 1, r = this.root.style;
    r.setProperty('--k', k + 'px'); r.setProperty('--vt', 11 * k + 'px'); r.setProperty('--tt', 24 * k + 'px');
  }
  setMode(m: 'genes' | 'fit') {
    this.root.classList.toggle('off', m !== 'fit');
    document.body.classList.toggle('lab-fit', m === 'fit');
    for (const b of this.modeBtns) b.classList.toggle('on', b.dataset.m === m);
  }
  setSlots(rows: FitRow[], act: Slot) {
    this.slotList.innerHTML = '';
    for (const r of rows) {
      const p = r.part ? CYBER[r.part] : null;
      const row = el('div', `row${r.slot === act ? ' act' : ''}${p ? ' fit' : ' empty'}`, this.slotList);
      el('div', 'g', row);
      const txt = el('div', '', row);
      el('div', 'n', txt, SLOT_NAME[r.slot].replace('CONTROL ', '').replace('SENSOR ', ''));
      el('div', 'sub', txt, p ? p.name.toUpperCase().replace(/ ARM$| & .*$/, '') : '-');
      row.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', 1.2, 0.5); this.h.slot(r.slot); });
      row.addEventListener('pointerenter', () => Tip.show(`<h4>${SLOT_NAME[r.slot]}</h4>${SLOT_DESC[r.slot]}${p ? `<div class="sub">FITTED: ${p.name}</div>` : ''}`, row));
      row.addEventListener('pointerleave', () => Tip.hide());
    }
  }
  /** the worker readout: role, numbers, skills, needs, the fitted parts and their bill of items */
  setProfile(wp: WorkerProfile, o: { genes: number; cost: Record<string, number>; stock?: (id: string) => number }) {
    const B = this.body, best = Math.max(...SKILLS.map((s) => wp.skills[s]));
    const skillName: Record<Skill, string> = { haul: 'HAUL', dig: 'DIG/MINE', farm: 'FARM', build: 'BUILD', operate: 'OPERATE', guard: 'GUARD', scout: 'SCOUT' };
    const n = wp.needs, pct = (v: number) => `${Math.round(v * 100)}%`;
    void best;
    const chips = Object.entries(o.cost).map(([id, k]) => {
      const have = o.stock ? o.stock(id) : Infinity, short = have < k, nm = ITEMS[id]?.name ?? id.replace(/_/g, ' ');
      let src = ''; try { src = itemIcon(id); } catch { src = ''; }
      return `<span class="chip${short ? ' short' : ''}" title="${nm}${Number.isFinite(have) ? ` · ${have} IN STORE` : ''}">${src ? `<img src="${src}">` : ''}${k}</span>`;
    }).join('');
    B.innerHTML = `
      <div class="t">WORKER<i>UNAA-07</i></div>
      <div class="role">${wp.roleName}</div>
      <div class="kv1"><span>CARRY</span><b>${wp.carry}</b><span>SPEED</span><b>${wp.speed.toFixed(1)}</b><span>TOP SKILL</span><b>${skillName[SKILLS.reduce((a, b) => (wp.skills[b] > wp.skills[a] ? b : a), SKILLS[0])]}</b><span>OBEY</span><b>${pct(wp.control)}</b><span>FOOD/MIN</span><b>${n.food.toFixed(1)}</b><span>MORALE</span><b>${pct(n.morale)}</b></div>
      <div class="h">${o.genes} GENES + ${wp.parts.length} PARTS</div>
      ${chips ? `<div class="cost">${chips}</div>` : '<div class="none">NO PARTS FITTED</div>'}`;
  }
  dispose() { removeEventListener('resize', this.onResize); document.body.classList.remove('lab-fit'); this.root.remove(); Tip.hide(); }
}

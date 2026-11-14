// The work-order desk. Select engineered creatures and a WORK ORDER slip appears: what they do (typed), what they
// cost to keep (pencilled), and a row of manila job tabs (DIG PIT, CHANNEL, RAISE GROUND, OPEN SPRING, PRODUCE,
// TEND LAND, PASTURE, HAUL, OPERATE, GUARD, TROOP, HABITAT, AUTO, STAND DOWN). Pick a tab, then click the ground
// (a channel takes two clicks). Right-clicking with engineered creatures selected gives the smart order: the job
// that suits what was clicked (rock -> gizzards chew it, sand -> silica crops, a carcass -> decomposers, water ->
// dam builders). Troops get MOVE / ATTACK / GUARD / PATROL, the robot squad orders.
// [J] opens the BIOWORKS LEDGER: production per minute by item, upkeep, every producer, plant works (sow a prefab
// with a plant gene, or engineer a grafted plant), the growth vats' queues and the habitats' climate.
// Over the field, a small drawn tag rides above each working creature: its job glyph, its cycle, its trouble.
import type { Game } from '../game/game';
import type { Creature } from '../game/creature';
import type { Biotech, Worker } from './runtime';
import { DROP_R } from './runtime';
import { JOB_NAME, JOB_DESC, JOB_PICK, upkeepLabel, itemName, type Job } from './functions';
import { BIO, BIO_GENES } from '../life/genesBio';
import { GENE } from '../life/genes';
import { BT_KINDS, cycleClimate, stateOf, queueVat, vatCost, vatTime } from './structures';
import { el, ui, toast, Tip } from '../ui/kit';
import { paper, enamel, paintEl, unpaint, pencil, PAL } from '../ui/labPaper';
import { sfx } from '../audio/audio';
import { RAMPS } from '../art/palette';
import { clamp } from '../core/rand';
import { ITEMS, itemIcon } from '../factory/items';

const CSS = `
.bw { position: fixed; inset: 0; pointer-events: none; z-index: 3; font-family: 'Pixelify', monospace; color: ${PAL.graphite}; -webkit-font-smoothing: none; }
.bw .vt { font-family: 'VT', monospace; font-size: var(--vt); line-height: calc(var(--vt) * 1.05); }
.bw .np { font-family: 'Jersey', monospace; font-size: var(--np); line-height: var(--np); letter-spacing: 0.05em; }
.bw .ps { font-family: 'Pixelify', monospace; font-size: var(--ps); line-height: calc(var(--ps) * 1.2); }
.bw .sw { font-family: 'Superwide', monospace; font-size: var(--sw); line-height: var(--sw); letter-spacing: 0.14em; }
.bw b { color: inherit; font-weight: normal; display: inline-block; }
.bw .pencil, .bw-up { font-family: 'Pixelify', monospace; font-size: var(--ps); line-height: calc(var(--ps) * 1.35); color: #4b4a46; }
.bw-slip { position: absolute; left: calc(10 * var(--k)); bottom: calc(150 * var(--k)); width: calc(318 * var(--k)); padding: calc(12 * var(--k)) calc(12 * var(--k)) calc(10 * var(--k)); box-sizing: border-box; pointer-events: auto; transform: rotate(-0.6deg); box-shadow: 0 calc(3 * var(--k)) calc(8 * var(--k)) rgba(10, 8, 4, 0.55); display: none; }
.bw-slip.open { display: block; animation: bw-in 240ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both; }
@keyframes bw-in { 0% { transform: translateY(calc(30 * var(--k))) rotate(-2deg); opacity: 0; } 100% { transform: rotate(-0.6deg); opacity: 1; } }
.bw-h { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${PAL.graphite}; padding-bottom: calc(2 * var(--k)); margin-bottom: calc(4 * var(--k)); }
.bw-who { color: #2e2d2a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bw-fn { color: #3e4a52; }
.bw-fn div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bw-up { color: #5a5850; margin: calc(2 * var(--k)) 0 calc(5 * var(--k)); }
.bw-jobs { display: flex; flex-wrap: wrap; gap: calc(3 * var(--k)); margin-top: calc(3 * var(--k)); }
.bw-tab { position: relative; border: none; cursor: inherit; padding: calc(3 * var(--k)) calc(6 * var(--k)) calc(2 * var(--k)); font-family: 'Jersey', monospace; font-size: var(--np); letter-spacing: 0.05em; color: #4a4842; background: linear-gradient(180deg, #cdbd93, #b8a77d); clip-path: polygon(calc(4 * var(--k)) 0, calc(100% - 4 * var(--k)) 0, 100% 100%, 0 100%); box-shadow: inset 0 1px 0 rgba(255, 250, 225, 0.5); transition: transform 120ms cubic-bezier(0.3, 1.5, 0.5, 1); }
.bw-tab:hover { transform: translateY(calc(-2 * var(--k))); }
.bw-tab.on { background: linear-gradient(180deg, #ddd0a8, #c8b88e); color: ${PAL.graphite}; }
.bw-tab.on::after { content: ''; position: absolute; left: calc(5 * var(--k)); right: calc(5 * var(--k)); bottom: calc(2 * var(--k)); height: 1px; background: ${PAL.stamp}; }
.bw-tab.arm { background: linear-gradient(180deg, #e4cd98, #c9a464); color: #2e2d2a; }
.bw-tab.dis { color: rgba(74, 72, 66, 0.4); background: linear-gradient(180deg, #b9ad8c, #a99d7c); }
.bw-tab.tr { background: linear-gradient(180deg, #a6a8a2, #8d8f8a); color: #23221f; }
.bw-now { margin-top: calc(6 * var(--k)); border-top: 1px solid rgba(59, 58, 54, 0.45); padding-top: calc(4 * var(--k)); color: #3b3a36; }
.bw-now div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bw-hint { position: absolute; left: 50%; top: calc(64 * var(--k)); transform: translateX(-50%) rotate(-0.8deg); padding: calc(5 * var(--k)) calc(12 * var(--k)); pointer-events: none; display: none; box-shadow: 0 calc(2 * var(--k)) calc(5 * var(--k)) rgba(10, 8, 4, 0.5); }
.bw-led { position: absolute; right: calc(10 * var(--k)); top: calc(70 * var(--k)); width: calc(330 * var(--k)); max-height: calc(100vh - 240 * var(--k)); overflow: hidden auto; scrollbar-width: none; padding: calc(14 * var(--k)) calc(12 * var(--k)) calc(12 * var(--k)); box-sizing: border-box; pointer-events: auto; transform: rotate(0.4deg); box-shadow: 0 calc(4 * var(--k)) calc(10 * var(--k)) rgba(10, 8, 4, 0.55); display: none; }
.bw-led.open { display: block; animation: bw-in 240ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both; }
.bw-led::-webkit-scrollbar { display: none; }
.bw-t { font-family: 'Superwide', monospace; font-size: var(--sw); letter-spacing: 0.16em; margin: calc(9 * var(--k)) 0 calc(3 * var(--k)); color: #4a4842; }
.bw-row { display: grid; grid-template-columns: calc(18 * var(--k)) 1fr auto; align-items: center; gap: calc(5 * var(--k)); border-bottom: 1px solid rgba(59, 58, 54, 0.3); min-height: calc(18 * var(--k)); }
.bw-row img { width: calc(16 * var(--k)); height: calc(16 * var(--k)); image-rendering: pixelated; }
.bw-row .r { font-family: 'VT', monospace; font-size: var(--vt); color: ${PAL.graphite}; text-align: right; }
.bw-p { display: grid; grid-template-columns: 1fr auto; gap: calc(4 * var(--k)); border-bottom: 1px dotted rgba(59, 58, 54, 0.35); padding: 1px 0; }
.bw-p .ps { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bw-btns { display: flex; flex-wrap: wrap; gap: calc(3 * var(--k)); margin: calc(3 * var(--k)) 0; }
.bw-tag { position: absolute; right: 0; top: calc(130 * var(--k)); pointer-events: auto; padding: calc(8 * var(--k)) calc(5 * var(--k)); writing-mode: vertical-rl; cursor: inherit; border: none; font-family: 'Jersey', monospace; font-size: var(--np); letter-spacing: 0.14em; color: #2e2d2a; background: linear-gradient(90deg, #c8b88e, #ddd0a8); clip-path: polygon(calc(5 * var(--k)) 0, 100% 0, 100% 100%, calc(5 * var(--k)) 100%, 0 calc(100% - 5 * var(--k)), 0 calc(5 * var(--k))); box-shadow: inset 1px 0 0 rgba(255, 250, 225, 0.5); }
.bw-tag:hover { transform: translateX(calc(-3 * var(--k))); }
.bw-ov { position: fixed; inset: 0; pointer-events: none; z-index: 2; }
@media (prefers-reduced-motion: reduce) { .bw *, .bw *::before, .bw *::after { animation: none !important; transition: none !important; } }
body.lab-open .bw, body.lab-open .bw-ov { display: none; }
`;
const ORDER: Job[] = ['produce', 'farm', 'eco', 'dig', 'channel', 'mound', 'spring', 'haul', 'operate', 'guard', 'troop', 'habitat', 'auto', 'idle'];
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const fmt = (n: number) => (n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

type Arm = { k: 'job'; job: Job; pts: { x: number; z: number }[] } | { k: 'troop'; o: 'move' | 'attack' | 'guard' | 'patrol' } | { k: 'sow'; gene: string; prefab: number } | null;

export class BioUI {
  private root: HTMLDivElement; private slip: HTMLDivElement; private led: HTMLDivElement; private hint: HTMLDivElement; private tagB: HTMLButtonElement;
  private ov: HTMLCanvasElement; private og: CanvasRenderingContext2D;
  private painted: HTMLElement[] = [];
  private arm: Arm = null;
  private key = ''; private ledKey = ''; private t = 0;
  private mx = 0; private my = 0;
  private sowGene = ''; private sowPrefab = 0;
  private icons = new Map<string, string>();

  constructor(readonly g: Game, readonly bt: Biotech) {
    if (!document.getElementById('bw-css')) { const s = document.createElement('style'); s.id = 'bw-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.root = el('div', 'bw', ui());
    this.scale();
    const P = <T extends HTMLElement>(e: T, f: (w: number, h: number) => string) => { this.painted.push(e); paintEl(e, f); return e; };
    this.slip = P(el('div', 'bw-slip', this.root), (w, h) => paper(w, h, { seed: 71, edge: 2, fold: Math.round(h * 0.55) }));
    this.led = P(el('div', 'bw-led', this.root), (w, h) => paper(w, h, { seed: 83, rule: 'form', tape: true, coffee: [w * 0.82, h * 0.9, Math.min(w, h) * 0.12] }));
    this.hint = P(el('div', 'bw-hint vt', this.root), (w, h) => paper(w, h, { seed: 91, edge: 1 }));
    this.tagB = P(el('button', 'bw-tag', this.root, 'BIOWORKS [J]'), (w, h) => enamel(w, h, { seed: 5, color: '#c8b88e', chips: 2 })) as HTMLButtonElement;
    this.tagB.addEventListener('click', (e) => { e.stopPropagation(); this.toggleLedger(); });
    this.tagB.addEventListener('pointerenter', () => Tip.show('<h4>Bioworks ledger</h4>Production per minute, upkeep, every producer, plant works, vats and habitats. [J]', this.tagB));
    this.tagB.addEventListener('pointerleave', () => Tip.hide());
    for (const e of [this.slip, this.led]) { e.addEventListener('pointerdown', (ev) => ev.stopPropagation()); e.addEventListener('wheel', (ev) => ev.stopPropagation(), { passive: true }); }
    this.ov = el('canvas', 'bw-ov', document.body); this.og = this.ov.getContext('2d')!;
    this.resize();
    addEventListener('resize', this.onResize);
    addEventListener('pointerdown', this.onDown, true);
    addEventListener('pointermove', this.onMove, true);
    addEventListener('keydown', this.onKey);
    addEventListener('contextmenu', this.onCtx, true);
    g.update$.push((dt) => this.update(dt));
    bt.onChange = () => { this.key = ''; this.ledKey = ''; };
    const prevDispose = g.dispose.bind(g);
    g.dispose = () => { this.dispose(); prevDispose(); };
  }
  private onResize = () => { this.scale(); this.resize(); };
  private scale() {
    const k = innerHeight >= 1040 ? 2 : 1, r = this.root.style;
    r.setProperty('--k', k + 'px'); r.setProperty('--vt', 14 * k + 'px'); r.setProperty('--ps', 11 * k + 'px'); r.setProperty('--np', 13 * k + 'px'); r.setProperty('--sw', 10 * k + 'px');
  }
  private resize() { this.ov.width = innerWidth; this.ov.height = innerHeight; }
  private get active() { return this.g.hud.root.style.display !== 'none' && !document.body.classList.contains('lab-open'); }
  private selected(): Creature[] { return this.g.sel.filter((c) => !c.dead && c.faction === 'veyr'); }
  private selWorkers(): Worker[] { return this.selected().map((c) => this.bt.worker(c)).filter(Boolean) as Worker[]; }

  // ============================================================================================ input
  private onKey = (e: KeyboardEvent) => {
    if (!this.active || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'j' || e.key === 'J') { this.toggleLedger(); e.preventDefault(); }
    else if (e.key === 'Escape' && this.arm) { this.disarm(); e.stopImmediatePropagation(); }
  };
  private onMove = (e: PointerEvent) => { this.mx = e.clientX; this.my = e.clientY; };
  private onCtx = (e: MouseEvent) => { if (this.arm && e.target === this.g.engine.canvas) e.preventDefault(); };
  private onDown = (e: PointerEvent) => {
    if (!this.active || e.target !== this.g.engine.canvas) return;
    const g = this.g;
    if (this.arm) {
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.button === 2) { this.disarm(); return; }
      if (e.button === 0) this.armClick(e.clientX, e.clientY, e.shiftKey);
      return;
    }
    // the smart right-click: engineered workers take the job that suits the place
    if (e.button === 2 && g.mode.k === 'normal') {
      const sel = this.selected();
      if (!sel.length || !sel.every((c) => this.bt.isEngineered(c.sp))) return;
      e.stopImmediatePropagation(); e.preventDefault();
      const foe = g.pickCreature(e.clientX, e.clientY, (c) => !c.dead && c.faction !== 'veyr');
      if (foe) { for (const c of sel) this.bt.order(c, { k: 'attack', target: foe }); this.ack(foe.x, foe.z, 'ATTACK'); return; }
      const p = g.groundAt(e.clientX, e.clientY); if (!p) return;
      const troops = sel.filter((c) => this.bt.worker(c)?.job === 'troop'), rest = sel.filter((c) => !troops.includes(c));
      if (troops.length) g.formation(troops, p.x, p.z, 'move');
      if (rest.length) { const why = this.bt.workAt(rest, p.x, p.z); if (why) { sfx('deny'); toast(why, 'warn', 1600); return; } }
      this.ack(p.x, p.z, 'WORK HERE');
    }
  };
  private armClick(mx: number, my: number, shift: boolean) {
    const g = this.g, a = this.arm!;
    if (a.k === 'troop') {
      const sel = this.selected();
      const foe = a.o === 'attack' ? g.pickCreature(mx, my, (c) => !c.dead && c.faction !== 'veyr') : null;
      const p = g.groundAt(mx, my);
      if (!foe && !p) return;
      sel.forEach((c, i) => {
        const ox = ((i % 3) - 1) * 1.4, oz = (Math.floor(i / 3) - 1) * 1.4;
        this.bt.order(c, foe ? { k: 'attack', target: foe } : { k: a.o, x: p!.x + ox, z: p!.z + oz });
      });
      this.ack((foe ?? p)!.x, (foe ?? p)!.z, a.o.toUpperCase());
      if (!shift) this.disarm();
      return;
    }
    const p = g.groundAt(mx, my); if (!p) return;
    if (a.k === 'sow') {
      const fl = g.world.flora; let hit = -1;
      fl.near(p.x, p.z, 0.7, (i) => { if (fl.bio[i] > 0.1) hit = i; });
      const pre = g.run.plants[a.prefab];
      const why = hit >= 0 && g.veyr.isGrafted(hit) ? this.bt.engineerPlant(hit, a.gene) : pre ? this.bt.sowEngineered(pre, a.gene, p.x, p.z) : 'Save a plant prefab first (Seed Press)';
      if (why) { sfx('deny'); toast(why, 'warn', 1600); } else { sfx('grow', 1.1, 0.6); this.ledKey = ''; }
      if (!shift && !why) this.disarm();
      return;
    }
    a.pts.push({ x: p.x, z: p.z });
    const need = JOB_PICK[a.job] ?? 1;
    if (a.pts.length < need) { sfx('click', 1.3, 0.5); this.showHint('CLICK THE CHANNEL\'S FAR END'); return; }
    const sel = this.selected();
    let ok = 0, why: string | null = null;
    sel.forEach((c, i) => {
      const spread = a.job === 'dig' || a.job === 'channel' || a.job === 'mound' || a.job === 'spring' ? 0 : 1.5;
      const ox = ((i % 3) - 1) * spread, oz = (Math.floor(i / 3) - 1) * spread;
      const e = a.job === 'channel' ? this.bt.assign(c, 'channel', a.pts[0].x, a.pts[0].z, a.pts[1].x, a.pts[1].z) : this.bt.assign(c, a.job, a.pts[0].x + ox, a.pts[0].z + oz);
      if (e) why = e; else ok++;
    });
    if (!ok) { sfx('deny'); toast(why ?? 'None of them can', 'warn', 1800); }
    else this.ack(p.x, p.z, JOB_NAME[a.job]);
    if (!shift || a.job === 'channel') this.disarm(); else a.pts = [];
  }
  private ack(x: number, z: number, _what: string) {
    sfx('call', 1, 0.4); sfx('click', 1, 0.5);
    this.g.fx.burst(x, this.g.world.surfaceY(x, z) + 0.1, z, 8, RAMPS.glowAmber[3], { glow: true, up: 0.8, speed: 1.1, size: 2, life: 0.5 });
    this.key = '';
  }
  private setArm(a: Arm, hint: string) { this.arm = a; this.showHint(hint); document.body.classList.add('c-target'); this.key = ''; }
  private disarm() { this.arm = null; this.hint.style.display = 'none'; document.body.classList.remove('c-target'); this.key = ''; }
  private showHint(s: string) { this.hint.textContent = s + '  ·  RIGHT-CLICK OR ESC TO CANCEL'; this.hint.style.display = 'block'; }

  // ============================================================================================ the work order slip
  private pickJob(job: Job) {
    const ws = this.selWorkers(); if (!ws.length) return;
    const able = ws.filter((w) => w.prof.jobs.includes(job));
    if (!able.length) { sfx('deny'); toast(`None of these has the organ for ${JOB_NAME[job].toLowerCase()}`, 'warn', 1800); return; }
    sfx('click', 1.2, 0.6);
    if (job === 'troop') { for (const w of able) this.bt.assign(w.c, 'troop'); this.key = ''; return; }
    if (JOB_PICK[job]) { this.setArm({ k: 'job', job, pts: [] }, job === 'channel' ? 'CLICK WHERE THE CHANNEL STARTS' : job === 'operate' ? 'CLICK A MACHINE OR A VAT' : `CLICK WHERE TO ${JOB_NAME[job]}`); return; }
    let why: string | null = null;
    for (const w of able) { const e = this.bt.assign(w.c, job, job === 'auto' ? w.c.x : undefined, job === 'auto' ? w.c.z : undefined); if (e) why = e; }
    if (why) toast(why, 'warn', 1800);
  }
  private renderSlip() {
    const ws = this.selWorkers();
    const open = ws.length > 0 && this.active;
    this.slip.classList.toggle('open', open);
    if (!open) return;
    const sp = new Map<string, number>(); for (const w of ws) sp.set(w.c.sp.name, (sp.get(w.c.sp.name) ?? 0) + 1);
    const k = ws.map((w) => `${w.c.id}:${w.job}:${w.state}`).join(',') + '|' + (this.arm ? JSON.stringify(this.arm) : '');
    const first = ws[0], prof = first.prof;
    if (k !== this.key) {
      this.key = k;
      const s = this.slip; s.innerHTML = '';
      const h = el('div', 'bw-h', s); el('span', 'sw', h, 'WORK ORDER'); el('span', 'vt', h, `No. ${String(first.c.id).padStart(4, '0')}`);
      el('div', 'vt bw-who', s, esc([...sp].map(([n, c]) => `${c > 1 ? c + ' × ' : ''}${n.toUpperCase()}`).join(' · ')));
      const fns = el('div', 'ps bw-fn', s);
      const lines = prof.fns.length ? prof.fns.map((f) => f.label) : ['NO FUNCTIONAL ORGANS · GUARD, TROOP OR HABITAT ONLY'];
      fns.innerHTML = lines.slice(0, 4).map((l) => `<div>→ ${esc(l)}</div>`).join('');
      el('div', 'ps bw-up', s, pencil(upkeepLabel(prof) + (prof.docile ? ' · DOCILE' : '') + (prof.sterile ? ' · STERILE' : '') + (prof.locked ? ' · GENE-LOCKED' : ''), 4));
      const jobs = el('div', 'bw-jobs', s);
      const cur = new Set(ws.map((w) => w.job));
      for (const j of ORDER) {
        const able = ws.some((w) => w.prof.jobs.includes(j));
        if (!able && (j === 'channel' || j === 'mound' || j === 'spring' || j === 'haul' || j === 'operate' || j === 'farm')) continue;
        const armed = this.arm?.k === 'job' && this.arm.job === j;
        const b = el('button', `bw-tab${cur.has(j) ? ' on' : ''}${armed ? ' arm' : ''}${able ? '' : ' dis'}`, jobs, JOB_NAME[j]);
        b.addEventListener('click', (e) => { e.stopPropagation(); this.pickJob(j); });
        b.addEventListener('pointerenter', () => Tip.show(`<h4>${JOB_NAME[j]}</h4>${JOB_DESC[j]}${able ? '' : '<div class="tip-warn">No organ for it</div>'}`, b));
        b.addEventListener('pointerleave', () => Tip.hide());
      }
      if (ws.some((w) => w.job === 'troop')) {
        const tr = el('div', 'bw-jobs', s);
        for (const o of ['move', 'attack', 'guard', 'patrol'] as const) {
          const armed = this.arm?.k === 'troop' && this.arm.o === o;
          const b = el('button', `bw-tab tr${armed ? ' arm' : ''}`, tr, o.toUpperCase());
          b.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', 1.2, 0.6); this.setArm({ k: 'troop', o }, o === 'attack' ? 'CLICK AN ENEMY OR WHERE TO ADVANCE' : o === 'patrol' ? 'CLICK THE FAR END OF THE PATROL' : `CLICK WHERE TO ${o.toUpperCase()}`); });
        }
      }
      el('div', 'ps bw-now', s);
    }
    // the live lines: each worker's job, state and output
    const now = this.slip.querySelector('.bw-now') as HTMLElement;
    const rows = ws.slice(0, 4).map((w, i) => {
      const r = this.bt.rateOf(w.out);
      const item = w.out[w.out.length - 1]?.item ?? w.fn?.fn.item ?? '';
      return `<div>${i + 1}. ${JOB_NAME[w.job]} · ${esc(w.note)}${r > 0.01 ? ` · ${fmt(r)} ${esc(itemName(item))}/MIN` : ''}${w.pile >= 1 ? ` · PILE ${Math.floor(w.pile)}` : ''}${w.fed < 0.5 ? ' · <b style="color:#a2473a">HUNGRY</b>' : ''}</div>`;
    });
    if (ws.length > 4) rows.push(`<div>… AND ${ws.length - 4} MORE</div>`);
    const html = rows.join('');
    if (now.dataset.h !== html) { now.innerHTML = html; now.dataset.h = html; }
  }

  // ============================================================================================ the ledger
  private toggleLedger() { const o = !this.led.classList.contains('open'); this.led.classList.toggle('open', o); this.ledKey = ''; sfx(o ? 'open' : 'close', 1, 0.5); }
  private itemIcon(id: string): string {
    let u = this.icons.get(id);
    if (u === undefined) {
      u = '';
      try { if (ITEMS[id]) u = itemIcon(id, 1); } catch { u = ''; }
      this.icons.set(id, u);
    }
    return u;
  }
  private renderLedger() {
    if (!this.led.classList.contains('open') || !this.active) return;
    const bt = this.bt, f = (this.g as any).factory;
    const rates = bt.rates(), up = bt.upkeep();
    const ws = [...bt.workers.values()];
    const prods = bt.producers().filter((p) => p.perMin > 0.01).sort((a, b) => b.perMin - a.perMin);
    const vats = (f?.buildings ?? []).filter((b: any) => b.kind === 'bt_vat' && !b.dead);
    const habs = (f?.buildings ?? []).filter((b: any) => b.kind === 'bt_habitat' && !b.dead);
    const plantGenes = BIO_GENES.filter((g) => g.bio.plant && this.g.run.has(g.id));
    const key = JSON.stringify([Object.entries(rates).map(([k, v]) => [k, Math.round(v * 10)]), Math.round(up.food * 10), prods.slice(0, 10).map((p) => [p.name, p.job, Math.round(p.perMin * 10), p.note]), ws.map((w) => w.job + w.note), vats.map((b: any) => [stateOf(b).queue, Math.round(stateOf(b).prog * 20)]), habs.map((b: any) => stateOf(b).climate), plantGenes.length, this.g.run.plants.length, this.sowGene, this.sowPrefab, this.arm?.k]);
    if (key === this.ledKey) return;
    this.ledKey = key;
    const L = this.led; L.innerHTML = '';
    const h = el('div', 'bw-h', L); el('span', 'sw', h, 'BIOWORKS LEDGER'); el('span', 'np', h, 'FORM BW-2');
    el('div', 'np', L, 'U.S. PLANETARY CORPS · LIVING PRODUCTION · PER MINUTE').style.color = '#6a6658';
    // production
    el('div', 'bw-t', L, 'PRODUCTION');
    const items = Object.entries(rates).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]);
    if (!items.length) el('div', 'ps', L, pencil('Nothing produced in the last minute. Give your engineered stock work.', 3));
    for (const [id, v] of items) {
      const r = el('div', 'bw-row', L);
      const ic = this.itemIcon(id); if (ic) { const im = el('img', '', r); im.src = ic; } else el('span', '', r);
      el('span', 'ps', r, esc(id === 'ground' ? 'GROUND MOVED (M³)' : id === 'marsh' ? 'MARSH MADE (M²)' : id === 'sand' ? 'SAND BOUND (M²)' : itemName(id)));
      el('span', 'r', r, fmt(v));
    }
    el('div', 'bw-t', L, 'UPKEEP');
    el('div', 'vt', L, `FRUIT ${fmt(up.food)} · WATER ${fmt(up.water)} /MIN`);
    const hungry = ws.filter((w) => w.fed < 0.5).length, piles = ws.filter((w) => w.pile >= 1).length, at = ws.filter((w) => w.job !== 'idle').length;
    el('div', 'ps', L, `${ws.length} ENGINEERED · ${at} AT WORK${hungry ? ` · <b style="color:#a2473a">${hungry} HUNGRY</b>` : ''}${piles ? ` · ${piles} PILE${piles > 1 ? 'S' : ''} BEYOND ${DROP_R} M` : ''}`);
    if (prods.length) {
      el('div', 'bw-t', L, 'PRODUCERS');
      for (const p of prods.slice(0, 10)) { const r = el('div', 'bw-p', L); el('span', 'ps', r, esc(`${p.name} · ${p.job}${p.note ? ' · ' + p.note : ''}`)); el('span', 'vt', r, `${fmt(p.perMin)} ${esc(itemName(p.item))}`); }
    }
    // plant works
    el('div', 'bw-t', L, 'PLANT WORKS');
    if (!plantGenes.length) el('div', 'ps', L, pencil('No plant genes yet. Save plants with the Seed Press: trees give resin bark, water plants algae, fruiting shrubs heavy fruiting.', 6));
    else {
      if (!this.sowGene || !this.g.run.has(this.sowGene)) this.sowGene = plantGenes[0].id;
      const gb = el('div', 'bw-btns', L);
      for (const g of plantGenes) { const b = el('button', `bw-tab${this.sowGene === g.id ? ' on' : ''}`, gb, g.name.toUpperCase()); b.addEventListener('click', (e) => { e.stopPropagation(); this.sowGene = g.id; this.ledKey = ''; sfx('click', 1.3, 0.4); }); b.addEventListener('pointerenter', () => Tip.show(`<h4>${g.name}</h4>${g.desc}`, b)); b.addEventListener('pointerleave', () => Tip.hide()); }
      const pl = this.g.run.plants;
      const pb = el('div', 'bw-btns', L);
      pl.slice(-6).forEach((p) => { const i = pl.indexOf(p); const b = el('button', `bw-tab${this.sowPrefab === i ? ' on' : ''}`, pb, p.name.toUpperCase()); b.addEventListener('click', (e) => { e.stopPropagation(); this.sowPrefab = i; this.ledKey = ''; sfx('click', 1.3, 0.4); }); });
      const go = el('div', 'bw-btns', L);
      const sow = el('button', `bw-tab${this.arm?.k === 'sow' ? ' arm' : ''}`, go, 'SOW / ENGINEER ▸');
      sow.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', 1.2, 0.6); this.setArm({ k: 'sow', gene: this.sowGene, prefab: this.sowPrefab }, `CLICK GROUND TO SOW, OR A GRAFTED PLANT · ${GENE[this.sowGene].name.toUpperCase()}`); });
      el('span', 'ps', go, `${bt.plants.length} ENGINEERED PLANTS · ${bt.springs.length} SPRINGS`);
    }
    // vats
    if (vats.length) {
      el('div', 'bw-t', L, 'GROWTH VATS');
      const designs = this.g.run.reg.list.filter((s) => s.owner === 'veyr').slice(-6);
      vats.forEach((b: any, n: number) => {
        const s = stateOf(b), cur = s.queue.length ? this.g.run.reg.get(s.queue[0]) : null;
        el('div', 'vt', L, `VAT ${n + 1} · ${cur ? `${cur.name.toUpperCase()} ${Math.round(s.prog * 100)}%` : 'EMPTY'}${s.queue.length > 1 ? ` · +${s.queue.length - 1}` : ''}${b.status === 'nopower' ? ' · NO POWER' : ''}`);
        const bb = el('div', 'bw-btns', L);
        for (const sp of designs) {
          const c = vatCost(sp);
          const btn = el('button', 'bw-tab', bb, `GROW ${sp.name.toUpperCase()}`);
          btn.addEventListener('click', (e) => { e.stopPropagation(); const why = queueVat(b, sp); if (why) { sfx('deny'); toast(why, 'warn', 1600); } else { sfx('click', 1, 0.6); this.ledKey = ''; } });
          btn.addEventListener('pointerenter', () => Tip.show(`<h4>Grow ${esc(sp.name)}</h4>${c.carbon} carbon, ${c.water} water · ${vatTime(sp).toFixed(0)} s in the tank${this.g.run.skills.has('bt_clone') ? ' · twins' : ''}`, btn));
          btn.addEventListener('pointerleave', () => Tip.hide());
        }
        if (this.g.run.skills.has('bt_clone')) {
          const sel = this.selected()[0];
          const cl = el('button', `bw-tab${sel ? '' : ' dis'}`, bb, sel ? `CLONE ${sel.sp.name.toUpperCase()}` : 'CLONE (SELECT ONE)');
          cl.addEventListener('click', (e) => { e.stopPropagation(); if (!sel) return; const why = queueVat(b, sel.sp); if (why) toast(why, 'warn', 1600); else { sfx('click'); this.ledKey = ''; } });
        }
      });
    }
    if (habs.length) {
      el('div', 'bw-t', L, 'HABITATS');
      const hl = bt.habitats();
      habs.forEach((b: any, n: number) => {
        const h2 = hl.find((x) => x.b === b), bb = el('div', 'bw-btns', L);
        el('span', 'vt', bb, `HAB ${n + 1} · ${h2 ? `${h2.pop}/${h2.cap}` : '—'} ·`);
        const btn = el('button', 'bw-tab on', bb, `CLIMATE: ${stateOf(b).climate.toUpperCase()}`);
        btn.addEventListener('click', (e) => { e.stopPropagation(); cycleClimate(b); sfx('click', 0.9, 0.6); this.ledKey = ''; });
      });
    }
    if (!f) el('div', 'ps', L, pencil('No works yet: vats, habitats, fields and reactors are raised from the factory build menu (Bio-Works).', 8));
    else if (!vats.length && !habs.length && !(f.buildings ?? []).some((b: any) => (BT_KINDS as readonly string[]).includes(b.kind))) el('div', 'ps', L, pencil('Raise Bio-Works from the build menu: reactor, vat, habitat, force field.', 8));
  }

  // ============================================================================================ field tags
  private drawOverlay() {
    const g = this.og, W = this.ov.width, H = this.ov.height;
    g.clearRect(0, 0, W, H);
    if (!this.active) return;
    const k = innerHeight >= 1040 ? 2 : 1;
    const cam = this.g.cam.cam.position;
    for (const w of this.bt.workers.values()) {
      const c = w.c;
      if (c.dead || !c.mesh.visible || (w.job === 'idle' && w.pile < 1)) continue;
      if ((c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 > 70 * 70) continue;
      const [sx, sy, ok] = this.g.screenOf(c.x, c.y + c.air + c.sp.pheno.height * c.growth + 0.55, c.z);
      if (!ok || sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      const x = Math.round(sx) - 6 * k, y = Math.round(sy) - 14 * k - (c.selected || c.hovered ? 6 * k : 0);
      this.badge(g, x, y, k, w);
    }
    // targeting
    if (this.arm && this.arm.k !== 'troop') {
      const p = this.g.groundAt(this.mx, this.my);
      if (p) {
        const r = this.arm.k === 'job' ? (this.arm.job === 'dig' ? 1.6 : this.arm.job === 'mound' ? 1.7 : this.arm.job === 'channel' ? 1.1 : 2.2) : 0.7;
        this.ring(p.x, p.z, r, hex(RAMPS.glowAmber[3]));
        if (this.arm.k === 'job' && this.arm.job === 'channel' && this.arm.pts.length === 1) this.dash(this.arm.pts[0].x, this.arm.pts[0].z, p.x, p.z, hex(RAMPS.glowAmber[3]));
      }
    }
    // the sites of the selected
    for (const w of this.selWorkers()) {
      if (!w.site || w.job === 'idle' || w.job === 'troop') continue;
      this.ring(w.site.x, w.site.z, 0.9, hex(RAMPS.glowTeal[3]));
      if (w.site2) this.dash(w.site.x, w.site.z, w.site2.x, w.site2.z, hex(RAMPS.glowTeal[3]));
    }
  }
  /** a small paper tag: the job glyph, the cycle tick bar, a trouble flag; a crate and a count for a pile */
  private badge(g: CanvasRenderingContext2D, x: number, y: number, k: number, w: Worker) {
    const P = (px: number, py: number, pw: number, ph: number, col: number) => { g.fillStyle = hex(col); g.fillRect(x + px * k, y + py * k, pw * k, ph * k); };
    const trouble = w.fed < 0.5 || /NO |FULL|GONE|NOTHING|HUNGRY/.test(w.note);
    // tag body: paper with an ink rim, a notch at the bottom (the string)
    P(0, 0, 13, 11, RAMPS.ink[1]); P(1, 1, 11, 9, RAMPS.paper[4]); P(1, 1, 11, 1, RAMPS.paper[5]); P(11, 2, 1, 8, RAMPS.paper[2]);
    P(6, 11, 1, 2, RAMPS.ink[1]);
    const glyph = GLYPH[w.job] ?? GLYPH.auto;
    for (let r = 0; r < glyph.length; r++) for (let q = 0; q < glyph[r].length; q++) if (glyph[r][q] === '#') P(3 + q, 2 + r, 1, 1, trouble ? RAMPS.stampRed[3] : RAMPS.ink[1]);
    // cycle bar under the tag
    const prog = w.fn && w.state === 'work' ? clamp(w.acc % 1, 0, 1) : 0;
    if (prog > 0) { P(0, 14, 13, 2, RAMPS.ink[0]); P(1, 14, Math.max(1, Math.round(11 * prog)), 1, RAMPS.glowTeal[3]); }
    if (w.pile >= 1) {
      P(15, 3, 8, 7, RAMPS.ink[1]); P(16, 4, 6, 5, RAMPS.brass[3]); P(16, 4, 6, 1, RAMPS.brass[5]); P(18, 4, 1, 5, RAMPS.brass[1]);
      g.fillStyle = hex(RAMPS.paper[5]); g.font = `${10 * k}px VT, monospace`; g.fillText(String(Math.floor(w.pile)), x + 24 * k, y + 10 * k);
    }
  }
  private ring(x: number, z: number, r: number, col: string) {
    const g = this.og, k = innerHeight >= 1040 ? 2 : 1, n = Math.max(20, Math.floor(r * 12)), N = this.g.region.N;
    g.fillStyle = col;
    for (let i = 0; i < n; i += 2) {
      const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const [sx, sy, ok] = this.g.screenOf(px, this.g.world.surfaceY(clamp(px, 0, N - 0.01), clamp(pz, 0, N - 0.01)) + 0.08, pz);
      if (ok) g.fillRect(Math.round(sx) - k, Math.round(sy) - k, 2 * k, 2 * k);
    }
  }
  private dash(x0: number, z0: number, x1: number, z1: number, col: string) {
    const g = this.og, k = innerHeight >= 1040 ? 2 : 1, L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.floor(L * 2)), N = this.g.region.N;
    g.fillStyle = col;
    for (let i = 0; i <= n; i += 2) {
      const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const [sx, sy, ok] = this.g.screenOf(px, this.g.world.surfaceY(clamp(px, 0, N - 0.01), clamp(pz, 0, N - 0.01)) + 0.08, pz);
      if (ok) g.fillRect(Math.round(sx) - k, Math.round(sy) - k, 2 * k, 2 * k);
    }
  }

  // ============================================================================================ frame
  update(dt: number) {
    this.t += dt;
    this.tagB.style.display = this.active ? '' : 'none';
    if (this.arm && (!this.active || (this.arm.k !== 'sow' && !this.selected().length))) this.disarm();
    this.renderSlip();
    if ((this.t % 0.5) < dt) this.renderLedger();
    this.drawOverlay();
  }
  dispose() {
    removeEventListener('resize', this.onResize); removeEventListener('pointerdown', this.onDown, true); removeEventListener('pointermove', this.onMove, true);
    removeEventListener('keydown', this.onKey); removeEventListener('contextmenu', this.onCtx, true);
    for (const e of this.painted) unpaint(e);
    this.root.remove(); this.ov.remove(); document.body.classList.remove('c-target');
  }
}

/** 7x7 job glyphs, drawn by hand */
const GLYPH: Partial<Record<Job, string[]>> = {
  dig: ['....#..', '...###.', '....#..', '....#..', '..#.#.#', '..#####', '...###.'],
  channel: ['#.....#', '#.....#', '##...##', '.#####.', '.......', '.#.#.#.', '#.#.#.#'],
  mound: ['.......', '...#...', '..###..', '.#####.', '#######', '.......', '#######'],
  spring: ['...#...', '..#.#..', '...#...', '.#...#.', '#.#.#.#', '.#####.', '..###..'],
  produce: ['..#.#..', '.#####.', '##...##', '.#.#.#.', '##...##', '.#####.', '..#.#..'],
  farm: ['.#####.', '.#...#.', '#.....#', '#######', '#.....#', '#.....#', '.#####.'],
  eco: ['.....##', '...####', '..####.', '.####..', '.###...', '#.#....', '#......'],
  haul: ['#######', '#.#.#.#', '#######', '#.#.#.#', '#######', '.#...#.', '.#...#.'],
  operate: ['.##....', '#..#...', '.###...', '...###.', '....#.#', '....###', '.......'],
  guard: ['#######', '#.....#', '#.###.#', '#.###.#', '.#...#.', '..#.#..', '...#...'],
  troop: ['#.....#', '.#...#.', '..#.#..', '#..#..#', '.#...#.', '..#.#..', '...#...'],
  habitat: ['..###..', '.#...#.', '#.....#', '#..#..#', '#.###.#', '#######', '.......'],
  auto: ['..###..', '.#...#.', '#.....#', '#######', '#.....#', '#.....#', '#.....#'],
};

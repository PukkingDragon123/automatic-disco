// The factory's paperwork. Build mode opens the Corps' FIELD WORKS CATALOGUE along the bottom: typed catalogue
// cards, each with an engraved plate of the machine, its specification and its price, locked ones stamped. Clicking
// a machine opens its INSPECTION FORM (status, buffers, recipe, power, operator, priority). The PRODUCTION REPORT
// tallies items made and used per minute, the power grids, and the machines holding the line up. The CREW ROSTER
// lists the workers with their jobs, appetites and moods. Over the world: a tag at the cursor in build mode, and
// small hand-drawn flags over machines that are starved, blocked or dark.
import type { Factory, FBuilding, Status } from './factory';
import { STATUS_NAME, STATUS_COL } from './status';
import type { Build } from './build';
import { FDEFS, FKINDS, CATS, isBelt, type FKind, type FCat } from './defs';
import { ITEMS, itemChip, itemIcon, type ItemId } from './items';
import { recipesAt, perMin, type Recipe } from './recipes';
import { drawing } from './drawings';
import { JOB_NAME, type Job, type Worker } from './workers';
import { el, ui, toast } from '../ui/kit';
import { thumb } from '../ui/thumbs';
import { sfx } from '../audio/audio';
import { SKILL } from '../game/skills';
import { hex } from '../ui/machine';

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1));
const costRow = (f: Factory, c: Partial<Record<ItemId, number>>, k = 1) => Object.entries(c).map(([id, n]) => itemChip(id, (n ?? 0) * k, f.count(id) < (n ?? 0) * k ? 'lack' : '')).join('');

export class FactoryUI {
  readonly root: HTMLDivElement;
  private cat: HTMLDivElement; private catTab: FCat = 'extract'; private catKey = '';
  private insp: HTMLDivElement; private sel: FBuilding | null = null; private inspKey = '';
  private stats: HTMLDivElement; private crew: HTMLDivElement; private bar: HTMLDivElement;
  private overlay: HTMLCanvasElement; private og: CanvasRenderingContext2D;
  private t = 0; private slow = 0;
  showStats = false; showCrew = false; showFlags = false;

  constructor(readonly f: Factory, readonly b: Build) {
    this.root = el('div', 'fc-ui', ui());
    this.overlay = el('canvas', 'fc-overlay', document.body);
    this.og = this.overlay.getContext('2d')!;
    this.cat = el('div', 'fc-cat', this.root);
    this.insp = el('div', 'fc-insp', this.root);
    this.stats = el('div', 'fc-sheet fc-stats', this.root);
    this.crew = el('div', 'fc-sheet fc-crew', this.root);
    this.bar = el('div', 'fc-touchbar', this.root);
    for (const p of [this.cat, this.insp, this.stats, this.crew, this.bar]) { p.addEventListener('pointerdown', (e) => e.stopPropagation()); p.addEventListener('wheel', (e) => e.stopPropagation()); }
    b.onChange = () => { this.catKey = ''; this.renderCat(); };
    b.onInspect = (bb) => this.inspect(bb);
    b.onDismiss = () => this.closeAll();
    const g = f.g;
    const sus = g.suspend.bind(g), res = g.resume.bind(g), dis = g.dispose.bind(g);
    g.suspend = () => { sus(); this.root.style.display = 'none'; this.overlay.style.display = 'none'; };
    g.resume = () => { res(); this.root.style.display = ''; this.overlay.style.display = ''; };
    g.dispose = () => { this.root.remove(); this.overlay.remove(); b.dispose(); dis(); };
    f.g.input.onKey((e) => this.key(e));
    this.renderCat();
  }
  private key(e: KeyboardEvent) {
    const g = this.f.g as unknown as { act: boolean; harvest: { blocking: boolean }; storyBlock: boolean };
    if (!g.act || g.harvest.blocking || g.storyBlock || e.ctrlKey || e.metaKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'o') this.toggleStats();
    else if (k === 'n') this.toggleCrew();
    else if (k === 'i') { const bb = this.b.pick(this.f.g.input.mx, this.f.g.input.my); this.inspect(bb); this.f.render.sel = bb; }
    void 0;
  }
  private get anyOpen() { return !!this.sel || this.showStats || this.showCrew; }
  private modeSet = false;
  /** while a form is open the game is in 'factory' mode: Escape closes the forms (not the pause menu), a click in
   *  the field picks another machine or puts the paperwork away */
  private syncMode() {
    const g = this.f.g as unknown as { mode: { k: string }; setMode(m: { k: string }): void };
    if (this.b.active) return;
    if (this.anyOpen && g.mode.k === 'normal') { g.setMode({ k: 'factory' }); this.modeSet = true; }
    else if (!this.anyOpen && g.mode.k === 'factory') { g.setMode({ k: 'normal' }); this.modeSet = false; }
  }
  closeAll() {
    this.sel = null; this.f.render.sel = null; this.insp.classList.remove('on'); this.root.classList.remove('insp-on', 'crew-on');
    this.showStats = false; this.showFlags = false; this.stats.classList.remove('on');
    this.showCrew = false; this.crew.classList.remove('on');
    this.syncMode();
  }
  toggleStats() { this.showStats = !this.showStats; this.showFlags = this.showStats; sfx(this.showStats ? 'open' : 'close', 1, 0.5); this.stats.classList.toggle('on', this.showStats); this.renderStats(); this.syncMode(); }
  toggleCrew() { this.showCrew = !this.showCrew; sfx(this.showCrew ? 'open' : 'close', 1, 0.5); this.crew.classList.toggle('on', this.showCrew); this.root.classList.toggle('crew-on', this.showCrew); this.renderCrew(); this.syncMode(); }
  inspect(b: FBuilding | null) {
    this.sel = b; this.inspKey = '';
    this.f.render.sel = b;
    this.insp.classList.toggle('on', !!b); this.root.classList.toggle('insp-on', !!b);
    if (b) { sfx('open', 1.2, 0.4); this.renderInsp(); }
    this.syncMode();
  }

  // ================================================================== catalogue
  private renderCat() {
    const f = this.f, b = this.b, on = b.active;
    this.cat.classList.toggle('on', on);
    this.bar.classList.toggle('on', on);
    document.body.classList.toggle('fc-building', on);
    if (!on) return;
    const sk = f.g.run.skills;
    const key = `${this.catTab}|${b.kind}|${b.tool}|${sk.owned.size}|${Math.floor(this.t / 1.5)}`;
    if (key === this.catKey) return;
    this.catKey = key;
    const kinds = FKINDS.filter((k) => FDEFS[k].cat === this.catTab);
    const r = f.g.engine.renderer;
    let h = `<div class="fc-cat-head"><span class="fc-mast">U.S.P.C. FIELD WORKS CATALOGUE</span><span class="fc-ed">1957 ED. &middot; FORM 7-B</span>`;
    h += `<div class="fc-tabs">${CATS.map((c) => `<button class="fc-tab ${c.k === this.catTab ? 'on' : ''}" data-tab="${c.k}"><i>${c.no}</i>${c.name}</button>`).join('')}</div></div>`;
    h += `<div class="fc-cards">`;
    let n = FKINDS.indexOf(kinds[0]) + 1;
    for (const k of kinds) {
      const d = FDEFS[k], locked = !!d.skill && !sk.has(d.skill);
      const afford = !f.costLack(d.cost);
      h += `<div class="fc-card ${locked ? 'locked' : ''} ${b.kind === k ? 'sel' : ''} ${!afford && !locked ? 'poor' : ''}" data-kind="${k}">
        <div class="fc-no">No. ${String(n++).padStart(2, '0')}</div>
        <img class="fc-plate" src="${drawing(r, k)}">
        <div class="fc-name">${esc(d.name.toUpperCase())}</div>
        <div class="fc-spec">${d.w}&times;${d.d} m${d.power > 0 ? ` &middot; ${d.power} MW` : d.power < 0 ? ` &middot; <b>+${-d.power} MW</b>` : ''}${d.belt ? ` &middot; ${Math.round(d.belt * 180)}/min` : ''}</div>
        <div class="fc-cost">${costRow(f, d.cost)}</div>
        ${locked ? `<div class="fc-stamp">LOCKED<small>${esc((SKILL[d.skill!]?.name ?? d.skill!).toUpperCase())}</small></div>` : ''}
      </div>`;
    }
    h += `</div>`;
    const sel = b.kind ? FDEFS[b.kind] : null;
    h += `<div class="fc-foot"><div class="fc-desc">${sel ? `<b>${esc(sel.name)}.</b> ${esc(sel.desc)}` : b.tool === 'dismantle' ? '<b>DISMANTLE.</b> Click a machine to take it down. Everything it cost comes back.' : b.tool === 'copy' ? '<b>BLUEPRINT.</b> Drag a box over machines to copy them.' : b.tool === 'paste' ? '<b>BLUEPRINT.</b> Click to lay the copy. [R] turns it.' : b.tool === 'assign' ? '<b>ASSIGN.</b> Click the target for the worker.' : '<b>SELECT.</b> Pick a machine from the catalogue, or click one in the field to inspect it.'}</div>
      <div class="fc-tools">
        <button data-tool="select" class="${b.tool === 'select' ? 'on' : ''}">SELECT</button>
        <button data-tool="dismantle" class="${b.tool === 'dismantle' ? 'on' : ''}">DISMANTLE <i>X</i></button>
        <button data-tool="copy" class="${b.tool === 'copy' ? 'on' : ''}">COPY <i>Y</i></button>
        <button data-tool="paste" class="${b.tool === 'paste' ? 'on' : ''}">PASTE <i>U</i></button>
        <button data-act="rot">TURN <i>R</i></button>
        <button data-act="close">CLOSE <i>B</i></button>
      </div></div>`;
    this.cat.innerHTML = h;
    this.cat.querySelectorAll('[data-tab]').forEach((e) => e.addEventListener('click', () => { this.catTab = (e as HTMLElement).dataset.tab as FCat; this.catKey = ''; sfx('click', 1.2, 0.5); this.renderCat(); }));
    this.cat.querySelectorAll('[data-kind]').forEach((e) => e.addEventListener('click', () => {
      const k = (e as HTMLElement).dataset.kind as FKind, d = FDEFS[k];
      if (d.skill && !f.g.run.skills.has(d.skill)) { sfx('deny'); toast(`<b>${d.name}</b> needs <b>${SKILL[d.skill]?.name ?? d.skill}</b> on the skill tree`, 'warn', 2200); return; }
      b.choose(k);
    }));
    this.cat.querySelectorAll('[data-tool]').forEach((e) => e.addEventListener('click', () => b.setTool((e as HTMLElement).dataset.tool as never)));
    this.cat.querySelector('[data-act="rot"]')?.addEventListener('click', () => b.rotate());
    this.cat.querySelector('[data-act="close"]')?.addEventListener('click', () => b.close());
    // touch: a big BUILD key beside the thumb
    this.bar.innerHTML = `<button data-a="rot">TURN</button><button data-a="ok" class="go">BUILD</button><button data-a="x">CANCEL</button>`;
    this.bar.querySelector('[data-a="rot"]')!.addEventListener('click', () => b.rotate());
    this.bar.querySelector('[data-a="ok"]')!.addEventListener('click', () => b.confirm());
    this.bar.querySelector('[data-a="x"]')!.addEventListener('click', () => { if (b.kind) { b.kind = null; b.tool = 'select'; b.refresh(); this.catKey = ''; this.renderCat(); } else b.close(); });
  }

  // ================================================================== inspection form
  private renderInsp() {
    const bb = this.sel, f = this.f;
    if (!bb || bb.dead) { if (this.sel) this.inspect(null); return; }
    const d = bb.def, g = f.gridOf(bb);
    const key = `${bb.id}|${bb.recipe?.id}|${bb.operator?.id}|${bb.priority}|${bb.on}|${f.g.run.skills.owned.size}`;
    const lamp = `<span class="fc-lamp" style="--lc:${hex(STATUS_COL[bb.status])}"></span>`;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const bufs = (m: Map<ItemId, number>, cap?: (id: ItemId) => number) => [...m.entries()].filter(([, n]) => n >= 0.5 || cap).map(([id, n]) => `<span class="fc-buf">${itemChip(id, Math.floor(n))}${cap ? `<i>/${cap(id)}</i>` : ''}</span>`).join('') || '<i>empty</i>';
    if (key !== this.inspKey) {
      this.inspKey = key;
      let h = `<div class="fc-form-head"><div class="fc-form-no">INSPECTION FORM 12 &middot; SERIAL ${String(bb.id).padStart(4, '0')}</div><div class="fc-form-title">${esc(d.name.toUpperCase())}</div><button class="fc-x" data-a="close">&times;</button></div>`;
      h += `<div class="fc-row"><span class="fc-k">STATUS</span><span class="fc-v fc-status">${lamp}<span class="st"></span></span></div>`;
      h += `<div class="fc-row"><span class="fc-k">HULL</span><span class="fc-v"><span class="fc-meter hp"><i></i></span><span class="hpv"></span></span></div>`;
      if (d.power) h += `<div class="fc-row"><span class="fc-k">POWER</span><span class="fc-v pw"></span></div>`;
      if (d.station && d.station !== 'boiler' && d.station !== 'lab') {
        const rs = recipesAt(d.station);
        h += `<div class="fc-sub">RECIPE ${bb.auto ? '<i>(sets itself from what it is fed)</i>' : ''}</div><div class="fc-recipes">`;
        for (const r of rs) {
          const ok = f.recipeOk(r);
          h += `<button class="fc-rec ${bb.recipe === r ? 'on' : ''} ${ok ? '' : 'locked'}" data-rec="${r.id}">${this.recipeLine(r)}</button>`;
        }
        h += `</div>`;
      }
      if (d.station === 'boiler' || d.station === 'lab') h += `<div class="fc-sub">TAKES</div><div class="fc-recipes">${recipesAt(d.station).map((r) => `<div class="fc-rec on">${this.recipeLine(r)}</div>`).join('')}</div>`;
      h += `<div class="fc-sub">BUFFERS</div><div class="fc-bufs"></div>`;
      if (bb.kind === 'depot') h += `<div class="fc-note">Raw materials go to Unit 07's hold; the rest to the central stores (${f.invCap()} of each).</div>`;
      if (bb.kind === 'sluice') h += `<div class="fc-row"><span class="fc-k">GATE</span><span class="fc-v"><button class="fc-btn ${bb.on ? '' : 'on'}" data-a="shut">CLOSED (FLOOD)</button><button class="fc-btn ${bb.on ? 'on' : ''}" data-a="open">OPEN (IRRIGATE)</button></span></div>`;
      if (bb.kind === 'planter') {
        const plants = f.g.run.plants;
        const cur = (bb as unknown as { prefab?: string }).prefab;
        h += `<div class="fc-sub">SOWS</div><div class="fc-recipes">${plants.length ? plants.map((p) => `<button class="fc-rec ${cur === p.name ? 'on' : ''}" data-plant="${esc(p.name)}">${esc(p.name)}</button>`).join('') : '<i>No plant prefabs yet: absorb a plant with the Seed Press.</i>'}</div>`;
      }
      if (d.operable) {
        const op = bb.operator, w = op ? f.workers.of(op) : null;
        h += `<div class="fc-row"><span class="fc-k">OPERATOR</span><span class="fc-v">${op && w ? `<img class="fc-thumb" src="${thumb(op.sp)}">${esc(op.sp.name)} <button class="fc-btn" data-a="unop">RELEASE</button>` : `<i>none</i> <button class="fc-btn" data-a="op">ASSIGN A WORKER</button>`}</span></div>`;
      }
      if (!isBelt(bb.kind) && bb.kind !== 'found' && bb.kind !== 'wall' && bb.kind !== 'dam') {
        h += `<div class="fc-row"><span class="fc-k">HAUL PRIORITY</span><span class="fc-v">${(['LOW', 'NORMAL', 'HIGH'] as const).map((n, i) => `<button class="fc-btn ${bb.priority === i ? 'on' : ''}" data-pri="${i}">${n}</button>`).join('')}</span></div>`;
        if (bb.kind !== 'sluice' && (d.power > 0 || d.station || d.extract)) h += `<div class="fc-row"><span class="fc-k">SWITCH</span><span class="fc-v"><button class="fc-btn ${bb.on ? 'on' : ''}" data-a="on">RUN</button><button class="fc-btn ${bb.on ? '' : 'on'}" data-a="off">STOP</button></span></div>`;
      }
      const ex = d.hooks?.inspect?.(bb, f); if (ex) h += `<div class="fc-note">${ex}</div>`;
      h += `<div class="fc-note small">${esc(d.desc)}</div>`;
      h += `<div class="fc-form-foot"><button class="fc-btn red" data-a="dis">DISMANTLE</button><span class="fc-sig">INSPECTED: U-07</span></div>`;
      this.insp.innerHTML = h;
      const q = (s: string) => this.insp.querySelector(s);
      q('[data-a="close"]')?.addEventListener('click', () => this.inspect(null));
      q('[data-a="dis"]')?.addEventListener('click', () => { f.remove(bb, true); toast(`Dismantled: <b>${d.name}</b>`, 'info', 1400); sfx('crack', 1.2, 0.6); this.inspect(null); });
      q('[data-a="on"]')?.addEventListener('click', () => { bb.on = true; this.inspKey = ''; sfx('click'); });
      q('[data-a="off"]')?.addEventListener('click', () => { bb.on = false; this.inspKey = ''; sfx('click'); });
      q('[data-a="open"]')?.addEventListener('click', () => { bb.on = true; this.inspKey = ''; sfx('click'); });
      q('[data-a="shut"]')?.addEventListener('click', () => { bb.on = false; this.inspKey = ''; sfx('click'); });
      q('[data-a="unop"]')?.addEventListener('click', () => { if (bb.operator) f.workers.release(bb.operator); this.inspKey = ''; });
      q('[data-a="op"]')?.addEventListener('click', () => {
        const free = f.workers.list.find((w) => w.job === 'idle' && !w.c.dead) ?? f.workers.list.find((w) => w.job !== 'operate' && !w.c.dead);
        if (!free) { toast('No workers: convert, pen or breed creatures first', 'warn', 2000); return; }
        const e = f.workers.assign(free.c, 'operate', bb); if (e) toast(e, 'warn', 1600); else toast(`<b>${free.c.sp.name}</b> takes the controls`, 'good', 1500);
        this.inspKey = '';
      });
      this.insp.querySelectorAll('[data-pri]').forEach((e) => e.addEventListener('click', () => { bb.priority = Number((e as HTMLElement).dataset.pri) as 0 | 1 | 2; this.inspKey = ''; sfx('click'); }));
      this.insp.querySelectorAll('[data-rec]').forEach((e) => e.addEventListener('click', () => {
        const r = recipesAt(d.station!).find((x) => x.id === (e as HTMLElement).dataset.rec)!;
        if (!f.recipeOk(r)) { sfx('deny'); toast(`Needs ${SKILL[r.skill!]?.name ?? r.skill}`, 'warn', 1500); return; }
        f.setRecipe(bb, r); this.inspKey = ''; sfx('click');
      }));
      this.insp.querySelectorAll('[data-plant]').forEach((e) => e.addEventListener('click', () => { (bb as unknown as { prefab?: string }).prefab = (e as HTMLElement).dataset.plant; this.inspKey = ''; sfx('click'); }));
    }
    // live values
    const st = this.insp.querySelector('.st'); if (st) st.textContent = STATUS_NAME[bb.status] + (bb.note ? ' · ' + bb.note : '') + (bb.status === 'working' && bb.recipe && bb.running ? ` ${Math.round(bb.prog * 100)}%` : '');
    const lp = this.insp.querySelector('.fc-lamp') as HTMLElement | null; if (lp) { lp.style.setProperty('--lc', hex(STATUS_COL[bb.status])); lp.classList.toggle('blink', bb.status !== 'working' && bb.status !== 'idle'); }
    const hp = this.insp.querySelector('.fc-meter.hp i') as HTMLElement | null; if (hp) hp.style.width = pct(bb.hp / bb.maxHp);
    const hpv = this.insp.querySelector('.hpv'); if (hpv) hpv.textContent = ` ${Math.ceil(bb.hp)}/${bb.maxHp}`;
    const pw = this.insp.querySelector('.pw');
    if (pw) pw.innerHTML = d.power < 0 ? `MAKES ${-d.power} MW ${bb.status === 'working' ? '<b>ON LINE</b>' : '<i>IDLE</i>'}` : !g ? '<span class="bad">NOT CONNECTED: PUT A POLE WITHIN 7 M</span>' : `DRAWS ${d.power} MW &middot; GRID ${fmt(g.supply)}/${fmt(g.demand)} MW (${pct(g.sat)})`;
    const bf = this.insp.querySelector('.fc-bufs');
    if (bf) {
      const parts: string[] = [];
      if (bb.inBuf.size) parts.push(`<div><span class="fc-k">IN</span> ${bufs(bb.inBuf, (id) => bb.bufCap(id))}</div>`);
      if (bb.outBuf.size) parts.push(`<div><span class="fc-k">OUT</span> ${bufs(bb.outBuf)}</div>`);
      if (bb.store.size) parts.push(`<div><span class="fc-k">HELD</span> ${bufs(bb.store)}</div>`);
      if (bb.items.length) parts.push(`<div><span class="fc-k">ON BELT</span> ${bb.items.length}</div>`);
      if (bb.def.extract === 'node') { const s = f.seams[bb.seam]; parts.push(`<div><span class="fc-k">SEAM</span> ${s ? `${itemChip(s.item)} ${Math.floor(s.amount)} LEFT` : 'NONE'}</div>`); }
      bf.innerHTML = parts.join('') || '<i>empty</i>';
    }
  }
  private recipeLine(r: Recipe) {
    const side = (s: Recipe['in']) => Object.entries(s).filter(([id]) => id !== 'steam' || true).map(([id, n]) => `${itemChip(id, n)}`).join('');
    const out = r.robot ? `<span class="fc-robot">${r.robot.toUpperCase()}</span>` : r.research ? `<span class="fc-robot">+${r.research} RESEARCH</span>` : side(r.out);
    const rate = Object.entries(r.out)[0];
    return `<span class="fc-in">${side(r.in)}</span><span class="fc-arrow">&#8594;</span><span class="fc-out">${out}</span><span class="fc-time">${r.t}s${rate && rate[0] !== 'steam' ? ` &middot; ${fmt(perMin(r, rate[1] ?? 0))}/min` : ''}</span>`;
  }

  // ================================================================== production report
  private renderStats() {
    if (!this.showStats) return;
    const f = this.f, rates = f.rates(), pw = f.power();
    const rows = Object.entries(rates).sort((a, b) => b[1].made - a[1].made);
    const maxR = Math.max(1, ...rows.map(([, r]) => Math.max(r.made, r.used)));
    let h = `<div class="fc-form-head"><div class="fc-form-no">FORM 31-P &middot; PRODUCTION REPORT &middot; LAST 60 S</div><div class="fc-form-title">STATE OF THE WORKS</div><button class="fc-x" data-a="close">&times;</button></div>`;
    h += `<div class="fc-cols"><div class="fc-col">`;
    h += `<div class="fc-sub">ITEMS PER MINUTE</div><table class="fc-tab"><tr><th></th><th>MADE</th><th>USED</th><th>NET</th><th>STOCK</th></tr>`;
    for (const [id, r] of rows.slice(0, 18)) {
      const net = r.made - r.used;
      h += `<tr><td>${itemChip(id)} ${esc(ITEMS[id]?.name ?? id)}</td><td><span class="fc-tally" style="width:${(r.made / maxR) * 100}%"></span>${fmt(r.made)}</td><td>${fmt(r.used)}</td><td class="${net < -0.05 ? 'bad' : ''}">${net >= 0 ? '+' : ''}${fmt(net)}</td><td>${f.count(id)}</td></tr>`;
    }
    if (!rows.length) h += `<tr><td colspan="5"><i>Nothing produced yet. Lay a miner on a seam and run a belt to a smelter.</i></td></tr>`;
    h += `</table></div><div class="fc-col">`;
    const load = pw.cap ? pw.demand / pw.cap : 0;
    h += `<div class="fc-sub">POWER</div><div class="fc-power"><div class="fc-dial"><i style="transform:rotate(${-60 + Math.min(1.2, load) * 100}deg)"></i></div><div>DEMAND <b>${fmt(pw.demand)} MW</b><br>SUPPLIED ${fmt(pw.supply)} MW<br>CAPACITY ${fmt(pw.cap)} MW (core ${f.coreMW})<br>${pw.grids} GRID${pw.grids === 1 ? '' : 'S'}${load > 0.95 ? '<br><span class="bad">OVERLOADED: BUILD GENERATORS</span>' : load > 0.75 ? '<br><span class="amb">RUNNING HOT: ADD REDUNDANCY</span>' : ''}</div></div>`;
    const bn = f.bottlenecks();
    h += `<div class="fc-sub">HOLDING THE LINE UP</div>`;
    h += bn.length ? `<ul class="fc-bn">${bn.slice(0, 8).map((b) => `<li data-id="${b.id}"><span class="fc-lamp blink" style="--lc:${hex(STATUS_COL[b.status])}"></span>${esc(b.def.name)} <i>${b.starve > b.block ? `starved ${Math.round(b.starve * 100)}%` : b.status === 'nopower' ? 'no power' : `blocked ${Math.round(b.block * 100)}%`}</i>${b.recipe ? ` &middot; ${esc(b.recipe.name)}` : ''}</li>`).join('')}</ul>` : `<i>Every machine is keeping up.</i>`;
    const W = f.workers.active.length, all = f.workers.list.length;
    h += `<div class="fc-sub">LABOUR AND RESEARCH</div><div>${W} OF ${all} WORKERS ON JOBS &middot; RESEARCH ${f.research}/12 TO THE NEXT CORE CELL</div>`;
    h += `<div class="fc-sub">STORES</div><div class="fc-stock">${Object.entries(f.inventory).filter(([, n]) => n >= 1).map(([id, n]) => itemChip(id, Math.floor(n))).join('') || '<i>empty</i>'}</div>`;
    h += `</div></div><div class="fc-note small">Flags over the works mark machines that are starved (rust), blocked (amber) or dark (red). Click a line above to inspect it.</div>`;
    this.stats.innerHTML = h;
    this.stats.querySelector('[data-a="close"]')?.addEventListener('click', () => this.toggleStats());
    this.stats.querySelectorAll('[data-id]').forEach((e) => e.addEventListener('click', () => { const b = f.byId.get(Number((e as HTMLElement).dataset.id)); if (b) this.inspect(b); }));
  }

  // ================================================================== crew roster
  private renderCrew() {
    if (!this.showCrew) return;
    const f = this.f, W = f.workers;
    W.sync();
    const h0 = f.hive;
    let h = `<div class="fc-form-head"><div class="fc-form-no">FORM 9-L &middot; LABOUR ROSTER</div><div class="fc-form-title">THE CREW</div><button class="fc-x" data-a="close">&times;</button></div>`;
    h += `<div class="fc-note small">${W.list.length} in harness &middot; room for ${h0.allyCap()} (worker pens add 4 each). Creatures you convert, pen or breed join the roster.</div>`;
    if (!W.list.length) h += `<div class="fc-note"><i>No workers yet. Beat a creature and convert it (Neural Graft), or bait a capture pen.</i></div>`;
    h += `<div class="fc-roster">`;
    for (const w of W.list) {
      if (w.c.dead) continue;
      const c = w.c, tgt = w.target ? w.target.def.name : w.job === 'mine' && f.seams[w.seam] ? ITEMS[f.seams[w.seam].item].name + ' seam' : w.route ? `${w.route.from.def.name} &#8594; ${w.route.to.def.name}` : '';
      h += `<div class="fc-man" data-c="${c.id}"><img class="fc-thumb" src="${thumb(c.sp)}"><div class="fc-man-info"><div class="fc-man-name">${esc(c.sp.name.toUpperCase())} <i>${Math.round(c.mass)} KG &middot; CARRIES ${W.cap(c)}</i></div>
        <div class="fc-man-job">${W.bio(c) ? 'ON A BIOTECH JOB' : JOB_NAME[w.job]}${tgt ? ' &middot; ' + tgt : ''}${w.note ? ` &middot; <span class="amb">${w.note}</span>` : ''}${w.state === 'eat' ? ' &middot; <span class="amb">EATING</span>' : ''}${w.carry && w.carry.n >= 1 ? ` &middot; ${itemChip(w.carry.id, Math.floor(w.carry.n))}` : ''}</div>
        <div class="fc-man-bars"><span class="fc-k">FED</span><span class="fc-meter ${w.hunger < 0.3 ? 'low' : ''}"><i style="width:${Math.round(w.hunger * 100)}%"></i></span><span class="fc-k">MOOD</span><span class="fc-meter ${w.mood < 0.25 ? 'low' : ''}"><i style="width:${Math.round(w.mood * 100)}%"></i></span></div>
        <div class="fc-man-jobs">${(['haul', 'operate', 'mine', 'forage', 'pen', 'idle'] as Job[]).map((j) => `<button class="fc-btn ${w.job === j ? 'on' : ''} ${W.whyJob(j) ? 'locked' : ''}" data-job="${j}">${j === 'idle' ? 'FREE' : j.toUpperCase()}</button>`).join('')}</div></div></div>`;
    }
    h += `</div>`;
    this.crew.innerHTML = h;
    this.crew.querySelector('[data-a="close"]')?.addEventListener('click', () => this.toggleCrew());
    this.crew.querySelectorAll('[data-job]').forEach((e) => e.addEventListener('click', () => {
      const id = Number((e.closest('[data-c]') as HTMLElement).dataset.c), w = W.list.find((x) => x.c.id === id); if (!w) return;
      const job = (e as HTMLElement).dataset.job as Job;
      const why = W.whyJob(job); if (why) { sfx('deny'); toast(why, 'warn', 1600); return; }
      if (job === 'idle') { W.release(w.c); }
      else if (job === 'forage') { W.assign(w.c, 'forage'); }
      else if (job === 'haul') { W.assign(w.c, 'haul'); toast('Hauling: it finds its own work (or set a route from a machine\'s form)', 'info', 2000); }
      else this.b.assign(w.c, job);
      sfx('click'); this.renderCrew();
    }));
  }

  // ================================================================== per frame
  update(dt: number) {
    this.t += dt; this.slow -= dt;
    this.b.update();
    // Escape (the game drops 'factory' mode): the paperwork goes away
    if (!this.b.active && this.modeSet && this.anyOpen && this.f.g.mode.k !== ('factory' as string)) { this.modeSet = false; this.closeAll(); }
    else if (!this.b.active && !this.modeSet && this.anyOpen && this.f.g.mode.k === 'normal') this.syncMode();
    if (this.slow <= 0) {
      this.slow = 0.25;
      if (this.b.active) this.renderCat();
      if (this.sel) this.renderInsp();
      if (this.showStats && Math.floor(this.t) !== Math.floor(this.t - 0.25)) this.renderStats();
      if (this.showCrew && Math.floor(this.t) !== Math.floor(this.t - 0.25)) this.renderCrew();
    }
    this.drawOverlay();
  }
  private tf = 1; private tfT = -9;
  private drawOverlay() {
    const cv = this.overlay, g = this.og, W = innerWidth, H = innerHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    g.clearRect(0, 0, W, H);
    if (this.t - this.tfT > 1) { this.tfT = this.t; this.tf = Math.max(1, Math.round((parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tf')) || 1) * 2) / 2); }
    const f = this.f, game = f.g, dpr = 1, k = this.tf;
    // flags over machines in trouble (always for dark machines; all problems while building or reading the report)
    const all = this.b.active || this.showFlags;
    for (const b of f.buildings) {
      const st: Status = b.status;
      if (!(st === 'nopower' || all && (st === 'starved' || st === 'blocked'))) continue;
      if (!(b.def.station || b.def.extract) && b.kind !== 'turret') continue;
      const [sx, sy, ok] = game.screenOf(b.x, b.y + b.def.h + 0.4, b.z); if (!ok || sx < 0 || sy < 0 || sx > W || sy > H) continue;
      this.flag(g, sx, sy, st, k * dpr);
    }
    // hungry workers: a little trough sign
    for (const w of f.workers.list) {
      if (w.job === 'idle' || w.c.dead || !w.c.mesh.visible) continue;
      if (w.hunger > 0.3 && w.mood > 0.25) continue;
      const c = w.c, [sx, sy, ok] = game.screenOf(c.x, c.y + c.sp.pheno.height * c.growth + 0.5, c.z); if (!ok) continue;
      this.bubble(g, sx, sy, w, k);
    }
    // build cursor tag: what it costs, or why it cannot go
    if (this.b.active && game.input.overCanvas && (this.b.kind || this.b.tool === 'dismantle')) {
      const mx = game.input.mx + 18, my = game.input.my + 14;
      const txt = this.b.why ?? (this.b.tool === 'dismantle' ? 'DISMANTLE' : this.b.ghosts.length > 1 ? `${this.b.ghosts.length} PIECES` : this.b.kind ? FDEFS[this.b.kind].name.toUpperCase() : '');
      g.font = `${Math.round(8 * k)}px VT, monospace`;
      const w = g.measureText(txt).width + 10 * k;
      g.fillStyle = this.b.why ? '#a2473a' : '#d2cab4'; g.fillRect(mx, my, w, 12 * k);
      g.fillStyle = '#14161b'; g.fillRect(mx, my + 12 * k, w, k);
      g.fillStyle = this.b.why ? '#e2dbc6' : '#1f232b'; g.fillText(txt.toUpperCase(), mx + 5 * k, my + 9 * k);
    }
  }
  /** a pennant on a stick: red (no power), amber (blocked), rust (starved); hand-drawn, never round */
  private flag(g: CanvasRenderingContext2D, x: number, y: number, st: Status, k: number) {
    const col = hex(STATUS_COL[st]), blink = Math.floor(this.t * 3) % 2 === 0;
    x = Math.round(x); y = Math.round(y);
    g.fillStyle = '#14161b'; g.fillRect(x, y - 14 * k, k, 15 * k);
    g.fillStyle = blink ? col : '#2c323c';
    g.beginPath(); g.moveTo(x + k, y - 14 * k); g.lineTo(x + 10 * k, y - 11 * k); g.lineTo(x + 8 * k, y - 9 * k); g.lineTo(x + 10 * k, y - 7 * k); g.lineTo(x + k, y - 7 * k); g.closePath(); g.fill();
    g.fillStyle = '#e2dbc6'; g.font = `${Math.round(7 * k)}px VT, monospace`;
    g.fillText(st === 'nopower' ? '!' : st === 'blocked' ? '=' : '?', x + 3 * k, y - 8.5 * k);
  }
  private icons = new Map<string, HTMLImageElement>();
  private icon(id: ItemId) { let i = this.icons.get(id); if (!i) { i = new Image(); i.src = itemIcon(id); this.icons.set(id, i); } return i; }
  private bubble(g: CanvasRenderingContext2D, x: number, y: number, w: Worker, k: number) {
    x = Math.round(x); y = Math.round(y);
    const s = 12 * k;
    g.fillStyle = '#d2cab4'; g.fillRect(x - s / 2, y - s - 4 * k, s, s);
    g.fillStyle = '#14161b'; g.fillRect(x - s / 2, y - 4 * k, s, k); g.fillRect(x - k, y - 3 * k, 2 * k, 2 * k);
    const img = this.icon(w.mood < 0.25 && w.hunger > 0.3 ? 'dung' : 'fruit');
    if (img.complete) { g.imageSmoothingEnabled = false; g.drawImage(img, x - s / 2 + k, y - s - 3 * k, s - 2 * k, s - 2 * k); }
    if (w.mood < 0.1 && Math.floor(this.t * 4) % 2) { g.fillStyle = '#a2473a'; g.fillRect(x + s / 2, y - s - 4 * k, 2 * k, s); }
  }
}

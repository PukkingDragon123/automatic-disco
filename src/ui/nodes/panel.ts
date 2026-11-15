// The node map's inspector glass: whatever is selected, editable. A ROUTE: its items (filter), how much (everything,
// keep stocked to, full batches, a rate), its priority, its CONDITIONS, its workers, and its live flow. A NODE: what it
// holds, makes or still needs, its wires; a logic node's settings. Nothing selected: the colony overview (workers,
// stalls, sites, what the discipline has taught). A box selection can be saved as a TEMPLATE.
import type { NodeMap } from './map';
import { short } from './map';
import { ITEMS, ITEM_IDS, itemIcon, type ItemId } from '../../factory/items';
import { STATUS_NAME } from '../../factory/status';
import { JOB_NAME, type Job } from '../../factory/workers';
import { COND_NAME, AMOUNT_NAME, LOGIC_NAME, isLogic, type Cond, type CondK, type LNode, type Route, type AmountMode, type LogicKind, type Template } from '../../logistics/network';
import { FEATURES, TIER_XP } from '../../logistics/unlocks';
import { thumb } from '../thumbs';
import { toast } from '../kit';
import { sfx } from '../../audio/audio';

const esc = (s: string) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
const ichip = (id: ItemId, on: boolean, n?: number | string, act = '') => `<span class="nm-ichip ${on ? 'on' : ''}" ${act} title="${esc(ITEMS[id]?.name ?? id)}"><img src="${itemIcon(id, 40)}" alt="">${n !== undefined ? n : esc(short(id))}</span>`;
const num = (path: string, v: number, step = 1) => `<span class="nm-num" data-num="${path}" data-step="${step}"><span data-d="-1">−</span><input value="${v}" inputmode="numeric"><span data-d="1">+</span></span>`;
/** a ten-segment meter */
const meter = (v: number, low: boolean) => `<span class="m ${low ? 'low' : ''}">${Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(v * 10) ? 'on' : ''}"></i>`).join('')}</span>`;
const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''));

export class Panel {
  private scroll: HTMLDivElement;
  private isDirty = true; private live = 0; private key = '';
  private view: 'auto' | 'templates' = 'auto';
  private tplName = 'IRON INGOT';
  constructor(readonly m: NodeMap, host: HTMLElement) {
    this.scroll = document.createElement('div'); this.scroll.className = 'scroll'; host.appendChild(this.scroll);
    this.scroll.addEventListener('click', (e) => this.click(e));
    this.scroll.addEventListener('change', (e) => this.change(e));
    this.scroll.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLElement).blur(); });
  }
  get L() { return this.m.L; }
  dirty() { this.isDirty = true; if (this.m.sel || this.m.multi.size) this.view = 'auto'; }
  showTemplates() { this.view = this.view === 'templates' ? 'auto' : 'templates'; this.m.select(null); this.view = this.view === 'auto' ? 'auto' : 'templates'; this.isDirty = true; sfx('click', 1.1, 0.4); }
  update(dt: number) {
    this.live -= dt;
    if (this.isDirty) { this.isDirty = false; this.render(); this.live = 0.5; return; }
    if (this.live <= 0) { this.live = 0.5; if (!this.scroll.contains(document.activeElement)) this.render(true); }
  }
  /** re-render; `soft` keeps the scroll and skips when nothing visible changed */
  private render(soft = false) {
    const s = this.m.sel, L = this.L;
    let h: string;
    if (this.view === 'templates' && !s && !this.m.multi.size) h = this.templates();
    else if (this.m.multi.size) h = this.multi();
    else if (s?.k === 'route') { const r = L.routes.find((x) => x.id === s.id); h = r ? this.route(r) : this.overview(); }
    else if (s?.k === 'node') { const n = L.node(s.id); h = n ? this.node(n) : this.overview(); }
    else h = this.overview();
    if (soft && h === this.key) return;
    this.key = h;
    const st = this.scroll.scrollTop;
    this.scroll.innerHTML = h;
    this.scroll.scrollTop = st;
    this.scroll.querySelectorAll<HTMLCanvasElement>('canvas[data-spark]').forEach((c) => this.spark(c));
  }

  // ------------------------------------------------------------------ route
  private route(r: Route): string {
    const L = this.L, a = L.node(r.from)!, b = L.node(r.to)!;
    const condOk = L.unlocked('routes.conditions');
    const flow = L.flow(r.id);
    let h = `<div class="nm-h">ROUTE ${String(r.id).padStart(3, '0')}<small>${esc(a.name)} → ${esc(b.name)}</small></div>`;
    h += `<div class="nm-row" style="margin-top:8px"><span class="nm-sw ${r.on ? 'on' : ''}" data-act="r.on">${r.on ? 'RUNNING' : 'SWITCHED OFF'}<span class="lever"></span></span><span style="flex:1"></span><span class="nm-btn red" data-act="r.del">DELETE ROUTE</span></div>`;
    h += `<div class="nm-kv" style="margin-top:8px"><div><div class="k">FLOW</div><div class="v">${fmt(flow)}<small>/MIN</small></div></div><div><div class="k">MOVED</div><div class="v">${r.moved}</div></div><div><div class="k">${r.inflight ? 'IN FLIGHT' : 'STATUS'}</div><div class="v ${r.note && !r.inflight ? 'amb' : ''}">${r.inflight ? r.inflight + ' LOAD' + (r.inflight > 1 ? 'S' : '') : r.note ? esc(r.note) : 'READY'}</div></div></div>`;
    h += `<canvas class="nm-spark" data-spark="${r.id}" width="246" height="32" style="margin-top:8px"></canvas>`;
    // items
    const offer = new Set<ItemId>([...(isLogic(a.kind) ? [] : L.offers(a)), ...r.filter]);
    if (isLogic(a.kind)) for (const ch of L.chains()) if (ch.path.includes(r)) for (const id of L.offers(ch.src)) offer.add(id);
    h += `<div class="nm-lbl">ITEMS <i>${r.filter.length ? 'ONLY THESE' : 'ANYTHING THE TARGET TAKES'}</i></div><div class="nm-row">`;
    h += `<span class="nm-ichip ${r.filter.length ? '' : 'on'}" data-act="r.any">ANY</span>`;
    for (const id of offer) if (id !== 'steam' && ITEMS[id]) h += ichip(id, r.filter.includes(id), undefined, `data-act="r.item" data-id="${id}"`);
    h += `</div><div class="nm-row"><select class="nm-sel" data-ch="r.addItem"><option value="">+ ANOTHER ITEM…</option>${ITEM_IDS.filter((id) => id !== 'steam' && !offer.has(id)).map((id) => `<option value="${id}">${esc(ITEMS[id].name.toUpperCase())}</option>`).join('')}</select></div>`;
    // amount
    h += `<div class="nm-lbl">HOW MUCH <i>PER TRIP: THE WORKER'S LOAD</i></div><div class="nm-row">`;
    for (const md of ['all', 'keep', 'batch', 'rate'] as AmountMode[]) h += `<span class="nm-btn ${r.amount.mode === md ? 'on' : ''}" data-act="r.mode" data-v="${md}">${md === 'all' ? 'ALL' : md === 'keep' ? 'KEEP' : md === 'batch' ? 'BATCH' : 'RATE'}</span>`;
    h += `</div><div class="nm-row">${AMOUNT_NAME[r.amount.mode]} ${r.amount.mode === 'all' ? '' : num('r.amount', r.amount.n, r.amount.mode === 'rate' ? 5 : 5)}</div>`;
    // priority
    h += `<div class="nm-lbl">PRIORITY <i>WORKERS TAKE HIGHER FIRST</i></div><div class="nm-row"><span class="nm-pri">${[1, 2, 3, 4, 5].map((p) => `<span class="${p <= r.priority ? 'on' : ''}" data-act="r.pri" data-v="${p}">${p}</span>`).join('')}</span><span style="color:var(--ph-7)">${['', 'LOW', 'BELOW NORMAL', 'NORMAL', 'HIGH', 'URGENT'][r.priority]}</span></div>`;
    // conditions
    h += `<div class="nm-lbl ${condOk ? '' : 'lock'}">CONDITIONS <i>${condOk ? (r.conds.length ? 'ALL MUST HOLD' : 'NONE: ALWAYS') : esc(L.lockWhy('routes.conditions'))}</i></div>`;
    if (condOk) { h += this.conds(r.conds, 'r', [a, b]); h += `<div class="nm-row"><span class="nm-btn amb" data-act="c.add" data-o="r">+ ADD CONDITION</span></div>`; }
    else h += `<div class="nm-p">Conditions are learned with the logistics discipline: route ${TIER_XP[1] - Math.min(TIER_XP[1], L.xp)} more items.</div>`;
    // workers
    h += `<div class="nm-lbl">WORKERS <i>${r.workers.length ? r.workers.length + ' DEDICATED' : 'FREE HAULERS'}</i></div>`;
    h += `<div class="nm-row"><span class="nm-sw ${r.pool ? 'on' : ''}" data-act="r.pool">FREE HAULERS MAY HELP<span class="lever"></span></span></div>`;
    h += this.workers((c) => r.workers.includes(c), 'r.w');
    return h;
  }
  private conds(cs: Cond[], owner: string, ends: LNode[]): string {
    const L = this.L;
    const items = new Set<ItemId>(); for (const n of ends) if (n && !isLogic(n.kind)) for (const id of L.offers(n)) items.add(id);
    for (const c of cs) if (c.item) items.add(c.item);
    const sigs = L.nodes.filter((n) => n.kind === 'sensor' || n.kind === 'counter' || n.kind === 'gate' || n.kind === 'timer');
    return cs.map((c, i) => {
      const needN = c.k === 'srcAbove' || c.k === 'srcBelow' || c.k === 'dstAbove' || c.k === 'dstBelow';
      let args = `<select class="nm-sel" data-ch="c.k" data-o="${owner}" data-i="${i}">${(Object.keys(COND_NAME) as CondK[]).map((k) => `<option value="${k}" ${k === c.k ? 'selected' : ''}>${COND_NAME[k]}</option>`).join('')}</select>`;
      if (needN) args += num(`c.n.${owner}.${i}`, c.n ?? 0, 5) + `<select class="nm-sel" data-ch="c.item" data-o="${owner}" data-i="${i}"><option value="">(ITS ITEM)</option>${[...items].filter((id) => ITEMS[id]).map((id) => `<option value="${id}" ${id === c.item ? 'selected' : ''}>${esc(ITEMS[id].name.toUpperCase())}</option>`).join('')}</select>`;
      if (c.k === 'signal') args += `<select class="nm-sel" data-ch="c.node" data-o="${owner}" data-i="${i}"><option value="">PICK A SIGNAL…</option>${sigs.map((n) => `<option value="${n.id}" ${n.id === c.node ? 'selected' : ''}>${LOGIC_NAME[n.kind as LogicKind]} ${n.id.slice(2)}</option>`).join('')}</select>`;
      args += `<span class="nm-btn ${c.not ? 'on' : ''}" data-act="c.not" data-o="${owner}" data-i="${i}">NOT</span>`;
      return `<div class="nm-cond"><span class="if">${i ? 'AND' : 'IF'}</span><span class="args">${args}</span><span class="nm-btn red" data-act="c.del" data-o="${owner}" data-i="${i}">×</span></div>`;
    }).join('');
  }
  /** the worker roster with a check per worker (dedicated to this route), and what each is doing */
  private workers(on: (id: number) => boolean, act: string): string {
    const W = this.m.f.workers, list = W.list.filter((w) => !w.c.dead);
    if (!list.length) return `<div class="nm-p">No workers yet. Engineer creatures in the lab and harness them, or convert wild ones.</div>`;
    return list.map((w) => {
      const c = w.c, j = w.lj;
      const doing = j ? (j.act === 'build' ? `BUILDING ${esc(j.site?.def.name.toUpperCase() ?? '')}` : `${w.carry ? 'CARRYING' : j.act === 'dig' ? 'DIGGING' : j.act === 'harvest' ? 'HARVESTING' : 'FETCHING'} ${esc(short(j.item))} → ${esc(j.dst.name)}`) : w.state === 'eat' ? '<span class="amb">EATING</span>' : w.note ? `<span class="amb">${esc(w.note)}</span>` : JOB_NAME[w.job];
      const mark = act ? `<span class="nm-check ${on(c.id) ? 'on' : ''}" data-act="${act}" data-c="${c.id}">${on(c.id) ? '✓' : ''}</span>` : `<span class="nm-row">${(['haul', 'build', 'idle'] as Job[]).map((jb) => `<span class="nm-btn ${w.job === jb ? 'on' : ''}" data-act="w.job" data-c="${c.id}" data-v="${jb}">${jb === 'idle' ? 'FREE' : jb.toUpperCase()}</span>`).join('')}</span>`;
      return `<div class="nm-man"><img src="${thumb(c.sp)}" alt=""><div><div class="n">${esc(c.sp.name.toUpperCase())}</div><div class="j pl-s">${doing}</div><div class="meters pl-s">FED ${meter(w.hunger, w.hunger < 0.3)} MOOD ${meter(w.mood, w.mood < 0.25)} CARRIES ${W.cap(c)}</div></div>${mark}</div>`;
    }).join('');
  }

  // ------------------------------------------------------------------ node
  private node(n: LNode): string {
    const L = this.L;
    const kind = isLogic(n.kind) ? 'LOGIC NODE' : { pod: 'THE POD\'S STORES', building: 'MACHINE', container: 'CONTAINER', deposit: 'DEPOSIT', field: 'HARVEST FIELD', site: 'CONSTRUCTION SITE' }[n.kind as string];
    let h = `<div class="nm-h">${esc(isLogic(n.kind) ? `${LOGIC_NAME[n.kind as LogicKind]} ${n.id.slice(2)}` : n.name)}<small>${kind}${n.tidy ? ' · MOVED ON THE MAP' : ''}</small></div>`;
    const b = L.bld(n);
    if (b) {
      const gr = L.f.gridOf(b);
      h += `<div class="nm-kv" style="margin-top:8px"><div><div class="k">STATUS</div><div class="v ${b.status === 'working' || b.status === 'idle' ? '' : 'amb'}">${STATUS_NAME[b.status]}</div></div><div><div class="k">POWER</div><div class="v">${b.def.power > 0 ? (gr ? Math.round(gr.sat * 100) + '%' : '<span class="bad">NONE</span>') : b.def.power < 0 ? '+' + -b.def.power + ' MW' : '—'}</div></div><div><div class="k">HULL</div><div class="v">${Math.round((b.hp / b.maxHp) * 100)}%</div></div></div>`;
      if (b.recipe) h += `<div class="nm-lbl">RECIPE <i>${esc(b.recipe.name.toUpperCase())}</i></div><div class="nm-row">NEEDS ${Object.entries(b.recipe.in).map(([id, v]) => ichip(id, true, v)).join('')}</div><div class="nm-row">MAKES ${Object.entries(b.recipe.out).filter(([id]) => id !== 'steam').map(([id, v]) => ichip(id, true, v)).join('') || '—'}</div>`;
      if (b.def.store) h += `<div class="nm-lbl">HOLDS <i>${Math.floor([...b.store.values()].reduce((a, v) => a + v, 0))}/${b.def.store}</i></div>`;
    }
    if (n.kind === 'deposit') { const s = L.seam(n); if (s) h += `<div class="nm-p">${Math.floor(s.amount).toLocaleString('en-US')} ${esc(ITEMS[s.item]?.name ?? s.item)} left in the seam. ${s.drill ? 'It lies deep: only a drill-tier miner reaches it.' : 'Wire it to a container and workers will dig it by hand, or set a miner over it.'}</div>`; }
    if (n.kind === 'field') { const fl = L.fieldOf(n); if (fl) h += `<div class="nm-lbl">FIELD <i>WORKERS CUT WHAT GROWS INSIDE</i></div><div class="nm-row">RADIUS ${num('f.r', fl.r, 1)} m</div><div class="nm-row">GIVES ${L.fieldYields(n).map((id) => ichip(id, true)).join('')}</div><div class="nm-p">Trees give wood; shrubs give fibre and leaves; fruiting plants give fruit. Plants regrow; cut too hard and the field goes bare.</div>`; }
    if (n.kind === 'site') {
      const s = L.site(n);
      if (s) { h += `<div class="nm-lbl">CONSTRUCTION <i>${Math.round(L.f.sites.progress(s) * 100)}%</i></div><div class="nm-row">${Object.entries(s.need).map(([id, v]) => ichip(id, (s.got[id] ?? 0) >= (v ?? 0), `${s.got[id] ?? 0}/${v}`)).join('')}</div><div class="nm-p">${s.stage === 'build' ? `Materials on site. ${s.builders} worker${s.builders === 1 ? '' : 's'} building.` : 'Free haulers and the construction crew bring the materials from the stores. With no one free, the pod\'s crane does it slowly.'}</div><div class="nm-row"><span class="nm-btn red" data-act="s.cancel">CANCEL SITE</span></div>`; }
    }
    if (!isLogic(n.kind) && n.kind !== 'site' && n.kind !== 'deposit' && n.kind !== 'field') {
      const items = L.offers(n).filter((id) => L.level(n, id) >= 1);
      h += `<div class="nm-lbl">STOCK <i>${items.length} KINDS</i></div><div class="nm-stock">${items.length ? items.map((id) => ichip(id, true, L.level(n, id))).join('') : '<span style="color:var(--ph-6)">EMPTY</span>'}</div>`;
    }
    if (isLogic(n.kind)) h += this.logic(n);
    // wires
    const ins = L.routes.filter((r) => r.to === n.id), outs = L.routes.filter((r) => r.from === n.id);
    h += `<div class="nm-lbl">WIRES <i>${ins.length} IN · ${outs.length} OUT</i></div><ul class="nm-list">`;
    for (const r of [...ins, ...outs]) { const o = L.node(r.to === n.id ? r.from : r.to); h += `<li data-act="sel.r" data-v="${r.id}"><span>${r.to === n.id ? '← ' : '→ '}${esc(o?.name ?? '?')}</span><span>${r.inflight ? `<span>${r.inflight} MOVING</span>` : r.note ? `<span class="amb">${esc(r.note)}</span>` : `<i>${Math.round(L.flow(r.id))}/MIN</i>`}</span></li>`; }
    if (!ins.length && !outs.length) h += `<li><i>NOT WIRED: DRAG FROM ITS OUTPUT TAB (RIGHT EDGE) TO ANOTHER NODE</i></li>`;
    h += `</ul>`;
    if (isLogic(n.kind) || n.kind === 'field') h += `<div class="nm-row" style="margin-top:10px"><span class="nm-btn red" data-act="n.del">REMOVE ${isLogic(n.kind) ? 'NODE' : 'FIELD'}</span></div>`;
    if (n.tidy && !isLogic(n.kind)) h += `<div class="nm-row" style="margin-top:6px"><span class="nm-btn" data-act="n.home">BACK TO ITS WORLD POSITION</span></div>`;
    return h;
  }
  private logic(n: LNode): string {
    const L = this.L, c = n.cfg;
    const outs = L.routes.filter((r) => r.from === n.id), ins = L.routes.filter((r) => r.to === n.id);
    const anyItems = () => { const s = new Set<ItemId>(); for (const ch of L.chains()) if (ch.logic.includes(n)) for (const id of L.offers(ch.src)) s.add(id); return [...s].filter((id) => ITEMS[id]); };
    const itemSel = (path: string, v?: ItemId, any = 'ANY ITEM ON THE WIRE') => `<select class="nm-sel" data-ch="${path}"><option value="">${any}</option>${[...new Set([...anyItems(), ...(v ? [v] : [])])].map((id) => `<option value="${id}" ${id === v ? 'selected' : ''}>${esc(ITEMS[id]?.name.toUpperCase() ?? id)}</option>`).join('')}</select>`;
    let h = `<div class="nm-p">${esc(FEATURES.find((f) => f.id === 'logic.' + n.kind)?.what ?? '')}</div>`;
    switch (n.kind) {
      case 'split': h += `<div class="nm-lbl">SHARES <i>LOADS DEALT BY WEIGHT</i></div>${outs.map((r) => `<div class="nm-row">→ ${esc(L.node(r.to)?.name ?? '?')} ${num(`l.w.${r.id}`, c.w?.[r.id] ?? 1, 1)} <i style="color:var(--ph-6)">SENT ${n.sent[r.id] ?? 0}</i></div>`).join('') || '<div class="nm-p">Wire its output to two or more targets.</div>'}`; break;
      case 'merge': h += `<div class="nm-lbl">SHARES <i>SOURCES DRAWN BY WEIGHT</i></div>${ins.map((r) => `<div class="nm-row">← ${esc(L.node(r.from)?.name ?? '?')} ${num(`l.w.${r.id}`, c.w?.[r.id] ?? 1, 1)} <i style="color:var(--ph-6)">DRAWN ${n.sent[r.id] ?? 0}</i></div>`).join('') || '<div class="nm-p">Wire two or more sources into it.</div>'}`; break;
      case 'buffer': h += `<div class="nm-lbl">MARKS <i>${n.open ? 'FILLING' : 'FULL: WAITING FOR THE LOW MARK'}</i></div><div class="nm-row">WATCH ${itemSel('l.item', c.item)}</div><div class="nm-row">FILL TO ${num('l.hi', c.hi ?? 40, 5)} REFILL BELOW ${num('l.lo', c.lo ?? 10, 5)}</div>`; break;
      case 'counter': h += `<div class="nm-lbl">COUNT <i>${n.count} OF ${c.n}</i></div><div class="nm-row">PASS ${num('l.n', c.n ?? 50, 10)} ITEMS, THEN CLOSE</div><div class="nm-row"><span class="nm-btn ${c.daily ? 'on' : ''}" data-act="l.daily">RESET EACH DAWN</span><span class="nm-btn amb" data-act="l.reset">RESET NOW</span></div>`; break;
      case 'gate': h += `<div class="nm-lbl">OPENS WHEN <i>${n.open ? 'OPEN' : 'SHUT'}</i></div>${this.conds(c.conds ?? [], 'l', [])}<div class="nm-row"><span class="nm-btn amb" data-act="c.add" data-o="l">+ ADD CONDITION</span></div>`; break;
      case 'timer': { const P = c.period ?? 120, on = c.on ?? 40; h += `<div class="nm-lbl">CYCLE <i>${n.open ? 'OPEN' : 'SHUT'}</i></div><div class="nm-row">EVERY ${num('l.period', P, 10)} s OPEN FOR ${num('l.on', on, 5)} s</div><div style="height:8px;background:var(--ph-3);margin-top:6px;position:relative"><i style="position:absolute;left:0;top:0;bottom:0;width:${(on / P) * 100}%;background:var(--ph-7)"></i><i style="position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--am);left:${((L.f.time % P) / P) * 100}%"></i></div>`; break; }
      case 'sensor': {
        const probes = L.nodes.filter((x) => !isLogic(x.kind));
        h += `<div class="nm-lbl">READS <i>${n.sig ? 'SIGNAL ON' : 'SIGNAL OFF'}</i></div><div class="nm-row"><select class="nm-sel" data-ch="l.probe"><option value="">PICK A NODE…</option>${probes.map((x) => `<option value="${x.id}" ${x.id === c.probe ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`;
        h += `<div class="nm-row">${(['count', 'working', 'power'] as const).map((w) => `<span class="nm-btn ${c.what === w ? 'on' : ''}" data-act="l.what" data-v="${w}">${w === 'count' ? 'STOCK' : w === 'working' ? 'WORKING' : 'POWERED'}</span>`).join('')}</div>`;
        if (c.what === 'count') { const p = c.probe ? L.node(c.probe) : null; h += `<div class="nm-row"><select class="nm-sel" data-ch="l.item"><option value="">PICK AN ITEM…</option>${(p ? L.offers(p) : []).filter((id) => ITEMS[id]).map((id) => `<option value="${id}" ${id === c.item ? 'selected' : ''}>${esc(ITEMS[id].name.toUpperCase())}</option>`).join('')}</select></div><div class="nm-row">SIGNAL WHEN <span class="nm-btn ${c.cmp === '<' ? 'on' : ''}" data-act="l.cmp" data-v="<">BELOW</span><span class="nm-btn ${c.cmp === '>' ? 'on' : ''}" data-act="l.cmp" data-v=">">ABOVE</span>${num('l.th', c.th ?? 20, 5)}</div><div class="nm-p">NOW READING <b style="color:var(--ph-9);font-weight:normal">${n.count}</b>. Use its signal in a gate or a route condition.</div>`; }
        else h += `<div class="nm-row">SIGNAL WHEN <span class="nm-btn ${c.cmp !== '<' ? 'on' : ''}" data-act="l.cmp" data-v=">">${c.what === 'working' ? 'WORKING' : 'POWERED'}</span><span class="nm-btn ${c.cmp === '<' ? 'on' : ''}" data-act="l.cmp" data-v="<">${c.what === 'working' ? 'STOPPED' : 'DARK'}</span></div>`;
        break;
      }
    }
    return h;
  }

  // ------------------------------------------------------------------ overview, multi, templates
  private overview(): string {
    const L = this.L, f = this.m.f, ws = f.workers.list.filter((w) => !w.c.dead);
    const flow = L.routes.reduce((a, r) => a + L.flow(r.id), 0), stalled = L.routes.filter((r) => r.on && r.note && !r.inflight);
    let h = `<div class="nm-h">COLONY LOGISTICS<small>SELECT A NODE OR A WIRE TO EDIT IT</small></div>`;
    h += `<div class="nm-kv" style="margin-top:8px"><div><div class="k">ROUTES</div><div class="v">${L.routes.length}</div></div><div><div class="k">FLOW</div><div class="v">${fmt(flow)}<small>/MIN</small></div></div><div><div class="k">ROUTED, EVER</div><div class="v">${Math.floor(L.xp)}</div></div></div>`;
    if (!L.routes.length) h += `<div class="nm-p" style="margin-top:10px">Nothing is wired. Drag from a node's output tab (its right edge) to another node: workers will carry what the source has and the target takes. Start the <b style="color:var(--am);font-weight:normal">FIRST CHAIN GUIDE</b> at the top to learn it step by step.</div>`;
    h += `<div class="nm-lbl">STALLED <i>${stalled.length}</i></div><ul class="nm-list">${stalled.map((r) => `<li data-act="sel.r" data-v="${r.id}"><span>${esc(L.node(r.from)?.name ?? '?')} → ${esc(L.node(r.to)?.name ?? '?')}</span><span class="amb">${esc(r.note)}</span></li>`).join('') || '<li><i>EVERY ROUTE IS MOVING OR READY</i></li>'}</ul>`;
    const sites = f.sites?.list ?? [];
    if (sites.length) h += `<div class="nm-lbl">CONSTRUCTION <i>${sites.length} SITE${sites.length > 1 ? 'S' : ''}</i></div><ul class="nm-list">${sites.map((s) => `<li data-act="sel.n" data-v="site:${s.id}"><span>${esc(s.def.name.toUpperCase())}</span><span>${s.stage === 'build' ? `<span class="amb">BUILDING ${Math.round(Math.min(1, s.work / s.workNeed) * 100)}%</span>` : `<i>SUPPLY ${Math.round(f.sites.progress(s) * 200)}%</i>`}</span></li>`).join('')}</ul>`;
    h += `<div class="nm-lbl">WORKERS <i>${ws.length} · HAUL, BUILD OR FREE</i></div>${this.workers(() => false, '')}`;
    h += `<div class="nm-row" style="margin-top:6px"><span class="nm-btn" data-act="crew">FULL CREW ROSTER</span></div>`;
    h += `<div class="nm-lbl">DISCIPLINE <i>LEARNED BY ROUTING ITEMS</i></div><ul class="nm-list">${FEATURES.filter((x) => x.tier > 0).map((x) => { const ok = L.unlocked(x.id); return `<li><span>${esc(x.name.toUpperCase())}</span><span class="${ok ? '' : 'amb'}">${ok ? '<i>LEARNED</i>' : esc(L.lockWhy(x.id))}</span></li>`; }).join('')}</ul>`;
    return h;
  }
  private multi(): string {
    const L = this.L, ids = [...this.m.multi], ns = ids.map((id) => L.node(id)).filter((n): n is LNode => !!n);
    const wires = L.routes.filter((r) => this.m.multi.has(r.from) && this.m.multi.has(r.to)).length;
    const ok = L.unlocked('routes.templates');
    let h = `<div class="nm-h">${ns.length} NODES SELECTED<small>${wires} WIRES BETWEEN THEM</small></div><ul class="nm-list" style="margin-top:8px">${ns.map((n) => `<li data-act="sel.n" data-v="${n.id}"><span>${esc(n.name)}</span><i>${n.kind.toUpperCase()}</i></li>`).join('')}</ul>`;
    h += `<div class="nm-lbl ${ok ? '' : 'lock'}">SAVE AS TEMPLATE <i>${ok ? 'A CHAIN TO LAY AGAIN' : esc(L.lockWhy('routes.templates'))}</i></div>`;
    if (ok) h += `<div class="nm-row"><span class="nm-in pl-ph"><input data-ch="t.name" value="${esc(this.tplName)}" maxlength="24"></span><span class="nm-btn amb" data-act="t.save">SAVE</span></div>`;
    h += `<div class="nm-row" style="margin-top:8px"><span class="nm-btn" data-act="m.clear">CLEAR SELECTION</span></div>`;
    return h;
  }
  private templates(): string {
    const L = this.L, ok = L.unlocked('routes.templates');
    let h = `<div class="nm-h">CHAIN TEMPLATES<small>LAY A SAVED CHAIN: MISSING BUILDINGS BECOME SITES</small></div>`;
    if (!ok) h += `<div class="nm-p">${esc(L.lockWhy('routes.templates'))} (or finish the first chain guide).</div>`;
    for (let i = 0; i < L.templates.length; i++) {
      const t = L.templates[i];
      h += `<div class="nm-tpl"><div class="n">${esc(t.name)}</div><div class="d">${t.nodes.map((n) => (n.logic ? LOGIC_NAME[n.k as LogicKind] : n.kind ? n.kind.toUpperCase() : n.k === 'deposit' ? `${short(n.item ?? '')} DEPOSIT` : n.k.toUpperCase())).join(' → ')} · ${t.routes.length} WIRES</div><div class="nm-row"><span class="nm-btn amb ${ok ? '' : 'off'}" data-act="t.lay" data-v="${i}">LAY IT</span>${t.builtin ? '' : `<span class="nm-btn red" data-act="t.del" data-v="${i}">DELETE</span>`}</div></div>`;
    }
    if (!L.templates.length) h += `<div class="nm-p">No templates yet. Shift-drag a box around a working chain on the map, then save it.</div>`;
    h += `<div class="nm-row"><span class="nm-btn" data-act="t.close">BACK</span></div>`;
    return h;
  }

  // ------------------------------------------------------------------ edits
  private sel(): { r?: Route; n?: LNode } { const s = this.m.sel, L = this.L; if (s?.k === 'route') return { r: L.routes.find((x) => x.id === s.id) }; if (s?.k === 'node') return { n: L.node(s.id) ?? undefined }; return {}; }
  private condList(o: string): Cond[] | null { const { r, n } = this.sel(); if (o === 'r' && r) return r.conds; if (o === 'l' && n) return (n.cfg.conds ??= []); return null; }
  private done() { this.L.changed(); this.isDirty = true; sfx('click', 1.3, 0.35); }
  private click(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest('[data-act],[data-d]') as HTMLElement | null; if (!t) return;
    const L = this.L, { r, n } = this.sel();
    if (t.dataset.d) { const box = t.closest('[data-num]') as HTMLElement, inp = box.querySelector('input')!; const step = Number(box.dataset.step) || 1; inp.value = String(Math.max(0, (Number(inp.value) || 0) + Number(t.dataset.d) * step)); this.setNum(box.dataset.num!, Number(inp.value)); return; }
    const a = t.dataset.act!, v = t.dataset.v, o = t.dataset.o ?? '', i = Number(t.dataset.i);
    switch (a) {
      case 'r.on': if (r) r.on = !r.on; break;
      case 'r.del': if (r) { L.removeRoute(r.id); this.m.select(null); sfx('crack', 1.4, 0.4); this.m.tut.poke(); return; } break;
      case 'r.any': if (r) r.filter = []; break;
      case 'r.item': if (r) { const id = t.dataset.id!; r.filter = r.filter.includes(id) ? r.filter.filter((x) => x !== id) : [...r.filter, id]; this.m.tut.poke(); } break;
      case 'r.mode': if (r) { r.amount.mode = v as AmountMode; if (v === 'rate') r.amount.n = r.amount.n || 20; } break;
      case 'r.pri': if (r) r.priority = Number(v); break;
      case 'r.pool': if (r) r.pool = !r.pool; break;
      case 'r.w': if (r) {
        const id = Number(t.dataset.c), W = this.m.f.workers, w = W.list.find((x) => x.c.id === id);
        if (r.workers.includes(id)) r.workers = r.workers.filter((x) => x !== id);
        else { r.workers.push(id); if (w && w.job !== 'haul') { const err = W.assign(w.c, 'haul'); if (err) { toast(err, 'warn', 1600); r.workers = r.workers.filter((x) => x !== id); } } }
        this.m.tut.poke();
      } break;
      case 'c.add': { const cl = this.condList(o); if (cl) cl.push({ k: o === 'l' ? 'day' : 'dstBelow', n: 50 }); break; }
      case 'c.del': { const cl = this.condList(o); if (cl) cl.splice(i, 1); break; }
      case 'c.not': { const cl = this.condList(o); if (cl?.[i]) cl[i].not = !cl[i].not; break; }
      case 'l.daily': if (n) n.cfg.daily = !n.cfg.daily; break;
      case 'l.reset': if (n) n.count = 0; break;
      case 'l.what': if (n) n.cfg.what = v as never; break;
      case 'l.cmp': if (n) n.cfg.cmp = v as never; break;
      case 'n.del': if (n) { L.removeNode(n.id); this.m.select(null); return; } break;
      case 'n.home': if (n) { n.tidy = false; L.sync(true); } break;
      case 's.cancel': if (n) { const s = L.site(n); if (s) { L.f.sites.cancel(s); this.m.select(null); toast(`Site cancelled: <b>${s.def.name}</b>`, 'info', 1500); return; } } break;
      case 'sel.r': this.m.select({ k: 'route', id: Number(v) }); return;
      case 'sel.n': this.m.select({ k: 'node', id: v! }); return;
      case 'w.job': {
        const W = this.m.f.workers, w = W.list.find((x) => x.c.id === Number(t.dataset.c)); if (!w) return;
        if (v === 'idle') { W.release(w.c); for (const rr of L.routes) rr.workers = rr.workers.filter((x) => x !== w.c.id); }
        else { const err = W.assign(w.c, v as Job); if (err) { sfx('deny'); toast(err, 'warn', 1600); return; } }
        break;
      }
      case 'crew': (this.m.f.ui as unknown as { openCrew?(): void }).openCrew?.(); this.m.close(); return;
      case 'm.clear': this.m.multi.clear(); break;
      case 't.save': { const tp = L.saveTemplate(this.tplName || 'CHAIN', [...this.m.multi]); if (tp) { toast(`Template saved: <b>${tp.name}</b>`, 'good', 1800); this.m.multi.clear(); this.view = 'templates'; this.m.tut.poke(); } else toast('Select at least two nodes with wires between them', 'warn', 1800); break; }
      case 't.lay': { if (!L.unlocked('routes.templates')) { sfx('deny'); return; } const tp = L.templates[Number(v)]; if (tp) { this.m.layTemplate(tp); this.view = 'auto'; } return; }
      case 't.del': L.templates.splice(Number(v), 1); break;
      case 't.close': this.view = 'auto'; break;
    }
    this.done();
  }
  private change(e: Event) {
    const t = e.target as HTMLInputElement | HTMLSelectElement, L = this.L, { r, n } = this.sel();
    const box = t.closest('[data-num]') as HTMLElement | null;
    if (box) { this.setNum(box.dataset.num!, Number((t as HTMLInputElement).value) || 0); return; }
    const ch = t.dataset.ch; if (!ch) return;
    const o = t.dataset.o ?? '', i = Number(t.dataset.i), v = t.value;
    switch (ch) {
      case 'r.addItem': if (r && v) { r.filter = [...new Set([...r.filter, v])]; } break;
      case 'c.k': { const cl = this.condList(o); if (cl?.[i]) cl[i].k = v as CondK; break; }
      case 'c.item': { const cl = this.condList(o); if (cl?.[i]) cl[i].item = v || undefined; break; }
      case 'c.node': { const cl = this.condList(o); if (cl?.[i]) cl[i].node = v || undefined; break; }
      case 'l.item': if (n) n.cfg.item = v || undefined; break;
      case 'l.probe': if (n) n.cfg.probe = v || undefined; break;
      case 't.name': this.tplName = v.toUpperCase(); return;
    }
    void L;
    this.done();
  }
  private setNum(path: string, v: number) {
    const L = this.L, { r, n } = this.sel(), p = path.split('.');
    v = Math.max(0, Math.round(v));
    if (p[0] === 'r' && r) { r.amount.n = Math.max(1, v); }
    else if (p[0] === 'c') { const cl = this.condList(p[2]); if (cl?.[Number(p[3])]) cl[Number(p[3])].n = v; }
    else if (p[0] === 'f' && n) { const fl = L.fieldOf(n); if (fl) fl.r = Math.max(3, Math.min(24, v)); }
    else if (p[0] === 'l' && n) {
      if (p[1] === 'w') { (n.cfg.w ??= {})[Number(p[2])] = Math.max(1, v); }
      else if (p[1] === 'hi') n.cfg.hi = Math.max((n.cfg.lo ?? 0) + 1, v);
      else if (p[1] === 'lo') n.cfg.lo = Math.min((n.cfg.hi ?? 40) - 1, v);
      else if (p[1] === 'n') n.cfg.n = Math.max(1, v);
      else if (p[1] === 'period') n.cfg.period = Math.max(10, v);
      else if (p[1] === 'on') n.cfg.on = Math.max(1, Math.min(n.cfg.period ?? 120, v));
      else if (p[1] === 'th') n.cfg.th = v;
    }
    this.done();
  }
  /** the last minute of a route's flow, in 10 s bars (art pixels, shown at 2x) */
  private spark(c: HTMLCanvasElement) {
    const r = this.L.routes.find((x) => x.id === Number(c.dataset.spark)); if (!r) return;
    const g = c.getContext('2d')!, W = c.width, H = c.height, h = [...r.hist].reverse(), mx = Math.max(4, ...h);
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0a110d'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#336240'; g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1); g.fillRect(0, 0, 1, H); g.fillRect(W - 1, 0, 1, H);
    for (let y = 6; y < H - 1; y += 6) for (let x = 2; x < W - 2; x += 3) { g.fillStyle = '#14261b'; g.fillRect(x, y, 1, 1); }
    const bw = Math.floor((W - 4) / h.length);
    h.forEach((v, i) => { const bh = Math.round((v / mx) * (H - 16)); g.fillStyle = i === h.length - 1 ? '#d9a43a' : '#4a8457'; g.fillRect(3 + i * bw, H - 2 - bh, bw - 3, bh); });
    g.font = '11px Body, monospace'; g.textBaseline = 'top'; g.fillStyle = '#4a8457'; g.fillText('LAST 60 S · PER 10 S', 4, 2);
  }
}

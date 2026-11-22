// EMPIRE · THE EMPIRE OVERVIEW (folded into the MAP: the survey map's EMPIRE icon, the minimap's EMPIRE icon, or O).
// One board in the kit's machine boxes: a STATS STRIP along the top (population, workers, food, power, credits,
// standing, research, military, territory as glyphs with rolling numbers), the EMPIRE LEDGER on the left (every
// number with its unit and what it means, production and use per minute by item, shortages), the PLANET MAP in the
// middle (planetMap.ts) with its legend, and under it the SELECTION card (a settlement: its tier and what the next
// one needs, its people, stores and output, GO THERE / BUILD ROAD / MAKE SEAT; a region: its ground, its holders,
// SEND SETTLER CONVOY and POD DROP with their bills in have / need), and on the right four tabs: SETTLEMENTS (a card
// each), ROUTES (roads and rail, trade routes and a NEW ROUTE form), DIPLOMACY (the two blocs: relations, treaty,
// trade deals, gifts, pact, war and peace) and LOG (what happened, by sol).
import type { Empire, EmpireStats } from './empire';
import { panel, pkey, kv, para, section, status, bindTip, meter, keyHint, hideTip, type Panel, type Kv, type PKey, type Status, type Meter } from '../ui/kit/panel';
import { floatIcon } from '../ui/kit/floatIcon';
import { pxCanvas } from '../ui/kit/mat';
import { uiSfx } from '../ui/kit/sound';
import { onFrame, Counter, pop, shake } from '../ui/kit/juice';
import { transition } from '../ui/kit/transitions';
import { installKitStyle } from '../ui/kit/style';
import { compassGlyph, markGlyph } from '../ui/hud7/glyphs';
import { itemIcon, ITEMS } from '../factory/items';
import { BIOMES } from '../world/region';
import { PlanetMap } from './planetMap';
import { tierGlyph, blocGlyph, unitGlyph, glyphEl } from './glyphs';
import { travelTo } from './travel';
import { empireHost } from './host';
import {
  TIERS, TIER_NAME, TIER_RULE, LINK_RULE, CONVOY_COST, CONVOY_FOOD, DROP_COST, DROP_ITEMS, BLOC_NAME, BLOC_SHORT, BLOC_DESC, BLOC_TRADE,
  GIFT_CR, PEACE_CR, DEAL_PERIOD, TREATY_WORD, relationWord, type SettlementData, type BlocId, type LinkData,
} from './types';
import { SOL_S } from './empire';

type Tab = 'settlements' | 'routes' | 'diplomacy' | 'log';
const TABS: [Tab, string][] = [['settlements', 'SETTLEMENTS'], ['routes', 'ROUTES'], ['diplomacy', 'DIPLOMACY'], ['log', 'LOG']];
const div = (cls: string, parent?: HTMLElement, text?: string) => { const e = document.createElement('div'); e.className = cls; if (text !== undefined) e.textContent = text; parent?.append(e); return e; };
const t16 = (text: string, cls = '', parent?: HTMLElement) => div('k7-t16 ' + cls, parent, text);
const iconImg = (id: string, px = 32) => { const i = document.createElement('img'); i.src = itemIcon(id, px); i.width = px; i.height = px; i.className = 'emp-ii'; i.alt = ITEMS[id]?.name ?? id; return i; };
const nm = (id: string) => ITEMS[id]?.name ?? (id === 'food' ? 'Food' : id === 'power' ? 'Power' : id === 'housing' ? 'Housing' : id);
const fmt = (n: number) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));

export class EmpireScreen {
  el: HTMLDivElement | null = null;
  private map: PlanetMap | null = null;
  private panels: Panel[] = [];
  private live: (() => void)[] = [];
  private stop: (() => void) | null = null;
  private tab: Tab = 'settlements';
  private sigs = { sel: '', tab: '', left: '' };
  private from = { x: innerWidth / 2, y: innerHeight / 2 };
  // the new-route form
  private form = { from: -1, to: -1, item: '', amount: 10 };
  private col: { l: HTMLDivElement; sel: HTMLDivElement; tabs: HTMLDivElement; tabBody: HTMLDivElement } | null = null;
  private keys = new Map<Tab, PKey>();
  constructor(readonly e: Empire) { installKitStyle(); injectCSS(); }
  get isOpen() { return !!this.el; }

  /** open with an iris from a point (the map icon) */
  open(from?: { x: number; y: number }) {
    if (this.el) return;
    if (from) this.from = from;
    void transition('iris', () => this.build(), { x: this.from.x, y: this.from.y, ms: 320 });
  }
  close(anim = true) {
    if (!this.el) return;
    const done = () => this.teardown();
    // what was set up on the board (routes, deals, treaties, convoys) is written to the run's save
    if (anim) { void transition('iris', done, { x: this.from.x, y: this.from.y, ms: 300 }); try { this.e.capture(); empireHost()?.save(); } catch (err) { console.error('empire save', err); } }
    else done();
  }
  private offChange: (() => void) | null = null;
  private teardown() {
    const g = this.e.g as Record<string, unknown> | null; if (g && Object.prototype.hasOwnProperty.call(g, 'render')) delete g.render;
    removeEventListener('keydown', this.onKey, true);
    this.offChange?.(); this.offChange = null;
    this.stop?.(); this.stop = null;
    for (const p of this.panels) p.dispose(); this.panels = []; this.live = [];
    this.el?.remove(); this.el = null; this.map = null; this.col = null; this.keys.clear();
    document.body.classList.remove('emp-on'); hideTip();
    this.e.g?.emit?.('screen-close', { id: 'empire' });
  }
  private onKey = (ev: KeyboardEvent) => {
    if (!this.el) return;
    if (ev.key === 'Escape') { ev.stopImmediatePropagation(); ev.preventDefault(); if (this.map?.linkFrom) { this.map.linkFrom = null; uiSfx('back', 0.4); } else this.close(); return; }
    const k = ev.key.toLowerCase();
    if (k === 'o') { ev.stopImmediatePropagation(); this.close(); return; }
    const n = Number(ev.key); if (n >= 1 && n <= 4) { ev.stopImmediatePropagation(); this.setTab(TABS[n - 1][0]); return; }
    if (!ev.ctrlKey && !ev.metaKey) ev.stopImmediatePropagation();
  };

  // ================================================================== the board
  private build() {
    const e = this.e;
    const el = this.el = div('emp'); document.body.append(el); document.body.classList.add('emp-on');
    // the board covers the region: its 3D frame is not drawn while the board is up (the world keeps running)
    const g = e.g; if (g) { g.render = () => { /* covered by the empire board */ }; }
    // ---- header: the name floating, the stats strip, the icons
    const hd = div('emp-hd', el);
    const tt = div('emp-tt', hd);
    div('k7-name k7-t48', tt, 'EMPIRE');
    const sub = t16('', 'emp-sub', tt), sub2 = t16('', 'emp-sub', tt);
    const strip = panel({ tone: 'dark', head: 8, foot: 8, side: 8, lamps: [], hazard: false, glands: 0, vents: false, cls: 'emp-strip' }); this.panels.push(strip);
    hd.append(strip.el);
    const chips: [string, HTMLCanvasElement, (s: EmpireStats) => number, string, string][] = [
      ['POPULATION', pxCanvas(markGlyph('worker', 2), 2), (s) => s.pop, '', 'Everyone in the empire: crew, worker creatures, robots and drones, in every settlement.'],
      ['WORKERS', pxCanvas(markGlyph('building', 2), 2), (s) => s.workers, '', 'Worker creatures on the works rosters (haul, dig, farm, build, operate).'],
      ['FOOD', glyphEl(unitGlyph('deal', 2), 1), (s) => s.food, 'MEALS', 'Meals in store across the empire (rations plus everything edible). Each head eats a quarter meal a minute.'],
      ['POWER', pxCanvas(markGlyph('struct', 2), 2), (s) => Math.round(s.power.gen - s.power.draw), 'KW NET', 'Generation minus draw, summed over every settlement (kW). Below zero something is going dark.'],
      ['CREDITS', glyphEl(blocGlyph('you', 2), 1), (s) => s.treasury, 'CR', 'The treasury in UNAA credits: taxes from every settlement, spent on pod drops, gifts and peace.'],
      ['STANDING', pxCanvas(markGlyph('pin', 2), 2), (s) => s.standing ?? 0, '/ 100', 'Your standing with the MERIDIAN (directives met). Pod drops cost standing.'],
      ['RESEARCH', pxCanvas(markGlyph('crystal', 2), 2), (s) => s.know ? s.know.bio + s.know.geo + s.know.energy + s.know.xeno : 0, 'DATA', 'Knowledge in hand (bio, geo, energy and xeno data) to spend on the skill tree.'],
      ['MILITARY', pxCanvas(markGlyph('drone', 2), 2), (s) => s.military, 'UNITS', 'Units under arms: robots, drones and the crew, every settlement counted.'],
      ['TERRITORY', glyphEl(tierGlyph('town', 2), 1), (s) => s.regions, `/ ${e.planet.regions.length}`, 'Regions of the planet that hold one of your settlements.'],
    ];
    const ctrs: [Counter, (s: EmpireStats) => number][] = [];
    for (const [label, ic, f, unit, tip] of chips) {
      const ch = div('emp-chip', strip.body); ic.classList.add('emp-chip-ic'); ch.append(ic);
      const col = div('emp-chip-t', ch);
      const nr = div('emp-chip-nr', col), num = div('emp-chip-n', nr); const cn = new Counter(num, { size: 32 }); ctrs.push([cn, f]);
      if (unit) t16(unit, 'emp-chip-u', nr);
      t16(label, 'emp-chip-l', col);
      bindTip(ch, () => { const s = e.stats(); return { title: label, desc: tip, rows: label === 'POWER' ? [['Generation', s.power.gen, 'kW'], ['Draw', s.power.draw, 'kW']] : label === 'FOOD' ? [['In store', s.food, 'meals'], ['Eaten', Math.round(s.meals * 10) / 10, 'meals/min']] : label === 'CREDITS' ? [['Taxes', s.tax, 'CR/min']] : label === 'POPULATION' ? [['Crew', s.crew], ['Robots and drones', s.robots], ['Settlements', s.settlements]] : undefined }; });
    }
    const icons = div('emp-ics', hd);
    const reg = floatIcon({ canvas: pxCanvas(compassGlyph(), 2), name: 'REGION MAP', nameSize: 16, sound: 'open', onClick: () => { this.close(false); const g = e.g; g?.map7?.open?.(true, this.from); } });
    const back = floatIcon({ canvas: glyphEl(blocGlyph('you', 3), 1), name: 'BACK', nameSize: 16, sound: 'back', onClick: () => this.close() });
    bindTip(reg.el, () => ({ title: 'REGION MAP', desc: 'The painted survey map of the region you are in.', hint: [['M', 'region map']] }));
    bindTip(back.el, () => ({ title: 'BACK', desc: 'Back to the settlement.', hint: [['ESC', 'close'], ['O', 'close']] }));
    icons.append(reg.el, back.el);
    // ---- the three columns
    const body = div('emp-body', el);
    const L = div('emp-l', body), C = div('emp-c', body), R = div('emp-r', body);
    // ledger
    const led = panel({ title: 'EMPIRE LEDGER', tone: 'gun', serial: 'UNAA-E', lamps: ['green', 'amber'], cls: 'emp-led' }); this.panels.push(led); L.append(led.el);
    // map
    const mp = panel({ title: `PLANET ${e.planet.name.toUpperCase()}`, tone: 'gun', serial: 'NAV-P', lamps: ['green', 'amber'], cls: 'emp-mapp', glands: 2 }); this.panels.push(mp); C.append(mp.el);
    const wrap = div('emp-mapw', mp.body);
    const map = this.map = new PlanetMap(e); wrap.append(map.cv);
    map.maxH = 500;
    const lg = div('emp-leg', mp.body); this.legend(lg);
    map.onPick = () => { this.sigs.sel = ''; this.refresh(); };
    map.onLink = (a, b) => { const why = e.buildLink(a.id, b.id, 'road'); if (why) this.deny(why); else { uiSfx('confirm', 0.6); this.sigs.tab = ''; this.refresh(); } };
    const live = e.liveS(); if (live) { map.focus(live.region); map.sel = { region: live.region, settlement: live }; }
    // selection
    const sel = div('emp-sel', C);
    // tabs
    const tabs = div('emp-tabs', R);
    const TW: Record<Tab, number> = { settlements: 140, routes: 96, diplomacy: 128, log: 72 };
    for (const [id, label] of TABS) { const k = pkey(label, () => this.setTab(id), { w: TW[id], h: 34, tone: 'cream', lamp: 'amber' }); this.keys.set(id, k); tabs.append(k); bindTip(k, () => ({ title: label, desc: TAB_INFO[id], hint: [[String(TABS.findIndex((x) => x[0] === id) + 1), 'this tab']] })); }
    const tb = div('emp-tabb', R);
    this.col = { l: led.body, sel, tabs, tabBody: tb };
    this.setTab(this.tab);
    this.buildLedger();
    // live
    let acc = 0;
    const tick = () => {
      sub.textContent = `UNAA MANDATE OF ${e.planet.name.toUpperCase()}`;
      sub2.textContent = `SOL ${e.sol()} · ${e.d.settlements.length} SETTLEMENT${e.d.settlements.length === 1 ? '' : 'S'} · ${e.d.convoys.length} ON THE ROAD`;
      const s = e.stats(); for (const [c, f] of ctrs) c.set(Math.round(f(s)));
    };
    tick();
    this.stop = onFrame((dt) => {
      if (!this.el) return false;
      map.draw(dt);
      acc += dt; if (acc > 0.5) { acc = 0; tick(); this.refresh(); for (const f of this.live) { try { f(); } catch (err) { console.error('empire ui', err); } } }
      return true;
    }) as unknown as () => void;
    addEventListener('keydown', this.onKey, true);
    this.offChange = e.on('change', () => this.refresh());
    e.g?.emit?.('screen-open', { id: 'empire' });
    uiSfx('open', 0.5);
    this.refresh();
  }
  private setTab(t: Tab) { if (this.tab !== t) uiSfx('tab', 0.5); this.tab = t; for (const [id, k] of this.keys) k.setOn(id === t); this.sigs.tab = ''; this.refresh(); }
  private deny(why: string, at?: HTMLElement) { uiSfx('error', 0.5); if (at) shake(at); this.flash = { text: why, t: performance.now() }; this.sigs.sel = ''; this.refresh(); }
  private flash: { text: string; t: number } | null = null;
  /** structural rebuilds when what is shown changes (numbers update in place through `live`) */
  private refresh() {
    if (!this.col || !this.map) return;
    const e = this.e, m = this.map;
    const selSig = `${m.sel.region}|${m.sel.settlement?.id}|${m.sel.settlement?.tier}|${e.d.settlements.length}|${e.d.convoys.filter((c) => c.kind === 'settlers' || c.kind === 'drop').length}|${e.d.links.map((l) => l.kind + (l.built >= 1 ? 1 : 0)).join('')}|${m.linkFrom?.id}|${this.flash?.t ?? 0}|${e.d.seat}`;
    if (selSig !== this.sigs.sel) { this.sigs.sel = selSig; this.buildSel(); }
    const tabSig = `${this.tab}|${e.d.settlements.map((s) => s.id + s.tier).join(',')}|${e.d.links.map((l) => l.id + l.kind + (l.built >= 1 ? 'y' : 'n')).join(',')}|${e.d.routes.map((r) => r.id + (r.on ? 'y' : 'n') + r.from + r.to + r.item).join(',')}|${e.d.blocs.map((b) => b.treaty + (b.deal ? 'd' : '')).join(',')}|${JSON.stringify(this.form)}|${this.tab === 'log' ? e.d.log.length + (e.d.log[0]?.t ?? 0) : ''}`;
    if (tabSig !== this.sigs.tab) { this.sigs.tab = tabSig; this.buildTab(); }
  }
  private livePanel(p: Panel) { this.panels.push(p); return p; }
  private clearPanels(host: HTMLElement) {
    // dispose the panels that lived in host (the frames' observers) and their live updaters
    this.panels = this.panels.filter((p) => { if (host.contains(p.el)) { p.dispose(); return false; } return true; });
    const keep = this.live.filter((f) => !(f as { host?: HTMLElement }).host || !host.contains((f as unknown as { host: HTMLElement }).host));
    this.live = keep;
    host.textContent = '';
  }
  private onLive(host: HTMLElement, f: () => void) { (f as unknown as { host: HTMLElement }).host = host; this.live.push(f); f(); }

  // ================================================================== the ledger (left)
  private buildLedger() {
    const e = this.e, b = this.col!.l;
    b.append(para('Every settlement of the empire in numbers. The one you are in is read live; the others run on their own and are estimated from their works.', { dim: true }));
    const rows: Record<string, Kv> = {};
    const R = (sec: string, items: [string, string, string?, string?][]) => { b.append(section(sec)); for (const [k, label, unit, title] of items) { const r = kv(label, '-', { unit, title }); rows[k] = r; b.append(r.el); } };
    R('PEOPLE', [['pop', 'Population', '', 'Crew, worker creatures, robots and drones'], ['workers', 'Workers', '', 'On a works roster'], ['crew', 'Crew', '', 'Humans of the MERIDIAN on the ground'], ['robots', 'Robots and drones'], ['hap', 'Happiness', '%', 'The mean of every settlement (morale, comfort, food, power, war)']]);
    R('SUPPLY', [['food', 'Food in store', 'meals'], ['eat', 'Eaten', 'meals/min'], ['gen', 'Power generated', 'kW'], ['draw', 'Power drawn', 'kW']]);
    R('TREASURY', [['cr', 'Credits', 'CR'], ['tax', 'Taxes', 'CR/min', 'Population x tier rate x happiness, every settlement'], ['stand', 'Ship standing', '/ 100', 'With the MERIDIAN: directives met raise it']]);
    R('KNOWLEDGE', [['bio', 'Bio data'], ['geo', 'Geo data'], ['energy', 'Energy data'], ['xeno', 'Xeno data'], ['nodes', 'Functions learned']]);
    R('MILITARY', [['mil', 'Units under arms'], ['wars', 'At war with']]);
    R('TERRITORY', [['set', 'Settlements'], ['reg', 'Regions held'], ['links', 'Roads and rail open'], ['routes', 'Trade routes'], ['convoys', 'On the road now']]);
    b.append(section('PRODUCTION PER MINUTE'));
    const prod = div('emp-prod', b);
    b.append(section('USE PER MINUTE'));
    const use = div('emp-prod', b);
    b.append(section('SHORTAGES'));
    const short = div('emp-short', b);
    const sh: Status = status('-', 'ok'); short.append(sh.el);
    let lastP = '#', lastU = '#';
    this.onLive(b, () => {
      const s = e.stats();
      rows.pop.set(s.pop); rows.workers.set(s.workers); rows.crew.set(s.crew); rows.robots.set(s.robots); rows.hap.set(s.happiness, { bar: s.happiness / 100 });
      rows.food.set(s.food, { color: s.food < s.meals * 5 ? '#ffb08a' : undefined }); rows.eat.set(Math.round(s.meals * 10) / 10); rows.gen.set(s.power.gen); rows.draw.set(s.power.draw, { color: s.power.draw > s.power.gen ? '#ffb08a' : undefined });
      rows.cr.set(s.treasury); rows.tax.set(`+${s.tax}`); rows.stand.set(s.standing ?? '-');
      rows.bio.set(s.know?.bio ?? '-'); rows.geo.set(s.know?.geo ?? '-'); rows.energy.set(s.know?.energy ?? '-'); rows.xeno.set(s.know?.xeno ?? '-'); rows.nodes.set(s.nodes);
      rows.mil.set(s.military); const wars = e.d.blocs.filter((x) => x.treaty === 'war').map((x) => BLOC_SHORT[x.id]); rows.wars.set(wars.length ? wars.join(', ') : 'nobody', { color: wars.length ? '#ff9a7a' : undefined });
      rows.set.set(s.settlements); rows.reg.set(`${s.regions} of ${s.planet}`); rows.links.set(s.links); rows.routes.set(s.routes); rows.convoys.set(s.convoys);
      const pk = s.prod.slice(0, 8).map((x) => x.join(':')).join(',');
      if (pk !== lastP) { lastP = pk; prod.textContent = ''; if (!s.prod.length) prod.append(para('Nothing yet: build works (BUILD) and they show here.', { dim: true })); for (const [id, v] of s.prod.slice(0, 8)) prod.append(this.itemRow(id, `+${v}`, '/min')); }
      const uk = s.use.slice(0, 5).map((x) => x.join(':')).join(',');
      if (uk !== lastU) { lastU = uk; use.textContent = ''; if (!s.use.length) use.append(para('No item is being used up by the works.', { dim: true })); for (const [id, v] of s.use.slice(0, 5)) use.append(this.itemRow(id, `-${v}`, '/min')); }
      sh.set(s.short.length ? `Short of ${s.short.slice(0, 5).map(nm).join(', ')}: see the settlement cards for where` : 'Nothing is short anywhere', s.short.length ? 'warn' : 'ok');
    });
  }
  private itemRow(id: string, val: string, unit: string) { const r = div('emp-ir'); r.append(iconImg(id, 32)); t16(nm(id), 'emp-ir-n', r); t16(`${val} ${unit}`, 'emp-ir-v', r); bindTip(r, () => ({ title: nm(id), desc: ITEMS[id]?.desc })); return r; }
  private bill(s: SettlementData | null, bill: Record<string, number>, host: HTMLElement) {
    const row = div('emp-bill', host);
    for (const [spec, n] of Object.entries(bill)) {
      const id = this.e.pick(s, spec); if (!id) continue;
      const have = s ? this.e.count(s, spec, true) : 0, ok = have >= n;
      const c = div('emp-bc' + (ok ? '' : ' short'), row); c.append(iconImg(id, 32)); t16(`${have}/${n}`, 'emp-bc-n', c);
      bindTip(c, () => ({ title: nm(id), sub: `${n} needed`, rows: [['In store', have], ['Needed', n]], status: ok ? ['Enough', 'ok'] : [`${n - have} short`, 'warn'] }));
    }
    return row;
  }

  // ================================================================== the selection card (under the map)
  private buildSel() {
    const host = this.col!.sel; this.clearPanels(host);
    const e = this.e, m = this.map!, s = m.sel.settlement ?? (m.sel.region !== null ? e.settlementAt(m.sel.region) : null);
    if (m.linkFrom) {
      const p = this.livePanel(panel({ title: 'BUILD A ROAD', tone: 'olive', lamps: ['amber'], cls: 'emp-selp' })); host.append(p.el);
      p.text(`From ${m.linkFrom.name}: click another settlement on the map to lay a road to it. Esc cancels.`);
      p.text(LINK_RULE.road.desc, { dim: true });
      const k = pkey('CANCEL', () => { m.linkFrom = null; this.sigs.sel = ''; this.refresh(); }, { w: 110, tone: 'red', lamp: false }); p.body.append(k);
      return;
    }
    if (s) { this.settlementCard(host, s); return; }
    if (m.sel.region === null) { const p = this.livePanel(panel({ title: 'SELECTION', tone: 'gun', cls: 'emp-selp' })); host.append(p.el); p.text('Click a region or a settlement on the map.'); return; }
    this.regionCard(host, m.sel.region);
  }
  private settlementCard(host: HTMLElement, s: SettlementData) {
    const e = this.e, r = e.region(s.region)!, live = e.isLive(s);
    const p = this.livePanel(panel({ title: s.name.toUpperCase(), tone: live ? 'olive' : 'gun', serial: TIER_NAME[s.tier].toUpperCase(), lamps: [live ? 'green' : 'amber'], cls: 'emp-selp' })); host.append(p.el);
    const top = div('emp-sc', p.body);
    const gcol = div('emp-sc-g', top); gcol.append(glyphEl(tierGlyph(s.tier, 2), 2)); t16(TIER_NAME[s.tier].toUpperCase(), 'emp-tier', gcol);
    const a = div('emp-sc-a', top), b2 = div('emp-sc-b', top), c3 = div('emp-sc-c', top);
    a.append(para(`${live ? 'YOU ARE HERE. ' : ''}${s.how === 'crash' ? 'The crash site, where the pod came down.' : s.how === 'convoy' ? 'Founded by a settler convoy.' : 'Founded by a pod drop from the ship.'} ${r.name}, ${BIOMES[r.biome]?.name ?? r.biome}, danger ${r.danger}.${s.id === e.d.seat ? ' The SEAT of the empire.' : ''}`));
    a.append(para(TIER_RULE[s.tier].desc, { dim: true }));
    const next = TIERS[TIERS.indexOf(s.tier) + 1];
    const nx = status('', 'info'); a.append(nx.el);
    const rows: Record<string, Kv> = {};
    for (const [k, l, u] of [['pop', 'Population', ''], ['workers', 'Workers', ''], ['bld', 'Buildings', ''], ['hap', 'Happiness', '%'], ['food', 'Food', 'meals'], ['pow', 'Power', 'kW'], ['gar', 'Garrison', 'units']] as [string, string, string][]) { rows[k] = kv(l, '-', { unit: u }); b2.append(rows[k].el); }
    c3.append(section('OUTPUT', 'PER MIN'));
    const outp = div('emp-prod', c3);
    c3.append(section('IN STORE'));
    const stock = div('emp-stock', c3);
    const sh = status('', 'ok'); c3.append(sh.el);
    let lastO = '#', lastS = '#';
    this.onLive(p.body, () => {
      rows.pop.set(Math.round(s.pop)); rows.workers.set(s.workers); rows.bld.set(s.buildings); rows.hap.set(Math.round(s.happiness), { bar: s.happiness / 100 }); rows.food.set(s.food); rows.pow.set(`${s.power.gen} / ${s.power.draw}`); rows.gar.set(s.garrison);
      if (next) {
        const R = TIER_RULE[next], charter = (next === 'city' || next === 'capital') && !e.has('empire:city'), seat = next === 'capital' && s.id !== e.d.seat;
        nx.set(seat ? 'The top tier here: only the seat of the empire becomes the Capital (MAKE SEAT).' : charter ? `Next: ${TIER_NAME[next].toUpperCase()} needs the CITY CHARTER (skill tree) and ${R.pop} population, ${R.bld} buildings.` : `Next: ${TIER_NAME[next].toUpperCase()} at ${R.pop} population (${Math.round(s.pop)} now) and ${R.bld} buildings (${s.buildings} now).`, seat || charter ? 'warn' : 'info');
      } else nx.set('The highest tier: the Capital of the empire.', 'ok');
      const o = e.topProd(s, 4), ok = o.map((x) => x.join(':')).join(',');
      if (ok !== lastO) { lastO = ok; outp.textContent = ''; if (!o.length) outp.append(para('No output yet.', { dim: true })); for (const [id, v] of o) outp.append(this.itemRow(id, `+${v}`, '/min')); }
      const st = Object.entries(s.stock).filter(([, n]) => n >= 1).sort((x, y) => y[1] - x[1]).slice(0, 10), sk = st.map((x) => x[0] + Math.floor(x[1])).join(',');
      if (sk !== lastS) { lastS = sk; stock.textContent = ''; if (!st.length) stock.append(para('The stores are empty.', { dim: true })); for (const [id, n] of st) { const c = div('emp-bc', stock); c.append(iconImg(id, 32)); t16(fmt(n), 'emp-bc-n', c); bindTip(c, () => ({ title: nm(id), rows: [['In store', Math.floor(s.stock[id] ?? 0)]], desc: ITEMS[id]?.desc })); } }
      sh.set(s.short.length ? `Short of ${s.short.map(nm).join(', ')}` : 'Nothing short', s.short.length ? 'warn' : 'ok');
    });
    // actions
    const act = div('emp-act', p.body), msg = status('', 'info'); msg.el.classList.add('emp-msg');
    const key = (label: string, why: () => string, fn: () => string | void, tip: string, tone: 'cream' | 'olive' | 'red' | 'yellow' = 'cream') => {
      const k = pkey(label, () => { const w = why(); if (w) { this.deny(w, k); return; } const r = fn(); if (r) this.deny(r, k); else { pop(k); this.sigs.sel = ''; this.refresh(); } }, { w: 150, tone, lamp: 'amber' });
      act.append(k); bindTip(k, () => { const w = why(); return { title: label, desc: tip, status: w ? [w, 'warn'] : ['Ready', 'ok'] }; });
      return k;
    };
    key('GO THERE', () => e.canTravel(s.id), () => { void travelTo(e, s, this); }, 'Travel to this settlement: its region is loaded and you take control there. This one keeps running on its own.', 'olive');
    key('BUILD ROAD', () => e.lockWords('empire:road') ?? (e.d.settlements.length < 2 ? 'Found a second settlement first' : ''), () => { this.map!.linkFrom = s; uiSfx('select', 0.5); }, 'Lay a road from here to another settlement: click it on the map. Convoys on a trade route need a road or rail.');
    key('MAKE SEAT', () => (s.id === e.d.seat ? 'Already the seat' : TIERS.indexOf(s.tier) < 2 ? 'Only a City can become the seat' : ''), () => { e.d.seat = s.id; e.log(`${s.name} is the new seat of the empire`, 'good'); e.changed(); }, 'Move the seat of government here: only the seat can grow into the Capital.');
    if (this.flash && performance.now() - this.flash.t < 6000) { msg.set(this.flash.text, 'warn'); p.body.append(msg.el); }
  }
  private regionCard(host: HTMLElement, region: number) {
    const e = this.e, r = e.region(region)!, known = this.map!.known(region);
    const p = this.livePanel(panel({ title: r.name.toUpperCase(), tone: 'gun', serial: known ? (BIOMES[r.biome]?.name ?? r.biome).toUpperCase() : 'UNCHARTED', lamps: ['amber'], cls: 'emp-selp' })); host.append(p.el);
    if (!known) { p.text('Uncharted ground beyond your survey. Learn PLANET SURVEY on the skill tree (RESEARCH) to chart every region of the planet.'); p.status(e.lockWords('empire:map') ?? 'Charted', 'warn'); return; }
    const top = div('emp-sc', p.body), a = div('emp-sc-a wide', top), b2 = div('emp-sc-c', top);
    const rivals = e.rivalsIn(region), pend = e.d.convoys.find((c) => (c.kind === 'settlers' || c.kind === 'drop') && c.region === region);
    a.append(para(`${BIOMES[r.biome]?.name ?? r.biome}, danger ${r.danger} of 3. ${e.sea(region) ? 'Mostly sea: a settlement here floats on pontoons among the islands.' : 'Open land.'}`));
    a.append(para(rivals.length ? `A ${rivals.map((b) => BLOC_NAME[b]).join(' and a ')} base holds this ground: settling here costs relations with ${rivals.length > 1 ? 'them' : 'it'} (less under a pact).` : 'No rival base holds this ground.', { dim: true }));
    const near = e.nearSettlements(region);
    a.append(kv('Borders your settlements', near.length ? near.map((s) => s.name).join(', ') : 'none').el);
    const trip = e.convoyTrip(region); a.append(kv('Convoy trip', trip ? `${trip.km} km, ${Math.ceil(trip.s / 60)} min` : 'out of reach').el);
    for (const b of rivals) a.append(kv(BLOC_SHORT[b], `${relationWord(e.bloc(b).relation)} (${Math.round(e.bloc(b).relation)})`, { color: e.bloc(b).treaty === 'war' ? '#ff9a7a' : undefined }).el);
    if (pend) { const st = status('', 'busy'); a.append(st.el); this.onLive(a, () => st.set(`${pend.kind === 'drop' ? 'A pod is dropping' : 'A settler convoy is on its way'}: ${Math.max(0, Math.ceil(pend.dur - pend.t))} s to go`, 'busy')); }
    // the two ways to found an outpost, each with its bill
    const src = e.convoySource(region), live = e.liveS();
    b2.append(section('SETTLER CONVOY'));
    b2.append(para(src ? `Leaves ${src.name} overland with up to 3 idle workers, building materials and ${CONVOY_FOOD} meals.` : 'Only reaches a region that borders one of your settlements.', { dim: true }));
    if (src) this.bill(src, CONVOY_COST, b2);
    const cs = status('', 'info'); b2.append(cs.el);
    const kc = pkey('SEND CONVOY', () => { const w = e.found(region, 'convoy'); if (w) this.deny(w, kc); else { pop(kc); this.sigs.sel = ''; } }, { w: 170, tone: 'olive', lamp: 'amber' }); b2.append(kc);
    b2.append(section('POD DROP'));
    b2.append(para(`The MERIDIAN drops a fresh pod anywhere: ${DROP_COST.credits} credits, ${DROP_COST.standing} standing and its parts.`, { dim: true }));
    if (live) this.bill(live, DROP_ITEMS, b2);
    const ds = status('', 'info'); b2.append(ds.el);
    const kd = pkey('POD DROP', () => { const w = e.found(region, 'drop'); if (w) this.deny(w, kd); else { pop(kd); this.sigs.sel = ''; } }, { w: 170, tone: 'yellow', lamp: 'amber' }); b2.append(kd);
    this.onLive(b2, () => {
      const wc = e.canFound(region, 'convoy'), wd = e.canFound(region, 'drop');
      cs.set(wc || `Ready: ${trip?.km ?? 0} km, about ${Math.ceil((trip?.s ?? 0) / 60)} min, ${Math.min(3, e.idleSettlers().length)} settlers`, wc ? 'warn' : 'ok');
      ds.set(wd || 'Ready: touchdown 30 s after launch', wd ? 'warn' : 'ok');
    });
    if (this.flash && performance.now() - this.flash.t < 6000) { const msg = status(this.flash.text, 'bad'); p.body.append(msg.el); }
  }

  // ================================================================== the tabs (right)
  private buildTab() {
    const host = this.col!.tabBody; this.clearPanels(host);
    if (this.tab === 'settlements') this.tabSettlements(host);
    else if (this.tab === 'routes') this.tabRoutes(host);
    else if (this.tab === 'diplomacy') this.tabDiplomacy(host);
    else this.tabLog(host);
  }
  private tabSettlements(host: HTMLElement) {
    const e = this.e;
    const p = this.livePanel(panel({ title: 'SETTLEMENTS', tone: 'gun', serial: `${e.d.settlements.length} OF ${e.planet.regions.length}`, lamps: ['green'], cls: 'emp-tabp' })); host.append(p.el);
    p.text('Each settlement is a region with its own works, stores, workers and troops. Click a card to find it on the map; GO to travel there.', { dim: true });
    for (const s of [...e.d.settlements].sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier) || b.pop - a.pop)) {
      const card = div('emp-card' + (e.isLive(s) ? ' live' : ''), p.body);
      const g = div('emp-card-g', card); g.append(glyphEl(tierGlyph(s.tier, 2), 2));
      const t = div('emp-card-t', card);
      const h = div('emp-card-h', t); t16(s.name.toUpperCase(), 'emp-card-nm', h); t16(e.isLive(s) ? 'LIVE' : TIER_NAME[s.tier].toUpperCase(), 'emp-card-tier' + (e.isLive(s) ? ' on' : ''), h);
      const r = e.region(s.region)!;
      t16(`${TIER_NAME[s.tier]} · ${r.name} · ${BIOMES[r.biome]?.name ?? r.biome}`, 'emp-card-s', t);
      const nums = div('emp-card-k', t);
      const pop = kv('Pop', Math.round(s.pop)), hap = kv('Happy', Math.round(s.happiness), { unit: '%', bar: s.happiness / 100, barCol: '#8de08a' });
      nums.append(pop.el, hap.el);
      const out = div('emp-card-o', t);
      const sh = t16('', 'emp-card-sh', t);
      let lo = '#';
      this.onLive(card, () => {
        pop.set(Math.round(s.pop)); hap.set(Math.round(s.happiness), { bar: s.happiness / 100 });
        const o = e.topProd(s, 3), k = o.map((x) => x.join(':')).join(',');
        if (k !== lo) { lo = k; out.textContent = ''; if (!o.length) t16('no output yet', 'emp-dim', out); for (const [id, v] of o) { const c = div('emp-oc', out); c.append(iconImg(id, 32)); t16(`+${v}`, '', c); } }
        sh.textContent = s.short.length ? `SHORT: ${s.short.map(nm).join(', ').toUpperCase()}` : '';
      });
      card.addEventListener('click', (ev) => { if ((ev.target as HTMLElement).closest('.kkey')) return; this.map!.sel = { region: s.region, settlement: s }; this.map!.focus(s.region); uiSfx('select', 0.5); this.sigs.sel = ''; this.refresh(); });
      const go = pkey('GO', () => { const w = e.canTravel(s.id); if (w) this.deny(w, go); else void travelTo(e, s, this); }, { w: 60, h: 30, tone: 'olive', lamp: false });
      if (!e.isLive(s)) card.append(go);
      bindTip(go, () => ({ title: `GO TO ${s.name.toUpperCase()}`, desc: 'Load its region and take control there.', status: e.canTravel(s.id) ? [e.canTravel(s.id), 'warn'] : ['Ready', 'ok'] }));
    }
    const pend = e.d.convoys.filter((c) => c.kind === 'settlers' || c.kind === 'drop');
    if (pend.length) {
      p.section('ON THE WAY');
      for (const c of pend) { const st = status('', 'busy'); p.body.append(st.el); this.onLive(st.el, () => st.set(`${c.kind === 'drop' ? 'Pod drop' : 'Settler convoy'} to ${e.region(c.region!)?.name}: ${Math.max(0, Math.ceil(c.dur - c.t))} s`, 'busy')); }
    }
    p.section('TIERS');
    for (const t of TIERS) p.kv(TIER_NAME[t], t === 'outpost' ? 'start' : `${TIER_RULE[t].pop} pop, ${TIER_RULE[t].bld} bld`, { title: TIER_RULE[t].desc });
  }
  private tabRoutes(host: HTMLElement) {
    const e = this.e;
    const p = this.livePanel(panel({ title: 'ROADS AND RAIL', tone: 'gun', serial: `${e.d.links.length} LINES`, lamps: ['green'], cls: 'emp-tabp' })); host.append(p.el);
    p.text('Settlements joined by a road or rail can trade. Lay a road from a settlement card (BUILD ROAD), then upgrade it to rail here.', { dim: true });
    if (!e.d.links.length) p.status(e.lockWords('empire:road') ?? 'No roads yet: pick a settlement and BUILD ROAD', 'info');
    for (const l of e.d.links) this.linkRow(p, l);
    p.section('TRADE ROUTES');
    if (!e.d.routes.length) p.status(e.lockWords('empire:trade') ?? 'No trade routes yet: set one up below', 'info');
    for (const r of e.d.routes) {
      const A = e.settlement(r.from), B = e.settlement(r.to); if (!A || !B) continue;
      const row = div('emp-route', p.body);
      row.append(iconImg(r.item, 32));
      const t = div('emp-route-t', row);
      t16(`${r.amount} ${nm(r.item).toUpperCase()}`, 'emp-route-h', t);
      t16(`${A.name} > ${B.name}`, 'emp-route-s', t);
      const st = t16('', 'emp-route-st', t);
      this.onLive(row, () => { const pa = e.path(r.from, r.to); st.textContent = r.note ? r.note : `${pa ? LINK_RULE[pa.kind].name : '-'} · ${r.moved} moved · next in ${Math.max(0, Math.ceil(r.t))} s`; st.classList.toggle('warn', !!r.note); });
      const keys = div('emp-route-k', row);
      const on = pkey(r.on ? 'ON' : 'OFF', () => e.setRoute(r.id, { on: !r.on }), { w: 50, h: 28, tone: r.on ? 'olive' : 'gun', lamp: false });
      const sw = pkey('SWAP', () => e.setRoute(r.id, { from: r.to, to: r.from }), { w: 58, h: 28, tone: 'cream', lamp: false });
      const x = pkey('X', () => e.removeRoute(r.id), { w: 34, h: 28, tone: 'red', lamp: false });
      bindTip(on, () => ({ title: 'ON / OFF', desc: 'Pause or run this route.' })); bindTip(sw, () => ({ title: 'SWAP', desc: 'Send the goods the other way.' })); bindTip(x, () => ({ title: 'REMOVE', desc: 'Delete this trade route.' }));
      keys.append(on, sw, x);
    }
    // the new-route form: from, to, item, amount
    p.section('NEW ROUTE');
    const S = e.d.settlements, f = this.form;
    if (S.length < 2) { p.text('Found a second settlement to trade between them.', { dim: true }); return; }
    if (!S.some((s) => s.id === f.from)) f.from = (e.liveS() ?? S[0]).id;
    if (!S.some((s) => s.id === f.to) || f.to === f.from) f.to = S.find((s) => s.id !== f.from)!.id;
    const A = e.settlement(f.from)!, items = Object.entries(A.stock).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (!items.includes(f.item)) f.item = items[0] ?? '';
    const cyc = <T,>(arr: T[], cur: T, d: number) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
    const line = (label: string, value: string, prev: () => void, next: () => void, ic?: HTMLElement) => {
      const r = div('emp-form', p.body); t16(label, 'emp-form-l', r);
      r.append(pkey('<', () => { prev(); this.refresh(); }, { w: 34, h: 28, tone: 'cream', lamp: false }));
      const v = div('emp-form-v', r); if (ic) v.append(ic); t16(value, '', v);
      r.append(pkey('>', () => { next(); this.refresh(); }, { w: 34, h: 28, tone: 'cream', lamp: false }));
    };
    const ids = S.map((s) => s.id);
    line('FROM', A.name.toUpperCase(), () => { f.from = cyc(ids, f.from, -1); this.sigs.tab = ''; }, () => { f.from = cyc(ids, f.from, 1); this.sigs.tab = ''; });
    line('TO', e.settlement(f.to)!.name.toUpperCase(), () => { f.to = cyc(ids.filter((i) => i !== f.from), f.to, -1); }, () => { f.to = cyc(ids.filter((i) => i !== f.from), f.to, 1); });
    if (items.length) line('ITEM', nm(f.item).toUpperCase(), () => { f.item = cyc(items, f.item, -1); }, () => { f.item = cyc(items, f.item, 1); }, iconImg(f.item, 32));
    else p.text(`${A.name} has nothing in store to send.`, { dim: true });
    line('AMOUNT', `${f.amount} PER TRIP`, () => { f.amount = Math.max(1, f.amount - (f.amount > 10 ? 5 : 1)); }, () => { f.amount = Math.min(60, f.amount + (f.amount >= 10 ? 5 : 1)); });
    const pa = e.path(f.from, f.to);
    p.status(pa ? `Joined by ${LINK_RULE[pa.kind].name.toLowerCase()}: ${pa.km} km, a trip every ${LINK_RULE[pa.kind].period} s, up to ${LINK_RULE[pa.kind].load} a load` : 'Not joined yet: the route waits until a road or rail is open between them', pa ? 'ok' : 'warn');
    const add = pkey('ADD ROUTE', () => { const w = items.length ? e.addRoute(f.from, f.to, f.item, f.amount) : 'Nothing to send'; if (w) this.deny(w, add); else pop(add); }, { w: 150, tone: 'olive', lamp: 'amber' });
    p.body.append(add);
    bindTip(add, () => ({ title: 'ADD ROUTE', desc: 'Convoys (road) or trains (rail) carry this item on a schedule, as long as the source has it.', status: e.lockWords('empire:trade') ? [e.lockWords('empire:trade')!, 'warn'] : ['Ready', 'ok'] }));
  }
  private linkRow(p: Panel, l: LinkData) {
    const e = this.e, A = e.settlement(l.a), B = e.settlement(l.b); if (!A || !B) return;
    const row = div('emp-route', p.body);
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32; cv.className = 'emp-ln'; const c = cv.getContext('2d')!;
    c.fillStyle = '#08090c'; c.fillRect(2, 13, 28, 6); c.fillStyle = l.kind === 'rail' ? '#8e9190' : '#d8ac5b';
    if (l.kind === 'rail') { c.fillRect(2, 14, 28, 4); c.fillStyle = '#4472ad'; for (let x = 4; x < 30; x += 6) c.fillRect(x, 14, 2, 4); } else for (let x = 3; x < 30; x += 7) c.fillRect(x, 14, 4, 4);
    row.append(cv);
    const t = div('emp-route-t', row);
    t16(`${LINK_RULE[l.kind].name.toUpperCase()} · ${l.km} KM`, 'emp-route-h', t);
    t16(`${A.name} - ${B.name}`, 'emp-route-s', t);
    const st = t16('', 'emp-route-st', t);
    this.onLive(row, () => { st.textContent = l.built < 1 ? `Being built: ${Math.round(l.built * 100)} %, ${Math.ceil((1 - l.built) * l.dur)} s left` : `Open: ${LINK_RULE[l.kind].load} a load every ${LINK_RULE[l.kind].period} s`; });
    if (l.kind === 'road') {
      const k = pkey('TO RAIL', () => { const w = e.buildLink(l.a, l.b, 'rail'); if (w) this.deny(w, k); else pop(k); }, { w: 90, h: 28, tone: 'cream', lamp: false });
      div('emp-route-k', row).append(k);
      bindTip(k, () => { const w = e.canLink(l.a, l.b, 'rail'); return { title: 'UPGRADE TO RAIL', desc: LINK_RULE.rail.desc, rows: Object.entries(e.linkBill(A, B, 'rail')).map(([spec, n]) => [nm(e.pick(e.liveS(), spec) ?? spec), n] as [string, number]), status: w ? [w, 'warn'] : ['Ready', 'ok'] }; });
    }
  }
  private tabDiplomacy(host: HTMLElement) {
    const e = this.e;
    const intro = this.livePanel(panel({ title: 'DIPLOMACY', tone: 'gun', serial: 'BLOC DESK', lamps: ['green', 'amber'], cls: 'emp-tabp emp-dip0' })); host.append(intro.el);
    intro.text('Two rival human blocs hold most of the planet with their robot programmes. Settling on their ground strains relations; gifts, kept deals and pacts mend them. A pact makes their machines stand down in your regions; at war they raid your settlements.', { dim: true });
    const lw = e.lockWords('empire:diplomacy'); if (lw) intro.status(lw, 'warn');
    for (const b of ['soviet', 'prc'] as BlocId[]) {
      const B = e.bloc(b);
      const p = this.livePanel(panel({ title: BLOC_NAME[b].toUpperCase(), tone: b === 'soviet' ? 'dark' : 'steel', serial: TREATY_WORD[B.treaty].toUpperCase(), lamps: [B.treaty === 'war' ? 'red' : B.treaty === 'pact' ? 'green' : 'amber'], cls: 'emp-tabp emp-bloc' })); host.append(p.el);
      const top = div('emp-bl', p.body); top.append(glyphEl(blocGlyph(b, 3), 1));
      const tx = div('emp-bl-t', top); tx.append(para(BLOC_DESC[b], { dim: true }));
      const rel: Meter = meter('RELATIONS', (B.relation + 100) / 200, { w: 170, col: B.relation < -25 ? 'red' : B.relation > 15 ? 'green' : 'amber', value: `${Math.round(B.relation) > 0 ? '+' : ''}${Math.round(B.relation)}` });
      p.body.append(rel.el);
      const word = kv('Standing', relationWord(B.relation)), treaty = kv('Treaty', TREATY_WORD[B.treaty], { color: B.treaty === 'war' ? '#ff9a7a' : B.treaty === 'pact' ? '#9ae0a0' : undefined });
      const held = e.planet.regions.filter((r) => e.rivalsIn(r.id).includes(b)).length, onTheirs = e.d.settlements.filter((s) => e.rivalsIn(s.region).includes(b)).length;
      p.body.append(word.el, treaty.el, kv('Regions with their bases', held).el, kv('Your settlements on their ground', onTheirs, { color: onTheirs ? '#ffd89a' : undefined }).el);
      const dl = kv('Trade deal', '-'); p.body.append(dl.el);
      this.onLive(p.body, () => {
        rel.set((B.relation + 100) / 200, `${Math.round(B.relation) > 0 ? '+' : ''}${Math.round(B.relation)}`); word.set(relationWord(B.relation));
        dl.set(B.deal ? `${B.deal.giveN} ${nm(B.deal.give)} for ${B.deal.getN} ${nm(B.deal.get)}, next in ${Math.max(0, Math.ceil(B.deal.t))} s (${B.deal.kept} kept, ${B.deal.missed} missed)` : 'none');
      });
      const act = div('emp-act', p.body);
      const key = (label: string, why: () => string, fn: () => string, tip: string, tone: 'cream' | 'olive' | 'red' | 'yellow' = 'cream') => {
        const k = pkey(label, () => { const w = fn(); if (w) this.deny(w, k); else pop(k); }, { w: 128, h: 32, tone, lamp: false });
        bindTip(k, () => { const w = why(); return { title: label, desc: tip, status: w ? [w, 'warn'] : ['Ready', 'ok'] }; }); act.append(k);
      };
      key(`GIFT ${GIFT_CR} CR`, () => e.canGift(b), () => e.gift(b), `Send ${GIFT_CR} credits: relations rise (less with each gift in a short time).`);
      if (B.treaty === 'war') key(`PEACE ${PEACE_CR} CR`, () => e.canPeace(b), () => e.peace(b), `Pay ${PEACE_CR} credits of reparations to end the war.`, 'olive');
      else {
        key(B.treaty === 'pact' ? 'PACT SIGNED' : 'SIGN PACT', () => e.canPact(b), () => e.pact(b), 'A non-aggression pact: their machines stop attacking your settlements and units. Needs Cordial relations (20).', 'olive');
        key('DECLARE WAR', () => e.canWar(b), () => e.war(b), 'War: no trade, raids on your settlements near their ground, and their programmes push harder in your region. Breaking a pact costs far more relations.', 'red');
      }
      p.section('TRADE DEALS', `EVERY ${DEAL_PERIOD / 60} MIN`);
      if (B.deal) { const k = pkey('CANCEL DEAL', () => { e.cancelDeal(b); }, { w: 140, h: 30, tone: 'red', lamp: false }); p.body.append(k); }
      else BLOC_TRADE[b].forEach((o, i) => {
        const give = e.pick(e.liveS(), o.get) ?? o.get.split('|')[0], get = e.pick(null, o.give) ?? o.give.split('|')[0];
        const row = div('emp-deal', p.body);
        const g1 = div('emp-oc', row); g1.append(iconImg(give, 32)); t16(`${o.getN}`, '', g1);
        t16('FOR', 'emp-dim', row);
        const g2 = div('emp-oc', row); g2.append(iconImg(get, 32)); t16(`${o.giveN}`, '', g2);
        const k = pkey('OFFER', () => { const w = e.deal(b, i); if (w) this.deny(w, k); else pop(k); }, { w: 80, h: 30, tone: 'cream', lamp: false }); row.append(k);
        bindTip(row, () => ({ title: `${o.getN} ${nm(give)} FOR ${o.giveN} ${nm(get)}`, desc: `Every ${DEAL_PERIOD / 60} minutes the seat (or the settlement you are in) sends ${o.getN} ${nm(give)}; ${o.giveN} ${nm(get)} arrive 40 s later. A kept delivery warms relations; three missed ones end the deal.`, status: e.canDeal(b, i) ? [e.canDeal(b, i), 'warn'] : ['They will take it', 'ok'] }));
      });
    }
  }
  private tabLog(host: HTMLElement) {
    const e = this.e;
    const p = this.livePanel(panel({ title: 'EMPIRE LOG', tone: 'gun', serial: `SOL ${e.sol()}`, lamps: ['green'], cls: 'emp-tabp' })); host.append(p.el);
    if (!e.d.log.length) p.text('Nothing has happened yet.', { dim: true });
    for (const l of e.d.log.slice(0, 40)) {
      const r = div('emp-log', p.body); t16(`SOL ${1 + Math.floor(l.t / SOL_S)}`, 'emp-log-t', r);
      const st = status(l.text, l.kind === 'good' ? 'ok' : l.kind === 'bad' ? 'bad' : l.kind === 'warn' ? 'warn' : 'info'); r.append(st.el);
    }
  }
  private legend(host: HTMLElement) {
    const item = (cv: HTMLCanvasElement, label: string, tip: string) => { const r = div('emp-lg', host); r.append(cv); t16(label, '', r); bindTip(r, () => ({ title: label, desc: tip })); };
    for (const t of TIERS) item(glyphEl(tierGlyph(t, 1), 2), TIER_NAME[t].toUpperCase(), TIER_RULE[t].desc);
    item(glyphEl(blocGlyph('you', 1), 2), 'SEAT', 'The seat of the empire (only it can become the Capital).');
    item(glyphEl(blocGlyph('soviet', 1), 2), 'CONCORD', BLOC_DESC.soviet);
    item(glyphEl(blocGlyph('prc', 1), 2), 'CONSORTIUM', BLOC_DESC.prc);
    const line = (rail: boolean) => { const cv = document.createElement('canvas'); cv.width = 24; cv.height = 12; const c = cv.getContext('2d')!; c.fillStyle = '#08090c'; c.fillRect(0, 3, 24, 6); c.fillStyle = rail ? '#8e9190' : '#d8ac5b'; if (rail) { c.fillRect(0, 4, 24, 4); c.fillStyle = '#4472ad'; for (let x = 1; x < 24; x += 6) c.fillRect(x, 4, 2, 4); } else for (let x = 1; x < 24; x += 7) c.fillRect(x, 4, 4, 4); return cv; };
    item(line(false), 'ROAD', LINK_RULE.road.desc); item(line(true), 'RAIL', LINK_RULE.rail.desc);
    item(glyphEl(unitGlyph('settlers', 1), 2), 'SETTLERS', 'A settler convoy on its way to found an outpost.');
    item(glyphEl(unitGlyph('pod', 1), 2), 'POD', 'A pod dropping from the MERIDIAN.');
    item(glyphEl(unitGlyph('convoy', 1), 2), 'CONVOY', 'Goods on a trade route by road.');
    const hk = div('emp-lg-k', host); hk.append(keyHint('DRAG', 'turn'), keyHint('CLICK', 'pick'), keyHint('1-4', 'tabs'), keyHint('ESC', 'back'));
  }
}
const TAB_INFO: Record<Tab, string> = {
  settlements: 'Every settlement: tier, population, happiness, top output and what is short.',
  routes: 'Roads and rail between settlements, the trade routes that run on them, and a form for a new route.',
  diplomacy: 'The Eurasian Concord and the Pacific Consortium: relations, trade deals, pacts and war.',
  log: 'What happened in the empire, newest first.',
};

let css = false;
function injectCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.emp { position: fixed; inset: 0; z-index: 9350; box-sizing: border-box; padding: 12px 18px 16px; display: flex; flex-direction: column; gap: 10px; color: #e8e2c8;
  background: radial-gradient(ellipse at 50% 40%, rgba(16,20,24,.94), rgba(6,7,9,.98)); }
body.emp-on .h7-root, body.emp-on .hud { visibility: hidden; }
.emp-hd { display: flex; align-items: center; gap: 18px; flex: none; height: 92px; }
.emp-tt { display: flex; flex-direction: column; gap: 2px; flex: none; width: 300px; }
.emp-sub { color: #c8c0a0; white-space: nowrap; }
.emp-strip { flex: 1; min-width: 0; }
.emp-strip .kp-body { display: flex; justify-content: space-between; gap: 6px; }
.emp-chip { display: flex; align-items: center; gap: 8px; padding: 2px 4px; cursor: default; }
.emp-chip-ic { image-rendering: pixelated; flex: none; }
.emp-chip-t { display: flex; flex-direction: column; }
.emp-chip-nr { display: flex; align-items: baseline; gap: 6px; }
.emp-chip-n { color: #fff0c0; line-height: 32px; height: 32px; overflow: hidden; }
.emp-chip-u { color: #a8a890; white-space: nowrap; }
.emp-chip-l { color: #d8a848; font-size: 16px; white-space: nowrap; }
.emp-ics { display: flex; gap: 14px; align-items: flex-end; flex: none; }
.emp-ics .k7-fi { width: 96px; }
.emp-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 350px minmax(0, 1fr) 452px; gap: 16px; }
.emp-l, .emp-c, .emp-r { min-height: 0; display: flex; flex-direction: column; gap: 12px; }
.emp-led { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.emp-led .kp-body, .emp-tabp .kp-body { overflow-y: auto; overflow-x: hidden; min-height: 0; padding-right: 6px; scrollbar-width: thin; scrollbar-color: #6a6250 #101214; }
.emp-led .kp-body { flex: 1; }
.emp-mapp { flex: none; }
.emp-mapw { display: flex; justify-content: center; }
.emp-map-cv { display: block; image-rendering: pixelated; touch-action: none; }
.emp-leg { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; align-items: center; }
.emp-lg { display: flex; align-items: center; gap: 5px; color: #e8dcb8; }
.emp-lg canvas { image-rendering: pixelated; }
.emp-lg-k { margin-left: auto; display: flex; }
.emp-sel { flex: 1; min-height: 0; display: flex; }
.emp-selp { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.emp-selp > .kp-body { flex: 1; min-height: 0; overflow-y: auto; }
.emp-sc { display: grid; grid-template-columns: auto minmax(0, 1.25fr) 210px minmax(0, 1fr); gap: 16px; align-items: start; }
.emp-sc:has(.wide) { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.emp-sc-g { display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 6px; }
.emp-sc-g canvas { image-rendering: pixelated; }
.emp-tier { color: #ffe39a; }
.emp-act { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
.emp-prod { display: flex; flex-direction: column; gap: 2px; }
.emp-ir { display: flex; align-items: center; gap: 8px; }
.emp-ii { image-rendering: pixelated; flex: none; }
.emp-ir-n { color: #e8e2c8; flex: 1; }
.emp-ir-v { color: #9ae0a0; }
.emp-stock, .emp-bill { display: flex; flex-wrap: wrap; gap: 4px 6px; }
.emp-bc { display: flex; align-items: center; gap: 2px; padding: 1px 4px 1px 1px; background: rgba(0,0,0,.28); box-shadow: inset 0 0 0 1px rgba(200,190,150,.18); }
.emp-bc .emp-bc-n { color: #f2ecd4; }
.emp-bc.short .emp-bc-n { color: #ff9a7a; }
.emp-bill { margin: 4px 0; }
.emp-tabs { display: flex; gap: 6px; flex: none; }
.emp-tabb { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #6a6250 #101214; }
.emp-tabp { flex: none; }
.emp-tabb > .emp-tabp:only-child { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.emp-tabb > .emp-tabp:only-child > .kp-body { flex: 1; }
.emp-card { position: relative; display: grid; grid-template-columns: 68px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 6px 6px 4px; margin: 6px 0; cursor: pointer;
  background: linear-gradient(180deg, rgba(40,44,46,.7), rgba(18,20,22,.7)); box-shadow: inset 0 0 0 1px #050607, inset 1px 1px 0 rgba(220,210,170,.16), 0 2px 0 #050607; }
.emp-card:hover { background: linear-gradient(180deg, rgba(58,60,56,.8), rgba(26,28,28,.8)); }
.emp-card.live { box-shadow: inset 0 0 0 1px #050607, inset 0 0 0 2px rgba(240,200,90,.55), 0 2px 0 #050607; }
.emp-card-g { display: grid; place-items: center; }
.emp-card-g canvas { image-rendering: pixelated; }
.emp-card-h { display: flex; justify-content: space-between; gap: 6px; }
.emp-card-nm { color: #ffe7a8; }
.emp-card-tier { color: #b8b8a0; }
.emp-card-tier.on { color: #9ae0a0; }
.emp-card-s { color: #9aa294; }
.emp-card-k { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.emp-card-o { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.emp-card-sh { color: #ffb08a; }
.emp-oc { display: flex; align-items: center; gap: 2px; color: #9ae0a0; }
.emp-dim { color: #8a9284; }
.emp-route { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 8px; align-items: center; margin: 6px 0; padding: 4px; background: rgba(0,0,0,.22); box-shadow: inset 0 0 0 1px rgba(200,190,150,.14); }
.emp-route-t { min-width: 0; }
.emp-route-t > .k7-t16 { white-space: normal; overflow-wrap: anywhere; }
.emp-ln { image-rendering: pixelated; }
.emp-route-h { color: #ffe7a8; }
.emp-route-s { color: #c8c4ae; }
.emp-route-st { color: #9ae0a0; }
.emp-route-st.warn { color: #ffd89a; }
.emp-route-k { display: flex; gap: 6px; }
.emp-form { display: grid; grid-template-columns: 80px 34px minmax(0, 1fr) 34px; gap: 6px; align-items: center; margin: 4px 0; }
.emp-form-l { color: #d8a848; }
.emp-form-v { display: flex; align-items: center; gap: 6px; justify-content: center; color: #f2ecd4; min-height: 32px; background: rgba(0,0,0,.35); box-shadow: inset 0 0 0 1px #050607; }
.emp-bl { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; }
.emp-bl canvas { image-rendering: pixelated; }
.emp-deal { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
.emp-log { display: grid; grid-template-columns: 64px 1fr; gap: 6px; align-items: start; }
.emp-log-t { color: #d8a848; margin-top: 6px; }
.emp-msg { margin-top: 6px; }
`;
  document.head.append(s);
}

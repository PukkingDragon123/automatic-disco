// RESEARCH, in 2D: a cork board. The latest specimen is a foxed fibre card pinned on the left (its painted sprite
// big, its name, what the scan paid); the data reserves are four chipped enamel tokens under it; the tech index is a
// field of small pinned cards on the right, filtered by kind; the selected tech and the station queue sit under it.
// Icons first, numbers where they matter, few words.
import { el } from '../../ui/kit';
import { sfx } from '../../audio/audio';
import { csfx } from '../../ui/cineAudio';
import { TECHS, TECH, TECH_KINDS, DATA_KINDS, DATA_NAME, type TechKind, type Tech, type DataKind } from '../tech';
import type { Research } from '../research';
import { iconURL } from './icons';
import { fmtTime } from '../util';
import type { TabPage } from '../../ui/skillTree';
import type { Engine } from '../../app/engine';
import { ScannerVignette, photograph, type SpecimenKind } from './vignettes';

const DATA_ICON: Record<DataKind, string> = { bio: 'dna', geo: 'pick', energy: 'arcs', xeno: 'sensor' };
const KIND_ICON: Record<string, string> = { species: 'claw', plant: 'sprout', ore: 'pick', crystal: 'core', vent: 'steam', ruin: 'sensor' };
const KIND_TAB: Record<TechKind, string> = { building: 'factory', recipe: 'flask', logic: 'nodes', tool: 'wrench', arm: 'arm', drone: 'drone', pod: 'shield' };
/** a tech's data cost as icon + number pairs */
export const chips = (cost: Tech['cost'], data?: Record<DataKind, number>) => DATA_KINDS.filter((k) => cost[k]).map((k) => { const s = !!data && data[k] < (cost[k] ?? 0); return `<span class="pp-row" style="gap:0"><img class="pp-ico" src="${iconURL(DATA_ICON[k], s ? 'dim' : 'phos')}" style="width:24px;height:24px"><span class="pp-t${s ? ' pp-red' : ''}">${cost[k]}</span></span>`; }).join('');

export class ResearchPage implements TabPage {
  readonly el: HTMLElement;
  private kind: TechKind = 'building'; private sel: string | null = null;
  private spec: HTMLElement; private tokens: HTMLElement; private index: HTMLElement; private detail: HTMLElement; private kinds: HTMLElement;
  private sig = ''; private specKey = ''; private photo: string | null = null; private lab: ScannerVignette | null = null;
  constructor(readonly R: Research, readonly host: Record<string, any>, readonly engine?: Engine) {
    this.el = el('div', '');
    el('div', 'pp-board', this.el);
    this.spec = el('div', 'pp-fibre pp-col', this.el); this.spec.style.cssText = 'left:64px;top:118px;width:560px;gap:8px';
    el('div', 'pp-pin', this.el).style.cssText = 'left:328px;top:104px';
    this.tokens = el('div', 'pp-row', this.el); this.tokens.style.cssText = 'position:absolute;left:56px;top:690px;width:600px;gap:14px;flex-wrap:wrap';
    this.kinds = el('div', 'pp-row', this.el); this.kinds.style.cssText = 'position:absolute;left:700px;top:104px;gap:6px';
    this.index = el('div', '', this.el); this.index.style.cssText = 'position:absolute;left:700px;top:186px;right:40px;bottom:296px;display:grid;grid-template-columns:repeat(auto-fill, 268px);grid-auto-rows:128px;gap:22px 16px;align-content:start;overflow-y:auto;padding-top:12px;scrollbar-width:none';
    this.detail = el('div', 'pp-fibre pp-row', this.el); this.detail.style.cssText = 'left:700px;right:40px;bottom:32px;height:240px;gap:20px;align-items:flex-start';
    const first = TECHS.find((q) => !R.unlocked(q.id) && !R.why(q.id));
    if (first) { this.kind = first.kind; this.sel = first.id; }
    this.build();
  }
  private state(t: Tech): 'known' | 'active' | 'queued' | 'ready' | 'locked' {
    const R = this.R;
    if (R.unlocked(t.id)) return 'known';
    if (R.queue[0] === t.id) return 'active';
    if (R.queue.includes(t.id)) return 'queued';
    return R.why(t.id) ? 'locked' : 'ready';
  }
  private signature() { const R = this.R; return [this.kind, this.sel, R.queue.join(','), R.known().length, DATA_KINDS.map((k) => Math.floor(R.data[k])).join(','), R.log.length, R.stations().powered, Math.floor(R.headFrac() * 40)].join('|'); }
  update() { const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); } }
  key(e: KeyboardEvent) {
    if (e.key === 'Enter' && this.sel) { this.queue(this.sel); return true; }
    const i = TECH_KINDS.findIndex((k) => k.k === this.kind);
    if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') { this.kind = TECH_KINDS[(i + (e.key.toLowerCase() === 'q' ? -1 : 1) + TECH_KINDS.length) % TECH_KINDS.length].k; this.sig = ''; csfx('page', 0.4); return true; }
    return false;
  }
  private queue(id: string) {
    const R = this.R;
    if (R.queue.includes(id)) { if (R.queue[0] !== id) { R.bump(id); csfx('page', 0.5); } return; }
    if (R.enqueue(id)) { csfx('thud', 0.7, 1.1); sfx('click'); } else sfx('deny');
    this.sig = '';
  }
  private build() {
    const R = this.R;
    // ---------------- the specimen card
    const e = R.log[0], S = this.spec; S.innerHTML = '';
    el('div', 'pp-s', S, 'LAST SPECIMEN');
    const top = el('div', 'pp-row', S); top.style.gap = '20px';
    this.shoot();
    if (this.photo) { el('img', 'pp-ico', top).setAttribute('src', this.photo); (top.lastChild as HTMLElement).style.cssText = 'width:240px;height:180px;box-shadow:0 0 0 3px #2b2622'; }
    else { el('img', 'pp-ico', top).setAttribute('src', iconURL(e ? KIND_ICON[e.kind] ?? 'lens' : 'lens', e ? 'phos' : 'dim')); (top.lastChild as HTMLElement).style.cssText = 'width:192px;height:192px'; }
    const nm = el('div', 'pp-col', top); nm.style.gap = '10px';
    el('div', 'pp-hx', nm, e ? e.name : 'NONE YET');
    if (e) { const got = el('div', 'pp-row', nm); got.style.gap = '16px'; for (const k of DATA_KINDS) if (e.data[k]) el('span', 'pp-row', got, `<img class="pp-ico" src="${iconURL(DATA_ICON[k], 'phos')}" style="width:48px;height:48px"><span class="pp-hl">+${Math.round(e.data[k]!)}</span>`); }
    else el('div', 'pp-t', nm, 'Scan a creature, plant, ore or ruin.');
    el('div', 'pp-rule', S);
    const strip = el('div', 'pp-row', S); strip.style.gap = '6px';
    for (const x of R.log.slice(1, 9)) { const im = el('img', 'pp-ico', strip); im.src = iconURL(KIND_ICON[x.kind] ?? 'lens', 'phos'); im.style.cssText = 'width:48px;height:48px'; im.title = x.name; }
    // ---------------- the data tokens and the stations
    const T = this.tokens; T.innerHTML = '';
    for (const k of DATA_KINDS) {
      const t = el('div', 'pp-enamel pp-col', T); t.style.cssText = 'position:relative;width:138px;align-items:center;gap:0';
      el('img', 'pp-ico', t).setAttribute('src', iconURL(DATA_ICON[k], R.data[k] > 0 ? 'phos' : 'dim')); (t.lastChild as HTMLElement).style.cssText = 'width:48px;height:48px';
      el('div', 'pp-hx', t, String(Math.floor(R.data[k])));
      el('div', 'pp-s', t, DATA_NAME[k]);
    }
    const s = R.stations();
    const st = el('div', 'pp-enamel pp-row', T); st.style.cssText = 'position:relative;gap:10px';
    st.innerHTML = `<img class="pp-ico" src="${iconURL('lens', s.powered ? 'phos' : 'dim')}" style="width:48px;height:48px"><span class="pp-hl">${s.powered}/${s.n}</span><span class="pp-s">STATIONS · ${R.rate().toFixed(1)}X</span>`;
    // ---------------- kind tabs and the index cards
    const K = this.kinds; K.innerHTML = '';
    for (const k of TECH_KINDS) {
      const b = el('div', 'pp-tab' + (k.k === this.kind ? ' on' : ''), K, `<img src="${iconURL(KIND_TAB[k.k], 'phos')}"><span class="pp-s" style="color:inherit">${k.name}</span>`); b.style.marginTop = k.k === this.kind ? '6px' : '0';
      b.addEventListener('click', () => { this.kind = k.k; this.sig = ''; csfx('page', 0.4); });
    }
    const I = this.index; I.innerHTML = '';
    const order = { active: 0, queued: 1, ready: 2, locked: 3, known: 4 };
    for (const t of TECHS.filter((q) => q.kind === this.kind && !q.start).sort((a, b) => order[this.state(a)] - order[this.state(b)])) {
      const stt = this.state(t);
      const c = el('div', 'pp-note pp-col', I); c.style.cssText = `position:relative;cursor:pointer;gap:2px;${stt === 'locked' ? 'filter:grayscale(0.7) brightness(0.92)' : ''}${this.sel === t.id ? ';margin-top:-10px;margin-bottom:10px' : ''}`;
      const row = el('div', 'pp-row', c);
      el('img', 'pp-ico', row).setAttribute('src', iconURL(t.icon, stt === 'locked' ? 'dim' : 'phos')); (row.lastChild as HTMLElement).style.cssText = 'width:48px;height:48px;margin:-6px 0';
      el('div', 'pp-h' + (this.sel === t.id ? ' pp-amb' : ''), row, t.name);
      el('div', 'pp-row', c, stt === 'known' ? '<span class="pp-s pp-grn">KNOWN</span>' : stt === 'active' ? `<span class="pp-s pp-amb">${Math.round(R.headFrac() * 100)}%</span>` : stt === 'queued' ? `<span class="pp-s pp-amb">QUEUE ${R.queue.indexOf(t.id) + 1}</span>` : chips(t.cost, R.data));
      c.addEventListener('click', () => { if (this.sel === t.id && stt !== 'known' && stt !== 'locked') this.queue(t.id); else { this.sel = t.id; sfx('click'); } this.sig = ''; });
    }
    // ---------------- the selected tech and the queue
    const D = this.detail; D.innerHTML = '';
    const t = this.sel ? TECH[this.sel] : null;
    if (t) {
      const stt = this.state(t), why = R.why(t.id), short = R.short(t.id);
      el('img', 'pp-ico', D).setAttribute('src', iconURL(t.icon, 'phos')); (D.lastChild as HTMLElement).style.cssText = 'width:144px;height:144px';
      const mid = el('div', 'pp-col', D); mid.style.cssText = 'flex:1;gap:8px';
      el('div', 'pp-hl', mid, t.name);
      el('div', 'pp-t', mid, t.desc);
      el('div', 'pp-row', mid, `${chips(t.cost, R.data)}<span class="pp-s">${fmtTime(t.time)}</span>`).style.gap = '14px';
      if (stt !== 'known' && why) el('div', 'pp-t pp-red', mid, (R.requirementOf(t.id) ?? why).toLowerCase().replace(/^\w/, (m) => m.toUpperCase()));
      else if (stt !== 'known' && short) el('div', 'pp-t pp-amb', mid, `Needs ${short.toLowerCase()}`);
      const right = el('div', 'pp-col', D); right.style.cssText = 'gap:10px;align-items:flex-end';
      const k = el('div', 'pp-key' + (stt === 'known' || why || stt === 'active' ? ' dead' : ' hot'), right, stt === 'known' ? 'KNOWN' : stt === 'active' ? 'RUNNING' : stt === 'queued' ? 'FIRST' : 'QUEUE');
      k.addEventListener('click', () => { if (stt !== 'known' && !why) this.queue(t.id); });
      const q = el('div', 'pp-row', right); q.style.gap = '4px';
      R.queue.slice(0, 5).forEach((id, i) => { const im = el('img', 'pp-ico', q); im.src = iconURL(TECH[id].icon, 'phos'); im.style.cssText = `width:48px;height:48px;${i === 0 ? 'outline:3px solid #9a6a1a' : 'opacity:0.85'}`; im.title = TECH[id].name; im.addEventListener('click', () => { R.dequeue(id); this.sig = ''; }); });
      if (R.queue.length) { const b = el('div', 'pp-bar amb', right); b.style.width = '260px'; el('i', '', b).style.width = `calc(${R.headFrac() * 100}% - 4px)`; }
      const stall = R.stalled(); if (stall) el('div', 'pp-s pp-red', right, stall);
    }
  }
  /** photograph the newest specimen: a real render of it on the scanner table, stylised for the card */
  private shoot() {
    const e = this.R.log[0], key = e ? e.name + e.t : '';
    if (!e || !this.engine || key === this.specKey) return; this.specKey = key;
    const lab = (this.lab ??= new ScannerVignette());
    lab.auto = 0; lab.sway = 0; lab.yaw = 0.7; lab.dist = 4.2; lab.pitch = 0.22; lab.target.set(0, 1.55, 0);
    const sp = e.kind === 'species' ? (this.host.run?.reg?.list ?? []).find((s: any) => s.name === e.name) : null;
    void lab.show(e.kind as SpecimenKind, e.name, sp).then(() => new Promise((r) => setTimeout(r, 250))).then(() => {
      const c = photograph(this.engine!, lab, 640, 480); if (c) { this.photo = c.toDataURL(); this.sig = ''; }
    });
  }
  dispose() { this.lab?.dispose(); this.el.remove(); }
}

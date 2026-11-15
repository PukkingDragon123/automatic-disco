// RESEARCH: a machined analysis rig (clean pixel art, src/research/ui/rig.ts). The newest specimen sits in a scanner
// cradle behind glass (a real render of it, brought down to a short ramp) with an enamel plate naming it and what the
// scan paid; the data reserves fill four glass vials in a steel rack beside the stations dial; the tech catalogue is
// a rack of stamped plates on the right, filtered by kind keys; the research queue is a rotary card drum that turns
// when the queue moves on, next to the selected tech's plate. Icons first, numbers where they matter, few words.
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
import { Cradle, Vials, Drum } from './rig';

const DATA_ICON: Record<DataKind, string> = { bio: 'dna', geo: 'pick', energy: 'arcs', xeno: 'sensor' };
const KIND_ICON: Record<string, string> = { species: 'claw', plant: 'sprout', ore: 'pick', crystal: 'core', vent: 'steam', ruin: 'sensor' };
const KIND_TAB: Record<TechKind, string> = { building: 'factory', recipe: 'flask', logic: 'nodes', tool: 'wrench', arm: 'arm', drone: 'drone', pod: 'shield' };
/** a tech's data cost as icon + number pairs */
export const chips = (cost: Tech['cost'], data?: Record<DataKind, number>) => DATA_KINDS.filter((k) => cost[k]).map((k) => { const s = !!data && data[k] < (cost[k] ?? 0); return `<span class="pp-row" style="gap:0"><img class="pp-ico" src="${iconURL(DATA_ICON[k], s ? 'dim' : 'phos')}" style="width:24px;height:24px"><span class="pp-t${s ? ' pp-red' : ''}">${cost[k]}</span></span>`; }).join('');

export class ResearchPage implements TabPage {
  readonly el: HTMLElement;
  private kind: TechKind = 'building'; private sel: string | null = null;
  private spec: HTMLElement; private vialTags: HTMLElement; private index: HTMLElement; private detail: HTMLElement; private kinds: HTMLElement; private drumTag: HTMLElement;
  private sig = ''; private specKey = ''; private photo: string | null = null; private lab: ScannerVignette | null = null;
  private cradle = new Cradle(); private vials = new Vials(); private drum = new Drum(); private t = 0;
  constructor(readonly R: Research, readonly host: Record<string, any>, readonly engine?: Engine) {
    this.el = el('div', '');
    el('div', 'pp-board', this.el);
    const px = (c: HTMLCanvasElement, css: string) => { this.el.appendChild(c); c.style.cssText = `position:absolute;image-rendering:pixelated;${css}`; };
    px(this.cradle.cv, 'left:40px;top:100px;width:620px;height:440px');
    this.spec = el('div', 'pp-enamel pp-col', this.el); this.spec.style.cssText = 'left:40px;top:548px;width:620px;gap:6px';
    px(this.vials.cv, 'left:40px;top:740px;width:620px;height:300px');
    this.vialTags = el('div', '', this.el); this.vialTags.style.cssText = 'position:absolute;left:40px;top:960px;width:620px;height:80px';
    this.kinds = el('div', 'pp-row', this.el); this.kinds.style.cssText = 'position:absolute;left:700px;top:100px;gap:6px';
    this.index = el('div', '', this.el); this.index.style.cssText = 'position:absolute;left:700px;top:182px;right:40px;bottom:340px;display:grid;grid-template-columns:repeat(auto-fill, 268px);grid-auto-rows:120px;gap:14px 16px;align-content:start;overflow-y:auto;padding-top:10px;scrollbar-width:none';
    px(this.drum.cv, 'left:700px;top:760px;width:420px;height:280px');
    this.drumTag = el('div', 'pp-t', this.el); this.drumTag.style.cssText = 'position:absolute;left:840px;top:880px;width:206px;white-space:nowrap;overflow:hidden;color:#1e1a16;pointer-events:none';
    this.detail = el('div', 'pp-fibre pp-row', this.el); this.detail.style.cssText = 'left:1140px;right:40px;top:760px;height:280px;gap:20px;align-items:flex-start';
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
  update(dt = 1 / 60) {
    const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); }
    const R = this.R; this.t += dt;
    const live = R.queue.length > 0 && R.stations().powered > 0;
    this.cradle.draw(this.t, !!R.log[0]);
    const sel = this.sel ? TECH[this.sel] : null;
    const cap = (k: DataKind) => Math.max(40, Math.ceil(Math.max(R.data[k], sel?.cost[k] ?? 0) * 1.25 / 10) * 10);
    this.vials.draw(dt, DATA_KINDS, DATA_KINDS.map((k) => R.data[k] / cap(k)), DATA_KINDS.map((k) => (sel && sel.cost[k] && !R.unlocked(sel.id) ? sel.cost[k]! / cap(k) : null)), R.rate(), live);
    this.drum.draw(dt, R.queue, R.queue.map((id) => TECH[id]?.icon ?? 'gear'), R.headFrac());
    this.drumTag.style.visibility = Math.abs(this.drum.rot) < 0.04 && R.queue.length ? 'visible' : 'hidden';
  }
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
    // ---------------- the specimen plate under the cradle
    const e = R.log[0], S = this.spec; S.innerHTML = '';
    this.shoot();
    const top = el('div', 'pp-row', S); top.style.gap = '16px';
    el('div', 'pp-hl', top, e ? e.name : 'CRADLE EMPTY').style.flex = '1';
    if (e) for (const k of DATA_KINDS) if (e.data[k]) el('span', 'pp-row', top, `<img class="pp-ico" src="${iconURL(DATA_ICON[k], 'phos')}" style="width:48px;height:48px"><span class="pp-h">+${Math.round(e.data[k]!)}</span>`).style.gap = '2px';
    const strip = el('div', 'pp-row', S); strip.style.gap = '4px';
    if (!e) el('div', 'pp-t', strip, 'Scan a creature, plant, ore or ruin.');
    for (const x of R.log.slice(1, 11)) { const im = el('img', 'pp-ico', strip); im.src = iconURL(KIND_ICON[x.kind] ?? 'lens', 'phos'); im.style.cssText = 'width:48px;height:48px'; im.title = x.name; }
    // ---------------- the engraved plates under the vials and the dial
    const T = this.vialTags; T.innerHTML = '';
    DATA_KINDS.forEach((k, i) => {
      const t = el('div', 'pp-col', T); t.style.cssText = `position:absolute;left:${Vials.slot(i) * 2 - 60}px;width:120px;top:0;align-items:center;gap:0`;
      el('div', 'pp-row', t, `<img class="pp-ico" src="${iconURL(DATA_ICON[k], R.data[k] > 0 ? 'phos' : 'dim')}" style="width:32px;height:32px"><span class="pp-h" style="color:#f3eedf">${Math.floor(R.data[k])}</span>`).style.gap = '4px';
      el('div', 'pp-s', t, DATA_NAME[k]).style.color = '#aab1b4';
    });
    const s = R.stations();
    const d = el('div', 'pp-col', T); d.style.cssText = `position:absolute;left:${Vials.slot(4) * 2 - 60}px;width:120px;top:0;align-items:center;gap:0`;
    el('div', 'pp-h', d, `${s.powered}/${s.n}`).style.color = '#f3eedf';
    el('div', 'pp-s', d, `STATIONS ${R.rate().toFixed(1)}X`).style.color = '#aab1b4';
    // the head card's name beside the drum's reading line
    const head = R.queue[0] ? TECH[R.queue[0]] : null;
    this.drumTag.textContent = head ? head.name : '';
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
      if (stt === 'queued' || stt === 'active') { const x = el('div', 'pp-key', right, 'REMOVE'); x.addEventListener('click', () => { R.dequeue(t.id); csfx('page', 0.5); this.sig = ''; }); }
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
      const c = photograph(this.engine!, lab, 640, 480); if (c) { this.photo = c.toDataURL(); this.cradle.setPhoto(this.photo); this.sig = ''; }
    });
  }
  dispose() { this.lab?.dispose(); this.el.remove(); }
}

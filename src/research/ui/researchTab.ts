// The RESEARCH tab: the four data reserves and the scan log on the left, the tech catalogue by kind in the middle
// (known, researching, queued, available, locked with the reason), the selected tech and the station queue on the
// right. Click a tile to select it; click again (or QUEUE) to put it on the station's queue.
import { el } from '../../ui/kit';
import { sfx } from '../../audio/audio';
import { csfx } from '../../ui/cineAudio';
import { TECHS, TECH, TECH_KINDS, DATA_KINDS, DATA_NAME, DATA_FROM, type TechKind, type Tech, type DataKind } from '../tech';
import { PATH } from '../mastery';
import type { Research } from '../research';
import { BLUEPRINT } from '../upgrades';
import { iconURL } from './icons';
import { fmtTime } from '../util';
import type { TabPage } from '../../ui/skillMastery';

const DATA_ICON: Record<DataKind, string> = { bio: 'dna', geo: 'pick', energy: 'arcs', xeno: 'sensor' };
const KIND_ICON: Record<string, string> = { species: 'dna', plant: 'sprout', ore: 'pick', crystal: 'core', vent: 'steam', ruin: 'sensor' };
export const chips = (cost: Tech['cost'], data?: Record<DataKind, number>) => DATA_KINDS.filter((k) => cost[k]).map((k) => `<span class="pt-chip${data && data[k] < (cost[k] ?? 0) ? ' short' : ''}"><span class="k">${DATA_NAME[k]}</span>${cost[k]}</span>`).join('');

export class ResearchPage implements TabPage {
  readonly el: HTMLElement;
  private kind: TechKind = 'building'; private sel: string | null = null;
  private left: HTMLElement; private mid: HTMLElement; private right: HTMLElement; private grid!: HTMLElement;
  private sig = ''; private t = 0;
  constructor(readonly R: Research) {
    this.el = el('div', 'pt-page pr');
    this.left = el('div', 'pt-col', this.el); this.mid = el('div', 'pt-col', this.el); this.right = el('div', 'pt-col', this.el);
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
  private signature() { const R = this.R; return [this.kind, this.sel, R.queue.join(','), R.known().length, DATA_KINDS.map((k) => Math.floor(R.data[k])).join(','), R.log.length, R.stations().powered, Math.floor(R.headFrac() * 50)].join('|'); }
  update(dt: number) { this.t += dt; const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); } }
  key(e: KeyboardEvent) {
    if (e.key === 'Enter' && this.sel) { this.queue(this.sel); return true; }
    const i = TECH_KINDS.findIndex((k) => k.k === this.kind);
    if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') { this.kind = TECH_KINDS[(i + (e.key.toLowerCase() === 'q' ? -1 : 1) + TECH_KINDS.length) % TECH_KINDS.length].k; this.sig = ''; csfx('relay', 0.4); return true; }
    return false;
  }
  private queue(id: string) {
    const R = this.R;
    if (R.queue.includes(id)) { if (R.queue[0] !== id) { R.bump(id); csfx('relay', 0.6); } return; }
    if (R.enqueue(id)) { csfx('thud', 0.7, 1.1); sfx('click'); } else sfx('deny');
    this.sig = '';
  }
  private build() {
    const R = this.R;
    // ---------------- left: reserves, stations, scan log
    const L = this.left; L.innerHTML = '';
    el('div', 'pt-h', L, 'DATA RESERVES');
    for (const k of DATA_KINDS) {
      const g = el('div', 'pr-gauge', L);
      const im = el('img', 'pt-ico', g); im.src = iconURL(DATA_ICON[k], R.data[k] > 0 ? 'lit' : 'phos');
      el('div', 'nm', g, DATA_NAME[k]);
      el('div', 'v', g, String(Math.floor(R.data[k])).padStart(3, '0'));
      el('div', 'f', g, DATA_FROM[k]);
    }
    const s = R.stations(), rate = R.rate();
    const sb = el('div', 'pt-box' + (s.powered ? '' : ' hot'), L);
    el('div', 'pt-h', sb, 'RESEARCH STATIONS');
    el('div', 'pt-txt', sb, s.n ? `${s.n} built · ${s.powered} powered · speed ${rate.toFixed(2)}x` : '<span class="pt-warn">NONE BUILT</span>');
    if (!s.n) el('div', 'pt-txt dim', sb, 'Build a Research Station [B] to work the queue.');
    else if (!s.powered) el('div', 'pt-txt pt-amb', sb, 'No power reaches the station.');
    el('div', 'pt-h', L, 'SCAN LOG');
    const lg = el('div', 'pt-list', L); lg.style.flex = '1';
    if (!R.log.length) el('div', 'pt-txt dim', lg, 'Scan species, plants, ore, vents and ruins. The first look at anything pays the most.');
    for (const e of R.log.slice(0, 14)) {
      const row = el('div', 'pt-log', lg);
      const im = el('img', 'pt-ico', row); im.src = iconURL(KIND_ICON[e.kind] ?? 'lens', 'phos'); im.style.width = im.style.height = '24px';
      el('span', '', row, `<b>${e.name}</b> ${DATA_KINDS.filter((k) => e.data[k]).map((k) => `+${e.data[k]} ${DATA_NAME[k]}`).join(' ')}`);
    }
    // ---------------- middle: the catalogue
    const Mi = this.mid; Mi.innerHTML = '';
    const head = el('div', 'pr-kinds', Mi);
    for (const k of TECH_KINDS) {
      const n = TECHS.filter((q) => q.kind === k.k), known = n.filter((q) => R.unlocked(q.id)).length;
      const b = el('div', 'pr-kind' + (k.k === this.kind ? ' on' : ''), head, `${k.name} ${known}/${n.length}`);
      b.addEventListener('click', () => { this.kind = k.k; this.sig = ''; csfx('relay', 0.4); });
    }
    this.grid = el('div', 'pr-grid pt-list', Mi); this.grid.style.flex = '1';
    const list = TECHS.filter((q) => q.kind === this.kind && !q.start);
    const order = { active: 0, queued: 1, ready: 2, locked: 3, known: 4 };
    list.sort((a, b) => order[this.state(a)] - order[this.state(b)]);
    for (const t of list) {
      const st = this.state(t);
      const c = el('div', `pr-tile ${st}${this.sel === t.id ? ' sel' : ''}`, this.grid);
      const im = el('img', 'pt-ico', c); im.src = iconURL(t.icon, st === 'known' ? 'amber' : st === 'locked' ? 'dim' : 'phos');
      el('div', 'nm', c, t.name);
      el('div', 'cs', c, st === 'known' ? '' : chips(t.cost, R.data));
      const sl = el('div', 'st', c);
      if (st === 'known') sl.textContent = 'KNOWN';
      else if (st === 'active') { sl.innerHTML = `RESEARCHING`; const b = el('div', 'pt-bar', sl); el('i', '', b).style.width = `calc(${R.headFrac() * 100}% - 4px)`; }
      else if (st === 'queued') sl.textContent = `QUEUED #${R.queue.indexOf(t.id) + 1}`;
      else if (st === 'locked') sl.textContent = (R.requirementOf(t.id) ?? R.why(t.id) ?? '').toUpperCase();
      else sl.textContent = `${fmtTime(t.time)} AT ONE STATION`;
      c.addEventListener('click', () => { if (this.sel === t.id && st !== 'known' && st !== 'locked') this.queue(t.id); else { this.sel = t.id; sfx('click'); } this.sig = ''; });
    }
    // ---------------- right: the card and the queue
    const Rt = this.right; Rt.innerHTML = '';
    const t = this.sel ? TECH[this.sel] : null;
    if (t) {
      const st = this.state(t);
      el('div', 'pt-h', Rt, `${TECH_KINDS.find((k) => k.k === t.kind)?.name} · ${PATH[t.path].short}`);
      const hd = el('div', '', Rt); hd.style.cssText = 'display:flex;gap:14px;align-items:center';
      const im = el('img', 'pt-ico', hd); im.src = iconURL(t.icon, st === 'known' ? 'amber' : 'lit'); im.style.cssText = 'width:72px;height:72px;background:#071209;box-shadow:inset 0 0 0 2px #264a32';
      const nm = el('div', '', hd); el('div', 'pt-txt big', nm, `<span style="font-family:Jersey;font-size:30px;line-height:30px">${t.name}</span>`);
      el('div', 'pt-txt dim', nm, st === 'known' ? 'KNOWN' : `${fmtTime(t.time)} of station work`);
      el('div', 'pt-txt big', Rt, t.desc);
      const bx = el('div', 'pt-box', Rt);
      if (t.cost && Object.keys(t.cost).length) el('div', 'pt-txt', bx, `COST&nbsp; ${chips(t.cost, R.data)}`);
      if (t.needs?.length) el('div', 'pt-txt' + (t.needs.every((n) => R.unlocked(n)) ? ' dim' : ' pt-amb'), bx, `NEEDS ${t.needs.map((n) => TECH[n].name.toUpperCase()).join(', ')}`);
      if (t.mastery) el('div', 'pt-txt dim', bx, `${PATH[t.mastery[0]].name} LV ${t.mastery[1]}`);
      if (t.blueprint) el('div', 'pt-txt pt-plus', bx, `Blueprint: ${BLUEPRINT[t.blueprint]?.name}. Built at the Upgrader from real parts.`);
      if (t.buildings?.length) el('div', 'pt-txt pt-plus', bx, `Opens ${t.buildings.length} building${t.buildings.length > 1 ? 's' : ''} in the build menu`);
      if (t.grants?.length && !t.blueprint) el('div', 'pt-txt pt-plus', bx, `Opens ${t.grants.filter((g) => !g.startsWith('cap.')).length} catalogue entr${t.grants.length > 1 ? 'ies' : 'y'}`);
      const short = R.short(t.id), why = R.why(t.id);
      const lbl = st === 'known' ? 'KNOWN' : st === 'active' ? 'RESEARCHING' : st === 'queued' ? 'MOVE TO FRONT' : why ? 'LOCKED' : 'QUEUE  [ENTER]';
      const k = el('div', 'pt-key' + (st === 'known' || why || st === 'active' ? ' dead' : ' arm'), Rt, lbl); k.style.alignSelf = 'flex-start';
      if (why && st !== 'known') el('div', 'pt-warn', Rt, (R.requirementOf(t.id) ?? why).toUpperCase());
      else if (short && st !== 'known') el('div', 'pt-txt pt-amb', Rt, `Waiting on data: ${short}`);
      k.addEventListener('click', () => { if (st !== 'known' && !why) this.queue(t.id); });
    }
    const qb = el('div', 'pt-col', Rt); qb.style.marginTop = 'auto';
    el('div', 'pt-h', qb, `STATION QUEUE · ${R.queue.length}`);
    if (!R.queue.length) el('div', 'pt-txt dim', qb, 'Empty. Select a tech and queue it.');
    const stall = R.stalled();
    R.queue.slice(0, 6).forEach((id, i) => {
      const q = TECH[id], row = el('div', 'pr-q' + (i === 0 ? ' head' : ''), qb);
      el('div', 'no', row, String(i + 1));
      const im = el('img', 'pt-ico', row); im.src = iconURL(q.icon, i === 0 ? 'lit' : 'phos');
      const mm = el('div', '', row); el('div', 'nm', mm, q.name);
      if (i === 0) { if (stall) el('div', 'pt-warn', mm, stall); else { const b = el('div', 'pt-bar', mm); el('i', '', b).style.width = `calc(${R.headFrac() * 100}% - 4px)`; } }
      const x = el('div', 'x', row, '×'); x.title = 'Remove'; x.addEventListener('click', (e) => { e.stopPropagation(); R.dequeue(id); this.sig = ''; sfx('click'); });
    });
  }
  dispose() { this.el.remove(); }
}

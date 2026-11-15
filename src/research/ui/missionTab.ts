// MISSION, in 2D: a brushed, riveted steel wall with the Meridian's TELEGRAPH PLATE on it, a chipped enamel sign that
// carries the open directives (an icon for the kind, the ask in one line, the deadline in big numerals, a progress
// bar, the drop it pays in item icons, TRANSMIT), and a smaller enamel plate with the colony's standing: three strike
// stamps (the third recalls the mission) and the reputation gauge. Icons first, few words.
import { el } from '../../ui/kit';
import { sfx } from '../../audio/audio';
import { csfx } from '../../ui/cineAudio';
import { SHIP, type Mission, type Quota } from '../mission';
import { itemIcon } from '../../factory/items';
import { fmtTime, gtime } from '../util';
import { iconURL } from './icons';
import type { TabPage } from '../../ui/skillTree';
import type { Game } from '../../game/game';
import type { Engine } from '../../app/engine';
import { australPhoto } from './vignettes';

/** the carrier trace on the telegraph plate (a clean oscilloscope line) */
export function waveDraw(cv: HTMLCanvasElement, t: number, k = 1, col = '#2a4a78') {
  const r = cv.getBoundingClientRect(), W = Math.max(10, Math.floor(r.width)), H = Math.max(10, Math.floor(r.height));
  if (cv.width !== W) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d')!; g.clearRect(0, 0, W, H); g.fillStyle = col;
  let py = H / 2;
  for (let x = 0; x < W; x += 2) {
    const u = x / W, burst = Math.sin(u * 9 - t * 2.3) > 0.55 ? 1 : 0.25;
    const y = H / 2 + (Math.sin(u * 80 + t * 11) * 0.5 + Math.sin(u * 23 - t * 5) * 0.35) * H * 0.4 * burst * k;
    const a = Math.min(py, y), b = Math.max(py, y); g.fillRect(x, Math.floor(a), 2, Math.max(2, Math.ceil(b - a))); py = y;
  }
}
const KIND_ICON: Record<string, string> = { data: 'dna', items: 'crate', milestone: 'factory' };

export class MissionPage implements TabPage {
  readonly el: HTMLElement;
  private plate: HTMLElement; private standing: HTMLElement; private wave: HTMLCanvasElement;
  private sig = ''; private t = 0;
  private photo: string | null = null;
  constructor(readonly M: Mission, readonly g: Game, engine?: Engine) {
    this.el = el('div', '');
    el('div', 'pp-plate', this.el);
    this.plate = el('div', 'pp-enamel pp-col', this.el); this.plate.style.cssText = 'left:430px;right:70px;top:110px;gap:12px';
    this.standing = el('div', 'pp-enamel pp-col', this.el); this.standing.style.cssText = 'left:44px;top:110px;width:340px;gap:12px';
    this.wave = document.createElement('canvas');
    if (engine) void australPhoto(engine).then((u) => { this.photo = u; this.sig = ''; });
    this.build();
  }
  private now() { return gtime(this.g); }
  private signature() { const M = this.M; return [M.quotas.map((q) => q.id + q.state + Math.floor(M.progress(q).k * 30) + Math.floor((q.due - this.now()) / 1)).join(','), M.strikes, Math.round(M.rep)].join('|'); }
  update(dt: number) { this.t += dt; const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); } try { waveDraw(this.wave, this.t, this.M.recalled ? 0.1 : 1, this.M.recalled ? '#a8332a' : '#2a4a78'); } catch { /* layout */ } }
  private quota(q: Quota, parent: HTMLElement) {
    const M = this.M, pr = M.progress(q), left = q.due - this.now(), open = q.state === 'open';
    const row = el('div', 'pp-row', parent); row.style.cssText = `gap:22px;align-items:center;${open ? '' : 'opacity:0.55'}`;
    el('img', 'pp-ico', row).setAttribute('src', iconURL(KIND_ICON[q.kind], 'phos')); (row.lastChild as HTMLElement).style.cssText = 'width:96px;height:96px';
    const mid = el('div', 'pp-col', row); mid.style.cssText = 'flex:1;gap:6px';
    el('div', 'pp-hl', mid, q.title);
    if (open) { const bar = el('div', 'pp-bar' + (pr.ok ? ' amb' : ''), mid); el('i', '', bar).style.width = `calc(${Math.min(1, pr.k) * 100}% - 4px)`; }
    const rw = el('div', 'pp-row', mid); rw.style.gap = '12px';
    for (const id in q.reward.items) { const s = el('span', 'pp-row', rw); s.style.gap = '2px'; const im = el('img', 'pp-ico', s); try { im.src = itemIcon(id); } catch { /* icon */ } im.style.cssText = 'width:32px;height:32px'; el('span', 'pp-h', s, `${q.reward.items[id]}`); s.title = id; }
    el('span', 'pp-h pp-grn', rw, `+${q.reward.rep}`);
    const right = el('div', 'pp-col', row); right.style.cssText = 'align-items:flex-end;gap:8px;min-width:190px';
    if (open) {
      el('div', 'pp-hx' + (left < 120 ? ' pp-red' : ''), right, fmtTime(left));
      const k = el('div', 'pp-key' + (pr.ok ? ' hot' : ' dead'), right, 'TRANSMIT');
      k.addEventListener('click', () => { if (M.transmit(q.id)) { csfx('thud', 0.7); sfx('done'); this.sig = ''; } else sfx('deny'); });
    } else el('div', 'pp-stamp', right, q.state === 'met' ? 'RECEIVED' : 'STRIKE');
  }
  private build() {
    const M = this.M;
    // the telegraph plate
    const P = this.plate; P.innerHTML = '';
    const head = el('div', 'pp-row', P); head.style.gap = '18px';
    el('img', 'pp-ico', head).setAttribute('src', iconURL('arcs', 'phos')); (head.lastChild as HTMLElement).style.cssText = 'width:48px;height:48px';
    el('div', 'pp-hl', head, SHIP).style.whiteSpace = 'nowrap';
    head.appendChild(this.wave); this.wave.style.cssText = 'flex:1;min-width:0;width:0;height:40px;image-rendering:pixelated';
    if (this.photo) { const im = el('img', 'pp-ico', head); im.src = this.photo; im.style.cssText = 'flex:none;width:256px;height:144px;box-shadow:0 0 0 3px #1c2c48'; }
    el('div', 'pp-rule', P);
    const open = M.open();
    if (!open.length) el('div', 'pp-hl', P, M.recalled ? 'RECALLED' : `NEXT IN ${fmtTime(M.next - this.now())}`);
    for (const q of open) { this.quota(q, P); el('div', 'pp-rule', P); }
    for (const q of M.quotas.filter((x) => x.state !== 'open').slice(-2).reverse()) { this.quota(q, P); el('div', 'pp-rule', P); }
    // the standing
    const S = this.standing; S.innerHTML = '';
    el('div', 'pp-s', S, 'STRIKES');
    const st = el('div', 'pp-row', S); st.style.gap = '8px';
    for (let i = 0; i < 3; i++) { const s = el('div', 'pp-stamp', st, i < M.strikes ? 'X' : '&nbsp;'); s.style.cssText = `min-width:72px;text-align:center;${i < M.strikes ? '' : 'opacity:0.3'}`; }
    el('div', 'pp-rule', S);
    el('div', 'pp-s', S, 'STANDING');
    el('div', 'pp-row', S, `<span class="pp-hx" style="flex:1">${Math.round(M.rep)}</span><img class="pp-ico" src="${iconURL('shield', 'phos')}" style="width:48px;height:48px">`);
    const bar = el('div', 'pp-bar amb', S); el('i', '', bar).style.width = `calc(${M.rep}% - 4px)`;
    el('div', 'pp-rule', S);
    const met = M.quotas.filter((q) => q.state === 'met').length, miss = M.quotas.filter((q) => q.state === 'missed').length;
    el('div', 'pp-row', S, `<span class="pp-hl pp-grn">${met}</span><span class="pp-s">MET</span><span class="pp-hl pp-red" style="margin-left:18px">${miss}</span><span class="pp-s">MISSED</span>`).style.gap = '8px';
  }
  dispose() { this.el.remove(); }
}

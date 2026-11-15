// MISSION: the UNAA Austral in orbit over the planet (ShipVignette), and the directives it sends as a TELEGRAM: each
// open quota typed on the form with its deadline, progress, the drop it pays and a TRANSMIT key. The standing of the
// colony is a pinned note: three strike boxes (a red stamp in each miss; the third recalls the mission), reputation.
import { el } from '../../ui/kit';
import { sfx } from '../../audio/audio';
import { csfx } from '../../ui/cineAudio';
import { SHIP, type Mission, type Quota } from '../mission';
import { itemIcon } from '../../factory/items';
import { itemName, fmtTime, gtime } from '../util';
import { ShipVignette } from './vignettes';
import { Callouts } from './callouts';
import type { TabPage } from '../../ui/skillTree';
import type { Game } from '../../game/game';
import type * as THREE from 'three';

/** a carrier trace drawn in ink (the telegram's receipt strip) */
export function waveDraw(cv: HTMLCanvasElement, t: number, k = 1, col = '#2b2622') {
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

export class MissionPage implements TabPage {
  readonly el: HTMLElement;
  readonly vig: ShipVignette;
  private tel: HTMLElement; private note: HTMLElement; private calls: Callouts; private shipTag: HTMLElement;
  private sig = '';
  constructor(readonly M: Mission, readonly g: Game, renderer: THREE.WebGLRenderer) {
    this.vig = new ShipVignette(renderer);
    this.el = el('div', '');
    const stage = el('div', 'pp-stage', this.el); this.vig.bind(stage);
    this.vig.margins = [380, 640];
    this.calls = new Callouts(this.el, this.vig);
    this.shipTag = el('div', 'pp-call', this.el); this.calls.add(this.shipTag, this.vig.anchors.ship, -60, -120);
    this.note = el('div', 'pp-note pp-col', this.el); this.note.style.cssText = 'left:28px;top:110px;width:340px';
    this.tel = el('div', 'pp-card pp-col', this.el); this.tel.style.cssText = 'right:28px;top:104px;width:610px;max-height:calc(100vh - 140px)';
    this.build();
  }
  private now() { return gtime(this.g); }
  private signature() { const M = this.M; return [M.quotas.map((q) => q.id + q.state + Math.floor(M.progress(q).k * 30) + Math.floor((q.due - this.now()) / 1)).join(','), M.strikes, Math.round(M.rep)].join('|'); }
  update() { const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); } this.calls.update(); }
  private quota(q: Quota, parent: HTMLElement) {
    const M = this.M, pr = M.progress(q), left = q.due - this.now(), open = q.state === 'open';
    const box = el('div', 'pp-col', parent); box.style.gap = '4px';
    const head = el('div', 'pp-row', box);
    el('span', 'pp-s', head, `NO. ${String(q.no).padStart(2, '0')} · ${q.kind === 'data' ? 'DATA' : q.kind === 'items' ? 'CARGO' : 'MILESTONE'}`).style.flex = '1';
    el('span', open && left < 120 ? 'pp-h pp-red' : 'pp-h', head, open ? `T-${fmtTime(left)}` : q.state === 'met' ? 'RECEIVED' : 'MISSED');
    el('div', 'pp-hl', box, q.title);
    el('div', 'pp-t pp-dim', box, q.brief);
    if (open) {
      const bar = el('div', 'pp-bar' + (pr.ok ? ' amb' : ''), box); el('i', '', bar).style.width = `calc(${Math.min(1, pr.k) * 100}% - 4px)`;
      el('div', 'pp-t', box, pr.text.toLowerCase().replace(/^\w/, (m) => m.toUpperCase()));
    }
    const rw = el('div', 'pp-row', box); rw.style.flexWrap = 'wrap';
    el('span', 'pp-s', rw, 'DROP');
    for (const id in q.reward.items) { const s = el('span', 'pp-row', rw); s.style.gap = '2px'; const im = el('img', 'pp-ico', s); try { im.src = itemIcon(id); } catch { /* icon */ } im.style.cssText = 'width:24px;height:24px'; el('span', 'pp-t', s, `${q.reward.items[id]} ${itemName(id)}`); }
    if (open) {
      const k = el('div', 'pp-key' + (pr.ok ? ' hot' : ' dead'), box, 'TRANSMIT'); k.style.alignSelf = 'flex-start';
      k.addEventListener('click', () => { if (M.transmit(q.id)) { csfx('thud', 0.7); sfx('done'); this.sig = ''; } else sfx('deny'); });
    } else el('div', 'pp-stamp', box, q.state === 'met' ? 'RECEIVED' : 'STRIKE').style.alignSelf = 'flex-start';
  }
  private build() {
    const M = this.M;
    this.shipTag.innerHTML = `<div class="pp-col" style="gap:0"><span class="pp-h">${SHIP}</span><span class="pp-s">HIGH ORBIT · RELAY ${M.recalled ? 'CLOSED' : 'OPEN'}</span></div>`;
    // the telegram
    const T = this.tel; T.innerHTML = '';
    el('div', 'pp-row', T, `<span class="pp-hl" style="flex:1">TELEGRAM</span><span class="pp-s">${SHIP} · DIRECTIVES</span>`);
    el('div', 'pp-rule', T);
    const open = M.open();
    if (!open.length) el('div', 'pp-t', T, M.recalled ? 'The mission has been recalled.' : `Next directive in ${fmtTime(M.next - this.now())}.`);
    for (const q of open) { this.quota(q, T); el('div', 'pp-rule', T); }
    const past = M.quotas.filter((q) => q.state !== 'open').slice(-2).reverse();
    for (const q of past) { this.quota(q, T); el('div', 'pp-rule', T); }
    // the standing note
    const N = this.note; N.innerHTML = '';
    el('div', 'pp-h', N, 'STANDING');
    const strikes = el('div', 'pp-row', N);
    for (let i = 0; i < 3; i++) { const s = el('div', 'pp-stamp', strikes, i < M.strikes ? 'X' : '&nbsp;'); s.style.minWidth = '64px'; s.style.textAlign = 'center'; if (i >= M.strikes) s.style.opacity = '0.35'; }
    el('div', 'pp-t' + (M.strikes >= 2 ? ' pp-red' : ''), N, M.recalled ? 'Recalled. The colony is abandoned.' : M.strikes >= 2 ? 'One more miss and the UNAA recalls the mission.' : 'Three misses and the UNAA recalls the mission.');
    el('div', 'pp-rule', N);
    el('div', 'pp-row', N, `<span class="pp-h" style="flex:1">REPUTATION</span><span class="pp-hx">${Math.round(M.rep)}</span>`);
    const bar = el('div', 'pp-bar amb', N); el('i', '', bar).style.width = `calc(${M.rep}% - 4px)`;
    el('div', 'pp-t pp-dim', N, 'Higher standing, bigger drops.');
  }
  dispose() { this.calls.clear(); this.vig.dispose(); this.el.remove(); }
}

// The MISSION tab: the link to the Austral (a live carrier trace), the open quotas with their deadlines, progress,
// rewards and TRANSMIT keys, and the standing of the colony: three strike lamps (three misses and the UNAA recalls
// the mission), the reputation meter, and the log of quotas met and missed.
import { el } from '../../ui/kit';
import { sfx } from '../../audio/audio';
import { csfx } from '../../ui/cineAudio';
import { SHIP, type Mission, type Quota } from '../mission';
import { itemIcon } from '../../factory/items';
import { itemName, fmtTime, gtime } from '../util';
import type { TabPage } from '../../ui/skillMastery';
import type { Game } from '../../game/game';

export function waveDraw(cv: HTMLCanvasElement, t: number, k = 1, col = '#7fb88a') {
  const r = cv.getBoundingClientRect(), dpr = Math.max(1, Math.min(2, devicePixelRatio || 1));
  const W = Math.max(10, Math.floor(r.width)), H = Math.max(10, Math.floor(r.height));
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(20, 38, 27, 0.6)'; for (let x = 0; x < W; x += 16) g.fillRect(x, 0, 1, H); g.fillRect(0, Math.floor(H / 2), W, 1);
  g.fillStyle = col;
  let py = H / 2;
  for (let x = 0; x < W; x += 2) {
    const u = x / W, burst = Math.sin(u * 9 - t * 2.3) > 0.55 ? 1 : 0.25;
    const y = H / 2 + (Math.sin(u * 80 + t * 11) * 0.5 + Math.sin(u * 23 - t * 5) * 0.35 + Math.sin(u * 173 + t * 31) * 0.15) * H * 0.38 * burst * k;
    const a = Math.min(py, y), b = Math.max(py, y); g.fillRect(x, Math.floor(a), 2, Math.max(2, Math.ceil(b - a))); py = y;
  }
}

export class MissionPage implements TabPage {
  readonly el: HTMLElement;
  private wave: HTMLCanvasElement; private list: HTMLElement; private side: HTMLElement;
  private sig = ''; private t = 0;
  constructor(readonly M: Mission, readonly g: Game) {
    this.el = el('div', 'pt-page ps');
    const w = el('div', 'ps-wave', this.el);
    const tt = el('div', '', w); el('div', 'k', tt, 'UPLINK · CARRIER LOCKED · 2.2 GHZ'); el('div', 't', tt, `${SHIP} · MISSION DIRECTIVES`);
    this.wave = el('canvas', '', w);
    this.list = el('div', 'pt-col pt-list', this.el);
    this.side = el('div', 'pt-col', this.el);
  }
  private now() { return gtime(this.g); }
  private signature() { const M = this.M; return [M.quotas.map((q) => q.id + q.state + Math.floor(M.progress(q).k * 40) + Math.floor((q.due - this.now()) / 1)).join(','), M.strikes, Math.round(M.rep)].join('|'); }
  update(dt: number) { this.t += dt; waveDraw(this.wave, this.t, this.M.recalled ? 0.1 : 1, this.M.recalled ? '#cc6252' : '#7fb88a'); const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); } }
  private card(q: Quota, parent: HTMLElement) {
    const M = this.M, pr = M.progress(q), left = q.due - this.now(), open = q.state === 'open';
    const c = el('div', 'ps-q ' + q.state + (open && left < 120 ? ' urgent' : ''), parent);
    el('div', 'no', c, `${String(q.no).padStart(2, '0')}<small>${q.kind === 'data' ? 'DATA' : q.kind === 'items' ? 'CARGO' : 'MILESTONE'}</small>`);
    const mm = el('div', '', c);
    el('div', 'tt', mm, q.title);
    el('div', 'br', mm, q.brief);
    if (open) {
      const bar = el('div', 'pt-bar' + (pr.ok ? ' amb' : ''), mm); el('i', '', bar).style.width = `calc(${Math.min(1, pr.k) * 100}% - 4px)`;
      el('div', 'pt-txt', mm, pr.text).style.marginTop = '6px';
    }
    const rw = el('div', 'rw', mm);
    el('span', 'pt-txt dim', rw, 'DROP');
    for (const id in q.reward.items) { const ch = el('span', 'pt-chip', rw); const im = el('img', '', ch); try { im.src = itemIcon(id); } catch { /* icon */ } ch.append(`${q.reward.items[id]} ${itemName(id)}`); }
    el('span', 'pt-chip', rw, `REP +${q.reward.rep}`);
    const d = el('div', 'due', c);
    if (open) {
      d.innerHTML = `${fmtTime(left)}<small>T-MINUS</small>`;
      const k = el('div', 'pt-key' + (pr.ok ? ' arm' : ' dead'), d, 'TRANSMIT'); k.style.marginTop = '12px';
      k.addEventListener('click', () => { if (M.transmit(q.id)) { csfx('beepHi', 0.8); csfx('thud', 0.7); sfx('done'); this.sig = ''; } else sfx('deny'); });
    } else {
      d.innerHTML = `<small>${q.state === 'met' ? (q.early ? 'MET EARLY' : 'MET') : 'MISSED'}</small>`;
      const s = el('div', 'pt-stamp', c, q.state === 'met' ? 'RECEIVED' : 'STRIKE'); s.style.right = '24px'; s.style.top = '30px'; s.style.animation = 'none';
      if (q.state === 'met') { s.style.color = '#d9a43a'; s.style.borderColor = '#d9a43a'; }
    }
  }
  private build() {
    const M = this.M;
    const L = this.list; L.innerHTML = '';
    const open = M.open();
    el('div', 'pt-h', L, `OPEN DIRECTIVES · ${open.length}`);
    if (!open.length) el('div', 'pt-txt dim', L, M.recalled ? 'The mission has been recalled.' : `Next directive in ${fmtTime(M.next - this.now())}.`);
    for (const q of open) this.card(q, L);
    const past = M.quotas.filter((q) => q.state !== 'open').slice(-4).reverse();
    if (past.length) { el('div', 'pt-h', L, 'RESOLVED'); for (const q of past) this.card(q, L); }
    // the standing
    const S = this.side; S.innerHTML = '';
    el('div', 'pt-h', S, 'MISSION STANDING');
    const sb = el('div', 'pt-box' + (M.strikes >= 2 ? ' hot' : ''), S);
    el('div', 'pt-txt', sb, 'STRIKES');
    const lamps = el('div', 'ps-lamps', sb); lamps.style.margin = '10px 0';
    for (let i = 0; i < 3; i++) el('div', 'ps-lamp' + (i < M.strikes ? ' on' : ''), lamps);
    el('div', 'pt-txt ' + (M.strikes >= 2 ? 'pt-amb' : 'dim'), sb, M.recalled ? 'RECALLED. The colony is abandoned.' : M.strikes >= 2 ? 'One more missed directive and the UNAA recalls the mission.' : 'Three missed directives and the UNAA recalls the mission.');
    const rb = el('div', 'pt-box', S);
    el('div', 'pt-txt', rb, `REPUTATION · ${Math.round(M.rep)}`);
    const meter = el('div', 'ps-rep', rb); meter.style.margin = '10px 0';
    for (let i = 0; i < 50; i++) { const s = el('div', 'seg', meter); s.style.left = `calc(${i * 2}% + 1px)`; s.style.background = i * 2 < M.rep ? (i < 15 ? '#942e25' : i < 30 ? '#98702c' : '#4a8457') : '#0f1a14'; }
    el('div', 'ndl', meter).style.left = `calc(${M.rep}% - 2px)`;
    el('div', 'pt-txt dim', rb, 'Higher standing sends bigger drops. Transmitting early earns more.');
    const lg = el('div', 'pt-box', S); lg.style.marginTop = 'auto';
    el('div', 'pt-h', lg, 'LOG');
    const met = M.quotas.filter((q) => q.state === 'met').length, miss = M.quotas.filter((q) => q.state === 'missed').length;
    el('div', 'pt-log', lg, `<b>${met}</b><span>directives met</span>`);
    el('div', 'pt-log', lg, `<b>${miss}</b><span>missed</span>`);
    el('div', 'pt-log', lg, `<b>${M.drops.length}</b><span>supply drops received</span>`);
  }
  dispose() { this.el.remove(); }
}

// The stores tutorial: four coached steps that run once, the first time a second container exists. Each is a small
// enamel card (a number, a few words, the keys) with a pixel arrow pointing at the control and a dashed ring round it;
// it moves on when the player has done it: open a store, sort or filter, drag a stack, set a priority or filter.
import type { Game } from '../../game/game';
import type { Storage } from '../../inv/storage';
import type { InvUI, InvEvent } from './grid';
import type { CrateHud } from './hud';
import { injectCrateCSS } from './style';
import { cardURL, arrowURL, ctlURL, GLYPH } from './mat';
import { sfx } from '../../audio/audio';

type Side = 'above' | 'below' | 'left' | 'right';
/** a step points at `target`; the card and its arrow stand outside `outer` (the window or the HUD the target is in) */
interface Step { say: string; keys: string[]; wait: InvEvent[]; side: Side; target: () => DOMRect | null; outer: () => DOMRect | null }
const FLAG = 'inv.tut';
const ik = () => (innerHeight >= 1000 ? 2 : 1);
export class StoresTutorial {
  private card: HTMLDivElement | null = null; private ring: HTMLDivElement | null = null; private arrow: HTMLImageElement | null = null;
  private i = -1; private raf = 0; private steps: Step[]; private doneT = 0;
  running = false;
  constructor(readonly g: Game, readonly st: Storage, readonly ui: InvUI, readonly hud: CrateHud) {
    injectCrateCSS();
    const q = (sel: string) => this.ui.wins[this.ui.wins.length - 1]?.root.querySelector(sel)?.getBoundingClientRect() ?? null;
    const union = (...rs: (DOMRect | null)[]) => { const v = rs.filter((r): r is DOMRect => !!r && r.width > 0); if (!v.length) return null; const x0 = Math.min(...v.map((r) => r.left)), y0 = Math.min(...v.map((r) => r.top)), x1 = Math.max(...v.map((r) => r.right)), y1 = Math.max(...v.map((r) => r.bottom)); return new DOMRect(x0, y0, x1 - x0, y1 - y0); };
    const win = () => { const w = this.ui.wins[this.ui.wins.length - 1]; return w ? union(w.root.getBoundingClientRect(), w.settings ? w.setEl.getBoundingClientRect() : null) : null; };
    const hudR = () => this.hud.root.getBoundingClientRect();
    this.steps = [
      { say: 'open a store', keys: ['click'], wait: ['opened'], side: 'right', target: () => this.hud.slotRect(Math.min(1, this.hud.list().length - 1)), outer: hudR },
      { say: 'sort · filter', keys: ['tabs', 'find'], wait: ['sorted', 'filtered'], side: 'above', target: () => union(q('.srt'), q('.chips'), q('.inv-search')), outer: win },
      { say: 'drag to move', keys: ['drag', 'R turn', 'right-click ½'], wait: ['moved', 'merged', 'split'], side: 'left', target: () => q('.inv-grid'), outer: win },
      { say: 'set priority', keys: ['gear'], wait: ['priority', 'filterset'], side: 'above', target: () => (this.ui.wins.some((w) => w.settings) ? q('.inv-set') : q('.gear')), outer: win },
    ];
    for (const ev of ['opened', 'sorted', 'filtered', 'split', 'moved', 'merged', 'priority', 'filterset'] as InvEvent[]) this.ui.on(ev, () => this.on(ev));
    st.on('container', () => this.check());
    this.check();
  }
  /** start once, when there are two containers to work between */
  check() {
    if (this.running || this.g.run.flags[FLAG]) return;
    if (this.st.containers.length >= 2) this.start();
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.g.run.flags[FLAG] = 1;
    this.ring = document.createElement('div'); this.ring.className = 'inv-coach-ring'; document.body.appendChild(this.ring);
    this.arrow = document.createElement('img'); this.arrow.className = 'inv-coach-arrow'; document.body.appendChild(this.arrow);
    this.card = document.createElement('div'); this.card.className = 'inv-coach'; document.body.appendChild(this.card);
    this.go(this.ui.wins.length ? 1 : 0);
    const loop = () => { this.raf = requestAnimationFrame(loop); this.place(); if (this.doneT && performance.now() > this.doneT) this.end(); };
    loop();
  }
  private go(i: number) {
    this.i = i;
    if (i >= this.steps.length) { this.finish(); return; }
    const s = this.steps[i];
    this.fill(String(i + 1), s.say, s.keys);
    sfx('click', 1.1, 0.5);
  }
  /** the card: the step's number on a dark chip, the words, the keys, a close tab */
  private fill(n: string, say: string, keys: string[]) {
    const c = this.card!, k = ik();
    c.innerHTML = `<div class="t"><b class="n">${n}</b><span class="say">${say}</span>` +
      (this.i < this.steps.length ? `<img class="skip" title="Skip" src="${ctlURL('hold', 12, 12, 0, GLYPH.close, 5)}">` : '') + '</div>' +
      (keys.length ? `<div class="keys">${keys.map((q) => `<span class="k">${q}</span>`).join('')}</div>` : '');
    c.querySelector<HTMLElement>('.skip')?.addEventListener('click', () => this.end());
    c.style.width = ''; c.style.height = ''; c.style.backgroundImage = '';
    const r = c.getBoundingClientRect(), w = Math.ceil(r.width / k), h = Math.ceil(r.height / k);
    Object.assign(c.style, { width: w * k + 'px', height: h * k + 'px', backgroundImage: `url(${cardURL(w, h, 21, true)})`, backgroundSize: `${w * k}px ${h * k}px` });
  }
  private on(ev: InvEvent) {
    if (!this.running || this.i < 0 || this.i >= this.steps.length) return;
    if (!this.steps[this.i].wait.includes(ev)) return;
    sfx('done', 1.2, 0.5);
    const at = this.i;
    setTimeout(() => { if (this.i === at) this.go(at + 1); }, 300);
  }
  private finish() {
    this.i = this.steps.length;
    this.fill('!', 'stores ready', []);
    this.doneT = performance.now() + 2600;
  }
  end() {
    cancelAnimationFrame(this.raf);
    this.card?.remove(); this.ring?.remove(); this.arrow?.remove();
    this.card = this.ring = null; this.arrow = null; this.running = false; this.doneT = 0;
  }
  /** ring the target, point the arrow at it from the step's side (or the side with room), the card behind the arrow */
  private place() {
    if (!this.card || !this.ring || !this.arrow) return;
    const k = ik(), W = innerWidth, H = innerHeight, cw = this.card.offsetWidth, ch = this.card.offsetHeight;
    const s = this.i < this.steps.length ? this.steps[this.i] : null, r = s?.target() ?? null;
    const snap = (v: number) => Math.round(v / k) * k;
    if (!s || !r) {
      this.ring.style.display = 'none'; this.arrow.style.display = 'none';
      this.card.style.left = snap((W - cw) / 2) + 'px'; this.card.style.top = snap(H * 0.28) + 'px';
      return;
    }
    const pad = 3 * k;
    Object.assign(this.ring.style, { display: '', left: snap(r.left - pad) + 'px', top: snap(r.top - pad) + 'px', width: snap(r.width + 2 * pad) + 'px', height: snap(r.height + 2 * pad) + 'px' });
    // the card stands clear of the window (or HUD) the target is in; the arrow bridges to the target's line
    const o = s.outer() ?? r, A = new DOMRect(Math.min(o.left, r.left - pad), Math.min(o.top, r.top - pad), 0, 0);
    const Ar = Math.max(o.right, r.right + pad), Ab = Math.max(o.bottom, r.bottom + pad);
    const AL = 18 * k, AT = 15 * k, gap = 4 * k;
    const fits: Record<Side, boolean> = { above: A.top - gap - AL - ch > 8, below: Ab + gap + AL + ch < H - 8, left: A.left - gap - AL - cw > 8, right: Ar + gap + AL + cw < W - 8 };
    const order: Side[] = [s.side, ...(['right', 'above', 'left', 'below'] as Side[]).filter((q) => q !== s.side)];
    const side = order.find((q) => fits[q]) ?? s.side;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let ax = 0, ay = 0, aw = AL, ah = AT, px = 0, py = 0, dir: 'l' | 'r' | 'u' | 'd' = 'd';
    if (side === 'above') { dir = 'd'; aw = AT; ah = AL; ax = cx - aw / 2; ay = A.top - gap - ah; px = cx - cw / 2; py = ay - ch + 2 * k; }
    else if (side === 'below') { dir = 'u'; aw = AT; ah = AL; ax = cx - aw / 2; ay = Ab + gap; px = cx - cw / 2; py = ay + ah - 2 * k; }
    else if (side === 'left') { dir = 'r'; ax = A.left - gap - aw; ay = cy - ah / 2; px = ax - cw + 2 * k; py = cy - ch / 2; }
    else { dir = 'l'; ax = Ar + gap; ay = cy - ah / 2; px = ax + aw - 2 * k; py = cy - ch / 2; }
    px = Math.max(8, Math.min(W - cw - 8, px)); py = Math.max(8, Math.min(H - ch - 8, py));
    const src = arrowURL(dir);
    if (this.arrow.dataset.d !== dir) { this.arrow.src = src; this.arrow.dataset.d = dir; this.arrow.className = 'inv-coach-arrow ' + dir; }
    Object.assign(this.arrow.style, { display: '', left: snap(ax) + 'px', top: snap(ay) + 'px', width: aw + 'px', height: ah + 'px' });
    this.card.style.left = snap(px) + 'px'; this.card.style.top = snap(py) + 'px';
  }
}

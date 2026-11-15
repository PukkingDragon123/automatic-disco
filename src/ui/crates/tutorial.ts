// The stores tutorial: a coached overlay that runs once, the first time a second container exists. Each step
// spotlights the control it is about (the rest of the screen dims), says in one line what it does, and moves on
// when the player has done it: open a container, sort, filter, split, move between two, set a priority or a filter.
import type { Game } from '../../game/game';
import type { Storage } from '../../inv/storage';
import type { InvUI, InvEvent } from './grid';
import type { CrateHud } from './hud';
import { injectCrateCSS } from './style';
import { sfx } from '../../audio/audio';

interface Step { id: string; title: string; text: string; wait: InvEvent[]; target: () => DOMRect | null; need2?: boolean }
const FLAG = 'inv.tut';
export class StoresTutorial {
  private card: HTMLDivElement | null = null; private ring: HTMLDivElement | null = null; private dims: HTMLDivElement[] = [];
  private i = -1; private raf = 0; private steps: Step[];
  running = false;
  constructor(readonly g: Game, readonly st: Storage, readonly ui: InvUI, readonly hud: CrateHud) {
    injectCrateCSS();
    const win = (k: number) => this.ui.wins[k] ?? null;
    const q = (sel: string, k = -1) => { const w = k < 0 ? this.ui.wins[this.ui.wins.length - 1] : win(k); return w?.root.querySelector(sel)?.getBoundingClientRect() ?? null; };
    const union = (...rs: (DOMRect | null)[]) => { const v = rs.filter(Boolean) as DOMRect[]; if (!v.length) return null; const x0 = Math.min(...v.map((r) => r.left)), y0 = Math.min(...v.map((r) => r.top)), x1 = Math.max(...v.map((r) => r.right)), y1 = Math.max(...v.map((r) => r.bottom)); return new DOMRect(x0, y0, x1 - x0, y1 - y0); };
    this.steps = [
      { id: 'open', title: 'YOUR STORES', text: 'Every container you build shows here as it really is, contents and all. <kbd>Click</kbd> one to open its grid.', wait: ['opened'], target: () => this.hud.root.getBoundingClientRect() },
      { id: 'sort', title: 'SORT', text: 'Re-lay the grid by <kbd>TYPE</kbd>, <kbd>NAME</kbd>, <kbd>COUNT</kbd>, <kbd>VALUE</kbd> or <kbd>FRESH</kbd> (stalest first). Press it again to reverse.', wait: ['sorted'], target: () => q('.srt') },
      { id: 'filter', title: 'FILTER', text: 'Pick a category chip or type in <kbd>SEARCH</kbd>: what matches lights up, the rest dims.', wait: ['filtered'], target: () => union(q('.flt'), q('.chips')) },
      { id: 'split', title: 'SPLIT', text: '<kbd>Right-click</kbd> a stack to split it in half, or <kbd>Shift</kbd>-drag to carry half. Drag a stack onto its twin to merge.', wait: ['split'], target: () => q('.inv-screen') },
      { id: 'move', title: 'MOVE', text: 'Open a second container from STORES; the two sit side by side. <kbd>Drag</kbd> a stack across, or <kbd>double-click</kbd> it. <kbd>R</kbd> turns a long item while you drag.', wait: ['moved'], need2: true, target: () => (this.ui.wins.length >= 2 ? union(q('.inv-screen', 0), q('.inv-screen', 1)) : this.hud.root.getBoundingClientRect()) },
      { id: 'set', title: 'PRIORITY AND FILTERS', text: 'The <kbd>gear</kbd> sets a label, a logo and a paint, the <kbd>PRIORITY</kbd> (high fills first, low takes the overflow) and what it may <kbd>ALLOW</kbd> or <kbd>DENY</kbd>. Set one.', wait: ['priority', 'filterset'], target: () => (this.ui.wins.some((w) => w.settings) ? q('.inv-set') : q('.gear')) },
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
    for (let k = 0; k < 4; k++) { const d = document.createElement('div'); d.className = 'inv-coach-dim'; document.body.appendChild(d); this.dims.push(d); }
    this.ring = document.createElement('div'); this.ring.className = 'inv-coach-ring'; document.body.appendChild(this.ring);
    this.card = document.createElement('div'); this.card.className = 'inv-coach'; document.body.appendChild(this.card);
    this.go(this.ui.wins.length ? 1 : 0);
    const loop = () => { this.raf = requestAnimationFrame(loop); this.place(); };
    loop();
  }
  private go(i: number) {
    this.i = i;
    if (i >= this.steps.length) { this.finish(); return; }
    const s = this.steps[i];
    this.card!.innerHTML = `<div class="scr2"><h3>${s.title}</h3><p>${s.text}</p></div><div class="ft"><div class="steps">${this.steps.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div><button class="inv-key w skip">SKIP</button></div>`;
    this.card!.querySelector<HTMLButtonElement>('.skip')!.onclick = () => this.end();
    sfx('click', 1.1, 0.5);
  }
  private on(ev: InvEvent) {
    if (!this.running || this.i < 0 || this.i >= this.steps.length) return;
    const s = this.steps[this.i];
    if (s.need2 && this.ui.wins.length < 2) return;
    if (!s.wait.includes(ev) && !(s.id === 'split' && ev === 'merged')) return;
    sfx('done', 1.2, 0.5);
    setTimeout(() => this.go(this.i + 1), 350);
  }
  private finish() {
    this.i = this.steps.length;
    this.card!.innerHTML = `<div class="scr2"><h3>STORES READY</h3><p>Items go to the highest-priority container that takes them, then the nearest. The arms unload the pod's hold into containers within reach; link workers to a container to keep it stocked.</p></div><div class="ft"><div class="steps">${this.steps.map(() => '<i class="done"></i>').join('')}</div><button class="inv-key w ok">OK</button></div>`;
    this.card!.querySelector<HTMLButtonElement>('.ok')!.onclick = () => this.end();
  }
  end() {
    cancelAnimationFrame(this.raf);
    this.card?.remove(); this.ring?.remove(); for (const d of this.dims) d.remove();
    this.card = this.ring = null; this.dims = []; this.running = false;
  }
  /** spotlight the step's target: four dims round it, a ring on it, the card beside it */
  private place() {
    if (!this.card) return;
    const s = this.steps[Math.min(this.i, this.steps.length - 1)];
    const r = this.i >= this.steps.length ? null : s.target();
    const pad = 6, W = innerWidth, H = innerHeight;
    if (r) {
      const x0 = Math.max(0, r.left - pad), y0 = Math.max(0, r.top - pad), x1 = Math.min(W, r.right + pad), y1 = Math.min(H, r.bottom + pad);
      const rects = [[0, 0, W, y0], [0, y1, W, H - y1], [0, y0, x0, y1 - y0], [x1, y0, W - x1, y1 - y0]];
      this.dims.forEach((d, k) => Object.assign(d.style, { left: rects[k][0] + 'px', top: rects[k][1] + 'px', width: rects[k][2] + 'px', height: rects[k][3] + 'px', display: '' }));
      Object.assign(this.ring!.style, { display: '', left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
      const cw = this.card.offsetWidth, ch = this.card.offsetHeight;
      // beside the target: to its right if there is room, else above, else left
      let cx = x1 + 14, cy = Math.min(H - ch - 8, Math.max(8, y0));
      if (cx + cw > W - 8) { cx = Math.min(W - cw - 8, Math.max(8, x0)); cy = y0 - ch - 14; if (cy < 8) { cy = Math.min(H - ch - 8, y1 + 14); } }
      if (cy + ch > H - 8 && x0 - cw - 14 > 8) { cx = x0 - cw - 14; cy = Math.max(8, Math.min(H - ch - 8, y0)); }
      this.card.style.left = Math.round(cx) + 'px'; this.card.style.top = Math.round(cy) + 'px';
    } else {
      for (const d of this.dims) d.style.display = 'none';
      this.ring!.style.display = 'none';
      this.card.style.left = Math.round((W - this.card.offsetWidth) / 2) + 'px'; this.card.style.top = Math.round(H * 0.3) + 'px';
    }
  }
}

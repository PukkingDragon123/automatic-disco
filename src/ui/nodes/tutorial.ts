// The first chain, taught on the map itself: a typed instruction card clipped to the glass walks the player through
// IRON INGOT (dig the ore deposit into a bunker, feed the smelter from it, clear the ingots into a second bin), one
// real action per step. Each step checks the network, not a button press, and the nodes it means pulse amber. When a
// building the step needs does not exist yet, the card says what to build first.
import type { NodeMap } from './map';
import type { LNode, Route } from '../../logistics/network';
import { itemFor } from '../../logistics/recipes';
import { toast } from '../kit';
import { sfx } from '../../audio/audio';

interface Step { h: string; b: () => string; done: () => boolean; marks: () => string[] }

export class Tutorial {
  step = 0;
  private el: HTMLDivElement;
  private key = '';
  private t = 0;
  constructor(readonly m: NodeMap, host: HTMLElement) {
    this.el = document.createElement('div'); this.el.className = 'nm-tut'; host.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null; if (!a) return;
      if (a.dataset.a === 'next') this.next();
      if (a.dataset.a === 'skip') { this.step = 99; this.L.tut = 99; this.key = ''; this.render(); }
      if (a.dataset.a === 'save') this.saveChain();
    });
    this.step = this.L.tut;
  }
  get L() { return this.m.L; }
  start() { this.step = 1; this.L.tut = 1; this.key = ''; this.render(); sfx('open', 1.2, 0.5); }
  /** the map opened: offer the guide once on a fresh colony */
  opened() { this.step = this.L.tut; if (this.step === 0 && !this.L.routes.length) { this.step = 1; this.L.tut = 1; } this.key = ''; this.render(); }
  poke() { this.t = 0; }

  // ------------------------------------------------------------------ finding the pieces
  private ore() { return itemFor('ore') ?? 'ore'; }
  private ingot() { return itemFor('iron_ingot') ?? 'iron_ingot'; }
  private deposit(): LNode | null { const L = this.L, ids = [this.ore(), 'ore', 'iron_ore']; return L.nodes.filter((n) => n.kind === 'deposit' && ids.includes(L.seam(n)?.item ?? '') && !L.seam(n)?.drill).sort((a, b) => this.dist(a) - this.dist(b))[0] ?? null; }
  private smelter(): LNode | null { const L = this.L; return L.nodes.filter((n) => n.kind === 'building' && L.bld(n)?.def.station === 'smelter').sort((a, b) => this.dist(a) - this.dist(b))[0] ?? null; }
  private containers(): LNode[] { return this.L.nodes.filter((n) => n.kind === 'container').sort((a, b) => this.dist(a) - this.dist(b)); }
  private dist(n: LNode) { const c = this.L.f.hive.core; const [x, z] = this.L.pos(n); return c ? Math.hypot(x - c.x, z - c.z) : 0; }
  private wire(pred: (r: Route, a: LNode, b: LNode) => boolean): Route | null { const L = this.L; return L.routes.find((r) => { const a = L.node(r.from), b = L.node(r.to); return !!a && !!b && pred(r, a, b); }) ?? null; }
  /** the bunker: the container the deposit is wired into */
  private bunkerRoute() { const d = this.deposit(); return d ? this.wire((r, a, b) => a.id === d.id && b.kind === 'container') : null; }
  private feedRoute() { const br = this.bunkerRoute(), s = this.smelter(); return br && s ? this.wire((r, a, b) => a.id === br.to && b.id === s.id) : null; }
  private binRoute() { const s = this.smelter(), br = this.bunkerRoute(); return s ? this.wire((r, a, b) => a.id === s.id && b.kind === 'container' && b.id !== br?.to) : null; }
  private name(n: LNode | null) { return n ? n.name : '—'; }

  private steps(): Step[] {
    const L = this.L;
    const need = (what: string, cat: string) => `<br><br>There is no <b>${what}</b> yet: close the map, press <b>B</b> and build one from <b>${cat}</b>. The crew will bring the materials and raise it.`;
    return [
      { h: 'THE NODE MAP', b: () => 'Every card is a real thing in the colony: the pod\'s stores, buildings, containers, deposits and fields, where they stand. A <b>wire</b> between two cards is a route: workers walk it, carrying what the source has and the target takes. We will build an iron ingot chain.', done: () => false, marks: () => [] },
      { h: 'DIG THE ORE', b: () => { const d = this.deposit(), c = this.containers()[0]; return d ? (c ? `Drag from the output tab (right edge) of <b>${this.name(d)}</b> to <b>${this.name(c)}</b>. Workers will dig the seam by hand and fill the container: it becomes the <b>ore bunker</b>.` : `Found <b>${this.name(d)}</b>.` + need('storage crate', 'STORAGE')) : 'No ore deposit near the colony. Scan the ground (X) to find one.'; }, done: () => !!this.bunkerRoute(), marks: () => [this.deposit()?.id ?? '', this.containers()[0]?.id ?? ''] },
      { h: 'GIVE IT A WORKER', b: () => 'Click the new wire. In the inspector on the right, tick a worker under <b>WORKERS</b>: it is now dedicated to this route and will do nothing else. Free haulers can still help unless you switch that off.', done: () => (this.bunkerRoute()?.workers.length ?? 0) > 0, marks: () => [] },
      { h: 'FEED THE SMELTER', b: () => { const s = this.smelter(), br = this.bunkerRoute(); return s ? `Wire <b>${this.name(br ? L.node(br.to) : null)}</b> to <b>${this.name(s)}</b>. Then, on that wire, pick <b>IRON ORE</b> under ITEMS so nothing else is carried in.` : need('smelter', 'PROCESSING'); }, done: () => { const r = this.feedRoute(), d = this.deposit(); return !!r && r.filter.some((id) => id === this.ore() || id === L.seam(d!)?.item); }, marks: () => { const br = this.bunkerRoute(); return [br?.to ?? '', this.smelter()?.id ?? '']; } },
      { h: 'CLEAR THE INGOTS', b: () => { const c = this.containers().filter((n) => n.id !== this.bunkerRoute()?.to)[0]; return c ? `Wire <b>${this.name(this.smelter())}</b> to <b>${this.name(c)}</b>: the <b>ingot bin</b>. A smelter whose output is full stops.` : need('second storage crate', 'STORAGE'); }, done: () => !!this.binRoute(), marks: () => [this.smelter()?.id ?? '', this.containers().filter((n) => n.id !== this.bunkerRoute()?.to)[0]?.id ?? ''] },
      { h: 'WATCH IT RUN', b: () => { const r = this.binRoute(); return `Packets on the wires are loads in workers' arms. A wire that stalls says why, in amber, on its plate. Wait for the first ingots to reach the bin (${r?.moved ?? 0}/4).`; }, done: () => (this.binRoute()?.moved ?? 0) >= 4, marks: () => [] },
      { h: 'SAVE THE CHAIN', b: () => 'A working chain can be laid again anywhere. Save these four nodes as the template <b>IRON INGOT</b>; open TEMPLATES at the top to lay it beside another seam. Missing buildings become construction sites.', done: () => L.templates.some((t) => t.name === 'IRON INGOT' && !t.builtin), marks: () => [] },
      { h: 'WHAT COMES NEXT', b: () => 'Every item a route delivers trains the <b>logistics discipline</b>. It teaches route conditions first, then splitters and mergers, buffers and counters, gates and timers, and sensors. Research can teach them sooner.', done: () => false, marks: () => [] },
    ];
  }
  highlight(id: string) { if (this.step <= 0 || this.step >= 99) return false; const s = this.steps()[this.step - 1]; return !!s && s.marks().includes(id); }
  private next() { const n = this.steps().length; this.step = this.step >= n ? 99 : this.step + 1; this.L.tut = this.step; this.key = ''; this.render(); sfx('click', 1.2, 0.4); }
  private saveChain() {
    const d = this.deposit(), br = this.bunkerRoute(), s = this.smelter(), bin = this.binRoute();
    if (!d || !br || !s || !bin) return;
    const t = this.L.saveTemplate('IRON INGOT', [d.id, br.to, s.id, bin.to]);
    if (t) { toast('Template saved: <b>IRON INGOT</b>', 'good', 1800); sfx('done', 1, 0.6); }
  }
  update(dt: number) {
    this.t += dt;
    if (this.step <= 0 || this.step >= 99) { this.el.classList.remove('on'); return; }
    const st = this.steps()[this.step - 1];
    if (st && st.done()) { sfx('done', 1.3, 0.6); this.step++; this.L.tut = this.step; this.key = ''; if (this.step > this.steps().length) this.step = 99; }
    this.render();
  }
  private render() {
    const all = this.steps(), st = all[this.step - 1];
    if (this.step <= 0 || this.step >= 99 || !st) { this.el.classList.remove('on'); return; }
    const body = st.b(), key = this.step + '|' + body;
    if (key === this.key) return;
    this.key = key;
    this.el.classList.add('on');
    const manual = this.step === 1 || this.step === all.length;
    this.el.innerHTML = `<span class="stamp">GUIDE</span><div class="st">FIRST CHAIN · STEP ${this.step} OF ${all.length}</div><div class="h">${st.h}</div><div class="b">${body}</div>
      <div class="row">${this.step === 7 ? '<span class="tb" data-a="save">SAVE AS IRON INGOT</span>' : ''}${manual ? `<span class="tb" data-a="next">${this.step === all.length ? 'DONE' : 'BEGIN'}</span>` : '<span class="ok">WAITING FOR YOU</span>'}<span class="sp"></span><span class="tb ghost" data-a="skip">CLOSE GUIDE</span></div>`;
  }
}

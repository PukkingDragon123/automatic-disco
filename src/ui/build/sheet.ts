// THE BLUEPRINT SHEET (V7: "when you click a building, the info shows as a kind of blueprint"). A sheet of textured
// cyan-blue blueprint paper (paper.ts: mottled diazo stock, fibres, a printed grid and border, a fold, a dog-ear), held by
// two steel bulldog clips, slides in from the right and unrolls. On it, all pixel art at 2 CSS px per art px:
//   the building's TECHNICAL DRAWING traced from its own model (drawing.ts): a big isometric view, a plan and a front
//   elevation with dimension lines in metres; its RECIPES as item icons (in -> out, the time), the current one bracketed
//   (click another to switch); a POWER dial (MW, how well the grid feeds it) and a STATUS dial (working / idle / starved /
//   blocked / dark) with a lamp; the craft in progress and the hull as cell bars; what is IN and OUT as icons with counts;
//   the CREW: its operator and the haulers on its routes as portraits in slots, the free workers waiting beside them.
//   ASSIGN by dragging a portrait onto a slot; drag one off the sheet to free it.
//   Physical icons along the bottom: MOVE, ROTATE, PAUSE / RUN, NODE MAP, DISMANTLE.
// Minimal text: the name, numbers, one status word.
import type { Factory, FBuilding } from '../../factory/factory';
import type { Build } from '../../factory/build';
import { STATUS_COL, STATUS_NAME, type Status } from '../../factory/status';
import { recipesAt, perMin, type Recipe } from '../../factory/recipes';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import type { Creature } from '../../game/creature';
import { thumb } from '../thumbs';
import { techDrawing } from './drawing';
import { blueprintSheet, bulldogClip } from './paper';
import { floatBtn, bpIcon, type FloatBtn } from './bpicons';
import { play } from './juice';
import { Px, cellBar, INK } from '../kit/px';
import { bitText } from '../kit/bitfont';
import { RAMPS as P } from '../../art/palette';

const W = 300, H = 404; // art px (shown at 2x)
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const WHITE = hex(P.quartz[5]), PALE = hex(P.sapphire[6]), MIDB = hex(P.sapphire[5]), AMB = hex(P.glowAmber[4]);
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''));
const ST_ORDER: Status[] = ['working', 'idle', 'starved', 'blocked', 'nopower'];

/** the recipe arrow: a white pixel arrow with an ink rim (12 x 7 art px) */
let ARROW = '';
function arrowUrl() {
  if (ARROW) return ARROW;
  const p = new Px(12, 7), c = P.quartz[5];
  p.rect(0, 3, 9, 1, c); for (let k = 0; k < 4; k++) p.rect(8 - k + 3, 3 - k, 1, 1 + k * 2, c);
  p.outline(INK);
  return (ARROW = p.url());
}
interface Route { id: number; from: string; to: string; workers: number[] }
type Logi = { routes: Route[]; sync(force?: boolean): void };

export class BlueprintSheet {
  readonly root: HTMLDivElement;
  private paper: HTMLCanvasElement; private art: HTMLCanvasElement; private ag: CanvasRenderingContext2D;
  private title: HTMLDivElement; private recs: HTMLDivElement; private bufs: HTMLDivElement; private crew: HTMLDivElement; private acts: HTMLDivElement;
  b: FBuilding | null = null;
  isOpen = false;
  private key = ''; private crewKey = ''; private bufKey = '';
  private t = 0; private slow = 0;
  private needle = { p: 0, s: 0 };
  private drag: { c: Creature; from: 'pool' | 'op' | 'haul'; ghost: HTMLImageElement; x: number; y: number; on: boolean } | null = null;
  private pauseBtn: FloatBtn | null = null;

  constructor(readonly f: Factory, readonly build: Build, readonly host: { closed(): void; nodes(b: FBuilding): void }) {
    const r = (this.root = document.createElement('div'));
    r.className = 'bs';
    r.innerHTML = `<div class="bs-body"><canvas class="bs-paper"></canvas><canvas class="bs-art"></canvas><div class="bs-title k7-t32"></div><div class="bs-recs"></div><div class="bs-bufs"></div><div class="bs-crew"></div></div><canvas class="bs-clip a"></canvas><canvas class="bs-clip b"></canvas><div class="bs-acts"></div>`;
    document.body.appendChild(r);
    this.paper = r.querySelector('.bs-paper')!; this.art = r.querySelector('.bs-art')!;
    this.title = r.querySelector('.bs-title')!; this.recs = r.querySelector('.bs-recs')!; this.bufs = r.querySelector('.bs-bufs')!; this.crew = r.querySelector('.bs-crew')!; this.acts = r.querySelector('.bs-acts')!;
    blueprintSheet(W, H, { seed: 11, border: 6, folds: { y: [0.46] }, dogEar: true }).canvas(this.paper);
    this.art.width = W; this.art.height = H;
    this.ag = this.art.getContext('2d')!; this.ag.imageSmoothingEnabled = false;
    const clip = bulldogClip();
    for (const c of r.querySelectorAll<HTMLCanvasElement>('.bs-clip')) clip.canvas(c);
    const close = floatBtn('cancel', '', () => this.close(), { size: 48, cls: 'bs-x', sound: 'close' });
    r.appendChild(close);
    r.addEventListener('pointerdown', (e) => e.stopPropagation());
    r.addEventListener('wheel', (e) => e.stopPropagation());
    this.recs.addEventListener('click', (e) => this.pickRecipe(e));
    this.crew.addEventListener('pointerdown', (e) => this.dragStart(e));
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
  }
  dispose() { removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); this.root.remove(); }

  // ------------------------------------------------------------------ open / close
  open(b: FBuilding) {
    const again = this.isOpen && this.b !== b;
    this.b = b; this.key = ''; this.crewKey = ''; this.bufKey = '';
    if (!this.isOpen) {
      this.isOpen = true;
      this.root.classList.remove('off'); void this.root.offsetWidth;
      this.root.classList.add('on');
      play('swoosh', 1.1, 0.4); setTimeout(() => play('paper', 1, 0.5), 220); setTimeout(() => play('clink', 1.3, 0.35), 420);
    } else if (again) {
      // another building: the sheet is swapped with a quick flutter
      this.root.classList.remove('flip'); void this.root.offsetWidth; this.root.classList.add('flip');
      play('paper', 1.15, 0.45);
    }
    this.render();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this.b = null;
    this.root.classList.remove('on', 'flip'); this.root.classList.add('off');
    play('swooshOut', 1, 0.4);
    this.host.closed();
  }

  // ------------------------------------------------------------------ the sheet's content
  private render() {
    const b = this.b; if (!b) return;
    const d = b.def;
    this.title.textContent = d.name.toUpperCase();
    this.drawStatic();
    this.renderRecipes();
    this.renderActs();
    this.live(true);
  }
  /** the technical drawings and their dimension lines (once per building) */
  private drawStatic() {
    const b = this.b!, d = b.def, g = this.ag;
    g.clearRect(0, 0, W, H);
    const iso = techDrawing(b.kind, 'iso', 180, 132), plan = techDrawing(b.kind, 'plan', 88, 60), front = techDrawing(b.kind, 'front', 88, 60);
    if (iso) g.drawImage(iso.cv, 10, 40);
    // the right column: plan and front elevation, framed, with their dimensions
    const box = (x: number, y: number, w: number, h: number) => { g.fillStyle = MIDB; g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h); };
    if (plan) { g.drawImage(plan.cv, 200, 44); box(198, 42, 92, 64); this.dims(plan.scale, 200 + 44, 44 + 30, d.w, d.d, 'plan'); }
    if (front) { g.drawImage(front.cv, 200, 118); box(198, 116, 92, 64); this.dims(front.scale, 200 + 44, 118 + 30, d.w, d.h, 'front'); }
    // rules between the blocks
    g.fillStyle = PALE;
    for (const y of [182, 244, 312]) for (let x = 10; x < W - 10; x++) if ((x >> 1) % 3 !== 2) g.fillRect(x, y, 1, 1);
  }
  /** dimension lines round a view: arrows, ticks and the size in metres */
  private dims(scale: number, cx: number, cy: number, a: number, bb: number, kind: 'plan' | 'front') {
    const g = this.ag, la = Math.round(a * scale), lb = Math.round(bb * scale);
    const x0 = Math.round(cx - la / 2), x1 = x0 + la, yb = Math.min(cy + 29, Math.round(cy + (kind === 'front' ? lb : lb / 2) + 4));
    g.fillStyle = WHITE;
    if (la > 6 && la < 92) {
      g.fillRect(x0, yb, la, 1); g.fillRect(x0, yb - 2, 1, 5); g.fillRect(x1 - 1, yb - 2, 1, 5);
      g.fillRect(x0 + 1, yb - 1, 2, 1); g.fillRect(x0 + 1, yb + 1, 2, 1); g.fillRect(x1 - 3, yb - 1, 2, 1); g.fillRect(x1 - 3, yb + 1, 2, 1);
      const s = fmt(a), tw = s.length * 6;
      g.fillStyle = hex(P.sapphire[2]); g.fillRect(Math.round(cx - tw / 2) - 2, yb - 5, tw + 4, 10);
      bitText(g, s, Math.round(cx - tw / 2), yb - 7, { color: WHITE });
    }
    if (lb > 6 && lb < 62) {
      const xr = Math.min(288, Math.round(cx + la / 2 + 4)), y0 = Math.round(kind === 'front' ? cy + 26 - lb : cy - lb / 2), y1 = y0 + lb;
      g.fillStyle = WHITE;
      g.fillRect(xr, y0, 1, lb); g.fillRect(xr - 2, y0, 5, 1); g.fillRect(xr - 2, y1 - 1, 5, 1);
      const s = fmt(bb);
      bitText(g, s, xr - 4 - s.length * 6, Math.round((y0 + y1) / 2) - 7, { color: AMB });
    }
  }
  private recipes(): Recipe[] { const d = this.b?.def; return d?.station && d.station !== 'boiler' && d.station !== 'lab' ? recipesAt(d.station) : d?.station ? recipesAt(d.station) : []; }
  private renderRecipes() {
    // the running recipe first, then the others it could switch to
    const b = this.b!, all = this.recipes(), rs = [...all].sort((x, y) => Number(y === b.recipe) - Number(x === b.recipe) || Number(this.f.recipeOk(y)) - Number(this.f.recipeOk(x))).slice(0, 3);
    if (!rs.length) {
      // no recipe: what the building does, as icons (an extractor's seam, a store's contents)
      this.recs.innerHTML = '';
      return;
    }
    const side = (s: Recipe['in']) => Object.entries(s).filter(([id]) => ITEMS[id]).map(([id, n]) => `<span class="bs-it" title="${esc(ITEMS[id]?.name ?? id)}"><img src="${itemIcon(id, 32)}" alt=""><b class="k7-t16">${n}</b></span>`).join('');
    this.recs.innerHTML = rs.map((r) => {
      const ok = this.f.recipeOk(r), on = b.recipe === r;
      const out = r.robot ? `<span class="bs-it"><img src="${itemIcon('iron_plate', 32)}" alt=""></span>` : side(r.out);
      const rate = Object.entries(r.out)[0];
      return `<div class="bs-rec ${on ? 'on' : ''} ${ok ? '' : 'locked'}" data-rec="${r.id}"><span class="bs-in">${side(r.in)}</span><img class="bs-arrow" src="${arrowUrl()}" alt=""><span class="bs-out">${out}</span><span class="bs-time k7-t16">${r.t}s${rate && !r.robot ? `  ${fmt(perMin(r, rate[1] ?? 0))}/m` : ''}</span></div>`;
    }).join('');
  }
  private pickRecipe(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest('[data-rec]') as HTMLElement | null, b = this.b; if (!el || !b) return;
    const r = this.recipes().find((x) => x.id === el.dataset.rec); if (!r) return;
    if (!this.f.recipeOk(r)) { play('deny', 1, 0.5); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
    if (b.recipe !== r) { this.f.setRecipe(b, r); b.auto = false; play('turn', 1.1, 0.5); this.renderRecipes(); }
  }
  private renderActs() {
    const b = this.b!, bd = this.build;
    this.acts.innerHTML = '';
    const add = (icon: Parameters<typeof floatBtn>[0], name: string, fn: () => void, sound?: string) => { const e = floatBtn(icon, name, fn, { size: 48, sound, nameHover: true }); this.acts.appendChild(e); return e; };
    add('move', 'MOVE', () => { const t = this.b; if (!t) return; this.close(); if (!bd.active) bd.open(null, 'select'); bd.pickUp(t); }, 'lift');
    add('rotate', 'TURN', () => { const t = this.b; if (!t) return; bd.selected = t; bd.turnSelected(); const nb = bd.selected; if (nb && nb !== t && !(nb as { need?: unknown }).need) this.open(nb as FBuilding); }, 'turn');
    this.pauseBtn = (b.def.power > 0 || b.def.station || b.def.extract) ? add(b.on ? 'pause' : 'play', b.on ? 'PAUSE' : 'RUN', () => { const t = this.b; if (!t) return; t.on = !t.on; this.renderActs(); }, 'clunk') : null;
    add('jack', 'NODES', () => { const t = this.b; if (t) { this.close(); this.host.nodes(t); } }, 'pick');
    add('dismantle', 'TAKE DOWN', () => { const t = this.b; if (!t) return; this.close(); bd.dismantle(t); }, 'clink');
  }

  // ------------------------------------------------------------------ live values (4 times a second)
  update(dt: number) {
    if (!this.isOpen || !this.b) return;
    this.t += dt; this.slow -= dt;
    if (this.b.dead) { this.close(); return; }
    // the needles swing to their values
    const tp = this.powerFrac(), ts = Math.max(0, ST_ORDER.indexOf(this.b.status === 'offline' ? 'nopower' : this.b.status));
    const dp = tp - this.needle.p, ds = ts - this.needle.s;
    this.needle.p += dp * Math.min(1, dt * 6) + Math.sin(this.t * 13) * 0.002;
    this.needle.s += ds * Math.min(1, dt * 7);
    this.drawGauges();
    if (this.slow <= 0) { this.slow = 0.25; this.live(false); }
  }
  private powerFrac() {
    const b = this.b!, d = b.def;
    if (!d.power) return 0;
    if (d.power < 0) return b.status === 'working' ? 0.85 : 0.1;
    const g = this.f.gridOf(b);
    return g ? Math.max(0, Math.min(1.2, g.sat)) : 0;
  }
  /** the dials, the lamp and the bars, painted into the art layer's gauge band */
  private drawGauges() {
    const b = this.b!, d = b.def, g = this.ag;
    const y0 = 248, band = new Px(W, 62);
    // the POWER dial: brass bezel, paper face, ticks, a red end, the needle
    const dial = (cx: number, cy: number, r: number, frac: number, sectors: number[] | null) => {
      for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 2; x <= r + 2; x++) {
        const dd = Math.hypot(x + 0.5, y + 0.5);
        if (dd > r + 1.5) continue;
        if (dd > r - 1.5) { band.set(cx + x, cy + y, dd > r + 0.5 ? INK : (x + y < 0 ? P.brass[5] : P.brass[2])); continue; }
        if (y > 4) { if (dd > r - 3) band.set(cx + x, cy + y, P.brass[3]); continue; }
        const a = Math.atan2(y + 0.5, x + 0.5); // -PI..0 is the upper half
        let c = P.quartz[4];
        if (sectors) { const k = Math.max(0, Math.min(sectors.length - 1, Math.floor(((a + Math.PI) / Math.PI) * sectors.length))); if (dd > r - 7 && y < 0) c = sectors[k]; }
        else if (dd > r - 6 && a > -0.55 && y < 0) c = P.stampRed[3];
        band.set(cx + x, cy + y, c);
      }
      for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; for (let rr = r - (k % 4 === 0 ? 7 : 4); rr < r - 1.5; rr++) band.set(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), INK); }
      const a = Math.PI + Math.max(0, Math.min(1, frac)) * Math.PI;
      for (let rr = 0; rr < r - 3; rr += 0.5) band.set(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), rr > r - 8 ? P.stampRed[3] : INK);
      band.disc(cx, cy, 2.5, (_dd, lit) => (lit > 0 ? P.brass[5] : P.brass[2]));
    };
    dial(36, 32, 24, d.power ? this.needle.p / 1.2 : 0, null);
    const sect = ST_ORDER.map((s) => STATUS_COL[s]);
    dial(104, 32, 24, (this.needle.s + 0.5) / ST_ORDER.length, sect);
    // the lamp
    const lampOn = b.status === 'working' || b.status === 'idle' || Math.floor(this.t * 3) % 2 === 0;
    band.disc(140, 12, 4.5, (dd, lit) => (dd > 3.8 ? INK : lampOn ? (lit > 0.3 ? 0xffffff : STATUS_COL[b.status]) : P.steel[2]));
    // the craft in progress, the hull
    cellBar(band, 152, 6, 138, 10, b.recipe && b.running ? b.prog : 0, P.glowAmber, this.t);
    cellBar(band, 152, 22, 138, 8, b.hp / b.maxHp, b.hp / b.maxHp > 0.35 ? P.glowTeal : [P.stampRed[0], P.stampRed[1], P.stampRed[2], P.stampRed[3]], 0);
    g.clearRect(0, y0, W, 62);
    g.drawImage(band.canvas(), 0, y0);
    // the numbers under the dials
    const mw = d.power < 0 ? `+${-d.power}` : d.power ? `${d.power}` : '0';
    bitText(g, mw, 36 - mw.length * 3 - 3, y0 + 40, { color: d.power && !this.f.gridOf(b) && d.power > 0 ? hex(P.coral[5]) : WHITE });
    const sw = STATUS_NAME[b.status].split(' ').pop()!;
    bitText(g, sw, 104 - sw.length * 3, y0 + 40, { color: hex(STATUS_COL[b.status]) });
  }
  private live(force: boolean) {
    const b = this.b!, f = this.f;
    // what is in and out
    const items: [string, ItemId, number][] = [];
    for (const [id, n] of b.inBuf) if (n >= 0.5 && ITEMS[id]) items.push(['in', id, n]);
    for (const [id, n] of b.outBuf) if (n >= 0.5 && ITEMS[id]) items.push(['out', id, n]);
    for (const [id, n] of b.store) if (n >= 0.5 && ITEMS[id]) items.push(['held', id, n]);
    if (b.def.extract === 'node') { const s = f.seams[b.seam]; if (s) items.push(['seam', s.item, s.amount]); }
    const bk = items.map((x) => x.join(':')).join('|');
    if (force || bk !== this.bufKey) {
      this.bufKey = bk;
      this.bufs.innerHTML = items.slice(0, 7).map(([k, id, n]) => `<span class="bs-buf ${k}" title="${esc(ITEMS[id]?.name ?? id)}"><img src="${itemIcon(id, 32)}" alt=""><b class="k7-t16">${Math.floor(n)}</b></span>`).join('');
    }
    // the crew: operator, the haulers on its routes, the free ones
    const W8 = f.workers; W8.sync();
    const op = b.operator && !b.operator.dead ? b.operator : null;
    const routes = this.routes();
    const haul = routes.flatMap((r) => r.workers).map((id) => W8.list.find((w) => w.c.id === id)?.c).filter((c): c is Creature => !!c && !c.dead);
    const free = W8.list.filter((w) => !w.c.dead && w.job === 'idle').map((w) => w.c);
    const ck = `${op?.id}|${haul.map((c) => c.id).join(',')}|${free.map((c) => c.id).join(',')}|${routes.length}`;
    if (force || ck !== this.crewKey) {
      this.crewKey = ck;
      const face = (c: Creature, k: string) => `<img class="bs-face ${k}" data-c="${c.id}" src="${thumb(c.sp)}" alt="" draggable="false">`;
      let h = '';
      if (b.def.operable) h += `<span class="bs-slot op ${op ? 'full' : ''}" data-slot="op"><img class="bs-slot-ic" src="${this.icon('hand')}" alt="">${op ? face(op, 'op') : ''}</span>`;
      if (routes.length) h += `<span class="bs-slot haul ${haul.length ? 'full' : ''}" data-slot="haul"><img class="bs-slot-ic" src="${this.icon('jack')}" alt="">${haul.slice(0, 3).map((c) => face(c, 'haul')).join('')}</span>`;
      h += `<span class="bs-pool" data-slot="pool">${free.slice(0, 6).map((c) => face(c, 'pool')).join('')}${free.length > 6 ? `<b class="k7-t16">+${free.length - 6}</b>` : ''}</span>`;
      this.crew.innerHTML = h;
    }
    if (this.pauseBtn && this.pauseBtn.classList.contains('lock') === false) this.pauseBtn.classList.toggle('on', !b.on);
  }
  private icons = new Map<string, string>();
  private icon(n: 'hand' | 'jack') { let u = this.icons.get(n); if (!u) { u = bpIcon(n); this.icons.set(n, u); } return u; }
  private routes(): Route[] {
    const L = (this.f.g as unknown as { logistics?: Logi }).logistics, id = 'b:' + this.b!.id;
    return L ? L.routes.filter((r) => r.from === id || r.to === id) : [];
  }

  // ------------------------------------------------------------------ ASSIGN: portraits dragged on and off
  private dragStart(e: PointerEvent) {
    const img = (e.target as HTMLElement).closest('.bs-face') as HTMLImageElement | null; if (!img || e.button !== 0) return;
    const id = Number(img.dataset.c), w = this.f.workers.list.find((x) => x.c.id === id); if (!w) return;
    e.preventDefault();
    const ghost = document.createElement('img'); ghost.className = 'bs-drag'; ghost.src = img.src; ghost.draggable = false;
    this.drag = { c: w.c, from: img.classList.contains('op') ? 'op' : img.classList.contains('haul') ? 'haul' : 'pool', ghost, x: e.clientX, y: e.clientY, on: false };
  }
  private onMove = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) { d.on = true; document.body.appendChild(d.ghost); play('lift', 1.2, 0.4); this.root.classList.add('assigning'); }
    if (!d.on) return;
    d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
    const slot = this.slotAt(e.clientX, e.clientY);
    for (const s of this.crew.querySelectorAll('[data-slot]')) s.classList.toggle('drop', s === slot && (s as HTMLElement).dataset.slot !== d.from);
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    this.drag = null; d.ghost.remove(); this.root.classList.remove('assigning');
    for (const s of this.crew.querySelectorAll('.drop')) s.classList.remove('drop');
    if (!d.on || !this.b) return;
    const slot = this.slotAt(e.clientX, e.clientY), to = slot?.dataset.slot ?? (this.root.contains(document.elementFromPoint(e.clientX, e.clientY)) ? d.from : 'off');
    if (to === d.from) return;
    const W8 = this.f.workers, b = this.b, c = d.c;
    let err: string | null = null;
    // off its old post first
    if (d.from === 'haul') for (const r of this.routes()) r.workers = r.workers.filter((x) => x !== c.id);
    if (to === 'op') err = W8.assign(c, 'operate', b);
    else if (to === 'haul') {
      const rs = this.routes().sort((a, bb) => a.workers.length - bb.workers.length);
      if (rs[0]) { err = W8.whyJob('haul') ?? W8.assign(c, 'haul'); if (!err && !rs[0].workers.includes(c.id)) rs[0].workers.push(c.id); }
    } else W8.release(c);
    if (err) { play('deny', 1, 0.5); const s = this.crew.querySelector(`[data-slot="${to}"]`) as HTMLElement | null; s?.classList.remove('shake'); void s?.offsetWidth; s?.classList.add('shake'); }
    else { play(to === 'off' || to === 'pool' ? 'swooshOut' : 'clunk', 1.1, 0.5); }
    this.crewKey = '';
    this.live(false);
    // the portrait lands with a little bounce
    const land = this.crew.querySelector(`.bs-face[data-c="${c.id}"]`) as HTMLElement | null;
    if (land) { land.classList.remove('land'); void land.offsetWidth; land.classList.add('land'); }
  };
  private slotAt(x: number, y: number): HTMLElement | null { return (document.elementFromPoint(x, y)?.closest('[data-slot]') as HTMLElement | null) ?? null; }
}

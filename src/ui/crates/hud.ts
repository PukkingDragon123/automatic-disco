// The stores HUD, bottom left: a riveted gunmetal plate holding the pod's hold and every container as a 2D badge cut
// from that container's own material: its painted kind icon, its logo sprayed in its paint, its label, the three
// things it holds most of (sprite and count) and a fill gauge. Three to a page; scroll, swipe or the arrow tabs turn
// the page; a new container pops in and flashes; hover shows a card of what it holds; click opens its panel.
import type { Game } from '../../game/game';
import type { Storage } from '../../inv/storage';
import type { Container } from '../../inv/container';
import { itemDef, itemIcon } from '../../factory/items';
import { PAINTS, KIND_INFO } from '../../inv/kinds';
import { LOGOS } from '../../inv/logos';
import { RAMPS } from '../../art/palette';
import type { InvUI } from './grid';
import { injectCrateCSS } from './style';
import { badgeURL, hudPlateURL, buttonURL, lampURL, cardURL, loadMats, onMats, kindIcon } from './mat';
import { sfx } from '../../audio/audio';

const PER = 3, BW = 70, BH = 116, BG = 4, H = 150;
const ik = () => (innerHeight >= 1000 ? 2 : 1);
const fmt = (n: number) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
export class CrateHud {
  readonly root: HTMLDivElement;
  private badges: HTMLDivElement; private track: HTMLDivElement; private dots: HTMLDivElement; private card: HTMLDivElement;
  page = 0; private key = ''; private raf = 0; private hover: Container | null = null; private born = new Map<number, number>();
  private swipe: { x: number; moved: boolean } | null = null;
  constructor(readonly g: Game, readonly st: Storage, readonly ui: InvUI) {
    injectCrateCSS();
    void loadMats();
    const r = (this.root = document.createElement('div'));
    r.className = 'crate-hud';
    r.innerHTML = `<div class="badges"><div class="track"></div></div><div class="row"><img class="arw prev" title="Previous"><div class="dots"></div><img class="arw next" title="Next"></div>`;
    this.badges = r.querySelector('.badges')!; this.track = r.querySelector('.track')!; this.dots = r.querySelector('.dots')!;
    this.card = document.createElement('div'); this.card.className = 'inv-hudcard'; document.body.appendChild(this.card);
    r.querySelector<HTMLElement>('.prev')!.onclick = () => this.turn(-1);
    r.querySelector<HTMLElement>('.next')!.onclick = () => this.turn(1);
    this.badges.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); this.turn(e.deltaY + e.deltaX > 0 ? 1 : -1); }, { passive: false });
    this.badges.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; this.swipe = { x: e.clientX, moved: false }; e.stopPropagation(); });
    addEventListener('pointermove', (e) => { const s = this.swipe; if (!s) return; const dx = e.clientX - s.x; if (Math.abs(dx) > 8) s.moved = true; if (s.moved) this.track.style.transform = `translateX(${this.offset() + dx}px)`; });
    addEventListener('pointerup', (e) => {
      const s = this.swipe; this.swipe = null; if (!s) return;
      if (s.moved) { const dx = e.clientX - s.x; this.track.style.transform = ''; this.turn(dx < -24 ? 1 : dx > 24 ? -1 : 0); this.place(); return; }
      const b = (e.target as HTMLElement).closest?.('.badge') as HTMLElement | null;
      const c = b && this.st.all().find((q) => q.id === Number(b.dataset.c));
      if (c) { this.ui.open(c); sfx('click', 0.8, 0.5); }
    });
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(r);
    st.on('container', (d: { c: Container; added: boolean }) => {
      if (d.added) { const i = this.list().indexOf(d.c); if (i >= 0) { this.page = Math.floor(i / PER); this.born.set(d.c.id, performance.now()); sfx('done', 1.3, 0.4); } }
      this.key = '';
    });
    st.on('change', () => (this.key = ''));
    onMats(() => (this.key = ''));
    addEventListener('resize', () => (this.key = ''));
    const loop = () => { this.raf = requestAnimationFrame(loop); this.frame(); };
    this.raf = requestAnimationFrame(loop);
  }
  /** the hold first, then the containers in the order they were built */
  list(): Container[] { return this.st.all(); }
  get pages() { return Math.max(1, Math.ceil(this.list().length / PER)); }
  turn(d: number) {
    const p = Math.max(0, Math.min(this.pages - 1, this.page + d));
    if (p !== this.page) sfx('click', 1.2, 0.35);
    this.page = p; this.key = ''; this.showCard(null);
  }
  private offset() { return -this.page * PER * (BW + BG) * ik(); }
  private place() { this.track.style.transform = `translateX(${this.offset()}px)`; }
  private frame() {
    if (!this.root.isConnected) return;
    const list = this.list();
    this.page = Math.min(this.page, this.pages - 1);
    const key = `${ik()}|${this.page}|` + list.map((c) => `${c.id}:${c.ver}:${c.label}:${c.logo}:${c.color}:${c.powered?.() ?? 1}`).join(',');
    if (key === this.key) return;
    this.key = key;
    this.render(list);
  }
  private render(list: Container[]) {
    const k = ik(), now = performance.now();
    // (pod agent, per the lead) the plate is sized to the badges it shows: no big empty slab
    const n = Math.max(1, Math.min(PER, list.length)), pw = 16 + n * BW + (n - 1) * BG, inner = n * BW + (n - 1) * BG;
    Object.assign(this.root.style, { width: pw * k + 'px', height: H * k + 'px', backgroundImage: `url(${hudPlateURL(pw, H)})`, backgroundSize: `${pw * k}px ${H * k}px` });
    Object.assign(this.badges.style, { left: 8 * k + 'px', top: 8 * k + 'px', width: inner * k + 'px', height: BH * k + 'px' });
    this.track.style.gap = BG * k + 'px';
    const row = this.root.querySelector<HTMLDivElement>('.row')!;
    Object.assign(row.style, { left: 8 * k + 'px', top: (8 + BH + 3) * k + 'px', width: inner * k + 'px', height: 16 * k + 'px' });
    this.track.innerHTML = list.map((c) => {
      const R = RAMPS[PAINTS[c.color].ramp], top = c.contents().slice(0, 3), b = this.born.get(c.id), fresh = b && now - b < 1200;
      const items = top.map((e, j) => `<div class="it" style="top:${(61 + j * 16) * k}px;width:${(BW - 10) * k}px"><img src="${itemIcon(e.item, 32)}"><span>${fmt(e.n)}</span></div>`).join('');
      const bang = KIND_INFO[c.kind].power && !c.powered() ? '<b class="bang">!</b>' : '';
      return `<div class="badge${fresh ? ' pop flash' : ''}" data-c="${c.id}" style="width:${BW * k}px;height:${BH * k}px;background-image:url(${badgeURL(c.kind, BW, BH, LOGOS[c.logo], R, c.fill(), c.id)});background-size:${BW * k}px ${BH * k}px">` +
        `<div class="nm" style="width:${(BW - 4) * k}px">${c.label}</div>${items || '<div class="empty">-</div>'}${bang}</div>`;
    }).join('');
    for (const [id, t] of this.born) if (now - t > 1200) this.born.delete(id);
    this.track.querySelectorAll<HTMLElement>('.badge').forEach((el) => {
      const c = list.find((q) => q.id === Number(el.dataset.c))!;
      el.onpointerenter = () => this.showCard(c, el);
      el.onpointerleave = () => this.showCard(null);
    });
    this.place();
    const pr = this.root.querySelector<HTMLImageElement>('.prev')!, nx = this.root.querySelector<HTMLImageElement>('.next')!;
    // the page keys: chunky push buttons that sink while held; the page lamps
    const key = (b: HTMLImageElement, dir: 'l' | 'r', off: boolean) => {
      b.src = buttonURL(dir, 0, off); b.classList.toggle('dis', off);
      b.onpointerdown = () => { if (!off) b.src = buttonURL(dir, 2); };
      b.onpointerup = b.onpointerleave = () => (b.src = buttonURL(dir, 0, off));
      b.onpointerenter = () => { if (!off) b.src = buttonURL(dir, 1); };
    };
    key(pr, 'l', this.page <= 0); key(nx, 'r', this.page >= this.pages - 1);
    this.dots.innerHTML = Array.from({ length: this.pages }, (_, i) => `<img src="${lampURL(i === this.page)}" data-p="${i}">`).join('');
    this.dots.querySelectorAll<HTMLElement>('img').forEach((d) => (d.onclick = () => { this.page = Number(d.dataset.p); this.key = ''; }));
    if (this.hover) { const el = this.track.querySelector<HTMLElement>(`[data-c="${this.hover.id}"]`); if (el) this.showCard(this.hover, el); }
  }
  /** hover: a card with the container's kind icon, label and fill, what it holds (sprite and count) and its mass */
  private showCard(c: Container | null, el?: HTMLElement) {
    this.hover = c;
    if (!c || !el || this.swipe?.moved) { this.card.style.display = 'none'; return; }
    const k = ik(), all = c.contents(), top = all.slice(0, 8), mass = c.stacks.reduce((m, s) => m + itemDef(s.item).mass * s.n, 0);
    const ic = kindIcon(c.kind);
    this.card.innerHTML = `<div class="hd">${ic ? `<img src="${ic.src}" style="width:${16 * k}px;height:${16 * k}px">` : ''}<b class="inv-t">${c.label}</b><span>${Math.round(c.fill() * 100)}%</span></div>` +
      `<div class="ls">${top.map((e) => `<div><img src="${itemIcon(e.item, 32)}" title="${itemDef(e.item).name}"><span>${fmt(e.n)}</span></div>`).join('') || '<div class="mu">-</div>'}</div>` +
      `<div class="hd mu" style="margin:${3 * k}px 0 0">${all.length > top.length ? `+${all.length - top.length}` : ''}<span>${Math.round(mass)}kg</span></div>`;
    this.card.style.display = 'block'; this.card.style.width = 112 * k + 'px'; this.card.style.height = '';
    const hh = Math.ceil(this.card.getBoundingClientRect().height / k);
    Object.assign(this.card.style, { height: hh * k + 'px', backgroundImage: `url(${cardURL(112, hh, 2)})`, backgroundSize: `${112 * k}px ${hh * k}px` });
    const r = el.getBoundingClientRect();
    this.card.style.left = Math.round(r.left / k) * k + 'px';
    this.card.style.top = Math.round((r.top - hh * k - 6 * k) / k) * k + 'px';
  }
  /** a slot's screen rectangle on the current page (the tutorial points at it) */
  slotRect(i: number): DOMRect { const r = this.badges.getBoundingClientRect(), k = ik(); return new DOMRect(r.left + i * (BW + BG) * k, r.top, BW * k, BH * k); }
  dispose() { cancelAnimationFrame(this.raf); this.card.remove(); this.root.remove(); }
}

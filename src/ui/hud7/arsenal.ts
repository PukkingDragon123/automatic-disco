// HUD v7 · THE ARSENAL (hold the tool widget, right-click it, or G). Every tool the colony owns hangs on brass hooks
// along a riveted pegboard RACK, each a turning outlined 3D model; tools not owned yet hang as dark padlocked shapes.
// Swipe the rack left / right (drag with a fling, the wheel, the arrow keys): the tool at the centre lifts into the
// light with its name and numbers. Under the rack a LEATHER BELT carries the four QUICK SLOT holsters: drag a tool
// down into a holster (or press 1-4, or click a holster) to assign it; it drops in with a bounce and a puff. The
// BENCH icon opens the custom tool bench. Esc, G or a click outside closes it.
import type { Game } from '../../game/game';
import { ModelView } from '../kit/model3d';
import { plate, skin, pxCanvas } from '../kit/mat';
import { Px, P, INK, rivet, hash } from '../kit/px';
import { uiSfx } from '../kit/sound';
import { Spring, onFrame, bounceEl, placeDust, shake, pop, squash } from '../kit/juice';
import { floatIcon } from '../kit/floatIcon';
import { mCustomTool } from '../kit/models';
import { installKitStyle } from '../kit/style';
import { arsenal, setQuickCustom, quickCustom, TOOLS, type ArmEntry } from './tools';
import { toolBuild, type ToolWidget } from './toolWidget';
import { lockGlyph } from './glyphs';
import { TOOL_ANIM } from '../kit/models';

type G = Game & Record<string, any>;
const GAP = 224;
/** the pegboard: gunmetal with a grid of punched holes, an olive rail along its top */
function pegboard(w: number, h: number): Px {
  const p = plate(w, h, { mat: 'gun', seed: 61, screws: true, wear: 0.8, chamfer: 6, grime: 0.5 });
  for (let y = 22; y < h - 14; y += 10) for (let x = 14 + ((y / 10) % 2) * 5; x < w - 14; x += 10) { p.rect(x, y, 2, 2, INK); p.set(x + 2, y + 1, P.steel[4]); p.set(x + 1, y + 2, P.steel[4]); }
  // the rail
  const rail = plate(w - 16, 14, { mat: 'olive', seed: 62, chamfer: 2, wear: 0.9, lip: 1 });
  p.blit(rail, 8, 6);
  for (let x = 20; x < w - 20; x += 36) rivet(p, x, 13, 2, P.steel);
  return p;
}
/** a brass hook (a peg and a curl) */
function hookArt(): Px {
  const p = new Px(12, 14);
  p.rect(4, 0, 4, 4, P.steel[2]); p.hl(4, 7, 0, P.steel[5]);
  for (let y = 3; y < 10; y++) { p.set(5, y, P.brass[5]); p.set(6, y, P.brass[3]); }
  for (let x = 5; x < 10; x++) { p.set(x, 10, P.brass[3]); p.set(x, 11, P.brass[2]); }
  p.set(9, 9, P.brass[4]); p.set(9, 8, P.brass[5]);
  p.outline(INK);
  return p;
}
/** the leather belt: a stitched strap with brass grommets, four holsters (a pouch with a stitched flap, a brass snap,
 *  rivets at the flap's corners) and a buckle at each end */
function beltArt(w: number, h: number, pockets: number[]): Px {
  const p = new Px(w, h), sy = 20, sh = 22, L = P.clay;
  const strap = plate(w - 20, sh, { mat: 'leather', seed: 71, chamfer: 3, wear: 0.5, lip: 1, grime: 0.2 });
  p.blit(strap, 10, sy);
  for (let x = 16; x < w - 16; x += 3) { p.set(x, sy + 3, L[5]); p.set(x, sy + sh - 4, L[5]); }
  for (let x = 40; x < w - 30; x += 48) { p.disc(x, sy + sh / 2, 2.6, (d, l) => (d > 1.9 ? P.brass[l > 0 ? 5 : 2] : INK)); }
  // the end buckles
  for (const bx of [4, w - 18]) { p.rect(bx, sy - 3, 14, sh + 6, INK); p.rect(bx + 1, sy - 2, 12, sh + 4, P.brass[4]); p.rect(bx + 4, sy + 2, 6, sh - 4, INK); p.hl(bx + 1, bx + 12, sy - 2, P.brass[5]); p.vl(bx + 1, sy - 2, sy + sh + 1, P.brass[5]); p.rect(bx + 6, sy + 4, 2, sh - 8, P.steel[4]); }
  for (const cx of pockets) {
    const pw = 64, px = cx - pw / 2, top = 6, ph = h - 8;
    const pouch = plate(pw, ph, { mat: 'leather', seed: 72 + cx, chamfer: 9, wear: 0.8, lip: 2, grime: 0.55 });
    p.blit(pouch, px, top);
    // the mouth: a dark opening along the top where the tool goes in
    p.rect(px + 8, top + 2, pw - 16, 3, INK); p.hl(px + 8, px + pw - 9, top + 5, L[1]);
    // the flap: lighter leather with a curved lip and stitching, its shadow under it
    const fy = top + 6, fh = 30;
    for (let y = 0; y < fh; y++) for (let x = 3; x < pw - 3; x++) {
      const u = (x - pw / 2) / (pw / 2 - 3), lip = fh - 6 + Math.round((1 - u * u) * 6);
      if (y > lip) continue;
      const k = y === lip ? 1 : y < 2 ? 5 : x < 5 ? 4 : 3 + (((x * 3 + y * 7) % 13 === 0) ? -1 : 0);
      p.set(px + x, fy + y, L[Math.max(0, Math.min(L.length - 1, k))]);
      if (y === lip) { p.set(px + x, fy + y + 1, INK); p.set(px + x, fy + y + 2, L[0]); }
    }
    for (let x = 7; x < pw - 7; x += 3) { const u = (x - pw / 2) / (pw / 2 - 3), lip = fh - 9 + Math.round((1 - u * u) * 6); p.set(px + x, fy + lip, L[5]); }
    // the brass snap on the flap's tip, rivets at its corners
    const sx = cx, syy = fy + fh + 1;
    p.disc(sx, syy - 3, 4.2, (d, l) => (d > 3.4 ? INK : d < 1.4 ? P.brass[2] : P.brass[l > 0.2 ? 5 : l > -0.3 ? 4 : 3]));
    rivet(p, px + 7, fy + 4, 1, P.brass); rivet(p, px + pw - 8, fy + 4, 1, P.brass);
    // a stamped panel low on the pouch for the slot number
    p.rect(cx - 11, top + ph - 26, 22, 18, L[1]); p.hl(cx - 11, cx + 10, top + ph - 9, L[4]); p.vl(cx + 10, top + ph - 26, top + ph - 9, L[4]);
  }
  return p;
}

interface Card { e: ArmEntry; el: HTMLDivElement; view: ModelView | null }
export class Arsenal {
  readonly el: HTMLDivElement; isOpen = false;
  private rack: HTMLDivElement; private track: HTMLDivElement; private info: HTMLDivElement;
  private cards: Card[] = []; private idx = 0; private off = new Spring(0, { k: 160, d: 20 }); private vel = 0;
  private holsters: { el: HTMLDivElement; view: ModelView | null; key: string }[] = [];
  private drag: { x: number; y: number; lx: number; lt: number; card: Card | null; mode: '' | 'swipe' | 'carry'; ghost: HTMLCanvasElement | null } | null = null;
  private live: (() => void) | null = null;
  private key = (e: KeyboardEvent) => this.onKey(e);
  constructor(readonly g: G, readonly w: ToolWidget) {
    installKitStyle(); injectArsenalCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-ars';
    const rack = this.rack = document.createElement('div'); rack.className = 'h7-rack';
    skin(rack, (W, H) => pegboard(W, H));
    const win = document.createElement('div'); win.className = 'h7-rack-win';
    const spot = document.createElement('div'); spot.className = 'h7-spot'; win.append(spot);
    this.track = document.createElement('div'); this.track.className = 'h7-track';
    win.append(this.track);
    this.info = document.createElement('div'); this.info.className = 'h7-ars-info';
    const belt = document.createElement('div'); belt.className = 'h7-belt';
    const pockets = [0, 1, 2, 3].map((i) => 135 + i * 150);
    const bc = pxCanvas(beltArt(720, 96, pockets), 2, 'h7-belt-art'); belt.append(bc);
    for (let i = 0; i < 4; i++) {
      const h = document.createElement('div'); h.className = 'h7-hol'; h.style.left = (pockets[i] * 2 - 64) + 'px';
      const n = document.createElement('span'); n.className = 'k7-t32 h7-hol-n'; n.textContent = String(i + 1); h.append(n);
      h.addEventListener('click', (e) => { e.stopPropagation(); this.assign(i); });
      h.addEventListener('pointerenter', () => { h.classList.add('hot'); uiSfx('hover', 0.35); });
      h.addEventListener('pointerleave', () => h.classList.remove('hot'));
      belt.append(h); this.holsters.push({ el: h, view: null, key: '' });
    }
    const bench = floatIcon({ build: () => mCustomTool({ head: 'bit', core: 'reactor', grip: 'brace', mod: 'scope' }), name: 'BENCH', size: [52, 44], nameSize: 32, sound: 'open', hint: 'B', view: { pitch: 0.4, spin: 0.3 }, onClick: () => { this.open(false); this.w.openBench(); } });
    bench.el.classList.add('h7-ars-bench');
    const back = floatIcon({ build: () => mCustomTool({ head: 'lens', core: 'cell', grip: 'pistol' }), name: 'BACK', size: [40, 34], nameSize: 16, sound: 'back', view: { pitch: 0.4, spin: 0 }, onClick: () => this.open(false) });
    back.el.classList.add('h7-ars-back');
    const arrows = (d: number) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'h7-arw ' + (d < 0 ? 'l' : 'r'); b.append(pxCanvas(arrowArt(d), 2)); b.addEventListener('click', (e) => { e.stopPropagation(); this.go(this.idx + d); squash(b, 0.6); }); return b; };
    rack.append(win, this.info, arrows(-1), arrows(1), bench.el, back.el);
    el.append(rack, belt);
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.open(false); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.open(false); });
    this.wireTrack(win);
  }
  open(on: boolean) {
    if (on === this.isOpen) return;
    this.isOpen = on;
    if (on) {
      if (!this.el.isConnected) document.body.append(this.el);
      this.build();
      this.el.classList.add('on');
      this.rack.animate([{ transform: 'translateY(120%)' }, { transform: 'translateY(-4%)', offset: 0.7 }, { transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
      this.el.querySelector('.h7-belt')!.animate([{ transform: 'translateY(160%)' }, { transform: 'translateY(0)' }], { duration: 480, delay: 80, easing: 'cubic-bezier(.2,.9,.3,1.3)', fill: 'backwards' });
      this.cards.forEach((c, i) => c.el.animate([{ transform: 'translateY(-60px) rotate(-10deg)', opacity: 0 }, { transform: 'translateY(6px) rotate(4deg)', opacity: 1, offset: 0.6 }, { transform: 'translateY(0) rotate(0)' }], { duration: 420, delay: 120 + Math.abs(i - this.idx) * 50, easing: 'ease-out', fill: 'backwards' }));
      uiSfx('swishIn', 0.6); uiSfx('chain', 0.4);
      addEventListener('keydown', this.key, true);
      this.live = onFrame((dt) => { this.step(dt); return this.isOpen; });
    } else {
      removeEventListener('keydown', this.key, true);
      uiSfx('swishOut', 0.5);
      const a = this.rack.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(120%)' }], { duration: 260, easing: 'cubic-bezier(.5,0,.9,.4)' });
      a.onfinish = () => { this.el.classList.remove('on'); for (const c of this.cards) c.view?.dispose(); };
    }
  }
  private build() {
    for (const c of this.cards) c.view?.dispose();
    this.track.innerHTML = ''; this.cards = [];
    const list = arsenal(this.g), cur = this.w.current, s = this.g.colony?.slots?.slots?.[cur], qc = quickCustom(this.g, cur);
    for (const e of list) {
      const el = document.createElement('div'); el.className = 'h7-card' + (e.owned ? '' : ' lock');
      el.append(pxCanvas(hookArt(), 2, 'h7-hook'));
      let view: ModelView | null = null;
      view = new ModelView(toolBuild(e.tool, e.custom), { w: 92, h: 78, scale: 2, spin: 0, yaw0: 0.5 + hash(this.cards.length, 3) * 0.6, hotSpin: 1.6, pitch: 0.4, anim: TOOL_ANIM[e.tool], frames: 32 });
      el.append(view.cv);
      if (!e.owned) el.append(pxCanvas(lockGlyph(), 2, 'h7-card-lock'));
      const nm = document.createElement('div'); nm.className = 'k7-t16 h7-card-n'; nm.textContent = e.name; el.append(nm);
      el.addEventListener('pointerenter', () => { if (this.cards[this.idx]?.el !== el) uiSfx('hover', 0.3); });
      this.track.append(el);
      this.cards.push({ e, el, view });
    }
    const at = this.cards.findIndex((c) => (qc ? c.e.custom?.id === qc.id : !c.e.custom && c.e.tool === s?.tool));
    this.idx = Math.max(0, at); this.off.snap(this.idx * GAP);
    this.syncInfo(); this.syncHolsters();
  }
  private wireTrack(win: HTMLDivElement) {
    win.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.stopPropagation();
      const cardEl = (e.target as HTMLElement).closest('.h7-card'), card = this.cards.find((c) => c.el === cardEl) ?? null;
      this.drag = { x: e.clientX, y: e.clientY, lx: e.clientX, lt: performance.now(), card, mode: '', ghost: null };
      win.setPointerCapture(e.pointerId); this.vel = 0;
    });
    win.addEventListener('pointermove', (e) => {
      const d = this.drag; if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.mode) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { d.mode = 'swipe'; uiSfx('scroll', 0.35); }
        else if (Math.abs(dy) > 12 && d.card?.e.owned) { d.mode = 'carry'; d.ghost = this.lift(d.card); }
      }
      if (d.mode === 'swipe') { const now = performance.now(); this.off.x -= e.clientX - d.lx; this.off.target = this.off.x; this.vel = -(e.clientX - d.lx) / Math.max(0.001, (now - d.lt) / 1000) * 0.6 + this.vel * 0.4; d.lx = e.clientX; d.lt = now; }
      if (d.mode === 'carry' && d.ghost) { d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px'; this.holsters.forEach((h) => h.el.classList.toggle('drop', inside(h.el, e))); }
    });
    const up = (e: PointerEvent) => {
      const d = this.drag; this.drag = null; if (!d) return;
      if (d.mode === 'swipe') { const proj = this.off.x + this.vel * 0.25; this.go(Math.round(proj / GAP)); return; }
      if (d.mode === 'carry') {
        d.ghost?.remove(); const hi = this.holsters.findIndex((h) => inside(h.el, e)); this.holsters.forEach((h) => h.el.classList.remove('drop'));
        if (hi >= 0 && d.card) { this.go(this.cards.indexOf(d.card), true); this.assign(hi); } else uiSfx('back', 0.4);
        return;
      }
      if (d.card) { const i = this.cards.indexOf(d.card); if (i === this.idx) { d.card.view?.press(1); d.card.view?.poke(10); uiSfx('select', 0.5); } else this.go(i); }
    };
    win.addEventListener('pointerup', up); win.addEventListener('pointercancel', () => { this.drag?.ghost?.remove(); this.drag = null; });
    win.addEventListener('wheel', (e) => { e.preventDefault(); this.go(this.idx + (e.deltaY + e.deltaX > 0 ? 1 : -1)); }, { passive: false });
  }
  private lift(c: Card): HTMLCanvasElement {
    const g = document.createElement('canvas'); g.width = c.view!.w; g.height = c.view!.h;
    g.getContext('2d')!.drawImage(c.view!.cv, 0, 0);
    g.className = 'h7-ghost'; g.style.width = g.width * 2 + 'px'; g.style.height = g.height * 2 + 'px';
    document.body.append(g); uiSfx('pluck', 0.5); c.el.classList.add('lifted');
    setTimeout(() => c.el.classList.remove('lifted'), 400);
    return g;
  }
  private go(i: number, quiet = false) {
    const n = Math.max(0, Math.min(this.cards.length - 1, i));
    if (n !== this.idx) { this.idx = n; if (!quiet) uiSfx('tick', 0.5, 0.9 + (n % 3) * 0.08); this.syncInfo(); this.cards[n]?.view?.poke(6); }
    this.off.target = n * GAP; this.vel = 0;
  }
  private step(dt: number) {
    if (!this.drag || this.drag.mode !== 'swipe') this.off.step(dt);
    const W = this.track.parentElement!.clientWidth;
    this.track.style.transform = `translateX(${Math.round(W / 2 - 92 - this.off.x)}px)`;
    this.cards.forEach((c, i) => { const on = i === this.idx; c.el.classList.toggle('on', on); c.view?.hot(on); });
    for (const h of this.holsters) h.view; // (views tick themselves)
  }
  private syncInfo() {
    const c = this.cards[this.idx]; if (!c) return;
    const t = TOOLS[c.e.tool], units = this.g.colony?.slots?.candidates?.(c.e.tool)?.length ?? 0, st = c.e.custom?.stats;
    const kw = st ? t.kw + st.draw : t.kw, cd = st ? Math.max(0.1, t.cd * (1 - st.speed * 0.08)) : t.cd;
    this.info.innerHTML = '';
    const nm = document.createElement('div'); nm.className = 'k7-name k7-t48'; nm.textContent = c.e.name; this.info.append(nm);
    const row = document.createElement('div'); row.className = 'h7-ars-stats';
    const stat = (k: string, v: string, col = '') => { const e = document.createElement('span'); e.className = 'k7-t32'; if (col) e.style.color = col; e.innerHTML = `${v}<small class="k7-t16">${k}</small>`; row.append(e); };
    if (!c.e.owned) stat('', 'LOCKED', '#8f8670');
    else { stat('KW', String(kw), '#ffd98a'); stat(t.hold ? 'HOLD' : 'S', t.hold ? '' : cd.toFixed(1)); stat('UNITS', String(units), units ? '#cfe8a8' : '#f09a7a'); if (st) stat('PWR', '+' + st.power, '#ffc560'); }
    this.info.append(row);
    pop(nm, 0.3);
  }
  private syncHolsters() {
    for (let i = 0; i < 4; i++) {
      const H = this.holsters[i], s = this.g.colony?.slots?.slots?.[i], qc = quickCustom(this.g, i), key = `${s?.tool}|${qc?.id ?? ''}|${s?.level}`;
      H.el.classList.toggle('lock', (s?.level ?? 1) <= 0);
      H.el.classList.toggle('cur', i === this.w.current);
      if (key === H.key) continue;
      H.key = key; H.view?.dispose(); H.view = null;
      if (s?.tool && s.level > 0) { H.view = new ModelView(toolBuild(s.tool, qc), { w: 52, h: 44, scale: 2, spin: 0, yaw0: 0.5, pitch: 0.35, frames: 24 }); H.view.cv.classList.add('h7-hol-model'); H.el.prepend(H.view.cv); }
    }
  }
  /** put the centred tool into quick slot i */
  private assign(i: number) {
    const c = this.cards[this.idx], H = this.holsters[i], col = this.g.colony;
    if (!c || !H) return;
    if (!c.e.owned) { shake(H.el, 5); uiSfx('error', 0.5); return; }
    if (!col || !col.slots.assign(i, c.e.tool)) { shake(H.el, 6); uiSfx('error', 0.5); return; }
    setQuickCustom(this.g, i, c.e.custom?.id ?? null);
    H.key = ''; this.syncHolsters();
    if (H.view) bounceEl(H.view.cv, 0.45);
    const r = H.el.getBoundingClientRect();
    placeDust(r.left + r.width / 2, r.top + r.height * 0.62, 0.3, { layer: 'ui', ground: 'clay' });
    uiSfx('clunk', 0.5);
    this.w.focus = i; this.w.refresh(true);
  }
  private onKey(e: KeyboardEvent) {
    if (!this.isOpen) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let used = true;
    if (k === 'Escape' || k === 'g') this.open(false);
    else if (k === 'ArrowLeft' || k === 'a') this.go(this.idx - 1);
    else if (k === 'ArrowRight' || k === 'd') this.go(this.idx + 1);
    else if (k >= '1' && k <= '4') this.assign(Number(k) - 1);
    else if (k === 'Enter') { this.assign(this.w.current); this.open(false); }
    else if (k === 'b') { this.open(false); this.w.openBench(); }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
}
function inside(el: HTMLElement, e: { clientX: number; clientY: number }) { const r = el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }
function arrowArt(d: number): Px {
  const rows = d < 0 ? ['....b', '...bb', '..bbb', '.bbbb', 'bbbbb', '.bbbb', '..bbb', '...bb', '....b'] : ['b....', 'bb...', 'bbb..', 'bbbb.', 'bbbbb', 'bbbb.', 'bbb..', 'bb...', 'b....'];
  const p = new Px(9, 13); rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'b') p.set(x + 2, y + 2, y < 4 ? P.brass[5] : y < 7 ? P.brass[4] : P.brass[3]); }));
  p.outline(INK); return p;
}

let css = false;
function injectArsenalCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-ars { position: fixed; inset: 0; z-index: 9200; display: none; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 40px; gap: 0; background: radial-gradient(ellipse at 50% 70%, rgba(8,9,12,.45), rgba(8,9,12,.85)); }
.h7-ars.on { display: flex; }
.h7-rack { position: relative; width: 1320px; height: 470px; }
.h7-rack > * { position: relative; z-index: 1; }
.h7-rack-win { position: absolute !important; left: 40px; right: 40px; top: 40px; height: 250px; overflow: hidden; cursor: grab; touch-action: none; }
.h7-spot { position: absolute; left: 50%; top: -30px; width: 420px; height: 330px; transform: translateX(-50%); pointer-events: none; background: radial-gradient(ellipse 50% 46% at 50% 44%, rgba(255,214,140,.22), rgba(255,190,100,.08) 55%, rgba(255,190,100,0) 72%); }
.h7-track { position: absolute; left: 0; top: 0; height: 100%; display: flex; gap: 38px; will-change: transform; }
.h7-card { position: relative; width: 184px; height: 250px; display: flex; flex-direction: column; align-items: center; transition: transform .25s cubic-bezier(.2,.9,.3,1.4), filter .2s, opacity .2s; opacity: .72; filter: brightness(.82); transform-origin: 50% 0; }
.h7-card.on { opacity: 1; filter: brightness(1.18) drop-shadow(0 0 10px rgba(255,205,120,.55)); transform: translateY(14px); }
.h7-card.lock .k7-model { filter: brightness(.12) contrast(1.4); }
.h7-card.lifted { opacity: .25; }
.h7-hook { display: block; margin-bottom: -6px; }
.h7-card .k7-model { display: block; filter: drop-shadow(4px 5px 0 rgba(5,6,8,.5)); }
.h7-card-lock { position: absolute; left: 50%; top: 80px; transform: translateX(-50%); }
.h7-card-n { margin-top: 2px; }
.h7-ars-info { position: absolute !important; left: 0; right: 0; top: 300px; display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
.h7-ars-stats { display: flex; gap: 34px; }
.h7-ars-stats small { margin-left: 6px; color: var(--k7-dim); }
.h7-arw { position: absolute !important; top: 140px; border: 0; background: none; padding: 6px; cursor: pointer; line-height: 0; transition: transform .2s cubic-bezier(.2,.9,.3,1.6), filter .15s; filter: drop-shadow(2px 3px 0 rgba(5,6,8,.5)); }
.h7-arw.l { left: 6px; } .h7-arw.r { right: 6px; }
.h7-arw:hover { transform: scale(1.15); filter: brightness(1.25) drop-shadow(0 0 6px rgba(255,200,110,.6)); }
.h7-ars-bench { position: absolute !important; right: 46px; bottom: 20px; }
.h7-ars-back { position: absolute !important; left: 46px; bottom: 26px; }
.h7-belt { position: relative; width: 1440px; height: 192px; margin-top: -26px; z-index: 2; }
.h7-belt-art { position: absolute; left: 0; top: 0; }
.h7-hol { position: absolute; top: 0; width: 128px; height: 176px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; cursor: pointer; transition: transform .2s cubic-bezier(.2,.9,.3,1.6), filter .15s; }
.h7-hol .h7-hol-model { display: block; margin-top: -24px; filter: drop-shadow(3px 4px 0 rgba(5,6,8,.5)); }
.h7-hol-n { position: absolute; bottom: 22px; color: #c9a77c; }
.h7-hol.cur .h7-hol-n { color: var(--k7-amber); }
.h7-hol.hot, .h7-hol.drop { transform: translateY(-6px); filter: brightness(1.2) drop-shadow(0 0 10px rgba(255,200,110,.7)); }
.h7-hol.lock { filter: grayscale(.8) brightness(.55); }
.h7-ghost { position: fixed; z-index: 9600; transform: translate(-50%, -50%) rotate(-8deg); pointer-events: none; image-rendering: pixelated; filter: drop-shadow(6px 10px 0 rgba(5,6,8,.45)) brightness(1.15); }
`;
  document.head.append(s);
}

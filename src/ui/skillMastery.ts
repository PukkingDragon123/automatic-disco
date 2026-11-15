// The MASTERY tab of the program terminal: five engineering paths down the left, the selected path's tree on a
// phosphor canvas in the middle (three sub-specialty columns, four tiers gated by level, circuit traces that light
// as perks are installed, hand-pixelled node art), the hovered or selected perk's card on the right.
import { el } from './kit';
import { sfx } from '../audio/audio';
import { csfx } from './cineAudio';
import { PATHS, PATH, SUBS, SUB, PERKS, PERK, TIER_LV, FOCUS_LV, LV_XP, MAX_LV, type PathId, type Perk, type Mastery } from '../research/mastery';
import { iconCanvas, iconURL, iconsReady, type PalKey } from '../research/ui/icons';
import { nodeFrame, installHardware } from '../research/ui/hardware';

export interface TabPage { el: HTMLElement; update(dt: number): void; dispose(): void; key?(e: KeyboardEvent): boolean }
type NodeSt = 'owned' | 'ready' | 'short' | 'locked' | 'barred';
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const C = { ink: '#a9cdae', hot: '#d2e4d3', glow: '#7fb88a', dim: '#557f5f', faint: '#264a32', deep: '#14261b', bg: '#071209', amber: '#d9a43a', amberHi: '#ecd29a', red: '#cc6252' };

export class MasteryPage implements TabPage {
  readonly el: HTMLElement;
  path: PathId;
  private cv: HTMLCanvasElement; private cx: CanvasRenderingContext2D;
  private list: HTMLElement; private det: HTMLElement; private treeBox: HTMLElement;
  private hits: { id: string; x: number; y: number; w: number; h: number }[] = [];
  private hover: string | null = null; private sel: string | null = null;
  private t = 0; private sig = ''; private W = 0; private H = 0; private dpr = 1;
  private flash = new Map<string, number>();
  private ro: ResizeObserver;
  constructor(readonly M: Mastery, path?: PathId, private onChange?: () => void) {
    this.path = path ?? PATHS.reduce((b, p) => (M.points(p) > M.points(b) ? p : b), 'plant' as PathId);
    installHardware();
    this.el = el('div', 'pt-page pm');
    this.list = el('div', 'pt-col', this.el);
    this.treeBox = el('div', 'pm-tree', this.el);
    this.cv = el('canvas', '', this.treeBox); this.cx = this.cv.getContext('2d')!;
    this.det = el('div', 'pt-col pm-det', this.el);
    this.cv.addEventListener('pointermove', (e) => { const h = this.hit(e); if (h !== this.hover) { this.hover = h; if (h?.startsWith('focus:')) { this.draw(); return; } if (h) sfx('click', 1.6, 0.08); this.drawDet(); this.draw(); } });
    this.cv.addEventListener('pointerleave', () => { this.hover = null; this.drawDet(); this.draw(); });
    this.cv.addEventListener('click', (e) => { const h = this.hit(e); if (h?.startsWith('focus:')) { if (M.setFocus(this.path, h.slice(6))) { csfx('thud', 1, 0.8); sfx('done'); this.drawList(); this.drawDet(); this.onChange?.(); } return; } if (!h) { this.sel = null; this.drawDet(); this.draw(); return; } if (this.sel === h && !M.why(h)) { this.take(h); return; } this.sel = h; sfx('click'); this.drawDet(); this.draw(); });
    this.cv.addEventListener('dblclick', (e) => { const h = this.hit(e); if (h) this.take(h); });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.treeBox);
    void Promise.all(['22px Body', '24px Title', '32px TitleL', '48px Title'].map((f) => document.fonts?.load?.(f))).then(() => this.draw());
    this.drawList(); this.drawDet();
    void iconsReady.then(() => { this.drawList(); this.drawDet(); this.draw(); });
  }
  private resize() {
    const r = this.treeBox.getBoundingClientRect(); this.dpr = Math.max(1, Math.min(2, devicePixelRatio || 1));
    this.W = Math.max(200, Math.floor(r.width)); this.H = Math.max(200, Math.floor(r.height));
    this.cv.width = Math.floor(this.W * this.dpr); this.cv.height = Math.floor(this.H * this.dpr);
    this.draw();
  }
  private hit(e: PointerEvent | MouseEvent) { const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; for (const h of this.hits) if (x >= h.x && y >= h.y && x <= h.x + h.w && y <= h.y + h.h) return h.id; return null; }
  setPath(p: PathId) { if (p === this.path) return; this.path = p; this.sel = this.hover = null; csfx('relay', 0.5); this.drawList(); this.drawDet(); this.draw(); }
  private take(id: string) {
    if (this.M.why(id)) { sfx('deny'); return; }
    this.M.take(id); this.flash.set(id, this.t); csfx('thud', 0.9, 0.9); csfx('servo', 0.6, 1.2); sfx('done', 0.8, 0.6);
    this.sel = id; this.drawList(); this.drawDet(); this.draw(); this.onChange?.();
  }
  key(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k === 'q' || k === 'e' || k === 'arrowup' || k === 'arrowdown') { const i = PATHS.indexOf(this.path), d = k === 'q' || k === 'arrowup' ? -1 : 1; this.setPath(PATHS[(i + d + PATHS.length) % PATHS.length]); return true; }
    if (k === 'enter' && this.sel) { this.take(this.sel); return true; }
    return false;
  }

  // ---------------------------------------------------------------- state
  private st(p: Perk): NodeSt {
    const M = this.M;
    if (M.has(p.id) && M.perks().includes(p.id)) return 'owned';
    const f = M.focus(p.path);
    if (p.tier >= 3 && f && f !== p.sub) return 'barred';
    if (M.level(p.path) < TIER_LV[p.tier]) return 'locked';
    return M.why(p.id) ? 'short' : 'ready';
  }
  private signature() { const M = this.M; return [this.path, ...PATHS.map((p) => M.xp(p).toFixed(0) + ':' + M.points(p) + ':' + (M.focus(p) ?? '')), M.perks().join(',')].join('|'); }
  update(dt: number) {
    this.t += dt;
    const s = this.signature();
    if (s !== this.sig) { this.sig = s; this.drawList(); this.drawDet(); }
    this.draw();
  }

  // ---------------------------------------------------------------- left: the five paths
  private drawList() {
    const M = this.M; this.list.innerHTML = '';
    el('div', 'pt-h', this.list, 'ENGINEERING PATHS');
    for (const p of PATHS) {
      const d = PATH[p], lv = M.level(p), pts = M.points(p), f = M.focus(p);
      const c = el('div', 'pm-path' + (p === this.path ? ' on' : ''), this.list);
      const img = el('img', 'pt-ico', c); img.src = iconURL(d.icon, p === this.path ? 'lit' : 'phos');
      el('div', 'nm', c, d.short);
      el('div', 'lv', c, `LV ${lv}`);
      const bar = el('div', 'pt-bar', c); el('i', '', bar).style.width = `calc(${(lv >= MAX_LV ? 1 : M.frac(p)) * 100}% - 4px)`;
      el('div', 'sub', c, `<span>${f ? 'FOCUS ' + SUB[f].name : lv >= FOCUS_LV ? '<span class="pt-amb">FOCUS UNCHOSEN</span>' : Math.floor(M.xp(p)) + ' / ' + (LV_XP[Math.min(MAX_LV, lv + 1)]) + ' XP'}</span><span class="pts">${pts > 0 ? pts + ' PT' + (pts > 1 ? 'S' : '') : ''}</span>`);
      c.addEventListener('click', () => this.setPath(p));
    }
    const tot = PATHS.reduce((s, p) => s + M.level(p), 0);
    const b = el('div', 'pt-box', this.list);
    el('div', 'pt-txt', b, `1 point per level`);
    el('div', 'pt-txt', b, `Focus at level ${FOCUS_LV}`);
    el('div', 'pt-txt dim', b, `Mastery ${tot} / ${MAX_LV * PATHS.length}`);
  }

  // ---------------------------------------------------------------- right: the card
  private drawDet() {
    const M = this.M, hv = this.hover?.startsWith('focus:') ? null : this.hover, id = hv ?? this.sel, p = id ? PERK[id] : null; this.det.innerHTML = '';
    if (!p) { this.pathCard(); return; }
    const s = this.st(p);
    el('div', 'pt-h', this.det, `TIER ${ROMAN[p.tier]} · ${SUB[p.sub].name}${p.tier === 4 ? ' · CAPSTONE' : ''}`);
    const head = el('div', 'head', this.det);
    const cv = el('canvas', '', head); cv.width = 96; cv.height = 96; const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false; g.drawImage(iconCanvas(p.icon, s === 'owned' ? 'lit' : s === 'locked' || s === 'barred' ? 'dim' : 'phos'), 0, 0, 96, 96);
    const hh = el('div', '', head); el('div', 'nm', hh, p.name); el('div', 'k', hh, `${PATH[p.path].name} · ${p.cost} POINT${p.cost > 1 ? 'S' : ''}`);
    el('div', 'pt-txt big', this.det, p.desc);
    const box = el('div', 'pt-box', this.det);
    for (const l of p.plus) el('div', 'pt-txt pt-plus', box, l);
    for (const l of p.minus ?? []) el('div', 'pt-txt pt-minus', box, l);
    const why = M.why(p.id);
    const line = el('div', 'pt-txt', this.det, s === 'owned' ? '<span class="pt-amb">INSTALLED IN UNIT 07</span>' : why ? `<span class="pt-warn">${why.toUpperCase()}</span>` : `READY · ${M.points(p.path)} POINT${M.points(p.path) === 1 ? '' : 'S'} ON THIS PATH`);
    line.style.marginTop = '4px';
    const k = el('div', 'pt-key' + (s === 'owned' ? ' dead' : why ? ' dead' : ' arm'), this.det, s === 'owned' ? 'INSTALLED' : 'INSTALL PERK  [ENTER]');
    k.style.alignSelf = 'flex-start';
    k.addEventListener('click', () => this.take(p.id));
    this.xpLog(p.path);
  }
  private pathCard() {
    const M = this.M, d = PATH[this.path];
    el('div', 'pt-h', this.det, d.name);
    el('div', 'pt-txt big', this.det, d.motto);
    const b = el('div', 'pt-box', this.det);
    el('div', 'pt-h', b, 'XP COMES FROM');
    for (const l of d.earn) el('div', 'pt-txt pt-plus', b, l);
    const f = M.focus(this.path);
    const fb = el('div', 'pt-box' + (M.canFocus(this.path) ? ' hot' : ''), this.det);
    el('div', 'pt-h', fb, 'FOCUS');
    el('div', 'pt-txt', fb, f ? `${SUB[f].name}. Its tiers III and IV are open; the other two are barred. This path learns 15% faster.` : M.level(this.path) >= FOCUS_LV ? 'Choose one sub-specialty on the tree. The choice is permanent.' : `Chosen at level ${FOCUS_LV}. Until then every tier I and II perk is open.`);
    this.xpLog(this.path);
  }
  private xpLog(p: PathId) {
    const lg = this.M.log.filter((l) => l.path === p).slice(0, 7);
    const b = el('div', 'pt-box', this.det); b.style.marginTop = 'auto';
    el('div', 'pt-h', b, 'RECENT WORK');
    if (!lg.length) el('div', 'pt-txt dim', b, 'Nothing yet on this path.');
    for (const l of lg) el('div', 'pt-log', b, `<b>+${Math.round(l.n)}</b><span>${l.why || 'Work'}</span>`);
  }

  // ---------------------------------------------------------------- the tree canvas
  private draw() {
    const g = this.cx, W = this.W, H = this.H, M = this.M, t = this.t; if (!W) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    const lv = M.level(this.path), d = PATH[this.path], f = M.focus(this.path);
    // header
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.hot; g.font = '32px TitleL'; g.fillText(d.name, 12, 34);
    g.fillStyle = C.dim; g.font = '22px Body'; g.fillText(d.motto, 12, 60);
    g.textAlign = 'right'; g.fillStyle = C.hot; g.font = '48px Title'; g.fillText(`LV ${lv}`, W - 12, 40);
    const pts = M.points(this.path);
    g.font = '22px Body'; g.fillStyle = pts > 0 ? C.amberHi : C.dim; g.fillText(pts > 0 ? `${pts} POINT${pts > 1 ? 'S' : ''} TO SPEND` : 'NO POINTS', W - 12, 64);
    g.textAlign = 'left';
    const canF = M.canFocus(this.path);
    if (canF) { const k = 0.6 + 0.4 * Math.sin(t * 4); g.fillStyle = k > 0.8 ? C.amberHi : C.amber; g.font = '22px Body'; g.fillText('CHOOSE A FOCUS: THE OTHER TWO LOSE TIERS III AND IV', 12, 88); }
    const top = 172, rail = 74, colW = (W - rail - 10) / 3, rowH = (H - top - 8) / 4;
    // tier rails and level gates
    for (let tr = 1 as 1 | 2 | 3 | 4; tr <= 4; tr = (tr + 1) as 1 | 2 | 3 | 4) {
      const y0 = top + (tr - 1) * rowH, reached = lv >= TIER_LV[tr];
      if (!reached) { const yy = Math.round(y0); g.fillStyle = 'rgba(2, 6, 4, 0.55)'; g.fillRect(rail, yy, W - rail, Math.round(rowH)); g.fillStyle = '#14261b'; for (let py = yy + 4; py < yy + rowH; py += 8) for (let px = rail + ((py >> 3) & 1) * 4; px < W; px += 8) g.fillRect(px, py, 2, 2); }
      g.fillStyle = reached ? C.glow : C.faint; g.font = '32px TitleL'; g.fillText(ROMAN[tr], 14, Math.round(y0 + rowH / 2));
      g.font = '22px Body'; g.fillText(`LV ${TIER_LV[tr]}`, 14, Math.round(y0 + rowH / 2 + 24));
      g.fillStyle = reached ? C.faint : C.deep; for (let x0 = rail; x0 < W - 4; x0 += 10) g.fillRect(x0, Math.round(y0), 6, 2);
    }
    // column heads
    this.hits = [];
    const subs = SUBS.filter((s) => s.path === this.path);
    subs.forEach((s, i) => {
      const x0 = rail + i * colW, cxm = x0 + colW / 2, isF = f === s.id, barred = !!f && !isF;
      g.drawImage(iconCanvas(s.icon, barred ? 'dim' : 'phos'), Math.round(cxm - 24), 76, 48, 48);
      g.textAlign = 'center'; g.font = '24px Title'; g.fillStyle = isF ? C.amberHi : barred ? C.faint : C.ink;
      g.fillText(s.name, Math.round(cxm), 146);
      g.font = '11px Body';
      if (canF) {
        const bw = 132, bx = Math.round(cxm - bw / 2), by = 150, hot = this.hover === 'focus:' + s.id;
        g.fillStyle = hot ? '#4f3816' : '#2a1d0c'; g.fillRect(bx, by, bw, 22);
        g.strokeStyle = hot ? C.amberHi : C.amber; g.lineWidth = 2; g.strokeRect(bx + 1, by + 1, bw - 2, 20);
        g.fillStyle = hot ? '#fff3d6' : C.amberHi; g.fillText('SET FOCUS', Math.round(cxm), by + 15);
        this.hits.push({ id: 'focus:' + s.id, x: bx, y: by, w: bw, h: 22 });
      } else if (isF) { g.fillStyle = C.amber; g.fillText('FOCUS', Math.round(cxm), 164); }
      else if (barred) { g.fillStyle = C.red; g.fillText('BARRED ABOVE TIER II', Math.round(cxm), 164); }
      else { g.fillStyle = C.dim; g.fillText(s.blurb.toUpperCase().replace(/\.$/, ''), Math.round(cxm), 164); }
      g.textAlign = 'left';
    });
    // nodes and traces
    const pos = new Map<string, { x: number; y: number; s: number }>();
    for (const p of PERKS.filter((q) => q.path === this.path)) {
      const i = subs.findIndex((s) => s.id === p.sub), s = p.tier === 4 ? 124 : 112;
      const x = Math.round(rail + i * colW + colW / 2 - s / 2), y = Math.round(top + (p.tier - 1) * rowH + rowH / 2 - s / 2 - 14);
      pos.set(p.id, { x, y, s });
    }
    for (const p of PERKS.filter((q) => q.path === this.path && q.tier > 1)) {
      const prev = PERKS.find((q) => q.sub === p.sub && q.tier === p.tier - 1)!, a = pos.get(prev.id)!, b = pos.get(p.id)!;
      const lit = M.perks().includes(prev.id), on = lit && M.perks().includes(p.id);
      const xm = Math.round(a.x + a.s / 2), y0 = a.y + a.s + 30, y1 = b.y - 4;
      g.fillStyle = on ? C.amber : lit ? C.glow : C.faint;
      g.fillRect(Math.round(xm - 2), y0, 4, y1 - y0);
      // pads and a travelling pulse on live traces
      g.fillRect(Math.round(xm - 5), y0 - 2, 10, 3); g.fillRect(Math.round(xm - 5), y1 - 1, 10, 3);
      if (lit && !on) { const k = ((t * 0.6) % 1), py = y0 + (y1 - y0) * k; g.fillStyle = C.hot; g.fillRect(Math.round(xm - 3), Math.round(py), 6, 6); }
    }
    for (const p of PERKS.filter((q) => q.path === this.path)) this.node(p, pos.get(p.id)!);
  }
  private node(p: Perk, q: { x: number; y: number; s: number }) {
    const g = this.cx, st = this.st(p), t = this.t, hov = this.hover === p.id, sel = this.sel === p.id;
    const { x, y, s } = q, cap = p.tier === 4;
    const fl = this.flash.has(p.id) ? Math.max(0, 1 - (t - this.flash.get(p.id)!) / 0.8) : 0;
    // the socket: painted pixel-art hardware at 2x, its lamp rim by state (ready pulses between two frames)
    const fs = st === 'owned' || fl > 0 ? 'owned' : hov || sel ? 'hover' : st === 'ready' ? (Math.floor(t * 2) % 2 ? 'ready2' : 'ready') : st;
    g.drawImage(nodeFrame(fs as never, cap), x, y, s, s);
    // the lowpix-painted art behind the glass (re-inked dark when out of reach)
    const pal: PalKey = st === 'locked' || st === 'barred' ? 'dim' : 'phos';
    const off = (s - 96) / 2;
    g.drawImage(iconCanvas(p.icon, pal), x + off, y + off, 96, 96);
    if (st === 'short') { g.fillStyle = 'rgba(4, 10, 6, 0.35)'; g.fillRect(x + off, y + off, 96, 96); }
    if (st === 'barred') { g.fillStyle = '#b8382e'; for (let k = 0; k < 88; k += 2) { g.fillRect(x + off + 4 + k, y + off + 4 + k, 2, 2); g.fillRect(x + off + 90 - k, y + off + 4 + k, 2, 2); } }
    // cost pips along the bottom rim
    for (let k = 0; k < p.cost; k++) { g.fillStyle = st === 'owned' ? '#d9a43a' : st === 'ready' ? '#b9dcbd' : '#264a32'; g.fillRect(x + off + 2 + k * 10, y + s - 6, 8, 4); }
    // the name plate under the socket
    g.textAlign = 'center'; g.font = '24px Title'; g.fillStyle = st === 'owned' ? C.amberHi : st === 'locked' || st === 'barred' ? C.faint : hov || sel ? C.hot : C.ink;
    g.fillText(p.name, Math.round(x + s / 2), y + s + 22);
    g.textAlign = 'left';
    this.hits.push({ id: p.id, x, y, w: s, h: s + 26 });
  }
  dispose() { this.ro.disconnect(); this.el.remove(); }
}

// HUD v7 · THE MAP. Top right, a SURVEY WINDOW: the painted region (mapPaint.ts) in a riveted steel bezel with brass
// corner plates, the pod, units, seams and the camera's view on it; click to look there, right-click to send the
// selected drone or teammate. M (or the MAP icon under it) opens the FULL MAP with an iris from the window: the region
// painted at 2 art px per metre on a big bezel with a compass rose and a scale bar, landmarks as painted icons (their
// names float on hover), seams, buildings, rival towers, units and the fog of war as painted cloud. Wheel zooms about
// the pointer in whole-pixel steps, drag pans with a fling, double-click zooms in, click looks there and closes.
import type { Game } from '../../game/game';
import { Px, P, INK, hex } from '../kit/px';
import { plate, skin, pxCanvas } from '../kit/mat';
import { floatIcon } from '../kit/floatIcon';
import { uiSfx } from '../kit/sound';
import { transition } from '../kit/transitions';
import { onFrame, Spring, pop } from '../kit/juice';
import { installKitStyle } from '../kit/style';
import { paintTerrain, paintFog, type Landmark } from './mapPaint';
import { markGlyph, compassGlyph, type MarkKind } from './glyphs';
import * as THREE from 'three';

type G = Game & Record<string, any>;
const MINI = 128, MK = MINI / 160;

/** the shared picture of what is on the map right now (units, buildings, rivals), in world metres */
interface Dot { x: number; z: number; kind: MarkKind; name: string; key: string; col?: number }
function dotsOf(g: G): Dot[] {
  const out: Dot[] = [], c = g.colony, vis = g.vision, N = g.region?.N ?? 160;
  const seen = (x: number, z: number) => !vis?.seen || vis.seen[Math.max(0, Math.min(N - 1, Math.floor(z))) * N + Math.max(0, Math.min(N - 1, Math.floor(x)))] > 0;
  if (c?.pod) out.push({ x: c.pod.x, z: c.pod.z, kind: 'pod', name: 'POD CP-07', key: 'pod' });
  for (const s of c?.structures ?? []) out.push({ x: s.x, z: s.z, kind: 'struct', name: String(s.name ?? 'STRUCTURE').toUpperCase(), key: 'st' + s.id });
  for (const d of c?.drones ?? []) out.push({ x: d.x, z: d.z, kind: 'drone', name: String(d.name ?? 'DRONE').toUpperCase(), key: 'dr' + d.id });
  for (const t of c?.teammates ?? []) if (t.alive) out.push({ x: t.x, z: t.z, kind: 'worker', name: String(t.name ?? 'CREW').toUpperCase(), key: 'tm' + t.id });
  for (const b of g.factory?.buildings ?? []) if (!b.dead && String(b.faction ?? 'veyr') === 'veyr') out.push({ x: b.x ?? b.cx ?? 0, z: b.z ?? b.cz ?? 0, kind: 'building', name: String(b.def?.name ?? b.kind ?? 'BUILDING').toUpperCase(), key: 'b' + b.id });
  for (const s of g.factions?.structures ?? []) if (!s.dead && seen(s.x, s.z)) out.push({ x: s.x, z: s.z, kind: 'rival', name: String(s.faction ?? 'RIVAL').toUpperCase(), key: 'rv' + (s.id ?? out.length) });
  for (const cr of g.world?.creatures ?? []) if (!cr.dead && cr.visibleNow && cr.faction !== 'veyr') out.push({ x: cr.x, z: cr.z, kind: 'beast', name: String(cr.sp?.name ?? 'CREATURE').toUpperCase(), key: 'cr' + cr.id });
  return out;
}

// ================================================================== the survey window (minimap)
export class MiniMap {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement; private c: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null; private fog: HTMLCanvasElement | null = null; private fogT = 0; private t = 0; private acc = 0;
  readonly mapIcon: ReturnType<typeof floatIcon>;
  constructor(readonly g: G, readonly openFull: (from: { x: number; y: number }) => void) {
    installKitStyle(); injectMapCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-mini';
    const frame = document.createElement('div'); frame.className = 'h7-mini-frame'; el.append(frame);
    skin(frame, (w, h) => { const p = plate(w, h, { mat: 'gun', seed: 23, screws: true, wear: 0.7, chamfer: 5, wells: [[8, 8, w - 16, h - 16, 'clear']] }); brassCorners(p, w, h); return p; });
    this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = MINI; this.cv.className = 'h7-mini-cv';
    this.c = this.cv.getContext('2d')!; this.c.imageSmoothingEnabled = false;
    frame.append(this.cv);
    this.mapIcon = floatIcon({ canvas: pxCanvas(compassGlyph(), 2), name: 'MAP', nameSize: 16, sound: 'open', hint: 'M', onClick: () => { const r = this.cv.getBoundingClientRect(); this.openFull({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); } });
    this.mapIcon.el.classList.add('h7-mini-icon');
    el.append(this.mapIcon.el);
    const at = (e: MouseEvent) => { const r = this.cv.getBoundingClientRect(), N = g.region?.N ?? 160; return { x: ((e.clientX - r.left) / r.width) * N, z: ((e.clientY - r.top) / r.height) * N }; };
    this.cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); const p = at(e); if (e.button === 2) { order(g, p.x, p.z); return; } g.cam?.lookAt?.(p.x, p.z); uiSfx('tick', 0.4); });
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.cv.addEventListener('dblclick', () => { const r = this.cv.getBoundingClientRect(); this.openFull({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); });
    onFrame((dt) => { if (!this.el.isConnected) return false; this.update(dt); return true; });
  }
  private update(dt: number) {
    this.t += dt; this.acc -= dt; this.fogT -= dt;
    if (this.acc > 0) return; this.acc = 0.25;
    const g = this.g, R = g.region; if (!R) return;
    if (!this.base) this.base = paintTerrain(R, R.pal, MK).px.canvas();
    if (this.fogT <= 0 || !this.fog) { this.fogT = 2; this.fog = paintFog(R, g.vision?.seen ?? null, MK).canvas(); }
    const c = this.c; c.clearRect(0, 0, MINI, MINI);
    c.drawImage(this.base, 0, 0); c.drawImage(this.fog, 0, 0);
    const k = MINI / R.N;
    // the control ring: a dashed red circle
    const col = g.colony;
    if (col?.pod) ring(c, col.pod.x * k, col.pod.z * k, (col.controlRadius ?? 30) * k, P.ruby[4]);
    // seams
    const sn = g.vision?.seen, NN = R.N;
    for (const d of R.deposits) if (!d.hidden && d.amount > 0 && (!sn || sn[Math.floor(d.z) * NN + Math.floor(d.x)])) { const x = Math.round(d.x * k), y = Math.round(d.z * k); c.fillStyle = hex(INK); c.fillRect(x - 1, y - 1, 3, 3); c.fillStyle = hex(d.kind === 'crystal' ? P.glowTeal[3] : P.copper[5]); c.fillRect(x, y, 1, 1); }
    for (const d of dotsOf(g)) {
      const x = Math.round(d.x * k), y = Math.round(d.z * k);
      if (d.kind === 'pod') { const gl = markGlyph('pod', 1); c.drawImage(gl.canvas(), x - (gl.w >> 1), y - (gl.h >> 1)); continue; }
      const cc = d.kind === 'beast' ? P.coral[5] : d.kind === 'rival' ? P.ruby[5] : d.kind === 'worker' ? P.sapphire[5] : d.kind === 'drone' ? P.ochre[6] : P.bone[5];
      c.fillStyle = hex(INK); c.fillRect(x - 1, y - 1, 3, 3); c.fillStyle = hex(cc); c.fillRect(x, y, 1 + (d.kind === 'building' ? 1 : 0), 1 + (d.kind === 'building' ? 1 : 0));
    }
    // the camera's view
    const q = viewQuad(g); if (q) { c.strokeStyle = hex(P.snow[5]); c.lineWidth = 1; c.beginPath(); q.forEach(([x, z], i) => { const X = Math.round(x * k) + 0.5, Y = Math.round(z * k) + 0.5; if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.closePath(); c.stroke(); }
  }
}

// ================================================================== the full map
export class MapScreen {
  readonly el: HTMLDivElement; private cv: HTMLCanvasElement; private c: CanvasRenderingContext2D;
  isOpen = false;
  private base: { px: Px; marks: Landmark[] } | null = null; private baseCv: HTMLCanvasElement | null = null; private fogCv: HTMLCanvasElement | null = null;
  private zoom = new Spring(4, { k: 200, d: 22 }); private zoomT = 4; private voidPat: CanvasPattern | null = null; private pan = { x: 0, y: 0 }; private vel = { x: 0, y: 0 };
  private drag: { x: number; y: number; lx: number; ly: number; lt: number; moved: boolean } | null = null;
  private hover: { x: number; y: number } | null = null; private hot = ''; private tip: HTMLDivElement;
  private t = 0; private dirty = true; private from = { x: innerWidth - 150, y: 150 };
  private anchor: { sx: number; sy: number; ax: number; ay: number } | null = null;
  private layers = { marks: true, units: true, fog: true };
  constructor(readonly g: G) {
    installKitStyle(); injectMapCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-map';
    const frame = document.createElement('div'); frame.className = 'h7-map-frame'; el.append(frame);
    skin(frame, (w, h) => { const p = plate(w, h, { mat: 'gun', seed: 41, screws: true, rivets: true, wear: 0.9, chamfer: 8, hazard: 0, wells: [[14, 14, w - 28, h - 28, 'clear']] }); brassCorners(p, w, h, 18); return p; });
    this.cv = document.createElement('canvas'); this.cv.className = 'h7-map-cv';
    this.c = this.cv.getContext('2d')!;
    frame.append(this.cv);
    // the rail of floating icons over the frame: layers and close
    const rail = document.createElement('div'); rail.className = 'h7-map-rail'; frame.append(rail);
    const lay = (k: keyof MapScreen['layers'], kind: MarkKind, name: string) => { const fi = floatIcon({ canvas: pxCanvas(markGlyph(kind, 2), 2), name, nameSize: 16, sound: 'toggle', onClick: () => { this.layers[k] = !this.layers[k]; fi.setOn(this.layers[k]); this.dirty = true; } }); fi.setOn(true); rail.append(fi.el); };
    lay('marks', 'peak', 'LANDMARKS'); lay('units', 'worker', 'UNITS'); lay('fog', 'lake', 'FOG');
    const close = floatIcon({ canvas: pxCanvas(compassGlyph(), 2), name: 'CLOSE', nameSize: 16, sound: 'back', onClick: () => this.open(false) });
    rail.append(close.el);
    this.tip = document.createElement('div'); this.tip.className = 'k7-tip k7-t16'; document.body.append(this.tip);
    this.wire();
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.open(false); });
    addEventListener('keydown', (e) => { if (this.isOpen && e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); this.open(false); } }, true);
    onFrame((dt) => { this.update(dt); return true; });
  }
  /** open (or close) with an iris from the survey window */
  open(on = !this.isOpen, from?: { x: number; y: number }) {
    if (on === this.isOpen) return;
    if (from) this.from = from;
    void transition('iris', () => {
      this.isOpen = on;
      this.el.classList.toggle('on', on);
      if (on) { if (!this.el.isConnected) document.body.append(this.el); this.centreOnPod(); this.dirty = true; this.fogCv = null; }
      else this.tip.classList.remove('on');
    }, { x: this.from.x, y: this.from.y, ms: 300 });
  }
  private centreOnPod() { const c = this.g.colony, R = this.g.region; if (!R) return; this.pan.x = (c?.pod?.x ?? R.N / 2) * 2; this.pan.y = (c?.pod?.z ?? R.N / 2) * 2; this.zoomT = 4; this.zoom.snap(4); }
  private wire() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => { if (e.button === 2) { const w = this.toWorld(e); if (w) { order(this.g, w.x, w.z); uiSfx('confirm', 0.5); } return; } this.drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), moved: false }; this.vel.x = this.vel.y = 0; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(); this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; this.dirty = true;
      const d = this.drag; if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) { d.moved = true; cv.classList.add('grab'); uiSfx('scroll', 0.3); }
      if (!d.moved) return;
      const now = performance.now(), dt = Math.max(1, now - d.lt) / 1000, z = this.zoom.x, dx = (e.clientX - d.lx) / z, dy = (e.clientY - d.ly) / z;
      this.pan.x -= dx; this.pan.y -= dy; this.vel.x = this.vel.x * 0.4 - (dx / dt) * 0.6; this.vel.y = this.vel.y * 0.4 - (dy / dt) * 0.6;
      d.lx = e.clientX; d.ly = e.clientY; d.lt = now; this.anchor = null;
    });
    const up = (e: PointerEvent) => {
      const d = this.drag; this.drag = null; cv.classList.remove('grab'); if (!d) return;
      if (!d.moved) { this.vel.x = this.vel.y = 0; const w = this.toWorld(e); if (w) { this.g.cam?.lookAt?.(w.x, w.z); uiSfx('select', 0.5); if (this.hot) this.open(false); } }
      else if (performance.now() - d.lt > 90) this.vel.x = this.vel.y = 0;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { this.hover = null; this.tip.classList.remove('on'); this.dirty = true; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); this.zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    cv.addEventListener('dblclick', (e) => { const r = cv.getBoundingClientRect(); this.zoomAt(1, e.clientX - r.left, e.clientY - r.top); });
  }
  /** zoom by whole steps (1..8 screen px per art px) about a canvas point */
  private zoomAt(dir: number, sx: number, sy: number) {
    const z = Math.max(1, Math.min(8, this.zoomT + dir)); if (z === this.zoomT) { uiSfx('error', 0.2); return; }
    const W = this.cv.clientWidth, H = this.cv.clientHeight;
    this.anchor = { sx, sy, ax: this.pan.x + (sx - W / 2) / this.zoom.x, ay: this.pan.y + (sy - H / 2) / this.zoom.x };
    this.zoomT = z; this.zoom.target = z; uiSfx('tick', 0.45, 0.8 + z * 0.08); this.dirty = true;
  }
  private toWorld(e: { clientX: number; clientY: number }) { const r = this.cv.getBoundingClientRect(), z = this.zoom.x; return { x: (this.pan.x + (e.clientX - r.left - r.width / 2) / z) / 2, z: (this.pan.y + (e.clientY - r.top - r.height / 2) / z) / 2 }; }
  private update(dt: number) {
    if (!this.isOpen) return;
    this.t += dt;
    const g = this.g, R = g.region; if (!R) return;
    if (!this.base) { this.base = paintTerrain(R, R.pal, 2); this.baseCv = this.base.px.canvas(); }
    if (!this.fogCv) this.fogCv = paintFog(R, g.vision?.seen ?? null, 2).canvas();
    const zs = this.zoom.step(dt);
    if (this.anchor) { const W = this.cv.clientWidth, H = this.cv.clientHeight; this.pan.x = this.anchor.ax - (this.anchor.sx - W / 2) / zs; this.pan.y = this.anchor.ay - (this.anchor.sy - H / 2) / zs; if (this.zoom.settled) this.anchor = null; }
    if (!this.drag && Math.abs(this.vel.x) + Math.abs(this.vel.y) > 1) { this.pan.x += this.vel.x * dt; this.pan.y += this.vel.y * dt; const k = Math.exp(-4.5 * dt); this.vel.x *= k; this.vel.y *= k; this.dirty = true; }
    const S = R.N * 2; this.pan.x = Math.max(0, Math.min(S, this.pan.x)); this.pan.y = Math.max(0, Math.min(S, this.pan.y));
    if (!this.zoom.settled || this.anchor) this.dirty = true;
    if (Math.floor(this.t * 8) !== Math.floor((this.t - dt) * 8)) this.dirty = true;
    if (this.dirty) { this.dirty = false; this.draw(); }
  }
  private draw() {
    const g = this.g, R = g.region!, cv = this.cv, W = Math.max(64, cv.clientWidth), H = Math.max(64, cv.clientHeight);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = this.c; c.imageSmoothingEnabled = false;
    // beyond the survey: dark slate drafting film with a faint grid and grain
    if (!this.voidPat) { const v = new Px(32, 32); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) v.set(x, y, x === 0 || y === 0 ? 0x1d2432 : ((x * 7 + y * 13) % 17 === 0) ? 0x1a202c : 0x12161e); this.voidPat = c.createPattern(v.canvas(), 'repeat'); }
    c.save(); c.scale(2, 2); c.fillStyle = this.voidPat!; c.fillRect(0, 0, W / 2, H / 2); c.restore();
    // whole-pixel zoom while settled, smooth while it eases
    const zs = this.zoom.settled ? Math.round(this.zoom.x) : this.zoom.x;
    const ox = Math.round(W / 2 - this.pan.x * zs), oy = Math.round(H / 2 - this.pan.y * zs), S = R.N * 2;
    c.drawImage(this.baseCv!, ox, oy, S * zs, S * zs);
    if (this.layers.fog && this.fogCv) c.drawImage(this.fogCv, ox, oy, S * zs, S * zs);
    // a faint survey grid every 16 m with metre numbers on the edge
    c.fillStyle = 'rgba(8,9,12,0.18)';
    for (let m = 0; m <= R.N; m += 16) { const x = ox + m * 2 * zs, y = oy + m * 2 * zs; c.fillRect(Math.round(x), oy, 1, S * zs); c.fillRect(ox, Math.round(y), S * zs, 1); }
    const P2 = (x: number, z: number): [number, number] => [Math.round(ox + x * 2 * zs), Math.round(oy + z * 2 * zs)];
    const marks: { x: number; y: number; r: number; name: string; key: string }[] = [];
    const seen = (x: number, z: number) => !g.vision?.seen || !this.layers.fog || g.vision.seen[Math.max(0, Math.min(R.N - 1, Math.floor(z))) * R.N + Math.max(0, Math.min(R.N - 1, Math.floor(x)))] > 0;
    const glyph = (kind: MarkKind, x: number, y: number, key: string, name: string, big = false) => {
      const hot = this.hot === key, gl = markGlyph(kind, 2), sc = hot || big ? 3 : 2;
      const bob = hot ? Math.round(Math.sin(this.t * 6) * 2) - 4 : 0;
      const cvg = glyphCanvas(gl);
      // a little shadow, the icon at 2x (3x while hot)
      c.fillStyle = 'rgba(5,6,8,0.45)'; c.fillRect(x - Math.round(gl.w * sc * 0.35), y + Math.round(gl.h * sc * 0.42), Math.round(gl.w * sc * 0.7), sc);
      c.drawImage(cvg, x - Math.round((gl.w * sc) / 2), y - Math.round((gl.h * sc) / 2) + bob, gl.w * sc, gl.h * sc);
      marks.push({ x, y, r: Math.max(10, gl.w * sc * 0.5), name, key });
    };
    if (this.layers.marks) for (const m of this.base!.marks) { if (m.kind === 'peak' || !seen(m.x, m.z)) continue; const [x, y] = P2(m.x, m.z); glyph(m.kind, x, y, m.key, m.name); }
    if (this.layers.marks) for (const m of this.base!.marks) if (m.kind === 'peak' && seen(m.x, m.z)) { const [x, y] = P2(m.x, m.z); marks.push({ x, y: y - 8, r: 14, name: m.name, key: m.key }); }
    // the control ring and the camera's view
    const col = g.colony;
    if (col?.pod) { const [x, y] = P2(col.pod.x, col.pod.z); ring(c, x, y, (col.controlRadius ?? 30) * 2 * zs, P.ruby[4], 2); }
    const q = viewQuad(g); if (q) { c.strokeStyle = hex(P.snow[5]); c.lineWidth = 2; c.setLineDash([6, 4]); c.beginPath(); q.forEach(([x, z], i) => { const [X, Y] = P2(x, z); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.closePath(); c.stroke(); c.setLineDash([]); }
    if (this.layers.units) for (const d of dotsOf(g)) { const [x, y] = P2(d.x, d.z); glyph(d.kind, x, y, d.key, d.name, d.kind === 'pod'); }
    // the pod's sonar ring
    if (col?.pod) { const [x, y] = P2(col.pod.x, col.pod.z), k = (this.t % 2) / 2; c.strokeStyle = `rgba(255,240,200,${0.6 * (1 - k)})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 10 + k * 50, 0, Math.PI * 2); c.stroke(); }
    // the compass rose and the scale bar
    const cr = glyphCanvas(compassGlyph()); c.drawImage(cr, W - cr.width * 2 - 20, H - cr.height * 2 - 20, cr.width * 2, cr.height * 2);
    const bar = 16 * 2 * zs; c.fillStyle = hex(INK); c.fillRect(20, H - 30, bar + 4, 10); c.fillStyle = hex(P.bone[5]); c.fillRect(22, H - 28, bar / 2, 6); c.fillStyle = hex(P.steel[2]); c.fillRect(22 + bar / 2, H - 28, bar / 2, 6);
    // hover: the nearest mark grows, its name floats over it
    let best: (typeof marks)[0] | null = null, bd = 1e9;
    const hv = this.hover;
    if (hv && !this.drag?.moved) for (const m of marks) { const d = Math.hypot(m.x - hv.x, m.y - hv.y); if (d < m.r + 6 && d < bd) { bd = d; best = m; } }
    const was = this.hot; this.hot = best?.key ?? '';
    if (this.hot !== was) { this.dirty = true; if (best) uiSfx('hover', 0.4); }
    if (best) { const r = this.cv.getBoundingClientRect(); this.tip.textContent = best.name; this.tip.style.left = Math.round(r.left + best.x) + 'px'; this.tip.style.top = Math.round(r.top + best.y - 20) + 'px'; this.tip.classList.add('on'); }
    else this.tip.classList.remove('on');
    this.cv.style.cursor = this.drag?.moved ? 'grabbing' : best ? 'pointer' : 'crosshair';
    this.scaleLabel(bar);
  }
  private sl: HTMLDivElement | null = null;
  private scaleLabel(bar: number) { if (!this.sl) { this.sl = document.createElement('div'); this.sl.className = 'k7-t16 h7-map-scale'; this.cv.parentElement!.append(this.sl); } this.sl.textContent = '16 M'; this.sl.style.left = Math.round(36 + bar) + 'px'; }
}

const glyphCv = new WeakMap<Px, HTMLCanvasElement>();
function glyphCanvas(p: Px) { let c = glyphCv.get(p); if (!c) { c = p.canvas(); glyphCv.set(p, c); } return c; }
function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: number, w = 1) {
  const n = Math.max(24, Math.round(r * 0.8));
  c.fillStyle = hex(col);
  for (let i = 0; i < n; i++) { if ((i >> 1) % 2) continue; const a = (i / n) * Math.PI * 2; c.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), w, w); }
}
/** brass corner plates on a bezel (painted into a plate) */
function brassCorners(p: Px, w: number, h: number, s = 12) {
  for (const [cx, cy, fx, fy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) {
    for (let j = 0; j < s; j++) for (let i = 0; i < s - j; i++) { const x = cx + i * fx, y = cy + j * fy; if (i + j < 3) continue; const edge = i + j >= s - 2 || i === 3 - j || j === 0 || i === 0; p.set(x, y, edge ? INK : (i + j) < 6 ? P.brass[5] : P.brass[(i * 3 + j * 7) % 5 === 0 ? 2 : 4]); }
    const rx = cx + 5 * fx, ry = cy + 5 * fy; p.set(rx, ry, P.brass[5]); p.set(rx + fx, ry, P.brass[2]); p.set(rx, ry + fy, P.brass[2]);
  }
}
const _v = new THREE.Vector3();
/** the four ground corners of the camera's view (world x, z), or null */
function viewQuad(g: G): [number, number][] | null {
  const cam = g.cam; if (!cam?.ray) return null;
  const out: [number, number][] = [];
  for (const [sx, sy] of [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]]) {
    const rc = cam.ray(sx, sy), o = rc.ray.origin, d = rc.ray.direction, h = g.colony?.pod?.y ?? 0;
    const t = d.y > -0.02 ? 160 : Math.min(220, (h - o.y) / d.y);
    _v.copy(o).addScaledVector(d, t); out.push([_v.x, _v.z]);
  }
  return out;
}
function order(g: G, x: number, z: number) {
  const s = g.colony?.sel; if (!s) return;
  if (s.kind === 'drone') { s.ref.order = { k: 'move', x, z }; s.ref.docked = false; uiSfx('confirm', 0.5); }
  else if (s.kind === 'crew' && s.ref.alive) { s.ref.order({ k: 'move', x, z }); uiSfx('confirm', 0.5); }
}

let css = false;
function injectMapCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-mini { position: fixed; right: 12px; top: 12px; z-index: 35; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.h7-mini-frame { position: relative; width: 276px; height: 276px; pointer-events: auto; }
.h7-mini-cv { position: absolute; left: 10px; top: 10px; width: 256px; height: 256px; z-index: 1; image-rendering: pixelated; cursor: crosshair; }
.h7-mini-icon { position: absolute !important; left: -46px; bottom: -10px; z-index: 2; }
.h7-map { position: fixed; inset: 0; z-index: 9300; display: none; align-items: center; justify-content: center; background: radial-gradient(ellipse at 50% 50%, rgba(6,7,9,.6), rgba(6,7,9,.92)); }
.h7-map.on { display: flex; }
.h7-map-frame { position: relative; width: min(1500px, 92vw); height: min(900px, 86vh); }
.h7-map-cv { position: absolute; left: 28px; top: 28px; right: 28px; bottom: 28px; width: calc(100% - 56px); height: calc(100% - 56px); z-index: 1; image-rendering: pixelated; cursor: crosshair; touch-action: none; }
.h7-map-cv.grab { cursor: grabbing; }
.h7-map-rail { position: absolute; right: 60px; top: -46px; z-index: 3; display: flex; gap: 18px; align-items: flex-end; }
.h7-map-scale { position: absolute; bottom: 44px; z-index: 2; pointer-events: none; }
`;
  document.head.append(s);
}
export { pop };

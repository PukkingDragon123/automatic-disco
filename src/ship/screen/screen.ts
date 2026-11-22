// THE SHIP SCREEN (v7, the dock's SHIP slot), built on the UI CORE's Limbophobia-style machine panels (kit panel.ts:
// panel, pkey, meter, status, section, kv, para, showTip). Two housings: DECK VIEW holds ONE 3D element, the WHOLE
// MERIDIAN in space (its hull with the roof plates lifted over the furnished deck cutaway, mini.ts) drawn as an
// outlined pixel-art model; the camera zooms smoothly from the whole ship into any room and back (wheel about the
// cursor, drag to pan, click a room to fly in, Esc / BACK / wheel out to fly back). Every room carries its name; a
// locked one also a padlock rendered from its model; hovering a room opens the kit tooltip with what it is for, its
// functions, and what opens it. The second housing is the DECK DIRECTORY until a room is entered, then that room: its
// purpose, its functions on push keys, what the function does, and the function's own panel (panels/*).
import * as THREE from 'three';
import { shipMini, SHIP_CENTRE, type ShipMini, type MiniView } from './mini';
import { ROOM_IDS, ROOMS, SHIP_NAME, type RoomId } from '../hub/layout';
import { ROOM_FNS, FN, FN_DESC, ROOM_NAME, ROOM_PURPOSE, roomOpen, fnOpen, ROOM_FEAT, type FnId } from './gates';
import { shipCSS, div, S, clean, pxPoly, pxLine, reqLines, reqSentence } from './ui';
import { icon3d } from './icons3d';
import { PANELS, type Panel, type PanelCtx } from './panels';
import { panel, pkey, meter, status, section, para, kv, showTip, hideTip, type Panel as KPanel, type PKey, type Meter, type Status } from '../../ui/kit/panel';
import { hash, mixHex } from '../../ui/kit/px';
import { uiSfx } from '../../ui/kit/sound';
import { onFrame, tween, ease, pop, Spring, shake } from '../../ui/kit/juice';

export interface ShipScreenOpts { game: any | null; close?: (after: () => void) => Promise<void> | void; room?: RoomId; fn?: FnId; hub?: any }
const ZMAX = 6;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class ShipScreen {
  static current: ShipScreen | null = null;
  readonly el: HTMLDivElement;
  private wrap: HTMLDivElement;
  private view3: KPanel; private bay: KPanel;
  private space: HTMLCanvasElement; private miniCv: HTMLCanvasElement; private ov: HTMLCanvasElement; private ovc: CanvasRenderingContext2D;
  private pins = new Map<RoomId, { el: HTMLDivElement; lock: HTMLCanvasElement | null; name: HTMLDivElement }>();
  private stat: Status; private zoomM: Meter; private backK: PKey;
  private bayBody: HTMLDivElement;
  private mini: ShipMini | null = null;
  private vw = 0; private vh = 0;
  private zoom = new Spring(0.75, { k: 34, d: 11 });
  private tx = new Spring(SHIP_CENTRE.x, { k: 34, d: 11 }); private ty = new Spring(SHIP_CENTRE.y, { k: 34, d: 11 }); private tz = new Spring(SHIP_CENTRE.z, { k: 34, d: 11 });
  private drag: { x: number; y: number; t: THREE.Vector3; p: THREE.Vector3 | null; moved: boolean } | null = null;
  private hover: RoomId | null = null; private sel: RoomId | null = null; private fn: FnId | null = null;
  private panel: Panel | null = null;
  private last = ''; private renderAcc = 0; private t = 0;
  private off: (() => void)[] = [];
  private closing = false; private wasPaused = false;
  private sparks: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  constructor(readonly o: ShipScreenOpts) {
    ShipScreen.current = this; (window as unknown as { __ship7?: ShipScreen }).__ship7 = this;
    shipCSS();
    this.el = div('s7'); div('s7-veil', this.el);
    this.wrap = div('s7-abs', this.el); this.wrap.style.inset = '0';
    // the deck view housing and the bay housing
    this.view3 = panel({ title: `${clean(SHIP_NAME)} : DECK VIEW`, tone: 'gun', serial: 'RV-07', lamps: ['green', 'amber'], stencil: 'WHEEL ZOOM  DRAG PAN  CLICK A ROOM', knobs: 2, handles: true });
    this.bay = panel({ title: 'DECK DIRECTORY', tone: 'gun', lamps: ['green', 'amber'], toggles: 3 });
    for (const p of [this.view3, this.bay]) { p.el.style.position = 'absolute'; this.wrap.append(p.el); }
    const vb = this.view3.body; vb.style.overflow = 'hidden'; vb.style.height = '100%'; this.bay.body.style.height = '100%';
    this.space = document.createElement('canvas'); this.space.className = 's7-abs'; vb.append(this.space);
    this.miniCv = document.createElement('canvas'); this.miniCv.className = 's7-abs s7-mini'; vb.append(this.miniCv);
    this.ov = document.createElement('canvas'); this.ov.className = 's7-abs s7-ov'; vb.append(this.ov); this.ovc = this.ov.getContext('2d')!;
    for (const c of [this.space, this.miniCv, this.ov]) c.style.imageRendering = 'pixelated';
    const foot = div('s7-abs', vb); foot.style.left = '10px'; foot.style.right = '10px'; foot.style.bottom = '6px'; foot.style.pointerEvents = 'none';
    this.stat = status('', 'info'); foot.append(this.stat.el);
    const zm = div('s7-abs', vb); zm.style.right = '12px'; zm.style.top = '8px'; zm.style.pointerEvents = 'none';
    this.zoomM = meter('ZOOM', 0, { w: 110, segs: 10, col: 'teal', value: '1.0x' }); zm.append(this.zoomM.el);
    this.bayBody = div('', this.bay.body); this.bayBody.style.position = 'relative'; this.bayBody.style.height = '100%'; this.bayBody.style.overflow = 'hidden auto';
    this.backK = pkey('BACK  [ESC]', () => this.back(), { tone: 'red', lamp: false, sound: 'back' });
    this.backK.style.position = 'absolute'; this.wrap.append(this.backK);
    document.body.append(this.el);
    if (o.game) { this.wasPaused = !!o.game.paused; o.game.paused = true; try { o.game.colony?.save?.(); } catch { /* no save */ } }
    this.layout();
    this.bindInput();
    this.off.push(onFrame((dt) => { if (this.closing && !this.el.isConnected) return false; this.frame(dt); return true; }) as unknown as () => void);
    addEventListener('keydown', this.onKey, true); addEventListener('resize', this.onResize);
    this.off.push(() => { removeEventListener('keydown', this.onKey, true); removeEventListener('resize', this.onResize); hideTip(); });
    const U = o.game?.unlocks; if (U?.on) this.off.push(U.on('change', () => this.refreshLocks()));
    o.game?.emit?.('screen-open', { id: 'ship' });
    o.game?.emit?.('ship-link', { open: true });
  }
  async ready(): Promise<void> {
    try { this.mini = await shipMini(); } catch (e) { console.error('ship model', e); }
    this.mini?.fitShip(this.miniCv.width, this.miniCv.height);
    this.refreshLocks(); this.directory(); this.paintStatus();
    this.renderMini(true);
  }
  enter() {
    const els = [this.view3.el, this.bay.el];
    els.forEach((e, i) => { e.style.transform = `translateY(${innerHeight}px)`; void tween(600 + i * 120, (k) => { e.style.transform = `translateY(${Math.round((1 - k) * 220)}px)`; }, ease.outBack).then(() => { e.style.transform = ''; }); });
    uiSfx('swishIn', 0.6); setTimeout(() => uiSfx('metalClose', 0.45), 420);
    this.zoom.target = 1;
    let i = 0;
    for (const id of ROOM_IDS) { const p = this.pins.get(id); if (!p) continue; p.el.style.opacity = '0'; setTimeout(() => { p.el.style.opacity = ''; pop(p.el, 1.1); uiSfx('tick', 0.35, 0.9 + i * 0.05); }, 520 + i * 70); i++; }
    if (this.o.room) setTimeout(() => this.select(this.o.room!, this.o.fn), 900);
  }

  // ---------------------------------------------------------------- layout
  private onResize = () => { this.layout(); this.mini?.fitShip(this.miniCv.width, this.miniCv.height); this.renderMini(true); this.panelReflow(); };
  private layout() {
    const W = innerWidth, H = innerHeight, m = 14, bw = Math.max(520, Math.min(660, Math.round(W * 0.34)));
    const lw = W - bw - m * 3;
    Object.assign(this.view3.el.style, { left: m + 'px', top: m + 'px', width: lw + 'px', height: H - m * 2 + 'px' });
    Object.assign(this.bay.el.style, { left: m * 2 + lw + 'px', top: m + 'px', width: bw + 'px', height: H - m * 2 + 'px' });
    this.backK.style.left = W - m - 150 + 'px'; this.backK.style.top = m + 4 + 'px';
    // the 3D view fills the deck view's well, at two screen px per art px
    const bwid = lw - 32, bh = H - m * 2 - 64;
    this.vw = Math.floor(bwid / S); this.vh = Math.floor(bh / S);
    for (const c of [this.space, this.miniCv, this.ov]) { c.width = this.vw; c.height = this.vh; c.style.left = '0'; c.style.top = '0'; c.style.width = this.vw * S + 'px'; c.style.height = this.vh * S + 'px'; c.getContext('2d')!.imageSmoothingEnabled = false; }
    this.paintSpace();
    for (const id of ROOM_IDS) if (!this.pins.has(id)) this.makePin(id);
  }
  private get view(): MiniView { return { w: this.miniCv.width, h: this.miniCv.height, zoom: this.zoom.x, tx: this.tx.x, ty: this.ty.x, tz: this.tz.x }; }
  /** deep space behind the ship: a nebula's dithered haze, stars, the planet's lit limb */
  private paintSpace() {
    const w = this.vw, h = this.vh, c = this.space.getContext('2d')!, img = c.createImageData(w, h), d = img.data;
    const put = (x: number, y: number, col: number) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = col >> 16; d[i + 1] = (col >> 8) & 255; d[i + 2] = col & 255; d[i + 3] = 255; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, n = hash(x >> 3, y >> 3, 5) * 0.5 + hash(x >> 4, y >> 4, 6) * 0.5;
      const neb = Math.max(0, 1 - Math.hypot(u - 0.72, v - 0.3) * 2.2) * (0.6 + n * 0.6);
      let col = mixHex(0x05060c, 0x0c1424, v * 0.6);
      if (neb > 0.25 + hash(x, y, 7) * 0.35) col = mixHex(col, 0x2a2048, Math.min(0.6, neb * 0.7));
      const pd = Math.hypot((x + w * 0.1) / (w * 0.9), (y - h * 1.95) / (h * 1.1));
      if (pd < 1) col = pd > 0.985 ? 0x6aa8d8 : pd > 0.96 ? mixHex(0x2a5070, 0x6aa8d8, (pd - 0.96) / 0.025) : mixHex(0x0a1420, 0x1c3448, Math.max(0, (pd - 0.8) * 4));
      put(x, y, col);
    }
    for (let i = 0; i < 300; i++) { const x = Math.floor(hash(i, 1, 9) * w), y = Math.floor(hash(i, 2, 9) * h), b = hash(i, 3, 9); put(x, y, b > 0.85 ? 0xfff4d8 : b > 0.5 ? 0x9aa8c0 : 0x4a5468); if (b > 0.96) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx, y + dy, 0x6a7890); }
    c.putImageData(img, 0, 0);
  }
  private makePin(id: RoomId) {
    const el = div('s7-pin', this.view3.body); el.style.zIndex = '4'; el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.gap = '4px';
    const lock = roomOpen(this.o.game, id) ? null : icon3d('padlock', 22);
    if (lock) el.append(lock);
    const name = div('k7-name k7-t16', el); name.textContent = ROOM_NAME[id];
    this.pins.set(id, { el, lock, name });
    this.paintPin(id);
  }
  private paintPin(id: RoomId) {
    const pin = this.pins.get(id); if (!pin) return;
    const open = roomOpen(this.o.game, id), hot = this.hover === id, sel = this.sel === id;
    if (open && pin.lock) { pin.lock.remove(); pin.lock = null; }
    if (!open && !pin.lock) { pin.lock = icon3d('padlock', 22); pin.el.prepend(pin.lock); }
    pin.name.style.color = !open ? '#b0a898' : sel ? '#ffe39a' : hot ? '#fff4cf' : '#efe4c4';
    pin.el.classList.toggle('hot', hot);
  }
  private refreshLocks() {
    if (!this.mini) return;
    let ch = false;
    for (const id of ROOM_IDS) ch = this.mini.setLook(id, !roomOpen(this.o.game, id) ? 'locked' : this.sel === id ? 'open' : this.hover === id ? 'hot' : 'idle') || ch;
    for (const id of ROOM_IDS) this.paintPin(id);
    if (ch) this.renderMini(true);
    if (this.sel && this.fn) this.roomView(this.sel, this.fn); else this.directory();
  }

  // ---------------------------------------------------------------- the model and its overlay
  private renderMini(force = false) {
    if (!this.mini) return;
    const v = this.view, key = [v.w, v.h, v.zoom.toFixed(3), v.tx.toFixed(2), v.ty.toFixed(2), v.tz.toFixed(2)].join('|');
    if (!force && key === this.last) return;
    this.last = key;
    this.mini.draw(this.miniCv.getContext('2d')!, v);
  }
  private frame(dt: number) {
    if (!this.el.isConnected) return;
    this.t += dt;
    for (const s of [this.zoom, this.tx, this.ty, this.tz]) s.step(dt);
    const moving = !this.zoom.settled || !this.tx.settled || !this.ty.settled || !this.tz.settled;
    this.renderAcc += dt;
    if (moving && this.renderAcc > 1 / 30) { this.renderAcc = 0; this.renderMini(); }
    else if (!moving) this.renderMini();
    this.drawOverlay(dt);
    this.panel?.update?.(dt);
  }
  private drawOverlay(dt: number) {
    const c = this.ovc, v = this.view, m = this.mini;
    c.clearRect(0, 0, this.ov.width, this.ov.height);
    if (!m) return;
    for (const id of ROOM_IDS) {
      const open = roomOpen(this.o.game, id), hot = this.hover === id, sel = this.sel === id;
      if (!hot && !sel) continue;
      const pts = m.outline(id, v, 0.02), top = m.outline(id, v, 1.05);
      const col = !open ? '#c86a4a' : sel ? '#ffd27a' : '#ffb850';
      c.globalAlpha = sel ? 0.75 + Math.sin(this.t * 5) * 0.25 : 1;
      pxPoly(c, pts, '#08090c', 3); pxPoly(c, pts, col, 1);
      if (open) { c.globalAlpha *= 0.6; pxPoly(c, top, col, 1); for (let i = 0; i < pts.length; i++) pxLine(c, pts[i][0], pts[i][1], top[i][0], top[i][1], col); }
      c.globalAlpha = 1;
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) { const s = this.sparks[i]; s.t -= dt; if (s.t <= 0) { this.sparks.splice(i, 1); continue; } s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; c.fillStyle = s.t > 0.3 ? '#fff0c0' : '#e89040'; c.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
    const W = this.ov.width, H = this.ov.height;
    for (const id of ROOM_IDS) {
      const pin = this.pins.get(id)!, q = m.centre(id), [x, y] = m.project(q.x, 2.4, q.z, v);
      pin.el.style.visibility = x > 10 && y > 16 && x < W - 10 && y < H - 30 ? '' : 'hidden';
      pin.el.style.opacity = this.sel && this.sel !== id && this.zoom.x > 2 ? '0.5' : '';
      pin.el.style.left = Math.round(x * S) + 'px'; pin.el.style.top = Math.round(y * S + 20) + 'px';
    }
    this.zoomM.set((this.zoom.x - 1) / (ZMAX - 1), this.zoom.x.toFixed(1) + 'x');
  }
  private paintStatus() {
    const open = ROOM_IDS.filter((r) => roomOpen(this.o.game, r)).length;
    if (this.sel) this.stat.set(`${ROOM_NAME[this.sel]}: ${ROOM_PURPOSE[this.sel]} Wheel out or BACK for the whole ship.`, roomOpen(this.o.game, this.sel) ? 'info' : 'warn');
    else this.stat.set(`${clean(SHIP_NAME)}, research vessel in orbit. ${open} of ${ROOM_IDS.length} decks open. Click a room to go in; wheel to zoom, drag to pan.`, 'info');
  }

  // ---------------------------------------------------------------- input
  private bindInput() {
    const cv = this.miniCv;
    const local = (e: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / S, (e.clientY - r.top) / S] as [number, number]; };
    cv.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || this.closing) return;
      const [x, y] = local(e), t = new THREE.Vector3(this.tx.target, this.ty.target, this.tz.target);
      this.drag = { x, y, t, p: this.mini?.deckAt(x, y, this.view, t.y) ?? null, moved: false }; cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = local(e);
      if (this.drag) {
        if (!this.drag.moved && Math.hypot(x - this.drag.x, y - this.drag.y) > 3) { this.drag.moved = true; cv.classList.add('drag'); hideTip(); }
        if (this.drag.moved && this.drag.p && this.mini) {
          const q = this.mini.deckAt(x, y, { ...this.view, tx: this.drag.t.x, ty: this.drag.t.y, tz: this.drag.t.z }, this.drag.t.y);
          if (q) this.aim(this.drag.t.clone().sub(q.sub(this.drag.p)), this.zoom.target, true);
        }
        return;
      }
      this.setHover(this.mini ? this.mini.roomAt(x, y, this.view) : null, e.clientX, e.clientY);
    });
    cv.addEventListener('pointerup', (e) => {
      const d = this.drag; this.drag = null; cv.classList.remove('drag');
      try { cv.releasePointerCapture(e.pointerId); } catch { /* gone */ }
      if (!d || d.moved || !this.mini) return;
      const [x, y] = local(e), id = this.mini.roomAt(x, y, this.view);
      if (id) this.select(id); else if (this.sel) this.deselect();
    });
    cv.addEventListener('pointerleave', () => { if (!this.drag) this.setHover(null); });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); this.zoomAt(x, y, e.deltaY < 0 ? 1.18 : 1 / 1.18); }, { passive: false });
    this.el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.back(); });
  }
  private aim(t: THREE.Vector3, z: number, instant = false) {
    z = clamp(z, 1, ZMAX);
    const k = (z - 1) / (ZMAX - 1), c = SHIP_CENTRE;
    const lim = (a: number, lo: number, hi: number, mid: number) => clamp(a, mid + (lo - mid) * Math.min(1, k * 3), mid + (hi - mid) * Math.min(1, k * 3));
    this.tx.target = lim(t.x, -7, 7, c.x); this.ty.target = clamp(t.y, 0, 2.5); this.tz.target = lim(t.z, -20, 20, c.z);
    if (z < 1.03) { this.tx.target = c.x; this.ty.target = c.y; this.tz.target = c.z; }
    this.zoom.target = z;
    if (instant) for (const s of [this.tx, this.ty, this.tz]) s.x = s.target;
  }
  private zoomAt(x: number, y: number, f: number) {
    if (!this.mini) return;
    const z0 = this.zoom.target, z1 = clamp(z0 * f, 1, ZMAX); if (Math.abs(z1 - z0) < 1e-3) { uiSfx('tick', 0.2, 0.6); return; }
    const T = new THREE.Vector3(this.tx.target, this.ty.target, this.tz.target);
    const p = this.mini.deckAt(x, y, { ...this.view, zoom: z0, tx: T.x, ty: T.y, tz: T.z }, 1) ?? T.clone();
    this.aim(p.clone().sub(p.clone().sub(T).multiplyScalar(z0 / z1)), z1);
    uiSfx('tick', 0.25, f > 1 ? 1.3 : 0.9);
    if (z1 <= 1.02 && this.sel) this.deselect(false);
  }
  private setHover(id: RoomId | null, cx = 0, cy = 0) {
    if (id === this.hover) { if (id && id !== this.sel) this.showRoomTip(id, cx, cy); return; }
    const prev = this.hover; this.hover = id;
    if (id) uiSfx('hover', 0.45);
    this.miniCv.style.cursor = id ? 'pointer' : '';
    if (this.mini) { for (const r of [prev, id]) if (r) this.mini.setLook(r, !roomOpen(this.o.game, r) ? 'locked' : this.sel === r ? 'open' : this.hover === r ? 'hot' : 'idle'); this.renderMini(true); }
    for (const r of [prev, id]) if (r) this.paintPin(r);
    if (id && id !== this.sel) this.showRoomTip(id, cx, cy); else hideTip();
  }
  /** the kit tooltip for a room: purpose, functions, and when locked what opens it */
  private showRoomTip(id: RoomId, cx: number, cy: number) {
    const open = roomOpen(this.o.game, id);
    if (open) {
      showTip({ title: ROOM_NAME[id], sub: ROOM_PURPOSE[id], rows: ROOM_FNS[id].map((f) => [FN[f].name, fnOpen(this.o.game, id, f) ? 'OPEN' : 'LOCKED'] as [string, string]), status: ['Click to go in.', 'info'] }, { x: cx, y: cy });
    } else {
      const r = reqLines(this.o.game, ROOM_FEAT[id]);
      showTip({ title: `${ROOM_NAME[id]} : LOCKED`, sub: ROOM_PURPOSE[id], desc: r.node ? `Learn ${r.node} on the research tree (K).` : 'Nothing on the research tree opens it yet.', rows: r.lines.map((l) => [l.ok ? 'MET' : 'NEED', l.text] as [string, string]), status: [reqSentence(this.o.game, ROOM_FEAT[id]) + '.', 'warn'] }, { x: cx, y: cy });
    }
  }
  private onKey = (e: KeyboardEvent) => {
    if (!this.el.isConnected || this.closing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.back(); return; }
    if (e.key === '+' || e.key === '=') this.zoomAt(this.miniCv.width / 2, this.miniCv.height / 2, 1.25);
    if (e.key === '-') this.zoomAt(this.miniCv.width / 2, this.miniCv.height / 2, 0.8);
    const n = Number(e.key); if (n >= 1 && n <= 9) { const id = ROOM_IDS.find((r) => ROOMS[r].code === '0' + n); if (id) this.select(id); }
    e.stopPropagation();
  };

  // ---------------------------------------------------------------- rooms and their functions
  select(id: RoomId, fn?: FnId) {
    if (this.closing) return;
    const was = this.sel; this.sel = id; hideTip();
    if (this.mini) { const c = this.mini.centre(id); this.aim(c, this.mini.roomZoom(id, this.view)); }
    if (this.mini) { if (was && was !== id) this.mini.setLook(was, roomOpen(this.o.game, was) ? 'idle' : 'locked'); if (roomOpen(this.o.game, id)) this.mini.setLook(id, 'open'); this.renderMini(true); }
    if (was) this.paintPin(was); this.paintPin(id);
    const pin = this.pins.get(id); if (pin) pop(pin.el, 1.2);
    uiSfx('select', 0.7); uiSfx('swishIn', 0.4);
    this.paintStatus();
    if (!roomOpen(this.o.game, id)) { uiSfx('error', 0.4); if (pin) shake(pin.el, 5); }
    else if (this.mini) { const q = this.mini.centre(id); setTimeout(() => { if (this.sel !== id || !this.mini) return; const [x, y] = this.mini.project(q.x, 0.6, q.z, this.view); for (let i = 0; i < 14; i++) this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 70, t: 0.4 + Math.random() * 0.4 }); }, 600); }
    const fns = ROOM_FNS[id];
    this.openFn(fn && fns.includes(fn) ? fn : fns.find((f) => fnOpen(this.o.game, id, f)) ?? fns[0]);
  }
  private deselect(zoomOut = true) {
    const was = this.sel; if (!was) return;
    this.sel = null; this.fn = null;
    if (this.mini) { this.mini.setLook(was, !roomOpen(this.o.game, was) ? 'locked' : this.hover === was ? 'hot' : 'idle'); this.renderMini(true); }
    this.paintPin(was);
    if (zoomOut) this.aim(SHIP_CENTRE, 1);
    uiSfx('swishOut', 0.4);
    this.panel?.dispose(); this.panel = null;
    this.paintStatus();
    this.swapBay(() => this.directory());
  }
  /** slide the bay's content out and the new content in */
  private swapBay(fill: () => void) {
    const el = this.bayBody;
    void tween(130, (k) => { el.style.transform = `translateX(${Math.round(k * 60)}px)`; el.style.opacity = String(1 - k); }, ease.inCubic).then(() => {
      fill(); uiSfx('swishIn', 0.35);
      return tween(260, (k) => { el.style.transform = `translateX(${Math.round((1 - k) * -60)}px)`; el.style.opacity = String(k); }, ease.outBack);
    }).then(() => { el.style.transform = ''; el.style.opacity = ''; });
  }
  /** the DECK DIRECTORY: every deck, what it is for, open or what it needs; click one to go in */
  private directory() {
    if (this.sel) return;
    this.bay.setTitle('DECK DIRECTORY');
    const b = this.bayBody; b.replaceChildren();
    b.append(section('THE MERIDIAN', `${ROOM_IDS.filter((r) => roomOpen(this.o.game, r)).length} / ${ROOM_IDS.length} OPEN`), para('Nine decks. A locked deck opens on the research tree with knowledge, parts or a bond with someone. Click a deck here or on the ship.', { dim: true }));
    for (const id of ROOM_IDS) {
      const open = roomOpen(this.o.game, id);
      const row = div('s7-row', b);
      const top = div('s7-row-top', row);
      if (!open) top.append(icon3d('padlock', 20));
      const k = kv(ROOM_NAME[id], open ? ROOM_FNS[id].map((f) => FN[f].name).join(' / ') : 'LOCKED', { color: open ? '#b8e0a0' : '#ff9a80' }); k.el.style.flex = '1'; top.append(k.el);
      row.append(para(open ? ROOM_PURPOSE[id] : reqSentence(this.o.game, ROOM_FEAT[id]) + '.', { dim: true }));
      row.addEventListener('pointerenter', () => { uiSfx('hover', 0.35); this.setHover(id); });
      row.addEventListener('pointerleave', () => { this.setHover(null); });
      row.addEventListener('click', () => { uiSfx('click', 0.6); this.select(id); });
    }
  }
  private openFn(f: FnId) {
    this.fn = f;
    const id = this.sel!;
    this.swapBay(() => this.roomView(id, f));
  }
  /** a room: its purpose, its functions on push keys, what this one does, and its panel */
  private roomView(id: RoomId, f: FnId) {
    this.panel?.dispose(); this.panel = null;
    this.bay.setTitle(ROOM_NAME[id]);
    const b = this.bayBody; b.replaceChildren();
    b.append(section(ROOM_NAME[id], `DECK ${ROOMS[id].code}`), para(ROOM_PURPOSE[id], { dim: true }));
    const keys = div('s7-keys', b);
    for (const g of ROOM_FNS[id]) {
      const open = fnOpen(this.o.game, id, g);
      const k = pkey(FN[g].name + (open ? '' : ' (LOCKED)'), () => { if (this.fn === g) return; uiSfx('tab', 0.6); this.openFn(g); }, { tone: g === f ? 'yellow' : 'cream', lamp: open ? (g === f ? 'green' : 'amber') : 'red', sound: 'tab' });
      k.setOn(g === f); keys.append(k);
    }
    b.append(section(FN[f].name), para(FN_DESC[f]));
    const host = div('s7-fnhost', b);
    if (!fnOpen(this.o.game, id, f)) { this.lockedPanel(host, id, f); return; }
    const ctx: PanelCtx = { game: this.o.game, host, w: Math.max(300, this.bay.body.clientWidth - 4), h: 600, room: id, hub: this.o.hub ?? null, close: () => this.back(), shake: (k) => shake(this.bay.el, 3 * k, 260) };
    try { this.panel = PANELS[f](ctx); } catch (e) { console.error('ship panel', f, e); }
  }
  /** a room or function not learned yet: its padlock, what it does, and what opens it, in words */
  private lockedPanel(host: HTMLElement, id: RoomId, f: FnId) {
    const feat = roomOpen(this.o.game, id) ? FN[f].feat : ROOM_FEAT[id];
    const r = reqLines(this.o.game, feat);
    const top = div('s7-row-top', host); const lk = icon3d('padlock', 48); top.append(lk);
    const st = status(`${roomOpen(this.o.game, id) ? FN[f].name : ROOM_NAME[id]} is locked. ${r.node ? `Learn ${r.node} on the research tree (RESEARCH, K).` : 'Nothing on the research tree opens it yet.'}`, 'warn'); st.el.style.flex = '1'; top.append(st.el);
    host.append(section('WHAT IT NEEDS'));
    for (const l of r.lines) host.append(kv(l.ok ? 'MET' : 'NEED', l.text, { color: l.ok ? '#b8e0a0' : '#ff9a80' }).el);
    host.append(status(reqSentence(this.o.game, feat) + '.', 'info').el);
    pop(lk, 1);
  }
  private panelReflow() { if (this.sel && this.fn) this.roomView(this.sel, this.fn); }

  // ---------------------------------------------------------------- leaving
  back() {
    if (this.closing) return;
    if (this.panel?.back?.()) return;
    if (this.sel) { uiSfx('back', 0.6); this.deselect(); return; }
    if (this.zoom.target > 1.05) { this.aim(SHIP_CENTRE, 1); uiSfx('back', 0.5); return; }
    this.close();
  }
  close() {
    if (this.closing) return;
    this.closing = true; hideTip();
    uiSfx('swishOut', 0.6);
    const out = () => tween(360, (k) => { this.wrap.style.transform = `translateY(${Math.round(k * k * 320)}px)`; this.el.style.opacity = String(1 - k * 0.6); }, ease.inCubic);
    const fin = () => this.dispose();
    void out().then(async () => { if (this.o.close) await this.o.close(fin); else fin(); });
  }
  dispose() {
    this.closing = true;
    this.panel?.dispose(); this.panel = null;
    for (const f of this.off) try { f(); } catch { /* gone */ }
    this.off = [];
    this.view3.dispose(); this.bay.dispose();
    this.el.remove();
    if (this.o.game) { this.o.game.paused = this.wasPaused; this.o.game.emit?.('ship-link', { open: false }); }
    if (ShipScreen.current === this) ShipScreen.current = null;
  }
}

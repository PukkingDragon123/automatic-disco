// THE SHIP SCREEN (v7, the dock's SHIP slot): a painted gunmetal frame holding ONE 3D element, the WHOLE MERIDIAN in
// space (its hull with the roof plates lifted away over the furnished deck cutaway, src/ship/screen/mini.ts), drawn
// as an outlined pixel-art model. The camera zooms smoothly from the whole ship into any room and back: the wheel
// zooms about the cursor, a drag pans, a click on a room flies into it and opens its functions, Esc or BACK flies
// out again. Every room carries its name; hovering one shows what it is for and, when it is locked, what opens it in
// words. Beside the ship, the function bay: the deck directory (every room, its purpose, open or locked) and, once a
// room is entered, its functions as named tabs with what each one does, over the function's own panel.
import * as THREE from 'three';
import { shipMini, SHIP_CENTRE, type ShipMini, type MiniView } from './mini';
import { ROOM_IDS, ROOMS, SHIP_NAME, type RoomId } from '../hub/layout';
import { ROOM_FNS, FN, FN_DESC, ROOM_ICON, ROOM_NAME, ROOM_PURPOSE, roomOpen, fnOpen, ROOM_FEAT, type FnId } from './gates';
import { shipCSS, div, place, artCanvas, S, iconOf, padlock, clean, pxPoly, pxLine, reqLines, reqList, reqSentence, textEl } from './ui';
import { PANELS, type Panel, type PanelCtx } from './panels';
import { plate, strip } from '../../ui/kit/mat';
import { Px, P, INK, hex, bevel, rivet, screw, hash, mixHex } from '../../ui/kit/px';
import { bitText, bitReady } from '../../ui/kit/bitfont';
import { uiSfx } from '../../ui/kit/sound';
import { onFrame, tween, ease, pop, Spring, shake } from '../../ui/kit/juice';
import { floatIcon } from '../../ui/kit/floatIcon';
import { toon } from '../../ui/kit/model3d';

export interface ShipScreenOpts {
  game: any | null;
  close?: (after: () => void) => Promise<void> | void;
  room?: RoomId; fn?: FnId;
  hub?: any;
}
const ZMAX = 6;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class ShipScreen {
  static current: ShipScreen | null = null;
  readonly el: HTMLDivElement;
  private frameEl: HTMLDivElement; private bg: HTMLCanvasElement;
  private miniCv: HTMLCanvasElement; private ov: HTMLCanvasElement; private ovc: CanvasRenderingContext2D;
  private pins = new Map<RoomId, { el: HTMLDivElement; icon: HTMLCanvasElement; name: HTMLDivElement }>();
  private tip: HTMLDivElement; private tipFor: RoomId | null = null;
  private status: HTMLDivElement; private zoomEl: HTMLDivElement;
  private bay: HTMLDivElement; private dir: HTMLDivElement; private head: HTMLDivElement; private body: HTMLDivElement; private tabs: HTMLDivElement; private roomName: HTMLDivElement;
  private mini: ShipMini | null = null;
  private AW = 0; private AH = 0;
  private well = { x: 0, y: 0, w: 0, h: 0 }; private bayR = { x: 0, y: 0, w: 0, h: 0 };
  // the camera: a target on the deck and a zoom over the whole-ship framing
  private zoom = new Spring(0.75, { k: 34, d: 11 });
  private tx = new Spring(SHIP_CENTRE.x, { k: 34, d: 11 }); private ty = new Spring(SHIP_CENTRE.y, { k: 34, d: 11 }); private tz = new Spring(SHIP_CENTRE.z, { k: 34, d: 11 });
  private drag: { x: number; y: number; t: THREE.Vector3; p: THREE.Vector3 | null; moved: boolean } | null = null;
  private hover: RoomId | null = null; private sel: RoomId | null = null; private fn: FnId | null = null;
  private panel: Panel | null = null;
  private last = ''; private renderAcc = 0; private t = 0;
  private off: (() => void)[] = [];
  private closing = false; private wasPaused = false;
  private sparks: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  private backEl: HTMLElement;
  constructor(readonly o: ShipScreenOpts) {
    ShipScreen.current = this; (window as unknown as { __ship7?: ShipScreen }).__ship7 = this;
    shipCSS();
    this.el = div('s7'); div('s7-veil', this.el);
    this.frameEl = div('s7-frame', this.el);
    this.bg = artCanvas(8, 8); this.frameEl.append(this.bg);
    this.miniCv = artCanvas(8, 8, 's7-abs s7-mini'); this.frameEl.append(this.miniCv);
    this.ov = artCanvas(8, 8, 's7-abs s7-ov'); this.frameEl.append(this.ov); this.ovc = this.ov.getContext('2d')!;
    this.status = div('s7-abs', this.frameEl); this.status.style.pointerEvents = 'none';
    this.zoomEl = div('s7-abs k7-t16', this.frameEl); this.zoomEl.style.pointerEvents = 'none'; this.zoomEl.style.color = '#ffd890';
    this.tip = div('s7-tag off', this.frameEl); this.tip.style.zIndex = '8';
    this.bay = div('s7-abs s7-bay', this.frameEl);
    this.dir = div('s7-panel', this.bay);
    this.head = div('s7-abs', this.bay); this.head.style.display = 'none';
    this.body = div('s7-abs', this.bay);
    this.roomName = div('s7-abs k7-t32 k7-name', this.frameEl); this.roomName.style.color = '#ffe7a8';
    this.tabs = div('s7-abs', this.frameEl); this.tabs.style.display = 'flex'; this.tabs.style.gap = 3 * S + 'px'; this.tabs.style.zIndex = '6';
    const back = floatIcon({ build: backModel, name: 'BACK', size: [34, 30], nameSize: 16, sound: 'back', view: { pitch: 0.5, spin: 0, yaw0: 0.4, hotSpin: 2, rock: 0.3 }, onClick: () => this.back() });
    back.el.classList.add('s7-abs'); back.el.style.zIndex = '7'; this.frameEl.append(back.el); this.backEl = back.el;
    document.body.append(this.el);
    if (o.game) { this.wasPaused = !!o.game.paused; o.game.paused = true; try { o.game.colony?.save?.(); } catch { /* no save */ } }
    this.layout();
    void bitReady().then(() => { if (!this.closing) { this.paintBg(); this.directory(); } });
    this.bindInput();
    this.off.push(onFrame((dt) => { if (this.closing && !this.el.isConnected) return false; this.frame(dt); return true; }) as unknown as () => void);
    addEventListener('keydown', this.onKey, true); addEventListener('resize', this.onResize);
    this.off.push(() => { removeEventListener('keydown', this.onKey, true); removeEventListener('resize', this.onResize); });
    const U = o.game?.unlocks; if (U?.on) this.off.push(U.on('change', () => this.refreshLocks()));
    o.game?.emit?.('screen-open', { id: 'ship' });
    o.game?.emit?.('ship-link', { open: true });
  }
  async ready(): Promise<void> {
    try { this.mini = await shipMini(); } catch (e) { console.error('ship model', e); }
    this.mini?.fitShip(this.miniCv.width, this.miniCv.height);
    this.refreshLocks();
    this.renderMini(true);
  }
  /** after the cover lifts: the frame rises, the ship drifts in from afar, the room names pop on */
  enter() {
    this.frameEl.style.transform = `translateY(${this.AH * S}px)`;
    void tween(620, (k) => { this.frameEl.style.transform = `translateY(${Math.round((1 - k) * 140) * S}px)`; }, ease.outBack).then(() => { this.frameEl.style.transform = ''; });
    uiSfx('swishIn', 0.6); setTimeout(() => uiSfx('metalClose', 0.45), 420);
    this.zoom.target = 1;
    let i = 0;
    for (const id of ROOM_IDS) { const p = this.pins.get(id); if (!p) continue; p.el.style.opacity = '0'; setTimeout(() => { p.el.style.opacity = ''; pop(p.el, 1.1); uiSfx('tick', 0.35, 0.9 + i * 0.05); }, 520 + i * 70); i++; }
    if (this.o.room) setTimeout(() => this.select(this.o.room!, this.o.fn), 900);
  }

  // ---------------------------------------------------------------- layout and paint
  private onResize = () => { this.layout(); this.paintBg(); this.mini?.fitShip(this.miniCv.width, this.miniCv.height); this.renderMini(true); this.directory(); this.panelReflow(); };
  private layout() {
    const AW = this.AW = Math.floor(innerWidth / S), AH = this.AH = Math.floor(innerHeight / S);
    const W = Math.min(AW - 16, 948), H = Math.min(AH - 16, 528), X = Math.floor((AW - W) / 2), Y = Math.floor((AH - H) / 2);
    place(this.frameEl, X, Y, W, H);
    this.bg.width = W; this.bg.height = H; place(this.bg, 0, 0, W, H);
    const bayW = Math.max(270, Math.min(340, Math.round(W * 0.36)));
    this.well = { x: 12, y: 40, w: W - bayW - 12 - 22, h: H - 52 };
    this.bayR = { x: W - bayW - 12, y: 40, w: bayW, h: H - 52 };
    for (const c of [this.miniCv, this.ov]) { c.width = this.well.w - 8; c.height = this.well.h - 8; place(c, this.well.x + 4, this.well.y + 4, this.well.w - 8, this.well.h - 8); c.getContext('2d')!.imageSmoothingEnabled = false; }
    place(this.status, this.well.x + 10, this.well.y + this.well.h - 22, this.well.w - 20);
    place(this.zoomEl, this.well.x + this.well.w - 92, this.well.y + 8);
    place(this.bay, this.bayR.x, this.bayR.y, this.bayR.w, this.bayR.h);
    place(this.head, 0, 0, this.bayR.w, 46);
    place(this.body, 0, 48, this.bayR.w, this.bayR.h - 48);
    place(this.roomName, 206, 4);
    place(this.tabs, 206, 6);
    place(this.backEl, W - 46, -8);
    for (const id of ROOM_IDS) if (!this.pins.has(id)) this.makePin(id);
  }
  private get view(): MiniView { return { w: this.miniCv.width, h: this.miniCv.height, zoom: this.zoom.x, tx: this.tx.x, ty: this.ty.x, tz: this.tz.x }; }
  private paintBg() {
    const W = this.bg.width, H = this.bg.height;
    const p = plate(W, H, { mat: 'gun', seed: 17, screws: true, wear: 1.1, chamfer: 6, lip: 3, grime: 0.8 });
    p.blit(strip(184, 26, 'brass', 5), 12, 8);
    // the view port: deep space, a nebula's dithered haze, stars (some with crosses), the planet's limb below
    const w = this.well;
    bevel(p, w.x - 3, w.y - 3, w.w + 6, w.h + 6, P.steel, { chamfer: 4, sunk: true });
    for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) {
      const u = (x - w.x) / w.w, v = (y - w.y) / w.h;
      const n = hash(x >> 3, y >> 3, 5) * 0.5 + hash(x >> 4, y >> 4, 6) * 0.5;
      const neb = Math.max(0, 1 - Math.hypot(u - 0.72, v - 0.3) * 2.2) * (0.6 + n * 0.6);
      let c = mixHex(0x05060c, 0x0c1424, v * 0.6);
      if (neb > 0.25 + hash(x, y, 7) * 0.35) c = mixHex(c, 0x2a2048, Math.min(0.6, neb * 0.7));
      // the planet's limb: a lit arc of atmosphere and the dark disc under it
      const pd = Math.hypot((x - (w.x - w.w * 0.1)) / (w.w * 0.9), (y - (w.y + w.h * 1.95)) / (w.h * 1.1));
      if (pd < 1) c = pd > 0.985 ? 0x6aa8d8 : pd > 0.96 ? mixHex(0x2a5070, 0x6aa8d8, (pd - 0.96) / 0.025) : mixHex(0x0a1420, 0x1c3448, Math.max(0, (pd - 0.8) * 4));
      p.set(x, y, c);
    }
    for (let i = 0; i < 260; i++) {
      const x = Math.floor(w.x + hash(i, 1, 9) * w.w), y = Math.floor(w.y + hash(i, 2, 9) * w.h), b = hash(i, 3, 9);
      if (p.get(x, y) === 0x6aa8d8) continue;
      p.set(x, y, b > 0.85 ? 0xfff4d8 : b > 0.5 ? 0x9aa8c0 : 0x4a5468);
      if (b > 0.96) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, 0x6a7890); }
    }
    for (const [bx, by, sx, sy] of [[w.x - 1, w.y - 1, 1, 1], [w.x + w.w, w.y - 1, -1, 1], [w.x - 1, w.y + w.h, 1, -1], [w.x + w.w, w.y + w.h, -1, -1]]) {
      for (let k = 0; k < 18; k++) { p.set(bx + sx * k, by, P.brass[4]); p.set(bx, by + sy * k, P.brass[4]); p.set(bx + sx * k, by + sy, P.brass[2]); p.set(bx + sx, by + sy * k, P.brass[2]); }
      screw(p, bx + sx * 5 - (sx < 0 ? 4 : 0), by + sy * 5 - (sy < 0 ? 4 : 0), bx + by);
    }
    // the readout strip along the port's foot
    for (let y = w.y + w.h - 26; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) p.set(x, y, mixHex(p.get(x, y) < 0 ? 0 : p.get(x, y), 0x08090c, 0.72));
    p.hl(w.x, w.x + w.w - 1, w.y + w.h - 27, P.steel[2]);
    const b = this.bayR;
    bevel(p, b.x - 3, b.y - 3, b.w + 6, b.h + 6, P.steel, { chamfer: 4, sunk: true });
    for (let x = 30; x < W - 30; x += 14) rivet(p, x, H - 6, 1, P.steel);
    const c = this.bg.getContext('2d')!; c.imageSmoothingEnabled = false;
    c.putImageData(p.image(), 0, 0);
    bitText(c, clean(SHIP_NAME.replace('UNAA ', '')), 104, 13, { color: hex(P.brass[0]), outline: null, shadow: hex(P.brass[5]), align: 'center' });
  }
  private makePin(id: RoomId) {
    const el = div('s7-pin', this.frameEl); el.style.zIndex = '4'; el.style.display = 'flex'; el.style.flexDirection = 'column'; el.style.alignItems = 'center';
    const icon = artCanvas(22, 22, ''); el.append(icon);
    const name = div('k7-name k7-t16', el); name.textContent = ROOM_NAME[id];
    this.pins.set(id, { el, icon, name });
    this.paintPin(id);
  }
  private paintPin(id: RoomId) {
    const pin = this.pins.get(id); if (!pin) return;
    const open = roomOpen(this.o.game, id), hot = this.hover === id, sel = this.sel === id;
    const p = new Px(22, 22);
    p.disc(11, 11, 10.5, () => INK);
    const ramp = !open ? P.stone : sel ? P.ochre : hot ? P.brass : P.steel;
    p.disc(11, 11, 9.5, (_d, lit) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(3 + lit * 2)))]);
    p.disc(11, 11, 7, () => INK);
    p.disc(11, 11, 6, (_d, lit) => mixHex(P.ink[2], P.steel[2], 0.4 + lit * 0.3));
    const c = pin.icon.getContext('2d')!; c.imageSmoothingEnabled = false; c.clearRect(0, 0, 22, 22); c.putImageData(p.image(), 0, 0);
    if (open) c.drawImage(iconOf(ROOM_ICON[id], sel || hot ? 'lit' : 'amber'), 3, 3, 16, 16);
    else c.drawImage(padlock(), 5, 4, 12, 14);
    pin.name.style.color = !open ? '#9a9488' : sel ? '#ffe7a8' : hot ? '#fff4cf' : '#e8dcc0';
    pin.el.classList.toggle('hot', hot);
  }
  private refreshLocks() {
    if (!this.mini) return;
    let ch = false;
    for (const id of ROOM_IDS) ch = this.mini.setLook(id, !roomOpen(this.o.game, id) ? 'locked' : this.sel === id ? 'open' : this.hover === id ? 'hot' : 'idle') || ch;
    for (const id of ROOM_IDS) this.paintPin(id);
    if (ch) this.renderMini(true);
    if (this.sel) this.paintTabs(); else this.directory();
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
    // the room pins and names; when zoomed into one room the others step back
    const ox = this.well.x + 4, oy = this.well.y + 4, W = this.ov.width, H = this.ov.height;
    for (const id of ROOM_IDS) {
      const pin = this.pins.get(id)!, q = m.centre(id), [x, y] = m.project(q.x, 2.4, q.z, v);
      const inside = x > 10 && y > 20 && x < W - 10 && y < H - 30;
      pin.el.style.visibility = inside ? '' : 'hidden';
      pin.el.style.opacity = this.sel && this.sel !== id && this.zoom.x > 2 ? '0.45' : '';
      pin.el.style.left = Math.round(ox + x) * S + 'px'; pin.el.style.top = Math.round(oy + y + 10) * S + 'px';
    }
    this.zoomEl.textContent = `ZOOM ${this.zoom.x.toFixed(1)}x`;
  }
  /** the status line along the port's foot: where you are and what to do */
  private paintStatus() {
    const open = ROOM_IDS.filter((r) => roomOpen(this.o.game, r)).length;
    const s = this.sel ? `${ROOM_NAME[this.sel]}: ${ROOM_PURPOSE[this.sel]}  Wheel out or BACK for the whole ship.` : `${clean(SHIP_NAME)}, research vessel in orbit. ${open} of ${ROOM_IDS.length} decks open. Click a room to go in; wheel to zoom, drag to pan.`;
    this.status.replaceChildren(textEl(s, { color: '#d8ccb0', wrap: false }));
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
        if (!this.drag.moved && Math.hypot(x - this.drag.x, y - this.drag.y) > 3) { this.drag.moved = true; cv.classList.add('drag'); }
        if (this.drag.moved && this.drag.p && this.mini) {
          // pan: the deck point under the pointer stays under it
          const q = this.mini.deckAt(x, y, { ...this.view, tx: this.drag.t.x, ty: this.drag.t.y, tz: this.drag.t.z }, this.drag.t.y);
          if (q) { const n = this.drag.t.clone().sub(q.sub(this.drag.p)); this.aim(n, this.zoom.target, true); }
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
  /** set the camera's goal (clamped to the ship), snapping back to the whole ship near zoom 1 */
  private aim(t: THREE.Vector3, z: number, instant = false) {
    z = clamp(z, 1, ZMAX);
    const k = (z - 1) / (ZMAX - 1), c = SHIP_CENTRE;
    // the further out, the closer the target is held to the ship's middle
    const lim = (a: number, lo: number, hi: number, mid: number) => clamp(a, mid + (lo - mid) * Math.min(1, k * 3), mid + (hi - mid) * Math.min(1, k * 3));
    this.tx.target = lim(t.x, -7, 7, c.x); this.ty.target = clamp(t.y, 0, 2.5); this.tz.target = lim(t.z, -20, 20, c.z);
    if (z < 1.03) { this.tx.target = c.x; this.ty.target = c.y; this.tz.target = c.z; }
    this.zoom.target = z;
    if (instant) for (const s of [this.tx, this.ty, this.tz]) s.x = s.target;
  }
  /** zoom about a canvas point: the deck point under it stays put */
  private zoomAt(x: number, y: number, f: number) {
    if (!this.mini) return;
    const z0 = this.zoom.target, z1 = clamp(z0 * f, 1, ZMAX); if (Math.abs(z1 - z0) < 1e-3) { uiSfx('tick', 0.2, 0.6); return; }
    const T = new THREE.Vector3(this.tx.target, this.ty.target, this.tz.target);
    const p = this.mini.deckAt(x, y, { ...this.view, zoom: z0, tx: T.x, ty: T.y, tz: T.z }, 1) ?? T.clone();
    const n = p.clone().sub(p.clone().sub(T).multiplyScalar(z0 / z1));
    this.aim(n, z1);
    uiSfx('tick', 0.25, f > 1 ? 1.3 : 0.9);
    if (z1 <= 1.02 && this.sel) this.deselect(false);
  }
  private setHover(id: RoomId | null, cx = 0, cy = 0) {
    if (id === this.hover) { if (id) this.moveTip(cx, cy); return; }
    const prev = this.hover; this.hover = id;
    if (id) uiSfx('hover', 0.45);
    this.miniCv.style.cursor = id ? 'pointer' : '';
    if (this.mini) { for (const r of [prev, id]) if (r) this.mini.setLook(r, !roomOpen(this.o.game, r) ? 'locked' : this.sel === r ? 'open' : this.hover === r ? 'hot' : 'idle'); this.renderMini(true); }
    for (const r of [prev, id]) if (r) this.paintPin(r);
    if (id && id !== this.sel) this.showTip(id, cx, cy); else this.hideTip();
  }
  /** the room card: its name, what it is for, what it holds; when locked, what opens it, in words */
  private showTip(id: RoomId, cx: number, cy: number) {
    const open = roomOpen(this.o.game, id), W = 220;
    this.tip.replaceChildren();
    const bgEl = div('s7-abs', this.tip), col = div('', this.tip);
    col.style.position = 'relative'; col.style.padding = `${6 * S}px ${7 * S}px`; col.style.width = W * S + 'px'; col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = 2 * S + 'px';
    col.append(textEl(ROOM_NAME[id] + (open ? '' : '  (LOCKED)'), { color: open ? '#ffe7a8' : '#ff9a80', wrap: false }), textEl(ROOM_PURPOSE[id], { color: '#d8ccb0' }));
    if (open) for (const f of ROOM_FNS[id]) col.append(textEl(`${fnOpen(this.o.game, id, f) ? '>' : 'x'} ${FN[f].name}: ${FN_DESC[f]}`, { color: fnOpen(this.o.game, id, f) ? '#b8d8a0' : '#a09888' }));
    else {
      const r = reqLines(this.o.game, ROOM_FEAT[id]);
      col.append(textEl(r.node ? `Learn ${r.node} on the research tree (K).` : 'Not on the research tree yet.', { color: '#e8dcc0' }));
      if (r.lines.length) col.append(reqList(r.lines));
    }
    col.append(textEl(open ? 'Click to go in.' : 'Click to see it locked.', { color: '#8a8478', wrap: false }));
    requestAnimationFrame(() => {
      const w = Math.ceil(col.offsetWidth / S), h = Math.ceil(col.offsetHeight / S);
      const cv = plate(w, h, { mat: 'gun', seed: 9, chamfer: 3, wear: 0.6, lip: 2, screws: true }).canvas(); cv.style.width = w * S + 'px'; cv.style.height = h * S + 'px'; bgEl.replaceChildren(cv);
    });
    this.tipFor = id; this.tip.classList.remove('off'); this.tip.style.transform = 'none';
    this.moveTip(cx, cy);
  }
  private moveTip(cx: number, cy: number) {
    if (!this.tipFor) return;
    const fr = this.frameEl.getBoundingClientRect(), x = (cx - fr.left) / S + 14, y = (cy - fr.top) / S + 14;
    place(this.tip, Math.round(Math.min(x, this.well.x + this.well.w - 236)), Math.round(Math.min(y, this.well.y + this.well.h - 120)));
  }
  private hideTip() { this.tipFor = null; this.tip.classList.add('off'); }
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
    const was = this.sel; this.sel = id; this.hideTip();
    // fly in: the room fills the port
    if (this.mini) { const c = this.mini.centre(id); this.aim(c, this.mini.roomZoom(id, this.view)); }
    if (this.mini) { if (was && was !== id) this.mini.setLook(was, roomOpen(this.o.game, was) ? 'idle' : 'locked'); if (roomOpen(this.o.game, id)) this.mini.setLook(id, 'open'); this.renderMini(true); }
    if (was) this.paintPin(was); this.paintPin(id);
    const pin = this.pins.get(id); if (pin) pop(pin.el, 1.2);
    uiSfx('select', 0.7); uiSfx('swishIn', 0.4);
    this.paintStatus();
    if (!roomOpen(this.o.game, id)) { uiSfx('error', 0.4); if (pin) shake(pin.el, 5); }
    else if (this.mini) { const q = this.mini.centre(id); setTimeout(() => { if (this.sel !== id || !this.mini) return; const [x, y] = this.mini.project(q.x, 0.6, q.z, this.view); for (let i = 0; i < 14; i++) this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 70, t: 0.4 + Math.random() * 0.4 }); }, 600); }
    const fns = ROOM_FNS[id];
    this.openFn(fn && fns.includes(fn) ? fn : fns.find((f) => fnOpen(this.o.game, id, f)) ?? fns[0], !was);
  }
  private deselect(zoomOut = true) {
    const was = this.sel; if (!was) return;
    this.sel = null; this.fn = null;
    if (this.mini) { this.mini.setLook(was, !roomOpen(this.o.game, was) ? 'locked' : this.hover === was ? 'hot' : 'idle'); this.renderMini(true); }
    this.paintPin(was);
    if (zoomOut) this.aim(SHIP_CENTRE, 1);
    uiSfx('swishOut', 0.4);
    this.tabs.replaceChildren(); this.roomName.textContent = '';
    this.panel?.dispose(); this.panel = null;
    this.paintStatus();
    this.directory(true);
  }
  /** the deck directory (no room entered): every room, its purpose, its state; click one to go in */
  private directory(anim = false) {
    if (this.sel) return;
    this.head.style.display = 'none'; this.body.replaceChildren(); this.dir.style.display = '';
    const W = this.bayR.w, H = this.bayR.h;
    this.dir.replaceChildren();
    const bg = artCanvas(W, H); this.dir.append(bg);
    bg.getContext('2d')!.putImageData(plate(W, H, { mat: 'steel', seed: 41, chamfer: 3, wear: 0.9, screws: true, grime: 0.7 }).image(), 0, 0);
    const col = div('s7-abs', this.dir); place(col, 10, 8, W - 20); col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = 2 * S + 'px';
    col.append(textEl('DECK DIRECTORY', { size: 32, color: '#ffe7a8', wrap: false }), textEl('Every deck of the MERIDIAN. A locked deck opens on the research tree.', { color: '#d8ccb0' }));
    const rowH = Math.floor((H - 64) / ROOM_IDS.length) - 2;
    for (const id of ROOM_IDS) {
      const open = roomOpen(this.o.game, id);
      const row = div('s7-card', col); row.style.position = 'relative'; row.style.height = rowH * S + 'px'; row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = 4 * S + 'px'; row.style.padding = `0 ${4 * S}px`;
      const rb = artCanvas(W - 20, rowH, 's7-abs'); rb.style.left = '0'; rb.style.top = '0'; row.append(rb);
      rb.getContext('2d')!.putImageData(plate(W - 20, rowH, { mat: open ? 'enamel' : 'steel', seed: id.length * 3, chamfer: 2, wear: 0.5, lip: 1, grime: 0.3 }).image(), 0, 0);
      const ic = artCanvas(16, 16, ''); ic.style.position = 'relative'; ic.getContext('2d')!.drawImage(open ? iconOf(ROOM_ICON[id], 'steel') : padlock(), 0, 0, 16, 16); row.append(ic);
      const tx = div('', row); tx.style.position = 'relative'; tx.style.overflow = 'hidden';
      tx.append(textEl(ROOM_NAME[id], { dark: open, color: open ? '#2a2014' : '#c8c0a8', wrap: false }), textEl(open ? ROOM_FNS[id].map((f) => FN[f].name).join(' / ') : clean(reqSentence(this.o.game, ROOM_FEAT[id])).slice(0, 44), { dark: open, color: open ? '#5a4a30' : '#ff9a80', wrap: false }));
      row.addEventListener('pointerenter', () => { uiSfx('hover', 0.4); this.setHover(id); });
      row.addEventListener('pointerleave', () => this.setHover(null));
      row.addEventListener('click', () => { uiSfx('click', 0.6); this.select(id); });
    }
    if (anim) { this.dir.style.transform = `translateX(${40 * S}px)`; this.dir.style.opacity = '0'; void tween(260, (k) => { this.dir.style.transform = `translateX(${Math.round((1 - k) * 40) * S}px)`; this.dir.style.opacity = String(k); }, ease.outBack).then(() => { this.dir.style.transform = ''; }); }
    this.paintStatus();
  }
  private openFn(f: FnId, fresh: boolean) {
    const id = this.sel!; this.fn = f;
    this.paintTabs();
    const swap = () => {
      this.panel?.dispose(); this.panel = null; this.body.replaceChildren(); this.dir.style.display = 'none';
      this.paintHead(id, f);
      if (!fnOpen(this.o.game, id, f)) { this.lockedPanel(id, f); return; }
      const ctx: PanelCtx = { game: this.o.game, host: this.body, w: this.bayR.w, h: this.bayR.h - 48, room: id, hub: this.o.hub ?? null, close: () => this.back(), shake: (k) => shake(this.frameEl, 3 * k, 260) };
      try { this.panel = PANELS[f](ctx); } catch (e) { console.error('ship panel', f, e); }
    };
    const el = this.bay;
    uiSfx(fresh ? 'shutter' : 'swishOut', 0.4);
    void tween(fresh ? 180 : 140, (k) => { el.style.transform = `translateX(${Math.round(k * 40) * S}px)`; el.style.opacity = String(1 - k); }, ease.inCubic).then(() => {
      swap(); uiSfx('swishIn', 0.4);
      return tween(260, (k) => { el.style.transform = `translateX(${Math.round((1 - k) * -40) * S}px)`; el.style.opacity = String(k); }, ease.outBack);
    }).then(() => { el.style.transform = ''; el.style.opacity = ''; });
  }
  /** the bay's head: what the room is for and what this function does */
  private paintHead(id: RoomId, f: FnId) {
    const W = this.bayR.w; this.head.style.display = ''; this.head.replaceChildren();
    const bg = artCanvas(W, 46); this.head.append(bg);
    bg.getContext('2d')!.putImageData(plate(W, 46, { mat: 'enamel', seed: 7, chamfer: 3, wear: 0.6, lip: 2, grime: 0.3 }).image(), 0, 0);
    const col = div('s7-abs', this.head); place(col, 8, 4, W - 16); col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = '0';
    col.append(textEl(ROOM_PURPOSE[id], { dark: true, color: '#5a4a30' }), textEl(`${FN[f].name}: ${FN_DESC[f]}`, { dark: true }));
  }
  private paintTabs() {
    const id = this.sel; if (!id) { this.tabs.replaceChildren(); return; }
    this.roomName.textContent = '';
    this.tabs.replaceChildren();
    const nm = div('k7-t32 k7-name', this.tabs); nm.textContent = ROOM_NAME[id]; nm.style.marginRight = 6 * S + 'px'; nm.style.color = '#ffe7a8';
    for (const f of ROOM_FNS[id]) {
      const open = fnOpen(this.o.game, id, f), on = this.fn === f;
      const t = div('s7-tab' + (on ? ' on' : ''), this.tabs); t.style.position = 'relative'; t.style.display = 'flex'; t.style.alignItems = 'center'; t.style.gap = 2 * S + 'px'; t.style.padding = `0 ${5 * S}px 0 ${3 * S}px`; t.style.height = 24 * S + 'px';
      const bgc = div('s7-abs', t); bgc.style.left = '0'; bgc.style.top = '0'; t.append(bgc);
      const ic = artCanvas(18, 18, ''); ic.style.position = 'relative'; t.append(ic);
      ic.getContext('2d')!.drawImage(open ? iconOf(FN[f].icon, on ? 'amber' : 'steel') : padlock(), 0, 0, 18, 18);
      const lb = textEl(FN[f].name, { dark: on, color: on ? '#2a2014' : open ? '#e8dcc0' : '#a09888', wrap: false }); lb.style.position = 'relative'; t.append(lb);
      requestAnimationFrame(() => { const w = Math.ceil(t.offsetWidth / S); const p = new Px(w, 24); bevel(p, 1, 1, w - 2, 22, on ? P.bone : open ? P.steel : P.stone, { chamfer: 2 }); const cv = p.canvas(); cv.style.width = w * S + 'px'; cv.style.height = 24 * S + 'px'; bgc.replaceChildren(cv); });
      t.title = `${FN[f].name}: ${FN_DESC[f]}`;
      t.addEventListener('pointerenter', () => uiSfx('hover', 0.4));
      t.addEventListener('click', (e) => { e.stopPropagation(); if (this.fn === f) return; uiSfx('tab', 0.6); pop(t, 0.8); this.openFn(f, false); });
    }
    pop(this.tabs, 0.5);
  }
  /** a room or function not learned yet: its lock, what it does, and what opens it, in words */
  private lockedPanel(id: RoomId, f: FnId) {
    const W = this.bayR.w, H = this.bayR.h - 48;
    const bg = artCanvas(W, H); this.body.append(bg);
    bg.getContext('2d')!.putImageData(plate(W, H, { mat: 'steel', seed: 7 + id.length, chamfer: 3, wear: 0.9, screws: true, grime: 0.8 }).image(), 0, 0);
    const c = bg.getContext('2d')!; c.globalAlpha = 0.3; c.drawImage(iconOf(FN[f].icon, 'dim'), W / 2 - 40, 14, 80, 80); c.globalAlpha = 1;
    const lk = padlock(2.4); lk.style.position = 'absolute'; place(lk, W / 2 - 17, 34); this.body.append(lk);
    const feat = roomOpen(this.o.game, id) ? FN[f].feat : ROOM_FEAT[id];
    const r = reqLines(this.o.game, feat);
    const col = div('s7-abs', this.body); place(col, 12, 108, W - 24); col.style.display = 'flex'; col.style.flexDirection = 'column'; col.style.gap = 3 * S + 'px';
    col.append(
      textEl(`${roomOpen(this.o.game, id) ? FN[f].name : ROOM_NAME[id]} IS LOCKED`, { color: '#ff9a80', wrap: false }),
      textEl(r.node ? `Learn ${r.node} on the research tree (RESEARCH, K). It needs:` : 'Nothing on the research tree opens this yet.', { color: '#e8dcc0' }),
      reqList(r.lines),
      textEl(reqSentence(this.o.game, feat) + '.', { color: '#c8c0a8' }),
    );
    pop(lk, 1);
  }
  private panelReflow() { if (this.sel && this.fn) { const f = this.fn; this.fn = null; this.openFn(f, false); } }

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
    this.closing = true;
    uiSfx('swishOut', 0.6);
    const out = () => tween(360, (k) => { this.frameEl.style.transform = `translateY(${Math.round(k * k * 160) * S}px)`; this.el.style.opacity = String(1 - k * 0.6); }, ease.inCubic);
    const fin = () => this.dispose();
    void out().then(async () => { if (this.o.close) await this.o.close(fin); else fin(); });
  }
  dispose() {
    this.closing = true;
    this.panel?.dispose(); this.panel = null;
    for (const f of this.off) try { f(); } catch { /* gone */ }
    this.off = [];
    this.el.remove();
    if (this.o.game) { this.o.game.paused = this.wasPaused; this.o.game.emit?.('ship-link', { open: false }); }
    if (ShipScreen.current === this) ShipScreen.current = null;
  }
}

/** the BACK key's model: a hatch lever, red enamel grip on a steel boss */
function backModel(): THREE.Group {
  const g = new THREE.Group();
  const steel = toon({ color: 0xb8bcc0, metal: 0.8 }), red = toon({ color: 0xc8382a, gloss: 0.5 }), dark = toon({ color: 0x40444a, metal: 0.6 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.16, 16), dark));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 18), steel); ring.rotation.x = Math.PI / 2; ring.position.y = 0.09; g.add(ring);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), steel); arm.position.set(0.18, 0.36, 0); arm.rotation.z = -0.5; g.add(arm);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 10), red); grip.position.set(0.42, 0.66, 0); grip.rotation.z = 1.07; g.add(grip);
  return g;
}

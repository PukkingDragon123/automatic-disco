// THE SHIP SCREEN (v7, the dock's SHIP slot): a painted gunmetal frame holding ONE 3D element, the MERIDIAN's own
// cutaway as an outlined, rotatable miniature on a turntable in a sunk display bay. Rooms are hotspots on it: hover
// lights the room and floats its name; a locked room is a cold ghost with a padlock, and hovering it hangs a tag of
// what opens it (knowledge, items, a bond with a face). Clicking an open room turns the miniature toward it and rolls
// up the function bay's shutter on the right: the room's functions as compact textured panels with their own 3D
// elements (src/ship/screen/panels/*). Drag turns the ship, the wheel leans in, Esc steps back.
import * as THREE from 'three';
import { shipMini, MINI_YAW0, MINI_PITCH0, type ShipMini, type MiniView } from './mini';
import { ROOM_IDS, ROOMS, SHIP_NAME, type RoomId } from '../hub/layout';
import { ROOM_FNS, FN, ROOM_ICON, ROOM_SHORT, roomOpen, fnOpen, ROOM_FEAT, type FnId } from './gates';
import { shipCSS, div, place, artCanvas, S, iconOf, reqChips, chipRow, padlock, clean } from './ui';
import { PANELS, type Panel, type PanelCtx } from './panels';
import { plate, strip } from '../../ui/kit/mat';
import { Px, P, INK, hex, glassWell, bevel, rivet, screw, hash, mixHex } from '../../ui/kit/px';
import { bitText, bitReady } from '../../ui/kit/bitfont';
import { uiSfx } from '../../ui/kit/sound';
import { onFrame, tween, ease, pop, Spring, burst, shake } from '../../ui/kit/juice';
import { floatIcon } from '../../ui/kit/floatIcon';
import { toon } from '../../ui/kit/model3d';
import { libColor } from '../../ui/kit/libmat';

export interface ShipScreenOpts {
  game: any | null;
  /** close: play the way out (the dock's transition), then after() */
  close?: (after: () => void) => Promise<void> | void;
  /** open straight onto a room (and its first function) */
  room?: RoomId; fn?: FnId;
  /** the hub (when shown over the ship itself) */
  hub?: any;
}

export class ShipScreen {
  static current: ShipScreen | null = null;
  readonly el: HTMLDivElement;
  private frameEl: HTMLDivElement; private bg: HTMLCanvasElement;
  private miniCv: HTMLCanvasElement; private ov: HTMLCanvasElement; private ovc: CanvasRenderingContext2D;
  private pins = new Map<RoomId, { el: HTMLDivElement; icon: HTMLCanvasElement; name: HTMLDivElement; t: number }>();
  private tag: HTMLDivElement; private tagFor: RoomId | null = null;
  private bay: HTMLDivElement; private shutter: HTMLDivElement; private tabs: HTMLDivElement; private body: HTMLDivElement;
  private mini: ShipMini | null = null;
  private AW = 0; private AH = 0;
  private well = { x: 0, y: 0, w: 0, h: 0 }; private bayR = { x: 0, y: 0, w: 0, h: 0 };
  private yaw = new Spring(MINI_YAW0 + 1.4, { k: 26, d: 8 }); private pitch = new Spring(MINI_PITCH0 + 0.25, { k: 30, d: 9 }); private zk = new Spring(0.8, { k: 40, d: 10 });
  private drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean; id: number } | null = null;
  private hover: RoomId | null = null; private sel: RoomId | null = null; private fn: FnId | null = null;
  private panel: Panel | null = null;
  private last = { yaw: 0, pitch: 0, zoom: 0, key: '' }; private fitZ = 1; private renderAcc = 0; private t = 0; private idleT = 0;
  private off: (() => void)[] = [];
  private closing = false; private wasPaused = false;
  private sparks: { x: number; y: number; vx: number; vy: number; t: number; c: number }[] = [];
  constructor(readonly o: ShipScreenOpts) {
    ShipScreen.current = this; (window as unknown as { __ship7?: ShipScreen }).__ship7 = this;
    shipCSS();
    this.el = div('s7'); div('s7-veil', this.el);
    this.frameEl = div('s7-frame', this.el);
    this.bg = artCanvas(8, 8); this.frameEl.append(this.bg);
    this.miniCv = artCanvas(8, 8, 's7-abs s7-mini'); this.frameEl.append(this.miniCv);
    this.ov = artCanvas(8, 8, 's7-abs s7-ov'); this.frameEl.append(this.ov); this.ovc = this.ov.getContext('2d')!;
    this.tag = div('s7-tag off', this.frameEl);
    this.bay = div('s7-abs s7-bay', this.frameEl);
    this.body = div('s7-panel', this.bay);
    this.shutter = div('s7-abs', this.bay); this.shutter.style.zIndex = '5';
    this.tabs = div('s7-abs', this.frameEl); this.tabs.style.display = 'flex'; this.tabs.style.gap = 4 * S + 'px'; this.tabs.style.zIndex = '6';
    // the way back: a floating hatch handle with its name under it
    const back = floatIcon({ build: backModel, name: 'BACK', size: [34, 30], nameSize: 16, sound: 'back', view: { pitch: 0.5, spin: 0, yaw0: 0.4, hotSpin: 2, rock: 0.3 }, onClick: () => this.back() });
    back.el.classList.add('s7-abs'); back.el.style.zIndex = '7'; this.frameEl.append(back.el); this.backEl = back.el;
    document.body.append(this.el);
    if (o.game) { this.wasPaused = !!o.game.paused; o.game.paused = true; try { o.game.colony?.save?.(); } catch { /* no save */ } }
    this.layout();
    void bitReady().then(() => { if (!this.closing) { this.paintBg(); this.paintShutter(); } });
    this.bindInput();
    this.off.push(onFrame((dt) => { if (this.closing && !this.el.isConnected) return false; this.frame(dt); return true; }) as unknown as () => void);
    addEventListener('keydown', this.onKey, true); addEventListener('resize', this.onResize);
    this.off.push(() => { removeEventListener('keydown', this.onKey, true); removeEventListener('resize', this.onResize); });
    const U = o.game?.unlocks; if (U?.on) this.off.push(U.on('change', () => this.refreshLocks()));
    o.game?.emit?.('screen-open', { id: 'ship' });
    o.game?.emit?.('ship-link', { open: true });
  }
  private backEl: HTMLElement;
  /** build the miniature (behind the cover), then the entrance: the frame rises, the ship swings in, pins pop */
  async ready(): Promise<void> {
    try { this.mini = await shipMini(); } catch (e) { console.error('ship miniature', e); }
    this.refreshLocks();
    this.fitZ = this.mini ? this.mini.fitZoom({ w: this.miniCv.width, h: this.miniCv.height, yaw: this.yaw.x, pitch: this.pitch.x }) : 1;
    this.renderMini(true);
  }
  /** after the cover lifts: the entrance juice */
  enter() {
    this.frameEl.style.transform = `translateY(${this.AH * S}px)`;
    void tween(620, (k) => { this.frameEl.style.transform = `translateY(${Math.round((1 - k) * 140) * S}px)`; }, ease.outBack).then(() => { this.frameEl.style.transform = ''; });
    uiSfx('swishIn', 0.6); setTimeout(() => uiSfx('metalClose', 0.45), 420);
    this.yaw.target = MINI_YAW0; this.pitch.target = MINI_PITCH0; this.zk.target = 1;
    let i = 0;
    for (const id of ROOM_IDS) { const p = this.pins.get(id); if (!p) continue; p.el.style.opacity = '0'; setTimeout(() => { p.el.style.opacity = ''; pop(p.el, 1.1); uiSfx('tick', 0.35, 0.9 + i * 0.05); }, 520 + i * 70); i++; }
    if (this.o.room) setTimeout(() => this.select(this.o.room!, this.o.fn), 900);
  }

  // ---------------------------------------------------------------- layout and paint
  private onResize = () => { this.layout(); this.paintBg(); this.paintShutter(); this.renderMini(true); this.panelReflow(); };
  private layout() {
    const AW = this.AW = Math.floor(innerWidth / S), AH = this.AH = Math.floor(innerHeight / S);
    const W = Math.min(AW - 24, 940), H = Math.min(AH - 24, 520), X = Math.floor((AW - W) / 2), Y = Math.floor((AH - H) / 2);
    place(this.frameEl, X, Y, W, H);
    this.bg.width = W; this.bg.height = H; place(this.bg, 0, 0, W, H);
    const bayW = Math.max(250, Math.min(330, Math.round(W * 0.35)));
    this.well = { x: 12, y: 40, w: W - bayW - 12 - 22, h: H - 52 };
    this.bayR = { x: W - bayW - 12, y: 40, w: bayW, h: H - 52 };
    for (const c of [this.miniCv, this.ov]) { c.width = this.well.w - 8; c.height = this.well.h - 8; place(c, this.well.x + 4, this.well.y + 4, this.well.w - 8, this.well.h - 8); c.getContext('2d')!.imageSmoothingEnabled = false; }
    place(this.bay, this.bayR.x, this.bayR.y, this.bayR.w, this.bayR.h);
    place(this.shutter, 0, 0, this.bayR.w, this.bayR.h);
    place(this.tabs, this.bayR.x + 6, 10);
    place(this.backEl, W - 46, -8);
    for (const id of ROOM_IDS) if (!this.pins.has(id)) this.makePin(id);
  }
  private get view(): MiniView { return { w: this.miniCv.width, h: this.miniCv.height, yaw: this.yaw.x, pitch: this.pitch.x, zoom: this.fitZ * this.zk.x }; }
  private paintBg() {
    const W = this.bg.width, H = this.bg.height;
    const p = plate(W, H, { mat: 'gun', seed: 17, screws: true, wear: 1.1, chamfer: 6, lip: 3, grime: 0.8 });
    // the name strip, brass, screwed on
    p.blit(strip(170, 26, 'brass', 5), 12, 8);
    // the display bay: a sunk well of dark anodised panel, a soft pool of light on the turntable
    const w = this.well;
    bevel(p, w.x - 3, w.y - 3, w.w + 6, w.h + 6, P.steel, { chamfer: 4, sunk: true });
    const cx = w.x + w.w / 2, cy = w.y + w.h * 0.58;
    for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) {
      const d = Math.hypot((x - cx) / (w.w * 0.62), (y - cy) / (w.h * 0.7));
      const k = 0.42 + Math.max(0, 1 - d) * 0.5 - Math.max(0, (y - w.y) / w.h - 0.85) * 0.4;
      p.set(x, y, libColor('gun', x, y, k));
    }
    // the turntable under the ship: a machined steel ring with bolts, in perspective
    const rx = w.w * 0.44, ry = rx * Math.sin(MINI_PITCH0) * 0.92, ty = w.y + w.h * 0.56;
    for (let y = Math.floor(ty - ry - 4); y < ty + ry + 8; y++) for (let x = Math.floor(cx - rx - 4); x < cx + rx + 4; x++) {
      const dx = (x - cx) / rx, dy = (y - ty) / ry, d = Math.hypot(dx, dy);
      if (d > 0.96 && d < 1.03) p.set(x, y, libColor('steel', x, y, dy < 0 ? 0.95 : 0.7));
      else if (d >= 1.03 && d < 1.07) p.set(x, y, INK);
      else if (d > 0.9 && d <= 0.96) p.set(x, y, libColor('darkSteel', x, y, 0.5));
      // the ring's thickness below its front
      const dy2 = (y - 4 - ty) / ry, d2 = Math.hypot(dx, dy2);
      if (dy > 0 && d > 1.07 && d2 < 1.05) p.set(x, y, libColor('steel', x, y, 0.45 + 0.2 * (1 - dy)));
    }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, bx = Math.round(cx + Math.cos(a) * rx * 0.995), by = Math.round(ty + Math.sin(a) * ry * 0.995); p.set(bx, by, P.steel[6]); p.set(bx + 1, by + 1, P.steel[1]); }
    // corner brackets on the well
    for (const [bx, by, sx, sy] of [[w.x - 1, w.y - 1, 1, 1], [w.x + w.w, w.y - 1, -1, 1], [w.x - 1, w.y + w.h, 1, -1], [w.x + w.w, w.y + w.h, -1, -1]]) {
      for (let k = 0; k < 18; k++) { p.set(bx + sx * k, by, P.brass[4]); p.set(bx, by + sy * k, P.brass[4]); p.set(bx + sx * k, by + sy, P.brass[2]); p.set(bx + sx, by + sy * k, P.brass[2]); }
      screw(p, bx + sx * 5 - (sx < 0 ? 4 : 0), by + sy * 5 - (sy < 0 ? 4 : 0), bx + by);
    }
    // the function bay's sunk frame
    const b = this.bayR;
    bevel(p, b.x - 3, b.y - 3, b.w + 6, b.h + 6, P.steel, { chamfer: 4, sunk: true });
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) p.set(x, y, libColor('darkSteel', x, y, 0.3));
    // rivet rows along the frame's foot
    for (let x = 30; x < W - 30; x += 14) rivet(p, x, H - 6, 1, P.steel);
    const c = this.bg.getContext('2d')!; c.imageSmoothingEnabled = false;
    c.putImageData(p.image(), 0, 0);
    bitText(c, clean(SHIP_NAME.replace('UNAA ', '')), 97, 13, { color: hex(P.brass[0]), outline: null, shadow: hex(P.brass[5]), align: 'center' });
  }
  /** the closed shutter: a rolled steel door with the program's roundel and a hazard foot */
  private paintShutter() {
    const W = this.bayR.w, H = this.bayR.h;
    const p = plate(W, H, { mat: 'olive', seed: 41, chamfer: 3, wear: 1, lip: 2, grime: 0.9, hazard: 10, rivets: true });
    // the slats: a lip every 22 px
    for (let y = 22; y < H - 20; y += 22) { p.hl(4, W - 5, y, INK); p.hl(4, W - 5, y + 1, mixHex(P.olive[5], 0xffffff, 0.15)); p.hl(4, W - 5, y - 1, P.olive[1]); }
    // the roundel: the ship's mark in a brass ring
    const cx = W / 2, cy = H * 0.42, r = Math.min(W, H) * 0.2;
    p.disc(cx, cy, r + 3, () => INK);
    p.disc(cx, cy, r + 2, (d, lit) => libColor('brass', Math.round(cx + d * 7), Math.round(cy + lit * 9), 0.75 + lit * 0.4));
    p.disc(cx, cy, r - 3, () => INK);
    p.disc(cx, cy, r - 4, (d, lit) => libColor('enamel', Math.round(cx + d * 9), Math.round(cy + lit * 11), 0.8 + lit * 0.25));
    // a stylised MERIDIAN: the hull and its ring
    for (let x = -r * 0.6; x <= r * 0.6; x++) { const hh = Math.max(1, Math.round((1 - Math.abs(x) / (r * 0.6)) * r * 0.16)); for (let y = -hh; y <= hh; y++) p.set(Math.round(cx + x), Math.round(cy + y), y < 0 ? P.steel[4] : P.steel[2]); }
    for (let a = 0; a < Math.PI * 2; a += 0.02) { const x = Math.round(cx + Math.cos(a) * r * 0.22), y = Math.round(cy + Math.sin(a) * r * 0.5); p.set(x, y, P.ruby[3]); }
    const c = this.shutter.querySelector('canvas') as HTMLCanvasElement ?? artCanvas(W, H, 's7-abs');
    if (!c.isConnected) this.shutter.append(c);
    c.width = W; c.height = H; c.style.width = W * S + 'px'; c.style.height = H * S + 'px';
    const g = c.getContext('2d')!; g.putImageData(p.image(), 0, 0);
    bitText(g, 'SELECT A ROOM', W / 2, Math.round(H * 0.42 + r + 14), { color: hex(P.bone[5]), extrude: [1, hex(P.olive[0])], align: 'center' });
  }
  private makePin(id: RoomId) {
    const el = div('s7-pin', this.frameEl); el.style.zIndex = '4';
    const icon = artCanvas(26, 26, ''); el.append(icon);
    const name = div('k7-name k7-t16', el); name.textContent = ROOM_SHORT[id]; name.style.opacity = '0'; name.style.transition = 'opacity .15s';
    this.pins.set(id, { el, icon, name, t: 0 });
    this.paintPin(id);
  }
  private paintPin(id: RoomId) {
    const pin = this.pins.get(id); if (!pin) return;
    const open = roomOpen(this.o.game, id), hot = this.hover === id, sel = this.sel === id;
    const p = new Px(26, 26);
    p.disc(13, 13, 11.5, () => INK);
    const ramp = !open ? P.stone : sel ? P.ochre : hot ? P.brass : P.steel;
    p.disc(13, 13, 10.5, (d, lit) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(2 + lit * 2.4 - d * 0.6)))]);
    p.disc(13, 13, 8, () => INK);
    p.disc(13, 13, 7, (d, lit) => mixHex(P.ink[2], P.steel[2], 0.4 + lit * 0.3));
    const c = pin.icon.getContext('2d')!; c.imageSmoothingEnabled = false; c.putImageData(p.image(), 0, 0);
    if (open) c.drawImage(iconOf(ROOM_ICON[id], sel || hot ? 'lit' : 'amber'), 4, 4, 18, 18);
    else { const lk = padlock(); c.drawImage(lk, 6, 5, 14, 16); }
    pin.name.style.opacity = hot || sel ? '1' : '0';
    pin.el.classList.toggle('hot', hot);
  }
  private refreshLocks() {
    if (!this.mini) return;
    let ch = false;
    for (const id of ROOM_IDS) ch = this.mini.setLook(id, !roomOpen(this.o.game, id) ? 'locked' : this.sel === id ? 'open' : this.hover === id ? 'hot' : 'idle') || ch;
    for (const id of ROOM_IDS) this.paintPin(id);
    if (ch) this.renderMini(true);
    if (this.sel) this.paintTabs();
  }

  // ---------------------------------------------------------------- the miniature
  private renderMini(force = false) {
    if (!this.mini) return;
    const v = this.view, key = `${v.w}x${v.h}`;
    if (!force && Math.abs(v.yaw - this.last.yaw) < 0.002 && Math.abs(v.pitch - this.last.pitch) < 0.002 && Math.abs(v.zoom - this.last.zoom) < 0.002 && key === this.last.key) return;
    this.last = { yaw: v.yaw, pitch: v.pitch, zoom: v.zoom, key };
    const c = this.miniCv.getContext('2d')!;
    this.mini.draw(c, v);
  }
  private frame(dt: number) {
    if (!this.el.isConnected) return;
    this.t += dt; this.idleT += dt;
    // a slow idle sway when nobody has touched it for a while
    if (!this.drag && this.idleT > 4 && !this.sel) this.yaw.target = MINI_YAW0 + Math.sin((this.idleT - 4) * 0.25) * 0.12;
    this.yaw.step(dt); this.pitch.step(dt); this.zk.step(dt);
    // frame the whole deck at the current angle (the hull never clips the well)
    if (this.mini && (!this.yaw.settled || !this.pitch.settled || this.fitZ === 1)) this.fitZ = this.mini.fitZoom({ w: this.miniCv.width, h: this.miniCv.height, yaw: this.yaw.x, pitch: this.pitch.x });
    this.renderAcc += dt;
    const moving = !this.yaw.settled || !this.pitch.settled || !this.zk.settled;
    if (moving && this.renderAcc > 1 / 30) { this.renderAcc = 0; this.renderMini(); }
    else if (!moving) this.renderMini();
    this.drawOverlay(dt);
    this.panel?.update?.(dt);
  }
  private drawOverlay(dt: number) {
    const c = this.ovc, v = this.view, m = this.mini;
    c.clearRect(0, 0, this.ov.width, this.ov.height);
    if (!m) { bitText(c, 'LINKING...', this.ov.width / 2, this.ov.height / 2, { color: '#ffd890', align: 'center' }); return; }
    // the locked rooms: a cold veil over their floor
    for (const id of ROOM_IDS) {
      const open = roomOpen(this.o.game, id), hot = this.hover === id, sel = this.sel === id;
      if (open && !hot && !sel) continue;
      const pts = m.outline(id, v, 0.02), top = m.outline(id, v, 1.05);
      if (!open) {
        c.fillStyle = hot ? 'rgba(40,50,70,0.08)' : 'rgba(14,20,34,0.16)';
        c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
      }
      // the outline: a lit amber trace (selected: brighter, pulsing), dimmed red-grey when locked
      const col = !open ? (hot ? '#c86a4a' : '#00000000') : sel ? '#ffd27a' : '#ffb850';
      if (col.length > 7) continue;
      const pulse = sel ? 0.75 + Math.sin(this.t * 5) * 0.25 : 1;
      c.globalAlpha = pulse;
      line(c, pts, '#08090c', 3); line(c, pts, col, 1);
      if (open) { c.globalAlpha = pulse * 0.6; line(c, top, col, 1); for (let i = 0; i < pts.length; i++) seg(c, pts[i], top[i], col); }
      c.globalAlpha = 1;
    }
    // weld-bright sparks (a room just opened)
    for (let i = this.sparks.length - 1; i >= 0; i--) { const s = this.sparks[i]; s.t -= dt; if (s.t <= 0) { this.sparks.splice(i, 1); continue; } s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; c.fillStyle = s.t > 0.3 ? '#fff0c0' : '#e89040'; c.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
    // the pins over each room
    const ox = this.well.x + 4, oy = this.well.y + 4;
    for (const id of ROOM_IDS) {
      const pin = this.pins.get(id)!, q = m.centre(id), [x, y] = m.project(q.x, 2.2, q.z, v);
      pin.el.style.left = Math.round(ox + x) * S + 'px'; pin.el.style.top = Math.round(oy + y + 13) * S + 'px';
    }
    if (this.tagFor) { const q = m.centre(this.tagFor), [x, y] = m.project(q.x, 2.2, q.z, v); place(this.tag, Math.round(ox + x), Math.round(oy + y + 18)); }
  }

  // ---------------------------------------------------------------- input
  private bindInput() {
    const cv = this.miniCv;
    const local = (e: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / S, (e.clientY - r.top) / S] as [number, number]; };
    const down = (e: PointerEvent) => { if (e.button > 0 || this.closing) return; const [x, y] = local(e); this.drag = { x, y, yaw: this.yaw.target, pitch: this.pitch.target, moved: false, id: e.pointerId }; cv.setPointerCapture(e.pointerId); this.idleT = 0; };
    const move = (e: PointerEvent) => {
      const [x, y] = local(e);
      if (this.drag) {
        const dx = x - this.drag.x, dy = y - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) > 3) { this.drag.moved = true; cv.classList.add('drag'); uiSfx('creak', 0.25); }
        if (this.drag.moved) {
          this.yaw.target = clamp(this.drag.yaw + dx * 0.008, MINI_YAW0 - 0.62, MINI_YAW0 + 0.62);
          this.pitch.target = clamp(this.drag.pitch + dy * 0.004, 0.48, 1.05);
          this.idleT = 0;
        }
        return;
      }
      this.setHover(this.mini ? this.mini.roomAt(x, y, this.view) : null);
    };
    const up = (e: PointerEvent) => {
      const d = this.drag; this.drag = null; cv.classList.remove('drag');
      try { cv.releasePointerCapture(e.pointerId); } catch { /* gone */ }
      if (!d || d.moved || !this.mini) { if (d?.moved) uiSfx('clunk', 0.3); return; }
      const [x, y] = local(e), id = this.mini.roomAt(x, y, this.view);
      if (id) this.select(id); else if (this.sel) this.deselect();
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); this.zk.target = clamp(this.zk.target * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.9, 1.7); this.idleT = 0; uiSfx('tick', 0.25, 1.3); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
    cv.addEventListener('pointerleave', () => { if (!this.drag) this.setHover(null); });
    cv.addEventListener('wheel', wheel, { passive: false });
    this.el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.back(); });
  }
  private setHover(id: RoomId | null) {
    if (id === this.hover) return;
    const prev = this.hover; this.hover = id;
    if (id) uiSfx('hover', 0.45);
    this.miniCv.style.cursor = id ? 'pointer' : '';
    if (this.mini) { for (const r of [prev, id]) if (r) this.mini.setLook(r, !roomOpen(this.o.game, r) ? 'locked' : this.sel === r ? 'open' : this.hover === r ? 'hot' : 'idle'); this.renderMini(true); }
    for (const r of [prev, id]) if (r) this.paintPin(r);
    // a locked room hangs the tag of what opens it
    if (id && !roomOpen(this.o.game, id)) this.showTag(id, ROOM_FEAT[id]);
    else this.hideTag();
  }
  private showTag(id: RoomId, feat: string) {
    const chips = reqChips(this.o.game, feat);
    this.tag.replaceChildren();
    const plateEl = div('s7-abs', this.tag);
    const row = div('', this.tag); row.style.position = 'relative'; row.style.padding = `${5 * S}px ${6 * S}px`;
    chipRow(row, [padlock(0.8), ...chips]);
    requestAnimationFrame(() => {
      const w = Math.ceil(row.offsetWidth / S), h = Math.ceil(row.offsetHeight / S);
      const p = plate(w, h, { mat: 'steel', seed: 9, chamfer: 3, wear: 0.6, lip: 2, screws: false });
      const cv = p.canvas(); cv.style.width = w * S + 'px'; cv.style.height = h * S + 'px'; plateEl.replaceChildren(cv);
    });
    this.tagFor = id; this.tag.classList.remove('off');
  }
  private hideTag() { this.tagFor = null; this.tag.classList.add('off'); }
  private onKey = (e: KeyboardEvent) => {
    if (!this.el.isConnected || this.closing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.back(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { this.yaw.target = clamp(this.yaw.target + (e.key === 'ArrowLeft' ? -0.15 : 0.15), MINI_YAW0 - 0.62, MINI_YAW0 + 0.62); this.idleT = 0; }
    const n = Number(e.key); if (n >= 1 && n <= 9) { const id = ROOM_IDS.find((r) => ROOMS[r].code === '0' + n); if (id) this.select(id); }
    e.stopPropagation();
  };

  // ---------------------------------------------------------------- rooms and their functions
  select(id: RoomId, fn?: FnId) {
    if (this.closing) return;
    if (!roomOpen(this.o.game, id)) {
      uiSfx('error', 0.6); const p = this.pins.get(id); if (p) shake(p.el, 5);
      this.setHover(id); return;
    }
    const was = this.sel; this.sel = id;
    // turn the miniature toward the room a little (within the arc)
    const r = ROOMS[id], cz = (r.z0 + r.z1) / 2, cx = (r.x0 + r.x1) / 2;
    this.yaw.target = clamp(MINI_YAW0 + (cz / 18) * 0.16 - (cx / 7) * 0.08, MINI_YAW0 - 0.4, MINI_YAW0 + 0.4);
    this.zk.target = 1.04; this.idleT = 0; this.zk.kick(-0.6);
    if (this.mini) { if (was) this.mini.setLook(was, 'idle'); this.mini.setLook(id, 'open'); this.renderMini(true); }
    if (was) this.paintPin(was); this.paintPin(id);
    const pin = this.pins.get(id); if (pin) pop(pin.el, 1.2);
    uiSfx('select', 0.7);
    if (this.mini) { const q = this.mini.centre(id), [x, y] = this.mini.project(q.x, 0.6, q.z, this.view); for (let i = 0; i < 14; i++) this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 70, t: 0.4 + Math.random() * 0.4, c: 0 }); }
    const fns = ROOM_FNS[id];
    this.openFn(fn && fns.includes(fn) ? fn : fns.find((f) => fnOpen(this.o.game, id, f)) ?? fns[0], was === null);
  }
  private deselect() {
    const was = this.sel; if (!was) return;
    this.sel = null; this.fn = null;
    if (this.mini) { this.mini.setLook(was, this.hover === was ? 'hot' : 'idle'); this.renderMini(true); }
    this.paintPin(was);
    this.zk.target = 1;
    this.tabs.replaceChildren();
    this.closeShutter();
  }
  private openFn(f: FnId, fresh: boolean) {
    const id = this.sel!; this.fn = f;
    this.paintTabs();
    const swap = () => {
      this.panel?.dispose(); this.panel = null; this.body.replaceChildren();
      if (!fnOpen(this.o.game, id, f)) { this.lockedPanel(id, f); return; }
      const mk = PANELS[f];
      const ctx: PanelCtx = { game: this.o.game, host: this.body, w: this.bayR.w, h: this.bayR.h, room: id, hub: this.o.hub ?? null, close: () => this.back(), shake: (k) => shake(this.frameEl, 3 * k, 260) };
      try { this.panel = mk(ctx); } catch (e) { console.error('ship panel', f, e); }
    };
    // the shutter rolls up the first time; after that the panel slides across
    if (fresh || this.shutterDown) { swap(); this.rollShutter(); }
    else {
      const el = this.body; uiSfx('swishOut', 0.4);
      void tween(140, (k) => { el.style.transform = `translateX(${Math.round(k * 40) * S}px)`; el.style.opacity = String(1 - k); }, ease.inCubic).then(() => {
        swap(); uiSfx('swishIn', 0.4);
        return tween(240, (k) => { el.style.transform = `translateX(${Math.round((1 - k) * -40) * S}px)`; el.style.opacity = String(k); }, ease.outBack);
      }).then(() => { el.style.transform = ''; el.style.opacity = ''; });
    }
  }
  private shutterDown = true;
  private rollShutter() {
    if (!this.shutterDown) return; this.shutterDown = false;
    uiSfx('shutter', 0.6); setTimeout(() => uiSfx('winch', 0.4), 60);
    const s = this.shutter;
    void tween(520, (k) => { s.style.transform = `translateY(${-Math.round(k * this.bayR.h) * S}px)`; }, ease.inOutCubic).then(() => { s.style.visibility = 'hidden'; uiSfx('clunk', 0.5); });
  }
  private closeShutter() {
    if (this.shutterDown) return; this.shutterDown = true;
    const s = this.shutter; s.style.visibility = '';
    uiSfx('shutter', 0.5);
    void tween(420, (k) => { s.style.transform = `translateY(${-Math.round((1 - k) * this.bayR.h) * S}px)`; }, ease.outBounce).then(() => { s.style.transform = ''; this.panel?.dispose(); this.panel = null; this.body.replaceChildren(); uiSfx('slam', 0.4); shake(this.bay, 2, 180); });
  }
  private paintTabs() {
    const id = this.sel; if (!id) { this.tabs.replaceChildren(); return; }
    const fns = ROOM_FNS[id];
    this.tabs.replaceChildren();
    // the room's name on its own little brass plate, then one enamel tab per function
    const nm = div('k7-t32 k7-name', this.tabs); nm.textContent = ROOM_SHORT[id]; nm.style.marginRight = 8 * S + 'px'; nm.style.color = '#ffe7a8';
    for (const f of fns) {
      const open = fnOpen(this.o.game, id, f), on = this.fn === f;
      const t = div('s7-tab' + (on ? ' on' : ''), this.tabs);
      const W = 26, H = 24, cv = artCanvas(W, H, ''); t.append(cv);
      const p = new Px(W, H);
      bevel(p, 1, 1, W - 2, H - 2, on ? P.bone : open ? P.steel : P.stone, { chamfer: 2 });
      const c = cv.getContext('2d')!; c.putImageData(p.image(), 0, 0);
      if (open) c.drawImage(iconOf(FN[f].icon, on ? 'amber' : 'steel'), 3, 2, 20, 20); else c.drawImage(padlock(), 6, 4, 14, 16);
      t.title = FN[f].name;
      t.addEventListener('pointerenter', () => uiSfx('hover', 0.4));
      t.addEventListener('click', (e) => { e.stopPropagation(); if (this.fn === f) return; uiSfx('tab', 0.6); pop(t, 0.8); this.openFn(f, false); });
    }
    pop(this.tabs, 0.5);
  }
  /** a function the player has not learned: its lock and what opens it, big */
  private lockedPanel(id: RoomId, f: FnId) {
    const W = this.bayR.w, H = this.bayR.h;
    const bg = artCanvas(W, H); this.body.append(bg);
    const p = plate(W, H, { mat: 'steel', seed: 7 + id.length, chamfer: 3, wear: 0.9, screws: true, grime: 0.8 });
    const c = bg.getContext('2d')!; c.putImageData(p.image(), 0, 0);
    c.globalAlpha = 0.35; c.drawImage(iconOf(FN[f].icon, 'dim'), W / 2 - 48, 60, 96, 96); c.globalAlpha = 1;
    const lk = padlock(3); place(lk, W / 2 - 21, 82).style.position = 'absolute'; this.body.append(lk);
    bitText(c, FN[f].name, W / 2, 176, { color: '#e8e0c8', extrude: [1, '#2a2a28'], align: 'center' });
    const row = div('s7-abs', this.body); place(row, 16, 206, W - 32);
    chipRow(row, reqChips(this.o.game, FN[f].feat), 3); row.style.justifyContent = 'center';
    pop(lk, 1);
  }
  private panelReflow() { if (this.sel && this.fn) { const f = this.fn; this.fn = null; this.openFn(f, false); } }

  // ---------------------------------------------------------------- leaving
  back() {
    if (this.closing) return;
    if (this.panel?.back?.()) return;
    if (this.sel) { uiSfx('back', 0.6); this.deselect(); return; }
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

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function line(c: CanvasRenderingContext2D, pts: [number, number][], col: string, w: number) {
  c.strokeStyle = col; c.lineWidth = w; c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5) : c.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5))); c.closePath(); c.stroke();
}
function seg(c: CanvasRenderingContext2D, a: [number, number], b: [number, number], col: string) { c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(a[0]) + 0.5, Math.round(a[1]) + 0.5); c.lineTo(Math.round(b[0]) + 0.5, Math.round(b[1]) + 0.5); c.stroke(); }
void hash; void burst;

/** the BACK key's model: a hatch lever, red enamel grip on a steel boss */
function backModel(): THREE.Group {
  const g = new THREE.Group();
  const steel = toon({ color: 0xb8bcc0, metal: 0.8 }), red = toon({ color: 0xc8382a, gloss: 0.5 }), dark = toon({ color: 0x40444a, metal: 0.6 });
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.16, 16), dark); g.add(boss);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 18), steel); ring.rotation.x = Math.PI / 2; ring.position.y = 0.09; g.add(ring);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), steel); arm.position.set(0.18, 0.36, 0); arm.rotation.z = -0.5; g.add(arm);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 10), red); grip.position.set(0.42, 0.66, 0); grip.rotation.z = -0.5 + Math.PI / 2; g.add(grip);
  return g;
}

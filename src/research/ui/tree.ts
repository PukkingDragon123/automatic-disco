// THE SKILL TREE (the RESEARCH dock slot, v7). A 2D textured screen (worn gunmetal, screws, a sunk board) whose
// centrepiece is a lattice in the spirit of Limbophobia's research lattice: steel conduits between bolted sockets, and
// in every socket a small, outlined 3D model of WHAT THE NODE UNLOCKS (the kit's ModelView: it turns, turns faster and
// tilts toward the pointer when hot, squashes when pressed). Locked nodes sit dark behind a cage; open ones pulse
// amber; owned ones are lit green. The conduits' cores carry the tree's power: dark, fed (dim amber), fed into a node
// you can unlock now (pulsing, with running beads), owned (green).
// The card on the right shows the picked node: its model large, its cost as item icons with have / need, the
// knowledge it takes, its quest's objective, the bond it needs (the person's face and pips), and the UNLOCK key.
// Unlocking: the key sinks, the cage winches up, sparks, the model spins, the socket lamp flashes green and a charge
// runs down every conduit out of it; nodes it opens flash.
// Keys: arrows move, Enter unlocks, Esc / K close.
import type { Engine } from '../../app/engine';
import { NODES, NODE, LANES, COLS, type UnlockNode, type Lane } from '../unlocks';
import type { NodeState, Req } from '../progress';
import { Px, P, INK, bevel, rivet, screw, glassWell, cellBar, at, hash, mixHex, hex } from '../../ui/kit/px';
import { plate, strip } from '../../ui/kit/mat';
import { bitText, bitMeasure, bitReady } from '../../ui/kit/bitfont';
import { uiSfx } from '../../ui/kit/sound';
import { ModelView } from '../../ui/kit/model3d';
import { burst, tween, ease } from '../../ui/kit/juice';
import { nodeModel } from './nodeModels';
import { iconCanvas } from './icons';
import { itemIcon, ITEMS } from '../../factory/items';
import { QUEST } from '../../story/questData';
import { stepIcon, DATA_ICON } from '../../story/icons';
import { portrait } from '../../social/portrait';
import { PEOPLE } from '../../social/social';
import { DATA_KINDS } from '../tech';
import { anyG } from '../util';

const S = 2; // css px per art px
const CSS = `
.rt7 { position: fixed; inset: 0; z-index: 720; overflow: hidden; background: #08090c; opacity: 0; transition: opacity .22s ease-out; user-select: none; }
.rt7.on { opacity: 1; }
.rt7 canvas { image-rendering: pixelated; display: block; }
.rt7 .rt7-bg, .rt7 .rt7-fx { position: absolute; left: 0; top: 0; pointer-events: none; }
.rt7 .rt7-fx { z-index: 3; }
.rt7 .rt7-node { position: absolute; z-index: 2; cursor: pointer; }
.rt7 .rt7-node canvas.k7-model { position: absolute; left: 0; top: 0; }
.rt7 .rt7-node.locked canvas.k7-model { filter: brightness(.42) saturate(.25); }
.rt7 .rt7-node.poor canvas.k7-model { filter: brightness(.8) saturate(.75); }
.rt7 .rt7-card { position: absolute; z-index: 4; }
.rt7 .rt7-card canvas { position: absolute; left: 0; top: 0; }
.rt7 .rt7-key { position: absolute; z-index: 5; cursor: pointer; transition: transform .07s; }
.rt7 .rt7-key.down { transform: translateY(4px); }
.rt7 .rt7-key.off { cursor: default; }
.rt7 .rt7-close { position: absolute; z-index: 5; cursor: pointer; }
.rt7 .rt7-close:hover { filter: brightness(1.25); }
.rt7 .rt7-wipe { position: absolute; inset: 0; z-index: 9; pointer-events: none; background: #08090c; }
`;
interface NodeV { n: UnlockNode; x: number; y: number; el: HTMLDivElement; view: ModelView; st: NodeState; cage: number; flash: number; pulse: number }
interface Link { from: NodeV; to: NodeV; pts: [number, number][]; len: number; charge: number }
type Lit = 0 | 1 | 2 | 3;

export class SkillTree {
  static current: SkillTree | null = null;
  private root: HTMLDivElement; private bg: HTMLCanvasElement; private fx: HTMLCanvasElement; private fxc: CanvasRenderingContext2D;
  private card: HTMLDivElement; private cardCv: HTMLCanvasElement; private cardView: ModelView | null = null; private cardFor = '';
  private key: HTMLDivElement; private keyCv: HTMLCanvasElement; private closeEl: HTMLDivElement;
  private nodes = new Map<string, NodeV>(); private links: Link[] = [];
  private AW = 0; private AH = 0; private board = { x0: 0, y0: 0, x1: 0, y1: 0, cw: 0, rh: 0, gx: 0 };
  private laneRows = new Map<Lane, number[]>();
  private sel: string | null = null; private hover: string | null = null;
  private raf = 0; private last = 0; private t = 0; private sig = ''; private sigT = 0;
  private know = { bio: 0, geo: 0, energy: 0, xeno: 0 };
  private wasPaused = false;
  readonly pendingDock: string[] = [];
  constructor(readonly g: any, readonly engine: Engine | null, readonly onClose: () => void, readonly via?: (after: () => void) => Promise<void>) {
    SkillTree.current = this; (window as unknown as { __tree?: SkillTree }).__tree = this;
    if (!document.getElementById('rt7-css')) { const s = document.createElement('style'); s.id = 'rt7-css'; s.textContent = CSS; document.head.append(s); }
    this.root = document.createElement('div'); this.root.className = 'rt7';
    this.bg = document.createElement('canvas'); this.bg.className = 'rt7-bg';
    this.fx = document.createElement('canvas'); this.fx.className = 'rt7-fx'; this.fxc = this.fx.getContext('2d')!;
    this.card = document.createElement('div'); this.card.className = 'rt7-card'; this.cardCv = document.createElement('canvas'); this.card.append(this.cardCv);
    this.key = document.createElement('div'); this.key.className = 'rt7-key'; this.keyCv = document.createElement('canvas'); this.key.append(this.keyCv);
    this.closeEl = document.createElement('div'); this.closeEl.className = 'rt7-close';
    const wipe = document.createElement('div'); wipe.className = 'rt7-wipe';
    this.root.append(this.bg, this.fx, this.card, this.key, this.closeEl, wipe);
    document.body.append(this.root);
    document.body.classList.add('menu7');
    this.wasPaused = !!this.g?.paused; if (this.g) this.g.paused = true;
    this.key.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.key.classList.add('down'); });
    this.key.addEventListener('pointerup', (e) => { e.stopPropagation(); this.key.classList.remove('down'); if (this.sel) this.unlock(this.sel); });
    this.key.addEventListener('pointerleave', () => this.key.classList.remove('down'));
    this.closeEl.addEventListener('click', () => this.close());
    this.closeEl.addEventListener('pointerenter', () => uiSfx('hover', 0.6));
    addEventListener('keydown', this.onKey, true);
    addEventListener('resize', this.onResize);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.know = { ...(this.g?.research?.data ?? this.know) };
    void bitReady().then(() => { this.layout(); this.paintBg(); this.pick(this.firstOpen()); });
    this.layout();
    requestAnimationFrame(() => { this.root.classList.add('on'); void tween(380, (k) => { wipe.style.clipPath = `inset(0 0 0 ${Math.round(k * 100)}%)`; }, ease.outCubic).then(() => wipe.remove()); });
    uiSfx('open', 0.8); uiSfx('swishIn', 0.5);
    this.g?.emit?.('screen-open', { id: 'research' });
    this.last = performance.now(); this.raf = requestAnimationFrame(this.frame);
  }
  private get U() { return this.g?.unlocks; }
  private state(id: string): NodeState { return this.U?.state(id) ?? (NODE[id]?.start ? 'owned' : 'locked'); }
  private firstOpen() { return NODES.find((n) => this.state(n.id) === 'open')?.id ?? NODES.find((n) => this.state(n.id) === 'poor')?.id ?? 'boot'; }

  // ---------------------------------------------------------------- layout
  private onResize = () => { this.layout(); this.paintBg(); this.pick(this.sel ?? this.firstOpen(), true); };
  private layout() {
    const AW = this.AW = Math.floor(innerWidth / S), AH = this.AH = Math.floor(innerHeight / S);
    const cardW = Math.min(250, Math.max(200, Math.round(AW * 0.26)));
    const b = this.board; b.x0 = 14; b.y0 = 40; b.x1 = AW - cardW - 22; b.y1 = AH - 14;
    // the lanes: one row each, two when a lane has a lower row
    let rows = 0;
    this.laneRows.clear();
    for (const L of LANES) { const r2 = NODES.some((n) => n.lane === L.id && (n.row ?? 0) === 1); this.laneRows.set(L.id, r2 ? [rows, rows + 1] : [rows]); rows += r2 ? 2 : 1; }
    b.gx = b.x0 + 40; b.cw = (b.x1 - b.gx - 6) / COLS; b.rh = (b.y1 - b.y0 - 8) / rows;
    // nodes
    for (const n of NODES) {
      const rr = this.laneRows.get(n.lane)!, row = rr[Math.min(rr.length - 1, n.row ?? 0)];
      const x = Math.round(b.gx + (n.col + 0.5) * b.cw), y = Math.round(b.y0 + 4 + (row + 0.5) * b.rh);
      let v = this.nodes.get(n.id);
      if (!v) {
        const el = document.createElement('div'); el.className = 'rt7-node';
        const view = new ModelView(() => nodeModel(n.model), { w: 40, h: 40, scale: S, spin: 0.25 + hash(n.col, n.lane.length) * 0.2, hotSpin: 2.4, zoom: 1.05, ink: 1, pitch: 0.42, yaw0: 0.5 + n.col * 0.3, frames: 32 });
        el.append(view.cv);
        el.addEventListener('pointerenter', (e) => { this.hover = n.id; view.hot(true); view.point(e.clientX, e.clientY); uiSfx('hover', 0.6); this.pick(n.id, false, true); });
        el.addEventListener('pointermove', (e) => view.point(e.clientX, e.clientY));
        el.addEventListener('pointerleave', () => { if (this.hover === n.id) this.hover = null; view.hot(false); if (this.sel) this.pick(this.sel, true); });
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); view.press(0.8); uiSfx('click', 0.8); this.pick(n.id, true); });
        el.addEventListener('dblclick', () => this.unlock(n.id));
        this.root.append(el);
        v = { n, x, y, el, view, st: this.state(n.id), cage: this.state(n.id) === 'owned' ? 0 : 1, flash: 0, pulse: 0 };
        this.nodes.set(n.id, v);
      }
      v.x = x; v.y = y;
      v.el.style.left = (x - 20) * S + 'px'; v.el.style.top = (y - 22) * S + 'px';
      v.el.style.width = 40 * S + 'px'; v.el.style.height = 40 * S + 'px';
    }
    // conduits: orthogonal runs from each prerequisite into the node
    this.links = [];
    for (const v of this.nodes.values()) for (const r of v.n.needs) {
      const f = this.nodes.get(r); if (!f) continue;
      const h = 21, pts: [number, number][] = [];
      if (Math.abs(f.y - v.y) < 2) pts.push([f.x + h, f.y], [v.x - h, v.y]);
      else if (f.n.col === v.n.col) { const dn = v.y > f.y; pts.push([f.x, f.y + (dn ? h : -h)], [v.x, v.y + (dn ? -h : h)]); }
      else {
        const right = v.x > f.x, xm = Math.round(right ? v.x - h - (b.cw - 42) / 2 : v.x + h + (b.cw - 42) / 2);
        pts.push([f.x + (right ? h : -h), f.y], [xm, f.y], [xm, v.y], [v.x + (right ? -h : h), v.y]);
      }
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      this.links.push({ from: f, to: v, pts, len, charge: 1 });
    }
    // the card, the key, the close key
    const cx = AW - cardW - 10;
    this.card.style.left = cx * S + 'px'; this.card.style.top = 40 * S + 'px';
    this.cardCv.width = cardW; this.cardCv.height = AH - 54 - 60; this.cardCv.style.width = cardW * S + 'px'; this.cardCv.style.height = (AH - 54 - 60) * S + 'px';
    this.key.style.left = (cx + 18) * S + 'px'; this.key.style.top = (AH - 66) * S + 'px';
    this.closeEl.style.left = (AW - 40) * S + 'px'; this.closeEl.style.top = 6 * S + 'px';
    this.paintClose();
    this.fx.width = AW; this.fx.height = AH; this.fx.style.width = AW * S + 'px'; this.fx.style.height = AH * S + 'px';
    this.sig = '';
  }

  // ---------------------------------------------------------------- the painted screen
  private paintBg() {
    const { AW, AH } = this, b = this.board;
    const p = plate(AW, AH, { mat: 'gun', seed: 7, screws: true, wear: 1.1, chamfer: 6, lip: 3, grime: 0.8 });
    // the header: a brass name strip, the knowledge wells
    p.blit(strip(150, 26, 'brass', 3), 14, 8);
    // the board: a sunk steel well with a fine engraved grid and the lane bands
    glassWell(p, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 0x111518, { glare: false });
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      if ((x - b.gx) % 12 === 0 || (y - b.y0) % 12 === 0) p.set(x, y, 0x1a2024);
    }
    LANES.forEach((L, i) => {
      const rr = this.laneRows.get(L.id)!, y0 = Math.round(b.y0 + 4 + rr[0] * b.rh), y1 = Math.round(b.y0 + 4 + (rr[rr.length - 1] + 1) * b.rh);
      if (i % 2 === 0) for (let y = y0; y < y1; y++) for (let x = b.x0 + 1; x < b.x1 - 1; x++) p.set(x, y, 0xffffff, 6);
      p.hl(b.x0 + 2, b.x1 - 3, y1 - 1, 0x2a3236);
      // the lane's tab: an enamel tab with the lane icon
      bevel(p, b.x0 + 4, y0 + 3, 30, y1 - y0 - 6, P.steel, { chamfer: 2 });
      p.rect(b.x0 + 6, y0 + 5, 3, y1 - y0 - 10, L.col);
    });
    // the card's backing: an enamel plate with screws
    const cx = AW - this.cardCv.width - 10;
    p.blit(plate(this.cardCv.width, AH - 54, { mat: 'enamel', seed: 4, screws: true, wear: 0.9, chamfer: 4 }), cx, 40);
    const cv = this.bg; p.canvas(cv); cv.style.width = AW * S + 'px'; cv.style.height = AH * S + 'px';
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
    // the title, stamped on the brass
    bitText(c, 'RESEARCH', 89, 12, { color: hex(P.brass[1]), outline: null, shadow: hex(P.brass[5]), align: 'center' });
    // the lane icons
    LANES.forEach((L) => { const rr = this.laneRows.get(L.id)!, y0 = Math.round(b.y0 + 4 + rr[0] * b.rh), y1 = Math.round(b.y0 + 4 + (rr[rr.length - 1] + 1) * b.rh); c.drawImage(iconCanvas(L.icon, 'phos'), b.x0 + 9, Math.round((y0 + y1) / 2 - 12), 24, 24); });
  }
  private paintClose() {
    const p = new Px(28, 26); bevel(p, 1, 1, 26, 24, P.rust, { chamfer: 2 });
    const cv = this.closeEl.querySelector('canvas') ?? document.createElement('canvas'); if (!cv.parentElement) this.closeEl.append(cv);
    p.canvas(cv as HTMLCanvasElement); (cv as HTMLCanvasElement).style.width = 28 * S + 'px'; (cv as HTMLCanvasElement).style.height = 26 * S + 'px';
    const c = (cv as HTMLCanvasElement).getContext('2d')!;
    for (let i = 0; i < 10; i++) { c.fillStyle = hex(P.bone[5]); c.fillRect(9 + i, 8 + i, 2, 2); c.fillRect(18 - i, 8 + i, 2, 2); }
  }

  // ---------------------------------------------------------------- the card
  pick(id: string, pin = false, preview = false) {
    if (!NODE[id]) return;
    if (pin) this.sel = id; else if (!preview && !this.sel) this.sel = id;
    if (!this.sel) this.sel = id;
    const show = preview ? id : this.sel;
    this.paintCard(show);
    this.paintKey(show);
  }
  private paintCard(id: string) {
    const n = NODE[id], cv = this.cardCv, W = cv.width, H = cv.height;
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, H);
    // the model, large, in a sunk window
    const p = new Px(W, 104); glassWell(p, 12, 10, W - 24, 88, 0x1a1e22); c.putImageData(p.image(), 0, 0);
    if (this.cardFor !== id) {
      this.cardFor = id;
      this.cardView?.dispose();
      this.cardView = new ModelView(() => nodeModel(n.model), { w: W - 28, h: 84, scale: S, spin: 0.5, hotSpin: 1.6, zoom: 1.1, pitch: 0.4, shadow: [3, 3, 0.4], frames: 64 });
      this.cardView.cv.style.position = 'absolute'; this.cardView.cv.style.left = 14 * S + 'px'; this.cardView.cv.style.top = 12 * S + 'px';
      this.card.append(this.cardView.cv);
      this.cardView.cv.style.pointerEvents = 'auto';
      this.cardView.cv.onpointermove = (e) => { this.cardView?.hot(true); this.cardView?.point(e.clientX, e.clientY); };
      this.cardView.cv.onpointerleave = () => this.cardView?.hot(false);
      this.cardView.cv.onpointerdown = () => { this.cardView?.poke(8); uiSfx('pluck', 0.5); };
      if (this.state(id) === 'locked') this.cardView.cv.style.filter = 'brightness(.5) saturate(.3)'; else this.cardView.cv.style.filter = '';
    }
    const st = this.state(id);
    // the name and the lane
    const lane = LANES.find((l) => l.id === n.lane)!;
    c.drawImage(iconCanvas(lane.icon, 'phos'), 12, 104, 20, 20);
    bitText(c, n.name.toUpperCase(), 36, 106, { color: hex(P.ink[1]), outline: null, shadow: hex(P.bone[5]) });
    // the state lamp
    const lamp = st === 'owned' ? 0x50d860 : st === 'open' ? 0xffb030 : st === 'poor' ? 0x9a6a2a : 0x6a2a20;
    c.fillStyle = '#08090c'; c.fillRect(W - 24, 106, 12, 12); c.fillStyle = hex(lamp); c.fillRect(W - 22, 108, 8, 8); c.fillStyle = hex(mixHex(lamp, 0xffffff, 0.6)); c.fillRect(W - 21, 109, 3, 2);
    // the requirements, one row each
    const reqs: Req[] = this.U?.reqs(id) ?? [];
    let y = 130;
    const row = (icon: HTMLCanvasElement | HTMLImageElement | null, ok: boolean, draw: (x: number, y: number) => void) => {
      if (y > H - 26) return;
      const rp = new Px(W - 20, 24); bevel(rp, 1, 1, W - 22, 22, ok ? P.bone : P.paper, { chamfer: 2, sunk: true }); c.putImageData(rp.image(), 10, y);
      if (icon) c.drawImage(icon, 14, y + 2, 20, 20);
      draw(38, y + 4);
      // tick or a cross at the end
      c.fillStyle = '#08090c'; c.fillRect(W - 28, y + 6, 12, 12);
      c.fillStyle = ok ? '#5ad860' : '#c84a3a';
      if (ok) { c.fillRect(W - 26, y + 12, 2, 2); c.fillRect(W - 24, y + 14, 2, 2); c.fillRect(W - 22, y + 12, 2, 2); c.fillRect(W - 20, y + 10, 2, 2); }
      else for (let i = 0; i < 6; i++) { c.fillRect(W - 26 + i, y + 8 + i, 2, 2); c.fillRect(W - 21 - i, y + 8 + i, 2, 2); }
      y += 26;
    };
    const ink = hex(P.ink[1]), red = hex(P.ruby[2]), grn = hex(P.moss[1]);
    for (const r of reqs) {
      if (r.k === 'need') row(iconCanvas(NODE[r.id]?.icon ?? 'gear', r.ok ? 'phos' : 'dim'), r.ok, (x, yy) => bitText(c, NODE[r.id]?.name.toUpperCase() ?? r.id, x, yy, { color: ink, outline: null }));
      else if (r.k === 'quest') {
        const q = QUEST[r.id];
        row(stepIcon(q?.icon ?? 'lens', q?.giver), r.ok, (x, yy) => {
          bitText(c, q?.title ?? r.id, x, yy, { color: ink, outline: null });
          if (!r.ok) { const cp = new Px(40, 7); cellBar(cp, 0, 0, 40, 7, r.n / Math.max(1, r.of), P.glowAmber, this.t); c.putImageData(cp.image(), W - 74, yy + 4); }
        });
      } else if (r.k === 'close') {
        row(portrait(r.npc), r.ok, (x, yy) => {
          const per = PEOPLE[r.npc];
          bitText(c, per?.short ?? r.npc, x, yy, { color: per?.col ?? ink, outline: hex(INK) });
          for (let i = 0; i < 5; i++) { const px = x + 52 + i * 11, on = i < r.have, need = i < r.need; c.fillStyle = '#08090c'; c.fillRect(px - 1, yy + 2, 9, 9); c.fillStyle = on ? '#ffc040' : need ? '#6a3a1a' : '#3a3a36'; c.fillRect(px, yy + 3, 7, 7); if (need && !on) { c.fillStyle = '#c84a3a'; c.fillRect(px + 2, yy + 5, 3, 3); } }
        });
      } else if (r.k === 'know') {
        row(stepIcon(DATA_ICON[r.kind]), r.ok, (x, yy) => { bitText(c, String(r.have), x, yy, { color: r.ok ? grn : red, outline: null }); bitText(c, '/ ' + r.need, x + bitMeasure(String(r.have)) + 4, yy, { color: ink, outline: null }); });
      } else if (r.k === 'item') {
        const im = itemImg(r.id); if (!im.complete) im.onload = () => this.paintCard(id);
        row(im.complete ? im : null, r.ok, (x, yy) => { bitText(c, String(r.have), x, yy, { color: r.ok ? grn : red, outline: null }); bitText(c, '/ ' + r.need, x + bitMeasure(String(r.have)) + 4, yy, { color: ink, outline: null }); });
      }
    }
    if (!reqs.length || st === 'owned') { if (st === 'owned') bitText(c, '', 14, y, {}); }
  }
  private paintKey(id: string) {
    const st = this.state(id), W = 200, H = 46;
    const p = new Px(W, H);
    // the key's well, then the cap (raised orange when open, flat grey when not, green when owned)
    p.rect(0, 4, W, H - 4, INK);
    bevel(p, 2, 6, W - 4, H - 10, P.steel, { chamfer: 3, sunk: true });
    const ramp = st === 'open' ? P.rust : st === 'owned' ? P.moss : P.stone;
    bevel(p, 6, 2, W - 12, H - 12, ramp, { chamfer: 3 });
    if (st === 'open') for (let x = 10; x < W - 10; x += 2) p.set(x, 4, mixHex(ramp[5] ?? ramp[ramp.length - 1], 0xffffff, 0.4));
    rivet(p, 12, H / 2 - 5, 1, P.steel); rivet(p, W - 13, H / 2 - 5, 1, P.steel);
    const cv = this.keyCv; p.canvas(cv); cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
    const c = cv.getContext('2d')!;
    const word = st === 'owned' ? 'LEARNED' : st === 'open' ? 'UNLOCK' : st === 'poor' ? 'NEED MORE' : 'LOCKED';
    bitText(c, word, W / 2, 11, { color: st === 'open' ? '#fff0d0' : st === 'owned' ? '#e8ffe0' : '#c8c4b8', extrude: [1, st === 'open' ? '#6a2a10' : '#2a2a28'], align: 'center' });
    this.key.classList.toggle('off', st !== 'open');
  }

  // ---------------------------------------------------------------- unlocking
  unlock(id: string) {
    const v = this.nodes.get(id); if (!v) return;
    const st = this.state(id);
    if (st !== 'open') { uiSfx('error', 0.7); v.view.poke(-4); this.shake(v.el); return; }
    const why = this.U?.unlock(id);
    if (why) { uiSfx('error', 0.7); return; }
    // the show
    uiSfx('clunk', 0.9); uiSfx('winch', 0.7, 1.2);
    v.flash = 1; v.view.press(1.6); v.view.poke(16);
    setTimeout(() => { uiSfx('swishIn', 0.7); uiSfx('confirm', 0.9); burst((v.x) * S, (v.y) * S, { n: 46, ramp: P.glowAmber, speed: 320, life: 0.8, gravity: 300 }); burst(v.x * S, v.y * S, { n: 20, ramp: P.glowTeal, speed: 180, life: 0.6 }); }, 220);
    setTimeout(() => uiSfx('bong', 0.6), 520);
    for (const L of this.links) if (L.from === v) L.charge = -0.15 - Math.random() * 0.1;
    for (const f of NODE[id].grants) if (f.startsWith('dock:')) this.pendingDock.push(f.slice(5));
    this.pick(id, true);
    this.sig = '';
  }
  private shake(el: HTMLElement) { el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 260 }); }
  private onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === 'Escape' || k === 'k' || k === 'K') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); if (this.sel) { this.key.classList.add('down'); setTimeout(() => this.key.classList.remove('down'), 120); this.unlock(this.sel); } return; }
    if (k.startsWith('Arrow')) {
      e.preventDefault(); e.stopPropagation();
      const cur = this.nodes.get(this.sel ?? '') ?? [...this.nodes.values()][0];
      const dx = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0, dy = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0;
      let best: NodeV | null = null, bs = 1e9;
      for (const v of this.nodes.values()) { if (v === cur) continue; const ox = v.x - cur.x, oy = v.y - cur.y; if ((dx && Math.sign(ox) !== dx) || (dy && Math.sign(oy) !== dy)) continue; const s = dx ? Math.abs(ox) + Math.abs(oy) * 2.5 : Math.abs(oy) + Math.abs(ox) * 2.5; if (s < bs) { bs = s; best = v; } }
      if (best) { uiSfx('tick', 0.7); this.pick(best.n.id, true); best.view.poke(5); }
    }
  };

  // ---------------------------------------------------------------- the frame: socket lamps, conduit cores, beads, cages
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    // states change as data arrives and quests finish (twice a second)
    this.sigT -= dt;
    if (this.sigT <= 0) {
      this.sigT = 0.5;
      const s = NODES.map((n) => this.state(n.id)[0]).join('') + JSON.stringify(this.g?.research?.data ?? {});
      if (s !== this.sig) { this.sig = s; for (const v of this.nodes.values()) { const ns = this.state(v.n.id); if (ns !== v.st && ns === 'open' && v.st !== 'owned') v.pulse = 1; v.st = ns; v.el.className = 'rt7-node ' + ns; } const show = this.hover ?? this.sel; if (show) { this.paintCard(show); this.paintKey(show); } }
    }
    const c = this.fxc, { AW, AH } = this; c.clearRect(0, 0, AW, AH);
    // the conduits
    for (const L of this.links) {
      const lit: Lit = L.from.st === 'owned' && L.to.st === 'owned' ? 3 : L.from.st === 'owned' && L.to.st === 'open' ? 2 : L.from.st === 'owned' ? 1 : 0;
      this.pipe(c, L, lit);
      if (L.charge < 1) { L.charge += dt * 1.4; if (L.charge >= 1 && L.to.st !== 'owned') L.to.flash = Math.max(L.to.flash, 0.7); }
    }
    // the sockets
    for (const v of this.nodes.values()) {
      v.flash = Math.max(0, v.flash - dt * 1.2); v.pulse = Math.max(0, v.pulse - dt * 0.8);
      const owned = v.st === 'owned';
      v.cage += ((owned ? 0 : 1) - v.cage) * Math.min(1, dt * (owned ? 3.2 : 10));
      this.socket(c, v);
    }
    // the knowledge in the header, rolling toward the real values
    const K = this.g?.research?.data ?? this.know;
    let x = 176;
    for (const k of DATA_KINDS) {
      this.know[k] += (K[k] - this.know[k]) * Math.min(1, dt * 6);
      const ic = stepIcon(DATA_ICON[k]); c.drawImage(ic, x, 8, 24, 24);
      const tx = String(Math.floor(this.know[k] + 0.001));
      bitText(c, tx, x + 27, 12, { color: '#f4ecd6' });
      x += 34 + Math.max(24, bitMeasure(tx)) + 10;
    }
  };
  private pipe(c: CanvasRenderingContext2D, L: Link, lit: Lit) {
    const core = lit === 3 ? '#48dc70' : lit === 2 ? (Math.sin(this.t * 5) > 0 ? '#ffc048' : '#d88a28') : lit === 1 ? '#6a4a1c' : '#241c12';
    const pts = L.pts;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], hz = y0 === y1;
      const ax = Math.min(x0, x1), ay = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
      if (hz) { c.fillStyle = '#08090c'; c.fillRect(ax - 3, ay - 4, w + 7, 8); c.fillStyle = '#6e7373'; c.fillRect(ax - 2, ay - 3, w + 5, 1); c.fillStyle = '#3d4346'; c.fillRect(ax - 2, ay - 2, w + 5, 4); c.fillStyle = '#2a2f32'; c.fillRect(ax - 2, ay + 2, w + 5, 1); c.fillStyle = core; c.fillRect(ax - 2, ay - 1, w + 5, 2); }
      else { c.fillStyle = '#08090c'; c.fillRect(ax - 4, ay - 3, 8, h + 7); c.fillStyle = '#6e7373'; c.fillRect(ax - 3, ay - 2, 1, h + 5); c.fillStyle = '#3d4346'; c.fillRect(ax - 2, ay - 2, 4, h + 5); c.fillStyle = '#2a2f32'; c.fillRect(ax + 2, ay - 2, 1, h + 5); c.fillStyle = core; c.fillRect(ax - 1, ay - 2, 2, h + 5); }
    }
    // clamps at the corners
    for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i]; c.fillStyle = '#08090c'; c.fillRect(x - 5, y - 5, 10, 10); c.fillStyle = '#54595c'; c.fillRect(x - 4, y - 4, 8, 8); c.fillStyle = '#8e9190'; c.fillRect(x - 4, y - 4, 8, 1); c.fillRect(x - 4, y - 4, 1, 8); c.fillStyle = '#b1b2aa'; c.fillRect(x - 1, y - 1, 2, 2); }
    // beads running toward the node it feeds, and the charge after an unlock
    const along = (d: number): [number, number] => { let left = d; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], s = Math.abs(x1 - x0) + Math.abs(y1 - y0); if (left <= s) { const k = s ? left / s : 0; return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]; } left -= s; } return pts[pts.length - 1]; };
    if (lit === 2) for (let k = 0; k < Math.max(1, Math.floor(L.len / 26)); k++) { const d = ((this.t * 40 + k * 26) % L.len); const [x, y] = along(d); c.fillStyle = '#fff0c0'; c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); }
    if (L.charge > -0.01 && L.charge < 1) { for (let k = 0; k < 6; k++) { const [x, y] = along(Math.max(0, L.charge * L.len - k * 3)); c.fillStyle = k ? '#ffe090' : '#ffffff'; c.fillRect(Math.round(x) - 2 + (k ? 1 : 0), Math.round(y) - 2 + (k ? 1 : 0), k ? 2 : 4, k ? 2 : 4); } }
  }
  private socket(c: CanvasRenderingContext2D, v: NodeV) {
    const x = v.x - 22, y = v.y - 24, st = v.st, sel = this.sel === v.n.id, hot = this.hover === v.n.id;
    // the frame round the model: a bolted steel ring with a state lamp strip at its foot
    const lamp = st === 'owned' ? '#50d860' : st === 'open' ? (Math.sin(this.t * 4 + v.x) > -0.2 ? '#ffb030' : '#c87a20') : st === 'poor' ? '#8a5a1c' : '#3a1610';
    c.fillStyle = '#08090c'; c.fillRect(x - 1, y - 1, 46, 48);
    c.fillStyle = sel ? '#b1b2aa' : hot ? '#8e9190' : '#54595c'; c.fillRect(x, y, 44, 2); c.fillRect(x, y, 2, 46);
    c.fillStyle = '#2a2f32'; c.fillRect(x, y + 44, 44, 2); c.fillRect(x + 42, y, 2, 46);
    c.fillStyle = '#3d4346'; c.fillRect(x + 2, y + 2, 40, 1); c.fillRect(x + 2, y + 42, 40, 1);
    for (const [sx, sy] of [[x + 3, y + 3], [x + 39, y + 3], [x + 3, y + 40], [x + 39, y + 40]]) { c.fillStyle = '#8e9190'; c.fillRect(sx, sy, 2, 2); c.fillStyle = '#1c1e20'; c.fillRect(sx + 1, sy + 1, 1, 1); }
    c.fillStyle = lamp; c.fillRect(x + 12, y + 43, 20, 2);
    if (st === 'open' || v.flash > 0 || v.pulse > 0) { c.globalAlpha = Math.min(1, 0.25 + v.flash + v.pulse * 0.6 + (st === 'open' ? Math.max(0, Math.sin(this.t * 4 + v.x)) * 0.25 : 0)); c.strokeStyle = v.flash > 0.3 ? '#ffffff' : lamp; c.lineWidth = 1; c.strokeRect(x - 2.5, y - 2.5, 49, 51); c.globalAlpha = 1; }
    // the cage: steel bars and a bottom rail, winched up when the node is learned
    if (v.cage > 0.02) {
      const lift = Math.round((1 - v.cage) * 40);
      c.save(); c.beginPath(); c.rect(x + 2, y + 2, 40, 41); c.clip();
      for (let i = 0; i < 6; i++) { const bx = x + 5 + i * 7; c.fillStyle = '#08090c'; c.fillRect(bx - 1, y + 2 - lift, 4, 41); c.fillStyle = '#8e9190'; c.fillRect(bx, y + 2 - lift, 1, 41); c.fillStyle = '#54595c'; c.fillRect(bx + 1, y + 2 - lift, 1, 41); }
      c.fillStyle = '#08090c'; c.fillRect(x + 2, y + 36 - lift, 40, 6); c.fillStyle = '#6e7373'; c.fillRect(x + 2, y + 37 - lift, 40, 1); c.fillStyle = '#3d4346'; c.fillRect(x + 2, y + 38 - lift, 40, 3);
      if (st === 'locked') { // the padlock
        const lx = x + 17, ly = y + 30 - lift; c.fillStyle = '#08090c'; c.fillRect(lx - 1, ly - 7, 12, 16); c.fillStyle = '#b38737'; c.fillRect(lx, ly, 10, 8); c.fillStyle = '#cea457'; c.fillRect(lx, ly, 10, 1); c.fillStyle = '#8e9190'; c.fillRect(lx + 1, ly - 6, 2, 6); c.fillRect(lx + 7, ly - 6, 2, 6); c.fillRect(lx + 1, ly - 6, 8, 2); c.fillStyle = '#08090c'; c.fillRect(lx + 4, ly + 3, 2, 3);
      }
      c.restore();
    }
    // small tags: a quest mark, a bond mark (what still blocks it)
    if (st === 'locked' || st === 'poor') {
      const rs = this.U?.reqs(v.n.id) ?? [];
      let tx = x + 2;
      for (const r of rs) {
        if (r.ok) continue;
        if (r.k === 'quest') { const ic = stepIcon(QUEST[r.id]?.icon ?? 'lens', QUEST[r.id]?.giver); c.drawImage(ic, tx, y - 9, 14, 14); tx += 15; }
        if (r.k === 'close') { const f = portrait(r.npc); if (f) c.drawImage(f, tx, y - 9, 14, 14); tx += 15; }
      }
    }
    void at; void screw; void ITEMS;
  }
  close() {
    if (SkillTree.current !== this) return;
    SkillTree.current = null;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey, true); removeEventListener('resize', this.onResize);
    uiSfx('close', 0.7); uiSfx('swishOut', 0.5);
    const docks = this.pendingDock.splice(0);
    const gone = () => {
      document.body.classList.remove('menu7');
      if (this.g) this.g.paused = this.wasPaused;
      for (const v of this.nodes.values()) v.view.dispose(); this.cardView?.dispose(); this.root.remove();
      this.onClose();
      if (docks.length) setTimeout(() => this.g?.emit?.('dock-reveal', { slots: docks }), this.via ? 500 : 300);
    };
    // through the dock slot's own transition when it opened us, else a quick fade
    if (this.via) void this.via(gone);
    else { this.root.classList.remove('on'); setTimeout(gone, 260); }
  }
}
const imgs = new Map<string, HTMLImageElement>();
function itemImg(id: string) { let im = imgs.get(id); if (!im) { im = new Image(); im.src = itemIcon(id, 32); imgs.set(id, im); } return im; }

/** open the tree over the game (idempotent) */
export function openTree(g: any, engine: Engine | null, via?: (after: () => void) => Promise<void>): SkillTree {
  return SkillTree.current ?? new SkillTree(g, engine, () => { /* closed */ }, via);
}

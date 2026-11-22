// BLUEPRINT BUILD MODE (V7: "build mode will go top down, show like blueprint, drag in city-like buildings"). Entered
// from the dock's BUILD icon (or B, or a hotbar slot) with a transition: the camera swoops up to a top-down view while
// the world prints itself as a blueprint from the centre out (bpworld.ts), the drafting sheet's border, north arrow,
// scale bar and title block are drawn round it, and the tray of buildings slides up (tray.ts). Leaving reverses it.
//   In hand (dragged from the tray or clicked): the holographic ghost snaps to the grid, R or the wheel turns it, it
//   reads green or red; corner brackets, dimension lines in metres and a facing chevron are drawn round its footprint,
//   and its bill floats over it as item icons with have / need.
//   Placed buildings: click one to select it (a halo, and floating MOVE / ROTATE / INFO / PAUSE / DISMANTLE icons over
//   it); drag it (or MOVE) to pick it up and set it down elsewhere; ROTATE turns it a quarter in place.
//   Every placement DROPS IN: it falls the last metres stretched, lands with a squash-and-stretch bounce and a dust puff
//   scaled by its weight, with a recorded thud; then construction starts (src/logistics/sites.ts, unchanged).
import * as THREE from 'three';
import type { Factory, FBuilding } from '../../factory/factory';
import type { Build } from '../../factory/build';
import { FDEFS, DIRS, footW, footD, isBelt, type FKind } from '../../factory/defs';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import type { Site } from '../../logistics/sites';
import { catOf, workOf } from '../../logistics/catalog';
import { BlueprintWorld, MK } from './bpworld';
import { BuildTray } from './tray';
import { floatBtn, bpIcon, type FloatBtn } from './bpicons';
import { ease, clamp01, squash, placeDust, play } from './juice';
import { bitText, bitMeasure } from '../kit/bitfont';
import { installKitStyle } from '../kit/style';
import { RAMPS as P } from '../../art/palette';
import './bp.css';

const TOP = 1.5; // the top-down pitch (rad)
const IN_T = 1.15, OUT_T = 0.75;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const BLUE = P.sapphire.map(hex), WHITE = hex(P.quartz[5]), OKL = '#c7e6ce', BADL = '#da876a', AMB = '#eecc8e', INKC = '#08090c';
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

type Target = FBuilding | Site;
const isSite = (t: Target): t is Site => (t as Site).need !== undefined && (t as Site).stage !== undefined;
interface Drop { t: number; w: number; site?: Site; b?: FBuilding; y0: number; sx: number; sy: number; fw: number; fd: number; dusted: boolean; x: number; z: number }

/** how heavy a building is (0.25 a fence post .. 3 a smelter): its volume and its bill */
export function weightOf(kind: FKind): number {
  const d = FDEFS[kind]; if (!d) return 1;
  const bill = Object.values(d.cost).reduce((s: number, v) => s + (v ?? 0), 0);
  return Math.max(0.25, Math.min(3, (d.w * d.d * Math.max(0.5, d.h)) / 9 + bill / 45));
}

export class BuildMode {
  readonly world: BlueprintWorld;
  readonly tray: BuildTray;
  phase: 'off' | 'in' | 'on' | 'out' = 'off';
  private t = 0;
  private camK = 0;
  private saved: { yaw: number; dist: number } | null = null;
  private ov: HTMLCanvasElement; private og: CanvasRenderingContext2D;
  private cost: HTMLDivElement; private costKey = '';
  private acts: HTMLDivElement; private actsFor: Target | null = null; private actBtns: FloatBtn[] = [];
  private drops: Drop[] = [];
  private imgs = new Map<string, HTMLImageElement>();
  private compass: HTMLCanvasElement;
  /** the building picked up and being carried (MOVE) */
  get selected(): Target | null { return this.b.selected; }

  constructor(readonly f: Factory, readonly b: Build) {
    this.world = new BlueprintWorld(f);
    this.tray = new BuildTray(f, {
      take: (k) => { this.b.choose(k); },
      dragStart: (k) => { this.b.take(k); },
      dragMove: (x, y, over) => { if (over) this.b.hideGhost(); else this.b.hoverAt(x, y, true); },
      dragEnd: (x, y, over) => { if (!over) { this.b.hoverAt(x, y, true); this.b.dropHere(); } this.b.drop(); },
      leave: () => this.b.close(),
      bill: (k) => this.bill(k),
    });
    this.ov = document.createElement('canvas'); this.ov.className = 'bp-ov';
    document.body.appendChild(this.ov);
    this.og = this.ov.getContext('2d')!;
    this.cost = document.createElement('div'); this.cost.className = 'bp-cost'; document.body.appendChild(this.cost);
    this.acts = document.createElement('div'); this.acts.className = 'bp-acts'; document.body.appendChild(this.acts);
    this.acts.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.compass = paintCompass();
    installKitStyle();
    this.hookDock();
  }
  /** the HUD's main dock (UI CORE): its BUILD slot opens and closes this mode, latched while it is open */
  private dock: { register(id: string, open: (ctx: { x: number; y: number }) => unknown): void; setOn?(id: string, on: boolean): void } | null = null;
  private dockT = 0;
  private hookDock() {
    const find = () => (this.f.g as unknown as { dock?: BuildMode['dock'] }).dock ?? (window as unknown as { __dock?: BuildMode['dock'] }).__dock ?? null;
    const d = find();
    if (!d) { if (this.dockT++ < 120) setTimeout(() => this.hookDock(), 1000); return; }
    this.dock = d;
    // the dock's own cover is skipped ('none'): this mode has its swoop and its blueprint wipe
    (d.register as (id: string, open: (ctx: { x: number; y: number }) => unknown, o?: { transition?: string }) => void)('build', (ctx) => {
      if (ctx && typeof ctx.x === 'number') this.dockAt = [ctx.x, ctx.y];
      this.b.toggle();
      // the dock latches the slot after open(): keep it in step with the mode
      setTimeout(() => this.dock?.setOn?.('build', this.on), 0);
    }, { transition: 'none' });
  }
  private dockAt: [number, number] | null = null;
  dispose() { this.world.dispose(); this.tray.dispose(); this.ov.remove(); this.cost.remove(); this.acts.remove(); this.restoreCam(); }
  get on() { return this.phase === 'in' || this.phase === 'on'; }
  /** the screen elements build mode owns (hidden with the game when it is suspended) */
  get els(): HTMLElement[] { return [this.ov, this.cost, this.acts, this.tray.root]; }

  // ------------------------------------------------------------------ in and out
  enter() {
    if (this.on) return;
    const cam = this.f.g.cam;
    if (!this.saved) this.saved = { yaw: cam.yawGoal, dist: cam.distGoal };
    // the swoop: pitch eases to straight down, the view squares up to the grid, it pulls back a little
    const base = Object.getPrototypeOf(cam).pitch as (d?: number) => number;
    (cam as unknown as { pitch: (d?: number) => number }).pitch = (d = cam.dist) => { const p = base.call(cam, d); return p + (TOP - p) * this.camK; };
    const q = Math.PI / 2;
    cam.yawGoal = Math.round(cam.yaw / q) * q;
    cam.distGoal = Math.max(24, Math.min(52, cam.distGoal * 1.15));
    this.phase = 'in'; this.t = 0;
    this.world.mix = 1; this.world.wipe = 0; this.world.wipeAt = this.wipeOrigin();
    document.body.classList.add('bp-on'); document.body.classList.remove('bp-off');
    this.dock?.setOn?.('build', true);
    this.fitTray();
    play('swoosh', 0.9, 0.5); play('paper', 1, 0.45);
  }
  exit() {
    if (!this.on) return;
    this.phase = 'out'; this.t = 0;
    this.tray.close();
    this.selectionActs(null);
    this.cost.classList.remove('on');
    this.world.wipeAt = this.wipeOrigin();
    document.body.classList.remove('bp-on'); document.body.classList.add('bp-off');
    this.dock?.setOn?.('build', false);
    play('swooshOut', 1, 0.5);
  }
  /** the wipe starts at the dock's BUILD icon when there is one, else at the centre */
  private wipeOrigin(): [number, number] {
    if (this.dockAt) { const a = this.dockAt; this.dockAt = null; return a; }
    const d = document.querySelector('[data-dock="build"], .dock [data-k="build"]') as HTMLElement | null;
    if (d) { const r = d.getBoundingClientRect(); if (r.width) return [r.left + r.width / 2, r.top + r.height / 2]; }
    return [innerWidth / 2, innerHeight * 0.55];
  }
  /** the tray sits above the dock when there is one */
  private fitTray() { /* the dock tucks away under the tray while the blueprint is out (bp.css) */ }
  private restoreCam() {
    const cam = this.f.g.cam as unknown as { pitch?: unknown; yawGoal: number; distGoal: number };
    if (Object.prototype.hasOwnProperty.call(cam, 'pitch')) delete cam.pitch;
    if (this.saved) { cam.yawGoal = this.saved.yaw; cam.distGoal = this.saved.dist; this.saved = null; }
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    this.t += dt;
    // QA: window.__bpHold = seconds freezes the transition at that moment (screenshots of the swoop mid-way)
    const hold = (window as unknown as { __bpHold?: number }).__bpHold;
    if (typeof hold === 'number' && (this.phase === 'in' || this.phase === 'out')) this.t = hold;
    const W = this.world;
    if (this.phase === 'in') {
      const k = clamp01(this.t / IN_T);
      this.camK = ease.inOut3(clamp01(this.t / 0.9));
      W.wipe = ease.out3(clamp01((this.t - 0.12) / 0.8));
      W.tray = ease.out3(clamp01((this.t - 0.4) / 0.5));
      if (this.t > 0.38 && !this.tray.isOpen) { this.tray.open(this.b.kind ? catOf(this.b.kind) : undefined); play('open', 1, 0.4); }
      if (k >= 1) { this.phase = 'on'; W.wipe = 1; }
    } else if (this.phase === 'out') {
      const k = clamp01(this.t / OUT_T);
      this.camK = 1 - ease.inOut3(clamp01(this.t / 0.7));
      W.wipe = 1 - ease.in3(clamp01(this.t / 0.6));
      W.tray = 1 - k;
      if (k >= 1) { this.phase = 'off'; W.mix = 0; W.wipe = 0; this.camK = 0; this.restoreCam(); document.body.classList.remove('bp-off'); }
    }
    // the hand, the cursor, and the marks for the selection and a building being carried
    W.hand = this.on && this.b.kind ? this.b.kind : null;
    const gp = this.b.ground; if (gp) W.cursor = [gp.x, gp.z];
    W.marks.clear();
    const mv = this.b.moving;
    if (mv?.b) { const lp = (mv.b as unknown as { __lp?: THREE.Object3D }).__lp; if (lp) W.marks.set(lp, MK.moving); }
    if (mv?.s) W.marks.set(mv.s.mesh, MK.moving);
    const sel = this.b.selected;
    if (sel && !mv) { const o = isSite(sel) ? sel.mesh : (sel as unknown as { __lp?: THREE.Object3D }).__lp; if (o) W.marks.set(o, MK.sel); }
    // the factory draws its hovered building singly: in build mode that slot carries the selection (or the carried
    // original); render.sel stays free (the stores open a container's window when it changes)
    const one = mv?.b ?? (sel && !isSite(sel) ? sel as FBuilding : null);
    W.hoverAs = mv?.b ? MK.moving : one ? MK.sel : MK.hover;
    if (this.on && one) this.f.render.hover = one;
    W.update(dt);
    this.tray.update(dt);
    this.updateDrops(dt);
    if (this.phase === 'off') { if (this.ov.width) this.clearOv(); return; }
    this.draw();
    this.renderCost();
    this.placeActs();
  }

  // ------------------------------------------------------------------ the bill
  bill(kind: FKind): [ItemId, number, number][] {
    const f = this.f, d = FDEFS[kind]; if (!d) return [];
    const c = f.sites ? f.sites.costOf(d) : d.cost;
    return Object.entries(c).map(([id, n]) => [id, f.sites ? f.sites.avail(id) : f.count(id), n ?? 0] as [ItemId, number, number]);
  }
  /** the chips over the ghost: icon, have / need; and the reason when it does not fit */
  private renderCost() {
    const b = this.b, el = this.cost;
    const gh = b.ghosts[0];
    const show = this.on && !!b.kind && !!gh && b.ghosts.length > 0 && !b.moving && this.f.g.input.overCanvas;
    el.classList.toggle('on', show);
    el.classList.toggle('bad', !!b.why);
    if (!show) { this.costKey = ''; return; }
    const n = Math.max(1, b.ghosts.filter((g) => g.ok).length);
    const rows = this.bill(b.kind!);
    const key = `${b.kind}|${b.why}|${n}|${rows.map((r) => r[1]).join(',')}`;
    if (key !== this.costKey) {
      this.costKey = key;
      const d = FDEFS[b.kind!];
      el.innerHTML = `<div class="bp-chips">${rows.map(([id, have, need]) => `<span class="bp-chip ${have < need * n ? 'lack' : ''}" title="${esc(ITEMS[id]?.name ?? id)}"><img src="${itemIcon(id, 32)}" alt=""><b>${Math.min(999, Math.floor(have))}</b><i>/${need * n}</i></span>`).join('')}`
        + `<span class="bp-chip t"><img src="${bpIcon('clock')}" alt=""><b>${Math.round(workOf(d))}</b><i>s</i></span>`
        + (d.power > 0 ? `<span class="bp-chip t"><img src="${bpIcon('bolt')}" alt=""><b>${d.power}</b></span>` : '')
        + `</div>` + (b.why ? `<div class="bp-why"><img src="${bpIcon('cancel')}" alt="">${esc(b.why)}</div>` : '');
    }
    // over the ghost's highest point
    const def = FDEFS[gh.kind], w = footW(def, gh.r), dd = footD(def, gh.r), y = this.f.levelFor(gh.cx, gh.cz, w, dd);
    const [sx, sy] = this.f.g.screenOf(gh.cx + w / 2, y + def.h + 0.4, gh.cz);
    const r = el.getBoundingClientRect();
    el.style.left = Math.round(Math.max(8, Math.min(innerWidth - r.width - 8, sx - r.width / 2)) / 2) * 2 + 'px';
    el.style.top = Math.round(Math.max(8, sy - r.height - 18) / 2) * 2 + 'px';
  }

  // ------------------------------------------------------------------ the selection's action icons
  private selectionActs(t: Target | null) {
    if (t === this.actsFor) return;
    this.actsFor = t;
    this.acts.innerHTML = ''; this.actBtns = [];
    this.acts.classList.toggle('on', !!t);
    if (!t) return;
    const b = this.b, site = isSite(t);
    const add = (icon: Parameters<typeof floatBtn>[0], fn: () => void, sound?: string) => { const e = floatBtn(icon, '', fn, { size: 48, sound }); e.style.setProperty('--i', String(this.actBtns.length)); this.acts.appendChild(e); this.actBtns.push(e); return e; };
    add('move', () => b.pickUp(t), 'lift');
    add('rotate', () => b.turnSelected(), 'turn');
    if (!site) {
      add('info', () => b.onInspect?.(t as FBuilding), 'paper');
      const fb = t as FBuilding;
      if (fb.def.power > 0 || fb.def.station || fb.def.extract) add(fb.on ? 'pause' : 'play', () => { fb.on = !fb.on; this.actsFor = null; this.selectionActs(t); }, 'turn');
    }
    add(site ? 'cancel' : 'dismantle', () => b.dismantle(t), 'clink');
    play('pick', 1.1, 0.35);
  }
  private placeActs() {
    const t = this.on && !this.b.moving && !this.b.kind ? this.b.selected : null;
    if (t && (isSite(t) ? !this.f.sites?.list.includes(t) : (t as FBuilding).dead)) { this.b.selected = null; this.selectionActs(null); return; }
    this.selectionActs(t);
    if (!t) return;
    const h = isSite(t) ? t.def.h : (t as FBuilding).def.h;
    const [sx, sy, ok] = this.f.g.screenOf(t.cx + t.fw / 2, t.y + h + 0.6, t.cz);
    if (!ok) return;
    const w = this.actBtns.length * 58;
    this.acts.style.left = Math.round((sx - w / 2) / 2) * 2 + 'px';
    this.acts.style.top = Math.round((sy - 86) / 2) * 2 + 'px';
  }

  // ------------------------------------------------------------------ drops: squash, stretch, dust
  /** a building or a site was set down: it drops in */
  drop(o: { site?: Site; b?: FBuilding; moved?: boolean }) {
    const t = o.site ?? o.b; if (!t) return;
    const kind = o.site ? o.site.kind : o.b!.kind;
    const w = weightOf(kind);
    this.drops.push({ t: o.moved ? -0.16 : -0.3, w, site: o.site, b: o.b, y0: t.y, sx: 1, sy: 1, fw: t.fw, fd: t.fd, dusted: false, x: t.cx + t.fw / 2, z: t.cz + t.fd / 2 });
  }
  private updateDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      const fall = d.t < 0 ? (d.t / -0.3) ** 2 * (2.4 + d.w * 0.8) : 0;
      const [sx, sy] = squash(d.t, d.w);
      if (d.t >= 0 && !d.dusted) {
        d.dusted = true;
        const g = this.f.g, [px, py, ok] = g.screenOf(d.x, d.y0 + 0.05, d.z);
        if (ok) {
          // the puff spreads over the footprint as seen from here
          const [ax] = g.screenOf(d.x + d.fw / 2, d.y0, d.z);
          // the ring spreads to the footprint as seen from here; the kit plays the thud with it
          placeDust(px, py, d.w, { ground: this.on ? 'snow' : 'dirt', scale: Math.max(0.7, Math.min(2.2, Math.abs(ax - px) / 40)) });
        }
        g.fx.burst(d.x, d.y0 + 0.15, d.z, Math.round(6 + d.w * 8), P.sand[3], { speed: 1.6 + d.w * 0.6, up: 0.9, size: 3 + d.w, life: 0.7, grav: 2, spread: Math.max(d.fw, d.fd) * 0.5 });
        g.cam.shake(0.03 + d.w * 0.035, 0.12 + d.w * 0.05);
      }
      const done = d.t > 0.6;
      if (d.site) {
        const m = d.site.mesh;
        m.position.y = d.y0 + 0.02 + fall;
        m.scale.set(done ? 1 : sx, done ? 1 : sy, done ? 1 : sx);
      }
      if (d.b) {
        const jb = d.b as unknown as { jz?: [number, number, number]; __lp?: THREE.Object3D };
        jb.jz = done ? undefined : [sx, sy, fall];
        if (jb.__lp) { jb.__lp.position.y = d.y0 + fall; jb.__lp.scale.set(done ? 1 : sx, done ? 1 : sy, done ? 1 : sx); }
      }
      if (done) this.drops.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ the drafting overlay
  private clearOv() { this.og.clearRect(0, 0, this.ov.width, this.ov.height); this.ov.width = 0; }
  private icon(id: string) { let i = this.imgs.get(id); if (!i) { i = new Image(); i.src = itemIcon(id, 32); this.imgs.set(id, i); } return i; }
  private draw() {
    const cv = this.ov, g = this.og, Wd = innerWidth, Ht = innerHeight;
    if (cv.width !== Wd || cv.height !== Ht) { cv.width = Wd; cv.height = Ht; }
    g.clearRect(0, 0, Wd, Ht);
    g.imageSmoothingEnabled = false;
    const W = this.world;
    const R = W.wipe * 1.25 * Ht;
    g.save();
    g.beginPath(); g.arc(W.wipeAt[0], W.wipeAt[1], Math.max(0, R), 0, Math.PI * 2); g.clip();
    const a = this.phase === 'out' ? 1 - clamp01(this.t / 0.4) : clamp01((this.t - 0.3) / 0.4) + (this.phase === 'on' ? 1 : 0);
    g.globalAlpha = Math.min(1, a);
    this.seams(g);
    this.sites(g);
    this.ghostMarks(g);
    this.selMarks(g);
    this.sheet(g, Wd, Ht);
    g.restore();
  }
  /** the drafting sheet: a printed double border with registration marks, the north arrow, the scale bar, the title block */
  private sheet(g: CanvasRenderingContext2D, W: number, H: number) {
    const m = 14, inner = m + 8, bot = H - 6;
    g.fillStyle = BLUE[6];
    g.fillRect(m, m, W - m * 2, 2); g.fillRect(m, bot - 2, W - m * 2, 2); g.fillRect(m, m, 2, bot - m); g.fillRect(W - m - 2, m, 2, bot - m);
    g.fillStyle = BLUE[5];
    g.fillRect(inner, inner, W - inner * 2, 2); g.fillRect(inner, inner, 2, bot - inner - 2); g.fillRect(W - inner - 2, inner, 2, bot - inner - 2);
    // top right (the time corner keeps the top left): the title block, the north arrow beside it, the scale bar under
    const tw = 168, th = 58, tx = W - inner - tw - 24, ty = inner + 14;
    g.fillStyle = BLUE[1]; g.fillRect(tx, ty, tw, th);
    g.fillStyle = BLUE[6]; g.fillRect(tx, ty, tw, 2); g.fillRect(tx, ty + th - 2, tw, 2); g.fillRect(tx, ty, 2, th); g.fillRect(tx + tw - 2, ty, 2, th); g.fillRect(tx + 64, ty, 2, th); g.fillRect(tx + 64, ty + 28, tw - 64, 2);
    text(g, 'B-07', tx + 10, ty + 38, WHITE, 16);
    const gc = this.f.g.groundAt(W / 2, H / 2), ppm = gc ? this.pxPerM(gc) : 0;
    text(g, ppm ? `1:${Math.max(10, Math.round(3780 / ppm / 10) * 10)}` : '', tx + 74, ty + 22, BLUE[6], 16);
    text(g, `${this.f.buildings.filter((b) => !b.def.hidden && !isBelt(b.kind)).length}`, tx + 74, ty + 50, AMB, 16);
    const cam = this.f.g.cam, yaw = cam.yaw;
    g.save(); g.translate(tx - 52, ty + 30); g.rotate(yaw); g.drawImage(this.compass, -this.compass.width, -this.compass.height, this.compass.width * 2, this.compass.height * 2); g.restore();
    text(g, 'N', tx - 57 + Math.round(Math.sin(yaw) * 34), ty + 36 - Math.round(Math.cos(yaw) * 34), WHITE, 16);
    // the scale bar: 0 - 5 - 10 m at the true scale in the middle of the view
    if (gc && ppm > 2) {
      // two segments of a round unit, about a title block wide
      const unit = [1, 2, 5, 10, 20].reduce((u, v) => (v * ppm * 2 <= tw + 12 ? v : u), 1);
      const seg = Math.round(ppm * unit / 2) * 2, bx = tx + tw - seg * 2, by = ty + th + 20;
      g.fillStyle = INKC; g.fillRect(bx - 2, by - 2, seg * 2 + 4, 12);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? BLUE[2] : WHITE; g.fillRect(bx + i * seg / 2, by, seg / 2, 8); }
      text(g, '0', bx - 3, by + 26, WHITE, 16); text(g, String(unit), bx + seg - 4, by + 26, WHITE, 16); text(g, `${unit * 2} m`, bx + seg * 2 - 18, by + 26, WHITE, 16);
    }
  }
  private pxPerM(gc: THREE.Vector3) { const g = this.f.g, [x0, y0] = g.screenOf(gc.x, gc.y, gc.z), [x1, y1] = g.screenOf(gc.x + 1, gc.y, gc.z); return Math.hypot(x1 - x0, y1 - y0); }
  /** ore seams: a dashed ring, the ore's icon and how much is left */
  private seams(g: CanvasRenderingContext2D) {
    const game = this.f.g, hand = this.b.kind ? FDEFS[this.b.kind] : null, want = hand?.extract === 'node';
    for (const s of this.f.seams) {
      if (s.amount <= 0) continue;
      const y = game.region.heightAt(s.x, s.z);
      const [sx, sy, ok] = game.screenOf(s.x, y, s.z); if (!ok || sx < -60 || sy < -60 || sx > innerWidth + 60 || sy > innerHeight + 60) continue;
      const [ex] = game.screenOf(s.x + s.r, y, s.z), r = Math.max(10, Math.abs(ex - sx));
      g.strokeStyle = want ? OKL : BLUE[6]; g.lineWidth = 2; g.setLineDash([6, 6]); g.lineDashOffset = -performance.now() / 120;
      g.beginPath(); g.arc(Math.round(sx), Math.round(sy), r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      const img = this.icon(s.item);
      if (img.complete && img.naturalWidth) g.drawImage(img, Math.round(sx - 16), Math.round(sy - 22), 32, 32);
      text(g, String(Math.floor(s.amount)), Math.round(sx) - 10, Math.round(sy) + 26, want ? OKL : WHITE, 16);
    }
  }
  /** construction sites: an amber progress strip and what they still wait for */
  private sites(g: CanvasRenderingContext2D) {
    const f = this.f; if (!f.sites) return;
    for (const s of f.sites.list) {
      const [sx, sy, ok] = f.g.screenOf(s.cx + s.fw / 2, s.y + s.def.h + 0.3, s.cz + s.fd / 2); if (!ok) continue;
      const p = f.sites.progress(s), w = 64, x = Math.round((sx - w / 2) / 2) * 2, y = Math.round((sy - 8) / 2) * 2;
      g.fillStyle = INKC; g.fillRect(x - 2, y - 2, w + 4, 10);
      for (let i = 0; i < 16; i++) { g.fillStyle = i / 16 < p ? (s.stage === 'build' ? AMB : OKL) : BLUE[1]; g.fillRect(x + i * 4, y, 2, 6); }
      if (s.stage === 'supply') {
        const need = Object.entries(s.need).map(([id, n]) => [id, (n ?? 0) - (s.got[id] ?? 0)] as [string, number]).filter(([, n]) => n > 0).slice(0, 3);
        need.forEach(([id, n], i) => { const img = this.icon(id); const ix = x + i * 40 - (need.length - 1) * 20 + 16; if (img.complete && img.naturalWidth) g.drawImage(img, ix, y - 34, 24, 24); text(g, String(n), ix + 22, y - 14, AMB, 16); });
      }
    }
  }
  /** brackets, dimensions in metres and a facing chevron round the ghost's footprint */
  private ghostMarks(g: CanvasRenderingContext2D) {
    const b = this.b;
    if (!b.ghosts.length || b.ghosts.length > 1 && !b.moving) { if (b.ghosts.length > 1) for (const gh of b.ghosts) this.bracket(g, gh.cx, gh.cz, footW(FDEFS[gh.kind], gh.r), footD(FDEFS[gh.kind], gh.r), gh.ok ? OKL : BADL, false); return; }
    const gh = b.ghosts[0], def = FDEFS[gh.kind]; if (!def) return;
    const w = footW(def, gh.r), d = footD(def, gh.r);
    this.bracket(g, gh.cx, gh.cz, w, d, gh.ok ? OKL : BADL, true, gh.r);
  }
  private selMarks(g: CanvasRenderingContext2D) {
    const t = this.b.kind || this.b.moving ? null : this.b.selected; if (!t) return;
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 160);
    g.globalAlpha *= pulse;
    this.bracket(g, t.cx, t.cz, t.fw, t.fd, WHITE, false);
    g.globalAlpha /= pulse;
  }
  private bracket(g: CanvasRenderingContext2D, cx: number, cz: number, w: number, d: number, col: string, dims: boolean, r = -1) {
    const game = this.f.g, y = this.f.levelFor(cx, cz, w, d) + 0.05;
    const P4 = [[cx, cz], [cx + w, cz], [cx + w, cz + d], [cx, cz + d]].map(([x, z]) => game.screenOf(x, y, z));
    if (P4.some((p) => !p[2])) return;
    const L = 12;
    for (let i = 0; i < 4; i++) {
      const [x, yy] = P4[i], n = P4[(i + 1) % 4], pv = P4[(i + 3) % 4];
      for (const o of [n, pv]) {
        const dx = o[0] - x, dy = o[1] - yy, l = Math.hypot(dx, dy) || 1;
        line(g, x, yy, x + (dx / l) * L, yy + (dy / l) * L, INKC, 6);
        line(g, x, yy, x + (dx / l) * L, yy + (dy / l) * L, col, 2);
      }
    }
    if (!dims) return;
    // dimension lines: along the screen-lowest edge and the screen-rightmost edge, 18 px out, with ticks and metres
    const edges = [0, 1, 2, 3].map((i) => { const a = P4[i], b = P4[(i + 1) % 4]; return { a, b, i, my: (a[1] + b[1]) / 2, mx: (a[0] + b[0]) / 2 }; });
    const ctr = [(P4[0][0] + P4[2][0]) / 2, (P4[0][1] + P4[2][1]) / 2];
    const bottom = edges.reduce((m, e) => (e.my > m.my ? e : m)), right = edges.reduce((m, e) => (e.mx > m.mx ? e : m));
    for (const e of [bottom, right]) {
      const len = e.i % 2 === 0 ? w : d;
      const nx = (e.a[0] + e.b[0]) / 2 - ctr[0], ny = (e.a[1] + e.b[1]) / 2 - ctr[1], nl = Math.hypot(nx, ny) || 1, ox = (nx / nl) * 18, oy = (ny / nl) * 18;
      const a = [e.a[0] + ox, e.a[1] + oy], bb = [e.b[0] + ox, e.b[1] + oy];
      line(g, a[0], a[1], bb[0], bb[1], BLUE[6], 2);
      line(g, e.a[0] + ox * 0.3, e.a[1] + oy * 0.3, e.a[0] + ox * 1.3, e.a[1] + oy * 1.3, BLUE[6], 2);
      line(g, e.b[0] + ox * 0.3, e.b[1] + oy * 0.3, e.b[0] + ox * 1.3, e.b[1] + oy * 1.3, BLUE[6], 2);
      const mx = (a[0] + bb[0]) / 2, my = (a[1] + bb[1]) / 2;
      const s = `${len}`;
      const tw = bitMeasure(s);
      g.fillStyle = BLUE[2]; g.fillRect(Math.round(mx - tw / 2 - 4), Math.round(my - 9), Math.ceil(tw + 8), 18);
      text(g, s, Math.round(mx - tw / 2), Math.round(my + 6), WHITE, 16);
    }
    // the facing chevron: out of the front face (the way its output goes)
    if (r >= 0) {
      const [fx, fz] = DIRS[r & 3];
      const mxw = cx + w / 2 + fx * (w / 2 + 0.7), mzw = cz + d / 2 + fz * (d / 2 + 0.7);
      const [ax, ay, ok] = game.screenOf(mxw, y, mzw), [bx, by] = game.screenOf(mxw + fx * 0.6, y, mzw + fz * 0.6);
      if (ok) {
        const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        for (const [c, wd] of [[INKC, 7], [col, 3]] as const) {
          line(g, ax - uy * 9 - ux * 4, ay + ux * 9 - uy * 4, ax + ux * 6, ay + uy * 6, c, wd);
          line(g, ax + uy * 9 - ux * 4, ay - ux * 9 - uy * 4, ax + ux * 6, ay + uy * 6, c, wd);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ drawing helpers
function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, w: number) {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'square';
  g.beginPath(); g.moveTo(Math.round(x0), Math.round(y0)); g.lineTo(Math.round(x1), Math.round(y1)); g.stroke();
}
/** Alagard (the kit's bitmap face) at 16 or 32 px with its 8-way ink outline; y is the baseline */
export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, col: string, size = 16) {
  if (!s) return 0;
  const sc = size >= 32 ? 2 : 1;
  return bitText(g, s, Math.round(x), Math.round(y - 13 * sc), { color: col, scale: sc });
}
/** the north arrow: a brass compass rose painted as pixel art (24 x 24 art px, shown at 2x) */
function paintCompass(): HTMLCanvasElement {
  const S = 24, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d')!, id = g.createImageData(S, S), d = id.data;
  const set = (x: number, y: number, c: number) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const i = (y * S + x) * 4; d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255; };
  const c = 11.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = x + 0.5 - c, py = y + 0.5 - c, r = Math.hypot(px, py);
    if (r > 9.2 && r < 11) set(x, y, r < 10 ? P.sapphire[6] : P.sapphire[4]);
    // a four-point star, the north point (up = toward -y) filled white
    const ax = Math.abs(px), ay = Math.abs(py);
    if (ax + ay * 3.2 < 3.6 || ay + ax * 3.2 < 3.6 || ax + ay * 0.32 < 2.4 && py < 0 && py > -9 || ay + ax * 0.32 < 1.6 && Math.abs(px) < 8) {
      const north = py < 0 && ax < 2.6;
      set(x, y, north ? (px < 0 ? P.quartz[5] : P.quartz[3]) : px + py < 0 ? P.sapphire[5] : P.sapphire[3]);
    }
  }
  // N above the rose
  g.putImageData(id, 0, 0);
  return cv;
}

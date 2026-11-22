// INSIDE THE POD (v7; the user: "make it top down, just like zoom in on it, same camera angle as a normal building, just
// darken the outside"). Clicking the pod ZOOMS THE GAME'S OWN CAMERA onto it (same yaw and pitch rule as the colony
// view, stage.ts): the hull is sliced down to the cabin floor as the camera comes in, the ruined cabin (room.ts) stands
// in it as a cutaway (roof gone, near walls cut low), and the world around it dims and greys (post.focus). A tray
// along the bottom holds the DECOR, FURNITURE and NECESSITIES (each an
// outlined 3D model with its cost in item icons and the joy it brings). Placing works like build mode: pick a piece,
// drag it over the deck (or onto a shelf, a crate or the bunk), R or the wheel turns it, click drops it: it falls,
// squashes by its weight, bounces and puffs dust with a thud. Click a placed piece to pick it up again; X or right-click
// while carrying puts it back in the stores. The HAPPINESS gauge at the top rolls with every piece, the teammates'
// faces beside it. Esc or the hatch leaves: the camera zooms back out and the hull closes over the cabin again.
import * as THREE from 'three';
import type { Engine, Screen } from '../../app/engine';
import type { Post } from '../../gfx/post';
import type { Game } from '../../game/game';
import { buildRoom, R as ROOM_R, FLOOR_Y, HULL_R, H as ROOM_H, type Room } from './room';
import type { PodStage } from './stage';
import { Cloth, Cluster, softFor, boxCol, type Col } from './soft';
import { matMaterial, matInfo } from '../../gfx/mat';
import type { BreakKind } from './breakage';
import { DECOR, DECOR_BY, decorToon, preloadDecor, type DecorDef } from './decor';
import type { PodHome, Placed } from './home';
import { ModelView } from '../../ui/kit/model3d';
import { bounce3, burst, tween, ease, floatUp, shake } from '../../ui/kit/juice';
import { uiSfx } from '../../ui/kit/sound';
import { bitText, bitMeasure } from '../../ui/kit/bitfont';
import { Px, P, bevel, cellBar, rivet, screw, glassWell, hex } from '../../ui/kit/px';
import { shadowBlob, pxCanvas } from '../../ui/kit/mat';
import { gbuf } from '../../gfx/gbuf';
import { itemIcon, ITEMS } from '../../factory/items';
import { resolve, have, pay, give, anyG } from '../../research/util';
import { portrait } from '../../social/portrait';
import { stepIcon } from '../../story/icons';

const V = THREE.Vector3;
const CSS = `
.pod7 { position: fixed; inset: 0; z-index: 610; pointer-events: none; }
.pod7 canvas { image-rendering: pixelated; display: block; }
.pod7 .p7-tray { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); pointer-events: auto; display: flex; align-items: flex-end; gap: 6px; padding: 0 12px 30px; }
.pod7 .p7-rail { position: absolute; left: -12px; bottom: 4px; z-index: 0; }
.pod7 .p7-card { position: relative; z-index: 1; cursor: pointer; display: flex; flex-direction: column; align-items: center; transition: transform .14s cubic-bezier(.3,1.6,.5,1); }
.pod7 .p7-card .p7-model { animation: p7bob 3s ease-in-out infinite; animation-delay: var(--bob, 0s); filter: drop-shadow(0 0 0 transparent); }
@keyframes p7bob { 50% { transform: translateY(-4px); } }
.pod7 .p7-card .p7-sh { margin-top: -6px; opacity: .8; }
.pod7 .p7-card .p7-cost { margin-top: 2px; }
.pod7 .p7-card:hover { transform: translateY(-10px); }
.pod7 .p7-card:hover .p7-model { animation-play-state: paused; }
.pod7 .p7-card.poor .p7-model { filter: saturate(.3) brightness(.62); }
.pod7 .p7-card.on { transform: translateY(-16px); }
.pod7 .p7-joy { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); }
.pod7 .p7-out { position: absolute; left: 22px; top: 22px; pointer-events: auto; cursor: pointer; transition: transform .12s; }
.pod7 .p7-out:hover { transform: translateY(-3px) scale(1.05); }
body.pod7-on .qt7 { top: 150px; }
`;
interface Piece { p: Placed; obj: THREE.Group; def: DecorDef; sims?: (Cloth | Cluster)[]; hidden?: THREE.Object3D[]; col?: Col | null; box?: THREE.Box3 | null }
/** a piece's solid parts (not its cloth or soft parts) as a box in its own frame (null until its models arrive) */
function solidBox(obj: THREE.Object3D): THREE.Box3 | null {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), box = new THREE.Box3(), b = new THREE.Box3();
  obj.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh || m.userData.cloth || m.userData.soft || !m.geometry) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.copy(m.geometry.boundingBox!).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); box.union(b); });
  return box.isEmpty() ? null : box;
}

export class PodInterior implements Screen {
  static current: PodInterior | null = null;
  readonly cam: THREE.PerspectiveCamera;
  private room: Room; private ui: HTMLDivElement; private tray: HTMLDivElement; private joyCv: HTMLCanvasElement; private views: ModelView[] = [];
  private pieces: Piece[] = [];
  private carry: { def: DecorDef; obj: THREE.Group; rot: number; from: Placed | null; ok: boolean; at: THREE.Vector3; y: number } | null = null;
  private ray = new THREE.Raycaster(); private mouse = new THREE.Vector2(); private mx = 0; private my = 0;
  private t = 0; private joyShown = 0; private joyT = 0;
  /** the zoom: 0 the colony view, 1 inside (the hull sliced, the outside dimmed); `dir` +1 coming in, -1 leaving */
  private k = 0; private dir = 1; private lastNow = 0;
  private from: { target: THREE.Vector3; dist: number; yaw: number };
  private into: { target: THREE.Vector3; dist: number; yaw: number };
  private clip = new THREE.Plane(new V(0, -1, 0), 1e4);
  private clipped: { m: THREE.Material; was: THREE.Plane[] | null }[] = [];
  private hidden: THREE.Object3D[] = [];
  private clipWas = false;
  private leaving = false;
  constructor(readonly g: Game, readonly engine: Engine, readonly home: PodHome, readonly stage: PodStage, readonly onLeave: () => void) {
    PodInterior.current = this; (window as unknown as { __pod?: PodInterior }).__pod = this;
    if (!document.getElementById('pod7-css')) { const s = document.createElement('style'); s.id = 'pod7-css'; s.textContent = CSS; document.head.append(s); }
    this.cam = stage.cam;
    this.room = buildRoom();
    const pod = stage.pod;
    this.room.root.position.set(pod.x, pod.y + FLOOR_Y, pod.z); this.room.root.rotation.y = pod.yaw;
    stage.scene.add(this.room.root); stage.fx.add(this.room.fx);
    this.room.root.add(this.ring);
    // the camera: from where the colony view is now to the pod, at the colony view's own angle, the hatch toward us
    const c = this.cam.position, fwd = new V(); this.cam.getWorldDirection(fwd);
    const tY = pod.y + 0.5, tk = Math.abs(fwd.y) > 1e-3 ? (tY - c.y) / fwd.y : 30;
    const tgt = c.clone().addScaledVector(fwd, Math.max(1, tk));
    this.from = { target: new V(tgt.x, pod.y, tgt.z), dist: c.distanceTo(tgt), yaw: Math.atan2(c.x - tgt.x, c.z - tgt.z) };
    // a building's distance: the cabin fills about two thirds of the frame, clear of the tray
    const D = 15, toward = new V(Math.sin(pod.yaw), 0, Math.cos(pod.yaw));
    this.into = { target: new V(pod.x, pod.y + FLOOR_Y - 0.5, pod.z).addScaledVector(toward, 0.3), dist: D, yaw: pod.yaw };
    this.clipWalk();
    this.clipWas = engine.renderer.localClippingEnabled; engine.renderer.localClippingEnabled = true;
    // the pieces already built
    for (const p of home.placed) this.spawn(p);
    this.ui = document.createElement('div'); this.ui.className = 'pod7';
    this.tray = document.createElement('div'); this.tray.className = 'p7-tray';
    this.joyCv = document.createElement('canvas'); this.joyCv.className = 'p7-joy';
    const out = document.createElement('div'); out.className = 'p7-out';
    const oc = document.createElement('canvas'); out.append(oc); this.paintOut(oc);
    out.addEventListener('click', () => this.leave()); out.addEventListener('pointerenter', () => uiSfx('hover', 0.6));
    this.ui.append(this.tray, this.joyCv, out);
    document.body.append(this.ui); document.body.classList.add('pod7-on');
    this.buildTray();
    this.joyShown = home.happiness();
    this.paintJoy();
    const cv = engine.canvas;
    cv.addEventListener('pointermove', this.onMove); cv.addEventListener('pointerdown', this.onDown); cv.addEventListener('wheel', this.onWheel, { passive: false });
    addEventListener('keydown', this.onKey, true); addEventListener('pointerup', this.onUp, true);
    cv.addEventListener('contextmenu', this.noCtx);
    this.pose(0);
    void preloadDecor();
    anyG(g).emit?.('pod-enter', {});
  }
  private noCtx = (e: Event) => e.preventDefault();

  // ---------------------------------------------------------------- the pieces in the room
  private spawn(p: Placed): Piece | null {
    const def = DECOR_BY[p.id]; if (!def) return null;
    const obj = def.build(); obj.position.set(p.x, p.y, p.z); obj.rotation.y = p.rot;
    obj.traverse((o) => { o.userData.piece = p; });
    this.room.root.add(obj);
    const pc: Piece = { p, obj, def }; this.pieces.push(pc); this.softify(pc); return pc;
  }
  // ---------------------------------------------------------------- the tray
  /** the tray: every piece floats free over a thin machined rail (no boxes), a pixel shadow under it, its cost
   *  line under that (a heart and the joy, the items with their counts, red when short) */
  private buildTray() {
    this.tray.replaceChildren();
    for (const v of this.views) v.dispose(); this.views = [];
    const rail = document.createElement('canvas'); rail.className = 'p7-rail'; this.tray.append(rail);
    DECOR.forEach((d, i) => {
      const card = document.createElement('div'); card.className = 'p7-card'; card.dataset.id = d.id; card.style.setProperty('--bob', (-(i * 0.37) % 3).toFixed(2) + 's');
      const view = new ModelView(() => decorToon(d.id).then((o) => o ?? new THREE.Group()), { w: 52, h: 46, scale: 2, spin: 0, yaw0: 0.7 + (i % 3) * 0.3, hotSpin: 2.2, zoom: 1.1, pitch: 0.5, frames: 32 });
      view.cv.classList.add('p7-model');
      const sh = pxCanvas(shadowBlob(30, 6, 0.55), 2, 'p7-sh');
      const cost = document.createElement('canvas'); cost.className = 'p7-cost';
      card.append(view.cv, sh, cost); this.views.push(view);
      card.addEventListener('pointerenter', (e) => { view.hot(true); view.point(e.clientX, e.clientY); uiSfx('hover', 0.6); });
      card.addEventListener('pointermove', (e) => view.point(e.clientX, e.clientY));
      card.addEventListener('pointerleave', () => view.hot(false));
      card.addEventListener('pointerdown', (e) => { e.stopPropagation(); view.press(1); this.pick(d); this.dragFrom = [e.clientX, e.clientY]; });
      this.tray.append(card);
      this.paintCost(card, cost, d);
    });
    requestAnimationFrame(() => this.paintRail(rail));
  }
  /** a thin machined rail: a gunmetal bar with a lit lip, a sunk amber light channel, bolted brackets and end caps */
  private paintRail(cv: HTMLCanvasElement) {
    const W = Math.round(this.tray.clientWidth / 2) + 24, H = 12, p = new Px(W, H);
    bevel(p, 4, 3, W - 8, 7, P.steel, { chamfer: 1, base: 2 });
    for (let x = 10; x < W - 10; x++) p.set(x, 6, (x >> 2) & 1 ? P.glowAmber[1] : P.glowAmber[2]);
    for (let x = 10; x < W - 10; x += 6) p.set(x, 6, P.glowAmber[4]);
    bevel(p, 0, 1, 8, 11, P.steel, { chamfer: 2 }); bevel(p, W - 8, 1, 8, 11, P.steel, { chamfer: 2 });
    for (let x = 60; x < W - 40; x += 120) { bevel(p, x, 1, 10, 10, P.steel, { chamfer: 2, base: 4 }); rivet(p, x + 5, 6, 1); }
    p.canvas(cv); cv.style.width = W * 2 + 'px'; cv.style.height = H * 2 + 'px';
  }
  private paintCost(card: HTMLElement, cv: HTMLCanvasElement, d: DecorDef) {
    const cost = resolve(d.cost), afford = Object.entries(cost).every(([id, n]) => have(this.g, id) >= n);
    const full = this.home.count(d.id) >= d.max;
    card.classList.toggle('poor', !afford || full);
    const ids = Object.keys(cost).filter((id) => ITEMS[id]);
    const W = 52, H = 30;
    cv.width = W; cv.height = H; cv.style.width = W * 2 + 'px'; cv.style.height = H * 2 + 'px';
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.clearRect(0, 0, W, H);
    if (full) { bitText(c, 'MAX', W / 2, 1, { color: '#c8c0a8', align: 'center' }); return; }
    // the joy, then each item: icon and count
    const parts: { w: number; draw: (x: number) => void }[] = [];
    parts.push({ w: 8 + bitMeasure('+' + d.joy), draw: (x) => { heart(c, x, 5, 1); bitText(c, '+' + d.joy, x + 8, 1, { color: '#ffc8b8' }); } });
    for (const id of ids) {
      const n = cost[id], ok = have(this.g, id) >= n, im = itemImg(id), t = String(n);
      parts.push({ w: 11 + bitMeasure(t), draw: (x) => { const go = () => c.drawImage(im, x, 3, 10, 10); if (im.complete) go(); else im.addEventListener('load', go); bitText(c, t, x + 10, 1, { color: ok ? '#f4ecd6' : '#ff7a5a' }); } });
    }
    // the joy on the first line, the items on the second
    parts[0].draw(Math.round((W - parts[0].w) / 2));
    const rest = parts.slice(1), total = rest.reduce((s, q) => s + q.w + 2, -2);
    c.save(); c.translate(0, 14);
    let x = Math.max(0, Math.round((W - total) / 2));
    for (const q of rest) { q.draw(x); x += q.w + 2; }
    c.restore();
  }
  private refreshTray() { this.tray.querySelectorAll<HTMLElement>('.p7-card').forEach((card) => { const d = DECOR_BY[card.dataset.id ?? '']; const cv = card.querySelector('.p7-cost') as HTMLCanvasElement | null; if (d && cv) this.paintCost(card, cv, d); card.classList.toggle('on', this.carry?.def.id === d?.id); }); }
  private paintOut(cv: HTMLCanvasElement) {
    const ic = stepIcon('hatch'), W = 48, H = 52; cv.width = W; cv.height = H; cv.style.width = W * 2 + 'px'; cv.style.height = H * 2 + 'px';
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.drawImage(ic, 6, 0, 36, 36);
    bitText(c, 'OUT', W / 2, 34, { color: '#ffe2a0', extrude: [1, '#5a3a14'], align: 'center' });
  }
  /** the happiness gauge: a clean machined gunmetal housing, four screws, a heart lamp, the number in a sunk glass
   *  window, a cell bar that fills, the teammates' faces with their morale pips */
  private paintJoy() {
    const W = 212, H = 44, p = new Px(W, H);
    bevel(p, 1, 1, W - 2, H - 2, P.steel, { chamfer: 4, base: 2 });
    bevel(p, 5, 5, W - 10, H - 10, P.steel, { chamfer: 2, base: 3, ink: false });
    for (const [x, y] of [[4, 4], [W - 9, 4], [4, H - 9], [W - 9, H - 9]]) screw(p, x, y, x + y);
    glassWell(p, 14, 9, 30, 26, 0x2a0c0a, { glare: true });
    glassWell(p, 50, 9, 40, 14, 0x0c100e, { glare: false });
    cellBar(p, 50, 27, 86, 8, this.joyShown / 100, P.glowAmber, this.t);
    glassWell(p, 142, 7, 62, 30, 0x14181a, { glare: false });
    const cv = this.joyCv; p.canvas(cv); cv.style.width = W * 2 + 'px'; cv.style.height = H * 2 + 'px';
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
    heart(c, 18, 14, 3);
    bitText(c, String(Math.round(this.joyShown)), 70, 7, { color: '#ffd890', outline: null, align: 'center' });
    const C = anyG(this.g).colony;
    let x = 146;
    for (const id of ['kristiansen', 'mamani']) {
      const t = C?.teammate?.(id); const f = portrait(id); if (!f) continue;
      c.globalAlpha = t && !t.alive ? 0.35 : 1; c.drawImage(f, x, 8, 22, 22); c.globalAlpha = 1;
      if (t?.alive) { const mo = Math.round((t.morale ?? 60) / 20); for (let i = 0; i < 5; i++) { c.fillStyle = i < mo ? '#ffc040' : '#3a2a14'; c.fillRect(x + 1 + i * 4, 31, 3, 2); } }
      x += 29;
    }
    void hex;
  }
  // ---------------------------------------------------------------- carrying and placing
  private pick(d: DecorDef) {
    if (this.carry) this.drop(false);
    const cost = resolve(d.cost);
    if (this.home.count(d.id) >= d.max) { uiSfx('error', 0.6); return; }
    if (!Object.entries(cost).every(([id, n]) => have(this.g, id) >= n)) { uiSfx('error', 0.6); const card = this.tray.querySelector(`[data-id="${d.id}"]`) as HTMLElement | null; if (card) shake(card, 4, 260); return; }
    const obj = d.build(); this.room.root.add(obj);
    this.carry = { def: d, obj, rot: 0, from: null, ok: false, at: new V(), y: 0 };
    uiSfx('pluck', 0.7); this.refreshTray();
    this.hover();
  }
  // ---------------------------------------------------------------- the soft and loose things (soft.ts)
  /** a placed piece joins the physics: its cloth parts become cloth, its soft parts soft bodies, its solid parts a collider */
  private softify(pc: Piece) {
    const phys = this.room.phys, root = this.room.root;
    root.updateMatrixWorld(true);
    pc.sims = []; pc.hidden = [];
    pc.obj.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const cl = m.userData.cloth as { mat: string; w: number; d: number; nx: number; ny: number } | undefined, so = m.userData.soft as { mat: string } | undefined;
      if (cl) {
        const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(m.matrixWorld), info = matInfo(cl.mat)!;
        const cloth = new Cloth(cl.nx, cl.ny, (i, j) => new V(((i / (cl.nx - 1)) - 0.5) * cl.w, 0.035, ((j / (cl.ny - 1)) - 0.5) * cl.d).applyMatrix4(toRoot),
          matMaterial(cl.mat, { hd: 2, uv: 'uv', repeat: [cl.w / info.mw, cl.d / info.mh], side: THREE.DoubleSide }));
        cloth.fr = 0.75; cloth.windK = 0.4;
        phys.add(cloth); pc.sims!.push(cloth); m.visible = false; pc.hidden!.push(m);
      } else if (so) {
        const info = matInfo(so.mat)!, b = softFor(m, root, matMaterial(so.mat, { hd: 2, uv: 'uv', repeat: [1 / info.mw, 1 / info.mh] }));
        phys.add(b); pc.sims!.push(b); m.visible = false; pc.hidden!.push(m);
      }
    });
    pc.box = solidBox(pc.obj); pc.col = null;
  }
  private unsoftify(pc: Piece) {
    for (const s of pc.sims ?? []) this.room.phys.remove(s);
    for (const o of pc.hidden ?? []) o.visible = true;
    pc.sims = []; pc.hidden = []; pc.col = null;
  }
  /** a piece's collider in the cabin frame (its solid box, turned with it) */
  private colOf(obj: THREE.Object3D, box: THREE.Box3, toFloor = false): Col {
    const c = box.getCenter(new V()), half = box.getSize(new V()).multiplyScalar(0.5);
    const p = c.clone().applyQuaternion(obj.quaternion).add(obj.position);
    if (toFloor) { const top = p.y + half.y; p.y = top / 2; half.y = Math.max(0.05, top / 2); }
    return boxCol(p, half, obj.quaternion, 'piece');
  }
  private carryCol: Col | null = null; private carryBox: THREE.Box3 | null = null;
  /** the colliders the pieces make this frame: placed ones, and the one in hand sweeping the deck under it */
  private colliders(dt: number) {
    const cols: Col[] = [];
    for (const pc of this.pieces) {
      if (!pc.box) pc.box = solidBox(pc.obj);
      if (pc.box) { const c = this.colOf(pc.obj, pc.box); if (pc.col) c.v.copy(c.p).sub(pc.col.p).divideScalar(Math.max(dt, 1e-3)); pc.col = c; cols.push(c); }
    }
    if (this.carry) {
      if (!this.carryBox) this.carryBox = solidBox(this.carry.obj);
      if (this.carryBox) { const c = this.colOf(this.carry.obj, this.carryBox, true); if (this.carryCol) c.v.copy(c.p).sub(this.carryCol.p).divideScalar(Math.max(dt, 1e-3)); this.carryCol = c; cols.push(c); }
    } else { this.carryCol = null; this.carryBox = null; }
    this.room.phys.dyn = cols;
  }
  /** the cursor drags cloth, ropes, the pillow and the debris (a particle pulled toward the cursor at its depth) */
  private dragSim: { dist: number } | null = null;
  private trySimGrab(): boolean {
    const phys = this.room.phys, root = this.room.root;
    const targets: THREE.Object3D[] = [];
    for (const s of phys.all()) { const o = (s as Cloth).mesh ?? (s as Cluster).obj; if (o) targets.push(o); }
    const h = this.ray.intersectObjects(targets, true)[0]; if (!h) return false;
    const pt = root.worldToLocal(h.point.clone()), n = phys.nearest(pt, 0.45); if (!n) return false;
    phys.grab = { set: n.set, i: n.i, target: pt.clone().add(new V(0, 0.08, 0)) };
    this.dragSim = { dist: h.distance };
    uiSfx('pluck', 0.6, 1.2); this.engine.canvas.style.cursor = 'grabbing';
    return true;
  }
  private dragTo() {
    const g = this.room.phys.grab; if (!g || !this.dragSim) return;
    const w = this.ray.ray.origin.clone().addScaledVector(this.ray.ray.direction, this.dragSim.dist);
    const p = this.room.root.worldToLocal(w); p.y = Math.max(0.03, p.y);
    g.target.copy(p);
  }

  private lift(pc: Piece) {
    if (this.carry) return;
    this.unsoftify(pc);
    this.pieces.splice(this.pieces.indexOf(pc), 1);
    const i = this.home.placed.indexOf(pc.p); if (i >= 0) this.home.remove(i);
    this.carry = { def: pc.def, obj: pc.obj, rot: pc.p.rot, from: pc.p, ok: true, at: pc.obj.position.clone(), y: pc.p.y };
    pc.obj.traverse((o) => { delete o.userData.piece; });
    uiSfx('pluck', 0.8, 0.9); this.refreshTray(); this.bump();
  }
  /** where the carried piece would land: the deck, or the top of a piece with a flat top */
  private hover() {
    const c = this.carry; if (!c) return;
    this.ray.setFromCamera(this.mouse, this.cam);
    const tops = this.pieces.filter((p) => p.def.top).map((p) => p.obj);
    const hits = this.ray.intersectObjects([this.room.floor, ...tops], true);
    let at: THREE.Vector3 | null = null, y = 0;
    for (const h of hits) {
      const pc = h.object.userData.piece as Placed | undefined;
      if (pc) { const d = DECOR_BY[pc.id]; if (d?.top && c.def.r < 0.6) { at = this.room.root.worldToLocal(h.point.clone()); y = pc.y + d.top; break; } continue; }
      at = this.room.root.worldToLocal(h.point.clone()); y = 0; break;
    }
    if (!at) return;
    const r = Math.hypot(at.x, at.z), maxR = ROOM_R - 0.3 - c.def.r * 0.6;
    if (r > maxR) at.multiplyScalar(maxR / r);
    c.at.set(at.x, y, at.z); c.y = y;
    // free: inside the cabin, off the debris, not inside another piece (stacking on a top is fine)
    let ok = true;
    if (y === 0) {
      for (const b of this.room.blocked) if (Math.hypot(b.x - at.x, b.z - at.z) < b.r + c.def.r * 0.7) ok = false;
      for (const p of this.pieces) if (Math.abs(p.p.y - y) < 0.2 && Math.hypot(p.p.x - at.x, p.p.z - at.z) < (p.def.r + c.def.r) * 0.75 && !(DECOR_BY[p.p.id].kind === 'decor' && p.p.id === 'rug') && c.def.id !== 'rug') ok = false;
    }
    c.ok = ok;
    // the footprint ring under it: green where it can go, red where it cannot
    this.ring.visible = true; this.ring.position.set(at.x, y + 0.012, at.z); this.ring.scale.setScalar(Math.max(0.25, c.def.r));
    this.ringM.color.setHex(ok ? 0x60ff70 : 0xff4030).multiplyScalar(1.4);
  }
  private ringM = gbuf(new THREE.MeshBasicMaterial({ color: 0x60ff70, transparent: true, opacity: 0.85, depthWrite: false }), 0);
  private ring = (() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 24), this.ringM); m.rotation.x = -Math.PI / 2; m.visible = false; return m; })();
  private drop(place: boolean) {
    const c = this.carry; if (!c) return;
    this.carry = null; this.ring.visible = false;
    if (!place) {
      // back to the stores (a piece that was already built refunds its cost)
      c.obj.removeFromParent();
      if (c.from) { give(this.g, resolve(c.def.cost)); uiSfx('swishOut', 0.6); this.toast('+', c.obj.position); }
      this.refreshTray(); this.bump(); return;
    }
    if (!c.ok) { this.carry = c; this.ring.visible = true; uiSfx('error', 0.6); return; }
    if (!c.from && !pay(this.g, resolve(c.def.cost))) { this.carry = c; this.ring.visible = true; uiSfx('error', 0.6); return; }
    const p: Placed = { id: c.def.id, x: c.at.x, z: c.at.z, y: c.y, rot: c.rot };
    c.obj.position.set(p.x, p.y, p.z); c.obj.rotation.y = p.rot;
    c.obj.traverse((o) => { o.userData.piece = p; });
    const placed: Piece = { p, obj: c.obj, def: c.def }; this.pieces.push(placed);
    // the landing shoves the loose things about (scaled by its weight)
    this.room.phys.impulse(new V(p.x, p.y + 0.05, p.z), 0.45 + c.def.r + c.def.weight * 0.8, 1.2 + c.def.weight * 3.2, 0.7);
    this.home.add(p);
    // the drop: a fall, a squash by weight, a bounce, dust and the thud (build mode's juice, from the kit)
    // its cloth and soft parts come alive once it has landed (at once for QA placement)
    if (this.qaInstant) this.softify(placed);
    else void bounce3(c.obj, c.def.weight, { camera: this.cam, dust: true, ground: 'metal' }).then(() => { if (this.pieces.includes(placed)) this.softify(placed); });
    if (!c.from) { const s = this.screenOf(c.obj.position.clone().add(new V(0, 0.6, 0))); floatUp(s[0], s[1], '+' + c.def.joy, { color: '#ffb0a0' }); burst(s[0], s[1], { n: 10, ramp: P.coral, speed: 120, life: 0.6, gravity: -60 }); }
    this.refreshTray(); this.bump();
  }
  private bump() { this.joyT = 0; uiSfx('tick', 0.5); }
  private toast(text: string, at: THREE.Vector3) { const s = this.screenOf(at); floatUp(s[0], s[1], text); }
  /** a point in the cabin's frame on the screen */
  private screenOf(p: THREE.Vector3): [number, number] { const v = this.room.root.localToWorld(p.clone()).project(this.cam); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }

  // ---------------------------------------------------------------- input
  private onMove = (e: PointerEvent) => { this.mx = e.clientX; this.my = e.clientY; this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); if (this.room.phys.grab) { this.ray.setFromCamera(this.mouse, this.cam); this.dragTo(); return; } if (this.carry) this.hover(); else { this.ray.setFromCamera(this.mouse, this.cam); const h = this.ray.intersectObjects(this.pieces.map((p) => p.obj), true)[0]; this.engine.canvas.style.cursor = h ? 'grab' : ''; } };
  private onDown = (e: PointerEvent) => {
    if (this.leaving) return;
    this.onMove(e);
    if (this.carry) { if (e.button === 2) this.drop(false); else if (e.button === 0) this.drop(true); return; }
    if (e.button !== 0) return;
    this.ray.setFromCamera(this.mouse, this.cam);
    const h = this.ray.intersectObjects(this.pieces.map((p) => p.obj), true)[0];
    if (h) { const p = h.object.userData.piece as Placed | undefined; const pc = this.pieces.find((x) => x.p === p); if (pc) { this.lift(pc); return; } }
    this.trySimGrab();
  };
  /** drag from the tray and let go over the cabin: it drops there (a click on the tray, then a click works too) */
  private dragFrom: [number, number] | null = null;
  private onUp = (e: PointerEvent) => {
    if (this.room.phys.grab) { this.room.phys.grab = null; this.dragSim = null; this.engine.canvas.style.cursor = ''; }
    const f = this.dragFrom; this.dragFrom = null;
    if (!f || !this.carry || e.button !== 0) return;
    if (Math.hypot(e.clientX - f[0], e.clientY - f[1]) > 24 && e.target === this.engine.canvas) { this.onMove(e); this.drop(true); }
  };
  private onWheel = (e: WheelEvent) => { if (!this.carry) return; e.preventDefault(); this.turn(e.deltaY > 0 ? 1 : -1); };
  private turn(d: number) { const c = this.carry; if (!c) return; c.rot += d * Math.PI / 4; uiSfx('switch', 0.6); void tween(140, (k) => { if (this.carry === c) c.obj.rotation.y = c.rot - d * Math.PI / 4 * (1 - k); }, ease.outBack); }
  private onKey = (e: KeyboardEvent) => {
    if (PodInterior.current !== this) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); e.stopPropagation(); if (this.carry) this.drop(false); else this.leave(); return; }
    if (k === 'r') { e.preventDefault(); e.stopPropagation(); this.turn(1); }
    if (k === 'x' || k === 'delete') { e.preventDefault(); e.stopPropagation(); this.drop(false); }
  };
  /** QA and story beats: build a piece at a spot (pays, bounces) */
  qaPlace(id: string, x: number, z: number, rot = 0, y = 0) {
    const d = DECOR_BY[id]; if (!d) return false;
    this.pick(d); const c = this.carry; if (!c) return false;
    c.rot = rot; c.obj.rotation.y = rot; c.at.set(x, y, z); c.y = y; c.ok = true; c.obj.position.set(x, y, z);
    this.qaInstant = true; this.drop(true); this.qaInstant = false; return true;
  }
  private qaInstant = false;
  /** zoom back out: the hull closes over the cabin, the colony brightens, then the colony view takes over again */
  leave() {
    if (this.leaving) return; this.leaving = true;
    if (this.carry) this.drop(false);
    this.ui.style.pointerEvents = 'none'; this.ui.style.transition = 'opacity .35s'; this.ui.style.opacity = '0';
    uiSfx('swishOut', 0.6); uiSfx('metalClose', 0.5);
    this.dir = -1;
  }
  /** the hull is sliced from the top down to the cabin floor as the camera comes in (the arms on its hardpoints step
   *  aside). Walked every frame: the pixel-art hull can arrive after the zoom has begun. */
  private clipWalk() {
    const ext = this.stage.exterior; if (!ext) return;
    const mounts = new Set<THREE.Object3D>(ext.hardpoints.map((h) => h.mount));
    const walk = (o: THREE.Object3D) => {
      if (mounts.has(o)) { for (const ch of o.children) if (ch.visible) { ch.visible = false; this.hidden.push(ch); } return; }
      const mm = (o as THREE.Mesh).material;
      if (mm) for (const m of Array.isArray(mm) ? mm : [mm]) if (m.clippingPlanes?.[0] !== this.clip) { this.clipped.push({ m, was: m.clippingPlanes }); m.clippingPlanes = [this.clip]; m.needsUpdate = true; }
      for (const ch of o.children) walk(ch);
    };
    walk(ext.root);
  }
  /** jump to the inside at once (tests, screenshots) */
  snap() { this.k = 1; this.pose(1); }

  // ---------------------------------------------------------------- the camera, the slice, the dim
  /** the RTS camera's pose between the colony view (0) and the pod (1): target, distance and yaw eased, its pitch rule */
  private pose(k: number) {
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const a = this.from, b = this.into;
    const tgt = a.target.clone().lerp(b.target, e);
    const dist = Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * e);
    let dy = b.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yaw = a.yaw + dy * e, p = this.stage.pitch(dist);
    this.cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(p) * dist, tgt.y + Math.sin(p) * dist, tgt.z + Math.cos(yaw) * Math.cos(p) * dist);
    this.cam.lookAt(tgt.x, tgt.y + 0.5, tgt.z); this.cam.updateMatrixWorld();
    // the slice comes down the hull from its top to the cabin floor through the middle of the zoom
    const s = Math.min(1, Math.max(0, (k - 0.12) / 0.66)), pod = this.stage.pod;
    this.clip.constant = pod.y + FLOOR_Y + 0.02 + (1 - s * s * (3 - 2 * s)) * 6.5;
    this.room.root.visible = s > 0.02;
  }
  /** the dim outside: a screen ellipse round the hull (and the far walls' tops) stays clear, the rest greys */
  private focus(post: Post) {
    const pod = this.stage.pod, box = new THREE.Box2(), v = new V();
    for (let i = 0; i < 16; i++) for (const y of [0, ROOM_H]) {
      const a = (i / 16) * Math.PI * 2;
      v.set(pod.x + Math.sin(a) * (HULL_R + 0.25), pod.y + FLOOR_Y + y, pod.z + Math.cos(a) * (HULL_R + 0.25)).project(this.cam);
      box.expandByPoint(new THREE.Vector2(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5));
    }
    const c = box.getCenter(new THREE.Vector2()), sz = box.getSize(new THREE.Vector2());
    post.focus.at.set(c.x, c.y, Math.max(0.05, sz.x * 0.5), Math.max(0.05, sz.y * 0.5));
    const e = Math.min(1, Math.max(0, (this.k - 0.3) / 0.6));
    post.focus.k = 0.9 * e * e * (3 - 2 * e);
  }

  // ---------------------------------------------------------------- the frame
  update(dt: number) {
    this.t += dt;
    const k0 = this.k, now = performance.now(), real = Math.min(0.6, (now - (this.lastNow || now)) / 1000); this.lastNow = now;
    // the zoom runs on the wall clock (a slow frame never stretches it)
    this.k = Math.min(1, Math.max(0, this.k + this.dir * Math.max(dt, real) / 1.25));
    if (this.k !== k0 || this.k < 1) this.pose(this.k);
    if (this.dir < 0 && this.k <= 0) { this.dir = 0; this.onLeave(); return; }
    if (this.dir >= 0) this.clipWalk();
    this.colliders(dt);
    this.room.stress = this.stress();
    if (!this.frozen) this.room.update(dt, this.t);
    // a failure shakes the view
    if (this.room.shake > 0.002) { this.pose(this.k); const a = this.room.shake; this.cam.position.add(new V((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a)); this.room.shake *= Math.exp(-dt * 7); if (this.room.shake <= 0.002) { this.room.shake = 0; this.pose(this.k); } }
    if (this.carry) { const c = this.carry; const lift = 0.25 + Math.sin(this.t * 6) * 0.03; c.obj.position.lerp(new V(c.at.x, c.y + lift, c.at.z), Math.min(1, dt * 16)); c.obj.rotation.y += (c.rot - c.obj.rotation.y) * Math.min(1, dt * 14); }
    // the gauge rolls toward the real happiness
    const h = this.home.happiness();
    this.joyT += dt;
    if (Math.abs(h - this.joyShown) > 0.05 || this.joyT < 1) { this.joyShown += (h - this.joyShown) * Math.min(1, dt * 4); this.paintJoy(); }
  }
  /** how hard the cabin is failing: an unhappy crew and a damaged hull make it break sooner and more often (0..2) */
  private stress() {
    const h = this.home.happiness(), pod = anyG(this.g).colony?.pod;
    const integ = pod && pod.maxHp ? Math.max(0, Math.min(1, pod.hp / pod.maxHp)) : 1;
    return Math.max(0, Math.min(1, (60 - h) / 60)) + (1 - integ);
  }
  /** QA: freeze the cabin's motion (physics, smoke, sparks) for a still frame */
  frozen = false;
  qaFreeze(on = true) { this.frozen = on; }
  /** QA: a failure now */
  qaBreak(kind: BreakKind) { return this.room.breaks.trigger(kind); }
  /** QA: run the cabin's motion for a while without drawing (60 steps a second) */
  qaAdvance(sec: number) { this.colliders(1 / 60); for (let t = 0; t < sec; t += 1 / 60) { this.t += 1 / 60; this.room.update(1 / 60, this.t); } }
  /** QA: move the camera in (dist m) over a cabin point (x, z) */
  qaZoom(dist: number, x = 0, z = 0) { const pod = this.stage.pod, at = this.room.root.localToWorld(new V(x, 0, z)); this.into.dist = dist; this.into.target.set(at.x, pod.y + FLOOR_Y - 0.4, at.z); this.pose(this.k); }
  render(post: Post, t: number) { this.focus(post); this.stage.render(post, t); }
  resize() { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }
  dispose() {
    if (PodInterior.current === this) PodInterior.current = null;
    this.engine.post.focus.k = 0;
    for (const q of this.clipped) { q.m.clippingPlanes = q.was; q.m.needsUpdate = true; }
    for (const o of this.hidden) o.visible = true;
    this.engine.renderer.localClippingEnabled = this.clipWas;
    this.stage.release();
    const cv = this.engine.canvas;
    cv.removeEventListener('pointermove', this.onMove); cv.removeEventListener('pointerdown', this.onDown); cv.removeEventListener('wheel', this.onWheel); cv.removeEventListener('contextmenu', this.noCtx);
    removeEventListener('keydown', this.onKey, true); removeEventListener('pointerup', this.onUp, true);
    cv.style.cursor = '';
    for (const v of this.views) v.dispose();
    this.ui.remove(); document.body.classList.remove('pod7-on');
    this.room.dispose();
  }
}
function heart(c: CanvasRenderingContext2D, x: number, y: number, s = 2) {
  const H = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  c.fillStyle = '#0a0b10'; H.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') c.fillRect(x + i * s - 1, y + j * s - 1, s + 2, s + 2); }));
  H.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') { c.fillStyle = j < 2 && i < 3 ? '#ff9a8a' : '#e0503e'; c.fillRect(x + i * s, y + j * s, s, s); } }));
}
const itemImgs = new Map<string, HTMLImageElement>();
function itemImg(id: string) { let im = itemImgs.get(id); if (!im) { im = new Image(); im.src = itemIcon(id, 32); itemImgs.set(id, im); } return im; }

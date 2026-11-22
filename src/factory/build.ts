// Build mode. B (or the dock's BUILD icon) enters the BLUEPRINT BUILD MODE (src/ui/build/bpmode.ts: a top-down blueprint of the
// world with a tray of buildings; Shift+B still opens the old construction planner, src/ui/build/menu.ts, as a fallback).
// A tray miniature (dragged or clicked) or a hotbar key (1-0) puts a building in hand: a holographic ghost snapped to the 1 m grid under the cursor (blue where it fits, red where it
// cannot go, with the reason and the bill of materials at the cursor), R to turn it, a grid drawn on the ground around
// it. Placing lays a CONSTRUCTION SITE (src/logistics/sites.ts): workers bring the materials and build it over time.
// Belts, pipes, walls, fences, dams and foundations are laid by dragging a path and go down at once (the pod's arm lays
// runs). X dismantles (full refund; a site is cancelled and its delivered materials returned). Blueprints copy a
// rectangle of machines and paste it elsewhere (turnable). The same pointer also assigns workers. On touch: tap to set
// the ghost, tap it again to build, drag to lay belts.
// In the blueprint mode a placed building or site is clicked to SELECT it (move, rotate, info, pause, dismantle float
// over it), dragged (or MOVE) to carry it elsewhere, turned a quarter in place (ROTATE); every placement drops in with
// a squash-and-stretch bounce and dust (bpmode.ts `drop`). Outside build mode a plain click on a machine opens its
// blueprint sheet (src/ui/build/sheet.ts).
import * as THREE from 'three';
import type { Factory, FBuilding } from './factory';
import { FDEFS, isBelt, isDrag, footW, footD, type FKind } from './defs';
import { modelFor, beltGeo } from './models';
import { machineMaterial } from './tex';
import { RECIPE } from './recipes';
import { gbufNone } from '../gfx/gbuf';
import type { Hotbar } from '../ui/build/hotbar';
import type { BuildMenu } from '../ui/build/menu';
import { buildingLock } from '../logistics/unlocks';
import { shapeOf } from '../logistics/catalog';
import { RAMPS } from '../art/palette';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';
import { play } from '../ui/build/juice';
const playTurn = () => play('turn', 1.1, 0.4);
import type { Job } from './workers';
import type { Creature } from '../game/creature';
import type { Site } from '../logistics/sites';
import type { BuildMode } from '../ui/build/bpmode';

export type Tool = 'place' | 'dismantle' | 'copy' | 'paste' | 'assign' | 'select' | 'move';
/** a placed building or a construction site (what the blueprint mode selects, moves and turns) */
export type Placed = FBuilding | Site;
export const isSiteT = (t: Placed): t is Site => (t as Site).need !== undefined && (t as Site).stage !== undefined;
export interface BlueprintPart { kind: FKind; dx: number; dz: number; r: number; recipe?: string }
export interface Blueprint { w: number; d: number; parts: BlueprintPart[] }
interface Ghost { kind: FKind; cx: number; cz: number; r: number; ok: boolean; why: string | null }
/** laid as a run, at once (no construction site) */
export const isRun = (k: FKind) => isDrag(k) || k === 'fence';
/** a hologram: additive phosphor light with scanlines climbing the model and a bright rim where it turns away */
function holoMaterial(col: number) {
  const U = { uTime: { value: 0 }, uCol: { value: new THREE.Color(col) } };
  const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vNw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 hw = modelMatrix * vec4(transformed, 1.0); vWp = hw.xyz; vNw = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uCol; varying vec3 vWp; varying vec3 vNw;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec3 vd = normalize(cameraPosition - vWp);
float fr = pow(1.0 - abs(dot(normalize(vNw), vd)), 2.2);
float scan = step(0.6, fract(vWp.y * 10.0 - uTime * 1.8));
float sweep = fract(vWp.y * 0.45 - uTime * 0.4);
float band = smoothstep(0.0, 0.05, sweep) * (1.0 - smoothstep(0.05, 0.16, sweep));
float top = max(0.0, normalize(vNw).y) * 0.18;
vec4 diffuseColor = vec4(uCol * (0.45 + fr * 1.1 + band * 1.2 + top), 0.12 + fr * 0.5 + scan * 0.07 + band * 0.4);`);
  };
  m.customProgramCacheKey = () => 'holo-ghost';
  (m as unknown as { __u: typeof U }).__u = U;
  return gbufNone(m);
}

export class Build {
  active = false;
  tool: Tool = 'place';
  kind: FKind | null = null;
  rot = 0;
  /** cursor cell and ground point */
  cell: [number, number] | null = null; ground: THREE.Vector3 | null = null;
  ghosts: Ghost[] = [];
  why: string | null = null;
  drag: { x: number; z: number; on: boolean; touch: boolean; sx: number; sy: number } | null = null;
  blueprint: Blueprint | null = null;
  pending: { c: Creature; job: Job; from?: FBuilding } | null = null;
  /** the touch two-tap: the cell last tapped */
  private tapAt: string | null = null;
  private meshes: THREE.Mesh[] = [];
  private okMat = machineMaterial(0, { ghost: true }); private badMat = machineMaterial(0, { ghost: true });
  private holoOk = holoMaterial(0x6f9fd8); private holoBad = holoMaterial(0xd8503e);
  private holos: THREE.Mesh[] = [];
  /** the planner and the quick-slots (set by the factory UI) */
  menu?: BuildMenu; hotbar?: Hotbar;
  /** the blueprint build mode (set by the factory UI) */
  bp?: BuildMode;
  /** the blueprint mode's selection, and a building or site being carried (MOVE) */
  selected: Placed | null = null;
  moving: { b: FBuilding | null; s: Site | null; kind: FKind; r0: number } | null = null;
  /** a press on a placed building: a drag carries it, a click selects it */
  private press: { t: Placed; x: number; y: number } | null = null;
  /** opens the node map (set by the factory UI) */
  onNodes?: () => void;
  /** the last key event this build mode used (game.ts skips its own handling of it) */
  private eaten: KeyboardEvent | null = null;
  ate(e: KeyboardEvent) { return this.eaten === e; }
  private grid: THREE.LineSegments; private foot: THREE.Mesh;
  private camDist = 0;
  onChange?: () => void;
  onInspect?: (b: FBuilding | null) => void;
  onDismiss?: () => void;

  constructor(readonly f: Factory) {
    (this.badMat as unknown as { onBeforeCompile: unknown }).onBeforeCompile = ((prev) => (sh: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => { prev.call(this.badMat, sh, r); (sh.uniforms.uGhost.value as THREE.Color).setHex(RAMPS.stampRed[3]); })(this.badMat.onBeforeCompile);
    this.badMat.customProgramCacheKey = () => 'fac-ghost-bad';
    // the good ghost reads blue under the hologram
    (this.okMat as unknown as { onBeforeCompile: unknown }).onBeforeCompile = ((prev) => (sh: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => { prev.call(this.okMat, sh, r); (sh.uniforms.uGhost.value as THREE.Color).setHex(0x7d9cc4); })(this.okMat.onBeforeCompile);
    this.okMat.customProgramCacheKey = () => 'fac-ghost-ok';
    const lm = gbufNone(new THREE.LineBasicMaterial({ color: RAMPS.sky[4], transparent: true, opacity: 0.55, depthWrite: false }));
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry(), lm); this.grid.frustumCulled = false; this.grid.visible = false; this.grid.renderOrder = 3;
    const fm = gbufNone(new THREE.MeshBasicMaterial({ color: RAMPS.sky[3], transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    this.foot = new THREE.Mesh(new THREE.BufferGeometry(), fm); this.foot.frustumCulled = false; this.foot.visible = false; this.foot.renderOrder = 3;
    this.grid.userData.bpSkip = true; this.foot.userData.bpSkip = true;
    f.render.group.add(this.grid, this.foot);
    addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    addEventListener('pointerdown', this.onDown, true);
    addEventListener('pointermove', this.onMove, true);
    addEventListener('pointerup', this.onUp, true);
    this.offKey = f.g.input.onKey((e) => this.onKey(e));
  }
  private offKey: () => void;
  dispose() { removeEventListener('wheel', this.onWheel, true); removeEventListener('pointerdown', this.onDown, true); removeEventListener('pointermove', this.onMove, true); removeEventListener('pointerup', this.onUp, true); this.offKey(); }
  get g() { return this.f.g; }

  // ------------------------------------------------------------------ modes
  open(kind: FKind | null = this.kind, tool: Tool = kind ? 'place' : 'select') {
    const g = this.g;
    if (!this.active) {
      this.active = true;
      (g as unknown as { setMode(m: { k: string }): void }).setMode({ k: 'factory' });
      this.onInspect?.(null);
      // the blueprint mode swoops the camera top-down; without it (tests) the old pull-back
      if (this.bp) this.bp.enter();
      else { this.camDist = g.cam.distGoal; g.cam.distGoal = Math.max(g.cam.distGoal, 15); sfx('open', 1, 0.6); }
    }
    if (this.moving && tool !== 'move') this.cancelMove();
    this.kind = kind; this.tool = tool; this.drag = null; this.tapAt = null; this.hoverKey = '';
    if (kind) this.selected = null;
    this.onChange?.();
  }
  /** Shift+B: the old construction planner (a fallback to the blueprint tray) */
  openMenu() { if (!this.active) this.open(null, 'select'); this.kind = null; this.tool = 'select'; this.clearGhosts(); this.menu?.open(); this.onChange?.(); }
  close() {
    if (!this.active) return;
    if (this.moving) this.cancelMove();
    this.active = false; this.kind = null; this.tool = 'place'; this.drag = null; this.pending = null; this.selected = null; this.press = null;
    this.menu?.close();
    this.clearGhosts(); this.ghosts = []; this.grid.visible = false; this.foot.visible = false;
    const g = this.g;
    if (g.mode.k === ('factory' as string)) (g as unknown as { setMode(m: { k: string }): void }).setMode({ k: 'normal' });
    if (this.bp) this.bp.exit();
    else { if (this.camDist) g.cam.distGoal = Math.min(g.cam.distGoal, Math.max(this.camDist, 6.5)); sfx('close', 1, 0.5); }
    this.f.render.hover = null; this.f.render.sel = null;
    this.onChange?.();
  }
  /** B / the dock's BUILD icon: into the blueprint mode, or out of it */
  toggle() { if (this.active) this.close(); else this.open(null, 'select'); }
  choose(kind: FKind) {
    const def = FDEFS[kind]; if (!def) return;
    const lk = buildingLock(this.g, kind);
    if (!lk.ok) { sfx('deny'); toast(`<b>${def.name}</b> is locked: ${lk.why.toLowerCase()}`, 'warn', 2000); return; }
    this.menu?.close();
    this.open(kind, 'place'); sfx('click');
  }
  /** a building dragged out of the tray: in hand without a sound or a toast (the tray checked the lock) */
  take(kind: FKind) { if (!buildingLock(this.g, kind).ok) return; this.open(kind, 'place'); }
  /** the pointer is back over the tray: no ghost */
  hideGhost() { this.cell = null; this.ground = null; this.ghosts = []; this.why = null; this.clearGhosts(); this.grid.visible = false; this.foot.visible = false; this.hoverKey = ''; }
  /** released over the map: build what is in hand there */
  dropHere() { if (this.ghosts.length) this.commit(); }
  /** put down what is in hand */
  drop() { if (this.moving) return; this.kind = null; this.tool = 'select'; this.ghosts = []; this.clearGhosts(); this.onChange?.(); }
  /** keys build mode owns while it is open (game.ts asks before its own handling) */
  wantsKey(k: string) { return this.active && /^[0-9]$/.test(k); }
  setTool(t: Tool) {
    if ((t === 'copy' || t === 'paste') && !this.g.run.skills.has('blueprint')) { sfx('deny'); toast('Blueprints need the <b>Blueprint Office</b> skill', 'warn', 1800); return; }
    if (t === 'paste' && !this.blueprint) { toast('Copy a blueprint first: drag a box over some machines', 'warn', 1800); this.open(null, 'copy'); return; }
    this.open(t === 'place' ? this.kind : null, t);
  }
  /** a worker's job wants a target: the next click picks it */
  assign(c: Creature, job: Job) { this.pending = { c, job }; this.open(null, 'assign'); toast(job === 'mine' ? 'Click a seam for it to mine' : job === 'haul' ? 'Click the building it should haul FROM' : job === 'pen' ? 'Click a breeding pen' : 'Click the machine it should work', 'info', 2600); }

  // ------------------------------------------------------------------ input
  private canvasEv(e: PointerEvent) { return e.target === this.g.engine.canvas; }
  private onDown = (e: PointerEvent) => {
    if (!this.canvasEv(e) || !(this.g as unknown as { act: boolean }).act) return;
    const g = this.g;
    if (!this.active) {
      // outside build mode: Shift-click on a machine opens its inspection form (a tap does, on touch: see onUp)
      if (e.pointerType === 'touch') { this.tap = { x: e.clientX, y: e.clientY, t: performance.now() }; return; }
      // a form is open: a click picks another machine or puts the paperwork away
      if (g.mode.k === ('factory' as string) && e.button === 0) {
        const b = this.pick(e.clientX, e.clientY);
        if (b) this.onInspect?.(b); else this.onDismiss?.();
        e.stopPropagation(); e.preventDefault(); return;
      }
      // V7: a plain click on a machine (nothing else under the pointer, nothing in hand) opens its blueprint sheet
      if (e.button === 0 && g.mode.k === 'normal' && (e.shiftKey || this.freeClick(e.clientX, e.clientY))) {
        const b = e.shiftKey ? this.pick(e.clientX, e.clientY) : this.pickStrict(e.clientX, e.clientY);
        if (b) { this.onInspect?.(b); this.f.render.sel = b; e.stopPropagation(); e.preventDefault(); }
      }
      return;
    }
    e.stopPropagation(); e.preventDefault();
    // a click in the world while the planner is up puts the planner away
    if (this.menu?.isOpen) { this.menu.close(); this.onChange?.(); return; }
    if (e.button === 2) { this.back(); return; }
    if (e.button !== 0) return;
    this.hoverAt(e.clientX, e.clientY);
    // the blueprint mode: a press on a placed building or site selects it, a drag carries it
    if (this.bp && this.tool === 'select' && !this.kind && e.pointerType !== 'touch') {
      const t = this.pickAny(e.clientX, e.clientY);
      if (t) { this.press = { t, x: e.clientX, y: e.clientY }; return; }
    }
    const touch = e.pointerType === 'touch';
    this.drag = { x: this.cell?.[0] ?? 0, z: this.cell?.[1] ?? 0, on: false, touch, sx: e.clientX, sy: e.clientY };
  };
  private onMove = (e: PointerEvent) => {
    if (this.active && this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 8) {
      // dragging a placed building: pick it up and carry it under the pointer
      const t = this.press.t; this.press = null;
      this.pickUp(t, true);
    }
    if (!this.active || !this.canvasEv(e) && !this.drag && !this.carryDrag) return;
    if (this.drag && Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 8) this.drag.on = true;
    if (this.drag?.touch && !(this.kind && isRun(this.kind)) && this.tool !== 'copy') return;
    this.hoverAt(e.clientX, e.clientY);
  };
  private tap: { x: number; y: number; t: number } | null = null;
  private onUp = (e: PointerEvent) => {
    if (!this.active && this.tap && e.pointerType === 'touch') {
      const t = this.tap; this.tap = null;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10 && performance.now() - t.t < 400 && (this.g.mode.k === 'normal' || this.g.mode.k === ('factory' as string))) { const b = this.pick(e.clientX, e.clientY); if (b) { this.onInspect?.(b); this.f.render.sel = b; } else if (this.g.mode.k === ('factory' as string)) this.onDismiss?.(); }
      return;
    }
    if (this.active && e.button === 0 && this.press) {
      // a click on a placed building: select it (again: deselect)
      const t = this.press.t; this.press = null;
      this.selected = this.selected === t ? null : t;
      this.f.render.sel = null;
      sfx('click', 1.1, 0.4);
      e.stopPropagation(); this.onChange?.();
      return;
    }
    if (this.active && e.button === 0 && this.carryDrag && this.moving) {
      // released after dragging a placed building: set it down here
      this.carryDrag = false; e.stopPropagation();
      this.hoverAt(e.clientX, e.clientY, true);
      this.commit();
      return;
    }
    if (!this.active || !this.drag || e.button !== 0) return;
    const d = this.drag; this.drag = null;
    e.stopPropagation();
    if (d.touch && d.on && !(this.kind && isRun(this.kind)) && this.tool !== 'copy') return; // a pan, not a tap
    this.hoverAt(e.clientX, e.clientY);
    this.click(e.clientX, e.clientY, d, e.shiftKey);
  };
  private onKey(e: KeyboardEvent) {
    if (!this.active || !(this.g as unknown as { act: boolean }).act || e.ctrlKey || e.metaKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const eat = () => { this.eaten = e; };
    if (this.menu?.isOpen && this.menu.key(k)) { eat(); return; }
    if (/^[0-9]$/.test(k)) { eat(); if (!e.repeat) this.hotbar?.use((Number(k) + 9) % 10); return; }
    if (k === 'Escape') {
      // one step back at a time: the building in hand, the planner, then build mode itself (game.ts)
      if (this.moving || this.kind || this.tool !== 'select' || this.selected) { eat(); this.back(true); return; }
      if (this.menu?.isOpen) { eat(); this.menu.close(); this.onChange?.(); return; }
      return;
    }
    if (k === 'b') { eat(); if (e.shiftKey && !this.menu?.isOpen) this.openMenu(); else this.close(); return; }
    if (k === 'Delete' && this.selected) { eat(); this.dismantle(this.selected); return; }
    if (k === 'm' && this.selected) { eat(); this.pickUp(this.selected); return; }
    if (k === 'r') { eat(); this.g.input.keys.delete('r'); if (!e.repeat) this.rotate(); }
    else if (k === 'x') { eat(); this.menu?.close(); this.setTool(this.tool === 'dismantle' ? 'select' : 'dismantle'); }
    else if (k === 'y') { eat(); this.menu?.close(); this.setTool('copy'); }
    else if (k === 'u') { eat(); this.menu?.close(); this.setTool('paste'); }
  }
  rotate() {
    if (!this.kind && !this.moving && this.selected && this.tool === 'select') { this.turnSelected(); return; }
    this.hoverKey = ''; this.rot = (this.rot + 1) & 3; if (this.tool === 'paste' && this.blueprint) this.blueprint = turn(this.blueprint);
    if (this.bp) playTurn(); else sfx('click', 1.3, 0.5);
    this.refresh();
  }
  /** right-click / Escape: one step back (the carried building goes home, the hand empties, the selection clears, then
   *  build mode closes on a right-click) */
  private back(esc = false) {
    if (this.moving) { this.cancelMove(); return; }
    if (this.tool !== 'select' || this.kind) { this.kind = null; this.tool = 'select'; this.pending = null; this.ghosts = []; this.clearGhosts(); this.onChange?.(); sfx('click', 0.8, 0.4); return; }
    if (this.selected) { this.selected = null; this.onChange?.(); return; }
    if (!esc) this.close();
  }
  /** the wheel turns what is in hand (else it zooms, as always) */
  private onWheel = (e: WheelEvent) => {
    if (!this.active || e.target !== this.g.engine.canvas || !(this.kind || this.moving) || this.tool === 'copy') return;
    e.preventDefault(); e.stopPropagation();
    const now = performance.now(); if (now - this.wheelT < 110) return; this.wheelT = now;
    if (e.deltaY < 0) { this.rot = (this.rot + 2) & 3; }
    this.rotate();
  };
  private wheelT = 0;
  /** a drag that picked a placed building up (released: it is set down) */
  private carryDrag = false;
  /** touch: build the ghost where it stands */
  confirm() { if (this.ghosts.length) this.commit(); }

  // ------------------------------------------------------------------ picking
  pick(mx: number, my: number): FBuilding | null {
    const g = this.g;
    let best: FBuilding | null = null, bs = 1e9;
    for (const b of this.f.buildings) {
      if (isBelt(b.kind) || b.kind === 'found') continue;
      const h = b.def.h;
      const [sx, sy, ok] = g.screenOf(b.x, b.y + h * 0.45, b.z); if (!ok) continue;
      const [, sy2] = g.screenOf(b.x, b.y + h * 0.45 + Math.max(b.fw, b.fd) * 0.5, b.z);
      const rad = Math.max(14, Math.abs(sy - sy2) * 1.1), d = Math.hypot(sx - mx, sy - my);
      if (d < rad && d / rad < bs) { bs = d / rad; best = b; }
    }
    if (best) return best;
    const p = g.groundAt(mx, my); if (!p) return null;
    return this.f.at(Math.floor(p.x), Math.floor(p.z)) ?? this.f.foundAt(Math.floor(p.x), Math.floor(p.z));
  }
  /** a tight pick for a plain click in normal play: the building's own cells, or its body on screen */
  pickStrict(mx: number, my: number): FBuilding | null {
    const g = this.g, p = g.groundAt(mx, my);
    if (p) { const b = this.f.at(Math.floor(p.x), Math.floor(p.z)); if (b && !isBelt(b.kind) && b.kind !== 'found') return b; }
    let best: FBuilding | null = null, bs = 1e9;
    for (const b of this.f.buildings) {
      if (isBelt(b.kind) || b.kind === 'found' || b.def.h < 1.2) continue;
      const [sx, sy, ok] = g.screenOf(b.x, b.y + b.def.h * 0.55, b.z); if (!ok) continue;
      const [, sy2] = g.screenOf(b.x, b.y, b.z);
      const rad = Math.max(10, Math.abs(sy - sy2) * 0.8), d = Math.hypot(sx - mx, sy - my);
      if (d < rad && d < bs) { bs = d; best = b; }
    }
    return best;
  }
  /** a plain click is ours when no creature, colony arm or drone wants it */
  private freeClick(mx: number, my: number) {
    const g = this.g as unknown as { colony?: { ctl?: { k: string } }; pickCreature?(x: number, y: number): unknown };
    if (g.colony?.ctl && g.colony.ctl.k !== 'rts') return false;
    if (g.pickCreature?.(mx, my)) return false;
    return true;
  }
  /** a placed building or a construction site under the pointer (the blueprint mode's selection) */
  pickAny(mx: number, my: number): Placed | null {
    const p = this.g.groundAt(mx, my);
    if (p && this.f.sites) { const s = this.f.sites.siteAt(Math.floor(p.x), Math.floor(p.z)); if (s) return s; }
    return this.pickStrict(mx, my);
  }
  private hoverKey = ''; private hoverT = 0;
  hoverAt(mx: number, my: number, force = false) {
    // only when something moved (or twice a second, for costs and validity)
    const now = performance.now(), key = `${mx}|${my}|${this.rot}|${this.tool}|${this.kind}|${this.drag?.on ? this.drag.x + ',' + this.drag.z : ''}|${this.f.buildings.length}`;
    if (!force && key === this.hoverKey && now - this.hoverT < 500) return;
    this.hoverKey = key; this.hoverT = now;
    const p = this.g.groundAt(mx, my);
    this.ground = p;
    this.cell = p ? [Math.floor(p.x), Math.floor(p.z)] : null;
    const R = this.f.render;
    R.hover = this.tool === 'dismantle' || this.tool === 'select' || this.tool === 'assign' ? (this.bp ? this.pickStrict(mx, my) : this.pick(mx, my)) : null;
    this.refresh();
  }
  /** ghost footprints for the current tool */
  refresh() {
    const f = this.f;
    this.ghosts = [];
    this.why = null;
    if (!this.cell) { this.drawGhosts(); return; }
    const [x, z] = this.cell;
    if (this.tool === 'place' && this.kind) {
      const def = FDEFS[this.kind];
      const cells = this.drag?.on && isRun(this.kind) ? this.path(this.drag.x, this.drag.z, x, z, this.kind) : [[x, z, this.rot]] as [number, number, number][];
      for (const [cx0, cz0, r] of cells) {
        const w = footW(def, r), d = footD(def, r);
        const cx = isRun(this.kind) && this.drag?.on ? cx0 : cx0 - Math.floor((w - 1) / 2), cz = isRun(this.kind) && this.drag?.on ? cz0 : cz0 - Math.floor((d - 1) / 2);
        const why = isRun(this.kind) || !f.sites ? f.why(this.kind, cx, cz, r) : f.sites.why(this.kind, cx, cz, r);
        this.ghosts.push({ kind: this.kind, cx, cz, r, ok: !why, why });
        if (why && !this.why) this.why = why;
      }
      // the whole run must be affordable
      if (this.ghosts.length > 1) { const n = this.ghosts.filter((g) => g.ok).length; for (const [k, v] of Object.entries(def.cost)) if (f.count(k) < (v ?? 0) * n) { this.why = `Needs ${(v ?? 0) * n} ${k.replace('_', ' ')} for the run`; } }
    } else if (this.tool === 'move' && this.moving) {
      // carrying a placed building: where it would go, judged as if it were not standing where it stands now
      const mv = this.moving, def = FDEFS[mv.kind], w = footW(def, this.rot), d = footD(def, this.rot);
      const cx = x - Math.floor((w - 1) / 2), cz = z - Math.floor((d - 1) / 2);
      const why = this.withoutSelf(() => f.why(mv.kind, cx, cz, this.rot, true));
      this.ghosts.push({ kind: mv.kind, cx, cz, r: this.rot, ok: !why, why });
      this.why = why;
    } else if (this.tool === 'paste' && this.blueprint) {
      const bp = this.blueprint;
      for (const p of bp.parts) {
        const cx = x + p.dx - Math.floor(bp.w / 2), cz = z + p.dz - Math.floor(bp.d / 2);
        const why = f.why(p.kind, cx, cz, p.r);
        this.ghosts.push({ kind: p.kind, cx, cz, r: p.r, ok: !why, why });
        if (why && !this.why) this.why = why;
      }
    } else if (this.tool === 'copy' && this.drag?.on) {
      this.why = null;
    }
    this.drawGhosts();
  }
  /** an L-shaped run from (x0,z0) to (x1,z1): the long leg first; belts face along the way they go */
  private path(x0: number, z0: number, x1: number, z1: number, kind: FKind): [number, number, number][] {
    const out: [number, number, number][] = [];
    if (kind === 'found') {
      // a floor: fill the rectangle in 2 m slabs
      const sx = Math.sign(x1 - x0) || 1, sz = Math.sign(z1 - z0) || 1;
      for (let z = z0; sz > 0 ? z <= z1 : z >= z1; z += 2 * sz) for (let x = x0; sx > 0 ? x <= x1 : x >= x1; x += 2 * sx) out.push([x, z, 0]);
      return out.slice(0, 64);
    }
    const dx = x1 - x0, dz = z1 - z0, firstX = Math.abs(dx) >= Math.abs(dz);
    const dirOf = (ux: number, uz: number) => (ux === 1 ? 3 : ux === -1 ? 1 : uz === 1 ? 0 : 2);
    let x = x0, z = z0;
    const legs: [number, number, number][] = firstX ? [[Math.sign(dx), 0, Math.abs(dx)], [0, Math.sign(dz), Math.abs(dz)]] : [[0, Math.sign(dz), Math.abs(dz)], [Math.sign(dx), 0, Math.abs(dx)]];
    for (const [ux, uz, n] of legs) {
      if (!n) continue;
      for (let i = 0; i < n; i++) { out.push([x, z, dirOf(ux, uz)]); x += ux; z += uz; }
    }
    const last = out.length ? out[out.length - 1][2] : this.rot;
    out.push([x, z, kind === 'wall' || kind === 'dam' ? last : last]);
    // walls and dams do not care which way they face, but keep a straight run's look
    if (kind === 'wall' || kind === 'dam') for (const o of out) o[2] = o[2] === 1 || o[2] === 3 ? 1 : 0;
    return out.slice(0, 96);
  }
  private clearGhosts() { for (const m of this.meshes) m.visible = false; for (const m of this.holos) m.visible = false; }
  private drawGhosts() {
    const f = this.f, R = f.g.region;
    while (this.meshes.length < this.ghosts.length) { const m = new THREE.Mesh(new THREE.BufferGeometry(), this.okMat); m.renderOrder = 4; m.frustumCulled = false; f.render.group.add(m); this.meshes.push(m); }
    this.meshes.forEach((m, i) => {
      const gh = this.ghosts[i];
      if (!gh) { m.visible = false; return; }
      const def = FDEFS[gh.kind], w = footW(def, gh.r), d = footD(def, gh.r);
      const geo = isBelt(gh.kind) ? beltGeo('straight', gh.kind === 'pipe') : (() => { const sh = shapeOf(gh.kind); return modelFor(sh.key, def.model, sh.hook).base; })();
      if (m.geometry !== geo) m.geometry = geo;
      m.material = gh.ok ? this.okMat : this.badMat;
      m.userData.bpKind = gh.ok ? 3 : 4;
      const y = isBelt(gh.kind) || gh.kind === 'splitter' || gh.kind === 'merger' ? Math.max(R.water - 0.1, R.heightAt(gh.cx + 0.5, gh.cz + 0.5)) : def.extract === 'water' ? R.water - 0.05 : f.levelFor(gh.cx, gh.cz, w, d);
      m.position.set(gh.cx + w / 2, y + 0.02, gh.cz + d / 2);
      m.rotation.set(0, this.ghosts.length === 1 ? this.gYaw(-gh.r * Math.PI / 2) : -gh.r * Math.PI / 2, 0);
      m.visible = true;
      // the hologram over the blueprint body
      let hm = this.holos[i];
      if (!hm) { hm = this.holos[i] = new THREE.Mesh(geo, this.holoOk); hm.renderOrder = 5; hm.frustumCulled = false; hm.userData.bpSkip = true; f.render.group.add(hm); }
      if (hm.geometry !== geo) hm.geometry = geo;
      hm.material = gh.ok ? this.holoOk : this.holoBad;
      hm.position.copy(m.position); hm.rotation.copy(m.rotation); hm.scale.setScalar(1.012);
      hm.visible = this.ghosts.length <= 24;
    });
    for (let i = this.ghosts.length; i < this.holos.length; i++) this.holos[i].visible = false;
    // the grid around the cursor, and the footprint (or the copy box)
    const show = !!this.cell && !this.bp?.on;
    this.grid.visible = show; this.foot.visible = show && (this.ghosts.length > 0 || this.tool === 'copy' && !!this.drag?.on);
    if (!show) return;
    const [x, z] = this.cell!, pts: number[] = [], h = (X: number, Z: number) => Math.max(R.water - 0.12, R.groundSmooth(X, Z)) + 0.04;
    const E = 6;
    for (let k = -E; k <= E + 1; k++) {
      for (let j = -E; j <= E; j++) {
        const fade = Math.max(Math.abs(k - 0.5), Math.abs(j + 0.5)) < E - 1;
        if (!fade && (k + j) % 2) continue;
        pts.push(x + k, h(x + k, z + j), z + j, x + k, h(x + k, z + j + 1), z + j + 1);
        pts.push(x + j, h(x + j, z + k), z + k, x + j + 1, h(x + j + 1, z + k), z + k);
      }
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid.geometry.dispose(); this.grid.geometry = gg;
    // footprint fill
    const fp: number[] = [];
    const quad = (x0: number, z0: number, x1: number, z1: number) => { const y = (X: number, Z: number) => h(X, Z) + 0.01; fp.push(x0, y(x0, z0), z0, x1, y(x1, z0), z0, x1, y(x1, z1), z1, x0, y(x0, z0), z0, x1, y(x1, z1), z1, x0, y(x0, z1), z1); };
    if (this.tool === 'copy' && this.drag?.on) { const [a, b] = this.rect(); quad(a[0], a[1], b[0] + 1, b[1] + 1); }
    else for (const gh of this.ghosts) { const def = FDEFS[gh.kind]; quad(gh.cx, gh.cz, gh.cx + footW(def, gh.r), gh.cz + footD(def, gh.r)); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    this.foot.geometry.dispose(); this.foot.geometry = fg;
    (this.foot.material as THREE.MeshBasicMaterial).color.setHex(this.why || this.tool === 'dismantle' ? RAMPS.stampRed[3] : RAMPS.sky[3]);
  }
  private rect(): [[number, number], [number, number]] {
    const d = this.drag!, c = this.cell!;
    return [[Math.min(d.x, c[0]), Math.min(d.z, c[1])], [Math.max(d.x, c[0]), Math.max(d.z, c[1])]];
  }

  // ------------------------------------------------------------------ actions
  private click(mx: number, my: number, d: { x: number; z: number; on: boolean; touch: boolean }, shift: boolean) {
    const f = this.f;
    if (this.tool === 'select' && this.bp) { if (this.selected) { this.selected = null; this.onChange?.(); } return; }
    if (this.tool === 'select' || this.tool === 'assign' && !this.pending) { const b = this.pick(mx, my); f.render.sel = b; this.onInspect?.(b); if (b) sfx('click', 1, 0.6); return; }
    if (this.tool === 'dismantle') {
      const gp = this.g.groundAt(mx, my), site = gp && f.sites ? f.sites.siteAt(Math.floor(gp.x), Math.floor(gp.z)) : null;
      if (site) { f.sites.cancel(site); toast(`Site cancelled: <b>${site.def.name}</b> (delivered materials returned)`, 'info', 1600); this.refresh(); return; }
      const b = this.pick(mx, my);
      if (!b) return;
      f.remove(b, true);
      f.g.fx.burst(b.x, b.y + 0.5, b.z, 16, RAMPS.steel[5], { speed: 2, up: 2.5, size: 3, life: 0.6, grav: 8 });
      sfx('crack', 1.2, 0.6);
      toast(`Dismantled: <b>${b.def.name}</b> (materials returned)`, 'info', 1400);
      this.refresh();
      return;
    }
    if (this.tool === 'assign' && this.pending) { this.assignClick(mx, my); return; }
    if (this.tool === 'copy') {
      if (!d.on || !this.cell) return;
      const [a, b] = this.rect(), parts: BlueprintPart[] = [];
      const seen = new Set<number>();
      for (const o of f.buildings) {
        if (seen.has(o.id)) continue;
        if (o.cx >= a[0] && o.cz >= a[1] && o.cx + o.fw - 1 <= b[0] && o.cz + o.fd - 1 <= b[1]) { seen.add(o.id); parts.push({ kind: o.kind, dx: o.cx - a[0], dz: o.cz - a[1], r: o.r, recipe: o.auto ? undefined : o.recipe?.id }); }
      }
      if (!parts.length) { toast('Nothing in that box to copy', 'warn', 1400); return; }
      this.blueprint = { w: b[0] - a[0] + 1, d: b[1] - a[1] + 1, parts };
      toast(`Blueprint drawn: <b>${parts.length}</b> pieces &middot; [U] to paste, [R] to turn`, 'good', 2400);
      sfx('done', 1, 0.5);
      this.tool = 'paste'; this.onChange?.(); this.refresh();
      return;
    }
    if (this.tool === 'place' && this.kind && d.touch && !d.on) {
      // two taps: the first sets the ghost, the second builds it
      const key = this.cell ? this.cell.join(',') + ':' + this.rot : '';
      if (this.tapAt !== key) { this.tapAt = key; sfx('click', 1.4, 0.4); return; }
      this.tapAt = null;
    }
    // the tool stays in hand after a build, as in the field manuals: right-click or Escape puts it down
    this.commit();
    void shift;
  }
  /** build every valid ghost */
  private commit() {
    const f = this.f;
    if (!this.ghosts.length) return;
    if (this.tool === 'move' && this.moving) { this.commitMove(); return; }
    if (this.why && this.ghosts.length === 1) { sfx('deny'); toast(this.why, 'warn', 1500); return; }
    let n = 0;
    const bp = this.tool === 'paste' ? this.blueprint : null;
    let sites = 0;
    this.ghosts.forEach((gh, i) => {
      if (!gh.ok) return;
      if (!isRun(gh.kind) && f.sites) {
        // a machine: stake out a construction site; the crew brings the materials and builds it
        const s = f.sites.place(gh.kind, gh.cx, gh.cz, gh.r);
        if (!s) return;
        n++; sites++;
        this.bp?.drop({ site: s });
        const rid = bp?.parts[i]?.recipe; if (rid && RECIPE[rid]) f.sites.onDone = ((prev) => (st, b) => { prev?.(st, b); if (st === s) f.setRecipe(b, RECIPE[rid]); })(f.sites.onDone);
        if (!this.bp) f.g.fx.burst(gh.cx + s.fw / 2, s.y + 0.2, gh.cz + s.fd / 2, 8, RAMPS.sky[4], { speed: 1.2, up: 1.2, size: 2.4, life: 0.5, grav: 4 });
        return;
      }
      const b = f.place(gh.kind, gh.cx, gh.cz, gh.r);
      if (!b) return;
      n++;
      const rid = bp?.parts[i]?.recipe; if (rid && RECIPE[rid]) f.setRecipe(b, RECIPE[rid]);
      // a run drops in a few of its pieces (not a puff per cell)
      if (this.bp && (this.ghosts.length <= 3 || i % 4 === 0 || i === this.ghosts.length - 1)) { b.rise = 1; this.bp.drop({ b }); }
      else f.g.fx.burst(b.x, b.y + 0.3, b.z, 8, RAMPS.straw[4], { speed: 1.4, up: 1.6, size: 2.6, life: 0.5, grav: 6 });
    });
    if (n && !this.bp) { sfx(sites ? 'click' : 'build', sites ? 0.7 : 1, 0.7); f.g.cam.shake(0.05, 0.12); }
    if (sites && !this.bp) toast(sites > 1 ? `<b>${sites}</b> construction sites staked out` : `Site staked out: <b>${FDEFS[this.ghosts.find((g) => g.ok)!.kind].name}</b> · the crew will bring the materials`, 'info', 1800);
    else if (this.why && !n) { sfx('deny'); toast(this.why, 'warn', 1500); }
    this.refresh();
  }

  // ------------------------------------------------------------------ the blueprint mode: carry, turn, take down
  /** judge a spot as if the building being carried were not standing where it stands */
  private withoutSelf<T>(fn: () => T): T {
    const mv = this.moving; if (!mv) return fn();
    const f = this.f, N = f.N, t: Placed = mv.b ?? mv.s!, id = mv.b ? mv.b.id : -mv.s!.id, freed: number[] = [];
    for (let j = 0; j < t.fd; j++) for (let i = 0; i < t.fw; i++) { const k = (t.cz + j) * N + t.cx + i; if (f.grid[k] === id) { f.grid[k] = 0; freed.push(k); } }
    try { return fn(); } finally { for (const k of freed) f.grid[k] = id; }
  }
  /** pick a placed building or site up: it follows the pointer as a hologram until it is set down */
  pickUp(t: Placed, drag = false) {
    if (!this.active) return;
    const site = isSiteT(t);
    this.moving = { b: site ? null : t as FBuilding, s: site ? t as Site : null, kind: t.kind, r0: t.r };
    this.selected = null; this.press = null;
    this.kind = null; this.tool = 'move'; this.rot = t.r; this.hoverKey = '';
    this.carryDrag = drag;
    if (!site) this.f.render.sel = t as FBuilding;
    play('lift', 1, 0.5);
    this.hoverAt(this.g.input.mx, this.g.input.my, true);
    this.onChange?.();
  }
  /** put it back where it was */
  cancelMove() {
    const mv = this.moving; if (!mv) return;
    this.moving = null; this.carryDrag = false;
    this.tool = 'select'; this.kind = null; this.ghosts = []; this.clearGhosts();
    this.f.render.sel = null;
    this.selected = mv.b ?? mv.s;
    play('drop', 1.3, 0.25);
    this.onChange?.();
  }
  private commitMove() {
    const mv = this.moving!, gh = this.ghosts[0];
    if (!gh || !gh.ok) { play('deny', 1, 0.45); toast(gh?.why ?? 'It cannot go there', 'warn', 1400); if (this.carryDrag) this.cancelMove(); return; }
    const t: Placed = mv.b ?? mv.s!;
    this.moving = null; this.carryDrag = false; this.f.render.sel = null;
    this.tool = 'select'; this.kind = null; this.ghosts = []; this.clearGhosts();
    if (gh.cx === t.cx && gh.cz === t.cz && gh.r === t.r) { this.selected = t; this.bp?.drop({ ...(mv.b ? { b: mv.b } : { site: mv.s! }), moved: true }); this.onChange?.(); return; }
    const moved = this.relocate(t, gh.cx, gh.cz, gh.r);
    if (moved) { this.selected = moved; this.bp?.drop(isSiteT(moved) ? { site: moved, moved: true } : { b: moved, moved: true }); }
    else { play('deny', 1, 0.45); this.selected = t; }
    this.onChange?.();
  }
  /** turn the selection a quarter in place (the first way round that fits) */
  turnSelected() {
    const t = this.selected; if (!t) return;
    const def = FDEFS[t.kind], cx0 = t.cx + t.fw / 2, cz0 = t.cz + t.fd / 2;
    const site = isSiteT(t);
    this.moving = { b: site ? null : t as FBuilding, s: site ? t as Site : null, kind: t.kind, r0: t.r };
    let best: [number, number, number] | null = null;
    for (let k = 1; k < 4 && !best; k++) {
      const r = (t.r + k) & 3, w = footW(def, r), d = footD(def, r), cx = Math.round(cx0 - w / 2), cz = Math.round(cz0 - d / 2);
      if (!this.withoutSelf(() => this.f.why(t.kind, cx, cz, r, true))) best = [cx, cz, r];
    }
    this.moving = null;
    if (!best) { play('deny', 1, 0.45); toast('No room to turn it here', 'warn', 1200); return; }
    const moved = this.relocate(t, best[0], best[1], best[2]);
    if (moved) { this.selected = moved; playTurn(); this.bp?.drop(isSiteT(moved) ? { site: moved, moved: true } : { b: moved, moved: true }); }
    this.onChange?.();
  }
  /** take the selection down: a building's bill comes back, a site's delivered materials too */
  dismantle(t: Placed) {
    const f = this.f;
    if (isSiteT(t)) { f.sites.cancel(t); play('clink', 0.9, 0.5); }
    else {
      f.remove(t as FBuilding, true);
      f.g.fx.burst(t.x, t.y + 0.5, t.z, 16, RAMPS.steel[5], { speed: 2, up: 2.5, size: 3, life: 0.6, grav: 8 });
      play('thud', 1.3, 0.45); sfx('crack', 1.2, 0.4);
    }
    if (this.selected === t) this.selected = null;
    this.onChange?.();
  }
  /** move a building (state, store, operator and node-map wires kept) or a site (deliveries and work kept) */
  private relocate(t: Placed, cx: number, cz: number, r: number): Placed | null {
    const f = this.f, g = this.g;
    if (isSiteT(t)) {
      const got = { ...t.got }, work = t.work;
      f.sites.cancel(t);
      for (const [id, n] of Object.entries(got)) if (n) f.take(id, n);
      const s = f.sites.restore(t.kind, cx, cz, r, got, work);
      if (!s) { const back = f.sites.restore(t.kind, t.cx, t.cz, t.r, got, work); return back; }
      return s;
    }
    const b = t as FBuilding, L = (g as unknown as { logistics?: { routes: { from: string; to: string }[]; sync(force?: boolean): void } }).logistics;
    const oldId = 'b:' + b.id;
    const st = { recipe: b.recipe, auto: b.auto, inBuf: new Map(b.inBuf), outBuf: new Map(b.outBuf), priority: b.priority, on: b.on, hp: b.hp, op: b.operator, items: [...b.items], prefab: (b as unknown as { prefab?: string }).prefab };
    // a container's contents go with it (src/inv/storage.ts reloads a saved container at the new spot)
    const storage = (g as unknown as { storage?: { containerOf(b: unknown): { save(): unknown } | null; pending?: Map<string, unknown> } }).storage;
    const box = storage?.containerOf(b) ?? null;
    if (box && storage?.pending) storage.pending.set(`${b.kind}@${cx},${cz}`, box.save());
    const store = box ? null : new Map(b.store);
    const wires = L ? L.routes.filter((x) => x.from === oldId || x.to === oldId) : [];
    f.remove(b, false);
    let nb = f.place(b.kind, cx, cz, r, true);
    if (!nb) nb = f.place(b.kind, b.cx, b.cz, b.r, true);
    if (!nb) { f.refund(b.def.cost); return null; }
    nb.rise = 1;
    if (st.recipe && nb.def.station) f.setRecipe(nb, st.recipe);
    nb.auto = st.auto; nb.priority = st.priority; nb.on = st.on; nb.hp = st.hp;
    for (const [id, n] of st.inBuf) nb.inBuf.set(id, n);
    for (const [id, n] of st.outBuf) nb.outBuf.set(id, n);
    if (store) for (const [id, n] of store) nb.store.set(id, n);
    if (st.items.length && isBelt(nb.kind)) nb.items.push(...st.items);
    if (st.prefab) (nb as unknown as { prefab?: string }).prefab = st.prefab;
    if (st.op && !st.op.dead) f.workers.assign(st.op, 'operate', nb);
    if (L) {
      const newId = 'b:' + nb.id;
      for (const w of wires) { if (w.from === oldId) w.from = newId; if (w.to === oldId) w.to = newId; if (!L.routes.includes(w)) L.routes.push(w); }
      L.sync(true);
    }
    return nb;
  }
  private assignClick(mx: number, my: number) {
    const f = this.f, p = this.pending!, W = f.workers;
    const b = this.pick(mx, my);
    let err: string | null = null;
    if (p.job === 'mine') {
      const gp = this.g.groundAt(mx, my); if (!gp) return;
      const s = f.seams.reduce((best, s) => (Math.hypot(s.x - gp.x, s.z - gp.z) < Math.hypot((best?.x ?? 1e9) - gp.x, (best?.z ?? 1e9) - gp.z) ? s : best), null as null | typeof f.seams[0]);
      if (!s || Math.hypot(s.x - gp.x, s.z - gp.z) > s.r + 3) { toast('That is not a seam', 'warn', 1400); return; }
      if (s.drill) { toast('That seam lies deep: only a drill-tier miner (Mk. II or better) reaches it', 'warn', 2200); return; }
      err = W.assign(p.c, 'mine', null, s.i);
    } else if (p.job === 'haul') {
      if (!b) return;
      if (!p.from) { p.from = b; toast(`Hauling from <b>${b.def.name}</b>: now click where it goes`, 'info', 2200); return; }
      err = W.route(p.c, p.from, b);
    } else if (p.job === 'pen') {
      if (!b || b.kind !== 'breeder') { toast('Pick a breeding pen', 'warn', 1400); return; }
      err = W.assign(p.c, 'pen', b);
    } else {
      if (!b || !b.def.operable) { toast('Pick a machine that takes an operator', 'warn', 1400); return; }
      err = W.assign(p.c, 'operate', b);
    }
    if (err) { sfx('deny'); toast(err, 'warn', 1600); }
    else { sfx('done', 1, 0.5); toast('Worker assigned', 'good', 1200); }
    this.pending = null; this.tool = 'select'; this.onChange?.();
  }
  /** the single ghost turns to its new facing with a quick eased spin (R / the wheel) instead of a snap */
  private yawShow: number | null = null; private yawGoal = 0;
  private gYaw(goal: number) {
    this.yawGoal = goal;
    if (this.yawShow === null) this.yawShow = goal;
    return this.yawShow;
  }
  private spinGhost(dt: number) {
    if (this.yawShow === null || this.ghosts.length !== 1) { this.yawShow = this.ghosts.length === 1 ? this.yawGoal : null; return; }
    let d = this.yawGoal - this.yawShow; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 0.002) { this.yawShow = this.yawGoal; return; }
    this.yawShow += d * Math.min(1, dt * 16);
    const m = this.meshes[0], h = this.holos[0];
    if (m?.visible) m.rotation.y = this.yawShow;
    if (h?.visible) h.rotation.y = this.yawShow;
  }
  private lastT = 0;
  update() {
    const t = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT)); this.lastT = t;
    this.spinGhost(dt);
    for (const m of [this.holoOk, this.holoBad]) (m as unknown as { __u: { uTime: { value: number } } }).__u.uTime.value = t;
    if (!this.active) return;
    const g = this.g;
    if (g.mode.k !== ('factory' as string)) { this.close(); return; }
    if (this.selected && (isSiteT(this.selected) ? !this.f.sites?.list.includes(this.selected) : (this.selected as FBuilding).dead)) this.selected = null;
    if (g.input.overCanvas && !this.drag?.touch) this.hoverAt(g.input.mx, g.input.my);
  }
}
/** a blueprint turned a quarter */
function turn(bp: Blueprint): Blueprint {
  const parts = bp.parts.map((p) => {
    const def = FDEFS[p.kind], w = footW(def, p.r), d = footD(def, p.r);
    // cells (dx..dx+w-1, dz..dz+d-1) under (x, z) -> (-z, x); w is not needed: the new min corner is (-(dz+d-1), dx)
    void w;
    return { ...p, dx: -(p.dz + d - 1), dz: p.dx, r: (p.r + 1) & 3 };
  });
  const mx = Math.min(...parts.map((p) => p.dx)), mz = Math.min(...parts.map((p) => p.dz));
  for (const p of parts) { p.dx -= mx; p.dz -= mz; }
  return { w: bp.d, d: bp.w, parts };
}

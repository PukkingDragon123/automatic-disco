// Build mode: a blueprint-blue ghost of the chosen machine snapped to the 1 m grid under the cursor (stamp red where
// it cannot go, with the reason), R to turn it, a grid drawn on the ground around it; belts, pipes, walls, dams and
// foundations are laid by dragging a path. X dismantles (full refund). Blueprints copy a rectangle of machines and
// paste it elsewhere (turnable). The same pointer also assigns workers. On touch: tap to set the ghost, tap it again
// to build, drag to lay belts.
import * as THREE from 'three';
import type { Factory, FBuilding } from './factory';
import { FDEFS, isBelt, isDrag, footW, footD, rotXZ, type FKind } from './defs';
import { modelFor, beltGeo } from './models';
import { machineMaterial } from './tex';
import { RECIPE } from './recipes';
import { gbufNone } from '../gfx/gbuf';
import { RAMPS } from '../art/palette';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';
import type { Job } from './workers';
import type { Creature } from '../game/creature';

export type Tool = 'place' | 'dismantle' | 'copy' | 'paste' | 'assign' | 'select';
export interface BlueprintPart { kind: FKind; dx: number; dz: number; r: number; recipe?: string }
export interface Blueprint { w: number; d: number; parts: BlueprintPart[] }
interface Ghost { kind: FKind; cx: number; cz: number; r: number; ok: boolean; why: string | null }

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
  private grid: THREE.LineSegments; private foot: THREE.Mesh;
  private camDist = 0;
  onChange?: () => void;
  onInspect?: (b: FBuilding | null) => void;
  onDismiss?: () => void;

  constructor(readonly f: Factory) {
    (this.badMat as unknown as { onBeforeCompile: unknown }).onBeforeCompile = ((prev) => (sh: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => { prev.call(this.badMat, sh, r); (sh.uniforms.uGhost.value as THREE.Color).setHex(RAMPS.stampRed[3]); })(this.badMat.onBeforeCompile);
    this.badMat.customProgramCacheKey = () => 'fac-ghost-bad';
    const lm = gbufNone(new THREE.LineBasicMaterial({ color: RAMPS.sky[4], transparent: true, opacity: 0.55, depthWrite: false }));
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry(), lm); this.grid.frustumCulled = false; this.grid.visible = false; this.grid.renderOrder = 3;
    const fm = gbufNone(new THREE.MeshBasicMaterial({ color: RAMPS.sky[3], transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    this.foot = new THREE.Mesh(new THREE.BufferGeometry(), fm); this.foot.frustumCulled = false; this.foot.visible = false; this.foot.renderOrder = 3;
    f.render.group.add(this.grid, this.foot);
    addEventListener('pointerdown', this.onDown, true);
    addEventListener('pointermove', this.onMove, true);
    addEventListener('pointerup', this.onUp, true);
    this.offKey = f.g.input.onKey((e) => this.onKey(e));
  }
  private offKey: () => void;
  dispose() { removeEventListener('pointerdown', this.onDown, true); removeEventListener('pointermove', this.onMove, true); removeEventListener('pointerup', this.onUp, true); this.offKey(); }
  get g() { return this.f.g; }

  // ------------------------------------------------------------------ modes
  open(kind: FKind | null = this.kind, tool: Tool = kind ? 'place' : 'select') {
    const g = this.g;
    if (!this.active) {
      this.active = true;
      this.camDist = g.cam.distGoal;
      g.cam.distGoal = Math.max(g.cam.distGoal, 15);
      (g as unknown as { setMode(m: { k: string }): void }).setMode({ k: 'factory' });
      sfx('open', 1, 0.6);
    }
    this.kind = kind; this.tool = tool; this.drag = null; this.tapAt = null;
    this.onChange?.();
  }
  close() {
    if (!this.active) return;
    this.active = false; this.kind = null; this.tool = 'place'; this.drag = null; this.pending = null;
    this.clearGhosts(); this.grid.visible = false; this.foot.visible = false;
    const g = this.g;
    if (g.mode.k === ('factory' as string)) (g as unknown as { setMode(m: { k: string }): void }).setMode({ k: 'normal' });
    if (this.camDist) g.cam.distGoal = Math.min(g.cam.distGoal, Math.max(this.camDist, 6.5));
    this.f.render.hover = null;
    sfx('close', 1, 0.5);
    this.onChange?.();
  }
  toggle() { if (this.active) this.close(); else this.open(null, 'select'); }
  choose(kind: FKind) {
    const def = FDEFS[kind];
    if (def.skill && !this.f.has(def.skill)) { sfx('deny'); toast(`Needs <b>${def.skill}</b> on the skill tree`, 'warn', 1800); return; }
    this.open(kind, 'place'); sfx('click');
  }
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
      if (e.button === 0 && e.shiftKey && g.mode.k === 'normal') {
        const b = this.pick(e.clientX, e.clientY);
        if (b) { this.onInspect?.(b); this.f.render.sel = b; e.stopPropagation(); e.preventDefault(); }
      }
      return;
    }
    e.stopPropagation(); e.preventDefault();
    if (e.button === 2) { if (this.tool !== 'select' || this.kind) { this.kind = null; this.tool = 'select'; this.pending = null; this.clearGhosts(); this.onChange?.(); } else this.close(); return; }
    if (e.button !== 0) return;
    this.hoverAt(e.clientX, e.clientY);
    const touch = e.pointerType === 'touch';
    this.drag = { x: this.cell?.[0] ?? 0, z: this.cell?.[1] ?? 0, on: false, touch, sx: e.clientX, sy: e.clientY };
  };
  private onMove = (e: PointerEvent) => {
    if (!this.active || !this.canvasEv(e) && !this.drag) return;
    if (this.drag && Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 8) this.drag.on = true;
    if (this.drag?.touch && !(this.kind && isDrag(this.kind)) && this.tool !== 'copy') return;
    this.hoverAt(e.clientX, e.clientY);
  };
  private tap: { x: number; y: number; t: number } | null = null;
  private onUp = (e: PointerEvent) => {
    if (!this.active && this.tap && e.pointerType === 'touch') {
      const t = this.tap; this.tap = null;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < 10 && performance.now() - t.t < 400 && (this.g.mode.k === 'normal' || this.g.mode.k === ('factory' as string))) { const b = this.pick(e.clientX, e.clientY); if (b) { this.onInspect?.(b); this.f.render.sel = b; } else if (this.g.mode.k === ('factory' as string)) this.onDismiss?.(); }
      return;
    }
    if (!this.active || !this.drag || e.button !== 0) return;
    const d = this.drag; this.drag = null;
    e.stopPropagation();
    if (d.touch && d.on && !(this.kind && isDrag(this.kind)) && this.tool !== 'copy') return; // a pan, not a tap
    this.hoverAt(e.clientX, e.clientY);
    this.click(e.clientX, e.clientY, d, e.shiftKey);
  };
  private onKey(e: KeyboardEvent) {
    if (!this.active || !(this.g as unknown as { act: boolean }).act) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'r') { this.g.input.keys.delete('r'); if (!e.repeat) this.rotate(); }
    else if (k === 'x') this.setTool(this.tool === 'dismantle' ? 'select' : 'dismantle');
    else if (k === 'y') this.setTool('copy');
    else if (k === 'u') this.setTool('paste');
  }
  rotate() { this.hoverKey = ''; this.rot = (this.rot + 1) & 3; if (this.tool === 'paste' && this.blueprint) this.blueprint = turn(this.blueprint); sfx('click', 1.3, 0.5); this.refresh(); }
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
  private hoverKey = ''; private hoverT = 0;
  private hoverAt(mx: number, my: number) {
    // only when something moved (or twice a second, for costs and validity)
    const now = performance.now(), key = `${mx}|${my}|${this.rot}|${this.tool}|${this.kind}|${this.drag?.on ? this.drag.x + ',' + this.drag.z : ''}|${this.f.buildings.length}`;
    if (key === this.hoverKey && now - this.hoverT < 500) return;
    this.hoverKey = key; this.hoverT = now;
    const p = this.g.groundAt(mx, my);
    this.ground = p;
    this.cell = p ? [Math.floor(p.x), Math.floor(p.z)] : null;
    const R = this.f.render;
    R.hover = this.tool === 'dismantle' || this.tool === 'select' || this.tool === 'assign' ? this.pick(mx, my) : null;
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
      const cells = this.drag?.on && isDrag(this.kind) ? this.path(this.drag.x, this.drag.z, x, z, this.kind) : [[x, z, this.rot]] as [number, number, number][];
      for (const [cx0, cz0, r] of cells) {
        const w = footW(def, r), d = footD(def, r);
        const cx = isDrag(this.kind) && this.drag?.on ? cx0 : cx0 - Math.floor((w - 1) / 2), cz = isDrag(this.kind) && this.drag?.on ? cz0 : cz0 - Math.floor((d - 1) / 2);
        const why = f.why(this.kind, cx, cz, r);
        this.ghosts.push({ kind: this.kind, cx, cz, r, ok: !why, why });
        if (why && !this.why) this.why = why;
      }
      // the whole run must be affordable
      if (this.ghosts.length > 1) { const n = this.ghosts.filter((g) => g.ok).length; for (const [k, v] of Object.entries(def.cost)) if (f.count(k) < (v ?? 0) * n) { this.why = `Needs ${(v ?? 0) * n} ${k.replace('_', ' ')} for the run`; } }
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
  private clearGhosts() { for (const m of this.meshes) m.visible = false; }
  private drawGhosts() {
    const f = this.f, R = f.g.region;
    while (this.meshes.length < this.ghosts.length) { const m = new THREE.Mesh(new THREE.BufferGeometry(), this.okMat); m.renderOrder = 4; m.frustumCulled = false; f.render.group.add(m); this.meshes.push(m); }
    this.meshes.forEach((m, i) => {
      const gh = this.ghosts[i];
      if (!gh) { m.visible = false; return; }
      const def = FDEFS[gh.kind], w = footW(def, gh.r), d = footD(def, gh.r);
      const geo = isBelt(gh.kind) ? beltGeo('straight', gh.kind === 'pipe') : modelFor(gh.kind, def.model, def.hooks?.model).base;
      if (m.geometry !== geo) m.geometry = geo;
      m.material = gh.ok ? this.okMat : this.badMat;
      const y = isBelt(gh.kind) || gh.kind === 'splitter' || gh.kind === 'merger' ? Math.max(R.water - 0.1, R.heightAt(gh.cx + 0.5, gh.cz + 0.5)) : def.extract === 'water' ? R.water - 0.05 : f.levelFor(gh.cx, gh.cz, w, d);
      m.position.set(gh.cx + w / 2, y + 0.02, gh.cz + d / 2);
      m.rotation.set(0, -gh.r * Math.PI / 2, 0);
      m.visible = true;
    });
    // the grid around the cursor, and the footprint (or the copy box)
    const show = !!this.cell;
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
    if (this.tool === 'select' || this.tool === 'assign' && !this.pending) { const b = this.pick(mx, my); f.render.sel = b; this.onInspect?.(b); if (b) sfx('click', 1, 0.6); return; }
    if (this.tool === 'dismantle') {
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
    this.commit();
    if (!shift && this.tool === 'place' && this.kind && !isDrag(this.kind) && FDEFS[this.kind].cat !== 'logistics' && FDEFS[this.kind].cat !== 'eco' && FDEFS[this.kind].cat !== 'defence') { /* stays armed: Satisfactory keeps the tool in hand */ }
  }
  /** build every valid ghost */
  private commit() {
    const f = this.f;
    if (!this.ghosts.length) return;
    if (this.why && this.ghosts.length === 1) { sfx('deny'); toast(this.why, 'warn', 1500); return; }
    let n = 0;
    const bp = this.tool === 'paste' ? this.blueprint : null;
    this.ghosts.forEach((gh, i) => {
      if (!gh.ok) return;
      const b = f.place(gh.kind, gh.cx, gh.cz, gh.r);
      if (!b) return;
      n++;
      const rid = bp?.parts[i]?.recipe; if (rid && RECIPE[rid]) f.setRecipe(b, RECIPE[rid]);
      f.g.fx.burst(b.x, b.y + 0.3, b.z, 8, RAMPS.straw[4], { speed: 1.4, up: 1.6, size: 2.6, life: 0.5, grav: 6 });
    });
    if (n) { sfx('build', 1, 0.7); f.g.cam.shake(0.05, 0.12); }
    else if (this.why) { sfx('deny'); toast(this.why, 'warn', 1500); }
    this.refresh();
  }
  private assignClick(mx: number, my: number) {
    const f = this.f, p = this.pending!, W = f.workers;
    const b = this.pick(mx, my);
    let err: string | null = null;
    if (p.job === 'mine') {
      const gp = this.g.groundAt(mx, my); if (!gp) return;
      const s = f.seams.reduce((best, s) => (Math.hypot(s.x - gp.x, s.z - gp.z) < Math.hypot((best?.x ?? 1e9) - gp.x, (best?.z ?? 1e9) - gp.z) ? s : best), null as null | typeof f.seams[0]);
      if (!s || Math.hypot(s.x - gp.x, s.z - gp.z) > s.r + 3) { toast('That is not a seam', 'warn', 1400); return; }
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
  update() {
    if (!this.active) return;
    const g = this.g;
    if (g.mode.k !== ('factory' as string)) { this.close(); return; }
    if (g.input.overCanvas && !this.drag?.touch) this.hoverAt(g.input.mx, g.input.my);
  }
}
/** a blueprint turned a quarter */
function turn(bp: Blueprint): Blueprint {
  const parts = bp.parts.map((p) => {
    const def = FDEFS[p.kind], w = footW(def, p.r), d = footD(def, p.r);
    // cells (dx..dx+w-1, dz..dz+d-1) under (x, z) -> (-z, x)
    const [a] = [rotXZ(0, 0, 1)]; void a;
    return { ...p, dx: -(p.dz + d - 1), dz: p.dx, r: (p.r + 1) & 3 };
  });
  const mx = Math.min(...parts.map((p) => p.dx)), mz = Math.min(...parts.map((p) => p.dz));
  for (const p of parts) { p.dx -= mx; p.dz -= mz; }
  return { w: bp.d, d: bp.w, parts };
}

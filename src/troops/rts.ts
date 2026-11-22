// TROOPS · RTS CONTROL in the colony view, for every unit the player commands (robots, cyborg workers, teammates,
// drones). Click selects, drag box-selects (a crisp marching-ants marquee with sprung corner brackets and a live
// count), shift adds or removes, a double-click (or ctrl-click) takes every unit of that type on screen. CONTROL
// GROUPS: ctrl+1..9 sets, shift+1..9 adds, 1..9 recalls, a double-tap flies the camera to the group. RIGHT-CLICK is a
// context order (what is under the pointer decides: move, attack, gather, build, repair, follow, guard); a right
// DRAG sets the formation's facing. Shift queues waypoints. Keys while units are selected: A attack-move, S stop,
// H hold, P patrol, F the next formation, Enter steers a lone drone. Over the heads of the selected: health and
// morale pips; at their feet and on the ground: decals.ts. The events go through window capture listeners so the
// other systems (the pod, the sheets, the guide) keep every click this layer does not take.
import * as THREE from 'three';
import type { Game } from '../game/game';
import { type Troop, type Target, type OrderK } from './units';
import { OrderBook, type Formation } from './orders';
import { Decals, type MarkK } from './decals';
import { bitText } from '../ui/kit/bitfont';
import { uiSfx } from '../ui/kit/sound';
import { glyph, pip, hpRamp, P } from './art';

type G = Game & Record<string, any>;
export interface Intent { k: OrderK; tgt: Target | null; x: number; z: number }
const FORMS: Formation[] = ['line', 'wedge', 'column'];
const _v = new THREE.Vector3();

export class Rts {
  sel: string[] = [];
  groups = new Map<number, string[]>();
  hover: Troop | null = null;
  /** armed by a key or an order key: the next left click places it */
  arm: 'amove' | 'patrol' | null = null;
  intent: Intent | null = null;
  private drag: { x0: number; y0: number; x1: number; y1: number; on: boolean; add: boolean; t0: number; took: Troop | null; ctrl: boolean } | null = null;
  private rdrag: { x0: number; y0: number; x1: number; y1: number; on: boolean; gx: number; gz: number; shift: boolean } | null = null;
  private lastClick = { t: 0, key: '' };
  private lastGroup = { t: 0, n: 0 };
  private intentT = 0;
  readonly cv: HTMLCanvasElement; private c: CanvasRenderingContext2D;
  onChange: (() => void) | null = null;
  onGroups: (() => void) | null = null;
  onKeyOrder: ((k: string) => void) | null = null;
  private off: (() => void)[] = [];
  private t = 0;
  constructor(readonly g: G, readonly book: OrderBook, readonly decals: Decals) {
    const cv = this.cv = document.createElement('canvas');
    cv.className = 'tr-ov';
    document.body.append(cv);
    this.c = cv.getContext('2d')!;
    this.resize();
    const on = <K extends keyof WindowEventMap>(ev: K, f: (e: WindowEventMap[K]) => void, cap = true) => { addEventListener(ev, f as EventListener, cap); this.off.push(() => removeEventListener(ev, f as EventListener, cap)); };
    on('resize', () => this.resize(), false);
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('keydown', (e) => this.key(e));
    g.on('colony-select', (s: { kind?: string } | null) => { if (s && this.sel.length && !this.selecting) this.select([]); });
  }
  dispose() { for (const f of this.off) f(); this.cv.remove(); }
  private resize() { this.cv.width = innerWidth; this.cv.height = innerHeight; this.c.imageSmoothingEnabled = false; }

  // ------------------------------------------------------------------ the selection
  troops(): Troop[] { const m = new Map(this.book.troops.map((t) => [t.key, t])); return this.sel.map((k) => m.get(k)).filter((t): t is Troop => !!t && t.alive); }
  has(t: Troop) { return this.sel.includes(t.key); }
  private selecting = false;
  select(list: Troop[], add = false) {
    const before = this.sel.join();
    const keys = add ? [...this.sel] : [];
    for (const t of list) if (!keys.includes(t.key)) keys.push(t.key);
    this.sel = keys;
    if (this.sel.join() === before) return;
    for (const t of this.book.troops) { const r = t.ref as Record<string, unknown>; r.__troopSel = this.sel.includes(t.key) ? 1 : 0; }
    // the old single-unit plate gives way to the cards
    const col = this.g.colony;
    if (this.sel.length && col?.sel && (col.sel.kind === 'crew' || col.sel.kind === 'drone')) { this.selecting = true; try { col.select(null); } finally { this.selecting = false; } }
    if (this.sel.length) { this.arm = null; }
    this.onChange?.();
  }
  deselect(t: Troop) { this.sel = this.sel.filter((k) => k !== t.key); (t.ref as Record<string, unknown>).__troopSel = 0; this.onChange?.(); }
  /** prune the dead out of the selection and groups */
  prune() {
    const alive = new Set(this.book.troops.map((t) => t.key));
    const n = this.sel.length; this.sel = this.sel.filter((k) => alive.has(k)); if (this.sel.length !== n) this.onChange?.();
    for (const [i, ks] of this.groups) { const f = ks.filter((k) => alive.has(k)); if (f.length !== ks.length) { if (f.length) this.groups.set(i, f); else this.groups.delete(i); this.onGroups?.(); } }
  }

  // ------------------------------------------------------------------ gating
  /** may the RTS layer take input now (the colony view, in RTS control, no mode or screen over it) */
  live(): boolean {
    const g = this.g, b = document.body.classList, col = g.colony;
    if (!col || !col.ready || col.failed || col.ctl?.k !== 'rts') return false;
    if ((g as any).act === false || g.engine?.screen !== g) return false;
    if (g.harvest?.blocking || g.storyBlock || g.factory?.build?.active) return false;
    if (b.contains('bp-on') || b.contains('bp-off') || b.contains('pod7-on') || b.contains('cine-on') || b.contains('talk7') || b.contains('trs-on')) return false;
    if (g.map7?.isOpen) return false;
    if (g.mode?.k && g.mode.k !== 'normal') return false;
    return true;
  }
  private onCanvas(e: Event) { return e.target === this.g.engine?.canvas; }

  // ------------------------------------------------------------------ picking
  /** the unit under a screen point (a capsule from its feet to its head) */
  pick(mx: number, my: number): Troop | null {
    let best: Troop | null = null, bd = 1e9;
    for (const t of this.book.troops) {
      const [fx, fy, ok] = this.g.screenOf(t.x, t.y + 0.05, t.z); if (!ok) continue;
      const [hx, hy] = this.g.screenOf(t.x, t.y + t.height, t.z);
      const [rx] = this.g.screenOf(t.x + t.radius, t.y + t.height * 0.5, t.z), [cx] = this.g.screenOf(t.x, t.y + t.height * 0.5, t.z);
      const rad = Math.max(12, Math.abs(rx - cx) * 1.3);
      const dx = hx - fx, dy = hy - fy, L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((mx - fx) * dx + (my - fy) * dy) / L2));
      const d = Math.hypot(mx - (fx + dx * u), my - (fy + dy * u));
      if (d < rad && d / rad < bd) { bd = d / rad; best = t; }
    }
    return best;
  }
  private inBox(t: Troop, x0: number, y0: number, x1: number, y1: number) {
    const [sx, sy, ok] = this.g.screenOf(t.x, t.y + t.height * 0.45, t.z);
    return ok && sx >= Math.min(x0, x1) && sx <= Math.max(x0, x1) && sy >= Math.min(y0, y1) && sy <= Math.max(y0, y1);
  }
  private onScreen(t: Troop) { const [sx, sy, ok] = this.g.screenOf(t.x, t.y + t.height * 0.5, t.z); return ok && sx > 0 && sy > 0 && sx < innerWidth && sy < innerHeight; }
  /** what a right-click here would order the selection to do */
  context(mx: number, my: number, sel: Troop[]): Intent | null {
    const g = this.g;
    const gp = g.groundAt(mx, my);
    const ground = (k: OrderK): Intent | null => gp ? { k, tgt: null, x: gp.x, z: gp.z } : null;
    if (this.arm) return ground(this.arm);
    const T = (kind: Target['kind'], ref: any, x: number, z: number): Target => ({ kind, ref, x, z });
    // enemies: robots, creatures, faction structures
    let foe: any = null, fd = 26;
    for (const u of (g.robots ?? []) as any[]) {
      if (u.dead || u.faction === 'veyr' || u.faction === 'wild') continue;
      const [sx, sy, ok] = g.screenOf(u.x, u.y + u.height * 0.5, u.z); if (!ok) continue;
      const d = Math.hypot(sx - mx, sy - my); if (d < fd) { fd = d; foe = u; }
    }
    if (foe) return { k: 'attack', tgt: T('robot', foe, foe.x, foe.z), x: foe.x, z: foe.z };
    const cr = g.pickCreature(mx, my, (c: any) => !c.dead && c.faction !== 'veyr');
    if (cr) return { k: 'attack', tgt: T('creature', cr, cr.x, cr.z), x: cr.x, z: cr.z };
    for (const s of (g.factions?.structures ?? []) as any[]) {
      if (s.dead || s.hp <= 0) continue;
      const [sx, sy, ok] = g.screenOf(s.x, (s.y ?? 0) + (s.height ?? 2) * 0.5, s.z); if (!ok) continue;
      const [, sy2] = g.screenOf(s.x, (s.y ?? 0) + (s.height ?? 2), s.z);
      if (Math.hypot(sx - mx, sy - my) < Math.max(24, Math.abs(sy - sy2) * 1.4)) return { k: 'attack', tgt: T('faction', s, s.x, s.z), x: s.x, z: s.z };
    }
    // our own: a unit to follow (or mend)
    const mine = this.pick(mx, my);
    if (mine && !sel.includes(mine)) {
      const hurt = mine.kind !== 'crew' && mine.hp01 < 0.98 && sel.some((t) => t.canRepair);
      return { k: hurt ? 'repair' : 'follow', tgt: T('troop', mine, mine.x, mine.z), x: mine.x, z: mine.z };
    }
    // the colony's own: structures, the pod, drones
    const cs = g.colony?.pick?.(mx, my);
    if (cs?.kind === 'struct') { const s = cs.ref; if (!s.done) return { k: 'build', tgt: T('struct', s, s.x, s.z), x: s.x, z: s.z }; if (s.hp < s.maxHp && sel.some((t) => t.canRepair)) return { k: 'repair', tgt: T('struct', s, s.x, s.z), x: s.x, z: s.z }; return { k: 'guard', tgt: T('struct', s, s.x, s.z), x: s.x, z: s.z }; }
    if (cs?.kind === 'pod') { const p = g.colony.pod; if (p.hp < p.maxHp && sel.some((t) => t.canRepair)) return { k: 'repair', tgt: T('pod', p, p.x, p.z), x: p.x, z: p.z }; return { k: 'guard', tgt: T('pod', p, p.x, p.z), x: p.x, z: p.z }; }
    // the works: a site to build, a machine to mend or guard
    if (gp && g.factory?.sites?.siteAt) { const s = g.factory.sites.siteAt(Math.floor(gp.x), Math.floor(gp.z)); if (s) return { k: 'build', tgt: T('site', s, gp.x, gp.z), x: gp.x, z: gp.z }; }
    const fb = g.factory?.build?.pickStrict?.(mx, my);
    if (fb && !fb.dead) { if (fb.hp < fb.maxHp && sel.some((t) => t.canRepair)) return { k: 'repair', tgt: T('fbuilding', fb, fb.x, fb.z), x: fb.x, z: fb.z }; return { k: 'guard', tgt: T('fbuilding', fb, fb.x, fb.z), x: fb.x, z: fb.z }; }
    if (!gp) return null;
    // the land: a seam, a plant to forage
    if (sel.some((t) => t.canGather)) {
      const dep = (g.region?.deposits ?? []).find((d: any) => d.amount > 0 && Math.hypot(d.x - gp.x, d.z - gp.z) < (d.r ?? 2) + 0.8);
      if (dep) return { k: 'gather', tgt: T('deposit', dep, dep.x, dep.z), x: dep.x, z: dep.z };
      const fl = g.world?.flora; let fi = -1;
      fl?.near?.(gp.x, gp.z, 0.9, (i: number) => { if (fl.bio?.[i] > 0.15) fi = i; });
      if (fi >= 0) return { k: 'gather', tgt: T('flora', { i: fi, x: fl.x[fi], z: fl.z[fi] }, fl.x[fi], fl.z[fi]), x: fl.x[fi], z: fl.z[fi] };
    }
    return ground('move');
  }

  // ------------------------------------------------------------------ input
  private down(e: PointerEvent) {
    if (!this.onCanvas(e) || !this.live()) return;
    const mx = e.clientX, my = e.clientY;
    if (e.button === 0) {
      if (this.arm && this.sel.length) {
        const it = this.context(mx, my, this.troops());
        if (it) this.order(it, e.shiftKey);
        if (!e.shiftKey) this.arm = null;
        this.eat(e); return;
      }
      const t = this.pick(mx, my);
      this.drag = { x0: mx, y0: my, x1: mx, y1: my, on: false, add: e.shiftKey, t0: performance.now(), took: t, ctrl: e.ctrlKey || e.metaKey };
      if (t) this.eat(e);
      return;
    }
    if (e.button === 2) {
      if (this.arm) { this.arm = null; uiSfx('back', 0.4); this.eat(e); return; }
      if (!this.sel.length) return;
      const gp = this.g.groundAt(mx, my);
      this.rdrag = { x0: mx, y0: my, x1: mx, y1: my, on: false, gx: gp?.x ?? 0, gz: gp?.z ?? 0, shift: e.shiftKey };
      this.eat(e);
    }
  }
  private move(e: PointerEvent) {
    const d = this.drag;
    if (d) { d.x1 = e.clientX; d.y1 = e.clientY; if (!d.on && Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 7) { d.on = true; (this.g as any).drag = null; uiSfx('tick', 0.35, 1.3); } }
    const r = this.rdrag;
    if (r) { r.x1 = e.clientX; r.y1 = e.clientY; if (!r.on && Math.hypot(r.x1 - r.x0, r.y1 - r.y0) > 18) r.on = true; }
  }
  private up(e: PointerEvent) {
    if (e.button === 0 && this.drag) {
      const d = this.drag; this.drag = null;
      if (d.on) {
        const inside = this.book.troops.filter((t) => this.inBox(t, d.x0, d.y0, d.x1, d.y1));
        if (inside.length) { this.select(inside, d.add); uiSfx('select', 0.55); } else if (!d.add) this.select([]);
        e.stopImmediatePropagation();
        return;
      }
      if (d.took) {
        const t = d.took, now = performance.now();
        if ((now - this.lastClick.t < 340 && this.lastClick.key === t.key) || d.ctrl) {
          const same = this.book.troops.filter((o) => o.type === t.type && this.onScreen(o));
          this.select(same, d.add); uiSfx('confirm', 0.45);
        } else if (d.add && this.has(t)) { this.deselect(t); uiSfx('back', 0.35); }
        else { this.select([t], d.add); uiSfx('select', 0.5); }
        this.lastClick = { t: now, key: t.key };
        e.stopImmediatePropagation();
        return;
      }
      // a plain click on the ground lets go of the selection
      if (!d.add && this.sel.length && this.onCanvas(e)) this.select([]);
      return;
    }
    if (e.button === 2 && this.rdrag) {
      const r = this.rdrag; this.rdrag = null;
      const sel = this.troops(); if (!sel.length) return;
      if (r.on) {
        const gp = this.g.groundAt(r.x1, r.y1);
        if (gp) { const face = Math.atan2(gp.x - r.gx, gp.z - r.gz); this.order({ k: 'move', tgt: null, x: r.gx, z: r.gz }, r.shift || e.shiftKey, face); }
      } else {
        const it = this.context(r.x0, r.y0, sel);
        if (it) this.order(it, r.shift || e.shiftKey);
      }
      e.stopImmediatePropagation();
    }
  }
  /** give the selection an order: the book runs it, the ground gets its marker */
  order(it: Intent, queued = false, face?: number) {
    const sel = this.troops(); if (!sel.length) return;
    this.book.issue(it.k, sel, it.x, it.z, it.tgt, queued, face);
    this.decals.mark(it.x, it.z, it.k as MarkK, true);
    uiSfx(it.k === 'attack' || it.k === 'amove' ? 'metal' : 'confirm', it.k === 'attack' ? 0.45 : 0.4, 0.9 + Math.random() * 0.2);
  }
  private eat(e: Event) { e.stopImmediatePropagation(); e.preventDefault(); }
  private key(e: KeyboardEvent) {
    if (!this.live()) return;
    const tg = e.target as HTMLElement | null; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    const code = e.code, dig = /^Digit([1-9])$/.exec(code), k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (dig) {
      const n = Number(dig[1]);
      if (e.ctrlKey || e.metaKey) { const ks = this.troops().map((t) => t.key); if (ks.length) this.groups.set(n, ks); else this.groups.delete(n); uiSfx('toggle', 0.5); this.onGroups?.(); this.eat(e); return; }
      if (e.shiftKey && this.sel.length) { const ks = [...new Set([...(this.groups.get(n) ?? []), ...this.sel])]; this.groups.set(n, ks); uiSfx('toggle', 0.45, 1.2); this.onGroups?.(); this.eat(e); return; }
      if (e.altKey) return;
      const ks = this.groups.get(n); if (!ks?.length) return; // an empty group: the digit keeps its old job (time speed)
      const m = new Map(this.book.troops.map((t) => [t.key, t])), list = ks.map((q) => m.get(q)).filter((t): t is Troop => !!t);
      if (!list.length) return;
      const now = performance.now();
      this.select(list);
      if (this.lastGroup.n === n && now - this.lastGroup.t < 380) this.focus(list); else uiSfx('select', 0.45);
      this.lastGroup = { t: now, n };
      this.onKeyOrder?.('group' + n);
      this.eat(e); return;
    }
    if (!this.sel.length) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'Escape') { if (this.arm) { this.arm = null; uiSfx('back', 0.4); } else this.select([]); this.eat(e); return; }
    if (k === 'a') { this.arm = 'amove'; uiSfx('switch', 0.45); this.onKeyOrder?.('amove'); this.eat(e); return; }
    if (k === 'p') { this.arm = 'patrol'; uiSfx('switch', 0.45); this.onKeyOrder?.('patrol'); this.eat(e); return; }
    if (k === 's') { this.cmd('stop'); this.eat(e); return; }
    if (k === 'h') { this.cmd('hold'); this.eat(e); return; }
    if (k === 'f') { this.setFormation(FORMS[(FORMS.indexOf(this.book.formation) + 1) % FORMS.length]); this.eat(e); return; }
    if (k === 'Enter') { const s = this.troops(); if (s.length === 1 && s[0].kind === 'drone') { this.g.colony?.control?.('drone:' + s[0].ref.id); this.select([]); this.eat(e); } return; }
  }
  /** an instant order from a key or a card key */
  cmd(k: 'stop' | 'hold' | 'amove' | 'patrol') {
    const sel = this.troops(); if (!sel.length) return;
    if (k === 'amove' || k === 'patrol') { this.arm = k; uiSfx('switch', 0.45); this.onKeyOrder?.(k); return; }
    let cx = 0, cz = 0; for (const t of sel) { cx += t.x; cz += t.z; } cx /= sel.length; cz /= sel.length;
    this.book.issue(k, sel, cx, cz);
    for (const t of sel) this.decals.mark(t.x, t.z, k, false);
    uiSfx(k === 'stop' ? 'clunk' : 'metalClose', 0.45);
    this.onKeyOrder?.(k);
  }
  setFormation(f: Formation) { this.book.formation = f; this.book.save(); uiSfx('tab', 0.45); this.onKeyOrder?.(f); }
  /** fly the camera to a group */
  focus(list: Troop[]) {
    let x = 0, z = 0; for (const t of list) { x += t.x; z += t.z; } x /= list.length; z /= list.length;
    this.g.cam?.followFn?.(null); this.g.cam?.lookAt?.(x, z); uiSfx('swishIn', 0.4);
  }
  /** right-click on the minimap: the selection goes there */
  orderAt(x: number, z: number): boolean { if (!this.sel.length) return false; this.order({ k: this.arm ?? 'move', tgt: null, x, z }); this.arm = null; return true; }

  // ------------------------------------------------------------------ the frame (after the world is drawn)
  frame(dt: number) {
    this.t += dt;
    const g = this.g, c = this.c, W = this.cv.width, H = this.cv.height;
    c.clearRect(0, 0, W, H);
    const live = this.live(), inp = g.input;
    this.cv.style.display = live || this.sel.length ? '' : 'none';
    if (!live) { this.hover = null; this.drag = null; this.rdrag = null; }
    // hover and the context intent (throttled)
    if (live && inp?.overCanvas) {
      this.hover = this.drag?.on ? null : this.pick(inp.mx, inp.my);
      this.intentT -= dt;
      if (this.sel.length && this.intentT <= 0) { this.intentT = 0.1; this.intent = this.context(inp.mx, inp.my, this.troops()); }
    } else { this.hover = null; this.intent = null; }
    if (!this.sel.length) this.intent = null;
    document.body.classList.toggle('tr-armed', !!this.arm);
    // ---- ground marks
    const D = this.decals;
    D.begin(dt);
    const sel = this.troops();
    const boxed = this.drag?.on ? this.book.troops.filter((t) => this.inBox(t, this.drag!.x0, this.drag!.y0, this.drag!.x1, this.drag!.y1)) : [];
    for (const t of sel) {
      const sq = this.book.squad(this.book.stateOf(t).squad);
      const col = t.hp01 > 0.55 ? 0x9fe08a : t.hp01 > 0.28 ? 0xffc560 : 0xff6a4a;
      D.ring(t.x, t.z, t.radius * 1.25 + 0.22, 0.1, col, 1);
      if (sq) D.ring(t.x, t.z, t.radius * 1.25 + 0.42, 0.05, sq.color, 0.9, 6, 0.15);
    }
    for (const t of boxed) if (!this.has(t)) D.ring(t.x, t.z, t.radius * 1.25 + 0.22, 0.07, 0xd8f0ff, 0.85, 10, 0.6);
    if (this.hover && !this.has(this.hover)) D.ring(this.hover.x, this.hover.z, this.hover.radius * 1.25 + 0.22, 0.06, 0xf2ead2, 0.8, 8, 0.4);
    // routes: the dashed path through every queued point, a beating marker at each
    sel.forEach((t, i) => {
      const route = this.book.route(t); if (!route.length) return;
      const pts: [number, number][] = [[t.x, t.z]];
      const live0 = (t.ref.path as number[] | null | undefined), pi = (t.ref.pi as number | undefined) ?? (t.ref.pathI as number | undefined) ?? 0;
      route.forEach((o, j) => {
        const p = o.tgt ? { x: o.tgt.ref?.x ?? o.x, z: o.tgt.ref?.z ?? o.z } : o;
        if (j === 0 && live0 && live0.length >= 4 && (o.k === 'move' || o.k === 'amove')) { for (let q = Math.max(0, pi); q + 1 < live0.length; q += 2) pts.push([live0[q], live0[q + 1]]); }
        pts.push([p.x, p.z]);
        if (o.k === 'patrol' && o.ax !== undefined) pts.push([o.ax, o.az ?? p.z]);
      });
      const k = route[0].k, col = ({ attack: 0xff5a48, amove: 0xff8a5a, patrol: 0x7ab8ff, gather: 0xffc860, build: 0xffb050, repair: 0x8ad8ff, follow: 0xd8f0ff, guard: 0x9ad87a } as Record<string, number>)[k] ?? 0xe8e0b0;
      if (k !== 'hold' && k !== 'stop') D.path(pts, 0.05, col, 0.85);
      route.forEach((o, j) => { if (o.k === 'hold' || o.k === 'stop') return; const p = o.tgt ? { x: o.tgt.ref?.x ?? o.x, z: o.tgt.ref?.z ?? o.z } : o; if (j > 0 || i < 24) D.waypoint(p.x, p.z, (o.k === 'amove' ? 'amove' : o.k) as MarkK, i * 0.7 + j, j > 0 ? 0.95 : 0.8); });
    });
    // the formation preview while the right button drags
    const r = this.rdrag;
    if (r?.on && sel.length) {
      const gp = g.groundAt(r.x1, r.y1);
      if (gp) {
        const face = Math.atan2(gp.x - r.gx, gp.z - r.gz), spots = this.book.slots(sel, r.gx, r.gz, this.book.formation, face, r.shift);
        for (const [x, z] of spots) D.ring(x, z, 0.38, 0.06, 0xe8e0b0, 0.9, 6, 0.8);
        D.arrow(r.gx + Math.sin(face) * 1.6, r.gz + Math.cos(face) * 1.6, face, 1.1, 0xe8e0b0, 1);
      }
    }
    D.drawMarks();
    D.end();
  }
  /** the 2D layer, after the world's image: pips over heads, the marquee, the order intent at the pointer */
  overlay() {
    const g = this.g, c = this.c;
    const sel = this.troops();
    for (const t of sel) this.pips(t);
    if (this.hover && !this.has(this.hover)) this.pips(this.hover, true);
    const d = this.drag;
    if (d?.on) this.marquee(d.x0, d.y0, d.x1, d.y1, d.t0);
    const inp = g.input;
    if (this.intent && inp?.overCanvas && !d?.on) {
      const k = this.arm ?? this.intent.k;
      const name = k === 'amove' ? 'attack' : k;
      const pal = k === 'attack' || k === 'amove' ? 'red' : k === 'move' ? 'cream' : k === 'patrol' ? 'blue' : k === 'repair' ? 'teal' : k === 'follow' || k === 'guard' ? 'green' : 'amber';
      const p = glyph(name, pal as never, 1), x = Math.round(inp.mx + 14), y = Math.round(inp.my + 12);
      const bob = Math.round(Math.sin(this.t * 6) * 1);
      c.drawImage(p.canvas(), x, y + bob, p.w * 2, p.h * 2);
      if (this.book.formation !== 'line' && sel.length > 1 && (k === 'move' || k === 'amove' || k === 'patrol')) { const f = glyph(this.book.formation, 'dim', 1); c.drawImage(f.canvas(), x + p.w * 2 + 2, y + 8, f.w * 2, f.h * 2); }
    }
  }
  private pipCache = new Map<string, HTMLCanvasElement>();
  private pips(t: Troop, faint = false) {
    const g = this.g, c = this.c;
    const [sx, sy, ok] = g.screenOf(t.x, t.y + t.height + 0.32, t.z); if (!ok) return;
    const s = this.book.stateOf(t);
    const maxHp = t.kind === 'crew' ? 100 : (t.ref.maxHp ?? 100), N = Math.max(3, Math.min(8, Math.round(maxHp / 45))), lit = Math.ceil(t.hp01 * N - 0.01);
    const ramp = hpRamp(t.hp01), mN = 4, mLit = Math.round(s.morale * mN);
    const pw = 7, w = N * pw - 1, x0 = Math.round(sx - w / 2), y0 = Math.round(sy) - 20;
    c.globalAlpha = faint ? 0.75 : 1;
    for (let i = 0; i < N; i++) c.drawImage(pip(ramp, i < lit, 4), x0 + i * pw - 1, y0, 12, 12);
    const mw = mN * 6 - 1, mx0 = Math.round(sx - mw / 2), mr = s.morale < 0.25 ? P.ruby : s.morale < 0.5 ? P.ochre : P.sapphire;
    const blink = s.morale < 0.25 && Math.floor(this.t * 3) % 2 === 0;
    if (!faint) for (let i = 0; i < mN; i++) c.drawImage(pip(mr, i < mLit && !blink, 3), mx0 + i * 6 - 1, y0 + 12, 10, 10);
    c.globalAlpha = 1;
    void this.pipCache;
  }
  private marquee(x0: number, y0: number, x1: number, y1: number, t0: number) {
    const c = this.c;
    const ax = Math.round(Math.min(x0, x1)), ay = Math.round(Math.min(y0, y1)), bx = Math.round(Math.max(x0, x1)), by = Math.round(Math.max(y0, y1));
    const w = bx - ax, h = by - ay;
    // a sparse dot field inside (a glass plate's grain, not a flat wash)
    c.fillStyle = 'rgba(216,240,255,0.22)';
    for (let y = ay + 3; y < by - 1; y += 6) for (let x = ax + 3 + ((y >> 1) % 2 ? 3 : 0); x < bx - 1; x += 6) c.fillRect(x, y, 2, 2);
    // ink frame, then marching dashes
    c.fillStyle = '#08090c';
    c.fillRect(ax - 2, ay - 2, w + 4, 2); c.fillRect(ax - 2, by, w + 4, 2); c.fillRect(ax - 2, ay, 2, h); c.fillRect(bx, ay, 2, h);
    c.fillStyle = '#d8f0ff';
    const per = 10, off = Math.floor(this.t * 24) % per;
    const dash = (len: number, f: (s: number, l: number) => void) => { for (let s = -off; s < len; s += per) { const a = Math.max(0, s), b = Math.min(len, s + 6); if (b > a) f(a, b - a); } };
    dash(w, (s, l) => { c.fillRect(ax + s, ay, l, 2); c.fillRect(bx - s - l, by - 2, l, 2); });
    dash(h, (s, l) => { c.fillRect(bx - 2, ay + s, 2, l); c.fillRect(ax, by - s - l, 2, l); });
    // corner brackets, sprung out on the start
    const age = (performance.now() - t0) / 1000, k = Math.max(0, 1 - age / 0.22), pop = Math.round(k * 8), L = 12;
    const bracket = (x: number, y: number, sx: number, sy: number) => {
      const X = x - sx * pop, Y = y - sy * pop;
      c.fillStyle = '#08090c'; c.fillRect(Math.min(X, X + sx * L) - 1, Y - 1 - (sy > 0 ? 0 : 2), L + 2, 6); c.fillRect(X - 1 - (sx > 0 ? 0 : 2), Math.min(Y, Y + sy * L) - 1, 6, L + 2);
      c.fillStyle = '#ffe7a8'; c.fillRect(Math.min(X, X + sx * L), Y - (sy > 0 ? 0 : 2) + 1, L, 2); c.fillRect(X - (sx > 0 ? 0 : 2) + 1, Math.min(Y, Y + sy * L), 2, L);
    };
    bracket(ax, ay, 1, 1); bracket(bx, ay, -1, 1); bracket(ax, by, 1, -1); bracket(bx, by, -1, -1);
    // the live count at the pointer
    const n = this.book.troops.filter((t) => this.inBox(t, x0, y0, x1, y1)).length;
    if (n) bitText(c, String(n), x1 + (x1 >= x0 ? 10 : -26), y1 + (y1 >= y0 ? 6 : -30), { color: '#ffe7a8', scale: 2 });
    void _v;
  }
}

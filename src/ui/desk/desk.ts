// Unit 07's cockpit desk: the 3D console composited over the bottom of the view (desk/gfx.ts draws it as pixel art).
// A low strip runs along the bottom edge in every mode: the MODE selector, the four hold gauges, hull and charge with
// the reactor between them, the power drum and its FIRE plunger, the core-cell counter with the blueprint tube, the
// clock, the alarm beacons and the pause lever. Behind it two raised wing decks carry the tools of the current mode;
// changing mode sinks them behind the strip and brings them back up with the new mode's things on them. The middle of
// the screen is never covered. A clip-path traced round whatever stands on the desk decides which clicks are the
// desk's; everything else falls through to the world.
import * as THREE from 'three';
import { DeskView, box, cyl, mesh, mat, merged } from './gfx';
import { M, matsOf, Spring, type Hot, type HitInfo } from './kit';
import { R, label } from './paint';
import { decal } from './kit';
import { Counter, Gauge, Reactor, Vessel, Drum, Plunger, ModeKnob, Lever, Beacon, Lamp, MODES, type Mode, type ResKind, stencil } from './parts';
import { BlueprintTube, Microscope, HardHat, Clipboard, Handset, SpecimenJar, AmmoCrate, Binoculars, Magnifier, Scroll, PaintTin, Horn, Bobblehead, Mug, Die, Fan, Calendar, SelfDestruct, Prop } from './props';
import { HoloTable, CRT, Orrery, InspectBoard } from './boards';
import { LiveDecal } from './kit';
import { Pads, type PadId } from './pads';

/** the strip's panel: a 36-unit face leaning back 50 degrees above a 12-deep ledge */
const PANEL_L = 36, PANEL_TILT = 48 * Math.PI / 180, LEDGE = 12, LEDGE_H = 6;
const RAIL_Y = LEDGE_H + PANEL_L * Math.sin(PANEL_TILT), RAIL_Z = -LEDGE - PANEL_L * Math.cos(PANEL_TILT);
/** the wing decks: their top, front edge and depth */
const DECK_Y = RAIL_Y + 12, DECK_Z0 = RAIL_Z - 4, DECK_D = 54, WING_W = 204, WING_X = 320 - WING_W / 2;
type Side = 'L' | 'R';

export class Desk {
  readonly view: DeskView;
  readonly root = new THREE.Group();
  readonly strip = new THREE.Group();
  readonly panel = new THREE.Group();
  readonly wing: Record<Side, THREE.Group> = { L: new THREE.Group(), R: new THREE.Group() };
  private wingSp: Record<Side, Spring> = { L: new Spring(-1, 70, 10), R: new Spring(-1, 70, 10) };
  private slabs: Record<Side, Partial<Record<Mode, THREE.Group>>> = { L: {}, R: {} };
  private shown: Record<Side, Mode | null> = { L: null, R: null };
  /** the mode the desk shows (the wings flip to it) */
  mode: Mode = 'explore';
  tucked = false; private tuckSp = new Spring(0, 60, 10);
  // ---- instruments
  readonly knob = new ModeKnob();
  readonly vessels = {} as Record<ResKind, Vessel>; readonly resCount = {} as Record<ResKind, Counter>; readonly resCap = {} as Record<ResKind, LiveDecal>; readonly resLamp = {} as Record<ResKind, Lamp>;
  readonly hull: Gauge; readonly charge: Gauge; readonly reactor = new Reactor();
  readonly hullTxt = new LiveDecal(30, 7); readonly chgTxt = new LiveDecal(30, 7);
  readonly drum = new Drum(); readonly plunger = new Plunger(); readonly readout = new LiveDecal(66, 15, { flat: 1, emit: 0.4, outline: false });
  readonly cells = new Counter(2); readonly cellLamp = new Lamp(R.glowTeal[3]);
  readonly clock = new Counter(4); readonly ground = new Counter(2);
  readonly beacons = [new Beacon(R.stampRed[3]), new Beacon(R.glowAmber[3])];
  readonly menuLever = new Lever(R.stampRed[3]); readonly tuckLever = new Lever(R.ochre[5], 10);
  readonly tube = new BlueprintTube();
  // ---- the wings' things
  readonly table = new HoloTable(88);
  readonly crt = new CRT(92, 46);
  readonly orrery = new Orrery();
  readonly board = new InspectBoard();
  readonly works = { root: new THREE.Group(), gauge: new Gauge(20, -2.2, 2.2, { ticks: 8, red: [0.85, 1], word: 'MW' }), store: new Counter(3), crew: new Counter(2), lamp: new Lamp(R.stampRed[3]) };
  readonly props = {
    hat: new HardHat(), tin: new PaintTin(), clip: new Clipboard(), radio: new Handset(), jar: new SpecimenJar(), scope: new Microscope(), scroll: new Scroll(),
    crate: new AmmoCrate(), bino: new Binoculars(), lens: new Magnifier(), lens2: new Magnifier(), horn: new Horn(),
    bobble: new Bobblehead(), mug: new Mug(), die: new Die(), fan: new Fan(), cal: new Calendar(), boom: new SelfDestruct(),
  };
  /** the touch layout: thumb pads on the strip's ends (ui/touch.ts docks its hit areas over them) */
  pads: Pads | null = null; touch = false;
  padState: Parameters<Pads['update']>[1] = null;
  private boardHolder!: THREE.Group;
  private extras = new THREE.Group(); private menuLabel!: THREE.Object3D;
  // ---- interaction
  readonly hots: Hot[] = [];
  private hotOf = new Map<THREE.Object3D, Hot>();
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2();
  hover: Hot | null = null;
  private drag: { hot: Hot; x: number; y: number; lx: number; ly: number; moved: boolean; id: number; button: number; hit: HitInfo } | null = null;
  onHover?: (h: Hot | null) => void;
  onClick?: (h: Hot) => void;
  private t = 0; private maskT = 0; private maskKey = '';
  private shake = new Spring(0, 260, 9);
  /** desk-space scale (shrinks below 640 art px wide) */
  sc = 1;
  /** screen heights of the strip top and the wing tops, CSS px from the bottom (other UI keeps clear of them) */
  stripTop = 0; wingTop: Record<Side, number> = { L: 0, R: 0 }; wingW = 0;

  constructor(parent: HTMLElement) {
    this.view = new DeskView(parent);
    this.view.scene.add(this.root);
    (window as unknown as { __desk: Desk }).__desk = this;
    this.root.add(this.strip, this.wing.L, this.wing.R);
    this.hull = new Gauge(22, -2.1, 2.1, { ticks: 8, red: [0, 0.2], word: 'HULL' });
    this.charge = new Gauge(22, -2.1, 2.1, { ticks: 8, red: [0, 0.15], word: 'CHG' });
    this.buildStrip();
    this.buildWings();
    this.bindInput();
    this.layout();
  }

  // ------------------------------------------------------------------ construction
  private buildStrip() {
    const s = this.strip, W = 2400;
    // the body: a front lip and ledge, the leaning panel, the rail along its top, a back block
    s.add(mesh(box(W, LEDGE_H, LEDGE), M('deck'), 0, LEDGE_H / 2, -LEDGE / 2));
    s.add(mesh(box(W, 1.4, 1.4), M('steel', { spec: 1 }), 0, LEDGE_H - 0.2, 0.2)); // a steel nosing on the ledge
    s.add(mesh(box(W, RAIL_Y, 9), M('olive'), 0, RAIL_Y / 2, RAIL_Z - 4.5));
    s.add(mesh(box(W, 2, 10), M('steel', { spec: 1 }), 0, RAIL_Y + 0.6, RAIL_Z - 4));
    const p = this.panel;
    p.position.set(0, LEDGE_H, -LEDGE); p.rotation.x = -(Math.PI / 2 - PANEL_TILT);
    p.add(mesh(box(W, PANEL_L, 8), M('olive'), 0, PANEL_L / 2, -4));
    // seams between the panel's sections (where the plates meet: a dark joint, a lit lip)
    for (const x of [-222, -78, 150, 234]) p.add(mesh(box(1.2, PANEL_L, 1), M('rubber'), x, PANEL_L / 2, 0.1));
    // the screws that hold each plate: one in every corner, slots turned whichever way the fitter left them
    // (merged into two draws: heads and slots)
    const heads: [THREE.BufferGeometry, number, number, number, number?][] = [], slots: typeof heads = [];
    const hg = cyl(1.3, 1.3, 1, 6).rotateX(Math.PI / 2), sg = box(2.2, 0.5, 0.4);
    for (const [i, x] of [-318, -222, -78, 150, 234, 318].entries()) for (const y of [3, PANEL_L - 3]) {
      for (const dx of i === 0 ? [4] : i === 5 ? [-4] : [-4, 4]) { heads.push([hg, x + dx, y, 0.4]); slots.push([sg, x + dx, y, 0.95, (x * 7 + y * 13 + dx) % 3]); }
    }
    p.add(mesh(merged(heads), M('steel', { spec: 1 })), mesh(merged(slots), M('rubber')));
    s.add(p);
    // ---- MODE selector
    this.knob.root.position.set(-294, 17, 0); p.add(this.knob.root);
    // ---- the holds: hopper, furnace, sight glass, scale; each with its counter, cap and lamp
    const res: ResKind[] = ['ore', 'carbon', 'water', 'soil'], names = ['ORE', 'CARBON', 'WATER', 'SOIL'];
    res.forEach((r, i) => {
      const cx = -200 + i * 34;
      const v = new Vessel(r); v.root.position.set(cx - 9, 16, 1); p.add(v.root); this.vessels[r] = v;
      const c = new Counter(3); c.root.position.set(cx + 8.5, 22, 0); p.add(c.root); this.resCount[r] = c;
      const cap = new LiveDecal(18, 6, { flat: 0.7 }); cap.mesh.position.set(cx + 8.5, 13, 0.4); p.add(cap.mesh); this.resCap[r] = cap;
      const lb = stencil(names[i], cx, 32); p.add(lb);
      const lm = new Lamp(R.glowTeal[3], 1.4); lm.root.position.set(cx + 13, 7, 0); p.add(lm.root); this.resLamp[r] = lm;
    });
    // ---- hull, reactor, charge
    this.hull.root.position.set(-60, 20, 0); this.charge.root.position.set(-14, 20, 0);
    this.reactor.root.position.set(-37, 13, 0);
    this.hullTxt.mesh.position.set(-60, 5, 0.4); this.chgTxt.mesh.position.set(-14, 5, 0.4);
    p.add(this.hull.root, this.charge.root, this.reactor.root, this.hullTxt.mesh, this.chgTxt.mesh);
    // ---- the power drum, its readout, the plunger
    this.drum.root.position.set(24, 18, 0); p.add(this.drum.root);
    this.readout.mesh.position.set(80, 26, 0.4); p.add(this.readout.mesh);
    p.add(mesh(box(70, 19, 2), M('steel'), 80, 26, -0.8));
    p.add(stencil('POWER', 80, 13));
    this.plunger.root.position.set(132, 17, 0); p.add(this.plunger.root);
    // ---- core cells (the skill tree), clock, held ground
    const ex = this.extras; p.add(ex);
    this.cells.root.position.set(170, 22, 0); ex.add(this.cells.root, stencil('CELLS', 170, 32));
    this.cellLamp.root.position.set(182, 12, 0); ex.add(this.cellLamp.root);
    this.clock.root.position.set(212, 22, 0); ex.add(this.clock.root, stencil('TIME', 212, 32));
    this.ground.root.position.set(258, 22, 0); ex.add(this.ground.root, stencil('GND %', 258, 32));
    // ---- things on the ledge and the rail
    this.tube.root.position.set(176, LEDGE_H, -5); s.add(this.tube.root);
    this.menuLever.root.position.set(298, LEDGE_H + 2, -6); s.add(this.menuLever.root);
    this.menuLabel = stencil('MENU', 298, 4); p.add(this.menuLabel);
    this.tuckLever.root.position.set(-252, LEDGE_H + 2, -6); s.add(this.tuckLever.root);
    this.beacons[0].root.position.set(-150, RAIL_Y + 1.6, RAIL_Z - 4); this.beacons[1].root.position.set(286, RAIL_Y + 1.6, RAIL_Z - 4);
    s.add(this.beacons[0].root, this.beacons[1].root);
  }
  private slab(side: Side, mode: Mode) { let g = this.slabs[side][mode]; if (!g) { g = new THREE.Group(); g.visible = false; this.wing[side].add(g); this.slabs[side][mode] = g; } return g; }
  private put(side: Side, mode: Mode, o: THREE.Object3D, x: number, z: number, ry = 0, s = 1.6) { o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); this.slab(side, mode).add(o); return o; }
  private buildWings() {
    for (const side of ['L', 'R'] as Side[]) {
      const w = this.wing[side];
      // the deck: an olive top on a cabinet, a steel nosing, a low backboard
      w.add(mesh(box(WING_W, 60, DECK_D), M('olive'), 0, -30, -DECK_D / 2));
      w.add(mesh(box(WING_W, 1.6, DECK_D - 2), M('olive'), 0, 0.2, -DECK_D / 2));
      w.add(mesh(box(WING_W + 2, 2, 2), M('steel', { spec: 1 }), 0, 0.2, 0.4));
      w.add(mesh(box(WING_W, 10, 3), M('olive'), 0, 5, -DECK_D + 1.5));
      // a green baize blotter in a leather frame where the tools lie
      w.add(mesh(box(WING_W - 16, 0.8, DECK_D - 14), mat({ tint: R.sage[3] }), 0, 1.3, -DECK_D / 2 + 1), mesh(box(WING_W - 12, 0.6, DECK_D - 10), M('bake'), 0, 1, -DECK_D / 2 + 1));
      w.position.set(side === 'L' ? -WING_X : WING_X, DECK_Y, DECK_Z0);
    }
    const P = this.props;
    // BUILD (the left wing): the catalogue hat, the paint tin (refit), the production clipboard, the crew handset,
    // the works meter; Calder's bobblehead and the coffee on the end
    this.put('L', 'build', P.hat.root, -74, -16);
    this.put('L', 'build', P.tin.root, -46, -34);
    this.put('L', 'build', P.clip.root, -20, -16);
    this.put('L', 'build', P.radio.root, 8, -34);
    const wk = this.works;
    wk.root.add(mesh(box(44, 26, 10), M('olive'), 0, 13, -4));
    const face = new THREE.Group(); face.position.set(0, 3, 1); face.rotation.x = -0.35; wk.root.add(face);
    wk.gauge.root.position.set(-10, 13, 1); wk.store.root.position.set(12, 17, 1);  wk.crew.root.position.set(12, 6, 1); 
    wk.lamp.root.position.set(-19, 22, 1);
    face.add(wk.gauge.root, wk.store.root, wk.crew.root, wk.lamp.root, stencil('STORE', 12, 23.5), stencil('CREW', 12, 0.5));
    this.put('L', 'build', wk.root, 44, -30, 0, 1);
    this.put('L', 'build', P.bobble.root, 82, -14);
    this.put('L', 'build', P.mug.root, 88, -38);
    // COMMAND: the holo table on the left; the telemetry CRT, the ordnance crate, the rally horn and the
    // self-destruct on the right
    this.put('L', 'command', this.table.root, 0, -52, 0, 1);
    this.crt.root.position.set(-10, 26, -34); this.slab('R', 'command').add(this.crt.root);
    this.put('R', 'command', P.crate.root, -78, -14, 0.2);
    this.put('R', 'command', P.horn.root, 60, -12, -0.3);
    this.put('R', 'command', P.boom.root, 82, -36);
    // BIO (the left wing): the specimen jar (the bioworks ledger), the microscope (the lab), the family tree; the fan
    // and the lucky die
    this.put('L', 'bio', P.jar.root, -70, -24);
    this.put('L', 'bio', P.scope.root, -38, -28);
    this.put('L', 'bio', P.scroll.root, -2, -14);
    this.put('L', 'bio', P.lens2.root, 30, -36);
    this.put('L', 'bio', P.die.root, 52, -12);
    this.put('L', 'bio', P.fan.root, 80, -34, -0.4);
    // SURVEY: the orrery, the calendar, the binoculars and the overlay lens on the left; the table on the right
    this.put('L', 'survey', this.orrery.root, -66, -28, 0, 1.25);
    this.put('L', 'survey', P.cal.root, -28, -34);
    P.cal.show('bloom', 'Bloom', 1); // until the almanac turns its first page
    this.put('L', 'survey', P.bino.root, 8, -14);
    this.put('L', 'survey', P.lens.root, 44, -26);
    // the inspection clipboard rides on the strip, left of centre
    this.board.root.position.set(-62, 0, 0);
    const bh = new THREE.Group(); bh.position.set(0, RAIL_Y + 66, RAIL_Z - 8); bh.rotation.x = -0.32; bh.add(this.board.root); this.boardHolder = bh;
    this.strip.add(bh);
    void label; void decal;
  }

  /** phones and tablets: thumb pads on the ends, the spare readouts folded away, the levers moved in */
  setTouch(on: boolean) {
    if (on === this.touch) return;
    this.touch = on;
    if (on && !this.pads) { this.pads = new Pads(PANEL_TILT); this.strip.add(this.pads.left, this.pads.right); }
    if (this.pads) { this.pads.left.visible = this.pads.right.visible = on; }
    this.extras.visible = !on; this.beacons[1].root.visible = !on; this.tuckLever.root.visible = !on;
    // the readouts shift right to clear the stick's plinth; the levers come in from the ends
    this.panel.position.x = on ? 22 : 0;
    this.tube.root.position.x = on ? 196 : 176;
    this.menuLever.root.position.x = on ? 222 : 298; this.menuLabel.position.x = on ? 200 : 298;
    this.layout();
  }
  /** where the thumb pads are on the page (CSS px) for ui/touch.ts to dock its hit areas */
  padDock() {
    const P = this.pads; if (!P || !this.touch) return null;
    this.root.updateMatrixWorld(true);
    const v = new THREE.Vector3(), out: Partial<Record<PadId, { x: number; y: number; r: number }>> = {};
    const r = this.view.canvas.getBoundingClientRect(), k = r.width / this.view.W;
    for (const [id, c] of Object.entries(P.caps) as [PadId, typeof P.caps[PadId]][]) {
      c.root.getWorldPosition(v); const s = this.view.toScreen(v);
      out[id] = { x: s.x, y: s.y, r: (c.r + 4) * k * this.sc };
    }
    P.well.getWorldPosition(v); const w = this.view.toScreen(v);
    return { at: out, zone: { x: 0, y: Math.max(0, w.y - 130 * k), w: Math.max(40, w.x + 70 * k), h: innerHeight - Math.max(0, w.y - 130 * k) } };
  }
  /** pads follow the strip's ends */
  private placePads() {
    if (!this.pads) return;
    const W = this.view.W / this.sc;
    this.pads.left.position.set(-W / 2 + 62, 0, 0); this.pads.right.position.set(W / 2 - 97, 0, 0);
  }

  // ------------------------------------------------------------------ hot objects
  addHot(h: Hot) {
    this.hots.push(h);
    h.mats ??= matsOf(h.lift ?? h.obj);
    h.hv = 0;
    h.obj.traverse((o) => this.hotOf.set(o, h));
    return h;
  }
  /** test helper: the page position (CSS px) of the first hot object whose tag contains `name` */
  where(name: string): [number, number] | null {
    const h = this.hots.find((q) => q.name.includes(name) && visibleUp(q.obj)); if (!h) return null;
    this.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(h.obj), c = b.getCenter(new THREE.Vector3()), s = this.view.toScreen(c);
    return [Math.round(s.x), Math.round(s.y)];
  }
  private pick(x: number, y: number): { hot: Hot; hit: HitInfo } | null {
    this.view.ndc(x, y, this.ndc);
    this.ray.setFromCamera(this.ndc, this.view.cam);
    const objs = this.hots.filter((h) => visibleUp(h.obj)).map((h) => h.obj);
    const hits = this.ray.intersectObjects(objs, true);
    for (const it of hits) {
      let o: THREE.Object3D | null = it.object;
      while (o && !this.hotOf.has(o)) o = o.parent;
      if (!o) continue;
      if (!visibleUp(it.object) && !(it.object as THREE.Mesh).material) continue;
      const hot = this.hotOf.get(o)!;
      return { hot, hit: { point: it.point.clone(), local: hot.obj.worldToLocal(it.point.clone()), obj: it.object, x, y, button: 0, shift: false } };
    }
    return null;
  }
  private bindInput() {
    const cv = this.view.canvas;
    cv.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const p = this.pick(e.clientX, e.clientY);
      if (!p) return;
      p.hit.button = e.button; p.hit.shift = e.shiftKey;
      try { cv.setPointerCapture(e.pointerId); } catch { /* gone */ }
      this.drag = { hot: p.hot, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, id: e.pointerId, button: e.button, hit: p.hit };
      if (e.button === 0) p.hot.drag?.down?.(p.hit);
      p.hot.press = 1;
    });
    cv.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (d && d.id === e.pointerId) {
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 && d.hot.drag && d.button === 0) d.moved = true;
        if (d.moved) { const h = this.pick(e.clientX, e.clientY)?.hit ?? { ...d.hit, x: e.clientX, y: e.clientY }; d.hot.drag!.move(h, e.clientX - d.lx, e.clientY - d.ly); }
        d.lx = e.clientX; d.ly = e.clientY;
        return;
      }
      const p = this.pick(e.clientX, e.clientY);
      this.setHover(p?.hot ?? null);
      cv.style.cursor = p ? (p.hot.drag ? 'grab' : 'pointer') : '';
    });
    const end = (e: PointerEvent) => {
      const d = this.drag; if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (d.moved) { d.hot.drag?.up?.({ ...d.hit, x: e.clientX, y: e.clientY }); return; }
      if (e.type === 'pointercancel') return;
      const hit = { ...d.hit, button: d.button };
      if (d.button === 2) d.hot.alt?.(hit); else if (d.button === 0) { d.hot.drag?.up?.(hit); if (d.hot.click) { this.onClick?.(d.hot); d.hot.click(hit); } }
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!this.drag) { this.setHover(null); cv.style.cursor = ''; } });
    cv.addEventListener('wheel', (e) => { const p = this.pick(e.clientX, e.clientY); if (p?.hot.wheel) { e.preventDefault(); p.hot.wheel(e.deltaY, p.hit); } }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  private setHover(h: Hot | null) {
    if (h === this.hover) return;
    this.hover = h;
    this.onHover?.(h);
  }

  // ------------------------------------------------------------------ modes
  /** which wing shows what in each mode */
  static WINGS: Record<Mode, { L: boolean; R: boolean }> = {
    explore: { L: false, R: false }, build: { L: true, R: false }, command: { L: true, R: true }, bio: { L: true, R: false }, survey: { L: true, R: true },
  };
  setMode(m: Mode) {
    if (m === this.mode) return;
    this.mode = m;
    // the clipboard rides left of centre on the bare strip, in the gap between the wings when they are up
    this.board.root.position.x = m === 'explore' ? -62 : this.touch ? -40 : 0;
    // the table travels: on the left in COMMAND, on the right in SURVEY
  }
  /** the wings sink, swap and rise; the holo table moves to whichever wing the mode puts it on */
  private wings(dt: number) {
    for (const side of ['L', 'R'] as Side[]) {
      const want: Mode | null = !this.tucked && Desk.WINGS[this.mode][side] ? this.mode : null;
      const sp = this.wingSp[side];
      const target = want && this.shown[side] === want ? 0 : -1;
      const v = sp.step(target, dt);
      if (this.shown[side] !== want && v < -0.92) {
        // fully down: swap the slab
        if (this.shown[side]) this.slab(side, this.shown[side]!).visible = false;
        this.shown[side] = want;
        if (want) {
          if (want === 'survey' && side === 'R') this.put('R', 'survey', this.table.root, 0, -36, 0, 1);
          if (want === 'command' && side === 'L') this.put('L', 'command', this.table.root, 0, -52, 0, 1);
          this.slab(side, want).visible = true;
        }
      }
      // on touch screens the thumb pads own the ends: the wings come in toward the middle, a size smaller
      const w = this.wing[side], base = this.touch ? (side === 'L' ? -168 : 60) : side === 'L' ? -WING_X : WING_X;
      w.scale.setScalar(this.touch ? 0.8 : 1);
      w.position.set(base, DECK_Y + v * 92, DECK_Z0 + v * 30);
      w.rotation.x = v * 0.5;
      w.visible = v > -0.97;
    }
  }

  // ------------------------------------------------------------------ layout and the hit mask
  layout() {
    this.view.resize();
    const W = this.view.W;
    this.sc = W >= 640 ? 1 : W / 640;
    this.root.scale.setScalar(this.sc);
    this.placePads();
    this.maskKey = '';
  }
  /** the strip's top and the wings' tops on screen (CSS px from the bottom), for other UI to keep clear */
  private measure() {
    const r = this.view.canvas.getBoundingClientRect(), k = r.height / this.view.H;
    const v = new THREE.Vector3();
    const top = (y: number, z: number, x = 0) => { this.root.localToWorld(v.set(x, y, z)); this.view.toScreen(v, _s); return Math.max(0, r.bottom - _s.y); };
    const ty = this.tuckSp.x;
    this.stripTop = top(RAIL_Y + 2 + ty, RAIL_Z - 8);
    for (const side of ['L', 'R'] as Side[]) {
      const sp = this.wingSp[side].x;
      this.wingTop[side] = sp > -0.9 ? top(DECK_Y + sp * 92 + 30, DECK_Z0 - DECK_D + sp * 30, (side === 'L' ? -1 : 1) * WING_X) : this.stripTop;
    }
    this.wingW = (WING_W / this.view.W) * r.width * this.sc;
    void k;
  }
  /** trace a polygon round everything that stands on the desk: only those pixels take clicks */
  private mask() {
    const cv = this.view.canvas, r = cv.getBoundingClientRect();
    const cols = Math.ceil(r.width / 6), top = new Float32Array(cols).fill(r.height);
    const box3 = new THREE.Box3(), v = new THREE.Vector3(), cam = this.view.cam;
    const groups: THREE.Object3D[] = [this.strip];
    for (const side of ['L', 'R'] as Side[]) if (this.wing[side].visible) groups.push(...this.wing[side].children.filter((c) => c.visible));
    for (const h of this.hots) if (visibleUp(h.obj)) groups.push(h.obj);
    this.root.updateMatrixWorld(true);
    for (const g of groups) addBox(g);
    function addBox(o: THREE.Object3D) {
      // every visible mesh under o, by its own bounds (hidden parts do not take clicks)
      o.traverseVisible((m) => {
        const g = (m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        if (!g || !(m as THREE.Mesh).isMesh || !visibleUp(m)) return;
        if (!g.boundingBox) g.computeBoundingBox();
        box3.copy(g.boundingBox!).applyMatrix4(m.matrixWorld);
        let x0 = 1e9, x1 = -1e9, y0 = 1e9;
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? box3.max.x : box3.min.x, i & 2 ? box3.max.y : box3.min.y, i & 4 ? box3.max.z : box3.min.z);
          _proj(v);
          x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y);
        }
        const c0 = Math.max(0, Math.floor(x0 / 6)), c1 = Math.min(cols - 1, Math.floor(x1 / 6));
        for (let c = c0; c <= c1; c++) top[c] = Math.min(top[c], Math.max(0, y0 - 2));
      });
    }
    function _proj(p: THREE.Vector3) { p.project(cam); p.x = (p.x * 0.5 + 0.5) * r.width; p.y = (-p.y * 0.5 + 0.5) * r.height; }
    const pts: string[] = [`0px ${r.height}px`];
    let prev = -1;
    for (let c = 0; c < cols; c++) {
      const y = Math.round(top[c]);
      if (y !== prev) { pts.push(`${c * 6}px ${prev < 0 ? y : prev}px`, `${c * 6}px ${y}px`); prev = y; }
    }
    pts.push(`${r.width}px ${prev}px`, `${r.width}px ${r.height}px`);
    const key = pts.join(',');
    if (key !== this.maskKey) { this.maskKey = key; cv.style.clipPath = `polygon(${key})`; }
  }

  // ------------------------------------------------------------------ per frame
  jostle(k: number) {
    for (const p of Object.values(this.props)) p.jostle(k);
    this.tube.jostle(k);
    for (const v of Object.values(this.vessels)) v.kick((Math.random() - 0.5) * k * 3);
    this.hull.kick((Math.random() - 0.5) * k * 2); this.charge.kick((Math.random() - 0.5) * k * 2);
    this.shake.kick(k * 40);
  }
  update(dt: number) {
    this.t += dt;
    const ty = this.tuckSp.step(this.tucked ? -RAIL_Y - 4 : 0, dt);
    this.strip.position.y = ty;
    this.tuckLever.root.position.y = LEDGE_H + 2 - ty; // the tuck lever stays in reach
    this.wings(dt);
    // a hovered thing that sank away with its wing lets go of the pointer
    if (this.hover && !visibleUp(this.hover.obj)) this.setHover(null);
    // hover: lift and light
    for (const h of this.hots) {
      const on = h === this.hover ? 1 : 0;
      h.hv = (h.hv ?? 0) + (on - (h.hv ?? 0)) * Math.min(1, dt * 14);
      h.press = Math.max(0, (h.press ?? 0) - dt * 5);
      if (h.lift) h.lift.position.y = h.hv * (h.liftBy ?? 3) - h.press * 1.2;
      for (const m of h.mats ?? []) m.uniforms.uHover.value = h.hv * 0.9;
    }
    // jostles shake the whole desk a little
    const sh = this.shake.step(0, dt);
    this.root.position.set(Math.sin(this.t * 61) * sh * 0.02, sh * 0.015, 0);
    for (const p of Object.values(this.props)) p.update(dt);
    this.tube.update(dt);
    this.knob.update(dt, MODES.indexOf(this.mode));
    for (const v of Object.values(this.vessels)) v.update(dt);
    for (const c of Object.values(this.resCount)) c.update(dt);
    for (const l of Object.values(this.resLamp)) l.update(dt);
    this.hull.update(dt); this.charge.update(dt); this.reactor.update(dt);
    this.cells.update(dt); this.cellLamp.update(dt); this.clock.update(dt); this.ground.update(dt);
    for (const b of this.beacons) b.update(dt);
    this.menuLever.update(dt); this.tuckLever.update(dt);
    this.table.update(dt); this.crt.update(dt); this.orrery.update(dt); this.board.update(dt, this.t);
    this.pads?.update(dt, this.padState);
    this.works.gauge.update(dt); this.works.store.update(dt); this.works.crew.update(dt); this.works.lamp.update(dt);
    if ((this.maskT -= dt) <= 0) { this.maskT = 0.12; this.measure(); this.mask(); }
  }
  render() { this.view.render(); }
  dispose() { this.view.dispose(); }
}
const _s = new THREE.Vector2();
function visibleUp(o: THREE.Object3D) { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; }
export { MODES, type Mode, Prop };

// THE LAB (v7, the dock's LAB slot): the fitting bench. A painted steel frame holds ONE big 3D element, the worker
// creature itself, drawn through the UI kit (toon materials, black ink outline, pixel art at art resolution) on a
// lit turntable: drag to turn it, wheel to lean in. Its body slots are hotspots on it (sensor head, collar, tool arm,
// back rig, power pack, plating, fore and hind limbs). The parts float on the tool rack beside it as outlined 3D tool
// models: drag one onto its slot on the creature and it is welded on (a spark burst, the creature bounces, the weld
// sound); click a fitted slot to strip the part off again. What it becomes shows as icon and number chips under it
// (its job, carry, speed, armour, sight, control, power). FILE pays the parts' bill from the stores and files the
// fitted worker as a new design. No full 3D room, no text slop.
import * as THREE from 'three';
import { shipCSS, div, S, clean } from '../../ship/screen/ui';
import { partIcon } from '../../ship/screen/icons3d';
import { panel, pkey, slot, meter, section, para, kv, status, bindTip, showTip, hideTip, type Panel as KPanel, type PKey, type Slot as KSlot, type Status } from '../kit/panel';
import { KitView, type KView } from '../../ship/screen/kitview';
import { plate, strip } from '../kit/mat';
import { Px, P, INK, hex, bevel, rivet, screw, mixHex, glassWell } from '../kit/px';
import { libColor } from '../kit/libmat';
import { bitText, bitReady } from '../kit/bitfont';
import { uiSfx } from '../kit/sound';
import { onFrame, tween, ease, pop, burst, floatUp, Spring, shake, placeDust, squash } from '../kit/juice';
import { ModelView, toon, fitRoot } from '../kit/model3d';
import { toonify } from '../kit/models';
import { floatIcon } from '../kit/floatIcon';
import { buildSpeciesModel, type SpeciesModel } from '../../life/creatureMesh';
import type { Design } from '../../life/design';
import { CYBER, CYBER_PARTS, SLOT_NAME, SLOT_DESC, slotsFor, fitPart, unfitPart, fitCost, type Slot, type CyberPart } from '../../life/cyber/catalog';
import { ITEMS } from '../../factory/items';
import { workerProfile, type WorkerProfile } from '../../life/cyber/roles';
import { isAnatomy } from '../../life/titans/builders';
import { beastDesign } from '../../life/bestiary';
import { loadPart } from '../labBay';
import { have, pay } from '../../research/util';

export interface LabFitOpts { close?: (after: () => void) => Promise<void> | void; base?: Design }
const SLOT_ICON: Record<Slot, string> = { head: 'lens', collar: 'brain', tool: 'drill', back: 'crate', power: 'battery', armour: 'shield', fore: 'claw', hind: 'muscle' };
const ROLE_ICON: Record<string, string> = { hauler: 'crate', miner: 'pick', farmer: 'wheat', builder: 'wrench', operator: 'gear', guard: 'shield', scout: 'telescope' };
const ROLE_TEXT: Record<string, string> = {
  hauler: 'carries goods between stores, building sites and machines', miner: 'digs ore, stone and soil out of the deposits', farmer: 'sows, waters and harvests the fields',
  builder: 'builds and repairs structures and machines', operator: 'runs the machines: feeds them and works their controls', guard: 'stands watch and fights off threats', scout: 'ranges out ahead, spots and surveys',
};
const SKILL_NAME: Record<string, string> = { haul: 'Hauling', dig: 'Digging', farm: 'Farming', build: 'Building', operate: 'Operating', guard: 'Guarding', scout: 'Scouting' };
const SLOT_SHORT: Record<Slot, string> = { head: 'Sensor head', collar: 'Control collar', tool: 'Tool arm', back: 'Back rig', power: 'Power pack', armour: 'Plating', fore: 'Forelimbs', hind: 'Hind limbs' };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const cloneD = (d: Design): Design => JSON.parse(JSON.stringify(d));

/** the creature as a kit 3D element: its rest-pose geometry with its own painted page, outlined by the kit */
class Specimen {
  readonly group = new THREE.Group();
  model: SpeciesModel; mesh: THREE.Mesh; private geo: THREE.BufferGeometry;
  private tex = new Map<string, THREE.Texture>();
  /** slot anchors (creature space) and outward normals, from the rig and the body's own surface */
  anchors = new Map<Slot, { p: THREE.Vector3; n: THREE.Vector3 }>();
  ready = false;
  constructor(readonly d: Design) {
    this.model = buildSpeciesModel(d);
    this.geo = this.model.geo;
    this.mesh = new THREE.Mesh(this.geo, this.mat()); this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.ready = !(this.model as unknown as { live?: unknown }).live || !!(this.model as unknown as { ready?: boolean }).ready;
    this.findAnchors();
  }
  private raw(t: THREE.Texture) { let c = this.tex.get(t.uuid); if (!c) { c = t.clone(); c.colorSpace = THREE.NoColorSpace; c.magFilter = THREE.NearestFilter; c.needsUpdate = true; this.tex.set(t.uuid, c); } return c; }
  private mat() { return toon({ map: this.raw(this.model.tex), side: THREE.DoubleSide, rim: 0.18, gloss: 0.25 }); }
  /** the full model landed (anatomy builds off the main thread): swap it in */
  poll(): boolean {
    const up = (this.model as unknown as { ready?: boolean }).ready;
    if (this.model.geo !== this.geo) { this.geo = this.model.geo; this.mesh.geometry = this.geo; this.mesh.material = this.mat(); this.findAnchors(); this.ready = true; return true; }
    if (up && !this.ready) { this.ready = true; return true; }
    return false;
  }
  private findAnchors() {
    const rig = this.model.rig, rw = this.model.restWorld, P0 = this.geo.attributes.position as THREE.BufferAttribute;
    this.geo.computeBoundingBox();
    const bb = this.geo.boundingBox!, L = Math.max(0.2, bb.max.z - bb.min.z), Hh = Math.max(0.2, bb.max.y - bb.min.y);
    const V = (i: number) => new THREE.Vector3(...rw[i]);
    // the body's top and its side half-width near a length station z
    const at = (z: number, k = 0.07) => { let top = -1e9, side = 0; const w = L * k; for (let i = 0; i < P0.count; i += 3) { if (Math.abs(P0.getZ(i) - z) > w) continue; top = Math.max(top, P0.getY(i)); side = Math.max(side, Math.abs(P0.getX(i))); } return { top: top > -1e8 ? top : bb.max.y, side: side || 0.2 }; };
    const spine = [...rig.spine].filter((i) => i >= 0 && rw[i]).sort((a, b) => rw[a][2] - rw[b][2]);
    const front = spine.length ? V(spine[spine.length - 1]) : new THREE.Vector3(0, Hh * 0.6, L * 0.25), rear = spine.length ? V(spine[0]) : new THREE.Vector3(0, Hh * 0.6, -L * 0.25);
    const mid = front.clone().lerp(rear, 0.5);
    const head = rig.head >= 0 && rw[rig.head] ? V(rig.head) : new THREE.Vector3(0, Hh * 0.8, bb.max.z - L * 0.1);
    const neck = rig.neck.length ? V(rig.neck[Math.floor(rig.neck.length / 2)]) : head.clone().lerp(front, 0.5);
    const set = (s: Slot, p: THREE.Vector3, n: THREE.Vector3) => this.anchors.set(s, { p, n: n.normalize() });
    this.anchors.clear();
    set('head', head.clone().add(new THREE.Vector3(0, Hh * 0.12, L * 0.03)), new THREE.Vector3(0, 1, 0.6));
    set('collar', neck.clone().add(new THREE.Vector3(0, Hh * 0.06, 0)), new THREE.Vector3(0, 0.6, 0.6));
    const sm = at(mid.z), sf = at(front.z), sr = at(rear.z);
    set('back', new THREE.Vector3(0, sm.top + Hh * 0.04, mid.z), new THREE.Vector3(0, 1, 0));
    set('power', new THREE.Vector3(0, sr.top + Hh * 0.03, rear.z + (mid.z - rear.z) * 0.15), new THREE.Vector3(0, 1, -0.5));
    set('armour', new THREE.Vector3(sm.side, mid.y, mid.z), new THREE.Vector3(1, 0.2, 0));
    set('tool', new THREE.Vector3(sf.side * 0.9, sf.top - Hh * 0.05, front.z), new THREE.Vector3(1, 0.6, 0.3));
    const leg = (kind: 'fore' | 'hind') => { const l = rig.legs.find((x) => x.kind === kind && x.side > 0) ?? rig.legs.find((x) => x.kind === kind); if (!l || !l.bones.length) return null; return V(l.bones[Math.min(l.bones.length - 1, 1)]); };
    const fl = leg('fore'), hl = leg('hind');
    if (fl) set('fore', fl.setX(Math.abs(fl.x) + 0.02), new THREE.Vector3(1, 0, 0.3));
    if (hl) set('hind', hl.setX(Math.abs(hl.x) + 0.02), new THREE.Vector3(1, 0, -0.3));
  }
  dispose() { for (const t of this.tex.values()) t.dispose(); }
}

/** a part's floating model: the lowpix-built part (redrawn with the kit's toon and outline), else a machined stand-in */
function partModel(id: string): () => Promise<THREE.Object3D | null> {
  return async () => {
    const m = await loadPart(id).catch(() => null);
    if (m) { const c = m.clone(true); toonify(c); return c; }
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), toon({ color: 0x9aa0a6, metal: 0.8 })); g.add(b);
    const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 10), toon({ color: 0xd8a040, metal: 0.6 })); c2.rotation.z = Math.PI / 2; c2.position.y = 0.3; g.add(c2);
    return g;
  };
}

export class LabFit {
  static current: LabFit | null = null;
  readonly el: HTMLDivElement;
  private worker: KPanel; private bench: KPanel; private rack: KPanel;
  private cv: HTMLCanvasElement; private ov: HTMLCanvasElement; private oc: CanvasRenderingContext2D;
  private sockets = new Map<Slot, { sl: KSlot; lb: HTMLDivElement }>();
  private stat!: Status; private info: HTMLDivElement; private fileKey!: PKey;
  private bases: Design[] = []; private bi = 0;
  private d!: Design; private start!: Design;
  private spec: Specimen | null = null; private prevSpec: Specimen | null = null; private kv: KitView | null = null;
  private ghost: THREE.Object3D | null = null; private ghostSlot: Slot | null = null;
  private yaw = new Spring(2.6, { k: 30, d: 9 }); private pitch = new Spring(0.3, { k: 30, d: 9 }); private zoom = new Spring(0.7, { k: 60, d: 10 }); private sq = new Spring(0, { k: 260, d: 12 }); private base = 1.0;
  private cells: { id: string; sl: KSlot; el: HTMLDivElement }[] = [];
  private drag: { id: string; v: ModelView; el: HTMLDivElement } | null = null;
  private turn: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
  private hotSlot: Slot | null = null; private wantSlot: Slot | null = null;
  private flashes: { x: number; y: number; t: number }[] = [];
  private prof: WorkerProfile | null = null; private lastStats: number[] | null = null;
  private off: (() => void)[] = []; private closing = false; private wasPaused = false; private t = 0; private dirty = true; private acc = 0;
  private cw = 0; private ch = 0;
  constructor(readonly game: any, readonly o: LabFitOpts = {}) {
    LabFit.current = this; (window as unknown as { __lab7?: LabFit }).__lab7 = this;
    shipCSS();
    this.el = div('s7'); div('s7-veil', this.el);
    this.worker = panel({ title: 'THE WORKER', tone: 'gun', lamps: ['green', 'amber'], knobs: 1 });
    this.bench = panel({ title: 'FITTING BENCH', tone: 'gun', serial: 'LAB-2', lamps: ['green', 'amber', 'red'], stencil: 'DRAG A PART ONTO ITS SOCKET', handles: true });
    this.rack = panel({ title: 'PARTS RACK', tone: 'olive', lamps: ['amber'], toggles: 2 });
    for (const p of [this.worker, this.bench, this.rack]) { p.el.style.position = 'absolute'; this.el.append(p.el); p.body.style.height = '100%'; }
    const bb = this.bench.body; bb.style.overflow = 'hidden';
    this.cv = document.createElement('canvas'); this.cv.className = 's7-abs s7-mini'; bb.append(this.cv);
    this.ov = document.createElement('canvas'); this.ov.className = 's7-abs s7-ov'; bb.append(this.ov); this.oc = this.ov.getContext('2d')!;
    for (const c of [this.cv, this.ov]) c.style.imageRendering = 'pixelated';
    const back = pkey('BACK  [ESC]', () => this.back(), { tone: 'red', lamp: false, sound: 'back', h: 24 }); Object.assign(back.style, { position: 'absolute', right: '84px', top: '17px' }); this.el.append(back);
    this.info = div('', this.worker.body); this.info.style.height = '100%'; this.info.style.overflow = 'hidden auto';
    document.body.append(this.el);
    if (game) { this.wasPaused = !!game.paused; game.paused = true; }
    this.bases = this.candidates();
    this.d = cloneD(o.base ?? this.bases[0]); this.start = cloneD(this.d);
    this.layout();
    this.buildSpecimen(true);
    this.buildRack();
    this.bindInput();
    this.off.push(onFrame((dt) => { if (!this.el.isConnected) return false; this.frame(dt); return true; }) as unknown as () => void);
    addEventListener('keydown', this.onKey, true); addEventListener('resize', this.onResize);
    this.off.push(() => { removeEventListener('keydown', this.onKey, true); removeEventListener('resize', this.onResize); hideTip(); });
    game?.emit?.('screen-open', { id: 'lab' });
  }
  private candidates(): Design[] {
    const reg = this.game?.run?.reg?.list ?? [];
    const mine = reg.filter((s: any) => s.owner === 'veyr' && s.role === 'design').map((s: any) => s.design as Design).reverse();
    const wild = reg.filter((s: any) => s.owner !== 'veyr' && s.design).map((s: any) => s.design as Design);
    const out = [...mine, ...wild].filter((d) => { try { return isAnatomy(d); } catch { return false; } }).slice(0, 8);
    if (!out.length) out.push(beastDesign('knuckler', 7), beastDesign('woolpuff', 3));
    return out;
  }
  private enter() {
    [this.worker.el, this.bench.el, this.rack.el].forEach((e, i) => { e.style.transform = `translateY(${innerHeight}px)`; void tween(560 + i * 100, (k) => { e.style.transform = `translateY(${Math.round((1 - k) * 220)}px)`; }, ease.outBack).then(() => { e.style.transform = ''; }); });
    uiSfx('swishIn', 0.6); setTimeout(() => uiSfx('metalClose', 0.45), 400);
    this.yaw.target = this.base; this.zoom.target = 1;
  }
  async ready() {
    const t0 = performance.now();
    while (this.spec && !this.spec.ready && performance.now() - t0 < 5000) { await new Promise((r) => setTimeout(r, 120)); if (this.spec.poll()) { this.kv = this.viewOf(this.spec); this.dirty = true; } }
    this.enter();
  }

  // ---------------------------------------------------------------- layout
  private onResize = () => { this.layout(); this.dirty = true; };
  private layout() {
    const W = innerWidth, H = innerHeight, m = 14, lw = 400, rw = Math.max(420, Math.min(520, Math.round(W * 0.27)));
    const cw = W - lw - rw - m * 4;
    Object.assign(this.worker.el.style, { left: m + 'px', top: m + 'px', width: lw + 'px', height: H - m * 2 + 'px' });
    Object.assign(this.bench.el.style, { left: m * 2 + lw + 'px', top: m + 'px', width: cw + 'px', height: H - m * 2 + 'px' });
    Object.assign(this.rack.el.style, { left: m * 3 + lw + cw + 'px', top: m + 'px', width: rw + 'px', height: H - m * 2 + 'px' });
    this.cw = Math.floor((cw - 32) / S); this.ch = Math.floor((H - m * 2 - 64) / S);
    for (const c of [this.cv, this.ov]) { c.width = this.cw; c.height = this.ch; c.style.left = '0'; c.style.top = '0'; c.style.width = this.cw * S + 'px'; c.style.height = this.ch * S + 'px'; c.getContext('2d')!.imageSmoothingEnabled = false; }
  }
  private parts(): CyberPart[] { const sl = slotsFor(this.d.plan); return CYBER_PARTS.filter((p) => sl.includes(p.slot) && (!p.plans || p.plans.includes(this.d.plan))); }
  /** the rack: every part that fits, each in a slot with its icon rendered from its model and its name under it */
  private buildRack() {
    this.cells = []; this.rack.body.replaceChildren();
    const b = this.rack.body; b.style.overflow = 'hidden auto';
    b.append(section('PARTS THAT FIT', SLOT_SHORT_PLAN(this.d.plan)), para('Drag a part onto its socket on the worker, or click it. Hover a part for what it does and costs.', { dim: true }));
    const grid = div('', b); grid.style.display = 'grid'; grid.style.gridTemplateColumns = 'repeat(3, 1fr)'; grid.style.gap = '8px 6px';
    for (const pt of this.parts()) {
      const cell = div('', grid); cell.style.display = 'flex'; cell.style.flexDirection = 'column'; cell.style.alignItems = 'center'; cell.dataset.part = pt.id;
      const sl = slot(64, { title: clean(pt.name) });
      void partIcon(pt.id, 48).then((ic) => sl.set({ icon: ic }));
      sl.set({ state: (this.d.fit ?? []).includes(pt.id) ? 3 : 1, n: SLOT_TAG[pt.slot] });
      cell.append(sl.el);
      const nm = para(clean(pt.name)); nm.style.textAlign = 'center'; nm.style.margin = '2px 0 0'; nm.style.fontSize = '16px'; cell.append(nm);
      bindTip(sl.el, () => this.partTip(pt));
      sl.el.addEventListener('pointerenter', () => { this.wantSlot = pt.slot; this.dirty = true; });
      sl.el.addEventListener('pointerleave', () => { if (!this.drag) { this.wantSlot = null; this.dirty = true; } });
      sl.el.addEventListener('pointerdown', (e) => this.grab(e, pt.id, sl.el));
      this.cells.push({ id: pt.id, sl, el: cell });
    }
  }
  private markFitted() { for (const c of this.cells) c.sl.set({ state: (this.d.fit ?? []).includes(c.id) ? 3 : 1 }); }
  private partTip(pt: CyberPart) {
    const cur = this.prof ?? workerProfile(this.d), next = workerProfile({ ...this.d, fit: fitPart(this.d.fit, pt.id) });
    const rows: [string, string | number, string?][] = [];
    for (const [it, n] of Object.entries(pt.cost)) if (n > 0) rows.push([clean(ITEMS[it]?.name ?? it), `${this.game ? have(this.game, it) : '--'} / ${n}`]);
    const ch: string[] = [];
    const dl = (name: string, a: number, b: number, unit: string, f = 0) => { const dd = b - a; if (Math.abs(dd) >= 0.05) ch.push(`${name} ${dd > 0 ? '+' : ''}${dd.toFixed(f)}${unit}`); };
    dl('Carry', cur.carry, next.carry, ' units'); dl('Speed', cur.speed, next.speed, ' m/s', 1); dl('Armour', cur.armour * 100, next.armour * 100, '%'); dl('Sight', cur.sight, next.sight, ' m'); dl('Control', cur.control * 100, next.control * 100, '%'); dl('Power', cur.needs.power, next.needs.power, '/min', 1);
    const short = this.game && Object.entries(pt.cost).some(([it, n]) => have(this.game, it) < n);
    return { title: clean(pt.name), sub: `${SLOT_SHORT[pt.slot]} socket`, desc: clean(pt.desc) + (ch.length ? ` Changes: ${ch.join(', ')}.` : '') + (next.role !== cur.role ? ` Makes it a ${next.roleName}.` : ''), rows, status: [short ? 'The stores are short of parts for it.' : 'Drag it onto its socket.', short ? 'warn' : 'info'] as [string, 'warn' | 'info'] };
  }

  // ---------------------------------------------------------------- the creature
  private buildSpecimen(first = false) {
    const keep = this.spec;
    let s: Specimen;
    try { s = new Specimen(this.d); } catch (e) { console.error('lab specimen', e); return; }
    if (!first && keep && !s.ready) { this.prevSpec?.dispose(); this.prevSpec = s; return; }
    this.setSpec(s);
  }
  private setSpec(s: Specimen) {
    this.spec?.dispose(); this.spec = s; this.prevSpec = null;
    if (this.ghost) { this.ghost.removeFromParent(); this.ghost = null; this.ghostSlot = null; }
    this.kv = this.viewOf(s);
    this.prof = workerProfile(this.d); this.paintInfo();
    this.bench.setTitle(`FITTING BENCH : ${clean(this.d.name || 'SPECIMEN').toUpperCase().slice(0, 22)}`);
    this.dirty = true;
  }
  private viewOf(s: Specimen) { s.group.removeFromParent(); s.group.position.set(0, 0, 0); s.group.rotation.set(0, 0, 0); s.group.updateMatrixWorld(true); return new KitView(s.group, { ink: 2, edge: 0.05, rimK: 1, shadow: [3, 4, 0.45] }); }
  private get view(): KView { return { w: this.cw, h: this.ch, yaw: this.yaw.x, pitch: this.pitch.x, zoom: this.zoom.x * 1.2, lift: 0.04 }; }
  private slotPts(): { s: Slot; x: number; y: number; fitted: string | null; facing: boolean }[] {
    if (!this.spec || !this.kv) return [];
    const v = this.view, side = -Math.sin(v.yaw) >= 0 ? 1 : -1, out: { s: Slot; x: number; y: number; fitted: string | null; facing: boolean }[] = [];
    for (const s of slotsFor(this.d.plan)) {
      const a = this.spec.anchors.get(s); if (!a) continue;
      const p = a.p.clone(), n = a.n.clone(); if (Math.abs(p.x) > 1e-3) { p.x = Math.abs(p.x) * side; n.x = Math.abs(n.x) * side; }
      const [x, y, f] = this.kv.project(p, v, n);
      out.push({ s, x, y, fitted: (this.d.fit ?? []).find((id) => CYBER[id]?.slot === s) ?? null, facing: f });
    }
    return out;
  }
  slotScreen(s: Slot): [number, number] | null { const p = this.slotPts().find((q) => q.s === s); if (!p) return null; const c = this.cv.getBoundingClientRect(); return [Math.round(c.left + p.x * S), Math.round(c.top + p.y * S)]; }
  /** the worker housing: the job explained, its numbers with units, its skills, its upkeep, what to do next, FILE */
  private paintInfo() {
    const p = this.prof; if (!p) return;
    const prev = this.lastStats, b = this.info; b.replaceChildren();
    const nav = div('s7-row-top', b);
    const prevK = pkey('<', () => this.cycle(-1), { w: 40, tone: 'cream', lamp: false, sound: 'tab' }), nextK = pkey('>', () => this.cycle(1), { w: 40, tone: 'cream', lamp: false, sound: 'tab' });
    const nm = para(clean(this.d.name || 'Specimen')); nm.style.flex = '1'; nm.style.textAlign = 'center'; nm.style.color = '#ffe39a'; nm.style.margin = '0';
    nav.append(prevK, nm, nextK);
    b.append(section('ITS JOB', p.roleName), para(`It ${ROLE_TEXT[p.role] ?? 'works'}.`));
    b.append(section('NUMBERS'));
    const vals: [string, number, string, number, string?][] = [
      ['Carry', Math.round(p.carry), 'units', p.carry, 'How much it hauls at once.'], ['Speed', +p.speed.toFixed(1), 'm/s', p.speed, 'Walking speed with its load.'],
      ['Armour', Math.round(p.armour * 100), '%', p.armour * 100], ['Sight', Math.round(p.sight), 'm', p.sight], ['Control', Math.round(p.control * 100), '%', p.control * 100, 'Obedience: a collar keeps it on task.'],
      ['Power', p.needs.power < 0 ? 0 : +p.needs.power.toFixed(1), p.needs.power < 0 ? 'own cell' : 'per min', p.needs.power],
    ];
    const kvs = vals.map(([k, v, u, , t]) => { const e = kv(k, p.needs.power < 0 && k === 'Power' ? 'own cell' : v, { unit: k === 'Power' && p.needs.power < 0 ? undefined : u, title: t }); b.append(e.el); return e; });
    b.append(section('BEST AT'));
    const top = (Object.entries(p.skills) as [string, number][]).sort((a, c) => c[1] - a[1]).slice(0, 3);
    for (const [k, n] of top) b.append(meter((SKILL_NAME[k] ?? k).toUpperCase(), n / 10, { w: 140, segs: 10, col: 'green', value: `${Math.round(n)}/10` }).el);
    b.append(section('UPKEEP'), kv('Food', p.needs.food.toFixed(1), { unit: 'biomass/min' }).el, kv('Works then rests', `${Math.round(p.needs.work)} / ${Math.round(p.needs.rest)}`, { unit: 'min' }).el, kv('Part wear', (p.needs.maint * 100).toFixed(0), { unit: '%/h' }).el);
    this.stat = status('', 'info'); b.append(this.stat.el);
    this.fileKey = pkey('FILE THE DESIGN', () => this.file(), { tone: 'yellow', lamp: 'green', hazard: true, sound: 'confirm' }); b.append(this.fileKey);
    this.paintStatus();
    if (prev) vals.forEach(([, , , n], i) => { const dd = n - prev[i]; if (Math.abs(dd) > 0.05) setTimeout(() => { const r = kvs[i].el.getBoundingClientRect(); floatUp(r.right - 30, r.top - 4, (dd > 0 ? '+' : '') + (Math.abs(dd) < 3 ? dd.toFixed(1) : Math.round(dd)), { color: dd > 0 ? '#b8f0a0' : '#ffa090', size: 16 }); pop(kvs[i].el, 0.6); }, 60 + i * 50); });
    this.lastStats = vals.map((v) => v[3]);
  }
  private paintStatus() {
    const np = this.newParts(), bl = this.bill(), short = this.game ? Object.entries(bl).filter(([k, n]) => have(this.game, k) < n) : [];
    const n = Object.values(bl).reduce((a, x) => a + x, 0);
    if (!np.length) this.stat.set('Drag a part from the rack onto its socket. Click a fitted socket to take the part off.', 'info');
    else if (short.length) this.stat.set(`Short of ${short.map(([k, x]) => `${x - have(this.game, k)} ${clean(ITEMS[k]?.name ?? k)}`).join(', ')}: the stores cannot pay for the new parts yet.`, 'warn');
    else this.stat.set(`${np.length} new part${np.length > 1 ? 's' : ''}: FILE pays ${n} items from the stores and files this worker as a new design.`, 'ok');
    this.fileKey.setDisabled(!!this.fileOff());
  }

  // ---------------------------------------------------------------- input
  private bindInput() {
    const cv = this.cv;
    const local = (e: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / S, (e.clientY - r.top) / S] as [number, number]; };
    cv.addEventListener('pointerdown', (e) => { if (e.button > 0) return; const [x, y] = local(e); this.turn = { x, y, yaw: this.yaw.target, pitch: this.pitch.target, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = local(e);
      if (this.turn) { const dx = x - this.turn.x, dy = y - this.turn.y; if (!this.turn.moved && Math.hypot(dx, dy) > 3) { this.turn.moved = true; cv.classList.add('drag'); } if (this.turn.moved) { this.yaw.target = this.base = this.turn.yaw + dx * 0.012; this.pitch.target = clamp(this.turn.pitch + dy * 0.006, 0.05, 0.9); } }
    });
    cv.addEventListener('pointerup', (e) => { this.turn = null; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch { /* */ } });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom.target = clamp(this.zoom.target * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.8, 1.8); uiSfx('tick', 0.25, 1.3); }, { passive: false });
    this.el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.back(); });
  }
  /** the body's sockets: kit slots standing over the creature where each part goes, named */
  private placeSockets() {
    const pts = this.slotPts(), seen = new Set<Slot>(), body = this.bench.body;
    for (const p of pts) {
      seen.add(p.s);
      let s = this.sockets.get(p.s);
      if (!s) {
        const sl = slot(40, { title: SLOT_SHORT[p.s], hover: 'hover' }); sl.el.style.position = 'absolute'; sl.el.style.zIndex = '3'; body.append(sl.el);
        const lb = para(''); lb.style.position = 'absolute'; lb.style.zIndex = '3'; lb.style.margin = '0'; lb.style.pointerEvents = 'none'; lb.style.whiteSpace = 'nowrap'; body.append(lb);
        sl.el.addEventListener('click', () => { const id = (this.d.fit ?? []).find((q) => CYBER[q]?.slot === p.s); if (id) { const pp = this.slotPts().find((q) => q.s === p.s); if (pp) this.strip(id, pp.x, pp.y); } else { uiSfx('tick', 0.5); this.wantSlot = p.s; for (const c of this.cells) if (CYBER[c.id]?.slot === p.s) pop(c.el, 0.6); } });
        bindTip(sl.el, () => { const id = (this.d.fit ?? []).find((q) => CYBER[q]?.slot === p.s); return { title: SLOT_SHORT[p.s], sub: id ? clean(CYBER[id].name) : 'Empty socket', desc: clean(SLOT_DESC_[p.s] ?? ''), status: [id ? 'Click to take the part off.' : 'Drag a part for it from the rack.', 'info'] }; });
        s = { sl, lb }; this.sockets.set(p.s, s);
      }
      const on = p.s === this.hotSlot, want = p.s === this.wantSlot;
      s.sl.set({ state: on ? 2 : want ? 3 : p.fitted ? 1 : 0 });
      if (p.fitted && s.sl.el.dataset.fit !== p.fitted) { s.sl.el.dataset.fit = p.fitted; const fid = p.fitted; void partIcon(fid, 28).then((ic) => { if (s!.sl.el.dataset.fit === fid) s!.sl.set({ icon: ic }); }); }
      if (!p.fitted && s.sl.el.dataset.fit) { s.sl.el.dataset.fit = ''; s.sl.set({ icon: null }); }
      s.sl.el.style.left = Math.round(p.x * S - 20) + 'px'; s.sl.el.style.top = Math.round(p.y * S - 20) + 'px';
      s.sl.el.style.opacity = p.facing || on || want ? '1' : '0.55';
      s.lb.textContent = p.fitted ? `${SLOT_SHORT[p.s]}: ${clean(CYBER[p.fitted]?.name ?? '')}` : SLOT_SHORT[p.s];
      s.lb.style.left = Math.round(p.x * S + 24) + 'px'; s.lb.style.top = Math.round(p.y * S - 9) + 'px';
      s.lb.style.color = on ? '#fff0c0' : p.fitted ? '#ffd890' : '#d8d0b8'; s.lb.style.opacity = p.facing || on || want ? '1' : '0.5';
    }
    for (const [k, s] of this.sockets) if (!seen.has(k)) { s.sl.el.remove(); s.lb.remove(); this.sockets.delete(k); }
  }
  private grab(e: PointerEvent, id: string, from: HTMLElement) {
    if (e.button > 0 || this.closing) return;
    e.preventDefault(); hideTip();
    // the part lifts off the rack as a floating, outlined 3D model that follows the pointer
    const v = new ModelView(partModel(id), { w: 56, h: 52, scale: S, spin: 1.2, hotSpin: 3, pitch: 0.45, zoom: 1.0, shadow: [3, 5, 0.45] });
    const g = div('', this.el); g.style.position = 'fixed'; g.style.zIndex = '9500'; g.style.pointerEvents = 'none'; g.append(v.cv);
    const put = (cx: number, cy: number) => { g.style.left = Math.round(cx - 56) + 'px'; g.style.top = Math.round(cy - 52) + 'px'; };
    put(e.clientX, e.clientY);
    this.drag = { id, v, el: g }; this.wantSlot = CYBER[id].slot; uiSfx('pluck', 0.6); v.hot(true); v.press(0.8);
    from.setPointerCapture(e.pointerId);
    let moved = false; const x0 = e.clientX, y0 = e.clientY;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) { moved = true; uiSfx('swishIn', 0.3); }
      put(ev.clientX, ev.clientY); v.point(ev.clientX, ev.clientY);
      const c = this.cv.getBoundingClientRect(), lx = (ev.clientX - c.left) / S, ly = (ev.clientY - c.top) / S;
      const tgt = this.slotPts().find((p) => p.s === CYBER[id].slot), near = !!tgt && Math.hypot(tgt.x - lx, tgt.y - ly) < 50;
      if ((near ? tgt!.s : null) !== this.hotSlot) { this.hotSlot = near ? tgt!.s : null; if (near) uiSfx('tick', 0.5, 1.3); }
    };
    const up = (ev: PointerEvent) => {
      from.removeEventListener('pointermove', move); from.removeEventListener('pointerup', up); from.removeEventListener('pointercancel', up);
      try { from.releasePointerCapture(ev.pointerId); } catch { /* */ }
      const drop = this.hotSlot === CYBER[id].slot, tgt = this.slotPts().find((p) => p.s === CYBER[id].slot);
      this.drag = null;
      if ((drop || !moved) && tgt) {
        const c = this.cv.getBoundingClientRect(), tx = c.left + tgt.x * S, ty = c.top + tgt.y * S, sx = parseFloat(g.style.left) + 56, sy = parseFloat(g.style.top) + 52;
        void tween(moved ? 140 : 300, (k) => put(sx + (tx - sx) * k, sy + (ty - sy) * k), ease.inCubic).then(() => { v.dispose(); g.remove(); this.fit(id, tgt.x, tgt.y); });
      } else {
        uiSfx('back', 0.4);
        const r = from.getBoundingClientRect(), sx = parseFloat(g.style.left) + 56, sy = parseFloat(g.style.top) + 52, tx = r.left + r.width / 2, ty = r.top + r.height / 2;
        void tween(300, (k) => put(sx + (tx - sx) * k, sy + (ty - sy) * k), ease.outCubic).then(() => { v.dispose(); g.remove(); });
      }
      this.hotSlot = null; this.wantSlot = null;
    };
    from.addEventListener('pointermove', move); from.addEventListener('pointerup', up); from.addEventListener('pointercancel', up);
  }
  private fit(id: string, x: number, y: number) {
    const pt = CYBER[id]; if (!pt) return;
    const was = (this.d.fit ?? []).find((f) => CYBER[f]?.slot === pt.slot);
    this.d.fit = fitPart(this.d.fit, id);
    const c = this.cv.getBoundingClientRect(), sx = c.left + x * S, sy = c.top + y * S;
    burst(sx, sy, { n: 34, ramp: P.glowAmber, kind: 'spark', layer: 'ui', speed: 260, life: 0.7 });
    burst(sx, sy, { n: 10, ramp: P.steel, kind: 'chip', layer: 'ui', speed: 160 });
    placeDust(sx, sy + 6, 0.25, { ground: 'metal', layer: 'ui', sound: false });
    this.flashes.push({ x, y, t: 0.35 });
    uiSfx('metal', 0.7); uiSfx('glitch', 0.35, 1.4); setTimeout(() => uiSfx('thudHeavy', 0.5), 70); setTimeout(() => uiSfx('scratch', 0.3, 1.6), 140);
    this.sq.kick(7); this.yaw.kick(1.5); shake(this.bench.el, 2, 160);
    floatUp(sx, sy - 20, was ? `SWAPPED: ${clean(pt.name).toUpperCase()}` : `FITTED: ${clean(pt.name).toUpperCase()}`, { color: '#ffd890', size: 16 });
    this.game?.emit?.('mastery-xp', { path: 'robotics', n: 4, why: 'Part fitted' });
    this.attachGhost(id);
    this.buildSpecimen();
    this.prof = workerProfile(this.d); this.paintInfo(); this.markFitted();
    this.dirty = true;
  }
  private attachGhost(id: string) {
    const sp = this.spec; if (!sp) return;
    const a = sp.anchors.get(CYBER[id].slot); if (!a) return;
    void partModel(id)().then((m) => {
      if (!m || this.spec !== sp) return;
      if (this.ghost) this.ghost.removeFromParent();
      const box = new THREE.Box3().setFromObject(sp.mesh), L = box.getSize(new THREE.Vector3()).length();
      const g = fitRoot(m); g.scale.setScalar((L * 0.18) / ((g.userData.fitR as number) || 1));
      const side = -Math.sin(this.yaw.x) >= 0 ? 1 : -1, p = a.p.clone(); if (Math.abs(p.x) > 1e-3) p.x = Math.abs(p.x) * side;
      g.position.copy(p); sp.group.add(g); this.ghost = g; this.ghostSlot = CYBER[id].slot; this.dirty = true;
    });
  }
  private strip(id: string, x: number, y: number) {
    this.d.fit = unfitPart(this.d.fit, id);
    const c = this.cv.getBoundingClientRect(), sx = c.left + x * S, sy = c.top + y * S;
    burst(sx, sy, { n: 14, ramp: P.steel, kind: 'chip', layer: 'ui', speed: 200 });
    uiSfx('clunk', 0.6); uiSfx('metalClose', 0.4);
    floatUp(sx, sy - 16, `REMOVED: ${clean(CYBER[id]?.name ?? '').toUpperCase()}`, { color: '#c8c0a8', size: 16 });
    this.sq.kick(-4);
    if (this.ghost && this.ghostSlot === CYBER[id].slot) { this.ghost.removeFromParent(); this.ghost = null; }
    this.buildSpecimen(); this.prof = workerProfile(this.d); this.paintInfo(); this.markFitted();
  }
  private cycle(dir: -1 | 1) {
    if (this.bases.length < 2) { uiSfx('error', 0.4); return; }
    this.bi = (this.bi + dir + this.bases.length) % this.bases.length;
    this.d = cloneD(this.bases[this.bi]); this.start = cloneD(this.d);
    uiSfx('swishOut', 0.5);
    this.zoom.x = 0.6; this.yaw.kick(dir * 10);
    this.buildSpecimen(true); this.buildRack();
  }
  private newParts() { const was = new Set(this.start.fit ?? []); return (this.d.fit ?? []).filter((id) => !was.has(id)); }
  private bill() { return fitCost(this.newParts()); }
  private fileOff(): string | false {
    if (JSON.stringify(this.d.fit ?? []) === JSON.stringify(this.start.fit ?? [])) return 'NOTHING FITTED';
    if (!this.game) return false;
    const b = this.bill(); for (const k in b) if (have(this.game, k) < b[k]) return 'SHORT OF PARTS';
    return false;
  }
  private file() {
    const g = this.game, b = this.bill();
    if (g && Object.keys(b).length && !pay(g, b)) { uiSfx('error', 0.5); return; }
    const d = cloneD(this.d), p = workerProfile(d);
    d.name = `${clean(d.name || 'Worker').replace(/ (HAULER|MINER|FARMER|BUILDER|OPERATOR|GUARD|SCOUT)( \d+)?$/i, '')} ${p.roleName}`;
    try { g?.addDesign?.(d, null, 0); } catch (e) { console.error('file design', e); }
    g?.emit?.('prefab', { kind: 'creature', name: d.name });
    this.sq.kick(10); this.yaw.kick(18); shake(this.bench.el, 4, 300); uiSfx('confirm', 0.8); uiSfx('bong', 0.5);
    const r = this.cv.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height * 0.5, { n: 40, ramp: P.glowTeal, kind: 'spark', layer: 'ui', speed: 300 });
    floatUp(r.left + r.width / 2, r.top + r.height * 0.3, 'FILED: ' + clean(d.name).toUpperCase(), { color: '#b8f0a0', size: 32 });
    this.start = cloneD(this.d); this.bases.unshift(cloneD(d)); this.bi = 0; this.paintStatus();
  }

  // ---------------------------------------------------------------- frame
  private frame(dt: number) {
    this.t += dt;
    if (!this.turn && !this.drag && this.t > 1.2) this.yaw.target = this.base + Math.sin(this.t * 0.35) * 0.3;
    this.yaw.step(dt); this.pitch.step(dt); this.zoom.step(dt); this.sq.step(dt);
    if (this.prevSpec && (this.prevSpec.poll() || this.prevSpec.ready)) this.setSpec(this.prevSpec);
    if (this.spec?.poll()) { this.kv = this.viewOf(this.spec); this.dirty = true; }
    const moving = !this.yaw.settled || !this.pitch.settled || !this.zoom.settled || !this.sq.settled;
    this.acc += dt;
    if (this.kv && (this.dirty || (moving && this.acc > 1 / 30))) { this.acc = 0; this.dirty = false; this.kv.draw(this.cv.getContext('2d')!, this.view, { squash: this.sq.x * 0.03 }); }
    this.placeSockets();
    // weld flashes, and sparks from the slot while the regrown body is on its way
    const c = this.oc; c.clearRect(0, 0, this.ov.width, this.ov.height);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.t -= dt; if (f.t <= 0) { this.flashes.splice(i, 1); continue; }
      const k = f.t / 0.35, r = 4 + (1 - k) * 22;
      c.fillStyle = k > 0.6 ? '#ffffff' : '#ffd890'; c.globalAlpha = k;
      c.fillRect(Math.round(f.x - r), Math.round(f.y), Math.round(r * 2), 1); c.fillRect(Math.round(f.x), Math.round(f.y - r), 1, Math.round(r * 2));
      c.fillRect(Math.round(f.x - r * 0.3), Math.round(f.y - r * 0.3), Math.round(r * 0.6), Math.round(r * 0.6));
      c.globalAlpha = 1;
    }
    if (this.prevSpec && this.ghostSlot && Math.random() < 0.3) { const q = this.slotPts().find((s) => s.s === this.ghostSlot); if (q) { const r = this.cv.getBoundingClientRect(); burst(r.left + q.x * S, r.top + q.y * S, { n: 3, ramp: P.glowAmber, kind: 'spark', layer: 'ui', speed: 160, life: 0.4 }); } }
  }
  private onKey = (e: KeyboardEvent) => {
    if (!this.el.isConnected || this.closing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.back(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') this.yaw.target = this.base += e.key === 'ArrowLeft' ? -0.4 : 0.4;
    e.stopPropagation();
  };
  back() { this.close(); }
  close() {
    if (this.closing) return; this.closing = true; hideTip();
    uiSfx('swishOut', 0.6);
    void tween(340, (k) => { this.el.style.transform = `translateY(${Math.round(k * k * 320)}px)`; this.el.style.opacity = String(1 - k * 0.6); }, ease.inCubic).then(async () => { if (this.o.close) await this.o.close(() => this.dispose()); else this.dispose(); });
  }
  dispose() {
    this.closing = true;
    for (const f of this.off) try { f(); } catch { /* */ }
    this.off = [];
    this.spec?.dispose(); this.prevSpec?.dispose();
    this.worker.dispose(); this.bench.dispose(); this.rack.dispose();
    this.el.remove();
    if (this.game) this.game.paused = this.wasPaused;
    if (LabFit.current === this) LabFit.current = null;
  }
}
const SLOT_TAG: Record<Slot, string> = { head: 'HD', collar: 'CL', tool: 'TL', back: 'BK', power: 'PW', armour: 'AR', fore: 'FL', hind: 'HL' };
const SLOT_DESC_: Partial<Record<Slot, string>> = SLOT_DESC as Partial<Record<Slot, string>>;
const SLOT_SHORT_PLAN = (plan: string) => `${slotsFor(plan as never).length} SOCKETS`;
void showTip; void Px;

export async function openLabFit(game: any, o: LabFitOpts = {}): Promise<LabFit | null> {
  if (LabFit.current) return LabFit.current;
  const f = new LabFit(game, o);
  await f.ready();
  return f;
}

// THE LAB (v7, the dock's LAB slot): the fitting bench. A painted steel frame holds ONE big 3D element, the worker
// creature itself, drawn through the UI kit (toon materials, black ink outline, pixel art at art resolution) on a
// lit turntable: drag to turn it, wheel to lean in. Its body slots are hotspots on it (sensor head, collar, tool arm,
// back rig, power pack, plating, fore and hind limbs). The parts float on the tool rack beside it as outlined 3D tool
// models: drag one onto its slot on the creature and it is welded on (a spark burst, the creature bounces, the weld
// sound); click a fitted slot to strip the part off again. What it becomes shows as icon and number chips under it
// (its job, carry, speed, armour, sight, control, power). FILE pays the parts' bill from the stores and files the
// fitted worker as a new design. No full 3D room, no text slop.
import * as THREE from 'three';
import { shipCSS, div, place, artCanvas, S, keyCap, chip, iconOf, itemImg, clean, ringSprite, textEl } from '../../ship/screen/ui';
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
import { CYBER, CYBER_PARTS, SLOT_NAME, slotsFor, fitPart, unfitPart, fitCost, type Slot, type CyberPart } from '../../life/cyber/catalog';
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
  private frameEl: HTMLDivElement; private bg: HTMLCanvasElement;
  private cv: HTMLCanvasElement; private ov: HTMLCanvasElement; private oc: CanvasRenderingContext2D;
  private rack: HTMLDivElement; private stats: HTMLDivElement; private nameEl: HTMLDivElement; private roleEl: HTMLDivElement; private statusEl: HTMLDivElement; private slotLabels = new Map<Slot, HTMLDivElement>();
  private tag: HTMLDivElement;
  private AW = 0; private AH = 0; private well = { x: 0, y: 0, w: 0, h: 0 }; private rackR = { x: 0, y: 0, w: 0, h: 0 };
  private bases: Design[] = []; private bi = 0;
  private d!: Design; private start!: Design;
  private spec: Specimen | null = null; private prevSpec: Specimen | null = null; private kv: KitView | null = null;
  private ghost: THREE.Object3D | null = null; private ghostSlot: Slot | null = null;
  private yaw = new Spring(2.6, { k: 30, d: 9 }); private pitch = new Spring(0.3, { k: 30, d: 9 }); private zoom = new Spring(0.7, { k: 60, d: 10 }); private base = 1.0; private sq = new Spring(0, { k: 260, d: 12 });
  private views: { id: string; v: ModelView; el: HTMLDivElement }[] = [];
  private drag: { id: string; el: HTMLDivElement; v: ModelView; ox: number; oy: number } | null = null;
  private turn: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
  private hotSlot: Slot | null = null; private wantSlot: Slot | null = null;
  private flashes: { x: number; y: number; t: number }[] = [];
  private prof: WorkerProfile | null = null;
  private off: (() => void)[] = []; private closing = false; private wasPaused = false; private t = 0; private dirty = true; private acc = 0;
  private fileKey: ReturnType<typeof keyCap> | null = null;
  constructor(readonly game: any, readonly o: LabFitOpts = {}) {
    LabFit.current = this; (window as unknown as { __lab7?: LabFit }).__lab7 = this;
    shipCSS();
    this.el = div('s7'); div('s7-veil', this.el);
    this.frameEl = div('s7-frame', this.el);
    this.bg = artCanvas(8, 8); this.frameEl.append(this.bg);
    this.cv = artCanvas(8, 8, 's7-abs s7-mini'); this.frameEl.append(this.cv);
    this.ov = artCanvas(8, 8, 's7-abs s7-ov'); this.frameEl.append(this.ov); this.oc = this.ov.getContext('2d')!;
    this.rack = div('s7-abs', this.frameEl);
    this.stats = div('s7-abs', this.frameEl); this.stats.style.display = 'flex'; this.stats.style.gap = 3 * S + 'px'; this.stats.style.alignItems = 'center';
    this.nameEl = div('s7-abs k7-t16', this.frameEl); this.nameEl.style.color = hex(P.brass[0]); this.nameEl.style.textShadow = `1px 1px 0 ${hex(P.brass[5])}`; this.nameEl.style.textAlign = 'center';
    this.roleEl = div('s7-abs', this.frameEl); this.roleEl.style.pointerEvents = 'none';
    this.statusEl = div('s7-abs', this.frameEl); this.statusEl.style.pointerEvents = 'none';
    this.tag = div('s7-tag off', this.frameEl); this.tag.style.zIndex = '8';
    document.body.append(this.el);
    if (game) { this.wasPaused = !!game.paused; game.paused = true; }
    this.bases = this.candidates();
    this.d = cloneD(o.base ?? this.bases[0]); this.start = cloneD(this.d);
    this.layout();
    void bitReady().then(() => { if (!this.closing) this.paintBg(); });
    this.buildSpecimen(true);
    this.buildRack();
    this.bindInput();
    this.off.push(onFrame((dt) => { if (!this.el.isConnected) return false; this.frame(dt); return true; }) as unknown as () => void);
    addEventListener('keydown', this.onKey, true); addEventListener('resize', this.onResize);
    this.off.push(() => { removeEventListener('keydown', this.onKey, true); removeEventListener('resize', this.onResize); });
    game?.emit?.('screen-open', { id: 'lab' });
  }
  /** the creatures that can go on the bench: your designs, then what you have absorbed; a bestiary worker at worst */
  private candidates(): Design[] {
    const reg = this.game?.run?.reg?.list ?? [];
    const mine = reg.filter((s: any) => s.owner === 'veyr' && s.role === 'design').map((s: any) => s.design as Design).reverse();
    const wild = reg.filter((s: any) => s.owner !== 'veyr' && s.design).map((s: any) => s.design as Design);
    const out = [...mine, ...wild].filter((d) => { try { return isAnatomy(d); } catch { return false; } }).slice(0, 8);
    if (!out.length) out.push(beastDesign('knuckler', 7), beastDesign('woolpuff', 3));
    return out;
  }
  private enter() {
    this.frameEl.style.transform = `translateY(${this.AH * S}px)`;
    void tween(600, (k) => { this.frameEl.style.transform = `translateY(${Math.round((1 - k) * 140) * S}px)`; }, ease.outBack).then(() => { this.frameEl.style.transform = ''; });
    uiSfx('swishIn', 0.6); setTimeout(() => uiSfx('metalClose', 0.45), 400);
    this.yaw.target = this.base; this.zoom.target = 1;
    this.views.forEach((v, i) => { v.el.style.opacity = '0'; setTimeout(() => { v.el.style.opacity = ''; pop(v.el, 1); uiSfx('tick', 0.3, 0.9 + i * 0.04); }, 450 + i * 55); });
  }
  /** keep the cover on until the creature is grown (anatomy builds off the main thread; 5 s at most) */
  async ready() {
    const t0 = performance.now();
    while (this.spec && !this.spec.ready && performance.now() - t0 < 5000) { await new Promise((r) => setTimeout(r, 120)); if (this.spec.poll()) { this.kv = this.viewOf(this.spec); this.dirty = true; } }
    this.enter();
  }

  // ---------------------------------------------------------------- layout and paint
  private onResize = () => { this.layout(); this.paintBg(); this.buildRack(); this.dirty = true; };
  private layout() {
    const AW = this.AW = Math.floor(innerWidth / S), AH = this.AH = Math.floor(innerHeight / S);
    const W = Math.min(AW - 24, 940), H = Math.min(AH - 24, 520), X = Math.floor((AW - W) / 2), Y = Math.floor((AH - H) / 2);
    place(this.frameEl, X, Y, W, H);
    this.bg.width = W; this.bg.height = H; place(this.bg, 0, 0, W, H);
    const rw = Math.max(220, Math.min(268, Math.round(W * 0.29)));
    this.well = { x: 12, y: 40, w: W - rw - 12 - 22, h: H - 40 - 52 };
    this.rackR = { x: W - rw - 12, y: 40, w: rw, h: H - 40 - 56 };
    for (const c of [this.cv, this.ov]) { c.width = this.well.w - 8; c.height = this.well.h - 8; place(c, this.well.x + 4, this.well.y + 4, this.well.w - 8, this.well.h - 8); c.getContext('2d')!.imageSmoothingEnabled = false; }
    place(this.rack, this.rackR.x, this.rackR.y, this.rackR.w, this.rackR.h);
    place(this.stats, this.well.x + 4, H - 46, this.well.w - 8, 34);
    place(this.roleEl, this.well.x + 10, this.well.y + this.well.h - 40, this.well.w - 20);
    place(this.statusEl, this.well.x + 10, this.well.y + 8, this.well.w - 20);
    place(this.nameEl, 40, 13, 160);
    if (!this.fileKey) {
      this.fileKey = keyCap(this.frameEl, { label: 'FILE', icon: iconOf('dna', 'amber'), w: 120, h: 34, mat: 'orange', sound: 'confirm', off: () => this.fileOff(), onClick: () => this.file() });
      this.fileKey.el.style.position = 'absolute';
      const arrows = (dir: -1 | 1) => { const k = keyCap(this.frameEl, { label: dir < 0 ? '<' : '>', w: 22, h: 24, mat: 'steel', sound: 'tab', onClick: () => this.cycle(dir) }); k.el.style.position = 'absolute'; return k; };
      this.prevK = arrows(-1); this.nextK = arrows(1);
      const back = floatIcon({ build: backLever, name: 'BACK', size: [34, 30], nameSize: 16, sound: 'back', view: { pitch: 0.5, spin: 0, yaw0: 0.4 }, onClick: () => this.back() });
      back.el.classList.add('s7-abs'); back.el.style.zIndex = '7'; this.frameEl.append(back.el); this.backEl = back.el;
    }
    place(this.fileKey.el, W - 12 - 126, H - 48);
    place(this.prevK!.el, 14, 9); place(this.nextK!.el, 202, 9);
    if (this.backEl) place(this.backEl, W - 46, -8);
  }
  private prevK: ReturnType<typeof keyCap> | null = null; private nextK: ReturnType<typeof keyCap> | null = null; private backEl: HTMLElement | null = null;
  private paintBg() {
    const W = this.bg.width, H = this.bg.height;
    const p = plate(W, H, { mat: 'steel', seed: 33, screws: true, wear: 1, chamfer: 6, lip: 3, grime: 0.8 });
    p.blit(strip(170, 26, 'brass', 8), 38, 8);
    // the bench well: dark machined steel lit from above, a hex turntable pad under the creature
    const w = this.well;
    bevel(p, w.x - 3, w.y - 3, w.w + 6, w.h + 6, P.steel, { chamfer: 4, sunk: true });
    const cx = w.x + w.w / 2, cy = w.y + w.h * 0.45;
    for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) {
      const d = Math.hypot((x - cx) / (w.w * 0.55), (y - cy) / (w.h * 0.75));
      p.set(x, y, libColor('gun', x, y, 0.36 + Math.max(0, 1 - d) * 0.5));
    }
    const px = cx, py = w.y + w.h * 0.8, rx = w.w * 0.34, ry = rx * 0.3;
    for (let y = Math.floor(py - ry - 2); y < py + ry + 10; y++) for (let x = Math.floor(px - rx - 2); x < px + rx + 2; x++) {
      const a = Math.atan2((y - py) / ry, (x - px) / rx), hexR = Math.cos(Math.PI / 6) / Math.cos(((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6);
      const d = Math.hypot((x - px) / rx, (y - py) / ry) / hexR, d2 = Math.hypot((x - px) / rx, (y - 7 - py) / ry) / hexR;
      if (d < 0.97) p.set(x, y, libColor('machined', x, y, 0.55 + (1 - d) * 0.35 - (y > py ? 0.08 : 0)));
      else if (d < 1.02) p.set(x, y, INK);
      else if (y > py && d2 < 0.99) p.set(x, y, libColor('steel', x, y, 0.42));
      else if (y > py && d2 < 1.04) p.set(x, y, INK);
    }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6, bx = Math.round(px + Math.cos(a) * rx * 0.8), by = Math.round(py + Math.sin(a) * ry * 0.8); rivet(p, bx, by, 1, P.steel); }
    // the tool rack: a machined steel board with a sunk hex pad per part
    const r = this.rackR;
    bevel(p, r.x - 3, r.y - 3, r.w + 6, r.h + 6, P.steel, { chamfer: 4, sunk: true });
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) p.set(x, y, libColor('darkSteel', x, y, 0.55));
    for (const s of this.padRects()) { glassWell(p, s.x, s.y, s.w, s.h, 0x14181c, { glare: false }); screw(p, s.x + 2, s.y + 2, s.x); }
    // the stats rail
    bevel(p, w.x, H - 48, w.w, 38, P.steel, { chamfer: 3, sunk: true });
    for (let x = 30; x < W - 160; x += 14) rivet(p, x, H - 6, 1, P.steel);
    const c = this.bg.getContext('2d')!; c.imageSmoothingEnabled = false; c.putImageData(p.image(), 0, 0);
  }
  private padRects() {
    const r = this.rackR, parts = this.parts(), cols = 3, pw = Math.floor((r.w - 12) / cols), ph = Math.min(80, Math.floor((r.h - 12) / Math.ceil(parts.length / cols)));
    return parts.map((_, i) => ({ x: r.x + 6 + (i % cols) * pw + 2, y: r.y + 6 + Math.floor(i / cols) * ph + 2, w: pw - 4, h: ph - 4 }));
  }
  private parts(): CyberPart[] { const sl = slotsFor(this.d.plan); return CYBER_PARTS.filter((p) => sl.includes(p.slot) && (!p.plans || p.plans.includes(this.d.plan))); }
  private buildRack() {
    for (const v of this.views) v.v.dispose();
    this.views = []; this.rack.replaceChildren();
    const pads = this.padRects();
    this.parts().forEach((pt, i) => {
      const r = pads[i], el = div('s7-abs', this.rack); place(el, r.x - this.rackR.x, r.y - this.rackR.y, r.w, r.h); el.style.cursor = 'grab'; el.style.touchAction = 'none'; el.dataset.part = pt.id;
      const v = new ModelView(partModel(pt.id), { w: r.w, h: r.h, scale: S, spin: 0.5, hotSpin: 2.8, pitch: 0.45, zoom: 1.0, shadow: [2, 2, 0.45], frames: 32 });
      el.append(v.cv);
      const nm = textEl(clean(pt.name), { color: '#e8dcc0', wrap: false }); nm.style.position = 'absolute'; nm.style.left = 2 * S + 'px'; nm.style.bottom = '0'; nm.style.width = (r.w - 4) * S + 'px'; nm.style.overflow = 'hidden'; nm.style.textOverflow = 'clip'; nm.style.pointerEvents = 'none'; el.append(nm);
      el.title = `${clean(pt.name)} (${SLOT_SHORT[pt.slot]}): ${clean(pt.desc)}`;
      el.addEventListener('pointerenter', (e) => { v.hot(true); v.point(e.clientX, e.clientY); uiSfx('hover', 0.4); this.wantSlot = pt.slot; this.showTag(pt, el); this.dirty = true; });
      el.addEventListener('pointermove', (e) => v.point(e.clientX, e.clientY));
      el.addEventListener('pointerleave', () => { v.hot(false); if (!this.drag) { this.wantSlot = null; this.hideTag(); this.dirty = true; } });
      el.addEventListener('pointerdown', (e) => this.grab(e, pt.id, el, v));
      this.views.push({ id: pt.id, v, el });
      this.markFitted();
    });
  }
  private markFitted() { for (const x of this.views) { const on = (this.d.fit ?? []).includes(x.id); x.el.style.filter = on ? 'brightness(.45) saturate(.4)' : ''; } }
  private showTag(pt: CyberPart, el: HTMLElement) {
    const cur = this.prof ?? workerProfile(this.d), next = workerProfile({ ...this.d, fit: fitPart(this.d.fit, pt.id) });
    const W = 230, col: HTMLElement[] = [];
    col.push(textEl(clean(pt.name.toUpperCase()), { color: '#ffe7a8', wrap: false }), textEl(`Fits the ${SLOT_SHORT[pt.slot].toLowerCase()} slot.`, { color: '#9ab8d8', wrap: false }), textEl(clean(pt.desc), { color: '#d8ccb0' }));
    col.push(textEl('PARTS IT TAKES', { color: '#c8a050', wrap: false }));
    for (const [it, n] of Object.entries(pt.cost)) if (n > 0) { const h = this.game ? have(this.game, it) : n; col.push(textEl(`${n} x ${clean(ITEMS[it]?.name ?? it)} (have ${h})`, { color: h >= n ? '#b8e0a0' : '#ff9a80', wrap: false })); }
    const ch: string[] = [];
    const dl = (name: string, a: number, b: number, unit: string, f = 0) => { const d = b - a; if (Math.abs(d) >= 0.05) ch.push(`${name} ${d > 0 ? '+' : ''}${d.toFixed(f)}${unit}`); };
    dl('Carry', cur.carry, next.carry, ' units'); dl('Speed', cur.speed, next.speed, ' m/s', 1); dl('Armour', cur.armour * 100, next.armour * 100, '%'); dl('Sight', cur.sight, next.sight, ' m'); dl('Control', cur.control * 100, next.control * 100, '%'); dl('Power', cur.needs.power, next.needs.power, '/min', 1);
    if (ch.length) { col.push(textEl('WHAT IT CHANGES', { color: '#c8a050', wrap: false })); col.push(textEl(ch.join(', ') + '.', { color: '#e8dcc0' })); }
    if (next.role !== cur.role) col.push(textEl(`Makes it a ${next.roleName}: it ${ROLE_TEXT[next.role] ?? ''}.`, { color: '#ffd890' }));
    col.push(textEl('Drag it onto its glowing slot, or click it.', { color: '#8a8478', wrap: false }));
    this.tag.replaceChildren();
    const pl = div('s7-abs', this.tag), box = div('', this.tag); box.style.position = 'relative'; box.style.padding = `${6 * S}px ${7 * S}px`; box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.gap = '0'; box.style.width = W * S + 'px';
    box.append(...col);
    requestAnimationFrame(() => { const w = Math.ceil(box.offsetWidth / S), h = Math.ceil(box.offsetHeight / S); const cv = plate(w, h, { mat: 'gun', seed: 3, chamfer: 3, wear: 0.5, lip: 2, screws: true }).canvas(); cv.style.width = w * S + 'px'; cv.style.height = h * S + 'px'; pl.replaceChildren(cv); });
    const fr = this.frameEl.getBoundingClientRect(), r = el.getBoundingClientRect();
    place(this.tag, Math.round((r.left - fr.left) / S - W - 12), Math.round(Math.min((r.top - fr.top) / S, this.AH - 260)));
    this.tag.style.transform = 'none'; this.tag.classList.remove('off');
  }
  private hideTag() { this.tag.classList.add('off'); }

  // ---------------------------------------------------------------- the creature
  private buildSpecimen(first = false) {
    const keep = this.spec;
    let s: Specimen;
    try { s = new Specimen(this.d); } catch (e) { console.error('lab specimen', e); return; }
    // keep showing the old body until the new one is fully grown (anatomy builds off the main thread)
    if (!first && keep && !s.ready) { this.prevSpec?.dispose(); this.prevSpec = s; return; }
    this.setSpec(s);
  }
  private setSpec(s: Specimen) {
    this.spec?.dispose(); this.spec = s; this.prevSpec = null;
    if (this.ghost) { this.ghost.removeFromParent(); this.ghost = null; this.ghostSlot = null; }
    this.kv = this.viewOf(s);
    this.prof = workerProfile(this.d); this.paintStats(); this.paintName();
    this.dirty = true;
  }
  /** a fresh kit view framing the specimen (re-fitted when its body changes) */
  private viewOf(s: Specimen) { s.group.removeFromParent(); s.group.position.set(0, 0, 0); s.group.rotation.set(0, 0, 0); s.group.updateMatrixWorld(true); return new KitView(s.group, { ink: 2, edge: 0.05, rimK: 1, shadow: [3, 4, 0.45] }); }
  private get view(): KView { return { w: this.cv.width, h: this.cv.height, yaw: this.yaw.x, pitch: this.pitch.x, zoom: this.zoom.x * 1.28, lift: 0.07 }; }
  /** the slot points on the side facing the camera */
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
  private paintName() { this.nameEl.textContent = clean((this.d.name || 'SPECIMEN').toUpperCase()).slice(0, 16); }
  private stat(ic: string, v: string, pal: 'amber' | 'steel' | 'lit' = 'steel') { return chip(iconOf(ic, pal), v, { iconPx: 18 }); }
  private paintStats() {
    const p = this.prof; if (!p) return;
    const prev = this.lastStats;
    const vals: [string, string, number][] = [
      ['crate', `CARRY ${Math.round(p.carry)}`, p.carry], ['drone', `SPEED ${p.speed.toFixed(1)} M/S`, p.speed], ['shield', `ARMOUR ${Math.round(p.armour * 100)}%`, p.armour * 100],
      ['lens', `SIGHT ${Math.round(p.sight)} M`, p.sight], ['brain', `CONTROL ${Math.round(p.control * 100)}%`, p.control * 100], ['battery', p.needs.power < 0 ? 'POWER: OWN CELL' : `POWER ${p.needs.power.toFixed(1)}/MIN`, p.needs.power],
    ];
    const chips = vals.map(([ic, s]) => this.stat(ic, s));
    this.stats.replaceChildren(...chips);
    this.stats.style.flexWrap = 'wrap'; this.stats.style.gap = 2 * S + 'px';
    // the job, explained, with its best skills and what it needs to keep working
    const top = (Object.entries(p.skills) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, n]) => n > 0.5);
    this.roleEl.replaceChildren(
      textEl(`${p.roleName}: it ${ROLE_TEXT[p.role] ?? 'works'}.`, { color: '#ffd890' }),
      textEl(`Best at ${top.map(([k, n]) => `${SKILL_NAME[k] ?? k} ${Math.round(n)}/10`).join(', ') || 'nothing yet'}. Eats ${p.needs.food.toFixed(1)} biomass/min, works ${Math.round(p.needs.work)} min then rests ${Math.round(p.needs.rest)}.`, { color: '#d8ccb0' }),
    );
    if (prev) vals.forEach(([, , n], i) => { const d = n - prev[i]; if (Math.abs(d) > 0.05) setTimeout(() => { const r = chips[i].getBoundingClientRect(); floatUp(r.left + r.width / 2, r.top - 4, (d > 0 ? '+' : '') + (Math.abs(d) < 3 ? d.toFixed(1) : Math.round(d)), { color: d > 0 ? '#b8f0a0' : '#ffa090', size: 16 }); pop(chips[i], 0.9); }, 60 + i * 50); });
    if (prev && prev[6] !== (p.role as unknown as number)) pop(this.roleEl, 1);
    this.lastStats = [...vals.map((v) => v[2]), p.role as unknown as number];
    this.paintStatus();
    this.fileKey?.refresh();
  }
  /** the bench's status line: what to do next */
  private paintStatus() {
    const np = this.newParts(), b = this.bill(), short = this.game ? Object.entries(b).filter(([k, n]) => have(this.game, k) < n) : [];
    const n = Object.values(b).reduce((a, x) => a + x, 0);
    const s = !np.length ? 'Drag a part from the rack onto its glowing slot. Click a fitted slot to take it off.'
      : short.length ? `Short of ${short.map(([k, x]) => `${x - have(this.game, k)} ${clean(ITEMS[k]?.name ?? k)}`).join(', ')}: the stores cannot pay for the new parts yet.`
      : `${np.length} new part${np.length > 1 ? 's' : ''}: FILE pays ${n} items from the stores and files this worker as a new design.`;
    this.statusEl.replaceChildren(textEl(s, { color: short.length ? '#ff9a80' : np.length ? '#b8f0a0' : '#d8ccb0' }));
  }
  private lastStats: number[] | null = null;

  // ---------------------------------------------------------------- input: turn the creature, drag parts onto it
  private bindInput() {
    const cv = this.cv;
    const local = (e: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / S, (e.clientY - r.top) / S] as [number, number]; };
    cv.addEventListener('pointerdown', (e) => { if (e.button > 0) return; const [x, y] = local(e); this.turn = { x, y, yaw: this.yaw.target, pitch: this.pitch.target, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = local(e);
      if (this.turn) { const dx = x - this.turn.x, dy = y - this.turn.y; if (!this.turn.moved && Math.hypot(dx, dy) > 3) { this.turn.moved = true; cv.classList.add('drag'); } if (this.turn.moved) { this.yaw.target = this.base = this.turn.yaw + dx * 0.012; this.pitch.target = clamp(this.turn.pitch + dy * 0.006, 0.05, 0.9); } return; }
      const h = this.slotNear(x, y, 14); if (h !== this.hotSlot) { this.hotSlot = h; if (h) uiSfx('hover', 0.4); this.dirty = true; cv.style.cursor = h ? 'pointer' : ''; }
    });
    cv.addEventListener('pointerup', (e) => {
      const t = this.turn; this.turn = null; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch { /* */ }
      if (!t || t.moved) return;
      const [x, y] = local(e), s = this.slotNear(x, y, 14);
      if (s) { const id = (this.d.fit ?? []).find((p) => CYBER[p]?.slot === s); if (id) this.strip(id, x, y); else { uiSfx('tick', 0.5); this.wantSlot = s; this.pulseRack(s); } }
    });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom.target = clamp(this.zoom.target * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.8, 1.8); uiSfx('tick', 0.25, 1.3); }, { passive: false });
    this.el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.back(); });
  }
  /** QA: a slot's point on screen (client px) */
  slotScreen(s: Slot): [number, number] | null { const p = this.slotPts().find((q) => q.s === s); if (!p) return null; const c = this.cv.getBoundingClientRect(); return [Math.round(c.left + p.x * S), Math.round(c.top + p.y * S)]; }
  private slotNear(x: number, y: number, r: number): Slot | null { let best: Slot | null = null, bd = r; for (const p of this.slotPts()) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p.s; } } return best; }
  private pulseRack(s: Slot) { for (const v of this.views) if (CYBER[v.id]?.slot === s) { pop(v.el, 0.8); v.v.poke(8); } }
  private grab(e: PointerEvent, id: string, el: HTMLDivElement, v: ModelView) {
    if (e.button > 0 || this.closing) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    this.drag = { id, el, v, ox: e.clientX - r.left, oy: e.clientY - r.top };
    this.wantSlot = CYBER[id].slot; v.press(0.8); uiSfx('pluck', 0.6); el.style.cursor = 'grabbing'; el.style.zIndex = '9';
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - (r.left + this.drag!.ox), dy = ev.clientY - (r.top + this.drag!.oy);
      if (!moved && Math.hypot(dx, dy) > 4) { moved = true; this.hideTag(); uiSfx('swishIn', 0.3); }
      el.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) rotate(${Math.max(-12, Math.min(12, dx * 0.02))}deg) scale(1.15)`; el.style.opacity = '0.88';
      v.hot(true);
      const c = this.cv.getBoundingClientRect(), lx = (ev.clientX - c.left) / S, ly = (ev.clientY - c.top) / S;
      const over = lx >= 0 && ly >= 0 && lx < this.cv.width && ly < this.cv.height;
      const tgt = over ? this.slotPts().find((p) => p.s === CYBER[id].slot) : null;
      const near = !!tgt && Math.hypot(tgt.x - lx, tgt.y - ly) < 90;
      if ((near ? tgt!.s : null) !== this.hotSlot) { this.hotSlot = near ? tgt!.s : null; if (near) uiSfx('tick', 0.5, 1.3); this.dirty = true; }
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      try { el.releasePointerCapture(ev.pointerId); } catch { /* */ }
      const drop = this.hotSlot === CYBER[id].slot;
      const tgt = this.slotPts().find((p) => p.s === CYBER[id].slot);
      this.drag = null; el.style.cursor = 'grab'; v.hot(false);
      if ((drop || !moved) && tgt) {
        // fly to the slot, then weld
        const c = this.cv.getBoundingClientRect(), tx = c.left + tgt.x * S, ty = c.top + tgt.y * S, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const m0 = el.style.transform;
        void tween(moved ? 140 : 300, (k) => { el.style.transform = `translate(${Math.round((tx - cx) * k)}px, ${Math.round((ty - cy) * k)}px) scale(${1.15 - k * 0.6})`; el.style.opacity = String(1 - k * 0.7); }, ease.inCubic).then(() => {
          void m0; el.style.transform = ''; el.style.opacity = ''; el.style.zIndex = '';
          this.fit(id, tgt.x, tgt.y);
        });
      } else {
        // not on its slot: it floats home
        uiSfx('back', 0.4);
        const m = /translate\((-?\d+)px, (-?\d+)px\)/.exec(el.style.transform), dx = m ? Number(m[1]) : 0, dy = m ? Number(m[2]) : 0;
        void tween(320, (k) => { el.style.transform = `translate(${Math.round(dx * (1 - k))}px, ${Math.round(dy * (1 - k))}px) scale(${1.15 - k * 0.15})`; }, ease.outBack).then(() => { el.style.transform = ''; el.style.zIndex = ''; el.style.opacity = ''; });
      }
      this.hotSlot = null; this.wantSlot = null; this.dirty = true;
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  /** weld a part on at its slot (canvas point): sparks, flash, the creature bounces, the body regrows with it */
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
    this.sq.kick(7); this.yaw.kick(1.5); shake(this.frameEl, 2, 160);
    if (was) floatUp(sx, sy - 20, 'SWAP', { color: '#ffd890', size: 16 });
    this.game?.emit?.('mastery-xp', { path: 'robotics', n: 4, why: 'Part fitted' });
    // the part itself snaps onto the old body at once (outlined), until the regrown body lands
    this.attachGhost(id);
    this.buildSpecimen();
    this.prof = workerProfile(this.d); this.paintStats(); this.markFitted();
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
  /** strip a fitted part off (click its slot) */
  private strip(id: string, x: number, y: number) {
    this.d.fit = unfitPart(this.d.fit, id);
    const c = this.cv.getBoundingClientRect(), sx = c.left + x * S, sy = c.top + y * S;
    burst(sx, sy, { n: 14, ramp: P.steel, kind: 'chip', layer: 'ui', speed: 200 });
    uiSfx('clunk', 0.6); uiSfx('metalClose', 0.4);
    floatUp(sx, sy - 16, 'OFF', { color: '#c8c0a8', size: 16 });
    this.sq.kick(-4);
    if (this.ghost && this.ghostSlot === CYBER[id].slot) { this.ghost.removeFromParent(); this.ghost = null; }
    this.buildSpecimen(); this.prof = workerProfile(this.d); this.paintStats(); this.markFitted();
    const v = this.views.find((q) => q.id === id); if (v) { pop(v.el, 1); v.v.poke(12); }
  }
  private cycle(dir: -1 | 1) {
    if (this.bases.length < 2) { uiSfx('error', 0.4); return; }
    this.bi = (this.bi + dir + this.bases.length) % this.bases.length;
    this.d = cloneD(this.bases[this.bi]); this.start = cloneD(this.d);
    uiSfx('swishOut', 0.5);
    this.zoom.x = 0.6; this.yaw.kick(dir * 10);
    this.buildSpecimen(true); this.buildRack(); this.paintBg();
  }

  // ---------------------------------------------------------------- filing
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
    const base = clean(d.name || 'Worker').replace(/ (HAULER|MINER|FARMER|BUILDER|OPERATOR|GUARD|SCOUT)( \d+)?$/i, '');
    d.name = `${base} ${p.roleName}`;
    try { g?.addDesign?.(d, null, 0); } catch (e) { console.error('file design', e); }
    g?.emit?.('prefab', { kind: 'creature', name: d.name });
    // the stamp: the creature jumps, the frame jolts, a big confirm
    this.sq.kick(10); this.yaw.kick(18); shake(this.frameEl, 4, 300); uiSfx('confirm', 0.8); uiSfx('bong', 0.5);
    const r = this.cv.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height * 0.5, { n: 40, ramp: P.glowTeal, kind: 'spark', layer: 'ui', speed: 300 });
    floatUp(r.left + r.width / 2, r.top + r.height * 0.3, 'FILED', { color: '#b8f0a0', size: 32 });
    this.start = cloneD(this.d); this.fileKey?.refresh();
    this.bases.unshift(cloneD(d)); this.bi = 0;
  }

  // ---------------------------------------------------------------- frame
  private frame(dt: number) {
    this.t += dt;
    // a slow rock either side of where it was left
    if (!this.turn && !this.drag && this.t > 1.2) this.yaw.target = this.base + Math.sin(this.t * 0.35) * 0.3;
    this.yaw.step(dt); this.pitch.step(dt); this.zoom.step(dt); this.sq.step(dt);
    // the regrown body landed (or the current one upgraded)
    if (this.prevSpec && this.prevSpec.poll()) this.setSpec(this.prevSpec);
    else if (this.prevSpec?.ready) this.setSpec(this.prevSpec);
    if (this.spec?.poll()) { this.kv = this.viewOf(this.spec); this.dirty = true; }
    const moving = !this.yaw.settled || !this.pitch.settled || !this.zoom.settled || !this.sq.settled;
    this.acc += dt;
    if (this.kv && (this.dirty || (moving && this.acc > 1 / 30))) { this.acc = 0; this.dirty = false; this.kv.draw(this.cv.getContext('2d')!, this.view, { squash: this.sq.x * 0.03 }); }
    this.drawOverlay(dt);
  }
  private drawOverlay(dt: number) {
    const c = this.oc; c.clearRect(0, 0, this.ov.width, this.ov.height);
    if (!this.spec) return;
    const seen = new Set<Slot>();
    for (const p of this.slotPts()) {
      seen.add(p.s);
      let lb = this.slotLabels.get(p.s);
      if (!lb) { lb = textEl(SLOT_SHORT[p.s], { wrap: false }); lb.className += ' s7-abs'; lb.style.pointerEvents = 'none'; lb.style.zIndex = '3'; this.frameEl.append(lb); this.slotLabels.set(p.s, lb); }
      const on = p.s === this.hotSlot || p.s === this.wantSlot;
      lb.textContent = p.fitted ? `${SLOT_SHORT[p.s]}: ${clean(CYBER[p.fitted]?.name ?? '')}` : SLOT_SHORT[p.s];
      lb.style.color = on ? '#fff0c0' : p.fitted ? '#ffd890' : '#c8c0a8';
      lb.style.opacity = p.facing || on ? '1' : '0.5';
      place(lb, Math.round(this.well.x + 4 + p.x + 12), Math.round(this.well.y + 4 + p.y - 5));
      const hot = p.s === this.hotSlot, want = p.s === this.wantSlot, R = hot ? 10 + Math.sin(this.t * 10) : want ? 9 + Math.sin(this.t * 6) * 1.5 : p.fitted ? 8 : 7;
      const x = Math.round(p.x), y = Math.round(p.y);
      c.globalAlpha = p.facing || hot || want ? 1 : 0.45;
      // a socket ring: brass when a part sits in it, steel when empty, glowing amber while a part hovers over it
      const Ri = Math.round(R), sp = ringSprite(Ri, p.fitted ? P.brass : hot ? P.glowAmber : want ? P.ochre : P.steel);
      c.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
      const ic = iconOf(SLOT_ICON[p.s], p.fitted ? 'amber' : hot || want ? 'lit' : 'steel'), s = Ri * 2 - 2;
      c.drawImage(ic, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      // corner brackets closing in on the target slot
      if (hot || want) { const rr = Ri + (hot ? 9 : 4) + Math.floor((this.t * 12) % 4); c.fillStyle = hot ? '#fff0c0' : '#ffc560'; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const bx = Math.round(x + sx * rr), by = Math.round(y + sy * rr); c.fillRect(sx < 0 ? bx : bx - 3, by, 4, 1); c.fillRect(bx, sy < 0 ? by : by - 3, 1, 4); } }
      c.globalAlpha = 1;
    }
    // weld flashes: a white star that fades to amber
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.t -= dt; if (f.t <= 0) { this.flashes.splice(i, 1); continue; }
      const k = f.t / 0.35, r = 4 + (1 - k) * 22;
      c.fillStyle = k > 0.6 ? '#ffffff' : '#ffd890'; c.globalAlpha = k;
      c.fillRect(Math.round(f.x - r), Math.round(f.y), Math.round(r * 2), 1); c.fillRect(Math.round(f.x), Math.round(f.y - r), 1, Math.round(r * 2));
      c.fillRect(Math.round(f.x - r * 0.3), Math.round(f.y - r * 0.3), Math.round(r * 0.6), Math.round(r * 0.6));
      c.globalAlpha = 1;
    }
    // while the regrown body is on its way the weld keeps spitting sparks at the slot
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
    if (this.closing) return; this.closing = true;
    uiSfx('swishOut', 0.6);
    void tween(340, (k) => { this.frameEl.style.transform = `translateY(${Math.round(k * k * 160) * S}px)`; }, ease.inCubic).then(async () => { if (this.o.close) await this.o.close(() => this.dispose()); else this.dispose(); });
  }
  dispose() {
    this.closing = true;
    for (const f of this.off) try { f(); } catch { /* */ }
    this.off = [];
    for (const v of this.views) v.v.dispose();
    this.spec?.dispose(); this.prevSpec?.dispose();
    this.el.remove();
    if (this.game) this.game.paused = this.wasPaused;
    if (LabFit.current === this) LabFit.current = null;
  }
}

export async function openLabFit(game: any, o: LabFitOpts = {}): Promise<LabFit | null> {
  if (LabFit.current) return LabFit.current;
  const f = new LabFit(game, o);
  await f.ready();
  return f;
}
void mixHex; void squash; void Px;

function backLever(): THREE.Group {
  const g = new THREE.Group();
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.16, 16), toon({ color: 0x40444a, metal: 0.6 })); g.add(boss);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), toon({ color: 0xb8bcc0, metal: 0.8 })); arm.position.set(0.18, 0.36, 0); arm.rotation.z = -0.5; g.add(arm);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 10), toon({ color: 0xc8382a, gloss: 0.5 })); grip.position.set(0.42, 0.66, 0); grip.rotation.z = 1.07; g.add(grip);
  return g;
}

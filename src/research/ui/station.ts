// THE R&D STATION (K): one 3D room replaces the old tabbed program. The operator's curved control desk (kit3d) with
// two glass screens on its back lip, three big lit MODE keys (RESEARCH / MASTERY / UPGRADE), one big ACTION key,
// four glowing data vials, a rotary path selector, the mission screen with its countdown and TRANSMIT key, and an
// install tray; beyond the desk, a hologram emitter on a pedestal.
//   RESEARCH  the emitter projects 3-4 tech offers: the actual model of each building, part or device, spinning on
//             its own light pillar, with a name and its data cost. Click one: it flies to the centre, the ACTION key
//             lights RESEARCH.
//   MASTERY   the selected path's diorama as a hologram (the rotary selector switches paths) with its six perks as big
//             nodes; click one, ACTION installs it.
//   UPGRADE   the Upgrader's buildable blueprints as holograms (arm heads, drones, pod parts, tools); ACTION builds and
//             installs from real items; the tray on the desk opens and lifts the finished part.
// Camera: a dolly in on open, a push toward the selection; the post pipeline's motion blur does the rest.
import * as THREE from 'three';
import type { Engine, Screen } from '../../app/engine';
import type { Post } from '../../gfx/post';
import { ui, el } from '../../ui/kit';
import { sfx } from '../../audio/audio';
import { csfx } from '../../ui/cineAudio';
import { consoleDesk, glassScreen, SCR, physicalKey, rotaryKnob, hologramEmitter, holoify, holoUniforms, lightPillar, Picker, techRoom, mat32, solid, worldUV, canvasTex, K3, type GlassScreen, type PhysicalKey, type HoloU, type Emitter } from '../../ui/kit3d';
import { TECHS, TECH, DATA_KINDS, DATA_NAME, type DataKind } from '../tech';
import { PATHS, PATH, PERK, CORE, CORE_LV, type PathId } from '../mastery';
import { BLUEPRINTS, BLUEPRINT, costOf } from '../upgrades';
import { upState } from '../buildings';
import { itemIcon } from '../../factory/items';
import { have, itemName, fmtTime, gtime } from '../util';
import { iconURL } from './icons';
import { techModel, blueprintModel, fit } from './models';
import { Diorama } from './dioramas';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import type { SkillHost } from '../../ui/skillTree';
import './station.css';

export type Mode = 'research' | 'mastery' | 'upgrade';
const MODES: { id: Mode; label: string; icon: string; key: string; col: number }[] = [
  { id: 'research', label: 'RESEARCH', icon: 'lens', key: '1', col: K3.cyan },
  { id: 'mastery', label: 'MASTERY', icon: 'sprout', key: '2', col: 0x8dffb0 },
  { id: 'upgrade', label: 'UPGRADE', icon: 'wrench', key: '3', col: K3.amber },
];
const DATA_ICON: Record<DataKind, string> = { bio: 'dna', geo: 'pick', energy: 'arcs', xeno: 'sensor' };
const LIQ: Record<DataKind, number> = { bio: 0x6dff7a, geo: 0xffa040, energy: 0x5fe8ff, xeno: 0xc08aff };
const V = THREE.Vector3;
const EM = new V(0, 0.7, -2.45); // the emitter's base
const DESK_Z = 0;

interface Offer { id: string; holo: THREE.Group; u: HoloU; pillar: ReturnType<typeof lightPillar>; cap: HTMLElement; hit: THREE.Mesh; slot: THREE.Vector3; pos: THREE.Vector3; scale: number; spin: number }
interface PerkNode { id: string; anchor: THREE.Object3D; core: THREE.Mesh; mat: THREE.MeshBasicMaterial; badge: HTMLElement; hit: THREE.Mesh }

export class RDStation implements Screen {
  static current: RDStation | null = null;
  readonly scene = new THREE.Scene(); readonly fx = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.05, 60);
  private root: HTMLDivElement; private picker: Picker;
  private emitter: Emitter; private room: ReturnType<typeof techRoom>;
  private left: GlassScreen; private right: GlassScreen; private mission: GlassScreen;
  private modeKeys = new Map<Mode, PhysicalKey>(); private action: PhysicalKey; private transmitKey: PhysicalKey; private knob: ReturnType<typeof rotaryKnob>;
  private vials: { k: DataKind; liquid: THREE.Mesh; level: number; label: ReturnType<typeof canvasTex>; last: number }[] = [];
  private strikes: THREE.Mesh[] = []; private lampOn = gbuf(new THREE.MeshBasicMaterial({ color: 0xff5a4a }), F_EMIT); private lampOff = solid(0x2a2f34);
  private tray: { lid: THREE.Mesh; lift: THREE.Group; part: THREE.Object3D | null; t: number };
  private offers: Offer[] = []; private nodes: PerkNode[] = []; private dio: Diorama | null = null; private dioHolo: THREE.Group | null = null; private dioU: HoloU | null = null;
  private hint: HTMLElement;
  mode: Mode; path: PathId; private sel: string | null = null;
  private t = 0; private dolly = 0; private sig = ''; private sigT = 0; private push = 0;
  private camFrom = new V(0, 3.0, 3.4); private camTo = new V(0, 1.8, 1.0); private lookTo = new V(0, 1.42, -2.4);
  private mouse = new THREE.Vector2(); private holoT = { value: 0 }; private offInstall: (() => void) | null = null;
  readonly close: () => void;
  constructor(readonly host: SkillHost, readonly engine: Engine, o: { mode?: Mode; path?: PathId; close: () => void }) {
    RDStation.current = this; this.close = o.close; (window as unknown as { __rd?: RDStation }).__rd = this;
    this.mode = o.mode ?? 'research'; this.path = o.path ?? (PATHS.find((p) => (host.mastery?.points(p) ?? 0) > 0) ?? 'plant');
    this.scene.background = new THREE.Color(0x0c1014); this.scene.fog = new THREE.Fog(0x0c1014, 6, 16);
    this.root = el('div', 'rd', ui()) as HTMLDivElement;
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('pointermove', (e) => this.mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));
    this.hint = el('div', 'rd-hint', this.root, '<b>1</b> RESEARCH &nbsp; <b>2</b> MASTERY &nbsp; <b>3</b> UPGRADE &nbsp;·&nbsp; <b>ENTER</b> ACT &nbsp;·&nbsp; <b>Q E</b> PATH &nbsp;·&nbsp; <b>K</b> CLOSE');
    this.picker = new Picker(this.cam, this.root);
    // the room and the emitter on its pedestal
    this.room = techRoom({ r: 6.5 }); this.room.group.position.set(0, 0, EM.z + 0.6); this.scene.add(this.room.group);
    const ped = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(0.42, 0.62, 0.7, 24)), mat32(K3.gun, 'panel')); ped.position.set(EM.x, 0.35, EM.z); ped.castShadow = ped.receiveShadow = true; this.scene.add(ped);
    this.emitter = hologramEmitter({ r: 0.62, shaft: 2.0 });
    this.emitter.base.position.copy(EM); this.emitter.fx.position.copy(EM); this.scene.add(this.emitter.base); this.fx.add(this.emitter.fx);
    this.holoT = this.emitter.t;
    // the desk
    const desk = consoleDesk({ span: 2.05, r0: 0.78, r1: 1.55 }); desk.group.position.z = DESK_Z; this.scene.add(desk.group);
    // a warm work lamp over the desk
    const lamp = new THREE.SpotLight(0xffe2b8, 9, 5, 0.95, 0.65, 1.2); lamp.position.set(0, 2.7, 0.9); lamp.target.position.set(0, 0.9, -1.0); this.scene.add(lamp, lamp.target);
    this.left = glassScreen({ w: 0.62, h: 0.38 }); desk.riser(-0.74).add(this.left.group);
    this.right = glassScreen({ w: 0.62, h: 0.38 }); desk.riser(0.74).add(this.right.group);
    this.mission = glassScreen({ w: 0.34, h: 0.2, res: 470, stand: 0.03, depth: 0.05 });
    const ms = desk.place(0.5, 0.55, 0.0); ms.rotateX(-0.55); ms.add(this.mission.group);
    // mode keys
    MODES.forEach((m, i) => {
      const k = physicalKey({ w: 0.2, d: 0.11, label: m.label, size: 22, lit: m.col, icon: m.icon }); desk.place(-0.9 + i * 0.185, 0.36).add(k.group);
      this.modeKeys.set(m.id, k); this.picker.add(k.hit, { click: () => this.setMode(m.id) });
    });
    this.action = physicalKey({ w: 0.26, d: 0.12, h: 0.045, label: 'RESEARCH', lit: K3.amber, cap: 0xb9bcb4, size: 24 }); desk.place(0, 0.22).add(this.action.group);
    this.picker.add(this.action.hit, { click: () => this.act() });
    this.transmitKey = physicalKey({ w: 0.15, d: 0.08, label: 'TRANSMIT', size: 22, lit: 0x8dffb0 }); desk.place(0.7, 0.3).add(this.transmitKey.group);
    this.picker.add(this.transmitKey.hit, { click: () => this.transmit() });
    // the strike lamps beside the mission screen
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.01, 0.022), this.lampOff); desk.place(0.32 + i * 0.035, 0.78, 0.005).add(l); this.strikes.push(l); }
    // the path selector
    this.knob = rotaryKnob({ labels: PATHS.map((p) => PATH[p].short.toUpperCase().slice(0, 6)), lit: 0x8dffb0 });
    desk.place(-0.34, 0.45).add(this.knob.group); this.knob.set(PATHS.indexOf(this.path));
    this.picker.add(this.knob.hit, { click: () => this.turn(1) });
    // the data vials
    DATA_KINDS.forEach((k, i) => {
      const a = desk.place(-0.16 + i * 0.105, 0.66);
      const sock = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(0.034, 0.04, 0.03, 16)), mat32(K3.steel, 'brushed')); sock.position.y = 0.015; sock.castShadow = true; a.add(sock);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.17, 16, 1, true), gbuf(new THREE.MeshLambertMaterial({ color: 0xcfefff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), 0)); glass.position.y = 0.115; a.add(glass);
      const capM = mat32(K3.brass, 'brushed'); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), capM); cap.position.y = 0.21; cap.castShadow = true; a.add(cap);
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 1, 14), gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(LIQ[k]).multiplyScalar(1.4) }), F_EMIT)); liquid.position.y = 0.035; a.add(liquid);
      const light = new THREE.PointLight(LIQ[k], 0.25, 0.5); light.position.y = 0.1; a.add(light);
      const label = canvasTex(96, 32); const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.096, 0.032), gbuf(new THREE.MeshBasicMaterial({ map: label.tex }), F_EMIT)); lp.rotation.x = -Math.PI / 2; lp.position.set(0, 0.002, 0.062); a.add(lp);
      this.vials.push({ k, liquid, level: 0, label, last: -1 });
    });
    // the install tray
    const ta = desk.place(0.3, 0.42);
    const well = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.2, 0.012, 0.13)), solid(0x0d0f11)); well.position.y = 0.001; ta.add(well);
    for (const [x, z, w, d] of [[0, -0.07, 0.22, 0.012], [0, 0.07, 0.22, 0.012], [-0.105, 0, 0.012, 0.13], [0.105, 0, 0.012, 0.13]]) { const r = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, 0.016, d)), mat32(K3.steel, 'brushed')); r.position.set(x, 0.008, z); ta.add(r); }
    const lid = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.198, 0.008, 0.128)), mat32(0x59626b, 'brushed')); lid.position.y = 0.008; lid.castShadow = true; ta.add(lid);
    const lift = new THREE.Group(); lift.position.y = -0.1; ta.add(lift);
    this.tray = { lid, lift, part: null, t: -1 };
    this.offInstall = this.host.upgrades?.on('install', (d: { id: string }) => this.trayShow(d.id)) ?? null;
    addEventListener('keydown', this.onKey, true);
    this.resize(); this.cam.position.copy(this.camFrom); this.cam.lookAt(this.lookTo);
    this.setMode(this.mode, true);
    csfx('servo', 0.6, 0.8); csfx('hover', 0.5);
  }

  // ------------------------------------------------------------------ modes and offers
  setMode(m: Mode, quiet = false) {
    if (m === this.mode && !quiet && (this.offers.length || this.dioHolo)) return;
    this.mode = m; this.sel = null; this.sig = '';
    for (const [id, k] of this.modeKeys) { k.setLit(id === m); if (id === m && !quiet) k.press(); }
    this.clearHolo();
    if (m === 'mastery') this.buildMastery(); else this.buildOffers();
    this.action.setLabel(m === 'research' ? 'RESEARCH' : m === 'mastery' ? 'INSTALL' : 'BUILD');
    this.emitter.surge();
    if (!quiet) { csfx('lever', 0.7); csfx('hover', 0.5, 1.2); sfx('click'); }
  }
  private clearHolo() {
    for (const o of this.offers) { o.holo.removeFromParent(); o.pillar.mesh.removeFromParent(); o.cap.remove(); this.picker.remove(o.hit); o.hit.removeFromParent(); }
    this.offers = [];
    for (const n of this.nodes) { n.badge.remove(); this.picker.remove(n.hit); }
    this.nodes = [];
    this.dioHolo?.removeFromParent(); this.dioHolo = null; this.dio?.dispose(); this.dio = null;
  }
  private offerIds(): string[] {
    const H = this.host, R = H.research, U = H.upgrades;
    if (this.mode === 'upgrade') {
      if (!R || !U) return [];
      return BLUEPRINTS.filter((b) => R.unlocked(b.id) && U.count(b.id) < b.max).slice(0, 4).map((b) => b.id);
    }
    if (!R) return [];
    const total = (id: string) => DATA_KINDS.reduce((s, k) => s + (TECH[id].cost[k] ?? 0), 0);
    const cand = TECHS.filter((t) => !t.start && !R.unlocked(t.id) && !R.why(t.id)).map((t) => t.id);
    cand.sort((a, b) => (R.queue.indexOf(a) < 0 ? 99 : R.queue.indexOf(a)) - (R.queue.indexOf(b) < 0 ? 99 : R.queue.indexOf(b)) || (R.short(a) ? 1 : 0) - (R.short(b) ? 1 : 0) || total(a) - total(b));
    return cand.slice(0, 4);
  }
  private buildOffers() {
    const ids = this.offerIds(), n = ids.length;
    const col = this.mode === 'upgrade' ? K3.amber : K3.cyan;
    ids.forEach((id, i) => {
      const a = n > 1 ? Math.PI * (0.88 - 0.76 * (i / (n - 1))) : Math.PI / 2;
      const slot = new V(EM.x + Math.cos(a) * 1.05, EM.y + 0.62, EM.z + Math.sin(a) * 0.32 + 0.1);
      const u = holoUniforms(col, this.holoT); u.uAppear.value = 0;
      const model = this.mode === 'upgrade' ? fit(blueprintModel(id)) : techModel(id);
      const holo = holoify(model, u); const wrap = new THREE.Group(); wrap.add(holo); wrap.position.copy(slot); wrap.scale.setScalar(0.5); this.fx.add(wrap);
      const pillar = lightPillar(0.2, 0.16, 0.62, col, this.holoT, 0.22); pillar.mesh.position.set(slot.x, EM.y + 0.02, slot.z); this.fx.add(pillar.mesh);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.75, 10), new THREE.MeshBasicMaterial()); hit.visible = false; hit.position.copy(slot).add(new V(0, 0.3, 0)); this.scene.add(hit);
      const cap = el('div', 'rd-cap', this.root);
      const o: Offer = { id, holo: wrap, u, pillar, cap, hit, slot, pos: slot.clone(), scale: 0.5, spin: i * 1.3 };
      this.offers.push(o);
      this.picker.add(hit, { click: () => this.pick(id), hover: (on) => { if (on) csfx('beep', 0.15, 1.6); u.uDim.value = on ? 1.4 : 1; } });
      // flicker in, one after another
      setTimeout(() => { csfx('static', 0.25, 1.4); }, 120 + i * 140);
      (o as unknown as { delay: number }).delay = 0.15 + i * 0.16;
    });
    this.sel = ids[0] ?? null;
  }
  private buildMastery() {
    const M = this.host.mastery; if (!M) return;
    const dio = new Diorama(this.path, M); this.dio = dio;
    const core = new Set(CORE[this.path]);
    dio.setStates((id) => (core.has(id) ? (M.has(id) ? 'owned' : M.why(id) ? 'locked' : 'ready') : 'locked'));
    const u = holoUniforms(0x8dffb0, this.holoT); u.uAppear.value = 0; this.dioU = u;
    const src = dio.root; src.updateMatrixWorld(true);
    const h = holoify(src, u, { maxEdgeVerts: 6000 });
    const wrap = new THREE.Group(); wrap.add(h); wrap.scale.setScalar(0.3); wrap.position.set(EM.x, EM.y + 0.32, EM.z); this.fx.add(wrap); this.dioHolo = wrap;
    u.uY0.value = EM.y + 0.3; u.uH.value = 1.5;
    // the six perks as big nodes on the hologram
    for (const id of CORE[this.path]) {
      const dn = dio.nodes.find((q) => q.id === id); if (!dn) continue;
      const anchor = new THREE.Object3D(); dn.anchor.updateMatrixWorld(true);
      const p = new V().setFromMatrixPosition(dn.anchor.matrixWorld); anchor.position.copy(p); h.add(anchor);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
      const coreM = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), mat); anchor.add(coreM);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 4, 24), mat); ring.rotation.x = Math.PI / 2; anchor.add(ring);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial()); hit.visible = false; anchor.add(hit);
      const badge = el('div', 'rd-badge', this.root); const im = el('img', '', badge) as HTMLImageElement; im.src = iconURL(PERK[id].icon, 'phos');
      this.nodes.push({ id, anchor, core: coreM, mat, badge, hit });
      this.picker.add(hit, { click: () => this.pick(id), hover: (on) => { if (on) csfx('beep', 0.15, 1.7); } });
    }
    this.sel = CORE[this.path].find((id) => !M.has(id)) ?? CORE[this.path][0];
  }
  /** finish the opening moves at once (tests and screenshots on slow machines) */
  settle() { this.dolly = 1; for (const o of this.offers) { o.u.uAppear.value = 1; (o as unknown as { delay: number }).delay = 0; o.pos.copy(o.id === this.sel ? new V(EM.x, EM.y + 0.72, EM.z + 0.15) : o.slot); o.scale = o.id === this.sel ? 0.95 : 0.42; } if (this.dioU) this.dioU.uAppear.value = 1; this.sig = ''; this.sigT = 0; }
  private pick(id: string) {
    if (this.sel === id) { this.act(); return; }
    this.sel = id; this.sig = ''; csfx('servo', 0.4, 1.4); sfx('click'); this.emitter.surge(); this.push = 1;
  }
  private turn(d: number) {
    const i = (PATHS.indexOf(this.path) + d + PATHS.length) % PATHS.length;
    this.path = PATHS[i]; this.knob.set(i); csfx('lever', 0.5, 1.4); sfx('click');
    if (this.mode !== 'mastery') this.setMode('mastery'); else { this.clearHolo(); this.buildMastery(); this.emitter.surge(); }
    this.sig = '';
  }

  // ------------------------------------------------------------------ the action key
  private why(): string | null {
    const H = this.host, id = this.sel; if (!id) return 'Nothing selected';
    if (this.mode === 'research') {
      const R = H.research!; if (R.queue[0] === id) return 'Running'; return R.why(id) ?? R.short(id);
    }
    if (this.mode === 'mastery') return H.mastery!.why(id);
    const U = H.upgrades!, m = this.machine(); if (!m) return 'Build an Upgrader first';
    return U.why(id, upState(m));
  }
  private machine(): any { return ((this.host as any).factory?.buildings ?? []).filter((b: any) => b.kind === 'upgrader' && !b.dead).sort((a: any, b: any) => (upState(a).job ? 1 : 0) - (upState(b).job ? 1 : 0))[0] ?? null; }
  private act() {
    const H = this.host, id = this.sel;
    this.action.press();
    if (!id || this.why()) { sfx('deny'); csfx('deny', 0.4); return; }
    let ok = false;
    if (this.mode === 'research') { const R = H.research!; ok = R.enqueue(id) || R.queue.includes(id); if (ok) R.bump(id); }
    else if (this.mode === 'mastery') { ok = H.mastery!.take(id); if (ok) { H.emit?.('mastery-perk', { id }); this.clearHolo(); this.buildMastery(); } }
    else { const m = this.machine(); ok = !!m && H.upgrades!.start(upState(m), id); }
    if (ok) { csfx('thud', 0.8, 0.9); csfx('servo', 0.6, 1.1); sfx('done'); this.emitter.surge(); } else sfx('deny');
    this.sig = '';
  }
  private transmit() {
    const M = this.host.mission; this.transmitKey.press();
    const q = M?.open().find((x) => M.progress(x).ok);
    if (q && M!.transmit(q.id)) { csfx('thud', 0.7); sfx('done'); this.emitter.surge(); } else sfx('deny');
    this.sig = '';
  }
  private trayShow(id: string) {
    const T = this.tray; T.part?.removeFromParent();
    const m = fit(blueprintModel(id), 0.15); m.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.material = mat32(0x9aa4aa, 'brushed'); me.castShadow = true; } });
    T.lift.add(m); T.part = m; T.t = 0; csfx('servo', 0.7, 0.7); csfx('thud', 0.6, 1.3);
  }

  // ------------------------------------------------------------------ input
  private onKey = (e: KeyboardEvent) => {
    if (RDStation.current !== this) return;
    const tg = (e.target as HTMLElement)?.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
    if (document.querySelector('.evc')) return;
    e.stopImmediatePropagation(); if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'k') { e.preventDefault(); this.close(); return; }
    const m = MODES.find((q) => q.key === k); if (m) { this.setMode(m.id); return; }
    if (k === 'enter' || k === ' ') { e.preventDefault(); this.act(); return; }
    if (k === 'q' || k === 'arrowup') { this.turn(-1); return; }
    if (k === 'e' || k === 'arrowdown') { this.turn(1); return; }
    if (k === 'arrowleft' || k === 'arrowright') {
      const ids = this.mode === 'mastery' ? this.nodes.map((n) => n.id) : this.offers.map((o) => o.id); if (!ids.length) return;
      const i = Math.max(0, ids.indexOf(this.sel ?? '')); this.pick(ids[(i + (k === 'arrowleft' ? -1 : 1) + ids.length) % ids.length]); return;
    }
    if (k === 't') this.transmit();
  };

  // ------------------------------------------------------------------ frame
  update(dt: number) {
    this.t += dt; this.dolly = Math.min(1, this.dolly + dt / 1.8); this.push = Math.max(0, this.push - dt * 1.5);
    this.emitter.update(dt); this.room.update(dt);
    for (const k of this.modeKeys.values()) k.update(dt);
    this.action.update(dt); this.transmitKey.update(dt); this.knob.update(dt);
    // the camera: a dolly in, a gentle parallax with the mouse, a small push on a new selection
    const e = this.dolly < 1 ? 1 - Math.pow(1 - this.dolly, 3) : 1;
    const p = this.camFrom.clone().lerp(this.camTo, e).add(new V(this.mouse.x * 0.12, -this.mouse.y * 0.06, -this.push * 0.08));
    this.cam.position.copy(p); this.cam.lookAt(this.lookTo.clone().add(new V(this.mouse.x * 0.25, -this.mouse.y * 0.1, 0)));
    this.offerFrame(dt); this.masteryFrame(dt); this.vialFrame(dt); this.trayFrame(dt);
    this.sigT -= dt; if (this.sigT <= 0) { this.sigT = 0.25; const s = this.signature(); if (s !== this.sig) { this.sig = s; this.screens(); } }
  }
  private offerFrame(dt: number) {
    const R = this.host.research;
    for (const o of this.offers) {
      const sel = o.id === this.sel, d = (o as unknown as { delay: number }).delay;
      if (d > 0) (o as unknown as { delay: number }).delay = d - dt;
      else o.u.uAppear.value = Math.min(1, o.u.uAppear.value + dt / 0.7);
      const flick = o.u.uAppear.value < 1 && Math.sin(this.t * 60) > 0.6 ? 0.4 : 1;
      const target = sel ? new V(EM.x, EM.y + 0.72, EM.z + 0.15) : o.slot.clone().add(new V(0, 0, -0.05));
      o.pos.lerp(target, Math.min(1, dt * 5)); o.scale += ((sel ? 0.95 : 0.42) - o.scale) * Math.min(1, dt * 5);
      o.holo.position.copy(o.pos).add(new V(0, Math.sin(this.t * 1.3 + o.spin) * 0.02, 0)); o.holo.scale.setScalar(o.scale);
      o.spin += dt * (sel ? 0.45 : 0.3); o.holo.rotation.y = o.spin;
      o.u.uY0.value = o.pos.y; o.u.uH.value = o.scale * 1.25;
      o.u.uDim.value = (sel ? 1.25 : this.sel ? 0.55 : 1) * flick;
      o.pillar.u.uK.value = sel ? 0.05 : 0.22;
      o.hit.position.copy(o.pos).add(new V(0, o.scale * 0.6, 0)); o.hit.scale.setScalar(o.scale / 0.5);
      // the caption under the model
      const at = this.project(o.pos.clone().add(new V(0, -0.06, 0)));
      o.cap.style.left = at.x + 'px'; o.cap.style.top = at.y + 'px';
      o.cap.classList.toggle('sel', sel); o.cap.classList.toggle('dim', !!this.sel && !sel);
      o.cap.style.opacity = o.u.uAppear.value > 0.6 ? '' : '0';
      void R;
    }
  }
  private masteryFrame(dt: number) {
    if (!this.dio || !this.dioHolo || !this.dioU) return;
    this.dioU.uAppear.value = Math.min(1, this.dioU.uAppear.value + dt / 1.1);
    this.dioHolo.rotation.y = Math.sin(this.t * 0.25) * 0.5;
    const M = this.host.mastery!;
    for (const n of this.nodes) {
      const owned = M.has(n.id), ready = !owned && !M.why(n.id), sel = n.id === this.sel;
      const c = owned ? 0x8dffb0 : ready ? 0xffcc66 : 0x4a6a70;
      n.mat.color.setHex(c).multiplyScalar(sel ? 0.9 : ready ? 0.45 + 0.25 * Math.sin(this.t * 4) : 0.35);
      n.core.rotation.y += dt * (sel ? 2 : 0.8); n.core.scale.setScalar(sel ? 1.35 : 1);
      const w = new V(); n.anchor.getWorldPosition(w); const at = this.project(w);
      n.badge.style.left = at.x + 'px'; n.badge.style.top = (at.y - 46) + 'px';
      n.badge.classList.toggle('locked', !owned && !ready); n.badge.style.opacity = this.dioU.uAppear.value > 0.8 ? '' : '0';
    }
  }
  private vialFrame(dt: number) {
    const R = this.host.research; if (!R) return;
    for (const v of this.vials) {
      const val = Math.floor(R.data[v.k]), cap = Math.max(40, Math.ceil(val * 1.25 / 10) * 10), k = Math.min(1, val / cap);
      v.level += (k - v.level) * Math.min(1, dt * 2.5);
      const h = 0.01 + v.level * 0.15; v.liquid.scale.y = h; v.liquid.position.y = 0.035 + h / 2;
      if (val !== v.last) {
        v.last = val; const { g, tex } = v.label; g.fillStyle = '#081418'; g.fillRect(0, 0, 96, 32);
        g.font = "11px 'Body', monospace"; g.textBaseline = 'top'; g.textAlign = 'center'; g.fillStyle = '#7fd8e8'; g.fillText(DATA_NAME[v.k], 48, 2);
        g.font = "22px 'Body', monospace"; g.fillStyle = '#dffbff'; g.fillText(String(val), 48, 11); tex.needsUpdate = true;
      }
    }
  }
  private trayFrame(dt: number) {
    const T = this.tray; if (T.t < 0) return;
    T.t += dt; const open = T.t < 0.5 ? T.t / 0.5 : T.t < 5 ? 1 : Math.max(0, 1 - (T.t - 5) / 0.5);
    T.lid.position.z = -0.13 * open; T.lift.position.y = -0.1 + open * 0.13; if (T.part) T.part.rotation.y += dt * 0.8;
    if (T.t > 5.6) { T.t = -1; T.part?.removeFromParent(); T.part = null; }
  }
  private project(v: THREE.Vector3) { const p = v.clone().project(this.cam); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; }

  // ------------------------------------------------------------------ the screens
  private signature() {
    const H = this.host, R = H.research, M = H.mission, m = this.machine(), j = m ? upState(m).job : null;
    return [this.mode, this.sel, this.path, R ? R.queue.join(',') + Math.floor(R.headFrac() * 50) + DATA_KINDS.map((k) => Math.floor(R.data[k])).join(',') : '', H.mastery?.perks().length, j ? j.id + Math.floor((j.t / j.time) * 50) : '-', M ? M.open().map((q) => q.id + Math.floor(q.due - gtime(H as never))).join(',') + M.strikes : '', H.upgrades?.list().length].join('|');
  }
  private screens() {
    const H = this.host, R = H.research, U = H.upgrades, M = H.mastery, Q = H.mission;
    // the offers move on when a tech is learned or a part is fitted
    if (this.mode !== 'mastery') { const ids = this.offerIds().join(','); if (ids !== this.offers.map((o) => o.id).join(',')) { const keep = this.sel; this.clearHolo(); this.buildOffers(); if (keep && this.offers.some((o) => o.id === keep)) this.sel = keep; } }
    // the action key: lit when the selection can be acted on
    const why = this.why(); this.action.setLit(!why, this.mode === 'research' ? K3.cyan : this.mode === 'mastery' ? 0x8dffb0 : K3.amber);
    // captions under the offers
    for (const o of this.offers) {
      if (this.mode === 'research' && R) {
        const t = TECH[o.id], active = R.queue[0] === o.id;
        const chips = DATA_KINDS.filter((k) => t.cost[k]).map((k) => `<span class="${R.data[k] < (t.cost[k] ?? 0) ? 'short' : ''}"><img src="${iconURL(DATA_ICON[k], 'phos')}">${t.cost[k]}</span>`).join('');
        o.cap.innerHTML = `<div class="n">${t.name}</div><div class="c">${chips}</div>${active ? `<div class="s amb">RESEARCHING ${Math.round(R.headFrac() * 100)}%</div>` : R.queue.includes(o.id) ? '<div class="s">QUEUED</div>' : ''}`;
      } else if (U) {
        const b = BLUEPRINT[o.id], cost = costOf(o.id);
        const chips = Object.keys(cost).slice(0, 3).map((it) => { let src = ''; try { src = itemIcon(it); } catch { /* icon */ } return `<span class="${have(H as never, it) < cost[it] ? 'short' : ''}"><img src="${src}">${cost[it]}</span>`; }).join('');
        o.cap.innerHTML = `<div class="n">${b.name}</div><div class="c">${chips}</div>${U.count(o.id) ? `<div class="s grn">FITTED ${U.count(o.id)}/${b.max}</div>` : ''}`;
      }
    }
    // the left screen: status of the mode
    this.left.draw((g, W, Hh) => {
      SCR.clear(g, W, Hh);
      if (this.mode === 'research' && R) {
        SCR.text(g, 'RESEARCH STATION', 10, 8, { col: SCR.dim });
        const id = R.queue[0];
        if (id) {
          SCR.text(g, TECH[id].name, 10, 26, { size: 24 }); SCR.bar(g, 10, 60, W - 20, 14, R.headFrac(), SCR.amber);
          SCR.text(g, `${Math.round(R.headFrac() * 100)}%`, 10, 80, { size: 22, col: SCR.amber });
          const st = R.stations(); SCR.text(g, st.powered ? `${st.powered}/${st.n} STATIONS  ${R.rate().toFixed(1)}X` : 'NO POWERED STATION', W - 10, 86, { col: st.powered ? SCR.dim : SCR.red, align: 'right' });
          const stall = R.stalled(); if (stall) SCR.text(g, stall.toUpperCase(), 10, 108, { col: SCR.red });
        } else { SCR.text(g, 'IDLE', 10, 26, { size: 24, col: SCR.dim }); SCR.text(g, 'PICK A TECH ON THE EMITTER', 10, 60, { col: SCR.ink }); }
        SCR.text(g, `${R.known().length} TECHS KNOWN`, 10, Hh - 20, { col: SCR.dim });
      } else if (this.mode === 'mastery' && M) {
        const P = PATH[this.path], lv = M.level(this.path);
        SCR.text(g, 'MASTERY', 10, 8, { col: SCR.dim });
        SCR.text(g, P.name.toUpperCase(), 10, 22, { size: 24 });
        SCR.text(g, `LV ${lv}`, 10, 50, { size: 48, col: SCR.green });
        const own = CORE[this.path].filter((id) => M.has(id)).length; SCR.text(g, `${own}/6 PERKS`, W - 10, 66, { size: 22, col: SCR.ink, align: 'right' });
        SCR.bar(g, 10, 104, W - 20, 12, M.frac(this.path), SCR.green);
        SCR.text(g, `${M.points(this.path)} POINT${M.points(this.path) === 1 ? '' : 'S'} TO SPEND`, 10, 122, { col: M.points(this.path) ? SCR.amber : SCR.dim });
        SCR.text(g, 'EARN XP BY DOING THE WORK', 10, Hh - 20, { col: SCR.dim });
      } else {
        const m = this.machine(), j = m ? upState(m).job : null;
        SCR.text(g, 'UPGRADER', 10, 8, { col: SCR.dim });
        if (!m) { SCR.text(g, 'NOT BUILT', 10, 26, { size: 24, col: SCR.red }); SCR.text(g, 'BUILD ONE IN THE COLONY', 10, 60); }
        else if (j) { SCR.text(g, BLUEPRINT[j.id].name, 10, 26, { size: 24 }); SCR.bar(g, 10, 60, W - 20, 14, j.t / j.time, SCR.amber); SCR.text(g, fmtTime(j.time - j.t), 10, 80, { size: 22, col: SCR.amber }); if (m.status === 'nopower') SCR.text(g, 'NO POWER', W - 10, 86, { col: SCR.red, align: 'right' }); }
        else { SCR.text(g, 'GANTRY IDLE', 10, 26, { size: 24, col: SCR.dim }); SCR.text(g, 'PICK A PART ON THE EMITTER', 10, 60); }
        SCR.text(g, `${U?.list().length ?? 0} UPGRADES FITTED`, 10, Hh - 20, { col: SCR.dim });
      }
    });
    // the right screen: the selection
    this.right.draw((g, W, Hh) => {
      SCR.clear(g, W, Hh);
      const id = this.sel; if (!id) { SCR.text(g, 'NOTHING ON OFFER', 10, 10, { size: 24, col: SCR.dim }); return; }
      let name = '', desc = '', plus: string[] = [], minus: string[] = [], foot = '';
      if (this.mode === 'research') { const t = TECH[id]; name = t.name; desc = t.desc; foot = `${fmtTime(t.time)} AT ONE STATION`; }
      else if (this.mode === 'mastery') { const p = PERK[id]; name = p.name; desc = p.desc; plus = p.plus; minus = p.minus ?? []; foot = `OPENS AT LEVEL ${CORE_LV[CORE[this.path].indexOf(id)]}`; }
      else { const b = BLUEPRINT[id]; name = b.name; desc = b.desc; plus = [b.effect]; foot = Object.entries(costOf(id)).map(([it, n]) => `${n} ${itemName(it).toUpperCase()}`).join(' · '); }
      SCR.text(g, name, 10, 8, { size: 24 });
      let y = 40;
      for (const line of wrap(desc, 34)) { SCR.text(g, line, 10, y, { col: SCR.ink }); y += 14; }
      y += 4; for (const l of plus) { SCR.text(g, '+ ' + l, 10, y, { col: SCR.green }); y += 14; }
      for (const l of minus) { SCR.text(g, '- ' + l, 10, y, { col: SCR.red }); y += 14; }
      const w = this.why();
      SCR.text(g, w ? w.toUpperCase() : this.mode === 'research' ? 'READY: PRESS RESEARCH' : this.mode === 'mastery' ? 'READY: PRESS INSTALL' : 'READY: PRESS BUILD', 10, Hh - 34, { col: w ? SCR.red : SCR.amber });
      for (const line of wrap(foot, 40).slice(0, 1)) SCR.text(g, line, 10, Hh - 18, { col: SCR.dim });
    });
    // the mission screen: the most urgent directive and a big countdown
    this.mission.draw((g, W, Hh) => {
      SCR.clear(g, W, Hh);
      const open = Q?.open().sort((a, b) => a.due - b.due) ?? [], q = open[0];
      if (!Q) return;
      if (!q) { SCR.text(g, Q.recalled ? 'RECALLED' : 'NO DIRECTIVE', 8, 8, { col: Q.recalled ? SCR.red : SCR.dim }); SCR.text(g, Q.recalled ? '' : `NEXT ${fmtTime(Q.next - gtime(H as never))}`, 8, 26, { size: 24 }); return; }
      const left = q.due - gtime(H as never), pr = Q.progress(q);
      SCR.text(g, q.title.slice(0, 22), 8, 6, { col: SCR.ink });
      SCR.text(g, fmtTime(left), W / 2, 22, { size: 48, col: left < 120 ? SCR.red : SCR.amber, align: 'center' });
      SCR.bar(g, 8, Hh - 18, W - 16, 10, pr.k, pr.ok ? SCR.green : SCR.ink);
      this.transmitKey.setLit(pr.ok, 0x8dffb0);
    });
    if (Q) this.strikes.forEach((l, i) => (l.material = i < Q.strikes ? this.lampOn : this.lampOff));
  }

  render(post: Post, t: number) { post.render(this.scene, this.cam, this.fx, t); }
  resize() { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }
  dispose() {
    if (RDStation.current === this) RDStation.current = null;
    removeEventListener('keydown', this.onKey, true);
    this.offInstall?.(); this.clearHolo(); this.picker.dispose(); this.root.remove();
  }
}
function wrap(s: string, n: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of s.split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; }
  if (line.trim()) out.push(line.trim()); return out;
}
void solid;

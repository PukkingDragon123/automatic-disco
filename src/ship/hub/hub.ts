// The ship hub: the research vessel MERIDIAN is the main menu and the place every function lives. It opens on
// the exterior hero shot (the ship holding orbit over the first world); boarding lifts the roof plates away and
// the camera settles into the isometric cutaway. Every room is clickable: hover lights its outline and its card,
// a click flies the camera into it and opens its function (the bridge's main monitor runs the galaxy scan and the
// deploy). The API for the crew and intro is in V6.md (SHIP section) and on this class.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Engine, Screen } from '../../app/engine';
import { type Post, resetGrade } from '../../gfx/post';
import { Bin, Mats, V3 } from './kit';
import { ROOMS, ROOM_IDS, roomCam, overviewCam, type RoomId, type CamPreset } from './layout';
import { buildInterior, type Interior } from './interior';
import { buildExterior, type Exterior } from './exterior';
import { HubChrome, type RoomAction } from './chrome';
import { breachFx, type Breach } from './breach';
import { closeTerminal } from './terminal';
import { shipState } from './shipState';
import { KEYS } from './layout';
import { VIGNETTES } from './vignette';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import type { HubPod } from './pod';
import { csfx, cloop, type Loop } from '../../ui/cineAudio';
import { makeGlobe, makeSpace, type Globe } from '../../ui/globe';
import { makePlanet } from '../../world/planet';

export interface HubRoom {
  id: RoomId; name: string; root: THREE.Group; bounds: THREE.Box3; cam: CamPreset;
  spots: Record<string, { pos: THREE.Vector3; facing: number }>;
}
export type HubMode = 'exterior' | 'boarding' | 'overview' | 'room' | 'shot';
export interface HubOpts {
  /** a save exists (CONTINUE is offered on the title) */
  hasSave?: boolean;
  /** start inside (skip the exterior title): returning from the planet, or after the intro */
  inside?: boolean;
  fromPlanet?: boolean;
  isNewGame?: boolean;
  /** title choices */
  onNew?: () => void; onContinue?: () => void;
  /** a room's function buttons (flow fills these: the monitor, the lab, settings, save...) */
  actions?: Partial<Record<RoomId, RoomAction[]>>;
  /** the planet below (the exterior's backdrop): a Globe group to show, optional */
  backdrop?: THREE.Object3D | null;
  /** the world under the ship (default: a fixed seed) */
  planetSeed?: number;
}

const hubs = new Set<(h: ShipHub) => void>();
let current: ShipHub | null = null;
/** called for every hub created (after its scene is built, before its first frame); returns an unsubscribe */
export function onHub(fn: (h: ShipHub) => void) { hubs.add(fn); if (current) try { fn(current); } catch (e) { console.error('onHub', e); } return () => hubs.delete(fn); }
export const currentHub = () => current;
// plugins: any src/ship/*/hubPlugin.ts whose default export is (hub) => void
const PLUGINS = import.meta.glob('../*/hubPlugin.ts', { eager: true }) as Record<string, { default?: (h: ShipHub) => void }>;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class ShipHub implements Screen {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(21, 16 / 9, 0.5, 12000);
  /** a new mission was started from the title (the intro plays); set by the flow before board() */
  isNewGame: boolean;
  readonly fromPlanet: boolean;
  readonly bin = new Bin();
  readonly M: Mats;
  readonly interior: Interior;
  readonly exterior: Exterior;
  readonly chrome: HubChrome;
  mode: HubMode = 'exterior';
  focused: RoomId | null = null;
  hovered: RoomId | null = null;
  private rooms = {} as Record<RoomId, HubRoom>;
  private roomFns = new Set<(id: RoomId) => void>();
  private upd = new Set<(dt: number, t: number) => void>();
  private locked = false;
  private t = 0;
  // camera: current, from, to, progress
  private cam = { pos: new V3(), look: new V3(), fov: 21 };
  private from = { pos: new V3(), look: new V3(), fov: 21 };
  private to = { pos: new V3(), look: new V3(), fov: 21 };
  private camT = 1; private camDur = 1; private camDone: (() => void) | null = null;
  private ptr = new THREE.Vector2(); private ptrIn = false; private par = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private off: (() => void)[] = [];
  private hum: Loop | null = null;
  private key: THREE.DirectionalLight; private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private globe: Globe;
  private actions: Partial<Record<RoomId, RoomAction[]>>;
  /** 0 = roof on (exterior), 1 = cut away */
  private cut = 0; private cutGoal = 0;

  constructor(readonly engine: Engine, readonly opts: HubOpts = {}) {
    this.isNewGame = !!opts.isNewGame; this.fromPlanet = !!opts.fromPlanet;
    this.actions = { ...(opts.actions ?? {}) };
    this.scene.background = new THREE.Color(0x020308);
    // a soft studio environment for reflections on paint and metal
    const pm = new THREE.PMREMGenerator(engine.renderer);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); this.bin.t(env);
    this.M = new Mats(this.bin); this.M.env = env;
    // light: a soft key from overhead (shadows), a cool fill, each room's own lamp, the star outside
    this.hemi = new THREE.HemisphereLight(0x9aa8b8, 0x2a2622, 0.9); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff2e0, 1.15); this.key.position.set(-14, 40, -10); this.key.target.position.set(0, 0, 0);
    this.key.castShadow = true; this.key.shadow.mapSize.set(2048, 2048); this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.03;
    const sc = this.key.shadow.camera as THREE.OrthographicCamera; sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.near = 5; sc.far = 90;
    this.scene.add(this.key, this.key.target);
    this.sun = new THREE.DirectionalLight(0x9ab8e0, 0); this.sun.position.set(60, -10, -40); this.scene.add(this.sun);
    sc.left = -44; sc.right = 44; sc.top = 44; sc.bottom = -44; sc.far = 140;
    // space and the first world below: stars, the galaxy's band, the star's glare; the planet's limb under the ship
    const SUNW = new V3(-40, 55, 55).normalize();
    const space = makeSpace({ stars: 2600, radius: 5200, sun: SUNW, dust: 120, dustR: [80, 400], nebula: true, seed: 11 });
    this.scene.add(space.group); this.bin.on(() => space.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material)?.dispose?.(); }));
    const world = makePlanet(opts.planetSeed ?? 31337);
    this.globe = makeGlobe(world, 1100, { orbit: false });
    this.globe.group.position.set(-2300, -2100, -2700); this.globe.group.rotation.set(0.3, 0.8, 0.1);
    // a hub-only exposure (the day side and cloud tops clip under this grade): own programs
    this.globe.group.traverse((o) => {
      const me = o as THREE.Mesh; if (!me.isMesh || !(me.material instanceof THREE.ShaderMaterial)) return;
      const k = me === this.globe.mesh ? 0.5 : /cloud|cirrus/.test(me.name) ? 0.42 : 0.7, m = me.material, prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r); sh.uniforms.uHubExp = { value: k }; const i = sh.fragmentShader.lastIndexOf('}'); sh.fragmentShader = 'uniform float uHubExp;\n' + sh.fragmentShader.slice(0, i) + '  gl_FragColor.rgb *= uHubExp;\n' + sh.fragmentShader.slice(i); };
      m.customProgramCacheKey = () => 'hub-exp-' + me.name + k; m.needsUpdate = true;
    });
    (this.globe.mat.uniforms.uSun?.value as THREE.Vector3 | undefined)?.copy(SUNW);
    this.scene.add(this.globe.group);
    this.bin.on(() => this.globe.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material)?.dispose?.(); }));
    // the ship
    this.interior = buildInterior(this.bin, this.M);
    this.scene.add(this.interior.root, this.interior.fx);
    this.exterior = buildExterior(this.bin, this.M, engine.renderer);
    this.scene.add(this.exterior.root);
    if (opts.backdrop) this.scene.add(opts.backdrop);
    // the public room records
    for (const id of ROOM_IDS) {
      const r = ROOMS[id], b = this.interior.rooms[id];
      const spots: HubRoom['spots'] = {};
      for (const [k, s] of Object.entries(r.spots)) spots[k] = { pos: new V3(...s.p), facing: s.f };
      this.rooms[id] = { id, name: r.name, root: b.root, bounds: b.bounds.clone(), cam: roomCam(id), spots };
    }
    // the key props: pick boxes and the corner brackets that light up when the pointer is on one
    const bm = gbuf(new THREE.LineBasicMaterial({ color: new THREE.Color(0x7fe0a0).multiplyScalar(1.6) }), F_EMIT); this.bin.m(bm);
    for (const id of ROOM_IDS) {
      this.keyBoxes[id] = KEYS[id].boxes.map((b) => new THREE.Box3(new V3(b[0], b[1], b[2]), new V3(b[3], b[4], b[5])));
      const P: number[] = [];
      for (const b of KEYS[id].boxes) {
        const L = Math.min(0.4, (b[3] - b[0]) * 0.3, (b[5] - b[2]) * 0.3, (b[4] - b[1]) * 0.3);
        for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
          const sx = x === b[0] ? 1 : -1, sy = y === b[1] ? 1 : -1, sz = z === b[2] ? 1 : -1;
          P.push(x, y, z, x + sx * L, y, z, x, y, z, x, y + sy * L, z, x, y, z, x, y, z + sz * L);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); this.bin.g(g);
      const ln = new THREE.LineSegments(g, bm); ln.visible = false; ln.renderOrder = 5; this.scene.add(ln); this.keyLines[id] = ln;
    }
    // the pod as the ship last left it
    this.podBuild(shipState().pod);
    // the UI
    this.chrome = new HubChrome(this, { hasSave: !!opts.hasSave, fromPlanet: this.fromPlanet });
    this.bindInput();
    // where we start
    if (opts.inside || opts.fromPlanet) { this.mode = 'overview'; this.cut = this.cutGoal = 1; this.jump(overviewCam(this.aspect())); }
    else { this.mode = 'exterior'; this.jump(this.exterior.heroCam()); }
    // dev and QA: ?hub=overview | <room id> starts inside; ?hub=exterior forces the title
    const hv = new URLSearchParams(location.search).get('hub');
    if (hv && hv !== 'exterior') { this.cut = this.cutGoal = 1; if ((ROOM_IDS as string[]).includes(hv)) { this.mode = 'room'; this.focused = hv as RoomId; this.jump(this.rooms[hv as RoomId].cam); } else { this.mode = 'overview'; this.jump(overviewCam(this.aspect())); } }
    this.exterior.setCut(this.cut);
    this.chrome.setMode(this.mode, this.focused);
    (window as any).__hub = this;
    this.hum = cloop('room', 0.3);
    current = this;
    for (const fn of hubs) try { fn(this); } catch (e) { console.error('onHub', e); }
    for (const p of Object.values(PLUGINS)) try { p.default?.(this); } catch (e) { console.error('hubPlugin', e); }
  }

  // ================================================================ API
  room(id: RoomId): HubRoom { return this.rooms[id]; }
  private ev = new Map<string, Set<(d?: any) => void>>();
  /** events: 'board' (inside, after the roof came off; d = { newGame }), 'deploy' (the pod is away), 'mode' (d = mode) */
  on(ev: 'board' | 'deploy' | 'mode', fn: (d?: any) => void) { let s = this.ev.get(ev); if (!s) this.ev.set(ev, (s = new Set())); s.add(fn); return () => { s!.delete(fn); }; }
  emit(ev: string, d?: any) { for (const f of this.ev.get(ev) ?? []) try { f(d); } catch (e) { console.error('hub event', ev, e); } }
  private disp: (() => void)[] = [];
  onDispose(fn: () => void) { this.disp.push(fn); }
  get pod(): THREE.Object3D { return (this.interior.rooms.workshop.ctx.refs.pod as HubPod).root; }
  podBuild(k: number) { (this.interior.rooms.workshop.ctx.refs.pod as HubPod).set(Math.max(0, Math.min(1, k))); }
  onRoomOpen(fn: (id: RoomId) => void) { this.roomFns.add(fn); return () => { this.roomFns.delete(fn); }; }
  onUpdate(fn: (dt: number, t: number) => void) { this.upd.add(fn); return () => { this.upd.delete(fn); }; }
  lockInput(on: boolean) { this.locked = on; if (on) this.setHover(null); }
  isLocked() { return this.locked; }
  showChrome(on: boolean) { this.chrome.visible(on); }
  setActions(id: RoomId, a: RoomAction[]) { this.actions[id] = a; if (this.focused === id && this.mode === 'room') this.chrome.openPanel(id, a); }
  getActions(id: RoomId) { return this.actions[id] ?? []; }
  /** fly into a room (no panel) */
  focus(id: RoomId, o: { instant?: boolean } = {}): Promise<void> {
    this.focused = id; this.vig = null; this.mode = 'room'; this.setCut(1);
    this.chrome.setMode('room', id);
    return this.fly(this.rooms[id].cam, o.instant ? 0 : 0.85);
  }
  /** fly into a room and open its function */
  async open(id: RoomId) {
    const p = this.focus(id);
    csfx('servo', 0.5);
    this.chrome.openPanel(id, this.getActions(id));
    for (const f of this.roomFns) try { f(id); } catch (e) { console.error('onRoomOpen', e); }
    await p;
  }
  overview(o: { instant?: boolean } = {}): Promise<void> {
    this.focused = null; this.vig = null; this.mode = 'overview'; this.setCut(1);
    this.chrome.closePanel(); this.chrome.setMode('overview');
    return this.fly(overviewCam(this.aspect()), o.instant ? 0 : 0.85);
  }
  /** back out to the exterior title shot */
  outside(): Promise<void> {
    this.focused = null; this.mode = 'exterior'; this.setCut(0);
    this.chrome.closePanel(); this.chrome.setMode('exterior');
    return this.fly(this.exterior.heroCam(), 2.2);
  }
  /** board: the roof lifts away and the camera settles into the cutaway */
  async board() {
    if (this.mode !== 'exterior') return;
    this.mode = 'boarding'; this.chrome.setMode('boarding');
    csfx('servo', 0.6); csfx('steam', 0.4);
    this.setCut(1);
    await this.fly(overviewCam(this.aspect()), 2.6);
    this.mode = 'overview'; this.chrome.setMode('overview');
    this.emit('board', { newGame: this.isNewGame });
  }
  /** a scripted camera move; holds until release() */
  shot(c: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }, dur = 1.2): Promise<void> {
    this.mode = 'shot'; this.setHover(null);
    return this.fly({ pos: c.pos.clone(), look: c.look.clone(), fov: c.fov ?? this.cam.fov }, dur);
  }
  release() { if (this.mode === 'shot') { if (this.focused) this.focus(this.focused); else this.overview(); } }
  /** the hull breach in the lab (intro) */
  breach(): Breach { return breachFx(this); }
  alarm(on: boolean) { this.alarmOn = on; }
  alarmOn = false;
  private tmpC = new THREE.Color();
  /** a fade to black over the frame (0 clear .. 1 black), for cuts in cinematics */
  fade = 0;
  /** the cut-away state (0 roof on .. 1 cut away), animated */
  setCut(k: number) { this.cutGoal = k; }
  /** finish every running transition now (camera, roof): for tests and screenshots */
  snap() { this.cut = this.cutGoal; this.exterior.setCut(this.cut); if (this.camT < 1) { this.camT = 1; this.cam.pos.copy(this.to.pos); this.cam.look.copy(this.to.look); this.cam.fov = this.to.fov; const d = this.camDone; this.camDone = null; d?.(); } }

  /** how much of its power a deck gets (engineering's bus): a starved deck dims */
  powerK(id: RoomId) {
    const p = shipState().power, share = id === 'lab' ? p.lab : id === 'workshop' ? p.workshop : id === 'bridge' ? p.sensors : id === 'engineering' ? p.engines : id === 'cargo' ? p.engines : p.life;
    const nominal = id === 'lab' ? 0.2 : id === 'workshop' ? 0.15 : id === 'bridge' ? 0.15 : id === 'engineering' || id === 'cargo' ? 0.2 : 0.3;
    return Math.max(0.35, Math.min(1.25, 0.55 + 0.45 * share / nominal));
  }

  // ================================================================ camera
  aspect() { return Math.max(0.5, this.engine.w / Math.max(1, this.engine.h)); }
  private jump(c: CamPreset) { this.cam.pos.copy(c.pos); this.cam.look.copy(c.look); this.cam.fov = c.fov; this.to.pos.copy(c.pos); this.to.look.copy(c.look); this.to.fov = c.fov; this.camT = 1; this.applyCam(); }
  private fly(c: CamPreset, dur: number): Promise<void> {
    this.camDone?.();
    this.from.pos.copy(this.cam.pos); this.from.look.copy(this.cam.look); this.from.fov = this.cam.fov;
    this.to.pos.copy(c.pos); this.to.look.copy(c.look); this.to.fov = c.fov;
    this.camT = dur <= 0 ? 1 : 0; this.camDur = Math.max(0.01, dur);
    if (dur <= 0) { this.jump(c); return Promise.resolve(); }
    return new Promise((res) => { this.camDone = res; });
  }
  private applyCam() {
    const c = this.camera;
    c.position.copy(this.cam.pos);
    // a slight lean after the pointer in the overview and rooms
    if ((this.mode === 'overview' || this.mode === 'room' || this.mode === 'exterior') && this.camT >= 1) {
      const right = new V3().crossVectors(new V3().subVectors(this.cam.look, this.cam.pos).normalize(), new V3(0, 1, 0)).normalize();
      const d = this.cam.pos.distanceTo(this.cam.look) * (this.mode === 'exterior' ? 0.03 : 0.012);
      c.position.addScaledVector(right, this.par.x * d).addScaledVector(new V3(0, 1, 0), -this.par.y * d * 0.6);
    }
    c.fov = this.cam.fov; c.aspect = this.aspect(); c.updateProjectionMatrix();
    c.lookAt(this.cam.look); c.updateMatrixWorld();
  }

  // ================================================================ input
  private bindInput() {
    const cv = this.engine.canvas;
    const move = (e: PointerEvent) => {
      this.ptrIn = true; this.ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (!this.locked && (this.mode === 'overview' || this.mode === 'room')) this.setHover(this.pick(), e.clientX, e.clientY);
      else if (this.hovered) this.setHover(null);
      const hot = !this.locked && this.mode === 'room' && !this.vig && this.pickKey();
      if (hot !== this.keyHot) { this.keyHot = hot; if (hot) csfx('hover', 0.5); }
      const prop = !hot && !this.locked && this.mode === 'room' && !this.vig ? this.propAt() : null;
      if (this.focused) this.chrome.keyHint(hot && !this.vig ? KEYS[this.focused].label : prop ? prop.label : null, e.clientX, e.clientY);
      if (hot || prop) this.engine.canvas.style.cursor = 'pointer';
    };
    const leave = () => { this.ptrIn = false; this.setHover(null); };
    const down = (e: PointerEvent) => {
      if (this.locked) return;
      if (e.button === 2) { this.back(); return; }
      if (this.mode === 'exterior') return;
      // inside a room, its key prop opens the room's function; other props do their little thing
      if (this.mode === 'room' && this.focused && !this.vig && this.pickKey()) { csfx('button', 0.6); this.useRoom(this.focused); return; }
      if (this.mode === 'room' && this.focused && this.clickProp()) return;
      if (this.vig) return;
      const id = this.pick();
      if (id && (this.mode === 'overview' || (this.mode === 'room' && id !== this.focused))) { csfx('button', 0.5); this.open(id); }
    };
    const key = (e: KeyboardEvent) => {
      if (this.locked || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') { this.back(); e.preventDefault(); }
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && this.mode !== 'exterior') { const id = ROOM_IDS.find((r) => ROOMS[r].code === '0' + n); if (id) this.open(id); }
      if (this.mode === 'exterior' && (e.key === 'Enter' || e.key === ' ')) this.chrome.titleDefault();
    };
    const ctx = (e: Event) => e.preventDefault();
    cv.addEventListener('pointermove', move); cv.addEventListener('pointerleave', leave); cv.addEventListener('pointerdown', down); cv.addEventListener('contextmenu', ctx);
    addEventListener('keydown', key);
    this.off.push(() => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerleave', leave); cv.removeEventListener('pointerdown', down); cv.removeEventListener('contextmenu', ctx); removeEventListener('keydown', key); });
  }
  back() {
    if (closeTerminal()) return;
    if (this.chrome.closeOverlay()) return;
    if (this.chrome.inVignette()) { this.chrome.closeVignette(); this.vig = null; if (this.focused) this.fly(this.rooms[this.focused].cam, 0.7); return; }
    if (this.mode === 'room') { csfx('tick', 0.6); this.overview(); }
    else if (this.mode === 'overview' && !this.fromPlanet) { csfx('tick', 0.6); this.outside(); }
  }
  /** the focused room's key prop under the pointer */
  private pickKey(): boolean {
    if (!this.ptrIn || !this.focused) return false;
    this.ray.setFromCamera(this.ptr, this.camera);
    const k = this.keyBoxes[this.focused];
    return k.some((b) => this.ray.ray.intersectsBox(b));
  }
  /** a small prop that does something when clicked (registered by the rooms: refs.props) */
  private propAt(): { box: THREE.Box3; label: string; act: () => void } | null {
    if (!this.ptrIn || !this.focused) return null;
    this.ray.setFromCamera(this.ptr, this.camera);
    const list = (this.interior.rooms[this.focused].ctx.refs.props ?? []) as { box: THREE.Box3; label: string; act: () => void }[];
    let best: { box: THREE.Box3; label: string; act: () => void } | null = null, bd = Infinity;
    const hit = new V3();
    for (const p of list) { if (this.ray.ray.intersectBox(p.box, hit)) { const d = hit.distanceTo(this.ray.ray.origin); if (d < bd) { bd = d; best = p; } } }
    return best;
  }
  private clickProp() { const p = this.propAt(); if (!p) return false; try { p.act(); } catch (e) { console.error('prop', e); } return true; }
  private keyBoxes = {} as Record<RoomId, THREE.Box3[]>;
  private keyLines = {} as Record<RoomId, THREE.LineSegments>;
  private keyHot = false;
  /** the room function being shown as a vignette (the camera on the key prop, callouts on the objects) */
  vig: RoomId | null = null;
  vignette(id: RoomId, ctx: { actions: Partial<Record<string, () => void>>; game: any }) {
    if (this.focused !== id) { this.focused = id; this.mode = 'room'; this.chrome.setMode('room', id); }
    this.vig = id; this.setHover(null);
    csfx('whoosh', 0.35);
    this.fly(VIGNETTES[id].cam, 0.75);
    this.chrome.openVignette(id, ctx);
  }
  /** use a room: its function screen (the bridge: straight to the main monitor) */
  useRoom(id: RoomId) {
    for (const f of this.useFns) try { if (f(id)) return; } catch (e) { console.error('useRoom', e); }
  }
  private useFns: ((id: RoomId) => boolean | void)[] = [];
  /** the flow decides what using a room does (return true when handled) */
  onUse(fn: (id: RoomId) => boolean | void) { this.useFns.unshift(fn); return () => { this.useFns = this.useFns.filter((f) => f !== fn); }; }
  private pick(): RoomId | null {
    if (!this.ptrIn) return null;
    this.ray.setFromCamera(this.ptr, this.camera);
    const hits = this.ray.intersectObjects(ROOM_IDS.map((id) => this.interior.rooms[id].pick), false);
    return (hits[0]?.object.userData.room as RoomId) ?? null;
  }
  private setHover(id: RoomId | null, x = 0, y = 0) {
    if (id === this.focused && this.mode === 'room') id = null;
    if (id !== this.hovered) { if (id) csfx('hover', 0.4); this.hovered = id; this.engine.canvas.style.cursor = id ? 'pointer' : ''; }
    this.chrome.hover(id, x, y);
  }

  // ================================================================ frame
  update(dt: number, t: number) {
    this.t += dt;
    // the camera
    if (this.camT < 1) {
      this.camT = Math.min(1, this.camT + dt / this.camDur);
      const k = ease(this.camT);
      this.cam.pos.lerpVectors(this.from.pos, this.to.pos, k);
      // arc the path up a little so fly-ins swoop rather than slide
      this.cam.pos.y += Math.sin(Math.PI * k) * this.from.pos.distanceTo(this.to.pos) * 0.16;
      this.cam.look.lerpVectors(this.from.look, this.to.look, k);
      this.cam.fov = this.from.fov + (this.to.fov - this.from.fov) * k;
      if (this.camT >= 1) { const d = this.camDone; this.camDone = null; d?.(); }
    }
    if (this.ptrIn) { this.par.x += (this.ptr.x - this.par.x) * Math.min(1, dt * 2); this.par.y += (this.ptr.y - this.par.y) * Math.min(1, dt * 2); }
    this.applyCam();
    // the roof
    if (Math.abs(this.cut - this.cutGoal) > 1e-4) { this.cut += Math.sign(this.cutGoal - this.cut) * Math.min(Math.abs(this.cutGoal - this.cut), dt / 2.2); this.exterior.setCut(this.cut); }
    // light balance: outside, the star is the key; inside, the overhead key and the room lamps
    const ins = this.cut;
    const ex = 1 - ins, L = (a: number, b: number) => a + (b - a) * ex;
    // one shadowed key: overhead inside, the star (warm, from starboard-forward-above) outside; a cool rim from
    // behind and the planet's blue bounce from below outside
    this.key.position.set(L(-14, -40), L(40, 55), L(-10, 55));
    this.key.intensity = L(this.focused ? 0.55 : 0.8, 2.7);
    this.sun.intensity = L(0.2, 1.4);
    this.hemi.intensity = L(this.focused ? 0.42 : 0.6, 0.55);
    this.hemi.color.setHex(0x9aa8b8).lerp(this.tmpC.setHex(0x40506a), ex);
    this.hemi.groundColor.setHex(0x2a2622).lerp(this.tmpC.setHex(0x284868), ex);
    this.globe.mat.uniforms.uT.value = t;
    this.globe.group.rotation.y += dt * 0.004;
    for (const id of ROOM_IDS) {
      const r = this.interior.rooms[id];
      const hk = id === this.hovered ? 1 : id === this.focused ? 0.35 : 0;
      const gm = r.glow.material as THREE.MeshBasicMaterial;
      gm.color.setHex(ROOMS[id].light).multiplyScalar(0.18 * hk);
      r.light.intensity = r.baseK * (0.25 + 0.75 * ins) * (this.alarmOn ? 0.5 : 1) * this.powerK(id);
      const kl = this.keyLines[id]; kl.visible = this.mode === 'room' && this.focused === id && !this.locked && !this.vig;
      if (kl.visible) (kl.material as THREE.LineBasicMaterial).color.setHex(0x7fe0a0).multiplyScalar(this.keyHot ? 2.4 : 0.7 + Math.sin(t * 3) * 0.3);
    }
    if (this.alarmOn) { const a = Math.sin(t * 6) > 0 ? 1 : 0; this.interior.rooms.lab.light.color.setHex(a ? 0xff3020 : ROOMS.lab.light); } else this.interior.rooms.lab.light.color.setHex(ROOMS.lab.light);
    for (const a of this.interior.anims) a(dt, t);
    this.interior.screens.update(dt, t, 5);
    this.exterior.update(dt, t, this.camera);
    for (const f of this.upd) try { f(dt, t); } catch (e) { console.error('hub onUpdate', e); }
    this.chrome.update(dt, t, this.camera);
  }
  render(post: Post, t: number) {
    resetGrade(post.grade);
    post.grade.bloom = 0.42; post.grade.sat = 1.06; post.grade.vig = 0.3;
    post.U.uFade.value = Math.max(0, Math.min(1, this.fade)); (post.U.uFadeCol.value as THREE.Color).setRGB(0, 0, 0);
    post.render(this.scene, this.camera, undefined, t);
  }
  resize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
    if (this.mode === 'overview' && this.camT >= 1) this.jump(overviewCam(this.aspect()));
  }
  suspend() { this.chrome.visible(false); this.hum?.stop?.(); }
  resume() { this.chrome.visible(true); current = this; this.hum = cloop('room', 0.3); }
  dispose() {
    this.engine.post.U.uFade.value = 0;
    this.disp.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); this.disp = [];
    this.off.forEach((f) => f()); this.off = [];
    this.chrome.dispose(); this.interior.screens.dispose(); this.exterior.dispose();
    this.hum?.stop?.(); this.bin.dispose();
    this.engine.canvas.style.cursor = '';
    if (current === this) current = null;
  }
}

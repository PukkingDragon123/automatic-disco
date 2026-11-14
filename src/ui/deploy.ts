// THE DEPLOYMENT. After a region is picked on the planet screen, Unit 07 goes down the way the Planetary Corps
// sends everything: from the U.S.S. VANGUARD in high orbit.
//   1. the carrier: a long flyover under its floodlit hull toward the planet, then its profile against the limb;
//      inside Launch Bay 2 the gantry crane lowers Unit 07 into the drop pod, the hatch swings shut, the clamps bite,
//      steam vents; up in the gallery the launch officer asks for a drop zone
//   (the drop point itself is picked from orbit on the planet screen and handed in)
//   2. the launch: klaxons, the red beacons, the countdown on nixie tubes, the clamshell doors opening on the
//      planet, the lever, the rail firing the pod out of the bow; the pod seen leaving the ship
//   3. the descent (game/descent.ts): flown by the player, scored against the pin, with its own cinematic cuts
// The first landing plays all of it; later ones are a short version. Esc skips any cinematic part (the scene runs
// through to its end state); in the descent Esc hands over to the autopilot and fast-forwards.
import * as THREE from 'three';
import type { Engine, Screen } from '../app/engine';
import type { Input } from '../app/input';
import { type Post, resetGrade } from '../gfx/post';
import { Cinema } from '../game/cinema';
import { csfx } from './cineAudio';
import { makeGlobe, makeSpace, type Globe } from './globe';
import { type Planet, type PRegion } from '../world/planet';
import { Region, BIOMES } from '../world/region';
import { planetPalette, type Palette } from '../world/palette';
import { Fx } from '../game/fx';
import { VeyrChild } from '../game/child';
import { loadLook } from '../game/babyLook';
import type { Run } from '../game/run';
import { Descent, bonusFor, type DescentResult, type Grade } from '../game/descent';
import { Bin, V3, ease, type V } from './deployKit';
import { buildShip, BAY, BOOTH, railVents, type Ship } from './deployShip';
import { portholeWorld } from './deployPod';
import { assessLZ, type LZInfo } from '../game/descentWorld';
import { hashi } from '../core/rand';

export interface DeployResult {
  /** where the pod came down (region coordinates), for the game's core; null when skipped outright */
  landing: { x: number; z: number } | null;
  grade: Grade | 'SKIPPED'; dist: number;
  /** what was added to the run */
  bonus: string;
}
export interface DeployOpts {
  planet: Planet; region: PRegion; run: Run | null;
  /** landings made before this one (0: the full sequence plays) */
  landings: number;
  onDone(r: DeployResult): void;
  /** the drop point picked from orbit (region coordinates); the recommended LZ when absent */
  lz?: { x: number; z: number } | null;
  /** the Region already generated for this region (the planet screen's close-up), to save generating it again */
  regionData?: Region | null;
  /** QA: start at 'launch' or 'descent' */
  phase?: string | null;
  /** QA: freeze time (engine.timeScale = 0) when the named shot is reached, for screenshots */
  hold?: string | null;
}

const OPS = ['FIRST LIGHT', 'IRON SEED', 'LONG FALL', 'HIGH TIDE', 'BRIGHT ANVIL', 'QUIET HARVEST', 'COLD FORGE', 'STARFALL', 'DEEP FURROW', 'RED SKY', 'GRANITE', 'LANTERN'];
const NUM = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

export class DeployScreen implements Screen {
  private cine = new Cinema({});
  private bin = new Bin();
  private scene = new THREE.Scene(); private fxScene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(40, 1, 0.12, 15000);
  private ship: Ship | null = null; private globe: Globe | null = null; private fx: Fx | null = null; private child: VeyrChild | null = null;
  private region: Region; private pal: Palette;
  private descent: Descent | null = null;
  private mode: 'boot' | 'carrier' | 'descent' | 'done' = 'boot';
  private t = 0; private first: boolean;
  private lz: LZInfo;
  private op: string;
  private podFree: { p: V; v: V; t: number } | null = null;
  private disposed = false;
  private tasks: ((dt: number, t: number) => boolean | void)[] = [];

  constructor(readonly engine: Engine, readonly input: Input, readonly o: DeployOpts) {
    this.first = o.landings === 0;
    this.pal = planetPalette(o.region.seed, o.planet.palKey);
    this.op = this.first ? OPS[0] : OPS[1 + (hashi(o.region.seed, o.landings) % (OPS.length - 1))];
    // the same region the game will generate: the chart, the hazards and the descent's terrain come from it
    this.region = o.regionData ?? new Region(o.region.seed, BIOMES[o.region.biome], this.pal);
    this.lz = assessLZ(this.region, o.lz?.x ?? this.region.landing.x, o.lz?.z ?? this.region.landing.z);
    this.cine.ui.fade(1, 0);
    (window as any).__deploy = this;
    void this.start();
  }

  // ================================================================ build the carrier scene
  private async start() {
    try { await Promise.all(['20px Superwide', '14px VT', '20px Canned', '11px Silk'].map((f) => document.fonts?.load(f))); } catch { /* fall back */ }
    if (this.disposed) return;
    if (this.o.phase === 'descent') { this.toDescent(); return; }
    this.buildCarrier();
    this.mode = 'carrier';
    if (this.o.phase === 'launch') { this.setLoaded(); this.cine.ui.fade(0, 0.4); void this.launch(); return; }
    await this.cine.play((c) => (this.first ? this.establish(c) : this.establishShort(c)), { name: 'deploy-carrier' });
    if (this.disposed) return;
    void this.launch();
  }
  private buildCarrier() {
    const bin = this.bin, sc = this.scene, P = this.o.planet;
    sc.background = new THREE.Color(0x020306);
    // the planet ahead and below the bow, the chosen region turned to face the ship, lit from behind the ship
    const R = 900, dir = new V3(0.07, -0.05, 1).normalize();
    const sunDir = new V3(-0.8, 0.38, -0.46).normalize();
    const space = makeSpace({ stars: 2600, radius: 7000, sun: sunDir, dust: 0, seed: P.seed });
    sc.add(space.group); bin.adopt(space.group);
    const g = makeGlobe(P, R, {});
    g.group.position.copy(dir).multiplyScalar(R * 4);
    g.group.quaternion.setFromUnitVectors(new V3(...this.o.region.c), dir.clone().negate());
    g.mat.uniforms.uSun.value.copy(sunDir);
    g.setHover(this.o.region.id);
    sc.add(g.group); bin.adopt(g.group);
    this.globe = g;
    // the ship
    this.ship = buildShip(bin, sc, { people: true });
    this.ship.sun.position.copy(sunDir).multiplyScalar(220);
    // particles, and Unit 07 in its sling under the crane hook
    this.fx = new Fx(this.fxScene, sc);
    const parts = this.o.run ? [...this.o.run.skills.owned] : [];
    // whatever child.ts builds for these parts, scaled to fit the pod's hatch (about a metre across)
    const ch = new VeyrChild(this.fx, 1, loadLook(), { grown: true, parts });
    ch.hatch = 1; ch.update(0, this.cam);
    const sz = new THREE.Box3().setFromObject(ch.root).getSize(new V3());
    ch.setScale(0.95 / Math.max(0.25, sz.x, sz.y, sz.z));
    ch.root.position.set(0, -1.45, 0);
    this.ship.hook.add(ch.root);
    bin.adopt(ch.root);
    this.child = ch;
    this.ship.pod.setHatch(1);
    this.ship.setSled(BAY.podZ0);
  }
  /** the end state of the loading: Unit 07 inside, hatch shut, clamps locked */
  private setLoaded() {
    const s = this.ship!;
    s.setCrane(30, 0, 1.2); s.pod.setHatch(0); s.setClamps(1);
    if (this.child) this.child.hatch = 0;
    s.setView('int'); this.globe!.group.visible = false;
    for (const c of s.crew) c.a.place(c.home.x, c.home.z);
  }
  private w(x: number, y: number, z: number) { return new V3(x, y, z); }
  /** QA hold point: freeze here if asked to (screenshots of a given shot) */
  private mark(name: string) { if (this.o.hold === name) { this.engine.timeScale = 0; console.log('deploy hold', name); } }

  // ================================================================ 1. the carrier (full)
  private async establish(c: Cinema) {
    const s = this.ship!, g = this.globe!, ch = this.child!;
    c.onEnd(() => this.setLoaded());
    s.setView('ext'); g.group.visible = true;
    s.setCrane(44, 0, 2);
    // ---- the flyover: under the hull, bow to stern, toward the planet
    const engine = c.loop('engine', 0.55), drone = c.loop('drone', 0.35);
    void drone;
    c.cam.cut(this.w(6, -31, 100), this.w(6, -1, 200), 50);
    c.cam.handheld = 0.15;
    void c.fade(0, 2.4);
    c.sfx('swell', 0.8, 1.6);
    setTimeout(() => { if (c.active && !c.skipping) { c.ui.card(`OPERATION ${this.op}`, `HIGH ORBIT OVER ${this.o.planet.name.toUpperCase()} · U.S.S. VANGUARD CVS-01`, 'U.S. PLANETARY CORPS', 'TOP SECRET'); csfx('sting', 0.7); } }, 2200);
    setTimeout(() => { if (c.active && !c.skipping) c.ui.cardOff(); }, 6400);
    c.stamp(`D+${this.o.landings} · 04:12 ZULU · ALT 310 NMI`);
    void c.tween(12, (u) => { const z = 100 - u * 330; c.cam.pos.set(6 + u * 3, -31 + u * 3, z); c.cam.look.set(6 + u * 2, -1 - u * 12, z + 100); }, 'linear');
    await c.wait(4.2); this.mark('flyover');
    await c.wait(4.6); this.mark('flyover2');
    await c.wait(3.2);
    // ---- the profile: the long hull against the planet's limb
    c.cam.handheld = 0.3;
    c.cam.cut(this.w(-150, 38, -150), this.w(0, -4, 30), 30);
    void c.cam.move({ pos: this.w(-160, 30, -110), look: this.w(0, -6, 40), dur: 6.5, ease: 'linear' });
    c.sfx('klaxon', 0.35, 0.9);
    void c.say('All decks, condition one. Launch Bay Two, prepare Unit Seven for deployment.', { who: 'Vanguard Control', style: 'radio', pitch: 1.0 });
    await c.wait(3); this.mark('profile');
    await c.wait(3.2);
    // ---- inside Launch Bay 2: the crane brings Unit 07 down the hangar
    await c.fade(1, 0.25);
    engine.set(0.25);
    s.setView('int'); g.group.visible = false;
    const room = c.loop('room', 0.6); void room;
    c.cam.handheld = 0.03;
    c.cam.cut(this.w(7.4, -6.6, 8.6), this.w(-1, -12.5, 30), 56);
    void c.cam.move({ pos: this.w(6.6, -7.0, 11.5), look: this.w(-0.5, -12.4, 28), dur: 7, ease: 'inOut' });
    void c.fade(0, 0.5);
    c.stamp('LAUNCH BAY 2 · 04:16 ZULU', true);
    const chief = s.crew.find((x) => x.role === 'chief')!.a;
    chief.faceNow(0, 18); chief.gesture('wave', { hold: true });
    const [cl1, cl2] = s.crew.filter((x) => x.role === 'clamp');
    cl1.a.walkTo(-1.6, 14.6); cl2.a.walkTo(1.6, 16.2);
    s.crew.find((x) => x.role === 'console')!.a.action = 'type';
    c.sfx('servo', 0.6);
    void c.say('Easy... easy... bring her down the line.', { who: 'CPO Hale', style: 'radio', pitch: 0.8 });
    void c.tween(6.5, (u) => s.setCrane(44 - u * 28.5, 0, 2), 'inOut');
    await c.wait(3.4); this.mark('bay');
    await c.wait(3.1);
    chief.rig.clearGesture();
    // ---- close: down into the pod
    c.cam.cut(this.w(3.4, -10.4, 12.2), this.w(0, -12.0, 15.6), 36);
    void c.cam.move({ pos: this.w(3.0, -10.9, 12.8), look: this.w(0, -12.3, 15.5), dur: 4.5, ease: 'inOut' });
    ch.look.copy(this.cam.position);
    c.sfx('servo', 0.5, 0.8);
    void c.tween(3.2, (u) => s.setCrane(15.5, 0, 2 + u * 3.6), 'inOut');
    await c.wait(1.4); this.mark('load');
    await c.wait(1.8);
    ch.hatch = 0;
    c.sfx('servo', 0.7, 1.2);
    await c.tween(1.3, (u) => s.pod.setHatch(1 - u), 'inOut');
    c.sfx('clamp', 1); c.cam.shake(0.05, 0.2);
    await c.tween(0.5, (u) => s.setClamps(u), 'out');
    c.sfx('clamp', 0.9, 0.9);
    this.steam(new V3(-1.1, BAY.floor + 1.9, 15), 18); this.steam(new V3(1.1, BAY.floor + 1.9, 16.5), 18); c.sfx('steam', 0.8);
    void c.say('She is seated. Hatch secure, clamps locked.', { who: 'CPO Hale', style: 'radio', pitch: 0.8 });
    void c.tween(2.5, (u) => s.setCrane(15.5 + u * 14, 0, 5.6 - u * 4.4), 'inOut');
    await c.wait(2.6);
    // ---- the gallery: the launch officer over the bay
    c.cam.handheld = 0.02;
    c.cam.cut(this.w(-8.4, -7.3, 9.2), this.w(-3.0, -11.4, 19.5), 44);
    void c.cam.move({ pos: this.w(-8.2, -7.25, 9.6), look: this.w(-3.4, -11.2, 19.0), dur: 4, ease: 'inOut' });
    s.officer!.faceNow(-3, 19); s.officer!.look = this.w(0, -12.5, 16);
    void c.wait(1.6).then(() => this.mark('gallery'));
    await c.say(`Unit Seven, this is Launch Control. Drop zone received: grid ${this.lz.grid}, ${this.o.region.name}. Stand by.`, { who: 'Cdr. Okafor', style: 'radio', pitch: 0.75 });
    await c.wait(0.2);
  }
  /** later landings: the profile, the gallery, and on to the chart */
  private async establishShort(c: Cinema) {
    const s = this.ship!, g = this.globe!;
    c.onEnd(() => this.setLoaded());
    this.setLoaded();
    s.setView('ext'); g.group.visible = true;
    c.loop('engine', 0.4);
    c.cam.handheld = 0.3;
    c.cam.cut(this.w(-150, 38, -150), this.w(0, -4, 30), 30);
    void c.cam.move({ pos: this.w(-160, 30, -115), look: this.w(0, -6, 40), dur: 5, ease: 'linear' });
    void c.fade(0, 1.2);
    c.ui.card(`OPERATION ${this.op}`, `LANDING ${NUM[Math.min(10, this.o.landings + 1)]} · ${this.o.region.name.toUpperCase()}`, 'U.S. PLANETARY CORPS', 'TOP SECRET'); csfx('sting', 0.6);
    await c.wait(3.6);
    c.ui.cardOff();
    await c.fade(1, 0.25);
    s.setView('int'); g.group.visible = false;
    c.cam.cut(this.w(-8.4, -7.3, 9.2), this.w(-3.0, -11.4, 19.5), 44);
    void c.fade(0, 0.4);
    s.officer!.faceNow(-3, 19);
    await c.say(`Seven, Launch Control. Same drill. Drop zone grid ${this.lz.grid}.`, { who: 'Cdr. Okafor', style: 'radio', pitch: 0.75 });
  }

  // ================================================================ 2. the launch
  private async launch() {
    const lz = this.lz;
    await this.cine.play((c) => this.launchScript(c, lz), { name: 'deploy-launch' });
    if (this.disposed) return;
    this.toDescent();
  }
  private async launchScript(c: Cinema, lz: LZInfo) {
    const s = this.ship!, g = this.globe!;
    const full = this.first;
    c.onEnd(() => { s.setDoors(1); s.setBeacons(false); });
    // ---- the officer at the console: confirm, clear the rail
    const off = s.officer!;
    off.place(-6.4, 16.75, 0); off.faceNow(-6.4, 20); off.look = this.w(0, -12, 50);
    for (const cr of s.crew) cr.a.place(cr.home.x, cr.home.z);
    c.cam.handheld = 0.025;
    c.cam.cut(this.w(-5.0, -7.35, 15.6), this.w(-6.7, -7.7, 17.8), 42);
    void c.cam.move({ pos: this.w(-5.3, -7.4, 16.0), look: this.w(-6.6, -7.75, 17.8), dur: 3, ease: 'inOut' });
    const room = c.loop('room', 0.5); void room;
    await c.say(`Drop zone confirmed, grid ${lz.grid}. Clear the rail! Clear the rail!`, { who: 'Cdr. Okafor', style: 'radio', pitch: 0.75 });
    s.setBeacons(true); c.sfx('klaxon', 0.8);
    const klax = c.task((_, t) => { if (Math.floor(t / 1.6) !== Math.floor((t - 1 / 60) / 1.6)) c.sfx('klaxon', 0.55); });
    for (const cr of s.crew) { cr.a.walkTo(cr.post.x, cr.post.z, 2.2); }
    setTimeout(() => { for (const cr of s.crew) if (cr.role !== 'console') { cr.a.action = 'cover_ears'; } }, 2600);
    // ---- the countdown, cut between the tubes, the doors, the bay, the porthole, the lever
    const N = full ? 10 : 3;
    const shot = (i: number) => {
      const k = N - i;
      if (k === N) { c.cam.cut(this.w(-6.55, -7.52, 17.3), this.w(-6.55, -7.76, 17.95), 30); c.cam.handheld = 0.006; return; }
      if (full ? k === N - 2 : k === 1) {
        // the doors: from behind the pod down the rail; they part on the planet
        g.group.visible = true;
        c.cam.cut(this.w(0.9, -11.4, 9.6), this.w(0, -9.5, 64), 50); c.cam.handheld = 0.03;
        c.sfx('servo', 0.9, 0.5); c.sfx('lever', 0.8, 0.6); csfx('wind', 0.8, 0.8);
        void c.tween(full ? 4.2 : 2.2, (u) => s.setDoors(u), 'inOut');
        this.vent(full ? 4 : 2);
        return;
      }
      if (full && k === N - 5) { c.cam.cut(this.w(-7.6, -7.3, 42), this.w(0, -12.4, 22), 50); c.cam.handheld = 0.04; this.steamRail(); c.sfx('steam', 1); return; }
      if (full && k === N - 7) { const p = portholeWorld(s.pod); c.cam.cut(p.clone().add(new V3(0.55, 1.05, -0.35)), p, 30); c.cam.handheld = 0.01; s.pod.lens.value = 1.6; return; }
      if (k === 2 && full) { c.cam.cut(this.w(-6.9, -7.45, 16.85), this.w(-7.35, -7.85, 17.65), 34); c.cam.handheld = 0.01; return; }
    };
    for (let i = N; i >= 1; i--) {
      shot(i);
      s.setNixies(String(i));
      if (i === N - 1) this.mark('nixie');
      if (i === (full ? N - 4 : 1)) this.mark('doors');
      if (full && i === N - 6) this.mark('beacons');
      if (full && i === 2) this.mark('porthole');
      c.sfx(i <= 3 ? 'beepHi' : 'beep', 0.6, i <= 3 ? 1 : 0.9);
      if (i <= 3 || i === N) void c.say(i === N ? `T minus ${NUM[i].toLowerCase()}.` : `${NUM[i].charAt(0) + NUM[i].slice(1).toLowerCase()}...`, { who: 'Cdr. Okafor', style: 'radio', pitch: 0.75, hold: -1.4 });
      if (i === 2) { c.sfx('lever', 1); void c.tween(0.6, (u) => s.setLever(u), 'inOut'); }
      await c.wait(1);
    }
    klax();
    s.setNixies('00');
    // ---- LAUNCH: the rail fires the sled down the bay and out of the doors
    s.setDoors(1);
    c.cam.cut(this.w(3.1, -13.5, 54), this.w(0, -12.8, 22), 44); c.cam.handheld = 0.04;
    c.sfx('ignite', 1); c.sfx('launch', 1);
    void c.say('LAUNCH.', { who: 'Cdr. Okafor', style: 'radio', pitch: 0.75 });
    const pw = new V3();
    c.cam.track(() => ({ look: s.pod.root.getWorldPosition(pw) }), 12);
    const vents = railVents();
    await c.tween(0.95, (u) => {
      s.setSled(BAY.podZ0 + u * (BAY.z1 - 2.5 - BAY.podZ0));
      const z = s.sled.position.z;
      if (this.fx && !c.skipping) {
        for (const sx of [-0.75, 0.75]) this.fx.spray(sx, BAY.floor + 0.75, z - 1.5, (Math.random() - 0.5) * 0.4, 0.5, -1, 3, 0xffc070, { glow: true, speed: 9, cone: 0.5, size: 2, life: 0.35, grav: 12 });
        for (const v of vents) if (Math.abs(v.z - z) < 2) this.fx.spray(v.x, v.y, v.z, 0, 1, 0, 4, 0xe8ecf0, { speed: 5, cone: 0.5, size: 5, life: 0.8, grav: -1, drag: 2 });
      }
      c.cam.shake(0.25 * u, 0.2);
      if (u > 0.55) this.mark('launch');
    }, 'inCubic');
    c.cam.track(null);
    // the pod leaves the sled at speed and the camera is outside, beside the bow
    const pod = s.pod.root;
    pod.updateMatrixWorld(); const wp = pod.getWorldPosition(new V3()), wq = pod.getWorldQuaternion(new THREE.Quaternion());
    s.root.add(pod); pod.position.copy(wp); pod.quaternion.copy(wq);
    this.podFree = { p: wp.clone(), v: new V3(0, -1.5, 62), t: 0 };
    s.setView('both');
    c.cam.cut(this.w(26, -20, 96), this.w(0, -9, 64), 40); c.cam.handheld = 0.2;
    c.cam.track(() => ({ look: pod.getWorldPosition(pw) }), 6);
    c.sfx('whoosh', 1, 0.8); c.sfx('boom', 0.7, 0.8);
    void c.wait(1.7).then(() => this.mark('away'));
    void c.say('Unit Seven is away!', { who: 'Vanguard Control', style: 'radio', pitch: 1.0 });
    await c.wait(1.0);
    c.sfx('thrust', 1, 0.5);
    await c.wait(2.4);
    void c.fade(1, 0.6, '#f0d8b8');
    await c.wait(0.6);
    c.cam.track(null);
  }
  private steam(p: V, n: number) { if (this.fx) this.fx.spray(p.x, p.y, p.z, 0, 1, 0, n, 0xe8ecf0, { speed: 3.5, cone: 0.6, size: 6, life: 1.4, grav: -1.2, drag: 1.6 }); }
  private steamRail() { for (const v of railVents()) this.steam(v, 6); }
  /** air and grit pulled out through the opening doors */
  private vent(dur: number) {
    let t = 0;
    this.tasks.push((dt) => {
      t += dt; if (!this.fx) return true;
      for (let i = 0; i < 4; i++) this.fx.spray((Math.random() - 0.5) * 16, BAY.floor + 0.4 + Math.random() * 8, 20 + Math.random() * 38, 0, 0, 1, 1, Math.random() < 0.5 ? 0xd8dce0 : 0x8a8478, { speed: 14 + Math.random() * 10, cone: 0.1, size: 2 + Math.random() * 3, life: 1.2, drag: 0.2 });
      return t > dur + 1;
    });
  }

  // ================================================================ 3. the descent
  private toDescent() {
    this.disposeCarrier();
    this.mode = 'descent';
    const lz = this.lz;
    this.cine.ui.fade(1, 0); this.cine.ui.fade(0, 0.8, '#f0d8b8');
    this.cine.ui.flash('#ffb070', 0.8, 0.6);
    this.descent = new Descent({
      engine: this.engine, input: this.input, region: this.region, pal: this.pal, regionName: this.o.region.name, planetName: this.o.planet.name,
      lz: { x: lz.x, z: lz.z }, first: this.first, ui: this.cine.ui, hold: this.o.hold,
      onDone: (r) => this.finish(r),
    });
    this.descent.resize(this.engine.w, this.engine.h);
  }
  private finish(r: DescentResult) {
    if (this.mode === 'done') return;
    this.mode = 'done';
    const b = bonusFor(r.grade), run = this.o.run;
    if (run) {
      run.skills.points += b.cells;
      for (const k of Object.keys(b.res) as ('ore' | 'carbon' | 'water' | 'soil')[]) run.res[k] = (run.res[k] ?? 0) + (b.res[k] ?? 0);
      run.flags.drops = (run.flags.drops ?? 0) + 1;
      if (r.grade === 'BULLSEYE') run.flags.bullseyes = (run.flags.bullseyes ?? 0) + 1;
    }
    this.cine.ui.fade(1, 0.5, '#000');
    setTimeout(() => this.o.onDone({ landing: { x: r.x, z: r.z }, grade: r.grade, dist: r.dist, bonus: b.cells || Object.keys(b.res).length ? b.text : '' }), 520);
  }

  // ================================================================ screen
  update(dt: number) {
    this.t += dt;
    this.cine.update(dt);
    if (this.mode === 'carrier') {
      const s = this.ship!;
      s.update(dt, this.t);
      this.globe!.mat.uniforms.uT.value = this.t;
      if (this.child) { if (!this.child.look.lengthSq()) this.child.look.set(0, -10, 0); this.child.update(dt, this.cam); }
      for (let i = this.tasks.length - 1; i >= 0; i--) if (this.tasks[i](dt, this.t)) this.tasks.splice(i, 1);
      if (this.podFree) {
        const f = this.podFree; f.t += dt; f.v.y -= dt * 4; f.p.addScaledVector(f.v, dt);
        s.pod.root.position.copy(f.p);
        s.pod.setRetro(f.t > 1.0 ? 1 : 0, this.t);
        if (this.fx && Math.random() < dt * 40) this.fx.burst(f.p.x, f.p.y, f.p.z - 2, 1, 0xd8d0c8, { speed: 1, up: 0, size: 5, life: 1.4, grav: 0 });
      }
      this.fx!.update(dt, this.engine.h, this.cam.fov);
      this.cine.apply(this.cam);
    } else if (this.mode === 'descent' || this.mode === 'done') this.descent?.update(dt);
  }
  render(post: Post, t: number) {
    if (this.mode === 'carrier') {
      resetGrade(post.grade);
      post.grade.vig = 0.44; post.grade.bloom = 0.4; post.grade.sat = 1.0;
      post.render(this.scene, this.cam, this.fxScene, t);
    } else if (this.descent) this.descent.render(post, t);
    else { resetGrade(post.grade); post.render(this.scene, this.cam, undefined, t); }
  }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.descent?.resize(w, h); }
  private disposeCarrier() {
    this.ship?.dispose(); this.ship = null;
    this.bin.dispose();
    this.scene.clear(); this.fxScene.clear();
    this.globe = null; this.child = null; this.fx = null; this.podFree = null; this.tasks = [];
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cine.dispose();
    this.disposeCarrier();
    this.descent?.dispose(); this.descent = null;
    if ((window as any).__deploy === this) (window as any).__deploy = null;
  }
}

/** ?test=deploy: the deployment over a stand-in planet and run. &seed, &region (index), &later (the short
 *  version), &phase=launch|descent, &hold=<shot>, &lz=x,z, &skills=torso,armR (Unit 07's parts) */
export async function testDeploy(engine: Engine, input: Input, P: URLSearchParams) {
  (await import('./kit')).setupUI();
  const { makePlanet } = await import('../world/planet');
  const { Run } = await import('../game/run');
  const seed = Number(P.get('seed') ?? 7);
  const planet = makePlanet(seed);
  const ri = P.has('region') ? Number(P.get('region')) : Math.max(0, planet.regions.findIndex((r) => r.biome === 'meadow' || r.biome === 'coast'));
  const region = planet.regions[ri] ?? planet.regions[0];
  const run = new Run(seed);
  for (const id of (P.get('skills') ?? '').split(',')) if (id) run.skills.owned.add(id);
  const go = () => engine.setScreen(new DeployScreen(engine, input, {
    planet, region, run, landings: P.has('later') ? 2 : 0, phase: P.get('phase'), hold: P.get('hold'),
    lz: P.has('lz') ? { x: Number(P.get('lz')!.split(',')[0]), z: Number(P.get('lz')!.split(',')[1]) } : null,
    onDone: (r) => { console.log('deploy result', JSON.stringify(r), 'res', JSON.stringify(run.res), 'cells', run.skills.points); setTimeout(go, 1500); },
  }));
  go();
  engine.start();
}

/** ?test=planet: the orbital survey screen over a stand-in planet; picking a drop point runs the deployment.
 *  &seed, &region (index: dive into it at once), &later, &skills */
export async function testPlanet(engine: Engine, input: Input, P: URLSearchParams) {
  (await import('./kit')).setupUI();
  const { makePlanet } = await import('../world/planet');
  const { Run } = await import('../game/run');
  const { PlanetScreen } = await import('./planetScreen');
  const seed = Number(P.get('seed') ?? 7);
  const planet = makePlanet(seed);
  if (P.has('rival')) planet.regions[1].state = 'rival';
  const run = new Run(seed);
  for (const id of (P.get('skills') ?? '').split(',')) if (id) run.skills.owned.add(id);
  const orbit = () => {
    const ps = new PlanetScreen(planet, {
      canLand: (r) => (r.state === 'veyr' ? 'Already yours.' : r.state === 'lost' ? 'Burnt out. Nothing will take root here again.' : null),
      onBack: () => console.log('planet: back'), note: 'A NEW WORLD. CHOOSE WHERE TO FALL.',
      onLand: (r, lz, region) => engine.setScreen(new DeployScreen(engine, input, {
        planet, region: r, run, landings: P.has('later') ? 2 : 0, lz, regionData: region, hold: P.get('hold'), phase: P.get('phase'),
        onDone: (res) => { console.log('deploy result', JSON.stringify(res)); setTimeout(orbit, 1500); },
      })),
    });
    engine.setScreen(ps);
    if (P.has('region')) (ps as any).choose(planet.regions[Number(P.get('region'))]);
  };
  orbit();
  engine.start();
}

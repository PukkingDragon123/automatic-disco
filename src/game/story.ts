// Dr. Calder and the U.S.P.C. recovery team. Unit 07 was fired at this world as a rock with a mind in it; the
// impact took everything but its head. Station Four's recovery team (Calder, Lt. Hollis, Dr. Brandt) comes down
// to find it. Calder stays when the others fly home, teaches it to build a body out of ore, carbon, water and
// soil, reacts to every part it adds, and is killed one night by the valley's apex predator. His journal and the
// radio are what is left.
//
// The story runs the cutscenes (cinema.ts, scripts in ui/cineScenes.ts), the field-notes objectives for the new
// loop, Calder's spoken reactions (the radio dialog box), milestone banners and floating text, and Calder's life
// at camp between scenes. It listens to the shared game events (skills.ts): gather, skill, points, kill, throw,
// absorb, graft, convert, prefab, territory, hurt.
import * as THREE from 'three';
import type { Researcher } from '../limbo/entities/researcher';
import { worldMaterial } from '../limbo/gfx/materials';
import { objDef, objectGeometry } from '../limbo/world/objects';
import '../limbo/content/textures/materials';
import '../limbo/content/furniture/b_survival';
import '../limbo/content/furniture/zw_annex';
import '../limbo/content/furniture/b_industrial';
import '../limbo/content/furniture/b_lab';
import type { Game } from './game';
import type { Creature } from './creature';
import { Dialog, type Line } from '../ui/dialog';
import { el, ui, toast, iconImg } from '../ui/kit';
import { sfx } from '../audio/audio';
import { clamp, Rand } from '../core/rand';
import { VEYR } from '../world/palette';
import { gbuf } from '../gfx/gbuf';
import { Cinema } from './cinema';
import { Actor, calderRig, hollisRig, brandtRig, makeLander, makeSky, type Lander, type Sky } from '../ui/cineCast';
import { SCENES, CAMP_PARTS, type SceneName } from '../ui/cineScenes';
import { advance } from '../ui/cineUI';
import { csfx } from '../ui/cineAudio';
import { SKILL, RES, type Res } from './skills';
import { floatText } from '../ui/floatText';
import { skillIcon } from '../ui/icons';
import { wildDesign } from '../life/design';
import type { SpeciesModel } from '../life/creatureMesh';
import { box, mat, glowMat, OL, CR } from '../ui/cineKit';
export { calderRig, USE_ORIGINAL_LOOK } from '../ui/cineCast';

const V3 = THREE.Vector3;
type Beat = 'opening' | 'wake' | 'free' | 'after' | 'done';
interface Obj { id: string; text: () => string; done: () => boolean; hint?: string; opt?: boolean; when?: () => boolean; fin?: number; said?: boolean }

export class Story {
  readonly cine: Cinema;
  readonly dialog: Dialog;
  /** Dr. Calder (in the world between scenes, an actor in them) */
  readonly calder: Actor;
  hollis: Actor | null = null; brandt: Actor | null = null;
  lander: Lander | null = null;
  readonly landSpot = new V3();
  camp: { x: number; z: number; meshes: THREE.Object3D[]; fire: THREE.PointLight | null; table: THREE.Vector3; tableTop: number; yaw: number } = { x: 0, z: 0, meshes: [], fire: null, table: new V3(), tableTop: 0.8, yaw: 0 };
  /** scene props to clean up with the story (blood pools, the journal, ...) */
  readonly props: THREE.Object3D[] = [];
  beat: Beat = 'opening';
  /** run the beats by themselves (test pages switch this off and call playScene) */
  auto = true;
  objectives: Obj[] = [];
  friendship = 0;
  private portraitRig: Researcher;
  private t = 0; private beatT = 0; private sinceContact = -1;
  private seen = new Set<string>();
  private r = new Rand(7);
  private queue: { name: SceneName; arg?: string }[] = [];
  private st = { kinds: new Set<Res>(), kills: 0, punch: 0, throws: 0, absorbs: 0, grafts: 0, converts: 0, labs: 0, plants: 0, territory: 0, lastHurt: -99 };
  private reveals: { x: number; z: number; r: number }[] = [];
  private fireOn = true;
  private path: number[] | null = null; private pi = 0;
  private mode: 'home' | 'visit' | 'note' = 'home'; private modeT = 30; private ambientT = 45;
  private beastC: Creature | null = null; private beastName = '';
  private deathAt: THREE.Vector3 | null = null;
  private bodyTaken = false;
  private objBox: HTMLElement | null = null;
  private G: any;
  private sky: Sky = makeSky();

  constructor(readonly g: Game) {
    this.G = g as any;
    this.portraitRig = calderRig();
    const self = this;
    const dlgParent: HTMLElement = this.G.hud?.dialog ?? ui();
    this.dialog = new Dialog(dlgParent, g.engine.renderer, {
      root: this.portraitRig.root,
      update(dt) { self.portraitRig.update(dt, { speed: 0, stance: 'stand', fidget: true } as any); },
      say(sec, expr) { self.portraitRig.say(sec, expr); if (sec > 2) self.portraitRig.gesture('talk', { dur: Math.min(3, sec) }); },
      head(out) { const h = (self.portraitRig as any).bones?.head ?? (self.portraitRig as any).j?.head; if (h) return h.getWorldPosition(out); return out.set(0, 1.65, 0); },
    });
    this.dialog.onLine = (l) => { if (!this.calder.dead && (!l.who || l.who === 'calder')) this.calder.talk(3, l.expr); };
    this.cine = new Cinema({
      enter: () => { this.dialog.clear(); this.G.setMode?.({ k: 'normal' }); this.g.world.scene.add(this.sky.mesh); },
      exit: () => { this.G.hud?.invalidate?.(); this.sky.mesh.removeFromParent(); },
    });
    this.cine.ui.root.remove(); ui().appendChild(this.cine.ui.root);
    // camera hook: the cinema drives the game camera while a scene plays
    this.G.cineCam = (cam: THREE.PerspectiveCamera) => { if (this.cine.active) this.cine.apply(cam); };
    this.placeCamp();
    this.pickLandSpot();
    this.calder = new Actor(calderRig(), this.ground, g.world.scene);
    this.calder.place(this.camp.x + 1.2, this.camp.z + 1.6);
    this.calder.visible = false;
    this.buildObjectives();
    // ---- the shared game events
    g.on('gather', (d: any) => this.onGather(d.res));
    g.on('skill', (d: any) => this.onSkill(d.id));
    g.on('points', (d: any) => this.onPoints(d.n, d.why));
    g.on('kill', (d: any) => this.onKill(d.species, d.by));
    g.on('throw', () => { this.st.throws++; this.first('throw', ['Nice arm! I pitched for the Corps team once. You\'d have struck me out.', 'Ha! Like a ballgame.']); });
    g.on('absorb', (d: any) => this.onAbsorb(d.species, d.genes ?? []));
    g.on('graft', () => this.onGraft());
    g.on('convert', (d: any) => this.onConvert(d.species));
    g.on('prefab', (d: any) => this.onPrefab(d.kind, d.name));
    g.on('territory', (d: any) => this.onTerritory(d.frac));
    g.on('hurt', (d: any) => this.onHurt(d.amt));
    (window as any).__story = this;
  }

  // ================================================================== helpers for the scenes
  readonly ground = (x: number, z: number) => { const R = this.g.region; return this.g.world.surfaceY(clamp(x, 0, R.N - 0.01), clamp(z, 0, R.N - 0.01)); };
  /** where the golem is (its body, near the ground) */
  golem(): THREE.Vector3 {
    const G = this.G;
    const pl = G.player ?? G.golem;
    if (pl && typeof pl.x === 'number' && typeof pl.z === 'number') return new V3(pl.x, this.ground(pl.x, pl.z), pl.z);
    const p = pl?.pos;
    if (p && typeof p.x === 'number') return new V3(p.x, this.ground(p.x, p.z), p.z);
    const ch = G.child?.root;
    if (ch && ch.visible !== false) { const q = ch.getWorldPosition(new V3()); q.y = this.ground(q.x, q.z); return q; }
    const c = G.veyr?.core; if (c) return new V3(c.x, this.ground(c.x, c.z), c.z);
    const L = this.g.region.landing; return new V3(L.x, this.ground(L.x, L.z), L.z);
  }
  /** the golem's head (the lens) */
  golemHead(): THREE.Vector3 {
    const G = this.G;
    try { const h = G.player?.headPos?.() ?? G.golem?.headPos?.() ?? G.child?.headPos?.(); if (h && h.y > -1e5) return h.clone(); } catch { /* fall through */ }
    return this.golem().add(new V3(0, 1.5, 0));
  }
  golemWave() { try { const o = [this.G.player, this.G.golem, this.G.child].find((x) => typeof x?.wave === 'function'); o?.wave(); } catch { /* optional */ } }
  /** reveal fog of war around a point while a scene needs it; returns the undo */
  reveal(x: number, z: number, r: number) { const e = { x, z, r }; this.reveals.push(e); return () => { const i = this.reveals.indexOf(e); if (i >= 0) this.reveals.splice(i, 1); }; }
  /** keep a reveal for a while longer after a scene (then undo it) */
  revealKeep(x: number, z: number, r: number, undo: () => void, sec = 25) { undo(); const u = this.reveal(x, z, r); setTimeout(u, sec * 1000); }
  /** set the time of day for a scene; returns the restore */
  timeOfDay(d: number) { const w = this.g.world as any, was = w.day; if (typeof was !== 'number') return () => {}; w.day = d; return () => { w.day = d > 0.7 || d < 0.2 ? Math.max(0.2, (was + 0.02) % 1) : was; }; }
  makeLander(): Lander { if (!this.lander) { this.lander = makeLander(); this.g.world.scene.add(this.lander.root); } return this.lander; }
  dropLander() { this.lander?.root.removeFromParent(); this.lander = null; }
  makeCrew() {
    if (!this.hollis) this.hollis = new Actor(hollisRig(), this.ground, this.g.world.scene);
    if (!this.brandt) this.brandt = new Actor(brandtRig(), this.ground, this.g.world.scene);
    return { hollis: this.hollis, brandt: this.brandt };
  }
  dropCrew() { this.hollis?.dispose(); this.brandt?.dispose(); this.hollis = this.brandt = null; }
  campSeat() { return new V3(this.camp.x + 1.2, 0, this.camp.z + 1.6); }
  campFire(on: boolean) { this.fireOn = on; }
  /** the journal or the radio on the field table (world position of its top) */
  campProp(k: 'book' | 'radio'): THREE.Vector3 {
    const key = 'prop:' + k;
    let m = this.props.find((p) => p.name === key);
    if (!m) {
      const t = this.camp.table, yaw = this.camp.yaw, off = k === 'book' ? -0.22 : 0.3;
      const p = new V3(t.x + Math.cos(yaw) * off, this.camp.tableTop, t.z - Math.sin(yaw) * off);
      if (k === 'book') {
        const g = new THREE.Group();
        box(0.2, 0.02, 0.26, mat({ color: 0x5e3424 }), 0, 0.01, 0, g);
        box(0.19, 0.012, 0.25, mat({ color: 0xe8dcb8 }), 0, 0.025, 0, g);
        box(0.004, 0.014, 0.25, mat({ color: 0x8a7a5a }), 0, 0.032, 0, g);
        box(0.12, 0.008, 0.008, mat({ color: 0xd8a422 }), 0.04, 0.036, 0.06, g).rotation.y = 0.5;
        m = g;
      } else {
        const g = new THREE.Group();
        box(0.34, 0.2, 0.2, mat({ color: OL[5] }), 0, 0.1, 0, g);
        box(0.14, 0.1, 0.01, glowMat(0x6ae088), -0.06, 0.12, 0.1, g);
        box(0.05, 0.05, 0.03, mat({ color: CR[2] }), 0.1, 0.12, 0.1, g);
        const ant = box(0.01, 0.5, 0.01, mat({ color: 0x9aa2a8 }), 0.13, 0.43, -0.05, g); ant.rotation.z = -0.2;
        m = g;
      }
      m.name = key; m.position.copy(p); m.rotation.y = yaw + 0.3;
      this.g.world.scene.add(m); this.props.push(m);
    }
    return m.position.clone();
  }
  /** the model and size the beast scene's puppet uses (the region's apex predator, or a new one) */
  beastModel(): { model: SpeciesModel; scale: number } {
    const b = this.findBeast();
    if (b) {
      this.beastName = b.sp.name;
      // the real one waits out of sight while its puppet acts (releaseBeast brings it back)
      const far = this.campAway(48); b.x = far.x; b.z = far.z; b.y = this.ground(far.x, far.z); b.stunT = 999; b.order = null; b.path = null;
      return { model: b.sp.model, scale: b.growth };
    }
    const d = wildDesign('apex', this.g.region.pal, this.g.region.seed ^ 0xbea57);
    const sp = this.g.run.reg.add(d, 'wild', null, 'apex', 0);
    this.beastName = sp.name;
    const away = this.campAway(24);
    this.beastC = this.g.world.spawn(sp, 'wild', away.x, away.z);
    if (this.beastC) { this.beastC.boss = true; this.beastC.stunT = 999; }
    return { model: sp.model, scale: 1 };
  }
  /** the real beast goes back into the world where the puppet left it */
  releaseBeast(p: THREE.Vector3) {
    const b = this.beastC; if (!b || b.dead) return;
    const R = this.g.region;
    b.x = clamp(p.x, 3, R.N - 3); b.z = clamp(p.z, 3, R.N - 3); b.y = this.ground(b.x, b.z);
    b.stunT = 0; b.order = null; b.mind = 'wander' as any; b.path = null;
    b.goalX = clamp(b.x + (b.x - this.camp.x) * 0.5, 3, R.N - 3); b.goalZ = clamp(b.z + (b.z - this.camp.z) * 0.5, 3, R.N - 3);
  }
  gore(x: number, z: number) {
    const gr = this.G.gore ?? this.G.player?.gore;
    try { gr?.splat?.(x, z, 1.1, 0x7a120c, { cell: 5 }); gr?.splat?.(x + 0.6, z + 0.3, 0.6, 0x5e0e08, { cell: 4 }); } catch { /* the gore system is optional */ }
  }
  calderDied(at: THREE.Vector3) {
    this.deathAt = at.clone();
    this.fireOn = false;
    this.g.run.flags.calderDead = 1;
  }

  // ================================================================== camp
  private placeCamp() {
    const g = this.g, R = g.region, L = R.landing, r = new Rand(R.seed ^ 0xca1);
    let best: [number, number] = [L.x + 24, L.z], bs = -1e9;
    for (let t = 0; t < 300; t++) {
      const a = r.range(0, Math.PI * 2), d = r.range(23, 30);
      const x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d;
      if (x < 8 || z < 8 || x > R.N - 8 || z > R.N - 8) continue;
      let lo = 1e9, hi = -1e9, wet = 0;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const h = R.heightAt(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); if (h < R.water + 0.4) wet++; }
      const s = -(hi - lo) * 4 - wet * 3;
      if (s > bs) { bs = s; best = [x, z]; }
    }
    const [cx, cz] = best;
    const h0 = Math.round(R.heightAt(cx, cz) * 2) / 2;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const X = Math.floor(cx) + dx, Z = Math.floor(cz) + dz; if (!R.inside(X, Z)) continue;
      const i = Z * R.N + X; if (Math.abs(R.h[i] - h0) <= 1) { R.h[i] = h0; R.dirty.add(i); }
    }
    try { (g.world as any).terrain?.flushDirty?.(); } catch { /* terrain refresh is best effort */ }
    this.camp.x = cx + 0.5; this.camp.z = cz + 0.5;
    const toCore = Math.atan2(L.x - this.camp.x, L.z - this.camp.z);
    this.camp.yaw = toCore;
    const place = (key: string, ox: number, oz: number, rot: number) => {
      const d = objDef(key); if (!d) return null;
      const geo = objectGeometry(d, { uid: 0, key, x: 0, y: 0, rot: 0, state: {} } as any); if (!geo) return null;
      const m = new THREE.Mesh(geo, worldMaterial({ noVis: true, noFog: true, noGrid: true }));
      const c = Math.cos(toCore), s = Math.sin(toCore);
      const x = this.camp.x + ox * c + oz * s, z = this.camp.z - ox * s + oz * c;
      m.position.set(x, this.ground(x, z), z);
      m.rotation.y = toCore + rot;
      m.castShadow = true; m.receiveShadow = true;
      g.world.scene.add(m); this.camp.meshes.push(m);
      return m;
    };
    place('campfire_unlit', 0, 0, 0);
    place('tent', -2.6, -1.8, 0.4);
    const table = place('zw_field_table', 2.4, -1.2, -0.3);
    if (table) { (table as THREE.Mesh).geometry.computeBoundingBox(); const bb = (table as THREE.Mesh).geometry.boundingBox!; this.camp.table.copy(table.position); this.camp.tableTop = table.position.y + bb.max.y; }
    else { this.camp.table.set(this.camp.x + 2, this.ground(this.camp.x + 2, this.camp.z), this.camp.z); this.camp.tableTop = this.camp.table.y + 0.75; }
    place('zw_hard_case', 1.6, 1.2, 0.8);
    place('zw_hard_case', 2.6, 0.6, -0.4);
    place('zw_floodlight', -1.4, 2.0, Math.PI);
    place('zw_camcorder', 0.6, 2.6, 0);
    place('zw_cot', -3.4, 1.0, 1.2);
    place('crate_built', 3.4, -0.2, 0.2);
    place('bedroll', -1.8, -3.6, 0.1);
    place('antenna_mast', -3.2, -3.9, 0.6);
    const fire = new THREE.PointLight(0xffa050, 3, 9, 1.6);
    fire.position.set(this.camp.x, this.ground(this.camp.x, this.camp.z) + 0.6, this.camp.z);
    g.world.scene.add(fire); this.camp.fire = fire;
  }
  /** a point away from camp, on the side away from the golem's crater */
  private campAway(d: number) {
    const L = this.g.region.landing, R = this.g.region;
    const a = Math.atan2(this.camp.z - L.z, this.camp.x - L.x) + 0.4;
    return { x: clamp(this.camp.x + Math.cos(a) * d, 4, R.N - 4), z: clamp(this.camp.z + Math.sin(a) * d, 4, R.N - 4) };
  }
  /** a flat dry patch 12-15 m from the crater for the lander, toward the camp */
  private pickLandSpot() {
    const R = this.g.region, L = R.landing, r = new Rand(R.seed ^ 0x1a2d);
    const toward = Math.atan2(this.camp.z - L.z, this.camp.x - L.x);
    let best = new V3(L.x + Math.cos(toward) * 13, 0, L.z + Math.sin(toward) * 13), bs = -1e9;
    for (let t = 0; t < 80; t++) {
      const a = toward + r.range(-1.1, 1.1), d = r.range(11.5, 15);
      const x = L.x + Math.cos(a) * d, z = L.z + Math.sin(a) * d;
      if (x < 6 || z < 6 || x > R.N - 6 || z > R.N - 6) continue;
      let lo = 1e9, hi = -1e9, wet = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const h = R.heightAt(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); if (h < R.water + 0.3) wet++; }
      const s = -(hi - lo) * 5 - wet * 4 - Math.abs(a - toward);
      if (s > bs) { bs = s; best = new V3(x, 0, z); }
    }
    best.y = this.ground(best.x, best.z);
    this.landSpot.copy(best);
  }

  // ================================================================== objectives
  private buildObjectives() {
    const sk = (id: string) => this.g.run.skills.has(id);
    const res = () => { const n = new Set<Res>(this.st.kinds); for (const k of RES) if ((this.g.run.res[k] ?? 0) > 0) n.add(k); return n; };
    this.objectives = [
      { id: 'gather', text: () => `Gather ore, carbon, water and soil (${res().size}/4)`, done: () => res().size >= 4,
        hint: 'Your intake works. Pull in whatever lies loose: ore from the dark rock, carbon from dead wood, water from the stream, soil from the ground.' },
      { id: 'torso', text: () => 'Open the skill tree [K] and build the Core Housing', done: () => sk('torso'),
        hint: 'That\'s enough to start. Open your blueprints with [K]. Build a chest first: everything else bolts to it.' },
      { id: 'armR', text: () => 'Build a right arm', done: () => sk('armR'), hint: 'Now an arm. A head and a chest can\'t hold a wrench.' },
      { id: 'punch', text: () => 'Punch a creature down', done: () => this.st.punch > 0 || (this.st.kills > 0 && sk('punch')), hint: 'Those crawlers keep sniffing at you. Show them what that arm is for.' },
      { id: 'throw', text: () => 'Pick up a rock and throw it', done: () => this.st.throws > 0, hint: 'Pick up a stone and throw it. Like a ballgame.' },
      { id: 'absorb', text: () => 'Absorb a creature\'s whole genome', done: () => this.st.absorbs > 0, hint: 'When one goes down, take it in. All of it. I want to see what you learn from it.' },
      { id: 'lab', text: () => 'Build the Field Laboratory and rebuild a species in the tank', done: () => sk('lab') && this.st.labs > 0, hint: 'Build a field lab. Put what you\'ve absorbed in the tank and see if you can rebuild it, limb by limb.' },
      { id: 'graft', text: () => `Graft plants to claim ground (${Math.min(3, this.st.grafts)}/3)`, done: () => this.st.grafts >= 3, hint: 'These plants... you could graft them. Make them yours. Every one you change claims the ground around it.' },
      { id: 'convert', text: () => 'Beat a creature and convert it with a Neural Graft', done: () => this.st.converts > 0, hint: 'A beaten animal could be rewired. A Neural Graft. It would fight for you instead of against you.' },
      { id: 'claim', text: () => `Claim the region for Earth (${Math.round(this.st.territory * 100)}% held)`, done: () => this.st.territory >= 0.6, hint: 'Hold this valley, Seven. All of it. For home.' },
      { id: 'return', text: () => 'Go back to Calder\'s camp', done: () => this.seen.has('scene:final'), when: () => this.beat === 'after' || this.beat === 'done' },
      { id: 'avenge', text: () => 'Hunt down the beast that killed him', done: () => this.seen.has('avenged'), opt: true, when: () => this.beat === 'after' || this.beat === 'done' },
    ];
  }
  /** mark an objective done from outside (kept for old callers) */
  complete(id: string) { this.seen.add('obj:' + id); }
  private objDone(o: Obj) { return this.seen.has('obj:' + o.id) || o.done(); }
  private tickObjectives() {
    if (this.beat === 'opening' || this.beat === 'wake') return;
    let changed = false, cur: Obj | null = null;
    for (const o of this.objectives) {
      if (o.when && !o.when()) continue;
      if (o.fin === undefined && this.objDone(o)) {
        o.fin = this.t; changed = true;
        sfx('done'); csfx('chime', 0.4, 1.2);
        const p = this.golem(); floatText(this.g, p.x, p.y + 2.6, p.z, 'OBJECTIVE COMPLETE', 'good', { life: 2.2 });
      }
      if (o.fin === undefined && !cur && !o.opt) cur = o;
    }
    if (cur && !cur.said && cur.hint && !this.calder.dead && !this.cine.active && this.sinceContact > 3) {
      cur.said = true;
      this.say([{ text: cur.hint }]);
    }
    if (changed || Math.floor(this.t * 2) !== Math.floor((this.t - 0.016) * 2)) this.renderObjectives();
  }
  private renderObjectives() {
    let box = this.G.hud?.objectives as HTMLElement | undefined;
    if (!box) { if (!this.objBox) { this.objBox = el('div', 'px-dark hud-obj', ui()); this.objBox.style.cssText += ';position:fixed;right:calc(8px * var(--s));top:calc(60px * var(--s));max-width:calc(150px * var(--s));font-size:calc(8px * var(--s))'; } box = this.objBox; }
    const show: Obj[] = [];
    for (const o of this.objectives) {
      if (o.when && !o.when()) continue;
      if (o.fin !== undefined && this.t - o.fin > 5) continue;
      show.push(o);
    }
    const list = [...show.filter((o) => o.fin !== undefined), ...show.filter((o) => o.fin === undefined && !o.opt).slice(0, 3), ...show.filter((o) => o.fin === undefined && o.opt)];
    const key = list.map((o) => o.id + (o.fin !== undefined ? '+' : '') + o.text()).join('|');
    if ((box as any).__k === key) return;
    (box as any).__k = key;
    box.style.display = list.length ? '' : 'none';
    box.innerHTML = '';
    el('h4', '', box, 'FIELD NOTES · DR. CALDER');
    for (const o of list) {
      const r = el('div', 'ob' + (o.fin !== undefined ? ' done' : ''), box);
      iconImg(o.fin !== undefined ? 'helix' : o.opt ? 'skull' : 'move', 'oi', r).style.cssText = 'width:14px;height:14px;flex:none';
      el('span', '', r, o.text());
    }
  }

  // ================================================================== talking
  say(lines: (string | Line)[]) { this.dialog.say(lines.map((l) => (typeof l === 'string' ? { text: l } : l))); }
  /** Calder says one line from the pool the first time something happens (the journal says it once he is gone) */
  private first(key: string, pool: string[], journal?: string) {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.beat === 'opening' || this.beat === 'wake') return true;
    if (!this.calder.dead) { this.friendship++; this.say([{ text: this.r.pick(pool) }]); }
    else if (journal) this.say([{ text: journal, who: 'journal' }]);
    return true;
  }
  private atGolem(text: string, kind: Parameters<typeof floatText>[5] = 'skill', big = 1) {
    const p = this.golemHead(); floatText(this.g, p.x, p.y + 1.1, p.z, text, kind, { big, life: 2.6 });
  }

  // ================================================================== events
  private onGather(res: Res) {
    if (!res) return;
    const had = this.st.kinds.has(res); this.st.kinds.add(res);
    if (had) return;
    this.first('gather:' + res, [GATHER[res]]);
    if (this.st.kinds.size === 4) { advance('ALL FOUR MATERIALS', 'ORE · CARBON · WATER · SOIL', 'skills', { kicker: 'FIELD SURVEY' }); }
  }
  private onSkill(id: string) {
    const s = SKILL[id]; if (!s) return;
    const name = s.name.toUpperCase();
    advance(name, PART_SUB[s.branch] ?? 'ONLINE', skillIcon(id), { kicker: 'ADVANCEMENT', stamp: s.branch === 'chassis' ? 'ASSEMBLED' : 'ONLINE' });
    csfx('sting', 0.5, 1.2);
    // body parts get a little scene at camp while he is alive; everything else, a line
    const part = CAMP_PARTS.includes(id);
    if (part && !this.calder.dead && (this.beat === 'free') && !this.seen.has('camp:' + id)) { this.seen.add('camp:' + id); this.queue.push({ name: 'camp', arg: id }); return; }
    const lines = SKILL_LINES[id];
    if (lines) this.first('skill:' + id, lines, JOURNAL_SKILL);
  }
  private onPoints(n: number, why: string) {
    if (!n) return;
    if (why && n >= 2) advance(`+${n} CORE CELLS`, why.toUpperCase(), 'cell', { kicker: 'COMMENDATION', stamp: 'STATION 4' });
  }
  private onKill(species: string, by: string) {
    this.st.kills++; if (by === 'punch') this.st.punch++;
    this.first('kill', ['Remind me never to argue with you.', 'Well. That\'s one way to settle it.'], 'It fights now. He would have flinched, then written it down.');
    if (by === 'punch' && this.first('kill:punch', ['Ha! Right on the button!'])) this.atGolem('FIRST KNOCKOUT', 'crit', 2);
    if (this.beat === 'after' && species && species === this.beastName && !this.seen.has('avenged')) {
      this.seen.add('avenged');
      advance('THE BEAST IS DEAD', 'FOR DR. CALDER', 'skull', { kicker: 'SETTLED', stamp: 'U.S.P.C.' });
      this.atGolem('FOR CALDER', 'crit', 3);
      this.say([{ text: 'The thing that took him is dead. I hope that\'s the right word for it. For the record, it was quick.', who: 'journal' }]);
    }
  }
  private onAbsorb(species: string, genes: string[]) {
    this.st.absorbs++;
    if (this.first('absorb', [`It took the ${species || 'creature'} apart. Not eating. Reading. ${genes.length} genes, all of them, filed away.`, 'You read it like a book. Every bone of it.'])) {
      advance('GENOME ABSORBED', (species || 'SPECIMEN').toUpperCase(), 'absorb', { kicker: 'FIRST SPECIMEN' });
      this.atGolem('GENOME ABSORBED', 'good', 2);
    }
  }
  private onGraft() {
    this.st.grafts++;
    if (this.first('graft', ['You changed it. The leaves are turning your colour. Everything around it looks... claimed.', 'A garden. You\'re planting a garden for Earth.'])) {
      advance('FIRST GRAFT', 'THE GROUND AROUND IT IS YOURS', 'graft', { kicker: 'TERRITORY' });
      this.atGolem('GROUND CLAIMED', 'good', 2);
    }
  }
  private onConvert(species: string) {
    this.st.converts++;
    if (this.first('convert', [`That ${species || 'animal'} is following you now. Like a dog. A dog that could eat a dog.`, 'You rewired it. It looks at you the way I do.'])) {
      advance('FIRST CONVERT', (species || 'CREATURE').toUpperCase() + ' FIGHTS FOR YOU', 'ally', { kicker: 'NEURAL GRAFT' });
      this.atGolem('CONVERTED', 'good', 2);
    }
  }
  private onPrefab(kind: string, name: string) {
    if (kind === 'creature') {
      this.st.labs++;
      if (this.first('prefab:creature', [`You rebuilt it in the tank. A ${name || 'whole animal'}. From memory.`, 'Limb by limb. I\'ve seen surgeons with less nerve.'])) advance('SPECIES ON FILE', (name || 'PREFAB').toUpperCase(), 'lab', { kicker: 'FIELD LABORATORY' });
    } else {
      this.st.plants++;
      this.first('prefab:plant', ['You pressed it like a flower in a book. Now you can grow it anywhere.'], 'He kept pressed flowers in this journal. I found three.');
    }
  }
  private onTerritory(frac: number) {
    if (typeof frac !== 'number') return;
    this.st.territory = frac;
    for (const [k, line] of TERRITORY) {
      if (frac >= k && !this.seen.has('terr:' + k)) {
        this.seen.add('terr:' + k);
        if (this.beat === 'opening' || this.beat === 'wake') continue;
        advance(`${Math.round(k * 100)}% OF THE REGION`, 'HELD FOR EARTH', 'territory', { kicker: 'TERRITORY', stamp: 'CLAIMED' });
        this.atGolem(`${Math.round(k * 100)}% CLAIMED`, 'good', 2);
        if (!this.calder.dead) this.say([{ text: line }]);
      }
    }
  }
  private onHurt(amt: number) {
    if (this.calder.dead || !(amt > 8) || this.t - this.st.lastHurt < 70 || this.cine.active) return;
    const p = this.golem(); if (Math.hypot(p.x - this.calder.x, p.z - this.calder.z) > 40) return;
    this.st.lastHurt = this.t;
    this.say([{ text: this.r.pick(['Seven! Careful!', 'Get back from it, Seven!', 'Watch your plating!']), expr: 'surprised' }]);
  }

  // ================================================================== scenes
  /** play a scene now (the ?test=cine page and the story's own triggers call this) */
  async playScene(name: SceneName, arg?: string) {
    const f = SCENES[name]; if (!f) return;
    if (name === 'beast' && this.calder.dead) return;
    this.seen.add('scene:' + name);
    const was = this.beat;
    if (name !== 'camp') this.calder.visible = true;
    this.path = null;
    await this.cine.play((c) => f(c, this, name === 'camp' ? arg ?? 'armR' : arg), { name });
    if (name === 'opening') { this.beat = 'wake'; this.beatT = 0; }
    if (name === 'contact') { this.beat = 'free'; this.beatT = 0; this.sinceContact = 0; this.goHome(); }
    if (name === 'camp') { this.mode = 'visit'; this.modeT = 12; }
    if (name === 'beast') { this.beat = 'after'; this.beatT = 0; }
    if (name === 'final') { this.beat = 'done'; this.afterFinal(); }
    void was;
  }
  private afterFinal() {
    const g = this.g;
    g.run.flags.calderNotes = 1;
    advance('CALDER\'S NOTES', 'ONE MORE GENE FROM EVERY GENOME', 'journal', { kicker: 'RECOVERED', stamp: 'U.S.P.C.' });
    if (typeof this.G.veyr?.absorbCap === 'number') this.G.veyr.absorbCap += 1;
    const at = this.deathAt;
    if (!this.bodyTaken && at && this.G.chooseCalder) {
      this.bodyTaken = true;
      setTimeout(() => this.G.chooseCalder((absorb: boolean) => {
        if (absorb) { for (const id of ['hominid_frame', 'hands', 'hominid_eyes', 'omni_teeth']) g.run.add(id, 'Dr. Calder', g.world.time); toast('You take what he was. Upright. Curious. Yours.', 'story', 6000); }
        else { g.run.flags.memorial = 1; toast('A pale flower grows where he lies. It never closes.', 'story', 6000); }
        this.calder.rig.root.visible = !absorb;
        if (absorb) g.fx.burst(at.x, at.y + 0.5, at.z, 40, VEYR.vein, { glow: true, up: 3, speed: 2, size: 3, life: 1.2 });
        else this.memorial(at.x, at.z);
      }), 600);
    }
  }
  private memorial(x: number, z: number) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), gbuf(new THREE.MeshLambertMaterial({ color: 0xf4f0e8, emissive: 0x4a6a60 }), 1 + 32));
    m.position.set(x, this.ground(x, z) + 0.45, z);
    this.g.world.scene.add(m); this.props.push(m);
  }
  private findBeast(): Creature | null {
    if (this.beastC && !this.beastC.dead) return this.beastC;
    const cs = this.g.world.creatures.filter((x) => !x.dead && x.faction === 'wild');
    this.beastC = cs.find((x) => x.boss) ?? cs.filter((x) => x.diet === 'carn').sort((a, b) => b.mass - a.mass)[0] ?? null;
    return this.beastC;
  }

  // ================================================================== the frame
  update(dt: number, real: number) {
    const g = this.g;
    this.t += real; this.beatT += real;
    if (this.sinceContact >= 0) this.sinceContact += dt;
    this.cine.update(real);
    if (this.cine.active) {
      const cam = this.G.cam?.cam ?? this.G.camera; if (cam) this.cine.apply(cam);
      // the sky the RTS camera never shows: palette colours, darkened by night
      const pal: any = this.g.region.pal, day = (this.g.world as any).day ?? 0.3;
      const elev = Math.cos((day - 0.25) * Math.PI * 2), k = clamp(elev * 1.4 + 0.25, 0.16, 1);
      if (cam) this.sky.mesh.position.copy(cam.position);
      this.sky.set(pal.sky ?? 0x8ab0d0, pal.horizon ?? 0xc8d8e0, clamp((0.62 - k) * 1.8, 0, 1), (this.g.world as any).sun?.dir ?? new V3(0, 1, 0));
      // the golem stands idle through a scene: nothing hurts it meanwhile
      const pl = this.G.player; if (pl && typeof pl.invuln === 'number') pl.invuln = Math.max(pl.invuln, 0.6);
    }
    this.dialog.update(real);
    // camp fire: lit at night while he lives, cold after
    const w: any = g.world;
    const night = typeof w.day === 'number' && (w.day > 0.72 || w.day < 0.24);
    if (this.camp.fire) {
      const on = this.fireOn && !this.calder.dead;
      this.camp.fire.intensity = on ? (night ? 4 : 1.4) * (0.85 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 7) * 0.07) : 0;
      if (on && Math.random() < real * 30) {
        const fy = this.camp.fire.position.y - 0.45, hot = Math.random() < 0.6;
        g.fx.glow.emit(this.camp.x + (Math.random() - 0.5) * 0.3, fy, this.camp.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3,
          new THREE.Color(hot ? 0xffa030 : 0xff5a20).multiplyScalar(2.4), 1, hot ? 3 : 2, 0.5 + Math.random() * 0.4, -0.4, 1.2);
      }
    }
    // the cast
    this.calder.update(real); this.hollis?.update(real); this.brandt?.update(real);
    // fog of war: he is seen; scenes reveal what they film
    const vis = this.G.vision;
    if (vis && Array.isArray(vis.extra)) {
      const ex: [number, number, number][] = this.calder.dead || !this.calder.visible ? [] : [[this.calder.x, this.calder.z, 5]];
      for (const r of this.reveals) ex.push([r.x, r.z, r.r]);
      vis.extra = ex;
      const seen = vis.seen?.[Math.floor(this.camp.z) * g.region.N + Math.floor(this.camp.x)] > 0;
      for (const m of this.camp.meshes) m.visible = seen || this.cine.active || this.beat !== 'free';
    }
    if (this.cine.active) return;
    // ---- beats
    if (this.auto) switch (this.beat) {
      case 'opening': if (this.beatT > 0.25) { this.beatT = -999; void this.playScene('opening'); } break;
      case 'wake': if (this.beatT > 4.5 && this.beatT < 900) { this.beatT = -999; void this.playScene('contact'); } break;
      case 'free': this.freeBeat(dt); break;
      case 'after': {
        const p = this.golem();
        if (Math.hypot(p.x - this.camp.x, p.z - this.camp.z) < 8 && !this.dialog.busy) void this.playScene('final');
        break;
      }
    }
    // queued scenes (the camp vignettes) play once the dialog is quiet
    if (this.queue.length && !this.dialog.busy && this.beat === 'free') { const q = this.queue.shift()!; void this.playScene(q.name, q.arg); return; }
    this.calderLife(dt);
    this.tickObjectives();
  }
  /** the beast comes when the golem has grown enough, at night */
  private freeBeat(dt: number) {
    const g = this.g, w: any = g.world;
    const ready = this.st.converts > 0 || this.g.run.skills.has('convert') || (this.sinceContact > 900 && this.g.run.skills.has('armR')) || this.sinceContact > 1800;
    if (!ready || this.calder.dead) return;
    const night = typeof w.day === 'number' && (w.day > 0.78 || w.day < 0.18);
    if (night) { if (!this.queue.length && !this.dialog.busy) void this.playScene('beast'); }
    else if (typeof w.day === 'number') w.day = Math.min(0.995, w.day + dt * 0.004);
    if (!this.seen.has('omen')) { this.seen.add('omen'); this.say([{ text: 'Something big circles the camp after dark. I hear it breathing out past the reeds. Stay close tonight, Seven.', expr: 'think' }]); }
  }
  // ---------------- Calder's day between scenes
  private goHome() { const s = this.campSeat(); this.walk(s.x, s.z); this.mode = 'home'; this.modeT = 40 + this.r.range(0, 30); }
  private walk(tx: number, tz: number) {
    const c = this.calder, w: any = this.g.world;
    let p: number[] | null = null;
    try { p = w.pather?.find?.(c.x, c.z, tx, tz, { step: 0.95, swim: false, fly: false }, 8000) ?? null; } catch { p = null; }
    this.path = p ?? [tx, tz]; this.pi = 0; c.full = '';
  }
  private calderLife(dt: number) {
    const c = this.calder;
    if (c.dead || this.beat === 'opening' || this.beat === 'wake') return;
    c.visible = true;
    // follow the path, waypoint by waypoint
    if (this.path && !c.moving) {
      if (this.pi >= this.path.length) { this.path = null; }
      else { c.walkTo(this.path[this.pi], this.path[this.pi + 1], 1.35); this.pi += 2; }
    }
    const w: any = this.g.world;
    const night = typeof w.day === 'number' && (w.day > 0.75 || w.day < 0.2);
    const golem = this.golem();
    this.modeT -= dt;
    if (!this.path && !c.moving) {
      if (this.mode === 'home') {
        const s = this.campSeat();
        if (Math.hypot(c.x - s.x, c.z - s.z) < 0.6) { c.full = night ? 'sit' : ''; c.look = night ? null : golem.clone().setY(golem.y + 1.2); if (!night) c.face(golem.x, golem.z); }
        if (this.modeT <= 0) {
          const far = Math.hypot(golem.x - this.camp.x, golem.z - this.camp.z);
          if (!night && far < 45) { this.mode = 'visit'; this.modeT = 22 + this.r.range(0, 14); const a = Math.atan2(this.camp.z - golem.z, this.camp.x - golem.x); this.walk(golem.x + Math.cos(a) * 6.5, golem.z + Math.sin(a) * 6.5); }
          else { this.mode = 'note'; this.modeT = 14; const t = this.camp.table; this.walk(t.x + 0.6, t.z + 0.6); }
        }
      } else if (this.mode === 'visit') {
        c.look = golem.clone().setY(golem.y + 1.3); c.face(golem.x, golem.z);
        if (Math.hypot(golem.x - c.x, golem.z - c.z) > 16 && this.modeT > 4) { const a = Math.atan2(c.z - golem.z, c.x - golem.x); this.walk(golem.x + Math.cos(a) * 6.5, golem.z + Math.sin(a) * 6.5); }
        if (this.modeT <= 0) this.goHome();
      } else if (this.mode === 'note') {
        c.action = this.modeT > 2 ? 'read' : '';
        if (this.modeT <= 0) { c.action = ''; this.goHome(); }
      }
    }
    // a musing now and then
    this.ambientT -= dt;
    if (this.ambientT <= 0 && !this.dialog.busy) {
      this.ambientT = 70 + this.r.range(0, 50);
      if (night) this.say([{ text: this.r.pick(JOURNAL), who: 'journal' }]);
      else this.say([{ text: this.r.pick(MUSINGS) }]);
      if (this.mode === 'visit') c.gesture('clipboard');
    }
  }
}

// ------------------------------------------------------------------ words
const GATHER: Record<Res, string> = {
  ore: 'Iron ore! Heavy stuff. You pulled it right out of the rock. That\'s your plating, your pistons, everything.',
  carbon: 'Carbon, out of dead wood. Good. You\'ll need that for anything that lives or burns.',
  water: 'Water. I wasn\'t sure you could drink. You can drink!',
  soil: 'Soil. Mud, grit, the stuff of mountains. Your body\'s going to be mostly that, I suspect.',
};
const PART_SUB: Record<string, string> = { chassis: 'ASSEMBLED', harvest: 'INSTALLED', gravity: 'FIELD POWER ONLINE', combat: 'COMBAT ROUTINE LOADED', fabrication: 'FABRICATOR ONLINE', lab: 'LABORATORY ONLINE' };
const SKILL_LINES: Record<string, string[]> = {
  head: ['That lens of yours. I wonder what you see through it.'],
  plating2: ['More plate. You\'re turning into a bank vault.'],
  plating3: ['Hazard stripes and all. Somebody back home is going to want those blueprints.'],
  drill: ['A drill! You built a drill out of your own lens mount. Go find some seams.'],
  intake: ['A furnace mouth. Feed it dead wood and you\'ll have carbon for days.'],
  siphon: ['A hand pump and a hose. You\'re drinking the river.'],
  excavate: ['A scoop. Mind the holes, I\'ll break an ankle out there.'],
  magnet: ['Pebbles are rolling toward you on their own. That\'s eerie, Seven.'],
  tanks: ['Storage tanks on your back. Like a milk truck. A very strange milk truck.'],
  bore: ['Tungsten bits. You\'ll be through bedrock by supper.'],
  refinery: ['A crucible in your chest. You\'re smelting as you go. Pittsburgh would weep.'],
  lift: ['My cup just floated off the table. Was that you? That was you.', 'You lifted a rock without touching it. I need to sit down.'],
  slam: ['The air just... dropped. Like a fist. Remind me where I\'m standing when you do that.'],
  repulse: ['Everything flew away from you at once. My hat\'s in a tree.'],
  shape: ['You moved the ground. You actually moved the ground.'],
  well: ['A hole in the world that eats rocks. I\'d rather not stand near it.'],
  storm: ['Every stone in the valley went up at once and came down where you looked. Lord.'],
  amp: ['Your field\'s reaching further. My compass gave up an hour ago.'],
  punch: ['A punch! Keep your guard up, champ.'],
  rock: ['Pick up a stone and throw it. You\'ve got the arm for it now.'],
  boulder: ['Two hands and a boulder. Stand back, everybody. That\'s everybody, meaning me.'],
  shrapnel: ['The stones burst when they land now. Like grenades. You\'re a whole artillery battery.'],
  frenzy: ['Both pistons at once! I can\'t even see your arms move.'],
  plow: ['You flew straight through them. Bowling for animals.'],
  servo: ['Higher pressure. I heard that punch from camp.'],
  graft: ['You\'re going to change the plants? Make them yours? Show me.'],
  sow: ['A seed press. You\'re going to plant copies. A gardener. I never pictured you a gardener.'],
  grove: ['Your plants are spreading on their own now. Like ivy on a courthouse.'],
  convert: ['A neural graft. You\'re going to rewire them. I\'m not sure how I feel about that. Show me anyway.'],
  command: ['A relay in your skull. They answer you now. A pack.'],
  print: ['A flesh printer. Living copies. Washington would give a year\'s budget to see this.'],
  lab: ['A laboratory! Tank, tubes, the works. Now we\'re doing science.'],
  splice: ['Mixing species. Parts from one, parts from another. Careful what you make, Seven.'],
  sequencer: ['Reel-to-reel gene tape. You built a library in your chest.'],
  vat: ['A growth vat. They\'ll come out bigger. Bigger than me, I expect.'],
  cloner: ['Twins. Everything in pairs now. Noah would approve.'],
};
const JOURNAL_SKILL = 'It built something new today. I can hear him saying "Show me, Seven."';
const TERRITORY: [number, string][] = [
  [0.1, 'Look at that. A tenth of the valley is yours already. It\'s the first ground Earth has ever owned out here.'],
  [0.25, 'A quarter of the region. They\'ll have to redraw the maps back home.'],
  [0.5, 'Half the valley. I used to think that ridge was the edge of the world.'],
  [0.75, 'Three quarters. Seven, you could actually do this.'],
];
const MUSINGS = [
  'You don\'t eat the rock so much as fold it into yourself.', 'The insects avoid your shadow now. They\'re learning faster than I am.',
  'I\'ve stopped writing "it" in my notes. I\'ve started writing "you".', 'There are bigger things in the hills. I hear them at night. Be careful.',
  'Every part you build, you look at it for a long time before you use it. So do I, with mine.', 'I radioed Station Four about you. They didn\'t believe a word. Their loss.',
  'Ore, carbon, water, soil. Four ingredients and a stubborn rock. That\'s all a planet is, when you think about it.',
];
const JOURNAL = [
  'Day six. Rations low. Radio silent. I talk to the rock now. It listens better than Station Four.', 'It glows brighter at night. I think it\'s dreaming.',
  'It brought me a stone today and set it down by the fire. I don\'t know why. I kept it.', 'Something circles the camp after dark. Big. Patient.',
];
void RES;

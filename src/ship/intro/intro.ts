// The intro: UNIT 07's first day, a cinematic that is also the tutorial, played in the ship hub's own rooms.
//   a  BOOT     its vision fades in on Dr. Solano's face; she names it; it lifts off its cradle
//   b  GRAVITY  (playable) grab the apple from her hand, drag, let go: the field overshoots, the apple punches
//               through the lab's hull; decompression (air, papers, alarms), outside the apple tumbles into space
//   c  PATCH    (playable) Patch Kowalczyk sprints in; carry the plate to the hole with gravity and hold it while she welds
//   d  REPAIR   (playable) rebuild the shorted lab terminal from its pieces
//   e  POD      (playable) the hangar: build the capsule pod from four part crates
//   f  MONITOR  the bridge: the captain, the main monitor; then the hub's scan / planet / deploy flow takes over
// Esc skips (everything lands in its end state); a save flag makes it play once. Dialogue is spoken (Web Speech, or
// the murmur) in paper balloons over the speakers; UNIT 07's own readouts type into the corner of its vision.
import * as THREE from 'three';
import { Cinema } from '../../game/cinema';
import { csfx, cloop, hush, type Loop } from '../../ui/cineAudio';
import { Apple } from '../../ui/menuApple';
import { Kit } from '../../robots/kit';
import { crewMats } from '../crew/paint';
import { CrewLife, type HubLike } from '../crew/life';
import { crewState } from '../crew/state';
import type { CrewId } from '../crew/roster';
import type { RoomId } from '../hub/layout';
import { IntroUI } from './ui';
import { Motes, looseThings, patchPlate, consoleParts, partCrate, partGhost, outerHole } from './props';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** where the intro is (QA captures wait on it) */
const mark = (m: string) => { (window as unknown as { __introMark: string }).__introMark = m; };
export type Beat = 'boot' | 'gravity' | 'patch' | 'repair' | 'pod' | 'monitor';
export const BEATS: Beat[] = ['boot', 'gravity', 'patch', 'repair', 'pod', 'monitor'];

/** what the intro needs from the hub (ShipHub has all of it; the optional parts have fallbacks) */
export interface IntroHub extends HubLike {
  lockInput?(on: boolean): void; showChrome?(on: boolean): void;
  shot?(c: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }, dur?: number): Promise<void>;
  release?(): void; open?(id: RoomId): void; focus?(id: RoomId, o?: { instant?: boolean }): Promise<void>;
  breach?(): { pos: THREE.Vector3; normal: THREE.Vector3; patch(k: number): void; done(): void };
  alarm?(on: boolean): void; podBuild?(k: number): void; pod?: THREE.Object3D;
}
export interface IntroOpts {
  /** the crew life already running on this hub (else one is made) */
  life?: CrewLife;
  /** called when it is over (skipped or not); default: the bridge opens (the main monitor) */
  onDone?: (skipped: boolean) => void;
  /** start at a beat (QA) */
  from?: Beat;
  /** play the playable beats by themselves (QA, attract) */
  auto?: boolean;
}

export function introDone() { return crewState().intro; }
export function resetIntro() { const s = crewState(); s.intro = false; s.save(); }
let running = false;
export const introRunning = () => running;

// ------------------------------------------------------------------ pointer input during the playable beats
class Pointer {
  x = 0; y = 0; down = false; pressed = false; released = false;
  private hist: { x: number; y: number; t: number }[] = [];
  private off: () => void;
  constructor(readonly c: Cinema) {
    const ok = () => this.c.passPointer;
    const dn = (e: PointerEvent) => { if (!ok() || e.button !== 0) return; this.set(e); this.down = true; this.pressed = true; };
    const mv = (e: PointerEvent) => { this.set(e); };
    const up = (e: PointerEvent) => { this.set(e); if (this.down) this.released = true; this.down = false; };
    addEventListener('pointerdown', dn, true); addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
    this.off = () => { removeEventListener('pointerdown', dn, true); removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); };
  }
  private set(e: PointerEvent) { this.x = e.clientX; this.y = e.clientY; this.hist.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (this.hist.length > 12) this.hist.shift(); }
  /** screen velocity (px/s) over the last ~120 ms */
  vel() { const n = performance.now(), h = this.hist.filter((p) => n - p.t < 120); if (h.length < 2) return { x: 0, y: 0 }; const a = h[0], b = h[h.length - 1], dt = Math.max(0.016, (b.t - a.t) / 1000); return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt }; }
  /** fake input (auto mode) */
  sim(x: number, y: number, down?: boolean) { this.x = x; this.y = y; this.hist.push({ x, y, t: performance.now() }); if (down === true && !this.down) { this.down = true; this.pressed = true; } if (down === false && this.down) { this.down = false; this.released = true; } }
  /** a press since the last call (consumes it) */
  take() { const p = this.pressed; this.pressed = false; return p; }
  dispose() { this.off(); }
}

// ------------------------------------------------------------------ the script
export async function playIntro(hub: IntroHub, o: IntroOpts = {}): Promise<boolean> {
  if (running) return false;
  running = true;
  const life = o.life ?? new CrewLife(hub);
  const unit = life.unit;
  const ui = new IntroUI();
  const motes = new Motes(); hub.scene.add(motes.points);
  const cine = new Cinema({
    enter: () => { hub.lockInput?.(true); hub.showChrome?.(false); life.scripted = true; },
  });
  const ptr = new Pointer(cine);
  const ray = new THREE.Raycaster();
  const cam = hub.camera;
  const lab = hub.room('lab')!, shop = hub.room('workshop')!, bridge = hub.room('bridge')!;
  const LS = lab.spots;
  const own: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(x: T, parent: THREE.Object3D = hub.scene) => { parent.add(x); own.push(x); return x; };
  const frameFns = new Set<(dt: number) => void>();
  let room: Loop | null = null;
  /** the last frame's dt (the playable beats' predicates run once per frame, after it) */
  let FDT = 1 / 60;
  let suck: ((dt: number) => void) | null = null;

  // the camera: the cinema's rig drives the hub camera every frame (after the hub has placed its own)
  const offUpd = hub.onUpdate((dt) => {
    cine.update(dt);
    for (const f of frameFns) f(dt);
    motes.update(dt);
    if (cine.active) cine.apply(cam);
    FDT = Math.min(0.1, dt);
  });
  void hub.shot?.({ pos: cam.position.clone(), look: cam.position.clone().add(cam.getWorldDirection(V())), fov: cam.fov }, 0);

  const actorOf = (id: CrewId) => life.actor(id);
  const modelOf = (id: CrewId) => life.model(id);
  /** a line of dialogue: balloon, voice, mouth; resolves when it has been heard */
  const line = (id: CrewId, text: string, extra = 0) => { if (cine.skipping) return Promise.resolve(); const d = life.say(id, text); return cine.wait(Math.max(1.6, d) + extra); };
  const head = (id: CrewId) => { const m = modelOf(id); return m ? m.rig.j.head.getWorldPosition(V()).add(V(0, 0.08, 0)) : V(); };
  const screenOf = (p: THREE.Vector3) => { const v = p.clone().project(cam); return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, on: v.z < 1 }; };
  const rayAt = (x: number, y: number) => { ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), cam); return ray; };
  /** is the pointer on an object (a pick radius in metres round its centre)? */
  const over = (p: THREE.Vector3, r: number) => rayAt(ptr.x, ptr.y).ray.distanceToPoint(p) < r;
  const play = (on: boolean) => { cine.passPointer = on; cine.letterbox(!on, 0.5); if (!on) { ui.prompt(null); ui.mark(null); ui.hold(null); document.body.style.cursor = ''; } };

  // the cast's places
  const put = (id: CrewId, rm: RoomId, x: number, z: number, faceX: number, faceZ: number) => { const a = life.put(id, rm, x, z); if (a) a.faceNow(faceX, faceZ); return a; };

  // ---- the props of the day
  const apple = new Apple(0.045); apple.group.scale.setScalar(1); own.push(apple.group);
  const cradle = buildCradle(); cradle.position.set(7.25, 0, 12.6); add(cradle, lab.root);
  const U0 = V(7.25, 1.17, 12.6);
  let breach: ReturnType<NonNullable<IntroHub['breach']>> | null = null;
  const fallbackHole = () => { const g = outerHole(); const p = LS.hull_breach.pos; g.position.copy(p).add(V(-0.02, 0, 0)); g.lookAt(p.clone().add(V(-1, 0, 0))); add(g); return { pos: p.clone(), normal: V(-1, 0, 0), patch: (k: number) => void k, done: () => {} }; };
  const loose = looseThings();
  const plate = patchPlate();
  const parts = consoleParts();
  const crates = [0, 1, 2, 3].map(partCrate);
  let alarmT = 0; let alarmOn = false;
  frameFns.add((dt) => { if (!alarmOn) return; alarmT -= dt; if (alarmT <= 0) { alarmT = 1.1; csfx('klaxon', 0.55); } });
  const alarm = (on: boolean) => { alarmOn = on; hub.alarm?.(on); };

  // the final state, whether it played out or was skipped
  const finish = (skipped: boolean) => {
    for (const x of own) x.removeFromParent();
    apple.group.removeFromParent();
    if (breach) { breach.patch(1); breach.done(); }
    alarm(false); hub.podBuild?.(1);
    ui.dispose(); ptr.dispose(); motes.dispose(); offUpd(); room?.stop(0.4); hush();
    frameFns.clear();
    unit.root.visible = true; unit.power = 1; unit.mood = 'calm'; unit.grav(null); unit.setSquint(0);
    unit.place(V(0.9, 1.7, 24.0));
    life.scripted = false; life.resume();
    const st = crewState(); st.intro = true; st.save();
    hub.lockInput?.(false); hub.showChrome?.(true); hub.release?.();
    running = false;
    if (o.onDone) o.onDone(skipped); else hub.open?.('bridge');
  };

  const from = BEATS.indexOf(o.from ?? 'boot');
  const skipped = await cine.play(async (c) => {
    c.onEnd(() => { /* the end state is applied after play() returns */ });
    room = c.loop('room', 0.35);
    hub.podBuild?.(0);
    // ================================================================ a. BOOT
    put('solano', 'lab', 6.15, 11.95, U0.x, U0.z);
    unit.place(U0); unit.faceNow(head('solano'));
    if (from <= 0) {
      unit.power = 0; unit.root.visible = false; unit.mood = 'boot';
      ui.bootView(true);
      c.ui.fade(1, 0);
      await c.wait(0.8);
      const eye = unit.emitter();
      c.cam.cut(eye, head('solano').add(V(0, -0.04, 0)), 34);
      c.cam.handheld = 0.004;
      c.sfx('hum', 0.6); c.sfx('relay', 0.6);
      ui.sys('UNIT 07 · CORE v7.0 · COLD BOOT');
      await c.wait(1.0);
      ui.sys('OPTICS ........ [ONLINE]');
      c.fade(0.55, 0.15); await c.wait(0.25); c.fade(1, 0.2); await c.wait(0.4); c.sfx('chime', 0.4);
      ui.sys('AUDIO ......... [ONLINE]');
      await c.fade(0, 2.6);
      mark('boot:face');
      modelOf('solano')?.rig.setExpression('smile', 6);
      actorOf('solano')!.look = eye.clone();
      c.cam.move({ fov: 26, dur: 6, ease: 'inOut' });
      await line('solano', 'There you are. Can you hear me? ...Blink if you can hear me.');
      unit.blink(); c.sfx('beep', 0.5);
      ui.sys('FACE MATCH: [DR. MIRA SOLANO] · CREATOR');
      mark('boot:name');
      await line('solano', 'Ha! Good morning, UNIT 07. I am Dr. Mira Solano. I wrote you.', 0.2);
      modelOf('solano')?.rig.gesture('present');
      await line('solano', 'Well, most of you. You wrote the rest yourself, overnight. Show-off.');
      ui.sys('DESIGNATION: [UNIT 07] · UNAA COLONISATION RESEARCH PROGRAM', 5);
      await line('solano', 'You are aboard the Meridian, in orbit over our first target system. Our job is to build colonies with robots.');
      await line('solano', 'Your job... is to be the robot. Come on, up you get.');
      // out of its eyes: the camera pulls back and there it is, lifting off the cradle
      ui.bootView(false);
      c.cam.cut(V(4.2, 1.9, 9.6), U0.clone().add(V(-0.4, 0.15, 0)), 34);
      unit.root.visible = true;
      c.cam.move({ pos: V(3.6, 2.1, 10.2), look: V(6.7, 1.3, 12.6), fov: 38, dur: 5, ease: 'inOut' });
      await c.tween(1.6, (u) => { unit.power = u; }, 'out');
      unit.mood = 'calm'; c.sfx('servo', 0.6); c.sfx('hover', 0.7);
      unit.moveTo(V(6.75, 1.5, 13.0), 0.6);
      await c.wait(1.2); mark('boot:lift'); await c.wait(1.0);
      unit.lookAt(head('solano'));
      modelOf('solano')?.rig.gesture('nod');
      await line('solano', 'Thrusters, stable. Optics, beautiful. Now the fun part.');
    }
    unit.root.visible = true; unit.power = 1; unit.mood = 'calm'; unit.place(V(6.75, 1.5, 13.0));
    // ================================================================ b. GRAVITY
    const throwSpot = V(6.75, 1.5, 13.0);
    let flown = false;
    if (from <= 1) {
      put('solano', 'lab', 6.0, 12.05, throwSpot.x, throwSpot.z);
      c.cam.cut(V(3.3, 2.25, 10.9), V(7.5, 1.3, 13.2), 44);
      const sol = modelOf('solano')!;
      sol.rig.hold('R', apple.group, 'raw'); apple.group.position.set(0.0, -0.1, 0.06); apple.group.visible = true;
      sol.rig.gesture('present', { hold: true, dir: [0.6, 0.15, 1] });
      await line('solano', 'Your gravity field. It can lift anything up to about three hundred kilos, so... gently.');
      await line('solano', 'Take the apple from my hand. Reach for it.');
      ui.sys('GRAVITY FIELD: [ONLINE] · 0.3 t RATED');
      play(true);
      mark('gravity:offer');
      // ---- grab
      const appleAt = () => apple.group.getWorldPosition(V());
      ui.prompt('CLICK', 'the apple to reach for it with your gravity field');
      let autoT = 0;
      const grabbed = () => {
        if (o.auto) { autoT += FDT; const s = screenOf(appleAt()); ptr.sim(s.x, s.y, autoT > 1.2 ? true : undefined); }
        const s = screenOf(appleAt()); ui.mark(s.x, s.y, 'APPLE');
        const on = over(appleAt(), 0.18); document.body.style.cursor = on ? 'pointer' : '';
        return ptr.take() && on;
      };
      await c.until(grabbed, 900);
      ui.mark(null);
      // the apple leaves her hand and hangs in the field before UNIT 07
      const ap = appleAt(); sol.rig.hold('R', null); sol.rig.gesture('present', { dur: 0.4 }); add(apple.group); apple.group.position.copy(ap); apple.group.rotation.set(0, 0, 0);
      c.sfx('hum', 0.5, 1.4); unit.grav(apple.group.position, 0.1);
      sol.rig.setExpression('surprised', 2);
      ui.prompt('DRAG', 'to swing it, then let go to throw', 'gently');
      const hold = V(), want = V();
      let flick = 0;
      const plane = new THREE.Plane();
      const drag = (dt: number) => {
        // the apple follows the pointer on a plane through UNIT 07 facing the camera, within the field's reach
        plane.setFromNormalAndCoplanarPoint(cam.getWorldDirection(V()).negate(), unit.pos);
        rayAt(ptr.x, ptr.y).ray.intersectPlane(plane, want);
        if (want.lengthSq() === 0) want.copy(unit.pos);
        const d = want.clone().sub(unit.pos); if (d.length() > 1.1) d.setLength(1.1); if (d.length() < 0.35) d.setLength(0.35);
        hold.copy(unit.pos).add(d);
        apple.group.position.lerp(hold, Math.min(1, dt * 10)); apple.group.rotation.y += dt * 2;
        unit.lookAt(apple.group.position);
      };
      frameFns.add(drag);
      const throwIt = () => {
        if (o.auto) { autoT += FDT; const u = unit.pos, s0 = screenOf(u.clone().add(V(-0.6, 0.1, -0.3))), s1 = screenOf(u.clone().add(V(0.7, 0.2, 0.4))); const k = Math.min(1, Math.max(0, (autoT - 2.4) / 0.6)); ptr.sim(s0.x + (s1.x - s0.x) * k * k, s0.y + (s1.y - s0.y) * k * k, k >= 1 ? false : true); }
        if (ptr.down) { const v = ptr.vel(); flick = Math.max(flick * 0.9, Math.hypot(v.x, v.y)); }
        return ptr.released;
      };
      ptr.released = false;
      mark('gravity:hold');
      await c.until(throwIt, 900);
      frameFns.delete(drag); play(false); document.body.style.cursor = '';
      // ---- the throw: the field overshoots, whatever the aim
      ui.sys('WARNING: FIELD GAIN [OVERSHOOT]', 3);
      sol.rig.gesture('point', { at: LS.hull_breach.pos }); sol.rig.setExpression('surprised', 3);
      void line('solano', 'Gently--!');
      unit.grav(null); c.sfx('whoosh', 1); c.sfx('hum', 0.6, 2);
      const a0 = apple.group.position.clone(), hit = LS.hull_breach.pos.clone();
      const mid = a0.clone().lerp(hit, 0.5).add(V(0, 0.25, 0));
      c.cam.move({ look: hit.clone().add(V(-0.5, 0, 0)), fov: 36, dur: 0.5, ease: 'out' });
      await c.tween(0.42, (u) => {
        const w = 1 - u; apple.group.position.copy(a0.clone().multiplyScalar(w * w).addScaledVector(mid, 2 * u * w).addScaledVector(hit, u * u));
        apple.group.rotation.x += 0.6; motes.emit(apple.group.position, 2, 0x9a8cff, { speed: 0.3, life: 0.4, size: 0.05 });
      }, 'in');
      void flick;
      flown = true;
      mark('gravity:impact');
    }
    // ---- the breach
    if (from <= 2) { breach = hub.breach ? hub.breach() : fallbackHole(); alarm(true); }
    if (from <= 1 && breach) {
      c.flash('#ffffff', 0.25, 0.7); c.sfx('impact', 1.2); c.sfx('boom', 0.9); c.sfx('glass', 0.6); c.cam.shake(0.25, 0.8);
      apple.group.visible = false;
      motes.emit(breach.pos, 40, 0xffc070, { dir: breach.normal, speed: 3, cone: 0.9, life: 0.6, size: 0.03, grav: 6 });
      const wind = c.loop('engine', 0.6);
      // decompression: the loose things in the lab take off for the hole
      const lab0 = [V(8.9, 1.0, 9.0), V(8.6, 0.98, 10.2), V(8.8, 1.0, 11.0), V(5.4, 0.95, 15.9), V(6.2, 0.98, 15.8), V(3.3, 0.95, 16.0), V(7.8, 0.6, 14.8), V(4.6, 1.0, 13.4), V(8.4, 1.0, 12.0), V(5.2, 0.4, 11.0), V(6.8, 0.9, 16.2), V(3.9, 0.98, 15.7)];
      const fly = loose.map((g, i) => { add(g); g.position.copy(lab0[i % lab0.length]); g.rotation.set(Math.random(), Math.random() * 6, 0); return { g, v: V(), out: false, delay: i * 0.18 + Math.random() * 0.3 }; });
      suck = (dt: number) => {
        for (const f of fly) {
          if (f.out) continue;
          if ((f.delay -= dt) > 0) continue;
          const d = breach!.pos.clone().sub(f.g.position), L = d.length();
          f.v.addScaledVector(d.normalize(), dt * (6 + 14 / Math.max(0.4, L))); f.v.multiplyScalar(Math.exp(-dt * 1.2));
          f.g.position.addScaledVector(f.v, dt); f.g.rotation.x += dt * 7; f.g.rotation.z += dt * 5;
          if (L < 0.2) { f.out = true; f.g.visible = false; motes.emit(breach!.pos, 6, 0xd8e8f0, { dir: breach!.normal.clone().negate(), speed: 2, life: 0.5, size: 0.04 }); }
        }
        if (Math.random() < 0.7) motes.emit(breach!.pos.clone().add(breach!.normal.clone().multiplyScalar(0.6)).add(V(0, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2)), 2, 0xc8d8e0, { dir: breach!.normal.clone().negate(), speed: 3.5, cone: 0.2, life: 0.35, size: 0.035 });
      };
      frameFns.add(suck);
      const sola = actorOf('solano')!; sola.action = 'cover_ears'; modelOf('solano')?.rig.setExpression('fear', 6);
      unit.mood = 'alert'; unit.moveTo(breach.pos.clone().add(breach.normal.clone().multiplyScalar(1.2)), 1.2);
      c.cam.handheld = 0.03;
      c.cam.cut(V(5.2, 1.8, 11.6), breach.pos.clone().add(V(-0.6, -0.1, 0)), 46);
      c.cam.move({ pos: V(5.6, 1.7, 12.2), dur: 3, ease: 'out' });
      ui.sys('HULL BREACH · LAB STBD · [PRESSURE FALLING]', 4);
      mark('breach:inside');
      await line('solano', 'Breach! Hold on to something!', -0.6);
      await c.wait(0.8);
      // ---- outside: the apple tumbling away into space
      const outer = outerHit(hub, breach.pos);
      const hole = outerHole(); hole.position.copy(outer.p); hole.lookAt(outer.p.clone().add(outer.n)); add(hole);
      const apOut = apple.group; apOut.visible = true; apOut.position.copy(outer.p).addScaledVector(outer.n, 0.15);
      const av = outer.n.clone().multiplyScalar(0.55).add(V(0, 0.08, 0.12));
      const tumble = (dt: number) => { apOut.position.addScaledVector(av, dt); apOut.rotation.x += dt * 1.3; apOut.rotation.y += dt * 0.7; if (Math.random() < 0.8) motes.emit(outer.p, 2, 0xd8f0ff, { dir: outer.n, speed: 2.2, cone: 0.35, life: 1.4, size: 0.03, drag: 0.2 }); };
      frameFns.add(tumble);
      const oc = outer.p.clone().addScaledVector(outer.n, 4.6).add(V(0, 0.6, 3.6));
      c.cam.handheld = 0.01;
      c.cam.cut(oc, outer.p.clone().addScaledVector(outer.n, 1.2), 34);
      c.cam.move({ look: outer.p.clone().addScaledVector(outer.n, 2.4), fov: 30, dur: 5.5, ease: 'inOut' });
      wind.set(0.15); c.sfx('static', 0.25, 1.2);
      ui.sys('OBJECT LOST: [1 APPLE] · VELOCITY 0.6 m/s', 4);
      mark('breach:outside');
      await c.wait(4.8);
      frameFns.delete(tumble); apOut.visible = false;
      wind.set(0.6);
      // back inside: red light, the crew running
      c.cam.handheld = 0.03;
      c.cam.cut(V(4.6, 2.0, 10.6), V(8.4, 1.2, 13.6), 44);
      for (const id of ['quintero', 'castellanos'] as CrewId[]) { const m = modelOf(id); if (m) m.rig.setExpression('surprised', 3); }
      void wind;
    } else { apple.group.visible = false; }
    void flown;
    // ================================================================ c. PATCH
    if (from <= 2 && breach) {
      const br = breach;
      const pat = put('kowalczyk', 'lab', LS.door.pos.x, LS.door.pos.z, 9, 13)!;
      pat.walkTo(8.75, 13.2, 3.6);
      c.sfx('step', 0.7); c.sfx('cover', 0.5);
      c.cam.move({ look: V(6.8, 1.2, 12.8), dur: 1.4, ease: 'inOut' });
      mark('patch:arrive');
      await line('kowalczyk', 'WHO PUT A HOLE IN MY SHIP?!', -0.8);
      await c.until(() => !pat.moving, 6);
      pat.faceNow(br.pos.x, br.pos.z);
      // the plate goes down at her feet
      add(plate); plate.position.set(8.3, 0.03, 12.6); plate.rotation.set(-Math.PI / 2, 0, 0.3); c.sfx('thud', 0.9); c.sfx('clamp', 0.6);
      await line('kowalczyk', 'Plate! You, bubble! Put it on the hole and HOLD it. I weld!');
      play(true);
      ui.prompt('CLICK', 'the plate to lift it to the hole');
      let autoT = 0;
      const plateAt = () => plate.getWorldPosition(V());
      await c.until(() => {
        if (o.auto) { autoT += FDT; const s = screenOf(plateAt()); ptr.sim(s.x, s.y, autoT > 1.2 ? true : undefined); }
        const s = screenOf(plateAt()); ui.mark(s.x, s.y, 'HULL PLATE'); const on = over(plateAt(), 0.4); document.body.style.cursor = on ? 'pointer' : ''; return ptr.take() && on;
      }, 900);
      ui.mark(null); document.body.style.cursor = '';
      unit.grav(plate.position, 0.45); c.sfx('hum', 0.5, 1.2);
      const p0 = plate.position.clone(), r0 = plate.quaternion.clone();
      const seat = br.pos.clone().addScaledVector(br.normal, 0.05);
      const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(seat.clone().add(br.normal), seat, V(0, 1, 0)));
      ui.prompt('HOLD', 'the mouse button to keep the plate against the hull', 'while Patch welds');
      await c.tween(1.2, (u) => { plate.position.lerpVectors(p0, seat, u).y += Math.sin(u * Math.PI) * 0.4; plate.quaternion.slerpQuaternions(r0, q1, u); }, 'inOut');
      c.sfx('clamp', 0.9); c.cam.shake(0.05, 0.2);
      // hold: the weld runs round the rim while the button is down; let go and it slips
      let k = 0, slip = 0; autoT = 0;
      mark('patch:weld');
      pat.action = 'hammer'; pat.look = seat.clone();
      await c.until(() => {
        const dt = FDT;
        if (o.auto) { autoT += dt; const s = screenOf(seat); ptr.sim(s.x, s.y, autoT > 0.6); }
        if (ptr.down) { k = Math.min(1, k + dt / 4.2); slip = Math.max(0, slip - dt * 2); } else { k = Math.max(0, k - dt * 0.15); slip = Math.min(1, slip + dt * 0.8); }
        plate.position.copy(seat).add(V(0, -slip * 0.12, 0)).addScaledVector(br.normal, slip * 0.05);
        br.patch(0.25 + 0.75 * k);
        const a = k * Math.PI * 2 * 1.5, rim = seat.clone().add(V(0, Math.cos(a) * 0.3, Math.sin(a) * 0.3));
        if (ptr.down && Math.random() < 0.9) { motes.emit(rim, 3, 0xffd080, { dir: br.normal, speed: 2.4, cone: 0.8, life: 0.35, size: 0.025, grav: 5 }); if (Math.random() < 0.2) csfx('switch', 0.25, 1.6); }
        const s = screenOf(seat); ui.hold(s.x, s.y, k, ptr.down ? 'WELDING ' + Math.round(k * 100) + '%' : 'HOLD IT!');
        return k >= 1;
      }, 900);
      ui.hold(null); play(false);
      unit.grav(null); pat.action = '';
      br.patch(1); br.done(); alarm(false); plate.visible = !hub.breach;
      if (suck) frameFns.delete(suck);
      c.sfx('leverLock', 0.8); c.sfx('steam', 0.6);
      ui.sys('HULL INTEGRITY: [100%] · PRESSURE NOMINAL', 4);
      unit.mood = 'calm';
      c.cam.cut(V(6.4, 1.75, 11.7), V(8.6, 1.45, 13.4), 34);
      actorOf('solano')!.action = '';
      pat.faceNow(unit.pos.x, unit.pos.z); pat.look = unit.pos.clone();
      modelOf('kowalczyk')?.rig.gesture('point', { at: unit.pos.clone() });
      mark('patch:done');
      await line('kowalczyk', 'Sealed. ...You owe me an apple. And a hull plate.');
      modelOf('kowalczyk')?.rig.setExpression('smile', 3);
      await line('kowalczyk', 'Decent grip, though. For a bubble.');
      put('solano', 'lab', 6.4, 12.3, 7.5, 13.0); modelOf('solano')?.rig.setExpression('smile', 4);
      await line('solano', 'That was... a very memorable first throw. Let us call it a stress test.');
    }
    if (suck) { frameFns.delete(suck); suck = null; }
    // ================================================================ d. REPAIR
    const term = LS.terminal.pos, tz = term.z + 0.75, tc = V(term.x, 1.02, tz);
    if (from <= 3) {
      // the terminal shorted in the decompression: sparks, smoke, its pieces on the deck
      parts.forEach((g, i) => { add(g); g.position.set(term.x - 0.45 + i * 0.45, 0.03, term.z - 0.35 + (i % 2) * 0.2); g.rotation.set(0, i * 0.9, 0); });
      let sparking = true;
      const fizz = () => { if (sparking && Math.random() < 0.25) { motes.emit(tc, 6, 0xffd080, { dir: V(0, 0.4, -1), speed: 1.6, cone: 0.8, life: 0.4, size: 0.02, grav: 5 }); if (Math.random() < 0.3) csfx('switch', 0.3, 2); } if (sparking && Math.random() < 0.2) motes.emit(tc.clone().add(V(0, 0.2, 0)), 1, 0x605850, { dir: V(0, 1, 0), speed: 0.3, life: 1.6, size: 0.12, drag: 0.3 }); };
      frameFns.add(fizz);
      put('solano', 'lab', term.x + 1.25, term.z - 1.1, term.x, tz);
      unit.moveTo(V(term.x + 0.6, 1.45, term.z - 1.0), 1.2);
      c.cam.cut(V(term.x + 2.9, 2.15, term.z - 3.1), V(term.x - 0.1, 0.75, term.z + 0.2), 42);
      await line('solano', 'The decompression fried the analysis terminal. Your other gift: you can build. And repair is just building backwards.');
      await line('solano', 'Pull the pieces back in. Each one where it belongs.');
      ui.sys('FABRICATION ARRAY: [ONLINE] · NANITE STOCK 100%');
      play(true);
      ui.prompt('CLICK + HOLD', 'each piece to rebuild the terminal');
      mark('repair:start');
      const done = new Set<number>(); let busy = false; let autoT = 0; let holdK = 0; let cur = -1;
      await c.until(() => {
        const dt = FDT;
        const left = parts.map((g, i) => ({ g, i })).filter((p) => !done.has(p.i));
        if (!left.length) return !busy;
        const nxt = left[0];
        if (o.auto) { autoT += dt; const s = screenOf(nxt.g.getWorldPosition(V())); ptr.sim(s.x, s.y, autoT % 2.2 > 0.5); }
        const s = screenOf(nxt.g.getWorldPosition(V()));
        if (!busy) ui.mark(s.x, s.y, ['COVER PLATE', 'CIRCUIT CARD', 'CABLE LOOM'][nxt.i]);
        const hover = left.find((p) => over(p.g.getWorldPosition(V()), 0.25));
        document.body.style.cursor = hover ? 'pointer' : '';
        if (busy) return false;
        if (ptr.down && hover) { if (cur !== hover.i) { cur = hover.i; holdK = 0; } holdK += dt / 0.7; unit.grav(hover.g.position, 0.2); const hs = screenOf(hover.g.getWorldPosition(V())); ui.hold(hs.x, hs.y, holdK, 'REBUILD'); }
        else { holdK = Math.max(0, holdK - dt * 2); if (!ptr.down) { unit.grav(null); ui.hold(null); } }
        if (holdK > 0.5) mark('repair:hold');
        if (holdK >= 1 && cur >= 0) {
          const g = parts[cur], i = cur; busy = true; holdK = 0; cur = -1; ui.hold(null); ui.mark(null);
          const a = g.position.clone(), r = g.rotation.clone();
          csfx('servo', 0.5); csfx('hum', 0.4, 1.6);
          let u = 0;
          const flyIn = (ddt: number) => {
            u = Math.min(1, u + ddt / 1.0);
            g.position.lerpVectors(a, tc, u).y += Math.sin(u * Math.PI) * 0.35; g.rotation.set(r.x + u * 6, r.y + u * 4, r.z); g.scale.setScalar(1 - u * 0.85);
            motes.emit(g.position, 3, 0x8fd8ff, { speed: 0.6, life: 0.5, size: 0.03 });
            if (u >= 1) { frameFns.delete(flyIn); g.visible = false; done.add(i); busy = false; unit.grav(null); motes.emit(tc, 30, 0x9fe8ff, { speed: 1.2, life: 0.6, size: 0.03 }); csfx('chime', 0.4, 1 + done.size * 0.1); csfx('clamp', 0.5); }
          };
          frameFns.add(flyIn);
        }
        return false;
      }, 900);
      sparking = false; play(false); ui.mark(null); unit.grav(null);
      c.sfx('relay', 0.6); c.sfx('beepHi', 0.5);
      ui.sys('ANALYSIS TERMINAL: [REPAIRED]', 4);
      mark('repair:done');
      modelOf('solano')?.rig.gesture('nod'); modelOf('solano')?.rig.setExpression('happy', 3);
      await line('solano', 'Perfect. Build it, break it, build it again. That is the whole job.');
    }
    // ================================================================ e. POD
    const PC = shop.spots.pod_cradle.pos;
    if (from <= 4) {
      await c.fade(1, 0.8);
      put('solano', 'workshop', PC.x + 2.2, PC.z + 2.6, PC.x, PC.z);
      put('kowalczyk', 'workshop', PC.x - 2.0, PC.z + 2.5, PC.x, PC.z);
      unit.place(V(PC.x + 1.2, 1.7, PC.z + 2.6)); unit.lookAt(PC.clone().add(V(0, 0.8, 0)));
      const cpos = [V(PC.x + 2.1, 0, PC.z + 0.4), V(PC.x + 1.6, 0, PC.z - 2.0), V(PC.x - 1.8, 0, PC.z - 2.0), V(PC.x - 2.3, 0, PC.z + 0.5)];
      crates.forEach((g, i) => { add(g); g.position.copy(cpos[i]); g.lookAt(V(PC.x, 0, PC.z)); });
      hub.podBuild?.(0);
      c.cam.cut(V(PC.x + 4.6, 3.4, PC.z + 5.4), V(PC.x + 0.2, 0.9, PC.z), 44);
      c.cam.move({ pos: V(PC.x + 4.1, 3.0, PC.z + 4.8), dur: 8, ease: 'inOut' });
      await c.fade(0, 1.0);
      c.stamp('WORKSHOP + HANGAR · DECK 1 AFT');
      await line('solano', 'Your body for the surface. A capsule pod: you ride it down, and once it lands, it is you.');
      await line('kowalczyk', 'Parts are in the crates. Bring them to the cradle, I bolt. Frame first.');
      ui.sys('POD ASSEMBLY · 4 PARTS · GRAVITY HANDLING');
      mark('pod:start');
      play(true);
      const lines: [CrewId, string][] = [['kowalczyk', 'Frame is true. Plating next.'], ['solano', 'Plating on. Now the glazing and the heat shield: your window, and your umbrella.'], ['kowalczyk', 'Legs and lights. Last one, bubble.'], ['kowalczyk', 'And... she is done. Not bad for an apple cannon.']];
      for (let i = 0; i < 4; i++) {
        ui.prompt('CLICK', `the ${['frame', 'plating', 'glazing', 'legs'][i]} crate to bring the part to the cradle`, `${i + 1} / 4`);
        let autoT = 0;
        const cp = () => crates[i].position.clone().add(V(0, 0.4, 0));
        await c.until(() => {
          if (o.auto) { autoT += FDT; const s = screenOf(cp()); ptr.sim(s.x, s.y, autoT > 1.0 ? true : undefined); }
          const s = screenOf(cp()); ui.mark(s.x, s.y, ['POD FRAME', 'HULL PLATING', 'GLAZING + SHIELD', 'LEGS + LIGHTS'][i]);
          const on = over(cp(), 0.5); document.body.style.cursor = on ? 'pointer' : '';
          return ptr.take() && on;
        }, 900);
        ui.mark(null); document.body.style.cursor = ''; ptr.down = false; ptr.take();
        // the lid pops, the part rises out of the crate in the field and settles onto the cradle
        const ghost = partGhost(i); add(ghost); ghost.position.copy(cp());
        unit.grav(ghost.position, 0.6); csfx('cover', 0.6); csfx('hum', 0.5, 1.3);
        const from3 = ghost.position.clone(), to3 = PC.clone().add(V(0, i === 3 ? 0.3 : 0.9, 0));
        await c.tween(1.3, (u) => { ghost.position.lerpVectors(from3, to3, u).y += Math.sin(u * Math.PI) * 1.2; ghost.rotation.y = u * 3; ghost.scale.setScalar(0.6 + u * 0.4); if (u > 0.4 && u < 0.6) mark('pod:fly' + (i + 1)); }, 'inOut');
        ghost.removeFromParent(); unit.grav(null);
        mark('pod:' + (i + 1));
        hub.podBuild?.((i + 1) / 4);
        motes.emit(PC.clone().add(V(0, 0.9, 0)), 50, 0xffd080, { speed: 2.6, cone: 1, life: 0.6, size: 0.03, grav: 4, spread: 1.4 });
        c.sfx('clamp', 0.9); c.sfx('steam', 0.5); c.cam.shake(0.04, 0.2);
        actorOf('kowalczyk')!.action = 'hammer'; setTimeout(() => { const a = actorOf('kowalczyk'); if (a) a.action = ''; }, 1600);
        play(false);
        await line(lines[i][0], lines[i][1]);
        if (i < 3) play(true);
      }
      ui.sys('CAPSULE POD: [ASSEMBLED] · TRANSFER READY', 5);
      unit.mood = 'happy';
      c.cam.move({ pos: V(PC.x + 3.0, 1.6, PC.z + 3.4), look: V(PC.x, 1.1, PC.z), fov: 36, dur: 4, ease: 'inOut' });
      await c.wait(1.2);
      await line('quintero', 'Bridge to workshop. Doctor, bring our newest crewmate up. We have a galaxy to look at.');
    }
    // ================================================================ f. MONITOR
    await c.fade(1, 0.9);
    const MS = bridge.spots;
    put('solano', 'bridge', MS.monitor.pos.x - 0.9, MS.monitor.pos.z - 1.3, 0, MS.monitor.pos.z - 4);
    put('quintero', 'bridge', MS.captain.pos.x, MS.captain.pos.z + 0.9, MS.monitor.pos.x, MS.monitor.pos.z);
    put('castellanos', 'bridge', MS.helm.pos.x, MS.helm.pos.z - 0.5, MS.monitor.pos.x, MS.monitor.pos.z);
    unit.place(V(MS.monitor.pos.x + 0.7, 1.7, MS.monitor.pos.z - 1.6)); unit.lookAt(V(0, 1.8, 27));
    c.cam.cut(V(0.0, 2.3, MS.captain.pos.z - 1.2), V(0, 1.7, 26.6), 40);
    c.cam.move({ pos: V(0.2, 2.0, MS.captain.pos.z + 1.6), dur: 9, ease: 'inOut' });
    await c.fade(0, 1.2);
    c.stamp('BRIDGE · UNAA MERIDIAN · RV-07');
    mark('monitor');
    actorOf('quintero')!.faceNow(unit.pos.x, unit.pos.z);
    modelOf('quintero')?.rig.playEmote('salute');
    await line('quintero', 'So this is the one who opened my lab to space. Welcome aboard the Meridian, UNIT 07.');
    actorOf('quintero')!.faceNow(MS.monitor.pos.x, MS.monitor.pos.z);
    modelOf('castellanos')?.rig.gesture('wave');
    await line('castellanos', 'Sparrow, your pilot. You fly the pod down, I fly the ship. Deal?');
    actorOf('solano')!.faceNow(unit.pos.x, unit.pos.z);
    modelOf('solano')?.rig.gesture('present', { dir: [0, 0.4, 1] });
    await line('solano', 'This is the main monitor. Scan the galaxy, start with the easiest world, choose where to land, and deploy yourself.');
    await line('solano', 'We will be right here. Go make us proud.');
    ui.sys('MAIN MONITOR: [LINKED] · AWAITING SCAN', 4);
    await c.wait(0.8);
  }, { name: 'intro', letterbox: true });
  finish(skipped);
  mark('done');
  return skipped;
}

/** where the hull's outer skin is, straight out from a point on the inner wall (a ray from outside) */
function outerHit(hub: IntroHub, inner: THREE.Vector3) {
  const n = V(1, 0, 0);
  const rc = new THREE.Raycaster(inner.clone().add(V(40, 0, 0)), V(-1, 0, 0), 0, 60);
  const hits = rc.intersectObjects(hub.scene.children, true).filter((h) => (h.object as THREE.Mesh).isMesh && h.object.visible && h.point.x > inner.x + 0.05);
  const p = hits.length ? hits[0].point.clone() : inner.clone().add(V(0.9, 0, 0));
  if (hits[0]?.face) { n.copy(hits[0].face.normal).transformDirection(hits[0].object.matrixWorld); if (n.x < 0.2) n.set(1, 0, 0); }
  return { p, n: n.normalize() };
}
/** UNIT 07's charging cradle: a weighted base, a column, a ring with contacts */
function buildCradle(): THREE.Group {
  const g = new THREE.Group(), k = new Kit(12);
  k.on(g, 0);
  k.cyl(0, 0.04, 0, 0.26, 0.3, 0.08, 18, 'pb1'); k.cyl(0, 0.09, 0, 0.2, 0.24, 0.03, 18, 'st0');
  k.cyl(0, 0.5, 0, 0.045, 0.06, 0.82, 12, 'pb0');
  k.torus(0, 0.93, 0, 0.16, 0.022, 24, 6, 'st0');
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.push(Math.cos(a) * 0.16, 0.95, Math.sin(a) * 0.16).box(0, 0, 0, 0.03, 0.03, 0.03, 'br').pop(); }
  k.hose([0.04, 0.3, 0], [1, -1, 0], [0.3, 0.05, 0.1], [1, 0, 0], 0.014, 'hose');
  k.on(g, 1); k.push(0, 0.42, 0.061).decal(0, 0, 0, 0.07, 0.07, 'cw:capb').pop();
  k.finish(crewMats());
  return g;
}

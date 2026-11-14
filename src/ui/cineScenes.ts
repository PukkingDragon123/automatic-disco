// The scientists' cutscenes, scripted against the Cinema (game/cinema.ts) and staged by the Story (game/story.ts):
//   opening  the U.S.P.C. recovery team's lander comes down near the impact site; the crew search with a Geiger
//            counter and the radio ("Unit Seven, do you copy?") and find the smoking crater
//   contact  they find the head awake; Calder kneels and talks to it; the others fly home, he stays
//   camp     the golem shows Calder a new part of its body ("You built yourself an arm!")
//   beast    night at the camp: something in the dark; Calder runs for the golem and does not make it
//   final    dawn: his last journal entry, and Station Four on the radio
import * as THREE from 'three';
import type { Cinema } from '../game/cinema';
import type { Story } from '../game/story';
import type { Actor } from './cineCast';
import { geiger, flashlight, handset, bloodPool } from './cineCast';
import { makeInstance, type SpeciesModel } from '../life/creatureMesh';
import { Animator } from '../life/anim';
import { SKILL } from '../game/skills';
import { csfx } from './cineAudio';

const V3 = THREE.Vector3;
type V = THREE.Vector3;
export type SceneName = 'opening' | 'contact' | 'camp' | 'beast' | 'final';
const flat = (v: V) => new V3(v.x, 0, v.z);
const horiz = (a: V, b: V) => { const d = new V3(b.x - a.x, 0, b.z - a.z); return d.lengthSq() < 1e-6 ? new V3(0, 0, 1) : d.normalize(); };
const perp = (d: V) => new V3(d.z, 0, -d.x);

/** a camera spot: base + along * a + side * s, at height h above the ground there */
function spot(S: Story, base: V, along: V, a: number, side: V, s: number, h: number) {
  const p = base.clone().addScaledVector(along, a).addScaledVector(side, s);
  p.y = S.ground(p.x, p.z) + h; return p;
}
const up = (p: V, h: number) => p.clone().setY(p.y + h);

/** every actor's head height (a standing adult) */
const HEAD = 1.62;
function headOf(a: Actor) { return new V3(a.x, a.y + (a.full === 'kneel' ? 1.05 : a.full === 'sit' ? 1.0 : HEAD), a.z); }

// ------------------------------------------------------------------ dust, smoke, sparks
function dustRing(S: Story, p: V, r: number, n = 10, col = 0xb8a888) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    S.g.fx.spray(x, S.ground(x, z) + 0.2, z, Math.cos(a), 0.25, Math.sin(a), 4, col, { speed: 3.5, cone: 0.5, size: 4, life: 1.6, grav: -0.2, drag: 1.8 });
  }
}
function smoke(S: Story, p: V, k = 1) {
  if (Math.random() < 0.5 * k) S.g.fx.burst(p.x + (Math.random() - 0.5) * 0.8, p.y, p.z + (Math.random() - 0.5) * 0.8, 1, Math.random() < 0.5 ? 0x5a5650 : 0x3e3a36, { speed: 0.25, up: 1.1, size: 5, life: 2.6, grav: -0.25 });
}
function sparks(S: Story, p: V, n = 6, col = 0xffc850) {
  S.g.fx.burst(p.x, p.y, p.z, n, col, { glow: true, speed: 2.6, up: 2.2, size: 2, life: 0.5, grav: 8 });
}
function lensFlicker(S: Story, p: V, k = 1) {
  const c = new THREE.Color(0x7affe0).multiplyScalar(2.4 * k);
  for (let i = 0; i < 4; i++) S.g.fx.glow.emit(p.x + (Math.random() - 0.5) * 0.08, p.y + (Math.random() - 0.5) * 0.08, p.z + (Math.random() - 0.5) * 0.08, 0, 0.05, 0, c, 1, 3.5 * k, 0.35, 0, 2);
}

// ------------------------------------------------------------------ a puppet beast (the real one is moved aside while it acts)
interface Puppet { mesh: THREE.SkinnedMesh; an: Animator; x: number; z: number; yaw: number; speed: number; state: 'idle' | 'move' | 'attack' | 'eat'; act: number; len: number; hgt: number; update(dt: number): void; eye(out?: V): V; dispose(): void }
function puppet(S: Story, model: SpeciesModel, scale: number): Puppet {
  const inst = makeInstance(model);
  const an = new Animator(model.rig, inst.bones, inst.mesh);
  inst.mesh.scale.setScalar(scale); inst.mesh.castShadow = true;
  S.g.world.scene.add(inst.mesh);
  const P: Puppet = {
    mesh: inst.mesh, an, x: 0, z: 0, yaw: 0, speed: 0, state: 'idle', act: 0, len: model.rig.length * scale, hgt: model.rig.height * scale,
    update(dt) {
      const m = P.mesh; m.position.set(P.x, S.ground(P.x, P.z), P.z); m.rotation.y = P.yaw;
      an.update(dt, { speed: P.speed / scale, turn: 0, state: P.state, act: P.act, lookYaw: 0, lookPitch: 0, ground: (x: number, z: number) => S.ground(x, z), air: 1 } as any);
    },
    eye(out = new V3()) { return out.set(P.x + Math.sin(P.yaw) * P.len * 0.48, S.ground(P.x, P.z) + P.hgt * 0.78, P.z + Math.cos(P.yaw) * P.len * 0.48); },
    dispose() { inst.mesh.removeFromParent(); (inst.mesh.material as THREE.Material).dispose(); inst.mesh.skeleton.dispose(); },
  };
  return P;
}

// ================================================================== OPENING
export async function opening(c: Cinema, S: Story) {
  const G = S.golem(), H = S.golemHead(), Lp = S.landSpot.clone();
  const dL = horiz(G, Lp), pL = perp(dL), toG = dL.clone().negate();
  const L = S.makeLander(); L.root.position.copy(Lp); L.root.rotation.y = Math.atan2(toG.x, toG.z);
  const groundL = S.ground(Lp.x, Lp.z);
  const { hollis, brandt } = S.makeCrew();
  const cal = S.calder;
  for (const a of [cal, hollis, brandt]) { a.visible = false; a.place(Lp.x, Lp.z); }
  const rim = (k: number) => { const p = G.clone().addScaledVector(dL, 4.6).addScaledVector(pL, k); return p; };
  const unreveal = S.reveal(G.x, G.z, 16), unreveal2 = S.reveal(Lp.x, Lp.z, 10);
  S.timeOfDay(0.31);
  c.onEnd(() => {
    L.root.position.set(Lp.x, groundL, Lp.z); L.setFlame(0, 0); L.setHatch(1);
    for (const [a, k] of [[cal, 0], [brandt, -1.6], [hollis, 1.7]] as [Actor, number][]) { a.visible = true; const p = rim(k); a.place(p.x, p.z); a.faceNow(G.x, G.z); a.action = ''; a.full = ''; }
    brandt.hold(geiger()); hollis.hold(handset());
    unreveal2();
    S.revealKeep(G.x, G.z, 12, unreveal);
  });
  c.ui.fade(1, 0);
  await c.wait(0.4);
  await c.card('RECOVERY TEAM', 'STATION FOUR · DAY 21 AFTER IMPACT', 'U.S. PLANETARY CORPS', 3.4, 'CLASSIFIED');
  // ---- 1. Recovery One comes down out of a pale sky
  let alt = 42;
  const engine = c.loop('engine', 0.8), wind = c.loop('drone', 0.35);
  const descent = c.task((_, t) => {
    L.root.position.set(Lp.x, groundL + alt, Lp.z); L.setFlame(alt > 0.05 ? 1 : 0, t);
    if (alt < 7 && Math.random() < 0.5) dustRing(S, Lp, 1.6 + (7 - alt) * 0.5, 4);
    return false;
  });
  c.cam.cut(spot(S, Lp, pL, 15, dL, -6, 1.7), up(Lp, alt), 32);
  c.cam.handheld = 0.04;
  c.cam.track(() => ({ look: L.root.position.clone().setY(L.root.position.y + 2.2) }), 4);
  c.fade(0, 2.2);
  c.stamp('IMPACT ZONE · 06:12 LOCAL');
  c.say('Station Four, this is Recovery One. Beginning descent over the impact zone.', { who: 'Lt. Hollis', style: 'radio', pitch: 0.85 });
  await c.tween(8.5, (u) => { alt = 42 * Math.pow(1 - u, 2.2); }, 'linear');
  descent(); L.root.position.y = groundL; L.setFlame(0, 0);
  engine.stop(1.2);
  c.sfx('thud', 1, 0.7); c.sfx('steam'); c.cam.shake(0.18, 0.5);
  dustRing(S, Lp, 2.2, 14); dustRing(S, Lp, 3.4, 12);
  c.say('Touchdown. Recovery One is on the ground.', { who: 'Lt. Hollis', style: 'radio', pitch: 0.85 });
  await c.wait(2.4);
  // ---- 2. the hatch drops; the team steps out
  c.cam.track(null); c.cam.handheld = 0.02;
  const hatchFront = spot(S, Lp, toG, 6.2, pL, 2.2, 1.3);
  c.cam.cut(hatchFront, up(Lp.clone().addScaledVector(toG, 1.5), 1.5), 30);
  c.sfx('servo'); c.sfx('steam', 0.6);
  await c.tween(1.8, (u) => L.setHatch(u), 'outBack');
  const out = (k: number) => Lp.clone().addScaledVector(toG, 3.6).addScaledVector(pL, k);
  const exitAt = Lp.clone().addScaledVector(toG, 1.9);
  const stepOut = (a: Actor, k: number) => { a.visible = true; a.place(exitAt.x, exitAt.z, Math.atan2(toG.x, toG.z)); const p = out(k); a.walkTo(p.x, p.z, 1.1); };
  stepOut(cal, 0); cal.look = H.clone();
  await c.wait(1.0);
  c.cam.move({ pos: spot(S, Lp, toG, 6.0, pL, 1.0, 1.5), look: up(out(0), 1.5), dur: 4, ease: 'inOut' });
  stepOut(brandt, -1.4); brandt.hold(geiger()); brandt.action = 'scanner';
  await c.wait(0.9);
  stepOut(hollis, 1.5); hollis.hold(handset());
  await c.say('Smell that? Ozone. Something came down hot around here.', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(3, 'think') });
  // ---- 3. the search: Geiger clicks climbing, the radio calling into nothing
  let geigerT = 0;
  c.task((dt) => { const d = Math.hypot(brandt.x - G.x, brandt.z - G.z); geigerT -= dt; if (geigerT <= 0) { c.sfx('geiger', 0.7); geigerT = Math.max(0.03, Math.min(0.6, d * 0.03)) * (0.5 + Math.random()); } return false; });
  for (const [a, k] of [[cal, 0], [brandt, -1.6], [hollis, 1.7]] as [Actor, number][]) { const p = G.clone().addScaledVector(dL, 8.5).addScaledVector(pL, k * 1.2); a.walkTo(p.x, p.z, 1.0); }
  const mid = Lp.clone().lerp(G, 0.45);
  c.cam.cut(spot(S, mid, pL, -6, dL, 1, 1.4), up(Lp.clone().lerp(G, 0.2), 1.3), 36);
  c.cam.handheld = 0.06;
  c.cam.track(() => ({ look: up(new V3((cal.x + brandt.x) / 2, cal.y, (cal.z + brandt.z) / 2), 1.2), pos: spot(S, new V3(brandt.x, 0, brandt.z), pL, -4.6, dL, 2.2, 1.5) }), 1.6);
  await c.say('Counter\'s climbing. Forty... sixty... it\'s off the dial.', { who: 'Dr. Brandt', style: 'film', pitch: 1.35, onShow: () => brandt.talk(3) });
  hollis.gesture('talk', { dur: 3 });
  await c.say('Unit Seven, this is U.S.P.C. Recovery. Do you copy? Over.', { who: 'Lt. Hollis', style: 'radio', pitch: 0.85, onShow: () => hollis.talk(3) });
  c.sfx('static', 0.8, 2.2);
  await c.wait(1.6);
  await c.say('...Nothing, Doc. Not a peep.', { who: 'Lt. Hollis', style: 'film', pitch: 0.85, onShow: () => hollis.talk(2, 'sad') });
  // ---- 4. Calder sees the scorch line
  c.cam.track(null); c.cam.handheld = 0.03;
  cal.walkTo(cal.x, cal.z); cal.arrive(); cal.faceNow(G.x, G.z);
  c.cam.cut(spot(S, new V3(cal.x, 0, cal.z), dL, -2.6, pL, 1.8, 1.55), headOf(cal), 30);
  cal.gesture('point', { at: H });
  await c.say('There. The scorch line. It came in shallow and dug itself a grave.', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(3.5, 'surprised') });
  // ---- 5. the crater: smoke, a dark lens, a heartbeat
  for (const [a, k] of [[cal, 0], [brandt, -1.6], [hollis, 1.7]] as [Actor, number][]) { const p = rim(k); a.walkTo(p.x, p.z, 1.0); }
  c.cam.cut(spot(S, G, pL, 3.6, dL, -1.2, 0.55), H, 34);
  c.cam.handheld = 0.012;
  c.cam.move({ pos: spot(S, G, pL, 2.0, dL, -0.6, 0.9), look: H, fov: 26, dur: 7.5, ease: 'inOut' });
  c.task(() => { smoke(S, up(G, 0.4), 1); return false; });
  c.stamp('IMPACT SITE · 06:42 LOCAL');
  wind.set(0.6);
  for (let i = 0; i < 3; i++) { c.sfx('heart', 0.9); await c.wait(1.25); }
  lensFlicker(S, H, 0.7); c.sfx('hum', 0.6);
  await c.wait(1.0);
  lensFlicker(S, H, 1.1); c.sfx('chime', 0.4, 0.5);
  await c.wait(1.2);
  await c.fade(1, 1.6);
  for (const a of [cal, brandt, hollis]) a.arrive();
  await c.wait(0.4);
}

// ================================================================== FIRST CONTACT
export async function contact(c: Cinema, S: Story) {
  const G = S.golem(), H = S.golemHead();
  const Lp = S.landSpot.clone(), dL = horiz(G, Lp), pL = perp(dL);
  const L = S.makeLander(); L.root.position.set(Lp.x, S.ground(Lp.x, Lp.z), Lp.z); L.root.rotation.y = Math.atan2(G.x - Lp.x, G.z - Lp.z); L.setHatch(1);
  const { hollis, brandt } = S.makeCrew();
  const cal = S.calder;
  const rim = (k: number) => G.clone().addScaledVector(dL, 4.6).addScaledVector(pL, k);
  for (const [a, k] of [[cal, 0], [brandt, -1.6], [hollis, 1.7]] as [Actor, number][]) { a.visible = true; a.dead = false; const p = rim(k); a.place(p.x, p.z); a.faceNow(G.x, G.z); a.look = H.clone(); }
  if (!brandt.rig.heldR.children.length) brandt.hold(geiger());
  if (!hollis.rig.heldR.children.length) hollis.hold(handset());
  brandt.action = 'scanner';
  const kneel = G.clone().addScaledVector(dL, 1.9);
  const unreveal = S.reveal(G.x, G.z, 14), unreveal2 = S.reveal(Lp.x, Lp.z, 10);
  c.onEnd(() => {
    S.dropLander(); S.dropCrew();
    cal.visible = true; cal.full = ''; cal.look = null; const p = G.clone().addScaledVector(dL, 2.6); cal.place(p.x, p.z); cal.faceNow(G.x, G.z);
    unreveal(); unreveal2();
  });
  c.ui.fade(1, 0);
  // ---- 1. through the lens: three shapes on the rim against the sky
  c.ui.root.classList.add('pov');
  c.cam.cut(up(H, 0.05), up(rim(0), 2.2), 56); c.cam.handheld = 0.01;
  c.fade(0, 1.4); c.sfx('hum', 0.7); c.sfx('static', 0.5, 1.5);
  c.stamp('UNIT 07 · OPTICAL · REBOOT', true);
  c.cam.move({ look: up(rim(-1.6), 1.75), fov: 40, dur: 3.2, ease: 'inOut' });
  await c.say('Counter\'s pinned. Doc, don\'t get any closer.', { who: 'Dr. Brandt', style: 'film', pitch: 1.35, onShow: () => brandt.talk(3, 'surprised') });
  c.cam.move({ look: up(rim(0), 1.65), fov: 30, dur: 1.6 });
  await c.wait(1.2);
  c.ui.root.classList.remove('pov'); c.ui.stampOff();
  // ---- 2. Calder climbs down into the crater and kneels in front of it
  c.cam.cut(spot(S, G, pL, 7, dL, 1.4, 2.1), up(G.clone().lerp(rim(0), 0.5), 0.8), 34); c.cam.handheld = 0.03;
  cal.walkTo(kneel.x, kneel.z, 0.9);
  c.cam.track(() => ({ look: up(new V3(cal.x, cal.y, cal.z), 1.1) }), 3);
  c.sfx('crunch', 0.5);
  await c.until(() => !cal.moving, 8);
  cal.arrive(); cal.faceNow(G.x, G.z); cal.full = 'kneel';
  c.cam.track(null);
  await c.wait(0.8);
  // ---- 3. over the golem's shoulder
  const ots = spot(S, G, dL, -2.0, pL, 0.9, 1.55);
  c.cam.cut(ots, headOf(cal), 30); c.cam.handheld = 0.015;
  await c.say('Easy... easy now. It\'s all right.', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(2.5, 'smile') });
  await c.say('Unit Seven? Can you hear me?', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(2, 'think') });
  // ---- 4. the lens wakes
  c.cam.cut(spot(S, G, dL, 1.3, pL, -0.3, 1.25), H, 24);
  c.cam.move({ pos: spot(S, G, dL, 0.9, pL, -0.2, 1.3), fov: 20, dur: 3 });
  c.sfx('hum', 0.8); await c.wait(0.6);
  lensFlicker(S, H, 1); c.sfx('relay'); await c.wait(0.5);
  lensFlicker(S, H, 1.4); c.sfx('chime', 0.6, 0.7); S.golemWave();
  await c.wait(1.6);
  // ---- 5. Calder's face
  c.cam.cut(spot(S, kneel, dL, 1.6, pL, 0.7, 1.15), headOf(cal), 26);
  cal.expr('surprised', 4);
  await c.say('It\'s looking at me. Hollis... it\'s looking at me!', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(3, 'surprised') });
  // ---- 6. the rim: Hollis on the radio
  const hp = new V3(hollis.x, hollis.y, hollis.z);
  c.cam.cut(spot(S, hp, dL, 1.6, pL, -1.6, 1.5), headOf(hollis), 30); c.cam.handheld = 0.03;
  hollis.gesture('talk', { dur: 4 });
  await c.say('Station Four, Recovery. We have Unit Seven. ...What\'s left of it.', { who: 'Lt. Hollis', style: 'radio', pitch: 0.85, onShow: () => hollis.talk(3) });
  // ---- 7. Calder talks to it
  c.cam.cut(spot(S, kneel, pL, 2.4, dL, -0.6, 1.0), up(G.clone().lerp(kneel, 0.5), 0.95), 32); c.cam.handheld = 0.015;
  c.cam.move({ pos: spot(S, kneel, pL, 1.8, dL, -0.4, 1.05), dur: 9, ease: 'linear' });
  await c.say('The impact took everything but your head, didn\'t it? Your body\'s out there in pieces.', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(4, 'sad') });
  cal.gesture('present', { dur: 3 });
  await c.say('Then we build you a new one. Ore, carbon, water, soil: this ground has all of it. Pull it in. Grow.', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(4.5, 'smile') });
  // ---- 8. orders from orbit
  c.sfx('static', 0.7, 1.2);
  await c.say('Recovery One, Station Four. Crate the unit and return to orbit. Over.', { who: 'Station Four', style: 'radio', pitch: 0.7 });
  cal.full = ''; await c.wait(0.6);
  cal.faceNow(hollis.x, hollis.z); cal.look = headOf(hollis);
  c.cam.cut(spot(S, kneel, dL, -1.4, pL, -1.2, 1.6), headOf(cal), 30);
  await c.say('No. It\'s awake. Tell them it\'s awake.', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(2.5, 'angry') });
  c.cam.cut(spot(S, hp, dL, 2.0, pL, 1.0, 1.55), headOf(hollis), 32);
  await c.say('Lander\'s got fuel for one hop, Doc. We go now, or we don\'t go.', { who: 'Lt. Hollis', style: 'film', pitch: 0.85, onShow: () => hollis.talk(3) });
  c.cam.cut(spot(S, kneel, dL, -1.4, pL, -1.2, 1.6), headOf(cal), 28);
  await c.say('Then go. I\'m staying with Seven.', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(2.5, 'smile') });
  const bp = new V3(brandt.x, brandt.y, brandt.z);
  c.cam.cut(spot(S, bp, dL, 2.0, pL, -1.0, 1.5), headOf(brandt), 32);
  brandt.action = '';
  await c.say('Thirty days. We\'ll come back for you both.', { who: 'Dr. Brandt', style: 'film', pitch: 1.35, onShow: () => brandt.talk(2.5, 'sad') });
  // ---- 9. Recovery One leaves
  const hatchAt = Lp.clone().addScaledVector(dL.clone().negate(), 2.0);
  hollis.walkTo(hatchAt.x + pL.x * 0.4, hatchAt.z + pL.z * 0.4, 1.5); brandt.walkTo(hatchAt.x - pL.x * 0.4, hatchAt.z - pL.z * 0.4, 1.5);
  cal.look = up(Lp, 3);
  c.cam.cut(spot(S, G, dL, -3.4, pL, -1.6, 1.7), up(Lp, 2.4), 38); c.cam.handheld = 0.03;
  await c.until(() => !hollis.moving && !brandt.moving, 9);
  hollis.visible = false; brandt.visible = false; hollis.arrive(); brandt.arrive();
  c.sfx('servo');
  await c.tween(1.4, (u) => L.setHatch(1 - u));
  cal.gesture('wave', { dur: 3 });
  const engine = c.loop('engine', 0.9);
  c.sfx('ignite', 0.8);
  let alt = 0;
  const g0 = S.ground(Lp.x, Lp.z);
  c.task((_, t) => { L.root.position.y = g0 + alt; L.setFlame(1, t); if (alt < 5 && Math.random() < 0.6) dustRing(S, Lp, 2 + alt * 0.6, 4); return false; });
  c.cam.track(() => ({ look: L.root.position.clone().setY(L.root.position.y + 2) }), 2.5);
  c.cam.shake(0.12, 1.2);
  await c.tween(7, (u) => { alt = 60 * Math.pow(u, 2.1); }, 'linear');
  engine.stop(2.5);
  c.cam.track(null);
  // ---- 10. just the two of them
  cal.faceNow(G.x, G.z); cal.look = H.clone();
  c.cam.cut(spot(S, G, pL, 3.2, dL, 0.6, 1.3), up(G.clone().lerp(new V3(cal.x, cal.y, cal.z), 0.5), 1.15), 34);
  c.cam.move({ pos: spot(S, G, pL, 4.6, dL, 0.9, 1.8), dur: 6, ease: 'inOut' });
  await c.say('Well. Just you and me, big fella. Let\'s get you a body.', { who: 'Dr. Calder', style: 'film', onShow: () => { cal.talk(3, 'smile'); cal.gesture('nod'); } });
  await c.fade(1, 1.2);
  await c.card('ODDWORLD', 'TAKE THIS WORLD FOR HUMANITY', 'U.S.P.C. · UNIT 07', 3.2, 'UNIT 07');
  c.fade(0, 1.0);
}

// ================================================================== CAMP: the golem shows Calder a new part
const PART_LINES: Record<string, [string, string, string]> = {
  torso: ['CORE HOUSING', 'Look at you. A chest! With a porthole, and the reactor glowing in there like a furnace.', 'Now you\'ve got somewhere to keep what you gather. Arms next, I\'d think.'],
  armR: ['RIGHT ARM', 'You built yourself an arm! Stones and pistons, and you put it together yourself.', 'Go on, make a fist. ...Ha! Remind me never to shake hands with you.'],
  armL: ['LEFT ARM', 'Two arms. Now you can really lift something.', 'Careful with those. You\'ll flatten my tent.'],
  coil: ['GRAVITY COIL', 'That coil! You\'re riding the field like a gull on the wind.', 'They said the coil would never work outside a lab. Washington owes me twenty dollars.'],
  colossus: ['COLOSSUS FRAME', 'You\'re... taller than the lander was.', 'When they come back, they won\'t believe it\'s you. I\'m not sure I do.'],
  plating1: ['PLATE STEEL', 'Corps plate! You found a way to roll steel out of ore.', 'You look like a battleship. A small, angry battleship.'],
  reactor: ['REACTOR BLOOM', 'The core\'s burning hotter. I can feel it on my face from here.', 'Don\'t let that thing run away with you, Seven.'],
};
export const CAMP_PARTS = Object.keys(PART_LINES);
export async function camp(c: Cinema, S: Story, part = 'armR') {
  const L = PART_LINES[part] ?? [SKILL[part]?.name.toUpperCase() ?? 'NEW PART', 'Something new. You keep surprising me.', 'Show me again tomorrow.'];
  const G = S.golem(), H = S.golemHead(), cal = S.calder;
  const toCamp = horiz(G, new V3(S.camp.x, 0, S.camp.z)), side = perp(toCamp);
  const P = G.clone().addScaledVector(toCamp, 3.6);
  const unreveal = S.reveal(G.x, G.z, 8);
  c.onEnd(() => { cal.full = ''; cal.look = null; unreveal(); });
  // ---- 1. a slow orbit round the new part; sparks as it seats itself
  const a0 = Math.atan2(side.x, side.z);
  c.cam.handheld = 0.012; c.cam.fov = 36; c.cam.roll = 0;
  c.cam.orbit({ center: new V3(G.x, H.y - 0.6, G.z), radius: 2.8, height: 0.7, from: a0, to: a0 + 1.3, dur: 4.2, radiusTo: 2.3 });
  c.stamp(`${L[0]} · ONLINE`);
  c.sfx('servo', 0.9); c.sfx('clamp', 0.8);
  c.task((_, t) => { if (t < 2.2 && Math.random() < 0.3) sparks(S, new V3(G.x + (Math.random() - 0.5) * 0.9, H.y - 0.5 - Math.random() * 0.6, G.z + (Math.random() - 0.5) * 0.9), 3); return t > 2.4; });
  await c.wait(1.2); c.sfx('relay'); await c.wait(1.0); c.sfx('clamp', 0.6, 1.2); c.sfx('chime', 0.5);
  // Calder has come over to look
  cal.visible = true; cal.place(P.x, P.z); cal.faceNow(G.x, G.z); cal.look = H.clone(); cal.full = '';
  await c.wait(1.8);
  // ---- 2. his reaction, over the golem's shoulder
  c.cam.cut(spot(S, G, toCamp, -1.6, side, 1.0, 1.6), headOf(cal), 30);
  c.cam.move({ pos: spot(S, G, toCamp, -1.2, side, 0.8, 1.55), dur: 8, ease: 'linear' });
  cal.gesture(part === 'colossus' ? 'shrug' : 'present', { dur: 3 });
  await c.say(L[1], { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(4, 'surprised') });
  c.cam.cut(spot(S, P, toCamp, 1.9, side, -0.8, 1.45), up(G.clone().lerp(P, 0.45), 1.25), 32);
  cal.gesture(part === 'armR' ? 'point' : 'nod', { at: H, dur: 2.5 });
  await c.say(L[2], { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(4, 'smile') });
  await c.wait(0.4);
}

// ================================================================== THE BEAST
export async function beast(c: Cinema, S: Story) {
  const cal = S.calder, Cp = new V3(S.camp.x, 0, S.camp.z); Cp.y = S.ground(Cp.x, Cp.z);
  const G = S.golem(), toG = horiz(Cp, G), side = perp(toG);
  const seat = S.campSeat();
  const prey = S.beastModel();
  const B = puppet(S, prey.model, prey.scale);
  const darkDir = toG.clone().negate().applyAxisAngle(new V3(0, 1, 0), 0.5);
  const lair = Cp.clone().addScaledVector(darkDir, 15);
  B.x = lair.x; B.z = lair.z; B.yaw = Math.atan2(Cp.x - lair.x, Cp.z - lair.z); B.mesh.visible = false;
  c.task((dt) => { B.update(dt); return false; });
  const unreveal = S.reveal(Cp.x, Cp.z, 18);
  const restoreNight = S.timeOfDay(0.9);
  S.campFire(true);
  const fl = flashlight(); fl.light.intensity = 0;
  let deathAt: V | null = null, pool: ReturnType<typeof bloodPool> | null = null;
  c.onEnd(() => {
    if (!cal.dead) {
      deathAt = deathAt ?? Cp.clone().addScaledVector(toG, 4.2);
      cal.place(deathAt.x, deathAt.z); cal.visible = true; cal.die(Cp, 3);
    }
    cal.rig.setCondition({ blood: { torso_u: 3, torso_l: 2, uarm_l: 2, head: 1, thigh_l: 1 }, pale: 2, expr: 'pain' } as any);
    if (!pool && deathAt) { pool = bloodPool(deathAt.x, S.ground(deathAt.x, deathAt.z), deathAt.z, 0.9); S.g.world.scene.add(pool.mesh); S.props.push(pool.mesh); }
    pool?.grow(1);
    S.releaseBeast(new V3(B.x, 0, B.z).addScaledVector(darkDir, 6));
    B.dispose(); fl.light.intensity = 0; cal.hold(null); cal.light = false;
    unreveal(); restoreNight();
    S.calderDied(deathAt ?? new V3(cal.x, cal.y, cal.z));
  });
  c.ui.fade(1, 0);
  const night = c.loop('night', 0.8), fire = c.loop('fire', 0.6);
  // ---- 1. the camp at night: Calder by the fire with his journal
  cal.visible = true; cal.place(seat.x, seat.z); cal.faceNow(Cp.x, Cp.z); cal.full = 'sit'; cal.action = 'read'; cal.look = null;
  cal.hold(fl.g, 'R', 'along'); // in his hand, off (a light added mid-scene would stall every shader)
  c.cam.cut(spot(S, Cp, toG, -7.5, side, 3.5, 1.4), up(Cp, 0.8), 34);
  c.cam.handheld = 0.01;
  c.cam.move({ pos: spot(S, Cp, toG, -4.6, side, 2.2, 1.25), look: up(new V3(seat.x, 0, seat.z).setY(Cp.y), 0.9), dur: 11, ease: 'inOut' });
  c.fade(0, 2);
  c.stamp('CALDER\'S CAMP · NIGHT 14');
  await c.wait(1.6);
  await c.say('Day fourteen. Seven learns faster than I can write it down. Tonight it watched the stars with me.', { who: 'Field journal', style: 'journal', voice: false, hold: 0.6 });
  await c.say('I think it knows which one is home.', { who: 'Field journal', style: 'journal', voice: false, hold: 0.4 });
  // ---- 2. a branch snaps; the crickets stop
  c.sfx('crunch', 0.7); night.set(0.05);
  await c.wait(0.8);
  cal.action = ''; cal.look = up(lair, 1); cal.expr('surprised', 5);
  c.cam.cut(spot(S, new V3(seat.x, 0, seat.z), toG, 1.2, side, -0.9, 1.05), up(new V3(seat.x, Cp.y, seat.z), 1.0), 28);
  await c.say('...Seven? Is that you?', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(1.5, 'surprised') });
  // ---- 3. the flashlight
  cal.full = ''; await c.wait(0.7);
  cal.light = true; fl.light.intensity = 16; c.sfx('switch', 0.8);
  cal.faceNow(lair.x, lair.z); cal.walkTo(seat.x + darkDir.x * 1.2, seat.z + darkDir.z * 1.2, 0.6);
  const behind = () => spot(S, new V3(cal.x, 0, cal.z), darkDir, -2.1, side, 0.6, 1.75);
  c.cam.cut(behind(), up(lair, 0.6), 38); c.cam.handheld = 0.045;
  c.cam.track(() => ({ pos: behind() }), 3);
  let sweep = 0;
  const sw = c.task((dt, t) => { sweep = Math.sin(t * 0.9) * 0.7; cal.yaw = Math.atan2(darkDir.x, darkDir.z) + sweep; return false; });
  let beat = 0; c.task((dt) => { beat -= dt; if (beat <= 0) { c.sfx('heart', 0.8); beat = 0.85; } return false; });
  await c.wait(2.6);
  // eyes in the beam
  B.mesh.visible = true; B.x = lair.x + darkDir.x * -3; B.z = lair.z + darkDir.z * -3; B.state = 'idle';
  c.task(() => { const e = B.eye(); S.g.fx.glow.emit(e.x, e.y, e.z, 0, 0, 0, new THREE.Color(0xffc040).multiplyScalar(3), 1, 3, 0.06); return false; });
  sw(); cal.yaw = Math.atan2(B.x - cal.x, B.z - cal.z);
  c.cam.move({ look: up(new V3(B.x, Cp.y, B.z), B.hgt * 0.7), fov: 26, dur: 1.4 });
  c.sfx('roar', 0.35, 1.4); c.sfx('stingDark', 0.8);
  await c.say('Easy... easy...', { who: 'Dr. Calder', style: 'film', onShow: () => cal.talk(1.5, 'fear') });
  // ---- 4. he runs for the golem; it comes out of the dark
  c.cam.track(null);
  const run = Cp.clone().addScaledVector(toG, 9);
  cal.panic = 1; cal.walkTo(run.x, run.z, 3.8);
  c.say('SEVEN!', { who: 'Dr. Calder', style: 'film', pitch: 1.2, onShow: () => cal.talk(1, 'fear') });
  c.sfx('roar', 1, 0.9);
  B.state = 'move';
  let caught = false;
  c.task((dt) => {
    if (caught) return true;
    const dx = cal.x - B.x, dz = cal.z - B.z, d = Math.hypot(dx, dz);
    B.yaw = Math.atan2(dx, dz); B.speed = 7.2;
    const s = Math.min(d, B.speed * dt); B.x += (dx / d) * s; B.z += (dz / d) * s;
    if (d < 1.0 + B.len * 0.35) caught = true;
    return false;
  });
  c.cam.cut(spot(S, Cp, side, -6.5, toG, 2.8, 0.8), up(Cp.clone().addScaledVector(toG, 2.5), 1.0), 40);
  c.cam.handheld = 0.07;
  c.cam.track(() => ({ look: up(new V3((cal.x + B.x) / 2, Cp.y, (cal.z + B.z) / 2), 1.0) }), 5);
  await c.until(() => caught, 6);
  // ---- 5. the pounce
  deathAt = new V3(cal.x, S.ground(cal.x, cal.z), cal.z);
  B.state = 'attack'; B.speed = 0; c.tween(0.6, (u) => (B.act = u), 'linear');
  c.flash('#b01e10', 0.45, 0.8);
  c.sfx('roar', 1, 1.1); c.sfx('splat', 1); c.sfx('scream', 0.7);
  c.cam.track(null); c.cam.shake(0.5, 0.7);
  cal.die(new V3(B.x, 0, B.z), 6);
  fl.light.intensity = 6;
  const chest = up(deathAt, 1.1);
  S.g.fx.spray(chest.x, chest.y, chest.z, Math.sin(B.yaw), 0.5, Math.cos(B.yaw), 26, 0x9a1a10, { speed: 5, cone: 0.7, size: 4, life: 1.2, grav: 9, drag: 0.6 });
  S.g.fx.burst(chest.x, chest.y, chest.z, 22, 0x6e0e08, { speed: 3, up: 2.5, size: 3, life: 1.1, grav: 9 });
  S.gore(deathAt.x, deathAt.z);
  pool = bloodPool(deathAt.x, deathAt.y, deathAt.z, 0.9); S.g.world.scene.add(pool.mesh); S.props.push(pool.mesh);
  c.tween(5, (u) => pool!.grow(0.2 + u * 0.8), 'out');
  c.cam.cut(spot(S, deathAt, side, 2.6, toG, -1.4, 0.45), up(deathAt, 0.6), 30);
  await c.wait(1.6);
  await c.fade(1, 0.08);
  fire.set(0.2); night.set(0);
  await c.wait(1.4);
  // ---- 6. too late: the golem's lens on the camp; the beast over him, then gone into the dark
  B.state = 'eat'; B.act = 0;
  const Gh = S.golemHead();
  c.ui.root.classList.add('pov');
  c.cam.cut(up(Gh, 0.1), up(deathAt, 0.6), 22); c.cam.handheld = 0.02;
  c.fade(0, 0.6);
  c.sfx('hum', 0.8); c.sfx('stingDark', 0.6, 0.8);
  await c.wait(2.4);
  B.state = 'move';
  const away = deathAt.clone().addScaledVector(darkDir, 12);
  c.task((dt) => { const dx = away.x - B.x, dz = away.z - B.z, d = Math.hypot(dx, dz); if (d < 0.3) { B.speed = 0; return true; } B.yaw = Math.atan2(dx, dz); B.speed = 3.2; B.x += (dx / d) * B.speed * dt; B.z += (dz / d) * B.speed * dt; return false; });
  await c.wait(3);
  c.ui.root.classList.remove('pov');
  c.cam.cut(spot(S, deathAt, toG, -2.4, side, 1.4, 1.0), up(deathAt, 0.3), 32); c.cam.handheld = 0.01;
  c.cam.move({ pos: spot(S, deathAt, toG, -1.6, side, 0.9, 1.9), dur: 9, ease: 'inOut' });
  c.sfx('static', 0.6, 1.6);
  await c.say('Calder, this is Station Four. Do you copy? ...Calder?', { who: 'Station Four', style: 'radio', pitch: 0.7 });
  await c.wait(1.2);
  await c.fade(1, 2);
  await c.card('DR. EDWIN CALDER', '1911 – 1957', 'U.S. PLANETARY CORPS', 3, 'IN MEMORIAM');
  c.fade(0, 1.2);
}

// ================================================================== FINAL: the journal and the radio
export async function final(c: Cinema, S: Story) {
  const Cp = new V3(S.camp.x, 0, S.camp.z); Cp.y = S.ground(Cp.x, Cp.z);
  const G = S.golem(), toG = horiz(Cp, G), side = perp(toG);
  const book = S.campProp('book'), radio = S.campProp('radio');
  const unreveal = S.reveal(Cp.x, Cp.z, 18);
  const restore = S.timeOfDay(0.27);
  c.onEnd(() => { unreveal(); restore(); });
  c.ui.fade(1, 0);
  const wind = c.loop('drone', 0.4);
  // ---- 1. dawn over the camp: a cold fire, a tent, a table
  c.cam.cut(spot(S, Cp, toG, 7.5, side, -4.5, 3.2), up(Cp, 0.5), 36); c.cam.handheld = 0.008;
  c.cam.move({ pos: spot(S, Cp, toG, 4.4, side, -2.4, 2.0), dur: 9, ease: 'inOut' });
  S.campFire(false);
  c.task(() => { smoke(S, up(Cp, 0.3), 0.35); return false; });
  c.fade(0, 2.4);
  c.stamp('CALDER\'S CAMP · DAWN');
  await c.wait(4.5);
  // ---- 2. the journal, open on the field table
  c.cam.cut(up(book, 0.75).addScaledVector(toG, 0.35), book, 34);
  c.cam.move({ pos: up(book, 0.55).addScaledVector(toG, 0.25), dur: 16, ease: 'linear' });
  c.sfx('page', 0.6);
  await c.say('Final entry. If the Corps finds this: Unit Seven is not just a weapon. It learns. It chose to keep me company.', { who: 'Field journal · E. Calder', style: 'journal', voice: false, hold: 0.8 });
  c.sfx('page', 0.5);
  await c.say('It rebuilt itself out of rock and river mud, piece by piece, and every piece it showed me first, like a child with a drawing.', { who: 'Field journal · E. Calder', style: 'journal', voice: false, hold: 0.8 });
  await c.say('Don\'t crate it. Don\'t take it apart. Let it finish what we sent it here to do.', { who: 'Field journal · E. Calder', style: 'journal', voice: false, hold: 0.6 });
  await c.say('Finish the job, Seven. Take this world home for us.', { who: 'Field journal · E. Calder', style: 'journal', voice: false, hold: 1.0 });
  // ---- 3. the radio crackles
  c.cam.cut(up(radio, 0.5).addScaledVector(side, 0.6).addScaledVector(toG, 0.4), radio, 30);
  c.sfx('static', 0.9, 2.2); await c.wait(1.2);
  const radioLoop = c.loop('radio', 0.5);
  await c.say('Station Four to Recovery camp. Doc, do you copy? We are inbound in nine days. ...Doc?', { who: 'Lt. Hollis · Station Four', style: 'radio', pitch: 0.85 });
  await c.wait(0.8);
  await c.say('Seven... if that\'s you on this channel. We\'re coming back. Hold the ground for us.', { who: 'Lt. Hollis · Station Four', style: 'radio', pitch: 0.85 });
  radioLoop.stop(1);
  // ---- 4. crane up over the valley at dawn
  c.cam.cut(spot(S, Cp, toG, -2.0, side, 3.0, 2.0), up(Cp.clone().lerp(G, 0.5), 0.6), 40);
  c.cam.move({ pos: spot(S, Cp, toG, -14, side, 10, 18), look: up(Cp.clone().lerp(G, 0.6), 0), fov: 46, dur: 9, ease: 'inOut' });
  wind.set(0.8); csfx('swell', 0.6);
  await c.wait(6.5);
  await c.fade(1, 1.8);
  await c.card('FOR CALDER', 'HOLD THE GROUND', 'U.S.P.C. · UNIT 07', 3.2, 'RECEIVED');
  c.fade(0, 1.4);
}

export const SCENES: Record<SceneName, (c: Cinema, S: Story, arg?: string) => Promise<void>> = { opening, contact, camp, beast, final };
void flat;

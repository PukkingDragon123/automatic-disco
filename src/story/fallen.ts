// THE TEAMMATES' DEATH (scripted, once). After the colony's first real milestone a storm takes the relay mast that
// links the pod to the Meridian. Without it there are no quotas, no drops, no voice from the ship. The two crew who
// came down with the pod walk out into the storm to fix it, 41 metres out: beyond the reach of every arm Unit 07
// has, and Unit 07 cannot move. They get the link back up. The mast takes the lightning with them still on it.
// The relay carries their last words to the ship. Then a decision about what is left of them.
import * as THREE from 'three';
import type { Cinema } from '../game/cinema';
import type { EventDef, EvCtx } from './events';
import { spot } from './events';
import * as E from './effects';
import { anyG, pick, itemName } from '../research/util';
import { ROSTER, TEAMMATES, SHIP_NAME } from '../ship/crew/roster';

import { buildCrewModel } from '../ship/crew/model';
import { flashlight } from '../ui/cineCast';

const V3 = THREE.Vector3;
type V = THREE.Vector3;
interface Walker { name: string; readonly x: number; readonly z: number; root: THREE.Object3D | null; dead: boolean; go(x: number, z: number, face: V): void; die(from: V): void; tick(dt: number): void }
/** the relay mast: a lattice tower with a dish, a junction box and an aircraft lamp */
function relayMast() {
  const g = new THREE.Group(), m = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const steel = m(0x5f6261), dark = m(0x2b2e31), olive = m(0x4d5038), red = m(0xb8382e);
  const H = 9;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, H, 0.09), steel); leg.position.set(sx * 0.45, H / 2, sz * 0.45); leg.rotation.set(sz * 0.03, 0, -sx * 0.03); g.add(leg); }
  for (let k = 0; k < 7; k++) { const y = 0.6 + k * 1.25, w = 0.9 - k * 0.04; for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w * 1.4, 0.05, 0.05), dark); b.position.y = y; b.rotation.set(0, r, 0.6); g.add(b); } const ring = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, w), steel); ring.scale.set(1, 1, 1); ring.position.y = y; (ring.material as THREE.Material) = steel; g.add(ring); }
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.25, 0.3, 10), m(0xc3bdab)); dish.rotation.x = Math.PI / 2.6; dish.position.set(0, H - 1.1, 0.55); g.add(dish);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.35), olive); box.position.set(0, 1.1, 0.62); g.add(box);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.37), red); band.position.set(0, 1.4, 0.62); g.add(band);
  const lampM = new THREE.MeshBasicMaterial({ color: 0xff4030 }); const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), lampM); lamp.position.y = H + 0.1; lamp.userData.keep = true; g.add(lamp);
  const light = new THREE.PointLight(0xff4030, 3, 10); light.position.y = H + 0.2; g.add(light);
  const fire = new THREE.PointLight(0xff7a30, 0, 16); fire.position.set(0, H - 1, 0); g.add(fire);
  return { g, lamp: lampM, light, fire, H };
}
/** a memorial: two cairns of stacked stones with a strip of hull plate between them */
export function memorial() {
  const g = new THREE.Group(), stone = new THREE.MeshLambertMaterial({ color: 0x6d6a62, flatShading: true }), plate = new THREE.MeshLambertMaterial({ color: 0x8d8f8a, flatShading: true });
  for (const sx of [-0.7, 0.7]) for (let k = 0; k < 4; k++) { const s = 0.42 - k * 0.08; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stone); r.position.set(sx + (k % 2 ? 0.04 : -0.03), 0.2 + k * 0.28, (k % 2) * 0.03); r.rotation.set(k, k * 2, 0); g.add(r); }
  const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.06), plate); p.position.set(0, 0.45, 0.25); p.rotation.x = -0.25; g.add(p);
  return g;
}

/** a colony teammate, driven through its script API (it walks on the sim clock) */
function colonyWalker(t: any): Walker {
  return {
    name: t.name, get x() { return t.x; }, get z() { return t.z; }, root: t.root ?? null, dead: false,
    go(x, z, f) { void t.script?.([{ walkTo: [x, z], run: true }, { face: [f.x, f.z] }, { anim: 'kneel' }]); },
    die() { this.dead = true; try { t.kill?.('lightning'); } catch (e) { console.error('teammate kill', e); } },
    tick() { /* the colony moves them */ },
  };
}
/** a stand-in body (the crew agent's model when it builds, a capsule otherwise), walked by the scene itself */
function standIn(st: EvCtx['st'], id: string, scene: THREE.Object3D, x0: number, z0: number): Walker {
  const def = (ROSTER as Record<string, any>)[id];
  let root: THREE.Object3D, upd: (dt: number, sp: number) => void, die: (from: V) => void;
  try {
    const cm = buildCrewModel(id as never);
    root = cm.root; upd = (dt, sp) => cm.update(dt, { speed: sp } as never); die = (from) => cm.die('lightning', from, 6);
  } catch (e) {
    console.warn('fallen: stand-in body', e);
    const gr = new THREE.Group(); const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.0, 4, 8), new THREE.MeshLambertMaterial({ color: 0x2c3a4c })); b.position.y = 0.85; gr.add(b); root = gr;
    upd = () => {}; die = () => { gr.rotation.x = -Math.PI / 2; gr.position.y += 0.2; };
  }
  scene.add(root); st.props.push(root);
  let x = x0, z = z0, yaw = 0, goal: [number, number] | null = null, face: V | null = null;
  root.position.set(x, st.ground(x, z), z);
  const w: Walker = {
    name: def?.name ?? id, get x() { return x; }, get z() { return z; }, root, dead: false,
    go(gx, gz, f) { goal = [gx, gz]; face = f; },
    die(from) { this.dead = true; die(from); },
    tick(dt) {
      let sp = 0;
      if (!this.dead && goal) { const dx = goal[0] - x, dz = goal[1] - z, d = Math.hypot(dx, dz); if (d > 0.15) { sp = Math.min(2.2, d * 2); x += (dx / d) * sp * dt; z += (dz / d) * sp * dt; yaw = Math.atan2(dx, dz); } else if (face) yaw = Math.atan2(face.x - x, face.z - z); }
      root.position.set(x, st.ground(x, z), z); root.rotation.y = yaw; upd(dt, sp);
    },
  };
  return w;
}

export const FALLEN: EventDef = {
  id: 'fallen', title: 'RELAY MAST 2', kicker: 'IN MEMORIAM', once: true,
  weight: () => 0,
  setup: (x) => {
    const g = anyG(x.g), tms = (g.colony?.teammates ?? []) as any[];
    const ids = TEAMMATES as string[], live = tms.filter((t) => t && t.alive !== false);
    x.data.ids = ids;
    // the two on the ground: the colony's own teammates when they exist (the engineer does the repair), else the roster
    x.data.real = live.length >= 2 ? [live.find((t) => t.role === 'engineer') ?? live[0], live.find((t) => t.role !== 'engineer') ?? live[1]] : null;
    x.data.names = x.data.real ? x.data.real.map((t: any) => t.name) : ids.map((id) => (ROSTER as Record<string, any>)[id]?.name ?? id);
    // the mast: 41 m out, on open ground away from the works
    const P = x.st.pod(); let best = 0, bs = -1e9;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, q = spot(x.st, P, a, 41, 0); const s = -Math.abs(q.y - P.y) * 2 - E.buildings(x.g).filter((b) => Math.hypot(b.x - q.x, b.z - q.z) < 8).length * 5; if (s > bs) { bs = s; best = a; } }
    x.data.a = best;
    x.data.mastAt = spot(x.st, P, best, 41, 0);
  },
  async cine(c: Cinema, x: EvCtx) {
    const { st, g } = x, G = anyG(g), P = st.pod(), M: V = x.data.mastAt, a: number = x.data.a;
    const scene = G.world.scene as THREE.Scene;
    const mast = relayMast(); mast.g.position.copy(M); mast.g.rotation.y = a + Math.PI; scene.add(mast.g); st.props.push(mast.g);
    // the colony's own lowpix relay mast (src/colony/models.ts, tools/lowpix/st_relay.json) replaces the stand-in tower
    void import('../colony/models').then(async (mm) => {
      const r = await mm.lowpixModel?.('st_relay', { height: mast.H + 0.6, origin: 'ground' });
      if (!r) return;
      for (const ch of mast.g.children) if ((ch as THREE.Mesh).isMesh && !ch.userData.keep) ch.visible = false;
      mast.g.add(r);
    }).catch(() => { /* the stand-in stays */ });
    G.climate?.force?.(null, 'storm');
    const start = spot(st, P, a, 4, 0), dir = new V3(Math.sin(a), 0, Math.cos(a)), side = new V3(dir.z, 0, -dir.x);
    // the colony's teammates walk it themselves (staged: their AI stands down); without a colony, stand-ins do
    const real = x.data.real as any[] | null;
    if (real) { try { G.colony?.stageTeammates?.(true); } catch { /* colony */ } for (const t of real) { t.x = start.x + (t === real[0] ? 1 : -1) * side.x * 0.7; t.z = start.z + (t === real[0] ? 1 : -1) * side.z * 0.7; } }
    const A: Walker = real ? colonyWalker(real[0]) : standIn(st, x.data.ids[0], scene, start.x + side.x * 0.7, start.z + side.z * 0.7);
    const B: Walker = real ? colonyWalker(real[1]) : standIn(st, x.data.ids[1], scene, start.x - side.x * 0.7, start.z - side.z * 0.7);
    // the decision console comes after the deaths: the sim must run while they walk out
    const wasPaused = G.paused; G.paused = false; c.onEnd(() => { G.paused = wasPaused; });
    const lights: THREE.SpotLight[] = [];
    for (const w of [A, B]) { if (!w.root) continue; try { const f = flashlight(); w.root.add(f.g); f.g.position.set(0.25, 1.15, 0.25); f.light.intensity = 9; f.light.distance = 18; lights.push(f.light); st.props.push(f.g); } catch { /* prop */ } }
    const goal = (w: Walker) => { const s = w === A ? 1 : -1; return new V3(M.x - dir.x * 2.2 + side.x * s * 0.8, 0, M.z - dir.z * 2.2 + side.z * s * 0.8); };
    const walkTo = [goal(A), goal(B)];
    c.task((dt, t) => { lamp(mast, t); A.tick(dt); B.tick(dt); });
    const rain = c.loop('night', 0.9);
    // 1. the pod in the storm
    c.cam.cut(spot(st, P, a + 2.6, 15, 3.5), P.clone().setY(P.y + 2), 42);
    await c.fade(0, 1.4);
    c.stamp(`22:40 · RELAY MAST 2 · 41 M FROM THE POD`, true);
    c.cam.move({ pos: spot(st, P, a + 2.2, 9, 2.4), look: P.clone().setY(P.y + 1.4), dur: 7, ease: 'inOut' });
    await c.say(`Seven, the relay's dead. The Meridian can't hear a thing we send.`, { who: x.data.names[1].toUpperCase(), style: 'radio', pitch: 0.9 });
    await c.say('Wind is at ninety. Wait for the cell to pass.', { who: 'UNIT 07', style: 'plain' });
    await c.say(`The quota window closes in an hour. We go now, we're back in twenty.`, { who: x.data.names[0].toUpperCase(), style: 'radio', pitch: 1.12 });
    // 2. they walk out
    A.go(walkTo[0].x, walkTo[0].z, M); B.go(walkTo[1].x, walkTo[1].z, M);
    c.cam.track(() => ({ pos: new V3((A.x + B.x) / 2 - dir.x * 4.5 + side.x * 1.6, st.ground(A.x, A.z) + 2.0, (A.z + B.z) / 2 - dir.z * 4.5 + side.z * 1.6), look: new V3((A.x + B.x) / 2 + dir.x * 6, st.ground(A.x, A.z) + 1.3, (A.z + B.z) / 2 + dir.z * 6) }), 3);
    await c.wait(1.5);
    c.flash('#dfe8ff', 0.3, 0.7); c.sfx('boom', 0.6, 0.7);
    await c.say('Lights on. Stay on my left.', { who: x.data.names[1].toUpperCase(), style: 'radio', pitch: 0.9 });
    await c.wait(3);
    // 3. Unit 07 cannot follow
    c.cam.track(null);
    c.cam.cut(spot(st, P, a + Math.PI, 6, 2.4), M.clone().setY(M.y + 2), 34);
    c.stamp('ARM REACH 18 M  ·  DISTANCE 41 M  ·  POD ANCHORED');
    c.sfx('servo', 0.8, 0.7);
    c.cam.move({ pos: spot(st, P, a + Math.PI, 4, 2.0), fov: 26, dur: 5, ease: 'inOut' });
    await c.say('I cannot reach that far. I cannot follow you.', { who: 'UNIT 07', style: 'plain' });
    await c.until(() => Math.hypot(walkTo[0].x - A.x, walkTo[0].z - A.z) < 0.6, 26);
    // 4. at the mast
    c.cam.cut(spot(st, M, a + Math.PI + 0.7, 5.5, 1.5), M.clone().setY(M.y + 1.4), 40);
    c.cam.move({ pos: spot(st, M, a + Math.PI + 0.5, 4.2, 1.2), dur: 8, ease: 'inOut' });
    await c.say(`Panel's open. It's the coupler. Two minutes.`, { who: x.data.names[0].toUpperCase(), style: 'radio', pitch: 1.12 });
    c.flash('#dfe8ff', 0.25, 0.6); c.sfx('boom', 0.7, 0.6); c.cam.shake(0.2, 0.6);
    await c.say(`${String(x.data.names[0]).split(' ')[0]}, the lightning's walking this way. Leave it.`, { who: x.data.names[1].toUpperCase(), style: 'radio', pitch: 0.9 });
    await c.say(`Got it. Got it. Seven, check the link.`, { who: x.data.names[0].toUpperCase(), style: 'radio', pitch: 1.18 });
    c.sfx('beepHi', 0.7);
    c.stamp('MERIDIAN UPLINK · CARRIER LOCKED');
    await c.say('Link is up. Come back. Now.', { who: 'UNIT 07', style: 'plain' });
    // 5. the strike
    c.cam.cut(spot(st, M, a + Math.PI - 0.4, 14, 2.2), M.clone().setY(M.y + 3.5), 46);
    await c.wait(0.9);
    c.flash('#ffffff', 0.9, 1); c.sfx('boom', 1.4, 0.5); c.sfx('impact', 1, 0.6); c.cam.shake(0.9, 1.4);
    mast.fire.intensity = 14;
    for (const w of [A, B]) { w.dead = true; w.die(M.clone().setY(M.y + 8)); }
    for (const l of lights) l.intensity = 0;
    G.fx?.burst?.(M.x, M.y + mast.H, M.z, 80, 0xfff0c0, { glow: true, speed: 6, up: 2, size: 3, life: 1.2, grav: 6 });
    c.task(() => { if (Math.random() < 0.5) G.fx?.burst?.(M.x + (Math.random() - 0.5), M.y + mast.H - 1 + Math.random(), M.z + (Math.random() - 0.5), 2, 0xff8030, { glow: true, speed: 0.6, up: 2.5, size: 4, life: 1, grav: -1 }); });
    rain.set(0.25);
    await c.wait(2.4);
    // 6. silence; the push-in
    c.cam.move({ pos: spot(st, M, a + Math.PI - 0.25, 6, 1.0), look: M.clone().setY(M.y + 0.6), fov: 34, dur: 9, ease: 'inOut' });
    await c.wait(1.6);
    c.sfx('static', 0.5);
    await c.say(`Seven...`, { who: x.data.names[1].toUpperCase(), style: 'radio', pitch: 0.85, hold: 0.8 });
    await c.say(`...the relay's up. Tell Mira it's up.`, { who: x.data.names[1].toUpperCase(), style: 'radio', pitch: 0.82, hold: 1.2 });
    c.sfx('static', 0.35);
    await c.wait(2.2);
    // 7. black, the card
    await c.fade(1, 2.2);
    rain.set(0);
    await c.card(`${x.data.names[0].toUpperCase()}  ·  ${x.data.names[1].toUpperCase()}`, 'LOST ON THE SURFACE · RELAY MAST 2', SHIP_NAME, 4.6, 'IN MEMORIAM');
    await c.say(`Seven. I heard all of it. The relay carried every word.`, { who: 'DR. MIRA SOLANO · ' + SHIP_NAME, style: 'radio', pitch: 1.05, hold: 0.6 });
    await c.say(`They got the link up. Don't let it be for nothing.`, { who: 'DR. MIRA SOLANO · ' + SHIP_NAME, style: 'radio', pitch: 1.0, hold: 1 });
    await c.wait(0.6);
    await c.fade(0, 1.2);
  },
  brief: (x) => `${x.data.names[0]} and ${x.data.names[1]} are dead at Relay Mast 2. The link to the Meridian holds because of them.`,
  options: (x) => [
    { key: 'bury', label: 'BURY THEM BY THE POD', plus: ['Morale +20', 'Reputation +5', 'A memorial at the pod'], minus: ['Nothing recovered'], run: (f) => { E.morale(f, 20); E.rep(f, 5); const m = memorial(), P = x.st.pod(); m.position.set(P.x + 3, P.y, P.z + 3); anyG(x.g).world.scene.add(m); return 'Two cairns beside the pod, and a strip of hull plate with their names scratched in.'; } },
    { key: 'home', label: 'SEND THEM HOME', plus: ['Reputation +15', 'The families are told the truth'], minus: ['Next supply drop halved'], run: (f) => { E.rep(f, 15); const M = anyG(x.g).mission; for (const q of M?.open?.() ?? []) for (const k in q.reward.items) q.reward.items[k] = Math.ceil(q.reward.items[k] / 2); f.out.push('Next drop carries half the cargo'); return 'The next lift took them up to the Meridian, under a flag.'; } },
    { key: 'salvage', label: 'SALVAGE THEIR SUITS', plus: [`+6 ${itemName(pick('circuit'))}, +2 ${itemName(pick('motor'))}, +8 ${itemName(pick('glass'))}`, 'Robotics mastery'], minus: ['Morale -15', 'Reputation -10'], run: (f) => { E.items(f, { [pick('circuit')]: 6, [pick('motor')]: 2, [pick('glass')]: 8 }); E.xp(f, 'robotics', 40); E.morale(f, -15); E.rep(f, -10); return 'The suits held good parts. The Meridian read the inventory and said nothing for a long time.'; } },
  ],
};

function lamp(m: ReturnType<typeof relayMast>, t: number) { const on = Math.floor(t * 1.2) % 2 === 0; m.lamp.color.setHex(on ? 0xff4030 : 0x3a0c08); m.light.intensity = on ? 3 : 0; }

/** the deaths themselves, through the crew and colony systems */
export function killTeammates(g: unknown, ids: string[]) {
  const G = anyG(g as never);
  // the ship's roster (crew agent) and the two on the ground (pod agent: colony.teammates)
  for (const id of ids) { try { G.crew?.kill?.(id, 'lightning'); } catch (e) { console.error('crew.kill', e); } }
  for (const tm of (G.colony?.teammates ?? []) as any[]) {
    if (!tm || tm.alive === false) continue;
    try { if (typeof tm.kill === 'function') tm.kill('lightning'); else { tm.alive = false; tm.dead = true; } } catch (e) { console.error('teammate', e); }
  }
  G.emit?.('teammates-dead', { ids, how: 'lightning' });
}

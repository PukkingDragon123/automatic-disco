// The random events: each is a short cinematic on the colony (Stage / Cinema), then a decision with two or three
// options whose consequences are real (effects.ts). The director weighs them by the colony's state: storms any
// time, revolts when morale is low, disease when the herd is large, faults when there is a generator to fail,
// envoys when a rival bloc is on the region, and so on.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Cinema } from '../game/cinema';
import type { Stage } from './stage';
import * as E from './effects';
import { anyG, pick, itemName } from '../research/util';
import { FACTION_LABEL } from '../game/factions/plan';

const V3 = THREE.Vector3;
type V = THREE.Vector3;
export interface Opt { key: string; label: string; plus: string[]; minus: string[]; need?: () => string | null; run: (f: E.Fx) => string }
export interface EvCtx { g: Game; st: Stage; at: V; focus?: any; data: Record<string, any> }
export interface EventDef {
  id: string; title: string; kicker: string;
  /** 0: cannot happen now; otherwise a relative weight */
  weight: (g: Game, D: { morale: number; difficulty: number; t: number }) => number;
  setup?: (c: EvCtx) => void;
  cine: (c: Cinema, x: EvCtx) => Promise<void>;
  brief: (x: EvCtx) => string;
  options: (x: EvCtx) => Opt[];
  /** at most once (the scripted death) */
  once?: boolean;
}

// ------------------------------------------------------------------ staging helpers
const A = anyG;
/** a camera point at bearing a (radians) and distance d from p, h above the ground */
export function spot(st: Stage, p: V, a: number, d: number, h: number) { const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d; return new V3(x, st.ground(x, z) + h, z); }
const look = (p: V, h = 1) => p.clone().setY(p.y + h);
function biggestGen(g: Game) { return E.buildings(g, (b) => /steamgen|reactor|bt_reactor|boiler/.test(b.kind)).sort((a, b) => (a.def?.power ?? 0) - (b.def?.power ?? 0))[0] ?? null; }
function herd(g: Game): { sp: any; list: any[]; x: number; z: number } | null {
  const by = new Map<any, any[]>();
  for (const c of A(g).world?.creatures ?? []) if (!c.dead && c.faction === 'wild' && (c.size ?? 1) > 0.6) { const a = by.get(c.sp) ?? []; a.push(c); by.set(c.sp, a); }
  let best: any[] | null = null; for (const a of by.values()) if (!best || a.length > best.length) best = a;
  if (!best || best.length < 2) return null;
  const x = best.reduce((s, c) => s + c.x, 0) / best.length, z = best.reduce((s, c) => s + c.z, 0) / best.length;
  return { sp: best[0].sp, list: best, x, z };
}
function rivalProg(g: Game) { return (A(g).factions?.programmes ?? []).find((p: any) => p.alive !== false && p.state !== 'eliminated') ?? null; }
const bloc = (f: string) => (FACTION_LABEL as Record<string, string>)[f] ?? 'Rival bloc';
/** a light hovering envoy drone in a bloc's colours */
function envoyDrone(f: string) {
  const g = new THREE.Group(), hull = f === 'prc' ? 0x9aa6a0 : 0x5a6350, trim = f === 'prc' ? 0x2c6f8a : 0xb8382e;
  const m = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.8), m(hull)); g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.5), m(trim)); top.position.y = 0.26; g.add(top);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xd9f0e0 })); lens.position.set(0, 0, 0.42); g.add(lens);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.5), m(0x2b2e31)); arm.position.set(sx * 0.62, 0.1, sz * 0.34); arm.rotation.y = sx * sz * 0.6; g.add(arm);
    const rot = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.08), m(0x8d8f8a)); rot.position.set(sx * 0.82, 0.18, sz * 0.5); rot.userData.rotor = true; g.add(rot);
  }
  const lamp = new THREE.PointLight(trim, 2.5, 6); lamp.position.y = -0.3; g.add(lamp);
  return g;
}
/** a falling supply capsule with its own glow */
function capsule() {
  const g = new THREE.Group(), m = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.6, 8), m(0xa29d8c)); g.add(b);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.77, 0.77, 0.24, 8), m(0xb8382e)); band.position.y = -0.5; g.add(band);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.6, 8), m(0x3a3d40)); cap.position.y = 1.1; g.add(cap);
  const glow = new THREE.PointLight(0xffa060, 4, 14); glow.position.y = -1; g.add(glow);
  return g;
}

// ------------------------------------------------------------------ the events
export const EVENTS: EventDef[] = [
  {
    id: 'storm', title: 'STORM CELL', kicker: 'WEATHER ALERT',
    weight: () => 1.2,
    setup: (x) => { x.data.prev = null; },
    async cine(c, x) {
      const { st, g } = x, P = st.pod();
      A(g).climate?.force?.(null, 'storm');
      c.onEnd(() => { /* the storm stays on for its duration (director releases it) */ });
      c.cam.cut(spot(st, P, 2.4, 36, 18), look(P, 6), 44);
      await c.fade(0, 0.8);
      c.stamp('WEATHER ALERT · CELL INBOUND FROM THE RIDGE', true);
      c.cam.move({ pos: spot(st, P, 2.0, 22, 7), look: look(P, 2.5), dur: 6, ease: 'inOut' });
      c.loop('night', 0.7);
      await c.say('Pressure is falling fast. Wind gusting ninety. Lightning inside four minutes.', { who: 'POD METEOROLOGY', style: 'radio' });
      c.flash('#e8f0ff', 0.35, 0.8); c.sfx('boom', 0.8, 0.8); c.cam.shake(0.25, 0.6);
      await c.wait(0.6);
      c.cam.move({ pos: spot(st, P, 1.2, 12, 3.2), look: look(P, 1.6), dur: 4.5, ease: 'out' });
      await c.say('The workers are still out on the lines.', { who: 'UNIT 07', style: 'plain' });
      c.flash('#ffffff', 0.25, 1); c.sfx('boom', 1, 1); c.cam.shake(0.4, 0.8);
      await c.wait(1.2);
    },
    brief: () => 'A storm cell is coming down off the ridge: high wind, hail and lightning over the works for several minutes.',
    options: () => [
      { key: 'shelter', label: 'SHELTER EVERYTHING', plus: ['No damage, no losses'], minus: ['Every machine offline for 2 min'], run: (f) => { E.shutdown(f, 120); E.morale(f, 4); return 'The colony waited it out behind closed hatches.'; } },
      { key: 'ride', label: 'KEEP WORKING', plus: ['Production continues'], minus: ['Machines may be struck', 'A worker may die'], run: (f) => { E.damageBuildings(f, 2 + (Math.random() < 0.5 ? 1 : 0), 0.45); if (E.pct(0.35)) E.killWorkers(f, 1, 'lightning'); else E.hurtWorkers(f, 0.25, 3); E.morale(f, -6); return 'The lines kept running. Not everything came through.'; } },
      { key: 'ground', label: 'CATCH THE LIGHTNING', plus: ['+18 ENERGY data', 'Energy mastery'], minus: ['Power poles take heavy damage'], need: () => null,
        run: (f) => { E.data(f, 'energy', 18); E.xp(f, 'energy', 40); E.damageBuildings(f, 6, 0.55, (b) => b.kind === 'pole' || b.kind === 'grav_pole'); return 'Three strikes hit the rods. The instruments recorded every one.'; } },
    ],
  },
  {
    id: 'revolt', title: 'WORKER REVOLT', kicker: 'COLONY UNREST',
    weight: (g, D) => (E.workers(g).length >= 3 ? (D.morale < 45 ? 2.2 : 0.4) : 0),
    async cine(c, x) {
      const { st, g } = x, P = st.pod(), ws = E.workers(g).slice(0, 8);
      // they stop work and gather at the pod
      for (const [i, w] of ws.entries()) { const a = (i / ws.length) * Math.PI * 2; w.order = { kind: 'move', x: P.x + Math.sin(a) * 5, z: P.z + Math.cos(a) * 5 }; w.path = null; w.mind = 'order'; }
      c.cam.cut(spot(st, P, 0.6, 16, 2.2), look(P, 1.2), 40);
      await c.fade(0, 0.6);
      c.stamp('COLONY UNREST · WORK STOPPED ON ALL LINES', true);
      c.cam.move({ pos: spot(st, P, 1.4, 8, 1.4), look: look(P, 1.0), dur: 7, ease: 'inOut' });
      c.sfx('roar', 0.5, 1.2);
      await c.say('Every fitted worker has stopped at once. They are coming to the pod.', { who: 'WORKS SUPERVISOR', style: 'radio' });
      await c.say('Their implants are fine. They are tired, hungry, and there are too few of them.', { who: 'BIO MONITOR', style: 'radio' });
      c.sfx('crunch', 0.6); c.cam.shake(0.12, 0.4);
      await c.wait(0.8);
    },
    brief: (x) => `${E.workers(x.g).length} workers have downed tools around the pod. Morale is ${Math.round(A(x.g).director?.morale ?? 50)}%.`,
    options: (x) => {
      const food = pick('fruit', 'berries', 'protein'), n = Math.max(10, E.workers(x.g).length * 4);
      return [
        { key: 'feed', label: `DOUBLE RATIONS`, plus: ['Morale +25'], minus: [`-${n} ${itemName(food)}`], need: () => (E.affords(x.g, { [food]: n }) ? null : `Needs ${n} ${itemName(food)}`), run: (f) => { E.spend(f, { [food]: n }); E.morale(f, 25); return 'Full rations tonight. They went back to the lines.'; } },
        { key: 'sedate', label: 'SEDATE THE HERD', plus: ['No cost in food'], minus: ['Workers injured', 'Morale +5 only'], need: () => ((A(x.g).mastery?.level?.('bio') ?? 0) >= 2 ? null : 'Needs BIO ENGINEERING LV 2'), run: (f) => { E.hurtWorkers(f, 0.3); E.morale(f, 5); E.xp(f, 'bio', 20); return 'The dart lines went out. They walked back slowly.'; } },
        { key: 'cull', label: 'MAKE AN EXAMPLE', plus: ['Work resumes now'], minus: ['One worker killed', 'Morale -10', 'Reputation -5'], run: (f) => { E.killWorkers(f, 1, 'culled'); E.morale(f, -10); E.rep(f, -5); return 'One of them did not get up. The rest went back to work.'; } },
      ];
    },
  },
  {
    id: 'migration', title: 'CREATURE MIGRATION', kicker: 'FAUNA MOVEMENT',
    weight: (g) => (herd(g) ? 1 : 0),
    setup: (x) => { x.data.h = herd(x.g); },
    async cine(c, x) {
      const { st, g } = x, P = st.pod(), h = x.data.h;
      const H = h ? st.at(h.x, h.z) : spot(st, P, 3, 30, 0);
      // the herd turns and comes through the works
      if (h) for (const cr of h.list.slice(0, 10)) { cr.order = { kind: 'move', x: P.x + (cr.x - h.x) * 0.6 + (P.x - h.x) * 0.4, z: P.z + (cr.z - h.z) * 0.6 + (P.z - h.z) * 0.4 }; cr.path = null; cr.mind = 'order'; }
      c.cam.cut(spot(st, H, 0.8, 18, 3), look(H, 1.2), 38);
      await c.fade(0, 0.7);
      c.stamp(`FAUNA MOVEMENT · ${h ? h.list.length : 'A'} ${h ? String(h.sp?.name ?? 'animals').toUpperCase() : 'HERD'}`, true);
      c.cam.move({ pos: spot(st, H, 1.6, 10, 1.6), look: look(H, 1), dur: 6, ease: 'inOut' });
      c.sfx('roar', 0.7, 0.8); c.cam.shake(0.08, 2);
      await c.say('A whole herd on the move. Their path runs straight through the eastern works.', { who: 'FIELD SURVEY', style: 'radio' });
      c.cam.move({ pos: spot(st, P, 2.4, 14, 4), look: look(P, 1), dur: 4, ease: 'inOut' });
      await c.say('Machines, workers, belts. They will not go round.', { who: 'UNIT 07', style: 'plain' });
    },
    brief: (x) => `${x.data.h ? x.data.h.list.length + ' ' + (x.data.h.sp?.name ?? 'creatures') : 'A herd'} will cross the colony within the minute.`,
    options: (x) => [
      { key: 'corridor', label: 'OPEN A CORRIDOR', plus: ['+20 BIO data (study them)', 'Nothing lost'], minus: ['Machines offline 90 s'], run: (f) => { E.shutdown(f, 90); E.data(f, 'bio', 20); E.xp(f, 'bio', 25); return 'The lines stopped and the herd walked through. The scanners logged every animal.'; } },
      { key: 'turn', label: 'TURN THEM BACK', plus: ['No downtime', `Meat and hide`], minus: ['Machines trampled', 'A worker may be gored'], run: (f) => { const h = x.data.h; let k = 0; if (h) for (const cr of h.list.slice(0, 3)) { cr.dieCause = 'culled'; A(x.g).world?.kill?.(cr, null); k++; } E.items(f, { [pick('meat', 'protein')]: 6 * Math.max(1, k), [pick('hide', 'silk')]: 3 * Math.max(1, k) }); E.damageBuildings(f, 2, 0.5); if (E.pct(0.4)) E.killWorkers(f, 1, 'gored'); return 'They broke and scattered, but not before they hit the works.'; } },
      { key: 'capture', label: 'CAPTURE ONE', plus: ['A new worker joins'], minus: ['One machine trampled'], need: () => (A(x.g).run?.skills?.has?.('convert') ? null : 'Needs LABOUR HARNESS research'), run: (f) => { const h = x.data.h, cr = h?.list?.find((q: any) => !q.dead); if (cr) { cr.faction = 'veyr'; cr.order = null; f.out.push(`${cr.sp?.name ?? 'A creature'} joins the colony`); } E.damageBuildings(f, 1, 0.5); E.xp(f, 'bio', 30); return 'The harness took. One of them stayed.'; } },
    ],
  },
  {
    id: 'envoy', title: 'RIVAL ENVOY', kicker: 'CONTACT',
    weight: (g) => (rivalProg(g) ? 1.1 : 0.25),
    setup: (x) => { const p = rivalProg(x.g); x.data.f = p?.f ?? 'prc'; x.data.name = bloc(x.data.f); },
    async cine(c, x) {
      const { st, g } = x, P = st.pod(), d = envoyDrone(x.data.f), at = spot(st, P, 0.9, 7, 0);
      d.position.set(at.x, at.y + 18, at.z); A(g).world.scene.add(d); st.props.push(d);
      c.task((dt, t) => { for (const ch of d.children) if (ch.userData.rotor) ch.rotation.y += dt * 40; d.rotation.y = Math.sin(t * 0.7) * 0.2; });
      c.cam.cut(spot(st, P, 1.6, 13, 2), look(at, 4), 42);
      await c.fade(0, 0.6);
      c.stamp(`CONTACT · ${x.data.name.toUpperCase()} DRONE ON APPROACH`, true);
      c.sfx('hover', 0.8);
      c.cam.move({ look: look(at, 1.6), dur: 4, ease: 'inOut' });
      await c.tween(4, (u) => { d.position.y = at.y + 18 - u * 16.2; });
      c.sfx('beep', 0.7);
      await c.say(x.data.f === 'prc' ? 'UNAA unit. The Consortium proposes an exchange. Your survey data for our stock.' : 'UNAA unit. The Concord offers terms. Share what you have learned and we will share what we have.', { who: x.data.name.toUpperCase() + ' ENVOY', style: 'radio' });
      await c.say('The Meridian will hear about any trade.', { who: 'UNIT 07', style: 'plain' });
    },
    brief: (x) => `A ${x.data.name} drone hovers at the pod with an offer. Whatever you choose, the Meridian logs the contact.`,
    options: (x) => [
      { key: 'trade', label: 'TRADE DATA FOR STOCK', plus: [`+30 ${itemName(pick('iron_plate'))}, +2 ${itemName(pick('motor'))}`], minus: ['-15 BIO data', 'Reputation -5'], need: () => ((A(x.g).research?.data?.bio ?? 0) >= 15 ? null : 'Needs 15 BIO data'), run: (f) => { E.data(f, 'bio', -15); E.items(f, { [pick('iron_plate')]: 30, [pick('motor')]: 2 }); E.rep(f, -5); return 'The drone took the data packet and dropped a pallet.'; } },
      { key: 'truce', label: 'SHARE RESEARCH, BUY PEACE', plus: ['+20 XENO data', 'Their raids delayed 6 min'], minus: ['Reputation -12'], run: (f) => { E.data(f, 'xeno', 20); E.rivals(f, -360); E.rep(f, -12); return 'An uneasy quiet. Their machines turned away from the works.'; } },
      { key: 'refuse', label: 'SEND IT AWAY', plus: ['Reputation +8'], minus: ['Their raids come sooner'], run: (f) => { E.rep(f, 8); E.rivals(f, 120); return 'The drone climbed away. Their channel went silent.'; } },
    ],
  },
  {
    id: 'reactor', title: 'GENERATOR FAULT', kicker: 'POWER EMERGENCY',
    weight: (g) => { const b = biggestGen(g); if (!b) return 0; return 0.9 * (A(g).mastery?.mod?.('reactor.fault') ?? 1); },
    setup: (x) => { x.data.b = biggestGen(x.g); },
    async cine(c, x) {
      const { st, g } = x, b = x.data.b, B = b ? st.at(b.x, b.z) : st.pod();
      c.cam.cut(spot(st, B, 0.5, 9, 2.6), look(B, 1.4), 40);
      await c.fade(0, 0.5);
      c.stamp(`POWER EMERGENCY · ${(b?.def?.name ?? 'GENERATOR').toUpperCase()}`, true);
      c.sfx('klaxon', 0.6);
      const steam = c.task((_, t) => { if (Math.random() < 0.4) A(g).fx?.burst?.(B.x, B.y + 2.2, B.z, 3, 0xd9dccf, { speed: 1.4, up: 3.5, size: 3, life: 1.4, grav: -1.5 }); if (Math.floor(t * 2) % 2 === 0 && Math.random() < 0.05) c.flash('#b8382e', 0.25, 0.25); });
      c.cam.move({ pos: spot(st, B, 1.2, 5, 1.4), look: look(B, 1.6), dur: 6, ease: 'inOut' });
      await c.say('Coolant pressure is past the red line. The relief valve has seized.', { who: 'GRID CONTROL', style: 'radio' });
      c.cam.shake(0.18, 1.2); c.sfx('steam', 0.9);
      await c.say('Ninety seconds to decide, then it decides for us.', { who: 'GRID CONTROL', style: 'radio' });
      steam();
    },
    brief: (x) => `The ${x.data.b?.def?.name ?? 'generator'} is overpressured and its relief valve has seized.`,
    options: (x) => [
      { key: 'scram', label: 'SHUT THE GRID DOWN', plus: ['The generator survives'], minus: ['Every generator offline 2.5 min'], run: (f) => { E.shutdown(f, 150, (b) => (b.def?.power ?? 0) < 0, 'generators'); E.xp(f, 'energy', 20); return 'The grid went dark until the pressure bled off.'; } },
      { key: 'send', label: 'SEND A WORKER IN', plus: ['The generator keeps running'], minus: ['That worker dies'], need: () => (E.workers(x.g).length ? null : 'No workers'), run: (f) => { E.killWorkers(f, 1, 'scalded'); E.morale(f, -8); return 'The valve was freed by hand. The worker did not come back out.'; } },
      { key: 'vent', label: 'VENT AND HOPE', plus: ['Even odds: nothing happens'], minus: ['Or it explodes'], run: (f) => { const b = x.data.b; if (E.pct(0.5) && b) { b.damage?.(1e6, 'explosion'); A(x.g).fx?.burst?.(b.x, b.y + 1, b.z, 60, 0xffa050, { glow: true, speed: 5, up: 5, size: 4, life: 1.5 }); E.damageBuildings(f, 3, 0.4, (o) => Math.hypot(o.x - b.x, o.z - b.z) < 7 && o !== b); f.out.push(`${b.def?.name ?? 'Generator'} destroyed`); return 'The vent failed. The blast was heard across the valley.'; } return 'The vent screamed for a minute, then held.'; } },
    ],
  },
  {
    id: 'disease', title: 'OUTBREAK', kicker: 'BIOHAZARD',
    weight: (g) => { const n = E.workers(g).length; return n >= 4 ? 0.6 + n * 0.08 * (2 - (A(g).mastery?.mod?.('disease.resist') ?? 1)) : 0; },
    async cine(c, x) {
      const { st, g } = x, ws = E.workers(g), w = ws[0], W = w ? st.at(w.x, w.z) : st.pod();
      c.cam.cut(spot(st, W, 2.2, 6, 1.4), look(W, 0.6), 34);
      await c.fade(0, 0.6);
      c.ui.fade(0.18, 1.2, '#0d2214');
      c.stamp('BIOHAZARD · FUNGAL INFECTION IN THE WORKER PENS', true);
      for (const q of ws.slice(0, 6)) { try { q.fx.flash.value = 0.5; q.fx.flashCol.value.setRGB(0.4, 0.9, 0.3); } catch { /* look */ } }
      c.cam.move({ pos: spot(st, W, 2.8, 4, 0.9), look: look(W, 0.5), dur: 6, ease: 'inOut' });
      await c.say(`Spore load rising in ${Math.max(2, Math.ceil(ws.length / 2))} workers. It spreads by touch and by breath.`, { who: 'BIO MONITOR', style: 'radio' });
      await c.say('Without action half the herd is sick by nightfall.', { who: 'BIO MONITOR', style: 'radio' });
      c.ui.fade(0, 1.2);
    },
    brief: (x) => `A fungal infection is moving through ${E.workers(x.g).length} workers.`,
    options: (x) => {
      const food = pick('fruit', 'berries', 'protein');
      return [
        { key: 'treat', label: 'TREAT EVERYONE', plus: ['Everyone recovers', 'Bio mastery'], minus: ['-20 BIO data', `-10 ${itemName(food)}`], need: () => ((A(x.g).research?.data?.bio ?? 0) >= 20 && E.affords(x.g, { [food]: 10 }) ? null : `Needs 20 BIO data and 10 ${itemName(food)}`), run: (f) => { E.data(f, 'bio', -20); E.spend(f, { [food]: 10 }); E.xp(f, 'bio', 40); return 'The vats ran all night. Every worker pulled through.'; } },
        { key: 'quarantine', label: 'QUARANTINE THE PENS', plus: ['Nobody dies'], minus: ['All workers weakened', 'Morale -8'], run: (f) => { E.hurtWorkers(f, (A(x.g).mastery?.has?.('med_quar') ? 0.2 : 0.4)); E.morale(f, -8); return 'The pens were sealed for a day. The infection burnt out.'; } },
        { key: 'cull', label: 'CULL THE SICK', plus: ['The outbreak ends now'], minus: ['Two workers killed', 'Morale -15'], run: (f) => { E.killWorkers(f, 2, 'culled'); E.morale(f, -15); return 'The sick were put down. The rest watched.'; } },
      ];
    },
  },
  {
    id: 'signal', title: 'STRANGE SIGNAL', kicker: 'UNKNOWN TRANSMISSION',
    weight: (g) => 0.7 + ((A(g).research?.ruins?.length ?? 0) > 0 ? 0.5 : 0),
    setup: (x) => { const R = A(x.g).research?.ruins ?? []; x.data.ruin = R[Math.floor(Math.random() * R.length)] ?? null; },
    async cine(c, x) {
      const { st } = x, P = st.pod(), R = x.data.ruin, at = R ? st.at(R.x, R.z) : spot(st, P, 4.1, 30, 0);
      c.cam.cut(spot(st, at, 0.4, 14, 6), look(at, 1), 46);
      await c.fade(0, 1);
      c.stamp('UNKNOWN TRANSMISSION · 1.42 GHZ · REPEATING', true);
      const l = c.loop('radio', 0.5);
      c.cam.move({ pos: spot(st, at, 1.1, 7, 1.8), look: look(at, 1.2), dur: 7, ease: 'inOut' });
      c.sfx('static', 0.8); c.flash('#7fd4c0', 0.4, 0.3);
      await c.say('·· ··· · ·· ··· · ·· ··· ·', { who: 'RX 1.42 GHZ', style: 'radio', voice: false });
      await c.say('Prime intervals. It is not natural, and it is not ours.', { who: 'UNIT 07', style: 'plain' });
      c.sfx('static', 0.6); c.flash('#7fd4c0', 0.3, 0.4);
      await c.say(R ? `The source is under ${R.name}.` : 'The source is somewhere under the ridge.', { who: 'UNIT 07', style: 'plain' });
      l.set(0.2);
    },
    brief: (x) => `A repeating signal from ${x.data.ruin ? x.data.ruin.name : 'beneath the ridge'}. Prime-number spacing. Not human.`,
    options: () => [
      { key: 'trace', label: 'TRACE IT', plus: ['+30 XENO data'], minus: ['Something may wake'], run: (f) => { E.data(f, 'xeno', 30); E.xp(f, 'robotics', 30); if (E.pct(0.45)) { E.damageBuildings(f, 2, 0.5); E.hurtWorkers(f, 0.3, 3); return 'The trace lit something underground. A shock wave ran through the works.'; } return 'The signal answered the probe, then went quiet. The recordings are extraordinary.'; } },
      { key: 'relay', label: 'RELAY IT TO THE MERIDIAN', plus: ['+10 XENO data', 'Reputation +10'], minus: ['The ship keeps the find'], run: (f) => { E.data(f, 'xeno', 10); E.rep(f, 10); return 'The Meridian took the recording. The program lead called it a career.'; } },
      { key: 'jam', label: 'JAM IT', plus: ['Nothing happens'], minus: ['Nothing is learned'], run: () => 'The channel went flat. Whatever it was, it is still down there.' },
    ],
  },
  {
    id: 'supplycrash', title: 'SUPPLY CRASH', kicker: 'LOGISTICS FAILURE',
    weight: (g) => ((A(g).mission?.quotas?.length ?? 0) > 0 ? 0.9 : 0.4),
    async cine(c, x) {
      const { st, g } = x, P = st.pod(), at = spot(st, P, 3.6, 42, 0), cap = capsule();
      A(g).world.scene.add(cap); st.props.push(cap);
      const from = new V3(at.x - 60, at.y + 90, at.z - 30);
      c.cam.cut(spot(st, P, 3.0, 16, 4), from.clone().lerp(at, 0.3), 50);
      await c.fade(0, 0.5);
      c.stamp('LOGISTICS FAILURE · SUPPLY CAPSULE OFF COURSE', true);
      c.sfx('whoosh', 0.8);
      c.cam.move({ look: look(at, 2), dur: 3.2, ease: 'inOut' });
      await c.tween(3.2, (u) => { cap.position.lerpVectors(from, at, u); cap.rotation.z = u * 3; if (Math.random() < 0.6) A(g).fx?.burst?.(cap.position.x, cap.position.y, cap.position.z, 2, 0xff9050, { glow: true, speed: 0.3, up: 0.2, size: 4, life: 1.2, grav: 0 }); }, 'in');
      c.flash('#ffd0a0', 0.5, 0.9); c.sfx('boom', 1, 0.7); c.cam.shake(0.5, 1);
      A(g).fx?.burst?.(at.x, at.y + 1, at.z, 70, 0x6a5a4a, { speed: 4, up: 6, size: 4, life: 2 });
      await c.wait(0.8);
      c.cam.move({ pos: spot(st, at, 0.6, 12, 4), look: look(at, 1), dur: 4, ease: 'out' });
      await c.say('The capsule came down forty metres out, past the treeline. Half the cargo may have survived.', { who: SHIPNAME, style: 'radio' });
    },
    brief: () => 'A supply capsule from the Meridian overshot and crashed past the treeline. Predators will find it first.',
    options: (x) => [
      { key: 'workers', label: 'SEND WORKERS', plus: ['Recover most of the cargo'], minus: ['A worker may not come back'], run: (f) => { E.items(f, { [pick('iron_plate')]: 24, [pick('circuit')]: 4, [pick('motor')]: 1, [pick('glass')]: 8 }); if (E.pct(0.35)) E.killWorkers(f, 1, 'predators'); return 'They came back loaded. Not all of them came back.'; } },
      { key: 'drone', label: 'SEND A DRONE', plus: ['Safe recovery of half'], minus: ['Half the cargo stays out there'], need: () => ((A(x.g).colony?.drones?.length ?? 0) > 0 || (A(x.g).upgrades?.count?.('drone_') ?? 0) > 0 ? null : 'Needs a drone'), run: (f) => { E.items(f, { [pick('iron_plate')]: 12, [pick('circuit')]: 2 }); E.xp(f, 'robotics', 15); return 'The drone made three runs before the predators arrived.'; } },
      { key: 'leave', label: 'WRITE IT OFF', plus: ['No risk'], minus: ['Cargo lost', 'Reputation -4'], run: (f) => { E.rep(f, -4); return 'The Meridian logged the loss against the colony.'; } },
    ],
  },
];
const SHIPNAME = 'UNAA MERIDIAN';
export const EVENT: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

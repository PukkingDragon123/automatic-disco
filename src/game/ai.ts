// Minds. Owned creatures (the Veyr's, a rival's) follow orders, keep to their ground and fight for it. WILD animals
// live a daily life on a utility AI over their needs (hunger, thirst, tiredness, fear, company, the urge to breed),
// their species' schedule (diurnal, nocturnal, crepuscular: eco/profile.ts) and what they remember (water they drank
// at, food patches, places where something was killed):
//  - the day: wake (herds together), drink in the morning, forage along good patches, lie up in the shade at noon in
//    hot country, drift home in the evening, sleep (in a den, or as a herd in the open with one awake as a sentry)
//  - herds follow a leader to better grazing (migration routes), juveniles keep to their mothers, alarm spreads
//    through a herd in a ripple when one of them bolts, mothers stand over their young
//  - predators stalk in cover, ambush at drinking places, chase until their wind gives out, drag kills into cover
//    or to the den and feed; scavengers home in on carcasses and wait their turn at a predator's kill
//  - rivals display at each other over territory, partners court before mating, mothers give birth at the den
//  - lures (eco.attract / repel), sown plants, watered ground, bases and danger memory steer where they go
// The golem takes part: predators hunt it, provoked animals fight back or bolt, small ones keep clear of it, its
// attacks frighten a whole herd and mark the place as dangerous, and a rival's brood goes for it on sight.
import { Creature, GOLEM, GOLEM_REF, Emote, type Mind, type Spot, type Memory } from './creature';
import type { World } from './world';
import { clamp } from '../core/rand';
import { profileOf, activity, midday, morning, evening, type Profile } from '../eco/profile';

const THINK = 0.35, THINK_FAR = 1.2;
const TAU = Math.PI * 2;

// ================================================================================================ small helpers
function emote(c: Creature, e: Emote, t = 2.6) { c.emote = e; c.emoteT = t; }
function setMind(c: Creature, m: Mind) { if (c.mind !== m) { c.mind = m; c.actT = 0; c.rolling = false; c.digging = false; } }
function mem(c: Creature): Memory { return (c.mem ??= { water: [], food: [], danger: [] }); }
function remember(list: Spot[], x: number, z: number, t: number, v: number, max = 4) {
  for (const s of list) if ((s.x - x) ** 2 + (s.z - z) ** 2 < 49) { s.x += (x - s.x) * 0.3; s.z += (z - s.z) * 0.3; s.t = t; s.v = Math.max(s.v * 0.7, v); return; }
  list.push({ x, z, t, v });
  if (list.length > max) { let o = 0; for (let i = 1; i < list.length; i++) if (list[i].t < list[o].t) o = i; list.splice(o, 1); }
}
/** how dangerous a place feels to this animal (its own memory plus the land's) */
function dangerAt(c: Creature, w: World, x: number, z: number) {
  let d = w.eco.dangerAt(x, z);
  if (c.mem) for (const s of c.mem.danger) { const age = w.time - s.t; if (age < 300 && (s.x - x) ** 2 + (s.z - z) ** 2 < 144) d += s.v * (1 - age / 300); }
  return d;
}
function travel(c: Creature, w: World, x: number, z: number, plan: Mind) {
  const N = w.region.N;
  c.goalX = clamp(x, 1.5, N - 1.5); c.goalZ = clamp(z, 1.5, N - 1.5); c.plan = plan; c.path = null;
  setMind(c, 'travel'); c.actT = 0;
}
function dist(c: Creature, x: number, z: number) { return Math.hypot(x - c.x, z - c.z); }

// ================================================================================================ perception
/** the last hunter seen but not fled from (the animal stands alert and watches it) */
let watched: Creature | null = null;
function threatOf(c: Creature, w: World): Creature | null {
  let best: Creature | null = null, bd = 1e9;
  watched = null;
  const sight = c.st.sight * (c.mind === 'sleep' ? 0.35 : c.mind === 'watch' ? 1.5 : 0.85);
  w.near(c.x, c.z, sight, (o) => {
    if (o.dead || o === c || o.faction === c.faction && c.faction !== 'wild') return;
    if (o.faction === 'wild' && c.faction === 'wild' && o.sp === c.sp) return;
    const dangerous = (o.diet === 'carn' || o.diet === 'omni' || o.faction !== 'wild') && o.mass > c.mass * 0.55;
    const attacking = o.target === c.id && (o.mind === 'hunt' || o.mind === 'attack' || o.mind === 'stalk');
    if (!dangerous && !attacking) return;
    if (c.diet === 'carn' && o.mass < c.mass * 1.2 && !attacking) return;
    const d = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    // a stalking or waiting hunter is hard to see, the more so in cover
    if (o.mind === 'stalk' || o.mind === 'ambush') {
      const hid = clamp(o.st.stealth * 0.8 + w.eco.coverAt(o.x, o.z) * 0.4, 0, 0.82);
      if (d > (sight * (1 - hid)) ** 2) return;
    }
    // a fed, resting hunter can be watched from a distance; one that is not hunting is only fled when close
    if (!attacking && o.faction === 'wild') {
      if ((o.mind === 'sleep' || o.mind === 'eat' || o.mind === 'rest' || o.mind === 'carry') && d > 6.25) return;
      if (o.mind !== 'hunt' && o.mind !== 'stalk' && o.mind !== 'attack' && d > Math.min(sight * 0.55, 7) ** 2) { if (c.mind !== 'sleep') { c.fear = 2.5; watched = o; } return; }
    }
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

/** a herd's alarm: the ones nearby bolt after a beat, in a ripple; other grazers close by startle too */
function alarm(c: Creature, w: World, by: number, r = 16) {
  const h = c.herd ? w.herds.get(c.herd) : null;
  if (h) for (const o of h) {
    if (o === c || o.dead || o.mind === 'flee' || o.alarmT > 0 || o.faction !== c.faction) continue;
    if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 > r * r) continue;
    o.alarmT = 0.12 + Math.random() * 0.5 + (o.mind === 'sleep' ? 0.4 : 0); o.alarmBy = by;
  }
  w.near(c.x, c.z, 9, (o) => {
    if (o === c || o.dead || o.faction !== 'wild' || o.diet === 'carn' || o.mind === 'flee' || o.alarmT > 0 || o.herd === c.herd) return;
    if (Math.random() < 0.45) { o.alarmT = 0.3 + Math.random() * 0.6; o.alarmBy = by; }
  });
}
function bolt(c: Creature, w: World, by: number, t = 3) {
  if (c.roller && c.faction === 'wild' && c.cdCurl <= 0) {
    const th = by === GOLEM ? GOLEM_REF.g : w.get(by);
    const close = !!th && (th.x - c.x) ** 2 + (th.z - c.z) ** 2 < 36;
    const coming = !!th && by !== GOLEM && (th as Creature).target === c.id;
    if (close || coming) { curlUp(c, w, by); return; }
  }
  c.target = by; c.fleeT = t + Math.random(); c.path = null; c.plan = null;
  if (c.mind !== 'flee') emote(c, Emote.ALARM, 1.8);
  setMind(c, 'flee');
  const th = by === GOLEM ? GOLEM_REF.g : w.get(by);
  if (th) { remember(mem(c).danger, th.x, th.z, w.time, 1); w.eco.scare(th.x, th.z, 0.12, 5); }
}

/** a roller tucks into its ball (and rolls off downhill if the danger closes in) */
function curlUp(c: Creature, w: World, by: number) {
  if (c.mind !== 'curl') { emote(c, Emote.ALARM, 1.6); c.rolling = false; }
  c.target = by; c.path = null; c.plan = null; c.fleeT = 0;
  setMind(c, 'curl');
  const th = by === GOLEM ? GOLEM_REF.g : w.get(by);
  if (th) remember(mem(c).danger, th.x, th.z, w.time, 1);
}
/** is whatever made it curl up still close? */
function stillThreatened(c: Creature, w: World, r: number) {
  const th = c.target === GOLEM ? GOLEM_REF.g : w.get(c.target);
  if (!th || (c.target !== GOLEM && (th as Creature).dead)) return false;
  if (c.target !== GOLEM) { const o = th as Creature; if (o.mind === 'sleep' || o.mind === 'rest' || o.mind === 'eat') return false; }
  return (th.x - c.x) ** 2 + (th.z - c.z) ** 2 < r * r;
}
/** a ball's way out: away from the danger and downhill, round water */
function rollDir(c: Creature, w: World, tx: number, tz: number): [number, number] {
  const R = w.region;
  let ax = c.x - tx, az = c.z - tz; const d = Math.hypot(ax, az) || 1; ax /= d; az /= d;
  const gx = R.heightAt(c.x + 1, c.z) - R.heightAt(c.x - 1, c.z), gz = R.heightAt(c.x, c.z + 1) - R.heightAt(c.x, c.z - 1), gl = Math.hypot(gx, gz);
  let fx = ax, fz = az;
  if (gl > 0.08) { fx = ax * 0.6 - (gx / gl) * 0.8; fz = az * 0.6 - (gz / gl) * 0.8; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; }
  if (R.isWater(c.x + fx * 3, c.z + fz * 3) || R.isSolid(c.x + fx * 3, c.z + fz * 3)) { const t = fx; fx = -fz; fz = t; if (R.isWater(c.x + fx * 3, c.z + fz * 3)) { fx = -fx; fz = -fz; } }
  return [fx, fz];
}

// ================================================================================================ finding things
function preyFor(c: Creature, w: World): Creature | null {
  let best: Creature | null = null, bs = -1e9;
  w.near(c.x, c.z, c.st.sight * 1.1, (o) => {
    if (o.dead || o === c || o.air > 1.5) return;
    if (o.sp === c.sp) return;
    if (c.faction !== 'wild' && o.faction === c.faction) return;
    if (o.mass > c.mass * (c.boss ? 3 : 1.6)) return;
    if (o.canFly && !c.canFly && o.mind !== 'sleep') return;
    // a plated roller: hardly worth the teeth (mostly left alone, never while it is balled up)
    if (o.roller && (o.mind === 'curl' || (o.id + c.id) % 4 !== 0)) return;
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    // the young, the weak, the sleeping, the drinking and the stragglers
    let alone = 1;
    if (o.herd) { const h = w.herds.get(o.herd); if (h) for (const m of h) if (m !== o && !m.dead && (m.x - o.x) ** 2 + (m.z - o.z) ** 2 < 49) { alone = 0; break; } }
    const s = -d + Math.min(o.mass, c.mass) * 0.03 + (o.hp < o.maxHp * 0.5 ? 5 : 0) + (o.mature ? 0 : 5) + alone * 4 + (o.mind === 'sleep' ? 4 : o.mind === 'drink' ? 3 : 0) - (o.mother && w.get(o.mother)?.mass ? Math.min(4, (w.get(o.mother)!.mass / c.mass) * 3) : 0);
    if (s > bs) { bs = s; best = o; }
  });
  return best;
}
function corpseFor(c: Creature, w: World, P: Profile | null): Creature | null {
  let best: Creature | null = null, bd = 1e9;
  const r = Math.max(c.st.smell, 6) * (P?.guild === 'scavenger' || P?.guild === 'decomposer' ? 4 : 1.6) + (c.canFly ? c.st.sight : 0);
  w.near(c.x, c.z, r, (o) => {
    if (!o.dead || o.bio <= 0.5 || o.digest > 0.05) return;
    const d = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}
function plantFor(c: Creature, w: World, r: number, cx = c.x, cz = c.z): number {
  let best = -1, bs = 1e9;
  const fl = w.flora, eco = w.eco;
  fl.near(cx, cz, Math.min(r, 16), (i, d2) => {
    if (fl.bio[i] < 0.35 || !eco.plantAlive(i)) return;
    if (w.mossAtXZ(fl.x[i], fl.z[i]) > 0.4 && c.faction !== 'veyr') return;
    const sp = fl.species[fl.sp[i]];
    if (sp.tree && c.size < 1.4) return;
    // a little preference for richer plants and safer ground
    const s = d2 - sp.food * 0.4 - fl.bio[i] * 3 + (c.faction === 'wild' ? eco.poisonAt(fl.x[i], fl.z[i]) * 30 : 0);
    if (s < bs) { bs = s; best = i; }
  });
  return best;
}
function treeNear(c: Creature, w: World, r: number): [number, number] | null {
  let best: [number, number] | null = null, bd = r * r;
  const fl = w.flora;
  fl.near(c.x, c.z, r, (i, d2) => { if (d2 < bd && fl.species[fl.sp[i]].tree && fl.bio[i] > 0.2 && w.eco.plantAlive(i)) { bd = d2; best = [fl.x[i], fl.z[i]]; } });
  return best;
}
/** where to drink: a remembered place, else the nearest shore the land offers */
function waterFor(c: Creature, w: World): [number, number] | null {
  let best: [number, number] | null = null, bd = 75 * 75;
  if (c.mem) for (const s of c.mem.water) { const d = (s.x - c.x) ** 2 + (s.z - c.z) ** 2 + dangerAt(c, w, s.x, s.z) * 400; if (d < bd) { bd = d; best = [s.x, s.z]; } }
  // the animals know their land: the nearest shore, however far
  const sh = w.eco.shoreNear(c.x, c.z);
  if (sh) { const d = (sh[0] - c.x) ** 2 + (sh[1] - c.z) ** 2 + dangerAt(c, w, sh[0], sh[1]) * 400; if (!best || d < bd * 0.9) best = sh; }
  return best;
}
/** a den: sheltered (trees, rock), dry, away from danger, near home */
function denFor(c: Creature, w: World): [number, number] {
  if (c.denX >= 0) return [c.denX, c.denZ];
  const R = w.region;
  let bx = c.homeX, bz = c.homeZ, bs = -1e9;
  for (let k = 0; k < 12; k++) {
    const a = Math.random() * TAU, d = 2 + Math.random() * 12;
    const x = clamp(c.homeX + Math.cos(a) * d, 3, R.N - 3), z = clamp(c.homeZ + Math.sin(a) * d, 3, R.N - 3);
    if (R.isWater(x, z) || R.isSolid(x, z)) continue;
    let rock = 0;
    for (let j = 0; j < 4; j++) if (R.isSolid(x + Math.cos(j * 1.57) * 1.6, z + Math.sin(j * 1.57) * 1.6)) rock++;
    const s = w.eco.coverAt(x, z) * 2 + rock * 0.6 - dangerAt(c, w, x, z) * 2 - w.eco.moisture(x, z) * 0.5 + Math.random() * 0.3;
    if (s > bs) { bs = s; bx = x; bz = z; }
  }
  c.denX = bx; c.denZ = bz;
  return [bx, bz];
}
/** a place to go: sample around a centre and keep the best by what this animal wants */
function placeFor(c: Creature, w: World, P: Profile, cx: number, cz: number, rad: number, tries = 7): [number, number] {
  const R = w.region;
  let bx = cx, bz = cz, bs = -1e9;
  for (let k = 0; k < tries; k++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * rad;
    const x = clamp(cx + Math.cos(a) * d, 2.5, R.N - 2.5), z = clamp(cz + Math.sin(a) * d, 2.5, R.N - 2.5);
    if (R.isWater(x, z) && !c.walker.swim && !c.canFly) continue;
    if (R.isSolid(x, z)) continue;
    const s = w.eco.placeScore(x, z, P.guild, c.faction) - dangerAt(c, w, x, z) * 1.5 + Math.random() * 0.6 - d * 0.01;
    if (s > bs) { bs = s; bx = x; bz = z; }
  }
  return [bx, bz];
}
function leaderOf(w: World, c: Creature): Creature | null {
  const h = c.herd ? w.herds.get(c.herd) : null;
  if (!h) return null;
  let best: Creature | null = null;
  for (const o of h) if (!o.dead && o.faction === c.faction && o.mature && (!best || o.boss || o.age > best.age && !best.boss)) best = o;
  return best;
}

// ================================================================================================ thinking
export function think(c: Creature, w: World) {
  c.thinkT = 0;
  if (c.dead || c.mind === 'held') return;
  // at work in the factory or the biotech works: their jobs drive them, not the daily round
  const job = c as unknown as { __job?: number; __bjob?: number };
  if (job.__job === 1 || job.__bjob === 1) return;
  // ---- orders (player / rival)
  if (c.order) {
    const o = c.order;
    if (o.kind === 'attack') {
      const t = w.get(o.target ?? 0);
      if (!t || t.dead) { c.order = null; c.mind = 'idle'; return; }
      c.mind = 'attack'; c.target = t.id; return;
    }
    if (o.kind === 'amove' || o.kind === 'guard') {
      const foe = enemyNear(c, w, c.st.sight * 0.9);
      if (foe) { c.mind = 'attack'; c.target = foe.id; return; }
    }
    if (o.kind === 'hold') { const foe = enemyNear(c, w, c.st.reach + c.radius + 1); c.mind = foe ? 'attack' : 'idle'; c.target = foe?.id ?? 0; return; }
    c.mind = 'order'; return;
  }
  // ---- the golem
  if (c.faction !== 'veyr' && golemMind(c, w)) return;
  if (c.faction === 'wild') thinkWild(c, w);
  else thinkOwned(c, w);
}

/** owned creatures: defend, eat, breed on the moss, keep near home */
function thinkOwned(c: Creature, w: World) {
  const hungry = c.energy < 0.4;
  const foe = enemyNear(c, w, c.st.sight * (c.diet === 'carn' ? 0.8 : 0.45));
  if (foe && (c.diet !== 'herb' || foe.target === c.id || c.st.attack > 4)) { c.mind = 'attack'; c.target = foe.id; return; }
  if (c.mind === 'flee' && c.fleeT > 0) return;
  if (c.mind === 'eat' && c.energy < 0.97) return;
  if (hungry) {
    const diet = c.diet;
    if (diet === 'carn' || diet === 'omni' || diet === 'scav') {
      const cp = corpseFor(c, w, null);
      if (cp) { c.mind = 'scavenge'; c.target = cp.id; return; }
      if (diet !== 'scav') { const pr = preyFor(c, w); if (pr) { c.mind = 'hunt'; c.target = pr.id; return; } }
    }
    if (diet === 'herb' || diet === 'omni' || diet === 'scav') {
      const p = plantFor(c, w, c.st.sight);
      if (p >= 0) { c.mind = 'graze'; c.target = -1 - p; c.goalX = w.flora.x[p]; c.goalZ = w.flora.z[p]; return; }
    }
  }
  if (c.mature && c.energy > 0.82 && w.canBreed(c)) {
    c.gestT += THINK;
    if (c.gestT >= c.st.gestation) { w.breed(c); c.gestT = 0; c.energy -= 0.3; }
  }
  if (c.mind === 'wander' && Math.hypot(c.goalX - c.x, c.goalZ - c.z) > 1) return;
  if (Math.random() < 0.15) {
    const rad = 3 + c.size * 2;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * TAU, d = Math.random() * rad;
      const gx = clamp(c.homeX + Math.cos(a) * d, 2, w.region.N - 2), gz = clamp(c.homeZ + Math.sin(a) * d, 2, w.region.N - 2);
      if (!w.region.isWater(gx, gz) || c.walker.swim || c.canFly) { c.mind = 'wander'; c.goalX = gx; c.goalZ = gz; c.path = null; return; }
    }
  }
  if (c.mind !== 'wander') c.mind = 'idle';
}

function thinkWild(c: Creature, w: World) {
  const P = profileOf(c, w), eco = w.eco;
  const awake = activity(P.sched, w.day);
  const hunger = 1 - c.energy;
  // ---- the herd saw the golem strike one of them
  if (c.herd && c.mind !== 'flee' && c.alarmT <= 0) {
    const h = w.herds.get(c.herd);
    if (h) for (const o of h) if (o !== c && !o.dead && w.time - o.golemHit < 1.5 && (o.x - c.x) ** 2 + (o.z - c.z) ** 2 < 400) {
      const G = GOLEM_REF.g;
      if (G && (P.guild !== 'predator' || c.mass < G.mass)) { bolt(c, w, GOLEM, 4); alarm(c, w, GOLEM); return; }
    }
  }
  // ---- danger first
  const th = threatOf(c, w);
  if (th && c.mind === 'curl' && c.actT < 14 && keepGoing(c, w, P, awake)) { c.target = th.id; return; }
  if (th) {
    // cornered predators and big animals fight back; mothers stand over their young
    const young = !!th.target && w.get(th.target)?.mother === c.id;
    if (c.diet === 'carn' && c.mass > th.mass * 0.7 || c.boss || (young && c.mass > th.mass * 0.6)) { setMind(c, 'attack'); c.target = th.id; if (young) emote(c, Emote.ANGRY); return; }
    if (c.mass < th.mass * 1.4 || c.hp < c.maxHp * 0.4) {
      const was = c.mind === 'flee';
      bolt(c, w, th.id);
      if (!was) alarm(c, w, th.id);
      return;
    }
  }
  if (c.mind === 'flee' && c.fleeT > 0) return;
  // a hunter in view but keeping its distance: stop and watch it (head up, ears up)
  if (watched && (c.mind === 'idle' || c.mind === 'wander' || c.mind === 'graze') && Math.random() < 0.5) { const o = watched as Creature; setMind(c, 'idle'); c.goalX = o.x; c.goalZ = o.z; c.target = 0; c.alarmBy = -o.id; return; }
  // ---- carry on with what it is doing
  if (keepGoing(c, w, P, awake)) return;
  c.plan = null;
  // ---- a juvenile keeps to its mother
  if (!c.mature && c.mother) { const m = w.get(c.mother); if (m && !m.dead && m.faction === c.faction) { juvenile(c, w, m); return; } c.mother = 0; }
  // ---- birth: go home to the den or nest first
  if (c.preg > 0 && c.preg < 20 && P.den) { const [dx, dz] = denFor(c, w); if (dist(c, dx, dz) > 3) { travel(c, w, dx, dz, 'rest'); return; } }
  // ---- needs, by utility
  const night = 1 - awake;
  const sleepy = night * (0.5 + c.tired) + (c.tired > 0.92 ? 0.8 : 0);
  let uEat = Math.pow(hunger, 1.4) * (0.35 + 0.75 * awake) + (hunger > 0.78 ? 0.7 : 0) + (hunger > 0.9 ? 1.2 : 0);
  let uDrink = Math.pow(c.thirst, 1.3) * 1.25 + (c.thirst > 0.85 ? 0.8 : 0) + (morning(P.sched, w.day) && c.thirst > 0.12 ? 0.35 : 0) + (evening(P.sched, w.day) && c.thirst > 0.25 ? 0.5 : 0);
  const uSleep = sleepy * (1 - Math.max(0, hunger - 0.7)) - (c.thirst > 0.8 ? 0.4 : 0);
  const hot = w.region.biome.temp > 0.6 || eco.moisture(c.x, c.z) < 0.25;
  const uShade = P.shade && hot && midday(w.day) && awake > 0.5 ? 0.55 - hunger * 0.4 - c.thirst * 0.3 : 0;
  const uMate = c.mature && c.preg <= 0 && c.breedCD <= 0 && c.energy > 0.66 && c.thirst < 0.5 && awake > 0.4 ? 0.45 + eco.seasonK * 0.1 : 0;
  if (P.guild === 'predator' || P.guild === 'scavenger') uEat *= c.cdHunt > 0 ? 0.4 : 1;
  if (P.thirstK < 0.5 && eco.moisture(c.x, c.z) > 0.55) uDrink *= 0.3;
  const best = Math.max(uEat, uDrink, uSleep, uShade, uMate, 0.22);
  if (best === uSleep && uSleep > 0.3 && goSleep(c, w, P)) return;
  if (best === uDrink && uDrink > 0.25 && goDrink(c, w, P)) return;
  if (best === uEat && uEat > 0.2 && forage(c, w, P, hunger)) return;
  if (best === uShade && goShade(c, w)) return;
  if (best === uMate && court(c, w)) return;
  // ---- territory: rivals get a display
  if (P.territorial && c.mature && c.cdDisplay <= 0 && awake > 0.4 && rival(c, w, P)) return;
  // ---- scavengers shadow hunters (a kill is coming)
  if (P.guild === 'scavenger' && awake > 0.5 && Math.random() < 0.15) {
    let hunter: Creature | null = null;
    w.near(c.x, c.z, 30, (o) => { if (!hunter && !o.dead && o.faction === 'wild' && (o.mind === 'hunt' || o.mind === 'stalk')) hunter = o; });
    if (hunter) { const h = hunter as Creature; c.mind = 'wander'; c.goalX = h.x + (c.x - h.x) * 0.4; c.goalZ = h.z + (c.z - h.z) * 0.4; c.path = null; return; }
  }
  // ---- lures (bait, water, the Veyr's sown plants) and the daily round
  if (c.mind === 'wander' && Math.hypot(c.goalX - c.x, c.goalZ - c.z) > 1) return;
  roam(c, w, P, awake);
}

/** is the current activity still the right one? (true: keep at it) */
function keepGoing(c: Creature, w: World, P: Profile, awake: number): boolean {
  switch (c.mind) {
    case 'eat': if (c.digging && c.mind === 'eat') return c.actT < 14 && c.energy < 0.96; return c.energy < 0.97 && c.actT < 30;
    case 'drink': return c.thirst > 0.03 && c.actT < 20;
    case 'sleep': {
      const wake = (awake > 0.55 && c.tired < 0.45) || (c.tired <= 0.02 && awake > 0.25) || c.energy < 0.12 || c.thirst > 0.92 || c.aggro > 0;
      if (wake) { c.emote = Emote.NONE; return false; }
      return true;
    }
    case 'watch': {
      const hs = c.herd ? w.eco.herdSleep.get(c.herd) : null;
      if (!hs || hs.sentry !== c.id || awake > 0.55) return false;
      // a hungry or parched sentry hands over the watch
      if (c.energy < 0.25 || c.thirst > 0.75) { handOver(c, w, hs); return false; }
      if (w.time > hs.until) { handOver(c, w, hs); return false; }
      return true;
    }
    case 'rest': return c.actT < (c.stam < 0.3 ? 9 : P.shade && midday(w.day) ? 50 : 14) && c.energy > 0.2 && c.thirst < 0.75;
    case 'mate': return c.actT < 6.5 && !!w.get(c.mate) && !w.get(c.mate)!.dead;
    case 'display': return c.actT < 3.2;
    case 'carry': return !!c.carry && c.actT < 14;
    case 'stalk': case 'ambush': return c.actT < (c.mind === 'ambush' ? 45 : 26) && !!w.get(c.target) && !w.get(c.target)!.dead || (c.mind === 'ambush' && c.actT < 45 && c.energy > 0.15);
    case 'hunt': return (!!w.get(c.target) && !w.get(c.target)!.dead) || c.target === GOLEM;
    case 'attack': return (!!w.get(c.target) && !w.get(c.target)!.dead && c.actT < 12) || c.target === GOLEM;
    case 'scavenge': { const cp = w.get(c.target); return !!cp && cp.dead && cp.bio > 0.5 && c.actT < 40; }
    case 'graze': return w.flora.bio[-1 - c.target] > 0.05 && c.actT < 15;
    case 'travel': {
      if (c.actT > 60) return false;
      // nearly there and taking too long (crowded, blocked): do it here
      if (c.actT > 20 && dist(c, c.goalX, c.goalZ) < 9 && (c.plan === 'sleep' || c.plan === 'watch' || c.plan === 'rest')) { const p = c.plan; c.plan = null; setMind(c, p); return true; }
      // drop the trip for something urgent
      if (c.plan !== 'drink' && c.thirst > 0.85 || c.plan !== 'eat' && c.energy < 0.1) return false;
      return true;
    }
    case 'follow': return false;
    case 'curl': {
      const on = c.actT < 14 && (c.actT < (c.roller ? 3 : 2) || stillThreatened(c, w, c.roller ? 7 : 5));
      if (!on) c.cdCurl = 6;
      return on;
    }
  }
  return false;
}

function juvenile(c: Creature, w: World, m: Creature) {
  const d = dist(c, m.x, m.z), near = 2 + m.radius * 2;
  if (m.mind === 'sleep' || m.mind === 'watch') { if (d < near + 1) { setMind(c, 'sleep'); return; } }
  if (m.mind === 'drink' && c.thirst > 0.15 && d < 5) { setMind(c, 'drink'); c.goalX = m.goalX; c.goalZ = m.goalZ; return; }
  if (d > near + 1.5 || m.mind === 'flee') { setMind(c, 'follow'); c.target = m.id; return; }
  if (c.energy < 0.7) {
    const p = plantFor(c, w, 4, m.x, m.z);
    if (p >= 0) { setMind(c, 'graze'); c.target = -1 - p; c.goalX = w.flora.x[p]; c.goalZ = w.flora.z[p]; return; }
    if (m.mind === 'eat' && m.target > 0) { setMind(c, 'scavenge'); c.target = m.target; return; }
  }
  // play: little runs round the mother
  if (Math.random() < 0.3) { const a = Math.random() * TAU; c.mind = 'wander'; c.goalX = m.x + Math.cos(a) * near; c.goalZ = m.z + Math.sin(a) * near; c.path = null; return; }
  setMind(c, 'idle');
}

function goSleep(c: Creature, w: World, P: Profile): boolean {
  const eco = w.eco;
  // an exhausted animal in its waking hours just naps where it is
  if (activity(P.sched, w.day) > 0.55) { setMind(c, 'sleep'); emote(c, Emote.SLEEP, 3); return true; }
  if ((P.social === 'herd' || P.social === 'swarm' || P.social === 'pack') && c.herd && !P.den && !c.rooster) {
    // the herd beds down together; one keeps watch
    // a fresh bed each night (a spot older than most of a day is last night's)
    let hs = eco.herdSleep.get(c.herd);
    if (!hs || w.time - hs.day > w.dayLen * 0.6) {
      const L = leaderOf(w, c) ?? c;
      // open ground with a view, not in danger, not in the water
      const [x, z] = placeFor(L, w, P, L.x, L.z, 6, 5);
      hs = { x, z, day: w.time, sentry: P.sentry && c.energy > 0.35 ? c.id : 0, until: w.time + 40 };
      eco.herdSleep.set(c.herd, hs);
    }
    const a = (c.id * 2.399) % TAU, r = 0.8 + c.radius * 2 + (c.id % 3) * 0.7 * P.spread / 5;
    let x = hs.x + Math.cos(a) * r, z = hs.z + Math.sin(a) * r;
    if (w.region.isWater(x, z) || w.region.isSolid(x, z)) { x = hs.x; z = hs.z; }
    if (dist(c, x, z) > 1.6) { travel(c, w, x, z, hs.sentry === c.id ? 'watch' : 'sleep'); return true; }
    if (hs.sentry === c.id && c.tired > 0.85) handOver(c, w, hs);
    if (hs.sentry === c.id) { setMind(c, 'watch'); emote(c, Emote.WATCH, 2); return true; }
    setMind(c, 'sleep'); emote(c, Emote.SLEEP, 3);
    return true;
  }
  if (c.rooster) {
    // bats hang by day under a rock overhang or a branch
    const r = roostFor(c, w);
    if (r) { if (dist(c, r[0], r[1]) > 1) { travel(c, w, r[0], r[1], 'sleep'); return true; } }
  } else if (P.den) {
    const [x, z] = denFor(c, w);
    if (dist(c, x, z) > 2.5) { travel(c, w, x, z, 'sleep'); return true; }
  }
  setMind(c, 'sleep'); emote(c, Emote.SLEEP, 3);
  return true;
}
/** a roost: under an arch or a tall slab's lip, the side of a spire or boulder, else under a tree's branch */
function roostFor(c: Creature, w: World): [number, number] | null {
  if (c.denX >= 0 && c.roostH > 0) return [c.denX, c.denZ];
  const R = w.region, fl = w.flora;
  let best: [number, number, number] | null = null, bs = 1e9;
  for (const r of R.rocks) {
    if (r.kind !== 'arch' && r.kind !== 'slab' && r.kind !== 'boulder' && r.kind !== 'spire' && r.kind !== 'column') continue;
    if (r.sy < 1.5) continue;
    const d = Math.hypot(r.x - c.homeX, r.z - c.homeZ); if (d > 45 || d > bs) continue;
    // under the arch's span, or tucked against the overhanging side (away from the noon sun)
    const a = r.yaw + Math.PI * 0.5 + (c.id % 2) * Math.PI, off = r.kind === 'arch' ? 0 : Math.max(r.sx, r.sz) * 0.55 + 0.25;
    const x = r.x + Math.cos(a) * off, z = r.z + Math.sin(a) * off;
    if (R.isWater(x, z)) continue;
    bs = d; best = [x, z, Math.max(1.2, r.y + r.sy * (r.kind === 'arch' ? 0.82 : 0.7) - R.heightAt(x, z))];
  }
  if (!best) fl.near(c.homeX, c.homeZ, 30, (i, d2) => {
    const sp = fl.species[fl.sp[i]];
    if (!sp.tree || fl.bio[i] < 0.3 || !w.eco.plantAlive(i) || d2 > bs * bs) return;
    const a = (i * 2.399) % TAU;
    bs = Math.sqrt(d2); best = [fl.x[i] + Math.cos(a) * 0.9, fl.z[i] + Math.sin(a) * 0.9, Math.max(1.4, sp.hmin * 0.6)];
  });
  if (!best) return null;
  const b = best as [number, number, number];
  c.denX = b[0]; c.denZ = b[1]; c.roostH = b[2];
  return [b[0], b[1]];
}
/** the sentry hands the watch to the most rested sleeper */
function handOver(c: Creature, w: World, hs: { sentry: number; until: number }) {
  const h = c.herd ? w.herds.get(c.herd) : null;
  let next: Creature | null = null;
  if (h) for (const o of h) if (o !== c && !o.dead && o.mature && o.mind === 'sleep' && o.energy > 0.3 && (!next || o.tired < next.tired)) next = o;
  if (!next) { hs.until = w.time + 30; if (c.tired > 0.85) { hs.sentry = 0; setMind(c, 'sleep'); } return; }
  hs.sentry = next.id; hs.until = w.time + 35 + Math.random() * 20;
  setMind(next, 'watch'); emote(next, Emote.WATCH, 2);
  setMind(c, 'sleep'); emote(c, Emote.SLEEP, 3);
}

function goDrink(c: Creature, w: World, P: Profile): boolean {
  if (c.walker.swim && w.region.isWater(c.x, c.z)) { setMind(c, 'drink'); c.goalX = c.x + Math.sin(c.yaw); c.goalZ = c.z + Math.cos(c.yaw); return true; }
  const at = waterFor(c, w);
  if (!at) {
    // no water known: head downhill, the way water runs
    const R = w.region;
    let bx = c.x, bz = c.z, bh = R.heightAt(c.x, c.z);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, x = clamp(c.x + Math.cos(a) * 14, 3, R.N - 3), z = clamp(c.z + Math.sin(a) * 14, 3, R.N - 3), h = R.heightAt(x, z); if (h < bh) { bh = h; bx = x; bz = z; } }
    c.mind = 'wander'; c.goalX = bx; c.goalZ = bz; c.path = null; emote(c, Emote.SEARCH, 2);
    return true;
  }
  void P;
  if (dist(c, at[0], at[1]) > 1.3 + c.radius) { travel(c, w, at[0], at[1], 'drink'); return true; }
  startDrink(c, w, at[0], at[1]);
  return true;
}
function startDrink(c: Creature, w: World, x: number, z: number) {
  const R = w.region;
  // face the water: the neighbouring column that is wet
  let fx = x + Math.sin(c.yaw), fz = z + Math.cos(c.yaw);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, X = x + Math.cos(a) * 1.2, Z = z + Math.sin(a) * 1.2; if (R.isWater(X, Z)) { fx = X; fz = Z; break; } }
  c.goalX = fx; c.goalZ = fz;
  setMind(c, 'drink'); emote(c, Emote.DRINK, 2.4);
  remember(mem(c).water, x, z, w.time, 1, 3);
}

function goShade(c: Creature, w: World): boolean {
  const t = treeNear(c, w, 14);
  if (t) {
    const a = Math.atan2(c.z - t[1], c.x - t[0]), x = t[0] + Math.cos(a) * 1.6, z = t[1] + Math.sin(a) * 1.6;
    if (dist(c, x, z) > 1.5) { travel(c, w, x, z, 'rest'); return true; }
  }
  setMind(c, 'rest'); emote(c, Emote.SHADE, 2.4);
  return true;
}

function court(c: Creature, w: World): boolean {
  if (!w.canBreed(c)) { c.breedCD = 20; return false; }
  let p: Creature | null = null, bd = 1e9;
  w.near(c.x, c.z, c.st.sight * 1.2, (o) => {
    if (o === c || o.dead || o.sp !== c.sp || o.faction !== 'wild' || !o.mature || o.preg > 0 || o.breedCD > 0 || o.energy < 0.5) return;
    if (o.mind === 'flee' || o.mind === 'hunt' || o.mind === 'sleep' || o.mind === 'mate') return;
    const d = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d < bd) { bd = d; p = o; }
  });
  if (!p) {
    // no partner about: small, many-young kinds and lines down to their last few lay or bud alone
    if (c.mass < 40 || c.st.litter >= 2 || c.sp.alive < 4) { c.preg = c.st.gestation * 0.8; c.breedCD = c.st.gestation * 1.6 + 30; emote(c, Emote.NEST, 2); return true; }
    c.breedCD = 15 + Math.random() * 15; return false;
  }
  const o = p as Creature;
  c.mate = o.id; o.mate = c.id; setMind(c, 'mate'); setMind(o, 'mate'); o.plan = null; o.path = null; c.path = null;
  emote(c, Emote.LOVE, 3); emote(o, Emote.LOVE, 3);
  return true;
}

/** a same-kind rival on its ground: display, then one backs down (or they fight) */
function rival(c: Creature, w: World, P: Profile): boolean {
  if (dist(c, c.homeX, c.homeZ) > P.range * 0.6) return false;
  let r: Creature | null = null;
  w.near(c.x, c.z, 9, (o) => {
    if (r || o === c || o.dead || o.faction !== 'wild' || !o.mature || (o.herd && o.herd === c.herd)) return;
    if (o.sp !== c.sp && !(P.guild === 'predator' && o.diet === 'carn' && o.mass > c.mass * 0.5 && o.mass < c.mass * 2)) return;
    if (o.mind === 'flee' || o.mind === 'sleep' || o.mind === 'display' || o.mind === 'mate') return;
    r = o;
  });
  if (!r) { c.cdDisplay = 6; return false; }
  const o = r as Creature;
  c.target = o.id; o.target = c.id; setMind(c, 'display'); setMind(o, 'display'); o.path = null; c.path = null;
  emote(c, Emote.ANGRY, 3); emote(o, Emote.ANGRY, 3);
  c.cdDisplay = o.cdDisplay = 40 + Math.random() * 30;
  return true;
}

/** food by guild: plants, fruit, prey, carrion, an ambush at the water */
function forage(c: Creature, w: World, P: Profile, hunger: number): boolean {
  const diet = c.diet, eco = w.eco;
  if (diet === 'carn' || diet === 'omni' || diet === 'scav') {
    const cp = corpseFor(c, w, P);
    if (cp) { setMind(c, 'scavenge'); c.target = cp.id; return true; }
    // hunters (and small carrion-eaters that will take what they can overpower)
    if ((P.guild === 'predator' || P.guild === 'decomposer' && diet === 'carn') && c.cdHunt <= 0) {
      const pr = preyFor(c, w);
      if (pr) {
        const d = dist(c, pr.x, pr.z);
        c.target = pr.id; c.path = null;
        if (d < 4 + c.speed * 0.5) setMind(c, 'hunt'); else setMind(c, 'stalk');
        return true;
      }
      // lie in wait where the herds drink
      if (P.ambush && hunger > 0.35) {
        const sh = eco.shoreNear(c.x, c.z);
        if (sh && dist(c, sh[0], sh[1]) < P.range) {
          const a = Math.random() * TAU, x = sh[0] + Math.cos(a) * 2.5, z = sh[1] + Math.sin(a) * 2.5;
          if (dist(c, x, z) > 2) { travel(c, w, x, z, 'ambush'); return true; }
          setMind(c, 'ambush'); c.target = 0; return true;
        }
      }
    }
  }
  // long snouts: root out grubs where the ground is rich with rot and dung
  if (c.prober) {
    let bx = c.x, bz = c.z, bs = eco.grubsAt(c.x, c.z);
    for (let k = 0; k < 6; k++) { const a = Math.random() * TAU, d = 3 + Math.random() * 12, x = clamp(c.x + Math.cos(a) * d, 2, w.region.N - 2), z = clamp(c.z + Math.sin(a) * d, 2, w.region.N - 2); if (w.region.isWater(x, z)) continue; const s = eco.grubsAt(x, z) - d * 0.004 - dangerAt(c, w, x, z); if (s > bs) { bs = s; bx = x; bz = z; } }
    if (bs > 0.12) { if (dist(c, bx, bz) > 1.5) travel(c, w, bx, bz, 'eat'); else { setMind(c, 'eat'); c.target = 0; c.digging = true; } return true; }
  }
  if (P.fruit) {
    const f = eco.fruitNear(c.x, c.z, Math.min(c.st.sight, 18));
    if (f >= 0) { setMind(c, 'graze'); c.target = -1 - f; c.goalX = w.flora.x[f]; c.goalZ = w.flora.z[f]; c.picking = true; return true; }
  }
  // plants: grazers, omnivores, and scavengers when there is no carrion
  if (diet === 'herb' || diet === 'omni' || diet === 'scav' && (P.guild !== 'scavenger' || hunger > 0.55)) {
    const p = plantFor(c, w, Math.min(c.st.sight, 12));
    if (p >= 0 && dangerAt(c, w, w.flora.x[p], w.flora.z[p]) < 0.8) {
      setMind(c, 'graze'); c.target = -1 - p; c.goalX = w.flora.x[p]; c.goalZ = w.flora.z[p]; c.picking = false;
      remember(mem(c).food, w.flora.x[p], w.flora.z[p], w.time, eco.vegetation(c.x, c.z), 4);
      return true;
    }
  }
  // nothing here: go where food is (remembered patches, then the best ground around)
  let goal: [number, number] | null = null;
  if (c.mem) { let bs = -1e9; for (const s of c.mem.food) { const sc = s.v - dist(c, s.x, s.z) * 0.02 - (w.time - s.t) * 0.002 - dangerAt(c, w, s.x, s.z); if (sc > bs && dist(c, s.x, s.z) > 6) { bs = sc; goal = [s.x, s.z]; } } }
  if (!goal || Math.random() < 0.5) goal = placeFor(c, w, P, c.x, c.z, P.guild === 'predator' ? P.range : 28, 9);
  if (P.social === 'herd' && c.herd) { const L = leaderOf(w, c); if (L && L !== c) { goal = null; } else { c.homeX = goal[0]; c.homeZ = goal[1]; } }
  if (goal) { c.mind = 'wander'; c.goalX = goal[0]; c.goalZ = goal[1]; c.path = null; if (hunger > 0.6) emote(c, Emote.HUNGRY, 2); return true; }
  return false;
}

/** the daily round: follow the herd, answer lures, patrol, drift home in the evening */
function roam(c: Creature, w: World, P: Profile, awake: number) {
  const eco = w.eco, R = w.region;
  // lures: bait, watered ground, the Veyr's fields
  const pull = eco.pullFor(c.x, c.z, P.guild);
  if (pull && Math.random() < 0.6) {
    const a = Math.random() * TAU, r = Math.random() * Math.min(4, pull.r * 0.25);
    if (P.social === 'herd') { c.homeX = pull.x; c.homeZ = pull.z; }
    c.mind = 'wander'; c.goalX = clamp(pull.x + Math.cos(a) * r, 2, R.N - 2); c.goalZ = clamp(pull.z + Math.sin(a) * r, 2, R.N - 2); c.path = null;
    return;
  }
  // herds: the leader picks the next patch (and moves the herd on when the ground is grazed out)
  const L = c.herd && (P.social === 'herd' || P.social === 'pack' || P.social === 'swarm') ? leaderOf(w, c) : null;
  if (L === c && awake > 0.4) {
    const here = eco.placeScore(c.x, c.z, P.guild, c.faction);
    if (here < 0.55 || Math.random() < 0.04) {
      const [x, z] = placeFor(c, w, P, c.x, c.z, here < 0.2 ? P.range * 1.6 : P.range * 0.8, 10);
      if (eco.placeScore(x, z, P.guild, c.faction) > here + 0.2) { c.homeX = x; c.homeZ = z; }
    }
  }
  if (L && L !== c) { c.homeX = L.homeX; c.homeZ = L.homeZ; }
  // evening: drift back toward the den
  if (P.den && awake < 0.5 && c.denX >= 0 && dist(c, c.denX, c.denZ) > 6) { c.mind = 'wander'; c.goalX = c.denX; c.goalZ = c.denZ; c.path = null; return; }
  if (Math.random() < 0.38) {
    const hc = L ? w.herdCenter(c) : null;
    const cx = hc ? hc[0] * 0.6 + c.homeX * 0.4 : c.homeX, cz = hc ? hc[1] * 0.6 + c.homeZ * 0.4 : c.homeZ;
    const rad = L ? P.spread + c.size * 2 : P.guild === 'predator' ? P.range * 0.5 : 6 + c.size * 4;
    const [x, z] = placeFor(c, w, P, cx, cz, rad, 5);
    c.mind = 'wander'; c.goalX = x; c.goalZ = z; c.path = null;
    return;
  }
  // a grazer with nothing to do crops what is under its nose
  if (c.diet !== 'carn' && c.energy < 0.9 && Math.random() < 0.5) { const p = plantFor(c, w, 3); if (p >= 0) { setMind(c, 'graze'); c.target = -1 - p; c.goalX = w.flora.x[p]; c.goalZ = w.flora.z[p]; return; } }
  if (c.mind !== 'wander') setMind(c, 'idle');
}

/** decide about the golem: true when it now drives this creature's mind */
function golemMind(c: Creature, w: World): boolean {
  const G = GOLEM_REF.g;
  if (!G || !G.alive) { if (c.target === GOLEM) { c.target = 0; c.mind = 'idle'; } return false; }
  const d = Math.hypot(G.x - c.x, G.z - c.z), sight = c.st.sight;
  if (c.target === GOLEM && (c.mind === 'attack' || c.mind === 'hunt')) {
    if (d > sight * 1.6 && c.aggro <= 0) { c.mind = 'idle'; c.target = 0; return false; }
    if (c.faction === 'wild' && c.hp < c.maxHp * 0.2 && !c.boss) { bolt(c, w, GOLEM, 4); alarm(c, w, GOLEM); return true; }
    return true;
  }
  if (c.target === GOLEM && c.mind === 'flee' && c.fleeT > 0) return true;
  const fighter = c.boss || c.faction === 'rival' || c.diet === 'carn' || (c.diet === 'omni' && c.mass > G.mass * 0.6) || c.mass > G.mass * 5;
  // provoked: fight back if it can, bolt if it can't (and the herd bolts with it)
  if (c.aggro > 0 && d < sight * 1.5) {
    if (fighter && c.hp > c.maxHp * 0.25) { c.mind = 'attack'; c.target = GOLEM; c.path = null; if (c.faction === 'wild') emote(c, Emote.ANGRY, 2); return true; }
    if (c.faction === 'wild') { bolt(c, w, GOLEM, 3); alarm(c, w, GOLEM); return true; }
    c.mind = 'flee'; c.target = GOLEM; c.fleeT = 3; return true;
  }
  // predators stalk it on sight (more at their hunting hour); rival broods go straight for it
  if (d < sight * 0.6 && ((c.diet === 'carn' && c.mass > G.mass * 0.7 && c.energy < 0.92 && c.mind !== 'sleep' && Math.random() < 0.3) || (c.faction === 'rival' && Math.random() < 0.5))) {
    c.mind = 'hunt'; c.target = GOLEM; c.aggro = Math.max(c.aggro, 8); c.path = null; return true;
  }
  // small timid things keep clear of it (sleepers only notice it close up)
  const shy = c.faction === 'wild' && !fighter && c.mass < G.mass * 3;
  if (shy && d < (c.mind === 'sleep' ? 1.2 : 2.6) + c.radius) { bolt(c, w, GOLEM, 1.2); if (c.mass < G.mass) alarm(c, w, GOLEM, 8); return true; }
  return false;
}
/** chase the golem and swing at it */
function chaseGolem(c: Creature, w: World, dt: number) {
  const G = GOLEM_REF.g;
  if (!G || !G.alive) { c.mind = 'idle'; c.target = 0; return; }
  const reach = c.st.reach + c.radius + G.radius;
  const d = Math.hypot(G.x - c.x, G.z - c.z);
  if (d > reach * 0.85) go(c, w, G.x, G.z, d < 10 ? 1 : 0.8, dt, true);
  else { c.steer(w, c.x, c.z, 0, dt); c.face(G.x, G.z, dt); }
  if (d < reach + 0.25 && c.atkT <= 0 && c.atkAnim < 0) { c.atkAnim = 0; c.atkT = 1 / c.st.attackRate; }
}
function strikeGolem(c: Creature) {
  const G = GOLEM_REF.g;
  if (!G || !G.alive) return;
  const d = Math.hypot(G.x - c.x, G.z - c.z);
  if (d > c.st.reach + c.radius + G.radius + 0.35 || Math.abs(G.y - (c.y + c.air)) > 1.2 + c.size) return;
  G.hurt(c.st.attack * (0.6 + 0.4 * c.growth) * (0.85 + Math.random() * 0.3), c);
}

function enemyNear(c: Creature, w: World, r: number): Creature | null {
  let best: Creature | null = null, bd = r * r;
  w.near(c.x, c.z, r, (o) => {
    if (o.dead || o.faction === c.faction) return;
    if (c.faction !== 'wild' && o.faction === 'wild' && o.target !== c.id && c.diet === 'herb') return;
    const d = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

// ================================================================================================ doing
/** per-frame execution of the current mind */
export function act(c: Creature, w: World, dt: number) {
  if (c.dead) return;
  c.thinkT += dt; c.actT += dt;
  if (c.emoteT > 0) { c.emoteT -= dt; if (c.emoteT <= 0) c.emote = Emote.NONE; }
  if (c.fear > 0) c.fear -= dt;
  // a bat asleep at its roost hangs up there; awake, it drops off and flies
  if (c.roostH > 0 || c.perch > 0) {
    const hang = c.mind === 'sleep' && c.roostH > 0 && dist(c, c.denX, c.denZ) < 1.2;
    const lift = hang ? Math.max(0, c.roostH - c.sp.model.rig.rideH * 2.2 * c.growth) : 0;
    const was = c.perch;
    c.perch += (lift - c.perch) * Math.min(1, dt * (hang ? 1.5 : 4));
    if (c.perch < 0.02 && !hang) c.perch = 0;
    if (c.perch > 0 || was > 0) c.air = c.perch;
  }
  if (c.thinkT >= (c.far ? THINK_FAR : THINK)) think(c, w);
  if (c.stunT > 0) { c.stunT -= dt; c.vx *= 0.8; c.vz *= 0.8; return; }
  if (c.mind === 'held') { c.vx *= 0.6; c.vz *= 0.6; return; }
  if (c.fleeT > 0) c.fleeT -= dt;
  if (c.aggro > 0) c.aggro -= dt;
  if (c.atkT > 0) c.atkT -= dt;
  // the herd's alarm reaches it
  if (c.alarmT > 0) {
    c.alarmT -= dt;
    if (c.alarmT <= 0 && c.mind !== 'flee' && c.faction === 'wild' && c.mind !== 'attack') {
      const by = c.alarmBy, th = by === GOLEM ? GOLEM_REF.g : w.get(by);
      if (th && (by === GOLEM || !(th as Creature).dead)) { bolt(c, w, by, 2.5); alarm(c, w, by, 10); }
    }
  }
  // pregnancy runs its course
  if (c.preg > 0) {
    c.preg -= dt;
    if (c.preg <= 0) {
      c.preg = 0;
      // the land decides: past what it carries, most young are lost before they are born
      if (c.faction !== 'wild' || w.canBreed(c) || Math.random() < 0.25) { w.breed(c); emote(c, Emote.NEST, 3.5); c.energy -= 0.2; }
    }
  }
  if (c.atkAnim >= 0) {
    const prev = c.atkAnim;
    c.atkAnim += dt * Math.max(1.6, c.st.attackRate * 2);
    const t = w.get(c.target);
    if (prev < 0.5 && c.atkAnim >= 0.5 && t && !t.dead && Math.hypot(t.x - c.x, t.z - c.z) < c.st.reach + c.radius + t.radius + 0.6) c.strike(w, t);
    else if (prev < 0.5 && c.atkAnim >= 0.5 && c.target === GOLEM) strikeGolem(c);
    if (c.atkAnim >= 1) c.atkAnim = -1;
  }
  const running = c.mind === 'flee' || c.mind === 'hunt';
  if (!running) c.stam = Math.min(1, c.stam + dt / (c.mind === 'rest' || c.mind === 'sleep' ? 8 : 20));
  switch (c.mind) {
    case 'idle': c.steer(w, c.x, c.z, 0, dt); if (c.alarmBy < 0 && c.fear > 0) { const o = w.get(-c.alarmBy); if (o) c.face(o.x, o.z, dt); } break;
    case 'sleep': case 'rest': c.steer(w, c.x, c.z, 0, dt); break;
    case 'curl': {
      // tuck in; a roller that is pressed rolls off as a ball, downhill if it can, then lies still until it is safe
      const th = c.target === GOLEM ? GOLEM_REF.g : w.get(c.target);
      const d = th ? Math.hypot(th.x - c.x, th.z - c.z) : 99;
      if (c.roller && th) {
        if (!c.rolling && c.actT > 0.5 && c.actT < 6 && d < 7 + c.radius) c.rolling = true;
        if (c.rolling) {
          if (d > 14 || c.actT > 8) c.rolling = false;
          else { const [fx, fz] = rollDir(c, w, th.x, th.z); c.steer(w, c.x + fx * 6, c.z + fz * 6, 1.25, dt); break; }
        }
      }
      c.steer(w, c.x, c.z, 0, dt);
      break;
    }
    case 'watch': {
      // the sentry stands and looks round
      c.steer(w, c.x, c.z, 0, dt);
      const a = Math.sin(w.time * 0.5 + c.id) * 2.2 + c.id;
      c.face(c.x + Math.sin(a) * 4, c.z + Math.cos(a) * 4, dt * 0.3);
      break;
    }
    case 'wander': if (go(c, w, c.goalX, c.goalZ, c.faction === 'wild' && c.energy < 0.3 ? 0.5 : 0.38, dt) < 0.8) c.mind = 'idle'; break;
    case 'travel': {
      const late = c.plan === 'sleep' || c.plan === 'watch';
      const urgent = c.plan === 'drink' && c.thirst > 0.7 || c.energy < 0.2;
      const left = go(c, w, c.goalX, c.goalZ, urgent ? 0.75 : late ? 0.5 : 0.55, dt);
      if (left < 0.9 + c.radius * 0.5) {
        const p = c.plan; c.plan = null;
        if (p === 'drink') startDrink(c, w, c.x, c.z);
        else if (p === 'sleep') { setMind(c, 'sleep'); emote(c, Emote.SLEEP, 3); }
        else if (p === 'watch') { setMind(c, 'watch'); emote(c, Emote.WATCH, 2); }
        else if (p === 'rest') { setMind(c, 'rest'); if (c.faction === 'wild' && midday(w.day)) emote(c, Emote.SHADE, 2.4); }
        else if (p === 'ambush') { setMind(c, 'ambush'); c.target = 0; }
        else if (p === 'eat' && c.prober) { setMind(c, 'eat'); c.target = 0; c.digging = true; }
        else setMind(c, 'idle');
      }
      break;
    }
    case 'follow': {
      const m = w.get(c.target);
      if (!m || m.dead) { setMind(c, 'idle'); break; }
      const d = Math.hypot(m.x - c.x, m.z - c.z), near = 1.5 + m.radius * 2;
      if (d < near) setMind(c, 'idle');
      else go(c, w, m.x, m.z, d > 8 || m.mind === 'flee' ? 1 : 0.55, dt);
      break;
    }
    case 'drink': {
      c.steer(w, c.x, c.z, 0, dt);
      c.face(c.goalX, c.goalZ, dt);
      c.thirst = Math.max(0, c.thirst - dt * 0.2);
      if (c.actT > 1 && Math.random() < dt * 0.5) w.eco.drank(c.x, c.z);
      if (c.thirst <= 0.02) { setMind(c, 'idle'); c.emote = Emote.NONE; }
      break;
    }
    case 'order': {
      const o = c.order!;
      const left = go(c, w, o.x, o.z, 1, dt);
      if (left < 0.6 + c.radius) { if (o.kind !== 'guard') c.order = null; c.mind = 'idle'; c.homeX = c.x; c.homeZ = c.z; }
      break;
    }
    case 'flee': {
      c.stam = Math.max(0, c.stam - dt / (4 + c.st.stamina * 0.16));
      if (c.target === GOLEM) {
        const G = GOLEM_REF.g;
        if (!G) { c.mind = 'idle'; c.target = 0; break; }
        const dx = c.x - G.x, dz = c.z - G.z, d = Math.hypot(dx, dz) || 1;
        if (d > c.st.sight * 1.2 && c.fleeT <= 0) { c.mind = 'idle'; c.target = 0; break; }
        if (c.fleeT <= 0 && d > 3) { c.mind = 'idle'; c.target = 0; break; }
        fleeFrom(c, w, G.x, G.z, dt);
        break;
      }
      const t = w.get(c.target);
      if (!t || t.dead && c.fleeT <= 0) { c.mind = 'idle'; break; }
      const dx = c.x - t.x, dz = c.z - t.z, d = Math.hypot(dx, dz) || 1;
      if (d > c.st.sight * 1.2 && c.fleeT <= 0) { c.mind = 'idle'; break; }
      // run out and caught: hunch and cower (the animator's curl, half way for non-rollers)
      if (c.faction === 'wild' && c.stam < 0.06 && d < 3 + c.radius + t.radius && typeof (c.anim as unknown as { curl?: unknown }).curl === 'function') { setMind(c, 'curl'); break; }
      fleeFrom(c, w, t.x, t.z, dt);
      break;
    }
    case 'graze': {
      const p = -1 - c.target;
      if (p < 0 || w.flora.bio[p] < 0.05) { c.mind = 'idle'; break; }
      if (go(c, w, c.goalX, c.goalZ, 0.45, dt) < c.radius + 0.35) { setMind(c, 'eat'); }
      break;
    }
    case 'eat': {
      c.steer(w, c.x, c.z, 0, dt);
      if (c.digging) {
        // snout down, working the ground over in little shuffles
        if (c.target !== 0) { c.digging = false; break; }
        const got = w.eco.dig(c.x, c.z, dt * 0.06);
        c.energy = Math.min(1, c.energy + got * 2.2 / Math.pow(Math.max(1, Math.min(c.mass, 300)), 0.35)); c.gut += got * 0.5;
        if (Math.random() < dt * 0.4) c.yaw += (Math.random() - 0.5) * 1.2;
        if (got < dt * 0.004 || c.energy > 0.96 || c.actT > 14) { c.digging = false; setMind(c, 'idle'); }
        break;
      }
      if (c.target < 0) {
        const p = -1 - c.target;
        c.face(w.flora.x[p], w.flora.z[p], dt);
        // fruit: picked one at a time, the seed rides along to be dropped in the dung far away
        if (c.picking && w.eco.fruit[p] > 0) {
          if (c.actT > 1.2) {
            const got = w.eco.eatFruit(p); c.actT = 0;
            c.energy = Math.min(1, c.energy + got / Math.pow(Math.max(1, c.mass), 0.3)); c.thirst = Math.max(0, c.thirst - 0.05); c.gut += got;
            if (c.seed < 0) { c.seed = w.flora.sp[p]; c.seedT = 15 + Math.random() * 45; }
            if (c.energy > 0.95 || w.eco.fruit[p] <= 0) { c.mind = 'idle'; c.picking = false; }
          }
          break;
        }
        // big mouths take big bites
        const got = w.flora.eat(p, dt * 0.08 * Math.max(0.4, c.size) * clamp(Math.pow(c.mass / 300, 0.25), 1, 3));
        const e = got * 0.6 / Math.pow(Math.max(1, c.faction === 'wild' ? Math.min(c.mass, 450) : c.mass), 0.55);
        c.energy = Math.min(1, c.energy + e);
        if (c.faction === 'wild') {
          c.gut += e; c.thirst = Math.max(0, c.thirst - got * 0.004);
          w.eco.grazed(c.x, c.z, got);
          const pz = w.eco.poisonAt(c.x, c.z); if (pz > 0.2) c.poison = Math.max(c.poison, pz * 3);
        }
        if (got <= 0 || c.energy > 0.97) c.mind = 'idle';
      } else {
        const cp = w.get(c.target);
        if (!cp || !cp.dead || cp.bio <= 0 || cp.digest > 0.05) { c.mind = 'idle'; break; }
        c.face(cp.x, cp.z, dt);
        const take = Math.min(cp.bio, dt * (0.6 + c.mass * 0.02));
        cp.bio -= take;
        c.energy = Math.min(1, c.energy + take * 1.4 / Math.pow(Math.max(1, c.faction === 'wild' ? Math.min(c.mass, 600) : c.mass), 0.6));
        c.gut += take * 0.05;
        if (c.energy > 0.97) c.mind = 'idle';
      }
      break;
    }
    case 'scavenge': {
      const cp = w.get(c.target);
      if (!cp || !cp.dead || cp.bio <= 0) { c.mind = 'idle'; break; }
      // a bigger hunter on the carcass: wait at a distance, circling
      let owner: Creature | null = null;
      if (c.faction === 'wild') w.near(cp.x, cp.z, 3 + cp.radius, (o) => { if (!owner && o !== c && !o.dead && o.diet === 'carn' && (o.mind === 'eat' || o.mind === 'carry') && (o.target === cp.id || o.carry === cp.id) && o.mass > c.mass * 0.8) owner = o; });
      if (owner) {
        const a = w.time * 0.35 + c.id, r = 6 + cp.radius + c.radius;
        go(c, w, cp.x + Math.cos(a) * r, cp.z + Math.sin(a) * r, 0.3, dt);
        if (c.emote === Emote.NONE && Math.random() < dt * 0.15) emote(c, Emote.WATCH, 2);
        break;
      }
      if (go(c, w, cp.x, cp.z, 0.6, dt) < c.radius + cp.radius + 0.3) setMind(c, 'eat');
      break;
    }
    case 'stalk': {
      const t = w.get(c.target);
      if (!t || t.dead) { setMind(c, 'idle'); c.target = 0; break; }
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      // close enough to rush, or spotted: the chase is on
      if (d < 3.5 + c.speed * 0.45 || (t.mind === 'flee' && t.target === c.id)) { setMind(c, 'hunt'); break; }
      if (d > c.st.sight * 1.6) { setMind(c, 'idle'); c.cdHunt = 6; break; }
      go(c, w, t.x, t.z, 0.26, dt);
      break;
    }
    case 'ambush': {
      c.steer(w, c.x, c.z, 0, dt);
      // whatever comes to drink within a pounce
      if (Math.random() < dt * 3) {
        let prey: Creature | null = null;
        w.near(c.x, c.z, 4 + c.speed * 0.5, (o) => { if (!prey && !o.dead && o.sp !== c.sp && o.faction === 'wild' && o.mass < c.mass * 1.6 && !o.canFly) prey = o; });
        if (prey) { c.target = (prey as Creature).id; setMind(c, 'hunt'); }
      }
      break;
    }
    case 'display': {
      const t = w.get(c.target);
      if (!t || t.dead) { setMind(c, 'idle'); break; }
      // square up, sway, step in
      c.face(t.x, t.z, dt);
      const d = Math.hypot(t.x - c.x, t.z - c.z), want = 2.2 + c.radius + t.radius;
      c.steer(w, c.x + (t.x - c.x) * (d > want ? 0.3 : -0.2), c.z + (t.z - c.z) * (d > want ? 0.3 : -0.2), 0.2, dt);
      if (c.actT > 3 && c.id < t.id && t.mind === 'display') {
        // the weaker one backs down; now and then it comes to blows
        const sc = (o: Creature) => o.mass * (o.hp / o.maxHp) * (0.7 + Math.random() * 0.6) * (Math.hypot(o.x - o.homeX, o.z - o.homeZ) < 10 ? 1.25 : 1);
        const [win, lose] = sc(c) >= sc(t) ? [c, t] : [t, c];
        if (Math.random() < 0.25) { setMind(win, 'attack'); win.target = lose.id; } else setMind(win, 'idle');
        bolt(lose, w, win.id, 3.5); emote(lose, Emote.TIRED, 2);
      }
      break;
    }
    case 'mate': {
      const m = w.get(c.mate);
      if (!m || m.dead) { setMind(c, 'idle'); break; }
      // a courtship dance: circling each other round the midpoint
      const mx = (c.x + m.x) / 2, mz = (c.z + m.z) / 2, d = Math.hypot(m.x - c.x, m.z - c.z);
      if (d > 6) { go(c, w, m.x, m.z, 0.5, dt); break; }
      const a = w.time * 1.3 + (c.id < m.id ? 0 : Math.PI), r = 0.8 + c.radius + m.radius * 0.5;
      c.steer(w, mx + Math.cos(a) * r, mz + Math.sin(a) * r, 0.32, dt);
      if (c.actT > 5.5 && c.id < m.id) {
        c.preg = c.st.gestation; c.breedCD = m.breedCD = c.st.gestation * 1.4 + 50 + Math.random() * 40;
        setMind(c, 'idle'); setMind(m, 'idle'); emote(c, Emote.LOVE, 2); emote(m, Emote.LOVE, 2);
      }
      break;
    }
    case 'carry': {
      const cp = w.get(c.carry);
      if (!cp || !cp.dead) { c.carry = 0; setMind(c, 'idle'); break; }
      const left = go(c, w, c.goalX, c.goalZ, 0.4, dt);
      // the kill in the jaws, dragged along
      const k = c.radius + cp.radius * 0.45, hx = c.x + Math.sin(c.yaw) * k, hz = c.z + Math.cos(c.yaw) * k;
      cp.x += (hx - cp.x) * Math.min(1, dt * 5); cp.z += (hz - cp.z) * Math.min(1, dt * 5); cp.y = w.surfaceY(cp.x, cp.z);
      if (left < 1.2 || c.actT > 13) { c.target = cp.id; c.carry = 0; setMind(c, 'eat'); }
      break;
    }
    case 'hunt': case 'attack': {
      if (c.target === GOLEM) { chaseGolem(c, w, dt); break; }
      const t = w.get(c.target);
      if (!t || t.dead) {
        if (c.mind === 'hunt' && t && t.dead) { killed(c, w, t); break; }
        c.mind = 'idle'; c.target = 0; break;
      }
      if (c.faction !== 'wild' && !c.order && Math.hypot(t.x - c.homeX, t.z - c.homeZ) > 34) { c.mind = 'idle'; c.target = 0; break; }
      const reach = c.st.reach + c.radius + t.radius;
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (c.faction === 'wild') {
        // a plated ball is not worth the teeth: worry at it a while, then leave it
        if (t.mind === 'curl' && t.roller && d < reach + 1 && Math.random() < dt * 0.3) { setMind(c, 'idle'); c.target = 0; c.cdHunt = 10; emote(c, Emote.TIRED, 2); break; }
        // a sprint costs wind: out of breath and still not there, it gives up
        if (d > reach) c.stam = Math.max(0, c.stam - dt / (2 + c.st.stamina * 0.08));
        if ((c.stam <= 0.02 && d > reach * 1.2) || d > c.st.sight * 1.8) {
          setMind(c, 'rest'); c.target = 0; c.cdHunt = 12 + Math.random() * 10; emote(c, Emote.TIRED, 2.5);
          remember(mem(c).food, t.x, t.z, w.time, 0.4, 3);
          break;
        }
      }
      if (d > reach * 0.85) go(c, w, t.x, t.z, d < 14 ? 1 : 0.75, dt, true);
      else { c.steer(w, c.x, c.z, 0, dt); c.face(t.x, t.z, dt); }
      if (d < reach + 0.3 && c.atkT <= 0 && c.atkAnim < 0) { c.atkAnim = 0; c.atkT = 1 / c.st.attackRate; }
      break;
    }
  }
}

/** after a kill: drag it into cover (or home) if others are about or it lies in the open, then feed */
function killed(c: Creature, w: World, t: Creature) {
  if (c.faction !== 'wild') { c.mind = 'scavenge'; return; }
  let rivals = 0;
  w.near(t.x, t.z, 14, (o) => { if (o !== c && !o.dead && o.faction === 'wild' && (o.diet === 'carn' || o.diet === 'scav')) rivals++; });
  const open = w.eco.coverAt(t.x, t.z) < 0.35;
  if ((rivals > 0 || open) && t.mass <= c.mass * 1.6 && !c.canFly) {
    let goal: [number, number] | null = null;
    if (c.denX >= 0 && dist(c, c.denX, c.denZ) < 20) goal = [c.denX, c.denZ];
    else {
      let bs = -1e9;
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, x = clamp(c.x + Math.cos(a) * 9, 3, w.region.N - 3), z = clamp(c.z + Math.sin(a) * 9, 3, w.region.N - 3); if (w.region.isWater(x, z) || w.region.isSolid(x, z)) continue; const s = w.eco.coverAt(x, z) - dangerAt(c, w, x, z); if (s > bs) { bs = s; goal = [x, z]; } }
    }
    if (goal) { c.carry = t.id; c.goalX = goal[0]; c.goalZ = goal[1]; c.path = null; setMind(c, 'carry'); emote(c, Emote.FOOD, 2.2); return; }
  }
  c.target = t.id; setMind(c, 'scavenge');
}

/** run from (x, z): away, and away from water and walls where possible */
function fleeFrom(c: Creature, w: World, x: number, z: number, dt: number) {
  const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz) || 1;
  let fx = dx / d, fz = dz / d;
  const R = w.region;
  if (!c.walker.swim && !c.canFly) {
    // veer off from water and rock ahead
    const ax = c.x + fx * 4, az = c.z + fz * 4;
    if (R.isWater(ax, az) || R.isSolid(ax, az)) {
      const l = R.isWater(c.x - fz * 4, c.z + fx * 4) || R.isSolid(c.x - fz * 4, c.z + fx * 4);
      const s = l ? -1 : 1;
      fx = fx * 0.3 - fz * s; fz = fz * 0.3 + (dx / d) * s;
    }
  }
  c.steer(w, c.x + fx * 6, c.z + fz * 6, 1, dt);
}

/** follow a path (long trips) or steer directly; returns distance left */
function go(c: Creature, w: World, tx: number, tz: number, run: number, dt: number, chase = false): number {
  const d = Math.hypot(tx - c.x, tz - c.z);
  if (c.canFly || d < 7 || c.far) { c.path = null; c.steer(w, tx, tz, run, dt); return d; }
  c.repathT -= dt;
  if (!c.path || c.repathT <= 0 || (Math.abs(c.goalX - tx) > 2 || Math.abs(c.goalZ - tz) > 2)) {
    if (!chase || c.repathT <= 0) {
      c.path = w.pather.find(c.x, c.z, tx, tz, c.walker, 6000);
      c.pathI = 0; c.repathT = chase ? 1.2 : 4; c.goalX = tx; c.goalZ = tz;
      if (!c.path) { c.steer(w, tx, tz, run, dt); return d; }
    }
  }
  if (!c.path) { c.steer(w, tx, tz, run, dt); return d; }
  let px = c.path[c.pathI], pz = c.path[c.pathI + 1];
  while (c.pathI < c.path.length - 2 && Math.hypot(px - c.x, pz - c.z) < 0.9) { c.pathI += 2; px = c.path[c.pathI]; pz = c.path[c.pathI + 1]; }
  c.steer(w, px, pz, run, dt);
  return d;
}

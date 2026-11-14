// Minds. Every creature runs the same needs-driven loop; ownership changes priorities (orders, leash to home,
// aggression). Wild species graze, hunt, scavenge, flee, herd and breed; offspring drift and can found subspecies.
// The golem is not a creature but takes part: predators hunt it, provoked animals fight back or bolt, small ones
// keep clear of it, and a rival's brood goes for it on sight (target id GOLEM).
import { Creature, GOLEM, GOLEM_REF } from './creature';
import type { World } from './world';
import { clamp } from '../core/rand';

const THINK = 0.35;

function threatOf(c: Creature, w: World): Creature | null {
  let best: Creature | null = null, bd = 1e9;
  const sight = c.st.sight * 0.8;
  w.near(c.x, c.z, sight, (o) => {
    if (o.dead || o === c || o.faction === c.faction && c.faction !== 'wild') return;
    if (o.faction === 'wild' && c.faction === 'wild' && o.sp === c.sp) return;
    const dangerous = (o.diet === 'carn' || o.diet === 'omni' || o.faction !== 'wild') && o.mass > c.mass * 0.55;
    const attacking = o.target === c.id;
    if (!dangerous && !attacking) return;
    if (c.diet === 'carn' && o.mass < c.mass * 1.2 && !attacking) return;
    const d = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

function preyFor(c: Creature, w: World): Creature | null {
  let best: Creature | null = null, bs = -1e9;
  w.near(c.x, c.z, c.st.sight, (o) => {
    if (o.dead || o === c || o.air > 1.5) return;
    if (o.sp === c.sp) return;
    if (c.faction !== 'wild' && o.faction === c.faction) return;
    if (o.mass > c.mass * (c.boss ? 3 : 1.6)) return;
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    const s = -d + Math.min(o.mass, c.mass) * 0.05 + (o.hp < o.maxHp * 0.5 ? 4 : 0);
    if (s > bs) { bs = s; best = o; }
  });
  return best;
}

function corpseFor(c: Creature, w: World): Creature | null {
  let best: Creature | null = null, bd = 1e9;
  w.near(c.x, c.z, Math.max(c.st.smell, 6), (o) => {
    if (!o.dead || o.bio <= 0.5 || o.digest > 0.05) return;
    const d = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

function plantFor(c: Creature, w: World): number {
  let best = -1, bd = 1e9;
  const fl = w.flora;
  fl.near(c.x, c.z, Math.min(c.st.sight, 16), (i, d2) => {
    if (fl.bio[i] < 0.35) return;
    if (w.mossAtXZ(fl.x[i], fl.z[i]) > 0.4 && c.faction !== 'veyr') return;
    const sp = fl.species[fl.sp[i]];
    if (sp.tree && c.size < 1.4) return;
    if (d2 < bd) { bd = d2; best = i; }
  });
  return best;
}

export function think(c: Creature, w: World) {
  c.thinkT -= THINK;
  if (c.dead || c.mind === 'held') return;
  const hungry = c.energy < (c.faction === 'wild' ? 0.62 : 0.4);
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
  // ---- survival first
  if (c.faction === 'wild') {
    const th = threatOf(c, w);
    if (th) {
      // cornered predators and big animals fight back
      if (c.diet === 'carn' && c.mass > th.mass * 0.7 || c.boss) { c.mind = 'attack'; c.target = th.id; return; }
      if (c.mass < th.mass * 1.4 || c.hp < c.maxHp * 0.4) { c.mind = 'flee'; c.target = th.id; c.fleeT = 3; return; }
    }
  } else {
    // owned units defend themselves and the territory
    const foe = enemyNear(c, w, c.st.sight * (c.diet === 'carn' ? 0.8 : 0.45));
    if (foe && (c.diet !== 'herb' || foe.target === c.id || c.st.attack > 4)) { c.mind = 'attack'; c.target = foe.id; return; }
  }
  if (c.mind === 'flee' && c.fleeT > 0) return;
  if (c.mind === 'eat' && c.energy < 0.97) return;
  // ---- hunger
  if (hungry) {
    const diet = c.diet;
    if (diet === 'carn' || diet === 'omni' || diet === 'scav') {
      const cp = corpseFor(c, w);
      if (cp) { c.mind = 'scavenge'; c.target = cp.id; return; }
      if (diet !== 'scav') {
        const pr = preyFor(c, w);
        if (pr) { c.mind = 'hunt'; c.target = pr.id; return; }
      }
    }
    if (diet === 'herb' || diet === 'omni' || diet === 'scav') {
      const p = plantFor(c, w);
      if (p >= 0) { c.mind = 'graze'; c.target = -1 - p; c.goalX = w.flora.x[p]; c.goalZ = w.flora.z[p]; return; }
    }
  }
  // ---- breeding (wild drives itself; owned colonies breed on the moss)
  if (c.mature && c.energy > 0.82 && w.canBreed(c)) {
    c.gestT += THINK;
    if (c.gestT >= c.st.gestation) { w.breed(c); c.gestT = 0; c.energy -= 0.3; }
  }
  // ---- wander / herd
  if (c.mind === 'wander' && Math.hypot(c.goalX - c.x, c.goalZ - c.z) > 1) return;
  if (Math.random() < (c.faction === 'wild' ? 0.35 : 0.15)) {
    const hx = c.herd ? w.herdCenter(c) : null;
    const cx = hx ? hx[0] : c.homeX, cz = hx ? hx[1] : c.homeZ;
    const rad = c.faction === 'wild' ? 6 + c.size * 4 : 3 + c.size * 2;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * rad;
      const gx = clamp(cx + Math.cos(a) * d, 2, w.region.N - 2), gz = clamp(cz + Math.sin(a) * d, 2, w.region.N - 2);
      if (!w.region.isWater(gx, gz) || c.walker.swim || c.canFly) { c.mind = 'wander'; c.goalX = gx; c.goalZ = gz; c.path = null; return; }
    }
  }
  if (c.mind !== 'wander') c.mind = 'idle';
}

/** decide about the golem: true when it now drives this creature's mind */
function golemMind(c: Creature, w: World): boolean {
  const G = GOLEM_REF.g;
  if (!G || !G.alive) { if (c.target === GOLEM) { c.target = 0; c.mind = 'idle'; } return false; }
  const d = Math.hypot(G.x - c.x, G.z - c.z), sight = c.st.sight;
  if (c.target === GOLEM && (c.mind === 'attack' || c.mind === 'hunt')) {
    if (d > sight * 1.6 && c.aggro <= 0) { c.mind = 'idle'; c.target = 0; return false; }
    if (c.faction === 'wild' && c.hp < c.maxHp * 0.2 && !c.boss) { c.mind = 'flee'; c.fleeT = 4; return true; }
    return true;
  }
  if (c.target === GOLEM && c.mind === 'flee' && c.fleeT > 0) return true;
  const fighter = c.boss || c.faction === 'rival' || c.diet === 'carn' || (c.diet === 'omni' && c.mass > G.mass * 0.6) || c.mass > G.mass * 5;
  // provoked: fight back if it can, bolt if it can't
  if (c.aggro > 0 && d < sight * 1.5) {
    if (fighter && c.hp > c.maxHp * 0.25) { c.mind = 'attack'; c.target = GOLEM; c.path = null; return true; }
    c.mind = 'flee'; c.target = GOLEM; c.fleeT = 3; return true;
  }
  // predators stalk it on sight; rival broods go straight for it
  if (d < sight * 0.6 && ((c.diet === 'carn' && c.mass > G.mass * 0.7 && c.energy < 0.92 && Math.random() < 0.3) || (c.faction === 'rival' && Math.random() < 0.5))) {
    c.mind = 'hunt'; c.target = GOLEM; c.aggro = Math.max(c.aggro, 8); c.path = null; return true;
  }
  // small timid things keep clear of it
  if (!fighter && c.faction === 'wild' && d < 1.4 + c.radius && c.mass < G.mass * 3) { c.mind = 'flee'; c.target = GOLEM; c.fleeT = 1.2; return true; }
  void w;
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

/** per-frame execution of the current mind */
export function act(c: Creature, w: World, dt: number) {
  if (c.dead) return;
  c.thinkT -= 0; c.thinkT += dt;
  if (c.thinkT >= THINK) think(c, w);
  if (c.stunT > 0) { c.stunT -= dt; c.vx *= 0.8; c.vz *= 0.8; return; }
  if (c.mind === 'held') { c.vx *= 0.6; c.vz *= 0.6; return; }
  if (c.fleeT > 0) c.fleeT -= dt;
  if (c.aggro > 0) c.aggro -= dt;
  if (c.atkT > 0) c.atkT -= dt;
  if (c.atkAnim >= 0) {
    const prev = c.atkAnim;
    c.atkAnim += dt * Math.max(1.6, c.st.attackRate * 2);
    const t = w.get(c.target);
    if (prev < 0.5 && c.atkAnim >= 0.5 && t && !t.dead && Math.hypot(t.x - c.x, t.z - c.z) < c.st.reach + c.radius + t.radius + 0.6) c.strike(w, t);
    else if (prev < 0.5 && c.atkAnim >= 0.5 && c.target === GOLEM) strikeGolem(c);
    if (c.atkAnim >= 1) c.atkAnim = -1;
  }
  switch (c.mind) {
    case 'idle': c.steer(w, c.x, c.z, 0, dt); break;
    case 'wander': if (go(c, w, c.goalX, c.goalZ, 0.38, dt) < 0.8) c.mind = 'idle'; break;
    case 'order': {
      const o = c.order!;
      const left = go(c, w, o.x, o.z, 1, dt);
      if (left < 0.6 + c.radius) { if (o.kind !== 'guard') c.order = null; c.mind = 'idle'; c.homeX = c.x; c.homeZ = c.z; }
      break;
    }
    case 'flee': {
      if (c.target === GOLEM) {
        const G = GOLEM_REF.g;
        if (!G) { c.mind = 'idle'; c.target = 0; break; }
        const dx = c.x - G.x, dz = c.z - G.z, d = Math.hypot(dx, dz) || 1;
        if (d > c.st.sight * 1.2 && c.fleeT <= 0) { c.mind = 'idle'; c.target = 0; break; }
        if (c.fleeT <= 0 && d > 3) { c.mind = 'idle'; c.target = 0; break; }
        c.steer(w, c.x + (dx / d) * 6, c.z + (dz / d) * 6, 1, dt);
        break;
      }
      const t = w.get(c.target);
      if (!t) { c.mind = 'idle'; break; }
      const dx = c.x - t.x, dz = c.z - t.z, d = Math.hypot(dx, dz) || 1;
      if (d > c.st.sight * 1.2 && c.fleeT <= 0) { c.mind = 'idle'; break; }
      c.steer(w, c.x + (dx / d) * 6, c.z + (dz / d) * 6, 1, dt);
      break;
    }
    case 'graze': {
      const p = -1 - c.target;
      if (p < 0 || w.flora.bio[p] < 0.05) { c.mind = 'idle'; break; }
      if (go(c, w, c.goalX, c.goalZ, 0.45, dt) < c.radius + 0.35) { c.mind = 'eat'; }
      break;
    }
    case 'eat': {
      c.steer(w, c.x, c.z, 0, dt);
      if (c.target < 0) {
        const p = -1 - c.target;
        c.face(w.flora.x[p], w.flora.z[p], dt);
        const got = w.flora.eat(p, dt * 0.08 * Math.max(0.4, c.size));
        c.energy = Math.min(1, c.energy + got * 0.6 / Math.pow(Math.max(1, c.mass), 0.55));
        if (got <= 0 || c.energy > 0.97) c.mind = 'idle';
      } else {
        const cp = w.get(c.target);
        if (!cp || !cp.dead || cp.bio <= 0 || cp.digest > 0.05) { c.mind = 'idle'; break; }
        c.face(cp.x, cp.z, dt);
        const take = Math.min(cp.bio, dt * (0.6 + c.mass * 0.02));
        cp.bio -= take;
        c.energy = Math.min(1, c.energy + take * 1.4 / Math.pow(Math.max(1, c.mass), 0.6));
        if (c.energy > 0.97) c.mind = 'idle';
      }
      break;
    }
    case 'scavenge': {
      const cp = w.get(c.target);
      if (!cp || !cp.dead || cp.bio <= 0) { c.mind = 'idle'; break; }
      if (go(c, w, cp.x, cp.z, 0.6, dt) < c.radius + cp.radius + 0.3) c.mind = 'eat';
      break;
    }
    case 'hunt': case 'attack': {
      if (c.target === GOLEM) { chaseGolem(c, w, dt); break; }
      const t = w.get(c.target);
      if (!t || t.dead) {
        if (c.mind === 'hunt' && t && t.dead) { c.mind = 'scavenge'; break; }
        c.mind = 'idle'; c.target = 0; break;
      }
      if (c.faction !== 'wild' && !c.order && Math.hypot(t.x - c.homeX, t.z - c.homeZ) > 34) { c.mind = 'idle'; c.target = 0; break; }
      const reach = c.st.reach + c.radius + t.radius;
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (d > reach * 0.85) go(c, w, t.x, t.z, d < 14 ? 1 : 0.75, dt, true);
      else { c.steer(w, c.x, c.z, 0, dt); c.face(t.x, t.z, dt); }
      if (d < reach + 0.3 && c.atkT <= 0 && c.atkAnim < 0) { c.atkAnim = 0; c.atkT = 1 / c.st.attackRate; }
      break;
    }
  }
}

/** follow a path (long trips) or steer directly; returns distance left */
function go(c: Creature, w: World, tx: number, tz: number, run: number, dt: number, chase = false): number {
  const d = Math.hypot(tx - c.x, tz - c.z);
  if (c.canFly || d < 7) { c.path = null; c.steer(w, tx, tz, run, dt); return d; }
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

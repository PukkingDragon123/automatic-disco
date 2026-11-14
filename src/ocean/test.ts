// ?test=ocean: a real game in an ocean region (no story), the fog of war lifted, with camera presets for the sea.
//   &seed=N &biome=archipelago|reef|ocean|coast...   &under=1 (camera below the surface)   &storm=1 (a storm sea)
//   &shot=sunset|shore|kelp|school|splash|storm|reef|titan|night   (beauty presets; each sets its own camera and light)
//   &cam=x,y,z&look=x,y,z&fov=f (a free camera; region coordinates)   &day=0..1 (time of day)   &splash (a splashdown)
//   &season=bloodtide|eclipse (red tide, bioluminescence)   &t=seconds (fast-forward the sea before the shot)
import * as THREE from 'three';
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import type { BiomeKey } from '../world/region';
import { clamp } from '../core/rand';

const v3 = (s: string | null, d: [number, number, number]) => { const a = (s ?? '').split(',').map(Number); return a.length === 3 && a.every((x) => isFinite(x)) ? new THREE.Vector3(a[0], a[1], a[2]) : new THREE.Vector3(...d); };

export async function testOcean(engine: Engine, input: Input, P: URLSearchParams) {
  const { Game } = await import('../game/game');
  // a storm sea: the climate reads its weather from the URL (it is built with the game)
  if ((P.has('storm') || P.get('shot') === 'storm') && !P.has('weather')) { const u = new URL(location.href); u.searchParams.set('weather', 'storm'); history.replaceState(null, '', u); P.set('weather', 'storm'); }
  const seed = Number(P.get('seed') ?? 3), shot = P.get('shot') ?? '';
  const biome = (P.get('biome') ?? (shot === 'reef' || shot === 'school' ? 'reef' : shot === 'kelp' ? 'ocean' : 'archipelago')) as BiomeKey;
  const g = new Game(engine, input, { seed, biome, story: false, hooks: {} });
  (window as unknown as { __game: unknown }).__game = g;
  g.vision.revealAll = true; g.vision.update(0, true);
  // a clean frame for the beauty shots (&hud=1 keeps the HUD)
  if (P.get('hud') !== '1') { g.hud.root.style.display = 'none'; document.querySelectorAll<HTMLElement>('.overlay2d').forEach((e) => (e.style.display = 'none')); }
  const o = g.ocean;
  if (!o) { console.error('test=ocean: no ocean'); return; }
  const R = g.region, L = R.landing;
  // the time of day (the game grades the light from world.day); a forced low sun for the sunset and the night
  g.world.day = Number(P.get('day') ?? (shot === 'sunset' ? 0.43 : shot === 'night' ? 0.75 : 0.3));
  g.world.dayLen = 1e9;
  const gx = g as unknown as { daylight: () => void };
  const day0 = gx.daylight.bind(g);
  const sunDir = shot === 'sunset' ? new THREE.Vector3(0.85, 0.11, -0.5).normalize() : shot === 'night' ? new THREE.Vector3(-0.3, 0.5, 0.6).normalize() : null;
  gx.daylight = () => {
    day0();
    // a clearer air for the long views
    g.world.sun.env.haze = Math.min(g.world.sun.env.haze, 0.0012); g.world.sun.env.mist = 0;
    if (!sunDir) return;
    const s = g.world.sun; s.dir.copy(sunDir);
    const e = s.env as unknown as { sunSky?: THREE.Vector3; golden?: number; day?: number };
    if (shot === 'sunset') { s.light.color.setHex(0xffa860); s.light.intensity = 2.3; s.hemi.color.setHex(0x9a7a8a); s.hemi.intensity = 1.0; e.sunSky?.copy(sunDir); e.golden = 1; e.day = 0.55; }
    else { s.light.color.setHex(0x8aa0e0); s.light.intensity = 0.55; s.hemi.color.setHex(0x2a3660); s.hemi.intensity = 0.7; }
  };
  // where to look: the edge of the main island facing open water, or a preset
  const out = (d: number) => {
    // walk out from the landing until the sea is d metres deep
    let best = { x: L.x, z: L.z, a: 0 };
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      for (let r = 4; r < 60; r += 1) { const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r; if (o.depthAt(x, z) >= d) { if (!best.a || r < Math.hypot(best.x - L.x, best.z - L.z)) best = { x, z, a }; break; } }
    }
    return best;
  };
  let cam: THREE.Vector3, look: THREE.Vector3, fov = Number(P.get('fov') ?? 40);
  const sh = out(shot === 'kelp' ? 6 : shot === 'reef' || shot === 'school' ? 1.6 : 2.2);
  const dx = Math.cos(sh.a), dz = Math.sin(sh.a);
  const under = P.has('under') || shot === 'kelp' || shot === 'school' || shot === 'reef';
  if (P.has('cam')) { cam = v3(P.get('cam'), [L.x, 20, L.z + 30]); look = v3(P.get('look'), [L.x, 4, L.z]); }
  else if (shot === 'reef' && o.reef?.coral.length) {
    // in among the coral heads of the lagoon
    const cs = o.reef.coral.filter(([x, z]) => { const d = o.depthAt(x, z); return d > 1.3 && d < 3; });
    const c = cs[Math.floor(cs.length * 0.37)] ?? o.reef.coral[0], d = o.depthAt(c[0], c[1]);
    cam = new THREE.Vector3(c[0] - 3.2, R.water - Math.min(d * 0.45, 1.2), c[1] - 2.4);
    look = new THREE.Vector3(c[0] + 2, c[2] + 0.3, c[1] + 1.5); fov = 58;
  } else if (under) {
    const s2 = out(shot === 'kelp' ? 7 : 3.5), x = s2.x + Math.cos(s2.a) * 3, z = s2.z + Math.sin(s2.a) * 3, d = o.depthAt(x, z);
    cam = new THREE.Vector3(x - Math.cos(s2.a) * 2, R.water - Math.min(d * 0.55, 3.5), z - Math.sin(s2.a) * 2);
    look = new THREE.Vector3(x + Math.cos(s2.a) * 10, R.water - d * 0.7, z + Math.sin(s2.a) * 10);
    fov = Number(P.get('fov') ?? 55);
  } else if (shot === 'sunset' || shot === 'storm') {
    // out on the water, looking toward the sun across the glitter
    const sd = sunDir ?? g.world.sun.dir, a = Math.atan2(sd.z, sd.x);
    let x = L.x, z = L.z;
    for (let r = 4; r < 90; r++) { x = L.x + Math.cos(a) * r; z = L.z + Math.sin(a) * r; if (o.depthAt(x, z) > 4 && r > 34 && o.depthAt(x - Math.cos(a) * 12, z - Math.sin(a) * 12) > 2) break; }
    cam = new THREE.Vector3(x - Math.cos(a) * 10, R.water + (shot === 'storm' ? 4.5 : 3.0), z - Math.sin(a) * 10);
    look = new THREE.Vector3(x + Math.cos(a) * 60, R.water + 2, z + Math.sin(a) * 60);
    fov = 50;
  } else if (shot === 'shore') {
    const s0 = out(0.3);
    cam = new THREE.Vector3(s0.x - Math.cos(s0.a) * 7 + Math.sin(s0.a) * 6, R.water + 4.5, s0.z - Math.sin(s0.a) * 7 - Math.cos(s0.a) * 6);
    look = new THREE.Vector3(s0.x + Math.cos(s0.a) * 4, R.water, s0.z + Math.sin(s0.a) * 4);
  } else {
    cam = new THREE.Vector3(sh.x - dx * 18, R.water + 16, sh.z - dz * 18 + 6);
    look = new THREE.Vector3(sh.x + dx * 8, R.water, sh.z + dz * 8);
  }
  console.log('test=ocean', biome, 'seed', seed, 'shot', shot, 'cam', cam.toArray().map((v) => v.toFixed(1)).join(','), 'look', look.toArray().map((v) => v.toFixed(1)).join(','));
  g.cam.lookAt(look.x, look.z, true); g.cam.target.set(look.x, R.water, look.z); g.cam.dist = g.cam.distGoal = clamp(cam.distanceTo(look), 14, 60);
  // live subjects: a school hunted by a shark, the titan breaching, a pod splashing down in front of the camera
  let track: (() => { cam: THREE.Vector3; look: THREE.Vector3 } | null) | null = null;
  const fs = o.fishery;
  if (shot === 'school' && fs) {
    const S = fs.schools.filter((x) => x.kind === 'baitfish').sort((a, b) => b.members.length - a.members.length)[0];
    const shark = fs.fish.find((f) => f.kind === 'shark');
    if (S) {
      if (shark) { shark.hunger = 1; shark.prey = S; shark.x = S.cx + 6; shark.z = S.cz + 2; shark.y = S.cy; }
      S.ball = 1;
      let side = 0;
      track = () => { side += 0.0015; const a = side; const y = Math.min(S.cy + 0.5, o.level - 0.7); return { cam: new THREE.Vector3(S.cx + Math.cos(a) * 4.2, y, S.cz + Math.sin(a) * 4.2), look: new THREE.Vector3(S.cx, S.cy - 0.2, S.cz) }; };
      const tr0 = track(); cam.copy(tr0.cam); look.copy(tr0.look); fov = 60;
    }
  }
  if (shot === 'titan' && fs) {
    const lev = fs.fish.find((f) => f.kind === 'leviathan');
    if (lev) {
      const p = out(9); lev.x = p.x + Math.cos(p.a) * 30; lev.z = p.z + Math.sin(p.a) * 30; lev.y = o.level - 6; lev.gx = lev.x + 40; lev.gz = lev.z; lev.gt = 30;
      fs.breachSoon = 50;
      const c0 = new THREE.Vector3(p.x - Math.cos(p.a) * 6, R.water + 4, p.z - Math.sin(p.a) * 6);
      track = () => ({ cam: c0, look: new THREE.Vector3(lev.x, Math.max(o.level + 2, lev.y), lev.z) });
      fov = 46;
    }
  }
  if (shot === 'splash' || P.has('splash')) {
    const p = out(3); const px = p.x + Math.cos(p.a) * 8, pz = p.z + Math.sin(p.a) * 8;
    cam = new THREE.Vector3(p.x - Math.cos(p.a) * 12 + Math.sin(p.a) * 5, R.water + 5, p.z - Math.sin(p.a) * 12 - Math.cos(p.a) * 5);
    look = new THREE.Vector3(px, R.water + 2, pz); fov = 46;
    setTimeout(() => o.dropPod(px, pz, 60), Number(P.get('drop') ?? 500));
  }
  // the land's water, for a look before the geology lays it out (&inland): a lake, a spring and a geyser, a waterfall
  if (P.has('inland')) {
    const { Inland } = await import('./inland');
    const lx = L.x + 6, lz = L.z - 5, gy = R.heightAt(lx, lz), lv = gy - 0.15;
    const poly: [number, number][] = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, rr = 3.2 + Math.sin(i * 2.3) * 0.7; poly.push([lx + Math.cos(a) * rr, lz + Math.sin(a) * rr]); }
    for (let z = Math.floor(lz - 5); z <= lz + 5; z++) for (let x = Math.floor(lx - 5); x <= lx + 5; x++) { const d = Math.hypot(x + 0.5 - lx, z + 0.5 - lz); if (d < 3.6 && R.inside(x, z)) { R.h[z * R.N + x] = Math.min(R.h[z * R.N + x], lv - 0.25 - (3.6 - d) * 0.3); R.dirty.add(z * R.N + x); } }
    g.world.terrain.flushDirty();
    const RR = R as unknown as Record<string, unknown>;
    RR.lakes = [{ level: lv, poly }];
    RR.springs = [{ x: L.x - 5, z: L.z - 4, r: 1.3, level: R.heightAt(L.x - 5, L.z - 4) + 0.05, kind: 'hot', hue: 'turquoise' }, { x: L.x - 2, z: L.z - 8, r: 0.9, level: R.heightAt(L.x - 2, L.z - 8) + 0.05, kind: 'geyser', hue: 'ochre' }];
    const fe = out(1.2);
    RR.falls = [{ x: fe.x - Math.cos(fe.a) * 3, z: fe.z - Math.sin(fe.a) * 3, top: R.water + 3.5, bottom: R.water, w: 2.2, dir: [Math.cos(fe.a), Math.sin(fe.a)] }];
    const inl = new Inland(o); g.world.terrain.group.add(inl.group); o.parts.push(inl);
    cam = new THREE.Vector3(L.x + 2, R.heightAt(L.x, L.z) + 9, L.z + 10); look = new THREE.Vector3(L.x, R.heightAt(L.x, L.z), L.z - 4);
  }
  // the golem at work under the sea: hatched, set down by a seabed node, dived to it; the game's own camera follows
  if (shot === 'dive' || shot === 'play') {
    engine.setScreen(g);
    for (let i = 0; i < 160 && !g.player.started; i++) engine.step(0.1, false);
    const p = g.player as unknown as { x: number; z: number; y: number; vx: number; vz: number };
    const node = shot === 'dive' ? o.reef?.nodes.find((n) => o.depthAt(n.x, n.z) < 9) ?? o.reef?.nodes[0] : null;
    const at = node ? { x: node.x + 1.2, z: node.z + 0.8 } : out(3);
    p.x = at.x; p.z = at.z; p.vx = p.vz = 0; (p as unknown as { moveGoal: unknown }).moveGoal = null;
    if (node) o.dive.depth = Math.max(0, o.depthAt(at.x, at.z) - 2.2);
    g.cam.yaw = g.cam.yawGoal = 0.7; g.cam.dist = g.cam.distGoal = 18;
    console.log('test=ocean dive', JSON.stringify(at), 'depth', o.dive.depth.toFixed(1), 'started', g.player.started);
    for (let i = 0; i < 30; i++) engine.step(0.1, false);
    engine.start();
    return;
  }
  g.cineCam = (c) => {
    const tr = track?.(); if (tr) { cam.lerp(tr.cam, 0.25); look.lerp(tr.look, 0.3); }
    c.position.copy(cam); c.lookAt(look); if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); } c.updateMatrixWorld();
  };
  (window as unknown as { __oceanCam: unknown }).__oceanCam = { cam, look };
  // fast-forward the sea a little so the swell and the life have settled
  engine.setScreen(g);
  const ff = Number(P.get('t') ?? 2);
  for (let i = 0; i < ff * 10; i++) engine.step(0.1, false);
  engine.start();
}

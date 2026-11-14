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
    if (shot === 'sunset') { s.light.color.setHex(0xffa860); s.light.intensity = 2.3; s.hemi.color.setHex(0x9a7a8a); s.hemi.intensity = 1.0; }
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
  else if (under) {
    const s2 = out(shot === 'kelp' ? 7 : 3.5), x = s2.x + Math.cos(s2.a) * 3, z = s2.z + Math.sin(s2.a) * 3, d = o.depthAt(x, z);
    cam = new THREE.Vector3(x - Math.cos(s2.a) * 2, R.water - Math.min(d * 0.55, 3.5), z - Math.sin(s2.a) * 2);
    look = new THREE.Vector3(x + Math.cos(s2.a) * 10, R.water - d * 0.7, z + Math.sin(s2.a) * 10);
    fov = Number(P.get('fov') ?? 55);
  } else if (shot === 'sunset' || shot === 'storm') {
    // out on the water, looking toward the sun across the glitter
    const sd = sunDir ?? g.world.sun.dir, a = Math.atan2(sd.z, sd.x);
    let x = L.x, z = L.z;
    for (let r = 4; r < 70; r++) { x = L.x + Math.cos(a) * r; z = L.z + Math.sin(a) * r; if (o.depthAt(x, z) > 2.5 && r > 20) break; }
    cam = new THREE.Vector3(x - Math.cos(a) * 14, R.water + (shot === 'storm' ? 5 : 3.4), z - Math.sin(a) * 14);
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
      track = () => { side += 0.0015; const a = side; const y = Math.min(S.cy + 0.6, o.level - 0.8); return { cam: new THREE.Vector3(S.cx + Math.cos(a) * 6.5, y, S.cz + Math.sin(a) * 6.5), look: new THREE.Vector3(S.cx, S.cy, S.cz) }; };
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
  g.cineCam = (c) => {
    const tr = track?.(); if (tr) { cam.lerp(tr.cam, 0.08); look.lerp(tr.look, 0.15); }
    c.position.copy(cam); c.lookAt(look); if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); } c.updateMatrixWorld();
  };
  (window as unknown as { __oceanCam: unknown }).__oceanCam = { cam, look };
  // fast-forward the sea a little so the swell and the life have settled
  engine.setScreen(g);
  const ff = Number(P.get('t') ?? 2);
  for (let i = 0; i < ff * 10; i++) engine.step(0.1, false);
  engine.start();
}

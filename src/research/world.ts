// What the progression systems put into the world: alien RUINS to scan for xeno data (basalt monoliths with glyph
// strips that glow faintly), and the Austral's SUPPLY CAPSULES falling to the pod when a quota is met.
import * as THREE from 'three';
import type { Game } from '../game/game';
import { Rand } from '../core/rand';
import { anyG } from './util';
import type { Research } from './research';
import type { Mission } from './mission';
import { gbuf } from '../gfx/gbuf';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';

const NAMES = ['Basalt Spire', 'Ring of Nine', 'Sunken Vault', 'Glyph Wall', 'The Choir Stones', 'Broken Gate'];
const lam = (c: number) => gbuf(new THREE.MeshLambertMaterial({ color: c, flatShading: true }), 1);

function ruinMesh(r: Rand, kind: number) {
  const g = new THREE.Group(), stone = lam(0x3b3a40), stone2 = lam(0x4b4a52), glyph = new THREE.MeshBasicMaterial({ color: 0x6fd0b8 });
  gbuf(glyph, 32);
  const slab = (w: number, h: number, d: number, x: number, z: number, ry: number, tilt = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), r.chance(0.5) ? stone : stone2); m.position.set(x, h / 2 - 0.1, z); m.rotation.set(tilt, ry, tilt * 0.5); m.castShadow = true; g.add(m);
    // a glyph strip cut into the face
    for (let k = 0; k < Math.floor(h / 0.5); k++) if (r.chance(0.6)) { const s = new THREE.Mesh(new THREE.BoxGeometry(w * (0.2 + r.next() * 0.4), 0.06, 0.02), glyph); s.position.set(0, -h / 2 + 0.35 + k * 0.5, d / 2 + 0.011); m.add(s); }
    return m;
  };
  if (kind % 3 === 0) { slab(1.1, 5.2, 0.9, 0, 0, r.next(), 0.04); slab(0.6, 2.2, 0.6, 1.4, 0.6, r.next(), -0.2); slab(0.8, 0.5, 1.6, -1.2, 0.3, r.next()); }
  else if (kind % 3 === 1) { for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; if (r.chance(0.8)) slab(0.6, 1.4 + r.next() * 1.8, 0.4, Math.cos(a) * 3.2, Math.sin(a) * 3.2, -a + Math.PI / 2, (r.next() - 0.5) * 0.3); } }
  else { slab(4.2, 2.4, 0.7, 0, 0, r.next() * 0.3, 0.05); slab(1.2, 3.6, 0.8, 2.6, 0.2, 0.2); slab(1.0, 1.1, 1.0, -2.6, 0.8, 0.5, 0.3); }
  const lamp = new THREE.PointLight(0x6fd0b8, 1.6, 9); lamp.position.y = 1.5; g.add(lamp);
  return g;
}

export function spawnRuins(g: Game, R: Research) {
  const G = anyG(g), reg = G.region; if (!reg) return;
  const r = new Rand((reg.seed ?? 1) ^ 0x7a11), core = G.veyr?.core ?? reg.landing, N = reg.N;
  const n = 3;
  for (let k = 0, tries = 0; k < n && tries < 200; tries++) {
    const a = r.next() * Math.PI * 2, d = 24 + r.next() * 40, x = core.x + Math.cos(a) * d, z = core.z + Math.sin(a) * d;
    if (x < 8 || z < 8 || x > N - 8 || z > N - 8) continue;
    try { if (reg.isWater?.(x, z) || reg.heightAt(x, z) < reg.water + 0.3) continue; } catch { /* region api */ }
    if (R.ruins.some((u) => Math.hypot(u.x - x, u.z - z) < 18)) continue;
    const name = NAMES[(k + Math.floor(r.next() * 10)) % NAMES.length];
    if (R.ruins.some((u) => u.name === name)) continue;
    const m = ruinMesh(r, k);
    try { m.position.set(x, G.world.surfaceY(x, z) - 0.15, z); G.world.scene.add(m); } catch { continue; }
    R.ruins.push({ x, z, name, key: 'ruin:' + name });
    k++;
  }
}

function capsuleMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.7, 8), lam(0xa29d8c)); g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.26, 8), lam(0xd9a43a)); band.position.y = -0.55; g.add(band);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 8), lam(0x3a3d40)); nose.position.y = 1.2; g.add(nose);
  for (let k = 0; k < 4; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.5), lam(0x5f6261)); const a = (k / 4) * Math.PI * 2; fin.position.set(Math.cos(a) * 0.8, -0.6, Math.sin(a) * 0.8); fin.rotation.y = -a; g.add(fin); }
  const glow = new THREE.PointLight(0xffa860, 0, 16); glow.position.y = -1.2; g.add(glow);
  return { g, glow };
}

/** the capsule falls, glows, lands with a thump and hands its cargo to the stores */
export function bindDrops(g: Game, M: Mission) {
  const G = anyG(g);
  const live: { m: THREE.Group; glow: THREE.PointLight; t: number; x: number; z: number; y: number; d: any; landed: boolean }[] = [];
  M.on('drop', (d: { x: number; z: number; items: Record<string, number> }) => {
    const c = capsuleMesh();
    const y = G.world.surfaceY(d.x, d.z);
    c.g.position.set(d.x - 30, y + 140, d.z - 10); G.world.scene.add(c.g);
    live.push({ m: c.g, glow: c.glow, t: 0, x: d.x, z: d.z, y, d, landed: false });
  });
  G.update$?.push((dt: number) => {
    for (let i = live.length - 1; i >= 0; i--) {
      const L = live[i]; L.t += dt;
      if (!L.landed) {
        const u = Math.min(1, L.t / 3.2), e = u * u;
        L.m.position.set(L.x - 30 * (1 - e), L.y + 0.85 + 140 * (1 - e), L.z - 10 * (1 - e));
        L.m.rotation.z = (1 - u) * 0.35; L.glow.intensity = 6 * (1 - u * 0.6);
        if (Math.random() < 0.8) G.fx?.burst?.(L.m.position.x, L.m.position.y - 1, L.m.position.z, 2, 0xffa060, { glow: true, speed: 0.3, up: 0.6, size: 4, life: 0.9, grav: 0 });
        if (u >= 1) {
          L.landed = true; L.t = 0; L.glow.intensity = 0;
          G.fx?.burst?.(L.x, L.y + 0.5, L.z, 50, 0x7a6a58, { speed: 3.5, up: 4, size: 4, life: 1.6 });
          try { G.cam?.shake?.(0.25, 0.5); } catch { /* cam */ }
          sfx('crack', 1.2, Math.max(0.2, G.audible?.(L.x, L.z) ?? 0.6));
          M.landed(L.d);
          const n = Object.values(L.d.items as Record<string, number>).reduce((s, v) => s + v, 0);
          toast(`Supply capsule down by the pod: <b>${n} items</b> into the stores.`, 'good', 5000);
        }
      } else if (L.t > 60) { L.m.removeFromParent(); live.splice(i, 1); }
    }
  });
}

/** an install leaves the Upgrader as a spark of light that runs to the pod, and the pod flashes when it arrives */
export function bindInstallFx(g: Game, on: (fn: (d: { id: string; from?: { x: number; z: number }; def: { name: string } }) => void) => void) {
  const G = anyG(g);
  const runs: { x0: number; z0: number; x1: number; z1: number; t: number }[] = [];
  on((d) => {
    const P = G.colony?.pod ?? G.veyr?.core; if (!P || !d.from) return;
    runs.push({ x0: d.from.x, z0: d.from.z, x1: P.x, z1: P.z, t: 0 });
    sfx('pulse', 1.4, 0.6);
  });
  G.update$?.push((dt: number) => {
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i]; r.t += Math.max(dt, 1 / 60);
      const u = Math.min(1, r.t / 1.4), x = r.x0 + (r.x1 - r.x0) * u, z = r.z0 + (r.z1 - r.z0) * u;
      const y = G.world.surfaceY(x, z) + 1.5 + Math.sin(u * Math.PI) * 3;
      G.fx?.burst?.(x, y, z, 3, 0xffd890, { glow: true, speed: 0.4, up: 0.3, size: 3, life: 0.6, grav: 0 });
      if (u >= 1) { G.fx?.burst?.(r.x1, G.world.surfaceY(r.x1, r.z1) + 2, r.z1, 40, 0xffe0a0, { glow: true, speed: 3, up: 3, size: 3, life: 1, grav: 2 }); sfx('done', 1, 0.6); runs.splice(i, 1); }
    }
  });
}

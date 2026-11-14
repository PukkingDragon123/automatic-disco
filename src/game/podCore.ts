// What came down: the U.S.P.C. drop pod is Unit 07's home, not an asteroid. It is the Veyr core's model (the core
// building keeps its role: hold, respawn point, HQ) and it sits where it landed, tipped over in a short scorched
// skid, hatch open, steaming. Nothing is cleared: the jungle stands all round it, only the plants right under the
// pod are pushed aside. Small fires burn where it hit (a few grass patches, the smouldering skid, the heat shield
// still smoking) with a flickering light, and burn out over a minute or two, leaving the ground scorched
// (terrain.scorch: ash and embers that grow back over a few days) and a few scorched plants. The parachute, cut loose at
// touchdown, lies crumpled downwind over the shrubs, its lines and risers trailing back to the nose cap, flapping a little.
import * as THREE from 'three';
import type { Game } from './game';
import { makePod, type Pod } from '../ui/deployPod';
import { Bin, lit, mesh, box, ptex, fxMat, hash, TAU, V3, type V } from '../ui/deployKit';
import { Pix } from '../ui/machine';
import { RAMPS } from '../art/palette';
import { gbuf } from '../gfx/gbuf';
import { vfx2d } from './vfx2d';

/** the landed pod as a model (for the core building): tipped `tilt` toward its yaw, sunk a little, hatch open */
export function makeCorePod(yaw = 0, tilt = 0.24): { group: THREE.Group; pod: Pod; bin: Bin } {
  const bin = new Bin();
  const pod = makePod(bin);
  const group = new THREE.Group(); group.name = 'core-pod';
  const holder = new THREE.Group(); holder.rotation.y = yaw; group.add(holder);
  pod.root.rotation.set(tilt, 0, 0.06); pod.root.position.set(0, -0.32, 0);
  holder.add(pod.root);
  pod.setHatch(1); pod.heat.value = 0; pod.lens.value = 1.2;
  pod.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  group.userData.pod = pod; group.userData.holder = holder;
  return { group, pod, bin };
}
/** point the landed pod along its skid (yaw: the direction it was travelling) */
export function aimCorePod(group: THREE.Object3D, yaw: number) { const h = group.userData.holder as THREE.Group | undefined; if (h) h.rotation.y = yaw; }

/** a conforming patch of char (alpha-cut, ragged edge) for the ground; local coordinates in metres */
function charDecal(bin: Bin, g: Game, cx: number, cz: number, dirX: number, dirZ: number) {
  const R = g.region, S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const x2 = c.getContext('2d')!, img = x2.createImageData(S, S);
  // a blot round the pod and a skid trail back along where it came from (texture: u along -dir, v across)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / (S - 1), v = y / (S - 1) - 0.5;
    const blot = Math.hypot((u - 0.82) * 2.2, v * 2.4), skid = u < 0.82 ? Math.abs(v) * (4.2 - u * 1.4) : 9;
    const n = hash(x >> 1, y >> 1, 3) * 0.35 + hash(x >> 3, y >> 3, 5) * 0.3;
    const a = Math.max(1 - blot / (0.58 + n * 0.3), 1 - skid / (0.75 + n * 0.5) - (0.82 - u) * 0.25);
    const o = (y * S + x) * 4, k = a > 0.75 ? 0 : 1;
    img.data[o] = 26 + k * 10; img.data[o + 1] = 22 + k * 8; img.data[o + 2] = 18 + k * 6;
    img.data[o + 3] = a > 0.05 ? Math.min(255, a * 360) : 0;
  }
  x2.putImageData(img, 0, 0);
  const tex = bin.t(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  const m = bin.m(gbuf(new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), 0));
  // a grid draped over the real ground: 11 m long (9 of skid behind the pod), 5 m wide
  const L = 11, W = 5, nu = 22, nv = 10, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const sx = -dirZ, sz = dirX;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv - 0.5, along = (u - 0.82) * L, across = v * W;
    const x = cx + dirX * along + sx * across, z = cz + dirZ * along + sz * across;
    pos.push(x, R.groundSmooth(Math.min(R.N - 0.5, Math.max(0.5, x)), Math.min(R.N - 0.5, Math.max(0.5, z))) + 0.06, z); uv.push(u, 1 - (v + 0.5));
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, cc = a + nu + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const me = mesh(bin, geo, m, g.world.scene, 0, 0, 0, false); me.receiveShadow = true; me.renderOrder = 1;
  return me;
}
/**
 * The canopy's cloth, 112 x 48 px over ~6 x 2.7 m (about 18 px a metre): u runs skirt -> apex, v across. Six gores in
 * weathered international orange and sun-bleached white, each gore cut in five panels that faded unevenly, sewn with
 * darker tapes; a doubled hem at the skirt and the vent band at the apex; dirt and mud worked in from the edges that lay
 * on the ground (Bayer dither, two steps), a few mildew specks, a singe and a burned-through hole near the skirt where
 * it dragged over the burning skid, and a stencilled inspection patch.
 */
function chutePix(seed: number): Pix {
  const W = 112, H = 48, p = new Pix(W, H), GORES = 6;
  const OR = RAMPS.rust, WH = RAMPS.paper, SO = RAMPS.soil, MO = RAMPS.moss, BA = RAMPS.basalt, INK = RAMPS.ink;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1), v = y / (H - 1), th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    const gv = v * GORES + Math.sin(u * 6.5 + seed) * 0.18 + Math.sin(u * 17 + seed * 2) * 0.05, gi = Math.floor(gv), gf = gv - gi;
    const row = Math.min(4, Math.floor(u * 5)), orange = (gi & 1) === 0, fade = hash(gi + 7, row, seed);
    const RR = orange ? OR : WH;
    let li = orange ? (fade < 0.2 ? 5 : fade < 0.7 ? 4 : 3) : (fade < 0.35 ? 5 : fade < 0.8 ? 4 : 3);
    // the weave catching light in long streaks (dithered half step)
    if (hash(x >> 3, y, seed + 3) > 0.82 && th < 0.5) li = Math.min(RR.length - 1, li + 1);
    // seams: radial tapes on the gore edges, cross seams between panels; the hem and the vent band
    const seam = gf < 0.13 || gf > 0.95, cross = Math.abs(u * 5 - Math.round(u * 5)) < 0.03 && u > 0.05 && u < 0.95;
    if (seam) li = Math.max(1, li - 2); else if (cross) li = Math.max(1, li - 1);
    if (x < 3) li = x === 2 ? Math.max(1, li - 1) : 2;
    if (x > W - 6) li = Math.max(1, li - (x > W - 3 ? 2 : 1));
    let c = RR[li];
    // weathering: dirt from the edges that lay on the ground and from the skirt that dragged, two dithered steps
    const n = hash(x >> 2, y >> 2, seed + 5) * 0.35 + hash(x >> 4, y >> 3, seed + 9) * 0.3;
    // and a few muddy drag streaks across, where it slid over wet ground
    const drag = Math.max(0, 1 - Math.abs(u - 0.22 - hash(seed, 4) * 0.1) * 30) * 0.5 + Math.max(0, 1 - Math.abs(u - 0.61) * 40) * 0.4 * hash(y >> 2, seed, 6);
    const dirt = Math.max(Math.pow(Math.abs(v - 0.5) * 2, 3) * 0.9, Math.max(0, 1 - u * 6) * 0.7, Math.pow(Math.max(0, u - 0.85) / 0.15, 2) * 0.4, drag) + n - 0.24;
    if (dirt > 0.35 + th * 0.4) c = orange ? SO[4] : SO[5];
    if (dirt > 0.75 + th * 0.3) c = SO[3];
    if (hash(x, y, seed + 11) < 0.006) c = SO[2];
    if (hash(x >> 1, y >> 1, seed + 13) < 0.012 && v > 0.15) c = MO[orange ? 1 : 2];
    p.set(x, y, c);
  }
  // the singe where the skirt dragged over the burning skid, and a hole burned clean through (cut out: the ground shows)
  const bx = 9 + Math.floor(hash(seed, 1) * 10), by = 30 + Math.floor(hash(seed, 2) * 10);
  for (let y = by - 6; y <= by + 6; y++) for (let x = bx - 8; x <= bx + 8; x++) {
    const d = Math.hypot((x - bx) / 1.6, y - by) + hash(x, y, seed) * 1.8;
    if (d < 2.2) p.clear(x, y); else if (d < 3.4) p.set(x, y, BA[1]); else if (d < 4.6) p.set(x, y, OR[1]); else if (d < 6 && hash(x, y, 2) < 0.5) p.set(x, y, OR[2]);
  }
  // the inspection patch on a white gore near the skirt: PKD / INSP, two lines of stencil
  const gy0 = Math.round((1.5 / GORES) * H) - 3, px = 12;
  p.rect(px, gy0, 9, 6, WH[5]); p.hl(px, px + 8, gy0, WH[2]); p.hl(px, px + 8, gy0 + 5, WH[2]); p.vl(px, gy0, gy0 + 5, WH[2]); p.vl(px + 8, gy0, gy0 + 5, WH[2]);
  p.hl(px + 2, px + 6, gy0 + 2, INK[1]); p.hl(px + 2, px + 4, gy0 + 3, INK[2]);
  return p;
}

/**
 * The parachute where it fell, cut loose at touchdown: not laid out round but streamed and crumpled. A long collapsed
 * canopy (about 6 m by up to 2.7 m, ragged outline, never round) lies downwind of the pod, gathered into a bunched roll
 * at the skirt, pleated lengthwise, one pocket still holding air, the apex end crushed; it tents over the shrubs it fell
 * on. Suspension lines run tangled from the hem to a connector link, two webbing risers from there up the hull to the
 * nose cap. The cloth flaps gently in the region's wind (vertex shader; the pocket breathes). Returns the tick.
 */
function drapedChute(bin: Bin, g: Game, x: number, z: number, dirX: number, dirZ: number): (t: number) => void {
  const R = g.region, F = g.world.flora, N = R.N, seed = R.seed % 97;
  const gy = (px: number, pz: number) => R.groundSmooth(Math.min(N - 0.5, Math.max(0.5, px)), Math.min(N - 0.5, Math.max(0.5, pz)));
  const sx = -dirZ, sz = dirX, Lc = 6.2, S0 = 3.0;
  // the axis it streamed along: ahead and off to one side, clear of the side fires; whichever way keeps it on the map and dry
  const inside = (px: number, pz: number) => px > 2 && pz > 2 && px < N - 2 && pz < N - 2 && !R.isWater(px, pz);
  let ax = dirX, az = dirZ;
  for (const [a, b] of [[0.85, -0.5], [0.85, 0.5], [0, -1], [0, 1], [-0.6, -0.8]]) {
    let cx = dirX * a + sx * b, cz = dirZ * a + sz * b; const l = Math.hypot(cx, cz) || 1; cx /= l; cz /= l;
    if (inside(x + cx * (S0 + Lc), z + cz * (S0 + Lc)) && inside(x + cx * (S0 + Lc * 0.5), z + cz * (S0 + Lc * 0.5))) { ax = cx; az = cz; break; }
  }
  const bx = -az, bz = ax, ph = hash(seed, 3) * TAU;
  // the shrubs it came down on (the tallest few; trees stand clear)
  const shrubs: { x: number; z: number; h: number; r: number }[] = [];
  F.near(x + ax * (S0 + Lc / 2), z + az * (S0 + Lc / 2), Lc * 0.6 + 1.5, (i) => {
    const s = F.species[F.sp[i]]; if (!s || s.tree) return;
    const h = Math.min(0.95, (s.hmin + s.hmax) * 0.5 * 0.7); if (h > 0.4) shrubs.push({ x: F.x[i], z: F.z[i], h, r: 0.3 + h * 1.1 });
  });
  shrubs.sort((a, b) => b.h - a.h); shrubs.length = Math.min(shrubs.length, 9);
  const tent = (px: number, pz: number) => { let t = 0; for (const s of shrubs) { const d = Math.hypot(px - s.x, pz - s.z); if (d < s.r) t = Math.max(t, s.h * Math.pow(1 - d / s.r, 1.4)); } return t; };
  const sm = (a: number, b: number, v: number) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
  const tri = (v: number) => 1 - Math.abs(2 * (v - Math.floor(v)) - 1);
  const prof = (s: number) => 0.28 + 1.1 * Math.pow(Math.sin(Math.PI * Math.min(1, (s + 0.02) * 0.9)), 0.7);
  const wL = (s: number) => prof(s) * (1 + 0.16 * Math.sin(s * 13 + ph) + 0.07 * Math.sin(s * 29 + ph * 2));
  const wR = (s: number) => prof(s) * 0.86 * (1 + 0.14 * Math.sin(s * 11 + ph * 3) + 0.08 * Math.sin(s * 31 + 1));
  const centre = (s: number) => { const off = Math.sin(s * 2.4 + ph) * 0.55 * s; return [x + ax * (S0 + s * Lc) + bx * off, z + az * (S0 + s * Lc) + bz * off]; };
  const NU = 34, NV = 16, pos: number[] = [], uv: number[] = [], flap: number[] = [], lobe: number[] = [], idx: number[] = [];
  const at = (s: number, c: number) => {
    const [cx, cz] = centre(s), w = c < 0 ? wL(s) : wR(s);
    const jx = (hash(Math.round(s * 97), Math.round(c * 31), 5) - 0.5) * 0.06, jz = (hash(Math.round(s * 97), Math.round(c * 31), 6) - 0.5) * 0.06;
    const px = cx + bx * c * w + jx, pz = cz + bz * c * w + jz, ac = Math.abs(c), edge = 1 - sm(0.45, 0.97, ac);
    const pleat = tri(c * 2.6 + 0.35 * Math.sin(s * 9 + 1) + 0.2 * Math.sin(s * 21 + ph));
    const l1 = Math.exp(-(((s - 0.34) / 0.13) ** 2) - (((c + 0.15) / 0.5) ** 2)), l2 = Math.exp(-(((s - 0.74) / 0.08) ** 2) - (((c - 0.4) / 0.35) ** 2));
    // pleats and wrinkles, the bunched roll just inside the hem, the air pocket, the crushed apex; hem and apex tuck down to the ground
    let h = pleat * (0.08 + 0.06 * Math.sin(s * 7 + 2)) * edge + 0.04 * Math.sin(s * Lc * 3.7 + c * 2.1 + ph) * edge;
    h += 0.22 * Math.exp(-(((s - 0.085) / 0.055) ** 2)) * (0.55 + 0.45 * pleat) * (1 - sm(0.6, 1, ac) * 0.7);
    h += 0.55 * l1 + 0.24 * l2 + Math.max(0, (s - 0.8) / 0.2) * 0.12 * hash(Math.round(s * 40), Math.round(c * 12), 8);
    h = 0.03 + h * sm(0, 0.045, s) * (1 - 0.85 * sm(0.93, 1, s));
    const g0 = gy(px, pz), y = Math.max(g0 + Math.max(0.025, h), g0 + tent(px, pz) + 0.04);
    return { px, py: y, pz, f: Math.min(1, sm(0.5, 1, ac) * 0.7 + l1 + l2 * 0.7 + Math.max(0, s - 0.8) * 1.2) * Math.min(1, s / 0.08), l: l1 + l2 * 0.5 };
  };
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
    const s = i / NU, c = (j / NV) * 2 - 1, q = at(s, c);
    pos.push(q.px, q.py, q.pz); uv.push(s, (c + 1) / 2); flap.push(q.f); lobe.push(q.l);
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFlap', new THREE.Float32BufferAttribute(flap, 1)); geo.setAttribute('aLobe', new THREE.Float32BufferAttribute(lobe, 1));
  geo.setIndex(idx); geo.computeVertexNormals();
  const U = { uT: { value: 0 }, uWd: { value: new THREE.Vector2(Math.cos(R.seed * 1.7), Math.sin(R.seed * 1.7)) } };
  const mat = new THREE.MeshLambertMaterial({ map: ptex(bin, chutePix(seed), false), side: THREE.DoubleSide, flatShading: true, alphaTest: 0.5 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uT; uniform vec2 uWd; attribute float aFlap; attribute float aLobe;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float cPh = dot(position.xz, uWd) * 1.3 - uT * 2.2;
      float cGust = 0.6 + 0.4 * sin(uT * 0.31 + 0.7) * sin(uT * 0.17 + 2.1);
      transformed.y += aFlap * (sin(cPh) * 0.045 + sin(cPh * 2.7 + position.z * 2.3 + position.x * 1.1) * 0.02) * cGust;
      transformed.xz += uWd * aFlap * sin(cPh + 1.3) * 0.03 * cGust;
      transformed.y += aLobe * (0.08 * sin(uT * 0.8) + 0.04 * sin(uT * 1.9 + 1.0)) * (0.5 + cGust * 0.5);`);
  };
  mat.customProgramCacheKey = () => 'pod-chute-cloth';
  const cloth = mesh(bin, geo, bin.m(gbuf(mat, 1)), g.world.scene, 0, 0, 0, true); cloth.receiveShadow = true; cloth.name = 'pod-chute';
  // the nose cap the risers hang from (the real core pod when there is one)
  const A = new V3(x, gy(x, z) + 3, z);
  const pg = (g as unknown as { veyr?: { core?: { mesh?: THREE.Object3D } } }).veyr?.core?.mesh?.userData?.podGroup as THREE.Object3D | undefined;
  const pod = pg?.userData.pod as Pod | undefined;
  if (pg && pod) { pg.updateWorldMatrix(true, true); pod.noseCap.getWorldPosition(A); A.x += ax * 0.42; A.z += az * 0.42; }
  // the connector link where the lines gather, and the hem points they run from
  const C = new V3(x + ax * 1.6 + bx * 0.25, 0, z + az * 1.6 + bz * 0.25); C.y = gy(C.x, C.z) + Math.max(0.08, tent(C.x, C.z) + 0.05);
  const steel = lit(bin, RAMPS.steel[3], { flag: 0 });
  box(bin, 0.14, 0.05, 0.09, steel, g.world.scene, C.x, C.y, C.z).rotation.y = Math.atan2(ax, az);
  const lp: number[] = [], LS = 9;
  for (let k = 0; k < 12; k++) {
    const H = at(0.015, -1 + (2 * k) / 11), wob = (hash(k, seed, 4) - 0.5) * 2, turns = 1 + (k % 3);
    let px0 = H.px, py0 = H.py, pz0 = H.pz;
    for (let sI = 1; sI <= LS; sI++) {
      const t = sI / LS, side = Math.sin(t * Math.PI * turns) * 0.22 * wob * (1 - t);
      const px = H.px + (C.x - H.px) * t + bx * side, pz = H.pz + (C.z - H.pz) * t + bz * side;
      const py = sI === LS ? C.y : Math.max(gy(px, pz) + 0.05 + 0.1 * Math.sin(t * Math.PI) * hash(k, sI, 9), gy(px, pz) + tent(px, pz) + 0.03) + (H.py - gy(H.px, H.pz)) * (1 - t) * (1 - t);
      lp.push(px0, py0, pz0, px, py, pz); px0 = px; py0 = py; pz0 = pz;
    }
  }
  const lg = bin.g(new THREE.BufferGeometry()); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lg, bin.m(gbuf(new THREE.LineBasicMaterial({ color: RAMPS.paper[2] }), 0))); lines.name = 'pod-chute-lines';
  g.world.scene.add(lines);
  // two webbing risers: from the link along the ground to the pod's foot, then up the hull to the nose cap
  const foot = new V3(x + ax * 1.2, 0, z + az * 1.2); foot.y = gy(foot.x, foot.z) + 0.08;
  const rp: number[] = [], ri: number[] = [];
  for (const off of [-0.07, 0.07]) {
    const path: THREE.Vector3[] = [];
    for (let k = 0; k <= 4; k++) { const t = k / 4, px = C.x + (foot.x - C.x) * t + bx * off, pz = C.z + (foot.z - C.z) * t + bz * off; path.push(new V3(px, Math.max(gy(px, pz) + 0.06, C.y + (foot.y - C.y) * t), pz)); }
    for (let k = 1; k <= 6; k++) { const t = k / 6; path.push(new V3(foot.x + (A.x - foot.x) * t + bx * off * (1 - t * 0.6), foot.y + (A.y - foot.y) * t + Math.sin(t * Math.PI) * 0.12, foot.z + (A.z - foot.z) * t + bz * off * (1 - t * 0.6))); }
    const base = rp.length / 3;
    for (let k = 0; k < path.length; k++) {
      const P = path[k], T = path[Math.min(path.length - 1, k + 1)].clone().sub(path[Math.max(0, k - 1)]).normalize();
      const Wd = new V3().crossVectors(T, new V3(0, 1, 0)); if (Wd.lengthSq() < 0.01) Wd.set(bx, 0, bz); Wd.normalize().multiplyScalar(0.035);
      rp.push(P.x - Wd.x, P.y - Wd.y, P.z - Wd.z, P.x + Wd.x, P.y + Wd.y, P.z + Wd.z);
      if (k > 0) { const a = base + (k - 1) * 2; ri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
  mesh(bin, rg, lit(bin, RAMPS.olive[2], { side: THREE.DoubleSide, flag: 0 }), g.world.scene, 0, 0, 0, false).name = 'pod-chute-risers';
  return (t: number) => { U.uT.value = t; };
}

// ------------------------------------------------------------------ smoke
// Hand-drawn pixel smoke: each puff is a camera-facing card shaded per screen pixel (native resolution, no texture):
// a lumpy cluster of four lobes lit from above in ramp steps (dark underside, light crown, dithered between steps),
// its edge a 4x4 Bayer dither instead of a blur or an outline. Puffs rise, slow, drift downwind, grow and thin out
// (the dither eats them from the edge in). Premultiplied alpha, sorted back to front, no G-buffer write (no outline).
const PUFF_V = `
attribute vec3 iPos; attribute vec4 iD;
varying vec2 vP; varying vec4 vD;
void main() {
  vP = position.xy; vD = iD;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iD.x;
  gl_Position = projectionMatrix * mv;
}`;
const PUFF_F = `
uniform vec3 uR[15]; uniform vec3 uL;
varying vec2 vP; varying vec4 vD;
float pb2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
void main() {
  float s = vD.z * 61.0, age = vD.y;
  float best = -1.0; vec2 bd = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = i == 0 ? vec2(0.0, -0.08) : vec2(sin(s + fi * 2.3), cos(s * 1.37 + fi * 1.9)) * (0.3 + age * 0.12) + vec2(0.0, 0.06);
    float r = i == 0 ? 0.6 : 0.47 - fi * 0.03;
    vec2 d = (vP - c) / r; float k = 1.0 - dot(d, d);
    if (k > best) { best = k; bd = d; }
  }
  float th = pb2(0.5 * gl_FragCoord.xy) * 0.25 + pb2(gl_FragCoord.xy);
  if (best * 2.4 - age * age * 1.7 - age * 0.25 < th) discard;
  vec3 n = normalize(vec3(bd, sqrt(max(best, 0.0)) + 0.15));
  float lit = clamp(dot(n, uL) * 0.55 + 0.45, 0.0, 1.0);
  float st = clamp(floor(lit * 4.0 + (th - 0.5) * 0.7 + 0.5), 0.0, 4.0);
  vec3 col = uR[int(vD.w + 0.5) * 5 + int(st)];
  float a = 0.8 - age * 0.35;
  gl_FragColor = vec4(col * a, a);
  gNormal = vec4(0.0);
}`;
/** 0 warm grey (grass and fuel smoke, dust), 1 charcoal (the heat shield), 2 steam; ramps run dark -> light */
const PUFF_RAMPS = [RAMPS.stone.slice(2, 7), RAMPS.basalt.slice(1, 6), RAMPS.snow.slice(1, 6)];
export interface PuffOpts { size?: number; grow?: number; life?: number; vy?: number; ramp?: 0 | 1 | 2; jitter?: number }
export class Puffs {
  readonly mesh: THREE.Mesh;
  private n = 0; private readonly max = 480;
  private P = new Float32Array(this.max * 3); private Vl = new Float32Array(this.max * 3);
  private A = new Float32Array(this.max * 6); // age, life, s0, s1, seed, ramp
  private iPos: THREE.InstancedBufferAttribute; private iD: THREE.InstancedBufferAttribute; private geo: THREE.InstancedBufferGeometry;
  private ord: number[] = []; private dep = new Float32Array(this.max); private cp = new V3();
  constructor(bin: Bin, parent: THREE.Object3D, private wind: THREE.Vector2, private cam: () => THREE.Camera) {
    const base = new THREE.PlaneGeometry(2, 2);
    const geo = this.geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.getAttribute('position'));
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iD = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos); geo.setAttribute('iD', this.iD); geo.instanceCount = 0;
    const rc = new Float32Array(45), c = new THREE.Color();
    PUFF_RAMPS.forEach((r, i) => r.forEach((h, j) => { c.setHex(h); rc.set([c.r, c.g, c.b], (i * 5 + j) * 3); }));
    const mat = fxMat(bin, PUFF_V, PUFF_F, { uR: { value: rc }, uL: { value: new V3(-0.35, 0.85, 0.45).normalize() } }, 'alpha');
    this.mesh = new THREE.Mesh(bin.g(geo), mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.name = 'pod-smoke';
    parent.add(this.mesh);
  }
  emit(x: number, y: number, z: number, o: PuffOpts = {}) {
    if (this.n >= this.max) return;
    const i = this.n++, j = o.jitter ?? 0.3;
    this.P.set([x + (Math.random() - 0.5) * j, y, z + (Math.random() - 0.5) * j], i * 3);
    this.Vl.set([(Math.random() - 0.5) * 0.3, (o.vy ?? 1.2) * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 0.3], i * 3);
    const s0 = (o.size ?? 0.6) * (0.8 + Math.random() * 0.4);
    this.A.set([0, (o.life ?? 4.5) * (0.8 + Math.random() * 0.4), s0, s0 * (o.grow ?? 3), Math.random(), o.ramp ?? 0], i * 6);
  }
  update(dt: number) {
    const P = this.P, V = this.Vl, A = this.A, w = this.wind;
    for (let i = 0; i < this.n; i++) {
      const a = i * 6, p = i * 3;
      A[a] += dt / A[a + 1];
      if (A[a] >= 1) { // swap the last one in
        const l = --this.n; P.copyWithin(p, l * 3, l * 3 + 3); V.copyWithin(p, l * 3, l * 3 + 3); A.copyWithin(a, l * 6, l * 6 + 6); i--; continue;
      }
      // rise and slow; lean into the wind more the older (higher) it gets
      V[p + 1] = Math.max(0.3, V[p + 1] * Math.exp(-dt * 0.45));
      const k = 0.5 + A[a] * 1.3;
      V[p] += (w.x * k - V[p]) * dt * 0.7; V[p + 2] += (w.y * k - V[p + 2]) * dt * 0.7;
      P[p] += V[p] * dt; P[p + 1] += V[p + 1] * dt; P[p + 2] += V[p + 2] * dt;
    }
    // back to front from the camera
    const cam = this.cam(); cam.getWorldPosition(this.cp);
    const ord = this.ord; ord.length = this.n;
    for (let i = 0; i < this.n; i++) { ord[i] = i; this.dep[i] = (P[i * 3] - this.cp.x) ** 2 + (P[i * 3 + 1] - this.cp.y) ** 2 + (P[i * 3 + 2] - this.cp.z) ** 2; }
    ord.sort((x, y) => this.dep[y] - this.dep[x]);
    const ip = this.iPos.array as Float32Array, id = this.iD.array as Float32Array;
    for (let k = 0; k < this.n; k++) {
      const i = ord[k], a = i * 6, age = A[a], gr = 1 - (1 - age) * (1 - age);
      ip[k * 3] = P[i * 3]; ip[k * 3 + 1] = P[i * 3 + 1]; ip[k * 3 + 2] = P[i * 3 + 2];
      id[k * 4] = A[a + 2] + (A[a + 3] - A[a + 2]) * gr; id[k * 4 + 1] = age; id[k * 4 + 2] = A[a + 4]; id[k * 4 + 3] = A[a + 5];
    }
    this.iPos.needsUpdate = true; this.iD.needsUpdate = true; this.geo.instanceCount = this.n;
  }
}
const PUFFS = new WeakMap<Game, Puffs>();
/** the game's crash-site smoke (made on first use; it lives in the game's scene and runs on its clock) */
export function puffsFor(g: Game): Puffs {
  let p = PUFFS.get(g);
  if (!p) {
    const s = g.region.seed;
    p = new Puffs(new Bin(), g.world.scene, new THREE.Vector2(Math.cos(s * 1.7), Math.sin(s * 1.7)).multiplyScalar(1.1), () => g.cam.cam);
    const pf = p; g.update$.push((dt) => pf.update(Math.max(dt, 0)));
    PUFFS.set(g, p);
  }
  return p;
}

interface Blaze { x: number; z: number; y: number; life: number; t: number; k: number }
/**
 * The crash site round the pod at (x, z) (region metres), skidding in direction (dirX, dirZ): char, scorch, small
 * contained fires that burn out, steam off the hull, the draped chute; the plants under the pod held aside for good.
 */
export function startCrashSite(g: Game, x: number, z: number, dirX: number, dirZ: number, o: { chute?: boolean } = {}) {
  const bin = new Bin(), R = g.region, F = g.world.flora;
  const dl = Math.hypot(dirX, dirZ) || 1; dirX /= dl; dirZ /= dl;
  const sx = -dirZ, sz = dirX;
  const gy = (px: number, pz: number) => R.groundSmooth(Math.min(R.N - 0.5, Math.max(0.5, px)), Math.min(R.N - 0.5, Math.max(0.5, pz)));
  // the burn: the terrain's own scorch (ash with embers, fading back over a few days): a patch round the pod and a
  // narrow smouldering skid back along where it slid in; the drawn decal only where the terrain has no scorch yet
  const terr = g.world.terrain as unknown as { scorch?(x: number, z: number, r: number, k?: number): void };
  if (terr.scorch) {
    terr.scorch(x, z, 3.4, 1);
    for (let k = 1.5; k <= 9; k += 1.5) terr.scorch(x - dirX * k, z - dirZ * k, 1.25 - k * 0.04, 0.95 - k * 0.04);
    terr.scorch(x + sx * 2.2 + dirX * 1.2, z + sz * 2.2 + dirZ * 1.2, 1.1, 0.8);
    terr.scorch(x - sx * 2.6 - dirX * 1.5, z - sz * 2.6 - dirZ * 1.5, 1.0, 0.75);
  } else charDecal(bin, g, x, z, dirX, dirZ);
  const chute = o.chute !== false ? drapedChute(bin, g, x, z, dirX, dirZ) : null;
  // a few scorched plants along the skid and round the pod (darkened, not removed)
  F.near(x, z, 4.5, (i) => F.setTint(i, 0x2a2018, 0.55 + hash(i, 1) * 0.3));
  for (let k = 2; k <= 8; k += 3) F.near(x - dirX * k, z - dirZ * k, 1.8, (i) => F.setTint(i, 0x2a2018, 0.45));
  // the fires: under the shield, along the skid, two grass patches to the sides
  const blazes: Blaze[] = [];
  const add = (px: number, pz: number, life: number, k: number) => blazes.push({ x: px, z: pz, y: gy(px, pz), life, t: 0, k });
  add(x + dirX * 0.6, z + dirZ * 0.6, 95 + hash(x, z) * 30, 1);
  for (const [a, s] of [[2.5, 0.4], [5, -0.6], [7.5, 0.3]] as [number, number][]) add(x - dirX * a + sx * s, z - dirZ * a + sz * s, 45 + hash(a, x) * 40, 0.6);
  add(x + sx * 2.2 + dirX * 1.2, z + sz * 2.2 + dirZ * 1.2, 35 + hash(z, 3) * 30, 0.5);
  add(x - sx * 2.6 - dirX * 1.5, z - sz * 2.6 - dirZ * 1.5, 30 + hash(z, 7) * 30, 0.45);
  const puffs = puffsFor(g);
  const light = new THREE.PointLight(0xff8a3a, 0, 16, 1.6); light.position.set(x, gy(x, z) + 1.2, z); g.world.scene.add(light);
  let t = 0, smokeT = 0, steamT = 0, done = false;
  const col = new THREE.Color();
  const tick = (sdt: number) => {
    const dt = Math.max(sdt, 1 / 60);
    t += dt;
    // the pod pushes the growth under it aside for as long as it stands there
    F.push(x, z, 2.2, 1);
    chute?.(t);
    if (done) return;
    let heat = 0, hx = 0, hz = 0;
    for (const b of blazes) {
      b.t += dt;
      const life = Math.max(0, 1 - b.t / b.life), k = b.k * Math.min(1, b.t * 2) * Math.pow(life, 0.6);
      if (k <= 0.01) continue;
      heat += k; hx += b.x * k; hz += b.z * k;
      // flames: glowing tongues licking up, a spark now and then
      if (Math.random() < dt * 26 * k) {
        col.setRGB(1.6 + Math.random() * 0.5, 0.55 + Math.random() * 0.35, 0.12).multiplyScalar(1.1);
        g.fx.glow.emit(b.x + (Math.random() - 0.5) * 0.9 * b.k, b.y + 0.15, b.z + (Math.random() - 0.5) * 0.9 * b.k, (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 0.3, col, 1, 2.2 + Math.random() * 1.6 * b.k, 0.45 + Math.random() * 0.35, -0.6, 1.2);
      }
      if (Math.random() < dt * 1.2 * k) vfx2d.play('spark', b.x, b.y + 0.4, b.z, { scale: 0.28, ramp: 'glowAmber', emit: 1.2, speed: 1.6, vel: [(Math.random() - 0.5) * 1.2, 2, (Math.random() - 0.5) * 1.2], grav: 5 });
    }
    // smoke off the fires and the heat shield; steam off the hull for the first half minute
    smokeT -= dt; steamT -= dt;
    // each fire sends up its own thin column; the heat shield a slow charcoal one that dies down over two minutes
    for (const b of blazes) if (b.t < b.life && Math.random() < dt * 1.1 * b.k * Math.pow(1 - b.t / b.life, 0.5)) puffs.emit(b.x, b.y + 0.5, b.z, { size: 0.3 + b.k * 0.2, grow: 3, life: 3.5 + b.k * 1.5, vy: 1.2, ramp: 0, jitter: 0.5 * b.k });
    if (smokeT <= 0 && t < 150) { smokeT = 0.55 + t / 60; puffs.emit(x + dirX * 0.8, gy(x, z) + 0.5, z + dirZ * 0.8, { size: 0.45, grow: 3.2, life: 5, vy: 1.4, ramp: 1, jitter: 0.6 }); }
    if (steamT <= 0 && t < 30) { steamT = 0.3; puffs.emit(x - dirX * 0.5, gy(x, z) + 2.4, z - dirZ * 0.5, { size: 0.3, grow: 3, life: 2.4, vy: 1.8, ramp: 2, jitter: 0.6 }); }
    // the light flickers with the fire and dies with it
    light.intensity = heat > 0.02 ? (6 + Math.sin(t * 23) * 1.5 + Math.sin(t * 7.3) * 1.2 + Math.random() * 1.5) * Math.min(1.6, heat) : 0;
    if (heat > 0.02) light.position.set(hx / heat, gy(hx / heat, hz / heat) + 1.1, hz / heat);
    if (heat <= 0.02 && t > 5) { done = true; light.removeFromParent(); light.dispose(); }
  };
  g.update$.push(tick);
  return { bin, light, blazes, get burning() { return !done; } };
}
/** the skid direction a landed pod faces (for a plain game start without a descent) */
export function defaultSkid(x: number, z: number): V { const a = hash(Math.floor(x), Math.floor(z), 11) * TAU; return new V3(Math.cos(a), 0, Math.sin(a)); }

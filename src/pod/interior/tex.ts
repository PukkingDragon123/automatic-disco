// The pod's surfaces, painted the Limbophobia way (V7.md "TEXTURES"; its toolkit, ported in src/limbo/gfx/pixel.ts):
// hue-shifted limited ramps, CLUSTERED organic dithering (never a checker or a ruled line), deliberate light from the
// upper left, and real-material detail (quilted Beta-cloth pads with pinched stitching, stained foam in the tears,
// scorched soot, scuffed and chipped gunmetal with rust bleeding from the rivets, a grimy tread deck, crinkled gold
// foil, cable looms with tie wraps, frost). 32 texels per metre; every texture tiles; decals carry stepped alpha.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, ph } from '../../limbo/gfx/pixel';
import { Rng, tileFbm } from '../../limbo/core/rng';
import { gbuf } from '../../gfx/gbuf';

const cache = new Map<string, THREE.CanvasTexture>();
function tex(key: string, w: number, h: number, paint: (pc: PixelCanvas, rng: Rng) => void, alpha = false): THREE.CanvasTexture {
  let t = cache.get(key);
  if (t) return t;
  const pc = new PixelCanvas(w, h);
  if (!alpha) pc.fill(0x000000);
  paint(pc, new Rng(key.length * 977 + w));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
const fbm = (pc: PixelCanvas, x: number, y: number, cells: number, seed: number, oct = 3) => tileFbm(x, y, pc.w, pc.h, cells, oct, seed);
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** quilted Beta-cloth insulation pads: staggered cushions that dome toward the light, pinched seams, weave, wear */
export function padTex(o: { base?: number; seed?: number; wear?: number; torn?: boolean } = {}) {
  const base = o.base ?? 0xa9a28b, seed = o.seed ?? 3, wear = o.wear ?? 1;
  return tex(`pad7|${base}|${seed}|${wear}|${o.torn}`, 64, 64, (pc, rng) => {
    const R = makeRamp(base, 8, { hueShift: 0.05, spread: 0.55 });
    const CW = 16, CH = 12;
    const cell = (x: number, y: number) => { const row = Math.floor(y / CH), off = row & 1 ? CW / 2 : 0; const u = (((x + off) % CW) + CW) % CW, v = y - row * CH; return { u: (u + 0.5) / CW, v: (v + 0.5) / CH, row, col: Math.floor((x + off) / CW) }; };
    pc.fillRamp(R, (x, y) => {
      const c = cell(x, y), du = c.u * 2 - 1, dv = c.v * 2 - 1;
      // the cushion's dome and the light across it
      const dome = Math.sqrt(clamp(1 - du * du * 0.85)) * Math.sqrt(clamp(1 - dv * dv * 0.85));
      const lit = (-du * 0.55 - dv * 0.75) * 0.22 * dome;
      // a seam pinches in where the stitch pulls (every third texel deeper)
      const edge = Math.min(c.u, 1 - c.u) * CW, edgeV = Math.min(c.v, 1 - c.v) * CH, e = Math.min(edge, edgeV);
      const seam = e < 1 ? -0.28 - (ph(x, y, seed) < 0.35 ? 0.08 : 0) : e < 2 ? -0.1 : 0;
      const bulge = (ph(c.col, c.row, seed + 9) - 0.5) * 0.04;
      const weave = (fbm(pc, x, y, 16, seed + 1, 2) - 0.5) * 0.05;
      const mottle = (fbm(pc, x, y, 3, seed + 2) - 0.5) * 0.06;
      return 0.5 + dome * 0.2 + lit * 1.4 + seam + bulge + weave + mottle;
    }, 0.8);
    // body grime collects low, scuffs at knee height, a few hand-dark smudges
    pc.grime(mixHex(R[1], 0x2a2018, 0.4), 0.45 * wear, 2, seed + 5, 0.62);
    for (let k = 0; k < 3 * wear; k++) pc.ditherBlob(rng.int(0, 63), rng.int(36, 63), rng.int(3, 6), rng.int(2, 3), R[2], 0.55);
    // tea and coolant stains
    for (let k = 0; k < 2 * wear; k++) pc.stain(rng.int(6, 58), rng.int(6, 58), rng.int(4, 8), mixHex(R[3], 0x8a6a2a, 0.3), mixHex(R[2], 0x5a3a1a, 0.4), seed + k);
    // a scorched plume (the landing fire)
    if (wear > 0.6) {
      const sx = rng.int(8, 56), sy = rng.int(34, 60);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const dx = (x - sx) / 9, dy = (y - sy) / 18, d = dx * dx + Math.max(0, dy) * dy * 0.4 + Math.min(0, dy) * Math.min(0, dy) * 1.2;
        const k = clamp(1 - d) * (0.55 + fbm(pc, x, y, 6, seed + 7) * 0.8);
        if (k > pc.clusterT(x, y) * 0.9) pc.blend(x, y, k > 0.8 ? 0x14100c : 0x2e2418, 0.5 + k * 0.4);
      }
    }
    // tears: the pad split open on yellowed foam, frayed threads at the lip
    if (o.torn) for (let k = 0; k < 2; k++) {
      const tx = rng.int(6, 50), ty = rng.int(8, 50), tw = rng.int(6, 11), th = rng.int(3, 5);
      const F = makeRamp(0xc8a858, 5, { spread: 0.45 });
      for (let y = -th; y <= th; y++) for (let x = -tw; x <= tw; x++) {
        const m = 1 - Math.abs(x) / tw - Math.abs(y) / th * (0.7 + ph(x, 3, seed) * 0.5);
        if (m <= 0) continue;
        const pore = ph(tx + x, ty + y, seed + 11) < 0.12 ? -1 : 0;
        pc.set(tx + x, ty + y, F[Math.max(0, Math.min(4, 2 + (y < 0 ? 1 : -1) + pore))]);
        if (m < 0.18) pc.set(tx + x, ty + y, y < 0 ? R[1] : R[6]);
      }
      for (let i = 0; i < 4; i++) pc.set(tx - tw + rng.int(2, tw * 2 - 2), ty - th - 1, R[6]);
    }
    pc.speckle(rng, [R[1], R[6]], 0.004);
  });
}
/** scuffed gunmetal: tone that wanders, paint worn to bright metal at the edges, rivets bleeding rust */
export function metalTex(o: { base?: number; seed?: number; rivets?: boolean } = {}) {
  const base = o.base ?? 0x4d5358, seed = o.seed ?? 5;
  return tex(`metal7|${base}|${seed}|${o.rivets}`, 32, 64, (pc, rng) => {
    const R = makeRamp(base, 7, { hueShift: 0.04, spread: 0.6 });
    pc.fillRamp(R, (x, y) => 0.5 + (fbm(pc, x, y, 2, seed) - 0.5) * 0.35 + (tileFbm(x * 0.3, y * 4, pc.w * 0.3, pc.h * 4, 4, 2, seed + 3) - 0.5) * 0.1, 0.9);
    // chips through the paint: bright steel with a dark lower lip
    for (let k = 0; k < 14; k++) { const x = rng.int(0, 31), y = rng.int(0, 63), w = rng.int(1, 3); for (let i = 0; i < w; i++) { pc.set(x + i, y, R[5]); pc.set(x + i, y + 1, R[1]); } }
    // scratches: short diagonal strokes of the bare metal
    for (let k = 0; k < 6; k++) { const x = rng.int(0, 31), y = rng.int(0, 63), L = rng.int(3, 7); for (let i = 0; i < L; i++) if (ph(x + i, y, seed) > 0.2) pc.blend(x + i, y + Math.floor(i * 0.6), R[6], 0.6); }
    if (o.rivets !== false) for (let y = 6; y < 64; y += 13) for (const x of [4, 27]) {
      pc.set(x, y, R[6]); pc.set(x + 1, y, R[4]); pc.set(x, y + 1, R[4]); pc.set(x + 1, y + 1, R[1]);
      pc.drips(rng, 0x6a3418, 1, y + 2, rng.int(4, 12), 0.35);
    }
    pc.grime(0x1a1614, 0.7, 2, seed + 9, 0.55);
  });
}
/** the deck: rubber-coated plate with worn lozenge tread, dirt in the low spots, boot scuffs, grit */
export function deckTex(seed = 4) {
  return tex(`deck7|${seed}`, 64, 64, (pc, rng) => {
    const R = makeRamp(0x46483f, 7, { hueShift: 0.05, spread: 0.6 });
    pc.fillRamp(R, (x, y) => 0.45 + (fbm(pc, x, y, 3, seed) - 0.5) * 0.25, 0.9);
    // lozenges in a staggered lattice, worn flat where people walk
    for (let j = 0; j < 64; j += 6) for (let i = (j / 6) & 1 ? 3 : 0; i < 64; i += 6) {
      const worn = fbm(pc, i, j, 2, seed + 4); if (worn > 0.62) continue;
      const d = ((i + j) / 3) & 1;
      if (d) { pc.set(i, j, R[5]); pc.set(i + 1, j + 1, R[4]); pc.set(i + 2, j + 2, R[1]); }
      else { pc.set(i + 2, j, R[5]); pc.set(i + 1, j + 1, R[4]); pc.set(i, j + 2, R[1]); }
    }
    pc.grime(0x221c14, 1, 3, seed + 6, 0.45);
    for (let k = 0; k < 10; k++) { const x = rng.int(0, 63), y = rng.int(0, 63), L = rng.int(3, 8); for (let i = 0; i < L; i++) pc.blend(x + i, y + (i >> 2), 0x15120e, 0.4); }
    pc.speckle(rng, [R[5], R[6], 0x6a5a40], 0.01);
  });
}
/** crinkled gold insulation foil: facets that catch the light in clumps */
export function foilTex(seed = 6) {
  return tex(`foil7|${seed}`, 32, 32, (pc, rng) => {
    const R = makeRamp(0xb8913c, 7, { hueShift: 0.05, spread: 0.65 });
    // small crinkled facets: each a flat tone, lit where it faces up-left; a bright crease on the lit side of each fold
    const lv = (x: number, y: number) => Math.floor(fbm(pc, x, y, 8, seed, 2) * 5);
    pc.fillRamp(R, (x, y) => 0.22 + lv(x, y) * 0.13 + (fbm(pc, x, y, 16, seed + 2, 1) - 0.5) * 0.08, 0.5);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const a = lv(x, y), l = lv(x - 1, y), u = lv(x, y - 1); if (a > l || a > u) pc.set(x, y, R[Math.min(6, 3 + a)]); else if (a < l && a < u) pc.set(x, y, R[1]); }
    for (let k = 0; k < 10; k++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.set(x, y, mixHex(R[6], 0xffffff, 0.45)); }
  });
}
/** a cable loom running along v: cords of rubber in four colours, a sheen on each, tie wraps */
export function loomTex(seed = 8) {
  return tex(`loom7|${seed}`, 16, 64, (pc, rng) => {
    const cords = [0x1c1c1e, 0x8a2a20, 0xb8902a, 0x5a5e62, 0x1c1c1e, 0x2a4a6a];
    let x = 0, k = 0;
    while (x < 16) {
      const w = 2 + (k % 3 === 0 ? 1 : 0), Rc = makeRamp(cords[k % cords.length], 5, { spread: 0.6 });
      for (let i = 0; i < w && x + i < 16; i++) for (let y = 0; y < 64; y++) {
        const twist = Math.floor((y + k * 5) / 9) & 1;
        pc.set(x + i, y, Rc[i === 0 ? (twist ? 3 : 4) : i === w - 1 ? 1 : 2]);
      }
      x += w; k++;
    }
    for (let y = 7; y < 64; y += 21) for (let i = 0; i < 16; i++) { pc.set(i, y, 0xd8d4c4); pc.set(i, y + 1, 0x8a8678); }
    pc.speckle(rng, [0x0c0c0e], 0.01);
  });
}
/** frost: a feathery bloom of ice (decal, alpha) */
export function frostTex(seed = 12) {
  return tex(`frost7|${seed}`, 64, 64, (pc, rng) => {
    pc.wrap = false;
    const R = makeRamp(0xc8e4f0, 5, { spread: 0.5, hueShift: 0.02 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const dx = (x - 32) / 30, dy = (y - 32) / 30, d = Math.sqrt(dx * dx + dy * dy) * (0.75 + fbm(pc, x, y, 4, seed) * 0.55);
      const k = clamp(1 - d);
      if (k <= 0 || k * 1.4 < pc.clusterT(x, y)) continue;
      pc.set(x, y, R[Math.min(4, 1 + Math.floor(k * 4 + (ph(x, y, seed) - 0.5)))], k > 0.4 ? 230 : k > 0.15 ? 160 : 90);
    }
    // ferns of ice reaching outward
    for (let f = 0; f < 9; f++) {
      let a = rng.float(0, Math.PI * 2), x = 32 + Math.cos(a) * 12, y = 32 + Math.sin(a) * 12;
      for (let s = 0; s < 16; s++) { a += rng.float(-0.35, 0.35); x += Math.cos(a); y += Math.sin(a); pc.set(x, y, 0xf4fcff, 220); if (s % 3 === 0) { pc.set(x + Math.cos(a + 1.2) * 2, y + Math.sin(a + 1.2) * 2, R[3], 180); pc.set(x + Math.cos(a - 1.2) * 2, y + Math.sin(a - 1.2) * 2, R[3], 180); } }
    }
  }, true);
}
/** soot: a scorch plume rising off a burnt-out junction (decal, alpha) */
export function sootTex(seed = 14) {
  return tex(`soot7|${seed}`, 48, 64, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 48; x++) {
      const up = (64 - y) / 64, dx = (x - 24) / (8 + up * 14), dy = (y - 50) / 14;
      const d = dx * dx + (y > 50 ? dy * dy * 3 : 0);
      const k = clamp(1 - d) * (0.45 + fbm(pc, x, y, 5, seed) * 0.9) * (y < 6 ? y / 6 : 1);
      if (k <= 0.05 || k < pc.clusterT(x, y) * 0.8) continue;
      pc.set(x, y, k > 0.75 ? 0x0e0b0a : k > 0.45 ? 0x221a14 : 0x3a2e22, k > 0.6 ? 235 : k > 0.3 ? 170 : 100);
    }
    for (let i = 0; i < 10; i++) pc.set(20 + Math.floor(ph(i, 1, seed) * 8), 46 + Math.floor(ph(i, 2, seed) * 8), i % 3 ? 0xd86a20 : 0xffb040, 255);
  }, true);
}
/** a material over one of these (lit, outlined by the post pass, no motion smear) */
export function podMat(map: THREE.Texture, o: { side?: THREE.Side; repeat?: [number, number]; transparent?: boolean; color?: number } = {}) {
  let m2 = map;
  if (o.repeat) { m2 = map.clone(); m2.repeat.set(...o.repeat); m2.needsUpdate = true; }
  const m = new THREE.MeshLambertMaterial({ map: m2, side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, alphaTest: o.transparent ? 0.05 : 0, depthWrite: !o.transparent, color: o.color ?? 0xffffff });
  return gbuf(m, o.transparent ? 0 : 1);
}
/** a wool camp blanket: a muted plaid woven through, fuzz, a darker hem */
export function woolTex(seed = 21) {
  return tex(`wool7|${seed}`, 32, 32, (pc, rng) => {
    const R = makeRamp(0x7a4a32, 6, { spread: 0.5 }), G = makeRamp(0x4a5a3a, 6, { spread: 0.45 });
    pc.fillRamp(R, (x, y) => 0.5 + (fbm(pc, x, y, 8, seed, 2) - 0.5) * 0.18 + (((x + y) & 1) ? 0.04 : -0.04), 0.8);
    // the plaid: two soft bands each way, woven (every other texel), never a ruled line
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const bx = (x % 16) >= 5 && (x % 16) < 8, by = (y % 16) >= 9 && (y % 16) < 12;
      if ((bx && (x + y) % 2 === 0) || (by && (x + y) % 2 === 1)) pc.set(x, y, G[bx && by ? 1 : 2 + Math.floor(ph(x, y, seed) * 2)]);
    }
    pc.speckle(rng, [R[4], R[5]], 0.03);
  });
}

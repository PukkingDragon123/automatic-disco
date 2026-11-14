// Surfaces of the Corps' machines: one 64 px layer per material in a texture array (each tile is one world unit,
// repeating). Painted by hand from the master palette: enamel plate fastened at its seams, bare machined steel,
// firebrick, poured concrete, belt rubber, copper, wood planking, hazard paint and stencilled name plates. Alpha below
// 255 marks lit pixels (lamps, furnace glass, reactor glass): the shader adds them as light.
import * as THREE from 'three';
import { Pix, poly, RA } from './paint';
import { text, textW } from '../ui/machine';
import { gbuf, type GFlag } from '../gfx/gbuf';

export const TS = 64;
export const L = {
  OLIVE: 0, GUN: 1, STEEL: 2, HAZARD: 3, GRILLE: 4, BRICK: 5, CONCRETE: 6, BELT: 7, COPPER: 8, GLASS: 9, RUST: 10,
  CREAM: 11, RED: 12, WOOD: 13, LAMP: 14, TEAL: 15, TREAD: 16, COAL: 17, CUORE: 18, MOSS: 19, INK: 20, BRASS: 21, LABEL0: 22,
} as const;
/** name plates, in this order, from layer LABEL0 */
export const LABELS = ['CORE UPLINK', 'MINER', 'WATER PUMP', 'EXCAVATOR', 'SMELTER', 'FOUNDRY', 'CONSTRUCTOR', 'ASSEMBLER', 'MANUFACTURER', 'REFINERY',
  'GROW SHED', 'STORAGE', 'SILO', 'BOILER', 'STEAM GEN.', 'ATOMIC PILE', 'RESEARCH', 'ROBOT WORKS', 'BARRACKS', 'TURRET', 'SPLITTER', 'MERGER', 'LIFT', 'SEED DRILL', 'BREEDING PEN', 'SLUICE'];
export const labelLayer = (name: string) => L.LABEL0 + Math.max(0, LABELS.indexOf(name));

const H = (x: number, y: number, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const wrap = (v: number) => ((v % TS) + TS) % TS;

/** enamel plate fastened at its edges: one flat tone per panel, a lit lip and a dark seam, rivets where the plates
 *  overlap, a couple of chips worn to bare steel where tools knock it, and grime trailing down from the rivets */
function plate(p: Pix, R: number[], base: number, seed: number, rivets = true) {
  p.rect(0, 0, TS, TS, R[base]);
  // the panel is two plates: a vertical seam a third of the way across, the horizontal seam at the edge
  const sx = 21;
  for (let y = 0; y < TS; y++) { p.set(sx, y, R[base - 2]); p.set(sx + 1, y, R[base + 1]); p.set(0, y, R[base - 2]); p.set(1, y, R[base + 1]); }
  for (let x = 0; x < TS; x++) { p.set(x, 0, R[base - 2]); p.set(x, 1, R[base + 1]); }
  // a broad lighter plane on the upper part of the larger plate (it bows a little)
  poly(p, [[sx + 3, 3], [TS - 2, 3], [TS - 2, 18], [sx + 3, 26]], R[base + 1 > R.length - 1 ? base : base + 0]);
  if (rivets) for (const [x, y] of [[4, 4], [4, 34], [sx + 4, 4], [sx + 4, 34], [43, 4]]) {
    p.set(x, y, R[Math.min(R.length - 1, base + 2)]); p.set(x + 1, y, R[base + 1]); p.set(x, y + 1, R[base + 1]); p.set(x + 1, y + 1, R[base - 2]);
    // grime runs down from each rivet
    const len = 3 + Math.floor(H(x, y, seed) * 7);
    for (let k = 2; k < 2 + len; k++) p.set(x + 1, y + k, R[base - 1], 120);
  }
  // chips: small bare-steel islands with a dark lower lip, placed (not sprinkled)
  for (const [cx, cy, w] of [[50, 47, 3], [12, 52, 2], [33, 21, 2]]) {
    for (let j = 0; j < 2; j++) for (let i = 0; i < w - j; i++) p.set(cx + i, cy + j, RA.steel[5 - j]);
    p.hl(cx, cx + w - 1, cy + 2, R[base - 2]);
  }
  // a scuff band low on the panel, where the boots go
  for (let x = 0; x < TS; x++) if (H(x >> 2, 9, seed) < 0.45) p.set(x, 58 + (x % 3 === 0 ? 1 : 0), R[base - 1]);
}
function layers(): Pix[] {
  const out: Pix[] = [];
  const add = (fn: (p: Pix) => void) => { const p = new Pix(TS, TS); fn(p); out.push(p); };
  const O = RA.olive, S = RA.steel, B = RA.brass;
  add((p) => plate(p, O, 3, 1));                              // OLIVE
  add((p) => plate(p, S, 2, 2));                              // GUN
  add((p) => {                                                // STEEL: machined, brushed in long strokes
    p.rect(0, 0, TS, TS, S[4]);
    for (let y = 0; y < TS; y++) { const k = H(0, y, 3); if (k < 0.3) p.hl(0, TS - 1, y, S[5]); else if (k > 0.85) p.hl(0, TS - 1, y, S[3]); }
    for (let i = 0; i < 6; i++) { const y = Math.floor(H(i, 1, 4) * TS), x0 = Math.floor(H(i, 2, 4) * TS); for (let x = 0; x < 9; x++) p.set(wrap(x0 + x), y, S[6]); }
    for (let x = 0; x < TS; x++) { p.set(x, 0, S[2]); p.set(x, TS - 1, S[5]); }
  });
  add((p) => {                                                // HAZARD: diagonal amber and black, worn at the edge
    const A = RA.glowAmber;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const band = Math.floor(wrap(x + y) / 16) % 2;
      let c = band ? RA.ink[1] : A[2];
      if (!band && (wrap(x + y) % 16 === 0)) c = A[3];
      if ((y < 3 || y > TS - 4) && H(x >> 1, y, 5) < 0.45) c = S[3];
      p.set(x, y, c);
    }
  });
  add((p) => {                                                // GRILLE: louvres
    p.rect(0, 0, TS, TS, S[1]);
    for (let y = 2; y < TS; y += 8) { p.hl(0, TS - 1, y, S[4]); p.hl(0, TS - 1, y + 1, S[3]); p.hl(0, TS - 1, y + 2, S[3]); p.hl(0, TS - 1, y + 3, S[2]); p.hl(0, TS - 1, y + 6, RA.ink[1]); }
  });
  add((p) => {                                                // BRICK: firebrick courses, soot higher up
    const C = RA.clay;
    p.rect(0, 0, TS, TS, C[1]);
    for (let r = 0; r < 8; r++) {
      const y = r * 8, off = r % 2 ? 8 : 0;
      for (let b = -1; b < 4; b++) {
        const x0 = b * 16 + off, k = Math.floor(H(b + 9, r, 6) * 3);
        for (let j = 1; j < 7; j++) for (let i = 1; i < 15; i++) p.set(wrap(x0 + i), y + j, C[2 + k - (j > 5 ? 1 : 0)]);
        for (let i = 1; i < 14; i++) p.set(wrap(x0 + i), y + 1, C[Math.min(5, 3 + k)]);
        if (H(b, r, 7) < 0.3) { p.set(wrap(x0 + 5), y + 3, C[1]); p.set(wrap(x0 + 6), y + 4, C[1]); }
      }
    }
  });
  add((p) => {                                                // CONCRETE: poured in forms, tie holes, aggregate
    const R = RA.stone;
    p.rect(0, 0, TS, TS, R[4]);
    for (let y = 0; y < TS; y++) if (y % 16 === 15) p.hl(0, TS - 1, y, R[3]);
    for (let y = 0; y < 32; y++) p.hl(0, TS - 1, y, R[4]);
    poly(p, [[0, 0], [TS, 0], [TS, 15], [0, 15]], R[5]);
    for (const [x, y] of [[8, 8], [40, 8], [24, 40], [56, 40]]) { p.set(x, y, R[1]); p.set(x + 1, y, R[2]); }
    for (let i = 0; i < 26; i++) { const x = Math.floor(H(i, 3, 8) * TS), y = Math.floor(H(i, 4, 8) * TS); p.set(x, y, R[H(i, 5, 8) < 0.5 ? 3 : 6]); p.set(wrap(x + 1), y, R[3]); }
  });
  add((p) => {                                                // BELT: rubber with cleats across it (v runs along the belt)
    const R = RA.basalt;
    p.rect(0, 0, TS, TS, R[2]);
    for (let y = 0; y < TS; y += 16) { p.hl(0, TS - 1, y, R[4]); p.hl(0, TS - 1, y + 1, R[3]); p.hl(0, TS - 1, y + 2, R[1]); }
    for (let x = 0; x < TS; x += 21) for (let y = 0; y < TS; y++) if (y % 16 > 3) p.set(x, y, R[1]);
    for (let y = 0; y < TS; y++) { p.set(0, y, R[0]); p.set(TS - 1, y, R[0]); }
  });
  add((p) => {                                                // COPPER: pipe metal, banded
    const C = RA.rust;
    p.rect(0, 0, TS, TS, C[4]);
    for (let x = 0; x < TS; x++) { p.set(x, 8, C[6]); p.set(x, 9, C[5]); for (let y = 40; y < 52; y++) p.set(x, y, C[3]); }
    for (let x = 0; x < TS; x += 32) for (let y = 0; y < TS; y++) { p.set(x, y, C[2]); p.set(x + 1, y, C[5]); }
    p.rect(30, 20, 4, 4, RA.teal[3]); p.set(31, 21, RA.teal[4]);
  });
  add((p) => {                                                // GLASS: furnace porthole, lit (alpha marks light)
    const A = RA.glowAmber;
    p.rect(0, 0, TS, TS, A[2], 140);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) if ((x + y * 2) % 23 < 3) p.set(x, y, A[4], 110);
    for (let i = 0; i < TS; i++) { p.set(i, 0, S[1]); p.set(0, i, S[1]); }
  });
  add((p) => plate(p, RA.rust, 2, 3, false));                 // RUST: dark iron
  add((p) => plate(p, RA.paper, 3, 4));                       // CREAM enamel (tanks)
  add((p) => plate(p, RA.stampRed, 2, 5, false));             // RED enamel
  add((p) => {                                                // WOOD: crate planking
    const W = RA.ochre;
    for (let r = 0; r < 4; r++) {
      const y0 = r * 16, k = Math.floor(H(r, 1, 9) * 2);
      p.rect(0, y0, TS, 16, W[2 + k]); p.hl(0, TS - 1, y0, W[1]); p.hl(0, TS - 1, y0 + 1, W[4 + k > 6 ? 6 : 4 + k]);
      for (let g = 0; g < 4; g++) { const gy = y0 + 4 + Math.floor(H(g, r, 10) * 9), gx = Math.floor(H(g, r, 11) * TS); for (let x = 0; x < 12; x++) p.set(wrap(gx + x), gy, W[1 + k]); }
      const kx = Math.floor(H(r, 3, 12) * 50) + 6; p.set(kx, y0 + 8, W[0]); p.set(kx + 1, y0 + 8, W[1]); p.set(kx, y0 + 9, W[1]);
    }
  });
  add((p) => { p.rect(0, 0, TS, TS, 0xe4cd98, 60); for (let i = 0; i < TS; i++) { p.set(i, 0, S[2]); p.set(0, i, S[2]); } }); // LAMP lens
  add((p) => {                                                // TEAL: reactor glass, lit
    const G = RA.glowTeal;
    p.rect(0, 0, TS, TS, G[1], 150);
    for (let y = 0; y < TS; y += 4) p.hl(0, TS - 1, y, G[3], 120);
    for (let i = 0; i < TS; i++) { p.set(i, 0, S[1]); p.set(0, i, S[1]); }
  });
  add((p) => {                                                // TREAD: diamond floor plate
    p.rect(0, 0, TS, TS, S[3]);
    for (let y = 0; y < TS; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < TS; x += 8) { p.set(x, y, S[5]); p.set(x + 1, y + 1, S[5]); p.set(x + 2, y + 2, S[2]); }
    for (let i = 0; i < TS; i++) { p.set(i, 0, S[1]); p.set(0, i, S[1]); }
  });
  add((p) => {                                                // COAL seam rock
    const R = RA.basalt;
    p.rect(0, 0, TS, TS, R[1]);
    for (let i = 0; i < 18; i++) { const x = Math.floor(H(i, 1, 13) * 60), y = Math.floor(H(i, 2, 13) * 60), w = 3 + Math.floor(H(i, 3, 13) * 7); poly(p, [[x, y], [x + w, y + 1], [x + w - 1, y + w * 0.6], [x + 1, y + w * 0.7]], R[2 + (i % 3)]); p.hl(x + 1, x + w - 2, y + 1, R[5]); }
    for (let i = 0; i < 8; i++) p.set(Math.floor(H(i, 5, 13) * TS), Math.floor(H(i, 6, 13) * TS), RA.slate[5]);
  });
  add((p) => {                                                // copper seam rock
    const R = RA.stone, T = RA.teal;
    p.rect(0, 0, TS, TS, R[2]);
    for (let i = 0; i < 16; i++) { const x = Math.floor(H(i, 1, 14) * 60), y = Math.floor(H(i, 2, 14) * 60), w = 3 + Math.floor(H(i, 3, 14) * 8); poly(p, [[x, y], [x + w, y + 2], [x + w - 2, y + w * 0.7], [x, y + w * 0.5]], R[3 + (i % 3)]); }
    for (let i = 0; i < 14; i++) { const x = Math.floor(H(i, 7, 14) * 62), y = Math.floor(H(i, 8, 14) * 62); p.set(x, y, T[4]); p.set(x + 1, y, T[3]); p.set(x, y + 1, T[2]); }
    for (let i = 0; i < 5; i++) { const x = Math.floor(H(i, 9, 14) * 62), y = Math.floor(H(i, 10, 14) * 62); p.set(x, y, RA.rust[4]); }
  });
  add((p) => {                                                // MOSS: grow-shed beds, drawn blade clumps
    const M = RA.moss;
    p.rect(0, 0, TS, TS, RA.soil[2]);
    for (let i = 0; i < 40; i++) { const x = Math.floor(H(i, 1, 15) * 62), y = Math.floor(H(i, 2, 15) * 60) + 3, k = 2 + Math.floor(H(i, 3, 15) * 4); p.line(x, y, x - 1, y - 3, M[k]); p.line(x + 1, y, x + 2, y - 2, M[k - 1]); p.set(x - 1, y - 3, M[Math.min(6, k + 1)]); }
  });
  add((p) => { p.rect(0, 0, TS, TS, RA.ink[1]); for (let y = 0; y < TS; y += 3) p.hl(0, TS - 1, y, RA.ink[2]); }); // INK (dark rubber, shadows)
  add((p) => plate(p, B, 3, 6, false));                       // BRASS
  // name plates: stencilled cream on olive, a serial and the Corps mark
  LABELS.forEach((name, k) => add((p) => {
    p.rect(0, 0, TS, TS, O[2]);
    for (let i = 0; i < TS; i++) { p.set(i, 0, O[4]); p.set(0, i, O[4]); p.set(i, TS - 1, O[0]); p.set(TS - 1, i, O[0]); }
    const words = name.split(' ');
    let y = 10;
    const lines = words.length > 1 && textW(name) > 56 ? words : [name];
    for (const ln of lines) { const w = textW(ln); const sc = w > 56 ? 1 : 1; void sc; text(p, ln, Math.max(2, Math.round((TS - w) / 2)), y, RA.paper[5]); y += 8; }
    p.hl(6, TS - 7, y + 2, RA.paper[3]);
    const ser = `USPC ${57}-${String(100 + k * 7).padStart(3, '0')}`;
    text(p, ser, Math.round((TS - textW(ser)) / 2), y + 6, RA.paper[3]);
    text(p, 'NO.' + (k + 1), Math.round((TS - textW('NO.' + (k + 1))) / 2), y + 14, RA.glowAmber[3]);
    for (const [x, yy] of [[3, 3], [TS - 5, 3], [3, TS - 5], [TS - 5, TS - 5]]) { p.set(x, yy, S[5]); p.set(x + 1, yy + 1, S[1]); }
  }));
  return out;
}

let ARR: THREE.DataArrayTexture | null = null;
export function machineTexture(): THREE.DataArrayTexture {
  if (ARR) return ARR;
  const L2 = layers(), n = L2.length, data = new Uint8Array(TS * TS * 4 * n);
  L2.forEach((p, k) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const si = (y * TS + x) * 4, di = k * TS * TS * 4 + ((TS - 1 - y) * TS + x) * 4;
      data[di] = p.d[si]; data[di + 1] = p.d[si + 1]; data[di + 2] = p.d[si + 2]; data[di + 3] = p.d[si + 3] || 255;
    }
  });
  const t = new THREE.DataArrayTexture(data, TS, TS, n);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true;
  ARR = t;
  return t;
}

/** shared uniforms: time (belt scroll, lamp blink) */
export const MU = { uTime: { value: 0 } };

/**
 * The machine material: Lambert lighting over the texture array. Geometry carries aLayer (texture layer) and
 * aGlow (0 none, 1 lit when working, 2 the status lamp); instances carry aState = (lamp rgb, work 0..1) and aBelt
 * (belt scroll speed for belt layers). Non-instanced meshes (ghost, selection copy) default both to zero.
 */
export function machineMaterial(flag: GFlag | number = 1, opts: { ghost?: boolean } = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ transparent: !!opts.ghost, opacity: opts.ghost ? 0.55 : 1, depthWrite: !opts.ghost });
  const U = { uMach: { value: machineTexture() }, uGhost: { value: new THREE.Color(0x9fb4c2) }, uGhostK: { value: opts.ghost ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, MU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aLayer; attribute float aGlow;
#ifdef USE_INSTANCING
attribute vec4 aState; attribute float aBelt;
#endif
uniform float uTime;
varying vec3 vUvl; varying float vGlow; varying vec4 vState;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec2 tuv = uv;
#ifdef USE_INSTANCING
vState = aState;
if (abs(aLayer - ${L.BELT}.0) < 0.5) tuv.y -= uTime * aBelt;
#else
vState = vec4(0.85, 0.7, 0.35, 0.0);
#endif
vUvl = vec3(tuv, aLayer); vGlow = aGlow;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2DArray uMach; uniform vec3 uGhost; uniform float uGhostK, uTime;
varying vec3 vUvl; varying float vGlow; varying vec4 vState;`)
      .replace('#include <map_fragment>', `vec4 mt = texture(uMach, vUvl, -0.4);
diffuseColor.rgb *= mix(mt.rgb, uGhost * (0.55 + 0.45 * dot(mt.rgb, vec3(0.33))), uGhostK);
float lit = 1.0 - mt.a;
float glowK = vGlow > 1.5 ? 1.0 : vGlow > 0.5 ? vState.a : 0.0;
vec3 glowCol = vGlow > 1.5 ? vState.rgb : mt.rgb;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += glowCol * lit * glowK * 2.2 * (1.0 - uGhostK);`);
  };
  m.customProgramCacheKey = () => 'fac-machine' + (opts.ghost ? '-g' : '');
  return opts.ghost ? gbuf(m, 0) : gbuf(m, flag);
}

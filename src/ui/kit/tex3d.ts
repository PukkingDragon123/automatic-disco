// UI KIT · PAINTED TEXTURES for the 3D elements. Small pixel-art tiles and decals painted from the master ramps with
// the same material fields as the 2D plates (src/ui/kit/mat.ts): worn steel, brass, copper coils, chipped enamel,
// olive drab, planked wood, rubber, leather, knurling, blueprint paper, glass with a liquid level, hazard stripes,
// stencils. Nearest-filtered, so every texel stays a crisp pixel when the model is drawn at art resolution.
//   tex(name, repeat?)      a cached THREE texture of a named paint
//   paintTex(key, w, h, f)  paint your own (f gets a kit Px buffer), cached by key
import * as THREE from 'three';
import { Px, P, INK, hash, bayer, at, mixHex, rivet, type Ramp } from './px';
import { materialField, type Mat } from './mat';
import { bitPx } from './bitfont';

const cache = new Map<string, THREE.Texture>();
function toTex(p: Px): THREE.Texture {
  const t = new THREE.CanvasTexture(p.canvas());
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}
/** paint a texture once (cached by key); repeat sets how many times it tiles */
export function paintTex(key: string, w: number, h: number, f: (p: Px) => void, repeat: [number, number] = [1, 1]): THREE.Texture {
  const k = key + '|' + repeat.join('x');
  let t = cache.get(k);
  if (t) return t;
  let base = cache.get(key + '|base');
  if (!base) { const p = new Px(w, h); f(p); base = toTex(p); cache.set(key + '|base', base); }
  t = repeat[0] === 1 && repeat[1] === 1 ? base : base.clone();
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  cache.set(k, t);
  return t;
}
const fillMat = (p: Px, mat: Mat, ramp: Ramp, base: number, seed: number) => { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, at(ramp, base + materialField(mat, x, y, seed, p.w, p.h))); };
/** paint chips through a paint coat to the metal under it (upper-left lip shaded, lower-right lit) */
function chips(p: Px, n: number, seed: number, metal: Ramp, coat: Ramp, coatK: number) {
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(hash(i, seed, 1) * p.w), cy = Math.floor(hash(i, seed, 2) * p.h), s = 1 + Math.floor(hash(i, seed, 3) * 3);
    for (let j = 0; j < s; j++) for (let q = 0; q < s + 1; q++) { const x = (cx + q - (j >> 1) + p.w) % p.w, y = (cy + j) % p.h; p.set(x, y, j === 0 || q === 0 ? at(coat, coatK - 2) : at(metal, 3)); }
    p.set((cx + s + 1) % p.w, (cy + s) % p.h, at(coat, coatK + 1));
  }
}

type Paint = (p: Px) => void;
const PAINTS: Record<string, [number, number, Paint]> = {
  steel: [32, 32, (p) => fillMat(p, 'steel', P.steel, 3, 3)],
  gun: [32, 32, (p) => fillMat(p, 'gun', P.steel, 2, 5)],
  darkSteel: [32, 32, (p) => fillMat(p, 'gun', P.steel, 2, 9)],
  brass: [32, 32, (p) => { fillMat(p, 'brass', P.brass, 4, 4); for (let i = 0; i < 5; i++) { const x = Math.floor(hash(i, 7) * 32), y = Math.floor(hash(i, 8) * 32); p.set(x, y, P.teal[3]); p.set(x + 1, y, P.teal[2]); } }],
  copper: [32, 32, (p) => fillMat(p, 'copper', P.copper, 4, 6)],
  enamel: [32, 32, (p) => { fillMat(p, 'enamel', P.bone, 4, 2); chips(p, 4, 11, P.steel, P.bone, 4); }],
  teal: [32, 32, (p) => { fillMat(p, 'enamel', P.teal, 3, 3); chips(p, 4, 12, P.steel, P.teal, 3); }],
  olive: [32, 32, (p) => { fillMat(p, 'olive', P.olive, 3, 5); chips(p, 5, 13, P.steel, P.olive, 3); }],
  orange: [32, 32, (p) => { fillMat(p, 'orange', P.rust, 4, 6); chips(p, 4, 14, P.steel, P.rust, 4); }],
  red: [32, 32, (p) => { fillMat(p, 'enamel', P.ruby, 4, 7); chips(p, 3, 15, P.steel, P.ruby, 4); }],
  white: [32, 32, (p) => { fillMat(p, 'enamel', P.snow, 4, 8); chips(p, 3, 16, P.steel, P.snow, 4); }],
  rubber: [32, 32, (p) => fillMat(p, 'rubber', P.basalt, 4, 1)],
  leather: [32, 32, (p) => { fillMat(p, 'leather', P.clay, 2, 2); for (let x = 0; x < 32; x += 2) { p.set(x, 1, P.clay[4]); p.set(x, 30, P.clay[4]); } }],
  wood: [32, 32, (p) => fillMat(p, 'wood', P.soil, 4, 3)],
  ochreWood: [32, 32, (p) => fillMat(p, 'wood', P.ochre, 4, 9)],
  stone: [32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const n = hash(x >> 2, y >> 2, 3) * 0.6 + hash(x >> 1, y >> 1, 4) * 0.4; p.set(x, y, at(P.stone, 2 + Math.round(n * 3 - 0.5 + (bayer(x, y) - 0.5) * 0.6))); } }],
  ore: [32, 32, (p) => { PAINTS.stone[2](p); for (let i = 0; i < 14; i++) { const x = Math.floor(hash(i, 21) * 31), y = Math.floor(hash(i, 22) * 31); p.set(x, y, P.copper[5]); p.set(x + 1, y, P.copper[4]); p.set(x, y + 1, P.copper[3]); } }],
  // knurling: fine vertical ridges (knobs, grips)
  knurl: [32, 8, (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 3 === 0 ? P.brass[5] : x % 3 === 1 ? P.brass[3] : P.brass[1]); }],
  knurlSteel: [32, 8, (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 3 === 0 ? P.steel[5] : x % 3 === 1 ? P.steel[3] : P.steel[1]); }],
  // copper coil windings
  coil: [16, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) { const k = y % 3; p.set(x, y, k === 0 ? P.copper[6] : k === 1 ? P.copper[4] : P.copper[1]); } }],
  // a braided cable
  cable: [8, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) p.set(x, y, ((x + y) % 4 < 2) ? P.steel[4] : P.steel[2]); }],
  hazard: [32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, ((x + y) % 16) < 8 ? P.ochre[5] : P.ink[1]); chips(p, 4, 31, P.steel, P.ochre, 5); }],
  // glass: dark teal with two hard reflection streaks
  glass: [32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, x === 5 || x === 6 || x === 9 ? P.sky[5] : x < 4 ? P.water[3] : P.water[2]); }],
  lens: [32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 11, y - 11); p.set(x, y, d < 3 ? 0xf4fbff : d < 6 ? P.glowTeal[4] : at(P.glowTeal, 3 - Math.floor(Math.hypot(x - 16, y - 16) / 6))); } }],
  amberLens: [32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 11, y - 11); p.set(x, y, d < 3 ? 0xfff6dc : d < 6 ? P.glowAmber[4] : at(P.glowAmber, 3 - Math.floor(Math.hypot(x - 16, y - 16) / 6))); } }],
  // the gene tank's fluid: lit green with rising bubbles and a hard vertical glass glint
  fluid: [64, 64, (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const k = 0.5 + 0.5 * Math.sin((x / 64) * Math.PI * 2); p.set(x, y, at(P.malachite, 3 + Math.round(k * 2 + (bayer(x, y) - 0.5)))); }
    for (let i = 0; i < 22; i++) { const x = Math.floor(hash(i, 41) * 62), y = Math.floor(hash(i, 42) * 62), r = hash(i, 43) > 0.7 ? 2 : 1; for (let j = 0; j < r + 1; j++) for (let q = 0; q < r + 1; q++) p.set(x + q, y + j, q === 0 && j === 0 ? 0xe8ffe8 : P.malachite[6]); }
    for (let y = 0; y < 64; y++) { p.set(10, y, P.malachite[6]); p.set(11, y, 0xdaf5d8); p.set(15, y, P.malachite[6]); }
  }],
  // a flask: glass above the level, bright liquid below
  flask: [32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const liquid = y > 13; p.set(x, y, liquid ? at(P.glowTeal, 2 + ((x + y) % 7 === 0 ? 2 : 0)) : (x % 16 === 3 || x % 16 === 4) ? P.sky[5] : P.water[2]); } for (let x = 0; x < 32; x++) p.set(x, 13, P.glowTeal[4]); }],
  // a small phosphor screen (one scan graph) for the scanner
  screen: [32, 24, (p) => { p.rect(0, 0, 32, 24, 0x0d2018); for (let x = 2; x < 30; x++) { const y = Math.round(12 + Math.sin(x * 0.5) * 5 * Math.sin(x * 0.13)); p.set(x, y, P.glowTeal[4]); p.set(x, y + 1, P.glowTeal[2]); } for (let y = 1; y < 24; y += 2) for (let x = 0; x < 32; x++) p.shade(x, y, 0.8); p.rect(2, 2, 6, 2, P.glowAmber[3]); }],
  // planked crate wood with a stencilled mark
  crate: [64, 64, (p) => {
    fillMat(p, 'wood', P.soil, 4, 5);
    for (let y = 0; y < 64; y++) { p.set(0, y, INK); p.set(1, y, P.soil[5]); p.set(62, y, P.soil[1]); p.set(63, y, INK); }
    for (let x = 0; x < 64; x++) { p.set(x, 0, INK); p.set(x, 1, P.soil[5]); p.set(x, 62, P.soil[1]); p.set(x, 63, INK); }
    for (const [x, y] of [[5, 5], [57, 5], [5, 57], [57, 57]]) { p.rect(x - 2, y - 2, 6, 6, P.steel[2]); rivet(p, x, y, 1); }
    // a stencilled UNAA arrow mark
    for (let j = 0; j < 12; j++) { const w = j < 6 ? j * 2 + 1 : 4; for (let i = 0; i < w; i++) if (hash(i, j, 5) > 0.12) p.set(32 - (w >> 1) + i, 22 + j, P.soil[1]); }
  }],
};
/** a cached named texture, tiled repeat times */
export function tex(name: keyof typeof PAINTS | string, repeat: [number, number] = [1, 1]): THREE.Texture {
  const d = PAINTS[name];
  if (!d) throw new Error('kit tex: no paint ' + name);
  return paintTex(name, d[0], d[1], d[2], repeat);
}
export const TEX_NAMES = Object.keys(PAINTS);

// ------------------------------------------------------------------ decals used by the dock models
/** a blueprint sheet: deep blue paper with a fine grid and white lines drawing a pod in elevation, dimension lines,
 *  a title block, folds and a little foxing */
export function blueprintTex(): THREE.Texture {
  return paintTex('blueprint', 96, 64, (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 96; x++) { const g = x % 8 === 0 || y % 8 === 0; p.set(x, y, g ? P.sapphire[3] : at(P.sapphire, 2 + (hash(x >> 1, y >> 1, 3) > 0.92 ? 1 : 0))); }
    const W = 0xdce8f0, Wd = P.sapphire[5];
    // the pod in elevation: a dome, a body, legs
    const cx = 38, base = 46;
    for (let a = 0; a <= Math.PI; a += 0.02) { p.set(Math.round(cx + Math.cos(a) * 16), Math.round(base - 22 - Math.sin(a) * 12), W); }
    p.hl(cx - 18, cx + 18, base - 22, W); p.hl(cx - 18, cx + 18, base - 8, W); p.vl(cx - 18, base - 22, base - 8, W); p.vl(cx + 18, base - 22, base - 8, W);
    for (let i = 0; i < 4; i++) p.rect(cx - 13 + i * 8, base - 18, 3, 3, Wd);
    p.line(cx - 14, base - 8, cx - 22, base, W); p.line(cx + 14, base - 8, cx + 22, base, W); p.hl(cx - 25, cx - 19, base, W); p.hl(cx + 19, cx + 25, base, W);
    p.rect(cx - 3, base - 14, 6, 6, W); p.vl(cx, base - 40, base - 34, W);
    // dimension lines with arrow ticks
    p.hl(cx - 18, cx + 18, base + 6, Wd); p.vl(cx - 18, base + 4, base + 8, Wd); p.vl(cx + 18, base + 4, base + 8, Wd);
    p.vl(cx + 26, base - 34, base - 8, Wd); p.hl(cx + 24, cx + 28, base - 34, Wd); p.hl(cx + 24, cx + 28, base - 8, Wd);
    // the title block
    p.rect(70, 44, 24, 18, P.sapphire[1]); p.hl(70, 93, 44, W); p.vl(70, 44, 61, W); p.hl(70, 93, 50, Wd); p.hl(70, 93, 56, Wd);
    for (let i = 0; i < 3; i++) p.hl(72, 72 + 6 + i * 5, 47 + i * 6, W);
    // a fold
    for (let y = 0; y < 64; y++) { p.set(48, y, P.sapphire[1]); p.set(49, y, P.sapphire[4]); }
    for (let i = 0; i < 10; i++) { const x = Math.floor(hash(i, 51) * 94), y = Math.floor(hash(i, 52) * 62); p.set(x, y, P.sapphire[1]); }
  });
}
/** the roll's end: a spiral of paper */
export function rollEndTex(): THREE.Texture {
  return paintTex('rollEnd', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const dx = x - 15.5, dy = y - 15.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx); const s = (r + a * 1.1) % 3.2; p.set(x, y, r < 2 ? P.sapphire[0] : s < 1 ? P.sapphire[1] : s < 2.2 ? P.paper[4] : P.sapphire[3]); }
  });
}
/** a yellow hex pencil's paint with a stamped line */
export function pencilTex(): THREE.Texture {
  return paintTex('pencil', 32, 12, (p) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 32; x++) p.set(x, y, (x % 6 === 0) ? P.ochre[3] : (x % 6 === 1) ? P.ochre[6] : P.ochre[5]); for (let y = 3; y < 9; y++) p.set(10, y, P.ink[1]); });
}
/** a steel rule with tick marks */
export function rulerTex(): THREE.Texture {
  return paintTex('ruler', 64, 8, (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 64; x++) p.set(x, y, at(P.steel, 5 - (y > 5 ? 1 : 0))); for (let x = 2; x < 64; x += 3) p.vl(x, 0, x % 15 === 2 ? 4 : 2, P.ink[1]); });
}
/** an olive helmet with a stencilled UNAA star, a white number and wear */
export function helmetTex(): THREE.Texture {
  return paintTex('helmet', 64, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) p.set(x, y, at(P.olive, 3 + materialField('olive', x, y, 7) + (y > 26 ? -1 : 0)));
    chips(p, 9, 71, P.steel, P.olive, 3);
    // the star (front: u ~ 0.75 of the way round for a sphere starting at -x)
    const sx = 48, sy = 18;
    for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const a = Math.atan2(j, i), r = Math.hypot(i, j), star = 3 + 2.4 * Math.cos(5 * (a + Math.PI / 2)); if (r < star && hash(i, j, 9) > 0.1) p.set(sx + i, sy + j, P.bone[5]); }
    // stencil number on the side
    for (const [dx, rows] of [[14, ['###', '#..', '###', '..#', '###']], [18, ['###', '..#', '.##', '..#', '###']]] as [number, string[]][]) rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#' && hash(i, j, dx) > 0.15) p.set(dx + i, 16 + j, P.bone[4]); }));
  });
}
/** the research ship's hull: white enamel plates with panel lines, an orange band, small vents and a stencil */
export function hullTex(): THREE.Texture {
  return paintTex('hull', 64, 64, (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, at(P.snow, 4 + materialField('enamel', x, y, 4)));
    for (let x = 0; x < 64; x++) { p.set(x, 15, P.snow[1]); p.set(x, 16, P.snow[5]); p.set(x, 47, P.snow[1]); }
    for (let y = 0; y < 64; y++) { if (y < 15 || y > 47) continue; p.set(21, y, P.snow[1]); p.set(43, y, P.snow[1]); }
    for (let y = 28; y < 35; y++) for (let x = 0; x < 64; x++) p.set(x, y, y === 28 ? P.rust[6] : y === 34 ? P.rust[3] : P.rust[5]);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) p.hl(4 + i * 15, 9 + i * 15, 39 + k * 2, P.steel[2]);
    for (let i = 0; i < 8; i++) rivet(p, 3 + i * 8, 18, 1, P.snow);
    chips(p, 5, 81, P.steel, P.snow, 4);
  });
}
/** a dial face (gauges on tanks and machines) */
export function dialTex(): THREE.Texture {
  return paintTex('dial', 32, 32, (p) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 15.5, y - 15.5); p.set(x, y, d > 14 ? P.steel[1] : d > 12.5 ? P.brass[4] : P.bone[5]); }
    for (let i = 0; i < 9; i++) { const a = -2.3 + (i / 8) * 4.6; p.set(Math.round(15.5 + Math.sin(a) * 10), Math.round(15.5 - Math.cos(a) * 10), i > 6 ? P.ruby[4] : P.ink[1]); }
    p.line(16, 16, 23, 10, P.ruby[3]); p.rect(15, 15, 2, 2, P.ink[1]);
  });
}
/** a tiny stencilled word on a plate (labels on models) */
export function labelTex(text: string, ramp: Ramp = P.bone): THREE.Texture {
  return paintTex('label|' + text, 64, 20, (p) => { p.rect(0, 0, 64, 20, ramp[3]); p.hl(0, 63, 0, ramp[5]); p.hl(0, 63, 19, ramp[1]); bitPx(p, text, 32, 1, { align: 'center', color: '#' + P.ink[1].toString(16).padStart(6, '0'), outline: null }); });
}
export { mixHex };

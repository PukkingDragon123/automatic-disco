// Per-character texture page: every survivor gets a 256x256 pixel-art page
// painted at ~2x the world's texel density (higher on the face): skin with
// baked occlusion and subtle colour variation, a readable face (eyes with
// whites/iris/lids, brows, lips, nose shading, stubble, freckles, age lines,
// scars), hair, and every garment with seams, folds, pockets, zips, prints,
// wear and dirt, plus visible condition (blood, bandages, wet, dirt, pallor).
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer, ph } from '../gfx/pixel';
import { Rng, hashStr, tileFbm } from '../core/rng';
import { REG, RegKey, PAGE, PAD, VMAP, REG_K } from './humanModel';
import type { Appearance, Outfit, LookPart, RigCondition } from './humanRig';
import { OutfitShape, garment, Paint, paintFallback, text } from './humanClothes';
import { shapeOf, eyeShapeOf, browsOf, noseOf, noseK, mouthOf, TATTOOS, TATTOO_SPOTS, TEXT_TATTOOS, SCAR_SPOTS, KNUCKLES, NAILS, suitLooks, isJumpsuit, suitNumber } from './humanLooks';

const NOISE = new Map<string, Float32Array>();
const LIGHT = new Map<string, Float32Array>();
/** baked occlusion fields depend only on the region (and body shape), so compute them once */
function cachedLight(S: Surf, key: string, fn: (x: number, y: number) => number) {
  const k = S.w + 'x' + S.h + ':' + key;
  let f = LIGHT.get(k);
  if (!f) { f = new Float32Array(S.w * S.h); for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) f[y * S.w + x] = fn(x, y); LIGHT.set(k, f); }
  const w = S.w, F = f;
  S.light = (x, y) => F[y * w + x];
}

// ------------------------------------------------------------------ surface helper
export class Surf {
  pc: PixelCanvas;
  w: number; h: number;
  /** v range in reference metres */
  range: number[];
  /** +1 left limb, -1 right limb, 0 centre */
  side: number;
  key: RegKey;
  seed: number;
  /** extra shading term per pixel in ramp steps (baked occlusion) */
  light: (x: number, y: number) => number = () => 0;
  /** scales the occlusion for the next fills (skin wants it softer than cloth) */
  lightMul = 1;
  constructor(key: RegKey, range: number[], side: number, seed: number) {
    const r = REG[key];
    this.key = key; this.w = r.w; this.h = r.h; this.range = range; this.side = side; this.seed = seed;
    this.pc = new PixelCanvas(r.w, r.h);
    this.pc.wrap = true;
  }
  /** column of an angle (deg; 0 = front, +90 = outer side for limbs / character's left on the torso) */
  X(deg: number) { return (0.5 + deg / 360) * this.w; }
  /** row of a height in reference metres */
  Y(y: number) { return (1 - (y - this.range[0]) / (this.range[1] - this.range[0])) * this.h; }
  deg(x: number) { return ((x + 0.5) / this.w - 0.5) * 360; }
  yAt(row: number) { return this.range[0] + (1 - (row + 0.5) / this.h) * (this.range[1] - this.range[0]); }
  /** dithered write of a fractional ramp index (dither only near the middle between two steps) */
  put(x: number, y: number, R: number[], v: number, dither = 0.5) {
    let i = Math.floor(v);
    if (v - i > 0.5 + (bayer(x, y) - 0.5) * dither) i++;
    this.pc.set(x, y, R[i < 0 ? 0 : i >= R.length ? R.length - 1 : i]);
  }
  /** fill rows [y0, y1) (optionally masked) with ramp values */
  fill(R: number[], fn: (x: number, y: number) => number, y0 = 0, y1 = this.h, mask?: (x: number, y: number) => boolean) {
    const a = Math.max(0, Math.floor(y0)), b = Math.min(this.h, Math.ceil(y1));
    for (let y = a; y < b; y++) for (let x = 0; x < this.w; x++) {
      if (mask && !mask(x, y)) continue;
      this.put(x, y, R, fn(x, y) + this.light(x, y) * Math.min(1.2, R.length / 8) * this.lightMul);
    }
  }
  /** horizontal wrapped line across the whole circumference */
  ring(y: number, c: number, t = 1) { const yy = Math.round(y); for (let x = 0; x < this.w; x++) this.pc.blend(x, yy, c, t); }
  /** tileable noise (wraps with the region size); fields are cached, four variants per region */
  fbm(x: number, y: number, cells = 3, oct = 2, seed = 0) {
    const w = this.w, h = this.h;
    const key = w + 'x' + h + ':' + cells + ':' + oct + ':' + (seed + (this.seed & 3) * 1009);
    let f = NOISE.get(key);
    if (!f) {
      f = new Float32Array(w * h);
      const sd = seed + (this.seed & 3) * 1009;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) f[j * w + i] = tileFbm(i, j, w, h, cells, oct, sd);
      NOISE.set(key, f);
    }
    const xi = ((Math.floor(x) % w) + w) % w, yi = ((Math.floor(y) % h) + h) % h;
    return f[yi * w + xi];
  }
}

// ------------------------------------------------------------------ appearance helpers
export const EYE_COLORS = [0x5a3a22, 0x3a2414, 0x6a7a3a, 0x3a6a9a, 0x6a8aa8, 0x8a6a3a, 0x4a5a5a];
export interface Skin { R: number[]; base: number; app: Appearance; fem: number; seed: number; pale: number; dirt: number; wet: number }

function skinRamp(c: number, pale: number) {
  let base = scaleHex(c, 0.92);
  if (pale > 0) base = mixHex(base, 0xa8aab0, 0.16 * pale);
  return makeRamp(base, 12, { hueShift: 0.03, spread: 0.55, satShift: 0.08 });
}
const SKIN_MID = 5.6;

// ------------------------------------------------------------------ body skin
function paintSkinBody(S: Surf, K: Skin) {
  const R = K.R;
  S.lightMul = 0.7;
  S.fill(R, (x, y) => SKIN_MID + (S.fbm(x, y, 3, 2, 3) - 0.5) * 0.45 + (ph(x, y, K.seed) - 0.5) * 0.1);
  S.lightMul = 1;
}

function torsoLight(S: Surf, fem: number) {
  fem = Math.round(fem * 4) / 4;
  cachedLight(S, 'torso' + fem, (x, y) => {
    const th = (S.deg(x) * Math.PI) / 180, yy = S.yAt(y);
    let l = 0.25 * Math.cos(th) - 0.15;
    // armpits / sides under the arms
    l -= 1.1 * Math.exp(-((yy - 1.33) ** 2) / 0.003) * Math.exp(-((Math.abs(th) - Math.PI / 2) ** 2) / 0.12);
    // crotch and between the legs
    l -= 0.7 * Math.min(1.2, Math.max(0, (0.875 - yy) / 0.06)) * (0.4 + 0.6 * Math.abs(Math.cos(th)));
    // under bust / pecs
    l -= (0.6 * fem + 0.25) * Math.exp(-((yy - 1.2) ** 2) / 0.0006) * Math.exp(-((Math.abs(th) - 0.48) ** 2) / 0.12) * (Math.cos(th) > 0 ? 1 : 0);
    // top of shoulders catch light
    l += 0.4 * Math.max(0, (yy - 1.4) / 0.08);
    // neck base shadow
    l -= 0.5 * Math.max(0, (yy - 1.47) / 0.03);
    return l;
  });
}
function limbLight(S: Surf, kind: 'arm' | 'leg') {
  cachedLight(S, kind, (x, y) => {
    const th = (S.deg(x) * Math.PI) / 180, yy = S.yAt(y);
    // u=0.25 (-90deg) is the inner side
    let l = -0.35 * Math.max(0, -Math.sin(th)) + 0.18 * Math.cos(th) - 0.1;
    if (kind === 'arm') {
      l -= 1.0 * Math.max(0, (yy - 0.0) / 0.05) * Math.max(0, -Math.sin(th));    // armpit
      l -= 0.6 * Math.exp(-((yy + 0.285) ** 2) / 0.0006) * Math.max(0, Math.cos(th) * 0.7 - Math.sin(th) * 0.3); // inner elbow
      l += 0.25 * Math.max(0, (yy - 0.0) / 0.06) * Math.max(0, Math.sin(th)); // shoulder cap
    } else {
      l -= 0.7 * Math.max(0, (yy + 0.02) / 0.07) * Math.max(0, -Math.sin(th) * 0.8 + 0.2); // crotch
      l -= 0.8 * Math.exp(-((yy + 0.45) ** 2) / 0.0008) * Math.max(0, -Math.cos(th)); // back of knee
      l += 0.25 * Math.exp(-((yy + 0.43) ** 2) / 0.0008) * Math.max(0, Math.cos(th)); // kneecap highlight
      l -= 0.3 * Math.max(0, (-0.8 - yy) / 0.06);
    }
    return l;
  });
}

// ------------------------------------------------------------------ face
const HX = (S: Surf, deg: number) => Math.round(S.X(deg) - 0.5);
const HY = (S: Surf, y: number) => Math.round(S.Y(y) - 0.5);

function paintHead(S: Surf, K: Skin, o: Outfit, sh: OutfitShape, cond: RigCondition) {
  const R = K.R, A = K.app, fem = K.fem;
  const face = A.face ?? 0;
  const rng = new Rng(K.seed + 11);
  const hairC = A.hair;
  const age = A.age ?? 0;
  // the face is painted at twice the body's density: k pixels per old pixel
  const k2 = Math.max(1, Math.round(S.w / 96));
  const px = (deg: number) => Math.round(S.X(deg) - 0.5), py = (y: number) => Math.round(S.Y(y) - 0.5);
  const P = S.pc;
  // ---- base skin with facial occlusion (the sculpted sockets and cheekbones shade themselves; this deepens them a little)
  cachedLight(S, 'head', (x, y) => {
    const deg = S.deg(x), yy = S.yAt(y);
    const a = Math.abs(deg);
    let l = 0.12;
    l -= 0.9 * Math.max(0, (0.0 - yy) / 0.03);                                  // under the jaw
    l -= 0.35 * Math.max(0, (a - 70) / 110);                                     // sides/back away from the face
    l += 0.3 * Math.exp(-((yy - 0.15) ** 2) / 0.002) * Math.max(0, 1 - a / 60);  // forehead highlight
    l -= 0.22 * Math.exp(-((yy - 0.104) ** 2) / 0.00012) * Math.exp(-((a - 17) ** 2) / 110); // eye sockets (under the brow)
    l += 0.15 * Math.exp(-((yy - 0.077) ** 2) / 0.0003) * Math.exp(-((a - 43) ** 2) / 180); // cheekbones
    l -= 0.12 * Math.exp(-((yy - 0.05) ** 2) / 0.0004) * Math.exp(-((a - 34) ** 2) / 150); // under cheekbones
    return l;
  });
  // skin: mottled, with pores flecked in on the cheeks and nose
  S.fill(R, (x, y) => SKIN_MID + (S.fbm(x, y, 5, 2, 5) - 0.5) * 0.5 + (ph(x, y, K.seed + 1) - 0.5) * 0.14);
  for (let y = py(0.11); y <= py(0.04); y++) for (let x = px(-60); x <= px(60); x++) {
    const h = ph(x, y, K.seed + 77);
    if (h < 0.03) P.blend(x, y, R[4], 0.35); else if (h > 0.985) P.blend(x, y, R[7], 0.3);
  }
  // warm flush: cheeks, nose tip, ears; lips of the eyelids
  const warm = mixHex(R[5], 0xd06050, 0.28);
  for (const k of [1, -1]) {
    P.ditherBlob(S.X(k * 38), S.Y(0.066), 3.4 * k2, 2.3 * k2, warm, 0.5 + fem * 0.25);
    P.ditherBlob(S.X(k * 95), S.Y(0.084), 2 * k2, 4 * k2, mixHex(R[4], 0xc05048, 0.25), 0.7);
  }
  P.ditherBlob(S.X(0), S.Y(0.058), 1.6 * k2, 1.4 * k2, warm, 0.55);
  const fh = String(A.facialHair || (A.beard ? 'beard' : 'none'));
  const beardArea = (deg: number, yy: number) => {
    const a = Math.abs(deg);
    if (yy > 0.058 || yy < -0.028) return 0;
    if (a > 92) return 0;
    if (yy > 0.043 && a < 13) return 0.75;             // upper lip
    if (yy > 0.024 && yy < 0.043 && a < 21) return 0;  // lips
    const cheekTop = 0.055 - (a > 40 ? (a - 40) * 0.0004 : 0);
    if (yy > cheekTop) return 0;
    return yy > cheekTop - 0.006 ? 0.5 : 1;
  };
  const stubble = fh === 'stubble' ? 0.85 : fh === 'beard' || fh === 'goatee' || fh === 'moustache' || fh === 'handlebar' || fh === 'chops' || fh === 'chin_strap' ? 0.4 : fh === 'soul_patch' ? 0.2 : Math.max(0, 0.5 - fem) * 0.3;
  if (stubble > 0) {
    // a cool shadow over the beard area, flecked with single dark hairs
    const shadow = mixHex(R[4], 0x4a5058, 0.18 + stubble * 0.12);
    const dot = mixHex(mixHex(R[3], 0x30343a, 0.3), scaleHex(hairC, 0.7), 0.45);
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const a = beardArea(S.deg(x), S.yAt(y));
      if (a <= 0) continue;
      P.blend(x, y, shadow, a * (0.22 + stubble * 0.32));
      if (ph(x, y, K.seed + 31) < a * stubble * 0.38) P.blend(x, y, dot, 0.65);
    }
  }
  // painted facial hair: soul patch under the lip, the sideburn half of mutton chops, the strap along the jaw
  {
    const HRf = makeRamp(hairC, 5, { hueShift: 0.03, spread: 0.5 });
    if (fh === 'soul_patch') for (let x = -2; x <= 2; x++) for (let y = 0; y < 6; y++) if (Math.abs(x) < 2 || y < 4) P.set(px(0) + x, py(0.023) + y, HRf[1 + ((x + y) & 1)]);
    if (fh === 'chops' || fh === 'chin_strap') for (const k of [-1, 1]) for (let y = py(fh === 'chops' ? 0.1 : 0.075); y <= py(0.0); y++) for (let i = 0; i < (fh === 'chops' ? 8 : 4); i++) P.set(px(k * (80 - i * 2)), y, HRf[1 + ((i + y) & 1)]);
  }
  // ---- scalp under the hair: paint hair colour above the hairline so gaps never show skin
  const style = String(A.hairStyle);
  const HR = makeRamp(hairC, 6, { hueShift: 0.03, spread: 0.5 });
  if (style !== 'bald' && style !== 'shaved') {
    const shavedSides = style === 'mohawk' || style === 'undercut';
    const line = (deg: number) => {
      const a = Math.abs(deg);
      let front = style === 'buzz' || style === 'cornrows' ? 0.158 : 0.155, temple = 0.132, side = style === 'buzz' || style === 'cornrows' ? 0.112 : 0.1, back = 0.03;
      if (style === 'receding') { front = 0.19; temple = 0.174; }
      if (shavedSides) { temple = 0.15; side = 0.168; back = 0.135; }
      if (a < 25) return front; if (a < 60) return front + (temple - front) * ((a - 25) / 35);
      if (a < 105) return temple + (side - temple) * ((a - 60) / 45); return side + (back - side) * Math.min(1, (a - 105) / 55);
    };
    const mohawk = style === 'mohawk';
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const deg = S.deg(x), yy = S.yAt(y), ln = line(deg);
      const crest = !mohawk || Math.abs(Math.sin((deg * Math.PI) / 180)) < 0.22;
      // a ragged hairline: single hairs reach a little below it
      const rag = (ph(x, 0, 13) - 0.5) * 0.006;
      if (yy > ln + 0.004 + rag && crest) S.put(x, y, HR, 2.4 + (ph(x, y, 3) - 0.5) * (style === 'buzz' ? 2 : 1));
      else if (yy > ln - 0.006 + rag && crest && ph(x, y, 5) < (yy - ln + 0.006) / 0.01) P.blend(x, y, HR[2], 0.7);
    }
    // shaved sides: a stubble shadow below the long top
    if (shavedSides) for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const deg = S.deg(x), yy = S.yAt(y), a = Math.abs(deg);
      if (yy < 0.1 && a < 100) continue;
      if (yy < 0.02 || yy > 0.205) continue;
      if (mohawk ? Math.abs(Math.sin((deg * Math.PI) / 180)) < 0.22 : yy > line(deg) + 0.004) continue;
      if (a < 30 && yy < 0.15) continue;
      P.blend(x, y, mixHex(HR[2], R[4], 0.45), 0.55);
      if (ph(x, y, 17) < 0.3) P.blend(x, y, HR[1], 0.5);
    }
    // cornrows: tight rows from the hairline back over the crown
    if (style === 'cornrows') for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const yy = S.yAt(y);
      if (yy < line(S.deg(x)) + 0.004) continue;
      const cx = x % (3 * k2);
      if (cx === 0) P.set(x, y, HR[0]); else if ((cx + (y >> 1)) % 3 === 1) P.set(x, y, HR[4]);
    }
    // sideburns
    if (style !== 'long' && style !== 'bob' && !shavedSides) for (const k of [1, -1]) for (let y = py(0.13); y <= py(0.07 + fem * 0.04); y++) for (let dx = 0; dx < 2 * k2; dx++) P.blend(px(k * (84 - dx * 2)), y, HR[1 + ((y + dx) & 1)], 0.8);
  } else if (style === 'shaved') {
    // a shaved head: the hairline as a grey-blue shadow, flecked
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const deg = S.deg(x), yy = S.yAt(y), a = Math.abs(deg);
      const ln = a < 25 ? 0.158 : a < 105 ? 0.13 - (a - 25) * 0.0002 : 0.03;
      if (yy < ln) continue;
      P.blend(x, y, mixHex(R[3], HR[2], 0.5), 0.42);
      if (ph(x, y, 19) < 0.25) P.blend(x, y, HR[1], 0.45);
    }
    P.ditherBlob(S.X(-20), S.Y(0.19), 5 * k2, 2 * k2, R[7], 0.4);
  } else {
    // bald: scalp highlight
    P.ditherBlob(S.X(-20), S.Y(0.19), 6 * k2, 2.5 * k2, R[7], 0.6);
  }
  // ---- eyes: lid crease, lashes, whites, a ringed iris, pupil and a catch-light
  const eyeY = py(0.099);
  const iris = A.eyeColor ?? EYE_COLORS[Math.floor(ph(K.seed, 1, 2) * EYE_COLORS.length)];
  const IR = makeRamp(iris, 5, { spread: 0.55 });
  const white = mixHex(0xf2efe6, R[6], 0.18), whiteD = mixHex(white, R[3], 0.4), lash = mixHex(0x1c1410, hairC, 0.2), lid = R[3];
  const es = eyeShapeOf(A);
  const narrow = es === 1, round = es === 2;
  const BR = scaleHex(mixHex(hairC, 0x2a2018, 0.25), 0.85), BRl = mixHex(BR, R[4], 0.35);
  const bs = browsOf(A);
  for (const k of [-1, 1]) {
    // k = -1: character's right eye (viewer's left); `out` points from the nose to the outer corner
    const out = k;
    const cx = px(k * 17.5);
    const ey = eyeY + (es === 6 && k > 0 ? 1 : 0);
    const glass = es === 7 && k > 0;
    const IRk = glass ? makeRamp(0x9ab0b8, 5, { spread: 0.4 }) : IR;
    // the opening, row by row: [first column, last column] relative to cx (inner corner toward the nose)
    const rows: [number, number, number][] = narrow ? [[0, -4, 4], [1, -3, 3]]
      : round ? [[-2, -3, 3], [-1, -4, 4], [0, -4, 4], [1, -3, 3]]
      : [[-1, -3, 3], [0, -4, 4], [1, -3, 3]];
    const col = (dx: number) => cx + dx * out;
    // socket shadow + crease above the lid (deep-set and hooded eyes sit in heavier shadow)
    const sock = es === 5 ? 0.55 : es === 3 ? 0.45 : 0.24;
    const t0 = ey + (narrow ? 0 : round ? -2 : -1);
    for (let dx = -5; dx <= 5; dx++) {
      P.blend(col(dx), t0 - 2, R[3], sock * (Math.abs(dx) < 4 ? 1 : 0.5));
      P.blend(col(dx), t0 - 3, R[4], 0.22);
      if (es === 5) P.blend(col(dx), t0 - 3, R[3], 0.3);
    }
    if (es === 3) for (let dx = -4; dx <= 5; dx++) { P.blend(col(dx), t0 - 1, mixHex(R[4], R[5], 0.5), 0.85); P.blend(col(dx), t0 - 2, R[5], 0.6); } // the hooded fold
    // whites, iris, pupil
    const top = rows[0][0];
    for (const [dy, a, b] of rows) for (let dx = a; dx <= b; dx++) P.set(col(dx), ey + dy, Math.abs(dx) >= 3 ? whiteD : white);
    const irisRows = rows.filter(([dy]) => dy >= (round ? -1 : -1));
    const last = rows[rows.length - 1][0];
    for (const [dy] of irisRows) for (let dx = -1; dx <= 1; dx++) {
      const edge = Math.abs(dx) === 1;
      P.set(col(dx), ey + dy, dy === top ? IRk[1] : dy === last ? (edge ? IRk[2] : IRk[4]) : edge ? IRk[1] : IRk[3]);
    }
    if (!glass) { P.set(col(0), ey, 0x0e0a08); if (round) P.set(col(0), ey - 1, 0x0e0a08); }
    if (!glass) P.set(col(-1) , ey + top, mixHex(0xfff8f0, IRk[3], 0.1));   // catch-light
    // upper lid line and lashes (dark), heavier at the outer end; feminine lashes flick out
    for (let dx = -4; dx <= 4; dx++) P.set(col(dx), ey + top - 1, dx >= 3 ? lash : es === 3 ? lid : mixHex(lash, lid, dx < -2 ? 0.5 : 0.15));
    P.set(col(5), ey + top - (fem > 0.5 ? 2 : 1), fem > 0.5 ? lash : mixHex(lash, lid, 0.4));
    if (fem > 0.5) P.set(col(5), ey + top - 1, lash);
    // tear duct at the inner corner
    P.set(col(-5), ey + (narrow ? 0 : 0), mixHex(R[4], 0xc06060, 0.35));
    // lower lid and the soft bag under it (tired and older eyes darker)
    const lo = ey + rows[rows.length - 1][0] + 1;
    for (let dx = -3; dx <= 4; dx++) P.blend(col(dx), lo, es === 4 ? mixHex(R[2], 0x5a4058, 0.25) : R[4], (es === 4 ? 0.7 : 0.45) + age * 0.25);
    for (let dx = -2; dx <= 3; dx++) P.blend(col(dx), lo + 1, R[3], 0.18 + age * 0.25 + (es === 4 ? 0.3 : 0));
    if (es === 4) { P.set(col(4), ey + 1, lid); P.set(col(5), ey + 1, mixHex(lid, lash, 0.4)); } // the drooping outer corner
    // brows: shaped strokes of hair colour, thick at the head near the nose, tapering out
    const by = py(0.118) - (round ? 1 : 0);
    if (bs !== 6) for (let i = 0; i <= 10; i++) {
      const dx = -6 + i;                       // from the nose (-6) to the tail (+4)
      if (bs === 5 && k > 0 && (i === 6 || i === 7)) continue; // split brow: a scar runs through it
      const arch = bs === 2 ? (i >= 5 && i <= 8 ? -1 : 0) - (i === 6 || i === 7 ? 1 : 0) : bs === 1 ? (i < 3 ? 1 : 0) : (i >= 6 && i <= 8 ? -1 : 0);
      const thick = bs === 3 ? (i >= 2 && i <= 8 ? 1 : 0) : bs === 1 ? (i < 8 ? 3 : 2) : bs === 2 ? (i < 7 ? 2 : 1) : (i < 4 ? 3 : i < 9 ? 2 : 1);
      for (let t = 0; t < Math.max(1, thick); t++) {
        const tail = i >= 9 || (bs === 3 && (i < 2 || i > 8));
        P.blend(col(dx), by + arch + t, (t === 0 && i > 2) || ph(i, t, K.seed) < 0.2 ? BRl : BR, tail ? 0.55 : bs === 3 ? 0.75 : 0.95);
      }
      if (i < 3 && bs !== 3) P.blend(col(dx), by + arch - 1, BRl, 0.4); // the hairs at the head stand up
    }
    if (bs === 6) for (let i = 0; i <= 10; i++) P.blend(col(-6 + i), by + 1, mixHex(R[4], BR, 0.3), 0.32); // shaved: a faint shadow
    if (bs === 5 && k > 0) { const sx = col(1); for (let t = -2; t <= 3; t++) P.set(sx + (t > 0 ? 1 : 0), by + t, mixHex(R[6], 0xd89090, 0.35)); }
    // crow's feet / age
    if (age > 0.4) for (let t = 0; t < 3; t++) { P.blend(col(6 + t), ey - 1 - t, R[3], 0.45); P.blend(col(6 + t), ey + 1 + (t >> 1), R[3], 0.4); }
  }
  if (bs === 4) for (let x = px(-6); x <= px(6); x++) { P.blend(x, py(0.118), BR, 0.8); P.blend(x, py(0.118) + 1, BR, 0.5); }
  // ---- nose: bridge highlight, shaded sides, the wings round the nostrils, the tip catching light
  const nn = noseOf(A), NK = noseK(nn);
  const crook = NK.crook > 0 ? 2 : 0;
  const nx = px(0);
  const nTip = py(0.058), nBase = py(0.0505);
  for (let y = py(0.104); y <= nTip; y++) {
    const c = y > py(0.08) ? crook : 0;
    P.blend(nx + c, y, R[7], 0.32); P.blend(nx + 1 + c, y, R[6], 0.25);
    P.blend(nx - 3 + c, y, R[3], 0.28); P.blend(nx + 3 + c, y, R[3], 0.22);
  }
  if (NK.bump) { P.blend(nx, py(0.082), R[8] ?? R[7], 0.7); P.blend(nx + 1, py(0.082), R[7], 0.5); }
  const nwp = NK.w > 1.15 ? 4 : NK.w < 0.95 ? 2 : 3;
  for (const s of [-1, 1]) {
    // nostril: a dark slit under the wing, the crease round the wing
    P.set(nx + s * nwp + crook, nBase, R[1]); P.set(nx + s * (nwp - 1) + crook, nBase, R[2]);
    P.blend(nx + s * (nwp + 1) + crook, nBase - 1, R[3], 0.6); P.blend(nx + s * (nwp + 2) + crook, nBase - 2, R[3], 0.4); P.blend(nx + s * (nwp + 1) + crook, nBase - 3, R[4], 0.35);
  }
  P.blend(nx + crook, nTip, R[7], 0.6); P.blend(nx + crook + 1, nTip, R[7], 0.4); P.blend(nx + crook, nTip - 1, R[8] ?? R[7], 0.5);
  P.blend(nx + crook, nBase, R[4], 0.5);
  for (let x = nx - nwp - 1; x <= nx + nwp + 1; x++) P.blend(x + crook, nBase + 1, R[3], 0.38); // under-nose shadow
  if (nn === 4) { P.blend(nx + 1, py(0.079), mixHex(R[3], 0x8a5a6a, 0.4), 0.55); P.blend(nx + 2, py(0.078), mixHex(R[3], 0x8a5a6a, 0.4), 0.4); } // the old break
  // ---- mouth: philtrum, cupid's bow, the dark line between the lips, a lit lower lip, the shadow under it
  const mo = mouthOf(A);
  const my = py(0.0375);
  const lipC = mixHex(R[4], fem > 0.5 ? 0xb04848 : 0x9a4a40, 0.3 + fem * 0.14);
  const lipD = mixHex(lipC, 0x2a1210, 0.4), lipL = mixHex(lipC, 0xffe0d0, 0.28), lipM = mixHex(lipC, R[4], 0.4);
  const mw = mo === 3 ? 7 : mo === 2 ? 5 : 6;
  const thin = mo === 2;
  for (let y = nBase + 2; y < my - 2; y++) { P.blend(nx - 1, y, R[4], 0.3); P.blend(nx + 1, y, R[4], 0.3); P.blend(nx, y, R[6], 0.15); } // philtrum
  for (let x = nx - mw; x <= nx + mw; x++) {
    const d = Math.abs(x - nx), edge = d === mw;
    const down = mo === 4 && d >= mw - 1 ? 1 : 0, up = mo === 1 && x - nx >= mw - 1 ? -1 : 0;
    P.set(x, my + down + up, edge ? mixHex(lipD, R[3], 0.4) : d < 2 ? mixHex(lipD, lipC, 0.25) : lipD); // the line between the lips
    if (edge) continue;
    // upper lip: two rows, the top edge dipping at the centre (cupid's bow)
    P.blend(x, my - 1 + down + up, lipC, thin ? 0.35 : 0.85);
    if (!thin && d < mw - 1 && d !== 0) P.blend(x, my - 2 + up, d === 2 || d === 1 ? lipM : lipC, 0.55);
    if (d < mw - 2 && !thin) P.blend(x, my - 3, R[6], d === 2 ? 0.35 : 0.15); // the lit rim over the bow
    // lower lip: fuller, lit in the middle
    if (d < mw - (fem > 0.5 || mo === 3 ? 0 : 1)) P.blend(x, my + 1 + down, d < 2 ? lipL : lipC, thin ? 0.35 : 0.8);
    if (d < mw - 2 && !thin) P.blend(x, my + 2, d < 3 ? lipC : lipM, mo === 3 ? 0.85 : 0.55);
    if (mo === 3 && d < mw - 3) P.blend(x, my + 3, lipM, 0.5);
  }
  for (const s of [-1, 1]) P.blend(nx + s * (mw + 1), my - (mo === 1 && s > 0 ? 1 : 0) + (mo === 4 ? 1 : 0), R[3], 0.55); // mouth corners
  if (mo === 1) { P.set(nx + mw + 1, my - 2, lipD); P.blend(nx + mw + 2, my - 2, R[3], 0.5); }           // smirk: one corner up
  if (mo === 5) { P.set(nx, my, 0x1a0e0c); P.set(nx - 1, my, 0x1a0e0c); P.set(nx - 2, my, 0xe8e2d8); P.set(nx + 1, my, 0xe8e2d8); P.set(nx + 2, my, 0xd8d2c8); }  // a gap in the front teeth
  if (mo === 7) { P.set(nx + 2, my, 0xe8b830); P.set(nx + 3, my, 0xb88820); P.set(nx, my, 0xe8e2d8); P.set(nx + 1, my, 0xd8d2c8); } // gold tooth
  if (mo === 6) { const sc = mixHex(R[6], 0xd89090, 0.4); for (let t = -3; t <= 3; t++) P.set(nx - 2 + (t > 1 ? 1 : 0), my + t, t === 0 ? lipD : sc); }
  if (A.face === 1 && A.mouth == null) { P.set(nx - mw - 1, my - 1, lipD); P.set(nx + mw + 1, my - 1, lipD); } // smile corners (old face variant)
  for (let x = nx - 3; x <= nx + 3; x++) P.blend(x, my + 4, R[3], Math.abs(x - nx) < 2 ? 0.4 : 0.22);       // under the lower lip
  for (let x = nx - 4; x <= nx + 4; x++) P.blend(x, py(0.006), R[6], 0.32);                                 // chin highlight
  if (fem < 0.5) P.blend(nx, py(0.0), R[3], 0.4);                                                           // cleft
  // nasolabial folds and the jaw line
  for (let t = 0; t < 7; t++) for (const s of [-1, 1]) P.blend(nx + s * (nwp + 3 + Math.floor(t * 0.6)), nBase + t, R[3], (0.16 + age * 0.35) * (t < 5 ? 1 : 0.5));
  for (let x = 0; x < S.w; x++) { const a = Math.abs(S.deg(x)); if (a > 30 && a < 95) P.blend(x, py(-0.004 + (a - 30) * 0.0003), R[3], 0.3); }
  // gaunt faces: hollows under the cheekbones
  if (shapeOf(A).hollow) for (const k of [-1, 1]) P.ditherBlob(S.X(k * 42), S.Y(0.047), 3 * k2, 3 * k2, R[3], 0.5);
  // ---- ears: piercings, gauges, a notch, cauliflower lumps (painted where the ear geometry samples the page)
  const ears = A.ears ?? 0;
  if (ears) for (const k of [-1, 1]) {
    const ex = px(k * 95), ey = py(0.06);
    if (ears === 5) { P.set(ex, ey + 1, 0xe8c860); P.set(ex + k, ey + 2, 0xc8a040); P.set(ex, ey + 2, 0xa88830); if (k > 0) { P.set(ex, py(0.1), 0xd8d8d8); P.set(ex + 1, py(0.1), 0xa8a8a8); } }
    if (ears === 6) { P.set(ex, ey, 0x141210); P.set(ex + 1, ey, 0x141210); P.set(ex, ey + 1, 0x2a2420); P.set(ex + 1, ey + 1, 0x2a2420); P.blend(ex - 1, ey, 0x141210, 0.6); }
    if (ears === 4 && k > 0) for (let i = 0; i < 4; i++) P.set(ex + (i >> 1), py(0.1) + (i & 1), mixHex(R[2], 0x6a2a2a, 0.3));
    if (ears === 3) for (let i = 0; i < 8; i++) P.blend(ex + ((i & 1) ? 1 : -1), py(0.095) + i * 2, R[(i & 1) ? 6 : 3], 0.6);
  }
  // ---- details: freckles, age lines, scars, face tattoos
  const freckles = A.freckles ?? (face === 3 ? 0.5 : 0);
  if (freckles > 0) {
    const fc = mixHex(R[3], 0x8a4a2a, 0.4), fc2 = mixHex(R[4], 0x9a5a3a, 0.35);
    for (let i = 0; i < 60 * freckles; i++) {
      const d = (rng.next() - 0.5) * 84, yy = 0.056 + rng.next() * 0.042 - Math.abs(d) * 0.0002;
      if (Math.abs(d) < 6 && yy < 0.07) continue;
      if (Math.abs(Math.abs(d) - 17.5) < 7 && yy > 0.088) continue; // not in the eyes
      P.set(px(d), py(yy), rng.next() < 0.6 ? fc : fc2);
    }
  }
  if (age > 0.3) {
    for (const yy of [0.133, 0.142, 0.151]) for (let x = px(-18); x <= px(18); x++) if (ph(x, yy * 1000, 3) < age * 0.85) { P.blend(x, py(yy), R[3], 0.38); P.blend(x, py(yy) - 1, R[6], 0.18); }
    for (let t = 0; t < 4; t++) for (const s of [-1, 1]) P.blend(nx + s * (2 + (t >> 1)), py(0.112) + t, R[3], 0.3 * age); // frown lines
  }
  const scars = A.scars ?? 0;
  for (let i = 0; i < scars; i++) {
    const sx = (ph(i, K.seed, 4) - 0.5) * 60, sy = 0.06 + ph(i, K.seed, 5) * 0.08, len = (3 + Math.floor(ph(i, K.seed, 6) * 4)) * k2;
    const sc = mixHex(R[6], 0xd89090, 0.35);
    for (let t = 0; t < len; t++) { const x = px(sx) + t, y = py(sy) - Math.round(t * 0.6); P.set(x, y, sc); if (t % 2 === 0) P.blend(x, y + 1, R[3], 0.4); if (t % 3 === 1) P.blend(x, y - 1, mixHex(R[7], 0xffd0d0, 0.3), 0.6); }
  }
  bodyMarks(S, K, 'HEAD');
  // ---- glasses painted on (frames + lenses), temples are geometry
  if (sh.eyes) {
    const fc = sh.eyes === 'goggles' ? mixHex(o.eyes?.color ?? 0x4aa0d8, 0x101010, 0.25) : (o.eyes?.color ?? 0x202020);
    const fcL = mixHex(fc, 0xffffff, 0.35);
    const lens = sh.eyes === 'sunglasses' ? 0x14181e : sh.eyes === 'goggles' ? mixHex(o.eyes?.color ?? 0x4aa0d8, 0xd0e8f0, 0.45) : -1;
    for (const k of [-1, 1]) {
      const cx = px(k * 17.5);
      const x0 = cx - 6, x1 = cx + 6, y0 = eyeY - 4, y1 = eyeY + 3;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        const corner = (x === x0 || x === x1) && (y === y0 || y === y1);
        if (edge) { if (!corner || sh.eyes === 'goggles') P.set(x, y, y === y0 ? fcL : fc); }
        else if (lens >= 0) P.blend(x, y, lens, sh.eyes === 'sunglasses' ? 0.92 : 0.55);
        else P.blend(x, y, 0xd8ecf4, 0.14);
      }
      P.set(x0 + 2, y0 + 1, 0xf0f8ff); P.set(x0 + 3, y0 + 1, 0xd8e8f0); P.set(x0 + 2, y0 + 2, 0xd8e8f0);
    }
    for (let x = px(-9); x <= px(9); x++) { P.set(x, eyeY - 2, fc); P.set(x, eyeY - 3, fcL); } // bridge
  }
  // ---- expression baked into the condition: pain / fear / unconscious
  if (cond.expr === 'pain' || cond.expr === 'fear') {
    const open = cond.expr === 'fear' ? 3 : 2;
    for (let x = nx - 4; x <= nx + 4; x++) for (let y = my; y < my + open; y++) P.set(x, y, cond.expr === 'fear' ? 0x2a1210 : y === my ? 0xe8e2d8 : 0x3a1a14);
    P.set(nx - 5, my, lipD); P.set(nx + 5, my, lipD);
    if (cond.expr === 'pain') for (const k of [-1, 1]) for (let t = 0; t < 3; t++) P.blend(px(k * (8 + t * 2)), py(0.116) + t, R[2], 0.6);
    else for (const k of [-1, 1]) for (let t = 0; t < 3; t++) P.blend(px(k * (14 + t * 3)), py(0.124) - (t === 1 ? 1 : 0), R[3], 0.45);
  }
}

// ------------------------------------------------------------------ hair
function paintHair(S: Surf, A: Appearance, wet: number) {
  const c = wet > 1 ? scaleHex(A.hair, 0.78) : A.hair;
  const HR = makeRamp(c, 7, { hueShift: 0.035, spread: 0.6 });
  const st = String(A.hairStyle);
  const strand = (x: number) => ph(x, 0, 41) * 1.2 + (x % 3 === 0 ? -0.6 : 0);
  S.fill(HR, (x, y) => {
    const yy = S.yAt(y), a = Math.abs(S.deg(x));
    let v = 3.1 + strand(x) * (st === 'buzz' ? 0.2 : 0.6) + (S.fbm(x, y * 0.3, 3, 2, 7) - 0.5) * 1.2;
    // sheen band on the crown
    v += 0.9 * Math.exp(-((yy - 0.165) ** 2) / 0.0012) * (st === 'curly' ? 0.4 : 1);
    // roots / underside darker
    v -= 1.4 * Math.max(0, (0.02 - yy) / 0.12) * (a > 100 ? 0.6 : 1);
    if (st === 'curly') v += (ph(x >> 1, y >> 1, 9) - 0.5) * 1.8;
    if (st === 'buzz') v += (ph(x, y, 9) - 0.5) * 0.8;
    return v;
  });
  // parting
  if (st === 'long' || st === 'bob' || st === 'short') { const px = Math.round(S.X(st === 'short' ? 28 : -14)); for (let y = Math.round(S.Y(0.21)); y < S.Y(0.16); y++) S.pc.blend(px, y, HR[0], 0.55); }
  // ends: lighter, ragged tips at the bottom of long hair
  if (st === 'ponytail') { const ty = Math.round(S.Y(-0.05)); for (let x = 0; x < S.w; x++) { S.pc.set(x, ty, 0x2a2a30); S.pc.set(x, ty + 1, 0x3a3a44); } }
  // cornrows: tight braided rows; mohawk crest strands
  if (st === 'cornrows') for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { if (x % 3 === 0) S.pc.set(x, y, HR[0]); else if ((x + (y >> 1)) % 3 === 1) S.pc.set(x, y, HR[5]); }
  if (st === 'mohawk' || st === 'spiky') for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if ((x + y * 2) % 5 === 0) S.pc.blend(x, y, HR[6], 0.4);
}

// ------------------------------------------------------------------ condition overlays
const BLOOD = [0x3a0606, 0x5a0a0a, 0x7a1210, 0x96201a];
function bloodSplat(S: Surf, cx: number, cy: number, r: number, seed: number, drip = true) {
  const rr = Math.ceil(r + 2);
  for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
    const d = Math.hypot(x - cx, (y - cy) * 1.15) / r;
    const n = ph(x, y, seed) * 0.55 + ph(x >> 1, y >> 1, seed + 1) * 0.45;
    if (d < 0.55 + n * 0.6) {
      const k = d < 0.4 ? 1 : d < 0.75 ? 2 : 3;
      S.pc.blend(x, y, BLOOD[k], d < 0.6 ? 0.92 : 0.7);
    }
  }
  if (drip) {
    const rng = new Rng(seed);
    for (let i = 0; i < Math.max(1, Math.round(r * 0.7)); i++) {
      const x = Math.round(cx + (rng.next() - 0.5) * r * 1.4), L = Math.round(r * (0.8 + rng.next() * 1.6));
      for (let t = 0; t < L; t++) S.pc.blend(x, Math.round(cy + r * 0.4) + t, BLOOD[t < L * 0.6 ? 1 : 2], 0.85 * (1 - t / (L + 2)));
    }
  }
}
function bandageWrap(S: Surf, y0: number, y1: number, soak: number, seed: number) {
  const W = [0xd8d4c8, 0xeae6da, 0xc4beb0, 0xf4f0e6];
  for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = 0; x < S.w; x++) {
    const diag = (x + y * 2) % 6 === 0;
    const c = y === Math.round(y0) || y === Math.round(y1) ? W[2] : diag ? W[2] : (ph(x, y, seed) < 0.15 ? W[3] : W[(x >> 1) % 2]);
    S.pc.set(x, y, c);
  }
  if (soak > 0) {
    const cx = S.w * (0.4 + ph(seed, 1, 1) * 0.2), cy = (y0 + y1) / 2;
    const r = 1.2 + soak * (y1 - y0) * 0.45;
    for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.3) / r;
      if (d < 0.7 + ph(x, y, seed) * 0.4) S.pc.blend(x, y, d < 0.5 ? 0x7a1612 : 0xa8463a, 0.8);
    }
  }
}
function grime(S: Surf, amt: number, lowBias: number, seed: number) {
  const D = [0x4a3e2e, 0x5a4a36, 0x3a3226];
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const low = lowBias > 0 ? (y / S.h) * lowBias : 0;
    const n = S.fbm(x, y, 4, 2, seed) * 0.7 + ph(x, y, seed + 3) * 0.3;
    if (n + low * 0.3 > 1.02 - amt * 0.35) S.pc.blend(x, y, D[(x + y) % 3], 0.35 + amt * 0.12);
  }
}
function wetten(S: Surf, amt: number) {
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const i = (y * S.w + x) * 4, d = S.pc.data;
    const f = 1 - 0.12 * amt;
    d[i] *= f; d[i + 1] *= f; d[i + 2] *= f * 1.02;
    if (amt > 1 && ph(x, y, 77) < 0.03 * amt) S.pc.blend(x, y, 0xe8f0f4, 0.35);
  }
}
function corrupt(S: Surf, amt: number, seed: number) {
  const C = [0xff00ff, 0x00ffff, 0x101010, 0x40ff80];
  const n = Math.round(amt * 4);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(ph(i, seed, 1) * S.w), y = Math.floor(ph(i, seed, 2) * S.h), w = 2 + Math.floor(ph(i, seed, 3) * 4), h = 1 + Math.floor(ph(i, seed, 4) * 2);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (ph(xx, yy, seed) < 0.8) S.pc.set(xx, yy, C[(i + xx) % 4]);
  }
}

// part -> where its wounds land: region, side, y (reference), angle
const PART_SPOT: Record<string, { reg: 'TORSO' | 'ARM' | 'LEG' | 'HEAD' | 'NECK' | 'HAND' | 'FOOT'; side?: 'L' | 'R'; y: [number, number] }> = {
  head: { reg: 'HEAD', y: [0.06, 0.18] }, neck: { reg: 'NECK', y: [1.47, 1.55] },
  torso_u: { reg: 'TORSO', y: [1.18, 1.4] }, torso_l: { reg: 'TORSO', y: [0.98, 1.16] }, groin: { reg: 'TORSO', y: [0.84, 0.95] },
  uarm_l: { reg: 'ARM', side: 'L', y: [-0.24, -0.04] }, uarm_r: { reg: 'ARM', side: 'R', y: [-0.24, -0.04] },
  farm_l: { reg: 'ARM', side: 'L', y: [-0.48, -0.32] }, farm_r: { reg: 'ARM', side: 'R', y: [-0.48, -0.32] },
  hand_l: { reg: 'HAND', side: 'L', y: [0, 1] }, hand_r: { reg: 'HAND', side: 'R', y: [0, 1] },
  thigh_l: { reg: 'LEG', side: 'L', y: [-0.36, -0.08] }, thigh_r: { reg: 'LEG', side: 'R', y: [-0.36, -0.08] },
  shin_l: { reg: 'LEG', side: 'L', y: [-0.76, -0.5] }, shin_r: { reg: 'LEG', side: 'R', y: [-0.76, -0.5] },
  foot_l: { reg: 'FOOT', side: 'L', y: [0, 1] }, foot_r: { reg: 'FOOT', side: 'R', y: [0, 1] },
};

function applyCondition(S: Surf, regKind: string, side: string, cond: RigCondition, seed: number) {
  for (const [part, spot] of Object.entries(PART_SPOT)) {
    if (spot.reg !== regKind || (spot.side && spot.side !== side)) continue;
    const blood = cond.blood?.[part] ?? 0, band = cond.bandage?.[part] ?? 0;
    const ps = seed + hashStr(part);
    const isUV = spot.reg === 'HAND' || spot.reg === 'FOOT';
    const kk = REG_K[S.key] ?? 1;
    const yr = isUV ? [S.h * 0.15, S.h * 0.85] : [S.Y(spot.y[1]), S.Y(spot.y[0])];
    if (blood > 0) {
      const n = blood >= 3 ? 3 : blood >= 2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const cx = (ph(i, ps, 1) * 0.5 + 0.25 + (spot.reg === 'TORSO' ? (ph(i, ps, 9) < 0.5 ? 0 : 0.5) : 0)) * S.w;
        const cy = yr[0] + ph(i, ps, 2) * (yr[1] - yr[0]);
        bloodSplat(S, cx % S.w, cy, (1.5 + blood * 1.1 + ph(i, ps, 3) * 1.5) * kk, ps + i * 13, spot.reg !== 'HEAD' || i === 0);
      }
    }
    if (band > 0) {
      if (spot.reg === 'HEAD') {
        bandageWrap(S, S.Y(0.15), S.Y(0.125), band >= 2 ? 0.7 : 0, ps);
      } else {
        const mid = (yr[0] + yr[1]) / 2, half = Math.max(2, (yr[1] - yr[0]) * 0.32);
        bandageWrap(S, mid - half, mid + half, band >= 2 ? 0.8 : band >= 1.5 ? 0.4 : 0, ps);
      }
    }
  }
}

// ------------------------------------------------------------------ page bake
export interface BakeInput { app: Appearance; outfit: Outfit; shape: OutfitShape; cond: RigCondition; seed: number }
/** per-rig cache of the painted page before condition overlays (blood, bandages, wet...) */
export interface BakeCache { key: string; base: { key: RegKey; range: number[]; side: number; seed: number; data: Uint8ClampedArray }[] }

/** Paint the whole page into `out` (RGBA, PAGE x PAGE). With a cache, condition-only changes skip the base paint. */
export function bakePage(inp: BakeInput, out: Uint8Array, cache?: BakeCache) {
  const { outfit: o, cond } = inp;
  const pale = cond.pale ?? 0, wet = cond.wet ?? 0, dirt = cond.dirt ?? 0;
  const { cond: _c, ...looks } = o;
  void _c;
  const baseKey = JSON.stringify([inp.app, looks, inp.shape, pale, wet > 1 ? 1 : 0, cond.expr || '', inp.seed]);
  let surfs: Surf[];
  if (cache && cache.key === baseKey) {
    surfs = cache.base.map((b) => { const S = new Surf(b.key, b.range, b.side, b.seed); S.pc.data.set(b.data); return S; });
  } else {
    surfs = paintBase(inp);
    if (cache) { cache.key = baseKey; cache.base = surfs.map((S) => ({ key: S.key, range: S.range, side: S.side, seed: S.seed, data: new Uint8ClampedArray(S.pc.data) })); }
  }
  paintCondition(surfs, o, cond, inp.seed, dirt, wet);
  blitPage(surfs, out);
}

function paintBase(inp: BakeInput): Surf[] {
  const { app, cond } = inp;
  const { o, sh } = suitLooks(app, inp.outfit, inp.shape);
  const fem = app.bodyShape ?? 0.3;
  const pale = cond.pale ?? 0, wet = cond.wet ?? 0, dirt = cond.dirt ?? 0;
  const K: Skin = { R: skinRamp(app.skin, pale), base: app.skin, app, fem, seed: inp.seed, pale, dirt, wet };
  const surfs: Surf[] = [];
  const mk = (key: RegKey, range: number[], side = 0) => { const S = new Surf(key, range, side, inp.seed + hashStr(key)); surfs.push(S); return S; };
  const P = (lp: LookPart | undefined, outer = false): Paint | null => lp ? {
    lp, color: lp.color, outer, sh, seed: inp.seed + hashStr(lp.tex + (lp.item || '')),
    R: makeRamp(scaleHex(lp.color, 0.86), 8, { hueShift: 0.035, spread: 0.58 }),
    F: makeRamp(scaleHex(lp.color, 0.86), 15, { hueShift: 0.035, spread: 0.58 }),
  } : null;
  const top = P(o.torso), outerP = P(o.torsoOuter, true), legs = P(o.legs), feet = P(o.feet), hands = P(o.hands), headP = P(o.head), faceP = P(o.face), eyesP = P(o.eyes), backP = P(o.back);
  const G = (p: Paint | null) => (p ? garment(p.lp.tex) : null);
  const call = (p: Paint | null, fn: string, S: Surf) => {
    if (!p) return;
    const g = G(p);
    const f = g && (g as any)[fn];
    if (f) f(S, p); else if (!g) paintFallback(S, p, fn);
  };

  // ---- head + neck
  const head = mk('HEAD', VMAP.HEAD);
  paintHead(head, K, o, sh, cond);
  const neck = mk('NECK', VMAP.NECK);
  neck.light = (x, y) => -0.5 * Math.max(0, (neck.yAt(y) - 1.55) / 0.05) * (Math.cos((neck.deg(x) * Math.PI) / 180) > 0 ? 1 : 0.3) - 0.2;
  paintSkinBody(neck, K);
  bodyMarks(neck, K, 'NECK');
  // ---- hair
  const hair = mk('HAIR', VMAP.HAIR);
  paintHair(hair, app, wet);
  // ---- torso
  const torso = mk('TORSO', VMAP.TORSO);
  torsoLight(torso, fem);
  paintSkinBody(torso, K);
  torsoSkinDetail(torso, K);
  bodyMarks(torso, K, 'TORSO');
  call(legs, 'pelvis', torso);
  call(top, 'torso', torso);
  call(outerP, 'torso', torso);
  const suit = isJumpsuit(o) ? app.suit : undefined;
  if (suit) suitOverlay(torso, 'TORSO', suit, inp.seed, K);
  // ---- arms
  for (const side of ['L', 'R'] as const) {
    const S = mk(('ARM_' + side) as RegKey, VMAP.ARM, side === 'L' ? 1 : -1);
    limbLight(S, 'arm');
    paintSkinBody(S, K);
    armSkinDetail(S, K);
    bodyMarks(S, K, ('ARM_' + side) as RegKey);
    call(top, 'arm', S);
    call(outerP, 'arm', S);
    if (suit) suitOverlay(S, 'ARM', suit, inp.seed, K, sh.sleeve);
    call(hands, 'arm', S);
    const H = mk(('HAND_' + side) as RegKey, [0, 1], side === 'L' ? 1 : -1);
    H.light = (x, y) => (y > H.h * 0.5 ? -0.1 : -0.3) - 0.4 * Math.max(0, -Math.sin(((H.deg(x)) * Math.PI) / 180));
    paintSkinBody(H, K);
    handSkinDetail(H, K);
    handMarks(H, K, side);
    call(hands, 'hand', H);
  }
  // ---- legs & feet
  for (const side of ['L', 'R'] as const) {
    const S = mk(('LEG_' + side) as RegKey, VMAP.LEG, side === 'L' ? 1 : -1);
    limbLight(S, 'leg');
    paintSkinBody(S, K);
    call(feet, 'leg', S);
    call(legs, 'leg', S);
    if (suit) suitOverlay(S, 'LEG', suit, inp.seed, K);
    const F = mk(('FOOT_' + side) as RegKey, [0, 1], side === 'L' ? 1 : -1);
    if (feet) call(feet, 'foot', F);
    else { F.light = (x, y) => (Math.abs(F.deg(x)) > 100 ? -0.8 : 0) - (y > F.h * 0.7 ? 0 : 0); paintSkinBody(F, K); footSkinDetail(F, K); }
  }
  // ---- skirt / tails / hood, hats, masks, collars, gear, pack, lids
  const skirt = mk('SKIRT', VMAP.SKIRT);
  if (sh.tails && outerP) call(outerP, 'skirt', skirt); else if (legs) call(legs, 'skirt', skirt);
  const collar = mk('COLLAR', [0, 1]);
  const collarP = sh.collarFrom === 'outer' ? outerP : top;
  if (collarP) call(collarP, sh.collar === 'hood' ? 'hood' : 'collar', collar);
  const hat = mk('HAT', [0, 1]);
  if (headP) call(headP, 'hat', hat);
  const mask = mk('MASK', [0, 1]);
  if (faceP) call(faceP, 'mask', mask);
  const gear = mk('GEAR', [0, 1]);
  paintGear(gear, eyesP?.color ?? 0x202020);
  const pack = mk('PACK', [0, 1]);
  if (backP) call(backP, 'pack', pack);
  const watch = mk('WATCH', [0, 1]);
  paintWatch(watch);
  const lids = mk('LIDS', [0, 1]);
  lids.fill(K.R, (x, y) => SKIN_MID - 0.2 - (y / lids.h) * 0.6);
  for (let x = 0; x < lids.w; x++) { lids.pc.set(x, lids.h - 1, mixHex(0x1c1410, app.hair, 0.2)); lids.pc.blend(x, 1, K.R[3], 0.5); }

  return surfs;
}

function paintCondition(surfs: Surf[], o: Outfit, cond: RigCondition, seed: number, dirt: number, wet: number) {
  for (const S of surfs) {
    const kind = S.key.startsWith('ARM') ? 'ARM' : S.key.startsWith('LEG') ? 'LEG' : S.key.startsWith('HAND') ? 'HAND' : S.key.startsWith('FOOT') ? 'FOOT' : S.key;
    const side = S.key.endsWith('_L') ? 'L' : S.key.endsWith('_R') ? 'R' : '';
    if (kind !== 'HEAD' && kind !== 'NECK') applyCondition(S, kind, side, cond, seed);
    else applyCondition(S, kind, '', cond, seed);
    // garment blood (Item.bloody)
    const gb = kind === 'TORSO' || kind === 'ARM' ? Math.max(o.torso?.blood ?? 0, o.torsoOuter?.blood ?? 0) : kind === 'LEG' ? (o.legs?.blood ?? 0) : kind === 'FOOT' ? (o.feet?.blood ?? 0) : kind === 'HAND' ? (o.hands?.blood ?? 0) : 0;
    if (gb > 0.05) {
      const n = Math.round(1 + gb * (kind === 'TORSO' ? 6 : 3));
      for (let i = 0; i < n; i++) bloodSplat(S, ph(i, S.seed, 31) * S.w, ph(i, S.seed, 32) * S.h, 1 + ph(i, S.seed, 33) * 2.5 * gb + gb, S.seed + i, ph(i, S.seed, 34) < 0.5);
    }
    if (dirt > 0 && kind !== 'HAIR' && kind !== 'LIDS' && kind !== 'GEAR') grime(S, dirt, kind === 'LEG' || kind === 'FOOT' ? 1.5 : 0.4, S.seed + 5);
    if (wet > 0 && kind !== 'GEAR') wetten(S, wet);
    if ((cond.corrupt ?? 0) > 0) corrupt(S, cond.corrupt, S.seed + Math.floor((cond.corrupt ?? 0) * 7));
  }

}

/** blit with wrap padding (u wraps, v clamps) so mip levels never bleed */
function blitPage(surfs: Surf[], out: Uint8Array) {
  out.fill(0);
  for (const S of surfs) {
    const r = REG[S.key];
    for (let y = -PAD; y < r.h + PAD; y++) {
      const sy = Math.min(r.h - 1, Math.max(0, y));
      for (let x = -PAD; x < r.w + PAD; x++) {
        const sx = ((x % r.w) + r.w) % r.w;
        const si = (sy * r.w + sx) * 4, di = ((r.y + y) * PAGE + r.x + x) * 4;
        out[di] = S.pc.data[si]; out[di + 1] = S.pc.data[si + 1]; out[di + 2] = S.pc.data[si + 2]; out[di + 3] = 255;
      }
    }
  }
}

// ------------------------------------------------------------------ anatomy details on bare skin
function torsoSkinDetail(S: Surf, K: Skin) {
  const R = K.R;
  // clavicles
  for (const k of [-1, 1]) for (let d = 6; d < 40; d += 3) { const x = Math.round(S.X(k * d)); const y = Math.round(S.Y(1.448 - d * 0.0002)); S.pc.blend(x, y, R[6], 0.35); S.pc.blend(x, y + 1, R[3], 0.3); }
  // sternum notch + navel
  S.pc.blend(Math.round(S.X(0)), Math.round(S.Y(1.44)), R[3], 0.5);
  S.pc.set(Math.round(S.X(0) - 0.5), Math.round(S.Y(1.035)), R[2]);
  // spine line and shoulder blades
  for (let y = Math.round(S.Y(1.42)); y < S.Y(0.98); y += 2) S.pc.blend(0, y, R[3], 0.35);
  for (const k of [-1, 1]) S.pc.ditherBlob(S.X(k * 150), S.Y(1.29), 2.5, 3, R[6], 0.35);
  // nipples / chest for masculine, bust shading for feminine
  if (K.fem < 0.5) for (const k of [-1, 1]) S.pc.blend(Math.round(S.X(k * 25)), Math.round(S.Y(1.26)), mixHex(R[3], 0xa05048, 0.4), 0.6);
}
function armSkinDetail(S: Surf, K: Skin) {
  const R = K.R;
  // elbow wrinkles on the back, knuckly wrist bone
  for (let i = -1; i <= 1; i++) S.pc.blend(Math.round(S.X(178 + i * 6)), Math.round(S.Y(-0.29)), R[3], 0.45);
  S.pc.blend(Math.round(S.X(120)), Math.round(S.Y(-0.52)), R[6], 0.5);
}
function handSkinDetail(S: Surf, K: Skin) {
  const R = K.R;
  // knuckles (outer side = back of the hand), fingernails at finger tips
  for (let x = 0; x < S.w; x++) {
    const a = S.deg(x);
    if (a > 30 && a < 150) { S.pc.blend(x, Math.round(S.h * 0.46), R[3], 0.4); S.pc.blend(x, Math.round(S.h * 0.25), R[3], 0.3); }
    if (a > 70 && a < 130) for (let y = S.h - 3; y < S.h; y++) S.pc.set(x, y, mixHex(R[7], 0xf0d8d0, 0.4));
    if (a < -40 && a > -150) S.pc.blend(x, Math.round(S.h * 0.66 + ((x * 3) % 4)), R[3], 0.3); // palm creases
  }
}
function footSkinDetail(S: Surf, K: Skin) {
  for (let x = 0; x < S.w; x++) if (Math.abs(S.deg(x)) < 60) for (let y = 0; y < 3; y++) if (x % 3 !== 0) S.pc.blend(x, Math.round(S.h * 0.3) - y, K.R[6], 0.4);
}

function paintWatch(S: Surf) {
  // bottom rows: rubber band; top rows: the monitor face (bezel, amber LCD digits, a button)
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    if (y >= S.h * 0.5) S.pc.set(x, y, (x + y) % 3 === 0 ? 0x3e3832 : 0x2e2a26);
    else {
      const edge = x === 0 || x === S.w - 1 || y === 0 || y === Math.floor(S.h * 0.5) - 1;
      S.pc.set(x, y, edge ? 0x5a5650 : 0x1a1612);
    }
  }
  for (const x of [3, 4, 6, 7]) { S.pc.set(x, 1, 0xf0a030); S.pc.set(x, 2, 0xc87818); }
  S.pc.set(5, 2, 0xf0a030); S.pc.set(S.w - 2, 1, 0xc8302a);
}

function paintGear(S: Surf, frame: number) {
  // u 0..0.5: glasses temples / goggles strap ; u 0.5..1: splint wood
  const FR = makeRamp(frame, 4, { spread: 0.5 });
  const WD = makeRamp(0xa07a4a, 4, { spread: 0.5 });
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    if (x < S.w / 2) S.pc.set(x, y, FR[(y + (x & 1)) % 3]);
    else S.pc.set(x, y, WD[1 + ((x + y * 3) % 5 === 0 ? 0 : 1) + (y % 4 === 0 ? 1 : 0)]);
  }
}

// ------------------------------------------------------------------ tattoos, body scars, knuckles, nails (humanLooks)
const INK: Record<string, [number, number]> = { '#': [0x252c3a, 0.86], o: [0x3a4458, 0.55], r: [0x9a2a26, 0.8], g: [0x2e5a3a, 0.8], y: [0xc8a030, 0.75] };
function inkSprite(S: Surf, art: string[], cx: number, cy: number, k = 1) {
  const h = art.length, w = art.reduce((m, r) => Math.max(m, r.length), 0);
  const x0 = Math.round(cx - (w * k) / 2), y0 = Math.round(cy - (h * k) / 2);
  for (let j = 0; j < h; j++) for (let i = 0; i < art[j].length; i++) {
    const c = INK[art[j][i]];
    if (!c) continue;
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) S.pc.blend(x0 + i * k + a, y0 + j * k + b, c[0], c[1] * (0.9 + ph(i, j, 77) * 0.1));
  }
}
function scarMark(S: Surf, K: Skin, kind: string, cx: number, cy: number, seed: number, k = 1) {
  const R = K.R;
  const X = Math.round(cx), Y = Math.round(cy);
  // drawn on a k-times denser surface: every mark pixel becomes a k x k block round the centre
  const Q = {
    set: (x: number, y: number, c: number) => { for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) S.pc.set(X + (x - X) * k + i, Y + (y - Y) * k + j, c); },
    blend: (x: number, y: number, c: number, t: number) => { for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) S.pc.blend(X + (x - X) * k + i, Y + (y - Y) * k + j, c, t); },
  };
  const pale = mixHex(R[7], 0xe8b0b0, 0.3), pink = mixHex(R[5], 0xd07878, 0.35), dark = mixHex(R[2], 0x6a3a3a, 0.2);
  switch (kind) {
    case 'slash': for (let t = 0; t < 6; t++) { Q.set(X - 3 + t, Y + 2 - Math.round(t * 0.7), pale); Q.blend(X - 3 + t, Y + 3 - Math.round(t * 0.7), dark, 0.35); } break;
    case 'stitches': for (let t = 0; t < 7; t++) { Q.set(X - 3 + t, Y, pink); if (t % 2 === 0) { Q.set(X - 3 + t, Y - 1, pale); Q.set(X - 3 + t, Y + 1, pale); } } break;
    case 'burn':
      for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) { const d = Math.hypot(i / 3, j / 2); if (d < 1 && ph(i, j, seed) < 1.1 - d) Q.blend(X + i, Y + j, ph(i + 3, j, seed) < 0.5 ? pink : pale, 0.85); }
      break;
    case 'bullet': Q.set(X, Y, dark); for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) Q.blend(X + i, Y + j, pink, 0.8); Q.blend(X + 1, Y + 1, pale, 0.6); break;
    case 'surgery': for (let t = -5; t <= 5; t++) { Q.set(X, Y + t, pink); if (t % 2 === 0) { Q.blend(X - 1, Y + t, pale, 0.8); Q.blend(X + 1, Y + t, pale, 0.8); } } break;
    case 'bite': for (let i = 0; i < 5; i++) { Q.set(X - 2 + i, Y - 1 - (i === 0 || i === 4 ? 0 : 1), pink); Q.set(X - 2 + i, Y + 2 + (i === 0 || i === 4 ? 0 : 1), pink); } break;
    case 'lashes': for (let l = 0; l < 3; l++) for (let t = 0; t < 8; t++) Q.blend(X - 4 + t, Y - 3 + l * 3 + Math.round(t * 0.4), l === 1 ? pink : pale, 0.8); break;
  }
}
/** tattoos and scars that sit on this surface (painted on the skin, so clothing covers them) */
function bodyMarks(S: Surf, K: Skin, reg: RegKey) {
  const A = K.app;
  const at = (sp: { deg: number; y: number }) => [S.X(sp.deg), S.Y(sp.y)] as const;
  for (const [spot, design] of Object.entries(A.tattoos || {})) {
    const sp = TATTOO_SPOTS[spot];
    if (!sp || sp.reg !== reg || !design) continue;
    const [cx, cy] = at(sp);
    const word = TEXT_TATTOOS[design];
    if (word) { text(S, word, cx, cy - 2, mixHex(0x252c3a, K.R[4], 0.15)); continue; }
    const art = TATTOOS[design]?.art;
    if (art?.length) inkSprite(S, art, cx, cy, (sp.big ? 2 : 1) * (REG_K[reg] ?? 1));
  }
  for (const [spot, kind] of Object.entries(A.bodyScars || {})) {
    const sp = SCAR_SPOTS[spot];
    if (!sp || sp.reg !== reg || !kind) continue;
    const [cx, cy] = at(sp);
    scarMark(S, K, kind, cx, cy, hashStr(spot + kind), REG_K[reg] ?? 1);
  }
}
/** knuckle tattoos (one mark per finger) and nails */
function handMarks(S: Surf, K: Skin, side: 'L' | 'R') {
  const A = K.app;
  const kn = KNUCKLES[A.knuckles || 'none'];
  const word = kn ? (side === 'L' ? kn.l : kn.r) : '';
  if (word) {
    const y = Math.round(S.h * 0.56);
    for (let i = 0; i < 4; i++) {
      const ch = word[i] || ' ';
      const x = Math.round(S.X(side === 'L' ? 50 + i * 20 : 110 - i * 20));
      const code = ch.charCodeAt(0);
      const c = mixHex(0x252c3a, K.R[4], 0.12);
      if (ch === '.') S.pc.set(x, y, c);
      else if (ch === '+') { S.pc.set(x, y, c); S.pc.set(x, y - 1, c); S.pc.set(x, y + 1, c); S.pc.blend(x - 1, y, c, 0.7); S.pc.blend(x + 1, y, c, 0.7); }
      else { S.pc.set(x, y - 1, c); S.pc.set(x, y + 1, c); if (code & 1) S.pc.set(x, y, c); if (code & 2) S.pc.blend(x + 1, y - 1, c, 0.8); if (code & 4) S.pc.blend(x - 1, y + 1, c, 0.8); }
    }
  }
  const nl = NAILS[A.nails || 'clean'];
  if (nl && nl.color) for (let x = 0; x < S.w; x++) {
    const a = S.deg(x);
    if (!(a > 70 && a < 130)) continue;
    for (let y = S.h - 3; y < S.h; y++) {
      if (A.nails === 'bitten') { if (y === S.h - 1) S.pc.blend(x, y, nl.color, 0.6); else if (y === S.h - 3) S.pc.blend(x, y, nl.color, 0.3); continue; }
      if (A.nails === 'chipped' && ph(x, y, 91) < 0.4) continue;
      S.pc.set(x, y, A.nails === 'grimy' && y < S.h - 1 ? mixHex(K.R[6], 0xf0d8d0, 0.4) : nl.color);
    }
  }
}

// ------------------------------------------------------------------ jumpsuit details (humanLooks SuitLooks)
const STAIN_C: Record<string, number[]> = { sweat: [0x8a6a1a, 0x7a5a14], coffee: [0x5a3a1c, 0x4a2c14], oil: [0x1c1c1e, 0x2a2826], blood: [0x4a1410, 0x5e1a14], bleach: [0xf0ead0, 0xe8e2c4] };
function suitOverlay(S: Surf, kind: 'TORSO' | 'ARM' | 'LEG', suit: NonNullable<Appearance['suit']>, seed: number, K: Skin, sleeve?: string) {
  const wear = Math.max(0, Math.min(3, suit.wear ?? 0));
  const cov = (x: number, y: number) => {
    const yy = S.yAt(y);
    if (kind === 'ARM') return sleeve === 'short' ? yy > -0.15 : yy > -0.515;
    if (kind === 'LEG') return yy > -0.83;
    return yy < 1.47;
  };
  // rolled sleeves: a fat roll of cloth at the cuff
  if (kind === 'ARM' && sleeve === 'short') {
    const r = Math.round(S.Y(-0.15));
    const R = makeRamp(0xd9a826, 6, { spread: 0.5 });
    for (let x = 0; x < S.w; x++) { S.pc.set(x, r - 2, R[4]); S.pc.set(x, r - 1, R[3]); S.pc.set(x, r, R[1]); S.pc.blend(x, r + 1, K.R[2], 0.35); }
  }
  // wear: faded fabric, then frays and holes showing what is under
  if (wear > 0) {
    const n = [0, 3, 8, 16][wear] * (kind === 'TORSO' ? 2 : 1);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(ph(i, seed + S.seed, 51) * S.w), y = Math.floor(ph(i, seed + S.seed, 52) * S.h);
      if (!cov(x, y)) continue;
      const big = wear >= 2 && ph(i, seed, 53) < 0.4;
      const w = big ? 3 : 2, h = big ? 2 : 1;
      for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) S.pc.set(x + k, y + j, (j + k) % 2 ? K.R[4] : K.R[3]);
      for (let k = -1; k <= w; k++) { S.pc.blend(x + k, y - 1, 0xf0e0a0, 0.45); S.pc.blend(x + k, y + h, 0x6a5418, 0.55); }
    }
    if (wear >= 2) for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (cov(x, y) && S.fbm(x, y, 3, 2, 57) > 0.7) S.pc.blend(x, y, 0xf0e2a8, 0.18 * wear);
  }
  // stains
  const sc = STAIN_C[suit.stains || ''];
  if (sc) {
    const blobs: [number, number, number][] = suit.stains === 'sweat'
      ? (kind === 'TORSO' ? [[90, 1.34, 3], [-90, 1.34, 3], [0, 1.45, 2], [180, 1.3, 4]] : [])
      : suit.stains === 'oil' ? (kind === 'LEG' ? [[10, -0.3, 3], [-40, -0.55, 2]] : kind === 'TORSO' ? [[40, 0.95, 3]] : [[0, -0.45, 2]])
      : suit.stains === 'bleach' ? Array.from({ length: kind === 'TORSO' ? 7 : 3 }, (_, i) => [ph(i, seed, 61) * 360 - 180, kind === 'TORSO' ? 0.9 + ph(i, seed, 62) * 0.5 : kind === 'ARM' ? -0.05 - ph(i, seed, 62) * 0.4 : -0.1 - ph(i, seed, 62) * 0.7, 1] as [number, number, number])
      : kind === 'TORSO' ? [[20, 1.2, 3], [-8, 1.08, 2], [35, 1.0, 2]] : kind === 'LEG' ? [[0, -0.2, 2]] : [];
    for (const [deg, yy, r] of blobs) {
      const cx = S.X(deg), cy = S.Y(yy);
      for (let j = -r - 1; j <= r + 1; j++) for (let i = -r - 1; i <= r + 1; i++) {
        const d = Math.hypot(i, j * 1.2) / r + (ph(i, j, seed + deg) - 0.5) * 0.5;
        if (d > 1) continue;
        const x = Math.round(cx + i), y = Math.round(cy + j);
        if (!cov(x, y)) continue;
        const ring = suit.stains === 'sweat' && d > 0.65;
        S.pc.blend(x, y, sc[ring ? 1 : 0], suit.stains === 'sweat' ? (ring ? 0.45 : 0.18) : 0.55 + (1 - d) * 0.3);
      }
      if (suit.stains === 'coffee' || suit.stains === 'blood') for (let t = 0; t < r + 3; t++) S.pc.blend(Math.round(cx + 1), Math.round(cy + r + t), sc[0], 0.5 * (1 - t / (r + 4)));
    }
  }
  // the number patch (torso, left breast)
  if (kind === 'TORSO' && suit.patch && suit.patch !== 'stitched') {
    const x0 = Math.round(S.X(-30) - 7.5), y0 = Math.round(S.Y(1.36));
    const R = makeRamp(0xd9a826, 6, { spread: 0.5 });
    const num = suitNumber(seed);
    if (suit.patch === 'stencil' || suit.patch === 'torn') {
      // no tape (or half of it gone): yellow cloth with glue residue
      for (let j = 0; j < 7; j++) for (let i = suit.patch === 'torn' ? 7 : 0; i < 15; i++) S.pc.set(x0 + i, y0 + j, (i + j) % 5 === 0 ? mixHex(R[3], 0xb8b090, 0.4) : R[3]);
      if (suit.patch === 'torn') for (let j = 0; j < 7; j++) { S.pc.set(x0 + 7, y0 + j, j % 2 ? 0xd8d2c0 : 0xb8b2a2); }
    }
    if (suit.patch === 'stencil') {
      text(S, num.slice(2), S.X(-30), y0 + 1, 0x16140f);
      for (let i = 0; i < 10; i++) S.pc.blend(x0 + Math.floor(ph(i, seed, 71) * 15), y0 + Math.floor(ph(i, seed, 72) * 7), 0x16140f, 0.35); // overspray
    }
    if (suit.patch === 'marker') {
      for (let j = 1; j < 6; j++) for (let i = 1; i < 14; i++) S.pc.set(x0 + i, y0 + j, 0xe8e4d6);
      text(S, num.slice(2), S.X(-30) + 0.5, y0 + 1, 0x1c2a6a);
      for (let i = 0; i < 4; i++) S.pc.blend(x0 + 2 + i * 3, y0 + 6, 0x1c2a6a, 0.5);
    }
  }
  if (kind === 'TORSO' && (suit.patch ?? 'stitched') === 'stitched') {
    const x0 = Math.round(S.X(-30) - 7.5), y0 = Math.round(S.Y(1.36));
    for (let i = 0; i < 15; i += 2) { S.pc.set(x0 + i, y0 - 1, 0x2a2620); S.pc.set(x0 + i, y0 + 7, 0x2a2620); }
  }
}

// ------------------------------------------------------------------ texture object
export function makePageTexture(size = PAGE): { tex: THREE.DataTexture; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  // no mipmaps: the low-poly people's atlas packs small faces with empty gaps (mips would average them to black), and pixel art stays crisp
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return { tex, data };
}

/**
 * Scale2x (EPX) a page into one twice the size: hard pixel edges stay hard,
 * stair-stepped diagonals (seams, letters, lids, pocket corners) are cut
 * finer. Used for the high-resolution pages of close-up rigs (menus, the
 * operating table); UVs are page-relative so the geometry is unchanged.
 */
export function scale2x(src: Uint8Array, size: number, dst: Uint8Array) {
  const s32 = new Uint32Array(src.buffer, src.byteOffset, size * size);
  const d32 = new Uint32Array(dst.buffer, dst.byteOffset, size * size * 4);
  const W = size * 2;
  for (let y = 0; y < size; y++) {
    const ym = y > 0 ? y - 1 : y, yp = y < size - 1 ? y + 1 : y;
    for (let x = 0; x < size; x++) {
      const xm = x > 0 ? x - 1 : x, xp = x < size - 1 ? x + 1 : x;
      const P = s32[y * size + x], A = s32[ym * size + x], B = s32[y * size + xp], C = s32[y * size + xm], D = s32[yp * size + x];
      const o = y * 2 * W + x * 2;
      d32[o] = C === A && C !== D && A !== B ? A : P;
      d32[o + 1] = A === B && A !== C && B !== D ? B : P;
      d32[o + W] = D === C && D !== B && C !== A ? C : P;
      d32[o + W + 1] = B === D && B !== A && D !== C ? D : P;
    }
  }
}

// Painted textures for the ship hub, drawn in code at high resolution (about 256 texels per metre on walls and
// floors): wall panels with seams, screws, a bumper rail and a scuffed kick plate; tread plate, rubber stud tiles,
// carpet, galley checker and composite deck floors; hull plating; stencils, signs, posters and fabric. Every mark
// is placed on purpose (wear where hands and boots go, grime that runs down from fixings and gathers at the floor,
// chips along edges that get knocked); noise only breaks up a fill by a whisker. Light falls from above.
import * as THREE from 'three';
import { Rand, hashStr } from '../../core/rand';
import { pixWall, pixFloor, pixCap, pixHazard, pixSign, pixPoster, PTHEMES } from './pix';

export type Ctx2 = CanvasRenderingContext2D;
const cache = new Map<string, THREE.Texture>();

export function canvas(w: number, h: number): [HTMLCanvasElement, Ctx2] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: false })!];
}
export function toTex(c: HTMLCanvasElement, o: { repeat?: boolean; srgb?: boolean; aniso?: number; mips?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat !== false) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = o.aniso ?? 8;
  t.generateMipmaps = o.mips !== false;
  t.minFilter = o.mips === false ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}
export function cached(key: string, make: () => THREE.Texture) { let t = cache.get(key); if (!t) { t = make(); cache.set(key, t); } return t; }

// ------------------------------------------------------------------ colour helpers
export const rgb = (h: number) => `rgb(${(h >> 16) & 255},${(h >> 8) & 255},${h & 255})`;
export const rgba = (h: number, a: number) => `rgba(${(h >> 16) & 255},${(h >> 8) & 255},${h & 255},${a})`;
export function shade(h: number, k: number) {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((h >> 16) & 255) << 16) | (f((h >> 8) & 255) << 8) | f(h & 255);
}
export function mix(a: number, b: number, t: number) {
  const f = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (f(16) << 16) | (f(8) << 8) | f(0);
}

/** a whisker of grain: a few thousand tiny marks of +-k brightness, clustered in horizontal smears */
export function grain(g: Ctx2, w: number, h: number, seed: number, k = 0.05, n = 0, sx = 3, sy = 1) {
  const r = new Rand(seed); n = n || Math.round(w * h / 90);
  for (let i = 0; i < n; i++) {
    const x = r.next() * w, y = r.next() * h, l = r.next() < 0.5;
    g.fillStyle = l ? `rgba(255,255,255,${k * r.next()})` : `rgba(0,0,0,${k * 1.4 * r.next()})`;
    g.fillRect(x, y, 1 + r.next() * sx, 1 + r.next() * sy);
  }
}
/** a screw head: a dark ring, a lit face, a slot at a random angle */
export function screw(g: Ctx2, x: number, y: number, r: number, base: number, ang = 0.4) {
  g.fillStyle = rgba(0x000000, 0.45); g.beginPath(); g.arc(x + r * 0.25, y + r * 0.35, r * 1.15, 0, 7); g.fill();
  g.fillStyle = rgb(shade(base, 0.55)); g.beginPath(); g.arc(x, y, r * 1.08, 0, 7); g.fill();
  const gr = g.createLinearGradient(x - r, y - r, x + r, y + r); gr.addColorStop(0, rgb(shade(base, 1.45))); gr.addColorStop(1, rgb(shade(base, 0.85)));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 0.85, 0, 7); g.fill();
  g.strokeStyle = rgb(shade(base, 0.4)); g.lineWidth = Math.max(1, r * 0.32);
  g.beginPath(); g.moveTo(x - Math.cos(ang) * r * 0.7, y - Math.sin(ang) * r * 0.7); g.lineTo(x + Math.cos(ang) * r * 0.7, y + Math.sin(ang) * r * 0.7); g.stroke();
}
/** a recessed seam: a dark groove with a lit lip below / right */
export function seamH(g: Ctx2, x0: number, x1: number, y: number, base: number, w = 2) {
  g.fillStyle = rgb(shade(base, 0.42)); g.fillRect(x0, y, x1 - x0, w);
  g.fillStyle = rgb(shade(base, 1.25)); g.fillRect(x0, y + w, x1 - x0, 1);
  g.fillStyle = rgb(shade(base, 0.8)); g.fillRect(x0, y - 1, x1 - x0, 1);
}
export function seamV(g: Ctx2, x: number, y0: number, y1: number, base: number, w = 2) {
  g.fillStyle = rgb(shade(base, 0.42)); g.fillRect(x, y0, w, y1 - y0);
  g.fillStyle = rgb(shade(base, 1.2)); g.fillRect(x + w, y0, 1, y1 - y0);
  g.fillStyle = rgb(shade(base, 0.82)); g.fillRect(x - 1, y0, 1, y1 - y0);
}
/** paint chips along an edge (bare metal showing): small irregular flecks, denser toward corners */
export function chips(g: Ctx2, x0: number, y0: number, x1: number, y1: number, col: number, r: Rand, n: number, spread = 3) {
  g.fillStyle = rgb(col);
  for (let i = 0; i < n; i++) {
    const t = Math.pow(r.next(), 1.6) * (r.next() < 0.5 ? 1 : -1) * 0.5 + 0.5;
    const x = x0 + (x1 - x0) * t + (r.next() - 0.5) * spread * 2, y = y0 + (y1 - y0) * t + (r.next() - 0.5) * spread * 2;
    const w = 1 + r.next() * 3, h = 1 + r.next() * 2;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (r.next() < 0.4) g.fillRect(Math.round(x + w), Math.round(y + 1), 1, 1);
  }
}
/** grime running down from a point: a few faint vertical streaks */
export function streak(g: Ctx2, x: number, y: number, len: number, r: Rand, a = 0.12, col = 0x000000) {
  for (let i = 0; i < 3; i++) {
    const xx = x + (r.next() - 0.5) * 6, l = len * (0.4 + r.next() * 0.6);
    const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, rgba(col, a * (0.5 + r.next() * 0.5))); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(Math.round(xx), y, 1 + Math.round(r.next() * 2), l);
  }
}
export function stencilText(g: Ctx2, s: string, x: number, y: number, size: number, col: number, o: { font?: string; align?: CanvasTextAlign; a?: number; wear?: number; seed?: number; spacing?: number } = {}) {
  g.save();
  g.font = `${size}px ${o.font ?? "'Superwide', 'Jersey', monospace"}`; g.textAlign = o.align ?? 'left'; g.textBaseline = 'alphabetic';
  if (o.spacing !== undefined) (g as any).letterSpacing = `${o.spacing}px`;
  g.fillStyle = rgba(col, o.a ?? 1); g.fillText(s, x, y);
  if (o.wear) {
    // worn paint: knock small holes out of the letters
    const r = new Rand(o.seed ?? hashStr(s)), m = g.measureText(s), w = m.width;
    const x0 = (o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < w * size * o.wear * 0.02; i++) { g.fillStyle = `rgba(0,0,0,${0.5 + r.next() * 0.5})`; g.fillRect(x0 + r.next() * w, y - size * r.next() * 0.8, 1 + r.next() * 2, 1 + r.next() * 1.5); }
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}
export function hazardStripes(g: Ctx2, x: number, y: number, w: number, h: number, period: number, a = 0xd8a63a, b = 0x1c1b18, angle = 1) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = rgb(a); g.fillRect(x, y, w, h);
  g.fillStyle = rgb(b);
  for (let k = -h - period; k < w + h + period; k += period) {
    g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + period / 2, y); g.lineTo(x + k + period / 2 - h * angle, y + h); g.lineTo(x + k - h * angle, y + h); g.closePath(); g.fill();
  }
  g.restore();
}

// ------------------------------------------------------------------ room themes
export type FloorKind = 'tread' | 'rubber' | 'carpet' | 'tiles' | 'deck' | 'grate' | 'lino';
export interface Theme {
  key: string;
  /** wall paint (upper panels), lower panels, the rail, the top band */
  wall: number; low: number; rail: number; band: number;
  /** an accent stripe colour on the rail, or -1 */
  stripe: number;
  floor: FloorKind; floorA: number; floorB: number;
  /** the trim metal (door frames, skirting, cut-wall caps) */
  trim: number;
}
export const THEMES: Record<string, Theme> = {
  bridge: { key: 'bridge', wall: 0x3c4650, low: 0x2a3138, rail: 0x56606a, band: 0x1b2026, stripe: 0x5fa8b8, floor: 'deck', floorA: 0x2b3036, floorB: 0x3a4148, trim: 0x4a525a },
  lab: { key: 'lab', wall: 0xc9cdc6, low: 0x8f9a94, rail: 0x6f7c78, band: 0x4c5654, stripe: 0x4fa07a, floor: 'rubber', floorA: 0x55605c, floorB: 0x6a7671, trim: 0x8c9690 },
  medbay: { key: 'medbay', wall: 0xd6d9d4, low: 0x9fb2b0, rail: 0x7a8c8c, band: 0x55625f, stripe: 0xb8433a, floor: 'lino', floorA: 0x9aa7a3, floorB: 0xb3bfbb, trim: 0x99a5a2 },
  core: { key: 'core', wall: 0x262d2c, low: 0x1b201f, rail: 0x39433f, band: 0x101413, stripe: 0x5fc47e, floor: 'grate', floorA: 0x2a302e, floorB: 0x3b4340, trim: 0x3b4441 },
  quarters: { key: 'quarters', wall: 0xb4a58a, low: 0x7d6a52, rail: 0x5e4b39, band: 0x463a2e, stripe: -1, floor: 'carpet', floorA: 0x5a3f33, floorB: 0x6e5040, trim: 0x6d604f },
  mess: { key: 'mess', wall: 0xc2b79c, low: 0x8a5a3a, rail: 0x6c4a33, band: 0x4b3a2c, stripe: 0xd07a3a, floor: 'tiles', floorA: 0x8e8a7c, floorB: 0x3e4442, trim: 0x7d7461 },
  workshop: { key: 'workshop', wall: 0x6a6c4e, low: 0x4c4e38, rail: 0x3a3c2c, band: 0x2a2b21, stripe: 0xd2a23c, floor: 'tread', floorA: 0x5a5e5f, floorB: 0x7c8080, trim: 0x55584a },
  cargo: { key: 'cargo', wall: 0x5d6550, low: 0x434a3b, rail: 0x343a2e, band: 0x24281f, stripe: 0xd2a23c, floor: 'tread', floorA: 0x4c5152, floorB: 0x6a6e6e, trim: 0x4e5446 },
  engineering: { key: 'engineering', wall: 0x4a4d50, low: 0x34373a, rail: 0x2a2c2e, band: 0x1a1b1d, stripe: 0xd8792e, floor: 'grate', floorA: 0x3a3e40, floorB: 0x55595b, trim: 0x46494c },
  corridor: { key: 'corridor', wall: 0x8c9289, low: 0x5c6460, rail: 0x48504c, band: 0x2c3230, stripe: 0x5fa8b8, floor: 'deck', floorA: 0x3c4244, floorB: 0x4e5557, trim: 0x5e6563 },
};

// ------------------------------------------------------------------ walls
/** wall texture: 2 m wide (tiles along u), WALL_H tall mapped once along v. 512 x 1024. */
export function wallTex(th: Theme, variant = 0) { return pixWall(PTHEMES[th.key] ?? PTHEMES.corridor, variant % 3); }
export function wallTexSmooth(th: Theme, variant = 0) {
  return cached(`wall|${th.key}|${variant}`, () => {
    const W = 512, H = 1024, [c, g] = canvas(W, H), r = new Rand(hashStr(th.key) + variant * 77);
    const pxm = H / 3.4, Y = (m: number) => Math.round(H - m * pxm);
    // upper panels
    const up = g.createLinearGradient(0, 0, 0, H); up.addColorStop(0, rgb(shade(th.wall, 1.08))); up.addColorStop(0.7, rgb(th.wall)); up.addColorStop(1, rgb(shade(th.wall, 0.9)));
    g.fillStyle = up; g.fillRect(0, 0, W, H);
    grain(g, W, H, 11 + variant, 0.035);
    // the top band (a recess with a cable tray lip)
    g.fillStyle = rgb(th.band); g.fillRect(0, 0, W, Y(2.78));
    g.fillStyle = rgb(shade(th.band, 1.5)); g.fillRect(0, Y(2.78) - 3, W, 3);
    g.fillStyle = rgba(0, 0.35); g.fillRect(0, Y(2.78), W, 6);
    for (let x = 18; x < W; x += 64) { g.fillStyle = rgb(shade(th.band, 1.8)); g.fillRect(x, Y(3.2), 30, 4); g.fillStyle = rgb(shade(th.band, 0.6)); g.fillRect(x, Y(3.2) + 4, 30, 2); }
    // panels: two per tile, from the rail to the band
    const top = Y(2.78) + 6, bot = Y(1.06);
    for (let i = 0; i < 2; i++) {
      const x0 = i * 256, x1 = x0 + 256;
      const tone = shade(th.wall, 0.97 + r.next() * 0.06);
      g.fillStyle = rgb(tone); g.fillRect(x0 + 3, top + 2, 250, bot - top - 4);
      seamV(g, x0, top, bot, th.wall, 3);
      // a horizontal seam at about 1.9 m
      const ys = Y(1.92 + (r.next() - 0.5) * 0.1);
      seamH(g, x0 + 3, x1, ys, th.wall, 2);
      // screws at the panel corners and the seam
      for (const yy of [top + 12, ys - 10, ys + 14, bot - 12]) for (const xx of [x0 + 14, x1 - 12]) screw(g, xx, yy, 4, tone, r.next() * 3);
      // drip grime from the screws, chips along the seams
      for (const xx of [x0 + 14, x1 - 12]) if (r.next() < 0.6) streak(g, xx, ys + 18, 40 + r.next() * 60, r, 0.08);
      chips(g, x0 + 4, ys - 2, x1 - 4, ys + 3, shade(th.wall, 1.3), r, 14);
      chips(g, x0 + 2, top, x0 + 4, bot, shade(th.wall, 0.7), r, 8);
      // a detail on one panel in two: a label plate, a vent, or an access hatch
      const k = (i + variant) % 3;
      if (k === 0) {
        const lx = x0 + 40, ly = ys - 62;
        g.fillStyle = rgb(shade(th.wall, 0.75)); g.fillRect(lx - 1, ly - 1, 98, 34);
        g.fillStyle = rgb(shade(th.wall, 1.18)); g.fillRect(lx, ly, 96, 32);
        stencilText(g, `${th.key.slice(0, 2).toUpperCase()}-${10 + ((variant * 7 + i * 3) % 80)}`, lx + 8, ly + 22, 15, shade(th.wall, 0.4), { font: "'Jersey', monospace" });
        screw(g, lx + 89, ly + 7, 2.5, tone); screw(g, lx + 89, ly + 25, 2.5, tone);
      } else if (k === 1) {
        const vx = x0 + 70, vy = ys + 40, vw = 116, vh = 70;
        g.fillStyle = rgb(shade(th.wall, 0.55)); g.fillRect(vx - 2, vy - 2, vw + 4, vh + 4);
        g.fillStyle = rgb(shade(th.wall, 0.85)); g.fillRect(vx, vy, vw, vh);
        for (let yy = vy + 6; yy < vy + vh - 4; yy += 8) { g.fillStyle = rgb(shade(th.wall, 0.3)); g.fillRect(vx + 6, yy, vw - 12, 4); g.fillStyle = rgb(shade(th.wall, 1.25)); g.fillRect(vx + 6, yy + 4, vw - 12, 1); }
        for (const [a, b] of [[vx + 5, vy + 5], [vx + vw - 5, vy + 5], [vx + 5, vy + vh - 5], [vx + vw - 5, vy + vh - 5]]) screw(g, a, b, 3, tone);
        streak(g, vx + vw / 2, vy + vh + 2, 80, r, 0.1);
      } else {
        const hx = x0 + 150, hy = Y(1.7), hw = 80, hh = 90;
        g.strokeStyle = rgb(shade(th.wall, 0.5)); g.lineWidth = 2; g.strokeRect(hx, hy, hw, hh);
        g.strokeStyle = rgb(shade(th.wall, 1.2)); g.lineWidth = 1; g.strokeRect(hx + 2, hy + 2, hw - 2, hh - 2);
        g.fillStyle = rgb(shade(th.wall, 0.6)); g.fillRect(hx + hw - 16, hy + hh / 2 - 8, 8, 16);
        stencilText(g, 'ACCESS', hx + hw / 2, hy + 18, 11, shade(th.wall, 0.45), { font: "'Jersey', monospace", align: 'center' });
      }
    }
    // the bumper rail at about 1 m (with the room's accent stripe)
    const ry0 = Y(1.06), ry1 = Y(0.9);
    g.fillStyle = rgb(th.rail); g.fillRect(0, ry0, W, ry1 - ry0);
    g.fillStyle = rgb(shade(th.rail, 1.6)); g.fillRect(0, ry0, W, 3);
    g.fillStyle = rgb(shade(th.rail, 0.5)); g.fillRect(0, ry1 - 3, W, 3);
    if (th.stripe >= 0) { g.fillStyle = rgb(th.stripe); g.fillRect(0, ry0 + 12, W, 10); g.fillStyle = rgb(shade(th.stripe, 1.3)); g.fillRect(0, ry0 + 12, W, 2); }
    for (let x = 30; x < W; x += 128) screw(g, x, (ry0 + ry1) / 2 + 10, 3.5, th.rail);
    chips(g, 0, ry0, W, ry0 + 4, shade(th.rail, 1.9), r, 30, 2);
    g.fillStyle = rgba(0, 0.3); g.fillRect(0, ry1, W, 5);
    // lower panels: darker, scuffed by boots and carts
    g.fillStyle = rgb(th.low); g.fillRect(0, ry1 + 5, W, Y(0.14) - ry1 - 5);
    grain(g, W, Y(0.14) - ry1, 31 + variant, 0.05);
    for (let i = 0; i < 2; i++) seamV(g, i * 256 + 128, ry1 + 5, Y(0.14), th.low, 2);
    for (let i = 0; i < 26; i++) { const sx = r.next() * W, sy = Y(0.16 + r.next() * 0.45), sw = 10 + r.next() * 50; g.fillStyle = rgba(r.next() < 0.6 ? 0x000000 : 0xffffff, 0.05 + r.next() * 0.08); g.fillRect(sx, sy, sw, 1 + r.next() * 2); }
    // the kick plate
    const ky = Y(0.14);
    g.fillStyle = rgb(shade(th.trim, 0.7)); g.fillRect(0, ky, W, H - ky);
    g.fillStyle = rgb(shade(th.trim, 1.3)); g.fillRect(0, ky, W, 2);
    for (let x = 0; x < W; x += 12) { g.fillStyle = rgba(0, 0.2); g.fillRect(x, ky + 8, 6, H - ky - 14); }
    const gg = g.createLinearGradient(0, ky - 60, 0, H); gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(10,8,6,0.45)');
    g.fillStyle = gg; g.fillRect(0, ky - 60, W, H - ky + 60);
    return toTex(c);
  });
}

/** a cut-wall cap: the wall's section, dark steel with a lit lip (top face of cut walls) */
export function capTex() { return pixCap(); }
export function capTexSmooth() {
  return cached('cap', () => {
    const [c, g] = canvas(256, 32);
    g.fillStyle = rgb(0x24272a); g.fillRect(0, 0, 256, 32);
    g.fillStyle = rgb(0x8a8f8c); g.fillRect(0, 0, 256, 3); g.fillRect(0, 29, 256, 3);
    for (let x = 0; x < 256; x += 16) { g.fillStyle = rgb(0x3a3e40); g.fillRect(x + 2, 8, 10, 16); }
    return toTex(c);
  });
}

// ------------------------------------------------------------------ floors (2 m x 2 m per tile, 512 x 512)
export function floorTex(th: Theme) { return pixFloor(PTHEMES[th.key] ?? PTHEMES.corridor); }
export function floorTexSmooth(th: Theme) {
  return cached(`floor|${th.key}`, () => {
    const W = 512, [c, g] = canvas(W, W), r = new Rand(hashStr(th.key + 'f'));
    const A = th.floorA, B = th.floorB;
    g.fillStyle = rgb(A); g.fillRect(0, 0, W, W);
    if (th.floor === 'tread') {
      // diamond tread plate: raised lozenges in a herringbone, 1 m plates with bolted seams
      for (let y = 0; y < W; y += 16) for (let x = 0; x < W; x += 16) {
        const flip = ((x + y) / 16) % 2 === 0;
        g.save(); g.translate(x + 8, y + 8); g.rotate(flip ? 0.785 : -0.785);
        g.fillStyle = rgb(shade(B, 1.15)); g.fillRect(-6, -1.5, 12, 3);
        g.fillStyle = rgb(shade(A, 0.6)); g.fillRect(-6, 1.5, 12, 1.5);
        g.restore();
      }
      grain(g, W, W, 5, 0.06);
      // polished paths where boots go
      const p = g.createLinearGradient(0, 0, W, 0); p.addColorStop(0.3, 'rgba(255,255,255,0)'); p.addColorStop(0.5, 'rgba(255,255,255,0.06)'); p.addColorStop(0.7, 'rgba(255,255,255,0)');
      g.fillStyle = p; g.fillRect(0, 0, W, W);
      for (const s of [0, 256]) { seamH(g, 0, W, s, A, 3); seamV(g, s, 0, W, A, 3); }
      for (const s of [0, 256]) for (let k = 24; k < W; k += 58) { screw(g, s + 10, k, 4, B); screw(g, k, s + 10, 4, B); }
      // oil stains
      for (let i = 0; i < 3; i++) { const x = r.next() * W, y = r.next() * W, rr = 14 + r.next() * 30; const gr = g.createRadialGradient(x, y, 2, x, y, rr); gr.addColorStop(0, 'rgba(12,10,8,0.28)'); gr.addColorStop(1, 'rgba(12,10,8,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    } else if (th.floor === 'rubber' || th.floor === 'lino') {
      // 0.5 m tiles: rubber with round studs (lab) or sheet lino with a fleck (medbay)
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
        const col = shade(((tx + ty) % 2 ? A : mix(A, B, 0.35)), 0.97 + r.next() * 0.06);
        g.fillStyle = rgb(col); g.fillRect(tx * 128, ty * 128, 128, 128);
        if (th.floor === 'rubber') for (let y = 12; y < 128; y += 21) for (let x = 12; x < 128; x += 21) {
          g.fillStyle = rgb(shade(col, 0.7)); g.beginPath(); g.arc(tx * 128 + x + 1, ty * 128 + y + 1.5, 5, 0, 7); g.fill();
          g.fillStyle = rgb(shade(col, 1.12)); g.beginPath(); g.arc(tx * 128 + x, ty * 128 + y, 4.5, 0, 7); g.fill();
        } else for (let i = 0; i < 120; i++) { g.fillStyle = rgba(r.next() < 0.5 ? shade(col, 0.7) : shade(col, 1.25), 0.6); g.fillRect(tx * 128 + r.next() * 128, ty * 128 + r.next() * 128, 2, 1); }
        g.fillStyle = rgb(shade(A, 0.55)); g.fillRect(tx * 128, ty * 128, 128, 2); g.fillRect(tx * 128, ty * 128, 2, 128);
      }
      grain(g, W, W, 9, 0.03);
    } else if (th.floor === 'carpet') {
      // woven carpet tiles with a quiet geometric stripe and wear down the middle
      for (let y = 0; y < W; y += 2) { g.fillStyle = rgba(y % 4 ? shade(A, 1.08) : shade(A, 0.92), 0.8); g.fillRect(0, y, W, 1); }
      for (let x = 0; x < W; x += 3) { g.fillStyle = rgba(0, 0.05 + (x % 9 === 0 ? 0.05 : 0)); g.fillRect(x, 0, 1, W); }
      for (const yy of [40, 472]) { g.fillStyle = rgb(B); g.fillRect(0, yy, W, 12); g.fillStyle = rgb(0xb08a54); g.fillRect(0, yy + 4, W, 3); }
      for (let x = 0; x < W; x += 64) { g.fillStyle = rgb(shade(B, 1.1)); g.beginPath(); g.moveTo(x + 32, 60); g.lineTo(x + 44, 72); g.lineTo(x + 32, 84); g.lineTo(x + 20, 72); g.fill(); }
      grain(g, W, W, 13, 0.06, 0, 2, 2);
      for (const s of [0, 256]) { g.fillStyle = rgba(0, 0.25); g.fillRect(0, s, W, 1); g.fillRect(s, 0, 1, W); }
    } else if (th.floor === 'tiles') {
      // galley checker, 0.25 m, glazed, with dark grout and a chip here and there
      for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
        const col = shade((tx + ty) % 2 ? A : B, 0.96 + r.next() * 0.08);
        g.fillStyle = rgb(col); g.fillRect(tx * 64 + 1, ty * 64 + 1, 62, 62);
        g.fillStyle = rgba(0xffffff, 0.1); g.fillRect(tx * 64 + 4, ty * 64 + 4, 30, 3);
        if (r.next() < 0.08) { g.fillStyle = rgb(shade(col, 0.7)); g.fillRect(tx * 64 + 50, ty * 64 + 2, 8, 5); }
      }
      g.fillStyle = rgb(0x2a2824);
      for (let k = 0; k <= W; k += 64) { g.fillRect(k - 1, 0, 2, W); g.fillRect(0, k - 1, W, 2); }
      grain(g, W, W, 17, 0.03);
    } else if (th.floor === 'deck') {
      // composite deck panels (1 m) with anti-slip grit squares and a recessed seam
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
        const col = shade(A, 0.96 + r.next() * 0.08);
        g.fillStyle = rgb(col); g.fillRect(tx * 256, ty * 256, 256, 256);
        for (const [ax, ay] of [[24, 24], [140, 24], [24, 140], [140, 140]]) {
          g.fillStyle = rgb(shade(B, 0.95)); g.fillRect(tx * 256 + ax, ty * 256 + ay, 92, 92);
          const rr = new Rand(tx * 9 + ty * 3 + ax + ay);
          for (let i = 0; i < 260; i++) { g.fillStyle = rgba(rr.next() < 0.5 ? 0x000000 : 0xffffff, 0.12); g.fillRect(tx * 256 + ax + rr.next() * 92, ty * 256 + ay + rr.next() * 92, 2, 2); }
        }
        seamH(g, tx * 256, tx * 256 + 256, ty * 256, A, 3); seamV(g, tx * 256, ty * 256, ty * 256 + 256, A, 3);
        for (const [sx, sy] of [[8, 8], [248, 8], [8, 248], [248, 248]]) screw(g, tx * 256 + sx, ty * 256 + sy, 3.5, B);
      }
      grain(g, W, W, 21, 0.03);
    } else {
      // grating: a bar grid over a dark sump, cables and pipes faintly below
      g.fillStyle = rgb(shade(A, 0.35)); g.fillRect(0, 0, W, W);
      for (let i = 0; i < 4; i++) { g.fillStyle = rgb([0x5a3a28, 0x2e4250, 0x4a4a2c, 0x3a2a40][i]); g.fillRect(0, 60 + i * 110, W, 18); }
      for (let x = 0; x < W; x += 16) { g.fillStyle = rgb(shade(B, 0.9)); g.fillRect(x, 0, 4, W); g.fillStyle = rgb(shade(B, 1.3)); g.fillRect(x, 0, 1, W); }
      for (let y = 0; y < W; y += 64) { g.fillStyle = rgb(B); g.fillRect(0, y, W, 6); g.fillStyle = rgb(shade(B, 1.35)); g.fillRect(0, y, W, 2); }
      for (const s of [0, 256]) { g.fillStyle = rgb(shade(A, 0.8)); g.fillRect(0, s, W, 10); g.fillRect(s, 0, 10, W); g.fillStyle = rgb(shade(A, 1.3)); g.fillRect(0, s, W, 2); g.fillRect(s, 0, 2, W); }
    }
    return toTex(c);
  });
}

// ------------------------------------------------------------------ materials painted for props
/** brushed or painted metal, tiled 1 m: a fill with directional strokes, a few dings */
export function metalTex(base: number, key: string, o: { brushed?: boolean; dings?: number } = {}) {
  return cached(`metal|${key}`, () => {
    const W = 256, [c, g] = canvas(W, W), r = new Rand(hashStr(key));
    g.fillStyle = rgb(base); g.fillRect(0, 0, W, W);
    if (o.brushed) for (let i = 0; i < 900; i++) { g.fillStyle = rgba(r.next() < 0.5 ? 0xffffff : 0x000000, 0.04 + r.next() * 0.04); g.fillRect(r.next() * W, r.next() * W, 20 + r.next() * 80, 1); }
    else grain(g, W, W, hashStr(key), 0.05);
    for (let i = 0; i < (o.dings ?? 6); i++) { const x = r.next() * W, y = r.next() * W; g.fillStyle = rgba(0xffffff, 0.12); g.fillRect(x, y, 3 + r.next() * 4, 1); g.fillStyle = rgba(0, 0.15); g.fillRect(x, y + 1, 3, 1); }
    return toTex(c);
  });
}
/** fabric: a fine weave in the base colour, for blankets, seats and curtains */
export function fabricTex(base: number, key: string, o: { check?: number; stripe?: number } = {}) {
  return cached(`fabric|${key}`, () => {
    const W = 256, [c, g] = canvas(W, W), r = new Rand(hashStr(key));
    g.fillStyle = rgb(base); g.fillRect(0, 0, W, W);
    for (let y = 0; y < W; y += 2) { g.fillStyle = rgba(0xffffff, 0.035); g.fillRect(0, y, W, 1); }
    for (let x = 0; x < W; x += 2) { g.fillStyle = rgba(0, 0.05); g.fillRect(x, 0, 1, W); }
    if (o.check !== undefined) for (let k = 0; k < W; k += 64) { g.fillStyle = rgba(o.check, 0.45); g.fillRect(k, 0, 10, W); g.fillRect(0, k, W, 10); }
    if (o.stripe !== undefined) for (let k = 20; k < W; k += 80) { g.fillStyle = rgb(o.stripe); g.fillRect(0, k, W, 6); }
    grain(g, W, W, hashStr(key) + 1, 0.05, 0, 2, 2);
    for (let i = 0; i < 40; i++) { g.fillStyle = rgba(0, 0.06); g.fillRect(r.next() * W, r.next() * W, 30, 1); }
    return toTex(c);
  });
}
/** wood: plank grain for the quarters' shelves and the mess table */
export function woodTex(base: number, key: string) {
  return cached(`wood|${key}`, () => {
    const W = 256, [c, g] = canvas(W, W), r = new Rand(hashStr(key));
    g.fillStyle = rgb(base); g.fillRect(0, 0, W, W);
    for (let p = 0; p < 4; p++) {
      const tone = shade(base, 0.9 + r.next() * 0.2); g.fillStyle = rgb(tone); g.fillRect(0, p * 64, W, 64);
      for (let i = 0; i < 26; i++) {
        const y = p * 64 + r.next() * 64; g.strokeStyle = rgba(shade(base, 0.6), 0.35); g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 2); g.stroke();
      }
      g.fillStyle = rgba(0, 0.4); g.fillRect(0, p * 64, W, 1);
    }
    return toTex(c);
  });
}

// ------------------------------------------------------------------ decals with alpha
export function labelTex(s: string, o: { size?: number; fg?: number; bg?: number; pad?: number; font?: string; border?: number; wear?: number; w?: number; h?: number } = {}) {
  return pixSign(s, { fg: o.fg, bg: o.bg, size: Math.max(10, Math.round((o.size ?? 48) / 3)), font: o.font, border: o.border });
}
export function labelTexSmooth(s: string, o: { size?: number; fg?: number; bg?: number; pad?: number; font?: string; border?: number; wear?: number; w?: number; h?: number } = {}) {
  const key = `label|${s}|${JSON.stringify(o)}`;
  return cached(key, () => {
    const size = o.size ?? 48, pad = o.pad ?? Math.round(size * 0.35);
    const [m] = canvas(4, 4), mg = m.getContext('2d')!; mg.font = `${size}px ${o.font ?? "'Superwide', monospace"}`;
    const tw = Math.ceil(mg.measureText(s).width);
    const W = o.w ?? tw + pad * 2, H = o.h ?? Math.round(size * 1.3 + pad * 2 * 0.6);
    const [c, g] = canvas(W, H);
    if (o.bg !== undefined) { g.fillStyle = rgb(o.bg); g.fillRect(0, 0, W, H); }
    if (o.border !== undefined) { g.strokeStyle = rgb(o.border); g.lineWidth = Math.max(2, size * 0.08); g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2); }
    stencilText(g, s, W / 2, H / 2 + size * 0.36, size, o.fg ?? 0xe8e4d4, { font: o.font, align: 'center', wear: o.wear });
    const t = toTex(c, { repeat: false }); (t as any).aspect = W / H;
    return t;
  });
}

/** hazard stripes (tile along u) */
export function hazardTex(a = 0xd8a63a, b = 0x1c1b18) { return pixHazard(a, b); }
export function hazardTexSmooth(a = 0xd8a63a, b = 0x1c1b18) {
  return cached(`haz|${a}|${b}`, () => {
    const [c, g] = canvas(256, 64);
    hazardStripes(g, 0, 0, 256, 64, 64, a, b);
    const r = new Rand(4); chips(g, 0, 2, 256, 2, shade(b, 2), r, 40, 2); chips(g, 0, 60, 256, 60, shade(b, 2), r, 40, 2);
    grain(g, 256, 64, 3, 0.08);
    return toTex(c);
  });
}

// ------------------------------------------------------------------ posters, signs, photos (the lived-in layer)
export type PosterKind = 'unaa' | 'safety' | 'earth' | 'band' | 'chart' | 'kid' | 'calendar' | 'pinup' | 'bio' | 'reactor' | 'menu' | 'firstaid' | 'eye' | 'tools' | 'nebula' | 'saturn' | 'mars' | 'planet';
export function posterTex(kind: PosterKind, seed = 1) { return pixPoster(kind, seed); }
export function posterTexSmooth(kind: PosterKind, seed = 1) {
  return cached(`poster|${kind}|${seed}`, () => {
    const W = 256, H = 352, [c, g] = canvas(W, H), r = new Rand(seed * 31 + kind.length);
    const paper = 0xd8cfb8;
    g.fillStyle = rgb(paper); g.fillRect(0, 0, W, H);
    const T = (s: string, y: number, size: number, col: number, font = "'Superwide', monospace", x = W / 2) => stencilText(g, s, x, y, size, col, { font, align: 'center' });
    if (kind === 'unaa') {
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#13233a'); sky.addColorStop(1, '#3a4f6a'); g.fillStyle = sky; g.fillRect(10, 10, W - 20, H - 20);
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(230,230,210,${r.next()})`; g.fillRect(10 + r.next() * (W - 20), 10 + r.next() * 200, 1.5, 1.5); }
      g.fillStyle = '#c9773d'; g.beginPath(); g.arc(W / 2, 330, 150, Math.PI, 0); g.fill();
      g.fillStyle = '#e09a5a'; g.beginPath(); g.arc(W / 2 - 20, 330, 130, Math.PI, Math.PI * 1.5); g.lineTo(W / 2 - 20, 330); g.fill();
      // the ship's silhouette climbing
      g.fillStyle = '#e8e2cc'; g.beginPath(); g.moveTo(150, 120); g.lineTo(186, 96); g.lineTo(192, 104); g.lineTo(158, 130); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(232,180,110,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(152, 128); g.quadraticCurveTo(90, 180, 70, 240); g.stroke();
      T('UNAA', 48, 34, 0xe8e2cc); T('REACH FURTHER', 74, 15, 0xd8a63a); T('THE SETTLEMENT PROGRAM NEEDS YOU', 330, 10, 0xe8e2cc, "'Jersey', monospace");
    } else if (kind === 'safety') {
      hazardStripes(g, 0, 0, W, 22, 22); hazardStripes(g, 0, H - 22, W, 22, 22);
      T('SECURE', 70, 30, 0x1c1b18); T('ALL LOOSE', 104, 24, 0x1c1b18); T('OBJECTS', 136, 30, 0x1c1b18);
      // a mug floating off a table, motion lines
      g.fillStyle = '#b8382e'; g.fillRect(100, 190, 50, 56); g.fillRect(150, 202, 14, 8); g.fillRect(156, 202, 8, 30); g.fillRect(150, 224, 14, 8);
      g.strokeStyle = '#1c1b18'; g.lineWidth = 3; for (const y of [196, 214, 232]) { g.beginPath(); g.moveTo(70, y + 20); g.lineTo(90, y + 10); g.stroke(); }
      g.fillStyle = '#1c1b18'; g.fillRect(40, 290, 176, 8);
      T('MICROGRAVITY PROTOCOL 4.2', 322, 10, 0x1c1b18, "'Jersey', monospace");
    } else if (kind === 'earth') {
      g.fillStyle = '#05070c'; g.fillRect(0, 0, W, H);
      const cx = W / 2, cy = 160, R = 100;
      const eg = g.createRadialGradient(cx - 30, cy - 30, 10, cx, cy, R); eg.addColorStop(0, '#5a8ab8'); eg.addColorStop(1, '#1a3254'); g.fillStyle = eg; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
      g.fillStyle = '#6a7a4a'; for (const [x, y, w, h] of [[-40, -50, 50, 70], [10, 0, 40, 60], [-60, 20, 30, 30]]) { g.beginPath(); g.ellipse(cx + x, cy + y, w / 2, h / 2, 0.4, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(240,240,240,0.7)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(cx - 70 + r.next() * 140, cy - 70 + r.next() * 140, 30, 6, r.next(), 0, 7); g.fill(); }
      T('HOME', 300, 30, 0xd8cfb8); T('4.2 LIGHT YEARS BEHIND US', 326, 10, 0x8f9a94, "'Jersey', monospace");
    } else if (kind === 'band') {
      g.fillStyle = '#2a1830'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 9; i++) { g.fillStyle = ['#d86a3a', '#e8b84a', '#c84a6a'][i % 3]; g.fillRect(0, 120 + i * 12, W, 6); }
      T('THE COMET', 60, 28, 0xe8b84a); T('KIDS', 100, 36, 0xe8e2cc); T('LIVE AT HALO STATION', 280, 12, 0xd8cfb8, "'Jersey', monospace"); T('ONE NIGHT ONLY', 306, 12, 0xd86a3a, "'Jersey', monospace");
    } else if (kind === 'chart') {
      g.fillStyle = '#16304a'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(200,220,230,0.25)'; g.lineWidth = 1; for (let k = 0; k < W; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, H); g.stroke(); } for (let k = 0; k < H; k += 32) { g.beginPath(); g.moveTo(0, k); g.lineTo(W, k); g.stroke(); }
      for (let i = 0; i < 7; i++) { const x = 30 + r.next() * 196, y = 40 + r.next() * 240; g.fillStyle = '#e8e2cc'; g.beginPath(); g.arc(x, y, 2 + r.next() * 4, 0, 7); g.fill(); g.strokeStyle = 'rgba(232,226,204,0.5)'; g.beginPath(); g.arc(x, y, 10 + r.next() * 14, 0, 7); g.stroke(); }
      g.strokeStyle = '#d8a63a'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(30, 300); g.bezierCurveTo(90, 200, 160, 220, 220, 80); g.stroke(); g.setLineDash([]);
      T('KEPLER-442 SYSTEM', 330, 12, 0xe8e2cc, "'Jersey', monospace");
    } else if (kind === 'kid') {
      g.fillStyle = '#efe8d6'; g.fillRect(0, 0, W, H);
      g.lineWidth = 4; g.lineCap = 'round';
      g.strokeStyle = '#3a6ad8'; g.beginPath(); g.moveTo(10, 300); g.lineTo(246, 300); g.stroke();
      g.strokeStyle = '#d83a3a'; g.beginPath(); g.moveTo(60, 160); g.lineTo(180, 120); g.lineTo(200, 140); g.lineTo(80, 180); g.closePath(); g.stroke();
      g.strokeStyle = '#e8a82a'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(66 - i * 8, 172 + i * 4); g.lineTo(40 - i * 10, 190 + i * 8); g.stroke(); }
      for (const [x, col] of [[70, '#2a2a2a'], [110, '#8a3ab8'], [150, '#2a8a3a']] as [number, string][]) { g.strokeStyle = col; g.beginPath(); g.arc(x, 236, 10, 0, 7); g.moveTo(x, 246); g.lineTo(x, 278); g.moveTo(x - 12, 258); g.lineTo(x + 12, 258); g.moveTo(x, 278); g.lineTo(x - 8, 296); g.moveTo(x, 278); g.lineTo(x + 8, 296); g.stroke(); }
      g.fillStyle = '#e8c82a'; g.beginPath(); g.arc(214, 50, 22, 0, 7); g.fill();
      stencilText(g, 'COME HOME SOON', W / 2, 40, 16, 0x3a6ad8, { font: "'Pixelify', monospace", align: 'center' });
    } else if (kind === 'calendar') {
      g.fillStyle = '#b8382e'; g.fillRect(0, 0, W, 60);
      T('MISSION DAY', 38, 16, 0xe8e2cc);
      for (let i = 0; i < 35; i++) {
        const x = 14 + (i % 7) * 33, y = 80 + Math.floor(i / 7) * 52;
        g.strokeStyle = '#7a7060'; g.lineWidth = 1; g.strokeRect(x, y, 30, 48);
        stencilText(g, String(400 + i), x + 3, y + 14, 10, 0x3a3630, { font: "'Jersey', monospace" });
        if (i < 23) { g.strokeStyle = '#b8382e'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 4, y + 18); g.lineTo(x + 26, y + 44); g.moveTo(x + 26, y + 18); g.lineTo(x + 4, y + 44); g.stroke(); }
      }
    } else if (kind === 'pinup') {
      // a holiday photo: a beach on Earth, bleached by the years
      const sk = g.createLinearGradient(0, 0, 0, 200); sk.addColorStop(0, '#7aa6c8'); sk.addColorStop(1, '#d8d0b8'); g.fillStyle = sk; g.fillRect(12, 12, W - 24, 200);
      g.fillStyle = '#3a7a8a'; g.fillRect(12, 160, W - 24, 50); g.fillStyle = '#d8c08a'; g.fillRect(12, 210, W - 24, 70);
      g.fillStyle = '#3a4a2a'; g.fillRect(50, 90, 8, 120); g.fillStyle = '#4a6a2a'; for (let i = 0; i < 6; i++) { g.save(); g.translate(54, 92); g.rotate(-1.2 + i * 0.5); g.fillRect(0, -4, 44, 8); g.restore(); }
      g.fillStyle = '#efe8d6'; g.fillRect(0, 290, W, 62);
      stencilText(g, 'Cabo, summer before launch', W / 2, 324, 14, 0x3a3630, { font: "'Pixelify', monospace", align: 'center' });
    } else if (kind === 'bio') {
      g.fillStyle = '#e4ead8'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#2a6a4a'; g.lineWidth = 3;
      for (let k = 0; k < 2; k++) { g.beginPath(); for (let y = 30; y < 280; y += 4) { const x = W / 2 + Math.sin(y * 0.05 + k * Math.PI) * 50; if (y === 30) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
      for (let y = 34; y < 280; y += 14) { g.strokeStyle = ['#b8382e', '#d8a63a', '#3a6ad8', '#2a8a3a'][(y / 14) % 4 | 0]; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 + Math.sin(y * 0.05) * 50, y); g.lineTo(W / 2 - Math.sin(y * 0.05) * 50, y); g.stroke(); }
      T('GENE SPLICING', 310, 16, 0x1c3a2a); T('SAFE HANDLING STARTS WITH YOU', 334, 9, 0x2a4a3a, "'Jersey', monospace");
    } else if (kind === 'reactor') {
      g.fillStyle = '#e8d8a8'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1c1b18'; g.beginPath(); g.arc(W / 2, 140, 70, 0, 7); g.fill();
      g.fillStyle = '#e8d8a8'; g.beginPath(); g.arc(W / 2, 140, 14, 0, 7); g.fill();
      g.fillStyle = '#e8d8a8'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(W / 2, 140); g.arc(W / 2, 140, 76, k * 2.094 + 0.5, k * 2.094 + 1.55); g.closePath(); g.fill(); }
      T('RADIATION', 260, 24, 0x1c1b18); T('AREA', 292, 24, 0x1c1b18); T('DOSIMETER REQUIRED BEYOND THIS POINT', 326, 8, 0x1c1b18, "'Jersey', monospace");
    } else if (kind === 'menu') {
      g.fillStyle = '#1e2422'; g.fillRect(0, 0, W, H);
      T('GALLEY', 40, 22, 0xd8a63a);
      const items = ['MON  SOY CHILI', 'TUE  ALGAE NOODLES', 'WED  "MEATLOAF"', 'THU  TACO NIGHT', 'FRI  CHEF\'S CHOICE', 'SAT  PIZZA (REAL CHEESE)', 'SUN  LEFTOVERS'];
      items.forEach((s, i) => stencilText(g, s, 20, 90 + i * 32, 13, 0xe8e2cc, { font: "'VT', monospace" }));
      stencilText(g, 'NO FISH IN THE MICROWAVE', W / 2, 330, 10, 0xb8382e, { font: "'Jersey', monospace", align: 'center' });
    } else if (kind === 'firstaid') {
      g.fillStyle = '#efefe8'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#b8382e'; g.fillRect(98, 60, 60, 160); g.fillRect(48, 110, 160, 60);
      T('FIRST AID', 280, 22, 0x1c1b18); T('STATION 3', 310, 14, 0x5a5a50, "'Jersey', monospace");
    } else if (kind === 'eye') {
      g.fillStyle = '#efefe8'; g.fillRect(0, 0, W, H);
      const rows = ['E', 'F P', 'T O Z', 'L P E D', 'P E C F D', 'E D F C Z P'];
      rows.forEach((s, i) => stencilText(g, s, W / 2, 60 + i * 46, 40 - i * 6, 0x1c1b18, { font: "'Jersey', monospace", align: 'center' }));
    } else {
      g.fillStyle = '#3a3c2c'; g.fillRect(0, 0, W, H);
      T('TOOL CHECK', 40, 18, 0xd8a63a);
      const items = ['TORQUE WRENCH', 'SEALANT GUN', 'HULL PATCH KIT', 'MAG-BOOTS', 'PLASMA CUTTER'];
      items.forEach((s, i) => { g.strokeStyle = '#e8e2cc'; g.strokeRect(20, 80 + i * 44, 16, 16); stencilText(g, s, 46, 94 + i * 44, 13, 0xe8e2cc, { font: "'VT', monospace" }); if (i < 3) { g.strokeStyle = '#7fd48a'; g.lineWidth = 3; g.beginPath(); g.moveTo(22, 88 + i * 44); g.lineTo(28, 94 + i * 44); g.lineTo(38, 78 + i * 44); g.stroke(); g.lineWidth = 1; } });
    }
    // paper wear: a fold line, curled corner shadow, faded edges, tape
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, H / 2, W, 1); g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, H / 2 + 1, W, 1);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,40,10,0.28)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(220,214,180,0.75)'; g.save(); g.translate(14, 10); g.rotate(-0.5); g.fillRect(-14, -6, 34, 12); g.restore(); g.save(); g.translate(W - 14, 10); g.rotate(0.5); g.fillRect(-20, -6, 34, 12); g.restore();
    const t = toTex(c, { repeat: false }); (t as any).aspect = W / H; return t;
  });
}

/** a soft round light pool (additive floor decal) */
export function poolTex() {
  return cached('pool', () => {
    const [c, g] = canvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return toTex(c, { repeat: false });
  });
}

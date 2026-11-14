// Shared building blocks for the 3D sets (the launch-control menu and the cutscene props): pixel-painted textures
// from machine.ts's Pix painter turned into nearest-filtered three.js textures, flat-shaded materials that join the
// G-buffer (so the post pass outlines them and can highlight them on hover), and a few primitive helpers.
import * as THREE from 'three';
import { Pix, metal, rivet, text, textW, hazard, GM, OL, BR, CU, CR, BK, RD, AM, PH, HZ, INK, dv, mixc } from './machine';
import { gbuf, F_HOVER, type GFlag } from '../gfx/gbuf';

export { Pix, GM, OL, BR, CU, CR, BK, RD, AM, PH, HZ, INK };

export function tex(p: Pix | HTMLCanvasElement, repeat = false): THREE.Texture {
  const c = p instanceof Pix ? p.canvas() : p;
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** a lit, flat-shaded material that writes the G-buffer (flag: shared, so a prop can glow its outline on hover) */
export function mat(o: { color?: number; map?: THREE.Texture | null; emissive?: number; emissiveMap?: THREE.Texture | null; flat?: boolean; flag?: GFlag; side?: THREE.Side; phong?: boolean; shininess?: number }): THREE.Material {
  const m = o.phong
    ? new THREE.MeshPhongMaterial({ color: o.color ?? 0xffffff, map: o.map ?? null, emissive: o.emissive ?? 0, emissiveMap: o.emissiveMap ?? null, flatShading: o.flat !== false, shininess: o.shininess ?? 40, specular: 0x555555, side: o.side ?? THREE.FrontSide })
    : new THREE.MeshLambertMaterial({ color: o.color ?? 0xffffff, map: o.map ?? null, emissive: o.emissive ?? 0, emissiveMap: o.emissiveMap ?? null, flatShading: o.flat !== false, side: o.side ?? THREE.FrontSide });
  gbuf(m, o.flag ?? 1);
  return m;
}
/** an unlit glowing material (lamps, screens, flames). opaque ones write the G-buffer with no outline */
export function glowMat(color: number, o: { map?: THREE.Texture | null; additive?: boolean; opacity?: number } = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, map: o.map ?? null, transparent: !!o.additive || (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.additive });
  gbuf(m, o.additive ? 0 : 32);
  return m;
}
export function hoverFlag(): GFlag { return { value: 1 }; }
export function setHover(f: GFlag, on: boolean) { f.value = on ? 1 + F_HOVER : 1; }

// ------------------------------------------------------------------ textures
const memo = new Map<string, THREE.Texture>();
const once = (k: string, f: () => THREE.Texture) => { let t = memo.get(k); if (!t) memo.set(k, (t = f())); return t; };

/** an enamel panel (olive, gunmetal, cream, red) with seams and rivets */
export function panelTex(tone: 'olive' | 'gun' | 'cream' | 'red' | 'black' | 'brass', w = 32, h = 32, o: { rivets?: boolean; seams?: boolean; seed?: number } = {}) {
  return once(`pn:${tone}:${w}:${h}:${o.rivets}:${o.seams}:${o.seed}`, () => {
    const R = tone === 'olive' ? OL : tone === 'gun' ? GM : tone === 'cream' ? CR : tone === 'red' ? RD : tone === 'black' ? BK : BR;
    const p = new Pix(w, h);
    metal(p, 0, 0, w, h, R, { seed: o.seed ?? 3, tile: true, grime: 0.4, scratches: 0.6 });
    if (o.seams !== false) { p.hl(0, w - 1, 0, R[1]); p.vl(0, 0, h - 1, R[1]); p.hl(0, w - 1, 1, R[Math.min(R.length - 1, 6)], 120); }
    if (o.rivets !== false) for (const [x, y] of [[3, 3], [w - 4, 3], [3, h - 4], [w - 4, h - 4]]) rivet(p, x, y, GM);
    return tex(p, true);
  });
}
/** deck plating: diamond tread with weld seams and a hazard edge */
export function deckTex() {
  return once('deck', () => {
    const W = 64, p = new Pix(W, W);
    metal(p, 0, 0, W, W, GM, { seed: 11, tile: true, grime: 0.8, scratches: 0.8, base: 3.4 });
    for (let y = 2; y < W; y += 6) for (let x = (y / 6) % 2 ? 1 : 4; x < W; x += 6) { p.set(x, y, GM[6]); p.set(x + 1, y + 1, GM[5]); p.set(x + 1, y, GM[2]); }
    p.hl(0, W - 1, 0, GM[1]); p.vl(0, 0, W - 1, GM[1]); p.hl(0, W - 1, 1, GM[6], 100);
    return tex(p, true);
  });
}
export function hazardTex() { return once('haz', () => { const p = new Pix(32, 8); hazard(p, 0, 0, 32, 8, 5); return tex(p, true); }); }
/** a stamped label plate (3x5 stencil type), any colour scheme */
export function labelTex(s: string, kind: 'cream' | 'brass' | 'red' | 'black' | 'dymo' = 'cream') {
  return once(`lb:${s}:${kind}`, () => {
    const tw = textW(s), w = tw + 8, h = 9;
    const p = new Pix(w, h);
    const R = kind === 'brass' ? BR : kind === 'red' ? RD : kind === 'black' || kind === 'dymo' ? BK : CR;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, dv(R, R.length * 0.55 + (y < 2 ? 1 : y > h - 3 ? -1 : 0) - x / w * 0.4, x, y));
    p.hl(0, w - 1, 0, R[R.length - 1]); p.hl(0, w - 1, h - 1, INK); p.vl(0, 0, h - 1, R[R.length - 2]); p.vl(w - 1, 0, h - 1, INK);
    const ink = kind === 'cream' ? 0x2a2418 : kind === 'brass' ? BR[1] : kind === 'dymo' ? 0xf0f0f0 : kind === 'black' ? CR[3] : CR[4];
    text(p, s, 4, 2, ink, kind === 'cream' || kind === 'brass' ? 'engrave' : 'flat', R[R.length - 1], R[0]);
    if (kind !== 'dymo') { p.set(2, 4, R[1]); p.set(w - 3, 4, R[1]); }
    return tex(p);
  });
}
/** the Corps roundel: a white star on a navy disc with a red ring */
export function roundelTex() {
  return once('roundel', () => {
    const S = 32, p = new Pix(S, S), c = (S - 1) / 2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > 15.5) continue;
      p.set(x, y, d > 13.5 ? RD[4] : d > 12.5 ? CR[4] : 0x1c2e6a);
    }
    const star: number[] = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 4.3 : 10.5; star.push(c + Math.cos(a) * r, c + Math.sin(a) * r); }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let ins = false;
      for (let i = 0, j = star.length - 2; i < star.length; j = i, i += 2) { const xi = star[i], yi = star[i + 1], xj = star[j], yj = star[j + 1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; }
      if (ins) p.set(x, y, CR[4]);
    }
    return tex(p);
  });
}
/** text painted big for signage (a canvas font, thresholded to hard pixels) */
export function signTex(s: string, o: { font?: string; size?: number; fg?: number; bg?: number | null; pad?: number; glow?: number } = {}) {
  return once(`sg:${s}:${JSON.stringify(o)}`, () => {
    const size = o.size ?? 16, font = o.font ?? 'Silk', pad = o.pad ?? 3;
    const m = document.createElement('canvas').getContext('2d')!; m.font = `${size}px ${font}`;
    const w = Math.ceil(m.measureText(s).width) + pad * 2, h = Math.ceil(size * 1.2) + pad * 2;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.font = `${size}px ${font}`; g.textBaseline = 'top'; g.fillStyle = '#fff'; g.fillText(s, pad, pad + 1);
    const id = g.getImageData(0, 0, w, h);
    const out = new Pix(w, h);
    if (o.bg !== null && o.bg !== undefined) out.rect(0, 0, w, h, o.bg);
    const fg = o.fg ?? CR[4];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (id.data[(y * w + x) * 4 + 3] > 110) { out.set(x, y, fg); if (o.glow !== undefined) out.set(x + 1, y + 1, o.glow); }
    return tex(out);
  });
}
/** a CRT face drawn every frame by fn into a small canvas (phosphor green by default) */
export class Screen2D {
  readonly c: HTMLCanvasElement; readonly g: CanvasRenderingContext2D; readonly t: THREE.CanvasTexture;
  constructor(readonly w: number, readonly h: number) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.g = this.c.getContext('2d')!; this.g.imageSmoothingEnabled = false;
    this.t = new THREE.CanvasTexture(this.c); this.t.magFilter = THREE.NearestFilter; this.t.minFilter = THREE.NearestFilter; this.t.generateMipmaps = false; this.t.colorSpace = THREE.SRGBColorSpace;
  }
  /** clear to a dark phosphor field with a soft vignette */
  clear(col = '#04140a') { const g = this.g; g.fillStyle = col; g.fillRect(0, 0, this.w, this.h); }
  scan() { const g = this.g; g.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 0; y < this.h; y += 2) g.fillRect(0, y, this.w, 1); }
  /** 3x5 stencil text (uses machine.ts's font through a Pix) */
  text(s: string, x: number, y: number, col: number) { const p = new Pix(textW(s) + 2, 6); text(p, s, 0, 0, col); this.g.drawImage(p.canvas(), Math.round(x), Math.round(y)); }
  flush() { this.t.needsUpdate = true; }
}
export const hexs = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
export { mixc, dv, metal, rivet, text, textW, hazard };

// ------------------------------------------------------------------ geometry helpers
export function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent?.add(me); return me;
}
export function cyl(rt: number, rb: number, h: number, m: THREE.Material | THREE.Material[], seg = 12, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent?.add(me); return me;
}
/** a box whose UVs repeat a texture at a fixed texel density (u per world unit) */
export function tiledBox(w: number, h: number, d: number, m: THREE.Material, density = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (nx > 0.5) uv.setXY(i, z * density, y * density); else if (ny > 0.5) uv.setXY(i, x * density, z * density); else uv.setXY(i, x * density, y * density);
  }
  const me = new THREE.Mesh(g, m); me.castShadow = true; me.receiveShadow = true; return me;
}

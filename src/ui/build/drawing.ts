// TECHNICAL DRAWINGS of a building traced from its own model: the studio (studio.ts `drawingPasses`) renders the model
// orthographically as a flat id per part, view-space normals and depth; this file traces them at the art resolution into
// clean pixel line art on blueprint paper: white silhouettes, pale lines where parts meet or the surface folds or steps
// back, faces washed in the paper's tones by how they meet the light (clustered dither, no hatching). Views: 'iso'
// (a three-quarter isometric), 'plan', 'front', 'side'. Cached per kind, view and size.
import type { FKind } from '../../factory/defs';
import { drawingPasses } from './studio';
import { RAMPS as P } from '../../art/palette';
import { qstep } from '../kit/paint';

export interface TechDrawing { cv: HTMLCanvasElement; scale: number; w: number; h: number }
const cache = new Map<string, TechDrawing | null>();
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;
const LINE = rgb(P.quartz[5]), CREASE = rgb(P.sapphire[6]), DEEP = rgb(P.sapphire[1]);
const TONES = [P.sapphire[1], P.sapphire[2], P.sapphire[3], P.sapphire[4]].map(rgb);
const L = (() => { const v = [-0.45, 0.65, 0.6], n = Math.hypot(...v); return v.map((x) => x / n); })();

/** the building traced as a technical drawing, w x h art px (null before the studio is set up) */
export function techDrawing(kind: FKind, view: 'iso' | 'plan' | 'front' | 'side', w: number, h: number): TechDrawing | null {
  const key = `${kind}|${view}|${w}x${h}`;
  if (cache.has(key)) return cache.get(key)!;
  const ps = drawingPasses(kind, w, h, view);
  if (!ps) return null;
  const { id, nrm, dep } = ps, N = w * h;
  const A = (i: number) => id[i * 4 + 3] > 8;
  const ID = (i: number) => (id[i * 4] << 16) | (id[i * 4 + 1] << 8) | id[i * 4 + 2];
  const nx = (i: number) => nrm[i * 4] / 127.5 - 1, ny = (i: number) => nrm[i * 4 + 1] / 127.5 - 1, nz = (i: number) => nrm[i * 4 + 2] / 127.5 - 1;
  const D = (i: number) => dep[i * 4] / 255;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!, img = g.createImageData(w, h), d = img.data;
  const put = (i: number, c: readonly number[], a = 255) => { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = a; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!A(i)) {
      // a thin shadow line down-right of the silhouette lifts the drawing off the paper
      const ul = x > 0 && y > 0 && A(i - w - 1);
      if (ul) put(i, DEEP, 150);
      continue;
    }
    const l = x > 0 && A(i - 1), r = x < w - 1 && A(i + 1), u = y > 0 && A(i - w), dn = y < h - 1 && A(i + w);
    if (!l || !r || !u || !dn) { put(i, LINE); continue; }
    const crease = (j: number) => ID(j) !== ID(i) || nx(i) * nx(j) + ny(i) * ny(j) + nz(i) * nz(j) < 0.86 || Math.abs(D(i) - D(j)) > 0.035;
    if (crease(i + 1) || crease(i + w)) { put(i, CREASE); continue; }
    // faces washed by how they meet the light, the tones broken in clumps (the kit's clustered dither, no hatching)
    const lit = nx(i) * L[0] + ny(i) * L[1] + nz(i) * L[2];
    put(i, TONES[qstep(1 + Math.max(0, Math.min(1, (lit + 0.15) / 0.95)) * 2.2, x, y, TONES.length, 17)]);
  }
  g.putImageData(img, 0, 0);
  const out: TechDrawing = { cv, scale: ps.scale, w, h };
  void N;
  cache.set(key, out);
  return out;
}

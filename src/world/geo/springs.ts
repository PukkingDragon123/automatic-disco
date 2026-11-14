// Thermal fields: hot springs and geysers in the volcanic and ash country (and, rarer, alien thermal pools in the
// cold and the crystal flats). A field sits on a gentle slope: a cascade of TERRACED MINERAL POOLS steps down it,
// each pool held behind a raised travertine lip with a crust of mineral sinter round it (white, ochre or rust, by the
// water's chemistry), the hottest pools a vivid turquoise or green; a few GEYSERS stand on low sinter cones with a vent
// pool on top, erupting on their own timers; steam vents (fumaroles) hiss among them. The field is dangerous ground:
// scalding pools and eruptions (geo/live.ts), and the rare ores like it there.
import { Rand, clamp, smooth } from '../../core/rand';
import type { Region, Spring } from '../region';

const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);

/** per-biome chance of a thermal field, and the water's look */
const THERMAL: Partial<Record<string, { p: number; hues: Spring['hue'][]; geysers: [number, number] }>> = {
  ashland: { p: 1, hues: ['ochre', 'rust', 'turquoise'], geysers: [2, 4] },
  crystal: { p: 1, hues: ['turquoise', 'green'], geysers: [1, 3] },
  tundra: { p: 0.65, hues: ['turquoise'], geysers: [1, 2] },
  highland: { p: 0.45, hues: ['turquoise', 'ochre'], geysers: [1, 2] },
  desert: { p: 0.35, hues: ['rust', 'ochre'], geysers: [0, 1] },
  savanna: { p: 0.2, hues: ['ochre', 'green'], geysers: [0, 1] },
  jungle: { p: 0.25, hues: ['green', 'turquoise'], geysers: [0, 1] },
  meadow: { p: 0.12, hues: ['turquoise'], geysers: [0, 1] },
  marsh: { p: 0.15, hues: ['green', 'ochre'], geysers: [0, 0] },
};
/** crust kind for the ground shader (geo A): 0 white sinter, 1 ochre, 2 rust */
export const CRUST: Record<NonNullable<Spring['hue']>, number> = { turquoise: 0, green: 0, ochre: 1, rust: 2 };

/**
 * Lay out a thermal field into the region (after the water network, before the blocks): pools, geysers, vents.
 * Returns the field centre and radius, or null.
 */
export function thermalField(R: Region, r: Rand): { x: number; z: number; r: number } | null {
  const T = THERMAL[R.biome.key];
  if (!T || !r.chance(T.p)) return null;
  const N = R.N, W = R.water, L = R.landing, h = R.h;
  // a gentle slope, dry, out of the ranges, well clear of the landing and the water
  let best: [number, number, number, number] | null = null, bs = -1e9;
  for (let t = 0; t < 500; t++) {
    const x = r.range(14, N - 14), z = r.range(14, N - 14), i = Math.floor(z) * N + Math.floor(x);
    if (h[i] < W + 0.8 || R.riverY[i] > 0 || R.mount[i] > 0.25 || R.passMask[i]) continue;
    const dl = hyp(x - L.x, z - L.z); if (dl < 28) continue;
    const gx = R.groundSmooth(x + 2, z) - R.groundSmooth(x - 2, z), gz = R.groundSmooth(x, z + 2) - R.groundSmooth(x, z - 2);
    const sl = hyp(gx, gz) / 4; if (sl > 0.3) continue;
    let wet = 99; for (let a = 0; a < 12; a++) for (const d of [4, 8, 11]) if (R.isWater(x + Math.cos(a * 0.52) * d, z + Math.sin(a * 0.52) * d)) wet = Math.min(wet, d);
    if (wet < 8) continue;
    const sc = -Math.abs(sl - 0.12) * 8 + r.range(0, 1.5) - Math.abs(dl - 45) * 0.03;
    if (sc > bs) { bs = sc; best = [x, z, gx, gz]; }
  }
  if (!best) return null;
  const [cx, cz, gx0, gz0] = best;
  let gl = hyp(gx0, gz0); const dx = gl > 1e-3 ? -gx0 / gl : 1, dz = gl > 1e-3 ? -gz0 / gl : 0; // downhill
  const hue = r.pick(T.hues)!;
  // the terraces: a cascade of pools down the slope, each one a step under the last, on a levelled sinter shelf
  const n = r.int(3, 6);
  let x = cx - dx * n * 1.3, z = cz - dz * n * 1.3, level = R.groundSmooth(x, z) + 0.05;
  for (let k = 0; k < n; k++) {
    const rad = r.range(1.0, 2.1), side = r.range(-1.4, 1.4);
    const px = x - dz * side, pz = z + dx * side;
    const ground = R.groundSmooth(px, pz);
    level = Math.min(level - (k ? r.range(0.28, 0.5) : 0), ground + 0.12);
    terrace(R, px, pz, rad, level, r);
    R.springs.push({ x: px, z: pz, r: rad, level, kind: k === 0 || r.chance(0.35) ? 'hot' : 'mineral', hue: k === 0 ? hue : r.chance(0.6) ? hue : r.pick(T.hues)! });
    x += dx * r.range(2.2, 3.2); z += dz * r.range(2.2, 3.2);
  }
  // geysers on sinter cones, off to the sides of the terraces
  const ng = r.int(T.geysers[0], T.geysers[1]);
  for (let k = 0, t = 0; k < ng && t < 60; t++) {
    const a = r.range(0, Math.PI * 2), d = r.range(4, 9), gxp = cx + Math.cos(a) * d, gzp = cz + Math.sin(a) * d;
    if (R.springs.some((s) => hyp(s.x - gxp, s.z - gzp) < s.r + 2.6) || R.isWater(gxp, gzp)) continue;
    const top = cone(R, gxp, gzp, r.range(1.4, 2.1), r.range(0.5, 0.9));
    R.springs.push({ x: gxp, z: gzp, r: 0.55, level: top - 0.08, kind: 'geyser', hue: 'turquoise', period: r.range(28, 70), phase: r.range(0, 1), dur: r.range(4, 8), jet: r.range(6, 12) });
    k++;
  }
  // steam vents between them
  for (let k = r.int(3, 6), t = 0; k > 0 && t < 40; t++) {
    const a = r.range(0, Math.PI * 2), d = r.range(2, 11), vx = cx + Math.cos(a) * d, vz = cz + Math.sin(a) * d;
    if (R.springs.some((s) => hyp(s.x - vx, s.z - vz) < s.r + 1) || R.isWater(vx, vz)) continue;
    R.vents.push({ x: vx, z: vz, y: R.groundSmooth(vx, vz), k: r.range(0.5, 1) });
    k--;
  }
  // the crust: geo A over the whole field, strongest at the pool lips (written by ores.fillGeo from the springs)
  const fr = n * 2.8 + 6;
  R.thermal = { x: cx, z: cz, r: fr };
  for (let Z = Math.floor(cz - fr); Z <= Math.ceil(cz + fr); Z++) for (let X = Math.floor(cx - fr); X <= Math.ceil(cx + fr); X++) {
    if (!R.inside(X, Z)) continue;
    const i = Z * N + X; R.fert[i] *= 0.3 + 0.7 * smooth(fr * 0.5, fr, hyp(X + 0.5 - cx, Z + 0.5 - cz));
  }
  void clamp;
  return R.thermal;
}

/** a terraced pool: a levelled shelf, a bowl under the water, a raised lip round it */
function terrace(R: Region, x: number, z: number, rad: number, level: number, r: Rand) {
  const N = R.N, h = R.h, ext = Math.ceil(rad + 2.2);
  const lob = r.range(0, 6.28);
  for (let Z = Math.floor(z) - ext; Z <= Math.floor(z) + ext; Z++) for (let X = Math.floor(x) - ext; X <= Math.floor(x) + ext; X++) {
    if (!R.inside(X, Z)) continue;
    const ax = X + 0.5 - x, az = Z + 0.5 - z, a = Math.atan2(az, ax);
    // scalloped rims: the lip bulges out in lobes, as travertine dams do
    const e = hyp(ax, az) / (rad * (1 + 0.16 * Math.cos(a * 3 + lob) + 0.08 * Math.cos(a * 5 - lob)));
    const i = Z * N + X;
    if (e < 0.82) h[i] = level - 0.12 - 0.35 * (1 - e / 0.82);
    else if (e < 1.12) h[i] = level + 0.06;
    else if (e < 1.12 + 2 / rad) h[i] = h[i] + (level + 0.02 - h[i]) * smooth(1.12 + 2 / rad, 1.12, e) * 0.85;
    R.solid[i] = 0;
  }
}

/** a sinter cone: a low, steep-shouldered mound with a vent bowl at the top. Returns the top height */
function cone(R: Region, x: number, z: number, rad: number, ht: number): number {
  const N = R.N, h = R.h, ext = Math.ceil(rad + 1.5), base = R.groundSmooth(x, z);
  for (let Z = Math.floor(z) - ext; Z <= Math.floor(z) + ext; Z++) for (let X = Math.floor(x) - ext; X <= Math.floor(x) + ext; X++) {
    if (!R.inside(X, Z)) continue;
    const d = hyp(X + 0.5 - x, Z + 0.5 - z) / rad, i = Z * N + X;
    if (d >= 1.4) continue;
    const t = d < 0.3 ? base + ht - 0.25 * (1 - d / 0.3) : base + ht * Math.pow(Math.max(0, 1 - (d - 0.3) / 1.1), 1.3);
    h[i] = Math.max(h[i], t);
  }
  return base + ht;
}

/**
 * Geyser timing, shared by the water shader (ocean agent) and the hazard (geo/live.ts): 0 at rest, rising to 1 at
 * the height of an eruption and falling away; negative in the last few seconds before one (the pool boils, -1..0).
 */
export function geyserState(s: Spring, t: number): number {
  if (s.kind !== 'geyser') return 0;
  const P = s.period ?? 45, D = s.dur ?? 6, ph = (((t / P + (s.phase ?? 0)) % 1) + 1) % 1, e = ph * P;
  if (e < D) return Math.min(1, e / 0.6) * (1 - smooth(D * 0.6, D, e));
  if (e > P - 4) return -(e - (P - 4)) / 4;
  return 0;
}

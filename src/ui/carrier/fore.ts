// The forward hull: the armoured box round Launch Bay 2 (the bay itself is built by deployShip and sits inside,
// x +-9.2, y -15.4..-2.1, z 5.8..63.9), its mouth frame and the apron the pod launches over, the brow over the
// mouth with the hull number and searchlight, the flanks (armour belt with the Corps line, landing craft in lit
// davit bays, a docking port each side, conduits), the keel (plates, ribs, hatches, sequenced lights), and up
// top the olive hangar decks, the hammerhead bridge on its tower, the lattice mast, and the aft deckhouse.
import * as THREE from 'three';
import { Builder, TAU, type V, type Skin } from './geo';
import { V3, railing, ladder, flood, rcs, pipe, whip, dish, ventBox, hatch, decal, craft, type Ctx, type SkinFn } from './kit';
import { NAV } from './fx';

type Sec = [number, number][];
/** a chamfered-rectangle hull section (x, y), bottom right first, counter-clockwise seen from the bow */
export const sec = (hw: number, top: number, bot: number, ct: number, cb: number): Sec => [
  [hw - cb, bot], [hw, bot + cb], [hw, top - ct], [hw - ct, top], [-hw + ct, top], [-hw, top - ct], [-hw, bot + cb], [-hw + cb, bot]];
/** clip a convex polygon to a box (Sutherland-Hodgman) */
function clip(p: Sec, x0: number, x1: number, y0: number, y1: number): Sec {
  const planes: [(q: [number, number]) => number, (a: [number, number], b: [number, number]) => [number, number]][] = [];
  const cut = (k: 0 | 1, v: number, keepAbove: boolean) => {
    planes.push([(q) => (keepAbove ? q[k] - v : v - q[k]), (a, b) => { const t = (v - a[k]) / (b[k] - a[k]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }]);
  };
  cut(0, x0, true); cut(0, x1, false); cut(1, y0, true); cut(1, y1, false);
  let out = p;
  for (const [d, ix] of planes) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length], da = d(a), db = d(b);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) out.push(ix(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

export const FORE = { z0: -44, z1: 64, hw: 18, top: 12, bot: -21, ct: 3, cb: 5 };
const M = FORE;

export interface ForeOut { radar: Builder; dishS: Builder; dishL: Builder; dishR: Builder; crane: Builder; anchors: Record<string, V> }

export function buildFore(C: Ctx): ForeOut {
  const { B, L, s } = C;
  const hullA = s('hullA'), hullB = s('hullB'), olive = s('olive'), deck = s('deck'), truss = s('truss', 32), gun = s('gunT', 32), steel = s('steelC', 8), dark = s('dark', 1);
  const fx = C.fx;
  const S = sec(M.hw, M.top, M.bot, M.ct, M.cb);

  // ================================================================ the main shell, its aft taper and the front face round the mouth
  const shell = (b: Builder) => {
    b.loft(hullA, [{ z: -50, pts: sec(13, 9, -16, 3, 4) }, { z: M.z0, pts: S }, { z: 58, pts: S }, { z: M.z1, pts: S }], { caps: false });
    b.poly(hullA, sec(13, 9, -16, 3, 4).map(([x, y]) => new V3(x, y, -50)), new V3(0, -1, 0));
    const face = [clip(S, -30, 30, -30, -15.45), clip(S, -30, -9.3, -15.45, -2.05), clip(S, 9.3, 30, -15.45, -2.05), clip(S, -30, 30, -2.05, 30)];
    for (const f of face) if (f.length >= 3) b.poly(hullA, f.map(([x, y]) => new V3(x, y, M.z1)), new V3(0, -4, 0));
  };
  shell(B); shell(L);

  // ================================================================ the mouth frame (armoured jambs, lintel, sill), hazard edging, lettering
  const fz0 = 62.4, fz1 = 66;
  for (const sx of [-1, 1]) B.boxAt(hullB, sx * 9.32, -18.6, fz0, sx * 13.8, 1.6, fz1, { bev: 0.3 });
  B.boxAt(hullB, -13.8, -2.04, fz0, 13.8, 1.6, fz1, { bev: 0.3 });
  B.boxAt(hullB, -13.8, -18.6, fz0, 13.8, -15.46, fz1, { bev: 0.3 });
  L.boxAt(hullB, -13.8, -18.6, fz0, 13.8, 1.6, fz1 - 3.5);
  // hazard bands round the opening (on the frame's front face), and the inner lip
  const haz = s('haz', 16), hazR = s('hazRed', 16);
  B.in(0, -1.7, fz1 + 0.01, 0, 0, 0, () => B.panel(haz, 19.2, 0.5));
  B.in(0, -15.85, fz1 + 0.01, 0, 0, 0, () => B.panel(haz, 19.2, 0.5));
  for (const sx of [-1, 1]) B.in(sx * 9.65, -8.75, fz1 + 0.01, 0, 0, Math.PI / 2, () => B.panel(haz, 13.4, 0.5));
  // the frame's face plates: bolted doublers either side, an amber traffic lamp column, the bay number
  for (const sx of [-1, 1]) {
    for (let y = -16; y < 0; y += 4.2) B.boxAt(hullA, sx * 10.4, y, fz1, sx * 13.2, y + 3.6, fz1 + 0.25, { bev: 0.08 });
    for (let k = 0; k < 4; k++) fx.halos.push({ p: new V3(sx * 11.8, -14.4 + k * 3.6, fz1 + 0.5), col: NAV.amber, size: 0.9, mode: 3, ph: k * 0.06 });
    for (let k = 0; k < 4; k++) B.in(sx * 11.8, -14.4 + k * 3.6, fz1 + 0.3, Math.PI / 2, 0, 0, () => B.cyl(s('lensAmber', 1), 0.28, 0.28, 0.2, 8));
  }
  for (const [y, gapC] of [[-2.5, false], [-15.0, true]] as [number, boolean][]) for (let k = 0; k < 6; k++) {
    const x0 = -9.2 + k * 3.07, x1 = x0 + 2.6;
    if (gapC && x1 > -2 && x0 < 2) continue;
    B.in((x0 + x1) / 2, y, 63.9, 0, 0, Math.PI / 2, () => { B.cyl(hullB, 0.55, 0.55, x1 - x0, 12); B.at(0, (x1 - x0) / 2 - 0.15, 0); B.cyl(gun, 0.62, 0.62, 0.3, 12); B.pop(); });
  }
  decal(B, s, 'tBay', new V3(0, -0.2, fz1 + 0.02), new V3(0, 0, 1), 9.6);
  for (const sx of [-1, 1]) {
    B.boxAt(hullB, sx * 11.6 - 0.9, -1.95, fz1, sx * 11.6 + 0.9, 1.45, fz1 + 0.7, { bev: 0.1 });
    B.boxAt(hullB, sx * 11.6 - 1.0, 1.45, fz1, sx * 11.6 + 1.0, 1.65, fz1 + 1.3);
    for (const [k, lens, col] of [[0, 'lensRed', NAV.red], [1, 'lensAmber', NAV.amber], [2, 'lensGreen', NAV.green]] as [number, string, [number, number, number]][]) {
      const y = 0.85 - k * 1.1;
      B.in(sx * 11.6, y, fz1 + 0.72, Math.PI / 2, 0, 0, () => B.cyl(s(lens, 1), 0.38, 0.38, 0.06, 10));
      fx.halos.push({ p: new V3(sx * 11.6, y, fz1 + 0.95), col, size: 1.1, mode: k === 2 ? 0 : 1, ph: k * 1.3 + (sx > 0 ? 0.6 : 0) });
    }
  }
  // floods on the frame top, raking down across the mouth onto the apron
  for (const sx of [-1, 1]) flood(C, new V3(sx * 12.4, 2.6, fz1 - 0.6), new V3(sx * 4, -15.5, 74), { len: 16, spread: 0.3, pool: { n: new V3(0, 1, 0), w: 7, h: 9, at: new V3(sx * 4, -15.5, 71) } });

  // ================================================================ the apron (chin) the pod launches over
  const apron = (b: Builder) => b.loft(deck, [{ z: 62, pts: sec(15.5, -15.5, -21, 0.4, 3.5) }, { z: 72, pts: sec(13.5, -15.5, -19.8, 0.4, 2.6) }, { z: 77, pts: sec(10, -15.5, -18.4, 0.4, 1.6) }]);
  apron(B); apron(L);
  // flush launch rails, hazard edging, approach lights chasing toward the lip
  for (const sx of [-1, 1]) B.boxAt(dark, sx * 0.6, -15.52, 64, sx * 0.9, -15.47, 76.6);
  B.in(0, -15.47, 76.7, -Math.PI / 2, 0, 0, () => B.panel(haz, 19, 0.5));
  for (let k = 0; k < 6; k++) for (const sx of [-1, 1]) {
    const z = 65 + k * 2.2; fx.halos.push({ p: new V3(sx * 3.2, -15.2, z), col: NAV.amber, size: 0.7, mode: 3, ph: k * 0.035 });
    B.in(sx * 3.2, -15.45, z, 0, 0, 0, () => B.box(s('lensAmber', 1), 0.35, 0.12, 0.35));
  }
  decal(B, s, 'tDanger', new V3(-7.5, -15.45, 70), new V3(0, 1, 0), 6.5, new V3(1, 0, 0));
  decal(B, s, 'tDanger', new V3(7.5, -15.45, 70), new V3(0, 1, 0), 6.5, new V3(-1, 0, 0));
  for (const sx of [-1, 1]) rcs(B, s, new V3(sx * 11.5, -18.2, 72.5), new V3(sx, -0.4, 0.3).normalize());

  // ================================================================ the brow over the mouth: hull number, searchlight, sensor blisters
  const browSt = [{ z: 62, pts: sec(17, 12, -2.05, 4, 1.2) }, { z: 72, pts: sec(14.5, 11.2, -1.7, 4, 1.2) }, { z: 82, pts: sec(10.5, 9.2, -0.7, 3.4, 1.0) }, { z: 90, pts: sec(6, 6.8, 0.6, 2.2, 0.8) }, { z: 95.5, pts: sec(2.4, 4.6, 1.9, 1.0, 0.5) }];
  B.loft(hullA, browSt); L.loft(hullA, browSt);
  // armour chines along the brow's flanks, an upper strake
  const hwAt = (z: number) => { for (let i = 0; i < browSt.length - 1; i++) { const a = browSt[i], b = browSt[i + 1]; if (z <= b.z) { const t = (z - a.z) / (b.z - a.z); return { hw: a.pts[1][0] + (b.pts[1][0] - a.pts[1][0]) * t, slope: (b.pts[1][0] - a.pts[1][0]) / (b.z - a.z) }; } } return { hw: 2.4, slope: -0.6 }; };
  for (const sx of [-1, 1]) {
    for (let i = 0; i < browSt.length - 2; i++) {
      const a = browSt[i], b = browSt[i + 1];
      B.beam(hullB, new V3(sx * (a.pts[1][0] + 0.25), 1.2 - i * 0.2, a.z), new V3(sx * (b.pts[1][0] + 0.25), 1.2 - (i + 1) * 0.2, b.z), 0.7, 1.1);
    }
    const h = hwAt(77), n = new V3(sx, 0, -h.slope).normalize();
    decal(B, s, 'tHull', new V3(sx * h.hw, 5.0, 77), n, 0);
    const h3 = hwAt(86.6);
    decal(B, s, 't01', new V3(sx * h3.hw, 2.9, 86.6), new V3(sx, 0, -h3.slope).normalize(), 0);
    const h2 = hwAt(66.5);
    decal(B, s, 'insignia', new V3(sx * h2.hw, 6.2, 66.0), new V3(sx, 0, -h2.slope).normalize(), 0);
    rcs(B, s, new V3(sx * 6.4, 6.2, 88.5), new V3(sx, 0.35, 0.2).normalize());
    // sensor blisters under the brow
    B.in(sx * 4.5, -0.55, 80, Math.PI, 0, 0, () => B.sphere(s('glass', 1), 1.3, 12, 4, { t0: 0, t1: Math.PI / 2 }));
    B.in(sx * 4.5, -0.6, 80, 0, 0, 0, () => B.cyl(gun, 1.45, 1.45, 0.3, 12));
  }
  for (let k = 0; k < 7; k++) {
    const za = 63 + k * 4.4, zb = za + 3.9, ya = 12.15 - Math.max(0, za - 72) * 0.24, yb = 12.15 - Math.max(0, zb - 72) * 0.24;
    B.push(new THREE.Matrix4().makeRotationX(Math.atan2(ya - yb, zb - za)).setPosition(0, (ya + yb) / 2 + 0.2, (za + zb) / 2)); B.box(hullB, 2.6, 0.4, 3.8, { bev: 0.1 }); B.pop();
  }
  for (const sx of [-1, 1]) {
    B.in(sx * 3.6, 11.3, 74.5, 0, 0, 0, () => { B.cyl(gun, 0.9, 1.0, 0.5, 12); B.at(0, 0.25, 0); B.sphere(s('glass', 1), 0.8, 12, 5, { t0: 0, t1: Math.PI / 2 }); B.pop(); });
    flood(C, new V3(sx * 9.4, 11.6, 66.5), new V3(sx * 13.0, 5.2, 77), { len: 12, spread: 0.3, pool: { n: new V3(sx, 0, -0.4).normalize(), w: 7, h: 10, at: new V3(sx * 12.4, 5.0, 77) } });
  }
  // the bow searchlight in its armoured hood, a white strobe on the tip
  flood(C, new V3(0, 3.4, 95.6), new V3(0, -2, 160), { len: 60, spread: 0.13, k: 0.8 });
  B.boxAt(hullB, -1.4, 4.2, 93.4, 1.4, 5.0, 96.6, { bev: 0.15 });
  fx.halos.push({ p: new V3(0, 5.4, 95.2), col: NAV.white, size: 2.4, mode: 2, ph: 0.3 });
  // deck edge on the brow: a fairlead rail
  railing(B, steel, new V3(-6, 12.1, 63), new V3(6, 12.1, 63));

  // ================================================================ flanks
  for (const sx of [-1, 1]) {
    const X = sx * M.hw, out = new V3(sx, 0, 0);
    // armour belt: two courses of bevelled plates proud of the shell, staggered
    for (const [y0, y1, off] of [[-16.6, -10.1, 0], [-10.0, -3.2, 3.5]] as [number, number, number][]) {
      let z = -42 + off;
      for (let k = 0; z < 61; k++) {
        const len = [8.5, 10, 7.2, 9.4, 11, 8][(k + (sx > 0 ? 2 : 0)) % 6], z1 = Math.min(61.5, z + len);
        B.boxAt(hullB, X, y0, z, X + sx * 0.4, y1, z1 - 0.22, { bev: 0.12 });
        z = z1;
      }
    }
    L.boxAt(hullB, X, -16.6, -42, X + sx * 0.4, -3.2, 61.5);
    // the rubbing strake and the conduits above the belt
    B.boxAt(hullB, X, -2.9, -44, X + sx * 0.7, -2.1, 63.6, { bev: 0.15 });
    pipe(B, s('pipeRed', 32), gun, [new V3(X + sx * 0.5, -1.4, -43.5), new V3(X + sx * 0.5, -1.4, 58), new V3(X + sx * 0.5, -5, 61.8)], 0.32, 3);
    pipe(B, s('pipeOlive', 32), gun, [new V3(X + sx * 0.45, -0.6, -43.5), new V3(X + sx * 0.45, -0.6, 60.5)], 0.24, 3);
    // the Corps line and the roundel on the belt, the ship's name on the upper flank
    decal(B, s, 'tCorps', new V3(X + sx * 0.4, -6.6, 2), out, 44);
    decal(B, s, 'insignia', new V3(X + sx * 0.4, -13.2, -30), out, 7.5);
    decal(B, s, 'patch', new V3(X + sx * 0.4, -13.2, 46), out, 2.6);
    decal(B, s, 'tName', new V3(X, 4.4, 45.5), out, 20);
    // portholes along the upper flank (crew decks) and on the shoulder
    B.in(X + sx * 0.03, 8.45, 9.5, 0, sx * Math.PI / 2, 0, () => B.panel(s('port', 16), 103, 1.0));
    for (const [z0, z1] of [[-40, -18], [-8, 26]] as [number, number][]) {
      const L2 = z1 - z0, nrm = new V3(sx, 1, 0).normalize();
      B.push(new THREE.Matrix4().makeBasis(new V3(0, 0, -sx), new V3(-sx, 1, 0).normalize(), nrm).setPosition(sx * 16.0 + nrm.x * 0.22, 11.0 + nrm.y * 0.22, (z0 + z1) / 2));
      B.panel(s('port', 16), L2, 1.0); B.pop();
    }
    // external stiffeners on the upper flank between the davit bays (frame spacing 4 m), a capping strake
    for (const [za, zb] of [[-43, -35], [-17.4, -12.6], [4.6, 9.4], [26.6, 34], [57, 62.6]] as [number, number][]) {
      for (let z = za; z <= zb + 0.01; z += 4) B.boxAt(hullB, X, -1.9, z - 0.22, X + sx * 0.32, 7.9, z + 0.22, { bev: 0.08 });
    }
    B.boxAt(hullB, X, 7.9, -44, X + sx * 0.45, 8.15, 63.6, { bev: 0.05 });
    // the shoulder: a course of doubler plates between the deck edge and the side
    for (let z = -43; z < 62; z += 7.5) {
      const nrm = new V3(sx, 1, 0).normalize();
      B.push(new THREE.Matrix4().makeBasis(new V3(0, 0, -sx), new V3(-sx, 1, 0).normalize(), nrm).setPosition(sx * 16.95 + nrm.x * 0.1, 10.05 + nrm.y * 0.1, z + 3.6));
      B.box(hullA, 7.1, 1.3, 0.2, { bev: 0.06 }); B.pop();
    }
    // landing-craft davit bays: a hooded niche, cradle arms, a boarding tube, lamps in the hood
    for (const [i, cz] of [[1, -26], [2, -4], [3, 18]] as [number, number][]) {
      const xo = X + sx * 5.8, X1 = X + sx * 0.1;
      B.boxAt(hullB, X1, 6.4, cz - 8, xo + sx * 0.2, 7.4, cz + 8, { bev: 0.2 });
      B.boxAt(olive, X1, 7.4, cz - 7.6, xo - sx * 0.4, 7.9, cz + 7.6, { bev: 0.1 });
      for (const dz of [-7.7, 7.7]) B.boxAt(hullB, X1, -2.0, cz + dz - 0.35, xo + sx * 0.2, 6.4, cz + dz + 0.35, { bev: 0.1 });
      B.boxAt(gun, X1, -2.4, cz - 8, xo + sx * 0.2, -1.9, cz + 8, { bev: 0.08 });
      B.boxAt(hullB, X + sx * 0.02, -1.9, cz - 7.3, X + sx * 0.12, 6.4, cz + 7.3);
      L.boxAt(hullB, X1, -2.4, cz - 8, xo, 7.4, cz + 8);
      // the craft on its cradle
      B.at(X + sx * 3.0, 2.1, cz + 0.3, 0, 0, 0, 0.8); craft(B, s, String(i)); B.pop();
      for (const dz of [-3, 2.5]) { B.beam(gun, new V3(X1, -1.4, cz + dz), new V3(X + sx * 3.0, 1.05, cz + dz), 0.25); B.beam(gun, new V3(X + sx * 1.4, 1.0, cz + dz), new V3(X + sx * 4.6, 1.0, cz + dz), 0.2); }
      pipe(B, s('pipeSteel', 32), gun, [new V3(X1, 4.6, cz - 0.5), new V3(X + sx * 0.8, 4.6, cz - 0.5), new V3(X + sx * 1.35, 3.3, cz - 0.5)], 0.5, 10, 0.4);
      for (const dz of [-4, 4]) { B.in(X + sx * 2.8, 6.3, cz + dz, 0, 0, 0, () => B.box(s('lensAmber', 1), 0.9, 0.12, 0.5)); fx.pools.push({ p: new V3(X + sx * 3.4, 4.0, cz + dz * 0.6), n: out.clone(), w: 5, h: 4, from: new V3(X + sx * 2.8, 6.3, cz + dz) }); }
      fx.halos.push({ p: new V3(xo + sx * 0.3, 6.9, cz + 8.1), col: NAV.amber, size: 0.8, mode: 0, ph: 0 });
      decal(B, s, 'tPC' + i, new V3(X1 + sx * 0.25, 7.0, cz), out, 2.4);
    }
    // the docking port: a collar on the belt, its face, guide lamps
    {
      const dz = -38, dy = -9.5, X2 = X + sx * 0.4;
      B.in(X2 + sx * 1.0, dy, dz, 0, 0, Math.PI / 2, () => { B.cyl(hullB, 2.6, 2.6, 2.0, 16); });
      B.in(X2 + sx * 2.1, dy, dz, 0, 0, Math.PI / 2, () => B.cyl(haz, 2.75, 2.75, 0.3, 16));
      B.in(X2 + sx * 2.27, dy, dz, 0, sx * Math.PI / 2, 0, () => B.panel(s('dockFace', 1), 4, 4));
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) fx.halos.push({ p: new V3(X2 + sx * 2.3, dy + a * 3.0, dz + b * 3.0), col: NAV.white, size: 0.9, mode: 0, ph: 0 });
      decal(B, s, sx < 0 ? 'tDock1' : 'tDock2', new V3(X2 + 0.0, dy + 4.6, dz), out, 3.8);
    }
    // vents over the machinery spaces, hatches with numbers, RCS quads at the corners
    for (const z of [-12, -2, 30, 40]) B.in(X + sx * 0.42, -15.2, z, 0, sx * Math.PI / 2, 0, () => ventBox(B, s, 2.4, 1.4, (z >> 1) & 1 ? 0 : 2));
    B.in(X + sx * 0.42, -12.8, 8, 0, sx * Math.PI / 2, 0, () => hatch(B, s, sx < 0 ? 7 : 8, 2.8));
    for (const [y, z] of [[10.8, 61], [10.8, -42], [-19.5, 60], [-19.5, -42]] as [number, number][]) rcs(B, s, new V3(sx * (y > 0 ? 16.9 : 15.6), y, z), new V3(sx, y > 0 ? 0.6 : -0.6, z > 0 ? 0.3 : -0.3).normalize());
    // running lights: red to port, green to starboard, mid-flank and at the bow shoulders
    for (const z of [61.6, 20, -43]) fx.halos.push({ p: new V3(sx * 15.6, 13.15, z), col: sx < 0 ? NAV.red : NAV.green, size: 1.8, mode: 1, ph: z * 0.01 });
    for (const z of [61.6, 20, -43]) B.in(sx * 15.4, 12.95, z, 0, 0, 0, () => B.box(s(sx < 0 ? 'lensRed' : 'lensGreen', 1), 0.45, 0.45, 0.8));
    // steam from the machinery vents now and then
    fx.vents.push({ p: new V3(X + sx * 0.8, -15.2, 30), dir: new V3(sx, -0.3, 0.1), period: 9 + sx * 2, ph: sx > 0 ? 2 : 6.5, size: 2.2 });
  }

  // ================================================================ keel: plates, ribs, hatches, the sequenced keel lights, the Corps letters
  {
    let z = -42;
    for (let k = 0; z < 60; k++) { const len = [9, 7.5, 10, 8][k % 4]; for (const [x0, x1] of [[-12.8, -0.15], [0.15, 12.8]]) B.boxAt(hullB, x0, -21.35, z, x1, -21.0, Math.min(61, z + len) - 0.25, { bev: 0.1 }); z += len; }
    B.boxAt(hullB, -2.8, -23, -44, 2.8, -21.3, 62, { bev: 0.4 });
    L.boxAt(hullB, -2.8, -23, -44, 2.8, -21.3, 62);
    for (let z2 = -40; z2 <= 58; z2 += 7) { const w = z2 > 31 && z2 < 47 ? 3.2 : 9; B.boxAt(gun, -w, -21.9, z2 - 0.3, w, -21.3, z2 + 0.3, { bev: 0.08 }); }
    // two ventral cargo doors: framed, ribbed leaves, hazard ends, hinge knuckles along the outboard edge
    for (const sx of [-1, 1]) {
      const xa = Math.min(sx * 3.6, sx * 12.2), xb = Math.max(sx * 3.6, sx * 12.2), za = 32, zb = 46;
      B.boxAt(hullB, xa - 0.4, -21.75, za - 0.5, xb + 0.4, -21.3, za, { bev: 0.08 }); B.boxAt(hullB, xa - 0.4, -21.75, zb, xb + 0.4, -21.3, zb + 0.5, { bev: 0.08 });
      B.boxAt(hullB, xa - 0.4, -21.75, za, xa, -21.3, zb, { bev: 0.08 }); B.boxAt(hullB, xb, -21.75, za, xb + 0.4, -21.3, zb, { bev: 0.08 });
      B.boxAt(hullA, xa + 0.05, -21.5, za + 0.05, xb - 0.05, -21.3, zb - 0.05, { bev: 0.06 });
      for (let z3 = za + 2.3; z3 < zb - 1; z3 += 2.35) B.boxAt(gun, xa + 0.6, -21.68, z3 - 0.14, xb - 0.6, -21.5, z3 + 0.14, { bev: 0.04 });
      for (const zz of [za + 0.55, zb - 0.55]) B.in((xa + xb) / 2, -21.52, zz, Math.PI / 2, 0, 0, () => B.panel(haz, xb - xa - 0.4, 0.5));
      for (let k = 0; k < 4; k++) B.in(sx * 12.35, -21.8, za + 1.5 + k * 3.6, Math.PI / 2, 0, 0, () => B.cyl(gun, 0.28, 0.28, 1.6, 8));
      decal(B, s, sx < 0 ? 't4' : 't5', new V3((xa + xb) / 2, -21.72, za + 3.2), new V3(0, -1, 0), 1.8, new V3(0, 0, 1));
    }
    for (let k = 0; k < 18; k++) {
      const zz = -40 + k * 5.8;
      fx.halos.push({ p: new V3(0, -23.3, zz), col: NAV.amber, size: 1.3, mode: 3, ph: k * 0.03 });
      B.in(0, -23.05, zz, 0, 0, 0, () => B.box(s('lensAmber', 1), 0.5, 0.15, 0.5));
    }
    for (const [x, z, n] of [[-7, -20, 1], [7, -20, 2], [-7, 24, 3], [7, 24, 4], [-7, 52, 5], [7, 52, 6]] as [number, number, number][]) B.in(x, -21.4, z, Math.PI / 2, 0, 0, () => hatch(B, s, n, 3.2));
    decal(B, s, 'tUSPC', new V3(-7.6, -21.4, 10), new V3(0, -1, 0), 18, new V3(-1, 0, 0));
    decal(B, s, 'tCorps', new V3(7.6, -21.4, 6), new V3(0, -1, 0), 26, new V3(1, 0, 0));
    for (const sx of [-1, 1]) decal(B, s, 'insignia', new V3(sx * 7.5, -21.4, -32), new V3(0, -1, 0), 8, new V3(0, 0, 1));
    decal(B, s, 'tNoStep', new V3(-7.2, -21.52, 40.2), new V3(0, -1, 0), 3, new V3(0, 0, 1));
    // dipole antenna array and a sensor dome under the keel, aft
    for (let k = 0; k < 6; k++) { const zz = -36 + k * 2.4; B.beam(steel, new V3(-4.5, -23.6, zz), new V3(4.5, -23.6, zz), 0.06); B.beam(steel, new V3(0, -23, zz), new V3(0, -23.6, zz), 0.05); }
    B.in(0, -23, 46, Math.PI, 0, 0, () => B.sphere(s('glass', 1), 1.9, 14, 5, { t0: 0, t1: Math.PI / 2 }));
    flood(C, new V3(-3.6, -22.6, -43), new V3(-8, -21.4, -24), { len: 14, spread: 0.3, pool: { n: new V3(0, -1, 0), w: 5, h: 8, at: new V3(-7, -21.4, -30) } });
  }

  // ================================================================ deck plating on top, deck edge rails
  B.boxAt(deck, -15, 12, -44, 15, 12.15, 62);
  for (const sx of [-1, 1]) {
    for (const z of [-36, -24, -12, 0, 12, 26]) B.in(sx * 13.2, 12.15, z, 0, 0, 0, () => { B.cyl(gun, 0.45, 0.45, 1.3, 10); B.at(0, 0.85, 0); B.cyl(s('hullB', 16), 0.85, 0.7, 0.45, 10); B.pop(); });
    for (const z of [8, 30]) B.in(sx * 12.6, 12.15, z, 0, 0, 0, () => { B.cyl(gun, 0.3, 0.32, 0.9, 8); B.at(0.7, 0, 0); B.cyl(gun, 0.3, 0.32, 0.9, 8); B.pop(); B.at(0.35, 0.3, 0); B.box(gun, 1.3, 0.2, 0.5); B.pop(); });
    railing(B, steel, new V3(sx * 14.6, 12.15, -43), new V3(sx * 14.6, 12.15, 31));
    B.boxAt(hullB, sx * 14.8, 12.0, -44, sx * 15.3, 12.7, 62.2, { bev: 0.1 });
  }

  // ================================================================ the hangar decks (olive): two tiers, rolling doors, a deck crane
  {
    const hz0 = 32, hz1 = 62;
    B.boxAt(olive, -13, 12.1, hz0, 13, 17.6, hz1, { bev: 0.35 });
    B.boxAt(olive, -9.2, 17.6, hz0 + 4, 9.2, 22, hz1 - 3.5, { bev: 0.3 });
    L.boxAt(olive, -13, 12.1, hz0, 13, 17.6, hz1); L.boxAt(olive, -9.2, 17.6, hz0 + 4, 9.2, 22, hz1 - 3.5);
    B.boxAt(deck, -9.0, 22, hz0 + 4.2, 9.0, 22.12, hz1 - 3.7);
    B.boxAt(deck, -12.8, 17.6, hz0 + 0.2, 12.8, 17.7, hz1 - 0.2);
    for (const sx of [-1, 1]) {
      // rolling doors: ribbed leaves in a frame, hazard-striped sill, a number
      for (const [cz, n] of [[39.5, sx < 0 ? 3 : 4], [53.5, sx < 0 ? 5 : 6]] as [number, number][]) {
        B.boxAt(hullB, sx * 13, 12.4, cz - 5.2, sx * 13.25, 17.2, cz + 5.2, { bev: 0.06 });
        for (let k = -4.5; k <= 4.5; k += 0.75) B.boxAt(s('oliveC', 4), sx * 13.2, 12.6, cz + k - 0.3, sx * 13.42, 16.9, cz + k + 0.3, { bev: 0.05 });
        B.in(sx * 13.45, 12.5, cz, 0, sx * Math.PI / 2, 0, () => B.panel(haz, 10.4, 0.5));
        decal(B, s, 't' + n, new V3(sx * 13.43, 15.9, cz + 6.3), new V3(sx, 0, 0), 1.6);
      }
      // the upper tier's windows (offices over the hangar), railings round the tier-1 roof
      B.in(sx * 9.22, 19.6, 46.75, 0, sx * Math.PI / 2, 0, () => B.panel(s('winA', 16), 20, 1.5));
      railing(B, steel, new V3(sx * 12.6, 17.7, hz0 + 0.6), new V3(sx * 12.6, 17.7, hz1 - 0.6));
      railing(B, steel, new V3(sx * 8.8, 22.12, hz0 + 4.6), new V3(sx * 8.8, 22.12, hz1 - 4));
      ladder(B, steel, sx * 9.25, hz0 + 6, 17.7, 22, new V3(sx, 0, 0));
      // deck floods on the tier roof, lighting the flank lettering
      flood(C, new V3(sx * 12.2, 18.9, 58), new V3(sx * 18.2, 4.6, 46), { len: 16, spread: 0.3, pool: { n: new V3(sx, 0, 0), w: 18, h: 8, at: new V3(sx * 18.05, 4.4, 45) } });
      // red/green running lights on the hangar corners
      fx.halos.push({ p: new V3(sx * 13.3, 18.0, 62.1), col: sx < 0 ? NAV.red : NAV.green, size: 1.4, mode: 1, ph: 1.1 });
    }
    // the front: control room windows looking over the brow, a big "2" for the bay below
    for (const b of [B, L]) b.in(0, 15.3, hz1 + 0.02, 0, 0, 0, () => b.panel(s('winB', 16), 22, 1.5));
    B.in(0, 20.2, hz1 - 3.48, 0, 0, 0, () => B.panel(s('winA', 16), 16, 1.5));
    decal(B, s, 't2', new V3(-6, 22.13, 50), new V3(0, 1, 0), 3.2, new V3(0, 0, 1));
    // the tug's pad on the tier-2 roof: hazard border, amber edge lamps
    for (const [x, z, w, h, r] of [[-4, 46.5, 8, 0.5, 0], [-4, 57.5, 8, 0.5, 0], [-8, 52, 11, 0.5, 1], [0, 52, 11, 0.5, 1]] as [number, number, number, number, number][]) B.in(x, 22.14, z, -Math.PI / 2, 0, r * Math.PI / 2, () => B.panel(haz, w, h));
    for (const [x, z] of [[-8, 46.5], [0, 46.5], [-8, 57.5], [0, 57.5], [-4, 46.5], [-4, 57.5]] as [number, number][]) { B.in(x, 22.2, z, 0, 0, 0, () => B.box(s('lensAmber', 1), 0.3, 0.15, 0.3)); fx.halos.push({ p: new V3(x, 22.45, z), col: NAV.amber, size: 0.8, mode: 0, ph: 0 }); }
    // tier-2 roof: vents, an antenna, steam
    for (const z of [42, 46]) B.in(-5.5, 22.1, z, -Math.PI / 2, 0, 0, () => ventBox(B, s, 2, 1.2, 1));
    fx.vents.push({ p: new V3(-5.5, 22.6, 44), dir: new V3(0, 1, -0.2), period: 11, ph: 4, size: 1.6 });
    whip(B, s, new V3(-7, 22.1, 56), 7);
  }
  // the deck crane on the tier-2 roof: slews (animated), so it is its own builder
  const crane = new Builder();
  {
    const c = crane, och = s('ochreC', 8);
    c.cyl(gun, 1.0, 1.25, 1.2, 12); c.at(0, 1.3, 0); c.box(och, 2.2, 1.6, 2.8, { bev: 0.15 }); c.pop();
    c.at(0.7, 1.5, 1.42); c.panel(s('glass', 1), 0.8, 0.6); c.pop();
    c.beam(och, new V3(0, 1.6, -0.6), new V3(0, 10.5, 7.5), 0.38, 0.5);
    c.beam(och, new V3(0, 2.4, -1.3), new V3(0, 10.5, 7.5), 0.1);
    c.rod(s('rubber', 1), new V3(0, 10.4, 7.6), new V3(0, 5.2, 7.7), 0.04, 4);
    c.at(0, 4.9, 7.7); c.box(gun, 0.6, 0.6, 0.6, { bev: 0.08 }); c.pop();
    c.at(0, 2.4, -1.6); c.box(gun, 1.6, 1.0, 1.0, { bev: 0.1 }); c.pop();
  }
  const craneAt = new V3(4.8, 22.12, 44);

  // ================================================================ the bridge tower and the hammerhead
  const TZ0 = 14, TZ1 = 30;
  B.boxAt(hullA, -5.6, 12.1, TZ0 + 1, 5.6, 33.2, TZ1 - 2, { bev: 0.4 });
  L.boxAt(hullA, -5.6, 12.1, TZ0 + 1, 5.6, 33.2, TZ1 - 2);
  for (let y = 15; y < 33; y += 4.5) B.boxAt(hullB, -5.85, y, TZ0 + 0.8, 5.85, y + 0.4, TZ1 - 1.8, { bev: 0.1 });
  for (const sx of [-1, 1]) {
    for (const y of [17.2, 21.7, 26.2, 30.7]) B.in(sx * 5.62, y - 1.0, 22, 0, sx * Math.PI / 2, 0, () => B.panel(s('port', 16), 11, 1.0));
    // knee braces under the hammer
    B.beam(hullB, new V3(sx * 5.6, 24, 21.5), new V3(sx * 17, 33, 21.5), 0.9, 1.2);
    B.beam(gun, new V3(sx * 5.6, 28, 16), new V3(sx * 12, 33, 16), 0.4);
  }
  ladder(B, steel, 0, TZ0 + 0.95, 12.2, 33, new V3(0, 0, -1));
  pipe(B, s('pipeSteel', 32), gun, [new V3(3.4, 12.2, TZ0 + 0.7), new V3(3.4, 32.8, TZ0 + 0.7), new V3(3.4, 33.6, TZ0 - 0.4)], 0.35, 2.5, 0.5);
  pipe(B, s('pipeOlive', 32), gun, [new V3(-3.2, 12.2, TZ0 + 0.7), new V3(-3.2, 32.8, TZ0 + 0.7), new V3(-3.2, 33.6, TZ0 - 0.4)], 0.28, 2.5, 0.5);
  for (const y of [18, 26]) B.in(-2.2, y, TZ0 + 0.95, 0, Math.PI, 0, () => ventBox(B, s, 1.6, 1.0, 0));
  B.in(0, 20, TZ1 - 1.97, 0, 0, 0, () => hatch(B, s, 1, 2.4));
  // the hammerhead: a raked glazing band across the front, decks of windows round the sides and back
  const HW = 24, hamSec: [number, number][] = [[14, 33], [28, 33], [28.4, 35], [30, 39.8], [29.6, 40.5], [14, 40.5]];
  B.push(new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(0, 1, 0), new V3(1, 0, 0)));
  B.prism(hullA, hamSec.map(([z, y]) => [z, y]), -HW, HW);
  B.pop();
  L.push(new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(0, 1, 0), new V3(1, 0, 0)));
  L.prism(hullA, hamSec.map(([z, y]) => [z, y]), -HW, HW);
  L.pop();
  {
    // raked glazing: up the face (0, .949, .316), out (0, -.316, .949)
    const up = new V3(0, 0.949, 0.316), n = new V3(0, -0.316, 0.949);
    B.push(new THREE.Matrix4().makeBasis(new V3(1, 0, 0), up, n).setPosition(0, 37.4 + n.y * 0.04, 29.2 + n.z * 0.04));
    B.panel(s('winBridge', 16), HW * 2 - 0.4, 4.5); B.pop();
    L.push(new THREE.Matrix4().makeBasis(new V3(1, 0, 0), up, n).setPosition(0, 37.4 + n.y * 0.04, 29.2 + n.z * 0.04)); L.panel(s('winBridge', 16), HW * 2 - 0.4, 4.5); L.pop();
    // mullion posts across the glazing, the visor, the lower deck windows
    for (let x = -HW + 2; x <= HW - 2; x += 4) B.beam(hullB, new V3(x, 35.1, 28.55), new V3(x, 39.7, 30.05), 0.18, 0.18);
    B.boxAt(hullB, -HW - 0.2, 40.4, 28.6, HW + 0.2, 41.0, 31.0, { bev: 0.1 });
    B.in(0, 34.0, 28.03, 0, 0, 0, () => B.panel(s('winA', 16), HW * 2 - 1, 1.5));
    for (const sx of [-1, 1]) {
      B.in(sx * (HW + 0.02), 37.45, 22, 0, sx * Math.PI / 2, 0, () => B.panel(s('winBridge', 16), 14, 4.5));
      B.in(sx * (HW + 0.02), 34.2, 22, 0, sx * Math.PI / 2, 0, () => B.panel(s('winA', 16), 14, 1.5));
    }
    B.in(0, 37.2, 13.98, 0, Math.PI, 0, () => B.panel(s('winB', 16), HW * 2 - 2, 1.5));
    B.in(0, 34.5, 13.98, 0, Math.PI, 0, () => B.panel(s('port', 16), HW * 2 - 2, 1.0));
    // belt courses round the hammer
    for (const y of [33.0, 35.9, 40.4]) B.boxAt(hullB, -HW - 0.15, y - 0.2, 13.85, HW + 0.15, y + 0.2, y > 40 ? 29.8 : y > 35 ? 29.2 : 28.25, { bev: 0.06 });
    // the roof deck with railings
    B.boxAt(deck, -HW + 0.3, 40.5, 14.3, HW - 0.3, 40.62, 29.4);
    railing(B, steel, new V3(-HW + 0.6, 40.62, 14.6), new V3(HW - 0.6, 40.62, 14.6));
    railing(B, steel, new V3(-HW + 0.6, 40.62, 28.9), new V3(HW - 0.6, 40.62, 28.9));
    for (const sx of [-1, 1]) railing(B, steel, new V3(sx * (HW - 0.6), 40.62, 14.6), new V3(sx * (HW - 0.6), 40.62, 28.9));
    // bridge wings: open platforms past the ends, a searchlight each, running lights at the tips
    for (const sx of [-1, 1]) {
      const X0 = sx * HW, X1 = sx * (HW + 4);
      B.boxAt(hullB, X0, 35.7, 20, X1, 36.2, 29.5, { bev: 0.08 });
      B.beam(gun, new V3(X0, 34, 21), new V3(X1 - sx * 0.4, 35.7, 21), 0.18); B.beam(gun, new V3(X0, 34, 28.6), new V3(X1 - sx * 0.4, 35.7, 28.6), 0.18);
      railing(B, steel, new V3(X1 - sx * 0.2, 36.2, 20.2), new V3(X1 - sx * 0.2, 36.2, 29.3));
      railing(B, steel, new V3(X0, 36.2, 29.3), new V3(X1 - sx * 0.2, 36.2, 29.3));
      flood(C, new V3(X1 - sx * 1.2, 37.5, 28.4), new V3(sx * 7, 22.2, 50), { len: 26, spread: 0.2, pool: { n: new V3(0, 1, 0), w: 8, h: 13, at: new V3(sx * 6.5, 22.2, 49) } });
      fx.halos.push({ p: new V3(X1 + sx * 0.1, 37.0, 25), col: sx < 0 ? NAV.red : NAV.green, size: 2.2, mode: 1, ph: 0 });
      B.in(X1, 36.9, 25, 0, 0, Math.PI / 2, () => B.cyl(s(sx < 0 ? 'lensRed' : 'lensGreen', 1), 0.4, 0.4, 0.5, 8));
    }
    // whips and the two tracking dishes on the roof (dishes animate: own builders)
    for (const [x, z, h] of [[-20, 16, 9], [-9, 15.5, 7], [9, 15.5, 11], [20, 16, 8], [-14, 27.5, 6]] as [number, number, number][]) whip(B, s, new V3(x, 40.62, z), h);
    for (const sx of [-1, 1]) { B.in(sx * 16, 40.62, 22.5, 0, 0, 0, () => { B.cyl(gun, 1.2, 1.5, 0.8, 10); B.at(0, 1.4, 0); B.cyl(s('hullB', 16), 0.35, 0.45, 2.0, 8); B.pop(); }); }
  }
  const dishL = new Builder(), dishR = new Builder();
  for (const d of [dishL, dishR]) { d.at(0, 0, 0, -0.9, 0, 0); dish(d, s, 2.6); d.pop(); d.at(0, -0.6, 0); d.box(s('gunT', 32), 0.8, 0.8, 0.8, { bev: 0.1 }); d.pop(); }

  // ================================================================ the lattice mast, its yardarm, search dish turret, radar, strobe
  const MZ = 21.5, my0 = 40.6, my1 = 61;
  {
    const leg = (k: number, y: number) => { const w = 1.6 - ((y - my0) / (my1 - my0)) * 1.1; return [[-w, -w], [w, -w], [w, w], [-w, w]][k] as [number, number]; };
    for (let k = 0; k < 4; k++) { const [x0, z0] = leg(k, my0), [x1, z1] = leg(k, my1); B.beam(truss, new V3(x0, my0, MZ + z0), new V3(x1, my1, MZ + z1), 0.16); }
    for (let y = my0 + 1.5; y < my1; y += 2.9) {
      for (let k = 0; k < 4; k++) {
        const [xa, za] = leg(k, y), [xb, zb] = leg((k + 1) % 4, y), [xc, zc] = leg((k + 1) % 4, y + 2.9);
        B.beam(steel, new V3(xa, y, MZ + za), new V3(xb, y, MZ + zb), 0.07);
        if (y + 2.9 < my1) B.beam(steel, new V3(xa, y, MZ + za), new V3(xc, y + 2.9, MZ + zc), 0.05);
      }
    }
    L.boxAt(truss, -0.8, my0, MZ - 0.8, 0.8, my1, MZ + 0.8);
    // platforms: the dish turret at 50, the yardarm at 58, the radar head at the top
    B.boxAt(deck, -2.0, 49.6, MZ - 2.0, 2.0, 49.9, MZ + 7.4, { bev: 0.05 });
    for (const sx of [-1, 1]) B.beam(gun, new V3(sx * 1.4, 46.6, MZ + 1.4), new V3(sx * 1.6, 49.6, MZ + 7.0), 0.15);
    B.beam(truss, new V3(-7, 56, MZ), new V3(7, 56, MZ), 0.22);
    for (const x of [-6.4, -3.6, 3.6, 6.4]) { B.rod(steel, new V3(x, 56, MZ), new V3(x, 53.4, MZ), 0.035, 4); for (let k = 0; k < 4; k++) B.beam(steel, new V3(x - 0.5 + k * 0.05, 53.8 + k * 0.6, MZ), new V3(x + 0.5 - k * 0.05, 53.8 + k * 0.6, MZ), 0.03); }
    for (const sx of [-1, 1]) { fx.halos.push({ p: new V3(sx * 7.1, 56.3, MZ), col: NAV.warm, size: 1.1, mode: 0, ph: 0 }); B.in(sx * 7.1, 56.25, MZ, 0, 0, 0, () => B.box(s('lensAmber', 1), 0.3, 0.3, 0.3)); }
    B.in(0, my1, MZ, 0, 0, 0, () => { B.cyl(gun, 0.8, 0.9, 0.8, 10); });
    fx.halos.push({ p: new V3(0, my1 + 4.2, MZ), col: NAV.white, size: 3.2, mode: 2, ph: 0 });
    fx.halos.push({ p: new V3(0, 56.6, MZ + 0.3), col: NAV.red, size: 1.4, mode: 0, ph: 0 });
  }
  // the radar bar: a long billboard antenna on a turntable (animated)
  const radar = new Builder();
  {
    const r = radar;
    r.box(s('hullB', 16), 1.2, 0.6, 1.2, { bev: 0.1 });
    r.at(0, 1.4, 0); r.box(s('gunT', 32), 13, 1.6, 0.28, { bev: 0.06 }); r.pop();
    r.at(0, 1.4, 0.2); r.panel(s('grate', 32), 12.6, 1.4); r.pop();
    for (let x = -6; x <= 6; x += 1.5) r.beam(s('steelC', 4), new V3(x, 0.4, -0.2), new V3(x * 0.1, 0.4, -0.2).setY(0.5), 0.05);
    r.beam(s('gunT', 32), new V3(-6.2, 0.6, -0.15), new V3(6.2, 0.6, -0.15), 0.1);
  }
  // the search dish on its turret at the 50 m platform (animated)
  const dishS = new Builder();
  dishS.at(0, 2.4, 0, -1.2, 0, 0); dish(dishS, s, 3.4); dishS.pop();
  dishS.cyl(s('gunT', 32), 0.7, 0.9, 1.4, 10);
  dishS.at(0, 1.4, 0); dishS.box(s('hullB', 16), 1.4, 1.2, 1.4, { bev: 0.12 }); dishS.pop();

  // ================================================================ the aft deckhouse (crew quarters), the deep space dish, lifeboats
  {
    const z0 = -42, z1 = 10;
    B.boxAt(hullA, -11, 12.1, z0, 11, 17.2, z1, { bev: 0.4 });
    B.boxAt(hullA, -7.5, 17.2, z0 + 3, 7.5, 20.4, z1 - 12, { bev: 0.3 });
    L.boxAt(hullA, -11, 12.1, z0, 11, 17.2, z1);
    B.boxAt(deck, -10.8, 17.2, z0 + 0.2, 10.8, 17.3, z1 - 0.2);
    for (const sx of [-1, 1]) {
      L.in(sx * 11.02, 15.4, (z0 + z1) / 2, 0, sx * Math.PI / 2, 0, () => L.panel(s('winB', 16), z1 - z0 - 2, 1.5));
      for (const [y, kind] of [[15.4, 'winB'], [13.4, 'port']] as [number, string][]) B.in(sx * 11.02, y, (z0 + z1) / 2, 0, sx * Math.PI / 2, 0, () => B.panel(s(kind, 16), z1 - z0 - 2, kind === 'port' ? 1.0 : 1.5));
      B.in(sx * 7.52, 18.8, (z0 + z1 - 9) / 2, 0, sx * Math.PI / 2, 0, () => B.panel(s('port', 16), z1 - z0 - 18, 1.0));
      railing(B, steel, new V3(sx * 10.6, 17.3, z0 + 0.6), new V3(sx * 10.6, 17.3, z1 - 0.6));
      // lifeboats: escape capsules in racks along the deckhouse roof edge
      for (let k = 0; k < 4; k++) {
        const z = z0 + 6 + k * 5.5;
        B.in(sx * 9.4, 18.5, z, Math.PI / 2, 0, 0, () => { B.cyl(s('creamC', 8), 0.9, 0.9, 3.6, 10); B.at(0, 2.0, 0); B.cyl(s('redC', 8), 0.9, 0.45, 0.6, 10); B.pop(); });
        B.boxAt(gun, sx * 9.4 - 0.9, 17.3, z - 1.2, sx * 9.4 + 0.9, 17.7, z - 0.9);
      }
      for (const z of [-30, -6]) B.in(sx * 11.05, 14.8, z, 0, sx * Math.PI / 2, 0, () => ventBox(B, s, 1.8, 1.2, 0));
    }
    decal(B, s, 'tVanguard', new V3(0, 14.6, z0 - 0.02), new V3(0, 0, -1), 14);
    B.in(0, 18.8, z0 + 2.98, 0, Math.PI, 0, () => hatch(B, s, 2, 2.2));
    for (const z of [-22, -12]) B.in(3.5, 20.4, z, -Math.PI / 2, 0, 0, () => ventBox(B, s, 2.2, 1.2, 1));
    fx.vents.push({ p: new V3(3.5, 21, -17), dir: new V3(0.2, 1, 0), period: 13, ph: 8, size: 1.8 });
    for (const [x, z] of [[-4.5, -20], [-4.5, -14], [4.6, -30]] as [number, number][]) { B.in(x, 21.2, z, 0, 0, 0, () => { B.box(s('hullB', 16), 2.4, 1.6, 2.4, { bev: 0.12 }); B.at(0, 0.82, 0); B.cyl(gun, 0.95, 0.95, 0.12, 12); B.pop(); }); B.in(x, 22.06, z, -Math.PI / 2, 0, 0, () => B.panel(s('vent1', 1), 2, 1.25)); }
    B.in(5.0, 21.8, -9, 0, 0, 0, () => { B.box(s('olive', 16), 3.2, 2.8, 4.0, { bev: 0.15 }); });
    B.in(5.0, 21.6, -6.98, 0, 0, 0, () => B.panel(s('winA', 16), 2.6, 1.5));
    for (const [dx, dz, h] of [[-1, -1.2, 6], [1.1, -0.6, 4.5], [0.2, 1.3, 7.5]] as [number, number, number][]) whip(B, s, new V3(5.0 + dx, 22.8, -9 + dz), h);
    // the deep space antenna on its pedestal
    B.in(-1, 20.4, -33, 0, 0, 0, () => { B.cyl(gun, 1.6, 2.2, 1.2, 12); B.at(0, 2.0, 0); B.cyl(s('hullB', 16), 0.6, 0.8, 2.8, 10); B.pop(); });
    B.in(-1, 25.5, -33, 0.55, 0.5, 0, () => dish(B, s, 5.2, { ribs: 8 }));
    flood(C, new V3(8, 18.5, 8.5), new V3(4, 33, 20), { len: 14, spread: 0.3 });
    // the after mast: a short pole with a stern light and a whip pair
    B.in(0, 20.4, -38, 0, 0, 0, () => B.cyl(gun, 0.3, 0.4, 8, 8));
    fx.halos.push({ p: new V3(0, 28.7, -38), col: NAV.white, size: 1.6, mode: 0, ph: 0 });
    whip(B, s, new V3(1.5, 20.4, -40), 6, new V3(0.5, 0, -0.6)); whip(B, s, new V3(-1.5, 20.4, -40), 6, new V3(-0.5, 0, -0.6));
  }

  return {
    radar, dishS, dishL, dishR, crane,
    anchors: { radar: new V3(0, my1 + 0.4, MZ), dishS: new V3(0, 49.9, MZ + 4.8), dishL: new V3(-16, 43.6, 22.5), dishR: new V3(16, 43.6, 22.5), crane: craneAt, bridge: new V3(0, 37, 29), mast: new V3(0, my1, MZ) },
  };
}
export const TAU_ = TAU;
export type { Skin, SkinFn };

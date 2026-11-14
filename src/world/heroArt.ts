// Far-LOD sprites for the hero-modelled species (snap traps, pitchers, sundews, membrane sails, lure stalks,
// flowering herbs): drawn flat at 32 px/m like every plant sprite, from the master palette, outlined by hand rules.
import type { PixelCanvas } from '../limbo/gfx/pixel';
import { canvasFor, leaf, stalk, outline, type Painter } from './plantStyle';
import { rampFor, rampNamed, fillPoly } from './pixelKit';

const PX = 32;
type P2 = [number, number];

const snaptrap: Painter = (sp, h, r) => {
  // winged petioles fanning low, each holding a trap open in a V: green outside, red within, a fringe of teeth
  const pc = canvasFor(h * 1.7, h), G = rampFor(sp.leaf), A = rampNamed(sp.id % 3 ? 'ruby' : 'coral'), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(4, 6);
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1) - 0.5) * 2, L = h * PX * r.range(0.65, 0.95), tx = cx + s * L * 0.75, ty = by - L * (0.45 + (1 - Math.abs(s)) * 0.35);
    leaf(pc, [cx, by], [cx + s * L * 0.3, by - L * 0.25], [tx, ty], 1.2, G, { shape: 'strap' });
    const w = Math.max(2.5, L * 0.32);
    leaf(pc, [tx, ty], [tx - w * 0.6, ty - w * 0.5], [tx - w * 0.9, ty - w * 1.1], w * 0.42, A, { shape: 'round' });
    leaf(pc, [tx, ty], [tx + w * 0.6, ty - w * 0.5], [tx + w * 0.9, ty - w * 1.1], w * 0.42, G, { shape: 'round', rib: true });
    for (let k = 0; k < 4; k++) { pc.set(tx - w * (0.95 + k * 0.05) - 1, ty - w * (0.5 + k * 0.2), G[5]); pc.set(tx + w * (0.95 + k * 0.05) + 1, ty - w * (0.5 + k * 0.2), G[5]); }
  }
  outline(pc, G[0]);
  return pc;
};

const pitcher: Painter = (sp, h, r) => {
  // tall trumpets (or squat ground pitchers) with a rolled red lip and a hood leaning over the mouth
  const trumpet = sp.id % 2 === 0, pc = canvasFor(h * 0.9, h * 1.05), G = rampFor(sp.leaf), A = rampNamed((['ruby', 'plum', 'coral'] as const)[sp.id % 3]), cx = pc.w / 2, by = pc.h - 2;
  for (let k = 0; k < 4; k++) { const s = (k / 3 - 0.5) * 2; leaf(pc, [cx, by], [cx + s * 3, by - 3], [cx + s * h * PX * 0.35, by - 2], 1.3, G, { shape: 'strap' }); }
  const np = r.int(2, 4);
  for (let i = 0; i < np; i++) {
    const x = cx + (i / Math.max(1, np - 1) - 0.5) * pc.w * (trumpet ? 0.45 : 0.6), H = h * PX * (trumpet ? r.range(0.7, 1.0) : r.range(0.4, 0.6)), w = trumpet ? H * 0.1 : H * 0.26;
    stalk(pc, [x, by], [x, by - H * 0.5], [x, by - H], trumpet ? w * 0.4 : w * 0.7, w, trumpet ? G : A, 0);
    for (let y = 0; y < H * 0.9; y += 3) pc.set(x + (y % 6 ? 0 : 1), by - y, A[2]);
    for (let k = -Math.ceil(w) - 1; k <= Math.ceil(w) + 1; k++) { pc.set(x + k, by - H, A[k < 0 ? 4 : 3]); pc.set(x + k, by - H + 1, A[1]); }
    leaf(pc, [x + w, by - H], [x + w * 0.4, by - H - w * 1.4], [x - w * 1.2, by - H - w * 1.1], w * 0.8, A, { shape: 'heart' });
  }
  outline(pc, G[0]);
  return pc;
};

const sundew: Painter = (sp, h, r) => {
  // a flat rosette of spoon leaves, every one bristling with red hairs tipped by beads of glue
  const pc = canvasFor(h * 2.4, h * 1.2), G = rampFor(sp.leaf), A = rampNamed((['ruby', 'coral', 'rust'] as const)[sp.id % 3]), D = rampNamed('glowAmber'), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(5, 7);
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1) - 0.5) * 2, L = h * PX * r.range(0.9, 1.2), tx = cx + s * L, ty = by - 1 - (1 - Math.abs(s)) * L * 0.35;
    leaf(pc, [cx, by], [cx + s * L * 0.5, by - 1], [tx, ty], 0.8, G, { shape: 'strap' });
    leaf(pc, [cx + s * L * 0.5, by - 1 - (1 - Math.abs(s)) * L * 0.15], [cx + s * L * 0.75, ty - 1], [tx, ty], 1.6, A, { shape: 'round' });
    for (let k = 0; k < 4; k++) { const x = cx + s * L * (0.55 + k * 0.12), y = ty - 2 - (k & 1); pc.set(x, y + 1, A[3]); pc.set(x, y, D[3]); }
  }
  outline(pc, A[0]);
  return pc;
};

const sail: Painter = (sp, h, r) => {
  // scaly spines fanned from a bulbous root, translucent veined membranes stretched between them
  const pc = canvasFor(h * 1.2, h), S = rampFor(sp.trunk), M = rampFor(sp.accent), cx = pc.w / 2, by = pc.h - 2, n = r.int(4, 5);
  const tips: P2[] = [];
  for (let i = 0; i < n; i++) { const s = (i / (n - 1) - 0.5) * 2, L = h * PX * (1 - Math.abs(s) * 0.35); tips.push([cx + s * L * 0.55, by - 3 - L * (0.95 - Math.abs(s) * 0.25)]); }
  for (let i = 0; i + 1 < n; i++) fillPoly([[cx, by - 3], tips[i], [(tips[i][0] + tips[i + 1][0]) / 2, Math.min(tips[i][1], tips[i + 1][1]) + 3], tips[i + 1]], (x, y) => pc.set(x, y, M[(x + y) % 7 === 0 ? 2 : y < by - h * PX * 0.6 ? 4 : 3], 210));
  for (const t of tips) stalk(pc, [cx, by - 3], [(cx + t[0]) / 2, (by + t[1]) / 2 - 2], t, 1.2, 0.5, S, 3);
  fillPoly([[cx - 4, by], [cx - 3, by - 4], [cx + 3, by - 4], [cx + 4, by]], (x, y) => pc.set(x, y, S[y < by - 2 ? 4 : 2]));
  outline(pc, S[0]);
  return pc;
};

const lure: Painter = (sp, h, r) => {
  // a stalk spiralling up from strap leaves to a glowing faceted bulb in a ruff
  const pc = canvasFor(h * 0.7, h), G = rampFor(sp.leaf), M = rampFor(sp.accent), L = rampNamed('glowTeal'), cx = pc.w / 2, by = pc.h - 2, H = h * PX * 0.9;
  for (let k = 0; k < 4; k++) { const s = (k / 3 - 0.5) * 2; leaf(pc, [cx, by], [cx + s * 3, by - 4], [cx + s * h * PX * 0.3, by - 3], 1.2, G, { shape: 'strap' }); }
  for (let y = 0; y < H; y++) { const x = cx + Math.round(Math.sin(y * 0.55 + r.range(0, 0.01)) * 1.6 * (1 - y / H)); pc.set(x, by - y, G[y % 4 < 2 ? 4 : 2]); }
  const ty = by - H;
  for (let k = 0; k < 5; k++) { const a = (k / 4) * Math.PI; leaf(pc, [cx, ty], [cx + Math.cos(a) * 2, ty + 1], [cx + Math.cos(a) * 4.5, ty + 2.5], 1, M, { shape: 'lance' }); }
  const R = Math.max(2.2, h * PX * 0.05), oct: P2[] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39; oct.push([cx + 0.5 + Math.cos(a) * R, ty - R + Math.sin(a) * R]); }
  fillPoly(oct, (x, y) => pc.set(x, y, L[x + y < cx + ty - R ? 4 : 2]));
  pc.set(cx - 1, ty - R - 1, L[4]);
  outline(pc, G[0]);
  return pc;
};

const bloom: Painter = (sp, h, r) => {
  // a flowering herb: a leafy rosette, slender stems, open flowers drawn petal by petal, buds on the side stems
  const pc = canvasFor(h * 0.8, h), G = rampFor(sp.leaf), A = rampFor(sp.accent), Y = rampNamed('gold'), cx = pc.w / 2, by = pc.h - 2, n = r.int(2, 4);
  for (let k = 0; k < 5; k++) { const s = (k / 4 - 0.5) * 2; leaf(pc, [cx, by], [cx + s * 3, by - 4], [cx + s * h * PX * 0.28, by - 5 - (1 - Math.abs(s)) * 3], 1.8, G, { shape: 'lance', rib: true }); }
  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2, H = h * PX * (i === 0 ? 0.95 : r.range(0.6, 0.85)), tx = cx + s * h * PX * 0.22, ty = by - H;
    stalk(pc, [cx, by], [cx + s * 2, by - H * 0.5], [tx, ty], 0.6, 0.5, G, 0);
    if (i === 0 || r.chance(0.6)) {
      const np = 6, R = Math.max(2.5, h * PX * 0.09);
      for (let p = 0; p < np; p++) { const a = (p / np) * Math.PI * 2 + 0.3; leaf(pc, [tx, ty], [tx + Math.cos(a) * R * 0.5, ty + Math.sin(a) * R * 0.4], [tx + Math.cos(a) * R, ty + Math.sin(a) * R * 0.75], R * 0.35, A, { shape: 'petal' }); }
      pc.set(tx, ty, Y[5]); pc.set(tx - 1, ty, Y[4]); pc.set(tx, ty - 1, Y[6]);
    } else { pc.set(tx, ty, A[3]); pc.set(tx, ty - 1, A[4]); pc.set(tx - 1, ty, G[3]); pc.set(tx + 1, ty, G[2]); }
  }
  outline(pc, G[0]);
  return pc;
};

/** archetypes modelled whole in 3D (floraHero); these are their far sprites */
export const HERO_FLAT: Record<string, Painter> = { snaptrap, pitcher, sundew, sail, lure, bloom };
export type { PixelCanvas };

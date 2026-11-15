// Tool, unit and vital icons for the colony HUD, painted with the shared vignette painter (ui/icons.ts): each is a
// REAL TOOL drawn the way a pixel artist would, angular planes lit from the upper left, a coloured outline, a glint
// on hard things, an fx layer for beams and sparks. Names: t-* tools and buildables, v-* vitals.
import { registerHiIcon, type IconPainter } from '../icons';
import { RAMPS } from '../../art/palette';

type P = IconPainter;
const GM = RAMPS.steel, OL = RAMPS.olive, BR = RAMPS.brass, OR = RAMPS.rust, YE = RAMPS.ochre, TE = RAMPS.glowTeal, AM = RAMPS.glowAmber;
const VI = RAMPS.violet, BK = RAMPS.basalt, ST = RAMPS.stone, SO = RAMPS.soil, MO = RAMPS.moss, WA = RAMPS.water, PA = RAMPS.paper, SL = RAMPS.slate;
const RE = RAMPS.stampRed, SN = RAMPS.snow, SK = RAMPS.sky, CU = RAMPS.copper, IR = RAMPS.iron;

const ground = (p: P, y: number, r = SO) => { p.gem([0, y + 1, 6, y - 0.6, 14, y, 22, y - 0.8, 32, y + 0.4, 32, 32, 0, 32], r, { crown: 0.05, top: 0.85, gain: 0.7 }); };
const bolts = (p: P, pts: number[][], r = 0.55) => { for (const [x, y] of pts) p.rivet(x, y, r, GM); };

const ART: Record<string, (p: P) => void> = {
  // ---------------------------------------------------------------- tools
  't-scanner'(p) {
    // fan of the sweep behind
    p.under = true; for (const [r, c] of [[9, TE[3]], [12.5, TE[2]], [16, TE[1]]] as [number, number][]) p.farc(22, 8.5, r, 1.95, 2.95, c, 0, 1, -1, r > 12 ? 1 : 0); p.under = false;
    // the grip and trigger guard
    p.bevel([5, 30, 9.5, 30.5, 13, 20, 8.5, 19], OL, { w: 1 });
    p.bevel([11.5, 22, 15, 22.5, 14, 25.5, 11, 25], GM, { w: 0.6, lum: 0.4 });
    // the body: a chamfered housing tilted toward the target
    const b = p.bevel([6, 19.5, 22, 7.5, 28, 9.5, 29, 13, 13.5, 24.5, 7.5, 23], GM, { w: 1.3, lum: 0.52 });
    p.clip = b.inside;
    // the screen: a phosphor trace
    const sc = p.bevel([10.5, 18.8, 20, 11.6, 23.6, 13.4, 14, 20.6], BK, { w: 0.6, lum: 0.15 });
    p.clip = sc.inside;
    for (let i = 0; i < 9; i++) { const t = i / 8, x0 = 11.5 + t * 10.5, y0 = 18.6 - t * 6.4, w = [0, 1.4, -0.8, 2.2, -1.6, 0.9, -0.4, 1.2, 0][i]; p.fline(x0, y0 + w * 0.5, x0 + 1.3, y0 - 0.95 + [1.4, -0.8, 2.2, -1.6, 0.9, -0.4, 1.2, 0, 0][i] * 0.5, TE[4]); }
    p.clip = null;
    bolts(p, [[8.2, 21.3], [25.6, 10], [27.4, 12.4]], 0.5);
    // the antenna and its lamp
    p.seg(24.5, 8.4, 28.5, 2.5, 0.8, GM); p.glow(28.8, 2.3, 1.3, TE);
    p.box(15.5, 21, 3, 1.4, OR, { bevel: 0.3, lum: 0.6 });
  },
  't-sampler'(p) {
    ground(p, 26, ST);
    p.rock(22, 28, 6, 9, BK, { sq: 0.55 });
    // the core tube driven into the rock, the T-handle, the sample window
    p.seg(16, 3, 16, 27, 3.2, GM);
    p.seg(10, 4, 22, 4, 1.6, BR); p.ball(10, 4, 1.2, 1.2, BR, { n: 6 }); p.ball(22, 4, 1.2, 1.2, BR, { n: 6 });
    const w = p.box(14.6, 10, 2.8, 10, WA, { bevel: 0.4, lum: 0.75 });
    p.clip = w.inside; p.box(14.6, 15, 2.8, 5, SO, { bevel: 0.2, lum: 0.5 }); p.box(14.6, 13.6, 2.8, 1.4, MO, { bevel: 0.2, lum: 0.55 }); p.clip = null;
    for (const y of [8.5, 21.5]) p.box(13.8, y, 4.4, 1.3, OL, { bevel: 0.3, lum: 0.5 });
    p.box(18.5, 16, 5, 3, OR, { bevel: 0.4 }); p.fline(19.2, 17.5, 22.6, 17.5, PA[5]);
    for (const [x, y] of [[13, 27.5], [19.5, 26.8], [11, 25.5]]) p.fdot(x, y, 0.5, ST[5], ST[1]);
  },
  't-seeder'(p) {
    ground(p, 25, SO);
    // the hopper of seed pods on top
    const h = p.tank(9, 2, 12, 10, OL, { r: 2.5 });
    p.clip = h.inside; p.box(9, 2, 12, 3, GM, { bevel: 0.4, lum: 0.45 }); p.clip = null;
    const win = p.box(11.5, 6, 7, 4.2, BK, { bevel: 0.3, lum: 0.2 }); p.clip = win.inside; for (const [x, y] of [[12.8, 8.5], [14.6, 7.6], [16.4, 8.8], [17.8, 7.5], [13.8, 9.6]]) p.ball(x, y, 0.8, 0.7, YE, { n: 5 }); p.clip = null;
    // the injector barrel, pressure gauge, the trigger handle
    p.seg(15, 12, 15, 22.5, 2.6, GM); p.seg(15, 22.5, 15, 25.5, 1.2, GM);
    p.ring(21.5, 15, 1.2, 2.4, BR, { n: 7 }); p.disc(21.5, 15, 1.2, PA[5]); p.fline(21.5, 15, 22.4, 14, RE[3]); p.seg(17, 15, 19.3, 15, 0.8, BR);
    p.bevel([7, 14, 12.5, 13, 13, 16, 8, 21, 5.5, 20], OR, { w: 0.9 });
    // the seedling it leaves, a mound
    p.gem([20, 25.4, 23, 23.6, 27, 23.8, 29.5, 25.6], SO, { gain: 0.6 });
    p.seg(25, 24, 25.2, 18.5, 0.7, MO);
    p.leaf(25.2, 19.5, 30, 16, 2.6, MO, { bend: 0.2 }); p.leaf(25, 20.5, 20.6, 17.6, 2.2, MO, { bend: -0.15 });
    p.fdot(15, 26.3, 0.6, YE[4], YE[1]);
  },
  't-grab'(p) {
    // the floating rock and its field
    p.under = true; p.plate(22, 27.5, 6, 1.6, BK[1]); for (const r of [3.5, 6, 8.5]) p.farc(21, 19, r, -2.6, -0.5, VI[r > 6 ? 2 : 4], 0, 0.8, -1, r > 6 ? 1 : 0); p.under = false;
    p.rock(21.5, 19.5, 5.2, 31, ST, { cracks: 2 });
    for (const [x, y] of [[15.5, 24], [27.5, 15.5], [26, 25]]) p.fdot(x, y, 0.6, VI[5], VI[2]);
    // the coil head with four prongs
    const c = p.ring(8.5, 8.5, 2.6, 5.2, GM, { n: 9 });
    void c; p.glow(8.5, 8.5, 2.6, VI);
    for (const [a, b] of [[0.2, 1], [1.8, 1], [3.4, 1], [4.9, 1]]) { const x0 = 8.5 + Math.cos(a) * 5, y0 = 8.5 + Math.sin(a) * 5, x1 = 8.5 + Math.cos(a + 0.35) * 8 * b + 2.5, y1 = 8.5 + Math.sin(a + 0.35) * 8 * b + 2.5; p.seg(x0, y0, x1, y1, 1.1, OR); }
    p.seg(1, 1, 5, 5, 3, OL);
  },
  't-drill'(p) {
    ground(p, 24, BK);
    p.rock(24, 27, 7, 5, BK, { sq: 0.6 }); p.rock(27.5, 25.5, 1.6, 66, CU);
    // motor housing with fins, the chuck, the fluted bit
    const m = p.tank(2.5, 2.5, 11, 9, OR, { r: 2.5 });
    p.clip = m.inside; for (let i = 0; i < 4; i++) p.box(2.5 + i * 2.8, 2.5, 1, 9, OR, { bevel: 0.2, lum: 0.3 }); p.clip = null;
    p.box(9, 9, 6, 5, GM, { bevel: 0.6, lum: 0.5 });
    const bit = p.bevel([12.5, 13.2, 15.8, 11.2, 26.5, 24.5], GM, { w: 1.1, lum: 0.62 });
    p.clip = bit.inside; for (let i = 0; i < 6; i++) { const t = 0.12 + i * 0.15, x = 13.6 + 12.4 * t, y = 12.4 + 11.6 * t; p.fline(x - 2.6 * (1 - t), y + 0.8, x + 0.8, y - 2.6 * (1 - t), GM[1]); } p.clip = null;
    p.spark(24.5, 22.5, 2.8, AM[4]);
    for (const [x, y] of [[20, 20.5], [28.5, 19.5], [22, 18], [29.5, 23]]) p.fdot(x, y, 0.5, AM[3], AM[0]);
    bolts(p, [[4.5, 5], [11, 5]], 0.5);
  },
  't-weld'(p) {
    // the work: two plates and the bead
    p.gem([2, 25, 16, 21, 31, 24, 31, 31, 2, 31], SL, { crown: 0.05, top: 0.7 });
    p.fline(3, 26.5, 30, 24.6, SL[1]);
    for (let i = 0; i < 6; i++) p.fdot(4 + i * 2.2, 26.4 - i * 0.14, 0.7, i > 3 ? AM[4] : AM[2], AM[0]);
    // the torch: handle, swan neck, nozzle; the arc
    p.seg(27, 2, 21, 10, 3, OL); p.box(22.5, 4.5, 3, 1.2, GM, { lum: 0.4 });
    p.seg(21, 10, 18, 15, 1.6, BR); p.seg(18, 15, 17.2, 20, 2.2, GM);
    p.seg(30, 1, 29, 6, 1, BK);
    p.spark(17, 23.3, 4.2, TE[4], SN[5]);
    for (const [x, y] of [[13, 21], [21, 20.5], [12, 24], [22.5, 22.5], [19.5, 18]]) p.fdot(x, y, 0.45, AM[4], AM[1]);
  },
  't-lift'(p) {
    p.under = true; p.plate(22, 28.5, 6.5, 1.8, BK[1]); p.under = false;
    // the beam from the dish
    for (let i = 0; i < 4; i++) p.fline(9 + i * 0.8, 14 - i * 0.6, 19 + i * 0.9, 12 + i * 1.2, VI[3 + (i & 1)], 0, -1, 1);
    p.rock(23, 15, 5.5, 44, ST, { cracks: 1 });
    for (const [x, y] of [[23, 23.5], [18.5, 22.5], [27, 22]]) p.fline(x, y, x, y + 2.6, VI[3]);
    // the projector: a dish on a yoke
    p.seg(5, 30, 7, 20, 2.4, GM); p.box(2, 28, 9, 3, OL, { bevel: 0.6 });
    p.gem([2, 8, 8, 5, 12, 10, 11, 18, 6, 22, 2.5, 18], VI, { crown: 0.3 });
    p.ring(7.5, 13.5, 1.2, 3.2, BR, { n: 7 }); p.glow(7.5, 13.5, 1.6, VI);
  },
  't-cannon'(p) {
    // the barrel with its coil rings, the breech, the muzzle brake; the flash
    p.spark(29, 5, 3.6, AM[4], SN[5]);
    const b = p.seg(6, 25, 25.5, 7.5, 4.2, GM);
    void b;
    for (const t of [0.18, 0.32, 0.46, 0.6, 0.74]) { const x = 6 + 19.5 * t, y = 25 - 17.5 * t; p.seg(x - 1.4, y - 1.6, x + 1.4, y + 1.6, 1.1, t === 0.46 ? CU : BR); }
    p.bevel([23, 6, 26, 3, 29.5, 6.5, 26.5, 9.5], BK, { w: 0.7, lum: 0.3 });
    p.bevel([1.5, 25.5, 6.5, 20.5, 12, 26, 7, 31], OL, { w: 1.1 });
    p.tank(1, 26.5, 5, 5, CU, { r: 1.5 });
    bolts(p, [[6.6, 24.5], [8.5, 27.2]], 0.5);
    for (const [x, y] of [[26, 2.5], [31, 8], [30.5, 2]]) p.fdot(x, y, 0.45, AM[3], AM[0]);
  },
  't-carry'(p) {
    p.fline(16, 0, 16, 9, GM[2], 0.6); p.fline(16.6, 0, 16.6, 9, GM[4]);
    p.box(13.5, 8, 5, 3.4, BK, { bevel: 0.5 });
    p.seg(16, 11.4, 16, 14.5, 1.2, GM); p.ring(16, 16.3, 1.2, 2.4, GM, { n: 7 }); p.seg(16, 18.7, 19, 19.5, 1.2, GM);
    for (const [x0, y0] of [[16, 18], [16, 18]]) { p.fline(x0, y0, 7, 22, BK[3]); p.fline(x0, y0, 25, 22, BK[3]); }
    const c = p.box(6, 21.5, 20, 9.5, YE, { bevel: 1 });
    p.clip = c.inside; for (const x of [6, 15, 24]) p.box(x, 21.5, 2, 9.5, OR, { lum: 0.4, bevel: 0.3 }); p.clip = null;
    p.fline(9.5, 24.5, 13, 24.5, BK[1]); p.fline(9.5, 26, 12, 26, BK[1]);
  },
  't-claw'(p) {
    ground(p, 27, ST);
    p.box(1, 1, 8, 6, GM, { bevel: 0.8 });
    p.seg(5, 5, 13, 15, 3.2, OR); p.ball(13, 15, 2.2, 2.2, GM, { n: 7 }); p.seg(13, 15, 21, 12, 2.6, OR); p.ball(21, 12, 1.8, 1.8, GM, { n: 6 });
    p.seg(21, 12, 22.5, 18, 2.2, GM);
    p.seg(22.5, 18, 19, 24, 1.1, GM); p.seg(22.5, 18, 26, 24, 1.1, GM); p.seg(22.5, 18, 22.8, 25, 1.1, GM);
    p.seg(6, 10, 11, 11.5, 0.9, PA); p.glow(22.5, 18.5, 0.9, TE);
    p.rock(23, 27.5, 2.4, 3, CU);
  },
  // ---------------------------------------------------------------- units and structures
  't-scout'(p) {
    p.under = true; p.plate(16, 29, 9, 1.6, BK[1]); p.under = false;
    for (const [x, y] of [[5, 11], [27, 11], [8, 17], [24, 17]]) { p.ring(x, y, 2.2, 3.8, PA, { ry: 0.45, n: 8 }); p.fline(x - 3, y, x + 3, y, GM[1]); }
    p.seg(5, 11.5, 27, 11.5, 1, GM); p.seg(8, 17, 24, 17, 1, GM);
    const b = p.bevel([10, 12, 22, 12, 24, 16, 21, 20, 11, 20, 8, 16], PA, { w: 1.1 });
    p.clip = b.inside; p.box(8, 12, 16, 2.3, OR, { lum: 0.55, bevel: 0.3 }); p.clip = null;
    p.ball(16, 22, 2.2, 1.9, GM, { n: 7 }); p.glow(16, 22.5, 1.1, SK);
    p.fdot(6, 11, 0.5, RAMPS.malachite[5]); p.fdot(26, 11, 0.5, RE[4]);
  },
  't-carrier'(p) { ART['t-scout'](p); p.fline(16, 23, 16, 27, GM[2]); p.box(13, 27, 6, 4, YE, { bevel: 0.6 }); },
  't-repairdrone'(p) { ART['t-scout'](p); p.seg(19, 21, 24, 26, 1, GM); p.spark(25, 27, 2.6, TE[4]); },
  't-pole'(p) {
    ground(p, 28, ST);
    p.under = true; p.farc(16, 27, 12, Math.PI, Math.PI * 2, VI[3], 0, 0.35, -1, 1); p.farc(16, 27, 8, Math.PI, Math.PI * 2, VI[4], 0, 0.35); p.under = false;
    p.box(11, 26, 10, 3, GM, { bevel: 0.6 });
    p.tank(14, 6, 4, 21, BK, { r: 1.2 });
    for (const y of [10, 15, 20]) p.ring(16, y, 2.2, 4.4, BR, { ry: 0.35, n: 8 });
    p.glow(16, 4.5, 2.4, VI);
    for (const [x, y] of [[8, 15], [24, 12], [26, 20]]) { p.rock(x, y, 1.4, x * 3 + y, ST); p.fline(x, y + 2, x, y + 4, VI[3]); }
  },
  't-relay'(p) {
    ground(p, 29, ST);
    p.seg(10, 29, 15, 4, 1.1, PA); p.seg(22, 29, 17, 4, 1.1, PA);
    for (let i = 0; i < 6; i++) { const y = 26 - i * 4, f = 1 - (26 - y) / 26 * 0.65; p.fline(16 - 5.5 * f, y, 16 + 5.5 * f, y - 2, GM[3]); p.fline(16 + 5.5 * f, y, 16 - 5.5 * f, y - 2, GM[3]); }
    p.gem([17, 8, 24, 5, 26, 11, 20, 13], PA, { crown: 0.3 }); p.seg(16, 4, 16, 0.5, 0.5, GM); p.fdot(16, 0.8, 0.7, RE[4], RE[1]);
    p.under = true; for (const r of [3, 6]) p.farc(26, 8, r, -0.9, 0.9, TE[3], 0, 1, -1, 1); p.under = false;
  },
  't-lamp'(p) {
    ground(p, 29, ST);
    p.under = true; p.fpoly([22, 9, 30, 29, 10, 29], AM[1]); p.fpoly([22, 9, 26, 29, 15, 29], AM[2]); p.under = false;
    p.seg(9, 29, 9, 5, 1.4, PA); p.seg(9, 5, 20, 6.5, 1.1, PA);
    p.bevel([17, 5, 25, 6, 24.5, 9.5, 18, 9], OR, { w: 0.8 }); p.box(18.5, 8.6, 5.5, 1.2, AM, { lum: 0.9, bevel: 0.2 });
    p.box(6.5, 21, 5, 4, GM, { bevel: 0.5 });
  },
  't-sensor'(p) {
    ground(p, 29, ST);
    p.seg(16, 29, 16, 11, 1.8, PA); for (const y of [20, 14]) p.box(14, y, 4, 1.4, GM, { bevel: 0.3 });
    const h = p.bevel([4, 6, 28, 6, 28, 10, 4, 10], OR, { w: 0.8 }); p.clip = h.inside; p.box(5, 7, 22, 2, SL, { lum: 0.4, bevel: 0.2 }); p.clip = null;
    p.ball(16, 12.5, 2.2, 2, GM, { n: 7 }); p.glow(16, 13, 1, SK);
    p.under = true; for (const r of [4, 8]) p.farc(16, 8, r + 8, -2.4, -0.7, TE[3], 0, 0.6, -1, 1); p.under = false;
  },
  't-brace'(p) {
    ground(p, 29, ST);
    p.tank(8, 4, 16, 18, PA, { r: 4 }); p.box(8, 12, 16, 2.2, OR, { bevel: 0.3 });
    p.seg(9, 18, 2, 29, 1.6, OL); p.seg(23, 18, 30, 29, 1.6, OL); p.seg(16, 21, 16, 29, 1.6, OL);
    p.box(0.5, 28, 4, 2, GM); p.box(27.5, 28, 4, 2, GM); p.box(14, 28, 4, 2, GM);
    p.bevel([6, 15, 10, 13, 10, 22, 6, 23], OL, { w: 0.6 }); p.bevel([22, 13, 26, 15, 26, 23, 22, 22], OL, { w: 0.6 });
  },
  // ---------------------------------------------------------------- vitals
  'v-power'(p) {
    const b = p.box(8, 6, 16, 23, GM, { bevel: 1.2, r: 1.2 }); p.box(12.5, 3, 7, 3.5, BR, { bevel: 0.5 });
    p.clip = b.inside; p.box(8, 20, 16, 9, OL, { lum: 0.45 }); p.clip = null;
    p.fpoly([18, 8.5, 11.5, 18.5, 15.5, 18.5, 13.5, 26.5, 21, 15, 17, 15, 19.5, 8.5], AM[4]);
    p.fline(18, 8.5, 12, 18, AM[5]);
  },
  'v-oxygen'(p) {
    const t = p.tank(9.5, 7, 13, 23, RAMPS.sapphire, { r: 5 });
    p.clip = t.inside; p.box(9.5, 13, 13, 4, SN, { lum: 0.7, bevel: 0.3 }); p.clip = null;
    p.box(13, 3, 6, 4.5, GM, { bevel: 0.6 }); p.seg(16, 3, 22, 3, 1.4, BR); p.ring(23.5, 3, 0.6, 1.6, BR, { n: 6 });
    p.fline(11.5, 14.5, 20.5, 14.5, BK[2]); p.fline(13, 15.6, 19, 15.6, BK[2]);
  },
  'v-food'(p) {
    const c = p.tank(7, 9, 18, 19, OL, { r: 2 });
    p.clip = c.inside; p.box(7, 14, 18, 8, PA, { lum: 0.7, bevel: 0.3 }); p.box(7, 9, 18, 2, GM, { lum: 0.6, bevel: 0.3 }); p.box(7, 26, 18, 2, GM, { lum: 0.4, bevel: 0.3 }); p.clip = null;
    p.ball(16, 18, 3.2, 2.8, RAMPS.coral, { n: 7 }); p.leaf(16.5, 15.4, 20.5, 13, 2, MO, { bend: 0.2 });
    p.gem([7, 9, 9, 6, 23, 6, 25, 9], GM, { crown: 0.1 });
  },
  'v-integrity'(p) {
    const s = p.bevel([16, 2, 28, 7, 27, 18, 16, 30, 5, 18, 4, 7], PA, { w: 1.3 });
    p.clip = s.inside; p.box(4, 13, 24, 3, OR, { lum: 0.55, bevel: 0.3 }); p.fline(16, 2, 16, 30, PA[1]); p.clip = null;
    bolts(p, [[8, 9], [24, 9], [10, 20], [22, 20], [16, 26]], 0.6);
  },
  'v-health'(p) {
    const k = p.box(5, 8, 22, 18, PA, { bevel: 1.1, r: 1 }); p.box(12, 5, 8, 3.5, GM, { bevel: 0.5 });
    p.clip = k.inside; p.box(13.2, 11, 5.6, 12, RE, { lum: 0.55, bevel: 0.4 }); p.box(10, 14.2, 12, 5.6, RE, { lum: 0.55, bevel: 0.4 }); p.clip = null;
  },
  'v-morale'(p) {
    p.ball(16, 15, 11, 11, PA, { n: 9, crown: 0.35 });
    p.gem([8, 12, 24, 12, 25, 20, 16, 23, 7, 20], BR, { crown: 0.35 });
    p.fline(10, 14, 14, 13.2, SN[5]); p.box(10, 26, 12, 4, GM, { bevel: 0.6 }); p.fdot(25.5, 10, 0.8, AM[4], AM[1]);
  },
  'v-link'(p) {
    p.gem([6, 10, 16, 4, 26, 10, 22, 18, 10, 18], PA, { crown: 0.3 }); p.seg(16, 18, 16, 29, 1.8, GM); p.box(10, 27, 12, 4, OL, { bevel: 0.6 });
    p.seg(16, 11, 16, 3, 0.6, GM); p.fdot(16, 2.5, 0.8, TE[4], TE[1]);
    p.under = true; for (const r of [4, 7, 10]) p.farc(16, 3, r, -2.6, -0.5, TE[r > 7 ? 2 : 4], 0, 1, -1, r > 7 ? 1 : 0); p.under = false;
  },
  'v-lock'(p) {
    p.ring(16, 12, 4.4, 6.6, GM, { n: 8, ry: 1.1 }); const b = p.box(7, 13, 18, 15, BR, { bevel: 1, r: 1 }); p.clip = b.inside; p.box(14.6, 18, 2.8, 6, BK, { lum: 0.15 }); p.clip = null;
  },
};
// arms in the catalogue use their tool's art
ART['t-claw-arm'] = ART['t-claw'];
for (const [k, f] of Object.entries(ART)) registerHiIcon(k, f);
export const TOOL_ICONS = Object.keys(ART);
void IR;

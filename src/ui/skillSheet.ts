// The assembly drawing U7-ASSY: where every node sits on the sheet, and the small technical drawing that is each
// node. VIEW A in the middle is an exploded view of Unit 07 whose parts are the CHASSIS items; the other branches
// are details around it, each drawn the way an engineer would draw that kind of thing: tool details (HARVEST),
// field-line and force diagrams (GRAVITY), stroboscopic motion studies (COMBAT), graft schematics (FABRICATION)
// and apparatus (LAB). Items are numbered like a real parts list; requirements run as thin leader lines inside a
// detail and as typed cross-references between details.
import { SKILL, type Branch } from '../game/skills';
import { Sk } from './skillDraft';

export const SW = 1520, SH = 1214;
export interface Box { x: number; y: number; w: number; h: number }
export interface NodeDef {
  id: string; item: number; branch: Branch; chassis: boolean;
  /** the drawing (sheet units) */
  sk: Sk;
  /** balloon centre, its leader from the part, label anchor */
  bx: number; by: number; leader: [number, number, number, number] | null;
  lx: number; ly: number; la: 'l' | 'c' | 'r'; label: string;
  /** where pencil notes and status lines go */
  nx: number; ny: number; na: 'l' | 'c' | 'r';
  /** room for the label (narrow details letter smaller) */
  lw?: number;
  hit: Box; cx: number; cy: number;
  /** grid cell inside a detail (requirement routing) */
  cell?: { r: number; c: number; region: string };
}
export interface Region { key: string; title: string; x: number; y: number; w: number; h: number; cols: number; rows: (string | null)[][]; cw: number; ch: number }

// ------------------------------------------------------------------ details around the exploded view
export const REGIONS: Region[] = [
  { key: 'harvest', title: 'DETAIL B  -  HARVEST TOOLING  -  SCALE 1:2', x: 44, y: 46, w: 468, h: 292, cols: 4, cw: 117, ch: 136, rows: [['intake', 'siphon', 'drill', 'magnet'], ['excavate', 'bore', 'refinery', 'tanks']] },
  { key: 'combat', title: 'DETAIL D  -  MOTION STUDIES  -  STROBE 1/24 S', x: 44, y: 352, w: 468, h: 292, cols: 4, cw: 117, ch: 136, rows: [['plow', 'punch', 'frenzy', 'servo'], ['shrapnel', 'rock', 'boulder', null]] },
  { key: 'gravity', title: 'DETAIL C  -  FIELD DIAGRAMS  -  NOT TO SCALE', x: 1008, y: 46, w: 468, h: 292, cols: 4, cw: 117, ch: 136, rows: [['repulse', 'lift', 'shape', 'amp'], [null, 'slam', 'well', 'storm']] },
  { key: 'fabrication', title: 'DETAIL E  -  GRAFT SCHEMATICS', x: 1008, y: 352, w: 468, h: 292, cols: 3, cw: 156, ch: 136, rows: [['graft', 'sow', 'grove'], ['command', 'convert', 'print']] },
  { key: 'lab', title: 'DETAIL F  -  LABORATORY APPARATUS  -  SCALE 1:8', x: 44, y: 664, w: 950, h: 196, cols: 5, cw: 190, ch: 150, rows: [['lab', 'splice', 'sequencer', 'vat', 'cloner']] },
  { key: 'biotech', title: 'DETAIL G  -  BIOTECH INSTALLATIONS', x: 1008, y: 664, w: 468, h: 292, cols: 4, cw: 117, ch: 136, rows: [['bt_works', 'bt_reactor', 'bt_field', 'bt_dome'], ['bt_habitat', 'bt_lock', 'bt_vat', 'bt_clone']] },
  { key: 'industry', title: 'DETAIL H  -  FIELD INDUSTRY  -  PLANT LAYOUT, SCALE 1:50', x: 44, y: 874, w: 1034, h: 292, cols: 8, cw: 129, ch: 136, rows: [['works', 'miner2', 'miner3', 'belt2', 'belt3', 'turret', 'haul', 'operate'], ['assembler', 'manufacturer', 'robotics', 'atomic', 'steam', 'chem', 'blueprint', null]] },
];
export const TITLE: Box = { x: 1092, y: 964, w: 384, h: 196 };
export const VIEW_A: Box = { x: 524, y: 40, w: 476, h: 610 };
const ITEM_ORDER = ['head', 'torso', 'armR', 'armL', 'coil', 'reactor', 'plating1', 'plating2', 'plating3', 'colossus',
  ...REGIONS.flatMap((R) => R.rows.flat().filter((x): x is string => !!x))];
for (const id of Object.keys(SKILL)) if (!ITEM_ORDER.includes(id)) ITEM_ORDER.push(id);
export const ITEM: Record<string, number> = Object.fromEntries(ITEM_ORDER.map((id, i) => [id, i + 1]));

// ------------------------------------------------------------------ little reusable drawings
const TAU = Math.PI * 2;
function stone(s: Sk, x: number, y: number, rx: number, ry: number, seed: number, fill = 0.1, n = 9) {
  const p = s.rock(x, y, rx, ry, seed, n); s.fill(p, fill); s.facets(p, x, y, Math.max(1, Math.round((rx + ry) / 14)), seed);
  return p;
}
function unitHead(s: Sk, x: number, y: number, r: number) {
  stone(s, x, y, r, r * 0.92, 202, 0.12, 10);
  s.circ(x + r * 0.2, y + r * 0.1, r * 0.48); s.circ(x + r * 0.2, y + r * 0.1, r * 0.26, 't');
  s.fillEll(x + r * 0.2, y + r * 0.1, r * 0.26, r * 0.26, 0.35);
}
function arrow(s: Sk, x0: number, y0: number, x1: number, y1: number, size = 4.5, k: 'o' | 't' = 'o') { s.line(x0, y0, x1, y1, k); s.arrowHead(x0, y0, x1, y1, size, k); }
function critter(s: Sk, x: number, y: number, sc: number, o: { flip?: boolean; half?: 'top' | 'bottom' } = {}) {
  const f = o.flip ? -1 : 1, k = o.half === 'top' ? 'h' : 'o';
  s.ell(x, y, 12 * sc, 7 * sc, k); s.fillEll(x, y, 12 * sc, 7 * sc, 0.1);
  s.circ(x + 13 * sc * f, y - 5 * sc, 5.5 * sc, k);
  s.pl([x + 17.5 * f * sc, y - 6.5 * sc, x + 24 * f * sc, y - 4 * sc, x + 17.5 * f * sc, y - 2.5 * sc], k);
  s.circ(x + 14.5 * f * sc, y - 6 * sc, 1.1 * sc, 't');
  for (const lx of [-8, -3, 2, 7]) s.line(x + lx * sc, y + 5.5 * sc, x + (lx - 2) * sc, y + 13 * sc, k);
  for (let i = 0; i < 3; i++) s.arc(x - 6 * sc + i * 5 * sc, y - 7 * sc, 2.2 * sc, 2.6 * sc, Math.PI, TAU, k);
}
function ground(s: Sk, x0: number, x1: number, y: number) {
  s.line(x0, y, x1, y, 'o');
  for (let x = x0 + 3; x < x1 - 2; x += 5) s.line(x, y + 1, x - 4, y + 5, 'x');
}
function fist(s: Sk, x: number, y: number, r: number, seed: number) {
  stone(s, x, y, r, r * 0.88, seed, 0.12, 9);
  for (let i = -1; i <= 1; i++) s.circ(x + r * 0.78, y + i * r * 0.42, r * 0.17, 't');
}

function minerTower(s: Sk, mk: number) {
  for (let i = 0; i < 3; i++) s.line(-48, 14 + i * 6, 48, 14 + i * 6, i ? 't' : 'o');
  s.hatch([-48, 20, 48, 20, 48, 26, -48, 26], 2.6);
  const h = mk === 3 ? 44 : 36;
  s.pl([-14, 14, 0, 14 - h, 14, 14]); for (let i = 1; i < 4; i++) { const y = 14 - (h / 4) * i, w = 14 - (14 / 4) * i; s.line(-w, y, w, y - 4, 't'); s.line(w, y, -w, y - 4, 't'); }
  s.line(0, 14 - h + 4, 0, 30); s.pl([-3, 26, 0, 31, 3, 26], 'o', true);
  if (mk === 3) { s.circ(0, 14 - h - 3, 4); s.fillEll(0, 14 - h - 3, 4, 4, 0.3); }
  s.text('MK ' + 'I'.repeat(mk), 30, -10, 6, { align: 'c' });
}
function conveyor(s: Sk, decks: number) {
  for (let d = 0; d < decks; d++) {
    const y = 10 - d * 18;
    for (let x = -40; x <= 40; x += 13.3) s.circ(x, y, 3.2, 't');
    s.line(-40, y - 3.2, 40, y - 3.2); s.line(-40, y + 3.2, 40, y + 3.2);
    for (let x = -34; x < 36; x += 20) s.box(x, y - 10, 8, 6.8);
    arrow(s, 26 - d * 4, y - 14, 40, y - 14, 3, 't');
  }
  s.line(-40, 13.2, -40, 26); s.line(40, 13.2, 40, 26); ground(s, -48, 48, 26);
}
function machine(s: Sk, inputs: number) {
  s.box(-18, -22, 36, 44); s.fill([-18, -22, 18, -22, 18, 22, -18, 22], 0.08); s.hatch([-18, 16, 18, 16, 18, 22, -18, 22], 2.2);
  s.box(-8, -14, 16, 10, 't'); s.line(0, -4, 0, 6, 'o'); s.box(-6, 6, 12, 4, 't');
  for (let i = 0; i < inputs; i++) { const y = -16 + (i * 30) / Math.max(1, inputs - 1); arrow(s, -46, inputs === 1 ? 0 : y, -20, inputs === 1 ? 0 : y, 3, 't'); }
  arrow(s, 20, 0, 46, 0, 3.5, 'o');
}
function teslaMast(s: Sk, coils: number) {
  ground(s, -48, 48, 26);
  s.pl([-10, 26, -4, -16, 4, -16, 10, 26]); for (let i = 0; i < 4; i++) { const y = 20 - i * 9; s.line(-8 + i * 1.4, y, 8 - i * 1.4, y - 7, 't'); }
  for (let i = 0; i < coils; i++) s.ell(0, -20 - i * 6, 12 + i * 3, 4);
  s.arc(0, 26, 44, 44, Math.PI + 0.2, 2 * Math.PI - 0.2, 'h'); s.arc(0, 26, 38, 38, Math.PI + 0.3, 2 * Math.PI - 0.3, 'h');
}
// ------------------------------------------------------------------ each node's drawing (local coords, about 96 x 60)
type Draw = (s: Sk) => void;
const D: Record<string, Draw> = {
  // ---- HARVEST: tool details
  intake(s) {
    s.box(-4, -24, 40, 46); s.hatch([-4, -24, 36, -24, 36, -19, -4, -19], 2.6); s.hatch([-4, 17, 36, 17, 36, 22, -4, 22], 2.6);
    s.box(2, -14, 26, 28, 't'); for (let x = 6; x < 28; x += 4.4) s.line(x, -14, x, 14, 't');
    s.pl([-4, -12, -18, -22, -18, 22, -4, 12]); s.fill([-4, -12, -18, -22, -18, 22, -4, 12], 0.08);
    s.pl([-46, 26, -44, 10, -40, -2, -42, -14, -38, -22]); s.pl([-42, 4, -50, -4]); s.pl([-40, -8, -33, -16]);
    for (let i = 0; i < 6; i++) { const t = i / 5; s.circ(-34 + t * 18, -2 - Math.sin(t * 3) * 6, 0.9 + t * 0.5, 't'); }
    arrow(s, -30, 10, -20, 6, 3.5, 't');
    s.text('FLUE', 16, 26, 5, { align: 'c' });
  },
  siphon(s) {
    s.line(-48, 16, 48, 16); for (let i = 0; i < 3; i++) s.arc(4, 16, 8 + i * 6, 2 + i, 0, Math.PI, 't');
    s.pl([-36, -26, -22, -24, -10, -14, -2, 0, 2, 16]); s.pl([-36, -20, -24, -18, -14, -9, -7, 3, -4, 16]);
    s.box(-6, 14, 12, 10); s.hatch([-6, 14, 6, 14, 6, 24, -6, 24], 2.4);
    s.box(22, -24, 18, 30); s.fill([22, -24, 40, -24, 40, 6, 22, 6], 0.1); s.line(26, -24, 26, 6, 't'); s.line(22, -6, 40, -6, 't');
    s.pl([31, -24, 31, -32, 46, -32]); s.circ(46, -32, 1.6, 't');
    s.pl([40, 0, 46, 0, 46, 12]); arrow(s, 0, 12, -4, -2, 3, 't');
    s.dim(-36, -26, -36, -20, -6, 'D12', 4.5);
  },
  drill(s) {
    s.box(-48, -9, 26, 18); s.line(-22, -6, -12, -6); s.line(-22, 6, -12, 6);
    s.pl([-12, -9, 18, -3, 30, 0, 18, 3, -12, 9], 'o', true); s.fill([-12, -9, 18, -3, 30, 0, 18, 3, -12, 9], 0.12);
    for (let x = -8; x < 16; x += 5) s.line(x, -8 + (x + 12) * 0.2, x + 4, 8 - (x + 12) * 0.2, 't');
    s.line(-52, 0, 36, 0, 'c');
    s.arc(-34, 0, 6, 12, -1.2, 1.2, 't'); s.arrowHead(-34 + Math.cos(1.0) * 6, Math.sin(1.0) * 12, -34 + Math.cos(1.2) * 6, Math.sin(1.2) * 12, 3);
    const seam = [24, -20, 48, -26, 50, 24, 26, 26, 20, 8]; s.pl(seam, 'o', true); s.hatch(seam, 3.4, -Math.PI / 4);
    s.text('ORE SEAM', 38, -33, 4.5, { align: 'c' });
  },
  magnet(s) {
    s.arc(-6, -8, 22, 22, Math.PI, TAU); s.arc(-6, -8, 12, 12, Math.PI, TAU);
    s.line(-28, -8, -28, 16); s.line(-18, -8, -18, 16); s.line(16, -8, 16, 16); s.line(6, -8, 6, 16);
    s.hatch([-28, 8, -18, 8, -18, 16, -28, 16], 2.2); s.hatch([6, 8, 16, 8, 16, 16, 6, 16], 2.2);
    s.text('N', -23, 0, 5, { align: 'c' }); s.text('S', 11, 0, 5, { align: 'c' });
    for (let i = 0; i < 3; i++) s.arc(-6, 16, 12 + i * 5, 5 + i * 4, 0, Math.PI, 'h');
    stone(s, 34, 6, 6, 5, 21); stone(s, 26, 24, 4.5, 4, 22); stone(s, 42, -14, 4, 3.5, 23);
    arrow(s, 28, 4, 20, 8, 3, 't'); arrow(s, 22, 22, 15, 19, 3, 't');
  },
  excavate(s) {
    ground(s, -48, 48, 12);
    s.pl([-10, 12, 2, 22, 22, 22, 22, 12], 'h');
    s.pl([-46, -28, -18, -10]); s.pl([-44, -32, -16, -14]);
    s.circ(-16, -12, 3);
    const bk = [-16, -12, 12, -18, 18, 4, 4, 10, -12, 2]; s.pl(bk, 'o', true); s.fill(bk, 0.1);
    for (let i = 0; i < 4; i++) s.pl([-10 + i * 6, 3 + i * 2, -8 + i * 6, 8 + i * 2.2, -6 + i * 6, 4 + i * 2]);
    for (const [x, y, r] of [[26, -4, 3], [34, -12, 2.4], [30, 2, 2]] as [number, number, number][]) stone(s, x, y, r, r * 0.8, x);
    arrow(s, 24, 18, 36, 8, 3, 't');
  },
  bore(s) {
    for (let i = 0; i < 4; i++) { const y = -2 + i * 8; s.line(-48, y, 48, y, i ? 't' : 'o'); }
    s.hatch([-48, 6, 48, 6, 48, 14, -48, 14], 3.2); s.hatch([-48, 22, 48, 22, 48, 30, -48, 30], 2.2, -Math.PI / 4);
    s.line(-2, -30, -2, 24); s.line(2, -30, 2, 24); s.pl([-4, 24, 0, 30, 4, 24], 'o', true);
    s.pl([-18, -2, 0, -32, 18, -2], 'o'); for (let i = 1; i < 4; i++) { const y = -2 - i * 7.5, w = 18 - i * 4.5; s.line(-w, y, w, y - 3, 't'); s.line(w, y, -w, y - 3, 't'); }
    s.dim(26, -2, 26, 30, 8, '300', 4.5);
  },
  refinery(s) {
    ground(s, -48, 48, 24);
    const mould = [6, 10, 40, 10, 36, 22, 10, 22]; s.pl(mould, 'o', true); s.hatch(mould, 2.4);
    s.pl([-40, -22, -10, -28, -6, -4, -32, 4], 'o', true); s.fill([-40, -22, -10, -28, -6, -4, -32, 4], 0.1);
    s.circ(-22, -8, 2.4); s.line(-22, -8, -30, 24, 't'); s.line(-22, -8, -14, 24, 't');
    s.pl([-8, -24, 2, -18, 8, -6, 14, 8], 'o'); s.pl([-6, -26, 6, -18, 12, -6, 18, 8], 't');
    for (let i = 0; i < 3; i++) s.pl([18 + i * 8, -6, 16 + i * 8, -12, 19 + i * 8, -18, 17 + i * 8, -24], 'h');
  },
  tanks(s) {
    for (let i = 0; i < 3; i++) {
      const x = -32 + i * 30;
      s.ell(x, -22, 11, 3.5); s.line(x - 11, -22, x - 11, 22); s.line(x + 11, -22, x + 11, 22); s.arc(x, 22, 11, 3.5, 0, Math.PI);
      s.fill([x - 11, -22, x + 11, -22, x + 11, 22, x - 11, 22], 0.08);
      s.arc(x, -10, 11, 3.5, 0, Math.PI, 't'); s.arc(x, 10, 11, 3.5, 0, Math.PI, 't');
      s.box(x + 4, -16, 3, 24, 't'); const lv = [2, -8, 6][i]; s.line(x + 4, lv, x + 7, lv, 'o');
      s.text(['ORE', 'H2O', 'C'][i], x - 2, 26, 4.5, { align: 'c' });
    }
  },
  // ---- GRAVITY: field diagrams
  lift(s) {
    unitHead(s, -32, 18, 9);
    stone(s, 20, -12, 15, 11, 61, 0.12, 11);
    for (let i = 0; i < 3; i++) s.arc(20, 2, 18 + i * 5, 4 + i * 1.6, 0, TAU, 'h');
    for (let i = 0; i < 4; i++) s.pl([-24, 14 - i * 3, -6, 4 - i * 4, 8, -4 - i * 2], 'h');
    arrow(s, 20, -26, 20, -34, 3.5); s.text('F', 24, -36, 5);
    s.line(40, 26, 48, 26, 't'); s.dim(44, 26, 44, -12, 4, 'H', 4.5);
  },
  repulse(s) {
    s.circ(0, 0, 3); s.fillEll(0, 0, 3, 3, 0.4);
    for (let i = 0; i < 3; i++) s.circ(0, 0, 9 + i * 7, 'h');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; arrow(s, Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * 26, Math.sin(a) * 26, 3.5); stone(s, Math.cos(a) * 34, Math.sin(a) * 26, 4, 3.4, 70 + i); }
  },
  shape(s) {
    s.pl([-48, 18, -14, 18], 'o'); s.pl([14, 18, 48, 18], 'o');
    const col = [-14, 18, -12, -16, 12, -18, 14, 18]; s.pl(col, 'o'); s.hatch([-14, 18, -12, -16, 12, -18, 14, 18], 3.2);
    s.line(-14, 18, 14, 18, 'p');
    for (let x = -46; x < 46; x += 5) if (x < -15 || x > 15) s.line(x, 19, x - 4, 23, 'x');
    arrow(s, 30, 14, 30, -16, 4); arrow(s, -30, 14, -30, -6, 3.5, 't');
    s.dim(-14, -16, 14, -18, -8, '1.2 M', 4.5);
  },
  slam(s) {
    s.line(-44, 10, 44, 10); for (let x = -42; x < 44; x += 5) s.line(x, 11, x - 4, 15, 'x');
    for (let i = -1; i <= 1; i++) arrow(s, i * 16, -30, i * 16, 4, 4.2);
    s.pl([-40, 10, -26, 18, -12, 24, 0, 26, 12, 24, 26, 18, 40, 10], 't');
    for (let x = -36; x <= 36; x += 6) s.line(x, 10, x, 10 + 16 * Math.cos((x / 40) * 1.4) ** 2, 'x');
    s.text('P MAX', 30, 22, 4.5);
  },
  well(s) {
    for (let arm = 0; arm < 2; arm++) { const pts: number[] = []; for (let i = 0; i <= 60; i++) { const t = i / 60, r = 30 * (1 - t) + 3, a = arm * Math.PI + t * 9; pts.push(Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.9); } s.pl(pts, arm ? 'h' : 't'); }
    s.circ(0, 0, 3.5); s.line(-5, 0, 5, 0, 't'); s.line(0, -5, 0, 5, 't');
    for (const [a, r] of [[0.4, 26], [2.6, 20], [4.4, 30]] as [number, number][]) { const x = Math.cos(a) * r * 1.3, y = Math.sin(a) * r * 0.9; stone(s, x, y, 3.6, 3, Math.round(a * 10)); arrow(s, x - Math.sin(a) * 4, y + Math.cos(a) * 4, x - Math.sin(a) * 12 - Math.cos(a) * 4, y + Math.cos(a) * 12 - Math.sin(a) * 3, 3, 't'); }
  },
  amp(s) {
    s.circ(0, -2, 15); s.line(-8, -10, 8, -10); s.line(-8, -10, -8, -12, 't'); s.line(8, -10, 8, -12, 't');
    s.pl([-10, -3, 10, -3], 'h'); s.pl([-6, 6, -3, 3, 0, 6, 3, 3, 6, 6], 'o');
    s.line(-8, -10, -8, -22, 't'); s.line(0, 13, 0, 24, 't'); s.line(-12, -3, -22, -3, 't');
    for (let i = 0; i < 3; i++) for (const sg of [-1, 1]) s.arc(0, -2, 22 + i * 7, 22 + i * 7, sg > 0 ? -0.7 : Math.PI - 0.7, sg > 0 ? 0.7 : Math.PI + 0.7, 'h');
    s.text('X1.5', 30, 20, 5);
  },
  storm(s) {
    ground(s, -48, 48, 22);
    s.circ(0, 22, 6, 't'); s.line(-9, 22, 9, 22, 't'); s.line(0, 14, 0, 26, 't');
    s.ell(0, -22, 34, 7, 'h');
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, x = Math.cos(a) * 34, y = -22 + Math.sin(a) * 7; stone(s, x, y, 4, 3.2, 90 + i); if (i % 2 === 0) arrow(s, x * 0.9, y + 5, x * 0.25, 14, 3, 't'); }
  },
  // ---- COMBAT: stroboscopic motion studies
  punch(s) {
    s.line(-48, 0, -30, 0, 't'); s.line(-48, -4, -30, -4, 't');
    for (let i = 0; i < 4; i++) { s.am = 0.25 + i * 0.25; fist(s, -24 + i * 15, 0, 9, 431); }
    s.am = 1;
    for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; s.line(38 + Math.cos(a) * 4, Math.sin(a) * 4, 38 + Math.cos(a) * 11, Math.sin(a) * 11, 't'); }
    arrow(s, -20, 20, 22, 20, 3.5, 't'); s.text('V', 0, 23, 5, { align: 'c' });
  },
  frenzy(s) {
    for (let i = 0; i < 6; i++) { s.am = 0.22 + (i % 3) * 0.3; fist(s, -24 + (i % 3) * 18, (i < 3 ? -12 : 12), 7.5, 470 + i); }
    s.am = 1;
    for (const y of [-12, 12]) arrow(s, -44, y, -34, y, 3, 't');
    s.text('X3', 34, -4, 6);
  },
  plow(s) {
    ground(s, -48, 48, 22);
    for (let i = 0; i < 3; i++) { s.am = 0.3 + i * 0.35; const x = -34 + i * 14; s.circ(x, -8, 5); stone(s, x, 6, 8, 7, 101); s.pl([x - 4, 14, x, 20, x + 4, 14]); }
    s.am = 1;
    s.pl([0, 22, 10, 10, 16, 22], 't');
    critter(s, 30, -12, 0.7, { flip: true });
    s.arc(30, -12, 16, 14, -2.6, -0.6, 'h'); s.arrowHead(30 + Math.cos(-0.8) * 16, -12 + Math.sin(-0.8) * 14, 30 + Math.cos(-0.6) * 16, -12 + Math.sin(-0.6) * 14, 3);
  },
  rock(s) {
    s.line(-46, 22, -34, 8); s.line(-44, 24, -32, 10); fist(s, -30, 4, 7, 440);
    const pts: number[] = []; for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push(-26 + t * 72, 2 - Math.sin(t * Math.PI) * 30 + t * 18); }
    s.pl(pts, 'h');
    for (let i = 1; i <= 4; i++) { const t = i / 5; s.am = 0.3 + t * 0.7; stone(s, -26 + t * 72, 2 - Math.sin(t * Math.PI) * 30 + t * 18, 4.5, 4, 33); }
    s.am = 1; s.text('T=1/24', 30, -24, 4.5, { align: 'c' });
  },
  shrapnel(s) {
    s.circ(0, 0, 11, 'h');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2, r = 18 + (i % 2) * 8; const p = [Math.cos(a) * r, Math.sin(a) * r, Math.cos(a + 0.2) * (r - 6), Math.sin(a + 0.2) * (r - 6), Math.cos(a - 0.15) * (r - 5), Math.sin(a - 0.15) * (r - 5)]; s.pl(p, 'o', true); s.fill(p, 0.12); s.line(Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * (r - 8), Math.sin(a) * (r - 8), 't'); }
    s.circ(0, 0, 2.5); s.fillEll(0, 0, 2.5, 2.5, 0.5);
  },
  boulder(s) {
    stone(s, 0, -16, 26, 13, 77, 0.1, 13);
    s.pl([-20, 26, -22, 10, -18, -2]); s.pl([20, 26, 22, 10, 18, -2]); s.circ(-22, 10, 2.4, 't'); s.circ(22, 10, 2.4, 't');
    s.arc(0, 30, 42, 50, -2.4, -0.7, 'h'); s.arrowHead(Math.cos(-0.9) * 42, 30 + Math.sin(-0.9) * 50, Math.cos(-0.7) * 42, 30 + Math.sin(-0.7) * 50, 3.5);
    s.text('2 HANDS', -34, 22, 4.5, { align: 'c' });
  },
  servo(s) {
    const cylp = [-36, -10, 6, -10, 6, 10, -36, 10]; s.pl(cylp, 'o', true); s.hatch([-36, -10, 6, -10, 6, -6, -36, -6], 2.2); s.hatch([-36, 6, 6, 6, 6, 10, -36, 10], 2.2);
    s.box(-10, -6, 5, 12); s.line(-5, -2, 36, -2); s.line(-5, 2, 36, 2); s.box(36, -6, 6, 12);
    arrow(s, -30, -18, -22, -10, 3, 't'); arrow(s, -30, 18, -22, 10, 3, 't');
    s.circ(24, -20, 8); s.line(24, -20, 29, -25, 'o'); for (let i = 0; i < 5; i++) { const a = Math.PI + (i / 4) * Math.PI; s.line(24 + Math.cos(a) * 6, -20 + Math.sin(a) * 6, 24 + Math.cos(a) * 8, -20 + Math.sin(a) * 8, 't'); }
    s.text('3000 PSI', 24, 12, 4.5, { align: 'c' });
  },
  // ---- FABRICATION: graft schematics
  graft(s) {
    ground(s, -48, 48, 24);
    s.pl([-6, 24, -4, 4, -8, -12, -4, -26]); s.pl([-4, 4, -22, -6]); s.pl([-6, -6, 12, -18]);
    s.ell(-26, -9, 7, 4, 'o', 0.4); s.ell(16, -21, 7, 4, 'o', -0.4); s.ell(-3, -30, 4, 7);
    s.fillEll(-3, -30, 4, 7, 0.25);
    for (let i = 0; i < 3; i++) s.line(-9, -2 + i * 3, -1, -4 + i * 3, 't');
    s.box(16, 6, 26, 6); s.line(16, 9, 2, 3); s.line(42, 9, 48, 9); s.hatch([18, 6, 30, 6, 30, 12, 18, 12], 2);
    s.text('GRAFT JT', 28, 18, 4.5, { align: 'c' });
  },
  sow(s) {
    ground(s, -48, 48, 18);
    s.box(-34, -30, 68, 6); s.hatch([-34, -30, 34, -30, 34, -24, -34, -24], 2.6); s.line(0, -24, 0, -14); s.box(-28, -14, 56, 6);
    for (let i = 0; i < 5; i++) s.ell(-24 + i * 12, -2, 3, 2);
    s.pl([30, 18, 30, 8]); s.ell(26, 6, 4, 2.4, 'o', 0.5); s.ell(34, 5, 4, 2.4, 'o', -0.5);
    arrow(s, -40, -24, -40, -10, 3, 't');
  },
  grove(s) {
    ground(s, -48, 48, 12);
    for (const [x, h, r] of [[-28, -6, 10], [2, -16, 13], [32, -4, 9]] as [number, number, number][]) { s.line(x, 12, x, h + r * 0.6); s.circ(x, h, r); s.fillEll(x, h, r, r, 0.1); }
    s.pl([-28, 14, -18, 22, 2, 18, 18, 24, 32, 14], 'h'); s.pl([2, 14, -6, 24], 'h');
    arrow(s, 38, 20, 48, 20, 3, 't'); arrow(s, -38, 20, -48, 20, 3, 't');
  },
  convert(s) {
    s.ell(-8, 4, 26, 19); s.fill([-34, 4, -8, -15, 18, 4, -8, 23], 0.06);
    s.pl([16, -2, 34, 4, 16, 10]);
    s.circ(6, -2, 4); s.fillEll(6, -2, 4, 4, 0.3); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; s.line(6 + Math.cos(a) * 6, -2 + Math.sin(a) * 6, 6 + Math.cos(a) * 9, -2 + Math.sin(a) * 9, 't'); }
    s.box(-20, -22, 10, 8); s.hatch([-20, -22, -10, -22, -10, -14, -20, -14], 2);
    s.pl([-15, -22, -15, -30, -40, -30]); s.pl([-12, -22, -12, -32, -44, -32], 't'); s.box(-48, -36, 8, 10);
  },
  command(s) {
    ground(s, -48, 48, 24);
    s.pl([-6, 24, 0, -24, 6, 24]); for (let i = 0; i < 5; i++) { const y = 20 - i * 9, w = 5 - i; s.line(-w, y, w, y - 7, 't'); s.line(w, y, -w, y - 7, 't'); }
    for (let i = 0; i < 3; i++) for (const sg of [-1, 1]) s.arc(0, -24, 7 + i * 6, 7 + i * 6, sg > 0 ? -0.8 : Math.PI - 0.8 + 1.6 - 1.6, sg > 0 ? 0.8 : Math.PI + 0.8, 'h');
    critter(s, -32, 14, 0.45); critter(s, 32, 14, 0.45, { flip: true });
    arrow(s, -22, 6, -12, 2, 3, 't'); arrow(s, 22, 6, 12, 2, 3, 't');
  },
  print(s) {
    s.box(-44, -30, 88, 6); s.box(-8, -24, 16, 10); s.pl([-4, -14, 0, -9, 4, -14], 'o', true);
    critter(s, 0, 10, 0.9, { half: 'bottom' });
    for (let y = 4; y <= 18; y += 3.5) s.line(-14, y, 14, y, 'x');
    s.line(-40, 2, 40, 2, 'c'); s.text('LAYER 41', 30, -4, 4.5, { align: 'c' });
  },
  // ---- INDUSTRY: plant layout details
  works(s) {
    ground(s, -48, 48, 24);
    s.pl([-40, 24, -40, -2, -28, -14, -28, -2, -16, -14, -16, -2, -4, -14, -4, -2, 8, -14, 8, 24]); s.fill([-40, 24, -40, -2, 8, -2, 8, 24], 0.08);
    for (let x = -36; x < 6; x += 8) s.box(x, 6, 5, 8, 't');
    s.box(16, -30, 8, 54); s.hatch([16, -30, 24, -30, 24, -24, 16, -24], 2);
    for (let i = 0; i < 3; i++) s.arc(20 + i * 6, -36 - i * 4, 4 + i, 3 + i, Math.PI, 2 * Math.PI, 'h');
    s.circ(36, 8, 9); s.circ(36, 8, 4, 't'); for (let i = 0; i < 8; i++) { const a = (i / 8) * 2 * Math.PI; s.line(36 + Math.cos(a) * 9, 8 + Math.sin(a) * 9, 36 + Math.cos(a) * 12, 8 + Math.sin(a) * 12); }
  },
  miner2(s) { minerTower(s, 2); },
  miner3(s) { minerTower(s, 3); },
  belt2(s) { conveyor(s, 1); s.text('120/MIN', 0, -30, 5, { align: 'c' }); },
  belt3(s) { conveyor(s, 2); s.text('270/MIN', 0, -30, 5, { align: 'c' }); },
  assembler(s) { machine(s, 2); },
  manufacturer(s) { machine(s, 4); },
  chem(s) {
    ground(s, -48, 48, 26);
    s.box(-30, -30, 16, 56); for (let y = -22; y < 22; y += 8) s.line(-30, y, -14, y, 't');
    s.box(2, -10, 22, 36); s.ell(13, -10, 11, 3); s.hatch([2, 18, 24, 18, 24, 26, 2, 26], 2);
    s.pl([-14, -20, -4, -20, -4, 0, 2, 0]); s.pl([24, 4, 34, 4, 34, 26]);
    s.pl([36, -22, 40, -22, 40, -14, 46, -2, 30, -2, 36, -14]); s.line(32, -6, 44, -6, 'x');
  },
  steam(s) {
    ground(s, -48, 48, 24);
    s.ell(-30, 6, 6, 14); s.line(-30, -8, 6, -8); s.line(-30, 20, 6, 20); s.arc(6, 6, 6, 14, -Math.PI / 2, Math.PI / 2); s.hatch([-30, 12, 4, 12, 4, 20, -30, 20], 2.4);
    s.box(-26, -26, 7, 18); for (let i = 0; i < 3; i++) s.arc(-22 + i * 5, -30 - i * 5, 4 + i * 1.5, 3 + i, Math.PI, 2 * Math.PI, 'h');
    s.circ(32, 4, 12); s.circ(32, 4, 5, 't'); s.line(6, 4, 20, 4); s.text('30 MW', 32, 20, 5, { align: 'c' });
  },
  atomic(s) {
    ground(s, -48, 48, 26);
    s.pl([-24, 26, -20, -16, 20, -16, 24, 26]); s.arc(0, -16, 20, 8, Math.PI, 2 * Math.PI); s.hatch([-12, 26, -10, -6, 10, -6, 12, 26], 3);
    for (const x of [-6, 0, 6]) s.line(x, -30, x, -6, 'o');
    for (let i = 0; i < 3; i++) s.ell(34, -10, 11, 4, 't', (i * Math.PI) / 3); s.circ(34, -10, 1.6);
    s.text('250 MW', 34, 6, 5, { align: 'c' });
  },
  robotics(s) {
    s.box(-12, -30, 20, 14); s.circ(-6, -23, 2.5, 't'); s.circ(2, -23, 2.5, 't'); s.line(-2, -30, -2, -36); s.circ(-2, -37.5, 1.5);
    s.box(-16, -14, 28, 26); s.fill([-16, -14, 12, -14, 12, 12, -16, 12], 0.1); s.box(-8, -8, 12, 8, 't');
    s.pl([-16, -10, -26, 2, -24, 14]); s.pl([12, -10, 22, 2, 20, 14]); s.pl([-8, 12, -10, 28]); s.pl([4, 12, 6, 28]);
    s.dim(-16, 12, 12, 12, 20, '1.8 M', 4.5);
    s.pl([30, 26, 30, 8, 40, -6, 46, -2], 'o'); s.circ(30, 8, 2, 't'); s.circ(40, -6, 2, 't');
  },
  turret(s) {
    ground(s, -48, 48, 24);
    s.box(-16, 10, 32, 14); s.arc(0, 10, 18, 14, Math.PI, 2 * Math.PI); s.fill([-18, 10, 18, 10, 0, -4], 0.1);
    s.line(6, 0, 40, -10); s.line(6, 4, 40, -6); s.line(6, -6, 40, -16); s.line(6, -2, 40, -12);
    s.arc(0, 10, 34, 34, -1.2, -0.2, 'h'); s.arrowHead(Math.cos(-0.4) * 34, 10 + Math.sin(-0.4) * 34, Math.cos(-0.2) * 34, 10 + Math.sin(-0.2) * 34, 3);
    s.hatch([-16, 18, 16, 18, 16, 24, -16, 24], 2.4);
  },
  haul(s) {
    s.box(-46, -6, 18, 28); s.box(28, -6, 18, 28); ground(s, -48, 48, 22);
    critter(s, 0, 8, 0.55); s.box(-6, -12, 12, 10); s.line(-4, -2, -2, 4, 't'); s.line(4, -2, 2, 4, 't');
    arrow(s, -24, -18, 22, -18, 3.5, 't');
  },
  operate(s) {
    s.box(4, -26, 30, 50); s.box(8, -20, 22, 14, 't'); for (let i = 0; i < 3; i++) s.circ(12 + i * 7, 2, 2.4, 't'); s.line(26, 10, 26, 18, 'o');
    ground(s, -48, 48, 24); critter(s, -18, 12, 0.6);
    s.text('X1.5', -30, -22, 6);
  },
  blueprint(s) {
    s.box(-44, -24, 40, 30); s.box(4, -18, 40, 30, 'h');
    for (let i = 0; i < 3; i++) { s.box(-40 + i * 12, -18, 8, 8, 't'); s.box(8 + i * 12, -12, 8, 8, 'h'); }
    s.line(-40, -2, -10, -2, 't');
    arrow(s, -4, -9, 4, -6, 3, 't'); s.text('COPY', 0, 18, 5, { align: 'c' });
  },
  // ---- BIOTECH: installations
  bt_works(s) {
    s.box(-30, -28, 40, 52); s.box(-26, -32, 12, 6, 't');
    for (let y = -18; y < 18; y += 7) s.line(-26, y, 6, y, 't');
    critter(s, 28, 4, 0.55); s.circ(28, 4, 16, 'h');
    s.text('ORGAN +1', 28, 22, 4.5, { align: 'c' });
  },
  bt_reactor(s) {
    ground(s, -48, 48, 24);
    s.line(-26, 24, -26, -8); s.line(6, 24, 6, -8); s.arc(-10, -8, 16, 12, Math.PI, 2 * Math.PI); s.fill([-26, 24, -26, -8, 6, -8, 6, 24], 0.08);
    s.box(-20, 10, 20, 10, 't'); for (let i = 0; i < 3; i++) s.pl([-16 + i * 6, 18, -14 + i * 6, 13, -12 + i * 6, 18], 't');
    s.pl([6, 0, 20, 0, 20, -20]); s.circ(30, 6, 10); s.text('25 MW', 30, 20, 5, { align: 'c' });
  },
  bt_vat(s) {
    s.ell(0, -24, 20, 5); s.line(-20, -24, -20, 20); s.line(20, -24, 20, 20); s.arc(0, 20, 20, 5, 0, Math.PI);
    critter(s, -2, 0, 0.62);
    for (let y = 14; y > -14; y -= 6) s.arc(0, y, 22, 4, 0.2, Math.PI - 0.2, 'h');
    s.box(-24, 22, 48, 6); s.hatch([-24, 22, 24, 22, 24, 28, -24, 28], 2.2);
  },
  bt_habitat(s) {
    ground(s, -48, 48, 22);
    s.arc(-4, 22, 34, 34, Math.PI, 2 * Math.PI); for (let i = 1; i < 5; i++) { const a = Math.PI + (i / 5) * Math.PI; s.line(-4, 22, -4 + Math.cos(a) * 34, 22 + Math.sin(a) * 34, 't'); }
    s.arc(-4, 22, 20, 20, Math.PI, 2 * Math.PI, 't');
    critter(s, -6, 12, 0.4); s.box(34, 4, 12, 18); s.circ(40, 10, 3, 't');
  },
  bt_field(s) { teslaMast(s, 1); },
  bt_dome(s) { teslaMast(s, 2); s.dim(-4, 26, 40, 26, 6, 'R 9.5 M', 4.5); },
  bt_lock(s) {
    const a: number[] = [], b: number[] = [];
    for (let i = 0; i <= 30; i++) { const x = -44 + i * 2.2; a.push(x, Math.sin(i * 0.35) * 12); b.push(x, -Math.sin(i * 0.35) * 12); }
    s.pl(a); s.pl(b, 'h');
    s.arc(26, -6, 8, 9, Math.PI, 2 * Math.PI); s.box(16, -6, 20, 18); s.fill([16, -6, 36, -6, 36, 12, 16, 12], 0.12); s.circ(26, 2, 2, 't'); s.line(26, 4, 26, 8, 't');
  },
  bt_clone(s) {
    critter(s, -22, 4, 0.6); critter(s, 22, 4, 0.6, { half: 'top' });
    arrow(s, -6, -16, 8, -16, 3, 't'); s.text('X2', 0, 20, 6, { align: 'c' });
  },
  // ---- LAB: apparatus
  lab(s) {
    s.ell(0, -26, 16, 4); s.line(-16, -26, -16, 22); s.line(16, -26, 16, 22); s.arc(0, 22, 16, 4, 0, Math.PI);
    s.box(-20, -32, 40, 6); s.box(-20, 22, 40, 6); s.hatch([-20, 22, 20, 22, 20, 28, -20, 28], 2.4);
    s.line(-16, -16, 16, -16, 't'); critter(s, -2, 4, 0.55);
    for (const [x, y, r] of [[8, -10, 1.6], [-9, -6, 1.2], [10, 12, 1.1]] as [number, number, number][]) s.circ(x, y, r, 't');
    s.line(20, -10, 36, -10); s.box(36, -16, 10, 12);
  },
  splice(s) {
    const a: number[] = [], b: number[] = [];
    for (let i = 0; i <= 40; i++) { const x = -44 + i * 2.2, ph = i * 0.32; a.push(x, Math.sin(ph) * 14); b.push(x, -Math.sin(ph) * 14); }
    s.pl(a); s.pl(b, 'h');
    for (let i = 2; i <= 38; i += 3) { const x = -44 + i * 2.2, y = Math.sin(i * 0.32) * 14; s.line(x, y, x, -y, 't'); }
    s.box(-6, -22, 12, 44); s.hatch([-6, -22, 6, -22, 6, -16, -6, -16], 2); s.hatch([-6, 16, 6, 16, 6, 22, -6, 22], 2);
    s.text('A', -40, -26, 5); s.text('B', 36, -26, 5);
  },
  sequencer(s) {
    for (const x of [-26, 26]) { s.circ(x, -8, 15); s.circ(x, -8, 4); for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + (x > 0 ? 0.5 : 0); s.line(x + Math.cos(a) * 4, -8 + Math.sin(a) * 4, x + Math.cos(a) * 13, -8 + Math.sin(a) * 13, 't'); } }
    s.pl([-40, -2, -30, 20, 30, 20, 40, -2], 't'); s.box(-8, 16, 16, 8); s.hatch([-8, 16, 8, 16, 8, 24, -8, 24], 2);
    for (let i = 0; i < 9; i++) { const x = -30 + i * 7.5, h = 2 + ((i * 7) % 5); s.line(x, 30, x, 30 - h, 't'); }
  },
  vat(s) {
    const wall = [-40, -14, -34, -14, -34, 22, 34, 22, 34, -14, 40, -14, 40, 28, -40, 28]; s.pl(wall, 'o', true); s.hatch(wall, 2.6);
    s.pl([-34, -4, -24, -6, -14, -3, -4, -6, 6, -3, 16, -6, 26, -3, 34, -5], 't');
    s.ell(-2, -14, 14, 10); s.circ(10, -20, 5); s.pl([14, -22, 20, -20, 14, -18]);
    for (const [x, y] of [[-20, -16], [22, -14], [-26, -24]] as [number, number][]) s.circ(x, y, 2, 't');
  },
  cloner(s) {
    for (const x of [-24, 24]) { s.ell(x, -24, 12, 3.2); s.line(x - 12, -24, x - 12, 20); s.line(x + 12, -24, x + 12, 20); s.arc(x, 20, 12, 3.2, 0, Math.PI); critter(s, x - 2, 2, 0.42); }
    s.line(-12, -10, 12, -10); s.line(-12, -6, 12, -6); s.hatch([-12, -10, 12, -10, 12, -6, -12, -6], 2);
    s.text('X2', 0, 22, 6, { align: 'c' });
  },
};

// ------------------------------------------------------------------ VIEW A: the exploded assembly (sheet coords)
const AX = 762;
const CHASSIS_DRAW: Record<string, Draw> = {
  head(s) {
    const p = s.rock(AX, 118, 44, 40, 202, 14); s.fill(p, 0.12); s.facets(p, AX, 118, 4, 202);
    s.box(AX - 36, 88, 70, 8); for (const x of [AX - 30, AX + 28]) s.circ(x, 92, 1.4, 't');
    s.circ(AX + 4, 124, 20); s.circ(AX + 4, 124, 15); s.circ(AX + 4, 124, 8); s.fillEll(AX + 4, 124, 8, 8, 0.4); s.arc(AX + 4, 124, 11.5, 11.5, 3.6, 4.6, 't');
    s.box(AX - 18, 148, 36, 9); for (let x = AX - 14; x < AX + 18; x += 4) s.line(x, 149, x, 156, 't');
    s.line(AX + 28, 84, AX + 42, 50); s.line(AX + 31, 85, AX + 45, 51, 't'); s.circ(AX + 44, 46, 3.6); for (let i = 0; i < 3; i++) s.line(AX + 33 + i * 2.6, 70 - i * 6, AX + 39 + i * 2.6, 72 - i * 6, 't');
    s.hatch([AX - 36, 88, AX + 34, 88, AX + 34, 96, AX - 36, 96], 2.2);
  },
  torso(s) {
    const p = s.rock(AX, 300, 112, 82, 101, 17); s.fill(p, 0.09); s.facets(p, AX, 300, 6, 101);
    for (let i = 0; i < 3; i++) { const x = AX - 26 + i * 26; s.box(x - 7, 208, 14, 14, 'h'); s.arc(x, 208, 7, 6, Math.PI, TAU, 'h'); }
    s.box(AX - 62, 262, 120, 80); s.fill([AX - 62, 262, AX + 58, 262, AX + 58, 342, AX - 62, 342], 0.1);
    for (const [x, y] of [[AX - 56, 268], [AX + 52, 268], [AX - 56, 336], [AX + 52, 336], [AX - 2, 268], [AX - 2, 336]]) s.circ(x, y, 1.6, 't');
    s.text('U.S.P.C.', AX - 48, 316, 6); s.text('UNIT 07', AX - 48, 326, 6);
    s.circ(AX + 28, 300, 22); s.circ(AX + 28, 300, 16); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; s.circ(AX + 28 + Math.cos(a) * 19, 300 + Math.sin(a) * 19, 1.3, 't'); }
    s.hatch([AX - 105, 300, AX - 62, 300, AX - 62, 342, AX - 92, 350], 3.2);
    s.line(AX - 150, 268, AX + 150, 268, 'c');
  },
  armR(s) {
    const x = AX - 166;
    const sh = s.rock(x, 268, 26, 23, 401, 10); s.fill(sh, 0.12); s.arc(x - 2, 262, 22, 15, Math.PI * 1.05, TAU * 0.98, 'o'); s.hatch([x - 22, 262, x + 20, 262, x + 18, 252, x - 20, 252], 2.2);
    const up = stone(s, x - 4, 334, 15, 26, 411, 0.12, 9);
    const fo = stone(s, x - 7, 404, 17, 28, 421, 0.12, 9);
    s.ell(x - 7, 396, 18, 5); s.ell(x - 7, 400, 18, 5, 't');
    fist(s, x - 8, 470, 22, 431);
    for (const [y0, y1] of [[290, 310], [358, 378], [430, 450]]) { s.line(x - 1, y0, x - 1, y1); s.line(x + 5, y0, x + 5, y1); s.line(x + 2, y0 - 3, x + 2, y1 + 3, 't'); }
    s.line(x + 28, 268, AX - 108, 268, 'c'); void up; void fo;
  },
  armL(s) {
    const x = AX + 166;
    const sh = s.rock(x, 268, 26, 23, 402, 10); s.fill(sh, 0.12); s.arc(x + 2, 262, 22, 15, Math.PI * 1.02, TAU * 0.95, 'o'); s.hatch([x - 20, 262, x + 22, 262, x + 20, 252, x - 18, 252], 2.2);
    stone(s, x + 4, 334, 15, 26, 412, 0.12, 9);
    stone(s, x + 7, 404, 17, 28, 422, 0.12, 9);
    s.ell(x + 7, 396, 18, 5); s.ell(x + 7, 400, 18, 5, 't');
    fist(s, x + 8, 470, 22, 432);
    for (const [y0, y1] of [[290, 310], [358, 378], [430, 450]]) { s.line(x + 1, y0, x + 1, y1); s.line(x - 5, y0, x - 5, y1); s.line(x - 2, y0 - 3, x - 2, y1 + 3, 't'); }
    s.line(x - 28, 268, AX + 108, 268, 'c');
  },
  coil(s) {
    for (let i = 0; i < 5; i++) { const y = 444 + i * 12, rx = 54 - i * 5; s.arc(AX, y, rx, 9, 0, Math.PI, 'o'); s.arc(AX, y, rx, 9, Math.PI, TAU, 'h'); }
    s.box(AX - 9, 432, 18, 66); s.hatch([AX - 9, 432, AX + 9, 432, AX + 9, 498, AX - 9, 498], 2.4);
    for (const [x, y, r, sd] of [[AX - 78, 452, 8, 301], [AX + 80, 474, 7, 302], [AX + 34, 520, 6, 303]] as [number, number, number, number][]) stone(s, x, y, r, r * 0.86, sd);
    s.arc(AX, 476, 82, 26, 0.2, 2.9, 'h');
    s.dim(AX - 54, 444, AX + 54, 444, -20, 'D 108', 5);
  },
  reactor(s) {
    const x = AX + 190, y = 156;
    s.circ(x, y, 30); s.circ(x, y, 22); s.fill(circlePts(x, y, 22), 0.08);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; s.circ(x + Math.cos(a) * 26, y + Math.sin(a) * 26, 1.8, 't'); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; s.pl([x + Math.cos(a - 0.35) * 5, y + Math.sin(a - 0.35) * 5, x + Math.cos(a) * 17, y + Math.sin(a) * 17, x + Math.cos(a + 0.35) * 5, y + Math.sin(a + 0.35) * 5], 'o'); }
    s.circ(x, y, 4); s.fillEll(x, y, 4, 4, 0.45);
    s.line(AX + 28, 300, x - 16, y + 26, 'c');
  },
  plating1(s) { plateDraw(s, AX - 206, 588, 1); },
  plating2(s) { plateDraw(s, AX - 136, 588, 2); },
  plating3(s) { plateDraw(s, AX - 66, 588, 3); },
  colossus(s) {
    // the full-size machine as phantom lines around the whole assembly, and its design height
    s.arc(AX, 112, 62, 58, 0, TAU, 'p'); s.arc(AX, 306, 150, 112, 0, TAU, 'p');
    s.pl([AX - 160, 252, AX - 206, 300, AX - 214, 420, AX - 206, 520], 'p'); s.pl([AX + 160, 252, AX + 206, 300, AX + 214, 420, AX + 206, 520], 'p');
    s.arc(AX, 480, 74, 40, 0, TAU, 'p');
    const X = AX - 232;
    s.line(X - 8, 50, AX - 64, 50, 't'); s.line(X - 8, 528, AX - 150, 528, 't');
    s.line(X, 54, X, 524, 't'); s.arrowHead(X, 300, X, 54, 4); s.arrowHead(X, 300, X, 524, 4);
    s.text('DESIGN HT', X, 536, 5.5, { align: 'c' }); s.text('2.40 M', X, 546, 5.5, { align: 'c' });
  },
};
function circlePts(x: number, y: number, r: number) { const p: number[] = []; for (let i = 0; i < 24; i++) { const t = (i / 24) * TAU; p.push(x + Math.cos(t) * r, y + Math.sin(t) * r); } return p; }
function plateDraw(s: Sk, x: number, y: number, n: number) {
  const w = 62, h = 40, ch = 5;
  const p = [x + ch, y, x + w - ch, y, x + w, y + ch, x + w, y + h - ch, x + w - ch, y + h, x + ch, y + h, x, y + h - ch, x, y + ch];
  s.pl(p, 'o', true); s.fill(p, 0.1);
  if (n >= 2) { s.pl([x + 4, y - 4, x + w + 4, y - 4, x + w + 4, y + h - 4], 't'); }
  if (n >= 3) { s.pl([x + 8, y - 8, x + w + 8, y - 8, x + w + 8, y + h - 8], 't'); s.hatch([x, y + h - 10, x + w, y + h - 10, x + w, y + h - ch, x + w - ch, y + h, x + ch, y + h, x, y + h - ch], 3, -Math.PI / 4); }
  for (const [rx, ry] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) s.circ(rx, ry, 1.5, 't');
  s.text('I'.repeat(n), x + w / 2, y + 14, 9, { align: 'c', k: 'o', wobble: 0.04 });
}

// ------------------------------------------------------------------ assemble the node table
const CH_POS: Record<string, { b: [number, number]; to: [number, number]; l: [number, number, 'l' | 'c' | 'r'] }> = {
  head: { b: [628, 66], to: [722, 104], l: [628, 80, 'c'] },
  torso: { b: [628, 152], to: [676, 252], l: [628, 166, 'c'] },
  armR: { b: [560, 228], to: [578, 252], l: [560, 206, 'c'] },
  armL: { b: [972, 228], to: [946, 252], l: [972, 206, 'c'] },
  coil: { b: [868, 560], to: [812, 506], l: [882, 558, 'l'] },
  reactor: { b: [990, 106], to: [970, 132], l: [990, 86, 'r'] },
  plating1: { b: [587, 566], to: [587, 588], l: [587, 636, 'c'] },
  plating2: { b: [657, 566], to: [657, 588], l: [657, 636, 'c'] },
  plating3: { b: [727, 566], to: [727, 588], l: [727, 636, 'c'] },
  colossus: { b: [530, 586], to: [530, 564], l: [540, 604, 'r'] },
};
const SHORT: Record<string, string> = {
  head: 'SURVEY HEAD', torso: 'CORE HOUSING', armR: 'ARM, R.H.', armL: 'ARM, L.H.', coil: 'GRAVITY COIL', reactor: 'REACTOR BLOOM', plating1: 'PLATE I', plating2: 'PLATE II', plating3: 'PLATE III', colossus: 'COLOSSUS FRAME',
};
function shortName(id: string) { return SHORT[id] ?? SKILL[id].name.toUpperCase(); }
export const NODES: Record<string, NodeDef> = {};
for (const id of Object.keys(CHASSIS_DRAW)) {
  if (!SKILL[id]) continue;
  const s = new Sk(ITEM[id] * 13); CHASSIS_DRAW[id](s);
  const P = CH_POS[id], bb = s.bbox();
  NODES[id] = {
    id, item: ITEM[id], branch: 'chassis', chassis: true, sk: s, bx: P.b[0], by: P.b[1], leader: [P.to[0], P.to[1], P.b[0], P.b[1]],
    lx: P.l[0], ly: P.l[1], la: P.l[2], label: shortName(id), nx: P.l[2] === 'r' ? P.l[0] : P.l[0], ny: P.l[1] + 12, na: P.l[2],
    hit: id === 'colossus' ? { x: AX - 248, y: 46, w: 32, h: 510 } : { x: bb.x, y: bb.y, w: bb.w, h: bb.h }, cx: id === 'colossus' ? AX - 232 : (bb.x + bb.w / 2), cy: id === 'colossus' ? 300 : (bb.y + bb.h / 2),
  };
}
// which detail an id belongs to: listed explicitly, or by what it grows from (the works, the bioworks), else by branch
const LISTED = new Set(REGIONS.flatMap((R) => R.rows.flat()).filter(Boolean) as string[]);
function needs(id: string, root: string, seen = new Set<string>()): boolean {
  if (id === root) return true; if (seen.has(id) || !SKILL[id]) return false; seen.add(id);
  return SKILL[id].req.some((r) => needs(r, root, seen));
}
const BY_BRANCH: Record<string, string> = { harvest: 'harvest', gravity: 'gravity', combat: 'combat', fabrication: 'fabrication', lab: 'lab', chassis: 'industry' };
function regionFor(id: string) { return id.startsWith('bt_') || needs(id, 'bt_works') ? 'biotech' : needs(id, 'works') ? 'industry' : BY_BRANCH[SKILL[id].branch] ?? 'industry'; }
for (const id of Object.keys(SKILL)) {
  if (id === 'head' || NODES[id] || LISTED.has(id)) continue;
  const R = REGIONS.find((r) => r.key === regionFor(id))!;
  // the first empty cell in reading order, else a new column (the detail tightens to make room)
  let put = false;
  for (const row of R.rows) { const i = row.indexOf(null); if (i >= 0) { row[i] = id; put = true; break; } if (row.length < R.cols) { row.push(id); put = true; break; } }
  if (!put) { const r = R.rows.reduce((b, row, i) => (row.length < R.rows[b].length ? i : b), 0); R.rows[r].push(id); }
}
for (const R of REGIONS) {
  const cols = Math.max(R.cols, ...R.rows.map((r) => r.length)), cw = R.w / cols, sc = Math.min(1, cw / 117);
  R.rows.forEach((row, r) => row.forEach((id, c) => {
    if (!id || !SKILL[id] || NODES[id]) return;
    const cx = R.x + c * cw + cw / 2 + 8 * sc, cy = R.y + 22 + r * R.ch + 50;
    const s = new Sk(ITEM[id] * 17); s.at(cx, cy, sc); (D[id] ?? generic)(s); s.at(0, 0);
    const bx = cx - 56 * sc, by = cy - 40;
    NODES[id] = {
      id, item: ITEM[id], branch: SKILL[id].branch, chassis: false, sk: s, bx, by, leader: [cx - 46 * sc, cy - 30, bx, by],
      lx: cx, ly: cy + 40, la: 'c', label: shortName(id), nx: cx, ny: cy + 52, na: 'c', lw: cw - 10,
      hit: { x: cx - 64 * sc, y: cy - 52, w: 116 * sc, h: 104 }, cx, cy, cell: { r, c, region: R.key },
    };
  }));
}
/** a part nobody has drawn yet: a blank detail frame with the item's name pencilled in */
function generic(s: Sk) { s.box(-36, -24, 72, 48, 'h'); s.line(-36, -24, 36, 24, 't'); s.line(36, -24, -36, 24, 't'); s.text('TO BE DRAWN', 0, -3, 6, { align: 'c' }); }

/** requirement lines inside a detail: from the prerequisite's balloon to the dependent's, along the balloon rows and
 *  the gutters between cells, ending in an arrowhead */
export interface ReqLine { from: string; to: string; sk: Sk }
export const REQ_LINES: ReqLine[] = [];
/** requirements that cross details or reach into VIEW A become typed cross-references */
export const XREF: Record<string, string[]> = {};
for (const id of Object.keys(NODES)) {
  const n = NODES[id];
  for (const req of SKILL[id].req) {
    const m = NODES[req];
    if (!m) continue;
    if (n.chassis && m.chassis) {
      // inside the exploded view: a thin dimension-style line between balloons
      const s = new Sk(n.item * 3 + m.item);
      const dx = n.bx - m.bx, dy = n.by - m.by, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      s.line(m.bx + ux * 11, m.by + uy * 11, n.bx - ux * 12, n.by - uy * 12, 'h'); s.arrowHead(m.bx, m.by, n.bx - ux * 11, n.by - uy * 11, 3.5, 't');
      REQ_LINES.push({ from: req, to: id, sk: s });
      continue;
    }
    if (!n.cell || !m.cell || n.cell.region !== m.cell.region) { (XREF[id] ??= []).push(req); continue; }
    const s = new Sk(n.item * 5 + m.item), r = 10.5;
    const sameRow = n.cell.r === m.cell.r, adj = sameRow && Math.abs(n.cell.c - m.cell.c) === 1;
    if (adj) { const sg = Math.sign(n.bx - m.bx); s.line(m.bx + sg * r, m.by, n.bx - sg * (r + 1), n.by, 't'); s.arrowHead(m.bx, m.by, n.bx - sg * (r + 0.5), n.by, 3.5); }
    else if (sameRow) { const y = m.by - 18; s.pl([m.bx, m.by - r, m.bx, y, n.bx, y, n.bx, n.by - r - 0.5], 't'); s.arrowHead(n.bx, y, n.bx, n.by - r - 0.5, 3.5); }
    else if (n.cell.c === m.cell.c) { s.line(m.bx, m.by + r, n.bx, n.by - r - 0.5, 't'); s.arrowHead(m.bx, m.by, n.bx, n.by - r - 0.5, 3.5); }
    else { const y = n.by - 18; s.pl([m.bx, m.by + r, m.bx, y, n.bx, y, n.bx, n.by - r - 0.5], 't'); s.arrowHead(n.bx, y, n.bx, n.by - r - 0.5, 3.5); }
    REQ_LINES.push({ from: req, to: id, sk: s });
  }
}

/** the static linework of the sheet: border, zones, detail titles, VIEW A axis, general notes */
export function sheetBase(): Sk {
  const s = new Sk(5);
  s.box(18, 18, SW - 36, SH - 36, 't'); s.box(30, 30, SW - 60, SH - 60);
  for (let i = 1; i < 8; i++) { const x = 30 + ((SW - 60) * i) / 8; s.line(x, 18, x, 30, 't'); s.line(x, SH - 30, x, SH - 18, 't'); }
  for (let i = 1; i < 4; i++) { const y = 30 + ((SH - 60) * i) / 4; s.line(18, y, 30, y, 't'); s.line(SW - 30, y, SW - 18, y, 't'); }
  for (let i = 0; i < 8; i++) { const x = 30 + ((SW - 60) * (i + 0.5)) / 8; s.text(String(8 - i), x, 21, 6, { align: 'c' }); s.text(String(8 - i), x, SH - 27, 6, { align: 'c' }); }
  for (let i = 0; i < 4; i++) { const y = 30 + ((SH - 60) * (i + 0.5)) / 4; s.text('DCBA'[i], 24, y - 3, 6, { align: 'c' }); s.text('DCBA'[i], SW - 24, y - 3, 6, { align: 'c' }); }
  for (const R of REGIONS) s.text(R.title, R.x + 4, R.y + R.h - 10, 7.5, { slant: 0.06 });
  s.text('VIEW A  -  EXPLODED ASSEMBLY, UNIT 07  -  SCALE 1:4', VIEW_A.x + VIEW_A.w / 2 + 40, VIEW_A.y + VIEW_A.h + 2, 7.5, { align: 'c' });
  s.line(AX, 34, AX, 640, 'c');
  return s;
}

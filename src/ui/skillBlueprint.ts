// Inks the assembly drawing onto canvases that become textures on the light table: the sheet itself (redrawn when
// the state of an item changes), a transparent overlay for the moments in between (ink drawing itself along a part,
// a red pencil circle going on, the eraser lifting it, the stamp's fresh print), and the typed spec card.
import { SKILL, RES, type Res } from '../game/skills';
import { C, Sk, ink, penAt, paper, folds, coffeeRing, tape, stampArt, textWidth, type Style } from './skillDraft';
import { NODES, REQ_LINES, XREF, ITEM, SW, SH, TITLE, sheetBase, type NodeDef } from './skillSheet';
import { hashf } from '../limbo/core/rng';

export type NState = 'locked' | 'avail' | 'can' | 'staged' | 'owned';
export interface SheetData {
  states: Record<string, NState>; queue: string[];
  res: Record<Res, number>; after: Record<Res, number>; cells: number; cellsAfter: number;
  rev: number; revLog: string[];
  /** items whose ink is being laid by the overlay right now (drawn faint on the sheet) */
  inking: Set<string>;
}
const ST: Record<NState, Style> = {
  owned: { col: C.ink, a: 0.96, wo: 1.25, wt: 0.62, fills: 1.25, hatch: true, centre: true },
  can: { col: C.ink, a: 0.95, wo: 1.1, wt: 0.58, fills: 0, hatch: true, centre: true },
  staged: { col: C.ink, a: 0.95, wo: 1.1, wt: 0.58, fills: 0, hatch: true, centre: true },
  avail: { col: C.ink, a: 0.6, wo: 1.0, wt: 0.55, fills: 0, hatch: true, centre: true },
  locked: { col: C.pencil, a: 0.4, wo: 0.7, wt: 0.45, fills: 0, hatch: false, centre: false },
};
const NOTES = ['WE CAN AFFORD THIS ONE!', 'THIS ONE NEXT?', 'CHEAP. DO IT.', 'OK BY ME - R.C.', 'YES!  - R.C.', 'GO AHEAD', 'WORTH IT'];
const RES_NAME: Record<Res, string> = { ore: 'ORE', carbon: 'CARBON', water: 'WATER', soil: 'SOIL' };
const REV = (n: number) => (n < 26 ? String.fromCharCode(65 + n) : 'A' + String.fromCharCode(65 + (n - 26) % 26));
export const revLetter = REV;
const base = sheetBase();
const TAU = Math.PI * 2;

/** text in technical lettering, recorded then inked in one go */
function letter(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, a: number, k: number, o: { align?: 'l' | 'c' | 'r'; slant?: number; wobble?: number; w?: number; seed?: number } = {}) {
  const sk = new Sk(o.seed ?? Math.round(x * 7 + y)); sk.text(s, x, y, size, { align: o.align, slant: o.slant, wobble: o.wobble, k: 't' });
  ink(g, sk, { col, a, wo: 1, wt: o.w ?? 0.55, fills: 0, hatch: false, centre: false }, 1);
  void k;
}
function typed(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, a = 0.9, align: CanvasTextAlign = 'left') {
  g.save(); g.globalAlpha = a; g.fillStyle = col; g.font = `${size}px VT, monospace`; g.textAlign = align; g.textBaseline = 'top'; g.fillText(s, x, y); g.restore();
}

export class Blueprint {
  readonly cv = document.createElement('canvas');
  readonly ov = document.createElement('canvas');
  private g: CanvasRenderingContext2D; private og: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  constructor(readonly k: number, readonly ok: number) {
    this.cv.width = Math.round(SW * k); this.cv.height = Math.round(SH * k);
    this.ov.width = Math.round(SW * ok); this.ov.height = Math.round(SH * ok);
    this.g = this.cv.getContext('2d')!; this.og = this.ov.getContext('2d')!;
  }
  /** the paper, its border and everything that never changes, cached */
  private background() {
    if (this.bg) return this.bg;
    const c = document.createElement('canvas'); c.width = this.cv.width; c.height = this.cv.height;
    const g = c.getContext('2d')!, k = this.k;
    g.setTransform(k, 0, 0, k, 0, 0);
    paper(g, SW, SH); folds(g, SW, SH, k);
    coffeeRing(g, 1032, 1086, 44, k);
    ink(g, base, { col: C.ink, a: 0.9, wo: 1.25, wt: 0.6, fills: 0, hatch: true, centre: true }, 1);
    return (this.bg = c);
  }
  render(d: SheetData) {
    const g = this.g, k = this.k;
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.background(), 0, 0);
    g.setTransform(k, 0, 0, k, 0, 0);
    // requirement lines first, under the parts
    for (const L of REQ_LINES) {
      const on = d.states[L.from] === 'owned';
      ink(g, L.sk, on ? { col: C.ink, a: 0.7, wo: 1, wt: 0.55, fills: 0, hatch: false, centre: false } : { col: C.pencil, a: 0.38, wo: 0.8, wt: 0.45, fills: 0, hatch: false, centre: false }, 1);
    }
    for (const n of Object.values(NODES)) this.node(g, n, d);
    this.titleBlock(g, d);
    // tape over the corners goes on last
    tape(g, 70, 46, 92, 22, -0.72, 1); tape(g, SW - 70, 44, 92, 22, 0.7, 2); tape(g, 66, SH - 48, 88, 22, 0.66, 3); tape(g, SW - 72, SH - 42, 88, 22, -0.64, 4);
  }
  private node(g: CanvasRenderingContext2D, n: NodeDef, d: SheetData) {
    const id = n.id, st = d.states[id] ?? 'locked', inking = d.inking.has(id), k = this.k;
    const s = inking ? ST.locked : ST[st];
    if (st === 'locked') {
      // construction lines first: the part is still being laid out
      const b = n.sk.bbox(); g.save(); g.strokeStyle = C.pencil; g.globalAlpha = 0.16; g.lineWidth = 0.35;
      g.beginPath(); g.moveTo(b.x - 10, b.y); g.lineTo(b.x + b.w + 10, b.y); g.moveTo(b.x - 10, b.y + b.h); g.lineTo(b.x + b.w + 10, b.y + b.h);
      g.moveTo(b.x, b.y - 8); g.lineTo(b.x, b.y + b.h + 8); g.moveTo(b.x + b.w, b.y - 8); g.lineTo(b.x + b.w, b.y + b.h + 8); g.stroke(); g.restore();
    }
    ink(g, n.sk, s, 1);
    // leader, balloon, item number
    const lit = st !== 'locked', col = lit ? C.ink : C.pencil, a = lit ? (st === 'avail' ? 0.7 : 0.95) : 0.45;
    const bs = new Sk(n.item * 31);
    if (n.leader) bs.leader(n.leader[2], n.leader[3], n.leader[0], n.leader[1]);
    bs.circ(n.bx, n.by, 11);
    if (st === 'owned') bs.fillEll(n.bx, n.by, 11, 11, 0.16);
    bs.text(String(n.item), n.bx, n.by - 4.5, 9, { align: 'c', wobble: 0.05, slant: 0.04 });
    ink(g, bs, { col, a, wo: 1.1, wt: 0.75, fills: 1, hatch: false, centre: false }, 1);
    // label and the typed line under it
    const ls = n.lw ? Math.min(8, n.lw / Math.max(1, n.label.length * 0.9)) : 8;
    letter(g, n.label, n.lx, n.ly - 4 + (8 - ls) * 0.5, ls, col, a, k, { align: n.la, w: 0.7 });
    const def = SKILL[id];
    const cost = RES.filter((r) => def.cost[r]).map((r) => `${def.cost[r]} ${RES_NAME[r]}`).concat(def.pts ? [`${def.pts} CELL${def.pts > 1 ? 'S' : ''}`] : []).join(' · ');
    const ty = n.ny - 3; let line = 0;
    const tAlign = (n.na === 'c' ? 'center' : n.na === 'r' ? 'right' : 'left') as CanvasTextAlign;
    if (st !== 'owned' && id !== 'head') { typed(g, cost || 'NO MATERIAL', n.nx, ty, 8, lit ? C.ink : C.pencil, lit ? 0.72 : 0.42, tAlign); line++; }
    const xr = XREF[id];
    if (xr && st !== 'owned') { typed(g, 'REQ. ' + xr.map((r) => `ITEM ${ITEM[r]}`).join(', '), n.nx, ty + line * 9, 8, d.states[xr[0]] === 'owned' && xr.every((r) => d.states[r] === 'owned') ? C.ink : C.pencil, 0.55, tAlign); line++; }
    if (st === 'locked') typed(g, 'PENDING APPROVAL', n.nx, ty + line * 9, 7.5, C.pencil, 0.45, tAlign);
    if (st === 'can' && !inking) {
      const note = NOTES[Math.floor(hashf(n.item, 3, 9) * NOTES.length)];
      const nx = n.chassis ? n.lx : n.cx + 10, ny = n.chassis ? n.ly + 22 : n.cy - 46;
      letter(g, note, nx, ny, 5.6, C.silver, 0.9, k, { align: n.chassis ? n.la : 'c', slant: 0.24, wobble: 0.5, w: 0.5, seed: n.item * 5 });
    }
    if (st === 'staged') this.redCircle(g, n, 1, d.queue.indexOf(id) + 1);
    if (st === 'owned' && !inking) this.stamp(g, n, 1, 0.82);
  }
  /** the red pencil loop around a queued item (p = how much of it is drawn) */
  redCircle(g: CanvasRenderingContext2D, n: NodeDef, p: number, num: number) {
    const b = n.sk.bbox(), cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2 + 9, ry = b.h / 2 + 8;
    g.save(); g.strokeStyle = C.red; g.lineCap = 'round'; g.globalAlpha = 0.88;
    const turns = 1.18, N = 90, end = Math.max(1, Math.floor(N * p));
    for (const [w, a, off] of [[1.6, 0.85, 0], [0.8, 0.5, 1.2]] as [number, number, number][]) {
      g.lineWidth = w; g.globalAlpha = a; g.beginPath();
      for (let i = 0; i <= end; i++) {
        const t = (i / N) * turns * TAU - 2.2, wob = 1 + Math.sin(t * 3 + n.item) * 0.025 + (i / N) * 0.06;
        const x = cx + Math.cos(t) * rx * wob + off, y = cy + Math.sin(t) * ry * wob + off * 0.5;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
    if (num > 0 && p >= 1) { const sk = new Sk(num * 7); sk.text(String(num), n.bx + 13, n.by - 20, 9, { slant: 0.2, wobble: 0.3, k: 'r' }); ink(g, sk, { col: C.red, a: 0.9, wo: 1.2, wt: 1.1, fills: 0, hatch: false, centre: false }, 1); }
    g.restore();
  }
  /** APPROVED stamp over the bottom-right of the part (s = scale for the thump, a = ink) */
  stamp(g: CanvasRenderingContext2D, n: NodeDef, s: number, a: number) {
    const img = stampArt(n.item), w = n.chassis ? 56 : 48, h = (w * img.height) / img.width, [x, y] = this.stampAt(n.id);
    const rot = (hashf(n.item, 1, 2) - 0.5) * 0.5;
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s * (s > 1 ? 0.92 : 1)); g.globalAlpha = a;
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.globalAlpha = a * 0.25; g.drawImage(img, -w / 2 + 0.8, -h / 2 + 0.5, w, h); // registration ghost
    g.restore();
  }
  private titleBlock(g: CanvasRenderingContext2D, d: SheetData) {
    const { x, y, w, h } = TITLE, k = this.k;
    const s = new Sk(77);
    s.box(x, y, w, h); s.line(x, y + 20, x + w, y + 20, 't'); s.line(x, y + 44, x + w, y + 44, 't'); s.line(x, y + 64, x + w, y + 64, 't');
    for (const xx of [x + 128, x + 214, x + 300]) s.line(xx, y + 44, xx, y + 64, 't');
    s.line(x + 238, y + 64, x + 238, y + h, 't');
    for (let i = 0; i <= 6; i++) s.line(x, y + 78 + i * 16, x + 238, y + 78 + i * 16, 't');
    for (const xx of [x + 70, x + 126, x + 182]) s.line(xx, y + 64, xx, y + 174, 't');
    ink(g, s, { col: C.ink, a: 0.9, wo: 1.25, wt: 0.6, fills: 0, hatch: false, centre: false }, 1);
    letter(g, 'U.S. PLANETARY CORPS - BUREAU OF FIELD ENGINEERING', x + 6, y + 6, 6.5, C.ink, 0.9, k);
    letter(g, 'UNIT 07 - GENERAL ASSEMBLY', x + 6, y + 25, 8.5, C.ink, 0.95, k, { w: 0.8 });
    letter(g, '& FIELD MODIFICATIONS', x + 6, y + 36, 6, C.ink, 0.85, k);
    const cell = (lab: string, val: string, xx: number, yy: number) => { typed(g, lab, xx + 3, yy + 2, 6.5, C.ink, 0.6); letter(g, val, xx + 3, yy + 11, 6.5, C.ink, 0.95, k); };
    cell('DWG NO.', 'U7-ASSY', x, y + 44); cell('SCALE', '1:4', x + 128, y + 44); cell('SHEET', '1 OF 1', x + 300, y + 44);
    // revision: the last letter struck through, the new one pencilled beside it
    typed(g, 'REV', x + 217, y + 46, 6.5, C.ink, 0.6);
    const rev = REV(d.rev);
    if (d.rev > 0) { letter(g, REV(d.rev - 1), x + 226, y + 55, 6.5, C.ink, 0.5, k); g.save(); g.strokeStyle = C.red; g.globalAlpha = 0.8; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x + 224, y + 61); g.lineTo(x + 234, y + 55); g.stroke(); g.restore(); }
    letter(g, rev, x + 246, y + 53, 9, C.red, 0.95, k, { slant: 0.2, wobble: 0.4, w: 1 });
    // the bill of materials, typed
    typed(g, 'MATERIAL', x + 4, y + 67, 6.5, C.ink, 0.6); typed(g, 'ON HAND', x + 73, y + 67, 6.5, C.ink, 0.6); typed(g, 'QUEUED', x + 129, y + 67, 6.5, C.ink, 0.6); typed(g, 'BALANCE', x + 185, y + 67, 6.5, C.ink, 0.6);
    const rows: [string, number, number][] = RES.map((r) => [RES_NAME[r], Math.floor(d.res[r] ?? 0), Math.floor(d.after[r] ?? 0)]);
    rows.push(['CORE CELLS', d.cells, d.cellsAfter]);
    rows.forEach(([nm, have, after], i) => {
      const yy = y + 80 + i * 16;
      typed(g, nm, x + 4, yy, 8.5, C.ink, 0.9);
      typed(g, String(have), x + 120, yy, 8.5, C.ink, 0.95, 'right');
      if (have !== after) typed(g, '-' + (have - after), x + 176, yy, 8.5, C.red, 0.95, 'right');
      typed(g, String(after), x + 232, yy, 8.5, after < 0 ? C.red : C.ink, 0.95, 'right');
    });
    typed(g, 'DRAWN  R. CALDER   14 NOV 57', x + 4, y + 178, 6.5, C.ink, 0.75);
    typed(g, 'APPROVED', x + 244, y + 67, 6.5, C.ink, 0.6);
    for (let i = 0; i < 3; i++) { const ln = d.revLog[d.revLog.length - 1 - i]; if (ln) typed(g, ln, x + 244, y + 140 + i * 9, 6.5, C.ink, 0.7 - i * 0.15); }
    if (d.rev > 0) { const img = stampArt(d.rev); g.save(); g.translate(x + 311, y + 104); g.rotate(-0.12); g.globalAlpha = 0.82; g.drawImage(img, -60, -22, 120, 45); g.restore(); }
    typed(g, 'NOTES: 1. ITEMS INSTALLED IN FIELD BY UNIT 07.  2. PARTS FROM LOCAL ORE, CARBON, WATER, SOIL.', x + 4, y + h + 4, 6.5, C.ink, 0.6);
    typed(g, '3. CORE CELLS ISSUED PER ADVANCEMENT ONLY.  4. DO NOT SCALE DRAWING.', x + 4, y + h + 12, 6.5, C.ink, 0.6);
  }

  // ---------------------------------------------------------------- the overlay (moments between redraws)
  clearOverlay() { this.og.setTransform(1, 0, 0, 1, 0, 0); this.og.clearRect(0, 0, this.ov.width, this.ov.height); }
  /** ink running along the part: p in 0..1. Returns the pen tip in sheet units */
  inkOn(id: string, p: number): [number, number] | null {
    const n = NODES[id]; if (!n) return null;
    const g = this.og; g.setTransform(this.ok, 0, 0, this.ok, 0, 0);
    const L = n.sk.len * Math.min(1, p * 1.08);
    ink(g, n.sk, { ...ST.owned, fills: p >= 0.92 ? ((p - 0.92) / 0.08) * ST.owned.fills : 0 }, 1, L);
    return penAt(n.sk, L);
  }
  circleOn(id: string, p: number, num: number) { const n = NODES[id]; if (!n) return; this.og.setTransform(this.ok, 0, 0, this.ok, 0, 0); this.redCircle(this.og, n, p, p >= 1 ? num : 0); }
  stampOn(id: string, s: number, a: number) { const n = NODES[id]; if (!n) return; this.og.setTransform(this.ok, 0, 0, this.ok, 0, 0); this.stamp(this.og, n, s, a); }
  /** where on the sheet the stamp lands for an item (sheet units): over the lower right of the part */
  stampAt(id: string): [number, number] {
    const n = NODES[id], b = n.sk.bbox(), w = n.chassis ? 56 : 48;
    return [Math.min(b.x + b.w - w * 0.3, b.x + b.w * 0.8), b.y + b.h * 0.72];
  }
}

// ------------------------------------------------------------------ the typed spec card
export interface CardLine { t: string; red?: boolean; dim?: boolean; big?: boolean }
export function cardLines(id: string | null, st: NState | null, res: Record<Res, number>, cells: number, why: string | null, queuedPos: number): CardLine[] {
  if (!id) return [
    { t: 'U.S.P.C. FORM 7-K  PARTS REQUISITION', dim: true },
    { t: 'UNIT 07 - FIELD ASSEMBLY', big: true },
    { t: '' },
    { t: 'POINT AT AN ITEM ON THE DRAWING.' },
    { t: 'CLICK A LIT ITEM TO QUEUE IT, THEN' },
    { t: 'PRESS THE APPROVED STAMP.' },
    { t: 'THE ERASER TAKES THE LAST ONE BACK.' },
    { t: '' },
    { t: `CORE CELLS IN HAND: ${cells}` },
  ];
  const d = SKILL[id], L: CardLine[] = [];
  L.push({ t: `U.S.P.C. FORM 7-K          ITEM ${ITEM[id] ?? '?'}`, dim: true });
  L.push({ t: d.name.toUpperCase(), big: true });
  const words = d.desc.toUpperCase().split(' '); let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 38) { L.push({ t: cur.trim() }); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) L.push({ t: cur.trim() });
  if (st !== 'owned') {
    L.push({ t: 'MATERIAL       HAVE   NEED', dim: true });
    for (const r of RES) { const need = d.cost[r] ?? 0; if (!need) continue; const have = Math.floor(res[r] ?? 0); L.push({ t: `${RES_NAME[r].padEnd(13)}${String(have).padStart(6)}${String(need).padStart(7)}`, red: have < need }); }
    if (d.pts) L.push({ t: `${'CORE CELLS'.padEnd(13)}${String(cells).padStart(6)}${String(d.pts).padStart(7)}`, red: cells < d.pts });
  }
  if (d.req.length) L.push({ t: 'REQUIRES ' + d.req.map((r) => `#${ITEM[r] ?? '?'} ${SKILL[r]?.name.toUpperCase() ?? r}`).join(', ') });
  const status = st === 'owned' ? 'STATUS: APPROVED AND INSTALLED' : st === 'staged' ? `STATUS: QUEUED (#${queuedPos}) - STAMP TO APPROVE` : st === 'can' ? 'STATUS: AVAILABLE - CLICK TO QUEUE' : 'STATUS: ' + (why ?? 'PENDING').toUpperCase();
  L.push({ t: status, red: st === 'locked' || st === 'avail' });
  return L;
}
/** paint the index card: aged paper, a red top rule, blue lines, typed text up to n characters */
export function paintCard(c: HTMLCanvasElement, lines: CardLine[], n: number) {
  const g = c.getContext('2d')!, W = c.width, H = c.height, s = W / 512;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = C.draft; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, 'rgba(255,250,235,0.18)'); gr.addColorStop(1, 'rgba(90,70,40,0.16)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(184,56,46,0.55)'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(0, 52 * s); g.lineTo(W, 52 * s); g.stroke();
  g.strokeStyle = 'rgba(122,150,170,0.45)'; g.lineWidth = 1 * s;
  for (let y = 80; y < 320; y += 24) { g.beginPath(); g.moveTo(0, y * s); g.lineTo(W, y * s); g.stroke(); }
  g.textBaseline = 'alphabetic';
  let left = n, y = 40;
  for (const ln of lines) {
    if (left <= 0) break;
    const t = ln.t.slice(0, left); left -= ln.t.length + 1;
    g.font = `${(ln.big ? 30 : 20) * s}px VT, monospace`;
    g.fillStyle = ln.red ? C.red : ln.dim ? 'rgba(59,58,54,0.6)' : C.graphite;
    // uneven ribbon: each character a hair lighter or darker
    let x = 18 * s;
    for (let i = 0; i < t.length; i++) { g.globalAlpha = 0.78 + hashf(i, y, 4) * 0.22; g.fillText(t[i], x, y * s + (hashf(i, y, 5) - 0.5) * 0.8 * s); x += g.measureText(t[i]).width; }
    g.globalAlpha = 1;
    y += ln.big ? 32 : 24;
  }
  void textWidth;
}

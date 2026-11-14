// The skill tree: Unit 07's assembly schematic, the heart of the run. A riveted cabinet holds a schematic board with
// six branch rows (CHASSIS, HARVEST, GRAVITY, COMBAT, FABRICATION, LAB); each node is a framed socket with a painted
// icon, wired to its prerequisites by brass and copper pipes routed around the sockets (energy runs along the
// powered ones). Locked sockets are chained and padlocked; buyable ones pulse; owned ones glow. A live three.js scope
// shows the golem as it is actually built; a CRT reads out the node under the pointer. Purchases are staged first
// (the socket clamps in with a ratchet), then CONFIRM installs them all: sparks, an ONLINE stamp, chains dropping
// off whatever they unlocked. UNDO hands the last staged part back. K or Esc closes.
import * as THREE from 'three';
import type { Engine, Screen } from '../app/engine';
import type { Post } from '../gfx/post';
import { Run } from '../game/run';
import { SKILLS, SKILL, BRANCHES, RES, Skills, type Res, type Branch, type SkillDef } from '../game/skills';
import { VeyrChild } from '../game/child';
import { Fx } from '../game/fx';
import { loadLook } from '../game/babyLook';
import { gbuf } from '../gfx/gbuf';
import { el, ui, S as KS, Tip } from './kit';
import { Nixie, Lamp, steamVent } from './gadgets';
import { Pix, GM, BR, CR, PH, AM, INK, plate, text, textW, hazard, vent, bolt, screw, brassWord, dv } from './machine';
import { housing, stencil, crtWell, socket, brassFrame } from './hudArt';
import { skillIcon, kitFor, resGlyph, cellGlyph, branchEmblem, type Kit } from './skillIcons';
import { socketFace, chainsArt, padlockOpen, pulseRing, gearFrames, drawPipe, nozzle, heavyKey, junctionPlate, NODE, CHAIN, type NodeState, type PipeLit, type PipeMat, type KeyCol } from './skillArt';
import { sfx } from '../audio/audio';
import { hashf } from '../limbo/core/rng';
import './skillTree.css';

// ------------------------------------------------------------------ layout of the schematic (art pixels)
/** column order per branch row: sub-chains sit side by side so most pipes are short and straight */
const COLS: Record<Branch, string[]> = {
  chassis: ['torso', 'armR', 'armL', 'coil', 'reactor', 'plating1', 'plating2', 'plating3', 'colossus'],
  harvest: ['intake', 'siphon', 'drill', 'magnet', 'excavate', 'bore', 'tanks', 'refinery'],
  gravity: ['lift', 'repulse', 'shape', 'slam', 'well', 'amp', 'storm'],
  combat: ['punch', 'frenzy', 'plow', 'rock', 'shrapnel', 'boulder', 'servo'],
  fabrication: ['graft', 'sow', 'grove', 'convert', 'command', 'print'],
  lab: ['lab', 'splice', 'sequencer', 'vat', 'cloner'],
};
const BRANCH_NAME: Record<Branch, string> = { chassis: 'CHASSIS', harvest: 'HARVEST', gravity: 'GRAVITY', combat: 'COMBAT', fabrication: 'FAB', lab: 'LAB' };
const BRANCH_LONG: Record<Branch, string> = { chassis: 'Chassis', harvest: 'Harvest', gravity: 'Gravity', combat: 'Combat', fabrication: 'Fabrication', lab: 'Laboratory' };
const NX = 44, NY = 48, X0 = 6, Y0 = 10, RAIL = 40;
const nodeX = (c: number) => X0 + NX * c, nodeY = (r: number) => Y0 + NY * r;
const gutX = (c: number) => X0 + NX * c + 40, cenX = (c: number) => X0 + NX * c + 19, midY = (r: number) => Y0 + NY * r + 19;
const chY = (r: number, k: 0 | 1) => Y0 + NY * r + 40 + k * 5;
const RES_NAME: Record<Res, string> = { ore: 'ORE', carbon: 'CARBON', water: 'WATER', soil: 'SOIL' };

interface Cell { id: string; r: number; c: number }
const CELLS: Cell[] = [];
{
  const used = new Set<string>();
  BRANCHES.forEach((b, r) => {
    const ids = COLS[b].filter((id) => SKILL[id]);
    for (const s of SKILLS) if (s.branch === b && s.id !== 'head' && !ids.includes(s.id)) ids.push(s.id); // nodes added later still show
    ids.forEach((id, c) => { if (!used.has(id)) { used.add(id); CELLS.push({ id, r, c }); } });
  });
}
const CELL: Record<string, Cell> = Object.fromEntries(CELLS.map((c) => [c.id, c]));
const NROW = BRANCHES.length, NCOL = Math.max(...CELLS.map((c) => c.c)) + 1;
const CW = nodeX(NCOL - 1) + NODE + 8, CH = chY(NROW - 1, 1) + 3;

// ------------------------------------------------------------------ pipe routing on a lane grid
type Side = 'l' | 'r' | 't' | 'b';
type Pt = [number, number];
interface Route { from: string; to: string; src: string; pts: Pt[]; mat: PipeMat; s0: Side; s1: Side; flow: Pt[] }
interface User { src: string; dst: string; kind: 'h' | 'v' | 'x' }
const routes: Route[] = [];
{
  const xs = [...new Set([2, ...Array.from({ length: NCOL }, (_, c) => [cenX(c), gutX(c)]).flat()])].sort((a, b) => a - b);
  const ys = [...new Set([...Array.from({ length: NROW + 1 }, (_, r) => [chY(r - 1, 0), chY(r - 1, 1)]).flat(), ...Array.from({ length: NROW }, (_, r) => midY(r))])].sort((a, b) => a - b);
  const NXg = xs.length, NYg = ys.length, ix = new Map(xs.map((x, i) => [x, i])), iy = new Map(ys.map((y, i) => [y, i]));
  const inNode = (x: number, y: number) => CELLS.some((n) => x >= nodeX(n.c) && x <= nodeX(n.c) + NODE - 1 && y >= nodeY(n.r) && y <= nodeY(n.r) + NODE - 1);
  const blocked = new Uint8Array(NXg * NYg);
  for (let j = 0; j < NYg; j++) for (let i = 0; i < NXg; i++) blocked[j * NXg + i] = inNode(xs[i], ys[j]) ? 1 : 0;
  // ports: which node sides plug in at a grid point, and along which axis an unrelated pipe may pass it
  const portAt = new Map<number, { node: string; side: Side }[]>();
  const P = (x: number, y: number) => (iy.get(y)! * NXg + ix.get(x)!);
  const addPort = (node: string, side: Side, x: number, y: number) => { const k = P(x, y); const a = portAt.get(k) ?? []; a.push({ node, side }); portAt.set(k, a); };
  const portXY = (n: Cell, side: Side): Pt => side === 'l' ? [n.c === 0 ? 2 : gutX(n.c - 1), midY(n.r)] : side === 'r' ? [gutX(n.c), midY(n.r)] : side === 't' ? [cenX(n.c), chY(n.r - 1, 1)] : [cenX(n.c), chY(n.r, 0)];
  for (const n of CELLS) for (const s of ['l', 'r', 't', 'b'] as Side[]) { const [x, y] = portXY(n, s); addPort(n.id, s, x, y); }
  for (let r = 0; r < NROW; r++) addPort('head:' + r, 'r', 2, midY(r));
  const segU = new Map<string, User[]>(), ptU = new Map<number, User[]>(), plugged = new Map<number, string[]>(), passed = new Set<number>();
  const segK = (a: number, b: number) => (a < b ? a + ':' + b : b + ':' + a);
  const compat = (us: User[] | undefined, src: string, dst: string) => !us || us.every((u) => u.src === src || u.dst === dst);
  // the edge list: every requirement, head requirements fed from the row's junction plate
  const edges: { from: string; to: string; src: string; a: string }[] = [];
  for (const n of CELLS) for (const req of SKILL[n.id].req) {
    if (req === 'head') edges.push({ from: 'head', to: n.id, src: 'head:' + n.r, a: 'head:' + n.r });
    else if (CELL[req]) edges.push({ from: req, to: n.id, src: req, a: req });
  }
  const rowOf = (id: string) => (id.startsWith('head:') ? +id.slice(5) : CELL[id].r), colOf = (id: string) => (id.startsWith('head:') ? -1 : CELL[id].c);
  edges.sort((e1, e2) => (Math.abs(rowOf(e1.a) - rowOf(e1.to)) * 100 + Math.abs(colOf(e1.a) - colOf(e1.to))) - (Math.abs(rowOf(e2.a) - rowOf(e2.to)) * 100 + Math.abs(colOf(e2.a) - colOf(e2.to))));
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  for (const e of edges) {
    const srcNode = e.a, dstNode = e.to;
    const owners = (k: number) => portAt.get(k) ?? [];
    const relatedPort = (k: number) => owners(k).some((o) => o.node === srcNode || o.node === dstNode);
    const unrelatedPort = (k: number) => owners(k).some((o) => o.node !== srcNode && o.node !== dstNode);
    const starts: { k: number; side: Side; c: number }[] = [], goals = new Map<number, { side: Side; c: number }>();
    if (srcNode.startsWith('head:')) starts.push({ k: P(2, midY(rowOf(srcNode))), side: 'r', c: 0 });
    else for (const s of ['r', 'b', 't'] as Side[]) { const [x, y] = portXY(CELL[srcNode], s); if (iy.has(y)) starts.push({ k: P(x, y), side: s, c: s === 'r' ? 0 : 10 }); }
    for (const s of ['l', 't', 'b'] as Side[]) { const [x, y] = portXY(CELL[dstNode], s); if (iy.has(y)) goals.set(P(x, y), { side: s, c: s === 'l' ? 0 : 10 }); }
    const solve = (relax: boolean) => {
      const N = NXg * NYg * 5, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap: [number, number][] = [];
      const push = (s: number, d: number) => { heap.push([d, s]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
      const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
      const plugOK = (k: number) => !passed.has(k) && (plugged.get(k) ?? []).every((g) => { const [s, d] = g.split('>'); return s === e.src || d === dstNode; });
      for (const s of starts) { if (!plugOK(s.k) && !relax) continue; const st = s.k * 5 + 4; dist[st] = s.c; push(st, s.c); }
      let best = -1;
      while (heap.length) {
        const [d, st] = pop(); if (d > dist[st]) continue;
        const k = Math.floor(st / 5), din = st % 5;
        if (goals.has(k) && (plugOK(k) || relax)) { const g = goals.get(k)!; const ok = g.side === 'l' ? din === 4 || din === 2 || din === 3 || din === 0 : g.side === 't' ? din !== 3 : din !== 2; if (ok) { best = st; break; } }
        const i = k % NXg, j = Math.floor(k / NXg);
        for (let dir = 0; dir < 4; dir++) {
          const ni = i + DX[dir], nj = j + DY[dir]; if (ni < 0 || nj < 0 || ni >= NXg || nj >= NYg) continue;
          const nk = nj * NXg + ni;
          if (blocked[nk]) continue;
          // the point we leave from: turning or passing through someone else's port is not allowed
          if (din !== 4 && din !== dir) { if (unrelatedPort(k) || (relatedPort(k) && !goals.has(k) && !starts.some((s) => s.k === k))) continue; if (!compat(ptU.get(k), e.src, dstNode) && !relax) continue; }
          const L = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]);
          const sk = segK(k, nk), us = segU.get(sk);
          let c = L;
          if (us && us.length) { if (compat(us, e.src, dstNode)) c = L * 0.22; else if (relax) c = L + 600; else continue; }
          if (din !== 4 && din !== dir) c += 14;
          // the point we arrive at
          const horiz = dir < 2;
          const isGoal = goals.has(nk);
          if (unrelatedPort(nk)) {
            // pass straight beside a socket only along the channel / gutter, and only if nobody plugged it
            const o = owners(nk)[0];
            const along = o.side === 'l' || o.side === 'r' ? !horiz : horiz;
            if (!along || (plugged.get(nk)?.length && !relax)) { if (!isGoal) continue; }
          }
          const pu = ptU.get(nk);
          if (pu && !compat(pu, e.src, dstNode)) {
            const cross = pu.every((u) => !compat([u], e.src, dstNode) ? u.kind === (horiz ? 'v' : 'h') : true);
            if (cross) c += 40; else if (relax) c += 600; else continue;
          }
          const ns = nk * 5 + dir, nd = d + c + (isGoal ? goals.get(nk)!.c : 0);
          if (nd < dist[ns]) { dist[ns] = nd; prev[ns] = st; push(ns, nd); }
        }
      }
      if (best < 0) return null;
      const path: number[] = []; for (let s = best; s >= 0; s = prev[s]) path.push(s);
      return path.reverse();
    };
    const path = solve(false) ?? solve(true);
    if (!path) continue;
    const pts = path.map((s) => Math.floor(s / 5));
    // commit occupancy
    const group = e.src + '>' + dstNode;
    for (let q = 0; q < pts.length; q++) {
      const k = pts[q];
      const dIn = q > 0 ? path[q] % 5 : 4, dOut = q + 1 < pts.length ? path[q + 1] % 5 : 4;
      const kind: User['kind'] = dIn !== 4 && dOut !== 4 && dIn === dOut ? (dIn < 2 ? 'h' : 'v') : 'x';
      const a = ptU.get(k) ?? []; a.push({ src: e.src, dst: dstNode, kind }); ptU.set(k, a);
      if (q + 1 < pts.length) { const sk = segK(k, pts[q + 1]); const b = segU.get(sk) ?? []; b.push({ src: e.src, dst: dstNode, kind }); segU.set(sk, b); }
      if (portAt.has(k)) { if (q === 0 || q === pts.length - 1) { const g = plugged.get(k) ?? []; g.push(group); plugged.set(k, g); } else if (unrelatedPort(k)) passed.add(k); }
    }
    const k0 = pts[0], k1 = pts[pts.length - 1];
    const s0 = srcNode.startsWith('head:') ? 'r' : (owners(k0).find((o) => o.node === srcNode)?.side ?? 'r');
    const s1 = owners(k1).find((o) => o.node === dstNode)?.side ?? 'l';
    const XY = (k: number): Pt => [xs[k % NXg], ys[Math.floor(k / NXg)]];
    const edgeOf = (id: string, side: Side): Pt => {
      if (id.startsWith('head:')) return [0, midY(+id.slice(5))];
      const n = CELL[id];
      return side === 'l' ? [nodeX(n.c) - 1, midY(n.r)] : side === 'r' ? [nodeX(n.c) + NODE, midY(n.r)] : side === 't' ? [cenX(n.c), nodeY(n.r) - 1] : [cenX(n.c), nodeY(n.r) + NODE];
    };
    let poly: Pt[] = [edgeOf(srcNode, s0), ...pts.map(XY), edgeOf(dstNode, s1)];
    poly = poly.filter((p, i) => i === 0 || p[0] !== poly[i - 1][0] || p[1] !== poly[i - 1][1]);
    poly = poly.filter((p, i) => i === 0 || i === poly.length - 1 || !((p[0] === poly[i - 1][0] && p[0] === poly[i + 1][0]) || (p[1] === poly[i - 1][1] && p[1] === poly[i + 1][1])));
    const flow: Pt[] = [];
    for (let i = 0; i + 1 < poly.length; i++) { const [ax, ay] = poly[i], [bx, by] = poly[i + 1], n = Math.abs(bx - ax) + Math.abs(by - ay); for (let t = 0; t < n; t++) flow.push([ax + Math.sign(bx - ax) * t, ay + Math.sign(by - ay) * t]); }
    flow.push(poly[poly.length - 1]);
    const cross = e.from !== 'head' && SKILL[e.from].branch !== SKILL[e.to].branch;
    routes.push({ from: e.from, to: e.to, src: e.src, pts: poly, mat: cross ? 'copper' : 'brass', s0, s1, flow });
  }
}
const HEAD_ROWS = new Set(routes.filter((r) => r.from === 'head').map((r) => +r.src.slice(5)));

// ------------------------------------------------------------------ painted modules
const memo = new Map<string, Pix>();
function cached(k: string, f: () => Pix) { let p = memo.get(k); if (!p) { p = f(); memo.set(k, p); if (memo.size > 600) memo.delete(memo.keys().next().value!); } return p; }
function toCanvas(p: Pix, cv?: HTMLCanvasElement) { const c = cv ?? document.createElement('canvas'); c.width = p.w; c.height = p.h; c.getContext('2d')!.putImageData(p.image(), 0, 0); return c; }
const u = (n: number) => `calc(${n}px * var(--s))`;
function put<T extends HTMLElement>(e: T, x: number, y: number, w?: number, h?: number): T {
  e.style.left = u(x); e.style.top = u(y); if (w !== undefined) e.style.width = u(w); if (h !== undefined) e.style.height = u(h); return e;
}
function canvasEl(parent: HTMLElement, p: Pix, x: number, y: number, cls = '') { const c = toCanvas(p); c.className = cls; parent.appendChild(c); return put(c, x, y, p.w, p.h); }

function headerArt(w: number, h: number, compact: boolean) {
  const p = housing(w, h, { cut: [0, 0, 8, 8], seed: 140, rivetStep: 14, noRivets: ['t', 'l', 'r'] });
  for (let x = 0; x < w; x++) { p.set(x, 0, INK); p.set(x, 1, GM[3]); }
  hazard(p, 4, h - 6, 24, 3, 2); hazard(p, w - 28, h - 6, 24, 3, 6, true);
  if (!compact) {
    plate(p, 32, 3, 'U.S. PLANETARY CORPS', 'brass');
    stencil(p, 'DWG 07-K  REV 3', 34, 14, CR[2], 4);
    vent(p, w - 120, 5, 22, 4);
    for (const x of [w - 94, w - 85, w - 76]) socket(p, x, 6, 7, 7, GM[1]);
  }
  // the bed behind the brass letters
  const bw = Math.min(compact ? 120 : 176, w - 120), bx = Math.floor((w - bw) / 2);
  socket(p, bx, 3, bw, h - 7, 0x15181c);
  for (let y = 3; y < h - 4; y++) for (let x = bx; x < bx + bw; x++) p.set(x, y, dv(GM, 2.2 + (hashf(x, y, 5) - 0.5) * 0.6 - (y - 3) / h * 0.6, x, y));
  screw(p, bx + 3, 5, 3); screw(p, bx + bw - 8, 5, 4);
  return { p, bx, bw };
}
function footerArt(w: number, h: number) {
  const p = housing(w, h, { cut: [8, 8, 0, 0], seed: 151, rivetStep: 14, noRivets: ['b', 'l', 'r'] });
  for (let x = 0; x < w; x++) { p.set(x, h - 1, INK); p.set(x, h - 2, GM[2]); }
  return p;
}
function viewerArt(w: number, h: number, win: { x: number; y: number; w: number; h: number }) {
  const p = housing(w, h, { cut: [6, 6, 6, 6], seed: 162, rivetStep: 12 });
  plate(p, 6, 3, 'UNIT 07 - LIVE SCOPE', 'brass');
  crtWell(p, win.x, win.y, win.w, win.h, 4);
  // punch the glass out so the 3D scope shows through
  for (let j = 0; j < win.h; j++) for (let i = 0; i < win.w; i++) {
    const r = 4, cx = Math.min(Math.max(i, r), win.w - 1 - r), cy = Math.min(Math.max(j, r), win.h - 1 - r);
    if (Math.hypot(i - cx, j - cy) <= r) p.clear(win.x + i, win.y + j);
  }
  stencil(p, 'SCOPE MK IV', w - 50, h - 9, CR[2], 3);
  for (const x of [8, 15, 22]) socket(p, x, h - 9, 4, 4, GM[2]);
  bolt(p, w - 10, 3);
  return p;
}
function readoutArt(w: number, h: number) {
  const p = housing(w, h, { cut: [6, 6, 6, 6], tone: 'gun', seed: 173, rivetStep: 12 });
  crtWell(p, 6, 7, w - 12, h - 14, 3);
  return p;
}
function boardArt(w: number, h: number) {
  const p = housing(w, h, { cut: [6, 6, 6, 6], seed: 184, rivetStep: 16 });
  // a deep steel bed for the schematic
  for (let y = 5; y < h - 5; y++) for (let x = 5; x < w - 5; x++) p.set(x, y, dv(GM, 1.35 + (hashf(x >> 2, y >> 2, 9) - 0.5) * 0.5 + (hashf(x, y, 3) - 0.5) * 0.4 - (y / h) * 0.4, x, y));
  for (let x = 5; x < w - 5; x++) { p.set(x, 5, INK); p.set(x, 6, GM[0]); p.set(x, h - 6, GM[4]); }
  for (let y = 5; y < h - 5; y++) { p.set(5, y, INK); p.set(6, y, GM[0]); p.set(w - 6, y, GM[4]); }
  return p;
}
/** schematic sheet under the content: grid, row tracks, stencilled annotations */
function gridArt() {
  return cached('grid', () => {
    const p = new Pix(CW, CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const major = x % 44 === 0 || y % 48 === 0, minor = x % 11 === 0 || y % 12 === 0;
      if (major) p.set(x, y, 0x5ab4c8, 30); else if (minor) p.set(x, y, 0x5ab4c8, 14);
    }
    for (let r = 0; r < NROW; r++) {
      const y0 = nodeY(r) - 2, y1 = nodeY(r) + NODE + 1, n = CELLS.filter((c) => c.r === r).length, x1 = nodeX(n - 1) + NODE + 3;
      for (let y = y0; y <= y1; y++) for (let x = 2; x < x1; x++) p.set(x, y, 0x000000, y === y0 || y === y1 ? 120 : 70);
      for (let x = 2; x < x1; x++) p.set(x, y1 + 1, 0x8ab0b8, 26);

    }
    return p;
  });
}
/** the rail: the trunk from the scope and one junction plate per row */
function railArt(h: number, oy: number, owned: (b: Branch) => [number, number], K: Kit, topCap: boolean) {
  const p = new Pix(RAIL, h);
  const yEnd = oy + midY(NROW - 1);
  drawPipe(p, [[3, topCap ? oy + 2 : 0], [3, yEnd]], 'brass', 'on');
  if (topCap) for (let x = 0; x < 7; x++) { p.set(x, oy, INK); p.set(x, oy + 1, GM[6]); p.set(x, oy + 2, GM[3]); }
  BRANCHES.forEach((b, r) => {
    const y = oy + nodeY(r);
    drawPipe(p, [[3, oy + midY(r)], [7, oy + midY(r)]], 'brass', 'on');
    const [o, t] = owned(b);
    p.blit(junctionPlate(BRANCH_NAME[b], branchEmblem(b, K), o, t, o > 0 || HEAD_ROWS.has(r)), 6, y);
    if (HEAD_ROWS.has(r)) nozzle(p, RAIL - 1, oy + midY(r), 'r', true);
  });
  return p;
}

// ------------------------------------------------------------------ the 3D scope
class Scope {
  readonly scene = new THREE.Scene(); readonly fxs = new THREE.Scene(); readonly cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  readonly fx: Fx; readonly child: VeyrChild;
  yaw = 0.55; spin = 0.22; drag: { x: number; yaw: number } | null = null;
  ty = 1.0; tyGoal = 1.0; dist = 3.6; distGoal = 3.6;
  rect = { x: 0, y: 0, w: 0, h: 0 }; on = false;
  private grid: THREE.LineSegments; private deck: THREE.Mesh;
  constructor() {
    this.scene.background = new THREE.Color(0x07090a);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x403020, 1.5));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-2.5, 4, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8affb8, 1.6); rim.position.set(3, 2, -4); this.scene.add(rim);
    this.fx = new Fx(this.fxs, this.scene);
    this.child = new VeyrChild(this.fx, 1.25, loadLook(), { grown: true });
    this.child.hatch = 1;
    this.child.onAssembled = () => { sfx('crack', 0.7, 0.45); sfx('qte-tick', 1, 0.6); };
    this.scene.add(this.child.root);
    // a turntable deck with a phosphor grid
    const dm = new THREE.MeshLambertMaterial({ color: 0x2a3036 }); gbuf(dm, 1);
    this.deck = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.78, 0.08, 24), dm); this.deck.position.y = -0.05; this.scene.add(this.deck);
    const pos: number[] = [];
    for (let i = -6; i <= 6; i++) { const t = i * 0.4; pos.push(-2.4, 0.002, t, 2.4, 0.002, t, t, 0.002, -2.4, t, 0.002, 2.4); }
    for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2, b = ((k + 1) / 48) * Math.PI * 2; pos.push(Math.cos(a) * 1.3, 0.01, Math.sin(a) * 1.3, Math.cos(b) * 1.3, 0.01, Math.sin(b) * 1.3); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.grid = new THREE.LineSegments(gg, gbuf(new THREE.LineBasicMaterial({ color: 0x1b6630 }), 0)); this.grid.position.y = -0.1; this.scene.add(this.grid);
  }
  /** show exactly the owned chassis parts (head always); new ones fly in and click into place */
  parts(owned: string[], animate: boolean) {
    const added = this.child.setParts(owned, animate);
    const has = (id: string) => owned.includes(id);
    this.tyGoal = has('torso') ? 1.22 : 0.72; this.distGoal = has('torso') ? 3.9 : 1.55;
    this.child.setGrowth(has('colossus') ? 6 : 3.2 + ['torso', 'armR', 'armL', 'coil', 'plating1', 'plating2', 'plating3', 'reactor'].filter(has).length * 0.1);
    return added;
  }
  update(dt: number) {
    if (!this.drag) this.yaw += dt * this.spin;
    this.ty += (this.tyGoal - this.ty) * Math.min(1, dt * 3); this.dist += (this.distGoal - this.dist) * Math.min(1, dt * 2.5);
    const y = this.ty;
    this.cam.position.set(Math.sin(this.yaw) * this.dist, y + 0.3, Math.cos(this.yaw) * this.dist);
    this.cam.lookAt(0, y, 0);
    this.child.look.set(Math.sin(this.yaw) * 6, 2.2, Math.cos(this.yaw) * 6);
    this.child.update(dt, this.cam);
    this.grid.rotation.y = -this.yaw * 0.0;
    this.fx.update(dt, Math.max(1, this.rect.h), 30);
  }
  layout(rect: { x: number; y: number; w: number; h: number }, W: number, H: number) {
    this.rect = rect;
    const rs = W / Math.max(1, innerWidth), cx = (rect.x + rect.w / 2) * rs, cy = (rect.y + rect.h / 2) * rs, wh = Math.max(8, rect.h * rs);
    this.cam.aspect = W / H;
    this.cam.fov = (2 * Math.atan(Math.tan((28 * Math.PI) / 360) * (2 * H) / wh) * 180) / Math.PI;
    this.cam.setViewOffset(2 * W, 2 * H, W - cx, H - cy, W, H);
    this.cam.updateProjectionMatrix();
  }
  dispose() {
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) { for (const v of Object.values(x)) if (v instanceof THREE.Texture) v.dispose(); x.dispose(); } });
  }
}

// ------------------------------------------------------------------ the screen
/** anything that owns a run and an event bus (the Game does) */
export interface SkillHost { run: Run; emit(ev: string, d?: any): void }
interface NodeEl { id: string; def: SkillDef; cell: Cell; e: HTMLDivElement; face: HTMLCanvasElement; ring: HTMLCanvasElement; chains: HTMLCanvasElement; lock: HTMLCanvasElement; q: HTMLDivElement; st: NodeState | '' }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; life: number; col: number; g: number }
interface Key { e: HTMLDivElement; cv: HTMLCanvasElement; lbl: HTMLDivElement; col: KeyCol; w: number; h: number; st: 'n' | 'h' | 'p' | 'd'; dead: () => boolean }

export class SkillTree implements Screen {
  static current: SkillTree | null = null;
  private root: HTMLDivElement;
  private K: Kit;
  private scope: Scope;
  private staged: string[] = [];
  private pending = new Set<string>();
  private nodes = new Map<string, NodeEl>();
  private sel: string | null = null; private hover: string | null = null;
  private W = 0; private H = 0; private compact = false; private s = 2;
  // modules
  private vp!: HTMLDivElement; private content!: HTMLDivElement; private railBox!: HTMLDivElement; private railCv!: HTMLCanvasElement; private railFlow!: HTMLCanvasElement;
  private pipesCv!: HTMLCanvasElement; private flowCv!: HTMLCanvasElement; private gearEls: { cv: HTMLCanvasElement; frames: ImageData[]; dir: number; f: number }[] = [];
  private ro!: HTMLDivElement; private roBox!: HTMLDivElement; private glass: HTMLDivElement | null = null; private sheet: HTMLCanvasElement | null = null;
  private nixie!: Nixie; private resEls = new Map<Res, { e: HTMLDivElement; v: HTMLDivElement; d: HTMLDivElement }>(); private sum!: HTMLDivElement; private cellLbl!: HTMLDivElement;
  private keys: Record<'undo' | 'confirm' | 'close', Key> = {} as any;
  private fxCv!: HTMLCanvasElement; private fxG!: CanvasRenderingContext2D; private sparks: Spark[] = [];
  private tag!: HTMLDivElement; private hintL!: HTMLDivElement; private hintR!: HTMLDivElement;
  private vpRect = { x: 0, y: 0, w: 0, h: 0 };
  private pan = { x: 0, y: 0, tx: 0, ty: 0 }; private fitX = false; private fitY = false; private railOY = 0;
  private drag: { x: number; y: number; px: number; py: number; moved: boolean; node: string | null; id: number } | null = null;
  private sig = ''; private lastRes: Record<Res, number>; private lastPts: number; private gain: Partial<Record<Res, number>> = {}; private gainT = 0;
  private t = 0; private flowT = 0; private gearT = 0; private relayoutT: number | null = null; private closed = false;
  private pipeSig = '';

  constructor(readonly host: SkillHost, readonly opts: { close: () => void }) {
    SkillTree.current = this;
    this.K = kitFor(loadLook());
    this.scope = new Scope();
    this.lastRes = { ...host.run.res }; this.lastPts = host.run.skills.points;
    this.root = el('div', 'sk opening', ui());
    setTimeout(() => this.root.classList.remove('opening'), 500);
    this.build();
    addEventListener('keydown', this.onKey);
    addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); addEventListener('pointercancel', this.onUp);
    sfx('open'); setTimeout(() => sfx('crack', 0.5, 0.3), 120); setTimeout(() => sfx('qte-tick', 1, 0.5), 260);
  }

  // ---------------------------------------------------------------- building the cabinet
  private build() {
    const s = (this.s = KS || 2);
    this.W = Math.floor(innerWidth / s); this.H = Math.floor(innerHeight / s);
    const W = this.W, H = this.H;
    this.compact = W < 560 || H < 290;
    this.root.innerHTML = ''; this.nodes.clear(); this.gearEls = []; this.glass = null; this.sheet = null; this.fault = null;
    this.root.classList.toggle('compact', this.compact);
    const C = this.compact, R = this.root;
    const twoRow = W < 340;
    const hh = C ? 18 : 20, fh = twoRow ? 52 : 28;
    // header
    const hdr = put(el('div', 'mod sk-hdr', R), 0, 0, W, hh);
    const ha = headerArt(W, hh, C); canvasEl(hdr, ha.p, 0, 0, 'art');
    void brassWord('SKILL TREE', 'Jersey', C ? 15 : 20).then((cv) => {
      if (this.closed || !hdr.isConnected) return;
      const t = cropCanvas(cv); const maxH = hh - 6;
      const k = t.height > maxH ? maxH / t.height : 1, tw = Math.round(t.width * k), th = Math.round(t.height * k);
      t.className = 'sk-title'; put(t, Math.floor((W - tw) / 2), Math.floor((hh - 2 - th) / 2) + 1, tw, th); hdr.appendChild(t);
    });
    if (!C) {
      const sub = el('div', 'sk-sub', hdr, 'UNIT 07 FIELD ASSEMBLY'); put(sub, ha.bx + ha.bw + 6, 7);
      // pilot lamps: power steady, the bus blinking, a red fault lamp that only wakes when something is refused
      new Lamp(hdr, W - 94, 6, 'g').set('on');
      new Lamp(hdr, W - 85, 6, 'a').set('blink');
      this.fault = new Lamp(hdr, W - 76, 6, 'r'); this.fault.set('dim');
      steamVent(hdr, W - 109, 16, 7);
    }
    this.keys.close = this.key(hdr, W - 50, 2, 44, hh - 4 > 18 ? 18 : hh - 4, 'r', C ? 'X' : 'CLOSE', 'K', () => this.close(), () => false);
    // footer
    const fy = H - fh;
    const ft = put(el('div', 'mod sk-ft', R), 0, fy, W, fh);
    const fa = footerArt(W, fh);
    // resource readouts
    const rx0 = 8, ry = twoRow ? 6 : 6, rw = C ? 36 : 46;
    RES.forEach((r, i) => { const x = rx0 + i * rw; socket(fa, x - 2, ry - 2, rw - 4, 21, 0x0a120c); });
    const cx0 = rx0 + 4 * rw + (C ? 4 : 10), cyy = twoRow ? 30 : 5;
    const cellX = twoRow ? 8 : cx0;
    brassFrame(fa, cellX + 2, cyy + 2, 30, 17);
    canvasEl(ft, fa, 0, 0, 'art');
    RES.forEach((r, i) => {
      const x = rx0 + i * rw, e = put(el('div', 'sk-res', ft), x, ry, rw - 6, 20);
      canvasEl(e, resGlyph(r), 0, 1);
      const v = el('div', 'v', e, '0'), d = el('div', 'd', e, '');
      e.addEventListener('pointerenter', () => Tip.show(`<h4>${RES_NAME[r]}</h4>${resTip(r)}`, e)); e.addEventListener('pointerleave', () => Tip.hide());
      this.resEls.set(r, { e, v, d });
    });
    this.nixie = new Nixie(ft, 3, cellX + 4, cyy + 3, true);
    const cl = el('div', 'sk-lbl', ft, twoRow ? 'CELLS' : 'CORE CELLS'); put(cl, cellX + 36, cyy + 3);
    this.cellLbl = el('div', 'sk-lbl amb', ft, ''); put(this.cellLbl, cellX + 36, cyy + 11);
    const kc = twoRow ? 54 : 66, ku = twoRow ? 40 : 52, kh = 22;
    const ky = twoRow ? fh - kh - 4 : 3;
    this.keys.confirm = this.key(ft, W - kc - 6, ky, kc, kh, 'g', 'CONFIRM', '↵', () => this.confirm(), () => !this.staged.length);
    this.keys.undo = this.key(ft, W - kc - ku - 10, ky, ku, kh, 'a', 'UNDO', 'Z', () => this.undo(), () => !this.staged.length);
    if (!C && !twoRow) { const sx = cellX + 82, sw = W - kc - ku - 16 - sx; if (sw > 40) { this.sum = put(el('div', 'sk-sum', ft), sx, 5, sw, 20); } }
    if (!this.sum || !this.sum.isConnected) this.sum = el('div', 'sk-sum', null);
    // body area
    const top = hh + 1, bottom = fy - 1, bh = bottom - top;
    let bx = 2, bw = W - 4;
    if (!C) {
      const lw = 146, vh = Math.min(122, Math.max(90, Math.floor(bh * 0.4)));
      bx = lw + 4; bw = W - bx - 2;
      // scope
      const view = put(el('div', 'mod sk-view', R), 2, top, lw, vh);
      const win = { x: 7, y: 14, w: lw - 14, h: vh - 26 };
      canvasEl(view, viewerArt(lw, vh, win), 0, 0, 'art');
      this.glass = put(el('div', 'sk-glass', view), win.x, win.y, win.w, win.h);
      this.sheet = document.createElement('canvas'); this.sheet.className = 'px'; view.appendChild(this.sheet);
      put(this.sheet, win.x + win.w - 40, win.y + 3, 38, 56); this.sheet.width = 38; this.sheet.height = 56;
      this.scope.on = true;
      this.scopeRect = { x: (2 + win.x) * s, y: (top + win.y) * s, w: win.w * s, h: win.h * s };
      this.glass.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.scope.drag = { x: e.clientX, yaw: this.scope.yaw }; this.glass!.setPointerCapture(e.pointerId); });
      this.glass.addEventListener('pointermove', (e) => { if (this.scope.drag) this.scope.yaw = this.scope.drag.yaw - (e.clientX - this.scope.drag.x) * 0.012; });
      this.glass.addEventListener('pointerup', () => { this.scope.drag = null; });
      // the pipe from the scope into the rail trunk
      const by = top + 20;
      const bp = new Pix(14, 7); drawPipe(bp, [[0, 3], [13, 3]], 'brass', 'on');
      for (let k = 0; k < 7; k++) { bp.set(1, k, k === 0 || k === 6 ? INK : GM[6]); bp.set(2, k, k === 0 || k === 6 ? INK : GM[3]); }
      canvasEl(R, bp, lw - 1, by - 3, 'px').style.zIndex = '3';
      this.bridgeY = by;
      // readout
      const ry0 = top + vh + 2, rh = bottom - ry0;
      const rbox = (this.roBox = put(el('div', 'mod sk-rbox', R), 2, ry0, lw, rh));
      canvasEl(rbox, readoutArt(lw, rh), 0, 0, 'art');
      this.ro = put(el('div', 'sk-ro', rbox), 9, 10, lw - 18, rh - 20);
    } else {
      this.scope.on = false;
      const rh = Math.min(118, Math.floor(bh * 0.62)), rw = Math.min(W - 4, 240);
      const rbox = (this.roBox = put(el('div', 'mod sk-rbox', R), Math.floor((W - rw) / 2), bottom - rh, rw, rh));
      rbox.style.zIndex = '8'; rbox.style.display = 'none';
      canvasEl(rbox, readoutArt(rw, rh), 0, 0, 'art');
      this.ro = put(el('div', 'sk-ro', rbox), 9, 10, rw - 18, rh - 20);
      const x = el('div', 'ro-x', rbox, '✕'); put(x, rw - 14, 4);
      x.addEventListener('pointerdown', (e) => e.stopPropagation());
      x.addEventListener('click', (e) => { e.stopPropagation(); this.select(null); });
    }
    // board
    const board = put(el('div', 'mod sk-board', R), bx, top, bw, bh);
    canvasEl(board, boardArt(bw, bh), 0, 0, 'art');
    const vx = 6, vy = 6, vw = bw - 12, vh2 = bh - 12;
    this.vpRect = { x: bx + vx, y: top + vy, w: vw, h: vh2 };
    this.vp = put(el('div', 'sk-vp', board), vx, vy, vw, vh2);
    this.content = put(el('div', 'sk-content', this.vp), 0, 0, CW, CH);
    this.buildGears();
    canvasEl(this.content, gridArt(), 0, 0, 'px');
    this.pipesCv = document.createElement('canvas'); this.pipesCv.className = 'px'; this.content.appendChild(this.pipesCv); put(this.pipesCv, 0, 0, CW, CH); this.pipesCv.width = CW; this.pipesCv.height = CH;
    this.flowCv = document.createElement('canvas'); this.flowCv.className = 'px'; this.content.appendChild(this.flowCv); put(this.flowCv, 0, 0, CW, CH); this.flowCv.width = CW; this.flowCv.height = CH;
    for (const c of CELLS) this.buildNode(c);
    this.tag = el('div', 'sk-tag', this.content);
    // rail
    this.fitY = CH <= vh2; this.fitX = CW + 12 <= vw - RAIL;
    this.railOY = this.fitY ? Math.floor((vh2 - CH) / 2) : 0;
    const rh2 = this.fitY ? vh2 : CH;
    this.railBox = put(el('div', 'sk-rail', this.vp), 0, 0, RAIL, rh2);
    this.railCv = document.createElement('canvas'); this.railCv.className = 'px'; this.railBox.appendChild(this.railCv); put(this.railCv, 0, 0, RAIL, rh2); this.railCv.width = RAIL; this.railCv.height = rh2;
    this.railFlow = document.createElement('canvas'); this.railFlow.className = 'px'; this.railBox.appendChild(this.railFlow); put(this.railFlow, 0, 0, RAIL, rh2); this.railFlow.width = RAIL; this.railFlow.height = rh2;
    this.hintL = put(el('div', 'sk-hint', this.vp, '◀'), RAIL + 2, Math.floor(vh2 / 2) - 4);
    this.hintR = put(el('div', 'sk-hint', this.vp, '▶'), vw - 8, Math.floor(vh2 / 2) - 4);
    // pan: start at the left / top of the schematic
    this.pan.x = this.pan.tx = this.fitX ? Math.floor((vw - RAIL - CW) / 2) : 4;
    this.pan.y = this.pan.ty = this.fitY ? Math.floor((vh2 - CH) / 2) : 4;
    this.vp.addEventListener('pointerdown', this.onDown);
    this.vp.addEventListener('wheel', this.onWheel, { passive: false });
    // fx layer
    this.fxCv = document.createElement('canvas'); this.fxCv.className = 'sk-fx'; R.appendChild(this.fxCv); this.fxCv.width = W; this.fxCv.height = H;
    this.fxG = this.fxCv.getContext('2d')!;
    // first paint
    this.sig = ''; this.pipeSig = ''; this.roKey = '';
    for (const n of this.nodes.values()) n.st = '';
    this.refresh(true);
    this.applyPan();
    if (this.scope.on) this.scope.layout(this.scopeRect, this.rw, this.rh);
  }
  private scopeRect = { x: 0, y: 0, w: 0, h: 0 }; private bridgeY = 0; private rw = 1; private rh = 1; private fault: Lamp | null = null;

  private buildGears() {
    const G = (r: number, teeth: number, cx: number, cy: number, dir: number, seed: number, dark: number) => {
      const frames = cached(`gear:${r}:${teeth}:${dark}`, () => { const fs = gearFrames(r, teeth, 6, seed, dark); const p = new Pix(fs[0].w * fs.length, fs[0].h); fs.forEach((f, i) => p.blit(f, i * f.w, 0)); return p; });
      const fw = frames.w / 6, fh = frames.h, list: ImageData[] = [];
      for (let i = 0; i < 6; i++) { const q = new Pix(fw, fh); for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const k = (y * frames.w + i * fw + x) * 4, j = (y * fw + x) * 4; q.d[j] = frames.d[k]; q.d[j + 1] = frames.d[k + 1]; q.d[j + 2] = frames.d[k + 2]; q.d[j + 3] = frames.d[k + 3]; } list.push(q.image()); }
      const cv = document.createElement('canvas'); cv.className = 'px'; cv.width = fw; cv.height = fh; this.content.appendChild(cv); put(cv, Math.round(cx - fw / 2), Math.round(cy - fh / 2), fw, fh);
      cv.getContext('2d')!.putImageData(list[0], 0, 0);
      this.gearEls.push({ cv, frames: list, dir, f: 0 });
    };
    const ax = CW * 0.63, ay = CH * 0.56, ra = 78, rb = 40, rc = 24;
    G(ra, 24, ax, ay, 1, 3, 0.85);
    const a1 = -0.72; G(rb, 12, ax + Math.cos(a1) * (ra + rb + 5), ay + Math.sin(a1) * (ra + rb + 5), -1, 5, 0.75);
    const a2 = 2.55; G(rc, 8, ax + Math.cos(a2) * (ra + rc + 5), ay + Math.sin(a2) * (ra + rc + 5), -1, 7, 0.75);
  }

  private buildNode(c: Cell) {
    const def = SKILL[c.id];
    const e = put(el('div', 'sk-node', this.content), nodeX(c.c), nodeY(c.r), NODE, NODE);
    e.dataset.id = c.id;
    const ring = canvasEl(e, cached('ring', () => pulseRing(PH[8])), -3, -3, 'ring');
    const face = document.createElement('canvas'); face.className = 'face'; face.width = NODE; face.height = NODE; e.insertBefore(face, ring);
    const off = Math.floor((CHAIN - NODE) / 2);
    const chains = canvasEl(e, chainsArt(), -off, -off, 'chains');
    const lock = canvasEl(e, padlockOpen(), -off, -off, 'lock'); lock.style.display = 'none';
    const q = el('div', 'q', e, '1');
    e.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'mouse') return; this.hover = c.id; this.showTag(c.id); this.readout(); sfx('hover', 1, 0.6); });
    e.addEventListener('pointerleave', () => { if (this.hover === c.id) { this.hover = null; this.showTag(null); this.readout(); } });
    this.nodes.set(c.id, { id: c.id, def, cell: c, e, face, ring, chains, lock, q, st: '' });
  }
  private key(parent: HTMLElement, x: number, y: number, w: number, h: number, col: KeyCol, label: string, hk: string, run: () => void, dead: () => boolean): Key {
    const e = put(el('div', `sk-key c-${col}`, parent), x, y, w, h);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; e.appendChild(cv);
    const lbl = el('div', 'kl', e, label); lbl.style.height = u(h - 9); if (h < 19) { lbl.style.fontSize = u(8); lbl.style.top = u(2); }
    if (hk) el('div', 'hk', e, hk);
    const k: Key = { e, cv, lbl, col, w, h, st: 'n', dead };
    const draw = (st: Key['st']) => { if (k.st === st && cv.dataset.ok) return; k.st = st; cv.dataset.ok = '1'; cv.getContext('2d')!.putImageData(cached(`key:${w}:${h}:${col}:${st}`, () => heavyKey(w, h, col, st)).image(), 0, 0); e.classList.toggle('down', st === 'p'); e.classList.toggle('dead', st === 'd'); };
    (k as any).draw = draw;
    draw(dead() ? 'd' : 'n');
    e.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (k.dead()) { sfx('deny'); return; } draw('p'); sfx('crack', 0.4, 0.35); });
    e.addEventListener('pointerup', (ev) => { ev.stopPropagation(); if (k.st !== 'p') return; draw(k.dead() ? 'd' : 'h'); run(); this.keyStates(); });
    e.addEventListener('pointerenter', () => { if (!k.dead()) { draw('h'); sfx('hover', 1, 0.5); } });
    e.addEventListener('pointerleave', () => draw(k.dead() ? 'd' : 'n'));
    return k;
  }
  private keyStates() {
    for (const k of Object.values(this.keys)) { const d = k.dead(); const want = d ? 'd' : k.st === 'd' ? 'n' : k.st; (k as any).draw(want); }
    const n = this.staged.length;
    this.keys.confirm.lbl.textContent = n ? `CONFIRM ${n}` : 'CONFIRM';
    this.keys.confirm.e.classList.toggle('ready', n > 0);
  }

  // ---------------------------------------------------------------- state
  private simulate() {
    const sk = this.host.run.skills, res = { ...this.host.run.res } as Record<Res, number>;
    const sim = new Skills(); sim.owned = new Set(sk.owned); sim.points = sk.points;
    const ok: string[] = [];
    for (const id of this.staged) { if (sim.why(id, res) !== null) break; sim.buy(id, res); ok.push(id); }
    if (ok.length !== this.staged.length) this.staged = ok;
    return { sim, res };
  }
  private stateOf(id: string, sim: Skills, res: Record<Res, number>): NodeState {
    if (this.pending.has(id)) return 'staged';
    if (this.host.run.skills.has(id)) return 'owned';
    if (this.staged.includes(id)) return 'staged';
    const d = SKILL[id];
    if (d.req.some((r) => !sim.has(r))) return 'locked';
    return sim.why(id, res) === null ? 'can' : 'avail';
  }
  /** redraw whatever changed; first = no unlock animations */
  private refresh(first = false) {
    const { sim, res } = this.simulate();
    let freed = 0;
    for (const n of this.nodes.values()) {
      const st = this.stateOf(n.id, sim, res);
      if (st === n.st) continue;
      const was = n.st; n.st = st;
      n.face.getContext('2d')!.putImageData(cached(`face:${n.id}:${st}`, () => socketFace(skillIcon(n.id, this.K), st, n.def.pts)).image(), 0, 0);
      for (const k of ['locked', 'avail', 'can', 'staged', 'owned']) n.e.classList.toggle(k, k === st);
      if (st === 'locked') { n.chains.classList.remove('drop'); n.chains.style.display = ''; n.lock.style.display = 'none'; }
      else if (was === 'locked' && !first) {
        n.chains.classList.add('drop'); n.lock.style.display = ''; n.lock.classList.remove('pop'); void n.lock.offsetWidth; n.lock.classList.add('pop');
        setTimeout(() => { n.chains.style.display = 'none'; n.lock.style.display = 'none'; }, 820);
        freed++;
        this.float(n.id, 'FREED', 'free', 0);
      } else { n.chains.style.display = 'none'; n.lock.style.display = 'none'; }
      n.q.textContent = String(this.staged.indexOf(n.id) + 1 || '');
    }
    for (const id of this.staged) { const n = this.nodes.get(id); if (n) n.q.textContent = String(this.staged.indexOf(id) + 1); }
    if (freed) { sfx('crack', 1.6, 0.5); setTimeout(() => sfx('hit', 1.3, 0.35), 120); }
    this.drawPipes(sim);
    this.drawRail();
    this.footer(sim, res);
    this.readout();
    this.drawSheet();
    this.scope.parts([...this.host.run.skills.owned].filter((id) => !this.pending.has(id)), !first);
    this.keyStates();
  }
  private litOf(r: Route, sim: Skills): PipeLit {
    const own = this.host.run.skills;
    const srcOn = r.from === 'head' || own.has(r.from), dstSt = this.staged.includes(r.to) || this.pending.has(r.to);
    if (dstSt && sim.has(r.from)) return 'staged';
    return srcOn && !this.pending.has(r.from) ? 'on' : 'off';
  }
  private drawPipes(sim: Skills) {
    const lits = routes.map((r) => this.litOf(r, sim));
    const sig = lits.join('');
    if (sig === this.pipeSig) return; this.pipeSig = sig;
    const p = new Pix(CW, CH);
    for (const pass of ['off', 'on', 'staged'] as PipeLit[]) routes.forEach((r, i) => { if (lits[i] === pass) drawPipe(p, r.pts, r.mat, pass); });
    routes.forEach((r, i) => {
      const lit = lits[i] !== 'off';
      if (r.from !== 'head') { const [x, y] = r.pts[0]; nozzle(p, x, y, r.s0, lit); }
      const [x, y] = r.pts[r.pts.length - 1]; nozzle(p, x, y, r.s1, lit);
    });
    // stencilled section tags at the end of the shorter rows, riveted over whatever runs behind them
    for (let r = 0; r < NROW; r++) {
      const n = CELLS.filter((c) => c.r === r).length, x = nodeX(n - 1) + NODE + 6, lab = `SEC ${r + 1} ${BRANCH_LONG[BRANCHES[r]].toUpperCase()}`;
      if (x + textW(lab) + 14 < CW) plate(p, x, midY(r) - 4, lab, 'black');
    }
    this.pipesCv.getContext('2d')!.putImageData(p.image(), 0, 0);
    this.lits = lits;
  }
  private lits: PipeLit[] = [];
  private drawRail() {
    const own = this.host.run.skills;
    const count = (b: Branch): [number, number] => { const ids = CELLS.filter((c) => SKILL[c.id].branch === b).map((c) => c.id); return [ids.filter((i) => own.has(i)).length, ids.length]; };
    const sig = BRANCHES.map((b) => count(b).join('/')).join(',') + this.railOY + this.railCv.height;
    if (this.railCv.dataset.sig === sig) return; this.railCv.dataset.sig = sig;
    const p = railArt(this.railCv.height, this.railOY, count, this.K, !this.scope.on);
    if (this.scope.on) { const y = this.bridgeY - this.vpRect.y; if (y > 2 && y < this.railCv.height) drawPipe(p, [[0, y], [3, y]], 'brass', 'on'); }
    this.railCv.getContext('2d')!.putImageData(p.image(), 0, 0);
  }
  private footer(sim: Skills, res: Record<Res, number>) {
    const real = this.host.run.res, sk = this.host.run.skills;
    for (const r of RES) {
      const o = this.resEls.get(r)!; const have = Math.floor(real[r] ?? 0), after = Math.floor(res[r] ?? 0);
      o.v.textContent = fmtN(after); o.d.textContent = have !== after ? `-${fmtN(have - after)}` : '';
    }
    this.nixie.set(sim.points);
    const spent = sk.points - sim.points;
    this.cellLbl.textContent = spent ? `-${spent} QUEUED` : sim.points ? 'READY' : '';
    const owned = CELLS.filter((c) => sk.has(c.id)).length;
    if (this.sum) {
      if (this.staged.length) this.sum.innerHTML = `<span class="amb">${this.staged.length} QUEUED:</span> ${this.staged.map((i) => SKILL[i].name.toUpperCase()).join(', ')}<br><span class="amb">CONFIRM</span> TO INSTALL · <span class="amb">UNDO</span> TO RETURN`;
      else this.sum.innerHTML = `MODULES ONLINE <b>${owned + 1}/${CELLS.length + 1}</b><br>${owned < 4 ? 'GATHER ORE, CARBON, WATER, SOIL' : 'SELECT A LIT SOCKET TO QUEUE IT'}`;
    }
  }

  // ---------------------------------------------------------------- readout
  private roKey = '';
  private readout() {
    const id = this.hover ?? this.sel;
    const { sim, res } = this.simulate();
    const key = (id ?? '-') + '|' + (id ? this.nodes.get(id)?.st : '') + '|' + JSON.stringify(res) + sim.points + this.staged.join(',');
    if (this.compact) this.roBox.style.display = this.sel ? '' : 'none';
    if (key === this.roKey) return; const changed = (this.roKey.split('|')[0] !== (id ?? '-')); this.roKey = key;
    const R = this.ro; R.innerHTML = '';
    if (changed) { R.classList.remove('on'); void R.offsetWidth; R.classList.add('on'); }
    if (!id) {
      const sk = this.host.run.skills, owned = CELLS.filter((c) => sk.has(c.id)).length;
      const box = el('div', 'ro-idle', R);
      el('div', 'big', box, 'UNIT 07 · ASSEMBLY');
      el('p', '', box, `<b>${owned + 1}</b> OF ${CELLS.length + 1} MODULES ONLINE. <b>${sk.points}</b> CORE CELL${sk.points === 1 ? '' : 'S'} IN THE RACK.`);
      el('p', 'ro-h', box, 'PROCEDURE');
      el('p', '', box, 'GATHER ORE, CARBON, WATER AND SOIL IN THE FIELD. A <b>LIT SOCKET</b> CAN BE BUILT: CLICK IT TO QUEUE THE PART, THEN <b>CONFIRM</b>. CHAINED SOCKETS NEED THE PARTS PIPED INTO THEM FIRST.');
      el('p', '', box, '<i>CORE CELLS COME FROM ADVANCEMENT: NEW GROUND, NEW GENOMES, BEATEN RIVALS.</i>');
      return;
    }
    const d = SKILL[id], n = this.nodes.get(id), st = n?.st ?? 'locked';
    const top = el('div', 'ro-top', R);
    const ib = el('div', 'ro-ico', top); const ic = toCanvas(cached(`face:${id}:${st}`, () => socketFace(skillIcon(id, this.K), st as NodeState, d.pts))); ic.className = 'px'; ib.appendChild(ic);
    const tt = el('div', '', top);
    el('div', 'ro-name', tt, d.name);
    el('div', 'ro-br', tt, `${BRANCH_LONG[d.branch].toUpperCase()} · TIER ${tier(id)}`);
    const stTxt = { owned: '<span class="ok">■ ONLINE</span>', staged: '<span class="amb">■ QUEUED</span>', can: '<span class="ok">□ READY TO BUILD</span>', avail: '<span class="amb">□ SHORT OF MATERIAL</span>', locked: '<span class="bad">□ LOCKED</span>' }[st as NodeState];
    el('div', 'ro-st', tt, stTxt);
    el('div', 'ro-desc', R, d.desc);
    if (st !== 'owned') {
      el('div', 'ro-h', R, this.staged.length && st !== 'staged' ? 'BILL OF MATERIALS <i>(* AFTER QUEUE)</i>' : 'BILL OF MATERIALS');
      const g = el('div', 'ro-cost', R);
      const real = this.host.run.res, staged = st === 'staged';
      // what is left for this node: the sim pool, plus this node's own cost if it is the one already queued
      for (const r of RES) {
        const need = d.cost[r] ?? 0; if (!need) continue;
        const have = Math.floor((staged ? (res[r] ?? 0) + need : res[r] ?? 0));
        const okk = have >= need;
        g.appendChild(toCanvas(resGlyph(r)));
        el('div', 'rn', g, `${RES_NAME[r]} <span class="${okk ? 'ok' : 'bad'}">${fmtN(have)}</span>${real[r] !== res[r] && !staged ? '<i>*</i>' : ''}`);
        el('div', `need ${okk ? 'ok' : 'bad'}`, g, `/ ${need}`);
      }
      if (d.pts) {
        const have = staged ? sim.points + d.pts : sim.points, okk = have >= d.pts;
        g.appendChild(toCanvas(cellGlyph()));
        el('div', 'rn', g, `CORE CELL${d.pts > 1 ? 'S' : ''} <span class="${okk ? 'ok' : 'bad'}">${have}</span>`);
        el('div', `need ${okk ? 'ok' : 'bad'}`, g, `/ ${d.pts}`);
      }
      if (!Object.keys(d.cost).length && !d.pts) el('div', 'rn', g, 'NO MATERIAL');
    }
    const reqs = d.req;
    if (reqs.length) {
      el('div', 'ro-h', R, 'REQUIRES');
      const rq = el('div', 'ro-req', R);
      for (const r of reqs) el('span', sim.has(r) ? 'ok' : 'bad', rq, (SKILL[r]?.name ?? r).toUpperCase());
    }
    const unl = SKILLS.filter((s) => s.req.includes(id));
    if (unl.length && st !== 'owned') { el('div', 'ro-h', R, 'OPENS'); el('div', '', R, unl.map((s) => s.name.toUpperCase()).join(', ')); }
    const why = st === 'owned' ? 'INSTALLED AND RUNNING' : st === 'staged' ? 'QUEUED · CONFIRM TO INSTALL' : st === 'can' ? (this.compact ? 'TAP TO QUEUE' : 'CLICK TO QUEUE') : (sim.why(id, res) ?? '').toUpperCase();
    el('div', `ro-why ${st === 'can' || st === 'staged' ? 'go' : st === 'owned' ? 'done' : ''}`, R, (st === 'locked' || st === 'avail' ? '✖ ' : '▶ ') + why);
    if (this.compact && (st === 'can' || st === 'staged')) {
      const act = el('div', 'ro-act', R);
      const k = this.key(act, 0, 0, 70, 16, st === 'can' ? 'g' : 'a', st === 'can' ? 'QUEUE' : 'RETURN', '', () => this.toggle(id), () => false);
      k.e.style.position = 'relative';
    }
  }
  private drawSheet() {
    if (!this.sheet) return;
    const own = this.host.run.skills, rows: [string, string][] = [['HEAD', 'head'], ['CORE', 'torso'], ['ARM R', 'armR'], ['ARM L', 'armL'], ['COIL', 'coil'], ['PLATE', 'plating1'], ['REACT', 'reactor']];
    const p = new Pix(38, 56);
    rows.forEach(([l, id], i) => {
      const on = own.has(id), q = this.staged.includes(id), y = i * 7 + 1;
      p.rect(0, y, 3, 3, on ? PH[8] : q ? AM[6] : PH[2]); if (on) p.set(0, y, PH[9]);
      text(p, l, 5, y - 1, on ? PH[8] : q ? AM[6] : PH[4]);
    });
    const mk = ['torso', 'armR', 'armL', 'coil', 'reactor', 'plating1', 'plating2', 'plating3', 'colossus'].filter((i) => own.has(i)).length;
    text(p, `MK ${mk + 1}`, 5, 50 - 1, PH[6]);
    const g = this.sheet.getContext('2d')!; g.clearRect(0, 0, 38, 56); g.putImageData(p.image(), 0, 0);
  }
  private showTag(id: string | null) {
    if (!id) { this.tag.classList.remove('on'); return; }
    const c = CELL[id]; this.tag.textContent = SKILL[id].name.toUpperCase();
    put(this.tag, cenX(c.c), nodeY(c.r) - 10); this.tag.classList.add('on');
  }

  // ---------------------------------------------------------------- actions
  private select(id: string | null) {
    this.sel = id;
    for (const n of this.nodes.values()) n.e.classList.toggle('sel', n.id === id);
    this.readout();
  }
  private toggle(id: string) {
    const n = this.nodes.get(id); if (!n) return;
    if (n.st === 'staged' && !this.pending.has(id)) { this.unstage(id); return; }
    if (n.st === 'can') { this.stage(id); return; }
    // explain why not
    if (n.st === 'owned') { sfx('click', 1, 0.5); return; }
    n.e.classList.remove('deny'); void n.e.offsetWidth; n.e.classList.add('deny');
    sfx('deny'); const { sim, res } = this.simulate(); this.float(id, (sim.why(id, res) ?? '').toUpperCase(), 'gain bad', 0);
    if (this.fault) { const f = this.fault; f.set('fast'); setTimeout(() => f.set('dim'), 900); }
  }
  private stage(id: string) {
    this.staged.push(id);
    const n = this.nodes.get(id)!;
    n.e.classList.remove('lockin'); void n.e.offsetWidth; n.e.classList.add('lockin');
    for (let i = 0; i < 4; i++) setTimeout(() => sfx('qte-tick', 1, 0.9), i * 45);
    setTimeout(() => { sfx('crack', 0.7, 0.55); sfx('click', 1, 0.6); }, 190);
    this.float(id, 'QUEUED', 'staged', 0);
    this.burst(id, 10, [AM[6], AM[7], 0xffffff], 0.8);
    this.refresh();
  }
  private unstage(id: string) {
    const i = this.staged.indexOf(id); if (i < 0) return;
    // dependents queued after it come out too
    const out = new Set([id]);
    for (const s of this.staged.slice(i + 1)) if (SKILL[s].req.some((r) => out.has(r))) out.add(s);
    this.staged = this.staged.filter((s) => !out.has(s));
    sfx('close'); for (let k = 0; k < 3; k++) setTimeout(() => sfx('qte-tick', 1, 0.5), 40 + k * 60);
    for (const s of out) this.float(s, 'RETURNED', 'gain amb', 0);
    this.refresh();
  }
  private undo() {
    const id = this.staged[this.staged.length - 1];
    if (!id) { sfx('deny'); return; }
    this.unstage(id);
  }
  private confirm() {
    if (!this.staged.length) { sfx('deny'); return; }
    const sk = this.host.run.skills, res = this.host.run.res, list = [...this.staged], done: string[] = [];
    for (const id of list) { if (!sk.buy(id, res)) break; done.push(id); this.pending.add(id); this.host.emit('skill', { id }); }
    this.staged = [];
    if (done.length < list.length) this.float(list[done.length], 'SHORT OF MATERIAL', 'gain bad', 0);
    this.lastRes = { ...res }; this.lastPts = sk.points;
    this.refresh();
    sfx('pulse', 1, 0.4);
    done.forEach((id, i) => setTimeout(() => this.online(id, i === done.length - 1), 180 + i * 300));
  }
  private online(id: string, last: boolean) {
    if (this.closed) return;
    this.pending.delete(id);
    const n = this.nodes.get(id);
    this.refresh();
    if (n) { n.e.classList.remove('online'); void n.e.offsetWidth; n.e.classList.add('online'); }
    this.float(id, 'ONLINE', 'online', 0);
    this.burst(id, 34, [PH[8], PH[9], 0xffffff, AM[6], BR[7]], 1.6);
    sfx('build', 1, 0.7); sfx('zap', 1, 0.35); setTimeout(() => sfx('qte-good', 1, 0.6), 90);
    this.root.classList.remove('shake'); void this.root.offsetWidth; this.root.classList.add('shake');
    const d = SKILL[id];
    if (d.branch === 'chassis') { this.glass?.classList.remove('flash'); void this.glass?.offsetWidth; this.glass?.classList.add('flash'); }
    else this.scope.child.cast(new THREE.Vector3(Math.sin(this.scope.yaw) * 3, 1.2, Math.cos(this.scope.yaw) * 3));
    if (last) setTimeout(() => sfx(d.pts >= 3 ? 'absorb' : 'done', 1, 0.7), 260);
  }

  // ---------------------------------------------------------------- feedback
  private nodeScreen(id: string): [number, number] {
    const c = CELL[id]; if (!c) return [this.W / 2, this.H / 2];
    return [this.vpRect.x + RAIL + this.pan.x + cenX(c.c), this.vpRect.y + this.pan.y + nodeY(c.r) + NODE / 2];
  }
  private float(id: string, txt: string, cls: string, dy: number) {
    const [x, y] = this.nodeScreen(id);
    const f = el('div', 'sk-fl ' + cls, this.root, txt); put(f, x, y - 8 + dy);
    setTimeout(() => f.remove(), 1800);
  }
  private floatAt(x: number, y: number, txt: string, cls: string) { const f = el('div', 'sk-fl ' + cls, this.root, txt); put(f, x, y); setTimeout(() => f.remove(), 1600); }
  private burst(id: string, n: number, cols: number[], pow: number) {
    const [x, y] = this.nodeScreen(id);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (20 + Math.random() * 70) * pow;
      this.sparks.push({ x: x + Math.cos(a) * 12, y: y + Math.sin(a) * 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30 * pow, t: 0, life: 0.4 + Math.random() * 0.6, col: cols[i % cols.length], g: 160 });
    }
  }

  // ---------------------------------------------------------------- input
  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const ne = (e.target as HTMLElement).closest('.sk-node') as HTMLElement | null;
    this.drag = { x: e.clientX, y: e.clientY, px: this.pan.tx, py: this.pan.ty, moved: false, node: ne?.dataset.id ?? null, id: e.pointerId };
  };
  private onMove = (e: PointerEvent) => {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const dx = (e.clientX - d.x) / this.s, dy = (e.clientY - d.y) / this.s;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > (e.pointerType === 'mouse' ? 2 : 5)) { d.moved = true; this.vp.classList.add('drag'); this.showTag(null); }
    if (d.moved) { this.pan.tx = d.px + dx; this.pan.ty = d.py + dy; this.clampPan(); this.pan.x = this.pan.tx; this.pan.y = this.pan.ty; this.applyPan(); }
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    this.drag = null; this.vp.classList.remove('drag');
    if (d.moved) return;
    if (d.node) { this.select(d.node); this.toggle(d.node); }
    else if (e.target instanceof HTMLElement && this.vp.contains(e.target)) this.select(null);
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : 1, dx = e.deltaX * k, dy = e.deltaY * k;
    if (this.fitY || e.shiftKey) this.pan.tx -= (Math.abs(dx) > Math.abs(dy) ? dx : dy) / this.s;
    else { this.pan.tx -= dx / this.s; this.pan.ty -= dy / this.s; }
    this.clampPan();
  };
  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key;
    if (k === 'Escape' || k === 'k' || k === 'K') { e.preventDefault(); this.close(); return; }
    if (k === 'Enter') { this.confirm(); return; }
    if (k === 'Backspace' || k === 'z' || k === 'Z' || k === 'u' || k === 'U') { e.preventDefault(); this.undo(); return; }
    const step = 40;
    if (k === 'ArrowLeft') { this.pan.tx += step; this.clampPan(); e.preventDefault(); }
    if (k === 'ArrowRight') { this.pan.tx -= step; this.clampPan(); e.preventDefault(); }
    if (k === 'ArrowUp') { this.pan.ty += step; this.clampPan(); e.preventDefault(); }
    if (k === 'ArrowDown') { this.pan.ty -= step; this.clampPan(); e.preventDefault(); }
  };
  private clampPan() {
    const vw = this.vpRect.w - RAIL, vh = this.vpRect.h;
    if (this.fitX) this.pan.tx = Math.floor((vw - CW) / 2); else this.pan.tx = Math.max(vw - CW - 6, Math.min(6, this.pan.tx));
    if (this.fitY) this.pan.ty = Math.floor((vh - CH) / 2); else this.pan.ty = Math.max(vh - CH - 6, Math.min(6, this.pan.ty));
  }
  private applyPan() {
    const x = Math.round(this.pan.x), y = Math.round(this.pan.y);
    this.content.style.transform = `translate(${u(RAIL + x)}, ${u(y)})`;
    this.railBox.style.transform = this.fitY ? '' : `translateY(${u(y)})`;
    const vw = this.vpRect.w - RAIL;
    this.hintL.classList.toggle('on', !this.fitX && x < 0);
    this.hintR.classList.toggle('on', !this.fitX && x > vw - CW);
  }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    this.t += dt;
    // live: resources and core cells can change under us (the economy grants cells, test feeds)
    const sk = this.host.run.skills, res = this.host.run.res;
    const sig = RES.map((r) => Math.floor(res[r] ?? 0)).join(',') + '|' + sk.points + '|' + sk.owned.size;
    if (sig !== this.sig) {
      if (this.sig) {
        for (const r of RES) { const d = Math.floor(res[r] ?? 0) - Math.floor(this.lastRes[r] ?? 0); if (d > 0) this.gain[r] = (this.gain[r] ?? 0) + d; }
        if (sk.points > this.lastPts && !this.pending.size) {
          const n = sk.points - this.lastPts, [x, y] = this.nixiePos();
          this.floatAt(x, y - 6, `+${n} CORE CELL${n > 1 ? 'S' : ''}`, 'gain');
          sfx('qte-good', 1, 0.6);
          this.sparksAt(x, y, 16, [PH[8], PH[9], 0xffffff]);
        }
      }
      this.sig = sig; this.lastRes = { ...res }; this.lastPts = sk.points;
      this.refresh();
    }
    this.gainT -= dt;
    if (this.gainT <= 0) {
      this.gainT = 0.5;
      for (const r of RES) { const g = this.gain[r]; if (!g) continue; this.gain[r] = 0; const o = this.resEls.get(r)!; o.e.classList.remove('bump'); void o.e.offsetWidth; o.e.classList.add('bump'); const [x, y] = this.resPos(r); this.floatAt(x, y - 4, `+${g} ${RES_NAME[r]}`, 'gain'); }
    }
    // pan easing
    if (!this.drag) {
      const k = Math.min(1, dt * 14);
      const nx = this.pan.x + (this.pan.tx - this.pan.x) * k, ny = this.pan.y + (this.pan.ty - this.pan.y) * k;
      if (Math.round(nx) !== Math.round(this.pan.x) || Math.round(ny) !== Math.round(this.pan.y)) { this.pan.x = nx; this.pan.y = ny; this.applyPan(); } else { this.pan.x = nx; this.pan.y = ny; }
    }
    // gears: one tooth pitch every 2.4 s, six frames
    this.gearT += dt;
    const gf = Math.floor(this.gearT / 0.4);
    for (const g of this.gearEls) { const f = ((gf * g.dir) % 6 + 6) % 6; if (f !== g.f) { g.f = f; g.cv.getContext('2d')!.putImageData(g.frames[f], 0, 0); } }
    this.flowT += dt;
    if (this.flowT >= 1 / 30) { this.drawFlow(this.t); this.flowT = 0; }
    this.drawSparks(dt);
    if (this.scope.on) this.scope.update(dt);
  }
  private nixiePos(): [number, number] { const r = this.nixie.e.getBoundingClientRect(); return [(r.left + r.width / 2) / this.s, r.top / this.s]; }
  private resPos(r: Res): [number, number] { const b = this.resEls.get(r)!.e.getBoundingClientRect(); return [(b.left + b.width / 2) / this.s, b.top / this.s]; }
  private sparksAt(x: number, y: number, n: number, cols: number[]) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 50; this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, t: 0, life: 0.5 + Math.random() * 0.5, col: cols[i % cols.length], g: 140 }); } }
  private drawFlow(t: number) {
    const g = this.flowCv.getContext('2d')!; g.clearRect(0, 0, CW, CH);
    const own = this.host.run.skills;
    routes.forEach((r, i) => {
      const lit = this.lits[i]; if (!lit || lit === 'off') return;
      const f = r.flow, L = f.length; if (L < 3) return;
      const full = own.has(r.to), amber = lit === 'staged';
      const sp = amber ? 30 : full ? 26 : 14, gap = amber ? 7 : full ? 9 : 13;
      const head = amber ? '#ffcd6e' : full ? '#c0ffc6' : '#7ae088', tail = amber ? '#a4540e' : full ? '#43b65a' : '#1b6630';
      const off = (t * sp + i * 3.7) % gap;
      for (let d = off; d < L; d += gap) {
        const k = Math.floor(d), [x, y] = f[k];
        g.fillStyle = head; g.fillRect(x, y, 1, 1);
        if (k > 0) { const [px, py] = f[k - 1]; g.fillStyle = tail; g.fillRect(px, py, 1, 1); }
      }
    });
    // the rail trunk
    const rg = this.railFlow.getContext('2d')!, h = this.railFlow.height; rg.clearRect(0, 0, RAIL, h);
    const y0 = this.scope.on ? Math.max(0, this.bridgeY - this.vpRect.y) : this.railOY, y1 = this.railOY + midY(NROW - 1);
    for (let y = y0 + ((t * 24) % 8); y < y1; y += 8) { rg.fillStyle = '#c0ffc6'; rg.fillRect(3, Math.floor(y), 1, 1); rg.fillStyle = '#43b65a'; rg.fillRect(3, Math.floor(y) - 1, 1, 1); }
    for (let r = 0; r < NROW; r++) { const y = this.railOY + midY(r); if (Math.floor(t * 3 + r) % 2 === 0) { rg.fillStyle = '#7ae088'; rg.fillRect(5, y, 1, 1); } }
  }
  private drawSparks(dt: number) {
    const g = this.fxG; if (!this.sparks.length && !this.fxDirty) return;
    g.clearRect(0, 0, this.fxCv.width, this.fxCv.height); this.fxDirty = false;
    this.sparks = this.sparks.filter((p) => {
      p.t += dt; if (p.t >= p.life) return false;
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.5;
      const k = 1 - p.t / p.life;
      g.fillStyle = '#' + (p.col & 0xffffff).toString(16).padStart(6, '0');
      g.globalAlpha = k > 0.5 ? 1 : 0.6;
      const sz = k > 0.6 ? 2 : 1;
      g.fillRect(Math.round(p.x), Math.round(p.y), sz, sz);
      if (k > 0.7) { g.globalAlpha = 0.5; g.fillRect(Math.round(p.x - p.vx * 0.02), Math.round(p.y - p.vy * 0.02), 1, 1); }
      return true;
    });
    g.globalAlpha = 1;
    this.fxDirty = this.sparks.length > 0;
  }
  private fxDirty = false;
  render(post: Post, t: number) {
    const v = post.grade.vig; post.grade.vig = 0;
    if (this.scope.on) post.render(this.scope.scene, this.scope.cam, this.scope.fxs, t);
    else post.render(EMPTY.scene, EMPTY.cam, undefined, t);
    post.grade.vig = v;
  }
  resize(w: number, h: number) {
    this.rw = w; this.rh = h;
    if (this.relayoutT !== null) clearTimeout(this.relayoutT);
    this.relayoutT = window.setTimeout(() => {
      this.relayoutT = null;
      if (this.closed) return;
      const s = KS || 2;
      if (s === this.s && Math.floor(innerWidth / s) === this.W && Math.floor(innerHeight / s) === this.H) return;
      const sel = this.sel; this.build(); if (sel) this.select(sel);
    }, 120);
    if (this.scope.on) this.scope.layout(this.scopeRect, w, h);
  }
  suspend() { this.root.style.display = 'none'; }
  resume() { this.root.style.display = ''; }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.staged.length) sfx('qte-bad', 1, 0.4);
    sfx('close');
    this.opts.close();
  }
  dispose() {
    this.closed = true;
    if (SkillTree.current === this) SkillTree.current = null;
    removeEventListener('keydown', this.onKey);
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('pointercancel', this.onUp);
    this.root.remove(); Tip.hide();
    this.scope.dispose();
  }
}
const EMPTY = (() => { const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07090a); return { scene, cam: new THREE.PerspectiveCamera(30, 1, 0.1, 10) }; })();

function cropCanvas(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!, d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return c;
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d')!.drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
const tierMemo = new Map<string, number>();
/** longest chain of requirements back to the head */
function tier(id: string): number {
  if (id === 'head' || !SKILL[id]) return 0;
  let t = tierMemo.get(id);
  if (t === undefined) { tierMemo.set(id, 0); t = 1 + Math.max(0, ...SKILL[id].req.map(tier)); tierMemo.set(id, t); }
  return t;
}
const fmtN = (n: number) => (n >= 10000 ? Math.floor(n / 1000) + 'K' : String(Math.floor(n)));
function resTip(r: Res) {
  return ({
    ore: 'Iron and copper-bearing rock. Grit at first; drill seams and boulders for more.',
    carbon: 'Drawn from dead plants and corpses through the Carbon Intake.',
    water: 'Siphoned from rivers and pools.',
    soil: 'Grit at first; the Excavator scoops it from the ground.',
  } as Record<Res, string>)[r];
}

// ------------------------------------------------------------------ wiring helpers
/** open the skill tree over a game (idempotent: a second call while it is open does nothing) */
export function openSkillTree(engine: Engine, host: SkillHost) {
  if (SkillTree.current) return SkillTree.current;
  const s = new SkillTree(host, { close: () => { if (engine.screen === s) engine.pop(); } });
  engine.push(s);
  return s;
}
let keyOff: (() => void) | null = null;
/** K opens the tree while `screen` is the running screen (the screen itself closes on K / Esc). In the game the HUD
 * already maps K (respecting QTEs and story beats); this is for stand-alone hosts like the test page. */
export function bindSkillKey(engine: Engine, game: Screen, open: () => void) {
  keyOff?.();
  const f = (e: KeyboardEvent) => {
    if (e.key !== 'k' && e.key !== 'K') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = (e.target as HTMLElement)?.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
    if (engine.screen !== game || SkillTree.current) return;
    if (document.querySelector('.pause, .choice')) return;
    open();
  };
  addEventListener('keydown', f);
  keyOff = () => { removeEventListener('keydown', f); keyOff = null; };
  return keyOff;
}

// ------------------------------------------------------------------ ?test=skills
export function testSkills(engine: Engine, P: URLSearchParams) {
  if (P.has('atlas')) { atlas(); return; }
  const run = new Run(7);
  const own = (P.get('own') ?? 'torso,armR,drill,intake,siphon,excavate,punch,lift,magnet').split(',').filter((i) => SKILL[i]);
  for (const id of own) run.skills.owned.add(id);
  run.skills.points = Number(P.get('pts') ?? 3);
  const R = (P.get('res') ?? '140,90,120,160').split(',').map(Number);
  RES.forEach((r, i) => (run.res[r] = R[i] ?? 0));
  const host: SkillHost = { run, emit: (ev, d) => console.log('emit', ev, JSON.stringify(d)) };
  (window as any).__skills = host; (window as any).__SkillTree = SkillTree; (window as any).__skRoutes = routes;
  const base: Screen = { update() {}, render(post, t) { post.render(EMPTY.scene, EMPTY.cam, undefined, t); } };
  engine.setScreen(base);
  bindSkillKey(engine, base, () => openSkillTree(engine, host));
  if (!P.has('closed')) openSkillTree(engine, host);
  if (P.has('live')) setInterval(() => { const r = RES[Math.floor(Math.random() * 4)]; run.res[r] += 3 + Math.floor(Math.random() * 6); if (Math.random() < 0.08) run.skills.grant(1, 'test'); }, 700);
}
function atlas() {
  const K = kitFor(loadLook());
  const cols = 9, sc = 3, W = cols * 40 + 8, H = Math.ceil(SKILLS.length / cols) * 46 + 30;
  const p = new Pix(W, H);
  p.rect(0, 0, W, H, 0x16302c);
  SKILLS.forEach((s, i) => { const x = 4 + (i % cols) * 40, y = 4 + Math.floor(i / cols) * 46; p.rect(x, y, 32, 32, 0x1c3a36); p.blit(skillIcon(s.id, K), x, y); });
  let x = 4; for (const r of RES) { p.blit(resGlyph(r), x, H - 24); x += 12; }
  p.blit(cellGlyph(), x, H - 24); p.blit(cellGlyph(true), x + 12, H - 24); x += 30;
  for (const b of BRANCHES) { p.blit(branchEmblem(b, K), x, H - 28); x += 20; }
  const c = p.canvas(); c.style.cssText = `position:fixed;left:0;top:0;width:${W * sc}px;height:${H * sc}px;image-rendering:pixelated;z-index:10`;
  document.body.appendChild(c);
  const lab = document.createElement('div'); lab.style.cssText = 'position:fixed;left:0;top:0;z-index:11;font:10px monospace;color:#fff;pointer-events:none';
  SKILLS.forEach((s, i) => { const d = document.createElement('div'); d.textContent = s.id; d.style.cssText = `position:absolute;left:${(4 + (i % cols) * 40) * sc}px;top:${(4 + Math.floor(i / cols) * 46 + 33) * sc}px;text-shadow:1px 1px 0 #000`; lab.appendChild(d); });
  document.body.appendChild(lab);
}

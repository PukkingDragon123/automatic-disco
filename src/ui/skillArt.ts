// Skill-tree machinery, painted at 1x like the rest of the console (machine.ts): node sockets in five states,
// the chains and padlock that bind a locked node, the pulse ring of a buyable one, brass/copper pipe runs with a
// sight-glass line the energy flows along, big meshing gears behind the schematic, and heavy push keys.
import { Pix, GM, BR, CU, AM, PH, RD, CR, BK, INK, dv, mixc, text, textW, rivet3 } from './machine';
import { hashf } from '../limbo/core/rng';
import { dimmed } from './skillIcons';

export type NodeState = 'locked' | 'avail' | 'can' | 'staged' | 'owned';
export const NODE = 38;
const ABR = BR.map((c, i) => mixc(c, AM[Math.min(7, i)], 0.35));

// ------------------------------------------------------------------ the socket a node sits in
/** a 38x38 framed socket around a 32x32 icon. pts: core-cell cost shown on a brass tag (0 = none) */
export function socketFace(icon: Pix, st: NodeState, pts: number): Pix {
  const S = NODE, p = new Pix(S, S);
  const R = st === 'owned' ? BR : st === 'staged' ? ABR : st === 'locked' ? GM.slice(0, 7) : GM;
  const m = R.length, hi = st === 'locked' ? 5 : m - 2, mid = st === 'locked' ? 3 : Math.floor(m * 0.55), lo = 1;
  // window backdrop: a dark schematic sheet; owned sockets glow from inside
  for (let y = 3; y < S - 3; y++) for (let x = 3; x < S - 3; x++) {
    const d = Math.hypot(x - 18.5, y - 18.5) / 22;
    let c: number;
    if (st === 'owned') c = dv([0x06120c, 0x0a1e12, 0x0f2a18, 0x16391f, 0x1d4a26], 3.6 - d * 3.4, x, y);
    else if (st === 'staged') c = dv([0x140a02, 0x22140a, 0x2e1c0c, 0x3a2410], 3 - d * 3, x, y);
    else if (st === 'can') c = dv([0x070c0c, 0x0c1616, 0x112020, 0x162a28], 3 - d * 3, x, y);
    else if (st === 'avail') c = dv([0x08090c, 0x0e1014, 0x13171c], 2.6 - d * 2.6, x, y);
    else c = dv([0x040506, 0x08090b, 0x0c0e11], 2.2 - d * 2.4, x, y);
    if (st !== 'owned' && ((x - 3) % 6 === 0 || (y - 3) % 6 === 0)) c = mixc(c, 0x3a6a7a, st === 'locked' ? 0.06 : 0.12);
    p.set(x, y, c);
  }
  const ic = st === 'locked' ? dimmed(icon, 0.8, 0x18202a) : st === 'avail' ? dimmed(icon, 0.4, 0x1a2228) : icon;
  if (st === 'locked') for (let i = 0; i < ic.w * ic.h; i++) { ic.d[i * 4] *= 0.8; ic.d[i * 4 + 1] *= 0.8; ic.d[i * 4 + 2] *= 0.85; }
  p.blit(ic, 3, 3);
  // recess shadow along the top and left of the window
  for (let i = 3; i < S - 3; i++) { p.shade(i, 3, 0.5); p.shade(3, i, 0.55); p.shade(i, 4, 0.8); p.shade(4, i, 0.82); }
  // the frame
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (o > 2) continue;
    if (x + y < 3 || (S - 1 - x) + y < 3 || x + (S - 1 - y) < 3 || (S - 1 - x) + (S - 1 - y) < 3) { p.clear(x, y); continue; }
    const tl = x + y < S - 1;
    if (o === 0) p.set(x, y, INK);
    else if (o === 1) p.set(x, y, tl ? R[hi] : R[lo + 1]);
    else p.set(x, y, dv(R, mid + (tl ? 0.4 : -0.6) + (hashf(x, y, 7) - 0.5) * 0.6, x, y));
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x + y === 3 || (S - 1 - x) + y === 3 || x + (S - 1 - y) === 3 || (S - 1 - x) + (S - 1 - y) === 3) && Math.min(x, y, S - 1 - x, S - 1 - y) < 3) p.set(x, y, INK);
  // heavy corner brackets with a rivet each
  const brk = (cx: number, cy: number, fx: number, fy: number) => {
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      if (i > 3 && j > 3) continue;
      if (i + j < 3) continue;
      const x = fx > 0 ? cx + i : cx - i, y = fy > 0 ? cy + j : cy - j;
      const edge = i === 6 || j === 6 || (i === 3 && j > 3) || (j === 3 && i > 3);
      p.set(x, y, edge ? INK : dv(R, mid + 0.6 - (fy > 0 ? j : 6 - j) * 0.15 + (hashf(x, y, 3) - 0.5) * 0.5, x, y));
    }
    rivet3(p, fx > 0 ? cx + 1 : cx - 3, fy > 0 ? cy + 1 : cy - 3, R);
  };
  brk(0, 0, 1, 1); brk(S - 1, 0, -1, 1); brk(0, S - 1, 1, -1); brk(S - 1, S - 1, -1, -1);
  // status lamp in the top-right bracket
  const L = st === 'owned' ? [PH[6], PH[9]] : st === 'staged' ? [AM[4], AM[7]] : st === 'can' ? [PH[4], PH[7]] : st === 'avail' ? [AM[2], AM[4]] : [RD[1], RD[3]];
  p.set(S - 4, 2, L[1]); p.set(S - 3, 2, L[0]); p.set(S - 4, 3, L[0]); p.set(S - 3, 3, L[0]);
  // core-cell tag: a brass tag riveted over the bottom-right bracket
  if (pts > 0 && st !== 'owned') {
    const s = String(pts), tw = 9 + textW(s), tx = S - tw - 1, ty = S - 9;
    for (let j = 0; j < 8; j++) for (let i = 0; i < tw; i++) {
      const e = i === 0 || j === 0 || i === tw - 1 || j === 7;
      p.set(tx + i, ty + j, e ? INK : dv(st === 'locked' ? GM : BR, (st === 'locked' ? 4 : 5) - j * 0.3 + (hashf(i, j, 2) - 0.5) * 0.4, tx + i, ty + j));
    }
    // a tiny cell glyph and the digit
    p.rect(tx + 2, ty + 2, 3, 4, st === 'locked' ? GM[3] : PH[7]); p.set(tx + 2, ty + 2, st === 'locked' ? GM[5] : PH[9]); p.hl(tx + 2, tx + 4, ty + 1, BR[2]); p.hl(tx + 2, tx + 4, ty + 6, BR[2]);
    text(p, s, tx + 6, ty + 2, st === 'locked' ? GM[1] : BR[0]);
  }
  if (st === 'owned') for (let i = 6; i < S - 6; i++) { p.set(i, 1, mixc(R[hi], 0xffffff, 0.3)); }
  return p;
}

// ------------------------------------------------------------------ chains and padlock
/** steel chain links along a line */
function chain(p: Pix, x0: number, y0: number, x1: number, y1: number, seed: number) {
  const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, vx = -uy, vy = ux;
  const step = 3.6, n = Math.floor(L / step);
  const R = [0x1a1c1e, 0x2e3236, 0x4a5056, 0x6c747a, 0x949ca2, 0xbcc4c8, 0xdfe5e8];
  for (let k = 0; k <= n; k++) {
    const cx = x0 + ux * k * step, cy = y0 + uy * k * step, face = k % 2 === 0;
    for (let y = Math.floor(cy - 4); y <= cy + 4; y++) for (let x = Math.floor(cx - 4); x <= cx + 4; x++) {
      const qx = x + 0.5 - cx, qy = y + 0.5 - cy, u = qx * ux + qy * uy, v = qx * vx + qy * vy;
      let on = false, l = 0;
      if (face) { const e = (u / 2.6) ** 2 + (v / 1.9) ** 2; on = e <= 1.25 && e >= 0.42; l = -(qx * 0.6 + qy * 0.75) / 2.2 + (e < 0.8 ? 0.4 : -0.2); }
      else { on = Math.abs(v) < 0.7 && Math.abs(u) < 2.6; l = -v * 0.8 + 0.3; }
      if (!on) continue;
      p.set(x, y, dv(R, 3.4 + l * 2.2 + (hashf(x, y, seed) - 0.5) * 0.6, x, y));
    }
  }
}
/** the padlock: steel shackle, brass body, keyhole. open: shackle up and swung */
function padlock(p: Pix, x: number, y: number, open = false) {
  const SR = [0x2e3236, 0x4a5056, 0x6c747a, 0x949ca2, 0xbcc4c8, 0xe6eaec];
  // shackle (a U of steel)
  const sx = x + (open ? 3 : 0), sy = y - (open ? 4 : 0);
  for (let a = 0; a <= 24; a++) {
    const t = Math.PI * (a / 24), cx = sx + 6.5, cy = sy + 6;
    for (let rr = 3.2; rr <= 5; rr += 0.5) { const X = Math.round(cx + Math.cos(t) * rr - 0.5), Y = Math.round(cy - Math.sin(t) * rr * 1.1); p.set(X, Y, dv(SR, 3 - Math.cos(t) * 1.4 + (rr > 4.4 ? -1 : 0.3), X, Y)); }
  }
  for (let yy = sy + 6; yy < sy + 9; yy++) { p.set(sx + 1, yy, SR[3]); p.set(sx + 2, yy, SR[2]); if (!open) { p.set(sx + 11, yy, SR[3]); p.set(sx + 12, yy, SR[1]); } }
  // body
  for (let j = 0; j < 9; j++) for (let i = 0; i < 14; i++) {
    const e = (i === 0 || i === 13) && (j === 0 || j === 8);
    if (e) continue;
    let v = 5 - j * 0.45 - i * 0.08 + (hashf(i, j, 4) - 0.5) * 0.6;
    if (j === 0 || i === 0) v = 7.2; if (j === 8 || i === 13) v = 1.2;
    p.set(x + i, y + 8 + j, dv(BR, v, x + i, y + 8 + j));
  }
  // keyhole and two rivets
  p.set(x + 6, y + 11, INK); p.set(x + 7, y + 11, INK); p.set(x + 6, y + 12, INK); p.set(x + 7, y + 12, INK); p.set(x + 6, y + 13, INK); p.set(x + 7, y + 13, INK); p.set(x + 6, y + 14, INK);
  p.set(x + 2, y + 10, BR[8]); p.set(x + 11, y + 10, BR[8]); p.set(x + 2, y + 14, BR[2]); p.set(x + 11, y + 14, BR[2]);
}
function inkOutline(p: Pix) {
  const W = p.w, H = p.h, a = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) a[i] = p.d[i * 4 + 3] > 120 ? 1 : 0;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && a[y * W + x] === 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) p.set(x, y, INK);
  for (let y = H - 1; y > 0; y--) for (let x = W - 1; x > 0; x--) if (p.d[(y * W + x) * 4 + 3] === 0 && on(x - 1, y - 1)) p.set(x, y, 0x000000, 110);
}
export const CHAIN = 44;
let chainsMemo: Pix | null = null, openMemo: Pix | null = null;
/** chains crossed over a locked socket (52x52, centred on the node) with the padlock where they cross */
export function chainsArt(): Pix {
  if (chainsMemo) return chainsMemo;
  const p = new Pix(CHAIN, CHAIN);
  chain(p, 4, 6, 39, 38, 1); chain(p, 39, 5, 5, 39, 2);
  inkOutline(p);
  const q = new Pix(CHAIN, CHAIN); padlock(q, 15, 14); inkOutline(q); p.blit(q, 0, 0);
  return (chainsMemo = p);
}
/** just the sprung-open padlock (for the moment a node is freed) */
export function padlockOpen(): Pix {
  if (openMemo) return openMemo;
  const q = new Pix(CHAIN, CHAIN); padlock(q, 15, 14, true); inkOutline(q);
  return (openMemo = q);
}
/** a 1px bright ring tracing the socket outline, for the "can buy" pulse (44x44, 3px outside the node) */
export function pulseRing(col: number): Pix {
  const S = NODE + 6, p = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = Math.min(x, y, S - 1 - x, S - 1 - y);
    const ch = x + y === 4 || (S - 1 - x) + y === 4 || x + (S - 1 - y) === 4 || (S - 1 - x) + (S - 1 - y) === 4;
    const cut = x + y < 4 || (S - 1 - x) + y < 4 || x + (S - 1 - y) < 4 || (S - 1 - x) + (S - 1 - y) < 4;
    if (cut && !ch) continue;
    if (o === 1 || (ch && o <= 2)) p.set(x, y, col);
    else if (o === 0 || o === 2) p.set(x, y, col, 90);
  }
  return p;
}

// ------------------------------------------------------------------ gears
/** frames of a spur gear turning through one tooth pitch (dark machined steel, for behind the schematic) */
export function gearFrames(r: number, teeth: number, frames: number, seed = 1, dark = 0.55): Pix[] {
  const out: Pix[] = [], S = Math.ceil(r + 7) * 2, c = S / 2, th = 5, spokes = teeth >= 18 ? 6 : 5;
  const R = GM.slice(0, 7).map((x) => mixc(x, 0x000000, 1 - dark));
  for (let f = 0; f < frames; f++) {
    const p = new Pix(S, S), rot = ((f / frames) * Math.PI * 2) / teeth;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - rot;
      if (d > r + th + 0.5) continue;
      // tooth profile: trapezoids around the rim
      const ph = (((a / (Math.PI * 2)) * teeth) % 1 + 1) % 1, k = Math.abs(ph - 0.5) * 2; // 0 at tooth centre
      const top = k < 0.38 ? r + th : k < 0.62 ? r + th * (1 - (k - 0.38) / 0.24) : r;
      if (d > top) continue;
      const lit = -(dx * 0.6 + dy * 0.75) / Math.max(1, d);
      let v: number;
      if (d > r - 2) v = 3 + lit * 1.6;                               // rim and teeth
      else if (d > r - 7) v = 2 + lit * 0.4 - (d > r - 3 ? 0.6 : 0);  // web inside the rim
      else if (d < r * 0.22) v = 3.2 + lit * 1.2;                    // hub
      else {
        // spokes with lightening holes between
        const sp = (((a / (Math.PI * 2)) * spokes) % 1 + 1) % 1, w = Math.abs(sp - 0.5) * 2;
        if (w < 0.62 && d > r * 0.3 && d < r - 8) continue;
        v = 2.4 + lit * 0.8;
      }
      // edges: a dark lip on the outside, light on the inside
      p.set(x, y, dv(R, v + (hashf(x, y, seed) - 0.5) * 0.5, x, y));
    }
    // ink edges and the bore with keyway
    const a0 = new Uint8Array(S * S); for (let i = 0; i < S * S; i++) a0[i] = p.d[i * 4 + 3] ? 1 : 0;
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) if (a0[y * S + x] && (!a0[y * S + x - 1] || !a0[y * S + x + 1] || !a0[(y - 1) * S + x] || !a0[(y + 1) * S + x])) p.set(x, y, mixc(INK, R[1], 0.3));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c); if (d < r * 0.09) p.set(x, y, INK); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + rot; rivet3(p, Math.round(c + Math.cos(a) * r * 0.16) - 1, Math.round(c + Math.sin(a) * r * 0.16) - 1, R.concat([GM[5], GM[6]])); }
    out.push(p);
  }
  return out;
}

// ------------------------------------------------------------------ pipes
export type PipeMat = 'brass' | 'copper' | 'steel';
export type PipeLit = 'off' | 'on' | 'staged';
const MATS: Record<PipeMat, number[]> = { brass: BR, copper: CU, steel: GM.slice(1, 9) };
/**
 * draw a 5px pipe along an orthogonal polyline. The middle line is a sight glass the flow layer lights up.
 * Collars sit at both ends and every ~26px along long runs.
 */
export function drawPipe(p: Pix, pts: [number, number][], mat: PipeMat, lit: PipeLit) {
  const R0 = MATS[mat], R = lit === 'off' ? GM.slice(0, 7).map((c) => mixc(c, mat === 'copper' ? 0x3a1c10 : 0x2a2416, 0.18)) : R0, m = R.length;
  const glass = lit === 'off' ? 0x0c0e10 : lit === 'staged' ? AM[1] : PH[2];
  const prof = [INK, R[m - 2], glass, R[2], INK];
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    if (ay === by) { const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx); for (let x = x0; x <= x1; x++) for (let k = 0; k < 5; k++) p.set(x, ay - 2 + k, k === 1 && hashf(x, ay, 3) < 0.08 ? R[m - 1] : prof[k]); }
    else { const y0 = Math.min(ay, by), y1 = Math.max(ay, by); for (let y = y0; y <= y1; y++) for (let k = 0; k < 5; k++) p.set(ax - 2 + k, y, k === 1 ? R[m - 3] : prof[k]); }
  };
  for (let i = 0; i + 1 < pts.length; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  // elbows: a rounded outside corner and a continuous glass line
  for (let i = 1; i + 1 < pts.length; i++) {
    const [x, y] = pts[i], [px, py] = pts[i - 1], [nx, ny] = pts[i + 1];
    const dx = Math.sign(px - x) || Math.sign(nx - x), dy = Math.sign(py - y) || Math.sign(ny - y);
    if (!dx || !dy) continue;
    // the corner block
    for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
      const ox = -dx * k, oy = -dy * j; // ox,oy >0 point to the outside corner
      if (ox === 2 && oy === 2) { p.clear(x + k, y + j); continue; }
      const e = ox === 2 || oy === 2 || (ox === 1 && oy === 2) || (ox === 2 && oy === 1);
      p.set(x + k, y + j, e ? INK : Math.abs(k) + Math.abs(j) === 0 ? glass : ox + oy >= 2 ? R[m - 3] : ox + oy <= -2 ? R[2] : R[Math.floor(m * 0.55)]);
    }
    p.set(x + dx * -2 + (dx > 0 ? 0 : 0), y + dy * -1, INK); p.set(x + dx * -1, y + dy * -2, INK);
    p.set(x, y, glass); p.set(x + dx, y, glass); p.set(x, y + dy, glass);
  }
  // collars
  const collar = (x: number, y: number, horiz: boolean) => {
    for (let a = -3; a <= 3; a++) for (let b = 0; b < 2; b++) {
      const c = a === -3 || a === 3 ? INK : b === 0 ? GM[a < 0 ? 7 : 5] : GM[a < 0 ? 4 : 3];
      if (horiz) p.set(x + b, y + a, c); else p.set(x + a, y + b, c);
    }
  };
  const ends = [pts[0], pts[pts.length - 1]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], horiz = ay === by, L = Math.abs(bx - ax) + Math.abs(by - ay);
    if (L > 34) for (let t = 13; t < L - 8; t += 26) collar(horiz ? Math.min(ax, bx) + t : ax, horiz ? ay : Math.min(ay, by) + t, horiz);
  }
  void ends;
}
/** a brass nozzle where a pipe meets a socket (dir: which side of the node) */
export function nozzle(p: Pix, x: number, y: number, side: 'l' | 'r' | 't' | 'b', lit: boolean) {
  const R = lit ? BR : GM.slice(0, 8);
  for (let a = -3; a <= 3; a++) for (let b = 0; b < 3; b++) {
    const c = a === -3 || a === 3 || b === 2 ? INK : dv(R, 6 - (a + 3) * 0.7 - b * 0.6, x + a, y + b);
    if (side === 'r') p.set(x + b, y + a, c); else if (side === 'l') p.set(x - b, y + a, c);
    else if (side === 'b') p.set(x + a, y + b, c); else p.set(x + a, y - b, c);
  }
}

// ------------------------------------------------------------------ heavy keys
export type KeyCol = 'g' | 'a' | 'r';
/** a heavy illuminated push key: steel bezel, hazard collar along the bottom, a lens cap that sinks when pressed */
export function heavyKey(w: number, h: number, col: KeyCol, st: 'n' | 'h' | 'p' | 'd'): Pix {
  const p = new Pix(w, h), dead = st === 'd', press = st === 'p';
  const L = col === 'g' ? PH : col === 'a' ? AM : RD;
  // bezel
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x + y < 3 || (w - 1 - x) + y < 3 || x + (h - 1 - y) < 3 || (w - 1 - x) + (h - 1 - y) < 3) continue;
    const o = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (o === 0) { p.set(x, y, INK); continue; }
    if (o === 1) { p.set(x, y, x + y < w * 0.5 ? GM[7] : GM[2]); continue; }
    p.set(x, y, dv(GM, 4.4 - (y / h) * 1.6 + (hashf(x, y, 5) - 0.5) * 0.6, x, y));
  }
  // hazard collar in the bottom band
  for (let x = 4; x < w - 4; x++) for (let y = h - 4; y < h - 2; y++) p.set(x, y, ((x + y) % 6) < 3 ? 0xd8a422 : 0x15130e);
  // the cap
  const cx0 = 4, cy0 = 3 + (press ? 1 : 0), cw = w - 8, chh = h - 9;
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
    if ((x === 0 || x === cw - 1) && (y === 0 || y === chh - 1)) continue;
    let v: number;
    if (dead) v = 1.2 + (y < 2 ? 0.8 : 0);
    else {
      const base = st === 'h' ? L.length * 0.62 : press ? L.length * 0.42 : L.length * 0.5;
      v = base + (1 - y / chh) * 1.6 - Math.abs(x - cw / 2) / cw * 1.2;
      if (y === 0 || x === 0) v += press ? -1 : 1.8; if (y === chh - 1 || x === cw - 1) v -= 1.6;
    }
    p.set(cx0 + x, cy0 + y, dead ? dv(BK, v, cx0 + x, cy0 + y) : dv(L, v, cx0 + x, cy0 + y));
  }
  if (!press) for (let x = cx0; x < cx0 + cw; x++) p.shade(x, cy0 + chh, 0.5);
  // glass glint
  if (!dead) { p.hl(cx0 + 2, cx0 + Math.min(10, cw - 3), cy0 + 1, 0xffffff, 150); p.set(cx0 + 1, cy0 + 2, 0xffffff, 110); }
  return p;
}
/** a junction plate for a branch row: brass name plate, emblem window, an owned counter */
export function junctionPlate(name: string, emblem: Pix, owned: number, total: number, lit: boolean): Pix {
  const W = 34, H = NODE, p = new Pix(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x + y < 3 || (W - 1 - x) + y < 3 || x + (H - 1 - y) < 3 || (W - 1 - x) + (H - 1 - y) < 3) continue;
    const o = Math.min(x, y, W - 1 - x, H - 1 - y);
    p.set(x, y, o === 0 ? INK : o === 1 ? (x + y < (W + H) / 2 ? GM[7] : GM[2]) : dv(GM, 4.2 - (y / H) * 1.4 + (hashf(x, y, 9) - 0.5) * 0.7, x, y));
  }
  // emblem window
  for (let y = 3; y < 21; y++) for (let x = 8; x < 26; x++) p.set(x, y, y === 3 || x === 8 ? INK : dv([0x06120c, 0x0a1e12, 0x0f2a18], 2 - Math.hypot(x - 17, y - 12) / 9, x, y));
  p.blit(lit ? emblem : dimmed(emblem, 0.7), 9, 4);
  // brass name strip
  const label = name.toUpperCase().slice(0, 8);
  for (let y = 22; y < 30; y++) for (let x = 2; x < W - 2; x++) p.set(x, y, y === 22 || x === 2 ? BR[7] : y === 29 || x === W - 3 ? BR[1] : dv(BR, 4.6 - (y - 22) * 0.35 + (hashf(x, y, 1) - 0.5) * 0.6, x, y));
  text(p, label, Math.floor((W - textW(label)) / 2), 24, BR[0], 'engrave', BR[7], BR[1]);
  // counter: little lamps, one per node, lit for owned
  const n = Math.min(total, 10), x0 = Math.floor((W - n * 3) / 2);
  for (let i = 0; i < n; i++) { const on = i < owned; p.set(x0 + i * 3, 32, on ? PH[8] : GM[2]); p.set(x0 + i * 3 + 1, 32, on ? PH[6] : GM[1]); p.set(x0 + i * 3, 33, on ? PH[6] : GM[1]); p.set(x0 + i * 3 + 1, 33, on ? PH[5] : INK); }
  rivet3(p, 2, 3, GM); rivet3(p, W - 5, 3, GM);
  return p;
}
export { CR };

// Choosing where to land: the region as a 1957 survey chart under the glass of the gallery's plotting table, and
// the typed intelligence sheet beside it. The chart is drawn from the real Region the game will generate: hill
// shading and contours from its heightfield, the sea and rivers hatched in blue, woods stippled, rock outcrops,
// ferrite and lumen seams stamped with their symbols, steep ground and water cross-hatched in red grease pencil,
// the recommended LZ ringed, a rival's creep if the region is held, the grid, scale bar and title block, and a
// margin note in Calder's hand. Hover reads the ground under the cursor; a click drops the brass pin.
import * as THREE from 'three';
import type { Region } from '../world/region';
import type { PRegion, Planet } from '../world/planet';
import { RIVALS } from '../world/palette';
import { sfx } from '../audio/audio';
import { csfx } from './cineAudio';
import { clamp } from '../core/rand';
import type { Ship } from './deployShip';

export const CHART = 1024;
const GRID = 16; // metres per lettered square
const LET = 'ABCDEFGH';
const h2 = (x: number, y: number, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

export interface LZInfo {
  x: number; z: number; ok: boolean; snapped: boolean; grid: string; elev: number; slope: number; ground: string;
  seam: { kind: 'ore' | 'crystal'; dist: number } | null; verdict: 'SUITABLE' | 'ROUGH' | 'NO LANDING'; note: string;
}
export const gridRef = (x: number, z: number) => `${LET[clamp(Math.floor(x / GRID), 0, 7)]}-${clamp(Math.floor(z / GRID), 0, 7) + 1}`;
const GROUND = ['grass', 'dry grass', 'bare soil', 'rock', 'sand', 'mud', 'clay', 'snow', 'basalt', 'ferrite', 'lumen crystal', 'leaf litter', 'gravel', 'impact glass'];

function slopeAt(R: Region, x: number, z: number) {
  const a = R.groundSmooth(x - 1, z), b = R.groundSmooth(x + 1, z), c = R.groundSmooth(x, z - 1), d = R.groundSmooth(x, z + 1);
  return Math.hypot(b - a, d - c) / 2;
}
/** what the ground is like at a point, and whether a pod can come down there */
export function assessLZ(R: Region, x0: number, z0: number): LZInfo {
  let x = clamp(x0, 7, R.N - 7), z = clamp(z0, 7, R.N - 7), snapped = false;
  const water = R.isWater(x, z), solid = R.isSolid(x, z);
  let note = '';
  if (water || solid) {
    const f = R.freeNear(x, z, 9);
    if (f) { x = f[0]; z = f[1]; snapped = true; note = water ? 'Moved off the water to the nearest dry ground.' : 'Moved off the rock to open ground.'; }
  }
  const ok = !R.isWater(x, z) && !R.isSolid(x, z);
  const slope = slopeAt(R, x, z);
  let seam: LZInfo['seam'] = null;
  for (const d of R.deposits) { const dd = Math.hypot(d.x - x, d.z - z); if (!seam || dd < seam.dist) seam = { kind: d.kind, dist: dd }; }
  const verdict: LZInfo['verdict'] = !ok ? 'NO LANDING' : slope > 0.55 ? 'ROUGH' : 'SUITABLE';
  if (!note) note = !ok ? 'Water or rock all round. Pick open ground.' : slope > 0.55 ? 'Steep. The pod may roll on landing.' : seam && seam.dist < 18 ? 'Good ground, a seam within reach.' : 'Good open ground.';
  return { x, z, ok, snapped, grid: gridRef(x, z), elev: R.groundSmooth(x, z), slope, ground: GROUND[R.b[Math.floor(z) * R.N + Math.floor(x)]] ?? 'ground', seam, verdict, note };
}

/** region-wide figures for the sheet */
export function regionFacts(R: Region) {
  let water = 0, steep = 0, land = 0;
  for (let z = 2; z < R.N - 2; z += 2) for (let x = 2; x < R.N - 2; x += 2) {
    if (R.isWater(x + 0.5, z + 0.5)) water++; else { land++; if (slopeAt(R, x + 0.5, z + 0.5) > 0.55) steep++; }
  }
  const n = water + land;
  return { water: water / n, steep: steep / Math.max(1, land), ore: R.deposits.filter((d) => d.kind === 'ore').length, crystal: R.deposits.filter((d) => d.kind === 'crystal').length };
}

// ================================================================== the chart
export function drawChart(R: Region, pr: PRegion, planet: Planet, op: string): HTMLCanvasElement {
  const S = CHART, k = S / R.N, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S), d = img.data;
  // heights per pixel (bilinear), then paper, tint, hill shade, water hatching, contours
  const H = new Float32Array(S * S), Wt = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const rx = (x + 0.5) / k, rz = (y + 0.5) / k;
    H[y * S + x] = R.groundSmooth(rx, rz);
    Wt[y * S + x] = R.isWater(rx, rz) ? 1 : 0;
  }
  let lo = 99, hi = -99; for (let i = 0; i < H.length; i += 7) { if (!Wt[i]) { lo = Math.min(lo, H[i]); hi = Math.max(hi, H[i]); } }
  const paper = [217, 210, 191];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, o = i * 4;
    const fib = (h2(x >> 1, y, 3) - 0.5) * 7 + (h2(x, y >> 2, 5) - 0.5) * 4;
    const edge = Math.min(x, y, S - 1 - x, S - 1 - y);
    const age = edge < 40 ? (40 - edge) * 0.35 : 0;
    let r = paper[0] + fib - age * 0.4, gg = paper[1] + fib - age * 0.6, b = paper[2] + fib - age * 1.2;
    if (Wt[i]) {
      // sea and river: a pale blue wash, horizontal hatch, deeper water darker
      const deep = clamp((R.water - H[i]) / 1.6, 0, 1);
      r = r * 0.68 + 159 * 0.32 - deep * 18; gg = gg * 0.68 + 180 * 0.32 - deep * 10; b = b * 0.68 + 194 * 0.32 - deep * 2;
      if (y % 5 === 0 && h2(x >> 3, y, 7) < 0.8) { r -= 34; gg -= 26; b -= 16; }
    } else {
      const e = clamp((H[i] - lo) / Math.max(0.5, hi - lo), 0, 1);
      // hypsometric: green-grey lowland, paper midland, tan uplands
      const tint = e < 0.5 ? [-12 * (1 - e * 2), -4 * (1 - e * 2), -14 * (1 - e * 2)] : [-14 * (e - 0.5) * 2, -24 * (e - 0.5) * 2, -40 * (e - 0.5) * 2];
      r += tint[0]; gg += tint[1]; b += tint[2];
      // hill shade (light from the north-west)
      const hx = H[y * S + Math.min(S - 1, x + 1)] - H[y * S + Math.max(0, x - 1)], hz = H[Math.min(S - 1, y + 1) * S + x] - H[Math.max(0, y - 1) * S + x];
      const sh = clamp(1 - (hx + hz) * 1.6, 0.72, 1.12);
      r *= sh; gg *= sh; b *= sh;
    }
    d[o] = clamp(r, 0, 255); d[o + 1] = clamp(gg, 0, 255); d[o + 2] = clamp(b, 0, 255); d[o + 3] = 255;
  }
  // contours: every 1 m, an index line every 5 m; shoreline in blue
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = y * S + x, o = i * 4;
    if (Wt[i] !== Wt[i + 1] || Wt[i] !== Wt[i + S]) { d[o] = 92; d[o + 1] = 118; d[o + 2] = 138; continue; }
    if (Wt[i]) continue;
    const a = Math.floor(H[i]), bR = Math.floor(H[i + 1]), bD = Math.floor(H[i + S]);
    if (a !== bR || a !== bD) {
      const idx = (Math.max(a, bR, bD) % 5) === 0;
      const f = idx ? 0.45 : 0.72;
      d[o] = d[o] * f + 138 * (1 - f) * (idx ? 0.62 : 0.8); d[o + 1] = d[o + 1] * f + 98 * (1 - f) * (idx ? 0.62 : 0.8); d[o + 2] = d[o + 2] * f + 66 * (1 - f) * (idx ? 0.62 : 0.8);
    }
  }
  g.putImageData(img, 0, 0);
  // woods: little tree rings, jittered, where the forest is thick
  g.lineWidth = 1;
  for (let y = 6; y < S; y += 11) for (let x = 6 + (y % 22 ? 5 : 0); x < S; x += 11) {
    const jx = x + (h2(x, y, 1) - 0.5) * 6, jy = y + (h2(x, y, 2) - 0.5) * 6;
    const rx = jx / k, rz = jy / k; if (rx < 0 || rz < 0 || rx >= R.N || rz >= R.N) continue;
    const f = R.forest[Math.floor(rz) * R.N + Math.floor(rx)];
    if (f < 0.42 || R.isWater(rx, rz) || h2(x, y, 9) > f * 1.3) continue;
    g.strokeStyle = 'rgba(86,104,70,0.8)'; g.beginPath(); g.arc(jx, jy, 2.6 + h2(x, y, 4) * 1.2, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(86,104,70,0.35)'; g.fillRect(Math.round(jx), Math.round(jy + 3), 1, 2);
  }
  // rivers on top of the wash: a darker centre line
  g.strokeStyle = 'rgba(70,98,122,0.9)'; g.lineWidth = 2;
  for (const rv of R.rivers) { g.beginPath(); rv.forEach((p, i) => (i ? g.lineTo(p.x * k, p.z * k) : g.moveTo(p.x * k, p.z * k))); g.stroke(); }
  // rock outcrops: dark blobs with hachures
  for (const r of R.rocks) {
    if (r.kind === 'pebble') continue;
    const rr = Math.max(1.5, Math.max(r.sx, r.sz) * k * 0.5);
    g.fillStyle = 'rgba(59,58,54,0.85)'; g.beginPath(); g.ellipse(r.x * k, r.z * k, rr, rr * 0.8, r.yaw, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(59,58,54,0.6)'; g.lineWidth = 1;
    for (let a = 0; a < 6; a++) { const t = (a / 6) * Math.PI * 2 + r.yaw; g.beginPath(); g.moveTo(r.x * k + Math.cos(t) * rr, r.z * k + Math.sin(t) * rr); g.lineTo(r.x * k + Math.cos(t) * (rr + 3), r.z * k + Math.sin(t) * (rr + 3)); g.stroke(); }
  }
  // steep ground: red grease-pencil hatching, sparse and hand-drawn
  g.strokeStyle = 'rgba(184,56,46,0.5)'; g.lineWidth = 1.4;
  for (let z = 4; z < R.N - 4; z += 3) for (let x = 4; x < R.N - 4; x += 3) {
    if (R.isWater(x, z) || slopeAt(R, x, z) < 0.62) continue;
    const px = x * k, pz = z * k, j = (h2(x, z, 3) - 0.5) * 3;
    g.beginPath(); g.moveTo(px - 8 + j, pz + 8); g.lineTo(px + 8 + j, pz - 8); g.stroke();
  }
  // deposits: stamped symbols with labels
  g.font = '14px VT'; g.textBaseline = 'middle';
  for (const dp of R.deposits) {
    const x = dp.x * k, y = dp.z * k;
    g.setLineDash([3, 3]); g.strokeStyle = 'rgba(59,58,54,0.55)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, Math.max(10, dp.r * k * 0.8), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#2e2d2a'; g.strokeStyle = '#2e2d2a'; g.lineWidth = 2;
    if (dp.kind === 'ore') { g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y + 6); g.lineTo(x - 7, y + 6); g.closePath(); g.fill(); }
    else { g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + 6, y); g.lineTo(x, y + 8); g.lineTo(x - 6, y); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.stroke(); }
    g.fillStyle = '#2e2d2a'; g.fillText(dp.kind === 'ore' ? 'Fe' : 'Lm', x + 10, y - 1);
  }
  // the grid: blue lines every 16 m with letters and numbers in the margin, a finer tick every 4 m
  g.strokeStyle = 'rgba(80,110,140,0.45)'; g.lineWidth = 1;
  for (let i = 0; i <= R.N; i += GRID) { const p = Math.round(i * k) + 0.5; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
  g.fillStyle = 'rgba(60,90,120,0.9)'; g.font = '14px VT'; g.textBaseline = 'top';
  for (let i = 0; i < 8; i++) { g.fillText(LET[i], i * GRID * k + 4, 4); g.fillText(String(i + 1), 4, i * GRID * k + 16); }
  // hostile creep if the region is held by a rival: cross-hatched on the side away from the recommended LZ
  const L = R.landing;
  if (pr.state === 'rival') {
    const rv = RIVALS[planet.seed % RIVALS.length];
    const fx = (R.N - L.x) * k, fz = (R.N - L.z) * k;
    g.save(); g.beginPath(); g.arc(fx, fz, 26 * k, 0, Math.PI * 2); g.clip();
    g.strokeStyle = 'rgba(184,56,46,0.55)'; g.lineWidth = 1.5;
    for (let i = -S; i < S; i += 9) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); g.beginPath(); g.moveTo(i + S, 0); g.lineTo(i, S); g.stroke(); }
    g.restore();
    hand(g, `HOSTILE CREEP - ${rv.name.toUpperCase()}`, fx - 90, fz - 26 * k - 18, -0.04, 'rgba(184,56,46,0.95)', 18);
  }
  // the recommended LZ: a red ring drawn twice by hand, and its label
  g.strokeStyle = 'rgba(184,56,46,0.9)'; g.lineWidth = 2.4;
  for (let p = 0; p < 2; p++) {
    g.beginPath();
    for (let a = 0; a <= 64; a++) { const t = (a / 64) * Math.PI * 2.08 + p * 0.4, r = 26 + Math.sin(t * 3 + p) * 1.6 + p * 2; const x = L.x * k + Math.cos(t) * r, y = L.z * k + Math.sin(t) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  hand(g, 'LZ ALPHA (REC.)', L.x * k + 32, L.z * k - 38, -0.05, 'rgba(184,56,46,0.95)', 18);
  // Calder's margin note, in graphite
  hand(g, 'good ground for a first root. - C.', L.x * k - 40, L.z * k + 40, 0.03, 'rgba(59,58,54,0.85)', 14);
  // scale bar, north arrow, title block
  const sb = { x: 28, y: S - 44 };
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#e8e2d0' : '#2e2d2a'; g.fillRect(sb.x + i * 10 * k, sb.y, 10 * k, 6); }
  g.strokeStyle = '#2e2d2a'; g.lineWidth = 1; g.strokeRect(sb.x + 0.5, sb.y + 0.5, 40 * k, 6);
  g.fillStyle = '#2e2d2a'; g.font = '14px VT'; g.textBaseline = 'top';
  for (let i = 0; i <= 4; i++) g.fillText(String(i * 10), sb.x + i * 10 * k - 4, sb.y + 10);
  g.fillText('METRES', sb.x + 40 * k + 10, sb.y - 2);
  const na = { x: S - 52, y: 70 };
  g.beginPath(); g.moveTo(na.x, na.y - 30); g.lineTo(na.x + 10, na.y + 8); g.lineTo(na.x, na.y); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(na.x, na.y - 30); g.lineTo(na.x - 10, na.y + 8); g.lineTo(na.x, na.y); g.closePath(); g.stroke();
  g.font = '20px Superwide'; g.textAlign = 'center'; g.fillText('N', na.x, na.y + 14); g.textAlign = 'left';
  const tb = { x: S - 330, y: S - 132, w: 304, h: 106 };
  g.fillStyle = 'rgba(226,220,202,0.94)'; g.fillRect(tb.x, tb.y, tb.w, tb.h);
  g.strokeStyle = '#2e2d2a'; g.lineWidth = 2; g.strokeRect(tb.x + 0.5, tb.y + 0.5, tb.w, tb.h); g.lineWidth = 1; g.strokeRect(tb.x + 4.5, tb.y + 4.5, tb.w - 8, tb.h - 8);
  g.fillStyle = '#2e2d2a'; g.font = '14px VT';
  g.fillText(`U.S.P.C. SURVEY CHART 7-${String(pr.id + 1).padStart(2, '0')}`, tb.x + 12, tb.y + 12);
  g.font = '20px Superwide'; g.fillText(pr.name.toUpperCase(), tb.x + 12, tb.y + 32);
  g.font = '14px VT';
  g.fillText(`${R.biome.name.toUpperCase()} - ${planet.name.toUpperCase()}`, tb.x + 12, tb.y + 60);
  g.fillText(`OPERATION ${op} - FROM ORBIT`, tb.x + 12, tb.y + 78);
  stamp(g, 'SECRET', tb.x + tb.w - 92, tb.y - 18, -0.12);
  return c;
}
/** a hand-lettered line: slight baseline wobble, a skew, uneven pressure */
function hand(g: CanvasRenderingContext2D, s: string, x: number, y: number, rot: number, col: string, size: number) {
  g.save(); g.translate(x, y); g.rotate(rot); g.transform(1, 0, -0.18, 1, 0, 0);
  g.font = `${size}px VT`; g.fillStyle = col; g.textBaseline = 'alphabetic';
  let cx = 0;
  for (let i = 0; i < s.length; i++) { const ch = s[i]; g.globalAlpha = 0.75 + h2(i, x, 2) * 0.25; g.fillText(ch, cx, Math.sin(i * 0.7 + x) * 1.2); cx += g.measureText(ch).width; }
  g.restore();
}
/** a rubber stamp: rotated, a double border, registration a little off, ink uneven */
function stamp(g: CanvasRenderingContext2D, s: string, x: number, y: number, rot: number) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = '20px Superwide'; const w = g.measureText(s).width + 16;
  g.strokeStyle = 'rgba(184,56,46,0.85)'; g.lineWidth = 2.5; g.strokeRect(0, 0, w, 30); g.lineWidth = 1; g.strokeRect(3, 3, w - 6, 24);
  g.fillStyle = 'rgba(184,56,46,0.85)'; g.textBaseline = 'middle'; g.fillText(s, 8, 16);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) g.fillRect(h2(i, 1, 7) * w, h2(i, 2, 7) * 30, 2, 1);
  g.restore();
}

// ================================================================== the planning screen furniture (DOM)
const CSS = /* css */`
.dz { position: fixed; inset: 0; z-index: 35; pointer-events: none; --u: calc(1px * var(--s, 2)); font-family: 'VT', monospace; }
.dz .sheet { position: absolute; right: calc(10 * var(--u)); top: 50%; transform: translateY(-50%) rotate(0.7deg); width: calc(150 * var(--u)); padding: calc(7 * var(--u)) calc(8 * var(--u)) calc(8 * var(--u)) calc(12 * var(--u));
  background: repeating-linear-gradient(180deg, transparent 0 calc(8 * var(--u)), rgba(159, 180, 194, 0.32) calc(8 * var(--u)) calc(8 * var(--u) + 1px)), linear-gradient(180deg, #ddd6c3, #d2cab5);
  color: #3b3a36; box-shadow: calc(3 * var(--u)) calc(4 * var(--u)) calc(6 * var(--u)) rgba(8, 8, 10, 0.55); pointer-events: auto; animation: dz-in 520ms cubic-bezier(.2,1.2,.4,1); }
.dz .sheet::before { content: ''; position: absolute; left: calc(7 * var(--u)); top: 0; bottom: 0; width: 1px; background: rgba(184, 56, 46, 0.35); }
.dz .sheet::after { content: ''; position: absolute; left: 40%; top: calc(-5 * var(--u)); width: calc(28 * var(--u)); height: calc(10 * var(--u)); background: rgba(216, 206, 170, 0.75); transform: rotate(-3deg); box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
@keyframes dz-in { 0% { transform: translate(calc(40 * var(--u)), -50%) rotate(4deg); opacity: 0; } 100% { transform: translateY(-50%) rotate(0.7deg); opacity: 1; } }
.dz .k { font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 10px); letter-spacing: 2px; color: #5a5850; }
.dz .t { font-family: 'Superwide', monospace; font-size: var(--cf-sw2, 20px); line-height: 1.1; color: #2e2d2a; margin: calc(2 * var(--u)) 0 calc(4 * var(--u)); }
.dz .row { display: flex; font-size: var(--cf-vt1, 14px); line-height: calc(8 * var(--u)); white-space: nowrap; }
.dz .row b { font-weight: normal; color: #6b6a62; flex: none; width: 46%; overflow: hidden; }
.dz .row b::after { content: ' ........................'; color: rgba(107, 106, 98, 0.5); }
.dz .row span { color: #2a2926; overflow: hidden; text-overflow: ellipsis; }
.dz .rule { height: 1px; background: rgba(59, 58, 54, 0.4); margin: calc(3 * var(--u)) 0; }
.dz .note { font-size: var(--cf-vt1, 14px); line-height: calc(8 * var(--u)); color: #4a4944; margin-top: calc(3 * var(--u)); white-space: normal; }
.dz .verdict { position: absolute; right: calc(8 * var(--u)); bottom: calc(26 * var(--u)); font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 10px); letter-spacing: 1px; padding: calc(1 * var(--u)) calc(4 * var(--u)); border: calc(2 * var(--u)) solid currentColor; border-radius: calc(2 * var(--u)); transform: rotate(-8deg); opacity: 0; }
.dz .verdict.on { animation: dz-stamp 260ms cubic-bezier(.3,1.8,.5,1) both; opacity: 1; }
.dz .verdict.good { color: rgba(60, 96, 70, 0.9); } .dz .verdict.warn { color: rgba(170, 120, 40, 0.95); } .dz .verdict.bad { color: rgba(184, 56, 46, 0.92); }
@keyframes dz-stamp { 0% { transform: rotate(-8deg) scale(2); opacity: 0; } 70% { transform: rotate(-8deg) scale(0.94, 1.06); opacity: 1; } 100% { transform: rotate(-8deg) scale(1); opacity: 1; } }
.dz .btns { display: flex; gap: calc(4 * var(--u)); margin-top: calc(6 * var(--u)); }
.dz button { flex: 1; font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 10px); letter-spacing: 1px; padding: calc(4 * var(--u)) calc(3 * var(--u)); cursor: pointer; border: none; border-radius: calc(2 * var(--u));
  background: linear-gradient(180deg, #4d5038, #3f4232); color: #d9d2bf; box-shadow: 0 calc(2 * var(--u)) 0 #1c1d17, inset 0 1px 0 rgba(255,255,255,0.12); }
.dz button:hover { background: linear-gradient(180deg, #5e6148, #4d5038); }
.dz button:active { transform: translateY(calc(1 * var(--u))); box-shadow: 0 calc(1 * var(--u)) 0 #1c1d17; }
.dz button.go { background: linear-gradient(180deg, #8a3a2e, #72241d); color: #ecd9c0; }
.dz button.go:hover { background: linear-gradient(180deg, #a2463a, #8a3a2e); }
.dz button:disabled { opacity: 0.45; cursor: default; }
.dz .title { position: absolute; left: calc(12 * var(--u)); top: calc(10 * var(--u)); color: #e8eef0; text-shadow: 0 1px 0 #000; }
.dz .title .k { color: #9fb4c2; }
.dz .title .t { color: #e8eef0; font-family: 'Canned', monospace; font-size: var(--cf-sw4, 40px); }
.dz .hint { position: absolute; left: calc(12 * var(--u)); bottom: calc(10 * var(--u)); color: rgba(232, 238, 240, 0.7); font-size: var(--cf-vt1, 14px); letter-spacing: 1px; text-shadow: 0 1px 0 #000; }
.dz .hint b { color: #d9a43a; font-weight: normal; }
@media (max-aspect-ratio: 4/3) { .dz .sheet { top: auto; bottom: calc(8 * var(--u)); transform: rotate(0.7deg); width: calc(100% - 20 * var(--u)); right: calc(10 * var(--u)); box-sizing: border-box; } }
`;
let styled = false;
function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.id = 'deploy-dz-css'; s.textContent = CSS; document.head.appendChild(s); }
const div = (cls: string, parent: HTMLElement, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export interface PlanOpts {
  region: Region; pr: PRegion; planet: Planet; op: string; ship: Ship; cam: THREE.PerspectiveCamera; canvas: HTMLCanvasElement;
  onConfirm(lz: LZInfo): void;
  /** the officer points at the pin */
  onPin?(world: THREE.Vector3): void;
}
/** the interactive drop-zone pick: pointer over the table, the typed sheet, the pin, confirm */
export class PlanTable {
  readonly root: HTMLDivElement;
  private rows: Record<string, HTMLSpanElement> = {};
  private verdict: HTMLDivElement; private note: HTMLDivElement; private go: HTMLButtonElement;
  private hover: LZInfo | null = null; chosen: LZInfo;
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2();
  private pinT = -1; private done = false;
  private off: (() => void)[] = [];
  constructor(readonly o: PlanOpts) {
    style();
    const R = o.region, facts = regionFacts(R);
    this.chosen = assessLZ(R, R.landing.x, R.landing.z);
    this.root = div('dz', document.body) as HTMLDivElement;
    const title = div('title', this.root);
    div('k', title, 'LAUNCH CONTROL &middot; GALLERY 2'); div('t', title, 'MARK THE DROP ZONE');
    div('hint', this.root, '<b>CLICK</b> THE CHART TO PIN A DROP ZONE &middot; <b>R</b> RECOMMENDED &middot; <b>ENTER</b> CONFIRM');
    const sh = div('sheet', this.root);
    div('k', sh, 'U.S.P.C. FORM DZ-7 &middot; INTELLIGENCE');
    div('t', sh, esc(o.pr.name.toUpperCase()));
    const row = (k: string, v = '') => { const r = div('row', sh); const b = document.createElement('b'); b.textContent = k; r.appendChild(b); const s = document.createElement('span'); s.innerHTML = v; r.appendChild(s); this.rows[k] = s; };
    const danger = '◆'.repeat(o.pr.danger) + '◇'.repeat(3 - o.pr.danger);
    row('TERRAIN', `${esc(R.biome.name)}, relief ${Math.round(R.biome.rough * 100)}%`);
    row('WATER', `${Math.round(facts.water * 100)}% of the chart`);
    row('STEEP GROUND', `${Math.round(facts.steep * 100)}% of the land`);
    row('DEPOSITS', `${facts.ore} ferrite &middot; ${facts.crystal} lumen`);
    row('FAUNA', danger);
    row('HOSTILES', o.pr.state === 'rival' ? `<span style="color:#9a2e24">${esc(RIVALS[o.planet.seed % RIVALS.length].name)}</span>` : 'none on the scope');
    div('rule', sh);
    row('DROP ZONE'); row('ELEVATION'); row('GROUND'); row('NEAREST SEAM');
    this.note = div('note', sh) as HTMLDivElement;
    div('note', sh, 'Land within <b style="color:#9a2e24;font-weight:normal">6 m</b> of the pin for a core cell; close in for ore.');
    this.verdict = div('verdict', sh) as HTMLDivElement;
    const btns = div('btns', sh);
    const rec = document.createElement('button'); rec.textContent = 'RECOMMENDED'; btns.appendChild(rec);
    this.go = document.createElement('button'); this.go.className = 'go'; this.go.textContent = 'CONFIRM DROP ZONE'; btns.appendChild(this.go);
    rec.onclick = (e) => { e.stopPropagation(); this.pick(R.landing.x, R.landing.z); };
    this.go.onclick = (e) => { e.stopPropagation(); this.confirm(); };
    for (const b of [rec, this.go]) b.addEventListener('pointerenter', () => sfx('hover', 1.2, 0.3));
    // pointer on the canvas: hover and pick
    const move = (e: PointerEvent) => { const p = this.at(e.clientX, e.clientY); this.hover = p ? assessLZ(R, p[0], p[1]) : null; this.showCursor(p); if (p) this.fill(this.hover!, false); else this.fill(this.chosen, true); };
    const down = (e: PointerEvent) => { if (e.button !== 0) return; const p = this.at(e.clientX, e.clientY); if (p) this.pick(p[0], p[1]); };
    const key = (e: KeyboardEvent) => { if (this.done) return; if (e.key === 'Enter') this.confirm(); else if (e.key === 'r' || e.key === 'R') this.pick(R.landing.x, R.landing.z); };
    o.canvas.addEventListener('pointermove', move); o.canvas.addEventListener('pointerdown', down); addEventListener('keydown', key);
    this.off.push(() => { o.canvas.removeEventListener('pointermove', move); o.canvas.removeEventListener('pointerdown', down); removeEventListener('keydown', key); });
    this.pick(R.landing.x, R.landing.z, true);
  }
  /** region coordinates under a screen point, or null off the chart */
  private at(cx: number, cy: number): [number, number] | null {
    const r = this.o.canvas.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.o.cam);
    const hit = this.ray.intersectObject(this.o.ship.table.map, false)[0];
    if (!hit || !hit.uv) return null;
    return [hit.uv.x * this.o.region.N, (1 - hit.uv.y) * this.o.region.N];
  }
  /** table-space position of a region point (on the glass) */
  tablePos(x: number, z: number, out = new THREE.Vector3()) {
    const T = this.o.ship.table, N = this.o.region.N;
    return out.set(T.centre.x + (x / N - 0.5) * T.size, T.centre.y + 0.004, T.centre.z + (z / N - 0.5) * T.size);
  }
  private showCursor(p: [number, number] | null) {
    const c = this.o.ship.table.cursor; c.visible = !!p;
    if (p) { this.tablePos(p[0], p[1], c.position); c.position.y += 0.002; }
    document.body.style.cursor = p ? 'crosshair' : '';
  }
  private fill(z: LZInfo, chosen: boolean) {
    const r = this.rows;
    r['DROP ZONE'].innerHTML = `GRID ${z.grid}${chosen ? '' : ' <span style="color:#8a8578">?</span>'}`;
    r['ELEVATION'].textContent = `${z.elev.toFixed(1)} m`;
    r['GROUND'].textContent = `${z.ground}, ${z.slope > 0.55 ? 'steep' : z.slope > 0.3 ? 'rolling' : 'level'}`;
    r['NEAREST SEAM'].textContent = z.seam ? `${z.seam.kind === 'ore' ? 'ferrite' : 'lumen'}, ${Math.round(z.seam.dist)} m` : 'none charted';
    this.note.textContent = z.note;
  }
  pick(x: number, z: number, quiet = false) {
    if (this.done) return;
    const a = assessLZ(this.o.region, x, z);
    this.chosen = a;
    this.fill(a, true);
    const v = this.verdict; v.className = 'verdict'; void v.offsetWidth;
    v.textContent = a.verdict; v.classList.add('on', a.verdict === 'SUITABLE' ? 'good' : a.verdict === 'ROUGH' ? 'warn' : 'bad');
    this.go.disabled = !a.ok;
    const pin = this.o.ship.table.pin; pin.visible = true; this.tablePos(a.x, a.z, pin.position); this.pinT = 0;
    if (!quiet) { csfx(a.ok ? 'thud' : 'deny', 0.5, 2.2); sfx('click', 1, 0.5); }
    this.o.onPin?.(this.o.ship.table.root.localToWorld(pin.position.clone()));
  }
  confirm() {
    if (this.done || !this.chosen.ok) return;
    this.done = true;
    csfx('button', 0.9); csfx('relay', 0.6);
    this.root.style.transition = 'opacity 400ms'; this.root.style.opacity = '0';
    this.o.onConfirm(this.chosen);
  }
  update(dt: number) {
    const pin = this.o.ship.table.pin;
    if (this.pinT >= 0) {
      this.pinT += dt;
      // the pin drops in, bounces once, settles
      const t = this.pinT, y0 = this.o.ship.table.centre.y + 0.004;
      pin.position.y = t < 0.18 ? y0 + 0.4 * (1 - (t / 0.18) ** 2) : t < 0.32 ? y0 + Math.sin(((t - 0.18) / 0.14) * Math.PI) * 0.02 : y0;
      if (t > 0.4) this.pinT = -1;
    }
    const c = this.o.ship.table.cursor; if (c.visible) c.rotation.z += dt * 0.8;
  }
  dispose() { for (const f of this.off.splice(0)) f(); this.root.remove(); document.body.style.cursor = ''; this.o.ship.table.cursor.visible = false; }
}

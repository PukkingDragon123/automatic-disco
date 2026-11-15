// The crew's painted page: one 1024 px canvas of embroidered patches (the UNAA program crest, the MERIDIAN mission
// patch, department patches, flight patches), name tapes, rank boards, small device screens and fabric tiles
// (canvas, nylon webbing, leather, apron cloth), painted with brushes at native resolution: twill threads, merrowed
// edges, stitch lines, fold shading, edge wear. Its regions are registered into the machine kit's region table
// (robots/atlas.ts REG, 'cw:' prefix) so the same Kit builds gear from both pages: material 0 is the kit's UNAA
// livery atlas (steel, rubber, brass, lenses), material 1 is this page.
import * as THREE from 'three';
import { REG } from '../../robots/atlas';
import { atlasFor, kitMaterial, kitUniforms, livery, type Atlas } from '../../robots/atlas';
import { gbuf } from '../../gfx/gbuf';
import { ROSTER, CREW_IDS, type CrewId } from './roster';

export const CW = 1024;
const R: Record<string, [number, number, number, number]> = {};
/** a region in canvas pixels, registered for the kit as half-scale (the kit's table is in 512-units) */
function reg(k: string, x: number, y: number, w: number, h: number) { R[k] = [x, y, w, h]; REG['cw:' + k] = [x / 2, y / 2, w / 2, h / 2]; }
// patches
reg('unaa', 0, 0, 256, 256); reg('austral', 256, 0, 256, 256);
reg('med', 512, 0, 128, 128); reg('eng', 640, 0, 128, 128); reg('sci', 768, 0, 128, 128); reg('sec', 896, 0, 128, 128);
reg('wings', 512, 128, 128, 128); reg('sparrow', 640, 128, 128, 128); reg('sup', 768, 128, 128, 128); reg('fl3', 896, 128, 128, 128);
// name tapes (8 x 256 x 48) and small plates
CREW_IDS.forEach((id, i) => reg('name:' + id, (i % 4) * 256, 256 + Math.floor(i / 4) * 48, 256, 48));
reg('rank', 0, 352, 128, 32); reg('rank2', 128, 352, 128, 32); reg('cmd', 256, 352, 128, 32); reg('capb', 384, 352, 64, 64);
for (let i = 0; i < 4; i++) reg('part' + i, i * 160, 416, 160, 48);
reg('flag', 448, 352, 96, 64); reg('id', 544, 352, 96, 64); reg('jar', 640, 352, 128, 128); reg('label', 768, 352, 128, 32);
// fabric and material tiles (128 px, 128-aligned so the kit's tiling never bleeds)
reg('canvas', 0, 512, 128, 128); reg('sage', 128, 512, 128, 128); reg('nylon', 256, 512, 128, 128); reg('leather', 384, 512, 128, 128);
reg('apron', 512, 512, 128, 128); reg('orange', 640, 512, 128, 128); reg('web', 768, 512, 128, 128); reg('ceramic', 896, 512, 128, 128);
reg('navy', 0, 640, 128, 128); reg('towel', 128, 640, 128, 128); reg('glassG', 256, 640, 128, 128); reg('leaf', 384, 640, 128, 128);
// screens
reg('tablet', 512, 640, 256, 160); reg('scan', 768, 640, 128, 64); reg('radio', 896, 640, 128, 64); reg('wrist', 768, 704, 128, 64); reg('chrono', 896, 704, 128, 64);
reg('plaque', 0, 800, 512, 224); reg('memo', 512, 800, 256, 224);

const hex = (n: number) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
const rgb = (c: number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
type G = CanvasRenderingContext2D;

// ------------------------------------------------------------------ brushes
/** embroidery fill: the shape filled, then satin threads laid diagonally across it, lighter on the lit side */
function satin(g: G, path: () => void, col: string, x: number, y: number, w: number, h: number, ang = 0.6, gap = 2.2) {
  g.save(); path(); g.fillStyle = col; g.fill(); g.clip();
  g.globalAlpha = 0.22; g.strokeStyle = '#ffffff'; g.lineWidth = 0.7;
  const c = Math.cos(ang), s = Math.sin(ang), L = w + h;
  for (let k = -L; k < L; k += gap) { g.beginPath(); g.moveTo(x + w / 2 + c * -L - s * k, y + h / 2 + s * -L + c * k); g.lineTo(x + w / 2 + c * L - s * k, y + h / 2 + s * L + c * k); g.stroke(); }
  g.globalAlpha = 0.18; g.strokeStyle = '#000000';
  for (let k = -L + gap / 2; k < L; k += gap) { g.beginPath(); g.moveTo(x + w / 2 + c * -L - s * k, y + h / 2 + s * -L + c * k); g.lineTo(x + w / 2 + c * L - s * k, y + h / 2 + s * L + c * k); g.stroke(); }
  // light from the upper left, a soft fall-off to the lower right (thread sheen)
  const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.restore();
}
/** twill weave over a rectangle (patch backgrounds, tapes) */
function twill(g: G, x: number, y: number, w: number, h: number, base: string, k = 1) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  for (let i = -h; i < w + h; i += 3) {
    g.strokeStyle = `rgba(255,255,255,${0.05 * k})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + h, y + h); g.stroke();
    g.strokeStyle = `rgba(0,0,0,${0.09 * k})`; g.beginPath(); g.moveTo(x + i + 1.5, y); g.lineTo(x + i + 1.5 + h, y + h); g.stroke();
  }
  g.restore();
}
/** a merrowed (overlocked) border round a circle: dense radial whip stitches */
function merrowCircle(g: G, cx: number, cy: number, r: number, col: string, wid = 9) {
  g.save();
  g.lineWidth = wid + 2; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(cx + 1, cy + 2, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = wid; g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  const n = Math.round(r * 1.6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, a2 = a + 0.035;
    g.strokeStyle = i % 2 ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.25)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - wid / 2), cy + Math.sin(a) * (r - wid / 2)); g.lineTo(cx + Math.cos(a2) * (r + wid / 2), cy + Math.sin(a2) * (r + wid / 2)); g.stroke();
  }
  g.restore();
}
function merrowRect(g: G, x: number, y: number, w: number, h: number, col: string, wid = 5) {
  g.save();
  g.lineWidth = wid; g.strokeStyle = col; g.strokeRect(x + wid / 2, y + wid / 2, w - wid, h - wid);
  g.lineWidth = 1;
  for (let i = 0; i < (w + h) * 2; i += 2.2) {
    g.strokeStyle = (i | 0) % 2 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)';
    let px: number, py: number, dx: number, dy: number;
    if (i < w) { px = x + i; py = y; dx = 0.6; dy = wid; } else if (i < w + h) { px = x + w; py = y + i - w; dx = -wid; dy = 0.6; } else if (i < 2 * w + h) { px = x + w - (i - w - h); py = y + h; dx = -0.6; dy = -wid; } else { px = x; py = y + h - (i - 2 * w - h); dx = wid; dy = -0.6; }
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx, py + dy); g.stroke();
  }
  g.restore();
}
/** a running stitch along a path (dashes with a tiny shadow) */
function stitch(g: G, path: () => void, col: string, w = 1.4, dash = 4) {
  g.save(); g.setLineDash([dash, dash * 0.8]); g.lineCap = 'round';
  g.translate(0.8, 0.8); path(); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = w; g.stroke();
  g.translate(-0.8, -0.8); path(); g.strokeStyle = col; g.stroke(); g.restore();
}
function text(g: G, s: string, x: number, y: number, size: number, col: string, o: { font?: string; align?: CanvasTextAlign; shadow?: boolean; spacing?: number; maxW?: number } = {}) {
  g.save();
  g.font = `${size}px ${o.font ?? "'Superwide', 'Jersey', sans-serif"}`; g.textAlign = o.align ?? 'center'; g.textBaseline = 'middle';
  if (o.spacing) (g as unknown as { letterSpacing: string }).letterSpacing = o.spacing + 'px';
  if (o.shadow !== false) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(s, x + 1, y + 1.5, o.maxW); }
  g.fillStyle = col; g.fillText(s, x, y, o.maxW);
  g.restore();
}
/** text set round an arc (patch rims) */
function arcText(g: G, s: string, cx: number, cy: number, r: number, mid: number, size: number, col: string, inward = false) {
  g.save(); g.font = `${size}px 'Superwide', 'Jersey', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const widths = [...s].map((ch) => g.measureText(ch).width * 1.12), tot = widths.reduce((a, b) => a + b, 0);
  let a = mid - (inward ? -1 : 1) * tot / r / 2;
  for (let i = 0; i < s.length; i++) {
    const da = widths[i] / r * (inward ? -1 : 1);
    const ac = a + da / 2;
    g.save(); g.translate(cx + Math.cos(ac) * r, cy + Math.sin(ac) * r); g.rotate(ac + (inward ? -Math.PI / 2 : Math.PI / 2));
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillText(s[i], 0.8, 1.2); g.fillStyle = col; g.fillText(s[i], 0, 0); g.restore();
    a += da;
  }
  g.restore();
}
function poly(g: G, pts: number[][], x: number, y: number, sx: number, sy = sx) { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(x + px * sx, y + py * sy) : g.moveTo(x + px * sx, y + py * sy))); g.closePath(); }

// the Americas and Antarctica as a stitched silhouette (unit box, drawn by hand)
const AMERICAS = [[8, 18], [14, 11], [24, 9], [33, 7], [43, 5], [51, 8], [55, 15], [53, 21], [57, 25], [61, 20], [66, 22], [70, 29], [66, 34], [62, 39], [61, 45], [63, 52], [59, 51], [55, 47], [49, 48], [45, 51], [44, 56], [48, 61], [52, 65], [57, 64], [64, 66], [72, 70], [79, 74], [77, 80], [72, 85], [66, 89], [61, 95], [58, 100], [55, 95], [54, 87], [53, 80], [50, 73], [46, 66], [41, 61], [36, 56], [31, 50], [27, 43], [23, 35], [19, 28], [13, 24]];
const ANTARCTICA = [[18, 0], [30, -3], [44, -1], [56, -4], [70, -2], [82, 1], [88, 6], [80, 10], [66, 12], [52, 11], [40, 13], [26, 11], [14, 8], [10, 4]];

// ------------------------------------------------------------------ the pieces
function patchUNAA(g: G, X: number, Y: number) {
  const cx = X + 128, cy = Y + 128, r = 118;
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip(); twill(g, X, Y, 256, 256, '#1f2a3a', 1.2);
  // the rim band, a ring of ice-white text
  g.lineWidth = 34; g.strokeStyle = '#2b3a50'; g.beginPath(); g.arc(cx, cy, r - 20, 0, Math.PI * 2); g.stroke(); g.restore();
  stitch(g, () => { g.beginPath(); g.arc(cx, cy, r - 38, 0, Math.PI * 2); }, '#c9a464', 1.4, 3);
  arcText(g, 'UNITED NATIONS', cx, cy, r - 20, -Math.PI / 2, 15, '#dfe3dc');
  arcText(g, 'ANTARCTICA · AMERICAS', cx, cy, r - 20, Math.PI / 2, 13, '#dfe3dc', true);
  // meridians on the field
  g.save(); g.beginPath(); g.arc(cx, cy, r - 40, 0, Math.PI * 2); g.clip();
  g.strokeStyle = 'rgba(160,190,210,0.28)'; g.lineWidth = 1.4;
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.ellipse(cx, cy, Math.abs(i) * 22 + 0.5, r - 40, 0, 0, Math.PI * 2); g.stroke(); }
  for (let j = -2; j <= 2; j++) { g.beginPath(); g.moveTo(cx - 90, cy + j * 26); g.lineTo(cx + 90, cy + j * 26); g.stroke(); }
  // the continents: the Americas standing over Antarctica
  satin(g, () => poly(g, AMERICAS, cx - 46, cy - 64, 0.98, 1.0), '#dfe3dc', cx - 50, cy - 70, 100, 110, 0.9);
  satin(g, () => poly(g, ANTARCTICA, cx - 46, cy + 52, 1.0, 1.05), '#dfe3dc', cx - 50, cy + 44, 100, 20, 0.2);
  // the southern star: a four-point amber compass star over the pole
  const star = (x: number, y: number, R0: number, r0: number, col: string) => satin(g, () => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI * 2, rr = i % 2 ? r0 : R0; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }, col, x - R0, y - R0, R0 * 2, R0 * 2, 0.4, 1.8);
  star(cx + 26, cy + 30, 20, 5, '#d9a43a');
  for (const [sx, sy, s] of [[-30, 22, 5], [-40, 4, 4], [40, -30, 4], [-18, 40, 3.5]]) star(cx + sx, cy + sy, s, s * 0.35, '#e8e2cc');
  g.restore();
  merrowCircle(g, cx, cy, r, '#c9a464', 8);
}
function patchAustral(g: G, X: number, Y: number) {
  const shield = [[20, 14], [236, 14], [236, 150], [128, 244], [20, 150]];
  g.save(); poly(g, shield, X, Y, 1); g.clip(); twill(g, X, Y, 256, 256, '#26344a', 1.2);
  // night sky with the Southern Cross, a planet limb, the ship
  const gr = g.createLinearGradient(X, Y + 30, X, Y + 220); gr.addColorStop(0, 'rgba(10,16,30,0.4)'); gr.addColorStop(1, 'rgba(90,60,40,0.25)'); g.fillStyle = gr; g.fillRect(X, Y, 256, 256);
  satin(g, () => { g.beginPath(); g.arc(X + 128, Y + 330, 170, Math.PI * 1.08, Math.PI * 1.92); g.closePath(); }, '#7a5a3a', X, Y + 150, 256, 100, 0.2);
  g.strokeStyle = '#d9a43a'; g.lineWidth = 3; g.beginPath(); g.arc(X + 128, Y + 330, 172, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  const cross = [[128, 46, 8], [128, 104, 7], [100, 76, 6], [154, 70, 6], [142, 92, 3.5]];
  for (const [x, y, s] of cross) satin(g, () => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? s * 0.42 : s; g.lineTo(X + x + Math.cos(a) * rr, Y + y + Math.sin(a) * rr); } g.closePath(); }, '#e8e4d4', X + x - s, Y + y - s, s * 2, s * 2, 0.5, 1.6);
  // the ship: a long hull with a ring, in profile
  satin(g, () => { g.beginPath(); g.moveTo(X + 52, Y + 142); g.lineTo(X + 190, Y + 132); g.lineTo(X + 208, Y + 138); g.lineTo(X + 190, Y + 146); g.lineTo(X + 52, Y + 150); g.closePath(); }, '#c8ccc4', X + 50, Y + 130, 160, 22);
  g.strokeStyle = '#9aa0a0'; g.lineWidth = 4; g.beginPath(); g.ellipse(X + 110, Y + 142, 8, 22, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#d9a43a'; g.fillRect(X + 40, Y + 141, 12, 6);
  g.restore();
  // the banner
  g.fillStyle = '#c9a464'; poly(g, [[28, 166], [228, 166], [214, 190], [42, 190]], X, Y, 1); g.fill();
  text(g, 'MERIDIAN', X + 128, Y + 179, 19, '#1e2634', { shadow: false });
  text(g, 'RV-07', X + 128, Y + 210, 13, '#dfe3dc');
  g.save(); g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = '#c9a464'; poly(g, shield, X, Y, 1); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.5)'; poly(g, shield.map(([x, y]) => [x + (x < 128 ? 4 : -4), y + 4]), X, Y, 1); g.stroke(); g.restore();
}
function deptPatch(g: G, X: number, Y: number, band: number[], draw: (cx: number, cy: number) => void, label: string) {
  const cx = X + 64, cy = Y + 64, r = 58;
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip(); twill(g, X, Y, 128, 128, '#202a38', 1);
  g.fillStyle = rgb(band, 0.85); g.fillRect(X, cy + 22, 128, 40); g.restore();
  draw(cx, cy - 6);
  text(g, label, cx, cy + 36, 11, '#e8e4d8');
  merrowCircle(g, cx, cy, r, rgb(band.map((v) => v * 0.8)), 5);
}
function nameTape(g: G, id: CrewId) {
  const [x, y, w, h] = R['name:' + id], d = ROSTER[id];
  twill(g, x, y, w, h, '#2a3646', 1.2);
  g.fillStyle = rgb(d.dept_col); g.fillRect(x + 6, y + 6, 10, h - 12);
  const label = (d.callsign ?? d.short).toUpperCase();
  text(g, label, x + 136, y + h / 2 + 1, 24, '#e2e4dc', { maxW: w - 40 });
  merrowRect(g, x, y, w, h, '#151c26', 4);
}
function fabric(g: G, k: string, base: number[], o: { weave?: number; stain?: number; seam?: boolean; grain?: 'leather' | 'web' | 'towel' } = {}) {
  const [x, y, w, h] = R[k];
  g.fillStyle = rgb(base); g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (o.grain === 'leather') {
    for (let i = 0; i < 700; i++) { const px = x + h1(i, 1) * w, py = y + h1(i, 2) * h; g.fillStyle = h1(i, 3) < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,230,200,0.06)'; g.fillRect(px, py, 2 + h1(i, 4) * 3, 1); }
    for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.beginPath(); const py = y + h1(i, 5) * h; g.moveTo(x, py); g.bezierCurveTo(x + w * 0.3, py + 6, x + w * 0.6, py - 6, x + w, py + 2); g.stroke(); }
  } else if (o.grain === 'web') {
    for (let j = 0; j < h; j += 4) { g.fillStyle = j % 8 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)'; g.fillRect(x, y + j, w, 2); }
    for (let i = 0; i < w; i += 6) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x + i, y, 1, h); }
  } else if (o.grain === 'towel') {
    for (let i = 0; i < 1600; i++) { const px = x + h1(i, 7) * w, py = y + h1(i, 8) * h; g.fillStyle = h1(i, 9) < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'; g.fillRect(px, py, 1.5, 1.5); }
    for (const yy of [18, 24, 100, 106]) { g.fillStyle = 'rgba(70,90,120,0.5)'; g.fillRect(x, y + yy, w, 3); }
  } else {
    const wv = o.weave ?? 1;
    for (let j = 0; j < h; j += 2) for (let i = (j / 2) % 2; i < w; i += 2) { g.fillStyle = `rgba(0,0,0,${0.06 * wv})`; g.fillRect(x + i, y + j, 1, 1); }
    for (let j = 1; j < h; j += 2) { g.fillStyle = `rgba(255,255,255,${0.035 * wv})`; g.fillRect(x, y + j, w, 1); }
    // slub threads: a few thicker strands, placed
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, y + h1(i, 11) * h, w, 1); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + h1(i, 12) * w, y, 1, h); }
  }
  if (o.stain) for (let i = 0; i < 5; i++) { const px = x + h1(i, 13) * w, py = y + h1(i, 14) * h, rr = 6 + h1(i, 15) * 14; const gr = g.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, `rgba(70,50,30,${0.16 * o.stain})`); gr.addColorStop(1, 'rgba(70,50,30,0)'); g.fillStyle = gr; g.fillRect(px - rr, py - rr, rr * 2, rr * 2); }
  if (o.seam) stitch(g, () => { g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + w, y + 6); g.moveTo(x, y + h - 6); g.lineTo(x + w, y + h - 6); }, 'rgba(230,220,190,0.55)', 1.2, 4);
  g.restore();
}
function screen(g: G, k: string, draw: (x: number, y: number, w: number, h: number) => void, bg = '#06140e') {
  const [x, y, w, h] = R[k];
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); draw(x, y, w, h);
  g.fillStyle = 'rgba(0,0,0,0.22)'; for (let j = 0; j < h; j += 2) g.fillRect(x, y + j, w, 1);
  const gr = g.createRadialGradient(x + w / 2, y + h / 2, h * 0.2, x + w / 2, y + h / 2, w * 0.7); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.restore();
  glowRegion(g, x, y, w, h);
}
/** mark a region as emissive for pageMaterial (alpha 0.88) */
function glowRegion(g: G, x: number, y: number, w: number, h: number) {
  const d = g.getImageData(x, y, w, h); for (let i = 3; i < d.data.length; i += 4) d.data[i] = 224; g.putImageData(d, x, y);
}
const PH = '#8fe0b0', PH2 = '#4a9a74', AMB = '#e2b45a';

function paintAll(g: G) {
  g.clearRect(0, 0, CW, CW);
  patchUNAA(g, ...(R.unaa.slice(0, 2) as [number, number]));
  patchAustral(g, ...(R.austral.slice(0, 2) as [number, number]));
  const icon = (k: string) => R[k];
  deptPatch(g, icon('med')[0], icon('med')[1], [176, 72, 64], (cx, cy) => {
    satin(g, () => { g.beginPath(); g.rect(cx - 8, cy - 26, 16, 52); g.rect(cx - 26, cy - 8, 52, 16); }, '#e8e4d8', cx - 26, cy - 26, 52, 52);
    g.strokeStyle = '#b8482e'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 20; i++) { const t = i / 20; g.lineTo(cx + Math.sin(t * Math.PI * 3) * 9, cy - 30 + t * 56); } g.stroke();
  }, 'MEDICAL');
  deptPatch(g, icon('eng')[0], icon('eng')[1], [204, 112, 48], (cx, cy) => {
    satin(g, () => { g.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, rr = i % 2 ? 22 : 28; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.moveTo(cx + 10, cy); g.arc(cx, cy, 10, 0, Math.PI * 2, true); }, '#e8e4d8', cx - 28, cy - 28, 56, 56);
    g.save(); g.translate(cx, cy); g.rotate(-0.7); satin(g, () => { g.beginPath(); g.rect(-4, -34, 8, 50); g.arc(0, -36, 9, 0, Math.PI * 2); }, '#d9a43a', -10, -46, 20, 64); g.restore();
  }, 'ENGINEERING');
  deptPatch(g, icon('sci')[0], icon('sci')[1], [70, 128, 168], (cx, cy) => {
    g.lineWidth = 3; g.strokeStyle = '#e8e4d8';
    for (const a of [0, 1.05, 2.1]) { g.beginPath(); g.ellipse(cx, cy, 30, 10, a, 0, Math.PI * 2); g.stroke(); }
    satin(g, () => { g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); }, '#d9a43a', cx - 7, cy - 7, 14, 14);
  }, 'SCIENCE');
  deptPatch(g, icon('sec')[0], icon('sec')[1], [120, 120, 136], (cx, cy) => {
    satin(g, () => poly(g, [[0, -30], [26, -20], [24, 8], [0, 30], [-24, 8], [-26, -20]], cx, cy, 1), '#c8ccd0', cx - 26, cy - 30, 52, 60);
    satin(g, () => poly(g, [[0, -18], [5, -5], [18, -4], [8, 4], [11, 17], [0, 10], [-11, 17], [-8, 4], [-18, -4], [-5, -5]], cx, cy, 1), '#2a3442', cx - 18, cy - 18, 36, 36);
  }, 'SECURITY');
  deptPatch(g, icon('sup')[0], icon('sup')[1], [150, 128, 96], (cx, cy) => {
    satin(g, () => { g.beginPath(); g.rect(cx - 24, cy - 14, 48, 34); }, '#b89a6a', cx - 24, cy - 14, 48, 34);
    g.strokeStyle = '#3a2e22'; g.lineWidth = 2; g.strokeRect(cx - 24, cy - 14, 48, 34); g.beginPath(); g.moveTo(cx - 24, cy - 2); g.lineTo(cx + 24, cy - 2); g.stroke();
    satin(g, () => { g.beginPath(); g.rect(cx - 6, cy - 22, 12, 12); }, '#e8e4d8', cx - 6, cy - 22, 12, 12);
  }, 'SUPPLY');
  // flight patches: pilot wings, the "Sparrow" squadron bird, a mission patch
  { const [x, y] = icon('wings'); twill(g, x, y, 128, 128, '#3a3020', 0.8);
    satin(g, () => { g.beginPath(); g.moveTo(x + 64, y + 52); for (let i = 0; i < 6; i++) { g.lineTo(x + 60 - i * 9, y + 48 + i * 3); g.lineTo(x + 58 - i * 9, y + 60 + i * 2); } g.lineTo(x + 64, y + 72); for (let i = 5; i >= 0; i--) { g.lineTo(x + 70 + i * 9, y + 60 + i * 2); g.lineTo(x + 68 + i * 9, y + 48 + i * 3); } g.closePath(); }, '#c9a464', x + 8, y + 40, 112, 40, 0.1);
    satin(g, () => { g.beginPath(); g.arc(x + 64, y + 60, 12, 0, Math.PI * 2); }, '#2a3a50', x + 52, y + 48, 24, 24);
    text(g, 'PILOT', x + 64, y + 96, 13, '#e8e0c8'); merrowRect(g, x + 2, y + 24, 124, 86, '#6a5430', 4); }
  { const [x, y] = icon('sparrow'), cx = x + 64, cy = y + 64; g.save(); g.beginPath(); g.arc(cx, cy, 58, 0, Math.PI * 2); g.clip(); twill(g, x, y, 128, 128, '#7a3a26', 1); g.restore();
    satin(g, () => poly(g, [[-30, 6], [-8, -4], [6, -20], [10, -6], [32, -10], [12, 6], [20, 22], [2, 10], [-14, 20], [-6, 8]], cx, cy, 1.2), '#e8dcc0', cx - 40, cy - 30, 80, 60);
    text(g, 'SPARROW', cx, cy + 40, 12, '#f0e4c8'); merrowCircle(g, cx, cy, 58, '#3a1a12', 5); }
  { const [x, y] = icon('fl3'), cx = x + 64, cy = y + 64; g.save(); poly(g, [[64, 6], [122, 64], [64, 122], [6, 64]], x, y, 1); g.clip(); twill(g, x, y, 128, 128, '#1e2c3e', 1); g.restore();
    satin(g, () => { g.beginPath(); g.arc(cx, cy + 6, 22, 0, Math.PI * 2); }, '#5a8aa0', cx - 22, cy - 16, 44, 44);
    g.strokeStyle = '#d9a43a'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy + 6, 36, 10, -0.3, 0, Math.PI * 2); g.stroke();
    text(g, 'FIRST', cx, cy - 32, 10, '#e8e4d8'); text(g, 'LANDING', cx, cy + 40, 9, '#e8e4d8');
    g.save(); g.lineWidth = 5; g.strokeStyle = '#d9a43a'; poly(g, [[64, 6], [122, 64], [64, 122], [6, 64]], x, y, 1); g.stroke(); g.restore(); }
  for (const id of CREW_IDS) nameTape(g, id);
  // rank boards: navy with gold bars (captain four, lieutenant two)
  const board = (k: string, bars: number) => { const [x, y, w, h] = R[k]; twill(g, x, y, w, h, '#1c2534', 1); for (let i = 0; i < bars; i++) { g.fillStyle = '#c9a464'; g.fillRect(x + 20 + i * 22, y + 6, 12, h - 12); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + 20 + i * 22, y + 6, 12, 2); } g.fillStyle = '#c9a464'; g.beginPath(); g.arc(x + w - 14, y + h / 2, 6, 0, Math.PI * 2); g.fill(); };
  board('rank', 4); board('rank2', 2);
  { const [x, y, w, h] = R.cmd; twill(g, x, y, w, h, '#1c2534', 1); text(g, 'COMMAND', x + w / 2, y + h / 2, 14, '#c9a464'); merrowRect(g, x, y, w, h, '#c9a464', 3); }
  { const [x, y] = R.capb; patchMini(g, x + 32, y + 32, 28); }
  { const [x, y, w, h] = R.flag; // the program flag: navy, the white meridian band, the amber star
    g.fillStyle = '#26344a'; g.fillRect(x, y, w, h); g.fillStyle = '#dfe3dc'; g.fillRect(x + w * 0.42, y, w * 0.16, h); g.fillStyle = '#d9a43a'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI * 2, rr = i % 2 ? 4 : 12; g.lineTo(x + w / 2 + Math.cos(a) * rr, y + h / 2 + Math.sin(a) * rr); } g.fill(); }
  { const [x, y, w, h] = R.id; g.fillStyle = '#e6e8e2'; g.fillRect(x, y, w, h); g.fillStyle = '#26344a'; g.fillRect(x, y, w, 16); text(g, 'UNAA', x + w / 2, y + 8, 10, '#e6e8e2', { shadow: false }); g.fillStyle = '#9aa4ac'; g.fillRect(x + 8, y + 22, 28, 34); g.fillStyle = '#3a4048'; for (let i = 0; i < 4; i++) g.fillRect(x + 42, y + 24 + i * 8, 44 - i * 6, 3); }
  { const [x, y, w, h] = R.jar; // specimen jar glass: green liquid, a curled sprout
    const gr = g.createLinearGradient(x, y, x + w, y); gr.addColorStop(0, '#4a7a5a'); gr.addColorStop(0.3, '#8ac0a0'); gr.addColorStop(1, '#2a4a3a'); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.strokeStyle = '#d8e8b0'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 64, y + 120); g.bezierCurveTo(x + 50, y + 80, x + 90, y + 60, x + 64, y + 30); g.stroke();
    g.fillStyle = '#a8d070'; g.beginPath(); g.ellipse(x + 76, y + 46, 14, 7, -0.5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(x + 50, y + 70, 12, 6, 0.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 16, y, 8, h); g.fillStyle = '#e8e4d0'; g.fillRect(x + 20, y + 84, 88, 28); g.fillStyle = '#3a3a34'; for (let i = 0; i < 3; i++) g.fillRect(x + 26, y + 90 + i * 7, 60 - i * 12, 2); }
  { const [x, y, w, h] = R.label; g.fillStyle = '#e8e2cc'; g.fillRect(x, y, w, h); text(g, 'SEEDS · 300', x + w / 2, y + h / 2, 11, '#3a3020', { shadow: false }); }
  fabric(g, 'canvas', [176, 160, 122], { seam: true }); fabric(g, 'sage', [94, 112, 80], { seam: true }); fabric(g, 'nylon', [44, 48, 52], { grain: 'web' });
  fabric(g, 'leather', [104, 68, 40], { grain: 'leather' }); fabric(g, 'apron', [206, 196, 170], { stain: 1.4, seam: true }); fabric(g, 'orange', [200, 102, 46], { seam: true });
  fabric(g, 'web', [70, 76, 66], { grain: 'web' }); fabric(g, 'navy', [34, 44, 60], { seam: true }); fabric(g, 'towel', [220, 216, 204], { grain: 'towel' });
  { const [x, y, w, h] = R.ceramic; g.fillStyle = '#e4e2da'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 40; i++) g.fillRect(x + h1(i, 21) * w, y + h1(i, 22) * h, 3, 1); }
  { const [x, y, w, h] = R.glassG; const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#7ab89a'); gr.addColorStop(1, '#2a5a48'); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  { const [x, y, w, h] = R.leaf; g.fillStyle = '#4a7a3a'; g.fillRect(x, y, w, h); g.strokeStyle = '#8ab860'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x + w / 2, y + h); g.lineTo(x + h1(i, 31) * w, y); g.stroke(); } }
  // screens
  screen(g, 'tablet', (x, y, w, h) => {
    // UNIT 07 schematic: a sphere with its eye, dimension lines, readouts
    g.strokeStyle = PH; g.lineWidth = 2; g.beginPath(); g.arc(x + 70, y + 82, 42, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(x + 70, y + 82, 42, 12, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = AMB; g.beginPath(); g.arc(x + 82, y + 76, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = PH2; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 22, y + 140); g.lineTo(x + 118, y + 140); g.moveTo(x + 22, y + 134); g.lineTo(x + 22, y + 146); g.moveTo(x + 118, y + 134); g.lineTo(x + 118, y + 146); g.stroke();
    text(g, 'UNIT 07', x + 190, y + 22, 18, PH, { font: "'VT', monospace", shadow: false });
    for (let i = 0; i < 6; i++) { g.fillStyle = PH2; g.fillRect(x + 140, y + 44 + i * 16, 60 + h1(i, 41) * 40, 6); }
    g.fillStyle = AMB; g.fillRect(x + 140, y + 140, 30, 8);
  });
  screen(g, 'scan', (x, y, w, h) => { g.strokeStyle = '#e07060'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= w; i += 2) { const t = i % 40; g.lineTo(x + i, y + h / 2 - (t > 18 && t < 22 ? (t - 18) * 9 * (t < 20 ? 1 : -1) : 0)); } g.stroke(); text(g, '72', x + w - 20, y + 14, 14, '#e8a060', { font: "'VT', monospace", shadow: false }); });
  screen(g, 'radio', (x, y, w, h) => { text(g, 'CH 07', x + 40, y + h / 2, 16, AMB, { font: "'VT', monospace", shadow: false }); for (let i = 0; i < 5; i++) { g.fillStyle = i < 3 ? PH : PH2; g.fillRect(x + 80 + i * 8, y + h - 14 - i * 6, 5, 8 + i * 6); } }, '#140e06');
  screen(g, 'wrist', (x, y, w, h) => { text(g, '98%', x + 36, y + h / 2, 18, PH, { font: "'VT', monospace", shadow: false }); g.strokeStyle = PH2; g.beginPath(); for (let i = 0; i < 50; i++) g.lineTo(x + 70 + i, y + h / 2 + Math.sin(i * 0.6) * 8); g.stroke(); });
  { const [x, y, w, h] = R.chrono; g.fillStyle = '#d8d2bc'; g.fillRect(x, y, w, h); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillStyle = '#2a2420'; g.fillRect(x + h / 2 + Math.cos(a) * 26 - 1, y + h / 2 + Math.sin(a) * 26 - 1, 3, 3); } g.strokeStyle = '#2a2420'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + h / 2, y + h / 2); g.lineTo(x + h / 2 + 14, y + h / 2 - 12); g.stroke(); }
  // a page of notes: blue-lined paper, a margin, handwriting in graphite, a doodle of UNIT 07
  { const [x, y, w, h] = R.memo; g.fillStyle = '#e8e4d6'; g.fillRect(x, y, w, h);
    for (let j = 24; j < h; j += 14) { g.fillStyle = 'rgba(90,120,160,0.35)'; g.fillRect(x, y + j, w, 1); }
    g.fillStyle = 'rgba(180,60,50,0.45)'; g.fillRect(x + 26, y, 1.5, h);
    g.strokeStyle = 'rgba(50,48,44,0.8)'; g.lineWidth = 1.3;
    for (let j = 0; j < 12; j++) { g.beginPath(); let px = x + 32; const py = y + 22 + j * 14; g.moveTo(px, py); const len = 120 + h1(j, 61) * 90; while (px < x + 32 + len) { px += 4 + h1(px, j) * 5; g.lineTo(px, py - (h1(px, j + 3) < 0.5 ? 3 : 0)); } g.stroke(); }
    g.beginPath(); g.arc(x + w - 46, y + h - 50, 22, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x + w - 40, y + h - 54, 7, 0, Math.PI * 2); g.stroke();
    text(g, 'U-07 v7.0', x + w - 50, y + h - 16, 11, 'rgba(50,48,44,0.85)', { font: "'VT', monospace", shadow: false }); }
  // the pod part crates' stencil plates
  ['POD FRAME', 'HULL PLATING', 'GLAZING + SHIELD', 'LEGS + LIGHTS'].forEach((t, i) => {
    const [x, y, w, h] = R['part' + i];
    g.fillStyle = '#d9a43a'; g.fillRect(x, y, w, h); g.fillStyle = '#1e2228'; for (let k = 0; k < w; k += 16) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + 8, y); g.lineTo(x + k, y + 8); g.closePath(); g.fill(); }
    g.fillStyle = '#e8e4d8'; g.fillRect(x + 4, y + 10, w - 8, h - 14);
    text(g, t, x + w / 2, y + 29, t.length > 12 ? 11 : 14, '#1e2228', { shadow: false, maxW: w - 12 });
    text(g, 'PART ' + (i + 1) + '/4', x + w - 26, y + 15, 7, '#6a5a3a', { shadow: false });
  });
  paintPlaqueBase(g);
}
function patchMini(g: G, cx: number, cy: number, r: number) {
  g.fillStyle = '#c9a464'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1e2838'; g.beginPath(); g.arc(cx, cy, r - 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#dfe3dc'; poly(g, AMERICAS, cx - r * 0.42, cy - r * 0.62, r * 0.009, r * 0.0095); g.fill();
  g.fillStyle = '#d9a43a'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI * 2, rr = i % 2 ? r * 0.08 : r * 0.28; g.lineTo(cx + r * 0.25 + Math.cos(a) * rr, cy + r * 0.3 + Math.sin(a) * rr); } g.fill();
}
/** the memorial plaque's brushed bronze; names are engraved later (paintPlaque) */
function paintPlaqueBase(g: G) {
  const [x, y, w, h] = R.plaque;
  const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#9a7a44'); gr.addColorStop(0.5, '#7a5c30'); gr.addColorStop(1, '#5a4222'); g.fillStyle = gr; g.fillRect(x, y, w, h);
  for (let j = 0; j < h; j += 1) { g.fillStyle = `rgba(255,230,180,${0.03 + h1(j, 51) * 0.05})`; g.fillRect(x, y + j, w, 1); }
  g.strokeStyle = '#c8a868'; g.lineWidth = 4; g.strokeRect(x + 8, y + 8, w - 16, h - 16); g.strokeStyle = '#3a2a14'; g.lineWidth = 1; g.strokeRect(x + 12, y + 12, w - 24, h - 24);
  patchMini(g, x + 48, y + 48, 26);
  engrave(g, 'IN MEMORY', x + w / 2 + 20, y + 38, 22);
  engrave(g, SHIP_TAG, x + w / 2 + 20, y + 66, 12);
}
const SHIP_TAG = 'UNAA MERIDIAN · RV-07';
function engrave(g: G, s: string, x: number, y: number, size: number, font = "'Superwide', 'Jersey', sans-serif") {
  g.save(); g.font = `${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,240,200,0.45)'; g.fillText(s, x + 1, y + 1); g.fillStyle = '#2a1c0c'; g.fillText(s, x, y); g.restore();
}

// ------------------------------------------------------------------ the page
let canvas: HTMLCanvasElement | null = null, ctx: G | null = null, tex: THREE.CanvasTexture | null = null;
export function crewPage(): { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } {
  if (!canvas) {
    canvas = document.createElement('canvas'); canvas.width = canvas.height = CW;
    ctx = canvas.getContext('2d')!;
    paintAll(ctx);
    tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    // the faces are web fonts: paint again once they are in
    document.fonts?.ready.then(() => { paintAll(ctx!); if (plaqueNames.length) paintPlaque(plaqueNames); tex!.needsUpdate = true; });
  }
  return { canvas, tex: tex! };
}
let plaqueNames: { name: string; role: string; how: string; day: number }[] = [];
/** engrave the memorial plaque with the fallen (re-paints its region) */
export function paintPlaque(names: { name: string; role: string; how: string; day: number }[]) {
  plaqueNames = names;
  const { tex: t } = crewPage(); const g = ctx!;
  paintPlaqueBase(g);
  const [x, y, w] = R.plaque;
  names.slice(0, 4).forEach((n, i) => {
    engrave(g, n.name.toUpperCase(), x + w / 2 + 20, y + 106 + i * 30, 15);
    engrave(g, `${n.role} · DAY ${n.day}`, x + w / 2 + 20, y + 120 + i * 30, 9, "'VT', monospace");
  });
  t.needsUpdate = true;
}

// ------------------------------------------------------------------ materials
const UNAA_LIVERY = livery('exp', { a: 'slate', b: 'paper', glow: 'glowAmber', cable: 'ochre', rock: 'stone', wear: 1, serials: ['UNAA', 'MERIDIAN RV-07', 'UNIT 07', 'UNAA 2071'] });
let mats: THREE.Material[] | null = null;
/** [0] the UNAA livery kit atlas (hardware), [1] the crew page (patches, fabric, screens) */
export function crewMats(): THREE.Material[] {
  if (mats) return mats;
  const at: Atlas = atlasFor(UNAA_LIVERY);
  const page = crewPage();
  mats = [kitMaterial(at, kitUniforms()), pageMaterial(page.tex)];
  return mats;
}
/** the kit's region-tiling Lambert for the crew page: cut-out decals (alpha < 0.5 discarded), screens glow (alpha 0.5..0.97) */
export function pageMaterial(map: THREE.Texture, glowK = 1): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowK = { value: glowK };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 reg;\nvarying vec4 vReg;\nvarying vec2 vUvT;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUvT = uv; vReg = abs(reg);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlowK;\nvarying vec4 vReg;\nvarying vec2 vUvT;')
      .replace('#include <map_fragment>', `vec2 kuv = vReg.xy + fract(vUvT) * vReg.zw;
vec4 sampledDiffuseColor = textureGrad(map, kuv, dFdx(vUvT) * vReg.zw, dFdy(vUvT) * vReg.zw);
if (sampledDiffuseColor.a < 0.5) discard;
float glowA = sampledDiffuseColor.a; vec3 glowC = sampledDiffuseColor.rgb;
diffuseColor.rgb *= sampledDiffuseColor.rgb; diffuseColor.a = 1.0;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA < 0.97) totalEmissiveRadiance += glowC * uGlowK * 0.9;');
  };
  m.customProgramCacheKey = () => 'crew-page-v1';
  gbuf(m, 1);
  return m;
}
export function unaaAtlas() { return atlasFor(UNAA_LIVERY); }
export { hex };

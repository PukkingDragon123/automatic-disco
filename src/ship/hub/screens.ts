// Live readouts for the ship's screens: small canvases redrawn a few times a second (phosphor on glass, the
// green machine look), each telling the truth about its room: helm telemetry, a radar sweep, a turning gene
// helix, the medbay's heart traces, the reactor's flux, Unit 07's voiceprint, stores, the galley's timer.
import * as THREE from 'three';
import { canvas, rgb, rgba } from './tex';

export type ScreenKind = 'telemetry' | 'radar' | 'dna' | 'ekg' | 'reactor' | 'wave' | 'stores' | 'crew' | 'nav' | 'eye' | 'galley' | 'scan' | 'power' | 'galaxy' | 'pod' | 'bars';
const PH = { bg: 0x07110c, dim: 0x1d4a2c, mid: 0x3f8f58, hi: 0x8fe0a0, hot: 0xd4ffd8, amber: 0xe0a040, red: 0xe0503a, cyan: 0x6ad0d8 };

interface Live { kind: ScreenKind; c: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; seed: number; hz: number; acc: number; w: number; h: number; hist: number[]; tint: number }

export class Screens {
  private list: Live[] = [];
  /** the whole bank refreshes at most this often (a fraction of them per frame) */
  private cursor = 0;
  make(kind: ScreenKind, w = 256, h = 160, seed = 1, tint = PH.hi): THREE.CanvasTexture {
    const [c, g] = canvas(w, h);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const l: Live = { kind, c, g, tex, seed, hz: kind === 'radar' || kind === 'ekg' || kind === 'wave' ? 12 : 4, acc: 99, w, h, hist: [], tint };
    this.list.push(l); draw(l, 0);
    return tex;
  }
  update(dt: number, t: number, budget = 6) {
    for (const l of this.list) l.acc += dt;
    // refresh a few per frame, round robin, each no faster than its rate
    const n = this.list.length; let done = 0;
    for (let k = 0; k < n && done < budget; k++) {
      const l = this.list[(this.cursor + k) % n];
      if (l.acc >= 1 / l.hz) { l.acc = 0; draw(l, t); l.tex.needsUpdate = true; done++; }
    }
    this.cursor = (this.cursor + Math.max(1, done)) % Math.max(1, n);
  }
  dispose() { for (const l of this.list) l.tex.dispose(); this.list = []; }
}

const h1 = (i: number, s: number) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

function frame(l: Live) {
  const { g, w, h } = l;
  g.fillStyle = rgb(PH.bg); g.fillRect(0, 0, w, h);
  // a faint grid
  g.fillStyle = rgba(PH.dim, 0.35);
  for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 1);
}
function finish(l: Live) {
  const { g, w, h } = l;
  // scanlines and a soft vignette
  g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
}
function txt(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: number, align: CanvasTextAlign = 'left') {
  g.font = `${size <= 16 ? 11 : size <= 30 ? 22 : 44}px Body`; g.textAlign = align; g.fillStyle = rgb(col); g.fillText(s, x, y);
}

function draw(l: Live, t: number) {
  const { g, w, h, seed, kind } = l;
  frame(l);
  const T = l.tint;
  if (kind === 'telemetry' || kind === 'nav') {
    txt(g, kind === 'nav' ? 'NAV  SOLUTION' : 'HELM  TELEMETRY', 8, 18, 15, T);
    const rows = kind === 'nav' ? ['HDG', 'PITCH', 'ROLL', 'DV', 'ETA'] : ['VEL', 'ALT', 'THR', 'RCS', 'O2'];
    rows.forEach((r, i) => {
      const v = kind === 'nav' ? [(t * 3 + seed * 40) % 360, Math.sin(t * 0.3 + seed) * 4, Math.cos(t * 0.21) * 2, 412 + Math.sin(t) * 3, 3600 - t % 3600][i] : [7.42 + Math.sin(t * 0.7) * 0.01, 412 + Math.sin(t * 0.13) * 0.4, 12 + Math.sin(t * 1.3) * 2, 98, 20.9][i];
      txt(g, r, 8, 42 + i * 22, 14, PH.mid); txt(g, v.toFixed(i === 3 ? 0 : 2), w * 0.55, 42 + i * 22, 14, T, 'right');
      const bw = (w * 0.38) * ((Math.sin(t * 0.8 + i * 1.7 + seed) + 1) * 0.35 + 0.25);
      g.fillStyle = rgba(T, 0.25); g.fillRect(w * 0.58, 32 + i * 22, w * 0.38, 12); g.fillStyle = rgb(i === 4 && kind !== 'nav' ? PH.cyan : T); g.fillRect(w * 0.58, 32 + i * 22, bw, 12);
    });
    if (Math.floor(t * 2) % 2) txt(g, '_', 8, h - 8, 14, T);
  } else if (kind === 'radar') {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44;
    g.strokeStyle = rgba(T, 0.35); g.lineWidth = 1;
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx, cy, R * k / 3, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    const a = t * 1.6 + seed;
    for (let k = 0; k < 24; k++) { g.strokeStyle = rgba(T, 0.5 * (1 - k / 24)); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - k * 0.03) * R, cy + Math.sin(a - k * 0.03) * R); g.stroke(); }
    for (let i = 0; i < 6; i++) { const ba = h1(i, seed) * 6.28, br = (0.2 + h1(i, seed + 1) * 0.75) * R; const age = ((a - ba) % 6.283 + 6.283) % 6.283; g.fillStyle = rgba(i === 2 ? PH.amber : T, Math.max(0, 1 - age / 4)); g.fillRect(cx + Math.cos(ba) * br - 2, cy + Math.sin(ba) * br - 2, 4, 4); }
    txt(g, 'CONTACTS 6', 6, 14, 12, T);
  } else if (kind === 'dna') {
    txt(g, 'SEQUENCER', 8, 16, 14, T);
    for (let y = 26; y < h - 6; y += 5) {
      const ph = y * 0.08 + t * 1.5 + seed, x1 = w * 0.3 + Math.sin(ph) * w * 0.14, x2 = w * 0.3 - Math.sin(ph) * w * 0.14;
      const front = Math.cos(ph) > 0;
      g.fillStyle = rgba([PH.red, PH.amber, PH.cyan, T][(y / 5 | 0) % 4], 0.6); g.fillRect(Math.min(x1, x2), y, Math.abs(x1 - x2), 2);
      g.fillStyle = rgb(front ? PH.hot : PH.mid); g.fillRect(x1 - 2, y - 1, 4, 4); g.fillStyle = rgb(front ? PH.mid : PH.hot); g.fillRect(x2 - 2, y - 1, 4, 4);
    }
    const bases = 'ACGT';
    for (let i = 0; i < 7; i++) { let s = ''; for (let k = 0; k < 10; k++) s += bases[Math.floor(h1(i * 10 + k + Math.floor(t * 3), seed) * 4)]; txt(g, s, w * 0.56, 40 + i * 16, 12, i === 3 ? PH.amber : PH.mid); }
  } else if (kind === 'ekg') {
    txt(g, 'BED ' + (seed % 2 ? 'A' : 'B'), 8, 16, 14, T); txt(g, `HR ${Math.round(64 + Math.sin(t * 0.2 + seed) * 6)}`, w - 8, 16, 14, PH.hot, 'right');
    g.strokeStyle = rgb(T); g.lineWidth = 2; g.beginPath();
    for (let x = 0; x < w; x++) {
      const u = (x / w * 3 + t * 1.2 + seed * 0.3) % 1;
      const y = u > 0.42 && u < 0.46 ? -1 : u > 0.46 && u < 0.5 ? 0.9 : u > 0.5 && u < 0.53 ? -0.25 : u > 0.62 && u < 0.72 ? -0.18 * Math.sin((u - 0.62) * 31) : 0;
      const Y = h * 0.55 + y * h * 0.3; if (x === 0) g.moveTo(x, Y); else g.lineTo(x, Y);
    }
    g.stroke();
    g.strokeStyle = rgb(PH.cyan); g.lineWidth = 1; g.beginPath();
    for (let x = 0; x < w; x++) { const Y = h * 0.86 + Math.sin(x * 0.08 + t * 2) * 6; if (x === 0) g.moveTo(x, Y); else g.lineTo(x, Y); }
    g.stroke(); txt(g, 'SPO2 98', 8, h - 22, 12, PH.cyan);
  } else if (kind === 'reactor' || kind === 'power') {
    txt(g, kind === 'reactor' ? 'CORE FLUX' : 'POWER BUS', 8, 16, 14, T);
    if (l.hist.length === 0) for (let i = 0; i < 60; i++) l.hist.push(0.6);
    l.hist.push(0.62 + Math.sin(t * 0.9 + seed) * 0.08 + (h1(Math.floor(t * 4), seed) - 0.5) * 0.08); if (l.hist.length > 60) l.hist.shift();
    g.strokeStyle = rgb(kind === 'reactor' ? PH.amber : T); g.lineWidth = 2; g.beginPath();
    l.hist.forEach((v, i) => { const x = 8 + (i / 59) * (w - 16), y = h - 18 - v * (h - 44); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }); g.stroke();
    g.fillStyle = rgba(PH.red, 0.5); g.fillRect(8, h - 18 - 0.85 * (h - 44), w - 16, 1);
    txt(g, `${(l.hist[l.hist.length - 1] * 1000).toFixed(0)} MW`, w - 8, 16, 14, PH.hot, 'right');
  } else if (kind === 'wave' || kind === 'eye') {
    if (kind === 'eye') {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.32, blink = (t * 0.25 + seed) % 1 < 0.04 ? 0.15 : 1;
      g.strokeStyle = rgb(T); g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R * 1.25, 0, 7); g.stroke();
      g.fillStyle = rgb(T); g.beginPath(); g.ellipse(cx + Math.sin(t * 0.7) * 6, cy, R * 0.55, R * 0.55 * blink, 0, 0, 7); g.fill();
      g.fillStyle = rgb(PH.hot); g.fillRect(cx - 4 + Math.sin(t * 0.7) * 6, cy - 4, 6, 6 * blink);
      txt(g, 'UNIT 07', cx, h - 10, 14, T, 'center');
    } else {
      txt(g, 'VOICE  UNIT 07', 8, 16, 14, T);
      g.fillStyle = rgb(T);
      for (let i = 0; i < 48; i++) { const a = Math.abs(Math.sin(i * 0.6 + t * 6) * Math.sin(i * 0.17 + t * 1.3)) * (h * 0.32); g.fillRect(8 + i * ((w - 16) / 48), h / 2 - a, (w - 16) / 48 - 2, a * 2); }
    }
  } else if (kind === 'stores' || kind === 'crew') {
    txt(g, kind === 'stores' ? 'STORES  MANIFEST' : 'CREW  ROSTER', 8, 16, 14, T);
    const rows = kind === 'stores' ? ['HULL PATCH KIT   12', 'RATIONS  (DAYS) 214', 'SEED VAULT  A-K  OK', 'SPECIMEN CRATES   8', 'POD PARTS       ---', 'COOLANT   (L)  880'] : ['VASQUEZ    LEAD SCI', 'OKONKWO    CAPTAIN', 'PARK       MECHANIC', 'HALVORSEN  ENGINEER', 'DIALLO     DOCTOR', 'REYES      PILOT', 'NAKAMURA   BIOLOGIST', 'BRANDT     COOK'];
    rows.forEach((s, i) => txt(g, s, 8, 36 + i * (kind === 'stores' ? 20 : 15), kind === 'stores' ? 13 : 12, i === Math.floor(t * 0.5) % rows.length ? PH.hot : PH.mid));
  } else if (kind === 'galley') {
    txt(g, 'OVEN 2', 8, 18, 14, T);
    const left = Math.max(0, 900 - (t % 900)); txt(g, `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, w / 2, h / 2 + 14, 40, PH.amber, 'center');
    txt(g, '180 C', w / 2, h - 12, 14, T, 'center');
  } else if (kind === 'galaxy') {
    // the main monitor's idle loop: the KEPLER-442 system map, orbits, five worlds, the sweep and a data column
    const cx = w * 0.42, cy = h * 0.55;
    g.fillStyle = rgba(T, 0.08); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = rgba(T, 0.15 + h1(i, 3) * 0.4); g.fillRect(h1(i, 1) * w, h1(i, 2) * h, 2, 2); }
    g.fillStyle = rgb(PH.amber); g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill();
    g.strokeStyle = rgba(PH.amber, 0.5); g.beginPath(); g.arc(cx, cy, 12, 0, 7); g.stroke();
    for (let k = 0; k < 5; k++) {
      const rx = 34 + k * 30, ry = rx * 0.42, a = t * 0.12 / (1 + k * 0.4) + k * 1.7;
      g.strokeStyle = rgba(T, 0.45); g.lineWidth = 1.5; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.stroke();
      const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
      g.fillStyle = rgb(k === 1 ? PH.hot : T); g.beginPath(); g.arc(px, py, 4 + (k % 3), 0, 7); g.fill();
      g.strokeStyle = rgb(k === 1 ? PH.hot : PH.mid); g.lineWidth = 1; g.beginPath(); g.moveTo(px + 6, py - 6); g.lineTo(px + 18, py - 18); g.lineTo(px + 60, py - 18); g.stroke();
      txt(g, ['VESS', 'KAROS', 'ULDIR', 'MARRO', 'ITHE'][k] + (k === 1 ? '  REC' : ''), px + 20, py - 22, 13, k === 1 ? PH.hot : PH.mid);
    }
    const sa = t * 0.6;
    for (let k = 0; k < 18; k++) { g.strokeStyle = rgba(PH.hot, 0.35 * (1 - k / 18)); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sa - k * 0.025) * w, cy + Math.sin(sa - k * 0.025) * w * 0.42); g.stroke(); }
    txt(g, 'MAIN MONITOR  ·  KEPLER-442', 14, 24, 20, T);
    txt(g, 'LONG RANGE SCAN READY', 14, h - 14, 16, Math.floor(t * 1.5) % 2 ? PH.hot : T);
    const col = w * 0.8;
    g.fillStyle = rgba(T, 0.25); g.fillRect(col - 10, 34, 1, h - 60);
    ['WORLDS    5', 'ORBIT  412 KM', 'DELTA-V   OK', 'POD     READY', 'CREW      8/8'].forEach((r, i) => txt(g, r, col, 56 + i * 24, 15, i === 3 ? PH.hot : T));
  } else if (kind === 'scan') {
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < 260; i++) {
      const arm = i % 2, r = Math.pow(h1(i, seed), 0.7) * Math.min(w, h) * 0.46, a = r * 0.025 + arm * Math.PI + h1(i, seed + 3) * 0.6 + t * 0.03;
      g.fillStyle = rgba(T, 0.25 + h1(i, seed + 5) * 0.6); g.fillRect(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 0.7, 2, 2);
    }
    const sa = t * 0.7;
    g.strokeStyle = rgba(PH.hot, 0.5); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sa) * w, cy + Math.sin(sa) * w * 0.5); g.stroke();
    txt(g, 'LONG RANGE SCAN', 10, 18, 16, T);
  } else if (kind === 'pod') {
    txt(g, 'POD  ASSEMBLY', 8, 16, 14, T);
    const steps = ['FRAME', 'PLATING', 'GLAZING', 'AVIONICS', 'LIMBS'];
    steps.forEach((s, i) => { txt(g, s, 8, 40 + i * 20, 13, PH.mid); g.fillStyle = rgba(T, 0.25); g.fillRect(w * 0.45, 30 + i * 20, w * 0.5, 10); g.fillStyle = rgb(T); g.fillRect(w * 0.45, 30 + i * 20, w * 0.5 * Math.min(1, Math.max(0, ((t * 0.05 + seed) % 1.4) * 5 - i)), 10); });
  } else {
    txt(g, 'SYSTEMS', 8, 16, 14, T);
    for (let i = 0; i < 8; i++) { const v = 0.4 + 0.5 * Math.abs(Math.sin(t * 0.4 + i * 0.9 + seed)); g.fillStyle = rgba(T, 0.2); g.fillRect(10 + i * ((w - 20) / 8), 26, (w - 20) / 8 - 4, h - 36); g.fillStyle = rgb(v > 0.85 ? PH.amber : T); g.fillRect(10 + i * ((w - 20) / 8), 26 + (h - 36) * (1 - v), (w - 20) / 8 - 4, (h - 36) * v); }
  }
  finish(l);
}

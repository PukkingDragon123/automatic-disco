// TOOL MODELS · QA SHEETS (src/tools/models/qa.html). Visual checks at 1920 x 1080:
//   ?view=lineup[&level=3&mode=active]      every tool working, drawn by the UI kit's renderer (outlined pixel art)
//   ?view=close&id=drill[&t=2.4]            one tool large mid-work, its components called out, idle / charging /
//                                           active at levels 1 / 2 / 3 beside it
//   ?view=icons                             the 2D icons (32, 64, 128 px; levels 1 and 3)
//   ?view=world&id=drill                    the 'world' lod (lit G-buffer materials) in a plain three.js scene
//   &t=seconds  runs the clock to that time first (a fixed step), &still  stops it there
import * as THREE from 'three';
import { renderModel, fitRoot } from '../../ui/kit/model3d';
import { installKitStyle } from '../../ui/kit/style';
import { plate, pxCanvas } from '../../ui/kit/mat';
import { Px, P, INK } from '../../ui/kit/px';
import { buildToolModel, TOOL_MODEL_IDS, toolModelName, toolIcon, TOOL_SPECS } from './index';
import type { ToolModel, ToolMode } from './model';

const Q = new URLSearchParams(location.search);
const view = Q.get('view') ?? 'lineup';
const app = document.getElementById('app')!;
installKitStyle();
const css = document.createElement('style');
css.textContent = `
body { width: 1920px; height: 1080px; }
.qa-bg { position: absolute; left: 0; top: 0; image-rendering: pixelated; }
.qa-abs { position: absolute; }
.qa-cv { position: absolute; image-rendering: pixelated; }
.qa-tag { position: absolute; padding: 6px 12px 8px; image-rendering: pixelated; background-size: 100% 100%; }
.qa-cap { position: absolute; color: #f2ead2; }
`;
document.head.append(css);
const ids = TOOL_MODEL_IDS.filter((i) => TOOL_SPECS[i]);

function backdrop() {
  const p = plate(960, 540, { mat: 'gun', seed: 77, screws: true, wear: 0.6, chamfer: 0, grime: 0.6 });
  // a faint pegboard of punched holes
  for (let y = 30; y < 520; y += 20) for (let x = 24 + ((y / 20) % 2) * 10; x < 940; x += 20) { p.set(x, y, INK); p.set(x + 1, y, INK); p.set(x, y + 1, INK); p.set(x + 1, y + 1, P.steel[1]); p.set(x + 2, y + 1, P.steel[3]); }
  const cv = pxCanvas(p, 2, 'qa-bg'); app.append(cv);
}
interface Live { cv: HTMLCanvasElement; c: CanvasRenderingContext2D; m: ToolModel; root: THREE.Group; w: number; h: number; yaw: number; pitch: number; zoom: number; mode: ToolMode; level: number; spin: number; cb?: () => void }
const lives: Live[] = [];
function live(id: string, x: number, y: number, w: number, h: number, o: { scale?: number; mode?: ToolMode; level?: number; yaw?: number; pitch?: number; zoom?: number; spin?: number; lod?: 'hud' | 'hero' | 'icon' } = {}): Live | null {
  const m = buildToolModel(id, { lod: o.lod ?? 'hero', level: o.level ?? 3 }); if (!m) return null;
  const root = fitRoot(m);
  const sc = o.scale ?? 2, cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.className = 'qa-cv';
  cv.style.left = x + 'px'; cv.style.top = y + 'px'; cv.style.width = w * sc + 'px'; cv.style.height = h * sc + 'px';
  app.append(cv);
  const L: Live = { cv, c: cv.getContext('2d')!, m, root, w, h, yaw: o.yaw ?? 0.55, pitch: o.pitch ?? 0.4, zoom: o.zoom ?? 1.55, mode: o.mode ?? 'active', level: o.level ?? 3, spin: o.spin ?? 0 };
  lives.push(L); return L;
}
function caption(text: string, x: number, y: number, size = 32, color?: string) {
  const d = document.createElement('div'); d.className = `qa-cap k7-t${size}`; d.textContent = text; d.style.left = x + 'px'; d.style.top = y + 'px'; if (color) d.style.color = color; app.append(d); return d;
}
function tag(text: string, x: number, y: number) {
  const d = document.createElement('div'); d.className = 'qa-tag k7-t16'; d.textContent = text; d.style.left = x + 'px'; d.style.top = y + 'px'; app.append(d);
  requestAnimationFrame(() => { const r = d.getBoundingClientRect(); const p = plate(Math.ceil(r.width / 2), Math.ceil(r.height / 2), { mat: 'enamel', seed: text.length * 7, chamfer: 2, screws: false, wear: 0.5 }); d.style.backgroundImage = `url(${p.url()})`; d.style.color = '#2a2418'; d.style.textShadow = 'none'; });
  return d;
}
let simT = 0;
function step(dt: number) {
  simT += dt;
  for (const L of lives) {
    L.m.update(dt, { mode: L.mode, level: L.level });
    if (L.spin) L.yaw += dt * L.spin;
  }
}
function draw() {
  for (const L of lives) { renderModel(L.root, L.c, L.w, L.h, { yaw: L.yaw, pitch: L.pitch, zoom: L.zoom, shadow: [3, 3, 0.35] }); L.cb?.(); }
}
function run() {
  const t0 = Number(Q.get('t') ?? 0);
  for (let t = 0; t < t0; t += 1 / 60) step(1 / 60);
  draw();
  if (Q.has('still')) { (window as unknown as { __qaReady: boolean }).__qaReady = true; return; }
  let last = performance.now();
  const loop = () => { const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  (window as unknown as { __qaReady: boolean }).__qaReady = true;
}

// ------------------------------------------------------------------ the views
if (view === 'lineup') {
  backdrop();
  caption('TOOL MODELS', 40, 22, 48);
  caption(`ALL TOOLS  ·  ${(Q.get('mode') ?? 'active').toUpperCase()}  ·  LEVEL ${Q.get('level') ?? 3}`, 470, 36, 16, '#c9bd98');
  const cols = 3, cw = 620, chh = 330;
  ids.forEach((id, i) => {
    const cx = 30 + (i % cols) * cw, cy = 92 + Math.floor(i / cols) * chh;
    live(id, cx, cy, 300, 148, { mode: (Q.get('mode') as ToolMode) ?? 'active', level: Number(Q.get('level') ?? 3), yaw: 0.5 + (i % 2) * 0.1 });
    caption(toolModelName(id).toUpperCase(), cx + 20, cy + 268, 32);
  });
  run();
} else if (view === 'close') {
  backdrop();
  const id = Q.get('id') ?? 'drill';
  caption(toolModelName(id).toUpperCase(), 40, 22, 48);
  caption('MID-WORK  ·  LEVEL 3  ·  COMPONENTS', 40, 80, 16, '#c9bd98');
  const big = live(id, 60, 120, 560, 470, { mode: (Q.get('mode') as ToolMode) ?? 'active', level: 3, yaw: Number(Q.get('yaw') ?? 0.55), pitch: Number(Q.get('pitch') ?? 0.38), zoom: Number(Q.get('zoom') ?? 1.45) })!;
  const states: [ToolMode, number][] = [['idle', 1], ['charging', 2], ['active', 3]];
  states.forEach(([mode, lvl], i) => {
    const y = 120 + i * 315;
    live(id, 1250, y, 300, 140, { mode, level: lvl, yaw: 0.6, pitch: 0.4, lod: 'hero' });
    caption(`${mode.toUpperCase()}  L${lvl}`, 1260, y + 262, 16, '#ffd98a');
  });
  // callouts: leader lines from each component to an enamel tag
  const ov = document.createElement('canvas'); ov.width = 1200; ov.height = 1000; ov.className = 'qa-cv'; ov.style.left = '0px'; ov.style.top = '0px'; ov.style.width = '1200px'; ov.style.height = '1000px'; app.append(ov);
  const oc = ov.getContext('2d')!; oc.imageSmoothingEnabled = false;
  const calls = big.m.callouts, tags: HTMLDivElement[] = [];
  calls.forEach((c, i) => { tags.push(tag(c.label, 0, 0)); void i; });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100), v = new THREE.Vector3();
  big.cb = () => {
    const R0 = big.root.userData.fitR as number, H0 = (big.root.userData.fitH as number) || R0, half = R0 / big.zoom, asp = big.w / big.h, dist = R0 * 4;
    cam.left = -half * Math.max(1, asp); cam.right = half * Math.max(1, asp); cam.top = half / Math.min(1, asp); cam.bottom = -half / Math.min(1, asp);
    cam.position.set(0, Math.sin(big.pitch) * dist, Math.cos(big.pitch) * dist); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    big.root.rotation.y = big.yaw; big.root.position.set(0, -H0 / 2, 0); big.root.updateMatrixWorld(true);
    const pts = calls.map((c) => { c.obj.getWorldPosition(v); v.project(cam); return { x: 60 + (v.x * 0.5 + 0.5) * big.w * 2, y: 120 + (1 - (v.y * 0.5 + 0.5)) * big.h * 2 }; });
    big.root.position.set(0, 0, 0); big.root.rotation.y = 0;
    oc.clearRect(0, 0, 1200, 1000);
    const mid = 120 + big.h, rows = [pts.map((p, i) => ({ p, i })).filter((e) => e.p.y < mid), pts.map((p, i) => ({ p, i })).filter((e) => e.p.y >= mid)];
    rows.forEach((row, ri) => {
      row.sort((A, B) => A.p.x - B.p.x);
      let xr = 60;
      const ty = ri === 0 ? 132 : 1000;
      for (const e of row) {
        const el = tags[e.i], w = el.offsetWidth || 120, x = Math.min(Math.max(xr, e.p.x - w / 2), 1180 - w);
        el.style.left = x + 'px'; el.style.top = ty + 'px'; xr = x + w + 14;
        const ex = x + w / 2, ey = ri === 0 ? ty + (el.offsetHeight || 30) : ty;
        for (const [lw, col] of [[4, '#08090c'], [2, '#ffc560']] as [number, string][]) { oc.strokeStyle = col; oc.lineWidth = lw; oc.beginPath(); oc.moveTo(Math.round(e.p.x), Math.round(e.p.y)); oc.lineTo(Math.round(ex), Math.round(ey)); oc.stroke(); }
        oc.fillStyle = '#08090c'; oc.fillRect(Math.round(e.p.x) - 5, Math.round(e.p.y) - 5, 10, 10); oc.fillStyle = '#ffc560'; oc.fillRect(Math.round(e.p.x) - 3, Math.round(e.p.y) - 3, 6, 6);
      }
    });
  };
  run();
} else if (view === 'icons') {
  backdrop();
  caption('TOOL ICONS', 40, 22, 48);
  caption('3/4 VIEW  ·  BLACK OUTLINE  ·  RIM LIGHT  ·  MASTER PALETTE  ·  ROWS: 128 L3 · 64 L3 (2X) · 64 L1 (2X) · 32 L1 · 32 L1 (4X)', 380, 36, 16, '#c9bd98');
  ids.forEach((id, i) => {
    const x = 40 + i * 206, y = 110;
    const add = (cv: HTMLCanvasElement | null, sc: number, yy: number) => { if (!cv) return; const c = cv.cloneNode() as HTMLCanvasElement; c.getContext('2d')!.drawImage(cv, 0, 0); c.className = 'qa-cv'; c.style.left = x + 'px'; c.style.top = yy + 'px'; c.style.width = cv.width * sc + 'px'; c.style.height = cv.height * sc + 'px'; app.append(c); };
    add(toolIcon(id, 128, { level: 3 }), 1, y + 30);
    add(toolIcon(id, 64, { level: 3 }), 2, y + 220);
    add(toolIcon(id, 64, { level: 1 }), 2, y + 370);
    add(toolIcon(id, 32, { level: 1 }), 2, y + 520);
    add(toolIcon(id, 32, { level: 1 }), 4, y + 600);
    caption(toolModelName(id).toUpperCase(), x, y + 880, 16);
  });
  (window as unknown as { __qaReady: boolean }).__qaReady = true;
} else if (view === 'world') {
  const id = Q.get('id') ?? 'drill';
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(1920, 1080); r.outputColorSpace = THREE.SRGBColorSpace; app.append(r.domElement);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x2a3038);
  sc.add(new THREE.HemisphereLight(0xcfd8e0, 0x3a3028, 1.2)); const sun = new THREE.DirectionalLight(0xfff2dc, 2.2); sun.position.set(-3, 5, 4); sc.add(sun);
  const m = buildToolModel(id, { lod: 'world', level: 3 })!; sc.add(m);
  const cam = new THREE.PerspectiveCamera(30, 1920 / 1080, 0.1, 50); cam.position.set(1.8, 1.1, 3.4); cam.lookAt(0, 0, 0);
  let last = performance.now();
  const loop = () => { const now = performance.now(); m.update(Math.min(0.05, (now - last) / 1000), { mode: 'active', level: 3 }); last = now; r.render(sc, cam); requestAnimationFrame(loop); };
  loop(); (window as unknown as { __qaReady: boolean }).__qaReady = true;
}
void Px;

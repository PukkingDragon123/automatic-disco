// A DOCK SLOT UNLOCKING (v7: the slots RESEARCH, BUILD, TROOPS, LAB and SHIP appear one by one). The screen dims, a
// fan of amber light turns behind the slot's own 3D object (the dock's model, outlined), which drops in spinning with a
// squash, its name floating under it in big Alagard; then it shrinks and flies down into its place in the dock, which
// unlocks with a burst and a clunk. A click skips ahead.
import * as THREE from 'three';
import { ModelView } from '../../ui/kit/model3d';
import { DOCK_MODELS, DOCK_ANIM } from '../../ui/kit/models';
import { tween, ease, burst, wait } from '../../ui/kit/juice';
import { uiSfx } from '../../ui/kit/sound';
import { bitText, bitMeasure } from '../../ui/kit/bitfont';
import { P } from '../../ui/kit/px';

const NAME: Record<string, string> = { build: 'BUILD', research: 'RESEARCH', troops: 'TROOPS', lab: 'LAB', ship: 'SHIP' };
const CSS = `.rv7 { position: fixed; inset: 0; z-index: 900; pointer-events: auto; cursor: pointer; }
.rv7 canvas { position: absolute; image-rendering: pixelated; }
.rv7 .rv7-dim { position: absolute; inset: 0; background: radial-gradient(closest-side, rgba(10,10,14,.35), rgba(6,7,10,.82)); opacity: 0; }`;
/** where a dock slot is on screen (the dock's own element when it shows one) */
export function dockSlotAt(id: string): [number, number] {
  const d = (window as unknown as { __dock?: { slotRect?(id: string): DOMRect | null; el?: HTMLElement } }).__dock;
  const el = document.querySelector(`[data-dock="${id}"]`) as HTMLElement | null;
  const r = d?.slotRect?.(id) ?? (el?.querySelector('.k7-model') as HTMLElement | null ?? el)?.getBoundingClientRect();
  if (r && r.width > 0) return [r.left + r.width / 2, r.top + r.height / 2];
  const i = ['build', 'research', 'troops', 'lab', 'ship'].indexOf(id);
  return [innerWidth / 2 + (i - 2) * 150, innerHeight - 70];
}
let queue: Promise<void> = Promise.resolve();
/** play the reveal for a slot (queued: several play one after another) */
export function revealDock(id: string, onLanded?: () => void): Promise<void> {
  queue = queue.then(() => play(id, onLanded)).catch((e) => console.error('reveal', e));
  return queue;
}
async function play(id: string, onLanded?: () => void) {
  if (!document.getElementById('rv7-css')) { const s = document.createElement('style'); s.id = 'rv7-css'; s.textContent = CSS; document.head.append(s); }
  const root = document.createElement('div'); root.className = 'rv7';
  const dim = document.createElement('div'); dim.className = 'rv7-dim'; root.append(dim);
  const rays = document.createElement('canvas'); const RW = 240, RH = 240; rays.width = RW; rays.height = RH; rays.style.width = RW * 3 + 'px'; rays.style.height = RH * 3 + 'px';
  root.append(rays);
  const build = DOCK_MODELS[id as keyof typeof DOCK_MODELS] ?? DOCK_MODELS.research;
  const view = new ModelView(() => build(), { w: 96, h: 96, scale: 3, spin: 2.2, hotSpin: 2.2, zoom: 1.0, pitch: 0.42, shadow: [3, 3, 0.45], anim: DOCK_ANIM[id as keyof typeof DOCK_ANIM], liveFps: 30 });
  root.append(view.cv);
  const name = document.createElement('canvas'); root.append(name);
  const word = NAME[id] ?? id.toUpperCase(), nw = bitMeasure(word) + 8; name.width = nw; name.height = 22; name.style.width = nw * 3 + 'px'; name.style.height = 66 + 'px';
  const nc = name.getContext('2d')!; bitText(nc, word, nw / 2, 1, { color: '#ffe2a0', extrude: [2, '#6a3a10'], align: 'center' });
  document.body.append(root);
  let skip = false; root.addEventListener('pointerdown', () => { skip = true; });
  const cx = innerWidth / 2, cy = innerHeight * 0.42;
  const place = (x: number, y: number, s: number) => {
    view.cv.style.left = Math.round(x - 144 * s) + 'px'; view.cv.style.top = Math.round(y - 144 * s) + 'px';
    view.cv.style.width = Math.round(288 * s) + 'px'; view.cv.style.height = Math.round(288 * s) + 'px';
    rays.style.left = Math.round(x - 360) + 'px'; rays.style.top = Math.round(y - 360) + 'px';
    name.style.left = Math.round(x - nw * 1.5) + 'px'; name.style.top = Math.round(y + 150 * s) + 'px';
  };
  let t = 0, raysOn = 1;
  const rc = rays.getContext('2d')!;
  const paintRays = () => {
    rc.clearRect(0, 0, RW, RH);
    const C = P.glowAmber;
    for (let k = 0; k < 12; k++) {
      const a0 = t * 0.6 + (k / 12) * Math.PI * 2, a1 = a0 + 0.13;
      for (let r = 18; r < 118; r += 1) for (let a = a0; a < a1; a += 0.9 / r) {
        const x = Math.round(RW / 2 + Math.cos(a) * r), y = Math.round(RH / 2 + Math.sin(a) * r);
        const f = 1 - r / 118; if (((x + y) & 1) && f < 0.5) continue;
        rc.fillStyle = '#' + (r < 50 ? C[4] : r < 80 ? C[3] : C[2]).toString(16).padStart(6, '0'); rc.globalAlpha = Math.min(1, f * 1.4) * raysOn; rc.fillRect(x, y, 1, 1);
      }
    }
    rc.globalAlpha = 1;
  };
  let raf = 0; const loop = () => { t += 1 / 60; paintRays(); raf = requestAnimationFrame(loop); }; loop();
  // in: dim, the model drops from above with a squash, the name rises
  uiSfx('swishIn', 0.8); uiSfx('glitch', 0.3);
  await tween(260, (k) => { dim.style.opacity = String(k); });
  name.style.opacity = '0';
  await tween(520, (k) => { place(cx, cy - (1 - k) * 240, 0.6 + k * 0.4); }, ease.outBack);
  view.press(1.6); view.poke(10);
  uiSfx('bong', 0.8); uiSfx('confirm', 0.9);
  burst(cx, cy, { n: 50, ramp: P.glowAmber, speed: 380, life: 0.9, gravity: 260 });
  void tween(300, (k) => { name.style.opacity = String(k); name.style.transform = `translateY(${Math.round((1 - k) * 18)}px)`; }, ease.outCubic);
  for (let i = 0; i < 30 && !skip; i++) await wait(60);
  // out: the model flies into its slot, the dock takes it
  const [dx, dy] = dockSlotAt(id);
  uiSfx('swishOut', 0.7);
  void tween(220, (k) => { name.style.opacity = String(1 - k); });
  await tween(560, (k) => { raysOn = 1 - k; place(cx + (dx - cx) * k, cy + (dy - cy) * k - Math.sin(k * Math.PI) * 90, 1 - k * 0.72); dim.style.opacity = String(1 - k); }, ease.inOutCubic);
  burst(dx, dy, { n: 34, ramp: P.glowAmber, speed: 260, life: 0.7, gravity: 400 });
  uiSfx('clunk', 0.9); uiSfx('thudLight', 0.6);
  onLanded?.();
  cancelAnimationFrame(raf);
  view.dispose(); root.remove();
  void THREE;
}

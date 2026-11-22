// ?test=hud7&view=kit: the UI kit on one sheet (the models, the materials, the text sizes, the glyphs, a counter, the
// juice and the transitions on buttons) for visual QA.
import { ModelView } from '../kit/model3d';
import { DOCK_MODELS, DOCK_ANIM, TOOL_MODELS, TOOL_ANIM, mCrate } from '../kit/models';
import { plate, pxCanvas, type Mat } from '../kit/mat';
import { Counter, placeDust, burst } from '../kit/juice';
import { transition, type TransitionKind } from '../kit/transitions';
import { floatIcon } from '../kit/floatIcon';
import { markGlyph, timeGlyph, batteryGlyph, o2Glyph, compassGlyph, type MarkKind } from './glyphs';

export function kitSheet() {
  document.body.style.background = '#2a2f2c';
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;overflow:auto;padding:16px;display:flex;flex-wrap:wrap;gap:14px;align-content:flex-start;z-index:5';
  document.body.append(root);
  const box = (title: string) => { const b = document.createElement('div'); b.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px'; const t = document.createElement('div'); t.className = 'k7-t16'; t.textContent = title; b.append(t); root.append(b); return b; };
  for (const id of Object.keys(DOCK_MODELS) as (keyof typeof DOCK_MODELS)[]) { const v = new ModelView(DOCK_MODELS[id], { w: 96, h: 84, scale: 2, spin: 0.4, anim: DOCK_ANIM[id], liveFps: id === 'lab' ? 10 : undefined, pitch: id === 'build' ? 0.75 : 0.45 }); box(id.toUpperCase()).append(v.cv); }
  for (const id of Object.keys(TOOL_MODELS)) { const v = new ModelView(TOOL_MODELS[id], { w: 64, h: 56, scale: 2, spin: 0.4, anim: TOOL_ANIM[id] }); box(id.toUpperCase()).append(v.cv); }
  { const v = new ModelView(mCrate, { w: 64, h: 56, scale: 2, spin: 0.3, pitch: 0.6 }); box('CRATE').append(v.cv); }
  const mats: Mat[] = ['steel', 'gun', 'enamel', 'brass', 'olive', 'paper', 'blueprint', 'wood', 'glass', 'leather', 'rubber', 'orange', 'copper'];
  for (const m of mats) box(m.toUpperCase()).append(pxCanvas(plate(70, 44, { mat: m, seed: 3, screws: true, wear: 0.9, hazard: m === 'olive' ? 5 : 0 }), 2));
  const g = box('GLYPHS'); const gr = document.createElement('div'); gr.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;max-width:520px;align-items:flex-end'; g.append(gr);
  for (const k of ['peak', 'fall', 'spring', 'geyser', 'cave', 'pass', 'vent', 'ore', 'crystal', 'pod', 'wreck', 'rival', 'danger', 'tree', 'conifer', 'building', 'drone', 'worker', 'struct', 'pin', 'beast'] as MarkKind[]) gr.append(pxCanvas(markGlyph(k, 2), 2));
  for (const k of ['pause', 'x1', 'x2', 'x3'] as const) gr.append(pxCanvas(timeGlyph(k, k === 'x1'), 2));
  gr.append(pxCanvas(batteryGlyph(0.6, 'ok'), 2), pxCanvas(batteryGlyph(0.2, 'crit'), 2), pxCanvas(o2Glyph(0.8, 'ok'), 2), pxCanvas(o2Glyph(0.2, 'crit'), 2), pxCanvas(compassGlyph(), 2));
  const tx = box('TEXT'); for (const s of [16, 32, 48]) { const e = document.createElement('div'); e.className = `k7-t${s}`; e.textContent = `ALAGARD ${s} 0123`; tx.append(e); }
  const cb = box('COUNTER'); const ct = new Counter(cb, { size: 48 }); let n = 120; ct.set(n, true);
  setInterval(() => { n += Math.floor(Math.random() * 40) - 8; ct.set(Math.max(0, n)); }, 1400);
  const jb = box('JUICE');
  for (const [name, f] of [['DUST LIGHT', (x: number, y: number) => placeDust(x, y, 0.15, { layer: 'ui' })], ['DUST HEAVY', (x: number, y: number) => placeDust(x, y, 0.9, { layer: 'ui' })], ['BURST', (x: number, y: number) => burst(x, y, { n: 24 })]] as [string, (x: number, y: number) => void][]) {
    const fi = floatIcon({ build: TOOL_MODELS.drill, name, size: [40, 34], nameSize: 16, onClick: (e) => f(e.clientX, e.clientY) }); jb.append(fi.el);
  }
  const tb = box('TRANSITIONS');
  for (const k of ['iris', 'shutter', 'dissolve', 'swoop'] as TransitionKind[]) { const fi = floatIcon({ build: DOCK_MODELS.research, name: k.toUpperCase(), size: [40, 34], nameSize: 16, onClick: (e) => void transition(k, undefined, { x: e.clientX, y: e.clientY, hold: 200 }) }); tb.append(fi.el); }
}

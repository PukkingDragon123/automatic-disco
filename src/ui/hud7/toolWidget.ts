// HUD v7 · THE TOOL WIDGET (bottom right; replaces the drum). The CURRENT TOOL floats as a big outlined 3D model over
// its shadow, its name under it and three level lamps; the four QUICK SLOTS sit beside it as small turning models, the
// live one lit. CLICK the tool to use it (its unit takes it: the colony's useSlot); a refusal shakes it and says why.
// Swipe it left / right (or the wheel, [ and ]) to change tool: the model spins out and the next drops in with a
// bounce. HOLD it: an amber ring fills round it and the ARSENAL opens (arsenal.ts).
import type { Game } from '../../game/game';
import { ModelView } from '../kit/model3d';
import { TOOL_MODELS, TOOL_ANIM, mCustomTool } from '../kit/models';
import { shadowBlob, pxCanvas } from '../kit/mat';
import { Px, P, INK } from '../kit/px';
import { uiSfx } from '../kit/sound';
import { shake, burst, bounceEl, onFrame, floatUp, pop } from '../kit/juice';
import { installKitStyle } from '../kit/style';
import { TOOLS, quickCustom, type ToolId } from './tools';
import { Arsenal } from './arsenal';
import { Bench } from './bench';

type G = Game & Record<string, any>;
const HOLD_MS = 420;
export function toolBuild(tool: ToolId | null, custom?: { parts: Record<string, string> } | null) {
  if (custom) return () => mCustomTool(custom.parts);
  return TOOL_MODELS[tool ?? 'scanner'] ?? TOOL_MODELS.scanner;
}
/** three level lamps (brass bezels, amber when lit) */
function lamps(level: number): Px {
  const p = new Px(26, 8);
  for (let i = 0; i < 3; i++) {
    const x = 1 + i * 8, on = i < level;
    p.disc(x + 3, 4, 3.2, (d, l) => (d > 2.6 ? P.brass[l > 0 ? 4 : 2] : on ? (l > 0.3 ? P.glowAmber[4] : P.glowAmber[2]) : (l > 0.3 ? P.steel[2] : P.ink[1])));
  }
  p.outline(INK);
  return p;
}
/** the hold ring: amber cells round a circle, filled to k */
function holdRing(k: number, R = 46): Px {
  const S = R * 2 + 4, p = new Px(S, S), c = S / 2, n = 28;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2, on = i / n < k;
    const x = Math.round(c + Math.cos(a) * R), y = Math.round(c + Math.sin(a) * R);
    p.rect(x - 1, y - 1, 3, 3, INK); p.rect(x - 1, y - 1, 2, 2, on ? P.glowAmber[4] : P.steel[2]); if (on) p.set(x - 1, y - 1, P.glowAmber[4]);
  }
  return p;
}

export class ToolWidget {
  readonly el: HTMLDivElement;
  private stage: HTMLButtonElement; private view: ModelView | null = null; private viewKey = '';
  private nameEl: HTMLDivElement; private lampCv: HTMLCanvasElement; private ring: HTMLCanvasElement;
  private quick: { el: HTMLButtonElement; view: ModelView | null; key: string }[] = [];
  focus = 0;
  private press: { t0: number; x: number; y: number; moved: boolean; opened: boolean } | null = null;
  readonly arsenal: Arsenal; readonly bench: Bench;
  private acc = 0;
  constructor(readonly g: G) {
    installKitStyle(); injectToolCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-tool';
    // the quick slots
    const qs = document.createElement('div'); qs.className = 'h7-quick';
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'h7-q'; b.setAttribute('aria-label', 'Quick slot ' + (i + 1));
      const n = document.createElement('span'); n.className = 'k7-t16 h7-qn'; n.textContent = String(i + 1); b.append(n);
      b.addEventListener('pointerenter', () => { uiSfx('hover', 0.35); this.quick[i].view?.hot(true); });
      b.addEventListener('pointerleave', () => this.quick[i].view?.hot(false));
      b.addEventListener('click', (e) => { e.stopPropagation(); this.select(i); });
      qs.append(b); this.quick.push({ el: b, view: null, key: '' });
    }
    // the stage: the big model, its shadow, the hold ring
    const st = this.stage = document.createElement('button'); st.type = 'button'; st.className = 'h7-stage'; st.setAttribute('aria-label', 'Use tool (hold for the arsenal)');
    st.append(pxCanvas(shadowBlob(56, 10, 0.6), 2, 'h7-stage-sh'));
    this.ring = pxCanvas(holdRing(0), 2, 'h7-ring'); st.append(this.ring);
    const hint = document.createElement('span'); hint.className = 'k7-hint k7-t16 h7-hold'; hint.textContent = 'HOLD'; st.append(hint);
    this.nameEl = document.createElement('div'); this.nameEl.className = 'k7-name k7-t32 h7-tname';
    this.lampCv = pxCanvas(lamps(1), 2, 'h7-lamps');
    const nameRow = document.createElement('div'); nameRow.className = 'h7-trow'; nameRow.append(this.nameEl, this.lampCv);
    const right = document.createElement('div'); right.className = 'h7-tright'; right.append(st, nameRow);
    el.append(qs, right);
    this.wire();
    this.arsenal = new Arsenal(g, this);
    this.bench = new Bench(g, this);
  }
  /** the quick slot shown (the colony's live slot when one is running) */
  get current() { const a = this.g.colony?.slots?.active ?? -1; return a >= 0 && a < 4 ? a : this.focus; }
  private slotTool(i: number): { tool: ToolId | null; level: number; custom: ReturnType<typeof quickCustom> } {
    const s = this.g.colony?.slots?.slots?.[i];
    return { tool: s?.tool ?? null, level: s?.level ?? 0, custom: quickCustom(this.g, i) };
  }
  private wire() {
    const st = this.stage;
    st.addEventListener('pointerenter', (e) => { this.view?.hot(true); st.classList.add('hot'); if (e.pointerType === 'mouse') uiSfx('hover', 0.5); });
    st.addEventListener('pointerleave', () => { this.view?.hot(false); st.classList.remove('hot'); });
    st.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.stopPropagation();
      st.setPointerCapture(e.pointerId);
      this.press = { t0: performance.now(), x: e.clientX, y: e.clientY, moved: false, opened: false };
      this.view?.press(0.8); uiSfx('tick', 0.4, 0.8);
      onFrame(() => {
        const p = this.press; if (!p) { holdRing(0).canvas(this.ring); this.ring.classList.remove('on'); return false; }
        if (p.moved || p.opened) return false;
        const k = (performance.now() - p.t0) / HOLD_MS;
        if (k > 0.15) { this.ring.classList.add('on'); holdRing(Math.min(1, (k - 0.15) / 0.85)).canvas(this.ring); }
        if (k >= 1) { p.opened = true; this.ring.classList.remove('on'); holdRing(0).canvas(this.ring); uiSfx('winch', 0.5, 1.3); this.openArsenal(); return false; }
        return true;
      });
    });
    st.addEventListener('pointermove', (e) => {
      this.view?.point(e.clientX, e.clientY);
      const p = this.press; if (!p || p.opened) return;
      const dx = e.clientX - p.x;
      if (!p.moved && Math.abs(dx) > 14) { p.moved = true; this.ring.classList.remove('on'); }
      if (p.moved && Math.abs(dx) > 34) { this.cycle(dx < 0 ? 1 : -1); p.x = e.clientX; }
    });
    const up = () => {
      const p = this.press; this.press = null;
      if (!p || p.moved || p.opened) return;
      this.use();
    };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', () => { this.press = null; });
    st.addEventListener('wheel', (e) => { e.preventDefault(); this.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    st.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openArsenal(); });
  }
  select(i: number) {
    if (i === this.focus && this.g.colony?.slots?.active < 0) return;
    this.focus = i;
    const c = this.g.colony;
    if (c && c.slots.active >= 0 && c.slots.active !== i) c.release?.();
    uiSfx('switch', 0.6); this.viewKey = ''; this.refresh(true);
  }
  cycle(d: number) { this.view?.poke(d * 14); this.select((this.focus + d + 4) % 4); }
  /** use the current tool: its unit takes it */
  use() {
    const c = this.g.colony, i = this.current, s = this.slotTool(i);
    const r = this.stage.getBoundingClientRect();
    if (!c) { this.refuse('NO COLONY'); return; }
    const why = c.useSlot(i);
    if (why) { this.refuse(why); return; }
    this.view?.press(1.3); this.view?.poke(10);
    burst(r.left + r.width / 2, r.top + r.height * 0.45, { n: 12, ramp: s.tool === 'weld' ? P.sapphire : s.tool === 'lift' || s.tool === 'grab' ? P.amethyst : P.glowAmber, speed: 240, life: 0.45 });
    uiSfx('confirm', 0.55); uiSfx('metal', 0.3, 1.4);
  }
  private refuse(why: string) {
    shake(this.stage, 6); this.view?.poke(-8); uiSfx('error', 0.55);
    const r = this.stage.getBoundingClientRect();
    floatUp(r.left + r.width / 2, r.top - 10, why.toUpperCase().slice(0, 34), { size: 16, color: '#f09a7a' });
  }
  openArsenal() { this.arsenal.open(true); }
  openBench() { this.bench.open(true); }
  key(k: string) {
    if (this.arsenal.isOpen || this.bench.isOpen) return false;
    if (k === '[' || k === ']') { this.cycle(k === ']' ? 1 : -1); return true; }
    if (k === 'f') { this.use(); return true; }
    if (k === 'g') { this.openArsenal(); return true; }
    return false;
  }
  /** rebuild the big model and the quick slots when their tools change */
  refresh(force = false) {
    const i = this.current, s = this.slotTool(i);
    const key = `${i}|${s.tool}|${s.custom?.id ?? ''}|${s.level}`;
    if (key !== this.viewKey || force) {
      const changed = this.viewKey !== '';
      this.viewKey = key;
      const v = new ModelView(toolBuild(s.tool, s.custom), { w: 84, h: 70, scale: 2, spin: 0, yaw0: 0.5, hotSpin: 1.8, pitch: 0.38, anim: s.tool ? TOOL_ANIM[s.tool] : undefined, zoom: 1.1 });
      v.cv.classList.add('h7-tmodel');
      this.view?.dispose(); this.view = v;
      this.stage.insertBefore(v.cv, this.ring);
      if (s.level <= 0 || !s.tool) v.cv.classList.add('dim');
      if (changed) { bounceEl(v.cv, 0.35); uiSfx('clunk', 0.4, 1.2); }
      const nm = s.custom?.name ?? (s.level <= 0 ? 'LOCKED' : s.tool ? TOOLS[s.tool].name.toUpperCase() : 'EMPTY');
      this.nameEl.textContent = nm;
      lamps(s.level).canvas(this.lampCv);
      if (changed) pop(this.nameEl, 0.4);
    }
    for (let q = 0; q < 4; q++) {
      const t = this.slotTool(q), qk = `${t.tool}|${t.custom?.id ?? ''}|${t.level}`, Q = this.quick[q];
      Q.el.classList.toggle('on', q === i);
      Q.el.classList.toggle('lock', t.level <= 0);
      if (qk === Q.key) continue;
      Q.key = qk; Q.view?.dispose(); Q.view = null;
      if (t.tool && t.level > 0) { Q.view = new ModelView(toolBuild(t.tool, t.custom), { w: 38, h: 32, scale: 2, spin: 0, yaw0: 0.5, hotSpin: 2.5, pitch: 0.4, frames: 24, zoom: 1.15 }); Q.el.prepend(Q.view.cv); }
    }
  }
  update(dt: number) {
    this.acc -= dt; if (this.acc > 0) return; this.acc = 0.15;
    this.refresh();
    const c = this.g.colony;
    this.stage.classList.toggle('live', !!c && c.slots?.active === this.current);
  }
}

let css = false;
function injectToolCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-tool { position: fixed; right: 14px; bottom: 8px; z-index: 35; display: flex; align-items: flex-end; gap: 4px; pointer-events: none; }
.h7-quick { display: grid; grid-template-columns: 80px 80px; gap: 0 2px; margin-bottom: 34px; pointer-events: auto; }
.h7-q { position: relative; width: 80px; height: 68px; border: 0; background: none; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform .2s cubic-bezier(.2,.9,.3,1.6), filter .15s; filter: drop-shadow(2px 3px 0 rgba(5,6,8,.4)); }
.h7-q .k7-model { display: block; }
.h7-q .h7-qn { position: absolute; left: 2px; top: 0; color: var(--k7-dim); }
.h7-q:hover { transform: translateY(-3px); filter: brightness(1.2) drop-shadow(2px 5px 0 rgba(5,6,8,.35)); }
.h7-q.on { filter: drop-shadow(0 0 6px rgba(255,190,80,.7)) drop-shadow(2px 3px 0 rgba(5,6,8,.4)); }
.h7-q.on .h7-qn { color: var(--k7-amber); }
.h7-q.lock { opacity: .45; }
.h7-tright { display: flex; flex-direction: column; align-items: center; pointer-events: auto; }
.h7-stage { position: relative; width: 176px; height: 150px; border: 0; background: none; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; touch-action: none; }
.h7-stage .h7-tmodel { position: relative; z-index: 1; display: block; transition: transform .22s cubic-bezier(.2,.9,.3,1.5), filter .18s; }
.h7-stage.hot .h7-tmodel { transform: translateY(-8px); filter: brightness(1.15) drop-shadow(0 0 8px rgba(255,205,120,.6)); }
.h7-stage.live .h7-tmodel { filter: brightness(1.2) drop-shadow(0 0 10px rgba(255,170,60,.85)); }
.h7-stage .h7-tmodel.dim { filter: grayscale(.85) brightness(.55); }
.h7-stage-sh { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); z-index: 0; }
.h7-ring { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(.9); z-index: 2; opacity: 0; transition: opacity .1s, transform .2s; pointer-events: none; }
.h7-ring.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.h7-stage .h7-hold { top: 2px; opacity: 0; position: absolute; left: 50%; transform: translateX(-50%); transition: opacity .15s; color: #ffd98a; z-index: 3; pointer-events: none; }
.h7-stage.hot .h7-hold { opacity: 1; }
.h7-trow { display: flex; align-items: center; gap: 8px; margin-top: -10px; }
.h7-lamps { display: block; margin-top: 4px; }
`;
  document.head.append(s);
}

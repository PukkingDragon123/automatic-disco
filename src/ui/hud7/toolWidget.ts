// HUD v7 · THE TOOL TURRET (bottom right; replaces the drum). A machined, anodised four-arm TURRET on a geared pedestal
// (src/ui/kit/hardware.ts), drawn in 3D with a black outline: the four QUICK SLOTS' tools stand in its cradles and the
// current one faces you. Swipe it left / right (or the wheel, [ and ]): the head turns to the next tool, driving the
// exposed gear train and pumping the piston, the slot LEDs follow, the power lamp blinks while it moves. CLICK it to use
// the tool (its unit takes it: the colony's useSlot); the lens and the light ring blink while it runs; a refusal shakes
// it and says why. HOLD it: an amber ring of cells fills round it and the ARSENAL opens (arsenal.ts).
import type { Game } from '../../game/game';
import { ModelView } from '../kit/model3d';
import { TOOL_ANIM, mCustomTool, toolModel, hasToolModelProvider, type ToolLod } from '../kit/models';
import { mTurret, animTurret, type TurretState } from '../kit/hardware';
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
/** a tool's model (the TOOL MODELS agent's when registered, else the kit's); custom tools are built from their parts */
export function toolBuild(tool: ToolId | null, custom?: { parts: Record<string, string> } | null, lod: ToolLod = 'hud') {
  if (custom) return () => mCustomTool(custom.parts);
  return toolModel(tool ?? 'scanner', lod);
}
/** the kit's own per-tool animation (only for its own models) */
export const toolAnim = (t: ToolId | null) => (t && !hasToolModelProvider() ? TOOL_ANIM[t] : undefined);
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
function holdRing(k: number, R = 70): Px {
  const S = R * 2 + 4, p = new Px(S, S), c = S / 2, n = 40;
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
  focus = 0;
  private press: { t0: number; x: number; y: number; moved: boolean; opened: boolean } | null = null;
  readonly arsenal: Arsenal; readonly bench: Bench;
  private acc = 0;
  constructor(readonly g: G) {
    installKitStyle(); injectToolCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-tool';
    // the stage: the big model, its shadow, the hold ring
    const st = this.stage = document.createElement('button'); st.type = 'button'; st.className = 'h7-stage'; st.setAttribute('aria-label', 'Use tool (hold for the arsenal)');
    st.append(pxCanvas(shadowBlob(110, 14, 0.6), 2, 'h7-stage-sh'));
    this.ring = pxCanvas(holdRing(0), 2, 'h7-ring'); st.append(this.ring);
    const hint = document.createElement('span'); hint.className = 'k7-hint k7-t16 h7-hold'; hint.textContent = 'HOLD'; st.append(hint);
    this.nameEl = document.createElement('div'); this.nameEl.className = 'k7-name k7-t32 h7-tname';
    this.lampCv = pxCanvas(lamps(1), 2, 'h7-lamps');
    const nameRow = document.createElement('div'); nameRow.className = 'h7-trow'; nameRow.append(this.nameEl, this.lampCv);
    const right = document.createElement('div'); right.className = 'h7-tright'; right.append(st, nameRow);
    el.append(right);
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
    uiSfx('switch', 0.6); this.refresh();
  }
  cycle(d: number) { this.select((this.focus + d + 4) % 4); }
  /** use the current tool: its unit takes it */
  use() {
    const c = this.g.colony, i = this.current, s = this.slotTool(i);
    const r = this.stage.getBoundingClientRect();
    if (!c) { this.refuse('NO COLONY'); return; }
    const why = c.useSlot(i);
    if (why) { this.refuse(why); return; }
    this.view?.press(1.3);
    const ts = this.view?.state<TurretState>(); if (ts) ts.flash = performance.now() / 1000 + 0.6;
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
  /** rebuild the turret when the quick slots' tools change; turn it when the slot changes */
  refresh(force = false) {
    const i = this.current, s = this.slotTool(i);
    const all = [0, 1, 2, 3].map((q) => this.slotTool(q));
    const setKey = all.map((t) => `${t.tool}|${t.custom?.id ?? ''}|${t.level}`).join(',');
    if (setKey !== this.viewKey || force) {
      this.viewKey = setKey;
      const builds = all.map((t) => (t.tool && t.level > 0 ? toolBuild(t.tool, t.custom, 'hud') : null));
      const v = new ModelView(() => mTurret(builds), { w: 150, h: 118, scale: 2, spin: 0, yaw0: -0.38, rock: 0.1, hotSpin: 0, pitch: 0.36, anim: (r, t) => animTurret(r, t), liveFps: 10, zoom: 1.12, lift: 0.02 });
      v.cv.classList.add('h7-tmodel');
      this.view?.dispose(); this.view = v;
      this.stage.insertBefore(v.cv, this.ring);
    }
    const st = this.view?.state<TurretState>();
    if (st) { st.locked = all.map((t) => t.level <= 0); st.live = this.g.colony?.slots?.active === i; }
    if (st && st.slot !== i) { st.slot = i; uiSfx('winch', 0.35, 1.4); uiSfx('clunk', 0.3, 1.3); }
    const nm = s.custom?.name ?? (s.level <= 0 ? 'LOCKED' : s.tool ? TOOLS[s.tool].name.toUpperCase() : 'EMPTY');
    if (this.nameEl.textContent !== nm) { this.nameEl.textContent = nm; pop(this.nameEl, 0.4); }
    const lk = String(s.level); if (this.lampCv.dataset.l !== lk) { this.lampCv.dataset.l = lk; lamps(s.level).canvas(this.lampCv); }
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
.h7-stage { position: relative; width: 300px; height: 236px; border: 0; background: none; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; touch-action: none; }
.h7-stage .h7-tmodel { position: relative; z-index: 1; display: block; transition: transform .22s cubic-bezier(.2,.9,.3,1.5), filter .18s; }
.h7-stage.hot .h7-tmodel { transform: translateY(-4px); filter: brightness(1.12) drop-shadow(0 0 8px rgba(120,220,210,.45)); }
.h7-stage.live .h7-tmodel { filter: brightness(1.15) drop-shadow(0 0 10px rgba(255,170,60,.7)); }
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

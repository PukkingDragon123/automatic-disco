// HUD v7 · THE MAIN DOCK. Five floating 3D icons along the bottom centre (BUILD a blueprint sheet and its roll,
// RESEARCH a brass microscope, TROOPS a soldier's helmet, LAB a gene tank with an embryo in lit fluid, SHIP the
// research ship with its turning hab ring), each with its name floating under it in Alagard. Hover lifts, glows and
// tilts the model toward the pointer; a press squashes it in 3D with a click; a badge pops when something needs you.
// Each slot opens its mode through its own TRANSITION (BUILD swoops, RESEARCH and SHIP iris on the icon, TROOPS slams
// the blast shutters, LAB dissolves). The modes belong to other agents: they plug in with dock.register(id, open);
// until then a slot opens a stub stage (its model on a painted plate) or a known game hook.
import type { Game } from '../../game/game';
import { floatIcon, type FloatIcon } from '../kit/floatIcon';
import { DOCK_MODELS, DOCK_ANIM } from '../kit/models';
import { transition, cover, reveal, type TransitionKind } from '../kit/transitions';
import { ModelView } from '../kit/model3d';
import { plate, skin, type Mat } from '../kit/mat';
import { uiSfx } from '../kit/sound';
import { installKitStyle } from '../kit/style';

export type DockId = 'build' | 'research' | 'troops' | 'lab' | 'ship';
export const DOCK_IDS: DockId[] = ['build', 'research', 'troops', 'lab', 'ship'];
const NAMES: Record<DockId, string> = { build: 'BUILD', research: 'RESEARCH', troops: 'TROOPS', lab: 'LAB', ship: 'SHIP' };
const KIND: Record<DockId, TransitionKind> = { build: 'swoop', research: 'iris', troops: 'shutter', lab: 'dissolve', ship: 'iris' };
const STAGE: Record<DockId, Mat> = { build: 'blueprint', research: 'brass', troops: 'olive', lab: 'enamel', ship: 'steel' };
export interface DockCtx {
  id: DockId; x: number; y: number;
  /** the transition this slot played (already covering when open() runs, unless 'none') */
  kind: TransitionKind | 'none';
  /** play the slot's transition back to the game (call it when your screen closes) */
  close(after?: () => void): Promise<void>;
}
export type DockOpen = (ctx: DockCtx) => void | Promise<void>;
interface Slot { id: DockId; fi: FloatIcon; open: DockOpen | null; kind: TransitionKind | 'none' }

export class Dock {
  readonly el: HTMLDivElement;
  private slots = new Map<DockId, Slot>();
  private busy = false;
  private counts: Partial<Record<DockId, number>> = {};
  constructor(readonly g: Game | null) {
    installKitStyle(); injectDockCSS();
    const el = this.el = document.createElement('div');
    el.className = 'h7-dock';
    for (const id of DOCK_IDS) {
      const fi = floatIcon({
        build: DOCK_MODELS[id], name: NAMES[id], size: [64, 58], scale: 2, sound: '',
        view: { pitch: id === 'build' ? 0.75 : id === 'ship' ? 0.5 : 0.42, spin: 0, yaw0: id === 'build' ? 0.35 : id === 'troops' ? 0.5 : id === 'ship' ? 0.55 : 0.75, hotSpin: id === 'build' ? 1.2 : 2.2, anim: DOCK_ANIM[id], liveFps: id === 'lab' ? 10 : undefined, zoom: id === 'troops' ? 1.3 : id === 'build' ? 1.15 : id === 'ship' ? 1.3 : 1.05, lift: id === 'troops' ? 0.03 : 0 },
        onClick: () => this.open(id),
      });
      fi.el.dataset.dock = id;
      el.append(fi.el);
      this.slots.set(id, { id, fi, open: null, kind: KIND[id] });
    }
    // events that raise a badge until the slot is opened
    const bump = (id: DockId) => { this.counts[id] = (this.counts[id] ?? 0) + 1; this.badge(id, this.counts[id]!); };
    g?.on?.('scan', () => bump('research'));
    g?.on?.('specimen-delivered', () => bump('lab'));
    g?.on?.('sample', () => bump('lab'));
  }
  /** plug a mode in: open(ctx) runs while the slot's transition covers the screen */
  register(id: DockId, open: DockOpen, o: { transition?: TransitionKind | 'none' } = {}) {
    const s = this.slots.get(id); if (!s) return;
    s.open = open; if (o.transition) s.kind = o.transition;
  }
  /** a badge on a slot (a count, '!' or null) */
  badge(id: DockId, n: number | string | null) { this.slots.get(id)?.fi.setBadge(n); if (!n) this.counts[id] = 0; }
  lock(id: DockId, on: boolean) { this.slots.get(id)?.fi.lock(on); }
  setOn(id: DockId, on: boolean) { this.slots.get(id)?.fi.setOn(on); }
  icon(id: DockId) { return this.slots.get(id)?.fi.el ?? null; }
  /** open a slot's mode with its transition */
  async open(id: DockId) {
    if (this.busy) return;
    const s = this.slots.get(id); if (!s) return;
    this.busy = true;
    const r = s.fi.el.querySelector('.k7-model')?.getBoundingClientRect() ?? s.fi.el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    this.badge(id, null);
    const kind = s.kind;
    const close = async (after?: () => void) => { if (kind === 'none') { after?.(); this.setOn(id, false); return; } await cover(kind, { x, y }); after?.(); this.setOn(id, false); await reveal(kind, { x, y }); };
    const ctx: DockCtx = { id, x, y, kind, close };
    try {
      if (s.open) {
        if (kind === 'none') await s.open(ctx);
        else { await cover(kind, { x, y }); try { await s.open(ctx); } finally { await reveal(kind, { x, y }); } }
        this.setOn(id, true);
      } else if (!this.hook(id, ctx)) await this.stub(id, ctx);
    } finally { this.busy = false; }
  }
  /** the game's own screens for the slots nobody registered yet */
  private hook(id: DockId, ctx: DockCtx): boolean {
    const g = this.g as unknown as { colony?: { shipLink(): void } | null; opts?: { hooks?: Record<string, ((g: Game) => void) | undefined> } } | null;
    if (!g) return false;
    const h = g.opts?.hooks ?? {};
    const run = (f: () => void) => { void transition(ctx.kind === 'none' ? 'iris' : ctx.kind, f, { x: ctx.x, y: ctx.y }); return true; };
    if (id === 'ship' && g.colony) return run(() => g.colony!.shipLink());
    if (id === 'lab' && h.openLab) return run(() => h.openLab!(this.g!));
    if (id === 'research' && h.openSkills) return run(() => h.openSkills!(this.g!));
    return false;
  }
  /** a stub stage: the slot's model big on a plate of its material, a BACK icon */
  private async stub(id: DockId, ctx: DockCtx) {
    const kind = ctx.kind === 'none' ? 'iris' : ctx.kind;
    let st: HTMLDivElement | null = null, view: ModelView | null = null;
    await transition(kind, () => {
      st = document.createElement('div'); st.className = 'h7-stub';
      const card = document.createElement('div'); card.className = 'h7-stub-card';
      st.append(card);
      skin(card, (w, h) => plate(w, h, { mat: STAGE[id], seed: 70 + id.length, screws: true, rivets: id !== 'build', wear: 0.7, chamfer: 6, hazard: id === 'troops' ? 6 : 0 }));
      view = new ModelView(DOCK_MODELS[id], { w: 150, h: 130, scale: 2, spin: 0.5, hotSpin: 1.6, pitch: 0.45, anim: DOCK_ANIM[id], liveFps: 12 });
      view.cv.classList.add('h7-stub-model');
      const nm = document.createElement('div'); nm.className = 'k7-name k7-t48'; nm.textContent = NAMES[id];
      const back = floatIcon({ build: DOCK_MODELS.build, name: 'BACK', size: [32, 28], nameSize: 16, sound: 'back', view: { pitch: 0.8, spin: 0 }, onClick: () => close() });
      back.el.classList.add('h7-stub-back');
      card.append(view.cv, nm, back.el);
      card.addEventListener('pointermove', (e) => { view?.hot(true); view?.point(e.clientX, e.clientY); });
      document.body.append(st);
      this.setOn(id, true);
      uiSfx('open', 0.5);
    }, { x: ctx.x, y: ctx.y });
    const close = () => { void transition(kind, () => { view?.dispose(); (st as HTMLDivElement | null)?.remove(); this.setOn(id, false); }, { x: ctx.x, y: ctx.y }); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && (st as HTMLDivElement | null)?.isConnected) { e.stopImmediatePropagation(); removeEventListener('keydown', esc, true); close(); } };
    addEventListener('keydown', esc, true);
  }
}

let css = false;
function injectDockCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-dock { position: fixed; left: 50%; bottom: 6px; transform: translateX(-50%); z-index: 40; display: flex; align-items: flex-end; gap: 30px; pointer-events: none; }
.h7-dock .k7-fi { width: 150px; }
.h7-stub { position: fixed; inset: 0; z-index: 9400; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at 50% 45%, rgba(8,9,12,.55), rgba(8,9,12,.88)); }
.h7-stub-card { position: relative; width: 560px; height: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
.h7-stub-card > * { position: relative; z-index: 1; }
.h7-stub-model { display: block; }
.h7-stub-back { position: absolute !important; right: 18px; top: 14px; }
`;
  document.head.append(s);
}

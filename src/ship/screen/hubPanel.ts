// A room's functions over the SHIP HUB itself (the hub is the main menu before any landing): when a room is used,
// its function panel unfolds as a framed plate on the right of the cutaway (the same panels as the SHIP screen's
// function bay: the bridge's MONITOR globe and DEPLOY, the crew's cards, the medbay...). It replaces the old
// hardware consoles and the hologram. Esc or BACK folds it away.
import type { RoomId } from '../hub/layout';
import { ROOM_FNS, FN, ROOM_SHORT, fnOpen, type FnId } from './gates';
import { shipCSS, div, place, artCanvas, S, iconOf, padlock } from './ui';
import { PANELS, type Panel } from './panels';
import { plate } from '../../ui/kit/mat';
import { Px, P, bevel } from '../../ui/kit/px';
import { bitReady } from '../../ui/kit/bitfont';
import { uiSfx } from '../../ui/kit/sound';
import { onFrame, tween, ease, pop, shake } from '../../ui/kit/juice';
import { transition } from '../../ui/kit/transitions';
import { floatIcon } from '../../ui/kit/floatIcon';
import { portraitRenderer } from '../../social/portrait';
import * as THREE from 'three';
import { toon } from '../../ui/kit/model3d';

export class HubPanel {
  static current: HubPanel | null = null;
  readonly el: HTMLDivElement;
  private frame: HTMLDivElement; private body: HTMLDivElement; private tabs: HTMLDivElement;
  private panel: Panel | null = null; private fn: FnId | null = null;
  private off: (() => void)[] = [];
  private done = false;
  private W: number; private H: number;
  constructor(readonly hub: any, readonly room: RoomId, fn?: FnId) {
    HubPanel.current = this; (window as unknown as { __hubPanel?: HubPanel }).__hubPanel = this;
    shipCSS();
    if (hub?.engine?.renderer) portraitRenderer(hub.engine.renderer);
    this.el = div('s7'); this.el.style.background = 'linear-gradient(90deg, rgba(8,9,12,0) 30%, rgba(8,9,12,.55))';
    const AW = Math.floor(innerWidth / S), AH = Math.floor(innerHeight / S);
    this.W = Math.min(340, AW - 24); this.H = Math.min(AH - 40, 500);
    const fw = this.W + 24, fh = this.H + 52;
    this.frame = div('s7-frame', this.el); place(this.frame, AW - fw - 16, Math.floor((AH - fh) / 2), fw, fh);
    const bg = artCanvas(fw, fh); this.frame.append(bg);
    const p = plate(fw, fh, { mat: 'gun', seed: 27, chamfer: 5, wear: 1, screws: true, lip: 3, grime: 0.8 });
    bevel(p, 9, 37, this.W + 6, this.H + 6, P.steel, { chamfer: 4, sunk: true });
    bg.getContext('2d')!.putImageData(p.image(), 0, 0);
    this.body = div('s7-abs s7-bay', this.frame); place(this.body, 12, 40, this.W, this.H);
    this.tabs = div('s7-abs', this.frame); place(this.tabs, 12, 6); this.tabs.style.display = 'flex'; this.tabs.style.gap = 4 * S + 'px';
    const back = floatIcon({ build: lever, name: 'BACK', size: [30, 26], nameSize: 16, sound: 'back', view: { pitch: 0.5, spin: 0, yaw0: 0.4 }, onClick: () => this.close() });
    back.el.classList.add('s7-abs'); place(back.el, fw - 44, -8); this.frame.append(back.el);
    document.body.append(this.el);
    hub?.lockInput?.(true);
    void bitReady();
    this.open(fn && ROOM_FNS[room].includes(fn) ? fn : ROOM_FNS[room][0]);
    // unfold in from the right
    this.frame.style.transform = `translateX(${(fw + 40) * S}px)`;
    void tween(480, (k) => { this.frame.style.transform = `translateX(${Math.round((1 - k) * (fw + 40)) * S}px)`; }, ease.outBack).then(() => { this.frame.style.transform = ''; uiSfx('metalClose', 0.4); });
    uiSfx('swishIn', 0.6);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!this.panel?.back?.()) this.close(); } };
    addEventListener('keydown', key, true); this.off.push(() => removeEventListener('keydown', key, true));
    this.off.push(onFrame((dt) => { if (this.done) return false; this.panel?.update?.(dt); return true; }) as unknown as () => void);
  }
  private open(f: FnId) {
    this.fn = f;
    this.tabs.replaceChildren();
    const nm = div('k7-t32 k7-name', this.tabs); nm.textContent = ROOM_SHORT[this.room]; nm.style.color = '#ffe7a8'; nm.style.marginRight = 6 * S + 'px';
    for (const g of ROOM_FNS[this.room]) {
      const t = div('s7-tab' + (g === f ? ' on' : ''), this.tabs);
      const cv = artCanvas(26, 24, ''); t.append(cv);
      const p = new Px(26, 24); bevel(p, 1, 1, 24, 22, g === f ? P.bone : P.steel, { chamfer: 2 });
      const c = cv.getContext('2d')!; c.putImageData(p.image(), 0, 0);
      if (fnOpen(this.hub?.game ?? null, this.room, g)) c.drawImage(iconOf(FN[g].icon, g === f ? 'amber' : 'steel'), 3, 2, 20, 20); else c.drawImage(padlock(), 6, 4, 14, 16);
      t.addEventListener('click', () => { if (g === this.fn) return; uiSfx('tab', 0.6); pop(t, 0.8); this.open(g); });
    }
    this.panel?.dispose(); this.body.replaceChildren();
    try { this.panel = PANELS[f]({ game: this.hub?.game ?? null, host: this.body, w: this.W, h: this.H, room: this.room, hub: this.hub, close: () => this.close(), shake: (k) => shake(this.frame, 3 * k, 260) }); }
    catch (e) { console.error('hub panel', f, e); this.panel = null; }
  }
  close() {
    if (this.done) return;
    uiSfx('swishOut', 0.5);
    const fw = this.W + 24;
    void tween(300, (k) => { this.frame.style.transform = `translateX(${Math.round(k * k * (fw + 40)) * S}px)`; }, ease.inCubic).then(() => this.dispose());
  }
  dispose() {
    if (this.done) return; this.done = true;
    this.panel?.dispose(); this.panel = null;
    for (const f of this.off) try { f(); } catch { /* */ }
    this.el.remove();
    this.hub?.lockInput?.(false);
    if (HubPanel.current === this) HubPanel.current = null;
    const w = window as unknown as { __hubPanel?: HubPanel }; if (w.__hubPanel === this) delete w.__hubPanel;
  }
}
/** open a room's functions over the hub (an iris on the first open) */
export function openHubPanel(hub: any, room: RoomId, fn?: FnId): HubPanel {
  HubPanel.current?.dispose();
  return new HubPanel(hub, room, fn);
}
void transition;
function lever(): THREE.Group {
  const g = new THREE.Group();
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.16, 16), toon({ color: 0x40444a, metal: 0.6 })); g.add(boss);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), toon({ color: 0xb8bcc0, metal: 0.8 })); arm.position.set(0.18, 0.36, 0); arm.rotation.z = -0.5; g.add(arm);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 10), toon({ color: 0xc8382a, gloss: 0.5 })); grip.position.set(0.42, 0.66, 0); grip.rotation.z = 1.07; g.add(grip);
  return g;
}

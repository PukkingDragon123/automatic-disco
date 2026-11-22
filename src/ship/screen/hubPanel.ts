// A room's functions over the SHIP HUB itself (the hub is the main menu before any landing): using a room unfolds a
// kit machine panel on the right of the cutaway with the room's purpose, its functions on push keys, what the picked
// one does and its panel (the same panels as the SHIP screen: the bridge's MONITOR globe and DEPLOY, the crew's cards,
// the medbay...). It replaces the old hardware consoles and the hologram. Esc or BACK folds it away.
import type { RoomId } from '../hub/layout';
import { ROOMS } from '../hub/layout';
import { ROOM_FNS, FN, FN_DESC, ROOM_NAME, ROOM_PURPOSE, fnOpen, type FnId } from './gates';
import { shipCSS, div } from './ui';
import { PANELS, type Panel } from './panels';
import { panel, pkey, section, para, status, hideTip, type Panel as KPanel } from '../../ui/kit/panel';
import { uiSfx } from '../../ui/kit/sound';
import { onFrame, tween, ease, shake } from '../../ui/kit/juice';
import { portraitRenderer } from '../../social/portrait';

export class HubPanel {
  static current: HubPanel | null = null;
  readonly el: HTMLDivElement;
  private box: KPanel; private body: HTMLDivElement;
  private panel: Panel | null = null; private fn: FnId | null = null;
  private off: (() => void)[] = [];
  private done = false;
  constructor(readonly hub: any, readonly room: RoomId, fn?: FnId) {
    HubPanel.current = this; (window as unknown as { __hubPanel?: HubPanel }).__hubPanel = this;
    shipCSS();
    if (hub?.engine?.renderer) portraitRenderer(hub.engine.renderer);
    this.el = div('s7'); this.el.style.background = 'linear-gradient(90deg, rgba(8,9,12,0) 40%, rgba(8,9,12,.5))';
    this.box = panel({ title: ROOM_NAME[room], tone: 'gun', lamps: ['green', 'amber'], toggles: 2 });
    const W = Math.min(640, innerWidth - 40);
    Object.assign(this.box.el.style, { position: 'absolute', right: '16px', top: '16px', width: W + 'px', height: innerHeight - 32 + 'px' });
    this.el.append(this.box.el);
    this.body = div('', this.box.body); this.body.style.height = '100%'; this.body.style.overflow = 'hidden auto'; this.box.body.style.height = '100%';
    const back = pkey('BACK  [ESC]', () => this.close(), { tone: 'red', lamp: false, sound: 'back' });
    Object.assign(back.style, { position: 'absolute', right: '30px', top: '20px' }); this.el.append(back);
    document.body.append(this.el);
    hub?.lockInput?.(true);
    this.open(fn && ROOM_FNS[room].includes(fn) ? fn : ROOM_FNS[room][0]);
    this.box.el.style.transform = `translateX(${W + 60}px)`;
    void tween(480, (k) => { this.box.el.style.transform = `translateX(${Math.round((1 - k) * (W + 60))}px)`; }, ease.outBack).then(() => { this.box.el.style.transform = ''; uiSfx('metalClose', 0.4); });
    uiSfx('swishIn', 0.6);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!this.panel?.back?.()) this.close(); } };
    addEventListener('keydown', key, true); this.off.push(() => removeEventListener('keydown', key, true));
    this.off.push(onFrame((dt) => { if (this.done) return false; this.panel?.update?.(dt); return true; }) as unknown as () => void);
  }
  private open(f: FnId) {
    this.fn = f;
    this.panel?.dispose(); this.panel = null;
    const b = this.body; b.replaceChildren();
    const game = this.hub?.game ?? null;
    b.append(section(ROOM_NAME[this.room], `DECK ${ROOMS[this.room].code}`), para(ROOM_PURPOSE[this.room], { dim: true }));
    const keys = div('s7-keys', b);
    for (const g of ROOM_FNS[this.room]) {
      const open = fnOpen(game, this.room, g);
      const k = pkey(FN[g].name + (open ? '' : ' (LOCKED)'), () => { if (g === this.fn) return; uiSfx('tab', 0.6); this.open(g); }, { tone: g === f ? 'yellow' : 'cream', lamp: open ? (g === f ? 'green' : 'amber') : 'red', sound: 'tab' });
      k.setOn(g === f); keys.append(k);
    }
    b.append(section(FN[f].name), para(FN_DESC[f]));
    const host = div('s7-fnhost', b);
    if (!fnOpen(game, this.room, f)) { host.append(status(`${FN[f].name} is locked on this save.`, 'warn').el); return; }
    try { this.panel = PANELS[f]({ game, host, w: this.box.body.clientWidth, h: 600, room: this.room, hub: this.hub, close: () => this.close(), shake: (k) => shake(this.box.el, 3 * k, 260) }); }
    catch (e) { console.error('hub panel', f, e); this.panel = null; }
  }
  close() {
    if (this.done) return;
    uiSfx('swishOut', 0.5); hideTip();
    const W = this.box.el.offsetWidth;
    void tween(300, (k) => { this.box.el.style.transform = `translateX(${Math.round(k * k * (W + 60))}px)`; }, ease.inCubic).then(() => this.dispose());
  }
  dispose() {
    if (this.done) return; this.done = true;
    this.panel?.dispose(); this.panel = null;
    for (const f of this.off) try { f(); } catch { /* */ }
    this.box.dispose(); this.el.remove();
    this.hub?.lockInput?.(false);
    if (HubPanel.current === this) HubPanel.current = null;
    const w = window as unknown as { __hubPanel?: HubPanel }; if (w.__hubPanel === this) delete w.__hubPanel;
  }
}
export function openHubPanel(hub: any, room: RoomId, fn?: FnId): HubPanel {
  HubPanel.current?.dispose();
  return new HubPanel(hub, room, fn);
}

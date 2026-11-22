// The ship's function panels: compact textured panels, each with its own 3D element (the bridge's globe, the crew's
// portraits rendered from their rigs, the supply crates, the medbay's kit), opened in the SHIP screen's function bay
// (or over the hub, src/ship/screen/hubPanel.ts).
import type { RoomId } from '../../hub/layout';
import type { FnId } from '../gates';
import { monitorPanel } from './monitor';
import { crewPanel } from './crew';
import { supplyPanel } from './supply';
import { medbayPanel } from './medbay';
import { ordersPanel, studyPanel, powerPanel, podsPanel, corePanel } from './misc';

export interface PanelCtx {
  game: any | null; host: HTMLElement;
  /** the panel's size in art px */
  w: number; h: number;
  room: RoomId; hub: any | null;
  close(): void;
  /** a jolt of the whole frame (heavy actions) */
  shake(k: number): void;
}
export interface Panel {
  update?(dt: number): void;
  /** Esc / right click: return true when the panel stepped back itself */
  back?(): boolean;
  dispose(): void;
}
export type PanelMaker = (ctx: PanelCtx) => Panel;
export const PANELS: Record<FnId, PanelMaker> = {
  monitor: monitorPanel, crew: crewPanel, supply: supplyPanel, heal: medbayPanel,
  orders: ordersPanel, study: studyPanel, power: powerPanel, pods: podsPanel, core: corePanel,
};

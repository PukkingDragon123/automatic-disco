// TOOL MODELS · THE LIVE MODEL. A ToolModel is a THREE.Group (so the UI kit's ModelView, snapshot and fitRoot take it
// as is) that also carries `root` (itself) and `update(dt, state)`: every tool's working parts run off three smoothed
// drives, ACT (spinning up to work, 0..1), CHG (charging, 0..1) and HEAT (a slow follower of act), and the upgrade
// LEVEL (1..3) shows the parts each level adds. `userData.update(dt)` lets the kit's views drive it with no wiring.
import * as THREE from 'three';
import { Kit, type Callout, type Livery, type Lod, smooth, clamp01 } from './kit';

export type ToolMode = 'idle' | 'active' | 'charging';
/** what the model shows: idle, working, charging (charge 0..1 when the caller knows it), and the upgrade level 1..3 */
export interface ToolState { mode?: ToolMode; level?: number; charge?: number | null }
export interface AnimIn {
  t: number; dt: number;
  /** working drive 0..1 (spins up fast, runs down slower) */
  act: number;
  /** charge 0..1 (charging mode builds it, active holds it, idle drains it) */
  chg: number;
  /** a slow follower of act (coils glow, fins tick) */
  heat: number;
  level: number; mode: ToolMode;
}
export type ToolAnim = (a: AnimIn) => void;
export interface ToolSpec {
  id: string; name: string; livery: Livery;
  /** build the parts under root; return the animation */
  build(k: Kit, root: THREE.Group): ToolAnim;
  /** the frozen pose for still renders (icons): act, chg, heat, t */
  pose?: Partial<AnimIn>;
  /** the icon's camera: yaw, pitch, roll (a long tool lies on the diagonal) */
  icon?: { yaw?: number; pitch?: number; roll?: number };
}
export class ToolModel extends THREE.Group {
  readonly toolId: string; readonly lod: Lod; animated: boolean;
  /** named components (for callouts) */
  readonly callouts: Callout[];
  readonly state: { mode: ToolMode; level: number; charge: number | null } = { mode: 'idle', level: 1, charge: null };
  private readonly anim: ToolAnim;
  private readonly gated: { obj: THREE.Object3D; lvl: number }[];
  private readonly a: AnimIn = { t: 0, dt: 0, act: 0, chg: 0, heat: 0, level: 1, mode: 'idle' };
  constructor(spec: ToolSpec, lod: Lod, o: { animated?: boolean; level?: number; state?: ToolState } = {}) {
    super();
    this.toolId = spec.id; this.lod = lod; this.animated = o.animated ?? lod !== 'icon';
    this.name = 'tool:' + spec.id;
    const k = new Kit(lod, spec.livery);
    const body = new THREE.Group(); body.name = 'body'; this.add(body);
    this.anim = spec.build(k, body);
    this.callouts = k.callouts; this.gated = k.gated;
    this.a.t = Math.random() * 10;
    this.setState({ level: o.level ?? 1, ...(o.state ?? {}) });
    // a still pose (and the first frame of a live one)
    const ps = spec.pose ?? {};
    const still = { ...this.a, act: ps.act ?? 0.6, chg: ps.chg ?? 0.5, heat: ps.heat ?? 0.5, t: ps.t ?? 1.37, dt: 1 / 30 };
    if (!this.animated) this.anim(still); else { this.anim({ ...this.a, dt: 0 }); }
    this.userData.update = (dt: number) => this.update(dt);
    this.userData.toolModel = true;
    this.userData.iconPose = spec.icon ?? {};
  }
  get root(): THREE.Group { return this; }
  setState(s: ToolState | ToolMode | number) {
    const st = typeof s === 'string' ? { mode: s } : typeof s === 'number' ? { level: s } : s;
    if (st.mode) this.state.mode = st.mode;
    if (st.charge !== undefined) this.state.charge = st.charge;
    if (st.level !== undefined) {
      const l = Math.max(1, Math.min(3, Math.round(st.level) || 1));
      if (l !== this.state.level || !this.levelSet) { this.state.level = l; this.levelSet = true; for (const g of this.gated) g.obj.visible = l >= g.lvl; }
    }
    return this;
  }
  private levelSet = false;
  /** advance the working parts (dt in seconds); state is optional (a mode, a level, or both) */
  update(dt: number, state?: ToolState | ToolMode | number) {
    if (state !== undefined) this.setState(state);
    if (!this.animated) return;
    dt = Math.min(0.1, Math.max(0, dt));
    const a = this.a, s = this.state;
    a.t += dt; a.dt = dt; a.mode = s.mode; a.level = s.level;
    a.act = smooth(a.act, s.mode === 'active' ? 1 : 0, dt, 3.2, 1.1);
    const cg = s.charge != null ? clamp01(s.charge) : s.mode === 'charging' ? 1 : s.mode === 'active' ? Math.max(a.chg, 0.7) : 0;
    a.chg = smooth(a.chg, cg, dt, s.mode === 'charging' && s.charge == null ? 0.9 : 6, 0.8);
    a.heat = smooth(a.heat, Math.max(a.act, a.chg * 0.4), dt, 0.55, 0.22);
    this.anim(a);
  }
}

// TOOL MODELS (tool models agent): a detailed sci-fi 3D model of every colony tool, each with real working parts that
// animate (see V7.md "TOOL MODELS"). Import from 'src/tools/models'.
//   buildToolModel(id, { lod, animated, level, state }) -> ToolModel (a THREE.Group: .root, .update(dt, state),
//        .setState(s), .callouts) or null for an unknown id. lod 'icon' | 'hud' | 'hero' (the UI kit's toon look) |
//        'world' (lit G-buffer materials for the game's post outline pass).
//   toolIcon(id, size, o) -> a cached outlined pixel-art icon canvas (3/4 view, black outline, rim light).
//   TOOL_MODEL_IDS, toolModelName(id)
// The UI kit picks buildToolModel up on its own (src/ui/kit/models.ts `toolModel`), so the tool widget, the arsenal
// and the research tree show these models.
import type * as THREE from 'three';
import { ToolModel, type ToolSpec, type ToolState, type ToolMode } from './model';
import type { Lod } from './kit';
import { DRILL } from './drill';
import { SCANNER } from './scanner';
import { GRAB } from './grab';
import { WELD } from './weld';
import { CANNON } from './cannon';
import { SAMPLER } from './sampler';
import { SEEDER } from './seeder';
import { LIFT } from './lift';
import { CARRY } from './carry';

export { ToolModel, type ToolState, type ToolMode, type Lod };
export const TOOL_SPECS: Record<string, ToolSpec> = { scanner: SCANNER, sampler: SAMPLER, seeder: SEEDER, grab: GRAB, drill: DRILL, weld: WELD, lift: LIFT, cannon: CANNON, carry: CARRY };
/** every tool id in the game's order (src/colony/tools.ts TOOL_ORDER) */
export const TOOL_MODEL_IDS = ['scanner', 'sampler', 'seeder', 'grab', 'drill', 'weld', 'lift', 'cannon', 'carry'];
const ALIAS: Record<string, string> = {
  welder: 'weld', torch: 'weld', repair: 'weld', gravity: 'grab', thrower: 'grab', grabber: 'grab', gravgrab: 'grab', planter: 'seeder', seed: 'seeder', seeds: 'seeder',
  massdriver: 'cannon', gun: 'cannon', winch: 'carry', hook: 'carry', tractor: 'lift', field: 'lift', liftfield: 'lift', coredrill: 'drill', scan: 'scanner', sample: 'sampler',
};
export const toolModelId = (id: string): string | null => { const k = String(id ?? '').toLowerCase().replace(/^tool[_:-]/, '').replace(/[^a-z]/g, ''); if (TOOL_SPECS[k]) return k; const a = ALIAS[k]; return a && TOOL_SPECS[a] ? a : null; };
export const toolModelName = (id: string) => TOOL_SPECS[toolModelId(id) ?? '']?.name ?? id;
export interface BuildOpts { lod?: Lod | number; animated?: boolean; level?: number; state?: ToolState }
/**
 * build a tool's model. lod: 'icon' (fewest parts, still), 'hud' (the arsenal and the widget), 'hero' (every bolt),
 * 'world' (lit materials writing the G-buffer outline bit). Animated models move on `update(dt, state)` (the UI kit's
 * views call `userData.update(dt)` every frame they draw); state is 'idle' | 'active' | 'charging', a level 1..3,
 * or { mode, level, charge }.
 */
export function buildToolModel(id: string, o: BuildOpts = {}): ToolModel | null {
  const k = toolModelId(id); if (!k) return null;
  const lod: Lod = typeof o.lod === 'number' ? (o.lod <= 0 ? 'icon' : o.lod === 1 ? 'hud' : 'hero') : o.lod ?? 'hud';
  return new ToolModel(TOOL_SPECS[k], lod, { animated: o.animated, level: o.level, state: o.state });
}
/** drive every tool model under a root (for a scene that holds several) */
export function updateToolModels(root: THREE.Object3D, dt: number, state?: ToolState | ToolMode | number) {
  root.traverse((n) => { if ((n as ToolModel).userData?.toolModel) (n as ToolModel).update(dt, state); });
}
/**
 * drive every tool model mounted under a UI root (a turret, a cradle, a bay) from a view's anim callback: t is the
 * view's clock; state is one for all, or a function of the model and its turret slot (a holder named 'tool<i>')
 */
export function driveToolModels(root: THREE.Object3D, t: number, state?: ToolState | ToolMode | number | ((m: ToolModel, slot: number) => ToolState | ToolMode | number | undefined)) {
  const u = root.userData, last = (u.__tmT as number) ?? t; u.__tmT = t;
  const dt = Math.min(0.1, Math.max(0, t - last));
  let list = u.__tmList as { m: ToolModel; slot: number }[] | undefined;
  if (!list || !list.length || t - ((u.__tmScan as number) ?? -9) > 2) {
    list = []; u.__tmScan = t;
    root.traverse((n) => { if (!n.userData?.toolModel) return; let p: THREE.Object3D | null = n, slot = -1; while (p) { const m = /^tool(\d)$/.exec(p.name); if (m) { slot = Number(m[1]); break; } p = p.parent; } list!.push({ m: n as ToolModel, slot }); });
    u.__tmList = list;
  }
  for (const e of list) e.m.update(dt, typeof state === 'function' ? state(e.m, e.slot) : state);
}
import { bindIconBuilder } from './icon';
bindIconBuilder((id, level) => buildToolModel(id, { lod: 'icon', level, animated: false }));
export { toolIcon, toolIconURL, renderIcon, disposeIconRenderer } from './icon';

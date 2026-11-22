// UI KIT · SOUND. Recorded CC0 samples only (ported from Limbophobia; Kenney's "Interface Sounds" and "51 UI sound
// effects", rubberduck's metal, wood, breaking and footstep packs, TinyWorlds' steps, OwlishMedia, bart; see
// CREDITS.md). Files live in public/sfx/ui/. Each kind picks a random variant with a little pitch jitter, through
// one shared AudioContext that follows the player's master and SFX volume (src/settings.ts).
//   uiSfx(kind, vol = 1, rate = 1)       play a UI sound
//   thudSfx(weight)                      a placement thud scaled by weight (0 light .. 1 very heavy)
//   preloadUiSfx()                       decode everything (called on the first gesture)
import { settings } from '../../settings';

export type UiSfx =
  | 'hover' | 'tick' | 'click' | 'select' | 'confirm' | 'back' | 'open' | 'close' | 'error' | 'toggle' | 'tab' | 'switch'
  | 'swishIn' | 'swishOut' | 'shutter' | 'scroll' | 'pluck' | 'glitch' | 'bong' | 'scratch'
  | 'thudLight' | 'thudHeavy' | 'dirt' | 'gravel' | 'metal' | 'metalClose' | 'slam' | 'glass' | 'winch' | 'creak' | 'chain' | 'clunk';
const F: Record<UiSfx, [string[], number, number?]> = {
  hover: [['ui_tick_1', 'ui_tick_2'], 0.35, 1.1],
  tick: [['ui_tick_1', 'ui_tick_2', 'ui_tick_3'], 0.45],
  click: [['ui_click_1', 'ui_click_2', 'ui_click_3'], 0.7],
  select: [['ui_select_1', 'ui_select_2'], 0.6],
  confirm: [['ui_confirm_1', 'ui_confirm_2', 'ui_confirm_3', 'ui_confirm_4'], 0.55],
  back: [['ui_back_1'], 0.6],
  open: [['ui_open_1'], 0.6],
  close: [['ui_close_1'], 0.6],
  error: [['ui_error_1', 'ui_error_2', 'ui_error_3', 'ui_error_4'], 0.55],
  toggle: [['ui_toggle_1', 'ui_toggle_2'], 0.6],
  tab: [['ui_switch_1', 'ui_switch_2', 'ui_switch_3'], 0.5],
  switch: [['switch_1', 'switch_2', 'switch_3', 'ui_sw_1', 'ui_sw_2', 'ui_sw_3', 'ui_sw_4'], 0.6],
  swishIn: [['ui_max_1', 'ui_max_2'], 0.5],
  swishOut: [['ui_min_1', 'ui_min_2'], 0.5],
  shutter: [['camera_1', 'camera_2'], 0.55],
  scroll: [['ui_scroll_1', 'ui_scroll_2', 'ui_scroll_3'], 0.45],
  pluck: [['ui_pluck_1', 'ui_pluck_2'], 0.5],
  glitch: [['ui_glitch_1', 'ui_glitch_2', 'ui_glitch_3', 'ui_glitch_4'], 0.4],
  bong: [['ui_bong_1'], 0.5],
  scratch: [['ui_scratch_1', 'ui_scratch_2'], 0.45],
  thudLight: [['hit_1', 'hit_2'], 0.6],
  thudHeavy: [['hit_3', 'hit_4', 'fall_1', 'fall_2', 'fall_3'], 0.7],
  dirt: [['fs_dirt_1', 'fs_dirt_2', 'fs_dirt_3'], 0.7],
  gravel: [['fs_gravel_1', 'fs_gravel_2', 'fs_gravel_3'], 0.6],
  metal: [['metalhit_1', 'metalhit_2', 'metalhit_3', 'metalhit_4'], 0.5],
  metalClose: [['metalclose_1', 'metalclose_2'], 0.55],
  slam: [['metalslam_1', 'metalslam_2'], 0.55],
  glass: [['glassclink_1', 'glassclink_2', 'glassclink_3'], 0.5],
  winch: [['winch_1', 'winch_2'], 0.45],
  creak: [['creak_1', 'creak_2', 'creak_3'], 0.4],
  chain: [['chain_1', 'chain_2'], 0.45],
  clunk: [['metalclose_1', 'hit_1'], 0.55],
};
const BASE = (import.meta.env.BASE_URL ?? '/') + 'sfx/ui/';
let ctx: AudioContext | null = null, out: GainNode | null = null;
const bufs = new Map<string, AudioBuffer | null>(), loading = new Map<string, Promise<AudioBuffer | null>>();
const last: Partial<Record<UiSfx, number>> = {};

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC: typeof AudioContext = (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    out = ctx.createGain(); out.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}
function load(name: string): Promise<AudioBuffer | null> {
  let p = loading.get(name);
  if (p) return p;
  const c = context();
  p = !c ? Promise.resolve(null) : fetch(BASE + name + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((ab) => c.decodeAudioData(ab)).then((b) => { bufs.set(name, b); return b; }).catch(() => { bufs.set(name, null); return null; });
  loading.set(name, p);
  return p;
}
let preloaded = false;
export function preloadUiSfx() { if (preloaded || !context()) return; preloaded = true; for (const [files] of Object.values(F)) for (const f of files) void load(f); }
const resume = () => { const c = context(); if (c && c.state !== 'running') c.resume().catch(() => {}); preloadUiSfx(); };
for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchend']) addEventListener(ev, resume, { capture: true });

/** play a UI sound (vol 0..1.5, rate = pitch) */
export function uiSfx(kind: UiSfx, vol = 1, rate = 1) {
  const c = context(); if (!c || !out) return;
  const now = performance.now();
  if ((last[kind] ?? 0) > now - 35) return;
  last[kind] = now;
  const [files, gain, r0] = F[kind];
  const name = files[Math.floor(Math.random() * files.length)];
  const v = vol * gain * settings.master * settings.sfx;
  if (v < 0.003 || c.state !== 'running') { void load(name); return; }
  const go = (b: AudioBuffer | null) => {
    if (!b || !out) return;
    const s = c.createBufferSource(); s.buffer = b;
    s.playbackRate.value = rate * (r0 ?? 1) * (1 + (Math.random() - 0.5) * 0.07);
    const g = c.createGain(); g.gain.value = v;
    s.connect(g); g.connect(out); s.start();
  };
  const b = bufs.get(name);
  if (b !== undefined) go(b);
  else { const t0 = performance.now(); void load(name).then((bb) => { if (performance.now() - t0 < 300) go(bb); }); }
}
/** a placement thud scaled by weight (0 light .. 1 very heavy): a knock, the ground settling, a lower pitch for heavy */
export function thudSfx(weight: number, ground: 'dirt' | 'gravel' | 'metal' = 'dirt') {
  const w = Math.max(0, Math.min(1, weight));
  uiSfx(w > 0.45 ? 'thudHeavy' : 'thudLight', 0.45 + w * 0.7, 1.25 - w * 0.5);
  uiSfx(ground, 0.35 + w * 0.6, 1.1 - w * 0.35);
}

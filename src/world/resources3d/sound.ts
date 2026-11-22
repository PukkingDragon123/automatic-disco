// The sound of a resource landing: recorded CC0 impacts only (rubberduck's wood, breaking and water packs from
// OpenGameArt, by way of Limbophobia; credited in CREDITS.md), files in public/sfx/res/, plus the UI kit's own
// recorded thuds, dirt, gravel, metal and glass. Louder and lower for heavier loads; quiet with distance.
import { settings } from '../../settings';
import { uiSfx } from '../../ui/kit/sound';
import type { Sound } from './forms';

const FILES: Record<'wood' | 'rock' | 'splash' | 'plop' | 'metal', string[]> = {
  wood: ['woodhit_1', 'woodhit_2', 'woodhit_3', 'woodfall_1'], rock: ['rockhit_1', 'rockhit_2', 'rockhit_3'],
  splash: ['splash_1'], plop: ['plop_1', 'plop_2'], metal: ['metalfall_1'],
};
const BASE = (import.meta.env.BASE_URL ?? '/') + 'sfx/res/';
let ctx: AudioContext | null = null;
const bufs = new Map<string, AudioBuffer | null>(), loading = new Map<string, Promise<AudioBuffer | null>>();
function context() {
  if (ctx) return ctx;
  try { ctx = new AudioContext({ latencyHint: 'interactive' }); } catch { ctx = null; }
  return ctx;
}
function load(name: string) {
  let p = loading.get(name); if (p) return p;
  const c = context();
  p = !c ? Promise.resolve(null) : fetch(BASE + name + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((ab) => c.decodeAudioData(ab)).then((b) => { bufs.set(name, b); return b; }).catch(() => { bufs.set(name, null); return null; });
  loading.set(name, p);
  return p;
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { const c = context(); if (c && c.state !== 'running') c.resume().catch(() => {}); for (const fs of Object.values(FILES)) for (const f of fs) void load(f); }, { capture: true, once: true });
const last = new Map<string, number>();
function play(kind: keyof typeof FILES, vol: number, rate: number) {
  const c = context(); if (!c) return;
  const now = performance.now(); if ((last.get(kind) ?? 0) > now - 45) return; last.set(kind, now);
  const fs = FILES[kind], name = fs[Math.floor(Math.random() * fs.length)];
  const v = vol * settings.master * settings.sfx;
  if (v < 0.003 || c.state !== 'running') { void load(name); return; }
  const go = (b: AudioBuffer | null) => {
    if (!b) return;
    const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.08);
    const g = c.createGain(); g.gain.value = v; s.connect(g); g.connect(c.destination); s.start();
  };
  const b = bufs.get(name);
  if (b !== undefined) go(b); else { const t0 = now; void load(name).then((bb) => { if (performance.now() - t0 < 250) go(bb); }); }
}
/** a resource landing: its material's impact, scaled by weight 0..1 and audibility 0..1 */
export function landSfx(s: Sound, weight: number, aud = 1) {
  const w = Math.max(0, Math.min(1, weight)), v = (0.35 + w * 0.65) * aud, low = 1.15 - w * 0.4;
  if (v < 0.02) return;
  switch (s) {
    case 'wood': play('wood', v * 0.8, low); if (w > 0.4) uiSfx('thudHeavy', v * 0.5, low); break;
    case 'stone': play('rock', v * 0.75, low); uiSfx('gravel', v * 0.35, low); break;
    case 'gravel': uiSfx('gravel', v * 0.9, low); play('rock', v * 0.3, low * 1.2); break;
    case 'dirt': uiSfx('dirt', v * 0.9, low); uiSfx('thudLight', v * 0.4, low); break;
    case 'metal': uiSfx('metal', v * 0.7, low); if (w > 0.35) play('metal', v * 0.5, low); break;
    case 'glass': uiSfx('glass', v * 0.7, 1.1); break;
    case 'liquid': play('splash', v * 0.5, low); play('plop', v * 0.4, 1); break;
    default: uiSfx('thudLight', v * 0.6, low * 1.1); play('plop', v * 0.25, 0.8); break;
  }
}

// BUILD MODE JUICE: the blueprint mode's little physical reactions, on the UI CORE kit (src/ui/kit: recorded CC0
// sounds, the placement dust, the bitmap Alagard). This file only maps the build mode's words onto the kit and adds the
// two curves the drops use.
//   play(name, rate?, vol?)       'drop' 'thud' 'dirt' 'lift' 'turn' 'open' 'close' 'tick' 'deny' 'pick' 'confirm'
//                                 'swoosh' 'swooshOut' 'paper' 'lock' 'clink' 'creak' (kit uiSfx kinds underneath)
//   placeDust(x, y, weight, o?)   the kit's dust ring at a screen point; weight here is the build weight 0.25 .. 3
//   squash(t, weight)             the squash-and-stretch of a landing [sxz, sy] (t = 0 at touch-down)
import { uiSfx, type UiSfx } from '../kit/sound';
import { placeDust as kitDust } from '../kit/juice';

export const ease = {
  out3: (t: number) => 1 - (1 - t) ** 3,
  in3: (t: number) => t * t * t,
  inOut3: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
};
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** squash and stretch for a drop that lands at t = 0: [sxz, sy] (stretched while it falls, settles by 0.55 s) */
export function squash(t: number, weight = 1): [number, number] {
  if (t < 0) return [0.93, 1.1];
  if (t > 0.55) return [1, 1];
  const a = Math.min(1.4, 0.5 + weight * 0.35);
  const e = Math.exp(-t * 7.5) * Math.cos(t * 26);
  return [1 + 0.16 * a * e, 1 - 0.24 * a * e];
}

const MAP: Record<string, [UiSfx, number, number]> = {
  drop: ['thudLight', 1, 1], thud: ['thudHeavy', 1, 1], dirt: ['dirt', 0.8, 1],
  lift: ['pluck', 0.9, 1], turn: ['switch', 0.8, 1], open: ['swishIn', 0.9, 1], close: ['swishOut', 0.9, 1],
  tick: ['tick', 0.6, 1.1], deny: ['error', 0.8, 1], pick: ['select', 0.8, 1], confirm: ['confirm', 0.8, 1],
  swoosh: ['swishIn', 1, 0.8], swooshOut: ['swishOut', 1, 0.8], paper: ['scratch', 0.8, 1], lock: ['metalClose', 0.8, 1],
  clink: ['metal', 0.9, 1], creak: ['creak', 0.7, 1], winch: ['winch', 0.7, 1], clunk: ['clunk', 0.8, 1],
};
/** a recorded UI sound (rate = pitch) */
export function play(name: string, rate = 1, vol = 0.6) {
  const m = MAP[name]; if (!m) return;
  uiSfx(m[0], vol * m[1] * 1.6, rate * m[2]);
}
/** the build weight (0.25 a fence post .. 3 a smelter) on the kit's 0..1 scale */
export const w01 = (w: number) => clamp01((w - 0.2) / 2.4);
/** the dust ring at a screen point (the kit plays the thud with it) */
export function placeDust(x: number, y: number, weight: number, o: { ground?: 'dirt' | 'sand' | 'stone' | 'snow' | 'ash' | 'moss' | 'metal' | 'clay'; sound?: boolean; scale?: number } = {}) {
  kitDust(x, y, w01(weight), { ground: o.ground ?? 'dirt', sound: o.sound, scale: o.scale });
}

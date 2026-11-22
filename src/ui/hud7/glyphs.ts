// HUD v7 · PAINTED GLYPHS. Small pixel-art sprites drawn as char maps (one letter per colour), grown with EPX where
// a smoother curve helps, then lit by the kit's sprite shader (bevelled height, warm lights, cool shadows, a lit lip,
// an ink outline): the time keys, the battery and the oxygen bottle, the sol dial's sun and moon, and the map's
// landmark icons (peaks, falls, springs, caves, passes, vents, ore and crystal, the pod, ruins, rival towers).
import { Px, P, shadeSprite, stamp, upscaleRows, INK } from '../kit/px';

const cache = new Map<string, Px>();
function make(key: string, rows: string[], pal: Record<string, number>, o: { up?: number; light?: number; bevel?: number; pad?: number; outline?: boolean } = {}): Px {
  const hit = cache.get(key); if (hit) return hit;
  const r = o.up ? upscaleRows(rows, o.up) : rows, pad = o.pad ?? 1;
  const W = Math.max(...r.map((s) => s.length)) + pad * 2, H = r.length + pad * 2;
  const p = new Px(W, H);
  stamp(p, r, pal, pad, pad);
  shadeSprite(p, { light: o.light ?? 1, bevel: o.bevel, outline: o.outline });
  cache.set(key, p);
  return p;
}
const BR = { b: P.brass[4], d: P.brass[2], l: P.brass[5] }, ST = { s: P.steel[4], d: P.steel[2], l: P.steel[5] };

// ------------------------------------------------------------------ time keys
export function timeGlyph(kind: 'pause' | 'x1' | 'x2' | 'x3', on: boolean): Px {
  const c = on ? P.glowAmber[3] : P.bone[3];
  const pal = { a: c, b: on ? P.glowAmber[1] : P.bone[1] };
  const tri = ['a.....', 'aaa...', 'aaaaa.', 'aaaaaa', 'aaaaa.', 'aaa...', 'a.....'];
  let rows: string[];
  if (kind === 'pause') rows = ['aa.aa', 'aa.aa', 'aa.aa', 'aa.aa', 'aa.aa', 'aa.aa', 'aa.aa'];
  else { const n = kind === 'x1' ? 1 : kind === 'x2' ? 2 : 3; rows = tri.map((r) => Array.from({ length: n }, () => r).join('').replace(/\.+$/, '')); }
  return make(`t|${kind}|${on}`, rows, pal, { up: 2, bevel: 2 });
}

// ------------------------------------------------------------------ gauges
/** a battery with five cells lit to frac (ramp by level) */
export function batteryGlyph(frac: number, level: 'ok' | 'warn' | 'crit', blink = false): Px {
  const key = `bat|${Math.round(frac * 5)}|${level}|${blink}`;
  const hit = cache.get(key); if (hit) return hit;
  const W = 12, H = 22, p = new Px(W + 2, H + 2);
  const L = level === 'ok' ? P.malachite : level === 'warn' ? P.ochre : P.ruby;
  // the terminal cap and the casing
  p.rect(5, 1, 4, 2, P.steel[4]); p.set(5, 1, P.steel[5]);
  for (let y = 3; y < H + 1; y++) for (let x = 1; x < W + 1; x++) { const edge = x === 1 || x === W || y === 3 || y === H; p.set(x, y, edge ? (x === 1 || y === 3 ? P.steel[5] : P.steel[2]) : P.ink[1]); }
  const n = Math.round(frac * 5);
  for (let i = 0; i < 5; i++) {
    const on = i < n && !(blink && i === n - 1), y = H - 3 - i * 4;
    p.rect(3, y, W - 4, 3, on ? L[Math.min(L.length - 1, 4)] : P.ink[2]);
    if (on) { p.hl(3, W - 2, y, L[Math.min(L.length - 1, 6)]); p.hl(3, W - 2, y + 2, L[2]); }
  }
  p.vl(2, 4, H - 1, P.steel[3]);
  p.outline(INK);
  cache.set(key, p);
  return p;
}
/** an oxygen bottle with a sight glass showing the level */
export function o2Glyph(frac: number, level: 'ok' | 'warn' | 'crit'): Px {
  const q = Math.round(frac * 12), key = `o2|${q}|${level}`;
  const hit = cache.get(key); if (hit) return hit;
  const W = 12, H = 24, p = new Px(W + 2, H + 2), body = level === 'crit' ? P.ruby : P.sky;
  p.rect(5, 1, 4, 3, P.brass[4]); p.set(5, 1, P.brass[5]); p.rect(9, 2, 3, 1, P.brass[3]);
  for (let y = 4; y < H + 1; y++) for (let x = 1; x < W + 1; x++) {
    const u = (x - 1) / (W - 1), cap = (y - 4 < 2 || H - y < 1) && (x === 1 || x === W);
    if (cap) continue;
    p.set(x, y, body[u < 0.2 ? 4 : u < 0.5 ? 5 : u < 0.8 ? 3 : 2]);
  }
  // the sight glass
  const g0 = 8, g1 = H - 2, lv = Math.round(g1 - (g1 - g0) * (q / 12));
  for (let y = g0; y < g1; y++) { p.set(5, y, y >= lv ? P.water[5] : P.ink[1]); p.set(6, y, y >= lv ? P.water[6] : P.ink[1]); p.set(7, y, y >= lv ? P.water[4] : P.ink[2]); }
  p.hl(5, 7, g0 - 1, P.steel[1]); p.hl(5, 7, g1, P.steel[1]);
  p.outline(INK);
  cache.set(key, p);
  return p;
}

// ------------------------------------------------------------------ the map's landmark icons (about 11 x 11 lit)
type Mark = 'peak' | 'fall' | 'spring' | 'geyser' | 'cave' | 'pass' | 'vent' | 'ore' | 'crystal' | 'pod' | 'wreck' | 'rival' | 'danger' | 'tree' | 'conifer' | 'bush' | 'lake' | 'building' | 'drone' | 'worker' | 'struct' | 'pin' | 'beast';
const MARKS: Record<Mark, [string[], Record<string, number>, number?]> = {
  peak: [['....s....', '...sws...', '..swwrs..', '..srrrr..', '.srrrrdr.', '.rrrdrrd.', 'rrdrrrddr', 'rrrrdddrr'], { s: P.snow[5], w: P.snow[4], r: P.stone[4], d: P.stone[2] }],
  fall: [['rrr.rrr', 'rwwwwwr', 'rwwwwr.', '.wwww..', '.wwww..', '.ffff..', 'ffffff.', 'fwwwwff'], { r: P.stone[3], w: P.water[5], f: 0xe8f4ec }],
  spring: [['..s..s..', '.s..s...', '..s..s..', '.rrrrrr.', 'rwwwwwwr', 'rwwwwwwr', '.rrrrrr.'], { s: 0xe8eee8, r: P.ochre[4], w: P.teal[5] }],
  geyser: [['..www..', '.wwwww.', '..www..', '...w...', '...w...', '.rrwrr.', 'rrrrrrr'], { w: 0xe8f4f8, r: P.ochre[3] }],
  cave: [['..rrrrr..', '.rrrrrrr.', 'rrrkkkrrr', 'rrkkkkkrr', 'rkkkkkkkr', 'rkkkkkkkr'], { r: P.stone[4], k: P.ink[0] }],
  pass: [['m.......m', 'mm.....mm', 'mmm...mmm', 'mmmy.ymmm', 'mmmyyymmm'], { m: P.stone[4], y: P.ochre[5] }],
  vent: [['..s.s..', '.s.s.s.', '..s.s..', '.rrrrr.', 'rrkkkrr', 'rrrrrrr'], { s: P.stone[5], r: P.basalt[4], k: P.rust[5] }],
  ore: [['..ooo...', '.ocooo..', 'oooocoo.', 'ocooooo.', '.oooooc.', '..ooo...'], { o: P.stone[3], c: P.copper[5] }],
  crystal: [['...c...', '..ccl..', '..ccl.c', '.cccl.c', '.ccclcc', 'ccccccc'], { c: P.glowTeal[3], l: P.glowTeal[4] }],
  pod: [['...a...', '..www..', '.wwwww.', 'wwwowww', 'wwwwwww', '.w.w.w.', 'w..w..w'], { w: P.snow[5], o: P.rust[5], a: P.steel[4] }],
  wreck: [['....m...', '..mmmo..', '.mmo.mm.', 'mmm..m..', '.m.mmm..', 'ssssssss'], { m: P.steel[4], o: P.rust[5], s: P.soil[3] }],
  rival: [['..r..', '.rrr.', '..s..', '.sss.', '.sss.', 'sssss', 'sssss'], { r: P.ruby[5], s: P.slate[4] }],
  danger: [['...r...', '..rrr..', '..ryr..', '.rryrr.', '.rrrrr.', 'rrryrrr', 'rrrrrrr'], { r: P.ruby[4], y: P.bone[5] }],
  tree: [['..ggg..', '.ggggg.', 'gggglgg', 'ggggggg', '.ggggg.', '...b...', '...b...'], { g: P.moss[4], l: P.moss[6], b: P.fur[3] }],
  conifer: [['...g...', '..ggg..', '..ggg..', '.ggggg.', '.ggggg.', 'ggggggg', '...b...'], { g: P.sage[3], b: P.fur[3] }],
  bush: [['.ggg.', 'ggggg', 'ggggg'], { g: P.moss[3] }],
  lake: [['.www.', 'wwwww', '.www.'], { w: P.water[5] }],
  building: [['..rrr..', '.rrrrr.', 'rrrrrrr', '.wwwww.', '.wdwww.', '.wdwww.'], { r: P.rust[4], w: P.bone[4], d: P.ink[1] }],
  drone: [['o.....o', '.o...o.', '..www..', '.wwwww.', '..www..', '.o...o.', 'o.....o'], { o: P.steel[4], w: P.ochre[5] }],
  worker: [['..h..', '.hhh.', '..b..', '.bbb.', 'b.b.b', '.b.b.'], { h: P.bone[5], b: P.sapphire[4] }],
  struct: [['..l..', '..s..', '.sss.', '..s..', '..s..', 'sssss'], { l: P.glowAmber[4], s: P.steel[4] }],
  pin: [['.rrr.', 'rrrrr', 'rrwrr', '.rrr.', '..r..', '..r..'], { r: P.ruby[5], w: 0xffffff }],
  beast: [['r...r', '.rrr.', 'rrrrr', 'rkrkr', '.rrr.'], { r: P.coral[4], k: P.ink[0] }],
};
export type MarkKind = Mark;
/** a landmark icon (lit, outlined); up = 2 for the big map */
export function markGlyph(kind: Mark, up = 2): Px {
  const [rows, pal] = MARKS[kind];
  return make(`m|${kind}|${up}`, rows, pal, { up, bevel: up > 1 ? 2 : 1 });
}

/** a padlock (locked things) */
export function lockGlyph(): Px {
  return make('lock', ['.sss.', 's...s', 's...s', 'bbbbb', 'bbkbb', 'bbkbb', 'bbbbb'], { s: P.steel[5], b: P.brass[4], k: P.ink[0] }, { up: 2, bevel: 2 });
}
/** a small wrench (the bench) */
export function wrenchGlyph(): Px {
  return make('wrench', ['ss...ss', 'ss...ss', '.sssss.', '..sss..', '...s...', '...s...', '...s...', '..sss..'], { s: P.steel[5] }, { up: 2 });
}
/** the compass rose for the map */
export function compassGlyph(): Px {
  return make('compass', [
    '......r......', '.....rrr.....', '.....rrr.....', '....brrrb....', '...b.rrr.b...', '..b..rrr..b..', 'sssssscsssss.', '..b..sss..b..', '...b.sss.b...', '....bsssb....', '.....sss.....', '.....sss.....', '......s......',
  ], { r: P.ruby[4], s: P.steel[5], b: P.brass[4], c: P.brass[5] }, { up: 2 });
}
export { BR, ST };

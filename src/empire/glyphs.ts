// EMPIRE · painted glyphs: char maps (one letter per colour) grown with EPX and lit by the kit's sprite shader
// (bevelled height, warm lights, cool shadows, a lit lip, an ink outline), like the HUD's map marks.
//   tierGlyph(tier, up)  the settlement on the map: OUTPOST a mast and a dome tent, TOWN roofs round a mast, CITY towers,
//                        CAPITAL towers under a domed hall with a gold spire
//   blocGlyph(bloc|'you', up)  the emblems: the Concord's hexagon and chevron, the Consortium's wave crest, the UNAA star
//   unitGlyph(kind, up)  what moves on the map: a convoy crawler, a train, a pod, a settler wagon
import { Px, P, shadeSprite, stamp, upscaleRows } from '../ui/kit/px';
import type { Tier, BlocId } from './types';

const cache = new Map<string, Px>();
function make(key: string, rows: string[], pal: Record<string, number>, up = 1, bevel?: number): Px {
  const hit = cache.get(key); if (hit) return hit;
  const r = up > 1 ? upscaleRows(rows, up) : rows;
  const W = Math.max(...r.map((s) => s.length)) + 2, H = r.length + 2, p = new Px(W, H);
  stamp(p, r, pal, 1, 1);
  shadeSprite(p, { bevel: bevel ?? (up > 1 ? 2 : 1) });
  cache.set(key, p);
  return p;
}
const TIER_ROWS: Record<Tier, string[]> = {
  outpost: [
    '....f.....',
    '....ff....',
    '....m.....',
    '....m.....',
    '..wwmww...',
    '.wwwwwww..',
    'wwwwdwwww.',
    'wwwwdwwww.',
    'gggggggggg',
  ],
  town: [
    '.....f.......',
    '.....ff......',
    '.....m.......',
    '..rr.m..rrr..',
    '.rrrrm.rrrrr.',
    'rrrrrrrrrrrrr',
    '.wwww.m.wwww.',
    '.wdww.m.wwdw.',
    '.wwww.m.wwww.',
    'ggggggggggggg',
  ],
  city: [
    '......a.......',
    '.....sss......',
    '..s..sws...s..',
    '.sss.sss..sss.',
    '.sws.sws..sws.',
    '.sss.sss.ssss.',
    'ssssssssssws.s',
    'swssswsssssssw',
    'ssssssssswssss',
    'gggggggggggggg',
  ],
  capital: [
    '.......a.......',
    '.......a.......',
    '.....yyyyy.....',
    '....yyyyyyy....',
    '..s.sssssss.s..',
    '.sss.swsws.sss.',
    '.sws.sssss.sws.',
    'sssssswswssssss',
    'swsssssssssswss',
    'sssswssdssswsss',
    'ggggggggggggggg',
  ],
};
const TIER_PAL: Record<string, number> = { f: P.ruby[5], m: P.steel[5], w: P.bone[5], d: P.ink[1], g: P.soil[3], r: P.rust[4], s: P.steel[4], a: P.gold[6], y: P.gold[5] };
export function tierGlyph(t: Tier, up = 1): Px { return make(`t|${t}|${up}`, TIER_ROWS[t], TIER_PAL, up); }

const BLOC_ROWS: Record<BlocId | 'you', [string[], Record<string, number>]> = {
  soviet: [[
    '...gggg...',
    '..gggggg..',
    '.ggoggogg.',
    'gggooooggg',
    'ggggooggg.',
    'gggggggggg',
    '.gggggggg.',
    '..gggggg..',
    '...gggg...',
  ], { g: P.basalt[4], o: 0xd8743a }],
  prc: [[
    '...wwww...',
    '.wwwwwwww.',
    'wwwttwwwww',
    'wwtwwtwwww',
    'wtwwwwtwtw',
    'wwwwwwwtww',
    '.wwwwwwww.',
    '...wwww...',
  ], { w: P.snow[5], t: 0x3a9a8c }],
  you: [[
    '....yy....',
    '....yy....',
    '.bbyyyybb.',
    'bbbyyyybbb',
    'bbbbyybbbb',
    'bbbyyyybbb',
    '.byy..yyb.',
    '..b....b..',
  ], { y: P.gold[5], b: P.sapphire[3] }],
};
export function blocGlyph(b: BlocId | 'you', up = 1): Px { const [rows, pal] = BLOC_ROWS[b]; return make(`b|${b}|${up}`, rows, pal, up); }

const UNIT_ROWS: Record<string, [string[], Record<string, number>]> = {
  convoy: [['..cccc...', '.cwwccc..', 'ccccccccc', 'ccccccccc', '.k.k..k..'], { c: P.ochre[4], w: P.sky[4], k: P.ink[0] }],
  train: [['.sssssssss.', 'ssbsbsbsbss', 'sssssssssss', '.k.k...k.k.'], { s: P.steel[5], b: P.sapphire[4], k: P.ink[0] }],
  pod: [['...w...', '..www..', '.wwoww.', '.wwwww.', '..f.f..', '..f.f..'], { w: P.snow[5], o: P.rust[5], f: P.glowAmber[4] }],
  settlers: [['..www....', '.wwwww...', 'wwwwwwccc', 'ccccccccc', '.k...k.k.'], { w: P.bone[5], c: P.fur[4], k: P.ink[0] }],
  deal: [['.yyyy.', 'yyddyy', 'yyyyyy', 'yyyyyy', '.yyyy.'], { y: P.gold[5], d: P.gold[2] }],
};
export function unitGlyph(kind: 'convoy' | 'train' | 'pod' | 'settlers' | 'deal', up = 1): Px { const [rows, pal] = UNIT_ROWS[kind]; return make(`u|${kind}|${up}`, rows, pal, up); }

const canv = new WeakMap<Px, HTMLCanvasElement>();
/** the glyph as a canvas (cached) */
export function glyphCv(p: Px): HTMLCanvasElement { let c = canv.get(p); if (!c) { c = p.canvas(); canv.set(p, c); } return c; }
/** a glyph as a crisp element at `scale` css px per art px */
export function glyphEl(p: Px, scale = 2, cls = ''): HTMLCanvasElement {
  const c = p.canvas(); c.style.width = p.w * scale + 'px'; c.style.height = p.h * scale + 'px'; c.style.imageRendering = 'pixelated';
  if (cls) c.className = cls;
  return c;
}

/** the EMPIRE icon: a small planet with its continents, a gold frontier and a ring of orbit */
export function globeGlyph(up = 2): Px {
  return make(`globe|${up}`, [
    '....oooooo....',
    '..oowwbbwwoo..',
    '.owwbbgggbwwo.',
    'owbbgggyggbwwo',
    'obbgggyyyggbbo',
    'obggyyy.ggbbbo',
    'obbgyy..bbbbbo',
    'owbbgg.bbgggbo',
    '.owbbbbbgggbo.',
    '..oobbbbbboo..',
    '....oooooo....',
  ], { o: P.ink[2], w: P.water[6], b: P.water[4], g: P.moss[4], y: P.gold[5] }, up);
}

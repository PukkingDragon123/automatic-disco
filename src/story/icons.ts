// Quest and step icons. Most come from the research atlas (lowpix-painted, src/research/ui/icons.ts); the few it
// lacks (the pod hatch, a bunk, a photo, a gift) are char maps lit by the kit's sprite shader (clean pixel art with a
// 1 px ink outline, light from the upper left). A 'talk' step shows the giver's own face.
import { Px, stamp, shadeSprite, upscaleRows, P } from '../ui/kit/px';
import { iconCanvas } from '../research/ui/icons';
import { portrait } from '../social/portrait';

const ALIAS: Record<string, string> = { lens: 'lens', vial: 'vial', flask: 'flask', plant: 'sapling', hammer: 'wrench', crate: 'crate', arms: 'arms', boot: 'arms', bolt: 'bolt', paw: 'muscle', dna: 'dna', dish: 'sensor', nodes: 'nodes', heart: 'heart' };
const MAPS: Record<string, { rows: string[]; pal: Record<string, number> }> = {
  hatch: { rows: [
    '....aaaaaaaa....', '..aabbbbbbbbaa..', '.abbccccccccbba.', '.abccddddddccba.', 'abccdeeeeeedccba', 'abcdeeffffeedcba', 'abcdeffggffedcba', 'abcdefgghgfedcba',
    'abcdefgghgfedcba', 'abcdeffggffedcba', 'abcdeeffffeedcba', 'abccdeeeeeedccba', '.abccddddddccba.', '.abbccccccccbba.', '..aabbbbbbbbaa..', '....aaaaaaaa....'],
    pal: { a: P.steel[1], b: P.steel[3], c: P.steel[4], d: P.ochre[3], e: P.steel[2], f: P.steel[3], g: P.steel[5], h: P.brass[5] } },
  bunk: { rows: [
    'aa............aa', 'aa............aa', 'aabbbbbbbbbbbbaa', 'aaccccccccccccaa', 'aaddddddddddddaa', 'aa............aa', 'aa............aa', 'aaeeeeffffffffaa',
    'aaeeeeffffffffaa', 'aagggggggggggggaa', 'aahhhhhhhhhhhhaa', 'aa............aa', 'aa............aa', 'aa............aa', 'aa............aa', '................'],
    pal: { a: P.steel[3], b: P.bone[5], c: P.olive[4], d: P.olive[2], e: P.bone[5], f: P.rust[4], g: P.rust[3], h: P.steel[2] } },
  photo: { rows: [
    'aaaaaaaaaaaaaa..', 'abbbbbbbbbbbba..', 'abccccccccccba..', 'abcdddcccdddba..', 'abcdeedcddeeba..', 'abcdeedcdeedba..', 'abcfffcccfffba..', 'abcffffcffffba..',
    'abccccccccccba..', 'abbbbbbbbbbbba..', 'aaaaaaaaaaaaaa..', '.......gg.......', '......gg........', '.....gg.........', '................', '................'],
    pal: { a: P.soil[1], b: P.soil[4], c: P.sky[4], d: P.flesh[3], e: P.flesh[5], f: P.sapphire[3], g: P.soil[2] } },
  gift: { rows: [
    '.....aa..aa.....', '....abba.abba...', '....abbaabba....', '.....aabbaa.....', 'cccccccbbccccccc', 'cddddddbbddddddc', 'cddddddbbddddddc', 'ccccccc..ccccccc',
    '.ceeeeebbeeeeec.', '.ceeeeebbeeeeec.', '.ceeeeebbeeeeec.', '.ceeeeebbeeeeec.', '.ceeeeebbeeeeec.', '.ceeeeebbeeeeec.', '.ccccccccccccc..', '................'],
    pal: { a: P.ruby[2], b: P.ruby[4], c: P.soil[1], d: P.ochre[4], e: P.ochre[3] } },
};
const cache = new Map<string, HTMLCanvasElement>();
/** a step or quest icon canvas (any size; draw with smoothing off) */
export function stepIcon(name: string, giver?: string): HTMLCanvasElement {
  if (name === 'talk' && giver) { const f = portrait(giver); if (f) return f; }
  const key = name; let c = cache.get(key); if (c) return c;
  const m = MAPS[name];
  if (m) {
    const rows = upscaleRows(m.rows, 2), p = new Px(rows[0].length + 2, rows.length + 2);
    stamp(p, rows, m.pal, 1, 1); shadeSprite(p, { bevel: 3 });
    c = p.canvas();
  } else c = iconCanvas(ALIAS[name] ?? name, 'phos');
  cache.set(key, c);
  return c;
}
/** the data kinds' icons */
export const DATA_ICON: Record<string, string> = { bio: 'dna', geo: 'pick', energy: 'arcs', xeno: 'sensor' };

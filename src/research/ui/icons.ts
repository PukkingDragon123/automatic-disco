// Node and tile art for the progression screens: 24 x 24 pixel icons, each DRAWN from a few hand-placed shapes on the
// grid (polygons, bars, strokes, single pixels), then finished the way a pixel artist would: a 1 px outline in the
// darkest step round the silhouette, a lit edge on the upper-left of each plane, a shadow edge on the lower-right,
// and a glint where the form turns. Rendered in a ramp chosen by state (phosphor on the CRT, amber when owned).
import atlasUrl from '../art/icons.png';
import atlasIdx from '../art/icons.json';
type Pt = [number, number];
type Op = ['r', number, number, number, number, number] | ['p', Pt[], number] | ['l', number, number, number, number, number] | ['x', number, number, number] | ['c', number, number, number, number];
const S = 24;
const r = (x: number, y: number, w: number, h: number, t = 2): Op => ['r', x, y, w, h, t];
const p = (pts: Pt[], t = 2): Op => ['p', pts, t];
const l = (x0: number, y0: number, x1: number, y1: number, t = 2): Op => ['l', x0, y0, x1, y1, t];
const x = (px: number, py: number, t = 4): Op => ['x', px, py, t];
/** clear (cut a hole) */
const c = (px: number, py: number, w: number, h: number): Op => ['c', px, py, w, h];

/** tones: 1 shadow, 2 base, 3 lit, 4 glint, 5 accent, 6 accent lit */
const ART: Record<string, Op[]> = {
  sprout: [l(12, 21, 12, 10, 2), l(11, 21, 11, 12, 1), p([[12, 12], [6, 7], [3, 9], [6, 13], [11, 14]], 2), p([[12, 10], [17, 4], [21, 5], [19, 10], [13, 12]], 3), r(7, 20, 10, 3, 5), x(18, 6, 4)],
  drop: [p([[12, 2], [17, 10], [18, 15], [15, 20], [9, 20], [6, 15], [7, 10]], 2), r(9, 12, 2, 4, 3), x(9, 11, 4), r(8, 21, 8, 1, 5)],
  wheat: [l(12, 22, 12, 4, 1), ...[0, 1, 2, 3].flatMap((k) => [p([[12, 6 + k * 4], [8, 4 + k * 4], [7, 7 + k * 4], [11, 9 + k * 4]], 3), p([[12, 6 + k * 4], [16, 4 + k * 4], [17, 7 + k * 4], [13, 9 + k * 4]], 2)]), x(12, 3, 4)],
  harvester: [r(3, 11, 14, 7, 2), r(16, 13, 5, 5, 1), r(4, 8, 6, 4, 3), r(5, 9, 4, 2, 5), ...[5, 13].map((cx): Op => p([[cx - 2, 17], [cx + 2, 17], [cx + 3, 20], [cx - 3, 20]], 1)), l(17, 13, 21, 9, 3), l(18, 13, 22, 10, 3), x(6, 12, 4)],
  roots: [r(10, 3, 4, 8, 2), p([[3, 9], [21, 9], [19, 12], [5, 12]], 5), l(12, 12, 12, 21, 1), l(11, 13, 6, 20, 2), l(13, 13, 18, 21, 2), l(9, 15, 4, 17, 1), l(15, 15, 20, 15, 1), x(11, 4, 4)],
  spore: [r(10, 10, 4, 4, 3), ...[[5, 5], [17, 4], [19, 15], [6, 18], [12, 3], [3, 12], [14, 19], [20, 9]].map(([a, b], i): Op => r(a, b, i % 3 ? 2 : 3, i % 3 ? 2 : 3, i % 2 ? 2 : 3)), x(11, 11, 4)],
  tree: [r(11, 14, 3, 8, 1), p([[12, 2], [19, 8], [20, 13], [16, 16], [8, 16], [4, 13], [5, 8]], 2), p([[12, 2], [16, 6], [14, 9], [9, 10], [6, 8]], 3), r(6, 21, 12, 2, 5), x(9, 5, 4)],
  globe: [p([[12, 2], [18, 4], [21, 10], [20, 16], [15, 21], [9, 21], [4, 16], [3, 10], [6, 4]], 2), p([[8, 6], [13, 5], [14, 9], [10, 12], [7, 10]], 5), p([[14, 13], [18, 12], [18, 17], [14, 18]], 5), x(7, 5, 4)],
  resin: [r(5, 2, 6, 21, 1), r(6, 2, 4, 21, 2), l(7, 4, 7, 20, 3), r(10, 9, 5, 2, 3), p([[14, 11], [17, 14], [17, 18], [15, 20], [13, 18], [13, 14]], 5), x(14, 15, 6), x(15, 15, 4)],
  fibre: [...[0, 1, 2, 3, 4].map((k): Op => l(4 + k * 3, 21, 8 + k * 3, 3, k % 2 ? 3 : 2)), r(3, 10, 18, 3, 5), x(5, 11, 6)],
  log: [r(3, 8, 15, 9, 2), r(3, 8, 15, 2, 3), p([[17, 8], [21, 9], [21, 16], [17, 17]], 5), r(18, 11, 2, 3, 1), l(5, 13, 14, 13, 1), x(5, 9, 4)],
  sapling: [l(12, 22, 12, 9, 1), p([[12, 14], [6, 10], [5, 13], [11, 16]], 2), p([[12, 11], [18, 6], [20, 9], [13, 13]], 3), p([[12, 9], [10, 4], [12, 2], [14, 4]], 3), r(4, 20, 16, 3, 5), r(4, 18, 16, 2, 1)],
  dna: [...[0, 1, 2, 3, 4, 5].flatMap((k): Op[] => { const y = 3 + k * 3, o = [0, 2, 3, 3, 2, 0][k]; return [r(5 + o, y, 3, 2, 2), r(16 - o, y, 3, 2, 3), l(8 + o, y + 1, 15 - o, y + 1, 5)]; })],
  flask: [r(10, 2, 4, 7, 2), r(9, 2, 6, 2, 3), p([[10, 9], [14, 9], [20, 19], [19, 21], [5, 21], [4, 19]], 2), p([[8, 14], [16, 14], [19, 19], [5, 19]], 5), x(11, 16, 6), x(14, 17, 6)],
  heart: [p([[12, 21], [3, 11], [3, 6], [6, 3], [9, 3], [12, 6], [15, 3], [18, 3], [21, 6], [21, 11]], 5), r(6, 6, 3, 3, 6), x(6, 6, 4)],
  claw: [r(9, 2, 6, 7, 2), r(8, 9, 8, 4, 1), p([[8, 13], [5, 18], [7, 22], [9, 17]], 3), p([[16, 13], [19, 18], [17, 22], [15, 17]], 3), p([[11, 13], [13, 13], [13, 20], [12, 22], [11, 20]], 2), x(10, 3, 4)],
  socket: [r(4, 4, 16, 16, 1), r(6, 6, 12, 12, 2), r(8, 9, 2, 5, 5), r(14, 9, 2, 5, 5), r(10, 16, 4, 2, 1), x(6, 6, 4)],
  brain: [p([[4, 12], [5, 6], [9, 3], [15, 3], [19, 6], [20, 12], [17, 17], [7, 17]], 5), l(12, 4, 12, 16, 1), l(7, 8, 10, 10, 1), l(14, 10, 17, 8, 1), r(10, 17, 4, 5, 2), x(8, 5, 6)],
  muscle: [p([[3, 15], [7, 11], [11, 6], [14, 4], [16, 7], [13, 11], [17, 12], [21, 16], [18, 20], [6, 20]], 5), r(12, 13, 5, 3, 2), l(13, 14, 16, 14, 3), x(13, 5, 6)],
  chip: [r(6, 6, 12, 12, 2), r(8, 8, 8, 8, 1), r(10, 10, 4, 4, 5), ...[7, 11, 15].flatMap((k): Op[] => [r(k, 2, 2, 4, 3), r(k, 18, 2, 4, 3), r(2, k, 4, 2, 3), r(18, k, 4, 2, 3)]), x(7, 7, 4)],
  cross: [r(9, 3, 6, 18, 2), r(3, 9, 18, 6, 2), r(10, 4, 2, 16, 3), x(10, 4, 4), r(13, 13, 1, 1, 5)],
  shield: [p([[4, 4], [12, 2], [20, 4], [19, 13], [12, 22], [5, 13]], 2), p([[12, 4], [18, 6], [17, 13], [12, 19]], 1), r(11, 7, 2, 9, 5), r(8, 10, 8, 2, 5), x(6, 5, 4)],
  vial: [r(9, 2, 6, 3, 1), r(10, 5, 4, 15, 2), r(10, 12, 4, 8, 5), r(9, 20, 6, 2, 1), x(11, 7, 4), x(11, 14, 6)],
  regrow: [p([[12, 20], [5, 13], [5, 8], [8, 5], [12, 8], [16, 5], [19, 8], [19, 13]], 5), l(12, 8, 12, 2, 2), p([[12, 4], [16, 2], [17, 4], [13, 6]], 3), x(7, 8, 6)],
  flame: [p([[12, 2], [16, 8], [19, 12], [18, 18], [14, 22], [10, 22], [6, 18], [5, 12], [9, 9], [10, 12]], 5), p([[12, 10], [15, 15], [14, 20], [10, 20], [9, 16]], 6), x(11, 17, 4)],
  pond: [p([[3, 12], [8, 10], [16, 10], [21, 12], [20, 17], [15, 20], [8, 20], [4, 17]], 2), l(6, 14, 10, 14, 3), l(13, 16, 18, 16, 3), r(8, 7, 2, 3, 5), r(14, 5, 2, 5, 5), r(15, 4, 3, 2, 6)],
  bubbles: [r(5, 13, 6, 6, 2), r(13, 6, 5, 5, 3), r(15, 15, 4, 4, 2), r(9, 3, 3, 3, 3), x(6, 14, 4), x(14, 7, 4), r(3, 20, 18, 2, 5)],
  battery: [r(5, 6, 14, 15, 2), r(9, 3, 6, 3, 1), r(7, 13, 10, 6, 5), r(7, 9, 10, 3, 1), x(6, 7, 4), p([[13, 9], [10, 14], [12, 14], [11, 18], [15, 12], [13, 12]], 6)],
  steam: [r(6, 13, 12, 9, 2), r(5, 12, 14, 2, 3), r(10, 9, 4, 3, 1), p([[11, 9], [8, 6], [10, 3], [13, 2]], 3), p([[14, 7], [17, 4], [19, 6]], 3), r(9, 16, 6, 3, 5)],
  rods: [r(4, 18, 16, 4, 1), ...[5, 9, 13, 17].map((k, i): Op => r(k, 6 + (i % 2) * 4, 2, 12 - (i % 2) * 4, i % 2 ? 3 : 2)), r(4, 4, 16, 2, 5)],
  gauge: [p([[3, 17], [3, 12], [6, 6], [12, 3], [18, 6], [21, 12], [21, 17]], 2), r(5, 14, 14, 3, 1), l(12, 15, 18, 7, 5), x(12, 15, 4), r(5, 12, 2, 2, 3), r(17, 12, 2, 2, 5)],
  core: [p([[12, 2], [19, 7], [19, 16], [12, 21], [5, 16], [5, 7]], 2), p([[12, 6], [16, 9], [16, 14], [12, 17], [8, 14], [8, 9]], 5), r(11, 10, 2, 3, 6), x(7, 7, 4)],
  pole: [r(11, 5, 2, 17, 2), r(5, 5, 14, 2, 3), r(7, 9, 10, 2, 2), r(5, 3, 2, 2, 5), r(17, 3, 2, 2, 5), r(9, 20, 6, 2, 1), x(11, 6, 4)],
  switch: [r(4, 8, 16, 10, 1), r(6, 10, 12, 6, 2), l(9, 13, 15, 7, 3), r(14, 6, 3, 3, 5), x(7, 11, 4)],
  capacitor: [r(7, 4, 10, 16, 2), r(7, 4, 10, 3, 3), r(7, 10, 10, 2, 1), r(10, 20, 1, 3, 1), r(13, 20, 1, 3, 1), r(8, 13, 8, 5, 5), x(8, 5, 4)],
  arcs: [r(10, 16, 4, 6, 2), l(6, 11, 12, 7, 3), l(12, 7, 18, 11, 3), l(3, 9, 12, 3, 5), l(12, 3, 21, 9, 5), r(11, 11, 2, 2, 6)],
  drill: [r(4, 8, 8, 8, 2), r(4, 8, 8, 2, 3), p([[12, 9], [19, 11], [22, 12], [19, 13], [12, 15]], 3), l(13, 10, 19, 13, 1), r(2, 10, 2, 4, 1), x(5, 9, 4)],
  lens: [p([[9, 3], [15, 3], [18, 6], [18, 12], [15, 15], [9, 15], [6, 12], [6, 6]], 2), p([[10, 6], [14, 6], [15, 9], [14, 12], [10, 12], [9, 9]], 5), l(16, 15, 21, 20, 1), l(16, 16, 20, 20, 2), x(10, 7, 6)],
  pick: [p([[3, 8], [9, 4], [15, 4], [21, 8], [15, 6], [9, 6]], 3), l(12, 6, 12, 21, 1), l(13, 6, 13, 21, 2), x(10, 5, 4)],
  shaft: [r(4, 3, 16, 3, 2), r(5, 6, 2, 16, 1), r(17, 6, 2, 16, 1), r(7, 6, 10, 16, 1), l(7, 10, 16, 10, 2), l(7, 15, 16, 15, 2), r(10, 18, 4, 3, 5), x(5, 4, 4)],
  furnace: [p([[4, 22], [4, 9], [12, 3], [20, 9], [20, 22]], 2), r(8, 13, 8, 7, 1), r(9, 15, 6, 5, 5), r(10, 17, 4, 3, 6), r(14, 2, 3, 6, 1), x(6, 10, 4)],
  ingot: [p([[3, 17], [7, 9], [17, 9], [21, 17]], 2), p([[7, 9], [17, 9], [16, 12], [8, 12]], 3), r(3, 17, 18, 2, 1), x(8, 10, 4)],
  slag: [p([[3, 19], [6, 13], [11, 12], [14, 15], [18, 13], [21, 19]], 1), r(8, 6, 5, 5, 5), x(9, 7, 6), r(14, 8, 3, 3, 2)],
  blast: [p([[12, 2], [14, 8], [21, 6], [16, 11], [22, 16], [14, 15], [12, 22], [10, 15], [2, 16], [8, 11], [3, 6], [10, 8]], 5), r(10, 10, 4, 4, 6), x(11, 11, 4)],
  wrench: [l(5, 19, 15, 9, 2), l(6, 20, 16, 10, 2), l(5, 20, 15, 10, 3), p([[14, 5], [18, 3], [21, 6], [19, 10], [15, 10]], 2), c(17, 5, 2, 2), x(15, 9, 4)],
  bolt: [p([[6, 6], [12, 3], [18, 6], [18, 12], [12, 15], [6, 12]], 2), r(10, 15, 4, 7, 1), r(10, 7, 4, 4, 3), x(8, 6, 4)],
  moon: [p([[13, 3], [8, 5], [5, 10], [6, 16], [11, 20], [17, 20], [20, 16], [15, 16], [11, 12], [11, 7]], 3), x(9, 8, 4), r(17, 4, 2, 2, 5), r(20, 9, 1, 1, 5)],
  factory: [p([[3, 21], [3, 11], [8, 7], [8, 11], [13, 7], [13, 11], [18, 7], [18, 21]], 2), r(18, 3, 3, 18, 1), r(6, 14, 3, 3, 5), r(12, 14, 3, 3, 5), x(4, 12, 4)],
  piston: [r(5, 4, 8, 10, 2), r(5, 4, 8, 2, 3), r(8, 14, 2, 6, 3), r(6, 20, 6, 2, 1), r(14, 7, 5, 4, 5), x(6, 5, 4)],
  telescope: [l(3, 19, 9, 13, 1), r(8, 11, 4, 4, 2), l(11, 12, 15, 8, 2), l(12, 13, 16, 9, 3), l(15, 8, 19, 4, 3), r(18, 3, 3, 3, 5), x(9, 12, 4)],
  armsocket: [r(3, 14, 18, 7, 1), r(5, 15, 14, 5, 2), r(9, 10, 6, 5, 3), l(12, 10, 17, 4, 2), r(16, 2, 4, 4, 5), x(6, 16, 4)],
  arm: [r(3, 16, 8, 6, 1), l(7, 16, 12, 8, 2), l(8, 16, 13, 8, 3), r(11, 6, 4, 4, 5), l(14, 8, 19, 12, 2), p([[19, 12], [22, 14], [20, 16], [18, 14]], 3), x(12, 7, 6)],
  arms: [r(9, 16, 6, 6, 1), l(11, 16, 5, 7, 2), l(13, 16, 19, 7, 3), r(3, 5, 4, 3, 5), r(17, 5, 4, 3, 5), l(12, 16, 12, 5, 2), r(11, 3, 3, 3, 6)],
  drone: [r(8, 10, 8, 5, 2), r(9, 11, 6, 2, 3), r(10, 15, 4, 2, 5), l(8, 11, 4, 7, 1), l(16, 11, 20, 7, 1), r(1, 6, 6, 1, 3), r(17, 6, 6, 1, 3), x(10, 11, 4)],
  swarm: [...[[3, 4], [14, 6], [7, 15]].flatMap(([a, b]): Op[] => [r(a + 2, b + 2, 5, 3, 2), r(a, b, 9, 1, 3), r(a + 3, b + 5, 3, 1, 5)])],
  crate: [r(4, 6, 16, 14, 2), r(4, 6, 16, 3, 3), l(4, 9, 19, 19, 1), l(19, 9, 4, 19, 1), r(10, 2, 4, 4, 5), x(5, 7, 4)],
  hive: [...[[8, 3], [3, 9], [13, 9], [8, 15], [18, 15]].map(([a, b], i): Op => p([[a + 2, b], [a + 6, b], [a + 8, b + 3], [a + 6, b + 6], [a + 2, b + 6], [a, b + 3]], i === 2 ? 5 : 2))],
  nodes: [r(3, 4, 6, 5, 2), r(15, 4, 6, 5, 3), r(9, 15, 6, 5, 5), l(8, 7, 11, 15, 1), l(16, 7, 13, 15, 1), l(9, 6, 15, 6, 1), x(4, 5, 4)],
  sensor: [r(9, 12, 6, 9, 2), r(7, 20, 10, 2, 1), r(10, 9, 4, 3, 5), l(6, 8, 9, 5, 3), l(15, 5, 18, 8, 3), l(3, 6, 8, 2, 2), l(16, 2, 21, 6, 2), x(11, 10, 6)],
  template: [r(3, 3, 12, 14, 1), r(9, 7, 12, 14, 2), r(9, 7, 12, 2, 3), l(11, 12, 18, 12, 5), l(11, 15, 18, 15, 5), x(10, 8, 4)],
  auto: [p([[12, 3], [16, 5], [19, 9], [19, 15], [16, 19], [12, 21], [8, 19], [5, 15], [5, 9], [8, 5]], 2), c(9, 9, 6, 6), r(10, 10, 4, 4, 5), r(11, 1, 2, 4, 3), r(11, 19, 2, 4, 3), r(1, 11, 4, 2, 3), r(19, 11, 4, 2, 3), x(7, 6, 4)],
  gear: [p([[12, 3], [16, 5], [19, 9], [19, 15], [16, 19], [12, 21], [8, 19], [5, 15], [5, 9], [8, 5]], 2), c(10, 10, 4, 4), r(11, 1, 2, 4, 3), r(11, 19, 2, 4, 1), r(1, 11, 4, 2, 3), r(19, 11, 4, 2, 1), r(4, 4, 3, 3, 3), r(17, 17, 3, 3, 1), r(17, 4, 3, 3, 2), r(4, 17, 3, 3, 2), x(8, 6, 4)],
  belt: [r(2, 10, 20, 6, 2), r(2, 10, 20, 2, 3), ...[4, 9, 14, 19].map((k): Op => r(k, 12, 2, 2, 1)), r(6, 5, 5, 5, 5), r(13, 6, 4, 4, 5)],
  cog: [],
};
ART.cog = ART.gear;

export type Pal = [number, number, number, number, number, number, number];
/** outline, shadow, base, lit, glint, accent, accent lit */
export const PAL = {
  phos: [0x050a07, 0x1b3525, 0x336240, 0x4a8457, 0xb9dcbd, 0x7fb88a, 0xd8f0da] as Pal,
  dim: [0x050806, 0x0f1a14, 0x14261b, 0x1b3525, 0x336240, 0x264a32, 0x336240] as Pal,
  lit: [0x06100a, 0x264a32, 0x4a8457, 0x7fb88a, 0xe2f4e4, 0xd9a43a, 0xecd29a] as Pal,
  amber: [0x150c04, 0x4f3816, 0x98702c, 0xc28f3a, 0xf3e2b8, 0xd9a43a, 0xf6ead0] as Pal,
  red: [0x140605, 0x521915, 0x942e25, 0xb8382e, 0xf0c0b0, 0xcc6252, 0xe0998a] as Pal,
  steel: [0x0d0e10, 0x3a3d40, 0x5f6261, 0x8d8f8a, 0xe4e5de, 0xc28f3a, 0xecd29a] as Pal,
};
export type PalKey = keyof typeof PAL;

function raster(ops: Op[]): Uint8Array {
  const g = new Uint8Array(S * S);
  const set = (px: number, py: number, t: number) => { px = Math.round(px); py = Math.round(py); if (px >= 0 && py >= 0 && px < S && py < S) g[py * S + px] = t; };
  for (const o of ops) {
    if (o[0] === 'r') { for (let j = 0; j < o[4]; j++) for (let i = 0; i < o[3]; i++) set(o[1] + i, o[2] + j, o[5]); }
    else if (o[0] === 'x') set(o[1], o[2], o[3]);
    else if (o[0] === 'c') { for (let j = 0; j < o[4]; j++) for (let i = 0; i < o[3]; i++) set(o[1] + i, o[2] + j, 0); }
    else if (o[0] === 'l') {
      let [, x0, y0, x1, y1, t] = o; const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
      for (;;) { set(x0, y0, t); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    } else {
      const pts = o[1], t = o[2];
      let y0 = S, y1 = 0; for (const q of pts) { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      for (let py = Math.max(0, Math.floor(y0)); py <= Math.min(S - 1, Math.ceil(y1)); py++) {
        const yc = py + 0.5, xs: number[] = [];
        for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0])); }
        xs.sort((m, n) => m - n);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let px = Math.ceil(xs[k] - 0.5); px <= Math.floor(xs[k + 1] - 0.5); px++) set(px, py, t);
        // the polygon's own edge pixels, so thin shapes stay solid
      }
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1); for (let k = 0; k <= n; k++) { const px = Math.round(a[0] + ((b[0] - a[0]) * k) / n), py = Math.round(a[1] + ((b[1] - a[1]) * k) / n); if (px >= 0 && py >= 0 && px < S && py < S && !g[py * S + px]) g[py * S + px] = t; } }
    }
  }
  return g;
}
const cache = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();
// ------------------------------------------------------------------ the lowpix-painted atlas (src/research/art)
// The shapes above are turned into lowpix sprite specs and painted in strokes, in real material colours, by
// src/research/art/build_icons.py; the screens show that atlas. Locked states are re-inked into dark phosphor.
let atlas: HTMLImageElement | null = null;
const AIDX = atlasIdx as { cell: number; cols: number; index: Record<string, number> };
export const iconsReady: Promise<void> = new Promise((res) => {
  if (typeof Image === 'undefined') { res(); return; }
  const im = new Image();
  im.onload = () => { atlas = im; cache.clear(); urls.clear(); res(); };
  im.onerror = () => res();
  im.src = atlasUrl;
});
const DIM_RAMP = [0x3a342c, 0x524a40, 0x6a6256, 0x8a8174, 0xa89e8e, 0xc4bba8];
const RED_RAMP = [0x1c0907, 0x34100d, 0x521915, 0x72241d, 0x942e25, 0xb8382e, 0xcc6252];
function fromAtlas(name: string, pal: PalKey | Pal): HTMLCanvasElement | null {
  const j = AIDX.index[name]; if (!atlas || j === undefined) return null;
  const C = AIDX.cell, cv = document.createElement('canvas'); cv.width = C; cv.height = C;
  const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
  g.drawImage(atlas, (j % AIDX.cols) * C, Math.floor(j / AIDX.cols) * C, C, C, 0, 0, C, C);
  const ink = pal === 'dim' || Array.isArray(pal) ? DIM_RAMP : pal === 'red' ? RED_RAMP : null;
  if (ink) {
    const img = g.getImageData(0, 0, C, C), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255, c = ink[Math.min(ink.length - 1, Math.floor(l * ink.length * 1.1))];
      d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255;
    }
    g.putImageData(img, 0, 0);
  }
  return cv;
}
/** an icon canvas: 48 x 48 from the lowpix atlas once it has loaded, else 24 x 24 from the shapes (scale it with
 *  image-rendering: pixelated, or drawImage with smoothing off, at whole multiples) */
export function iconCanvas(name: string, pal: PalKey | Pal = 'phos'): HTMLCanvasElement {
  const key = name + ':' + (typeof pal === 'string' ? pal : pal.join(','));
  let cv = cache.get(key); if (cv) return cv;
  const fa = fromAtlas(name, pal); if (fa) { cache.set(key, fa); return fa; }
  const P = typeof pal === 'string' ? PAL[pal] : pal, ops = ART[name] ?? ART.gear;
  const g = raster(ops);
  cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const cx = cv.getContext('2d')!, img = cx.createImageData(S, S), d = img.data;
  const at = (px: number, py: number) => (px < 0 || py < 0 || px >= S || py >= S ? 0 : g[py * S + px]);
  const put = (i: number, col: number) => { d[i * 4] = (col >> 16) & 255; d[i * 4 + 1] = (col >> 8) & 255; d[i * 4 + 2] = col & 255; d[i * 4 + 3] = 255; };
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const t = at(px, py), i = py * S + px;
    if (!t) {
      // outline: any filled 4-neighbour; the lower-right outline is the darkest, the upper-left one step lighter
      if (at(px + 1, py) || at(px - 1, py) || at(px, py + 1) || at(px, py - 1)) put(i, P[0]);
      continue;
    }
    const acc = t >= 5, base = acc ? (t === 6 ? 6 : 5) : t;
    let col = P[base];
    if (!acc && t !== 4) {
      // planar light from the upper left: lit edge where the form meets air above/left, shadow edge below/right
      const up = at(px, py - 1), lf = at(px - 1, py), dn = at(px, py + 1), rt = at(px + 1, py);
      if ((!up || !lf) && t < 3) col = P[t + 1];
      else if ((!dn || !rt) && t > 1) col = P[t - 1];
    } else if (acc && t === 5) { const up = at(px, py - 1); if (!up) col = P[6]; }
    put(i, col);
  }
  cx.putImageData(img, 0, 0);
  cache.set(key, cv);
  return cv;
}
export function iconURL(name: string, pal: PalKey | Pal = 'phos') { const k = name + ':' + String(pal); let u = urls.get(k); if (!u) { u = iconCanvas(name, pal).toDataURL(); urls.set(k, u); } return u; }
export const ICON_NAMES = Object.keys(ART);
/** the shape ops behind each icon (scripts/lowpix-icons.py turns them into lowpix sprite specs) */
export const ICON_ART = ART;

// THE MASTER PALETTE (v2: richer colour, user asked for more colourful pixel art). Every 2D painter in the game (plants, ground, rock, creatures, icons, VFX, UI art) draws from
// these ramps and nothing else. Hand-picked, rich but natural saturation, hue-shifted: shadows lean cool (blue-violet), lights lean
// warm (straw), mid-tones carry the local colour. No ramp reaches pure black, pure white or full saturation.
// Ramps run dark -> light. Pick a ramp by material, then index it by light; do not mix or tint at runtime.

const hex = (s: string) => parseInt(s.slice(1), 16);
const R = (...c: string[]) => c.map(hex);

export const RAMPS = {
  // foliage
  moss: R('#1a2720', '#283c22', '#3e552b', '#597033', '#7f8b3f', '#aea94f', '#d4c272'),
  sage: R('#1c2829', '#264039', '#375a49', '#507858', '#77976b', '#a3b888'),
  teal: R('#16262e', '#1e3c40', '#2b5550', '#407162', '#5f9075', '#8aae92'),
  violet: R('#201b2d', '#362145', '#50305d', '#664575', '#86628a', '#a98aa0'),
  plum: R('#2b1826', '#451f33', '#642a3f', '#833b4e', '#a2555c', '#c37c76'),
  rust: R('#2f1a13', '#4e2817', '#773717', '#9f4621', '#c36530', '#de8f4e', '#efb67b'),
  coral: R('#2f181c', '#501f1f', '#752b2b', '#9b4238', '#bf6346', '#da876a'),
  ochre: R('#312715', '#503e1a', '#745820', '#99702a', '#bc913a', '#d8ac5b', '#e9cb89'),
  straw: R('#42391c', '#635b2a', '#877b3c', '#a99c51', '#c5b36e', '#decd93'),
  // ground and stone
  soil: R('#1f1813', '#30251a', '#453624', '#604b31', '#7c6141', '#997c56', '#b89d74'),
  clay: R('#291912', '#422a1b', '#613b22', '#7f4b2c', '#9d643b', '#b98453'),
  sand: R('#413925', '#645435', '#887448', '#a9945f', '#c6ad7b', '#ddc799'),
  stone: R('#1a1b20', '#292a2f', '#3c3d3f', '#525150', '#6c6862', '#898278', '#a9a194'),
  slate: R('#171b25', '#212d38', '#2d404c', '#3f5362', '#566f79', '#759090'),
  basalt: R('#18181b', '#222225', '#2f2e31', '#3f3d3f', '#524f4f', '#6a645e'),
  snow: R('#5c6876', '#798590', '#96a0a8', '#b4bbbc', '#cfd3cb', '#e3e1d7'),
  // water and sky
  water: R('#0f2028', '#14323b', '#1d494f', '#2a625e', '#427d74', '#639e8b', '#92bca6'),
  sky: R('#26394a', '#395165', '#536e7d', '#729097', '#97b0ab', '#bfcbb8'),
  // flesh, fur, bone, blood
  fur: R('#231912', '#3a2a18', '#563d20', '#72502d', '#916b3f', '#b18e59', '#cba97d'),
  hide: R('#251819', '#3e2824', '#5a3e32', '#765245', '#966b5a', '#b38c7a'),
  flesh: R('#301416', '#501b1d', '#74252a', '#973537', '#b75248', '#d37867'),
  bone: R('#453e2b', '#65583d', '#877853', '#a9986c', '#c7b589', '#e0cfa6'),
  blood: R('#230b0d', '#3c0e0f', '#5c100f', '#7c1814', '#9e1e1a'),
  ichor: R('#202512', '#353e17', '#525d1b', '#6b7d22', '#8b9d30'),
  // made things
  steel: R('#1c1e20', '#2a2f32', '#3d4346', '#54595c', '#6e7373', '#8e9190', '#b1b2aa'),
  olive: R('#222316', '#35351e', '#4b4c28', '#616436', '#7b7e48', '#999b5f'),
  brass: R('#31260f', '#4f3e13', '#705719', '#946c21', '#b38737', '#cea457'),
  paper: R('#726955', '#8f856e', '#aa9e84', '#c1b59b', '#d6cab0', '#e5dbc3'),
  ink: R('#13161c', '#1e232c', '#2a323e'),
  // the few lit things: used sparingly, never as a fill
  glowTeal: R('#274f47', '#3e7a6c', '#62a88f', '#95ccb0', '#c7e6ce'),
  glowAmber: R('#503a1a', '#825722', '#b27d34', '#d7a856', '#eecc8e'),
  stampRed: R('#401913', '#672319', '#8c2920', '#b13c2b'),
} as const;
export type RampName = keyof typeof RAMPS;

/** every colour in the master palette */
export const PALETTE: number[] = [...new Set(Object.values(RAMPS).flat())];

/** a ramp by name, or the closest ramp to an arbitrary colour (for porting old code that picked free colours) */
export function ramp(name: RampName): readonly number[] { return RAMPS[name]; }

const ch = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;
function dist(a: number, b: number) {
  const [r1, g1, b1] = ch(a), [r2, g2, b2] = ch(b);
  const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db; // "redmean" perceptual weighting
}
/** the ramp whose mid-tones are nearest a colour */
export function nearestRamp(c: number): RampName {
  let best: RampName = 'stone', bd = Infinity;
  for (const k of Object.keys(RAMPS) as RampName[]) {
    if (k.startsWith('glow') || k === 'stampRed' || k === 'ink') continue;
    for (const v of RAMPS[k]) { const d = dist(c, v); if (d < bd) { bd = d; best = k; } }
  }
  return best;
}

// snapping arbitrary colours into the palette (a 32^3 lookup, built on first use)
let LUT: Uint32Array | null = null;
function lut() {
  if (LUT) return LUT;
  LUT = new Uint32Array(32 * 32 * 32);
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
    const c = ((r * 8 + 4) << 16) | ((g * 8 + 4) << 8) | (b * 8 + 4);
    let best = PALETTE[0], bd = Infinity;
    for (const p of PALETTE) { const d = dist(c, p); if (d < bd) { bd = d; best = p; } }
    LUT[(r << 10) | (g << 5) | b] = best;
  }
  return LUT;
}
/** the nearest palette colour to 0xRRGGBB */
export function snap(c: number): number { return lut()[(((c >> 19) & 31) << 10) | (((c >> 11) & 31) << 5) | ((c >> 3) & 31)]; }
/** snap an RGBA buffer in place (alpha untouched) */
export function snapRGBA(d: Uint8Array | Uint8ClampedArray) {
  const L = lut();
  for (let i = 0; i < d.length; i += 4) {
    const p = L[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)];
    d[i] = (p >> 16) & 255; d[i + 1] = (p >> 8) & 255; d[i + 2] = p & 255;
  }
}

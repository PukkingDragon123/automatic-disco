// THE MASTER PALETTE. Every 2D painter in the game (plants, ground, rock, creatures, icons, VFX, UI art) draws from
// these ramps and nothing else. Hand-picked, low saturation, hue-shifted: shadows lean cool (blue-violet), lights lean
// warm (straw), mid-tones carry the local colour. No ramp reaches pure black, pure white or full saturation.
// Ramps run dark -> light. Pick a ramp by material, then index it by light; do not mix or tint at runtime.

const hex = (s: string) => parseInt(s.slice(1), 16);
const R = (...c: string[]) => c.map(hex);

export const RAMPS = {
  // foliage
  moss: R('#1d2421', '#2a3628', '#3d4c34', '#566340', '#747b4f', '#9a9763', '#c0b886'),
  sage: R('#1f2526', '#2c3a37', '#3f524a', '#5a6e5e', '#7c8c76', '#a3ad93'),
  teal: R('#1b2329', '#253539', '#344c4b', '#4b665e', '#6b8476', '#93a596'),
  violet: R('#211f29', '#33293d', '#4a3a53', '#62506a', '#7e6c80', '#a1929c'),
  plum: R('#271c25', '#3d2734', '#583645', '#744a55', '#91666a', '#b38c86'),
  rust: R('#291c19', '#432a22', '#64392a', '#86503a', '#a66d4d', '#c2926a', '#d9b991'),
  coral: R('#2a1d20', '#46292b', '#663a3a', '#87524c', '#a6705f', '#c49580'),
  ochre: R('#2b241b', '#453825', '#634f31', '#836a40', '#a28854', '#bfa874', '#d6c79c'),
  straw: R('#3a3324', '#575036', '#77704c', '#968f64', '#b3ab80', '#cfc7a2'),
  // ground and stone
  soil: R('#1c1816', '#2b241f', '#3e342b', '#56483b', '#6f604e', '#8a7a65', '#a99a83'),
  clay: R('#241a17', '#3a2a23', '#543b2f', '#6e4f3d', '#89674f', '#a48568'),
  sand: R('#3b352b', '#5a513f', '#7a6f56', '#998d6f', '#b6aa8b', '#cfc4a7'),
  stone: R('#1b1c1f', '#2a2b2e', '#3c3d3f', '#525150', '#6b6863', '#87827a', '#a7a196'),
  slate: R('#1a1d22', '#262c33', '#343d45', '#47525a', '#5f6b70', '#7d8888'),
  basalt: R('#18181b', '#222225', '#2f2e31', '#3f3d3f', '#524f4f', '#69645f'),
  snow: R('#5f6873', '#7b858e', '#98a1a6', '#b5bbbb', '#cfd2cc', '#e2e1d8'),
  // water and sky
  water: R('#141d23', '#1c2c33', '#273f45', '#365656', '#4f706b', '#719086', '#9cb2a5'),
  sky: R('#2e3742', '#43505b', '#5d6b73', '#7c8a8d', '#9ea9a6', '#c1c6bd'),
  // flesh, fur, bone, blood
  fur: R('#1f1916', '#33281f', '#4b3a2b', '#64503b', '#806a50', '#9e8a6c', '#bba98d'),
  hide: R('#221b1c', '#382b2a', '#51403b', '#6b5750', '#887168', '#a69187'),
  flesh: R('#2a1a1c', '#452629', '#643538', '#83494a', '#a0655f', '#bd8a7d'),
  bone: R('#3f3a31', '#5c5546', '#7b735f', '#9b927a', '#bab196', '#d4ccb2'),
  blood: R('#1e1012', '#33171a', '#4d1e21', '#68282a', '#843634'),
  ichor: R('#1d2116', '#2f361f', '#465028', '#606b34', '#7c8746'),
  // made things
  steel: R('#1c1e20', '#2b2e31', '#3e4245', '#55595b', '#6f7373', '#8e9190', '#b0b1ab'),
  olive: R('#1f2019', '#2f3023', '#424430', '#585a40', '#707254', '#8c8d6d'),
  brass: R('#2a2216', '#43361f', '#5f4c2a', '#7d6538', '#9a8050', '#b69d6f'),
  paper: R('#6f6858', '#8c8471', '#a69d88', '#bdb59f', '#d2cab4', '#e2dbc6'),
  ink: R('#14161b', '#1f232b', '#2c323c'),
  // the few lit things: used sparingly, never as a fill
  glowTeal: R('#2c4a46', '#467268', '#6c9e8c', '#9cc5ae', '#cbe2cf'),
  glowAmber: R('#4a3620', '#77562d', '#a47b42', '#c9a464', '#e4cd98'),
  stampRed: R('#3b1a18', '#5e2522', '#80332c', '#a2473a'),
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

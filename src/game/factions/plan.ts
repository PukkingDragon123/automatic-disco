// Which enemy programmes hold a region, where their bases sit and how strong they are: a pure function of the
// region's seed and danger, so the orbital scan (deploy) and the region screen agree. No three.js in here.
//
//   factionsForRegion(region, planet) -> [{ faction: 'soviet', x: 108, z: 20, strength: 1.1, arrive: 0, name: 'ZARYA' }, ...]
//
// x, z are the planned site in region metres (0..Region.N). In play the base settles on the flattest dry ground within
// ~12 m of it (away from Unit 07's landing), so a scan marker is always within a few metres of the real base.
import { Rand } from '../../core/rand';
import type { PRegion, Planet } from '../../world/planet';
import { LAND_N } from '../../world/region';

export type FactionId = 'soviet' | 'prc' | 'expedition';
export interface FactionSite {
  faction: FactionId;
  /** planned base / camp site in region metres */
  x: number; z: number;
  /** 0.6 .. 1.6: production, wave size and economy scale with it */
  strength: number;
  /** seconds into the region before it is there (0: dug in before Unit 07 lands; expeditions arrive mid-game) */
  arrive: number;
  /** call sign of the base (radio, scan labels) */
  name: string;
}

// v6: two FUTURE human blocs (internal ids 'soviet' and 'prc' are kept so nothing else breaks):
//   'soviet' = the EURASIAN CONCORD: heavy, disciplined, graphite hulls with signal-orange bands, a hexagon-and-chevron mark
//   'prc'    = the PACIFIC RIM CONSORTIUM: fast, corporate, ceramic-white hulls with teal bands, a wave-crest mark
export const FACTION_LABEL: Record<FactionId, string> = { soviet: 'Eurasian Concord', prc: 'Pacific Consortium', expedition: 'Private expedition' };
/** the short name used in lines ('the Concord', 'Consortium machines') */
export const FACTION_SHORT: Record<FactionId, string> = { soviet: 'Concord', prc: 'Consortium', expedition: 'expedition' };
export const FACTION_TAG: Record<FactionId, string> = { soviet: 'CONCORD NET', prc: 'CONSORTIUM NET', expedition: 'EXPEDITION BAND' };
const NAMES: Record<FactionId, string[]> = {
  soviet: ['BASTION', 'CALDERA', 'ARGENT', 'STEPPE-9', 'AURORA', 'GRANITE'],
  prc: ['TIDEWATER', 'HALCYON', 'LEEWARD', 'CORAL', 'ATOLL', 'MONSOON'],
  expedition: ['MERIDIAN', 'HOLLANDER-VANCE', 'KESTREL', 'ALBION', 'NORDKAPP', 'CORDILLERA'],
};

// base slots: the four corners and the four edge midpoints (Unit 07 always lands in the middle 40% of the map)
const SLOTS: [number, number][] = [[20, 20], [108, 20], [20, 108], [108, 108], [14, 64], [114, 64], [64, 14], [64, 114]];

/** the plan for a region seed at a danger (1..3); N is the region size (Region.N; SLOTS are laid out for 128 and scaled) */
export function planFactions(seed: number, danger: number, N = LAND_N): FactionSite[] {
  const r = new Rand(((seed >>> 0) ^ 0x5f3a91c7) >>> 0);
  const d = Math.max(1, Math.min(3, Math.round(danger || 1)));
  const first: FactionId = r.chance(0.5) ? 'soviet' : 'prc';
  const second: FactionId = first === 'soviet' ? 'prc' : 'soviet';
  const roll = r.next();
  const list: FactionId[] = d <= 1 ? (roll < 0.3 ? [first, 'expedition'] : [first])
    : d === 2 ? (roll < 0.5 ? [first, second] : [first, 'expedition'])
      : [first, second];
  const slots = r.shuffle(SLOTS.map((s) => [s[0], s[1]] as [number, number]));
  const out: FactionSite[] = [];
  const used: [number, number][] = [];
  for (const f of list) {
    // the first takes a shuffled slot; the next takes the free slot farthest from the ones in use
    let pick = slots[0];
    if (used.length) {
      let bd = -1;
      for (const s of slots) { if (used.includes(s)) continue; const dd = Math.min(...used.map((u) => Math.hypot(u[0] - s[0], u[1] - s[1]))); if (dd > bd) { bd = dd; pick = s; } }
    }
    used.push(pick);
    const k = N / 128;
    const x = (pick[0] + r.range(-5, 5)) * k, z = (pick[1] + r.range(-5, 5)) * k;
    const base = f === 'expedition' ? 0.55 + d * 0.15 : 0.55 + d * 0.22;
    const strength = Math.round((base * r.range(0.9, 1.15)) * 100) / 100;
    const arrive = f === 'expedition' ? Math.round(r.range(420, 560) - d * 40) : out.length === 0 ? 0 : Math.round(r.range(70, 130));
    out.push({ faction: f, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, strength, arrive, name: r.pick(NAMES[f]) });
  }
  return out;
}

/** for the planet layer / orbital scan: the same plan the region screen will play (N: that region's size in metres,
 *  Region.N, so the scan marks sit where the bases will settle) */
export function factionsForRegion(region: Pick<PRegion, 'seed' | 'danger'>, _planet?: Planet, N = LAND_N): FactionSite[] {
  return planFactions(region.seed, region.danger, N);
}

/** one line for a planet info panel: "CONCORD BASE · CONSORTIUM BASE" */
export function factionSummary(region: Pick<PRegion, 'seed' | 'danger'>): string {
  return factionsForRegion(region).map((s) => (s.faction === 'expedition' ? 'EXPEDITION (MID-GAME)' : s.faction === 'soviet' ? 'CONCORD BASE' : 'CONSORTIUM BASE')).join(' · ');
}

// The gene recipe: any procedural vertebrate (design.ts wildDesign, the gene lab) assembled from the same library as
// the bestiary. The genes choose the body plan's cross-sections, the skull family and its eyes, ears, nose, teeth
// and tongue, the kind of leg, the integument recipe per zone (fur, scales of a kind, hide, wet glandular skin) with
// the design's colours and pattern, and the parts (horns, antlers, tusks, plates, a shell, crests and sails, frills,
// fins, quills, manes, shag, gills, wings, a club); the biotech genes grow their organs (anatomy/organs.ts).
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { VertSpec, LegSpecV } from '../anatomy/vertebrate';
import type { VPart } from '../anatomy/vparts';
import type { CoatPattern, Surf } from '../anatomy/coat';
import type { PupilKind } from '../anatomy/head';
import { rs, sh, fur, scales, hide, wet } from './util';

export function geneRecipe(d: Design, rig: Rig): VertSpec {
  const g = (x: string) => d.genes.includes(x), D = rig.dims, W = D.W;
  const biped = d.plan === 'biped', bear = !!D.bear, hop = !!D.hop, sprawl = !!D.sprawl, shell = !!D.shell, amph = g('amphib_skin');
  const runner = g('leg_cursorial'), hooved = g('leg_hooved'), pillar = g('leg_pillar');
  const cat = g('whiskers') && g('carnassials') && !sprawl, carn = g('carnassials');
  const furry = d.cover === 'fur', scaly = d.cover === 'scales', wetSkin = d.cover === 'slime' || amph;
  const base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), acc = rs(d.colors.accent), eye = rs(d.colors.eye);
  // ---- the body plan
  const T = (c: [number, number, number], b: [number, number, number], w: [number, number, number], h: [number, number, number]) => ({ chest: c, barrel: b, waist: w, hips: h });
  const trunk = hop ? T([0.44, 0.5, 0.5], [0.5, 0.5, 0.5], [0.48, 0.46, 0.44], [0.4, 0.38, 0.34])
    : sprawl ? T([0.44, 0.42, 0.46], [0.48, 0.42, 0.48], [0.46, 0.4, 0.44], [0.44, 0.4, 0.4])
      : bear ? T([0.5, 0.56, 0.7], [0.52, 0.52, 0.66], [0.5, 0.48, 0.6], [0.48, 0.5, 0.52])
        : shell ? T([0.5, 0.5, 0.56], [0.54, 0.52, 0.56], [0.52, 0.5, 0.52], [0.48, 0.48, 0.46])
          : runner || carn ? T([0.42, 0.5, 0.72], [0.46, 0.48, 0.62], [0.38, 0.44, 0.4], [0.42, 0.48, 0.44])
            : pillar ? T([0.46, 0.52, 0.7], [0.52, 0.56, 0.7], [0.5, 0.52, 0.62], [0.47, 0.5, 0.52])
              : T([0.44, 0.5, 0.68], [0.5, 0.5, 0.64], [0.46, 0.46, 0.5], [0.45, 0.48, 0.46]);
  const tailK = g('tail_fin') ? { r0: 0.75, taper: 0.86, flat: 0.55 } : sprawl ? { r0: 0.8, taper: 0.84 } : g('tail_balance') ? { r0: 0.55, taper: 0.8 } : { r0: 0.38, taper: 0.74 };
  // ---- the skull and face
  const skullFam = g('wing_patagium') ? 'chiropteran' : g('beak') ? 'browser' : hop ? 'anuran' : amph && sprawl ? 'caudate' : bear ? 'ursid' : g('tusks') ? 'suid'
    : cat ? 'felid' : hooved || g('horns_ram') || g('antlers') || g('antlers_palm') || (g('molars') && !carn && !scaly) ? 'cervid' : scaly || sprawl ? 'lacertid' : 'canid';
  const pupil: PupilKind = hop ? 'bar' : amph ? 'bar' : cat || scaly || sprawl ? 'slit' : skullFam === 'cervid' ? 'bar' : 'round';
  const fwd = g('eye_binocular') ? 0.7 : cat ? 0.75 : undefined;
  const earLen = skullFam === 'cervid' ? 0.72 : skullFam === 'felid' ? 0.36 : skullFam === 'chiropteran' ? 1.6 : skullFam === 'ursid' ? 0.3 : 0.56;
  const ears = g('ears') ? { len: earLen, wid: earLen * 0.45, up: skullFam === 'cervid' ? 0.4 : 0.9, out: skullFam === 'cervid' ? 1 : 0.5, back: 0.3, cup: 0.85 }
    : g('ears_round') ? { len: 0.3, wid: 0.26, up: 0.7, out: 0.8, back: 0.4, cup: 0.7, shape: [0.6, 0.95, 1.0, 0.95, 0.8, 0.5, 0.15] } : undefined;
  const nose = skullFam === 'suid' ? 'disc' as const : furry && !wetSkin && skullFam !== 'browser' ? 'leather' as const : 'nostrils' as const;
  // ---- legs
  const leg = (fore: boolean): LegSpecV => {
    const k = g('leg_hooved') ? 'hoof' : g('leg_pillar') ? 'pillar' : g('leg_plantigrade') ? 'bear' : g('leg_leaping') ? 'leap' : g('leg_sprawl') ? 'sprawl' : biped ? 'bird' : 'paw';
    return { kind: biped ? 'bird' : k, r: (fore ? 1 : 1.05) * (bear ? 1.1 : pillar ? 1.15 : 1), claw: carn ? 1.4 : 1, web: hop || amph ? 0.6 : undefined };
  };
  // ---- the coat
  const coverSurf: Surf = furry ? fur(W, g('shaggy') ? 1.4 : 0.8, 0.5) : scaly ? scales(W, 1.0, 'keel') : wetSkin ? wet(W, amph ? 0.35 : 0.15) : hide(W, 1.0, 0.8);
  const patKind = (d.pattern === 'plain' ? 'plain' : d.pattern) as CoatPattern;
  const coat: VertSpec['coat'] = {
    base, belly, back: furry ? sh(base, -1) : undefined, bellyArc: hop ? 1.1 : 0.95,
    pattern: patKind === 'plain' ? undefined : { kind: g('cryptic') && patKind === 'spots' ? 'rosettes' : patKind, c: pat, scale: d.patScale, on: { limbs: patKind === 'stripes' || patKind === 'spots', tail: true, head: patKind === 'spots' } },
    surf: {
      body: coverSurf, belly: scaly ? scales(W, 1.4, 'scute') : furry ? fur(W, 0.7) : coverSurf,
      limb: furry ? fur(W, 0.6) : scaly ? scales(W, 0.6, 'shield') : wetSkin ? wet(W, 0.2, 0.6) : hide(W, 0.7, 1),
      face: furry ? fur(W, 0.4) : scaly ? scales(W, 0.45, 'pebble') : wetSkin ? wet(W, 0.25, 0.6) : hide(W, 0.5),
      muzzle: furry ? fur(W, 0.22) : undefined,
    },
    face: { muzzle: furry ? sh(belly, 0) : undefined, nose: skullFam === 'suid' ? ['hide', 3] : ['ink', 2], mask: g('cryptic') && furry ? sh(base, -2) : undefined },
    claw: ['basalt', 2], horn: sh(pat, 0),
  };
  // ---- parts
  const parts: VPart[] = [];
  if (g('horns')) parts.push({ k: 'horn', at: 'brow', len: 0.65, r: 0.08, rise: 0.8, out: 0.7, back: 0.4, curl: 0.4, c: sh(pat, 1) });
  if (g('horns_ram')) parts.push({ k: 'ramHorns', len: 1.0, r: 0.12, c: ['bone', 3] });
  if (g('antlers') || g('antlers_palm')) parts.push({ k: 'antlers', len: g('antlers_palm') ? 1.5 : 1.2, tines: g('antlers_palm') ? 4 : 3, palm: g('antlers_palm'), c: ['bone', 4] });
  if (g('tusks')) parts.push({ k: 'tusks', len: 0.55, r: 0.05, curl: 0.8, c: ['bone', 4] });
  if (g('beak')) parts.push({ k: 'beak', c: sh(acc, -1) });
  if (g('mane')) parts.push({ k: 'mane', len: 0.45, c: sh(base, -1), ruff: 1.3 });
  if (g('shaggy')) parts.push({ k: 'shag', t0: -0.2, t1: 1.0, len: 0.3, density: 0.8, fringe: 1.2, flank: 0.7 });
  if (g('tail_brush')) parts.push({ k: 'tuft', len: 0.45 });
  else if (furry && D.cat) parts.push({ k: 'tuft', len: 0.2, c: sh(pat, 0) });
  if (g('osteoderms') && !shell) parts.push(scaly || !furry ? { k: 'plates', t0: -0.1, t1: 1.1, rows: 12, per: 4, spread: 1.6, size: 0.42, c: sh(base, 1), keel: true } : { k: 'carapace', t0: -0.05, t1: 0.95, bands: 5, spread: 1.7, lift: 1.6, c: ['stone', 3], rim: ['stone', 4], dome: true });
  if (g('shell_scute')) parts.push({ k: 'shell', c: base, scute: sh(acc, 0), h: 0.55 });
  if (g('crest')) parts.push({ k: 'crest', t0: -0.6, t1: 1.3, h: 0.22, kind: furry ? 'bristle' : wetSkin ? 'fin' : 'spikes', c: furry ? sh(base, -1) : sh(acc, 0) });
  if (g('sail')) parts.push({ k: 'sail', t0: -0.1, t1: 1.05, h: 0.9, c: sh(acc, 0), rays: 12 });
  if (g('frill')) parts.push({ k: 'frill', size: 0.9, c: sh(acc, 0), rays: 9 });
  if (g('wattle')) parts.push({ k: 'wattle', size: 1.0, c: furry ? sh(base, -1) : sh(acc, 0) });
  if (g('tail_fin')) parts.push({ k: 'tailFin', h: 0.5, c: sh(base, 1), below: true });
  if (g('tail_club')) parts.push({ k: 'club', size: 1.0, c: ['stone', 3], spikes: 6 });
  if (g('quills')) parts.push({ k: 'quills', t0: -0.1, t1: 1.05, n: 70, len: 0.5, c: ['bone', 4] });
  if (g('gills')) parts.push({ k: 'gills', size: 0.8, c: sh(acc, 0) });
  if (g('wing_patagium')) parts.push({ k: 'wings', span: 1.2, c: sh(base, -1) });
  if (amph && !g('gills')) parts.push({ k: 'warts', n: hop ? 60 : 30, size: hop ? 0.06 : 0.04, c: sh(base, 1) });
  if (biped) parts.push({ k: 'arms', claws: carn ? 1.4 : 1 });
  return {
    trunk: { ...trunk, hump: g('hump') ? 0.22 : undefined, neck: { r0: 0.82, r1: 0.55, arch: biped || hooved ? 0.1 : 0.05, dewlap: g('wattle') ? 0.2 : 0 }, tail: tailK },
    head: {
      skull: skullFam, len: 1, wid: 1, muzzle: skullFam === 'cervid' ? 1.1 : 1, pitch: skullFam === 'cervid' ? 0.15 : 0.05,
      eyes: { r: g('eye_bulging') ? 0.2 : 0.13, pupil, iris: eye, fwd, turret: g('eye_bulging') ? 0.6 : undefined, lid: bear ? 0.15 : 0.06 },
      ears, nose, teeth: carn ? { canine: cat ? 0.24 : 0.18, incisors: true } : g('omni_teeth') ? { canine: 0.1, incisors: true } : undefined,
      tongue: g('tongue') ? (hop ? 'shoot' : 'flick') : 'plain', whiskers: g('whiskers') ? 0.5 : undefined, throat: hop || (amph && !sprawl) ? 0.6 : undefined,
    },
    legs: { fore: leg(true), hind: leg(false), mid: leg(true) },
    coat, parts,
  };
}

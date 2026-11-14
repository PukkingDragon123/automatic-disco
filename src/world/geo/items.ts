// The geology's resources in the factory: the new raw ores (gold-ochre, sulphur, and the rare alien lumen crystal and
// gravium), what the smelter, foundry, refinery and assembler make of them, and the high-tier parts that need the rare
// ores (lumen cells for energy weapons and sensors, gravity coils for gravity tech and heavy lift). Icons are drawn
// like the factory's own: facets one ramp step each, a selective outline, a glint on the glossy ones.
// Call registerGeoItems() once before the factory builds its catalogue (idempotent).
import { registerItem, type ItemDef } from '../../factory/items';
import { registerRecipe } from '../../factory/recipes';
import { KPix, poly, selout, RA, type Pt } from '../../factory/paint';

const I = (id: string, name: string, cat: ItemDef['cat'], side: number, desc: string, x: Partial<ItemDef> = {}): ItemDef => ({ id, name, cat, side, desc, ...x });

/** a fractured lump: facets fanned from a point up-left of centre, lit by how they face the light */
function lump(p: KPix, R: number[], o: Pt[], cx: number, cy: number, base = 2) {
  const c: Pt = [cx - 1, cy - 1];
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    const mx = (a[0] + b[0]) / 2 - c[0], my = (a[1] + b[1]) / 2 - c[1];
    const lit = (-mx - my * 1.3) / (Math.hypot(mx, my) + 0.01);
    poly(p, [c, a, b], R[Math.max(0, Math.min(R.length - 1, Math.round(base + lit * 1.4)))]);
  }
}
/** a crystal prism: lit left face, shadow right face, a bright arris */
function prism(p: KPix, C: number[], x: number, y0: number, y1: number, w: number) {
  poly(p, [[x - w, y1], [x - w, y0 + 2], [x, y0], [x, y1]], C[4]);
  poly(p, [[x, y1], [x, y0], [x + w, y0 + 2], [x + w, y1]], C[2]);
  p.vl(x, y0 + 1, y1 - 1, C[5] ?? C[4]);
}

let done = false;
export function registerGeoItems() {
  if (done) return;
  done = true;
  registerItem(I('gold_ore', 'Gold-ochre Ore', 'raw', RA.gold[3], 'Quartz-veined rock flecked with gold. Smelts to gold for contacts and fine circuitry.'), (p) => {
    lump(p, RA.quartz, [[3, 7], [6, 3], [11, 3], [14, 7], [13, 12], [8, 14], [3, 12]], 8, 8, 3);
    for (const [x, y, k] of [[6, 6, 5], [7, 6, 6], [6, 7, 4], [10, 9, 5], [11, 9, 4], [9, 11, 3], [11, 5, 5]] as const) p.set(x, y, RA.gold[k]);
    p.glint(7, 6, RA.snow[5]);
    selout(p, RA.quartz[0]);
  });
  registerItem(I('sulphur', 'Sulphur', 'raw', RA.straw[4], 'Yellow crystal crust from the vents and the ash country. Acid, powder, rubber cure.'), (p) => {
    lump(p, RA.ochre, [[2, 10], [5, 6], [10, 5], [14, 8], [13, 13], [4, 14]], 8, 10, 3);
    prism(p, [...RA.straw], 6, 3, 9, 2); prism(p, [...RA.straw], 10, 5, 10, 2);
    selout(p, RA.ochre[1]);
  });
  registerItem(I('lumen_crystal', 'Lumen Crystal', 'raw', RA.glowTeal[2], 'An alien crystal that drinks light and gives it back. Grows by geysers and in the crystal flats. Rare.'), (p) => {
    const C = [...RA.glowTeal];
    prism(p, C, 5, 5, 14, 2); prism(p, C, 9, 1, 14, 3); prism(p, C, 12, 7, 14, 2);
    p.glint(8, 3, RA.snow[5]);
    selout(p, RA.teal[0]);
  });
  registerItem(I('gravium', 'Gravium', 'raw', RA.amethyst[3], 'Gravity ore: stones float above its seams. Found only in dangerous ground. Rare.'), (p) => {
    lump(p, RA.amethyst, [[3, 8], [6, 4], [10, 3], [13, 6], [13, 11], [9, 13], [4, 12]], 8, 8, 3);
    poly(p, [[12, 1], [14, 1], [15, 3], [13, 3]], RA.amethyst[5]); poly(p, [[1, 2], [3, 2], [3, 4], [1, 4]], RA.amethyst[4]);
    p.glint(7, 5, RA.snow[5]);
    selout(p, RA.amethyst[0]);
  });
  registerItem(I('gold_ingot', 'Gold Ingot', 'refined', RA.gold[4], 'Soft yellow gold.'));
  registerItem(I('acid', 'Sulphuric Acid', 'refined', RA.straw[3], 'Battery acid in a stoppered jug.'));
  registerItem(I('powder', 'Blasting Powder', 'refined', RA.basalt[2], 'Sulphur, coal and saltpetre earth: charges for the bore and the artillery.'));
  registerItem(I('gold_leaf', 'Gold Contact', 'part', RA.gold[5], 'Gold-plated contacts that never tarnish.'));
  registerItem(I('lumen_lens', 'Lumen Lens', 'part', RA.glowTeal[3], 'A ground lumen crystal set in brass: it focuses light into a beam.'));
  registerItem(I('grav_plate', 'Gravium Plate', 'part', RA.amethyst[3], 'Gravium cast in steel. Weighs nothing on one face.'));
  registerItem(I('precision_circuit', 'Precision Circuit', 'assembly', RA.gold[3], 'A circuit board on gold contacts: sensors, fire control, the golem\'s higher frames.'));
  registerItem(I('lumen_cell', 'Lumen Cell', 'advanced', RA.glowTeal[2], 'A lens, a crystal core and a circuit: power for beam weapons and scanners.'));
  registerItem(I('grav_coil', 'Gravity Coil', 'advanced', RA.violet[3], 'Gravium plates wound round a reactor core: lift, shields and gravity weapons.'));
  const R = (id: string, at: string, name: string, inp: Record<string, number>, out: Record<string, number>, t: number, skill?: string) => registerRecipe({ id, at, name, in: inp, out, t, ...(skill ? { skill } : {}) });
  R('gold_ingot', 'smelter', 'Gold Ingot', { gold_ore: 2 }, { gold_ingot: 1 }, 3);
  R('acid', 'refinery', 'Sulphuric Acid', { sulphur: 1, water: 2 }, { acid: 1 }, 3);
  R('powder', 'refinery', 'Blasting Powder', { sulphur: 1, coal: 1, soil: 1 }, { powder: 2 }, 3);
  R('gold_leaf', 'constructor', 'Gold Contact', { gold_ingot: 1 }, { gold_leaf: 3 }, 3);
  R('precision_circuit', 'assembler', 'Precision Circuit', { circuit: 1, gold_leaf: 2 }, { precision_circuit: 1 }, 6);
  R('lumen_lens', 'constructor', 'Lumen Lens', { lumen_crystal: 1, glass: 1 }, { lumen_lens: 1 }, 6, 'lumen');
  R('lumen_cell', 'assembler', 'Lumen Cell', { lumen_lens: 1, precision_circuit: 1, copper_wire: 2 }, { lumen_cell: 1 }, 10, 'lumen');
  R('grav_plate', 'foundry', 'Gravium Plate', { gravium: 1, steel_ingot: 2 }, { grav_plate: 1 }, 8, 'gravity');
  R('grav_coil', 'manufacturer', 'Gravity Coil', { grav_plate: 2, reactor_core: 1, servo: 1 }, { grav_coil: 1 }, 16, 'gravity');
}

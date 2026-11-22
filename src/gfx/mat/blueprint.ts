// BLUEPRINT PAPER for the shared library (added by the build agent; the build mode's world blueprint, its tray and the
// buildings' blueprint sheets read it through matTex / matCanvas). Painted with Limbophobia's method like scifi.ts: a
// short hue-shifted ramp round the diazo blue (makeRamp: cool shadows, warm lights), a near-flat body of three close
// tones from low-frequency tileable noise broken by the canvas' CLUSTERED dither, then sparse real-paper marks: fibres
// lying in the sheet as short soft flecks of the next tone up, the speckle of the print's grain, a pale foxing bloom with
// a darker tide line, a rubbed patch where a hand rested. 32 texels per metre; every texture tiles on both axes.
//   paper_blueprint        the cyan-blue print stock (64 x 64)
//   paper_blueprint_back   its pale unprinted back (the dog-ear of a sheet) (32 x 32)
import { atlas } from './atlas';
import { addTextureModule } from './textures/index';
import { HD_KIND } from './textures/hd';
import { PixelCanvas, makeRamp, mixHex, ph } from './pixel';
import { Rng } from './rng';
import { nz, flecks, blob } from './lib/content/textures/kit';

/** three close tones from tileable noise, softened in clusters (never a ruled line or a checker) */
function body(pc: PixelCanvas, R: number[], seed: number, mid: number) {
  const lo = mixHex(R[mid], R[mid - 1], 0.5), hi = mixHex(R[mid], R[mid + 1], 0.5);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = nz(pc, x, y, 3, 3, 2, seed), k = nz(pc, x, y, 6, 6, 2, seed + 7);
    let c = n < 0.4 ? lo : n > 0.63 ? hi : R[mid];
    if (k < 0.3 && pc.clusterT(x, y) < 0.6) c = mixHex(c, R[mid - 1], 0.35);
    pc.set(x, y, c);
  }
  return { lo, hi };
}
function blueprintPaper(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x2c5a9a, 7, { spread: 0.42, hueShift: 0.02 });
  const { hi } = body(pc, R, 1301, 3);
  // fibres: short soft flecks lying across the sheet, one tone up, fading at their ends
  for (let i = 0; i < 26; i++) {
    let x = rng.float(0, pc.w), y = rng.float(0, pc.h), a = rng.float(-0.5, 0.5) + (rng.chance(0.5) ? 0 : Math.PI / 2);
    const len = rng.int(2, 5);
    for (let k = 0; k < len; k++) { pc.blend(x, y, k === 0 || k === len - 1 ? hi : R[4], 0.45); x += Math.cos(a); y += Math.sin(a); a += rng.float(-0.4, 0.4); }
  }
  // the print's grain: dark and pale specks, some paired
  flecks(pc, rng, [R[2]], 18, 0.3);
  flecks(pc, rng, [R[5]], 8, 0.2);
  // a foxing bloom with a darker tide line, and a patch rubbed pale where a hand rested
  const fx = rng.float(8, pc.w - 8), fy = rng.float(8, pc.h - 8), fr = rng.float(3.5, 5.5);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const m = blob(x, y, fx, fy, fr, fr * 0.85, 1307, 0.45);
    if (m > 0.55 && ph(x, y, 1309) < 0.7) pc.blend(x, y, R[4], 0.35);
    else if (m > 0.02 && m < 0.18 && ph(x, y, 1311) < 0.8) pc.blend(x, y, R[1], 0.4);
    const rub = nz(pc, x, y, 2, 2, 1, 1313);
    if (rub > 0.72 && pc.clusterT(x, y) < (rub - 0.72) * 3.2) pc.blend(x, y, R[4], 0.5);
  }
}
function blueprintBack(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xc9d6de, 5, { spread: 0.2, hueShift: 0.02 });
  body(pc, R, 1321, 2);
  flecks(pc, rng, [R[1]], 6, 0.2);
  flecks(pc, rng, [mixHex(R[2], 0x2c5a9a, 0.4)], 4, 0); // the blue bleeding through
}

export const BLUEPRINT_MATS = ['paper_blueprint', 'paper_blueprint_back'];
addTextureModule(() => {
  const A = atlas();
  A.add('paper_blueprint', 64, 64, blueprintPaper); HD_KIND.set('paper_blueprint', 'paper');
  A.add('paper_blueprint_back', 32, 32, blueprintBack); HD_KIND.set('paper_blueprint_back', 'paper');
});

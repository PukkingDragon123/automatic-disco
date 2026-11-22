// BLUEPRINT PAPER for the shared library (added by the build agent; the build mode's world blueprint, its tray and the
// buildings' blueprint sheets read it through matTex / matCanvas). Painted with Limbophobia's method like scifi.ts: a
// short hue-shifted ramp round the diazo blue (makeRamp: cool shadows, warm lights), a near-flat body of three close
// tones from low-frequency tileable noise broken by the canvas' CLUSTERED dither, then sparse real-paper marks: fibres
// lying in the sheet as short soft flecks of the next tone up, the speckle of the print's grain, faint foxing specks with
// a darker tide line, the faintest rubbing. 32 texels per metre; every texture tiles on both axes.
//   paper_blueprint        the cyan-blue print stock (128 x 128: a wide repeat, so the sheets never show a pattern)
//   paper_blueprint_back   its pale unprinted back (the dog-ear of a sheet) (32 x 32)
import { atlas } from './atlas';
import { addTextureModule } from './textures/index';
import { HD_KIND } from './textures/hd';
import { PixelCanvas, makeRamp, mixHex, ph } from './pixel';
import { Rng } from './rng';
import { nz, flecks, blob } from './lib/content/textures/kit';

/** three close tones from tileable noise, softened in clusters (never a ruled line or a checker) */
function body(pc: PixelCanvas, R: number[], seed: number, mid: number, cells = 3) {
  const lo = mixHex(R[mid], R[mid - 1], 0.5), hi = mixHex(R[mid], R[mid + 1], 0.5);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = nz(pc, x, y, cells, cells, 2, seed), k = nz(pc, x, y, cells * 2, cells * 2, 2, seed + 7);
    let c = n < 0.4 ? lo : n > 0.63 ? hi : R[mid];
    if (k < 0.3 && pc.clusterT(x, y) < 0.6) c = mixHex(c, R[mid - 1], 0.35);
    pc.set(x, y, c);
  }
  return { lo, hi };
}
function blueprintPaper(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x2c5a9a, 7, { spread: 0.42, hueShift: 0.02 });
  const { hi } = body(pc, R, 1301, 3, 5);
  // fibres: short soft flecks lying across the sheet, one tone up, fading at their ends
  for (let i = 0; i < 90; i++) {
    let x = rng.float(0, pc.w), y = rng.float(0, pc.h), a = rng.float(-0.5, 0.5) + (rng.chance(0.5) ? 0 : Math.PI / 2);
    const len = rng.int(2, 5);
    for (let k = 0; k < len; k++) { pc.blend(x, y, k === 0 || k === len - 1 ? hi : R[4], 0.45); x += Math.cos(a); y += Math.sin(a); a += rng.float(-0.4, 0.4); }
  }
  // the print's grain: dark and pale specks, some paired
  flecks(pc, rng, [R[2]], 70, 0.3);
  flecks(pc, rng, [R[5]], 28, 0.2);
  // two faint foxing specks with a darker tide line (small: a big mark would show the repeat), and the faintest rubbing
  for (let k = 0; k < 2; k++) {
    const fx = rng.float(10, pc.w - 10), fy = rng.float(10, pc.h - 10), fr = rng.float(1.8, 2.8);
    for (let y = Math.floor(fy - 5); y < fy + 5; y++) for (let x = Math.floor(fx - 5); x < fx + 5; x++) {
      const m = blob(x, y, fx, fy, fr, fr * 0.85, 1307 + k, 0.45);
      if (m > 0.5 && ph(x, y, 1309) < 0.6) pc.blend(x, y, R[4], 0.22);
      else if (m > 0.02 && m < 0.16 && ph(x, y, 1311) < 0.7) pc.blend(x, y, R[2], 0.3);
    }
  }
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const rub = nz(pc, x, y, 3, 3, 1, 1313);
    if (rub > 0.78 && pc.clusterT(x, y) < (rub - 0.78) * 2.5) pc.blend(x, y, R[4], 0.28);
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
  A.add('paper_blueprint', 128, 128, blueprintPaper); HD_KIND.set('paper_blueprint', 'paper');
  A.add('paper_blueprint_back', 32, 32, blueprintBack); HD_KIND.set('paper_blueprint_back', 'paper');
});

// ?test=mats: the material library's catalog (V7.md "MATERIAL LIBRARY"). Each material as a 1 m cube (matMaterial, box
// mapped at 32 px/m, lit and outlined by the game's post pipeline) beside its flat swatch (the painted pixels, 2x), name
// under it. Pages are 1920 x 1080 sheets.
//   (default)       the curated surface families, sci-fi first        &all   every registered material (MAT_NAMES)
//   &fam=metal      one family                                         &page=n
//   &hd=2|4         the close-up HD versions                           window.__mats(page) switches page, __matsPages
import * as THREE from 'three';
import type { Engine } from '../../app/engine';
import { resetGrade } from '../post';
import { MAT_NAMES, MAT_FAMILIES, matMaterial, matPixels, type MatHd } from './index';

export function testMats(engine: Engine, P: URLSearchParams) {
  const hd = Number(P.get('hd') ?? 1) as MatHd;
  const all = P.has('all');
  const fam = P.get('fam');
  const list: { name: string; fam: string }[] = [];
  if (all) for (const n of MAT_NAMES) list.push({ name: n, fam: '' });
  else for (const [k, v] of Object.entries(MAT_FAMILIES)) if (!fam || fam === k) for (const n of v) list.push({ name: n, fam: k });
  const W = 1920, H = 1080;
  const cols = all ? 16 : 12, rows = all ? 9 : 7;
  const per = cols * rows, pages = Math.ceil(list.length / per);
  const top = 44, cw = W / cols, ch = (H - top) / rows;

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x23292e);
  scene.add(new THREE.HemisphereLight(0xd8e2ec, 0x4a4036, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.4); sun.position.set(-3, 5, 6); scene.add(sun, sun.target);
  // a near-orthographic view of the sheet: the plane z = 0 maps 1:1 to screen pixels
  const cam = new THREE.PerspectiveCamera(8, W / H, 1, 4000);
  // a 1 m cube fills most of the cell's left half: that sets the metres-per-pixel of the sheet
  const pxPerM = (all ? 0.62 : 0.78) * Math.min(cw * 0.55, ch * 0.7), cube = 1;
  const D = H / (2 * Math.tan((cam.fov * Math.PI) / 360) * pxPerM); cam.position.set(0, 0, D); cam.lookAt(0, 0, 0); cam.far = D * 4; cam.near = D * 0.2; cam.updateProjectionMatrix();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group(); scene.add(group);

  const ui = document.createElement('div');
  Object.assign(ui.style, { position: 'fixed', inset: '0', zIndex: '20', pointerEvents: 'none', font: '10px monospace', color: '#c8ccc4' });
  document.body.appendChild(ui);
  const head = document.createElement('div');
  Object.assign(head.style, { position: 'absolute', left: '16px', top: '8px', font: '16px Alagard, monospace', color: '#d8ac5b', textShadow: '1px 1px 0 #07060c,-1px -1px 0 #07060c,1px -1px 0 #07060c,-1px 1px 0 #07060c' });
  ui.appendChild(head);

  const show = (page: number) => {
    page = Math.max(0, Math.min(pages - 1, page));
    for (const o of [...group.children]) { group.remove(o); ((o as THREE.Mesh).material as THREE.Material).dispose(); }
    for (const el of [...ui.querySelectorAll('.mt')]) el.remove();
    const items = list.slice(page * per, page * per + per);
    const fams = [...new Set(items.map((i) => i.fam).filter(Boolean))];
    head.textContent = `MATERIAL LIBRARY  ${all ? 'ALL ' + MAT_NAMES.length : (fam ?? fams.join(' / ')).toUpperCase()}  ${hd > 1 ? 'HD x' + hd + '  ' : ''}${page + 1}/${pages}`;
    items.forEach((it, i) => {
      const cx = (i % cols) * cw, cy = top + Math.floor(i / cols) * ch;
      // the cube, left half of the cell
      const m = new THREE.Mesh(geo, matMaterial(it.name, { hd }));
      const sx = cx + cw * 0.3, sy = cy + ch * 0.44;
      m.position.set((sx - W / 2) / pxPerM, (H / 2 - sy) / pxPerM, 0);
      m.scale.setScalar(cube); m.rotation.set(0.42, -0.62, 0);
      group.add(m);
      // the flat swatch, right half: the painted pixels at 2 screen px each (HD: 1 px each)
      const p = matPixels(it.name, hd), z = hd > 1 ? 1 : 2;
      const sw = Math.floor(Math.min(cw * 0.4, ch * 0.66));
      const cv = document.createElement('canvas'); cv.width = sw; cv.height = sw; cv.className = 'mt';
      const g = cv.getContext('2d')!, img = g.createImageData(sw, sw);
      for (let y = 0; y < sw; y++) for (let x = 0; x < sw; x++) {
        const tx = Math.floor(x / z) % p.w, ty = Math.floor(y / z) % p.h, s = (ty * p.w + tx) * 4, o = (y * sw + x) * 4;
        const a = p.data[s + 3] / 255, bg = ((x >> 3) + (y >> 3)) & 1 ? 70 : 54;
        img.data[o] = p.data[s] * a + bg * (1 - a); img.data[o + 1] = p.data[s + 1] * a + bg * (1 - a); img.data[o + 2] = p.data[s + 2] * a + bg * (1 - a); img.data[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      Object.assign(cv.style, { position: 'absolute', left: `${Math.round(cx + cw * 0.56)}px`, top: `${Math.round(cy + ch * 0.44 - sw / 2)}px`, imageRendering: 'pixelated', boxShadow: '0 0 0 1px #0a0c0e, 1px 1px 0 1px #3c4448' });
      ui.appendChild(cv);
      const lab = document.createElement('div'); lab.className = 'mt'; lab.textContent = it.name;
      Object.assign(lab.style, { position: 'absolute', left: `${Math.round(cx + 4)}px`, top: `${Math.round(cy + ch - 15)}px`, width: `${Math.round(cw - 8)}px`, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
      ui.appendChild(lab);
    });
    for (let i = 0; i < 3; i++) setTimeout(() => engine.step(1 / 60, true), 60 + i * 400);
    return page;
  };
  engine.setScreen({
    update() {},
    render(post, t) { resetGrade(post.grade); post.grade.vig = 0.12; post.grade.bloom = 0.2; post.render(scene, cam, undefined, t); },
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
  });
  const w = window as unknown as { __mats: (p: number) => number; __matsPages: number; __done: boolean };
  w.__mats = show; w.__matsPages = pages;
  show(Number(P.get('page') ?? 0));
  w.__done = true;
}

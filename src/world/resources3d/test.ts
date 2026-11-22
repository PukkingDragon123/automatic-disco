// ?test=res: the resource models and their icons, for visual QA.
//   &sheet         every real item's icon (rendered live from its 3D model): 64 px native, &px=32 for the small set
//   &zoo[&page=n]  the resource zoo: each common resource's variants, then its pile at three sizes, outlined by the
//                  post pipeline (&cx &cy &cz &lx &ly &lz camera, &yaw)
//   &bake          renders the whole set at 32 and 64 px; window.__bake = { id: [b64 32, b64 64] } (palette-indexed)
//   &drop          a crate, a soil pit and the ground; resources fall in, bounce and puff dust (window.__drop(id, n))
import * as THREE from 'three';
import type { Engine } from '../../app/engine';
import { resetGrade } from '../../gfx/post';
import { gbuf } from '../../gfx/gbuf';
import { ITEM_IDS, ITEMS, ITEM_GROUPS, itemDef, type ItemId } from '../../factory/items';
import { renderIcon, iconURL } from './icon';
import { pileGeo, unitOf } from './piles';
import { formOf } from './forms';
import { meshesOf } from './mats';
import { colorTex } from './paint';

export async function testRes(engine: Engine, P: URLSearchParams) {
  (await import('../geo/items')).registerGeoItems();
  if (P.has('sheet')) return sheet(engine, P);
  if (P.has('bake')) return bake(engine);
  if (P.has('drop')) return (await import('./dropTest')).dropTest(engine, P);
  return zoo(engine, P);
}
const realItems = () => ITEM_IDS.filter((i) => ITEMS[i].cat !== 'internal');

// ------------------------------------------------------------------ the icon sheet
function sheet(engine: Engine, P: URLSearchParams) {
  document.getElementById('view')!.style.display = 'none';
  const both = P.has('both'), sets: [number, number][] = both ? [[64, 1], [32, 2]] : [[Number(P.get('px') ?? 64), Number(P.get('k') ?? (P.get('px') === '32' ? 2 : 1))]];
  const root = document.createElement('div');
  Object.assign(root.style, { position: 'fixed', inset: '0', overflow: 'hidden', background: '#2a2f32', padding: '18px 22px', boxSizing: 'border-box', zIndex: '10', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: '6px 6px' });
  document.body.appendChild(root);
  const t0 = performance.now();
  for (const [px, k] of sets) sheetSet(engine, root, px, k, P, both);
  console.log('sheet ms', Math.round(performance.now() - t0), 'items', realItems().length);
  (window as unknown as { __done: boolean }).__done = true;
}
function sheetSet(engine: Engine, root: HTMLElement, px: number, k: number, P: URLSearchParams, both: boolean) {
  const pad = both ? 10 : 18;
  const all = realItems(), skip = Number(P.get('skip') ?? 0);
  const order = ITEM_GROUPS.flatMap((g) => all.filter((i) => itemDef(i).group === g.k));
  for (const g of ITEM_GROUPS) {
    const ids = all.filter((i) => itemDef(i).group === g.k && order.indexOf(i) >= skip);
    if (!ids.length) continue;
    const head = document.createElement('div');
    Object.assign(head.style, { width: `${px * k + pad}px`, height: `${px * k + pad}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '16px Alagard, Title, monospace', color: '#d8ac5b', textShadow: '1px 1px 0 #07060c, -1px -1px 0 #07060c, 1px -1px 0 #07060c, -1px 1px 0 #07060c', textTransform: 'uppercase' });
    head.textContent = g.name;
    root.appendChild(head);
    for (const id of ids) {
      const ic = renderIcon(engine.renderer, id, { size: px, line: 1 });
      const cell = document.createElement('div');
      Object.assign(cell.style, { width: `${px * k + pad}px`, height: `${px * k + pad}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3d4346', boxShadow: 'inset 0 0 0 2px #2f2e31, inset 2px 2px 0 2px #54595c' });
      const img = document.createElement('img'); img.src = iconURL(ic, k); img.width = px * k; img.height = px * k; img.style.imageRendering = 'pixelated'; img.title = id;
      cell.appendChild(img); root.appendChild(cell);
    }
  }
  if (both) { const br = document.createElement('div'); br.style.cssText = 'flex-basis:100%;height:10px'; root.appendChild(br); }
}

// ------------------------------------------------------------------ the bake (writes src/inv/itemSprites.ts via scripts)
function bake(engine: Engine) {
  const out: Record<string, [string, string]> = {};
  const b64 = (a: Uint8ClampedArray) => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
  for (const id of realItems()) {
    const a = renderIcon(engine.renderer, id, { size: 32, line: 1 }), b = renderIcon(engine.renderer, id, { size: 64, line: 1 });
    out[id] = [b64(a.rgba), b64(b.rgba)];
  }
  (window as unknown as { __bake: unknown }).__bake = out;
}

// ------------------------------------------------------------------ the zoo
/** the 30 most common resources, in rows */
export const ZOO: ItemId[] = ['wood', 'plank', 'bark', 'leaves', 'fibre', 'resin', 'fruit', 'seed_cone', 'carbon', 'soil', 'topsoil', 'clay', 'sand', 'gravel',
  'rock_granite', 'rock_basalt', 'rock_limestone', 'rock_sandstone', 'rock_slate', 'ore', 'copper_ore', 'coal', 'sulphur', 'gold_ore', 'crystal', 'lumen_crystal', 'gravium',
  'iron_ingot', 'copper_ingot', 'water', 'brine', 'gear', 'iron_plate', 'motor'];
function zoo(engine: Engine, P: URLSearchParams) {
  const page = Number(P.get('page') ?? 0), per = Number(P.get('per') ?? 5);
  const ids = (P.get('ids')?.split(',') as ItemId[] | undefined) ?? ZOO.slice(page * per, page * per + per);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a323e);
  scene.add(new THREE.HemisphereLight(0xc9d6e2, 0x5a4a38, 1.2));
  const sun = new THREE.DirectionalLight(0xffe2bc, 2.9); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.015;
  scene.add(sun, sun.target);
  // a floor of packed sand at the world's texel density (UVs in metres)
  const fg = new THREE.PlaneGeometry(60, 40); const fuv = fg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 60, fuv.getY(i) * 40);
  const fm = new THREE.MeshLambertMaterial({ map: colorTex(P.get('floor') ?? 'concrete'), color: 0xb8b4ac }); gbuf(fm, 0);
  const ground = new THREE.Mesh(fg, fm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // a row per resource at true scale: its variants, then its pile at three sizes
  const all = new THREE.Box3(); let z = 0;
  ids.forEach((id) => {
    const f = formOf(id), objs: { g: THREE.Object3D; w: number; d: number }[] = [];
    const nv = Math.max(2, Math.min(4, f.variants));
    for (let v = 0; v < nv; v++) { const u = unitOf(id, v, v); const m = meshesOf(u.M.build()); m.rotation.y = 0.55 - v * 0.3; const b = new THREE.Box3().setFromObject(m); objs.push({ g: m, w: b.max.x - b.min.x, d: b.max.z - b.min.z }); }
    const gap0 = objs.length;
    for (const n of sizes(id)) { const g = meshesOf(pileGeo(id, n, 3 + n)); g.rotation.y = -0.45; const b = new THREE.Box3().setFromObject(g); objs.push({ g, w: b.max.x - b.min.x, d: b.max.z - b.min.z }); }
    const unitGap = Math.max(0.08, objs[0].w * 0.25), pileGap = Math.max(0.2, objs[objs.length - 1].w * 0.18);
    const depth = Math.max(...objs.map((o) => o.d));
    let x = 0;
    objs.forEach((o, i) => { if (i === gap0) x += pileGap * 1.6; const b = new THREE.Box3().setFromObject(o.g), c = b.getCenter(new THREE.Vector3()); o.g.position.set(x + o.w / 2 - c.x, 0, z + depth / 2 - c.z); x += o.w + (i < gap0 ? unitGap : pileGap); scene.add(o.g); all.union(new THREE.Box3().setFromObject(o.g)); });
    z += depth + Math.max(0.25, depth * 0.35);
  });
  // centre the lot on the origin and frame it
  const c = all.getCenter(new THREE.Vector3()), sz = all.getSize(new THREE.Vector3());
  for (const o of [...scene.children]) if (o !== ground && !(o as THREE.Light).isLight) o.position.sub(new THREE.Vector3(c.x, 0, c.z));
  sun.position.set(-sz.x * 0.4 - 4, 12, sz.z * 0.5 + 6); sun.target.position.set(0, 0, 0);
  const R = Math.max(sz.x, sz.z) * 0.62 + 0.5; Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 0.5, far: 60 }); sun.shadow.camera.updateProjectionMatrix();
  const cam = new THREE.PerspectiveCamera(Number(P.get('fov') ?? 28), innerWidth / innerHeight, 0.05, 200);
  const pitch = Number(P.get('pitch') ?? 0.78), fit = () => {
    const a = innerWidth / innerHeight, vf = (cam.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * a);
    const dW = (sz.x * 0.5 * 1.04) / Math.tan(hf / 2), dH = ((sz.z * Math.sin(pitch) + sz.y * Math.cos(pitch)) * 0.5 * 1.08) / Math.tan(vf / 2);
    const d = Math.max(dW, dH) + sz.z * 0.5 * Math.cos(pitch) * 0.4;
    cam.position.set(0, Math.sin(pitch) * d, Math.cos(pitch) * d + 0.02); cam.lookAt(0, sz.y * 0.2, 0);
  };
  engine.setScreen({
    update() {},
    render(post, t) { resetGrade(post.grade); post.grade.vig = 0.25; post.grade.bloom = 0.35; post.render(scene, cam, undefined, t); },
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); fit(); },
  });
  fit();
  engine.start();
  (window as unknown as { __done: boolean }).__done = true;
}
/** three pile sizes that read for this kind */
function sizes(id: ItemId): number[] {
  const k = formOf(id).pile;
  return k === 'mound' ? [3, 9, 24] : k === 'logs' ? [3, 6, 10] : k === 'chunks' ? [4, 10, 24] : k === 'boards' ? [3, 8, 14] : k === 'stack' ? [3, 8, 16] : k === 'cans' || k === 'crates' ? [2, 4, 8] : [2, 5, 10];
}

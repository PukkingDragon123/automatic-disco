// ?drop: a small yard (an open crate, a soil pit and an ore bunker, stocked) under the post pipeline, with the real
// stores, container models and ResourceWorld on a stand-in game shell. window.__drop(kind, item, n) puts n of an
// item into that container: it drops in, bounces, squashes and puffs dust by weight. Time is stepped by hand for
// shots: window.__advance(seconds) runs the game that long, then draws one frame.
import * as THREE from 'three';
import type { Engine } from '../../app/engine';
import type { Game } from '../../game/game';
import { resetGrade } from '../../gfx/post';
import { gbuf } from '../../gfx/gbuf';
import { colorTex } from './paint';
import { KIND_INFO, type ContainerKind } from '../../inv/kinds';
import type { ItemId } from '../../factory/items';

export async function dropTest(engine: Engine, P: URLSearchParams) {
  const { Run } = await import('../../game/run');
  const { Storage } = await import('../../inv/storage');
  const { ContainerRender } = await import('../../inv/render');
  const { preloadContainerModels } = await import('../../inv/models');
  const { ResourceWorld } = await import('./world');
  const { Fx } = await import('../../game/fx');
  preloadContainerModels();
  const scene = new THREE.Scene(), fxScene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a323e);
  scene.add(new THREE.HemisphereLight(0xc9d6e2, 0x5a4a38, 1.25));
  const sun = new THREE.DirectionalLight(0xffe2bc, 2.9); sun.position.set(-5, 9, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 30 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.015;
  scene.add(sun, sun.target);
  const fg = new THREE.PlaneGeometry(30, 30); const fuv = fg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 30, fuv.getY(i) * 30);
  const fm = new THREE.MeshLambertMaterial({ map: colorTex('dirt') }); gbuf(fm, 0);
  const ground = new THREE.Mesh(fg, fm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const cam = new THREE.PerspectiveCamera(Number(P.get('fov') ?? 32), innerWidth / innerHeight, 0.05, 100);
  cam.position.set(Number(P.get('cx') ?? 0.3), Number(P.get('cy') ?? 6.4), Number(P.get('cz') ?? 6.2)); cam.lookAt(Number(P.get('lx') ?? 0.1), 0.25, Number(P.get('lz') ?? -0.25));
  const handlers: Record<string, ((d: unknown) => void)[]> = {};
  const fx = new Fx(fxScene, scene);
  const fg2 = {
    run: new Run(7), opts: { seed: 7 }, update$: [] as ((dt: number) => void)[], region: null, factory: undefined,
    world: { scene, fxScene, surfaceY: () => 0 }, fx, veyr: { core: { x: 0, y: 0, z: 0 } }, cam: { cam }, audible: () => 1,
    on(ev: string, f: (d: unknown) => void) { (handlers[ev] ??= []).push(f); },
    emit(ev: string, d?: unknown) { for (const f of handlers[ev] ?? []) f(d); },
  };
  fg2.run.flags['inv.tut'] = 1;
  const g = fg2 as unknown as Game;
  const st = new Storage(g);
  (fg2 as unknown as { storage: unknown }).storage = st;
  const yard: [ContainerKind, number, number, number, [ItemId, number][]][] = [
    ['crate', -1.25, 0.2, 0.12, [['wood', 6], ['plank', 14], ['iron_ingot', 20], ['rock_granite', 8], ['gear', 22], ['fruit', 14]]],
    ['st_pit', 1.25, 0.2, -0.12, [['soil', 140], ['sand', 70], ['topsoil', 60], ['clay', 25]]],
    ['st_bunker', 0, -1.9, 0, [['ore', 120], ['coal', 80], ['copper_ore', 40], ['gravel', 60]]],
  ];
  let bid = 1;
  for (const [k, x, z, ry, load] of yard) {
    const b = { id: 9000 + bid++, kind: k, x, z, cx: 0, cz: 0, dead: false, sat: 1, on: true, plug: null, store: new Map(), def: { power: KIND_INFO[k].power }, y: 0, r: 0, rise: 1 };
    const c = st.attach(b as never); c.born = 0;
    for (const [id, n] of load) c.insert(id, n);
    void ry;
  }
  const render = new ContainerRender(g, st);
  const res = new ResourceWorld(g, st, render);
  const byKind = (k: string) => st.containers.find((c) => c.kind === k)!;
  const w = window as unknown as Record<string, unknown>;
  w.__drop = (k: string, item: ItemId, n = 1) => st.insert(byKind(k), item, n);
  w.__res = res; w.__st = st;
  // QA: the real floor inside each container body (local y), probed down through the bay
  w.__floor = () => {
    const out: Record<string, number[]> = {}, rc = new THREE.Raycaster();
    for (const c of st.containers) {
      const m = render.modelOf(c)!; m.root.updateMatrixWorld(true); const B = m.bayOf(), body = m.root.children[0];
      out[c.kind] = [];
      for (const [fx, fz] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
        const p = m.root.localToWorld(new THREE.Vector3(B.x0 + (B.x1 - B.x0) * fx, 3, B.z0 + (B.z1 - B.z0) * fz));
        rc.set(p, new THREE.Vector3(0, -1, 0)); const h = rc.intersectObject(body, true)[0];
        out[c.kind].push(h ? Math.round(m.root.worldToLocal(h.point.clone()).y * 100) / 100 : -1);
      }
    }
    return JSON.stringify(out);
  };
  let t = 0;
  const step = (dt: number) => { t += dt; for (const f of fg2.update$) f(dt); fx.update(dt, engine.h, cam.fov); };
  const screen = {
    update(dt: number) { step(dt); },
    render(post: import('../../gfx/post').Post, tt: number) { resetGrade(post.grade); post.grade.vig = 0.28; post.grade.bloom = 0.35; post.render(scene, cam, fxScene, tt); },
    resize(ww: number, hh: number) { cam.aspect = ww / hh; cam.updateProjectionMatrix(); },
  };
  engine.setScreen(screen);
  // the container bodies stream in: let the yard settle, then hand over
  w.__advance = (sec: number) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) engine.step(1 / 60, false); engine.step(1 / 60, true); return t; };
  if (P.has('live')) engine.start(); else { const warm = () => { engine.step(1 / 30, true); }; for (let i = 0; i < 4; i++) setTimeout(warm, 1500 * i); }
  w.__ready = true;
}

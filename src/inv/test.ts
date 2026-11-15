// ?test=inv: the inventory for visual QA.
//   &sheet            every item icon, grouped, with its name, size and stack (no game)
//   &models           every container model in a yard, loaded (no game); &cut shows the HUD's cut-away versions
//   (default)         a region with one of each container placed by the pod and stocked, the crate HUD on
//     &open=k[,k2]    open container k's grid window (0 = the hold), two side by side
//     &sort=type &filter=bio &q=text &settings &page=n &tut (run the stores tutorial) &tutstep=n
import * as THREE from 'three';
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import type { BiomeKey } from '../world/region';
import type { Game } from '../game/game';
import { ITEM_IDS, ITEM_GROUPS, ITEMS, itemDef, itemIcon, type ItemId, type ItemGroup } from '../factory/items';
import { Container } from './container';
import { ContainerModel } from './models';
import { CONTAINER_KINDS, KIND_INFO, type ContainerKind } from './kinds';
import { injectCrateCSS } from '../ui/crates/style';

export async function testInv(engine: Engine, input: Input, P: URLSearchParams) {
  (await import('../ui/kit')).setupUI();
  (await import('../world/geo/items')).registerGeoItems();
  injectCrateCSS();
  if (P.has('sheet')) return sheet();
  (await import('./models')).preloadContainerModels();
  if (P.has('models')) return models(engine, P);
  if (P.has('icons')) return icons(P);
  if (P.has('stage')) return stage(engine, P);
  return game(engine, input, P);
}

// ------------------------------------------------------------------ the icon sheet
function sheet() {
  document.getElementById('view')!.style.display = 'none';
  const root = document.createElement('div');
  Object.assign(root.style, { position: 'fixed', inset: '0', overflow: 'auto', background: '#15181c var(--plate-dp) 0 0 / 128px', padding: '14px 18px', boxSizing: 'border-box', zIndex: '10' });
  const px = Number(new URLSearchParams(location.search).get('px') ?? 64);
  const all = ITEM_IDS.filter((i) => ITEMS[i].cat !== 'internal');
  let html = `<div style="font-family:Title;font-size:24px;line-height:24px;color:#d6cab0;margin-bottom:8px">REAL ITEMS · ${all.length} KINDS <span style="font-family:Body;font-size:22px;color:#8f856e">lowpix sprites, 32 px at 2x · size in cells · stack · shelf life</span></div><div style="display:grid;grid-template-columns:repeat(12,1fr);gap:3px 5px">`;
  for (const g of ITEM_GROUPS) {
    const ids = all.filter((i) => itemDef(i).group === g.k);
    html += `<div style="display:flex;flex-direction:column;justify-content:center;align-items:flex-start;height:${px + 28}px;border-left:4px solid var(--amber);padding-left:8px;background:rgba(0,0,0,.25)"><div style="font-family:Title;font-size:24px;line-height:24px;color:#d9a43a">${g.name.toUpperCase()}</div><div style="font-family:Body;font-size:22px;line-height:22px;color:#8f856e">${ids.length}</div></div>`;
    for (const id of ids) {
      const d = itemDef(id);
      html += `<div style="display:flex;flex-direction:column;align-items:center;height:${px + 28}px;background:rgba(4,18,9,.55);box-shadow:inset 0 0 0 2px #1b3525"><img src="${itemIcon(id, px)}" width="${px}" height="${px}" style="image-rendering:pixelated;margin-top:2px">` +
        `<div style="font-family:Body;font-size:11px;line-height:11px;color:#e5dbc3;white-space:nowrap;overflow:hidden;max-width:100%">${d.name}</div><div style="font-family:Body;font-size:11px;line-height:11px;color:#a99c84">${d.size[0]}×${d.size[1]} · ${d.stack}${d.perish ? ` · <span style="color:var(--amber)">${d.perish.days}d</span>` : ''}</div></div>`;
    }
  }
  root.innerHTML = html + '</div>';
  document.body.appendChild(root);
}

// ------------------------------------------------------------------ the model yard
/** a believable load for a kind */
function stock(c: Container, seed = 0) {
  const loads: Record<ContainerKind, [ItemId, number][]> = {
    crate: [['wood', 12], ['fruit', 18], ['rock_granite', 9], ['gear', 14], ['seed_tree', 20], ['bark', 22], ['berries', 8], ['iron_plate', 30]],
    st_bin: [['ore', 60], ['gravel', 70], ['sand', 40], ['copper_ore', 30], ['plank', 30], ['clay', 25], ['coal', 40], ['iron_rod', 50]],
    st_pit: [['soil', 140], ['topsoil', 90], ['clay', 60], ['sand', 70], ['compost', 30], ['gravel', 50], ['dung', 20]],
    st_bunker: [['ore', 120], ['coal', 90], ['copper_ore', 60], ['rock_basalt', 24], ['gravel', 100], ['gold_ore', 16], ['rock_slate', 12]],
    st_freezer: [['meat', 9], ['fruit', 30], ['tissue', 6], ['egg', 4], ['berries', 16], ['embryo', 3], ['mushroom', 12]],
    st_tank: [['water', 160], ['sap', 40], ['bio_oil', 30]],
    silo: [['seed_grass', 200], ['feed', 90], ['sand', 120], ['seed_flower', 60]],
    st_cabinet: [['tissue', 18], ['blood_sample', 12], ['egg', 6], ['venom_gland', 8], ['plant_cutting', 10], ['spore_fungus', 22]],
    st_vault: [['seed_tree', 40], ['seed_cone', 20], ['seed_palm', 12], ['seed_bulb', 16], ['seed_crystal', 6], ['seed_trap', 14], ['spore_fern', 50], ['seed_cactus', 30]],
    hold: [['ore', 40], ['carbon', 30], ['wood', 8], ['leaves', 30], ['water', 20], ['soil', 50], ['seed_grass', 12], ['tissue', 3], ['rock_granite', 6]],
  };
  for (const [id, n] of loads[c.kind].slice(seed % 2)) c.insert(id, n);
}
function models(engine: Engine, P: URLSearchParams) {
  const cut = P.has('cut');
  const r = engine.renderer;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a3036);
  scene.add(new THREE.HemisphereLight(0xc8d4dc, 0x5a4a38, 1.4));
  const sun = new THREE.DirectionalLight(0xffe4c0, 2.6); sun.position.set(-6, 10, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 0.5, far: 40 }); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshLambertMaterial({ color: 0x5a5e48 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const kinds = [...CONTAINER_KINDS, 'hold' as ContainerKind];
  const out: ContainerModel[] = [];
  // two rows: the low open kinds in front, the tall ones behind
  const rows: ContainerKind[][] = [['crate', 'st_pit', 'st_bunker', 'st_bin', 'hold'], ['st_freezer', 'st_cabinet', 'st_tank', 'silo', 'st_vault']];
  rows.forEach((row, ri) => {
    const ws = row.map((k) => (k === 'hold' ? 1.5 : KIND_INFO[k].foot[0]));
    const gap = 1.1, total = ws.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
    let x = -total / 2;
    row.forEach((k, i) => {
      const c = new Container(k, ri * 5 + i + 1); stock(c, i);
      const m = new ContainerModel(c, { cutaway: cut });
      m.root.position.set(x + ws[i] / 2, 0, ri ? -2.4 : 1.6);
      m.root.rotation.y = -0.22;
      x += ws[i] + gap;
      scene.add(m.root); out.push(m);
    });
  });
  // find any geometry with a broken position (QA)
  scene.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (!g) return; const a = g.attributes.position?.array; if (a && Array.from(a).some((v) => !Number.isFinite(v))) console.warn('NaN geometry under', (o.parent?.parent?.userData.container as Container | undefined)?.kind, o.parent === null); });
  (window as unknown as { __models: unknown }).__models = out;
  const cam = new THREE.PerspectiveCamera(Number(P.get('fov') ?? 30), innerWidth / innerHeight, 0.1, 100);
  cam.position.set(Number(P.get('cx') ?? 0), Number(P.get('cy') ?? 7.4), Number(P.get('cz') ?? 14.5)); cam.lookAt(Number(P.get('lx') ?? 0), Number(P.get('ly') ?? 0.7), Number(P.get('lz') ?? -0.6));
  r.shadowMap.enabled = true;
  const loop = () => { requestAnimationFrame(loop); for (const m of out) m.update(); r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); r.setRenderTarget(null); r.render(scene, cam); };
  loop();
  // names under the models
  const lab = document.createElement('div');
  Object.assign(lab.style, { position: 'fixed', left: '0', right: '0', top: '18px', textAlign: 'center', fontFamily: 'Superwide', fontSize: '16px', color: '#d9d2bf', letterSpacing: '1px', zIndex: '5' });
  lab.style.fontFamily = 'Title'; lab.style.fontSize = '24px'; lab.style.letterSpacing = '0';
  lab.textContent = cut ? 'CONTAINERS · CUT AWAY (CRATE HUD MINIATURES)' : 'CONTAINERS · ' + kinds.map((k) => KIND_INFO[k].name.toUpperCase()).join(' · ');
  document.body.appendChild(lab);
}

// ------------------------------------------------------------------ badge illustrations: the real models, rendered
/** each container kind's real model (Poly Haven bodies, lowpix-converted) rendered at 4x on a transparent ground from
 *  the badge's three-quarter view; `window.__icons` = { kind: dataURL } once done. src/inv/sprites/make_ui.py --icons
 *  shrinks them to 40 px art, snaps them to the palette and outlines them (public/inv/ui/kind_<kind>.png). */
async function icons(P: URLSearchParams) {
  const S = 256, kinds = [...CONTAINER_KINDS, 'hold' as ContainerKind];
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(S, S, false); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
  document.body.appendChild(r.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xd8e0e4, 0x4a3c2c, 1.25));
  const key = new THREE.DirectionalLight(0xffe8c8, 2.9); key.position.set(-4, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4d0, 0.8); rim.position.set(5, 3, -4); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(18, 1, 0.1, 100);
  const out: Record<string, string> = {};
  // &glb=id=url,id=url renders those models instead (real 3D forms for item sprites: make_items.py --real)
  const glb = P.get('glb')?.split(',').map((e) => e.split('=') as [string, string]) ?? null;
  let objs: { id: string; root: THREE.Object3D; update?(): void; ready(): boolean }[];
  if (glb) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const ld = new GLTFLoader();
    objs = await Promise.all(glb.map(async ([id, url]) => { const g = await ld.loadAsync(url); const root = new THREE.Group(); root.add(g.scene); root.rotation.y = -0.6; return { id, root, ready: () => true }; }));
  } else {
    objs = kinds.map((k, i) => { const c = new Container(k, i + 1); stock(c, i); const m = new ContainerModel(c); m.root.rotation.y = -0.5; return { id: k, root: m.root, update: () => m.update(), ready: () => (m.root.children[0]?.children.length ?? 0) > 1 }; });
  }
  const dir = new THREE.Vector3(0.22, glb ? 0.62 : 0.78, 1).normalize();
  const shoot = () => {
    for (const o of objs) {
      o.update?.(); scene.add(o.root);
      const box = new THREE.Box3().setFromObject(o.root), ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const rad = sz.length() / 2, dist = rad / Math.sin((cam.fov * Math.PI) / 360) * 1.02;
      cam.position.copy(ctr).addScaledVector(dir, dist); cam.lookAt(ctr); cam.near = dist / 50; cam.far = dist * 4; cam.updateProjectionMatrix();
      r.render(scene, cam); out[o.id] = r.domElement.toDataURL('image/png');
      scene.remove(o.root);
    }
    (window as unknown as { __icons: unknown }).__icons = out;
  };
  // the Poly Haven bodies stream in: shoot once every model has its loaded body (or after a long wait)
  const t0 = performance.now();
  const wait = () => { const done = objs.every((o) => o.ready()) && performance.now() - t0 > (glb ? 500 : 6000); if (done || performance.now() - t0 > 40000) shoot(); else setTimeout(wait, 500); };
  wait();
}

// ------------------------------------------------------------------ a region with the stores built
async function game(engine: Engine, input: Input, P: URLSearchParams) {
  const { Game } = await import('../game/game');
  const g: Game = new Game(engine, input, { seed: Number(P.get('seed') ?? 5), biome: (P.get('biome') ?? 'meadow') as BiomeKey, story: false });
  const sk = g.run.skills;
  for (const id of ['torso', 'armR', 'drill', 'excavate', 'siphon', 'intake', 'tanks', 'works', 'assembler', 'steam', 'haul', 'operate', 'chem']) sk.owned.add(id);
  for (const r of ['ore', 'carbon', 'water', 'soil'] as const) g.run.res[r] = 60;
  (g as unknown as { hatchT: number }).hatchT = 8.95;
  if (!P.has('tut')) g.run.flags['inv.tut'] = 1;
  const f = g.factory, st = g.storage, core = g.veyr.core!;
  const want = (P.get('kinds')?.split(',') as ContainerKind[] | undefined) ?? ['crate', 'st_pit', 'st_bunker', 'st_bin', 'st_freezer', 'st_tank', 'silo', 'st_cabinet', 'st_vault'];
  // lay the yard in an arc in front of the pod
  let placed = 0;
  for (const k of want) {
    const I = KIND_INFO[k];
    let done = false;
    for (let ring = 5; ring < 22 && !done; ring += 1.5) for (let a = 0; a < 24 && !done; a++) {
      const ang = Math.PI * 0.5 + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * 0.28 + placed * 0.0;
      const cx = Math.floor(core.x + Math.cos(ang) * ring - I.foot[0] / 2), cz = Math.floor(core.z + Math.sin(ang) * ring - I.foot[1] / 2);
      if (f.why(k, cx, cz, 0, true)) continue;
      const b = f.place(k, cx, cz, 0, true);
      if (b) { b.rise = 1; done = true; placed++; }
    }
  }
  for (const c of st.containers) stock(c, c.id);
  st.hold.stacks = []; stock(st.hold);
  st.containers.forEach((c, i) => { c.born = 0; if (i === 0) { c.label = 'TIMBER 01'; c.logo = 'leaf'; } });
  (window as unknown as { __st: unknown }).__st = st;
  engine.setScreen(g);
  engine.start();
  const iv = setInterval(() => {
    if (!g.player?.started && !P.has('nowait')) return;
    clearInterval(iv);
    const a = st.containers[Math.floor(st.containers.length / 2)];
    if (a?.b) { g.cam.lookAt(a.b.x, a.b.z, true); }
    g.cam.distGoal = g.cam.dist = Number(P.get('dist') ?? 22);
    const inv = g.inventory!;
    if (P.has('page') && inv.hud) inv.hud.page = Number(P.get('page'));
    if (P.has('open')) {
      const ids = P.get('open')!.split(',').map(Number);
      const all = st.all();
      const ui = (inv.hud as unknown as { ui: import('../ui/crates/grid').InvUI }).ui;
      for (const i of ids) if (all[i]) ui.open(all[i]);
      const w = ui.wins[0];
      if (w && P.has('sort')) (w as unknown as { doSort(k: string): void }).doSort(P.get('sort')!);
      if (w && P.has('filter')) { (w as unknown as { group: ItemGroup }).group = P.get('filter') as ItemGroup; (w as unknown as { renderChips(): void; applyFilter(): void }).renderChips(); (w as unknown as { applyFilter(): void }).applyFilter(); }
      if (w && P.has('q')) { const inp = w.root.querySelector('input')!; inp.value = P.get('q')!; inp.dispatchEvent(new Event('input')); }
      if (P.has('settings')) { const ww = ui.wins[ui.wins.length - 1] as unknown as { settings: boolean; renderSettings(): void }; ww.settings = true; ww.renderSettings(); }
    }
    if (P.has('tut') && inv.tutorial) { inv.tutorial.start(); const n = Number(P.get('tutstep') ?? 0); if (n) (inv.tutorial as unknown as { go(i: number): void }).go(n); }
  }, 250);
}

// ------------------------------------------------------------------ the stage: the real stores and UI over the model yard, without a world
/** a minimal game shell: run, events, a tick list. Containers stand in the yard (no works grid), so the HUD, the grid
 *  windows and the tutorial can be checked in seconds on a loaded machine */
async function stage(engine: Engine, P: URLSearchParams) {
  const { Run } = await import('../game/run');
  const { Storage } = await import('./storage');
  const { invUI } = await import('../ui/crates/grid');
  const { CrateHud } = await import('../ui/crates/hud');
  const { StoresTutorial } = await import('../ui/crates/tutorial');
  const handlers: Record<string, ((d: unknown) => void)[]> = {};
  const fg = {
    run: new Run(7), opts: { seed: 7 }, update$: [] as ((dt: number) => void)[], region: null, world: null, factory: undefined,
    fx: { mote() {}, burst() {} }, veyr: { core: { x: 0, y: 0, z: 0 } },
    on(ev: string, f: (d: unknown) => void) { (handlers[ev] ??= []).push(f); },
    emit(ev: string, d?: unknown) { for (const f of handlers[ev] ?? []) f(d); },
  };
  if (!P.has('tut')) fg.run.flags['inv.tut'] = 1;
  const g = fg as unknown as Game;
  const st = new Storage(g);
  (fg as unknown as { storage: unknown }).storage = st;
  const want = (P.get('kinds')?.split(',') as ContainerKind[] | undefined) ?? ['crate', 'st_pit', 'st_bunker', 'st_bin', 'st_freezer', 'st_tank', 'silo', 'st_cabinet', 'st_vault'];
  // the yard: each container's model stands where its building would
  const r = engine.renderer;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x232a2c);
  scene.fog = new THREE.Fog(0x232a2c, 18, 40);
  scene.add(new THREE.HemisphereLight(0xc8d4dc, 0x5a4a38, 1.3));
  const sun = new THREE.DirectionalLight(0xffe4c0, 2.6); sun.position.set(-6, 10, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 0.5, far: 40 }); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshLambertMaterial({ color: 0x4e5240 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const models: ContainerModel[] = [];
  let id = 1;
  want.forEach((k, i) => {
    const row = i < 5 ? 0 : 1, col = row ? i - 5 : i;
    const b = { id: 9000 + id++, kind: k, x: -8 + col * 4 + row * 2, z: row ? -3 : 1.5, cx: 0, cz: 0, dead: false, sat: 1, on: true, plug: null, store: new Map(), def: { power: KIND_INFO[k].power }, y: 0, r: 0, rise: 1 };
    const c = st.attach(b as never);
    c.born = 0;
    stock(c, i);
    const m = new ContainerModel(c); m.root.position.set(b.x, 0, b.z); m.root.rotation.y = -0.2; scene.add(m.root); models.push(m);
  });
  st.hold.stacks = []; stock(st.hold);
  if (st.containers[0]) { st.containers[0].label = 'TIMBER 01'; st.containers[0].logo = 'leaf'; st.containers[0].touch(); }
  // a new container, as if just built: it pops into the HUD (QA: __addContainer('st_bin'))
  (window as unknown as { __addContainer(k: ContainerKind): void }).__addContainer = (k: ContainerKind) => {
    const n = st.containers.length;
    const b = { id: 9000 + id++, kind: k, x: -8 + (n % 5) * 4, z: 6, cx: 0, cz: 0, dead: false, sat: 1, on: true, plug: null, store: new Map(), def: { power: KIND_INFO[k].power }, y: 0, r: 0, rise: 1 };
    const c = st.attach(b as never); stock(c, n);
    const m = new ContainerModel(c); m.root.position.set(b.x, 0, b.z); scene.add(m.root); models.push(m);
  };
  const ui = invUI(g)!;
  const hud = new CrateHud(g, st, ui);
  const tut = new StoresTutorial(g, st, ui, hud);
  (window as unknown as { __st: unknown; __ui: unknown; __hud: unknown; __tut: unknown }).__st = st;
  Object.assign(window, { __ui: ui, __hud: hud, __tut: tut });
  const cam = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
  cam.position.set(Number(P.get('cx') ?? 1), Number(P.get('cy') ?? 8.5), Number(P.get('cz') ?? 15)); cam.lookAt(Number(P.get('lx') ?? 1), 0.4, -1);
  r.shadowMap.enabled = true;
  let last = performance.now();
  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    for (const f of fg.update$) f(dt);
    for (const m of models) m.update();
    // &still: the yard is drawn a few times while its models stream in, then left as a backdrop (fast QA shots)
    if (still && now - t0 > 12000) return;
    if (still && now - lastDraw < 2000) return;
    lastDraw = now;
    r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); r.setRenderTarget(null); r.render(scene, cam);
  };
  const still = P.has('still'), t0 = performance.now(); let lastDraw = 0;
  loop();
  // the scripted views
  if (P.has('page')) hud.page = Number(P.get('page'));
  if (P.has('open')) {
    const all = st.all();
    for (const i of P.get('open')!.split(',').map(Number)) if (all[i]) ui.open(all[i]);
    const w = ui.wins[0] as unknown as { doSort(k: string): void; group: ItemGroup; renderChips(): void; applyFilter(): void; root: HTMLElement };
    if (w && P.has('sort')) w.doSort(P.get('sort')!);
    if (w && P.has('filter')) { w.group = P.get('filter') as ItemGroup; w.renderChips(); w.applyFilter(); }
    if (w && P.has('q')) { const inp = w.root.querySelector('input')!; inp.value = P.get('q')!; inp.dispatchEvent(new Event('input')); }
    if (P.has('settings')) { const ww = ui.wins[ui.wins.length - 1] as unknown as { settings: boolean; renderSettings(): void; keepOnScreen(): void }; ww.settings = true; ww.renderSettings(); ww.keepOnScreen(); }
  }
  if (P.has('tut')) { tut.start(); const n = Number(P.get('tutstep') ?? 0); if (n) (tut as unknown as { go(i: number): void }).go(n); }
}

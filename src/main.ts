// Boot: the full game flow (src/flow.ts); ?test=world|eco|game|studio|child|mirror|ui|skills|lab open single pieces for visual QA.
import * as THREE from 'three';
import { Engine } from './app/engine';
import { Input } from './app/input';
import { RtsCam } from './app/rtsCam';
import { Region, BIOMES, type BiomeKey } from './world/region';
import { planetPalette } from './world/palette';
import { Terrain } from './world/terrain';
import { Flora } from './world/flora';
import { Sun } from './gfx/lights';
import { gbuf } from './gfx/gbuf';
import { wildDesign, pheno, type Role } from './life/design';
import { buildSpeciesModel, makeInstance } from './life/creatureMesh';
import { Animator } from './life/anim';
import { World } from './game/world';
import { Registry } from './game/species';
import { Rand } from './core/rand';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const engine = new Engine(canvas);
const input = new Input(canvas);
const P = new URLSearchParams(location.search);
(window as any).__engine = engine;

function testWorld() {
  const seed = Number(P.get('seed') ?? 7);
  const biome = (P.get('biome') ?? 'meadow') as BiomeKey;
  const pal = planetPalette(seed, P.get('pal') ?? undefined);
  const t0 = performance.now();
  const region = new Region(seed, BIOMES[biome], pal);
  const terrain = new Terrain(region);
  const flora = new Flora(region, terrain.moss, terrain.vis);
  console.log('gen ms', Math.round(performance.now() - t0), 'plants', flora.n);
  (window as any).__dbg = { region, terrain, flora, cam: null as any };
  const scene = new THREE.Scene();
  scene.add(terrain.group, flora.group);
  const sun = new Sun(pal, scene);
  const cam = new RtsCam(innerWidth / innerHeight);
  cam.bounds = { x0: 4, z0: 4, x1: region.N - 4, z1: region.N - 4 };
  cam.ground = (x, z) => region.groundSmooth(x, z);
  cam.lookAt(region.landing.x, region.landing.z, true);
  (window as any).__dbg.cam = cam;
  cam.dist = cam.distGoal = Number(P.get('dist') ?? 34);
  if (P.has('yaw')) cam.yaw = cam.yawGoal = Number(P.get('yaw'));
  // demo moss patch around the landing site
  if (P.has('moss')) {
    for (let z = 0; z < region.N; z++) for (let x = 0; x < region.N; x++) {
      const d = Math.hypot(x + 0.5 - region.landing.x, z + 0.5 - region.landing.z);
      terrain.setMoss(z * region.N + x, Math.max(0, Math.min(1, (14 - d) / 4)));
      const d2 = Math.hypot(x + 0.5 - region.landing.x - 30, z + 0.5 - region.landing.z);
      terrain.setCreep(z * region.N + x, Math.max(0, Math.min(1, (10 - d2) / 4)));
    }
    terrain.setRival(1, region.landing.x + 30, region.landing.z);
    terrain.mossFlush();
  }
  // creature lineup
  const zoo: { an: Animator; mesh: THREE.Object3D; speed: number; state: any }[] = [];
  if (P.has('zoo')) {
    const roles: Role[] = ['mite', 'flyer', 'stalker', 'grazer', 'tank', 'apex', 'scavenger', 'snail'];
    const z0 = region.landing.z;
    let x = region.landing.x - 12;
    const only = P.get('only');
    roles.forEach((role, i) => {
      if (only && only !== role) return;
      const d = wildDesign(role, pal, seed * 100 + i + Number(P.get('zs') ?? 0));
      const m = buildSpeciesModel(d);
      const { mesh, bones } = makeInstance(m);
      const ph = pheno(d);
      mesh.position.set(x, region.groundSmooth(x, z0), z0);
      mesh.rotation.y = Number(P.get('ry') ?? 0.9);
      scene.add(mesh);
      const an = new Animator(m.rig, bones, mesh);
      const mode = P.get('mode') ?? 'move';
      zoo.push({ an, mesh, speed: mode === 'move' ? Math.min(2.2, ph.stats.speed * 0.5) : 0, state: mode === 'dead' ? 'dead' : mode === 'attack' ? 'attack' : role === 'flyer' && mode === 'move' ? 'fly' : mode === 'move' ? 'move' : 'idle' });
      console.log(role, d.name, d.plan, 'L', ph.length.toFixed(2), 'kg', Math.round(ph.stats.mass), 'spd', ph.stats.speed.toFixed(1), ph.warnings.join(' | '));
      x += Math.max(2.2, ph.length * 1.4 + 1);
      if (only) cam.lookAt(mesh.position.x, mesh.position.z, true);
    });
  }
  engine.setScreen({
    update(dt, t) {
      for (const z of zoo) z.an.update(dt, { speed: z.speed, turn: 0, state: z.state, act: (t * 0.7) % 1, lookYaw: Math.sin(t) * 0.5, lookPitch: 0, ground: (x, zz) => region.groundSmooth(x, zz), air: 1.2 });
      cam.update(dt, input);
      sun.follow(cam.target, cam.dist);
      terrain.update(t); flora.update(t, cam.cam); flora.tick(dt);
      input.endFrame();
    },
    render(post, t) { post.render(scene, cam.cam, undefined, t); },
    resize(w, h) { cam.cam.aspect = w / h; cam.cam.updateProjectionMatrix(); },
  });
  engine.start();
}

function testEco() {
  const seed = Number(P.get('seed') ?? 3);
  const biome = (P.get('biome') ?? 'meadow') as BiomeKey;
  const pal = planetPalette(seed, P.get('pal') ?? undefined);
  const region = new Region(seed, BIOMES[biome], pal);
  const reg = new Registry();
  const w = new World(region, reg, seed);
  w.spawnFauna(new Rand(seed));
  const vd = w.terrain.visData(); for (let i = 0; i < vd.length; i += 4) { vd[i] = 255; vd[i + 1] = 255; } w.terrain.visFlush();
  const cam = new RtsCam(innerWidth / innerHeight);
  cam.bounds = { x0: 4, z0: 4, x1: region.N - 4, z1: region.N - 4 };
  cam.ground = (x, z) => region.groundSmooth(x, z);
  cam.lookAt(region.landing.x, region.landing.z, true);
  cam.dist = cam.distGoal = Number(P.get('dist') ?? 40);
  (window as any).__dbg = { w, cam, reg };
  // optional fast-forward to test the ecology
  const ff = Number(P.get('ff') ?? 0);
  for (let i = 0; i < ff * 10; i++) { cam.update(0.1, input); w.update(0.1, cam.cam); }
  console.log('species', reg.list.map((s) => `${s.name}[${s.role}] alive=${s.alive}`).join(', '));
  engine.setScreen({
    update(dt) { cam.update(dt, input); w.sun.follow(cam.target, cam.dist); w.update(dt, cam.cam); input.endFrame(); },
    render(post, t) { post.render(w.scene, cam.cam, w.fxScene, t); },
    resize(wd, h) { cam.cam.aspect = wd / h; cam.cam.updateProjectionMatrix(); },
  });
  engine.start();
}

async function testUI() {
  const kit = await import('./ui/kit');
  const { ICONS } = await import('./ui/icons');
  kit.setupUI();
  const root = kit.ui();
  const p = kit.panel('', root);
  p.style.cssText = 'position:absolute;left:20px;top:20px;width:720px;display:flex;flex-wrap:wrap;gap:6px';
  for (const n of Object.keys(ICONS)) new kit.Btn(p, { icon: n, hotkey: n.slice(0, 1).toUpperCase(), cost: '45', tip: () => `<h4>${n}</h4>tooltip text` }, () => {});
  const p2 = kit.panel('', root, 'dark');
  p2.style.cssText = 'position:absolute;left:20px;top:420px;width:420px;height:200px';
  p2.innerHTML = '<div class="hdr" style="font-size:28px">Brood Womb</div><div class="small">GESTATING · 3 IN QUEUE</div>';
  const b = new kit.Btn(p2, { label: 'Absorb', icon: 'dna', size: 'wide' }, () => {}); void b;
  new kit.Btn(p2, { label: 'Disabled', icon: 'helix', size: 'wide', disabled: () => true }, () => {});
  new kit.Btn(p2, { label: 'ACTIVE', icon: 'tree', size: 'wide', active: () => true }, () => {}).refresh();
  const bar = new kit.Bar(p2, 0x5ad86a); bar.set(0.62, '62 / 100'); bar.e.style.width = '200px';
  const bar2 = new kit.Bar(p2, 0xb08aff); bar2.set(0.3, 'charge'); bar2.e.style.width = '200px';
  const t = kit.el('div', 'title', root, 'ODDWORLD'); t.style.cssText = 'position:absolute;left:800px;top:40px;font-size:96px';
  kit.toast('The moss reaches a ferrite seam', 'good');
}

async function testGame() {
  const { Game } = await import('./game/game');
  const { openLab } = await import('./ui/forge');
  const { TreeScreen } = await import('./ui/tree');
  const { openSkillTree } = await import('./ui/skillTree');
  const g = new Game(engine, input, {
    seed: Number(P.get('seed') ?? 11), biome: (P.get('biome') ?? 'meadow') as BiomeKey, pal: P.get('pal') ?? undefined,
    hooks: {
      openBuilder: (game) => openLab(engine, game),
      openLab: (game) => openLab(engine, game),
      openTree: (game) => {
        const evolve = (sp: any) => openLab(engine, game, sp);
        engine.push(new TreeScreen(game.run.reg, { close: () => engine.pop(), evolve, time: game.world.time }));
      },
      openSkills: (game) => openSkillTree(engine, game),
    },
  });
  if (P.has('genes')) { for (const id of P.get('genes')!.split(',')) g.run.add(id, 'test', 0); g.veyr.res.helix = 50; }
  engine.setScreen(g);
  engine.start();
}

async function testChild() {
  const { VeyrChild } = await import('./game/child');
  const { Fx } = await import('./game/fx');
  const scene = new THREE.Scene(), fxs = new THREE.Scene();
  scene.background = new THREE.Color(0x203040);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x403020, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(-2, 4, 3); scene.add(sun);
  const fx = new Fx(fxs, scene);
  const { randomLook, DEFAULT_LOOK } = await import('./game/babyLook');
  const { Rand } = await import('./core/rand');
  const lr = new Rand(Number(P.get('lk') ?? 0));
  const ch = new VeyrChild(fx, 1.25, P.has('lk') ? randomLook(() => lr.next()) : DEFAULT_LOOK, { grown: !P.has('small') }); ch.hatch = 1; scene.add(ch.root);
  if (P.has('wave')) ch.wave();
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
  const yaw = Number(P.get('yaw') ?? 0.4), D = Number(P.get('dist') ?? 6);
  cam.position.set(Math.sin(yaw) * D, 1.3 + D * 0.22, Math.cos(yaw) * D); cam.lookAt(0, 1.3, 0);
  ch.look.set(Math.sin(yaw) * 6, 2.6, Math.cos(yaw) * 6);
  if (P.has('cast')) ch.cast(new THREE.Vector3(2, 0, 4));
  engine.setScreen({ update(dt) { ch.update(dt, cam); fx.update(dt, engine.h, 30); }, render(post, t) { post.render(scene, cam, fxs, t); }, resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); } });
  engine.start();
}

function testStudio() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x24323a);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x403828, 1.5));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.8); key.position.set(-4, 7, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -6; sc.right = sc.top = 6; sc.near = 0.5; sc.far = 30; scene.add(key);
  const rim = new THREE.DirectionalLight(0x8affe8, 1.4); rim.position.set(4, 3, -5); scene.add(rim);
  const gm = new THREE.MeshLambertMaterial({ color: 0x4a6a40 }); gbuf(gm, 0);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const pal = planetPalette(Number(P.get('seed') ?? 3), P.get('pal') ?? 'amber');
  const role = (P.get('role') ?? 'grazer') as Role;
  const d = wildDesign(role, pal, Number(P.get('seed') ?? 3) * 100 + Number(P.get('zs') ?? 0));
  if (P.has('add')) for (const g of P.get('add')!.split(',')) if (!d.genes.includes(g)) d.genes.push(g);
  if (P.has('cover')) d.cover = P.get('cover') as any;
  if (P.has('pattern')) d.pattern = P.get('pattern') as any;
  const m = buildSpeciesModel(d);
  const { mesh, bones } = makeInstance(m);
  scene.add(mesh);
  const an = new Animator(m.rig, bones, mesh);
  const ph = pheno(d);
  console.log(role, d.name, d.plan, d.cover, d.pattern, d.genes.join(','), 'L', ph.length.toFixed(2), 'tris', m.geo.index!.count / 3);
  const r = Math.max(m.rig.length, m.rig.height) * 0.75 + 0.2;
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 200);
  const yaw = Number(P.get('yaw') ?? 0.9), pitch = Number(P.get('pitch') ?? 0.32), D = r * Number(P.get('dist') ?? 3.2);
  const mode = P.get('mode') ?? 'idle';
  engine.setScreen({
    update(dt, t) {
      cam.position.set(Math.sin(yaw) * Math.cos(pitch) * D, m.rig.height * 0.5 + Math.sin(pitch) * D, Math.cos(yaw) * Math.cos(pitch) * D);
      cam.lookAt(0, m.rig.height * 0.45, 0); cam.updateMatrixWorld();
      an.update(dt, { speed: mode === 'move' ? Math.min(1.6, ph.stats.speed * 0.4) : 0, turn: 0, state: mode as any, act: (t * 0.7) % 1, lookYaw: Math.sin(t * 0.7) * 0.4, lookPitch: 0, ground: () => 0, air: 1 });
      if (mode === 'move') mesh.position.set(0, 0, 0);
    },
    render(post, t) { post.render(scene, cam, undefined, t); },
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
  });
  engine.start();
}

async function testMirror() {
  const { BabyEditor } = await import('./ui/babyEditor');
  const { loadLook } = await import('./game/babyLook');
  (await import('./ui/kit')).setupUI();
  engine.setScreen(new BabyEditor(loadLook(), () => {}));
  engine.start();
}

if (P.get('test') === 'lab') testLab();
else if (P.get('test') === 'skills') testSkills();
else if (P.get('test') === 'icons') import('./ui/cineTest').then((m) => m.testIcons(engine));
else if (P.get('test') === 'cine') import('./ui/cineTest').then((m) => m.testCine(engine, input));
else if (P.get('test') === 'menu') import('./ui/cineTest').then((m) => m.testMenu(engine));
else if (P.get('test') === 'mirror') testMirror();
else if (P.get('test') === 'studio') testStudio();
else if (P.get('test') === 'child') testChild();
else if (P.get('test') === 'game') testGame();
else if (P.get('test') === 'ui') testUI();
else if (P.get('test') === 'eco') testEco();
else if (P.get('test') === 'world') testWorld();
else startFlow();

/** ?test=skills: the skill tree (Operations Room 7) over a stand-in run; &own=a,b &pts=n &res=o,c,w,s &live */
async function testSkills() {
  (await import('./ui/kit')).setupUI();
  (await import('./ui/skillTree')).testSkills(engine, P);
  engine.start();
}

async function startFlow() {
  const { Flow } = await import('./flow');
  (await import('./ui/kit')).setupUI();
  const f = new Flow(engine, input);
  (window as any).__flow = f;
  f.menu();
  engine.start();
}

/**
 * ?test=lab: the gene lab over a stand-in run. Several wild species are absorbed whole (every gene, as the harvest
 * does), so the shelves hold their jars and the carousels are full. &skills=splice,sequencer,vat picks the lab skills
 * (default: lab and splice); &harvest plays the absorb-all sequence instead, on a stand-in corpse.
 */
async function testLab() {
  const kit = await import('./ui/kit'); kit.setupUI();
  const { Run } = await import('./game/run');
  const { Forge } = await import('./ui/forge');
  const { initThumbs } = await import('./ui/thumbs');
  initThumbs(engine.renderer);
  const run = new Run(Number(P.get('seed') ?? 5));
  const pal = planetPalette(Number(P.get('seed') ?? 5), P.get('pal') ?? 'amber');
  const kinds = (P.get('kinds') ?? 'beetle,boar,lion,frog,moth,crab,sailback,snail').split(',');
  kinds.forEach((k, i) => {
    const d = wildDesign(k as Role, pal, 4100 + i * 37);
    const sp = run.reg.add(d, 'wild', null, k, 0);
    for (const id of d.genes) run.add(id, sp.name, 0);
  });
  for (const id of (P.get('skills') ?? 'lab,splice').split(',')) if (id) run.skills.owned.add(id);
  const helix = Number(P.get('helix') ?? 60);
  if (P.has('harvest')) { await testHarvest(run); return; }
  const open = () => engine.setScreen(new Forge(run, 0, () => helix, P.has('base') ? run.reg.list[Number(P.get('base'))] ?? null : null, (r) => {
    console.log('lab result', r ? `${r.design.name} [${r.design.genes.join(',')}]` : 'left');
    if (r) run.reg.add(r.design, 'veyr', r.parent, 'design', 0);
    setTimeout(open, 50);
  }, { emit: (ev, d) => console.log('event', ev, JSON.stringify(d)) }));
  (window as any).__run = run;
  const t0 = performance.now(); open(); console.log('lab open ms', Math.round(performance.now() - t0));
  engine.start();
}

/** ?test=lab&harvest: the absorb-all genome harvest on a stand-in corpse, Unit 07 hovering nearby (loops) */
async function testHarvest(run: import('./game/run').Run) {
  const { Harvest } = await import('./game/dnaHarvest');
  const { VeyrChild } = await import('./game/child');
  const { Fx } = await import('./game/fx');
  const scene = new THREE.Scene(), fxs = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2430);
  scene.add(new THREE.HemisphereLight(0xb8c8e0, 0x403020, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.4); sun.position.set(-3, 6, 4); sun.castShadow = true; scene.add(sun);
  const gm = new THREE.MeshLambertMaterial({ color: 0x4a6a3a }); gbuf(gm, 1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const fx = new Fx(fxs, scene);
  const child = new VeyrChild(fx, 1.25, undefined, { grown: true }); child.hatch = 1; child.root.position.set(-4, 0.2, 1.5); scene.add(child.root);
  const sp = run.reg.list[Number(P.get('base') ?? 2)] ?? run.reg.list[0];
  const { mesh } = makeInstance(sp.model); mesh.rotation.z = 1.4; mesh.position.set(0, 0.2, 0); scene.add(mesh);
  const h = new Harvest(scene, fxs, run, fx); h.child = child;
  const cam = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);
  cam.position.set(2.5, 4.2, 10); cam.lookAt(-1, 1.8, 0);
  const go = () => h.start(new THREE.Vector3(0, 0.2, 0), sp.name, sp.design.genes, 1, new THREE.Vector3(-4, 1.6, 1.5), (genes) => {
    for (const id of genes) run.add(id, sp.name, 0);
    console.log('absorbed', genes.length, 'genes');
    setTimeout(go, 2500);
  });
  go();
  engine.canvas.addEventListener('pointerdown', (e) => h.click(e.clientX, e.clientY, cam));
  engine.setScreen({
    update(dt) { h.update(dt, cam); child.look.set(0, 2, 0); child.update(dt, cam); fx.update(dt, engine.h, cam.fov); },
    render(post, t) { post.render(scene, cam, fxs, t); },
    resize(w, hh) { cam.aspect = w / hh; cam.updateProjectionMatrix(); },
  });
  engine.start();
}

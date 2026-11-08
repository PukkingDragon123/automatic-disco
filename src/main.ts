// Boot. ?test=world renders a region for visual QA; the full flow lives in src/game/flow.ts.
import * as THREE from 'three';
import { Engine } from './app/engine';
import { Input } from './app/input';
import { RtsCam } from './app/rtsCam';
import { Region, BIOMES, type BiomeKey } from './world/region';
import { planetPalette } from './world/palette';
import { Terrain } from './world/terrain';
import { Flora } from './world/flora';
import { Sun } from './gfx/lights';
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
    roles.forEach((role, i) => {
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
  const { Forge } = await import('./ui/forge');
  const g = new Game(engine, input, {
    seed: Number(P.get('seed') ?? 11), biome: (P.get('biome') ?? 'meadow') as BiomeKey, pal: P.get('pal') ?? undefined,
    hooks: {
      openBuilder: (game) => {
        const f = new Forge(game.run, game.vaults, () => game.veyr.res.helix, null, (r) => {
          engine.pop();
          if (r) game.addDesign(r.design, r.parent, 3 + Math.max(0, r.design.genes.length - 4));
        });
        engine.push(f);
      },
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
  const ch = new VeyrChild(fx); ch.hatch = 1; scene.add(ch.root);
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
  const yaw = Number(P.get('yaw') ?? 0.4);
  cam.position.set(Math.sin(yaw) * 6, 2.6, Math.cos(yaw) * 6); cam.lookAt(0, 1.4, 0);
  ch.look.set(Math.sin(yaw) * 6, 2.6, Math.cos(yaw) * 6);
  if (P.has('cast')) ch.cast(new THREE.Vector3(2, 0, 4));
  engine.setScreen({ update(dt) { ch.update(dt, cam); fx.update(dt, engine.h, 30); }, render(post, t) { post.render(scene, cam, fxs, t); }, resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); } });
  engine.start();
}

if (P.get('test') === 'child') testChild();
else if (P.get('test') === 'game') testGame();
else if (P.get('test') === 'ui') testUI();
else if (P.get('test') === 'eco') testEco();
else if (P.get('test') === 'world' || !P.has('test')) testWorld();

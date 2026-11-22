// Test pages for the progression layer.
//   ?test=mastery&tab=mastery|research|upgrader|mission&path=plant   the program terminal over a stand-in colony
//        &fresh (an early colony) &job=pod_sensor (the Upgrader at work) &done=pod_sensor (just installed)
//   ?test=mastery&v7=tree|pod|reveal   v7: the skill tree, the pod interior, a dock slot's reveal over a stand-in colony
//   ?test=event&id=storm|revolt|migration|envoy|reactor|disease|signal|supplycrash|fallen   a real region, the event
//        played after the world settles (&at=seconds), choice included
import type { Engine, Screen } from '../app/engine';
import type { Input } from '../app/input';
import { Mastery, PATHS, type PathId } from './mastery';
import { Research } from './research';
import { Upgrades } from './upgrades';
import { Mission } from './mission';
import { FDEFS } from '../factory/defs';
import { upState } from './buildings';
import { pick } from './util';
import { TECHS } from './tech';
import { bindTestHost } from './index';

export function testProgression(engine: Engine, P: URLSearchParams) {
  if (P.has('v7')) { void import('./test7').then((m) => m.testV7(engine, P)); return; }
  const fresh = P.has('fresh');
  const stock = new Map<string, number>();
  const put = (id: string, n: number) => stock.set(id, (stock.get(id) ?? 0) + n);
  for (const [id, n] of [['iron_plate', 64], ['screw', 120], ['rubber', 12], ['copper_wire', 90], ['circuit', 14], ['glass', 30], ['crystal', 22], ['iron_rod', 40], ['gear', 30], ['motor', 6], ['servo', 3], ['reinforced_plate', 12], ['steel_ingot', 8], ['wood', 80], ['fruit', 40], ['water', 60]] as [string, number][]) put(pick(id), fresh ? Math.floor(n / 6) : n);
  const buildings: any[] = [
    { kind: 'research_station', x: 60, z: 60, dead: false, on: true, status: 'working', sat: 1, def: FDEFS.research_station },
    { kind: 'upgrader', x: 66, z: 60, dead: false, on: true, status: 'idle', sat: 1, def: FDEFS.upgrader },
  ];
  if (fresh) buildings.pop();
  const world = { time: fresh ? 140 : 2460 };
  const host: any = {
    world, run: { skills: { owned: new Set<string>(['works']) } },
    factory: {
      buildings,
      count: (id: string) => stock.get(id) ?? 0,
      take: (id: string, n: number) => { const h = stock.get(id) ?? 0; if (h < n) return false; stock.set(id, h - n); return true; },
      put, add: (id: string, n: number) => put(id, n),
      power: () => ({ supply: 85, demand: 60, cap: 100, grids: 1 }),
    },
    emit: (ev: string, d: unknown) => console.log('emit', ev, JSON.stringify(d)?.slice(0, 120)),
    on: () => {},
  };
  const M = new Mastery(); M.now = () => world.time;
  const R = new Research(host, M), U = new Upgrades(host), Q = new Mission(host);
  host.mastery = M; host.research = R; host.upgrades = U; host.mission = Q;
  bindTestHost(host);
  if (!fresh) {
    const xp: Record<PathId, number> = { plant: 1010, bio: 520, energy: 760, industry: 1460, robotics: 330 };
    for (const p of PATHS) M.setXp(p, xp[p]);
    for (const id of ['agro_furrow', 'agro_drip', 'terra_bind', 'silva_tap', 'agro_mono', 'gene_clean', 'cyb_socket', 'cyb_damper', 'bioe_digest', 'rx_loop', 'rx_rods', 'grid_copper', 'ex_bits', 'ex_seam', 'rf_clean', 'as_jigs', 'ex_strip', 'lb_hydro', 'dr_gyro'] ) M.grantPerk(id);
    M.load({ ...M.toJSON(), foci: { plant: 'agro', energy: 'reactor', industry: 'extract' } });
    const work: [PathId, number, string][] = [['plant', 14, 'Harvest and growing'], ['plant', 18, 'Built Planter'], ['plant', 6, 'Scanning'], ['bio', 12, 'Fitted a robotic part'], ['bio', 10, 'Printed a creature'], ['energy', 9, 'Running the grid'], ['energy', 22, 'Built Steam Generator'], ['industry', 16, 'Production'], ['industry', 14, 'Built Miner Mk. II'], ['robotics', 31, 'Installed Grapple Arm'], ['robotics', 20, 'Research: Splitters and Mergers']];
    for (const [p, n, why] of work) { M.gain(p, n, why); world.time += 9; }
    for (const id of ['upgrader', 'steam_power', 'assembly', 'miner2', 'agronomy', 'labour', 'logic_split', 'bp_plating', 'bp_grapple', 'bp_sensor', 'bp_drone_scout', 'bp_capacitor', 'bp_drill', 'bp_socket', 'bp_scanner2', 'bio_reactor']) R.complete(id);
    R.data = { bio: 34, geo: 27, energy: 19, xeno: 8 }; R.total = { bio: 160, geo: 120, energy: 70, xeno: 20 };
    R.queue = ['gene_lab', 'chem', 'templates']; R.prog = 31;
    const logs: [string, any, any][] = [['Ferrite Deposit', 'ore', { geo: 5 }], ['Glasswing Moth', 'species', { bio: 9.6 }], ['Basalt Spire', 'ruin', { xeno: 12, geo: 3, energy: 2 }], ['Copper Deposit', 'ore', { geo: 5 }], ['Umbrella Palm', 'plant', { bio: 5 }], ['Geyser', 'vent', { energy: 7, geo: 2 }], ['Bristle Boar', 'species', { bio: 12 }], ['Crystal Seam', 'crystal', { geo: 3, energy: 4 }], ['Fiddle Fern', 'plant', { bio: 3 }]];
    R.log = logs.map(([name, kind, data], i) => ({ name, kind, data, t: world.time - i * 40 }));
    for (const [n, x] of logs.entries()) R.scans.set('t' + n, 1), void x;
    U.install('pod_plating'); U.install('arm_grapple'); U.install('drone_scout');
    Q.rep = 58; Q.strikes = 1; Q.no = 0;
    const q1 = Q.issue(); q1.issued = world.time - 300; q1.due = world.time + 74; q1.state = 'met'; q1.at = world.time - 200;
    const q2 = Q.issue(); q2.issued = world.time - 600; q2.due = world.time - 20; q2.state = 'missed';
    const q3 = Q.issue(); q3.due = world.time + 512;
    const q4 = Q.issue(); q4.due = world.time + 96;
    void q4; Q.next = world.time + 400;
  } else { M.setXp('industry', 70); M.setXp('plant', 20); Q.next = world.time + 10; }
  if (P.has('job')) { const b = buildings.find((x) => x.kind === 'upgrader'); if (b) { const st = upState(b); U.start(st, P.get('job')!); st.job!.t = st.job!.time * Number(P.get('k') ?? 0.62); } }
  if (P.has('done')) U.install(P.get('done')!);
  (window as any).__prog = host;
  void TECHS;
  // a stand-in screen beneath the terminal: ticks the clocks like the game would
  const base: Screen = {
    update(dt) {
      world.time += dt;
      for (const b of buildings) FDEFS[b.kind]?.hooks?.tick?.(b, dt, null);
      R.tick(dt); Q.tick(dt);
    },
    render() { /* nothing under the CRT */ },
  };
  engine.setScreen(base);
  void import('../ui/skillTree').then((m) => {
    const tab = (P.get('tab') ?? 'mastery') as never;
    const open = () => m.openSkillTree(engine, host, tab, (P.get('path') ?? undefined) as PathId | undefined);
    open();
    // the stand-in clocks keep running behind the terminal for the upgrader flow
    setInterval(() => { if (engine.screen !== base) base.update(0.25, 0); }, 250);
    addEventListener('keydown', (e) => { if (e.key === 'k' && engine.screen === base) open(); });
  });
}

/** a real region with the event played after the world settles */
export async function testEvent(engine: Engine, input: Input, P: URLSearchParams) {
  const { Game } = await import('../game/game');
  (await import('../ui/kit')).setupUI();
  const g = new Game(engine, input, { seed: Number(P.get('seed') ?? 11), biome: (P.get('biome') ?? 'meadow') as never, pal: P.get('pal') ?? undefined, story: false });
  engine.setScreen(g);
  if (P.has('scale')) { engine.scale = Number(P.get('scale')) || 1; engine.resize(); }
  engine.start();
  const G = g as any;
  G.director.auto = false;
  const id = P.get('id') ?? 'storm';
  // a few workers and machines so the consequences have something to touch
  setTimeout(() => {
    try {
      const L = G.veyr.core; const f = G.factory;
      for (const [k, dx, dz] of [['research_station', 5, -6], ['upgrader', -7, -5], ['steamgen', 7, 4], ['crate', -5, 6]] as [string, number, number][]) f.place?.(k, Math.floor(L.x + dx), Math.floor(L.z + dz), 0, true);
    } catch (e) { console.warn('test place', e); }
    setTimeout(() => G.director.trigger(id), Number(P.get('at') ?? 3) * 1000);
  }, 2500);
}

/** ?test=liveries: the two rival blocs side by side, structures and machines in their new colours (no world) */
export async function testLiveries(engine: Engine) {
  const THREE = await import('three');
  const { structureModel } = await import('../game/factions/models');
  const { kitMesh, sharedBody } = await import('../game/factions/livery');
  const { buildModel } = await import('../robots/models');
  const { FACTION_LABEL } = await import('../game/factions/plan');
  const { gbuf } = await import('../gfx/gbuf');
  const { RAMPS } = await import('../art/palette');
  const { el, ui } = await import('../ui/kit');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(RAMPS.sky[1]);
  scene.add(new THREE.HemisphereLight(0xd8dcd0, 0x4a4030, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6); sun.position.set(-8, 12, 9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as import('three').OrthographicCamera; sc.left = sc.bottom = -26; sc.right = sc.top = 26; sc.near = 0.5; sc.far = 80; scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9cc5ae, 0.8); rim.position.set(6, 5, -8); scene.add(rim);
  const gm = new THREE.MeshLambertMaterial({ color: RAMPS.sand[2] }); gbuf(gm, 1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const row = (f: 'soviet' | 'prc', z: number, name: string, units: string[], liv: 'sov' | 'prc') => {
    let x = -15;
    for (const k of ['lander', 'factory', 'tower', 'bunker'] as const) {
      const m = structureModel(f, k, name); const g = kitMesh(m.main, f, name, sharedBody(f + k));
      if (m.turn) { const t = kitMesh(m.turn, f, name, sharedBody(f + k)); if (m.turnAt) t.position.set(...m.turnAt); g.add(t); }
      g.position.set(x, 0, z); g.rotation.y = 0.35; g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; }); scene.add(g);
      x += k === 'lander' ? 8 : 7;
    }
    for (const u of units) { const m = buildModel(u as never, liv); m.root.position.set(x, m.hover, z + 1); m.root.rotation.y = 0.5; m.root.traverse((o) => { o.castShadow = true; }); scene.add(m.root); x += Math.max(2.2, m.r * 3); }
  };
  row('soviet', -6, 'BASTION', ['sov_trooper', 'sov_tank', 'sov_titan'], 'sov');
  row('prc', 7, 'TIDEWATER', ['prc_scout', 'prc_trooper', 'prc_mech'], 'prc');
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 400);
  cam.position.set(4, 26, 52); cam.lookAt(3, 1.5, 0);
  const lab = (t: string, s: string, top: number, col: string) => { const d = el('div', '', ui()); d.style.cssText = `position:fixed;left:24px;top:${top}px;font-family:Jersey;font-size:30px;color:${col};text-shadow:2px 2px 0 #06070a`; d.innerHTML = `${t}<div style="font-family:VT;font-size:20px;color:#d9d2bf">${s}</div>`; };
  lab(FACTION_LABEL.soviet.toUpperCase(), 'graphite slab armour · signal-orange bands · the hexagon and chevron', 24, '#e08a52');
  lab(FACTION_LABEL.prc.toUpperCase(), 'ceramic-white shells · teal bands · the wave crest', 112, '#7fc8bd');
  engine.setScreen({ update() {}, render(post, t) { post.render(scene, cam, undefined, t); }, resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); } });
  engine.start();
}

/** ?test=stage&id=storm|envoy|fallen|...: the events on a light stand-in colony (no world generation): a grass
 *  field, the pod, a relay mast, lamps, the Upgrader and a stand of trees, so the cinematics and the decisions can be
 *  checked quickly. Teammates are the crew agent's stand-in bodies (there is no colony here). */
export async function testEventStage(engine: Engine, P: URLSearchParams) {
  const THREE = await import('three');
  const { Director } = await import('../story/director');
  const { lowpixGlb } = await import('./ui/vignettes');
  const { gbuf } = await import('../gfx/gbuf');
  const { Mission } = await import('./mission');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fa4ae); scene.fog = new THREE.Fog(0x8fa4ae, 30, 90);
  scene.add(new THREE.HemisphereLight(0xe8ecf0, 0x4a5a3a, 1.2));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2); sun.position.set(-20, 30, 15); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera as import('three').OrthographicCamera; sc.left = sc.bottom = -40; sc.right = sc.top = 40; sc.far = 120; scene.add(sun);
  const lamb = (c: number) => gbuf(new THREE.MeshLambertMaterial({ color: c, flatShading: true }), 1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 60, 60), lamb(0x5f7a3e));
  const pa = ground.geometry.attributes.position as import('three').BufferAttribute;
  for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getX(i) * 0.08) * 0.4 + Math.cos(pa.getY(i) * 0.06) * 0.5);
  ground.geometry.computeVertexNormals(); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const ray = new THREE.Raycaster();
  const surfaceY = (x: number, z: number) => { ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0)); const h = ray.intersectObject(ground)[0]; return h ? h.point.y : 0; };
  const put = (o: import('three').Object3D | null, x: number, z: number, ry = 0) => { if (!o) return; o.position.set(x, surfaceY(x, z), z); o.rotation.y = ry; scene.add(o); };
  put(await lowpixGlb('colony', 'pod', 4.2), 0, 0, 0.4);
  put(await lowpixGlb('progression', 'upgrader', 3), -7, 4, 0.3);
  put(await lowpixGlb('colony', 'st_lamp', 1), 5, 5);
  put(await lowpixGlb('colony', 'st_sensor', 1.6), -5, -6);
  for (let k = 0; k < 22; k++) {
    const a = k * 2.39, r = 16 + (k % 7) * 4, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6), lamb(0x5a3e28)); trunk.position.y = 1.2; t.add(trunk);
    for (let j = 0; j < 3; j++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.6 - j * 0.4, 1.8, 7), lamb(j % 2 ? 0x3f6a32 : 0x4f7a3a)); c.position.y = 2.4 + j * 0.9; c.castShadow = true; t.add(c); }
    t.scale.setScalar(0.8 + (k % 5) * 0.15); put(t, x, z, k);
  }
  for (let k = 0; k < 30; k++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + (k % 4) * 0.2, 0), lamb(0x7a7468)); r.castShadow = true; put(r, Math.cos(k * 1.3) * (6 + k), Math.sin(k * 1.3) * (6 + k)); }
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400); cam.position.set(14, 9, 16); cam.lookAt(0, 1, 0);
  const handlers: Record<string, ((d: unknown) => void)[]> = {};
  const g: any = {
    world: { scene, surfaceY, creatures: [], time: 0, kill: () => {} }, cam: { cam }, cineCam: null, update$: [], paused: false,
    on: (e: string, f: (d: unknown) => void) => (handlers[e] ??= []).push(f), emit: (e: string, d: unknown) => { for (const f of handlers[e] ?? []) f(d); },
    veyr: { core: { x: 0, z: 0 } }, region: { landing: { x: 0, z: 0 }, N: 128 }, fx: { burst: () => {} }, engine,
  };
  g.mission = new Mission(g); g.director = new Director(g); g.director.auto = false;
  (window as any).__game = g;
  engine.setScreen({
    update(dt) { g.world.time += dt; for (const f of g.update$) f(g.paused ? 0 : dt); g.director.tick(g.paused ? 0 : dt); g.cineCam?.(cam, dt); },
    render(post, t) { post.render(scene, cam, undefined, t); },
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
  });
  if (P.has('scale')) { engine.scale = Number(P.get('scale')) || 1; engine.resize(); }
  engine.start();
  const id = P.get('id'); if (id) setTimeout(() => g.director.trigger(id), Number(P.get('at') ?? 1.5) * 1000);
}

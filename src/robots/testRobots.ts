// ?test=robots: Unit 07's five build stages side by side and a line-up of every robot and soldier kind idling, with
// a skirmish button that drops two teams onto a test field. Params: &view=golem|units|all &focus=<i> (close-up of one
// exhibit) &yaw= &pitch= &dist= &anim=walk|fire|die &skirmish &bench (the weapons workbench)
import * as THREE from 'three';
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import { Fx } from '../game/fx';
import { VeyrChild, STAGE_NAMES } from '../game/child';
import { DEFAULT_LOOK, randomLook } from '../game/babyLook';
import { gbuf } from '../gfx/gbuf';
import { RAMPS } from '../art/palette';
import { trisOf } from './kit';
import type { GStage } from './golem';
import { Rand } from '../core/rand';

interface Exhibit { obj: THREE.Object3D; x: number; z: number; h: number; name: string; tick(dt: number, t: number): void }

export async function testRobots(engine: Engine, input: Input, P: URLSearchParams) {
  void input;
  const scene = new THREE.Scene(), fxs = new THREE.Scene();
  scene.background = new THREE.Color(RAMPS.sky[1]);
  scene.add(new THREE.HemisphereLight(0xd8dcd0, 0x4a4030, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6); sun.position.set(-6, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -16; sc.right = sc.top = 16; sc.near = 0.5; sc.far = 60; scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x9cc5ae, 0.9); rim.position.set(5, 4, -6); scene.add(rim);
  const gm = new THREE.MeshLambertMaterial({ color: RAMPS.soil[3] }); gbuf(gm, 1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), gm); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const fx = new Fx(fxs, scene);
  const view = P.get('view') ?? 'all';
  const ex: Exhibit[] = [];
  const look = P.has('lk') ? randomLook(() => new Rand(Number(P.get('lk'))).next()) : DEFAULT_LOOK;
  // ---- the golem's stages
  if (view === 'golem' || view === 'all') {
    const scales = [1.6, 1.25, 1.25, 1.25, 1.25];
    let x = -5.2;
    for (let s = 0 as GStage; s <= 4; s = (s + 1) as GStage) {
      const parts = [[], ['torso'], ['torso', 'armR', 'armL', 'coil'], ['torso', 'armR', 'armL', 'coil', 'plating1', 'plating2', 'reactor'], ['torso', 'armR', 'armL', 'coil', 'plating1', 'plating2', 'plating3', 'reactor', 'colossus']][s];
      const ch = new VeyrChild(fx, scales[s], look, { grown: true, parts });
      ch.hatch = 1;
      ch.root.position.set(x, 0, 0); scene.add(ch.root);
      const cx = x;
      ex.push({ obj: ch.root, x: cx, z: 0, h: [1.15, 1.8, 1.8, 1.8, 2.8][s], name: `${s} ${STAGE_NAMES[s]} (${ch.tris} tris)`, tick(dt, t) { ch.look.set(cx + Math.sin(t * 0.4 + s) * 3, 1.4, 6); ch.update(dt, cam); } });
      console.log('golem stage', s, STAGE_NAMES[s], 'tris', ch.tris, 'mesh tris', trisOf(ch.root));
      x += s === 3 ? 3.2 : 2.4;
    }
  }
  // ---- the robot line-up (robots/models.ts)
  if (view === 'units' || view === 'all') {
    const { lineup } = await import('./lineup');
    for (const e of lineup(scene, fx, view === 'all' ? 5 : 0, P)) ex.push(e);
  }
  // ---- the camera
  const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 300);
  const focus = P.has('focus') ? ex[Number(P.get('focus'))] : null;
  const yaw = Number(P.get('yaw') ?? 0.35), pitch = Number(P.get('pitch') ?? 0.22);
  const sk = P.has('skirmish');
  const cx = sk ? 0 : focus ? focus.x : ex.reduce((a, e) => a + e.x, 0) / Math.max(1, ex.length), cz = sk ? 18 : focus ? focus.z : 0;
  const span = sk ? 16 : focus ? focus.h * 1.9 : Math.max(6, ex.reduce((a, e) => Math.max(a, Math.abs(e.x - cx)), 0) * 2.3);
  const D = Number(P.get('dist') ?? span * 1.6), ty = focus ? focus.h * 0.5 : 1.1;
  const place = (t: number) => {
    const yy = yaw + (P.has('spin') ? t * 0.3 : 0);
    cam.position.set(cx + Math.sin(yy) * Math.cos(pitch) * D, ty + Math.sin(pitch) * D, cz + Math.cos(yy) * Math.cos(pitch) * D);
    cam.lookAt(cx, ty, cz);
  };
  place(0);
  sun.target.position.set(cx, 0, 0);
  // ---- labels
  const lab = document.createElement('div');
  lab.style.cssText = 'position:fixed;left:8px;top:8px;font:11px monospace;color:#d2cab4;background:#1f232bcc;padding:6px 8px;white-space:pre;pointer-events:none;z-index:5';
  lab.textContent = ex.map((e, i) => `${i}: ${e.name}`).join('\n');
  document.body.appendChild(lab);
  if (view !== 'golem') {
    const btn = document.createElement('button');
    btn.textContent = 'SKIRMISH';
    btn.style.cssText = 'position:fixed;right:10px;top:10px;font:12px monospace;padding:6px 12px;background:#80332c;color:#e2dbc6;border:1px solid #3b1a18;z-index:6;cursor:pointer';
    btn.onclick = async () => { const { skirmish } = await import('./lineup'); skirmish(scene, fx); };
    document.body.appendChild(btn);
    if (P.has('skirmish')) { const { skirmish } = await import('./lineup'); skirmish(scene, fx); }
  }
  engine.setScreen({
    update(dt, t) { for (const e of ex) e.tick(dt, t); fx.update(dt, engine.h, cam.fov); place(t); (globalThis as unknown as { __tick?: (dt: number) => void }).__tick?.(dt); },
    render(post, t) { post.render(scene, cam, fxs, t); },
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
  });
  engine.start();
  // &bench: the ordnance workbench and its test-fire range (no game: everything is allowed and free)
  if (P.has('bench')) (await import('./weapons/bench')).openBench(engine, null);
}

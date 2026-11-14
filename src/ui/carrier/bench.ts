// Dev-only QA bench for the carrier (not imported by the game): a scripted camera over buildCarrier() for
// screenshots. Load any page in dev, then: (await import('/src/ui/carrier/bench.ts')).bench(window.__engine, opts),
// and drive it with window.__cb.view({ pos, look, fov }). Everything is in ship-local metres (+z bow, +y dorsal).
import * as THREE from 'three';
import type { Engine } from '../../app/engine';
import { buildCarrier } from '../deployShip';
import { makeSpace } from '../globe';
import { resetGrade } from '../../gfx/post';
import { gbuf } from '../../gfx/gbuf';

export interface BenchOpts { view?: 'ext' | 'int' | 'both'; doors?: number; sun?: [number, number, number]; bloom?: number; t?: number; hide?: string[]; noOutline?: boolean }

export function bench(engine: Engine, o: BenchOpts = {}) {
  document.querySelectorAll('body > div').forEach((d) => { (d as HTMLElement).style.display = 'none'; });
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020306);
  const sunDir = new THREE.Vector3(...(o.sun ?? [-0.72, 0.52, 0.16])).normalize();
  const space = makeSpace({ stars: 2400, radius: 7000, sun: sunDir, dust: 0, seed: 7 }); scene.add(space.group);
  const t0 = performance.now();
  const c = buildCarrier({ view: o.view ?? 'both' }); scene.add(c.group);
  const buildMs = Math.round(performance.now() - t0);
  c.ship.sun.position.copy(sunDir).multiplyScalar(220);
  if (o.doors !== undefined) c.ship.setDoors(o.doors);
  if (o.noOutline) c.group.traverse((ob) => { if (ob.name === 'carrier-m') gbuf((ob as THREE.Mesh).material as THREE.Material, 0); });
  if (o.hide) c.group.traverse((ob) => { if (o.hide!.some((h) => ob.name === h || ob.type === h)) ob.visible = false; });
  c.ship.root.traverse((ob) => { const l = ob as THREE.Light; if ((l as THREE.PointLight).isPointLight || ((l as THREE.SpotLight).isSpotLight && ((l as THREE.SpotLight).distance <= 8 || l.color.getHex() === 0xff2a14))) l.visible = false; });
  const cam = new THREE.PerspectiveCamera(36, 1, 0.5, 15000);
  cam.position.set(-150, 70, 170); cam.lookAt(0, 0, -30);
  const count = (root: THREE.Object3D | undefined) => { let t = 0, n = 0; root?.traverse((ob) => { const m = ob as THREE.Mesh; if (m.isMesh) { n++; t += ((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3) * ((m as THREE.InstancedMesh).count ?? 1); } }); return { t: Math.round(t), n }; };
  const hi = count(c.group.getObjectByName('carrier-hi')), lo = count(c.group.getObjectByName('carrier-lo')), ext = count(c.group.getObjectByName('exterior')), bay = count(c.group.getObjectByName('bay'));
  console.log('carrier hi', JSON.stringify(hi), 'lo', JSON.stringify(lo), 'exterior', JSON.stringify(ext), 'bay', JSON.stringify(bay));
  const tris = ext.t - lo.t, meshes = ext.n - lo.n;
  const cb = {
    ready: true, buildMs, tris: Math.round(tris), meshes,
    view(v: { pos: number[]; look: number[]; fov?: number; t?: number }) {
      cam.position.set(v.pos[0], v.pos[1], v.pos[2]); cam.lookAt(v.look[0], v.look[1], v.look[2]);
      cam.fov = v.fov ?? 36; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      if (v.t !== undefined) engine.time = v.t;
    },
  };
  (window as any).__cb = cb;
  engine.setScreen({
    update(dt) { c.update(dt); },
    render(post, t) { resetGrade(post.grade); post.grade.vig = 0.35; post.grade.bloom = o.bloom ?? 0.4; post.render(scene, cam, undefined, t); },
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); },
    dispose() { c.dispose(); },
  });
  engine.start();
  return { buildMs, tris: cb.tris, meshes };
}

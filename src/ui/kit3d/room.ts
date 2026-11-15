// kit3d tech room: the dim lab the hardware stands in. A grated floor, a curved wall of panels with lit strips and
// equipment racks (lamps blinking), a ceiling ring light, cool fill and a warm key from above.
import * as THREE from 'three';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import { mat32, solid, worldUV, K3 } from './tex';

export function techRoom(o: { r?: number; h?: number; tint?: number } = {}) {
  const R = o.r ?? 7, H = o.h ?? 4.2, g = new THREE.Group();
  const add = (m: THREE.Mesh, at: [number, number, number]) => { m.position.set(...at); m.receiveShadow = true; m.castShadow = true; g.add(m); return m; };
  const floor = add(new THREE.Mesh(worldUV(new THREE.CircleGeometry(R + 1, 48)), mat32(0x2b3036, 'grate')), [0, 0, 0]); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  // the wall: panels, a lit strip at waist and head height
  const wall = add(new THREE.Mesh(worldUV(new THREE.CylinderGeometry(R, R, H, 64, 1, true)), mat32(0x30373e, 'panel')), [0, H / 2, 0]);
  (wall.material as THREE.Material).side = THREE.BackSide; wall.castShadow = false;
  const strip = gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(o.tint ?? 0x6fd8ff).multiplyScalar(1.3) }), F_EMIT);
  for (const y of [1.05, 2.6]) { const s = new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.012, 4, 96), strip); s.rotation.x = Math.PI / 2; s.position.y = y; g.add(s); }
  // racks round the wall, each with a column of status lamps
  const lampOn = gbuf(new THREE.MeshBasicMaterial({ color: 0x8dffb0 }), F_EMIT), lampAmb = gbuf(new THREE.MeshBasicMaterial({ color: 0xffc060 }), F_EMIT), lampOff = solid(0x2a3035);
  const lamps: THREE.Mesh[] = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.1, rr = R - 0.35, rack = new THREE.Group(); rack.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); rack.rotation.y = -a - Math.PI / 2; g.add(rack);
    const body = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.9, 2.1, 0.55)), mat32(0x23292f, 'painted')); body.position.y = 1.05; body.castShadow = body.receiveShadow = true; rack.add(body);
    const face = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.8, 1.8, 0.02)), mat32(0x1a1e22, 'grille')); face.position.set(0, 1.08, 0.285); rack.add(face);
    for (let j = 0; j < 6; j++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), lampOff); l.position.set(0.3, 0.45 + j * 0.24, 0.3); rack.add(l); lamps.push(l); }
  }
  // the ceiling ring light
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.04, 6, 64), gbuf(new THREE.MeshBasicMaterial({ color: 0xdff4ff }), F_EMIT)); ring.rotation.x = Math.PI / 2; ring.position.y = H - 0.2; g.add(ring);
  const ceil = add(new THREE.Mesh(worldUV(new THREE.CircleGeometry(R, 48)), mat32(0x1b1f24, 'panel')), [0, H, 0]); ceil.rotation.x = Math.PI / 2; ceil.castShadow = false;
  // light: a cool hemisphere, a warm key over the desk with shadows, a rim from the back wall
  const hemi = new THREE.HemisphereLight(0x9fb8d0, 0x1a1c20, 0.9); g.add(hemi);
  const key = new THREE.DirectionalLight(0xffe6c8, 1.6); key.position.set(-2.5, 5, 4.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -4; sc.right = sc.top = 4; sc.near = 0.5; sc.far = 16; key.shadow.bias = -0.0005; g.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x8fd8ff, 0.7); rim.position.set(2, 3, -5); g.add(rim);
  let tt = 0;
  return {
    group: g,
    update(dt: number) {
      tt += dt;
      for (let i = 0; i < lamps.length; i++) { const v = Math.sin(i * 12.9898 + Math.floor(tt * (0.6 + (i % 5) * 0.3)) * 78.233) * 43758.5; const f = v - Math.floor(v); lamps[i].material = f > 0.72 ? lampAmb : f > 0.35 ? lampOn : lampOff; }
    },
  };
}
void K3;

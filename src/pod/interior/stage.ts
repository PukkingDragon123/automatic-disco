// Where the pod's inside is shown (v7, the user: "make it top down, just like zoom in on it, same camera angle as a
// normal building, just darken the outside"). A STAGE is the world the cutaway cabin is put into and the camera that
// zooms onto it: in the game, the colony's own world scene and RTS camera (gameStage); for QA, a stand-in patch of
// ground with the real pod model on it, lit like the colony (testStage). The cabin never has a camera of its own.
import * as THREE from 'three';
import type { Post } from '../../gfx/post';
import type { Game } from '../../game/game';
import { anyG } from '../../research/util';
import { matMaterial } from '../../gfx/mat';
import { buildPod, type PodModel } from '../../colony/podModel';
import { gbuf } from '../../gfx/gbuf';

export interface PodStage {
  scene: THREE.Scene;
  fx: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  /** the pod: its ground point and heading (local +z is the hatch side) */
  pod: { x: number; y: number; z: number; yaw: number };
  /** the pod's exterior model: sliced down to the cabin floor while inside (null: none) */
  exterior: PodModel | null;
  /** the RTS camera's pitch at a distance (the colony view's own angle) and its yaw now */
  pitch(dist: number): number;
  yaw: number;
  fov: number;
  /** draw the world (the cabin is in it) */
  render(post: Post, t: number): void;
  /** hand the camera back (exit) */
  release(): void;
}

/** the colony: the world scene, the RTS camera's angle; the RtsCam is frozen while the cabin drives its camera */
export function gameStage(g: Game): PodStage | null {
  const G = anyG(g), pod = G.colony?.pod, cam = G.cam;
  if (!pod || !cam || !G.world?.scene) return null;
  const was = cam.enabled; cam.enabled = false;
  return {
    scene: G.world.scene, fx: G.world.fxScene ?? new THREE.Scene(), cam: cam.cam,
    pod: { x: pod.x, y: pod.y, z: pod.z, yaw: pod.yaw }, exterior: pod.model ?? null,
    pitch: (d: number) => cam.pitch(d), yaw: cam.yaw, fov: cam.cam.fov,
    render(post, t) { post.render(G.world.scene, cam.cam, G.world.fxScene, t); },
    release() { cam.enabled = was; },
  };
}

/** QA: a patch of the colony ground with the real pod model on it, the camera at the colony's angle */
export function testStage(): PodStage {
  const scene = new THREE.Scene(), fx = new THREE.Scene();
  scene.background = new THREE.Color(0x8ab4c8);
  scene.add(new THREE.HemisphereLight(0xd8e8f4, 0x5a4a38, 1.25));
  const sun = new THREE.DirectionalLight(0xffe8c8, 2.6); sun.position.set(-9, 16, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 }); sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  // the ground: packed dirt with grass beyond, at the world's texel density
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), matMaterial('dirt', { uv: 'world', flag: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grass = new THREE.Mesh(new THREE.RingGeometry(9, 40, 48), matMaterial('grass', { uv: 'world', flag: 0 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = 0.01; grass.receiveShadow = true; scene.add(grass);
  // a few crates and rocks around, so the dimmed outside reads as the colony
  const rock = matMaterial('stone_rough'), crate = matMaterial('wood_crate');
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39 + 0.4, r = 5.5 + (i % 3) * 1.6;
    const m = new THREE.Mesh(i % 3 ? new THREE.DodecahedronGeometry(0.35 + (i % 4) * 0.12, 0) : new THREE.BoxGeometry(0.8, 0.7, 0.8), i % 3 ? rock : crate);
    m.position.set(Math.sin(a) * r, i % 3 ? 0.2 : 0.35, Math.cos(a) * r); m.rotation.y = a; m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  const yaw = Math.PI / 4;
  const pod = buildPod();
  pod.root.rotation.y = yaw;
  pod.root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !(m as THREE.MeshBasicMaterial).isMeshBasicMaterial) gbuf(m, 1); (o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true; });
  scene.add(pod.root);
  const cam = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.5, 400);
  // the colony view over the pod (RtsCam's pose rule at its usual distance)
  const pitch = (d: number) => 0.86 + Math.max(0, Math.min(1, (d - 7) / (110 - 7))) * 0.32, d0 = 30, p0 = pitch(d0);
  cam.position.set(2 + Math.sin(yaw) * Math.cos(p0) * d0, Math.sin(p0) * d0, 2 + Math.cos(yaw) * Math.cos(p0) * d0); cam.lookAt(2, 0.5, 2); cam.updateMatrixWorld();
  return {
    scene, fx, cam, pod: { x: 0, y: 0, z: 0, yaw }, exterior: pod,
    pitch, yaw, fov: 36,
    render(post, t) { post.render(scene, cam, fx, t); },
    release() {},
  };
}

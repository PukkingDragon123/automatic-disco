// A kit 3D ELEMENT with hotspots: one model drawn through the UI kit's renderer (toon materials, black ink outline,
// pixel art at art resolution) into a canvas, turned by springs (drag / wheel), and the camera math the kit's
// renderModel frames it with, so points on the model can be projected into the canvas (pins, slot hotspots, drop
// targets) and canvas points cast back onto it.
//   const kv = new KitView(obj)            obj is fitted (centred on its footprint, foot at y = 0)
//   kv.draw(ctx, view) / kv.project(p, view) -> [x, y, facing] / kv.ray(px, py, view) -> THREE.Ray (obj space)
import * as THREE from 'three';
import { renderModel, fitRoot, type ShotOpts } from '../../ui/kit/model3d';

export interface KView { w: number; h: number; yaw: number; pitch: number; zoom: number; lift?: number }
export class KitView {
  readonly root: THREE.Group; readonly inner: THREE.Object3D;
  readonly R0: number; readonly H0: number;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  constructor(obj: THREE.Object3D, readonly shot: ShotOpts = {}) {
    this.root = fitRoot(obj); this.inner = obj;
    this.R0 = this.root.userData.fitR as number; this.H0 = this.root.userData.fitH as number;
  }
  private frame(v: KView) {
    const R0 = this.R0, half = R0 / v.zoom, asp = v.w / v.h, dist = R0 * 4, cam = this.cam, lift = (v.lift ?? 0) * half * 2;
    cam.left = -half * Math.max(1, asp); cam.right = half * Math.max(1, asp); cam.top = half / Math.min(1, asp); cam.bottom = -half / Math.min(1, asp);
    cam.near = dist - R0 * 1.6; cam.far = dist + R0 * 1.6;
    cam.position.set(0, Math.sin(v.pitch) * dist - lift, Math.cos(v.pitch) * dist); cam.lookAt(0, -lift, 0);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  }
  /** obj-local -> the kit pivot's world */
  private M(v: KView) {
    this.inner.updateMatrix();
    return new THREE.Matrix4().makeTranslation(0, -this.H0 / 2, 0).multiply(new THREE.Matrix4().makeRotationY(v.yaw)).multiply(this.inner.matrix);
  }
  /** where an obj-local point lands (art px), and whether its normal n (obj-local, optional) faces the camera */
  project(p: THREE.Vector3, v: KView, n?: THREE.Vector3): [number, number, boolean] {
    this.frame(v);
    const M = this.M(v), q = p.clone().applyMatrix4(M);
    let facing = true;
    if (n) { const wn = n.clone().transformDirection(M), d = new THREE.Vector3().subVectors(this.cam.position, new THREE.Vector3(0, 0, 0)).normalize(); facing = wn.dot(d) > 0.05; }
    q.project(this.cam);
    return [(q.x * 0.5 + 0.5) * v.w, (1 - (q.y * 0.5 + 0.5)) * v.h, facing];
  }
  /** the sight line through a canvas point, in obj-local space */
  ray(px: number, py: number, v: KView): THREE.Ray {
    this.frame(v);
    const nx = (px / v.w) * 2 - 1, ny = 1 - (py / v.h) * 2, inv = this.M(v).invert();
    const a = new THREE.Vector3(nx, ny, -1).unproject(this.cam).applyMatrix4(inv), b = new THREE.Vector3(nx, ny, 1).unproject(this.cam).applyMatrix4(inv);
    return new THREE.Ray(a, b.sub(a).normalize());
  }
  draw(ctx: CanvasRenderingContext2D, v: KView, o: ShotOpts = {}) {
    return renderModel(this.root, ctx, v.w, v.h, { ink: 2, ...this.shot, ...o, yaw: v.yaw, pitch: v.pitch, zoom: v.zoom, lift: v.lift });
  }
}

// kit3d picking: ray-picks registered objects under the pointer (hover and click), sets the cursor, and ignores
// presses that turned into drags. Hit meshes may be invisible.
//   const p = new Picker(camera, overlayElement); p.add(key.hit, { click: () => ..., hover: (on) => ... })
import * as THREE from 'three';

interface Entry { obj: THREE.Object3D; click?: () => void; hover?: (on: boolean) => void }
export class Picker {
  private list: Entry[] = []; private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2(); private hot: Entry | null = null;
  private down: { x: number; y: number } | null = null; private last = { x: -1, y: -1 };
  constructor(readonly cam: THREE.Camera, readonly el: HTMLElement) {
    el.addEventListener('pointermove', this.move); el.addEventListener('pointerdown', this.press); el.addEventListener('pointerup', this.release);
  }
  add(obj: THREE.Object3D, o: { click?: () => void; hover?: (on: boolean) => void }) { this.list.push({ obj, ...o }); }
  remove(obj: THREE.Object3D) { this.list = this.list.filter((e) => e.obj !== obj); if (this.hot?.obj === obj) this.hot = null; }
  clear() { this.list = []; this.hot = null; }
  private pick(x: number, y: number): Entry | null {
    const r = this.el.getBoundingClientRect(); this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam as THREE.PerspectiveCamera);
    let best: Entry | null = null, bd = Infinity;
    for (const e of this.list) {
      if (!e.obj.parent) continue;
      e.obj.updateWorldMatrix(true, false);
      const hits = this.ray.intersectObject(e.obj, true);
      if (hits.length && hits[0].distance < bd) { bd = hits[0].distance; best = e; }
    }
    return best;
  }
  /** re-test the last pointer position (call after the scene moved) */
  refresh() { if (this.last.x >= 0) this.hover(this.pick(this.last.x, this.last.y)); }
  private hover(e: Entry | null) {
    if (e === this.hot) return;
    this.hot?.hover?.(false); this.hot = e; e?.hover?.(true);
    this.el.style.cursor = e?.click ? 'pointer' : '';
  }
  private move = (ev: PointerEvent) => { this.last = { x: ev.clientX, y: ev.clientY }; this.hover(this.pick(ev.clientX, ev.clientY)); };
  private press = (ev: PointerEvent) => { if (ev.button === 0) this.down = { x: ev.clientX, y: ev.clientY }; };
  private release = (ev: PointerEvent) => {
    if (!this.down || ev.button !== 0) return;
    const moved = Math.hypot(ev.clientX - this.down.x, ev.clientY - this.down.y) > 6; this.down = null;
    if (moved) return;
    this.pick(ev.clientX, ev.clientY)?.click?.();
  };
  dispose() { this.el.removeEventListener('pointermove', this.move); this.el.removeEventListener('pointerdown', this.press); this.el.removeEventListener('pointerup', this.release); this.list = []; }
}

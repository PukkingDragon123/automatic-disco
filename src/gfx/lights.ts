// Sun + sky light. The shadow frustum follows the camera focus and snaps to whole shadow texels (no shimmer).
import * as THREE from 'three';
import type { Palette } from '../world/palette';

export class Sun {
  readonly light: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly dir = new THREE.Vector3(-0.5, 0.82, -0.32).normalize();
  radius = 46;
  private size = 2048;
  constructor(pal: Palette, scene: THREE.Scene) {
    this.light = new THREE.DirectionalLight(pal.sun, 2.7);
    this.light.castShadow = true;
    const s = this.light.shadow;
    s.mapSize.set(this.size, this.size);
    s.bias = -0.0005; s.normalBias = 0.035;
    s.camera.near = 1; s.camera.far = 260;
    this.hemi = new THREE.HemisphereLight(pal.ambient, pal.groundLight, 1.7);
    scene.add(this.light, this.light.target, this.hemi);
  }
  setColors(pal: Palette, k = 1) {
    this.light.color.set(pal.sun); this.light.intensity = 3.3 * k;
    this.hemi.color.set(pal.ambient); this.hemi.groundColor.set(pal.groundLight); this.hemi.intensity = 1.3 * (0.55 + 0.45 * k);
  }
  follow(target: THREE.Vector3, viewDist: number) {
    const R = (this.radius = Math.max(26, Math.min(120, viewDist * 1.15)));
    const cam = this.light.shadow.camera;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
    cam.updateProjectionMatrix();
    // snap the focus to shadow texels in light space
    const texel = (2 * R) / this.size;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dir);
    const inv = q.clone().invert();
    const p = target.clone().applyQuaternion(inv);
    p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel;
    p.applyQuaternion(q);
    this.light.target.position.copy(p);
    this.light.position.copy(p).addScaledVector(this.dir, 120);
    this.light.target.updateMatrixWorld();
    this.light.updateMatrixWorld();
  }
}

// Sun + sky light: a warm key from the sun against a cool sky fill and a warm ground bounce, soft PCF shadows. The
// shadow frustum follows the camera focus and snaps to whole shadow texels (no shimmer).
//
// The Sun also carries the scene's atmosphere (`env`): aerial haze, low mist, light shafts, wet ground, dew, heat
// shimmer and rain. Post reads it for any scene the sun lights (scene.userData.sun); details.ts drives it in play.
import * as THREE from 'three';
import type { Palette } from '../world/palette';
import { settings, qualityProfile, onSettings } from '../settings';

export interface Env {
  /** aerial perspective: extinction per metre (blue distance) */
  haze: number;
  /** low mist: density at the mist base, base height, falloff height (m); patchiness 0..1 */
  mist: number; mistY: number; mistH: number; patch: number;
  /** light shafts through the canopy (volumetric shadow march), 0..1 */
  rays: number;
  /** wet ground (rain): darkening, puddles reflecting the sky, 0..1 */
  wet: number;
  /** falling rain 0..1 (rings in puddles) */
  rain: number;
  /** morning dew glints on leaves and grass 0..1 */
  dew: number;
  /** heat shimmer over hot ground 0..1 */
  heat: number;
  /** wind (m/s) drifting the mist */
  wind: THREE.Vector2;
  /** sky colour (reflections, haze base) */
  sky: THREE.Color;
}

const WARM_KEY = new THREE.Color(0xffd9a8), COOL_SKY = new THREE.Color(0x8fb4ff), WARM_BOUNCE = new THREE.Color(0x9a7450);

export class Sun {
  readonly light: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly dir = new THREE.Vector3(-0.5, 0.82, -0.32).normalize();
  /** cloud cover 0..1 (rain): dims and softens the key, lifts the fill */
  overcast = 0;
  radius = 46;
  readonly env: Env;
  private size = 2048;
  constructor(readonly pal: Palette, scene: THREE.Scene) {
    this.light = new THREE.DirectionalLight(pal.sun, 2.7);
    this.light.castShadow = true;
    const s = this.light.shadow;
    this.size = qualityProfile().shadowMap;
    s.mapSize.set(this.size, this.size);
    s.bias = -0.0004; s.normalBias = 0.03;
    // soft PCF: three r186 spreads 5 hardware-filtered taps over this radius (in texels)
    s.radius = this.softness();
    s.camera.near = 1; s.camera.far = 260;
    this.hemi = new THREE.HemisphereLight(pal.ambient, pal.groundLight, 1.7);
    scene.add(this.light, this.light.target, this.hemi);
    scene.userData.sun = this;
    this.env = { haze: 0.0045, mist: 0, mistY: 0, mistH: 1.4, patch: 0.6, rays: 0.5, wet: 0, rain: 0, dew: 0, heat: 0, wind: new THREE.Vector2(0.35, 0.12), sky: new THREE.Color(pal.sky) };
    this.setColors(pal, 1);
    this.offSettings = onSettings((_s, ch) => { if (ch.includes('quality')) this.applyQuality(); });
  }
  private offSettings: () => void;
  /** PCF radius in shadow texels: wider on the bigger map, wider still under cloud */
  private softness() { return (settings.quality === 'low' ? 1 : this.size > 1024 ? 2.2 : 1.6) + this.overcast * 3; }
  /** a new shadow map size takes a fresh map */
  applyQuality() {
    const n = qualityProfile().shadowMap, s = this.light.shadow;
    if (n === this.size) return;
    this.size = n; s.mapSize.set(n, n);
    s.map?.dispose(); (s as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
  }
  dispose() { this.offSettings(); }
  /** k: daylight 0 (night) .. 1 (full day) */
  setColors(pal: Palette, k = 1) {
    const oc = this.overcast;
    // warm key, a touch warmer than the palette's sun; cloud greys and dims it
    this.light.color.set(pal.sun).lerp(WARM_KEY, 0.22);
    if (oc > 0) this.light.color.lerp(_g.setRGB(0.78, 0.8, 0.86), oc * 0.5);
    this.light.intensity = 3.3 * k * (1 - oc * 0.55);
    // cool sky fill from above, warm bounce from the ground
    this.hemi.color.set(pal.ambient).lerp(COOL_SKY, 0.22);
    this.hemi.groundColor.set(pal.groundLight).lerp(WARM_BOUNCE, 0.18);
    this.hemi.intensity = 1.3 * (0.55 + 0.45 * k) * (1 + oc * 0.2);
    this.env.sky.set(pal.sky).lerp(_g.setRGB(0.62, 0.66, 0.72), oc * 0.6);
    // cloud softens the shadows too
    this.light.shadow.radius = this.softness();
  }
  follow(target: THREE.Vector3, viewDist: number) {
    const R = (this.radius = Math.max(26, Math.min(120, viewDist * 1.15)));
    const cam = this.light.shadow.camera;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
    cam.updateProjectionMatrix();
    // snap the focus to shadow texels in light space
    const texel = (2 * R) / this.size;
    const q = _q.setFromUnitVectors(_z.set(0, 0, 1), this.dir);
    const inv = _qi.copy(q).invert();
    const p = _p.copy(target).applyQuaternion(inv);
    p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel;
    p.applyQuaternion(q);
    this.light.target.position.copy(p);
    this.light.position.copy(p).addScaledVector(this.dir, 120);
    this.light.target.updateMatrixWorld();
    this.light.updateMatrixWorld();
  }
}
const _g = new THREE.Color(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _z = new THREE.Vector3(), _p = new THREE.Vector3();

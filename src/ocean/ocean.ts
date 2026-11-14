// The sea in play (game.ocean): drives the sea surface (world/water.ts) from the sun, the sky and the climate (wind
// and storms raise the swell and whitecaps, rain rings, bloodtide's red tide, bioluminescence at night and in the
// eclipse), runs the underwater pass when the camera goes below the surface, and owns the life and the work of the sea:
// the reef and kelp (reef.ts), fish, predators and titans (fishery.ts), the golem's dive and its seabed harvest, the
// pontoons it builds on (dive.ts), and the drop pod's splashdown (splash.ts).
import * as THREE from 'three';
import type { Game } from '../game/game';
import { seaState, type SeaState } from '../world/water';
import { Underwater } from './under';
import { RAMPS } from '../art/palette';
import { setMuffle } from '../audio/audio';
import { daylight } from '../game/daylight';
import { clamp, damp } from '../core/rand';
import type { Swell } from './waves';
import type { ShoreField } from './shore';
import { Reef } from './reef';
import { Fishery } from './fishery';
import { Dive } from './dive';
import { Splashes } from './splash';
import { registerSeaWorks, hookFactory } from './pontoon';

const P = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const C = new THREE.Color(), _cur = new THREE.Vector2();
const setRamp = (c: THREE.Color, r: readonly number[], k: number) => c.setHex(r[clamp(Math.round(k), 0, r.length - 1)]);

/** what the sea reads from the climate (game.climate when it exists, else the ecosystem's stand-in, else the URL) */
export interface SeaWeather { wind: number; windDir: THREE.Vector2; storm: number; cloud: number; rain: number; red: number; eclipse: number }

export class Ocean {
  readonly sea: SeaState;
  readonly mesh: THREE.Mesh;
  readonly swell: Swell;
  readonly shore: ShoreField;
  readonly under: Underwater;
  readonly wx: SeaWeather = { wind: 4, windDir: new THREE.Vector2(1, 0), storm: 0, cloud: 0.3, rain: 0, red: 0, eclipse: 0 };
  /** the camera is below the surface */
  underwater = false;
  readonly reef: Reef | null = null;
  readonly fishery: Fishery | null = null;
  readonly dive: Dive;
  readonly splashes: Splashes;
  /** the drop pod came down in the water (the core floats in it) */
  splashed = false;
  /** systems that tick with the sea (reef, fish, the golem's dive, splashes); each gets dt and the time */
  readonly parts: { update(dt: number, t: number): void; dispose?(): void }[] = [];
  /** test hooks: force the light (the test page drives a sunset or a night) */
  forceSun: { dir: THREE.Vector3; col: THREE.Color; k: number } | null = null;
  private shoreT = 0; private errs = 0;
  constructor(readonly g: Game) {
    const mesh = g.world.terrain.waterMesh, st = seaState(mesh);
    if (!st) throw new Error('ocean: the terrain has no sea');
    this.mesh = mesh; this.sea = st; this.swell = st.swell; this.shore = st.shore;
    this.under = new Underwater(g.world.scene, st.grab, { uRampW: st.U.uRampW, uRampB: st.U.uRampB });
    this.wx.windDir.copy(this.swell.main);
    // the camera rides the sea's surface, not the sea floor, when it looks out over the water
    const R = g.region;
    g.cam.ground = (x, z) => Math.max(R.groundSmooth(x, z), R.water);
    // the life of the sea: reefs and kelp on the floor, and the animals over them
    const sea = R.h.some((h) => h < R.water - 0.6);
    if (sea) {
      try { this.reef = new Reef(R, () => this.level); g.world.scene.add(this.reef.group); } catch (e) { console.error('ocean: reef', e); }
      try { this.fishery = new Fishery(this, this.reef); g.world.scene.add(this.fishery.group); } catch (e) { console.error('ocean: fish', e); }
    }
    this.splashes = new Splashes(this);
    this.dive = new Dive(this, this.reef, this.fishery);
    registerSeaWorks(this);
  }
  // ------------------------------------------------------------------ the water's surface, disturbed
  /** a ring on the water (s ~0.2 drip .. 1.5 a big entry) */
  ripple(x: number, z: number, s = 0.6) { this.splashes.ripple(x, z, s); }
  /** something hit the water (size ~ metres) */
  splash(x: number, z: number, size = 0.5) { this.splashes.splash(x, z, size); this.fishery?.splash(x, z, 3 + size * 4, Math.min(1, size)); }
  /** a sea titan falling back into the sea */
  titanSplash(x: number, z: number) { this.splashes.big(x, z, 1.3); }
  /** game.touchdown: the drop pod hit the water here; it floats, the core rides in it, the golem climbs out */
  splashdown(x: number, z: number) { this.splashed = true; this.splashes.splashdown(x, z, (window as unknown as { __descent?: unknown }).__descent ? 1.9 : 0); }
  /** test pages: a pod falling from the sky onto the water */
  dropPod(x: number, z: number, alt = 40) { this.splashed = true; this.splashes.dropPod(x, z, alt); }
  get region() { return this.g.region; }
  get time() { return this.g.world.time; }
  /** the stage the sea rides at (eco.level, halved like the shader) */
  get level() { return this.region.water + ((this.g.world.terrain.U.uStage?.value as number) ?? 0) * 0.5; }
  /** depth of water over the sea floor at a point (0 on land) */
  depthAt(x: number, z: number) { return Math.max(0, this.level - this.bedAt(x, z)); }
  /** the sea floor (outside the map, the open sea's bed) */
  bedAt(x: number, z: number) { const R = this.region; if (x < 0 || z < 0 || x > R.N || z > R.N) return R.oceanic ? R.water - 18 : R.water - 6; return R.groundSmooth(x, z); }
  /** the moving surface's height at a point (waves included) */
  surfaceAt(x: number, z: number) { return this.level + this.swell.height$(x, z, this.time, this.depthAt(x, z)); }
  /** open water at a point (sea, not a river, not land) */
  isSea(x: number, z: number) { return this.bedAt(x, z) < this.level - 0.05; }

  update(dt: number) {
    try { this.tick(dt); } catch (e) { if (this.errs++ < 5) console.error('ocean', e); }
  }
  private tick(dt: number) {
    const t = this.time;
    this.weather(dt);
    this.light();
    // the swell follows the wind; storms heap it up and sharpen it
    const sw = this.swell, oce = this.region.oceanic ? 1 : 0.55, w = this.wx;
    const hGoal = (0.14 + w.wind * 0.05 + w.storm * 1.25) * oce, sGoal = clamp(0.25 + w.wind / 22 + w.storm * 0.4, 0, 1);
    const nh = damp(sw.height, hGoal, 0.25, dt), ns = damp(sw.steep, sGoal, 0.3, dt);
    if (Math.abs(nh - sw.height) > 1e-4 || Math.abs(ns - sw.steep) > 1e-4) { sw.height = nh; sw.steep = ns; sw.sync(); }
    const U = this.sea.U;
    U.uWindK.value = clamp((w.wind - 3) / 11 + w.storm * 0.6, 0, 1);
    (U.uWindV.value as THREE.Vector2).copy(w.windDir).multiplyScalar(0.6 + w.wind * 0.12);
    U.uCloud.value = clamp(w.cloud, 0, 1);
    U.uRed.value = damp(U.uRed.value, w.red, 0.4, dt);
    // underwater: the camera below the moving surface
    const cam = this.g.cam.cam, sy = this.surfaceAt(cam.position.x, cam.position.z);
    this.underwater = cam.position.y < sy - 0.04;
    this.under.update(t, cam, this.level, this.underwater);
    // under the water the post pass's air (haze, mist, light shafts through the canopy) gives way to the water's own
    if (this.underwater) { const e = this.g.world.sun.env; e.haze = 0; e.mist = 0; e.rays = 0; }

    setMuffle(this.underwater ? clamp((sy - cam.position.y) * 0.5 + 0.55, 0, 1) : 0);
    // storm spray: crests torn off by the wind near the view
    if (w.storm > 0.4 && Math.random() < dt * w.storm * 10) {
      const tg = this.g.cam.target, x = tg.x + (Math.random() - 0.5) * 30, z = tg.z + (Math.random() - 0.5) * 30;
      if (this.isSea(x, z) && this.depthAt(x, z) > 1.2) { const y = this.surfaceAt(x, z); this.g.fx.spray(x, y + 0.2, z, w.windDir.x, 0.35, w.windDir.y, 5, RAMPS.snow[4], { speed: 4 + w.wind * 0.3, cone: 0.4, size: 3, life: 1.1, grav: 4, drag: 0.8 }); }
    }
    const night = U.uBio.value as number;
    this.reef?.update(dt, t, Math.max(night, w.eclipse), _cur.set(w.windDir.x, w.windDir.y).multiplyScalar(0.06 + w.storm * 0.2));
    this.dive.update(dt, t);
    this.fishery?.update(dt, t, this.dive.golem(), Math.max(night, w.eclipse), w.storm, w.red);
    this.splashes.update(dt, t);
    if (this.g.factory) hookFactory(this, this.g.factory);
    for (const p of this.parts) p.update(dt, t);
    // the coast field follows the ground (craters, earthshaping) every few seconds
    if ((this.shoreT -= dt) <= 0) { this.shoreT = 6; if (this.coastMoved()) this.shore.build(); }
  }
  private coastSum = -1;
  private coastMoved() {
    const R = this.region, h = R.h; let s = 0;
    for (let i = 0; i < h.length; i += 7) if (Math.abs(h[i] - R.water) < 1.5) s += h[i] * ((i % 13) + 1);
    const moved = this.coastSum >= 0 && Math.abs(s - this.coastSum) > 1e-3; this.coastSum = s; return moved;
  }
  /** wind, storm, cloud, red tide, eclipse: game.climate (CONTRACT.md) when there is one, else the stand-in */
  private weather(dt: number) {
    const w = this.wx, g = this.g as unknown as { climate?: Record<string, unknown>; world: { eco?: { climate?: Record<string, unknown> } } };
    const live = g.climate ?? null, c = live ?? g.world.eco?.climate ?? null;
    const weather = (P.get('storm') ? 'storm' : (c?.weather as string)) ?? 'clear';
    const season = (P.get('season') ?? (c?.season as string)) ?? 'bloom';
    const storm = weather === 'storm' ? 1 : weather === 'rain' || weather === 'redrain' ? 0.25 : 0;
    let wind = 3.5 + storm * 12 + (weather === 'cloudy' ? 2 : 0) + (weather === 'fog' ? -2 : 0);
    // the climate's wind (a 0..~2 strength) as metres a second
    const cw = c?.wind as THREE.Vector2 | undefined;
    if (cw && typeof cw.x === 'number') { const l = Math.hypot(cw.x, cw.y); if (l > 0.02) { wind = Math.max(wind * 0.6, l * 8); w.windDir.set(cw.x / l, cw.y / l); } }
    if (P.has('wind')) wind = Number(P.get('wind'));
    w.wind = damp(w.wind, wind, 0.3, dt); w.storm = damp(w.storm, storm, 0.3, dt);
    const cloud = typeof c?.cloud === 'number' ? (c.cloud as number) : weather === 'storm' ? 0.95 : weather === 'rain' || weather === 'redrain' ? 0.75 : weather === 'cloudy' ? 0.6 : weather === 'fog' ? 0.8 : 0.25;
    w.cloud = damp(w.cloud, cloud, 0.4, dt);
    const blood = typeof c?.bloodK === 'number' ? (c.bloodK as number) : (c?.event === 'bloodtide' || season === 'bloodtide' ? 1 : 0);
    const ecl = typeof c?.eclipseK === 'number' ? (c.eclipseK as number) : (c?.event === 'eclipse' || season === 'eclipse' ? 1 : 0);
    w.red = P.get('season') === 'bloodtide' ? 1 : blood; w.eclipse = P.get('season') === 'eclipse' ? 1 : ecl;
  }
  /** the sun (or at night the moon), the sky and the light under the water, as the climate and the post pass have them */
  private light() {
    const U = this.sea.U, sun = this.g.world.sun, f = this.forceSun, w = this.wx, e = sun.env as unknown as { sunSky?: THREE.Vector3; moonSky?: THREE.Vector3; day?: number };
    const k = f ? f.k : clamp(sun.light.intensity / 3.3, 0, 1);
    const day = f ? f.k : e.day ?? k;
    // glitter follows the sun by day and the moon by night
    const sd = U.uSunDir.value as THREE.Vector3, sc = U.uSunCol.value as THREE.Color;
    if (f) { sd.copy(f.dir); sc.copy(f.col); }
    else if (day < 0.25 && e.moonSky) { sd.copy(e.moonSky); sc.setRGB(0.55, 0.62, 0.85).multiplyScalar(0.9 + w.eclipse * 0.2); }
    else { sd.copy(e.sunSky ?? sun.dir); if (sd.y < 0.02) sd.y = 0.02; sc.copy(sun.light.color).multiplyScalar(0.35 + sun.light.intensity * 0.32); }
    sd.normalize();
    sc.multiplyScalar(1 - w.cloud * 0.55);
    U.uSunK.value = Math.max(k, 0.18);
    // the sky the sea mirrors is the post pass's own (zenith, horizon), so the reflection matches the sky above
    const PU = (this.g.engine.post as unknown as { U: Record<string, THREE.IUniform> }).U;
    if (PU.uSkyZen && PU.uSkyHor && (PU.uSkyZen.value as THREE.Color).getHex() !== 0) { (U.uSkyTop.value as THREE.Color).copy(PU.uSkyZen.value as THREE.Color); (U.uSkyHor.value as THREE.Color).copy(PU.uSkyHor.value as THREE.Color); }
    else { const S = RAMPS.sky, si = k * 4.4 - w.cloud * 1.4; setRamp(U.uSkyTop.value as THREE.Color, S, si - 0.5); setRamp(U.uSkyHor.value as THREE.Color, S, si + 0.8); }
    setRamp(U.uCloudCol.value as THREE.Color, RAMPS.snow, k * 5 - w.cloud * 2.2);
    // in the dark and the eclipse the sea glows where it is stirred
    const night = clamp((0.42 - day) / 0.25, 0, 1);
    U.uBio.value = Math.max(night * 0.75, w.eclipse);
    const UU = this.under.U;
    (UU.uSunDir.value as THREE.Vector3).copy(sd); (UU.uSunCol.value as THREE.Color).copy(sc);
    UU.uSunK.value = U.uSunK.value; UU.uRed.value = U.uRed.value; UU.uBio.value = U.uBio.value;
    UU.uFogK.value = 0.032 + w.storm * 0.04 + (this.region.oceanic ? 0 : 0.03);
    void daylight;
  }
  dispose() { for (const p of this.parts) p.dispose?.(); this.under.dispose(); this.reef?.dispose(); this.fishery?.dispose(); this.dive.dispose(); this.splashes.dispose(); setMuffle(0); }
}

/** give a game its sea (game.ts calls this once, after the details system) */
export function attachOcean(g: Game): Ocean | null {
  try {
    const o = new Ocean(g);
    (g as unknown as { ocean: Ocean }).ocean = o;
    g.update$.push((dt) => o.update(dt));
    return o;
  } catch (e) { console.error('ocean', e); return null; }
}

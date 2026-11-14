// The planet's climate: an eight-season year (two of them extraordinary), weather by season and biome, temperature,
// wind and gusts, lightning, and the light of every hour: the sun's colour through the air at its elevation, a sky-tinted
// fill with a bounce off the ground, moonlight from two moons at night (the second turns red in the bloodtide), the
// eclipse that swallows the sun for days. It drives the sun (lights.ts), the atmosphere and ground looks (post.ts via
// sun.env), the falling weather (details.ts), the flora's wind, the ecology's rain and water stage, and creatures'
// bioluminescence; it emits 'season', 'weather' and 'climate-event' and sets game.climate (CONTRACT.md "Climate").
// Testing: ?season=<id> forces a season, ?weather=<id> a weather.
import * as THREE from 'three';
import type { Game } from './game';
import { clamp } from '../core/rand';
import { RAMPS } from '../art/palette';
import { Almanac } from '../ui/almanac';

export type Season = 'thaw' | 'bloom' | 'highsun' | 'monsoon' | 'eclipse' | 'ember' | 'bloodtide' | 'frost';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'dust' | 'ash' | 'redrain';
export type ClimateEvent = 'eclipse' | 'bloodtide';
export const SEASONS: Season[] = ['thaw', 'bloom', 'highsun', 'monsoon', 'eclipse', 'ember', 'bloodtide', 'frost'];
export const WEATHERS: Weather[] = ['clear', 'cloudy', 'rain', 'storm', 'fog', 'snow', 'dust', 'ash', 'redrain'];

interface SeasonDef {
  name: string; days: number; temp: number;
  /** weather odds (biome-adjusted at pick time) */
  w: Partial<Record<Weather, number>>;
  /** wind m/s base; how green the land is (1 lush, 0 dry); autumn turn; ground water stage for the ecology (-1..1) */
  wind: number; green: number; autumn: number; stage: number;
}
export const SEASON: Record<Season, SeasonDef> = {
  thaw: { name: 'Thaw', days: 3, temp: 8, w: { cloudy: 3, rain: 3, fog: 3, clear: 2, snow: 0.6 }, wind: 0.6, green: 0.55, autumn: 0, stage: 0.45 },
  bloom: { name: 'Bloom', days: 3, temp: 17, w: { clear: 5, cloudy: 2, rain: 2, fog: 1 }, wind: 0.5, green: 1, autumn: 0, stage: 0.3 },
  highsun: { name: 'High Sun', days: 3, temp: 31, w: { clear: 7, cloudy: 1, dust: 2 }, wind: 0.45, green: 0.35, autumn: 0.1, stage: -0.9 },
  monsoon: { name: 'Monsoon', days: 3, temp: 24, w: { rain: 4, storm: 3, cloudy: 2, fog: 1 }, wind: 1, green: 0.95, autumn: 0, stage: 1 },
  eclipse: { name: 'Eclipse', days: 1.5, temp: -4, w: { clear: 4, fog: 2, snow: 1, cloudy: 1 }, wind: 0.25, green: 0.7, autumn: 0, stage: -0.2 },
  ember: { name: 'Ember', days: 3, temp: 22, w: { clear: 3, ash: 3, cloudy: 2, storm: 1, dust: 1 }, wind: 0.8, green: 0.45, autumn: 1, stage: -0.6 },
  bloodtide: { name: 'Bloodtide', days: 1.5, temp: 15, w: { redrain: 4, cloudy: 2, clear: 1, fog: 1 }, wind: 0.7, green: 0.6, autumn: 0.4, stage: 0.2 },
  frost: { name: 'Frost', days: 3, temp: -9, w: { snow: 5, cloudy: 2, clear: 2, fog: 1 }, wind: 0.7, green: 0.3, autumn: 0.2, stage: -0.3 },
};
/** what each weather does: rain, cloud cover, fog, snowfall, dust, ash, red rain, lightning */
const WX: Record<Weather, { rain: number; cloud: number; fog: number; snow: number; dust: number; ash: number; red: number; bolt: number; gust: number }> = {
  clear: { rain: 0, cloud: 0.08, fog: 0, snow: 0, dust: 0, ash: 0, red: 0, bolt: 0, gust: 0.3 },
  cloudy: { rain: 0, cloud: 0.7, fog: 0.15, snow: 0, dust: 0, ash: 0, red: 0, bolt: 0, gust: 0.5 },
  rain: { rain: 0.75, cloud: 0.9, fog: 0.3, snow: 0, dust: 0, ash: 0, red: 0, bolt: 0, gust: 0.6 },
  storm: { rain: 1, cloud: 1, fog: 0.35, snow: 0, dust: 0, ash: 0, red: 0, bolt: 1, gust: 1 },
  fog: { rain: 0, cloud: 0.55, fog: 1, snow: 0, dust: 0, ash: 0, red: 0, bolt: 0, gust: 0.1 },
  snow: { rain: 0, cloud: 0.85, fog: 0.35, snow: 1, dust: 0, ash: 0, red: 0, bolt: 0, gust: 0.5 },
  dust: { rain: 0, cloud: 0.35, fog: 0.2, snow: 0, dust: 1, ash: 0, red: 0, bolt: 0, gust: 1 },
  ash: { rain: 0, cloud: 0.6, fog: 0.3, snow: 0, dust: 0, ash: 1, red: 0, bolt: 0.25, gust: 0.4 },
  redrain: { rain: 0.8, cloud: 0.85, fog: 0.3, snow: 0, dust: 0, ash: 0, red: 1, bolt: 0.2, gust: 0.6 },
};

const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3();

/** the sun's light after its path through the air at elevation h (radians): Rayleigh-ish extinction by air mass */
export function sunThroughAir(h: number, out: THREE.Color) {
  const s = Math.max(0.02, Math.sin(h)), m = 1 / (s + 0.15 * Math.pow(Math.max(0.01, h * 57.3 + 3.885), -1.253));
  return out.setRGB(Math.exp(-m * 0.055), Math.exp(-m * 0.12), Math.exp(-m * 0.28));
}

export class Climate {
  season: Season = 'bloom'; seasonT = 0; year = 1; day = 1;
  weather: Weather = 'clear';
  temp = 15; readonly wind = new THREE.Vector2(0.4, 0.15);
  rain = 0; cloud = 0; fog = 0; snow = 0; dust = 0; ash = 0; red = 0;
  /** daylight 0..1 (as game.daylight k) */
  light = 1;
  event: ClimateEvent | null = null;
  /** eclipse darkness and bloodtide strength 0..1 (ramping in and out over each special season) */
  eclipseK = 0; bloodK = 0;
  /** snow lying on the ground 0..1, frost 0..1, ice on still water 0..1 */
  snowCover = 0; frost = 0; ice = 0;
  /** lightning flash 0..1 (decays fast) */
  flash = 0;
  private t: number; private yearLen: number; private dayLen: number;
  private wxNext = 30; private wxT: Record<string, number> = {};
  private forcedS: Season | null = null; private forcedW: Weather | null = null;
  private lastSeason: Season | null = null; private boltT = 4; private handlers: Record<string, ((d: unknown) => void)[]> = {};
  private almanac: Almanac | null = null;
  private gust = 0; private gustT = 0;

  constructor(readonly g: Game) {
    this.dayLen = g.world.dayLen;
    this.yearLen = SEASONS.reduce((s, k) => s + SEASON[k].days, 0) * this.dayLen;
    const P = new URLSearchParams(location.search);
    const fs = P.get('season') as Season | null, fw = P.get('weather') as Weather | null;
    if (fs && SEASONS.includes(fs)) this.forcedS = fs;
    if (fw && WEATHERS.includes(fw)) this.forcedW = fw;
    // a landing falls early in the bloom
    this.t = this.startOf(this.forcedS ?? 'bloom') + SEASON[this.forcedS ?? 'bloom'].days * this.dayLen * (this.forcedS ? 0.5 : 0.15);
    this.pickWeather(true);
    for (const k of Object.keys(WX[this.weather]) as (keyof typeof WX.clear)[]) this.wxT[k] = WX[this.weather][k];
    this.rain = this.wxT.rain; this.cloud = this.wxT.cloud; this.fog = this.wxT.fog;
    if (this.forcedS === 'frost') this.snowCover = 0.85;
    (g as unknown as { climate: Climate }).climate = this;
    try { this.almanac = new Almanac(g, this); } catch (e) { console.error('almanac', e); }
  }

  // ------------------------------------------------------------------ queries
  on(ev: string, fn: (d: unknown) => void) { (this.handlers[ev] ??= []).push(fn); }
  private emit(ev: string, d: unknown) { for (const f of this.handlers[ev] ?? []) { try { f(d); } catch (e) { console.error(e); } } this.g.emit(ev, d); }
  private startOf(s: Season) { let t = 0; for (const k of SEASONS) { if (k === s) return t; t += SEASON[k].days * this.dayLen; } return 0; }
  /** 0..1 through the year */
  get yearPhase() { return ((this.t % this.yearLen) + this.yearLen) % this.yearLen / this.yearLen; }
  /** seconds until a season starts (for the almanac's warning) */
  until(s: Season) { const now = this.t % this.yearLen, at = this.startOf(s); return at >= now ? at - now : at + this.yearLen - now; }
  get dayLength() { return this.dayLen; }
  /** force a season and/or a weather (null leaves it running) */
  force(s: Season | null, w: Weather | null) {
    if (s) { this.forcedS = s; this.t = this.startOf(s) + SEASON[s].days * this.dayLen * 0.5; }
    if (w) { this.forcedW = w; this.setWeather(w); for (const k of Object.keys(WX[w]) as (keyof typeof WX.clear)[]) this.wxT[k] = WX[w][k]; }
  }
  /** for a terrain shader: snow, frost, dryness, wetness, mud (0..1), as uniform-shaped objects */
  groundUniforms() {
    return { uSnow: { value: this.snowCover }, uFrost: { value: this.frost }, uDry: { value: 1 - SEASON[this.season].green }, uWetG: { value: this.g.world.sun.env.wet }, uMud: { value: this.season === 'thaw' || this.season === 'monsoon' ? 0.7 : 0.2 } };
  }

  // ------------------------------------------------------------------ the clock
  update(dt: number) {
    if (dt <= 0) return;
    this.t += dt;
    if (this.forcedS) { const a = this.startOf(this.forcedS), L = SEASON[this.forcedS].days * this.dayLen; if (this.t > a + L * 0.95) this.t = a + L * 0.5; }
    // which season, how far through it
    let acc = 0; const yt = this.t % this.yearLen;
    for (const k of SEASONS) { const L = SEASON[k].days * this.dayLen; if (yt < acc + L) { this.season = k; this.seasonT = (yt - acc) / L; break; } acc += L; }
    this.year = Math.floor(this.t / this.yearLen) + 1;
    this.day = Math.floor(this.t / this.dayLen) + 1;
    if (this.season !== this.lastSeason) {
      const was = this.lastSeason;
      this.lastSeason = this.season;
      this.emit('season', { season: this.season });
      if (was === 'eclipse' || was === 'bloodtide') this.emit('climate-event', { event: was, phase: 'end' });
      if (this.season === 'eclipse' || this.season === 'bloodtide') this.emit('climate-event', { event: this.season, phase: 'start' });
      if (was) this.wxNext = 0;
    }
    this.event = this.season === 'eclipse' || this.season === 'bloodtide' ? this.season : null;
    const ramp = (s: Season) => this.season === s ? clamp(Math.min(this.seasonT, 1 - this.seasonT) / 0.12, 0, 1) : 0;
    this.eclipseK += (ramp('eclipse') - this.eclipseK) * Math.min(1, dt * 0.5);
    this.bloodK += (ramp('bloodtide') - this.bloodK) * Math.min(1, dt * 0.5);
    // weather: a new pick every few minutes; its parameters ease in
    if ((this.wxNext -= dt) <= 0) this.pickWeather(false);
    const W = WX[this.weather], k = Math.min(1, dt / 18);
    for (const key of Object.keys(W) as (keyof typeof W)[]) this.wxT[key] += (W[key] - this.wxT[key]) * k;
    this.rain = this.wxT.rain; this.cloud = this.wxT.cloud; this.fog = this.wxT.fog; this.snow = this.wxT.snow; this.dust = this.wxT.dust; this.ash = this.wxT.ash; this.red = Math.max(this.wxT.red, this.bloodK * 0.35);
    // temperature: the season, the biome, the hour, the weather
    const bi = this.g.region.biome, S = SEASON[this.season], d = this.g.world.day, elev = Math.cos((d - 0.25) * Math.PI * 2);
    this.temp = S.temp + (bi.temp - 0.5) * 30 + elev * 5 - this.cloud * 2 - this.rain * 3 - this.eclipseK * 6;
    // snow lies when it is cold; it melts when it is not; still water freezes
    const cold = clamp((-this.temp + 1) / 8, 0, 1);
    this.snowCover = clamp(this.snowCover + dt * (this.snow * cold / 60 - (this.temp > 2 ? (this.temp - 2) / 900 : 0) - this.rain * 0.002), 0, 1);
    this.frost += (cold * (1 - this.cloud * 0.3) - this.frost) * Math.min(1, dt / 40);
    this.ice += (clamp((-this.temp - 2) / 6, 0, 1) - this.ice) * Math.min(1, dt / 60);
    // wind and gusts
    this.gustT -= dt;
    if (this.gustT <= 0) { this.gustT = 2 + Math.random() * 6; this.gust = Math.random() * (0.4 + this.wxT.gust); }
    const base = S.wind * (0.6 + this.wxT.gust * 0.9) + this.dust * 1.2, ang = Math.sin(this.t * 0.013) * 1.2 + this.g.region.seed;
    const sp = base * (1 + this.gust * Math.max(0, Math.sin(this.t * 1.7)) * 0.8);
    this.wind.set(Math.cos(ang) * sp, Math.sin(ang) * sp);
    this.lightning(dt);
    this.drive(dt);
    this.almanac?.update(dt);
  }

  private pickWeather(first: boolean) {
    this.wxNext = (140 + Math.random() * 220) * (this.event ? 0.7 : 1);
    if (this.forcedW) { this.setWeather(this.forcedW); return; }
    const bi = this.g.region.biome, S = SEASON[this.season], odds: [Weather, number][] = [];
    for (const w of WEATHERS) {
      let p = S.w[w] ?? 0;
      if (w === 'rain' || w === 'storm' || w === 'redrain') p *= 0.3 + bi.moist * 1.2;
      if (w === 'fog') p *= 0.4 + bi.moist;
      if (w === 'dust') p *= bi.key === 'desert' || bi.key === 'savanna' || bi.key === 'ashland' ? 3 : 0.15;
      if (w === 'snow') p *= bi.temp < 0.3 ? 2.5 : bi.temp > 0.75 ? 0.1 : 1;
      if ((w === 'rain' || w === 'storm') && bi.key === 'desert') p *= 0.2;
      if ((w === 'rain' || w === 'storm') && S.temp + (bi.temp - 0.5) * 30 < 0) p = 0;
      if (w === 'ash') p *= bi.key === 'ashland' ? 2 : 1;
      if (p > 0) odds.push([w, p]);
    }
    if (first && !this.forcedS) { this.setWeather('clear'); return; }
    let r = Math.random() * odds.reduce((s, [, p]) => s + p, 0);
    for (const [w, p] of odds) { if ((r -= p) <= 0) { this.setWeather(w); return; } }
  }
  private setWeather(w: Weather) {
    if (w === this.weather) return;
    this.weather = w;
    this.emit('weather', { weather: w });
  }

  // ------------------------------------------------------------------ lightning
  private lightning(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 5);
    const odds = this.wxT.bolt;
    if (odds < 0.15) return;
    if ((this.boltT -= dt * odds) > 0) return;
    this.boltT = 2 + Math.random() * 7;
    const g = this.g, tgt = g.cam.target, a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 30;
    const x = clamp(tgt.x + Math.cos(a) * r, 1, g.region.N - 1), z = clamp(tgt.z + Math.sin(a) * r, 1, g.region.N - 1), y = g.world.surfaceY(x, z);
    this.flash = 0.6 + Math.random() * 0.4;
    // the bolt: a jagged arc from the cloud base down to the ground, and a hit on the ground
    const top = _v.set(x + (Math.random() - 0.5) * 6, y + 26, z + (Math.random() - 0.5) * 6).clone();
    let prev = top;
    for (let i = 1; i <= 5; i++) { const t = i / 5, p = new THREE.Vector3(top.x + (x - top.x) * t + (Math.random() - 0.5) * 3 * (1 - t), top.y + (y - top.y) * t, top.z + (z - top.z) * t + (Math.random() - 0.5) * 3 * (1 - t)); g.fx.arc(prev, p, 0.22, 0xe8f0ff, 0.25); prev = p; }
    const v = (g as unknown as { details?: { vfx: { play(n: string, x: number, y: number, z: number, o?: object): void } } }).details?.vfx;
    v?.play('impact', x, y + 0.3, z, { scale: 2.2, ramp: 'glowTeal' });
    v?.play('shock', x, y + 0.04, z, { scale: 1.4, ramp: 'stone' });
    const dist = Math.hypot(x - tgt.x, z - tgt.z);
    // thunder follows the flash at the speed of sound (compressed for play)
    setTimeout(() => { import('../audio/audio').then((m) => m.sfx('crack', 0.25 + Math.random() * 0.15, clamp(1.3 - dist / 50, 0.15, 1))).catch(() => { /* no audio */ }); }, Math.min(2500, dist * 40));
  }

  // ------------------------------------------------------------------ light and everything it touches
  /** replaces game.daylight(): the sun, the moons, the sky fill, the grade. Returns true when it ran. */
  daylight(): boolean {
    const g = this.g, w = g.world, sun = w.sun, d = w.day, ang = (d - 0.25) * Math.PI * 2;
    const elev = Math.cos(ang), h = Math.asin(clamp(elev * 0.92, -1, 1));
    const ecl = this.eclipseK;
    // daylight: the sun above the horizon, swallowed in the eclipse
    const dayK = clamp(elev * 1.6 + 0.12, 0, 1) * (1 - ecl * 0.93);
    // the sun's (or, at night, the moons') direction: the shadow-casting light follows whichever is up
    const night = dayK < 0.15;
    if (!night) sun.dir.set(Math.sin(ang) * 0.75, Math.max(0.12, Math.abs(elev) * 0.92 + 0.08), -0.35 + Math.cos(ang) * 0.22).normalize();
    else sun.dir.set(-Math.sin(ang) * 0.6, 0.75, 0.35).normalize();
    // the key light's colour through the air, its strength by elevation; cloud dims and greys it
    const sc = sunThroughAir(Math.max(0.03, h), _c);
    const pal = this.g.region.pal;
    sun.overcast = Math.max(this.cloud * 0.85, this.dust * 0.6, this.ash * 0.7);
    sun.setColors(pal, Math.max(0.16, dayK));
    if (!night) {
      sun.light.color.copy(sc).multiply(_c2.set(pal.sun).lerp(_c2.clone().setRGB(1, 1, 1), 0.6));
      sun.light.intensity = 3.4 * clamp(dayK, 0, 1) * (1 - sun.overcast * 0.6);
    } else {
      // moonlight: the pale moon, and the red one in the bloodtide
      const moon = _c2.setRGB(0.42, 0.5, 0.72).lerp(_c.setRGB(0.85, 0.22, 0.16), this.bloodK);
      sun.light.color.copy(moon);
      sun.light.intensity = (0.55 + this.bloodK * 0.35) * (1 - sun.overcast * 0.7);
    }
    // sky fill: Rayleigh blue overhead by day, a deep blue night, a long warm horizon at sunrise and sunset;
    // the ground bounces back its own colour (cheap GI from the terrain's mean albedo)
    const sky = sun.hemi.color, low = clamp(1 - Math.abs(elev) * 3.2, 0, 1);
    sky.setRGB(0.36, 0.55, 0.95).multiplyScalar(0.25 + 0.75 * clamp(dayK * 1.3, 0, 1));
    sky.lerp(_c.copy(sc).multiplyScalar(0.9), low * 0.45 * (elev > -0.1 ? 1 : 0));
    if (night) sky.setRGB(0.1, 0.13, 0.24).lerp(_c.setRGB(0.3, 0.07, 0.06), this.bloodK * 0.6);
    sky.lerp(_c.setRGB(0.06, 0.08, 0.16), ecl * 0.8);
    sky.lerp(_c.setRGB(0.62, 0.62, 0.66), sun.overcast * 0.45);
    sky.lerp(_c.setRGB(0.75, 0.6, 0.4), this.dust * 0.5);
    sky.lerp(_c.setRGB(0.8, 0.25, 0.18), this.bloodK * 0.45);
    const av = (w.terrain as unknown as { avg?: number[] }).avg, gc = av?.[0] ?? 0x5a7a3a;
    sun.hemi.groundColor.setRGB(lin((gc >> 16) & 255), lin((gc >> 8) & 255), lin(gc & 255)).multiplyScalar(0.55 + 1.6 * dayK).lerp(sun.light.color, 0.15);
    sun.hemi.intensity = (0.5 + 1.15 * clamp(dayK * 1.2, 0.18, 1)) * (1 + sun.overcast * 0.25) + this.flash * 2.5;
    if (this.flash > 0) sun.hemi.color.lerp(_c.setRGB(0.85, 0.9, 1), this.flash * 0.6);
    // the grade: richer by day, cooler and vignetted by night, red in the bloodtide
    const gr = g.engine.post.grade, k = Math.max(0.16, dayK);
    gr.sat = 1.08 - (1 - k) * 0.22 + this.bloodK * 0.1; gr.vig = 0.36 + (1 - k) * 0.3; gr.bloom = 0.3 + (1 - k) * 0.25 + ecl * 0.3;
    w.terrain.U.uVeinGain.value = 1 + (1 - k) * 0.8 + ecl;
    this.light = k;
    import('../audio/audio').then((m) => m.setNight(1 - k)).catch(() => { /* no audio */ });
    return true;
  }

  /** push the climate into the atmosphere, the weather layer, the flora, the ecology and the creatures */
  private drive(dt: number) {
    const g = this.g, w = g.world, env = w.sun.env as unknown as Record<string, unknown> & { wind: THREE.Vector2 };
    env.wind.copy(this.wind);
    const E = env as unknown as { snow: number; frost: number; dry: number; autumn: number; dust: number; ash: number; red: number; eclipse: number; flash: number; cloudK: number; ice: number; moons: number; aurora: number; t: number };
    const S = SEASON[this.season];
    E.snow = this.snowCover; E.frost = this.frost; E.ice = this.ice;
    E.dry = clamp(1 - S.green, 0, 1) * (1 - this.rain * 0.3); E.autumn = S.autumn;
    E.dust = this.dust; E.ash = this.ash; E.red = this.bloodK; E.eclipse = this.eclipseK; E.flash = this.flash;
    E.cloudK = this.cloud; E.aurora = Math.max(this.eclipseK, this.season === 'frost' ? 0.35 : 0);
    // the falling weather (details.ts): what falls and how hard
    const det = (g as unknown as { details?: { setPrecip(kind: string, amt: number): void } }).details;
    const kind = this.snow > 0.3 ? 'snow' : this.dust > 0.3 ? 'dust' : this.ash > 0.3 ? 'ash' : this.red > 0.5 && this.rain > 0.2 ? 'redrain' : 'rain';
    const amt = kind === 'snow' ? this.snow : kind === 'dust' ? this.dust : kind === 'ash' ? this.ash : this.rain;
    det?.setPrecip(kind, amt);
    // fog banks thicken the mist
    w.sun.env.mist = Math.max(w.sun.env.mist, this.fog * 0.16);
    w.sun.env.haze = Math.max(w.sun.env.haze, 0.003 + this.fog * 0.012 + this.dust * 0.02 + this.ash * 0.01);
    // flora sways with the wind
    const fU = (w.flora as unknown as { U?: Record<string, THREE.IUniform> }).U;
    if (fU?.uWind && fU.uWindDir) {
      const s = this.wind.length();
      if (!(fU as unknown as { _w0?: number })._w0) (fU as unknown as { _w0: number })._w0 = fU.uWind.value as number;
      fU.uWind.value = (fU as unknown as { _w0: number })._w0 * clamp(0.4 + s * 0.9, 0.2, 3);
      (fU.uWindDir.value as THREE.Vector2).set(this.wind.x, this.wind.y).normalize();
    }
    // the ecology: rain feeds it; the season sets the water stage (monsoon high, high sun low)
    const eco = (w as unknown as { eco?: { rain: number; t: number; year: number; phase0: number } }).eco;
    if (eco) {
      eco.rain = Math.max(eco.rain, this.rain * (this.snow > 0.3 ? 0.3 : 1));
      const stage = this.stage();
      const ph = Math.asin(clamp(stage, -1, 1)) / (Math.PI * 2);
      if (eco.year > 0) eco.phase0 = ((ph - eco.t / eco.year) % 1 + 1) % 1;
    }
    // creatures glow brighter in the dark (bioluminescence wakes in the eclipse)
    const glow = 1 + this.eclipseK * 2.2 + (1 - this.light) * 0.6;
    for (const c of w.creatures) { const fx = c.fx as unknown as { glow?: { value: number } }; if (fx.glow) fx.glow.value = glow; }
    void dt;
  }
  /** the season's water stage for the ecology (-1 low .. 1 high), eased across season boundaries */
  private stage() {
    const i = SEASONS.indexOf(this.season), a = SEASON[this.season].stage, b = SEASON[SEASONS[(i + 1) % 8]].stage;
    return a + (b - a) * clamp((this.seasonT - 0.75) / 0.25, 0, 1);
  }
}

/** the palette's sky ramp, for anything that wants a sky colour by light */
export const skyStep = (k: number) => RAMPS.sky[Math.max(0, Math.min(RAMPS.sky.length - 1, Math.round(k * (RAMPS.sky.length - 1))))];

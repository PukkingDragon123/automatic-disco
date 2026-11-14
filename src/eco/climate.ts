// The climate as the ecosystem sees it. The real thing is `game.climate` (CONTRACT.md, the climate agent); until it
// exists (or outside a Game) a stand-in holds the season and weather (`?season=` and `?weather=` force them, default
// bloom and clear). SEASON says what each season does to life: plant growth, water, thirst, breeding, activity,
// and the violent ones (eclipse, bloodtide).
import { daylight } from '../game/daylight';

export type Season = 'thaw' | 'bloom' | 'highsun' | 'monsoon' | 'eclipse' | 'ember' | 'bloodtide' | 'frost';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'dust' | 'ash' | 'redrain';
export interface ClimateLike {
  season: Season; seasonT: number; weather: Weather; temp: number; rain: number; light: number;
  event: 'eclipse' | 'bloodtide' | null;
}
export const SEASONS: Season[] = ['thaw', 'bloom', 'highsun', 'monsoon', 'eclipse', 'ember', 'bloodtide', 'frost'];

export interface SeasonFx {
  /** plant growth and regrowth multiplier (0 dormant) */
  grow: number;
  /** soil moisture shift, water stage shift (m) */
  moist: number; level: number;
  /** thirst rate, urge to breed (added to its utility), carrying capacity multiplier */
  thirst: number; mate: number; cap: number;
  /** how much of the day the wild keeps (frost sends the cold-blooded to sleep) */
  active: number;
  /** predators' blood: hunger threshold drop, speed and aggression */
  frenzy: number;
  /** fruit set */
  fruit: number;
}
const S = (o: Partial<SeasonFx>): SeasonFx => ({ grow: 1, moist: 0, level: 0, thirst: 1, mate: 0, cap: 1, active: 1, frenzy: 0, fruit: 1, ...o });
export const SEASON: Record<Season, SeasonFx> = {
  thaw: S({ grow: 0.8, moist: 0.08, level: 0.25, mate: 0.05, active: 0.9, fruit: 0.4 }),
  bloom: S({ grow: 1.6, moist: 0.04, level: 0.08, mate: 0.4, cap: 1.25, fruit: 1.8 }),
  highsun: S({ grow: 0.6, moist: -0.2, level: -0.32, thirst: 1.6, mate: -0.1, cap: 0.9, fruit: 0.8 }),
  monsoon: S({ grow: 1.25, moist: 0.22, level: 0.45, thirst: 0.7, fruit: 1.1 }),
  eclipse: S({ grow: 0.3, moist: 0, level: 0, thirst: 0.9, mate: -0.2, fruit: 0.3 }),
  ember: S({ grow: 0.5, moist: -0.15, level: -0.15, thirst: 1.3, cap: 0.9, fruit: 0.6 }),
  bloodtide: S({ grow: 1.3, moist: 0.06, level: 0.1, mate: 0.1, frenzy: 1, fruit: 1 }),
  frost: S({ grow: 0, moist: -0.04, level: -0.1, thirst: 0.6, mate: -0.4, cap: 0.8, active: 0.45, fruit: 0 }),
};

/** a stand-in climate until game.climate exists: the season and weather can be forced from the URL */
export class StubClimate implements ClimateLike {
  season: Season = 'bloom'; seasonT = 0.5; weather: Weather = 'clear'; temp = 18; rain = 0; light = 1;
  event: 'eclipse' | 'bloodtide' | null = null;
  constructor(biomeTemp: number) {
    const P = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
    const s = P.get('season') as Season | null, wx = P.get('weather') as Weather | null;
    if (s && SEASONS.includes(s)) this.season = s;
    if (wx) this.weather = wx;
    this.temp = -10 + biomeTemp * 45 + (this.season === 'frost' ? -18 : this.season === 'highsun' ? 10 : this.season === 'eclipse' ? -8 : 0);
    if (this.season === 'eclipse' || this.season === 'bloodtide') this.event = this.season;
    if (this.season === 'bloodtide' && !wx) this.weather = 'redrain';
    if (this.season === 'frost' && !wx && biomeTemp < 0.7) this.weather = 'snow';
  }
  update() {
    // the sun swallowed: false night all day
    this.light = this.season === 'eclipse' ? Math.min(daylight.k, 0.12) : daylight.k;
    this.rain = this.weather === 'rain' || this.weather === 'redrain' ? 0.6 : this.weather === 'storm' ? 1 : this.weather === 'snow' ? 0.3 : 0;
  }
}

/** read a live climate (any object shaped like the contract's game.climate) safely */
export function readClimate(src: unknown, into: ClimateLike) {
  const c = src as Partial<ClimateLike> | null;
  if (!c || typeof c !== 'object') return;
  if (c.season && SEASONS.includes(c.season)) into.season = c.season;
  if (typeof c.seasonT === 'number') into.seasonT = c.seasonT;
  if (c.weather) into.weather = c.weather;
  if (typeof c.temp === 'number') into.temp = c.temp;
  if (typeof c.rain === 'number') into.rain = c.rain;
  if (typeof c.light === 'number') into.light = c.light;
  into.event = c.event ?? (into.season === 'eclipse' || into.season === 'bloodtide' ? into.season : null);
}

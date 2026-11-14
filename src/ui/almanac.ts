// The almanac: a small gauge hung under the console's chronometer plate. An eight-faceted dial (one facet per season,
// painted in that season's ramp) with a hand on the year, the day and season, the weather and temperature, and a lamp
// and a warning line when the eclipse or the bloodtide is near.
import type { Game } from '../game/game';
import type { Climate, Season } from '../game/climate';
import { SEASONS, SEASON } from '../game/climate';
import { RAMPS } from '../art/palette';
import { PixText, Lamp, place, tip } from './gadgets';
import { el } from './kit';
import { PH, AM, RD, CR } from './machine';

const W = 104, H = 30;
const RAMP_OF: Record<Season, readonly number[]> = { thaw: RAMPS.teal, bloom: RAMPS.moss, highsun: RAMPS.ochre, monsoon: RAMPS.water, eclipse: RAMPS.violet, ember: RAMPS.rust, bloodtide: RAMPS.stampRed, frost: RAMPS.snow };
const WNAME: Record<string, string> = { clear: 'CLEAR', cloudy: 'OVERCAST', rain: 'RAIN', storm: 'STORM', fog: 'FOG', snow: 'SNOW', dust: 'DUST STORM', ash: 'ASH FALL', redrain: 'RED RAIN' };

export class Almanac {
  private cv: HTMLCanvasElement; private g2: CanvasRenderingContext2D; private img: ImageData;
  private l1: PixText; private l2: PixText; private l3: PixText; private lamp: Lamp;
  private t = 0; private drawn = '';
  constructor(readonly g: Game, readonly c: Climate) {
    const root = (g.hud as unknown as { root: HTMLElement }).root;
    const plate = root.querySelector('.hud-plate') as HTMLElement | null;
    const host = el('div', 'mod almanac', plate ?? root);
    place(host, 0, 36, W, H);
    host.style.position = 'absolute';
    host.style.background = '#1f232b';
    host.style.boxShadow = 'inset 0 0 0 calc(1px * var(--s)) #2c323c';
    this.cv = place(el('canvas', '', host), 1, 1, 28, 28);
    this.cv.width = 28; this.cv.height = 28;
    this.g2 = this.cv.getContext('2d')!; this.img = this.g2.createImageData(28, 28);
    this.l1 = new PixText(host, 32, 3, 70, 'left');
    this.l2 = new PixText(host, 32, 12, 70, 'left');
    this.l3 = new PixText(host, 32, 21, 62, 'left');
    this.lamp = new Lamp(host, 95, 20, 'r', 'off');
    tip(place(el('div', 'hit', host), 0, 0, W, H), () => this.tipText());
  }
  private tipText() {
    const c = this.c, S = SEASON[c.season];
    const next = (s: Season) => Math.ceil(c.until(s) / c.dayLength);
    return `<h4>Almanac</h4>Year ${c.year}, day ${c.day}: <b>${S.name}</b> (${Math.round(c.seasonT * 100)}% through). ${WNAME[c.weather]}, ${Math.round(c.temp)}°C, wind ${c.wind.length().toFixed(1)} m/s.` +
      `<div class="sub">Eclipse in ${next('eclipse')} days · Bloodtide in ${next('bloodtide')} days</div>`;
  }
  update(dt: number) {
    this.t += dt;
    const c = this.c, S = SEASON[c.season];
    // the dial: redrawn when the hand moves a step
    const ph = c.yearPhase, key = Math.round(ph * 64) + c.season;
    if (key !== this.drawn) { this.drawn = key; this.dial(ph); }
    const days = (s: Season) => c.until(s) / c.dayLength;
    const near = c.event ? null : days('eclipse') < 1.2 ? 'ECLIPSE' : days('bloodtide') < 1.2 ? 'BLOODTIDE' : null;
    this.l1.set(`DAY ${c.day} ${S.name.toUpperCase()}`, c.event === 'bloodtide' ? RD[6] : c.event === 'eclipse' ? CR[4] : PH[8], true);
    this.l2.set(`${WNAME[c.weather]} ${Math.round(c.temp)}C`, c.weather === 'storm' || c.weather === 'redrain' ? AM[6] : PH[7], true);
    if (c.event) this.l3.set(c.event === 'eclipse' ? 'THE SUN IS GONE' : 'THE RED MOON', RD[6], true);
    else if (near) this.l3.set(`${near} SOON`, Math.floor(this.t * 2) % 2 ? RD[6] : AM[6], true);
    else this.l3.set(`YEAR ${c.year}`, CR[3], true);
    this.lamp.set(c.event ? 'on' : near ? 'blink' : 'off', c.event === 'eclipse' ? 'a' : 'r');
  }
  /** an octagon of eight facets, each a season in its own ramp (lit facet upper left), and the year's hand */
  private dial(ph: number) {
    const d = this.img.data, N = 28, c = 13.5;
    d.fill(0);
    const put = (x: number, y: number, col: number) => { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= N || y >= N) return; const o = (y * N + x) * 4; d[o] = (col >> 16) & 255; d[o + 1] = (col >> 8) & 255; d[o + 2] = col & 255; d[o + 3] = 255; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c, ax = Math.abs(dx), ay = Math.abs(dy);
      const oct = Math.max(Math.max(ax, ay), (ax + ay) * 0.7071);
      if (oct > 12.5) continue;
      if (oct > 11.5) { put(x, y, 0x14161b); continue; }
      // which season's facet: the year starts at the top and runs clockwise
      const a = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;
      let acc = 0, s: Season = 'thaw';
      const tot = SEASONS.reduce((q, k) => q + SEASON[k].days, 0);
      for (const k of SEASONS) { const f = SEASON[k].days / tot; if (a < acc + f) { s = k; break; } acc += f; }
      const r = RAMP_OF[s], L = r.length;
      const lit = (dx * -0.62 + dy * -0.78) / Math.max(1, oct);
      const step = oct < 4.5 ? 0 : oct > 10.5 ? (lit > 0.2 ? L - 1 : 1) : lit > 0.3 ? L - 2 : lit < -0.3 ? 2 : L - 3;
      put(x, y, oct < 4.5 ? 0x1f232b : r[Math.max(0, Math.min(L - 1, step))]);
    }
    // the hand
    const ang = ph * Math.PI * 2;
    for (let i = 0; i <= 10; i++) put(c + Math.sin(ang) * i - 0.5, c - Math.cos(ang) * i - 0.5, i < 9 ? 0xe2dbc6 : 0xb13c2b);
    put(c - 0.5, c - 0.5, 0xb13c2b); put(c + 0.5, c - 0.5, 0x8c2920);
    this.g2.putImageData(this.img, 0, 0);
  }
}

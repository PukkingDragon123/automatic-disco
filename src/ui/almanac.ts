// The almanac is the orrery on the cockpit desk (SURVEY mode) and the calendar beside it: a little brass planet with
// the sun and the two moons wheeling round it. The sun's arm follows the hour; the pale moon closes on the sun as the
// eclipse comes (it covers it during the eclipse and the globe goes dark); the small moon swings in as the bloodtide
// nears and burns red while it lasts. The calendar turns a page each day and shows the season's picture.
import type { Game } from '../game/game';
import type { Climate, Season } from '../game/climate';
import { SEASON } from '../game/climate';
import type { Hud } from './hud';

export class Almanac {
  constructor(readonly g: Game, readonly c: Climate) {
    (g.hud as unknown as Hud).setClimate?.(c);
  }
  update(_dt: number) {
    const hud = this.g.hud as unknown as Hud | undefined, d = hud?.desk;
    if (!d) return;
    const c = this.c, days = (s: Season) => c.until(s) / c.dayLength;
    const o = d.orrery, sun = (this.g.world.day - 0.25) * Math.PI * 2;
    o.sun = sun;
    // the moons sit off the sun by how far away their event is (a quarter turn per day, at most half a turn)
    const ec = c.event === 'eclipse' ? 0 : Math.min(Math.PI, days('eclipse') * 0.5);
    const bt = c.event === 'bloodtide' ? 0 : Math.min(Math.PI, days('bloodtide') * 0.5);
    o.m1 = sun + ec; o.m2 = sun - bt;
    o.dark = c.event === 'eclipse' ? 1 : Math.max(0, 1 - ec / 0.6) * 0.5;
    o.red = c.event === 'bloodtide' ? 1 : bt < 0.5 ? 0.6 : 0;
    d.props.cal.show(c.season, SEASON[c.season].name, c.day);
  }
}

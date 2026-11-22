// THE CREW (quarters and mess, ship:fn:morale): the eight aboard the MERIDIAN as laminated ID cards on a cork-free
// steel board, each with the person's portrait rendered from their own rig (never a drawn face), their department band,
// their job icon and a status lamp: aboard, on the surface with the pod, or lost (a black band, the card greys). The
// crew's morale rolls on a counter over a heart; MEAL (from the galley's rations) and MOVIE NIGHT lift it. Click a card:
// it flips up and the person says a line on the subtitle strip.
import type { PanelCtx, Panel } from './index';
import { div, place, artCanvas, S, keyCap, iconOf, clean } from '../ui';
import { plate } from '../../../ui/kit/mat';
import { Px, P, INK, hex, bevel, rivet, mixHex } from '../../../ui/kit/px';
import { bitText } from '../../../ui/kit/bitfont';
import { uiSfx } from '../../../ui/kit/sound';
import { Counter, pop, squash, shake, burst, floatUp } from '../../../ui/kit/juice';
import { crew, CREW_IDS, TEAMMATES, type CrewId } from '../../crew/index';
import { shipState, saveShip } from '../../hub/shipState';
import { portrait } from '../../../social/portrait';

const JOB_ICON: Record<CrewId, string> = { solano: 'brain', quintero: 'telescope', kowalczyk: 'wrench', castellanos: 'drone', baptiste: 'cross', mamani: 'sprout', araujo: 'wheat', kristiansen: 'shield' };
const rgb = (c: [number, number, number]) => ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);

export function crewPanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host, game } = ctx;
  const bg = artCanvas(W, H); host.append(bg);
  const p = plate(W, H, { mat: 'steel', seed: 31, chamfer: 3, wear: 0.8, screws: true, grime: 0.6 });
  // the morale plate across the top
  p.blit(plate(W - 20, 40, { mat: 'enamel', seed: 2, chamfer: 2, wear: 0.6, lip: 1 }), 10, 8);
  bg.getContext('2d')!.putImageData(p.image(), 0, 0);
  const heart = artCanvas(24, 24); place(heart, 16, 16); host.append(heart);
  heart.getContext('2d')!.drawImage(iconOf('heart', 'red'), 0, 0, 24, 24);
  const cnt = div('s7-abs k7-t32', host); place(cnt, 44, 14); cnt.style.color = '#3a2a14'; cnt.style.textShadow = 'none';
  const mood = new Counter(cnt, { size: 32, pad: 2 } as never);
  const moodPct = () => Math.round((crew.mood?.() ?? 0.7) * 100);
  mood.set(moodPct());
  const pc = div('s7-abs k7-t16', host); place(pc, 92, 24); pc.textContent = '%'; pc.style.color = '#3a2a14'; pc.style.textShadow = 'none';
  const st = shipState();
  let lastFilm = (() => { try { return Number(sessionStorage.getItem('s7.film') ?? 0); } catch { return 0; } })();
  const meal = keyCap(host, { label: 'MEAL', icon: iconOf('wheat', 'amber'), w: 84, h: 28, mat: 'orange', off: () => (st.supplies.rations < 6 ? 'NO RATIONS' : false), onClick: () => lift('meal') });
  place(meal.el, W - 186, 14).style.position = 'absolute';
  const movie = keyCap(host, { label: 'FILM', icon: iconOf('lens', 'amber'), w: 80, h: 28, mat: 'olive', off: () => (Date.now() - lastFilm < 45000 ? 'NOT YET' : false), onClick: () => lift('film') });
  place(movie.el, W - 98, 14).style.position = 'absolute';
  const lift = (k: 'meal' | 'film') => {
    if (k === 'meal') { st.supplies.rations -= 6; saveShip(); crew.moodShift?.(0.05); }
    else { lastFilm = Date.now(); try { sessionStorage.setItem('s7.film', String(lastFilm)); } catch { /* */ } crew.moodShift?.(0.04); }
    mood.set(moodPct()); pop(cnt, 1); pop(heart, 1.2);
    const r = heart.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, { n: 14, ramp: P.ruby, kind: 'spark', layer: 'ui', up: 1 });
    floatUp(r.left + r.width / 2, r.top, k === 'meal' ? '+5' : '+4', { color: '#ffb0a0', size: 16 });
    meal.refresh(); movie.refresh();
  };
  // ---- the cards: two rows of four
  const cw = Math.floor((W - 20 - 3 * 6) / 4), ch = 96, cy0 = 58;
  const cards: { id: CrewId; el: HTMLDivElement; cv: HTMLCanvasElement; paint(): void }[] = [];
  const away = new Set<string>((game?.colony?.teammates ?? []).filter((t: { alive: boolean }) => t.alive).map((t: { id: string }) => t.id));
  CREW_IDS.forEach((id, i) => {
    const x = 10 + (i % 4) * (cw + 6), y = cy0 + Math.floor(i / 4) * (ch + 10);
    const el = div('s7-abs s7-card', host); place(el, x, y, cw, ch);
    const cv = artCanvas(cw, ch, ''); el.append(cv);
    let face: HTMLCanvasElement | null = null;
    const paint = () => {
      const m = crew.member(id), dead = !m.alive, down = !dead && (away.has(id) || (game && TEAMMATES.includes(id) && !game.colony?.teammates));
      const q = new Px(cw, ch);
      // the laminated badge: an enamel card with the department band and a punched slot, on a steel clip
      bevel(q, 1, 6, cw - 2, ch - 7, P.bone, { chamfer: 3 });
      const band = rgb(m.dept_col);
      for (let yy = 9; yy < 19; yy++) for (let xx = 3; xx < cw - 3; xx++) q.set(xx, yy, mixHex(band, yy < 11 ? 0xffffff : 0x000000, yy < 11 ? 0.25 : (yy - 11) * 0.03));
      q.rect(Math.round(cw / 2) - 6, 12, 12, 3, INK);
      bevel(q, Math.round(cw / 2) - 5, 0, 10, 9, P.steel, { chamfer: 1 });
      rivet(q, Math.round(cw / 2) - 1, 3, 1, P.steel);
      // the photo well
      q.rect(Math.round(cw / 2) - 20, 21, 40, 40, INK);
      for (let yy = 22; yy < 60; yy++) for (let xx = Math.round(cw / 2) - 19; xx < Math.round(cw / 2) + 19; xx++) q.set(xx, yy, mixHex(0x40464c, 0x7a8288, (yy - 22) / 40));
      if (dead) { for (let k = -3; k < 4; k++) q.line(cw - 26 + k, 6, cw - 2, 30 - k, INK); }
      const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.putImageData(q.image(), 0, 0);
      if (face) c.drawImage(face, Math.round(cw / 2) - 18, 23, 36, 36);
      bitText(c, clean(m.short.toUpperCase()).slice(0, 9), Math.round(cw / 2), 62, { color: hex(P.ink[1]), outline: null, align: 'center' });
      c.drawImage(iconOf(JOB_ICON[id], dead ? 'dim' : 'steel'), 5, ch - 24, 18, 18);
      // the status lamp: aboard (green), on the surface (blue), lost (dark red)
      const lamp = dead ? 0x501818 : down ? 0x58a8e0 : 0x58d860;
      c.fillStyle = '#08090c'; c.fillRect(cw - 18, ch - 20, 12, 12); c.fillStyle = hex(lamp); c.fillRect(cw - 16, ch - 18, 8, 8); c.fillStyle = hex(mixHex(lamp, 0xffffff, 0.55)); c.fillRect(cw - 15, ch - 17, 3, 2);
      if (down) c.drawImage(iconOf('drone', 'steel'), cw - 36, ch - 24, 16, 16);
      el.classList.toggle('dead', dead);
    };
    paint();
    cards.push({ id, el, cv, paint });
    // the portrait comes in a beat later per card (each is a render of the person's rig)
    setTimeout(() => { try { face = portrait(id); } catch { face = null; } paint(); if (face) pop(el, 0.5); }, 60 + i * 90);
    el.addEventListener('pointerenter', () => uiSfx('hover', 0.4));
    el.addEventListener('click', () => {
      const m = crew.member(id);
      if (!m.alive) { uiSfx('error', 0.4); shake(el, 3); return; }
      uiSfx('pluck', 0.6); squash(el, 0.8);
      el.animate([{ transform: 'perspective(400px) rotateY(0deg)' }, { transform: 'perspective(400px) rotateY(180deg) translateY(-8px)' }, { transform: 'perspective(400px) rotateY(360deg)' }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      const lines = m.lines.click ?? m.lines.idle ?? [];
      const line = lines[Math.floor(Math.random() * lines.length)];
      if (line) { const subs = game?.subs; if (subs?.say) subs.say(id, line); else { const r = el.getBoundingClientRect(); floatUp(r.left + r.width / 2, r.top - 10, clean(m.short.toUpperCase()), { color: '#ffe7a8', size: 16 }); } }
    });
  });
  const off = crew.on?.('mood', () => { mood.set(moodPct()); }) as (() => void) | undefined;
  return {
    dispose() { off?.(); },
  };
}

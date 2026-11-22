// THE CREW (quarters and mess, ship:fn:morale): the eight aboard the MERIDIAN as laminated ID cards, each with the
// person's portrait rendered from their own rig, their name, their role, what they are doing right now (from their
// routine on the ship's clock, or their job on the surface), and a status lamp: aboard, on the surface, or lost. Over
// the cards, the crew's morale on a rolling counter with what it means, and the two things that lift it: a MEAL from
// the galley's rations and a FILM night. Click a card: it flips and the person says a line on the subtitle strip.
import type { PanelCtx, Panel } from './index';
import { div, place, artCanvas, S, keyCap, iconOf, clean, textEl } from '../ui';
import { plate } from '../../../ui/kit/mat';
import { Px, P, INK, hex, bevel, rivet, mixHex } from '../../../ui/kit/px';
import { uiSfx } from '../../../ui/kit/sound';
import { Counter, pop, squash, shake, burst, floatUp } from '../../../ui/kit/juice';
import { crew, CREW_IDS, TEAMMATES, type CrewId } from '../../crew/index';
import { shipState, saveShip } from '../../hub/shipState';
import { portrait } from '../../../social/portrait';

const rgb = (c: [number, number, number]) => ((c[0] & 255) << 16) | ((c[1] & 255) << 8) | (c[2] & 255);
const ACT: Record<string, string> = {
  work: 'At work', eat: 'Eating', sleep: 'Asleep', chat: 'Talking', repair: 'Repairing kit', exercise: 'Exercising', read: 'Reading',
  tend: 'Tending the plants', cook: 'Cooking', patrol: 'On patrol', treat: 'Treating a patient', pilot: 'At the helm', coffee: 'On a coffee break',
  inventory: 'Counting the stores', study: 'Studying samples',
};
const ROOM: Record<string, string> = { bridge: 'the bridge', lab: 'the lab', mess: 'the mess', quarters: 'quarters', medbay: 'the medbay', hydro: 'hydroponics', engineering: 'engineering', hangar: 'the hangar', cargo: 'the hold', gym: 'the gym' };
/** the ship's clock: one ship hour every 40 s (the hub's crew life runs on the same) */
const shipHour = () => (Date.now() / 40000) % 24;
const moodWord = (m: number) => (m > 0.8 ? 'High spirits' : m > 0.6 ? 'Steady' : m > 0.4 ? 'Strained' : m > 0.2 ? 'Low' : 'Broken');

export function crewPanel(ctx: PanelCtx): Panel {
  const { w: W, h: H, host, game } = ctx;
  const st = shipState();
  let lastFilm = (() => { try { return Number(sessionStorage.getItem('s7.film') ?? 0); } catch { return 0; } })();
  const bg = artCanvas(W, H); host.append(bg);
  const p = plate(W, H, { mat: 'steel', seed: 31, chamfer: 3, wear: 0.8, screws: true, grime: 0.6 });
  p.blit(plate(W - 16, 58, { mat: 'enamel', seed: 2, chamfer: 2, wear: 0.6, lip: 1 }), 8, 6);
  bg.getContext('2d')!.putImageData(p.image(), 0, 0);
  // ---- morale: a heart, the rolling number, its meaning, and what lifts it
  const heart = artCanvas(22, 22); place(heart, 14, 12); host.append(heart);
  heart.getContext('2d')!.drawImage(iconOf('heart', 'red'), 0, 0, 22, 22);
  const lbl = textEl('CREW MORALE', { dark: true, color: '#6a5a40', wrap: false }); lbl.className += ' s7-abs'; place(lbl, 40, 9); host.append(lbl);
  const cnt = div('s7-abs', host); place(cnt, 40, 16);
  const mood = new Counter(cnt, { size: 32, fmt: (n) => String(Math.round(n)) });
  const moodPct = () => Math.round((crew.mood?.() ?? 0.7) * 100);
  mood.set(moodPct(), true);
  const word = div('s7-abs', host); place(word, 82, 22);
  const paintWord = () => word.replaceChildren(textEl(`% ${moodWord(moodPct() / 100)}`, { dark: true, color: '#2a2014', wrap: false }));
  paintWord();
  const hint = div('s7-abs', host); place(hint, 14, 42, W - 32);
  hint.append(textEl(`Rations ${Math.round(st.supplies.rations)} days. A meal costs 6 (+5 morale); a film night is free, once every 45 s.`, { dark: true, color: '#5a4a30' }));
  const meal = keyCap(host, { label: 'MEAL', icon: iconOf('wheat', 'amber'), w: 74, h: 26, mat: 'orange', off: () => (st.supplies.rations < 6 ? 'NO RATIONS' : false), onClick: () => lift('meal') });
  place(meal.el, W - 164, 12).style.position = 'absolute';
  const movie = keyCap(host, { label: 'FILM', icon: iconOf('lens', 'amber'), w: 74, h: 26, mat: 'olive', off: () => (Date.now() - lastFilm < 45000 ? 'NOT YET' : false), onClick: () => lift('film') });
  place(movie.el, W - 86, 12).style.position = 'absolute';
  const lift = (k: 'meal' | 'film') => {
    if (k === 'meal') { st.supplies.rations -= 6; saveShip(); crew.moodShift?.(0.05); }
    else { lastFilm = Date.now(); try { sessionStorage.setItem('s7.film', String(lastFilm)); } catch { /* */ } crew.moodShift?.(0.04); }
    mood.set(moodPct()); paintWord(); pop(cnt, 1); pop(heart, 1.2);
    const r = heart.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, { n: 14, ramp: P.ruby, kind: 'spark', layer: 'ui', up: 1 });
    floatUp(r.left + r.width / 2, r.top, k === 'meal' ? '+5 MORALE' : '+4 MORALE', { color: '#ffb0a0', size: 16 });
    hint.replaceChildren(textEl(`Rations ${Math.round(st.supplies.rations)} days. A meal costs 6 (+5 morale); a film night is free, once every 45 s.`, { dark: true, color: '#5a4a30' }));
    meal.refresh(); movie.refresh();
  };
  // ---- the cards: two columns of four
  const cw = Math.floor((W - 16 - 6) / 2), y0 = 70, ch = Math.floor((H - y0 - 8 - 3 * 4) / 4);
  const surface = new Map<string, { job?: string; state?: string; alive: boolean }>((game?.colony?.teammates ?? []).map((t: { id: string; job?: string; state?: string; alive: boolean }) => [t.id, t]));
  const cards: { id: CrewId; paint(): void }[] = [];
  CREW_IDS.forEach((id, i) => {
    const x = 8 + (i % 2) * (cw + 6), y = y0 + Math.floor(i / 2) * (ch + 4);
    const el = div('s7-abs s7-card', host); place(el, x, y, cw, ch);
    const cv = artCanvas(cw, ch, ''); el.append(cv);
    const txt = div('s7-abs', el); place(txt, 46, 4, cw - 50); txt.style.display = 'flex'; txt.style.flexDirection = 'column'; txt.style.gap = '0';
    let face: HTMLCanvasElement | null = null;
    const paint = () => {
      const m = crew.member(id), dead = !m.alive, on = surface.get(id), down = !dead && (!!on?.alive || (!!game && TEAMMATES.includes(id) && !game.colony?.teammates));
      const q = new Px(cw, ch);
      bevel(q, 1, 1, cw - 2, ch - 2, P.bone, { chamfer: 3 });
      const band = rgb(m.dept_col);
      for (let yy = 3; yy < ch - 3; yy++) for (let xx = 3; xx < 7; xx++) q.set(xx, yy, mixHex(band, 0x000000, xx === 6 ? 0.3 : 0));
      q.rect(8, 4, 36, 36, INK);
      for (let yy = 5; yy < 39; yy++) for (let xx = 9; xx < 43; xx++) q.set(xx, yy, mixHex(0x40464c, 0x7a8288, (yy - 5) / 34));
      rivet(q, cw - 8, 5, 1, P.steel);
      const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.putImageData(q.image(), 0, 0);
      if (face) { c.filter = dead ? 'grayscale(1) brightness(.6)' : 'none'; c.drawImage(face, 9, 5, 34, 34); c.filter = 'none'; }
      // the status lamp under the photo
      const lamp = dead ? 0x501818 : down ? 0x58a8e0 : 0x58d860;
      c.fillStyle = '#08090c'; c.fillRect(9, ch - 14, 10, 10); c.fillStyle = hex(lamp); c.fillRect(10, ch - 13, 8, 8); c.fillStyle = hex(mixHex(lamp, 0xffffff, 0.55)); c.fillRect(11, ch - 12, 3, 2);
      // the words: name, role, what they are doing now
      let doing: string;
      if (dead) doing = `Lost on day ${m.death?.day ?? '?'}: ${clean(m.death?.how ?? 'unknown')}.`;
      else if (down) doing = `On the surface with the pod${on?.job ? `: ${on.job}` : on?.state ? `: ${on.state}` : ''}.`;
      else {
        const h = shipHour(), b = m.routine.find((r) => h >= r.from && h < r.to) ?? m.routine[0];
        doing = b ? `${ACT[b.act] ?? b.act} in ${ROOM[b.room] ?? b.room}${b.with ? ` with ${clean(crew.member(b.with).short)}` : ''}.` : 'Aboard.';
      }
      txt.replaceChildren(
        textEl(clean(m.name), { dark: true, color: dead ? '#6a6458' : '#2a2014', wrap: false }),
        textEl(`${clean(m.role)}, ${dead ? 'LOST' : down ? 'ON THE SURFACE' : 'ABOARD'}`, { dark: true, color: '#6a5a40', wrap: false }),
        textEl(doing, { dark: true, color: dead ? '#8a3a2a' : down ? '#1a5a7a' : '#2e5a2a' }),
      );
      el.classList.toggle('dead', dead);
    };
    paint();
    cards.push({ id, paint });
    setTimeout(() => { try { face = portrait(id); } catch { face = null; } paint(); if (face) pop(el, 0.4); }, 60 + i * 90);
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
  const off = crew.on?.('mood', () => { mood.set(moodPct()); paintWord(); }) as (() => void) | undefined;
  let acc = 0;
  return {
    update(dt) { acc += dt; if (acc > 5) { acc = 0; for (const c of cards) c.paint(); } },
    dispose() { off?.(); },
  };
}

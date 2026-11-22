// THE CREW (quarters and mess, ship:fn:morale), in the kit's machine panels: the crew's morale on an LED meter with
// what it means and the two keys that lift it (MEAL from the galley's rations, FILM night), each with an icon rendered
// from its model; then the eight aboard, each on a small housing: the portrait rendered from their own rig, their name,
// role, where they are (aboard, on the surface, lost) and what they are doing right now (their routine on the ship's
// clock, their job on the surface, or how they died). Click a card: it flips and the person says a line.
import type { PanelCtx, Panel } from './index';
import { div, clean } from '../ui';
import { icon3d } from '../icons3d';
import { panel, pkey, meter, section, para, kv, status, type Panel as KPanel } from '../../../ui/kit/panel';
import { P } from '../../../ui/kit/px';
import { uiSfx } from '../../../ui/kit/sound';
import { pop, squash, shake, burst, floatUp } from '../../../ui/kit/juice';
import { crew, CREW_IDS, TEAMMATES } from '../../crew/index';
import { shipState, saveShip } from '../../hub/shipState';
import { portrait } from '../../../social/portrait';

const ACT: Record<string, string> = {
  work: 'At work', eat: 'Eating', sleep: 'Asleep', chat: 'Talking', repair: 'Repairing kit', exercise: 'Exercising', read: 'Reading',
  tend: 'Tending the plants', cook: 'Cooking', patrol: 'On patrol', treat: 'Treating a patient', pilot: 'At the helm', coffee: 'On a coffee break',
  inventory: 'Counting the stores', study: 'Studying samples',
};
const ROOM: Record<string, string> = { bridge: 'the bridge', lab: 'the lab', mess: 'the mess', quarters: 'quarters', medbay: 'the medbay', hydro: 'hydroponics', engineering: 'engineering', hangar: 'the hangar', cargo: 'the hold', gym: 'the gym' };
const shipHour = () => (Date.now() / 40000) % 24;
const moodWord = (m: number) => (m > 0.8 ? 'High spirits' : m > 0.6 ? 'Steady' : m > 0.4 ? 'Strained' : m > 0.2 ? 'Low' : 'Broken');

export function crewPanel(ctx: PanelCtx): Panel {
  const { host, game } = ctx;
  const st = shipState();
  let lastFilm = (() => { try { return Number(sessionStorage.getItem('s7.film') ?? 0); } catch { return 0; } })();
  const moodPct = () => Math.round((crew.mood?.() ?? 0.7) * 100);
  // ---- morale and what lifts it
  const m = meter('MORALE', moodPct() / 100, { w: 200, segs: 14, col: 'green', value: moodPct(), unit: '%' });
  host.append(m.el);
  const ms = status('', 'info'); host.append(ms.el);
  const paintMood = () => { const v = moodPct(); m.set(v / 100, v); ms.set(`${moodWord(v / 100)}. Rations ${Math.round(st.supplies.rations)} days. A meal costs 6 rations (+5); a film night is free once every 45 s (+4).`, v < 40 ? 'warn' : 'info'); };
  paintMood();
  const keys = div('s7-keys', host);
  const meal = pkey('MEAL', () => lift('meal'), { tone: 'yellow', lamp: 'amber', icon: icon3d('meal', 22) });
  const film = pkey('FILM NIGHT', () => lift('film'), { tone: 'cream', lamp: 'green', icon: icon3d('film', 22) });
  keys.append(meal, film);
  const keyState = () => { meal.setDisabled(st.supplies.rations < 6); film.setDisabled(Date.now() - lastFilm < 45000); };
  keyState();
  const lift = (k: 'meal' | 'film') => {
    if (k === 'meal') { st.supplies.rations -= 6; saveShip(); crew.moodShift?.(0.05); }
    else { lastFilm = Date.now(); try { sessionStorage.setItem('s7.film', String(lastFilm)); } catch { /* */ } crew.moodShift?.(0.04); }
    paintMood(); keyState(); pop(m.el, 0.8);
    const r = m.el.getBoundingClientRect(); burst(r.left + r.width * 0.6, r.top + r.height / 2, { n: 16, ramp: P.malachite, kind: 'spark', layer: 'ui', up: 1 });
    floatUp(r.left + r.width * 0.6, r.top, k === 'meal' ? '+5 MORALE' : '+4 MORALE', { color: '#b8f0a0', size: 16 });
  };
  // ---- the eight
  host.append(section('THE CREW', `${crew.living().length} / 8 ALIVE`));
  const grid = div('s7-cards', host);
  const surface = new Map<string, { job?: string; state?: string; alive: boolean }>((game?.colony?.teammates ?? []).map((t: { id: string; job?: string; state?: string; alive: boolean }) => [t.id, t]));
  const cards: { p: KPanel; paint(): void }[] = [];
  CREW_IDS.forEach((id, i) => {
    const p = panel({ tone: 'steel', head: 8, foot: 8, side: 6, lamps: [], hazard: false, glands: 0, vents: false, guards: false, cls: 's7-card7' });
    p.el.style.cursor = 'pointer'; grid.append(p.el);
    const ph = document.createElement('canvas'); ph.width = ph.height = 36; ph.style.width = ph.style.height = '72px'; ph.style.imageRendering = 'pixelated'; ph.style.flex = 'none'; ph.style.background = '#2a3036'; ph.style.boxShadow = 'inset 0 0 0 2px #08090c';
    const txt = div('', p.body); txt.style.flex = '1'; txt.style.minWidth = '0';
    p.body.prepend(ph);
    let face: HTMLCanvasElement | null = null;
    const paint = () => {
      const mm = crew.member(id), dead = !mm.alive, on = surface.get(id), down = !dead && (!!on?.alive || (!!game && TEAMMATES.includes(id) && !game.colony?.teammates));
      const c = ph.getContext('2d')!; c.imageSmoothingEnabled = false; c.clearRect(0, 0, 36, 36);
      if (face) { c.filter = dead ? 'grayscale(1) brightness(.6)' : 'none'; c.drawImage(face, 0, 0, 36, 36); c.filter = 'none'; }
      let doing: string;
      if (dead) doing = `Lost on day ${mm.death?.day ?? '?'}: ${clean(mm.death?.how ?? 'unknown')}.`;
      else if (down) doing = `On the surface with the pod${on?.job ? `: ${on.job}` : on?.state ? `: ${on.state}` : ''}.`;
      else { const h = shipHour(), b = mm.routine.find((r) => h >= r.from && h < r.to) ?? mm.routine[0]; doing = b ? `${ACT[b.act] ?? b.act} in ${ROOM[b.room] ?? b.room}${b.with ? ` with ${clean(crew.member(b.with).short)}` : ''}.` : 'Aboard.'; }
      const name = para(clean(mm.name)); name.style.color = dead ? '#9a9488' : '#ffe39a'; name.style.margin = '0';
      txt.replaceChildren(name, kv(clean(mm.job), dead ? 'LOST' : down ? 'SURFACE' : 'ABOARD', { color: dead ? '#ff9a80' : down ? '#8fd8e8' : '#b8e0a0' }).el, para(doing, { dim: true }));
      p.lamp(0, !dead);
    };
    paint();
    cards.push({ p, paint });
    setTimeout(() => { try { face = portrait(id); } catch { face = null; } paint(); }, 60 + i * 90);
    p.el.addEventListener('pointerenter', () => uiSfx('hover', 0.35));
    p.el.addEventListener('click', () => {
      const mm = crew.member(id);
      if (!mm.alive) { uiSfx('error', 0.4); shake(p.el, 3); return; }
      uiSfx('pluck', 0.6); squash(p.el, 0.6);
      p.el.animate([{ transform: 'perspective(500px) rotateY(0deg)' }, { transform: 'perspective(500px) rotateY(180deg) translateY(-6px)' }, { transform: 'perspective(500px) rotateY(360deg)' }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      const lines = mm.lines.click ?? mm.lines.idle ?? [], line = lines[Math.floor(Math.random() * lines.length)];
      if (line) { const subs = game?.subs; if (subs?.say) subs.say(id, line); else { const r = p.el.getBoundingClientRect(); floatUp(r.left + r.width / 2, r.top - 6, clean(line).slice(0, 40), { color: '#ffe7a8', size: 16 }); } }
    });
  });
  const off = crew.on?.('mood', () => paintMood()) as (() => void) | undefined;
  let acc = 0;
  return {
    update(dt) { acc += dt; if (acc > 5) { acc = 0; for (const c of cards) c.paint(); keyState(); } },
    dispose() { off?.(); for (const c of cards) c.p.dispose(); },
  };
}

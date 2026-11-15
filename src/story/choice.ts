// The decision console: shown after an event's cinematic while the simulation is paused. Two or three options, each
// with its gains (+) and costs (-) written plainly, a lock line when an option is out of reach, keys 1-3. After the
// pick the chosen key is stamped EXECUTED and the true outcome is typed out under it.
import { el, ui } from '../ui/kit';
import { installHardware } from '../research/ui/hardware';
import { sfx } from '../audio/audio';
import { csfx } from '../ui/cineAudio';
import type { Opt } from './events';
import './choice.css';

export interface ChoiceSpec { kicker: string; title: string; brief: string; options: Opt[]; stamp?: string }
export interface ChoiceResult { key: string; text: string; lines: string[] }

/** open the console; resolves once an option ran and the player continued */
export function choose(spec: ChoiceSpec, run: (o: Opt) => { text: string; lines: string[] }): Promise<ChoiceResult> {
  installHardware();
  return new Promise((resolve) => {
    const root = el('div', 'evc', ui());
    const box = el('div', 'evc-box', root);
    const head = el('div', 'evc-head', box);
    el('div', 'evc-lamp', head);
    const tt = el('div', '', head);
    el('div', 'evc-kick', tt, spec.kicker);
    el('div', 'evc-title', tt, spec.title);
    el('div', 'evc-req', head, spec.stamp ?? 'DECISION REQUIRED');
    const crt = el('div', 'evc-crt', box);
    const brief = el('div', 'evc-brief', crt);
    const opts = el('div', 'evc-opts', crt); opts.style.setProperty('--n', String(spec.options.length));
    const out = el('div', 'evc-out', crt);
    const foot = el('div', 'evc-foot', box);
    foot.innerHTML = `<span><b>1-${spec.options.length}</b> CHOOSE &nbsp;·&nbsp; THE COLONY IS PAUSED</span><span>UNIT 07 · COLONY DECISION LOG</span>`;
    // the brief types itself
    let k = 0; const txt = spec.brief;
    const type = setInterval(() => { k = Math.min(txt.length, k + 2); brief.innerHTML = txt.slice(0, k) + (k < txt.length ? '<span class="cur">_</span>' : ''); if (k % 6 === 0) csfx('type', 0.15, 1.4); if (k >= txt.length) clearInterval(type); }, 16);
    let done = false;
    const cards: HTMLElement[] = [];
    spec.options.forEach((o, i) => {
      const lock = o.need?.() ?? null;
      const c = el('div', 'evc-opt' + (lock ? ' off' : ''), opts);
      const kk = el('div', 'evc-key', c);
      el('div', 'evc-num', kk, String(i + 1));
      el('div', 'evc-label', kk, o.label);
      for (const p of o.plus) el('div', 'evc-line p', c, p);
      for (const m of o.minus) el('div', 'evc-line m', c, m);
      if (lock) el('div', 'evc-lock', c, lock.toUpperCase());
      c.addEventListener('pointerenter', () => { if (!done && !lock) sfx('click', 1.4, 0.15); });
      c.addEventListener('click', (e) => { e.stopPropagation(); pickIt(i); });
      cards.push(c);
    });
    const pickIt = (i: number) => {
      const o = spec.options[i]; if (done || !o || o.need?.()) { if (!done) sfx('deny'); return; }
      done = true; clearInterval(type); brief.textContent = txt;
      csfx('thud', 0.8, 0.9); sfx('click');
      cards.forEach((c, j) => c.classList.add(j === i ? 'done' : 'gone'));
      el('div', 'evc-stamp', cards[i], 'EXECUTED');
      let r: { text: string; lines: string[] } = { text: '', lines: [] };
      try { r = run(o); } catch (e) { console.error('choice', e); }
      out.classList.add('on');
      const t = el('div', 'evc-out-t', out);
      const tx = el('div', '', t), ls = el('div', 'evc-out-l', t);
      const go = el('div', 'evc-go', out, 'CONTINUE');
      let n = 0;
      const ty = setInterval(() => { n = Math.min(r.text.length, n + 2); tx.textContent = r.text.slice(0, n); if (n >= r.text.length) { clearInterval(ty); ls.innerHTML = r.lines.map((l) => '· ' + l).join('<br>'); } }, 18);
      const fin = () => { clearInterval(ty); off(); root.remove(); resolve({ key: o.key, text: r.text, lines: r.lines }); };
      go.addEventListener('click', (e) => { e.stopPropagation(); fin(); });
      cont = fin;
    };
    let cont: (() => void) | null = null;
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const n = Number(e.key);
      if (!done && n >= 1 && n <= spec.options.length) { e.preventDefault(); e.stopImmediatePropagation(); pickIt(n - 1); return; }
      if (done && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); e.stopImmediatePropagation(); cont?.(); return; }
      // the console owns the keyboard while it is up
      e.stopImmediatePropagation();
    };
    addEventListener('keydown', key, true);
    const off = () => removeEventListener('keydown', key, true);
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    csfx('stingDark', 0.5);
  });
}

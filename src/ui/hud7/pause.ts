// HUD v7 · THE PAUSE PANEL (Esc on the planet with nothing else open). A kit machine panel over a dimmed view: where
// you are, the settlement's state in numbers, and four keys: RESUME, SAVE, SHIP LINK (board the MERIDIAN; the
// settlement waits) and QUIT TO TITLE (saves first). Replaces the old void-era pause plate (ASSEMBLY / TO ORBIT).
import type { Game } from '../../game/game';
import { panel, pkey, keyHint, type Panel } from '../kit/panel';
import { uiSfx } from '../kit/sound';
import { tween, ease } from '../kit/juice';
import { installKitStyle } from '../kit/style';

type G = Game & Record<string, any>;
export interface PauseHooks { region: string; save(): void; quit(): void }

let open: { close(): void } | null = null;
let lastSave = 0;
const ago = (ms: number) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`; };

export function pauseOpen() { return !!open; }
export function openPause(game: Game, h: PauseHooks) {
  if (open) return;
  installKitStyle(); css();
  const g = game as G, was = g.paused; g.paused = true;
  const veil = document.createElement('div'); veil.className = 'p7-veil';
  const p: Panel = panel({ title: 'PAUSED', tone: 'gun', lamps: ['amber', 'green'], serial: 'UNIT 07', toggles: 2 });
  p.el.classList.add('p7-panel');
  const c = g.colony, v = c?.vitals;
  const day = g.world?.day ?? 0, hh = Math.floor(((day + 0.25) % 1) * 24), mm = Math.floor(((((day + 0.25) % 1) * 24) % 1) * 60);
  p.section(h.region.toUpperCase(), `SOL ${c?.sol ?? 1} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  p.text('The settlement waits while you are away from the controls. Orders still work while the game is paused (SPACE).', { dim: true });
  if (v) {
    p.kv('Battery', `${Math.round(v.battery)} / ${Math.round(v.batteryCap)}`, { unit: 'kWh', bar: v.battery / Math.max(1, v.batteryCap) });
    p.kv('Oxygen', Math.round(v.o2), { unit: '%', bar: v.o2 / 100 });
    p.kv('Food', Math.round(v.food ?? v.rations ?? 0), { unit: 'meals' });
    p.kv('Morale', Math.round(v.morale ?? 0), { unit: '%', bar: (v.morale ?? 0) / 100 });
  }
  const st = p.status(lastSave ? `Last saved ${ago(performance.now() - lastSave)}.` : 'Not saved in this session yet: SAVE keeps the run on this device.', lastSave ? 'ok' : 'info');
  const keys = document.createElement('div'); keys.className = 'p7-keys'; p.body.append(keys);
  const close = (after?: () => void) => {
    if (!open) return; open = null;
    removeEventListener('keydown', onKey, true);
    uiSfx('swishOut', 0.45);
    void tween(180, (k) => { p.el.style.transform = `translate(-50%, calc(-50% + ${Math.round(k * k * 40)}px))`; p.el.style.opacity = String(1 - k); veil.style.opacity = String(1 - k); }, ease.inCubic).then(() => { p.dispose(); veil.remove(); });
    g.paused = was; after?.();
  };
  const save = () => { try { h.save(); lastSave = performance.now(); st.set('Saved just now: CONTINUE on the title picks the run up from here.', 'ok'); uiSfx('confirm', 0.6); } catch (e) { console.error('save', e); st.set('Could not save (browser storage is off).', 'bad'); uiSfx('error', 0.6); } };
  const add = (label: string, key: string, fn: () => void, tone: 'yellow' | 'cream' | 'red' | 'blue', tip: string) => {
    const k = pkey(`${label}  [${key}]`, fn, { tone, lamp: false, sound: 'click', w: 300, h: 34 }); k.title = tip; keys.append(k); return k;
  };
  add('RESUME', 'ESC', () => close(), 'yellow', 'Back to the settlement.');
  add('SAVE', 'S', save, 'cream', 'Write the run to this browser (the settlement also saves itself every minute).');
  if (c?.shipLink) add('SHIP LINK', 'L', () => close(() => c.shipLink()), 'blue', 'Board the MERIDIAN in orbit: its rooms, crew and the main monitor. The settlement waits, paused.');
  add('QUIT TO TITLE', 'Q', () => { save(); close(() => h.quit()); }, 'red', 'Save, then go back to the title (CONTINUE resumes).');
  const hints = document.createElement('div'); hints.className = 'p7-hints'; hints.append(keyHint('SPACE', 'pause in play'), keyHint('1 2 3', 'speed')); p.body.append(hints);
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (k === 's') { e.preventDefault(); e.stopImmediatePropagation(); save(); return; }
    if (k === 'l' && c?.shipLink) { e.preventDefault(); e.stopImmediatePropagation(); close(() => c.shipLink()); return; }
    if (k === 'q') { e.preventDefault(); e.stopImmediatePropagation(); save(); close(() => h.quit()); return; }
    // nothing else reaches the game under the panel
    e.stopImmediatePropagation();
  };
  addEventListener('keydown', onKey, true);
  veil.addEventListener('pointerdown', (e) => { if (e.target === veil) close(); });
  document.body.append(veil, p.el);
  uiSfx('swishIn', 0.5); uiSfx('metalClose', 0.3);
  p.el.style.opacity = '0';
  void tween(260, (k) => { p.el.style.transform = `translate(-50%, calc(-50% + ${Math.round((1 - k) * 50)}px))`; p.el.style.opacity = String(k); veil.style.opacity = String(k); }, ease.outBack);
  open = { close: () => close() };
}
export function closePause() { open?.close(); }

let done = false;
function css() {
  if (done) return; done = true;
  const s = document.createElement('style');
  s.textContent = `
.p7-veil { position: fixed; inset: 0; z-index: 9300; background: radial-gradient(ellipse at 50% 50%, rgba(8,9,12,.45), rgba(8,9,12,.82)); }
.p7-panel { position: fixed !important; left: 50%; top: 50%; width: 460px; z-index: 9301; transform: translate(-50%, -50%); }
.p7-keys { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 12px 0 6px; }
.p7-hints { display: flex; gap: 16px; justify-content: center; margin-top: 6px; }
`;
  document.head.append(s);
}

/** a region's outcome (the settlement lost, a region secured): a kit panel with what happened and one key onward */
export function openResult(o: { title: string; sub: string; lines: string[]; key: string; tone?: 'yellow' | 'red'; then(): void }) {
  installKitStyle(); css();
  const veil = document.createElement('div'); veil.className = 'p7-veil';
  const p: Panel = panel({ title: o.title, tone: o.tone === 'red' ? 'red' : 'gun', lamps: [o.tone === 'red' ? 'red' : 'green'], toggles: 2 });
  p.el.classList.add('p7-panel');
  p.section(o.sub);
  for (const l of o.lines) p.text(l);
  const keys = document.createElement('div'); keys.className = 'p7-keys'; p.body.append(keys);
  const k = pkey(o.key, () => { p.dispose(); veil.remove(); o.then(); }, { tone: o.tone ?? 'yellow', lamp: false, sound: 'confirm', w: 300, h: 34 });
  keys.append(k);
  document.body.append(veil, p.el);
  uiSfx('bong', 0.5);
}

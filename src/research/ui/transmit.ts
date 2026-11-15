// INCOMING TRANSMISSION: the ship's voice over the colony. A small housing slides in at the top right when the
// Meridian issues a directive, when one is about to lapse, and when one is met or missed; click it to open the
// MISSION tab. It types itself, with a live carrier trace under the text.
import { el, ui } from '../../ui/kit';
import { installFrames } from './frames';
import { csfx } from '../../ui/cineAudio';
import { SHIP, type Quota } from '../mission';
import { fmtTime } from '../util';
import { waveDraw } from './missionTab';
import { australPhoto } from './vignettes';
import './paper.css';

let cur: HTMLElement | null = null;
export function transmission(o: { kind: 'new' | 'warn' | 'met' | 'missed' | 'drop' | 'recall'; q?: Quota; left?: number; text?: string; open?: () => void; engine?: Parameters<typeof australPhoto>[0] }) {
  installFrames();
  cur?.remove();
  const bad = o.kind === 'warn' || o.kind === 'missed' || o.kind === 'recall';
  const box = el('div', 'tx enamel', ui()); cur = box;
  const inn = el('div', 'tx-in', box);
  el('div', 'tx-k' + (bad ? ' bad' : ''), inn, `<i></i>${o.kind === 'new' ? 'INCOMING DIRECTIVE' : o.kind === 'warn' ? 'DIRECTIVE LAPSING' : o.kind === 'met' ? 'DIRECTIVE RECEIVED' : o.kind === 'missed' ? 'DIRECTIVE MISSED · STRIKE' : o.kind === 'drop' ? 'SUPPLY DROP' : 'MISSION RECALLED'} · ${SHIP}`);
  const title = o.q ? o.q.title : o.kind === 'drop' ? 'CAPSULE INBOUND' : 'RETURN ORDER';
  const row = el('div', '', inn); row.style.cssText = 'display:flex;gap:14px;align-items:center';
  const pic = el('img', '', row); pic.style.cssText = 'width:160px;height:90px;image-rendering:pixelated;box-shadow:0 0 0 3px #1c2c48;display:none';
  if (o.engine) void australPhoto(o.engine).then((u) => { if (u) { pic.src = u; pic.style.display = ''; } });
  el('div', 'tx-t', row, title);
  const body = el('div', 'tx-b', inn);
  const cv = el('canvas', '', inn);
  el('div', 'tx-f', inn, `<span>${o.q && o.q.state === 'open' ? `DUE IN <b>${fmtTime(o.left ?? 0)}</b>` : ''}</span><span>CLICK OR <b>K</b> · MISSION</span>`);
  const text = o.text ?? o.q?.brief ?? '';
  let k = 0, t = 0, alive = true;
  csfx('squelch', 0.6); csfx(bad ? 'deny' : 'beepHi', 0.5);
  const step = () => {
    if (!alive) return;
    t += 1 / 60; k = Math.min(text.length, k + 1.4);
    body.textContent = text.slice(0, Math.floor(k));
    try { waveDraw(cv, t, k < text.length ? 1 : 0.35, bad ? '#a8332a' : '#2a4a78'); } catch { /* layout */ }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  const close = () => { if (!alive) return; alive = false; box.classList.add('out'); setTimeout(() => box.remove(), 420); if (cur === box) cur = null; };
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  box.addEventListener('click', () => { close(); o.open?.(); });
  setTimeout(close, o.kind === 'recall' ? 30000 : 11000);
}

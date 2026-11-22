// THE QUEST TRACKER (v7; Limbophobia's questTracker, ported): floating type in the game's ink outline, nothing
// behind it. Up to three running quests, newest on top: a lamp, the quest's icon, its name in amber, then each step
// as an icon with its count (a lit tick when done), and the reward as icons (knowledge, items, a heart for a bond).
// A new quest slides in with a swish; a step counts with a pop; a finished quest turns green and slides away.
// It hides while a menu, a cinematic or a conversation has the screen.
import type { Quests } from './quests';
import type { QuestDef } from './questData';
import { QUEST } from './questData';
import { bitText, bitMeasure } from '../ui/kit/bitfont';
import { uiSfx } from '../ui/kit/sound';
import { stepIcon, DATA_ICON } from './icons';
import { itemIcon, ITEMS } from '../factory/items';
import { PEOPLE } from '../social/social';

const CSS = `.qt7 { position: fixed; left: var(--qt7-x, 22px); top: var(--qt7-y, 120px); z-index: 600; pointer-events: none; display: flex; flex-direction: column; gap: 10px; }
.qt7 .qr { position: relative; transition: transform .35s cubic-bezier(.25,1.4,.5,1), opacity .35s; }
.qt7 .qr.in { transform: translateX(-60px); opacity: 0; }
.qt7 .qr.out { transform: translateX(-80px); opacity: 0; }
.qt7 .qr.pop { animation: qt7pop .4s steps(6); }
@keyframes qt7pop { 0% { transform: scale(1.06) translateY(-2px); } 100% { transform: none; } }
.qt7 canvas { display: block; image-rendering: pixelated; }
body.cine-on .qt7, body.talk7 .qt7, body.menu7 .qt7, body.ev-on .qt7 { opacity: 0; transition: opacity .3s; }`;
const LAMP = ['..kkk..', '.kyyyk.', 'kyYWyyk', 'kyYyyyk', 'kyyyyok', '.koook.', '..kkk..'];
const PAL_Y: Record<string, string> = { k: '#1a1206', y: '#ffb030', Y: '#ffe090', W: '#ffffff', o: '#c86a10' };
const PAL_G: Record<string, string> = { k: '#06140a', y: '#50d860', Y: '#c0ffb0', W: '#ffffff', o: '#1a8a30' };
const imgs = new Map<string, HTMLImageElement>();
const itemImg = (id: string) => { let im = imgs.get(id); if (!im) { im = new Image(); im.src = itemIcon(id, 32); imgs.set(id, im); } return im; };

interface Row { id: string; el: HTMLDivElement; cv: HTMLCanvasElement; sig: string; done: boolean; t: number }
export class Tracker {
  private root: HTMLDivElement;
  private rows = new Map<string, Row>();
  private timer = 0; private t = 0;
  constructor(readonly quests: Quests) {
    if (!document.getElementById('qt7-css')) { const s = document.createElement('style'); s.id = 'qt7-css'; s.textContent = CSS; document.head.append(s); }
    this.root = document.createElement('div'); this.root.className = 'qt7'; document.body.append(this.root);
    quests.on('start', (d: { id: string }) => { this.add(d.id); uiSfx('swishIn', 0.6); });
    quests.on('step', (d: { id: string }) => { const r = this.rows.get(d.id); if (r) { r.el.classList.remove('pop'); void r.el.offsetWidth; r.el.classList.add('pop'); uiSfx('tick', 0.8, 1.3); } this.paintAll(); });
    quests.on('done', (d: { id: string }) => { const r = this.rows.get(d.id); if (r) { r.done = true; r.t = 0; this.paint(r); uiSfx('confirm', 0.8); setTimeout(() => { r.el.classList.add('out'); setTimeout(() => { r.el.remove(); this.rows.delete(d.id); }, 400); }, 2600); } });
    for (const a of quests.active().reverse()) this.add(a.q.id);
    this.timer = window.setInterval(() => { this.t += 0.5; this.paintAll(); }, 500);
  }
  private add(id: string) {
    if (this.rows.has(id)) return;
    const el = document.createElement('div'); el.className = 'qr in';
    const cv = document.createElement('canvas'); el.append(cv);
    this.root.prepend(el);
    const r: Row = { id, el, cv, sig: '', done: false, t: 0 };
    this.rows.set(id, r);
    this.paint(r);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('in')));
    // three at most: the oldest folds away
    const live = [...this.rows.values()].filter((x) => !x.done);
    if (live.length > 3) { const old = live[0] === r ? live[1] : live.find((x) => x !== r)!; old.el.classList.add('out'); setTimeout(() => { old.el.remove(); this.rows.delete(old.id); }, 400); }
  }
  private paintAll() { for (const r of this.rows.values()) this.paint(r); }
  private paint(r: Row) {
    const q = QUEST[r.id]; if (!q) return;
    const live = this.quests.active().find((a) => a.q.id === r.id);
    const n = live?.n ?? q.steps.map((s) => s.n ?? 1);
    const blink = Math.floor(this.t * 2) % 5 === 0;
    const sig = [n.join(','), r.done, blink].join('|');
    if (sig === r.sig) return;
    r.sig = sig;
    paintRow(r.cv, q, n, r.done, blink);
  }
  dispose() { clearInterval(this.timer); this.root.remove(); }
}

/** one quest: lamp, icon, title (32 px), steps as icons with counts, rewards as icons */
function paintRow(cv: HTMLCanvasElement, q: QuestDef, n: number[], done: boolean, blink: boolean) {
  const W = 440, H = 76;
  cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
  // the lamp (3x)
  const pal = done ? PAL_G : PAL_Y;
  if (!blink || done) LAMP.forEach((row, j) => [...row].forEach((c, i) => { const col = pal[c]; if (col && c !== '.') { g.fillStyle = col; g.fillRect(i * 3, 8 + j * 3, 3, 3); } }));
  // the quest's icon
  const ic = stepIcon(q.icon, q.giver); g.drawImage(ic, 26, 2, 40, 40);
  // the title
  bitText(g, q.title, 74, 2, { scale: 2, color: done ? '#9cf08a' : '#ffc860' });
  // the steps
  let x = 74;
  q.steps.forEach((s, i) => {
    const need = s.n ?? 1, have = Math.min(need, n[i] ?? 0), ok = have >= need;
    const si = s.k.startsWith('talk:') ? stepIcon('talk', s.k.slice(5)) : s.k.startsWith('gift:') ? stepIcon('gift') : stepIcon(s.icon, q.giver);
    g.globalAlpha = ok ? 0.55 : 1; g.drawImage(si, x, 42, 28, 28); g.globalAlpha = 1;
    x += 30;
    const txt = ok ? '' : need > 1 ? `${have}/${need}` : '';
    if (ok) { g.fillStyle = '#0a0b10'; g.fillRect(x - 12, 58, 12, 10); g.fillStyle = '#7aff8a'; g.fillRect(x - 10, 62, 2, 2); g.fillRect(x - 8, 64, 2, 2); g.fillRect(x - 6, 62, 2, 2); g.fillRect(x - 4, 60, 2, 2); }
    if (txt) { bitText(g, txt, x + 2, 48, { color: '#f4ead0' }); x += bitMeasure(txt) + 6; }
    x += 12;
  });
  // the reward (right side of the step row)
  x = Math.max(x + 10, 250);
  const r = q.reward;
  g.fillStyle = '#c89a48'; g.fillRect(x - 10, 55, 4, 2); g.fillRect(x - 8, 53, 2, 6);
  for (const k in r.know ?? {}) { const ic = stepIcon(DATA_ICON[k]); g.drawImage(ic, x, 44, 24, 24); x += 24; const t = '+' + r.know![k as keyof typeof r.know]; bitText(g, t, x, 48, { color: '#9fe0ff' }); x += bitMeasure(t) + 6; }
  for (const id in r.items ?? {}) { if (!ITEMS[id]) continue; const im = itemImg(id); if (im.complete) g.drawImage(im, x, 44, 24, 24); else im.onload = () => paintRow(cv, q, n, done, blink); x += 24; const t = 'x' + r.items![id]; bitText(g, t, x, 48, { color: '#f4ead0' }); x += bitMeasure(t) + 6; }
  for (const id in r.close ?? {}) {
    if (x > W - 40) break;
    const f = stepIcon('talk', id); g.drawImage(f, x, 44, 24, 24); x += 24;
    heart(g, x + 1, 50); x += 14; void PEOPLE;
  }
}
function heart(g: CanvasRenderingContext2D, x: number, y: number) {
  const H = ['.#.#.', '#####', '#####', '.###.', '..#..'];
  g.fillStyle = '#0a0b10'; H.forEach((r, j) => [...r].forEach((c, i) => { if (c === '#') g.fillRect(x + i * 2 - 1, y + j * 2 - 1, 4, 4); }));
  H.forEach((r, j) => [...r].forEach((c, i) => { if (c === '#') { g.fillStyle = j < 2 && i < 2 ? '#ff9a8a' : '#e0503e'; g.fillRect(x + i * 2, y + j * 2, 2, 2); } }));
}

// UI KIT · FLOATING ICONS. A menu button is a free-floating OBJECT with its short name floating under it in Alagard
// (Limbophobia's rule: never a key, tile or frame). The object is a live outlined 3D model (model3d.ts ModelView) over
// a dithered pixel shadow; it bobs and turns slowly; under the pointer it lifts, glows, turns faster and tilts toward
// the pointer, with a recorded tick; pressed it squashes in 3D and springs back with a click; locked it shakes and
// refuses. A painted enamel badge with a number (or a bang) pops on its corner when something needs attention.
//   floatIcon({ build | canvas, name, onClick, size, scale, sound, anim, nameSize }) -> FloatIcon
//     .el .view .setBadge(n | '!' | null) .setOn(on) .lock(on) .ping() .hot(on)
import * as THREE from 'three';
import { ModelView, type ViewOpts } from './model3d';
import { Px, P, INK } from './px';
import { shadowBlob, pxCanvas } from './mat';
import { uiSfx, type UiSfx } from './sound';
import { pop, shake } from './juice';
import { installKitStyle } from './style';

export interface FloatIconOpts {
  /** the model (or a ready canvas instead) */
  build?: () => THREE.Object3D | Promise<THREE.Object3D | null>;
  canvas?: HTMLCanvasElement;
  name: string;
  onClick?: (e: MouseEvent) => void;
  /** the model's frame in art px (shown at scale) */
  size?: [number, number];
  scale?: number;
  sound?: UiSfx | '';
  nameSize?: 16 | 32;
  view?: ViewOpts;
  cls?: string;
  /** a hint word over the icon while hot (a key: B, M) */
  hint?: string;
  aria?: string;
}
export interface FloatIcon { el: HTMLButtonElement; view: ModelView | null; setBadge(n: number | string | null, pulse?: boolean): void; setOn(on: boolean): void; lock(on: boolean): void; ping(): void; hot(on: boolean): void; setName(t: string): void }

/** a painted enamel badge plaque: a red (or amber) shield with a lit lip, chipped, in an ink outline */
export function badgeArt(col: 'red' | 'amber' | 'green' = 'red', w = 13, h = 14): Px {
  const R = col === 'red' ? P.ruby : col === 'amber' ? P.ochre : P.malachite, p = new Px(w + 2, h + 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const bot = y > h - 5 ? (y - (h - 5)) : 0; if (x < bot || x > w - 1 - bot) continue;
    const k = y < 2 ? 5 : y < h * 0.45 ? 4 : 3, edge = x === bot || x === w - 1 - bot;
    p.set(x + 1, y + 1, edge ? R[Math.max(1, k - 2)] : R[k]);
  }
  p.hl(2, w - 1, 1, R[Math.min(R.length - 1, 6)]); p.set(3, 3, 0xffffff);
  p.outline(INK);
  return p;
}

export function floatIcon(o: FloatIconOpts): FloatIcon {
  installKitStyle();
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'k7-fi' + (o.cls ? ' ' + o.cls : '');
  b.setAttribute('aria-label', o.aria ?? o.name);
  b.style.setProperty('--ph', (Math.random() * -4).toFixed(2) + 's');
  const ic = document.createElement('span'); ic.className = 'k7-ic';
  const bob = document.createElement('span'); bob.className = 'k7-bob';
  const sc = o.scale ?? 2, [w, h] = o.size ?? [56, 56];
  const sh = pxCanvas(shadowBlob(Math.round(w * 0.62), Math.max(5, Math.round(w * 0.14)), 0.6), sc, 'k7-sh');
  let view: ModelView | null = null;
  if (o.build) { view = new ModelView(o.build, { w, h, scale: sc, ...(o.view ?? {}) }); bob.append(view.cv); }
  else if (o.canvas) { o.canvas.classList.add('k7-model'); bob.append(o.canvas); }
  ic.append(sh, bob);
  const nm = document.createElement('span'); nm.className = `k7-name k7-t${o.nameSize ?? 32}`; nm.textContent = o.name;
  b.append(ic, nm);
  if (o.hint) { const hn = document.createElement('span'); hn.className = 'k7-hint k7-t16'; hn.textContent = o.hint; b.append(hn); }
  // the badge: painted plaque + its number
  const bd = document.createElement('span'); bd.className = 'k7-badge'; bd.style.display = 'none';
  const bdArt = pxCanvas(badgeArt('red'), 2); bdArt.style.display = 'block';
  const bdN = document.createElement('span'); bdN.className = 'k7-t16'; bdN.style.cssText = 'position:absolute;left:0;right:0;top:3px;text-align:center;color:#fff3dc';
  bd.append(bdArt, bdN); ic.append(bd);
  let locked = false, isHot = false;
  const hot = (v: boolean) => { if (v === isHot) return; isHot = v; b.classList.toggle('hot', v); view?.hot(v); };
  b.addEventListener('pointerenter', (e) => { hot(true); if (e.pointerType === 'mouse') uiSfx('hover', 0.5); });
  b.addEventListener('pointermove', (e) => view?.point(e.clientX, e.clientY));
  b.addEventListener('pointerleave', () => { b.classList.remove('down'); hot(false); });
  b.addEventListener('focus', () => { if (b.matches(':focus-visible')) hot(true); });
  b.addEventListener('blur', () => hot(false));
  b.addEventListener('pointerdown', (e) => { if (e.button > 0) return; b.classList.add('down'); view?.press(1); uiSfx('tick', 0.4, 0.8); });
  b.addEventListener('pointerup', () => b.classList.remove('down'));
  b.addEventListener('click', (e) => {
    if (locked) { uiSfx('error', 0.5); shake(b, 5); view?.poke(-6); return; }
    if (o.sound !== '') uiSfx(o.sound ?? 'click', 0.7);
    view?.poke(8);
    o.onClick?.(e);
  });
  let badgeV: string | null = null;
  return {
    el: b, view,
    setBadge(n, pulse = true) {
      const t = n === null || n === undefined || n === 0 || n === '' ? null : String(n);
      if (t === badgeV) return;
      const was = badgeV; badgeV = t;
      bd.style.display = t ? '' : 'none'; bdN.textContent = t ?? '';
      bd.classList.toggle('pulse', !!t && pulse);
      if (t && t !== was) { pop(bd, 1.2); uiSfx('pluck', 0.5); }
    },
    setOn(on) { b.classList.toggle('on', on); },
    lock(on) { locked = on; b.classList.toggle('lock', on); },
    ping() { pop(ic, 0.8); view?.poke(10); },
    hot,
    setName(t) { if (nm.textContent !== t) nm.textContent = t; },
  };
}

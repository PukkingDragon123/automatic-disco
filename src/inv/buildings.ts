// The container kinds as works buildings (registerBuilding, cat 'storage'): footprint, cost, power and hooks. The
// factory draws only a footing pad for them; the container itself is drawn by inv/render.ts (detailed model, live
// contents, paint and logo). Placing one attaches a grid to it (game.storage); its store is that grid.
import { registerBuilding } from '../factory/defs';
import type { MG } from '../factory/models';
import { L } from '../factory/tex';
import { itemIcon, itemDef } from '../factory/items';
import { attachStorage } from './storage';
import { CONTAINER_KINDS, KIND_INFO } from './kinds';

let done = false;
export function registerContainers() {
  if (done) return;
  done = true;
  for (const k of CONTAINER_KINDS) {
    const I = KIND_INFO[k];
    registerBuilding({
      kind: k, name: I.name, cat: 'storage', w: I.foot[0], d: I.foot[1], h: I.h, cost: I.cost, power: I.power, hp: I.hp, desc: I.desc,
      skill: I.skill, store: 9999, input: 'all', output: 'front', solid: true, model: 'inv:' + k, buf: 20,
      hooks: {
        // a footing the container stands on (the model proper is drawn by the inventory's renderer)
        model: (m: MG) => { const [w, d] = I.foot; m.box([0, 0.02, 0], [w - 0.04, 0.04, d - 0.04], L.CONCRETE); },
        placed: (b, f) => { attachStorage(f.g).attach(b); },
        removed: (b, f) => { (f.g as { storage?: { detach(b: unknown): void } }).storage?.detach(b); },
        inspect: (b, f) => {
          const st = (f.g as { storage?: import('./storage').Storage }).storage, c = st?.containerOf(b);
          if (!c) return '';
          const top = c.contents().slice(0, 6).map((e) => `<span class="fc-chip" title="${itemDef(e.item).name}"><img src="${itemIcon(e.item)}"><b>${e.n}</b></span>`).join('');
          return `<div><span class="fc-k">${c.label}</span> ${Math.round(c.fill() * 100)}% full &middot; priority ${c.priority}</div><div>${top || '<i>empty</i>'}</div><div><button class="inv-open-btn" data-inv-open="${c.id}">OPEN INVENTORY</button></div>`;
        },
      },
    });
  }
}

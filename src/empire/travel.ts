// EMPIRE · TRAVEL between settlements. The camera climbs away from the settlement you leave, an iris closes on it,
// a travel plate (where to, how far, what is waiting there) stands over the cover while the flow builds the other
// region's game, and the iris opens on the new settlement with the camera dropping in from high above. The one you
// left keeps running on abstract rates (empire.ts). A pod-drop outpost that was never visited plays the pod's descent.
import type { Empire } from './empire';
import type { EmpireScreen } from './screen';
import { empireHost } from './host';
import { cover, reveal } from '../ui/kit/transitions';
import { wait } from '../ui/kit/juice';
import { uiSfx } from '../ui/kit/sound';
import { panel } from '../ui/kit/panel';
import { tierGlyph, glyphEl } from './glyphs';
import { BIOMES } from '../world/region';
import { km } from './geo';
import { TIER_NAME, type SettlementData } from './types';
import { toast } from '../ui/kit';

let busy = false;
export async function travelTo(e: Empire, s: SettlementData, screen?: EmpireScreen | null) {
  const why = e.canTravel(s.id); if (why) { toast(why, 'warn', 2600); return; }
  const host = empireHost(); if (!host || busy) return;
  const r = host.planet()?.regions[s.region] ?? e.region(s.region); if (!r) return;
  busy = true;
  try {
    const g = e.g, from = e.liveS();
    screen?.close(false);
    // leave: capture the settlement and save the run (its works, stores, pod and the empire)
    e.capture();
    if (from) e.log(`Leaving ${from.name} for ${s.name}`, 'info');
    host.save();
    if (g?.cam) { g.cam.followFn?.(null); g.cam.distGoal = Math.max(g.cam.dist, 190); }
    uiSfx('swishIn', 0.6, 0.8);
    await wait(560);
    await cover('iris', { x: innerWidth / 2, y: innerHeight / 2, ms: 420 });
    const card = plate(e, s, from);
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
    // the old region goes first (its dispose clears the UI layer), then the flow builds the next one
    g?.engine?.setScreen?.({ update() { /* between regions */ }, render() { /* nothing */ } });
    const drop = s.how === 'drop' && !s.visited;
    host.visit(r, drop ? { drop: { pin: s.pin ?? { x: 80, z: 80 }, first: false } } : { opts: { landing: s.pin ?? undefined, resumeColony: s.visited ? true : { v: 0 }, descent: false, story: false } });
    const g2 = host.game() as (typeof g) | null;
    if (g2?.cam && !drop) { g2.cam.dist = 170; g2.cam.distGoal = 36; }
    await wait(300);
    card.dispose();
    await reveal('iris', { x: innerWidth / 2, y: innerHeight / 2, ms: 460 });
    uiSfx('swishOut', 0.5, 1.1);
  } catch (err) { console.error('empire travel', err); }
  finally { busy = false; }
}

/** the plate over the cover: the destination, the distance, what it is */
function plate(e: Empire, s: SettlementData, from: SettlementData | null) {
  const p = panel({ title: `EN ROUTE TO ${s.name.toUpperCase()}`, tone: 'gun', serial: TIER_NAME[s.tier].toUpperCase(), lamps: ['amber', 'green'], cls: 'emp-travel' });
  const r = e.region(s.region)!;
  const row = document.createElement('div'); row.className = 'emp-travel-r';
  row.append(glyphEl(tierGlyph(s.tier, 2), 3));
  const col = document.createElement('div'); row.append(col);
  p.body.append(row);
  const line = (t: string, dim = false) => { const d = document.createElement('div'); d.className = 'k7-t16 kp-p' + (dim ? ' dim' : ''); d.textContent = t; col.append(d); };
  line(`${TIER_NAME[s.tier]} in ${r.name}, ${BIOMES[r.biome]?.name ?? r.biome}.`);
  if (from) line(`${km(e.planet, from.region, s.region)} km from ${from.name}, which keeps running on its own while you are away.`, true);
  line(s.visited ? 'Its works, stores and pod are waiting; what it made and used since you left is in its stores.' : s.how === 'drop' ? 'A fresh pod from the MERIDIAN: you ride it down.' : 'The settlers have unloaded the convoy and raised a field core.', true);
  p.status('Loading the region...', 'busy');
  const st = document.createElement('style'); st.textContent = '.emp-travel { position: fixed; left: calc(50% - 310px); top: 36%; width: 620px; z-index: 9560; } .emp-travel-r { display: flex; gap: 18px; align-items: center; } .emp-travel-r canvas { image-rendering: pixelated; }';
  p.el.append(st);
  document.body.append(p.el);
  return p;
}

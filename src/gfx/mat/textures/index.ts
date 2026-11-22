// Registers every procedural texture into the shared atlas.
// Each module exports a register function; order does not matter.
import { registerLobbyTextures } from './lobby';
import { registerCeilingTextures } from './ceilings';
import { registerDetailTextures } from './detail';
import { registerHorrorTextures } from './horror';

const registrars: (() => void)[] = [registerLobbyTextures, registerCeilingTextures, registerDetailTextures, registerHorrorTextures];
let registered = false;

/** Modules call this at import time to add their registrar (runs immediately if late) */
export function addTextureModule(fn: () => void) {
  registrars.push(fn);
  if (registered) { try { fn(); } catch (e) { console.error('texture module failed', e); } }
}

export function registerAllTextures() {
  if (registered) return;
  registered = true;
  for (const r of registrars) {
    try { r(); } catch (e) { console.error('texture module failed', e); }
  }
}

// The settings keys the hub's title card offers (quality, volume, shake). Kept from the old room vignettes, which
// are gone: the rooms' functions are now the SHIP screen's panels (src/ship/screen).
import { settings, setSettings, type Quality } from '../../settings';

export interface Stamp { label: string; key?: string; icon?: string; run: () => void; disabled?: () => string | false; hot?: boolean }
/** inked pips (an html strip the chrome styles) */
export const pips = (v: number, n = 8) => { const k = Math.round(Math.max(0, Math.min(1, v)) * n); return `<span class="pp">${Array.from({ length: n }, (_, i) => `<i${i < k ? ' class="on"' : ''}></i>`).join('')}</span>`; };
export function settingsStamps(redraw: () => void): Stamp[] {
  const q = (v: Quality, l: string): Stamp => ({ label: (settings.quality === v ? '[X] ' : '[ ] ') + l, run: () => { setSettings({ quality: v }); redraw(); } });
  return [q('low', 'LOW'), q('medium', 'MEDIUM'), q('high', 'HIGH'),
    { label: `VOLUME ${pips(settings.master, 6)}`, run: () => { setSettings({ master: settings.master >= 1 ? 0 : Math.min(1, settings.master + 0.2) }); redraw(); } },
    { label: `SHAKE ${settings.shake ? 'ON' : 'OFF'}`, run: () => { setSettings({ shake: !settings.shake }); redraw(); } }];
}

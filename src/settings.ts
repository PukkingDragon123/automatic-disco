// Player settings, persisted in localStorage ('oddworld.settings'). Any system can read `settings` and subscribe
// with onSettings(fn); the menu's settings plate writes them with setSettings(patch).
//   quality: 'low' | 'medium' | 'high'  -> qualityProfile() says what each tier turns on (SSAO, bloom, shadows, pixel ratio)
//   uiScale: 0 = automatic (by window height), or a fixed integer UI scale 2..4
//   motionBlur: 0..1 strength of the camera and object motion blur (MOTION_BLUR_LEVELS names the steps; 'high' is the
//     desktop default). Low quality and the OS reduced-motion preference turn it off: read motionBlurK(), not this.
export type Quality = 'low' | 'medium' | 'high';
export interface Settings { master: number; music: number; sfx: number; quality: Quality; uiScale: number; shake: boolean; motionBlur: number }
/** the motion blur steps a settings row offers (label, strength) */
export const MOTION_BLUR_LEVELS: [string, number][] = [['OFF', 0], ['LOW', 0.3], ['MEDIUM', 0.55], ['HIGH', 0.8], ['MAX', 1]];
/** the OS asks for less motion (no motion blur then, whatever the slider says) */
export function reducedMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
const KEY = 'oddworld.settings';
/** a first-run quality guess: phones and tablets start low, integrated or software GPUs medium, everything else high */
function guessQuality(): Quality {
  try {
    if (matchMedia('(pointer: coarse)').matches) return 'low';
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /intel|mali|adreno|powervr|swiftshader|llvmpipe|software/.test(r) ? 'medium' : 'high';
  } catch { return 'medium'; }
}
const DEFAULTS: Settings = { master: 0.8, music: 0.55, sfx: 0.9, quality: guessQuality(), uiScale: 0, shake: true, motionBlur: reducedMotion() || coarse() ? 0 : 0.8 };

function load(): Settings {
  try {
    const s = localStorage.getItem(KEY); if (!s) return { ...DEFAULTS };
    const d = JSON.parse(s) as Partial<Settings>;
    const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
    return {
      master: num(d.master, DEFAULTS.master, 0, 1), music: num(d.music, DEFAULTS.music, 0, 1), sfx: num(d.sfx, DEFAULTS.sfx, 0, 1),
      quality: d.quality === 'low' || d.quality === 'medium' || d.quality === 'high' ? d.quality : DEFAULTS.quality,
      uiScale: num(d.uiScale, 0, 0, 4) | 0, shake: typeof d.shake === 'boolean' ? d.shake : DEFAULTS.shake,
      motionBlur: num(d.motionBlur, DEFAULTS.motionBlur, 0, 1),
    };
  } catch { return { ...DEFAULTS }; }
}

/** the live settings (read freely; write through setSettings) */
export const settings: Settings = load();
const fns: ((s: Settings, changed: (keyof Settings)[]) => void)[] = [];
/** subscribe to changes; returns an unsubscribe */
export function onSettings(fn: (s: Settings, changed: (keyof Settings)[]) => void) { fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; }
export function setSettings(patch: Partial<Settings>) {
  const changed: (keyof Settings)[] = [];
  for (const k of Object.keys(patch) as (keyof Settings)[]) if (patch[k] !== undefined && patch[k] !== settings[k]) { (settings as any)[k] = patch[k]; changed.push(k); }
  if (!changed.length) return;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage off */ }
  for (const f of fns) { try { f(settings, changed); } catch (e) { console.error('settings listener', e); } }
}
export function resetSettings() { setSettings({ ...DEFAULTS }); }

/**
 * What a quality tier enables (the renderer and post pass read this). ssaoTaps: contact-shadow samples (0 = off);
 * blurTaps: motion blur gather samples (0 = off); blurObjects: fast objects get their own velocity (not just the
 * camera's); beams: interior light shafts (volumetric glow under the ceiling lights); area: the area-light shading
 * (soft ceiling panels) on interior materials.
 */
export function qualityProfile(q: Quality = settings.quality) {
  return q === 'low' ? { ssao: false, ssaoTaps: 0, bloom: false, shadows: false, pixelRatio: 0.75, shadowMap: 1024, blurTaps: 0, blurObjects: false, beams: false, area: true }
    : q === 'medium' ? { ssao: true, ssaoTaps: 6, bloom: true, shadows: true, pixelRatio: 1, shadowMap: 1024, blurTaps: 10, blurObjects: true, beams: true, area: true }
    : { ssao: true, ssaoTaps: 12, bloom: true, shadows: true, pixelRatio: 1, shadowMap: 2048, blurTaps: 16, blurObjects: true, beams: true, area: true };
}
/** the motion blur strength to use right now: the slider, off on low quality and under the OS reduced-motion setting */
export function motionBlurK() { return settings.quality === 'low' || reducedMotion() ? 0 : Math.max(0, Math.min(1, settings.motionBlur)); }
/** the UI scale to use right now (the setting, or automatic by window height) */
export function uiScale() { return settings.uiScale || (innerHeight >= 1040 ? 3 : 2); }

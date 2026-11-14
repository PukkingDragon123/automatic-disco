// Cinematic and launch-control sound: a small synth of its own (the game's audio.ts stays untouched), for the
// heavy machinery of the U.S.P.C. control room and the cutscenes. Klaxons, lever clunks, relay clicks, servo
// whine, nixie countdown beeps, rocket ignition, retro-thrusters, radio squelch and static, Geiger clicks, a
// heartbeat, a low dread drone and orchestral-ish stings. Everything is synthesised; nothing is loaded.
import { settings, onSettings } from '../settings';
let ctx: AudioContext | null = null;
let out: GainNode, verbIn: GainNode, noiseBuf: AudioBuffer;
export const cineVol = { k: 0.9 };

function init() {
  if (ctx) return;
  try { ctx = new AudioContext(); } catch { return; }
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.connect(ctx.destination);
  out = ctx.createGain(); out.gain.value = 0.7 * cineVol.k * settings.master * settings.sfx * 1.2; out.connect(comp);
  const verb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  verb.buffer = ir; verbIn = ctx.createGain(); verbIn.gain.value = 0.5; verbIn.connect(verb); verb.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
}
onSettings(() => { if (ctx && out) out.gain.setTargetAtTime(0.7 * cineVol.k * settings.master * settings.sfx * 1.2, ctx.currentTime, 0.05); });
function unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
addEventListener('touchstart', unlock, { passive: true });

const ok = () => !!ctx && ctx.state === 'running';
function env(g: GainNode, t: number, a: number, peak: number, d: number) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, a = 0.005, glide?: number, wet = 0, dest: AudioNode = out) {
  const o = ctx!.createOscillator(), g = ctx!.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t + a + dur);
  env(g, t, a, peak, dur); o.connect(g); g.connect(dest);
  if (wet) { const s = ctx!.createGain(); s.gain.value = wet; g.connect(s); s.connect(verbIn); }
  o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}
function noise(t: number, dur: number, peak: number, f: number, q: number, type: BiquadFilterType, a = 0.004, fEnd?: number, wet = 0, dest: AudioNode = out) {
  const s = ctx!.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx!.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t + a + dur);
  const g = ctx!.createGain(); env(g, t, a, peak, dur);
  s.connect(fl); fl.connect(g); g.connect(dest);
  if (wet) { const w = ctx!.createGain(); w.gain.value = wet; g.connect(w); w.connect(verbIn); }
  s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
}

export type CineSfx =
  | 'klaxon' | 'lever' | 'leverLock' | 'relay' | 'switch' | 'cover' | 'button' | 'servo' | 'hover' | 'tick' | 'beep' | 'beepHi' | 'ignite' | 'launch'
  | 'thrust' | 'boom' | 'whoosh' | 'squelch' | 'static' | 'geiger' | 'geigerHot' | 'heart' | 'sting' | 'stingDark' | 'impact' | 'card' | 'cardFeed'
  | 'steam' | 'clamp' | 'hum' | 'crunch' | 'roar' | 'scream' | 'splat' | 'thud' | 'type' | 'page' | 'wind' | 'glass' | 'chime' | 'deny' | 'swell' | 'step';

const last: Record<string, number> = {};
/** play a cinematic sound. v: volume, k: pitch scale */
export function csfx(name: CineSfx, v = 1, k = 1) {
  if (!ok() || !(v > 0.002)) return;
  const t = ctx!.currentTime;
  if ((last[name] ?? -1) > t - 0.03) return;
  last[name] = t;
  switch (name) {
    case 'klaxon': { // a two-tone 1950s alert horn, a little sour
      for (let i = 0; i < 2; i++) {
        const t0 = t + i * 0.42;
        osc('sawtooth', 440 * k, t0, 0.36, 0.09 * v, 0.02, 470 * k, 0.25);
        osc('square', 554 * k, t0, 0.36, 0.05 * v, 0.02, 580 * k, 0.25);
        osc('sawtooth', 220 * k, t0, 0.36, 0.05 * v, 0.02, undefined, 0.2);
      }
      break;
    }
    case 'lever': // a heavy throw: a ratchet run, then the clunk into the detent
      for (let i = 0; i < 6; i++) noise(t + i * 0.035, 0.02, 0.05 * v, 2400, 2, 'bandpass');
      noise(t + 0.24, 0.12, 0.3 * v, 600 * k, 1, 'lowpass', 0.002, 200, 0.4);
      osc('sine', 90 * k, t + 0.24, 0.2, 0.25 * v, 0.002, 50, 0.3);
      osc('square', 180 * k, t + 0.24, 0.05, 0.05 * v, 0.001, 90);
      break;
    case 'leverLock':
      noise(t, 0.06, 0.18 * v, 900, 2, 'bandpass', 0.001, 300); osc('square', 140, t, 0.08, 0.06 * v, 0.001, 90);
      noise(t + 0.09, 0.05, 0.12 * v, 700, 2, 'bandpass', 0.001, 250);
      break;
    case 'relay': noise(t, 0.012, 0.16 * v, 3800 * k, 1.5, 'highpass'); noise(t + 0.03, 0.01, 0.1 * v, 3000 * k, 1.5, 'highpass'); break;
    case 'switch': noise(t, 0.02, 0.22 * v, 2600 * k, 1, 'bandpass', 0.001); osc('square', 900 * k, t, 0.015, 0.05 * v, 0.001, 400); break;
    case 'cover': // the safety cover flips up on its hinge
      noise(t, 0.08, 0.1 * v, 1800, 3, 'bandpass', 0.003, 3400);
      noise(t + 0.08, 0.04, 0.2 * v, 1200, 2, 'bandpass', 0.001, 500);
      osc('triangle', 600, t + 0.08, 0.06, 0.05 * v, 0.001, 300);
      break;
    case 'button': // a big Bakelite push button bottoming out
      noise(t, 0.05, 0.25 * v, 900 * k, 1.5, 'bandpass', 0.001, 300, 0.2); osc('sine', 120 * k, t, 0.12, 0.2 * v, 0.001, 60, 0.2);
      break;
    case 'servo': {
      const o = osc('sawtooth', 160 * k, t, 0.55, 0.035 * v, 0.06, 420 * k);
      void o; noise(t, 0.55, 0.03 * v, 1200 * k, 6, 'bandpass', 0.06, 2600 * k);
      break;
    }
    case 'hover': osc('triangle', 1760 * k, t, 0.03, 0.03 * v); osc('square', 2640 * k, t + 0.02, 0.02, 0.012 * v); break;
    case 'tick': noise(t, 0.008, 0.12 * v, 5000, 1, 'highpass'); break;
    case 'beep': osc('square', 880 * k, t, 0.12, 0.06 * v, 0.002); osc('sine', 1760 * k, t, 0.1, 0.03 * v); break;
    case 'beepHi': osc('square', 1320 * k, t, 0.5, 0.07 * v, 0.002, undefined, 0.3); osc('sine', 2640 * k, t, 0.4, 0.03 * v); break;
    case 'ignite': // the cradle's charges fire
      noise(t, 0.5, 0.5 * v, 1400, 0.7, 'lowpass', 0.003, 200, 0.6);
      osc('sawtooth', 70, t, 0.8, 0.3 * v, 0.003, 30, 0.5);
      osc('sine', 45, t, 1.4, 0.4 * v, 0.01, 25, 0.4);
      break;
    case 'launch': // a long rising roar as it leaves the rail
      noise(t, 2.6, 0.32 * v, 300, 0.8, 'lowpass', 0.25, 3200, 0.4);
      noise(t, 2.6, 0.1 * v, 2000, 2, 'bandpass', 0.4, 6000, 0.3);
      osc('sawtooth', 50, t, 2.4, 0.12 * v, 0.2, 140, 0.3);
      break;
    case 'thrust': noise(t, 0.9 * k, 0.12 * v, 500, 0.8, 'lowpass', 0.08, 900, 0.3); osc('sawtooth', 48, t, 0.9 * k, 0.04 * v, 0.08, 60); break;
    case 'boom':
      noise(t, 1.6, 0.6 * v, 900, 0.6, 'lowpass', 0.002, 60, 0.8);
      osc('sine', 60, t, 1.8, 0.5 * v, 0.002, 22, 0.5);
      break;
    case 'whoosh': noise(t, 0.7 * k, 0.18 * v, 400, 1.5, 'bandpass', 0.15, 2600, 0.3); break;
    case 'squelch': // radio key-up: a burst of carrier and a chirp
      noise(t, 0.12, 0.08 * v, 2400, 1.2, 'bandpass', 0.002, 1200);
      osc('sine', 1200, t + 0.1, 0.05, 0.04 * v, 0.002, 800);
      break;
    case 'static': noise(t, 0.9 * k, 0.06 * v, 3000, 0.6, 'bandpass', 0.05, 2200); break;
    case 'geiger': noise(t, 0.004, 0.25 * v, 4200, 1, 'highpass', 0.0005); break;
    case 'geigerHot': for (let i = 0; i < 9; i++) noise(t + Math.random() * 0.25, 0.004, 0.22 * v, 4200, 1, 'highpass', 0.0005); break;
    case 'heart':
      osc('sine', 52, t, 0.16, 0.4 * v, 0.004, 38); osc('sine', 48, t + 0.22, 0.18, 0.3 * v, 0.004, 34);
      break;
    case 'sting': // a bright brass-ish chord swell
      for (const [i, f] of [196, 247, 294, 392].entries()) { osc('sawtooth', f * k, t + i * 0.02, 1.4, 0.04 * v, 0.25, undefined, 0.5); osc('triangle', f * 2 * k, t, 1.2, 0.02 * v, 0.3, undefined, 0.5); }
      break;
    case 'stingDark': // a low cluster: something is wrong
      for (const f of [55, 58.3, 82.4, 87.3]) osc('sawtooth', f * k, t, 2.2, 0.05 * v, 0.4, f * 0.94, 0.6);
      noise(t, 2, 0.05 * v, 200, 2, 'lowpass', 0.4, 90, 0.4);
      break;
    case 'impact': noise(t, 0.3, 0.4 * v, 500 * k, 1, 'lowpass', 0.001, 90, 0.5); osc('sine', 70 * k, t, 0.35, 0.35 * v, 0.001, 30, 0.4); break;
    case 'card': noise(t, 0.05, 0.08 * v, 3000, 2, 'bandpass', 0.003, 5000); break;
    case 'cardFeed': for (let i = 0; i < 10; i++) noise(t + i * 0.03, 0.015, 0.07 * v, 2200 + i * 80, 3, 'bandpass'); osc('sawtooth', 220, t, 0.32, 0.02 * v, 0.03, 330); break;
    case 'steam': noise(t, 0.9 * k, 0.12 * v, 4500, 0.7, 'highpass', 0.02, 2000, 0.3); break;
    case 'clamp': noise(t, 0.05, 0.35 * v, 1400, 1.4, 'bandpass', 0.001, 400, 0.4); osc('square', 110, t, 0.12, 0.08 * v, 0.001, 70, 0.3); noise(t + 0.08, 0.3, 0.05 * v, 3000, 2, 'highpass', 0.01, 1200); break;
    case 'hum': osc('sine', 60, t, 1.4, 0.05 * v, 0.2, undefined, 0.2); osc('sine', 120, t, 1.4, 0.025 * v, 0.2); break;
    case 'crunch': for (let i = 0; i < 4; i++) noise(t + i * 0.03, 0.05, 0.2 * v, 1100 - i * 120, 1.4, 'bandpass', 0.001); break;
    case 'roar':
      osc('sawtooth', 62 * k, t, 1.8, 0.24 * v, 0.1, 40 * k, 0.6); osc('square', 124 * k, t, 1.3, 0.06 * v, 0.12, 80 * k, 0.5);
      noise(t, 1.7, 0.2 * v, 520 * k, 2, 'bandpass', 0.08, 170, 0.6);
      break;
    case 'scream': osc('sawtooth', 520, t, 0.8, 0.06 * v, 0.03, 300, 0.6); osc('square', 780, t, 0.6, 0.02 * v, 0.03, 420, 0.5); noise(t, 0.7, 0.05 * v, 1800, 3, 'bandpass', 0.03, 900, 0.4); break;
    case 'splat': noise(t, 0.25, 0.3 * v, 700, 2, 'bandpass', 0.002, 180, 0.3); osc('sine', 130, t, 0.15, 0.15 * v, 0.002, 50); break;
    case 'thud': noise(t, 0.18, 0.3 * v, 260 * k, 1, 'lowpass', 0.002, 70, 0.3); osc('sine', 70 * k, t, 0.2, 0.3 * v, 0.002, 35); break;
    case 'type': noise(t, 0.012, 0.09 * v, 2600 * k, 2, 'bandpass', 0.001); break;
    case 'page': noise(t, 0.3, 0.06 * v, 3200, 0.8, 'bandpass', 0.05, 1800); break;
    case 'wind': noise(t, 3 * k, 0.06 * v, 380, 0.7, 'bandpass', 0.8, 620, 0.2); break;
    case 'glass': for (let i = 0; i < 5; i++) osc('sine', 2400 + Math.random() * 2400, t + Math.random() * 0.2, 0.3, 0.02 * v, 0.001, undefined, 0.6); noise(t, 0.3, 0.12 * v, 5000, 1, 'highpass', 0.001); break;
    case 'chime': for (const [i, f] of [784, 988, 1175, 1568].entries()) osc('triangle', f * k, t + i * 0.08, 0.5, 0.05 * v, 0.004, undefined, 0.5); break;
    case 'deny': osc('square', 200, t, 0.15, 0.07 * v, 0.003, 120); osc('square', 150, t + 0.12, 0.18, 0.06 * v); break;
    case 'swell': noise(t, 1.6 * k, 0.12 * v, 200, 1, 'lowpass', 1.2 * k, 2400, 0.6); osc('sawtooth', 110, t, 1.6 * k, 0.03 * v, 1.2 * k, 220, 0.5); break;
    case 'step': noise(t, 0.06, 0.07 * v, 500 * k, 1, 'lowpass', 0.002, 200); break;
  }
}

// ------------------------------------------------------------------ loops: held sounds a scene turns on and off
export interface Loop { set(v: number): void; stop(fade?: number): void }
const silent: Loop = { set() {}, stop() {} };
/** a sustained drone/bed. kind: 'drone' dread pad, 'engine' rocket rumble, 'fire' crackle bed, 'radio' static hiss, 'room' control-room hum */
export function cloop(kind: 'drone' | 'engine' | 'fire' | 'radio' | 'room' | 'night', v = 1): Loop {
  if (!ok()) return silent;
  const t = ctx!.currentTime, g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * 0.5), t + 0.8);
  g.connect(out);
  const nodes: (AudioScheduledSourceNode)[] = [];
  const src = (type: BiquadFilterType, f: number, q: number, gain: number) => {
    const s = ctx!.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ctx!.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const gg = ctx!.createGain(); gg.gain.value = gain; s.connect(fl); fl.connect(gg); gg.connect(g); s.start(t, Math.random()); nodes.push(s);
    return fl;
  };
  const tone = (type: OscillatorType, f: number, gain: number, lfoF = 0, lfoA = 0) => {
    const o = ctx!.createOscillator(); o.type = type; o.frequency.value = f;
    const gg = ctx!.createGain(); gg.gain.value = gain; o.connect(gg); gg.connect(g); o.start(t); nodes.push(o);
    if (lfoF) { const l = ctx!.createOscillator(), la = ctx!.createGain(); l.frequency.value = lfoF; la.gain.value = lfoA; l.connect(la); la.connect(o.frequency); l.start(t); nodes.push(l); }
  };
  if (kind === 'drone') { tone('sawtooth', 41.2, 0.05, 0.11, 0.6); tone('sawtooth', 61.7, 0.035, 0.07, 0.8); tone('sine', 82.4, 0.05); src('lowpass', 180, 1, 0.12); }
  if (kind === 'engine') { const f = src('lowpass', 420, 0.9, 0.5); tone('sawtooth', 38, 0.12, 6, 3); void f; }
  if (kind === 'fire') { src('bandpass', 900, 0.6, 0.16); src('lowpass', 200, 1, 0.2); }
  if (kind === 'radio') { src('bandpass', 2800, 0.7, 0.12); tone('sine', 1000, 0.006, 0.4, 30); }
  if (kind === 'room') { tone('sine', 60, 0.05); tone('sine', 120, 0.025); tone('triangle', 180, 0.006, 0.2, 4); src('bandpass', 700, 0.5, 0.05); }
  if (kind === 'night') { src('bandpass', 380, 0.6, 0.12); tone('sine', 3800, 0.004, 9, 400); tone('sine', 4300, 0.003, 7, 300); }
  return {
    set(nv: number) { if (ctx) g.gain.setTargetAtTime(Math.max(0.0002, nv * 0.5), ctx.currentTime, 0.15); },
    stop(fade = 0.6) {
      if (!ctx) return; const n = ctx.currentTime;
      g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), n); g.gain.exponentialRampToValueAtTime(0.0001, n + fade);
      for (const s of nodes) { try { s.stop(n + fade + 0.05); } catch { /* already stopped */ } }
    },
  };
}

/** an 8-bit murmur for a speaker (pitch per character; radio voices are band-limited) */
export function cvoice(text: string, pitch = 1, radio = false) {
  if (!ok()) return 0;
  const t0 = ctx!.currentTime;
  let t = t0;
  const dest = radio ? (() => { const f = ctx!.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9; f.connect(out); return f; })() : out;
  for (const w of text.split(/\s+/).slice(0, 40)) {
    const syl = Math.max(1, Math.round(w.replace(/[^aeiouy]/gi, '').length * 0.8));
    for (let s = 0; s < syl; s++) {
      const f = (150 + Math.random() * 60) * pitch * (w.endsWith('?') && s === syl - 1 ? 1.3 : 1);
      osc('square', f, t, 0.06, 0.03, 0.004, f * (0.85 + Math.random() * 0.3), 0, dest);
      osc('triangle', f * 2, t, 0.05, 0.013, 0.004, undefined, 0, dest);
      t += 0.075 + Math.random() * 0.03;
    }
    t += /[.,!?]$/.test(w) ? 0.16 : 0.05;
  }
  if (radio) noise(t0, t - t0, 0.015, 3000, 0.7, 'bandpass', 0.02);
  return t - t0;
}

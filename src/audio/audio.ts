// Procedural audio: every sound is synthesised (no files). UI blips, organic squelches, chitin cracks, field zaps,
// creature calls scaled by body size, the researcher's 8-bit voice, wind and a slow generative pad score.
import { settings, onSettings } from '../settings';
let ctx: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode, ambBus: GainNode, verb: ConvolverNode, verbIn: GainNode;
let noiseBuf: AudioBuffer;
export const vol = { master: 0.8, sfx: 0.9, music: 0.55, amb: 0.6 };
// the player's volume settings (src/settings.ts) drive the buses
const fromSettings = () => { vol.master = settings.master; vol.sfx = settings.sfx; vol.music = settings.music; vol.amb = 0.6 * Math.max(settings.music, settings.sfx); };
fromSettings();
onSettings((_s, ch) => { if (ch.some((k) => k === 'master' || k === 'music' || k === 'sfx')) { fromSettings(); setVolumes(); } });
let started = false;

function init() {
  if (ctx) return;
  try { ctx = new AudioContext(); } catch { return; }
  master = ctx.createGain(); master.gain.value = vol.master; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(comp);
  ambBus = ctx.createGain(); ambBus.gain.value = vol.amb; ambBus.connect(comp);
  // a cave-ish reverb from decaying noise
  verb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  verb.buffer = ir;
  verbIn = ctx.createGain(); verbIn.gain.value = 0.35; verbIn.connect(verb); verb.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
}
export function unlockAudio() {
  init();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  if (ctx && !started) { started = true; startAmbience(); }
}
addEventListener('pointerdown', unlockAudio, { once: false });
addEventListener('keydown', unlockAudio, { once: false });
export function setVolumes() { if (!ctx) return; master.gain.value = vol.master; sfxBus.gain.value = vol.sfx; musicBus.gain.value = vol.music; ambBus.gain.value = vol.amb; }

const now = () => ctx!.currentTime;
function env(g: GainNode, t: number, a: number, peak: number, d: number) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, bus: AudioNode, a = 0.005, glide?: number, wet = 0) {
  const o = ctx!.createOscillator(), g = ctx!.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t + dur);
  env(g, t, a, peak, dur);
  o.connect(g); g.connect(bus); if (wet) { const s = ctx!.createGain(); s.gain.value = wet; g.connect(s); s.connect(verbIn); }
  o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}
function noise(t: number, dur: number, peak: number, f: number, q: number, type: BiquadFilterType, bus: AudioNode, a = 0.004, fEnd?: number, wet = 0) {
  const s = ctx!.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx!.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = ctx!.createGain(); env(g, t, a, peak, dur);
  s.connect(fl); fl.connect(g); g.connect(bus); if (wet) { const w = ctx!.createGain(); w.gain.value = wet; g.connect(w); w.connect(verbIn); }
  s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
}

let lastSfx: Record<string, number> = {};
/** play a named sound; k scales pitch/size (bigger creature = lower), v volume */
export function sfx(name: string, k = 1, v = 1) {
  if (!ctx || ctx.state !== 'running' || !(v > 0.002) || !(k > 0)) return;
  const t = now();
  if ((lastSfx[name] ?? 0) > t - 0.035) return;
  lastSfx[name] = t;
  const B = sfxBus;
  switch (name) {
    case 'hover': osc('square', 1320, t, 0.025, 0.025 * v, B); break;
    case 'click': osc('square', 660, t, 0.04, 0.07 * v, B, 0.002, 990); osc('triangle', 1320, t + 0.03, 0.05, 0.04 * v, B); break;
    case 'deny': osc('square', 180, t, 0.12, 0.08 * v, B, 0.003, 120); osc('square', 140, t + 0.09, 0.14, 0.07 * v, B); break;
    case 'open': osc('triangle', 330, t, 0.18, 0.08 * v, B, 0.01, 660, 0.3); noise(t, 0.2, 0.04 * v, 1800, 1, 'bandpass', B); break;
    case 'close': osc('triangle', 520, t, 0.14, 0.07 * v, B, 0.01, 260); break;
    case 'squelch': noise(t, 0.22 * k, 0.16 * v, 900 / k, 3, 'bandpass', B, 0.01, 260 / k, 0.2); osc('sine', 140 / k, t, 0.2 * k, 0.1 * v, B, 0.01, 60 / k); break;
    case 'grow': noise(t, 0.35, 0.05 * v, 400, 2, 'lowpass', B, 0.05, 1600, 0.4); osc('sine', 90, t, 0.4, 0.06 * v, B, 0.06, 140, 0.3); break;
    case 'crack': noise(t, 0.08 * k, 0.24 * v, 2600 / k, 0.8, 'highpass', B, 0.001, undefined, 0.15); osc('square', 120 / k, t, 0.06, 0.08 * v, B, 0.001, 50); break;
    case 'hit': noise(t, 0.1 * k, 0.2 * v, 700 / k, 1.2, 'bandpass', B, 0.002, 200 / k); osc('sine', 110 / k, t, 0.12, 0.12 * v, B, 0.002, 50 / k); break;
    case 'zap': {
      for (let i = 0; i < 5; i++) osc('sawtooth', 800 + Math.random() * 1800, t + i * 0.025, 0.04, 0.05 * v, B, 0.001, 300 + Math.random() * 300);
      noise(t, 0.2, 0.12 * v, 5000, 0.7, 'highpass', B, 0.001, 2000, 0.4); break;
    }
    case 'pulse': osc('sine', 60, t, 0.9, 0.3 * v, B, 0.01, 30, 0.6); noise(t, 0.6, 0.12 * v, 300, 1, 'lowpass', B, 0.01, 80, 0.6); osc('sawtooth', 220, t, 0.5, 0.06 * v, B, 0.01, 40, 0.5); break;
    case 'tendril': noise(t, 0.4, 0.12 * v, 500, 4, 'bandpass', B, 0.03, 1400, 0.3); osc('triangle', 70, t, 0.35, 0.1 * v, B, 0.02, 160); break;
    case 'absorb': for (let i = 0; i < 4; i++) osc('sine', 440 * Math.pow(1.335, i), t + i * 0.07, 0.6, 0.06 * v, B, 0.01, undefined, 0.6); osc('triangle', 110, t, 0.8, 0.08 * v, B, 0.05, 220, 0.5); break;
    case 'build': osc('sine', 98, t, 0.9, 0.12 * v, B, 0.08, 196, 0.5); noise(t, 0.8, 0.05 * v, 300, 1, 'lowpass', B, 0.1, 1200, 0.5); break;
    case 'done': for (let i = 0; i < 3; i++) osc('triangle', 392 * [1, 1.26, 1.5][i], t + i * 0.09, 0.3, 0.07 * v, B, 0.005, undefined, 0.4); break;
    case 'birth': noise(t, 0.3, 0.1 * v, 600, 3, 'bandpass', B, 0.02, 200, 0.3); osc('sine', 300, t + 0.1, 0.25, 0.06 * v, B, 0.01, 600, 0.3); break;
    case 'death': osc('sawtooth', 260 / k, t, 0.5 * k, 0.09 * v, B, 0.01, 60 / k, 0.4); noise(t, 0.3, 0.08 * v, 600 / k, 2, 'bandpass', B, 0.01, 150, 0.3); break;
    case 'call': { // creature vocalisation: formant-ish chirp or growl by size
      const f = 900 / Math.pow(k, 0.8);
      if (k < 0.8) { osc('square', f * 2, t, 0.06, 0.03 * v, B, 0.002, f * 3); osc('square', f * 2.2, t + 0.08, 0.05, 0.025 * v, B, 0.002, f * 3.3); }
      else { const o = osc('sawtooth', f * 0.3, t, 0.5 * Math.sqrt(k), 0.08 * v, B, 0.05, f * 0.18, 0.4); void o; noise(t, 0.45 * Math.sqrt(k), 0.06 * v, f * 0.8, 3, 'bandpass', B, 0.05, f * 0.4, 0.3); }
      break;
    }
    case 'roar': osc('sawtooth', 70, t, 1.4, 0.22 * v, B, 0.08, 45, 0.7); noise(t, 1.3, 0.16 * v, 500, 2, 'bandpass', B, 0.06, 180, 0.7); osc('square', 140, t, 1.0, 0.05 * v, B, 0.1, 90, 0.5); break;
    case 'qte-good': osc('square', 880, t, 0.08, 0.08 * v, B, 0.002); osc('square', 1320, t + 0.06, 0.12, 0.07 * v, B, 0.002); break;
    case 'qte-bad': osc('square', 220, t, 0.18, 0.08 * v, B, 0.002, 150); break;
    case 'qte-tick': osc('square', 1760, t, 0.02, 0.03 * v, B); break;
    case 'spawn-alarm': for (let i = 0; i < 3; i++) osc('square', 520, t + i * 0.22, 0.12, 0.06 * v, B); break;
  }
}

/** the researcher's voice: an 8-bit murmur that follows the syllables of the line */
export function voice(text: string, pitch = 1) {
  if (!ctx || ctx.state !== 'running') return 0;
  const t0 = now();
  let t = t0;
  const words = text.split(/\s+/).slice(0, 40);
  for (const w of words) {
    const syl = Math.max(1, Math.round(w.replace(/[^aeiouy]/gi, '').length * 0.8));
    for (let s = 0; s < syl; s++) {
      const f = (150 + Math.random() * 60) * pitch * (w.endsWith('?') && s === syl - 1 ? 1.3 : 1);
      osc('square', f, t, 0.06, 0.035, sfxBus, 0.004, f * (0.85 + Math.random() * 0.3));
      osc('triangle', f * 2, t, 0.05, 0.015, sfxBus, 0.004);
      t += 0.075 + Math.random() * 0.03;
    }
    t += /[.,!?]$/.test(w) ? 0.16 : 0.05;
  }
  return t - t0;
}

// ------------------------------------------------------------------ ambience + music
let windG: GainNode | null = null, nightK = 0;
function startAmbience() {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 260; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
  windG = ctx.createGain(); windG.gain.value = 0.05;
  s.connect(f); f.connect(windG); windG.connect(ambBus); s.start();
  scheduleMusic();
}
export function setNight(k: number) { nightK = k; if (windG) windG.gain.value = 0.035 + k * 0.03; }

// slow pad chords in an alien mode, a sparse plucked motif, re-planned every bar
const MODES = [[0, 2, 3, 7, 8, 10], [0, 1, 5, 7, 8], [0, 3, 5, 6, 10]];
let mood = 0, musicT = 0;
export function setMood(m: number) { mood = m; }
function scheduleMusic() {
  if (!ctx) return;
  const t = Math.max(now() + 0.1, musicT);
  const mode = MODES[mood % MODES.length], root = 45 + [0, 3, -2, 5][Math.floor(Math.random() * 4)];
  const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
  const bar = 6.4;
  // pad
  const chord = [0, 2, 4].map((k) => root + mode[(k + Math.floor(Math.random() * 2)) % mode.length] + (k === 2 ? 12 : 0));
  for (const n of chord) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = midi(n); o2.frequency.value = midi(n) * 1.004;
    fl.type = 'lowpass'; fl.frequency.value = 700 - nightK * 250; fl.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 2.2); g.gain.linearRampToValueAtTime(0.0001, t + bar + 1.5);
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(musicBus); const w = ctx.createGain(); w.gain.value = 0.6; g.connect(w); w.connect(verbIn);
    o.start(t); o2.start(t); o.stop(t + bar + 1.6); o2.stop(t + bar + 1.6);
  }
  // sparse motif
  if (Math.random() < 0.7) for (let i = 0; i < 4; i++) {
    if (Math.random() < 0.4) continue;
    const n = root + 24 + mode[Math.floor(Math.random() * mode.length)];
    osc('triangle', midi(n), t + 0.8 + i * 1.4 + Math.random() * 0.2, 1.2, 0.025, musicBus, 0.01, undefined, 0.8);
  }
  musicT = t + bar;
  setTimeout(scheduleMusic, Math.max(500, (musicT - now() - 1) * 1000));
}

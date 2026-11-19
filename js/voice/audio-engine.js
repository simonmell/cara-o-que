// Web Audio setup: voice and music buses, the AudioWorklet voice, a simple fallback voice, melody
// guide and beat.

import { S, toast } from '../state.js';
import { t } from '../i18n/language.js';
import { VOWELS } from '../logic/common.js';
import { decodeConsSamples } from './consonant-samples.js';

// ---------------- Audio ----------------
export let ctx = null, master = null, voiceBus = null, musicBus = null, voice = null, formantVoice = null, cantorVoice = null;
// The parametric voice is the karaoke's voice; the simple formant voice only plays if the browser does not support AudioWorklet.
export const pickVoice = () => cantorVoice || formantVoice;
// "soprano": vowels measured by Barrientos and Cataldo (2021) on high notes, with their 4.5 Hz vibrato
// Recorded consonants: "auto" picks the female voice with a small vocal tract or soprano vowels, the male voice otherwise
export const consSet = () => {
  const c = S.settings.consSrc;
  if (c === 'synth') return '';
  if (c === 'f' || c === 'm') return c;
  return S.settings.tract === '0.44' || S.settings.vowels === 'soprano' ? 'f' : 'm';
};
// In English, vowels from Hillenbrand et al. (1995): women's if the soprano voice was chosen, men's otherwise
export const vowelSet = () => (S.song?.isEn ? (S.settings.vowels === 'soprano' ? 'en_w' : 'en_m') : S.settings.vowels);
export const voiceSettings = () => ({ tension: S.settings.tension, breath: S.settings.breath, S: Number(S.settings.tract), rough: 0.03, vibrato: 0.006,
  vset: vowelSet(), vibRate: S.settings.vowels === 'soprano' ? 4.5 : 5.3, smpSet: consSet() });
// Recorded consonants (data/consonant-samples.json): downloaded when the audio is turned on, decoded and
// sent once to the AudioWorklet
export const SAMPLES_URL = new URL('../../data/consonant-samples.json', import.meta.url);
// Downloads and decodes the recorded consonants; if they are missing, null (synthesis is used instead).
export function loadConsSamples() {
  return fetch(SAMPLES_URL).then((r) => r.json()).then(decodeConsSamples)
    .catch((e) => { console.warn('No recorded consonants', e); return null; });
}
// Creates the audio the first time (it must follow a user gesture): compressor, voice and music buses, the fallback
// voice and, in parallel, the Cantor voice in the AudioWorklet with its recorded consonants (when ready, it replaces the fallback).
export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(ctx.destination);
  // two buses with their own volume: the synthesized voice and the music (melody guide and beat; the backing track goes through <audio>)
  voiceBus = ctx.createGain(); voiceBus.gain.value = S.voiceOn ? S.settings.voiceVol : 0; voiceBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = S.settings.musicVol; musicBus.connect(master);
  formantVoice = new FormantVoice(ctx, voiceBus);
  voice = pickVoice();
  const samples = loadConsSamples();            // the download starts right away, in parallel with the AudioWorklet
  CantorVoice.create(ctx, voiceBus).then((cv) => {
    cantorVoice = cv;
    samples.then((smp) => { if (smp) cv.node.port.postMessage({ type: 'samples', fs: smp.fs, sets: smp.sets }, smp.transfer); });
    cv.setVoice(voiceSettings());
    const prev = voice;
    voice = pickVoice();
    if (prev && prev !== voice) prev.silence();
  }).catch((e) => {
    console.warn('Parametric voice not available', e);
    toast(t('noWorklet'));
  });
}

// Cantor Digitalis-style parametric voice with consonants: runs in an AudioWorklet (code in js/voice/cantor-dsp.js).
export class CantorVoice {
  static async create(c, out) {
    // The processor lives in its own file and is loaded as an AudioWorklet module (the page must be served
    // over http: "Open karaoke.bat" starts a local server; the web version is already served over https).
    await c.audioWorklet.addModule(new URL('./cantor-dsp.js', import.meta.url));
    const node = new AudioWorkletNode(c, 'cantor-voice', { numberOfInputs: 0, outputChannelCount: [1] });
    node.connect(out);
    return new CantorVoice(node);
  }
  constructor(node) { this.node = node; }
  // Sends the note, vowel, volume and mouth of this frame to the engine.
  update({ weights, midi, gain, active, effort, mouth }) {
    this.node.port.postMessage({ type: 'params', midi, active: !!active && gain > 0.001, effort: effort ?? 0.8, weights, mouth: mouth || null });
  }
  setVoice(v) { this.node.port.postMessage({ type: 'voice', ...v }); }
  articulate(plan) { this.node.port.postMessage({ type: 'plan', plan }); }
  silence() { this.node.port.postMessage({ type: 'silence' }); }
}

// Simple fallback voice (if the browser does not support AudioWorklet). Approximate Spanish formants (Hz).
export const FORMANTS = {
  a: { f: [800, 1200, 2600, 3500], g: [1, 0.55, 0.16, 0.08] },
  e: { f: [450, 1850, 2600, 3400], g: [1, 0.35, 0.2, 0.1] },
  i: { f: [300, 2250, 3000, 3700], g: [1, 0.25, 0.2, 0.1] },
  o: { f: [480, 850, 2600, 3400], g: [1, 0.45, 0.08, 0.05] },
  u: { f: [330, 720, 2500, 3400], g: [1, 0.25, 0.05, 0.03] },
};
export const BANDWIDTH = [90, 110, 150, 200];
export class FormantVoice {
  // Simple fallback voice: sawtooth with vibrato and five formant filters.
  constructor(c, out) {
    this.c = c;
    this.osc = c.createOscillator(); this.osc.type = 'sawtooth';
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 5.3;
    this.lfoGain = c.createGain(); this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain).connect(this.osc.frequency);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.noise = c.createBufferSource(); this.noise.buffer = nb; this.noise.loop = true;
    const noiseGain = c.createGain(); noiseGain.gain.value = 0.035;
    this.src = c.createGain();
    this.osc.connect(this.src); this.noise.connect(noiseGain).connect(this.src);
    this.tilt = c.createBiquadFilter(); this.tilt.type = 'lowpass'; this.tilt.frequency.value = 4200; this.tilt.Q.value = 0.4;
    this.src.connect(this.tilt);
    this.sum = c.createGain(); this.sum.gain.value = 3.2;
    this.bands = BANDWIDTH.map(() => {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass';
      const g = c.createGain();
      this.tilt.connect(bp).connect(g).connect(this.sum);
      return { bp, g };
    });
    this.amp = c.createGain(); this.amp.gain.value = 0;
    this.sum.connect(this.amp).connect(out);
    this.osc.start(); this.lfo.start(); this.noise.start();
    this.formantShift = 1;
  }
  // Moves the pitch, formants and volume of the fallback voice.
  update({ weights, midi, gain }) {
    const t = this.c.currentTime;
    const f0 = 440 * 2 ** ((midi - 69) / 12);
    this.osc.frequency.setTargetAtTime(f0, t, 0.018);
    this.lfoGain.gain.setTargetAtTime(gain > 0.02 ? f0 * 0.008 : 0, t, 0.25);
    let tot = 0;
    for (const v of VOWELS) tot += weights[v] || 0;
    if (tot < 1e-6) tot = 1;
    for (let k = 0; k < 4; k++) {
      let lf = 0, g = 0;
      for (const v of VOWELS) {
        const w = (weights[v] || 0) / tot;
        lf += w * Math.log(FORMANTS[v].f[k]);
        g += w * FORMANTS[v].g[k];
      }
      const f = Math.exp(lf) * this.formantShift;
      this.bands[k].bp.frequency.setTargetAtTime(f, t, 0.03);
      this.bands[k].bp.Q.setTargetAtTime(f / BANDWIDTH[k], t, 0.03);
      this.bands[k].g.gain.setTargetAtTime(g, t, 0.03);
    }
    this.amp.gain.setTargetAtTime(gain * 0.55, t, 0.035);
  }
  silence() { this.amp.gain.setTargetAtTime(0, this.c.currentTime, 0.04); }
}


// Guide note (soft triangle) played at the start of each note, if the melody guide is on.
export function playGuide(midi, durMs) {
  if (!ctx) return;
  const t = ctx.currentTime, dur = Math.max(0.12, durMs / 1000);
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.03, t + Math.min(0.35, dur));
  g.gain.setTargetAtTime(0, t + dur * 0.9, 0.05);
  o.connect(g).connect(musicBus);
  o.start(t); o.stop(t + dur + 0.4);
}
// Beat click (strong: the first beat of each group of four).
export function playClick(strong) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.frequency.value = strong ? 1500 : 1000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(strong ? 0.12 : 0.07, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.06);
}

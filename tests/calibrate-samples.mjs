// Calibrates the gain of the recorded consonants so they sound at the same level as the synthetic ones (already calibrated
// against the dataset). Measures each consonant before a, i and u, with every fragment, and writes SMP_GAIN into
// js/voice/cantor-dsp.js.
// Usage: node tests/calibrate-samples.mjs
import fs from 'fs';
import { planOnset } from '../js/logic/articulation.js';
import { CantorDSP } from '../js/voice/cantor-dsp.js';
import { loadSamples } from '../tools/load-samples-node.mjs';
const L = { planOnset };
const SMP = loadSamples();
const W = { p: [45, 63], t: [45, 68], k: [45, 77], s: [22, 70], sh: [22, 85], f: [22, 75], x: [22, 75], ch: [31, 70] };
const FS = 48000;
function level(p, v, set, gain, who = set) {
  const d = new CantorDSP(FS);
  d.message({ type: 'voice', S: who === 'f' ? 0.44 : 0.36, smpSet: set || '' });
  if (set) d.message({ type: 'samples', fs: SMP.fs, sets: SMP.sets, gain: { [set]: { [p]: gain } } });
  d.message({ type: 'params', midi: who === 'f' ? 65 : 53, active: true, effort: 0.7, weights: { [v]: 1 } });
  const b = new Float32Array(128), x = [];
  for (let s = 0; s < FS * 0.45; s += 128) { if (s === 9600) d.message({ type: 'plan', plan: L.planOnset([p], 1, { vowel: v }) }); d.render(b); x.push(...b); }
  const rms = (a) => Math.sqrt(a.reduce((m, y) => m + y * y, 0) / a.length);
  const vow = rms(x.slice(4800, 9600)), c = rms(x.slice(9600 + W[p][0] * 48, 9600 + W[p][1] * 48));
  const pk = (a) => a.reduce((m, y) => Math.max(m, Math.abs(y)), 0);
  level.peak = 20 * Math.log10(pk(x.slice(9600 + W[p][0] * 48, 9600 + W[p][1] * 48)) / pk(x.slice(4800, 9600)));
  return 20 * Math.log10(c / vow);
}
const gains = { f: {}, m: {} }, rows = [];
for (const set of ['f', 'm']) for (const p of Object.keys(W)) {
  if (!SMP.sets[set][p]) continue;
  let syn = 0, smp = 0, n = 0, pmax = -99;
  for (const v of ['a', 'i', 'u']) for (let r = 0; r < 6; r++) { syn += level(p, v, '', 1, set); smp += level(p, v, set, 1, set); pmax = Math.max(pmax, level.peak); n++; }
  syn /= n; smp /= n;
  // real bursts are very peaky: besides the mean level, their peak stays at least 8 dB below the vowel's peak
  const g = SMP.sets[set][p].mode === 'shot' ? Math.min(syn - smp, -8 - pmax) : syn - smp;
  gains[set][p] = +Math.pow(10, g / 20).toFixed(4);
  rows.push(`${set} ${p.padEnd(2)} synthetic ${syn.toFixed(1)} dB · recorded, unadjusted ${smp.toFixed(1)} dB (peak ${pmax.toFixed(1)}) → gain ${gains[set][p]}`);
}
console.log(rows.join('\n'));
const dspPath = new URL('../js/voice/cantor-dsp.js', import.meta.url);
const dsp = fs.readFileSync(dspPath, 'utf8').replace(/const SMP_GAIN = \{[^;]*\};/, `const SMP_GAIN = ${JSON.stringify(gains)};`);
fs.writeFileSync(dspPath, dsp);
console.log('SMP_GAIN written to js/voice/cantor-dsp.js');

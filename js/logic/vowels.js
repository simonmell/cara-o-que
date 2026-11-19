// Vowel classifier: compares the 7 mouth features of each frame with a template per vowel
// (default or calibrated) and returns a probability per class.

import { clamp, CLASSES, NEIGHBORS, VOWELS } from './common.js';

// Features: [opening, width, jawOpen, funnel, pucker, smile, stretch]; opening and width normalized by the face width.
export const DEFAULT_TEMPLATES = {
  rest: [0.02, 0.95, 0.03, 0.02, 0.05, 0.05, 0.05],
  a:    [0.70, 0.98, 0.45, 0.05, 0.02, 0.05, 0.05],
  e:    [0.35, 1.08, 0.20, 0.03, 0.00, 0.25, 0.15],
  i:    [0.15, 1.12, 0.08, 0.02, 0.00, 0.40, 0.25],
  o:    [0.50, 0.80, 0.30, 0.35, 0.25, 0.00, 0.00],
  u:    [0.15, 0.68, 0.08, 0.25, 0.60, 0.00, 0.00],
};
export const DEFAULT_SIGMA = [0.15, 0.08, 0.12, 0.12, 0.15, 0.12, 0.12];
// Uncalibrated vowel model: the factory averages.
export function defaultModel() {
  return { templates: structuredClone(DEFAULT_TEMPLATES), sigma: DEFAULT_SIGMA.slice(), calibrated: [] };
}
// Fits the model with the calibration samples: template (average) of each vowel and, with 4 or more calibrated,
// the spread of each feature.
export function fitModel(samples, base = defaultModel()) {
  const model = { templates: structuredClone(base.templates), sigma: base.sigma.slice(), calibrated: [] };
  const D = DEFAULT_SIGMA.length;
  const within = new Array(D).fill(0);
  let count = 0;
  for (const c of CLASSES) {
    const xs = samples[c];
    if (!xs || xs.length < 3) continue;
    const mu = new Array(D).fill(0);
    for (const x of xs) for (let d = 0; d < D; d++) mu[d] += x[d] / xs.length;
    for (const x of xs) for (let d = 0; d < D; d++) within[d] += (x[d] - mu[d]) ** 2;
    count += xs.length;
    model.templates[c] = mu;
    model.calibrated.push(c);
  }
  if (model.calibrated.length >= 4) {             // with few calibrated classes the default spread is kept
    for (let d = 0; d < D; d++) {
      const sd = Math.sqrt(within[d] / count);
      model.sigma[d] = Math.max(DEFAULT_SIGMA[d] * 0.5, sd * 2);
    }
  }
  return model;
}
// Probability of each vowel (and of rest) for the face features f: distance to each template and softmax.
export function classify(f, model, temperature = 1.5) {
  const d = CLASSES.map((c) => {
    const mu = model.templates[c];
    let s = 0;
    for (let k = 0; k < f.length; k++) { const z = (f[k] - mu[k]) / model.sigma[k]; s += z * z; }
    return s;
  });
  const min = Math.min(...d);
  const e = d.map((x) => Math.exp(-0.5 * (x - min) / temperature));
  const sum = e.reduce((a, b) => a + b, 0);
  const out = {};
  CLASSES.forEach((c, i) => { out[c] = e[i] / sum; });
  return out;
}
// Probability of the expected vowel, given that the mouth is active.
export function expectedVowelScore(probs, expected, tolerance) {
  const voiced = VOWELS.reduce((s, v) => s + probs[v], 0);
  if (voiced <= 1e-6) return 0;
  if (!expected) return 1;
  const p = (v) => probs[v] / voiced;
  let s = p(expected);
  const nb = NEIGHBORS[expected] || [];
  if (tolerance === 'media') s += 0.5 * nb.reduce((a, v) => a + p(v), 0);
  if (tolerance === 'amplia') s += nb.reduce((a, v) => a + p(v), 0);
  return clamp(s, 0, 1);
}

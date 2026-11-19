// Consonants: from a written syllable to its phonemes (onset, nucleus, coda), the rules of Rioplatense Spanish,
// and the «plans» that tell the voice engine how to move each parameter over time to sound like that consonant.
// Includes the mouth-gesture detector (close and open) that fires the consonants in levels 3 and 4.
// No DOM: also used from Node (tests, render and measurement tools).

import { clamp, VOWELS } from './common.js';

// ---------- Articulation: syllable → phonemes → consonant plan (no DOM, tested with Node) ----------
// Consonant classes (Rioplatense Spanish: «ll» and consonantal «y» are pronounced [ʃ]; c/z/s are pronounced [s]).
export const PHONES = {
  p: { cls: 'stop', voiced: false, place: 'lab' }, t: { cls: 'stop', voiced: false, place: 'den' }, k: { cls: 'stop', voiced: false, place: 'vel' },
  b: { cls: 'stop', voiced: true, place: 'lab' }, d: { cls: 'stop', voiced: true, place: 'den' }, g: { cls: 'stop', voiced: true, place: 'vel' },
  f: { cls: 'fric', place: 'lab' }, s: { cls: 'fric', place: 'alv' }, sh: { cls: 'fric', place: 'pal' }, x: { cls: 'fric', place: 'vel' },
  ch: { cls: 'affr', place: 'pal' },
  m: { cls: 'nasal', place: 'lab' }, n: { cls: 'nasal', place: 'alv' }, ñ: { cls: 'nasal', place: 'pal' },
  l: { cls: 'liquid', place: 'alv' }, r: { cls: 'tap', place: 'alv' }, rr: { cls: 'trill', place: 'alv' },
  j: { cls: 'glide', place: 'pal' }, w: { cls: 'glide', place: 'lab' },
  B: { cls: 'approx', place: 'lab' }, D: { cls: 'approx', place: 'den' }, G: { cls: 'approx', place: 'vel' },   // [β ð ɣ]
  // English (songs with #LANGUAGE:English). base = consonant whose recorded fragment is used; noise = noise recipe.
  'pʰ': { cls: 'stop', voiced: false, place: 'lab', asp: true, base: 'p' }, 'tʰ': { cls: 'stop', voiced: false, place: 'alv', asp: true, base: 't' },
  'kʰ': { cls: 'stop', voiced: false, place: 'vel', asp: true, base: 'k' },
  'θ': { cls: 'fric', place: 'den', noise: 'th' },
  v: { cls: 'fric', place: 'lab', voiced: true, base: 'f', noise: 'f' }, z: { cls: 'fric', place: 'alv', voiced: true, base: 's', noise: 's' },
  'ʒ': { cls: 'fric', place: 'pal', voiced: true, base: 'sh', noise: 'sh' },
  'dʒ': { cls: 'affr', place: 'pal', voiced: true, base: 'ch' },
  h: { cls: 'h', place: 'glot' },
  'ŋ': { cls: 'nasal', place: 'vel' },
  'ɹ': { cls: 'rhotic', place: 'alv' },
  'ɫ': { cls: 'liquid', place: 'alv', dark: true },
};
export const VOW = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };
// Is it a vowel (with or without an accent)?
export const isV = (c) => c in VOW;

// Graphemes → phonemes of a word. Vowels stay as {v, acc}; consonants as {p}.
export function wordPhones(w) {
  const out = [];
  if (w === 'y') return [{ v: 'i', acc: false, glideY: true }];        // the conjunction «y»
  for (let i = 0; i < w.length; i++) {
    const c = w[i], n = w[i + 1], nn = w[i + 2];
    if (c === 'c' && n === 'h') { out.push({ p: 'ch' }); i++; continue; }
    if (c === 'l' && n === 'l') { out.push({ p: 'sh' }); i++; continue; }
    if (c === 'r' && n === 'r') { out.push({ p: 'rr' }); i++; continue; }
    if ((c === 'q' || c === 'g') && n === 'u' && nn && 'eiéí'.includes(nn)) { out.push({ p: c === 'q' ? 'k' : 'g' }); i++; continue; }
    if (isV(c)) { out.push({ v: VOW[c], acc: 'áéíóú'.includes(c) }); continue; }
    if (c === 'y') { if (n && isV(n)) out.push({ p: 'sh' }); else out.push({ v: 'i', acc: false }); continue; }
    if (c === 'c') { out.push({ p: n && 'eiéí'.includes(n) ? 's' : 'k' }); continue; }
    if (c === 'g') { out.push({ p: n && 'eiéí'.includes(n) ? 'x' : 'g' }); continue; }
    if (c === 'q') { out.push({ p: 'k' }); continue; }
    if (c === 'j') { out.push({ p: 'x' }); continue; }
    if (c === 'z') { out.push({ p: 's' }); continue; }
    if (c === 'v') { out.push({ p: 'b' }); continue; }
    if (c === 'w') { out.push({ v: 'u', acc: false }); continue; }
    if (c === 'x') { out.push({ p: 'k' }, { p: 's' }); continue; }
    if (c === 'h') continue;                                          // h muda
    if (c === 'ñ') { out.push({ p: 'ñ' }); continue; }
    if ('ptkbdfslmnr'.includes(c)) { out.push({ p: c }); continue; }
  }
  return out;
}

// Splits an UltraStar syllable into onset, vowel nucleus and coda.
// wordStart: the syllable starts a word (for word-initial «r», which is a trill).
export function splitSyllable(text, { prev = null, wordStart = false } = {}) {
  const raw = String(text).toLowerCase();
  const words = raw.replace(/[^a-záéíóúüñ\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return { onset: [], nucleus: prev, coda: [], cont: raw.includes('~') };
  const ph = [];
  words.forEach((w) => ph.push(...wordPhones(w)));
  const vIdx = ph.map((x, i) => (x.v ? i : -1)).filter((i) => i >= 0);
  if (!vIdx.length) {
    const cons = ph.map((x) => x.p);
    return { onset: cons, nucleus: null, coda: [], cont: false };
  }
  let ni = vIdx.find((i) => ph[i].acc);
  if (ni == null) ni = vIdx.find((i) => 'aeo'.includes(ph[i].v));
  if (ni == null) ni = vIdx[vIdx.length - 1];
  const onset = [], coda = [];
  ph.slice(0, ni).forEach((x) => onset.push(x.v ? (x.v === 'u' ? 'w' : x.v === 'i' ? 'j' : null) : x.p));
  ph.slice(ni + 1).forEach((x) => {
    if (x.p) coda.push(x.p);
    else if (x.v === 'i' || x.v === 'u') coda.push(x.v === 'i' ? 'j' : 'w');   // diptongo decreciente (oy, au)
  });
  const on = onset.filter(Boolean);
  if (on[0] === 'r' && wordStart) on[0] = 'rr';
  return { onset: on, nucleus: ph[ni].v, coda: coda.filter((c) => c !== 'd'), cont: false };   // final -d is barely pronounced
}

// ---------- Consonant plans: tracks [[ms, value], ...] executed by the voice engine ----------
// ag: multiplies the person's voice · vf: the consonant's own minimum voicing · oral: 1 open, 0 closed
// fric: noise envelope · fricF/fricB, fb and f2–f5: spectral noise recipe (own filter and vocal-tract formants)
// asp: aspiration · lmix + F1L/F2L/F3L: formant locus · nasal + FNZ: nasalization · f0d: microprosody (semitones)
// F2L or fricF at −1 = «velar»: the engine computes them from the following vowel.
// lk + lc: locus equation (F2 = lk · vowel F2 + lc); when present, they replace F2L.
export const LOCUS = {
  lab: [280, 900, 2200], den: [280, 1650, 2650], alv: [300, 1700, 2700], pal: [280, 2100, 2900], vel: [280, -1, -1],
};
// Spectral noise recipes: [fricF, fricB, fb, f2, f3, f4, f5] and gain (calibrated relative to the vowel /a/).
// Labial: diffuse and low · dental: diffuse and high · velar: compact near the vowel's F2/F3 (changes with the vowel).
export const NOISE = {
  burst_lab: { r: [1100, 2400, 1, 0.3, 0, 0, 0], g: 0.16 },
  burst_den: { r: [4000, 3000, 0.8, 0, 0.2, 0.6, 0.6], g: 0.19 },
  burst_vel: { r: [-1, 900, 0.4, 0.9, 0.6, 0, 0], g: 0.35 },
  s: { r: [6300, 2600, 1, 0, 0, 0.2, 0.5], g: 0.155 },
  sh: { r: [3400, 1800, 0.6, 0, 0.8, 0.5, 0.2], g: 0.15 },
  f: { r: [3800, 6000, 1, 0, 0, 0, 0], g: 0.04 },
  x: { r: [-1, 900, 0.5, 0.8, 0.4, 0, 0], g: 0.095 },
  dh: { r: [4500, 4000, 1, 0, 0, 0, 0], g: 0.012 },
  th: { r: [5500, 5000, 1, 0, 0, 0.1, 0.2], g: 0.035 },   // English [θ]: diffuse, weak and high
};
// Spanish locus equations (Martínez Celdrán and Villalba, «Las ecuaciones de locus y el punto de articulación en
// español», Estudios de Fonética Experimental, Universitat de Barcelona; mean of 10 speakers, table 1):
// F2 at vowel onset = k · vowel F2 + c. So /d/ starts differently before /a/, /i/ or /u/, as in real speech.
// Labial k 0.83 c 126 Hz · dental 0.58 / 746 Hz · velar 1.00 / 29 Hz (the velar adapts to the vowel). They are also used
// for fricatives and nasals at the same place. The engine scales c with the vocal-tract size.
export const LOCUS_EQ = { lab: [0.83, 126], den: [0.58, 746], alv: [0.58, 746], vel: [1.0, 29] };
// Our own measurements in Rioplatense Spanish (OpenSLR 61, 8 speakers, 1360 consonant-vowel pairs aligned with MFA;
// average of men and women). They replace the ones above where available; tools/measure-dataset documents how they were made.
export const LOCUS_EQ_AR = {
  lab: [0.85, 90], den: [0.66, 570], alv: [0.62, 700], vel: [1.0, 0], pal: [0.63, 790],
  m: [0.55, 550], n: [0.54, 820], s: [0.75, 480], f: [0.72, 280], l: [0.67, 645], r: [0.49, 890], rr: [0.49, 890],
};
export const VOT = { lab: 8, den: 13, vel: 22 };
export const VOT_EN = { lab: 55, alv: 65, vel: 70 };   // English aspirated p t k (long VOT, typical values from the literature)   // short Spanish VOT, grows towards the back (measured: p ≈ 5, t ≈ 12, k ≈ 15–25 ms)
export const FRIC_DUR = { s: 80, sh: 95, f: 85, x: 85, 'θ': 80, v: 65, z: 75, 'ʒ': 80 };   // medians from the Rioplatense dataset: s 80, ʃ 100, f 90, x 90 ms
export const NASAL = { m: [1100, 2300, 900], n: [1700, 2700, 1600], ñ: [2200, 2900, 2100], 'ŋ': [1600, 2400, 3000] };             // [F2, F3, antiformante]
export const APPROX = { lab: [340, 1000, 2300], den: [340, 1600, 2600], vel: [340, -1, -1] };

// Empty segment of a consonant plan: parameter tracks, vowel onset (R), end and recorded fragments.
export function seg() { return { tracks: {}, R: 0, end: 0, smp: [] }; }
// Recorded consonant (if the engine has fragments of that consonant): «loop» = noise texture repeated under the
// fric envelope (fricatives); «shot» = burst played once from t0 (p t k). Without fragments, the synthesis plays.
export function sample(s, p, mode, t0, t1, k = 1) { s.smp.push({ p, mode, t0, t1, k }); }
// Segment-building helpers: one point (t, v) in a track, several points, and a phoneme's fragment key and noise key.
export function key(s, name, t, v) { (s.tracks[name] ||= []).push([t, v]); s.end = Math.max(s.end, t); }
export function keys(s, name, list) { for (const [t, v] of list) key(s, name, t, v); }
export const smpKey = (p) => (PHONES[p] && PHONES[p].base) || p;
export const noiseKey = (p) => (PHONES[p] && PHONES[p].noise) || p;
// Loads the measured noise recipe into the segment (frequency, bandwidth and noise formants).
export function recipe(s, name) {
  const [F, B, fb, f2, f3, f4, f5] = NOISE[name].r;
  key(s, 'fricF', 0, F); key(s, 'fricB', 0, B); key(s, 'fb', 0, fb);
  key(s, 'f2', 0, f2); key(s, 'f3', 0, f3); key(s, 'f4', 0, f4); key(s, 'f5', 0, f5);
  return NOISE[name].g;
}
// Formant transition with a fast departure and a slow arrival at the vowel (more natural than a linear ramp).
export function transition(s, L, s0, hold, d, place, p) {
  keys(s, 'lmix', [[0, s0], [hold, s0], [hold + 0.3 * d, 0.4 * s0], [hold + d, 0]]);
  key(s, 'F1L', 0, L[0]); key(s, 'F2L', 0, L[1]); key(s, 'F3L', 0, L[2]);
  locEq(s, place, p);
}
// Locus F2 for the following vowel (locus equation): first the measurement for that phoneme, then the one for its place
export function locEq(s, place, p) {
  const eq = LOCUS_EQ_AR[p] || LOCUS_EQ_AR[place] || LOCUS_EQ[place];
  if (eq) { key(s, 'lk', 0, eq[0]); key(s, 'lc', 0, eq[1]); }
}
// Microprosody: the pitch deviates st semitones until t0 and returns to the note in d ms.
export function micro(s, t0, st, d) { keys(s, 'f0d', [[0, 0], [t0, st], [t0 + d, 0]]); }

// One onset phoneme. R = moment the vowel starts (ms after the trigger).
export function phoneSegment(p, s = 1) {
  const info = PHONES[p];
  const sg = seg();
  if (!info) return sg;
  if (info.cls === 'stop' && !info.voiced) {          // p t k: closure, burst, VOT by place, transition
    const C = 45, V = info.asp ? VOT_EN[info.place] : VOT[info.place], R = C + V;
    const bp = info.place === 'alv' ? 'den' : info.place, g = recipe(sg, 'burst_' + bp) * s;
    keys(sg, 'ag', [[0, 1], [10, 1 - s], [R - 4, 1 - s], [R + 4, 0.45], [R + 16, 1]]);
    if (info.asp) {                                    // aspiration: breath going through the tract during the whole VOT
      keys(sg, 'fric', [[0, 0], [C, 0], [C + 1, g], [C + 6, 0.3 * g], [C + 15, 0.1 * g], [C + 25, 0]]);
      keys(sg, 'asp', [[0, 0], [C + 4, 0], [C + 10, 0.85 * s], [R - 12, 0.6 * s], [R + 3, 0]]);
    } else {
      keys(sg, 'fric', [[0, 0], [C, 0], [C + 1, g], [C + 6, 0.35 * g], [R, 0.12 * g], [R + 5, 0]]);
      keys(sg, 'asp', [[0, 0], [C + 4, 0], [C + 8, 0.3 * s], [R + 3, 0]]);
    }
    transition(sg, [420, LOCUS[bp][1], LOCUS[bp][2]], s, R, 45, info.place, p);
    micro(sg, R, 0.7 * s, 80);
    sample(sg, smpKey(p), 'shot', C, info.asp ? C + 30 : R + 30);
    sg.R = R;
  } else if (info.cls === 'stop') {                    // b d g after a pause or a nasal: voiced closure and soft burst
    const C = 35, R = C + 3, g = 0.4 * recipe(sg, 'burst_' + info.place) * s;
    keys(sg, 'ag', [[0, 1], [10, 1 - 0.97 * s], [C, 1 - 0.97 * s], [C + 4, 0.5], [C + 14, 1]]);
    keys(sg, 'vf', [[0, 0], [10, 0.03 * s], [C, 0.03 * s], [C + 10, 0]]);
    keys(sg, 'oral', [[0, 1], [10, 1 - s], [C, 1 - s], [C + 15, 1]]);
    keys(sg, 'fric', [[0, 0], [C, 0], [C + 1, g], [C + 6, 0]]);
    transition(sg, LOCUS[info.place], s, R, 45, info.place, p);
    micro(sg, 10, -0.5 * s, C + 30);
    sg.R = R;
  } else if (info.cls === 'approx') {                  // [β ð ɣ] between vowels: narrowing without closure or burst
    const D = 50;
    keys(sg, 'ag', [[0, 1], [12, 1 - 0.1 * s], [D - 5, 1 - 0.1 * s], [D + 15, 1]]);
    keys(sg, 'vf', [[0, 0], [15, 0.4 * s], [D, 0.4 * s], [D + 15, 0]]);
    keys(sg, 'oral', [[0, 1], [12, 1 - 0.15 * s], [D, 1 - 0.15 * s], [D + 15, 1]]);
    if (info.place === 'den') { const g = recipe(sg, 'dh') * s; keys(sg, 'fric', [[0, 0], [12, g], [D - 5, g], [D + 5, 0]]); }
    transition(sg, APPROX[info.place], 0.65 * s, D, 45, info.place, p);
    micro(sg, 12, -0.3 * s, D + 20);
    sg.R = D;
  } else if (info.cls === 'fric') {                    // f s ʃ x: the voice fades out and the noise builds up gradually
    const D = FRIC_DUR[p], vz = info.voiced ? 0.55 : 1, g = recipe(sg, noiseKey(p)) * s * vz;
    if (info.voiced) {                                 // v z ʒ: the voice continues (weaker) under the noise
      keys(sg, 'ag', [[0, 1], [12, 1 - 0.6 * s], [D - 8, 1 - 0.6 * s], [D + 8, 1]]);
      keys(sg, 'vf', [[0, 0], [12, 0.35 * s], [D - 8, 0.35 * s], [D + 10, 0]]);
    } else keys(sg, 'ag', [[0, 1], [12, 1 - s], [D - 8, 1 - s], [D + 8, 1]]);
    keys(sg, 'fric', [[0, 0], [8, 0.35 * g], [20, g], [D - 12, g], [D - 2, 0.4 * g], [D + 6, 0]]);
    transition(sg, LOCUS[info.place], s, D, 40, info.place, p);
    micro(sg, D, 0.5 * s, 70);
    sample(sg, smpKey(p), 'loop', 0, D + 6, vz);
    sg.R = D;
  } else if (info.cls === 'affr') {                    // ch: short closure, burst and [ʃ] friction
    const C = 30, D = info.voiced ? 35 : 45, R = C + D, vz = info.voiced ? 0.55 : 1, g = recipe(sg, 'sh') * s * vz;
    if (info.voiced) {                                 // dʒ: like ch, voiced
      keys(sg, 'ag', [[0, 1], [10, 1 - 0.7 * s], [R - 8, 1 - 0.7 * s], [R + 8, 1]]);
      keys(sg, 'vf', [[0, 0], [10, 0.3 * s], [R - 8, 0.3 * s], [R + 10, 0]]);
    } else keys(sg, 'ag', [[0, 1], [10, 1 - s], [R - 8, 1 - s], [R + 8, 1]]);
    keys(sg, 'fric', [[0, 0], [C, 0], [C + 1, 1.3 * g], [C + 8, g], [R - 10, g], [R - 2, 0.4 * g], [R + 6, 0]]);
    transition(sg, LOCUS.pal, s, R, 40, 'pal', p);
    micro(sg, R, 0.5 * s, 70);
    sample(sg, 'ch', 'loop', C, R + 6, vz);
    sg.R = R;
  } else if (info.cls === 'nasal') {                   // m n ñ: dark nasal murmur and abrupt release
    const D = { m: 60, n: 50, ñ: 80, 'ŋ': 60 }[p], [f2, f3, fz] = NASAL[p];
    keys(sg, 'vf', [[0, 0], [18, 0.5 * s], [D, 0.5 * s], [D + 20, 0]]);
    keys(sg, 'ag', [[0, 1], [10, 1 - 0.5 * s], [D, 1 - 0.5 * s], [D + 12, 1]]);
    keys(sg, 'nasal', [[0, 0], [10, s], [D - 2, s], [D + 22, 0]]);
    keys(sg, 'oral', [[0, 1], [10, 1 - 0.45 * s], [D, 1 - 0.45 * s], [D + 10, 1]]);
    key(sg, 'FNZ', 0, fz);
    keys(sg, 'lmix', [[0, s], [D, s], [D + 12, 0.35 * s], [D + 40, 0]]);
    key(sg, 'F1L', 0, 260); key(sg, 'F2L', 0, f2); key(sg, 'F3L', 0, f3);
    locEq(sg, info.place, p);
    micro(sg, 10, -0.2 * s, D + 20);
    sg.R = D;
  } else if (info.cls === 'liquid') {                  // l: clear (high F2), slight level dip, fast release
    const D = 50;
    keys(sg, 'vf', [[0, 0], [15, 0.5 * s], [D, 0.5 * s], [D + 15, 0]]);
    keys(sg, 'ag', [[0, 1], [10, 1 - 0.1 * s], [D, 1 - 0.1 * s], [D + 10, 1]]);
    keys(sg, 'oral', [[0, 1], [10, 1 - 0.05 * s], [D, 1 - 0.05 * s], [D + 10, 1]]);
    transition(sg, info.dark ? [400, 950, 2700] : [360, 1500, 2900], 0.8 * s, D, 30, info.dark ? 'glot' : 'alv', p);   // dark l does not use a locus equation: fixed, low F2
    sg.R = D;
  } else if (info.cls === 'tap' || info.cls === 'trill') {   // r: one short tongue tap; rr: three taps (~24 ms)
    const taps = info.cls === 'tap' ? [6] : [6, 30, 54];
    const D = info.cls === 'tap' ? 28 : 75;
    keys(sg, 'vf', [[0, 0], [6, 0.45 * s], [9, 0.05 * s], [D - 6, 0.05 * s], [D, 0.45 * s], [D + 15, 0]]);
    key(sg, 'ag', 0, 1); key(sg, 'oral', 0, 1);
    for (const t of taps) {
      keys(sg, 'ag', [[t, 1], [t + 3, 1 - 0.92 * s], [t + 11, 1 - 0.92 * s], [t + 15, 1]]);
      keys(sg, 'oral', [[t, 1], [t + 3, 1 - 0.55 * s], [t + 11, 1 - 0.55 * s], [t + 15, 1]]);
    }
    transition(sg, [380, 1650, 2500], 0.6 * s, D, 30, 'alv', p);
    sg.R = D;
  } else if (info.cls === 'h') {                       // English [h]: voiceless breath shaped like the following vowel
    const D = 70;
    keys(sg, 'ag', [[0, 1], [8, 1 - s], [D - 6, 1 - s], [D + 8, 1]]);
    keys(sg, 'asp', [[0, 0], [8, 0.9 * s], [D - 6, 0.9 * s], [D + 6, 0]]);
    sg.R = D;
  } else if (info.cls === 'rhotic') {                  // English [ɹ]: approximant with a very low F3, no tongue tap
    const D = 55;
    keys(sg, 'vf', [[0, 0], [15, 0.4 * s], [D, 0.4 * s], [D + 20, 0]]);
    keys(sg, 'ag', [[0, 1], [12, 1 - 0.15 * s], [D, 1 - 0.15 * s], [D + 15, 1]]);
    keys(sg, 'lmix', [[0, s], [D, 0.85 * s], [D + 30, 0.3 * s], [D + 70, 0]]);
    key(sg, 'F1L', 0, 400); key(sg, 'F2L', 0, 1150); key(sg, 'F3L', 0, 1650);
    sg.R = D;
  } else if (info.cls === 'glide') {                   // semivowels [j] [w]: formant transition
    const D = 35, front = p === 'j';
    keys(sg, 'vf', [[0, 0], [15, 0.35 * s], [D, 0.35 * s], [D + 20, 0]]);
    keys(sg, 'lmix', [[0, s], [D, 0.8 * s], [D + 25, 0.3 * s], [D + 60, 0]]);
    key(sg, 'F1L', 0, front ? 280 : 300); key(sg, 'F2L', 0, front ? 2200 : 750); key(sg, 'F3L', 0, front ? 2900 : 2300);
    sg.R = D;
  }
  return sg;
}

// Joins the onset phonemes into a single plan. Intermediate phonemes are cut at their R; the last one keeps
// the transition into the vowel. release = when the vowel starts (how far ahead the trigger must fire).
export function planOnset(phones, s = 1, { vowel = null } = {}) {
  const plan = { tracks: {}, dur: 0, release: 0, smp: [] };
  let off = 0;
  phones.forEach((p, idx) => {
    const sg = phoneSegment(p, s);
    const last = idx === phones.length - 1;
    for (const e of sg.smp) {
      if (!last && e.t0 >= sg.R) continue;
      plan.smp.push({ ...e, t0: e.t0 + off, t1: (last ? e.t1 : Math.min(e.t1, sg.R)) + off, v: vowel, s: s * (e.k ?? 1) });
    }
    for (const [name, ks] of Object.entries(sg.tracks)) {
      const list = (plan.tracks[name] ||= []);
      let kept = last ? ks : ks.filter((k) => k[0] <= sg.R);
      if (!last && kept.length && kept[kept.length - 1][0] < sg.R) kept = [...kept, [sg.R, trackValue(ks, sg.R)]];
      for (const [t, v] of kept) list.push([t + off, v]);
    }
    off += sg.R;
    plan.dur = Math.max(plan.dur, off + (last ? sg.end - sg.R : 0));
  });
  for (const list of Object.values(plan.tracks)) list.sort((a, b) => a[0] - b[0]);
  plan.release = off;
  plan.dur += 5;
  return plan;
}
// Value of a point track (t, v) at time t, with linear interpolation.
export function trackValue(ks, t) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (t < b[0]) return b[0] === a[0] ? b[1] : a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
  }
  return ks[ks.length - 1][1];
}
// How far ahead the trigger fires so the vowel lands on the beat: about 50 ms, between 40 and 100 depending on the consonant.
export const onsetLead = (phones) => (phones.length ? clamp(planOnset(phones).release, 40, 100) : 0);

// b d g are stops after a pause (line start or long rest) or after a nasal (and d after l);
// in other contexts they are approximants [β ð ɣ]: «la gallina» → la ɣallina, «comida» → komiða.
export function applyAllophones(items, notes) {
  items.forEach((a, i) => {
    const o = a.onset;
    if (!o.length || !['b', 'd', 'g'].includes(o[0])) return;
    const pause = i === 0 || notes[i - 1].line !== notes[i].line || notes[i].startMs - notes[i - 1].endMs > 400;
    const prev = pause ? null : (items[i - 1].coda.length ? items[i - 1].coda[items[i - 1].coda.length - 1] : 'V');
    const stop = pause || ['m', 'n', 'ñ'].includes(prev) || (o[0] === 'd' && prev === 'l');
    if (!stop) o[0] = o[0].toUpperCase();
  });
  return items;
}

// Coda: the final consonant arrives near the end of the note and is held until it ends (holdMs).
export function planCoda(phones, holdMs, s = 1, { vowel = null } = {}) {
  const p = phones[0], info = PHONES[p];
  const plan = { tracks: {}, dur: 0, release: 0, smp: [] };
  if (!info) return plan;
  const sg = seg(), H = Math.max(45, holdMs), T = 30;
  if (info.cls === 'fric' || info.cls === 'affr') {
    const vz = info.voiced ? 0.55 : 1, g = 0.8 * recipe(sg, info.cls === 'affr' ? 'sh' : noiseKey(p)) * s * vz, E = Math.min(H, T + 60);
    sample(sg, info.cls === 'affr' ? 'ch' : smpKey(p), 'loop', T, E + 20, vz);
    keys(sg, 'ag', [[0, 1], [T, 1], [T + 15, 1 - (info.voiced ? 0.6 : 1) * s], [H, 1 - (info.voiced ? 0.6 : 1) * s], [H + 40, 1]]);
    keys(sg, 'fric', [[0, 0], [T, 0], [T + 8, 0.4 * g], [T + 18, g], [E, g], [E + 20, 0]]);
    keys(sg, 'lmix', [[0, 0], [T, 0], [T + 25, 0.6 * s], [H, 0.6 * s], [H + 30, 0]]);
    const L = LOCUS[info.place] || LOCUS.alv; key(sg, 'F1L', 0, L[0]); key(sg, 'F2L', 0, L[1]); key(sg, 'F3L', 0, L[2]);
    locEq(sg, info.place, p);
  } else if (info.cls === 'nasal') {
    const [f2, f3, fz] = NASAL[p];
    keys(sg, 'nasal', [[0, 0], [T, 0], [T + 20, s], [H, s], [H + 30, 0]]);
    key(sg, 'FNZ', 0, fz);
    keys(sg, 'vf', [[0, 0], [T, 0], [T + 20, 0.4 * s], [H, 0.4 * s], [H + 30, 0]]);
    keys(sg, 'ag', [[0, 1], [T, 1], [T + 20, 1 - 0.6 * s], [H, 1 - 0.6 * s], [H + 30, 1]]);
    keys(sg, 'oral', [[0, 1], [T, 1], [T + 20, 1 - 0.45 * s], [H, 1 - 0.45 * s], [H + 30, 1]]);
    keys(sg, 'lmix', [[0, 0], [T, 0], [T + 25, s], [H, s], [H + 40, 0]]);
    key(sg, 'F1L', 0, 260); key(sg, 'F2L', 0, f2); key(sg, 'F3L', 0, f3);
    locEq(sg, info.place, p);
  } else if (info.cls === 'liquid' || info.cls === 'tap' || info.cls === 'trill' || info.cls === 'glide' || info.cls === 'rhotic') {
    const L = info.cls === 'glide' ? (p === 'j' ? [280, 2200, 2900] : [300, 750, 2300])
      : info.cls === 'rhotic' ? [450, 1200, 1650] : info.dark ? [400, 950, 2700] : info.cls === 'liquid' ? [360, 1500, 2900] : [380, 1650, 2500];
    keys(sg, 'lmix', [[0, 0], [T, 0], [T + 25, 0.9 * s], [H, 0.9 * s], [H + 40, 0]]);
    key(sg, 'F1L', 0, L[0]); key(sg, 'F2L', 0, L[1]); key(sg, 'F3L', 0, L[2]);
    if (info.cls === 'tap' || info.cls === 'trill') {
      keys(sg, 'ag', [[0, 1], [T + 12, 1], [T + 15, 1 - 0.7 * s], [T + 23, 1 - 0.7 * s], [T + 28, 1]]);
      keys(sg, 'oral', [[0, 1], [T + 12, 1], [T + 15, 1 - 0.75 * s], [T + 23, 1 - 0.75 * s], [T + 28, 1]]);
    }
  } else if (info.cls === 'stop') {                    // final stop: closure only, no burst
    keys(sg, 'ag', [[0, 1], [T, 1], [T + 10, 1 - s], [H, 1 - s], [H + 40, 1]]);
  }
  plan.tracks = sg.tracks;
  plan.smp = sg.smp.map((e) => ({ ...e, v: vowel, s: s * (e.k ?? 1) }));
  plan.dur = sg.end + 5;
  return plan;
}

// Syllables without a vowel («mmm»): the voiced consonant is held for the whole note.
export function planHum(phones, holdMs) {
  const sonorant = phones.filter((p) => PHONES[p] && ['nasal', 'liquid'].includes(PHONES[p].cls));
  if (!sonorant.length) return planOnset(phones);
  const p = sonorant[0], H = Math.max(80, holdMs);
  const plan = planCoda([p], H);
  for (const k of plan.tracks.vf || []) if (k[1] > 0) k[1] = 0.7;
  plan.tracks.ag = [[0, 1], [15, 0], [H, 0], [H + 40, 1]];
  return plan;
}

// Mouth deviation from the typical shape of the vowel mix, using the classifier templates.
// Rasgos: 0 apertura, 3 funnel, 4 pucker, 5 sonrisa, 6 estiramiento.
export function mouthDeltas(f, weights, model) {
  if (!f || !model) return null;
  const T = model.templates, r = T.rest;
  const openOf = (x) => (x[0] - r[0]) / Math.max(1e-3, T.a[0] - r[0]);
  const roundOf = (x) => (x[3] + x[4] - r[3] - r[4]) / Math.max(1e-3, T.u[3] + T.u[4] - r[3] - r[4]);
  const spreadOf = (x) => (x[5] + x[6] - r[5] - r[6]) / Math.max(1e-3, T.i[5] + T.i[6] - r[5] - r[6]);
  let tot = 0, eO = 0, eR = 0, eS = 0;
  for (const v of VOWELS) {
    const w = weights[v] || 0;
    tot += w; eO += w * openOf(T[v]); eR += w * roundOf(T[v]); eS += w * spreadOf(T[v]);
  }
  if (tot < 1e-6) return null;
  return {
    dOpen: clamp(openOf(f) - eO / tot, -1, 1),
    dRound: clamp(roundOf(f) - eR / tot, -1, 1),
    dSpread: clamp(spreadOf(f) - eS / tot, -1, 1),
  };
}
// Normalized mouth opening: 0 = rest and 1 = «a», according to the calibrated model.
export const openNorm = (f, model) => (f[0] - model.templates.rest[0]) / Math.max(1e-3, model.templates.a[0] - model.templates.rest[0]);

// Articulation gesture detector: a closure (of lips or jaw) followed by a reopening.
// Returns {t, depth} on reopening; depth = how much the mouth closed relative to the previous opening (0 to 1).
export class ArticulationDetector {
  constructor() { this.reset(); }
  reset() { this.peak = null; this.trough = null; this.closing = false; this.lastT = null; }
  update(t, o) {
    if (o == null || !Number.isFinite(o)) return null;
    if (this.peak == null) { this.peak = o; this.trough = o; this.lastT = t; return null; }
    const dt = Math.max(0, t - this.lastT); this.lastT = t;
    this.peak -= Math.min(this.peak - o, 0.0004 * dt) * (o < this.peak && !this.closing ? 1 : 0);   // the reference decays slowly
    if (o > this.peak && !this.closing) { this.peak = o; this.trough = o; return null; }
    this.trough = Math.min(this.trough, o);
    const dip = this.peak - this.trough;
    if (!this.closing && dip > 0.12) this.closing = true;
    if (this.closing && o - this.trough > 0.08 + 0.3 * dip) {
      const depth = clamp(dip / Math.max(0.3, this.peak), 0, 1);
      this.peak = o; this.trough = o; this.closing = false;
      return { t, depth };
    }
    return null;
  }
  partialDepth() { return this.peak == null ? 0 : clamp((this.peak - this.trough) / Math.max(0.3, this.peak), 0, 1); }
}
// Consonant clarity according to the gesture depth (advanced mode).
export const gestureStrength = (depth) => clamp((depth - 0.12) / 0.45, 0, 1);

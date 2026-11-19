// Parametric voice engine in the style of Cantor Digitalis (Feugère, d'Alessandro, Doval and Perrotin, 2017),
// adapted from the Web Audio implementation by Edward Browncross (github.com/edwardbrowncross/cantor-digitalis,
// ISC license; Copyright (c) 2026 Edward Browncross, full notice in the README), with a consonant branch
// inspired by Digitartic.
// It does not use the DOM. The same file serves two purposes:
//   - in the page, it is loaded as an AudioWorklet module (js/voice/audio-engine.js) and registers the «cantor-voice» processor;
//   - in Node (tests and tools/render.mjs) it is imported and the CantorDSP class is used directly.

// Cantor Digitalis formants (table 3 of the paper, tenor voice). /e/ and /o/ are moved closer to the Spanish means.
const CD_VOWELS = {
  i: { F: [215, 1900, 2630, 3170, 3710], A: [-10, -10, -8, -4, -15], B: [10, 18, 20, 30, 40] },
  e: { F: [430, 1950, 2570, 2980, 3900], A: [-1, -3, -2, -2, -5], B: [10, 15, 20, 30, 40] },
  a: { F: [700, 1200, 2500, 2800, 3600], A: [0, 0, -5, -7, -24], B: [13, 13, 40, 60, 40] },
  o: { F: [470, 800, 2300, 2860, 3900], A: [-5, -1, -10, -6, -28], B: [10, 12, 20, 30, 40] },
  u: { F: [290, 750, 2300, 3080, 3900], A: [-6, -8, -13, -8, -9], B: [10, 10, 20, 30, 40] },
};
// Spanish vowels sung by a lyric soprano: Barrientos Sandoval and Cataldo Ferreira, «Synthesis of Sung
// Spanish Vowels in Lyrical Singing by Sopranos», IEEE Latin America Transactions 19(12), 2021, tables IV and V.
// Each vowel was measured on a single note (a and o on A4, e on E5, i and u on C5). Frequencies are divided by the
// engine's scaling (αS with S = 0.44, «small tract», and K(f0) of the measured note), so with a small tract and on that note
// the original measurements come out. Bandwidths are capped at 600 Hz (the paper gives up to 2153 Hz, which wipes out the
// formant). Amplitudes are not in the paper: Cantor Digitalis's are used.
const ES_SOPRANO = {
  i: { F: [413, 1664, 2393, 3123, 4838], A: CD_VOWELS.i.A, B: [90, 202, 68, 76, 600] },
  e: { F: [828, 1435, 2181, 2813, 5213], A: CD_VOWELS.e.A, B: [195, 357, 146, 59, 600] },
  a: { F: [629, 1015, 2404, 2964, 4690], A: CD_VOWELS.a.A, B: [282, 126, 53, 40, 600] },
  o: { F: [615, 1207, 2511, 2954, 4614], A: CD_VOWELS.o.A, B: [77, 600, 291, 286, 600] },
  u: { F: [406, 854, 2507, 3044, 4765], A: CD_VOWELS.u.A, B: [23, 116, 62, 198, 87] },
};
const ES_SOPRANO_F0 = { a: 435, e: 646, i: 515, o: 435, u: 513 };   // note on which each vowel was measured
// The measurements are from high notes and already include the «aggiustamento» (the vowel opens to sing high): /e/ with an F1 of
// 1091 Hz, /o/ with an F2 above that of /a/. Used as-is on low notes, /e/ sounds like /a/ and /i/ like /e/. That is why the
// «soprano» set goes from the Cantor Digitalis vowels (below 300 Hz, D4) to the soprano's measurements at the
// note where they were taken, and stays with them above it.
const ES_BLEND_LO = 300;
// American English vowels: averages from Hillenbrand, Getty, Clark and Wheeler, «Acoustic characteristics of American
// English vowels», JASA 97(5), 1995 (45 men and 48 women, formants in the steady state; original data at
// github.com/santiagobarreda/hillenbrand_et_al_1995). ARPAbet keys as in the CMU Pronouncing Dictionary; EY and OW are the
// onset of the diphthongs [eɪ] [oʊ] and AX is the unstressed [ə] (not in the study: a central value). F5 = 1.12·F4.
// Amplitudes and bandwidths: those of the closest Cantor Digitalis vowel. a e i o u = aliases for the families that
// the face can form. EN_M (men) is used as-is, like the Cantor Digitalis table; EN_W (women) is divided by
// αS(0.44)·K(220 Hz), so with a small tract the measured values come out, just like the soprano table.
const EN_M = {
  IY: { F: [343, 2323, 3001, 3658, 4097], A: CD_VOWELS.i.A, B: CD_VOWELS.i.B },
  IH: { F: [429, 2034, 2687, 3628, 4063], A: CD_VOWELS.i.A, B: CD_VOWELS.i.B },
  EY: { F: [476, 2090, 2692, 3649, 4087], A: CD_VOWELS.e.A, B: CD_VOWELS.e.B },
  EH: { F: [588, 1803, 2604, 3699, 4143], A: CD_VOWELS.e.A, B: CD_VOWELS.e.B },
  AE: { F: [591, 1930, 2595, 3642, 4079], A: CD_VOWELS.e.A, B: CD_VOWELS.e.B },
  AA: { F: [756, 1309, 2535, 3684, 4126], A: CD_VOWELS.a.A, B: CD_VOWELS.a.B },
  AH: { F: [621, 1181, 2548, 3564, 3992], A: CD_VOWELS.a.A, B: CD_VOWELS.a.B },
  AX: { F: [500, 1450, 2500, 3550, 3976], A: CD_VOWELS.a.A, B: CD_VOWELS.a.B },
  AO: { F: [656, 1023, 2521, 3520, 3942], A: CD_VOWELS.o.A, B: CD_VOWELS.o.B },
  OW: { F: [498, 910, 2459, 3384, 3790], A: CD_VOWELS.o.A, B: CD_VOWELS.o.B },
  UH: { F: [469, 1123, 2435, 3401, 3809], A: CD_VOWELS.u.A, B: CD_VOWELS.u.B },
  UW: { F: [380, 992, 2355, 3378, 3783], A: CD_VOWELS.u.A, B: CD_VOWELS.u.B },
  ER: { F: [475, 1379, 1711, 3335, 3735], A: CD_VOWELS.e.A, B: CD_VOWELS.e.B },
};
const EN_W = {
  IY: { F: [349, 2207, 2696, 3479, 3897], A: CD_VOWELS.i.A, B: CD_VOWELS.i.B },
  IH: { F: [387, 1894, 2444, 3463, 3879], A: CD_VOWELS.i.A, B: CD_VOWELS.i.B },
  EY: { F: [428, 2019, 2438, 3444, 3857], A: CD_VOWELS.e.A, B: CD_VOWELS.e.B },
  EH: { F: [581, 1649, 2360, 3447, 3860], A: CD_VOWELS.e.A, B: CD_VOWELS.e.B },
  AE: { F: [540, 1866, 2376, 3449, 3863], A: CD_VOWELS.e.A, B: CD_VOWELS.e.B },
  AA: { F: [736, 1220, 2264, 3430, 3841], A: CD_VOWELS.a.A, B: CD_VOWELS.a.B },
  AH: { F: [608, 1132, 2319, 3304, 3700], A: CD_VOWELS.a.A, B: CD_VOWELS.a.B },
  AX: { F: [480, 1359, 2318, 3357, 3760], A: CD_VOWELS.a.A, B: CD_VOWELS.a.B },
  AO: { F: [643, 950, 2257, 3154, 3532], A: CD_VOWELS.o.A, B: CD_VOWELS.o.B },
  OW: { F: [444, 828, 2261, 3139, 3516], A: CD_VOWELS.o.A, B: CD_VOWELS.o.B },
  UH: { F: [415, 982, 2262, 3246, 3636], A: CD_VOWELS.u.A, B: CD_VOWELS.u.B },
  UW: { F: [367, 884, 2186, 3290, 3685], A: CD_VOWELS.u.A, B: CD_VOWELS.u.B },
  ER: { F: [419, 1269, 1543, 3129, 3504], A: CD_VOWELS.e.A, B: CD_VOWELS.e.B },
};
// Level: the Cantor Digitalis amplitudes are designed for its own formants (the /i/ with an F1 of 215 Hz, for
// example); with Hillenbrand's, some vowels were up to 7 dB quieter. A per-vowel gain (dB) is added so
// each one sounds at the level of its Spanish counterpart, averaged over each voice's range (men E2–C4, women
// A3–C5, effort 0.7).
const EN_GAIN_DB = {
  en_m: { IY: 4, IH: 2.8, EY: 3.8, EH: 3.6, AE: 3.7, AA: 1.2, AH: -2.3, AX: -4, AO: 1.7, OW: -2.1, UH: 3.3, UW: -0.1, ER: 3.3 },
  en_w: { IY: 0.9, IH: 1.3, EY: 0.2, EH: 2.6, AE: 1.5, AA: 2.4, AH: -0.8, AX: -0.1, AO: 2.5, OW: -1, UH: 3.5, UW: 0.8, ER: 0.6 },
};
for (const [T, G] of [[EN_M, EN_GAIN_DB.en_m], [EN_W, EN_GAIN_DB.en_w]]) for (const k in G) T[k] = { ...T[k], A: T[k].A.map((x) => x + G[k]) };
for (const T of [EN_M, EN_W]) Object.assign(T, { a: T.AA, e: T.EH, i: T.IY, o: T.OW, u: T.UW });
const VOWEL_SETS = { cd: CD_VOWELS, soprano: ES_SOPRANO, en_m: EN_M, en_w: EN_W };
// Recorded consonants: gain of each fragment so it sounds at the same level as the synthetic version
// (calibrated with tests/calibrate-samples.mjs against the same measurement windows).
const SMP_GAIN = {"f":{"p":0.0393,"t":0.0436,"k":0.0547,"s":0.4735,"sh":0.4304,"f":0.4585,"x":0.3587,"ch":0.4197},"m":{"p":0.0432,"t":0.0384,"k":0.0511,"s":0.444,"sh":0.4497,"f":0.4906,"x":0.3482,"ch":0.8224}};
// Formants of vowel v in the given table; soprano vowels are blended with Cantor Digitalis's on low notes.
function vowelAt(table, v, f0) {
  if (table !== ES_SOPRANO) return table[v];
  const w = cdClamp((f0 - ES_BLEND_LO) / (ES_SOPRANO_F0[v] - ES_BLEND_LO), 0, 1);
  if (w <= 0) return CD_VOWELS[v];
  const c = CD_VOWELS[v], s = ES_SOPRANO[v];
  return {
    F: c.F.map((x, k) => Math.exp(Math.log(x) * (1 - w) + Math.log(s.F[k]) * w)),
    A: c.A.map((x, k) => x * (1 - w) + s.A[k] * w),
    B: c.B.map((x, k) => x * (1 - w) + s.B[k] * w),
  };
}
const CD_ETHR = 0.2;   // phonation threshold
const CD_CAG = 0.2;    // amplitude at the threshold
// Neutral values of the articulation tracks (no consonant in progress).
const TRACK_NEUTRAL = {
  ag: 1, vf: 0, oral: 1, fric: 0, fricF: 4000, fricB: 2000, asp: 0,
  lmix: 0, F1L: 300, F2L: 1500, F3L: 2500, nasal: 0, FNZ: 1000, lk: 0, lc: 0,
  fb: 1, f2: 0, f3: 0, f4: 0, f5: 0,   // spectral noise recipe: own filter (fb) and vocal-tract formants F2–F5
  f0d: 0,                              // microprosody: f0 deviation in semitones
};
const cdClamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Glottal source (section 4.2): Oq, αm, glottal formant, amplitude and spectral tilt from f0, effort E and tension T.
function cdSource(f0, E, T) {
  const Oq0 = 0.903 - 0.426 * E;
  const Oq = T <= 0.5 ? Math.pow(10, -2 * (1 - Oq0) * T) : Math.pow(10, 2 * Oq0 * (1 - T) - 1);
  const am = T <= 0.5 ? 0.5 + 2 * (0.66 - 0.5) * T : 0.9 - 2 * (0.9 - 0.66) * (1 - T);
  const tanv = Math.abs(Math.tan(cdClamp(Math.PI * (1 - am), 0.01, Math.PI - 0.01)));
  return {
    Oq, am,
    Fg: f0 / (2 * Oq),
    Bg: f0 / (Oq * tanv),
    Ag: E <= CD_ETHR ? 0 : ((1 - CD_CAG) * (E - CD_ETHR) / (1 - CD_ETHR) + CD_CAG) / Oq,
    Tl1: 27 - 21 * E,
    Tl2: 11 - 11 * E,
  };
}

// Formants F1–F5 (section 4.3): vowel mix according to the mouth, tract size, larynx position,
// F1/F2 tuning to f0 and attenuation when they coincide with harmonics.
// mouth = {dOpen, dRound, dSpread}: how much more open, rounded or spread the mouth is than the typical vowel;
// equivalent to moving the height (H) and frontness (V) axes of the Cantor Digitalis vowel space.
function cdFormants(weights, mouth, f0, E, S, table = CD_VOWELS) {
  // weights over any vowel in the table (a e i o u, or the ARPAbet keys of the English tables)
  let w = weights || { a: 1 };
  let tot = 0;
  for (const v in w) if (table[v]) tot += w[v] || 0;
  if (tot < 1e-6) { w = { a: 1 }; tot = 1; }
  const aS = 1.7 * S + 0.5, K = 1.25e-4 * f0 + 0.975, sc = aS * K;
  const F = [], B = [], A = [];
  for (let k = 0; k < 5; k++) {
    let lf = 0, db = 0, bw = 0;
    for (const v in w) {
      const x = (w[v] || 0) / tot;
      if (!x || !table[v]) continue;
      const tv = vowelAt(table, v, f0);
      lf += x * Math.log(tv.F[k]);
      db += x * tv.A[k];
      bw += x * tv.B[k];
    }
    F.push(Math.exp(lf) * sc); A.push(db); B.push(bw);
  }
  const m = mouth || {};
  const dO = cdClamp(m.dOpen || 0, -1, 1), dR = cdClamp(m.dRound || 0, -1, 1), dS = cdClamp(m.dSpread || 0, -1, 1);
  F[0] *= Math.pow(2, 0.45 * dO);
  F[1] *= Math.pow(2, 0.25 * dS - 0.3 * dR);
  F[2] *= Math.pow(2, -0.12 * dR);
  F[0] = Math.max(f0 + 50, F[0] + (140 / (1 - CD_ETHR)) * E - 70);
  F[1] = Math.max(2 * f0 + 50, F[1]);
  const dF = 15 + 85 * cdClamp((f0 - 50) / 1450, 0, 1);
  for (let k = 0; k < 3; k++) {
    const h = Math.max(1, Math.round(F[k] / f0));
    const d = Math.abs(h * f0 - F[k]);
    if (d < dF) A[k] -= (1 - d / dF) * [10, 15, 25][k];
  }
  return { F, B, A: A.map((db) => Math.pow(10, db / 20)), FBQ: 4700 * aS };
}

// Value of a track [[ms, value], ...] by linear interpolation.
function trackAt(keys, t) {
  if (!keys || !keys.length) return null;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b[0]) return b[0] === a[0] ? b[1] : a[1] + ((b[1] - a[1]) * (t - a[0])) / (b[0] - a[0]);
  }
  return keys[keys.length - 1][1];
}

// Filter coefficients
function resCoef(c, F, B, A, Ts) {       // 2-pole 2-zero resonator (section 3.3.1)
  const R = Math.exp(-Math.PI * B * Ts);
  const g = 1 - R;
  c.b0 = A * g; c.b1 = 0; c.b2 = -A * g * R;
  c.a1 = -2 * R * Math.cos(2 * Math.PI * F * Ts); c.a2 = R * R;
}
function notchCoef(c, F, Q, Ts) {        // biquadratic anti-resonance (section 3.3.2)
  const w = 2 * Math.PI * F * Ts, al = Math.sin(w) / (2 * Q), be = -2 * Math.cos(w), a0 = 1 + al;
  c.b0 = 1 / a0; c.b1 = be / a0; c.b2 = 1 / a0; c.a1 = be / a0; c.a2 = (1 - al) / a0;
}
function lpCoef(c, F, Q, Ts) {           // pasabajos RBJ
  const w = 2 * Math.PI * F * Ts, al = Math.sin(w) / (2 * Q), cw = Math.cos(w), a0 = 1 + al;
  c.b0 = (1 - cw) / 2 / a0; c.b1 = (1 - cw) / a0; c.b2 = (1 - cw) / 2 / a0; c.a1 = (-2 * cw) / a0; c.a2 = (1 - al) / a0;
}
function hpCoef(c, F, Q, Ts) {           // pasaaltos RBJ
  const w = 2 * Math.PI * F * Ts, al = Math.sin(w) / (2 * Q), cw = Math.cos(w), a0 = 1 + al;
  c.b0 = (1 + cw) / 2 / a0; c.b1 = -(1 + cw) / a0; c.b2 = (1 + cw) / 2 / a0; c.a1 = (-2 * cw) / a0; c.a2 = (1 - al) / a0;
}
function tiltCoef(Tl, Ts) {              // spectral tilt stage (section 3.2.2): [pole, gain]
  if (Tl <= 0) return [0, 1];
  const nu = 1 + (1 - Math.cos(2 * Math.PI * 3000 * Ts)) / (Math.pow(10, Tl / 10) - 1);
  const a = nu - Math.sqrt(nu * nu - 1);
  return [a, 1 - a];
}
const mkBiquad = () => ({ b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 });
// One sample through a biquad filter (direct form I).
function bqRun(c, x) {
  const y = c.b0 * x + c.b1 * c.x1 + c.b2 * c.x2 - c.a1 * c.y1 - c.a2 * c.y2;
  c.x2 = c.x1; c.x1 = x; c.y2 = c.y1; c.y1 = y;
  return y;
}

// Voice engine: glottal source, formants, aspiration noise and consonants. Used the same way in the AudioWorklet and in Node.
class CantorDSP {
  constructor(fs) {
    this.fs = fs; this.Ts = 1 / fs;
    this.tgt = { midi: 57, active: false, effort: 0.7, weights: { a: 1 }, mouth: null };
    this.vp = { tension: 0.5, breath: 0.05, S: 0.36, rough: 0.03, vibrato: 0.006, vibRate: 5.3, vset: 'cd', smpSet: '' };
    this.f0 = 220; this.gate = 0; this.E = 0.75; this.held = 0;
    const init = cdFormants({ a: 1 }, null, 220, 0.75, 0.36);
    this.F = init.F.slice(); this.B = init.B.slice(); this.A = init.A.slice(); this.FBQ = init.FBQ;
    this.phase = 0; this.jit = 1; this.shim = 1; this.vibPh = 0; this.N = Math.floor(fs / 2 / 220);
    this.gf = mkBiquad(); this.st1 = 0; this.st2 = 0;
    this.res = Array.from({ length: 6 }, mkBiquad);   // F1–F5 and nasal formant
    this.bq = mkBiquad(); this.nz = mkBiquad(); this.lp1 = mkBiquad(); this.lp2 = mkBiquad();
    this.fr = mkBiquad(); this.frHp = mkBiquad(); this.frLp = mkBiquad();
    this.nres = Array.from({ length: 4 }, mkBiquad);   // F2–F5 excited by the consonant noise (Klatt parallel branch)
    this.nresG = [1, 1, 1, 1];
    this.nhp = mkBiquad(); this.nlp = mkBiquad();
    hpCoef(this.nhp, 1000, Math.SQRT1_2, this.Ts);   // aspiration noise: Butterworth 1–6 kHz (section 3.2.3)
    lpCoef(this.nlp, 6000, Math.SQRT1_2, this.Ts);
    this.dc1 = 0; this.dc2 = 0; this.vfS = 0; this.lmS = 0; this.naS = 0;
    this.hp60 = mkBiquad(); hpCoef(this.hp60, 60, Math.SQRT1_2, this.Ts);   // no thumps below the voice
    this.plan = null; this.planT = 0;
    this.smpSets = null; this.smpFs = 32000; this.smpAct = []; this.smpGain = SMP_GAIN; this.smpXf = Math.round(0.004 * 32000);
    this.spare = null;
    this.outGain = 1.4;
  }
  // Messages from the main thread: params (note, vowel, volume), voice (timbre), samples (recorded consonants),
  // plan (one consonant) and silence.
  message(d) {
    if (!d) return;
    if (d.type === 'params') {
      for (const k of ['midi', 'active', 'effort', 'weights', 'mouth']) if (k in d) this.tgt[k] = d[k];
    } else if (d.type === 'voice') {
      for (const k of ['tension', 'breath', 'S', 'rough', 'vibrato', 'vibRate', 'vset', 'smpSet']) if (k in d) this.vp[k] = d[k];
    } else if (d.type === 'samples') {
      // { fs, sets: { f|m: { s: { mode, tok: [{ v, pcm: Float32Array }] }, ... } }, gain? }
      this.smpFs = d.fs; this.smpSets = d.sets; this.smpXf = Math.round(0.004 * d.fs);
      if (d.gain) this.smpGain = d.gain;
    } else if (d.type === 'plan') {
      this.plan = d.plan; this.planT = 0;
      this.smpAct = this.pickSamples(d.plan);
    } else if (d.type === 'silence') {
      this.tgt.active = false; this.plan = null;
    }
  }
  // Picks a recorded fragment for each consonant in the plan: one with the same following vowel if available, otherwise any
  pickSamples(plan) {
    const set = this.smpSets && this.smpSets[this.vp.smpSet];
    if (!set || !plan || !plan.smp) return [];
    const out = [];
    for (const e of plan.smp) {
      const g = set[e.p];
      if (!g || !g.tok.length) continue;
      const same = g.tok.filter((t) => t.v === e.v), pool = same.length ? same : g.tok;
      const tok = pool[Math.floor(Math.random() * pool.length)];
      const gain = ((this.smpGain[this.vp.smpSet] || {})[e.p] || 1) * (e.s == null ? 1 : e.s);
      out.push({ mode: g.mode, buf: tok.pcm, t0: e.t0, t1: e.t1, pos: 0, gain });
    }
    return out;
  }
  // One sample of the fragment (linear interpolation; the texture loops with a 4 ms crossfade)
  smpRead(a, step) {
    const b = a.buf, L = b.length;
    if (a.pos >= L - 1) { if (a.mode !== 'loop') return 0; a.pos -= L - this.smpXf; }
    const i = a.pos | 0, f = a.pos - i;
    let v = b[i] + (b[i + 1] - b[i]) * f;
    if (a.mode === 'loop' && a.pos >= L - this.smpXf) { const j = a.pos - (L - this.smpXf), k = j | 0; v += b[k] + (b[k + 1] - b[k]) * (j - k); }
    a.pos += step;
    return v;
  }
  // Normally distributed random number (polar method).
  gauss() {
    if (this.spare !== null) { const s = this.spare; this.spare = null; return s; }
    let u, v, s;
    do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * m;
    return u * m;
  }
  // Computes one block of audio (128 samples in the AudioWorklet).
  render(out) {
    const n = out.length, Ts = this.Ts, blockMs = (1000 * n) / this.fs;
    const blk = (tau) => 1 - Math.exp(-blockMs / tau);

    // Articulation tracks at the start, middle and end of the block
    const p = this.plan, t0 = this.planT, t1 = t0 + blockMs, tm = (t0 + t1) / 2;
    const tv = (name, t) => {
      if (!p) return TRACK_NEUTRAL[name];
      const v = trackAt(p.tracks[name], t);
      return v == null ? TRACK_NEUTRAL[name] : v;
    };
    const ag0 = tv('ag', t0), ag1 = tv('ag', t1), vf0 = tv('vf', t0), vf1 = tv('vf', t1);
    const fr0 = tv('fric', t0), fr1 = tv('fric', t1), as0 = tv('asp', t0), as1 = tv('asp', t1);
    const na0 = tv('nasal', t0), na1 = tv('nasal', t1);
    const oral = tv('oral', tm), lmixT = tv('lmix', tm), nasalT = tv('nasal', tm);
    // smoothed locus and nasalization (~6 ms): when a consonant started with the voice sounding, F1 jumped abruptly from the
    // vowel to the locus (from 700 to 260 Hz in one sample) and the resonator let out a low thump, like a bass drum
    this.lmS += (lmixT - this.lmS) * blk(6); this.naS += (nasalT - this.naS) * blk(6);
    const lmix = this.lmS, nasal = this.naS;
    const F1L = tv('F1L', tm), F2L = tv('F2L', tm), F3L = tv('F3L', tm), lk = tv('lk', tm), lc = tv('lc', tm);
    const fricF = tv('fricF', tm), fricB = tv('fricB', tm), FNZ = tv('FNZ', tm);
    const wB = tv('fb', tm), wF = [tv('f2', tm), tv('f3', tm), tv('f4', tm), tv('f5', tm)], f0d = tv('f0d', tm);
    // recorded fragments active in this block
    const sa = this.smpAct, smpStep = this.smpFs / this.fs;
    let loopA = null, shotA = null;
    for (const a of sa) {
      if (a.mode === 'loop' && t1 > a.t0 && t0 < a.t1) loopA = a;
      if (a.mode === 'shot' && t1 > a.t0 && a.pos < a.buf.length - 1) shotA = a;
    }
    if (p) { this.planT = t1; if (t1 > p.dur) { this.plan = null; this.smpAct = []; } }

    // Smoothed high-level parameters
    const f0T = 440 * Math.pow(2, (this.tgt.midi + f0d - 69) / 12);
    const T = cdClamp(this.vp.tension, 0, 1);
    this.E += (0.3 + 0.65 * cdClamp(this.tgt.effort, 0, 1) - this.E) * blk(40);
    const ft = cdFormants(this.tgt.weights, this.tgt.mouth, f0T, this.E, this.vp.S, VOWEL_SETS[this.vp.vset] || CD_VOWELS);
    const kf = blk(18);
    for (let k = 0; k < 5; k++) {
      this.F[k] = Math.exp(Math.log(this.F[k]) + (Math.log(ft.F[k]) - Math.log(this.F[k])) * kf);
      this.B[k] += (ft.B[k] - this.B[k]) * kf;
      this.A[k] += (ft.A[k] - this.A[k]) * kf;
    }
    this.FBQ = ft.FBQ;
    this.held = this.gate > 0.5 ? this.held + blockMs : 0;

    // Effective formants: locus transitions and nasalization of the consonant in progress
    const Fe = this.F.slice(), Ae = this.A.slice(), Be = this.B.slice();
    if (lmix > 1e-4) {
      // Locus F2: locus equation applied to the vowel F2 (c scales with the tract); otherwise fixed or «velar»
      const scl = (1.7 * this.vp.S + 0.5) * (1.25e-4 * this.f0 + 0.975);
      const F2loc = lk > 0 ? lk * this.F[1] + lc * scl : F2L > 0 ? F2L : (Fe[1] < 1400 ? 1300 : Math.min(2400, Fe[1] * 1.1));
      const L = [F1L, F2loc, F3L > 0 ? F3L : Math.max(2200, Fe[1] * 1.15)];
      this.loc = L;   // for testing
      for (let k = 0; k < 3; k++) Fe[k] = Math.exp(Math.log(Fe[k]) + (Math.log(L[k]) - Math.log(Fe[k])) * lmix);
      Be[0] += 40 * lmix; Be[1] += 40 * lmix;   // consonants are damped more than vowels
    }
    // nasal murmur: the mouth is closed, so the oral F1 also fades (otherwise a low F1 + a nasal formant at 250 Hz
    // added up to a rumble almost as loud as the vowel)
    Ae[0] *= 1 - 0.7 * nasal;
    for (let k = 1; k < 5; k++) Ae[k] *= 1 - 0.85 * nasal;
    // During the constriction the voice loses energy and regains it when opening into the vowel. Without this, lowering F1 towards the
    // glottal formant multiplied the level by 2 to 4 on every consonant.
    if (lmix > 1e-4) {
      const r = Math.min(1, Fe[0] / this.F[0]);
      for (let k = 0; k < 5; k++) Ae[k] *= (1 - 0.75 * lmix) * (k === 0 ? r : 1);
    }
    // Minimum bandwidth of 0.4·f0: with the Cantor Digitalis bandwidths (10–60 Hz) the volume depended on whether a
    // harmonic fell exactly on the formant, and every consonant transition produced jumps of up to 10 dB.
    for (let k = 0; k < 5; k++) resCoef(this.res[k], Fe[k], Math.max(Be[k], 0.4 * this.f0), Ae[k], Ts);
    resCoef(this.res[5], 250 * (0.85 + 0.15 * this.vp.S / 0.36), 100, 0.3 * nasal, Ts);
    notchCoef(this.bq, this.FBQ, 2.5, Ts);
    notchCoef(this.nz, FNZ, 1.6, Ts);
    const lpF = Math.min(0.45 * this.fs, 200 * Math.pow(100, cdClamp(oral, 0, 1)));
    lpCoef(this.lp1, lpF, Math.SQRT1_2, Ts); lpCoef(this.lp2, lpF, Math.SQRT1_2, Ts);
    const fF = fricF > 0 ? fricF : cdClamp(Fe[1] * 1.1, 1300, 3000);
    resCoef(this.fr, Math.min(fF, 0.45 * this.fs), Math.max(200, fricB), 1, Ts);
    hpCoef(this.frHp, Math.max(300, fF * 0.45), Math.SQRT1_2, Ts);
    lpCoef(this.frLp, Math.min(0.45 * this.fs, Math.max(3000, fF * 1.8)), Math.SQRT1_2, Ts);   // no hiss above the consonant
    for (let k = 0; k < 4; k++) {                      // the noise power that gets through grows with the bandwidth: it is compensated
      const Bn = Math.max(Be[k + 1], 0.4 * this.f0, 90);
      resCoef(this.nres[k], Fe[k + 1], Bn, 1, Ts);
      this.nresG[k] = wF[k] * Math.sqrt(1500 / Bn);
    }
    const usePar = wF[0] + wF[1] + wF[2] + wF[3] > 1e-4;

    // Glottal source for the block
    const src = cdSource(this.f0, this.E, T);
    const R = Math.exp(-Math.PI * src.Bg * Ts);
    this.gf.a1 = -2 * R * Math.cos(2 * Math.PI * src.Fg * Ts); this.gf.a2 = R * R;
    const [ta1, tg1] = tiltCoef(src.Tl1, Ts), [ta2, tg2] = tiltCoef(src.Tl2, Ts);
    const An = cdClamp(this.vp.breath, 0, 1), rough = cdClamp(this.vp.rough, 0, 1);
    const vibAmt = this.vp.vibrato * Math.min(1, Math.max(0, (this.held - 250) / 400));
    const kF0 = 1 - Math.exp(-Ts / 0.015);
    const gateT = this.tgt.active ? 1 : 0;
    const kAtt = 1 - Math.exp(-Ts / 0.012), kRel = 1 - Math.exp(-Ts / 0.035);
    const kVfA = 1 - Math.exp(-Ts / 0.008), kVfR = 1 - Math.exp(-Ts / 0.015);
    const fricE = 0.5 + 0.5 * this.E;

    for (let i = 0; i < n; i++) {
      const fr = i / n;
      this.f0 += (f0T - this.f0) * kF0;
      this.vibPh += this.vp.vibRate * Ts; if (this.vibPh >= 1) this.vibPh -= 1;
      const f0i = this.f0 * (1 + vibAmt * Math.sin(2 * Math.PI * this.vibPh)) * this.jit;
      this.phase += f0i * Ts;
      if (this.phase >= 1) {                          // new period: jitter and shimmer (sections 4.1.2 and 4.2.4)
        this.phase -= 1;
        this.jit = 1 + cdClamp(this.gauss() * rough * 0.15, -rough * 0.3, rough * 0.3);
        this.shim = Math.max(0, 1 + cdClamp(this.gauss() * rough * 0.5, -rough, rough));
        this.N = Math.max(1, Math.floor(this.fs / 2 / this.f0));
      }
      const th = 2 * Math.PI * this.phase, sh = Math.sin(th / 2);   // band-limited pulse train (Dirichlet kernel)
      const pulse = Math.abs(sh) < 1e-7 ? 1 : (Math.sin((this.N + 0.5) * th) / (2 * sh) - 0.5) / this.N;

      this.gate += (gateT - this.gate) * (gateT > this.gate ? kAtt : kRel);
      // the consonant's own voicing, smoothed: rises in ~8 ms and falls in ~15 ms (a step sounded like a thump)
      const vfT = vf0 + (vf1 - vf0) * fr;
      this.vfS += (vfT - this.vfS) * (vfT > this.vfS ? kVfA : kVfR);
      const amp = Math.max(this.gate * (ag0 + (ag1 - ag0) * fr), this.vfS);
      const Ag = src.Ag * amp * this.shim;
      const g = this.gf;                               // formante glotal: -Ag z^-1 (1 - z^-1) / (1 - 2R cos z^-1 + R² z^-2)
      const gfd = -Ag * g.x1 + Ag * g.x2 - g.a1 * g.y1 - g.a2 * g.y2;
      g.x2 = g.x1; g.x1 = pulse; g.y2 = g.y1; g.y1 = gfd;
      this.st1 = tg1 * gfd + ta1 * this.st1;           // two-stage spectral tilt
      this.st2 = tg2 * this.st1 + ta2 * this.st2;
      const glot = this.st2;

      const nb = bqRun(this.nlp, bqRun(this.nhp, this.gauss()));
      // with the recorded burst playing, the synthetic burst and aspiration are not added
      const tS = t0 + fr * blockMs, shotOn = shotA && tS >= shotA.t0;
      const asp = shotOn ? 0 : as0 + (as1 - as0) * fr;
      const exc = glot + An * nb * (0.04 * amp + 2.5 * Math.abs(glot)) + asp * nb * 0.12 * this.E;

      let vt = 0;                                      // vocal tract: parallel formants
      for (let k = 0; k < 6; k++) vt += bqRun(this.res[k], exc);
      let y = bqRun(this.bq, vt);                      // hypopharyngeal anti-resonance in cascade
      const na = na0 + (na1 - na0) * fr;
      if (na > 1e-4) y += (bqRun(this.nz, y) - y) * na; else bqRun(this.nz, y);   // antiformante nasal
      y = bqRun(this.lp2, bqRun(this.lp1, y));         // oral gate (closure of the stops)

      const fric = fr0 + (fr1 - fr0) * fr;             // consonant noise branch: burst and friction
      const nn = this.gauss();
      let fn = wB * bqRun(this.frLp, bqRun(this.fr, bqRun(this.frHp, nn)));
      if (usePar) for (let k = 0; k < 4; k++) fn += this.nresG[k] * bqRun(this.nres[k], nn);
      if (loopA && tS >= loopA.t0) fn = this.smpRead(loopA, smpStep) * loopA.gain;   // recorded texture under the same envelope
      if (shotOn) { y += this.smpRead(shotA, smpStep) * shotA.gain * fricE; fn = 0; }
      y += fn * fric * fricE * 0.35;

      const dc = y - this.dc1 + 0.995 * this.dc2;      // DC blocking
      this.dc1 = y; this.dc2 = dc;
      const v = bqRun(this.hp60, dc) * this.outGain;
      out[i] = v > 1 || v < -1 ? Math.tanh(v) : v;
    }
  }
}

// ---------- Using this file ----------
// In the browser, this file is loaded as an AudioWorklet module (see js/voice/audio-engine.js) and registers the
// «cantor-voice» processor, which generates the sound sample by sample on the audio thread. In Node (tests and render)
// registerProcessor does not exist: CantorDSP is imported directly.
// AudioWorklet processor: it only exists inside the audio thread (in Node, registerProcessor is not defined).
// Each 128-sample block is computed by CantorDSP; the output is mono, copied to every channel.
if (typeof registerProcessor === 'function') {
  class CantorProcessor extends AudioWorkletProcessor {
    constructor() { super(); this.dsp = new CantorDSP(sampleRate); this.port.onmessage = (e) => this.dsp.message(e.data); }
    process(inputs, outputs) {
      const out = outputs[0];
      if (!out || !out[0]) return true;
      this.dsp.render(out[0]);
      for (let ch = 1; ch < out.length; ch++) out[ch].set(out[0]);
      return true;
    }
  }
  registerProcessor('cantor-voice', CantorProcessor);
}
// For the tests and renders in Node
export { CantorDSP, cdSource, cdFormants, VOWEL_SETS };

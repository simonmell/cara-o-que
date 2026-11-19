// Browser-free renders with the same voice engine and the same consonant rules as the app.
//
//   node tools/render.mjs song "songs/Los pollitos dicen/los-pollitos-dicen.txt" audio/pollitos.wav
//   node tools/render.mjs catalog audio/consonant-catalog.wav
//   node tools/render.mjs song english-song.txt audio/x.wav --dictionary <cmu-pronouncing-dictionary/index.js>
//   node tools/render.mjs catalog-en audio/english-catalog.wav
//
// Songs with #LANGUAGE:English are pronounced in English (js/logic/english.js). The CMU dictionary is passed with
// --dictionary (the index.js of the npm package "cmu-pronouncing-dictionary"); without it, words are read as Spanish.
//
// "catalog" sings each consonant in an isolated syllable (CV, after a pause) and between vowels (a-CV),
// and writes next to it a .txt with the minute and second of each example.
// Consonants are triggered as in the automatic level (ahead of time by the length of the onset).
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as ultrastar from '../js/logic/ultrastar.js';
import * as articulation from '../js/logic/articulation.js';
import * as english from '../js/logic/english.js';
import { CantorDSP } from '../js/voice/cantor-dsp.js';
import { loadSamples } from './load-samples-node.mjs';

// L: the app logic needed to sing without a browser
const L = { ...ultrastar, ...articulation, ...english };
// recorded consonants, same as in the page
const SMP = loadSamples();

const FS = 48000, BL = 128;

function prepare(notes) {
  const items = notes.map((n, i) => {
    if (n.en) return { onset: n.en.onset, nucleus: n.en.fam, coda: L.pickCoda(n.en.coda), hum: false, on: false, co: false };
    const pv = notes[i - 1];
    const wordStart = n.wordStart ?? (i === 0 || /^\s/.test(n.text) || (pv && (/\s$/.test(pv.text) || pv.line !== n.line)));
    const sp = L.splitSyllable(n.text, { prev: pv?.vowel ?? null, wordStart });
    return { ...sp, hum: !sp.nucleus && !sp.cont && sp.onset.length > 0, on: false, co: false };
  });
  if (!notes.some((n) => n.en)) L.applyAllophones(items, notes);
  for (const a of items) a.lead = L.onsetLead(a.onset);
  return items;
}

function render(notes, { consonants = true, transpose = -12, voice = {} } = {}) {
  const d = new CantorDSP(FS);
  d.message({ type: 'samples', fs: SMP.fs, sets: SMP.sets });
  const vs = { tension: 0.5, breath: 0.05, S: 0.36, rough: 0.03, vibrato: 0.006, ...voice };
  if (vs.smpSet == null) vs.smpSet = vs.S >= 0.44 || vs.vset === 'soprano' ? 'f' : 'm';   // like "by tract size" in the app
  const isEn = notes.some((n) => n.en);
  if (isEn) vs.vset = vs.vset === 'soprano' ? 'en_w' : 'en_m';
  d.message({ type: 'voice', ...vs });
  const items = prepare(notes);
  const N = Math.round((notes.at(-1).endMs + 700) * FS / 1000);
  const buf = new Float32Array(N), blk = new Float32Array(BL);
  let lastVowel = notes.find((n) => n.vowel)?.vowel || 'a';
  for (let s0 = 0; s0 < N; s0 += BL) {
    const t = s0 * 1000 / FS;
    const cur = notes.findIndex((n) => t >= n.startMs - 10 && t < n.endMs);
    const nx = notes.findIndex((n) => n.startMs > t);
    const n = notes[cur >= 0 ? cur : nx] || notes.at(-1);
    if (n.vowel) lastVowel = n.vowel;
    const w = n.en ? L.englishWeights({ [n.en.fam]: 1 }, n.en, L.glideAt(t, n.startMs, n.endMs)) : { [lastVowel]: 1 };
    d.message({ type: 'params', midi: n.midi + transpose, active: cur >= 0, effort: 0.7, weights: w, mouth: null });
    if (consonants) notes.forEach((m, i) => {
      const a = items[i];
      if (!a.on && a.onset.length && t >= m.startMs - a.lead) {
        a.on = true;
        d.message({ type: 'plan', plan: a.hum ? L.planHum(a.onset, m.endMs - m.startMs) : L.planOnset(a.onset, 1, { vowel: a.nucleus }) });
      }
      const codaAt = m.endMs - Math.min(110, (m.endMs - m.startMs) * 0.45);
      if (!a.co && a.coda.length && t >= codaAt && t < m.endMs) {
        a.co = true;
        d.message({ type: 'plan', plan: L.planCoda(a.coda, m.endMs - t, 1, { vowel: a.nucleus }) });
      }
    });
    d.render(blk);
    buf.set(blk.subarray(0, Math.min(BL, N - s0)), s0);
  }
  return buf;
}

function writeWav(file, buf) {
  const N = buf.length;
  const pk = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0), g = Math.min(1, 0.89 / (pk || 1));
  const pcm = Buffer.alloc(44 + N * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(FS, 24);
  pcm.writeUInt32LE(FS * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * g)) * 32767), 44 + i * 2);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pcm);
  if (buf.some(Number.isNaN)) throw new Error('the render contains NaN');
  console.log(file, `${(N / FS).toFixed(1)} s`);
}

// Catalog: [label, isolated syllable, syllable between vowels]
const CATALOG = [
  ['p', 'pa', 'pa'], ['t', 'ta', 'ta'], ['k', 'ka', 'ka'],
  ['b (stop / approximant [β])', 'ba', 'ba'], ['d (stop / approximant [ð])', 'da', 'da'], ['g (stop / approximant [ɣ])', 'ga', 'ga'],
  ['f', 'fa', 'fa'], ['s', 'sa', 'sa'], ['ll / y [ʃ]', 'lla', 'lla'], ['j [x]', 'ja', 'ja'], ['ch', 'cha', 'cha'],
  ['m', 'ma', 'ma'], ['n', 'na', 'na'], ['ñ', 'ña', 'ña'],
  ['l', 'la', 'la'], ['r (tap, between vowels)', null, 'ra'], ['rr (trill)', 'rra', 'rra'],
  ['k before i', 'qui', 'qui'], ['k before u', 'cu', 'cu'], ['j before i', 'ji', 'ji'], ['s before i', 'si', 'si'],
];
const VOWEL = (syl) => syl.match(/[aeiou]/)[0];
// English catalog: new consonants before /ɑ/ (and the final ones at the end of the syllable), plus the vowels and diphthongs.
const EN = (onset, nuc = 'AA', coda = []) => {
  const V = L.EN_VOWELS[nuc];
  return { fam: V.fam, ipa: V.ipa, v1: V.v1, v2: V.v2 || null, onset, coda, cont: false };
};
const CATALOG_EN = [
  ['aspirated p [pʰ] (pot)', EN(['pʰ'])], ['unaspirated p (spot)', EN(['s', 'p'])], ['aspirated t [tʰ] (top)', EN(['tʰ'])],
  ['aspirated k [kʰ] (cot)', EN(['kʰ'])], ['voiceless th [θ] (thought)', EN(['θ'], 'AO')], ['voiced th [ð] (the)', EN(['D'], 'AX')],
  ['v (vase)', EN(['v'], 'EY')], ['z (zoo)', EN(['z'], 'UW')], ['[ʒ] (genre)', EN(['ʒ'])], ['English j [dʒ] (jar)', EN(['dʒ'])],
  ['h (hot)', EN(['h'])], ['English r [ɹ] (rock)', EN(['ɹ'])], ['final ng [ŋ] (song)', EN(['s'], 'AO', ['ŋ'])],
  ['final dark l [ɫ] (doll)', EN(['d'], 'AA', ['ɫ'])], ['final r (car)', EN(['kʰ'], 'AA', ['ɹ'])], ['final z (buzz)', EN(['b'], 'AH', ['z'])],
  ['American flap t [ɾ] (water)', null, [EN(['w'], 'AO'), EN(['r'], 'ER')]],
];
const CATALOG_EN_V = ['IY', 'IH', 'EY', 'EH', 'AE', 'AA', 'AH', 'AO', 'OW', 'UH', 'UW', 'ER', 'AY', 'AW', 'OY'];

function catalog() {
  const notes = [], marks = [];
  let t = 400, line = 0;
  const midi = 65, D = 520;
  const fmt = (ms) => `${Math.floor(ms / 60000)}:${(ms / 1000 % 60).toFixed(1).padStart(4, '0')}`;
  for (const [label, iso, inter] of CATALOG) {
    if (iso) {
      notes.push({ text: iso, vowel: VOWEL(iso), startMs: t, endMs: t + D, midi, line: ++line, wordStart: true });
      marks.push(`${fmt(t - 100)}  ${label}: "${iso}" isolated`);
      t += D + 650;
    }
    notes.push({ text: 'a', vowel: 'a', startMs: t, endMs: t + 380, midi, line: ++line, wordStart: true });
    notes.push({ text: inter, vowel: VOWEL(inter), startMs: t + 380, endMs: t + 380 + D, midi, line, wordStart: false });
    marks.push(`${fmt(t)}  ${label}: "a${inter}" between vowels`);
    t += 380 + D + 750;
  }
  return { notes, marks };
}

// Options: --vowels cd|soprano  --tract 0.30|0.36|0.44  --transpose <semitones, default -12>  --vibrato-hz <Hz>
//          --consonants f|m|synthetic (default: by tract size, as in the app)
const argv = process.argv.slice(2), opts = {}, pos = [];
for (let i = 0; i < argv.length; i++) argv[i].startsWith('--') ? (opts[argv[i].slice(2)] = argv[++i]) : pos.push(argv[i]);
const voice = {};
if (opts.vowels) voice.vset = opts.vowels;
if (opts.tract) voice.S = Number(opts.tract);
if (opts['vibrato-hz']) voice.vibRate = Number(opts['vibrato-hz']);
if (opts.consonants) voice.smpSet = opts.consonants === 'synthetic' ? '' : opts.consonants;   // f | m | synthetic
const transpose = opts.transpose != null ? Number(opts.transpose) : -12;
const [mode, ...args] = pos;
if (mode === 'song') {
  const [txt, out = 'audio/song.wav'] = args;
  const raw = fs.readFileSync(txt, 'utf8');
  const song = L.parseUltraStar(raw.includes('\uFFFD') ? fs.readFileSync(txt, 'latin1') : raw);
  if (L.isEnglishSong(song)) {
    const dict = opts.dictionary ? (await import(pathToFileURL(path.resolve(opts.dictionary)).href)).dictionary : {};
    const unk = L.annotateEnglish(song.notes, (w) => dict[w] || null, (i) => {
      const sp = L.splitSyllable(song.notes[i].text, { prev: song.notes[i].vowel, wordStart: true });
      return { fam: sp.nucleus || song.notes[i].vowel || 'a', onset: sp.onset, coda: sp.coda };
    });
    console.log('English song' + (unk.length ? `; not in the dictionary: ${unk.join(', ')}` : ''));
  }
  writeWav(out, render(song.notes, { transpose, voice }));
  if (!opts['no-vowels-only']) writeWav(out.replace(/\.wav$/, '-vowels-only.wav'), render(song.notes, { consonants: false, transpose, voice }));
} else if (mode === 'catalog') {
  const [out = 'audio/consonant-catalog.wav'] = args;
  const { notes, marks } = catalog();
  writeWav(out, render(notes, { transpose, voice }));
  fs.writeFileSync(out.replace(/\.wav$/, '.txt'), 'Consonant catalog (minute:second)\n\n' + marks.join('\n') + '\n');
  console.log(out.replace(/\.wav$/, '.txt'));
} else if (mode === 'catalog-en') {
  const [out = 'audio/english-catalog.wav'] = args;
  const notes = [], marks = [];
  let t = 400, line = 0;
  const midi = 65, D = 560;
  const fmt = (ms) => `${Math.floor(ms / 60000)}:${(ms / 1000 % 60).toFixed(1).padStart(4, '0')}`;
  for (const [label, en, pair] of CATALOG_EN) {
    marks.push(`${fmt(t - 100)}  ${label}`);
    for (const e of pair || [en]) { notes.push({ text: '', en: e, vowel: e.fam, startMs: t, endMs: t + D, midi, line: ++line }); t += D + (pair ? 0 : 600); }
    if (pair) t += 600;
  }
  for (const v of CATALOG_EN_V) {
    marks.push(`${fmt(t - 100)}  vowel ${L.EN_VOWELS[v].ipa}`);
    notes.push({ text: '', en: EN([], v), vowel: L.EN_VOWELS[v].fam, startMs: t, endMs: t + 900, midi, line: ++line });
    t += 1500;
  }
  writeWav(out, render(notes, { transpose, voice }));
  fs.writeFileSync(out.replace(/\.wav$/, '.txt'), 'English catalog (minute:second)\n\n' + marks.join('\n') + '\n');
  console.log(out.replace(/\.wav$/, '.txt'));
} else if (mode === 'vowels') {
  // a e i o u sustained, each on the note where Barrientos and Cataldo measured it (A4, E5, C5, A4, C5),
  // then the five in a row on a lower note (G3) to hear what happens outside that range
  const [out = 'audio/vowels.wav'] = args;
  const seq = [['a', 69], ['e', 76], ['i', 72], ['o', 69], ['u', 72], ['a', 55], ['e', 55], ['i', 55], ['o', 55], ['u', 55]];
  const notes = seq.map(([v, m], i) => ({ text: v, vowel: v, startMs: 300 + i * 1700, endMs: 300 + i * 1700 + 1300, midi: m, line: i, wordStart: true }));
  writeWav(out, render(notes, { transpose: 0, voice }));
} else {
  console.log('usage: node tools/render.mjs song <file.txt> <output.wav> | catalog <output.wav> | catalog-en <output.wav> | vowels <output.wav>  [--vowels cd|soprano] [--tract 0.44] [--transpose N] [--vibrato-hz 4.5] [--consonants f|m|synthetic] [--dictionary <index.js>]');
  process.exit(1);
}

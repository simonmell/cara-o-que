// English songs: CMU dictionary -> syllables -> notes, and mapping the vowel family the camera reads
// to the exact English vowel. No DOM.

// The dictionary gives each word in ARPAbet with stress (TWINKLE → T W IH1 NG K AH0 L). Here it is split into syllables,
// distributed among the notes that make up the word in the UltraStar file and translated into what the engine understands:
// the vowel family the camera reads (a e i o u), the exact English vowel (with diphthong) and the consonants.

// American English vowels: visible family (the one calibrated and scored), IPA for display and keys into the engine's
// table (v1 = sustained vowel; v2 = where the diphthong glides to at the end of the note).
export const EN_VOWELS = {
  IY: { fam: 'i', ipa: 'i', v1: 'IY' }, IH: { fam: 'i', ipa: 'ɪ', v1: 'IH' },
  EY: { fam: 'e', ipa: 'eɪ', v1: 'EY', v2: 'IH' }, EH: { fam: 'e', ipa: 'ɛ', v1: 'EH' }, AE: { fam: 'e', ipa: 'æ', v1: 'AE' },
  AA: { fam: 'a', ipa: 'ɑ', v1: 'AA' }, AH: { fam: 'a', ipa: 'ʌ', v1: 'AH' }, AX: { fam: 'a', ipa: 'ə', v1: 'AX' },
  AY: { fam: 'a', ipa: 'aɪ', v1: 'AA', v2: 'IH' }, AW: { fam: 'a', ipa: 'aʊ', v1: 'AA', v2: 'UH' },
  AO: { fam: 'o', ipa: 'ɔ', v1: 'AO' }, OW: { fam: 'o', ipa: 'oʊ', v1: 'OW', v2: 'UH' }, OY: { fam: 'o', ipa: 'ɔɪ', v1: 'AO', v2: 'IH' },
  ER: { fam: 'o', ipa: 'ɝ', v1: 'ER' },
  UH: { fam: 'u', ipa: 'ʊ', v1: 'UH' }, UW: { fam: 'u', ipa: 'u', v1: 'UW' },
};
// ARPAbet consonants → engine phonemes (the new ones are in PHONES in articulation.js).
export const EN_CONS = {
  P: 'p', B: 'b', T: 't', D: 'd', K: 'k', G: 'g', CH: 'ch', JH: 'dʒ', F: 'f', V: 'v', TH: 'θ', DH: 'D', S: 's', Z: 'z',
  SH: 'sh', ZH: 'ʒ', HH: 'h', M: 'm', N: 'n', NG: 'ŋ', L: 'l', R: 'ɹ', W: 'w', Y: 'j',
};
export const ASPIRATED = { P: 'pʰ', T: 'tʰ', K: 'kʰ' };
// In ARPAbet, vowels carry the stress as a final digit (AH0, IY1).
export const isVowelPh = (p) => /\d$/.test(p);

// Possible English onsets (for the maximal onset principle when syllabifying).
export const ONSETS = new Set([
  'P R', 'P L', 'B R', 'B L', 'T R', 'D R', 'K R', 'K L', 'G R', 'G L', 'F R', 'F L', 'TH R', 'SH R',
  'S P', 'S T', 'S K', 'S M', 'S N', 'S L', 'S W', 'S F', 'S P R', 'S P L', 'S T R', 'S K R', 'S K W', 'S K L',
  'T W', 'D W', 'K W', 'G W', 'TH W', 'S W', 'P Y', 'B Y', 'K Y', 'G Y', 'F Y', 'V Y', 'M Y', 'HH Y', 'N Y', 'L Y',
  'S K Y', 'S P Y',
]);
// Can this consonant cluster start an English syllable?
export const legalOnset = (cs) => cs.length === 0 || (cs.length === 1 && cs[0] !== 'NG') || ONSETS.has(cs.join(' '));

// "T W IH1 NG K AH0 L" → [{onset:[T,W], nuc:'IH', stress:1, coda:[NG]}, {onset:[K], nuc:'AH', stress:0, coda:[L]}]
export function syllabifyArpabet(pron) {
  const ph = String(pron).trim().split(/\s+/).filter(Boolean);
  const vi = ph.map((p, i) => (isVowelPh(p) ? i : -1)).filter((i) => i >= 0);
  if (!vi.length) return [];
  const syl = vi.map((i) => ({ onset: [], nuc: ph[i].replace(/\d$/, ''), stress: Number(ph[i].slice(-1)), coda: [] }));
  syl[0].onset = ph.slice(0, vi[0]);
  for (let k = 0; k < vi.length - 1; k++) {
    const mid = ph.slice(vi[k] + 1, vi[k + 1]);
    let cut = 0;                                     // the longest tail of mid that is a possible onset goes to the next syllable
    while (cut < mid.length && !legalOnset(mid.slice(cut))) cut++;
    syl[k].coda = mid.slice(0, cut);
    syl[k + 1].onset = mid.slice(cut);
  }
  syl[syl.length - 1].coda = ph.slice(vi[vi.length - 1] + 1);
  return syl;
}

// One dictionary syllable → what the engine uses. prevSyl: the previous syllable of the same word (for the flapped "t").
export function sylToEngine(sy, prevSyl, wordStart) {
  let nuc = sy.nuc;
  if (nuc === 'AH' && sy.stress === 0) nuc = 'AX';   // the unstressed vowel is reduced to [ə]
  const V = EN_VOWELS[nuc] || EN_VOWELS.AX;
  const onset = sy.onset.map((c, i) => {
    if (ASPIRATED[c] && i === 0 && (wordStart || sy.stress > 0)) return ASPIRATED[c];   // p t k aspirated at the start
    if ((c === 'T' || c === 'D') && i === 0 && sy.onset.length === 1 && !wordStart && sy.stress === 0
        && prevSyl && !prevSyl.coda.length) return 'r';                                  // "water", "little": flap [ɾ]
    return EN_CONS[c];
  }).filter(Boolean);
  const coda = sy.coda.map((c) => (c === 'L' ? 'ɫ' : EN_CONS[c])).filter(Boolean);       // l final oscura
  return { fam: V.fam, ipa: V.ipa, v1: V.v1, v2: V.v2 || null, stress: sy.stress, onset, coda };
}

// Several syllables on a single note ("fire" on one note, "of the" on one note): the most stressed one stays; the vowel of the
// next syllable becomes the glide target and its consonants are added to the coda.
export function mergeSyls(list) {
  if (list.length === 1) return { ...list[0] };
  let m = 0;
  list.forEach((s, i) => { if (s.stress > list[m].stress) m = i; });
  const main = { ...list[m], onset: [...list[m].onset], coda: [...list[m].coda] };
  for (let i = 0; i < m; i++) main.onset = [...main.onset, ...list[i].onset, ...list[i].coda];
  for (let i = m + 1; i < list.length; i++) {
    if (!main.v2 && !main.coda.length) { main.v2 = list[i].v1; main.ipa += list[i].ipa; }
    else if (list[i].v1 === 'ER') main.coda.push('ɹ');               // "fire", "hour" on one note: the final r stays
    main.coda.push(...list[i].onset, ...list[i].coda);
  }
  return main;
}

// The coda that sounds at the end of the note: the engine plays one final consonant; the most audible one is chosen
// (fricative > r or l > nasal > the first one).
export function pickCoda(coda) {
  if (!coda || !coda.length) return [];
  const pref = [['s', 'z', 'sh', 'ʒ', 'f', 'v', 'θ', 'ch', 'dʒ'], ['ɹ', 'ɫ', 'l'], ['m', 'n', 'ŋ']];
  for (const group of pref) { const c = coda.find((x) => group.includes(x)); if (c) return [c]; }
  return [coda[0]];
}

// Groups the text pieces of the notes into words. Returns [{word, parts: [{i, len}]}]; "~" notes (melisma) add no
// letters and keep the previous vowel.
export function englishWords(notes) {
  const words = [];
  let cur = null;
  notes.forEach((n, i) => {
    const txt = String(n.text);
    if (/^\s*~\s*$/.test(txt)) return;
    const prev = notes[i - 1];
    if (cur && (n.line !== prev?.line)) cur = null;
    const tokens = txt.split(/(\s+)/);
    tokens.forEach((tk) => {
      if (/^\s+$/.test(tk)) { cur = null; return; }
      const clean = tk.toLowerCase().replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '');
      if (!clean) return;
      if (!cur) { cur = { word: '', parts: [] }; words.push(cur); }
      cur.word += clean;
      cur.parts.push({ i, len: clean.length });
    });
    if (/\s$/.test(txt)) cur = null;
  });
  return words;
}

// Distributes the syllables of a word among its notes according to the approximate position of each vowel within the letters.
export function distribute(syls, parts) {
  const N = parts.length, M = syls.length;
  const out = parts.map(() => []);
  if (M === N) { syls.forEach((s, k) => out[k].push(s)); return out; }
  const totL = parts.reduce((s, p) => s + p.len, 0) || 1;
  const nPh = syls.reduce((s, x) => s + x.onset.length + 1 + x.coda.length, 0) || 1;
  const bounds = []; let acc = 0;
  for (const p of parts) { acc += p.len; bounds.push(acc / totL); }
  let before = 0;
  syls.forEach((s) => {
    const pos = (before + s.onset.length + 0.5) / nPh;
    before += s.onset.length + 1 + s.coda.length;
    let k = bounds.findIndex((b) => pos <= b + 1e-9); if (k < 0) k = N - 1;
    out[k].push(s);
  });
  // notes without a syllable: if a neighbor has two or more, it gets the closest one
  for (let k = 0; k < N; k++) {
    if (out[k].length) continue;
    if (k > 0 && out[k - 1].length > 1) out[k].push(out[k - 1].pop());
    else if (k < N - 1 && out[k + 1].length > 1) out[k].push(out[k + 1].shift());
  }
  return out;
}

// Annotates each note with n.en = {fam, ipa, v1, v2, onset, coda, cont, unknown}. dict(word) → ARPAbet pronunciation or null.
// fallback(i) → {fam, onset, coda} with the Spanish rules, for words that are not in the dictionary.
// Returns the list of unknown words.
export function annotateEnglish(notes, dict, fallback) {
  const unknown = [];
  for (const n of notes) n.en = null;
  for (const w of englishWords(notes)) {
    const pron = dict(w.word) || dict(w.word.replace(/'/g, '')) || (w.word.endsWith("in'") ? dict(w.word.slice(0, -1) + 'g') : null);
    if (!pron) {
      unknown.push(w.word);
      for (const p of w.parts) {
        if (notes[p.i].en) continue;
        const f = fallback(p.i);
        notes[p.i].en = { fam: f.fam, ipa: f.fam, v1: f.fam, v2: null, onset: f.onset, coda: f.coda, cont: false, unknown: true };
      }
      continue;
    }
    const syls = syllabifyArpabet(pron);
    const eng = syls.map((s, k) => sylToEngine(s, syls[k - 1], k === 0));
    // a note may hold pieces of several words ("of the"): their syllables are merged
    const groups = distribute(eng, w.parts);
    w.parts.forEach((p, k) => {
      const list = groups[k];
      const n = notes[p.i];
      if (!list.length) return;
      const m = mergeSyls(n.en && !n.en.cont ? [n.en, ...list] : list);
      n.en = { ...m, cont: false, unknown: false };
    });
  }
  // notes without their own syllable (melismas "~" or word parts left empty): keep the previous vowel;
  // the diphthong glides only on the last note of the group
  let last = null;
  notes.forEach((n, i) => {
    if (i > 0 && notes[i - 1].line !== n.line) last = null;
    if (n.en) { last = n; return; }
    if (!last) { n.en = { fam: n.vowel || 'a', ipa: n.vowel || 'a', v1: n.vowel || 'a', v2: null, onset: [], coda: [], cont: true, unknown: false }; return; }
    n.en = { ...last.en, onset: [], cont: true };
    last.en = { ...last.en, v2: null, coda: [] };
    last = n;
  });
  for (const n of notes) n.vowel = n.en.fam;
  return unknown;
}

// Vowel weights for the engine in an English song: the face picks the family (a e i o u) and the lyrics decide the exact
// vowel. glide (0 to 1) = how far the diphthong glide has progressed.
export function englishWeights(faceW, en, glide = 0) {
  const out = { ...faceW };
  if (!en) return out;
  const w = out[en.fam] || 0;
  delete out[en.fam];
  const g = en.v2 ? Math.min(1, Math.max(0, glide)) : 0;
  out[en.v1] = (out[en.v1] || 0) + w * (1 - g);
  if (g > 0) out[en.v2] = (out[en.v2] || 0) + w * g;
  return out;
}
// Diphthong progress: holds the first vowel and glides in the last part of the note (up to 180 ms, or 35 %).
export function glideAt(t, startMs, endMs) {
  const d = endMs - startMs, gl = Math.min(180, 0.35 * d), a = endMs - gl - 20;
  return Math.min(1, Math.max(0, (t - a) / gl));
}
// Is the file in English? (UltraStar #LANGUAGE tag)
export const isEnglishSong = (song) => /^(english|inglés|ingles|en)\b/i.test(String(song.language || '').trim());

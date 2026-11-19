// Tests of the karaoke's pure logic and of the voice engine (no browser): npm test  (or node tests/run-tests.mjs)
// Imports the js/logic modules and the js/voice/cantor-dsp.js engine directly; they do not touch the page.
import fs from 'fs'; import path from 'path'; import assert from 'assert';
import { fileURLToPath } from 'url';
import * as common from '../js/logic/common.js';
import * as ultrastar from '../js/logic/ultrastar.js';
import * as vowels from '../js/logic/vowels.js';
import * as pitchScore from '../js/logic/pitch-score.js';
import * as articulation from '../js/logic/articulation.js';
import * as english from '../js/logic/english.js';
import { CantorDSP, cdFormants, VOWEL_SETS } from '../js/voice/cantor-dsp.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// L: all the pure logic together, as a single namespace
const L = { ...common, ...ultrastar, ...vowels, ...pitchScore, ...articulation, ...english };
let n = 0; const ok = (name) => { n++; console.log('✓', name); };

const demo = ['songs/Los pollitos dicen/los-pollitos-dicen.txt', 'songs/los-pollitos-dicen.txt'].map((p) => path.join(root, p)).find((p) => fs.existsSync(p));
const song = L.parseUltraStar(fs.readFileSync(demo, 'utf8'));
assert.equal(song.notes.length, 48); assert.equal(song.notes[1].startMs, 3000); ok('reads the UltraStar song');
{
  const mk = (h) => L.parseUltraStar(h + '\n#BPM:100\n: 0 4 0 la\nE');
  const files = ['Artist - Title.txt', 'Artist - Title.mp3', 'Artist - Title [CO].jpg', 'Artist - Title [BG].jpg', 'Artist - Title.mp4', 'readme.txt'];
  let a = L.songAssets(mk('#TITLE:Title\n#MP3:artist - title.MP3'), files);
  assert.equal(a.play, 'Artist - Title.mp3'); assert.equal(a.cover, 'Artist - Title [CO].jpg');
  a = L.songAssets(mk('#AUDIO:x.mp3\n#INSTRUMENTAL:inst.ogg\n#COVER:Artist - Title [BG].jpg'), [...files, 'inst.ogg']);
  assert.equal(a.play, 'inst.ogg'); assert.equal(a.cover, 'Artist - Title [BG].jpg');
  a = L.songAssets(mk('#MP3:Title.mp3'), ['Title.ogg', 'Title.txt']); assert.equal(a.play, 'Title.ogg');
  a = L.songAssets(mk('#MP3:no.mp3'), ['Title.txt', 'Title.mp4']); assert.equal(a.play, 'Title.mp4');
  a = L.songAssets(mk(''), ['Title.txt']); assert.equal(a.play, null);
  a = L.songAssets(mk('#MP3:missing.mp3'), ['Title.txt', 'Title - original.mp3', 'Title (KARAOKE).mp3']); assert.equal(a.play, 'Title (KARAOKE).mp3');
  ok('finds the audio and the cover of each song in its folder');
  const g = L.groupSongFolders(['songs/Zeta/z.txt', 'songs/Zeta/z.mp3', 'songs/Árbol/a.txt', 'songs/no lyrics/x.mp3', 'songs/readme.md']);
  assert.deepEqual(g.map((d) => d.name), ['Árbol', 'Zeta']); assert.deepEqual(g[1].files, [0, 1]);
  assert.deepEqual(L.groupSongFolders(['Una canción/u.txt']).map((d) => d.name), ['Una canción']);   // accented folder names are kept
  assert.ok(L.groupSongFolders(['songs/loose.txt', 'songs/Title/t.txt']).find((d) => d.dir === 'songs').loose);
  ok('each subfolder with a .txt is a song named after the folder');
}
{
  // Soprano vowels (Barrientos and Cataldo, 2021): on the measured note and with a small tract, F2–F3 from table IV come out;
  // on low notes, the Cantor Digitalis ones
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  const paper = { a: [69, 1304, 3088], e: [76, 1891, 2873], i: [72, 2159, 3104], o: [69, 1551, 3226], u: [72, 1108, 3251] };
  for (const [v, [m, f2, f3]] of Object.entries(paper)) {
    const F = cdFormants({ [v]: 1 }, null, hz(m), 0.75, 0.44, VOWEL_SETS.soprano).F;
    assert.ok(Math.abs(F[1] / f2 - 1) < 0.01 && Math.abs(F[2] / f3 - 1) < 0.01, v);
    const lo = cdFormants({ [v]: 1 }, null, hz(55), 0.75, 0.36, VOWEL_SETS.soprano).F, cd = cdFormants({ [v]: 1 }, null, hz(55), 0.75, 0.36, VOWEL_SETS.cd).F;
    assert.deepEqual(lo, cd);
  }
  ok('soprano vowels: paper values on their note, Cantor Digitalis on low notes');
  // locus equations: the consonant's starting F2 depends on the vowel (Martínez Celdrán and Villalba)
  const locF2 = (p, v) => {
    const d = new CantorDSP(48000); d.message({ type: 'params', midi: 57, active: true, effort: 0.7, weights: { [v]: 1 } });
    const b = new Float32Array(128);
    for (let i = 0; i < 100; i++) d.render(b);
    const F2v = d.F[1];
    d.message({ type: 'plan', plan: L.planOnset([p]) });
    for (let i = 0; i < 8; i++) d.render(b);
    return [d.loc[1], F2v];
  };
  const scl = (1.7 * 0.36 + 0.5) * (1.25e-4 * 220 + 0.975);
  // values measured on the Rioplatense dataset (LOCUS_EQ_AR)
  for (const [p, k, c] of [['b', 0.85, 90], ['d', 0.66, 570], ['g', 1, 0], ['m', 0.55, 550], ['s', 0.75, 480], ['l', 0.67, 645]]) {
    for (const v of ['a', 'i', 'u']) {
      const [loc, F2v] = locF2(p, v);
      assert.ok(Math.abs(loc - (k * F2v + c * scl)) < 1, `${p}${v}`);
    }
  }
  const [di] = locF2('d', 'i'), [du] = locF2('d', 'u');
  assert.ok(di - du > 400, '/d/ starts higher before /i/ than before /u/');
  ok('transitions depend on the vowel (locus equations measured in Rioplatense Spanish)');
}
{
  // recorded consonants: the plans request the fragment and the engine plays it at the same level as the synthesis
  const P = L.planOnset(['s'], 1, { vowel: 'a' }), T = L.planOnset(['t'], 1, { vowel: 'i' });
  assert.equal(P.smp[0].mode, 'loop'); assert.equal(T.smp[0].mode, 'shot'); assert.equal(T.smp[0].v, 'i');
  assert.equal(L.planOnset(['p', 'l'], 1).smp.length, 1);
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'data/consonant-samples.json'), 'utf8'));
  const sets = {};
  for (const [voice, phones] of Object.entries(raw.sets)) { sets[voice] = {}; for (const [p, g] of Object.entries(phones)) sets[voice][p] = { mode: g.mode, tok: g.tok.map((t) => {
    const b = Buffer.from(t.d, 'base64'), pcm = new Float32Array(b.length >> 1); for (let i = 0; i < pcm.length; i++) pcm[i] = b.readInt16LE(2 * i) * t.k; return { v: t.v, pcm }; }) }; }
  for (const voice of ['f', 'm']) for (const p of ['s', 'sh', 'f', 'x', 'ch', 'p', 't', 'k']) assert.ok(sets[voice][p]?.tok.length >= 3, `${voice} ${p}`);
  const lev = (p, set) => {
    const d = new CantorDSP(48000); d.message({ type: 'samples', fs: raw.fs, sets }); d.message({ type: 'voice', smpSet: set });
    d.message({ type: 'params', midi: 55, active: true, effort: 0.7, weights: { a: 1 } });
    const b = new Float32Array(128), x = [];
    for (let i = 0; i < 160; i++) { if (i === 80) d.message({ type: 'plan', plan: L.planOnset([p], 1, { vowel: 'a' }) }); d.render(b); x.push(...b); }
    assert.ok(x.every(Number.isFinite));
    const r = (a) => Math.sqrt(a.reduce((m, y) => m + y * y, 0) / a.length);
    return 20 * Math.log10(r(x.slice(80 * 128 + 22 * 48, 80 * 128 + 70 * 48)) / r(x.slice(40 * 128, 80 * 128)));
  };
  for (const set of ['f', 'm']) { const a = lev('s', set), b = lev('s', ''); assert.ok(Math.abs(a - b) < 3, `s ${set}: ${a.toFixed(1)} vs ${b.toFixed(1)}`); }
  ok('recorded consonants (female and male voice) at the level of the synthetic ones');
}
for (const [t, v] of Object.entries({ can: 'a', ción: 'o', pí: 'i', que: 'e', gui: 'i', hoy: 'o', y: 'i', ciu: 'u', fui: 'i' })) assert.equal(L.nucleus(t, 'x'), v, t);
ok('nucleus vowel of Spanish syllables');
song.notes.forEach((nt) => assert.equal(L.splitSyllable(nt.text, { prev: nt.vowel }).nucleus, nt.vowel, nt.text));
ok('splitSyllable agrees with nucleus() over the whole song');
const sp = (t, ws = true) => { const r = L.splitSyllable(t, { prev: 'a', wordStart: ws }); return `${r.onset.join(' ')}|${r.nucleus}|${r.coda.join(' ')}`; };
assert.equal(sp('cuan'), 'k w|a|n'); assert.equal(sp('llu'), 'sh|u|'); assert.equal(sp('yo'), 'sh|o|');
assert.equal(sp('y el'), 'j|e|l'); assert.equal(sp('ra'), 'rr|a|'); assert.equal(sp('ra', false), 'r|a|');
assert.equal(sp('pres'), 'p r|e|s'); assert.equal(sp('gen'), 'x|e|n'); assert.equal(sp('chi'), 'ch|i|');
ok('onset, nucleus and coda (Rioplatense: ll/y → [ʃ], word-initial r is a trill)');
for (const p of Object.keys(L.PHONES)) {
  const plan = L.planOnset([p]);
  for (const keys of Object.values(plan.tracks)) for (let i = 1; i < keys.length; i++) assert(keys[i][0] >= keys[i - 1][0]);
  assert(plan.release > 0 && plan.dur > plan.release);
}
assert.equal(L.onsetLead(['p']), 53);   // 45 ms closure + 8 ms VOT
assert(L.onsetLead(['k']) > L.onsetLead(['t'])); assert.equal(L.onsetLead([]), 0);
ok('consonant plans are ordered; ~50 ms lead and VOT growing from /p/ to /k/');
{
  const ns = song.notes, items = ns.map((nt) => L.splitSyllable(nt.text, { prev: nt.vowel }));
  L.applyAllophones(items, ns);
  const byText = (t) => items[ns.findIndex((nt) => nt.text.trim() === t)].onset.join(' ');
  assert.equal(byText('ga'), 'G');      // la gallina: between vowels → [ɣ]
  assert.equal(byText('do'), 'd');      // cuando: after a nasal → stop
  assert.equal(byText('mi'), 'm');
  const di = items[ns.findIndex((nt) => nt.text.trim() === 'di')].onset.join(' ');
  assert.equal(di, 'D');                // dicen after «pollitos» (coda s, no pause) → [ð]
  ok('allophones: b d g approximants between vowels and stops after a pause or nasal');
}
const det = new L.ArticulationDetector(); let evs = [];
for (let t = 0; t < 600; t += 33) { const e = det.update(t, 0.9); if (e) evs.push(e); }
assert.equal(evs.length, 0);
for (const [t, o] of [[633, 0.6], [666, 0.2], [700, 0.1], [733, 0.5], [766, 0.9]]) { const e = det.update(t, o); if (e) evs.push(e); }
assert.equal(evs.length, 1); assert(L.gestureStrength(evs[0].depth) > 0.9);
ok('gesture detector: a still mouth does not fire; closing and opening does');

const level = (weights, midi, plan) => {
  const d = new CantorDSP(48000); d.message({ type: 'params', midi, active: true, effort: 0.7, weights });
  const b = new Float32Array(128); const x = [];
  for (let s = 0; s < 24000; s += 128) { if (s === 9600 && plan) d.message({ type: 'plan', plan }); d.render(b); x.push(...b); }
  assert(!x.some(Number.isNaN));
  const rms = (a, z) => { let e = 0; for (let i = a; i < z; i++) e += x[i] * x[i]; return Math.sqrt(e / (z - a)); };
  let mx = 0; for (let i = 9600; i + 480 <= x.length; i += 480) mx = Math.max(mx, rms(i, i + 480));
  return { vowel: rms(4800, 9600), max: mx };
};
for (const v of ['a', 'e', 'i', 'o', 'u']) for (const m of [45, 57, 69]) { const r = level({ [v]: 1 }, m); assert(r.vowel > 0.02 && r.vowel < 0.5, v + m); }
ok('voice engine stable and with a useful level on every vowel and register');
for (const p of ['p', 'd', 'm', 'l', 'w']) { const r = level({ a: 1 }, 53, L.planOnset([p])); assert(r.max < 1.6 * r.vowel, p); }
ok('consonants do not cause volume jumps');

// ---------- English: CMU dictionary → syllables → notes, Hillenbrand vowels and new consonants ----------
{
  const D = { twinkle: 'T W IH1 NG K AH0 L', little: 'L IH1 T AH0 L', star: 'S T AA1 R', high: 'HH AY1', water: 'W AO1 T ER0', the: 'DH AH0', in: 'IH0 N', fire: 'F AY1 ER0' };
  const syl = (w) => L.syllabifyArpabet(D[w]).map((x) => x.onset.join('') + '.' + x.nuc + '.' + x.coda.join('')).join(' | ');
  assert.equal(syl('twinkle'), 'TW.IH.NG | K.AH.L'); assert.equal(syl('star'), 'ST.AA.R'); assert.equal(syl('water'), 'W.AO. | T.ER.');
  const s = L.parseUltraStar('#TITLE:t\n#LANGUAGE:English\n#BPM:100\n: 0 3 0 Twin\n: 4 3 0 kle\n: 8 3 0  lit\n: 12 3 0 tle\n: 16 3 0  star\n- 24\n: 24 3 0 Wa\n: 28 3 0 ter\n: 32 3 0  in the\n: 36 3 0  high\n: 40 3 0 ~\n: 44 3 0  fire\n: 48 3 0  zork\nE');
  assert(L.isEnglishSong(s));
  const unk = L.annotateEnglish(s.notes, (w) => D[w] || null, () => ({ fam: 'o', onset: ['s'], coda: [] }));
  assert.deepEqual(unk, ['zork']);
  const e = s.notes.map((x) => x.en);
  assert.equal(e[0].onset.join(' '), 'tʰ w'); assert.equal(e[0].fam, 'i'); assert.equal(e[0].ipa, 'ɪ');     // aspirated t
  assert.equal(e[3].onset.join(' '), 'r'); assert.equal(e[3].ipa, 'ə');                                      // «little»: [ɾ] and [ə]
  assert.equal(e[4].onset.join(' '), 's t'); assert.equal(e[4].coda.join(' '), 'ɹ');                         // «star»: unaspirated t after s
  assert.equal(e[6].onset.join(' '), 'r');                                                                    // «water»: [ɾ]
  assert.equal(e[8].v2, null); assert.equal(e[9].cont, true); assert.equal(e[9].v2, 'IH');                  // «high ~»: glides at the end
  assert.equal(e[10].ipa, 'aɪ'); assert.equal(e[10].coda.join(' '), 'ɹ');                                  // «fire» on one note
  assert(e[11].unknown); assert.equal(s.notes[11].vowel, 'o');
  assert.deepEqual(L.pickCoda(['n', 'd', 'z']), ['z']); assert.deepEqual(L.pickCoda(['n', 'd']), ['n']);
  ok('English: dictionary syllables spread over the notes, aspirates, [ɾ], diphthongs and unknown words');
  const w = L.englishWeights({ a: 0.8, e: 0.2 }, { fam: 'a', v1: 'AA', v2: 'IH' }, 0.5);
  assert.deepEqual(w, { e: 0.2, AA: 0.4, IH: 0.4 });
  assert.equal(L.glideAt(0, 0, 1000), 0); assert.equal(L.glideAt(1000, 0, 1000), 1);
  ok('English: the face picks the family and the note decides the exact vowel and the diphthong');
}
{
  const levelEn = (weights, midi, plan, vset = 'en_m') => {
    const d = new CantorDSP(48000); d.message({ type: 'voice', vset }); d.message({ type: 'params', midi, active: true, effort: 0.7, weights });
    const b = new Float32Array(128); const x = [];
    for (let s = 0; s < 24000; s += 128) { if (s === 9600 && plan) d.message({ type: 'plan', plan }); d.render(b); x.push(...b); }
    assert(!x.some(Number.isNaN));
    const rms = (a, z) => { let e = 0; for (let i = a; i < z; i++) e += x[i] * x[i]; return Math.sqrt(e / (z - a)); };
    let mx = 0; for (let i = 9600; i + 480 <= x.length; i += 480) mx = Math.max(mx, rms(i, i + 480));
    return { vowel: rms(4800, 9600), max: mx };
  };
  for (const vset of ['en_m', 'en_w']) for (const v of ['IY', 'IH', 'EY', 'EH', 'AE', 'AA', 'AH', 'AX', 'AO', 'OW', 'UH', 'UW', 'ER'])
    for (const m of [45, 57, 69]) { const r = levelEn({ [v]: 1 }, m, null, vset); assert(r.vowel > 0.02 && r.vowel < 0.5, vset + v + m); }
  const F = cdFormants({ ER: 1 }, null, 130, 0.75, 0.30, VOWEL_SETS.en_m).F;
  assert(F[2] < 2000);                                                         // the r-colored vowel has a low F3
  for (const p of ['pʰ', 'tʰ', 'kʰ', 'θ', 'v', 'z', 'ʒ', 'dʒ', 'h', 'ŋ', 'ɹ', 'ɫ']) {
    const r = levelEn({ AA: 1 }, 53, L.planOnset([p], 1, { vowel: 'a' })); assert(r.max < 1.6 * r.vowel, p);
  }
  for (const p of ['ɹ', 'ɫ', 'z', 'ŋ', 'v']) { const r = levelEn({ AA: 1 }, 53, L.planCoda([p], 200, 1, { vowel: 'a' })); assert(r.max < 1.6 * r.vowel, 'coda ' + p); }
  ok('English: Hillenbrand vowels stable in every register; new consonants without volume jumps');
}
console.log(`\n${n} test groups OK`);

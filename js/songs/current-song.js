// Loading the current song and looking up notes by time.

import { cmuDict, cmuLoading, enLookup, loadCmu } from './english-dictionary.js';
import { buildArticulation, resetArticulation } from '../playback/consonant-timing.js';
import { paintSeekTrack, setPlayLabel, updatePlayer } from '../playback/player.js';
import { $, S, toast } from '../state.js';
import { nn, t } from '../i18n/language.js';
import { forgetMeterState, renderLyrics, updateScore } from '../ui/drawing.js';
import { splitSyllable } from '../logic/articulation.js';
import { annotateEnglish, isEnglishSong } from '../logic/english.js';
import { parseUltraStar } from '../logic/ultrastar.js';
import { cantorVoice, voiceSettings } from '../voice/audio-engine.js';

// Loads a song from UltraStar text: notes, language, syllables and consonants, and goes back to the start.
export function setSong(text) {
  const song = parseUltraStar(text);
  S.song = song;
  S.songMidis = [...new Set(song.notes.filter((n) => n.type !== 'F').map((n) => n.midi))].sort((a, b) => a - b);
  prepareLanguage();
  buildArticulation();
  resetPlayback();
  S.songEntry = null;
  renderMeta();
  cantorVoice?.setVoice(voiceSettings());
  return song;
}
// Song language: Spanish (rules in logic/articulation.js) or English (CMU dictionary, logic/english.js). In English
// each note carries n.en: the vowel family the camera reads, the exact English vowel, the diphthong and the consonants.
export const songIsEn = (song) => S.settings.songLang === 'en' || (S.settings.songLang === 'auto' && isEnglishSong(song));
// Song pronunciation: restores the Spanish vowels and, if the song is in English, annotates each note with the dictionary.
export function prepareLanguage() {
  const song = S.song;
  for (const n of song.notes) { if (n.esVowel === undefined) n.esVowel = n.vowel; n.vowel = n.esVowel; n.en = null; }
  song.isEn = songIsEn(song);
  S.enUnknown = [];
  if (!song.isEn) return;
  const fallback = (i) => {                    // word not in the dictionary: read with the Spanish rules
    const n = song.notes[i], sp = splitSyllable(n.text, { prev: n.esVowel, wordStart: true });
    return { fam: sp.nucleus || n.esVowel || 'a', onset: sp.onset, coda: sp.coda };
  };
  S.enUnknown = annotateEnglish(song.notes, enLookup, fallback);
  if (S.enUnknown.length) console.info('Words not in the dictionary:', S.enUnknown.join(', '));
  if (!cmuDict) {
    loadCmu().then((ok) => {
      if (S.song !== song) return;
      if (ok) relang(); else { if (S.enUnknown.length) toast(t('cmuFail')); renderMeta(); }   // no notice if no word is missing
    });
  }
}
// Redoes the pronunciation of the current song without going back to the start (when the setting changes or the dictionary arrives)
export function relang() {
  if (!S.song) return;
  prepareLanguage();
  buildArticulation();
  if (S.art) S.art.items.forEach((a, i) => { if (S.song.notes[i].startMs < S.t) { a.onsetFired = true; a.codaFired = true; } });
  S.lineShown = -1; S.noteShown = -2; forgetMeterState();
  renderLyrics(true); renderMeta();
  cantorVoice?.setVoice(voiceSettings());
}
// Title, artist, number of notes, range and whether it has music (redone when the language changes)
export function renderMeta() {
  const song = S.song;
  if (!song) return;
  const vowels = song.notes.filter((n) => n.vowel).length;
  const box = $('songMeta'); box.innerHTML = '';
  const strong = document.createElement('strong'); strong.textContent = song.title === 'Sin título' ? t('untitled') : song.title;
  const demoArtist = { 'Tradicional (adaptación de ejemplo)': 'demoArtist', 'Traditional (lyrics: Jane Taylor, 1806)': 'demoEnArtist' }[song.artist];
  const artist = demoArtist ? t(demoArtist) : song.artist;
  let extra = (artist ? ' · ' + artist : '') + t('meta', song.notes.length, vowels, nn(S.songMidis[0]), nn(S.songMidis[S.songMidis.length - 1]));
  if (song.isEn) extra += t('enTag') + (!cmuDict && cmuLoading ? t('enLoading') : S.enUnknown?.length ? t('enUnknown', S.enUnknown.length) : '');
  const e = S.songEntry;
  if (e && e.files) extra += e.files.play ? t('withMusic', e.files.playName) : t('noMusic');
  box.append(strong, document.createTextNode(extra));
}
// Takes the song back to the start and clears what was accumulated for the score.
export function resetPlayback() {
  S.playing = false; S.ended = false; S.waiting = false; S.t = 0; S.prevT = -1;
  S.accs = S.song ? S.song.notes.map(() => ({ frames: 0, active: 0, vsum: 0, psum: 0, started: false })) : [];
  S.trace = []; S.lineShown = -1; S.noteShown = -2;
  resetArticulation();
  if (S.audioEl) { S.audioEl.pause(); S.audioEl.currentTime = 0; }
  $('summary').hidden = true;
  setPlayLabel();
  renderLyrics(true);
  updateScore();
  paintSeekTrack(); updatePlayer(true);
}
// Index of the note sounding at time t (ms), or -1 if it is a rest.
export function noteIndexAt(t) {
  const ns = S.song.notes;
  for (let i = 0; i < ns.length; i++) {
    if (ns[i].startMs > t) return -1;
    if (t < ns[i].endMs) return i;
  }
  return -1;
}
// Index of the next note that starts at t or later, or -1.
export function nextNoteIndex(t) {
  const ns = S.song.notes;
  for (let i = 0; i < ns.length; i++) if (ns[i].startMs >= t) return i;
  return -1;
}
// Index of the last note already finished at t, or -1.
export function prevNoteIndex(t) {
  const ns = S.song.notes;
  let k = -1;
  for (let i = 0; i < ns.length; i++) { if (ns[i].endMs <= t) k = i; else break; }
  return k;
}
// Reference note at t: the one sounding; during a rest, the next one if it is less than 0.7 s away, otherwise the previous one.
export function targetNote(t) {
  const cur = noteIndexAt(t);
  if (cur >= 0) return cur;
  const nx = nextNoteIndex(t), pv = prevNoteIndex(t);
  if (nx >= 0 && (pv < 0 || S.song.notes[nx].startMs - t < 700)) return nx;
  return pv >= 0 ? pv : nx;
}

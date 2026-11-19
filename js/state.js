// App state: a single object S with the settings, the current song, playback, what the camera reads and
// what is sounding. Every module reads and writes S. It also stores the settings in the browser and shows notices.

import { DEMO_SONG, DEMO_SONG_EN } from './songs/demo-songs.js';
import { DEFAULTS, STORE_KEY } from './config.js';
import { CLASSES } from './logic/common.js';
import { defaultModel } from './logic/vowels.js';

// ---------------- Estado ----------------
export const $ = (id) => document.getElementById(id);
// Demo songs included in the app: they stay in the list after other songs are loaded.
export const DEMO_SONGS = [
  { name: 'Los pollitos dicen (ejemplo)', nameKey: 'demoName', text: DEMO_SONG, demo: true },
  { name: 'Twinkle, Twinkle, Little Star', nameKey: 'demoEnName', text: DEMO_SONG_EN, demo: true },
];
export const S = {
  settings: { ...DEFAULTS },
  model: defaultModel(),
  songs: DEMO_SONGS.slice(),
  song: null, songMidis: [], accs: [], trace: [],
  playing: false, ended: false, t: 0, prevT: 0, waiting: false, lastNow: 0,
  audioEl: null, audioUrl: null, voiceOn: true,
  calib: { y0: null, h0: null, w0: null },
  face: { ok: false, f: null, y: 0, faceW: 0, faceH: 0, lm: null, seenAt: 0 },
  probs: Object.fromEntries(CLASSES.map((c) => [c, c === 'rest' ? 1 : 0])),
  camActive: false, kbVowel: null, switchDown: false, ptr: { down: false, y: 0 },
  out: { midi: 60, user: 60, target: 60, gain: 0, active: false, weights: { a: 1, e: 0, i: 0, o: 0, u: 0 } },
  lineShown: -1, noteShown: -2,
};

// Reads the settings and the vowel model saved in the browser (localStorage).
export function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const st = JSON.parse(raw);
    if (st.settings) Object.assign(S.settings, st.settings);
    delete S.settings.engine; delete S.settings.broadcast; delete S.settings.master;   // settings from earlier versions
    if (st.model && st.model.templates) S.model = st.model;
  } catch (e) { /* almacenamiento no disponible */ }
}
// Saves the settings and the vowel model in the browser.
export function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ settings: S.settings, model: S.model })); } catch (e) { /* ignorar */ }
}

export let toastTimer = 0;
// Short notice at the bottom of the screen; it hides itself after a few seconds.
export function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}
// Value of a CSS variable of the current theme (for example, a color).
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

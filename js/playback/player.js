// Play / pause / seek and the main button label.

import { resetPlayback } from '../songs/current-song.js';
import { resetArticulation } from './consonant-timing.js';
import { $, S, toast } from '../state.js';
import { t } from '../i18n/language.js';
import { renderLyrics, updateScore } from '../ui/drawing.js';
import { clamp } from '../logic/common.js';
import { ensureAudio, voice } from '../voice/audio-engine.js';

// ms → "m:ss".
export const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// Total duration in ms: the length of the music or, without music, the last note plus 2 s.
export function songDuration() {
  if (!S.song) return 0;
  const last = S.song.notes[S.song.notes.length - 1].endMs + 2000;
  const a = S.audioEl && isFinite(S.audioEl.duration) ? S.audioEl.duration * 1000 : 0;
  return Math.max(last, a);
}
// Marks the stretches with lyrics on the bar (darker) to show where the intros and interludes are
export function paintSeekTrack() {
  const el = $('seek'), dur = songDuration();
  if (!S.song || !dur) return;
  const lines = new Map();
  for (const n of S.song.notes) { const l = lines.get(n.line) || [n.startMs, n.endMs]; lines.set(n.line, [Math.min(l[0], n.startMs), Math.max(l[1], n.endMs)]); }
  const stops = [];
  for (const [a, b] of [...lines.values()].sort((x, y) => x[0] - y[0])) {
    const pa = (100 * a / dur).toFixed(2), pb = (100 * b / dur).toFixed(2);
    stops.push(`transparent ${pa}%`, `var(--seek-sung) ${pa}%`, `var(--seek-sung) ${pb}%`, `transparent ${pb}%`);
  }
  el.style.background = stops.length ? `linear-gradient(to right, ${stops.join(', ')}) no-repeat center / 100% 6px` : '';
  el.max = Math.round(dur);
  $('tDur').textContent = fmtTime(dur);
  $('introBtn').disabled = S.song.notes[0].startMs < 5000;
}
export let lastPlayerSec = -1;
// Updates the progress bar and the times (the texts, once per second).
export function updatePlayer(force) {
  if (S.seeking && !force) return;
  const t = Math.max(0, S.t), sec = Math.floor(t / 1000);
  $('seek').value = Math.round(t);
  if (sec !== lastPlayerSec || force) { lastPlayerSec = sec; $('tCur').textContent = fmtTime(t); }
}
// Jumps to ms: moves the music; the notes ahead are scored again and the skipped ones do not count.
export function seekTo(ms) {
  if (!S.song) return;
  ms = clamp(ms, 0, songDuration());
  if (S.ended) { S.ended = false; $('summary').hidden = true; setPlayLabel(); }
  S.t = ms; S.prevT = ms; S.waiting = false; S.lastNow = 0;
  S.trace = []; S.lineShown = -1; S.noteShown = -2;
  const ns = S.song.notes;
  // the notes ahead are scored again; the skipped ones do not count towards the score
  ns.forEach((n, i) => { if (n.endMs > ms) S.accs[i] = { frames: 0, active: 0, vsum: 0, psum: 0, started: false }; });
  resetArticulation();
  if (S.art) S.art.items.forEach((a, i) => { if (ns[i].startMs < ms) { a.onsetFired = true; a.codaFired = true; } });
  if (voice) voice.silence();
  if (S.audioEl) S.audioEl.currentTime = ms / 1000;
  renderLyrics(true); updateScore(); updatePlayer(true);
}
// Starts or resumes the song (and the music, if any).
export function play() {
  if (!S.song) return;
  ensureAudio();
  if (S.ended) resetPlayback();
  S.playing = true; S.waiting = false; S.lastNow = 0;
  if (S.audioEl) {
    S.audioEl.playbackRate = S.settings.speed;
    S.audioEl.preservesPitch = true;
    S.audioEl.currentTime = Math.max(0, S.t / 1000);
    S.audioEl.play().catch(() => toast(t('noAudio')));
  }
  setPlayLabel();
}
// Pauses the song, the music and the voice.
export function pause() {
  S.playing = false;
  if (S.audioEl) S.audioEl.pause();
  if (voice) voice.silence();
  setPlayLabel();
}

// Text of the main button: "Start", "Pause" or "Resume".
export function setPlayLabel() { $('playBtn').textContent = t(S.playing ? 'pause' : S.t > 0 && !S.ended ? 'resume' : 'start'); }

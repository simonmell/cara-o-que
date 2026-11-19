// Head height -> note, pitch assist, scoring and the four levels.

import { clamp } from './common.js';

// u: upward head displacement, in face heights from the starting position.
export function headToMidi(u, { mode, range, songMidis, target, quantize }) {
  if (mode === 'song' && songMidis.length) {
    const n = songMidis.length;
    if (n === 1) return songMidis[0];
    const x = clamp((n - 1) / 2 + (u / range) * (n - 1), 0, n - 1);
    if (quantize) return songMidis[Math.round(x)];
    const i = Math.floor(x), fr = x - i;
    return i >= n - 1 ? songMidis[n - 1] : songMidis[i] + fr * (songMidis[i + 1] - songMidis[i]);
  }
  const m = target + (u / range) * 12;
  return quantize ? Math.round(m) : m;
}
// Pitch assist: pulls the person's note towards the song's note by the proportion a (0 to 1).
export const applyAssist = (user, target, a) => user + a * (target - user);
// Closeness to the note: 1 up to half a semitone off, decreasing to 0 at two semitones.
export function pitchCloseness(midi, target) {
  const dlt = Math.abs(midi - target);
  return dlt <= 0.5 ? 1 : Math.max(0, 1 - (dlt - 0.5) / 1.5);
}
// S = w_t·T + w_v·V + w_p·P, with T, V and P averaged over the frames of the note.
export function noteScore(acc, w) {
  const n = acc.frames || 0;
  const T = n ? acc.active / n : 0, V = n ? acc.vsum / n : 0, P = n ? acc.psum / n : 0;
  return { T, V, P, S: w.t * T + w.v * V + w.p * P };
}
// Song score (0 to 100): average of the sung notes; golden notes count double.
export function totalScore(notes, accs, w) {
  let num = 0, den = 0;
  notes.forEach((nt, i) => {
    if (nt.type === 'F' || !accs[i] || !accs[i].frames) return;
    const k = nt.type === '*' || nt.type === 'G' ? 2 : 1;
    num += k * noteScore(accs[i], w).S;
    den += k;
  });
  return den ? (100 * num) / den : 0;
}
export const LEVELS = {
  1: { assist: 1, tol: 'amplia', pitchMode: 'song', cons: 'auto', w: { t: 1, v: 0, p: 0 } },
  2: { assist: 1, tol: 'media', pitchMode: 'song', cons: 'auto', w: { t: 0.5, v: 0.5, p: 0 } },
  3: { assist: 0.5, tol: 'media', pitchMode: 'song', cons: 'gesture', w: { t: 0.34, v: 0.33, p: 0.33 } },
  4: { assist: 0, tol: 'estricta', pitchMode: 'song', cons: 'gesture', w: { t: 0.34, v: 0.33, p: 0.33 } },
};

// Decides when each consonant is sent to the engine while singing.

import { S } from '../state.js';
import { applyAllophones, ArticulationDetector, gestureStrength, onsetLead, openNorm, planCoda, planHum, planOnset, splitSyllable } from '../logic/articulation.js';
import { pickCoda } from '../logic/english.js';
import { voice } from '../voice/audio-engine.js';

// Each syllable is split into onset, nucleus and coda. Onset: in automatic mode it fires before the note starts
// (as long as the consonant lasts, about 50 ms) if the person is singing; in gesture mode, when the mouth closes and
// reopens near the start, more clearly the more marked the gesture is. Coda: near the end of the note.
export function buildArticulation() {
  const ns = S.song.notes;
  S.art = {
    next: 0, det: new ArticulationDetector(), lastEv: null, last: null,
    items: ns.map((n, i) => {
      if (n.en) {                                       // English: phonemes from the dictionary
        const e = n.en;
        return { onset: e.onset, nucleus: e.fam, coda: pickCoda(e.coda), cont: e.cont, lead: 0, hum: false, onsetFired: false, codaFired: false };
      }
      const pv = ns[i - 1];
      const wordStart = i === 0 || /^\s/.test(n.text) || (pv && (/\s$/.test(pv.text) || pv.line !== n.line));
      const sp = splitSyllable(n.text, { prev: n.vowel, wordStart });
      return { ...sp, lead: 0, hum: !sp.nucleus && !sp.cont && sp.onset.length > 0, onsetFired: false, codaFired: false };
    }),
  };
  if (!S.song.isEn) applyAllophones(S.art.items, ns);   // b d g between vowels → [β ð ɣ] (Spanish only)
  for (const a of S.art.items) a.lead = onsetLead(a.onset);
}
// Forgets which consonants already sounded (when seeking back or starting over).
export function resetArticulation() {
  if (!S.art) return;
  S.art.next = 0; S.art.lastEv = null; S.art.last = null; S.art.det.reset();
  for (const a of S.art.items) { a.onsetFired = false; a.codaFired = false; }
}
// Sends the onset of syllable i to the engine (or the hum of a syllable without a vowel), with the gesture's strength.
export function fireOnset(i, strength) {
  const a = S.art.items[i], n = S.song.notes[i];
  a.onsetFired = true;
  if (strength <= 0) return;
  const plan = a.hum
    ? planHum(a.onset, (n.endMs - Math.max(S.t, n.startMs)) / S.settings.speed)
    : planOnset(a.onset, strength, { vowel: a.nucleus });
  voice.articulate(plan);
  S.art.last = { i, strength, t: S.t };
}
// Every frame: fires the onsets and codas that are due according to the mode (automatic or by gesture).
export function updateArticulation({ active, faceFresh, singing, switchEdge }) {
  const A = S.art, st = S.settings;
  if (!A || !S.song || !S.playing || st.cons === 'off' || !voice || !voice.articulate) return;
  const sp = st.speed, notes = S.song.notes;
  if (st.cons === 'gesture') {
    const ev = switchEdge ? { t: S.t, depth: 1 } : faceFresh ? A.det.update(S.t, openNorm(S.face.f, S.model)) : null;
    if (ev) A.lastEv = ev;
  }
  while (A.next < notes.length && notes[A.next].endMs < S.t - 50) A.next++;
  for (let i = A.next; i < notes.length && notes[i].startMs - 400 * sp <= S.t; i++) {
    const n = notes[i], a = A.items[i];
    if (!a.onsetFired && a.onset.length) {
      if (st.cons === 'auto') {
        // Only sounds if the person is singing or sang less than 400 ms ago (the mouth closes between syllables).
        // If it starts late, the consonant comes out when the mouth opens, attached to its vowel: never a loose noise.
        if (S.t >= n.startMs - a.lead * sp) {
          if (S.t > n.startMs + 150 * sp && !S.waiting) a.onsetFired = true;
          else if (singing) fireOnset(i, 1);
        }
      } else {
        const from = n.startMs - 350 * sp, until = n.startMs + 150 * sp;
        const ev = A.lastEv;
        if (ev && !ev.used && ev.t >= from && ev.t <= Math.max(until, S.t)) {
          ev.used = true;
          fireOnset(i, gestureStrength(ev.depth));
        } else if (S.t > until && !S.waiting) {
          const s = gestureStrength(A.det.partialDepth());                             // still mouth: skipped or played softly
          fireOnset(i, active && s >= 0.15 ? 0.5 * s : 0);
        }
      }
    }
    if (!a.codaFired && a.coda.length && active && S.accs[i]?.started) {
      const codaAt = n.endMs - Math.min(110 * sp, (n.endMs - n.startMs) * 0.45);
      if (S.t >= codaAt && S.t < n.endMs) {
        a.codaFired = true;
        voice.articulate(planCoda(a.coda, (n.endMs - S.t) / sp, st.cons === 'gesture' ? 0.8 : 1, { vowel: a.nucleus }));
      }
    }
  }
}

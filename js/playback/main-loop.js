// Per-frame loop: face -> note and volume -> voice, consonants, score and drawing.

import { beginSetPosition, cal, collectPosition, posSamples, tickCalibration } from '../camera/calibration.js';
import { readFace } from '../camera/camera.js';
import { noteIndexAt, resetPlayback, targetNote } from '../songs/current-song.js';
import { updateArticulation } from './consonant-timing.js';
import { play, setPlayLabel, updatePlayer } from './player.js';
import { $, S } from '../state.js';
import { t } from '../i18n/language.js';
import { draw, laneYToMidi } from '../ui/drawing.js';
import { mouthDeltas } from '../logic/articulation.js';
import { applyAssist, headToMidi, LEVELS, noteScore, pitchCloseness, totalScore } from '../logic/pitch-score.js';
import { clamp, CLASSES, VOWELS } from '../logic/common.js';
import { englishWeights, glideAt } from '../logic/english.js';
import { classify, expectedVowelScore } from '../logic/vowels.js';
import { cantorVoice, ctx, playClick, playGuide, voice } from '../voice/audio-engine.js';

// Smooths each vowel's probability across frames (avoids flicker in the meter and in the voice).
export function smoothProbs(raw) {
  for (const c of CLASSES) S.probs[c] = 0.55 * S.probs[c] + 0.45 * raw[c];
}
// One frame of the main loop; it requests itself again with requestAnimationFrame at the end.
export function frame(now) {
  const dt = S.lastNow ? Math.min(100, now - S.lastNow) : 16;
  S.lastNow = now;
  const st = S.settings;
  readFace(now);
  collectPosition(now);
  tickCalibration(now);
  if (S.face.ok && S.calib.y0 == null && !posSamples && !cal) beginSetPosition(true);
  const faceFresh = S.face.ok && now - S.face.seenAt < 300;

  // 1. Vowel detected by the camera
  if (faceFresh) smoothProbs(classify(S.face.f, S.model));
  else smoothProbs(Object.fromEntries(CLASSES.map((c) => [c, c === 'rest' ? 1 : 0])));
  if (S.camActive && S.probs.rest > 0.6) S.camActive = false;
  else if (!S.camActive && S.probs.rest < 0.4) S.camActive = true;

  // 2. Song time
  const song = S.song;
  if (S.playing && song) {
    if (S.audioEl && !S.waiting) {
      S.t = S.audioEl.currentTime * 1000;
    } else if (!S.waiting) {
      S.t += dt * st.speed;
    }
  }
  const tgtIdx = song ? targetNote(S.t) : -1;
  const tgt = tgtIdx >= 0 ? song.notes[tgtIdx] : null;
  const expected = tgt ? tgt.vowel : null;

  // 3. Effective input: push-button (keyboard/touch) or camera
  let active = false, weights = null;
  const switchVowel = S.kbVowel || ((S.switchDown || S.ptr.down) ? (expected || 'a') : null);
  if (switchVowel) {
    active = true;
    weights = Object.fromEntries(VOWELS.map((v) => [v, v === switchVowel ? 1 : 0]));
  } else if (S.camActive && faceFresh) {
    active = true;
    const vs = VOWELS.reduce((s, v) => s + S.probs[v], 0) || 1;
    weights = Object.fromEntries(VOWELS.map((v) => [v, S.probs[v] / vs]));
  } else {
    weights = S.out.weights;
  }
  const vowelScore = switchVowel
    ? expectedVowelScore({ ...weights, rest: 0 }, expected, st.tol)
    : expectedVowelScore(S.probs, expected, st.tol);

  // Practice mode: the song waits for the syllable
  if (S.playing && song && st.timing === 'practice') {
    const cur = noteIndexAt(S.t);
    if (cur >= 0) {
      const nt = song.notes[cur];
      if (S.waiting) {
        if (active) {
          S.waiting = false; S.accs[cur].started = true;
          if (S.audioEl) S.audioEl.play().catch(() => {});
        } else {
          S.t = nt.startMs + 60;
        }
      } else if (!S.accs[cur].started && nt.type !== 'F' && S.t > nt.startMs + 60) {
        if (active) S.accs[cur].started = true;
        else { S.waiting = true; S.t = nt.startMs + 60; if (S.audioEl) S.audioEl.pause(); }
      }
    }
  }

  // 4. Altura
  const targetMidi = tgt ? tgt.midi : (S.songMidis[Math.floor(S.songMidis.length / 2)] ?? 60);
  let userMidi = targetMidi;
  if (S.ptr.down && S.ptr.y != null) userMidi = laneYToMidi(S.ptr.y);
  else if (faceFresh && S.calib.y0 != null) {
    const u = (S.calib.y0 - S.face.y) / S.calib.h0;
    userMidi = headToMidi(u, { mode: st.pitchMode, range: st.range, songMidis: S.songMidis, target: targetMidi, quantize: st.quantize });
  }
  const midi = applyAssist(userMidi, targetMidi, st.assist);

  // 5. Volumen
  let level = 0.8;
  if (st.volMode === 'proximity' && faceFresh && S.calib.w0 && !switchVowel) {
    level = clamp(0.7 + (S.face.faceW / S.calib.w0 - 1) * st.volSens, 0.08, 1);
  }
  const gain = active ? level : 0;
  Object.assign(S.out, { midi, user: userMidi, target: targetMidi, gain, active, weights, level });

  // 6. Syllable consonants and sound
  const switchOn = !!switchVowel, switchEdge = switchOn && !S.swPrev;
  S.swPrev = switchOn;
  if (active) S.lastActiveAt = now;
  const singing = active || now - (S.lastActiveAt ?? -1e9) < 400;
  updateArticulation({ active, faceFresh, singing, switchEdge });
  const mouth = !switchVowel && S.camActive && faceFresh ? mouthDeltas(S.face.f, weights, S.model) : null;
  if (ctx && voice && S.voiceOn) {
    // English song: the face picks the family (a e i o u) and the note decides the exact vowel and its diphthong
    const vw = tgt && tgt.en && voice === cantorVoice ? englishWeights(weights, tgt.en, glideAt(S.t, tgt.startMs, tgt.endMs)) : weights;
    voice.update({ weights: vw, midi: midi + Number(st.register), gain, active, effort: level, mouth });
  }

  // 7. Note scoring (with latency compensation)
  if (S.playing && song) {
    const tj = S.t - st.latency;
    const ji = noteIndexAt(tj);
    if (ji >= 0 && !S.waiting) {
      const a = S.accs[ji];
      a.frames++;
      if (active) {
        a.active++; a.started = true;
        a.vsum += vowelScore;
        a.psum += pitchCloseness(midi, song.notes[ji].midi);
      }
    }
    // melody guide and beat
    if (!S.waiting) {
      for (let i = 0; i < song.notes.length; i++) {
        const n = song.notes[i];
        if (n.startMs > S.t) break;
        if (n.startMs > S.prevT && n.startMs <= S.t && st.guide && n.type !== 'F') playGuide(n.midi + Number(st.register), (n.endMs - n.startMs) / st.speed);
      }
      if (st.pulse) {
        const q = song.beatMs * 4;
        const b0 = Math.floor((S.prevT - song.gap) / q), b1 = Math.floor((S.t - song.gap) / q);
        if (b1 > b0 && S.prevT >= 0) playClick(b1 % 4 === 0);
      }
    }
    S.prevT = S.t;
    S.trace.push({ t: S.t, midi, active, v: active ? argmaxVowel(weights) : null });
    while (S.trace.length && S.trace[0].t < S.t - 12000) S.trace.shift();
    const last = song.notes[song.notes.length - 1];
    if (S.t > last.endMs + 1500) endSong();
  }

  draw(expected, tgtIdx);
  updatePlayer(false);
  requestAnimationFrame(frame);
}
// The vowel with the most weight.
export const argmaxVowel = (w) => VOWELS.reduce((b, v) => (w[v] > w[b] ? v : b), 'a');

// End of the song: stops the music and the voice and shows the summary.
export function endSong() {
  S.playing = false; S.ended = true;
  if (S.audioEl) S.audioEl.pause();
  if (voice) voice.silence();
  setPlayLabel();
  renderSummary();
  $('summary').hidden = false;
}
// Final summary: how many notes were sung and, if scoring is on, the total and the timing, vowel
// and pitch averages; with the button to sing again.
export function renderSummary() {
  const sm = $('summary');
  sm.innerHTML = '';
  const h = document.createElement('h2'); h.textContent = t('done');
  sm.append(h);
  const sung = S.accs.filter((a) => a.active > 0).length;
  const p = document.createElement('p'); p.className = 'hint';
  p.textContent = t('sungOf', sung, S.song.notes.length);
  sm.append(p);
  if (S.settings.showScore) {
    const w = LEVELS[S.settings.level]?.w || LEVELS[3].w;
    const avg = (k) => {
      const xs = S.song.notes.map((n, i) => (n.type === 'F' || !S.accs[i].frames ? null : noteScore(S.accs[i], w)[k])).filter((x) => x != null);
      return xs.length ? Math.round((100 * xs.reduce((a, b) => a + b, 0)) / xs.length) : 0;
    };
    const nums = document.createElement('div'); nums.className = 'nums';
    for (const [lbl, val] of [[t('sScore'), Math.round(totalScore(S.song.notes, S.accs, w))], [t('sTime'), avg('T')], [t('sVowel'), avg('V')], [t('sPitch'), avg('P')]]) {
      const d = document.createElement('div');
      const b = document.createElement('b'); b.textContent = val;
      const s = document.createElement('span'); s.className = 'hint'; s.textContent = lbl;
      d.append(b, s); nums.append(d);
    }
    sm.append(nums);
  }
  const again = document.createElement('div');
  const btn = document.createElement('button'); btn.className = 'btn primary'; btn.type = 'button'; btn.textContent = t('again');
  btn.addEventListener('click', () => { resetPlayback(); play(); });
  again.append(btn);
  sm.append(again);
}

// Screen drawing: the note lane, what is drawn over the camera image (mouth, pitch scale,
// volume), the vowel bars, the reference mouth, the lyrics and the score.

import { LIP_INNER, LIP_OUTER } from '../camera/camera.js';
import { argmaxVowel } from '../playback/main-loop.js';
import { $, cssVar, S } from '../state.js';
import { nn, t } from '../i18n/language.js';
import { LEVELS, noteScore, totalScore } from '../logic/pitch-score.js';
import { clamp, CLASSES } from '../logic/common.js';

// Color of each vowel (or of silence), taken from the theme.
export const vowelColor = (v) => (PAL[v || 'rest'] || cssVar(v ? `--v-${v}` : '--v-rest'));

export const lane = $('lane'), lctx = lane.getContext('2d');
export const overlay = $('overlay'), octx = overlay.getContext('2d');
export let laneGeo = { w: 0, h: 0, lo: 55, hi: 75, playX: 0 };
// Matches the canvas resolution to its on-screen size and pixel density.
export function fitCanvas(cv, c2) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height };
}
// Height in the lane (px) of a MIDI note.
export function laneY(midi) {
  const { h, lo, hi } = laneGeo, pad = 26;
  return pad + (1 - (midi - lo) / (hi - lo)) * (h - 2 * pad);
}
// MIDI note for a height in the lane (to play the lane with a finger or the mouse).
export function laneYToMidi(y) {
  const { h, lo, hi } = laneGeo, pad = 26;
  return clamp(lo + (1 - (y - pad) / (h - 2 * pad)) * (hi - lo), lo, hi);
}
// Rounded rectangle in context c.
export function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, h / 2, Math.max(0, w) / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
export let lastScoreAt = 0;
export let PAL = {};
// Re-reads the theme colors (they change with light or dark mode).
export function refreshPalette() {
  PAL = { ink: cssVar('--ink'), muted: cssVar('--muted'), line: cssVar('--line'), accent: cssVar('--accent') };
  for (const c of CLASSES) PAL[c] = cssVar(`--v-${c}`);
}
// Draws everything for one frame: lane, face points, meters, lyrics and score.
export function draw(expected, tgtIdx) {
  refreshPalette();
  drawLane(tgtIdx);
  drawOverlay();
  drawMeters(expected, tgtIdx >= 0 ? S.song.notes[tgtIdx].en?.ipa : null);
  renderLyrics(false, tgtIdx);
  const nowMs = performance.now();
  if (S.settings.showScore && S.song && nowMs - lastScoreAt > 250) { lastScoreAt = nowMs; updateScore(); }
}
// Note lane: bars for each note (colored by vowel), the «now» line and the trail of what was sung.
export function drawLane(tgtIdx) {
  const { w, h } = fitCanvas(lane, lctx);
  const song = S.song;
  if (!song) return;
  const lo = S.songMidis[0] - 3, hi = S.songMidis[S.songMidis.length - 1] + 3;
  laneGeo = { w, h, lo, hi, playX: Math.max(70, w * 0.24) };
  const { ink, muted, line, accent } = PAL;
  lctx.clearRect(0, 0, w, h);
  const pxPerMs = (w - laneGeo.playX) / 5200;
  const X = (t) => laneGeo.playX + (t - S.t) * pxPerMs;
  // rows of the song's notes
  lctx.font = '500 11px "IBM Plex Mono", monospace';
  lctx.textBaseline = 'middle';
  for (const m of S.songMidis) {
    const y = laneY(m);
    lctx.strokeStyle = line; lctx.lineWidth = 1;
    lctx.beginPath(); lctx.moveTo(48, y); lctx.lineTo(w, y); lctx.stroke();
    lctx.fillStyle = muted; lctx.fillText(nn(m), 6, y);
  }
  const rowH = Math.max(12, Math.min(26, (h - 52) / (hi - lo) * 0.85));
  // notes (clipped so they do not cover the pitch labels)
  lctx.save();
  lctx.beginPath(); lctx.rect(46, 0, w - 46, h); lctx.clip();
  lctx.textBaseline = 'alphabetic';
  song.notes.forEach((n, i) => {
    const x0 = X(n.startMs), x1 = X(n.endMs);
    if (x1 < 40 || x0 > w) return;
    const y = laneY(n.midi), col = vowelColor(n.vowel);
    const isCur = i === tgtIdx;
    lctx.globalAlpha = n.type === 'F' ? 0.35 : 1;
    roundRect(lctx, x0, y - rowH / 2, x1 - x0, rowH, 6);
    lctx.fillStyle = col; lctx.globalAlpha *= 0.18; lctx.fill();
    lctx.globalAlpha = n.type === 'F' ? 0.35 : 1;
    lctx.strokeStyle = col; lctx.lineWidth = n.type === '*' ? 3 : isCur ? 2.5 : 1.5; lctx.stroke();
    // fill according to what was sung
    const a = S.accs[i];
    if (a && a.frames && S.settings.showScore) {
      const sc = noteScore(a, LEVELS[S.settings.level]?.w || LEVELS[3].w).S;
      lctx.save(); roundRect(lctx, x0, y - rowH / 2, x1 - x0, rowH, 6); lctx.clip();
      lctx.fillStyle = col; lctx.globalAlpha = 0.5;
      lctx.fillRect(x0, y + rowH / 2 - rowH * sc, x1 - x0, rowH * sc);
      lctx.restore();
    }
    lctx.globalAlpha = 1;
    if (n.vowel && x1 - x0 > 16) {
      lctx.fillStyle = col; lctx.font = '700 12px "IBM Plex Mono", monospace';
      lctx.fillText(n.en ? n.en.ipa : n.vowel, x0 + 6, y + 4);
    }
    lctx.fillStyle = isCur ? ink : muted;
    lctx.font = `${isCur ? 700 : 400} 14px "Atkinson Hyperlegible", sans-serif`;
    lctx.fillText(n.text.trim(), x0, y - rowH / 2 - 6);
  });
  lctx.restore();
  // voice trail
  for (const p of S.trace) {
    if (!p.active) continue;
    const x = X(p.t);
    if (x < 40 || x > laneGeo.playX + 1) continue;
    lctx.fillStyle = vowelColor(p.v);
    lctx.fillRect(x - 1.5, laneY(p.midi) - 2.5, 3, 5);
  }
  // cabezal
  lctx.strokeStyle = accent; lctx.lineWidth = 2;
  lctx.beginPath(); lctx.moveTo(laneGeo.playX, 8); lctx.lineTo(laneGeo.playX, h - 8); lctx.stroke();
  const yv = laneY(S.out.midi);
  lctx.beginPath(); lctx.arc(laneGeo.playX, yv, S.out.active ? 9 : 5, 0, Math.PI * 2);
  lctx.fillStyle = S.out.active ? vowelColor(argmaxVowel(S.out.weights)) : line; lctx.fill();
  // mensajes
  lctx.font = '700 15px "Atkinson Hyperlegible", sans-serif'; lctx.fillStyle = ink;
  const first = song.notes[0];
  if (!S.playing && !S.ended) {
    lctx.fillText(t(S.t > 0 ? 'paused' : 'pressStart'), laneGeo.playX + 14, 22);
  } else if (S.playing && S.t < first.startMs) {
    const secs = Math.ceil((first.startMs - S.t) / 1000);
    lctx.fillText(t('startsIn', secs), laneGeo.playX + 14, 22);
  } else if (S.waiting && tgtIdx >= 0) {
    const n = song.notes[tgtIdx];
    lctx.fillText(t('waiting', n.text.trim(), n.en ? n.en.ipa : n.vowel), laneGeo.playX + 14, 22);
  }
}
// Draws over the video the lip outline that MediaPipe reads.
export function drawOverlay() {
  const { w, h } = fitCanvas(overlay, octx);
  octx.clearRect(0, 0, w, h);
  if (!S.face.ok || !S.face.lm) return;
  const video = $('video');
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  // object-fit: cover
  const sc = Math.max(w / vw, h / vh), ox = (w - vw * sc) / 2, oy = (h - vh * sc) / 2;
  const px = (p) => ({ x: w - (ox + p.x * vw * sc), y: oy + p.y * vh * sc });
  const lm = S.face.lm;
  const col = S.out.active ? vowelColor(argmaxVowel(S.out.weights)) : vowelColor(null);
  for (const ring of [LIP_OUTER, LIP_INNER]) {
    octx.beginPath();
    ring.forEach((idx, k) => { const p = px(lm[idx]); k ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y); });
    octx.closePath(); octx.strokeStyle = col; octx.lineWidth = 2.5; octx.stroke();
  }
  // pitch scale (like the lines of the Singing Machine), centered on the starting position
  if (S.calib.y0 != null) {
    const st = S.settings, yImg = (yw) => oy + (yw / (S.face.asp || 0.75)) * vh * sc;
    const ticks = [];
    if (st.pitchMode === 'song') {
      const n = S.songMidis.length;
      S.songMidis.forEach((m, i) => ticks.push({ m, u: n > 1 ? ((i - (n - 1) / 2) / (n - 1)) * st.range : 0 }));
    } else {
      for (let k = -4; k <= 4; k++) ticks.push({ m: S.out.target + k, u: (k / 12) * st.range });
    }
    const bandW = 54;
    octx.fillStyle = 'rgba(0,0,0,0.35)'; octx.fillRect(0, 0, bandW, h);
    octx.font = '500 10px "IBM Plex Mono", monospace'; octx.textBaseline = 'middle';
    for (const tk of ticks) {
      const y = yImg(S.calib.y0 - tk.u * S.calib.h0);
      if (y < 4 || y > h - 4) continue;
      const isT = Math.round(tk.m) === Math.round(S.out.target);
      octx.strokeStyle = isT ? '#ffffff' : 'rgba(255,255,255,0.45)'; octx.lineWidth = isT ? 2 : 1;
      octx.beginPath(); octx.moveTo(4, y); octx.lineTo(bandW - 4, y); octx.stroke();
      octx.fillStyle = '#ffffff'; octx.fillText(nn(tk.m), 6, y - 7);
    }
    const yNow = yImg(S.face.y);
    octx.beginPath(); octx.arc(bandW / 2, clamp(yNow, 6, h - 6), 6, 0, Math.PI * 2);
    octx.fillStyle = col; octx.fill(); octx.strokeStyle = '#ffffff'; octx.lineWidth = 1.5; octx.stroke();
    // volumen
    const lv = S.out.level ?? 0.8;
    octx.fillStyle = 'rgba(0,0,0,0.35)'; octx.fillRect(w - 14, 8, 8, h - 16);
    octx.fillStyle = '#ffffff'; octx.fillRect(w - 14, 8 + (h - 16) * (1 - lv), 8, (h - 16) * lv);
  }
}
export let meterEls = null;
// Builds the vowel meters (one bar per vowel plus rest).
export function buildMeters() {
  const box = $('meters'); box.innerHTML = '';
  meterEls = {};
  for (const c of CLASSES) {
    const row = document.createElement('div'); row.className = 'vbar';
    const b = document.createElement('b'); b.textContent = c === 'rest' ? '—' : t('fam.' + c);
    b.style.color = `var(--v-${c})`;
    const tr = document.createElement('div'); tr.className = 'track';
    const fill = document.createElement('i'); fill.style.background = `var(--v-${c})`;
    tr.append(fill); row.append(b, tr); box.append(row);
    meterEls[c] = { row, fill, label: b };
  }
}
export const MOUTH = { a: [56, 46], e: [62, 28], i: [66, 14], o: [42, 40], u: [26, 26] };
export let lastExpected = undefined, lastLabel = null;
// Updates the meters and marks the expected vowel.
export function drawMeters(expected, label = null) {
  for (const c of CLASSES) {
    meterEls[c].fill.style.width = `${(S.probs[c] * 100).toFixed(0)}%`;
    meterEls[c].row.classList.toggle('expected', c === expected);
  }
  if (expected !== lastExpected || label !== lastLabel) {
    lastExpected = expected; lastLabel = label;
    const [mw, mh] = MOUTH[expected] || [56, 6];
    const sh = $('mouthShape');
    sh.style.width = `${mw}px`; sh.style.height = `${mh}px`;
    sh.style.borderColor = `var(--v-${expected || 'rest'})`;
    $('mouthLbl').textContent = expected ? `/${label || expected}/` : '–';
    $('mouthLbl').style.color = `var(--v-${expected || 'rest'})`;
  }
}
// Lyrics: the current line with the current syllable highlighted, and the next line.
export function renderLyrics(force, tgtIdx = -1) {
  const song = S.song;
  if (!song) return;
  const ni = tgtIdx >= 0 ? tgtIdx : 0;
  const lineIdx = song.notes[ni].line;
  if (force || lineIdx !== S.lineShown) {
    S.lineShown = lineIdx;
    const now = $('lyricNow'); now.innerHTML = '';
    song.notes.forEach((n, i) => {
      if (n.line !== lineIdx) return;
      const sp = document.createElement('span');
      sp.textContent = n.text === '~' ? '' : n.text.replace(/~/g, '');
      sp.dataset.i = i;
      now.append(sp);
    });
    const next = song.notes.filter((n) => n.line === lineIdx + 1).map((n) => n.text.replace(/~/g, '')).join('');
    $('lyricNext').textContent = next || ' ';
    S.noteShown = -2;
  }
  if (ni !== S.noteShown) {
    S.noteShown = ni;
    for (const sp of $('lyricNow').children) {
      const i = Number(sp.dataset.i);
      sp.className = i < ni ? 'past' : i === ni ? 'now' : '';
      sp.style.textDecorationColor = i === ni ? `var(--v-${song.notes[i].vowel || 'rest'})` : '';
    }
  }
}
// Live score (if enabled in the settings).
export function updateScore() {
  const box = $('scoreBox');
  box.hidden = !S.settings.showScore;
  if (!S.settings.showScore || !S.song) return;
  $('scoreNum').textContent = Math.round(totalScore(S.song.notes, S.accs, LEVELS[S.settings.level]?.w || LEVELS[3].w));
}

// Forgets the vowel shown under the mouth so it is redrawn (when the song's pronunciation changes)
export function forgetMeterState() { lastExpected = undefined; }

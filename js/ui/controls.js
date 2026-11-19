// Controls: volumes, voice button, levels and settings (reading and writing the page controls), the
// player buttons and the push-button (space bar, vowel keys or pressing the lane).

import { relang, resetPlayback } from '../songs/current-song.js';
import { fmtTime, pause, play, seekTo, updatePlayer } from '../playback/player.js';
import { STORE_KEY } from '../config.js';
import { $, S, saveStore, toast } from '../state.js';
import { t } from '../i18n/language.js';
import { updateScore } from './drawing.js';
import { LEVELS } from '../logic/pitch-score.js';
import { VOWELS } from '../logic/common.js';
import { cantorVoice, ctx, ensureAudio, musicBus, voice, voiceBus, voiceSettings } from '../voice/audio-engine.js';

// Voice and music volumes, and the button that mutes the voice (also works with the song paused)
export function applyVolumes() {
  const st = S.settings;
  if (ctx) {
    voiceBus.gain.setTargetAtTime(S.voiceOn ? st.voiceVol : 0, ctx.currentTime, 0.03);
    musicBus.gain.setTargetAtTime(st.musicVol, ctx.currentTime, 0.05);
  }
  if (S.audioEl) S.audioEl.volume = st.musicVol;
}
// Turns the synthetic voice on or off (shortcut: V).
export function setVoiceOn(on) {
  S.voiceOn = on;
  if (!on && voice) voice.silence();
  applyVolumes();
  const b = $('voiceBtn');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = t(on ? 'voiceOn' : 'voiceOff');
  toast(t(on ? 'voiceOnToast' : 'voiceOffToast'));
}
// Applies one of the four assistance levels (pitch assist, tolerance, note mode and consonants).
export function applyLevel(lv) {
  const L = LEVELS[lv];
  Object.assign(S.settings, { level: String(lv), assist: L.assist, tol: L.tol, pitchMode: L.pitchMode, cons: L.cons });
  syncControls();
  saveStore();
}
export const RANGES = {
  speed: (v) => `${Math.round(v * 100)} %`,
  latency: (v) => `${v} ms`,
  assist: (v) => `${Math.round(v * 100)} %`,
  range: (v) => t('faces', Number(v).toFixed(2)),
  volSens: (v) => `× ${Number(v).toFixed(2)}`,
  voiceVol: (v) => `${Math.round(v * 100)} %`,
  musicVol: (v) => `${Math.round(v * 100)} %`,
  tension: (v) => `${Math.round(v * 100)} %`,
  breath: (v) => `${Math.round(v * 100)} %`,
};
// Sets every control on the page to the value in S.settings.
export function syncControls() {
  const st = S.settings;
  for (const k of ['timing', 'pitchMode', 'tol', 'volMode', 'register', 'tract', 'cons', 'vowels', 'consSrc', 'songLang']) $(k).value = st[k];
  for (const k of Object.keys(RANGES)) { $(k).value = st[k]; $(k + 'Val').textContent = RANGES[k](st[k]); }
  for (const k of ['pulse', 'quantize', 'guide', 'showScore']) $(k).checked = !!st[k];
  for (const r of document.querySelectorAll('input[name="level"]')) r.checked = r.value === st.level;
  $('volSens').disabled = st.volMode !== 'proximity';
  updateScore();
}

// Settings, player, voice and advanced settings
export function wireControls() {
  for (const k of ['timing', 'pitchMode', 'tol', 'volMode', 'register', 'tract', 'cons', 'vowels', 'consSrc', 'songLang']) {
    $(k).addEventListener('change', () => {
      S.settings[k] = $(k).value;
      if (k === 'songLang') relang();
      if (k === 'tract' || k === 'vowels' || k === 'consSrc') cantorVoice?.setVoice(voiceSettings());
      syncControls(); saveStore();
    });
  }
  for (const k of Object.keys(RANGES)) {
    $(k).addEventListener('input', () => {
      S.settings[k] = Number($(k).value);
      $(k + 'Val').textContent = RANGES[k](S.settings[k]);
      if (k === 'voiceVol' || k === 'musicVol') applyVolumes();
      if (k === 'speed' && S.audioEl) S.audioEl.playbackRate = S.settings.speed;
      if (k === 'tension' || k === 'breath') cantorVoice?.setVoice(voiceSettings());
      saveStore();
    });
  }
  for (const k of ['pulse', 'quantize', 'guide', 'showScore']) {
    $(k).addEventListener('change', () => {
      S.settings[k] = $(k).checked;
      syncControls(); saveStore();
    });
  }
  for (const r of document.querySelectorAll('input[name="level"]')) r.addEventListener('change', () => applyLevel(r.value));

  $('playBtn').addEventListener('click', () => (S.playing ? pause() : play()));
  $('restartBtn').addEventListener('click', () => { resetPlayback(); play(); });
  $('backBtn').addEventListener('click', () => seekTo(S.t - 5000));
  $('fwdBtn').addEventListener('click', () => seekTo(S.t + 5000));
  $('introBtn').addEventListener('click', () => seekTo(S.song.notes[0].startMs - 3000));
  const sk = $('seek');
  sk.addEventListener('input', () => { S.seeking = true; $('tCur').textContent = fmtTime(Number(sk.value)); seekTo(Number(sk.value)); });
  sk.addEventListener('change', () => { S.seeking = false; seekTo(Number(sk.value)); });
  sk.addEventListener('pointerup', () => { S.seeking = false; });
  sk.addEventListener('keydown', (e) => {   // with the bar focused, the arrow keys also jump 5 s
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); seekTo(S.t + (e.key === 'ArrowLeft' ? -5000 : 5000)); }
  });
  $('voiceBtn').addEventListener('click', () => { ensureAudio(); setVoiceOn(!S.voiceOn); });
  const advOpen = (open) => {
    $('advanced').hidden = !open;
    $('advBtn').setAttribute('aria-expanded', String(open));
    $('advBtn').textContent = t(open ? 'advHide' : 'advShow');
    try { localStorage.setItem(STORE_KEY + ':adv', open ? '1' : ''); } catch (e) { /* ignorar */ }
  };
  $('advBtn').addEventListener('click', () => advOpen($('advanced').hidden));
  try { if (localStorage.getItem(STORE_KEY + ':adv')) advOpen(true); } catch (e) { /* ignorar */ }
}

// Push-button: space bar, vowel keys or holding the lane pressed
export function wireSwitch() {
  const isField = (el) => el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
  document.addEventListener('keydown', (e) => {
    if (isField(e.target) || e.ctrlKey || e.metaKey || e.altKey || $('welcome').open) return;
    const k = e.key.toLowerCase();
    if (k === ' ') e.preventDefault();             // the space bar is the push-button, even with focus on a button
    if (e.repeat) return;
    if (k === ' ') { ensureAudio(); S.switchDown = true; }
    else if (VOWELS.includes(k)) { ensureAudio(); S.kbVowel = k; }
    else if (k === 'p') { S.playing ? pause() : play(); }
    else if (k === 'v') { ensureAudio(); setVoiceOn(!S.voiceOn); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(S.t - 5000); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(S.t + 5000); }
    else if (e.key === 'Home') { e.preventDefault(); resetPlayback(); updatePlayer(true); }
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') { if (!isField(e.target) && !$('welcome').open) e.preventDefault(); S.switchDown = false; }
    if (VOWELS.includes(k) && S.kbVowel === k) S.kbVowel = null;
  });
  window.addEventListener('blur', () => { S.switchDown = false; S.kbVowel = null; S.ptr.down = false; });
  const lc = $('lanecv');
  const ptrY = (e) => e.clientY - lc.getBoundingClientRect().top;
  lc.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.summary')) return;
    ensureAudio(); S.ptr.down = true; S.ptr.y = ptrY(e); lc.setPointerCapture(e.pointerId);
  });
  lc.addEventListener('pointermove', (e) => { if (S.ptr.down) S.ptr.y = ptrY(e); });
  const up = () => { S.ptr.down = false; };
  lc.addEventListener('pointerup', up); lc.addEventListener('pointercancel', up);
}

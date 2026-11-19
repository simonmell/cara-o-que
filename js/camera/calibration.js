// Starting position (height and size of the face at rest) and guided vowel calibration: six steps in
// which the person's mouth features are recorded to replace the default templates.

import { setStatus } from './camera.js';
import { $, S, saveStore, toast } from '../state.js';
import { t } from '../i18n/language.js';
import { clamp } from '../logic/common.js';
import { fitModel } from '../logic/vowels.js';

// Starting position: height, face size and mouth shape at rest.
export let posSamples = null;
// Starts collecting the head position for 0.7 s (auto: the first time the face appears).
export function beginSetPosition(auto) {
  posSamples = { ys: [], hs: [], ws: [], fs: [], auto, until: performance.now() + 700 };
}
// Adds one position sample; when the time is up, stores the average as the starting position (S.calib).
export function collectPosition(now) {
  if (!posSamples || !S.face.ok) return;
  posSamples.ys.push(S.face.y); posSamples.hs.push(S.face.faceH); posSamples.ws.push(S.face.faceW); posSamples.fs.push(S.face.f);
  if (now < posSamples.until) return;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  S.calib = { y0: avg(posSamples.ys), h0: avg(posSamples.hs), w0: avg(posSamples.ws) };
  toast(t(posSamples.auto ? 'posAuto' : 'posSet'));
  setStatus('camReady');
  posSamples = null;
}

// Guided vowel calibration
export const CAL_STEPS = ['rest', 'a', 'e', 'i', 'o', 'u'].map((c) => ({ c }));   // texts: MSG «cal.<vowel>»
export let cal = null;
// Opens the calibration panel and starts with the first step (mouth at rest).
export function startCalibration() {
  cal = { step: 0, phaseStart: performance.now(), samples: {} };
  $('calib').hidden = false;
  showCalStep();
}
// Shows the current step and restarts its clock.
export function showCalStep() {
  renderCalStep();
  cal.phaseStart = performance.now();
}
// Writes the step number, the vowel and the instruction in the panel (also when the language changes).
export function renderCalStep() {
  const st = CAL_STEPS[cal.step];
  $('calStep').textContent = `${cal.step + 1}/${CAL_STEPS.length} · ${t('cal.' + st.c)}`;
  $('calHint').textContent = t('cal.' + st.c + '.h');
  $('calSkip').textContent = t(cal.step === 0 ? 'calSkip0' : 'calSkip');
}
// Every frame: waits 1.2 s for the mouth to settle, collects face features for 1.6 s and moves on to the next step.
export function tickCalibration(now) {
  if (!cal) return;
  const el = now - cal.phaseStart, settle = 1200, capture = 1600;
  $('calProg').style.width = `${clamp(el / (settle + capture), 0, 1) * 100}%`;
  if (el > settle && S.face.ok) {
    const st = CAL_STEPS[cal.step];
    (cal.samples[st.c] ||= []).push(S.face.f.slice());
    if (st.c === 'rest') {
      (cal.pos ||= []).push([S.face.y, S.face.faceH, S.face.faceW]);
    }
  }
  if (el > settle + capture) nextCalStep();
}
// Goes to the next step or, if it was the last one, finishes.
export function nextCalStep() {
  cal.step++;
  if (cal.step >= CAL_STEPS.length) return finishCalibration();
  showCalStep();
}
// Fits the vowel model with the collected samples, stores the rest position and closes the panel.
export function finishCalibration() {
  S.model = fitModel(cal.samples);
  if (cal.pos && cal.pos.length) {
    const avg = (k) => cal.pos.reduce((s, p) => s + p[k], 0) / cal.pos.length;
    S.calib = { y0: avg(0), h0: avg(1), w0: avg(2) };
  }
  saveStore();
  const n = S.model.calibrated.filter((c) => c !== 'rest').length;
  toast(n ? t('calSaved', n) : t('calNone'));
  cancelCalibration();
}
// Closes the panel without changing the model.
export function cancelCalibration() { cal = null; $('calib').hidden = true; }

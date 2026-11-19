// Camera and MediaPipe: opens the camera, loads the face model and, on every video frame, measures the mouth
// features, the head height and the face size. Also the status message under the camera.

import { beginSetPosition, cancelCalibration, nextCalStep, startCalibration } from './calibration.js';
import { MODEL_URL, MP_URL, MP_WASM } from '../config.js';
import { $, S } from '../state.js';
import { t } from '../i18n/language.js';
import { ensureAudio } from '../voice/audio-engine.js';

export let landmarker = null, stream = null, lastVideoTime = -1;
// Requests the camera (or the one chosen in the list), loads MediaPipe Face Landmarker the first time and starts reading the face.
export async function startCamera(deviceId) {
  ensureAudio();
  const msg = $('camStatus');
  msg.classList.remove('err');
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus('noGum', true); return;
  }
  try {
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId }, width: 640, height: 480 } : { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
  } catch (e) {
    setStatus('camFail', true);
    return;
  }
  const video = $('video');
  video.srcObject = stream;
  await video.play().catch(() => {});
  $('camMsg').hidden = true;
  listCameras(stream.getVideoTracks()[0]?.getSettings().deviceId);
  if (!landmarker) {
    setStatus('loadingModel');
    try {
      const vision = await import(MP_URL);
      const fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate }, outputFaceBlendshapes: true, runningMode: 'VIDEO', numFaces: 1,
      });
      try { landmarker = await vision.FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
      catch (e) { landmarker = await vision.FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
    } catch (e) {
      setStatus('mpFail', true);
      return;
    }
  }
  setStatus(S.calib.y0 == null ? 'camReadyPos' : 'camReady');
  $('posBtn').disabled = false; $('calBtn').disabled = false;
}
// Fills the camera drop-down (device names only show up after permission is granted).
export async function listCameras(currentId) {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const sel = $('camSel');
    sel.innerHTML = '';
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId; o.textContent = d.label || t('camN', i + 1);
      if (d.deviceId === currentId) o.selected = true;
      sel.append(o);
    });
    sel.hidden = devs.length < 2;
  } catch (e) { /* no camera list */ }
}

export const LIP_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
export const LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
// Reads the face in the current video frame: from the MediaPipe landmarks and blendshapes it builds the 7 mouth features
// (opening, width, jaw, funnel, pucker, smile, stretch), the head height and the face size.
export function readFace(now) {
  const video = $('video');
  if (!landmarker || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  let res;
  try { res = landmarker.detectForVideo(video, now); } catch (e) { return; }
  const lm = res.faceLandmarks?.[0];
  if (!lm) { S.face.ok = false; return; }
  const asp = (video.videoHeight || 3) / (video.videoWidth || 4);
  const P = (i) => ({ x: lm[i].x, y: lm[i].y * asp });
  const dist = (i, j) => { const a = P(i), b = P(j); return Math.hypot(a.x - b.x, a.y - b.y); };
  const bs = {};
  for (const c of res.faceBlendshapes?.[0]?.categories || []) bs[c.categoryName] = c.score;
  const faceW = dist(234, 454), faceH = dist(10, 152);
  if (faceW < 1e-4) return;
  const f = [
    (dist(13, 14) / faceW) * 5,
    (dist(61, 291) / faceW) * 2.5,
    bs.jawOpen || 0, bs.mouthFunnel || 0, bs.mouthPucker || 0,
    ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2,
    ((bs.mouthStretchLeft || 0) + (bs.mouthStretchRight || 0)) / 2,
  ];
  Object.assign(S.face, { ok: true, f, y: P(168).y, faceW, faceH, lm, asp, seenAt: now });
}

// Status message under the camera (text key; err = shown in red). Stored so it can be re-translated when the language changes.
export function setStatus(key, err = false) {
  S.status = { key, err };
  const el = $('camStatus'); el.textContent = t(key); el.classList.toggle('err', err);
}

// Camera buttons: turn it on, choose another one, set the starting position and calibrate the vowels
export function wireCamera() {
  $('camBtn').addEventListener('click', () => startCamera());
  $('camSel').addEventListener('change', () => startCamera($('camSel').value));
  $('posBtn').addEventListener('click', () => beginSetPosition(false));
  $('calBtn').addEventListener('click', () => startCalibration());
  $('calSkip').addEventListener('click', () => nextCalStep());
  $('calCancel').addEventListener('click', () => cancelCalibration());
}

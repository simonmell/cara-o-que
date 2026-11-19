// General configuration: where MediaPipe and its face model are downloaded from, the key under which the settings
// are stored in the browser, and the initial value of every setting.

export const MP_VERSION = '0.10.21';
export const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
export const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
// To use it offline, download the model and put 'face_landmarker.task' here (path next to index.html).
export const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
export const STORE_KEY = 'karaoke-facial-v1';

// Songs from a Google Drive folder (see docs/google-drive.md). The folder must be shared as «anyone with the
// link can view», with one subfolder per song. Leave them empty to use only the local songs folder.
// It is better not to write the key here (it would end up on GitHub): on Netlify it comes from environment variables
// through drive-config.js, which tools/netlify-build.cjs writes when the site is published.
// The folder can also be chosen in the address: ...?drive=<folder ID>
export const DRIVE_API_KEY = '';
export const DRIVE_FOLDER_ID = '';

export const DEFAULTS = {
  level: '1', timing: 'practice', speed: 0.85, latency: 0, pulse: false,
  pitchMode: 'song', assist: 1, range: 0.5, quantize: true,
  tol: 'amplia', volMode: 'proximity', volSens: 2.5,
  register: '0', voiceVol: 0.8, musicVol: 0.8, guide: true,
  tension: 0.5, breath: 0.05, tract: '0.36', cons: 'auto', vowels: 'cd', consSrc: 'auto',
  showScore: false, songLang: 'auto',
};

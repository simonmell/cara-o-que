// Startup.

import { cal, renderCalStep } from './camera/calibration.js';
import { listCameras, setStatus, stream, wireCamera } from './camera/camera.js';
import { fillSongs, sel, wireSongLibrary } from './songs/song-library.js';
import { renderMeta, setSong } from './songs/current-song.js';
import { DEMO_SONG } from './songs/demo-songs.js';
import { frame, renderSummary } from './playback/main-loop.js';
import { setPlayLabel } from './playback/player.js';
import { $, loadStore, S } from './state.js';
import { captureSpanish, chooseInitialLang, LANG, langHooks, setLang, t } from './i18n/language.js';
import { wireWelcome } from './ui/welcome.js';
import { syncControls, wireControls, wireSwitch } from './ui/controls.js';
import { buildMeters, meterEls } from './ui/drawing.js';
import { CLASSES } from './logic/common.js';
import { cantorVoice, voice } from './voice/audio-engine.js';

loadStore();
captureSpanish();                  // before translating: the HTML texts are the Spanish version
chooseInitialLang();              // the one chosen last time or, if there is none, the browser's
S.status = { key: 'camOff', err: false };
buildMeters();
wireControls();
wireWelcome();
wireCamera();
wireSongLibrary();
// When the language changes: redo the texts built by the code
langHooks.push(() => {
  setPlayLabel();
  for (const c of CLASSES) if (c !== 'rest') meterEls[c].label.textContent = t('fam.' + c);
  $('voiceBtn').textContent = t(S.voiceOn ? 'voiceOn' : 'voiceOff');
  $('advBtn').textContent = t($('advanced').hidden ? 'advShow' : 'advHide');
  if (S.status) setStatus(S.status.key, S.status.err);
  renderMeta();
  fillSongs(Number(sel.value) || 0);
  if (cal) renderCalStep();
  if (S.ended && !$('summary').hidden) renderSummary();
  syncControls();
  if (stream) listCameras(stream.getVideoTracks()[0]?.getSettings().deviceId);
});
wireSwitch();
syncControls();
setSong(DEMO_SONG);
setLang(LANG, false);
// To inspect the state from the browser console (and from the automated tests)
window.karaokeDebug = { get state() { return S; }, get voice() { return voice; }, get cantor() { return cantorVoice; } };
requestAnimationFrame(frame);

// Welcome dialog: opens when the app starts and with «Help». The first thing is choosing the language.

import { startCamera } from '../camera/camera.js';
import { $ } from '../state.js';
import { LANG, setLang } from '../i18n/language.js';

// Welcome dialog: opens on entry and with «Help»; its buttons close it or turn on the camera.
export function wireWelcome() {
  const welcome = $('welcome');
  const openWelcome = () => {
    $('welcomeCam').hidden = $('camMsg').hidden;          // with the camera already running, only «Close»
    if (!welcome.open) welcome.showModal();
    welcome.querySelector(`.langbtn[data-lang="${LANG}"]`)?.focus();   // first of all: choose the language
  };
  for (const b of welcome.querySelectorAll('.langbtn')) b.addEventListener('click', () => setLang(b.dataset.lang, true));
  $('helpBtn').addEventListener('click', openWelcome);
  welcome.addEventListener('click', (e) => { if (e.target === welcome) welcome.close(); });   // click outside the dialog
  welcome.addEventListener('close', () => { if (welcome.returnValue === 'cam') startCamera(); welcome.returnValue = ''; });
  if (typeof welcome.showModal === 'function') openWelcome();
}

// Interface language (Spanish / English): translation of the page texts and messages, note names
// by language, and choice of the initial language.

import { STORE_KEY } from '../config.js';
import { HTML_EN, MSG } from './strings.js';
import { noteName } from '../logic/common.js';

// The fixed texts of the page are written in Spanish in the HTML and marked with data-t (content), data-t-title and
// data-t-aria (attributes). At startup those texts are stored as the «es» version; HTML_EN holds the English version.
// Texts built by the code come from MSG through t(key, ...data).
export const LANG_KEY = STORE_KEY + ':lang';
export const NOTE_NAMES_EN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export let LANG = 'es';
export const HTML_ES = {};
export const T_ATTRS = [['data-t-title', 'title'], ['data-t-aria', 'aria-label']];
// Translated text for key k in the current language (falling back to Spanish); function entries receive a.
export const t = (k, ...a) => { const v = MSG[LANG][k] ?? MSG.es[k] ?? k; return typeof v === 'function' ? v(...a) : v; };
// Note name: Do4, Re♯4… in Spanish; C4, D♯4… in English
export const nn = (midi) => {
  if (LANG === 'es') return noteName(midi);
  const m = Math.round(midi);
  return NOTE_NAMES_EN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
};
// Stores the Spanish written in index.html before translating, so it can be restored.
export function captureSpanish() {
  for (const el of document.querySelectorAll('[data-t]')) HTML_ES[el.dataset.t] ??= el.innerHTML;
  for (const [a, attr] of T_ATTRS) for (const el of document.querySelectorAll(`[${a}]`)) HTML_ES[el.getAttribute(a)] ??= el.getAttribute(attr);
}
// Initial language: the one chosen before or, the first time, the browser's.
export function initialLang() {
  try { const l = localStorage.getItem(LANG_KEY); if (l === 'es' || l === 'en') return l; } catch (e) { /* ignorar */ }
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'es';
  return /^es\b/i.test(nav) ? 'es' : 'en';
}
export const langHooks = [];          // texts built by the code that must be redone when the language changes
// Changes the language of the whole interface (HTML texts, attributes and texts built by code); save: remember it.
export function setLang(lang, save) {
  LANG = lang === 'en' ? 'en' : 'es';
  const dict = LANG === 'en' ? HTML_EN : HTML_ES;
  document.documentElement.lang = LANG;
  for (const el of document.querySelectorAll('[data-t]')) { const v = dict[el.dataset.t] ?? HTML_ES[el.dataset.t]; if (v != null) el.innerHTML = v; }
  for (const [a, attr] of T_ATTRS) {
    for (const el of document.querySelectorAll(`[${a}]`)) { const k = el.getAttribute(a), v = dict[k] ?? HTML_ES[k]; if (v != null) el.setAttribute(attr, v); }
  }
  for (const b of document.querySelectorAll('.langbtn')) b.setAttribute('aria-pressed', String(b.dataset.lang === LANG));
  for (const f of langHooks) f();
  if (save) { try { localStorage.setItem(LANG_KEY, LANG); } catch (e) { /* ignorar */ } }
}

// At startup: the language chosen last time or, if there is none, the browser's
export function chooseInitialLang() { LANG = initialLang(); }

// Vowels, camera classes and small helpers shared by the logic.

export const VOWELS = ['a', 'e', 'i', 'o', 'u'];
export const CLASSES = ['a', 'e', 'i', 'o', 'u', 'rest'];
export const NEIGHBORS = { a: [], e: ['i'], i: ['e'], o: ['u'], u: ['o'] };
export const NOTE_NAMES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
// Clamps x to the interval [a, b].
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// Name of a MIDI note in Spanish: 60 → "Do4".
export function noteName(midi) {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}
// Number from a text that may use a decimal comma ("3,5" → 3.5).
export const parseNum = (s) => parseFloat(String(s ?? '').trim().replace(',', '.'));

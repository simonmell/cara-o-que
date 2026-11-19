// Recorded consonants (OpenSLR 61, CC BY-SA 4.0) for use outside the browser: reads data/consonant-samples.json
// and decodes each fragment (16-bit PCM in base64 with its scale factor) into a Float32Array, just like
// js/voice/consonant-samples.js does in the page. Used by tools/render.mjs and tests/calibrate-samples.mjs.
import fs from 'fs';

export const SAMPLES_PATH = new URL('../data/consonant-samples.json', import.meta.url);

// Returns { fs, sets: { f|m: { phone: { mode, tok: [{ v, pcm }] } } } }
export function loadSamples() {
  const raw = JSON.parse(fs.readFileSync(SAMPLES_PATH, 'utf8'));
  const sets = {};
  for (const [voice, phones] of Object.entries(raw.sets)) {
    sets[voice] = {};
    for (const [p, g] of Object.entries(phones)) sets[voice][p] = { mode: g.mode, tok: g.tok.map((t) => {
      const b = Buffer.from(t.d, 'base64'), pcm = new Float32Array(b.length >> 1);
      for (let i = 0; i < pcm.length; i++) pcm[i] = b.readInt16LE(2 * i) * t.k;
      return { v: t.v, pcm };
    }) };
  }
  return { fs: raw.fs, sets };
}

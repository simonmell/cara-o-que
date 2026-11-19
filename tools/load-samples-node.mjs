// Loads data/consonant-samples.json in Node (for render.mjs and calibrate-samples.mjs).
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

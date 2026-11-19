// Decodes the recorded consonants (16-bit PCM in base64) into Float32Arrays.

// raw: the contents of data/consonant-samples.json. Returns { fs, sets, transfer } (transfer: the buffers to
// hand to the AudioWorklet without copying them).
export function decodeConsSamples(raw) {
  const sets = {}, transfer = [];
  for (const [voice, phones] of Object.entries(raw.sets)) {
    sets[voice] = {};
    for (const [p, g] of Object.entries(phones)) {
      sets[voice][p] = { mode: g.mode, tok: g.tok.map((t) => {
        const bin = atob(t.d), n = bin.length >> 1, pcm = new Float32Array(n);
        for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; pcm[i] = v * t.k; }
        transfer.push(pcm.buffer);
        return { v: t.v, pcm };
      }) };
    }
  }
  return { fs: raw.fs, sets, transfer };
}

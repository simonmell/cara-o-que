// Pronunciation dictionary for MFA with the karaoke's rules. Usage: node g2p.mjs words.json output.dict
import fs from 'fs';
import * as A from '../../js/logic/articulation.js';
const IPA = { p: 'p', t: 't̪', k: 'k', b: 'b', d: 'd̪', g: 'ɡ', f: 'f', s: 's', x: 'x', ch: 'tʃ', m: 'm', n: 'n', ñ: 'ɲ', l: 'l', r: 'ɾ', rr: 'r' };
const APPROX = { b: 'β', d: 'ð', g: 'ɣ' };
const words = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = [];
for (const w of words) {
  const ph = A.wordPhones(w);
  // semivowels: unstressed i/u next to another vowel
  const seq = ph.map((x, i) => {
    if (x.v && (x.v === 'i' || x.v === 'u') && !x.acc) {
      const pv = ph[i - 1], nx = ph[i + 1];
      if ((pv && pv.v) || (nx && nx.v)) return { g: x.v === 'i' ? 'j' : 'w' };
    }
    return x;
  });
  const variants = new Set();
  // variants: b d g as stops or approximants, and «ll/y» as [ʃ] or [ʝ]; the aligner picks the one that fits
  for (const mode of ['stop', 'approx']) for (const sh of ['ʃ', 'ʝ']) {
    const s = seq.map((x, i) => {
      if (x.g) return x.g;
      if (x.v) return x.v;
      if (x.p === 'sh') return sh;
      if (APPROX[x.p]) {
        const first = i === 0; const prev = seq[i - 1];
        const afterNasal = prev && (prev.p === 'm' || prev.p === 'n');
        return mode === 'stop' || afterNasal || (first && mode === 'stop') ? IPA[x.p] : APPROX[x.p];
      }
      return IPA[x.p] || null;
    }).filter(Boolean);
    if (s.length) variants.add(s.join(' '));
  }
  for (const v of variants) out.push(`${w}\t${v}`);
}
fs.writeFileSync(process.argv[3], out.join('\n') + '\n');
console.log(words.length, 'words,', out.length, 'pronunciations');

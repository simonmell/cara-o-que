// English pronunciation dictionary. It is downloaded only once, the first time an English song is chosen;
// until then (or offline) the words of the demo song, included here, are used.

// English pronunciation: CMU Pronouncing Dictionary (Carnegie Mellon University, ~134,000 words in ARPAbet with
// stress), npm package «cmu-pronouncing-dictionary» (ISC license). It is loaded from jsDelivr the first time
// an English song is chosen, like the MediaPipe model. The demo song's words are included so it works offline.
export const CMU_URL = 'https://cdn.jsdelivr.net/npm/cmu-pronouncing-dictionary@3.0.0/index.js';
export const EN_MINI = {"twinkle":"T W IH1 NG K AH0 L","little":"L IH1 T AH0 L","star":"S T AA1 R","how":"HH AW1","i":"AY1","wonder":"W AH1 N D ER0","what":"W AH1 T","you":"Y UW1","are":"AA1 R","up":"AH1 P","above":"AH0 B AH1 V","the":"DH AH0","world":"W ER1 L D","so":"S OW1","high":"HH AY1","like":"L AY1 K","a":"AH0","diamond":"D AY1 M AH0 N D","in":"IH0 N","sky":"S K AY1"};
export let cmuDict = null, cmuLoading = null;
// Downloads the CMU dictionary only once (if it fails, it can be retried). Resolves true if it loaded.
export function loadCmu() {
  if (!cmuLoading) {
    cmuLoading = import(CMU_URL).then((m) => { cmuDict = m.dictionary; return true; })
      .catch((e) => { console.warn('No English dictionary', e); cmuLoading = null; return false; });
  }
  return cmuLoading;
}
// ARPAbet pronunciation of a word: CMU dictionary, otherwise the included mini dictionary, otherwise null.
export const enLookup = (w) => (cmuDict && cmuDict[w]) || EN_MINI[w] || null;

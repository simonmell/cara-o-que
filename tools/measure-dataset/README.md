# Measuring consonants in a speech dataset

How the locus equations, durations, levels and spectra used by `js/logic/articulation.js` were obtained
(`LOCUS_EQ_AR`, `VOT`, `FRIC_DUR`, `NOISE` recipes). Results in `docs/openslr-measurements.md`.

Data: OpenSLR 61, *Crowdsourced high-quality Argentinian Spanish speech data set* (Guevara-Rukoz et al., 2020), CC BY-SA 4.0 license.

1. **Corpus:** `python3 prepare.py "<dataset folder>" corpus arf_04766 arm_08421 ...`
2. **Dictionary** with the karaoke's pronunciation rules (stop/approximant variants for b d g, and ʃ/ʝ for ll/y):
   `node g2p.mjs corpus/words.json es_ar.dict`
3. **Forced alignment** with Montreal Forced Aligner 2.2 and the `spanish_mfa` v2.0.0 acoustic model:
   `mfa align corpus es_ar.dict spanish_mfa.zip aligned --output_format json`
   (MFA is installed with conda/micromamba from conda-forge: `montreal-forced-aligner=2.2.17`, `joblib<1.4`, `setuptools<70`, `sox`).
4. **Measurement** with Praat (parselmouth): `python3 measure.py aligned corpus measurements.json`.
   For each consonant followed by a vowel: F2 at the start and in the middle of the vowel, duration, intensity relative to the vowel,
   spectral centre of gravity and peak, and voiced fraction.
5. **Recorded consonants:** `python3 extract.py aligned corpus ../../data/consonant-samples.json` cuts out the noises of s ʃ f x ch and the
   bursts of p t k (voice f = women, m = men); then `node ../../tests/calibrate-samples.mjs` adjusts their level (writes `SMP_GAIN` into `js/voice/cantor-dsp.js`).

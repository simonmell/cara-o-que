# Rioplatense Spanish consonants measured on OpenSLR 61

**Data:** OpenSLR 61, *Crowdsourced high-quality Argentinian Spanish speech data set* (Guevara-Rukoz et al., 2020), CC BY-SA 4.0.
8 speakers (4 women: arf_04766, arf_02121, arf_04310, arf_05223; 4 men: arm_08421, arm_03397, arm_08784, arm_09334),
122 utterances, 1360 consonant + vowel pairs.

**Method:** forced alignment with Montreal Forced Aligner 2.2 (`spanish_mfa` v2.0.0 model) and a dictionary generated
with the karaoke's pronunciation rules; measurements with Praat (parselmouth): Burg formants (5 formants, ceiling 5500 Hz
for women / 5000 Hz for men), intensity, spectrum of the central stretch of the consonant. The step-by-step procedure is in
`tools/measure-dataset/`.

**Limitations:** MFA boundaries have a 10 ms resolution (that is why [d̪] and [ɣ] come out at 10–20 ms, which is the aligner's
minimum rather than the real duration); classes with few cases (ɡ, ɲ, ʝ, r) are only indicative. This is read speech, not singing.

## Locus equations (F2 at vowel onset = k · F2 at mid-vowel + c)

| Group | Men k / c (Hz) | Women k / c (Hz) | Used in the karaoke | Martínez Celdrán and Villalba |
| --- | --- | --- | --- | --- |
| Labial stops p b β | 0.85 / 71 (R² 0.95) | 0.84 / 114 | 0.85 / 90 | 0.83 / 126 |
| Dentals t d ð | 0.77 / 380 | 0.55 / 759 | 0.66 / 570 | 0.58 / 746 |
| Velars k g ɣ x | 0.99 / 33 | 1.07 / −111 | 1.00 / 0 | 1.00 / 29 |
| Alveolars n s l ɾ | 0.66 / 583 | 0.56 / 823 | 0.62 / 700 | — |
| Palatals ʃ ʝ tʃ ɲ | 0.81 / 423 | 0.45 / 1163 (n = 23) | 0.63 / 790 | — |
| m | 0.47 / 642 | 0.62 / 461 | 0.55 / 550 | — |
| n | 0.64 / 632 | 0.44 / 1002 | 0.54 / 820 | — |
| s | 0.73 / 500 | 0.77 / 460 | 0.75 / 480 | — |
| l | 0.75 / 453 | 0.59 / 837 | 0.67 / 645 | — |
| ɾ | 0.56 / 706 | 0.41 / 1070 | 0.49 / 890 | — |

The stops agree with Martínez Celdrán and Villalba (Peninsular Spanish); the other classes were not in that study.

## Per consonant (medians)

| | n | Duration (ms) | Intensity vs vowel (dB) | Centre of gravity (Hz) | Peak (Hz) | Voiced fraction |
| --- | --- | --- | --- | --- | --- | --- |
| s | 162 | 80 | −10.2 | 6914 | 6305 | 0.18 |
| ʃ (ll, y) | 22 | 100 | −8.5 | 4130 | 3434 | 0.13 |
| f | 28 | 90 | −19.7 | 3863 | 1945 | 0.37 |
| x | 20 | 90 | −16.2 | 1757 | 1512 | 0.32 |
| tʃ | 11 | 90 | −19.3 | 2887 | 3387 | 0.25 |
| p | 72 | 60 | −22.8 | — | — | 0.36 |
| t̪ | 153 | 60 | −23.4 | — | — | 0.24 |
| k | 121 | 60 | −20.9 | — | — | 0.25 |
| m | 110 | 60 | −1.3 | — | — | 0.99 |
| n | 125 | 50 | −1.0 | — | — | 0.98 |
| l | 141 | 50 | −2.6 | — | — | 0.96 |
| ɾ | 160 | 20 | −4.6 | — | — | 0.80 |
| β | 35 | 50 | −1.1 | — | — | 1.00 |
| ð | 64 | 60 | −0.5 | — | — | 1.00 |

Estimated VOT (burst → first period with f0): p ≈ 2–10 ms, t ≈ 12 ms, k ≈ 14–25 ms; closure of 50–60 ms.
ʃ is mostly voiceless (0.13): voiceless "sheísmo", typical of young Buenos Aires speakers.

## What was changed in the karaoke

- `LOCUS_EQ_AR`: the equations in the table (the "used" column, average of men and women), also for m, n, s, l, r and palatals.
- VOT p 8 / t 13 / k 22 ms; closure of p t k 45 ms (somewhat shorter than in speech, for singing).
- Fricatives: s 80 ms with a peak at 6.3 kHz; ʃ 95 ms and 3.4 kHz; f 85 ms with a lower centre; x 85 ms. s and ʃ go up about 3 dB.
- Approximants β ð ɣ: 50 ms and a smaller level dip; nasals m 60 / n 50 / ñ 80 ms with a somewhat stronger murmur.

## Recorded consonants

With the same alignments, real fragments were cut out for the karaoke (`tools/measure-dataset/extract.py`): the stable
part of the noise of s, ʃ, f, x and of the friction of ch (35–120 ms, voiceless, with the typical spectrum of the consonant) and the
bursts of p, t, k (from the burst until just before voicing starts). Up to 2 per following vowel and per voice
(women / men), high-pass filtered at 150–400 Hz. The engine plays the fricatives as a looped texture under
their envelope and the bursts once; their level was matched to that of the calibrated synthetic consonants.

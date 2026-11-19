# Voice engine and consonants


The voice engine runs in an `AudioWorklet` (code in `js/voice/cantor-dsp.js`) and follows the Cantor Digitalis architecture (Feugère, d'Alessandro, Doval and Perrotin, 2017):

- **Glottal source:** band-limited pulse train → glottal formant (Fg = f0/2Oq, Bg from Oq and αm) → two-stage spectral tilt (Tl₁, Tl₂) + aspiration noise filtered between 1 and 6 kHz and modulated by the source. Oq, αm, Tl₁, Tl₂ and the amplitude come from **vocal effort** (distance to the camera) and **tension** («Sound» setting), with the paper's rules. Includes jitter, shimmer and a vibrato that appears when the note is held.
- **Vocal tract:** F1 to F5 in parallel and a hypopharyngeal anti-resonance in cascade (4700 Hz × tract size). The formants are mixed according to each vowel's probability and modulated continuously by the opening, rounding and spreading of the mouth (`mouthDeltas()`). Tract size, larynx position, F1/F2 tuning to f0 and attenuation when coinciding with harmonics are applied.
- **Consonant branch (inspired by Digitartic):** oral gate for closures, F1–F3 locus transitions, nasal formant and anti-formant, and burst and friction noise. The noise takes two paths, as in Klatt's parallel branch: a band-pass filter specific to each consonant and the noise exciting the tract's F2–F5 with per-consonant weights, so [s] before /i/ does not sound the same as before /u/. Each consonant also moves the pitch slightly (microprosody: up after voiceless ones and down on voiced ones), which makes it sound less glued on top of the vowel.

Levels, measured on /a/: bursts 13 to 18 dB below the vowel, fricatives 12 to 21 dB ([f] the softest), nasal murmur about 7 dB, [ɾ] tap 20 dB and [r] 17 dB. Friction starts and ends with ramps, not abruptly, and goes through a low-pass filter that cuts the hiss above each consonant.

Two changes relative to Cantor Digitalis, measured with the tests: bandwidths have a floor of 0.4·f0 (with the original table's 10 to 60 Hz, the volume depended on a harmonic falling on the formant and each transition jumped up to 10 dB), and during a consonant's locus the formant amplitude drops and recovers when reaching the vowel.

**Spanish sung vowels (optional).** In «Sound → Vowels» you can switch from the Cantor Digitalis vowels (tenor) to those of a lyric soprano singing in Spanish, measured by Barrientos Sandoval and Cataldo Ferreira (*IEEE Latin America Transactions* 19(12), 2021, tables IV and V), with their 4.5 Hz vibrato. Those measurements are from high notes (A4 to E5) and already include the vowel modification of lyric singing, so they are applied gradually: below D4 the Cantor Digitalis vowels are used and on the measured note, the paper's. They work best with a «small» vocal tract and a high register. Bandwidths are capped at 600 Hz and amplitudes are Cantor Digitalis's, because the paper does not give them. `node tools/render.mjs vowels output.wav --vowels soprano --tract 0.44` sings the five vowels for comparison.

**Vowel-dependent transitions measured on Rioplatense voices.** The F2 each consonant starts from comes from locus equations (initial F2 = k · vowel F2 + c), so «da», «di» and «du» start differently, as in speech. The values, durations, VOT and fricative spectra were measured on 8 speakers of the OpenSLR 61 Argentinian Spanish dataset (1360 consonant-vowel pairs, aligned with Montreal Forced Aligner); the stops agree with Martínez Celdrán and Villalba. Results in `docs/openslr-measurements.md`; how to repeat the measurement in `tools/measure-dataset/`.

**Recorded consonants (female and male voice).** The noise of s, ʃ (ll/y), f, j and ch and the bursts of p, t and k can come from real recordings instead of the synthesis: they are fragments from 4 female and 4 male speakers of the OpenSLR 61 dataset, cut automatically from the aligned sentences (`tools/measure-dataset/extract.py`, stored in `data/consonant-samples.json`, about 340 kB, which the page downloads when the audio is turned on). Fricatives are used as a noise texture the engine loops under its own envelope, so the duration follows the note; bursts play once, cut before the real vowel comes in. Each consonant has up to 2 examples per following vowel and the engine randomly picks one with the same vowel, so they do not always sound the same. Vowels and voiced consonants (m, n, l, r, b, d, g) remain synthetic. In «Sound → Consonant sound»: recorded by tract size (small tract or soprano vowels → female voice; otherwise male), female, male or synthetic. The gains were calibrated so they sound at the same level as the synthetic ones (`node tests/calibrate-samples.mjs`).

**Syllables → consonants.** `splitSyllable()` splits each UltraStar syllable into onset, nucleus and coda with Rioplatense Spanish rules («ll» and consonantal «y» → [ʃ], c/z/s → [s], word-initial «r» → trill, silent h, final -d dropped). `applyAllophones()` turns b, d and g between vowels into the approximants [β ð ɣ] («la boca», «todo», «lago»), as they are pronounced in speech; they stay stops after a pause (start of a phrase or a rest longer than 400 ms), after a nasal and, for d, after l. `planOnset()` and `planCoda()` build each consonant's plan:

| Type | Consonants | What the engine does |
| --- | --- | --- |
| Voiceless stops | p t k | 38 ms closure, burst with each place's spectrum (p low and diffuse, t high, k compact and vowel-dependent), Spanish VOT (p 10, t 14, k 26 ms) and a formant sweep that slows down on reaching the vowel |
| Voiced stops | b d g | After a pause or nasal: 35 ms closure with a low voice bar and a soft burst |
| Approximants | [β ð ɣ] | Between vowels: a brief narrowing without closure or burst, the voice keeps sounding; [ð] with a little soft friction |
| Fricatives and affricate | f s ʃ x ch | Voice off and 65–75 ms of noise with ramps (s ≈ 5 kHz, ʃ ≈ 3 kHz, x ≈ 1.7 kHz and higher before /i/, f wide and soft); ch with a preceding 30 ms closure |
| Nasals | m n ñ | 65 ms murmur with each nasal's own formant and anti-formant (m, n and ñ differ), damped highs, then a transition to the vowel |
| Liquids and semivowels | l r rr j w | l with alveolar formants and full voice; r with a tongue tap of about 10 ms, rr with three; semivowels as a glide from /i/ or /u/ |

**When they sound** («Consonants» setting, set by each level):

- **Automatic** (levels 1 and 2): the onset fires before the note starts, ahead by the length of the consonant (about 50 ms; between 40 and 100 depending on the group), so the vowel lands on time. Only if the person is singing or sang less than 400 ms ago (the mouth closes between syllables). If it starts late, the consonant comes out when the mouth opens, attached to its vowel, so loose noise never sounds. In practice mode, if the song is waiting, the consonant sounds when the person starts.
- **By gesture** (levels 3 and 4): `ArticulationDetector` looks for a closing and reopening of the mouth between 350 ms before and 150 ms after the syllable starts. The more marked the gesture, the clearer the consonant. If the mouth stays open and still, the consonant is skipped or sounds very soft. Pressing the switch counts as a gesture.
- **Coda:** in both modes it sounds near the end of the note and is held until it ends.

`tools/render.mjs` renders with the same engine and rules as the app: a song with and without consonants, and a consonant catalog that sings each consonant isolated and between vowels (with a `.txt` saying at which second each one is):

```
node tools/render.mjs song "songs/Los pollitos dicen/los-pollitos-dicen.txt" audio/pollitos.wav
node tools/render.mjs catalog audio/consonant-catalog.wav
```

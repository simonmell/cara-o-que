# Design decisions

How the requirements of the original design document map to the code.

| Design decision | Implementation |
| --- | --- |
| Per-frame features | `readFace()`: mouth opening and width normalized by face width, MediaPipe blendshapes, height of the point between the eyebrows (landmark 168) and face width |
| Calibration from the starting position | Set automatically when the face is seen, or with «Set starting position»; the note starts in the middle of the range. «Calibrate vowels» records personal templates for rest, a, e, i, o, u |
| Height relative to the expected note | «What your head height does» setting: choose only among the song's notes, or go up/down from the expected note. `headToMidi()` |
| Conditional verification | `classify()` gives probabilities per vowel; `expectedVowelScore()` measures the expected vowel with strict, medium or wide tolerance (e≈i, o≈u) |
| Score file | `parseUltraStar()` (includes `#RELATIVE`, P1 duets and Latin-1 files); `songAssets()` finds the audio and cover in each song's folder; `nucleus()` gets the nucleus vowel of each Spanish syllable |
| Time tracking | Practice mode (the song waits for each syllable) and continuous mode; speed 50–100 %; camera delay compensation |
| Sound | Cantor Digitalis-style parametric synthesis with consonants (see below); optional melody guide and beat |
| Adjustable assistance | «Tuning help» 0–100 %: mixes the player's note with the score's |
| Optional score | Off by default. S = w_t·T + w_v·V + w_p·P per note, with weights depending on the level |
| Variety of devices | Camera selector (appears with two or more), switch mode, fixed volume so you don't need to move closer |

The functions in `js/logic/` do not use the browser and can be tested with Node.

# Changelog

## 0.9.0 (November 2026)

- Code split into ES modules (`js/`), styles (`css/`) and data (`data/`); the single-file version and its build
  script are gone.
- Local Node server (`tools/server.cjs`) started by `Open karaoke.bat`. It works with old Node versions and picks
  another port if 8080 is taken or reserved.
- File names, comments and documentation in English.
- Only public-domain songs are tracked in the repository.
- Songs from a shared Google Drive folder (Drive API with an API key), and `netlify.toml` to publish the
  repository on Netlify with the key in environment variables.

## 0.8.0 (November 2026)

- Experimental English songs: CMU Pronouncing Dictionary, Hillenbrand vowels and diphthongs, aspirated stops,
  [θ], [ð], [ɹ], dark l and flap t.
- Calibration prompts for English speakers (ah, eh, ee, oh, oo).
- Interface language selector (Spanish / English) in the welcome dialog.

## 0.7.0 and earlier

- Face-controlled karaoke with MediaPipe, Cantor Digitalis-style voice, rule-based Spanish consonants,
  recorded consonants from OpenSLR 61, UltraStar songs, four assistance levels, switch input and web build.

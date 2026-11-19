# Third-party notices

Cara-o-que uses or adapts the following work. Each keeps its own license.

## Cantor Digitalis (Web Audio implementation)

`js/voice/cantor-dsp.js` adapts the Web Audio implementation by Edward Browncross,
https://github.com/edwardbrowncross/cantor-digitalis

> ISC License. Copyright (c) 2026 Edward Browncross.
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby
> granted, provided that the above copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
> INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
> AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
> PERFORMANCE OF THIS SOFTWARE.

The underlying model is described in L. Feugère, C. d'Alessandro, B. Doval and O. Perrotin, «Cantor Digitalis:
chironomic parametric synthesis of singing», EURASIP Journal on Audio, Speech, and Music Processing 2017:2.

## OpenSLR 61 (recorded consonants)

`data/consonant-samples.json` contains short fragments cut from OpenSLR 61, *Crowdsourced high-quality Argentinian
Spanish speech data set* (A. Guevara-Rukoz et al., «Crowdsourced Latin American Spanish for Low-Resource
Text-to-Speech», Proc. LREC 2020), licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
The fragments are distributed under the same license. The measurements in `docs/openslr-measurements.md` were made
on the same dataset.

## Loaded at runtime (not included in this repository)

- **MediaPipe Face Landmarker** (Google), Apache License 2.0: the library is loaded from jsDelivr and the face model
  from Google's servers.
- **CMU Pronouncing Dictionary** (Carnegie Mellon University), npm package `cmu-pronouncing-dictionary`, ISC license:
  loaded from jsDelivr the first time an English song is chosen. The few words of the English demo song are included
  in `js/songs/english-dictionary.js`.
- Fonts from Google Fonts (Atkinson Hyperlegible, Bricolage Grotesque, IBM Plex Mono), SIL Open Font License.

## Published measurements used as parameters

- American English vowel formants: J. Hillenbrand, L. Getty, M. Clark and K. Wheeler, «Acoustic characteristics of
  American English vowels», JASA 97(5), 1995.
- Soprano vowels: Barrientos Sandoval and Cataldo Ferreira, «Synthesis of Sung Spanish Vowels in Lyrical Singing by
  Sopranos», IEEE Latin America Transactions 19(12), 2021.
- Spanish locus equations: Martínez Celdrán and Villalba, «Las ecuaciones de locus y el punto de articulación en
  español», Estudios de Fonética Experimental, Universitat de Barcelona.

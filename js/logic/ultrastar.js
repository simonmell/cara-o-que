// UltraStar .txt parser, finding the audio of each song folder and the nucleus vowel of a syllable.

import { parseNum } from './common.js';

// UltraStar format: https://usdx.eu/format/  (pitch 0 = MIDI 60 = C4; file BPM × 4 = beats per minute)
export function parseUltraStar(text) {
  const tags = {};
  const notes = [];
  let relative = false, offset = 0, line = 0, player = 1;
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const tag = raw.match(/^#([^:]+):(.*)$/);
    if (tag) {
      tags[tag[1].trim().toUpperCase()] = tag[2].trim();
      if (tag[1].trim().toUpperCase() === 'RELATIVE') relative = /^y/i.test(tag[2].trim());
      continue;
    }
    if (/^E\s*$/.test(raw)) break;
    const p = raw.match(/^P\s*(\d)/);
    if (p) { player = Number(p[1]); continue; }
    if (player !== 1) continue;
    const brk = raw.match(/^-\s*(-?\d+)(?:\s+(-?\d+))?/);
    if (brk) {
      if (relative) offset += Number(brk[2] ?? brk[1]);
      line++;
      continue;
    }
    const n = raw.match(/^([:*FRG])\s+(-?\d+)\s+(\d+)\s+(-?\d+)(?:\s(.*))?$/);
    if (n) {
      notes.push({ type: n[1], beat: Number(n[2]) + offset, len: Number(n[3]), pitch: Number(n[4]), text: n[5] ?? '', line });
    }
  }
  const bpm = parseNum(tags.BPM);
  if (!(bpm > 0)) throw new Error('El archivo no tiene un #BPM válido.');
  if (!notes.length) throw new Error('El archivo no tiene notas.');
  const gap = parseNum(tags.GAP) || 0;
  const beatMs = 60000 / (bpm * 4);
  notes.sort((a, b) => a.beat - b.beat);
  let prev = null;
  for (const nt of notes) {
    nt.startMs = gap + nt.beat * beatMs;
    nt.endMs = gap + (nt.beat + Math.max(1, nt.len)) * beatMs;
    nt.midi = nt.pitch + 60;
    nt.vowel = (nt.type === 'R' || nt.type === 'G') ? null : nucleus(nt.text, prev);
    if (nt.vowel) prev = nt.vowel;
  }
  // renumber lines so they are consecutive
  const ids = [...new Set(notes.map((n) => n.line))];
  for (const nt of notes) nt.line = ids.indexOf(nt.line);
  return {
    title: tags.TITLE || 'Sin título', artist: tags.ARTIST || '', language: tags.LANGUAGE || '',
    mp3: tags.AUDIO || tags.MP3 || '', tags, bpm, gap, beatMs, notes, lineCount: ids.length,
  };
}

// Files of a song inside its folder. UltraStar names the audio in #MP3 (old format) or
// #AUDIO (format 1.1), and may also have #INSTRUMENTAL, #VOCALS, #VIDEO, #COVER and #BACKGROUND.
// names: names of the files in the same folder. Returns real file names (or null).
// For singing the instrumental is preferred; if there is none, the audio with vocals; if the name does not match,
// an audio file with the same base name or the only audio file in the folder.
export const AUDIO_EXT = /\.(mp3|ogg|oga|opus|m4a|aac|wav|flac|webm|weba)$/i;
export const VIDEO_EXT = /\.(mp4|m4v|webm|mkv|avi|mov|mpg|mpeg|divx|flv)$/i;
export const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;
// Finds a song's audio (preferring the karaoke or instrumental version), video and cover inside its folder.
export function songAssets(song, names) {
  const t = song.tags || {};
  const base = (n) => n.replace(/^.*[\\/]/, '');
  const stem = (n) => base(n).replace(/\.[^.]+$/, '').toLowerCase();
  const find = (tag) => {
    if (!tag) return null;
    const want = base(tag).toLowerCase();
    return names.find((n) => n.toLowerCase() === want) || null;
  };
  const audios = names.filter((n) => AUDIO_EXT.test(n));
  const instrumental = find(t.INSTRUMENTAL);
  const vocals = find(t.VOCALS);
  let audio = find(t.AUDIO) || find(t.MP3);
  if (!audio) {
    const tagStem = stem(t.AUDIO || t.MP3 || '');
    // if there are several audio files (for example the karaoke and the original version), the one that says karaoke or instrumental wins
    const backing = /karaoke|instrumental|backing|pista|sin voz|playback/i;
    audio = (tagStem && audios.find((n) => stem(n) === tagStem))
      || audios.filter((n) => n !== instrumental && n !== vocals)
        .sort((a, b) => (backing.test(b) - backing.test(a)) || a.localeCompare(b))[0] || null;
  }
  // a video also works as audio if there is nothing else (the browser plays mp4 and webm)
  const video = find(t.VIDEO) || names.find((n) => VIDEO_EXT.test(n)) || null;
  if (!audio && video && /\.(mp4|m4v|webm)$/i.test(video)) audio = video;
  const cover = find(t.COVER) || names.find((n) => IMAGE_EXT.test(n) && /(\[co\]|cover|portada)/i.test(n))
    || names.find((n) => IMAGE_EXT.test(n)) || null;
  return { play: instrumental || audio, instrumental, audio, vocals, video, cover };
}

// Songs folder: each subfolder is a song and is named after the folder.
// paths: relative paths of the chosen files ("songs/Title/title.txt"). Returns one entry per folder
// that has some .txt, with the indices of its files. If the folder of a single song is chosen directly,
// that folder is the song.
export function groupSongFolders(paths) {
  const dirs = new Map();
  paths.forEach((p, i) => {
    const parts = p.split('/'); parts.pop();
    const dir = parts.join('/');
    if (!dirs.has(dir)) dirs.set(dir, { dir, name: parts[parts.length - 1] || 'Canción', files: [] });
    dirs.get(dir).files.push(i);
  });
  // loose .txt files in the chosen folder, next to song subfolders: each one is named after its file
  const deepest = Math.max(...[...dirs.keys()].map((d) => d.split('/').length));
  for (const d of dirs.values()) d.loose = d.dir.split('/').length === 1 && deepest > 1;
  return [...dirs.values()]
    .filter((d) => d.files.some((i) => /\.txt$/i.test(paths[i])))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

// Nucleus vowel of a Spanish syllable: "can" → a, "ción" → o, "pí" → i, "que" → e, "~" → the previous one.
export function nucleus(text, prev = null) {
  let raw = String(text).toLowerCase().replace(/ü/g, 'w');
  const letters = raw.replace(/[^a-záéíóúñwy]/g, '');
  if (!letters) return prev;               // "~" or punctuation: keeps the previous vowel
  const acc = raw.match(/[áéíóú]/);
  if (acc) return acc[0].normalize('NFD')[0];
  let s = letters.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/([qg])u([ei])/g, '$1$2');      // silent u: que, gui
  s = s.replace(/y(?![aeiou])/g, 'i');           // y as a vowel: hoy, muy, "y"
  const vs = s.match(/[aeiou]/g);
  if (!vs) return null;                          // syllable without a vowel: free note
  const strong = vs.filter((v) => 'aeo'.includes(v));
  return strong.length ? strong[0] : vs[vs.length - 1];
}

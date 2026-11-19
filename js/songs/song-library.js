// Song list and where songs come from: a folder picked by hand, songs/list.js, Google Drive or the
// server's folder listing. Drive songs are only downloaded when chosen.

import { renderMeta, setSong } from './current-song.js';
import { paintSeekTrack } from '../playback/player.js';
import { $, DEMO_SONGS, S, toast } from '../state.js';
import { t } from '../i18n/language.js';
import { DRIVE_API_KEY, DRIVE_FOLDER_ID } from '../config.js';
import { groupSongFolders, parseUltraStar, songAssets } from '../logic/ultrastar.js';

export const sel = $('songSel');
// Fills the drop-down with the songs in S.songs and selects the one at index selIdx. When there are songs besides
// the demos, they are shown in two groups: "Your songs" and "Examples".
export const fillSongs = (selIdx) => {
  sel.innerHTML = '';
  const option = (s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.nameKey ? t(s.nameKey) : s.name; return o; };
  if (S.songs.every((s) => s.demo)) S.songs.forEach((s, i) => sel.append(option(s, i)));
  else {
    for (const [label, demo] of [['songsOwn', false], ['songsDemo', true]]) {
      const group = document.createElement('optgroup'); group.label = t(label);
      S.songs.forEach((s, i) => { if (!!s.demo === demo) group.append(option(s, i)); });
      sel.append(group);
    }
  }
  sel.value = selIdx;
};

// Song music: a chosen file (File) or a URL inside the songs folder (text)
export const setAudio = (src) => {
  if (S.audioEl) S.audioEl.pause();
  if (S.audioUrl) URL.revokeObjectURL(S.audioUrl);
  S.audioUrl = src instanceof Blob ? URL.createObjectURL(src) : null;
  S.audioEl = src ? new Audio(S.audioUrl || src) : null;
  if (S.audioEl) {
    S.audioEl.preservesPitch = true; S.audioEl.playbackRate = S.settings.speed; S.audioEl.volume = S.settings.musicVol;
    S.audioEl.addEventListener('loadedmetadata', () => paintSeekTrack());
  }
  paintSeekTrack();
};
// Entry of the song that is loaded now (at startup, the first demo song, which main.js loads)
let current = DEMO_SONGS[0];
let selecting = 0;   // counts selections, so a slow download does not replace a song chosen after it
// Loads the chosen song: its lyrics and notes and its music. An entry with load() (Google Drive) is downloaded first;
// a folder with several UltraStar .txt files becomes several entries.
export async function selectSong(i) {
  let entry = S.songs[i];
  const ticket = ++selecting;
  if (entry.load) {
    toast(t('songLoading', entry.name));
    let songs = [], err = null;
    try { songs = await entry.load(); } catch (e) { err = e; console.warn('Song', entry.name, e); }
    if (ticket !== selecting) return;
    if (!songs.length) {
      if (!err) S.songs.splice(i, 1);           // not a song: take it off the list
      fillSongs(Math.max(0, S.songs.indexOf(current)));
      toast(err ? t('driveFail') + ' (' + err.message + ')' : t('songNotFound', entry.name));
      return;
    }
    S.songs.splice(i, 1, ...songs);
    fillSongs(i);
    entry = songs[0];
  }
  current = entry;
  setSong(entry.text);
  setAudio(entry.files?.play || null);
  S.songEntry = entry; renderMeta();
}

// Text of an UltraStar .txt: UTF-8 or, if it is not, Windows-1252.
export const decodeText = (buf) => {
  const text = new TextDecoder('utf-8').decode(buf);
  return text.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buf) : text; // many UltraStar files are in Latin-1
};
// Builds the list from folders: each subfolder is a song named after the folder. If it has
// music (the audio named in the .txt, or the only audio file), it is loaded with the lyrics; if it only has the .txt,
// it is sung without a backing track. .txt files that are not UltraStar (readme, loose lyrics) are ignored.
// folders: [{ name, dir, loose, files: [{ name, size, read: () => Promise<ArrayBuffer>, src: File | url }] }]
// Returns { found: song entries, skipped: names of the folders without an UltraStar .txt }.
export async function readSongFolders(folders) {
  const found = []; const skipped = [];
  for (const d of folders) {
    const names = d.files.map((f) => f.name);
    const songs = [];
    for (const f of d.files) {
      if (!/\.txt$/i.test(f.name) || f.size > 1e6) continue;
      let text;
      try { text = decodeText(await f.read()); } catch { continue; }
      if (!/^\s*#BPM\s*:/im.test(text)) continue;             // not an UltraStar file
      try { songs.push({ f, text, song: parseUltraStar(text) }); } catch { /* broken file */ }
    }
    if (!songs.length) { skipped.push(d.name); continue; }
    for (const { f, text, song } of songs) {
      const a = songAssets(song, names);
      const pick = (n) => (n ? d.files.find((x) => x.name === n) : null);
      const stem = f.name.replace(/\.txt$/i, '');
      found.push({
        name: d.loose ? stem : songs.length > 1 ? `${d.name} (${stem})` : d.name,
        text, dir: d.dir, files: { play: pick(a.play)?.src || null, playName: a.play, instrumental: !!a.instrumental },
      });
    }
  }
  found.sort(byName);
  return { found, skipped };
}
const byName = (x, y) => x.name.localeCompare(y.name, 'es', { sensitivity: 'base' });
// Puts the songs in the list, before the demo songs. select: load the first one; otherwise the current song stays.
function showSongs(songs, message, select) {
  S.songs = [...songs, ...DEMO_SONGS];
  const keep = S.songs.indexOf(current);
  if (select || keep < 0) { fillSongs(0); selectSong(0); } else fillSongs(keep);
  toast(message);
  $('songHint').hidden = true;
}
// Reads the folders and shows their songs, loading the first one.
export async function loadSongFolders(folders, { quiet = false } = {}) {
  const { found, skipped } = await readSongFolders(folders);
  if (!found.length) { if (!quiet) toast(t('noSongs')); return false; }
  const withMusic = found.filter((x) => x.files.play).length;
  showSongs(found, t('found', found.length, withMusic) + (skipped.length ? t('skipped', skipped.join(', ')) : ''), true);
  return true;
}

// 2) Automatic list of the "songs" folder next to this page:
//    a) songs/list.js: the local server (tools/server.cjs) builds it on the fly; the web version ships it ready-made;
//    b) if it is not there, the http server's folder listing.
export const encPath = (...parts) => parts.filter(Boolean).map(encodeURIComponent).join('/');
// Turns songs/list.js (window.KARAOKE_SONGS) into song folders ready to load.
export const fromManifest = (m) => (m.folders || []).map((c) => ({
  // "name": the title to show when the published folder has a different name (web version, tools/build-web.ps1)
  name: c.name || c.folder || 'songs', dir: c.folder, loose: !c.folder,
  files: (c.files || []).map((n) => ({
    name: n, size: c.txt?.[n] ? c.txt[n].length * 0.75 : 0,
    read: async () => Uint8Array.from(atob(c.txt[n]), (ch) => ch.charCodeAt(0)).buffer,
    src: encPath('songs', c.folder, n),
  })),
}));
// Loads a classic script; resolves true if it loaded and false if it does not exist.
export const loadScript = (src) => new Promise((ok) => {
  const el = document.createElement('script'); el.src = src; el.charset = 'utf-8';
  el.onload = () => ok(true); el.onerror = () => { el.remove(); ok(false); };
  document.head.append(el);
});
// Link names of a folder listing served over http (relative links only).
export async function listHttpDir(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(r.status);
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  return [...doc.querySelectorAll('a[href]')].map((a) => decodeURIComponent(a.getAttribute('href')))
    .filter((h) => h && !h.startsWith('?') && !h.startsWith('/') && !h.startsWith('..') && !/^[a-z]+:/i.test(h));
}
// Builds the song folders by walking the http listing of "songs" and of each subfolder.
export async function fromHttp() {
  const top = await listHttpDir('songs/');
  const folders = [];
  const mk = (dir, names) => ({
    name: dir || 'songs', dir, loose: !dir,
    files: names.map((n) => { const url = encPath('songs', dir, n); return { name: n, size: 0, read: async () => (await fetch(url)).arrayBuffer(), src: url }; }),
  });
  const looseFiles = top.filter((h) => !h.endsWith('/'));
  if (looseFiles.length) folders.push(mk('', looseFiles));
  for (const h of top.filter((h) => h.endsWith('/'))) {
    const dir = h.slice(0, -1);
    try { folders.push(mk(dir, (await listHttpDir(encPath('songs', dir) + '/')).filter((x) => !x.endsWith('/')))); } catch { /* ignore */ }
  }
  return folders;
}

// Google Drive: a folder shared as "anyone with the link can view", read with the Drive API and an API key
// (no sign-in). Same layout as the songs folder: one subfolder per song, or loose .txt files.
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
// Key and folder: drive-config.js (written on Netlify from environment variables) or js/config.js.
const driveConfig = () => window.KARAOKE_DRIVE || {};
const driveKey = () => driveConfig().apiKey || DRIVE_API_KEY;
// Folder ID: from the address (?drive=...), drive-config.js or js/config.js; a full Drive link also works.
export function driveFolderId() {
  const p = new URLSearchParams(location.search).get('drive');
  const id = p || driveConfig().folderId || DRIVE_FOLDER_ID;
  // accepts the bare ID, "ID?usp=sharing", a …/folders/ID link or an …?id=ID link
  const link = /(?:folders\/|[?&]id=)([\w-]+)/.exec(id);
  return link ? link[1] : (/[\w-]{10,}/.exec(id) || [id.trim()])[0];
}
// Error from the Drive API with Google's own explanation (for example, "Requests from referer ... are blocked").
async function driveError(r) {
  let msg = '';
  try { msg = (await r.json()).error.message; } catch { /* no JSON body */ }
  return new Error(`Drive ${r.status}${msg ? ': ' + msg : ''}`);
}
// All the items of a Drive folder (the API returns them in pages of up to 1000).
async function driveList(folderId, key) {
  const items = [];
  let page = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const url = `${DRIVE_API}?q=${q}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=1000&key=${key}` + (page ? `&pageToken=${page}` : '');
    const r = await fetch(url); if (!r.ok) throw await driveError(r);
    const j = await r.json();
    items.push(...j.files); page = j.nextPageToken || '';
  } while (page);
  return items;
}
// Song list of a Drive folder, without downloading anything but the list of the main folder: one entry per subfolder
// (and per loose .txt), with load() to download it when it is chosen. The audio plays straight from Drive (the API
// supports byte ranges, so seeking works).
export async function driveCatalog(folderId, key) {
  const media = (f) => `${DRIVE_API}/${f.id}?alt=media&key=${key}`;
  let readError = null;   // readSongFolders skips unreadable files silently: this keeps the reason
  const fileOf = (f) => ({
    name: f.name, size: Number(f.size) || 0, src: media(f),
    read: async () => {
      try {
        const r = await fetch(media(f)); if (!r.ok) throw await driveError(r);
        return await r.arrayBuffer();
      } catch (err) { readError = err; throw err; }
    },
  });
  // Reads one song folder; if no song could be read because of a download error, throws that error
  const read = async (folder) => {
    readError = null;
    const { found } = await readSongFolders([folder]);
    if (!found.length && readError) throw readError;
    return found;
  };
  const top = await driveList(folderId, key);
  const files = top.filter((f) => f.mimeType !== FOLDER_MIME);
  const isTxt = (f) => /\.txt$/i.test(f.name);
  const entries = top.filter((f) => f.mimeType === FOLDER_MIME).map((d) => ({
    name: d.name,
    load: async () => read({ name: d.name, dir: d.name, loose: false, files: (await driveList(d.id, key)).filter((f) => f.mimeType !== FOLDER_MIME).map(fileOf) }),
  }));
  // loose .txt files in the main folder (except a readme), each with the audio files next to it
  for (const f of files.filter((x) => isTxt(x) && !/^(readme|l[eé]eme)/i.test(x.name))) {
    entries.push({ name: f.name.replace(/\.txt$/i, ''), load: () => read({ name: 'Google Drive', dir: '', loose: true, files: [f, ...files.filter((x) => !isTxt(x))].map(fileOf) }) });
  }
  return entries.sort(byName);
}

// List startup: demo songs, drop-down changes, folder chosen by hand and automatic list
export function wireSongLibrary() {
  fillSongs(0);
  sel.addEventListener('change', () => selectSong(Number(sel.value)));
  // 1) Folder chosen by hand
  $('folderInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const paths = files.map((f) => f.webkitRelativePath || f.name);
    toast(t('reading'));
    await loadSongFolders(groupSongFolders(paths).map((d) => ({
      ...d, files: d.files.map((i) => ({ name: files[i].name, size: files[i].size, read: () => files[i].arrayBuffer(), src: files[i] })),
    })));
  });
  // 3) Google Drive (see docs/google-drive.md): only the list; each song is downloaded when it is chosen
  const loadDrive = async () => {
    if (!window.KARAOKE_DRIVE) await loadScript('drive-config.js');
    const id = driveFolderId(), key = driveKey();
    if (!id || !key) return false;
    try {
      toast(t('reading'));
      const songs = await driveCatalog(id, key);
      if (!songs.length) { toast(t('noSongs')); return false; }
      showSongs(songs, t('driveFound', songs.length), false);
      return true;
    } catch (err) { console.warn('Google Drive', err); toast(t('driveFail') + ' (' + err.message + ')'); return false; }
  };
  (async () => {
    // a folder given in the address (?drive=...) comes first; one set in config.js only if there is no local list
    if (new URLSearchParams(location.search).has('drive') && await loadDrive()) return;
    if (await loadScript('songs/list.js') && window.KARAOKE_SONGS) {
      if (await loadSongFolders(fromManifest(window.KARAOKE_SONGS), { quiet: true })) return;
    }
    if (!new URLSearchParams(location.search).has('drive') && await loadDrive()) return;
    if (/^https?:$/.test(location.protocol)) {
      try { if (await loadSongFolders(await fromHttp(), { quiet: true })) return; } catch { /* no listing */ }
    }
    if (location.protocol === 'file:') $('songHint').hidden = false;
  })();
}

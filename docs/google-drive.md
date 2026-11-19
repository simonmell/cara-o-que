# Songs from Google Drive

The web version can read its songs from a Google Drive folder shared with a link, so new songs can be added by
uploading them to Drive, without publishing the site again. Nobody has to sign in: the page reads the folder with the
Drive API and an API key.

The folder uses the same layout as `songs/`: one subfolder per song, with the UltraStar `.txt` and, optionally, the
backing track. The audio plays straight from Drive, and seeking works.

```
Cara-o-que songs/                  ← shared with «Anyone with the link»
  Frank Sinatra - My Way/
    Frank Sinatra - My Way.txt
    Frank Sinatra - My Way (karaoke).mp3
  Los pollitos dicen/
    los-pollitos-dicen.txt
```

## 1. Create the API key (once)

1. Go to https://console.cloud.google.com/ and create a project (for example `cara-o-que`).
2. **APIs & Services → Library**, search for **Google Drive API** and enable it.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Edit the key and restrict it, so it is useless anywhere else:
   - **Application restrictions → Websites**: add your site, for example `https://my-site.netlify.app/*`, and, to try it
     locally, `http://127.0.0.1:8080/*`.
   - **API restrictions → Restrict key → Google Drive API**.

The key only gives access to files that are already public, but it ends up in the page, so keep it restricted.

## 2. Share the folder

1. Create the folder in Drive and upload one subfolder per song.
2. **Share → General access → Anyone with the link → Viewer**. Files added later inherit this.
3. Copy the link. The folder ID is the part after `/folders/`:
   `https://drive.google.com/drive/folders/`**`1AbCdEfGhIjKlMnOp`**`?usp=sharing`

## 3. Connect it to the site

**Netlify connected to GitHub (recommended).** The key does not need to be in the repository:

1. In Netlify, **Add new site → Import an existing project → GitHub** and pick the repository. The build settings come
   from `netlify.toml` (publish the root, run `tools/netlify-build.cjs`).
2. **Site configuration → Environment variables**: add `DRIVE_API_KEY` (the key) and `DRIVE_FOLDER_ID` (the folder ID).
3. **Deploys → Trigger deploy**. The build writes `drive-config.js` with both values, and the page loads the songs
   from Drive.

**Other hosts or trying it locally.** Create a file `drive-config.js` next to `index.html` (git ignores it):

```js
window.KARAOKE_DRIVE = { apiKey: 'YOUR-KEY', folderId: 'YOUR-FOLDER-ID' };
```

Locally the `songs/` folder has priority; open `http://127.0.0.1:8080/?drive=YOUR-FOLDER-ID` to use Drive instead.
The `?drive=` parameter also works on the published site, to try another folder (it accepts the full link as well).

## Order of the song sources

1. A folder given in the address (`?drive=...`).
2. `songs/list.js`: the local server, or a web version built with `Build web version.bat`.
3. The Drive folder from `drive-config.js` (or `DRIVE_API_KEY` / `DRIVE_FOLDER_ID` in `js/config.js`).
4. The http server's folder listing, if there is one.

If none of them has songs, the two demo songs included in the app are used. «Load song folder» always works.

## Notes

- If the folder is not shared, or the key is wrong or restricted to another site, the page shows a message and keeps
  the other songs. The details are in the browser console.
- Anyone who can open the site can reach the files in the folder. For copyrighted songs, limit who can open the site
  (see [publishing.md](publishing.md)).
- Google limits how often a public file can be downloaded. For a handful of testers this is not a problem.

# Publishing the web version

There are two ways. **Netlify connected to GitHub** publishes the repository every time you push, and reads the songs from a shared Google Drive folder: see [google-drive.md](google-drive.md). **A web-version folder** with your local songs and tracks, uploaded by hand, is described below.

1. Double-click **`Build web version.bat`**. It creates the `web-version` folder with only what is needed:
   `index.html`, `css/`, `js/` and `data/` (the app), `songs/` (each song with its `.txt` and its karaoke track, with URL-friendly names; the list still shows the original names), `songs/list.js`, `robots.txt` (so search engines do not index it) and `CREDITS.txt` (licenses that must accompany it). It does not include the tests, the tools, `.bak` files or versions with vocals.
2. Upload the whole `web-version` folder to a static hosting service. No server of your own or database is needed; **https** is required, because without https the browser does not give access to the camera (all the services below provide it).
   - **Netlify Drop** (fastest): go to https://app.netlify.com/drop, drag the folder and it is published at an address like `https://something.netlify.app`. Create a free account so the site stays and you can rename it. To update: in the site, "Deploys", and drag the folder again. The site is public to anyone with the link; password protection is on paid plans.
   - **Cloudflare Pages** (to limit who can enter): in the Cloudflare dashboard, "Workers & Pages" → "Create application" → Pages → upload the folder (or a .zip). It is published at `https://something.pages.dev`. So that only invited people can enter: "Zero Trust" → "Access" → "Applications" → "Self-hosted" with that domain and a rule with their e-mail addresses; each person enters with a code sent by e-mail (free up to 50 users). Limit: 25 MB per file.
   - **GitHub Pages**: also works, but on the free plan the repository must be public, with the songs visible.
3. Send the link. Chrome or Edge are recommended (on a computer or Android); the first time it downloads MediaPipe and the face model (about 4 MB).

Each person can also load their own songs with "Load song folder": they are read in their browser and not uploaded anywhere. To add songs to the published version: put them in `songs`, run `Build web version.bat` again and upload the folder again.

Commercial song tracks and lyrics are copyrighted (that is also why only public-domain songs are part of this repository): to publish them, it is better to limit access to the people testing it (Cloudflare Access), or to leave only the public-domain ones in `web-version/songs` (delete the other folders and their entries in `list.js`, or remove them from `songs` before building).

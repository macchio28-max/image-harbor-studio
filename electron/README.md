# LoMa VIEWER – Desktop (Electron + electron-builder)

- `npm run electron:dev` – opens the desktop window on http://localhost:8080 (run `npm run dev` first).
- `npm run electron:build:win` – Windows installer (.exe, NSIS) in `electron-release/`.
- `npm run electron:build:mac` – macOS `.dmg` + `.zip` (must run on a Mac).
- GitHub Actions: `.github/workflows/build-desktop.yml` pubblica gli installer (`loma-viewer-win.exe`, `loma-viewer-mac.dmg`, `loma-viewer-mac.zip`) nel Release `desktop-latest` a ogni build (push su main, manuale o tag `v*`), sostituendo sempre l'ultima versione.

The packaged app loads the published URL (offline via service worker); override with `LOMA_URL`.
The latest web changes must be published before using the packaged desktop app; the DMG is not a bundled static copy of the web app. To build locally on a Mac with Node.js 22, run from the updated project source:

```bash
npm install --legacy-peer-deps --no-audit --no-fund
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npm run electron:build:mac -- --publish never
open electron-release
```

Alternatively run `bash scripts/build-mac.command`: it opens a folder picker for the updated source and runs the same commands. Unsigned local builds may require approval in macOS Privacy & Security. Android needs a new APK installed over the existing app; web edits do not update the APK's bundled assets.
Program paths chosen with "Sfoglia..." are saved in `userData/apps.json`.
"Svuota Cache e Memoria" (`loma:clearCache`) deletes only the exported-photo temp files in `os.tmpdir()/loma-viewer` and Chromium's volatile network cache. Service workers and Cache Storage are never removed, so the app keeps working offline.

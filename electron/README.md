# LoMa VIEWER – Desktop (Electron + electron-builder)

- `npm run electron:dev` – opens the desktop window on http://localhost:8080 (run `npm run dev` first).
- `npm run electron:build:win` – Windows installer (.exe, NSIS) in `electron-release/`.
- `npm run electron:build:mac` – macOS `.dmg` + `.zip` (must run on a Mac).
- GitHub Actions: `.github/workflows/build-desktop.yml` pubblica gli installer (`loma-viewer-win.exe`, `loma-viewer-mac.dmg`, `loma-viewer-mac.zip`) nel Release `desktop-latest` a ogni build (push su main, manuale o tag `v*`), sostituendo sempre l'ultima versione.

The packaged app loads the published URL (offline via service worker); override with `LOMA_URL`.
Program paths chosen with "Sfoglia..." are saved in `userData/apps.json`.
"Svuota Cache e Memoria" (`loma:clearCache`) deletes only the exported-photo temp files in `os.tmpdir()/loma-viewer` and Chromium's volatile network cache. Service workers and Cache Storage are never removed, so the app keeps working offline.

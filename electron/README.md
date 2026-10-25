# LoMa VIEWER – Desktop (Electron + electron-builder)

- `npm run electron:dev` – opens the desktop window on http://localhost:8080 (run `npm run dev` first).
- `npm run electron:build:win` – Windows installer (.exe, NSIS) in `electron-release/`.
- `npm run electron:build:mac` – macOS `.dmg` + `.zip` (must run on a Mac).
- GitHub Actions: `.github/workflows/build-desktop.yml` builds both on every push to main, manually, and attaches installers to a Release when you push a tag `v*`.

The packaged app loads the published URL (offline via service worker); override with `LOMA_URL`.
Program paths chosen with "Sfoglia..." are saved in `userData/apps.json`.

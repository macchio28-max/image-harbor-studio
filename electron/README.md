# LoMa VIEWER – Desktop (Electron)

```bash
npm install --save-dev electron @electron/packager
# Windows
npx @electron/packager . "LoMa VIEWER" --platform=win32 --arch=x64 --out=electron-release --overwrite --ignore='^/src' --ignore='^/node_modules'
# macOS
npx @electron/packager . "LoMa VIEWER" --platform=darwin --arch=arm64 --out=electron-release --overwrite --ignore='^/src' --ignore='^/node_modules'
```

Entry: `electron/main.cjs` (set `"main": "electron/main.cjs"` in package.json before packaging).
For signed `.exe` installers / `.dmg` images, run `electron-builder` on a Windows/Mac machine.
Set `LOMA_URL` to the published URL of the app.

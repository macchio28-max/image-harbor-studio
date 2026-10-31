#!/bin/bash
set -e
# Execute on macOS with Node.js 22 installed. Select the extracted project source folder.
PROJECT_DIR=$(osascript -e 'POSIX path of (choose folder with prompt "Seleziona la cartella del codice aggiornato di LoMa VIEWER")')
cd "$PROJECT_DIR"
if [ ! -f package.json ] || [ ! -f electron/main.cjs ]; then
  echo "La cartella scelta non contiene il codice di LoMa VIEWER."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Installa Node.js 22 prima di creare la DMG."
  exit 1
fi
npm install --legacy-peer-deps --no-audit --no-fund
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npm run electron:build:mac -- --publish never
open electron-release
echo "DMG e ZIP pronti nella cartella electron-release."
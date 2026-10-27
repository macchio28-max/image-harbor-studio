// Copies the LoMa icon (public/icon-512.png) into every android mipmap-* folder as
// ic_launcher, ic_launcher_round and ic_launcher_foreground. Resizes with `sharp` when
// installed, otherwise copies the 512px file (Android scales it down). Run after `cap add/sync`.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = path.join(root, "public", "icon-512.png");
const res = path.join(root, "android", "app", "src", "main", "res");
if (!fs.existsSync(res)) { console.log("android/ non trovato: esegui prima `npx cap add android`"); process.exit(0); }
if (!fs.existsSync(src)) { console.error("public/icon-512.png mancante"); process.exit(1); }
let sharp = null;
try { sharp = require("sharp"); } catch {}
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

(async () => {
  for (const [d, px] of Object.entries(sizes)) {
    const dir = path.join(res, `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, size] of [["ic_launcher.png", px], ["ic_launcher_round.png", px], ["ic_launcher_foreground.png", fg[d]]]) {
      const out = path.join(dir, name);
      if (sharp) await sharp(src).resize(size, size).png().toFile(out);
      else fs.copyFileSync(src, out);
    }
  }
  // Adaptive icon (Android 8+): inset the full icon so the launcher mask does not crop the logo.
  const any = path.join(res, "mipmap-anydpi-v26");
  fs.mkdirSync(any, { recursive: true });
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground>
        <inset android:drawable="@mipmap/ic_launcher_foreground" android:inset="16%"/>
    </foreground>
</adaptive-icon>
`;
  fs.writeFileSync(path.join(any, "ic_launcher.xml"), xml);
  fs.writeFileSync(path.join(any, "ic_launcher_round.xml"), xml);
  const values = path.join(res, "values");
  fs.mkdirSync(values, { recursive: true });
  fs.writeFileSync(path.join(values, "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B0F17</color>\n</resources>\n`);
  console.log(`Icone LoMa copiate nelle cartelle mipmap-*${sharp ? " (ridimensionate)" : ""}`);
})();

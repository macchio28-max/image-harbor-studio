// LoMa VIEWER desktop shell (Electron).
// Loads the app from LOMA_URL (e.g. http://localhost:8080 during development) or the published
// URL (cached offline by its service worker) and exposes native IPC for dialogs and external programs.
const { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard, nativeImage, ShareMenu } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const URL = process.env.LOMA_URL || (app.isPackaged ? "https://image-harbor-studio.lovable.app" : "http://localhost:8080");
const appsFile = () => path.join(app.getPath("userData"), "apps.json");
const readApps = () => { try { return JSON.parse(fs.readFileSync(appsFile(), "utf8")); } catch { return {}; } };
const writeApps = (o) => fs.writeFileSync(appsFile(), JSON.stringify(o, null, 2));

function launch(exe, files) {
  if (!exe || !fs.existsSync(exe)) return { ok: false, error: "not-found" };
  const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
  try {
    if (process.platform === "darwin" && exe.endsWith(".app")) {
      spawn("open", ["-a", exe, ...list], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn(exe, list, { detached: true, stdio: "ignore", shell: false }).unref();
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// Files opened from Finder/Explorer (double-click or "Apri con LoMa VIEWER").
const IMG_EXT = /\.(png|jpe?g|webp|avif|gif|bmp|tiff?|dng|cr2|cr3|nef|arw|rw2|orf)$/i;
let mainWin = null;
let pendingFile = null;
let rendererReady = false;
const fileFromArgv = (argv) => argv.slice(1).find((a) => !a.startsWith("-") && IMG_EXT.test(a) && fs.existsSync(a)) || null;
function readOpened(p) {
  try { return { path: p, name: path.basename(p), bytes: new Uint8Array(fs.readFileSync(p)) }; } catch { return null; }
}
function deliverFile(p) {
  if (!p) return;
  if (mainWin && rendererReady) {
    const f = readOpened(p);
    if (f) mainWin.webContents.send("loma:onFileOpened", f);
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  } else pendingFile = p;
}
pendingFile = fileFromArgv(process.argv);
app.on("open-file", (event, filePath) => { event.preventDefault(); deliverFile(filePath); });
if (!app.requestSingleInstanceLock()) app.quit();
else app.on("second-instance", (_e, argv) => deliverFile(fileFromArgv(argv)));
ipcMain.handle("loma:getInitialFile", () => {
  rendererReady = true;
  const p = pendingFile; pendingFile = null;
  return p ? readOpened(p) : null;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 1000, backgroundColor: "#0b0f17",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: path.join(__dirname, "..", "public", "icon-512.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.cjs") },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  mainWin = win;
  win.webContents.on("did-start-loading", () => { rendererReady = false; });
  win.on("closed", () => { if (mainWin === win) { mainWin = null; rendererReady = false; } });
  win.loadURL(URL);
}

ipcMain.handle("loma:pickApp", async (_e, name) => {
  const filters = process.platform === "win32" ? [{ name: "Programmi", extensions: ["exe", "lnk", "bat", "cmd"] }] : [];
  const r = await dialog.showOpenDialog({ title: `Seleziona ${name || "programma"}`, properties: ["openFile"], filters,
    defaultPath: process.platform === "darwin" ? "/Applications" : process.env.ProgramFiles });
  if (r.canceled || !r.filePaths[0]) return null;
  if (name) { const a = readApps(); a[name] = r.filePaths[0]; writeApps(a); }
  return r.filePaths[0];
});
ipcMain.handle("loma:getApps", () => {
  const a = readApps();
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, { path: v, exists: fs.existsSync(v) }]));
});
ipcMain.handle("loma:setApp", (_e, name, p) => { const a = readApps(); if (p) a[name] = p; else delete a[name]; writeApps(a); return true; });
ipcMain.handle("loma:openDialog", async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog({
    title: opts.title, properties: opts.directory ? ["openDirectory"] : ["openFile", ...(opts.multiple ? ["multiSelections"] : [])],
    filters: opts.filters,
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle("loma:launchApp", (_e, exe, files) => launch(exe, files));
// Writes an in-memory image (e.g. edited/cleaned export) to a temp file, then opens it with the program.
ipcMain.handle("loma:launchWithData", (_e, exe, fileName, bytes) => {
  const dir = path.join(os.tmpdir(), "loma-viewer");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, path.basename(fileName || `loma-${Date.now()}.png`));
  fs.writeFileSync(p, Buffer.from(bytes));
  return { ...launch(exe, [p]), file: p };
});
// Frees space/RAM from exported-photo temp files and Chromium's volatile network cache.
// Deliberately does NOT touch serviceworkers/cachestorage: those hold the offline copy of
// the app, so wiping them would break offline use whenever the button is pressed without internet.
ipcMain.handle("loma:clearCache", async () => {
  const dir = path.join(os.tmpdir(), "loma-viewer");
  let freed = 0;
  const walk = (d) => { try { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else { try { freed += fs.statSync(p).size; } catch {} } } } catch {} };
  walk(dir);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  try { freed += await session.defaultSession.getCacheSize(); } catch {}
  try { await session.defaultSession.clearCache(); } catch {}
  return { ok: true, freed };
});
// Canon/Nikon/Sony "Protect" sets the DOS read-only attribute on the card's file (not inside the RAW).
// Windows: read-only attribute → no write bits / access W_OK fails. macOS (FAT/exFAT cards): shown as
// missing write bits or the "locked" (uchg) flag, which access() doesn't always report → check via stat.
ipcMain.handle("loma:isReadOnly", (_e, p) => {
  try {
    const st = fs.statSync(p);
    if ((st.mode & 0o222) === 0) return true;
    try { fs.accessSync(p, fs.constants.W_OK); } catch (e) { if (e && e.code !== "ENOENT") return true; }
    if (process.platform === "darwin") {
      const flags = parseInt(require("child_process").execFileSync("/usr/bin/stat", ["-f", "%f", p], { encoding: "utf8" }).trim(), 10);
      if (Number.isFinite(flags) && (flags & 0x2 || flags & 0x20000)) return true; // UF_IMMUTABLE / SF_IMMUTABLE
    }
    return false;
  } catch { return false; }
});
ipcMain.handle("loma:openPath", (_e, p) => shell.openPath(p));
ipcMain.handle("loma:openExternal", (_e, u) => (/^https?:\/\//.test(u) ? shell.openExternal(u) : null));

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ---- Cloud via desktop sync apps (Google Drive for desktop, OneDrive): copy into the synced folder ----
function detectCloudDir(kind) {
  const home = os.homedir();
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  const cands = [];
  if (kind === "onedrive") {
    if (process.env.OneDrive) cands.push(process.env.OneDrive);
    if (process.env.OneDriveConsumer) cands.push(process.env.OneDriveConsumer);
    cands.push(path.join(home, "OneDrive"));
  }
  const cs = path.join(home, "Library", "CloudStorage");
  if (isDir(cs)) {
    for (const d of fs.readdirSync(cs)) {
      if (kind === "onedrive" && /^OneDrive/i.test(d)) cands.push(path.join(cs, d));
      if (kind === "drive" && /^GoogleDrive/i.test(d)) {
        for (const sub of ["My Drive", "Il mio Drive", "Mein Ablage", "Mi unidad", "Mon Drive"]) cands.push(path.join(cs, d, sub));
        cands.push(path.join(cs, d));
      }
    }
  }
  if (kind === "drive" && process.platform === "win32") {
    for (const l of "GHIJKLMNOPQRSTUVWXYZDEF") for (const sub of ["My Drive", "Il mio Drive", "Mein Ablage", "Mi unidad", "Mon Drive"]) cands.push(`${l}:\\${sub}`);
    cands.push(path.join(home, "Google Drive"));
  }
  return cands.find(isDir) || "";
}
ipcMain.handle("loma:cloudDir", (_e, kind) => detectCloudDir(kind));
ipcMain.handle("loma:pickFolder", async (_e, title, start) => {
  const r = await dialog.showOpenDialog(mainWin, { title, defaultPath: start || undefined, properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? "" : r.filePaths[0] || "";
});
ipcMain.handle("loma:saveToFolder", (_e, dir, name, src) => {
  try {
    if (!dir || !fs.existsSync(dir)) return { ok: false, error: "no-dir" };
    const ext = path.extname(name), base = path.basename(name, ext);
    let dest = path.join(dir, name), i = 1;
    while (fs.existsSync(dest)) dest = path.join(dir, `${base} (${i++})${ext}`);
    if (typeof src === "string") fs.copyFileSync(src, dest);
    else fs.writeFileSync(dest, Buffer.from(src));
    return { ok: true, path: dest };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle("loma:showInFolder", (_e, p) => shell.showItemInFolder(p));

ipcMain.handle("loma:copyImage", (_e, bytes) => {
  const im = nativeImage.createFromBuffer(Buffer.from(bytes));
  if (im.isEmpty()) return false;
  clipboard.writeImage(im);
  return true;
});

// macOS native share menu (AirDrop, Messaggi, Mail...). Accepts a disk path or the image bytes.
ipcMain.handle("loma:shareFile", (_e, src, name) => {
  if (process.platform !== "darwin" || !ShareMenu) return { ok: false, error: "unsupported" };
  try {
    let p = typeof src === "string" ? src : "";
    if (!p) {
      const dir = path.join(os.tmpdir(), "loma-viewer");
      fs.mkdirSync(dir, { recursive: true });
      p = path.join(dir, path.basename(name || "foto.png"));
      fs.writeFileSync(p, Buffer.from(src));
    }
    new ShareMenu({ filePaths: [p] }).popup({ window: mainWin || undefined });
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

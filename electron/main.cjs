// LoMa VIEWER desktop shell (Electron).
// Loads the app from LOMA_URL (e.g. http://localhost:8080 during development) or the published
// URL (cached offline by its service worker) and exposes native IPC for dialogs and external programs.
const { app, BrowserWindow, ipcMain, dialog, shell, session } = require("electron");
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 1000, backgroundColor: "#0b0f17",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: path.join(__dirname, "..", "public", "icon-512.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.cjs") },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
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
ipcMain.handle("loma:openPath", (_e, p) => shell.openPath(p));

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

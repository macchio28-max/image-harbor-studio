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
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: "deny" };
  });
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
// ---- Google Drive OAuth (Desktop client, loopback redirect) ----
const G_ID = "150485033350-uth3dtdbmhq1qmi42c9rg511si1qcem4.apps.googleusercontent.com";
const G_SECRET = "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"; // Desktop-type client: Google treats this as non-confidential.
const tokFile = () => path.join(app.getPath("userData"), "gdrive_token.json");
const readTok = () => { try { return JSON.parse(fs.readFileSync(tokFile(), "utf8")); } catch { return null; } };
const writeTok = (t) => fs.writeFileSync(tokFile(), JSON.stringify(t));
async function tokenReq(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SECRET, ...params }).toString() });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `Google [${r.status}]`);
  return j;
}
const store = (j, old) => { const t = { access_token: j.access_token, refresh_token: j.refresh_token || old?.refresh_token, expires_at: Date.now() + Number(j.expires_in || 3600) * 1000 }; writeTok(t); return t; };
const OK_HTML = `<!doctype html><meta charset="utf-8"><title>LoMa VIEWER</title><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f17;color:#e6e9ef;font-family:system-ui,sans-serif"><div style="text-align:center;padding:40px;border:1px solid #2a3140;border-radius:14px;background:#121826"><div style="font-size:42px">✓</div><h2 style="margin:8px 0">Accesso completato con successo!</h2><p style="color:#9aa3b2">Puoi chiudere questa scheda e tornare a LoMa VIEWER.</p></div></body>`;
let loginP = null;
function loopbackLogin() {
  loginP ??= new Promise((res, rej) => {
    const http = require("http");
    let redirect = "";
    const srv = http.createServer(async (req, rsp) => {
      const u = new globalThis.URL(req.url, redirect);
      const code = u.searchParams.get("code"), err = u.searchParams.get("error");
      if (!code && !err) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      rsp.end(err ? `<meta charset="utf-8"><p>Accesso annullato: ${err}</p>` : OK_HTML);
      srv.close(); clearTimeout(to);
      const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
      if (err) return rej(new Error("Accesso annullato"));
      try { res(store(await tokenReq({ code, grant_type: "authorization_code", redirect_uri: redirect }))); } catch (e) { rej(e); }
    });
    const to = setTimeout(() => { srv.close(); rej(new Error("Tempo scaduto per l'accesso Google")); }, 5 * 60 * 1000);
    srv.listen(0, "127.0.0.1", () => {
      redirect = `http://127.0.0.1:${srv.address().port}`;
      const q = new URLSearchParams({ client_id: G_ID, redirect_uri: redirect, response_type: "code", access_type: "offline",
        prompt: "consent", scope: "https://www.googleapis.com/auth/drive" });
      shell.openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
    });
  }).finally(() => { loginP = null; });
  return loginP;
}
ipcMain.handle("loma:getGoogleToken", async () => {
  let t = readTok();
  if (t?.access_token && t.expires_at - Date.now() > 60000) return t.access_token;
  if (t?.refresh_token) { try { return store(await tokenReq({ refresh_token: t.refresh_token, grant_type: "refresh_token" }), t).access_token; } catch {} }
  // Saved token missing/expired/rejected: wipe it so the login starts clean.
  if (t) { try { fs.unlinkSync(tokFile()); } catch {} }
  return (await loopbackLogin()).access_token;
});
ipcMain.handle("loma:hasGoogleToken", () => { const t = readTok(); return !!(t && (t.refresh_token || t.expires_at > Date.now())); });
ipcMain.handle("loma:signOutGoogle", async () => {
  const t = readTok();
  try { fs.unlinkSync(tokFile()); } catch {}
  const v = t?.refresh_token || t?.access_token;
  if (v) try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(v)}`, { method: "POST" }); } catch {}
  return true;
});
// ---- OneDrive OAuth (Microsoft public client, PKCE + loopback; Client ID comes from the app settings) ----
const msFile = () => path.join(app.getPath("userData"), "onedrive_token.json");
const readMs = () => { try { return JSON.parse(fs.readFileSync(msFile(), "utf8")); } catch { return null; } };
const MS_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const MS_SCOPE = "Files.ReadWrite.All offline_access";
async function msTokenReq(cid, params) {
  const r = await fetch(`${MS_AUTH}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cid, scope: MS_SCOPE, ...params }).toString() });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `Microsoft [${r.status}]`);
  const t = { cid, access_token: j.access_token, refresh_token: j.refresh_token || params.refresh_token, expires_at: Date.now() + Number(j.expires_in || 3600) * 1000 };
  fs.writeFileSync(msFile(), JSON.stringify(t));
  return t;
}
let msLoginP = null;
function msLoopback(cid) {
  msLoginP ??= new Promise((res, rej) => {
    const http = require("http"), crypto = require("crypto");
    const b64u = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const verifier = b64u(crypto.randomBytes(32));
    const challenge = b64u(crypto.createHash("sha256").update(verifier).digest());
    let redirect = "";
    const srv = http.createServer(async (req, rsp) => {
      const u = new globalThis.URL(req.url, "http://localhost");
      const code = u.searchParams.get("code"), err = u.searchParams.get("error");
      if (!code && !err) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      rsp.end(err ? `<meta charset="utf-8"><p>Accesso annullato: ${err}</p>` : OK_HTML);
      srv.close(); clearTimeout(to);
      const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
      if (err) return rej(new Error(u.searchParams.get("error_description") || "Accesso annullato"));
      try { res(await msTokenReq(cid, { code, grant_type: "authorization_code", redirect_uri: redirect, code_verifier: verifier })); } catch (e) { rej(e); }
    });
    const to = setTimeout(() => { srv.close(); rej(new Error("Tempo scaduto per l'accesso Microsoft")); }, 5 * 60 * 1000);
    srv.listen(0, "127.0.0.1", () => {
      redirect = `http://localhost:${srv.address().port}`;
      const q = new URLSearchParams({ client_id: cid, redirect_uri: redirect, response_type: "code", scope: MS_SCOPE,
        code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" });
      shell.openExternal(`${MS_AUTH}/authorize?${q}`);
    });
  }).finally(() => { msLoginP = null; });
  return msLoginP;
}
ipcMain.handle("loma:getMsToken", async (_e, cid) => {
  if (!cid) throw new Error("Microsoft Client ID mancante");
  let t = readMs();
  if (t && t.cid !== cid) { try { fs.unlinkSync(msFile()); } catch {} t = null; }
  if (t?.access_token && t.expires_at - Date.now() > 60000) return t.access_token;
  if (t?.refresh_token) { try { return (await msTokenReq(cid, { refresh_token: t.refresh_token, grant_type: "refresh_token" })).access_token; } catch {} }
  if (t) { try { fs.unlinkSync(msFile()); } catch {} }
  return (await msLoopback(cid)).access_token;
});
ipcMain.handle("loma:hasMsToken", () => { const t = readMs(); return !!(t && (t.refresh_token || t.expires_at > Date.now())); });
ipcMain.handle("loma:signOutMs", () => { try { fs.unlinkSync(msFile()); } catch {} return true; });
// ---- Dropbox OAuth (PKCE public client, loopback on fixed port 53682; App Key from app settings) ----
const dbxFile = () => path.join(app.getPath("userData"), "dropbox_token.json");
const readDbx = () => { try { return JSON.parse(fs.readFileSync(dbxFile(), "utf8")); } catch { return null; } };
const DBX_REDIRECT = "http://localhost:53682/";
async function dbxTokenReq(key, params) {
  const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: key, ...params }).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `Dropbox [${r.status}]`);
  const t = { key, access_token: j.access_token, refresh_token: j.refresh_token || params.refresh_token, expires_at: Date.now() + Number(j.expires_in || 14400) * 1000 };
  fs.writeFileSync(dbxFile(), JSON.stringify(t));
  return t;
}
let dbxLoginP = null;
function dbxLoopback(key) {
  dbxLoginP ??= new Promise((res, rej) => {
    const http = require("http"), crypto = require("crypto");
    const b64u = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const verifier = b64u(crypto.randomBytes(32));
    const challenge = b64u(crypto.createHash("sha256").update(verifier).digest());
    const srv = http.createServer(async (req, rsp) => {
      const u = new globalThis.URL(req.url, "http://localhost");
      const code = u.searchParams.get("code"), err = u.searchParams.get("error");
      if (!code && !err) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      rsp.end(err ? `<meta charset="utf-8"><p>Accesso annullato: ${err}</p>` : OK_HTML);
      srv.close(); clearTimeout(to);
      const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
      if (err) return rej(new Error(u.searchParams.get("error_description") || "Accesso annullato"));
      try { res(await dbxTokenReq(key, { code, grant_type: "authorization_code", redirect_uri: DBX_REDIRECT, code_verifier: verifier })); } catch (e) { rej(e); }
    });
    const to = setTimeout(() => { srv.close(); rej(new Error("Tempo scaduto per l'accesso Dropbox")); }, 5 * 60 * 1000);
    srv.on("error", (e) => { clearTimeout(to); rej(new Error(`Porta 53682 occupata: ${e.message}`)); });
    srv.listen(53682, "127.0.0.1", () => {
      const q = new URLSearchParams({ client_id: key, redirect_uri: DBX_REDIRECT, response_type: "code", token_access_type: "offline",
        code_challenge: challenge, code_challenge_method: "S256" });
      shell.openExternal(`https://www.dropbox.com/oauth2/authorize?${q}`);
    });
  }).finally(() => { dbxLoginP = null; });
  return dbxLoginP;
}
ipcMain.handle("loma:getDbxToken", async (_e, key) => {
  if (!key) throw new Error("App Key Dropbox mancante");
  let t = readDbx();
  if (t && t.key !== key) { try { fs.unlinkSync(dbxFile()); } catch {} t = null; }
  if (t?.access_token && t.expires_at - Date.now() > 60000) return t.access_token;
  if (t?.refresh_token) { try { return (await dbxTokenReq(key, { refresh_token: t.refresh_token, grant_type: "refresh_token" })).access_token; } catch {} }
  if (t) { try { fs.unlinkSync(dbxFile()); } catch {} }
  return (await dbxLoopback(key)).access_token;
});
ipcMain.handle("loma:hasDbxToken", () => { const t = readDbx(); return !!(t && (t.refresh_token || t.expires_at > Date.now())); });
ipcMain.handle("loma:signOutDbx", () => { try { fs.unlinkSync(dbxFile()); } catch {} return true; });
ipcMain.handle("loma:openExternal", (_e, u) => (/^https?:\/\//.test(u) ? shell.openExternal(u) : null));

app.whenReady().then(() => {
  // Google rejects OAuth with "disallowed_useragent" when the UA contains Electron/...
  try {
    const ua = session.defaultSession.getUserAgent().replace(/\s?Electron\/\S+/g, "").replace(/\s?loma-viewer\/\S+/gi, "");
    session.defaultSession.setUserAgent(ua);
    app.userAgentFallback = ua;
  } catch {}
  createWindow();
});
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
const LIST_RE = /\.(dng|cr2|cr3|nef|arw|rw2|orf|raf|tiff?|psd|psb|heic|heif|jpe?g|png|webp|avif|gif|bmp)$/i;
ipcMain.handle("loma:listFolder", (_e, dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && LIST_RE.test(d.name) && !d.name.startsWith("."))
      .map((d) => ({ name: d.name, size: fs.statSync(path.join(dir, d.name)).size }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) { throw new Error("Cartella non accessibile: " + (e && e.message || e)); }
});
ipcMain.handle("loma:readFolderFile", (_e, dir, name) => {
  const f = path.join(dir, path.basename(name));
  return new Uint8Array(fs.readFileSync(f));
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

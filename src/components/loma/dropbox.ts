// Dropbox driver for Cloud Hub (API v2). Web: PKCE popup (redirect = app origin). Desktop: Electron loopback on fixed port.
import type { CloudFile } from "./cloud-hub";

const CKEY = "loma.cloud.dbx.appkey";
const TKEY = "loma.cloud.dbx.tok";
const DKEY = "loma.cloud.dbx.desktopSigned";
const AUTH = "https://www.dropbox.com/oauth2/authorize";
const TOKEN = "https://api.dropboxapi.com/oauth2/token";
const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";
const RAW = /\.(dng|cr2|cr3|nef|arw|rw2|orf|raf|tiff?|psd|psb|heic|heif|jpe?g|png|webp|avif|gif|bmp)$/i;
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif" };

export const DEFAULT_DBX_KEY = "t4x16xf4p6crrlq";
export const getDbxKey = () => localStorage.getItem(CKEY) || DEFAULT_DBX_KEY;
export const setDbxKey = (v: string) => localStorage.setItem(CKEY, v.trim());
export const isDbxKey = (v: string) => /^[a-z0-9]{10,20}$/i.test(v.trim());

/** Dropbox folder path: "/" (root) or "/Foto/Viaggio". Accepts dropbox.com/home/... links too. */
export function parseDropboxFolder(input: string): string {
  let s = input.trim();
  const m = s.match(/dropbox\.com\/home(\/[^?#]*)?/i);
  if (m) s = decodeURIComponent(m[1] || "/");
  if (/^https?:\/\/(www\.)?dropbox\.com\/(scl\/fo|sh)\//i.test(s)) return s.split("#")[0]!;
  if (s === "" || s === "/") return "/";
  if (!s.startsWith("/") || /^https?:/i.test(s)) return "";
  return s.replace(/\/+$/, "");
}
const apiPath = (f: string) => (f === "/" ? "" : f);

const desk = () => (typeof window !== "undefined" ? (window as any).lomaDesktop : undefined);
export const dbxDesktop = () => !!desk()?.getDbxToken;

type Tok = { a: string; r?: string; exp: number };
let mem: Tok | null = null;
const readTok = (): Tok | null => { try { return mem ?? JSON.parse(localStorage.getItem(TKEY) || "null"); } catch { return null; } };
const writeTok = (t: Tok | null) => { mem = t; t ? localStorage.setItem(TKEY, JSON.stringify(t)) : localStorage.removeItem(TKEY); };

export const dbxSignedIn = () => (dbxDesktop() ? localStorage.getItem(DKEY) === "1" : !!readTok()?.r || (readTok()?.exp ?? 0) > Date.now());
export async function dbxRefreshSigned() {
  if (!dbxDesktop()) return dbxSignedIn();
  const v = !!(await desk().hasDbxToken?.().catch(() => false));
  localStorage.setItem(DKEY, v ? "1" : "0");
  return v;
}
export function dbxSignOut() {
  writeTok(null);
  if (dbxDesktop()) { localStorage.setItem(DKEY, "0"); desk().signOutDbx?.(); }
}

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function tokenReq(p: Record<string, string>): Promise<Tok> {
  const r = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: getDbxKey(), ...p }).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Dropbox: ${j.error_description || j.error || r.status}`);
  return { a: j.access_token, r: j.refresh_token || p["refresh_token"], exp: Date.now() + (Number(j.expires_in || 14400) - 60) * 1000 };
}

async function popupLogin(): Promise<Tok> {
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64u(crypto.getRandomValues(new Uint8Array(12)));
  const redirect = `${location.origin}/`;
  const q = new URLSearchParams({ client_id: getDbxKey(), response_type: "code", redirect_uri: redirect, token_access_type: "offline",
    code_challenge: challenge, code_challenge_method: "S256", state });
  const w = window.open(`${AUTH}?${q}`, "loma-dbx", "width=520,height=680");
  if (!w) throw new Error("Il browser ha bloccato la finestra di accesso Dropbox: consenti i popup.");
  const code = await new Promise<string>((res, rej) => {
    const t = setInterval(() => {
      if (w.closed) { clearInterval(t); return rej(new Error("Accesso annullato")); }
      try {
        if (w.location.origin !== location.origin) return;
        const p = new URLSearchParams(w.location.search);
        if (!p.get("code") && !p.get("error")) return;
        clearInterval(t); w.close();
        if (p.get("state") !== state) return rej(new Error("Accesso non valido (state)"));
        p.get("code") ? res(p.get("code")!) : rej(new Error(p.get("error_description") || "Accesso annullato"));
      } catch { /* still on dropbox.com */ }
    }, 300);
  });
  return tokenReq({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier });
}

export async function dbxToken(): Promise<string> {
  const key = getDbxKey();
  if (!key) throw new Error("Inserisci prima la App Key di Dropbox nelle impostazioni del Cloud Hub.");
  if (mem && mem.exp > Date.now()) return mem.a;
  if (dbxDesktop()) {
    const a: string = await desk().getDbxToken(key);
    mem = { a, exp: Date.now() + 50 * 60 * 1000 };
    localStorage.setItem(DKEY, "1");
    return a;
  }
  const t = readTok();
  if (t && t.exp > Date.now()) { mem = t; return t.a; }
  if (t?.r) { try { const n = await tokenReq({ grant_type: "refresh_token", refresh_token: t.r }); writeTok(n); return n.a; } catch { writeTok(null); } }
  const n = await popupLogin(); writeTok(n); return n.a;
}

const expire = () => { mem = null; if (!dbxDesktop()) { const t = readTok(); if (t) writeTok({ ...t, exp: 0 }); } };
async function rpc(endpoint: string, body: unknown) {
  const t = await dbxToken();
  const r = await fetch(`${API}${endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 401) expire();
  if (!r.ok) throw new Error(`Dropbox [${r.status}]: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
// Dropbox-API-Arg must be ASCII: escape non-ASCII chars.
const argHdr = (o: unknown) => JSON.stringify(o).replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

// Share links are resolved to the real path in the user's own Dropbox (needs sharing.read).
const linkCache = new Map<string, string>();
async function resolve(folder: string): Promise<string> {
  if (!/^https?:/i.test(folder)) return folder;
  const c = linkCache.get(folder); if (c) return c;
  const j = await rpc("/sharing/get_shared_link_metadata", { url: folder });
  if (!j.path_lower) throw new Error("Questo link Dropbox non è una cartella del tuo account: aggiungila al tuo Dropbox o usa il percorso (es. /Foto).");
  linkCache.set(folder, j.path_lower); return j.path_lower;
}

export async function dbxFolderName(folder: string) {
  if (/^https?:/i.test(folder)) { const j = await rpc("/sharing/get_shared_link_metadata", { url: folder }); return j.name as string; }
  if (folder === "/") return "Dropbox";
  const j = await rpc("/files/get_metadata", { path: folder });
  if (j[".tag"] !== "folder") throw new Error("Il percorso Dropbox non è una cartella.");
  return j.name as string;
}

export async function dbxList(folder: string): Promise<CloudFile[]> {
  folder = await resolve(folder);
  const out: CloudFile[] = [];
  let j = await rpc("/files/list_folder", { path: apiPath(folder), limit: 2000 });
  for (;;) {
    for (const e of j.entries || [])
      if (e[".tag"] === "file" && RAW.test(e.name))
        out.push({ id: e.path_lower || e.id, name: e.name, size: e.size, mimeType: MIME[e.name.split(".").pop()!.toLowerCase()] || "application/octet-stream" });
    if (!j.has_more) break;
    j = await rpc("/files/list_folder/continue", { cursor: j.cursor });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function dbxDownload(f: CloudFile): Promise<File> {
  const t = await dbxToken();
  const r = await fetch(`${CONTENT}/files/download`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Dropbox-API-Arg": argHdr({ path: f.id }) } });
  if (r.status === 401) expire();
  if (!r.ok) throw new Error(`Dropbox download [${r.status}]`);
  return new File([await r.blob()], f.name, { type: f.mimeType || "application/octet-stream" });
}

export async function dbxUpload(folder: string, file: Blob, name: string, onProgress?: (p: number) => void) {
  folder = await resolve(folder);
  const t = await dbxToken();
  const path = `${apiPath(folder)}/${name}`;
  await new Promise<void>((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${CONTENT}/files/upload`);
    x.setRequestHeader("Authorization", `Bearer ${t}`);
    x.setRequestHeader("Content-Type", "application/octet-stream");
    x.setRequestHeader("Dropbox-API-Arg", argHdr({ path, mode: "add", autorename: true }));
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? res() : (x.status === 401 && expire(), rej(new Error(`Dropbox [${x.status}]: ${x.responseText.slice(0, 300)}`))));
    x.onerror = () => rej(new Error("Connessione interrotta"));
    x.send(file);
  });
}

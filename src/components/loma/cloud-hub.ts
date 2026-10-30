// Cloud Hub: folder profiles + direct Google Drive API (browser OAuth token via Google Identity Services).
// Architecture is service-agnostic: OneDrive/Dropbox can add their own driver later.

export type CloudService = "gdrive" | "onedrive" | "dropbox" | "local";
export type CloudProfile = { id: string; name: string; service: CloudService; folder: string };
export type CloudFile = { id: string; name: string; mimeType: string; size?: number | undefined; thumb?: string | undefined };

export const CLOUD_SERVICES: { id: CloudService; name: string; ready: boolean }[] = [
  { id: "gdrive", name: "Google Drive", ready: true },
  { id: "onedrive", name: "OneDrive", ready: true },
  { id: "local", name: "Cartella locale (iCloud / Disco / Cartella)", ready: typeof window !== "undefined" && !!(window as any).lomaDesktop?.listFolder },
  { id: "dropbox", name: "Dropbox (presto)", ready: false },
];

const PKEY = "loma.cloud.profiles";
const CKEY = "loma.cloud.gclientid";
export const loadProfiles = (): CloudProfile[] => { try { return JSON.parse(localStorage.getItem(PKEY) || "[]"); } catch { return []; } };
export const saveProfiles = (l: CloudProfile[]) => localStorage.setItem(PKEY, JSON.stringify(l));
export const getClientId = () => localStorage.getItem(CKEY) || "";
export const setClientId = (v: string) => localStorage.setItem(CKEY, v.trim());

/** Accepts a full Drive folder URL (folders/ID, open?id=ID, ?usp=...) or a bare ID. */
export function parseFolderId(input: string): string {
  const s = input.trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : "";
}

export const RAW_EXT = /\.(dng|cr2|cr3|nef|arw|rw2|orf|raf|tiff?|psd|psb|heic|heif|jpe?g|png|webp|avif|gif|bmp)$/i;

// ---- Google auth (token client, scope drive: needed to list folders the user didn't create with the app) ----
let token: { v: string; exp: number } | null = null;
let gisLoading: Promise<void> | null = null;
function loadGis() {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => res(); s.onerror = () => { gisLoading = null; rej(new Error("Impossibile caricare il login Google (sei offline?)")); };
    document.head.appendChild(s);
  });
  return gisLoading;
}
const desk = () => (typeof window !== "undefined" ? (window as any).lomaDesktop : undefined);
export const hasDesktopAuth = () => !!desk()?.getGoogleToken;
const DKEY = "loma.cloud.desktopSigned";
export const isSignedIn = () => (hasDesktopAuth() ? localStorage.getItem(DKEY) === "1" : !!token && token.exp > Date.now());
/** Desktop: ask the main process whether a stored token file exists (keeps the UI flag in sync). */
export async function refreshSignedIn(): Promise<boolean> {
  if (!hasDesktopAuth()) return isSignedIn();
  const v = !!(await desk().hasGoogleToken?.().catch(() => false));
  localStorage.setItem(DKEY, v ? "1" : "0");
  return v;
}
export function signOut() {
  if (hasDesktopAuth()) { localStorage.setItem(DKEY, "0"); token = null; desk().signOutGoogle?.(); return; }
  if (token) try { (window as any).google?.accounts?.oauth2?.revoke(token.v, () => {}); } catch {}
  token = null;
}
export async function getToken(): Promise<string> {
  if (hasDesktopAuth()) {
    // Main process caches/refreshes the token and runs the loopback login when needed.
    if (token && token.exp > Date.now()) return token.v;
    const v: string = await desk().getGoogleToken();
    token = { v, exp: Date.now() + 50 * 60 * 1000 };
    localStorage.setItem(DKEY, "1");
    return v;
  }
  if (isSignedIn()) return token!.v;
  const cid = getClientId();
  if (!cid) throw new Error("Inserisci prima il Google Client ID nelle impostazioni del Cloud Hub.");
  await loadGis();
  return new Promise((res, rej) => {
    const c = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope: "https://www.googleapis.com/auth/drive",
      callback: (r: any) => {
        if (r.error || !r.access_token) return rej(new Error(r.error_description || r.error || "Accesso annullato"));
        token = { v: r.access_token, exp: Date.now() + (Number(r.expires_in) - 60) * 1000 };
        res(r.access_token);
      },
      error_callback: (e: any) => rej(new Error(e?.message || "Accesso annullato")),
    });
    c.requestAccessToken({ prompt: "" });
  });
}

async function api(path: string, init: RequestInit = {}) {
  const t = await getToken();
  const r = await fetch(`https://www.googleapis.com/drive/v3${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` } });
  if (r.status === 401) token = null;
  if (!r.ok) throw new Error(`Google Drive [${r.status}]: ${(await r.text()).slice(0, 300)}`);
  return r;
}

export async function folderName(id: string): Promise<string> {
  const r = await api(`/files/${id}?fields=name&supportsAllDrives=true`);
  return (await r.json()).name as string;
}

export async function listImages(folderId: string): Promise<CloudFile[]> {
  const out: CloudFile[] = [];
  let page = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`);
    const r = await api(`/files?q=${q}&pageSize=1000&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,name,mimeType,size,thumbnailLink)${page ? `&pageToken=${page}` : ""}`);
    const j = await r.json();
    for (const f of j.files || [])
      if (f.mimeType?.startsWith("image/") || RAW_EXT.test(f.name))
        out.push({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ? Number(f.size) : undefined, thumb: f.thumbnailLink });
    page = j.nextPageToken || "";
  } while (page);
  return out;
}

export async function downloadFile(f: CloudFile): Promise<File> {
  const r = await api(`/files/${f.id}?alt=media&supportsAllDrives=true`);
  return new File([await r.blob()], f.name, { type: f.mimeType || "application/octet-stream" });
}

/** Multipart upload with progress (XHR, since fetch has no upload progress). */
export async function uploadFile(folderId: string, file: Blob, name: string, onProgress?: (p: number) => void): Promise<void> {
  const t = await getToken();
  const meta = JSON.stringify({ name, parents: [folderId] });
  const body = new Blob(["--loma\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n", meta,
    `\r\n--loma\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`, file, "\r\n--loma--"]);
  await new Promise<void>((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id");
    x.setRequestHeader("Authorization", `Bearer ${t}`);
    x.setRequestHeader("Content-Type", "multipart/related; boundary=loma");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? res() : (x.status === 401 && (token = null), rej(new Error(`Google Drive [${x.status}]: ${x.responseText.slice(0, 300)}`))));
    x.onerror = () => rej(new Error("Connessione interrotta"));
    x.send(body);
  });
}

// ---- Local folder (desktop Electron: iCloud Drive, external disk, any folder) ----
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif" };
const needDesk = () => { const d = desk(); if (!d?.listFolder) throw new Error("Le cartelle locali funzionano nella versione desktop di LoMa VIEWER."); return d; };
export async function localList(dir: string): Promise<CloudFile[]> {
  const l: { name: string; size: number }[] = await needDesk().listFolder(dir);
  return l.map((f) => ({ id: f.name, name: f.name, size: f.size, mimeType: MIME[f.name.split(".").pop()!.toLowerCase()] || "application/octet-stream" }));
}
export async function localRead(dir: string, f: CloudFile): Promise<File> {
  const b: Uint8Array = await needDesk().readFolderFile(dir, f.name);
  return new File([b as BlobPart], f.name, { type: f.mimeType });
}
export async function localSave(dir: string, file: Blob, name: string) {
  const r = await needDesk().saveToFolder(dir, name, file);
  if (!r?.ok) throw new Error(r?.error === "no-dir" ? "Cartella non trovata (disco scollegato?)" : `Salvataggio non riuscito: ${r?.error}`);
}
const lastSeg = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

// ---- Service dispatch (Google Drive / OneDrive) ----
import * as od from "./onedrive";
export const svcParse = (s: CloudService, v: string) => (s === "local" ? v.trim() : s === "onedrive" ? od.parseOneDriveFolder(v) : parseFolderId(v));
export const svcSignedIn = (s: CloudService) => (s === "local" ? true : s === "onedrive" ? od.msSignedIn() : isSignedIn());
export const svcRefresh = (s: CloudService) => (s === "local" ? Promise.resolve(true) : s === "onedrive" ? od.msRefreshSigned() : refreshSignedIn());
export const svcSignOut = (s: CloudService) => (s === "local" ? undefined : s === "onedrive" ? od.msSignOut() : signOut());
export const svcToken = (s: CloudService) => (s === "local" ? Promise.resolve("") : s === "onedrive" ? od.msToken() : getToken());
export const svcList = (p: CloudProfile) => (p.service === "local" ? localList(p.folder) : p.service === "onedrive" ? od.msList(p.folder) : listImages(p.folder));
export const svcDownload = (p: CloudProfile, f: CloudFile) => (p.service === "local" ? localRead(p.folder, f) : p.service === "onedrive" ? od.msDownload(f) : downloadFile(f));
export const svcFolderName = (p: CloudProfile) => (p.service === "local" ? Promise.resolve(lastSeg(p.folder)) : p.service === "onedrive" ? od.msFolderName(p.folder) : folderName(p.folder));
export const svcUpload = (p: CloudProfile, f: Blob, name: string, cb?: (x: number) => void) =>
  p.service === "local" ? localSave(p.folder, f, name) : p.service === "onedrive" ? od.msUpload(p.folder, f, name, cb) : uploadFile(p.folder, f, name, cb);
export const svcLabel = (s: CloudService) => (s === "onedrive" ? "Microsoft" : "Google");

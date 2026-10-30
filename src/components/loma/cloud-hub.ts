// Cloud Hub: folder profiles + direct Google Drive API (browser OAuth token via Google Identity Services).
// Architecture is service-agnostic: OneDrive/Dropbox can add their own driver later.

export type CloudService = "gdrive" | "onedrive" | "dropbox";
export type CloudProfile = { id: string; name: string; service: CloudService; folder: string };
export type CloudFile = { id: string; name: string; mimeType: string; size?: number; thumb?: string };

export const CLOUD_SERVICES: { id: CloudService; name: string; ready: boolean }[] = [
  { id: "gdrive", name: "Google Drive", ready: true },
  { id: "onedrive", name: "OneDrive (presto)", ready: false },
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
export const isSignedIn = () => !!token && token.exp > Date.now();
export function signOut() {
  if (token) try { (window as any).google?.accounts?.oauth2?.revoke(token.v, () => {}); } catch {}
  token = null;
}
export async function getToken(): Promise<string> {
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

// OneDrive driver for Cloud Hub (Microsoft Graph). Web: PKCE popup (SPA platform). Desktop: Electron loopback (PKCE, public client).
import type { CloudFile } from "./cloud-hub";

const CKEY = "loma.cloud.msclientid";
const TKEY = "loma.cloud.ms.tok";
const DKEY = "loma.cloud.ms.desktopSigned";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPE = "Files.ReadWrite.All offline_access";
const G = "https://graph.microsoft.com/v1.0";
const RAW = /\.(dng|cr2|cr3|nef|arw|rw2|orf|raf|tiff?|psd|psb|heic|heif|jpe?g|png|webp|avif|gif|bmp)$/i;

export const getMsClientId = () => localStorage.getItem(CKEY) || "";
export const setMsClientId = (v: string) => localStorage.setItem(CKEY, v.trim());
export const isMsClientId = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());

/** OneDrive folder: share link (https://…), path (/Foto/Lavorati) or item ID. */
export function parseOneDriveFolder(input: string): string {
  const s = input.trim();
  if (/^https:\/\/(1drv\.ms|onedrive\.live\.com|[\w-]+\.sharepoint\.com|[\w-]+-my\.sharepoint\.com)\//i.test(s)) return s;
  if (s.startsWith("/") && s.length > 1) return s.replace(/\/+$/, "");
  return /^[A-Za-z0-9!_.-]{6,}$/.test(s) ? s : "";
}

const desk = () => (typeof window !== "undefined" ? (window as any).lomaDesktop : undefined);
export const msDesktop = () => !!desk()?.getMsToken;

type Tok = { a: string; r?: string; exp: number };
let mem: Tok | null = null;
const readTok = (): Tok | null => { try { return mem ?? JSON.parse(localStorage.getItem(TKEY) || "null"); } catch { return null; } };
const writeTok = (t: Tok | null) => { mem = t; t ? localStorage.setItem(TKEY, JSON.stringify(t)) : localStorage.removeItem(TKEY); };

export const msSignedIn = () => (msDesktop() ? localStorage.getItem(DKEY) === "1" : !!readTok()?.r || (readTok()?.exp ?? 0) > Date.now());
export async function msRefreshSigned() {
  if (!msDesktop()) return msSignedIn();
  const v = !!(await desk().hasMsToken?.().catch(() => false));
  localStorage.setItem(DKEY, v ? "1" : "0");
  return v;
}
export function msSignOut() {
  writeTok(null);
  if (msDesktop()) { localStorage.setItem(DKEY, "0"); desk().signOutMs?.(); }
}

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function tokenReq(p: Record<string, string>): Promise<Tok> {
  const r = await fetch(`${AUTH}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: getMsClientId(), scope: SCOPE, ...p }).toString() });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`Microsoft: ${j.error_description?.split("\r\n")[0] || j.error || r.status}`);
  return { a: j.access_token, r: j.refresh_token || p.refresh_token, exp: Date.now() + (Number(j.expires_in || 3600) - 60) * 1000 };
}

function popupLogin(): Promise<Tok> {
  return (async () => {
    const verifier = b64u(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const state = b64u(crypto.getRandomValues(new Uint8Array(12)));
    const redirect = `${location.origin}/`;
    const q = new URLSearchParams({ client_id: getMsClientId(), response_type: "code", redirect_uri: redirect, scope: SCOPE,
      code_challenge: challenge, code_challenge_method: "S256", state, prompt: "select_account", response_mode: "query" });
    const w = window.open(`${AUTH}/authorize?${q}`, "loma-ms", "width=520,height=680");
    if (!w) throw new Error("Il browser ha bloccato la finestra di accesso Microsoft: consenti i popup.");
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
        } catch { /* still on microsoft.com */ }
      }, 300);
    });
    return tokenReq({ grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier });
  })();
}

export async function msToken(): Promise<string> {
  const cid = getMsClientId();
  if (!cid) throw new Error("Inserisci prima il Microsoft Client ID nelle impostazioni del Cloud Hub.");
  if (mem && mem.exp > Date.now()) return mem.a;
  if (msDesktop()) {
    const a: string = await desk().getMsToken(cid);
    mem = { a, exp: Date.now() + 50 * 60 * 1000 };
    localStorage.setItem(DKEY, "1");
    return a;
  }
  const t = readTok();
  if (t && t.exp > Date.now()) { mem = t; return t.a; }
  if (t?.r) { try { const n = await tokenReq({ grant_type: "refresh_token", refresh_token: t.r }); writeTok(n); return n.a; } catch { writeTok(null); } }
  const n = await popupLogin(); writeTok(n); return n.a;
}

async function graph(path: string, init: RequestInit = {}) {
  const t = await msToken();
  const r = await fetch(path.startsWith("http") ? path : `${G}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t}` } });
  if (r.status === 401) { mem = null; writeTok(msDesktop() ? null : readTok() && { ...readTok()!, exp: 0 }); }
  if (!r.ok) throw new Error(`OneDrive [${r.status}]: ${(await r.text()).slice(0, 300)}`);
  return r;
}

type Ref = { drive: string; id: string; name: string };
const refCache = new Map<string, Ref>();
async function resolve(folder: string): Promise<Ref> {
  const c = refCache.get(folder); if (c) return c;
  let path: string;
  if (folder.startsWith("http")) path = `/shares/u!${b64u(new TextEncoder().encode(folder))}/driveItem`;
  else if (folder.startsWith("/")) path = `/me/drive/root:${folder.split("/").map(encodeURIComponent).join("/")}`;
  else path = `/me/drive/items/${encodeURIComponent(folder)}`;
  const j = await (await graph(`${path}?$select=id,name,parentReference,folder`)).json();
  if (!j.folder) throw new Error("Il link OneDrive non è una cartella.");
  const ref = { drive: j.parentReference.driveId, id: j.id, name: j.name };
  refCache.set(folder, ref);
  return ref;
}

export const msFolderName = async (folder: string) => (await resolve(folder)).name;

export async function msList(folder: string): Promise<CloudFile[]> {
  const f = await resolve(folder);
  const out: CloudFile[] = [];
  let next: string = `/drives/${f.drive}/items/${f.id}/children?$top=200&$expand=thumbnails&$select=id,name,size,file,@microsoft.graph.downloadUrl`;
  while (next) {
    const j = await (await graph(next)).json();
    for (const it of j.value || [])
      if (it.file && (it.file.mimeType?.startsWith("image/") || RAW.test(it.name)))
        out.push({ id: `${f.drive}|${it.id}`, name: it.name, mimeType: it.file.mimeType || "", size: it.size, thumb: it.thumbnails?.[0]?.medium?.url });
    next = j["@odata.nextLink"] || "";
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function msDownload(f: CloudFile): Promise<File> {
  const [drive, id] = f.id.split("|");
  const meta = await (await graph(`/drives/${drive}/items/${id}?$select=id,@microsoft.graph.downloadUrl`)).json();
  const r = await fetch(meta["@microsoft.graph.downloadUrl"]);
  if (!r.ok) throw new Error(`OneDrive download [${r.status}]`);
  return new File([await r.blob()], f.name, { type: f.mimeType || "application/octet-stream" });
}

/** Upload session in 320KiB-multiple chunks (works for any size, with progress). */
export async function msUpload(folder: string, file: Blob, name: string, onProgress?: (p: number) => void) {
  const f = await resolve(folder);
  const s = await (await graph(`/drives/${f.drive}/items/${f.id}:/${encodeURIComponent(name)}:/createUploadSession`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
  })).json();
  const CH = 320 * 1024 * 15, total = file.size;
  for (let off = 0; off < total || total === 0; off += CH) {
    const end = Math.min(off + CH, total);
    await new Promise<void>((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("PUT", s.uploadUrl);
      x.setRequestHeader("Content-Range", `bytes ${off}-${Math.max(end - 1, 0)}/${total}`);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress?.((off + e.loaded) / Math.max(total, 1));
      x.onload = () => (x.status < 300 ? res() : rej(new Error(`OneDrive [${x.status}]: ${x.responseText.slice(0, 300)}`)));
      x.onerror = () => rej(new Error("Connessione interrotta"));
      x.send(file.slice(off, end));
    });
    if (total === 0) break;
  }
}

// Direct upload of the current photo to the user's Google Drive / OneDrive (OAuth in the browser, no backend).
// Client IDs are public identifiers; the user enters their own in the Cloud settings dialog.

export type CloudKind = "drive" | "onedrive";
export type CloudCfg = { clientId: string; folder: string };

const KEY = (k: CloudKind) => `loma.cloud.${k}`;
export const getCloudCfg = (k: CloudKind): CloudCfg => {
  try { return { clientId: "", folder: "LoMa VIEWER", ...JSON.parse(localStorage.getItem(KEY(k)) || "{}") }; }
  catch { return { clientId: "", folder: "LoMa VIEWER" }; }
};
export const setCloudCfg = (k: CloudKind, c: CloudCfg) => localStorage.setItem(KEY(k), JSON.stringify(c));
export const redirectUri = () => `${window.location.origin}/`;

const tokens: Partial<Record<CloudKind, { t: string; exp: number }>> = {};
const live = (k: CloudKind) => { const x = tokens[k]; return x && x.exp > Date.now() + 30_000 ? x.t : null; };

function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error("script"));
    document.head.appendChild(s);
  });
}

// ---------------- Google Drive ----------------
async function googleToken(clientId: string): Promise<string> {
  const c = live("drive"); if (c) return c;
  await loadScript("https://accounts.google.com/gsi/client");
  const g = (window as any).google;
  return new Promise((res, rej) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (r: any) => {
        if (r.error || !r.access_token) return rej(new Error(r.error || "auth"));
        tokens.drive = { t: r.access_token, exp: Date.now() + Number(r.expires_in || 3600) * 1000 };
        res(r.access_token);
      },
      error_callback: (e: any) => rej(new Error(e?.type || "auth")),
    });
    client.requestAccessToken();
  });
}

async function driveFolder(token: string, name: string): Promise<string | null> {
  if (!name.trim()) return null;
  const h = { Authorization: `Bearer ${token}` };
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const l = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers: h }).then((r) => r.json());
  if (l.files?.[0]?.id) return l.files[0].id;
  const c = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  }).then((r) => r.json());
  return c.id ?? null;
}

async function uploadDrive(file: File, cfg: CloudCfg, onStep: (m: string) => void) {
  onStep("Accesso a Google Drive...");
  const token = await googleToken(cfg.clientId);
  const parent = await driveFolder(token, cfg.folder);
  onStep(`Caricamento di ${file.name} su Google Drive...`);
  const meta = { name: file.name, ...(parent ? { parents: [parent] } : {}) };
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  body.append("file", file);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body,
  });
  if (r.status === 401) { delete tokens.drive; throw new Error("Sessione scaduta, riprova."); }
  if (!r.ok) throw new Error(`Google Drive ha risposto ${r.status}`);
  const j = await r.json();
  return j.webViewLink as string | undefined;
}

// ---------------- OneDrive (Microsoft identity, PKCE popup) ----------------
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function msToken(clientId: string): Promise<string> {
  const c = live("onedrive"); if (c) return c;
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const scope = "Files.ReadWrite offline_access";
  const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri())}&scope=${encodeURIComponent(scope)}&code_challenge=${challenge}&code_challenge_method=S256&state=${state}&prompt=select_account`;
  const pop = window.open(url, "loma-onedrive", "width=520,height=680");
  if (!pop) throw new Error("Popup bloccato: consenti i popup per LoMa VIEWER.");
  const code = await new Promise<string>((res, rej) => {
    const iv = setInterval(() => {
      if (pop.closed) { clearInterval(iv); rej(new Error("Accesso annullato.")); return; }
      try {
        const u = new URL(pop.location.href);
        if (u.origin !== window.location.origin) return;
        clearInterval(iv); pop.close();
        const cd = u.searchParams.get("code");
        if (cd && u.searchParams.get("state") === state) res(cd);
        else rej(new Error(u.searchParams.get("error_description") || "Accesso non riuscito."));
      } catch { /* still on microsoft.com */ }
    }, 300);
  });
  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier, scope }),
  }).then((x) => x.json());
  if (!r.access_token) throw new Error(r.error_description || "Token non ricevuto.");
  tokens.onedrive = { t: r.access_token, exp: Date.now() + Number(r.expires_in || 3600) * 1000 };
  return r.access_token;
}

async function uploadOneDrive(file: File, cfg: CloudCfg, onStep: (m: string) => void) {
  onStep("Accesso a OneDrive...");
  const token = await msToken(cfg.clientId);
  onStep(`Caricamento di ${file.name} su OneDrive...`);
  const path = [cfg.folder.trim(), file.name].filter(Boolean).map(encodeURIComponent).join("/");
  const h = { Authorization: `Bearer ${token}` };
  let r: Response;
  if (file.size < 4 * 1024 * 1024) {
    r = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content?@microsoft.graph.conflictBehavior=rename`, { method: "PUT", headers: h, body: file });
  } else {
    const s = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/createUploadSession`, {
      method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
    }).then((x) => x.json());
    if (!s.uploadUrl) throw new Error("OneDrive: sessione di caricamento non creata.");
    const chunk = 5 * 320 * 1024 * 4; // 6.25 MB (multiple of 320 KiB)
    r = new Response();
    for (let o = 0; o < file.size; o += chunk) {
      const end = Math.min(o + chunk, file.size);
      onStep(`Caricamento su OneDrive ${Math.round((end / file.size) * 100)}%...`);
      r = await fetch(s.uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes ${o}-${end - 1}/${file.size}` }, body: file.slice(o, end) });
      if (!r.ok && r.status !== 202) break;
    }
  }
  if (r.status === 401) { delete tokens.onedrive; throw new Error("Sessione scaduta, riprova."); }
  if (!r.ok) throw new Error(`OneDrive ha risposto ${r.status}`);
  const j = await r.json().catch(() => ({}));
  return j.webUrl as string | undefined;
}

export async function uploadToCloud(kind: CloudKind, file: File, onStep: (m: string) => void) {
  const cfg = getCloudCfg(kind);
  return kind === "drive" ? uploadDrive(file, cfg, onStep) : uploadOneDrive(file, cfg, onStep);
}

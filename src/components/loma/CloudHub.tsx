import { useEffect, useState } from "react";
import { Cloud, Plus, Trash2, Pencil, Settings, X, Check, LogOut, Download, Upload, HardDrive } from "lucide-react";
import { toast } from "sonner";
import {
  type CloudProfile, type CloudFile, CLOUD_SERVICES, loadProfiles, saveProfiles, getClientId, setClientId,
  hasDesktopAuth, svcParse, svcSignedIn, svcRefresh, svcSignOut, svcToken, svcList, svcDownload, svcFolderName, svcUpload, svcLabel,
} from "./cloud-hub";
import { getMsClientId, setMsClientId, isMsClientId } from "./onedrive";

export type UploadKind = "developed" | "original" | "clean";
type Props = {
  mode: "upload" | "import";
  onClose: () => void;
  hasImage: boolean;
  makeFiles: (kind: UploadKind) => Promise<File[]>;
  count?: number;
  onImport: (files: File[]) => void;
  onQuickDesktop?: (() => void) | undefined;
};

const inp = "w-full rounded border border-input bg-background px-2 py-2 text-sm";

export function CloudHub({ mode: initial, onClose, hasImage, makeFiles, count = 1, onImport, onQuickDesktop }: Props) {
  const [mode, setMode] = useState(initial);
  const [list, setList] = useState<CloudProfile[]>(loadProfiles);
  const [cid, setCid] = useState(getClientId);
  const [mcid, setMcid] = useState(getMsClientId);
  const [settings, setSettings] = useState(!hasDesktopAuth() && !getClientId() && !getMsClientId());
  const desktop = hasDesktopAuth();
  const [edit, setEdit] = useState<CloudProfile | null>(list.length ? null : { id: "", name: "", service: "gdrive", folder: "" });
  const [sel, setSel] = useState<string>(list[0]?.id ?? "");
  const [kind, setKind] = useState<UploadKind>("developed");
  const [busy, setBusy] = useState<number | null>(null);
  const [files, setFiles] = useState<CloudFile[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const prof = list.find((p) => p.id === sel);
  const svc = prof?.service ?? "gdrive";
  const [signed, setSigned] = useState(svcSignedIn(svc));
  useEffect(() => { setSigned(svcSignedIn(svc)); svcRefresh(svc).then(setSigned); }, [svc]);
  const update = (l: CloudProfile[]) => { setList(l); saveProfiles(l); };

  const saveEdit = () => {
    if (!edit) return;
    const p = { ...edit, id: edit.id || String(Date.now()), folder: svcParse(edit.service, edit.folder) };
    update(edit.id ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]);
    setSel(p.id); setEdit(null);
  };

  const fail = (e: unknown) => { setBusy(null); toast.error(e instanceof Error ? e.message : String(e), { duration: 8000 }); };

  const upload = async () => {
    if (!prof) return;
    try {
      setBusy(0);
      await svcToken(prof.service); setSigned(true);
      const fs = await makeFiles(kind);
      for (let i = 0; i < fs.length; i++) { const f = fs[i]!; await svcUpload(prof, f, f.name, (p) => setBusy((i + p) / fs.length)); }
      const fn = await svcFolderName(prof).catch(() => prof.name);
      setBusy(null);
      toast.success(fs.length > 1 ? `${fs.length} foto caricate con successo in ${fn}` : `Caricato con successo in ${fn}`, { duration: 3000 });
      onClose();
    } catch (e) { fail(e); }
  };

  useEffect(() => { setFiles(null); setPicked(new Set()); }, [sel, mode]);
  const browse = async () => {
    if (!prof) return;
    try { setBusy(0); const l = await svcList(prof); setSigned(true); setFiles(l); setBusy(null); } catch (e) { fail(e); }
  };
  const doImport = async () => {
    const chosen = (files ?? []).filter((f) => picked.has(f.id));
    if (!chosen.length) return;
    try {
      const out: File[] = [];
      for (let i = 0; i < chosen.length; i++) { setBusy(i / chosen.length); out.push(await svcDownload(prof!, chosen[i]!)); }
      setBusy(null); onImport(out); onClose();
      toast.success(`${out.length} foto importate da ${prof?.name}`, { duration: 2000 });
    } catch (e) { fail(e); }
  };

  const tab = (m: "upload" | "import", label: string, Icon: typeof Upload) => (
    <button onClick={() => setMode(m)} className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-2 text-sm ${mode === m ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 sm:items-center sm:p-4" onClick={busy === null ? onClose : undefined}>
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-xl border border-border bg-card shadow-xl sm:rounded-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Cloud className="h-5 w-5 text-primary" />
          <h2 className="flex-1 text-base font-semibold">Cloud Hub</h2>
          {svc !== "local" && signed && <span className="text-xs text-primary">{svc === "onedrive" ? "OneDrive" : "Drive"} collegato</span>}
          {svc !== "local" && signed && <button title={`Esci da ${svcLabel(svc)}`} onClick={() => { svcSignOut(svc); setSigned(false); }} className="rounded p-2 text-muted-foreground hover:bg-accent"><LogOut className="h-4 w-4" /></button>}
          {svc !== "local" && !signed && (desktop || svc === "onedrive") && <button onClick={async () => { try { await svcToken(svc); setSigned(true); toast.success(`Collegato a ${svc === "onedrive" ? "OneDrive" : "Google Drive"}`, { duration: 1000 }); } catch (e) { fail(e); } }} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">Accedi a {svcLabel(svc)}</button>}
          {<button title="Impostazioni" onClick={() => setSettings((s) => !s)} className="rounded p-2 text-muted-foreground hover:bg-accent"><Settings className="h-4 w-4" /></button>}
          <button aria-label="Chiudi" onClick={onClose} className="rounded p-2 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {settings && (
            <div className="mb-4 space-y-3">
            {!desktop && <div className="rounded border border-border p-3">
              <div className="mb-1 text-sm font-medium">Google Client ID</div>
              <input value={cid} onChange={(e) => setCid(e.target.value)} placeholder="1234…apps.googleusercontent.com" className={inp} />
              <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
                <li>console.cloud.google.com → nuovo progetto → abilita "Google Drive API".</li>
                <li>Schermata consenso OAuth: tipo Esterno, aggiungi la tua email tra i tester.</li>
                <li>Credenziali → ID client OAuth → "Applicazione web".</li>
                <li>Origini JavaScript: {typeof location !== "undefined" ? location.origin : ""} (e l'indirizzo pubblicato).</li>
                <li>Copia qui l'ID client.</li>
              </ol>
              <button disabled={!cid.endsWith(".apps.googleusercontent.com")} onClick={() => { setClientId(cid); svcSignOut("gdrive"); if (svc === "gdrive") setSigned(false); setSettings(false); toast.success("Client ID salvato", { duration: 1000 }); }}
                className="mt-2 w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Salva Client ID</button>
            </div>}
            <div className="rounded border border-border p-3">
              <div className="mb-1 text-sm font-medium">Microsoft Client ID (Application ID) · OneDrive</div>
              <input value={mcid} onChange={(e) => setMcid(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={inp} />
              <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
                <li>portal.azure.com → Registrazioni app → Nuova registrazione, account "qualsiasi + personali Microsoft".</li>
                <li>Autenticazione → piattaforma "Applicazione a pagina singola": {typeof location !== "undefined" ? `${location.origin}/` : ""} (e l'indirizzo pubblicato con / finale).</li>
                <li>Per la versione desktop aggiungi anche "App per dispositivi mobili e desktop" con http://localhost.</li>
                <li>Autorizzazioni API → Microsoft Graph → delegate: Files.ReadWrite.All, offline_access.</li>
                <li>Copia qui l'ID applicazione (client).</li>
              </ol>
              <button disabled={!isMsClientId(mcid)} onClick={() => { setMsClientId(mcid); svcSignOut("onedrive"); if (svc === "onedrive") setSigned(false); setSettings(false); toast.success("Microsoft Client ID salvato", { duration: 1000 }); }}
                className="mt-2 w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Salva Microsoft Client ID</button>
            </div>
            </div>
          )}

          <div className="mb-3 flex gap-2">{tab("upload", "Carica", Upload)}{tab("import", "Importa", Download)}</div>

          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Profilo cartella</div>
          <div className="mb-3 flex flex-col gap-1.5">
            {list.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <button onClick={() => setSel(p.id)} className={`flex flex-1 items-center gap-2 rounded px-3 py-2.5 text-left text-sm ${sel === p.id ? "bg-primary/20 ring-1 ring-primary" : "bg-secondary hover:bg-accent"}`}>
                  {sel === p.id ? <Check className="h-4 w-4 text-primary" /> : <Cloud className="h-4 w-4 text-muted-foreground" />}
                  <div className="min-w-0"><div className="truncate font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{CLOUD_SERVICES.find((s) => s.id === p.service)?.name} · {p.folder || "cartella non valida"}</div></div>
                </button>
                <button aria-label="Modifica" onClick={() => setEdit(p)} className="rounded p-2.5 text-muted-foreground hover:bg-accent"><Pencil className="h-4 w-4" /></button>
                <button aria-label="Rimuovi" onClick={() => { update(list.filter((x) => x.id !== p.id)); if (sel === p.id) setSel(""); }} className="rounded p-2.5 text-muted-foreground hover:bg-accent"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {edit ? (
              <div className="rounded border border-border p-3">
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Nome (es. Torrile 2026 - Lavorati)" className={`${inp} mb-2`} />
                <select value={edit.service} onChange={(e) => setEdit({ ...edit, service: e.target.value as CloudProfile["service"] })} className={`${inp} mb-2`}>
                  {CLOUD_SERVICES.map((s) => <option key={s.id} value={s.id} disabled={!s.ready}>{s.name}</option>)}
                </select>
                {edit.service === "local" ? (
                  <div className="mb-2 flex gap-2">
                    <div className={`${inp} min-w-0 flex-1 truncate ${edit.folder ? "" : "text-muted-foreground"}`}>{edit.folder || "Nessuna cartella scelta"}</div>
                    <button onClick={async () => { const d = await (window as any).lomaDesktop?.pickFolder?.("Scegli la cartella", edit.folder); if (d) setEdit({ ...edit, folder: d, name: edit.name || d.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "" }); }}
                      className="shrink-0 rounded bg-secondary px-3 py-2 text-sm hover:bg-accent">Sfoglia cartella…</button>
                  </div>
                ) : <input value={edit.folder} onChange={(e) => setEdit({ ...edit, folder: e.target.value })} placeholder={edit.service === "onedrive" ? "Link condivisione OneDrive, percorso (/Foto/Lavorati) o ID" : "Link cartella Drive o ID"} className={`${inp} mb-2`} />}
                <div className="flex gap-2">
                  <button disabled={!edit.name.trim() || !svcParse(edit.service, edit.folder)} onClick={saveEdit} className="flex-1 rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Salva profilo</button>
                  {list.length > 0 && <button onClick={() => setEdit(null)} className="rounded bg-secondary px-3 py-2 text-sm">Annulla</button>}
                </div>
              </div>
            ) : (
              <button onClick={() => setEdit({ id: "", name: "", service: "gdrive", folder: "" })} className="flex items-center justify-center gap-1.5 rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                <Plus className="h-4 w-4" /> Nuovo profilo cartella
              </button>
            )}
          </div>

          {mode === "upload" ? (
            <>
              <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Cosa inviare</div>
              <div className="mb-3 grid grid-cols-3 gap-1.5">
                {([["developed", "Sviluppata", "JPEG con regolazioni"], ["original", "Originale", "file così com'è"], ["clean", "Pulita", "senza EXIF/AI"]] as const).map(([k, l, d]) => (
                  <button key={k} onClick={() => setKind(k)} className={`rounded px-2 py-2 text-xs ${kind === k ? "bg-primary/20 ring-1 ring-primary" : "bg-secondary hover:bg-accent"}`}>
                    <div className="text-sm font-medium">{l}</div><div className="text-muted-foreground">{d}</div>
                  </button>
                ))}
              </div>
              <button disabled={!prof || !hasImage || busy !== null} onClick={upload} className="flex w-full items-center justify-center gap-2 rounded bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                <Upload className="h-4 w-4" /> {hasImage ? `${svc === "local" ? "Salva" : "Carica"} ${count > 1 ? `${count} foto ` : ""}in ${prof?.name ?? "…"}` : "Apri prima un'immagine"}
              </button>
              {onQuickDesktop && hasImage && svc !== "local" && (
                <button onClick={() => { onClose(); onQuickDesktop(); }} className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-secondary px-3 py-2 text-sm hover:bg-accent">
                  <HardDrive className="h-4 w-4" /> Copia rapida nella cartella Drive del computer
                </button>
              )}
            </>
          ) : (
            <>
              {!files ? (
                <button disabled={!prof || busy !== null} onClick={browse} className="w-full rounded bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Sfoglia la cartella</button>
              ) : files.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Nessuna foto in questa cartella.</div>
              ) : (
                <>
                  <div className="mb-2 flex items-center text-xs text-muted-foreground">
                    <span className="flex-1">{picked.size} / {files.length} selezionate</span>
                    <button onClick={() => setPicked(picked.size === files.length ? new Set() : new Set(files.map((f) => f.id)))} className="rounded bg-secondary px-2 py-1 hover:bg-accent">
                      {picked.size === files.length ? "Nessuna" : "Tutte"}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {files.map((f) => {
                      const on = picked.has(f.id);
                      return (
                        <button key={f.id} onClick={() => { const n = new Set(picked); on ? n.delete(f.id) : n.add(f.id); setPicked(n); }}
                          className={`relative overflow-hidden rounded bg-secondary text-left ${on ? "ring-2 ring-primary" : ""}`}>
                          <div className="aspect-square bg-muted">
                            {f.thumb ? <img src={f.thumb} alt={f.name} referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" />
                              : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{f.name.split(".").pop()?.toUpperCase()}</div>}
                          </div>
                          <div className="truncate px-1 py-0.5 text-[10px]">{f.name}</div>
                          {on && <Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                  <button disabled={!picked.size || busy !== null} onClick={doImport} className="mt-3 w-full rounded bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    Importa {picked.size || ""} foto
                  </button>
                </>
              )}
            </>
          )}
          {busy !== null && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(4, busy * 100)}%` }} /></div>
              <div className="mt-1 text-center text-xs text-muted-foreground">{Math.round(busy * 100)}%</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Server, X, Play, Square, Plus, Trash2, Pencil, Check, Download, Upload, Radio, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import type { UploadKind } from "./CloudHub";

export type FtpProfile = { id: string; name: string; host: string; port: number; user: string; pass: string; dir: string };
type RxCfg = { port: number; user: string; pass: string; dir: string };
type Remote = { name: string; size: number };

const PKEY = "loma.ftp.profiles";
const RKEY = "loma.ftp.receiver";
const inp = "w-full rounded border border-input bg-background px-2 py-2 text-sm";

export const loadFtpProfiles = (): FtpProfile[] => { try { return JSON.parse(localStorage.getItem(PKEY) || "[]"); } catch { return []; } };
const saveFtpProfiles = (l: FtpProfile[]) => localStorage.setItem(PKEY, JSON.stringify(l));
const randPass = () => Math.random().toString(36).slice(2, 8);
const loadRx = (): RxCfg => {
  try { const r = JSON.parse(localStorage.getItem(RKEY) || "null"); if (r) return r; } catch {}
  const r = { port: 2121, user: "loma", pass: randPass(), dir: "" }; localStorage.setItem(RKEY, JSON.stringify(r)); return r;
};

const desk = () => (typeof window !== "undefined" ? (window as any).lomaDesktop?.ftp : undefined);
const droid = () => (typeof window !== "undefined" ? (window as any).LomaAndroid : undefined);
const mb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

type Props = {
  onClose: () => void;
  onReceived: (files: File[]) => void;
  onImport: (files: File[]) => void;
  hasImage: boolean;
  count: number;
  makeFiles: (k: UploadKind) => Promise<File[]>;
  running: boolean;
  setRunning: (r: boolean) => void;
};

export function FtpDialog({ onClose, onReceived, onImport, hasImage, count, makeFiles, running, setRunning }: Props) {
  const [tab, setTab] = useState<"rx" | "import" | "upload">("rx");
  const [rx, setRx] = useState<RxCfg>(loadRx);
  const [ips, setIps] = useState<{ name: string; address: string }[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [list, setList] = useState<FtpProfile[]>(loadFtpProfiles);
  const [sel, setSel] = useState(list[0]?.id ?? "");
  const [edit, setEdit] = useState<FtpProfile | null>(null);
  const [files, setFiles] = useState<Remote[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<UploadKind>("developed");
  const [busy, setBusy] = useState<number | null>(null);
  const simRef = useRef<HTMLInputElement>(null);
  const D = desk(), A = droid();
  const env = D ? "desktop" : A?.ftpStart ? "android" : "web";
  const prof = list.find((p) => p.id === sel);

  useEffect(() => {
    if (!D) return;
    D.ips().then(setIps);
    if (!rx.dir) D.defaultDir().then((d: string) => updRx({ ...rx, dir: d }));
    D.status().then((s: any) => setRunning(!!s.running));
    return D.onLog((m: string) => setLogs((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 30)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [adir, setAdir] = useState("");
  useEffect(() => {
    if (env !== "android") return;
    const poll = () => {
      try {
        const st = JSON.parse(A.ftpStatus?.() || "{}");
        if (st.ip) setIps([{ name: "wlan", address: st.ip }]);
        if (st.dir) setAdir(st.dir);
        setRunning(!!st.running);
        const l: string[] = JSON.parse(A.ftpLogs?.() || "[]");
        if (l.length) setLogs((o) => [...l.reverse().map((m) => `${new Date().toLocaleTimeString()} ${m}`), ...o].slice(0, 30));
      } catch { /* ignore */ }
    };
    poll();
    const t = window.setInterval(poll, 1500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env]);
  useEffect(() => { setFiles(null); setPicked(new Set()); }, [sel]);

  const updRx = (r: RxCfg) => { setRx(r); localStorage.setItem(RKEY, JSON.stringify(r)); };
  const fail = (e: unknown) => { setBusy(null); toast.error(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e), { duration: 8000 }); };

  const start = async () => {
    if (env === "desktop") {
      const r = await D.start(rx);
      if (!r.ok) return fail(r.error);
      setIps(r.ips); setRunning(true); toast.success("Ricevitore FTP in ascolto", { duration: 1000 });
    } else if (env === "android") {
      const r = JSON.parse(A.ftpStart(rx.port, rx.user, rx.pass) || "{}");
      if (r.error) return fail(r.error);
      if (r.ip) setIps([{ name: "wlan", address: r.ip }]);
      if (r.dir) setAdir(r.dir);
      setRunning(true); toast.success("Ricevitore FTP in ascolto", { duration: 1000 });
    }
  };
  const stop = async () => { if (env === "desktop") await D.stop(); else if (env === "android") A.ftpStop?.(); setRunning(false); toast.success("Ricevitore fermato", { duration: 1000 }); };

  const saveEdit = () => {
    if (!edit) return;
    const p = { ...edit, id: edit.id || String(Date.now()), host: edit.host.trim().replace(/^ftp:\/\//i, "").replace(/\/.*$/, ""), port: Number(edit.port) || 21 };
    const l = edit.id ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p];
    setList(l); saveFtpProfiles(l); setSel(p.id); setEdit(null);
  };
  const testConn = async (p: FtpProfile) => { try { setBusy(0); const pwd = await D.test(p); setBusy(null); toast.success(`Connesso · cartella ${pwd}`, { duration: 2000 }); } catch (e) { fail(e); } };
  const browse = async () => { if (!prof) return; try { setBusy(0); setFiles(await D.list(prof)); setBusy(null); } catch (e) { fail(e); } };
  const doImport = async () => {
    const chosen = (files ?? []).filter((f) => picked.has(f.name));
    try {
      const out: File[] = [];
      for (let i = 0; i < chosen.length; i++) { setBusy(i / chosen.length); const b: Uint8Array = await D.download(prof, chosen[i]!.name); out.push(new File([b as BlobPart], chosen[i]!.name)); }
      setBusy(null); onImport(out); onClose(); toast.success(`${out.length} foto importate da ${prof!.name}`, { duration: 2000 });
    } catch (e) { fail(e); }
  };
  const doUpload = async () => {
    if (!prof) return;
    try {
      setBusy(0);
      const fs = await makeFiles(kind);
      for (let i = 0; i < fs.length; i++) { setBusy(i / fs.length); await D.upload(prof, fs[i]!.name, fs[i]!); }
      setBusy(null); toast.success(fs.length > 1 ? `${fs.length} foto caricate su ${prof.name}` : `Caricato con successo su ${prof.name}`, { duration: 3000 }); onClose();
    } catch (e) { fail(e); }
  };

  const tabBtn = (t: typeof tab, label: string, Icon: typeof Upload) => (
    <button onClick={() => setTab(t)} className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-2 text-sm ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}><Icon className="h-4 w-4" /> {label}</button>
  );
  const Field = ({ l, v }: { l: string; v: string }) => (
    <div className="rounded bg-secondary px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div><div className="select-all font-mono text-base font-semibold">{v}</div></div>
  );

  const profilesBlock = (
    <>
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Server FTP salvati</div>
      <div className="mb-3 flex flex-col gap-1.5">
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5">
            <button onClick={() => setSel(p.id)} className={`flex flex-1 items-center gap-2 rounded px-3 py-2.5 text-left text-sm ${sel === p.id ? "bg-primary/20 ring-1 ring-primary" : "bg-secondary hover:bg-accent"}`}>
              {sel === p.id ? <Check className="h-4 w-4 text-primary" /> : <Server className="h-4 w-4 text-muted-foreground" />}
              <div className="min-w-0"><div className="truncate font-medium">{p.name}</div><div className="truncate text-xs text-muted-foreground">{p.user || "anonimo"}@{p.host}:{p.port}{p.dir || "/"}</div></div>
            </button>
            <button aria-label="Modifica" onClick={() => setEdit(p)} className="rounded p-2.5 text-muted-foreground hover:bg-accent"><Pencil className="h-4 w-4" /></button>
            <button aria-label="Rimuovi" onClick={() => { const l = list.filter((x) => x.id !== p.id); setList(l); saveFtpProfiles(l); if (sel === p.id) setSel(""); }} className="rounded p-2.5 text-muted-foreground hover:bg-accent"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {edit ? (
          <div className="space-y-2 rounded border border-border p-3">
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Nome (es. NAS Synology studio)" className={inp} />
            <div className="flex gap-2">
              <input value={edit.host} onChange={(e) => setEdit({ ...edit, host: e.target.value })} placeholder="Indirizzo (192.168.1.20 o nas.local)" className={`${inp} flex-1`} />
              <input value={edit.port} onChange={(e) => setEdit({ ...edit, port: Number(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="21" className={`${inp} w-20`} />
            </div>
            <div className="flex gap-2">
              <input value={edit.user} onChange={(e) => setEdit({ ...edit, user: e.target.value })} placeholder="Utente" autoComplete="off" className={inp} />
              <input value={edit.pass} onChange={(e) => setEdit({ ...edit, pass: e.target.value })} type="password" placeholder="Password" autoComplete="new-password" className={inp} />
            </div>
            <input value={edit.dir} onChange={(e) => setEdit({ ...edit, dir: e.target.value })} placeholder="Cartella (es. /photo/2026) — vuoto = iniziale" className={inp} />
            <div className="flex gap-2">
              <button disabled={!edit.name.trim() || !edit.host.trim()} onClick={saveEdit} className="flex-1 rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Salva server</button>
              {D && <button disabled={!edit.host.trim() || busy !== null} onClick={() => testConn({ ...edit, port: Number(edit.port) || 21 })} className="rounded bg-secondary px-3 py-2 text-sm hover:bg-accent">Prova</button>}
              <button onClick={() => setEdit(null)} className="rounded bg-secondary px-3 py-2 text-sm">Annulla</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEdit({ id: "", name: "", host: "", port: 21, user: "", pass: "", dir: "" })} className="flex items-center justify-center gap-1.5 rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent"><Plus className="h-4 w-4" /> Nuovo server FTP</button>
        )}
      </div>
    </>
  );

  const needDesktop = <div className="rounded border border-border bg-secondary/50 p-3 text-sm text-muted-foreground">Il browser non può collegarsi direttamente a un server FTP. Questa funzione è disponibile nella versione desktop di LoMa VIEWER (Windows / Mac). Puoi comunque salvare qui i server: li ritrovi uguali.</div>;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 sm:items-center sm:p-4" onClick={busy === null ? onClose : undefined}>
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-xl border border-border bg-card shadow-xl sm:rounded-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Server className="h-5 w-5 text-primary" />
          <h2 className="flex-1 text-base font-semibold">FTP</h2>
          {running && <span className="flex items-center gap-1 text-xs text-primary"><Radio className="h-3.5 w-3.5 animate-pulse" /> In ascolto</span>}
          <button aria-label="Chiudi" onClick={onClose} className="rounded p-2 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex gap-2">{tabBtn("rx", "Ricevi", Radio)}{tabBtn("import", "Importa", Download)}{tabBtn("upload", "Carica", Upload)}</div>

          {tab === "rx" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">LoMa VIEWER diventa un server FTP: la fotocamera invia le foto e arrivano subito nella griglia.</p>
              {env === "web" && <div className="rounded border border-border bg-secondary/50 p-3 text-sm text-muted-foreground">Nel browser il ricevitore non può essere avviato. Usalo dalla versione desktop. Per provare il funzionamento qui puoi usare il simulatore qui sotto.</div>}
              <div className="grid grid-cols-2 gap-2">
                <Field l="Indirizzo IP" v={ips[0]?.address ?? (env === "web" ? "192.168.1.50 (esempio)" : "—")} />
                <Field l="Porta" v={String(rx.port)} />
                <Field l="Utente" v={rx.user} />
                <Field l="Password" v={rx.pass} />
              </div>
              {ips.length > 1 && <div className="text-xs text-muted-foreground">Altre reti: {ips.slice(1).map((i) => `${i.address} (${i.name})`).join(" · ")}</div>}
              {!running && env !== "web" && (
                <details className="rounded border border-border p-3 text-sm">
                  <summary className="cursor-pointer">Modifica porta, utente, password, cartella</summary>
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <input value={rx.port} onChange={(e) => updRx({ ...rx, port: Number(e.target.value.replace(/\D/g, "")) || 2121 })} className={`${inp} w-24`} />
                      <input value={rx.user} onChange={(e) => updRx({ ...rx, user: e.target.value.trim() })} className={inp} />
                      <input value={rx.pass} onChange={(e) => updRx({ ...rx, pass: e.target.value.trim() })} className={inp} />
                    </div>
                    {env === "desktop" && <div className="flex gap-2">
                      <div className={`${inp} min-w-0 flex-1 truncate`}>{rx.dir}</div>
                      <button onClick={async () => { const d = await (window as any).lomaDesktop.pickFolder("Cartella foto ricevute", rx.dir); if (d) updRx({ ...rx, dir: d }); }} className="shrink-0 rounded bg-secondary px-3 py-2 text-sm hover:bg-accent">Sfoglia…</button>
                    </div>}
                  </div>
                </details>
              )}
              {env !== "web" && (running
                ? <button onClick={stop} className="flex w-full items-center justify-center gap-2 rounded bg-destructive px-3 py-2.5 text-sm font-medium text-destructive-foreground"><Square className="h-4 w-4" /> Ferma ricevitore</button>
                : <button disabled={!rx.user || !rx.pass} onClick={start} className="flex w-full items-center justify-center gap-2 rounded bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"><Play className="h-4 w-4" /> Avvia ricevitore</button>)}
              {env === "web" && (
                <>
                  <button onClick={() => simRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded bg-secondary px-3 py-2.5 text-sm hover:bg-accent"><FlaskConical className="h-4 w-4" /> Simula ricezione (scegli foto)</button>
                  <input ref={simRef} type="file" multiple accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.raf,.orf,.rw2,.tif,.tiff,.psd" hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) { onReceived(f); toast.success(`Simulazione: ${f.length} foto ricevute`, { duration: 1000 }); } }} />
                </>
              )}
              {running && env === "android" && adir && <div className="text-xs text-muted-foreground">Tieni LoMa VIEWER aperto in primo piano durante la ricezione. Le foto vengono salvate anche in: {adir}</div>}
              {running && env === "desktop" && <div className="text-xs text-muted-foreground">Le foto vengono salvate in: {rx.dir}</div>}
              <div className="rounded border border-border p-3">
                <div className="mb-1 text-sm font-medium">Come configurare la fotocamera</div>
                <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
                  <li>Collega fotocamera e {env === "android" ? "tablet" : "computer"} alla stessa rete Wi-Fi (o all'hotspot del telefono).</li>
                  <li>Premi "Avvia ricevitore" qui sopra.</li>
                  <li>Nel menu della fotocamera cerca "Trasferimento FTP" (Canon: Rete → Trasferimento FTP; Nikon: Rete → FTP; Sony: Rete → Funzione trasf. FTP).</li>
                  <li>Crea un server: indirizzo IP e porta come sopra, modalità <b>passiva</b> attiva, FTP semplice (non SFTP/FTPS), proxy disattivato.</li>
                  <li>Utente e password come sopra. Cartella di destinazione: lascia quella principale.</li>
                  <li>Attiva l'invio automatico dopo lo scatto, oppure invia le foto scelte dalla riproduzione.</li>
                  <li>Se non si collega, consenti LoMa VIEWER nel firewall di Windows/Mac quando richiesto.</li>
                </ol>
              </div>
              {logs.length > 0 && <div className="max-h-28 overflow-y-auto rounded bg-secondary p-2 font-mono text-[11px] text-muted-foreground">{logs.map((l, i) => <div key={i}>{l}</div>)}</div>}
            </div>
          )}

          {tab === "import" && (
            <>
              {profilesBlock}
              {!D ? needDesktop : !files ? (
                <button disabled={!prof || busy !== null} onClick={browse} className="w-full rounded bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Sfoglia la cartella</button>
              ) : files.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">Nessuna foto in questa cartella.</div> : (
                <>
                  <div className="mb-2 flex items-center text-xs text-muted-foreground">
                    <span className="flex-1">{picked.size} / {files.length} selezionate</span>
                    <button onClick={() => setPicked(picked.size === files.length ? new Set() : new Set(files.map((f) => f.name)))} className="rounded bg-secondary px-2 py-1 hover:bg-accent">{picked.size === files.length ? "Nessuna" : "Tutte"}</button>
                  </div>
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {files.map((f) => { const on = picked.has(f.name); return (
                      <button key={f.name} onClick={() => { const n = new Set(picked); on ? n.delete(f.name) : n.add(f.name); setPicked(n); }} className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${on ? "bg-primary/20 ring-1 ring-primary" : "bg-secondary hover:bg-accent"}`}>
                        {on ? <Check className="h-4 w-4 text-primary" /> : <span className="h-4 w-4" />}
                        <span className="flex-1 truncate">{f.name}</span><span className="text-xs text-muted-foreground">{mb(f.size)}</span>
                      </button>); })}
                  </div>
                  <button disabled={!picked.size || busy !== null} onClick={doImport} className="mt-3 w-full rounded bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Importa {picked.size || ""} foto</button>
                </>
              )}
            </>
          )}

          {tab === "upload" && (
            <>
              {profilesBlock}
              {!D ? needDesktop : (
                <>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Cosa inviare</div>
                  <div className="mb-3 grid grid-cols-3 gap-1.5">
                    {([["developed", "Sviluppata", "JPEG con regolazioni"], ["original", "Originale", "file così com'è"], ["clean", "Pulita", "senza EXIF/AI"]] as const).map(([k, l, d]) => (
                      <button key={k} onClick={() => setKind(k)} className={`rounded px-2 py-2 text-xs ${kind === k ? "bg-primary/20 ring-1 ring-primary" : "bg-secondary hover:bg-accent"}`}><div className="text-sm font-medium">{l}</div><div className="text-muted-foreground">{d}</div></button>
                    ))}
                  </div>
                  <button disabled={!prof || !hasImage || busy !== null} onClick={doUpload} className="flex w-full items-center justify-center gap-2 rounded bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    <Upload className="h-4 w-4" /> {hasImage ? `Carica ${count > 1 ? `${count} foto ` : ""}su ${prof?.name ?? "…"}` : "Apri prima un'immagine"}
                  </button>
                </>
              )}
            </>
          )}

          {busy !== null && (
            <div className="mt-3"><div className="h-2 overflow-hidden rounded bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(4, busy * 100)}%` }} /></div></div>
          )}
        </div>
      </div>
    </div>
  );
}

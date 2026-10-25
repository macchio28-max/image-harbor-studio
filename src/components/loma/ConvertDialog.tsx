import { useEffect, useMemo, useState } from "react";
import { X, Repeat } from "lucide-react";
import { toast } from "sonner";
import type { CullItem } from "./culling";
import { convertFile, EXT, scaledSize, type ConvOpts, type Fmt } from "./convert";
import { download, baseName, formatBytes } from "./viewer-utils";

const FORMATS: { id: Fmt | "dng"; label: string }[] = [
  { id: "jpeg", label: "JPEG" }, { id: "png", label: "PNG" }, { id: "webp", label: "WebP" },
  { id: "tiff", label: "TIFF" }, { id: "bmp", label: "BMP" }, { id: "gif", label: "GIF" }, { id: "dng", label: "DNG" },
];
type Scope = "current" | "visible" | "all";

export function ConvertDialog({ current, preview, size, session, visible, onClose }: {
  current: File | null; preview: string | null; size: { w: number; h: number } | null;
  session: CullItem[]; visible: CullItem[]; onClose: () => void;
}) {
  const [o, setO] = useState<ConvOpts>(() => ({ fmt: "jpeg", quality: 92, lossless: false, alpha: true, scale: 1, keepMeta: false }));
  const [scope, setScope] = useState<Scope>(current ? "current" : "all");
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const set = (p: Partial<ConvOpts>) => setO((x) => ({ ...x, ...p }));
  const files = useMemo(() => scope === "current" ? (current ? [current] : []) : (scope === "visible" ? visible : session).map((s) => s.file), [scope, current, visible, session]);
  const desk = typeof window !== "undefined" ? (window as any).lomaDesktop : null;
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [busy, onClose]);

  const start = async (): Promise<void> => {
    if (!files.length) { toast.error("Nessuna immagine da convertire"); return; }
    let dir = "";
    if (desk?.pickFolder && desk?.saveToFolder) {
      dir = await desk.pickFolder("Scegli la cartella di destinazione", localStorage.getItem("loma.convert.dir") || "");
      if (!dir) return;
      localStorage.setItem("loma.convert.dir", dir);
    }
    setBusy({ done: 0, total: files.length });
    const zip: Record<string, Uint8Array> = {};
    const used = new Set<string>();
    let fails = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      try {
        const b = await convertFile(f, o);
        let name = `${baseName(f.name)}.${EXT[o.fmt]}`, k = 1;
        while (used.has(name)) name = `${baseName(f.name)} (${k++}).${EXT[o.fmt]}`;
        used.add(name);
        if (dir) { const r = await desk.saveToFolder(dir, name, b); if (!r?.ok) fails++; }
        else if (files.length === 1) download(b, name);
        else zip[name] = new Uint8Array(await b.arrayBuffer());
      } catch { fails++; }
      setBusy({ done: i + 1, total: files.length });
    }
    if (!dir && files.length > 1 && Object.keys(zip).length) {
      const { zipSync } = await import("fflate");
      download(new Blob([zipSync(zip, { level: 0 }) as BlobPart], { type: "application/zip" }), `LoMa-convertite-${EXT[o.fmt]}.zip`);
    }
    setBusy(null);
    const ok = files.length - fails;
    if (ok) toast.success(`${ok} ${ok === 1 ? "immagine convertita" : "immagini convertite"} in ${o.fmt.toUpperCase()}${dir ? ` · salvate in ${dir}` : ""}`, dir && desk?.openPath ? { action: { label: "Apri cartella", onClick: () => desk.openPath(dir) } } : undefined);
    if (fails) toast.error(`${fails} ${fails === 1 ? "file non convertito" : "file non convertiti"}`);
    if (ok) onClose();
  };

  const out = size ? scaledSize(size.w, size.h, o.scale) : null;
  const pill = (on: boolean) => `rounded-md border px-2.5 py-1.5 text-xs transition ${on ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`;
  const metaPossible = o.fmt === "jpeg";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="w-[min(720px,94vw)] rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Repeat className="h-4 w-4" /> Converti Immagini</h2>
          <button onClick={onClose} disabled={!!busy} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
          <div>
            <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
              {preview && scope === "current" ? <img src={preview} alt="" className="max-h-full max-w-full object-contain" />
                : <div className="text-center text-xs text-muted-foreground"><div className="text-2xl font-semibold text-foreground">{files.length}</div>immagini</div>}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {scope === "current" && out ? <>Uscita: {out.w} × {out.h} px</> : <>{files.length} file · {formatBytes(files.reduce((s, f) => s + f.size, 0))}</>}
            </div>
          </div>
          <div className="space-y-4 text-sm">
            <section>
              <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Immagini</div>
              <div className="flex flex-wrap gap-1.5">
                <button disabled={!current} className={pill(scope === "current")} onClick={() => setScope("current")}>Immagine corrente</button>
                <button disabled={!visible.length} className={pill(scope === "visible")} onClick={() => setScope("visible")}>Filtrate ({visible.length})</button>
                <button disabled={!session.length} className={pill(scope === "all")} onClick={() => setScope("all")}>Tutta la sessione ({session.length})</button>
              </div>
            </section>
            <section>
              <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Formato</div>
              <div className="flex flex-wrap gap-1.5">
                {FORMATS.map((f) => f.id === "dng"
                  ? <button key="dng" disabled title="La scrittura DNG richiede i dati RAW del sensore: non disponibile" className={`${pill(false)} cursor-not-allowed opacity-40`}>DNG</button>
                  : <button key={f.id} className={pill(o.fmt === f.id)} onClick={() => set({ fmt: f.id as Fmt })}>{f.label}</button>)}
              </div>
              {(o.fmt === "jpeg" || (o.fmt === "webp" && !o.lossless)) && (
                <label className="mt-2 flex items-center gap-3 text-xs">Qualità
                  <input type="range" min={10} max={100} value={o.quality} onChange={(e) => set({ quality: +e.target.value })} className="flex-1 accent-primary" />
                  <span className="w-9 text-right tabular-nums">{o.quality}%</span></label>
              )}
              {o.fmt === "webp" && <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={o.lossless} onChange={(e) => set({ lossless: e.target.checked })} /> Lossless (massima qualità)</label>}
              {(o.fmt === "png" || o.fmt === "webp" || o.fmt === "tiff" || o.fmt === "gif") && <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={o.alpha} onChange={(e) => set({ alpha: e.target.checked })} /> Mantieni trasparenza</label>}
            </section>
            <section>
              <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Dimensione</div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 0.75, 0.5, 0.25].map((s) => <button key={s} className={pill(o.scale === s)} onClick={() => set({ scale: s })}>{s === 1 ? "Originale" : `${s * 100}%`}</button>)}
              </div>
            </section>
            <section>
              <div className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Metadati</div>
              <div className="flex gap-1.5">
                <button className={pill(!o.keepMeta)} onClick={() => set({ keepMeta: false })}>Rimuovi</button>
                <button disabled={!metaPossible} className={pill(o.keepMeta && metaPossible)} onClick={() => set({ keepMeta: true })}>Mantieni</button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{metaPossible ? "Mantieni: copia EXIF/XMP/profilo colore dai JPEG originali." : "Per questo formato i metadati vengono sempre rimossi."}</p>
            </section>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          {busy && <div className="flex-1"><div className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${(busy.done / busy.total) * 100}%` }} /></div><div className="mt-1 text-[11px] text-muted-foreground">{busy.done} / {busy.total}</div></div>}
          {!busy && <div className="flex-1 text-[11px] text-muted-foreground">{desk?.saveToFolder ? "Ti verrà chiesta la cartella di destinazione." : files.length > 1 ? "I file verranno scaricati in un archivio ZIP." : "Il file verrà scaricato."}</div>}
          <button onClick={onClose} disabled={!!busy} className="rounded-md border border-border px-3 py-1.5 text-sm">Annulla</button>
          <button onClick={start} disabled={!!busy || !files.length} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Conversione…" : "Avvia Conversione"}</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info, ScanSearch, Loader2, X } from "lucide-react";
import { superResolve, srScaleFor, type SrProfile } from "./detail-ai";
import type { Adjust } from "./develop";

type Tab = "classic" | "portrait" | "nature" | "denoise";
const TABS: [Tab, string][] = [["classic", "Classico"], ["portrait", "Ritratto AI"], ["nature", "Nature AI"], ["denoise", "Denoise AI"]];
const INFO: Record<Exclude<Tab, "classic">, string> = {
  portrait: "Pelle Naturale leviga micro-rumore e piccole macchie solo nelle tonalità della pelle, conservando i pori. Micro-Nitidezza Volto rinforza occhi, ciglia, sopracciglia e capelli senza aloni. Calcolato sul dispositivo, senza internet.",
  nature: "Rinforza piume, pelo e texture organiche solo dove c'è trama reale: cielo e sfondi sfocati restano puliti. Calcolato sul dispositivo, senza internet.",
  denoise: "Rimuove la grana di colore e di luminanza degli alti ISO seguendo le linee reali della foto. Preservazione dettagli restituisce parte della trama originale. Calcolato sul dispositivo, senza internet.",
};
const tabCls = (on: boolean) => `shrink-0 rounded-t-md border-b-2 px-2.5 py-1.5 text-xs font-medium ${on ? "border-primary bg-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;
const chip = (on: boolean) => `rounded border px-2 py-1.5 text-xs ${on ? "border-primary bg-primary/20 text-foreground" : "border-border bg-secondary hover:bg-accent"}`;

export function DetailAi({ a, set, S, classic, getFull }: {
  a: Adjust; set: (p: Partial<Adjust>) => void;
  S: (label: string, k: keyof Adjust, min: number, max: number, step?: number) => ReactNode;
  classic: ReactNode; getFull: (() => HTMLCanvasElement | null) | undefined;
}) {
  const [tab, setTab] = useState<Tab>("classic");
  const [info, setInfo] = useState(false);
  const [inspect, setInspect] = useState(false);
  return (
    <div className="space-y-2.5">
      <div role="tablist" aria-label="Schede Dettaglio" className="flex gap-0.5 overflow-x-auto border-b border-border">
        {TABS.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setInfo(false); }} className={tabCls(tab === id)}>{l}</button>)}
      </div>
      {tab !== "classic" && (
        <div className="flex items-start gap-2">
          {info && <p className="flex-1 rounded border border-border bg-secondary/60 p-2 text-[11px] leading-relaxed text-muted-foreground">{INFO[tab]}</p>}
          <button aria-label="Informazioni" onClick={() => setInfo((v) => !v)} className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"><Info className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {tab === "classic" && classic}
      {tab === "portrait" && <>{S("Micro-Nitidezza Volto", "portraitEyes", 0, 100)}{S("Pelle Naturale", "portraitSkin", 0, 100)}</>}
      {tab === "nature" && <>
        <button onClick={() => set({ natureAmount: 60 })} className="w-full rounded-md border border-border bg-secondary py-1.5 text-xs hover:bg-accent">Elaborazione rapida</button>
        {S("Intensità / Miscela", "natureAmount", 0, 100)}
      </>}
      {tab === "denoise" && <>{S("Intensità", "aiNr", 0, 100)}{S("Preservazione dettagli", "aiNrDetail", 0, 100)}</>}

      <div className="mt-3 space-y-2 rounded-md border border-border bg-secondary/30 p-2.5">
        <div className="text-[13px] font-medium">Super Risoluzione AI</div>
        <div className="grid grid-cols-3 gap-1.5">
          {([1, 2, 4] as const).map((k) => <button key={k} aria-pressed={a.srScale === k} onClick={() => set({ srScale: k })} className={chip(a.srScale === k)}>{k === 1 ? "Off" : `${k}×`}</button>)}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {([["standard", "Standard"], ["nature", "Nature"], ["portrait", "Ritratto"]] as [SrProfile, string][]).map(([p, l]) =>
            <button key={p} aria-pressed={a.srProfile === p} onClick={() => set({ srProfile: p })} className={chip(a.srProfile === p)}>{l}</button>)}
        </div>
        <button disabled={a.srScale === 1 || !getFull} onClick={() => setInspect(true)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs hover:bg-accent disabled:opacity-40"><ScanSearch className="h-4 w-4" />Ispeziona al 100% (1:1)</button>
        <p className="text-[11px] text-muted-foreground">Viene applicata al salvataggio. Ispeziona prima il risultato per controllare artefatti.</p>
      </div>
      {inspect && getFull && <SrInspector getFull={getFull} scale={a.srScale} profile={a.srProfile} onClose={() => setInspect(false)} />}
    </div>
  );
}

function SrInspector({ getFull, scale, profile, onClose }: { getFull: () => HTMLCanvasElement | null; scale: number; profile: SrProfile; onClose: () => void }) {
  const full = useRef<HTMLCanvasElement | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [patch, setPatch] = useState<{ url: string; w: number; h: number; scale: number } | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const render = async (fx: number, fy: number) => {
    setBusy(true); setErr(null);
    await new Promise((r) => setTimeout(r, 30));
    try {
      if (!full.current) {
        full.current = getFull(); if (!full.current) throw new Error("no image");
        const f = full.current, t = document.createElement("canvas"), k = 320 / Math.max(f.width, f.height);
        t.width = Math.round(f.width * k); t.height = Math.round(f.height * k);
        t.getContext("2d")!.drawImage(f, 0, 0, t.width, t.height); setThumb(t.toDataURL("image/jpeg", 0.8));
      }
      const f = full.current, side = Math.ceil(900 / scale);
      const pw = Math.min(side, f.width), ph = Math.min(side, f.height);
      const x = Math.max(0, Math.min(f.width - pw, Math.round(fx * f.width - pw / 2))), y = Math.max(0, Math.min(f.height - ph, Math.round(fy * f.height - ph / 2)));
      const pc = document.createElement("canvas"); pc.width = pw; pc.height = ph;
      pc.getContext("2d")!.drawImage(f, x, y, pw, ph, 0, 0, pw, ph);
      const real = srScaleFor(f.width, f.height, scale);
      const out = superResolve(pc, real, profile);
      const blob = await new Promise<Blob | null>((r) => out.canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("encode");
      setPatch((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(blob), w: out.canvas.width, h: out.canvas.height, scale: real }; });
    } catch { setErr("Anteprima non riuscita: memoria insufficiente su questo dispositivo."); }
    setBusy(false);
  };
  useEffect(() => { void render(0.5, 0.5); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (patch) URL.revokeObjectURL(patch.url); }, [patch]);
  return (
    <div role="dialog" aria-label="Super Risoluzione 1:1" className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-2" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold">Super Risoluzione {scale}× · 1:1</h2>
          <button aria-label="Chiudi" onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">Tocca la miniatura per scegliere la zona; scorri l'anteprima per esplorarla a pixel reali.</p>
        <div className="flex gap-2">
          {thumb && <img src={thumb} alt="Miniatura: tocca per scegliere la zona" className="h-20 w-auto cursor-crosshair rounded border border-border"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); void render((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }} />}
          <div className="font-mono text-[11px] text-muted-foreground">
            {patch && <>Fattore reale: {patch.scale}×<br />Profilo: {profile}</>}
            {patch && patch.scale < scale && <><br />Ridotto per limiti di memoria</>}
          </div>
        </div>
        <div className={`relative min-h-[240px] flex-1 overflow-auto rounded border border-border bg-background ${busy ? "opacity-60" : ""}`}>
          {patch && <img src={patch.url} alt="Anteprima Super Risoluzione al 100%" style={{ width: patch.w / dpr, height: patch.h / dpr, maxWidth: "none", imageRendering: "pixelated" }} />}
          {busy && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {err && <p className="p-3 text-sm text-destructive">{err}</p>}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { ChevronDown, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { analyze, type Provenance } from "./provenance";

const LIMIT = 16 * 1024 * 1024;

export function ProvenancePanel({ file, meta }: { file: File | null; meta: Record<string, any> }) {
  const [open, setOpen] = useState(true);
  const [res, setRes] = useState<Provenance | null>(null);
  useEffect(() => {
    setRes(null);
    if (!file) return;
    let alive = true;
    (async () => {
      const head = new Uint8Array(await file.slice(0, LIMIT).arrayBuffer());
      let bytes = head;
      if (file.size > LIMIT) {
        const tail = new Uint8Array(await file.slice(file.size - 2 * 1024 * 1024).arrayBuffer());
        bytes = new Uint8Array(head.length + tail.length); bytes.set(head); bytes.set(tail, head.length);
      }
      if (alive) setRes(analyze(bytes, meta));
    })().catch(() => alive && setRes({ level: "none", findings: [] }));
    return () => { alive = false; };
  }, [file, meta]);

  const badge = !res ? null : res.level === "ai"
    ? { icon: <ShieldAlert className="h-4 w-4" />, cls: "border-destructive/50 bg-destructive/15 text-destructive", text: "Generata o modificata con AI rilevata" }
    : res.level === "partial"
    ? { icon: <ShieldQuestion className="h-4 w-4" />, cls: "border-yellow-500/50 bg-yellow-500/15 text-yellow-400", text: "Possibile elaborazione o traccia parziale" }
    : { icon: <ShieldCheck className="h-4 w-4" />, cls: "border-emerald-500/50 bg-emerald-500/15 text-emerald-400", text: "Nessuna traccia AI rilevata nei metadati" };

  return (
    <section className="border-b border-border px-4 py-3">
      <button onClick={() => setOpen(!open)} className="mb-2 flex w-full items-center gap-2 text-left font-semibold">
        <ShieldCheck className="h-5 w-5" /> Provenienza & Rilevamento AI
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        !file ? <div className="text-sm text-muted-foreground">-</div>
        : !res ? <div className="text-sm text-muted-foreground">Analisi in corso…</div>
        : (
          <div className="space-y-2 text-sm">
            <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 font-medium ${badge!.cls}`}>{badge!.icon}{badge!.text}</div>
            {res.level === "none" && (
              <p className="text-xs text-muted-foreground">Controllati C2PA, XMP/IPTC, EXIF e chunk PNG. Attenzione: i metadati possono essere stati rimossi, quindi questo non prova che la foto sia autentica.</p>
            )}
            {res.findings.map((f, i) => (
              <div key={i} className="rounded-md border border-border bg-secondary/40 p-2">
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                  <span className="text-muted-foreground">Motore</span><span className="font-medium">{f.engine}</span>
                  <span className="text-muted-foreground">Firma</span><span>{f.signature}</span>
                </div>
                {f.mode && (
                  <div className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${f.mode === "generated" ? "bg-destructive/20 text-destructive" : f.mode === "edited" ? "bg-yellow-500/20 text-yellow-400" : "bg-muted text-muted-foreground"}`}>
                    {f.mode === "generated" ? "Generata da zero con AI" : f.mode === "edited" ? "Foto modificata / ritocco generativo AI" : "Tipo di intervento AI non determinabile"}
                  </div>
                )}
                {f.details.length > 0 && (
                  <dl className="mt-1.5 space-y-1 border-t border-border pt-1.5 text-xs">
                    {f.details.map(([k, v]) => (
                      <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="select-text whitespace-pre-wrap break-words">{v}</dd></div>
                    ))}
                  </dl>
                )}
                {f.candidates && (
                  <div className="mt-1.5 border-t border-border pt-1.5 text-xs">
                    <div className="text-muted-foreground">Strumenti che usano questa traccia (indicativo)</div>
                    <div className="mt-1 flex flex-wrap gap-1">{f.candidates.map((c) => <span key={c} className="rounded border border-border bg-background/60 px-1.5 py-0.5">{c}</span>)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </section>
  );
}

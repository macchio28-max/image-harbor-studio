import { useEffect, useRef, useState } from "react";
import { Printer, X } from "lucide-react";

export const PAPERS = {
  "10x15": { label: "10 × 15 cm (4×6\")", w: 101.6, h: 152.4 },
  "13x18": { label: "13 × 18 cm (5×7\")", w: 127, h: 177.8 },
  "15x20": { label: "15 × 20 cm (6×8\")", w: 152.4, h: 203.2 },
  a4: { label: "A4", w: 210, h: 297 },
  letter: { label: "Lettera", w: 215.9, h: 279.4 },
} as const;
type PaperKey = keyof typeof PAPERS;
type Orient = "auto" | "portrait" | "landscape";
type Mode = "fit" | "fill" | "border" | "id";

export interface PrintOpts { paper: PaperKey; orient: Orient; mode: Mode; idCount: 4 | 6 | 8; marks: boolean }

/** Sheet size in mm after orientation. */
export function sheetSize(o: PrintOpts, imgW: number, imgH: number) {
  const p = PAPERS[o.paper];
  const land = o.orient === "landscape" || (o.orient === "auto" && o.mode !== "id" && imgW > imgH);
  return land ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/** Draws the composed sheet onto a canvas at `pxPerMm`. */
export function drawSheet(img: HTMLImageElement, o: PrintOpts, pxPerMm: number): HTMLCanvasElement {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const s = sheetSize(o, iw, ih);
  const c = document.createElement("canvas");
  c.width = Math.round(s.w * pxPerMm); c.height = Math.round(s.h * pxPerMm);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  // Draws image cover/contain into a box (mm).
  const place = (x: number, y: number, w: number, h: number, cover: boolean) => {
    const k = cover ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    const dw = iw * k, dh = ih * k;
    ctx.save();
    ctx.beginPath(); ctx.rect(x * pxPerMm, y * pxPerMm, w * pxPerMm, h * pxPerMm); ctx.clip();
    ctx.drawImage(img, (x + (w - dw) / 2) * pxPerMm, (y + (h - dh) / 2) * pxPerMm, dw * pxPerMm, dh * pxPerMm);
    ctx.restore();
  };
  if (o.mode === "fit") place(0, 0, s.w, s.h, false);
  else if (o.mode === "fill") place(0, 0, s.w, s.h, true);
  else if (o.mode === "border") { const m = Math.max(5, Math.min(s.w, s.h) * 0.06); place(m, m, s.w - 2 * m, s.h - 2 * m, false); }
  else {
    const tw = 35, th = 45, gap = 4;
    const cols = o.idCount === 4 ? 2 : o.idCount === 6 ? 3 : 4;
    const rows = Math.ceil(o.idCount / cols);
    // Fit grid; rotate layout if it doesn't fit.
    let cw = cols, rw = rows;
    if (cols * tw + (cols - 1) * gap > s.w - 6) { cw = rows; rw = cols; }
    const gw = cw * tw + (cw - 1) * gap, gh = rw * th + (rw - 1) * gap;
    const ox = (s.w - gw) / 2, oy = (s.h - gh) / 2;
    ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(1, 0.15 * pxPerMm);
    for (let i = 0; i < o.idCount; i++) {
      const x = ox + (i % cw) * (tw + gap), y = oy + Math.floor(i / cw) * (th + gap);
      place(x, y, tw, th, true);
      if (o.marks) {
        const L = 2;
        for (const [px, py] of [[x, y], [x + tw, y], [x, y + th], [x + tw, y + th]] as [number, number][]) {
          const sx = px === x ? -1 : 1, sy = py === y ? -1 : 1;
          ctx.beginPath();
          ctx.moveTo(px * pxPerMm, py * pxPerMm); ctx.lineTo((px + sx * L) * pxPerMm, py * pxPerMm);
          ctx.moveTo(px * pxPerMm, py * pxPerMm); ctx.lineTo(px * pxPerMm, (py + sy * L) * pxPerMm);
          ctx.stroke();
        }
      }
    }
  }
  return c;
}

export function PrintDialog({ src, onClose }: { src: string; onClose: () => void }) {
  const [o, setO] = useState<PrintOpts>({ paper: "10x15", orient: "auto", mode: "fit", idCount: 6, marks: true });
  const [im, setIm] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const i = new Image(); i.onload = () => setIm(i); i.src = src; }, [src]);
  useEffect(() => {
    if (!im || !box.current) return;
    const s = sheetSize(o, im.naturalWidth, im.naturalHeight);
    const k = Math.min(420 / s.w, 420 / s.h);
    const c = drawSheet(im, o, k * 2);
    c.style.width = `${s.w * k}px`; c.style.height = `${s.h * k}px`;
    c.className = "shadow-lg";
    box.current.replaceChildren(c);
  }, [im, o]);

  const print = async () => {
    if (!im) return;
    setBusy(true);
    const s = sheetSize(o, im.naturalWidth, im.naturalHeight);
    const c = drawSheet(im, o, 300 / 25.4); // 300 dpi
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.95));
    if (!blob) { setBusy(false); return; }
    const url = URL.createObjectURL(blob);
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    const d = f.contentDocument!;
    d.open();
    d.write(`<!doctype html><html><head><style>@page{size:${s.w}mm ${s.h}mm;margin:0}html,body{margin:0;padding:0}img{display:block;width:${s.w}mm;height:${s.h}mm}</style></head><body><img src="${url}"></body></html>`);
    d.close();
    const imgEl = d.querySelector("img")!;
    const go = () => {
      setBusy(false);
      f.contentWindow!.focus(); f.contentWindow!.print();
      setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60000);
    };
    if (imgEl.complete) go(); else imgEl.onload = go;
  };

  const set = <K extends keyof PrintOpts>(k: K, v: PrintOpts[K]) => setO((p) => ({ ...p, [k]: v }));
  const Opt = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick} className={`rounded border px-2 py-1 text-xs ${on ? "border-primary bg-primary/20 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{children}</button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="no-drag flex max-h-[92vh] w-[860px] max-w-[96vw] flex-col rounded-lg border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Printer className="h-4 w-4" /> Stampa Fotografica</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 gap-4 overflow-auto p-4">
          <div ref={box} className="flex h-[440px] flex-1 items-center justify-center rounded bg-canvas" />
          <div className="w-64 space-y-4 text-xs">
            <div>
              <div className="mb-1 text-muted-foreground">Formato carta</div>
              <select className="sel" value={o.paper} onChange={(e) => set("paper", e.target.value as PaperKey)}>
                {Object.entries(PAPERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-1 text-muted-foreground">Orientamento</div>
              <div className="flex flex-wrap gap-1">
                <Opt on={o.orient === "auto"} onClick={() => set("orient", "auto")}>Automatico</Opt>
                <Opt on={o.orient === "portrait"} onClick={() => set("orient", "portrait")}>Verticale</Opt>
                <Opt on={o.orient === "landscape"} onClick={() => set("orient", "landscape")}>Orizzontale</Opt>
              </div>
            </div>
            <div>
              <div className="mb-1 text-muted-foreground">Foto singola</div>
              <div className="flex flex-wrap gap-1">
                <Opt on={o.mode === "fit"} onClick={() => set("mode", "fit")}>Adatta intera</Opt>
                <Opt on={o.mode === "fill"} onClick={() => set("mode", "fill")}>Riempi foglio</Opt>
                <Opt on={o.mode === "border"} onClick={() => set("mode", "border")}>Bordo bianco</Opt>
              </div>
            </div>
            <div>
              <div className="mb-1 text-muted-foreground">Fototessere 35×45 mm</div>
              <div className="flex flex-wrap gap-1">
                {([4, 6, 8] as const).map((n) => (
                  <Opt key={n} on={o.mode === "id" && o.idCount === n} onClick={() => setO((p) => ({ ...p, mode: "id", idCount: n }))}>{n} tessere</Opt>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={o.marks} onChange={(e) => set("marks", e.target.checked)} /> Crocini di taglio
              </label>
              {o.mode === "id" && o.idCount === 8 && (o.paper === "10x15") && <p className="mt-1 text-muted-foreground">8 tessere stanno meglio su 13×18 o più grande.</p>}
            </div>
            <p className="text-muted-foreground">Nella finestra di stampa imposta margini "Nessuno" e scala 100% per misure esatte.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Annulla</button>
          <button disabled={!im || busy} onClick={print} className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
            <Printer className="h-3.5 w-3.5" /> {busy ? "Preparazione…" : "Stampa"}
          </button>
        </div>
      </div>
    </div>
  );
}

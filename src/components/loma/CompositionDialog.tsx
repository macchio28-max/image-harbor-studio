import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Type, Shapes, Eye, EyeOff, ArrowUp, ArrowDown, Trash2, Copy, Undo2, Redo2, Download, Check, Bold, Italic, FlipHorizontal2, FlipVertical2, RotateCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BLENDS, newLayer, paintComposition, type Composition, type Layer, type Blend } from './composition';
import { decodeSource } from './convert';
import { download } from './viewer-utils';
import { startHistory, commit, undo, redo } from './edit-history';

const INITIAL: Composition = { width: 1920, height: 1080, layers: [] };
export function CompositionDialog({ open, onClose, seedFiles, onComplete }: {
  open: boolean; onClose: () => void; seedFiles: () => Promise<File[]>; onComplete: (file: File) => void;
}) {
  const [history, setHistory] = useState(() => startHistory(INITIAL));
  const doc = history.present;
  const [selected, select] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const assets = useRef(new Map<string, ImageBitmap>());
  const seeded = useRef(false);
  const dragging = useRef<{ x: number; y: number; layer: Layer; doc: Composition } | null>(null);
  const active = doc.layers.find(l => l.id === selected);
  const change = (next: Composition) => setHistory(h => commit(h, next));
  const patch = (values: Partial<Layer>) => change({ ...doc, layers: doc.layers.map(l => l.id === selected ? { ...l, ...values } : l) });

  async function addPhotos(files: File[], initial = false) {
    setBusy(true);
    const layers: Layer[] = [];
    let w = doc.width, h = doc.height;
    try {
      for (const file of files) {
        try {
          const bitmap = await decodeSource(file);
          if ((initial || !doc.layers.length) && !layers.length) { w = bitmap.width; h = bitmap.height; }
          const l = { ...newLayer('photo', w, h), name: file.name, width: bitmap.width, height: bitmap.height,
            scale: Math.min(1, w / bitmap.width, h / bitmap.height) };
          l.asset = l.id; assets.current.set(l.id, bitmap); layers.push(l);
        } catch { toast.error(`Impossibile aprire ${file.name}`); }
        await new Promise(r => setTimeout(r, 0));
      }
      if (layers.length) {
        setHistory(his => commit(his, { width: w, height: h, layers: [...his.present.layers, ...layers] }));
        select(layers.at(-1)?.id ?? null);
      }
    } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!open || seeded.current) return;
    seeded.current = true;
    setBusy(true);
    void seedFiles().then(files => addPhotos(files, true)).catch(() => { setBusy(false); toast.error('Impossibile aprire le foto selezionate.'); });
  }, [open]); // Initial seed only; edits survive dialog closing.
  useEffect(() => {
    const el = frame; if (!open || !el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPreviewSize({ width: Math.max(1, entry.contentRect.width - 16), height: Math.max(1, entry.contentRect.height - 16) });
    });
    observer.observe(el); return () => observer.disconnect();
  }, [open, frame]);
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => { if (canvas.current) paintComposition(canvas.current, doc, assets.current, 1400); });
    return () => cancelAnimationFrame(id);
  }, [open, doc, busy]);
  useEffect(() => () => { for (const bm of assets.current.values()) bm.close(); assets.current.clear(); }, []);

  const exportFile = async (insert: boolean) => {
    setBusy(true);
    try {
      await new Promise(r => setTimeout(r, 0));
      const out = paintComposition(document.createElement('canvas'), doc, assets.current);
      const blob = await new Promise<Blob>((resolve, reject) => out.toBlob(b => b ? resolve(b) : reject(new Error('PNG non disponibile')), 'image/png'));
      const file = new File([blob], 'LoMa_composizione.png', { type: 'image/png' });
      if (insert) onComplete(file); else download(file, file.name);
      toast.success(insert ? 'Composizione aggiunta' : 'PNG salvato', { duration: 1000 });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Esportazione non riuscita'); }
    finally { setBusy(false); }
  };
  const add = (kind: 'text' | 'shape') => { const l = newLayer(kind, doc.width, doc.height); change({ ...doc, layers: [...doc.layers, l] }); select(l.id); };
  const reorder = (delta: number) => {
    const layers = [...doc.layers], i = layers.findIndex(l => l.id === selected), j = i + delta;
    const a = layers[i], b = layers[j]; if (!a || !b) return;
    layers[i] = b; layers[j] = a; change({ ...doc, layers });
  };
  const number = (label: string, value: number, set: (v: number) => void, min: number, max: number, step = 1) => <label className="flex min-w-0 items-center justify-between gap-2 text-xs">
    <span>{label}</span><input aria-label={label} type="number" value={Number(value.toFixed(2))} min={min} max={max} step={step} className="w-24 rounded border border-border bg-background px-2 py-1" onChange={e => { const v = e.target.valueAsNumber; if (Number.isFinite(v)) set(Math.min(max, Math.max(min, v))); }} />
  </label>;
  return <Dialog open={open} onOpenChange={v => { if (!v && !busy) onClose(); }}>
    <DialogContent aria-describedby={undefined} className="flex h-[92dvh] w-[96vw] max-w-6xl flex-col gap-2 overflow-hidden bg-card p-3 sm:p-4" onPointerDown={e => e.stopPropagation()}>
      <DialogTitle className="pr-8">Compositore di livelli</DialogTitle>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}><ImagePlus />Foto</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => add('text')}><Type />Testo</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => add('shape')}><Shapes />Forma</Button>
        <Button size="icon" variant="ghost" title="Annulla composizione" aria-label="Annulla composizione" disabled={busy || !history.past.length} onClick={() => setHistory(undo)}><Undo2 /></Button>
        <Button size="icon" variant="ghost" title="Ripeti composizione" aria-label="Ripeti composizione" disabled={busy || !history.future.length} onClick={() => setHistory(redo)}><Redo2 /></Button>
        <span className="ml-auto text-xs text-muted-foreground">{doc.width} × {doc.height} · {busy ? 'Elaborazione…' : `${doc.layers.length} livelli`}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(140px,1fr)_minmax(140px,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_280px] md:grid-rows-1">
        <div ref={setFrame} className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-canvas p-2">
          <canvas ref={canvas} aria-label="Anteprima composizione" className="max-h-full max-w-full touch-none object-contain" style={{ width: doc.width * Math.min(previewSize.width / doc.width, previewSize.height / doc.height), height: doc.height * Math.min(previewSize.width / doc.width, previewSize.height / doc.height) }} onPointerDown={e => {
            if (!active || busy) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = { x: e.clientX, y: e.clientY, layer: active, doc };
          }} onPointerMove={e => {
            const d = dragging.current; if (!d) return;
            const r = e.currentTarget.getBoundingClientRect();
            const l = { ...d.layer, x: d.layer.x + (e.clientX - d.x) * doc.width / r.width, y: d.layer.y + (e.clientY - d.y) * doc.height / r.height };
            setHistory(h => ({ ...h, present: { ...d.doc, layers: d.doc.layers.map(x => x.id === l.id ? l : x) } }));
          }} onPointerUp={() => {
            const d = dragging.current; if (!d) return;
            dragging.current = null;
            setHistory(h => commit({ ...h, present: d.doc }, h.present));
          }} onPointerCancel={() => { const d = dragging.current; dragging.current = null; if (d) setHistory(h => ({ ...h, present: d.doc })); }} />
        </div>
        <aside className="min-h-0 overflow-y-auto space-y-3 pr-1">
          <fieldset disabled={busy} className="space-y-2">
            <legend className="mb-2 text-xs font-medium">Tela</legend>
            {number('Larghezza tela', doc.width, v => change({ ...doc, width: v }), 1, 16384)}
            {number('Altezza tela', doc.height, v => change({ ...doc, height: v }), 1, 16384)}
          </fieldset>
          <div className="space-y-1 border-y border-border py-2">
            {[...doc.layers].reverse().map(l => <div key={l.id} className={`flex items-center gap-1 rounded ${selected === l.id ? 'bg-accent' : ''}`}>
              <Button size="sm" variant="ghost" className="min-w-0 flex-1 justify-start" disabled={busy} onClick={() => select(l.id)}><span className="truncate">{l.name}</span></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title={`Visibilità: ${l.name}`} aria-label={`Visibilità: ${l.name}`} disabled={busy} onClick={() => change({ ...doc, layers: doc.layers.map(x => x.id === l.id ? { ...x, visible: !x.visible } : x) })}>{l.visible ? <Eye /> : <EyeOff />}</Button>
            </div>)}
          </div>
          {active && <fieldset disabled={busy} className="space-y-2">
            <input className="sel" aria-label="Nome livello" value={active.name} onChange={e => patch({ name: e.target.value })} />
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" title="Porta sopra" aria-label="Porta sopra" onClick={() => reorder(1)} disabled={doc.layers.at(-1)?.id === selected}><ArrowUp /></Button>
              <Button size="icon" variant="ghost" title="Porta sotto" aria-label="Porta sotto" onClick={() => reorder(-1)} disabled={doc.layers[0]?.id === selected}><ArrowDown /></Button>
              <Button size="icon" variant="ghost" title="Duplica livello" aria-label="Duplica livello" onClick={() => { const l = { ...active, id: crypto.randomUUID(), name: `${active.name} copia`, x: active.x + 20, y: active.y + 20 }; change({ ...doc, layers: [...doc.layers, l] }); select(l.id); }}><Copy /></Button>
              <Button size="icon" variant="ghost" title="Elimina livello" aria-label="Elimina livello" onClick={() => { change({ ...doc, layers: doc.layers.filter(l => l.id !== selected) }); select(null); }}><Trash2 /></Button>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant={active.flipH ? 'secondary' : 'ghost'} title="Specchia orizzontalmente" aria-label="Specchia orizzontalmente" aria-pressed={active.flipH} onClick={() => patch({ flipH: !active.flipH })}><FlipHorizontal2 /></Button>
              <Button size="icon" variant={active.flipV ? 'secondary' : 'ghost'} title="Capovolgi verticalmente" aria-label="Capovolgi verticalmente" aria-pressed={active.flipV} onClick={() => patch({ flipV: !active.flipV })}><FlipVertical2 /></Button>
              <Button size="icon" variant="ghost" title="Ruota 90° a sinistra" aria-label="Ruota 90° a sinistra" onClick={() => patch({ rotation: ((active.rotation - 90) % 360 + 360) % 360 - 180 })}><RotateCcw /></Button>
              <Button size="icon" variant="ghost" title="Ruota 90° a destra" aria-label="Ruota 90° a destra" onClick={() => patch({ rotation: ((active.rotation + 90) % 360 + 360) % 360 - 180 })}><RotateCw /></Button>
            </div>
            <label className="block text-xs">Fusione<select aria-label="Fusione" className="sel mt-1" value={active.blend} onChange={e => patch({ blend: e.target.value as Blend })}>{BLENDS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {number('Opacità %', active.opacity, v => patch({ opacity: v }), 0, 100)}
            {number('Posizione X', active.x, v => patch({ x: v }), -doc.width * 2, doc.width * 3)}
            {number('Posizione Y', active.y, v => patch({ y: v }), -doc.height * 2, doc.height * 3)}
            {number('Scala %', active.scale * 100, v => patch({ scale: v / 100 }), 1, 1000)}
            <input type="range" aria-label="Scala livello" className="loma-range" min={1} max={300} value={active.scale * 100} onChange={e => patch({ scale: Number(e.target.value) / 100 })} />
            {number('Rotazione °', active.rotation, v => patch({ rotation: v }), -360, 360)}
            {active.kind === 'text' && <>
              <textarea className="sel" aria-label="Testo livello" value={active.text} onChange={e => patch({ text: e.target.value })} />
              <select className="sel" aria-label="Font" value={active.font} onChange={e => patch({ font: e.target.value })}>{['Arial', 'Helvetica', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Trebuchet MS', 'monospace', 'serif', 'sans-serif'].map(f => <option key={f}>{f}</option>)}</select>
              {number('Dimensione testo', active.fontSize, v => patch({ fontSize: v }), 1, 4000)}
              <div className="flex gap-1"><Button size="icon" variant={active.bold ? 'secondary' : 'ghost'} title="Grassetto" aria-label="Grassetto" aria-pressed={active.bold} onClick={() => patch({ bold: !active.bold })}><Bold /></Button><Button size="icon" variant={active.italic ? 'secondary' : 'ghost'} title="Corsivo" aria-label="Corsivo" aria-pressed={active.italic} onClick={() => patch({ italic: !active.italic })}><Italic /></Button></div>
            </>}
            {active.kind === 'shape' && <>
              <select className="sel" aria-label="Tipo forma" value={active.shape} onChange={e => patch({ shape: e.target.value as Layer['shape'] })}><option value="rectangle">Rettangolo</option><option value="ellipse">Ellisse</option><option value="line">Linea</option></select>
              {number('Larghezza forma', active.width, v => patch({ width: v }), 1, 16384)}
              {number('Altezza / spessore', active.height, v => patch({ height: v }), 1, 16384)}
            </>}
            {active.kind !== 'photo' && <label className="flex items-center justify-between text-xs">Colore<input aria-label="Colore livello" type="color" value={active.color} onChange={e => patch({ color: e.target.value })} /></label>}
          </fieldset>}
        </aside>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border pt-2">
        <Button size="sm" variant="secondary" disabled={busy || !doc.layers.length} onClick={() => void exportFile(false)}><Download />Salva PNG</Button>
        <Button size="sm" disabled={busy || !doc.layers.length} onClick={() => void exportFile(true)}><Check />Aggiungi al visualizzatore</Button>
      </div>
      <input ref={input} type="file" hidden multiple accept="image/*,.tif,.tiff,.psd,.psb,.dng,.cr2,.cr3,.nef,.arw,.rw2,.orf,.raf" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void addPhotos(files); }} />
    </DialogContent>
  </Dialog>;
}
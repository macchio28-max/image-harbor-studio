import { useRef, useState, type ReactNode } from "react";
import { FolderOpen, Images, Cloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompareItem } from "./compare-collection";

type Props = {
  label: "A" | "B";
  active: boolean;
  items: CompareItem[];
  current: string | null;
  onImport: (files: File[]) => void;
  onCloud: () => void;
  onPick: (id: string) => void;
  onRemove: (id: string) => void;
  children: ReactNode;
};

export function CompareEmpty({ onFiles, onFolder, onCloud }: { onFiles: () => void; onFolder: () => void; onCloud: () => void }) {
  return <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-3 text-center">
    <Images className="h-16 w-16 text-muted-foreground/60 sm:h-24 sm:w-24" strokeWidth={1.2} />
    <h2 className="text-base font-medium sm:text-xl">Nessuna immagine caricata</h2>
    <Button onClick={onFiles}><Images />Apri immagini…</Button>
    <div className="flex flex-wrap justify-center gap-2">
      <Button variant="secondary" size="sm" onClick={onFolder}><FolderOpen />Cartella…</Button>
      <Button variant="secondary" size="sm" onClick={onCloud}><Cloud />Cloud</Button>
    </div>
  </div>;
}

export function CompareWorkspace({ label, active, items, current, onImport, onCloud, onPick, onRemove, children }: Props) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [group, setGroup] = useState("");
  const groups = [...new Set(items.map(item => item.folder || "Immagini"))];
  const chosenGroup = groups.includes(group) ? group : "";
  const shown = chosenGroup ? items.filter(item => (item.folder || "Immagini") === chosenGroup) : items;
  return <section aria-label={`Confronto ${label}`} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-canvas">
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-toolbar px-2 py-1.5">
      <span className={`mr-auto text-xs font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>{label} · {items.length} foto</span>
      <Button variant="ghost" size="icon" title={`Aggiungi immagini a ${label}`} aria-label={`Aggiungi immagini a ${label}`} onClick={() => files.current?.click()}><Images /></Button>
      <Button variant="ghost" size="icon" title={`Aggiungi cartella a ${label}`} aria-label={`Aggiungi cartella a ${label}`} onClick={() => folder.current?.click()}><FolderOpen /></Button>
      <Button variant="ghost" size="icon" title={`Importa da Cloud in ${label}`} aria-label={`Importa da Cloud in ${label}`} onClick={onCloud}><Cloud /></Button>
    </div>
    <div className="flex min-h-0 flex-1 [&>main]:rounded-none [&>main]:border-0 [&>div]:rounded-none [&>div]:border-0">
      {items.length ? children : <CompareEmpty onFiles={() => files.current?.click()} onFolder={() => folder.current?.click()} onCloud={onCloud} />}
    </div>
    {items.length > 0 && <div className="shrink-0 border-t border-border bg-toolbar">
      <div className="px-2 py-1">
        <select aria-label={`Cartelle ${label}`} value={chosenGroup} onChange={event => setGroup(event.target.value)} className="h-8 w-full min-w-0 rounded border border-input bg-background px-2 text-xs">
          <option value="">Tutte le cartelle · {items.length}</option>
          {groups.map(name => <option key={name} value={name}>{name} · {items.filter(item => (item.folder || "Immagini") === name).length}</option>)}
        </select>
      </div>
      <div className="flex h-24 gap-1.5 overflow-x-auto px-2 pb-2">
        {shown.map(item => <div key={item.id} className={`relative h-20 w-24 shrink-0 overflow-hidden rounded border ${item.id === current ? "border-primary ring-1 ring-primary" : "border-border"}`}>
          <Button variant="ghost" onClick={() => onPick(item.id)} aria-label={`Mostra ${item.file.name} in ${label}`} className="flex h-full w-full flex-col gap-0 rounded-none p-0">
            {item.thumb ? <img src={item.thumb} alt="" className="h-14 w-full object-contain" /> : <Images className="my-4 text-muted-foreground" />}
            <span className="w-full truncate px-1 text-[10px]">{item.file.name}</span>
          </Button>
          <Button variant="secondary" size="icon" className="absolute right-0 top-0 h-6 w-6" title={`Chiudi ${item.file.name}`} aria-label={`Chiudi ${item.file.name} in ${label}`} onClick={() => onRemove(item.id)}><X className="h-3 w-3" /></Button>
        </div>)}
      </div>
    </div>}
    <input ref={files} type="file" accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.orf,.rw2,.raf,.pef,.srw,.heic,.heif,.tif,.tiff,.psd,.psb" multiple hidden onChange={event => { onImport(Array.from(event.target.files || [])); event.target.value = ""; }} />
    <input ref={element => { folder.current = element; element?.setAttribute("webkitdirectory", ""); }} type="file" multiple hidden onChange={event => { onImport(Array.from(event.target.files || [])); event.target.value = ""; }} />
  </section>;
}
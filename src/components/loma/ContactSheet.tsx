import type React from "react";
import { useEffect, useRef } from "react";
import { Flag, Lock, Star, ImageOff, Check } from "lucide-react";
import type { CullFilter, CullItem } from "./culling";

type Props = {
  items: CullItem[];
  current: string | null;
  size: number;
  setSize: (n: number) => void;
  onPick: (id: string) => void;
  onOpen: (id: string) => void;
  hideLock?: boolean;
  filter: CullFilter;
  setFilter: (f: CullFilter) => void;
  total: number;
  selected: Set<string>;
  onSelect: (id: string, how: "toggle" | "range" | "only") => void;
  onClearSel: () => void;
};

export function ContactSheet({ items, current, size, setSize, onPick, onOpen, hideLock, filter, setFilter, total, selected, onSelect, onClearSel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chip = (a: boolean) => `rounded px-2 py-0.5 text-xs whitespace-nowrap ${a ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`;
  const imgH = Math.round(size * 0.68);
  const cardH = imgH + 28;
  useEffect(() => {
    ref.current?.querySelector(`[data-id="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);
  return (
    <div
      data-grid
      className="absolute inset-0 z-40 flex flex-col bg-canvas"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="whitespace-nowrap">Griglia · {items.length} / {total}</span>
        <span className="mx-1 h-4 w-px bg-border" />
        <button className={chip(filter.kind === "all")} onClick={() => setFilter({ ...filter, kind: "all" })}>Tutte</button>
        {!hideLock && <button className={chip(filter.kind === "locked")} onClick={() => setFilter({ ...filter, kind: "locked" })}><Lock className="mr-1 inline h-3 w-3" />Lucchettate</button>}
        <button className={chip(filter.kind === "flagged")} onClick={() => setFilter({ ...filter, kind: "flagged" })}><Flag className="mr-1 inline h-3 w-3" />Flaggate</button>
        <span className="mx-1 h-4 w-px bg-border" />
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={chip(filter.minStars === n)} onClick={() => setFilter({ ...filter, minStars: n })}>{n === 0 ? "★ tutte" : `≥ ${n}★`}</button>
        ))}
        {selected.size > 1 && <><span className="mx-1 h-4 w-px bg-border" /><span className="whitespace-nowrap text-primary">{selected.size} selezionate</span><button className={chip(false)} onClick={onClearSel}>Deseleziona</button></>}
        <button className={chip(false)} onClick={() => items.forEach((i) => onSelect(i.id, "toggle-on" as any))}>Seleziona tutte</button>
        <span className="ml-auto">Dimensione</span>
        <input type="range" min={100} max={320} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-32 accent-primary" />
      </div>
      <div ref={ref} className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`, gridAutoRows: `${cardH}px` }}>
        {items.map((i) => (
          <div
            key={i.id}
            data-id={i.id}
            role="button"
            tabIndex={0}
            onClick={(e) => { if (e.metaKey || e.ctrlKey) onSelect(i.id, "toggle"); else if (e.shiftKey) onSelect(i.id, "range"); else { onSelect(i.id, "only"); onPick(i.id); } }}
            onDoubleClick={() => onOpen(i.id)}
            style={{ height: cardH, contentVisibility: "auto", containIntrinsicSize: `auto ${cardH}px` } as React.CSSProperties}
            className={`flex cursor-pointer flex-col overflow-hidden rounded-md border-2 bg-toolbar text-left ${selected.has(i.id) && selected.size > 1 ? "border-primary ring-2 ring-primary/50" : i.id === current ? "border-primary" : "border-transparent hover:border-border"}`}
          >
            <div className="relative w-full shrink-0 bg-background" style={{ height: imgH }}>
              {i.thumb ? (
                <img src={i.thumb} alt={i.file.name} loading="lazy" decoding="async" draggable={false} className="block h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-6 w-6" /></div>
              )}
              <span role="checkbox" aria-checked={selected.has(i.id)} aria-label="Seleziona" onClick={(e) => { e.stopPropagation(); onSelect(i.id, "toggle"); }} onDoubleClick={(e) => e.stopPropagation()}
                className={`absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-full border-2 ${selected.has(i.id) ? "border-primary bg-primary text-primary-foreground" : "border-foreground/60 bg-background/60 text-transparent"}`}><Check className="h-3.5 w-3.5" /></span>
              {i.locked && !hideLock && <span className="absolute right-1 top-1 rounded bg-background/80 p-0.5 text-chart-3"><Lock className="h-3.5 w-3.5" /></span>}
              {i.flagged && <span className="absolute left-1 top-1 rounded bg-background/80 p-0.5 text-primary"><Flag className="h-3.5 w-3.5 fill-current" /></span>}
            </div>
            <div className="flex h-6 shrink-0 items-center gap-1 px-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px]">{i.file.name}</span>
              <span className="flex shrink-0 text-chart-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`h-2.5 w-2.5 ${n <= i.rating ? "fill-current" : "opacity-25"}`} />
                ))}
              </span>
            </div>
          </div>
        ))}
        {!items.length && <div className="col-span-full py-10 text-center text-sm text-muted-foreground">Nessuna foto corrisponde al filtro.</div>}
      </div>
    </div>
  );
}

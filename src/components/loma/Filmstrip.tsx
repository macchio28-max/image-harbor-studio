import { useEffect, useRef } from "react";
import { Flag, Lock, Star, Send, ImageOff } from "lucide-react";
import type { CullFilter, CullItem } from "./culling";

type Props = {
  items: CullItem[];
  total: number;
  current: string | null;
  filter: CullFilter;
  setFilter: (f: CullFilter) => void;
  onSelect: (id: string) => void;
  onSendBatch: () => void;
  hideLock?: boolean;
};

export function Filmstrip({ items, total, current, filter, setFilter, onSelect, onSendBatch, hideLock }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(`[data-id="${current}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      el.scrollLeft += d * 1.5;
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);
  const chip = (active: boolean) =>
    `rounded px-2 py-0.5 text-xs whitespace-nowrap ${active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`;

  return (
    <div className="border-t border-border bg-toolbar px-3 pb-2 pt-1.5">
      <div className="mb-1.5 flex items-center gap-1.5 overflow-x-auto">
        <button className={chip(filter.kind === "all")} onClick={() => setFilter({ ...filter, kind: "all" })}>Tutte</button>
        {!hideLock && <button className={chip(filter.kind === "locked")} onClick={() => setFilter({ ...filter, kind: "locked" })}>
          <Lock className="mr-1 inline h-3 w-3" />Solo lucchettate
        </button>}
        <button className={chip(filter.kind === "flagged")} onClick={() => setFilter({ ...filter, kind: "flagged" })}>
          <Flag className="mr-1 inline h-3 w-3" />Solo flaggate
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={chip(filter.minStars === n)} onClick={() => setFilter({ ...filter, minStars: n })}>
            {n === 0 ? "★ tutte" : `≥ ${n}★`}
          </button>
        ))}
        <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">{items.length} / {total}</span>
        <button
          onClick={onSendBatch}
          className="ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Send className="h-3 w-3" /> Invia filtrate a Lightroom
        </button>
      </div>
      <div ref={ref} className="flex gap-1.5 overflow-x-auto pb-1">
        {items.map((i) => (
          <button
            key={i.id}
            data-id={i.id}
            onClick={() => onSelect(i.id)}
            title={i.file.name}
            className={`relative h-20 w-28 shrink-0 overflow-hidden rounded border-2 bg-canvas ${i.id === current ? "border-primary" : "border-transparent hover:border-border"}`}
          >
            {i.thumb ? (
              <img src={i.thumb} alt={i.file.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-5 w-5" /></div>
            )}
            {i.rating > 0 && (
              <span className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 rounded bg-background/80 px-1 text-[10px] text-chart-3">
                {i.rating}<Star className="h-2.5 w-2.5 fill-current" />
              </span>
            )}
            {i.locked && !hideLock && (
              <span className="absolute right-0.5 top-0.5 rounded bg-background/80 p-0.5 text-chart-3"><Lock className="h-3 w-3" /></span>
            )}
            {i.flagged && (
              <span className="absolute left-0.5 top-0.5 rounded bg-background/80 p-0.5 text-primary"><Flag className="h-3 w-3 fill-current" /></span>
            )}
          </button>
        ))}
        {!items.length && <div className="py-6 text-xs text-muted-foreground">Nessuna foto corrisponde al filtro.</div>}
      </div>
    </div>
  );
}

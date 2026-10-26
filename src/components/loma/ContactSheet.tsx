import type React from "react";
import { useEffect, useRef } from "react";
import { Flag, Lock, Star, ImageOff } from "lucide-react";
import type { CullItem } from "./culling";

type Props = {
  items: CullItem[];
  current: string | null;
  size: number;
  setSize: (n: number) => void;
  onPick: (id: string) => void;
  onOpen: (id: string) => void;
  hideLock?: boolean;
};

export function ContactSheet({ items, current, size, setSize, onPick, onOpen, hideLock }: Props) {
  const ref = useRef<HTMLDivElement>(null);
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
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>Griglia · {items.length} foto</span>
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
            onClick={() => onPick(i.id)}
            onDoubleClick={() => onOpen(i.id)}
            style={{ height: cardH, contentVisibility: "auto", containIntrinsicSize: `auto ${cardH}px` } as React.CSSProperties}
            className={`flex cursor-pointer flex-col overflow-hidden rounded-md border-2 bg-toolbar text-left ${i.id === current ? "border-primary" : "border-transparent hover:border-border"}`}
          >
            <div className="relative w-full shrink-0 bg-background" style={{ height: imgH }}>
              {i.thumb ? (
                <img src={i.thumb} alt={i.file.name} loading="lazy" decoding="async" draggable={false} className="block h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-6 w-6" /></div>
              )}
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

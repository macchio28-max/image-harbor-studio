import { useEffect, useRef, useState } from "react";

export type PaneSlot = {
  url: string | null;
  w: number;
  h: number;
  name: string;
};

/** Inactive side of the A/B comparison: independent zoom & pan; click to make it the active photo. */
type View = { scale: number; off: { x: number; y: number } };
export function ComparePane({ slot, label, onActivate, view, onView }: { slot: PaneSlot | null; label: string; onActivate: () => void; view?: View | null; onView?: (v: View) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(view?.scale ?? 1);
  const [off, setOff] = useState(view?.off ?? { x: 0, y: 0 });
  const kept = useRef(!!view);
  useEffect(() => { onView?.({ scale, off }); }, [scale, off]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useRef({ scale, off });
  st.current = { scale, off };
  const g = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const fit = () => {
    const el = ref.current;
    if (!el || !slot?.url) return;
    const r = el.getBoundingClientRect();
    const s = Math.min(r.width / slot.w, r.height / slot.h, 1) || 1;
    setScale(s);
    setOff({ x: (r.width - slot.w * s) / 2, y: (r.height - slot.h * s) / 2 });
  };
  useEffect(() => { if (kept.current) { kept.current = false; return; } requestAnimationFrame(fit); }, [slot?.url, slot?.w, slot?.h]); // keep the zoom it had while active

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const { scale: z, off: o } = st.current;
      const n = Math.min(Math.max(z * Math.exp(-e.deltaY * 0.0018), 0.02), 40);
      const k = n / z;
      setScale(n);
      setOff({ x: px - (px - o.x) * k, y: py - (py - o.y) * k });
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  return (
    <div
      ref={ref}
      className="relative min-w-0 flex-1 cursor-grab touch-none overflow-hidden rounded-lg border border-border bg-canvas active:cursor-grabbing"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        g.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y, moved: false };
      }}
      onPointerMove={(e) => {
        const c = g.current;
        if (!c) return;
        const dx = e.clientX - c.sx, dy = e.clientY - c.sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) c.moved = true;
        if (c.moved) setOff({ x: c.ox + dx, y: c.oy + dy });
      }}
      onPointerUp={() => { const c = g.current; g.current = null; if (c && !c.moved) onActivate(); }}
      onDoubleClick={fit}
      title="Clic per rendere attiva questa foto · rotellina zoom · trascina per spostare"
    >
      {slot?.url ? (
        <img
          src={slot.url}
          alt={slot.name}
          draggable={false}
          className="absolute left-0 top-0 max-w-none"
          style={{ width: slot.w, height: slot.h, transformOrigin: "0 0", transform: `translate(${off.x}px, ${off.y}px) scale(${scale})` }}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Clicca qui per attivare il riquadro {label}, poi scegli una foto dalla filmstrip o apri un file.
        </div>
      )}
      <span className="absolute left-2 top-2 rounded bg-popover/80 px-2 py-0.5 text-xs">{label}{slot?.name ? ` · ${slot.name}` : ""}</span>
      {slot?.url && <span className="absolute bottom-2 left-2 rounded bg-popover/80 px-2 py-0.5 text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>}
    </div>
  );
}

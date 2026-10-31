import { useRef, useState, type ReactNode } from "react";
import {
  RotateCcw, RotateCw, Wand2, FlipHorizontal, FlipVertical, Crop as CropIcon, Pipette, X, Check,
  Sun, Contrast, SunMoon, CircleDot, Spline, BarChart3, Thermometer, Droplet, Disc3, Grip, Sparkles, CloudFog, Aperture,
  ChevronUp, ChevronDown,
} from "lucide-react";
import { type Adjust, defaultAdjust, monotoneSpline, WB_PRESETS, type WbMode, type Tone } from "./develop";
import { UserPresets } from "./UserPresets";

type SetA = (f: (a: Adjust) => Adjust) => void;
type AreaId = "crop" | "exp" | "color" | "fx";
type ToolId =
  | "cut" | "orient"
  | "exposure" | "contrast" | "lights" | "wb2" | "curves" | "levels"
  | "wb" | "vib" | "wheels"
  | "texture" | "clarity" | "dehaze" | "vig";

const AREAS: { id: AreaId; label: string; tools: { id: ToolId; label: string; I: any; keys: (keyof Adjust)[] }[] }[] = [
  { id: "crop", label: "Ritaglio", tools: [
    { id: "cut", label: "Taglierina", I: CropIcon, keys: ["straighten"] },
    { id: "orient", label: "Ruota / Rifletti", I: RotateCw, keys: ["rotation", "flipH", "flipV"] },
  ] },
  { id: "exp", label: "Esposizione", tools: [
    { id: "exposure", label: "Esposizione", I: Sun, keys: ["exposure"] },
    { id: "contrast", label: "Contrasto", I: Contrast, keys: ["contrast"] },
    { id: "lights", label: "Luci / Ombre", I: SunMoon, keys: ["highlight", "shadow"] },
    { id: "wb2", label: "Bianchi / Neri", I: CircleDot, keys: ["white", "black"] },
    { id: "curves", label: "Curve", I: Spline, keys: ["curvePts"] },
    { id: "levels", label: "Livelli", I: BarChart3, keys: ["lvBlack", "lvWhite", "lvGamma"] },
  ] },
  { id: "color", label: "Colore", tools: [
    { id: "wb", label: "Bilanciamento", I: Thermometer, keys: ["kelvin", "tint", "wbMode"] },
    { id: "vib", label: "Vividezza", I: Droplet, keys: ["vibrance", "saturation"] },
    { id: "wheels", label: "Ruote colore", I: Disc3, keys: ["cbShadows", "cbMid", "cbHigh"] },
  ] },
  { id: "fx", label: "Effetti", tools: [
    { id: "texture", label: "Texture", I: Grip, keys: ["texture"] },
    { id: "clarity", label: "Chiarezza", I: Sparkles, keys: ["clarity"] },
    { id: "dehaze", label: "Foschia", I: CloudFog, keys: ["dehaze"] },
    { id: "vig", label: "Vignettatura", I: Aperture, keys: ["vigAmount", "vigMethod"] },
  ] },
];

const ASPECTS: [string, number | null][] = [["Libero", null], ["1:1", 1], ["3:2", 3 / 2], ["2:3", 2 / 3], ["4:3", 4 / 3], ["4:5", 4 / 5], ["16:9", 16 / 9]];

export function DevelopPanel(props: {
  adjust: Adjust; setAdjust: SetA; hist: Uint32Array[] | null; hasImage: boolean;
  onAutoWb: () => void; onAutoExposure: () => void;
  cropping: boolean; aspect: number | null;
  onAspect: (r: number | null) => void; onStartCrop: () => void; onApplyCrop: () => void; onCancelCrop: () => void; onResetCrop: () => void;
  onResetAll: () => void; onClose: () => void;
  /** Phone: floating resizable bottom sheet instead of a side column. */
  sheet?: boolean;
}) {
  const { adjust: a, setAdjust } = props;
  const [area, setArea] = useState<AreaId>("exp");
  const [tool, setTool] = useState<Record<AreaId, ToolId>>({ crop: "cut", exp: "exposure", color: "wb", fx: "texture" });
  const [h, setH] = useState(42); // sheet height in vh
  const drag = useRef<{ y: number; h: number } | null>(null);
  const cur = AREAS.find((x) => x.id === area)!;
  const t = cur.tools.find((x) => x.id === tool[area])!;
  const set = <K extends keyof Adjust>(k: K, v: Adjust[K]) => setAdjust((x) => ({ ...x, [k]: v }));
  const reset = (keys: (keyof Adjust)[]) => setAdjust((x) => { const n: any = { ...x }; keys.forEach((k) => (n[k] = structuredClone(defaultAdjust[k]))); return n; });
  const S = (label: string, k: keyof Adjust, min: number, max: number, step = 1, track?: string) => (
    <Slider label={label} value={a[k] as number} min={min} max={max} step={step} track={track} def={defaultAdjust[k] as number}
      onChange={(v) => setAdjust((x) => ({ ...x, [k]: v, ...(k === "kelvin" || k === "tint" ? { wbMode: "custom" as WbMode } : {}) }))} />
  );

  const body = (() => {
    switch (t.id) {
      case "cut": return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {ASPECTS.map(([l, r]) => (
              <button key={l} onClick={() => props.onAspect(r)} className={`rounded border px-2 py-1 text-xs ${props.aspect === r ? "border-primary bg-primary/20 text-foreground" : "border-border bg-secondary hover:bg-accent"}`}>{l}</button>
            ))}
          </div>
          {S("Raddrizza", "straighten", -45, 45, 0.1)}
          {props.cropping ? (
            <div className="flex gap-2">
              <button onClick={props.onApplyCrop} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground"><Check className="h-4 w-4" /> Applica</button>
              <button onClick={props.onCancelCrop} className="rounded-md bg-secondary px-3 py-2 text-sm">Annulla</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={props.onStartCrop} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground"><CropIcon className="h-4 w-4" /> Ritaglia / Modifica</button>
              <button onClick={props.onResetCrop} className="rounded-md bg-secondary px-3 py-2 text-sm">Rimuovi</button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Trascina angoli e lati per ridimensionare, l'interno per spostare. Puoi riaprire il ritaglio e modificarlo quando vuoi.</p>
        </div>
      );
      case "orient": return (
        <div className="grid grid-cols-2 gap-2">
          <Big onClick={() => set("rotation", a.rotation - 90)} I={RotateCcw} l="Ruota 90° sx" />
          <Big onClick={() => set("rotation", a.rotation + 90)} I={RotateCw} l="Ruota 90° dx" />
          <Big onClick={() => set("flipH", !a.flipH)} I={FlipHorizontal} l="Rifletti orizz." on={a.flipH} />
          <Big onClick={() => set("flipV", !a.flipV)} I={FlipVertical} l="Rifletti vert." on={a.flipV} />
        </div>
      );
      case "exposure": return <>{S("Esposizione", "exposure", -3, 3, 0.01)}<Hint>Le alte luci vengono compresse dolcemente: niente bianchi bruciati.</Hint></>;
      case "contrast": return S("Contrasto", "contrast", -100, 100);
      case "lights": return <>{S("Alte luci", "highlight", -100, 100)}{S("Ombre", "shadow", -100, 100)}</>;
      case "wb2": return <>{S("Bianchi", "white", -100, 100)}{S("Neri", "black", -100, 100)}</>;
      case "curves": return <CurveEditor pts={a.curvePts} hist={props.hist} onChange={(p) => set("curvePts", p)} />;
      case "levels": return (
        <>
          <Histogram hist={props.hist} />
          {S("Nero input", "lvBlack", 0, 120)}{S("Gamma", "lvGamma", 0.3, 3, 0.01)}{S("Bianco input", "lvWhite", 135, 255)}
        </>
      );
      case "wb": return (
        <>
          <div className="flex gap-1">
            <select className="sel" value={a.wbMode} onChange={(e) => {
              const m = e.target.value as WbMode;
              if (m === "auto") return props.onAutoWb();
              setAdjust((x) => ({ ...x, wbMode: m, ...(m in WB_PRESETS ? { kelvin: WB_PRESETS[m as keyof typeof WB_PRESETS], tint: 0 } : {}) }));
            }}>
              <option value="asShot">Come scattata</option><option value="auto">Auto</option><option value="daylight">Luce diurna</option>
              <option value="cloudy">Nuvoloso</option><option value="shade">Ombra</option><option value="tungsten">Tungsteno</option>
              <option value="fluorescent">Fluorescente</option><option value="flash">Flash</option><option value="custom">Personalizzato</option>
            </select>
            <button title="Auto" onClick={props.onAutoWb} className="rounded border border-border px-2"><Pipette className="h-3.5 w-3.5" /></button>
          </div>
          {S("Temperatura", "kelvin", 2000, 12000, 10, "linear-gradient(90deg,hsl(225 80% 55%),hsl(0 0% 85%),hsl(45 90% 55%))")}
          {S("Tinta", "tint", -100, 100, 1, "linear-gradient(90deg,hsl(120 60% 45%),hsl(0 0% 85%),hsl(310 65% 58%))")}
        </>
      );
      case "vib": return <>{S("Vividezza", "vibrance", -100, 100)}{S("Saturazione", "saturation", -100, 100)}</>;
      case "wheels": return (
        <div className="grid grid-cols-3 gap-2">
          {([["Ombre", "cbShadows"], ["Medi", "cbMid"], ["Alte luci", "cbHigh"]] as const).map(([l, k]) => (
            <ColorWheel key={k} label={l} value={a[k]} onChange={(v) => set(k, v)} />
          ))}
        </div>
      );
      case "texture": return S("Texture", "texture", -100, 100);
      case "clarity": return S("Chiarezza", "clarity", -100, 100);
      case "dehaze": return S("Rimozione foschia", "dehaze", -100, 100);
      case "vig": return (
        <>
          {S("Quantità", "vigAmount", -3, 3, 0.01)}
          <div className="flex gap-1">
            {(["elliptic", "circular"] as const).map((m) => (
              <button key={m} onClick={() => set("vigMethod", m)} className={`rounded border px-2 py-1 text-xs ${a.vigMethod === m ? "border-primary bg-primary/20" : "border-border bg-secondary"}`}>{m === "elliptic" ? "Ellittica" : "Circolare"}</button>
            ))}
          </div>
        </>
      );
    }
  })();

  const content = (
    <>
      {/* Area tabs */}
      <div className="flex items-center border-b border-border bg-secondary/40">
        {AREAS.map((x) => (
          <button key={x.id} onClick={() => setArea(x.id)} className={`flex-1 border-b-2 px-1 py-2 text-xs font-medium ${area === x.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{x.label}</button>
        ))}
        <button onClick={props.onClose} title="Chiudi pannello" className="px-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {/* Tool tiles (Photoshop "Regolazioni singole") */}
      <div className="grid grid-cols-3 gap-0.5 border-b border-border p-1.5">
        {cur.tools.map((x) => (
          <button key={x.id} onClick={() => setTool((o) => ({ ...o, [area]: x.id }))}
            className={`flex flex-col items-center gap-1 rounded px-1 py-1.5 text-[11px] leading-tight ${tool[area] === x.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}>
            <x.I className="h-5 w-5" strokeWidth={1.5} />{x.label}
          </button>
        ))}
      </div>
      {/* Only the selected tool */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
        {!props.hasImage ? <p className="text-xs text-muted-foreground">Apri un'immagine per usare le regolazioni.</p> : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-[13px] font-medium">{t.label}</span>
              {t.id === "exposure" && <HBtn title="Auto" onClick={props.onAutoExposure}><Wand2 className="h-3.5 w-3.5" /></HBtn>}
              <HBtn title="Ripristina strumento" onClick={() => reset(t.keys)}><RotateCcw className="h-3.5 w-3.5" /></HBtn>
            </div>
            {body}
          </div>
        )}
      </div>
      <UserPresets adjust={a} onApply={(next) => setAdjust(() => next)} disabled={!props.hasImage} />
      <button onClick={props.onResetAll} className="m-2 rounded-md border border-border py-1.5 text-xs hover:bg-accent">Ripristina tutte le regolazioni</button>
    </>
  );

  if (props.sheet) {
    return (
      <div onPointerDown={(e) => e.stopPropagation()} style={{ height: `${h}vh` }}
        className="fixed inset-x-2 bottom-16 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur">
        <div className="flex touch-none items-center justify-center gap-3 py-1"
          onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, h }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setH(Math.min(80, Math.max(18, d.h - ((e.clientY - d.y) / window.innerHeight) * 100))); }}
          onPointerUp={() => { drag.current = null; }}>
          <button aria-label="Rimpicciolisci" onClick={() => setH((v) => Math.max(18, v - 20))} className="p-1 text-muted-foreground"><ChevronDown className="h-4 w-4" /></button>
          <span className="h-1.5 w-12 rounded-full bg-muted-foreground/50" />
          <button aria-label="Ingrandisci" onClick={() => setH((v) => Math.min(80, v + 20))} className="p-1 text-muted-foreground"><ChevronUp className="h-4 w-4" /></button>
        </div>
        {content}
      </div>
    );
  }
  return (
    <aside onPointerDown={(e) => e.stopPropagation()} className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border p-2"><Histogram hist={props.hist} /></div>
      {content}
    </aside>
  );
}

function Hint({ children }: { children: ReactNode }) { return <p className="text-[11px] text-muted-foreground">{children}</p>; }
function HBtn({ children, title, onClick }: { children: ReactNode; title: string; onClick: () => void }) {
  return <button title={title} onClick={onClick} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">{children}</button>;
}
function Big({ I, l, onClick, on }: { I: any; l: string; onClick: () => void; on?: boolean }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 rounded-md border py-3 text-xs ${on ? "border-primary bg-primary/20" : "border-border bg-secondary hover:bg-accent"}`}>
      <I className="h-5 w-5" />{l}
    </button>
  );
}

function Slider({ label, value, min, max, step = 1, def, track, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; def: number; track?: string | undefined; onChange: (v: number) => void;
}) {
  const dec = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground" onDoubleClick={() => onChange(def)} title="Doppio clic per ripristinare">{label}</span>
        <input type="number" value={Number(value.toFixed(dec))} step={step} min={min} max={max}
          onChange={(e) => { const v = +e.target.value; if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v))); }}
          className="w-16 rounded bg-background/60 px-1 py-0.5 text-right tabular-nums" />
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onDoubleClick={() => onChange(def)}
        onChange={(e) => onChange(+e.target.value)} className="loma-range w-full" style={track ? { ["--track" as any]: track } : undefined} />
    </div>
  );
}

/** Master RGB curve: drag points, tap the line to add, double-tap a point to remove. */
function CurveEditor({ pts, hist, onChange }: { pts: [number, number][]; hist: Uint32Array[] | null; onChange: (p: [number, number][]) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const dragI = useRef<number | null>(null);
  const S = 200;
  const pos = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))] as [number, number];
  };
  const sp = monotoneSpline(pts);
  let d = ""; for (let i = 0; i <= 100; i++) { const x = i / 100; d += `${i ? "L" : "M"}${x * S},${(1 - sp(x)) * S}`; }
  return (
    <div className="space-y-1">
      <svg ref={svg} viewBox={`0 0 ${S} ${S}`} className="aspect-square w-full touch-none rounded bg-background/60"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const [x, y] = pos(e);
          let idx = pts.findIndex((p) => Math.hypot(p[0] - x, p[1] - y) < 0.06);
          if (idx < 0) { const n = [...pts, [x, sp(x)] as [number, number]].sort((a, b) => a[0] - b[0]); idx = n.findIndex((p) => p[0] === x); onChange(n); }
          dragI.current = idx;
        }}
        onPointerMove={(e) => {
          const i = dragI.current; if (i == null) return;
          const [x, y] = pos(e); const n = pts.map((p) => [...p] as [number, number]);
          const lo = i === 0 ? 0 : n[i - 1]![0] + 0.01, hi = i === n.length - 1 ? 1 : n[i + 1]![0] - 0.01;
          n[i] = [i === 0 ? 0 : i === n.length - 1 ? 1 : Math.min(hi, Math.max(lo, x)), y];
          onChange(n);
        }}
        onPointerUp={() => { dragI.current = null; }}
        onDoubleClick={(e) => {
          const [x, y] = pos(e as any);
          const i = pts.findIndex((p) => Math.hypot(p[0] - x, p[1] - y) < 0.06);
          if (i > 0 && i < pts.length - 1) onChange(pts.filter((_, j) => j !== i));
        }}>
        {hist && <HistPath hist={hist} S={S} />}
        {[0.25, 0.5, 0.75].map((g) => <g key={g} stroke="currentColor" className="text-border" strokeWidth={0.5}><line x1={g * S} y1={0} x2={g * S} y2={S} /><line x1={0} y1={g * S} x2={S} y2={g * S} /></g>)}
        <line x1={0} y1={S} x2={S} y2={0} stroke="currentColor" className="text-muted-foreground/40" strokeDasharray="3 3" />
        <path d={d} fill="none" stroke="currentColor" className="text-foreground" strokeWidth={1.5} />
        {pts.map((p, i) => <circle key={i} cx={p[0] * S} cy={(1 - p[1]) * S} r={5} className="fill-primary stroke-background" strokeWidth={1.5} />)}
      </svg>
      <Hint>Tocca la curva per aggiungere un punto, trascinalo per regolare, doppio tocco per eliminarlo.</Hint>
    </div>
  );
}
function HistPath({ hist, S }: { hist: Uint32Array[]; S: number }) {
  let max = 1; const l = new Float32Array(256);
  for (let i = 0; i < 256; i++) { l[i] = (hist[0]![i]! + hist[1]![i]! + hist[2]![i]!) / 3; if (i > 1 && i < 254) max = Math.max(max, l[i]!); }
  let d = `M0,${S}`; for (let i = 0; i < 256; i++) d += ` L${(i / 255) * S},${S - Math.min(S, (l[i]! / max) * S * 0.9)}`;
  return <path d={d + ` L${S},${S} Z`} className="fill-muted-foreground/20" />;
}

/** Colour wheel: angle = hue, distance from centre = strength. */
function ColorWheel({ label, value, onChange }: { label: string; value: Tone; onChange: (t: Tone) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const pick = (e: React.PointerEvent) => {
    const r = el.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const rad = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    const h = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    onChange({ h: Math.round(h), a: Math.round(rad * 100) });
  };
  const ang = (value.h * Math.PI) / 180, rr = value.a / 100;
  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={el} className="relative aspect-square w-full touch-none rounded-full"
        style={{ background: "radial-gradient(circle, hsl(0 0% 60%) 0%, transparent 70%), conic-gradient(from 0deg, hsl(0 70% 50%), hsl(60 70% 50%), hsl(120 70% 45%), hsl(180 70% 45%), hsl(240 70% 55%), hsl(300 70% 50%), hsl(360 70% 50%))" }}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); pick(e); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") pick(e); }}
        onDoubleClick={() => onChange({ h: 0, a: 0 })}>
        <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-background shadow"
          style={{ left: `${50 + Math.sin(ang) * rr * 50}%`, top: `${50 - Math.cos(ang) * rr * 50}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[10px] tabular-nums text-muted-foreground">{value.a}%</span>
    </div>
  );
}

function Histogram({ hist }: { hist: any[] | null }) {
  if (!hist) return <div className="h-20 rounded bg-background/60" />;
  let max = 1;
  for (const ch of hist) for (let i = 2; i < 254; i++) max = Math.max(max, ch[i]);
  const path = (ch: any) => {
    let p = "M0,100";
    for (let i = 0; i < 256; i++) p += ` L${i},${100 - Math.min(100, (ch[i] / max) * 100)}`;
    return p + " L255,100 Z";
  };
  return (
    <svg viewBox="0 0 256 100" preserveAspectRatio="none" className="h-20 w-full rounded bg-background/60">
      <g style={{ mixBlendMode: "screen" }}>
        <path d={path(hist[0])} fill="hsl(0 80% 55% / 0.55)" />
        <path d={path(hist[1])} fill="hsl(120 70% 45% / 0.55)" />
        <path d={path(hist[2])} fill="hsl(220 85% 58% / 0.55)" />
      </g>
    </svg>
  );
}


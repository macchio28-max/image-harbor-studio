import { useState, type ReactNode } from "react";
import {
  ChevronRight, ChevronDown, RotateCcw, Wand2, MoreHorizontal, FolderOpen, Camera, Shapes, Palette,
  ChevronsRight, RotateCw, FlipHorizontal, Crop as CropIcon, Pipette,
} from "lucide-react";
import { type Adjust, defaultAdjust, HSL_CH, type HslCh, PRESETS, WB_PRESETS, type WbMode, type Tone } from "./develop";

type Tab = "library" | "tether" | "shape" | "color";
type SetA = (f: (a: Adjust) => Adjust) => void;

const SECTIONS: Record<Tab, string[]> = {
  library: ["hist", "styles", "layers"],
  tether: ["hist"],
  shape: ["hist", "crop", "vig"],
  color: ["hist", "base", "wb", "exp", "hdr", "clarity", "dehaze", "layers", "vig", "styles", "crop", "cb", "ce", "sharp", "nr"],
};

const CH_LABEL: Record<HslCh, string> = { red: "Rosso", orange: "Arancio", yellow: "Giallo", green: "Verde", aqua: "Acqua", blue: "Blu", purple: "Viola", magenta: "Magenta" };
const CH_COLOR: Record<HslCh, string> = { red: "hsl(0 80% 55%)", orange: "hsl(30 85% 55%)", yellow: "hsl(55 85% 55%)", green: "hsl(120 60% 45%)", aqua: "hsl(180 60% 50%)", blue: "hsl(225 75% 58%)", purple: "hsl(275 60% 58%)", magenta: "hsl(315 65% 58%)" };

export function DevelopPanel(props: {
  adjust: Adjust; setAdjust: SetA; hist: Uint32Array[] | null; hasImage: boolean;
  onAutoWb: () => void; onAutoExposure: () => void;
  onAspect: (r: number | null) => void; onApplyCrop: () => void; onResetCrop: () => void;
  onResetAll: () => void; onClose: () => void;
}) {
  const { adjust: a, setAdjust } = props;
  const [tab, setTab] = useState<Tab>("color");
  const [open, setOpen] = useState<Record<string, boolean>>({ hist: true, wb: true, exp: true, hdr: true, vig: true });
  const [ceCh, setCeCh] = useState<HslCh>("red");
  const set = <K extends keyof Adjust>(k: K, v: Adjust[K]) => setAdjust((x) => ({ ...x, [k]: v }));
  const reset = (...keys: (keyof Adjust)[]) => setAdjust((x) => { const n: any = { ...x }; keys.forEach((k) => (n[k] = structuredClone(defaultAdjust[k]))); return n; });
  const show = (id: string) => SECTIONS[tab].includes(id);

  const ctx: Ctx = { show, open, toggle: (id) => setOpen((o) => ({ ...o, [id]: !o[id] })), reset, resetAll: props.onResetAll };
  const S = (label: string, k: keyof Adjust, min: number, max: number, step = 1, track?: string) => (
    <Slider label={label} value={a[k] as number} min={min} max={max} step={step} track={track}
      def={defaultAdjust[k] as number}
      onChange={(v) => setAdjust((x) => ({ ...x, [k]: v, ...(k === "kelvin" || k === "tint" ? { wbMode: "custom" as WbMode } : {}) }))} />
  );
  const tone = (label: string, k: "cbShadows" | "cbMid" | "cbHigh") => {
    const t = a[k] as Tone;
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <Slider label="Tonalità" value={t.h} min={0} max={360} def={0} track="linear-gradient(90deg,hsl(0 80% 55%),hsl(60 80% 55%),hsl(120 80% 45%),hsl(180 80% 50%),hsl(240 80% 60%),hsl(300 80% 55%),hsl(360 80% 55%))" onChange={(v) => set(k, { ...t, h: v })} />
        <Slider label="Quantità" value={t.a} min={0} max={100} def={0} onChange={(v) => set(k, { ...t, a: v })} />
      </div>
    );
  };

  return (
    <aside onPointerDown={(e) => e.stopPropagation()} className="flex w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center border-b border-border px-1 py-1">
        {([["library", "LIBRARY", FolderOpen], ["tether", "TETHER", Camera], ["shape", "SHAPE", Shapes], ["color", "COLOR", Palette]] as const).map(([id, l, I]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex flex-1 flex-col items-center gap-0.5 rounded px-1 py-1 text-[10px] tracking-wide ${tab === id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <I className="h-5 w-5" strokeWidth={1.4} />{l}
          </button>
        ))}
        <button onClick={props.onClose} title="Chiudi pannello" className="px-2 text-chart-3"><ChevronsRight className="h-5 w-5 rotate-180" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto text-sm">
        {!props.hasImage && <p className="px-3 py-2 text-xs text-muted-foreground">Apri un'immagine per usare le regolazioni.</p>}
        <Sec c={ctx} id="hist" title="Histogram"><Histogram hist={props.hist} /></Sec>
        {tab === "tether" && <p className="px-3 py-3 text-xs text-muted-foreground">Lo scatto collegato (tethering) a una fotocamera richiede la versione desktop di LoMa VIEWER con fotocamera connessa via USB.</p>}
        <Sec c={ctx} id="base" title="Base Characteristics" keys={["curve"]}>
          <Row label="Profilo ICC"><select className="sel" disabled><option>sRGB (incorporato)</option></select></Row>
          <Row label="Curva">
            <select className="sel" value={a.curve} onChange={(e) => set("curve", e.target.value as Adjust["curve"])}>
              <option value="linear">Lineare</option><option value="standard">Film Standard</option><option value="high">Film Contrasto Alto</option>
            </select>
          </Row>
        </Sec>
        <Sec c={ctx} id="wb" title="White Balance" keys={["kelvin", "tint", "wbMode"]} auto={props.onAutoWb}>
          <Row label="Mode">
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
              <button title="Auto (contagocce neutro)" onClick={props.onAutoWb} className="rounded border border-border px-1.5"><Pipette className="h-3.5 w-3.5" /></button>
            </div>
          </Row>
          {S("Kelvin", "kelvin", 2000, 12000, 10, "linear-gradient(90deg,hsl(225 80% 55%),hsl(0 0% 85%),hsl(55 90% 55%))")}
          {S("Tint", "tint", -100, 100, 1, "linear-gradient(90deg,hsl(120 60% 45%),hsl(0 0% 85%),hsl(310 65% 58%))")}
        </Sec>
        <Sec c={ctx} id="exp" title="Exposure" keys={["exposure", "contrast", "brightness", "saturation"]} auto={props.onAutoExposure}>
          {S("Exposure", "exposure", -4, 4, 0.01)}{S("Contrast", "contrast", -100, 100)}{S("Brightness", "brightness", -100, 100)}{S("Saturation", "saturation", -100, 100)}
        </Sec>
        <Sec c={ctx} id="hdr" title="High Dynamic Range" keys={["highlight", "shadow", "white", "black"]}>
          {S("Highlight", "highlight", -100, 100)}{S("Shadow", "shadow", -100, 100)}{S("White", "white", -100, 100)}{S("Black", "black", -100, 100)}
        </Sec>
        <Sec c={ctx} id="clarity" title="Clarity & Structure" keys={["clarity", "structure"]}>
          {S("Clarity", "clarity", -100, 100)}{S("Structure", "structure", -100, 100)}
        </Sec>
        <Sec c={ctx} id="dehaze" title="Dehaze" keys={["dehaze"]}>{S("Amount", "dehaze", -100, 100)}</Sec>
        <Sec c={ctx} id="layers" title="Layers" keys={["layerOpacity"]}>
          <div className="rounded border border-border bg-background/40 px-2 py-1 text-xs">Sfondo · Livello di regolazione</div>
          {S("Opacità", "layerOpacity", 0, 100)}
        </Sec>
        <Sec c={ctx} id="vig" title="Vignetting" keys={["vigAmount", "vigMethod"]}>
          {S("Amount", "vigAmount", -4, 4, 0.01)}
          <Row label="Method">
            <select className="sel" value={a.vigMethod} onChange={(e) => set("vigMethod", e.target.value as Adjust["vigMethod"])}>
              <option value="elliptic">Elliptic on Crop</option><option value="circular">Circular</option>
            </select>
          </Row>
        </Sec>
        <Sec c={ctx} id="styles" title="Styles and Presets">
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => setAdjust((x) => ({ ...x, ...p.set }))} className="rounded border border-border bg-secondary px-2 py-1.5 text-xs hover:bg-accent">{p.name}</button>
            ))}
          </div>
        </Sec>
        <Sec c={ctx} id="crop" title="Crop" keys={["straighten", "rotation", "flipH"]}>
          <Row label="Rapporto">
            <select className="sel" defaultValue="" onChange={(e) => props.onAspect(e.target.value ? +e.target.value : null)}>
              <option value="">Libero (Seleziona)</option><option value="1">1:1</option><option value={3 / 2}>3:2</option><option value={4 / 3}>4:3</option>
              <option value={16 / 9}>16:9</option><option value={5 / 4}>5:4</option><option value={2 / 3}>2:3</option><option value={4 / 5}>4:5</option>
            </select>
          </Row>
          {S("Rotazione", "straighten", -45, 45, 0.1)}
          <div className="flex gap-1.5 pt-1">
            <MiniB title="Ruota a sinistra" onClick={() => set("rotation", a.rotation - 90)}><RotateCcw className="h-4 w-4" /></MiniB>
            <MiniB title="Ruota a destra" onClick={() => set("rotation", a.rotation + 90)}><RotateCw className="h-4 w-4" /></MiniB>
            <MiniB title="Specchia" onClick={() => set("flipH", !a.flipH)}><FlipHorizontal className="h-4 w-4" /></MiniB>
            <MiniB title="Applica ritaglio" onClick={props.onApplyCrop}><CropIcon className="h-4 w-4" /> Ritaglia</MiniB>
            <MiniB title="Annulla ritaglio" onClick={props.onResetCrop}>✕</MiniB>
          </div>
          <p className="text-[11px] text-muted-foreground">Rapporto libero: usa "Seleziona" e trascina sull'immagine.</p>
        </Sec>
        <Sec c={ctx} id="cb" title="Color Balance" keys={["cbShadows", "cbMid", "cbHigh"]}>
          {tone("Shadows", "cbShadows")}{tone("Midtones", "cbMid")}{tone("Highlights", "cbHigh")}
        </Sec>
        <Sec c={ctx} id="ce" title="Color Editor" keys={["hsl"]}>
          <div className="flex flex-wrap gap-1">
            {HSL_CH.map((c) => (
              <button key={c} title={CH_LABEL[c]} onClick={() => setCeCh(c)} className={`h-6 w-6 rounded-full border-2 ${ceCh === c ? "border-foreground" : "border-transparent"}`} style={{ background: CH_COLOR[c] }} />
            ))}
          </div>
          <div className="text-xs text-muted-foreground">{CH_LABEL[ceCh]}</div>
          {(["h", "s", "l"] as const).map((p) => (
            <Slider key={p} label={{ h: "Tonalità", s: "Saturazione", l: "Luminosità" }[p]} value={a.hsl[ceCh][p]} min={-100} max={100} def={0}
              onChange={(v) => setAdjust((x) => ({ ...x, hsl: { ...x.hsl, [ceCh]: { ...x.hsl[ceCh], [p]: v } } }))} />
          ))}
        </Sec>
        <Sec c={ctx} id="sharp" title="Sharpening" keys={["sharpAmount", "sharpRadius"]}>
          {S("Amount", "sharpAmount", 0, 100)}{S("Radius", "sharpRadius", 0.3, 5, 0.1)}
        </Sec>
        <Sec c={ctx} id="nr" title="Noise Reduction" keys={["nrLum", "nrColor"]}>
          {S("Luminance", "nrLum", 0, 100)}{S("Color", "nrColor", 0, 100)}
        </Sec>
      </div>
      <button onClick={props.onResetAll} className="m-2 rounded-md border border-border py-1.5 text-sm hover:bg-accent">Ripristina tutte le regolazioni</button>
    </aside>
  );
}

type Ctx = { show: (id: string) => boolean; open: Record<string, boolean>; toggle: (id: string) => void; reset: (...k: (keyof Adjust)[]) => void; resetAll: () => void };
function Sec({ c, id, title, keys, auto, children }: { c: Ctx; id: string; title: string; keys?: (keyof Adjust)[]; auto?: () => void; children: ReactNode }) {
  if (!c.show(id)) return null;
  return (
    <div className="border-b border-border/70">
      <div className="flex items-center gap-1 bg-secondary/60 px-2 py-1.5">
        <button className="flex flex-1 items-center gap-1 text-left text-[13px]" onClick={() => c.toggle(id)}>
          {c.open[id] ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          {title}
        </button>
        {auto && <HBtn title="Auto" onClick={auto}><Wand2 className="h-3.5 w-3.5" /></HBtn>}
        {keys && <HBtn title="Ripristina sezione" onClick={() => c.reset(...keys)}><RotateCcw className="h-3.5 w-3.5" /></HBtn>}
        <HBtn title="Ripristina tutto" onClick={c.resetAll}><MoreHorizontal className="h-3.5 w-3.5" /></HBtn>
      </div>
      {c.open[id] && <div className="space-y-1.5 px-3 py-2.5">{children}</div>}
    </div>
  );
}

function HBtn({ children, title, onClick }: { children: ReactNode; title: string; onClick: () => void }) {
  return <button title={title} onClick={onClick} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">{children}</button>;
}
function MiniB({ children, title, onClick }: { children: ReactNode; title: string; onClick: () => void }) {
  return <button title={title} onClick={onClick} className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1 text-xs hover:bg-accent">{children}</button>;
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[72px_1fr] items-center gap-2 text-xs"><span className="text-right text-muted-foreground">{label}</span>{children}</div>;
}

function Slider({ label, value, min, max, step = 1, def, track, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; def: number; track?: string; onChange: (v: number) => void;
}) {
  const dec = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  return (
    <div className="grid grid-cols-[72px_1fr_52px] items-center gap-2 text-xs">
      <span className="text-right text-muted-foreground" onDoubleClick={() => onChange(def)} title="Doppio clic per ripristinare">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onDoubleClick={() => onChange(def)}
        onChange={(e) => onChange(+e.target.value)}
        className="loma-range" style={track ? { ["--track" as any]: track } : undefined} />
      <input type="number" value={Number(value.toFixed(dec))} step={step} min={min} max={max}
        onChange={(e) => { const v = +e.target.value; if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v))); }}
        className="w-full rounded bg-background/60 px-1 py-0.5 text-right tabular-nums" />
    </div>
  );
}

function Histogram({ hist }: { hist: Uint32Array[] | null }) {
  if (!hist) return <div className="h-24 rounded bg-background/60" />;
  let max = 1;
  for (const ch of hist) for (let i = 2; i < 254; i++) max = Math.max(max, ch[i]);
  const path = (ch: Uint32Array) => {
    let p = "M0,100";
    for (let i = 0; i < 256; i++) p += ` L${i},${100 - Math.min(100, (ch[i] / max) * 100)}`;
    return p + " L255,100 Z";
  };
  return (
    <svg viewBox="0 0 256 100" preserveAspectRatio="none" className="h-24 w-full rounded bg-background/60" style={{ mixBlendMode: "normal" }}>
      <g style={{ mixBlendMode: "screen" }}>
        <path d={path(hist[0])} fill="hsl(0 80% 55% / 0.55)" />
        <path d={path(hist[1])} fill="hsl(120 70% 45% / 0.55)" />
        <path d={path(hist[2])} fill="hsl(220 85% 58% / 0.55)" />
      </g>
    </svg>
  );
}

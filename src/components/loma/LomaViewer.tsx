import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Save, MousePointer2, Hand, ZoomIn, ZoomOut, Columns2, SlidersHorizontal, Camera, Eraser,
  MessageCircle, Circle, Sparkles, Clapperboard, Gem, Maximize2, HardDrive, Cloud, CloudSun, Mail,
  Phone, Radio, Send, Info, MapPin, FileText, ChevronDown, FolderOpen, Images, RotateCw, RotateCcw,
  FlipHorizontal, Crop, X, Settings, GalleryHorizontal,
} from "lucide-react";
import logo from "@/assets/loma-logo.png.asset.json";
import {
  type Adjust, defaultAdjust, renderClean, download, baseName, formatBytes, exposure,
  nativeScreenSize,
} from "./viewer-utils";

import * as B from "./brand-icons";
import { DevelopPanel } from "./DevelopPanel";
import { Filmstrip } from "./Filmstrip";
import { type CullItem, type CullFilter, IMAGE_RE, readCull, applyFilter } from "./culling";
import { developCanvas, autoMeasure } from "./develop";

type Meta = Record<string, any>;
type Loaded = { file: File; url: string; w: number; h: number; meta: Meta };
type Mode = "select" | "move";

const RAWLIKE = /\.(tiff?|cr2|cr3|nef|arw|dng|orf|rw2|raf|pef|srw|heic|heif)$/i;
const ACCEPT = "image/*,.tif,.tiff,.cr2,.cr3,.nef,.arw,.dng,.orf,.rw2,.raf,.pef,.srw,.heic,.heif";

export function LomaViewer() {
  const [img, setImg] = useState<Loaded | null>(null);
  const [scale, setScale] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>("move");
  const [adjust, setAdjust] = useState<Adjust>(defaultAdjust);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [imgReady, setImgReady] = useState(0);
  const [topazOpen, setTopazOpen] = useState(false);
  const [hist, setHist] = useState<Uint32Array[] | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const imgEl = useRef<HTMLImageElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<any>(null);
  const state = useRef({ scale, off });
  state.current = { scale, off };

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };

  // Live development preview (downscaled for speed)
  useEffect(() => {
    if (!img) { setHist(null); return; }
    let cancel = false;
    const id = requestAnimationFrame(() => {
      const src = imgEl.current, cv = preview.current;
      if (cancel || !src || !cv || !src.complete || !src.naturalWidth) return;
      const k = Math.min(1, 1600 / Math.max(img.w, img.h));
      const w = Math.max(1, Math.round(img.w * k)), h = Math.max(1, Math.round(img.h * k));
      const { canvas, hist: hh } = developCanvas(src, w, h, adjust, k, true);
      cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(canvas, 0, 0);
      setHist(hh);
    });
    return () => { cancel = true; cancelAnimationFrame(id); };
  }, [img, adjust, imgReady]);

  const autoWb = () => {
    if (!need()) return;
    const r = autoMeasure(imgEl.current!, img!.w, img!.h);
    setAdjust((a) => ({ ...a, wbMode: "auto", kelvin: r.kelvin, tint: r.tint }));
  };
  const autoExposure = () => {
    if (!need()) return;
    const r = autoMeasure(imgEl.current!, img!.w, img!.h);
    setAdjust((a) => ({ ...a, exposure: r.exposure }));
  };
  const aspectSel = (ratio: number | null) => {
    if (!img || !ratio) { setSel(null); return; }
    let w = img.w, h = w / ratio;
    if (h > img.h) { h = img.h; w = h * ratio; }
    setSel({ x: (img.w - w) / 2, y: (img.h - h) / 2, w, h });
  };

  const fit = useCallback((w?: number, h?: number) => {
    const el = stage.current;
    const iw = w ?? img?.w, ih = h ?? img?.h;
    if (!el || !iw || !ih) return;
    const r = el.getBoundingClientRect();
    const s = Math.min((r.width - 40) / iw, (r.height - 40) / ih, 1e3);
    setScale(s);
    fitScale.current = s;
    setOff({ x: (r.width - iw * s) / 2, y: (r.height - ih * s) / 2 });
  }, [img]);

  const setZoom = useCallback((next: number, ax?: number, ay?: number) => {
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ax ?? r.width / 2, py = ay ?? r.height / 2;
    const { scale: z, off: o } = state.current;
    const n = Math.min(Math.max(next, 0.02), 40);
    const k = n / z;
    setScale(n);
    setOff({ x: px - (px - o.x) * k, y: py - (py - o.y) * k });
  }, []);

  const openFile = async (file: File) => {
    let url = URL.createObjectURL(file);
    const exifr = (await import("exifr")).default;
    let meta: Meta = {};
    try {
      meta = (await exifr.parse(file, { tiff: true, exif: true, gps: true, icc: true, iptc: true, xmp: true })) ?? {};
    } catch { /* no metadata */ }
    if (RAWLIKE.test(file.name)) {
      try {
        const th = await exifr.thumbnail(file);
        if (th) url = URL.createObjectURL(new Blob([th as BlobPart], { type: "image/jpeg" }));
      } catch { /* keep original */ }
    }
    const probe = new Image();
    probe.onload = () => {
      setImg({ file, url, w: probe.naturalWidth, h: probe.naturalHeight, meta });
      setAdjust(defaultAdjust);
      setCrop(null);
      setSel(null);
      requestAnimationFrame(() => fit(probe.naturalWidth, probe.naturalHeight));
    };
    probe.onerror = () => notify("Formato non visualizzabile da questo browser (metadati letti).");
    probe.src = url;
  };

  // ---------- Culling session ----------
  const [session, setSession] = useState<CullItem[]>([]);
  const [curId, setCurId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CullFilter>({ kind: "all", minStars: 0 });
  const [stripOpen, setStripOpen] = useState(true);
  const multiInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const fitScale = useRef(1);
  const visible = applyFilter(session, filter);

  const selectItem = (id: string) => {
    const it = session.find((s) => s.id === id);
    if (!it) return;
    setCurId(id);
    openFile(it.file);
  };
  const step = (d: number) => {
    if (!visible.length) return;
    const i = visible.findIndex((v) => v.id === curId);
    const n = visible[Math.min(visible.length - 1, Math.max(0, (i < 0 ? 0 : i) + d))];
    if (n && n.id !== curId) selectItem(n.id);
  };
  const updateCur = (p: Partial<CullItem>) =>
    curId && setSession((s) => s.map((x) => (x.id === curId ? { ...x, ...p } : x)));

  const importFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => IMAGE_RE.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!files.length) { notify("Nessuna foto trovata."); return; }
    session.forEach((s) => s.thumb && URL.revokeObjectURL(s.thumb));
    const base: CullItem[] = files.map((file, i) => ({ id: `${i}-${file.name}`, file, thumb: null, rating: 0, locked: false, flagged: false }));
    setSession(base);
    setStripOpen(true);
    setCurId(base[0]!.id);
    openFile(base[0]!.file);
    notify(`Importate ${files.length} foto.`);
    // read previews + in-camera tags in small parallel batches
    for (let i = 0; i < base.length; i += 6) {
      const chunk = base.slice(i, i + 6);
      const res = await Promise.all(chunk.map((c) => readCull(c.file)));
      setSession((s) => s.map((x) => { const k = chunk.findIndex((c) => c.id === x.id); return k < 0 ? x : { ...x, ...res[k] }; }));
    }
  };

  const sendBatch = async () => {
    const files = visible.map((v) => v.file);
    if (!files.length) { notify("Nessuna foto filtrata da inviare."); return; }
    const desk = (window as any).lomaDesktop;
    if (desk?.launchApp) {
      const app = localStorage.getItem("loma.topaz.Adobe Lightroom") || localStorage.getItem("loma.topaz.Adobe Lightroom Classic");
      if (app) { desk.launchApp(app, files.map((f) => desk.getPathForFile?.(f) ?? (f as any).path)); notify(`${files.length} foto inviate a Lightroom.`); return; }
    }
    if (navigator.canShare?.({ files })) {
      try { await navigator.share({ files, title: "Invia a Lightroom" }); return; } catch { /* cancelled */ return; }
    }
    files.forEach((f, i) => setTimeout(() => download(f, f.name), i * 250));
    notify(`${files.length} foto scaricate: importale in Lightroom.`);
  };

  // keyboard culling
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    const t = e.target as HTMLElement;
    if (t?.closest?.("input,textarea,select,[contenteditable]")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === " ") { if (!img) return; e.preventDefault(); scale > fitScale.current * 1.02 ? fit() : setZoom(1); }
    else if (!curId || e.ctrlKey || e.metaKey) return;
    else if (/^[0-5]$/.test(e.key)) updateCur({ rating: Number(e.key) });
    else if (e.key.toLowerCase() === "l") updateCur({ locked: !session.find((s) => s.id === curId)?.locked });
    else if (e.key.toLowerCase() === "f") updateCur({ flagged: !session.find((s) => s.id === curId)?.flagged });
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // wheel zoom (non-passive)
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e) => {
    if (!img) return;
    const r = stage.current!.getBoundingClientRect();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    setZoom(state.current.scale * Math.exp(-dy * 0.0018), e.clientX - r.left, e.clientY - r.top);
  };
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const h = (e: WheelEvent) => { e.preventDefault(); wheelRef.current(e); };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  useEffect(() => {
    const onResize = () => img && fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [img, fit]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toImage = (p: { x: number; y: number }) => ({
    x: (p.x - state.current.off.x) / state.current.scale,
    y: (p.y - state.current.off.y) / state.current.scale,
  });

  const onDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    const pts: { x: number; y: number }[] = [...pointers.current.values()] as any;
    if (pts.length === 2) {
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      gesture.current = { type: "pinch", d, scale: state.current.scale };
    } else if (mode === "select" && pts.length === 1) {
      const p = toImage(local(e));
      gesture.current = { type: "sel", start: p };
      setSel({ x: p.x, y: p.y, w: 0, h: 0 });
    } else {
      gesture.current = { type: "pan", start: local(e), off: state.current.off };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    if (!g) return;
    const pts: { x: number; y: number }[] = [...pointers.current.values()] as any;
    if (g.type === "pinch" && pts.length >= 2) {
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      setZoom(g.scale * (d / g.d), (pts[0]!.x + pts[1]!.x) / 2, (pts[0]!.y + pts[1]!.y) / 2);
    } else if (g.type === "pan") {
      const p = local(e);
      setOff({ x: g.off.x + p.x - g.start.x, y: g.off.y + p.y - g.start.y });
    } else if (g.type === "sel" && img) {
      const p = toImage(local(e));
      const x = Math.max(0, Math.min(g.start.x, p.x)), y = Math.max(0, Math.min(g.start.y, p.y));
      setSel({ x, y, w: Math.min(img.w, Math.max(g.start.x, p.x)) - x, h: Math.min(img.h, Math.max(g.start.y, p.y)) - y });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  const need = () => {
    if (!img || !imgEl.current) { notify("Apri prima un'immagine."); return false; }
    return true;
  };

  const exportClean = async (type: "image/png" | "image/jpeg", suffix: string) => {
    if (!need()) return;
    const b = await renderClean(imgEl.current!, adjust, crop, type);
    download(b, `${baseName(img!.file.name)}${suffix}.${type === "image/png" ? "png" : "jpg"}`);
    return b;
  };

  const save = async () => {
    await exportClean("image/png", "_loma");
    notify("Immagine salvata.");
  };
  const deepClean = async () => {
    const isJpg = img && /jpe?g/i.test(img.file.type);
    if (await exportClean(isJpg ? "image/jpeg" : "image/png", "_clean"))
      notify("Deep Clean: EXIF, IPTC, XMP, C2PA e parametri AI rimossi (pixel riscritti).");
  };

  const screenshot = async () => {
    const n = nativeScreenSize();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: n.w }, height: { ideal: n.h } } as MediaTrackConstraints,
        audio: false,
        // @ts-expect-error chromium hints
        preferCurrentTab: true,
      });
      const v = document.createElement("video");
      v.srcObject = stream;
      v.muted = true;
      await v.play();
      await new Promise((r) => setTimeout(r, 300));
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      c.toBlob((b) => b && download(b, `LoMa_screenshot_${c.width}x${c.height}.png`), "image/png");
      notify(`Screenshot ${c.width}×${c.height} (display nativo ${n.w}×${n.h}, DPR ${n.dpr}).`);
    } catch {
      if (!need()) return;
      // Fallback: render the current view (no UI) at native display resolution
      const c = document.createElement("canvas");
      c.width = n.w;
      c.height = n.h;
      const ctx = c.getContext("2d")!;
      const r = stage.current!.getBoundingClientRect();
      const k = n.w / r.width;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, c.width, c.height);
      const dev = developCanvas(imgEl.current!, img!.w, img!.h, adjust, 1).canvas;
      ctx.drawImage(dev, off.x * k, off.y * k, img!.w * scale * k, img!.h * scale * k);
      c.toBlob((b) => b && download(b, `LoMa_view_${n.w}x${n.h}.png`), "image/png");
      notify(`Vista catturata a ${n.w}×${n.h} senza interfaccia.`);
    }
  };

  const copyToClipboard = async () => {
    if (!img || !imgEl.current) return false;
    try {
      const b = await renderClean(imgEl.current, adjust, crop, "image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
      return true;
    } catch { return false; }
  };
  const openAI = async (name: string, url: string) => {
    const mobile = isTouchDevice();
    if (img && imgEl.current && (mobile || typeof navigator.canShare === "function")) {
      const b = await renderClean(imgEl.current, adjust, crop, "image/jpeg");
      const f = new File([b], `${baseName(img.file.name)}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [f] })) {
        try {
          await navigator.share({ files: [f], title: "Invia a " + name, text: "Analizza questa immagine" });
        } catch (e: any) {
          if (e?.name !== "AbortError") notify(`Condivisione non riuscita: riprova toccando ${name}.`);
        }
        return;
      }
      if (mobile) { notify("Questo dispositivo non supporta la condivisione di file."); return; }
    }
    if (!img && isTouchDevice()) { notify(`Apri prima un'immagine da inviare a ${name}.`); return; }
    // Desktop without native file sharing: web link + clipboard
    const ok = await copyToClipboard();
    window.open(url, "_blank", "noopener");
    notify(ok ? `Immagine copiata: incollala in ${name}.` : `${name} aperto.`);
  };

  const share = async (target: string, fallback?: string) => {
    if (img && imgEl.current) {
      const b = await renderClean(imgEl.current, adjust, crop, "image/png");
      const f = new File([b], `${baseName(img.file.name)}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [f] })) {
        try { await navigator.share({ files: [f], title: "LoMa VIEWER" }); return; } catch { return; }
      }
      if (fallback) {
        download(b, f.name);
        window.open(fallback, "_blank", "noopener");
        notify(`File scaricato: caricalo su ${target}.`);
        return;
      }
    } else if (fallback) {
      window.open(fallback, "_blank", "noopener");
      return;
    }
    notify(`${target} richiede la condivisione di sistema (disponibile su tablet e Mac/Safari).`);
  };

  // Cloud = save the shown (edited, metadata-free) photo INTO the user's cloud space.
  const uploadCloud = async (target: string, web: string) => {
    if (!img || !imgEl.current) { notify(`Carica prima un'immagine da salvare su ${target}.`); return; }
    notify(`Preparazione caricamento su ${target}...`);
    const b = await renderClean(imgEl.current, adjust, crop, "image/png");
    const name = `${baseName(img.file.name)}.png`;
    const picker = (window as any).showSaveFilePicker;
    if (picker) {
      // Desktop with the cloud sync app installed: the user picks the cloud folder, the file is written there.
      try {
        const h = await picker({ suggestedName: name, startIn: "documents", types: [{ description: "PNG", accept: { "image/png": [".png"] } }] });
        notify(`Caricamento su ${target} in corso...`);
        const w = await h.createWritable(); await w.write(b); await w.close();
        notify(`Salvato su ${target}: ${h.name}`);
        return;
      } catch (e: any) { if (e?.name === "AbortError") { notify("Caricamento annullato."); return; } }
    }
    const f = new File([b], name, { type: "image/png" });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: name }); notify(`Inviato a ${target}.`); return; } catch { notify("Caricamento annullato."); return; }
    }
    download(b, name);
    window.open(web, "_blank", "noopener");
    notify(`Accedi a ${target}, scegli la cartella e trascina ${name} per salvarla.`);
  };

  const topaz = async (app: string) => {
    if (!need()) return;
    if (isTouchDevice()) {
      // Tablet/mobile: hand the file to the OS share sheet ("Apri in Lightroom", ...).
      const b = await renderClean(imgEl.current!, adjust, crop, "image/png");
      const f = new File([b], `${baseName(img!.file.name)}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [f] })) {
        try { await navigator.share({ files: [f], title: f.name }); } catch { /* annullato */ }
        return;
      }
    }
    let path = localStorage.getItem(`loma.topaz.${app}`) || "";
    const desk = (window as any).lomaDesktop;
    if (desk?.launchWithData) {
      // Desktop (Electron): pass the edited, metadata-free export straight to the program.
      if (!path && desk.pickApp) {
        path = (await desk.pickApp(app)) || "";
        if (path) localStorage.setItem(`loma.topaz.${app}`, path);
      }
      if (!path) { notify(`Seleziona il programma ${app} per aprire la foto.`); return; }
      const b = await renderClean(imgEl.current!, adjust, crop, "image/png");
      let r = await desk.launchWithData(path, `${baseName(img!.file.name)}_for_${app.replace(/\s/g, "")}.png`, b);
      if (!r?.ok && r?.error === "not-found" && desk.pickApp) {
        notify(`${app} non trovato: seleziona di nuovo il programma.`);
        const np = await desk.pickApp(app);
        if (!np) return;
        localStorage.setItem(`loma.topaz.${app}`, np);
        r = await desk.launchWithData(np, `${baseName(img!.file.name)}_for_${app.replace(/\s/g, "")}.png`, b);
      }
      notify(r?.ok ? `Foto aperta in ${app}.` : `Impossibile avviare ${app}.`);
      return;
    }
    await exportClean("image/png", `_for_${app.replace(/\s/g, "")}`);
    notify(path ? `Esportato. Aprilo con ${app} (${path}).` : `Esportato per ${app}. Imposta il percorso in "Percorsi".`);
  };

  const applyCrop = () => {
    if (!sel || sel.w < 4 || sel.h < 4) return notify("Disegna una selezione con lo strumento Seleziona.");
    const base = crop ?? { x: 0, y: 0 };
    setCrop({ x: base.x + sel.x, y: base.y + sel.y, w: sel.w, h: sel.h });
    setSel(null);
    notify("Ritaglio applicato all'esportazione.");
  };

  const m: any = img?.meta ?? {};
  const lat = m.latitude as number | undefined, lon = m.longitude as number | undefined;
  const transform = `translate(${off.x}px, ${off.y}px) scale(${scale})`;
  const imgStyle = (filtered: boolean): React.CSSProperties => ({
    width: img?.w, height: img?.h, transformOrigin: "0 0", transform,
    imageRendering: scale >= 2 ? "pixelated" : "auto",
  });
  const rotStyle: React.CSSProperties = {
    transform: `rotate(${adjust.rotation + adjust.straighten}deg) scaleX(${adjust.flipH ? -1 : 1})`,
    transformOrigin: "center", width: "100%", height: "100%",
  };

  return (
    <div className="flex h-dvh flex-col bg-toolbar text-foreground select-none">
      {/* Toolbar */}
      <header className="flex items-stretch gap-1 overflow-x-auto border-b border-border bg-toolbar px-3 py-2">
        <div className="mr-2 flex shrink-0 items-center gap-2">
          <img src={logo.url} alt="LoMa VIEWER" className="h-12 w-12 rounded-full" />
          <div className="leading-none">
            <div className="text-xl font-bold tracking-tight">LoMa</div>
            <div className="text-sm font-bold tracking-[0.2em] text-primary">VIEWER</div>
          </div>
        </div>
        <Group>
          <Tool icon={<HardDrive className="text-primary" />} label="Importa Scheda" onClick={() => folderInput.current?.click()} />
          <Tool icon={<Images />} label="Apri Multipli" onClick={() => multiInput.current?.click()} />
          <Tool icon={<GalleryHorizontal />} label="Filmstrip" active={stripOpen && session.length > 0} onClick={() => setStripOpen((o) => !o)} />
          <Tool icon={<Save className="text-primary" />} label="Salva" onClick={save} />
          <Tool icon={<MousePointer2 />} label="Seleziona" active={mode === "select"} onClick={() => setMode("select")} />
          <Tool icon={<Hand />} label="Sposta" active={mode === "move"} onClick={() => setMode("move")} />
          <Tool icon={<ZoomOut />} label="Zoom -" onClick={() => setZoom(scale / 1.25)} />
          <Tool icon={<ZoomIn />} label="Zoom +" onClick={() => setZoom(scale * 1.25)} />
          <Tool icon={<b>1:1</b>} label="1:1" onClick={() => setZoom(1)} />
          <Tool icon={<b>1:2</b>} label="1:2" onClick={() => setZoom(0.5)} />
          <Tool icon={<b>1:3</b>} label="1:3" onClick={() => setZoom(1 / 3)} />
          <Tool icon={<b>Fit</b>} label="Fit" onClick={() => fit()} />
          <Tool icon={<Columns2 />} label="Confronta" active={compare} onClick={() => setCompare((c) => !c)} />
          <Tool icon={<SlidersHorizontal className="text-primary" />} label="Strumenti" active={toolsOpen} onClick={() => setToolsOpen((o) => !o)} />
          <Tool icon={<Camera />} label="Screenshot" onClick={screenshot} />
          <Tool icon={<Eraser className="text-chart-3" />} label="Senza metadati" onClick={deepClean} />
        </Group>
        <Group>
          <Tool icon={<B.ChatGPTIcon />} label="ChatGPT" onClick={() => openAI("ChatGPT", "https://chatgpt.com/")} />
          <Tool icon={<B.MetaAIIcon />} label="Meta AI" onClick={() => openAI("Meta AI", "https://www.meta.ai/")} />
          <Tool icon={<B.GeminiIcon />} label="Gemini" onClick={() => openAI("Gemini", "https://gemini.google.com/")} />
          <Tool icon={<B.FlowIcon />} label="Flow" onClick={() => openAI("Flow", "https://labs.google/fx/tools/flow")} />
          <span className="mx-1 w-px shrink-0 self-stretch bg-border" />
          <Tool icon={<B.TopazPhotoIcon />} label="Topaz Photo AI" onClick={() => topaz("Topaz Photo AI")} />
          <Tool icon={<B.TopazGigapixelIcon />} label="Topaz Gigapixel AI" onClick={() => topaz("Topaz Gigapixel AI")} />
          <Tool icon={<B.PhotoshopIcon />} label="Photoshop" onClick={() => topaz("Adobe Photoshop")} />
          <Tool icon={<B.LightroomIcon />} label="Lightroom" onClick={() => topaz("Adobe Lightroom")} />
          <Tool icon={<B.LightroomClassicIcon />} label="Lightroom Classic" onClick={() => topaz("Adobe Lightroom Classic")} />
          <Tool icon={<Settings />} label="Percorsi" onClick={() => setTopazOpen(true)} />
          <span className="mx-1 w-px shrink-0 self-stretch bg-border" />
          <Tool icon={<B.DriveIcon />} label="Drive" onClick={() => uploadCloud("Google Drive", "https://drive.google.com/drive/my-drive")} />
          <Tool icon={<B.OneDriveIcon />} label="OneDrive" onClick={() => uploadCloud("OneDrive", "https://onedrive.live.com/")} />
          <Tool icon={<B.ICloudIcon />} label="iCloud" onClick={() => uploadCloud("iCloud Drive", "https://www.icloud.com/iclouddrive/")} />
          <Tool icon={<B.MailIcon />} label="Mail" onClick={() => share("Mail", "mailto:?subject=Immagine%20da%20LoMa%20VIEWER")} />
          <Tool icon={<B.WhatsAppIcon />} label="WhatsApp" onClick={() => share("WhatsApp", "whatsapp://")} />
          <Tool icon={<B.AirDropIcon />} label="AirDrop" onClick={() => share("AirDrop")} />
          <Tool icon={<B.LocalSendIcon />} label="LocalSend" onClick={() => share("LocalSend")} />
        </Group>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {toolsOpen && (
          <DevelopPanel
            adjust={adjust} setAdjust={setAdjust} hist={hist} hasImage={!!img}
            onAutoWb={autoWb} onAutoExposure={autoExposure}
            onAspect={aspectSel} onApplyCrop={applyCrop} onResetCrop={() => { setCrop(null); setSel(null); }}
            onResetAll={() => { setAdjust(defaultAdjust); setCrop(null); setSel(null); }}
            onClose={() => setToolsOpen(false)}
          />
        )}
        {/* Canvas */}
        <main
          ref={stage}
          className={`relative min-w-0 flex-1 touch-none overflow-hidden rounded-lg border bg-canvas ${drag ? "border-primary" : "border-border"} ${img ? (mode === "move" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair") : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onTouchStart={(e) => { const t = e.touches[0]!; swipe.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }}
          onTouchEnd={(e) => {
            const s = swipe.current; swipe.current = null;
            if (!s || session.length < 2 || scale > fitScale.current * 1.02) return;
            const t = e.changedTouches[0]!, dx = t.clientX - s.x, dy = t.clientY - s.y;
            if (Math.abs(dx) > 80 && Math.abs(dy) < 60) step(dx < 0 ? 1 : -1);
          }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const fs = e.dataTransfer.files;
            if (fs.length > 1) importFiles(fs);
            else if (fs[0]) openFile(fs[0]);
          }}
        >
          {!img ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Images className="h-40 w-40 text-muted-foreground/60" strokeWidth={1.2} />
              <h2 className="mt-4 text-2xl font-medium">Nessuna immagine caricata</h2>
              <p className="mt-2 max-w-xs text-muted-foreground">
                Apri un'immagine o trascinala qui per visualizzarla in LoMa Viewer
              </p>
              <button
                onClick={() => fileInput.current?.click()}
                className="mt-6 inline-flex items-center gap-3 rounded-lg bg-primary px-7 py-3 text-lg font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
              >
                <FolderOpen className="h-5 w-5" /> Apri immagine...
              </button>
              <div className="mt-3 flex gap-2">
                <button onClick={() => folderInput.current?.click()} className="rounded-lg bg-secondary px-4 py-2 text-sm hover:bg-accent">Importa Scheda / Cartella</button>
                <button onClick={() => multiInput.current?.click()} className="rounded-lg bg-secondary px-4 py-2 text-sm hover:bg-accent">Apri Multipli</button>
              </div>
            </div>
          ) : (
            <>
              <div className="absolute inset-0" style={{ clipPath: compare ? `inset(0 ${100 - split}% 0 0)` : undefined }}>
                <img src={img.url} alt="" draggable={false} className="absolute left-0 top-0 max-w-none" style={imgStyle(false)} />
              </div>
              <div className="absolute inset-0" style={{ clipPath: compare ? `inset(0 0 0 ${split}%)` : undefined }}>
                <div className="absolute left-0 top-0" style={{ width: img.w, height: img.h, transformOrigin: "0 0", transform }}>
                  <div style={rotStyle}>
                    <img ref={imgEl} src={img.url} alt={img.file.name} draggable={false} onLoad={() => setImgReady((n) => n + 1)} className="hidden" />
                    <canvas ref={preview} aria-label={img.file.name} style={{ width: img.w, height: img.h, imageRendering: scale >= 2 ? "pixelated" : "auto" }} />
                  </div>
                </div>
              </div>
              {compare && (
                <div className="absolute inset-y-0 z-10 w-0.5 bg-primary" style={{ left: `${split}%` }}>
                  <span className="absolute left-2 top-2 whitespace-nowrap rounded bg-popover/80 px-2 py-0.5 text-xs">Modificata</span>
                  <span className="absolute right-2 top-2 whitespace-nowrap rounded bg-popover/80 px-2 py-0.5 text-xs">Originale</span>
                </div>
              )}
              {compare && (
                <input
                  type="range" min={0} max={100} value={split}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setSplit(+e.target.value)}
                  className="absolute bottom-12 left-1/2 z-20 w-1/2 -translate-x-1/2 accent-primary"
                />
              )}
              {sel && (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                  style={{ left: off.x + sel.x * scale, top: off.y + sel.y * scale, width: sel.w * scale, height: sel.h * scale }}
                />
              )}
              <div className="absolute bottom-3 left-3 rounded bg-popover/80 px-2 py-1 text-xs text-muted-foreground">
                {Math.round(scale * 100)}% · {img.w}×{img.h}{crop ? ` · ritaglio ${Math.round(crop.w)}×${Math.round(crop.h)}` : ""}
              </div>
              <button
                onClick={() => fileInput.current?.click()}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              >
                <FolderOpen className="h-4 w-4" /> Apri...
              </button>
            </>
          )}
          {toast && (
            <div className="absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-md bg-popover px-4 py-2 text-sm shadow-xl">{toast}</div>
          )}
        </main>

        {/* Side panel */}
        <aside className="hidden w-80 shrink-0 overflow-y-auto rounded-lg border border-border bg-card md:block">
          <Section icon={<Info className="h-5 w-5" />} title="Informazioni immagine" chevron>
            <div className="flex gap-3">
              <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {img ? <img src={img.url} alt="" className="h-full w-full object-cover" /> : <Images className="h-8 w-8 text-muted-foreground" />}
              </div>
              <div className="min-w-0 text-sm">
                <div className="truncate font-medium">{img?.file.name ?? "Nessuna immagine"}</div>
                <div className="text-muted-foreground">{img ? `${img.w} × ${img.h}` : "-"}</div>
                <div className="text-muted-foreground">{img ? formatBytes(img.file.size) : "-"}</div>
                <div className="text-muted-foreground">{img ? (m.Model ?? "Nessun dato EXIF") : "-"}</div>
              </div>
            </div>
          </Section>
          <Section icon={<Camera className="h-5 w-5" />} title="Dati di scatto (EXIF)">
            <Rows rows={[
              ["Fotocamera", [m.Make, m.Model].filter(Boolean).join(" ")],
              ["Obiettivo", m.LensModel ?? m.Lens],
              ["Lunghezza focale", m.FocalLength && `${m.FocalLength} mm`],
              ["Tempo di esposizione", exposure(m.ExposureTime)],
              ["Diaframma", m.FNumber && `f/${m.FNumber}`],
              ["ISO", m.ISO ?? m.ISOSpeedRatings],
              ["Compensazione exp.", m.ExposureCompensation != null && `${m.ExposureCompensation} EV`],
              ["Modalità di scatto", m.ExposureProgram],
              ["Modalità misurazione", m.MeteringMode],
              ["Bilanciamento bianco", m.WhiteBalance],
              ["Flash", m.Flash],
            ]} />
          </Section>
          <Section icon={<MapPin className="h-5 w-5" />} title="Posizione (GPS)">
            <Rows rows={[
              ["Latitudine", lat?.toFixed(6)],
              ["Longitudine", lon?.toFixed(6)],
              ["Località", m.City ?? m.Location ?? m.Sublocation],
            ]} />
            <div className="mt-2 overflow-hidden rounded-md bg-muted">
              {lat != null && lon != null ? (
                <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`} target="_blank" rel="noreferrer">
                  <iframe
                    title="Mappa"
                    className="pointer-events-none h-36 w-full"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01},${lat - 0.006},${lon + 0.01},${lat + 0.006}&marker=${lat},${lon}`}
                  />
                </a>
              ) : (
                <div className="flex h-20 flex-col items-center justify-center text-sm text-muted-foreground">
                  <MapPin className="h-5 w-5 text-primary" /> Nessuna posizione disponibile
                </div>
              )}
            </div>
          </Section>
          <Section icon={<FileText className="h-5 w-5" />} title="Dettagli file">
            <Rows rows={[
              ["Nome file", img?.file.name],
              ["Formato", img && (img.file.type || img.file.name.split(".").pop()?.toUpperCase())],
              ["Dimensione", img && formatBytes(img.file.size)],
              ["Risoluzione", img && `${img.w} × ${img.h}`],
              ["Spazio colore", m.ColorSpace ?? m.ColorSpaceData],
              ["Profilo colore", m.ProfileDescription ?? m.ICCProfileName],
              ["Data e ora", (m.DateTimeOriginal ?? m.CreateDate ?? (img && new Date(img.file.lastModified)))?.toLocaleString?.("it-IT")],
            ]} />
          </Section>
        </aside>
      </div>

      {session.length > 0 && stripOpen && (
        <Filmstrip
          items={visible} total={session.length} current={curId} filter={filter} setFilter={setFilter}
          onSelect={selectItem} onSendBatch={sendBatch}
        />
      )}

      <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ""; }} />
      <input ref={multiInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }} />
      <input
        ref={(el) => { folderInput.current = el; el?.setAttribute("webkitdirectory", ""); el?.setAttribute("directory", ""); }}
        type="file" multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }}
      />
      {topazOpen && <TopazSettings onClose={() => setTopazOpen(false)} />}
    </div>
  );
}

function Group({ children, last }: { children: ReactNode; last?: boolean }) {
  return <div className={`flex shrink-0 items-stretch gap-0.5 pr-2 ${last ? "" : "mr-1 border-r border-border"}`}>{children}</div>;
}

function Tool({ icon, label, onClick, active }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex w-[60px] shrink-0 flex-col items-center justify-start gap-1 rounded-md px-1 py-1 text-[10px] leading-tight hover:bg-accent ${active ? "bg-accent text-primary" : ""}`}
    >
      <span className="flex h-8 items-center justify-center text-lg [&_svg]:h-7 [&_svg]:w-7">{icon}</span>
      <span className="text-center">{label}</span>
    </button>
  );
}

function Mini({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent">
      {children}
    </button>
  );
}

function Section({ icon, title, children, chevron }: { icon: ReactNode; title: string; children: ReactNode; chevron?: boolean }) {
  return (
    <section className="border-b border-border px-4 py-3 last:border-0">
      <h3 className="mb-2 flex items-center gap-2 font-semibold">
        {icon} {title} {chevron && <ChevronDown className="ml-auto h-4 w-4" />}
      </h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, unknown][] }) {
  return (
    <dl className="grid grid-cols-[1fr_1fr] gap-y-0.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt>{k}</dt>
          <dd className="truncate text-muted-foreground" title={v ? String(v) : ""}>{v ? String(v) : "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) ||
    window.matchMedia?.("(pointer: coarse)").matches;
}

function TopazSettings({ onClose }: { onClose: () => void }) {
  const apps = ["Topaz Photo AI", "Topaz Gigapixel AI", "Adobe Photoshop", "Adobe Lightroom", "Adobe Lightroom Classic"];
  const [vals, setVals] = useState(() => Object.fromEntries(apps.map((a) => [a, localStorage.getItem(`loma.topaz.${a}`) ?? ""])));
  const [mobile] = useState(isTouchDevice);
  const browse = async (a: string) => {
    const desk = (window as any).lomaDesktop;
    if (desk?.pickApp) { const p = await desk.pickApp(a); if (p) setVals((v) => ({ ...v, [a]: p })); return; }
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".exe,.app,.lnk,application/x-msdownload";
    inp.onchange = () => {
      const f: any = inp.files?.[0];
      if (!f) return;
      const full = (window as any).lomaDesktop?.getPathForFile?.(f) || f.path || f.name;
      setVals((v) => ({ ...v, [a]: full }));
    };
    inp.click();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70" onClick={onClose}>
      <div className="w-[520px] max-w-[92vw] rounded-lg border border-border bg-popover p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold">Percorsi programmi esterni</h3>
        {mobile ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Su tablet e smartphone (Android/iOS) i percorsi non servono: toccando l'icona di un programma si apre il menu di condivisione del sistema ("Apri in...") e scegli direttamente l'app installata, ad esempio Lightroom o Photoshop Express.
            </p>
            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Ho capito</button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Windows / Mac: seleziona il file del programma (.exe o .app) con "Sfoglia...". Il percorso viene ricordato per le sessioni successive. Nel browser viene letto solo il nome del file; il percorso completo e disponibile nella versione desktop.
            </p>
            {apps.map((a) => (
              <label key={a} className="mb-3 block text-sm">
                {a}
                <div className="mt-1 flex gap-2">
                  <input
                    value={vals[a]}
                    placeholder={a.startsWith("Adobe") ? `C:\\Program Files\\Adobe\\${a}\\ oppure /Applications/${a}.app` : a.includes("Giga") ? "C:\\Program Files\\Topaz Labs LLC\\Topaz Gigapixel AI" : "/Applications/Topaz Photo AI.app"}
                    onChange={(e) => setVals((v) => ({ ...v, [a]: e.target.value }))}
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2"
                  />
                  <button type="button" onClick={() => browse(a)} className="shrink-0 rounded-md border border-border bg-secondary px-3 py-2 text-sm">Sfoglia...</button>
                </div>
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">Annulla</button>
              <button
                onClick={() => { apps.forEach((a) => localStorage.setItem(`loma.topaz.${a}`, vals[a] ?? "")); onClose(); }}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Salva
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

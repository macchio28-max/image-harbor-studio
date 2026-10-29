import { androidShare } from "./android-share";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Save, MousePointer2, Hand, ZoomIn, ZoomOut, Columns2, SlidersHorizontal, Camera, Eraser,
  MessageCircle, Circle, Sparkles, Clapperboard, Gem, Maximize2, HardDrive, Cloud, CloudSun, Mail,
  Phone, Radio, Send, Info, MapPin, FileText, ChevronDown, FolderOpen, Images, RotateCw, RotateCcw,
  FlipHorizontal, Crop, X, Settings, GalleryHorizontal, Trash2, Minimize2, Copy, Repeat, LayoutGrid, Square, Printer, Share2,
} from "lucide-react";
import { ChevronLeft, ChevronRight, Undo2, Redo2, MoreHorizontal } from "lucide-react";
import { type History, startHistory, commit, undo, redo } from "./edit-history";
import { toast as sonnerToast } from "sonner";
import { ConvertDialog } from "./ConvertDialog";
import { PrintDialog } from "./PrintDialog";
const logo = { url: "/icon-512.png" };
import {
  type Adjust, defaultAdjust, renderClean, download, baseName, formatBytes, exposure,
  nativeScreenSize,
} from "./viewer-utils";
import { isNeutral } from "./develop";

import * as B from "./brand-icons";
import { DevelopPanel } from "./DevelopPanel";
import { Filmstrip } from "./Filmstrip";
import { ComparePane } from "./ComparePane";
import { MailChoice, WEBMAIL_PRESETS, serviceOf, type MailAccount } from "./MailChoice";
import { ContactSheet } from "./ContactSheet";
import { ProvenancePanel } from "./ProvenancePanel";
import { type CullItem, type CullFilter, IMAGE_RE, readCull, readCullTags, applyFilter } from "./culling";
import { developCanvas, developCanvasAsync, autoMeasure } from "./develop";

type Meta = Record<string, any>;
const EMPTY_META = {};
type Loaded = { file: File; url: string; w: number; h: number; meta: Meta };
type Mode = "select" | "move";

const RAWLIKE = /\.(tiff?|cr2|cr3|nef|arw|dng|orf|rw2|raf|pef|srw|heic|heif)$/i;
const ACCEPT = "image/*,.tif,.tiff,.cr2,.cr3,.nef,.arw,.dng,.orf,.rw2,.raf,.pef,.srw,.heic,.heif";

export function LomaViewer() {
  const [img, setImg] = useState<Loaded | null>(null);
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(isTouchDevice()), []);
  const [scale, setScale] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<Mode>("move");
  const [adjust, setAdjust] = useState<Adjust>(defaultAdjust);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropping, setCropping] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const [phone, setPhone] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => setPhone(mq.matches); f();
    mq.addEventListener("change", f); return () => mq.removeEventListener("change", f);
  }, []);
  const cropDrag = useRef<{ h: string; x: number; y: number; s: { x: number; y: number; w: number; h: number } } | null>(null);
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [compare, setCompare] = useState(false);
  const [active, setActive] = useState<"A" | "B">("A");
  const [other, setOther] = useState<{ img: Loaded | null; adjust: Adjust; crop: typeof crop; scale: number; off: { x: number; y: number }; curId: string | null; snap: string | null } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [imgReady, setImgReady] = useState(0);
  const [topazOpen, setTopazOpen] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
  const [printSrc, setPrintSrc] = useState<string | null>(null);
  const [waAsk, setWaAsk] = useState(false);
  const [mailAsk, setMailAsk] = useState(false);
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

  // Quick feedback toasts (copy, close, cache) are a fast visual confirmation only:
  // they disappear after exactly 1 second so they never cover the photo.
  const QUICK_MS = 1000;

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };

  // Live development preview: while dragging, render a viewport-sized proxy once per frame;
  // after edits settle, consolidate at full resolution in background bands (superseded runs are dropped).
  const proxyRef = useRef<{ key: unknown; cv: HTMLCanvasElement; k: number } | null>(null);
  const devGen = useRef(0);
  useEffect(() => {
    if (!img) { setHist(null); return; }
    const gen = ++devGen.current;
    const stale = () => gen !== devGen.current;
    const id = requestAnimationFrame(() => {
      const src = imgEl.current, cv = preview.current;
      if (stale() || !src || !cv || !src.complete || !src.naturalWidth) return;
      if (!proxyRef.current || proxyRef.current.key !== img) {
        // Light interactive proxy (~1000px long side): renders in a few ms, so sliders never stutter.
        const target = 1000;
        const k = Math.min(1, target / Math.max(img.w, img.h));
        const p = document.createElement("canvas");
        p.width = Math.max(1, Math.round(img.w * k)); p.height = Math.max(1, Math.round(img.h * k));
        const pc = p.getContext("2d")!; pc.imageSmoothingQuality = "high"; pc.drawImage(src, 0, 0, p.width, p.height);
        proxyRef.current = { key: img, cv: p, k };
      }
      const { cv: p, k } = proxyRef.current;
      const { canvas } = developCanvas(p, p.width, p.height, adjust, k, false);
      if (cv.width !== p.width || cv.height !== p.height) { cv.width = p.width; cv.height = p.height; }
      cv.getContext("2d")!.drawImage(canvas, 0, 0);
    });
    // Histogram only once movement stops: no React re-render per mouse tick.
    const th = window.setTimeout(() => {
      const pr = proxyRef.current;
      if (stale() || !pr || pr.key !== img) return;
      setHist(developCanvas(pr.cv, pr.cv.width, pr.cv.height, adjust, pr.k, true).hist);
    }, 250);
    const big = Math.max(img.w, img.h) > 1000;
    const t = isNeutral(adjust) || !big ? 0 : window.setTimeout(async () => {
      const src = imgEl.current;
      if (stale() || !src || !src.naturalWidth) return;
      const full = await developCanvasAsync(src, img.w, img.h, adjust, stale);
      const cv = preview.current;
      if (!full || stale() || !cv) return;
      cv.width = img.w; cv.height = img.h;
      cv.getContext("2d")!.drawImage(full, 0, 0);
    }, 450);
    return () => { devGen.current++; cancelAnimationFrame(id); clearTimeout(th); if (t) clearTimeout(t); };
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
    setAspect(ratio);
    if (!img) return;
    setCropping(true); setMode("select");
    if (!ratio) { setSel((c) => c && c.w > 4 ? c : crop ? { ...crop } : { x: img.w * 0.1, y: img.h * 0.1, w: img.w * 0.8, h: img.h * 0.8 }); return; }
    // Fit the ratio inside the current box (or the photo), keeping its centre.
    setSel((c) => {
      const b = c && c.w > 4 ? c : crop ?? { x: 0, y: 0, w: img.w, h: img.h };
      let w = b.w, h = w / ratio;
      if (h > b.h) { h = b.h; w = h * ratio; }
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      return { x: Math.max(0, Math.min(img.w - w, cx - w / 2)), y: Math.max(0, Math.min(img.h - h, cy - h / 2)), w, h };
    });
  };
  /** Crop box edit: h = handle (n,s,e,w,ne,nw,se,sw) or "move". Works in image pixels. */
  const cropPointer = (hdl: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!sel) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    cropDrag.current = { h: hdl, x: e.clientX, y: e.clientY, s: { ...sel } };
  };
  const cropMove = (e: React.PointerEvent) => {
    const d = cropDrag.current; if (!d || !img) return;
    e.stopPropagation();
    const dx = (e.clientX - d.x) / scale, dy = (e.clientY - d.y) / scale, s0 = d.s, MIN = 24;
    if (d.h === "move") {
      setSel({ ...s0, x: Math.max(0, Math.min(img.w - s0.w, s0.x + dx)), y: Math.max(0, Math.min(img.h - s0.h, s0.y + dy)) });
      return;
    }
    let l = s0.x, t = s0.y, r = s0.x + s0.w, b = s0.y + s0.h;
    if (d.h.includes("w")) l = Math.min(r - MIN, Math.max(0, l + dx));
    if (d.h.includes("e")) r = Math.max(l + MIN, Math.min(img.w, r + dx));
    if (d.h.includes("n")) t = Math.min(b - MIN, Math.max(0, t + dy));
    if (d.h.includes("s")) b = Math.max(t + MIN, Math.min(img.h, b + dy));
    if (aspect) {
      let w = r - l, h = b - t;
      const horiz = d.h === "e" || d.h === "w" || (d.h.length === 2 && Math.abs(dx) >= Math.abs(dy));
      if (horiz) h = w / aspect; else w = h * aspect;
      // anchor the opposite side/corner, centre for single edges
      if (d.h === "n" || d.h === "s") { const cx = (s0.x + s0.x + s0.w) / 2; l = cx - w / 2; }
      else if (d.h.includes("w")) l = r - w;
      if (d.h === "e" || d.h === "w") { const cy = s0.y + s0.h / 2; t = cy - h / 2; }
      else if (d.h.includes("n")) t = b - h;
      if (l < 0 || t < 0 || l + w > img.w || t + h > img.h || w < MIN || h < MIN) return;
      r = l + w; b = t + h;
    }
    setSel({ x: l, y: t, w: r - l, h: b - t });
  };
  const cropUp = (e: React.PointerEvent) => { e.stopPropagation(); cropDrag.current = null; };

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

  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const h = () => { setIsFull(!!document.fullscreenElement); setTimeout(() => fit(), 120); };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, [fit]);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stage.current?.requestFullscreen?.().catch(() => document.documentElement.requestFullscreen?.());
  };

  const openFile = async (file: File) => {
    let url = URL.createObjectURL(file);
    const isRaw = RAWLIKE.test(file.name);
    let preview: Blob | null = null;
    // 1) Picture first: RAW shows its embedded JPEG immediately; metadata is read afterwards.
    const { decodeExtra } = await import("./decode-extra");
    const decoded = await decodeExtra(file);
    if (decoded) url = URL.createObjectURL(decoded);
    if (isRaw && !decoded) {
      const { extractRawPreview } = await import("./raw-preview");
      preview = await extractRawPreview(file, { deep: false });
      if (!preview) preview = await extractRawPreview(file, { deep: true });
      if (preview) url = URL.createObjectURL(preview);
      else try {
        const exifr0 = (await import("exifr")).default;
        const th = await exifr0.thumbnail(file);
        if (th) url = URL.createObjectURL(new Blob([th as BlobPart], { type: "image/jpeg" }));
      } catch { /* keep original */ }
    }
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => {
      setImg({ file, url, w: probe.naturalWidth, h: probe.naturalHeight, meta: {} as Meta });
      setAdjust(defaultAdjust);
      setCrop(null); setCropping(false);
      setSel(null);
      requestAnimationFrame(() => fit(probe.naturalWidth, probe.naturalHeight));
      void loadMeta();
    };
    probe.onerror = () => notify("Formato non visualizzabile da questo browser.");
    probe.src = url;
    // 2) Metadata in background, merged into the photo only if it is still the one on screen.
    const loadMeta = async () => {
      const exifr = (await import("exifr")).default;
      const opts = { tiff: true, exif: true, gps: true, icc: true, iptc: true, xmp: true, makerNote: false };
      const tryParse = async (src: Blob | ArrayBuffer) => {
        try {
          return ((await Promise.race([exifr.parse(src as any, opts), new Promise((r) => setTimeout(() => r(null), 5000))])) ?? {}) as Meta;
        } catch { return {} as Meta; }
      };
      let meta: Meta = await tryParse(isRaw ? file.slice(0, Math.min(file.size, 8 * 1024 * 1024)) : file);
      const merge = (extra: Meta) => { for (const [k, v] of Object.entries(extra)) if ((meta as any)[k] == null) (meta as any)[k] = v; };
      if (isRaw) {
        // Own TIFF reader first: works on CR2/CR3/NEF/ARW/DNG headers where exifr often returns nothing.
        const { readRawExif } = await import("./raw-exif");
        merge(readRawExif(new Uint8Array(await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer())));
      }
      if (isRaw && (!(meta as any).Model || !(meta as any).FNumber)) {
        const head = await file.slice(0, Math.min(file.size, 8 * 1024 * 1024)).arrayBuffer();
        const u = new Uint8Array(head), dv = new DataView(head), txt = new TextDecoder("latin1").decode(u.subarray(0, 512 * 1024));
        for (const tag of ["CMT1", "CMT2", "CMT3"]) {
          const i = txt.indexOf(tag);
          if (i < 4) continue;
          const len = dv.getUint32(i - 4) - 8;
          if (len > 8 && i + 4 + len <= u.length) merge(await tryParse(head.slice(i + 4, i + 4 + len)));
        }
        if (preview && (!(meta as any).Model || !(meta as any).FNumber || !(meta as any).ExposureTime)) merge(await tryParse(await preview.arrayBuffer()));
      }
      setImg((cur: any) => (cur && cur.file === file ? { ...cur, meta } : cur));
    };
  };

  // ---------- Culling session ----------
  const [session, setSession] = useState<CullItem[]>([]);
  const [curId, setCurId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CullFilter>({ kind: "all", minStars: 0 });
  const [stripOpen, setStripOpen] = useState(false);
  const [view, setView] = useState<"loupe" | "grid">("loupe");
  const [mob, setMob] = useState(false);
  useEffect(() => setMob(isTouchDevice()), []);
  const [gridSize, setGridSize] = useState(180);
  const openLoupe = (id?: string | null) => { setView("loupe"); const it = session.find((s) => s.id === (id ?? curId)); if (it) { setCurId(it.id); openFile(it.file); } };
  const multiInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const fitScale = useRef(1);
  const visible = applyFilter(session, filter);

  // The non-active pane reports its own zoom/pan so swapping keeps both views exactly as left.
  const paneView = (v: { scale: number; off: { x: number; y: number } }) => setOther((o) => (o ? { ...o, ...v } : o));
  const swapActive = () => {
    let snap: string | null = null;
    try { if (img && preview.current && (crop || JSON.stringify(adjust) !== JSON.stringify(defaultAdjust))) snap = preview.current.toDataURL("image/jpeg", 0.9); } catch { /* ignore */ }
    const o = other;
    setOther({ img, adjust, crop, scale, off, curId, snap });
    setActive((a) => (a === "A" ? "B" : "A"));
    setImg(o?.img ?? null);
    setAdjust(o?.adjust ?? defaultAdjust);
    setCrop(o?.crop ?? null);
    setSel(null);
    setCurId(o?.curId ?? null);
    if (o?.img) { setScale(o.scale); setOff(o.off); }
  };
  useEffect(() => { requestAnimationFrame(() => fit()); }, [compare]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setStripOpen(false);
    setView(files.length > 1 ? "grid" : "loupe");
    setCurId(base[0]!.id);
    openFile(base[0]!.file);
    notify(`Importate ${files.length} foto.`);
    const merge = (chunk: CullItem[], res: Partial<CullItem>[]) =>
      setSession((s) => s.map((x) => { const k = chunk.findIndex((c) => c.id === x.id); return k < 0 ? x : { ...x, ...res[k] }; }));
    // 1) stars / lock / flag first (only a few KB per file), so filters work right away
    // Fast path on every device: one light pass per file (tags + embedded thumbnail), full metadata only when a photo is opened.
    const light = true;
    const isTouch = typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || /Android|iPad|iPhone/i.test(navigator.userAgent)) && !(window as any).lomaDesktop;
    const WORKERS = isTouch ? 3 : 3; // few parallel reads: slow card readers choke on many random seeks
    {
      let next = 0;
      const buf: { c: CullItem; r: Partial<CullItem> }[] = [];
      let timer: any = null;
      const flush = () => { timer = null; const b = buf.splice(0); if (b.length) merge(b.map((x) => x.c), b.map((x) => x.r)); };
      const worker = async () => {
        while (next < base.length) {
          const c = base[next++]!;
          const [t, r] = await Promise.all([
            readCullTags(c.file, { light }).catch(() => ({})),
            readCull(c.file, { light }).catch(() => ({}) as Partial<CullItem>),
          ]);
          buf.push({ c, r: { thumb: (r as any).thumb ?? null, ...t } });
          if (!timer) timer = setTimeout(flush, 150);
        }
      };
      await Promise.all(Array.from({ length: WORKERS }, worker));
      flush();
    }
  };

  // Desktop: photos opened from Finder/Explorer (double-click or "Apri con").
  const importRef = useRef(importFiles);
  importRef.current = importFiles;
  useEffect(() => {
    const desk = (window as any).lomaDesktop;
    if (!desk?.getInitialFile) return;
    const load = (f: { name: string; path?: string; bytes: Uint8Array } | null) => {
      if (!f) return;
      const file = new File([f.bytes as BlobPart], f.name);
      if (f.path) (file as any).lomaPath = f.path;
      const dt = new DataTransfer();
      dt.items.add(file);
      importRef.current(dt.files);
    };
    desk.getInitialFile().then(load).catch(() => {});
    return desk.onFileOpened?.(load);
  }, []);

  // Android/tablet PWA: photos shared to LoMa via the system Share menu (Web Share Target).
  const openRef = useRef(openFile);
  openRef.current = openFile;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("shared") || !("caches" in window)) return;
    (async () => {
      try {
        const cache = await caches.open("loma-share-target");
        const reqs = await cache.keys();
        const files: File[] = [];
        for (const r of reqs) {
          const res = await cache.match(r);
          if (res) {
            const blob = await res.blob();
            const name = decodeURIComponent(res.headers.get("x-file-name") || "condivisa.jpg");
            files.push(new File([blob], name, { type: blob.type }));
          }
          await cache.delete(r);
        }
        window.history.replaceState(null, "", "/");
        if (files.length === 1 && files[0]) await openRef.current(files[0]);
        else if (files.length > 1) {
          const dt = new DataTransfer();
          files.forEach((f) => dt.items.add(f));
          importRef.current(dt.files);
        }
      } catch (e) {
        console.warn("Shared files load failed", e);
      }
    })();
  }, []);

  // Android APK: images received via Share / "Apri con" are handed over by MainActivity (LomaAndroid bridge):
  // pushed via window.__lomaReceiveSharedFiles(json) and also pulled via LomaAndroid.takeFiles().
  useEffect(() => {
    const w = window as any;
    const receive = async (raw: unknown) => {
      try {
        if (!raw) return;
        const list = (typeof raw === "string" ? JSON.parse(raw) : raw) as { id?: string; name: string; type?: string; size?: number; data?: string }[] | null;
        if (!Array.isArray(list) || list.length === 0) return;
        console.info("[LomaAndroid] ricevuti", list.length, "file", list.map((f) => f.name));
        const tid = sonnerToast.loading(list.length === 1 ? "Caricamento immagine da Galleria..." : `Caricamento ${list.length} immagini...`);
        const b64 = (s: string) => {
          const bin = atob(s);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes;
        };
        const files: File[] = [];
        const bridge = w.LomaAndroid;
        for (const f of list) {
          try {
            if (f?.data) { files.push(new File([b64(f.data)], f.name || "condivisa.jpg", { type: f.type || "" })); continue; }
            if (!f?.id || !bridge?.getFileChunk || !f.size) continue;
            const CH = 512 * 1024;
            const parts: Uint8Array[] = [];
            for (let off = 0; off < f.size; off += CH) {
              const chunk = bridge.getFileChunk(f.id, off, Math.min(CH, f.size - off)) as string;
              if (!chunk) break;
              parts.push(b64(chunk));
              if (parts.length % 8 === 0) await new Promise((r) => setTimeout(r, 0));
            }
            files.push(new File(parts as BlobPart[], f.name || "condivisa.jpg", { type: f.type || "" }));
            try { bridge.releaseFile?.(f.id); } catch { /* ignore */ }
          } catch (e) { console.warn("shared file read failed", e); }
        }
        sonnerToast.dismiss(tid);
        if (files.length === 0) return;
        if (files.length === 1 && files[0]) await openRef.current(files[0]);
        else {
          const dt = new DataTransfer();
          files.forEach((f) => dt.items.add(f));
          importRef.current(dt.files);
        }
        sonnerToast.success(files.length === 1 ? "Immagine ricevuta" : `${files.length} immagini ricevute`, { duration: 1000 });
      } catch (e) {
        console.warn("Android shared files load failed", e);
      }
    };
    const pull = () => {
      const bridge = w.LomaAndroid;
      if (!bridge?.takeFiles) return;
      try {
        const raw = bridge.takeFiles();
        if (raw && raw !== "[]") console.info("[LomaAndroid] takeFiles:", raw.length, "caratteri");
        receive(raw);
      } catch (e) { console.warn("[LomaAndroid] takeFiles fallito", e); }
    };
    w.__lomaReceiveSharedFiles = (raw: unknown) => { console.info("[LomaAndroid] push da MainActivity"); return receive(raw); };
    w.__lomaAndroidFiles = pull;
    console.info("[LomaAndroid] ricevitore pronto, bridge:", !!w.LomaAndroid?.takeFiles);
    if (!w.LomaAndroid?.takeFiles) return () => { delete w.__lomaReceiveSharedFiles; delete w.__lomaAndroidFiles; };
    pull();
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 5000) { window.clearInterval(timer); return; }
      pull();
    }, 500);
    // onNewIntent while the app is already open: pull again when it comes back to the foreground.
    const onVis = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", pull);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", pull); delete w.__lomaAndroidFiles; delete w.__lomaReceiveSharedFiles; };
  }, []);

  const clearCache = async () => {
    session.forEach((s) => s.thumb?.startsWith("blob:") && URL.revokeObjectURL(s.thumb));
    setSession((s) => s.map((x) => ({ ...x, thumb: null })));
    let extra = "";
    const desk = (window as any).lomaDesktop;
    if (desk?.clearCache) {
      try {
        const r = await desk.clearCache();
        if (r?.freed) extra = ` (${formatBytes(r.freed)} liberati)`;
      } catch { /* ignore */ }
    }
    sonnerToast.success("Cache e memoria temporanea svuotate con successo!" + extra, { duration: QUICK_MS });
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

  // undo/redo of adjustments + crop (slider drags grouped by a short pause)
  const histRef = useRef<History<{ adjust: Adjust; crop: typeof crop }>>(startHistory({ adjust: defaultAdjust, crop: null }));
  const restoring = useRef(false);
  const [histTick, setHistTick] = useState(0);
  useEffect(() => { histRef.current = startHistory({ adjust, crop }); setHistTick((t) => t + 1); }, [img]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (restoring.current) { restoring.current = false; return; }
    const t = setTimeout(() => { histRef.current = commit(histRef.current, { adjust, crop }); setHistTick((x) => x + 1); }, 350);
    return () => clearTimeout(t);
  }, [adjust, crop]);
  const travel = (dir: -1 | 1) => {
    const cur = { adjust, crop };
    let h = commit(histRef.current, cur);
    h = dir < 0 ? undo(h) : redo(h);
    if (h.present === cur || JSON.stringify(h.present) === JSON.stringify(cur)) { histRef.current = h; return; }
    histRef.current = h; restoring.current = true;
    setAdjust(h.present.adjust); setCrop(h.present.crop); setSel(null); setCropping(false);
    setHistTick((x) => x + 1);
    sonnerToast(dir < 0 ? "Modifica annullata" : "Modifica ripristinata", { duration: QUICK_MS });
  };
  void histTick;
  const pendingEdit = JSON.stringify({ adjust, crop }) !== JSON.stringify(histRef.current.present);
  const canUndo = histRef.current.past.length > 0 || pendingEdit;
  const canRedo = histRef.current.future.length > 0 && !pendingEdit;

  // keyboard culling
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    const t = e.target as HTMLElement;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "y") && !t?.closest?.("textarea,[contenteditable],input[type=text]")) {
      e.preventDefault(); travel(k === "y" || e.shiftKey ? 1 : -1); return;
    }
    if (t?.closest?.("input,textarea,select,[contenteditable]")) return;
    if (e.key.toLowerCase() === "g" && !e.ctrlKey && !e.metaKey && session.length) { e.preventDefault(); setStripOpen(false); setView("grid"); return; }
    if (e.key === "Escape" && view === "loupe" && session.length > 1 && !document.fullscreenElement) { e.preventDefault(); setStripOpen(false); setView("grid"); return; }
    if ((e.key.toLowerCase() === "e" || e.key === "Enter") && view === "grid" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openLoupe(); return; }
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
    const h = (e: WheelEvent) => { if ((e.target as HTMLElement)?.closest?.("[data-grid]")) return; e.preventDefault(); wheelRef.current(e); };
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
    } else if (mode === "select" && !cropping && pts.length === 1) {
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
    if (!need()) return;
    const f = await outputFile("_loma");
    download(f, f.name);
    notify(f === img!.file ? `Salvato file originale: ${f.name}` : "Immagine modificata salvata.");
  };
  const deepClean = async () => {
    // Lossless PNG re-encode from a fresh canvas + byte-level chunk scrub (see sanitize.ts).
    if (!need()) return;
    const t = sonnerToast.loading("Pulizia in corso…");
    try {
      const b = await exportClean("image/png", "_clean");
      if (!b) return;
      // Replace the open photo with the clean file so Info/EXIF/Provenienza reflect it at once.
      await openFile(new File([b], `${baseName(img!.file.name)}_clean.png`, { type: "image/png" }));
      sonnerToast.success("Pulita e salvata: EXIF, XMP, IPTC, ICC, C2PA/JUMBF e testi AI rimossi (PNG senza perdita).", { id: t, duration: 3000 });
    } catch {
      sonnerToast.error("Pulizia non riuscita.", { id: t });
    }
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

  const closeAll = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    session.forEach((s) => s.thumb?.startsWith("blob:") && URL.revokeObjectURL(s.thumb));
    if (img?.url?.startsWith("blob:")) URL.revokeObjectURL(img.url);
    setImg(null); setSession([]); setCurId(null); setView("loupe"); setCompare(false); setOther(null); setActive("A");
    setAdjust(defaultAdjust); setCrop(null); setSel(null); setScale(1); setOff({ x: 0, y: 0 }); setHist(null);
    sonnerToast.success("Sessione chiusa", { duration: QUICK_MS });
  };
  const copyToClipboard = async () => {
    if (!img || !imgEl.current) return false;
    const desk = (window as any).lomaDesktop;
    try {
      if (desk?.copyImage) {
        const b = await renderClean(imgEl.current, adjust, crop, "image/png");
        return !!(await desk.copyImage(b));
      }
      // Pass the promise directly so the click's user activation is still valid when the clipboard is written.
      const pending = renderClean(imgEl.current, adjust, crop, "image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pending })]);
      return true;
    } catch { return false; }
  };
  const openAI = async (name: string, url: string, pkg?: string) => {
    const mobile = isTouchDevice();
    if (img && pkg && (window as any).LomaAndroid?.shareCommitTo) {
      // Android APK: open the installed app directly with the photo attached.
      const t = sonnerToast.loading(`Apertura di ${name}…`);
      try {
        if (await androidShare(await outputFile(), pkg)) { sonnerToast.success(`${name} aperto`, { id: t, duration: QUICK_MS }); return; }
        sonnerToast.dismiss(t);
      } catch { sonnerToast.dismiss(t); }
    }
    if (img && mobile) {
      // Touch: each AI opens its own app/site (universal link) with the photo in the clipboard.
      const ok = await copyToClipboard();
      window.open(url, "_blank", "noopener");
      notify(ok ? `Immagine copiata: in ${name} tieni premuto nella chat e scegli Incolla.` : `Apri ${name} e allega la foto dalla galleria.`);
      return;
    }
    if (!img && isTouchDevice()) { notify(`Apri prima un'immagine da inviare a ${name}.`); return; }
    // Desktop: AI websites cannot receive a file from a link, so copy the photo to the clipboard and open the chat.
    if (!img) { notify(`Apri prima un'immagine da inviare a ${name}.`); return; }
    const id = sonnerToast.loading(`Copia dell'immagine per ${name}...`);
    const ok = await copyToClipboard();
    const desk = (window as any).lomaDesktop;
    if (desk?.openExternal) desk.openExternal(url); else window.open(url, "_blank", "noopener");
    const paste = /Mac/.test(navigator.platform) ? "⌘V" : "Ctrl+V";
    if (ok) sonnerToast.success(`Immagine copiata. In ${name} clicca nella chat e premi ${paste}.`, { id, duration: 8000 });
    else sonnerToast.error(`Copia non riuscita: ${name} aperto, trascina la foto nella chat.`, { id });
  };

  // WhatsApp: first click asks desktop app vs WhatsApp Web; then copy photo to clipboard and open it for pasting.
  const whatsapp = async (choice?: "app" | "web") => {
    if (isTouchDevice()) return share("WhatsApp", "whatsapp://");
    if (!img) { notify("Apri prima un'immagine da inviare a WhatsApp."); return; }
    const desk = (window as any).lomaDesktop;
    let mode = choice ?? (localStorage.getItem("loma.wa.mode") as "app" | "web" | null);
    if (!mode) { setWaAsk(true); return; }
    let appPath = localStorage.getItem("loma.topaz.WhatsApp") || "";
    if (mode === "app" && desk?.pickApp && !appPath) {
      appPath = (await desk.pickApp("WhatsApp")) || "";
      if (!appPath) { notify("Nessuna app WhatsApp selezionata."); return; }
      localStorage.setItem("loma.topaz.WhatsApp", appPath);
    }
    localStorage.setItem("loma.wa.mode", mode);
    const ok = await copyToClipboard();
    let opened = false;
    if (mode === "app") {
      if (desk?.launchApp && appPath) {
        const r = await desk.launchApp(appPath, []);
        if (!r?.ok && r?.error === "not-found") { localStorage.removeItem("loma.topaz.WhatsApp"); notify("WhatsApp non trovato: premi di nuovo e selezionalo."); return; }
        opened = !!r?.ok;
      } else { window.location.href = "whatsapp://"; opened = true; }
    }
    if (!opened) { const u = "https://web.whatsapp.com/"; if (desk?.openExternal) desk.openExternal(u); else window.open(u, "_blank", "noopener"); mode = "web"; }
    const paste = /Mac/.test(navigator.platform) ? "⌘V" : "Ctrl+V";
    if (ok) sonnerToast.success(`Immagine copiata. In WhatsApp apri la chat e premi ${paste}.`, { duration: 8000 });
    else sonnerToast.error("Copia non riuscita: trascina la foto nella chat di WhatsApp.");
  };

  // Mail: every click shows the saved accounts; the chosen one opens its app (Android) or webmail with the photo.
  const mail = async (acc?: MailAccount) => {
    if (!img) { notify("Apri prima un'immagine da inviare per email."); return; }
    if (!acc) { setMailAsk(true); return; }
    const svc = serviceOf(acc);
    if ((window as any).LomaAndroid?.shareBegin) {
      if (await androidShare(await outputFile(), svc.pkg)) { if (acc.email) notify(`Scegli ${acc.email} come mittente se l'app ne ha più di uno.`); return; }
    }
    if (isTouchDevice()) return share("Mail", "mailto:?subject=Immagine%20da%20LoMa%20VIEWER");
    const desk = (window as any).lomaDesktop;
    const ok = await copyToClipboard();
    if (svc.id === "app") {
      let p = localStorage.getItem("loma.topaz.Mail") || "";
      if (!p && desk?.pickApp) { p = (await desk.pickApp("Mail")) || ""; if (p) localStorage.setItem("loma.topaz.Mail", p); }
      if (p && desk?.launchApp) {
        const r = await desk.launchApp(p, []);
        if (!r?.ok) { localStorage.removeItem("loma.topaz.Mail"); notify("App di posta non trovata: premi di nuovo e selezionala."); return; }
      } else window.location.href = "mailto:?subject=Immagine%20da%20LoMa%20VIEWER";
    } else {
      const u = svc.web(acc.email);
      if (desk?.openExternal) desk.openExternal(u); else window.open(u, "_blank", "noopener");
    }
    const paste = /Mac/.test(navigator.platform) ? "⌘V" : "Ctrl+V";
    if (ok) sonnerToast.success(`Immagine copiata. Crea un nuovo messaggio e premi ${paste} per incollarla.`, { duration: 8000 });
    else sonnerToast.error("Copia non riuscita: allega la foto trascinandola nel messaggio.");
  };

  // AirDrop: macOS desktop uses the native share menu (AirDrop, Messaggi...); tablet/Safari use the Web Share sheet.
  const airdrop = async () => {
    if (!img || !imgEl.current) { notify("Apri prima un'immagine da inviare con AirDrop."); return; }
    const desk = (window as any).lomaDesktop;
    if (desk?.shareFile && desk.platform === "darwin") {
      const f = await outputFile();
      const disk: string = (f === img.file && ((f as any).lomaPath || desk.getPathForFile?.(f))) || "";
      const r = await desk.shareFile(disk || f, f.name);
      if (!r?.ok) notify("Condivisione macOS non disponibile.");
      return;
    }
    return share("AirDrop");
  };

  const share = async (target: string, fallback?: string) => {
    if (img && imgEl.current) {
      const b = await renderClean(imgEl.current, adjust, crop, "image/png");
      const f = new File([b], `${baseName(img.file.name)}.png`, { type: "image/png" });
      if (await androidShare(f)) return;
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
  const isEdited = () => !isNeutral(adjust) || !!crop || adjust.rotation !== 0 || adjust.flipH || adjust.flipV || adjust.straighten !== 0;
  /** Original file (name + extension) when unedited; edited PNG otherwise. */
  const openPrint = async () => {
    if (!img || !imgEl.current) { notify("Apri prima un'immagine da stampare"); return; }
    const b = await renderClean(imgEl.current, adjust, crop, "image/jpeg");
    setPrintSrc(URL.createObjectURL(b));
  };
  const sharePhoto = async () => {
    if (!img || !imgEl.current) return;
    try {
      let f: File;
      if (!isEdited() && !RAWLIKE.test(img.file.name)) f = img.file; // instant: original, no re-render
      else if (!isEdited()) {
        const b = await (await fetch(img.url)).blob(); // embedded RAW preview, already in memory
        f = new File([b], `${baseName(img.file.name)}.jpg`, { type: "image/jpeg" });
      } else {
        const b = await renderClean(imgEl.current, adjust, crop, "image/jpeg");
        f = new File([b], `${baseName(img.file.name)}.jpg`, { type: "image/jpeg" });
      }
      const desk = (window as any).lomaDesktop;
      if (desk?.shareFile && desk.platform === "darwin") { const r = await desk.shareFile(f, f.name); if (r?.ok) return; }
      if (await androidShare(f)) return;
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: f.name }); return; }
      download(f, f.name);
      notify("Condivisione non supportata qui: foto scaricata.");
    } catch (e: any) { if (e?.name !== "AbortError") notify("Condivisione non riuscita"); }
  };
  const outputFile = async (suffix = ""): Promise<File> => {
    if (!isEdited()) return img!.file;
    const b = await renderClean(imgEl.current!, adjust, crop, "image/png");
    return new File([b], `${baseName(img!.file.name)}${suffix}.png`, { type: "image/png" });
  };

  const uploadCloud = async (target: string, web: string) => {
    if (target !== "iCloud Drive") {
      // Drive / OneDrive: copy into the folder synced by the desktop app (Google Drive for desktop / OneDrive).
      const kind = target === "OneDrive" ? "onedrive" : "drive";
      if (!img || !imgEl.current) { notify(`Carica prima un'immagine da salvare su ${target}.`); return; }
      const desk = (window as any).lomaDesktop;
      const f = await outputFile();
      if (!desk?.saveToFolder) {
        // Browser: save dialog, where the user picks the Drive/OneDrive folder.
        const picker = (window as any).showSaveFilePicker;
        if (picker) {
          try {
            const h = await picker({ suggestedName: f.name, id: `loma-${kind}` });
            const w = await h.createWritable(); await w.write(f); await w.close();
            notify(`Salvato in ${target}: ${h.name}`);
          } catch (e: any) { if (e?.name !== "AbortError") notify("Salvataggio non riuscito."); }
          return;
        }
        if (await androidShare(f)) return;
      if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: f.name }); } catch { /* annullato */ } return; }
        download(f, f.name);
        notify(`Spostalo nella cartella di ${target}.`);
        return;
      }
      const key = `loma.cloudDir.${kind}`;
      let dir = localStorage.getItem(key) || "";
      if (!dir) {
        const guess = await desk.cloudDir(kind);
        dir = await desk.pickFolder(`Scegli la cartella di ${target} dove salvare le foto`, guess);
        if (!dir) { notify(guess ? "Nessuna cartella scelta." : `Installa l'app ${target} sul computer e scegli la sua cartella.`); return; }
        localStorage.setItem(key, dir);
      }
      const disk: string = (f === img.file && ((f as any).lomaPath || desk.getPathForFile?.(f))) || "";
      let r = await desk.saveToFolder(dir, f.name, disk || f);
      if (!r?.ok && r?.error === "no-dir") {
        localStorage.removeItem(key);
        const nd = await desk.pickFolder(`Cartella di ${target} non trovata: sceglila di nuovo`, await desk.cloudDir(kind));
        if (!nd) return;
        localStorage.setItem(key, nd);
        r = await desk.saveToFolder(nd, f.name, disk || f);
      }
      if (!r?.ok) { sonnerToast.error(`Salvataggio su ${target} non riuscito.`); return; }
      sonnerToast.success(`${f.name} copiato in ${target}: verrà sincronizzato dall'app ${target}.`, {
        action: { label: "Mostra", onClick: () => desk.showInFolder(r.path) },
      });
      return;
    }
    if (!img || !imgEl.current) { notify(`Carica prima un'immagine da salvare su ${target}.`); return; }
    const f = await outputFile();
    const picker = (window as any).showSaveFilePicker;
    if (picker) {
      // Finder save dialog: iCloud Drive is in the sidebar.
      try {
        const ext = f.name.split(".").pop() || "";
        const h = await picker({ suggestedName: f.name, ...(ext ? { types: [{ description: ext.toUpperCase(), accept: { [f.type || "application/octet-stream"]: ["." + ext] } }] } : {}) });
        const w = await h.createWritable(); await w.write(f); await w.close();
        notify(`Salvato: ${h.name}`);
        return;
      } catch (e: any) { if (e?.name === "AbortError") { notify("Salvataggio annullato."); return; } }
    }
    if (await androidShare(f)) return;
      if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: f.name }); notify(`Inviato a ${target}.`); return; } catch { notify("Salvataggio annullato."); return; }
    }
    download(f, f.name);
    window.open(web, "_blank", "noopener");
    notify(`Trascina ${f.name} in iCloud Drive per salvarla.`);
  };

  const topaz = async (app: string) => {
    if (!need()) return;
    if (isTouchDevice()) {
      // Tablet/mobile: hand the file to the OS share sheet ("Apri in Lightroom", ...).
      const b = await renderClean(imgEl.current!, adjust, crop, "image/png");
      const f = new File([b], `${baseName(img!.file.name)}.png`, { type: "image/png" });
      if (await androidShare(f)) return;
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
      const file = img!.file;
      const disk: string = (file as any).lomaPath || (desk.getPathForFile?.(file) ?? "");
      const isRaw = /\.(cr2|cr3|crw|nef|nrw|arw|srf|sr2|dng|orf|rw2|raf|pef|srw|3fr|iiq|erf|kdc|mef|mos|mrw|x3f|rwl)$/i.test(file.name);
      const edited = !isNeutral(adjust) || !!crop || adjust.rotation !== 0 || adjust.flipH || adjust.flipV || adjust.straighten !== 0;
      const useOriginal = !!disk && (isRaw || !edited);
      const fname = `${baseName(file.name)}_for_${app.replace(/\s/g, "")}.png`;
      let b: Blob | null = null;
      const send = async (exe: string) => {
        if (useOriginal) return desk.launchApp(exe, [disk]);
        b ??= await renderClean(imgEl.current!, adjust, crop, "image/png");
        return desk.launchWithData(exe, fname, b);
      };
      let r = await send(path);
      if (!r?.ok && r?.error === "not-found" && desk.pickApp) {
        notify(`${app} non trovato: seleziona di nuovo il programma.`);
        const np = await desk.pickApp(app);
        if (!np) return;
        localStorage.setItem(`loma.topaz.${app}`, np);
        r = await send(np);
      }
      if (!r?.ok) { notify(`Impossibile avviare ${app}.`); return; }
      if (isRaw && useOriginal) {
        const acr = /photoshop/i.test(app) ? " (apertura in Camera Raw)" : "";
        notify(`File RAW originale inviato a ${app}${acr}${edited ? ". Le regolazioni di LoMa non vengono applicate al RAW." : "."}`);
      } else if (useOriginal) notify(`Immagine originale aperta in ${app}.`);
      else notify(disk ? `Versione modificata inviata a ${app}.` : `Copia dell'immagine inviata a ${app} (file originale non disponibile su disco).`);
      return;
    }
    await exportClean("image/png", `_for_${app.replace(/\s/g, "")}`);
    notify(path ? `Esportato. Aprilo con ${app} (${path}).` : `Esportato per ${app}. Imposta il percorso in "Percorsi".`);
  };

  const startCrop = () => {
    if (!img) return;
    setCropping(true); setMode("select");
    setSel((cur) => cur && cur.w > 4 ? cur : crop ? { ...crop } : { x: img.w * 0.1, y: img.h * 0.1, w: img.w * 0.8, h: img.h * 0.8 });
  };
  const cancelCrop = () => { setCropping(false); setSel(null); };
  const applyCrop = () => {
    if (!sel || sel.w < 4 || sel.h < 4) { startCrop(); notify("Trascina sulla foto per scegliere l'area, poi premi Applica."); return; }
    setCrop({ x: Math.round(sel.x), y: Math.round(sel.y), w: Math.round(sel.w), h: Math.round(sel.h) });
    setSel(null); setCropping(false); setMode("move");
    notify("Ritaglio applicato.");
  };

  const m: any = img?.meta ?? {};
  const lat = m.latitude as number | undefined, lon = m.longitude as number | undefined;
  const transform = `translate(${off.x}px, ${off.y}px) scale(${scale})`;
  const imgStyle = (filtered: boolean): React.CSSProperties => ({
    width: img?.w, height: img?.h, transformOrigin: "0 0", transform,
    imageRendering: scale >= 2 ? "pixelated" : "auto",
  });
  const rotStyle: React.CSSProperties = {
    transform: `rotate(${adjust.rotation + adjust.straighten}deg) scale(${adjust.flipH ? -1 : 1}, ${adjust.flipV ? -1 : 1})`,
    transformOrigin: "center", width: "100%", height: "100%",
  };

  const isMacDesk = typeof window !== "undefined" && !!(window as any).lomaDesktop && /Mac/.test(navigator.platform);
  return (
    <div className="flex h-dvh flex-col bg-toolbar text-foreground select-none">
      {/* Title bar: always draggable */}
      <div className="drag-region flex h-7 shrink-0 items-center justify-center border-b border-border bg-toolbar px-20 text-[11px] font-medium text-muted-foreground">
        <span className="truncate">{img ? img.file.name : "LoMa VIEWER"}</span>
      </div>
      {/* Toolbar */}
      <header className="flex shrink-0 items-stretch border-b border-border bg-toolbar">
        <div className={`drag-region flex shrink-0 items-center gap-1.5 px-2 ${isMacDesk ? "pl-[4.5rem]" : ""}`}>
          <img src={logo.url} alt="LoMa VIEWER" className="h-8 w-8 rounded-full" />
          <div className="leading-none">
            <div className="text-sm font-bold tracking-tight">LoMa</div>
            <div className="text-[9px] font-bold tracking-[0.2em] text-primary">VIEWER</div>
          </div>
        </div>
        <div onClick={phone ? (e) => { if ((e.target as HTMLElement).closest("button")) setMoreOpen(false); } : undefined}
          className={phone ? (moreOpen ? "no-drag fixed inset-x-2 bottom-16 z-50 max-h-[65vh] overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-2xl" : "hidden") : "no-drag flex min-w-0 flex-1 items-stretch overflow-x-auto px-1 py-1"}>
          <div className={phone ? "flex flex-wrap items-stretch gap-1" : "flex w-full items-stretch gap-0.5"}>
        <Group>
          <Tool icon={<HardDrive className="text-primary" />} label="Importa" tip="Importa scheda / cartella" onClick={() => folderInput.current?.click()} />
          <Tool icon={<Images />} label="Apri" tip="Apri più file" onClick={() => multiInput.current?.click()} />
          <Tool icon={<GalleryHorizontal />} label="Strip" tip="Filmstrip" active={stripOpen && session.length > 0 && view !== "grid"} onClick={() => {
            const on = !stripOpen;
            setStripOpen(on);
            if (on && view === "grid") openLoupe();
          }} />
          <Tool icon={view === "grid" ? <Square /> : <LayoutGrid />} label={view === "grid" ? "Singola" : "Griglia"} active={view === "grid"} onClick={() => {
            if (!session.length) return notify("Importa prima più foto.");
            if (view === "grid") return openLoupe();
            setStripOpen(false);
            setView("grid");
          }} />
          <Tool icon={<Save className="text-primary" />} label="Salva" onClick={save} />
          <Tool icon={<MousePointer2 />} label="Area" tip="Seleziona area" active={mode === "select"} onClick={() => setMode("select")} />
          <Tool icon={<Hand />} label="Sposta" active={mode === "move"} onClick={() => setMode("move")} />
        </Group>
        <Group>
          <div className="no-drag flex shrink-0 flex-col items-center justify-center gap-0.5 px-1">
            <div className="flex items-center gap-0.5">
              <ZBtn onClick={() => setZoom(scale / 1.25)}><ZoomOut className="h-3.5 w-3.5" /></ZBtn>
              <span className="w-10 text-center text-[10px] tabular-nums">{Math.round(scale * 100)}%</span>
              <ZBtn onClick={() => setZoom(scale * 1.25)}><ZoomIn className="h-3.5 w-3.5" /></ZBtn>
            </div>
            <div className="flex items-center gap-0.5">
              <ZBtn onClick={() => setZoom(1)}>1:1</ZBtn>
              <ZBtn onClick={() => setZoom(2)}>1:2</ZBtn>
              <ZBtn onClick={() => setZoom(3)}>1:3</ZBtn>
              <ZBtn onClick={() => fit()}>Fit</ZBtn>
            </div>
          </div>
          <Tool icon={<Columns2 />} label="A / B" tip="Confronta due foto" active={compare} onClick={() => setCompare((c) => !c)} />
          <Tool icon={<SlidersHorizontal className="text-primary" />} label="Sviluppo" tip="Pannello strumenti di sviluppo" active={toolsOpen} onClick={() => setToolsOpen((o) => !o)} />
          <Tool icon={<Camera />} label="Cattura" tip="Screenshot a risoluzione nativa" onClick={screenshot} />
          <Tool icon={<Eraser className="text-chart-3" />} label="Pulisci" tip="Rimuovi tutti i metadati" onClick={deepClean} />
          <div className={canUndo ? "" : "pointer-events-none opacity-40"}><Tool icon={<Undo2 />} label="Annulla" tip="Annulla ultima modifica (Ctrl/⌘+Z)" onClick={() => travel(-1)} /></div>
          <div className={canRedo ? "" : "pointer-events-none opacity-40"}><Tool icon={<Redo2 />} label="Ripeti" tip="Ripeti modifica (Ctrl+Y / ⌘+⇧+Z)" onClick={() => travel(1)} /></div>
        </Group>
        <Group>
          <Tool icon={<B.ChatGPTIcon />} label="ChatGPT" onClick={() => openAI("ChatGPT", "https://chatgpt.com/", "com.openai.chatgpt")} />
          <Tool icon={<B.MetaAIIcon />} label="Meta AI" onClick={() => openAI("Meta AI", "https://www.meta.ai/", "com.facebook.stellar")} />
          <Tool icon={<B.GeminiIcon />} label="Gemini" onClick={() => openAI("Gemini", "https://gemini.google.com/", "com.google.android.apps.bard")} />
          <Tool icon={<B.FlowIcon />} label="Flow" onClick={() => openAI("Flow", "https://labs.google/fx/tools/flow", "com.google.android.apps.labs.flow")} />
        </Group>
        <Group>
          {!touch && <>
          <Tool icon={<B.TopazPhotoIcon />} label="Topaz" tip="Topaz Photo AI" onClick={() => topaz("Topaz Photo AI")} />
          <Tool icon={<B.TopazGigapixelIcon />} label="Giga" tip="Topaz Gigapixel AI" onClick={() => topaz("Topaz Gigapixel AI")} />
          <Tool icon={<B.PhotoshopIcon />} label="Ps" tip="Adobe Photoshop" onClick={() => topaz("Adobe Photoshop")} />
          <Tool icon={<B.LightroomIcon />} label="Lr" tip="Adobe Lightroom" onClick={() => topaz("Adobe Lightroom")} />
          <Tool icon={<B.LightroomClassicIcon />} label="Lrc" tip="Adobe Lightroom Classic" onClick={() => topaz("Adobe Lightroom Classic")} />
          <Tool icon={<Settings />} label="App" tip="Percorsi programmi" onClick={() => setTopazOpen(true)} />
          </>}
          {touch && <Tool icon={<B.LightroomIcon />} label="Lr" tip="Apri in Lightroom mobile" onClick={() => openAI("Lightroom", "https://lightroom.adobe.com/", "com.adobe.lrmobile")} />}
          <Tool icon={<Repeat />} label="Converti" tip="Converti immagini (singola o batch)" onClick={() => (img || session.length ? setConvOpen(true) : notify("Apri prima un'immagine"))} />
          <Tool icon={<Printer />} label="Stampa" tip="Stampa fotografica" onClick={openPrint} />
          <Tool icon={<Trash2 />} label="Cache" tip="Svuota cache e memoria" onClick={clearCache} />
        </Group>
        <Group last>
          {touch ? (
            <>
            <Tool icon={<B.DriveIcon />} label="Drive" onClick={() => openAI("Google Drive", "https://drive.google.com/", "com.google.android.apps.docs")} />
            <Tool icon={<B.OneDriveIcon />} label="OneDrv" tip="OneDrive" onClick={() => openAI("OneDrive", "https://onedrive.live.com/", "com.microsoft.skydrive")} />
            <Tool icon={<B.ICloudIcon />} label="iCloud" onClick={() => (img ? sharePhoto() : notify("Apri prima un'immagine da condividere."))} />
            <Tool icon={<B.MailIcon />} label="Mail" onClick={() => mail()} />
            <Tool wide icon={<Share2 className="text-primary" />} label="Condividi" tip="Apri la condivisione del sistema" onClick={() => (img ? sharePhoto() : notify("Apri prima un'immagine da condividere."))} />
            </>
          ) : (
            <>
            <Tool icon={<B.DriveIcon />} label="Drive" onClick={() => uploadCloud("Google Drive", "https://drive.google.com/drive/my-drive")} />
            <Tool icon={<B.OneDriveIcon />} label="OneDrv" tip="OneDrive" onClick={() => uploadCloud("OneDrive", "https://onedrive.live.com/")} />
            <Tool icon={<B.ICloudIcon />} label="iCloud" onClick={() => uploadCloud("iCloud Drive", "https://www.icloud.com/iclouddrive/")} />
            <Tool icon={<B.MailIcon />} label="Mail" onClick={() => mail()} />
            <Tool icon={<B.WhatsAppIcon />} label="WApp" tip="WhatsApp" onClick={() => whatsapp()} />
            <Tool icon={<B.AirDropIcon />} label="AirDrop" onClick={() => airdrop()} />
            <Tool icon={<B.LocalSendIcon />} label="LSend" tip="LocalSend" onClick={() => topaz("LocalSend")} />
            </>
          )}
        </Group>
        </div></div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {toolsOpen && (
          <DevelopPanel
            adjust={adjust} setAdjust={setAdjust} hist={hist} hasImage={!!img}
            onAutoWb={autoWb} onAutoExposure={autoExposure}
            cropping={cropping} aspect={aspect} sheet={phone}
            onAspect={aspectSel} onStartCrop={startCrop} onApplyCrop={applyCrop} onCancelCrop={cancelCrop} onResetCrop={() => { setCrop(null); setSel(null); setCropping(false); }}
            onResetAll={() => { setAdjust(defaultAdjust); setCrop(null); setSel(null); setCropping(false); }}
            onClose={() => setToolsOpen(false)}
          />
        )}
        {/* Canvas */}
        <div className="flex min-w-0 flex-1 gap-2">
        {compare && active === "B" && <ComparePane slot={other?.img ? { url: other?.snap ?? other?.img?.url ?? null, w: other?.img?.w ?? 1, h: other?.img?.h ?? 1, name: other?.img?.file.name ?? "" } : null} label="A" onActivate={swapActive} view={other?.img ? { scale: other.scale, off: other.off } : null} onView={paneView} />}
        <main
          ref={stage}
          className={`relative min-w-0 flex-1 touch-none overflow-hidden rounded-lg border bg-canvas ${drag || compare ? "border-primary" : "border-border"} ${img ? (mode === "move" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair") : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={(e) => {
            if (!img) return;
            if ((e.target as HTMLElement).closest("button")) return;
            setSel(null);
            if (scale >= 0.499) { fit(); return; }
            const r = stage.current!.getBoundingClientRect();
            setZoom(0.5, e.clientX - r.left, e.clientY - r.top);
          }}
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
          {img && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="no-drag absolute right-2 top-2 z-30 flex gap-1"
            >
              <button onClick={async () => { const ok = await copyToClipboard(); ok ? sonnerToast.success("Immagine copiata negli appunti", { duration: QUICK_MS }) : sonnerToast.error("Copia non riuscita"); }}
                title="Copia negli appunti" className="rounded-md bg-background/40 p-1.5 text-foreground/70 opacity-60 backdrop-blur transition hover:bg-background/80 hover:text-foreground hover:opacity-100">
                <Copy className="h-4 w-4" />
              </button>
              <button onClick={sharePhoto} title="Condividi"
                className="rounded-md bg-background/40 p-1.5 text-foreground/70 opacity-60 backdrop-blur transition hover:bg-background/80 hover:text-foreground hover:opacity-100">
                <Share2 className="h-4 w-4" />
              </button>
              <button onClick={toggleFullscreen} title={isFull ? "Esci da schermo intero" : "Schermo intero"}
                className="rounded-md bg-background/40 p-1.5 text-foreground/70 opacity-60 backdrop-blur transition hover:bg-background/80 hover:text-foreground hover:opacity-100">
                {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              {session.length > 1 && view === "loupe" && (
                <button onClick={() => { if (document.fullscreenElement) document.exitFullscreen?.(); setStripOpen(false); setView("grid"); }} title="Torna alla griglia (Esc)"
                  className="inline-flex items-center gap-1 rounded-md bg-background/40 p-1.5 text-xs text-foreground/70 opacity-60 backdrop-blur transition hover:bg-background/80 hover:text-foreground hover:opacity-100">
                  <LayoutGrid className="h-4 w-4" /> Griglia
                </button>
              )}
              <button onClick={closeAll} title="Chiudi immagine e sessione"
                className="rounded-md bg-background/40 p-1.5 text-foreground/70 opacity-60 backdrop-blur transition hover:bg-destructive/80 hover:text-destructive-foreground hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
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
              <div className="absolute inset-0" >
                <img src={img.url} alt="" draggable={false} className="absolute left-0 top-0 max-w-none" style={{ ...imgStyle(false), ...(crop && !cropping ? { visibility: "hidden" } : {}) }} />
              </div>
              <div className="absolute inset-0" >
                <div className="absolute left-0 top-0" style={{ width: img.w, height: img.h, transformOrigin: "0 0", transform, clipPath: crop && !cropping ? `inset(${crop.y}px ${img.w - crop.x - crop.w}px ${img.h - crop.y - crop.h}px ${crop.x}px)` : undefined }}>
                  <div style={rotStyle}>
                    <img ref={imgEl} src={img.url} alt={img.file.name} draggable={false} onLoad={() => setImgReady((n) => n + 1)} className={isNeutral(adjust) ? "block max-w-none" : "hidden"} style={{ width: img.w, height: img.h, imageRendering: scale >= 2 ? "pixelated" : "auto" }} />
                    <canvas ref={preview} aria-label={img.file.name} style={{ display: isNeutral(adjust) ? "none" : "block", width: img.w, height: img.h, imageRendering: scale >= 2 ? "pixelated" : "auto" }} />
                  </div>
                </div>
              </div>
              {compare && (
                <span className="absolute left-2 top-2 z-20 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">{active} · attiva · {img.file.name}</span>
              )}
              {cropping && (
                <div onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
                  className="no-drag absolute bottom-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-popover/95 p-2 text-sm shadow-lg">
                  <span className="hidden px-1 text-muted-foreground sm:inline">Trascina angoli e lati</span>
                  <button onClick={applyCrop} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Applica ritaglio</button>
                  <button onClick={cancelCrop} className="rounded-md bg-secondary px-3 py-2">Annulla</button>
                </div>
              )}
              {sel && !cropping && (
                <div className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                  style={{ left: off.x + sel.x * scale, top: off.y + sel.y * scale, width: sel.w * scale, height: sel.h * scale }} />
              )}
              {sel && cropping && (
                <div className="absolute z-20 touch-none cursor-move border border-primary shadow-[0_0_0_9999px_color-mix(in_oklab,var(--background)_65%,transparent)]"
                  style={{ left: off.x + sel.x * scale, top: off.y + sel.y * scale, width: sel.w * scale, height: sel.h * scale }}
                  onPointerDown={cropPointer("move")} onPointerMove={cropMove} onPointerUp={cropUp} onPointerCancel={cropUp} onDoubleClick={(e) => e.stopPropagation()}>
                  {/* rule of thirds */}
                  <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(to right, transparent calc(33.33% - 0.5px), var(--primary) calc(33.33% - 0.5px), var(--primary) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), var(--primary) calc(66.66% - 0.5px), var(--primary) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px)), linear-gradient(to bottom, transparent calc(33.33% - 0.5px), var(--primary) calc(33.33% - 0.5px), var(--primary) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px), transparent calc(66.66% - 0.5px), var(--primary) calc(66.66% - 0.5px), var(--primary) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px))" }} />
                  {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((hd) => {
                    const pos: React.CSSProperties = {
                      left: hd.includes("w") ? 0 : hd.includes("e") ? "100%" : "50%",
                      top: hd.includes("n") ? 0 : hd.includes("s") ? "100%" : "50%",
                    };
                    const corner = hd.length === 2;
                    const cur = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" }[hd];
                    return (
                      <div key={hd} onPointerDown={cropPointer(hd)} onPointerMove={cropMove} onPointerUp={cropUp} onPointerCancel={cropUp}
                        className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ ...pos, cursor: cur }}>
                        <span className={`rounded-sm bg-primary shadow ${corner ? "h-4 w-4" : hd === "n" || hd === "s" ? "h-1.5 w-6" : "h-6 w-1.5"}`} />
                      </div>
                    );
                  })}
                </div>
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
          {img && view === "loupe" && visible.length > 1 && (["prev", "next"] as const).map((dir) => (
            <button
              key={dir}
              aria-label={dir === "prev" ? "Foto precedente" : "Foto successiva"}
              title={dir === "prev" ? "Precedente (←)" : "Successiva (→)"}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); step(dir === "prev" ? -1 : 1); }}
              className={`group absolute top-1/2 z-30 flex h-2/5 w-14 -translate-y-1/2 items-center justify-center ${dir === "prev" ? "left-0" : "right-0"}`}
            >
              <span className="rounded-full bg-popover/70 p-2 text-foreground opacity-70 shadow transition group-hover:bg-popover group-hover:opacity-100">
                {dir === "prev" ? <ChevronLeft className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
              </span>
            </button>
          ))}
          {phone && img && view === "loupe" && (
            <button aria-label="Informazioni immagine" onPointerDown={(e) => e.stopPropagation()} onClick={() => setInfoOpen(true)}
              className="absolute left-2 top-2 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-popover/80 text-foreground shadow">
              <Info className="h-5 w-5" />
            </button>
          )}
          {toast && (
            <div className="absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-md bg-popover px-4 py-2 text-sm shadow-xl">{toast}</div>
          )}
          {view === "grid" && session.length > 0 && (
            <ContactSheet items={visible} current={curId} size={gridSize} setSize={setGridSize} onPick={setCurId} onOpen={openLoupe} hideLock={mob} filter={filter} setFilter={setFilter} total={session.length} />
          )}
        </main>
        {compare && active === "A" && <ComparePane slot={other?.img ? { url: other?.snap ?? other?.img?.url ?? null, w: other?.img?.w ?? 1, h: other?.img?.h ?? 1, name: other?.img?.file.name ?? "" } : null} label="B" onActivate={swapActive} view={other?.img ? { scale: other.scale, off: other.off } : null} onView={paneView} />}
        </div>

        {/* Side panel */}
        {phone && infoOpen && <div className="fixed inset-0 z-40 bg-background/50" onClick={() => setInfoOpen(false)} />}
        <aside className={phone ? (infoOpen ? "fixed inset-x-2 bottom-16 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl" : "hidden") : "hidden w-80 shrink-0 overflow-y-auto rounded-lg border border-border bg-card md:block"}>
          {phone && <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-3 py-2 text-sm font-medium">Informazioni<button aria-label="Chiudi informazioni" onClick={() => setInfoOpen(false)} className="p-1"><X className="h-4 w-4" /></button></div>}
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
          <ProvenancePanel file={img?.file ?? null} meta={img?.meta ?? EMPTY_META} />
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

      {session.length > 0 && stripOpen && !(mob && view === "grid") && (
        <Filmstrip
          items={visible} total={session.length} current={curId} filter={filter} setFilter={setFilter}
          onSelect={selectItem} onSendBatch={sendBatch} hideLock={mob}
        />
      )}

      {phone && (
        <nav className="flex h-14 shrink-0 items-stretch justify-around border-t border-border bg-toolbar px-1">
          {([
            [<FolderOpen key="o" className="h-5 w-5" />, "Apri", () => fileInput.current?.click(), false],
            [view === "grid" ? <Square key="g" className="h-5 w-5" /> : <LayoutGrid key="g" className="h-5 w-5" />, view === "grid" ? "Singola" : "Griglia", () => {
              if (!session.length) return notify("Importa prima più foto.");
              if (view === "grid") return openLoupe();
              setStripOpen(false); setView("grid");
            }, view === "grid"],
            [<SlidersHorizontal key="s" className="h-5 w-5" />, "Regola", () => setToolsOpen((o) => !o), toolsOpen],
            [<Eraser key="e" className="h-5 w-5" />, "Pulisci", deepClean, false],
            [<Share2 key="c" className="h-5 w-5" />, "Condividi", () => (img ? sharePhoto() : notify("Apri prima un'immagine da condividere.")), false],
            [<MoreHorizontal key="m" className="h-5 w-5" />, "Altro", () => setMoreOpen((o) => !o), moreOpen],
          ] as const).map(([ic, l, fn, on]) => (
            <button key={l} onClick={() => { if (l !== "Altro") setMoreOpen(false); (fn as () => void)(); }}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${on ? "text-primary" : "text-muted-foreground"}`}>
              {ic}{l}
            </button>
          ))}
        </nav>
      )}
      {phone && moreOpen && <div className="fixed inset-0 z-40 bg-background/50" onClick={() => setMoreOpen(false)} />}
      <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ""; }} />
      <input ref={multiInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }} />
      <input
        ref={(el) => { folderInput.current = el; el?.setAttribute("webkitdirectory", ""); el?.setAttribute("directory", ""); }}
        type="file" multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }}
      />
      {convOpen && <ConvertDialog current={img?.file ?? null} preview={img?.url ?? null} size={img ? { w: img.w, h: img.h } : null} session={session} visible={visible} onClose={() => setConvOpen(false)} />}
      {printSrc && <PrintDialog src={printSrc} onClose={() => { URL.revokeObjectURL(printSrc); setPrintSrc(null); }} />}
      {topazOpen && <TopazSettings onClose={() => setTopazOpen(false)} />}
      {mailAsk && <MailChoice onClose={() => setMailAsk(false)} onPick={(a) => { setMailAsk(false); mail(a); }} />}
      {waAsk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onClick={() => setWaAsk(false)}>
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-lg font-semibold">Come vuoi usare WhatsApp?</h2>
            <p className="mb-4 text-sm text-muted-foreground">La scelta viene ricordata. La foto viene copiata negli appunti: ti basta incollarla nella chat.</p>
            <div className="flex flex-col gap-2">
              <button className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => { setWaAsk(false); whatsapp("app"); }}>App WhatsApp sul computer</button>
              <button className="rounded bg-secondary px-3 py-2 text-sm hover:bg-accent" onClick={() => { setWaAsk(false); whatsapp("web"); }}>WhatsApp Web nel browser</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ children, last }: { children: ReactNode; last?: boolean }) {
  return <div className={`flex flex-[1_1_auto] items-stretch justify-between gap-px pr-1 ${last ? "" : "mr-0.5 border-r border-border"}`}>{children}</div>;
}

function Tool({ icon, label, onClick, active, tip, wide }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean; tip?: string; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={tip ?? label}
      className={`no-drag flex min-w-[34px] ${wide ? "max-w-[96px]" : "max-w-[64px]"} flex-1 flex-col items-center justify-start gap-0.5 rounded px-0.5 py-0.5 text-[clamp(8px,0.62vw,10.5px)] leading-tight hover:bg-accent ${active ? "bg-accent text-primary" : ""}`}
    >
      <span className="flex h-6 items-center justify-center text-sm [&_svg]:h-[clamp(16px,1.25vw,22px)] [&_svg]:w-[clamp(16px,1.25vw,22px)]">{icon}</span>
      <span className="w-full truncate text-center">{label}</span>
    </button>
  );
}

function ZBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="no-drag rounded px-1 py-0.5 text-[10px] font-semibold leading-none hover:bg-accent">{children}</button>;
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
  const apps = ["Topaz Photo AI", "Topaz Gigapixel AI", "Adobe Photoshop", "Adobe Lightroom", "Adobe Lightroom Classic", "WhatsApp", "LocalSend", "Mail"];
  const [mailMode, setMailMode] = useState(() => localStorage.getItem("loma.mail.mode") || "");
  const [mailUrl, setMailUrl] = useState(() => localStorage.getItem("loma.mail.url") || "");
  const [waMode, setWaMode] = useState(() => localStorage.getItem("loma.wa.mode") || "");
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
            <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
              <label>Email
                <select value={mailMode} onChange={(e) => setMailMode(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2">
                  <option value="">Chiedi al primo clic</option><option value="app">App di posta</option><option value="web">Webmail</option>
                </select>
              </label>
              <label>WhatsApp
                <select value={waMode} onChange={(e) => setWaMode(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2">
                  <option value="">Chiedi al primo clic</option><option value="app">App desktop</option><option value="web">WhatsApp Web</option>
                </select>
              </label>
            </div>
            {mailMode === "web" && (
              <label className="mb-3 block text-sm">Indirizzo webmail
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {WEBMAIL_PRESETS.map((p) => <button type="button" key={p.name} onClick={() => setMailUrl(p.url)} className="rounded bg-secondary px-2 py-1 text-xs hover:bg-accent">{p.name}</button>)}
                </div>
                <input value={mailUrl} onChange={(e) => setMailUrl(e.target.value)} placeholder="https://mail.google.com/..." className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">Annulla</button>
              <button
                onClick={() => {
                  apps.forEach((a) => localStorage.setItem(`loma.topaz.${a}`, vals[a] ?? ""));
                  const set = (k: string, v: string) => (v ? localStorage.setItem(k, v) : localStorage.removeItem(k));
                  set("loma.mail.mode", mailMode); set("loma.mail.url", mailUrl); set("loma.wa.mode", waMode);
                  onClose();
                }}
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

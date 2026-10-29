import { extractRawPreview } from "./raw-preview";

export type CullItem = {
  id: string;
  file: File;
  thumb: string | null;
  rating: number; // 0-5
  locked: boolean; // protected in camera / by user
  flagged: boolean;
};

export const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?|psd|psb|cr2|cr3|nef|arw|dng|orf|rw2|raf|pef|srw|heic|heif)$/i;

const truthy = (v: unknown) =>
  v === true || v === 1 || (typeof v === "string" && /^(1|true|yes|on|protected|locked)$/i.test(v.trim()));

/** Reads in-camera rating, lock/protection and pick flag from parsed metadata. */
export function cullFromMeta(m: any) {
  let rating = 0;
  const r = Number(m.Rating ?? m.CanonRating ?? m.xmpRating ?? (m.RatingPercent != null ? Number(m.RatingPercent) / 20 : 0));
  if (Number.isFinite(r)) rating = Math.max(0, Math.min(5, Math.round(r)));
  let locked = false;
  let flagged = false;
  for (const [k, v] of Object.entries(m)) {
    if (/^(lock|locked|protect|protection|fileprotect|imageprotect|write.?protect)/i.test(k) && truthy(v)) locked = true;
    if (/^(pick|picklabel|flag|flagged)$/i.test(k) && truthy(v)) flagged = true;
  }
  // Canon: ImageProtection / FileProtect / CanonFileInfo protect flag (70D, 1D X, R6).
  for (const k of ["ImageProtection", "FileProtect", "Protect", "ProtectStatus", "CanonProtect"]) {
    const v = m[k];
    if (v != null && v !== 0 && v !== "0" && !/^(off|none|no|unprotected)$/i.test(String(v).trim())) locked = true;
  }
  const attr = Number(m.FileAttributes ?? m.Attributes);
  if (Number.isFinite(attr) && attr & 1) locked = true; // read-only bit (DCF protect)
  const label = String(m.Label ?? "").toLowerCase();
  if (/lock|protect/.test(label)) locked = true;
  if (/select|pick|flag/.test(label)) flagged = true;
  const urg = String(m.Urgency ?? "");
  if (urg === "1") flagged = true;
  return { rating, locked, flagged };
}

const clampR = (n: number) => Math.max(0, Math.min(5, Math.round(n)));

/** Rating/pick from XMP text. Canon writes single quotes (xmp:Rating='3') or element form (<xmp:Rating>3</xmp:Rating>). */
export function scanXmpText(txt: string): { rating: number | null; flagged: boolean } {
  let rating: number | null = null;
  const pats = [
    /\b(?:xmp|xap):Rating\s*=\s*["']\s*(-?\d+)/g,
    /<(?:xmp|xap):Rating>\s*(-?\d+)\s*</g,
  ];
  for (const re of pats) for (const m of txt.matchAll(re)) rating = Math.max(rating ?? 0, Number(m[1]));
  const pct = txt.match(/MicrosoftPhoto:Rating\s*(?:=\s*["']|>)\s*(\d+)/);
  if (pct) rating = Math.max(rating ?? 0, Number(pct[1]) / 20);
  const flagged = /photoshop:Urgency\s*(?:=\s*["']|>)\s*1\b/.test(txt) || /xmpDM:pick\s*(?:=\s*["']|>)\s*1/.test(txt);
  return { rating: rating == null ? null : clampR(rating), flagged };
}

/** TIFF IFD0 at `base`: Rating 0x4746, RatingPercent 0x4749 and XMP pointer 0x02bc. */
export function readIfd0(bytes: Uint8Array, base = 0): { rating: number | null; xmp: { off: number; len: number } | null } {
  const out = { rating: null as number | null, xmp: null as { off: number; len: number } | null };
  if (bytes.length < base + 16) return out;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bo = dv.getUint16(base);
  const le = bo === 0x4949;
  if (!le && bo !== 0x4d4d) return out;
  const ifd = base + dv.getUint32(base + 4, le);
  if (ifd + 2 > bytes.length) return out;
  const n = dv.getUint16(ifd, le);
  for (let i = 0; i < n && ifd + 2 + i * 12 + 12 <= bytes.length; i++) {
    const e = ifd + 2 + i * 12;
    const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le);
    const v16 = () => (type === 3 ? dv.getUint16(e + 8, le) : dv.getUint32(e + 8, le));
    if (tag === 0x4746) out.rating = Math.max(out.rating ?? 0, clampR(v16()));
    else if (tag === 0x4749) out.rating = Math.max(out.rating ?? 0, clampR(v16() / 20));
    else if (tag === 0x02bc) out.xmp = { off: base + dv.getUint32(e + 8, le), len: dv.getUint32(e + 4, le) };
  }
  return out;
}

/** Byte-level culling tags: XMP packet (CR2/CR3/NEF/ARW/DNG/JPEG) + TIFF IFD0 Rating (CR2/NEF/ARW) + CR3 CMT1. */
export function scanCullBytes(bytes: Uint8Array): { rating: number | null; flagged: boolean } {
  const txt = new TextDecoder("latin1").decode(bytes);
  const x = scanXmpText(txt);
  let rating = x.rating;
  const bump = (r: number | null) => { if (r != null) rating = Math.max(rating ?? 0, r); };
  bump(readIfd0(bytes, 0).rating);
  // CR3: IFD0 lives inside the "CMT1" box of the Canon uuid in moov.
  const cmt = txt.indexOf("CMT1");
  if (cmt > 0) bump(readIfd0(bytes, cmt + 4).rating);
  return { rating, flagged: x.flagged };
}

async function fileReadOnly(file: File): Promise<boolean> {
  const desk = (globalThis as any).lomaDesktop;
  const path = (file as any).lomaPath || desk?.getPathForFile?.(file);
  if (!path || !desk?.isReadOnly) return false;
  try { return !!(await desk.isReadOnly(path)); } catch { return false; }
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** Stars / pick / protection only (no thumbnails): direct byte read, never blocked by exifr. */
export async function readCullTags(file: File, opts: { light?: boolean } = {}): Promise<{ rating: number; locked: boolean; flagged: boolean }> {
  let rating = 0, flagged = false, locked = false;
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, (opts.light ? 1 : 4) * 1024 * 1024)).arrayBuffer());
    const b = scanCullBytes(head);
    if (b.rating != null) rating = b.rating;
    flagged = b.flagged;
    const merge = (t: string) => {
      const x = scanXmpText(t);
      if (x.rating != null) rating = Math.max(rating, x.rating);
      if (x.flagged) flagged = true;
      return x.rating != null;
    };
    // CR2/TIFF: XMP packet may sit beyond the first 4 MB → read exactly that block.
    const ptr = readIfd0(head, 0).xmp;
    let found = b.rating != null;
    if (ptr && ptr.len > 0 && ptr.len < 2 * 1024 * 1024 && ptr.off + ptr.len > head.length && ptr.off < file.size) {
      found = merge(new TextDecoder("latin1").decode(await file.slice(ptr.off, ptr.off + ptr.len).arrayBuffer())) || found;
    }
    // Still nothing: XMP often sits at the end (DNG/NEF/ARW edited) or deeper in the header → tail + chunked header scan up to 24 MB.
    if (!found && file.size > head.length) {
      const tailFrom = Math.max(head.length, file.size - (opts.light ? 64 : 1024) * 1024);
      found = merge(new TextDecoder("latin1").decode(await file.slice(tailFrom).arrayBuffer()));
      const CH = 4 * 1024 * 1024, OV = 4096, limit = Math.min(tailFrom, (opts.light ? 1 : 24) * 1024 * 1024);
      for (let o = head.length - OV; !found && o < limit; o += CH) {
        found = merge(new TextDecoder("latin1").decode(await file.slice(o, Math.min(o + CH + OV, limit)).arrayBuffer()));
      }
    }
  } catch { /* unreadable */ }
  locked = await fileReadOnly(file);
  return { rating, locked, flagged };
}

/** Fast read: embedded JPEG preview + culling tags, no demosaicing. */
export async function readCull(file: File, opts: { light?: boolean } = {}): Promise<Omit<CullItem, "id" | "file">> {
  // light (mobile): tags were already read in pass 1 and the full metadata parse is skipped — thumbnail only.
  const tags = opts.light ? { rating: 0, locked: false, flagged: false } : await readCullTags(file);
  const exifr = (await import("exifr")).default;
  const meta = opts.light ? {} : ((await withTimeout(
    exifr.parse(file, { tiff: true, exif: true, iptc: true, xmp: true, makerNote: true, mergeOutput: true }), 4000,
  )) ?? {}) as Record<string, any>;
  let thumb: string | null = null;
  // Grid/filmstrip: small embedded thumbnail first (fast); full-size preview only as fallback.
  const th = await withTimeout(exifr.thumbnail(file), 4000);
  if (th) thumb = URL.createObjectURL(new Blob([th as BlobPart], { type: "image/jpeg" }));
  if (!thumb && /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|orf|rw2|raf|pef|srw|3fr|iiq|erf|kdc|tiff?)$/i.test(file.name)) {
    const p = await withTimeout(extractRawPreview(file, { deep: false }), 8000);
    if (p) thumb = URL.createObjectURL(p);
  }
  if (!thumb && /\.(tiff?|psd|psb)$/i.test(file.name)) {
    const { decodeExtra } = await import("./decode-extra");
    const d = await withTimeout(decodeExtra(file), 15000);
    if (d) thumb = URL.createObjectURL(d);
  }
  if (!thumb && /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) thumb = URL.createObjectURL(file);
  const base = cullFromMeta(meta);
  return {
    thumb,
    rating: Math.max(base.rating, tags.rating),
    locked: base.locked || tags.locked,
    flagged: base.flagged || tags.flagged,
  };
}

export type CullFilter = { kind: "all" | "locked" | "flagged"; minStars: number };

export const applyFilter = (items: CullItem[], f: CullFilter) =>
  items.filter(
    (i) => (f.kind === "all" || (f.kind === "locked" ? i.locked : i.flagged)) && i.rating >= f.minStars,
  );

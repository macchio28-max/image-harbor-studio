import { extractRawPreview } from "./raw-preview";

export type CullItem = {
  id: string;
  file: File;
  thumb: string | null;
  rating: number; // 0-5
  locked: boolean; // protected in camera / by user
  flagged: boolean;
};

export const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|avif|tiff?|cr2|cr3|nef|arw|dng|orf|rw2|raf|pef|srw|heic|heif)$/i;

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

/** Byte-level culling tags: XMP packet (CR3/NEF/ARW/DNG) + TIFF IFD0 Rating 0x4746 (CR2/NEF/ARW). */
export function scanCullBytes(bytes: Uint8Array): { rating: number | null; flagged: boolean } {
  let rating: number | null = null;
  let flagged = false;
  const txt = new TextDecoder("latin1").decode(bytes);
  const m = txt.match(/xmp:Rating(?:="|>)\s*(-?\d+)/);
  if (m) rating = Number(m[1]);
  if (/photoshop:Urgency(?:="|>)\s*1\b/.test(txt) || /xmpDM:pick(?:="|>)\s*1/.test(txt)) flagged = true;
  if (rating == null && bytes.length > 16) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const bo = dv.getUint16(0);
    const le = bo === 0x4949;
    if (le || bo === 0x4d4d) {
      const ifd = dv.getUint32(4, le);
      if (ifd + 2 < bytes.length) {
        const n = dv.getUint16(ifd, le);
        for (let i = 0; i < n && ifd + 2 + i * 12 + 12 <= bytes.length; i++) {
          const e = ifd + 2 + i * 12;
          const tag = dv.getUint16(e, le);
          if (tag === 0x4746) { rating = dv.getUint16(e + 8, le); break; }
          if (tag === 0x4749) rating = Math.round(dv.getUint16(e + 8, le) / 20);
        }
      }
    }
  }
  if (rating != null) rating = Math.max(0, Math.min(5, rating < 0 ? 0 : rating));
  return { rating, flagged };
}

async function fileReadOnly(file: File): Promise<boolean> {
  const desk = (globalThis as any).lomaDesktop;
  const path = (file as any).lomaPath || desk?.getPathForFile?.(file);
  if (!path || !desk?.isReadOnly) return false;
  try { return !!(await desk.isReadOnly(path)); } catch { return false; }
}

/** Fast read: embedded JPEG preview + culling tags, no demosaicing. */
export async function readCull(file: File): Promise<Omit<CullItem, "id" | "file">> {
  const exifr = (await import("exifr")).default;
  let meta: Record<string, any> = {};
  try {
    meta = (await exifr.parse(file, { tiff: true, exif: true, iptc: true, xmp: true, makerNote: true, mergeOutput: true })) ?? {};
  } catch { /* none */ }
  let thumb: string | null = null;
  // Grid/filmstrip: small embedded thumbnail first (fast); full-size preview only as fallback.
  try {
    const th = await exifr.thumbnail(file);
    if (th) thumb = URL.createObjectURL(new Blob([th as BlobPart], { type: "image/jpeg" }));
  } catch { /* none */ }
  if (!thumb && /\.(cr2|cr3|nef|nrw|arw|srf|sr2|dng|orf|rw2|raf|pef|srw|3fr|iiq|erf|kdc|tiff?)$/i.test(file.name)) {
    const p = await extractRawPreview(file, { deep: false });
    if (p) thumb = URL.createObjectURL(p);
  }
  if (!thumb && /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) thumb = URL.createObjectURL(file);
  const base = cullFromMeta(meta);
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, 4 * 1024 * 1024)).arrayBuffer());
    const b = scanCullBytes(head);
    if (b.rating != null && b.rating > base.rating) base.rating = b.rating;
    if (b.flagged) base.flagged = true;
  } catch { /* unreadable */ }
  if (!base.locked && (await fileReadOnly(file))) base.locked = true;
  return { thumb, ...base };
}

export type CullFilter = { kind: "all" | "locked" | "flagged"; minStars: number };

export const applyFilter = (items: CullItem[], f: CullFilter) =>
  items.filter(
    (i) => (f.kind === "all" || (f.kind === "locked" ? i.locked : i.flagged)) && i.rating >= f.minStars,
  );

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
export function cullFromMeta(m: Record<string, any>) {
  let rating = 0;
  const r = Number(m.Rating ?? m["xmp:Rating"] ?? m.RatingPercent != null ? m.Rating ?? Math.round((m.RatingPercent ?? 0) / 20) : 0);
  if (Number.isFinite(r)) rating = Math.max(0, Math.min(5, Math.round(r)));
  let locked = false;
  let flagged = false;
  for (const [k, v] of Object.entries(m)) {
    if (/^(lock|locked|protect|protection|fileprotect|imageprotect|write.?protect)/i.test(k) && truthy(v)) locked = true;
    if (/^(pick|picklabel|flag|flagged)$/i.test(k) && truthy(v)) flagged = true;
  }
  const label = String(m.Label ?? "").toLowerCase();
  if (/lock|protect/.test(label)) locked = true;
  if (/select|pick|flag/.test(label)) flagged = true;
  const urg = String(m.Urgency ?? "");
  if (urg === "1") flagged = true;
  return { rating, locked, flagged };
}

/** Fast read: embedded JPEG preview + culling tags, no demosaicing. */
export async function readCull(file: File): Promise<Omit<CullItem, "id" | "file">> {
  const exifr = (await import("exifr")).default;
  let meta: Record<string, any> = {};
  try {
    meta = (await exifr.parse(file, { tiff: true, exif: true, iptc: true, xmp: true, makerNote: false, mergeOutput: true })) ?? {};
  } catch { /* none */ }
  let thumb: string | null = null;
  try {
    const th = await exifr.thumbnail(file);
    if (th) thumb = URL.createObjectURL(new Blob([th as BlobPart], { type: "image/jpeg" }));
  } catch { /* none */ }
  if (!thumb && /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) thumb = URL.createObjectURL(file);
  return { thumb, ...cullFromMeta(meta) };
}

export type CullFilter = { kind: "all" | "locked" | "flagged"; minStars: number };

export const applyFilter = (items: CullItem[], f: CullFilter) =>
  items.filter(
    (i) => (f.kind === "all" || (f.kind === "locked" ? i.locked : i.flagged)) && i.rating >= f.minStars,
  );

// Pure format conversion: decodes source pixels (or the full-size RAW preview) and re-encodes them.
export type Fmt = "jpeg" | "png" | "webp" | "tiff" | "bmp" | "gif";
export type ConvOpts = { fmt: Fmt; quality: number; lossless: boolean; alpha: boolean; scale: number; keepMeta: boolean };
export const EXT: Record<Fmt, string> = { jpeg: "jpg", png: "png", webp: "webp", tiff: "tif", bmp: "bmp", gif: "gif" };
const RAWLIKE = /\.(tiff?|cr2|cr3|crw|nef|nrw|arw|dng|orf|rw2|raf|pef|srw|heic|heif)$/i;

export async function decodeSource(file: File): Promise<ImageBitmap> {
  if (RAWLIKE.test(file.name)) {
    try { return await createImageBitmap(file); } catch { /* use embedded preview */ }
    const { extractRawPreview } = await import("./raw-preview");
    const p = await extractRawPreview(file);
    if (p) return createImageBitmap(p);
    throw new Error("Anteprima RAW non trovata");
  }
  return createImageBitmap(file);
}

/** Output size for a scale factor (integer pixels, at least 1). */
export const scaledSize = (w: number, h: number, s: number) => ({ w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) });

function bmp(d: ImageData): Blob {
  const { width: w, height: h, data } = d, row = (w * 3 + 3) & ~3, size = 54 + row * h;
  const b = new ArrayBuffer(size), v = new DataView(b), u = new Uint8Array(b);
  u[0] = 0x42; u[1] = 0x4d; v.setUint32(2, size, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * h, true);
  for (let y = 0; y < h; y++) {
    let o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; u[o++] = data[i + 2]; u[o++] = data[i + 1]; u[o++] = data[i]; }
  }
  return new Blob([b], { type: "image/bmp" });
}

function tiff(d: ImageData, alpha: boolean): Blob {
  const { width: w, height: h, data } = d, spp = alpha ? 4 : 3, px = w * h * spp;
  const tags: [number, number, number, number][] = []; // tag, type, count, value
  const n = alpha ? 12 : 11, ifd = 8, bpsOff = ifd + 2 + n * 12 + 4, dataOff = bpsOff + spp * 2;
  tags.push([256, 4, 1, w], [257, 4, 1, h], [258, 3, spp, bpsOff], [259, 3, 1, 1], [262, 3, 1, 2],
    [273, 4, 1, dataOff], [277, 3, 1, spp], [278, 4, 1, h], [279, 4, 1, px], [284, 3, 1, 1], [296, 3, 1, 1]);
  if (alpha) tags.push([338, 3, 1, 2]);
  tags.sort((a, b) => a[0] - b[0]);
  const b = new ArrayBuffer(dataOff + px), v = new DataView(b), u = new Uint8Array(b);
  u[0] = 0x49; u[1] = 0x49; v.setUint16(2, 42, true); v.setUint32(4, ifd, true); v.setUint16(ifd, n, true);
  tags.forEach(([t, ty, c, val], k) => {
    const o = ifd + 2 + k * 12; v.setUint16(o, t, true); v.setUint16(o + 2, ty, true); v.setUint32(o + 4, c, true);
    if (ty === 3 && c === 1) v.setUint16(o + 8, val, true); else v.setUint32(o + 8, val, true);
  });
  for (let k = 0; k < spp; k++) v.setUint16(bpsOff + k * 2, 8, true);
  let o = dataOff;
  for (let i = 0; i < data.length; i += 4) { u[o++] = data[i]; u[o++] = data[i + 1]; u[o++] = data[i + 2]; if (alpha) u[o++] = data[i + 3]; }
  return new Blob([b], { type: "image/tiff" });
}

async function gif(d: ImageData): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const pal = quantize(d.data, 256, { format: "rgba4444" });
  const idx = applyPalette(d.data, pal, "rgba4444");
  const g = GIFEncoder(); g.writeFrame(idx, d.width, d.height, { palette: pal, transparent: pal.some((c: number[]) => c[3] === 0) }); g.finish();
  return new Blob([g.bytes() as BlobPart], { type: "image/gif" });
}

/** Copies Exif/XMP/ICC APP segments from a source JPEG into a freshly encoded JPEG. */
export function graftJpegMeta(src: Uint8Array, out: Uint8Array): Uint8Array {
  if (src[0] !== 0xff || src[1] !== 0xd8 || out[0] !== 0xff || out[1] !== 0xd8) return out;
  const segs: Uint8Array[] = [];
  for (let i = 2; i + 4 < src.length && src[i] === 0xff;) {
    const m = src[i + 1], len = (src[i + 2] << 8) | src[i + 3];
    if (m === 0xda) break;
    if (m === 0xe1 || m === 0xe2) segs.push(src.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  let p = 2; // skip encoder's own APP0 (JFIF)
  if (out[2] === 0xff && out[3] === 0xe0) p = 4 + ((out[4] << 8) | out[5]);
  const total = 2 + segs.reduce((s, x) => s + x.length, 0) + out.length - p;
  const r = new Uint8Array(total); r[0] = 0xff; r[1] = 0xd8;
  let o = 2; for (const s of segs) { r.set(s, o); o += s.length; }
  r.set(out.subarray(p), o);
  return r;
}

export async function convertFile(file: File, o: ConvOpts): Promise<Blob> {
  const bm = await decodeSource(file);
  const { w, h } = scaledSize(bm.width, bm.height, o.scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const opaque = o.fmt === "jpeg" || o.fmt === "bmp" || !o.alpha;
  if (opaque) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = "high"; ctx.drawImage(bm, 0, 0, w, h); bm.close();
  const enc = (type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), type, q));
  let out: Blob;
  if (o.fmt === "jpeg") out = await enc("image/jpeg", o.quality / 100);
  else if (o.fmt === "png") out = await enc("image/png");
  else if (o.fmt === "webp") {
    out = await enc("image/webp", o.lossless ? 1 : o.quality / 100);
    if (out.type !== "image/webp") throw new Error("WebP non supportato da questo browser");
  } else {
    const d = ctx.getImageData(0, 0, w, h);
    out = o.fmt === "bmp" ? bmp(d) : o.fmt === "tiff" ? tiff(d, !opaque) : await gif(d);
  }
  if (o.keepMeta && o.fmt === "jpeg" && /\.jpe?g$/i.test(file.name)) {
    const g = graftJpegMeta(new Uint8Array(await file.arrayBuffer()), new Uint8Array(await out.arrayBuffer()));
    out = new Blob([g as BlobPart], { type: "image/jpeg" });
  }
  return out;
}

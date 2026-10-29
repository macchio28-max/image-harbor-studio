// Decodes formats browsers can't display natively (TIFF, PSD/PSB) into a PNG/JPEG Blob.
export const EXTRA_RE = /\.(tiff?|psd|psb)$/i;

const toBlob = (c: HTMLCanvasElement, type = "image/png", q?: number) =>
  new Promise<Blob | null>((r) => c.toBlob(r, type, q));

async function decodeTiff(file: File): Promise<Blob | null> {
  const UTIF = (await import("utif2")).default as any;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  // Largest page (skip thumbnails).
  let best: any = null;
  for (const ifd of ifds) {
    try { UTIF.decodeImage(buf, ifd, ifds); } catch { continue; }
    if (!best || ifd.width * ifd.height > best.width * best.height) best = ifd;
  }
  if (!best?.width) return null;
  const rgba = UTIF.toRGBA8(best) as Uint8Array;
  const c = document.createElement("canvas"); c.width = best.width; c.height = best.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), best.width, best.height), 0, 0);
  return toBlob(c);
}

async function decodePsd(file: File): Promise<Blob | null> {
  const { readPsd } = await import("ag-psd");
  const psd = readPsd(await file.arrayBuffer(), { skipLayerImageData: true, skipThumbnail: false });
  const c = psd.canvas as HTMLCanvasElement | undefined;
  if (c) return toBlob(c);
  const t = psd.imageResources?.thumbnail as HTMLCanvasElement | undefined;
  return t ? toBlob(t, "image/jpeg", 0.9) : null;
}

/** Returns a displayable Blob, or null if the file isn't an extra format / can't be decoded. */
export async function decodeExtra(file: File): Promise<Blob | null> {
  if (!EXTRA_RE.test(file.name)) return null;
  try {
    return /\.psb?$/i.test(file.name) || /\.psd$/i.test(file.name) ? await decodePsd(file) : await decodeTiff(file);
  } catch (e) { console.warn("decodeExtra", e); return null; }
}

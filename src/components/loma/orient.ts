/** Bakes rotation/flip into real pixels so crop, copy and export always see the upright photo. */
export function orientCanvas(src: CanvasImageSource, w: number, h: number, deg: number, flipH = false, flipV = false) {
  const r = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  const swap = r === 90 || r === 270;
  const c = document.createElement("canvas");
  c.width = swap ? h : w; c.height = swap ? w : h;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  return c;
}

/** EXIF Orientation (1-8) → rotation degrees + horizontal flip. */
export function exifToTransform(o: number): { deg: number; flipH: boolean } {
  switch (o) {
    case 2: return { deg: 0, flipH: true };
    case 3: return { deg: 180, flipH: false };
    case 4: return { deg: 180, flipH: true };
    case 5: return { deg: 90, flipH: true };
    case 6: return { deg: 90, flipH: false };
    case 7: return { deg: 270, flipH: true };
    case 8: return { deg: 270, flipH: false };
    default: return { deg: 0, flipH: false };
  }
}

export const canvasBlob = (c: HTMLCanvasElement, type = "image/jpeg", q = 0.96) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("orient"))), type, q));

/** Rotates a decoded RAW preview according to the RAW header's Orientation tag. */
export async function uprightBlob(blob: Blob, orientation: number): Promise<Blob> {
  const t = exifToTransform(orientation);
  if (!t.deg && !t.flipH) return blob;
  const bmp = await createImageBitmap(blob, { imageOrientation: "none" } as ImageBitmapOptions);
  const c = orientCanvas(bmp, bmp.width, bmp.height, t.deg, t.flipH);
  bmp.close();
  return canvasBlob(c);
}

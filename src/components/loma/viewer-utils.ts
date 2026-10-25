import { type Adjust, defaultAdjust, developCanvas } from "./develop";
export { type Adjust, defaultAdjust };

/** Redraws pixels on a blank canvas: output carries no EXIF/IPTC/XMP/C2PA/AI chunks. */
export async function renderClean(
  img: HTMLImageElement,
  adjust: Adjust,
  crop: { x: number; y: number; w: number; h: number } | null,
  type: "image/png" | "image/jpeg" | "image/webp" = "image/png",
): Promise<Blob> {
  const sx = crop?.x ?? 0, sy = crop?.y ?? 0;
  const sw = Math.round(crop?.w ?? img.naturalWidth), sh = Math.round(crop?.h ?? img.naturalHeight);
  const src = document.createElement("canvas");
  src.width = sw; src.height = sh;
  src.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const dev = developCanvas(src, sw, sh, adjust, 1).canvas;
  const ang = ((adjust.rotation + adjust.straighten) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(ang)), sin = Math.abs(Math.sin(ang));
  const c = document.createElement("canvas");
  c.width = Math.round(sw * cos + sh * sin);
  c.height = Math.round(sw * sin + sh * cos);
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(ang);
  if (adjust.flipH) ctx.scale(-1, 1);
  ctx.drawImage(dev, -sw / 2, -sh / 2);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("export"))), type, 0.95));
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const baseName = (n: string) => n.replace(/\.[^.]+$/, "");

export function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(2)} MB`;
}

export function exposure(t?: number) {
  if (!t) return undefined;
  return t >= 1 ? `${t} s` : `1/${Math.round(1 / t)} s`;
}

export function nativeScreenSize() {
  const dpr = window.devicePixelRatio || 1;
  return { w: Math.round(window.screen.width * dpr), h: Math.round(window.screen.height * dpr), dpr };
}

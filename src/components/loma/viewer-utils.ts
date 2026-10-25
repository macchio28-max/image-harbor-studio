export type Adjust = { brightness: number; contrast: number; saturation: number; rotation: number; flipH: boolean };
export const defaultAdjust: Adjust = { brightness: 100, contrast: 100, saturation: 100, rotation: 0, flipH: false };

export const filterOf = (a: Adjust) =>
  `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%)`;

/** Redraws pixels on a blank canvas: output carries no EXIF/IPTC/XMP/C2PA/AI chunks. */
export async function renderClean(
  img: HTMLImageElement,
  adjust: Adjust,
  crop: { x: number; y: number; w: number; h: number } | null,
  type: "image/png" | "image/jpeg" | "image/webp" = "image/png",
): Promise<Blob> {
  const sx = crop?.x ?? 0, sy = crop?.y ?? 0;
  const sw = crop?.w ?? img.naturalWidth, sh = crop?.h ?? img.naturalHeight;
  const rot = ((adjust.rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const c = document.createElement("canvas");
  c.width = swap ? sh : sw;
  c.height = swap ? sw : sh;
  const ctx = c.getContext("2d")!;
  ctx.filter = filterOf(adjust);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  if (adjust.flipH) ctx.scale(-1, 1);
  ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
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

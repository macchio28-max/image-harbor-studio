// @ts-nocheck -- hot pixel loops: typed-array indexing under noUncheckedIndexedAccess; covered by detail-ai.test.ts
/**
 * Dettaglio AI: profili locali ispirati a SwinIR (Ritratto), Real-ESRGAN (Nature) e BSRGAN (Denoise).
 * Sono filtri adattivi client-side (guided filter, maschera pelle, nitidezza multi-scala con anti-alone),
 * non reti neurali: funzionano su qualsiasi file aperto e sono identici in anteprima ed esportazione.
 */
export type SrProfile = "standard" | "nature" | "portrait";

function luma(px: Uint8ClampedArray, N: number) {
  const Y = new Float32Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) Y[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
  return Y;
}

export function box(a: Float32Array, w: number, h: number, r: number) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length), d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = 0;
    for (let k = -r; k <= r; k++) s += a[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) { t[row + x] = s / d; s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += t[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) { o[y * w + x] = s / d; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
  }
  return o;
}

/** Adds a luma delta to RGB, limited to the 3×3 neighbourhood range (+margin) so edges never get halos. */
function applyDelta(px: Uint8ClampedArray, Y: Float32Array, D: Float32Array, w: number, h: number, margin = 4) {
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0, y1 = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, d = D[i];
      if (d === 0) continue;
      const x0 = x > 0 ? x - 1 : 0, x1 = x < w - 1 ? x + 1 : x;
      let mn = 255, mx = 0;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const v = Y[yy * w + xx]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const t = Math.min(mx + margin, Math.max(mn - margin, Y[i] + d)) - Y[i];
      const j = i * 4; px[j] += t; px[j + 1] += t; px[j + 2] += t;
    }
  }
}

/** Soft skin likelihood from YCbCr chroma (0..1). */
function skinMap(px: Uint8ClampedArray, N: number) {
  const m = new Float32Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const r = px[j], g = px[j + 1], b = px[j + 2];
    const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
    const dcb = (cb - 108) / 22, dcr = (cr - 152) / 20;
    const d = dcb * dcb + dcr * dcr;
    m[i] = d < 1 ? 1 : d < 2.2 ? (2.2 - d) / 1.2 : 0;
  }
  return m;
}

/** Ritratto AI: pelle naturale (levigatura del micro-rumore che preserva i pori) e micro-nitidezza di occhi/ciglia. */
export function portraitPass(px: Uint8ClampedArray, w: number, h: number, skin: number, eyes: number, rs = 1) {
  if (skin <= 0 && eyes <= 0) return;
  const N = w * h, Y = luma(px, N), S = box(skinMap(px, N), w, h, Math.max(1, Math.round(2 * rs)));
  const r1 = Math.max(1, Math.round(rs)), r2 = Math.max(2, Math.round(3 * rs));
  const B1 = box(Y, w, h, r1), B2 = box(box(Y, w, h, r2), w, h, r2);
  const D = new Float32Array(N), ks = (skin / 100) * 1.5, ke = (eyes / 100) * 3.2;
  for (let i = 0; i < N; i++) {
    const s = S[i], mid = Y[i] - B2[i], fine = Y[i] - B1[i];
    // smooth only low-amplitude blotches; strong transitions (eyes, lips, hair) are kept
    const gate = 1 / (1 + (mid * mid) / 440);
    let d = -s * ks * gate * (mid - fine * 0.45);
    // micro-sharpness on non-skin detail (eyes, lashes, brows, hair)
    d += (1 - s * 0.85) * ke * fine * Math.min(1, Math.abs(fine) / 3);
    D[i] = d;
  }
  applyDelta(px, Y, D, w, h, 7);
}

/** Nature AI: rinforzo multi-scala di piume, pelo e texture organiche, guidato dalla trama locale. */
export function naturePass(px: Uint8ClampedArray, w: number, h: number, amount: number, rs = 1) {
  if (amount <= 0) return;
  const N = w * h, Y = luma(px, N);
  const r1 = Math.max(1, Math.round(rs)), r2 = Math.max(2, Math.round(2.5 * rs));
  const B1 = box(Y, w, h, r1), B2 = box(B1, w, h, r2);
  const V = box(Y.map((v, i) => (v - B2[i]) * (v - B2[i])), w, h, r2);
  const D = new Float32Array(N), k = (amount / 100) * 3.6;
  for (let i = 0; i < N; i++) {
    const tex = Math.min(1, Math.sqrt(V[i]) / 6); // flat skies/bokeh stay clean
    D[i] = k * tex * ((Y[i] - B1[i]) * 1.0 + (B1[i] - B2[i]) * 0.55);
  }
  applyDelta(px, Y, D, w, h, 10);
}

/** Denoise AI: guided filter sulla luminanza + pulizia cromatica larga, con preservazione delle linee reali. */
export function cleanPass(px: Uint8ClampedArray, w: number, h: number, strength: number, detail = 50) {
  if (strength <= 0) return;
  const N = w * h, s = strength / 100;
  const Y = new Float32Array(N), Cb = new Float32Array(N), Cr = new Float32Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const r = px[j], g = px[j + 1], b = px[j + 2];
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b; Cb[i] = -0.1687 * r - 0.3313 * g + 0.5 * b; Cr[i] = 0.5 * r - 0.4187 * g - 0.0813 * b;
  }
  const r = s > 0.6 ? 5 : s > 0.3 ? 3 : 2, eps = (3 + s * 44) ** 2;
  const mI = box(Y, w, h, r), mII = box(Y.map((v) => v * v), w, h, r);
  const A = new Float32Array(N), Bv = new Float32Array(N);
  for (let i = 0; i < N; i++) { const v = mII[i] - mI[i] * mI[i], a = v / (v + eps); A[i] = a; Bv[i] = mI[i] - a * mI[i]; }
  const mA = box(A, w, h, r), mB = box(Bv, w, h, r);
  const keep = (detail / 100) * 0.4;
  const cr = 2 + Math.round(s * 8), cbB = box(box(Cb, w, h, cr), w, h, cr), crB = box(box(Cr, w, h, cr), w, h, cr);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const q = mA[i] * Y[i] + mB[i];
    const y = Y[i] + (q - Y[i]) * s * (1 - keep);
    const cb = Cb[i] + (cbB[i] - Cb[i]) * Math.min(1, s * 2), c2 = Cr[i] + (crB[i] - Cr[i]) * Math.min(1, s * 2);
    px[j] = y + 1.402 * c2; px[j + 1] = y - 0.34414 * cb - 0.71414 * c2; px[j + 2] = y + 1.772 * cb;
  }
}

/** Max output pixels for Super Risoluzione (memory safety on phones/WebViews). */
export const SR_MAX_PIXELS = 100_000_000;
export function srScaleFor(w: number, h: number, scale: number) {
  let s = scale;
  while (s > 1 && w * h * s * s > SR_MAX_PIXELS) s /= 2;
  return s;
}

/** Restores detail on upscaled pixels with the chosen profile. rs = upscale factor. */
export function srRestore(img: ImageData, profile: SrProfile, rs: number) {
  const { data, width: w, height: h } = img;
  if (profile === "nature") naturePass(data, w, h, 70, rs * 0.7);
  else if (profile === "portrait") portraitPass(data, w, h, 35, 55, rs * 0.7);
  else naturePass(data, w, h, 40, rs * 0.6);
}

/** Super Risoluzione: upscale ad alta qualità + ricostruzione del dettaglio per profilo. */
export function superResolve(src: HTMLCanvasElement, scale: number, profile: SrProfile): { canvas: HTMLCanvasElement; scale: number } {
  const s = srScaleFor(src.width, src.height, scale);
  if (s <= 1) return { canvas: src, scale: 1 };
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  // two-step upscale is smoother than a single big jump
  if (s === 4) {
    const m = document.createElement("canvas"); m.width = src.width * 2; m.height = src.height * 2;
    const mc = m.getContext("2d")!; mc.imageSmoothingQuality = "high"; mc.drawImage(src, 0, 0, m.width, m.height);
    ctx.drawImage(m, 0, 0, c.width, c.height);
  } else ctx.drawImage(src, 0, 0, c.width, c.height);
  // process in horizontal bands to bound memory
  const band = Math.max(64, Math.floor(16_000_000 / c.width)), pad = 8;
  for (let y = 0; y < c.height; y += band) {
    const y0 = Math.max(0, y - pad), y1 = Math.min(c.height, y + band + pad);
    const img = ctx.getImageData(0, y0, c.width, y1 - y0);
    srRestore(img, profile, s);
    const top = y - y0, hh = Math.min(band, c.height - y);
    ctx.putImageData(img, 0, y0, 0, top, c.width, hh);
  }
  return { canvas: c, scale: s };
}

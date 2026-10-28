// Non-destructive photo development pipeline (pixel-level, canvas based).
export const HSL_CH = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"] as const;
export type HslCh = (typeof HSL_CH)[number];
const HUE_CENTER: Record<HslCh, number> = { red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 240, purple: 280, magenta: 320 };
export type Hsl = { h: number; s: number; l: number };
export type Tone = { h: number; a: number };
export type WbMode = "asShot" | "auto" | "daylight" | "cloudy" | "shade" | "tungsten" | "fluorescent" | "flash" | "custom";
export type Curve = "linear" | "standard" | "high";

export type Adjust = {
  rotation: number; flipH: boolean; flipV: boolean; straighten: number;
  vibrance: number; texture: number;
  /** Master RGB curve control points (x,y in 0..1), sorted by x. */
  curvePts: [number, number][];
  /** Levels: input black/white (0..255) and midtone gamma. */
  lvBlack: number; lvWhite: number; lvGamma: number;
  curve: Curve;
  wbMode: WbMode; kelvin: number; tint: number;
  exposure: number; contrast: number; brightness: number; saturation: number;
  highlight: number; shadow: number; white: number; black: number;
  clarity: number; structure: number; dehaze: number;
  layerOpacity: number;
  vigAmount: number; vigMethod: "elliptic" | "circular";
  cbShadows: Tone; cbMid: Tone; cbHigh: Tone;
  hsl: Record<HslCh, Hsl>;
  sharpAmount: number; sharpRadius: number;
  nrLum: number; nrColor: number;
};

const zeroHsl = () => Object.fromEntries(HSL_CH.map((c) => [c, { h: 0, s: 0, l: 0 }])) as Record<HslCh, Hsl>;

export const defaultAdjust: Adjust = {
  rotation: 0, flipH: false, flipV: false, straighten: 0, curve: "linear",
  vibrance: 0, texture: 0, curvePts: [[0, 0], [1, 1]], lvBlack: 0, lvWhite: 255, lvGamma: 1,
  wbMode: "asShot", kelvin: 5500, tint: 0,
  exposure: 0, contrast: 0, brightness: 0, saturation: 0,
  highlight: 0, shadow: 0, white: 0, black: 0,
  clarity: 0, structure: 0, dehaze: 0, layerOpacity: 100,
  vigAmount: 0, vigMethod: "elliptic",
  cbShadows: { h: 0, a: 0 }, cbMid: { h: 0, a: 0 }, cbHigh: { h: 0, a: 0 },
  hsl: zeroHsl(),
  sharpAmount: 0, sharpRadius: 1, nrLum: 0, nrColor: 0,
};

export const WB_PRESETS: Record<Exclude<WbMode, "auto" | "custom">, number> = {
  asShot: 5500, daylight: 5500, cloudy: 6500, shade: 7500, tungsten: 3200, fluorescent: 4000, flash: 5500,
};

export const PRESETS: { name: string; set: Partial<Adjust> }[] = [
  { name: "Bianco e nero", set: { saturation: -100, contrast: 15, curve: "standard" } },
  { name: "Vivido", set: { saturation: 30, contrast: 20, clarity: 15, curve: "high" } },
  { name: "Caldo", set: { kelvin: 6800, wbMode: "custom", tint: 5 } },
  { name: "Freddo", set: { kelvin: 4300, wbMode: "custom", tint: -3 } },
  { name: "Opaco", set: { contrast: -25, black: 30, saturation: -15 } },
  { name: "Ritratto morbido", set: { clarity: -20, highlight: -20, shadow: 15, nrLum: 20 } },
  { name: "Paesaggio", set: { dehaze: 25, clarity: 25, saturation: 15, highlight: -30, shadow: 20 } },
];

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function hueRgb(h: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** Tone LUT for brightness, contrast and base curve. */
function toneLut(a: Adjust) {
  const N = 1024, lut = new Float32Array(N + 1);
  const g = 1 / (1 + (a.brightness / 100) * 0.7);
  const c = Math.pow(2, a.contrast / 100);
  const curveK = a.curve === "standard" ? 0.25 : a.curve === "high" ? 0.5 : 0;
  for (let i = 0; i <= N; i++) {
    let v = i / N;
    v = Math.pow(v, g);
    if (curveK) v = v + curveK * (v - 0.5) * (1 - Math.abs(2 * v - 1)) * 0.9 * 2 * 0.5;
    // Contrast as an S-curve around mid grey (no hard clipping of whites/blacks).
    if (c !== 1) { const k = c; v = v < 0.5 ? 0.5 * Math.pow(2 * v, k) : 1 - 0.5 * Math.pow(2 * (1 - v), k); }
    lut[i] = clamp01(v);
  }
  const lb = a.lvBlack / 255, lw = Math.max(lb + 0.01, a.lvWhite / 255), lg = 1 / Math.max(0.1, a.lvGamma);
  const pts = a.curvePts ?? [[0, 0], [1, 1]];
  const curveOn = !(pts.length === 2 && pts[0]![0] === 0 && pts[0]![1] === 0 && pts[1]![0] === 1 && pts[1]![1] === 1);
  const spline = curveOn ? monotoneSpline(pts) : null;
  if (lb !== 0 || lw !== 1 || lg !== 1 || spline) {
    for (let i = 0; i <= N; i++) {
      let v = lut[i]!;
      v = Math.pow(clamp01((v - lb) / (lw - lb)), lg);
      if (spline) v = spline(v);
      lut[i] = clamp01(v);
    }
  }
  return lut;
}

/** Monotone cubic (Fritsch–Carlson) interpolation through curve points: smooth, never overshoots. */
export function monotoneSpline(p0: [number, number][]) {
  const p = [...p0].sort((a, b) => a[0] - b[0]);
  const n = p.length, xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / Math.max(1e-6, xs[i + 1]! - xs[i]!));
  m[0] = d[0] ?? 0; m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i]! / d[i]!, b = m[i + 1]! / d[i]!, h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]!; m[i + 1] = t * b * d[i]!; }
  }
  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0; while (x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!, t = (x - xs[i]!) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i]! + (t3 - 2 * t2 + t) * h * m[i]! + (-2 * t3 + 3 * t2) * ys[i + 1]! + (t3 - t2) * h * m[i + 1]!;
  };
}

/**
 * Exposure in linear light with a highlight shoulder (extended Reinhard, white point = gain):
 * +EV brightens mids/shadows while highlights roll off smoothly instead of clipping.
 */
export function exposeChannel(v: number, gain: number) {
  if (gain === 1) return v;
  const lin = Math.pow(v, 2.2) * gain;
  const out = gain > 1 ? (lin * (1 + lin / (gain * gain))) / (1 + lin) : lin;
  return Math.pow(Math.max(0, out), 1 / 2.2);
}

function blurData(src: HTMLCanvasElement, r: number): Uint8ClampedArray | null {
  if (r <= 0.05) return null;
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.filter = `blur(${r.toFixed(2)}px)`;
  ctx.drawImage(src, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

export const isNeutral = (a: Adjust) => JSON.stringify({ ...a, rotation: 0, flipH: false, flipV: false, straighten: 0 }) === JSON.stringify({ ...defaultAdjust });

/**
 * Develops `source` at size w×h. `pxScale` = w / original width (to keep radii consistent).
 * Returns a new canvas with the result plus RGB histogram.
 */
export function developCanvas(source: CanvasImageSource, w: number, h: number, a: Adjust, pxScale = 1, wantHist = false) {
  const base = document.createElement("canvas");
  base.width = w; base.height = h;
  const bctx = base.getContext("2d", { willReadFrequently: true })!;
  bctx.drawImage(source, 0, 0, w, h);
  const img = bctx.getImageData(0, 0, w, h);
  const d: any = img.data;
  const long = Math.max(w, h);

  const needLocal = a.clarity !== 0;
  const needStruct = a.structure !== 0 || a.texture !== 0;
  const bClar: any = needLocal ? blurData(base, long * 0.015) : null;
  const bStruct: any = needStruct ? blurData(base, long * 0.003 + 1) : null;
  const bSharp: any = a.sharpAmount > 0 ? blurData(base, Math.max(0.3, a.sharpRadius * pxScale)) : null;
  const bNr: any = a.nrLum > 0 || a.nrColor > 0 ? blurData(base, Math.max(0.6, 2 * pxScale)) : null;

  const lut: any = toneLut(a);
  const mired = 1e6 / 5500 - 1e6 / a.kelvin;
  const s = mired / 100;
  const gr = Math.max(0, 1 + 0.2 * s), gb = Math.max(0, 1 - 0.2 * s), gg = Math.max(0, 1 - (a.tint / 100) * 0.3);
  const ev = Math.pow(2, a.exposure);
  const hl = a.highlight / 100, sh = a.shadow / 100, wh = a.white / 100, bl = a.black / 100;
  const dz = a.dehaze / 100;
  const sat = 1 + a.saturation / 100 + Math.max(0, dz) * 0.25;
  const op = a.layerOpacity / 100;
  const tones = ([[a.cbShadows, 0], [a.cbMid, 1], [a.cbHigh, 2]] as const)
    .filter(([t]) => t.a !== 0)
    .map(([t, k]) => { const [r, g, b] = hueRgb(t.h); const m = (t.a / 100) * 0.18; return { k, r: (r - 0.5) * m, g: (g - 0.5) * m, b: (b - 0.5) * m }; });
  const hslOn = HSL_CH.some((c) => a.hsl[c].h || a.hsl[c].s || a.hsl[c].l);
  const vig = a.vigAmount;
  const nrL = a.nrLum / 100 * 0.85, nrC = a.nrColor / 100;
  const shA = a.sharpAmount / 100 * 2;
  const clar = a.clarity / 100 * 0.8, str = (a.structure + a.texture) / 100 * 1.2;
  const vib = a.vibrance / 100;
  const hist: any = wantHist ? [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)] : null;

  for (let y = 0; y < h; y++) {
    const dy = (y / h - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r0 = d[i] / 255, g0 = d[i + 1] / 255, b0 = d[i + 2] / 255;
      let r = r0, g = g0, b = b0;

      if (bNr) {
        const br = bNr[i] / 255, bg = bNr[i + 1] / 255, bb = bNr[i + 2] / 255;
        const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, bY = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
        // colour NR: keep own luminance, take blurred chroma
        r += (br - bY + Y - r) * nrC; g += (bg - bY + Y - g) * nrC; b += (bb - bY + Y - b) * nrC;
        // luminance NR
        const dl = (bY - Y) * nrL; r += dl; g += dl; b += dl;
      }

      r *= gr; g *= gg; b *= gb;
      if (ev !== 1) { r = exposeChannel(r, ev); g = exposeChannel(g, ev); b = exposeChannel(b, ev); }

      let Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (hl || sh || wh || bl || bClar || bStruct) {
        let nY = Y;
        const hw = sstep(0.5, 1, Y), sw = 1 - sstep(0, 0.5, Y);
        // Highlights/shadows: gentle, tone-limited; positive highlights can't push past white.
        nY += hl > 0 ? hl * 0.35 * hw * (1 - Y) : hl * 0.45 * hw * Y;
        nY += sh * 0.35 * sw * (1 - Y) * (Y + 0.04);
        nY += wh * 0.18 * Y * Y * (wh > 0 ? 1 - Y * 0.5 : 1) + bl * 0.15 * (1 - Y) * (1 - Y) * (1 - Y);
        if (bClar) {
          const cY = exposeChannel((0.2126 * bClar[i] + 0.7152 * bClar[i + 1] + 0.0722 * bClar[i + 2]) / 255, ev);
          nY += (Y - cY) * clar * (1 - Math.abs(2 * Y - 1) * 0.6);
        }
        if (bStruct) {
          const cY = exposeChannel((0.2126 * bStruct[i] + 0.7152 * bStruct[i + 1] + 0.0722 * bStruct[i + 2]) / 255, ev);
          nY += (Y - cY) * str;
        }
        if (Y > 1e-4) { const k = Math.max(0, nY) / Y; r *= k; g *= k; b *= k; } else { r = g = b = Math.max(0, nY); }
        Y = Math.max(0, nY);
      }

      if (dz) {
        const k = dz * 0.35;
        if (k > 0) { r = (r - k * 0.5) / (1 - k * 0.5); g = (g - k * 0.5) / (1 - k * 0.5); b = (b - k * 0.5) / (1 - k * 0.5); }
        else { const m = -k; r = r * (1 - m) + m * 0.7; g = g * (1 - m) + m * 0.72; b = b * (1 - m) + m * 0.75; }
      }

      r = lut[(clamp01(r) * 1024) | 0]; g = lut[(clamp01(g) * 1024) | 0]; b = lut[(clamp01(b) * 1024) | 0];

      Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (sat !== 1) { r = Y + (r - Y) * sat; g = Y + (g - Y) * sat; b = Y + (b - Y) * sat; }
      if (vib) {
        // Vibrance: boosts muted colours most, protects already-saturated tones and skin (r>g>b).
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), cs = mx > 1e-4 ? (mx - mn) / mx : 0;
        const skin = r > g && g > b ? 0.5 : 1;
        const k = 1 + vib * (1 - cs) * (vib > 0 ? skin : 1);
        r = Y + (r - Y) * k; g = Y + (g - Y) * k; b = Y + (b - Y) * k;
      }

      for (const t of tones) {
        const wgt = t.k === 0 ? 1 - sstep(0, 0.5, Y) : t.k === 2 ? sstep(0.5, 1, Y) : 1 - Math.abs(2 * Y - 1);
        r += t.r * wgt; g += t.g * wgt; b += t.b * wgt;
      }

      if (hslOn) {
        r = clamp01(r); g = clamp01(g); b = clamp01(b);
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
        if (dd > 1e-4) {
          let hh = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
          hh = (hh * 60 + 360) % 360;
          let ss = dd / (1 - Math.abs(2 * l - 1));
          let dh = 0, ds = 0, dl = 0;
          for (const c of HSL_CH) {
            const v = a.hsl[c]; if (!v.h && !v.s && !v.l) continue;
            let dist = Math.abs(hh - HUE_CENTER[c]); if (dist > 180) dist = 360 - dist;
            const wgt = Math.max(0, 1 - dist / 40) * Math.min(1, ss * 2);
            dh += v.h * 0.3 * wgt; ds += (v.s / 100) * wgt; dl += (v.l / 100) * 0.3 * wgt;
          }
          hh = (hh + dh + 360) % 360; ss = clamp01(ss * (1 + ds)); const ll = clamp01(l + dl);
          const C = (1 - Math.abs(2 * ll - 1)) * ss, X = C * (1 - Math.abs(((hh / 60) % 2) - 1)), m = ll - C / 2;
          const sector = (hh / 60) | 0;
          const [rr, gg2, bb]: any = [[C, X, 0], [X, C, 0], [0, C, X], [0, X, C], [X, 0, C], [C, 0, X]][sector % 6];
          r = rr + m; g = gg2 + m; b = bb + m;
        }
      }

      if (vig) {
        let dx = (x / w - 0.5) * 2, dyy = dy;
        if (a.vigMethod === "circular") { const ar = w / h; if (ar > 1) dx *= ar; else dyy /= ar; }
        const dist = Math.sqrt(dx * dx + dyy * dyy) / 1.4142;
        const f = Math.pow(2, vig * sstep(0.3, 1, dist));
        r *= f; g *= f; b *= f;
      }

      if (bSharp) {
        r += (r0 - bSharp[i] / 255) * shA; g += (g0 - bSharp[i + 1] / 255) * shA; b += (b0 - bSharp[i + 2] / 255) * shA;
      }

      if (op < 1) { r = r0 + (r - r0) * op; g = g0 + (g - g0) * op; b = b0 + (b - b0) * op; }

      const R = (clamp01(r) * 255 + 0.5) | 0, G = (clamp01(g) * 255 + 0.5) | 0, Bv = (clamp01(b) * 255 + 0.5) | 0;
      d[i] = R; d[i + 1] = G; d[i + 2] = Bv;
      if (hist && (i & 12) === 0) { hist[0][R]++; hist[1][G]++; hist[2][Bv]++; }
    }
  }
  bctx.putImageData(img, 0, 0);
  return { canvas: base, hist: hist as Uint32Array[] | null };
}

/** Gray-world auto white balance and auto exposure measured on a source. */
export function autoMeasure(source: CanvasImageSource, w: number, h: number) {
  const k = Math.min(1, 256 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const d: any = ctx.getImageData(0, 0, c.width, c.height).data;
  let mr = 0, mg = 0, mb = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { mr += d[i]; mg += d[i + 1]; mb += d[i + 2]; }
  mr /= n * 255; mg /= n * 255; mb /= n * 255;
  const s = (mb - mr) / (0.2 * (mr + mb) || 1);
  const kelvin = Math.round(Math.min(12000, Math.max(2000, 1e6 / Math.max(40, 1e6 / 5500 - 100 * s))));
  const target = (mr * (1 + 0.2 * s) + mb * (1 - 0.2 * s)) / 2;
  const tint = Math.round(Math.min(100, Math.max(-100, ((1 - target / (mg || 1)) / 0.3) * 100)));
  const Y = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb;
  const exposure = Math.round(Math.min(2, Math.max(-2, Math.log2(0.42 / Math.max(0.01, Y)))) * 100) / 100;
  return { kelvin, tint, exposure };
}

// Non-destructive photo development pipeline (pixel-level, canvas based).
export const HSL_CH = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"] as const;
export type HslCh = (typeof HSL_CH)[number];
const HUE_CENTER: Record<HslCh, number> = { red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 240, purple: 280, magenta: 320 };
export type Hsl = { h: number; s: number; l: number };
export type Tone = { h: number; a: number };
export type WbMode = "asShot" | "auto" | "daylight" | "cloudy" | "shade" | "tungsten" | "fluorescent" | "flash" | "custom";
export type Curve = "linear" | "standard" | "high";

export type Adjust = {
  rotation: number; flipH: boolean; straighten: number;
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
  rotation: 0, flipH: false, straighten: 0, curve: "linear",
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
  const c = 1 + a.contrast / 100;
  const curveK = a.curve === "standard" ? 0.25 : a.curve === "high" ? 0.5 : 0;
  for (let i = 0; i <= N; i++) {
    let v = i / N;
    v = Math.pow(v, g);
    if (curveK) v = v + curveK * (v - 0.5) * (1 - Math.abs(2 * v - 1)) * 0.9 * 2 * 0.5;
    v = (v - 0.5) * c + 0.5;
    lut[i] = clamp01(v);
  }
  return lut;
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

export const isNeutral = (a: Adjust) => JSON.stringify({ ...a, rotation: 0, flipH: false, straighten: 0 }) === JSON.stringify({ ...defaultAdjust });

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
  const needStruct = a.structure !== 0;
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
    .map(([t, k]) => { const [r, g, b] = hueRgb(t.h); const m = (t.a / 100) * 0.25; return { k, r: (r - 0.5) * m, g: (g - 0.5) * m, b: (b - 0.5) * m }; });
  const hslOn = HSL_CH.some((c) => a.hsl[c].h || a.hsl[c].s || a.hsl[c].l);
  const vig = a.vigAmount;
  const nrL = a.nrLum / 100 * 0.85, nrC = a.nrColor / 100;
  const shA = a.sharpAmount / 100 * 2;
  const clar = a.clarity / 100 * 1.2, str = a.structure / 100 * 1.5;
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

      r *= gr * ev; g *= gg * ev; b *= gb * ev;

      let Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (hl || sh || wh || bl || bClar || bStruct) {
        let nY = Y;
        const hw = sstep(0.45, 1, Y), sw = 1 - sstep(0, 0.55, Y);
        nY += hl * 0.5 * hw * Y + sh * 0.4 * sw * (1 - Y) * (Y + 0.05);
        nY += wh * 0.25 * Y * Y * Y + bl * 0.2 * (1 - Y) * (1 - Y) * (1 - Y);
        if (bClar) {
          const cY = (0.2126 * bClar[i] + 0.7152 * bClar[i + 1] + 0.0722 * bClar[i + 2]) / 255 * gr * ev;
          nY += (Y - cY) * clar * (1 - Math.abs(2 * Y - 1) * 0.6);
        }
        if (bStruct) {
          const cY = (0.2126 * bStruct[i] + 0.7152 * bStruct[i + 1] + 0.0722 * bStruct[i + 2]) / 255 * gr * ev;
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

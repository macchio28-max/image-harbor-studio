import { describe, expect, it } from "vitest";
import { srScaleFor, cleanPass } from "./detail-ai";
import { defaultAdjust, isNeutral } from "./develop";
import { presetValues } from "./user-presets";

describe("Dettaglio AI e maschere", () => {
  it("Super Risoluzione 4× su 24MP scende a 2× per restare sotto 100MP", () => {
    expect(srScaleFor(6000, 4000, 4)).toBe(2);
    expect(srScaleFor(2000, 1500, 4)).toBe(4);
  });
  it("la Super Risoluzione da sola non cambia l'anteprima (si applica al salvataggio)", () => {
    expect(isNeutral({ ...defaultAdjust, srScale: 4 })).toBe(true);
    expect(isNeutral({ ...defaultAdjust, aiNr: 30 })).toBe(false);
  });
  it("i preset personali non salvano la maschera della foto", () => {
    expect("mask" in presetValues({ ...defaultAdjust, mask: { ...defaultAdjust.mask, id: "x", exposure: 1 } })).toBe(false);
  });
  it("Denoise riduce la grana su una zona piatta", () => {
    const w = 16, h = 16, px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { const v = i % 2 ? 140 : 100; px.set([v, v, v, 255], i * 4); }
    cleanPass(px, w, h, 100, 0);
    expect(Math.abs(px[0]! - px[4]!)).toBeLessThan(20);
  });
});

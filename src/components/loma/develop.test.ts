import { describe, expect, it } from "vitest";
import { exposeChannel, monotoneSpline } from "./develop";

describe("esposizione con roll-off delle alte luci", () => {
  it("+0.6 EV su un tono chiaro (0.7) lo schiarisce senza bruciarlo", () => {
    const v = exposeChannel(0.7, Math.pow(2, 0.6));
    expect(v).toBeGreaterThan(0.7);
    expect(v).toBeLessThan(0.97);
  });
  it("0 EV non cambia nulla", () => {
    expect(exposeChannel(0.42, 1)).toBe(0.42);
  });
});

describe("curve", () => {
  it("la curva passa per i punti e non supera i limiti", () => {
    const f = monotoneSpline([[0, 0], [0.5, 0.6], [1, 1]]);
    expect(f(0.5)).toBeCloseTo(0.6, 5);
    for (let x = 0; x <= 1; x += 0.05) { expect(f(x)).toBeGreaterThanOrEqual(0); expect(f(x)).toBeLessThanOrEqual(1); }
  });
});

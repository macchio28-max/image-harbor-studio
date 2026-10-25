import { describe, it, expect } from "vitest";
import { analyze } from "./provenance";

function png(chunks: [string, Uint8Array][]) {
  const parts: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const [t, d] of chunks) {
    const l = d.length;
    parts.push(l >>> 24, (l >> 16) & 255, (l >> 8) & 255, l & 255, ...[...t].map((c) => c.charCodeAt(0)), ...d, 0, 0, 0, 0);
  }
  return new Uint8Array(parts);
}
const enc = (s: string) => new TextEncoder().encode(s);

describe("provenance", () => {
  it("detects A1111 parameters chunk with prompt and seed", () => {
    const b = png([["tEXt", enc("parameters\0a red fox\nNegative prompt: blur\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 1234")], ["IEND", new Uint8Array()]]);
    const r = analyze(b, {});
    expect(r.level).toBe("ai");
    expect(r.findings[0].signature).toBe("Chunk PNG parameters");
    expect(r.findings[0].details).toContainEqual(["Prompt", "a red fox"]);
    expect(r.findings[0].details).toContainEqual(["Seed", "1234"]);
  });
  it("flags Midjourney in Software tag", () => {
    expect(analyze(new Uint8Array(10), { Software: "Midjourney v6" }).findings[0].engine).toBe("Midjourney");
  });
  it("Photoshop alone is only partial", () => {
    expect(analyze(new Uint8Array(10), { Software: "Adobe Photoshop 25.0" }).level).toBe("partial");
  });
  it("clean camera photo is none", () => {
    expect(analyze(new Uint8Array(10), { Make: "Canon", Model: "EOS R5" }).level).toBe("none");
  });
});

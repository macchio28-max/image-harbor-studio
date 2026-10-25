import { describe, expect, it } from "vitest";
import { stripJpeg, stripPng } from "./sanitize";

const crc0 = [0, 0, 0, 0];
const chunk = (type: string, data: number[]) => [
  0, 0, 0, data.length, ...[...type].map((c) => c.charCodeAt(0)), ...data, ...crc0,
];
const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const types = (b: Uint8Array) => {
  const out: string[] = [];
  for (let o = 8; o + 12 <= b.length;) {
    const len = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!;
    out.push(String.fromCharCode(...b.subarray(o + 4, o + 8)));
    o += 12 + len;
  }
  return out;
};

describe("stripPng", () => {
  it("removes text, EXIF, ICC and C2PA chunks, keeps pixel chunks", () => {
    const png = new Uint8Array([
      ...sig, ...chunk("IHDR", [1, 2, 3]), ...chunk("tEXt", [80, 97]), ...chunk("iTXt", [1]),
      ...chunk("zTXt", [1]), ...chunk("eXIf", [1]), ...chunk("iCCP", [1]), ...chunk("caBX", [1]),
      ...chunk("IDAT", [9, 9]), ...chunk("IEND", []),
    ]);
    expect(types(stripPng(png))).toEqual(["IHDR", "IDAT", "IEND"]);
  });
});

describe("stripJpeg", () => {
  it("removes APP0-APP15 (EXIF, XMP, IPTC, JUMBF) and COM segments", () => {
    const seg = (m: number, n: number) => [0xff, m, 0, n + 2, ...Array(n).fill(7)];
    const jpg = new Uint8Array([
      0xff, 0xd8, ...seg(0xe0, 3), ...seg(0xe1, 4), ...seg(0xeb, 2), ...seg(0xed, 2), ...seg(0xfe, 2),
      ...seg(0xdb, 2), ...seg(0xc0, 2), ...seg(0xc4, 2), 0xff, 0xda, 0, 2, 5, 5, 0xff, 0xd9,
    ]);
    const out = Array.from(stripJpeg(jpg));
    const markers = out.flatMap((v, i) => (v === 0xff && out[i + 1]! >= 0xc0 ? [out[i + 1]] : []));
    expect(markers).toEqual([0xd8, 0xdb, 0xc0, 0xc4, 0xda, 0xd9]);
  });
});

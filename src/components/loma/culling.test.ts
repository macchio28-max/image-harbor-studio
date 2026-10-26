import { describe, expect, it } from "vitest";
import { scanCullBytes } from "./culling";

const enc = (s: string) => new TextEncoder().encode(s);

function tiffWithRating(r: number, prefix = 0) {
  const b = new Uint8Array(prefix + 64), dv = new DataView(b.buffer);
  const o = prefix;
  b[o] = 0x49; b[o + 1] = 0x49; dv.setUint16(o + 2, 42, true); dv.setUint32(o + 4, 8, true);
  dv.setUint16(o + 8, 1, true); dv.setUint16(o + 10, 0x4746, true); dv.setUint16(o + 12, 3, true); dv.setUint32(o + 14, 1, true); dv.setUint16(o + 18, r, true);
  return b;
}

describe("scanCullBytes", () => {
  it("reads 4 stars from an XMP attribute with double quotes", () => {
    expect(scanCullBytes(enc('xx <rdf:Description xmp:Rating="4"/>')).rating).toBe(4);
  });
  it("reads 3 stars from Canon-style single quotes (xmp:Rating='3')", () => {
    expect(scanCullBytes(enc("<rdf:Description rdf:about='' xmp:Rating='3'/>")).rating).toBe(3);
  });
  it("reads 5 stars from the element form <xmp:Rating>5</xmp:Rating>", () => {
    expect(scanCullBytes(enc("<xmp:Rating>5</xmp:Rating>")).rating).toBe(5);
  });
  it("reads 2 stars from the old xap: prefix", () => {
    expect(scanCullBytes(enc('xap:Rating="2"')).rating).toBe(2);
  });
  it("reads 3 stars from CR2 IFD0 tag 0x4746", () => {
    expect(scanCullBytes(tiffWithRating(3)).rating).toBe(3);
  });
  it("reads 4 stars from a CR3 CMT1 box", () => {
    const head = enc("....ftypcrx ....moov....uuid....CMT1");
    const tiff = tiffWithRating(4);
    const all = new Uint8Array(head.length + tiff.length);
    all.set(head); all.set(tiff, head.length);
    expect(scanCullBytes(all).rating).toBe(4);
  });
  it("unrated file stays at 0 stars", () => {
    expect(scanCullBytes(enc("<xmp:Rating>0</xmp:Rating>")).rating).toBe(0);
  });
});

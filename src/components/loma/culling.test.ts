import { describe, expect, it } from "vitest";
import { scanCullBytes } from "./culling";

describe("scanCullBytes", () => {
  it("reads 4 stars from an XMP packet (CR3)", () => {
    expect(scanCullBytes(new TextEncoder().encode('xx <rdf:Description xmp:Rating="4"/>')).rating).toBe(4);
  });
  it("reads 3 stars from CR2 IFD0 tag 0x4746", () => {
    const b = new Uint8Array(64), dv = new DataView(b.buffer);
    b[0] = 0x49; b[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
    dv.setUint16(8, 1, true); dv.setUint16(10, 0x4746, true); dv.setUint16(12, 3, true); dv.setUint32(14, 1, true); dv.setUint16(18, 3, true);
    expect(scanCullBytes(b).rating).toBe(3);
  });
});

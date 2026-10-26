// Minimal, dependency-free TIFF/EXIF reader for RAW headers (CR2/NEF/ARW/DNG/ORF + CR3 CMT1/CMT2 boxes).
// Reads only the shooting data the EXIF tab shows.

const TAGS: Record<number, string> = {
  0x010f: "Make", 0x0110: "Model", 0x0131: "Software", 0x0132: "ModifyDate", 0x013b: "Artist",
  0x829a: "ExposureTime", 0x829d: "FNumber", 0x8827: "ISO", 0x9003: "DateTimeOriginal",
  0x9201: "ShutterSpeedValue", 0x9202: "ApertureValue", 0x9204: "ExposureCompensation",
  0x9207: "MeteringMode", 0x9209: "Flash", 0x920a: "FocalLength", 0xa405: "FocalLengthIn35mmFormat",
  0xa432: "LensInfo", 0xa433: "LensMake", 0xa434: "LensModel", 0xa431: "BodySerialNumber",
  0xa002: "ExifImageWidth", 0xa003: "ExifImageHeight", 0x8830: "SensitivityType",
};

export function readTiffExif(bytes: Uint8Array, base = 0, out: Record<string, any> = {}): Record<string, any> {
  try {
    if (bytes.length < base + 8) return out;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const bo = dv.getUint16(base);
    const le = bo === 0x4949;
    if (!le && bo !== 0x4d4d) return out;
    const seen = new Set<number>();
    const walk = (ifd: number, depth: number) => {
      const at = base + ifd;
      if (!ifd || seen.has(at) || depth > 3 || at + 2 > bytes.length) return;
      seen.add(at);
      const n = dv.getUint16(at, le);
      for (let i = 0; i < n && at + 2 + i * 12 + 12 <= bytes.length; i++) {
        const e = at + 2 + i * 12;
        const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
        const size = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] ?? 1;
        const p = count * size <= 4 ? e + 8 : base + dv.getUint32(e + 8, le);
        if (tag === 0x8769) { walk(dv.getUint32(e + 8, le), depth + 1); continue; }
        const name = TAGS[tag];
        if (!name || out[name] != null || p + Math.min(count, 64) * size > bytes.length) continue;
        let v: any;
        if (type === 2) {
          let s = "";
          for (let k = 0; k < count && p + k < bytes.length; k++) { const c = bytes[p + k]!; if (!c) break; s += String.fromCharCode(c); }
          v = s.trim();
          if (!v) continue;
        } else {
          const vals: number[] = [];
          for (let k = 0; k < Math.min(count, 8); k++) {
            const o = p + k * size;
            if (type === 3) vals.push(dv.getUint16(o, le));
            else if (type === 8) vals.push(dv.getInt16(o, le));
            else if (type === 4) vals.push(dv.getUint32(o, le));
            else if (type === 9) vals.push(dv.getInt32(o, le));
            else if (type === 5) { const d = dv.getUint32(o + 4, le); vals.push(d ? dv.getUint32(o, le) / d : 0); }
            else if (type === 10) { const d = dv.getInt32(o + 4, le); vals.push(d ? dv.getInt32(o, le) / d : 0); }
            else vals.push(bytes[o]!);
          }
          v = vals.length === 1 ? vals[0] : vals;
        }
        out[name] = v;
      }
      const nx = at + 2 + n * 12;
      if (depth === 0 && nx + 4 <= bytes.length) { const next = dv.getUint32(nx, le); if (next) walk(next, 1); }
    };
    walk(dv.getUint32(base + 4, le), 0);
  } catch { /* partial data */ }
  if (typeof out.FNumber === "number") out.FNumber = Math.round(out.FNumber * 10) / 10;
  if (typeof out.FocalLength === "number") out.FocalLength = Math.round(out.FocalLength);
  return out;
}

/** Shooting data from a RAW header: plain TIFF RAWs at offset 0, CR3 via CMT1 (IFD0) + CMT2 (Exif). */
export function readRawExif(bytes: Uint8Array): Record<string, any> {
  const out: Record<string, any> = {};
  readTiffExif(bytes, 0, out);
  const txt = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 1024 * 1024)));
  for (const tag of ["CMT1", "CMT2"]) {
    const i = txt.indexOf(tag);
    if (i >= 4) readTiffExif(bytes, i + 4, out);
  }
  return out;
}

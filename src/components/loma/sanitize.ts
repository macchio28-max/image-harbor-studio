// Byte-level metadata scrubbing applied after canvas re-encoding, so no header/chunk can carry
// EXIF, XMP, IPTC, ICC, C2PA/JUMBF or AI-generator text (Stable Diffusion "parameters", Midjourney, DALL-E...).

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** PNG chunks needed to decode the pixels; everything else (tEXt, iTXt, zTXt, eXIf, iCCP, caBX, tIME, ...) is dropped. */
const PNG_KEEP = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

export function isPng(b: Uint8Array) { return PNG_SIG.every((v, i) => b[i] === v); }
export function isJpeg(b: Uint8Array) { return b[0] === 0xff && b[1] === 0xd8; }

export function stripPng(b: Uint8Array): Uint8Array {
  if (!isPng(b)) return b;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let o = 8;
  while (o + 12 <= b.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(b[o + 4]!, b[o + 5]!, b[o + 6]!, b[o + 7]!);
    const end = o + 12 + len;
    if (end > b.length) break;
    if (PNG_KEEP.has(type)) parts.push(b.subarray(o, end));
    o = end;
    if (type === "IEND") break;
  }
  return concat(parts);
}

/** Keeps only the segments needed to decode: SOI, DQT, SOF*, DHT, DRI, SOS + scan data, EOI. Drops APP0-APP15 and COM. */
export function stripJpeg(b: Uint8Array): Uint8Array {
  if (!isJpeg(b)) return b;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return b; // malformed: leave untouched rather than corrupt
    const m = b[o + 1]!;
    if (m === 0xd9) { parts.push(b.subarray(o, o + 2)); break; }
    const len = (b[o + 2]! << 8) | b[o + 3]!;
    const end = o + 2 + len;
    if (m === 0xda) { parts.push(b.subarray(o)); break; } // SOS: rest is entropy-coded data up to EOI
    const isApp = m >= 0xe0 && m <= 0xef;
    if (!isApp && m !== 0xfe) parts.push(b.subarray(o, end));
    o = end;
  }
  return concat(parts);
}

export function stripMetadata(b: Uint8Array): Uint8Array {
  return isPng(b) ? stripPng(b) : isJpeg(b) ? stripJpeg(b) : b;
}

export async function stripBlob(blob: Blob): Promise<Blob> {
  const b = new Uint8Array(await blob.arrayBuffer());
  return new Blob([stripMetadata(b) as BlobPart], { type: blob.type });
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

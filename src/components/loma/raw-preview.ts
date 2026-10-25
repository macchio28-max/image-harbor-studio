// Extracts the largest embedded JPEG preview from RAW files (CR2, NEF, ARW, DNG, ORF, PEF... via TIFF IFDs;
// CR3/RAF/others via SOI/EOI marker scan). Returns a lazy Blob slice of the original file (no copy).

type Cand = { off: number; len: number };

const HEAD = 2 * 1024 * 1024;

function parseTiff(buf: DataView, base: number, fileSize: number): Cand[] {
  if (buf.byteLength < base + 8) return [];
  const bo = buf.getUint16(base);
  const le = bo === 0x4949;
  if (!le && bo !== 0x4d4d) return [];
  const u16 = (o: number) => buf.getUint16(base + o, le);
  const u32 = (o: number) => buf.getUint32(base + o, le);
  const out: Cand[] = [];
  const seen = new Set<number>();
  const queue: number[] = [u32(4)];
  while (queue.length && seen.size < 64) {
    const ifd = queue.shift()!;
    if (!ifd || seen.has(ifd) || base + ifd + 2 > buf.byteLength) continue;
    seen.add(ifd);
    const n = u16(ifd);
    if (base + ifd + 2 + n * 12 + 4 > buf.byteLength) continue;
    const tags: Record<number, number[]> = {};
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const sz = type === 3 ? 2 : 4;
      if (type !== 3 && type !== 4 && type !== 13) continue;
      const vals: number[] = [];
      const p = count * sz <= 4 ? e + 8 : u32(e + 8);
      for (let k = 0; k < Math.min(count, 64); k++) {
        const o = p + k * sz;
        if (base + o + sz > buf.byteLength) break;
        vals.push(sz === 2 ? u16(o) : u32(o));
      }
      tags[tag] = vals;
    }
    const jo = tags[0x201]?.[0], jl = tags[0x202]?.[0];
    if (jo && jl) out.push({ off: base + jo, len: jl });
    const comp = tags[0x103]?.[0];
    const so = tags[0x111], sc = tags[0x117];
    if (so?.length === 1 && sc?.length === 1 && (comp === 6 || comp === 7 || comp === undefined)) out.push({ off: base + so[0], len: sc[0] });
    for (const s of tags[0x14a] ?? []) queue.push(s);
    if (tags[0x8769]?.[0]) queue.push(tags[0x8769][0]);
    const next = u32(ifd + 2 + n * 12);
    if (next) queue.push(next);
  }
  return out.filter((c) => c.len > 1024 && c.off + c.len <= fileSize);
}

async function isJpeg(file: File, c: Cand) {
  const b = new Uint8Array(await file.slice(c.off, c.off + 3).arrayBuffer());
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function scan(bytes: Uint8Array): Cand[] {
  const soi: number[] = [];
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) { soi.push(i); i += 3; }
  }
  const out: Cand[] = [];
  for (let k = 0; k < soi.length; k++) {
    const start = soi[k], limit = k + 1 < soi.length ? soi[k + 1] : bytes.length;
    let end = -1;
    for (let j = limit - 2; j > start; j--) if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) { end = j + 2; break; }
    if (end > 0 && end - start > 4096) out.push({ off: start, len: end - start });
  }
  return out;
}

function decodes(blob: Blob): Promise<boolean> {
  return new Promise((res) => {
    const u = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); res(im.naturalWidth > 16); };
    im.onerror = () => { URL.revokeObjectURL(u); res(false); };
    im.src = u;
  });
}

/** Largest embedded JPEG preview as Blob, or null. */
export async function extractRawPreview(file: File): Promise<Blob | null> {
  try {
    const head = new DataView(await file.slice(0, Math.min(HEAD, file.size)).arrayBuffer());
    let cands = parseTiff(head, 0, file.size);
    const ok: Cand[] = [];
    for (const c of cands) if (await isJpeg(file, c)) ok.push(c);
    cands = ok;
    if (!cands.length) cands = scan(new Uint8Array(await file.arrayBuffer()));
    cands.sort((a, b) => b.len - a.len);
    for (const c of cands.slice(0, 4)) {
      const blob = new Blob([file.slice(c.off, c.off + c.len)], { type: "image/jpeg" });
      if (await decodes(blob)) return blob;
    }
  } catch { /* unreadable */ }
  return null;
}

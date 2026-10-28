// Android APK: WebView's navigator.share can't send files, so hand them to the native
// LomaAndroid bridge, which writes them to cache and fires ACTION_SEND via FileProvider.
const CHUNK = 384 * 1024; // multiple of 3 → each chunk is clean Base64

export async function androidShare(file: File): Promise<boolean> {
  const a = (window as any).LomaAndroid;
  if (!a?.shareBegin) return false;
  let f = file;
  // Other apps rarely accept RAW: send a JPEG instead.
  if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
    try {
      const { decodeSource } = await import("./convert");
      const bm = await decodeSource(f);
      const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
      c.getContext("2d")!.drawImage(bm, 0, 0); bm.close();
      const b = await new Promise<Blob>((r, j) => c.toBlob((x) => (x ? r(x) : j(new Error("jpeg"))), "image/jpeg", 0.92));
      f = new File([b], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } catch { /* send as is */ }
  }
  return (await upload(a, f, f.name, f.type || "image/jpeg")) ? !!a.shareCommit(upId) : false;
}

let upId = "";
async function upload(a: any, b: Blob, name: string, mime: string): Promise<boolean> {
  const id: string = a.shareBegin(name, mime);
  if (!id) return false;
  for (let o = 0; o < b.size; o += CHUNK) {
    const u = new Uint8Array(await b.slice(o, o + CHUNK).arrayBuffer());
    let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    if (!a.shareChunk(id, btoa(s))) return false;
  }
  upId = id;
  return true;
}

/** Writes the file into the tablet's Pictures/LoMa folder (MediaStore) so it appears in Galleria. */
export async function androidSave(b: Blob, name: string): Promise<boolean> {
  const a = (window as any).LomaAndroid;
  if (!a?.saveCommit) return false;
  if (!(await upload(a, b, name, b.type || "image/png"))) return false;
  return !!a.saveCommit(upId, name);
}

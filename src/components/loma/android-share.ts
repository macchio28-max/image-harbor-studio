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
  const id: string = a.shareBegin(f.name, f.type || "image/jpeg");
  if (!id) return false;
  for (let o = 0; o < f.size; o += CHUNK) {
    const u = new Uint8Array(await f.slice(o, o + CHUNK).arrayBuffer());
    let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    if (!a.shareChunk(id, btoa(s))) return false;
  }
  return !!a.shareCommit(id);
}

// Android APK: WebView's navigator.share can't send files, so hand them to the native
// LomaAndroid bridge, which writes them to cache and fires ACTION_SEND via FileProvider.
const CHUNK = 1048575; // ~1 MB, multiple of 3 → each chunk is clean Base64
const COMMON = /^image\/(jpeg|png|webp|gif)$/;
const COMMON_EXT = /\.(jpe?g|png|webp|gif)$/i;
const isCommon = (f: File) => COMMON.test(f.type) || COMMON_EXT.test(f.name);
const mimeOf = (f: File) => f.type || (/\.png$/i.test(f.name) ? "image/png" : /\.webp$/i.test(f.name) ? "image/webp" : /\.gif$/i.test(f.name) ? "image/gif" : "image/jpeg");

/** Base64 via Chromium (FileReader) instead of a JS byte loop. */
function b64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const u = String(r.result); res(u.slice(u.indexOf(",") + 1)); };
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function androidShare(file: File, pkg?: string): Promise<boolean> {
  const a = (window as any).LomaAndroid;
  if (!a?.shareBegin) return false;
  let f = file;
  // Other apps rarely accept RAW: send a JPEG instead.
  if (!isCommon(f)) {
    try {
      const { decodeSource } = await import("./convert");
      const bm = await decodeSource(f);
      const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
      c.getContext("2d")!.drawImage(bm, 0, 0); bm.close();
      const b = await new Promise<Blob>((r, j) => c.toBlob((x) => (x ? r(x) : j(new Error("jpeg"))), "image/jpeg", 0.92));
      f = new File([b], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } catch { /* send as is */ }
  }
  return (await upload(a, f, f.name, mimeOf(f))) ? !!(pkg && a.shareCommitTo ? a.shareCommitTo(upId, pkg) : a.shareCommit(upId)) : false;
}

async function toShareable(file: File): Promise<File> {
  if (isCommon(file)) return file;
  try {
    const { decodeSource } = await import("./convert");
    const bm = await decodeSource(file);
    const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
    c.getContext("2d")!.drawImage(bm, 0, 0); bm.close();
    const b = await new Promise<Blob>((r, j) => c.toBlob((x) => (x ? r(x) : j(new Error("jpeg"))), "image/jpeg", 0.92));
    return new File([b], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

/** Shares many files in one go: native ACTION_SEND_MULTIPLE on the APK, navigator.share({files}) elsewhere. */
export async function androidShareMultiple(files: File[], pkg?: string): Promise<boolean> {
  const a = (window as any).LomaAndroid;
  if (a?.shareBegin && a.shareCommitMulti) {
    const ids: string[] = [];
    for (const f0 of files) {
      const f = await toShareable(f0);
      if (await upload(a, f, f.name, mimeOf(f))) ids.push(upId);
    }
    return ids.length ? !!a.shareCommitMulti(ids.join(","), pkg || "") : false;
  }
  if (a?.shareBegin) return false; // old APK without multi bridge
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, title: `${files.length} foto` }); } catch { /* annullato */ }
    return true;
  }
  return false;
}

let upId = "";
async function upload(a: any, b: Blob, name: string, mime: string): Promise<boolean> {
  const id: string = a.shareBegin(name, mime);
  if (!id) return false;
  for (let o = 0; o < b.size; o += CHUNK) {
    if (!a.shareChunk(id, await b64(b.slice(o, o + CHUNK)))) return false;
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

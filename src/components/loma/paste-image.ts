/** Image File from a paste event (Cmd/Ctrl+V, long-press «Incolla»). */
export function imageFromPaste(e: ClipboardEvent): File | null {
  for (const it of Array.from(e.clipboardData?.items ?? []))
    if (it.kind === "file" && it.type.startsWith("image/")) { const f = it.getAsFile(); if (f) return named(f, it.type); }
  return null;
}
/** Image from the async Clipboard API (toolbar button). Null when unavailable/denied/empty. */
export async function readClipboardImage(): Promise<File | null> {
  if (!navigator.clipboard?.read) return null;
  for (const it of await navigator.clipboard.read()) {
    const type = it.types.find((t) => t.startsWith("image/"));
    if (type) return named(new File([await it.getType(type)], "appunti", { type }), type);
  }
  return null;
}
export function named(f: Blob, type: string) {
  const ext = type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  return new File([f], `appunti-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`, { type });
}

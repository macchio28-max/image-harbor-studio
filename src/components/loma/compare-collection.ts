import type { CullItem } from "./culling";

export type CompareItem = CullItem & { folder?: string };
export type CompareSide = "A" | "B";
export const COMPARE_DRAG_TYPE = "application/x-loma-compare-photo";

export function moveComparePhoto(collections: Record<CompareSide, CompareItem[]>, from: CompareSide, to: CompareSide, id: string) {
  const item = collections[from].find(photo => photo.id === id);
  if (!item || from === to || collections[to].some(photo => photo.id === id)) return collections;
  return { ...collections, [from]: collections[from].filter(photo => photo.id !== id), [to]: [...collections[to], item] };
}

export function photoFolder(file: File, fallback: string) {
  const path = file.webkitRelativePath || (file as File & { lomaPath?: string; path?: string }).lomaPath || (file as File & { path?: string }).path || "";
  const parts = path.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.filter(Boolean).join("/") || fallback;
}

export function removeComparePhoto(items: CompareItem[], current: string | null, id: string) {
  const index = items.findIndex(item => item.id === id);
  const remaining = items.filter(item => item.id !== id);
  return { items: remaining, current: current === id ? remaining[Math.min(Math.max(index, 0), remaining.length - 1)]?.id ?? null : current };
}
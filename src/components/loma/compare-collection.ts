import type { CullItem } from "./culling";

export type CompareItem = CullItem & { folder?: string };

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
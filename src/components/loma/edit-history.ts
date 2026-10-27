// Undo/redo stack for photo edits (adjustments + crop). Pure, framework-free.
export type History<T> = { past: T[]; present: T; future: T[] };
export const LIMIT = 100;
export const startHistory = <T>(s: T): History<T> => ({ past: [], present: s, future: [] });
export const commit = <T>(h: History<T>, s: T): History<T> =>
  JSON.stringify(s) === JSON.stringify(h.present) ? h : { past: [...h.past, h.present].slice(-LIMIT), present: s, future: [] };
export const undo = <T>(h: History<T>): History<T> =>
  h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1]!, future: [h.present, ...h.future] } : h;
export const redo = <T>(h: History<T>): History<T> =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h;

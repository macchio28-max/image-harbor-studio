import { type Adjust, defaultAdjust } from './develop';

export const PRESET_KEY = 'loma.develop.user-presets.v1';
const GEOMETRY = new Set(['rotation', 'flipH', 'flipV', 'straighten']);
export type UserPreset = { id: string; name: string; favorite: boolean; values: Partial<Adjust> };

/** Store tone/detail settings only: presets never replace the current photo's geometry. */
export function presetValues(a: Adjust): Partial<Adjust> {
  return structuredClone(Object.fromEntries(Object.entries(a).filter(([k]) => !GEOMETRY.has(k))));
}
export function applyPreset(a: Adjust, p: UserPreset): Adjust {
  return { ...a, ...presetValues({ ...defaultAdjust, ...p.values }) };
}
function validLike(value: unknown, model: unknown): boolean {
  if (typeof model === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (typeof model === 'string') return typeof value === 'string';
  if (Array.isArray(model)) return Array.isArray(value) && value.length >= 2 && value.every(v => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1));
  if (model && typeof model === 'object') return !!value && typeof value === 'object' && Object.entries(model).every(([k, v]) => validLike((value as Record<string, unknown>)[k], v));
  return typeof value === typeof model;
}
export function readPresets(storage: Pick<Storage, 'getItem'>): UserPreset[] {
  try {
    const rows: unknown = JSON.parse(storage.getItem(PRESET_KEY) || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim() && p.values && typeof p.values === 'object').map(p => ({
      id: p.id, name: p.name, favorite: p.favorite === true,
      values: Object.fromEntries(Object.entries(p.values).filter(([k, v]) => !GEOMETRY.has(k) && k in defaultAdjust && validLike(v, defaultAdjust[k as keyof Adjust]))),
    }));
  } catch { return []; }
}
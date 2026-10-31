import { describe, it, expect } from 'vitest';
import { defaultAdjust } from './develop';
import { applyPreset, presetValues, readPresets, PRESET_KEY } from './user-presets';

describe('preset personali offline', () => {
  it('salva e ripristina esposizione, saturazione, contrasto, ombre, luci e dettaglio', () => {
    const values = presetValues({ ...defaultAdjust, exposure: .6, saturation: 20, contrast: 10, shadow: 15, highlight: -20, texture: 12 });
    const p = { id: 'one', name: 'Ritratto', favorite: true, values };
    localStorage.setItem(PRESET_KEY, JSON.stringify([p]));
    const saved = readPresets(localStorage)[0];
    expect(saved).toEqual(p);
    if (!saved) throw new Error('Preset mancante');
    expect(applyPreset(defaultAdjust, saved)).toMatchObject({ exposure: .6, saturation: 20, contrast: 10, shadow: 15, highlight: -20, texture: 12 });
  });
  it('non cambia rotazione, riflessione o raddrizzamento della foto corrente', () => {
    const p = { id: 'p', name: 'Test', favorite: false, values: presetValues({ ...defaultAdjust, rotation: 180, straighten: 20, flipH: true }) };
    expect(applyPreset({ ...defaultAdjust, rotation: 90, straighten: 3, flipV: true }, p)).toMatchObject({ rotation: 90, straighten: 3, flipH: false, flipV: true });
  });
  it('ignora dati corrotti senza bloccare le regolazioni', () => {
    expect(readPresets({ getItem: () => 'broken' })).toEqual([]);
    expect(readPresets({ getItem: () => JSON.stringify([{ id: 'p', name: 'Bad', values: { exposure: 'bad', curvePts: null, hsl: {} } }]) })[0]?.values).toEqual({});
  });
});
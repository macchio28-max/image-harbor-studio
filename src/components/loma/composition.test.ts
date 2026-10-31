import { describe, it, expect, vi } from 'vitest';
import { BLENDS, newLayer, paintComposition } from './composition';

describe('composizione locale', () => {
  it('offre Moltiplica, Scolora e Sovrapponi con le operazioni native', () => {
    expect(BLENDS).toContainEqual(['multiply', 'Moltiplica']);
    expect(BLENDS).toContainEqual(['screen', 'Scolora']);
    expect(BLENDS).toContainEqual(['overlay', 'Sovrapponi']);
  });
  it('applica posizione, scala, rotazione e fusione in ordine, ignorando livelli nascosti', () => {
    const ctx = { scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), globalAlpha: 1, globalCompositeOperation: 'source-over' };
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const l = { ...newLayer('photo', 800, 600), asset: 'p', x: 100, y: 200, scale: .5, rotation: 90, opacity: 50, blend: 'multiply' as const, width: 80, height: 40 };
    const source = {} as CanvasImageSource;
    paintComposition(canvas, { width: 800, height: 600, layers: [l, { ...l, visible: false }] }, new Map([['p', source]]));
    expect(canvas.width).toBe(800); expect(canvas.height).toBe(600);
    expect(ctx.translate).toHaveBeenCalledWith(100, 200);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(ctx.scale).toHaveBeenLastCalledWith(.5, .5);
    expect(ctx.drawImage).toHaveBeenCalledExactlyOnceWith(source, -40, -20, 80, 40);
    expect(ctx.globalAlpha).toBe(.5); expect(ctx.globalCompositeOperation).toBe('multiply');
  });
  it('riduce solo l’anteprima, mai le dimensioni dell’esportazione', () => {
    const ctx = { scale: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    paintComposition(canvas, { width: 4000, height: 2000, layers: [] }, new Map(), 1400);
    expect([canvas.width, canvas.height]).toEqual([1400, 700]);
    paintComposition(canvas, { width: 4000, height: 2000, layers: [] }, new Map());
    expect([canvas.width, canvas.height]).toEqual([4000, 2000]);
  });
});
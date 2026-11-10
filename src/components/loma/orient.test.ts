import { describe, it, expect } from 'vitest';
import { exifToTransform } from './orient';
describe('orientamento EXIF', () => {
  it('6 = verticale ruotata 90° a destra', () => expect(exifToTransform(6)).toEqual({ deg: 90, flipH: false }));
  it('8 = verticale ruotata 90° a sinistra', () => expect(exifToTransform(8)).toEqual({ deg: 270, flipH: false }));
  it('1 = nessuna rotazione', () => expect(exifToTransform(1)).toEqual({ deg: 0, flipH: false }));
});

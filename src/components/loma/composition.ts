/** Canvas uses the browser's native Porter–Duff / W3C blending implementation. */
export const BLENDS = [
  ['source-over', 'Normale'], ['multiply', 'Moltiplica'], ['screen', 'Scolora'], ['overlay', 'Sovrapponi'],
  ['darken', 'Scurisci'], ['lighten', 'Schiarisci'], ['color-dodge', 'Scherma colore'], ['color-burn', 'Brucia colore'],
  ['hard-light', 'Luce intensa'], ['soft-light', 'Luce soffusa'], ['difference', 'Differenza'], ['exclusion', 'Esclusione'],
  ['hue', 'Tonalità'], ['saturation', 'Saturazione'], ['color', 'Colore'], ['luminosity', 'Luminosità'],
] as const;
export type Blend = (typeof BLENDS)[number][0];
export type Layer = {
  id: string; name: string; kind: 'photo' | 'text' | 'shape'; asset?: string;
  x: number; y: number; width: number; height: number; scale: number; rotation: number;
  opacity: number; blend: Blend; visible: boolean; text: string; font: string; fontSize: number;
  bold: boolean; italic: boolean; color: string; shape: 'rectangle' | 'ellipse' | 'line';
};
export type Composition = { width: number; height: number; layers: Layer[] };
export function newLayer(kind: Layer['kind'], width: number, height: number): Layer {
  return { id: crypto.randomUUID(), name: kind === 'text' ? 'Testo' : kind === 'shape' ? 'Forma' : 'Foto', kind,
    x: width / 2, y: height / 2, width: width * .4, height: height * .2, scale: 1, rotation: 0,
    opacity: 100, blend: 'source-over', visible: true, text: 'Testo', font: 'Arial', fontSize: Math.max(16, Math.round(width / 15)),
    bold: false, italic: false, color: '#ffffff', shape: 'rectangle' };
}
export function paintComposition(canvas: HTMLCanvasElement, doc: Composition, assets: Map<string, CanvasImageSource>, maxSide?: number) {
  const k = maxSide ? Math.min(1, maxSide / Math.max(doc.width, doc.height)) : 1;
  canvas.width = Math.max(1, Math.round(doc.width * k)); canvas.height = Math.max(1, Math.round(doc.height * k));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas non disponibile');
  ctx.scale(k, k);
  for (const l of doc.layers) {
    if (!l.visible) continue;
    ctx.save(); ctx.globalAlpha = l.opacity / 100; ctx.globalCompositeOperation = l.blend;
    ctx.translate(l.x, l.y); ctx.rotate(l.rotation * Math.PI / 180); ctx.scale(l.scale, l.scale);
    ctx.fillStyle = l.color; ctx.strokeStyle = l.color;
    if (l.kind === 'photo') { const img = l.asset ? assets.get(l.asset) : null; if (img) ctx.drawImage(img, -l.width / 2, -l.height / 2, l.width, l.height); }
    else if (l.kind === 'text') {
      ctx.font = `${l.italic ? 'italic ' : ''}${l.bold ? 'bold ' : ''}${l.fontSize}px "${l.font}"`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = l.text.split('\n'); lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * l.fontSize * 1.2));
    } else if (l.shape === 'rectangle') ctx.fillRect(-l.width / 2, -l.height / 2, l.width, l.height);
    else if (l.shape === 'ellipse') { ctx.beginPath(); ctx.ellipse(0, 0, l.width / 2, l.height / 2, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.lineWidth = Math.max(1, l.height); ctx.beginPath(); ctx.moveTo(-l.width / 2, 0); ctx.lineTo(l.width / 2, 0); ctx.stroke(); }
    ctx.restore();
  }
  return canvas;
}
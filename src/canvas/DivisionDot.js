import { strokeTouchesCircle } from './Eraser.js';

// A short tap centered above or below a horizontal bar is likely one of the
// two division dots. Keep it as ink even when it lies in a symbol's tap area.
export function isDivisionDotPosition(strokes, x, y, scale) {
  if (strokes.some(stroke => strokeTouchesCircle(stroke, x, y, 3))) return false;
  return strokes.some(stroke => {
    const b = stroke.bounds;
    const width = b.maxX - b.minX;
    const height = b.maxY - b.minY;
    if (width < Math.max(18, scale * 0.28) ||
        height > Math.max(9, scale * 0.25) || width < height * 2.8) return false;
    const dx = Math.abs(x - (b.minX + b.maxX) / 2);
    const dy = Math.abs(y - (b.minY + b.maxY) / 2);
    return dx <= width * 0.45 && dy >= Math.max(6, scale * 0.1) &&
      dy <= Math.max(18, scale);
  });
}

// A bar's bounding rectangle extends well beyond its painted pixels on a
// touch screen. Require contact with actual ink before opening correction.
export function isDirectBarInkTap(cluster, strokes, x, y, pointerType) {
  if (cluster.predictedSymbol !== '-' && cluster.predictedSymbol !== '÷') return true;
  const ids = new Set(cluster.strokeIds);
  const radius = pointerType === 'touch' ? 4 : 3;
  return strokes.some(stroke => ids.has(stroke.id) && strokeTouchesCircle(stroke, x, y, radius));
}

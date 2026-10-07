// Conservative rules for shapes whose stroke geometry carries information
// that a raster classifier can easily lose. Return null when ambiguous.
function size(stroke) {
  const b = stroke.bounds;
  return { width: b.maxX - b.minX, height: b.maxY - b.minY,
    centerX: (b.minX + b.maxX) / 2, centerY: (b.minY + b.maxY) / 2 };
}

function horizontal(stroke, scale) {
  const { width, height } = size(stroke);
  return width >= scale * 0.26 && height <= Math.max(8, scale * 0.16) && width >= height * 2.8;
}

function vertical(stroke, scale) {
  const { width, height } = size(stroke);
  return height >= scale * 0.42 && width <= Math.max(9, scale * 0.19) && height >= width * 2.7;
}

function dot(stroke, scale) {
  const { width, height } = size(stroke);
  return Math.max(width, height) <= Math.max(10, scale * 0.2);
}

function overlapX(a, b) {
  return Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
}

export function suggestShapeSymbol(strokes, _bounds, scale) {
  if (!strokes.length) return null;
  if (strokes.length === 1) {
    if (horizontal(strokes[0], scale)) return '-';
    return null;
  }
  if (strokes.length === 2) {
    const [a, b] = strokes;
    if (horizontal(a, scale) && horizontal(b, scale)) {
      const separation = Math.abs(size(a).centerY - size(b).centerY);
      const xOverlap = overlapX(a.bounds, b.bounds);
      if (separation >= scale * 0.08 && separation <= scale * 0.5 &&
          xOverlap >= Math.min(size(a).width, size(b).width) * 0.6) return '=';
    }
    const bar = horizontal(a, scale) ? a : horizontal(b, scale) ? b : null;
    const stem = bar === a ? b : a;
    if (bar && vertical(stem, scale)) {
      const crossX = size(stem).centerX;
      const crossY = size(bar).centerY;
      const stemBounds = stem.bounds;
      if (crossX > bar.bounds.minX + size(bar).width * 0.2 &&
          crossX < bar.bounds.maxX - size(bar).width * 0.2 &&
          crossY > stemBounds.minY + size(stem).height * 0.28 &&
          crossY < stemBounds.maxY - size(stem).height * 0.28) return '+';
    }
    return null;
  }
  if (strokes.length === 3) {
    const bars = strokes.filter(s => horizontal(s, scale));
    const dots = strokes.filter(s => dot(s, scale));
    if (bars.length === 1 && dots.length === 2) {
      const bar = bars[0];
      const [a, b] = dots.sort((x, y) => size(x).centerY - size(y).centerY);
      const centerX = size(bar).centerX;
      const centerY = size(bar).centerY;
      if (size(a).centerY < centerY - scale * 0.08 &&
          size(b).centerY > centerY + scale * 0.08 &&
          Math.abs(size(a).centerX - centerX) < size(bar).width * 0.45 &&
          Math.abs(size(b).centerX - centerX) < size(bar).width * 0.45) return '÷';
    }
  }
  return null;
}

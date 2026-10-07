import { Stroke } from '../segmentation/Stroke.js';

export function pointSegmentDistance(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

export function strokeTouchesCircle(stroke, x, y, radius) {
  const points = stroke.points;
  if (!points.length) return false;
  if (points.length === 1) return Math.hypot(x - points[0].x, y - points[0].y) <= radius + stroke.width / 2;
  for (let i = 1; i < points.length; i++) {
    if (pointSegmentDistance(x, y, points[i - 1], points[i]) <= radius + stroke.width / 2) return true;
  }
  return false;
}

// Rebuild the un-erased portions as independent strokes. Sampling long input
// segments prevents a pixel eraser from missing the middle of a sparse stroke.
export function eraseStrokePixels(stroke, x, y, radius) {
  if (!strokeTouchesCircle(stroke, x, y, radius)) return { changed: false, fragments: [stroke] };
  const samples = [];
  for (let i = 0; i < stroke.points.length; i++) {
    const a = stroke.points[i];
    if (i === 0) samples.push(a);
    if (i + 1 >= stroke.points.length) break;
    const b = stroke.points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      samples.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure: a.pressure + ((b.pressure ?? 0.5) - (a.pressure ?? 0.5)) * t
      });
    }
  }
  const fragments = [];
  let current = null;
  for (const point of samples) {
    const erased = Math.hypot(x - point.x, y - point.y) <= radius + stroke.width / 2;
    if (erased) {
      if (current?.points.length) fragments.push(current);
      current = null;
    } else {
      if (!current) {
        current = new Stroke();
        current.width = stroke.width;
        current.color = stroke.color;
      }
      current.addPoint(point.x, point.y, point.pressure);
    }
  }
  if (current?.points.length) fragments.push(current);
  return { changed: true, fragments };
}

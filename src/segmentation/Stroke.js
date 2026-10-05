/**
 * Stroke data structure.
 * Represents a continuous line drawn between pointerdown and pointerup.
 */
export class Stroke {
  constructor(id = Date.now() + Math.random()) {
    this.id = id;
    this.points = []; // Array of { x, y, timestamp, pressure }
    this.color = '#1e293b';
    this.width = 4;
    this.rawBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  addPoint(x, y, pressure = 0.5) {
    const point = { x, y, timestamp: performance.now(), pressure };
    this.points.push(point);

    if (x < this.rawBounds.minX) this.rawBounds.minX = x;
    if (y < this.rawBounds.minY) this.rawBounds.minY = y;
    if (x > this.rawBounds.maxX) this.rawBounds.maxX = x;
    if (y > this.rawBounds.maxY) this.rawBounds.maxY = y;

    return point;
  }

  /**
   * Bounding box including the visual stroke radius (half of width).
   */
  get bounds() {
    const r = Math.max(2, this.width / 2);
    return {
      minX: this.rawBounds.minX - r,
      minY: this.rawBounds.minY - r,
      maxX: this.rawBounds.maxX + r,
      maxY: this.rawBounds.maxY + r
    };
  }

  get widthPx() {
    const b = this.bounds;
    return Math.max(1, b.maxX - b.minX);
  }

  get heightPx() {
    const b = this.bounds;
    return Math.max(1, b.maxY - b.minY);
  }

  get centerX() {
    const b = this.bounds;
    return (b.minX + b.maxX) / 2;
  }

  get centerY() {
    const b = this.bounds;
    return (b.minY + b.maxY) / 2;
  }

  get startPoint() {
    return this.points.length > 0 ? this.points[0] : null;
  }

  get endPoint() {
    return this.points.length > 0 ? this.points[this.points.length - 1] : null;
  }

  /**
   * Distance between the bounding boxes of two strokes.
   */
  distanceTo(otherStroke) {
    const b1 = this.bounds;
    const b2 = otherStroke.bounds;

    const dx = Math.max(0, Math.max(b1.minX - b2.maxX, b2.minX - b1.maxX));
    const dy = Math.max(0, Math.max(b1.minY - b2.maxY, b2.minY - b1.maxY));

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Minimum distance between any endpoints of two strokes.
   * Useful for detecting broken lines / pen-lift continuations.
   */
  endpointDistance(otherStroke) {
    const p1Start = this.startPoint;
    const p1End = this.endPoint;
    const p2Start = otherStroke.startPoint;
    const p2End = otherStroke.endPoint;

    if (!p1Start || !p1End || !p2Start || !p2End) return Infinity;

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    return Math.min(
      dist(p1End, p2Start),
      dist(p1Start, p2End),
      dist(p1End, p2End),
      dist(p1Start, p2Start)
    );
  }
}

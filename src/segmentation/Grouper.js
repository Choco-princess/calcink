// All coordinates and distances in this module are CSS pixels.
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const gap = (a0, a1, b0, b1) => Math.max(0, a0 - b1, b0 - a1);

function boundsOf(strokes) {
  return strokes.reduce((b, stroke) => {
    const s = stroke.bounds;
    b.minX = Math.min(b.minX, s.minX);
    b.minY = Math.min(b.minY, s.minY);
    b.maxX = Math.max(b.maxX, s.maxX);
    b.maxY = Math.max(b.maxY, s.maxY);
    return b;
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

const width = b => b.maxX - b.minX;
const height = b => b.maxY - b.minY;
const centerX = b => (b.minX + b.maxX) / 2;
const centerY = b => (b.minY + b.maxY) / 2;

function segmentDistance(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const ab1 = cross(a, b, c), ab2 = cross(a, b, d);
  const cd1 = cross(c, d, a), cd2 = cross(c, d, b);
  if (ab1 * ab2 <= 0 && cd1 * cd2 <= 0) return 0;
  const pointToSegment = (p, q, r) => {
    const dx = r.x - q.x, dy = r.y - q.y;
    const t = Math.max(0, Math.min(1, ((p.x - q.x) * dx + (p.y - q.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - q.x - t * dx, p.y - q.y - t * dy);
  };
  return Math.min(pointToSegment(a, c, d), pointToSegment(b, c, d),
    pointToSegment(c, a, b), pointToSegment(d, a, b));
}

function pathDistance(a, b) {
  let best = Infinity;
  const ap = a.points, bp = b.points;
  for (let i = 0; i < Math.max(1, ap.length - 1); i++) {
    for (let j = 0; j < Math.max(1, bp.length - 1); j++) {
      best = Math.min(best, segmentDistance(ap[i], ap[i + 1] || ap[i],
        bp[j], bp[j + 1] || bp[j]));
      if (best === 0) return 0;
    }
  }
  return best;
}

function hasRightwardLowerArm(stroke) {
  const b = stroke.bounds;
  if (stroke.points.length < 3 || width(b) < height(b) * 0.25) return false;
  return stroke.points.some((p, i) => i > 0 &&
    p.x > b.minX + width(b) * 0.75 &&
    p.y > b.minY + height(b) * 0.4 &&
    stroke.points[i - 1].x < p.x - width(b) * 0.35 &&
    Math.abs(stroke.points[i - 1].y - p.y) < height(b) * 0.15);
}

function writingScale(strokes) {
  const bodies = strokes.filter(s => s.heightPx >= Math.max(12, s.width * 2.5) &&
    s.heightPx >= s.widthPx * 0.45).map(s => s.heightPx);
  if (bodies.length) {
    bodies.sort((a, b) => a - b);
    return Math.max(20, median(bodies.slice(Math.floor(bodies.length / 3))));
  }
  const broadMarks = strokes.map(s => Math.max(s.heightPx, s.widthPx));
  broadMarks.sort((a, b) => a - b);
  return Math.max(24, broadMarks[Math.floor(broadMarks.length * 0.75)]);
}

function joinScore(a, b, scale) {
  const ba = boundsOf(a), bb = boundsOf(b), combined = boundsOf([...a, ...b]);
  if (width(combined) > scale * 1.65 || height(combined) > scale * 2.15) return 0;
  const xGap = gap(ba.minX, ba.maxX, bb.minX, bb.maxX);
  const yGap = gap(ba.minY, ba.maxY, bb.minY, bb.maxY);
  const xOverlap = overlap(ba.minX, ba.maxX, bb.minX, bb.maxX);
  const yOverlap = overlap(ba.minY, ba.maxY, bb.minY, bb.maxY);
  const xRatio = xOverlap / Math.max(1, Math.min(width(ba), width(bb)));
  const barStroke = group => group.find(s => s.heightPx <= Math.max(9, scale * 0.25) && s.widthPx >= scale * 0.3);
  const barA = barStroke(a), barB = barStroke(b);
  const dotA = a.every(s => Math.max(s.widthPx, s.heightPx) <= Math.max(10, scale * 0.24));
  const dotB = b.every(s => Math.max(s.widthPx, s.heightPx) <= Math.max(10, scale * 0.24));

  // A decimal mark remains separate; a dot joins a bar only when close to its middle.
  if ((dotA && barB) || (dotB && barA)) {
    const dot = dotA ? ba : bb, bar = (dotA ? barB : barA).bounds;
    return Math.abs(centerX(dot) - centerX(bar)) <= width(bar) * 0.45 &&
      yGap <= scale * 0.95 && height(combined) <= scale * 2.1 ? 80 : 0;
  }
  if (dotA || dotB) return 0;

  // The two bars of '=' have similar width and almost the same horizontal span.
  if (barA && barB && xRatio >= 0.6 &&
      Math.max(width(ba), width(bb)) / Math.max(1, Math.min(width(ba), width(bb))) < 1.7 &&
      yGap <= scale * 0.65 && height(combined) <= scale * 1.1) return 75;

  // Real ink contact is stronger evidence than overlapping bounding rectangles.
  if (xOverlap > 0 && yOverlap > 0) {
    const near = a.some(sa => b.some(sb =>
      pathDistance(sa, sb) <= (sa.width + sb.width) / 2 + Math.max(2, scale * 0.025)));
    if (near) return 100;
  }

  // Pen lifts, top/bottom digit pieces, and stems with caps or bases.
  if (xRatio >= 0.28 && yGap <= scale * 0.18 &&
      height(combined) <= scale * 2.05) {
    const endpoint = a.some(sa => b.some(sb => sa.endpointDistance(sb) <= scale * 0.22));
    if (endpoint) return 60;
    if (xRatio >= 0.55 && yOverlap === 0) return 45;
  }

  // A disconnected open '4' can have a lower arm ending just before its stem.
  if (xGap <= scale * 0.13 && yOverlap >= scale * 0.25) {
    const arm = [...a, ...b].some(hasRightwardLowerArm);
    const stem = [...a, ...b].some(s => s.heightPx >= scale * 0.7 &&
      s.heightPx > s.widthPx * 2);
    if (arm && stem && width(combined) <= scale * 1.2) return 35;
  }
  return 0;
}

function formSymbols(strokes, scale) {
  const groups = strokes.map(s => [s]);
  while (true) {
    let best = { score: 0 };
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const score = joinScore(groups[i], groups[j], scale);
        if (score > best.score) best = { i, j, score };
      }
    }
    if (!best.score) break;
    const joined = [...groups[best.i], ...groups[best.j]];
    joined.weakJoin = groups[best.i].weakJoin || groups[best.j].weakJoin || best.score < 70;
    groups[best.i] = joined;
    groups.splice(best.j, 1);
  }
  return groups;
}

function rowModel(row) {
  const anchors = row.filter(g => {
    const b = boundsOf(g);
    return height(b) >= row.scale * 0.55 && height(b) >= width(b) * 0.4;
  });
  const points = (anchors.length ? anchors : row).map(g => boundsOf(g));
  const xs = points.map(centerX), ys = points.map(centerY);
  const x0 = xs.reduce((a, x) => a + x, 0) / xs.length;
  const y0 = ys.reduce((a, y) => a + y, 0) / ys.length;
  const cov = xs.reduce((a, x, i) => a + (x - x0) * (ys[i] - y0), 0);
  const variance = xs.reduce((a, x) => a + (x - x0) ** 2, 0);
  const slope = Math.max(-0.12, Math.min(0.12, variance ? cov / variance : 0));
  return { x0, y0, slope };
}

function assignRows(groups, scale) {
  const anchors = groups.filter(g => {
    const b = boundsOf(g);
    return height(b) >= scale * 0.55 && height(b) >= width(b) * 0.4;
  }).sort((a, b) => centerY(boundsOf(a)) - centerY(boundsOf(b)));
  const others = groups.filter(g => !anchors.includes(g));
  const rows = [];
  for (const group of [...anchors, ...others]) {
    const b = boundsOf(group);
    let bestRow = null, bestDistance = Infinity;
    for (const row of rows) {
      const model = rowModel(row);
      const distance = Math.abs(centerY(b) - model.y0 - model.slope * (centerX(b) - model.x0));
      if (distance < bestDistance) { bestDistance = distance; bestRow = row; }
    }
    const tolerance = scale * (anchors.includes(group) ? 0.72 : 0.85);
    if (bestRow && bestDistance <= tolerance) bestRow.push(group);
    else {
      const row = [group];
      row.scale = scale;
      rows.push(row);
    }
  }
  rows.sort((a, b) => rowModel(a).y0 - rowModel(b).y0);
  return rows;
}

export class CharacterCluster {
  constructor(id, lineIndex = 0, blockIndex = 1) {
    this.id = id;
    this.lineIndex = lineIndex;
    this.blockIndex = blockIndex;
    this.strokes = [];
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }
  addStroke(stroke) {
    this.strokes.push(stroke);
    this.bounds = boundsOf(this.strokes);
  }
  get widthPx() { return Math.max(1, width(this.bounds)); }
  get heightPx() { return Math.max(1, height(this.bounds)); }
  get centerX() { return centerX(this.bounds); }
  get centerY() { return centerY(this.bounds); }
}

export class EquationBlock {
  constructor(id, lineIndex = 1, blockIndex = 1) {
    this.id = id;
    this.lineIndex = lineIndex;
    this.blockIndex = blockIndex;
    this.strokes = [];
    this.clusters = [];
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }
  addStroke(stroke) {
    this.strokes.push(stroke);
    this.bounds = boundsOf(this.strokes);
  }
  addCluster(cluster) {
    this.clusters.push(cluster);
    for (const stroke of cluster.strokes) this.addStroke(stroke);
  }
}

export class Grouper {
  static estimateScale(strokes) { return writingScale(strokes); }

  static groupStrokesIntoLines(strokes) {
    if (!strokes?.length) return [];
    const scale = writingScale(strokes);
    const symbols = formSymbols(strokes, scale);
    const rows = assignRows(symbols, scale);
    const blocks = [];
    rows.forEach((row, lineIndex) => {
      row.sort((a, b) => boundsOf(a).minX - boundsOf(b).minX);
      let block = new EquationBlock('', lineIndex + 1, 1);
      for (const group of row) {
        const bounds = boundsOf(group);
        if (block.clusters.length && bounds.minX - block.bounds.maxX > scale * 2.25) {
          blocks.push(block);
          block = new EquationBlock('', lineIndex + 1, block.blockIndex + 1);
        }
        const cluster = new CharacterCluster('', lineIndex + 1, block.blockIndex);
        for (const stroke of group) cluster.addStroke(stroke);
        cluster.weakJoin = !!group.weakJoin;
        block.addCluster(cluster);
      }
      if (block.clusters.length) blocks.push(block);
    });
    blocks.forEach((block, i) => {
      block.id = `Eq ${i + 1}`;
      block.displayIndex = i + 1;
      block.clusters.forEach((c, j) => { c.id = `${block.id}-C${j + 1}`; });
    });
    return blocks;
  }

  static groupStrokes(strokes) {
    return this.groupStrokesIntoLines(strokes).flatMap(block => block.clusters);
  }
}

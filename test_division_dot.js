import assert from 'node:assert/strict';
import { Stroke } from './src/segmentation/Stroke.js';
import { isDivisionDotPosition } from './src/canvas/DivisionDot.js';
import { Grouper } from './src/segmentation/Grouper.js';
import { suggestShapeSymbol } from './src/recognition/ShapeRules.js';

function stroke(points, width = 4) {
  const result = new Stroke();
  result.width = width;
  points.forEach(([x, y]) => result.addPoint(x, y));
  return result;
}

for (const scale of [0.75, 1, 1.5]) {
  const bar = stroke([[35, 55], [65, 55]].map(([x, y]) => [x * scale, y * scale]));
  const top = [50 * scale, 35 * scale];
  const bottom = [50 * scale, 75 * scale];
  assert.equal(isDivisionDotPosition([bar], ...top, 36 * scale), true);
  assert.equal(isDivisionDotPosition([bar, stroke([top])], ...bottom, 36 * scale), true);
  assert.equal(isDivisionDotPosition([bar], 50 * scale, 55 * scale, 36 * scale), false);
  assert.equal(isDivisionDotPosition([bar], 80 * scale, 35 * scale, 36 * scale), false);
  const strokes = [stroke([top]), bar, stroke([bottom])];
  const blocks = Grouper.groupStrokesIntoLines(strokes);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].clusters.length, 1);
  const cluster = blocks[0].clusters[0];
  assert.equal(suggestShapeSymbol(strokes, cluster.bounds, 36 * scale), '÷');
}
console.log('Division dot gesture and grouping cases passed');

import assert from 'node:assert/strict';
import { Stroke } from '../src/segmentation/Stroke.js';
import { suggestShapeSymbol } from '../src/recognition/ShapeRules.js';

const fixtures = [
  { name: 'minus, not division', lines: [[[0, 20], [40, 20]]], expected: '-' },
  { name: 'equals', lines: [[[0, 15], [40, 15]], [[1, 32], [39, 32]]], expected: '=' },
  { name: 'division', lines: [[[20, 0]], [[0, 25], [40, 25]], [[20, 47]]], expected: '÷' },
  { name: 'plus', lines: [[[0, 25], [40, 25]], [[20, 0], [20, 50]]], expected: '+' },
  { name: 'seven with top bar', lines: [[[0, 0], [45, 0], [15, 60]]], expected: '7' },
  { name: 'seven in two strokes', lines: [[[0, 0], [45, 0]], [[45, 0], [15, 60]]], expected: '7' },
  { name: 'straight one', lines: [[[20, 0], [20, 60]]], expected: null },
  { name: 'one with short serif', lines: [[[12, 8], [20, 0], [20, 60]]], expected: null },
  { name: 'one with base', lines: [[[20, 0], [20, 60]], [[4, 60], [36, 60]]], expected: null },
  { name: 'two with lower bar', lines: [[[0, 0], [42, 0], [42, 20], [0, 60], [42, 60]]], expected: null },
  { name: 'open four', lines: [[[0, 0], [0, 34], [40, 34]], [[40, 0], [40, 60]]], expected: null }
];

for (const fixture of fixtures) {
  for (const width of [2, 4, 7]) {
    const strokes = fixture.lines.map(line => {
      const stroke = new Stroke();
      stroke.width = width;
      for (const [x, y] of line) stroke.addPoint(x, y);
      return stroke;
    });
    const bounds = strokes.reduce((b, stroke) => ({
      minX: Math.min(b.minX, stroke.bounds.minX), minY: Math.min(b.minY, stroke.bounds.minY),
      maxX: Math.max(b.maxX, stroke.bounds.maxX), maxY: Math.max(b.maxY, stroke.bounds.maxY)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    assert.equal(suggestShapeSymbol(strokes, bounds, 60), fixture.expected, `${fixture.name}, ${width}px`);
  }
}
console.log(`${fixtures.length * 3} shape cases passed`);

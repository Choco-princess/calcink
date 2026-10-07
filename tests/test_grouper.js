import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Stroke } from '../src/segmentation/Stroke.js';
import { Grouper } from '../src/segmentation/Grouper.js';

// Saved vector drawings. Each nested expected group lists the input stroke
// indices in one symbol; outer groups are equation blocks in reading order.
const fixtures = [
  { name: 'stacked aligned rows', strokes: [
    [[100, 50], [100, 130]], [[150, 70], [150, 110]], [[130, 90], [170, 90]],
    [[100, 200], [100, 280]], [[150, 220], [150, 260]], [[130, 240], [170, 240]]
  ], expected: [[[0], [1, 2]], [[3], [4, 5]]] },
  { name: 'side by side equations', strokes: [
    [[100, 200], [100, 280]], [[150, 220], [150, 260]], [[130, 240], [170, 240]],
    [[500, 200], [500, 280]]
  ], expected: [[[0], [1, 2]], [[3]]] },
  { name: 'tight expression without domino merge', strokes: [
    [[100, 50], [120, 50], [120, 100]], [[145, 60], [145, 90]], [[130, 75], [160, 75]],
    [[170, 50], [200, 50], [170, 100], [200, 100]],
    [[210, 70], [240, 70]], [[210, 85], [240, 85]],
    [[250, 50], [250, 80], [280, 80]], [[275, 50], [275, 100]]
  ], expected: [[[0], [1, 2], [3], [4, 5], [6, 7]]] },
  { name: 'equals bars', strokes: [[[300, 80], [350, 80]], [[300, 110], [350, 110]]], expected: [[[0, 1]]] },
  { name: 'one with base', strokes: [[[60, 50], [60, 120]], [[45, 122], [75, 122]]], expected: [[[0, 1]]] },
  { name: 'small decimal beside number', strokes: [
    [[20, 20], [40, 20], [40, 65]], [[54, 62]], [[70, 20], [90, 20], [70, 65], [90, 65]]
  ], expected: [[[0], [1], [2]]] },
  { name: 'division dots and bar', strokes: [
    [[50, 35]], [[35, 55], [65, 55]], [[50, 75]]
  ], expected: [[[0, 1, 2]]] },
  { name: 'three drawn as two arcs', strokes: [
    [[20, 30], [40, 25], [50, 40], [35, 50]],
    [[35, 53], [50, 65], [40, 80], [20, 75]]
  ], expected: [[[0, 1]]] },
  { name: 'eight drawn as two loops', strokes: [
    [[20, 40], [30, 25], [45, 30], [45, 45], [30, 50], [20, 40]],
    [[30, 52], [45, 55], [50, 70], [35, 82], [20, 70], [30, 52]]
  ], expected: [[[0, 1]]] },
  { name: 'four with separate right stem', strokes: [
    [[20, 25], [20, 55], [45, 55]], [[49, 22], [49, 80]]
  ], expected: [[[0, 1]]] },
  { name: 'close independent strokes', strokes: [
    [[20, 20], [20, 70]], [[30, 20], [30, 70]]
  ], expected: [[[0], [1]]] },
  { name: 'partial second row', strokes: [
    [[20, 20], [20, 70]], [[70, 20], [70, 70]], [[20, 115], [20, 165]]
  ], expected: [[[0], [1]], [[2]]] },
  { name: 'slightly tilted row', strokes: [
    [[20, 20], [20, 70]], [[80, 26], [80, 76]], [[140, 32], [140, 82]]
  ], expected: [[[0], [1], [2]]] }
];

function makeStroke(points, scale, width) {
  const stroke = new Stroke();
  stroke.width = width;
  for (const [x, y] of points) stroke.addPoint(x * scale, y * scale);
  return stroke;
}

for (const fixture of fixtures) {
  for (const scale of [0.75, 1, 1.5]) {
    for (const width of [2, 4, 7]) {
      const strokes = fixture.strokes.map(points => makeStroke(points, scale, width));
      const blocks = Grouper.groupStrokesIntoLines(strokes);
      const membership = blocks.map(block => block.clusters.map(cluster =>
        cluster.strokes.map(stroke => strokes.indexOf(stroke)).sort((a, b) => a - b)));
      assert.deepEqual(membership, fixture.expected,
        `${fixture.name}, scale ${scale}, pen ${width}`);
    }
  }
}

const saved = JSON.parse(readFileSync(new URL('../samples/user-8-9-2026-10-05.json', import.meta.url), 'utf8'));
const savedStrokes = saved.strokes.map(raw => makeStroke(raw.points.map(p => [p.x, p.y]), 1, raw.width));
const savedGroups = Grouper.groupStrokesIntoLines(savedStrokes);
assert.deepEqual(savedGroups.map(row => row.clusters.map(cluster =>
  cluster.strokes.map(stroke => savedStrokes.indexOf(stroke)))),
[[[0], [1], [2], [3], [4], [5], [6], [7]]], 'real 8/9 sample grouping');

console.log(`${fixtures.length * 9 + 1} grouping cases passed`);

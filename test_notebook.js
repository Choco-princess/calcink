import assert from 'node:assert/strict';
import { Stroke } from './src/segmentation/Stroke.js';
import { newNotebook, serializeStrokes, hydrateStrokes, validateNotebook } from './src/notebook/Notebook.js';

const book = newNotebook();
const stroke = new Stroke(42);
stroke.addPoint(12, 20, 0.5);
stroke.addPoint(40, 80, 0.8);
book.pages[0].strokes = serializeStrokes([stroke]);
book.pages[0].corrections = [['42', '8']];
assert.equal(validateNotebook(structuredClone(book)).pages.length, 1);
const restored = hydrateStrokes(book.pages[0].strokes)[0];
assert.equal(restored.id, 42);
assert.deepEqual(restored.points.map(({ x, y, pressure }) => ({ x, y, pressure })),
  [{ x: 12, y: 20, pressure: 0.5 }, { x: 40, y: 80, pressure: 0.8 }]);
assert.ok(restored.bounds.minX < 12 && restored.bounds.maxY > 80);
assert.throws(() => validateNotebook({ ...book, activePageId: 'missing' }));
assert.throws(() => validateNotebook({ ...book, pages: [{ ...book.pages[0], strokes: [{ ...book.pages[0].strokes[0], points: [{ x: NaN, y: 1, pressure: 1 }] }] }] }));
console.log('Notebook save format cases passed');

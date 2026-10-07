import assert from 'node:assert/strict';
import { backingSize, pointerPosition, pixelCrop } from './src/canvas/coordinates.js';

assert.deepEqual(pointerPosition(140, 250, { left: 100, top: 200 }), { x: 40, y: 50 });
assert.deepEqual(backingSize(300, 200, 2), { width: 600, height: 400 });
assert.deepEqual(backingSize(300, 200, 1), { width: 300, height: 200 });
const bounds = { minX: 10, minY: 20, maxX: 30, maxY: 50 };
assert.deepEqual(pixelCrop(bounds, 1, 5, 300, 200),
  { x: 5, y: 15, width: 30, height: 40 });
assert.deepEqual(pixelCrop(bounds, 2, 5, 600, 400),
  { x: 10, y: 30, width: 60, height: 80 });
assert.deepEqual(pixelCrop({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 2, 6, 600, 400),
  { x: 0, y: 0, width: 32, height: 32 });
console.log('Coordinate conversion cases passed');

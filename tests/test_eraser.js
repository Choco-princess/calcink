import assert from 'node:assert/strict';
import { Stroke } from '../src/segmentation/Stroke.js';
import { eraseStrokePixels, strokeTouchesCircle } from '../src/canvas/Eraser.js';

const stroke = new Stroke();
stroke.width = 4;
stroke.addPoint(0, 20);
stroke.addPoint(100, 20);
assert.equal(strokeTouchesCircle(stroke, 50, 20, 8), true, 'middle of sparse line is hittable');
assert.equal(strokeTouchesCircle(stroke, 50, 50, 8), false);
const erased = eraseStrokePixels(stroke, 50, 20, 8);
assert.equal(erased.changed, true);
assert.equal(erased.fragments.length, 2, 'pixel eraser splits one line into two');
assert.ok(erased.fragments[0].bounds.maxX < 50);
assert.ok(erased.fragments[1].bounds.minX > 50);
assert.equal(eraseStrokePixels(stroke, 50, 50, 8).changed, false);
console.log('Pixel eraser cases passed');

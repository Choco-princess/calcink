import assert from 'node:assert/strict';
import { Evaluator } from '../src/evaluator/Evaluator.js';
import { SYMBOLS, correctionKey, applyManualCorrections } from '../src/recognition/Corrections.js';

assert.equal(SYMBOLS.length, 16);
const clusters = [
  { strokeIds: [1], predictedSymbol: '1' },
  { strokeIds: [3, 2], predictedSymbol: '×', confidence: 0.7, source: 'model' },
  { strokeIds: [4], predictedSymbol: '2' },
  { strokeIds: [5], predictedSymbol: '=' }
];
assert.equal(Evaluator.evaluate(clusters.map(cluster => cluster.predictedSymbol)), '2');

const corrections = new Map([[correctionKey(clusters[1]), '+']]);
assert.equal(correctionKey({ strokeIds: [2, 3] }), correctionKey(clusters[1]));
applyManualCorrections([{ clusters }], corrections);
assert.equal(Evaluator.evaluate(clusters.map(cluster => cluster.predictedSymbol)), '3');
assert.equal(clusters[1].source, 'manual');
assert.equal(clusters[1].confidence, null);

const regrouped = { strokeIds: [2, 3, 6], predictedSymbol: '×', source: 'model' };
applyManualCorrections([{ clusters: [regrouped] }], corrections);
assert.equal(regrouped.predictedSymbol, '×');
console.log('Manual correction cases passed');

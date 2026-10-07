import assert from 'node:assert/strict';
import { practiceRow, gradePractice } from './src/evaluator/Practice.js';

const symbols = ['7', '×', '8', '=', '5', '6'];
const row = { clusters: symbols.map((predictedSymbol, index) => ({ predictedSymbol, bounds: { minX: index * 20 } })) };
const block = practiceRow(row);
assert.equal(block.clusters.map(c => c.predictedSymbol).join(''), '7×8=');
assert.equal(block.answerClusters.map(c => c.predictedSymbol).join(''), '56');
assert.equal(block.evaluatedResult, '');
assert.equal(gradePractice(['7', '×', '8', '='], ['5', '6']).kind, 'correct');
assert.equal(gradePractice(['7', '×', '8', '='], ['5', '5']).kind, 'wrong');
assert.equal(gradePractice(['1', '÷', '2', '='], ['.', '5']).kind, 'correct');
assert.equal(gradePractice(['1', '÷', '0', '='], ['0']).kind, 'pending');
assert.equal(gradePractice(['1', '+', '2', '='], []).kind, 'pending');
assert.equal(gradePractice(['1', '+', '2', '='], ['?', '3']).kind, 'pending');
assert.equal(gradePractice(['1', '+', '2'], ['3']).kind, 'pending');
console.log('Practice grading cases passed');

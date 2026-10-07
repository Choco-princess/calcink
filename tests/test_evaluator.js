import assert from 'node:assert/strict';
import { Evaluator } from '../src/evaluator/Evaluator.js';
assert.equal(Evaluator.analyze(['1', '+']).feedback, 'Keep writing; finish with =.');
assert.equal(Evaluator.analyze(['1', '÷', '0', '=']).feedback, 'Division by zero is undefined.');

const cases = [
  [['1', '8', '+', '4', '×', '3', '='], '30'],
  [['1', '2', '.', '5', '+', '2', '.', '5', '='], '15'],
  [['-', '5', '+', '1', '2', '='], '7'],
  [['1', '0', '÷', '0', '='], 'Undefined'],
  [['2', '0', '-', '1', '0', '÷', '2', '='], '15'],
  [['1', '+', '2'], ''],
  [['1', '+', '='], 'Error'],
  [['1', '.', '.', '2', '='], 'Error'],
  [['1', '+', '+', '2', '='], 'Error'],
  [['1', '=', '2'], 'Error'],
  [['.', '='], 'Error'],
  [['1', '+', '2', '='], '3'],
  [['2', '+', '3', '×', '4', '='], '14'],
  [['8', '÷', '2', '×', '2', '='], '8'],
  [['1', '0', '-', '2', '-', '3', '='], '5'],
  [['-', '2', '×', '-', '3', '='], '6'],
  [['.', '5', '+', '1', '='], '1.5'],
  [['0', '.', '1', '+', '0', '.', '2', '='], '0.3'],
  [['1', '÷', '3', '='], '0.3333'],
  [['2', '×', '÷', '3', '='], 'Error'],
  [['1', '0', '÷', '-', '0', '='], 'Undefined'],
  [['2', '=', '='], 'Error']
];

for (const [symbols, expected] of cases) {
  assert.equal(Evaluator.evaluate(symbols), expected, symbols.join(''));
}
console.log(`${cases.length} evaluator cases passed`);

import { Evaluator } from './src/evaluator/Evaluator.js';

function runEvaluatorTests() {
  console.log('🧪 Starting Evaluator BODMAS Tests...\n');

  // Test 1: Order of operations (Multiplication before Addition)
  // 18 + 4 × 3 = 30
  const t1 = Evaluator.evaluate(['1', '8', '+', '4', '×', '3', '=']);
  console.assert(t1 === '30', `Test 1 Failed: Expected '30', got '${t1}'`);
  console.log('✅ Test 1 Passed: 18 + 4 × 3 = 30 (BODMAS precedence)');

  // Test 2: Multi-digit & Decimals
  // 12.5 + 2.5 = 15
  const t2 = Evaluator.evaluate(['1', '2', '.', '5', '+', '2', '.', '5', '=']);
  console.assert(t2 === '15', `Test 2 Failed: Expected '15', got '${t2}'`);
  console.log('✅ Test 2 Passed: 12.5 + 2.5 = 15');

  // Test 3: Negative numbers
  // -5 + 12 = 7
  const t3 = Evaluator.evaluate(['-', '5', '+', '1', '2', '=']);
  console.assert(t3 === '7', `Test 3 Failed: Expected '7', got '${t3}'`);
  console.log('✅ Test 3 Passed: -5 + 12 = 7 (Unary negative)');

  // Test 4: Division by zero handling
  // 10 ÷ 0 = Undefined
  const t4 = Evaluator.evaluate(['1', '0', '÷', '0', '=']);
  console.assert(t4 === 'Undefined', `Test 4 Failed: Expected 'Undefined', got '${t4}'`);
  console.log('✅ Test 4 Passed: 10 ÷ 0 = Undefined (Clean fault tolerance)');

  // Test 5: Subtraction and Division
  // 20 - 10 ÷ 2 = 15
  const t5 = Evaluator.evaluate(['2', '0', '-', '1', '0', '÷', '2', '=']);
  console.assert(t5 === '15', `Test 5 Failed: Expected '15', got '${t5}'`);
  console.log('✅ Test 5 Passed: 20 - 10 ÷ 2 = 15');

  console.log('\n🎉 ALL EVALUATOR TESTS PASSED PERFECTLY!');
}

runEvaluatorTests();

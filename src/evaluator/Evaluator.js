/**
 * Deterministic BODMAS / PEMDAS Arithmetic Evaluator.
 * 
 * Rules:
 * 1. Supports multi-digit integers, floating-point decimals, negative numbers.
 * 2. Strict operator precedence: × and ÷ before + and -.
 * 3. Left-associative for equal precedence.
 * 4. Zero division handling: returns 'Undefined'.
 * 5. Safe execution: NO eval() or Function() used.
 */

export class Evaluator {
  /**
   * Tokenize an array of raw symbol strings (e.g. ['1', '8', '+', '4', '×', '3', '='])
   * into numbers and operators.
   */
  static tokenize(symbols) {
    const tokens = [];
    let currentNumber = '';

    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i];

      if (s === '=') {
        if (currentNumber !== '') {
          tokens.push({ type: 'number', value: parseFloat(currentNumber) });
          currentNumber = '';
        }
        tokens.push({ type: 'equals', value: '=' });
        break; // terminal symbol
      }

      // Check if it's part of a number (digit or decimal point)
      if (/^[0-9]$/.test(s) || s === '.') {
        if (s === '.' && currentNumber.includes('.')) {
          // Ignore secondary decimal points in the same number
          continue;
        }
        currentNumber += s;
      } else if (['+', '-', '×', '÷', '*', '/'].includes(s)) {
        if (currentNumber !== '') {
          tokens.push({ type: 'number', value: parseFloat(currentNumber) });
          currentNumber = '';
        } else if (s === '-' && (tokens.length === 0 || tokens[tokens.length - 1].type === 'operator')) {
          // Unary minus for negative number (e.g. -5 or 4 * -2)
          currentNumber = '-';
          continue;
        }

        // Standardize operators
        let op = s;
        if (op === '*') op = '×';
        if (op === '/') op = '÷';

        tokens.push({ type: 'operator', value: op });
      }
    }

    if (currentNumber !== '' && currentNumber !== '-') {
      tokens.push({ type: 'number', value: parseFloat(currentNumber) });
    }

    return tokens;
  }

  /**
   * Parse and evaluate tokens using Shunting-Yard algorithm (BODMAS).
   * @param {Array} tokens
   * @returns {string} Result string or 'Undefined' or 'Error'
   */
  static evaluateTokens(tokens) {
    if (!tokens || tokens.length === 0) return '';

    // Filter out trailing equals sign if present
    const mathTokens = tokens.filter(t => t.type !== 'equals');
    if (mathTokens.length === 0) return '';

    // If starts or ends with invalid operator sequence
    if (mathTokens[mathTokens.length - 1].type === 'operator') {
      return ''; // Incomplete expression, don't show error yet
    }

    const precedence = {
      '+': 1,
      '-': 1,
      '×': 2,
      '÷': 2
    };

    // Shunting-Yard Algorithm to convert to Postfix (RPN)
    const outputQueue = [];
    const operatorStack = [];

    for (const token of mathTokens) {
      if (token.type === 'number') {
        outputQueue.push(token.value);
      } else if (token.type === 'operator') {
        const o1 = token.value;
        while (
          operatorStack.length > 0 &&
          precedence[operatorStack[operatorStack.length - 1]] >= precedence[o1]
        ) {
          outputQueue.push(operatorStack.pop());
        }
        operatorStack.push(o1);
      }
    }

    while (operatorStack.length > 0) {
      outputQueue.push(operatorStack.pop());
    }

    // Evaluate Postfix expression
    const evalStack = [];

    for (const item of outputQueue) {
      if (typeof item === 'number') {
        evalStack.push(item);
      } else {
        const b = evalStack.pop();
        const a = evalStack.pop();

        if (a === undefined || b === undefined) {
          return 'Error';
        }

        let res;
        switch (item) {
          case '+':
            res = a + b;
            break;
          case '-':
            res = a - b;
            break;
          case '×':
            res = a * b;
            break;
          case '÷':
            if (b === 0) {
              return 'Undefined'; // Division by zero
            }
            res = a / b;
            break;
          default:
            return 'Error';
        }

        evalStack.push(res);
      }
    }

    if (evalStack.length !== 1) return 'Error';

    const finalAnswer = evalStack[0];
    if (isNaN(finalAnswer)) return 'Error';
    if (!isFinite(finalAnswer)) return 'Undefined';

    // Format cleanly (e.g. 5 or 3.1416)
    return Number.isInteger(finalAnswer)
      ? finalAnswer.toString()
      : parseFloat(finalAnswer.toFixed(4)).toString();
  }

  /**
   * High-level evaluation: takes raw predicted symbols array and returns evaluated result.
   */
  static evaluate(symbols) {
    const tokens = Evaluator.tokenize(symbols);
    // Only evaluate if expression has an '=' sign or at least one operator
    const hasEquals = symbols.includes('=');
    const hasOperator = tokens.some(t => t.type === 'operator');

    if (!hasEquals && !hasOperator) return '';

    return Evaluator.evaluateTokens(tokens);
  }
}

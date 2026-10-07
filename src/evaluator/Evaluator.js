// A small strict parser for the competition's 16-symbol vocabulary.
// Only a terminal '=' requests a result. Unknown or malformed input is never
// silently discarded, and JavaScript eval is never used.
export class Evaluator {
  static evaluate(symbols) {
    if (!symbols.includes('=')) return '';
    if (symbols.at(-1) !== '=' || symbols.slice(0, -1).includes('=')) return 'Error';
    const input = symbols.slice(0, -1);
    if (!input.length) return 'Error';
    let i = 0;

    function number() {
      let value = '';
      let digits = 0;
      let dots = 0;
      while (i < input.length && (/^[0-9]$/.test(input[i]) || input[i] === '.')) {
        if (input[i] === '.') dots++;
        else digits++;
        value += input[i++];
      }
      if (!digits || dots > 1 || value.endsWith('.')) throw new Error('Malformed number');
      const result = Number(value);
      if (!Number.isFinite(result)) throw new Error('Number out of range');
      return result;
    }

    function factor() {
      const negative = input[i] === '-';
      if (negative) i++;
      const value = number();
      return negative ? -value : value;
    }

    function term() {
      let value = factor();
      while (input[i] === '×' || input[i] === '÷') {
        const op = input[i++];
        const rhs = factor();
        if (op === '÷' && rhs === 0) throw new RangeError('Division by zero');
        value = op === '×' ? value * rhs : value / rhs;
      }
      return value;
    }

    function expression() {
      let value = term();
      while (input[i] === '+' || input[i] === '-') {
        const op = input[i++];
        const rhs = term();
        value = op === '+' ? value + rhs : value - rhs;
      }
      return value;
    }

    try {
      const answer = expression();
      if (i !== input.length) return 'Error';
      if (!Number.isFinite(answer)) return 'Undefined';
      const rounded = Number(answer.toFixed(4));
      return Object.is(rounded, -0) ? '0' : rounded.toString();
    } catch (error) {
      return error instanceof RangeError ? 'Undefined' : 'Error';
    }
  }
}

import { Evaluator } from './Evaluator.js';

export function practiceRow(row) {
  const equalsIndex = row.clusters.findIndex(cluster => cluster.predictedSymbol === '=');
  const question = equalsIndex < 0 ? row.clusters : row.clusters.slice(0, equalsIndex + 1);
  const answer = equalsIndex < 0 ? [] : row.clusters.slice(equalsIndex + 1);
  const evaluation = Evaluator.analyze(question.map(cluster => cluster.predictedSymbol));
  return { ...row, clusters: question, answerClusters: answer, evaluation, evaluatedResult: '' };
}

export function gradePractice(questionSymbols, answerSymbols) {
  const evaluation = Evaluator.analyze(questionSymbols);
  if (!questionSymbols.includes('=')) return { kind: 'pending', message: 'Finish the question with =.' };
  if (evaluation.result === 'Error' || evaluation.result === 'Undefined') {
    return { kind: 'pending', message: `Fix the question first. ${evaluation.feedback}` };
  }
  if (!answerSymbols.length) return { kind: 'pending', message: 'Write your answer after =, then press Check.' };
  const answer = answerSymbols.join('');
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(answer)) {
    return { kind: 'pending', message: 'Check the handwritten answer symbols, then try again.' };
  }
  const value = Number(answer);
  if (!Number.isFinite(value)) return { kind: 'pending', message: 'The handwritten answer is too large.' };
  const expected = Number(evaluation.result);
  return Math.abs(value - expected) < 0.00005
    ? { kind: 'correct', message: 'Correct!' }
    : { kind: 'wrong', message: 'Not quite. Try changing your answer or correcting a symbol.' };
}

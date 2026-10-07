export const SYMBOLS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '×', '÷', '.', '='];

export function correctionKey(cluster) {
  return JSON.stringify([...cluster.strokeIds].sort((a, b) => a - b));
}

export function applyManualCorrections(rows, corrections) {
  for (const cluster of rows.flatMap(row => row.clusters)) {
    const symbol = corrections.get(correctionKey(cluster));
    if (!symbol) continue;
    cluster.predictedSymbol = symbol;
    cluster.confidence = null;
    cluster.source = 'manual';
  }
}

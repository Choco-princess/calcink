import { CanvasManager } from './canvas/CanvasManager.js';
import { PatchExtractor } from './recognition/PatchExtractor.js';
import { Evaluator } from './evaluator/Evaluator.js';
import { SYMBOLS, correctionKey, applyManualCorrections } from './recognition/Corrections.js';

function splitAtEquals(rows) {
  const blocks = [];
  for (const row of rows) {
    let current = [];
    for (const cluster of row.clusters) {
      current.push(cluster);
      if (cluster.predictedSymbol === '=') {
        blocks.push({ ...row, clusters: current });
        current = [];
      }
    }
    if (current.length) blocks.push({ ...row, clusters: current });
  }
  blocks.forEach((block, index) => {
    block.id = `Eq ${index + 1}`;
    block.displayIndex = index + 1;
    block.bounds = block.clusters.reduce((b, c) => ({
      minX: Math.min(b.minX, c.bounds.minX),
      minY: Math.min(b.minY, c.bounds.minY),
      maxX: Math.max(b.maxX, c.bounds.maxX),
      maxY: Math.max(b.maxY, c.bounds.maxY)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    block.evaluatedResult = Evaluator.evaluate(block.clusters.map(c => c.predictedSymbol));
  });
  return blocks;
}

window.addEventListener('DOMContentLoaded', () => {
  const inkCanvas = document.getElementById('ink-canvas');
  const overlayCanvas = document.getElementById('overlay-canvas');
  const statStrokes = document.getElementById('stat-strokes');
  const statClusters = document.getElementById('stat-clusters');
  const statSequence = document.getElementById('stat-sequence');
  const status = document.getElementById('app-status');
  const offlineStatus = document.getElementById('offline-status');
  const canvasTip = document.getElementById('canvas-tip');
  const correctionDialog = document.getElementById('correction-dialog');
  const correctionContext = document.getElementById('correction-context');
  const correctionOptions = document.getElementById('correction-options');
  const canvasManager = new CanvasManager(inkCanvas, overlayCanvas, { debounceMs: 250 });
  const worker = new Worker(new URL('./recognition/recognition.worker.js', import.meta.url), { type: 'module' });
  let revision = 0;
  let modelReady = false;
  let pendingRows = [];
  let writingScale = 36;
  let repairCandidates = [];
  const manualCorrections = new Map();
  let selectedCluster = null;
  let hasDrawn = false;

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => navigator.serviceWorker.ready)
      .then(() => { offlineStatus.textContent = ' • Offline saved'; })
      .catch(error => console.warn('Offline cache unavailable:', error));
  }

  function showSummary() {
    if (canvasManager.strokes.length > 0) hasDrawn = true;
    canvasTip.hidden = hasDrawn;
    statStrokes.textContent = canvasManager.strokes.length;
    statClusters.textContent = canvasManager.blocks.reduce((n, b) => n + b.clusters.length, 0);
    statSequence.textContent = canvasManager.blocks.length
      ? canvasManager.blocks.map(b => {
        const expression = b.clusters.map(c => c.predictedSymbol || '?').join(' ');
        return `[${b.id}: ${expression}${b.evaluatedResult ? ` → ${b.evaluatedResult}` : ''}]`;
      }).join('  |  ')
      : '[ none ]';
  }

  canvasManager.onCanvasChanged = () => {
    if (!correctionDialog.open) selectedCluster = null;
    if (canvasManager.activeStroke) hasDrawn = true;
    revision++;
    pendingRows = [];
    repairCandidates = [];
    canvasManager.blocks = [];
    canvasManager.drawOverlay();
    showSummary();
  };

  canvasManager.onSymbolTap = (x, y, event) => {
    const padding = event.pointerType === 'touch' ? 12 : 7;
    const hits = canvasManager.blocks.flatMap(block => block.clusters)
      .filter(cluster => cluster.predictedSymbol &&
        x >= cluster.bounds.minX - padding && x <= cluster.bounds.maxX + padding &&
        y >= cluster.bounds.minY - padding && y <= cluster.bounds.maxY + padding);
    if (!hits.length) return false;
    hits.sort((a, b) => {
      const distance = cluster => {
        const centerX = (cluster.bounds.minX + cluster.bounds.maxX) / 2;
        const centerY = (cluster.bounds.minY + cluster.bounds.maxY) / 2;
        return Math.hypot(x - centerX, y - centerY);
      };
      return distance(a) - distance(b);
    });
    selectedCluster = hits[0];
    correctionContext.textContent = `Currently read as ${selectedCluster.predictedSymbol}. Choose what you wrote:`;
    for (const button of correctionOptions.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.symbol === selectedCluster.predictedSymbol);
      button.setAttribute('aria-pressed', button.dataset.symbol === selectedCluster.predictedSymbol ? 'true' : 'false');
    }
    document.getElementById('correction-automatic').hidden = selectedCluster.source !== 'manual';
    return true;
  };

  // A touch sends a click after pointerup. Open the picker from that click so
  // the same gesture cannot land on an option that appeared under the finger.
  overlayCanvas.addEventListener('click', event => {
    if (!selectedCluster || correctionDialog.open) return;
    event.preventDefault();
    event.stopPropagation();
    correctionDialog.showModal();
  });

  function chooseSymbol(symbol) {
    if (!selectedCluster) return;
    const key = correctionKey(selectedCluster);
    if (symbol === null) {
      manualCorrections.delete(key);
      selectedCluster.predictedSymbol = selectedCluster.automaticSymbol;
      selectedCluster.source = selectedCluster.automaticSource;
      selectedCluster.confidence = selectedCluster.automaticConfidence;
    } else {
      manualCorrections.set(key, symbol);
      selectedCluster.predictedSymbol = symbol;
      selectedCluster.confidence = null;
      selectedCluster.source = 'manual';
    }
    repairCandidates = [];
    canvasManager.blocks = splitAtEquals(pendingRows);
    canvasManager.drawOverlay();
    showSummary();
    correctionDialog.close();
    selectedCluster = null;
  }

  for (const symbol of SYMBOLS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.dataset.symbol = symbol;
    button.textContent = symbol === '-' ? '−' : symbol;
    button.setAttribute('aria-label', `Use ${symbol === '-' ? 'minus' : symbol}`);
    button.addEventListener('click', () => chooseSymbol(symbol));
    correctionOptions.append(button);
  }
  document.getElementById('correction-automatic').addEventListener('click', () => chooseSymbol(null));
  document.getElementById('correction-close').addEventListener('click', () => correctionDialog.close());
  correctionDialog.addEventListener('close', () => { selectedCluster = null; });
  canvasManager.onStrokesReady = strokes => {
    const serialized = strokes.map(s => ({
      id: s.id, color: s.color, width: s.width,
      points: s.points.map(p => ({ x: p.x, y: p.y, pressure: p.pressure }))
    }));
    worker.postMessage({ type: 'group', revision, strokes: serialized });
  };

  async function extractAndPredict(rows, requestRevision) {
    const clusters = rows.flatMap(row => row.clusters);
    if (!clusters.length) {
      canvasManager.blocks = [];
      showSummary();
      return;
    }
    if (!modelReady) {
      canvasManager.blocks = rows;
      canvasManager.drawOverlay();
      showSummary();
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const patches = [];
    for (let i = 0; i < clusters.length; i++) {
      if (requestRevision !== revision) return;
      patches.push(PatchExtractor.extractPatch(inkCanvas, clusters[i].bounds, dpr).buffer);
      if (i % 8 === 7) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (requestRevision === revision) {
      worker.postMessage({ type: 'predict', revision, patches }, patches);
    }
  }

  function joinedBounds(a, b) {
    return {
      minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY)
    };
  }

  function reconsiderLocalGrouping() {
    const patches = [];
    repairCandidates = [];
    const dpr = window.devicePixelRatio || 1;
    canvasManager.blocks.forEach((block, blockIndex) => {
      if (block.evaluatedResult !== 'Error') return;
      if (block.clusters.some(cluster => cluster.source === 'manual')) return;
      const clusters = block.clusters;
      for (let i = 0; i < clusters.length && repairCandidates.length < 8; i++) {
        const current = clusters[i];
        if (current.weakJoin && current.strokeBounds?.length === 2 &&
            current.predictedSymbol !== '=') {
          const start = patches.length;
          const parts = current.strokeBounds.map((bounds, index) => ({
            bounds, strokeId: current.strokeIds[index]
          })).sort((a, b) => a.bounds.minX - b.bounds.minX);
          parts.forEach(part => patches.push(PatchExtractor.extractPatch(inkCanvas, part.bounds, dpr).buffer));
          repairCandidates.push({ kind: 'split', blockIndex, index: i, start, count: 2,
            bounds: parts.map(part => part.bounds), strokeIds: parts.map(part => [part.strokeId]) });
        }
        if (i + 1 >= clusters.length) continue;
        const next = clusters[i + 1];
        const b = joinedBounds(current.bounds, next.bounds);
        const gap = next.bounds.minX - current.bounds.maxX;
        const uncertain = Math.min(current.confidence ?? 1, next.confidence ?? 1) < 0.8;
        if (uncertain && gap <= writingScale * 0.13 &&
            b.maxX - b.minX <= writingScale * 1.65 &&
            b.maxY - b.minY <= writingScale * 2.15) {
          const start = patches.length;
          patches.push(PatchExtractor.extractPatch(inkCanvas, b, dpr).buffer);
          repairCandidates.push({ kind: 'merge', blockIndex, index: i, start, count: 1, bounds: b,
            strokeIds: [[...current.strokeIds, ...next.strokeIds]] });
        }
      }
    });
    if (patches.length) worker.postMessage({ type: 'predict', purpose: 'repair', revision, patches }, patches);
  }

  function applyRepair(predictions) {
    const bestByBlock = new Map();
    for (const candidate of repairCandidates) {
      const block = canvasManager.blocks[candidate.blockIndex];
      if (!block || block.evaluatedResult !== 'Error') continue;
      const proposed = predictions.slice(candidate.start, candidate.start + candidate.count);
      const confidence = Math.min(...proposed.map(p => p.confidence));
      if (confidence < 0.85) continue;
      const symbols = block.clusters.map(c => c.predictedSymbol);
      symbols.splice(candidate.index, candidate.kind === 'split' ? 1 : 2,
        ...proposed.map(p => p.symbol));
      const answer = Evaluator.evaluate(symbols);
      if (!answer || answer === 'Error') continue;
      if (!bestByBlock.has(candidate.blockIndex) || confidence > bestByBlock.get(candidate.blockIndex).confidence) {
        bestByBlock.set(candidate.blockIndex, { candidate, proposed, confidence, answer });
      }
    }
    for (const [blockIndex, choice] of bestByBlock) {
      const block = canvasManager.blocks[blockIndex];
      const { candidate, proposed, answer } = choice;
      const old = block.clusters[candidate.index];
      const bounds = Array.isArray(candidate.bounds) ? candidate.bounds : [candidate.bounds];
      const replacements = proposed.map((prediction, i) => {
        const b = bounds[i];
        return {
          ...old, bounds: b, centerY: (b.minY + b.maxY) / 2,
          widthPx: b.maxX - b.minX, heightPx: b.maxY - b.minY,
          predictedSymbol: prediction.symbol, confidence: prediction.confidence,
          automaticSymbol: prediction.symbol, automaticConfidence: prediction.confidence,
          automaticSource: 'model', source: 'model', strokeIds: candidate.strokeIds[i],
          strokeCount: candidate.kind === 'split' ? 1 : old.strokeCount + block.clusters[candidate.index + 1].strokeCount
        };
      });
      const row = pendingRows.find(row => row.clusters.includes(old));
      if (row) {
        const rowIndex = row.clusters.indexOf(old);
        row.clusters.splice(rowIndex, candidate.kind === 'split' ? 1 : 2, ...replacements);
      }
      block.clusters.splice(candidate.index, candidate.kind === 'split' ? 1 : 2, ...replacements);
    }
    canvasManager.blocks = splitAtEquals(pendingRows);
    canvasManager.drawOverlay();
    showSummary();
    repairCandidates = [];
  }

  worker.onmessage = ({ data }) => {
    if (data.type === 'ready') {
      modelReady = true;
      status.textContent = 'Ready';
      canvasManager.updateClusters();
      return;
    }
    if (data.type === 'error') {
      if (data.revision === undefined || data.revision === revision) {
        status.textContent = 'Recognition unavailable';
        console.error('CalcInk recognition:', data.message);
      }
      return;
    }
    if (data.revision !== revision) return;
    if (data.type === 'grouped') {
      pendingRows = data.blocks;
      writingScale = data.scale;
      canvasManager.blocks = pendingRows;
      canvasManager.drawOverlay();
      showSummary();
      extractAndPredict(pendingRows, revision);
    } else if (data.type === 'predicted') {
      if (data.purpose === 'repair') {
        applyRepair(data.predictions);
        return;
      }
      const clusters = pendingRows.flatMap(row => row.clusters);
      if (clusters.length !== data.predictions.length) return;
      clusters.forEach((cluster, i) => {
        const prediction = data.predictions[i];
        const smallMark = cluster.strokeCount === 1 &&
          Math.max(cluster.widthPx, cluster.heightPx) <= Math.max(10, writingScale * 0.24);
        cluster.predictedSymbol = smallMark ? '.' : cluster.shapeSuggestion || prediction.symbol;
        cluster.confidence = smallMark || cluster.shapeSuggestion ? null : prediction.confidence;
        cluster.candidates = prediction.candidates;
        cluster.source = smallMark ? 'dot' : cluster.shapeSuggestion ? 'shape' : 'model';
        cluster.automaticSymbol = cluster.predictedSymbol;
        cluster.automaticConfidence = cluster.confidence;
        cluster.automaticSource = cluster.source;
      });
      applyManualCorrections(pendingRows, manualCorrections);
      canvasManager.blocks = splitAtEquals(pendingRows);
      canvasManager.drawOverlay();
      showSummary();
      reconsiderLocalGrouping();
    }
  };
  worker.onerror = event => {
    status.textContent = 'Recognition unavailable';
    console.error('CalcInk worker:', event.message);
  };
  worker.postMessage({ type: 'init' });

  const toolButtons = {
    pen: document.getElementById('btn-pen'),
    eraser: document.getElementById('btn-eraser'),
    'pixel-eraser': document.getElementById('btn-pixel-eraser')
  };
  for (const [tool, button] of Object.entries(toolButtons)) {
    button.addEventListener('click', () => {
      canvasManager.setTool(tool);
      Object.values(toolButtons).forEach(b => b.classList.remove('active'));
      button.classList.add('active');
    });
  }
  for (const button of document.querySelectorAll('[data-width]')) {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-width]').forEach(b => b.classList.remove('active'));
      button.classList.add('active');
      canvasManager.setPenWidth(Number(button.dataset.width));
    });
  }
  document.getElementById('btn-undo').addEventListener('click', () => canvasManager.undo());
  document.getElementById('btn-redo').addEventListener('click', () => canvasManager.redo());
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (window.confirm('Clear the entire canvas?')) {
      manualCorrections.clear();
      canvasManager.clear();
    }
  });
  const boxButton = document.getElementById('btn-toggle-boxes');
  boxButton.addEventListener('click', () => {
    canvasManager.toggleBoundingBoxes(!canvasManager.options.showBoundingBoxes);
    boxButton.classList.toggle('active', canvasManager.options.showBoundingBoxes);
    boxButton.setAttribute('aria-pressed', String(canvasManager.options.showBoundingBoxes));
    boxButton.querySelector('span').textContent =
      canvasManager.options.showBoundingBoxes ? 'Hide Recognition' : 'Show Recognition';
  });
  let sampleUrl = null;
  document.getElementById('btn-save-sample').addEventListener('click', () => {
    const rect = inkCanvas.getBoundingClientRect();
    const sample = {
      schema: 1,
      expected: '',
      canvas: { width: rect.width, height: rect.height },
      strokes: canvasManager.strokes.map(s => ({
        width: s.width,
        points: s.points.map(p => ({ x: p.x, y: p.y }))
      })),
      observed: canvasManager.blocks.map(block => ({
        symbols: block.clusters.map(c => c.predictedSymbol || '?').join(''),
        result: block.evaluatedResult || '',
        clusters: block.clusters.map(c => ({
          bounds: c.bounds, symbol: c.predictedSymbol || '?', source: c.source || 'pending',
          confidence: c.confidence, candidates: c.candidates || []
        }))
      }))
    };
    const json = JSON.stringify(sample, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    if (sampleUrl) URL.revokeObjectURL(sampleUrl);
    const url = URL.createObjectURL(blob);
    sampleUrl = url;
    const download = document.getElementById('sample-download');
    download.href = url;
    download.download = `calcink-sample-${Date.now()}.json`;
    document.getElementById('sample-json').value = json;
    document.getElementById('sample-dialog').showModal();
  });
  document.getElementById('sample-copy').addEventListener('click', async () => {
    const field = document.getElementById('sample-json');
    try {
      await navigator.clipboard.writeText(field.value);
      document.getElementById('sample-copy').textContent = 'Copied';
    } catch {
      field.focus();
      field.select();
      document.getElementById('sample-copy').textContent = 'Selected — press Ctrl+C';
    }
  });
  document.getElementById('sample-close').addEventListener('click', () => {
    document.getElementById('sample-dialog').close();
    document.getElementById('sample-copy').textContent = 'Copy JSON';
  });
  window.addEventListener('keydown', event => {
    if (correctionDialog.open || document.getElementById('sample-dialog').open) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? canvasManager.redo() : canvasManager.undo();
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault();
      canvasManager.redo();
    }
  });
});

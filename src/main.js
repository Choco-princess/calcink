import { CanvasManager } from './canvas/CanvasManager.js';
import { PatchExtractor } from './recognition/PatchExtractor.js';
import { Evaluator } from './evaluator/Evaluator.js';
import { SYMBOLS, correctionKey, applyManualCorrections } from './recognition/Corrections.js';
import { blankPage, newNotebook, serializeStrokes, hydrateStrokes, validateNotebook, loadNotebook, saveNotebook } from './notebook/Notebook.js';
import { isDivisionDotPosition, isDirectBarInkTap } from './canvas/DivisionDot.js';
import { practiceRow, gradePractice } from './evaluator/Practice.js';
import { FeedbackEffects } from './ui/FeedbackEffects.js';

function splitAtEquals(rows, practiceMode = false) {
  const blocks = [];
  for (const row of rows) {
    if (practiceMode) {
      blocks.push(practiceRow(row));
      continue;
    }
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
    block.bounds = [...block.clusters, ...(block.answerClusters || [])].reduce((b, c) => ({
      minX: Math.min(b.minX, c.bounds.minX),
      minY: Math.min(b.minY, c.bounds.minY),
      maxX: Math.max(b.maxX, c.bounds.maxX),
      maxY: Math.max(b.maxY, c.bounds.maxY)
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    if (!practiceMode) {
      block.evaluation = Evaluator.analyze(block.clusters.map(c => c.predictedSymbol));
      block.evaluatedResult = block.evaluation.result;
    }
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
  const pageSurface = document.getElementById('page-surface');
  const pageSpacer = document.getElementById('page-spacer');
  const pageTabs = document.getElementById('page-tabs');
  const notebookFeedback = document.getElementById('notebook-feedback');
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
  let book = newNotebook();
  let zoom = 1;
  let saveTimer = null;
  let saveQueue = Promise.resolve();
  let loadingPage = false;
  let persistenceAvailable = true;
  let practiceMode = false;
  const effects = new FeedbackEffects();
  try { practiceMode = localStorage.getItem('calcink-practice-mode') === 'true'; } catch {}
  overlayCanvas.style.pointerEvents = 'none';

  const currentPage = () => book.pages.find(page => page.id === book.activePageId);
  function applyPageSize() {
    const page = currentPage();
    pageSurface.style.width = `${page.width}px`;
    pageSurface.style.height = `${page.height}px`;
    pageSurface.style.transform = `scale(${zoom})`;
    pageSpacer.style.width = `${page.width * zoom}px`;
    pageSpacer.style.height = `${page.height * zoom}px`;
    document.getElementById('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
    canvasManager.handleResize();
  }

  function renderPages() {
    pageTabs.replaceChildren();
    book.pages.forEach(page => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn${page.id === book.activePageId ? ' active' : ''}`;
      button.textContent = page.title;
      button.setAttribute('aria-current', page.id === book.activePageId ? 'page' : 'false');
      button.addEventListener('click', () => openPage(page.id));
      pageTabs.append(button);
    });
    document.getElementById('btn-delete-page').disabled = book.pages.length === 1;
  }

  function capturePage() {
    const page = currentPage();
    page.strokes = serializeStrokes(canvasManager.strokes);
    page.corrections = [...manualCorrections];
  }

  function saveLater() {
    if (loadingPage || !persistenceAvailable) return;
    capturePage();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  function saveNow() {
    if (loadingPage || !persistenceAvailable) return;
    clearTimeout(saveTimer);
    capturePage();
    const snapshot = structuredClone(book);
    saveQueue = saveQueue.then(() => saveNotebook(snapshot)).catch(error => {
      persistenceAvailable = false;
      notebookFeedback.textContent = 'Local save unavailable. Export your notebook to keep it.';
      console.error('CalcInk notebook save:', error);
    });
  }

  function openPage(id) {
    if (id === book.activePageId) return;
    capturePage();
    book.activePageId = id;
    loadPage();
    saveNow();
  }

  function loadPage() {
    loadingPage = true;
    correctionDialog.close();
    manualCorrections.clear();
    for (const [key, value] of currentPage().corrections) manualCorrections.set(key, value);
    zoom = 1;
    applyPageSize();
    canvasManager.loadStrokes(hydrateStrokes(currentPage().strokes));
    hasDrawn = canvasManager.strokes.length > 0;
    canvasTip.hidden = hasDrawn;
    document.querySelector('.canvas-wrapper').scrollTo(0, 0);
    renderPages();
    loadingPage = false;
  }

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
    statClusters.textContent = canvasManager.blocks.reduce((n, b) => n + b.clusters.length + (b.answerClusters?.length || 0), 0);
    statSequence.textContent = canvasManager.blocks.length
      ? canvasManager.blocks.map(b => {
        const expression = b.clusters.map(c => c.predictedSymbol || '?').join(' ');
        const answer = practiceMode && b.answerClusters?.length
          ? ` | Your answer: ${b.answerClusters.map(c => c.predictedSymbol || '?').join(' ')}` : '';
        return `[${b.id}: ${expression}${answer}${b.evaluatedResult ? ` → ${b.evaluatedResult}` : ''}]`;
      }).join('  |  ')
      : '[ none ]';
    if (!persistenceAvailable) return;
    const blocks = canvasManager.blocks;
    if (!canvasManager.strokes.length) notebookFeedback.textContent = practiceMode
      ? 'Practice: write one equation per row, then your answer after =.' : 'Write an equation ending in =';
    else if (blocks.some(b => [...b.clusters, ...(b.answerClusters || [])].some(c => !c.predictedSymbol))) notebookFeedback.textContent = 'Reading handwriting…';
    else if (practiceMode) notebookFeedback.textContent =
      blocks.find(b => b.practiceMark === 'wrong')?.practiceFeedback ||
      blocks.find(b => b.practiceFeedback && !b.practiceMark)?.practiceFeedback ||
      blocks.find(b => b.practiceFeedback)?.practiceFeedback ||
      'Write your answer after =, then press Check.';
    else notebookFeedback.textContent = blocks.find(b => b.evaluation?.result === 'Error')?.evaluation.feedback ||
      blocks.find(b => b.evaluation?.result === 'Undefined')?.evaluation.feedback ||
      blocks.find(b => b.evaluation?.result === '')?.evaluation.feedback || 'Answers updated.';
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
    saveLater();
  };
  canvasManager.onStrokeCommitted = saveNow;

  canvasManager.onSymbolTap = (x, y, event) => {
    if (isDivisionDotPosition(canvasManager.strokes, x, y, writingScale)) return false;
    const padding = event.pointerType === 'touch' ? 12 : 7;
    const hits = canvasManager.blocks.flatMap(block => [...block.clusters, ...(block.answerClusters || [])])
      .filter(cluster => cluster.predictedSymbol &&
        x >= cluster.bounds.minX - padding && x <= cluster.bounds.maxX + padding &&
        y >= cluster.bounds.minY - padding && y <= cluster.bounds.maxY + padding &&
        isDirectBarInkTap(cluster, canvasManager.strokes, x, y, event.pointerType));
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
    canvasManager.blocks = splitAtEquals(pendingRows, practiceMode);
    canvasManager.drawOverlay();
    showSummary();
    saveNow();
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
    if (practiceMode) return;
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
    canvasManager.blocks = splitAtEquals(pendingRows, practiceMode);
    canvasManager.drawOverlay();
    showSummary();
    repairCandidates = [];
  }

  worker.onmessage = ({ data }) => {
    if (data.type === 'ready') {
      modelReady = true;
      status.textContent = 'Ready';
      clearTimeout(canvasManager.debounceTimer);
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
      canvasManager.blocks = splitAtEquals(pendingRows, practiceMode);
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
    'pixel-eraser': document.getElementById('btn-pixel-eraser'),
    move: document.getElementById('btn-move')
  };
  const toolbar = document.querySelector('.toolbar');
  toolbar.addEventListener('wheel', event => {
    if (toolbar.scrollWidth <= toolbar.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    toolbar.scrollLeft += event.deltaY;
  }, { passive: false });
  for (const [tool, button] of Object.entries(toolButtons)) {
    button.addEventListener('click', () => {
      canvasManager.setTool(tool);
      Object.values(toolButtons).forEach(b => b.classList.remove('active'));
      button.classList.add('active');
      pageSurface.classList.toggle('is-moving', tool === 'move');
    });
  }
  const practiceButton = document.getElementById('btn-practice');
  const checkButton = document.getElementById('btn-check');
  function updatePracticeControls() {
    practiceButton.textContent = `Practice: ${practiceMode ? 'On' : 'Off'}`;
    practiceButton.classList.toggle('active', practiceMode);
    practiceButton.setAttribute('aria-pressed', String(practiceMode));
    checkButton.hidden = !practiceMode;
    canvasTip.innerHTML = practiceMode
      ? 'Write <strong>7 × 8 =</strong>, add your answer after it, then tap Check.'
      : 'Write <strong>18 + 4 × 3 =</strong> to begin. Tap a written symbol to correct it.';
  }
  updatePracticeControls();
  practiceButton.addEventListener('click', () => {
    practiceMode = !practiceMode;
    try { localStorage.setItem('calcink-practice-mode', String(practiceMode)); } catch {}
    updatePracticeControls();
    canvasManager.blocks = splitAtEquals(pendingRows, practiceMode);
    canvasManager.drawOverlay();
    showSummary();
  });
  checkButton.addEventListener('click', () => {
    if (!practiceMode || !canvasManager.blocks.length) return;
    const graded = [];
    for (const block of canvasManager.blocks) {
      const result = gradePractice(
        block.clusters.map(cluster => cluster.predictedSymbol),
        (block.answerClusters || []).map(cluster => cluster.predictedSymbol));
      block.practiceMark = result.kind === 'pending' ? null : result.kind;
      block.practiceFeedback = result.message;
      graded.push(result.kind);
    }
    canvasManager.drawOverlay();
    showSummary();
    if (graded.includes('correct') || graded.includes('wrong')) {
      effects.play(graded.every(kind => kind === 'correct'));
    }
  });

  const soundButton = document.getElementById('btn-sound');
  const hapticsButton = document.getElementById('btn-haptics');
  try {
    effects.soundEnabled = localStorage.getItem('calcink-sound') === 'true';
    effects.hapticsEnabled = effects.hapticsEnabled && localStorage.getItem('calcink-haptics') !== 'false';
  } catch {}
  soundButton.classList.toggle('active', effects.soundEnabled);
  soundButton.setAttribute('aria-pressed', String(effects.soundEnabled));
  soundButton.querySelector('span').textContent = `Sound: ${effects.soundEnabled ? 'On' : 'Off'}`;
  if (!window.AudioContext && !window.webkitAudioContext) {
    effects.soundEnabled = false;
    soundButton.disabled = true;
    soundButton.classList.remove('active');
    soundButton.setAttribute('aria-pressed', 'false');
    soundButton.querySelector('span').textContent = 'Sound unavailable';
  } else {
    soundButton.addEventListener('click', () => {
      effects.setSound(!effects.soundEnabled);
      try { localStorage.setItem('calcink-sound', String(effects.soundEnabled)); } catch {}
      soundButton.classList.toggle('active', effects.soundEnabled);
      soundButton.setAttribute('aria-pressed', String(effects.soundEnabled));
      soundButton.querySelector('span').textContent = `Sound: ${effects.soundEnabled ? 'On' : 'Off'}`;
    });
  }
  if (!('vibrate' in navigator)) {
    hapticsButton.disabled = true;
    hapticsButton.title = 'Vibration is not available in this browser';
    hapticsButton.querySelector('span').textContent = 'Haptics unavailable';
    hapticsButton.setAttribute('aria-pressed', 'false');
  } else {
    hapticsButton.classList.toggle('active', effects.hapticsEnabled);
    hapticsButton.setAttribute('aria-pressed', String(effects.hapticsEnabled));
    hapticsButton.querySelector('span').textContent = `Haptics: ${effects.hapticsEnabled ? 'On' : 'Off'}`;
    hapticsButton.addEventListener('click', () => {
      effects.hapticsEnabled = !effects.hapticsEnabled;
      try { localStorage.setItem('calcink-haptics', String(effects.hapticsEnabled)); } catch {}
      hapticsButton.classList.toggle('active', effects.hapticsEnabled);
      hapticsButton.setAttribute('aria-pressed', String(effects.hapticsEnabled));
      hapticsButton.querySelector('span').textContent = `Haptics: ${effects.hapticsEnabled ? 'On' : 'Off'}`;
    });
  }
  const stylusButton = document.getElementById('btn-stylus-only');
  stylusButton.addEventListener('click', () => {
    canvasManager.setStylusOnly(!canvasManager.stylusOnly);
    stylusButton.classList.toggle('active', canvasManager.stylusOnly);
    stylusButton.setAttribute('aria-pressed', String(canvasManager.stylusOnly));
    stylusButton.querySelector('span').textContent = `Stylus only: ${canvasManager.stylusOnly ? 'On' : 'Off'}`;
  });
  document.getElementById('btn-new-page').addEventListener('click', () => {
    if (book.pages.length >= 100) {
      notebookFeedback.textContent = 'Notebook limit reached (100 pages).';
      return;
    }
    capturePage();
    const page = blankPage(book.pages.length + 1);
    book.pages.push(page);
    book.activePageId = page.id;
    loadPage();
    saveNow();
  });
  document.getElementById('btn-delete-page').addEventListener('click', () => {
    if (book.pages.length < 2 || !window.confirm(`Delete ${currentPage().title}?`)) return;
    book.pages = book.pages.filter(page => page.id !== book.activePageId);
    book.activePageId = book.pages.at(-1).id;
    loadPage();
    saveNow();
  });
  function changeZoom(delta) {
    zoom = Math.min(2, Math.max(0.5, Math.round((zoom + delta) * 4) / 4));
    applyPageSize();
  }
  document.getElementById('btn-zoom-in').addEventListener('click', () => changeZoom(0.25));
  document.getElementById('btn-zoom-out').addEventListener('click', () => changeZoom(-0.25));
  document.getElementById('btn-export-notebook').addEventListener('click', () => {
    capturePage();
    const blob = new Blob([JSON.stringify(book)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `calcink-notebook-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const importInput = document.getElementById('notebook-import');
  document.getElementById('btn-import-notebook').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    try {
      if (file.size > 25_000_000) throw new Error('Notebook file is too large.');
      const imported = validateNotebook(JSON.parse(await file.text()));
      if (!window.confirm(`Replace this notebook with ${imported.pages.length} imported page(s)?`)) return;
      clearTimeout(saveTimer);
      book = imported;
      loadPage();
      saveNow();
    } catch (error) {
      window.alert(`Could not import: ${error.message}`);
    }
  });
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
  loadNotebook().then(saved => {
    book = saved;
    loadPage();
    overlayCanvas.style.pointerEvents = 'auto';
  }).catch(error => {
    persistenceAvailable = false;
    loadPage();
    overlayCanvas.style.pointerEvents = 'auto';
    notebookFeedback.textContent = 'Local save unavailable. Export your notebook to keep it.';
    console.error('CalcInk notebook load:', error);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
});

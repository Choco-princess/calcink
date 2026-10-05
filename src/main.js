import { CanvasManager } from './canvas/CanvasManager.js';
import { PatchExtractor } from './recognition/PatchExtractor.js';
import { Recognizer } from './recognition/Recognizer.js';
import { Evaluator } from './evaluator/Evaluator.js';

window.addEventListener('DOMContentLoaded', async () => {
  const inkCanvas = document.getElementById('ink-canvas');
  const overlayCanvas = document.getElementById('overlay-canvas');

  // UI Buttons
  const btnPen = document.getElementById('btn-pen');
  const btnEraser = document.getElementById('btn-eraser');
  const widthButtons = [
    document.getElementById('btn-width-thin'),
    document.getElementById('btn-width-med'),
    document.getElementById('btn-width-thick')
  ];
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear');
  const btnToggleBoxes = document.getElementById('btn-toggle-boxes');

  // Stats elements
  const statStrokes = document.getElementById('stat-strokes');
  const statClusters = document.getElementById('stat-clusters');
  const statSequence = document.getElementById('stat-sequence');

  // Initialize Recognizer
  const recognizer = new Recognizer();
  let modelReady = false;

  // Initialize Canvas Manager
  const canvasManager = new CanvasManager(inkCanvas, overlayCanvas, {
    penColor: '#0f172a',
    penWidth: 4,
    showBoundingBoxes: true,
    debounceMs: 300
  });

  // Load the CNN model asynchronously without blocking canvas interaction
  try {
    modelReady = await recognizer.loadModel('./public/model/model.json');
    if (modelReady) {
      console.log('Math Model Ready for On-Device Inference');
    }
  } catch (err) {
    console.error('Model load failed:', err);
  }

  // Callback when EquationBlocks are updated
  canvasManager.onClustersUpdated = async (blocks) => {
    statStrokes.textContent = canvasManager.strokes.length;

    let totalChars = 0;
    blocks.forEach(b => totalChars += b.clusters.length);
    statClusters.textContent = totalChars;

    if (blocks.length === 0 || totalChars === 0) {
      statSequence.textContent = '[ none ]';
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    // Run recognition on each equation block
    for (const block of blocks) {
      if (block.clusters.length === 0) continue;

      if (modelReady) {
        // Extract 50x50 normalized patches for all characters in this block
        const patches = block.clusters.map(cluster => {
          return PatchExtractor.extractPatch(inkCanvas, cluster.bounds, dpr);
        });

        // Batch predict with GPU/WebGL
        const predictions = await recognizer.predictBatch(patches);

        const recognizedSymbols = [];
        predictions.forEach((pred, i) => {
          const cluster = block.clusters[i];
          // Check for decimal point (tiny standalone dot)
          if (cluster.widthPx <= 20 && cluster.heightPx <= 20 && cluster.strokes.length === 1) {
            cluster.predictedSymbol = '.';
            cluster.confidence = 0.99;
          } else {
            cluster.predictedSymbol = pred.symbol;
            cluster.confidence = pred.confidence;
          }
          recognizedSymbols.push(cluster.predictedSymbol);
        });

        // Evaluate with BODMAS Math Engine
        const mathResult = Evaluator.evaluate(recognizedSymbols);
        block.evaluatedResult = mathResult;
      }
    }

    // Redraw overlay canvas with updated symbols and inline answers
    canvasManager.drawOverlay();

    // Update footer sequence display
    const summary = blocks.map(block => {
      const expr = block.clusters.map(c => c.predictedSymbol || '?').join(' ');
      const ans = block.evaluatedResult ? ` ➔ ${block.evaluatedResult}` : '';
      return `[${block.id}: ${expr}${ans}]`;
    }).join('  |  ');
    statSequence.textContent = summary;
  };

  // Tool Switching
  btnPen.addEventListener('click', () => {
    canvasManager.setTool('pen');
    btnPen.classList.add('active');
    btnEraser.classList.remove('active');
  });

  btnEraser.addEventListener('click', () => {
    canvasManager.setTool('eraser');
    btnEraser.classList.add('active');
    btnPen.classList.remove('active');
  });

  // Pen Width
  widthButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      widthButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const width = parseInt(btn.getAttribute('data-width'), 10);
      canvasManager.setPenWidth(width);
    });
  });

  // History Controls
  btnUndo.addEventListener('click', () => {
    canvasManager.undo();
  });

  btnRedo.addEventListener('click', () => {
    canvasManager.redo();
  });

  btnClear.addEventListener('click', () => {
    if (confirm('Clear the entire canvas?')) {
      canvasManager.clear();
    }
  });

  // Toggle Bounding Boxes
  let showBoxes = true;
  btnToggleBoxes.addEventListener('click', () => {
    showBoxes = !showBoxes;
    canvasManager.toggleBoundingBoxes(showBoxes);
    if (showBoxes) {
      btnToggleBoxes.classList.add('active');
      btnToggleBoxes.querySelector('span').textContent = 'Bounding Boxes: ON';
    } else {
      btnToggleBoxes.classList.remove('active');
      btnToggleBoxes.querySelector('span').textContent = 'Bounding Boxes: OFF';
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        canvasManager.redo();
      } else {
        canvasManager.undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      canvasManager.redo();
    }
  });
});

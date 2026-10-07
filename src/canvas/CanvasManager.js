import { Stroke } from '../segmentation/Stroke.js';
import { HistoryManager } from './History.js';
import { strokeTouchesCircle, eraseStrokePixels } from './Eraser.js';
import { backingSize, pointerPosition } from './coordinates.js';

export class CanvasManager {
  constructor(inkCanvas, overlayCanvas, options = {}) {
    this.inkCanvas = inkCanvas;
    this.overlayCanvas = overlayCanvas;
    this.inkCtx = inkCanvas.getContext('2d');
    this.overlayCtx = overlayCanvas.getContext('2d');

    this.options = {
      penColor: '#0f172a',
      penWidth: 4,
      showBoundingBoxes: false,
      debounceMs: 300,
      ...options
    };

    this.currentTool = 'pen'; // 'pen' | 'eraser' | 'pixel-eraser' | 'move'
    this.stylusOnly = false;
    this.strokes = [];
    this.activeStroke = null;
    this.isDrawing = false;
    this.blocks = []; // Array of EquationBlock

    this.history = new HistoryManager();
    this.debounceTimer = null;
    this.onCanvasChanged = null;
    this.onStrokeCommitted = null;
    this.onStrokesReady = null;
    this.onSymbolTap = null;
    this.activePointerId = null;
    this.eraseHistoryPushed = false;
    this.panStart = null;
    this.answerAnimations = new Map();
    this.animationFrame = null;

    this.initCanvasSize();
    this.attachEventListeners();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.inkCanvas.parentElement);
    window.addEventListener('resize', () => this.handleResize());
  }

  initCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const page = this.inkCanvas.parentElement;
    const width = Math.max(1, Math.floor(page.clientWidth));
    const height = Math.max(1, Math.floor(page.clientHeight));
    const backing = backingSize(width, height, dpr);

    [this.inkCanvas, this.overlayCanvas].forEach(canvas => {
      canvas.width = backing.width;
      canvas.height = backing.height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    });

    this.inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.redrawAllStrokes();
    this.drawOverlay();
  }

  handleResize() {
    this.initCanvasSize();
  }

  getPointerPos(e) {
    const rect = this.inkCanvas.getBoundingClientRect();
    return {
      ...pointerPosition(e.clientX, e.clientY, rect, this.inkCanvas.clientWidth, this.inkCanvas.clientHeight),
      pressure: e.pressure || 0.5
    };
  }

  attachEventListeners() {
    const canvas = this.overlayCanvas; // capture pointer on top canvas

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  onPointerDown(e) {
    if (this.isDrawing) return;
    if (this.currentTool !== 'move' && this.stylusOnly && e.pointerType === 'touch') return;
    e.preventDefault();
    this.isDrawing = true;
    this.activePointerId = e.pointerId;
    this.overlayCanvas.setPointerCapture(e.pointerId);
    if (this.currentTool === 'move') {
      const viewport = this.overlayCanvas.closest('.canvas-wrapper');
      this.panStart = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      return;
    }
    const pos = this.getPointerPos(e);

    if (this.currentTool === 'pen') {
      this.activeStroke = new Stroke();
      this.activeStroke.color = this.options.penColor;
      this.activeStroke.width = this.options.penWidth;
      this.activeStroke.addPoint(pos.x, pos.y, pos.pressure);
    } else {
      clearTimeout(this.debounceTimer);
      this.eraseHistoryPushed = false;
      this.eraseAtPoint(pos.x, pos.y);
    }
  }

  onPointerMove(e) {
    if (!this.isDrawing || e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    if (this.currentTool === 'move') {
      const viewport = this.overlayCanvas.closest('.canvas-wrapper');
      viewport.scrollLeft = this.panStart.left - (e.clientX - this.panStart.x);
      viewport.scrollTop = this.panStart.top - (e.clientY - this.panStart.y);
      return;
    }
    const pos = this.getPointerPos(e);

    if (this.currentTool === 'pen' && this.activeStroke) {
      const prevPoint = this.activeStroke.points[this.activeStroke.points.length - 1];
      const startPoint = this.activeStroke.points[0];
      if (this.activeStroke.points.length === 1) {
        if (Math.hypot(pos.x - startPoint.x, pos.y - startPoint.y) < 5) return;
        clearTimeout(this.debounceTimer);
        this.history.pushState(this.strokes);
        this.onCanvasChanged?.();
      }
      this.activeStroke.addPoint(pos.x, pos.y, pos.pressure);

      // Finish each segment at the newest point so the ink matches the stored stroke.
      this.inkCtx.beginPath();
      this.inkCtx.lineCap = 'round';
      this.inkCtx.lineJoin = 'round';
      this.inkCtx.strokeStyle = this.activeStroke.color;
      this.inkCtx.lineWidth = this.activeStroke.width;

      this.inkCtx.moveTo(prevPoint.x, prevPoint.y);
      this.inkCtx.quadraticCurveTo(prevPoint.x, prevPoint.y, pos.x, pos.y);
      this.inkCtx.stroke();
    } else {
      this.eraseAtPoint(pos.x, pos.y);
    }
  }

  onPointerUp(e) {
    if (!this.isDrawing || e.pointerId !== this.activePointerId) return;
    this.isDrawing = false;
    if (this.overlayCanvas.hasPointerCapture(e.pointerId)) {
      this.overlayCanvas.releasePointerCapture(e.pointerId);
    }
    this.activePointerId = null;
    if (this.currentTool === 'move') {
      this.panStart = null;
      return;
    }

    if (this.currentTool === 'pen' && this.activeStroke) {
      if (this.activeStroke.points.length === 1) {
        const point = this.activeStroke.points[0];
        const end = this.getPointerPos(e);
        if (Math.hypot(end.x - point.x, end.y - point.y) < 5 &&
            this.onSymbolTap?.(point.x, point.y, e)) {
          this.activeStroke = null;
          return;
        }
        clearTimeout(this.debounceTimer);
        this.history.pushState(this.strokes);
        this.onCanvasChanged?.();
        if (Math.hypot(end.x - point.x, end.y - point.y) >= 5) {
          this.activeStroke.addPoint(end.x, end.y, end.pressure);
        }
      }
      this.strokes.push(this.activeStroke);
      this.redrawAllStrokes();
      this.activeStroke = null;
      this.onStrokeCommitted?.();
    }
    this.scheduleGrouping();
  }

  /**
   * Stroke-based eraser: deletes any stroke touched by the eraser.
   */
  eraseAtPoint(x, y, radius = 12) {
    let modified = false;
    const remainingStrokes = [];
    for (const stroke of this.strokes) {
      const b = stroke.bounds;
      if (x < b.minX - radius || x > b.maxX + radius || y < b.minY - radius || y > b.maxY + radius ||
          !strokeTouchesCircle(stroke, x, y, radius)) {
        remainingStrokes.push(stroke);
        continue;
      }
      modified = true;
      if (this.currentTool === 'pixel-eraser') {
        remainingStrokes.push(...eraseStrokePixels(stroke, x, y, radius).fragments);
      }
    }

    if (modified) {
      if (!this.eraseHistoryPushed) {
        this.history.pushState(this.strokes);
        this.eraseHistoryPushed = true;
      }
      this.strokes = remainingStrokes;
      this.redrawAllStrokes();
      this.onCanvasChanged?.();
    }
  }

  redrawAllStrokes() {
    this.inkCtx.clearRect(0, 0, this.inkCanvas.clientWidth, this.inkCanvas.clientHeight);

    for (const stroke of this.strokes) {
      if (stroke.points.length === 0) continue;
      this.inkCtx.beginPath();
      this.inkCtx.lineCap = 'round';
      this.inkCtx.lineJoin = 'round';
      this.inkCtx.strokeStyle = stroke.color;
      this.inkCtx.lineWidth = stroke.width;

      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        this.inkCtx.fillStyle = stroke.color;
        this.inkCtx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
        this.inkCtx.fill();
        continue;
      }

      this.inkCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const p1 = stroke.points[i - 1];
        const p2 = stroke.points[i];
        this.inkCtx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
      }
      this.inkCtx.stroke();
    }
  }

  scheduleGrouping() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateClusters();
    }, this.options.debounceMs);
  }

  updateClusters() {
    this.onStrokesReady?.(this.strokes);
  }

  drawOverlay() {
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.clientWidth, this.overlayCanvas.clientHeight);

    if (this.blocks.length === 0) {
      this.answerAnimations.clear();
      return;
    }

    const now = performance.now();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let animating = false;
    const activeBlockIds = new Set(this.blocks.map(block => block.id));
    for (const id of this.answerAnimations.keys()) {
      if (!activeBlockIds.has(id)) this.answerAnimations.delete(id);
    }

    const padding = 6;
    const blockColors = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#db2777', '#0891b2'];

    this.blocks.forEach((block) => {
      const color = blockColors[(block.displayIndex - 1) % blockColors.length];

      // Draw bounding boxes for characters if enabled
      if (this.options.showBoundingBoxes) {
        [...block.clusters, ...(block.answerClusters || [])].forEach((cluster, charIdx) => {
          const b = cluster.bounds;
          const x = b.minX - padding;
          const y = b.minY - padding;
          const w = Math.max(16, (b.maxX - b.minX) + padding * 2);
          const h = Math.max(16, (b.maxY - b.minY) + padding * 2);

          // Dashed bounding box
          this.overlayCtx.save();
          this.overlayCtx.strokeStyle = color;
          this.overlayCtx.lineWidth = 1.5;
          this.overlayCtx.setLineDash([4, 4]);
          this.overlayCtx.strokeRect(x, y, w, h);

          // Semi-transparent box fill
          this.overlayCtx.fillStyle = color + '0d';
          this.overlayCtx.fillRect(x, y, w, h);

          // Badge label: show predicted symbol if available, else #index
          const badgeText = cluster.predictedSymbol
            ? (cluster.confidence == null ? `'${cluster.predictedSymbol}'` :
              `'${cluster.predictedSymbol}' (${Math.round(cluster.confidence * 100)}%)`)
            : `#${charIdx + 1}`;

          this.overlayCtx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const textWidth = this.overlayCtx.measureText(badgeText).width;

          this.overlayCtx.setLineDash([]);
          this.overlayCtx.fillStyle = color;
          this.overlayCtx.fillRect(x, y - 16, textWidth + 8, 16);

          this.overlayCtx.fillStyle = '#ffffff';
          this.overlayCtx.fillText(badgeText, x + 4, y - 4);

          this.overlayCtx.restore();
        });
      }

      // Project Evaluated Result adjacent to the terminal equals sign '='
      if (block.evaluatedResult !== undefined && block.evaluatedResult !== '') {
        const lastCluster = block.clusters[block.clusters.length - 1];
        if (lastCluster) {
          const resultX = lastCluster.bounds.maxX + 18;
          const resultY = lastCluster.centerY;

          this.overlayCtx.save();
          this.overlayCtx.textBaseline = 'middle';
          const previous = this.answerAnimations.get(block.id);
          if (!previous || previous.value !== block.evaluatedResult) {
            this.answerAnimations.set(block.id, { value: block.evaluatedResult, since: now });
          }
          const elapsed = now - this.answerAnimations.get(block.id).since;
          if (!reduceMotion && elapsed < 220) {
            this.overlayCtx.globalAlpha = 0.25 + 0.75 * Math.min(1, elapsed / 220);
            animating = true;
          }

          if (block.evaluatedResult === 'Undefined' || block.evaluatedResult === 'Error') {
            // Render error badge
            this.overlayCtx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
            this.overlayCtx.fillStyle = '#ef4444';
            this.overlayCtx.fillText(block.evaluatedResult, resultX, resultY);
          } else {
            // Render crisp mathematical result in primary ink style
            this.overlayCtx.font = 'bold 32px "SF Pro Rounded", "Comic Neue", "Chalkboard SE", sans-serif';
            this.overlayCtx.fillStyle = '#2563eb';
            this.overlayCtx.fillText(block.evaluatedResult, resultX, resultY);
          }

          this.overlayCtx.restore();
        }
      }
      if (block.practiceMark) {
        const last = block.answerClusters.at(-1);
        this.overlayCtx.save();
        this.overlayCtx.textBaseline = 'middle';
        this.overlayCtx.font = 'bold 32px -apple-system, BlinkMacSystemFont, sans-serif';
        this.overlayCtx.fillStyle = block.practiceMark === 'correct' ? '#059669' : '#dc2626';
        this.overlayCtx.fillText(block.practiceMark === 'correct' ? '✓' : '✕',
          last.bounds.maxX + 14, last.centerY);
        this.overlayCtx.restore();
      }
    });
    if (animating && this.animationFrame === null) {
      this.animationFrame = requestAnimationFrame(() => {
        this.animationFrame = null;
        this.drawOverlay();
      });
    }
  }

  undo() {
    if (this.history.canUndo()) {
      this.strokes = this.history.undo(this.strokes);
      this.onCanvasChanged?.();
      this.redrawAllStrokes();
      this.scheduleGrouping();
    }
  }

  redo() {
    if (this.history.canRedo()) {
      this.strokes = this.history.redo(this.strokes);
      this.onCanvasChanged?.();
      this.redrawAllStrokes();
      this.scheduleGrouping();
    }
  }

  clear() {
    if (this.strokes.length === 0) return;
    this.history.pushState(this.strokes);
    this.strokes = [];
    this.blocks = [];
    this.onCanvasChanged?.();
    this.redrawAllStrokes();
    this.scheduleGrouping();
  }

  setTool(tool) {
    this.currentTool = tool;
  }

  setStylusOnly(enabled) {
    this.stylusOnly = enabled;
  }

  loadStrokes(strokes) {
    clearTimeout(this.debounceTimer);
    this.history.clear();
    this.strokes = strokes;
    this.blocks = [];
    this.answerAnimations.clear();
    this.onCanvasChanged?.();
    this.redrawAllStrokes();
    this.scheduleGrouping();
  }

  setPenWidth(width) {
    this.options.penWidth = width;
  }

  toggleBoundingBoxes(show) {
    this.options.showBoundingBoxes = show;
    this.drawOverlay();
  }
}

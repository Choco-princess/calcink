import { Stroke } from '../segmentation/Stroke.js';
import { HistoryManager } from './History.js';
import { Grouper } from '../segmentation/Grouper.js';

export class CanvasManager {
  constructor(inkCanvas, overlayCanvas, options = {}) {
    this.inkCanvas = inkCanvas;
    this.overlayCanvas = overlayCanvas;
    this.inkCtx = inkCanvas.getContext('2d');
    this.overlayCtx = overlayCanvas.getContext('2d');

    this.options = {
      penColor: '#0f172a',
      penWidth: 4,
      showBoundingBoxes: true,
      debounceMs: 300,
      ...options
    };

    this.currentTool = 'pen'; // 'pen' | 'eraser'
    this.strokes = [];
    this.activeStroke = null;
    this.isDrawing = false;
    this.blocks = []; // Array of EquationBlock

    this.history = new HistoryManager();
    this.debounceTimer = null;
    this.onClustersUpdated = null; // External callback

    this.initCanvasSize();
    this.attachEventListeners();
    window.addEventListener('resize', () => this.handleResize());
  }

  initCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.inkCanvas.parentElement.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    [this.inkCanvas, this.overlayCanvas].forEach(canvas => {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
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
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5
    };
  }

  attachEventListeners() {
    const canvas = this.overlayCanvas; // capture pointer on top canvas

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointerleave', (e) => {
      if (this.isDrawing) this.onPointerUp(e);
    });
  }

  onPointerDown(e) {
    e.preventDefault();
    this.isDrawing = true;
    const pos = this.getPointerPos(e);

    if (this.currentTool === 'pen') {
      this.history.pushState(this.strokes);
      this.activeStroke = new Stroke();
      this.activeStroke.color = this.options.penColor;
      this.activeStroke.width = this.options.penWidth;
      this.activeStroke.addPoint(pos.x, pos.y, pos.pressure);

      this.inkCtx.beginPath();
      this.inkCtx.lineCap = 'round';
      this.inkCtx.lineJoin = 'round';
      this.inkCtx.strokeStyle = this.activeStroke.color;
      this.inkCtx.lineWidth = this.activeStroke.width;
      this.inkCtx.moveTo(pos.x, pos.y);
      this.inkCtx.lineTo(pos.x + 0.1, pos.y + 0.1);
      this.inkCtx.stroke();
    } else if (this.currentTool === 'eraser') {
      this.history.pushState(this.strokes);
      this.eraseAtPoint(pos.x, pos.y);
    }
  }

  onPointerMove(e) {
    if (!this.isDrawing) return;
    e.preventDefault();
    const pos = this.getPointerPos(e);

    if (this.currentTool === 'pen' && this.activeStroke) {
      const prevPoint = this.activeStroke.points[this.activeStroke.points.length - 1];
      this.activeStroke.addPoint(pos.x, pos.y, pos.pressure);

      // Smooth curve drawing using midpoint quadratic curves
      this.inkCtx.beginPath();
      this.inkCtx.lineCap = 'round';
      this.inkCtx.lineJoin = 'round';
      this.inkCtx.strokeStyle = this.activeStroke.color;
      this.inkCtx.lineWidth = this.activeStroke.width;

      const midX = (prevPoint.x + pos.x) / 2;
      const midY = (prevPoint.y + pos.y) / 2;
      this.inkCtx.moveTo(prevPoint.x, prevPoint.y);
      this.inkCtx.quadraticCurveTo(prevPoint.x, prevPoint.y, midX, midY);
      this.inkCtx.stroke();
    } else if (this.currentTool === 'eraser') {
      this.eraseAtPoint(pos.x, pos.y);
    }
  }

  onPointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentTool === 'pen' && this.activeStroke) {
      if (this.activeStroke.points.length > 0) {
        this.strokes.push(this.activeStroke);
      }
      this.activeStroke = null;
      this.scheduleGrouping();
    }
  }

  /**
   * Stroke-based eraser: deletes any stroke touched by the eraser.
   */
  eraseAtPoint(x, y, radius = 12) {
    let modified = false;
    const remainingStrokes = this.strokes.filter(stroke => {
      const b = stroke.bounds;
      if (x < b.minX - radius || x > b.maxX + radius || y < b.minY - radius || y > b.maxY + radius) {
        return true;
      }
      const hit = stroke.points.some(p => {
        const dx = p.x - x;
        const dy = p.y - y;
        return (dx * dx + dy * dy) <= (radius * radius);
      });
      if (hit) modified = true;
      return !hit;
    });

    if (modified) {
      this.strokes = remainingStrokes;
      this.redrawAllStrokes();
      this.scheduleGrouping();
    }
  }

  redrawAllStrokes() {
    const rect = this.inkCanvas.getBoundingClientRect();
    this.inkCtx.clearRect(0, 0, rect.width, rect.height);

    for (const stroke of this.strokes) {
      if (stroke.points.length === 0) continue;
      this.inkCtx.beginPath();
      this.inkCtx.lineCap = 'round';
      this.inkCtx.lineJoin = 'round';
      this.inkCtx.strokeStyle = stroke.color;
      this.inkCtx.lineWidth = stroke.width;

      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        this.inkCtx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
        this.inkCtx.fill();
        continue;
      }

      this.inkCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const p1 = stroke.points[i - 1];
        const p2 = stroke.points[i];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        this.inkCtx.quadraticCurveTo(p1.x, p1.y, midX, midY);
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
    this.blocks = Grouper.groupStrokesIntoLines(this.strokes);
    this.drawOverlay();
    if (this.onClustersUpdated) {
      this.onClustersUpdated(this.blocks);
    }
  }

  drawOverlay() {
    const rect = this.overlayCanvas.getBoundingClientRect();
    this.overlayCtx.clearRect(0, 0, rect.width, rect.height);

    if (this.blocks.length === 0) return;

    const padding = 6;
    const blockColors = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#db2777', '#0891b2'];

    this.blocks.forEach((block) => {
      const color = blockColors[(block.displayIndex - 1) % blockColors.length];

      // Draw bounding boxes for characters if enabled
      if (this.options.showBoundingBoxes) {
        block.clusters.forEach((cluster, charIdx) => {
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
            ? `'${cluster.predictedSymbol}' (${Math.round((cluster.confidence || 0) * 100)}%)`
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
    });
  }

  undo() {
    if (this.history.canUndo()) {
      this.strokes = this.history.undo(this.strokes);
      this.redrawAllStrokes();
      this.scheduleGrouping();
    }
  }

  redo() {
    if (this.history.canRedo()) {
      this.strokes = this.history.redo(this.strokes);
      this.redrawAllStrokes();
      this.scheduleGrouping();
    }
  }

  clear() {
    if (this.strokes.length === 0) return;
    this.history.pushState(this.strokes);
    this.strokes = [];
    this.blocks = [];
    this.redrawAllStrokes();
    this.scheduleGrouping();
  }

  setTool(tool) {
    this.currentTool = tool;
  }

  setPenWidth(width) {
    this.options.penWidth = width;
  }

  toggleBoundingBoxes(show) {
    this.options.showBoundingBoxes = show;
    this.drawOverlay();
  }
}

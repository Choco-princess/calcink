/**
 * History manager for Undo, Redo, and Stroke state manipulation.
 */
export class HistoryManager {
  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Save a snapshot of stroke list before modification.
   * @param {Array} strokes Current active strokes
   */
  pushState(strokes) {
    // Clone strokes array (shallow copy of stroke references)
    this.undoStack.push([...strokes]);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // Any new action clears the redo stack
    this.redoStack = [];
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Undo last operation.
   * @param {Array} currentStrokes
   * @returns {Array} Restored strokes
   */
  undo(currentStrokes) {
    if (!this.canUndo()) return currentStrokes;
    this.redoStack.push([...currentStrokes]);
    return this.undoStack.pop();
  }

  /**
   * Redo previously undone operation.
   * @param {Array} currentStrokes
   * @returns {Array} Restored strokes
   */
  redo(currentStrokes) {
    if (!this.canRedo()) return currentStrokes;
    this.undoStack.push([...currentStrokes]);
    return this.redoStack.pop();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}

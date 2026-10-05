/**
 * CharacterCluster: represents one recognized math symbol.
 */
export class CharacterCluster {
  constructor(id, lineIndex = 0, blockIndex = 1) {
    this.id = id;
    this.lineIndex = lineIndex;
    this.blockIndex = blockIndex;
    this.strokes = [];
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  addStroke(stroke) {
    this.strokes.push(stroke);
    const b = stroke.bounds;
    this.bounds.minX = Math.min(this.bounds.minX, b.minX);
    this.bounds.minY = Math.min(this.bounds.minY, b.minY);
    this.bounds.maxX = Math.max(this.bounds.maxX, b.maxX);
    this.bounds.maxY = Math.max(this.bounds.maxY, b.maxY);
  }

  get widthPx() {
    return Math.max(1, this.bounds.maxX - this.bounds.minX);
  }

  get heightPx() {
    return Math.max(1, this.bounds.maxY - this.bounds.minY);
  }

  get centerX() {
    return (this.bounds.minX + this.bounds.maxX) / 2;
  }

  get centerY() {
    return (this.bounds.minY + this.bounds.maxY) / 2;
  }
}

/**
 * EquationBlock: represents an independent equation / scratchpad on the canvas.
 * Handles both multiple horizontal lines and side-by-side equations.
 */
export class EquationBlock {
  constructor(id, lineIndex = 1, blockIndex = 1) {
    this.id = id;
    this.lineIndex = lineIndex;
    this.blockIndex = blockIndex;
    this.strokes = [];
    this.clusters = [];
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  addStroke(stroke) {
    this.strokes.push(stroke);
    const b = stroke.bounds;
    this.bounds.minX = Math.min(this.bounds.minX, b.minX);
    this.bounds.minY = Math.min(this.bounds.minY, b.minY);
    this.bounds.maxX = Math.max(this.bounds.maxX, b.maxX);
    this.bounds.maxY = Math.max(this.bounds.maxY, b.maxY);
  }

  get medianHeight() {
    if (this.strokes.length === 0) return 36;
    const heights = this.strokes.map(s => s.heightPx).sort((a, b) => a - b);
    return Math.max(20, heights[Math.floor(heights.length / 2)] || 36);
  }

  get medianWidth() {
    if (this.strokes.length === 0) return 24;
    const widths = this.strokes.map(s => s.widthPx).sort((a, b) => a - b);
    return Math.max(16, widths[Math.floor(widths.length / 2)] || 24);
  }
}

/**
 * Production-Grade Hybrid Segregation Engine:
 * 1. 2D Spatial & Y-Valley Line Slicing (isolates rows and side-by-side equations).
 * 2. Anisotropic Directional Dilation (bridges = bars and ÷ dots without horizontal bleeding).
 * 3. Strict 16-Symbol Domain Morphological Validation.
 */
export class Grouper {
  static GRID_SIZE = 28; // reference grid square size in pixels

  /**
   * Determine if two strokes belong to the SAME horizontal equation line.
   */
  static shouldBeInSameLineBand(strokeA, strokeB, globalMedianH = 36) {
    const bA = strokeA.bounds;
    const bB = strokeB.bounds;

    const yOverlap = Math.max(0, Math.min(bA.maxY, bB.maxY) - Math.max(bA.minY, bB.minY));
    const verticalGap = Math.max(0, Math.max(bA.minY - bB.maxY, bB.minY - bA.maxY));

    const hA = strokeA.heightPx;
    const hB = strokeB.heightPx;
    const wA = strokeA.widthPx;
    const wB = strokeB.widthPx;

    const isATall = hA > Math.max(24, globalMedianH * 0.6) && hA > wA * 0.8;
    const isBTall = hB > Math.max(24, globalMedianH * 0.6) && hB > wB * 0.8;

    // GOLDEN RULE 1: Two tall vertical characters stacked on top of each other
    // are ALWAYS in separate equation lines (e.g. top '1' vs bottom '1').
    if (isATall && isBTall && yOverlap === 0) {
      return false;
    }

    // Direct vertical overlap between strokes
    if (yOverlap > 0) {
      const minH = Math.min(hA, hB);
      // If overlap is more than 20% of the shorter stroke, they share the line
      if ((yOverlap / minH) > 0.2) {
        return true;
      }
    }

    // Parallel bars for '=' or '÷': horizontal strokes stacked vertically
    const isAHoriz = wA > hA * 0.8;
    const isBHoriz = wB > hB * 0.8;
    const isDot = (wA <= 18 && hA <= 18) || (wB <= 18 && hB <= 18);
    const xOverlap = Math.max(0, Math.min(bA.maxX, bB.maxX) - Math.max(bA.minX, bB.minX));

    if ((isAHoriz && isBHoriz) || isDot) {
      const minW = Math.min(wA, wB);
      if (minW > 0 && (xOverlap / minW) > 0.3 && verticalGap < Math.max(45, globalMedianH * 1.3)) {
        return true;
      }
    }

    // Adjacent characters on the same baseline: small vertical gap
    const avgH = (hA + hB) / 2;
    if (verticalGap < Math.max(16, avgH * 0.45)) {
      return true;
    }

    return false;
  }

  /**
   * Step 1: Partition strokes into distinct 2D Equation Blocks.
   * Handles both vertical line stacking and horizontal side-by-side equations.
   */
  static segmentEquationBlocks(strokes) {
    if (!strokes || strokes.length === 0) return [];

    // Calculate global median stroke height
    const allHeights = strokes.map(s => s.heightPx).sort((a, b) => a - b);
    const globalMedianH = Math.max(20, allHeights[Math.floor(allHeights.length / 2)] || 36);

    const n = strokes.length;
    const lineParent = Array.from({ length: n }, (_, i) => i);

    function find(i, parent) {
      if (parent[i] === i) return i;
      parent[i] = find(parent[i], parent);
      return parent[i];
    }

    function union(i, j, parent) {
      const rootI = find(i, parent);
      const rootJ = find(j, parent);
      if (rootI !== rootJ) parent[rootI] = rootJ;
    }

    // 1. Group into horizontal line bands
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Grouper.shouldBeInSameLineBand(strokes[i], strokes[j], globalMedianH)) {
          union(i, j, lineParent);
        }
      }
    }

    const lineMap = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i, lineParent);
      if (!lineMap.has(root)) {
        lineMap.set(root, []);
      }
      lineMap.get(root).push(strokes[i]);
    }

    // Sort lines top to bottom by vertical position
    const rawLines = Array.from(lineMap.values());
    rawLines.sort((lineA, lineB) => {
      const minYA = Math.min(...lineA.map(s => s.bounds.minY));
      const minYB = Math.min(...lineB.map(s => s.bounds.minY));
      return minYA - minYB;
    });

    // 2. Within each horizontal line, detect side-by-side equations (horizontal gap splitting)
    const equationBlocks = [];
    let lineCounter = 1;

    for (const lineStrokes of rawLines) {
      // Sort strokes left to right
      lineStrokes.sort((a, b) => a.bounds.minX - b.bounds.minX);

      // Cluster strokes into continuous horizontal blocks
      // A gap larger than ~2.8x character height/grid unit marks a separate equation scratchpad!
      const blockSplitThreshold = Math.max(75, globalMedianH * 2.2);

      let currentBlock = new EquationBlock(`Eq-${lineCounter}-1`, lineCounter, 1);
      currentBlock.addStroke(lineStrokes[0]);

      for (let i = 1; i < lineStrokes.length; i++) {
        const stroke = lineStrokes[i];
        // Horizontal distance from current block's right edge
        const horizontalGap = stroke.bounds.minX - currentBlock.bounds.maxX;

        if (horizontalGap > blockSplitThreshold) {
          // Large blank space -> Start a new side-by-side equation block!
          equationBlocks.push(currentBlock);
          currentBlock = new EquationBlock(
            `Eq-${lineCounter}-${currentBlock.blockIndex + 1}`,
            lineCounter,
            currentBlock.blockIndex + 1
          );
        }
        currentBlock.addStroke(stroke);
      }

      equationBlocks.push(currentBlock);
      lineCounter++;
    }

    // Re-index all blocks cleanly (Eq 1, Eq 2, Eq 3...) sorted top-to-bottom, left-to-right
    equationBlocks.sort((a, b) => {
      if (Math.abs(a.bounds.minY - b.bounds.minY) > 30) {
        return a.bounds.minY - b.bounds.minY;
      }
      return a.bounds.minX - b.bounds.minX;
    });

    equationBlocks.forEach((block, idx) => {
      block.id = `Eq ${idx + 1}`;
      block.displayIndex = idx + 1;
    });

    return equationBlocks;
  }

  /**
   * Step 2: Anisotropic Directional Morphological Clustering (Within an Equation Block).
   * Bridges vertical stacks (=, ÷, broken strokes) with zero horizontal bleed.
   */
  static shouldGroupInBlock(strokeA, strokeB, medianH = 36) {
    const bA = strokeA.bounds;
    const bB = strokeB.bounds;

    const wA = strokeA.widthPx;
    const hA = strokeA.heightPx;
    const wB = strokeB.widthPx;
    const hB = strokeB.heightPx;

    // Rule 1: Broken Stroke / Pen-lift healing
    const endpointDist = strokeA.endpointDistance(strokeB);
    if (endpointDist < Math.max(14, medianH * 0.25)) {
      return true;
    }

    // Rule 2: Strict Zero Horizontal Dilation Guard
    // If Stroke B is purely to the right of Stroke A (no horizontal overlap),
    // they can NEVER be the same character in our 16 symbols.
    const xOverlap = Math.max(0, Math.min(bA.maxX, bB.maxX) - Math.max(bA.minX, bB.minX));
    const yOverlap = Math.max(0, Math.min(bA.maxY, bB.maxY) - Math.max(bA.minY, bB.minY));

    if (xOverlap === 0) {
      return false; // Absolute barrier between adjacent characters (kills domino effect)
    }

    const minW = Math.min(wA, wB);
    const minH = Math.min(hA, hB);
    const xOverlapRatio = minW > 0 ? (xOverlap / minW) : 0;
    const yOverlapRatio = minH > 0 ? (yOverlap / minH) : 0;

    // Rule 3: Physical Crossing / 2D Intersection (e.g. '+', 'x', '4', crossed '7')
    if (xOverlap > 0 && yOverlap > 0) {
      if (xOverlapRatio > 0.15 && yOverlapRatio > 0.15) {
        return true;
      }
    }

    // Rule 4: Directional Vertical Morphological Bridging (Within same X-column)
    const verticalGap = Math.max(0, Math.max(bA.minY - bB.maxY, bB.minY - bA.maxY));
    const centerDistX = Math.abs(strokeA.centerX - strokeB.centerX);
    const maxW = Math.max(wA, wB);

    // A. Equals sign '=': Two parallel horizontal bars
    const isAHoriz = wA > hA * 0.8;
    const isBHoriz = wB > hB * 0.8;
    if (isAHoriz && isBHoriz) {
      if (xOverlapRatio > 0.35 && verticalGap < Math.max(45, medianH * 1.3)) {
        return true;
      }
    }

    // B. Division sign '÷': Horizontal bar + top/bottom dots
    const isADot = (wA <= 18 && hA <= 18);
    const isBDot = (wB <= 18 && hB <= 18);
    if ((isADot && isBHoriz) || (isBDot && isAHoriz)) {
      if (centerDistX < maxW * 0.6 && verticalGap < Math.max(45, medianH * 1.3)) {
        return true;
      }
    }

    // C. Digit '1' with bottom base bar '_' or top hook
    const isAVert = hA > wA * 1.1;
    const isBVert = hB > wB * 1.1;
    if ((isAVert && isBHoriz) || (isBVert && isAHoriz)) {
      const stem = isAVert ? strokeA : strokeB;
      const bar = isAVert ? strokeB : strokeA;
      const barBelow = bar.bounds.minY >= stem.bounds.maxY - 14;
      const barAbove = bar.bounds.maxY <= stem.bounds.minY + 14;
      if ((barBelow || barAbove) && Math.abs(stem.centerX - bar.centerX) < bar.widthPx * 0.6) {
        return true;
      }
    }

    // D. Multi-stroke '5' (body + top hat) or European '7' (horizontal cross)
    if (xOverlapRatio > 0.45 && verticalGap < Math.max(20, medianH * 0.4)) {
      return true;
    }

    return false;
  }

  /**
   * Main entry point: Segments canvas into Equation Blocks,
   * then clusters into sorted Left-to-Right Character Clusters.
   */
  static groupStrokesIntoLines(strokes) {
    if (!strokes || strokes.length === 0) return [];

    const blocks = Grouper.segmentEquationBlocks(strokes);

    for (const block of blocks) {
      const n = block.strokes.length;
      const parent = Array.from({ length: n }, (_, i) => i);
      const medianH = block.medianHeight;

      function find(i) {
        if (parent[i] === i) return i;
        parent[i] = find(parent[i]);
        return parent[i];
      }

      function union(i, j) {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
      }

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (Grouper.shouldGroupInBlock(block.strokes[i], block.strokes[j], medianH)) {
            union(i, j);
          }
        }
      }

      const clusterMap = new Map();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!clusterMap.has(root)) {
          clusterMap.set(root, new CharacterCluster(`${block.id}-C${clusterMap.size + 1}`, block.displayIndex));
        }
        clusterMap.get(root).addStroke(block.strokes[i]);
      }

      // Sort characters strictly Left-to-Right within this equation
      const clusters = Array.from(clusterMap.values());
      clusters.sort((a, b) => a.bounds.minX - b.bounds.minX);
      block.clusters = clusters;
    }

    return blocks;
  }

  /**
   * Backward-compatible helper returning a flattened array of all clusters.
   */
  static groupStrokes(strokes) {
    const blocks = Grouper.groupStrokesIntoLines(strokes);
    const allClusters = [];
    for (const block of blocks) {
      allClusters.push(...block.clusters);
    }
    return allClusters;
  }
}

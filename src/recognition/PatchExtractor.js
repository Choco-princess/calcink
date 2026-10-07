import { pixelCrop } from '../canvas/coordinates.js';

/**
 * PatchExtractor: Crops a character bounding box from the drawing canvas,
 * pads it with aspect-ratio preservation to a 50x50 square,
 * and formats it into normalized RGB float32 pixel data for the CNN.
 */
export class PatchExtractor {
  static TARGET_SIZE = 50;

  /**
   * Extract image patch from an HTML5 canvas given a bounding box.
   * @param {HTMLCanvasElement} sourceCanvas The ink canvas
   * @param {Object} bounds { minX, minY, maxX, maxY }
   * @param {number} dpr Device pixel ratio
   * @returns {Float32Array} 50x50x3 normalized float32 pixel array
   */
  static extractPatch(sourceCanvas, bounds, dpr = 1) {
    const targetSize = PatchExtractor.TARGET_SIZE;

    // Create offscreen canvas for processing
    const offCanvas = document.createElement('canvas');
    offCanvas.width = targetSize;
    offCanvas.height = targetSize;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true });

    // Fill with white background (matching the Kaggle training dataset)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetSize, targetSize);

    // Stroke bounds already include the pen radius. Extra crop padding made
    // digits occupy too little of the model input (notably 6 versus 8).
    const pad = 0;
    const crop = pixelCrop(bounds, dpr, pad, sourceCanvas.width, sourceCanvas.height);
    const srcX = crop.x, srcY = crop.y, srcW = crop.width, srcH = crop.height;

    if (srcW <= 0 || srcH <= 0) {
      return new Float32Array(targetSize * targetSize * 3);
    }

    // Keep a narrow white border while preserving the symbol's aspect ratio.
    const innerSize = 46;
    const scale = Math.min(innerSize / srcW, innerSize / srcH);
    const destW = srcW * scale;
    const destH = srcH * scale;
    const destX = (targetSize - destW) / 2;
    const destY = (targetSize - destH) / 2;

    // Draw cropped ink onto the white square
    ctx.drawImage(sourceCanvas, srcX, srcY, srcW, srcH, destX, destY, destW, destH);

    // Get pixel buffer
    const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
    const pixels = imgData.data; // RGBA array

    // Convert to Float32Array of shape [50, 50, 3] normalized to [0, 1]
    const tensorData = new Float32Array(targetSize * targetSize * 3);
    let tensorIdx = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255.0;
      const g = pixels[i + 1] / 255.0;
      const b = pixels[i + 2] / 255.0;

      tensorData[tensorIdx++] = r;
      tensorData[tensorIdx++] = g;
      tensorData[tensorIdx++] = b;
    }

    return tensorData;
  }
}

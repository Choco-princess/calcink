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

    const pad = 6;
    const srcX = Math.max(0, (bounds.minX - pad) * dpr);
    const srcY = Math.max(0, (bounds.minY - pad) * dpr);
    const srcW = Math.min(sourceCanvas.width - srcX, (bounds.maxX - bounds.minX + pad * 2) * dpr);
    const srcH = Math.min(sourceCanvas.height - srcY, (bounds.maxY - bounds.minY + pad * 2) * dpr);

    if (srcW <= 0 || srcH <= 0) {
      return new Float32Array(targetSize * targetSize * 3);
    }

    // Preserve aspect ratio by fitting into 40x40 inner area (with 5px padding border)
    const innerSize = 40;
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

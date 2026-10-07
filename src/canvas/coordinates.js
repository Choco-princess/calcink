// Pointer and segmentation geometry stay in CSS pixels. Only these helpers
// cross into the canvas backing-store pixel coordinate system.
export function backingSize(cssWidth, cssHeight, dpr) {
  return {
    width: Math.max(1, Math.round(cssWidth * dpr)),
    height: Math.max(1, Math.round(cssHeight * dpr))
  };
}

export function pointerPosition(clientX, clientY, rect, logicalWidth = rect.width || 1, logicalHeight = rect.height || 1) {
  return {
    x: (clientX - rect.left) * logicalWidth / (rect.width || logicalWidth),
    y: (clientY - rect.top) * logicalHeight / (rect.height || logicalHeight)
  };
}

export function pixelCrop(bounds, dpr, padding, canvasWidth, canvasHeight) {
  const x0 = Math.max(0, Math.floor((bounds.minX - padding) * dpr));
  const y0 = Math.max(0, Math.floor((bounds.minY - padding) * dpr));
  const x1 = Math.min(canvasWidth, Math.ceil((bounds.maxX + padding) * dpr));
  const y1 = Math.min(canvasHeight, Math.ceil((bounds.maxY + padding) * dpr));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

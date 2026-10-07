import { Stroke } from '../segmentation/Stroke.js';
import { Grouper } from '../segmentation/Grouper.js';
import { Recognizer } from './Recognizer.js';
import { suggestShapeSymbol } from './ShapeRules.js';
import * as tf from '@tensorflow/tfjs';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import wasmUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm?url';
import simdUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm?url';
import threadedSimdUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm?url';

const recognizer = new Recognizer();
let ready = false;

function reviveStroke(raw) {
  const stroke = new Stroke(raw.id);
  stroke.color = raw.color;
  stroke.width = raw.width;
  for (const point of raw.points) stroke.addPoint(point.x, point.y, point.pressure);
  return stroke;
}

function serializeBlock(block, scale) {
  return {
    id: block.id,
    lineIndex: block.lineIndex,
    displayIndex: block.displayIndex,
    bounds: block.bounds,
    clusters: block.clusters.map(cluster => ({
      id: cluster.id,
      bounds: cluster.bounds,
      centerY: cluster.centerY,
      widthPx: cluster.widthPx,
      heightPx: cluster.heightPx,
      strokeCount: cluster.strokes.length,
      shapeSuggestion: suggestShapeSymbol(cluster.strokes, cluster.bounds, scale),
      weakJoin: cluster.weakJoin,
      strokeBounds: cluster.strokes.map(stroke => stroke.bounds)
    }))
  };
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      setWasmPaths({
        'tfjs-backend-wasm.wasm': wasmUrl,
        'tfjs-backend-wasm-simd.wasm': simdUrl,
        'tfjs-backend-wasm-threaded-simd.wasm': threadedSimdUrl
      });
      try {
        await tf.setBackend('wasm');
        await tf.ready();
      } catch (error) {
        console.warn('WASM backend unavailable, using CPU:', error);
        await tf.setBackend('cpu');
      }
      const modelUrl = new URL(`${import.meta.env.BASE_URL}model/model.json`, self.location.origin);
      ready = await recognizer.loadModel(modelUrl.href);
      self.postMessage({ type: ready ? 'ready' : 'error', message: ready ? '' : 'Model could not be loaded' });
    } else if (data.type === 'group') {
      const strokes = data.strokes.map(reviveStroke);
      const scale = Grouper.estimateScale(strokes);
      const blocks = Grouper.groupStrokesIntoLines(strokes).map(block => serializeBlock(block, scale));
      self.postMessage({
        type: 'grouped', revision: data.revision, blocks,
        scale
      });
    } else if (data.type === 'predict' && ready) {
      const patches = data.patches.map(buffer => new Float32Array(buffer));
      const predictions = await recognizer.predictBatch(patches);
      self.postMessage({ type: 'predicted', purpose: data.purpose || 'normal', revision: data.revision, predictions });
    }
  } catch (error) {
    self.postMessage({ type: 'error', revision: data.revision, message: error.message });
  }
};

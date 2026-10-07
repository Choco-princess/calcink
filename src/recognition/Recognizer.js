import * as tf from '@tensorflow/tfjs';

/**
 * Recognition Engine: Manages TensorFlow.js model loading and inference.
 */
export class Recognizer {
  constructor() {
    this.model = null;
    this.isLoaded = false;
    // The training notebook assigns these 15 labels to indices 0..14. The
    // architecture has 16 outputs, but its last output has no listed class.
    // Decimal points are handled by contextual geometry after grouping.
    this.labels = [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'add', 'div', 'eq', 'mul', 'sub'
    ];
    this.labelToSymbol = {
      '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
      '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
      'add': '+',
      'div': '÷',
      'eq': '=',
      'mul': '×',
      'sub': '-'
    };
  }

  async loadModel(modelPath = '/model/model.json') {
    if (this.isLoaded) return true;
    try {
      console.log('Loading TF.js model from:', modelPath);
      this.model = await tf.loadLayersModel(modelPath);
      this.isLoaded = true;
      console.log('Math CNN model loaded successfully!');
      return true;
    } catch (err) {
      console.error('Failed to load TF.js model:', err);
      return false;
    }
  }

  /**
   * Run inference on an array of 50x50x3 Float32Array patches.
   * @param {Array<Float32Array>} patches
   * @returns {Promise<Array<{ symbol: string, confidence: number }>>}
   */
  async predictBatch(patches) {
    if (!this.isLoaded || !this.model || patches.length === 0) return [];

    const batchSize = patches.length;
    // Combine Float32Arrays into a single flat array
    const combinedData = new Float32Array(batchSize * 50 * 50 * 3);
    for (let i = 0; i < batchSize; i++) {
      combinedData.set(patches[i], i * 50 * 50 * 3);
    }

    return tf.tidy(() => {
      // Shape: [batchSize, 50, 50, 3]
      const inputTensor = tf.tensor4d(combinedData, [batchSize, 50, 50, 3]);
      const predictions = this.model.predict(inputTensor);
      const probabilities = predictions.arraySync();

      const results = [];
      for (let i = 0; i < batchSize; i++) {
        const probs = probabilities[i];
        if (probs.length !== 16) throw new Error(`Unexpected model output count: ${probs.length}`);
        const candidates = probs.map((confidence, index) => ({
          symbol: this.labelToSymbol[this.labels[index]] || '?', confidence
        })).sort((a, b) => b.confidence - a.confidence).slice(0, 3);
        results.push({ ...candidates[0], candidates });
      }

      return results;
    });
  }
}

/**
 * Recognition Engine: Manages TensorFlow.js model loading and inference.
 */
export class Recognizer {
  constructor() {
    this.model = null;
    this.isLoaded = false;
    // Dataset III exact label order (15 classes + 1 dummy)
    this.labels = [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'add', 'div', 'eq', 'mul', 'sub', 'dec'
    ];
    this.labelToSymbol = {
      '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
      '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
      'add': '+',
      'div': '÷',
      'eq': '=',
      'mul': '×',
      'sub': '-',
      'dec': '.'
    };
  }

  async loadModel(modelPath = './public/model/model.json') {
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
        let maxIdx = 0;
        let maxVal = probs[0];
        for (let j = 1; j < probs.length; j++) {
          if (probs[j] > maxVal) {
            maxVal = probs[j];
            maxIdx = j;
          }
        }

        const label = this.labels[maxIdx];
        const symbol = this.labelToSymbol[label] || label;
        results.push({ symbol, confidence: maxVal });
      }

      return results;
    });
  }
}

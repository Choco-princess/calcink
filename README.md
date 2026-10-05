# CalcInk: On-Device Handwritten Math Calculator

**CalcInk** is a responsive, web-based digital mathematical notebook that interprets handwritten mathematical equations in real time and projects deterministic calculated results directly onto the canvas.

Built for the **Inter IIT Tech Meet 15.0 (Bootcamp - Phase 1 Software PS)**.

---

## 🌟 Key Features

* **100% Client-Side & Offline:** All workloads—stroke capture, image preprocessing, convolutional neural network inference, and mathematical evaluation—run entirely inside the browser with zero cloud/API dependencies.
* **60 FPS Fluid Digital Ink Canvas:** High-DPI/Retina display scaling (`window.devicePixelRatio`) with smooth quadratic Bézier curve interpolation, undo/redo history, stroke-based erasing, and customizable pen thickness.
* **Two-Tier Hybrid Stroke Segregation:**
  * *Tier 1 (2D Equation Block Slicing):* Distinguishes independent horizontal rows and side-by-side scratchpad equations.
  * *Tier 2 (Anisotropic Directional Morphological Clustering):* Bridges stacked multi-stroke symbols (`=`, `÷`, `1` with base `_`, `5` with top hat) while strictly preventing horizontal domino bleeding between adjacent characters.
* **On-Device 16-Symbol CNN:** WebGL hardware-accelerated classification (<3ms per character) across:
  * Digits: `0, 1, 2, 3, 4, 5, 6, 7, 8, 9`
  * Operators: `+, -, ×, ÷, ., =`
* **Deterministic BODMAS Evaluation:** Safe, sandboxed arithmetic evaluator (zero `eval()`) supporting multi-digit numbers, floating-point decimals, unary negatives, strict operator precedence, and graceful division-by-zero (`Undefined`) handling.
* **Dynamic Inline Canvas Projection:** Evaluated answers are projected in real time onto the canvas surface adjacent to the terminal `=` sign.

---

## 🚀 Quick Start (Local Setup)

The application runs using native browser ES modules with zero build overhead.

### Option 1: Python HTTP Server (Recommended)
```bash
# Clone the repository
git clone https://github.com/Choco-princess/calcink.git
cd calcink

# Start local server
python3 -m http.server 8080
```
Open [http://localhost:8080](http://localhost:8080) in your web browser.

### Option 2: Node.js / NPM
```bash
# Install development dependencies
npm install

# Run local development server
npm run dev
```

---

## 🧪 Automated Test Suites

The repository contains automated unit and integration test suites validating the segmentation engine and the arithmetic evaluator:

```bash
# Run stroke clustering & multi-line segmentation tests
node test_grouper.js

# Run BODMAS arithmetic evaluator tests
node test_evaluator.js
```

---

## 🏗️ Architecture & Data Flow

```
[ Freehand Canvas Drawing ]
            │
            ▼
[ Tier 1: 2D Spatial & Y-Valley Equation Slicing ]
            │ (Segments canvas into independent equation lines & blocks)
            ▼
[ Tier 2: Anisotropic Directional Morphological Clustering ]
            │ (Groups multi-stroke characters into Left-to-Right clusters)
            ▼
[ Patch Extractor & Normalizer (50x50x3 RGB) ]
            │
            ▼
[ On-Device TensorFlow.js CNN Inference (WebGL GPU) ]
            │ (Outputs 16-class probability distribution <3ms)
            ▼
[ Deterministic BODMAS / PEMDAS Evaluator ]
            │ (Multi-digit tokenization, operator precedence, zero division check)
            ▼
[ Dynamic Canvas Surface Projection ]
   (Renders answer inline right next to the terminal '=' sign)
```

For a comprehensive log of design iterations, edge case analyses, and mathematical derivations, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 📚 Model Attribution & Architecture

* **Source Repository:** [rafiibnsultan/Math_Symbols_Classify](https://github.com/rafiibnsultan/Math_Symbols_Classify)
* **License:** MIT License
* **Training Dataset:** [Kaggle Handwritten Math Symbols Dataset (Xai Nano)](https://www.kaggle.com/datasets/xainano/handwrittenmathsymbols) — 100,000+ samples.
* **Model Architecture:** 11-layer Convolutional Neural Network (6 Conv2D layers + 3 MaxPooling2D layers + Dropout + Dense 128 + Dense 16 Softmax).
* **Reported Accuracy:** 99.85% test accuracy (1.00 F1 score).
* **Reference Citation:** Published in IEEE: [ICEEICT 2021 (IEEE Xplore: 9667794)](https://ieeexplore.ieee.org/abstract/document/9667794).

---

## 📁 Repository Structure

```
calcink/
├── index.html                   # Digital notebook application interface
├── ARCHITECTURE.md              # Detailed architecture, design decisions & error log
├── CalcInk_Problem_Statement.pdf # Official competition problem statement
├── README.md                    # Project overview, setup & model attribution
├── convert_to_tfjs.py           # Keras HDF5 to TensorFlow.js weight converter
├── test_grouper.js              # Automated segmentation test suite
├── test_evaluator.js            # Automated BODMAS math evaluator test suite
├── package.json                 # Project configuration
├── public/
│   └── model/
│       ├── model.json           # TF.js model layer topology & manifest
│       └── group1-shard1of1.bin # 8.9 MB Float32 binary weight shard
└── src/
    ├── main.js                  # App orchestrator & AI pipeline coordinator
    ├── style.css                # Digital notebook paper aesthetics
    ├── canvas/
    │   ├── CanvasManager.js     # Dual-layer, 60 FPS drawing & overlay renderer
    │   └── History.js           # Undo / Redo history manager
    ├── segmentation/
    │   ├── Grouper.js           # Two-tier hybrid stroke & line clustering engine
    │   └── Stroke.js            # Vector stroke model & geometric bounds
    ├── recognition/
    │   ├── PatchExtractor.js    # 50x50 aspect-ratio preserved patch extractor
    │   └── Recognizer.js        # TF.js WebGL inference engine
    └── evaluator/
        └── Evaluator.js         # Deterministic BODMAS math evaluation engine
```

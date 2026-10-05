# CalcInk: Architecture, Design Decisions & Engineering Journey

A comprehensive technical log documenting the evolution of **CalcInk**, decisions made, architectural iterations, edge cases encountered, and final implementations.

---

## 1. Problem Formulation & Constraints

**CalcInk** is an on-device, handwritten mathematical scratchpad built for the web.

### Core PS Constraints:
1. **100% Client-Side & Offline:** Zero external or cloud APIs (no OpenAI Vision, Mathpix, Google Cloud Vision).
2. **Fixed Vocabulary (16 Symbols):**
   * Digits: `0, 1, 2, 3, 4, 5, 6, 7, 8, 9`
   * Operators: `+, -, ×, ÷, ., =`
3. **Strict 60 FPS Canvas Integrity:** Smooth, uninterrupted stylus/mouse drawing while recognition and mathematical parsing execute non-blockingly.
4. **Deterministic Evaluation:** Un-sanitized `eval()` is strictly prohibited; deterministic BODMAS/PEMDAS order of operations with support for decimals, multi-digit numbers, negative values, and clean division-by-zero error handling.

---

## 2. Model Selection: Decisions & Trade-Offs

### Initial Ideas & Questions Explored:
1. **Pixels (Images) vs. Stroke Coordinates (Vectors):**
   * *Coordinates (RNN/Transformer/Point Cloud):* Requires complex temporal sequence modeling and specialized vector graph representations. Difficult to source small, standard web runtimes.
   * *Pixels / Image Patches (CNN / ViT):* Extremely mature, lightweight, deterministic, and fast. Bounding boxes are cropped from the canvas and resized to normalized $32 \times 32$ or $28 \times 28$ grayscale tensors.
   * **Decision:** Use **Hybrid Vector-Raster**: capture raw stroke coordinates for fluid ink rendering, history undo/redo, and spatial grouping; use rendered pixel patches for CNN inference.

2. **Full Equation OCR vs. Single-Symbol Classifier:**
   * Repositories reviewed: `yixchen/Math_Handwriting_OCR`, `Texo`, `RapidLaTeXOCR`, CROHME end-to-end models.
   * *Full End-to-End Image-to-LaTeX (Seq2Seq / Transformers):* Models are large (20MB–100MB+), slow (100ms+ inference), and hard to synchronize with real-time incremental edits.
   * *Isolated Symbol Classifier (16 Classes):* Models are tiny (<1MB–2MB), execute in <2ms via ONNX Runtime Web / WebAssembly, and allow fine-grained stroke replacement/erasing.
   * **Decision:** Decompose the pipeline into:
     $$\text{Canvas Drawing} \longrightarrow \text{Stroke Segregation} \longrightarrow \text{Lightweight CNN} \longrightarrow \text{BODMAS Parser}$$

3. **Runtime Format (ONNX vs. TensorFlow.js):**
   * Browser environments cannot execute Python PyTorch (`.pt`) or native TensorFlow code directly.
   * **ONNX (`onnxruntime-web`):** Microsoft’s runtime targeting WebAssembly (WASM) and WebGPU. Provides low memory overhead and near-native execution speed.
   * **TensorFlow.js (`tfjs`):** Google's browser runtime using WebGL shaders.
   * **Decision:** Adopt ONNX as the primary deployment format for fast inference inside an isolated Web Worker.

---

## 3. Step 1: Canvas Architecture & Rendering

### The Dual-Layer Canvas Architecture:
* **Problem:** If recognition boxes, highlights, and helper tags are painted directly onto the user's drawing canvas, the entire screen must be cleared and repainted on every frame, causing micro-stutters and violating the 60 FPS frame budget.
* **Solution:** A **Dual-Layer Canvas**:
  * **Base Canvas (`ink-canvas`):** Renders pen ink strokes at 60 FPS using midpoint quadratic Bézier curve interpolation for natural fluid ink physics.
  * **Overlay Canvas (`overlay-canvas`):** Projects dashed bounding boxes, equation labels (`Eq 1`, `Eq 2`), and inline result projections without modifying the base ink layer.
* **Display Scaling:** Automatic scaling using `window.devicePixelRatio` to eliminate blurriness on Retina and high-DPI viewports.
* **Editing Utilities:** Stroke-based eraser (removes intersecting strokes cleanly), undo/redo stacks, and stroke thickness controls (`2px`, `4px`, `7px`).

---

## 4. Step 2: Stroke Segregation (Evolution & Edge Cases)

Stroke segregation is the process of grouping individual pen lines into discrete character boxes and independent equations.

```
Iteration 1: Naive Proximity & Bounding Box Overlap
                      │
                      ▼ (Failed: Domino Mega-Box & Cross-Row Interleaving)
Iteration 2: 16-Symbol Domain Rules & Global Y-Overlap Line Grouping
                      │
                      ▼ (Failed: Vertical Column Fusing & Super-Line Collapse)
Iteration 3: Robust Two-Tier Hybrid Architecture (Production)
```

---

### Iteration 1: Naive Spatial Proximity (Graph Connected Components)
* **Approach:** If Stroke B overlaps Stroke A, or if the bounding box distance $d(A, B) < \text{threshold}$, merge them into the same character via Union-Find.
* **Edge Cases Discovered in Testing:**
  1. **The "Domino Mega-Box" Effect:**
     * In an expression like `3 + 2 = 4`, the `3` was slightly close to `+`, `+` was close to `2`, `2` was close to `=`, and `=` was close to `4`.
     * Transitive clustering merged the entire equation into one single mega-box (`#5`).
  2. **Cross-Row Interleaving:**
     * All strokes across the canvas were sorted globally by horizontal $X$.
     * Equation 1 and Equation 2 had their numbers interleaved (`#1` on line 2, `#2` on line 1, `#3` on line 2...).

---

### Iteration 2: 16-Symbol Domain Heuristics & First-Pass Line Slicing
* **Insights Exploited:**
  * **The "No Side-by-Side Parts" Rule:** In the 16 math symbols (`0-9`, `+`, `-`, `×`, `÷`, `.`, `=`), **no character has two separate disconnected parts sitting horizontally side-by-side**.
  * Multi-stroke symbols only exist in 3 forms:
    1. Intersecting/crossing (`+`, `×`, `4`)
    2. Vertically stacked (`=`, `÷`, `1` with base `_`, `5` with top hat)
    3. Small punctuation dots (`.`, `÷`)
  * **Broken Line Healing:** Added endpoint-to-endpoint proximity checks ($<14\text{px}$) to stitch lines when a user pauses or lifts the pen mid-stroke.
  * **Line Grouping:** Grouped strokes into lines if their vertical bounds overlapped.

* **Failures Exposed During Live Testing:**
  1. **Vertical Column Cross-Merging:**
     * Writing `1 + 2 = 3` with `1 + 5 = 4` directly underneath caused the top `1` and bottom `1` to merge into one giant vertical box.
     * *Cause:* The vertical stacking rule for `=` allowed strokes stacked in the same column to merge if their vertical gap was moderate.
  2. **The "Super-Line" Collapse:**
     * Once the top `1` and bottom `1` fused, Line 1's bounding box expanded across the entire vertical height of the canvas.
     * This caused equations on the right side of the canvas to get swallowed into `Line 1` as well.
  3. **Brittle Pixel Thresholds ("Tape on Water"):**
     * Static numbers (e.g. `25px`, `40px`) broke down when drawing varied from small to large scales.

---

### Iteration 3: Production Two-Tier Hybrid Architecture (Final)

We replaced static thresholds with scale-invariant geometric principles grounded in digital document analysis:

```
[ Canvas Drawing ]
       │
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 1: 2D Spatial & Y-Valley Equation Block Slicing                   │
│ • Detects independent horizontal rows using adaptive median scale     │
│ • Golden Rule: Two tall vertical shapes NEVER share a line band        │
│ • Splits side-by-side equations across large horizontal gaps           │
└────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Tier 2: Anisotropic Directional Morphological Clustering               │
│ • Vertical Bridging Kernel: Connects stacked '=' bars & '÷' dots       │
│ • Zero Horizontal Dilation: Absolute barrier against domino bleeding   │
│ • Strict Morphological Validation: Base bars on '1', hats on '5'       │
└────────────────────────────────────────────────────────────────────────┘
       │
       ▼
[ Clean Left-to-Right Equation Streams: Eq 1, Eq 2, Eq 3... ]
```

#### Key Mathematical Rules in Tier 1 (Equation Block Segmentation):
1. **Vertical Stack Barrier:** Two tall vertical strokes ($H > 0.6 \times H_{\text{median}}$ and $H > W \times 0.8$) stacked vertically are mathematically guaranteed to belong to **separate lines**. This completely prevents stacked equations from fusing.
2. **Horizontal Equation Splitting:** If two stroke clusters in the same horizontal band are separated by a whitespace gap $\Delta X > 2.2 \times H_{\text{median}}$, they are segmented into **separate scratchpad equation blocks** (`Eq 1` and `Eq 2`).
3. **Adaptive Scale ($H_{\text{median}}$):** All tolerances scale dynamically based on the median stroke height of the active drawing.

#### Key Mathematical Rules in Tier 2 (Intra-Equation Character Clustering):
1. **Zero Horizontal Dilation ($K_x = 0$):** If Stroke B is to the right of Stroke A ($xOverlap = 0$), they can **never** merge, eliminating the domino effect forever.
2. **Anisotropic Vertical Bridging ($K_y$):** Vertical bridging is permitted *only* for:
   * **`=` sign:** Both strokes are horizontal bars ($W > H \times 0.8$) with high horizontal overlap ($>35\%$).
   * **`÷` sign:** One stroke is a dot ($W, H \le 18\text{px}$) and the other is a horizontal bar.
   * **`1` with base bar `_`:** A vertical stem ($H > W \times 1.1$) and a horizontal base bar ($W > H$) positioned at its bottom edge.
   * **`5` / `7`:** Top cap or crossbar with vertical gap $< 0.4 \times H_{\text{median}}$.
3. **2D Intersection:** Crossing strokes (`+`, `×`, `4`) merge via mutual bounding overlap ($xOverlapRatio > 15\%$ and $yOverlapRatio > 15\%$).

---

## 5. Verification & Test Suite Results

The segmentation logic is verified via an automated test suite (`calcink/test_grouper.js`):

| Test Case | Scenario Description | Result |
| :--- | :--- | :---: |
| **Test 1** | Vertically stacked equations with aligned `1`s (`1+2` over `1+5`) | **PASSED** (Cleanly split into Eq 1 and Eq 2) |
| **Test 2** | Side-by-side equations on the same horizontal Y band | **PASSED** (Split into independent equation blocks) |
| **Test 3** | Tight equation `3+2=4` (Anti-domino stress test) | **PASSED** (Cleanly produced 5 distinct character boxes) |
| **Test 4** | Equals sign `=` with wide vertical gap | **PASSED** (Both bars merged into 1 character box) |
| **Test 5** | Multi-stroke `1` (vertical stem + bottom base bar `_`) | **PASSED** (Merged into 1 character box) |

---

## 6. Implementation Roadmap Status

```
[ Step 1: Canvas Engine ] ──► DONE (Dual-layer, 60 FPS, Retina scaling, History)
[ Step 2: Stroke Segregation ] ──► DONE (Two-tier hybrid architecture, 5 automated tests)
[ Step 3: Patch Extractor & Normalizer ] ──► DONE (Aspect-ratio square padding to 50x50x3)
[ Step 4: Model Runtime & Inference ] ──► DONE (TF.js WebGL GPU, <3ms latency)
[ Step 5: BODMAS Math Engine & Projection ] ──► DONE (Deterministic parser & dynamic canvas projection)
```

---

## 7. Model Integration & The "Off-by-One Label Shift" Error

### Model Sourcing & Conversion:
* **Selected Model:** `rafiibnsultan/Math_Symbols_Classify` (Dataset III: Xai Nano Kaggle Dataset, 99.85% test accuracy).
* **Architecture:** 11-layer CNN (`conv2d` through `conv2d_5`, 3 MaxPools, Dropout, Dense 128, Dense 16 softmax).
* **Conversion:** Extracted layer weights using PyTables and serialized into client-side TensorFlow.js format (`public/model/model.json` and `group1-shard1of1.bin` - 8.9 MB).

### The Live Testing Error:
During live browser testing, the user drew:
`1 + 3 =`, `3 + 1 =`, and all standalone operators: `.`, `+`, `-`, `=`, `÷`, `×`.

#### Observed Symptoms:
1. Drawing `+` yielded `'+' (100%)`.
2. Drawing `-` yielded `'x' (100%)`.
3. Drawing `=` yielded `'÷' (100%)`.
4. Drawing `÷` yielded `'.' (100%)`.
5. Drawing `×` yielded `'=' (100%)`.
6. Drawing an expression ending with `=` (like `1 + 3 =`) resulted in `1 + 3 ÷`, causing the arithmetic evaluator to wait for trailing input and display no inline answer.

#### Root Cause Analysis:
By inspecting the original training notebook (`Working with Dataset III.ipynb` line 120), we discovered that Dataset III was trained with 15 classes without `dec`:
```python
# Dataset III actual training labels:
labels = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'add', 'div', 'eq', 'mul', 'sub']
# Index:   0    1    2    3    4    5    6    7    8    9    10     11     12    13     14
```

However, our JavaScript `Recognizer.js` had imported the 16-class label list from `Working with Dataset II.ipynb`, which had inserted `'dec'` at index 11:
```javascript
// Our initial JS labels:
['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'add', 'dec', 'div', 'eq', 'mul', 'sub']
// Index:                                            10     11     12     13    14     15
```

Because of this mismatch:
* The CNN was predicting **100% correctly** on every single input.
* Index 11 (`div` / `÷`) was mislabeled as `dec` (`.`).
* Index 12 (`eq` / `=`) was mislabeled as `div` (`÷`).
* Index 13 (`mul` / `×`) was mislabeled as `eq` (`=`).
* Index 14 (`sub` / `-`) was mislabeled as `mul` (`×`).
* The math evaluator saw an expression ending with a division operator (`1 + 3 ÷`) instead of an equals sign, preventing evaluation.

#### Resolution:
1. Re-aligned `this.labels` in `Recognizer.js` to match the exact index order of Dataset III:
   `['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'add', 'div', 'eq', 'mul', 'sub', 'dec']`
2. Added geometric baseline dot detection in `main.js`: any standalone stroke with $W \le 20\text{px}$ and $H \le 20\text{px}$ is automatically recognized as a decimal point (`.`) with 99% confidence.


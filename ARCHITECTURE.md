# CalcInk architecture

For the less technical history of decisions and handwriting tests, see [PROJECT_JOURNEY.md](PROJECT_JOURNEY.md).

## Goal and limits

CalcInk is a 100% client-side browser scratchpad for the 16-symbol arithmetic vocabulary in the competition brief. Expressions are predominantly horizontal and may occupy several rows or several positions on one row. The application evaluates only an expression ending in `=`. It does not use a cloud service or JavaScript `eval()`.

The architecture keeps the original vector-to-raster approach. Vector strokes support editing and grouping; a bundled CNN classifies 50×50 RGB patches; a strict parser calculates the answer.

```text
Pointer input → CSS-pixel strokes → worker grouping → symbol boxes
             → main-thread 50×50 patch extraction → worker TF.js/WASM CNN
             → terminal-= equation split → strict arithmetic → overlay answer
```

The drawing canvas and result overlay stay on the main thread. Grouping and inference run in one worker. Patch extraction reads small canvas regions in chunks and yields between groups. Each edit increments a revision; worker replies for earlier revisions are ignored.

## Notebook and navigation

The app now keeps a notebook of independent pages. Each page holds its vector strokes and manual symbol corrections, while the active page alone is sent through grouping, recognition, and evaluation. Switching pages increments the recognition revision, clears old results, and redraws the selected page; a late worker response from the previous page cannot replace it. Undo/Redo history is reset when opening another page so an edit cannot silently cross pages.

`Notebook.js` serializes strokes to plain JSON, recreates their bounds when opening a page, validates imported notebooks, and stores the notebook in IndexedDB. Autosave is debounced after edits and specifically after a stroke finishes. Export downloads the entire notebook; Import validates a file and replaces the current notebook only after confirmation. There is no server sync. The browser or operating system may clear local storage, so Export is the portable backup. The separate Save Sample action remains a current-page diagnostic export.

Each page has a fixed logical size of 1100×800 CSS pixels. A scrollable viewport exposes the rest of the page on smaller screens. Zoom scales the visual sheet from 50% to 200%, while stored strokes, eraser geometry, and recognition bounds remain in unscaled page coordinates. Pointer positions are divided by the displayed scale. Move mode drags the viewport instead of adding ink. Stylus only mode filters touch pointers from drawing and erasing; it accepts pen and mouse pointers, while Move still works with touch. This is a practical finger filter rather than device-level palm rejection.

The default canvas view shows ink and answers without diagnostic boxes. A short first-use hint disappears after drawing begins. In Pen mode, a stationary tap on an existing recognized symbol opens a correction picker, while a moving pointer draws normally. A manual choice is keyed to the symbol's stroke IDs, reapplied after recognition, and recalculates the expression. Corrections to changed or regrouped strokes are deliberately discarded. Answers fade in briefly unless reduced motion is requested.

## Coordinates and editing

Stroke points, bounding boxes, eraser radius, and grouping distances are CSS pixels. `devicePixelRatio` changes only canvas backing resolution and the source-pixel crop used to create CNN patches. Both canvas layers resize together and retained vector strokes are redrawn. Pointer capture keeps a stroke alive when the pointer leaves the canvas. A whole-stroke eraser removes touched strokes; a pixel eraser samples and splits touched paths. Undo/redo stores previous stroke arrays.

## Grouping

`Grouper.js` uses a small constrained geometric procedure:

1. Estimate a writing scale from substantial, non-flat strokes. If a drawing contains only bars and dots, use the upper part of their size distribution. This keeps punctuation from shrinking every threshold.
2. Start with one group per stroke. Consider physical ink contact, endpoints in the same horizontal footprint, aligned parallel bars, centered dots around a bar, and the disconnected lower arm/stem form of `4`. The score of a proposed join is checked against the **combined** group width and height before it is accepted. This prevents a chain of individually nearby strokes from swallowing a whole equation.
3. Use substantial groups as row anchors, fit a bounded row slope, then attach short bars and dots to the nearest plausible row. A pairwise overlap does not transitively join two rows.
4. Sort groups left to right and split a row at a very large whitespace gap. After recognition, a terminal `=` also divides neighboring equations sharing a row.

This is a bounded heuristic, not a general handwriting layout recognizer. Strokes that intentionally cross between adjacent symbols, nearly touching rows, or heavily tilted expressions can remain ambiguous. The tests preserve known examples, but actual handwriting examples should guide future threshold changes.

## Recognition and arithmetic

The [source training notebook](https://github.com/rafiibnsultan/Math_Symbols_Classify/blob/main/Working%20with%20Dataset%20III.ipynb) assigns 15 labels in this order: `0–9, add, div, eq, mul, sub`. The model architecture has 16 output neurons, but the notebook defines no sixteenth class; an argmax on that output is shown as unknown rather than assigned an invented symbol. It has **no decimal class**. A single small ungrouped mark is interpreted as a decimal point; dots centered around a division bar are grouped with that bar first. The mark is shown without an invented CNN confidence.

The notebook loads RGB images, resizes them to 50×50, and divides pixel values by 255. It creates an augmentation generator but fits the saved weights directly on the unaugmented arrays. The app also uses RGB values in `[0,1]`. Its aspect-preserving crop now places the ink inside a 46×46 area with no extra source padding; stroke bounds already include pen width. On the saved real `88889999` drawing, the former 40×40 crop with 6 CSS pixels of source padding read `68089419`, while the tighter crop read all eight symbols correctly through the full browser pipeline. This is one sample, not an accuracy estimate. The current conservative shape rules override the CNN only for clear bars (`−`, `=`, `÷`), two-stroke `+`, and a top-bar/diagonal `7`; other digit styles remain model decisions.

If recognition remains weak on a broader labeled sample set, compare a replacement model on the same saved strokes before switching. [Maciej Caputa's browser recognizer](https://github.com/MaciejCaputa/handwritten-mathematics-recogniser) covers the math symbols but imposes connected-stroke constraints. [ink-on](https://github.com/kimseungdae/ink-on) runs a whole-expression CoMER model in the browser; its published 36.41% exact-expression result on CROHME 2014 is a different task from CalcInk's per-symbol arithmetic. Neither published figure establishes improvement on our handwriting. A new model would also need to preserve local, offline inference and the 16-symbol scope.

TensorFlow.js and its WASM files are installed as local dependencies and bundled into the production build. The worker prefers WASM, then CPU if necessary. Model failure is shown as a visible unavailable state rather than leaving an unhandled exception.

The parser accepts multi-digit and decimal numbers, unary minus, and `+ − × ÷` with standard precedence. It requires a terminal `=`; incomplete writing stays blank. Repeated decimal points, unexpected symbols, and malformed operator sequences return `Error`. Division by zero returns `Undefined`. Results are rounded to four decimal places for display.

The evaluator also returns a short explanation for the visible status line: unfinished equation, unread symbol, invalid symbol order, division by zero, or a valid result. This does not change the strict arithmetic results.

## Offline build and verification

Vite emits a service worker that pre-caches the production page, worker, model, and all runtime assets. The worker only handles same-origin requests under the app's base path. This enables reload after the first successful load without network access.

`npm test` runs deterministic grouping, parser, and eraser cases, including the saved real 8/9 stroke sheet for grouping. A local headless-browser smoke check has confirmed model loading, `1 + 1 = → 2`, updating after an erased digit, and reaching Ready after a reload with the local server stopped. The saved 8/9 sheet also passed a full draw-and-recognize replay after the crop change, and a user-drawn fresh 6/8 sheet was reported correct. Natural handwriting accuracy, physical touch/stylus behavior, and frame timing on representative devices still require broader manual measurement; the original repository's dataset accuracy does not prove those outcomes.

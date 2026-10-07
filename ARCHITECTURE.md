# CalcInk architecture

## Technical overview

CalcInk is a client-side Vite application with two stacked canvas elements. The lower canvas renders ink from stored vector strokes; the upper canvas renders recognition boxes, answers, and Practice marks. Both are drawn on the main thread. Pen paths, hit testing, grouping distances, and the 1100 by 800 page use CSS-pixel coordinates. `devicePixelRatio` affects only the backing canvases and image sampling, while zoom changes the displayed scale.

```text
Pointer Events -> vector strokes in CSS pixels -> worker row and symbol grouping
               -> main-thread 50 by 50 RGB crops -> worker CNN inference
               -> limited geometric symbol overrides -> equation splitting
               -> strict arithmetic parser -> answer or Practice overlay
```

The worker runs a bundled TensorFlow.js CNN with a local WebAssembly backend and CPU fallback. It proposes bounded joins between strokes, then assigns the resulting symbols to mostly horizontal rows. The main thread uses `PatchExtractor` to make 50 by 50 RGB images and sends them back to the worker for CNN inference. `ShapeRules` supplies overrides only for clear forms such as bars, `+`, `÷`, and a top-bar/diagonal `7`; a decimal dot is handled by context because the model has no decimal class. If a completed expression is invalid, a small number of uncertain neighboring joins or splits can be tested again instead of searching every page interpretation. The evaluator parses completed equations without `eval()`. Every edit increments a revision number so old worker results cannot overwrite newer ink. IndexedDB holds notebook pages, while a service worker caches the production app and model after a successful secure load.

## Design story

CalcInk was designed as a handwriting calculator that feels like writing on paper and works in a browser without sending the drawing to a server. A person writes an expression, the app decides which pen strokes form each symbol, reads those symbols, and calculates the result. The supported vocabulary is deliberately small: digits, four arithmetic operators, a decimal point, and `=`. Equations can be on separate rows or share a row when there is a clear gap.

Editable pen paths are the source of truth. A drawing can be erased, moved between notebook pages, exported, and recognized again. Each proposed symbol becomes a 50 by 50 pixel image for a convolutional neural network, or CNN. The CNN gives likely labels, a few clear geometric rules handle special cases, and a strict arithmetic parser calculates only completed expressions. Geometry decides *what belongs together*, recognition decides *what it is*, and the parser decides *what it means*.

```text
Pointer input -> stored strokes -> row and symbol groups -> 50 by 50 image crops
              -> CNN plus a few shape rules -> equation split -> arithmetic result
```

## How the grouping approach evolved

The first approach joined strokes that were close. That is helpful for the two lines of `+` or `=`, but it can connect a whole expression through a chain of locally close pairs. A very small threshold stops some wrong joins but splits symbols such as a two-part `3` or `8`. More rules based on the limited vocabulary helped, but a fixed pixel distance behaved differently at different writing sizes, and a short dot or bar could distort the estimated size of all the writing.

The current grouping code in `src/segmentation/Grouper.js` makes two decisions. It first proposes symbol groups from strokes, then assigns those groups to mostly horizontal rows, allowing modest tilt. Substantial, digit-like strokes provide the writing-size estimate and row anchors. Dots and short bars attach to a plausible nearby row instead of defining the row by themselves. One close pair is not enough to merge two rows.

For each proposed symbol, the algorithm considers a small set of possible joins: touching ink, closely continued endpoints, aligned bars, dots around a bar, and the disconnected parts of some `4`s. Before accepting a join, it checks the *combined* group's width, height, and position. This is the key safeguard against a chain of individually plausible joins becoming one implausible symbol. All distances stay in CSS pixels, the same coordinates used by pointer input. A high-density screen changes the canvas backing resolution, not the grouping thresholds. Accepted groups are stored as stroke lists; pairwise distance alone does not decide them.

After grouping, symbols are sorted from left to right. Large spacing and a terminal `=` help separate completed equations on the same row. An unfinished expression stays pending; a gap by itself does not force a result. The assumptions are still important: handwriting should be mostly horizontal, adjacent symbols should not deliberately overlap, and a visible gap helps when two equations share a row. The grouping tests include false joins and false splits at different sizes and pen widths, plus tilted rows, partial rows, decimals, `=`, `÷`, and alternate digit forms.

### Different ways people write the same symbol

The grouping design does not assume that every digit is drawn in one textbook style. A `1` may be one straight stroke or a vertical stroke with a separate foot. The one-stroke form goes directly to the CNN; the grouping tests make sure the separate foot can join the stem in the other form. A `4` may be drawn in one continuous shape or as an open left arm next to a separate tall right stem. A narrow arm-and-stem join supports that second form, while a combined-width check stops it from swallowing the next symbol.

A `3` drawn as two arcs and an `8` drawn as two stacked loops can also stay in one symbol group. Looking only at their vertical gap could wrongly put the halves on different rows. Their horizontal alignment, nearby endpoints, and the height of the *whole* proposed digit give better evidence. For marks that are genuinely separate, two aligned horizontal bars can form `=`, and a bar with a dot above and below can form `÷`. A lone small dot stays available as a decimal point. These are grouping and context rules; the CNN still has to read most finished digit shapes, so an unusual style is supported without a promise that every drawing will be labeled correctly.

## Why the CNN has only a few companion rules

A small pretrained CNN from the [Math_Symbols_Classify project](https://github.com/rafiibnsultan/Math_Symbols_Classify) is the main reader. Hard-coding every digit would mean creating another classifier made of fragile thresholds. A whole-equation model would replace the editable per-symbol flow and would need evidence from saved CalcInk handwriting before it earned that complexity. The current CNN runs locally with bundled TensorFlow.js and WebAssembly files. The worker tries the WASM backend first and can fall back to CPU.

The source model's training notebook documents 15 labels in this order: `0` to `9`, add, divide, equals, multiply, subtract. Its output layer has 16 positions, but the notebook defines no sixteenth class. CalcInk shows that output as unknown rather than silently calling it a symbol. There is no decimal-point class. A small isolated dot is therefore read as a decimal only after grouping has ruled out a dot belonging to `÷`. These choices prevent a model limitation from turning into a confident but unexplained calculation.

Real handwriting showed that a correct symbol box could still contain a wrong CNN label. Ordinary `8`s and `9`s were a particularly clear example. Their actual stroke paths were saved and replayed through the app. The old image preprocessing added source padding and squeezed the ink into a 40 by 40 area within the 50 by 50 input. On one saved sheet of four `8`s and four `9`s, that produced `68089419`. Removing the extra source padding and fitting the ink into 46 by 46 produced eight correct labels through the full browser pipeline. A later sheet of `6`s and `8`s also looked correct to the writer. This is evidence for the crop change, not a claim of perfect recognition.

A few explainable geometry checks cover shapes that are unusually clear: a horizontal minus, aligned equals bars, division dots around a bar, a two-stroke plus, and a top-bar/diagonal `7`. These rules complement the CNN rather than trying to replace it. The division check accepts slightly off-center dots because real touch use showed that perfectly centered dots were too hard to draw. The correction picker requires a tap on the painted minus or division bar, so taps near it can become division dots.

`src/recognition/PatchExtractor.js` makes the image crops, `src/recognition/ShapeRules.js` holds those limited overrides, and `src/recognition/recognition.worker.js` loads the model. The pen uses dark ink and the model receives the original RGB crop. An experimental color palette was removed because it did not help the experience.

## How calculation and responsiveness work

`src/evaluator/Evaluator.js` parses numbers and operators rather than calling JavaScript `eval()`. It accepts multi-digit and decimal numbers, unary minus, and `+ − × ÷` with normal precedence. It requires a final `=`. Incomplete input has no result yet; invalid symbol order or repeated decimal points produce `Error`; division by zero produces `Undefined`. A short status message explains the common cases. Numeric results display at most four decimal places.

The drawing canvas and answer overlay stay on the main thread so the pen responds immediately. Row grouping and model inference run in a worker. Small image crops are prepared in chunks. Every edit advances a revision number, and a worker answer from an older revision is ignored. This also matters when changing notebook pages: a delayed answer from the previous page cannot appear on the new one. If the model cannot load, the app shows an unavailable state instead of quietly leaving stale answers on screen.

`src/canvas/CanvasManager.js` stores strokes in CSS coordinates. The screen's pixel ratio is used only for sharp canvas rendering and the source image crop. Pointer capture keeps a moving stroke active even when the pointer leaves the canvas. The stroke eraser removes a whole touched stroke; the pixel eraser splits away only the touched portion. Undo and redo save stroke states. Zoom changes how the sheet is displayed, while the stored stroke coordinates and recognition geometry stay the same.

## Extra features for actual use

**Practice mode is the main extra feature.** It lets someone check their own work without seeing the answer immediately. One row contains one question ending in `=` and the person's handwritten answer to its right. The evaluator computes the expected value internally, but the normal answer overlay is hidden. Pressing **Check** shows only a green tick or red cross. A later edit clears that mark. Optional sounds give a short correct ping or a descending wrong tone; short haptic pulses use `navigator.vibrate()` only on browsers that support it. Sound is off until enabled.

A correction picker handles occasional model mistakes. A tap chooses the intended symbol, the expression recalculates, and that correction stays attached to the same stroke IDs through unrelated edits. Changing or erasing those strokes discards the correction. A touch-specific fix waits for the completed click before opening the picker, so the same finger tap cannot accidentally select an option inside the new dialog. Correction on minus and division bars is limited to the painted line, leaving nearby space for division dots. The Show Recognition switch and Save Sample dialog help distinguish a bad group from a bad label and preserve exact failures for later tests.

The notebook in `src/notebook/Notebook.js` keeps separate pages, automatic local saves in IndexedDB, and validated JSON Export and Import. Move mode, zoom, a scrollable sheet, and a horizontally scrolling toolbar make the fixed 1100 by 800 CSS-pixel page usable on smaller screens. The toolbar also scrolls on a laptop when its tools exceed the available width, using a scrollbar, trackpad, or mouse wheel. Stylus only mode filters finger touches on the canvas; it does not claim device-level palm rejection. The interface remembers Practice, sound, and haptic choices in the browser. Diagnostic boxes stay hidden by default so the page feels like a scratchpad; they are available when someone needs to inspect a recognition mistake. A first-use hint disappears after drawing begins, answers appear with a short fade unless reduced motion is requested, and the status line explains incomplete or invalid expressions instead of showing only a generic error.

The production build uses a service worker to cache the app shell, model, worker, and runtime assets after a successful HTTPS or localhost load. The GitHub Pages workflow tests and builds the source, then publishes the generated `dist/` folder. Drawing data stays in the browser unless the user exports it. Export is important because browsers can clear local storage.

## Evidence and remaining limits

The tests cover known grouping cases, strict arithmetic, erasing, coordinate conversion, notebook data, Practice grading, division dots, and shape rules. A saved real `8`/`9` drawing protects the crop and grouping work. Browser checks have covered drawing, recognition, erasing, rewriting, recalculation, touch correction, toolbar scrolling, and offline reload. These are useful regressions, not a measured accuracy rate for all writers or devices.

If more correctly grouped real symbols fail, the next step is to collect a larger labeled set from several writers and compare replacement or fine-tuned models on the *same* held-out strokes before switching. Physical iPhone, iPad, Android, and stylus checks remain valuable, especially for touch feel, vibration, and palm behavior.

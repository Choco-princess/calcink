# CalcInk architecture

## Technical overview

CalcInk is a client-side Vite application. Its main pieces are:

- **Two canvas layers:** The lower canvas draws stored vector strokes. The upper canvas draws recognition boxes, answers, and Practice marks. Both render on the main thread.
- **One coordinate system:** Strokes, hit tests, and grouping distances use CSS pixels on a 1100 by 800 page. `devicePixelRatio` changes rendering resolution, while zoom changes only the displayed scale.
- **One recognition worker:** It groups strokes, loads a bundled TensorFlow.js CNN, and predicts symbols. It prefers the local WebAssembly backend and falls back to CPU.
- **A strict evaluator:** It parses completed expressions without JavaScript `eval()`. IndexedDB stores notebook pages, and a service worker caches the production app and model.

```text
Pointer Events -> vector strokes in CSS pixels -> worker row and symbol grouping
               -> main-thread 50 by 50 RGB crops -> worker CNN inference
               -> limited geometric symbol overrides -> equation splitting
               -> strict arithmetic parser -> answer or Practice overlay
```

The worker proposes bounded joins, then assigns the resulting symbols to mostly horizontal rows. The main thread makes 50 by 50 RGB crops and sends them back for CNN inference. Clear shapes can override a model label. When a completed expression is invalid, CalcInk can retry a few uncertain neighboring joins or splits. Each edit gets a new revision number, so a delayed worker result cannot replace newer ink.

## Design story

CalcInk aims to feel like writing on paper without sending drawings to a server. Its limited vocabulary is digits, four arithmetic operators, a decimal point, and `=`. Equations may be on separate rows or share a row with a clear gap.

Editable pen paths are the source of truth, so drawings can be erased, exported, and recognized again. The pipeline separates three jobs: geometry decides *what belongs together*, recognition decides *what each group is*, and the parser decides *what the expression means*.

## How the grouping approach evolved

The first approach joined nearby strokes. It worked for `+` and `=`, but a chain of close pairs could connect a whole expression. A tiny threshold avoided some false joins while splitting a two-part `3` or `8`. Fixed distances also behaved differently at different writing sizes.

The current procedure in `src/segmentation/Grouper.js` is deliberately constrained:

1. **Estimate writing size** from substantial strokes. Tiny dots and flat bars do not shrink every distance limit.
2. **Propose symbols** using touching ink, nearby endpoints, aligned bars, dots around a bar, and the separate parts of some `4`s. Before accepting a join, check the *combined* group's width and height. This prevents a chain of reasonable pairs from becoming one unreasonable symbol.
3. **Assign rows** using body-sized groups as anchors. The fitted row direction allows modest tilt; short marks attach to a plausible row. One close pair does not merge two rows.
4. **Order and split** symbols from left to right. Large spacing and a terminal `=` help separate finished equations. An unfinished expression stays pending.

All geometry stays in CSS pixels, including on high-density screens. The tests cover false joins and false splits at several sizes and pen widths, tilted and partial rows, decimals, `=`, `÷`, and alternate digit forms. The assumptions remain mostly horizontal writing, no deliberate overlap between neighboring symbols, and a visible gap between equations on one row.

### Different ways people write the same symbol

The grouping tests include several ways to write the same symbol:

- **`1`:** A straight stroke is one symbol; a separate bottom foot can join a vertical stem.
- **`4`:** A continuous shape stays intact; an open left arm can join a separate right stem without swallowing the next symbol.
- **`3` and `8`:** Two arcs or stacked loops can remain one digit instead of being mistaken for two rows.
- **Marks:** Two aligned bars can form `=`, while a bar with upper and lower dots can form `÷`. A lone small dot can remain a decimal point.

These rules help group different writing styles. The CNN still labels most finished digits, so they do not guarantee that every unusual drawing is read correctly.

## Why the CNN has only a few companion rules

The main reader is a small pretrained CNN from [Math_Symbols_Classify](https://github.com/rafiibnsultan/Math_Symbols_Classify). Hard-coding every digit would create another classifier full of thresholds. A whole-equation model would replace the editable per-symbol flow without evidence from CalcInk handwriting that it would help.

- **Model limits:** The source notebook names 15 labels, from digits `0` to `9` through add, divide, equals, multiply, and subtract. The network has 16 outputs, but the sixteenth has no documented class, so CalcInk displays it as unknown. The model has no decimal class; a small isolated dot is interpreted through grouping context.
- **Clear shape overrides:** Geometry can identify a horizontal minus, aligned equals bars, a bar with division dots, a two-stroke plus, or a `7` with a wide top and a lower tip to its left. Slightly off-center division dots are accepted. The `7` rule acts before the CNN, so its label has no model confidence score. An unfinished `5` or similar digit can briefly match it while being drawn; the final symbol can be corrected manually if needed.
- **Image preparation:** `PatchExtractor.js` makes 50 by 50 RGB crops. A saved four-`8`, four-`9` sheet was once read as `68089419` because the ink was padded and squeezed into 40 by 40. Fitting it into 46 by 46 without extra source padding read all eight correctly through the browser pipeline. A later `6`/`8` sheet also looked correct to the writer. These examples support the crop change, not a universal accuracy claim.
- **Runtime:** `recognition.worker.js` loads bundled TensorFlow.js and WebAssembly files, with CPU fallback. `ShapeRules.js` holds the limited geometry rules. The pen uses dark ink and the model receives its original RGB crop. An experimental color palette was removed after it proved unhelpful.

## How calculation and responsiveness work

The calculation and drawing paths have separate responsibilities:

- **Arithmetic:** `Evaluator.js` parses multi-digit and decimal numbers, unary minus, and `+ − × ÷` with normal precedence. It requires a final `=` and does not call `eval()`. Incomplete input waits; invalid order or repeated decimals produce `Error`; division by zero produces `Undefined`. Results show at most four decimal places.
- **Responsive ink:** Drawing and the answer overlay stay on the main thread. Grouping and inference run in a worker, while small image crops are prepared in chunks. Each edit advances a revision number; delayed results from an older edit or page are discarded. A model load failure shows an unavailable state.
- **Editing geometry:** `CanvasManager.js` keeps strokes in CSS pixels. Pointer capture preserves a stroke when the pointer leaves the canvas. The stroke eraser removes whole paths; the pixel eraser splits only the touched portions. Undo and redo restore stroke states. Zoom changes display size without changing stored geometry.

## Extra features for actual use

- **Practice mode:** One row holds a question ending in `=` and a handwritten answer. The expected value is calculated but hidden. **Check** shows a tick or cross, and editing clears the mark.
- **Symbol correction:** Tapping a symbol opens a picker, and the choice stays attached to its stroke IDs through unrelated edits. A changed or erased symbol loses that correction. The picker waits for the completed touch click so the same tap cannot accidentally choose an option. Only the painted part of a minus or division bar opens correction, leaving space to draw division dots.
- **Useful diagnostics:** Recognition boxes are hidden by default but can be shown. Save Sample exports exact strokes and predictions, which helps separate bad grouping from bad labeling. A first-use hint disappears after drawing starts. Answers fade briefly unless reduced motion is requested, and the status line explains common errors.
- **Notebook and navigation:** `Notebook.js` stores independent pages in IndexedDB and validates JSON Export and Import. Page titles are normalized to their current order when notebooks load or a page is deleted; stable page IDs keep the drawings and corrections attached to the right page. Move mode, zoom, a scrollable sheet, and a toolbar that scrolls on both small screens and crowded laptop layouts make the fixed page easier to use. Stylus only filters finger touches, without claiming hardware palm rejection. Practice mode is remembered in the browser.
- **Offline build:** A service worker caches the app, model, worker, and runtime assets after a successful HTTPS or localhost load. GitHub Actions tests, builds, and publishes `dist/`. Drawing data stays in the browser unless exported, so notebook Export is the portable backup if local storage is cleared.

## Evidence and remaining limits

- Tests cover known grouping cases, arithmetic, erasing, coordinates, notebook data, Practice grading, division dots, and shape rules. A saved real `8`/`9` drawing protects the grouping work; browser replays tested the crop change and the draw, erase, rewrite, and recalculate flow.
- Browser checks also covered touch correction, toolbar scrolling, and offline reload. These are useful regressions, not a measured accuracy rate for all writers or devices.
- More labeled drawings from several writers are needed before comparing a replacement or fine-tuned model on held-out strokes. A future recognizer should also flag marks outside the supported symbol set as unknown instead of forcing a known label. Physical iPhone, iPad, Android, and stylus checks remain valuable for touch feel, offline behavior, and palm behavior.

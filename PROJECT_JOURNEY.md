# CalcInk: how we got here

This is the story of CalcInk so far, written for someone joining the project without having to read every discussion or line of code. The [README](README.md) explains how to run the app. The [architecture](ARCHITECTURE.md) describes how the current version works. This document explains **why** we made its choices, including the ideas we set aside and the tests that changed our minds.

## The starting point

CalcInk began as your friend's browser-based handwritten calculator for an Inter IIT software challenge. A person writes arithmetic on a canvas; the app must decide which pen strokes form each symbol, identify the symbols, and calculate the answer. It has a small vocabulary: digits, four arithmetic operators, a decimal point, and `=`. The work must happen in the browser, including when offline after the app has loaded.

Your friend chose a sensible overall shape for the project: keep the pen strokes so they can be edited, turn each proposed symbol into a small image, classify that image with a convolutional neural network (CNN), and evaluate the recognized expression with a math parser. That basic shape remains. It lets us improve grouping and recognition separately, and it keeps the app small enough for an ordinary browser.

The original documentation described three approaches to **segregation**, the project's word for deciding which strokes belong to the same symbol and which symbols belong to the same equation:

1. **Join nearby strokes.** This is intuitive and works for pieces of `+` or `=`. It fails when each neighboring pair is close enough that a chain joins a whole equation into one box. It also says little about separate rows.
2. **Use more rules for the 16 symbols.** This used the useful observation that separate side-by-side pieces rarely belong to one symbol in this vocabulary. It could still join writing from two rows, and fixed pixel distances behaved differently at different writing sizes.
3. **Two stages: rows first, symbols second.** This was a better direction, but some of its stated rules were too absolute. For example, two stacked pieces might be the two halves of an `8`, not two rows. A single global estimate of writing size can also be distorted by tiny dots and short bars.

Those iterations were useful experiments, but the old documentation sometimes called an approach “final” or treated a rule as a guarantee when it was still a heuristic. We kept the useful insights and made the limits explicit.

## Your review changed the plan

You approached the inherited project with practical questions rather than asking us to preserve every earlier decision. You asked whether it worked on laptops, phones, tablets, and iPads; what happens with bad arithmetic; whether a whole-equation model might be better; whether ONNX and TensorFlow.js were being mixed up; and whether the app needed alternate ways of writing `1`, `4`, and other digits.

You were especially doubtful about segregation. You questioned why joining nearby strokes could not work if the boundary were chosen carefully. The answer was that a small distance threshold helps, but distance by itself does not know where one symbol ends. Several individually reasonable joins can still create one unreasonable combined group. We therefore kept the convenient union-find data structure for recording **accepted** joins, while checking the shape and size of the resulting group before accepting each one.

Two other observations were particularly valuable:

- All grouping measurements should stay in normal on-screen (CSS) pixels. High-density screens use more internal canvas pixels; mixing the two units silently changes every distance rule.
- A rule that splits vertically stacked writing must inspect the **whole proposed symbol**. Otherwise a two-part `3` or `8` can look like two rows.

You preferred strong, understandable constraints over a large collection of fragile special cases. We agreed. The plan became a **segmentation-first reliability pass**: build examples with expected groups, fix row and symbol joins against those examples, then measure actual recognition rather than assume the CNN's published dataset score described CalcInk's real use.

## What we built from that plan

The grouping code now estimates writing size mainly from substantial strokes, keeps dots and bars from shrinking that estimate, allows modest row tilt, and checks the width and height of a proposed **combined** symbol before joining it. It considers contact, close continuations, and a few recognizable stacked arrangements such as the bars of `=` and dots around `÷`. After recognition, a terminal `=` helps separate equations sharing a row. An unfinished expression stays pending.

We added saved grouping examples at several drawing sizes and pen widths. The suite includes close symbols, multiple rows, partial rows, tilt, two-part digits, alternate forms, decimals, `=`, and `÷`. It checks both mistakes that join too much and mistakes that split one symbol apart. The later real `8`/`9` drawing became an additional grouping case. These tests protect known cases; they do not prove all handwriting is unambiguous.

We also addressed the surrounding app:

- Drawing coordinates remain in CSS pixels, while only canvas rendering and image cropping use the screen's pixel ratio.
- The user can erase a whole stroke or just the touched portion, then undo, rewrite, and recalculate.
- Recognition and grouping run in a worker so drawing remains on the main thread. Results from an older edit are discarded when a newer edit exists.
- The model runtime and its WebAssembly files are bundled locally. The production build includes offline caching.
- The arithmetic evaluator requires a completed expression ending in `=`. It handles multi-digit and decimal numbers, negative values, normal order of operations, malformed input, and division by zero without using JavaScript `eval()`.
- The README now gives realistic device and setup instructions. We prepared a GitHub Pages workflow, but left hosting local because the configured remote repository was unavailable and you chose “local only for now.”

When `npm` was missing from your PowerShell session, we used the local development environment to keep the app running at [http://127.0.0.1:4173/](http://127.0.0.1:4173/). A public website has not yet been published.

## The real handwriting tests changed the diagnosis

Your screenshots became more informative than synthetic drawings. They showed that the visible symbol boxes were often sensible while the labels inside them were wrong. That shifted attention from broad segregation changes to recognition. For example, forms of `1` and `7`, `7` and `+`, `5` and `4`, and particularly `8` and `9` were confused. Some displayed arithmetic errors came from the wrong recognized symbols, so changing the math parser would not have fixed those examples.

We tried a **small** set of clear shape rules for symbols whose geometry is unusually distinctive: horizontal bars (`−` and `=`), a centered bar with dots (`÷`), a two-stroke `+`, and a top-bar/diagonal `7`. A following screenshot showed examples such as `7 − 5 = 2`, `1 − 4 = −3`, and `7 − 1 = 6` working. Those rules were limited deliberately. Writing a rule for every digit would mean building a second, hand-tuned classifier, with many thresholds and little evidence that it would generalize.

The remaining failures, particularly ordinary `8`s, made you rightly skeptical of further patches. We inspected the existing model's training notebook. Its listed labels cover 15 classes even though the network has 16 outputs; the last output has no documented meaning, so the app now displays it as unknown. The model has no decimal-point class, so a small dot needs contextual handling. We also found that the notebook's reported test accuracy measured its own prepared images, not the complete draw-to-answer experience in CalcInk.

We looked for a replacement model. A browser math recognizer covers many relevant symbols, and an ONNX/CoMER project can read whole expressions locally. Both are plausible future comparisons. Neither provides evidence that it will improve **your** 6/8 drawings specifically, and the whole-expression approach would change more of the app. We chose to compare on saved strokes before replacing the current model or training another one. Training on the same mismatched data alone would not necessarily teach the model your writing style.

## The sample that found the real 6/8 issue

To compare recognition fairly, we needed the pen paths, not only a screenshot. The first **Save Sample** control used a browser prompt; the in-app browser did not support that prompt. A second version tried to start a download programmatically, which also failed there. We changed it to a simple dialog that shows the JSON and offers both **Download JSON** and **Copy JSON**. You pasted the saved data into the chat, so we could replay exactly what you drew.

That saved drawing contains four intended `8`s followed by four intended `9`s. The app originally read `68089419`. Grouping was already correct: eight separate strokes became eight separate symbols. The model was seeing each symbol too small. The image crop added six pixels of space around the source and then fitted it inside only a 40×40 area of the 50×50 model input. We tried tighter crops with the **same model**. Fitting the ink inside 46×46 with no extra source padding read all eight symbols correctly. A full replay through the browser showed `8 8 8 8 9 9 9 9`, still in eight groups. We adopted that crop in the app.

You then drew a fresh set of `6`s and `8`s in your normal style and reported that all looked correct. That is encouraging evidence for the fix. It is still a small number of drawings, so we are not calling recognition “solved” or claiming a percentage accuracy. The saved paths remain in [samples/user-8-9-2026-10-05.json](samples/user-8-9-2026-10-05.json) for future comparison.

## Where the project stands

The current design remains a browser scratchpad with constrained grouping, a CNN for most symbols, a few clear shape rules, and a strict arithmetic evaluator. This is simpler than replacing the whole pipeline with an equation model, and it matched the failure we actually measured. The grouping, arithmetic, erasing, and coordinate tests pass; the production build succeeds. We have also checked a complete draw, recognize, erase, rewrite, and recalculate flow in a browser, plus an offline reload.

The next improvement should come from **more labeled real drawings**, especially several writers, pen widths, screen sizes, and alternate forms of `6`, `8`, `9`, `1`, and `4`. Keep both successes and failures. For each failure, first ask: was the row wrong, was the symbol box wrong, was the label wrong, or was the arithmetic expression interpreted wrongly? Those are different problems with different fixes. If many correctly grouped symbols still fail after consistent cropping, compare other pretrained models on the **same** saved drawings. Consider fine-tuning only after there are enough varied examples and a separate set to check whether it really helps.

After the local work, we uploaded the tested source to GitHub. The first automatic deployment passed its tests and build, then stopped because GitHub Pages had not been enabled. Once the repository was made public and Pages was configured to use GitHub Actions, a fresh run succeeded and the site became available at [choco-princess.github.io/calcink/](https://choco-princess.github.io/calcink/). The generated `dist/` folder stays out of Git; the workflow builds it for each deployment.

This journey has one recurring lesson: a plausible rule or a high published accuracy number is a starting hypothesis. The drawings in the actual app are the test.

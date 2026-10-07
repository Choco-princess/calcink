# CalcInk

CalcInk is a browser scratchpad for handwritten arithmetic. Draw an expression ending in `=` and the answer appears beside it. Drawing, handwriting recognition, and calculation run on your device; the app does not send your ink to a server.

Try the public website at **[choco-princess.github.io/calcink/](https://choco-princess.github.io/calcink/)**. This repository contains its source code, local development server, production build, tests, and pretrained recognition model.

## Which devices can use it?

| Device | How to use CalcInk | What to install |
| --- | --- | --- |
| Windows, macOS, or Linux laptop/desktop | Run the project locally in a current browser, or later open a hosted HTTPS site | [Node.js LTS](https://nodejs.org/en/download) and its included npm are needed **only** to run or build this repository |
| Chromebook / ChromeOS | Open a hosted HTTPS site or a LAN link from another computer | Nothing on the Chromebook; local development would need a Node-capable Linux environment |
| Android phone or tablet | Open a hosted HTTPS site, or a development link from a computer on the same Wi-Fi | No Node.js or app-store download on the phone/tablet |
| iPhone or iPad | Open a hosted HTTPS site in a current browser, or a development link from a computer on the same Wi-Fi | No Node.js or app-store download on the iPhone/iPad |

The interface has a touch-friendly drawing surface and a horizontally scrolling toolbar on narrow screens. It uses browser Pointer Events, Web Workers, and WebAssembly. Desktop browser flows have been exercised; **physical Android, iPhone, and iPad testing is still needed** before claiming consistent handwriting accuracy or performance on those devices. A mouse, finger, or stylus can be used.

CalcInk is a website, not a native Windows, Android, or iOS application. The source is not meant to be opened by double-clicking `index.html`: browser workers and offline caching need a web server.

## Run it on a computer

1. Install the **LTS** version of [Node.js](https://nodejs.org/en/download) for your operating system. npm should be included. Close and reopen your terminal after installing it.
2. Open a terminal in the folder containing `package.json`. In the current Windows checkout, that folder is `C:\Users\Derek\Downloads\calcink\calcink` (there are two `calcink` folders).
3. Check that both commands work, install the packages, and start the app:

**Windows PowerShell**

```powershell
cd C:\Users\Derek\Downloads\calcink\calcink
node --version
npm.cmd --version
npm.cmd install
npm.cmd run dev
```

**macOS Terminal or Linux shell**

```bash
cd /path/to/the/calcink-folder-containing-package.json
node --version
npm --version
npm install
npm run dev
```

Open the **Local** URL printed by Vite in a browser on that computer. Vite commonly uses `http://localhost:5173/`, but it may choose another port; use the printed URL. The previously opened local demo on this computer was `http://127.0.0.1:4173/` and is available only while its server is running. Press `Ctrl+C` in the terminal to stop a server you started there.

The project uses Vite 5, whose [documented minimum is Node 18](https://v5.vite.dev/guide/). Installing a current Node LTS release is the simpler choice for a new setup. No Python, GPU, or external recognition service is required to run the browser app.

### If `npm` is not recognized on Windows

That error means PowerShell cannot find npm. Install Node.js LTS, reopen PowerShell, then run `node --version` and `npm.cmd --version` again. If `node` still cannot be found, check that the Node installation directory is on your system `PATH` or rerun the official installer. Make sure you are in the folder with `package.json` before `npm.cmd install`.

If PowerShell instead says `npm.ps1` cannot be loaded because scripts are disabled, use `npm.cmd` as shown above. You do not need to change the machine's execution policy for CalcInk.

## Try it on a phone or tablet before hosting

The computer serves the app; the phone or tablet only opens it in a browser.

1. Connect both devices to the same local network. On the computer, start Vite so it accepts connections from that network:

   - Windows PowerShell: `npm.cmd run dev -- --host 0.0.0.0`
   - macOS/Linux: `npm run dev -- --host 0.0.0.0`

2. Find the computer's private network address. On Windows run `ipconfig`; on macOS check **System Settings → Network**; on Linux check network settings or run `hostname -I`. It usually starts with `192.168.` or `10.`.
3. On the phone or tablet, open `http://COMPUTER-IP:PORT/`, replacing both parts with that address and the port printed by Vite. For example, if the computer is `192.168.1.23` and Vite prints port `5173`, open `http://192.168.1.23:5173/`.

Do not type `127.0.0.1` or `localhost` on the phone; there, those names refer to the **phone itself**. If the page does not open, check the computer firewall's permission for a private network, the address and port, and whether the Wi-Fi separates devices on a guest network. Vite documents `--host 0.0.0.0` for [LAN access](https://vite.dev/config/server-options).

This LAN link is for **live testing while the computer stays on**. It is not a published website, and a phone loading it over plain HTTP should not be expected to cache the app for offline use. Offline service workers require [HTTPS or the device's own localhost](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

## How to use the calculator

- Choose **Pen** and a 2, 4, or 7 pixel line width. Write mostly horizontal expressions. Different equations may share a row; leave a visible gap and end each completed one with `=`.
- **Stroke Eraser** removes an entire touched stroke. **Pixel Eraser** removes only the touched part. Undo, redo, clear, and a bounding-box toggle are also in the toolbar. On a narrow screen, swipe the toolbar sideways to reach more controls.
- Keyboard shortcuts on a computer: `Ctrl/Cmd+Z` to undo, `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` to redo.
- Supported writing: digits `0–9`, `+`, `−`, `×`, `÷`, a decimal point, and terminal `=`. Multi-digit and decimal numbers and a leading minus are supported. Parentheses, variables, powers, and symbols drawn across neighboring symbols are outside this version's scope.
- A partial expression has no answer yet. A malformed completed expression shows `Error`; division by zero shows `Undefined`. Multiplication and division take priority over addition and subtraction. Answers are displayed to at most four decimal places.
- If a label is wrong, check its dashed box first. A wrong box means grouping failed; a correct box with the wrong label means recognition failed. Click **Save Sample** to show the stroke data and predictions. Download the JSON or copy it from the dialog, then say what you intended to write. This is a **diagnostic export**, not a way to reopen a drawing in the app.

The canvas is not saved automatically between page reloads. Export a sample before refreshing if you need to preserve evidence of a mistake.

## Build and check offline use

On the computer, run:

**Windows PowerShell**

```powershell
npm.cmd run build
npm.cmd run preview
```

**macOS/Linux**

```bash
npm run build
npm run preview
```

Open the URL printed by the preview server on **that computer**. Wait for **Ready • Offline saved**, then disconnect the network and reload. The production service worker caches the page, model, worker, and runtime files. The development server from `npm run dev` is not the offline build. The first visit needs a connection to the server, and the server must still be available when testing a brand-new browser or device.

A public HTTPS deployment can offer the same offline reload on each device **after that device has loaded and cached the page**. A plain `http://COMPUTER-IP` LAN link is not equivalent, because service workers need a secure context. Browser storage may also be cleared by the user or the operating system, so keep the source site available for a later reload.

## Tests and current evidence

From the folder containing `package.json`, run `npm.cmd test` on Windows PowerShell or `npm test` on macOS/Linux. Run the matching `build` command above before publishing changes.

The automated tests cover known grouping cases at different writing sizes and pen widths, strict arithmetic errors, pixel erasing, coordinate conversion, and selected shape rules. A saved real handwriting case checks that eight `8`/`9` strokes stay in eight groups. In a full browser replay, those symbols were all recognized after tightening the image crop. A subsequent user-drawn `6`/`8` sheet was reported correct. These examples are useful regressions, **not** a general accuracy percentage. Physical touch/stylus behavior and performance across devices still need broader testing.

## Model, privacy, and project notes

The recognition model is adapted from the MIT-licensed [Math_Symbols_Classify repository](https://github.com/rafiibnsultan/Math_Symbols_Classify). Its source reports 99.85% accuracy on a prepared dataset; that is **not** CalcInk's measured end-to-end accuracy. The model lists 15 training labels for the digits and arithmetic marks although its output layer has 16 positions; an undocumented output is treated as unknown. Decimal points and a few clear shapes use small contextual rules. The model runs locally in a Web Worker with bundled TensorFlow.js and WebAssembly, falling back to the CPU backend if needed.

No account, cloud API, or model download at inference time is required by the built app. Drawing data remains in the browser unless you export and share a sample. See [ARCHITECTURE.md](ARCHITECTURE.md) for the current design and limits, and [PROJECT_JOURNEY.md](PROJECT_JOURNEY.md) for the fuller story of earlier approaches, failed experiments, handwriting tests, and decisions.

## Publish with GitHub Pages

`npm run build` produces a static site in `dist/`. A host must serve **all** of `dist/`, including `sw.js`, `model/`, and `assets/`, over HTTPS. The generated directory is not committed: GitHub Actions builds and publishes it from the source files.

The repository is public and GitHub Pages is enabled with **GitHub Actions** as its source. The workflow at `.github/workflows/pages.yml` tests, builds, and publishes the site after each push to `main`; it can also be run from the repository's **Actions** tab. It sets `CALCINK_BASE=/calcink/` for the current address; change that setting if the repository name changes. On the live site, check **Ready • Offline saved**, write `1 + 1 =`, and test an offline reload after the first successful visit. A successful workflow run is required before new changes appear online.

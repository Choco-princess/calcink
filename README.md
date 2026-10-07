# CalcInk

**Try CalcInk:** [choco-princess.github.io/calcink](https://choco-princess.github.io/calcink/)

CalcInk is a handwriting calculator that runs in a browser. Write an arithmetic expression and finish it with `=` to see the result. Drawing, recognition, and calculation happen on your device. The public site works on laptops, phones, and tablets without installing anything.

## Features and capabilities

- **Practice mode:** Write one question per row, add your own answer after `=`, and press **Check**. The expected answer stays hidden. CalcInk shows a green tick or red cross.
- **Handwritten arithmetic:** Reads digits `0` to `9`, `+`, `−`, `×`, `÷`, decimal points, and `=`. It supports multi-digit numbers, negative numbers, several rows, and multiple completed equations on one row. Leave a visible gap between neighboring equations. Multiplication and division take priority over addition and subtraction.
- **Correct a symbol:** In Pen mode, tap handwritten ink to choose what you meant. The answer updates immediately. **Show Recognition** displays detected symbol boxes and model confidence when available. A clear top-bar `7` may be identified by a geometry rule, so it has no model confidence score. **Save Sample** exports strokes and predictions for a bug report.
- **Edit and organize:** Choose a 2px or 4px pen, use the stroke or pixel eraser, undo and redo, create notebook pages, move, and zoom. Page labels close gaps after deletion. Pages save automatically in this browser. Export and Import move a notebook as JSON between devices.
- **Use different screens:** The toolbar scrolls sideways on laptops, phones, and tablets. A mouse, finger, or stylus can draw. **Stylus only** ignores finger input on the drawing sheet while accepting pen or mouse input. It is a simple finger filter, not guaranteed hardware palm rejection.
- **Reload offline:** After its first successful load, the public HTTPS site can cache the app and model for offline reloads. Recognition needs no account or cloud service.

Write mostly horizontal equations with moderate tilt. Each expression needs a final `=`. An unfinished one stays pending, malformed input shows `Error`, and division by zero shows `Undefined`. Results display up to four decimal places. Parentheses, powers, variables, and deliberately overlapping neighboring symbols are outside this version's scope. Handwriting accuracy varies by writer.

While a digit is being drawn, an unfinished `5` or similar shape may briefly match the `7` rule. Finish the digit before judging its label, or tap the ink to correct it if the final label is wrong.

For `÷`, draw a horizontal bar and place a small dot above and below it. The dots may be slightly off center. A tap near the bar adds ink; a tap on the painted bar opens symbol correction.

## Run the source locally

The public link is the easiest choice on every device. Local development needs a computer to run the web server. Do not open `index.html` directly from a file browser because the worker and offline features need a server.

### Get the source

On the [CalcInk repository](https://github.com/Choco-princess/calcink), select **Code > Download ZIP** and extract it. Open the extracted folder that contains `package.json`. Git is not required. [Vite 5 needs Node.js 18 or newer](https://v5.vite.dev/guide/); the current Node.js LTS release meets that requirement.

### Windows, PowerShell

Install the **LTS Windows installer** from [Node.js](https://nodejs.org/en/download). It includes npm. Close and reopen PowerShell afterward. In File Explorer, open the extracted folder containing `package.json`, click the address bar, type `powershell`, and press Enter. Then run:

```powershell
node --version
npm.cmd --version
npm.cmd install
npm.cmd run dev
```

Open the **Local** address printed by Vite, usually `http://localhost:5173/`. Keep PowerShell open while using the site; press `Ctrl+C` to stop it. `npm.cmd` avoids PowerShell script-policy errors. If `node` or `npm.cmd` is not recognized, finish the Node installer and reopen PowerShell so its `PATH` is refreshed.

### macOS 13.5 or newer, Terminal

Install the **LTS macOS installer** from [Node.js](https://nodejs.org/en/download). It includes npm. Open a new Terminal window, type `cd ` with a space, drag the extracted folder containing `package.json` into Terminal, and press Return. Then run:

```bash
node --version
npm --version
npm install
npm run dev
```

Open the **Local** address printed by Vite. Press `Control+C` to stop it.

### Ubuntu 24.04 or newer, or Debian 12 or newer

These releases provide a compatible Node.js through their package repositories. Open Terminal and install Node.js and npm:

```bash
sudo apt update
sudo apt install -y nodejs npm
```

In the file manager, open the extracted folder containing `package.json` and choose **Open in Terminal**. If that option is unavailable, type `cd ` in a terminal, drag that folder into the terminal, and press Enter. Then run:

```bash
node --version
npm --version
npm install
npm run dev
```

Open the **Local** address printed by Vite. If your distribution supplies Node.js older than 18, install a current LTS release using the [official Node.js download page](https://nodejs.org/en/download) before `npm install`. On another Linux distribution, install Node.js 18 or newer and npm with its package instructions, then run the project commands above.

### Chromebook, Android, iPhone, and iPad

Open the [public site](https://choco-princess.github.io/calcink/) in a current browser. No npm command or app-store installation is needed. For local development on ChromeOS, enable its optional Linux environment, make the extracted source folder available to Linux, and follow the Debian instructions above.

To try a locally running version on a phone or tablet, put it and your computer on the same Wi-Fi. From the project folder, start Vite with network access:

```powershell
# Windows PowerShell
npm.cmd run dev -- --host 0.0.0.0
```

```bash
# macOS or Linux
npm run dev -- --host 0.0.0.0
```

Find the computer's private address with `ipconfig` on Windows, in **System Settings > Network** on macOS, or with `hostname -I` on Linux. On the phone, visit `http://COMPUTER-IP:PORT/` using that address and the port Vite printed, for example `http://192.168.1.23:5173/`. Do not use `localhost` on the phone; it points to the phone itself. If the page does not open, check the Wi-Fi network and the computer's private-network firewall permission. This link works only while the computer runs the server. Use the public HTTPS site for normal offline use.

## Test, build, and publish

Run these from the folder containing `package.json`:

| Task | Windows PowerShell | macOS or Linux |
| --- | --- | --- |
| Run tests | `npm.cmd test` | `npm test` |
| Build the site | `npm.cmd run build` | `npm run build` |
| Preview the build | `npm.cmd run preview` | `npm run preview` |

The build goes into `dist/`. Open the preview URL printed by Vite. On a local `localhost` preview or the public HTTPS site, wait for **Ready** and **Offline saved** before trying an offline reload. Each new device needs one successful online load first.

GitHub Actions runs tests, builds, and publishes `dist/` to GitHub Pages on every push to `main`. The workflow is in `.github/workflows/pages.yml` and uses `/calcink/` as the base path. The generated `dist/` files are not committed.

Tests cover grouping at different sizes and pen widths, arithmetic errors, erasing, coordinates, notebook data, manual corrections, division dots, shape rules, and Practice grading. A saved real `8`/`9` drawing is a regression case. Browser checks have covered drawing, recognition, erasing, rewriting, recalculation, a phone-sized touch interaction, and offline reload. Physical testing across more phones, tablets, styluses, and writers remains useful.

The CNN was adapted from the MIT-licensed [Math_Symbols_Classify project](https://github.com/rafiibnsultan/Math_Symbols_Classify). Its published dataset accuracy is not CalcInk's end-to-end accuracy. CalcInk treats its undocumented output as unknown and handles decimal dots with context. See [ARCHITECTURE.md](ARCHITECTURE.md) for the decisions and current design.

## Future improvements

- Collect more labeled handwriting from different people and devices, including failures, before changing model or grouping thresholds.
- Compare replacement or fine-tuned models on those same saved drawings. Keep the current model unless a replacement performs better in the complete app.
- Detect handwriting outside the supported symbol set and mark it as unknown instead of forcing it into one of the known math symbols.
- Test stylus input, palm behavior, and offline use on physical Android, iPhone, and iPad devices.
- Make wrong Practice answers easier to inspect while keeping the expected answer hidden.

Thanks to the IITG Tech Board and the Inter IIT team for the project and the opportunity to build CalcInk.

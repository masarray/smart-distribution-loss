# Smart Distribution Loss

Browser-only proof of concept for an open-source distribution-loss intelligence platform.

## Architecture

All engineering computation runs on the **user's own device**:

```text
GitHub Pages
    ↓
Browser UI
    ↓
Web Worker
    ↓
Pyodide / CPython WebAssembly
    ↓
NumPy + pandas + SciPy + NetworkX
    ↓
Pandapower runpp_3ph()
```

There is **no Python backend** and no server-side power-flow computation.

### Does the end user need Python installed?

**No.** End users opening the GitHub Pages application do not need Python, Pandapower, Node.js, or any installer. Pyodide provides CPython inside the browser as WebAssembly.

Python is currently used only as a convenient local static HTTP server during development (`python -m http.server`). This is not an end-user requirement.

## Runtime pins

- Pyodide `0.28.3`
- Pandapower `3.1.2`
- DeepDiff `8.5.0`
- Numba disabled

The dependency set is intentionally pinned for Pyodide/WASM compatibility.

## P0-A — PASS

P0-A proved real unbalanced three-phase Pandapower execution in a Windows browser Web Worker.

Observed real-browser baseline:

- engine initialization: `9.73 s`
- first `runpp_3ph()`: `176.5 ms`
- repeated solve average: `39.77 ms`
- technical loss: `6.484981 kW`
- max voltage delta vs official tutorial reference: `3.75e-7 pu`
- repeated-run delta: `4.35e-8 pu`

See `docs/P0A-GATE.md`.

## P0-B — current phase

P0-B scales the same browser-only physics path to the canonical demo network:

```text
20 kV source
  ↓
MV feeder
  ↓
400 kVA 20/0.4 kV transformer
  ↓
3 JTR branches
  ↓
90 individual single-phase customers
```

The browser benchmarks 1 / 10 / 30 / 60 / 90 customers and runs 25 repeated three-phase solves on the final 90-customer case to test whether a future smart-calibration loop is practical.

See `docs/P0B-GATE.md`.

## Run locally

Recommended on Windows:

```cmd
run-local.cmd
```

Alternative:

```powershell
python -m http.server 8000 --directory web
```

Then open:

```text
http://localhost:8000
```

The first browser run needs internet access to download Pyodide and Python packages.

## GitHub Pages

The included workflow deploys `web/` on pushes to `main`.

Repository **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Once deployed, end users only need the Pages URL and a modern browser.

## Development order

```text
P0-A browser physics                 PASS
  ↓
P0-B 90-customer browser scale      CURRENT
  ↓
P1 Ground Truth simulator
  ↓
P2 data degradation
  ↓
P3 smart calibration
  ↓
confidence / explainability
  ↓
engineering cockpit
```

Do not add smart calibration before P0-B passes in a real browser.

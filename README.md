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

## P0-B — PASS

P0-B proved the same browser-only physics architecture at the canonical 90-customer scale:

```text
20 kV source
  ↓
250 m MV feeder
  ↓
400 kVA 20/0.4 kV Dyn transformer
  ↓
3 JTR branches
  ↓
90 individual single-phase customers
```

Observed final-case browser baseline:

- `123` buses
- `121` lines
- `90` asymmetric customer loads
- network build: `766.5 ms`
- first solve: `116.4 ms`
- warm solve average: `37.35 ms`
- 25 warm solves: `933.7 ms`
- technical loss: `4.515 kW` (`2.828%` of source P)
- minimum LV voltage: `0.934944 pu`
- transformer loading: `58.07%`
- WASM heap: approximately `215 MB`

See `docs/P0B-GATE.md`.

## P1 — current phase

P1 turns the validated 90-customer snapshot into an **immutable 24-hour Ground Truth simulator**.

It creates:

- `96` × 15-minute unbalanced three-phase power-flow states
- deterministic residential and small-commercial profiles
- true customer phase / PF / service length
- SHA-256 Ground Truth integrity hash
- feeder/source P and Q measurements
- LV bus A/B/C voltage measurements
- transformer LV A/B/C current measurements
- `90 × 96 = 8,640` customer AMI interval-energy values
- per-interval technical-loss decomposition
- daily kWh energy/loss accounting

P1 measurements are intentionally perfect/noiseless. Missing data, unknown phase, mapping errors, parameter uncertainty and meter noise begin in P2.

See `docs/P1-GROUND-TRUTH.md`.

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
P0-B 90-customer browser scale      PASS
  ↓
P1 Ground Truth simulator           CURRENT
  ↓
P2 data degradation
  ↓
P3 smart calibration
  ↓
confidence / explainability
  ↓
engineering cockpit
```

Do not begin P2 until P1 passes its real-browser integrity and energy-accounting gate.

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

P0-B proved the same browser-only physics architecture at the canonical 90-customer scale.

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

## P1 — PASS

P1 turns the validated 90-customer snapshot into an **immutable 24-hour Ground Truth simulator** with 96 × 15-minute unbalanced three-phase power-flow states and noiseless synthetic measurements.

Observed real-browser P1 baseline:

- `96/96` three-phase intervals converged
- `90` customers, `8,640` AMI interval-energy values
- source energy: `1407.2 kWh`
- technical loss: `33.30 kWh` (`2.37%`)
- accounting residual: `0.1680 kWh` (`0.0119%` of source energy)
- peak source P: `99.5 kW` at `18:45`
- minimum LV voltage: `0.9611 pu`
- peak transformer loading: `31.7%`
- maximum LV unbalance: `0.787%`
- 96-solve runtime: `5.27 s`
- Ground Truth SHA-256 remained unchanged

See `docs/P1-GROUND-TRUTH.md`.

## P2 — current phase

P2 creates an **imperfect observable view** from P1 while leaving Ground Truth immutable. A separate conventional, non-smart Pandapower model is then built only from degraded/observed/assumed fields.

The primary `Typical` scenario introduces:

- `35%` unknown customer phase
- `20%` missing AMI streams
- `60%` unknown PF
- `5%` wrong customer mapping
- `10%` one-interval timestamp mismatch
- service-length uncertainty `±15%`
- AMI/source-P meter noise `±0.5%`
- transformer parameter uncertainty

Simple baseline rules fill the gaps: peer-profile AMI imputation, default PF assumptions and greedy branch phase balancing. There is deliberately **no optimizer or smart calibration in P2**.

P2 reports Ground Truth vs conventional technical loss, loss error, source/phase/voltage residuals, coverage metrics, degradation provenance and 24-hour divergence curves. The synthetic truth is used only for validation and never as conventional-model input.

See `docs/P2-DATA-DEGRADATION.md`.

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
P1 Ground Truth simulator           PASS
  ↓
P2 data degradation                 CURRENT
  ↓
P3 smart calibration
  ↓
confidence / explainability
  ↓
engineering cockpit
```

**P3 may start only after the `Typical` P2 scenario passes in a real browser and establishes a reproducible conventional-model error baseline.**

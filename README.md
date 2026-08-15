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

Observed baseline:

- engine initialization: `9.73 s`
- first `runpp_3ph()`: `176.5 ms`
- repeated solve average: `39.77 ms`
- technical loss: `6.484981 kW`

See `docs/P0A-GATE.md`.

## P0-B — PASS

P0-B proved the same browser-only physics architecture at the canonical 90-customer scale.

Observed final-case baseline:

- `123` buses
- `121` lines
- `90` asymmetric customer loads
- 25 warm solves: `933.7 ms`
- technical loss: `4.515 kW`
- minimum LV voltage: `0.934944 pu`
- WASM heap: approximately `215 MB`

See `docs/P0B-GATE.md`.

## P1 — PASS

P1 created the immutable 24-hour Ground Truth simulator:

- `96/96` three-phase intervals converged
- `90` customers
- `8,640` AMI interval-energy values
- source energy: `1407.2 kWh`
- Ground Truth technical loss: `33.30 kWh` (`2.37%`)
- accounting residual: `0.0119%`
- 96-solve runtime: `5.27 s`
- Ground Truth hash remained unchanged

See `docs/P1-GROUND-TRUTH.md`.

## P2 — PASS

P2 creates an imperfect observable view and a separate conventional model without smart optimization.

Canonical **Typical** real-browser baseline:

- phase known: `65.6%`
- AMI coverage: `80.0%`
- PF known: `40.0%`
- mapping known: `94.4%`
- timestamp aligned: `90.0%`
- Ground Truth loss: `33.30 kWh`
- conventional loss: `33.07 kWh`
- loss error: `-0.67%`
- source-P NRMSE: `1.25%`
- phase-P RMSE: `2.821 kW`
- LV-voltage RMSE: `0.00125 pu`
- validation-only phase accuracy: `75.6%`
- `96/96` conventional solves converged

A Poor scenario also passed and produced a larger `+5.72%` loss error while source-P NRMSE remained only `1.35%`, demonstrating why aggregate feeder fit alone is not enough for technical-loss estimation.

See `docs/P2-DATA-DEGRADATION.md`.

## P3 — current phase

P3 is a **deterministic physics-informed Smart Calibration Engine**, not black-box AI.

It uses only the degraded P2 view and noisy measurements during calibration. Hidden P1 Ground Truth is blocked until final synthetic validation.

P3-v1 stages:

1. flagged timestamp correction (`-15 / 0 / +15 min`)
2. bounded missing-AMI profile reconstruction
3. unknown-phase coordinate descent against measured phase P
4. sparse reactive-power physics anchors
5. bounded unknown-PF calibration against feeder Q
6. transformer `Pfe` calibration from low-load energy balance
7. full `96 × runpp_3ph()` smart-model validation

Verified phase/PF values are locked. Weakly identifiable parameters such as suspect branch/pole mapping, individual SR length and transformer `vk/vkr` are explicitly held rather than silently overfit.

P3 uses `64` calibration intervals and `32` hold-out intervals. The gate requires the hold-out multi-signal objective and validation-only technical-loss estimate to improve over the P2 Typical baseline.

See `docs/P3-SMART-CALIBRATION.md`.

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
P2 data degradation                 PASS
  ↓
P3 smart calibration                CURRENT
  ↓
confidence / explainability
  ↓
engineering cockpit
```

Do not relax P3 gates merely to obtain a PASS. If hold-out residuals or validation-only technical-loss accuracy do not improve, audit the calibration strategy instead.

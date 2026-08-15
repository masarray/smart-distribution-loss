# Smart Distribution Loss

Browser-only proof of concept for an open-source, physics-informed distribution-loss intelligence platform.

## Why this project exists

A conventional power-flow solver can be very accurate when the network is well observed. The harder problem appears below a distribution transformer, where customer phase, AMI coverage, PF, mapping, timing and LV parameters are often incomplete.

Smart Distribution Loss keeps the electrical laws in **Pandapower** and uses a deterministic **Smart Calibration Engine** only to estimate poorly observed states that measurements can support.

The public demo now makes this contrast explicit:

```text
SPOT LOAD / PELANGGAN TM
high observability
        ↓
conventional model already accurate
        ↓
Smart Engine = minimal correction

            VS

DISTRIBUTION TRANSFORMER / GARDU DISTRIBUSI
imperfect observability
        ↓
conventional model diverges
        ↓
Smart Engine reconstructs supported unknown states
        ↓
3-phase physics validation
        ↓
loss estimate becomes substantially more accurate
```

## Canonical PLN discussion proof — PASS

The browser CI runs both scenarios with real `pandapower.runpp_3ph()` calculations. Hidden synthetic Ground Truth is blocked during calibration and revealed only for final validation.

### MV spot load / pelanggan TM — high observability

- P/Q known: `100%`
- phase known: `100%`
- topology known: `100%`
- timing known: `100%`
- conventional technical-loss error: `+1.506%`
- Smart technical-loss error: `+0.094%`
- Smart action: **MINIMAL_CORRECTION**
- verified P/Q, phase, topology, mapping and timing remain locked

This proves that Smart Engine does not invent unnecessary corrections when the ordinary model is already well observed.

### Distribution transformer / gardu distribusi — Poor challenge

Poor-observability input:

- AMI coverage: `60%`
- phase known: `40%`
- PF known: `20%`
- mapping known: `90%`

Measured browser-CI result:

- Ground Truth technical loss: `33.296 kWh/day`
- conventional technical loss: `35.199 kWh/day`
- Smart technical loss: `33.373 kWh/day`
- technical-loss error: **`+5.716% → +0.232%`**
- source-P NRMSE: **`1.350% → 0.661%`**
- phase-P RMSE: **`2.8728 → 1.4228 kW`**
- LV-voltage RMSE: **`0.001585 → 0.001296 pu`**
- 32-interval hold-out objective: **`0.097863 → 0.071900`**
- validation-only phase accuracy: `63.33% → 64.44%`
- `96/96` Smart three-phase power flows converged

The less severe **Typical** scenario also passes:

- technical-loss error: `-0.674% → +0.525%`
- source-P NRMSE: `1.252% → 0.347%`
- phase-P RMSE: `2.8206 → 1.3018 kW`
- hold-out objective: `0.083159 → 0.047573`

The Poor scenario is intentionally the clearest public demonstration of the original engineering problem: aggregate feeder power can look reasonably close while downstream state uncertainty still creates a material technical-loss error.

### Accuracy claim boundary

For this **synthetic proof**, hidden Ground Truth exists, so final loss accuracy can be quantified directly.

For **field data**, the application must not claim access to an unavailable true network state. Field accuracy should instead be stated against independent measurements, hold-out residuals, energy consistency, measurement coverage and confidence/observability.

See `docs/PLN-DISCUSSION-DEMO.md`.

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

The Poor scenario produced the larger `+5.72%` technical-loss error while source-P NRMSE remained only `1.35%`, demonstrating why aggregate feeder fit alone is not enough for technical-loss estimation.

See `docs/P2-DATA-DEGRADATION.md`.

## P3 — PASS

P3 is a **deterministic physics-informed Smart Calibration Engine**, not black-box AI.

It uses only the degraded P2 view and noisy measurements during calibration. Hidden P1 Ground Truth is blocked until final synthetic validation.

P3-v1 stages:

1. flagged timestamp correction (`-15 / 0 / +15 min`)
2. bounded missing-AMI profile reconstruction
3. unknown-phase coordinate descent against measured phase P
4. sparse reactive-power physics anchors
5. bounded unknown-PF calibration against feeder Q
6. loss-consistent transformer `Pfe` calibration from current Smart-state three-phase physics
7. full `96 × runpp_3ph()` Smart-model validation

Verified phase/PF values are locked. Weakly identifiable parameters such as suspect branch/pole mapping, individual SR length and transformer `vk/vkr` are explicitly held rather than silently overfit.

P3 uses `64` calibration intervals and `32` hold-out intervals. Both **Typical** and **Poor** browser-CI scenarios now pass all mandatory gates.

See `docs/P3-SMART-CALIBRATION.md`.

## Public cockpit

The default UI is a public engineering demo rather than an internal regression page. It includes:

- **PLN Discussion Demo** — Spot Load vs Distribution Transformer
- data-observability indicators
- distribution SLD
- Conventional → Smart technical-loss comparison
- source/phase/hold-out residual improvement
- explainable Smart Calibration pipeline
- Observability Guard / held parameters
- separate Engineering view for P0–P3 regression and raw diagnostics

Browser CI captures visual artifacts for Overview, PLN proof, Network and Calibration on every regression run.

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
P3 smart calibration                PASS
  ↓
public PLN comparison cockpit       PASS
  ↓
P4 confidence / observability / explainability
```

Do not relax calibration or hold-out gates merely to obtain a PASS. If measurement residuals or validation-only technical-loss accuracy regress, audit the calibration strategy instead.

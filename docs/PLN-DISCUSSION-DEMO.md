# PLN Discussion Demo — Spot Load vs Distribution Transformer

Status: **PASS**

This public-demo scenario was created to answer a specific distribution-engineering question:

> Why can a conventional power-flow model be relatively accurate for a spot load / MV customer, yet show materially larger error once a distribution transformer feeds many LV customers — and can technical-loss accuracy be recovered with a Smart Engine?

## Engineering thesis

The demo does **not** assume that a power-flow solver becomes inaccurate at a distribution transformer.

The thesis is:

```text
same electrical physics
        +
different observability
        =
different model accuracy
```

A spot load / MV customer is comparatively easy because P, Q, phase, topology and timing can be directly observed.

A distribution transformer feeding many LV customers introduces poorly observed states such as:

- missing interval AMI
- unknown customer phase
- uncertain PF / reactive power
- customer mapping uncertainty
- timestamp mismatch
- service-conductor uncertainty
- transformer parameter uncertainty

Smart Distribution Loss therefore keeps **Pandapower** responsible for electrical laws and uses the **Smart Calibration Engine** only to estimate states that available measurements can support.

## Scenario 1 — MV Spot Load / Pelanggan TM

Topology:

```text
20 kV GRID
    │
5 km MV feeder
    │
MV meter
    │
3-phase spot load
```

Observability:

- measured P/Q: `100%`
- phase known: `100%`
- topology known: `100%`
- mapping known: `100%`
- timing known: `100%`

Browser-CI result:

- conventional technical-loss error: `+1.506%`
- Smart technical-loss error: `+0.094%`
- Smart action: `MINIMAL_CORRECTION`

The only eligible Smart correction is a bounded aggregate MV-line resistance calibration. Verified load P/Q, phase, topology, mapping and timing remain locked.

Interpretation:

> When observability is already high, the conventional physics model is already accurate. Smart Engine should preserve that state rather than invent unnecessary corrections.

## Scenario 2 — Distribution Transformer / Gardu Distribusi

Canonical topology:

```text
20 kV GRID
    │
250 m TM feeder
    │
TR GD-01 · 400 kVA · 20/0.4 kV
    │
LV MAIN
 ┌──┼──┐
 │  │  │
JTR1 JTR2 JTR3
 │   │   │
30  30  30 customers
```

### Poor challenge observability

- AMI coverage: `60%`
- phase known: `40%`
- PF known: `20%`
- mapping known: `90%`
- timestamp alignment is intentionally degraded
- SR and transformer parameters are imperfect

Browser-CI result:

| Metric | Conventional | Smart |
|---|---:|---:|
| Technical loss | `35.199 kWh` | `33.373 kWh` |
| Hidden validation loss | `33.296 kWh` | `33.296 kWh` |
| Technical-loss error | `+5.716%` | **`+0.232%`** |
| Source-P NRMSE | `1.350%` | **`0.661%`** |
| Phase-P RMSE | `2.8728 kW` | **`1.4228 kW`** |
| LV-voltage RMSE | `0.001585 pu` | **`0.001296 pu`** |
| Hold-out objective | `0.097863` | **`0.071900`** |
| Phase accuracy | `63.33%` | `64.44%` |

Mandatory checks:

- P1 Ground Truth immutable: **PASS**
- verified phase/PF preserved: **PASS**
- 96/96 Smart power flows converged: **PASS**
- 32-interval hold-out objective improved: **PASS**
- source-P fit improved: **PASS**
- phase-P fit improved: **PASS**
- validation-only technical-loss estimate improved: **PASS**
- phase assignment did not regress: **PASS**
- LV voltage plausible: **PASS**
- browser runtime budget: **PASS**

The Smart Engine stages were:

1. timestamp alignment
2. missing-AMI reconstruction
3. unknown-phase inference
4. reactive-power physics anchors
5. unknown-PF calibration
6. loss-consistent transformer `Pfe` calibration
7. separate Smart Pandapower model
8. 96 full `runpp_3ph()` validation intervals

## Why this answers the original discussion

The Poor challenge intentionally demonstrates the condition that is hard to see from feeder power alone:

```text
Conventional source-P NRMSE ≈ 1.35%

but

Conventional technical-loss error ≈ +5.72%
```

So an apparently reasonable aggregate feeder fit does not prove that downstream current distribution, phase state and technical losses are correct.

After Smart Calibration:

```text
technical-loss error   +5.72% → +0.23%
source-P NRMSE           1.35% → 0.66%
phase-P RMSE             2.87  → 1.42 kW
hold-out objective       0.098 → 0.072
```

This is the result the public UX is designed to make visually obvious.

## What the demo does — and does not — claim

### Synthetic proof

The synthetic simulator has a hidden Ground Truth, so it is legitimate to say:

> Smart Calibration made the technical-loss estimate more accurate against the hidden validation reference.

Ground Truth remains blocked throughout calibration and is used only after the Smart model is complete.

### Field analysis

On an actual utility network, hidden truth is normally unavailable. Therefore the field product should **not** claim an exact unknown truth.

Field accuracy should instead be supported by:

- independent feeder/transformer measurements
- phase measurements where available
- voltage/current channels
- energy balance
- calibration vs hold-out residuals
- observability / measurement coverage
- parameter provenance
- confidence / uncertainty

The intended field statement is:

> Smart Engine makes the distribution model more measurement-consistent and provides a more defensible technical-loss estimate, with explicit confidence and unresolved-state reporting.

## Solver positioning

The demo deliberately does not state that SINCAL, Pandapower, or another competent solver is inherently inaccurate at a distribution transformer.

The fair comparison is:

```text
well-observed model
    → conventional physics is accurate

poorly-observed distribution model
    → state uncertainty creates error

poorly-observed model + Smart Calibration
    → supported states reconstructed
    → physics rerun
    → measurement and loss accuracy improve
```

If a real SINCAL project/export and synchronized field measurements become available, a separate objective benchmark can compare:

```text
FIELD MEASUREMENT
vs
SINCAL MODEL
vs
SMART DISTRIBUTION LOSS
```

without changing the core methodology.

## Reproducibility

GitHub Actions runs the public proof in headless Chromium with:

- Pyodide `0.28.3`
- Pandapower `3.1.2`
- browser Web Worker
- no backend
- deterministic synthetic seeds

The Browser Physics Regression matrix tests both `Typical` and `Poor` distribution presets and stores JSON, console logs and public-cockpit screenshots as workflow artifacts.

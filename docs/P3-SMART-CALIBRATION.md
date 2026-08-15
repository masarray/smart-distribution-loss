# P3 — Physics-Informed Smart Calibration

## Status

**READY FOR REAL-BROWSER VALIDATION**

P0-A, P0-B, P1 and the canonical P2 Typical scenario have passed in a real Windows browser. P3 must now prove that a deterministic, explainable calibration layer can improve the degraded conventional model without reading hidden Ground Truth during calibration.

## Canonical baseline — P2 Typical

Observed real-browser P2 Typical baseline on 2026-08-15:

- phase known: `65.6%`
- AMI coverage: `80.0%`
- PF known: `40.0%`
- mapping known: `94.4%`
- timestamp aligned: `90.0%`
- Ground Truth daily technical loss: `33.30 kWh`
- conventional daily technical loss: `33.07 kWh`
- conventional loss error: `-0.67%`
- source-P NRMSE: `1.25%`
- phase-P residual RMSE: `2.821 kW`
- LV-voltage residual RMSE: `0.00125 pu`
- technical-loss profile RMSE: `0.134 kW`
- customer-energy error: `-1.20%`
- validation-only phase-assignment accuracy: `75.6%`
- `96/96` conventional three-phase power flows converged
- real-browser conventional solver time: approximately `19.38 s`

This is the baseline P3 must beat.

## Isolation rule

Calibration is forbidden from reading hidden true customer phase, PF, load profile, service length, mapping or technical-loss result.

The only permitted calibration inputs are:

- P2 degraded customer/model view
- measured/observed customer AMI where available
- imputed P2 customer profiles where AMI is missing
- observed feeder/source P
- observed phase P
- observed LV-main A/B/C voltage
- noisy feeder Q measurement derived from the existing P1 source-Q measurement channel
- database/assumed parameter provenance and quality flags

Hidden Ground Truth is accessed only after all P3 decisions and 96 smart power flows have completed, for synthetic validation metrics.

## Calibration / validation split

P3 does not score itself only on the points it calibrated against.

- calibration set: `64` intervals — two of every three 15-minute points
- hold-out validation set: `32` intervals — every third point

The P3 gate requires improvement on the hold-out set.

## Staged calibration v1

### Stage 1 — Timestamp alignment

Only records already flagged as time-misaligned are eligible.

For each flagged AMI stream P3 tests `-15 min`, `0`, and `+15 min` alignment against feeder-P residual on calibration intervals and chooses the bounded option with the lowest residual.

### Stage 2 — Missing-AMI reconstruction

Missing customer profiles remain based on P2 peer-category imputation, but P3 fits bounded scale factors for residential and small-commercial missing-AMI groups against feeder P.

Bounds prevent the estimator from inventing arbitrary demand.

### Stage 3 — Unknown-phase inference

Verified phase labels are locked.

Only customers with `phase_status = UNKNOWN` may change phase. P3 performs deterministic coordinate descent against measured phase-P profiles on the 64 calibration intervals.

### Stage 4 — Reactive-power observability

P3 samples `16` physics anchor intervals from the conventional model to estimate network reactive-power overhead. A noisy feeder-Q measurement is used; true customer PF is not exposed.

### Stage 5 — Unknown-PF calibration

Verified/database PF values are locked.

For customers whose PF is unknown, bounded least squares estimates residential and small-commercial group `tan(phi)` / PF from feeder Q. PF is bounded to an engineering range of `0.80–0.99`.

### Stage 6 — Identifiable network parameters

P3-v1 estimates transformer `Pfe` from low-load energy balance.

It deliberately does **not** fit parameters that are weakly identifiable with the current measurement set:

- individual suspect customer branch/pole mapping
- individual service-connection length/resistance
- transformer `vk/vkr`

Those remain `HELD` and are surfaced explicitly in the UI.

### Stage 7 — Full physics validation

A separate Pandapower model is rebuilt from the degraded P2 view plus the calibrated states. It runs `96 × runpp_3ph()` and is compared against measurements.

Only after that step is hidden synthetic Ground Truth used for validation-only scoring.

## Observable objective

P3 uses a normalized multi-signal objective rather than optimizing only feeder active power:

```text
30% source-P residual
45% phase-P residual
25% LV-main voltage residual
```

Reactive power is used specifically for PF calibration and is also reported in final diagnostics.

## Mandatory checks

1. P1 Ground Truth hash remains unchanged.
2. Verified phase and PF inputs are never modified.
3. `96/96` smart three-phase power flows converge.
4. Hold-out observable objective improves over the conventional P2 baseline.
5. Source-P NRMSE improves or remains no worse than conventional.
6. Phase-P RMSE improves or remains no worse than conventional.
7. Validation-only technical-loss error magnitude improves versus conventional.
8. Validation-only phase-assignment accuracy does not regress.
9. Smart LV voltage remains numerically plausible (`0.85–1.12 pu`).
10. Final 96 smart power-flow solves complete within `60 s`.

## Gate rule

P3 is **not** considered complete merely because the calibration residual decreases on its 64 training intervals.

It must also improve on the 32 held-out intervals and improve the validation-only technical-loss estimate without hidden-truth access during calibration.

If any mandatory check fails, the UI must display `FAIL`; the implementation should be audited rather than relaxing the gate to force a PASS.

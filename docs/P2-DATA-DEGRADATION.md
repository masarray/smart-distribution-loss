# P2 — Data Degradation / Imperfect Observability

## Status

**PASS — canonical Typical baseline validated in a real Windows browser on 2026-08-15**

P0-A, P0-B and P1 have already passed in a real Windows browser. P2 deliberately damages the observable/model view while preserving the P1 Ground Truth as an immutable hidden reference.

## Purpose

Demonstrate that a distribution model can become materially wrong even though the physics solver itself is correct, when customer/network observability is incomplete or inconsistent.

```text
IMMUTABLE P1 GROUND TRUTH
        ↓
measurement / database degradation
        ↓
DEGRADED OBSERVABLE VIEW
        ↓
conventional assumptions / imputation
        ↓
PANDAPOWER runpp_3ph()
        ↓
CONVENTIONAL MODEL RESULT
        ↓
compare against measurements + hidden synthetic truth
```

P2 contains **no smart optimizer and no AI/ML**. Correction starts only in P3.

## Isolation rule

P2 has two logically separate roles:

1. **Measurement simulator** — allowed to read P1 Ground Truth only to generate realistic degraded observations.
2. **Conventional model** — must consume only the degraded/observed/assumed view.

The conventional-model customer schema does not expose hidden `true_*` / Ground Truth fields. P2 rebuilds a separate Pandapower network from the degraded view. The P1 network, truth P/Q matrices and truth hash are not mutated.

## Deterministic presets

All degradation uses deterministic seed `62052` (`61850 + 202`) plus a small preset offset. Re-running the same preset produces the same degraded customer sets so P3 can later be compared against an identical baseline.

### Good

- unknown phase: `10%`
- missing AMI: `5%`
- unknown PF: `20%`
- wrong mapping: `1%`
- timestamp mismatch: `2%`
- service length error: `±5%`
- AMI/source-P meter noise: `±0.2%`

### Typical — primary P2 acceptance scenario

- unknown phase: `35%`
- missing AMI: `20%`
- unknown PF: `60%`
- wrong customer mapping: `5%`
- timestamp mismatch: `10%`
- service length error: `±15%`
- AMI/source-P meter noise: `±0.5%`
- LV voltage measurement noise: `±0.1%`
- transformer parameter assumptions: `Pfe +12%`, `vkr +8%`, `vk -5%`

For the deterministic 90-customer run this resolved to:

- `31/90` phase-unknown customers (`65.6%` phase known)
- `18/90` missing AMI streams (`80.0%` coverage)
- `54/90` PF-unknown customers (`40.0%` PF known)
- `5/90` wrong customer mappings (`94.4%` mapping known)
- `9/90` timestamp-shifted customers (`90.0%` aligned)

### Poor

- unknown phase: `60%`
- missing AMI: `40%`
- unknown PF: `80%`
- wrong mapping: `10%`
- timestamp mismatch: `20%`
- service length error: `±25%`
- AMI/source-P meter noise: `±1.0%`

## Real-browser validation — Typical preset

The canonical P2 acceptance scenario passed in a real Windows browser.

Observed result:

- P1 Ground Truth technical loss: `33.30 kWh`
- conventional-model technical loss: `33.07 kWh`
- signed technical-loss error: `-0.67%`
- source-P normalized RMSE: `1.25%`
- phase-P residual RMSE: approximately `2.821 kW`
- LV-voltage residual RMSE: approximately `0.00125 pu`
- technical-loss profile RMSE: approximately `0.134 kW`
- conventional customer-energy error: approximately `-1.20%`
- validation-only phase-assignment accuracy: approximately `75.6%`
- conventional `96/96` three-phase intervals converged
- conventional solver time: approximately `19.38 s` total, `201.9 ms` average in that browser run
- Ground Truth hash remained unchanged

The loss-error magnitude is smaller than in the Poor scenario, but the source-P and phase residuals remain measurable. This makes Typical a useful and nontrivial baseline for P3: Smart Calibration must improve the observable residuals and then prove that its validation-only loss estimate is closer to hidden Ground Truth.

## Real-browser validation — Poor preset

A harsher Poor scenario also passed.

Observed degradation counts / coverage:

- phase known: `40.0%` (`54/90` customer phases hidden)
- AMI coverage: `60.0%` (`36/90` AMI streams missing)
- PF known: `20.0%` (`72/90` PF values hidden)
- mapping known: `90.0%` (`9/90` wrong customer mappings)
- timestamp aligned: `80.0%` (`18/90` shifted by one 15-minute interval)
- service-length uncertainty: `±25%`
- meter noise: `±1.0%`
- transformer assumptions: approximately `Pfe +20%`, `vkr +12%`, `vk -8%`

Observed result:

- P1 Ground Truth technical loss: `33.30 kWh`
- conventional-model technical loss: `35.20 kWh`
- signed technical-loss error: `+5.72%`
- source-P normalized RMSE: `1.35%`
- phase-P residual RMSE: approximately `2.873 kW`
- LV-voltage residual RMSE: approximately `0.00158 pu`
- technical-loss profile RMSE: approximately `0.147 kW`
- conventional customer-energy error: approximately `-1.49%`
- validation-only phase-assignment accuracy: approximately `63.3%`
- conventional `96/96` three-phase intervals converged
- conventional solver time: approximately `9.33 s` total, `97.2 ms` average
- Ground Truth hash remained unchanged

The Poor result is important because aggregate source-P error remains relatively small (`1.35% NRMSE`) while technical-loss error grows to `+5.72%`. A model can look reasonably close at the feeder while still distribute current incorrectly enough to bias technical-loss calculation.

Also keep the voltage-observability distinction explicit: a small residual at the limited measured LV point(s) does not prove that downstream customer/end-of-line voltage states are correct. P3 must not optimize only feeder/source P; it needs multi-signal residuals and physical constraints.

## Conventional non-smart rules

P2 deliberately uses simple engineering assumptions rather than optimization:

- known phase → preserve measured/database phase
- unknown phase → greedy assignment to the lightest estimated phase in that modeled JTR branch
- available AMI → use measured 15-minute energy after configured noise/timing effects
- missing AMI → impute from peer-category per-kVA median profiles
- known PF → preserve database PF
- unknown PF → assume `0.92` residential / `0.90` small commercial
- wrong mapping → retain the incorrect branch/pole association
- service length → use perturbed assumed length
- transformer parameters → use imperfect assumed/database values

These rules are intentionally plausible but not smart. They form the baseline P3 must beat.

## P2 outputs

The browser reports:

- Ground Truth daily technical loss
- conventional-model daily technical loss
- signed loss error `%`
- technical-loss profile RMSE
- feeder/source-P RMSE and normalized RMSE
- phase-P residual RMSE
- LV voltage residual RMSE
- conventional customer-energy error
- validation-only phase-assignment accuracy
- observable coverage for phase / AMI / PF / mapping / timestamp
- 24-hour Ground Truth vs conventional technical-loss curves
- degradation inventory
- sample conventional input records with observed/assumed statuses
- runtime

The validation-only Ground Truth metrics are visible in this synthetic demo so the quality of P3 calibration can be measured. They are not supplied to the conventional estimator.

## Mandatory checks

1. P1 Ground Truth SHA-256 remains unchanged after P2.
2. Configured deterministic degradation counts are actually applied.
3. Conventional-model input schema contains no hidden-truth fields.
4. `96/96` conventional three-phase power flows converge.
5. Degradation creates measurable divergence from the hidden truth / measurements.
6. Conventional daily customer energy remains within a broad plausibility window (`<20%` error).
7. Conventional LV voltage remains numerically plausible (`0.85 < V < 1.12 pu`).
8. Total solver time for 96 conventional intervals is below `60 s`.

## Gate result

**P2 COMPLETE.** The deterministic `Typical` scenario is now the canonical conventional baseline for P3.

P3 must receive the same degraded customer/model view and may not read hidden P1 phase, PF, service-length, load-profile or mapping truth during calibration.

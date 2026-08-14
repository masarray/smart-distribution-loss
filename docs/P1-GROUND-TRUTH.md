# P1 — Ground Truth Simulator

## Status

**PASS — validated in a real Windows browser on 2026-08-15 (Asia/Jakarta)**

P0-A and P0-B had already passed. P1 has now also passed with the full immutable 90-customer, 24-hour Ground Truth and synthetic-measurement workflow running entirely inside the browser.

## Purpose

Create a known physical reality that future stages can deliberately obscure without ever losing the reference truth.

P1 is the control experiment for the entire Smart Distribution Loss concept:

```text
Immutable customer/network truth
        ↓
96 × 15-minute load states
        ↓
Pandapower runpp_3ph()
        ↓
True network state
        ↓
Noiseless synthetic measurements
```

P2 must operate on a derived/degraded view. P2/P3 must never mutate or directly expose hidden Ground Truth parameters to the estimator.

## Canonical Ground Truth

- topology: `20 kV → 250 m TM → 400 kVA Dyn → 3 JTR → 90 customers`
- customers: `90`
- customer mix: `80 residential + 10 small commercial`
- true phase allocation: `A 30 / B 30 / C 30`
- resolution: `15 minutes`
- intervals/day: `96`
- synthetic seed: `61850`
- physics solver: `pandapower.runpp_3ph()`
- backend: none
- execution: Pyodide/WebAssembly inside a browser Web Worker

## Real-browser validation result

Observed P1 result:

- source energy: `1407.20 kWh`
- customer energy: approximately `1373.75 kWh`
- component technical loss: `33.2959 kWh`
- technical loss percentage: `2.37%`
- accounting residual: `0.1680 kWh`
- accounting residual percentage: `0.0119%` of source energy
- peak source active power: `99.5 kW` at `18:45`
- minimum LV voltage: `0.9611 pu` at `10:15`
- peak transformer loading: `31.7%` at `17:30`
- maximum LV voltage unbalance: `0.787%` at `10:00`
- total solver time for 96 intervals: `5.27 s`
- average solve time: approximately `54.9 ms`
- AMI interval values: `90 × 96 = 8,640`

Observed daily loss decomposition:

- MV/TM feeder: approximately `0.02 kWh`
- JTR: approximately `10.86 kWh`
- service connections / SR: approximately `1.34 kWh`
- transformer: approximately `21.08 kWh`

The transformer remains the largest daily technical-loss component because its iron/no-load component persists during lower-load intervals.

The peak source P occurs at `18:45`, while maximum transformer loading occurs at `17:30`. This is not automatically an inconsistency: the three-phase transformer loading metric depends on per-phase apparent-power/current conditions, including reactive power and imbalance, rather than total active power alone. Keep this distinction visible in future UI/explainability work.

## Load profiles

P1 uses deterministic category profiles instead of random values at every run.

Residential customers contain:

- overnight base demand
- morning peak
- smaller midday activity
- dominant evening peak

Small-commercial customers contain:

- low overnight load
- morning ramp
- broad daytime load
- afternoon/evening decay

Each customer receives deterministic diversity, small time shift and small smooth profile variation. The resulting individual profile is bounded and derived from that customer's P0-B reference demand and true PF.

## Immutability

The complete Ground Truth descriptor includes:

- topology/schema identifier
- seed
- interval definition
- all 90 customer static truth records
- profile-generation metadata
- all customer P and Q truth matrices for 96 intervals

The descriptor is canonicalized and SHA-256 hashed before simulation.

The P/Q truth arrays are marked read-only. After all 96 simulations, the descriptor is rebuilt and hashed again. The real-browser test confirmed that the hash remained unchanged.

## Synthetic measurements

P1 generates noiseless Ground Truth measurements suitable for later degradation:

1. feeder/source active and reactive power: `96` records
2. source phase P/Q: `96 × 3 phase values`
3. LV main-bus voltage A/B/C: `288` values
4. transformer LV current A/B/C: `288` values
5. transformer loading: `96` records
6. customer AMI interval energy: `8,640` values
7. true customer phase/PF/service-length metadata: `90` static records
8. technical-loss decomposition: `384` component interval values

P1 intentionally contains no missing data, meter noise, wrong mapping or unknown phase. Those belong to P2.

## Technical loss accounting

Per interval, P1 records:

```text
MV feeder line loss
+ JTR loss
+ service-connection (SR) loss
+ transformer loss
= component technical loss
```

It also calculates source-load balance loss independently:

```text
source P - customer P = balance loss
```

The difference remains visible as an accounting residual; it is never silently forced to zero. The observed daily residual is only `0.1680 kWh`, or `0.0119%` of source energy, well inside the P1 acceptance threshold.

## Mandatory checks — real-browser result

1. Exactly `96/96` three-phase intervals converge. — **PASS**
2. Ground Truth SHA-256 is identical before and after simulation. — **PASS**
3. Exactly 90 customer AMI streams exist with 96 values each (`8,640` interval values). — **PASS**
4. Daily profile shows material load diversity. — **PASS**
5. Component-loss accounting residual is less than `0.5%` of source energy. — **PASS** (`0.0119%`)
6. LV voltage remains within broad feasibility bounds (`0.90 < V < 1.10 pu`). — **PASS**
7. Transformer remains below 100% loading for the canonical day. — **PASS**
8. Total solver time for 96 intervals is below `60 s`. — **PASS** (`5.27 s`)

## Gate conclusion

P1 is complete and the project may proceed to **P2 — Data Degradation / Imperfect Observability**.

P2 must preserve the P1 Ground Truth as hidden immutable reference data, then create an imperfect observable model containing controlled combinations of missing AMI, unknown phase, PF uncertainty, mapping error, conductor/length uncertainty, meter noise and related data-quality defects. The first P2 objective is to quantify how far a conventional/imperfect model moves away from this known Ground Truth before any Smart Calibration logic is introduced.

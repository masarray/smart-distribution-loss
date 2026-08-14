# P1 — Ground Truth Simulator

## Status

**READY FOR REAL-BROWSER VALIDATION**

P0-A and P0-B have already passed on a real Windows browser. P1 extends the validated 90-customer network into an immutable 24-hour Ground Truth and synthetic measurement generator.

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

P2 will copy and degrade the measurement/model view. P2/P3 must never mutate or directly expose hidden Ground Truth parameters to the estimator.

## Canonical Ground Truth

- topology: `20 kV → 250 m TM → 400 kVA Dyn → 3 JTR → 90 customers`
- customers: `90`
- resolution: `15 minutes`
- intervals/day: `96`
- synthetic seed: `61850`
- customer categories: residential + small commercial
- true customer phase: immutable
- true customer PF: immutable
- true service length: immutable
- customer daily profile: deterministic and customer-specific
- physics solver: `pandapower.runpp_3ph()`
- backend: none

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

The P/Q truth arrays are marked read-only. After all 96 simulations, the descriptor is rebuilt and hashed again. P1 fails if the hash changes.

## Synthetic measurements

P1 generates noiseless measurements suitable for later degradation:

1. feeder/source active and reactive power
2. source phase P/Q
3. LV main-bus voltage A/B/C
4. transformer LV current A/B/C
5. transformer loading
6. customer AMI interval energy (`90 × 96 = 8,640` values)
7. true customer phase/PF/service-length metadata
8. technical-loss decomposition at every interval

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

The small difference between balance loss and component loss is kept visible as an accounting residual; it is never silently forced to zero.

Daily energy is integrated at `0.25 h` per interval.

## Mandatory checks

1. Exactly `96/96` three-phase intervals converge.
2. Ground Truth SHA-256 is identical before and after simulation.
3. Exactly 90 customer AMI streams exist with 96 values each (`8,640` interval values).
4. Daily profile shows material load diversity (peak source P > 1.5 × minimum source P).
5. Component-loss accounting residual is less than `0.5%` of source energy.
6. LV voltage remains within broad feasibility bounds (`0.90 < V < 1.10 pu`).
7. Transformer remains below 100% loading for the canonical day.
8. Total solver time for 96 intervals is below `60 s` in the validation browser.

The 60-second threshold is a feasibility ceiling, not a performance target. Based on P0-B, expected runtime should be much lower.

## Output summary

P1 reports:

- daily source energy
- daily customer energy
- daily technical loss kWh and %
- MV/JTR/SR/transformer loss decomposition
- accounting residual
- peak source power and time
- minimum source power and time
- minimum LV voltage and time
- maximum voltage unbalance and time
- maximum transformer loading and time
- total/average/max 3-phase solver time
- Ground Truth hash
- measurement inventory

## Gate rule

**Do not begin P2 data degradation unless P1 returns PASS in a real browser.**

P2 must operate on a derived/imperfect view of this Ground Truth. It must not mutate the P1 truth arrays or allow future smart-estimation code to read the hidden true phase/load/PF values directly.

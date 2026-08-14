# P0-B — Browser Distribution Scale Gate

## Status

**READY FOR REAL-BROWSER VALIDATION**

P0-A has already passed on a real Windows browser using Pyodide 0.28.3 + pandapower 3.1.2.

## Purpose

Prove that the same browser-only physics architecture remains practical at the canonical demo scale before Ground Truth, degradation and smart calibration are added.

## Canonical synthetic topology

```text
20 kV GRID
   |
250 m MV feeder
   |
GD-01 20/0.4 kV
400 kVA Dyn transformer
   |
0.4 kV MAIN BUS
   |
   +-- JTR-01 -- 10 poles -- 30 customers
   +-- JTR-02 -- 10 poles -- 30 customers
   +-- JTR-03 -- 10 poles -- 30 customers

TOTAL: 90 individual single-phase customers
```

Each customer is represented by:

- individual LV bus
- individual service connection (SR)
- deterministic phase A/B/C
- residential or small-commercial category
- contracted kVA
- snapshot demand kW/kvar
- PF
- deterministic service length
- individual asymmetric wye load

Synthetic population seed: `61850`.

## Browser benchmark curve

The UI runs independent cases at:

- 1 customer
- 10 customers
- 30 customers
- 60 customers
- 90 customers

The first four cases use 3 repeated warm solves. The final 90-customer case uses **25 repeated warm `runpp_3ph()` solves** to approximate the physics-call volume of an early smart-calibration loop.

## Recorded metrics

Per case:

- bus count
- line count
- network build time
- first solve time
- warm solve average/min/max
- technical active-power loss
- minimum/maximum LV phase voltage
- maximum voltage unbalance
- maximum line loading
- transformer loading
- phase customer counts
- phase kW allocation
- repeated-solve numerical delta

Runtime diagnostics also report the allocated Pyodide/WASM heap when the browser exposes it.

## Mandatory 90-customer checks

1. `runpp_3ph()` converges.
2. Exactly 90 individual asymmetric customer loads exist.
3. Technical active-power loss is positive.
4. Repeated solves remain numerically stable (`max voltage delta < 1e-6 pu`).
5. All three phases are represented.
6. LV voltage remains inside the broad feasibility window `0.90 < V < 1.10 pu`.
7. Transformer loading remains below 100% for the canonical snapshot.
8. 25 warm browser solves complete in less than 60 seconds.

The performance threshold is deliberately generous. P0-B is a feasibility gate, not the final performance target.

## Scope boundary

P0-B does **not** include:

- Ground Truth vs imperfect model
- measurement generation
- missing data
- phase uncertainty
- topology errors
- optimization
- smart calibration
- AI/ML
- 24-hour time series

Those begin only after the browser-scale physics gate passes.

## Gate rule

**Do not begin P1 Ground Truth Simulator unless the 90-customer P0-B case passes in a real browser.**

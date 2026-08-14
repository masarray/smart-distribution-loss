# P0-B — Browser Distribution Scale Gate

## Status

**PASS — completed 2026-08-15 (Asia/Jakarta)**

P0-B passed in a real Windows desktop browser using the same browser-only Pyodide + Pandapower architecture validated by P0-A.

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

## Observed real-browser result

Final 90-customer case:

- customers: `90`
- buses: `123`
- lines: `121`
- asymmetric customer loads: `90`
- network build: `766.5 ms`
- first `runpp_3ph()`: `116.4 ms`
- warm solve average: `37.35 ms`
- 25 warm solves: `933.7 ms`
- repeated-solve max delta: `3.539e-9 pu`
- synthetic snapshot load: `155.114 kW / 61.672 kvar`
- source active power: `159.656 kW`
- technical active-power loss: `4.515 kW`
- technical loss: `2.828%` of source P
- minimum LV voltage: `0.934944 pu`
- maximum LV unbalance: `0.936070%`
- maximum line loading: `56.78%`
- transformer loading: `58.07%`
- phase customers: `A 30 / B 30 / C 30`
- phase load: `A 68.56 / B 44.99 / C 41.56 kW`
- allocated WASM heap: approximately `215 MB`

Scale curve observed in the same browser:

| Customers | Buses | Lines | Build | First solve | Warm avg | P loss | Min V | Unbalance |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 5 | 3 | 85 ms | 102 ms | 40 ms | 0.750 kW | 0.9996 pu | 0.009% |
| 10 | 17 | 15 | 135 ms | 85 ms | 38 ms | 0.822 kW | 0.9908 pu | 0.177% |
| 30 | 45 | 43 | 304 ms | 86 ms | 36 ms | 1.185 kW | 0.9787 pu | 0.391% |
| 60 | 84 | 82 | 541 ms | 102 ms | 37 ms | 2.297 kW | 0.9576 pu | 0.663% |
| 90 | 123 | 121 | 766 ms | 116 ms | 37 ms | 4.515 kW | 0.9349 pu | 0.936% |

## Mandatory 90-customer checks

1. `runpp_3ph()` converges. — **PASS**
2. Exactly 90 individual asymmetric customer loads exist. — **PASS**
3. Technical active-power loss is positive. — **PASS**
4. Repeated solves remain numerically stable (`max voltage delta < 1e-6 pu`). — **PASS**
5. All three phases are represented. — **PASS**
6. LV voltage remains inside the broad feasibility window `0.90 < V < 1.10 pu`. — **PASS**
7. Transformer loading remains below 100% for the canonical snapshot. — **PASS**
8. 25 warm browser solves complete in less than 60 seconds. — **PASS** (`0.93 s`)

## Engineering conclusion

The 90-customer browser model is comfortably inside the feasibility budget. The observed warm-solve average of about 37 ms gives sufficient headroom for a 96-interval daily Ground Truth simulation and later iterative calibration experiments.

P0-B is therefore closed and the project may proceed to **P1 — Ground Truth Simulator**.

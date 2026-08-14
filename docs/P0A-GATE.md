# P0-A — Browser Physics Feasibility Gate

## Status

**PASS — completed 2026-08-15 (Asia/Jakarta)**

The browser-only architecture has now been validated on a real Windows desktop browser with all computation executed locally in a Web Worker. No Python backend/server was used.

## Purpose

Prove that the product can execute **real unbalanced three-phase pandapower calculations inside a browser Web Worker** before any large UI, synthetic customer population, or smart calibration logic is built.

## Locked runtime for this spike

- Pyodide: `0.28.3`
- Python: `3.13.2`
- Pandapower: `3.1.2`
- NumPy: `2.2.5`
- pandas: `2.3.1`
- SciPy: `1.14.1`
- NetworkX: `3.4.2`
- Numba: disabled
- Execution: classic Web Worker
- Hosting target: GitHub Pages
- Backend/server: none

The versions are deliberately pinned. Pandapower is installed with an explicit Pyodide-compatible dependency set. `deepdiff==8.5.0` is pinned to avoid the newer `cachebox` native dependency, which has no compatible Pyodide wheel for this browser runtime.

## Network

The test topology mirrors pandapower's official minimal unbalanced example:

```text
20 kV external grid
       |
20/0.4 kV Dyn transformer, 630 kVA
       |
0.4 kV bus
       |
100 m LV line
       |
asymmetric wye load
A = 250 kW
B = 180 kW
C = 200 kW
```

## Observed browser result

- Engine initialization: `9.73 s`
- First `runpp_3ph()` solve: `176.5 ms`
- Repeated solve 1: `40.4 ms`
- Repeated solve 2: `38.8 ms`
- Repeated solve 3: `40.1 ms`
- Repeated solve average: `39.77 ms`
- LV phase A voltage: `0.977551255 pu`
- LV phase B voltage: `1.001594337 pu`
- LV phase C voltage: `0.974592625 pu`
- LV voltage unbalance: `1.221488 %`
- Line active-power loss: `5.726490 kW`
- Transformer active-power loss: `0.758492 kW`
- Endpoint technical-loss total: `6.484981 kW`
- Source/load balance technical-loss total: `6.536815 kW`
- Maximum delta vs official tutorial voltage reference: `3.751e-7 pu`
- Maximum repeated-solve delta: `4.351e-8 pu`

The difference between the endpoint-loss total and the source/load energy-balance total is approximately `0.051834 kW` (~52 W). This is only about `0.008%` of transferred active power, but it should remain visible as a validation item when the loss accounting model is expanded in P0-B/P1 rather than being silently hidden.

## Mandatory checks

1. Pyodide initializes in the Web Worker. — **PASS**
2. Pandapower 3.1.2 installs and imports. — **PASS**
3. `runpp_3ph(..., numba=False)` converges. — **PASS**
4. Bus, line and transformer 3-phase result tables exist. — **PASS**
5. Asymmetric load produces distinct A/B/C voltages. — **PASS**
6. Result is close to the official tutorial reference voltages. — **PASS**
7. Active-power losses are positive. — **PASS**
8. Three repeated solves remain numerically stable. — **PASS**
9. UI main thread remains responsive because all Python runs in the Worker. — **PASS**

## Gate conclusion

P0-A has passed. The project may proceed to **P0-B — browser-scale distribution network benchmark**.

P0-B should retain the same browser-first architecture and benchmark progressively larger networks before any smart-calibration optimizer is introduced.

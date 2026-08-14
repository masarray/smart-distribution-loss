# P0-A — Browser Physics Feasibility Gate

## Purpose

Prove that the product can execute **real unbalanced three-phase pandapower calculations inside a browser Web Worker** before any large UI, synthetic customer population, or smart calibration logic is built.

## Locked runtime for this spike

- Pyodide: `0.28.3`
- Pandapower: `3.1.2`
- Numba: disabled
- Execution: module Web Worker
- Hosting target: GitHub Pages
- Backend/server: none

The versions are deliberately pinned. Pyodide 0.28.3 ships pandas 2.3.1, NumPy 2.2.5, NetworkX 3.4.2 and SciPy 1.14.1. Pandapower 3.1.2 has broad dependency constraints (`pandas>=1.0`, `networkx>=2.5`, `scipy`, `numpy`) and therefore avoids the current pandas-3 / newer-pandapower mismatch.

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

## Mandatory checks

1. Pyodide initializes in the Web Worker.
2. Pandapower 3.1.2 installs and imports.
3. `runpp_3ph(..., numba=False)` converges.
4. Bus, line and transformer 3-phase result tables exist.
5. Asymmetric load produces distinct A/B/C voltages.
6. Result is close to the official tutorial reference voltages.
7. Active-power losses are positive.
8. Three repeated solves remain numerically stable.
9. UI main thread remains responsive because all Python runs in the Worker.

## Gate rule

**Do not begin P0-B (90-customer network) unless this page returns PASS in a real browser deployment.**

If package installation fails, diagnose package compatibility first. Do not work around a failed gate with hard-coded result JSON.

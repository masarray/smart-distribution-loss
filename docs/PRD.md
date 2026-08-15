# Smart Distribution Loss — Product Requirements Document

**Document:** Canonical Product Requirements Document  
**Version:** 1.1  
**Status:** ACTIVE — source of truth  
**Date:** 2026-08-15  
**Repository:** `masarray/smart-distribution-loss`

---

## 1. Executive Summary

Smart Distribution Loss is an open-source, browser-native, physics-informed platform for estimating and explaining technical losses in electrical distribution networks when the network is only partially observable.

The product is built around one engineering principle:

> **Do not use AI to calculate electrical laws. Use physics for electrical laws, and use a Smart Engine to estimate poorly observed network states only where measurements provide evidence.**

The electrical solver is Pandapower `runpp_3ph()`. The Smart Calibration Engine estimates uncertain distribution states such as customer phase, missing AMI profiles, power factor, timestamp alignment and selected identifiable asset parameters. The calibrated state is then rerun through unbalanced three-phase power flow.

The public product story is anchored to the original PLN distribution-network problem:

```text
SPOT LOAD / PELANGGAN TM
high observability
        ↓
conventional model already accurate
        ↓
Smart Engine performs minimal correction

             VS

DISTRIBUTION TRANSFORMER / GARDU DISTRIBUSI
many downstream states are poorly observed
        ↓
conventional model may still converge but loss estimate can be wrong
        ↓
Smart Engine reconstructs measurement-supported states
        ↓
3-phase physics is rerun
        ↓
loss estimate becomes substantially more accurate
```

The product must make this difference understandable visually even to a non-specialist. Therefore the next UX milestone is **P0 UX — SLD-first Public Proof**, in which real single-line diagrams become the primary explanatory surface for the Spot Load vs Gardu Distribusi comparison.

---

## 2. Product Vision

### 2.1 Vision statement

Create an open-source **Distribution Loss Intelligence Platform** that allows utilities, engineers, researchers and educators to answer:

1. How much technical loss is occurring?
2. Where in the network is that loss occurring?
3. How trustworthy is the estimate?
4. Which input states are measured, assumed, estimated, calibrated or unresolved?
5. Why does a conventional model become inaccurate as observability decreases?
6. Can measurement-supported Smart Calibration recover a more defensible network state and loss estimate?

### 2.2 Long-term positioning

> **Open-source physics-informed Distribution Loss Intelligence Platform.**

The product is not positioned as a generic AI predictor and not as a replacement for electrical-network physics.

It combines:

- network physics,
- observability analysis,
- state reconstruction,
- constrained calibration,
- technical-loss decomposition,
- confidence / uncertainty,
- explainability,
- interactive network visualization.

---

## 3. Problem Statement

### 3.1 The distribution observability problem

A conventional power-flow model can be accurate when its electrical model and operating state are well known.

A spot load or MV customer is comparatively easy because important quantities can often be observed directly:

- load P,
- load Q / PF,
- phase state,
- topology,
- meter location,
- timing.

A distribution transformer feeding many LV customers introduces a much larger hidden-state problem:

- customer load profiles,
- customer phase A/B/C,
- phase imbalance,
- AMI coverage gaps,
- power factor / reactive-power uncertainty,
- customer-to-branch mapping,
- timestamp mismatch,
- JTR/SR length and conductor uncertainty,
- transformer parameter uncertainty,
- diversity / coincidence,
- missing or unmodelled load.

The solver may converge perfectly while the modeled state is wrong.

### 3.2 Core product thesis

```text
same electrical physics
        +
different observability
        =
different model accuracy
```

Therefore:

> **Power-flow convergence is not proof that the modeled distribution state is correct.**

Smart Distribution Loss addresses the state-estimation / calibration problem that exists before and around the power-flow solver.

---

## 4. Product Principles

### P1 — Physics owns electrical laws

Voltage, current, P/Q flow, loading, transformer losses, line I²R losses and phase unbalance must be calculated by a real power-system solver.

### P2 — Smart Engine estimates state, not physics

The Smart Engine may estimate uncertain inputs but must never replace Kirchhoff/network equations with arbitrary predictions.

### P3 — No hidden-truth leakage

Synthetic Ground Truth is forbidden as a calibration input. It may only be revealed after the Smart model is complete for validation scoring.

### P4 — Observability before confidence

The product must explicitly state what is measured, assumed, estimated, calibrated and unresolved.

### P5 — Refuse false precision

Parameters that are not identifiable from the available measurement set must remain `HELD` / `UNRESOLVED` rather than be fitted merely to improve an objective.

### P6 — Explain every correction

Every Smart Engine change must have:

- parameter/state name,
- before value/state,
- after value/state,
- evidence,
- constraint/bound,
- provenance.

### P7 — Public UX must tell the engineering story visually

A user should understand the difference between a spot load and a distribution transformer before reading statistical metrics.

### P8 — Local-first privacy

For the browser product, user network data should remain on the user's computer by default.

---

## 5. Product Goals

### G1 — Demonstrate observability-driven model error

Show that incomplete distribution-state information can materially affect technical-loss accuracy even when aggregate feeder power looks reasonably close.

### G2 — Demonstrate Smart Calibration

Show that reconstructing measurement-supported states improves the conventional model.

### G3 — Preserve high-observability cases

When a spot load / MV customer is already accurately observed, Smart Engine must perform minimal correction rather than introduce unnecessary changes.

### G4 — Real three-phase physics

All primary electrical results must come from unbalanced three-phase Pandapower power flow.

### G5 — Technical-loss decomposition

Separate technical loss into meaningful physical components where the topology permits:

```text
MV feeder
transformer
JTR / LV main
service connection / SR
```

### G6 — Explainability and confidence

The product must explain both its result and the limitations of that result.

### G7 — Publicly understandable demo

A technically credible demo must also be understandable by:

- distribution engineers,
- management,
- utility stakeholders,
- students,
- technically interested non-specialists.

### G8 — Fully open-source execution path

No dependency on SINCAL, ETAP, PowerFactory or proprietary solver infrastructure is required for the core demo.

---

## 6. Non-Goals for Current Product Version

The current product is **not** intended to be:

- protection-coordination software,
- short-circuit protection grading software,
- harmonics analysis,
- transient stability,
- real-time SCADA control,
- switching / FLISR,
- OMS,
- billing software,
- automatic theft accusation,
- a replacement for enterprise GIS,
- a full PLN production ingest platform,
- a million-customer cloud solver,
- a black-box neural-network loss estimator.

`Unexplained residual` must never automatically be labelled theft or fraud.

Possible causes can include:

- metering error,
- timing mismatch,
- mapping inconsistency,
- missing customer/load,
- unmodelled topology,
- incorrect parameters,
- possible non-technical loss.

---

## 7. Target Users

### 7.1 Distribution engineer

Needs:

- technical-loss calculation,
- phase-aware results,
- observable residuals,
- data-quality diagnosis,
- calibration trace,
- network visualization.

### 7.2 Utility planning / operations engineer

Needs to understand where poor model observability is degrading the result and which additional measurement would improve confidence.

### 7.3 Engineering manager / decision maker

Needs a clear visual story:

> simple / observable network → accurate model  
> complex / poorly observed network → error  
> Smart Calibration → accuracy recovered

### 7.4 Researcher / student

Needs reproducible synthetic networks, deterministic seeds, open algorithms and inspectable measurements.

### 7.5 Public demo viewer

Needs to understand the core value without knowing RMSE, WLS or state-estimation theory.

---

## 8. Canonical Public Demonstration

The public demo must directly answer the PLN discussion around spot loads versus distribution transformers.

### 8.1 Scenario A — MV Spot Load / Pelanggan TM

Topology:

```text
20 kV GRID
    │
MV FEEDER
    │
MV METER
    │
3φ PELANGGAN TM / SPOT LOAD
```

Observability:

- measured P/Q: 100%
- phase: known
- topology: known
- mapping: known
- timing: aligned

Expected behavior:

- conventional model is already accurate,
- Smart Engine identifies high observability,
- verified state remains locked,
- only small evidence-supported correction is permitted,
- UX states `MINIMAL CORRECTION`.

Current browser-CI synthetic proof:

- conventional technical-loss error: `+1.506%`
- Smart technical-loss error: `+0.094%`

### 8.2 Scenario B — Distribution Transformer / Gardu Distribusi

Topology:

```text
20 kV GRID
    │
MV FEEDER
    │
TR GD-01 · 400 kVA · 20/0.4 kV
    │
LV MAIN BUS
 ┌────┼────┐
 │    │    │
JTR-1 JTR-2 JTR-3
 │    │    │
30    30   30 customers
```

Canonical customer count: `90`.

Poor challenge observability:

- AMI coverage: `60%`
- phase known: `40%`
- PF known: `20%`
- mapping known: `90%`
- timing degraded
- service and transformer parameters imperfect

Current browser-CI synthetic proof:

| Metric | Conventional | Smart |
|---|---:|---:|
| Technical loss | `35.199 kWh` | `33.373 kWh` |
| Hidden validation reference | `33.296 kWh` | `33.296 kWh` |
| Technical-loss error | `+5.716%` | **`+0.232%`** |
| Source-P NRMSE | `1.350%` | **`0.661%`** |
| Phase-P RMSE | `2.8728 kW` | **`1.4228 kW`** |
| LV-voltage RMSE | `0.001585 pu` | **`0.001296 pu`** |
| Hold-out objective | `0.097863` | **`0.071900`** |

### 8.3 Required public message

The product must visually communicate:

> **Spot load is easy because the important state is observable. Gardu distribusi is difficult because many downstream states are hidden. Smart Engine reconstructs only states supported by measurements, then reruns three-phase physics to recover a more accurate technical-loss estimate.**

---

## 9. Accuracy Claim Boundary

### 9.1 Synthetic proof mode

Because the simulator owns an immutable hidden Ground Truth, the product may state:

> **Smart Calibration made the technical-loss estimate more accurate against the hidden validation reference.**

Conditions:

- Ground Truth must remain inaccessible to the optimizer,
- Ground Truth may only be revealed after calibration and Smart physics validation complete.

### 9.2 Field analysis mode

Real field networks usually have no perfect hidden truth.

The application must **not** claim an exact unknown true state.

Field claims must be based on:

- independent measurements,
- feeder / transformer meters,
- current / voltage channels,
- AMI coverage,
- energy balance,
- calibration residuals,
- hold-out residuals,
- parameter provenance,
- observability score,
- confidence / uncertainty.

Required field wording:

> **Smart Engine makes the distribution model more measurement-consistent and provides a more defensible technical-loss estimate, with explicit confidence and unresolved-state reporting.**

---

## 10. Technical Architecture

### 10.1 Locked V1 architecture

```text
GitHub Pages
      │
      ▼
Browser UI
      │
      ▼
Classic Web Worker
      │
      ▼
Pyodide / CPython WebAssembly
      │
      ├── NumPy
      ├── pandas
      ├── SciPy
      ├── NetworkX
      └── Pandapower
              │
              ▼
          runpp_3ph()
```

No API backend, server-side database or Python installation is required for end users.

### 10.2 Runtime constraints

Pinned runtime:

- Pyodide `0.28.3`
- Pandapower `3.1.2`
- DeepDiff `8.5.0`
- Numba disabled

### 10.3 Separation of responsibilities

#### Pandapower

Responsible for:

- three-phase power flow,
- voltage,
- current,
- P/Q flow,
- phase imbalance,
- transformer loading,
- line loading,
- technical losses.

#### Smart Calibration Engine

Responsible for inference such as:

- timestamp alignment,
- missing AMI reconstruction,
- unknown phase assignment,
- PF estimation,
- selected identifiable network parameters,
- confidence / observability logic.

---

## 11. Canonical Ground Truth Network

```text
GRID / GI
  │
20 kV feeder
  │
Distribution Transformer 20/0.4 kV
  │
LV bus
 ├ JTR-01 → 30 customers
 ├ JTR-02 → 30 customers
 └ JTR-03 → 30 customers
```

Canonical properties:

- 1 source,
- 1 MV feeder,
- 1 × 400 kVA transformer,
- 3 JTR branches,
- 90 customers,
- phase A/B/C,
- residential + small commercial,
- 15-minute profiles,
- 96 intervals/day,
- deterministic seed `61850`.

Ground Truth includes hidden:

- true customer phase,
- true P profile,
- true Q / PF,
- true mapping,
- true service length,
- true network parameters.

---

## 12. Measurement Model

Synthetic measurement channels include:

- source / feeder P,
- source / feeder Q,
- phase P,
- LV-main voltage A/B/C,
- transformer LV current A/B/C,
- transformer loading,
- customer interval energy / AMI,
- technical-loss decomposition for validation.

Each field measurement representation should ultimately support:

- timestamp,
- value,
- unit,
- source,
- uncertainty / standard deviation,
- quality flag,
- provenance.

---

## 13. Data Degradation Engine

Quality presets:

- Good,
- Typical,
- Poor.

Configurable defects:

- meter noise,
- missing AMI,
- unknown phase,
- unknown PF,
- wrong customer mapping,
- service-length uncertainty,
- transformer parameter uncertainty,
- timestamp mismatch.

Degradation must be deterministic for a given seed.

The product must be able to demonstrate:

```text
perfect Ground Truth
        ↓
degraded observability
        ↓
conventional model error increases
```

before Smart Calibration is introduced.

---

## 14. Smart Calibration Engine Requirements

### 14.1 Staged approach

Do not optimize every parameter simultaneously.

V1 sequence:

1. timestamp alignment,
2. missing AMI reconstruction,
3. unknown phase inference,
4. reactive-power physics anchors,
5. unknown PF calibration,
6. identifiable network parameter calibration,
7. full Smart network rebuild,
8. 96-interval three-phase validation.

### 14.2 Locked verified states

Smart Engine must not silently modify verified:

- phase,
- PF,
- topology,
- equipment rating,
- measurement values.

### 14.3 Held parameters

When insufficient independent evidence exists, parameters must be `HELD`.

Current examples:

- suspect individual customer mapping,
- individual SR length,
- transformer `vk/vkr`.

### 14.4 Objective

Smart calibration uses a multi-signal observable objective rather than feeder P alone.

Current P3 objective:

```text
30% source-P residual
45% phase-P residual
25% LV-main voltage residual
```

Feeder Q is used for PF calibration and reported independently.

### 14.5 Calibration / hold-out split

- 64 intervals: calibration
- 32 intervals: hold-out validation

Improvement must not be accepted solely because the calibration set improves.

---

## 15. Technical-Loss Output

Primary output:

```text
Technical loss = transformer + MV + LV/JTR + service/SR
```

Where supported by modeled topology.

The product must report both:

- kW / kWh loss,
- loss percentage.

Percentage alone is insufficient because fixed transformer no-load losses can dominate low-load scenarios.

### 15.1 Unexplained residual

Future field workflow:

```text
Unexplained Residual
= Energy In
- Metered Customer Energy
- Calculated Technical Loss
```

This residual must remain neutral and diagnostic, not automatically labelled non-technical loss or theft.

---

## 16. Confidence, Observability and Provenance

This is the next analytical layer after the current P3 baseline and P0 UX milestone.

### 16.1 Parameter provenance classes

Every important state should be classifiable as:

- `MEASURED`
- `DATABASE`
- `ASSUMED`
- `ESTIMATED`
- `CALIBRATED`
- `HELD / UNRESOLVED`

### 16.2 Confidence inputs

Confidence should derive from observable evidence such as:

- measurement coverage,
- measurement quality,
- topology certainty,
- phase certainty,
- redundancy,
- calibration residual,
- hold-out residual,
- parameter uncertainty,
- number / importance of held states.

### 16.3 Confidence behavior

The system must never display `HIGH CONFIDENCE` merely because a solver converged.

---

# 17. Public UX Strategy

## 17.1 UX objective

The public demo must answer three questions in less than approximately 10 seconds:

1. **Why is spot load easy?**
2. **Why is gardu distribusi difficult?**
3. **What exactly does Smart Engine improve?**

The current public cockpit is the foundation, but the PLN comparison must become **SLD-first**, not card-first.

---

# 18. P0 UX — SLD-First Public Proof

**Priority:** P0  
**Status:** NEXT IMPLEMENTATION MILESTONE  
**Engine impact:** none unless a new visualization data field is required  
**Purpose:** make the PLN engineering thesis understandable visually to both engineers and non-specialists.

## 18.1 Mandatory layout

The `PLN Discussion Demo` must contain two real single-line diagrams side by side.

### Left — Spot Load / Pelanggan TM

Required visual topology:

```text
 SOURCE / GRID
      │
   FEEDER TM
      │
    METER TM
      │
 PELANGGAN TM
```

The diagram must visibly communicate that the path is simple and the important operating state is measured.

### Right — Distribution Transformer / Gardu Distribusi

Required visual topology:

```text
 SOURCE / GRID
      │
   FEEDER TM
      │
  TR GD-01
      │
    LV BUS
  ┌───┼───┐
 JTR1 JTR2 JTR3
 │     │     │
customers · customers · customers
```

The visual must make the increase in network-state complexity obvious without requiring explanatory prose.

## 18.2 Required visual semantics

### State colors

Use one consistent state language across both SLDs:

- **Known / measured** — healthy known-state color
- **Assumed / estimated** — caution state
- **Missing / unknown** — degraded / uncertain state
- **Smart calibrated** — distinctive Smart Engine state
- **Held / unresolved** — neutral guarded state

Exact colors are a UI implementation detail, but status must never rely on color alone; icon, pattern or label must accompany it.

## 18.3 Spot-load UX requirements

The Spot Load SLD must display or expose:

- source/grid,
- MV feeder,
- meter,
- load,
- P/Q known,
- phase known,
- topology known,
- timing known.

Before analysis:

- show `HIGH OBSERVABILITY`.

After analysis:

- show Conventional loss error,
- show Smart loss error,
- show `MINIMAL CORRECTION`,
- state that verified P/Q/phase/topology/timing remain locked.

The UX must not imply Smart Engine is necessary to make an already-good spot-load model work.

## 18.4 Gardu-distribusi UX requirements

The Distribution SLD must expose uncertainty at the network locations where it occurs.

Examples:

- AMI missing at customer nodes,
- unknown phase at customer nodes,
- PF assumed at loads,
- mapping uncertainty at branch/customer relationships,
- parameter uncertainty at transformer / service connections.

The user should be able to see that the problem is **distributed across many downstream states**, not located in the solver itself.

## 18.5 Before → Smart transformation

During Smart Analysis, the gardu SLD should transition visually:

```text
UNKNOWN / ASSUMED STATE
        ↓
measurement-supported calibration
        ↓
CALIBRATED STATE
```

Only actual calibrated states may visually change to the Smart-calibrated status.

Held states must remain visibly held.

## 18.6 Calibration-stage highlighting

When the Smart Calibration pipeline is active, the relevant part of the SLD should be highlighted:

- Timestamp stage → AMI/customer-meter nodes
- Missing AMI → affected customer groups
- Phase inference → customer phase nodes
- PF calibration → load / Q representation
- Network parameter calibration → transformer / identifiable asset
- Physics validation → full energized SLD

This highlight must reflect real engine progress messages rather than a decorative timer.

## 18.7 Result hierarchy

Public result hierarchy must be:

### Level 1 — visual conclusion

```text
SPOT LOAD
Already accurate

GARDU DISTRIBUSI
Accuracy recovered by Smart Calibration
```

### Level 2 — primary technical loss result

Show:

- Conventional loss,
- Smart loss,
- validation reference in synthetic mode,
- absolute loss-error reduction.

### Level 3 — supporting measurements

Show:

- source-P fit,
- phase-P fit,
- voltage fit,
- hold-out validation.

### Level 4 — engineering diagnostics

Keep:

- exact checks,
- calibration trace,
- runtime,
- raw JSON,
- regression phases,

inside the Engineering view or expandable detail.

## 18.8 Plain-language labeling

Primary labels should be understandable without specialist terminology.

Examples:

- `Gardu Distribusi` with technical subtitle `TR GD-01 · 20/0.4 kV`
- `Cabang JTR` with identifier `JTR-01`
- `Pelanggan` with status detail `AMI / Phase / PF`

Engineering terminology can appear as secondary labels or tooltips.

## 18.9 P0 UX acceptance criteria

P0 UX is complete only when all are true:

1. A first-time viewer can visually identify which topology is Spot Load and which is Gardu Distribusi.
2. Both comparison cards use recognizable single-line electrical topology, not generic horizontal boxes.
3. The viewer can identify why Spot Load has high observability without reading a paragraph.
4. The viewer can identify that uncertainty exists downstream of the distribution transformer.
5. Known, unknown, assumed, calibrated and held states are distinguishable.
6. Running Smart Analysis visibly connects calibration stages to the affected SLD elements.
7. The Spot Load remains presented as already accurate / minimally corrected.
8. The Gardu result visibly shows Conventional → Smart improvement.
9. The displayed values are driven by the actual engine payload, not hardcoded demo outcomes.
10. Synthetic Ground Truth remains explicitly labelled validation-only.
11. The public screen contains no statement that SINCAL itself is inherently inaccurate.
12. Engineering/raw diagnostics remain available but do not dominate the public story.
13. Browser CI captures Spot Load/Gardu SLD comparison screenshots for both Typical and Poor scenarios.
14. Existing P0-A through P3 physics regression gates remain unchanged and passing.

---

## 19. Future UX — P1 UX / Interactive Network Intelligence

After P0 UX is accepted, the next visual layer may add:

- clickable transformer/JTR/customer nodes,
- right-side node inspector,
- hover values,
- branch loss intensity,
- branch loading intensity,
- voltage heat state,
- phase imbalance visualization,
- observability overlay,
- measurement provenance overlay,
- before/after network-state comparison,
- time scrubber across the 96 intervals.

These are not required for P0 UX.

---

## 20. Engineering View Requirements

The public UX must not remove engineering traceability.

Engineering view must retain access to:

- P0-A browser physics gate,
- P0-B scale benchmark,
- P1 Ground Truth,
- P2 degradation,
- P3 calibration,
- all mandatory checks,
- exact residual metrics,
- calibration trace,
- held parameters,
- raw JSON diagnostics,
- runtime information.

---

## 21. Browser CI / Quality Gates

Every relevant push should be measurable through GitHub Actions.

Required CI layers:

### Static validation

- JavaScript syntax,
- Python syntax,
- required files / DOM contracts.

### Browser Physics Regression

Chromium headless must:

- load Pyodide,
- import Pandapower,
- execute P3 end-to-end,
- validate Spot Load proof,
- validate Distribution Transformer proof,
- run at least Typical and Poor comparison scenarios,
- fail CI if mandatory P3 gates fail.

### Visual artifacts

Capture at minimum:

- public overview,
- PLN Spot Load vs Gardu proof,
- network SLD,
- calibration pipeline.

### Production smoke

After GitHub Pages deployment, open the public site and verify browser physics boot / expected public cockpit contract.

---

## 22. Validation Gates

### Physics gates

- P0-A: browser `runpp_3ph()` feasibility
- P0-B: 90-customer scale
- P1: 96-interval immutable Ground Truth
- P2: measurable error from degraded observability
- P3: Smart Calibration improves hold-out and technical-loss accuracy

### Product-story gate

The public comparison is not complete merely because P3 passes numerically.

It must clearly demonstrate:

```text
Spot Load
high observability
→ conventional already accurate
→ minimal Smart correction

Gardu Distribusi
low observability
→ conventional loss error
→ Smart reconstruction
→ improved loss accuracy
```

---

## 23. Current Validated Status

As of this PRD version:

```text
P0-A Browser Physics                         PASS
P0-B 90-Customer Browser Scale              PASS
P1 Ground Truth Simulator                   PASS
P2 Data Degradation                         PASS
P3 Smart Calibration — Typical              PASS
P3 Smart Calibration — Poor                 PASS
Spot Load High-Observability Proof          PASS
PLN Spot vs Gardu Numerical Comparison      PASS
Public Cockpit Foundation                   PASS
P0 UX — SLD-First Public Proof              NEXT
P4 Confidence / Observability / Explainability  PLANNED
```

---

## 24. Roadmap

### Completed foundation

1. Browser physics feasibility
2. 90-customer distribution scale
3. Ground Truth simulator
4. Data degradation
5. Conventional baseline
6. Smart Calibration
7. Calibration / hold-out validation
8. Spot-load proof
9. Distribution Poor challenge proof
10. public cockpit foundation
11. browser CI + visual artifacts
12. GitHub Pages deployment

### Immediate next

**P0 UX — SLD-First Public Proof**

Implement the requirements in Section 18 before expanding the analytical feature set.

### After P0 UX

**P4 — Confidence / Observability / Explainability**

Target outputs:

- observability score,
- confidence score,
- parameter provenance,
- measurement coverage,
- unresolved-state impact,
- recommended measurement improvements.

### Later

- SimBench external benchmark
- field-data adapters
- GIS / asset import
- SINCAL / other model-import comparison where source data is available
- time-series scenario management
- field measurement validation workflow
- scalable worker / compute strategies if required.

---

## 25. Definition of Done for the Public Proof Product

The current public-proof product is considered complete enough for external demonstration when:

1. real unbalanced 3-phase physics runs in browser,
2. Spot Load and Gardu Distribusi both have real SLD representations,
3. Spot Load proof demonstrates high-observability stability,
4. Gardu proof demonstrates degradation and recovery,
5. Smart Engine never receives hidden truth during calibration,
6. Conventional → Smart technical-loss improvement is measurable,
7. hold-out validation improves,
8. parameter provenance and held states are visible,
9. claims distinguish synthetic validation from field validation,
10. public UX explains the thesis without requiring raw diagnostics,
11. Engineering view preserves full traceability,
12. GitHub Actions automatically reproduces numerical and visual proof,
13. GitHub Pages production smoke passes,
14. no primary loss result is hardcoded into the UI.

---

## 26. Product Statement

> **Smart Distribution Loss does not make a power-flow solver “smarter.” It makes a poorly observed distribution model more trustworthy by reconstructing only measurement-supported unknown states, then letting real three-phase physics calculate the network and its technical losses.**

For the PLN discussion, the product must make one conclusion visually undeniable:

> **Spot loads are easier because the state is visible. Distribution transformers are harder because many downstream states are hidden. Smart Engine closes that observability gap enough to recover a substantially more accurate technical-loss estimate — while explicitly showing what remains uncertain.**

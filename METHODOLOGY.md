# Methodology

Smart Distribution Loss is an engineering beta for distribution-network loss analysis. Its purpose is not to replace established power-system solvers, but to make the gap between **field data** and the **network model** explicit, testable, and auditable.

## 1. Core principle

A power-flow solver calculates the network model it is given. A numerically converged solution can still be a poor representation of the physical system when topology, phase assignment, conductor data, transformer parameters, AMI timing, meter mapping, or load state are wrong.

This project therefore treats loss analysis as two coupled problems:

1. **physics:** solve the electrical network consistently; and
2. **model/data reconciliation:** determine whether the model and measurements represent the same physical system and timebase.

The public beta uses pandapower `runpp_3ph()` for unbalanced three-phase power-flow calculations.

## 2. Two intentionally different workflows

### Synthetic demonstration path

The synthetic P1-P3 path exists to demonstrate and test the calibration concept under controlled conditions.

- P1 creates deterministic hidden ground truth.
- P2 degrades the observable field view and measurement channels.
- P3 consumes only the degraded view and noisy measurements during calibration.
- 64 of 96 intervals are calibration intervals.
- 32 of 96 intervals are held out for validation.
- Hidden truth is accessed only after smart decisions and the 96 smart power flows are complete.

The staged calibration currently includes bounded operations such as:

- ±15-minute timestamp alignment for flagged AMI streams;
- bounded peer-profile scaling for missing-AMI reconstruction;
- unknown-phase inference against phase measurements;
- reactive-power observability anchors;
- bounded unknown-PF calibration; and
- limited network-parameter calibration where the available measurements make a parameter identifiable.

Parameters that are not sufficiently observable are deliberately held rather than forced to fit. This is important: the objective is not simply to drive residuals toward zero.

### Real Field Mode path

Field Mode is deliberately more conservative. It does **not** run the synthetic auto-calibration routine over user data.

The current field adapter requires complete AMI active-power coverage and constructs the imported radial network directly from the field CSV contract. Each of the 96 fifteen-minute intervals is solved with `runpp_3ph()`.

Technical loss is read from direct pandapower result rows:

- line losses from `res_line_3ph` endpoint power;
- transformer losses from `res_trafo_3ph` endpoint power; and
- bus voltage/loading observability from the corresponding solver results.

Per-asset technical loss is not allocated proportionally from a feeder total.

## 3. Field engineering workflow P4-P13

The field workflow is intentionally evidence-first:

- **P4 — Field operational bridge:** validated imported datasets can become the active source without mixing demo topology into Field Mode.
- **P5 — Real topology & observability:** actual imported radial topology, direct asset losses, loading, and bus voltages.
- **P6 — Activation gate:** invalid, cyclic, disconnected, multi-parent, or otherwise unsupported topology cannot be activated.
- **P7 — Asset intelligence:** deterministic prioritization from direct loss contribution, loading, and endpoint-voltage severity.
- **P8 — Investigation workflow:** worst evidence intervals, related radial route, and manual field checklist.
- **P9 — Measurement reconciliation:** explicit comparison between model quantities and entered field measurements at a selected asset, interval, and side.
- **P10 — Verified correction:** only allow-listed engineering parameters can be changed, with explicit evidence and operator verification, followed by an isolated candidate rerun.
- **P11 — Audit package:** accepted correction state is exported with immutable provenance/fingerprints instead of overwriting source CSV files.
- **P12 — Reproducible replay:** a P11 package can reconstruct and rerun the candidate physics to distinguish reproducible results, numerical drift, and declared engine/provenance drift.
- **P13 — Unexplained energy:** technical loss is frozen from physics before any non-technical residual is calculated.

## 4. Technical loss versus unexplained energy

P13 protects a critical accounting boundary.

For aligned source measurements, the application evaluates:

```text
measured source energy
- metered AMI energy
- frozen technical loss from physics
= unexplained energy
```

The unexplained residual is **not** permitted to automatically:

- increase AMI consumption;
- inflate technical loss;
- modify a conductor or transformer parameter; or
- change topology.

This prevents a flexible mathematical fit from making a real accounting discrepancy disappear into the model.

## 5. What unexplained energy means

Unexplained energy is an **investigation signal**, not proof of electricity theft.

A persistent positive residual can also be caused by, for example:

- meter or CT/PT error;
- timestamp mismatch;
- missing AMI;
- customer/meter mapping errors;
- unmodelled legitimate loads;
- topology or parameter errors;
- data corruption; or
- distributed generation that is not represented correctly.

P13 v1 therefore classifies feeder-level conditions into deterministic operational states such as normal, data-quality suspect, unexplained loss, and field-investigation priority. It does not identify a person or customer as stealing electricity.

Downstream localization requires defensible measurement boundaries. The software does not fabricate branch/customer localization when only feeder-level measurement evidence exists.

## 6. Why this can outperform a basic model in practice

The claim is **not** that pandapower or Smart Distribution Loss contains a universally superior power-flow algorithm to commercial tools such as PSS®SINCAL.

A detailed conventional tool can produce excellent results when its network model and measurements are correct. The practical advantage targeted here is the explicit workflow around the solver:

- enforce a canonical timebase;
- expose data quality and topology failures;
- compare field evidence against model predictions;
- constrain corrections to observable, verified parameters;
- rerun the full three-phase physics after a correction;
- preserve before/after evidence; and
- make the accepted state reproducible and auditable.

In other words, the project improves the **model-to-field reconciliation process**, not the laws of circuit analysis.

## 7. Validation and regression policy

The repository contains browser-based CI gates that exercise the actual Pyodide/pandapower workflow. The complete gate covers the product workflow through P13, including:

- 96-interval field physics;
- radial topology activation rules;
- direct asset observability;
- investigation/reconciliation/correction workflows;
- audit-package integrity and replay;
- technical-loss freeze and unexplained-energy separation;
- constrained viewport safety; and
- warm-engine and independent-MV regression checks.

A green CI run means the tested contracts passed on that commit. It is not a certification of every possible distribution network or a substitute for project-specific engineering validation.

## 8. Reproducibility and provenance

The browser workers pin key runtime versions, including Pyodide and pandapower. Field results expose solver/runtime provenance. Accepted correction packages record fingerprints and can be independently replayed through the browser worker.

Where a runtime does not expose a binary/code hash, the project reports declared engine/provenance identity and does not overstate binary equivalence.

## 9. Scope of the public beta

The public beta is suitable for:

- engineering demonstration;
- education and research;
- controlled dataset experiments;
- methodology review;
- internal engineering prototyping; and
- feedback from utility/power-system practitioners.

It is not represented as a production DMS, billing system, revenue-protection enforcement system, protection-setting tool, switching authority, certified IEC drawing package, or legal proof of electricity theft.

See [ENGINEERING_LIMITATIONS.md](ENGINEERING_LIMITATIONS.md) for the explicit public claim boundary.

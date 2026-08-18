# Engineering Audit — Smart Distribution Loss

## Verdict

Smart Distribution Loss has reached **Public Engineering Beta** maturity.

The repository is stronger than a visual proof of concept: the headline field results come from a real browser-executed three-phase pandapower workflow, the field topology and per-asset observability are derived from imported data, correction candidates are independently rerun before adoption, accepted corrections can be packaged/replayed, and unexplained energy is kept separate from physics-based technical loss.

It is still **not a production DMS/ADMS or certified revenue-protection product**.

## Current maturity

- **Public Engineering Beta:** ready for open technical review and controlled engineering evaluation.
- **Physics transparency:** strong for the supported single-source radial Field Dataset v1 scope.
- **Data/model reconciliation:** strong and explicit.
- **Auditability/reproducibility:** strong for the current P10-P12 correction workflow.
- **Non-technical-loss claim discipline:** explicit after P13.
- **Production utility deployment:** not yet the scope.
- **Formal standards certification:** not claimed.

## Architecture that is now technically defensible

### Real three-phase physics

Field Mode constructs the imported network and executes `pandapower.runpp_3ph()` for all 96 fifteen-minute intervals. Line and transformer technical loss is derived from direct endpoint power in `res_line_3ph` / `res_trafo_3ph`; bus voltage and loading are taken from solver result tables.

Per-asset loss is not proportionally allocated from a feeder total.

### Synthetic calibration is isolated from real Field Mode

The synthetic P1-P3 path remains a controlled methodology demonstration:

- hidden deterministic truth;
- controlled degradation;
- staged smart calibration;
- 64 calibration intervals;
- 32 hold-out validation intervals; and
- hidden truth opened only after smart decisions/physics are complete.

Real imported Field Mode explicitly does **not** apply the synthetic auto-calibration routine. Corrections are operator-visible and evidence-backed.

## Field Mode milestone P4-P13

### P4 — Field operational bridge

Validated field results can become the active operational source without showing synthetic/demo topology as if it were field evidence.

### P5 — Real topology and asset observability

The SLD is generated from imported network IDs. Direct line/transformer loss, loading, endpoint voltage, and bus voltage are available from three-phase solver results.

### P6 — Topology activation gate

Unsupported topology conditions such as cycles, multiple parents, disconnected sections, invalid references, and unreachable customers are explicit blockers rather than silently repaired.

### P7 — Deterministic asset intelligence

Line/transformer priority is derived from visible loss, loading, and endpoint-voltage evidence. Bus technical loss is not fabricated.

### P8 — Field investigation workflow

The selected real asset exposes worst loss/loading/voltage intervals, validated upstream/downstream route context, and a manual verification checklist.

### P9 — Measurement reconciliation

An operator can reconcile model loading/voltage with an exact field measurement at a selected asset, interval, and side. Reconciliation tolerances are cockpit rules, not protection-setting standards.

### P10 — Verified correction and candidate rerun

Only allow-listed engineering parameters can be revised. A correction needs explicit evidence and verification, increments a versioned draft, and is tested through an isolated fresh field solver. A stale candidate cannot be adopted.

### P11 — Correction package and audit trail

Accepted correction state can be exported without overwriting source CSV files. The package records provenance, correction entries, evidence, before/after metrics, and integrity fingerprints.

### P12 — Reproducible replay

A valid P11 package can reconstruct the accepted dataset and execute the three-phase physics again. The replay distinguishes reproducible physics from numerical drift and declared engine/provenance drift.

### P13 — Unexplained-energy separation

Technical loss is frozen from physics before the application evaluates:

```text
measured source - metered AMI - frozen technical loss = unexplained energy
```

The residual cannot be silently absorbed into AMI, technical loss, topology, or network parameters. A persistent positive residual is an NTL investigation signal, **not proof of electricity theft**.

P13 v1 intentionally remains feeder-level without downstream boundary measurements.

## Regression status

The repository now has an automated browser physics gate, not only a frontend build check.

The current chain exercises:

- data/input workflow;
- operator hierarchy and decisions;
- operational SLD;
- field topology activation;
- P7 asset intelligence;
- P8 investigation;
- P9 reconciliation;
- P10 correction rerun/adoption;
- P11 package integrity;
- P12 reproducible replay;
- P13 technical-loss freeze / unexplained residual;
- warm browser physics benchmark; and
- independent-MV/data-contract regression.

P14 adds a separate repository-level release-readiness contract for license, public documentation, example data, attribution, metadata, and prerelease automation.

## Public-release readiness P14

The public beta now includes:

- MIT project license;
- license copy inside the static artifact;
- third-party attribution in source and static artifact;
- public README that distinguishes solver accuracy from model/data accuracy;
- explicit methodology document;
- explicit engineering limitations and claim boundary;
- contribution and security policies;
- deterministic Field Dataset v1 example generator/templates;
- `v0.4.0-beta.1` semantic prerelease version;
- guarded GitHub prerelease workflow.

## What is intentionally not claimed

The public beta must not be presented as:

- universally more accurate than PSS®SINCAL, PowerFactory, ETAP, CYME, or another established solver;
- production DMS/ADMS;
- revenue/billing authority;
- protection-setting or switching authority;
- customer-level electricity-theft proof;
- formal IEC symbol-library certification; or
- validated utility-scale state estimation for arbitrary meshed/multi-source/DER networks.

## Remaining engineering work before production-grade utility deployment

1. **External benchmark suite** — canonical public feeder/network regression (for example selected SimBench cases) with documented model translation and numerical tolerances.
2. **Boundary-meter localization** — extend P13 only when real downstream measurement boundaries make localization observable.
3. **Larger-network performance** — quantify browser limits and decide when a native/server solver is required.
4. **Mesh/multi-source/DER modeling** — design explicit topology/state semantics rather than weakening the current radial gate.
5. **Formal utility standards review** — symbol, naming, reference designation, data governance, and report requirements for a target utility.
6. **Production data governance/security** — organizational deployment model, privacy classification, supply-chain controls, monitoring, backup, and change management.
7. **Independent field validation** — compare the supported model against authorized real feeder measurements before operational or commercial claims.

## Public positioning

A defensible one-sentence description is:

> Smart Distribution Loss is a browser-based public engineering beta that connects field measurements to a three-phase distribution model, makes discrepancies visible, supports evidence-backed correction and reproducible rerun, and keeps unexplained energy separate from technical loss.

That positioning is intentionally stronger than “dashboard demo” and intentionally narrower than “production utility loss-management system.”

# Smart Distribution Loss

**Public Engineering Beta · v0.4.0-beta.1**

[![Quality & Pages](https://github.com/masarray/smart-distribution-loss/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/masarray/smart-distribution-loss/actions/workflows/deploy-pages.yml)
[![Browser Physics Gate](https://github.com/masarray/smart-distribution-loss/actions/workflows/browser-physics.yml/badge.svg)](https://github.com/masarray/smart-distribution-loss/actions/workflows/browser-physics.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Release: beta](https://img.shields.io/badge/release-v0.4.0--beta.1-blue.svg)](RELEASE_NOTES.md)

Browser-based three-phase distribution-loss engineering with **field-data reconciliation, evidence-backed correction, reproducible audit replay, and explicit separation of technical loss from unexplained energy**.

> **Maturity:** public engineering beta / open-source proof of concept. It is not a production DMS, billing engine, protection-setting authority, switching authority, or certified theft-detection system.

## Why this project exists

A power-flow solver calculates the network model it is given. If topology, phase assignment, conductor data, transformer parameters, AMI timing, meter mapping, or load state do not match the physical network, a perfectly converged calculation can still represent the wrong system.

Smart Distribution Loss focuses on that **model-to-field gap**.

It does not claim that pandapower contains a universally better power-flow algorithm than established engineering tools such as **PSS®SINCAL**, ETAP, DIgSILENT PowerFactory, or CYME. A detailed conventional tool can be excellent when its model and measurements are correct.

The differentiator here is the workflow around the solver:

```text
field data
→ validate topology and timebase
→ solve three-phase physics
→ expose model/measurement residuals
→ investigate evidence
→ apply only explicit verified corrections
→ rerun full physics
→ compare before/after
→ preserve an audit package
→ replay for reproducibility
→ keep unexplained energy separate from technical loss
```

See [METHODOLOGY.md](METHODOLOGY.md) for the engineering rationale.

## What is actually calculated

The browser workers use **pandapower `runpp_3ph()`** through Pyodide/WebAssembly for unbalanced three-phase calculations.

For Field Mode, each supported dataset is solved over **96 × 15-minute intervals**. Technical loss comes from direct solver result rows:

- line endpoint power from `res_line_3ph`;
- transformer endpoint power from `res_trafo_3ph`;
- bus voltage from `res_bus_3ph`; and
- loading from the corresponding three-phase result tables.

Per-asset technical loss is **not** fabricated by proportional allocation from a feeder total.

## Two intentionally separate modes

### 1. Synthetic smart-calibration demonstration

The P1-P3 demonstration creates deterministic hidden ground truth, degrades the observable field view, then tests a staged physics-informed calibration workflow.

Current stages include:

- ±15-minute timestamp alignment for flagged AMI streams;
- bounded missing-AMI reconstruction;
- unknown-phase inference;
- reactive-power observability anchors;
- bounded unknown-PF calibration;
- limited network-parameter calibration where measurements support identifiability; and
- a rebuilt three-phase network followed by 96 fresh power flows.

Calibration uses **64 of 96 intervals**. The remaining **32 intervals are hold-out validation**. Hidden truth is accessed only after smart decisions and the smart power flows are complete.

This path demonstrates methodology. It is not silently applied to imported Field Mode data.

### 2. Real Field Mode

Real Field Mode is deliberately conservative.

The current field adapter declares:

```text
calibration: none; field physics requires complete AMI P coverage
```

Imported data is validated, transformed into the supported radial network contract, and solved directly. Corrections happen only through the explicit P9/P10 evidence workflow.

## Field workflow P4-P13

| Phase | Purpose |
| --- | --- |
| P4 | Activate validated imported field data without mixing demo topology into the operational source. |
| P5 | Build the real imported radial SLD and direct asset/bus observability. |
| P6 | Hard activation gate for invalid, cyclic, disconnected, multi-parent, or unreachable topology. |
| P7 | Deterministic asset priority from direct loss contribution, loading, and endpoint-voltage severity. |
| P8 | Evidence-backed investigation: worst intervals, radial route, downstream scope, manual checklist. |
| P9 | Model-vs-field reconciliation at an exact asset, interval, and FROM/TO side. |
| P10 | Allow-listed, evidence-backed correction draft → isolated candidate rerun → explicit adoption. |
| P11 | Immutable correction package, fingerprints, corrected-network export, audit trail. |
| P12 | Reconstruct and rerun accepted physics; classify reproducible, numerical drift, or declared engine drift. |
| **P13** | Freeze technical loss from physics, then calculate feeder-level unexplained energy separately. |

## Technical loss is not unexplained energy

P13 protects this accounting boundary:

```text
measured source energy
- metered AMI energy
- frozen technical loss from physics
= unexplained energy
```

The residual is **not allowed** to automatically increase AMI, inflate technical loss, rewrite topology, or tune network parameters until the balance looks perfect.

A persistent positive residual can be consistent with non-technical loss, but it is **not proof of electricity theft**. It can also result from metering error, CT/PT scaling, time mismatch, missing AMI, mapping errors, unmodelled legitimate loads, topology/parameter errors, or unrepresented DER.

P13 v1 therefore reports investigation states such as `DATA_QUALITY_SUSPECT`, `UNEXPLAINED_LOSS`, and `FIELD_INVESTIGATION_PRIORITY`. It does not accuse a customer or person of theft.

Downstream localization requires defensible boundary measurements. Feeder-only data does not magically produce customer-level attribution.

## What this beta can claim

The current public beta can defensibly demonstrate:

- real browser-based three-phase power flow;
- deterministic 96-interval field calculation;
- radial-topology activation gates;
- direct line/transformer technical-loss observability;
- evidence-backed field investigation and reconciliation;
- explicit verified candidate corrections followed by a fresh solver run;
- non-destructive audit package export;
- reproducible replay with drift classification;
- technical-loss / unexplained-energy separation; and
- end-to-end browser regression in CI.

## What this beta does **not** claim

It is not currently represented as:

- a production DMS/ADMS;
- universally more accurate than PSS®SINCAL or another commercial solver;
- a billing or revenue-recovery authority;
- a protection coordination/setting tool;
- a switching authority;
- an IEC-certified construction drawing package;
- a guaranteed theft detector; or
- a validated solution for every meshed, multi-source, DER-rich, or utility-scale network.

Read the full boundary in [ENGINEERING_LIMITATIONS.md](ENGINEERING_LIMITATIONS.md).

## Field Dataset v1

Field Mode consumes four CSV files together:

```text
network.csv
customers.csv
measurements.csv
ami.csv
```

The current contract uses one canonical day:

```text
96 intervals × 15 minutes
00:00 → 23:45
```

The network must satisfy the supported single-source radial topology rules. The field adapter requires complete AMI active-power coverage for all configured customer meters.

A deterministic synthetic example is included in [`examples/field-v1/`](examples/field-v1/).

Generate the complete example source-measurement and AMI files with:

```bash
node examples/field-v1/generate-example.mjs
```

Then load the generated `measurements.csv` and `ami.csv` together with the included `network.csv` and `customers.csv`.

## Local development

Requirements:

- Node.js 22+
- npm
- internet access for first-time browser physics runtime initialization

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm run build
npm run security:audit
npm run release:check
```

## Browser runtime

The public beta is a static Vite + React application. No application backend, account system, telemetry bridge, or SSR server is required for normal operation.

The Field Mode worker currently pins:

- Pyodide `0.28.3`;
- pandapower `3.1.2`.

The first physics run downloads/initializes the browser scientific stack and is therefore slower than later cache-assisted runs.

## CI / regression

Two primary GitHub Actions gates protect `main`:

### Quality & GitHub Pages

- install dependencies;
- high-severity npm security audit;
- brand hygiene;
- lint;
- typecheck/build;
- public-release contract; and
- static artifact verification.

### Browser Physics Gate

The browser gate executes the real static build through Chromium/Pyodide/pandapower and exercises the workflow through P13, followed by warm-engine and independent-MV regression checks.

A green badge means those deterministic contracts passed on the tested commit. It is **not** a certification of every real-world network.

## GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. On `main`, the workflow builds the static application with the correct repository sub-path and deploys through GitHub Pages when Pages is configured to use GitHub Actions.

## Public beta release

`v0.4.0-beta.1` is intentionally published as a **GitHub prerelease**, not a stable production release.

Release notes: [RELEASE_NOTES.md](RELEASE_NOTES.md)

## Project documents

- [Methodology](METHODOLOGY.md)
- [Engineering limitations](ENGINEERING_LIMITATIONS.md)
- [Engineering audit](AUDIT.md)
- [Contribution guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Release notes](RELEASE_NOTES.md)

## Privacy / data handling

Normal engineering processing is browser-local. Nevertheless, users remain responsible for organizational policy, data classification, browser security, and authorization before loading real utility/customer datasets.

Do not publish confidential AMI, credentials, proprietary network data, or customer-identifying information in GitHub issues or example fixtures.

## License

Smart Distribution Loss project source is released under the **MIT License**. See [LICENSE](LICENSE).

Third-party components remain under their own upstream terms. The principal runtime notices are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and the static site artifact also carries `LICENSE.txt` and `THIRD_PARTY_NOTICES.txt`.

---

**Engineering principle:** a good solver still needs a defensible model. Smart Distribution Loss is built to keep the model, field evidence, correction, physics rerun, and unexplained residual connected instead of hiding disagreement behind a single loss percentage.

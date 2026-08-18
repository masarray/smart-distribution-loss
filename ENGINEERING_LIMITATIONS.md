# Engineering Limitations and Public Claim Boundary

Smart Distribution Loss v0.4.0-beta.1 is a **Public Engineering Beta**. The project is intentionally transparent about what has and has not been demonstrated.

## Appropriate claims

The current repository supports the following claims:

- browser-based unbalanced three-phase power flow using pandapower `runpp_3ph()`;
- deterministic 96 × 15-minute field calculations for the supported Field Dataset v1 contract;
- radial-topology validation before Field Mode activation;
- direct line/transformer technical-loss observability from solver result rows;
- deterministic asset prioritization and evidence-backed investigation workflow;
- explicit model-versus-field measurement reconciliation;
- allow-listed, evidence-backed correction candidates followed by a fresh physics rerun;
- non-destructive audit package export and reproducible replay;
- explicit separation of physics-based technical loss from unexplained energy; and
- browser CI regression over the public engineering workflow.

## Claims that must not be made

Do **not** describe the current beta as:

- a production Distribution Management System (DMS/ADMS);
- universally more accurate than PSS®SINCAL, ETAP, DIgSILENT PowerFactory, CYME, or another commercial solver;
- a certified billing/revenue-protection calculation system;
- a protection coordination or relay-setting authority;
- a switching/operational authority;
- an IEC-certified drawing or symbol package;
- a guaranteed detector of electricity theft;
- a forensic attribution system that identifies a person/customer as stealing energy; or
- validated for every topology, network size, DER condition, meshed network, or utility data model.

## Current topology scope

Field Dataset v1 supports a single-source **radial** network. The activation gate rejects unsupported conditions such as cycles, disconnected sections, multiple parents, invalid element/bus references, or unreachable customers.

Meshed distribution operation, normally-open tie switching, multi-source operation, state estimation across uncertain switch status, and general DER dispatch are outside the current field-v1 scope.

## Data requirements

Field Mode expects a normalized four-file dataset:

- `network.csv`
- `customers.csv`
- `measurements.csv`
- `ami.csv`

The current field adapter requires complete AMI active-power coverage for all customer meters over the 96 canonical intervals. Reactive power can be supplied by AMI or derived from the customer PF fallback supported by the schema.

Source active-power measurements are required for the strongest field reconciliation and P13 unexplained-energy workflow.

## Calibration boundary

The synthetic P1-P3 demonstration contains staged smart calibration to prove the methodology under controlled degradation and hidden-truth validation.

Real Field Mode does **not** silently run that synthetic auto-calibration routine against imported user data. Field corrections are explicit, allow-listed, evidence-backed, versioned, independently rerun, and manually adopted.

## Unexplained energy and theft

P13 calculates an unexplained-energy residual only after technical loss has been frozen from the solved network physics.

A positive unexplained residual can be consistent with non-technical loss, but it is not proof of electricity theft. Other plausible causes include data quality, metering, mapping, timing, topology, parameter, and legitimate unmodelled-load issues.

P13 v1 is feeder-level unless defensible downstream boundary measurements exist. It does not invent customer-level localization from feeder-only data.

## Numerical and model limitations

A converged power-flow solution is not proof that the underlying model is correct. Results remain sensitive to:

- conductor impedance and length;
- transformer parameters and vector group;
- customer-to-bus mapping;
- customer phase assignment;
- load and reactive-power data;
- measurement timing and scaling;
- source strength assumptions; and
- topology state.

The application exposes provenance and reconciliation evidence to help engineers review these inputs; it cannot guarantee their truth.

## Performance scope

The solver runs in-browser through Pyodide/WebAssembly. The first calculation downloads and initializes the scientific stack, so startup is slower than a native or server-resident engine. The beta is optimized for controlled engineering datasets, not yet for utility-scale feeders with thousands of continuously updated nodes.

## Standards boundary

The single-line diagram follows conventional electrical-engineering intent and uses IEC-style visual semantics, but the project does not claim reproduction of a licensed IEC 60617 symbol library or formal compliance with a utility's construction-drawing standard.

## Safety and governance

Engineering results should be independently reviewed before they influence:

- network operation;
- capital investment;
- billing or revenue recovery;
- customer allegations;
- protection settings;
- switching instructions; or
- regulatory/legal decisions.

The software is distributed under the MIT License without warranty. Project-specific engineering responsibility remains with the user and the authorized organization.

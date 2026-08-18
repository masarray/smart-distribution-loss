# Smart Distribution Loss v0.4.0-beta.1

**Public Engineering Beta**

This release packages the P1-P13 engineering workflow for public technical review. It is an open-source proof-of-concept / engineering beta, not a production DMS, billing system, protection-setting tool, switching authority, or certified theft-detection product.

## What is included

### Three-phase browser physics

- pandapower `runpp_3ph()` executed in-browser through Pyodide/WebAssembly;
- deterministic 96 × 15-minute field calculations;
- direct line/transformer technical-loss attribution from solver result rows;
- bus voltage and loading observability;
- pinned browser runtime provenance.

### Synthetic smart-calibration demonstration

- deterministic hidden ground truth;
- controlled degradation and measurement-noise scenarios;
- timestamp alignment;
- bounded missing-AMI reconstruction;
- unknown-phase inference;
- reactive-power/PF calibration;
- limited identifiable network-parameter calibration;
- 64 calibration + 32 hold-out validation intervals.

The synthetic path is intentionally separate from real Field Mode.

### Real Field Mode P4-P13

- **P4:** operational bridge from validated imported CSV data;
- **P5:** real imported radial topology + direct asset/bus observability;
- **P6:** hard topology activation gate and navigation;
- **P7:** deterministic asset prioritization;
- **P8:** evidence-backed investigation workflow;
- **P9:** interval/side-specific field measurement reconciliation;
- **P10:** explicit verified correction candidates and isolated rerun;
- **P11:** immutable correction package and audit trail;
- **P12:** reproducible physics replay and drift classification;
- **P13:** technical-loss freeze followed by unexplained-energy intelligence.

### Non-technical-loss safety boundary

P13 uses:

```text
measured source - metered AMI - frozen physics technical loss = unexplained energy
```

Unexplained energy is not automatically corrected away and is not presented as proof of electricity theft. P13 v1 remains feeder-level unless defensible downstream boundary metering exists.

## Public-release hardening in P14

- MIT project license;
- third-party attribution index included in source and static site artifact;
- rewritten public README;
- methodology and explicit engineering limitations;
- contribution and security policies;
- deterministic Field Dataset v1 example files;
- repository-level public-release CI contract;
- public-beta semantic versioning;
- automatic prerelease workflow after the tested P14 merge.

## Validation

The release candidate must pass, on the same final commit:

- lint;
- TypeScript/build gate;
- high-severity npm security audit;
- P14 public-release contract;
- complete Browser Physics Gate through P13;
- warm browser physics benchmark; and
- independent-MV regression.

## Known limitations

See [ENGINEERING_LIMITATIONS.md](ENGINEERING_LIMITATIONS.md). Important current limits include:

- single-source radial Field Dataset v1;
- no production utility-scale performance claim;
- no universal accuracy claim against commercial power-system solvers;
- no customer-level theft conclusion;
- no formal IEC drawing certification; and
- project-specific engineering review remains required before operational, billing, regulatory, or legal use.

## License

Project source: MIT.

Third-party runtime components remain under their own upstream licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

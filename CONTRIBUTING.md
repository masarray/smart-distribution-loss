# Contributing

Contributions are welcome, especially reproducible engineering test cases, field-data contract improvements, regression tests, documentation corrections, and carefully scoped UX improvements.

## Engineering principles

Please preserve these project boundaries:

1. Do not fabricate topology, per-asset technical loss, or customer-level theft conclusions.
2. Keep Field Mode physics traceable to direct solver results.
3. Do not absorb unexplained energy into technical loss or customer AMI automatically.
4. Keep correction candidates explicit, evidence-backed, versioned, and independently rerun before adoption.
5. Preserve radial-topology activation gates unless a future mesh/multi-source model is implemented explicitly and tested.
6. Keep operator-facing guidance deterministic and evidence-based.
7. Do not weaken existing P1-P13 regression contracts to make a new feature pass.

## Development setup

Requirements:

- Node.js 22+
- npm
- internet access for the first browser physics run, because Pyodide/pandapower are loaded at runtime

```bash
npm install
npm run check
npm run dev
```

## Before opening a pull request

Run:

```bash
npm run lint
npm run build
npm run security:audit
node tests/p14-public-release-ci.mjs
```

Changes that touch the physics engine, field workflow, cockpit, dataset contract, or regression tests should also pass the full **Browser Physics Gate** in GitHub Actions.

## Pull-request expectations

A useful PR should explain:

- the engineering problem being solved;
- the exact files/contracts changed;
- whether physics equations or only derived intelligence/UI are affected;
- how provenance and safety boundaries are preserved; and
- what regression proves the change.

If a change alters a threshold, score, tolerance, or engineering classification, make the new rule visible in code/UI and add a deterministic test.

## Data and privacy

Do not commit confidential utility datasets, customer-identifying AMI, credentials, API keys, or proprietary drawings. Public fixtures should be synthetic or explicitly authorized for redistribution.

## Claim discipline

Please read [ENGINEERING_LIMITATIONS.md](ENGINEERING_LIMITATIONS.md) before changing public wording. Avoid claims that the project is universally more accurate than commercial solvers or that unexplained energy proves electricity theft.

# Field Dataset v1 example

This directory provides a small synthetic radial feeder example for the public beta. It contains no real customer or utility data.

## Files

- `network.csv` — single source, one MV line, one distribution transformer, two LV branches;
- `customers.csv` — three synthetic customers/meters on phases A/B/C;
- `measurements.template.csv` — source-measurement header + one illustrative row;
- `ami.template.csv` — AMI header + one illustrative row;
- `generate-example.mjs` — deterministically generates complete 96-interval `measurements.csv` and `ami.csv` files beside the templates.

## Generate the complete example

From the repository root:

```bash
node examples/field-v1/generate-example.mjs
```

Then load these four files together in **Kelola dataset**:

```text
examples/field-v1/network.csv
examples/field-v1/customers.csv
examples/field-v1/measurements.csv
examples/field-v1/ami.csv
```

The generated day has 96 fifteen-minute intervals and GOOD quality flags. Source active-power measurements are intentionally generated from the same synthetic load shape with a small independent margin so users can exercise source reconciliation and P13 unexplained-energy logic.

## Important

The example is for software/methodology evaluation only. Its conductor, transformer, load, and source values are synthetic and must not be reused as engineering defaults for a real feeder.

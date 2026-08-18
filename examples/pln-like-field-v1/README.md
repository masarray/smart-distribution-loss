# PLN-like Urban Feeder Sample

This built-in sample is a **synthetic/anonymized engineering dataset** designed to make the Smart Distribution Loss Field Mode flow immediately recognizable to Indonesian distribution engineers. It is not operational PLN data and it is not presented as an official PLN export format.

## Electrical flow represented

```text
GI / 20 kV source
→ Penyulang 20 kV
→ JTM sections
→ Gardu Distribusi 20/0.4 kV
→ aggregated LV AMI loads

and

20 kV feeder bus
→ pelanggan TM three-phase (ABC)
```

The sample contains:

- one 20 kV source representing an outgoing feeder from a GI;
- five radial JTM sections using two representative parameter sets;
- four distribution transformers: 400, 630, 630, and 1000 kVA;
- four LV load groups represented by phase A/B/C AMI aggregation;
- two three-phase medium-voltage customers using `phase=ABC`;
- fourteen AMI meter streams;
- 96 intervals at 15-minute resolution for one 24-hour day; and
- feeder-source SCADA-style P, Q, V, and I measurements.

## Files

The Dataset Manager generates the same four files expected from a field import:

```text
network.csv
customers.csv
measurements.csv
ami.csv
```

Use **Dataset → Muat contoh PLN** to generate and import the four CSV files directly in the browser. Use **Unduh 4 CSV** to save the exact generated files and use them as a mapping reference for a real feeder dataset.

## Mapping to utility data

| Application CSV | Typical source data |
| --- | --- |
| `network.csv` | feeder/GIS/asset register, conductor and cable parameters, transformer nameplate/test data, source short-circuit parameters |
| `customers.csv` | customer or aggregate-load mapping to electrical bus, phase, meter ID, contract kVA, PF fallback |
| `ami.csv` | AMI/load-profile active and reactive power at 15-minute intervals |
| `measurements.csv` | synchronized feeder/GI/SCADA/historian P-Q-V-I measurements |

## Multi-phase meter convention

Field Dataset v1 accepts `A`, `B`, `C`, `AB`, `BC`, `CA`, and `ABC`.

For a multi-phase row, `p_kw` and `q_kvar` are interpreted as the **total meter value** and divided evenly over the declared phases before `pandapower.runpp_3ph()` is executed. This is appropriate for a balanced three-phase aggregate such as the included TM examples. When detailed phase-by-phase measurements are available and unbalance is important, represent the measurements at the required phase resolution rather than relying on the balanced split.

## Why the numbers are not random

The load profiles are deterministic and use different daily shapes for residential, commercial, office, and industrial demand. Source P/Q/V/I are derived from the aggregate time-series with a plausible feeder-loss margin and small deterministic measurement variation. A few AMI rows are marked `SUSPECT` to demonstrate data-quality visibility without creating missing active-power coverage.

The browser physics result remains authoritative for technical loss: line and transformer losses are calculated from the imported network and AMI through the three-phase solver. The generated source measurement is used as field evidence/residual reference and is not used to force the calculated technical loss to match a predetermined percentage.

# Smart Distribution Loss — P0-A

Browser-only feasibility spike for an open-source distribution-loss intelligence platform.

## What this proves

This spike tests whether a static GitHub Pages application can run:

- CPython through Pyodide/WebAssembly
- Pandapower
- unbalanced three-phase `runpp_3ph()`
- transformer + LV line + asymmetric load
- technical-loss extraction
- repeated solves needed by a future calibration optimizer

All calculation happens inside the **user's browser Web Worker**. There is no Python backend.

## Runtime pins

- Pyodide `0.28.3`
- Pandapower `3.1.2`
- Numba disabled

These versions are intentionally pinned for dependency compatibility during P0-A.

## Run locally

A local HTTP server is required because module workers do not run correctly from `file://` URLs.

Windows PowerShell:

```powershell
.\run-local.ps1
```

Or:

```bash
python -m http.server 8000 --directory web
```

Then open:

```text
http://localhost:8000
```

The first run downloads Pyodide and Python packages, so it needs internet access.

## GitHub Pages

The included workflow deploys the `web/` directory on pushes to `main`.

Repository Settings → Pages should use **GitHub Actions** as the source.

## P0-A gate

Click **Initialize & Run P0-A**. Do not proceed to the larger product demo until the result is `PASS` in a real Chrome/Edge browser.

See `docs/P0A-GATE.md`.

## Scope intentionally excluded

- React cockpit
- 90-customer synthetic network
- smart load estimation
- phase estimation
- SciPy calibration optimizer
- time series
- utility data import

Those belong after this physics gate passes.

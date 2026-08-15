# Smart Distribution Loss

Open-source engineering proof of concept for **distribution-network technical-loss estimation** using:

- three-phase physics with Pandapower `runpp_3ph()` executed in the browser through Pyodide;
- deterministic synthetic Ground Truth and degraded field-data scenarios;
- physics-informed staged calibration;
- hold-out validation, residual tracking, engineering gates, and parameter provenance;
- a single-line-diagram-centric engineering cockpit.

The application is a **fully static Vite + React site**. No site-builder runtime, editor metadata, telemetry bridge, SSR server, or proprietary backend is required.

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run lint
npm run build
npm run preview
```

## GitHub Pages

A deployment workflow is included at `.github/workflows/deploy-pages.yml`.

1. Push the project to a GitHub repository whose default branch is `main`.
2. Open **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` or run the workflow manually from the **Actions** tab.

The Vite base path is detected automatically from `GITHUB_REPOSITORY` during GitHub Actions builds, so project sites such as `https://USER.github.io/REPO/` work without hard-coding the repository name.

For a custom domain or other hosting path, override it at build time:

```bash
VITE_BASE_PATH=/ npm run build
```

or, for a subfolder:

```bash
VITE_BASE_PATH=/my-subfolder/ npm run build
```

## Static browser physics

The worker entry point is `public/sdl-worker.js`. It loads Pyodide from jsDelivr and installs the pinned browser-compatible Pandapower stack at runtime. Python engine sources are under `public/engine/`.

Because the physics stack is downloaded on first run, the first simulation requires internet access and is slower than subsequent browser-cache-assisted runs.

## Single-line diagram convention

The cockpit SLD is arranged as a conventional upstream-to-downstream utility diagram and uses electrical schematic symbols and object labels aligned with the intent of IEC 60617 / IEC 61082. It is an engineering UI representation, not a licensed IEC symbol-library reproduction or a construction drawing.

## License

Choose and add the project license before public release. The application includes Pandapower as a runtime-installed dependency; review all dependency licenses and attribution requirements before distribution.

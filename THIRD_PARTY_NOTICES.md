# Third-Party Notices

Smart Distribution Loss is licensed under the project-level [MIT License](LICENSE). Third-party software remains under its own license terms.

This file is an attribution index for the major runtime components used by the public beta. It is not intended to replace the license files shipped by upstream projects or package managers.

## Browser physics runtime

| Component | Version used by this project | Role | Upstream license |
| --- | --- | --- | --- |
| Pyodide | 0.28.3 | CPython/WebAssembly runtime in the browser | Mozilla Public License 2.0 |
| pandapower | 3.1.2 | three-phase distribution-network power flow (`runpp_3ph`) | BSD 3-Clause |

`public/field-worker.js` pins these versions for Field Mode. The synthetic worker uses the same browser-Python approach. Pyodide and pandapower are loaded/installed at runtime and are not relicensed by this project.

Additional Python packages are loaded by Pyodide or installed with `micropip` as required by pandapower and the browser adapter. Their own upstream license terms apply. Redistributors should preserve the notices required by every dependency they bundle or mirror.

## JavaScript / UI runtime

The application also depends on open-source JavaScript libraries declared in `package.json`, including:

- React and React DOM — MIT;
- Radix UI primitives — MIT;
- Recharts — MIT;
- Lucide — ISC, with portions derived from Feather Icons under MIT;
- clsx — MIT;
- tailwind-merge — MIT;
- class-variance-authority — MIT.

Build-time tooling such as Vite, TypeScript, ESLint, Tailwind CSS and related plugins remains under each upstream project's own license.

## Upstream references

- Pyodide: https://github.com/pyodide/pyodide
- pandapower: https://github.com/e2nIEE/pandapower
- React: https://github.com/facebook/react
- Radix UI: https://github.com/radix-ui/primitives
- Recharts: https://github.com/recharts/recharts
- Lucide: https://github.com/lucide-icons/lucide
- clsx: https://github.com/lukeed/clsx
- tailwind-merge: https://github.com/dcastil/tailwind-merge
- class-variance-authority: https://github.com/joe-bell/cva

## Distribution note

The GitHub repository is the canonical source distribution. Static site artifacts include `LICENSE.txt` and `THIRD_PARTY_NOTICES.txt` so the public browser build carries the project license and the principal third-party attribution index.

Before redistributing a modified offline bundle, vendored dependency mirror, desktop wrapper, or commercial package, review the exact dependency versions in that build and retain all notices required by their licenses.

/* Smart Distribution Loss P0-A browser physics worker.
 * Classic Worker is intentional: Python's local http.server on Windows may serve
 * .mjs as text/plain, which prevents module workers from starting. A normal .js
 * worker works both locally and on GitHub Pages.
 */

const PYODIDE_VERSION = '0.28.3';
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PANDAPOWER_PIN = 'pandapower==3.1.2';
const DEEPDIFF_PIN = 'deepdiff==8.5.0';
const GEOJSON_PIN = 'geojson==3.2.0';
const ORDERLY_SET_PIN = 'orderly-set==5.4.1';

let pyodide = null;
let initMs = null;
let engineSource = null;
let runtimeScriptLoaded = false;

function progress(percent, label, detail = '') {
  self.postMessage({ type: 'progress', percent, label, detail });
}

function loadPyodideRuntimeScript() {
  if (runtimeScriptLoaded) return;
  progress(5, 'Loading Pyodide runtime script', `Pyodide ${PYODIDE_VERSION}`);
  importScripts(`${PYODIDE_INDEX}pyodide.js`);
  if (typeof self.loadPyodide !== 'function') {
    throw new Error('Pyodide runtime loaded but loadPyodide() is unavailable.');
  }
  runtimeScriptLoaded = true;
}

async function loadEngineSource() {
  if (engineSource) return engineSource;
  const url = new URL('./engine/p0a_engine.py', self.location.href);
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Could not load Python engine: HTTP ${response.status} (${url.href})`);
  }
  engineSource = await response.text();
  return engineSource;
}

async function initialize() {
  if (pyodide) return;
  const started = performance.now();

  loadPyodideRuntimeScript();

  progress(10, 'Initializing Pyodide', 'CPython / WebAssembly runtime');
  pyodide = await self.loadPyodide({ indexURL: PYODIDE_INDEX });

  progress(24, 'Loading scientific stack', 'NumPy · pandas · SciPy · NetworkX · lxml');
  await pyodide.loadPackage([
    'micropip',
    'numpy',
    'pandas',
    'scipy',
    'networkx',
    'lxml',
    'packaging',
    'tqdm',
    'typing-extensions',
  ]);

  const micropip = pyodide.pyimport('micropip');
  try {
    // pandapower 3.1.2 declares DeepDiff without an upper bound. Newer DeepDiff
    // releases depend on cachebox, a Rust extension that has no Pyodide/WASM wheel.
    // P0-A only needs pandapower's modelling + runpp_3ph path, so install the
    // browser-compatible dependency set explicitly and then install pandapower
    // without re-resolving its full PyPI dependency graph.
    progress(40, 'Installing browser-safe dependencies', `${DEEPDIFF_PIN} · ${GEOJSON_PIN}`);
    await micropip.install([
      ORDERLY_SET_PIN,
      DEEPDIFF_PIN,
      GEOJSON_PIN,
    ], { keep_going: false });

    progress(54, 'Installing Pandapower', `${PANDAPOWER_PIN} · dependency graph pinned for Pyodide`);
    await micropip.install(PANDAPOWER_PIN, {
      keep_going: false,
      deps: false,
    });
  } finally {
    micropip.destroy();
  }

  progress(70, 'Import-checking Pandapower', 'Verifying the installed browser runtime before solving');
  await pyodide.runPythonAsync(`
import pandapower as _pp_browser_check
assert _pp_browser_check.__version__ == "3.1.2"
`);

  progress(74, 'Loading P0-A physics code', '20/0.4 kV transformer + LV line + asymmetric load');
  const source = await loadEngineSource();
  await pyodide.runPythonAsync(source);
  initMs = performance.now() - started;
}

async function runP0A() {
  await initialize();
  progress(80, 'Running three-phase power flow', 'Pandapower runpp_3ph(numba=False)');

  const raw = await pyodide.runPythonAsync('run_p0a_json()');
  const payload = JSON.parse(raw);
  payload.versions = payload.versions || {};
  payload.versions.pyodide = PYODIDE_VERSION;
  payload.runtime = {
    ...(payload.runtime || {}),
    worker_init_ms: initMs,
    execution_location: 'browser-web-worker',
    worker_type: 'classic',
    dependency_strategy: 'explicit-pyodide-compatible-pins',
    deepdiff_pin: DEEPDIFF_PIN,
    backend: null,
  };

  progress(95, 'Validating results', 'Convergence · reference voltages · losses · repeatability');
  return payload;
}

self.onmessage = async (event) => {
  if (!event.data || event.data.type !== 'run-p0a') return;
  try {
    const payload = await runP0A();
    self.postMessage({ type: 'result', payload });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const stack = error && error.stack ? error.stack : '';
    self.postMessage({ type: 'error', message, stack });
  }
};

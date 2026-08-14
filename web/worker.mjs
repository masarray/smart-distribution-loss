import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.mjs';

const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
const PANDAPOWER_PIN = 'pandapower==3.1.2';
let pyodide = null;
let initMs = null;
let engineSource = null;

function progress(percent, label, detail = '') {
  self.postMessage({ type: 'progress', percent, label, detail });
}

async function loadEngineSource() {
  if (engineSource) return engineSource;
  const url = new URL('./engine/p0a_engine.py', import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load Python engine: HTTP ${response.status}`);
  engineSource = await response.text();
  return engineSource;
}

async function initialize() {
  if (pyodide) return;
  const started = performance.now();

  progress(8, 'Loading Pyodide', 'CPython 3.13/WebAssembly runtime');
  pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX });

  progress(24, 'Loading scientific stack', 'NumPy · pandas · SciPy · NetworkX · lxml');
  await pyodide.loadPackage(['micropip', 'numpy', 'pandas', 'scipy', 'networkx', 'lxml']);

  progress(47, 'Installing Pandapower', `${PANDAPOWER_PIN} via micropip`);
  const micropip = pyodide.pyimport('micropip');
  await micropip.install(PANDAPOWER_PIN, { keep_going: false });
  micropip.destroy();

  progress(68, 'Loading P0-A physics code', '20/0.4 kV transformer + LV line + asymmetric load');
  const source = await loadEngineSource();
  await pyodide.runPythonAsync(source);
  initMs = performance.now() - started;
}

async function runP0A() {
  await initialize();
  progress(76, 'Running three-phase power flow', 'Pandapower runpp_3ph(numba=False)');

  const raw = await pyodide.runPythonAsync('run_p0a_json()');
  const payload = JSON.parse(raw);
  payload.versions.pyodide = '0.28.3';
  payload.runtime = {
    ...(payload.runtime || {}),
    worker_init_ms: initMs,
    execution_location: 'browser-web-worker',
    backend: null,
  };

  progress(94, 'Validating results', 'Convergence · reference voltages · losses · repeatability');
  return payload;
}

self.onmessage = async (event) => {
  if (event.data?.type !== 'run-p0a') return;
  try {
    const payload = await runP0A();
    self.postMessage({ type: 'result', payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    self.postMessage({ type: 'error', message, stack });
  }
};

/* M5 field-dataset physics worker.
 * Kept separate from the synthetic P3 worker so importing/previewing field data
 * cannot mutate the current demo session or its warm runtime state.
 */

const PYODIDE_VERSION = '0.28.3';
const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PANDAPOWER_PIN = 'pandapower==3.1.2';
const DEEPDIFF_PIN = 'deepdiff==8.5.0';
const GEOJSON_PIN = 'geojson==3.2.0';
const ORDERLY_SET_PIN = 'orderly-set==5.4.1';

let pyodide = null;
let initMs = null;
let runtimeScriptLoaded = false;
let fieldEngineLoaded = false;

function progress(percent, label, detail = '') {
  self.postMessage({ type: 'field-progress', percent, label, detail });
}

function loadRuntimeScript() {
  if (runtimeScriptLoaded) return;
  progress(4, 'Loading field physics runtime', `Pyodide ${PYODIDE_VERSION}`);
  importScripts(`${PYODIDE_INDEX}pyodide.js`);
  if (typeof self.loadPyodide !== 'function') throw new Error('Pyodide runtime loaded but loadPyodide() is unavailable.');
  runtimeScriptLoaded = true;
}

async function initialize() {
  if (pyodide) return;
  const started = performance.now();
  loadRuntimeScript();
  progress(10, 'Initializing Pyodide', 'CPython / WebAssembly');
  pyodide = await self.loadPyodide({ indexURL: PYODIDE_INDEX });
  progress(25, 'Loading scientific stack', 'NumPy · pandas · SciPy · NetworkX · lxml');
  await pyodide.loadPackage(['micropip', 'numpy', 'pandas', 'scipy', 'networkx', 'lxml', 'packaging', 'tqdm', 'typing-extensions']);
  const micropip = pyodide.pyimport('micropip');
  try {
    progress(42, 'Installing browser-safe dependencies', `${DEEPDIFF_PIN} · ${GEOJSON_PIN}`);
    await micropip.install([ORDERLY_SET_PIN, DEEPDIFF_PIN, GEOJSON_PIN], { keep_going: false });
    progress(58, 'Installing Pandapower', PANDAPOWER_PIN);
    await micropip.install(PANDAPOWER_PIN, { keep_going: false, deps: false });
  } finally {
    micropip.destroy();
  }
  await pyodide.runPythonAsync(`
import pandapower as _pp_field_check
assert _pp_field_check.__version__ == "3.1.2"
`);
  initMs = performance.now() - started;
}

async function ensureFieldEngine() {
  if (fieldEngineLoaded) return;
  const url = new URL('./engine/field_dataset.py', self.location.href);
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load field_dataset.py: HTTP ${response.status}`);
  const source = await response.text();
  await pyodide.runPythonAsync(source);
  fieldEngineLoaded = true;
}

async function runField(dataset) {
  await initialize();
  progress(72, 'Validating normalized field contract', 'network · customers · measurements · AMI');
  await ensureFieldEngine();
  progress(78, 'Building field network', 'Pandapower 3φ topology from imported CSV contract');
  const json = JSON.stringify(dataset);
  pyodide.globals.set('_FIELD_INPUT_JSON', json);
  try {
    progress(82, 'Running field physics preview', '96 × 15-minute runpp_3ph power flows');
    const raw = await pyodide.runPythonAsync('run_field_dataset_json(_FIELD_INPUT_JSON)');
    const payload = JSON.parse(raw);
    payload.runtime = {
      ...(payload.runtime || {}),
      worker_init_ms: initMs,
      pyodide: PYODIDE_VERSION,
      pandapower: PANDAPOWER_PIN.split('==')[1],
      execution_location: 'browser-web-worker',
      worker: 'field-worker.js',
    };
    progress(100, payload.gate?.pass ? 'FIELD PHYSICS PASS' : 'FIELD PHYSICS REVIEW', `${payload.summary?.technical_loss_kwh?.toFixed?.(3) ?? '—'} kWh/day technical loss`);
    return payload;
  } finally {
    try { pyodide.globals.delete('_FIELD_INPUT_JSON'); } catch (_) { /* no-op */ }
  }
}

self.onmessage = async (event) => {
  if (event.data?.type !== 'run-field-dataset') return;
  try {
    const payload = await runField(event.data.dataset);
    self.postMessage({ type: 'field-result', payload });
  } catch (error) {
    self.postMessage({
      type: 'field-error',
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : '',
    });
  }
};

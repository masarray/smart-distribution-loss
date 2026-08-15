/* Smart Distribution Loss browser physics worker.
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
let runtimeScriptLoaded = false;
const engineSources = new Map();
const loadedEngines = new Set();

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

async function fetchEngineSource(filename) {
  if (engineSources.has(filename)) return engineSources.get(filename);
  const url = new URL(`./engine/${filename}`, self.location.href);
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load Python engine: HTTP ${response.status} (${url.href})`);
  const source = await response.text();
  engineSources.set(filename, source);
  return source;
}

async function ensureEngine(filename) {
  if (loadedEngines.has(filename)) return;
  const source = await fetchEngineSource(filename);
  await pyodide.runPythonAsync(source);
  loadedEngines.add(filename);
}

async function initialize() {
  if (pyodide) return;
  const started = performance.now();
  loadPyodideRuntimeScript();
  progress(10, 'Initializing Pyodide', 'CPython / WebAssembly runtime');
  pyodide = await self.loadPyodide({ indexURL: PYODIDE_INDEX });

  progress(24, 'Loading scientific stack', 'NumPy · pandas · SciPy · NetworkX · lxml');
  await pyodide.loadPackage([
    'micropip', 'numpy', 'pandas', 'scipy', 'networkx', 'lxml',
    'packaging', 'tqdm', 'typing-extensions',
  ]);

  const micropip = pyodide.pyimport('micropip');
  try {
    progress(40, 'Installing browser-safe dependencies', `${DEEPDIFF_PIN} · ${GEOJSON_PIN}`);
    await micropip.install([ORDERLY_SET_PIN, DEEPDIFF_PIN, GEOJSON_PIN], { keep_going: false });
    progress(54, 'Installing Pandapower', `${PANDAPOWER_PIN} · dependency graph pinned for Pyodide`);
    await micropip.install(PANDAPOWER_PIN, { keep_going: false, deps: false });
  } finally {
    micropip.destroy();
  }

  progress(69, 'Import-checking Pandapower', 'Verifying the browser physics runtime');
  await pyodide.runPythonAsync(`
import pandapower as _pp_browser_check
assert _pp_browser_check.__version__ == "3.1.2"
`);
  initMs = performance.now() - started;
}

function commonRuntime() {
  let wasmHeapMb = null;
  try {
    wasmHeapMb = pyodide?._module?.HEAP8?.buffer?.byteLength
      ? pyodide._module.HEAP8.buffer.byteLength / (1024 * 1024)
      : null;
  } catch (_) {
    wasmHeapMb = null;
  }
  return {
    worker_init_ms: initMs,
    execution_location: 'browser-web-worker',
    worker_type: 'classic',
    dependency_strategy: 'explicit-pyodide-compatible-pins',
    deepdiff_pin: DEEPDIFF_PIN,
    wasm_heap_mb: wasmHeapMb,
    backend: null,
  };
}

async function ensureP1Engines() {
  await ensureEngine('p0b_engine.py');
  await ensureEngine('p1_ground_truth.py');
}

async function buildP1TruthIfNeeded({ emitSteps = false, progressBase = 70, progressSpan = 10 } = {}) {
  await ensureP1Engines();
  const ready = await pyodide.runPythonAsync('_P1_SESSION is not None and len(_P1_SESSION.get("records", [])) == 96');
  if (ready) return { reused: true, payload: null };

  const startRaw = await pyodide.runPythonAsync('start_p1_session_json()');
  const start = JSON.parse(startRaw);
  if (emitSteps) self.postMessage({ type: 'p1-start', payload: start });

  for (let i = 0; i < 96; i += 1) {
    if (i === 0 || i === 95 || i % 8 === 0) {
      progress(progressBase + Math.round(((i + 1) / 96) * progressSpan), 'Rebuilding hidden Ground Truth', `${i + 1}/96 intervals`);
    }
    const raw = await pyodide.runPythonAsync(`run_p1_step_json(${i})`);
    if (emitSteps && (i === 0 || i === 95 || i % 4 === 0)) {
      self.postMessage({ type: 'p1-step', index: i, total: 96, payload: JSON.parse(raw) });
    }
  }

  const finalRaw = await pyodide.runPythonAsync('finish_p1_json()');
  const payload = JSON.parse(finalRaw);
  if (!payload.gate?.pass) throw new Error('P1 Ground Truth regression failed.');
  return { reused: false, payload };
}

async function buildP2BaselineIfNeeded(preset = 'typical', { emitSteps = false, progressBase = 80, progressSpan = 8 } = {}) {
  await ensureEngine('p2_degradation.py');
  const normalized = ['good', 'typical', 'poor'].includes(String(preset).toLowerCase())
    ? String(preset).toLowerCase()
    : 'typical';
  const ready = await pyodide.runPythonAsync(`_P2_SESSION is not None and _P2_SESSION.get("preset") == ${JSON.stringify(normalized)} and len(_P2_SESSION.get("records", [])) == 96`);
  if (ready) return { reused: true, payload: null };

  await pyodide.runPythonAsync(`start_p2_session_json(${JSON.stringify(normalized)})`);
  for (let i = 0; i < 96; i += 1) {
    if (i === 0 || i === 95 || i % 8 === 0) {
      progress(progressBase + Math.round(((i + 1) / 96) * progressSpan), 'Rebuilding conventional P2 baseline', `${i + 1}/96 degraded-data power flows`);
    }
    const raw = await pyodide.runPythonAsync(`run_p2_step_json(${i})`);
    if (emitSteps && (i === 0 || i === 95 || i % 4 === 0)) {
      self.postMessage({ type: 'p2-step', index: i, total: 96, payload: JSON.parse(raw) });
    }
  }
  const finalRaw = await pyodide.runPythonAsync('finish_p2_json()');
  const payload = JSON.parse(finalRaw);
  if (!payload.gate?.pass) throw new Error('P2 conventional baseline regression failed while preparing P3.');
  return { reused: false, payload };
}

async function runP0A() {
  await initialize();
  progress(74, 'Loading P0-A physics code', 'Minimal official-reference network');
  await ensureEngine('p0a_engine.py');
  progress(80, 'Running three-phase power flow', 'Pandapower runpp_3ph(numba=False)');
  const raw = await pyodide.runPythonAsync('run_p0a_json()');
  const payload = JSON.parse(raw);
  payload.versions = payload.versions || {};
  payload.versions.pyodide = PYODIDE_VERSION;
  payload.runtime = { ...(payload.runtime || {}), ...commonRuntime() };
  progress(95, 'Validating results', 'Convergence · reference voltages · losses · repeatability');
  return payload;
}

async function runP0B() {
  await initialize();
  progress(72, 'Loading P0-B network engine', '3 JTR branches · deterministic 90-customer population');
  await ensureEngine('p0b_engine.py');
  const plan = [
    { count: 1, repeats: 3 }, { count: 10, repeats: 3 }, { count: 30, repeats: 3 },
    { count: 60, repeats: 3 }, { count: 90, repeats: 25 },
  ];
  const cases = [];
  for (let i = 0; i < plan.length; i += 1) {
    const step = plan[i];
    progress(76 + Math.round((i / plan.length) * 18), `Benchmarking ${step.count} customers`, step.count === 90 ? 'Final scale test + 25 warm solves' : `${step.repeats} repeated warm solves`);
    const raw = await pyodide.runPythonAsync(`run_p0b_case_json(${step.count}, ${step.repeats})`);
    const result = JSON.parse(raw);
    cases.push(result);
    self.postMessage({ type: 'p0b-case', index: i, total: plan.length, payload: result });
  }
  const finalCase = cases[cases.length - 1];
  const allCasesPass = cases.every((item) => item.pass);
  return {
    gate: { pass: allCasesPass && finalCase.pass, summary: allCasesPass && finalCase.pass ? 'P0-B passed: the 90-customer three-phase distribution model is viable in the browser.' : 'P0-B failed one or more scale/stability checks.' },
    versions: { pyodide: PYODIDE_VERSION, pandapower: PANDAPOWER_PIN.split('==')[1] },
    benchmark_plan: plan, cases, final: finalCase, runtime: commonRuntime(),
  };
}

async function runP1() {
  await initialize();
  progress(70, 'Loading validated 90-customer topology', 'Reusing the P0-B distribution-network engine');
  await ensureP1Engines();
  progress(72, 'Starting immutable Ground Truth', '90 customers · 96 intervals · noiseless measurements');
  const startRaw = await pyodide.runPythonAsync('start_p1_session_json()');
  const start = JSON.parse(startRaw);
  self.postMessage({ type: 'p1-start', payload: start });
  for (let i = 0; i < 96; i += 1) {
    const pct = 74 + Math.round(((i + 1) / 96) * 21);
    if (i === 0 || i === 95 || i % 4 === 0) progress(pct, `Simulating Ground Truth ${String(Math.floor(i * 15 / 60)).padStart(2, '0')}:${String(i * 15 % 60).padStart(2, '0')}`, `${i + 1}/96 three-phase intervals`);
    const raw = await pyodide.runPythonAsync(`run_p1_step_json(${i})`);
    if (i === 0 || i === 95 || i % 4 === 0) self.postMessage({ type: 'p1-step', index: i, total: 96, payload: JSON.parse(raw) });
  }
  progress(96, 'Finalizing Ground Truth', 'Integrating daily energy · losses · AMI · integrity checks');
  const finalRaw = await pyodide.runPythonAsync('finish_p1_json()');
  const payload = JSON.parse(finalRaw);
  payload.versions = { pyodide: PYODIDE_VERSION, pandapower: PANDAPOWER_PIN.split('==')[1] };
  payload.runtime = { ...(payload.runtime || {}), ...commonRuntime() };
  return payload;
}

async function runP2(preset = 'typical') {
  await initialize();
  const normalizedPreset = ['good', 'typical', 'poor'].includes(String(preset).toLowerCase()) ? String(preset).toLowerCase() : 'typical';
  progress(70, 'Preparing immutable P1 reference', 'Ground Truth stays hidden from the conventional model');
  await buildP1TruthIfNeeded({ progressBase: 71, progressSpan: 10 });
  progress(82, 'Loading P2 degradation engine', `${normalizedPreset.toUpperCase()} observability preset · no smart optimizer`);
  await ensureEngine('p2_degradation.py');
  const startRaw = await pyodide.runPythonAsync(`start_p2_session_json(${JSON.stringify(normalizedPreset)})`);
  const start = JSON.parse(startRaw);
  self.postMessage({ type: 'p2-start', payload: start });
  for (let i = 0; i < 96; i += 1) {
    const pct = 84 + Math.round(((i + 1) / 96) * 12);
    if (i === 0 || i === 95 || i % 4 === 0) progress(pct, 'Running conventional model', `${i + 1}/96 degraded-data power flows`);
    const raw = await pyodide.runPythonAsync(`run_p2_step_json(${i})`);
    if (i === 0 || i === 95 || i % 4 === 0) self.postMessage({ type: 'p2-step', index: i, total: 96, payload: JSON.parse(raw) });
  }
  progress(97, 'Scoring observability error', 'Loss error · feeder residual · phase residual · voltage residual');
  const finalRaw = await pyodide.runPythonAsync('finish_p2_json()');
  const payload = JSON.parse(finalRaw);
  payload.versions = { pyodide: PYODIDE_VERSION, pandapower: PANDAPOWER_PIN.split('==')[1] };
  payload.runtime = { ...(payload.runtime || {}), ...commonRuntime() };
  return payload;
}

async function runP3(preset = 'typical') {
  await initialize();
  const normalizedPreset = ['good', 'typical', 'poor'].includes(String(preset).toLowerCase()) ? String(preset).toLowerCase() : 'typical';

  progress(70, 'Preparing immutable reference', 'P3 calibration never receives hidden Ground Truth states');
  await buildP1TruthIfNeeded({ progressBase: 70, progressSpan: 7 });
  progress(78, 'Preparing conventional baseline', `${normalizedPreset.toUpperCase()} degraded view must be identical to P2`);
  await buildP2BaselineIfNeeded(normalizedPreset, { progressBase: 78, progressSpan: 7 });

  progress(86, 'Loading P3 Smart Calibration engine', 'Staged deterministic physics-informed inference · no black-box ML');
  await ensureEngine('p3_smart_calibration.py');
  const startRaw = await pyodide.runPythonAsync(`start_p3_session_json(${JSON.stringify(normalizedPreset)})`);
  const start = JSON.parse(startRaw);
  self.postMessage({ type: 'p3-start', payload: start });

  const stages = [
    ['p3_stage_time_alignment()', 'Timestamp alignment', 'Infer ±15 min correction only for flagged streams'],
    ['p3_stage_load_reconstruction()', 'Missing-AMI reconstruction', 'Fit bounded category scales against feeder P'],
    ['p3_stage_phase_inference()', 'Unknown-phase inference', 'Coordinate descent against measured phase P'],
    ['p3_stage_q_anchor()', 'Reactive-power anchors', '16 sparse physics solves establish network-Q overhead'],
    ['p3_stage_pf_calibration()', 'Unknown-PF calibration', 'Bounded least squares against noisy feeder Q'],
    ['p3_stage_network_parameters()', 'Identifiable network parameters', 'Estimate transformer Pfe; hold weakly observable parameters'],
    ['p3_build_smart_network()', 'Build smart physics model', 'Rebuild separate Pandapower model from calibrated degraded state'],
  ];

  for (let i = 0; i < stages.length; i += 1) {
    const [expr, label, detail] = stages[i];
    progress(87 + Math.round((i / stages.length) * 5), label, detail);
    const raw = await pyodide.runPythonAsync(`json.dumps(${expr}, allow_nan=False)`);
    self.postMessage({ type: 'p3-stage', index: i, total: stages.length, payload: JSON.parse(raw) });
  }

  for (let i = 0; i < 96; i += 1) {
    const pct = 92 + Math.round(((i + 1) / 96) * 6);
    if (i === 0 || i === 95 || i % 4 === 0) progress(pct, 'Validating smart model', `${i + 1}/96 full three-phase hold-out-capable power flows`);
    const raw = await pyodide.runPythonAsync(`run_p3_step_json(${i})`);
    if (i === 0 || i === 95 || i % 4 === 0) self.postMessage({ type: 'p3-step', index: i, total: 96, payload: JSON.parse(raw) });
  }

  progress(99, 'Scoring Smart Calibration', 'Calibration vs 32 unseen intervals · conventional vs smart · validation-only Ground Truth');
  const finalRaw = await pyodide.runPythonAsync('finish_p3_json()');
  const payload = JSON.parse(finalRaw);
  payload.versions = { pyodide: PYODIDE_VERSION, pandapower: PANDAPOWER_PIN.split('==')[1] };
  payload.runtime = { ...(payload.runtime || {}), ...commonRuntime() };
  return payload;
}

self.onmessage = async (event) => {
  const type = event.data?.type;
  try {
    if (type === 'run-p0a') self.postMessage({ type: 'result', phase: 'p0a', payload: await runP0A() });
    else if (type === 'run-p0b') self.postMessage({ type: 'result', phase: 'p0b', payload: await runP0B() });
    else if (type === 'run-p1') self.postMessage({ type: 'result', phase: 'p1', payload: await runP1() });
    else if (type === 'run-p2') self.postMessage({ type: 'result', phase: 'p2', payload: await runP2(event.data?.preset || 'typical') });
    else if (type === 'run-p3') self.postMessage({ type: 'result', phase: 'p3', payload: await runP3(event.data?.preset || 'typical') });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const stack = error && error.stack ? error.stack : '';
    self.postMessage({ type: 'error', phase: type, message, stack });
  }
};

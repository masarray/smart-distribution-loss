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
const CANONICAL_INTERVALS = 96;
const CANONICAL_INTERVAL_MINUTES = 15;

let pyodide = null;
let initMs = null;
let runtimeScriptLoaded = false;
const engineSources = new Map();
const loadedEngines = new Set();

function progress(percent, label, detail = '') {
  self.postMessage({ type: 'progress', percent, label, detail });
}

function canonicalTime(index) {
  const totalMinutes = Number(index) * CANONICAL_INTERVAL_MINUTES;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function normalizeLossSeries(series, label) {
  if (!Array.isArray(series) || series.length !== CANONICAL_INTERVALS) {
    throw new Error(`${label} must expose ${CANONICAL_INTERVALS} canonical loss intervals.`);
  }
  return series.map((point, index) => {
    const expectedTime = canonicalTime(index);
    if (Number(point?.index) !== index || point?.time !== expectedTime) {
      throw new Error(`${label} timebase mismatch at interval ${index}: expected ${expectedTime}, got ${point?.time ?? 'missing'}.`);
    }
    for (const key of ['truth_loss_kw', 'conventional_loss_kw', 'smart_loss_kw']) {
      if (!Number.isFinite(Number(point?.[key]))) {
        throw new Error(`${label} contains a non-finite ${key} at interval ${index}.`);
      }
    }
    return {
      index,
      time: expectedTime,
      truth_loss_kw: Number(point.truth_loss_kw),
      conventional_loss_kw: Number(point.conventional_loss_kw),
      smart_loss_kw: Number(point.smart_loss_kw),
    };
  });
}

function attachOperationalDataContract(payload, spotPayload, tmPayload) {
  const spotSeries = normalizeLossSeries(spotPayload?.series, 'Spot MV');
  const tmSeries = normalizeLossSeries(tmPayload?.series, 'Pelanggan TM');
  const gdSeries = normalizeLossSeries(payload?.series, 'GD-01');

  const feederSeries = gdSeries.map((gd, index) => ({
    index,
    time: gd.time,
    truth_loss_kw: gd.truth_loss_kw + spotSeries[index].truth_loss_kw + tmSeries[index].truth_loss_kw,
    conventional_loss_kw: gd.conventional_loss_kw + spotSeries[index].conventional_loss_kw + tmSeries[index].conventional_loss_kw,
    smart_loss_kw: gd.smart_loss_kw + spotSeries[index].smart_loss_kw + tmSeries[index].smart_loss_kw,
  }));

  payload.asset_series = {
    feeder: feederSeries,
    spot: spotSeries,
    tm: tmSeries,
    gd: gdSeries,
  };

  payload.data_contract = {
    schema: 'smart-distribution-loss-operational-data-v1',
    dataset_mode: 'synthetic_demo',
    source_label: 'Synthetic Demo',
    canonical_timebase: {
      intervals: CANONICAL_INTERVALS,
      interval_minutes: CANONICAL_INTERVAL_MINUTES,
      period_hours: 24,
      first_interval: '00:00',
      last_interval: '23:45',
      timezone: 'floating-local-demo',
    },
    assets: {
      feeder: {
        asset_id: 'feeder',
        label: 'Feeder 20 kV',
        source_kind: 'derived_rollup',
        child_assets: ['spot', 'tm', 'gd'],
        provenance: {
          source_type: 'derived_rollup',
          dataset_mode: 'deterministic_synthetic',
          generated_by: 'sdl-worker.js',
          solver: 'loss-only arithmetic roll-up of independently solved assets',
          truth_policy: 'no additional truth is introduced; each child preserves its own validation policy',
        },
      },
      spot: {
        asset_id: 'spot',
        label: 'Referensi TM',
        source_kind: 'independent_physics_case',
        provenance: spotPayload.provenance || {},
      },
      tm: {
        asset_id: 'tm',
        label: 'Pelanggan TM',
        source_kind: 'independent_physics_case',
        provenance: tmPayload.provenance || {},
      },
      gd: {
        asset_id: 'gd',
        label: 'Gardu distribusi GD-01',
        source_kind: 'degraded_field_like_physics_case',
        provenance: {
          source_type: 'synthetic_degraded_field_view',
          dataset_mode: 'deterministic_synthetic',
          scenario_id: 'gd01-distribution-p3-v1',
          generated_by: 'p1_ground_truth.py → p2_degradation.py → p3_smart_calibration.py',
          solver: payload?.runtime?.solver || 'pandapower.runpp_3ph',
          seed: payload?.runtime?.seed ?? null,
          truth_policy: 'P1 hidden Ground Truth remains unavailable to P3 calibration and is opened only for final synthetic validation',
        },
      },
    },
  };

  return payload;
}

function loadPyodideRuntimeScript() {
  if (runtimeScriptLoaded) return;
  progress(5, 'Loading Pyodide runtime script', `Pyodide ${PYODIDE_VERSION}`);
  importScripts(`${PYODIDE_INDEX}pyodide.js`);
  if (typeof self.loadPyodide !== 'function') throw new Error('Pyodide runtime loaded but loadPyodide() is unavailable.');
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
  await pyodide.loadPackage(['micropip', 'numpy', 'pandas', 'scipy', 'networkx', 'lxml', 'packaging', 'tqdm', 'typing-extensions']);
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
    wasmHeapMb = pyodide?._module?.HEAP8?.buffer?.byteLength ? pyodide._module.HEAP8.buffer.byteLength / (1024 * 1024) : null;
  } catch (_) { wasmHeapMb = null; }
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
    if (i === 0 || i === 95 || i % 8 === 0) progress(progressBase + Math.round(((i + 1) / 96) * progressSpan), 'Rebuilding hidden Ground Truth', `${i + 1}/96 intervals`);
    const raw = await pyodide.runPythonAsync(`run_p1_step_json(${i})`);
    if (emitSteps && (i === 0 || i === 95 || i % 4 === 0)) self.postMessage({ type: 'p1-step', index: i, total: 96, payload: JSON.parse(raw) });
  }
  const finalRaw = await pyodide.runPythonAsync('finish_p1_json()');
  const payload = JSON.parse(finalRaw);
  if (!payload.gate?.pass) throw new Error('P1 Ground Truth regression failed.');
  return { reused: false, payload };
}

async function buildP2BaselineIfNeeded(preset = 'typical', { emitSteps = false, progressBase = 80, progressSpan = 8 } = {}) {
  await ensureEngine('p2_degradation.py');
  const normalized = ['good', 'typical', 'poor'].includes(String(preset).toLowerCase()) ? String(preset).toLowerCase() : 'typical';
  const ready = await pyodide.runPythonAsync(`_P2_SESSION is not None and _P2_SESSION.get("preset") == ${JSON.stringify(normalized)} and len(_P2_SESSION.get("records", [])) == 96`);
  if (ready) return { reused: true, payload: null };
  await pyodide.runPythonAsync(`start_p2_session_json(${JSON.stringify(normalized)})`);
  for (let i = 0; i < 96; i += 1) {
    if (i === 0 || i === 95 || i % 8 === 0) progress(progressBase + Math.round(((i + 1) / 96) * progressSpan), 'Rebuilding conventional P2 baseline', `${i + 1}/96 degraded-data power flows`);
    const raw = await pyodide.runPythonAsync(`run_p2_step_json(${i})`);
    if (emitSteps && (i === 0 || i === 95 || i % 4 === 0)) self.postMessage({ type: 'p2-step', index: i, total: 96, payload: JSON.parse(raw) });
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
  const plan = [{ count: 1, repeats: 3 }, { count: 10, repeats: 3 }, { count: 30, repeats: 3 }, { count: 60, repeats: 3 }, { count: 90, repeats: 25 }];
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

async function runSpotDemo() {
  await initialize();
  await ensureEngine('demo_spot_load.py');
  const raw = await pyodide.runPythonAsync('run_spot_load_demo_json()');
  const payload = JSON.parse(raw);
  payload.versions = { pyodide: PYODIDE_VERSION, pandapower: PANDAPOWER_PIN.split('==')[1] };
  payload.runtime = { ...(payload.runtime || {}), ...commonRuntime() };
  return payload;
}

async function runTmDemo() {
  await initialize();
  await ensureEngine('demo_tm_customer.py');
  const raw = await pyodide.runPythonAsync('run_tm_customer_demo_json()');
  const payload = JSON.parse(raw);
  payload.versions = { pyodide: PYODIDE_VERSION, pandapower: PANDAPOWER_PIN.split('==')[1] };
  payload.runtime = { ...(payload.runtime || {}), ...commonRuntime() };
  return payload;
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

  progress(70, 'Proving Spot MV case', 'Dedicated 5 km MV reference-load model · 96 x 15-minute complete observability');
  const spotPayload = await runSpotDemo();
  if (!spotPayload.gate?.pass) throw new Error('Spot-load accuracy proof failed; public comparison demo is not valid.');
  self.postMessage({ type: 'spot-demo', payload: spotPayload });

  progress(72, 'Solving independent Pelanggan TM', 'Dedicated 2.8 km feeder · 96 x 15-minute asymmetric P/Q measurements');
  const tmPayload = await runTmDemo();
  if (!tmPayload.gate?.pass) throw new Error('Independent Pelanggan TM proof failed; public comparison demo is not valid.');
  const independentMvProof =
    tmPayload.demo_kind !== spotPayload.demo_kind &&
    tmPayload.scenario_id !== spotPayload.scenario_id &&
    Math.abs(Number(tmPayload.comparison?.smart?.loss_kwh) - Number(spotPayload.comparison?.smart?.loss_kwh)) > 0.25;
  if (!independentMvProof) throw new Error('Pelanggan TM independence guard failed: TM still resembles the Spot MV result channel.');
  self.postMessage({ type: 'tm-demo', payload: tmPayload });

  progress(74, 'Preparing immutable distribution reference', 'P3 calibration never receives hidden Ground Truth states');
  await buildP1TruthIfNeeded({ progressBase: 74, progressSpan: 5 });
  progress(80, 'Preparing conventional distribution baseline', `${normalizedPreset.toUpperCase()} degraded view must be identical to P2`);
  await buildP2BaselineIfNeeded(normalizedPreset, { progressBase: 80, progressSpan: 5 });

  progress(86, 'Loading P3 Smart Calibration engine', 'Staged deterministic physics-informed inference · no black-box ML');
  await ensureEngine('p3_smart_calibration.py');
  await ensureEngine('p3_loss_consistency.py');
  const startRaw = await pyodide.runPythonAsync(`start_p3_session_json(${JSON.stringify(normalizedPreset)})`);
  const start = JSON.parse(startRaw);
  self.postMessage({ type: 'p3-start', payload: start });

  const stages = [
    ['p3_stage_time_alignment()', 'Timestamp alignment', 'Infer ±15 min correction only for flagged streams'],
    ['p3_stage_load_reconstruction()', 'Missing-AMI reconstruction', 'Fit bounded category scales against feeder P'],
    ['p3_stage_phase_inference()', 'Unknown-phase inference', 'Coordinate descent against measured phase P'],
    ['p3_stage_q_anchor()', 'Reactive-power anchors', '16 sparse physics solves establish network-Q overhead'],
    ['p3_stage_pf_calibration()', 'Unknown-PF calibration', 'Bounded least squares against noisy feeder Q'],
    ['p3_stage_network_parameters()', 'Loss-consistent network calibration', 'Fit transformer Pfe against the current smart-state three-phase physics'],
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
    if (i === 0 || i === 95 || i % 4 === 0) progress(pct, 'Validating smart distribution model', `${i + 1}/96 full three-phase hold-out-capable power flows`);
    const raw = await pyodide.runPythonAsync(`run_p3_step_json(${i})`);
    if (i === 0 || i === 95 || i % 4 === 0) self.postMessage({ type: 'p3-step', index: i, total: 96, payload: JSON.parse(raw) });
  }

  progress(99, 'Building traceable operational result', 'Canonical 96 x 15-minute series · provenance · feeder roll-up');
  const finalRaw = await pyodide.runPythonAsync('finish_p3_json()');
  const payload = JSON.parse(finalRaw);
  payload.versions = { pyodide: PYODIDE_VERSION, pandapower: PANDAPOWER_PIN.split('==')[1] };
  payload.runtime = { ...(payload.runtime || {}), ...commonRuntime() };
  payload.spot_load_demo = spotPayload;
  payload.tm_customer_demo = tmPayload;
  attachOperationalDataContract(payload, spotPayload, tmPayload);
  payload.pln_discussion_demo = {
    thesis: 'Same three-phase physics. Independent assets. Shared canonical operational timebase.',
    spot_load: {
      scenario_id: spotPayload.scenario_id,
      fingerprint: spotPayload.fingerprint,
      observability: spotPayload.observability.verdict,
      loss_kwh: spotPayload.comparison.smart.loss_kwh,
      conventional_loss_error_percent: spotPayload.comparison.conventional.loss_error_percent_validation_only,
      smart_loss_error_percent: spotPayload.comparison.smart.loss_error_percent_validation_only,
      smart_action: spotPayload.smart_action.classification,
    },
    tm_customer: {
      scenario_id: tmPayload.scenario_id,
      fingerprint: tmPayload.fingerprint,
      observability: tmPayload.observability.verdict,
      loss_kwh: tmPayload.comparison.smart.loss_kwh,
      conventional_loss_error_percent: tmPayload.comparison.conventional.loss_error_percent_validation_only,
      smart_loss_error_percent: tmPayload.comparison.smart.loss_error_percent_validation_only,
      smart_action: tmPayload.smart_action.classification,
    },
    distribution_transformer: {
      observability: normalizedPreset.toUpperCase(),
      conventional_loss_error_percent: payload.comparison.conventional.loss_error_percent_validation_only,
      smart_loss_error_percent: payload.comparison.smart.loss_error_percent_validation_only,
      source_nrmse_before_percent: payload.comparison.conventional.source_nrmse_percent,
      source_nrmse_after_percent: payload.comparison.smart.source_nrmse_percent,
      phase_rmse_before_kw: payload.comparison.conventional.phase_rmse_kw,
      phase_rmse_after_kw: payload.comparison.smart.phase_rmse_kw,
      holdout_objective_before: payload.comparison.conventional.objective_validation,
      holdout_objective_after: payload.comparison.smart.objective_validation,
    },
    independence_guard: independentMvProof,
    synthetic_claim: 'Spot MV, Pelanggan TM and GD-01 are independently solved and normalized to one 96 x 15-minute operational data contract; feeder loss is an explicit traceable roll-up of those child loss series.',
    field_claim: 'On field data, accuracy must be stated against independent measurements and hold-out residuals, not an unavailable hidden truth.',
  };
  return payload;
}

self.onmessage = async (event) => {
  const type = event.data?.type;
  try {
    if (type === 'run-p0a') self.postMessage({ type: 'result', phase: 'p0a', payload: await runP0A() });
    else if (type === 'run-p0b') self.postMessage({ type: 'result', phase: 'p0b', payload: await runP0B() });
    else if (type === 'run-spot-demo') self.postMessage({ type: 'result', phase: 'spot-demo', payload: await runSpotDemo() });
    else if (type === 'run-tm-demo') self.postMessage({ type: 'result', phase: 'tm-demo', payload: await runTmDemo() });
    else if (type === 'run-p1') self.postMessage({ type: 'result', phase: 'p1', payload: await runP1() });
    else if (type === 'run-p2') self.postMessage({ type: 'result', phase: 'p2', payload: await runP2(event.data?.preset || 'typical') });
    else if (type === 'run-p3') self.postMessage({ type: 'result', phase: 'p3', payload: await runP3(event.data?.preset || 'typical') });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const stack = error && error.stack ? error.stack : '';
    self.postMessage({ type: 'error', phase: type, message, stack });
  }
};

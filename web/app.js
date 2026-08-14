const ui = {
  button: document.querySelector('#runButton'),
  engineStatus: document.querySelector('#engineStatus'),
  statusDetail: document.querySelector('#statusDetail'),
  progressLabel: document.querySelector('#progressLabel'),
  progressPct: document.querySelector('#progressPct'),
  progressBar: document.querySelector('#progressBar'),
  progressLog: document.querySelector('#progressLog'),
  resultSection: document.querySelector('#resultSection'),
  errorSection: document.querySelector('#errorSection'),
  errorMessage: document.querySelector('#errorMessage'),
  errorStack: document.querySelector('#errorStack'),
  gateTitle: document.querySelector('#gateTitle'),
  gateReason: document.querySelector('#gateReason'),
  gateBadge: document.querySelector('#gateBadge'),
  diagnostics: document.querySelector('#diagnostics'),
  checkList: document.querySelector('#checkList'),
};

let worker = null;
let running = false;

function setStatus(kind, title, detail) {
  ui.engineStatus.innerHTML = `<span class="dot ${kind}"></span>${title}`;
  ui.statusDetail.textContent = detail ?? '';
}

function setProgress(percent, label, detail = '') {
  const bounded = Math.max(0, Math.min(100, Number(percent) || 0));
  ui.progressBar.style.width = `${bounded}%`;
  ui.progressPct.textContent = `${Math.round(bounded)}%`;
  ui.progressLabel.textContent = label;
  ui.progressLog.textContent = detail;
}

function resetOutput() {
  ui.resultSection.classList.add('hidden');
  ui.errorSection.classList.add('hidden');
  ui.checkList.innerHTML = '';
  ui.diagnostics.textContent = '';
}

function fmtMs(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(0)} ms`;
}

function setText(id, text) {
  document.querySelector(`#${id}`).textContent = text;
}

function renderResult(payload) {
  ui.resultSection.classList.remove('hidden');
  const { gate, versions, timing_ms: timing, electrical, checks, runtime } = payload;

  ui.gateTitle.textContent = gate.pass ? 'Browser physics path is viable' : 'Browser physics gate did not pass';
  ui.gateReason.textContent = gate.summary;
  ui.gateBadge.textContent = gate.pass ? 'PASS' : 'FAIL';
  ui.gateBadge.className = `gate-badge ${gate.pass ? 'pass' : 'fail'}`;

  setText('mPyodide', versions.pyodide || '0.28.3');
  setText('mPandapower', versions.pandapower || '—');
  setText('mInit', fmtMs(runtime.worker_init_ms));
  setText('mSolve', fmtMs(timing.first_solve));
  setText('mLoss', `${(electrical.total_loss_kw ?? 0).toFixed(3)} kW`);
  setText('mUnbalance', `${(electrical.lv_unbalance_percent ?? 0).toFixed(3)} %`);

  const phases = [
    ['A', electrical.vm_a_pu],
    ['B', electrical.vm_b_pu],
    ['C', electrical.vm_c_pu],
  ];
  for (const [phase, value] of phases) {
    const v = Number(value || 0);
    setText(`v${phase}`, `${v.toFixed(5)} pu`);
    const pct = Math.max(0, Math.min(100, (v / 1.05) * 100));
    document.querySelector(`#bar${phase}`).style.width = `${pct}%`;
  }

  for (const check of checks) {
    const row = document.createElement('div');
    row.className = 'check';
    const label = document.createElement('span');
    label.textContent = check.name;
    const state = document.createElement('b');
    state.textContent = check.pass ? 'PASS' : 'FAIL';
    state.className = check.pass ? 'ok' : 'fail';
    row.append(label, state);
    ui.checkList.appendChild(row);
  }

  ui.diagnostics.textContent = JSON.stringify(payload, null, 2);
}

function showError(message, stack = '') {
  ui.errorSection.classList.remove('hidden');
  ui.errorMessage.textContent = message || 'Unknown worker error';
  ui.errorStack.textContent = stack || '';
}

function createWorker() {
  if (worker) worker.terminate();

  // Use a classic .js worker deliberately. Python's built-in HTTP server on
  // Windows may serve .mjs as text/plain, which browsers reject for module
  // workers. Classic worker.js works both locally and on GitHub Pages.
  worker = new Worker('./worker.js');

  worker.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.type === 'progress') {
      setProgress(msg.percent, msg.label, msg.detail);
      return;
    }
    if (msg.type === 'result') {
      running = false;
      ui.button.disabled = false;
      ui.button.textContent = 'Run P0-A Again';
      setProgress(100, 'Completed', msg.payload.gate.pass ? 'All mandatory checks passed.' : 'One or more mandatory checks failed.');
      setStatus(msg.payload.gate.pass ? 'ok' : 'fail', msg.payload.gate.pass ? 'Engine ready' : 'Gate failed', msg.payload.gate.summary);
      renderResult(msg.payload);
      return;
    }
    if (msg.type === 'error') {
      running = false;
      ui.button.disabled = false;
      ui.button.textContent = 'Retry P0-A';
      setStatus('fail', 'Engine error', msg.message || 'Pyodide/Pandapower execution failed.');
      setProgress(msg.percent || 0, 'Failed', msg.message || 'See diagnostic below.');
      showError(msg.message, msg.stack);
    }
  };

  worker.onerror = (error) => {
    running = false;
    ui.button.disabled = false;
    ui.button.textContent = 'Retry P0-A';
    setStatus('fail', 'Worker error', error.message || 'The worker failed to start.');
    showError(error.message, `${error.filename || ''}:${error.lineno || ''}:${error.colno || ''}`);
  };
}

async function runGate() {
  if (running) return;
  running = true;
  resetOutput();
  ui.button.disabled = true;
  ui.button.textContent = 'Running…';
  setStatus('busy', 'Initializing browser engine', 'The first run downloads the WebAssembly runtime and Python packages.');
  setProgress(2, 'Starting worker', 'All computation remains on this device.');
  createWorker();
  worker.postMessage({ type: 'run-p0a' });
}

ui.button.addEventListener('click', runGate);

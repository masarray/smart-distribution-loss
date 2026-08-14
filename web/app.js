const ui = {
  button: document.querySelector('#runButton'),
  p0aButton: document.querySelector('#runP0AButton'),
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
  benchmarkRows: document.querySelector('#benchmarkRows'),
  benchmarkPanel: document.querySelector('#benchmarkPanel'),
  networkFacts: document.querySelector('#networkFacts'),
};

let worker = null;
let running = false;
let activePhase = 'p0b';

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

function setButtonsBusy(isBusy) {
  ui.button.disabled = isBusy;
  ui.p0aButton.disabled = isBusy;
}

function resetOutput() {
  ui.resultSection.classList.add('hidden');
  ui.errorSection.classList.add('hidden');
  ui.checkList.innerHTML = '';
  ui.benchmarkRows.innerHTML = '';
  ui.networkFacts.innerHTML = '';
  ui.diagnostics.textContent = '';
}

function fmtMs(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(0)} ms`;
}

function fmtNumber(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function setText(id, text) {
  const node = document.querySelector(`#${id}`);
  if (node) node.textContent = text;
}

function setGate(gate, passTitle, failTitle) {
  ui.gateTitle.textContent = gate.pass ? passTitle : failTitle;
  ui.gateReason.textContent = gate.summary;
  ui.gateBadge.textContent = gate.pass ? 'PASS' : 'FAIL';
  ui.gateBadge.className = `gate-badge ${gate.pass ? 'pass' : 'fail'}`;
}

function renderChecks(checks) {
  ui.checkList.innerHTML = '';
  for (const check of checks || []) {
    const row = document.createElement('div');
    row.className = 'check';

    const text = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = check.name;
    const detail = document.createElement('small');
    detail.textContent = check.detail || '';
    text.append(label, detail);

    const state = document.createElement('b');
    state.textContent = check.pass ? 'PASS' : 'FAIL';
    state.className = check.pass ? 'ok' : 'fail';
    row.append(text, state);
    ui.checkList.appendChild(row);
  }
}

function addFact(label, value) {
  const row = document.createElement('div');
  row.className = 'fact-row';
  const key = document.createElement('span');
  key.textContent = label;
  const val = document.createElement('b');
  val.textContent = value;
  row.append(key, val);
  ui.networkFacts.appendChild(row);
}

function renderP0BCase(result) {
  ui.resultSection.classList.remove('hidden');
  const c = result.case;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><strong>${c.customer_count}</strong></td>
    <td>${c.buses}</td>
    <td>${c.lines}</td>
    <td>${fmtMs(c.build_ms)}</td>
    <td>${fmtMs(c.first_solve_ms)}</td>
    <td>${fmtMs(c.repeat_average_ms)}</td>
    <td>${fmtNumber(c.technical_loss_kw, 3)} kW</td>
    <td>${fmtNumber(c.min_voltage_pu, 4)} pu</td>
    <td>${fmtNumber(c.max_unbalance_percent, 3)}%</td>
    <td><span class="table-status ${result.pass ? 'ok' : 'fail'}">${result.pass ? 'PASS' : 'FAIL'}</span></td>
  `;
  ui.benchmarkRows.appendChild(tr);
}

function renderP0B(payload) {
  ui.resultSection.classList.remove('hidden');
  ui.benchmarkPanel.classList.remove('hidden');
  const finalResult = payload.final;
  const c = finalResult.case;

  setGate(
    payload.gate,
    '90-customer browser scale is viable',
    'P0-B scale gate did not pass',
  );

  setText('mPyodide', payload.versions.pyodide || '—');
  setText('mPandapower', payload.versions.pandapower || '—');
  setText('mCustomers', String(c.customer_count));
  setText('mBuses', String(c.buses));
  setText('mWarm', fmtMs(c.repeat_average_ms));
  setText('m25', fmtMs(c.repeat_total_ms));
  setText('mLoss', `${fmtNumber(c.technical_loss_kw, 3)} kW`);
  setText('mMinV', `${fmtNumber(c.min_voltage_pu, 4)} pu`);

  ui.networkFacts.innerHTML = '';
  addFact('Topology', '20 kV → 400 kVA → 3 JTR');
  addFact('Individual customers', `${c.customer_count}`);
  addFact('Synthetic peak load', `${fmtNumber(c.total_load_kw, 1)} kW / ${fmtNumber(c.total_load_kvar, 1)} kvar`);
  addFact('Phase customers', `A ${c.phase_customer_count.A} · B ${c.phase_customer_count.B} · C ${c.phase_customer_count.C}`);
  addFact('Phase load', `A ${fmtNumber(c.phase_load_kw.A, 1)} · B ${fmtNumber(c.phase_load_kw.B, 1)} · C ${fmtNumber(c.phase_load_kw.C, 1)} kW`);
  addFact('Transformer loading', `${fmtNumber(c.transformer_loading_percent, 1)}%`);
  addFact('Max line loading', `${fmtNumber(c.max_line_loading_percent, 1)}%`);
  addFact('Max LV unbalance', `${fmtNumber(c.max_unbalance_percent, 3)}%`);
  addFact('Technical loss', `${fmtNumber(c.loss_percent, 2)}% of source P`);
  if (payload.runtime.wasm_heap_mb != null) {
    addFact('Allocated WASM heap', `${fmtNumber(payload.runtime.wasm_heap_mb, 0)} MB`);
  }

  renderChecks(finalResult.checks);
  ui.diagnostics.textContent = JSON.stringify(payload, null, 2);
}

function renderP0A(payload) {
  ui.resultSection.classList.remove('hidden');
  ui.benchmarkPanel.classList.add('hidden');
  setGate(
    payload.gate,
    'P0-A browser physics path remains viable',
    'P0-A browser physics gate did not pass',
  );

  const timing = payload.timing_ms || {};
  const electrical = payload.electrical || {};
  setText('mPyodide', payload.versions?.pyodide || '0.28.3');
  setText('mPandapower', payload.versions?.pandapower || '—');
  setText('mCustomers', '1 load');
  setText('mBuses', String(payload.network?.buses ?? '—'));
  setText('mWarm', fmtMs(timing.repeat_average));
  setText('m25', 'P0-B only');
  setText('mLoss', `${fmtNumber(electrical.total_loss_kw, 3)} kW`);
  setText('mMinV', `${fmtNumber(Math.min(electrical.vm_a_pu, electrical.vm_b_pu, electrical.vm_c_pu), 4)} pu`);

  ui.networkFacts.innerHTML = '';
  addFact('Reference network', 'Official-style minimal 3φ case');
  addFact('First solve', fmtMs(timing.first_solve));
  addFact('Warm solve', fmtMs(timing.repeat_average));
  addFact('LV unbalance', `${fmtNumber(electrical.lv_unbalance_percent, 3)}%`);
  addFact('Reference delta', `${Number(electrical.reference_delta_pu || 0).toExponential(3)} pu`);

  renderChecks(payload.checks);
  ui.diagnostics.textContent = JSON.stringify(payload, null, 2);
}

function showError(message, stack = '') {
  ui.errorSection.classList.remove('hidden');
  ui.errorMessage.textContent = message || 'Unknown worker error';
  ui.errorStack.textContent = stack || '';
}

function ensureWorker() {
  if (worker) return worker;

  worker = new Worker('./worker.js');
  worker.onmessage = (event) => {
    const msg = event.data || {};

    if (msg.type === 'progress') {
      setProgress(msg.percent, msg.label, msg.detail);
      return;
    }

    if (msg.type === 'p0b-case') {
      renderP0BCase(msg.payload);
      setStatus('busy', 'Scale benchmark running', `${msg.payload.case.customer_count} customer case completed.`);
      return;
    }

    if (msg.type === 'result') {
      running = false;
      setButtonsBusy(false);
      setProgress(100, 'Completed', msg.payload.gate.pass ? 'All mandatory checks passed.' : 'One or more mandatory checks failed.');
      setStatus(
        msg.payload.gate.pass ? 'ok' : 'fail',
        msg.payload.gate.pass ? 'Engine ready' : 'Gate failed',
        msg.payload.gate.summary,
      );

      if (msg.phase === 'p0b') {
        ui.button.textContent = 'Run P0-B Again';
        renderP0B(msg.payload);
      } else {
        ui.p0aButton.textContent = 'Re-run P0-A';
        renderP0A(msg.payload);
      }
      return;
    }

    if (msg.type === 'error') {
      running = false;
      setButtonsBusy(false);
      setStatus('fail', 'Engine error', msg.message || 'Pyodide/Pandapower execution failed.');
      setProgress(0, 'Failed', msg.message || 'See diagnostic below.');
      showError(msg.message, msg.stack);
    }
  };

  worker.onerror = (error) => {
    running = false;
    setButtonsBusy(false);
    setStatus('fail', 'Worker error', error.message || 'The worker failed to start.');
    showError(error.message, `${error.filename || ''}:${error.lineno || ''}:${error.colno || ''}`);
    worker?.terminate();
    worker = null;
  };

  return worker;
}

function runGate(phase) {
  if (running) return;
  running = true;
  activePhase = phase;
  resetOutput();
  setButtonsBusy(true);

  if (phase === 'p0b') {
    ui.button.textContent = 'Benchmarking…';
    setStatus('busy', 'Initializing browser scale benchmark', 'The first run loads Pyodide/Pandapower; subsequent runs reuse the same worker runtime.');
    setProgress(2, 'Starting P0-B', 'All physics computation remains on this device.');
    ensureWorker().postMessage({ type: 'run-p0b' });
  } else {
    ui.p0aButton.textContent = 'Running P0-A…';
    setStatus('busy', 'Re-running P0-A reference gate', 'Validating the minimal three-phase browser path.');
    setProgress(2, 'Starting P0-A', 'All physics computation remains on this device.');
    ensureWorker().postMessage({ type: 'run-p0a' });
  }
}

ui.button.addEventListener('click', () => runGate('p0b'));
ui.p0aButton.addEventListener('click', () => runGate('p0a'));

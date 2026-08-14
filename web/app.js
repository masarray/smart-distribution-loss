const ui = {
  button: document.querySelector('#runButton'),
  p0aButton: document.querySelector('#runP0AButton'),
  p0bButton: document.querySelector('#runP0BButton'),
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
  factsTitle: document.querySelector('#factsTitle'),
  checksTitle: document.querySelector('#checksTitle'),
  p1ChartPanel: document.querySelector('#p1ChartPanel'),
  profileChart: document.querySelector('#profileChart'),
  measurementPanel: document.querySelector('#measurementPanel'),
  measurementRows: document.querySelector('#measurementRows'),
};

let worker = null;
let running = false;
let liveP1Series = [];

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
  ui.p0bButton.disabled = isBusy;
}

function resetOutput() {
  ui.resultSection.classList.add('hidden');
  ui.errorSection.classList.add('hidden');
  ui.checkList.innerHTML = '';
  ui.benchmarkRows.innerHTML = '';
  ui.networkFacts.innerHTML = '';
  ui.measurementRows.innerHTML = '';
  ui.profileChart.innerHTML = '';
  ui.diagnostics.textContent = '';
  ui.benchmarkPanel.classList.add('hidden');
  ui.p1ChartPanel.classList.add('hidden');
  ui.measurementPanel.classList.add('hidden');
  liveP1Series = [];
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

function setMetric(slot, label, value) {
  setText(`mLabel${slot}`, label);
  setText(`m${slot}`, value);
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

function renderMeasurementInventory(items) {
  ui.measurementRows.innerHTML = '';
  for (const item of items || []) {
    const tr = document.createElement('tr');
    const values = [item.channel, item.records, item.resolution, item.status];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.appendChild(td);
    }
    ui.measurementRows.appendChild(tr);
  }
}

function renderProfileChart(series) {
  if (!series?.length) return;
  const width = 1000;
  const height = 260;
  const pad = { left: 56, right: 22, top: 22, bottom: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = series.map((r) => Number(r.source_kw) || 0);
  const maxValue = Math.max(...values, 1);
  const yMax = Math.ceil(maxValue / 20) * 20 || 20;
  const x = (i) => pad.left + (i / (series.length - 1)) * plotW;
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;
  const points = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');

  const grid = [];
  for (let i = 0; i <= 4; i += 1) {
    const value = yMax * (1 - i / 4);
    const yy = pad.top + (i / 4) * plotH;
    grid.push(`<line class="chart-grid" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" />`);
    grid.push(`<text class="chart-label" x="${pad.left - 10}" y="${yy + 4}" text-anchor="end">${value.toFixed(0)}</text>`);
  }

  const ticks = [0, 24, 48, 72, 95].map((i) => {
    const label = i === 95 ? '24:00' : series[i].time;
    return `<text class="chart-label" x="${x(i)}" y="${height - 10}" text-anchor="middle">${label}</text>`;
  }).join('');

  const peakIndex = values.indexOf(maxValue);
  const peakX = x(peakIndex);
  const peakY = y(maxValue);

  ui.profileChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="24 hour source active-power Ground Truth profile">
      ${grid.join('')}
      <text class="chart-axis-title" x="12" y="18">kW</text>
      <polyline class="chart-line" points="${points}" />
      <circle class="chart-peak" cx="${peakX}" cy="${peakY}" r="5" />
      <text class="chart-peak-label" x="${Math.min(peakX + 10, width - 120)}" y="${Math.max(peakY - 10, 18)}">${maxValue.toFixed(1)} kW · ${series[peakIndex].time}</text>
      ${ticks}
    </svg>`;
}

function renderP1(payload) {
  ui.resultSection.classList.remove('hidden');
  ui.p1ChartPanel.classList.remove('hidden');
  ui.measurementPanel.classList.remove('hidden');
  ui.benchmarkPanel.classList.add('hidden');

  const gt = payload.ground_truth;
  const s = payload.summary;
  setGate(payload.gate, '24-hour Ground Truth is ready', 'P1 Ground Truth gate did not pass');

  setMetric(1, 'Pyodide', payload.versions?.pyodide || '—');
  setMetric(2, 'Pandapower', payload.versions?.pandapower || '—');
  setMetric(3, 'Customers', String(gt.customer_count));
  setMetric(4, '15-min intervals', String(gt.intervals));
  setMetric(5, 'Source energy', `${fmtNumber(s.source_energy_kwh, 1)} kWh`);
  setMetric(6, 'Technical loss', `${fmtNumber(s.technical_loss_kwh, 2)} kWh · ${fmtNumber(s.technical_loss_percent, 2)}%`);
  setMetric(7, 'Peak source P', `${fmtNumber(s.peak_source_kw, 1)} kW · ${s.peak_time}`);
  setMetric(8, 'Minimum LV voltage', `${fmtNumber(s.minimum_lv_voltage_pu, 4)} pu`);

  ui.factsTitle.textContent = 'IMMUTABLE GROUND TRUTH';
  ui.checksTitle.textContent = 'P1 CHECKS';
  ui.networkFacts.innerHTML = '';
  addFact('Topology', gt.topology);
  addFact('Truth SHA-256', `${gt.truth_hash_short}…`);
  addFact('Deterministic seed', String(gt.seed));
  addFact('Resolution', `${gt.interval_minutes} min · ${gt.intervals} points/day`);
  addFact('Customer mix', `${gt.category_count.residential} residential · ${gt.category_count.small_commercial} small commercial`);
  addFact('True phase mapping', `A ${gt.phase_count.A} · B ${gt.phase_count.B} · C ${gt.phase_count.C}`);
  addFact('Customer energy', `${fmtNumber(s.customer_energy_kwh, 1)} kWh/day`);
  addFact('Loss decomposition', `TM ${fmtNumber(s.loss_breakdown_kwh.mv, 2)} · JTR ${fmtNumber(s.loss_breakdown_kwh.jtr, 2)} · SR ${fmtNumber(s.loss_breakdown_kwh.service, 2)} · Trafo ${fmtNumber(s.loss_breakdown_kwh.transformer, 2)} kWh`);
  addFact('Accounting residual', `${fmtNumber(s.accounting_residual_kwh, 4)} kWh · ${fmtNumber(s.accounting_residual_percent_source, 4)}%`);
  addFact('Peak transformer loading', `${fmtNumber(s.max_transformer_loading_percent, 1)}% · ${s.max_transformer_loading_time}`);
  addFact('Max LV unbalance', `${fmtNumber(s.max_unbalance_percent, 3)}% · ${s.max_unbalance_time}`);
  addFact('96 solver time', `${fmtNumber(s.solver_total_ms / 1000, 2)} s · avg ${fmtNumber(s.solver_average_ms, 1)} ms`);

  renderChecks(payload.checks);
  renderMeasurementInventory(payload.measurements?.inventory);
  renderProfileChart(payload.series);

  const diagnosticsView = {
    ...payload,
    ground_truth: {
      ...payload.ground_truth,
      customers: `[${payload.ground_truth.customers.length} immutable customer records hidden from diagnostics view]`,
    },
    measurements: {
      ...payload.measurements,
      customer_ami: `[${payload.measurements.customer_ami.length} customers × 96 interval values retained in browser memory]`,
    },
  };
  ui.diagnostics.textContent = JSON.stringify(diagnosticsView, null, 2);
}

function renderP0BCase(result) {
  ui.resultSection.classList.remove('hidden');
  ui.benchmarkPanel.classList.remove('hidden');
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
    <td><span class="table-status ${result.pass ? 'ok' : 'fail'}">${result.pass ? 'PASS' : 'FAIL'}</span></td>`;
  ui.benchmarkRows.appendChild(tr);
}

function renderP0B(payload) {
  ui.resultSection.classList.remove('hidden');
  ui.benchmarkPanel.classList.remove('hidden');
  ui.p1ChartPanel.classList.add('hidden');
  ui.measurementPanel.classList.add('hidden');
  const finalResult = payload.final;
  const c = finalResult.case;

  setGate(payload.gate, '90-customer browser scale remains viable', 'P0-B scale gate did not pass');
  setMetric(1, 'Pyodide', payload.versions.pyodide || '—');
  setMetric(2, 'Pandapower', payload.versions.pandapower || '—');
  setMetric(3, 'Customers', String(c.customer_count));
  setMetric(4, 'Network buses', String(c.buses));
  setMetric(5, '90-cust warm solve', fmtMs(c.repeat_average_ms));
  setMetric(6, '25 solve loop', fmtMs(c.repeat_total_ms));
  setMetric(7, 'Technical loss', `${fmtNumber(c.technical_loss_kw, 3)} kW`);
  setMetric(8, 'Minimum LV voltage', `${fmtNumber(c.min_voltage_pu, 4)} pu`);

  ui.factsTitle.textContent = '90-CUSTOMER NETWORK';
  ui.checksTitle.textContent = 'P0-B CHECKS';
  ui.networkFacts.innerHTML = '';
  addFact('Topology', '20 kV → 400 kVA → 3 JTR');
  addFact('Individual customers', `${c.customer_count}`);
  addFact('Synthetic peak load', `${fmtNumber(c.total_load_kw, 1)} kW / ${fmtNumber(c.total_load_kvar, 1)} kvar`);
  addFact('Phase customers', `A ${c.phase_customer_count.A} · B ${c.phase_customer_count.B} · C ${c.phase_customer_count.C}`);
  addFact('Transformer loading', `${fmtNumber(c.transformer_loading_percent, 1)}%`);
  addFact('Max line loading', `${fmtNumber(c.max_line_loading_percent, 1)}%`);
  addFact('Technical loss', `${fmtNumber(c.loss_percent, 2)}% of source P`);
  renderChecks(finalResult.checks);
  ui.diagnostics.textContent = JSON.stringify(payload, null, 2);
}

function renderP0A(payload) {
  ui.resultSection.classList.remove('hidden');
  ui.benchmarkPanel.classList.add('hidden');
  ui.p1ChartPanel.classList.add('hidden');
  ui.measurementPanel.classList.add('hidden');
  setGate(payload.gate, 'P0-A browser physics path remains viable', 'P0-A browser physics gate did not pass');

  const timing = payload.timing_ms || {};
  const electrical = payload.electrical || {};
  setMetric(1, 'Pyodide', payload.versions?.pyodide || '0.28.3');
  setMetric(2, 'Pandapower', payload.versions?.pandapower || '—');
  setMetric(3, 'Loads', '1 asymmetric');
  setMetric(4, 'Network buses', String(payload.network?.buses ?? '—'));
  setMetric(5, 'First solve', fmtMs(timing.first_solve));
  setMetric(6, 'Warm solve', fmtMs(timing.repeat_average));
  setMetric(7, 'Technical loss', `${fmtNumber(electrical.total_loss_kw, 3)} kW`);
  setMetric(8, 'Min phase voltage', `${fmtNumber(Math.min(electrical.vm_a_pu, electrical.vm_b_pu, electrical.vm_c_pu), 4)} pu`);

  ui.factsTitle.textContent = 'P0-A REFERENCE';
  ui.checksTitle.textContent = 'P0-A CHECKS';
  ui.networkFacts.innerHTML = '';
  addFact('Reference network', 'Official-style minimal 3φ case');
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

    if (msg.type === 'p1-start') {
      setStatus('busy', 'Ground Truth initialized', `Truth ${msg.payload.truth_hash_short}… · ${msg.payload.customers} customers · ${msg.payload.intervals} intervals`);
      return;
    }

    if (msg.type === 'p1-step') {
      liveP1Series.push(msg.payload);
      setStatus('busy', '24-hour Ground Truth simulation running', `${msg.payload.time} completed · source ${fmtNumber(msg.payload.source_kw, 1)} kW · loss ${fmtNumber(msg.payload.technical_loss_kw, 2)} kW`);
      return;
    }

    if (msg.type === 'result') {
      running = false;
      setButtonsBusy(false);
      setProgress(100, 'Completed', msg.payload.gate.pass ? 'All mandatory checks passed.' : 'One or more mandatory checks failed.');
      setStatus(msg.payload.gate.pass ? 'ok' : 'fail', msg.payload.gate.pass ? 'Engine ready' : 'Gate failed', msg.payload.gate.summary);

      if (msg.phase === 'p1') {
        ui.button.textContent = 'Run P1 Again';
        renderP1(msg.payload);
      } else if (msg.phase === 'p0b') {
        ui.p0bButton.textContent = 'P0-B Again';
        renderP0B(msg.payload);
      } else {
        ui.p0aButton.textContent = 'P0-A Again';
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
  resetOutput();
  setButtonsBusy(true);

  if (phase === 'p1') {
    ui.button.textContent = 'Simulating 24 h…';
    setStatus('busy', 'Initializing P1 Ground Truth', 'The first run loads Pyodide/Pandapower; subsequent runs reuse the same worker runtime.');
    setProgress(2, 'Starting P1', '90 customers × 96 intervals · all computation remains on this device.');
    ensureWorker().postMessage({ type: 'run-p1' });
  } else if (phase === 'p0b') {
    ui.p0bButton.textContent = 'Benchmarking…';
    setStatus('busy', 'Re-running P0-B', 'Validating the 90-customer browser scale gate.');
    setProgress(2, 'Starting P0-B', 'All physics computation remains on this device.');
    ensureWorker().postMessage({ type: 'run-p0b' });
  } else {
    ui.p0aButton.textContent = 'Running…';
    setStatus('busy', 'Re-running P0-A', 'Validating the minimal three-phase browser path.');
    setProgress(2, 'Starting P0-A', 'All physics computation remains on this device.');
    ensureWorker().postMessage({ type: 'run-p0a' });
  }
}

ui.button.addEventListener('click', () => runGate('p1'));
ui.p0aButton.addEventListener('click', () => runGate('p0a'));
ui.p0bButton.addEventListener('click', () => runGate('p0b'));

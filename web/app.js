const ui = {
  runButton: document.querySelector('#runButton'),
  p0aButton: document.querySelector('#runP0AButton'),
  p0bButton: document.querySelector('#runP0BButton'),
  p1Button: document.querySelector('#runP1Button'),
  preset: document.querySelector('#qualityPreset'),
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
  factsTitle: document.querySelector('#factsTitle'),
  checksTitle: document.querySelector('#checksTitle'),
  networkFacts: document.querySelector('#networkFacts'),
  checkList: document.querySelector('#checkList'),
  diagnostics: document.querySelector('#diagnostics'),
  chartPanel: document.querySelector('#chartPanel'),
  chartTitle: document.querySelector('#chartTitle'),
  chartSubtitle: document.querySelector('#chartSubtitle'),
  chartLegend: document.querySelector('#chartLegend'),
  profileChart: document.querySelector('#profileChart'),
  degradationPanel: document.querySelector('#degradationPanel'),
  degradationRows: document.querySelector('#degradationRows'),
  benchmarkPanel: document.querySelector('#benchmarkPanel'),
  benchmarkRows: document.querySelector('#benchmarkRows'),
  measurementPanel: document.querySelector('#measurementPanel'),
  measurementRows: document.querySelector('#measurementRows'),
  samplePanel: document.querySelector('#samplePanel'),
  sampleRows: document.querySelector('#sampleRows'),
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

function setButtonsBusy(isBusy) {
  ui.runButton.disabled = isBusy;
  ui.p0aButton.disabled = isBusy;
  ui.p0bButton.disabled = isBusy;
  ui.p1Button.disabled = isBusy;
  ui.preset.disabled = isBusy;
}

function resetOutput() {
  ui.resultSection.classList.add('hidden');
  ui.errorSection.classList.add('hidden');
  ui.chartPanel.classList.add('hidden');
  ui.degradationPanel.classList.add('hidden');
  ui.benchmarkPanel.classList.add('hidden');
  ui.measurementPanel.classList.add('hidden');
  ui.samplePanel.classList.add('hidden');
  ui.networkFacts.innerHTML = '';
  ui.checkList.innerHTML = '';
  ui.diagnostics.textContent = '';
  ui.profileChart.innerHTML = '';
  ui.chartLegend.innerHTML = '';
  ui.degradationRows.innerHTML = '';
  ui.benchmarkRows.innerHTML = '';
  ui.measurementRows.innerHTML = '';
  ui.sampleRows.innerHTML = '';
}

function fmtNumber(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function fmtSigned(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

function fmtMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(0)} ms`;
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
  ui.gateReason.textContent = gate.summary || '';
  ui.gateBadge.textContent = gate.pass ? 'PASS' : 'FAIL';
  ui.gateBadge.className = `gate-badge ${gate.pass ? 'pass' : 'fail'}`;
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

function chartGrid(width, height, pad, yMax, unit) {
  const lines = [];
  const plotH = height - pad.top - pad.bottom;
  for (let i = 0; i <= 4; i += 1) {
    const value = yMax * (1 - i / 4);
    const yy = pad.top + (i / 4) * plotH;
    lines.push(`<line class="chart-grid" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" />`);
    lines.push(`<text class="chart-label" x="${pad.left - 10}" y="${yy + 4}" text-anchor="end">${value.toFixed(yMax < 10 ? 1 : 0)}</text>`);
  }
  lines.push(`<text class="chart-axis-title" x="12" y="18">${unit}</text>`);
  return lines.join('');
}

function chartTicks(series, x, height) {
  const indexes = [0, 24, 48, 72, 95].filter((i) => i < series.length);
  return indexes.map((i) => {
    const label = i === 95 ? '24:00' : series[i].time;
    return `<text class="chart-label" x="${x(i)}" y="${height - 10}" text-anchor="middle">${label}</text>`;
  }).join('');
}

function renderSingleChart(series, key, unit, legend, subtitle) {
  if (!series?.length) return;
  ui.chartPanel.classList.remove('hidden');
  ui.chartTitle.textContent = '24-HOUR GROUND TRUTH PROFILE';
  ui.chartSubtitle.textContent = subtitle;
  ui.chartLegend.innerHTML = `<span><i class="legend-line"></i>${legend}</span>`;

  const width = 1000;
  const height = 260;
  const pad = { left: 56, right: 22, top: 22, bottom: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = series.map((r) => Number(r[key]) || 0);
  const maxValue = Math.max(...values, 1);
  const step = maxValue < 10 ? 2 : 20;
  const yMax = Math.ceil(maxValue / step) * step;
  const x = (i) => pad.left + (i / Math.max(series.length - 1, 1)) * plotW;
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;
  const points = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const peakIndex = values.indexOf(maxValue);

  ui.profileChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img">
      ${chartGrid(width, height, pad, yMax, unit)}
      <polyline class="chart-line" points="${points}" />
      <circle class="chart-peak" cx="${x(peakIndex)}" cy="${y(maxValue)}" r="5" />
      <text class="chart-peak-label" x="${Math.min(x(peakIndex) + 10, width - 140)}" y="${Math.max(y(maxValue) - 10, 18)}">${maxValue.toFixed(1)} ${unit} · ${series[peakIndex].time}</text>
      ${chartTicks(series, x, height)}
    </svg>`;
}

function renderDualChart(series, truthKey, modelKey, unit) {
  if (!series?.length) return;
  ui.chartPanel.classList.remove('hidden');
  ui.chartTitle.textContent = '24-HOUR TECHNICAL-LOSS DIVERGENCE';
  ui.chartSubtitle.textContent = 'Hidden Ground Truth is shown only for synthetic validation; the conventional model does not receive it as input.';
  ui.chartLegend.innerHTML = `
    <span><i class="legend-line"></i>Ground Truth</span>
    <span><i class="legend-line secondary"></i>Conventional</span>`;

  const width = 1000;
  const height = 270;
  const pad = { left: 56, right: 22, top: 22, bottom: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const truth = series.map((r) => Number(r[truthKey]) || 0);
  const model = series.map((r) => Number(r[modelKey]) || 0);
  const maxValue = Math.max(...truth, ...model, 1);
  const step = maxValue < 10 ? 1 : 5;
  const yMax = Math.ceil(maxValue / step) * step;
  const x = (i) => pad.left + (i / Math.max(series.length - 1, 1)) * plotW;
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;
  const truthPoints = truth.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const modelPoints = model.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');

  ui.profileChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Ground Truth and conventional technical-loss profiles">
      ${chartGrid(width, height, pad, yMax, unit)}
      <polyline class="chart-line" points="${truthPoints}" />
      <polyline class="chart-line secondary" points="${modelPoints}" />
      ${chartTicks(series, x, height)}
    </svg>`;
}

function renderP2(payload) {
  ui.resultSection.classList.remove('hidden');
  ui.degradationPanel.classList.remove('hidden');
  ui.samplePanel.classList.remove('hidden');
  const s = payload.summary;
  const c = payload.coverage;

  setGate(payload.gate, 'Imperfect observability produces measurable model error', 'P2 degradation gate did not pass');
  setMetric(1, 'Data quality preset', payload.preset_label);
  setMetric(2, 'Phase known', `${fmtNumber(c.phase_known_percent, 1)}%`);
  setMetric(3, 'AMI coverage', `${fmtNumber(c.ami_available_percent, 1)}%`);
  setMetric(4, 'PF known', `${fmtNumber(c.pf_known_percent, 1)}%`);
  setMetric(5, 'Ground Truth loss', `${fmtNumber(s.truth_loss_kwh, 2)} kWh`);
  setMetric(6, 'Conventional loss', `${fmtNumber(s.conventional_loss_kwh, 2)} kWh`);
  setMetric(7, 'Loss error', `${fmtSigned(s.loss_error_percent, 2)}%`);
  setMetric(8, 'Source P NRMSE', `${fmtNumber(s.source_nrmse_percent, 2)}%`);

  ui.factsTitle.textContent = 'IMPERFECT OBSERVABILITY';
  ui.checksTitle.textContent = 'P2 CHECKS';
  addFact('Ground Truth hash', `${payload.truth_hash_short}… unchanged`);
  addFact('Mapping known', `${fmtNumber(c.mapping_known_percent, 1)}%`);
  addFact('Timestamp aligned', `${fmtNumber(c.timestamp_aligned_percent, 1)}%`);
  addFact('Phase assignment accuracy', `${fmtNumber(s.phase_assignment_accuracy_percent_validation_only, 1)}% · validation only`);
  addFact('Customer-energy error', `${fmtSigned(s.customer_energy_error_percent, 2)}%`);
  addFact('Phase P residual RMSE', `${fmtNumber(s.phase_rmse_kw, 3)} kW`);
  addFact('LV voltage residual RMSE', `${fmtNumber(s.voltage_rmse_pu, 5)} pu`);
  addFact('Loss profile RMSE', `${fmtNumber(s.loss_profile_rmse_kw, 3)} kW`);
  addFact('Conventional voltage range', `${fmtNumber(s.min_model_voltage_pu, 4)}–${fmtNumber(s.max_model_voltage_pu, 4)} pu`);
  addFact('96 conventional solves', `${fmtNumber(s.solver_total_ms / 1000, 2)} s · avg ${fmtNumber(s.solver_average_ms, 1)} ms`);
  addFact('Smart calibration', 'OFF · P3 only');

  renderChecks(payload.checks);
  renderDualChart(payload.series, 'truth_loss_kw', 'conventional_loss_kw', 'kW');

  for (const item of payload.degradation_inventory || []) {
    const tr = document.createElement('tr');
    for (const value of [item.item, item.target, item.actual, item.model_action]) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.appendChild(td);
    }
    ui.degradationRows.appendChild(tr);
  }

  for (const item of payload.sample_conventional_view || []) {
    const tr = document.createElement('tr');
    const values = [
      String(item.customer_id).padStart(3, '0'),
      `JTR-${item.branch} / P${item.pole}`,
      item.phase,
      item.pf,
      item.ami,
      item.mapping,
      item.timestamp,
    ];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.appendChild(td);
    }
    ui.sampleRows.appendChild(tr);
  }

  const diagnosticsView = {
    ...payload,
    series: `[${payload.series?.length || 0} interval comparison records retained in browser memory]`,
  };
  ui.diagnostics.textContent = JSON.stringify(diagnosticsView, null, 2);
}

function renderP1(payload) {
  ui.resultSection.classList.remove('hidden');
  ui.measurementPanel.classList.remove('hidden');
  const gt = payload.ground_truth;
  const s = payload.summary;
  setGate(payload.gate, '24-hour Ground Truth remains viable', 'P1 Ground Truth gate did not pass');
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
  addFact('Topology', gt.topology);
  addFact('Truth SHA-256', `${gt.truth_hash_short}…`);
  addFact('Customer mix', `${gt.category_count.residential} residential · ${gt.category_count.small_commercial} small commercial`);
  addFact('True phase mapping', `A ${gt.phase_count.A} · B ${gt.phase_count.B} · C ${gt.phase_count.C}`);
  addFact('Customer energy', `${fmtNumber(s.customer_energy_kwh, 1)} kWh/day`);
  addFact('Accounting residual', `${fmtNumber(s.accounting_residual_kwh, 4)} kWh · ${fmtNumber(s.accounting_residual_percent_source, 4)}%`);
  addFact('96 solver time', `${fmtNumber(s.solver_total_ms / 1000, 2)} s · avg ${fmtNumber(s.solver_average_ms, 1)} ms`);
  renderChecks(payload.checks);
  renderSingleChart(payload.series, 'source_kw', 'kW', 'Source P', 'Source active power from 96 real three-phase Ground Truth intervals.');

  for (const item of payload.measurements?.inventory || []) {
    const tr = document.createElement('tr');
    for (const value of [item.channel, item.records, item.resolution, item.status]) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.appendChild(td);
    }
    ui.measurementRows.appendChild(tr);
  }

  const diagnosticsView = {
    ...payload,
    ground_truth: { ...payload.ground_truth, customers: '[90 immutable records hidden]' },
    measurements: { ...payload.measurements, customer_ami: '[90 × 96 values hidden]' },
  };
  ui.diagnostics.textContent = JSON.stringify(diagnosticsView, null, 2);
}

function renderP0BCase(result) {
  ui.resultSection.classList.remove('hidden');
  ui.benchmarkPanel.classList.remove('hidden');
  const c = result.case;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><strong>${c.customer_count}</strong></td><td>${c.buses}</td><td>${c.lines}</td>
    <td>${fmtMs(c.build_ms)}</td><td>${fmtMs(c.first_solve_ms)}</td><td>${fmtMs(c.repeat_average_ms)}</td>
    <td>${fmtNumber(c.technical_loss_kw, 3)} kW</td><td>${fmtNumber(c.min_voltage_pu, 4)} pu</td>
    <td>${fmtNumber(c.max_unbalance_percent, 3)}%</td><td><span class="table-status ${result.pass ? 'ok' : 'fail'}">${result.pass ? 'PASS' : 'FAIL'}</span></td>`;
  ui.benchmarkRows.appendChild(tr);
}

function renderP0B(payload) {
  ui.resultSection.classList.remove('hidden');
  ui.benchmarkPanel.classList.remove('hidden');
  const c = payload.final.case;
  setGate(payload.gate, '90-customer browser scale remains viable', 'P0-B scale gate did not pass');
  setMetric(1, 'Pyodide', payload.versions.pyodide || '—');
  setMetric(2, 'Pandapower', payload.versions.pandapower || '—');
  setMetric(3, 'Customers', String(c.customer_count));
  setMetric(4, 'Network buses', String(c.buses));
  setMetric(5, 'Warm solve', fmtMs(c.repeat_average_ms));
  setMetric(6, '25 solve loop', fmtMs(c.repeat_total_ms));
  setMetric(7, 'Technical loss', `${fmtNumber(c.technical_loss_kw, 3)} kW`);
  setMetric(8, 'Minimum LV voltage', `${fmtNumber(c.min_voltage_pu, 4)} pu`);
  ui.factsTitle.textContent = '90-CUSTOMER NETWORK';
  ui.checksTitle.textContent = 'P0-B CHECKS';
  addFact('Transformer loading', `${fmtNumber(c.transformer_loading_percent, 1)}%`);
  addFact('Max line loading', `${fmtNumber(c.max_line_loading_percent, 1)}%`);
  addFact('Max unbalance', `${fmtNumber(c.max_unbalance_percent, 3)}%`);
  renderChecks(payload.final.checks);
  ui.diagnostics.textContent = JSON.stringify(payload, null, 2);
}

function renderP0A(payload) {
  ui.resultSection.classList.remove('hidden');
  const t = payload.timing_ms || {};
  const e = payload.electrical || {};
  setGate(payload.gate, 'P0-A browser physics path remains viable', 'P0-A gate did not pass');
  setMetric(1, 'Pyodide', payload.versions?.pyodide || '—');
  setMetric(2, 'Pandapower', payload.versions?.pandapower || '—');
  setMetric(3, 'Loads', '1 asymmetric');
  setMetric(4, 'Network buses', String(payload.network?.buses ?? '—'));
  setMetric(5, 'First solve', fmtMs(t.first_solve));
  setMetric(6, 'Warm solve', fmtMs(t.repeat_average));
  setMetric(7, 'Technical loss', `${fmtNumber(e.total_loss_kw, 3)} kW`);
  setMetric(8, 'LV unbalance', `${fmtNumber(e.lv_unbalance_percent, 3)}%`);
  ui.factsTitle.textContent = 'P0-A REFERENCE';
  ui.checksTitle.textContent = 'P0-A CHECKS';
  addFact('Reference delta', `${Number(e.reference_delta_pu || 0).toExponential(3)} pu`);
  addFact('Repeat delta', `${Number(e.repeat_delta_pu || 0).toExponential(3)} pu`);
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
      setStatus('busy', 'Ground Truth initialized', `${msg.payload.customers} customers · ${msg.payload.intervals} intervals · hash ${msg.payload.truth_hash_short}…`);
      return;
    }
    if (msg.type === 'p1-step') {
      setStatus('busy', 'Ground Truth simulation running', `${msg.payload.time} completed · ${msg.index + 1}/96`);
      return;
    }
    if (msg.type === 'p2-start') {
      setStatus('busy', `${msg.payload.preset_label} degradation applied`, `${msg.payload.counts.unknown_phase} phase unknown · ${msg.payload.counts.missing_ami} AMI missing · ${msg.payload.counts.unknown_pf} PF unknown`);
      return;
    }
    if (msg.type === 'p2-step') {
      setStatus('busy', 'Conventional model running', `${msg.payload.time} completed · ${msg.index + 1}/96`);
      return;
    }
    if (msg.type === 'result') {
      running = false;
      setButtonsBusy(false);
      ui.runButton.textContent = 'Run P2 Again';
      setProgress(100, 'Completed', msg.payload.gate.pass ? 'All mandatory checks passed.' : 'One or more mandatory checks failed.');
      setStatus(msg.payload.gate.pass ? 'ok' : 'fail', msg.payload.gate.pass ? 'Engine ready' : 'Gate failed', msg.payload.gate.summary);
      if (msg.phase === 'p2') renderP2(msg.payload);
      else if (msg.phase === 'p1') renderP1(msg.payload);
      else if (msg.phase === 'p0b') renderP0B(msg.payload);
      else renderP0A(msg.payload);
      return;
    }
    if (msg.type === 'error') {
      running = false;
      setButtonsBusy(false);
      ui.runButton.textContent = 'Retry P2';
      setStatus('fail', 'Engine error', msg.message || 'Browser physics execution failed.');
      setProgress(0, 'Failed', msg.message || 'See diagnostics below.');
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

function runPhase(phase) {
  if (running) return;
  running = true;
  resetOutput();
  setButtonsBusy(true);

  if (phase === 'p2') {
    const preset = ui.preset.value || 'typical';
    ui.runButton.textContent = 'Running P2…';
    setStatus('busy', 'Preparing P2 observability experiment', `${preset.toUpperCase()} preset · Ground Truth remains hidden and immutable.`);
    setProgress(2, 'Starting P2', 'All data degradation and physics computation remain on this device.');
    ensureWorker().postMessage({ type: 'run-p2', preset });
  } else if (phase === 'p1') {
    setStatus('busy', 'Re-running P1 Ground Truth', '96 immutable three-phase intervals.');
    setProgress(2, 'Starting P1', 'Regression check before/after P2 development.');
    ensureWorker().postMessage({ type: 'run-p1' });
  } else if (phase === 'p0b') {
    setStatus('busy', 'Re-running P0-B scale gate', '1 → 90 customer browser benchmark.');
    setProgress(2, 'Starting P0-B', 'Regression scale test.');
    ensureWorker().postMessage({ type: 'run-p0b' });
  } else {
    setStatus('busy', 'Re-running P0-A reference gate', 'Minimal three-phase physics reference.');
    setProgress(2, 'Starting P0-A', 'Regression physics test.');
    ensureWorker().postMessage({ type: 'run-p0a' });
  }
}

ui.runButton.addEventListener('click', () => runPhase('p2'));
ui.p1Button.addEventListener('click', () => runPhase('p1'));
ui.p0bButton.addEventListener('click', () => runPhase('p0b'));
ui.p0aButton.addEventListener('click', () => runPhase('p0a'));

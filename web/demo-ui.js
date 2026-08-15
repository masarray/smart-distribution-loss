(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const presetProfiles = {
    good: { label: 'Good field data', ami: 95.0, phase: 90.0, pf: 80.0, mapping: 98.9, verdict: 'Strong' },
    typical: { label: 'Typical field data', ami: 80.0, phase: 65.6, pf: 40.0, mapping: 94.4, verdict: 'Imperfect' },
    poor: { label: 'Poor field data', ami: 60.0, phase: 40.0, pf: 20.0, mapping: 90.0, verdict: 'Weak' },
  };

  const publicWorkspace = $('#publicWorkspace');
  const engineeringWorkspace = $('#engineeringWorkspace');
  const preset = $('#qualityPreset');
  const diagnostics = $('#diagnostics');
  const progressBar = $('#progressBar');
  const progressLabel = $('#progressLabel');
  const progressPct = $('#progressPct');
  const gateBadge = $('#gateBadge');
  const chartPlaceholder = $('#chartPlaceholder');
  const sld = $('#distributionSld');

  function text(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function pct(value, digits = 1) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(digits)}%` : '—';
  }

  function num(value, digits = 2) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : '—';
  }

  function signed(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
  }

  function updatePresetProfile() {
    const profile = presetProfiles[preset?.value] || presetProfiles.typical;
    text('demoPresetLabel', profile.label);
    text('demoAmiCoverage', pct(profile.ami));
    text('demoPhaseKnown', pct(profile.phase));
    text('demoPfKnown', pct(profile.pf));
    text('demoMappingKnown', pct(profile.mapping));
    text('demoInputVerdict', profile.verdict);
    const bars = [
      ['demoAmiBar', profile.ami],
      ['demoPhaseBar', profile.phase],
      ['demoPfBar', profile.pf],
      ['demoMappingBar', profile.mapping],
    ];
    bars.forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.style.width = `${Math.max(0, Math.min(100, value))}%`;
    });
  }

  function showPublic() {
    publicWorkspace?.classList.remove('hidden');
    engineeringWorkspace?.classList.add('hidden');
  }

  function showEngineering() {
    publicWorkspace?.classList.add('hidden');
    engineeringWorkspace?.classList.remove('hidden');
  }

  function activateNav(target) {
    $$('.nav-command').forEach((button) => button.classList.toggle('is-active', button.dataset.navTarget === target));
  }

  function navigate(target) {
    if (target === 'engineering') {
      showEngineering();
      activateNav('engineering');
      engineeringWorkspace?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    showPublic();
    activateNav(target === 'overview' ? 'overview' : target);
    const anchors = {
      overview: '#overviewSection',
      network: '#networkSection',
      calibration: '#calibrationSection',
    };
    const anchor = $(anchors[target] || anchors.overview);
    window.requestAnimationFrame(() => anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  $$('[data-nav-target]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.navTarget || 'overview'));
  });

  preset?.addEventListener('change', updatePresetProfile);
  updatePresetProfile();

  function resetPublicResult() {
    text('demoConventionalLoss', '—');
    text('demoSmartLoss', '—');
    text('demoConventionalError', 'baseline estimate');
    text('demoSmartError', 'calibrated estimate');
    text('demoLossImprovement', '—');
    text('demoImprovementCopy', 'Waiting for physics validation');
    text('demoSourceFit', '—');
    text('demoPhaseFit', '—');
    text('demoValidation', '—');
    text('demoTruthLoss', 'Hidden');
    text('demoTruthAccess', 'TRUTH ACCESS · BLOCKED');
    text('demoRailTitle', 'Smart analysis running');
    text('demoRailState', 'RUNNING');
    text('sldSmartLoss', 'Calculating…');
    text('sldSmartLossSub', '96 interval physics validation');
    text('demoGuardValidation', 'Analysis in progress');
    text('demoPipelineVerdict', 'Running calibration stages');
    const verdict = $('#demoPipelineVerdict');
    verdict?.classList.remove('is-pass');
    verdict?.classList.add('is-running');
    sld?.classList.remove('is-complete');
    sld?.classList.add('is-running');
    chartPlaceholder?.classList.remove('hidden');
    $$('.pipeline-step').forEach((step) => {
      step.classList.remove('is-pass', 'is-running');
      const state = step.querySelector('.step-state');
      if (state) state.textContent = 'WAIT';
    });
  }

  $('#runButton')?.addEventListener('click', () => {
    resetPublicResult();
    showPublic();
    activateNav('overview');
  });

  function normalizedStage(stage) {
    if (!stage) return '';
    if (stage.includes('Physics validation')) return 'Physics validation model';
    return stage;
  }

  function updatePipeline(trace = []) {
    const byStage = new Map(trace.map((item) => [normalizedStage(item.stage), item]));
    $$('.pipeline-step').forEach((step) => {
      const stage = step.dataset.stage;
      const match = byStage.get(stage);
      const state = step.querySelector('.step-state');
      step.classList.remove('is-running');
      if (match) {
        step.classList.add('is-pass');
        if (state) state.textContent = match.status === 'READY' ? 'READY' : 'DONE';
        const paragraph = step.querySelector('p');
        if (paragraph && match.detail) {
          const compact = String(match.detail).replace(/\s+/g, ' ').trim();
          paragraph.textContent = compact.length > 88 ? `${compact.slice(0, 85)}…` : compact;
        }
      }
    });
  }

  function renderPublicPayload(payload) {
    if (!payload?.comparison) return;
    const conventional = payload.comparison.conventional || {};
    const smart = payload.comparison.smart || {};
    const truth = payload.comparison.truth || {};
    const checks = payload.checks || [];
    const unresolved = payload.unresolved || [];

    const convErr = Math.abs(Number(conventional.loss_error_percent_validation_only));
    const smartErr = Math.abs(Number(smart.loss_error_percent_validation_only));
    const reduction = Number.isFinite(convErr) && convErr > 0 && Number.isFinite(smartErr)
      ? Math.max(0, ((convErr - smartErr) / convErr) * 100)
      : null;

    text('demoRailTitle', payload.gate?.pass ? 'Smart model validated' : 'Engineering review required');
    text('demoRailState', payload.gate?.pass ? 'PASS' : 'REVIEW');
    text('demoConventionalLoss', `${num(conventional.loss_kwh, 2)} kWh`);
    text('demoSmartLoss', `${num(smart.loss_kwh, 2)} kWh`);
    text('demoConventionalError', `${signed(conventional.loss_error_percent_validation_only)} error`);
    text('demoSmartError', `${signed(smart.loss_error_percent_validation_only)} error`);
    text('demoLossImprovement', reduction == null ? '—' : `${num(reduction, 1)}%`);
    text('demoImprovementCopy', reduction == null ? 'No comparison available' : 'smaller absolute error vs conventional');
    text('demoSourceFit', `${num(conventional.source_nrmse_percent, 2)} → ${num(smart.source_nrmse_percent, 2)}%`);
    text('demoPhaseFit', `${num(conventional.phase_rmse_kw, 2)} → ${num(smart.phase_rmse_kw, 2)}`);
    text('demoHoldout', String(payload.split?.validation_intervals ?? 32));
    text('demoValidation', `${checks.filter((item) => item.pass).length}/${checks.length}`);
    text('demoTruthLoss', `${num(truth.loss_kwh, 2)} kWh`);
    text('demoTruthAccess', 'TRUTH ACCESS · VALIDATION ONLY');
    text('demoHeldCount', String(unresolved.length));
    text('demoHeldCopy', unresolved.length
      ? `${unresolved.map((item) => item.parameter).join(' · ')} remain intentionally unresolved.`
      : 'No parameters were held in this scenario.');
    text('sldSmartLoss', `${num(smart.loss_kwh, 2)} kWh/day`);
    text('sldSmartLossSub', `Conventional ${num(conventional.loss_kwh, 2)} · validation ${num(truth.loss_kwh, 2)}`);
    text('demoGuardValidation', payload.gate?.pass ? `${checks.filter((item) => item.pass).length}/${checks.length} checks passed` : 'Gate needs review');

    const verdict = $('#demoPipelineVerdict');
    if (verdict) {
      verdict.textContent = payload.gate?.pass ? 'Calibration + hold-out physics passed' : 'One or more gates require review';
      verdict.classList.remove('is-running');
      verdict.classList.toggle('is-pass', Boolean(payload.gate?.pass));
    }
    updatePipeline(payload.trace || []);

    sld?.classList.remove('is-running');
    sld?.classList.toggle('is-complete', Boolean(payload.gate?.pass));
    if (!$('#chartPanel')?.classList.contains('hidden')) chartPlaceholder?.classList.add('hidden');
  }

  function tryReadDiagnostics() {
    const raw = diagnostics?.textContent?.trim();
    if (!raw || !raw.startsWith('{')) return;
    try {
      renderPublicPayload(JSON.parse(raw));
    } catch (_) {
      // Diagnostics can be mid-write while the renderer is updating; next mutation retries.
    }
  }

  if (diagnostics) {
    new MutationObserver(tryReadDiagnostics).observe(diagnostics, { childList: true, characterData: true, subtree: true });
  }

  if (gateBadge) {
    new MutationObserver(() => {
      if (gateBadge.textContent?.trim() === 'PASS') {
        const verdict = $('#demoPipelineVerdict');
        verdict?.classList.remove('is-running');
        verdict?.classList.add('is-pass');
      }
    }).observe(gateBadge, { childList: true, characterData: true, subtree: true });
  }

  function syncActivePipelineStage() {
    const label = progressLabel?.textContent?.trim() || '';
    $$('.pipeline-step').forEach((step) => step.classList.remove('is-running'));
    let candidate = null;
    if (/timestamp/i.test(label)) candidate = 'Timestamp alignment';
    else if (/missing|AMI reconstruction/i.test(label)) candidate = 'Missing-AMI reconstruction';
    else if (/phase/i.test(label)) candidate = 'Unknown-phase inference';
    else if (/PF|reactive/i.test(label)) candidate = 'Unknown-PF calibration';
    else if (/network parameter|identifiable/i.test(label)) candidate = 'Network-parameter calibration';
    else if (/validating smart|physics model|Scoring Smart/i.test(label)) candidate = 'Physics validation model';
    if (candidate) {
      const step = $(`.pipeline-step[data-stage="${candidate}"]`);
      step?.classList.add('is-running');
      const state = step?.querySelector('.step-state');
      if (state) state.textContent = 'LIVE';
    }
  }

  if (progressLabel) {
    new MutationObserver(syncActivePipelineStage).observe(progressLabel, { childList: true, characterData: true, subtree: true });
  }

  if (progressBar) {
    new MutationObserver(() => {
      const value = Number.parseFloat(progressPct?.textContent || '0');
      if (Number.isFinite(value) && value >= 100 && gateBadge?.textContent?.trim() === 'PASS') {
        sld?.classList.remove('is-running');
        sld?.classList.add('is-complete');
      }
    }).observe(progressBar, { attributes: true, attributeFilter: ['style'] });
  }

  // Keep public demo as the default landing experience even when CI discovers the hidden engineering nodes.
  showPublic();
  activateNav('overview');
})();

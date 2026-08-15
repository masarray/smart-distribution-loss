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
  const runButton = $('#runButton');
  const errorSection = $('#errorSection');
  const errorMessage = $('#errorMessage');

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

  function setPipelineVerdict(message, state = 'idle') {
    const node = $('#demoPipelineVerdict');
    if (!node) return;
    node.classList.toggle('is-running', state === 'running');
    node.classList.toggle('is-pass', state === 'pass');
    node.innerHTML = `<span aria-hidden="true"></span>${message}`;
  }

  function normalizeSldGeometry() {
    const busbar = $('.sld-lv-bus .busbar');
    busbar?.setAttribute('d', 'M453 205v220');
    const branch2Wire = $('.branch-2 .branch-wire');
    const branch2Breaker = $('.branch-2 .breaker-node');
    branch2Wire?.setAttribute('d', 'M453 325H615');
    branch2Breaker?.setAttribute('cy', '325');
    const branch3Wire = $('.branch-3 .branch-wire');
    const branch3Breaker = $('.branch-3 .breaker-node');
    branch3Wire?.setAttribute('d', 'M453 425H615');
    branch3Breaker?.setAttribute('cy', '425');
  }

  function installPlnDiscussionProof() {
    const hero = $('#overviewSection');
    if (!hero || $('#plnDiscussionProof')) return;

    const title = hero.querySelector('.scenario-copy h2');
    const copy = hero.querySelector('.scenario-copy p');
    if (title) title.textContent = 'Same physics. Different observability.';
    if (copy) copy.textContent = 'Spot load / pelanggan TM is usually easy to model because P, Q, phase and topology are directly observed. A distribution transformer feeding many LV customers is different: missing AMI, phase, PF, mapping and timing create state uncertainty. Smart Engine reconstructs only measurement-supported states, then validates technical losses with real unbalanced 3-phase power flow.';

    const section = document.createElement('section');
    section.id = 'plnDiscussionProof';
    section.className = 'pln-proof-stage panel';
    section.innerHTML = `
      <header class="pln-proof-header">
        <div>
          <small>PLN DISCUSSION DEMO · SUSUT JARINGAN</small>
          <h3>Why spot load is easy — and why gardu distribusi needs a Smart Engine</h3>
          <p>The solver is the same. What changes is how much of the real network state is observable.</p>
        </div>
        <div class="pln-proof-verdict" id="plnProofVerdict"><span></span> Run analysis to prove both cases</div>
      </header>

      <div class="pln-proof-grid">
        <article class="proof-card proof-card-spot">
          <div class="proof-card-head">
            <span class="proof-number">01</span>
            <div><small>HIGH OBSERVABILITY</small><h4>Spot Load / Pelanggan TM</h4></div>
            <b class="proof-state" id="spotProofState">READY</b>
          </div>
          <div class="proof-mini-sld" aria-hidden="true">
            <span class="proof-grid-node">GRID</span><i></i><span class="proof-meter-node">METER</span><i></i><span class="proof-load-node">TM LOAD</span>
          </div>
          <div class="proof-observability">
            <span>P/Q <b>100%</b></span><span>Phase <b>100%</b></span><span>Topology <b>100%</b></span><span>Timing <b>100%</b></span>
          </div>
          <div class="proof-result-row">
            <div><small>CONVENTIONAL LOSS ERROR</small><strong id="spotConvError">—</strong></div>
            <span>→</span>
            <div class="proof-smart"><small>SMART LOSS ERROR</small><strong id="spotSmartError">—</strong></div>
          </div>
          <div class="proof-action"><span>SMART ACTION</span><b id="spotAction">Minimal correction expected</b><p id="spotActionCopy">Verified states should stay locked when observability is already high.</p></div>
        </article>

        <div class="proof-vs"><span>VS</span><i></i><small>same 3φ physics</small></div>

        <article class="proof-card proof-card-distribution">
          <div class="proof-card-head">
            <span class="proof-number">02</span>
            <div><small>IMPERFECT OBSERVABILITY</small><h4>Distribution Transformer / Gardu Distribusi</h4></div>
            <b class="proof-state" id="distProofState">READY</b>
          </div>
          <div class="proof-mini-distribution" aria-hidden="true">
            <span class="proof-trafo-node">GD-01</span><i></i><span>JTR-01 ●●●</span><span>JTR-02 ●?●</span><span>JTR-03 ?●●</span>
          </div>
          <div class="proof-observability">
            <span>AMI <b id="distAmi">80%</b></span><span>Phase <b id="distPhase">65.6%</b></span><span>PF <b id="distPf">40%</b></span><span>Mapping <b id="distMapping">94.4%</b></span>
          </div>
          <div class="proof-result-row">
            <div><small>CONVENTIONAL LOSS ERROR</small><strong id="distConvError">—</strong></div>
            <span>→</span>
            <div class="proof-smart"><small>SMART LOSS ERROR</small><strong id="distSmartError">—</strong></div>
          </div>
          <div class="proof-fit-row"><span>Source P <b id="distSourceProof">—</b></span><span>Phase P <b id="distPhaseProof">—</b></span><span>Hold-out <b id="distHoldoutProof">—</b></span></div>
          <div class="proof-action proof-action-smart"><span>SMART ACTION</span><b>Recover missing distribution state</b><p>Timestamp → AMI → phase → PF → identifiable asset parameters → 3φ validation.</p></div>
        </article>
      </div>

      <footer class="pln-proof-footer">
        <div><b>What this synthetic proof can claim</b><p>Hidden Ground Truth is revealed only after calibration, so we can quantify whether Smart Engine made the loss estimate more accurate.</p></div>
        <div><b>What field deployment should claim</b><p>Accuracy is evaluated against independent measurements and hold-out residuals; no unavailable “true network state” is invented.</p></div>
      </footer>`;
    hero.insertAdjacentElement('afterend', section);
  }

  function updatePresetProfile() {
    const profile = presetProfiles[preset?.value] || presetProfiles.typical;
    text('demoPresetLabel', profile.label);
    text('demoAmiCoverage', pct(profile.ami));
    text('demoPhaseKnown', pct(profile.phase));
    text('demoPfKnown', pct(profile.pf));
    text('demoMappingKnown', pct(profile.mapping));
    text('demoInputVerdict', profile.verdict);
    text('distAmi', pct(profile.ami));
    text('distPhase', pct(profile.phase));
    text('distPf', pct(profile.pf));
    text('distMapping', pct(profile.mapping));
    const bars = [['demoAmiBar', profile.ami], ['demoPhaseBar', profile.phase], ['demoPfBar', profile.pf], ['demoMappingBar', profile.mapping]];
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
      showEngineering(); activateNav('engineering'); engineeringWorkspace?.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }
    showPublic(); activateNav(target === 'overview' ? 'overview' : target);
    const anchors = { overview: '#overviewSection', network: '#networkSection', calibration: '#calibrationSection' };
    const anchor = $(anchors[target] || anchors.overview);
    window.requestAnimationFrame(() => anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  $$('[data-nav-target]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.navTarget || 'overview')));

  installPlnDiscussionProof();
  preset?.addEventListener('change', updatePresetProfile);
  updatePresetProfile();
  normalizeSldGeometry();

  function resetPublicResult() {
    text('demoConventionalLoss', '—'); text('demoSmartLoss', '—');
    text('demoConventionalError', 'baseline estimate'); text('demoSmartError', 'calibrated estimate');
    text('demoLossImprovement', '—'); text('demoImprovementCopy', 'Waiting for physics validation');
    text('demoSourceFit', '—'); text('demoPhaseFit', '—'); text('demoValidation', '—');
    text('demoTruthLoss', 'Hidden'); text('demoTruthAccess', 'TRUTH ACCESS · BLOCKED');
    text('demoRailTitle', 'Smart analysis running'); text('demoRailState', 'RUNNING');
    text('sldSmartLoss', 'Calculating…'); text('sldSmartLossSub', '96 interval physics validation');
    text('demoGuardValidation', 'Analysis in progress');
    text('spotProofState', 'RUNNING'); text('distProofState', 'WAIT');
    text('spotConvError', '—'); text('spotSmartError', '—');
    text('distConvError', '—'); text('distSmartError', '—');
    text('distSourceProof', '—'); text('distPhaseProof', '—'); text('distHoldoutProof', '—');
    text('spotAction', 'Checking high-observability case');
    text('spotActionCopy', 'Smart Engine must preserve verified states and avoid unnecessary correction.');
    const proofVerdict = $('#plnProofVerdict');
    if (proofVerdict) proofVerdict.innerHTML = '<span></span> Proving spot load first, then gardu distribusi';
    setPipelineVerdict('Running calibration stages', 'running');
    sld?.classList.remove('is-complete'); sld?.classList.add('is-running');
    chartPlaceholder?.classList.remove('hidden');
    $$('.pipeline-step').forEach((step) => {
      step.classList.remove('is-pass', 'is-running');
      const state = step.querySelector('.step-state'); if (state) state.textContent = 'WAIT';
    });
  }

  runButton?.addEventListener('click', () => { resetPublicResult(); showPublic(); activateNav('overview'); });

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

  function renderPlnDiscussionProof(payload) {
    const spot = payload?.spot_load_demo;
    const distribution = payload?.comparison;
    if (!spot?.comparison || !distribution) return;
    const profile = presetProfiles[payload.preset] || presetProfiles.typical;
    const sc = spot.comparison.conventional || {};
    const ss = spot.comparison.smart || {};
    const dc = distribution.conventional || {};
    const ds = distribution.smart || {};

    text('spotProofState', spot.gate?.pass ? 'ACCURATE' : 'REVIEW');
    text('spotConvError', `${signed(sc.loss_error_percent_validation_only, 2)}`);
    text('spotSmartError', `${signed(ss.loss_error_percent_validation_only, 2)}`);
    text('spotAction', spot.smart_action?.classification === 'MINIMAL_CORRECTION' ? 'Minimal correction · verified states locked' : (spot.smart_action?.classification || 'Review'));
    text('spotActionCopy', spot.smart_action?.reason || 'High observability means the model should already be close to measurements.');

    text('distProofState', payload.gate?.pass ? 'RECOVERED' : 'REVIEW');
    text('distAmi', pct(profile.ami)); text('distPhase', pct(profile.phase)); text('distPf', pct(profile.pf)); text('distMapping', pct(profile.mapping));
    text('distConvError', signed(dc.loss_error_percent_validation_only, 2));
    text('distSmartError', signed(ds.loss_error_percent_validation_only, 2));
    text('distSourceProof', `${num(dc.source_nrmse_percent, 2)} → ${num(ds.source_nrmse_percent, 2)}%`);
    text('distPhaseProof', `${num(dc.phase_rmse_kw, 2)} → ${num(ds.phase_rmse_kw, 2)} kW`);
    text('distHoldoutProof', `${num(dc.objective_validation, 3)} → ${num(ds.objective_validation, 3)}`);

    const proofVerdict = $('#plnProofVerdict');
    const bothPass = Boolean(spot.gate?.pass && payload.gate?.pass);
    if (proofVerdict) {
      proofVerdict.classList.toggle('is-pass', bothPass);
      proofVerdict.innerHTML = bothPass
        ? '<span></span> Spot load stays accurate · distribution model improves with Smart Engine'
        : '<span></span> One scenario still needs engineering review';
    }
  }

  function renderPublicPayload(payload) {
    if (!payload?.comparison) return;
    renderPlnDiscussionProof(payload);
    const conventional = payload.comparison.conventional || {};
    const smart = payload.comparison.smart || {};
    const truth = payload.comparison.truth || {};
    const checks = payload.checks || [];
    const unresolved = payload.unresolved || [];

    const convErr = Math.abs(Number(conventional.loss_error_percent_validation_only));
    const smartErr = Math.abs(Number(smart.loss_error_percent_validation_only));
    const reduction = Number.isFinite(convErr) && convErr > 0 && Number.isFinite(smartErr) ? Math.max(0, ((convErr - smartErr) / convErr) * 100) : null;

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
    text('demoHeldCopy', unresolved.length ? `${unresolved.map((item) => item.parameter).join(' · ')} remain intentionally unresolved.` : 'No parameters were held in this scenario.');
    text('sldSmartLoss', `${num(smart.loss_kwh, 2)} kWh/day`);
    text('sldSmartLossSub', `Conventional ${num(conventional.loss_kwh, 2)} · validation ${num(truth.loss_kwh, 2)}`);
    text('demoGuardValidation', payload.gate?.pass ? `${checks.filter((item) => item.pass).length}/${checks.length} checks passed` : 'Gate needs review');

    setPipelineVerdict(payload.gate?.pass ? 'Calibration + hold-out physics passed' : 'One or more gates require review', payload.gate?.pass ? 'pass' : 'idle');
    updatePipeline(payload.trace || []);
    sld?.classList.remove('is-running');
    sld?.classList.toggle('is-complete', Boolean(payload.gate?.pass));
    if (!$('#chartPanel')?.classList.contains('hidden')) chartPlaceholder?.classList.add('hidden');
  }

  function tryReadDiagnostics() {
    const raw = diagnostics?.textContent?.trim();
    if (!raw || !raw.startsWith('{')) return;
    try { renderPublicPayload(JSON.parse(raw)); } catch (_) { /* retry on next mutation */ }
  }

  if (diagnostics) new MutationObserver(tryReadDiagnostics).observe(diagnostics, { childList: true, characterData: true, subtree: true });
  if (gateBadge) new MutationObserver(() => {
    if (gateBadge.textContent?.trim() === 'PASS') setPipelineVerdict('Calibration + hold-out physics passed', 'pass');
  }).observe(gateBadge, { childList: true, characterData: true, subtree: true });

  function syncActivePipelineStage() {
    const label = progressLabel?.textContent?.trim() || '';
    $$('.pipeline-step').forEach((step) => step.classList.remove('is-running'));
    let candidate = null;
    if (/timestamp/i.test(label)) candidate = 'Timestamp alignment';
    else if (/missing|AMI reconstruction/i.test(label)) candidate = 'Missing-AMI reconstruction';
    else if (/phase/i.test(label)) candidate = 'Unknown-phase inference';
    else if (/PF|reactive/i.test(label)) candidate = 'Unknown-PF calibration';
    else if (/network parameter|identifiable|loss-consistent/i.test(label)) candidate = 'Network-parameter calibration';
    else if (/validating smart|physics model|Scoring Smart|Scoring both/i.test(label)) candidate = 'Physics validation model';
    if (candidate) {
      const step = $(`.pipeline-step[data-stage="${candidate}"]`);
      step?.classList.add('is-running');
      const state = step?.querySelector('.step-state'); if (state) state.textContent = 'LIVE';
    }
    if (/spot load|easy case/i.test(label)) {
      text('spotProofState', 'LIVE'); text('distProofState', 'WAIT');
    } else if (/distribution|P1|P2|P3|calibration|smart model/i.test(label)) {
      if ($('#spotProofState')?.textContent !== 'ACCURATE') text('spotProofState', 'DONE');
      text('distProofState', 'LIVE');
    }
  }

  if (progressLabel) new MutationObserver(syncActivePipelineStage).observe(progressLabel, { childList: true, characterData: true, subtree: true });
  if (progressBar) new MutationObserver(() => {
    const value = Number.parseFloat(progressPct?.textContent || '0');
    if (Number.isFinite(value) && value >= 100 && gateBadge?.textContent?.trim() === 'PASS') {
      sld?.classList.remove('is-running'); sld?.classList.add('is-complete');
    }
  }).observe(progressBar, { attributes: true, attributeFilter: ['style'] });

  if (errorSection) new MutationObserver(() => {
    if (!errorSection.classList.contains('hidden')) {
      text('demoRailTitle', 'Browser engine error'); text('demoRailState', 'ERROR');
      text('sldSmartLoss', 'Analysis stopped'); text('sldSmartLossSub', errorMessage?.textContent?.trim() || 'Open Engineering for diagnostics');
      text('demoGuardValidation', 'Engine error · inspect diagnostics');
      text('distProofState', 'ERROR');
      const proofVerdict = $('#plnProofVerdict'); if (proofVerdict) proofVerdict.innerHTML = '<span></span> Demo stopped · inspect Engineering diagnostics';
      setPipelineVerdict('Analysis stopped · engineering diagnostics available', 'idle');
      sld?.classList.remove('is-running', 'is-complete'); showPublic();
    }
  }).observe(errorSection, { attributes: true, attributeFilter: ['class'] });

  if (runButton) {
    let decorating = false;
    new MutationObserver(() => {
      if (decorating || runButton.querySelector('svg')) return;
      decorating = true;
      const label = runButton.textContent?.trim() || 'Run Smart Analysis';
      runButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z"/></svg><span>${label}</span>`;
      decorating = false;
    }).observe(runButton, { childList: true, characterData: true, subtree: true });
  }

  showPublic();
  activateNav('overview');
})();
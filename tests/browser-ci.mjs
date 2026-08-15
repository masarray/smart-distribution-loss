import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const baseUrl = process.env.SDL_BASE_URL || 'http://127.0.0.1:8000/';
const preset = process.env.SDL_PRESET || 'typical';
const timeoutMs = Number(process.env.SDL_TIMEOUT_MS || 1_200_000);
const artifactDir = process.env.SDL_ARTIFACT_DIR || 'artifacts/browser-ci';
const summaryFile = process.env.GITHUB_STEP_SUMMARY || path.join(artifactDir, 'summary.md');

fs.mkdirSync(artifactDir, { recursive: true });
const consoleLines = [];
const startedAt = Date.now();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });

page.on('console', (message) => consoleLines.push(`[console:${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => consoleLines.push(`[pageerror] ${error?.stack || error?.message || String(error)}`));
page.on('requestfailed', (request) => consoleLines.push(`[requestfailed] ${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`));

let payload = null;
let gateText = 'UNKNOWN';
let fatalError = null;

async function capturePublicCockpit() {
  const screenshots = [
    ['cockpit-overview', '#overviewSection'],
    ['cockpit-pln-proof', '#plnDiscussionProof'],
    ['cockpit-network', '#networkSection'],
    ['cockpit-calibration', '#calibrationSection'],
  ];
  for (const [name, selector] of screenshots) {
    const locator = page.locator(selector);
    if (await locator.count()) {
      await locator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await locator.screenshot({ path: path.join(artifactDir, `${name}-${preset}.png`) });
    }
  }
  await page.locator('#overviewSection').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(artifactDir, `p3-${preset}.png`) });
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#runButton', { timeout: 30_000 });
  await page.waitForSelector('#distributionSld', { timeout: 30_000 });
  await page.waitForSelector('#plnDiscussionProof', { timeout: 30_000 });
  await page.selectOption('#qualityPreset', preset);
  await page.click('#runButton');

  await page.waitForFunction(() => {
    const gate = document.querySelector('#gateBadge')?.textContent?.trim();
    const errorPanel = document.querySelector('#errorSection');
    const hasError = errorPanel && !errorPanel.classList.contains('hidden');
    return gate === 'PASS' || gate === 'FAIL' || hasError;
  }, null, { timeout: timeoutMs, polling: 250 });

  const errorVisible = await page.locator('#errorSection').evaluate((node) => !node.classList.contains('hidden'));
  if (errorVisible) {
    const message = (await page.locator('#errorMessage').textContent())?.trim() || 'Browser engine error';
    const stack = (await page.locator('#errorStack').textContent())?.trim() || '';
    throw new Error(`${message}\n${stack}`);
  }

  gateText = (await page.locator('#gateBadge').textContent())?.trim() || 'UNKNOWN';
  const diagnosticsText = (await page.locator('#diagnostics').textContent())?.trim();
  if (!diagnosticsText) throw new Error('P3 completed but diagnostics JSON is empty.');
  payload = JSON.parse(diagnosticsText);

  const smartLossText = (await page.locator('#demoSmartLoss').textContent())?.trim() || '';
  const validationText = (await page.locator('#demoValidation').textContent())?.trim() || '';
  const spotState = (await page.locator('#spotProofState').textContent())?.trim() || '';
  const spotSmartError = (await page.locator('#spotSmartError').textContent())?.trim() || '';
  const distState = (await page.locator('#distProofState').textContent())?.trim() || '';
  const proofVerdict = (await page.locator('#plnProofVerdict').textContent())?.trim() || '';

  if (!smartLossText.includes('kWh') || smartLossText === '—') throw new Error(`Public cockpit did not mirror Smart loss result: ${smartLossText}`);
  if (!/^\d+\/\d+$/.test(validationText)) throw new Error(`Public cockpit validation summary is not populated: ${validationText}`);
  if (!payload?.spot_load_demo?.gate?.pass || spotState !== 'ACCURATE' || !spotSmartError.includes('%')) {
    throw new Error(`Spot-load public proof is not valid/populated (gate=${payload?.spot_load_demo?.gate?.pass}, state=${spotState}, error=${spotSmartError}).`);
  }
  if (distState !== 'RECOVERED' || !/Spot load stays accurate/i.test(proofVerdict)) {
    throw new Error(`Distribution public proof is not presenting a recovered Smart result (state=${distState}, verdict=${proofVerdict}).`);
  }
  if (payload?.spot_load_demo?.runtime?.truth_used_by_calibration) throw new Error('Spot-load Smart Engine illegally used hidden truth during calibration.');

  await capturePublicCockpit();
  fs.writeFileSync(path.join(artifactDir, `p3-${preset}.json`), `${JSON.stringify(payload, null, 2)}\n`);
} catch (error) {
  fatalError = error;
  try { await page.screenshot({ path: path.join(artifactDir, `p3-${preset}-failure.png`), fullPage: true }); } catch (_) { /* best effort */ }
} finally {
  fs.writeFileSync(path.join(artifactDir, 'browser-console.log'), `${consoleLines.join('\n')}\n`);
  await browser.close();
}

const wallSeconds = (Date.now() - startedAt) / 1000;
const checks = payload?.checks || [];
const conventional = payload?.comparison?.conventional || {};
const smart = payload?.comparison?.smart || {};
const truth = payload?.comparison?.truth || {};
const spot = payload?.spot_load_demo || {};
const spotConventional = spot?.comparison?.conventional || {};
const spotSmart = spot?.comparison?.smart || {};
const runtime = payload?.runtime || {};
const trace = payload?.trace || [];
const fmt = (value, digits = 4) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
const esc = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');

let markdown = `# Smart Distribution Loss · Browser Physics CI\n\n`;
markdown += `- **Preset:** ${preset}\n- **Base URL:** ${baseUrl}\n- **Gate:** ${gateText}\n- **Wall time:** ${wallSeconds.toFixed(1)} s\n`;
markdown += `- **Public visual artifacts:** overview · PLN proof · network · calibration\n`;
if (payload) {
  markdown += `- **Pyodide/Pandapower:** ${payload.versions?.pyodide || '—'} / ${payload.versions?.pandapower || '—'}\n`;
  markdown += `- **Distribution truth used by calibration:** ${runtime.truth_used_by_calibration ? 'YES (INVALID)' : 'NO'}\n`;
  markdown += `- **Spot-load truth used by calibration:** ${spot?.runtime?.truth_used_by_calibration ? 'YES (INVALID)' : 'NO'}\n\n`;

  markdown += `## PLN discussion proof\n\n`;
  markdown += `| Scenario | Observability | Conventional loss error | Smart loss error | Result |\n|---|---|---:|---:|---|\n`;
  markdown += `| MV Spot Load / Pelanggan TM | ${spot?.observability?.verdict || '—'} | ${fmt(spotConventional.loss_error_percent_validation_only, 3)}% | ${fmt(spotSmart.loss_error_percent_validation_only, 3)}% | ${spot?.gate?.pass ? 'PASS' : 'FAIL'} |\n`;
  markdown += `| Distribution Transformer / Gardu Distribusi | ${String(preset).toUpperCase()} | ${fmt(conventional.loss_error_percent_validation_only, 3)}% | ${fmt(smart.loss_error_percent_validation_only, 3)}% | ${payload?.gate?.pass ? 'PASS' : 'FAIL'} |\n\n`;

  markdown += `## Distribution key comparison\n\n| Metric | Conventional | Smart |\n|---|---:|---:|\n`;
  markdown += `| Technical loss | ${fmt(conventional.loss_kwh, 3)} kWh | ${fmt(smart.loss_kwh, 3)} kWh |\n`;
  markdown += `| Loss error | ${fmt(conventional.loss_error_percent_validation_only, 3)}% | ${fmt(smart.loss_error_percent_validation_only, 3)}% |\n`;
  markdown += `| Source-P NRMSE | ${fmt(conventional.source_nrmse_percent, 3)}% | ${fmt(smart.source_nrmse_percent, 3)}% |\n`;
  markdown += `| Phase-P RMSE | ${fmt(conventional.phase_rmse_kw, 4)} kW | ${fmt(smart.phase_rmse_kw, 4)} kW |\n`;
  markdown += `| LV voltage RMSE | ${fmt(conventional.voltage_rmse_pu, 6)} pu | ${fmt(smart.voltage_rmse_pu, 6)} pu |\n`;
  markdown += `| Hold-out objective | ${fmt(conventional.objective_validation, 6)} | ${fmt(smart.objective_validation, 6)} |\n`;
  markdown += `| Phase accuracy | ${fmt(conventional.phase_accuracy_percent_validation_only, 2)}% | ${fmt(smart.phase_accuracy_percent_validation_only, 2)}% |\n`;
  markdown += `| Ground Truth loss | ${fmt(truth.loss_kwh, 3)} kWh | — |\n\n`;

  markdown += `## Mandatory checks\n\n| Check | Result | Detail |\n|---|---|---|\n`;
  for (const check of checks) markdown += `| ${esc(check.name)} | ${check.pass ? 'PASS' : 'FAIL'} | ${esc(check.detail)} |\n`;

  markdown += `\n## Calibration trace\n\n| Stage | Status | Before | After | Evidence/action |\n|---|---|---:|---:|---|\n`;
  for (const item of trace) markdown += `| ${esc(item.stage)} | ${esc(item.status)} | ${fmt(item.before, 5)} | ${fmt(item.after, 5)} | ${esc(item.detail)} |\n`;

  markdown += `\n## Runtime\n\n- Final 96 smart solves: **${fmt((runtime.final_solver_total_ms || 0) / 1000, 2)} s**\n`;
  markdown += `- Average smart solve: **${fmt(runtime.final_solver_average_ms, 2)} ms**\n- Browser CI wall time: **${wallSeconds.toFixed(1)} s**\n`;
}
if (fatalError) markdown += `\n## Fatal error\n\n\`\`\`text\n${fatalError?.stack || fatalError?.message || String(fatalError)}\n\`\`\`\n`;

fs.appendFileSync(summaryFile, markdown);
fs.writeFileSync(path.join(artifactDir, 'summary.md'), markdown);
console.log(markdown);
if (fatalError) { console.error(fatalError); process.exit(1); }
if (!payload?.gate?.pass || !payload?.spot_load_demo?.gate?.pass || gateText !== 'PASS') {
  console.error(`PLN comparison browser gate did not pass (distribution=${gateText}, spot=${payload?.spot_load_demo?.gate?.pass}).`);
  process.exit(1);
}

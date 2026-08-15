import process from 'node:process';
import { chromium } from 'playwright';

const url = process.env.SDL_PAGES_URL || 'https://masarray.github.io/smart-distribution-loss/';
const timeoutMs = Number(process.env.SDL_TIMEOUT_MS || 300000);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];

page.on('pageerror', (error) => errors.push(`pageerror: ${error?.message || error}`));
page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Public-demo contract must render before entering the internal engineering view.
  await page.waitForSelector('#distributionSld', { state: 'visible', timeout: 30000 });
  await page.waitForSelector('#runButton', { state: 'visible', timeout: 30000 });
  await page.waitForSelector('#demoPipeline', { state: 'visible', timeout: 30000 });
  const publicTitle = (await page.locator('.brand-lockup h1').textContent())?.trim();
  if (publicTitle !== 'Smart Distribution Loss') {
    throw new Error(`Unexpected public cockpit title: ${publicTitle || 'EMPTY'}`);
  }

  // P0-A stays an engineering regression control; navigate to it explicitly.
  await page.click('[data-nav-target="engineering"]');
  await page.waitForSelector('#engineeringWorkspace:not(.hidden)', { timeout: 10000 });
  await page.waitForSelector('#runP0AButton', { state: 'visible', timeout: 10000 });
  await page.click('#runP0AButton');

  await page.waitForFunction(() => {
    const gate = document.querySelector('#gateBadge')?.textContent?.trim();
    const errorPanel = document.querySelector('#errorSection');
    const hasError = errorPanel && !errorPanel.classList.contains('hidden');
    return gate === 'PASS' || gate === 'FAIL' || hasError;
  }, null, { timeout: timeoutMs, polling: 250 });

  const errorVisible = await page.locator('#errorSection').evaluate((node) => !node.classList.contains('hidden'));
  if (errorVisible) {
    const message = (await page.locator('#errorMessage').textContent())?.trim() || 'unknown browser engine error';
    const stack = (await page.locator('#errorStack').textContent())?.trim() || '';
    throw new Error(`${message}\n${stack}`);
  }

  const gate = (await page.locator('#gateBadge').textContent())?.trim();
  const diagnostics = JSON.parse((await page.locator('#diagnostics').textContent()) || '{}');

  console.log(`Pages URL: ${url}`);
  console.log(`Application: ${publicTitle}`);
  console.log('Public cockpit: PASS');
  console.log(`P0-A gate: ${gate}`);
  console.log(`Pyodide: ${diagnostics?.versions?.pyodide || '—'}`);
  console.log(`Pandapower: ${diagnostics?.versions?.pandapower || '—'}`);
  console.log(`Execution: ${diagnostics?.runtime?.execution_location || '—'}`);

  if (gate !== 'PASS' || !diagnostics?.gate?.pass) {
    throw new Error(`Deployed Pages P0-A gate is ${gate || 'UNKNOWN'}`);
  }
  if (diagnostics?.runtime?.backend !== null) {
    throw new Error('Production smoke expected backend=null for browser-only architecture.');
  }
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('Non-fatal browser diagnostics:');
  for (const item of errors) console.log(`- ${item}`);
}

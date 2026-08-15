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
  await page.waitForSelector('#runP0AButton', { timeout: 30000 });
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
  const title = (await page.locator('h1').textContent())?.trim();
  const diagnostics = JSON.parse((await page.locator('#diagnostics').textContent()) || '{}');

  console.log(`Pages URL: ${url}`);
  console.log(`Application: ${title}`);
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

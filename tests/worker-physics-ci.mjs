import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const timeoutMs = Number(process.env.SDL_TIMEOUT_MS || 600_000);
const artifactDir = process.env.SDL_ARTIFACT_DIR || "artifacts/browser-physics";

fs.mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleLines = [];
const startedAt = Date.now();

page.on("console", (message) => {
  consoleLines.push(`[console:${message.type()}] ${message.text()}`);
});
page.on("pageerror", (error) => {
  consoleLines.push(`[pageerror] ${error?.stack || error?.message || String(error)}`);
});
page.on("requestfailed", (request) => {
  consoleLines.push(
    `[requestfailed] ${request.method()} ${request.url()} :: ${request.failure()?.errorText || "unknown"}`,
  );
});

let result = null;
let fatalError = null;

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  result = await page.evaluate(
    ({ timeout }) =>
      new Promise((resolve, reject) => {
        const workerUrl = new URL("sdl-worker.js", window.location.href).href;
        const worker = new Worker(workerUrl);
        const progress = [];

        const timer = window.setTimeout(() => {
          worker.terminate();
          reject(new Error(`P0-A browser physics gate timed out after ${timeout} ms`));
        }, timeout);

        worker.onmessage = (event) => {
          const message = event.data ?? {};
          if (message.type === "progress") {
            progress.push({
              percent: message.percent,
              label: message.label,
              detail: message.detail,
            });
            return;
          }

          if (message.type === "error") {
            window.clearTimeout(timer);
            worker.terminate();
            reject(new Error(`${message.message || "Worker error"}\n${message.stack || ""}`));
            return;
          }

          if (message.type === "result" && message.phase === "p0a") {
            window.clearTimeout(timer);
            worker.terminate();
            resolve({ payload: message.payload, progress, workerUrl });
          }
        };

        worker.onerror = (event) => {
          window.clearTimeout(timer);
          worker.terminate();
          reject(new Error(event.message || "Browser worker failed to start"));
        };

        worker.postMessage({ type: "run-p0a" });
      }),
    { timeout: timeoutMs },
  );

  const payload = result?.payload;
  if (!payload) throw new Error("P0-A worker returned no payload.");
  if (!payload.gate?.pass) {
    throw new Error(`P0-A engineering gate failed: ${payload.gate?.summary || "no summary"}`);
  }
  if (payload.versions?.pandapower !== "3.1.2") {
    throw new Error(`Unexpected Pandapower version: ${payload.versions?.pandapower || "missing"}`);
  }
  if (payload.runtime?.solver !== "pandapower.runpp_3ph") {
    throw new Error(`Unexpected physics solver: ${payload.runtime?.solver || "missing"}`);
  }
  if (!Number.isFinite(Number(payload.electrical?.total_loss_kw)) || payload.electrical.total_loss_kw <= 0) {
    throw new Error(`Invalid technical loss result: ${payload.electrical?.total_loss_kw}`);
  }

  fs.writeFileSync(
    path.join(artifactDir, "p0a-result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
} catch (error) {
  fatalError = error;
  try {
    await page.screenshot({
      path: path.join(artifactDir, "browser-physics-failure.png"),
      fullPage: true,
    });
  } catch {
    // Best-effort diagnostic only.
  }
} finally {
  fs.writeFileSync(
    path.join(artifactDir, "browser-console.log"),
    `${consoleLines.join("\n")}\n`,
  );
  await browser.close();
}

const wallSeconds = (Date.now() - startedAt) / 1000;
const payload = result?.payload;
let summary = "# Browser Physics Gate\n\n";
summary += `- Base URL: ${baseUrl}\n`;
summary += `- Wall time: ${wallSeconds.toFixed(1)} s\n`;
summary += `- Gate: ${payload?.gate?.pass ? "PASS" : "FAIL"}\n`;
summary += `- Pyodide: ${payload?.versions?.pyodide || "—"}\n`;
summary += `- Pandapower: ${payload?.versions?.pandapower || "—"}\n`;
summary += `- Solver: ${payload?.runtime?.solver || "—"}\n`;
summary += `- Technical loss: ${Number(payload?.electrical?.total_loss_kw || 0).toFixed(6)} kW\n`;
summary += `- Repeated-run Δ: ${payload?.electrical?.repeat_delta_pu ?? "—"} pu\n`;

if (Array.isArray(payload?.checks)) {
  summary += "\n## Mandatory engineering checks\n\n| Check | Result | Detail |\n|---|---|---|\n";
  for (const check of payload.checks) {
    summary += `| ${String(check.name).replaceAll("|", "\\|")} | ${check.pass ? "PASS" : "FAIL"} | ${String(check.detail || "").replaceAll("|", "\\|")} |\n`;
  }
}

if (fatalError) {
  summary += `\n## Fatal error\n\n\`\`\`text\n${fatalError?.stack || fatalError?.message || String(fatalError)}\n\`\`\`\n`;
}

fs.writeFileSync(path.join(artifactDir, "summary.md"), summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
console.log(summary);

if (fatalError) {
  console.error(fatalError);
  process.exit(1);
}

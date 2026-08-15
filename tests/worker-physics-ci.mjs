import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const timeoutMs = Number(process.env.SDL_TIMEOUT_MS || 600_000);
const artifactDir = process.env.SDL_ARTIFACT_DIR || "artifacts/browser-physics";
const expectedPandapower = process.env.SDL_EXPECTED_PANDAPOWER || "3.1.2";

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
        const runs = [];
        let runStartedAt = performance.now();
        let progress = [];

        const timer = window.setTimeout(() => {
          worker.terminate();
          reject(new Error(`P0-A browser physics gate timed out after ${timeout} ms`));
        }, timeout);

        const startRun = () => {
          runStartedAt = performance.now();
          progress = [];
          worker.postMessage({ type: "run-p0a" });
        };

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
            runs.push({
              payload: message.payload,
              progress,
              durationMs: performance.now() - runStartedAt,
            });

            if (runs.length === 1) {
              startRun();
              return;
            }

            window.clearTimeout(timer);
            worker.terminate();
            resolve({ runs, workerUrl });
          }
        };

        worker.onerror = (event) => {
          window.clearTimeout(timer);
          worker.terminate();
          reject(new Error(event.message || "Browser worker failed to start"));
        };

        startRun();
      }),
    { timeout: timeoutMs },
  );

  if (!Array.isArray(result?.runs) || result.runs.length !== 2) {
    throw new Error("Expected exactly two P0-A runs in the same warm worker.");
  }

  const first = result.runs[0]?.payload;
  const second = result.runs[1]?.payload;
  if (!first || !second) throw new Error("P0-A worker returned an incomplete payload.");

  for (const [index, payload] of [first, second].entries()) {
    if (!payload.gate?.pass) {
      throw new Error(`P0-A engineering gate failed on run ${index + 1}: ${payload.gate?.summary || "no summary"}`);
    }
    if (payload.versions?.pandapower !== expectedPandapower) {
      throw new Error(`Unexpected Pandapower version on run ${index + 1}: ${payload.versions?.pandapower || "missing"}`);
    }
    if (payload.runtime?.solver !== "pandapower.runpp_3ph") {
      throw new Error(`Unexpected physics solver on run ${index + 1}: ${payload.runtime?.solver || "missing"}`);
    }
    if (!Number.isFinite(Number(payload.electrical?.total_loss_kw)) || payload.electrical.total_loss_kw <= 0) {
      throw new Error(`Invalid technical loss result on run ${index + 1}: ${payload.electrical?.total_loss_kw}`);
    }
  }

  const lossDeltaKw = Math.abs(Number(first.electrical.total_loss_kw) - Number(second.electrical.total_loss_kw));
  if (lossDeltaKw > 1e-9) {
    throw new Error(`Warm-worker repeat changed technical loss by ${lossDeltaKw} kW.`);
  }

  fs.writeFileSync(
    path.join(artifactDir, "p0a-result.json"),
    `${JSON.stringify({ ...result, lossDeltaKw }, null, 2)}\n`,
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
const firstRun = result?.runs?.[0];
const warmRun = result?.runs?.[1];
const payload = firstRun?.payload;
const coldMs = Number(firstRun?.durationMs || 0);
const warmMs = Number(warmRun?.durationMs || 0);
const speedup = coldMs > 0 && warmMs > 0 ? coldMs / warmMs : null;

let summary = "# Browser Physics Gate\n\n";
summary += `- Base URL: ${baseUrl}\n`;
summary += `- Wall time: ${wallSeconds.toFixed(1)} s\n`;
summary += `- Gate: ${payload?.gate?.pass ? "PASS" : "FAIL"}\n`;
summary += `- Pyodide: ${payload?.versions?.pyodide || "—"}\n`;
summary += `- Pandapower: ${payload?.versions?.pandapower || "—"}\n`;
summary += `- Solver: ${payload?.runtime?.solver || "—"}\n`;
summary += `- Technical loss: ${Number(payload?.electrical?.total_loss_kw || 0).toFixed(6)} kW\n`;
summary += `- Repeated-run Δ: ${payload?.electrical?.repeat_delta_pu ?? "—"} pu\n`;
summary += `- Cold worker run: ${coldMs ? coldMs.toFixed(0) : "—"} ms\n`;
summary += `- Warm worker run: ${warmMs ? warmMs.toFixed(0) : "—"} ms\n`;
summary += `- Warm-runtime speed-up: ${speedup ? `${speedup.toFixed(2)}×` : "—"}\n`;

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

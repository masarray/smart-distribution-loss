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
let fatalError = null;
let result = null;

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  result = await page.evaluate(
    ({ timeout }) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL("sdl-worker.js", window.location.href).href);
        const payloads = {};
        const timer = window.setTimeout(() => {
          worker.terminate();
          reject(new Error(`MV independence gate timed out after ${timeout} ms`));
        }, timeout);

        const finishIfReady = () => {
          if (!payloads.spot || !payloads.tm) return;
          window.clearTimeout(timer);
          worker.terminate();
          resolve(payloads);
        };

        worker.onmessage = (event) => {
          const message = event.data ?? {};
          if (message.type === "error") {
            window.clearTimeout(timer);
            worker.terminate();
            reject(new Error(`${message.message || "Worker error"}\n${message.stack || ""}`));
            return;
          }
          if (message.type !== "result") return;
          if (message.phase === "spot-demo") {
            payloads.spot = message.payload;
            worker.postMessage({ type: "run-tm-demo" });
            return;
          }
          if (message.phase === "tm-demo") {
            payloads.tm = message.payload;
            finishIfReady();
          }
        };

        worker.onerror = (event) => {
          window.clearTimeout(timer);
          worker.terminate();
          reject(new Error(event.message || "Browser worker failed to start"));
        };

        worker.postMessage({ type: "run-spot-demo" });
      }),
    { timeout: timeoutMs },
  );

  const spot = result?.spot;
  const tm = result?.tm;
  if (!spot?.gate?.pass) throw new Error(`Spot MV gate failed: ${spot?.gate?.summary || "missing"}`);
  if (!tm?.gate?.pass) throw new Error(`TM gate failed: ${tm?.gate?.summary || "missing"}`);
  if (spot.demo_kind === tm.demo_kind) throw new Error("Spot MV and Pelanggan TM share the same demo_kind.");
  if (tm.scenario_id !== "tm-customer-independent-v1") throw new Error(`Unexpected TM scenario_id: ${tm.scenario_id || "missing"}`);
  if (tm.fingerprint !== "20KV-TM-2P8KM-96QH-ASYM-V1") throw new Error(`Unexpected TM fingerprint: ${tm.fingerprint || "missing"}`);
  if (Number(tm.scenario?.intervals) !== 96 || Number(tm.scenario?.interval_minutes) !== 15) {
    throw new Error(`TM resolution is not independent 96 x 15-minute data: ${JSON.stringify(tm.scenario)}`);
  }

  const spotLoss = Number(spot.comparison?.smart?.loss_kwh);
  const tmLoss = Number(tm.comparison?.smart?.loss_kwh);
  if (!Number.isFinite(spotLoss) || !Number.isFinite(tmLoss)) throw new Error("MV loss payload contains non-finite values.");
  if (Math.abs(spotLoss - tmLoss) <= 0.25) {
    throw new Error(`MV independence failed: Spot ${spotLoss} kWh/day vs TM ${tmLoss} kWh/day.`);
  }

  const tmConvError = Math.abs(Number(tm.comparison?.conventional?.loss_error_percent_validation_only));
  const tmSmartError = Math.abs(Number(tm.comparison?.smart?.loss_error_percent_validation_only));
  if (!(tmSmartError < tmConvError)) {
    throw new Error(`TM smart calibration did not improve loss error: ${tmConvError}% → ${tmSmartError}%.`);
  }
  if (tm.runtime?.truth_used_by_calibration !== false || tm.runtime?.truth_used_for_final_validation_only !== true) {
    throw new Error("TM truth-separation provenance is invalid.");
  }
  if (tm.runtime?.solver !== "pandapower.runpp_3ph") {
    throw new Error(`TM solver is not runpp_3ph: ${tm.runtime?.solver || "missing"}`);
  }

  fs.writeFileSync(path.join(artifactDir, "mv-independence.json"), `${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  fatalError = error;
} finally {
  await browser.close();
}

const spotLoss = Number(result?.spot?.comparison?.smart?.loss_kwh || 0);
const tmLoss = Number(result?.tm?.comparison?.smart?.loss_kwh || 0);
let summary = "# MV Asset Independence Gate\n\n";
summary += `- Spot MV gate: ${result?.spot?.gate?.pass ? "PASS" : "FAIL"}\n`;
summary += `- Pelanggan TM gate: ${result?.tm?.gate?.pass ? "PASS" : "FAIL"}\n`;
summary += `- Spot MV smart loss: ${spotLoss.toFixed(3)} kWh/day\n`;
summary += `- Pelanggan TM smart loss: ${tmLoss.toFixed(3)} kWh/day\n`;
summary += `- Difference: ${Math.abs(spotLoss - tmLoss).toFixed(3)} kWh/day\n`;
summary += `- TM fingerprint: ${result?.tm?.fingerprint || "—"}\n`;
summary += `- TM resolution: ${result?.tm?.scenario?.intervals || "—"} × ${result?.tm?.scenario?.interval_minutes || "—"} min\n`;
summary += `- Solver: ${result?.tm?.runtime?.solver || "—"}\n`;

if (fatalError) {
  summary += `\n## Fatal error\n\n\`\`\`text\n${fatalError?.stack || fatalError?.message || String(fatalError)}\n\`\`\`\n`;
}

fs.writeFileSync(path.join(artifactDir, "mv-independence-summary.md"), summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${summary}`);
console.log(summary);

if (fatalError) {
  console.error(fatalError);
  process.exit(1);
}

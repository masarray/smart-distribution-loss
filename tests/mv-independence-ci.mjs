import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const timeoutMs = Number(process.env.SDL_TIMEOUT_MS || 600_000);
const artifactDir = process.env.SDL_ARTIFACT_DIR || "artifacts/browser-physics";
const intervals = 96;
const intervalMinutes = 15;

fs.mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let fatalError = null;
let result = null;

const expectedTime = (index) => {
  const minutes = index * intervalMinutes;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

const assertCanonicalSeries = (series, label) => {
  if (!Array.isArray(series) || series.length !== intervals) {
    throw new Error(`${label} must contain ${intervals} intervals, got ${series?.length ?? "missing"}.`);
  }
  for (let i = 0; i < intervals; i += 1) {
    const point = series[i];
    if (Number(point?.index) !== i || point?.time !== expectedTime(i)) {
      throw new Error(`${label} timebase mismatch at ${i}: ${JSON.stringify(point)}`);
    }
    for (const key of ["truth_loss_kw", "conventional_loss_kw", "smart_loss_kw"]) {
      if (!Number.isFinite(Number(point?.[key]))) {
        throw new Error(`${label} has non-finite ${key} at ${i}.`);
      }
    }
  }
};

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  result = await page.evaluate(
    ({ timeout }) =>
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL("sdl-worker.js", window.location.href).href);
        const payloads = {};
        const timer = window.setTimeout(() => {
          worker.terminate();
          reject(new Error(`Unified data-contract gate timed out after ${timeout} ms`));
        }, timeout);

        worker.onmessage = (event) => {
          const message = event.data ?? {};
          if (message.type === "error") {
            window.clearTimeout(timer);
            worker.terminate();
            reject(new Error(`${message.message || "Worker error"}\n${message.stack || ""}`));
            return;
          }
          if (message.type === "spot-demo") payloads.spot = message.payload;
          if (message.type === "tm-demo") payloads.tm = message.payload;
          if (message.type === "result" && message.phase === "p3") {
            payloads.p3 = message.payload;
            window.clearTimeout(timer);
            worker.terminate();
            resolve(payloads);
          }
        };

        worker.onerror = (event) => {
          window.clearTimeout(timer);
          worker.terminate();
          reject(new Error(event.message || "Browser worker failed to start"));
        };

        worker.postMessage({ type: "run-p3", preset: "poor" });
      }),
    { timeout: timeoutMs },
  );

  const spot = result?.spot;
  const tm = result?.tm;
  const p3 = result?.p3;

  if (!spot?.gate?.pass) throw new Error(`Spot MV gate failed: ${spot?.gate?.summary || "missing"}`);
  if (!tm?.gate?.pass) throw new Error(`TM gate failed: ${tm?.gate?.summary || "missing"}`);
  if (!p3?.gate?.pass) throw new Error(`GD-01/P3 gate failed: ${p3?.gate?.summary || "missing"}`);

  if (spot.demo_kind === tm.demo_kind) throw new Error("Spot MV and Pelanggan TM share the same demo_kind.");
  if (spot.scenario_id !== "spot-mv-reference-v2") throw new Error(`Unexpected Spot scenario_id: ${spot.scenario_id || "missing"}`);
  if (spot.fingerprint !== "20KV-SPOT-5KM-96QH-BALANCED-V2") throw new Error(`Unexpected Spot fingerprint: ${spot.fingerprint || "missing"}`);
  if (tm.scenario_id !== "tm-customer-independent-v1") throw new Error(`Unexpected TM scenario_id: ${tm.scenario_id || "missing"}`);
  if (tm.fingerprint !== "20KV-TM-2P8KM-96QH-ASYM-V1") throw new Error(`Unexpected TM fingerprint: ${tm.fingerprint || "missing"}`);

  for (const [label, demo] of [["Spot MV", spot], ["Pelanggan TM", tm]]) {
    if (Number(demo.scenario?.intervals) !== intervals || Number(demo.scenario?.interval_minutes) !== intervalMinutes) {
      throw new Error(`${label} is not canonical ${intervals} x ${intervalMinutes}-minute data: ${JSON.stringify(demo.scenario)}`);
    }
    assertCanonicalSeries(demo.series, `${label} raw series`);
    if (demo.provenance?.source_type !== "synthetic_demo" || demo.provenance?.dataset_mode !== "deterministic_synthetic") {
      throw new Error(`${label} provenance is missing or ambiguous: ${JSON.stringify(demo.provenance)}`);
    }
  }

  const contract = p3.data_contract;
  if (contract?.schema !== "smart-distribution-loss-operational-data-v1") {
    throw new Error(`Unexpected data-contract schema: ${contract?.schema || "missing"}`);
  }
  if (contract?.dataset_mode !== "synthetic_demo" || contract?.source_label !== "Synthetic Demo") {
    throw new Error(`Dataset mode must explicitly remain Synthetic Demo: ${JSON.stringify(contract)}`);
  }
  if (Number(contract?.canonical_timebase?.intervals) !== intervals || Number(contract?.canonical_timebase?.interval_minutes) !== intervalMinutes) {
    throw new Error(`Canonical timebase mismatch: ${JSON.stringify(contract?.canonical_timebase)}`);
  }
  if (contract?.canonical_timebase?.first_interval !== "00:00" || contract?.canonical_timebase?.last_interval !== "23:45") {
    throw new Error(`Canonical day boundary is invalid: ${JSON.stringify(contract?.canonical_timebase)}`);
  }

  for (const id of ["feeder", "spot", "tm", "gd"]) {
    if (contract?.assets?.[id]?.asset_id !== id) throw new Error(`Missing contract metadata for ${id}.`);
    if (!contract?.assets?.[id]?.provenance?.source_type) throw new Error(`Missing provenance source_type for ${id}.`);
    assertCanonicalSeries(p3.asset_series?.[id], `${id} contract series`);
  }

  for (let i = 0; i < intervals; i += 1) {
    const feeder = p3.asset_series.feeder[i];
    for (const key of ["truth_loss_kw", "conventional_loss_kw", "smart_loss_kw"]) {
      const expected = p3.asset_series.spot[i][key] + p3.asset_series.tm[i][key] + p3.asset_series.gd[i][key];
      if (Math.abs(Number(feeder[key]) - Number(expected)) > 1e-9) {
        throw new Error(`Feeder ${key} roll-up mismatch at ${i}: ${feeder[key]} vs ${expected}.`);
      }
    }
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
  if (spot.runtime?.truth_used_by_calibration !== false || spot.runtime?.truth_used_for_final_validation_only !== true) {
    throw new Error("Spot MV truth-separation provenance is invalid.");
  }

  const feederSmartKwh = p3.asset_series.feeder.reduce((sum, point) => sum + Number(point.smart_loss_kw) * 0.25, 0);
  const childSmartKwh = Number(spot.comparison.smart.loss_kwh) + Number(tm.comparison.smart.loss_kwh) + Number(p3.comparison.smart.loss_kwh);
  if (Math.abs(feederSmartKwh - childSmartKwh) > 1e-7) {
    throw new Error(`Daily feeder roll-up mismatch: integrated ${feederSmartKwh} vs child KPI ${childSmartKwh}.`);
  }

  result.feederSmartKwh = feederSmartKwh;
  fs.writeFileSync(path.join(artifactDir, "operational-data-contract.json"), `${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  fatalError = error;
} finally {
  await browser.close();
}

const spotLoss = Number(result?.spot?.comparison?.smart?.loss_kwh || 0);
const tmLoss = Number(result?.tm?.comparison?.smart?.loss_kwh || 0);
const gdLoss = Number(result?.p3?.comparison?.smart?.loss_kwh || 0);
const feederLoss = Number(result?.feederSmartKwh || 0);
let summary = "# Unified Operational Data Contract Gate\n\n";
summary += `- Contract: ${result?.p3?.data_contract?.schema || "—"}\n`;
summary += `- Dataset mode: ${result?.p3?.data_contract?.source_label || "—"}\n`;
summary += `- Canonical timebase: ${result?.p3?.data_contract?.canonical_timebase?.intervals || "—"} × ${result?.p3?.data_contract?.canonical_timebase?.interval_minutes || "—"} min\n`;
summary += `- Spot MV gate: ${result?.spot?.gate?.pass ? "PASS" : "FAIL"}\n`;
summary += `- Pelanggan TM gate: ${result?.tm?.gate?.pass ? "PASS" : "FAIL"}\n`;
summary += `- GD-01 gate: ${result?.p3?.gate?.pass ? "PASS" : "FAIL"}\n`;
summary += `- Spot MV smart loss: ${spotLoss.toFixed(3)} kWh/day\n`;
summary += `- Pelanggan TM smart loss: ${tmLoss.toFixed(3)} kWh/day\n`;
summary += `- GD-01 smart loss: ${gdLoss.toFixed(3)} kWh/day\n`;
summary += `- Feeder integrated roll-up: ${feederLoss.toFixed(3)} kWh/day\n`;
summary += `- Spot fingerprint: ${result?.spot?.fingerprint || "—"}\n`;
summary += `- TM fingerprint: ${result?.tm?.fingerprint || "—"}\n`;

if (fatalError) {
  summary += `\n## Fatal error\n\n\`\`\`text\n${fatalError?.stack || fatalError?.message || String(fatalError)}\n\`\`\`\n`;
}

fs.writeFileSync(path.join(artifactDir, "operational-data-contract-summary.md"), summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${summary}`);
console.log(summary);

if (fatalError) {
  console.error(fatalError);
  process.exit(1);
}

import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label, timeout = 15_000) {
  await locator.waitFor({ state: "visible", timeout });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: "Kelola dataset", exact: true }).click();

  const drawer = page.locator('[data-drawer="dataset-manager"]');
  await assertVisible(drawer, "Dataset Manager");
  await assertVisible(drawer.locator('[data-pln-sample-note="true"]'), "PLN-like sample explanation");

  const loadSample = drawer.locator('button[data-load-pln-sample="true"]');
  await assertVisible(loadSample, "load PLN sample action");
  await loadSample.click();

  await assertVisible(drawer.getByText("SIAP DIHITUNG", { exact: true }), "PLN sample solver readiness");
  const sourceLabel = drawer.locator('[data-field-source-label="true"]');
  await assertVisible(sourceLabel, "sample source label");
  const sourceText = await sourceLabel.innerText();
  if (!sourceText.includes("PLN-like Urban Feeder")) throw new Error(`Unexpected sample label: ${sourceText}`);

  const validationText = await drawer.locator('[data-field-validation="true"]').innerText();
  for (const expected of ["10", "14", "100.0%", "1344/1344", "96/96"]) {
    if (!validationText.includes(expected)) throw new Error(`PLN sample validation is missing ${expected}: ${validationText}`);
  }

  const topology = drawer.locator('[data-field-topology-gate="true"]');
  await assertVisible(topology, "PLN sample topology gate");
  if ((await topology.getAttribute("data-topology-supported")) !== "true") {
    throw new Error(`PLN sample topology was rejected: ${await topology.innerText()}`);
  }
  const topologyText = (await topology.innerText()).toLocaleLowerCase("id-ID");
  if (!topologyText.includes("radial")) throw new Error(`PLN sample is not recognized as radial: ${topologyText}`);

  await drawer.locator('button[data-run-field="true"]').click();
  const result = drawer.locator('[data-field-result="true"]');
  await assertVisible(result, "PLN sample field result", 600_000);
  const resultText = await result.innerText();
  if (!resultText.includes("PERHITUNGAN LULUS")) throw new Error(`PLN sample physics did not pass: ${resultText}`);
  if (!resultText.includes("96/96 interval selesai")) throw new Error(`PLN sample did not solve 96 intervals: ${resultText}`);

  const lossMatch = resultText.match(/Susut teknis\s+([0-9]+(?:\.[0-9]+)?)\s+kWh/i);
  const lossKwh = lossMatch ? Number(lossMatch[1]) : NaN;
  if (!Number.isFinite(lossKwh) || lossKwh <= 0) throw new Error(`PLN sample technical loss is invalid: ${lossKwh}`);

  const activate = drawer.locator('button[data-activate-field="true"]');
  await assertVisible(activate, "PLN sample activation");
  if (await activate.isDisabled()) throw new Error("PLN sample passed physics but cannot be activated.");
  await activate.click();

  const cockpit = page.locator('[data-field-cockpit="true"]');
  await assertVisible(cockpit, "PLN sample field cockpit");
  const cockpitText = await cockpit.innerText();
  if (!cockpitText.includes("SOURCE_GI_KTB_MERANTI") && !cockpitText.includes("JTM_MRT")) {
    throw new Error("Activated cockpit does not expose the PLN-like feeder topology.");
  }

  console.log(`PLN-like sample PASS: imported 4 generated CSVs, validated 14 meters / 1344 AMI points, solved 96 three-phase intervals, technical loss ${lossKwh.toFixed(2)} kWh, and activated the real field cockpit.`);
} finally {
  await browser.close();
}

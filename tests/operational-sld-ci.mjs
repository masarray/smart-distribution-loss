import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

async function selectAndAssert(assetName, titlePattern, selectionMarker) {
  await page.getByRole("button", { name: assetName, exact: true }).first().click();
  await assertVisible(page.getByText(titlePattern), `${assetName} selected-asset chart title`);
  await assertVisible(page.locator(`[data-sld-selection="${selectionMarker}"]`).first(), `${assetName} SLD highlight`);
  await assertVisible(page.locator('[data-manager-peak="true"]'), `${assetName} peak summary`);
  await assertVisible(page.locator('[data-manager-worst-summary="true"]'), `${assetName} worst-interval summary`);
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await assertVisible(page.getByText("Referensi TM", { exact: true }).first(), "operational Referensi TM identity");
  await assertVisible(page.getByText("Pelanggan TM", { exact: true }).first(), "Pelanggan TM identity");
  await assertVisible(page.getByText("TR GD-01", { exact: true }), "GD-01 transformer identity");
  await assertVisible(page.getByText(/PENYULANG 20 kV · GD-01/), "Penyulang 20 kV SLD identity");

  const closedStates = page.getByText("CLOSED", { exact: true });
  if ((await closedStates.count()) < 4) {
    throw new Error(`Expected multiple visible CLOSED breaker states, found ${await closedStates.count()}.`);
  }

  await assertVisible(page.getByText(/CLOSED = tersambung/), "breaker-state legend");
  await assertVisible(page.getByText(/arah aliran/), "power-flow direction legend");

  if ((await page.getByText("Ground truth", { exact: true }).count()) !== 0) {
    throw new Error("Hidden Ground Truth leaked into the main operation chart.");
  }

  await page.getByRole("button", { name: "Jalankan simulasi" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Analysis complete"), null, { timeout: 600_000 });

  const arrows = page.locator('svg [data-flow-arrow="true"]');
  if ((await arrows.count()) < 6) {
    throw new Error(`Expected directional flow arrows after simulation, found ${await arrows.count()}.`);
  }

  await selectAndAssert("Gardu GD-01", /Profil susut teknis · Gardu GD-01/, "gd");
  await selectAndAssert("Penyulang 20 kV", /Profil susut teknis · Penyulang 20 kV/, "feeder");
  await selectAndAssert("Referensi TM", /Profil susut teknis · Referensi TM/, "spot");
  await selectAndAssert("Pelanggan TM", /Profil susut teknis · Pelanggan TM/, "tm");

  const chart = page.locator('[data-loss-chart-root="true"]');
  const box = await chart.boundingBox();
  if (!box) throw new Error("Selected-asset trend chart has no visible bounding box.");
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await assertVisible(page.locator('[data-loss-tooltip="true"]'), "short interval insight tooltip");

  const attentionRows = page.locator('button[data-analysis-status="ATTENTION"]');
  if ((await attentionRows.count()) < 1) {
    throw new Error("Poor-data scenario should surface at least one ATTENTION asset without marking healthy assets as exceptions.");
  }
  const normalRows = page.locator('button[data-analysis-status="NORMAL"]');
  if ((await normalRows.count()) < 1) {
    throw new Error("High-observability MV assets should remain NORMAL after a passing analysis.");
  }

  const ledgerValues = await page.locator('button[data-analysis-status] .numeric').allTextContents();
  if (!ledgerValues.some((value) => /kWh\s*·\s*\d/.test(value))) {
    throw new Error(`Ledger does not expose kWh + loss-rate pairing: ${ledgerValues.join(" | ")}`);
  }

  if ((await page.getByText("Ground truth", { exact: true }).count()) !== 0) {
    throw new Error("Hidden Ground Truth appeared after switching selected assets.");
  }

  console.log("P0 gate PASS: every selected asset has a visible SLD highlight, chart follows selection, peak/worst interval are exposed, and hover insight works.");
} finally {
  await browser.close();
}

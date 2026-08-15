import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await assertVisible(page.getByText("Referensi TM", { exact: true }).first(), "operational Referensi TM identity");
  await assertVisible(page.getByText("Pelanggan TM", { exact: true }).first(), "Pelanggan TM identity");
  await assertVisible(page.getByText("TR GD-01", { exact: true }), "GD-01 transformer identity");

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

  await assertVisible(page.locator('[data-manager-peak="true"]'), "selected-asset peak summary");
  await assertVisible(page.getByText(/Profil susut teknis · Gardu GD-01/), "GD-01 selected-asset chart title");

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

  await page.getByRole("button", { name: "Referensi TM", exact: true }).first().click();
  await page.keyboard.press("Escape");
  await assertVisible(page.getByText(/Profil susut teknis · Referensi TM/), "Referensi TM selected-asset chart title");
  await assertVisible(page.locator('[data-manager-peak="true"]'), "Referensi TM peak summary");

  if ((await page.getByText("Ground truth", { exact: true }).count()) !== 0) {
    throw new Error("Hidden Ground Truth appeared after switching selected assets.");
  }

  console.log("M4 gate PASS: operational SLD, selected-asset trend, kWh + loss %, peak summary, and exception-first ledger are visible.");
} finally {
  await browser.close();
}

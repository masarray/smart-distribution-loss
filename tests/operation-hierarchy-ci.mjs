import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

async function assertNoVisibleText(text, label) {
  const matches = page.getByText(text, { exact: false });
  const count = await matches.count();
  for (let index = 0; index < count; index += 1) {
    if (await matches.nth(index).isVisible()) throw new Error(`${label}: ${text}`);
  }
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await assertVisible(page.getByText("Operator View · Loss Monitoring", { exact: true }), "operator-view identity");
  await assertVisible(page.getByText("Kualitas data", { exact: true }).first(), "operator data-quality heading");
  await assertVisible(page.getByText("Data terbatas", { exact: true }), "plain-language poor-data summary");
  await assertVisible(page.getByText("RENDAH", { exact: true }).first(), "localized poor-preset confidence");
  await assertVisible(page.getByText("Rasio susut", { exact: true }), "operation loss-rate KPI");
  await assertVisible(page.getByText("Keandalan", { exact: true }), "operation confidence KPI");
  await assertVisible(page.getByRole("button", { name: "Lihat data & input", exact: true }), "data drawer action");
  await assertVisible(page.getByRole("button", { name: "Engineering view", exact: true }), "engineering-view boundary action");

  for (const technicalLeak of [
    "PANDAPOWER 3φ",
    "High-observability dedicated TM",
    "SMART CALIBRATION",
    "BOUNDED_LINE_CALIBRATION",
    "coverage threshold",
    "coverage constraint",
  ]) {
    await assertNoVisibleText(technicalLeak, "Technical term leaked into Operator View");
  }

  if ((await page.getByText("Pipeline smart engine", { exact: true }).count()) !== 0) {
    throw new Error("Smart Engine pipeline leaked back into the main operation cockpit.");
  }
  if ((await page.getByText("Err. konvensional", { exact: true }).count()) !== 0) {
    throw new Error("Hidden-truth error KPI leaked back into the main operation cockpit.");
  }
  if ((await page.getByText("Err. smart", { exact: true }).count()) !== 0) {
    throw new Error("Hidden-truth smart error KPI leaked back into the main operation cockpit.");
  }
  if ((await page.getByText("Ground truth", { exact: true }).count()) !== 0) {
    throw new Error("Hidden Ground Truth leaked into the main operation chart.");
  }

  await page.getByRole("button", { name: "Engineering view", exact: true }).click();
  await assertVisible(page.getByText("Engineering View · Gardu GD-01", { exact: true }), "engineering-view title");
  await assertVisible(page.getByText(/Synthetic validation only/), "engineering-only Ground Truth context");
  await assertVisible(page.getByText("Error konvensional", { exact: true }), "engineering conventional error");
  await assertVisible(page.getByText("Error smart engine", { exact: true }), "engineering smart error");

  await page.getByRole("tab", { name: "Proses", exact: true }).click();
  await assertVisible(page.getByText("Timestamp alignment", { exact: true }), "engineering Smart Engine process");
  await assertVisible(page.getByText("Smart model build", { exact: true }), "final Smart Engine process stage");

  console.log("P1 hierarchy gate PASS: Operator View uses plain language while validation, residuals, gates, and engine process stay in Engineering View.");
} finally {
  await browser.close();
}

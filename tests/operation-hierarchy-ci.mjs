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

  await assertVisible(page.getByText("Monitoring susut distribusi", { exact: true }), "operator identity");
  await assertVisible(page.getByText("Kualitas data", { exact: true }).first(), "data-quality heading");
  await assertVisible(page.getByText("Data terbatas", { exact: true }), "plain-language data summary");
  await assertVisible(page.getByText("RENDAH", { exact: true }).first(), "localized confidence");
  await assertVisible(page.getByText("Rasio susut", { exact: true }), "loss-rate KPI");
  await assertVisible(page.getByText("Keandalan", { exact: true }), "confidence KPI");
  await assertVisible(page.getByText("Smart Engine", { exact: true }).first(), "Smart Engine KPI");
  await assertVisible(page.getByText("Model dasar", { exact: true }).first(), "baseline KPI");
  await assertVisible(page.locator('[data-technical-loss-definition="true"]'), "short technical-loss definition");
  await assertVisible(page.getByRole("button", { name: "Lihat data", exact: true }), "data action");
  await assertVisible(page.getByRole("button", { name: "Detail teknis", exact: true }), "technical detail action");

  for (const technicalLeak of [
    "PANDAPOWER 3φ",
    "High-observability dedicated TM",
    "SMART CALIBRATION",
    "BOUNDED_LINE_CALIBRATION",
    "coverage threshold",
    "coverage constraint",
    "REFERENCE UKUR",
    "OBJEK INDEPENDEN",
    "MASUK TOTAL",
    "3 KOMPONEN · DIHITUNG 1×",
    "acuan validasi tersembunyi",
    "tidak dipakai untuk kalibrasi",
  ]) {
    await assertNoVisibleText(technicalLeak, "Developer-facing term leaked into the operator screen");
  }

  if ((await page.getByText("Pipeline smart engine", { exact: true }).count()) !== 0) {
    throw new Error("Smart Engine pipeline leaked back into the operator screen.");
  }
  if ((await page.getByText("Ground truth", { exact: true }).count()) !== 0) {
    throw new Error("Ground Truth leaked into the operator screen.");
  }

  await page.getByRole("button", { name: "Detail teknis", exact: true }).click();
  await assertVisible(page.getByText("Engineering View · Gardu GD-01", { exact: true }), "engineering-view title");
  await assertVisible(page.getByText(/Synthetic validation only/), "engineering-only validation context");
  await assertVisible(page.getByText("Error konvensional", { exact: true }), "engineering conventional error");
  await assertVisible(page.getByText("Error smart engine", { exact: true }), "engineering smart error");

  await page.getByRole("tab", { name: "Proses", exact: true }).click();
  await assertVisible(page.getByText("Timestamp alignment", { exact: true }), "engineering Smart Engine process");
  await assertVisible(page.getByText("Smart model build", { exact: true }), "final Smart Engine process stage");

  console.log("P0 visual-language gate PASS: operator screen is concise and user-facing while technical validation remains in Engineering View.");
} finally {
  await browser.close();
}

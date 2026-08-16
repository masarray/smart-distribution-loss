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
  await assertVisible(page.getByText("Skenario data", { exact: true }), "global data-scenario heading");
  await assertVisible(page.getByText("Kualitas data aset", { exact: true }), "selected-asset data-quality heading");
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
  ]) {
    await assertNoVisibleText(technicalLeak, "Developer-facing term leaked into the operator screen");
  }

  await page.getByRole("button", { name: "Detail teknis", exact: true }).click();
  await assertVisible(page.getByText("Detail teknis · Gardu GD-01", { exact: true }), "technical-view title");
  await assertVisible(page.getByText(/Validasi demo/), "localized validation context");
  await assertVisible(page.getByText("Error model dasar", { exact: true }), "baseline error");
  await assertVisible(page.getByText("Error Smart Engine", { exact: true }), "Smart Engine error");

  await page.getByRole("tab", { name: "Proses", exact: true }).click();
  await assertVisible(page.getByText("Sinkronisasi waktu", { exact: true }), "localized first process stage");
  await assertVisible(page.getByText("Perhitungan model Smart", { exact: true }), "localized final process stage");

  for (const internalTerm of ["P1", "P2", "P3", "SHA-256", "runpp_3ph", "Timestamp alignment", "Missing-AMI reconstruction", "Unknown-phase inference", "Smart model build", "Ground Truth remained immutable"]) {
    await assertNoVisibleText(internalTerm, "Internal terminology leaked into technical drawer");
  }

  await page.getByRole("tab", { name: "Pemeriksaan", exact: true }).click();
  if ((await page.getByText(/P1|P3|SHA-256|runpp_3ph/).count()) !== 0) {
    throw new Error("Developer validation identifiers leaked into localized checks.");
  }

  console.log("P0 language gate PASS: global scenario, asset quality, Data drawer, and technical detail use user-facing Indonesian language.");
} finally {
  await browser.close();
}

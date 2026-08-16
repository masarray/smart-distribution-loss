import { readFileSync } from "node:fs";
import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

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
  await assertVisible(page.getByRole("button", { name: "Kelola dataset", exact: true }), "dataset action");
  await assertVisible(page.getByText("Skenario data", { exact: true }), "global data-scenario heading");
  await assertVisible(page.getByText("Kualitas data aset", { exact: true }), "selected-asset data-quality heading");
  await assertVisible(page.getByText("Data terbatas", { exact: true }), "plain-language data summary");
  await assertVisible(page.getByText("Rasio susut", { exact: true }), "loss-rate KPI");
  await assertVisible(page.getByText("Validasi", { exact: true }), "compact validation KPI");
  await assertVisible(page.getByText("Smart Engine", { exact: true }).first(), "Smart Engine KPI");
  await assertVisible(page.getByText("Model dasar", { exact: true }).first(), "baseline KPI");
  await assertVisible(page.getByRole("button", { name: "Lihat data", exact: true }), "data action");
  await assertVisible(page.getByRole("button", { name: "Detail teknis", exact: true }), "technical detail action");

  const primaryActions = page.locator('[data-action-level="primary"]');
  if ((await primaryActions.count()) !== 1) {
    throw new Error("Action hierarchy must expose exactly one primary CTA.");
  }
  const primaryAction = primaryActions.first();
  await assertVisible(primaryAction, "primary simulation action");
  if ((await primaryAction.textContent())?.trim() !== "Jalankan simulasi") {
    throw new Error("Jalankan simulasi must remain the single primary CTA while idle.");
  }

  for (const actionName of ["Kelola dataset", "Lihat data", "Data", "Detail teknis"]) {
    const action = page.getByRole("button", { name: actionName, exact: true }).first();
    await assertVisible(action, `${actionName} secondary action`);
    if ((await action.getAttribute("data-action-level")) !== "secondary") {
      throw new Error(`${actionName} must use the secondary action level.`);
    }
  }

  const selectedAsset = page.locator('[data-asset-selector="gd"][data-selected="true"]');
  await assertVisible(selectedAsset, "selected asset treatment");
  if ((await selectedAsset.getAttribute("aria-current")) !== "true") {
    throw new Error("Selected asset must expose an explicit current state.");
  }

  const primaryBackground = await primaryAction.evaluate((node) => getComputedStyle(node).backgroundColor);
  const selectedBackground = await selectedAsset.evaluate((node) => getComputedStyle(node).backgroundColor);
  const detailBackground = await page
    .getByRole("button", { name: "Detail teknis", exact: true })
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  if (primaryBackground === selectedBackground || primaryBackground === detailBackground) {
    throw new Error("Selected assets and secondary actions must not visually compete with the primary CTA.");
  }

  const idleRunState = page.locator('[data-analysis-run-state="idle"]');
  await assertVisible(idleRunState, "idle simulation state");
  await assertVisible(page.getByText("Siap menjalankan simulasi", { exact: true }), "idle simulation copy");

  for (const stateCopy of ["Analisis berjalan", "Analisis selesai", "Analisis gagal"]) {
    if (!appSource.includes(stateCopy)) {
      throw new Error(`Missing calm analysis state copy: ${stateCopy}`);
    }
  }
  for (const stateToken of ["bg-primary/5", "bg-success/5", "bg-destructive/5"]) {
    if (!appSource.includes(stateToken)) {
      throw new Error(`Missing distinct analysis state treatment: ${stateToken}`);
    }
  }

  for (const noise of [
    "Keandalan hasil",
    "Susut teknis: rugi energi",
    "Data siap dianalisis.",
    "Estimasi tersedia",
    "DEMO SINTETIS",
    "Akurasi demo",
  ]) {
    await assertNoVisibleText(noise, "Duplicate or secondary operator noise leaked into the cockpit");
  }

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
  await assertVisible(page.getByText("Acuan validasi", { exact: true }), "compact validation reference");
  await assertVisible(page.getByText("Error model dasar", { exact: true }), "baseline error");
  await assertVisible(page.getByText("Error Smart Engine", { exact: true }), "Smart Engine error");
  await assertNoVisibleText("Validasi demo.", "Long demo validation note should be removed");

  await page.getByRole("tab", { name: "Proses", exact: true }).click();
  await assertVisible(page.getByText("Sinkronisasi waktu", { exact: true }), "localized first process stage");
  await assertVisible(page.getByText("Perhitungan model Smart", { exact: true }), "localized final process stage");
  await assertNoVisibleText("Urutan koreksi data hingga model Smart siap dihitung.", "Redundant process intro should be removed");

  for (const internalTerm of ["P1", "P2", "P3", "SHA-256", "runpp_3ph", "Timestamp alignment", "Missing-AMI reconstruction", "Unknown-phase inference", "Smart model build", "Ground Truth remained immutable"]) {
    await assertNoVisibleText(internalTerm, "Internal terminology leaked into technical drawer");
  }

  await page.getByRole("tab", { name: "Pemeriksaan", exact: true }).click();
  if ((await page.getByText(/P1|P3|SHA-256|runpp_3ph/).count()) !== 0) {
    throw new Error("Developer validation identifiers leaked into localized checks.");
  }

  console.log("P1 action-hierarchy gate PASS: one primary CTA, quiet secondary actions, explicit selection, and calm run states are enforced.");
} finally {
  await browser.close();
}

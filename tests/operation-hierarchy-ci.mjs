import { readFileSync } from "node:fs";
import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const datasetSource = readFileSync(new URL("../src/components/sdl/DatasetManager.tsx", import.meta.url), "utf8");

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

async function assertFitsViewport(locator, label) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error(`${label}: missing geometry.`);
  if (box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    throw new Error(`${label}: outside viewport ${JSON.stringify(box)} within ${JSON.stringify(viewport)}.`);
  }
}

function closeEnough(a, b, tolerance = 0.6) {
  return Math.abs(a - b) <= tolerance;
}

async function drawerChromeMetrics(drawer, label, expectTabs) {
  await assertVisible(drawer, label);
  await assertFitsViewport(drawer, label);

  const header = drawer.locator('[data-drawer-header="true"]');
  const body = drawer.locator('[data-drawer-body="true"]');
  const close = drawer.getByRole("button", { name: "Close", exact: true });
  const icon = drawer.locator('[data-drawer-icon="true"]');
  const title = drawer.locator('[data-drawer-title="true"]');
  const description = drawer.locator('[data-drawer-description="true"]');
  const scrollbar = drawer.locator('[data-scrollarea-scrollbar="vertical"]').first();

  for (const [locator, name] of [
    [header, "header"],
    [body, "body"],
    [close, "close"],
    [icon, "icon"],
    [title, "title"],
    [description, "description"],
    [scrollbar, "scrollbar"],
  ]) {
    await assertVisible(locator, `${label} ${name}`);
  }

  const closeBox = await close.boundingBox();
  const titleBox = await title.boundingBox();
  if (!closeBox || !titleBox) throw new Error(`${label}: missing close/title geometry.`);
  if (!closeEnough(closeBox.width, 32, 1) || !closeEnough(closeBox.height, 32, 1)) {
    throw new Error(`${label}: close button must stay 32×32, got ${closeBox.width.toFixed(1)}×${closeBox.height.toFixed(1)}.`);
  }
  const overlapX = Math.min(closeBox.x + closeBox.width, titleBox.x + titleBox.width) - Math.max(closeBox.x, titleBox.x);
  const overlapY = Math.min(closeBox.y + closeBox.height, titleBox.y + titleBox.height) - Math.max(closeBox.y, titleBox.y);
  if (overlapX > 0 && overlapY > 0) throw new Error(`${label}: title collides with close button.`);

  const headerStyle = await header.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      paddingTop: parseFloat(style.paddingTop),
      paddingRight: parseFloat(style.paddingRight),
      paddingBottom: parseFloat(style.paddingBottom),
      paddingLeft: parseFloat(style.paddingLeft),
    };
  });
  const bodyStyle = await body.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      paddingTop: parseFloat(style.paddingTop),
      paddingLeft: parseFloat(style.paddingLeft),
      paddingBottom: parseFloat(style.paddingBottom),
    };
  });
  const scrollBox = await scrollbar.boundingBox();
  if (!scrollBox || scrollBox.width < 2 || scrollBox.height < 20) {
    throw new Error(`${label}: scrollbar affordance is not usable.`);
  }

  let tab = null;
  if (expectTabs) {
    const tabs = drawer.locator('[data-drawer-tabs="true"]');
    await assertVisible(tabs, `${label} tabs`);
    const trigger = tabs.getByRole("tab").first();
    await assertVisible(trigger, `${label} first tab`);
    const tabBox = await trigger.boundingBox();
    const tabStyle = await trigger.evaluate((node) => getComputedStyle(node).fontSize);
    if (!tabBox) throw new Error(`${label}: missing tab geometry.`);
    tab = { height: tabBox.height, fontSize: parseFloat(tabStyle) };
  }

  return {
    headerStyle,
    bodyStyle,
    close: { width: closeBox.width, height: closeBox.height },
    tab,
  };
}

function assertSameChrome(reference, current, label) {
  for (const key of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
    if (!closeEnough(reference.headerStyle[key], current.headerStyle[key])) {
      throw new Error(`${label}: header ${key} drifted (${reference.headerStyle[key]} vs ${current.headerStyle[key]}).`);
    }
  }
  for (const key of ["paddingTop", "paddingLeft", "paddingBottom"]) {
    if (!closeEnough(reference.bodyStyle[key], current.bodyStyle[key])) {
      throw new Error(`${label}: body ${key} drifted (${reference.bodyStyle[key]} vs ${current.bodyStyle[key]}).`);
    }
  }
  if (!closeEnough(reference.close.width, current.close.width) || !closeEnough(reference.close.height, current.close.height)) {
    throw new Error(`${label}: close affordance drifted.`);
  }
}

async function openDrawer(buttonName, drawerName, expectTabs, label) {
  await page.getByRole("button", { name: buttonName, exact: true }).first().click();
  const drawer = page.locator(`[data-drawer="${drawerName}"]`);
  const metrics = await drawerChromeMetrics(drawer, label, expectTabs);
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await drawer.waitFor({ state: "hidden", timeout: 15_000 });
  return metrics;
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

  for (const staleDatasetCopy of [
    "FIELD DATASET FOUNDATION",
    "MAIN COCKPIT MASIH SYNTHETIC VIEW",
    "Import field dataset",
    "canonical 24-hour window",
    "Schema & readiness",
    "SOLVER READY",
    "SCHEMA REVIEW",
    "Field physics preview",
    "Run physics preview",
    "Technical loss",
    "Peak loss",
    "Min voltage",
    "Max loading",
    "Supplied energy",
    "Customer load energy",
    "Source residual NRMSE",
    "M5 boundary",
  ]) {
    if (datasetSource.includes(staleDatasetCopy)) {
      throw new Error(`Dataset Manager still exposes inconsistent implementation-facing copy: ${staleDatasetCopy}`);
    }
  }

  for (const viewport of [
    { width: 1366, height: 768, label: "1366×768" },
    { width: 1440, height: 900, label: "1440×900" },
    { width: 1920, height: 1080, label: "1920×1080" },
    { width: 1093, height: 614, label: "1366×768 / 125% zoom equivalent" },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const dataMetrics = await openDrawer("Lihat data", "data", true, `Data drawer ${viewport.label}`);
    const technicalMetrics = await openDrawer("Detail teknis", "technical", true, `Technical drawer ${viewport.label}`);
    const datasetMetrics = await openDrawer("Kelola dataset", "dataset-manager", false, `Dataset Manager ${viewport.label}`);

    assertSameChrome(dataMetrics, technicalMetrics, `Data vs technical ${viewport.label}`);
    assertSameChrome(dataMetrics, datasetMetrics, `Data vs dataset ${viewport.label}`);

    if (!dataMetrics.tab || !technicalMetrics.tab) throw new Error(`${viewport.label}: missing tab metrics.`);
    if (!closeEnough(dataMetrics.tab.height, technicalMetrics.tab.height) || !closeEnough(dataMetrics.tab.fontSize, technicalMetrics.tab.fontSize)) {
      throw new Error(`${viewport.label}: Data and technical tab typography/height drifted.`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
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

  console.log("P2 consistency gate PASS: action hierarchy stays intact while Data, Technical, and Dataset drawers share chrome, spacing, close affordance, tab language, scroll behavior, and target viewport safety.");
} finally {
  await browser.close();
}

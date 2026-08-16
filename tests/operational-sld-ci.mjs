import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

async function assertNoOverlap(first, second, label) {
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  if (!a || !b) throw new Error(`${label}: missing visible bounding box.`);
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapX > 0 && overlapY > 0) {
    throw new Error(`${label}: elements overlap by ${overlapX.toFixed(1)} × ${overlapY.toFixed(1)} px.`);
  }
}

async function assertFitsViewport(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label}: missing bounding box.`);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error(`${label}: viewport unavailable.`);
  if (box.x < 0 || box.y < 0 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    throw new Error(`${label}: clipped outside viewport (${JSON.stringify(box)} within ${JSON.stringify(viewport)}).`);
  }
}

async function selectAndAssert(assetName, titlePattern, selectionMarker) {
  await page.getByRole("button", { name: assetName, exact: true }).first().click();
  await assertVisible(page.getByText(titlePattern), `${assetName} selected-asset chart title`);
  await assertVisible(page.locator(`[data-sld-selection="${selectionMarker}"]`).first(), `${assetName} SLD highlight`);
  await assertVisible(page.locator('[data-manager-peak="true"]'), `${assetName} peak summary`);
  await assertVisible(page.locator('[data-manager-worst-summary="true"]'), `${assetName} worst-interval summary`);
}

async function assertCompactValidationKpi(label) {
  const panel = page.locator('[data-selected-asset-panel="true"]');
  await assertVisible(panel.getByText("Validasi", { exact: true }), `${label} validation KPI label`);
  await assertVisible(panel.getByText("poin akurasi", { exact: true }), `${label} validation KPI unit`);
  const unit = panel.getByText("poin akurasi", { exact: true });
  const card = unit.locator("xpath=..");
  const text = await card.innerText();
  if (!/[+-]?\d+(?:\.\d+)?/.test(text)) {
    throw new Error(`${label} validation KPI should expose a numeric gain after simulation: ${text}`);
  }
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await assertVisible(page.getByText("Referensi TM", { exact: true }).first(), "Referensi TM identity");
  await assertVisible(page.getByText("Pelanggan TM", { exact: true }).first(), "Pelanggan TM identity");
  await assertVisible(page.getByText("TR GD-01", { exact: true }), "GD-01 transformer identity");
  await assertVisible(page.getByText(/PENYULANG 20 kV · GD-01/), "Penyulang 20 kV identity");

  const closedBreakers = page.locator('svg [data-breaker-state="CLOSED"]');
  if ((await closedBreakers.count()) < 7) {
    throw new Error(`Expected closed breaker semantics without repeated text noise; found ${await closedBreakers.count()}.`);
  }
  if ((await page.getByText("CLOSED", { exact: true }).count()) !== 0) {
    throw new Error("Repeated CLOSED labels should not be visible in the operator SLD.");
  }
  await assertVisible(page.getByText("aliran daya", { exact: true }), "compact flow legend");

  const transformerWindingCircles = page.locator('[data-transformer-symbol="true"] > circle');
  if ((await transformerWindingCircles.count()) !== 2) {
    throw new Error(`Transformer symbol should contain only two winding circles; found ${await transformerWindingCircles.count()}.`);
  }

  const busLabel = page.locator('[data-sld-bus-label="true"]');
  await assertNoOverlap(page.locator('[data-sld-card="spot"]'), busLabel, "Referensi TM card vs LV bus label");
  await assertNoOverlap(page.locator('[data-sld-card="tm"]'), busLabel, "Pelanggan TM card vs LV bus label");
  await assertNoOverlap(page.locator('[data-sld-card="spot"]'), page.locator('[data-sld-card="tm"]'), "MV cards");

  if ((await page.getByText("Ground truth", { exact: true }).count()) !== 0) {
    throw new Error("Ground Truth leaked into the operator chart.");
  }

  await page.getByRole("button", { name: "Jalankan simulasi" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Analisis selesai"), null, { timeout: 600_000 });

  const arrows = page.locator('svg [data-flow-arrow="true"]');
  if ((await arrows.count()) < 6) {
    throw new Error(`Expected directional flow arrows after simulation, found ${await arrows.count()}.`);
  }

  await selectAndAssert("Gardu GD-01", /Profil susut · Gardu GD-01/, "gd");
  await assertCompactValidationKpi("GD-01");

  await selectAndAssert("Penyulang 20 kV", /Profil susut · Penyulang 20 kV/, "feeder-label");
  await assertVisible(page.locator('[data-feeder-rollup="true"]'), "compact feeder roll-up");
  for (const component of ["spot", "tm", "gd"]) {
    await assertVisible(page.locator(`[data-feeder-component="${component}"]`), `${component} feeder component`);
    await assertVisible(page.locator(`[data-feeder-role="${component}"]`), `${component} feeder role`);
  }
  await assertVisible(page.getByText("Data terukur", { exact: true }), "measurement-reference user label");
  if ((await page.getByText("Dihitung sendiri", { exact: true }).count()) !== 2) {
    throw new Error("Pelanggan TM and GD-01 should be shown as independently calculated assets.");
  }
  const totalText = await page.locator('[data-feeder-formula="true"]').innerText();
  if (!/\d+(?:\.\d+)?\s*kWh\/hari/.test(totalText)) {
    throw new Error(`Feeder total is not clear: ${totalText}`);
  }
  await assertVisible(page.getByText("Model dasar", { exact: true }).first(), "baseline label");
  await assertVisible(page.getByText("Smart Engine", { exact: true }).first(), "Smart Engine label");
  await assertCompactValidationKpi("Feeder");

  const statusPanel = page.locator('[data-asset-status-panel="true"]');
  await assertVisible(statusPanel, "asset-status panel");
  await assertFitsViewport(page.locator('[data-selected-asset-panel="true"]'), "selected-asset panel");
  await assertFitsViewport(statusPanel, "asset-status panel");
  const statusOverflow = await statusPanel.evaluate((element) => element.scrollHeight - element.clientHeight);
  if (statusOverflow > 2) {
    throw new Error(`Asset-status panel should fit without hidden rows at 1440x900; overflow=${statusOverflow}px.`);
  }

  await selectAndAssert("Referensi TM", /Profil susut · Referensi TM/, "spot");
  await selectAndAssert("Pelanggan TM", /Profil susut · Pelanggan TM/, "tm");

  const chart = page.locator('[data-loss-chart-root="true"]');
  const box = await chart.boundingBox();
  if (!box) throw new Error("Selected-asset trend chart has no visible bounding box.");
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await assertVisible(page.locator('[data-loss-tooltip="true"]'), "interval tooltip");
  if ((await page.locator('[data-manager-worst="true"]').count()) !== 0) {
    throw new Error("Duplicate floating worst-gap badge should be removed; summary belongs in the chart header only.");
  }

  const attentionRows = page.locator('button[data-analysis-status="ATTENTION"]');
  if ((await attentionRows.count()) < 1) {
    throw new Error("Poor-data scenario should surface at least one ATTENTION asset.");
  }
  const normalRows = page.locator('button[data-analysis-status="NORMAL"]');
  if ((await normalRows.count()) < 1) {
    throw new Error("High-observability MV assets should remain NORMAL after passing analysis.");
  }

  const ledgerValues = await page.locator('button[data-analysis-status] .numeric').allTextContents();
  if (!ledgerValues.some((value) => /kWh\s*·\s*\d/.test(value))) {
    throw new Error(`Status list does not expose kWh + loss-rate pairing: ${ledgerValues.join(" | ")}`);
  }

  console.log("P0 visual-fit gate PASS: no SLD text clutter/collision, feeder roll-up is concise, compact validation remains visible, and right-side panels fit at 1440x900.");
} finally {
  await browser.close();
}

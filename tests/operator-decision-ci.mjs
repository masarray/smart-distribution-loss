import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label, timeout = 15_000) {
  await locator.waitFor({ state: "visible", timeout });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

async function assertDecision(expectedStatus, expectedSource, label) {
  const decision = page.locator('[data-operator-decision="true"]');
  await assertVisible(decision, `${label} decision`);

  const status = await decision.getAttribute("data-decision-status");
  const source = await decision.getAttribute("data-decision-source");
  if (status !== expectedStatus) throw new Error(`${label}: expected status ${expectedStatus}, got ${status}.`);
  if (source !== expectedSource) throw new Error(`${label}: expected source ${expectedSource}, got ${source}.`);

  await assertVisible(decision.locator('[data-decision-headline="true"]'), `${label} headline`);
  await assertVisible(decision.locator('[data-decision-reason="true"]'), `${label} reason`);
  await assertVisible(decision.locator('[data-decision-action="true"]'), `${label} action`);

  const reason = (await decision.locator('[data-decision-reason="true"]').innerText()).trim();
  const action = (await decision.locator('[data-decision-action="true"]').innerText()).trim();
  if (reason.length < 12 || reason.length > 220) throw new Error(`${label}: reason length is not concise/actionable (${reason.length}).`);
  if (action.length < 12 || action.length > 240) throw new Error(`${label}: action length is not concise/actionable (${action.length}).`);
  if (/\bAI\b|machine learning|LLM/i.test(`${reason} ${action}`)) {
    throw new Error(`${label}: decision copy must remain deterministic and evidence-based, not framed as AI advice.`);
  }
  return decision;
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const pending = await assertDecision("PENDING", "pending", "pre-simulation");
  await assertVisible(pending.getByText("Jalankan simulasi untuk membentuk rekomendasi operasional.", { exact: true }), "pending next action");
  if ((await pending.locator('[data-decision-evidence="true"]').count()) !== 0) {
    throw new Error("Pending decision must not invent evidence before a simulation exists.");
  }

  await page.getByRole("button", { name: "Jalankan simulasi", exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Analisis selesai"), null, { timeout: 600_000 });

  const attentionRows = page.locator('button[data-analysis-status="ATTENTION"]');
  if ((await attentionRows.count()) < 1) throw new Error("Poor-data run must expose at least one ATTENTION asset for P3 decision validation.");
  await attentionRows.first().click();

  const attention = await assertDecision("ATTENTION", "quality", "attention asset");
  const attentionReason = await attention.locator('[data-decision-reason="true"]').innerText();
  if (!/\d+[,.]\d%/.test(attentionReason)) {
    throw new Error(`ATTENTION reason must expose traceable numeric quality evidence: ${attentionReason}`);
  }
  const attentionEvidence = attention.locator('[data-decision-evidence="true"]');
  await assertVisible(attentionEvidence, "attention evidence");
  if (!/Dasar:\s*.+\d+[,.]\d%/.test((await attentionEvidence.innerText()).trim())) {
    throw new Error(`ATTENTION evidence must identify the limiting metric: ${await attentionEvidence.innerText()}`);
  }

  const normalRows = page.locator('button[data-analysis-status="NORMAL"]');
  if ((await normalRows.count()) < 1) throw new Error("High-observability assets must expose a NORMAL decision state.");
  await normalRows.first().click();

  const normal = await assertDecision("NORMAL", "normal", "normal asset");
  await assertVisible(normal.locator('[data-decision-evidence="true"]'), "normal evidence");
  const normalAction = await normal.locator('[data-decision-action="true"]').innerText();
  if (!/profil susut|interval puncak/i.test(normalAction)) {
    throw new Error(`NORMAL action should direct the operator to the next useful analysis step: ${normalAction}`);
  }

  const reviewRows = page.locator('button[data-analysis-status="REVIEW"]');
  if ((await reviewRows.count()) > 0) {
    await reviewRows.first().click();
    const review = await assertDecision("REVIEW", "gate", "review asset");
    await assertVisible(review.locator('[data-decision-evidence="true"]'), "review evidence");
    const reviewAction = await review.locator('[data-decision-action="true"]').innerText();
    if (!/Detail teknis|verifikasi|periksa|tinjau/i.test(reviewAction)) {
      throw new Error(`REVIEW action must route the operator to a concrete verification step: ${reviewAction}`);
    }
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  const selectedPanel = page.locator('[data-selected-asset-panel="true"]');
  const statusPanel = page.locator('[data-asset-status-panel="true"]');
  await assertVisible(selectedPanel, "selected asset panel at 1366x768");
  await assertVisible(statusPanel, "status panel at 1366x768");
  const viewport = page.viewportSize();
  for (const [locator, label] of [[selectedPanel, "selected asset panel"], [statusPanel, "status panel"]]) {
    const box = await locator.boundingBox();
    if (!box || !viewport) throw new Error(`${label}: geometry unavailable.`);
    if (box.x < 0 || box.y < 0 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
      throw new Error(`${label}: P3 decision layer must stay inside 1366x768 viewport.`);
    }
  }

  console.log("P3 operator decision gate PASS: pending, evidence-backed ATTENTION, NORMAL guidance, optional REVIEW routing, and 1366x768 fit are enforced.");
} finally {
  await browser.close();
}

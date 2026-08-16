import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

function timeAt(index) {
  return `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`;
}

const networkHeader = [
  "element_id","element_type","from_bus","to_bus","from_kv","to_kv","length_km","r_ohm_per_km","x_ohm_per_km","c_nf_per_km","r0_ohm_per_km","x0_ohm_per_km","c0_nf_per_km","max_i_ka","rated_kva","vk_percent","vkr_percent","vk0_percent","vkr0_percent","pfe_kw","i0_percent","vector_group","shift_degree","s_sc_max_mva","rx_max","r0x0_max","x0x_max",
].join(",");
const network = [
  networkHeader,
  "GRID,source,,GRID20,,20,,,,,,,,,,,,,,,,,,1000,0.1,0.1,1.0",
  "MV-L1,line,GRID20,TRHV,20,20,0.25,0.32,0.34,12,0.85,1.05,8,0.30,,,,,,,,,,,,",
  "TR-01,transformer,TRHV,LVMAIN,20,0.4,,,,,,,,,400,4.0,1.10,4.0,1.10,0.75,0.25,Dyn,150,,,,",
  "LV-L1,line,LVMAIN,LVA,0.4,0.4,0.03,0.20,0.08,12,0.80,0.30,8,0.25,,,,,,,,,,,,",
  "LV-L2,line,LVMAIN,LVB,0.4,0.4,0.04,0.22,0.09,12,0.82,0.32,8,0.25,,,,,,,,,,,,",
].join("\n");
const customers = [
  "customer_id,bus_id,phase,meter_id,contract_kva,pf",
  "C-001,LVA,A,M-001,23,0.95",
  "C-002,LVB,B,M-002,23,0.95",
  "C-003,LVB,C,M-003,23,0.95",
].join("\n");
const amiRows = ["timestamp,meter_id,p_kw,q_kvar,quality"];
const measurementRows = ["timestamp,asset_id,measurement_type,phase,value,unit,quality"];
for (let i = 0; i < 96; i += 1) {
  const time = timeAt(i);
  const shape = 0.78 + 0.22 * Math.sin((i / 96) * Math.PI * 2 - Math.PI / 2);
  const p1 = 15.0 * shape;
  const p2 = 17.0 * shape;
  const p3 = 14.0 * shape;
  amiRows.push(`${time},M-001,${p1.toFixed(4)},${(p1 * 0.329).toFixed(4)},GOOD`);
  amiRows.push(`${time},M-002,${p2.toFixed(4)},${(p2 * 0.329).toFixed(4)},GOOD`);
  amiRows.push(`${time},M-003,${p3.toFixed(4)},${(p3 * 0.329).toFixed(4)},GOOD`);
  measurementRows.push(`${time},GRID,P,ABC,${((p1 + p2 + p3) * 1.025).toFixed(4)},kW,GOOD`);
}
const ami = amiRows.join("\n");
const measurements = measurementRows.join("\n");

async function assertVisible(locator, label, timeout = 15_000) {
  await locator.waitFor({ state: "visible", timeout });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

async function activateFieldMode() {
  await page.getByRole("button", { name: "Kelola dataset", exact: true }).click();
  const input = page.locator('input[data-field-files="true"]');
  await input.setInputFiles([
    { name: "network.csv", mimeType: "text/csv", buffer: Buffer.from(network) },
    { name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(customers) },
    { name: "measurements.csv", mimeType: "text/csv", buffer: Buffer.from(measurements) },
    { name: "ami.csv", mimeType: "text/csv", buffer: Buffer.from(ami) },
  ]);
  await assertVisible(page.getByText("SIAP DIHITUNG", { exact: true }), "field solver readiness");
  await page.locator('button[data-run-field="true"]').click();
  const resultPanel = page.locator('[data-field-result="true"]');
  await assertVisible(resultPanel, "field result", 600_000);
  const resultText = await resultPanel.innerText();
  if (!resultText.includes("PERHITUNGAN LULUS") || !resultText.includes("96/96 interval selesai")) {
    throw new Error(`Field physics did not pass before P8 activation: ${resultText}`);
  }
  const activate = page.locator('button[data-activate-field="true"]');
  await assertVisible(activate, "field activation");
  if (await activate.isDisabled()) throw new Error("Valid field result unexpectedly blocked.");
  await activate.click();
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await activateFieldMode();

  const cockpit = page.locator('[data-field-cockpit="true"][data-p8-cockpit="true"]');
  await assertVisible(cockpit, "P8 field cockpit");
  const investigation = cockpit.locator('[data-p8-investigation="true"]');
  await assertVisible(investigation, "P8 investigation workspace");
  if ((await investigation.getAttribute("data-p8-ready")) !== "false") {
    throw new Error("P8 must not fabricate an asset investigation while source is selected.");
  }

  const priorityRows = cockpit.locator('button[data-p7-priority-rank]');
  if ((await priorityRows.count()) < 2) throw new Error("P8 requires at least two ranked assets for workflow switching regression.");
  const firstPriority = priorityRows.first();
  const secondPriority = priorityRows.nth(1);
  const firstId = await firstPriority.getAttribute("data-p7-priority-id");
  const secondId = await secondPriority.getAttribute("data-p7-priority-id");
  if (!firstId || !secondId || firstId === secondId) throw new Error("Priority fixture did not expose unique ranked assets.");

  await firstPriority.click();
  await page.waitForFunction((id) => document.querySelector('[data-p8-investigation="true"]')?.getAttribute("data-p8-element-id") === id, firstId, { timeout: 5_000 });
  if ((await investigation.getAttribute("data-p8-ready")) !== "true") throw new Error("P8 did not become ready for selected priority asset.");
  if ((await investigation.getAttribute("data-p8-priority-rank")) !== "1") throw new Error("P8 priority rank does not match the P7 selected priority.");
  if (!/^(LOSS|LOADING|VOLTAGE)$/.test((await investigation.getAttribute("data-p8-dominant-factor")) ?? "")) throw new Error("P8 dominant factor contract is missing.");
  if (!/^\d{2}:\d{2}$/.test((await investigation.getAttribute("data-p8-anchor-time")) ?? "")) throw new Error("P8 anchor interval is not traceable to a 15-minute timestamp.");
  await assertVisible(investigation.locator('[data-p8-summary="true"]'), "P8 evidence summary");

  for (const kind of ["loss", "loading", "voltage"]) {
    const card = investigation.locator(`[data-p8-worst="${kind}"]`);
    await assertVisible(card, `P8 worst-${kind} evidence`);
    const value = Number(await card.getAttribute("data-p8-worst-value"));
    const time = await card.getAttribute("data-p8-worst-time");
    if (!Number.isFinite(value)) throw new Error(`P8 worst-${kind} value is not numeric.`);
    if (!time || !/^\d{2}:\d{2}$/.test(time)) throw new Error(`P8 worst-${kind} interval is not traceable: ${time}`);
  }

  const scoreParts = await investigation.locator('[data-p8-score-part]').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-p8-score-points"))));
  const scoreTotal = Number(await investigation.getAttribute("data-p8-priority-score"));
  const scoreSum = scoreParts.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(scoreTotal) || Math.abs(scoreTotal - scoreSum) > 0.02) {
    throw new Error(`P8 score breakdown no longer reconciles with P7 score: total=${scoreTotal}, parts=${scoreSum}.`);
  }

  const route = investigation.locator('[data-p8-route="true"]');
  await assertVisible(route, "P8 related-route evidence");
  const downstreamCustomers = Number(await route.locator('[data-p8-downstream-customers]').getAttribute("data-p8-downstream-customers"));
  if (!Number.isFinite(downstreamCustomers) || downstreamCustomers < 1) throw new Error(`P8 downstream customer scope is invalid: ${downstreamCustomers}`);

  const checks = investigation.locator('button[data-p8-check-id]');
  const checkCount = await checks.count();
  if (checkCount < 4) throw new Error(`P8 checklist is too shallow: ${checkCount} items.`);
  if ((await investigation.locator('button[data-p8-check-complete="true"]').count()) !== 0) {
    throw new Error("P8 checklist must never auto-complete field verification.");
  }
  const progress = investigation.locator('[data-p8-check-progress="true"]');
  if ((await progress.innerText()) !== `0/${checkCount}`) throw new Error(`P8 initial checklist progress is not zero: ${await progress.innerText()}`);

  const firstCheck = checks.first();
  const firstCheckId = await firstCheck.getAttribute("data-p8-check-id");
  await firstCheck.click();
  if ((await firstCheck.getAttribute("aria-pressed")) !== "true") throw new Error("Manual P8 checklist completion did not persist for the selected asset.");
  if ((await progress.innerText()) !== `1/${checkCount}`) throw new Error(`P8 checklist progress did not increment: ${await progress.innerText()}`);

  await secondPriority.click();
  await page.waitForFunction((id) => document.querySelector('[data-p8-investigation="true"]')?.getAttribute("data-p8-element-id") === id, secondId, { timeout: 5_000 });
  if ((await investigation.locator('[data-p8-check-progress="true"]').innerText()).startsWith("1/")) {
    throw new Error("P8 checklist completion leaked from one asset into another.");
  }

  await firstPriority.click();
  await page.waitForFunction((id) => document.querySelector('[data-p8-investigation="true"]')?.getAttribute("data-p8-element-id") === id, firstId, { timeout: 5_000 });
  const restoredCheck = investigation.locator(`button[data-p8-check-id="${firstCheckId}"]`);
  if ((await restoredCheck.getAttribute("aria-pressed")) !== "true") throw new Error("P8 per-asset checklist progress was not retained in the active Field Mode session.");

  await page.setViewportSize({ width: 1366, height: 768 });
  const statusPanel = cockpit.locator('[data-field-status-panel="true"]');
  await assertVisible(statusPanel, "P8 scrollable right workspace at 1366x768");
  const box = await statusPanel.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    throw new Error(`P8 status workspace escapes 1366x768 viewport: ${JSON.stringify(box)}.`);
  }
  const scrollMetrics = await statusPanel.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }));
  if (scrollMetrics.scrollHeight > scrollMetrics.clientHeight + 2 && !["auto", "scroll"].includes(scrollMetrics.overflowY)) {
    throw new Error(`P8 long investigation content must remain scroll-accessible: ${JSON.stringify(scrollMetrics)}.`);
  }

  console.log("P8 investigation gate PASS: ranked field assets expose traceable worst intervals, score rationale, upstream/downstream scope, manual per-asset checklist state, and constrained-viewport-safe investigation workflow without changing physics.");
} finally {
  await browser.close();
}

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
  const shape = 0.82 + 0.18 * Math.sin((i / 96) * Math.PI * 2 - Math.PI / 2);
  const p1 = 15.0 * shape;
  const p2 = 16.0 * shape;
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

async function assertFitsViewport(locator, label) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error(`${label}: missing geometry.`);
  if (box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    throw new Error(`${label}: outside viewport ${JSON.stringify(box)} within ${JSON.stringify(viewport)}.`);
  }
}

async function assertAnimatedSvgPaths(locator, label, minimumCount) {
  const count = await locator.count();
  if (count < minimumCount) throw new Error(`${label}: expected at least ${minimumCount} paths, found ${count}.`);

  const samples = await locator.evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    return {
      length: typeof node.getTotalLength === "function" ? node.getTotalLength() : 0,
      animation: style.animationName,
      duration: style.animationDuration,
      opacity: Number.parseFloat(style.opacity),
      strokeWidth: Number.parseFloat(style.strokeWidth),
    };
  }));

  if (samples.some((sample) => sample.length < 10)) {
    throw new Error(`${label}: path geometry collapsed: ${JSON.stringify(samples)}`);
  }
  if (samples.some((sample) => sample.animation !== "sld-flow")) {
    throw new Error(`${label}: electrical-flow animation is missing: ${JSON.stringify(samples)}`);
  }
  if (samples.some((sample) => sample.opacity < 0.88 || sample.strokeWidth < 1.7)) {
    throw new Error(`${label}: electrical-flow overlay is too weak: ${JSON.stringify(samples)}`);
  }
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const acSource = page.locator('[data-ac-source-symbol="true"]');
  await assertVisible(acSource, "AC source symbol from supplied SVG reference");
  const acPath = await acSource.getAttribute("d");
  if (!acPath || !acPath.includes("M42.5 93") || !acPath.includes("88.833") || !acPath.includes("97.167")) {
    throw new Error(`AC source geometry regression: ${acPath}`);
  }

  await page.getByRole("button", { name: "Jalankan simulasi" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Analisis selesai"), null, { timeout: 600_000 });

  const mvTrafoFlow = page.locator('[data-transformer-flow="mv-in"] .flow-dash, [data-transformer-flow="mv-in"] .flow-dash-slow');
  const lvTrafoFlow = page.locator('[data-transformer-flow="lv-out"] .flow-dash, [data-transformer-flow="lv-out"] .flow-dash-slow');
  const windingFlow = page.locator('[data-transformer-winding-flow="true"] circle');
  await assertAnimatedSvgPaths(mvTrafoFlow, "MV current flow into transformer", 2);
  await assertAnimatedSvgPaths(lvTrafoFlow, "LV current flow from transformer to busbar/JTR", 4);
  if ((await windingFlow.count()) !== 2) throw new Error("Both transformer windings must expose energized flow without a false galvanic bridge.");
  const windingAnimations = await windingFlow.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationName));
  if (windingAnimations.some((name) => name !== "sld-flow")) throw new Error(`Transformer winding-flow animation missing: ${JSON.stringify(windingAnimations)}`);

  await page.getByRole("button", { name: "Kelola dataset", exact: true }).click();
  await assertVisible(page.getByText("Dataset Manager", { exact: true }), "Dataset Manager");
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
  await assertVisible(resultPanel, "field result panel", 600_000);
  const resultText = await resultPanel.innerText();
  if (!resultText.includes("PERHITUNGAN LULUS") || !resultText.includes("96/96 interval selesai")) {
    throw new Error(`Field physics did not pass before P7 activation: ${resultText}`);
  }

  const activate = page.locator('button[data-activate-field="true"]');
  await assertVisible(activate, "field cockpit activation");
  if (await activate.isDisabled()) throw new Error("Valid field result unexpectedly blocked from P7 cockpit.");
  await activate.click();

  const cockpit = page.locator('[data-field-cockpit="true"][data-p7-cockpit="true"]');
  await assertVisible(cockpit, "P7 field cockpit");
  const intelligence = cockpit.locator('[data-field-asset-intelligence="true"]');
  await assertVisible(intelligence, "P7 asset intelligence panel");
  await assertVisible(intelligence.locator('[data-p7-priority-headline="true"]'), "P7 priority headline");

  const priorityRows = intelligence.locator('button[data-p7-priority-rank]');
  if ((await priorityRows.count()) !== 3) throw new Error(`P7 should expose compact Top-3 priority rows, found ${await priorityRows.count()}.`);

  const priorities = await priorityRows.evaluateAll((nodes) => nodes.map((node) => ({
    rank: Number(node.getAttribute("data-p7-priority-rank")),
    id: node.getAttribute("data-p7-priority-id"),
    status: node.getAttribute("data-p7-priority-status"),
    score: Number(node.getAttribute("data-p7-priority-score")),
  })));
  if (priorities.map((item) => item.rank).join(",") !== "1,2,3") throw new Error(`P7 rank order regression: ${JSON.stringify(priorities)}`);
  if (new Set(priorities.map((item) => item.id)).size !== 3) throw new Error(`P7 priorities must be unique assets: ${JSON.stringify(priorities)}`);
  if (!(priorities[0].score >= priorities[1].score && priorities[1].score >= priorities[2].score)) throw new Error(`P7 scores are not descending: ${JSON.stringify(priorities)}`);
  if (priorities.some((item) => !["CRITICAL", "ATTENTION", "WATCH", "NORMAL"].includes(item.status))) throw new Error(`P7 status contract regression: ${JSON.stringify(priorities)}`);

  const firstPriority = priorityRows.first();
  const firstId = await firstPriority.getAttribute("data-p7-priority-id");
  if (!firstId) throw new Error("P7 top priority has no element ID.");
  await firstPriority.click();

  const selectedPanel = cockpit.locator('[data-field-selected-panel="true"]');
  await page.waitForFunction((assetId) => document.querySelector('[data-field-selected-panel="true"]')?.getAttribute("data-field-selection-id") === assetId, firstId, { timeout: 5_000 });
  if ((await selectedPanel.getAttribute("data-field-selection-kind")) === "source" || (await selectedPanel.getAttribute("data-field-selection-kind")) === "bus") {
    throw new Error(`P7 priority click selected a non-element context: ${await selectedPanel.getAttribute("data-field-selection-kind")}`);
  }
  await page.waitForFunction(() => document.querySelector('[data-field-dynamic-sld="true"]')?.getAttribute("data-field-sld-view") === "focus", null, { timeout: 5_000 });
  const selectedElement = cockpit.locator(`[data-field-topology-element="${firstId}"]`);
  if ((await selectedElement.getAttribute("data-selected")) !== "true") throw new Error("P7 priority click did not select the corresponding topology element.");
  const selectedFlow = cockpit.locator(`[data-field-flow-path="${firstId}"]`);
  if ((await selectedFlow.getAttribute("data-flow-selected")) !== "true") throw new Error("P7 priority click did not illuminate the selected electrical route.");

  await page.setViewportSize({ width: 1366, height: 768 });
  await assertFitsViewport(cockpit, "P7 cockpit at 1366x768");
  await assertFitsViewport(intelligence, "P7 intelligence panel at 1366x768");
  await assertVisible(cockpit.locator('[data-field-loss-chart="true"]'), "P7 selected-asset chart at 1366x768");

  console.log("P7 gate PASS: deterministic Top-3 asset intelligence selects and focuses real field assets; supplied AC sine source symbol and continuous transformer MV/LV current-flow animation are preserved.");
} finally {
  await browser.close();
}

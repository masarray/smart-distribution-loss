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
  await page.locator('input[data-field-files="true"]').setInputFiles([
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
    throw new Error(`Field physics did not pass before P9 activation: ${resultText}`);
  }
  const activate = page.locator('button[data-activate-field="true"]');
  await assertVisible(activate, "field activation");
  if (await activate.isDisabled()) throw new Error("Valid field result unexpectedly blocked.");
  await activate.click();
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await activateFieldMode();

  const cockpit = page.locator('[data-field-cockpit="true"]');
  await assertVisible(cockpit, "field cockpit");
  const firstPriority = cockpit.locator('button[data-p7-priority-rank]').first();
  await assertVisible(firstPriority, "P7 priority for P9 selection");
  const firstId = await firstPriority.getAttribute("data-p7-priority-id");
  if (!firstId) throw new Error("P9 fixture did not expose a priority asset id.");
  await firstPriority.click();

  const p9 = cockpit.locator('[data-p9-reconciliation="true"]');
  await assertVisible(p9, "P9 reconciliation workspace");
  await page.waitForFunction((id) => document.querySelector('[data-p9-reconciliation="true"]')?.getAttribute("data-p9-element-id") === id, firstId, { timeout: 5_000 });
  if ((await p9.getAttribute("data-p9-ready")) !== "true") throw new Error("P9 did not become ready for the selected field asset.");
  if ((await p9.getAttribute("data-p9-status")) !== "INCOMPLETE") throw new Error("P9 must start incomplete before field measurements are entered.");

  const modelLoading = Number(await p9.getAttribute("data-p9-model-loading"));
  const modelVoltagePu = Number(await p9.getAttribute("data-p9-model-voltage-pu"));
  const ratedCurrentA = Number(await p9.getAttribute("data-p9-rated-current-a"));
  const nominalKv = Number(await p9.getAttribute("data-p9-nominal-kv"));
  if (![modelLoading, modelVoltagePu, ratedCurrentA, nominalKv].every(Number.isFinite)) {
    throw new Error(`P9 model context is incomplete: ${JSON.stringify({ modelLoading, modelVoltagePu, ratedCurrentA, nominalKv })}`);
  }

  const selectedPanel = cockpit.locator('[data-field-selected-panel="true"]');
  const physicsBefore = await selectedPanel.innerText();
  const currentInput = p9.locator('input[data-p9-input="current"]');
  const voltageInput = p9.locator('input[data-p9-input="voltage"]');
  const referenceInput = p9.locator('input[data-p9-reference="true"]');
  const matchedCurrentA = ratedCurrentA * modelLoading / 100;
  const matchedVoltageKv = nominalKv * modelVoltagePu;
  await currentInput.fill(matchedCurrentA.toFixed(6));
  await voltageInput.fill(matchedVoltageKv.toFixed(6));
  await referenceInput.fill("Clamp meter · titik ukur regression P9");
  await page.waitForFunction(() => document.querySelector('[data-p9-reconciliation="true"]')?.getAttribute("data-p9-status") === "MATCH", null, { timeout: 5_000 });
  if ((await p9.locator('[data-p9-signal="loading"]').getAttribute("data-p9-signal-status")) !== "MATCH") throw new Error("P9 loading reconciliation did not reach MATCH for model-equivalent field current.");
  if ((await p9.locator('[data-p9-signal="voltage"]').getAttribute("data-p9-signal-status")) !== "MATCH") throw new Error("P9 voltage reconciliation did not reach MATCH for model-equivalent field voltage.");

  const sideSelect = p9.locator('select[data-p9-side-select="true"]');
  await sideSelect.selectOption("FROM");
  await page.waitForFunction(() => document.querySelector('[data-p9-reconciliation="true"]')?.getAttribute("data-p9-side") === "FROM");
  if ((await p9.getAttribute("data-p9-status")) !== "INCOMPLETE") throw new Error("P9 evidence leaked across measurement sides.");
  await sideSelect.selectOption("TO");
  await page.waitForFunction(() => document.querySelector('[data-p9-reconciliation="true"]')?.getAttribute("data-p9-side") === "TO");
  if ((await p9.getAttribute("data-p9-status")) !== "MATCH") throw new Error("P9 per-side evidence was not retained when returning to the original side.");
  if ((await referenceInput.inputValue()) !== "Clamp meter · titik ukur regression P9") throw new Error("P9 field reference did not persist with the evidence record.");

  const discrepantCurrentA = ratedCurrentA * (modelLoading + 25) / 100;
  const discrepantVoltageKv = nominalKv * (modelVoltagePu + 0.05);
  await currentInput.fill(discrepantCurrentA.toFixed(6));
  await voltageInput.fill(discrepantVoltageKv.toFixed(6));
  await page.waitForFunction(() => document.querySelector('[data-p9-reconciliation="true"]')?.getAttribute("data-p9-status") === "DISCREPANCY", null, { timeout: 5_000 });
  await assertVisible(p9.locator('button[data-p9-open-dataset="true"]'), "P9 dataset review action");
  if ((await p9.locator('[data-p9-signal="loading"]').getAttribute("data-p9-signal-status")) !== "DISCREPANCY") throw new Error("P9 did not flag loading difference outside cockpit tolerance.");
  if ((await p9.locator('[data-p9-signal="voltage"]').getAttribute("data-p9-signal-status")) !== "DISCREPANCY") throw new Error("P9 did not flag voltage difference outside cockpit tolerance.");

  const physicsAfter = await selectedPanel.innerText();
  if (physicsAfter !== physicsBefore) throw new Error("Entering P9 measurements mutated the selected asset physics/KPI presentation.");
  if (Number(await p9.getAttribute("data-p9-model-loading")) !== modelLoading || Number(await p9.getAttribute("data-p9-model-voltage-pu")) !== modelVoltagePu) {
    throw new Error("P9 field evidence changed the model reference values in memory.");
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  const statusPanel = cockpit.locator('[data-field-status-panel="true"]');
  await assertVisible(statusPanel, "P9 scrollable investigation workspace at 1366x768");
  const box = await statusPanel.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    throw new Error(`P9 workspace escapes 1366x768 viewport: ${JSON.stringify(box)}.`);
  }
  const scrollMetrics = await statusPanel.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }));
  if (scrollMetrics.scrollHeight > scrollMetrics.clientHeight + 2 && !["auto", "scroll"].includes(scrollMetrics.overflowY)) {
    throw new Error(`P9 long reconciliation content must remain scroll-accessible: ${JSON.stringify(scrollMetrics)}.`);
  }

  console.log("P9 field measurement gate PASS: evidence is interval/side aligned, MATCH and DISCREPANCY states are deterministic, records remain isolated, and field measurements never mutate solver physics or KPI state.");
} finally {
  await browser.close();
}

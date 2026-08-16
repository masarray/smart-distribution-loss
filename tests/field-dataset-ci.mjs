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
].join("\n");

const customers = [
  "customer_id,bus_id,phase,meter_id,contract_kva,pf",
  "C-001,LVMAIN,A,M-001,23,0.95",
  "C-002,LVMAIN,B,M-002,23,0.95",
  "C-003,LVMAIN,C,M-003,23,0.95",
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

function numericAfter(text, label) {
  const normalized = text.replace(/\r/g, "");
  const match = normalized.match(new RegExp(`${label}\\s+([0-9]+(?:\\.[0-9]+)?)`, "i"));
  return match ? Number(match[1]) : null;
}

function lossFromSvgGroup(text) {
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*kWh/i);
  return match ? Number(match[1]) : null;
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // P5 progress motion: real percentage text is untouched, while the fill itself
  // gets a deliberately long linear transition plus a compositor-friendly traveler.
  const runStrip = page.locator('[data-analysis-run-state]').first();
  const mainProgress = runStrip.locator(':scope > div:last-child');
  await runStrip.evaluate((element) => element.setAttribute("data-analysis-run-state", "running"));
  const progressMotion = await mainProgress.evaluate((element) => {
    const style = getComputedStyle(element);
    const after = getComputedStyle(element, "::after");
    return { duration: style.transitionDuration, timing: style.transitionTimingFunction, animation: after.animationName };
  });
  if (!progressMotion.duration.includes("30s") || progressMotion.timing !== "linear" || progressMotion.animation !== "p5-progress-travel") {
    throw new Error(`P5 slow progress motion missing: ${JSON.stringify(progressMotion)}`);
  }
  await runStrip.evaluate((element) => element.setAttribute("data-analysis-run-state", "idle"));

  await page.getByRole("button", { name: "Kelola dataset", exact: true }).click();
  await assertVisible(page.getByText("Dataset Manager", { exact: true }), "Dataset Manager");

  const fieldProgress = page.locator('[data-drawer="dataset-manager"] .h-1.bg-primary.transition-all[style*="width"]');
  const fieldTraveler = await fieldProgress.evaluate((element) => getComputedStyle(element, "::after").animationName);
  if (fieldTraveler !== "p5-progress-travel") throw new Error("Dataset progress bar must retain continuous traveler motion.");

  const input = page.locator('input[data-field-files="true"]');
  await input.setInputFiles([
    { name: "network.csv", mimeType: "text/csv", buffer: Buffer.from(network) },
    { name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(customers) },
    { name: "measurements.csv", mimeType: "text/csv", buffer: Buffer.from(measurements) },
    { name: "ami.csv", mimeType: "text/csv", buffer: Buffer.from(ami) },
  ]);

  await assertVisible(page.getByText("SIAP DIHITUNG", { exact: true }), "field solver readiness");
  await assertVisible(page.getByText("100.0%", { exact: true }).first(), "AMI completeness");

  await page.locator('button[data-run-field="true"]').click();
  const resultPanel = page.locator('[data-field-result="true"]');
  await assertVisible(resultPanel, "field result panel", 600_000);
  const solved = await resultPanel.innerText();
  if (!solved.includes("PERHITUNGAN LULUS")) throw new Error("Field physics preview did not pass its engineering gate.");
  if (!solved.includes("96/96 interval selesai")) throw new Error("Field physics preview did not solve all 96 intervals.");
  await assertVisible(resultPanel.getByText("Susut teknis", { exact: true }), "field technical-loss KPI");

  const activate = page.locator('button[data-activate-field="true"]');
  await assertVisible(activate, "field cockpit activation");
  if (await activate.isDisabled()) throw new Error("A valid 96/96 passing field result should be activatable.");
  await activate.click();

  const fieldCockpit = page.locator('[data-field-cockpit="true"]');
  await assertVisible(fieldCockpit, "field operational cockpit");
  await assertVisible(fieldCockpit.locator('[data-p5-cockpit="true"]'), "P5 cockpit marker");
  await assertVisible(fieldCockpit.locator('[data-field-source-badge="true"]'), "field source badge");
  await assertVisible(fieldCockpit.getByText("Data lapangan aktif", { exact: true }), "field active state");
  await assertVisible(fieldCockpit.locator('[data-field-sld-suppressed="true"]'), "demo SLD suppression provenance");
  await assertVisible(fieldCockpit.locator('[data-field-dynamic-sld="true"]'), "dynamic field SLD");
  await assertVisible(fieldCockpit.locator('[data-field-loss-chart="true"]'), "field profile chart");
  await assertVisible(fieldCockpit.locator('[data-field-provenance="true"]'), "field provenance");
  await assertVisible(fieldCockpit.locator('[data-operator-decision="true"]'), "field operator decision");
  await assertVisible(fieldCockpit.getByText("Data lapangan siap digunakan", { exact: true }), "field source decision headline");

  const sourceNode = fieldCockpit.locator('[data-field-topology-source="GRID"]');
  const lineNode = fieldCockpit.locator('[data-field-topology-element="MV-L1"]');
  const trafoNode = fieldCockpit.locator('[data-field-topology-element="TR-01"]');
  const rootBus = fieldCockpit.locator('[data-field-topology-bus="GRID20"]');
  const hvBus = fieldCockpit.locator('[data-field-topology-bus="TRHV"]');
  const lvBus = fieldCockpit.locator('[data-field-topology-bus="LVMAIN"]');
  for (const [locator, label] of [[sourceNode, "GRID source"], [lineNode, "MV-L1"], [trafoNode, "TR-01"], [rootBus, "GRID20"], [hvBus, "TRHV"], [lvBus, "LVMAIN"]]) {
    await assertVisible(locator, label);
  }

  const sourcePanel = fieldCockpit.locator('[data-field-selected-panel="true"]');
  const sourceText = await sourcePanel.innerText();
  const totalLoss = numericAfter(sourceText, "SUSUT TEKNIS");
  if (totalLoss == null || totalLoss <= 0) throw new Error(`Source loss KPI missing: ${sourceText}`);

  const lineText = await lineNode.textContent();
  const trafoText = await trafoNode.textContent();
  const lineLoss = lossFromSvgGroup(lineText ?? "");
  const trafoLoss = lossFromSvgGroup(trafoText ?? "");
  if (lineLoss == null || trafoLoss == null || Math.abs(lineLoss + trafoLoss - totalLoss) > 0.04) {
    throw new Error(`Direct asset attribution does not reconcile: line=${lineLoss}, trafo=${trafoLoss}, total=${totalLoss}`);
  }

  await lineNode.click();
  await assertVisible(page.locator('[data-field-selected-panel="true"][data-field-selection-kind="line"]'), "line selection panel");
  let selectedText = (await sourcePanel.innerText()).toLocaleLowerCase("id-ID");
  if (!selectedText.includes("mv-l1") || !selectedText.includes("kontribusi") || !selectedText.includes("susut teknis")) {
    throw new Error(`Line selection did not expose field loss attribution: ${selectedText}`);
  }
  await assertVisible(fieldCockpit.locator('[data-field-asset-chart="element"]'), "line asset chart");

  await trafoNode.click();
  await assertVisible(page.locator('[data-field-selected-panel="true"][data-field-selection-kind="transformer"]'), "transformer selection panel");
  selectedText = (await sourcePanel.innerText()).toLocaleLowerCase("id-ID");
  if (!selectedText.includes("tr-01") || !selectedText.includes("kontribusi") || !selectedText.includes("loading maksimum")) {
    throw new Error(`Transformer selection did not expose field loading/loss: ${selectedText}`);
  }

  await lvBus.click();
  await assertVisible(page.locator('[data-field-selected-panel="true"][data-field-selection-kind="bus"]'), "bus selection panel");
  selectedText = (await sourcePanel.innerText()).toLocaleLowerCase("id-ID");
  for (const label of ["lvmain", "beban puncak", "energi beban", "pelanggan", "tegangan minimum"]) {
    if (!selectedText.includes(label)) throw new Error(`Bus selection missing ${label}: ${selectedText}`);
  }
  if (selectedText.includes("kontribusi")) throw new Error("Bus selection must not fabricate technical-loss attribution.");
  await assertVisible(fieldCockpit.locator('[data-field-asset-chart="bus"]'), "bus voltage/load chart");

  await sourceNode.click();
  await assertVisible(page.locator('[data-field-selected-panel="true"][data-field-selection-kind="source"]'), "source selection restored");
  await assertVisible(fieldCockpit.getByText("Data lapangan siap digunakan", { exact: true }), "source decision restored");

  const fieldText = (await fieldCockpit.innerText()).toLocaleLowerCase("id-ID");
  for (const label of ["susut teknis", "tegangan minimum", "loading maksimum", "topology live", "attribution"]) {
    if (!fieldText.includes(label)) throw new Error(`P5 field cockpit does not expose ${label}.`);
  }
  if (!fieldText.includes("sld demo tidak digunakan pada field mode")) {
    throw new Error("Field mode must explicitly distinguish the real imported SLD from the synthetic demo SLD.");
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  await assertFitsViewport(fieldCockpit, "field cockpit at 1366x768");
  await assertFitsViewport(fieldCockpit.locator('[data-field-selected-panel="true"]'), "field selected panel at 1366x768");
  await assertFitsViewport(fieldCockpit.locator('[data-field-status-panel="true"]'), "field status panel at 1366x768");

  await fieldCockpit.getByRole("button", { name: "Kelola data lapangan", exact: true }).click();
  const drawer = page.locator('[data-drawer="dataset-manager"]');
  await assertVisible(drawer, "Dataset Manager reopened from Field Mode");
  await assertVisible(drawer.locator('[data-field-active-indicator="true"]'), "Field Mode active indicator in manager");

  // Fail-safe inherited from P4: beginning a new invalid import revokes the active field source.
  const reopenedInput = drawer.locator('input[data-field-files="true"]');
  await reopenedInput.setInputFiles([
    { name: "network.csv", mimeType: "text/csv", buffer: Buffer.from(network) },
    { name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(customers) },
    { name: "measurements.csv", mimeType: "text/csv", buffer: Buffer.from(measurements) },
  ]);

  await fieldCockpit.waitFor({ state: "detached", timeout: 15_000 });
  if ((await page.locator('button[data-activate-field="true"]').count()) !== 0) {
    throw new Error("Invalid import must not expose a field-cockpit activation path.");
  }
  await drawer.getByRole("button", { name: "Close" }).click();
  await assertVisible(page.getByRole("button", { name: "Jalankan simulasi", exact: true }), "demo cockpit restored after invalid re-import");

  console.log("P5 field topology PASS: runpp_3ph exposes direct line/trafo attribution and bus voltage, imported topology renders as an interactive SLD, selection changes KPI/chart domain, bus loss is not fabricated, progress motion stays alive, and P4 fail-safe source switching remains intact.");
} finally {
  await browser.close();
}

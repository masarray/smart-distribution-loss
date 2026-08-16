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
const unsupportedNetwork = `${network}\nLV-X,line,LVB,LVA,0.4,0.4,0.02,0.20,0.08,12,0.80,0.30,8,0.25,,,,,,,,,,,,`;

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

function numericAfter(text, label) {
  const normalized = text.replace(/\r/g, "");
  const match = normalized.match(new RegExp(`${label}\\s+([0-9]+(?:\\.[0-9]+)?)`, "i"));
  return match ? Number(match[1]) : null;
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const runStrip = page.locator('[data-analysis-run-state]').first();
  const mainProgress = runStrip.locator(':scope > div:last-child');
  await runStrip.evaluate((element) => element.setAttribute("data-analysis-run-state", "running"));
  const progressMotion = await mainProgress.evaluate((element) => {
    const style = getComputedStyle(element);
    const after = getComputedStyle(element, "::after");
    return { duration: style.transitionDuration, timing: style.transitionTimingFunction, animation: after.animationName };
  });
  if (!progressMotion.duration.includes("30s") || progressMotion.timing !== "linear" || progressMotion.animation !== "p5-progress-travel") {
    throw new Error(`Slow progress motion regression: ${JSON.stringify(progressMotion)}`);
  }
  await runStrip.evaluate((element) => element.setAttribute("data-analysis-run-state", "idle"));

  // Demo SLD flow was deliberately strengthened in P6 without changing topology semantics.
  const demoFlow = page.locator('.flow-dash').first();
  await assertVisible(demoFlow, "demo SLD flow overlay");
  const demoFlowStyle = await demoFlow.evaluate((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationName, duration: style.animationDuration, opacity: style.opacity, width: style.strokeWidth };
  });
  if (demoFlowStyle.animation !== "sld-flow" || Number.parseFloat(demoFlowStyle.opacity) < 0.9 || Number.parseFloat(demoFlowStyle.width) < 1.8) {
    throw new Error(`Demo SLD electrical flow is not visibly strengthened: ${JSON.stringify(demoFlowStyle)}`);
  }

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
  const topologyGate = page.locator('[data-field-topology-gate="true"]');
  await assertVisible(topologyGate, "P6 topology activation gate");
  if ((await topologyGate.getAttribute("data-topology-supported")) !== "true") throw new Error(`Valid branched radial topology was blocked: ${await topologyGate.innerText()}`);
  const topologyGateText = (await topologyGate.innerText()).toLocaleLowerCase("id-ID");
  if (!topologyGateText.includes("radial") || !topologyGateText.includes("1 cabang")) throw new Error(`P6 topology summary missing: ${topologyGateText}`);

  await page.locator('button[data-run-field="true"]').click();
  const resultPanel = page.locator('[data-field-result="true"]');
  await assertVisible(resultPanel, "field result panel", 600_000);
  const solved = await resultPanel.innerText();
  if (!solved.includes("PERHITUNGAN LULUS")) throw new Error("Field physics preview did not pass its engineering gate.");
  if (!solved.includes("96/96 interval selesai")) throw new Error("Field physics preview did not solve all 96 intervals.");

  const activate = page.locator('button[data-activate-field="true"]');
  await assertVisible(activate, "field cockpit activation");
  if (await activate.isDisabled()) throw new Error("A valid radial 96/96 field result should be activatable.");
  await activate.click();

  const fieldCockpit = page.locator('[data-field-cockpit="true"]');
  await assertVisible(fieldCockpit, "field operational cockpit");
  await assertVisible(page.locator('[data-field-cockpit="true"][data-p6-cockpit="true"]'), "P6 cockpit marker");
  await assertVisible(fieldCockpit.locator('[data-field-dynamic-sld="true"]'), "dynamic field SLD");
  await assertVisible(fieldCockpit.locator('[data-p6-topology="true"]'), "P6 topology renderer");
  await assertVisible(fieldCockpit.locator('[data-field-topology-search="true"]'), "topology asset search");
  await assertVisible(fieldCockpit.locator('[data-field-focus-selected="true"]'), "focus control");
  await assertVisible(fieldCockpit.locator('[data-field-fit-topology="true"]'), "fit control");

  const sld = fieldCockpit.locator('[data-field-dynamic-sld="true"]');
  if ((await sld.getAttribute("data-field-layout-branches")) !== "1") throw new Error("Branched radial layout did not preserve branch count.");
  const svg = sld.locator('svg');
  const fitViewBox = await svg.getAttribute("viewBox");

  const flowPaths = fieldCockpit.locator('[data-field-flow-path]');
  if ((await flowPaths.count()) !== 4) throw new Error(`Expected four animated field flow paths, got ${await flowPaths.count()}.`);
  const flowStyle = await flowPaths.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationName, duration: style.animationDuration, opacity: style.opacity, width: style.strokeWidth };
  });
  if (flowStyle.animation !== "p6-field-flow" || Number.parseFloat(flowStyle.opacity) < 0.65 || Number.parseFloat(flowStyle.width) < 2) {
    throw new Error(`Field flow animation is not visible enough: ${JSON.stringify(flowStyle)}`);
  }

  const sourceNode = fieldCockpit.locator('[data-field-topology-source="GRID"]');
  const mvLine = fieldCockpit.locator('[data-field-topology-element="MV-L1"]');
  const trafoNode = fieldCockpit.locator('[data-field-topology-element="TR-01"]');
  const lvLine1 = fieldCockpit.locator('[data-field-topology-element="LV-L1"]');
  const lvLine2 = fieldCockpit.locator('[data-field-topology-element="LV-L2"]');
  const lvMainBus = fieldCockpit.locator('[data-field-topology-bus="LVMAIN"]');
  const lvBusB = fieldCockpit.locator('[data-field-topology-bus="LVB"]');
  for (const [locator, label] of [[sourceNode, "GRID source"], [mvLine, "MV-L1"], [trafoNode, "TR-01"], [lvLine1, "LV-L1"], [lvLine2, "LV-L2"], [lvMainBus, "LVMAIN"], [lvBusB, "LVB"]]) {
    await assertVisible(locator, label);
  }

  const sourcePanel = fieldCockpit.locator('[data-field-selected-panel="true"]');
  const sourceText = await sourcePanel.innerText();
  const totalLoss = numericAfter(sourceText, "SUSUT TEKNIS");
  if (totalLoss == null || totalLoss <= 0) throw new Error(`Source loss KPI missing: ${sourceText}`);
  const elementLosses = await fieldCockpit.locator('[data-field-topology-element]').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-field-element-loss-kwh"))));
  const attributedLoss = elementLosses.reduce((sum, value) => sum + value, 0);
  if (elementLosses.some((value) => !Number.isFinite(value)) || Math.abs(attributedLoss - totalLoss) > 0.03) {
    throw new Error(`Direct branched attribution does not reconcile: elements=${JSON.stringify(elementLosses)}, total=${totalLoss}`);
  }

  // Search must select and focus a deep asset instead of shrinking the entire graph.
  const search = fieldCockpit.locator('[data-field-topology-search="true"]');
  await search.fill("lv-l2");
  const searchResult = fieldCockpit.locator('[data-field-search-result="element:LV-L2"]');
  await assertVisible(searchResult, "LV-L2 search result");
  await searchResult.click();
  await assertVisible(page.locator('[data-field-selected-panel="true"][data-field-selection-id="LV-L2"]'), "searched line selection");
  if ((await sld.getAttribute("data-field-sld-view")) !== "focus") throw new Error("Search selection must switch SLD to focus mode.");
  const focusedViewBox = await svg.getAttribute("viewBox");
  if (!fitViewBox || !focusedViewBox || fitViewBox === focusedViewBox) throw new Error(`Focus viewBox did not change: fit=${fitViewBox}, focus=${focusedViewBox}`);

  // Immediate upstream navigation from LV-L2 leads to branch bus LVMAIN.
  const upstreamFromLine = fieldCockpit.locator('[data-field-nav-upstream="bus:LVMAIN"]');
  await assertVisible(upstreamFromLine, "LV-L2 upstream navigation");
  await upstreamFromLine.click();
  await assertVisible(page.locator('[data-field-selected-panel="true"][data-field-selection-kind="bus"][data-field-selection-id="LVMAIN"]'), "LVMAIN branch selection");
  await assertVisible(fieldCockpit.locator('[data-field-nav-downstream="element:LV-L1"]'), "LVMAIN downstream LV-L1");
  await assertVisible(fieldCockpit.locator('[data-field-nav-downstream="element:LV-L2"]'), "LVMAIN downstream LV-L2");

  // Selecting a branch must illuminate its complete route back to source.
  await fieldCockpit.locator('[data-field-nav-downstream="element:LV-L1"]').click();
  await assertVisible(page.locator('[data-field-selected-panel="true"][data-field-selection-id="LV-L1"]'), "LV-L1 branch selection");
  for (const id of ["LV-L1", "TR-01", "MV-L1"]) {
    const route = fieldCockpit.locator(`[data-field-flow-path="${id}"]`);
    if ((await route.getAttribute("data-flow-route")) !== "true") throw new Error(`${id} is not illuminated on the selected upstream route.`);
  }
  const selectedFlow = fieldCockpit.locator('[data-field-flow-path="LV-L1"]');
  if ((await selectedFlow.getAttribute("data-flow-selected")) !== "true") throw new Error("Selected branch flow is not visually distinguished.");

  // Fit returns the complete topology viewport.
  await fieldCockpit.locator('[data-field-fit-topology="true"]').click();
  if ((await sld.getAttribute("data-field-sld-view")) !== "fit") throw new Error("Fit control did not restore full topology view.");
  if ((await svg.getAttribute("viewBox")) !== fitViewBox) throw new Error("Fit control did not restore original topology viewBox.");

  await lvBusB.click();
  await assertVisible(page.locator('[data-field-selected-panel="true"][data-field-selection-kind="bus"][data-field-selection-id="LVB"]'), "bus selection panel");
  const busText = (await sourcePanel.innerText()).toLocaleLowerCase("id-ID");
  for (const label of ["lvb", "beban puncak", "energi beban", "pelanggan", "tegangan minimum"]) {
    if (!busText.includes(label)) throw new Error(`Bus selection missing ${label}: ${busText}`);
  }
  if (busText.includes("kontribusi")) throw new Error("Bus selection must not fabricate technical-loss attribution.");

  await sourceNode.click();
  await assertVisible(page.locator('[data-field-selected-panel="true"][data-field-selection-kind="source"]'), "source selection restored");

  await page.setViewportSize({ width: 1366, height: 768 });
  await assertFitsViewport(fieldCockpit, "field cockpit at 1366x768");
  await assertFitsViewport(fieldCockpit.locator('[data-field-selected-panel="true"]'), "field selected panel at 1366x768");
  await assertFitsViewport(fieldCockpit.locator('[data-field-status-panel="true"]'), "field status panel at 1366x768");
  await assertFitsViewport(fieldCockpit.locator('[data-field-topology-tools="true"]'), "P6 topology controls at 1366x768");

  await fieldCockpit.getByRole("button", { name: "Kelola data lapangan", exact: true }).click();
  const drawer = page.locator('[data-drawer="dataset-manager"]');
  await assertVisible(drawer, "Dataset Manager reopened from Field Mode");
  await assertVisible(drawer.locator('[data-field-active-indicator="true"]'), "Field Mode active indicator in manager");

  // P6 fail-safe: a complete dataset with a multi-parent topology immediately revokes Field Mode,
  // identifies exact assets/bus, and blocks operational activation even though CSV completeness is valid.
  const reopenedInput = drawer.locator('input[data-field-files="true"]');
  await reopenedInput.setInputFiles([
    { name: "network.csv", mimeType: "text/csv", buffer: Buffer.from(unsupportedNetwork) },
    { name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(customers) },
    { name: "measurements.csv", mimeType: "text/csv", buffer: Buffer.from(measurements) },
    { name: "ami.csv", mimeType: "text/csv", buffer: Buffer.from(ami) },
  ]);

  await fieldCockpit.waitFor({ state: "detached", timeout: 15_000 });
  const blockedGate = drawer.locator('[data-field-topology-gate="true"][data-topology-supported="false"]');
  await assertVisible(blockedGate, "blocked multi-parent topology gate");
  const multiParentIssue = blockedGate.locator('[data-field-topology-issue="MULTI_PARENT"]');
  await assertVisible(multiParentIssue, "multi-parent issue locator");
  const issueText = (await multiParentIssue.innerText()).toLocaleLowerCase("id-ID");
  if (!issueText.includes("lva") || !issueText.includes("lv-l1") || !issueText.includes("lv-x")) {
    throw new Error(`Topology issue locator is not specific enough: ${issueText}`);
  }
  if ((await multiParentIssue.getAttribute("data-topology-buses")) !== "LVA") throw new Error("Topology issue did not identify LVA bus exactly.");
  const issueElements = (await multiParentIssue.getAttribute("data-topology-elements"))?.split(",").sort().join(",");
  if (issueElements !== ["LV-L1", "LV-X"].sort().join(",")) throw new Error(`Topology issue element IDs are wrong: ${issueElements}`);
  if ((await page.locator('button[data-activate-field="true"]').count()) !== 0) throw new Error("A fresh blocked topology must not expose stale field activation.");

  await drawer.getByRole("button", { name: "Close" }).click();
  await assertVisible(page.getByRole("button", { name: "Jalankan simulasi", exact: true }), "demo cockpit restored after blocked topology import");

  console.log("P6 topology scale gate PASS: branched radial field topology activates safely, direct solver attribution reconciles, search/focus/fit and upstream/downstream navigation work, source-route flow is visibly animated, multi-parent topology is located and blocked, and prior progress + demo behavior remain intact.");
} finally {
  await browser.close();
}

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

  // Deliberately leave a persistent source-vs-metered gap. P13 must expose this
  // as unexplained energy; it must never absorb the gap into technical loss.
  measurementRows.push(`${time},GRID,P,ABC,${((p1 + p2 + p3) * 1.30).toFixed(4)},kW,GOOD`);
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
  if (!resultText.includes("PERHITUNGAN LULUS") || !resultText.includes("96/96 interval selesai")) throw new Error(`P13 baseline field physics failed: ${resultText}`);
  const activate = page.locator('button[data-activate-field="true"]');
  await assertVisible(activate, "field activation");
  await activate.click();
}

function numericAttr(locator, name) {
  return locator.getAttribute(name).then((value) => Number(value));
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await activateFieldMode();

  const cockpit = page.locator('[data-field-cockpit="true"]');
  await assertVisible(cockpit, "field cockpit");
  const selectedBefore = await cockpit.locator('[data-field-selected-panel="true"]').innerText();

  const p13 = cockpit.locator('[data-p13-unexplained="true"]');
  await assertVisible(p13, "P13 unexplained energy panel");

  const status = await p13.getAttribute("data-p13-status");
  if (status !== "FIELD_INVESTIGATION_PRIORITY") throw new Error(`P13 should prioritize the deliberately persistent residual, got ${status}: ${await p13.innerText()}`);
  if ((await p13.getAttribute("data-p13-measurement-intervals")) !== "96") throw new Error("P13 did not align all 96 source measurement intervals.");
  if ((await p13.getAttribute("data-p13-bad-measurement-intervals")) !== "0") throw new Error("P13 incorrectly marked GOOD source measurements as bad.");
  if ((await p13.getAttribute("data-p13-calibration-absorption")) !== "forbidden") throw new Error("P13 does not enforce the no-residual-absorption policy.");
  if ((await p13.getAttribute("data-p13-theft-proof")) !== "false") throw new Error("P13 incorrectly claims unexplained residual is proof of theft.");
  if ((await p13.getAttribute("data-p13-localization")) !== "feeder_level_only") throw new Error("P13 v1 must not fabricate downstream localization without boundary measurements.");

  const measured = await numericAttr(p13, "data-p13-measured-kwh");
  const metered = await numericAttr(p13, "data-p13-metered-kwh");
  const technical = await numericAttr(p13, "data-p13-technical-kwh");
  const fullDayTechnical = await numericAttr(p13, "data-p13-full-day-technical-kwh");
  const unexplained = await numericAttr(p13, "data-p13-unexplained-kwh");
  const positiveRate = await numericAttr(p13, "data-p13-positive-rate");
  const persistence = await numericAttr(p13, "data-p13-persistence");

  const reconciliationError = Math.abs((measured - metered - technical) - unexplained);
  if (reconciliationError > 1e-6) throw new Error(`P13 energy balance does not reconcile: error=${reconciliationError}`);
  if (Math.abs(fullDayTechnical - technical) > 1e-6) throw new Error("P13 changed or cropped technical loss despite complete 96-interval source coverage.");
  if (!(unexplained > 0)) throw new Error(`P13 should expose positive unexplained energy, got ${unexplained}`);
  if (!(positiveRate >= 5)) throw new Error(`P13 priority residual rate should exceed 5%, got ${positiveRate}`);
  if (!(persistence >= 50)) throw new Error(`P13 priority persistence should exceed 50%, got ${persistence}`);

  const safetyText = await p13.locator('[data-p13-safety="true"]').innerText();
  if (!safetyText.includes("bukan bukti pencurian")) throw new Error("P13 operator copy does not explicitly prevent theft overclaiming.");
  if (!safetyText.includes("feeder-level")) throw new Error("P13 operator copy does not expose feeder-only localization scope.");
  if ((await p13.locator('[data-p13-top-intervals="true"] [data-p13-top-time]').count()) < 1) throw new Error("P13 did not surface any evidence interval for a persistent positive residual.");

  const selectedAfter = await cockpit.locator('[data-field-selected-panel="true"]').innerText();
  if (selectedAfter !== selectedBefore) throw new Error("P13 derivation mutated the active selected-asset physics/KPI state.");

  for (const viewport of [{ width: 1366, height: 768 }, { width: 1093, height: 614 }]) {
    await page.setViewportSize(viewport);
    const statusPanel = cockpit.locator('[data-field-status-panel="true"]');
    await assertVisible(statusPanel, `P13 right workspace ${viewport.width}x${viewport.height}`);
    const box = await statusPanel.boundingBox();
    if (!box || box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
      throw new Error(`P13 workspace escapes ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`);
    }
    await p13.scrollIntoViewIfNeeded();
    await assertVisible(p13, `P13 panel scroll access ${viewport.width}x${viewport.height}`);
  }

  console.log("P13 unexplained-energy gate PASS: measured source - metered AMI - frozen physics loss reconciles exactly; persistent residual becomes field-investigation priority; technical loss is not mutated or inflated; theft is not inferred; feeder-only localization and 125% viewport safety are explicit.");
} finally {
  await browser.close();
}

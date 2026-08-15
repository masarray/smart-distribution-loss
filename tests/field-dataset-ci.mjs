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

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: "Kelola dataset", exact: true }).click();
  await assertVisible(page.getByText("Dataset Manager", { exact: true }), "Dataset Manager");

  const input = page.locator('input[data-field-files="true"]');
  await input.setInputFiles([
    { name: "network.csv", mimeType: "text/csv", buffer: Buffer.from(network) },
    { name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(customers) },
    { name: "measurements.csv", mimeType: "text/csv", buffer: Buffer.from(measurements) },
    { name: "ami.csv", mimeType: "text/csv", buffer: Buffer.from(ami) },
  ]);

  await assertVisible(page.getByText("SOLVER READY", { exact: true }), "field solver readiness");
  await assertVisible(page.getByText("100.0%", { exact: true }).first(), "AMI completeness");

  await page.locator('button[data-run-field="true"]').click();
  await assertVisible(page.getByText("FIELD PHYSICS PASS", { exact: true }), "field physics pass", 600_000);
  await assertVisible(page.getByText("Technical loss", { exact: true }), "field technical-loss KPI");

  const solved = await page.locator('[data-field-result="true"]').innerText();
  if (!solved.includes("96/96 solved")) throw new Error("Field physics preview did not solve all 96 intervals.");

  console.log("M5 field dataset gate PASS: four CSVs normalize, validate, and run 96 browser-local Pandapower 3φ intervals without hidden truth.");
} finally {
  await browser.close();
}

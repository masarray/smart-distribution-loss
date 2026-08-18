import fs from "node:fs/promises";
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
  if (!resultText.includes("PERHITUNGAN LULUS") || !resultText.includes("96/96 interval selesai")) throw new Error(`Baseline field physics failed: ${resultText}`);
  const activate = page.locator('button[data-activate-field="true"]');
  await assertVisible(activate, "field activation");
  await activate.click();
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const aboutTrigger = page.locator('[data-about-trigger="true"]');
  await assertVisible(aboutTrigger, "About launcher");
  await aboutTrigger.click();
  const aboutPanel = page.locator('[data-about-panel="true"]');
  await assertVisible(aboutPanel, "About panel");
  if (!(await aboutPanel.innerText()).includes("Ari Sulistiono")) throw new Error("About panel does not identify Ari Sulistiono.");
  const linkedin = aboutPanel.locator('a[data-about-linkedin="true"]');
  if ((await linkedin.getAttribute("href")) !== "https://id.linkedin.com/in/ari-sulistiono") throw new Error("About panel points to the wrong LinkedIn profile.");
  await aboutPanel.locator('[data-drawer-close="true"]').click();
  await aboutPanel.waitFor({ state: "hidden" });

  await activateFieldMode();
  const cockpit = page.locator('[data-field-cockpit="true"]');
  await assertVisible(cockpit, "field cockpit");
  await cockpit.locator('button[data-p7-priority-rank]').first().click();

  const p9 = cockpit.locator('[data-p9-reconciliation="true"]');
  const p10 = cockpit.locator('[data-p10-correction="true"]');
  await assertVisible(p9, "P9 reconciliation");
  await assertVisible(p10, "P10 correction");
  const modelLoading = Number(await p9.getAttribute("data-p9-model-loading"));
  const modelVoltagePu = Number(await p9.getAttribute("data-p9-model-voltage-pu"));
  const ratedCurrentA = Number(await p9.getAttribute("data-p9-rated-current-a"));
  const nominalKv = Number(await p9.getAttribute("data-p9-nominal-kv"));
  await p9.locator('input[data-p9-input="current"]').fill((ratedCurrentA * (modelLoading + 25) / 100).toFixed(6));
  await p9.locator('input[data-p9-input="voltage"]').fill((nominalKv * (modelVoltagePu + 0.05)).toFixed(6));
  await p9.locator('input[data-p9-reference="true"]').fill("Nameplate + clamp meter · regression P12");
  await page.waitForFunction(() => document.querySelector('[data-p9-reconciliation="true"]')?.getAttribute("data-p9-status") === "DISCREPANCY");

  const parameter = await p10.locator('select[data-p10-parameter="true"]').inputValue();
  const baselineParameter = p10.locator(`[data-p10-baseline-parameter="${parameter}"]`);
  const beforeValue = Number(await baselineParameter.getAttribute("data-p10-before-value"));
  const proposedValue = beforeValue * 1.5;
  await p10.locator('input[data-p10-proposed="true"]').fill(proposedValue.toFixed(8));
  const evidence = p10.locator('input[data-p10-evidence="true"]');
  if (!(await evidence.inputValue())) await evidence.fill("Verified as-built/nameplate regression P12");
  await p10.locator('input[data-p10-verified="true"]').check();
  await p10.locator('button[data-p10-save-revision="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-p10-correction="true"]')?.getAttribute("data-p10-draft-version") === "1");
  await p10.locator('button[data-p10-run-candidate="true"]').click();
  await page.waitForFunction(() => document.querySelector('[data-p10-correction="true"]')?.getAttribute("data-p10-run-state") === "done", null, { timeout: 600_000 });
  const adopt = p10.locator('button[data-p10-activate-candidate="true"]');
  await assertVisible(adopt, "explicit candidate adoption");
  await adopt.click();
  await page.waitForFunction(() => document.querySelector('[data-field-source-badge="true"]')?.textContent?.includes("P10 kandidat v1"));

  const p11 = cockpit.locator('[data-p11-audit="true"]');
  await assertVisible(p11, "P11 audit panel");
  if ((await p11.getAttribute("data-p11-event-count")) !== "1") throw new Error("P11 did not persist the accepted P10 correction as audit event #1.");
  const latest = p11.locator('[data-p11-latest-event="true"]');
  const elementId = await latest.getAttribute("data-p11-element-id");
  const correction = p11.locator(`[data-p11-correction="${parameter}"]`);
  if (Number(await correction.getAttribute("data-p11-before")) !== beforeValue) throw new Error("P11 lost the baseline correction value.");
  if (Math.abs(Number(await correction.getAttribute("data-p11-after")) - proposedValue) > 1e-8) throw new Error("P11 lost the accepted proposed value.");

  const activePhysicsBeforeAudit = await cockpit.locator('[data-field-selected-panel="true"]').innerText();
  const [auditDownload] = await Promise.all([
    page.waitForEvent("download"),
    p11.locator('button[data-p11-export-package="true"]').click(),
  ]);
  const auditPath = await auditDownload.path();
  if (!auditPath) throw new Error("P11 audit package download has no local path.");
  const auditText = await fs.readFile(auditPath, "utf8");
  const auditPackage = JSON.parse(auditText);
  if (auditPackage.schema !== "smart-distribution-loss-audit-package-v1" || auditPackage.packageVersion !== 1) throw new Error("P11 exported the wrong package schema.");
  if (auditPackage.policy.sourceMutation !== "never") throw new Error("P11 audit package does not preserve no-overwrite source policy.");
  if (auditPackage.corrections?.length !== 1 || auditPackage.corrections[0].elementId !== elementId) throw new Error("P11 correction manifest is incomplete.");
  if (auditPackage.corrections[0].measurement?.record?.reference !== "Nameplate + clamp meter · regression P12") throw new Error("P11 package lost P9 measurement provenance.");
  if (auditPackage.accepted?.result?.seriesCount !== 96 || auditPackage.accepted?.result?.gate?.pass !== true) throw new Error("P11 package lost accepted physics gate fingerprint.");
  for (const hash of Object.values(auditPackage.integrity ?? {})) if (!/^[a-f0-9]{64}$/.test(String(hash))) throw new Error(`P11 checksum is malformed: ${hash}`);

  const baselineElement = auditPackage.baseline.dataset.network.find((item) => item.element_id === elementId);
  if (!baselineElement || Number(baselineElement[parameter]) !== beforeValue) throw new Error("P11 baseline dataset was overwritten by the corrected value.");
  if (!auditPackage.artifacts?.correctedNetworkCsv?.includes(String(proposedValue))) throw new Error("P11 corrected network artifact does not contain the accepted value.");

  const [networkDownload] = await Promise.all([
    page.waitForEvent("download"),
    p11.locator('button[data-p11-download-network="true"]').click(),
  ]);
  if (!networkDownload.suggestedFilename().startsWith("network.corrected.v1")) throw new Error(`Unexpected corrected CSV filename: ${networkDownload.suggestedFilename()}`);
  const networkPath = await networkDownload.path();
  if (!networkPath) throw new Error("Corrected network CSV download has no local path.");
  const correctedCsv = await fs.readFile(networkPath, "utf8");
  if (correctedCsv !== auditPackage.artifacts.correctedNetworkCsv) throw new Error("Standalone corrected network CSV differs from the packaged artifact.");

  const importInput = p11.locator('input[data-p11-import-package="true"]');
  await importInput.setInputFiles({ name: "sdl-audit-valid.json", mimeType: "application/json", buffer: Buffer.from(auditText) });
  await page.waitForFunction(() => document.querySelector('[data-p11-verification-status]')?.getAttribute("data-p11-verification-status") === "VALID", null, { timeout: 15_000 });
  const verified = p11.locator('[data-p11-verification-status="VALID"]');
  await assertVisible(verified, "valid P11 re-import verification");
  if ((await verified.getAttribute("data-p11-verified-events")) !== "1") throw new Error("P11 valid package verification lost event count.");

  const p12 = p11.locator('[data-p12-replay="true"]');
  await assertVisible(p12, "P12 audit replay");
  if ((await p12.getAttribute("data-p12-accepted-integrity-hash")) !== auditPackage.integrity.acceptedResultSha256) throw new Error("P12 did not preserve the immutable P11 accepted-result integrity hash.");
  const activePhysicsBeforeReplay = await cockpit.locator('[data-field-selected-panel="true"]').innerText();
  console.log("P12 replay starting: reconstructed package is valid; running fresh 96-interval Pandapower replay.");
  await p12.locator('button[data-p12-run-replay="true"]').click();
  await page.waitForFunction(() => {
    const state = document.querySelector('[data-p12-replay="true"]')?.getAttribute("data-p12-replay-status");
    return state === "MATCH" || state === "NUMERICAL_DRIFT" || state === "ENGINE_DRIFT" || state === "ERROR";
  }, null, { timeout: 600_000 });
  const replayState = await p12.getAttribute("data-p12-replay-status");
  const expectedPhysicsHash = await p12.getAttribute("data-p12-expected-physics-hash");
  const actualPhysicsHash = await p12.getAttribute("data-p12-actual-physics-hash");
  const acceptedIntegrityHash = await p12.getAttribute("data-p12-accepted-integrity-hash");
  const replayRawHash = await p12.getAttribute("data-p12-replay-raw-hash");
  console.log(`P12 replay terminal state=${replayState} physics_expected=${expectedPhysicsHash} physics_actual=${actualPhysicsHash} p11_integrity=${acceptedIntegrityHash} replay_raw=${replayRawHash}`);
  if (replayState !== "MATCH") {
    throw new Error(`P12 replay did not reproduce accepted physics. state=${replayState}; expectedPhysics=${expectedPhysicsHash}; actualPhysics=${actualPhysicsHash}; panel=${await p12.innerText()}`);
  }
  const replayMatch = p11.locator('[data-p12-result="MATCH"]');
  await assertVisible(replayMatch, "P12 reproducible replay match");
  if (!expectedPhysicsHash || expectedPhysicsHash !== actualPhysicsHash) throw new Error(`P12 canonical physics fingerprint mismatch: ${expectedPhysicsHash} != ${actualPhysicsHash}`);
  if (acceptedIntegrityHash !== auditPackage.integrity.acceptedResultSha256) throw new Error("P12 changed the P11 accepted-result integrity hash while replaying physics.");
  if ((await p12.getAttribute("data-p12-series-count")) !== "96") throw new Error("P12 replay did not reproduce all 96 intervals.");
  const activePhysicsAfterReplay = await cockpit.locator('[data-field-selected-panel="true"]').innerText();
  if (activePhysicsAfterReplay !== activePhysicsBeforeReplay) throw new Error("P12 replay mutated active Field Mode physics or KPI state.");

  const tampered = structuredClone(auditPackage);
  tampered.corrections[0].corrections[0].proposedValue = proposedValue * 1.1;
  await importInput.setInputFiles({ name: "sdl-audit-tampered.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(tampered)) });
  await page.waitForFunction(() => document.querySelector('[data-p11-verification-status]')?.getAttribute("data-p11-verification-status") === "INVALID", null, { timeout: 15_000 });
  await assertVisible(p11.locator('[data-p11-verification-status="INVALID"]'), "tampered P11 package rejection");
  if (await p11.locator('[data-p12-replay="true"]').count()) throw new Error("P12 replay remained available for an invalid/tampered package.");

  const activePhysicsAfterAudit = await cockpit.locator('[data-field-selected-panel="true"]').innerText();
  if (activePhysicsAfterAudit !== activePhysicsBeforeAudit) throw new Error("P11/P12 export, verification, or replay mutated active Field Mode physics or KPI state.");

  const statusPanel = cockpit.locator('[data-field-status-panel="true"]');
  await page.setViewportSize({ width: 1366, height: 768 });
  await assertVisible(statusPanel, "P12 scrollable workspace at 1366x768");
  let box = await statusPanel.boundingBox();
  let viewport = page.viewportSize();
  if (!box || !viewport || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) throw new Error(`P12 workspace escapes 1366x768 viewport: ${JSON.stringify(box)}`);

  await page.setViewportSize({ width: 1093, height: 614 });
  await assertVisible(statusPanel, "P12 scrollable workspace at 125% equivalent viewport");
  box = await statusPanel.boundingBox();
  viewport = page.viewportSize();
  if (!box || !viewport || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) throw new Error(`P12 workspace escapes 1093x614 viewport: ${JSON.stringify(box)}`);
  const scrollMetrics = await statusPanel.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }));
  if (scrollMetrics.scrollHeight > scrollMetrics.clientHeight + 2 && !["auto", "scroll"].includes(scrollMetrics.overflowY)) throw new Error(`P12 long audit/replay content is not scroll-accessible at 125% equivalent: ${JSON.stringify(scrollMetrics)}`);

  console.log("P12 audit replay gate PASS: P11 integrity remains immutable; valid packages rerun 96 Pandapower intervals to the exact canonical physics fingerprint; drift states are explicit; tampering is blocked; replay never mutates active Field Mode; 1366x768 and 125% equivalent footprints remain safe.");
} finally {
  await browser.close();
}

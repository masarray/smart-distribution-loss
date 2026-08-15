import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await assertVisible(page.getByText("Referensi TM", { exact: true }).first(), "operational Referensi TM identity");
  await assertVisible(page.getByText("Pelanggan TM", { exact: true }).first(), "Pelanggan TM identity");
  await assertVisible(page.getByText("TR GD-01", { exact: true }), "GD-01 transformer identity");

  const closedStates = page.getByText("CLOSED", { exact: true });
  if ((await closedStates.count()) < 4) {
    throw new Error(`Expected multiple visible CLOSED breaker states, found ${await closedStates.count()}.`);
  }

  await assertVisible(page.getByText(/CLOSED = tersambung/), "breaker-state legend");
  await assertVisible(page.getByText(/arah aliran/), "power-flow direction legend");

  await page.getByRole("button", { name: "Jalankan simulasi" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("Analysis complete"), null, { timeout: 600_000 });

  const arrows = page.locator('svg [data-flow-arrow="true"]');
  if ((await arrows.count()) < 6) {
    throw new Error(`Expected directional flow arrows after simulation, found ${await arrows.count()}.`);
  }

  console.log("Operational SLD gate PASS: equipment states, operational identities, and explicit flow direction are visible.");
} finally {
  await browser.close();
}

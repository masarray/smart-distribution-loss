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

  await assertVisible(page.getByText("Data quality", { exact: true }), "operator data-quality heading");
  await assertVisible(page.getByText("LOW", { exact: true }).first(), "Poor-preset confidence");
  await assertVisible(page.getByText("Loss rate", { exact: true }), "operation loss-rate KPI");
  await assertVisible(page.getByText("Confidence", { exact: true }).last(), "operation confidence KPI");
  await assertVisible(page.getByRole("button", { name: "Lihat data & input", exact: true }), "data drawer action");

  if ((await page.getByText("Pipeline smart engine", { exact: true }).count()) !== 0) {
    throw new Error("Smart Engine pipeline leaked back into the main operation cockpit.");
  }
  if ((await page.getByText("Err. konvensional", { exact: true }).count()) !== 0) {
    throw new Error("Hidden-truth error KPI leaked back into the main operation cockpit.");
  }
  if ((await page.getByText("Err. smart", { exact: true }).count()) !== 0) {
    throw new Error("Hidden-truth smart error KPI leaked back into the main operation cockpit.");
  }
  if ((await page.getByText("Ground truth", { exact: true }).count()) !== 0) {
    throw new Error("Hidden Ground Truth leaked into the main operation chart.");
  }

  await page.getByRole("button", { name: "Detail engineering & gate", exact: true }).click();
  await assertVisible(page.getByText(/Synthetic validation only/), "engineering-only Ground Truth context");
  await assertVisible(page.getByText("Error konvensional", { exact: true }), "engineering conventional error");
  await assertVisible(page.getByText("Error smart engine", { exact: true }), "engineering smart error");

  await page.getByRole("tab", { name: "Proses", exact: true }).click();
  await assertVisible(page.getByText("Timestamp alignment", { exact: true }), "engineering Smart Engine process");
  await assertVisible(page.getByText("Smart model build", { exact: true }), "final Smart Engine process stage");

  console.log("Operation hierarchy gate PASS: operator cockpit is concise and validation mechanics remain available in Engineering View.");
} finally {
  await browser.close();
}

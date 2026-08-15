import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

async function openSelectedAssetData() {
  await page.getByRole("button", { name: "Data", exact: true }).click();
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await page.getByRole("button", { name: "Penyulang 20 kV", exact: true }).click();
  if ((await page.getByText("Data & Input · Penyulang 20 kV", { exact: true }).count()) !== 0) {
    throw new Error("Asset navigation must not auto-open the Data drawer.");
  }
  await assertVisible(page.getByText("Penyulang 20 kV — total", { exact: true }), "selected Penyulang 20 kV view");

  await openSelectedAssetData();
  await assertVisible(page.getByText("Data & Input · Penyulang 20 kV", { exact: true }), "Penyulang 20 kV data drawer title");
  await assertVisible(page.getByText("SYNTHETIC DEMO", { exact: true }).last(), "Synthetic Demo badge");

  for (const tab of ["Overview", "Measurements", "Network", "Processed", "Lineage"]) {
    await assertVisible(page.getByRole("tab", { name: tab, exact: true }), `${tab} tab`);
  }

  await page.getByRole("tab", { name: "Processed", exact: true }).click();
  await assertVisible(page.getByText(/Jalankan simulasi untuk melihat 96 interval data/), "pre-run processed-data guidance");

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Pelanggan TM", exact: true }).click();
  if ((await page.getByText("Data & Input · Pelanggan TM", { exact: true }).count()) !== 0) {
    throw new Error("Pelanggan TM selection auto-opened the Data drawer.");
  }
  await openSelectedAssetData();
  await assertVisible(page.getByText("Data & Input · Pelanggan TM", { exact: true }), "Pelanggan TM explicit drawer title");

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Gardu GD-01", exact: true }).first().click();
  if ((await page.getByText("Data & Input · Gardu GD-01", { exact: true }).count()) !== 0) {
    throw new Error("GD-01 selection auto-opened the Data drawer.");
  }
  await openSelectedAssetData();
  await assertVisible(page.getByText("Data & Input · Gardu GD-01", { exact: true }), "GD-01 explicit drawer title");
  await page.getByRole("tab", { name: "Measurements", exact: true }).click();
  await assertVisible(page.getByText("AMI tersedia", { exact: true }), "GD-01 AMI coverage");
  await assertVisible(page.getByText("54/90", { exact: false }), "Poor-preset AMI count");

  console.log("Data Drawer gate PASS: asset navigation stays unobstructed and data inspection remains explicit per selected asset.");
} finally {
  await browser.close();
}

import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label, timeout = 15_000) {
  await locator.waitFor({ state: "visible", timeout });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

try {
  await page.addInitScript(() => {
    window.__sdlGeoCalled = false;
    const geolocation = navigator.geolocation;
    if (!geolocation) return;
    try {
      Object.defineProperty(geolocation, "getCurrentPosition", {
        configurable: true,
        value: () => { window.__sdlGeoCalled = true; },
      });
      Object.defineProperty(geolocation, "watchPosition", {
        configurable: true,
        value: () => {
          window.__sdlGeoCalled = true;
          return 0;
        },
      });
    } catch {
      // Browser may expose a non-configurable geolocation object; the app must still not invoke it.
    }
  });

  await page.goto(`${baseUrl}?lang=en`, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const control = page.locator('[data-language-control="true"]');
  await assertVisible(control, "language control");
  if ((await control.getAttribute("data-language")) !== "en") throw new Error("?lang=en did not select English.");
  if ((await page.locator("html").getAttribute("lang")) !== "en") throw new Error("html lang was not updated to en.");

  await assertVisible(page.getByText("Distribution loss monitoring", { exact: true }), "English product subtitle");
  await assertVisible(page.getByRole("button", { name: "Run simulation", exact: true }), "English run action");
  await assertVisible(page.getByText("Asset data quality", { exact: true }), "English asset quality heading");

  await page.getByRole("button", { name: "Manage dataset", exact: true }).click();
  await assertVisible(page.getByText("Import field dataset", { exact: true }), "English field import heading");
  await assertVisible(page.getByRole("button", { name: "Load PLN sample", exact: true }), "English sample load action");
  await assertVisible(page.getByRole("button", { name: "Download 4 CSV", exact: true }), "English sample download action");
  await assertVisible(page.getByText("20 kV Urban Feeder Sample", { exact: true }), "English PLN-like sample title");
  await page.getByRole("button", { name: "Close" }).click();

  await control.getByRole("button").click();
  await assertVisible(page.getByText("Monitoring susut distribusi", { exact: true }), "Indonesian product subtitle after toggle");
  if ((await control.getAttribute("data-language")) !== "id") throw new Error("Language toggle did not switch to Indonesian.");
  if ((await page.evaluate(() => localStorage.getItem("sdl-language"))) !== "id") throw new Error("Indonesian preference was not persisted.");

  // Drop the explicit query override before testing stored preference precedence.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await assertVisible(page.getByText("Monitoring susut distribusi", { exact: true }), "persisted Indonesian UI");

  const reloadedControl = page.locator('[data-language-control="true"]');
  await reloadedControl.getByRole("button").click();
  await assertVisible(page.getByText("Distribution loss monitoring", { exact: true }), "English UI after second toggle");
  if ((await page.evaluate(() => localStorage.getItem("sdl-language"))) !== "en") throw new Error("English preference was not persisted.");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await assertVisible(page.getByText("Distribution loss monitoring", { exact: true }), "persisted English UI");
  if ((await page.locator("html").getAttribute("lang")) !== "en") throw new Error("Persisted English did not restore html lang.");

  const geoCalled = await page.evaluate(() => Boolean(window.__sdlGeoCalled));
  if (geoCalled) throw new Error("Language detection requested browser geolocation; it must remain permissionless and lightweight.");

  console.log("P15 i18n PASS: EN/ID flag control, explicit English entry, Indonesian toggle, persisted preference, translated Dataset Manager, html lang metadata, and permissionless locale detection all work.");
} finally {
  await browser.close();
}

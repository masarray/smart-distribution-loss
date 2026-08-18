import process from "node:process";
import { chromium } from "playwright";

const baseUrl = process.env.SDL_BASE_URL || "http://127.0.0.1:8000/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function assertVisible(locator, label, timeout = 15_000) {
  await locator.waitFor({ state: "visible", timeout });
  if (!(await locator.isVisible())) throw new Error(`${label} is not visible.`);
}

async function assertNoIndonesianResidue(scopeText, label) {
  const forbidden = [
    /\bpenyulang\b/i,
    /\bgardu\b/i,
    /\bsusut\b/i,
    /\bpelanggan\b/i,
    /\bfaktor daya\b/i,
    /\bpemetaan\b/i,
    /\bperhatian\b/i,
    /\btindakan\b/i,
    /\blegenda\b/i,
    /\baliran daya\b/i,
    /\b24 jam\b/i,
    /\bdata terbatas\b/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(scopeText)) throw new Error(`${label} still contains Indonesian residue matching ${pattern}.`);
  }
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
  await assertVisible(control.locator('svg[data-flag-code="GB"]'), "cross-platform English flag SVG");

  await assertVisible(page.getByText("Distribution loss monitoring", { exact: true }), "English product subtitle");
  await assertVisible(page.getByRole("button", { name: "Run simulation", exact: true }), "English run action");
  await assertVisible(page.getByText("Asset data quality", { exact: true }), "English asset quality heading");
  await assertVisible(page.getByText("Limited data", { exact: true }), "English limited-data headline");
  await assertVisible(page.getByText("Power factor", { exact: true }), "English power-factor label");
  await assertVisible(page.getByText("Customer mapping", { exact: true }), "English customer-mapping label");
  await assertVisible(page.getByText("Legend", { exact: true }), "English SLD legend");
  await assertVisible(page.getByText("power flow", { exact: true }), "English SLD power-flow label");
  await assertVisible(page.getByText("Technical details", { exact: true }), "English technical-details action");
  await assertVisible(page.getByText("Asset status", { exact: true }), "English asset-status heading");

  const mainEnglishText = await page.locator("body").innerText();
  await assertNoIndonesianResidue(mainEnglishText, "English cockpit");

  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.setAttribute("data-i18n-probe", "true");
    probe.style.position = "fixed";
    probe.style.left = "8px";
    probe.style.bottom = "8px";
    probe.style.zIndex = "9999";
    probe.style.background = "black";
    probe.style.color = "white";
    probe.textContent = [
      "Gardu distribusi GD-01",
      "Kualitas input membatasi keyakinan hasil",
      "Faktor daya 20,0%; Data fasa 40,0% menjadi batas utama kualitas data aset ini.",
      "Lengkapi atau verifikasi faktor daya pelanggan yang belum diketahui, lalu jalankan kembali simulasi.",
      "Rasio susut · energi tersalurkan · poin akurasi · Detail teknis · Status aset",
      "Legenda · jaringan · aliran daya · 24 jam",
      "PENYULANG 20 kV · GD-01",
      "Susut 33.37 kWh/hari",
    ].join("\n");
    document.body.appendChild(probe);
  });

  const probe = page.locator('[data-i18n-probe="true"]');
  await assertVisible(probe.getByText("Distribution substation GD-01", { exact: true }), "dynamic substation translation");
  await assertVisible(probe.getByText("Input quality limits result confidence", { exact: true }), "dynamic warning translation");
  await assertVisible(
    probe.getByText("Power factor 20,0%; Phase data 40,0% are the main constraints on this asset's data quality.", { exact: true }),
    "dynamic quality-reason translation",
  );
  await assertVisible(
    probe.getByText("Complete or verify unknown customer power factor values, then rerun the simulation.", { exact: true }),
    "dynamic action translation",
  );
  await assertVisible(
    probe.getByText("Loss ratio · supplied energy · accuracy points · Technical details · Asset status", { exact: true }),
    "KPI and action translation",
  );
  await assertVisible(probe.getByText("Legend · network · power flow · 24 hours", { exact: true }), "SLD vocabulary translation");
  await assertVisible(probe.getByText("20 kV feeder · GD-01", { exact: true }), "uppercase feeder translation");
  await assertVisible(probe.getByText("Loss 33.37 kWh/day", { exact: true }), "loss unit translation");
  await assertNoIndonesianResidue(await probe.innerText(), "dynamic English translation probe");
  await probe.evaluate((node) => node.remove());

  await page.getByRole("button", { name: "Manage dataset", exact: true }).click();
  await assertVisible(page.getByText("Import field dataset", { exact: true }), "English field import heading");
  await assertVisible(page.getByRole("button", { name: "Load PLN sample", exact: true }), "English sample load action");
  await assertVisible(page.getByRole("button", { name: "Download 4 CSV", exact: true }), "English sample download action");
  await assertVisible(page.getByText("20 kV Urban Feeder Sample", { exact: true }), "English PLN-like sample title");
  await page.getByRole("button", { name: "Close" }).click();

  await control.getByRole("button").click();
  await assertVisible(page.getByText("Monitoring susut distribusi", { exact: true }), "Indonesian product subtitle after toggle");
  await assertVisible(control.locator('svg[data-flag-code="ID"]'), "cross-platform Indonesian flag SVG");
  if ((await control.getAttribute("data-language")) !== "id") throw new Error("Language toggle did not switch to Indonesian.");
  if ((await page.evaluate(() => localStorage.getItem("sdl-language"))) !== "id") throw new Error("Indonesian preference was not persisted.");

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

  console.log("P16 i18n PASS: SVG flags render cross-platform, EN/ID switching persists, English cockpit vocabulary is clean, dynamic warning/KPI/SLD copy translates, Dataset Manager remains bilingual, and locale detection stays permissionless.");
} finally {
  await browser.close();
}

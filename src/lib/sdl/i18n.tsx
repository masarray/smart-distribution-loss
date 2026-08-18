import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppLanguage = "id" | "en";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  tr: (idText: string, enText: string) => string;
};

const STORAGE_KEY = "sdl-language";
const INDONESIA_TIMEZONES = new Set(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]);
const LanguageContext = createContext<LanguageContextValue | null>(null);

const TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Monitoring susut distribusi", "Distribution loss monitoring"],
  ["Pilih aset", "Select asset"],
  ["Kelola dataset", "Manage dataset"],
  ["Skenario data", "Data scenario"],
  ["Jalankan simulasi", "Run simulation"],
  ["Menghitung…", "Calculating…"],
  ["Analisis berjalan", "Analysis running"],
  ["Analisis selesai", "Analysis complete"],
  ["Analisis gagal", "Analysis failed"],
  ["Siap menjalankan simulasi", "Ready to run simulation"],
  ["hasil siap", "results ready"],
  ["Kualitas data aset", "Asset data quality"],
  ["Lihat data", "View data"],
  ["Jaringan distribusi", "Distribution network"],
  ["Profil susut", "Loss profile"],
  ["Puncak susut", "Peak loss"],
  ["Selisih terbesar", "Largest deviation"],
  ["Model dasar", "Baseline model"],
  ["Aset terpilih", "Selected asset"],
  ["Total Penyulang 20 kV", "20 kV feeder total"],
  ["Total penyulang", "Feeder total"],
  ["Total harian", "Daily total"],
  ["Susut teknis", "Technical loss"],
  ["Susut Smart", "Smart loss"],
  ["Susut dasar", "Baseline loss"],
  ["susut teknis", "technical loss"],
  ["kWh/hari", "kWh/day"],
  ["Dataset lapangan v1", "Field Dataset v1"],
  ["Cockpit sedang memakai hasil lapangan yang sudah lulus.", "Cockpit is using a validated field result."],
  ["Cockpit tetap memakai demo sampai hasil lapangan diaktifkan.", "Cockpit keeps using the demo until a field result is activated."],
  ["FIELD MODE AKTIF", "FIELD MODE ACTIVE"],
  ["Impor dataset lapangan", "Import field dataset"],
  ["4 CSV · satu rentang 24 jam", "4 CSV · one 24-hour window"],
  ["File dibaca lokal di browser.", "Files are read locally in the browser."],
  ["Memilih import baru akan menonaktifkan Field Mode lama agar cockpit tidak pernah menampilkan hasil yang sudah tidak sesuai dengan dataset yang sedang diperiksa.", "Selecting a new import disables the previous Field Mode so the cockpit never shows results from a dataset that is no longer under review."],
  ["Muat contoh PLN", "Load PLN sample"],
  ["Unduh 4 CSV", "Download 4 CSV"],
  ["Pilih 4 CSV", "Choose 4 CSV"],
  ["Membaca…", "Reading…"],
  ["Contoh Penyulang Perkotaan 20 kV", "20 kV Urban Feeder Sample"],
  ["Dataset sintetis/anonymized untuk contoh alur PLN; bukan data operasional atau format ekspor resmi PLN.", "Synthetic/anonymized dataset illustrating a PLN-style workflow; not operational PLN data or an official PLN export format."],
  ["Kesiapan data", "Data readiness"],
  ["SIAP DIHITUNG", "READY TO CALCULATE"],
  ["VALID · DATA BELUM LENGKAP", "VALID · DATA INCOMPLETE"],
  ["PERIKSA STRUKTUR DATA", "CHECK DATA STRUCTURE"],
  ["Elemen jaringan", "Network elements"],
  ["Cakupan AMI", "AMI coverage"],
  ["Data sumber", "Source data"],
  ["Topology operasional", "Operational topology"],
  ["RADIAL · SIAP DIAKTIFKAN", "RADIAL · READY TO ACTIVATE"],
  ["BLOKIR AKTIVASI", "ACTIVATION BLOCKED"],
  ["ujung jaringan", "network endpoints"],
  ["Kesalahan", "Errors"],
  ["Peringatan", "Warnings"],
  ["Perhitungan data lapangan", "Field data calculation"],
  ["Menjalankan topologi dan AMI yang diimpor dengan aliran daya 3 fasa Pandapower.", "Runs the imported topology and AMI with Pandapower three-phase power flow."],
  ["Hasil hanya dapat diaktifkan jika physics lulus, 96 interval selesai, dan topology radial lolos gate operasional.", "Results can only be activated after physics passes, all 96 intervals finish, and the radial topology passes the operational gate."],
  ["Jalankan uji", "Run test"],
  ["Menyiapkan perhitungan", "Preparing calculation"],
  ["Diproses lokal di browser", "Processed locally in the browser"],
  ["Menyiapkan mesin perhitungan", "Preparing calculation engine"],
  ["Menyiapkan jaringan", "Preparing network"],
  ["Menghitung interval", "Calculating intervals"],
  ["Menyiapkan hasil", "Preparing results"],
  ["Belum dijalankan", "Not run yet"],
  ["PERHITUNGAN LULUS", "CALCULATION PASSED"],
  ["PERLU TINJAU", "REVIEW REQUIRED"],
  ["interval selesai", "intervals complete"],
  ["Tegangan minimum", "Minimum voltage"],
  ["Beban maksimum", "Maximum loading"],
  ["Energi tersalurkan", "Supplied energy"],
  ["Energi beban pelanggan", "Customer load energy"],
  ["Error relatif sumber", "Source relative error"],
  ["Siap menjadi sumber cockpit", "Ready as cockpit source"],
  ["Aktivasi cockpit diblokir", "Cockpit activation blocked"],
  ["Gunakan di cockpit", "Use in cockpit"],
  ["Field Mode sedang aktif", "Field Mode is active"],
  ["Kembali ke demo tidak menghapus file dari sesi Dataset Manager.", "Returning to the demo does not remove files from the Dataset Manager session."],
  ["Kembali demo", "Return to demo"],
  ["Batas topology saat ini", "Current topology limits"],
  ["cockpit operasional mengaktifkan jaringan radial yang tervalidasi.", "the operational cockpit activates validated radial networks."],
  ["Mesh/loop, multi-parent, elemen terputus, atau pelanggan di luar jaringan tetap diblokir dan ditunjukkan lokasinya sebelum aktivasi.", "Mesh/loop, multi-parent, disconnected elements, or customers outside the network remain blocked and are located before activation."],
  ["Demo sintetis · 24 jam · interval 15 menit.", "Synthetic demo · 24 hours · 15-minute intervals."],
  ["Ringkasan", "Summary"],
  ["Pengukuran", "Measurements"],
  ["Jaringan", "Network"],
  ["Jejak data", "Data lineage"],
  ["Demo sintetis", "Synthetic demo"],
  ["Meter tersedia", "Available meters"],
  ["Fasa diketahui", "Known phase"],
  ["Faktor daya diketahui", "Known power factor"],
  ["Pemetaan pelanggan benar", "Correct customer mapping"],
  ["Pengukuran jaringan", "Network measurements"],
  ["Daya P/Q penyulang + tegangan LV A/B/C", "Feeder P/Q + LV A/B/C voltage"],
  ["Daya aktif & reaktif", "Active & reactive power"],
  ["Data fasa", "Phase data"],
  ["Topologi jaringan", "Network topology"],
  ["Waktu pencatatan", "Timestamp alignment"],
  ["Data terukur", "Measured data"],
  ["Dihitung sendiri", "Calculated independently"],
  ["Panjang saluran model", "Model line length"],
  ["Panjang saluran", "Line length"],
  ["Faktor daya model", "Model power factor"],
  ["Mesin perhitungan", "Calculation engine"],
  ["aliran daya 3 fasa", "three-phase power flow"],
  ["Jalankan simulasi untuk melihat hasil per interval.", "Run the simulation to view interval results."],
  ["Beban (kW)", "Load (kW)"],
  ["Acuan validasi", "Validation reference"],
  ["Tidak digunakan untuk kalibrasi", "Not used for calibration"],
  ["Profil beban", "Load profile"],
  ["Profil pelanggan", "Customer profile"],
  ["Koreksi Smart", "Smart correction"],
  ["Rekonstruksi Smart", "Smart reconstruction"],
  ["Perhitungan 3 fasa", "Three-phase calculation"],
  ["Kondisi data", "Data condition"],
  ["Model jaringan", "Network model"],
  ["Penyelarasan waktu", "Time alignment"],
  ["Penjumlahan", "Aggregation"],
  ["Hasil per aset", "Per-asset results"],
  ["Pelanggan TM", "MV customer"],
  ["Referensi TM", "MV reference"],
  ["Prioritas investigasi", "Investigation priority"],
  ["Bukti lapangan", "Field evidence"],
  ["Kontribusi susut", "Loss contribution"],
  ["Tegangan terendah", "Lowest voltage"],
  ["Loading maksimum", "Maximum loading"],
  ["interval terburuk", "worst intervals"],
  ["Rute upstream", "Upstream route"],
  ["Rute downstream", "Downstream route"],
  ["Perlu perhatian", "Attention required"],
  ["Perlu tinjau", "Review required"],
  ["Belum diverifikasi", "Not verified"],
  ["Terverifikasi", "Verified"],
  ["Investigasi", "Investigation"],
  ["Rekonsiliasi", "Reconciliation"],
  ["Verifikasi", "Verification"],
  ["Koreksi", "Correction"],
  ["Batalkan", "Cancel"],
  ["Terapkan", "Apply"],
  ["Diterima", "Accepted"],
  ["Ditolak", "Rejected"],
  ["Tidak aktif", "Inactive"],
  ["Aktif", "Active"],
  ["Pemetaan", "Mapping"],
  ["Penyulang", "Feeder"],
  ["Pelanggan", "Customers"],
  ["pelanggan", "customers"],
  ["Gardu", "Distribution substation"],
  ["Trafo", "Transformer"],
  ["Tegangan", "Voltage"],
  ["tegangan", "voltage"],
  ["Beban", "Load"],
  ["beban", "load"],
  ["Fasa", "Phase"],
  ["fasa", "phase"],
  ["saluran", "line"],
  ["Daya", "Power"],
  ["Sumber", "Source"],
  ["Waktu", "Time"],
  ["Hasil", "Results"],
  ["hasil", "results"],
  ["Puncak", "Peak"],
  ["Baik", "Good"],
  ["Cukup", "Typical"],
  ["Terbatas", "Limited"],
  ["Selesai", "Complete"],
  ["selesai", "complete"],
  ["Catatan", "Notes"],
  ["Periksa", "Check"],
  ["Lokasi", "Location"],
  ["Unduh", "Download"],
  ["Ekspor", "Export"],
  ["Impor", "Import"],
  ["Pilih", "Select"],
  ["Dipilih", "Selected"],
  ["Detail", "Details"],
  ["menit", "minutes"],
] as const;

const SORTED_TEXT_PAIRS = [...TEXT_PAIRS].sort((a, b) => b[0].length - a[0].length);
const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const TRANSLATED_ATTRIBUTES = ["aria-label", "title", "placeholder"] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phrasePattern(source: string) {
  const first = source[0] ?? "";
  const last = source[source.length - 1] ?? "";
  const startsWord = /[A-Za-z0-9]/.test(first);
  const endsWord = /[A-Za-z0-9]/.test(last);
  return new RegExp(`${startsWord ? "\\b" : ""}${escapeRegExp(source)}${endsWord ? "\\b" : ""}`, "g");
}

export function translateUiText(value: string, language: AppLanguage) {
  if (language === "id" || !value.trim()) return value;
  let translated = value;
  for (const [idText, enText] of SORTED_TEXT_PAIRS) {
    if (!translated.includes(idText)) continue;
    translated = translated.replace(phrasePattern(idText), enText);
  }
  return translated;
}

function shouldSkip(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(element?.closest('[data-i18n-skip="true"]'));
}

function translateTextNode(node: Text, language: AppLanguage) {
  if (shouldSkip(node)) return;
  const current = node.data;
  const remembered = originalText.get(node);

  if (language === "id") {
    if (remembered != null && current !== remembered) node.data = remembered;
    if (remembered == null) originalText.set(node, current);
    return;
  }

  if (remembered == null) originalText.set(node, current);
  else {
    const expectedEnglish = translateUiText(remembered, "en");
    if (current !== expectedEnglish && current !== remembered) originalText.set(node, current);
  }

  const source = originalText.get(node) ?? current;
  const translated = translateUiText(source, "en");
  if (translated !== current) node.data = translated;
}

function translateElementAttributes(element: Element, language: AppLanguage) {
  if (shouldSkip(element)) return;
  let remembered = originalAttributes.get(element);
  if (!remembered) {
    remembered = new Map<string, string>();
    originalAttributes.set(element, remembered);
  }

  for (const attribute of TRANSLATED_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (current == null) continue;
    const source = remembered.get(attribute);

    if (language === "id") {
      if (source != null && current !== source) element.setAttribute(attribute, source);
      if (source == null) remembered.set(attribute, current);
      continue;
    }

    if (source == null) remembered.set(attribute, current);
    else {
      const expectedEnglish = translateUiText(source, "en");
      if (current !== expectedEnglish && current !== source) remembered.set(attribute, current);
    }

    const original = remembered.get(attribute) ?? current;
    const translated = translateUiText(original, "en");
    if (translated !== current) element.setAttribute(attribute, translated);
  }
}

function translateSubtree(root: Node, language: AppLanguage) {
  if (shouldSkip(root)) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, language);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

  if (root.nodeType === Node.ELEMENT_NODE) translateElementAttributes(root as Element, language);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) translateTextNode(current as Text, language);
    else translateElementAttributes(current as Element, language);
    current = walker.nextNode();
  }
}

function installDomTranslation(language: AppLanguage) {
  translateSubtree(document.body, language);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        translateTextNode(mutation.target as Text, language);
        continue;
      }
      if (mutation.type === "attributes") {
        translateElementAttributes(mutation.target as Element, language);
        continue;
      }
      mutation.addedNodes.forEach((node) => translateSubtree(node, language));
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATED_ATTRIBUTES],
  });
  return () => observer.disconnect();
}

export function detectInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "en";

  const queryLanguage = new URLSearchParams(window.location.search).get("lang");
  if (queryLanguage === "id" || queryLanguage === "en") return queryLanguage;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "id" || stored === "en") return stored;

  // Existing browser-regression suites intentionally use the established Indonesian copy.
  // Real visitors still receive locale/timezone detection without geolocation or IP lookup.
  if (navigator.webdriver) return "id";

  const browserLanguages = [...navigator.languages, navigator.language]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  const indonesiaLocale = browserLanguages.some(
    (value) => value === "id" || value.startsWith("id-") || value.endsWith("-id"),
  );
  if (indonesiaLocale) return "id";

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (INDONESIA_TIMEZONES.has(timezone)) return "id";

  return "en";
}

function updateDocumentMetadata(language: AppLanguage) {
  document.documentElement.lang = language;
  document.body.setAttribute("data-language", language);

  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  document.title = "Smart Distribution Loss — Public Engineering Beta";
  description?.setAttribute(
    "content",
    language === "id"
      ? "Public Engineering Beta untuk analisis susut distribusi tiga fasa di browser, rekonsiliasi data lapangan, audit yang dapat direproduksi, serta pemisahan susut teknis dan energi tak terjelaskan."
      : "Public Engineering Beta for browser-based three-phase distribution-loss analysis, field-data reconciliation, reproducible audit replay, and technical-loss / unexplained-energy separation.",
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(detectInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    updateDocumentMetadata(language);
    return installDomTranslation(language);
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: setLanguageState,
    toggleLanguage: () => setLanguageState((current) => current === "id" ? "en" : "id"),
    tr: (idText, enText) => language === "id" ? idText : enText,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

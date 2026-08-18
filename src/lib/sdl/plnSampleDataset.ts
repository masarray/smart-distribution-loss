const SAMPLE_FILENAMES = ["network.csv", "customers.csv", "measurements.csv", "ami.csv"] as const;

type SampleFilename = (typeof SAMPLE_FILENAMES)[number];
type SampleProfile = "residential" | "commercial" | "office" | "industrial";

type CustomerSeed = {
  customerId: string;
  busId: string;
  phase: "A" | "B" | "C" | "ABC";
  meterId: string;
  contractKva: number;
  pf: number;
  peakKw: number;
  profile: SampleProfile;
};

export const PLN_SAMPLE_META = {
  sourceLabel: "PLN-like Urban Feeder · Synthetic",
  title: "Contoh Penyulang Perkotaan 20 kV",
  detail: "4 GD · 2 pelanggan TM · 14 meter · 96 × 15 menit",
  disclaimer: "Dataset sintetis/anonymized untuk contoh alur PLN; bukan data operasional atau format ekspor resmi PLN.",
} as const;

const NETWORK_HEADERS = [
  "element_id", "element_type", "from_bus", "to_bus", "from_kv", "to_kv", "length_km",
  "r_ohm_per_km", "x_ohm_per_km", "c_nf_per_km", "r0_ohm_per_km", "x0_ohm_per_km",
  "c0_nf_per_km", "max_i_ka", "rated_kva", "vk_percent", "vkr_percent", "vk0_percent",
  "vkr0_percent", "pfe_kw", "i0_percent", "vector_group", "shift_degree", "s_sc_max_mva",
  "rx_max", "r0x0_max", "x0x_max",
] as const;

const NETWORK_ROWS: Array<Record<(typeof NETWORK_HEADERS)[number], string | number>> = [
  networkRow({ element_id: "SOURCE_GI_KTB_MERANTI", element_type: "source", to_bus: "BUS_GI_20KV", to_kv: 20, s_sc_max_mva: 500, rx_max: 0.10, r0x0_max: 0.12, x0x_max: 1.00 }),
  networkRow({ element_id: "JTM_MRT_01_CU240", element_type: "line", from_bus: "BUS_GI_20KV", to_bus: "BUS_MV_SP01", from_kv: 20, to_kv: 20, length_km: 1.15, r_ohm_per_km: 0.125, x_ohm_per_km: 0.100, c_nf_per_km: 240, r0_ohm_per_km: 0.390, x0_ohm_per_km: 0.300, c0_nf_per_km: 160, max_i_ka: 0.36 }),
  networkRow({ element_id: "TR_GD001_630", element_type: "transformer", from_bus: "BUS_MV_SP01", to_bus: "BUS_LV_GD001", from_kv: 20, to_kv: 0.4, rated_kva: 630, vk_percent: 4.5, vkr_percent: 0.85, vk0_percent: 4.5, vkr0_percent: 0.85, pfe_kw: 1.15, i0_percent: 0.30, vector_group: "Dyn", shift_degree: 150 }),
  networkRow({ element_id: "JTM_MRT_02_CU240", element_type: "line", from_bus: "BUS_MV_SP01", to_bus: "BUS_MV_SP02", from_kv: 20, to_kv: 20, length_km: 0.85, r_ohm_per_km: 0.125, x_ohm_per_km: 0.100, c_nf_per_km: 240, r0_ohm_per_km: 0.390, x0_ohm_per_km: 0.300, c0_nf_per_km: 160, max_i_ka: 0.36 }),
  networkRow({ element_id: "TR_GD002_1000", element_type: "transformer", from_bus: "BUS_MV_SP02", to_bus: "BUS_LV_GD002", from_kv: 20, to_kv: 0.4, rated_kva: 1000, vk_percent: 5.0, vkr_percent: 0.75, vk0_percent: 5.0, vkr0_percent: 0.75, pfe_kw: 1.75, i0_percent: 0.25, vector_group: "Dyn", shift_degree: 150 }),
  networkRow({ element_id: "JTM_MRT_03_AAAC150", element_type: "line", from_bus: "BUS_MV_SP02", to_bus: "BUS_MV_SP03", from_kv: 20, to_kv: 20, length_km: 1.45, r_ohm_per_km: 0.216, x_ohm_per_km: 0.340, c_nf_per_km: 10, r0_ohm_per_km: 0.650, x0_ohm_per_km: 1.020, c0_nf_per_km: 6, max_i_ka: 0.30 }),
  networkRow({ element_id: "JTM_MRT_04_CU240", element_type: "line", from_bus: "BUS_MV_SP03", to_bus: "BUS_MV_SP04", from_kv: 20, to_kv: 20, length_km: 1.10, r_ohm_per_km: 0.125, x_ohm_per_km: 0.100, c_nf_per_km: 240, r0_ohm_per_km: 0.390, x0_ohm_per_km: 0.300, c0_nf_per_km: 160, max_i_ka: 0.36 }),
  networkRow({ element_id: "TR_GD003_630", element_type: "transformer", from_bus: "BUS_MV_SP04", to_bus: "BUS_LV_GD003", from_kv: 20, to_kv: 0.4, rated_kva: 630, vk_percent: 4.5, vkr_percent: 0.85, vk0_percent: 4.5, vkr0_percent: 0.85, pfe_kw: 1.15, i0_percent: 0.30, vector_group: "Dyn", shift_degree: 150 }),
  networkRow({ element_id: "JTM_MRT_05_AAAC150", element_type: "line", from_bus: "BUS_MV_SP04", to_bus: "BUS_MV_SP05", from_kv: 20, to_kv: 20, length_km: 0.95, r_ohm_per_km: 0.216, x_ohm_per_km: 0.340, c_nf_per_km: 10, r0_ohm_per_km: 0.650, x0_ohm_per_km: 1.020, c0_nf_per_km: 6, max_i_ka: 0.30 }),
  networkRow({ element_id: "TR_GD004_400", element_type: "transformer", from_bus: "BUS_MV_SP05", to_bus: "BUS_LV_GD004", from_kv: 20, to_kv: 0.4, rated_kva: 400, vk_percent: 4.0, vkr_percent: 0.95, vk0_percent: 4.0, vkr0_percent: 0.95, pfe_kw: 0.85, i0_percent: 0.35, vector_group: "Dyn", shift_degree: 150 }),
];

const CUSTOMER_SEEDS: CustomerSeed[] = [
  { customerId: "AGG_GD001_A", busId: "BUS_LV_GD001", phase: "A", meterId: "AMI_GD001_A", contractKva: 210, pf: 0.93, peakKw: 125, profile: "residential" },
  { customerId: "AGG_GD001_B", busId: "BUS_LV_GD001", phase: "B", meterId: "AMI_GD001_B", contractKva: 210, pf: 0.92, peakKw: 132, profile: "residential" },
  { customerId: "AGG_GD001_C", busId: "BUS_LV_GD001", phase: "C", meterId: "AMI_GD001_C", contractKva: 210, pf: 0.94, peakKw: 118, profile: "residential" },
  { customerId: "AGG_GD002_A", busId: "BUS_LV_GD002", phase: "A", meterId: "AMI_GD002_A", contractKva: 330, pf: 0.94, peakKw: 190, profile: "commercial" },
  { customerId: "AGG_GD002_B", busId: "BUS_LV_GD002", phase: "B", meterId: "AMI_GD002_B", contractKva: 330, pf: 0.93, peakKw: 205, profile: "commercial" },
  { customerId: "AGG_GD002_C", busId: "BUS_LV_GD002", phase: "C", meterId: "AMI_GD002_C", contractKva: 340, pf: 0.95, peakKw: 180, profile: "commercial" },
  { customerId: "PEL_TM_GEDUNG_1385", busId: "BUS_MV_SP03", phase: "ABC", meterId: "AMI_TM_GEDUNG_01", contractKva: 1385, pf: 0.96, peakKw: 720, profile: "office" },
  { customerId: "AGG_GD003_A", busId: "BUS_LV_GD003", phase: "A", meterId: "AMI_GD003_A", contractKva: 210, pf: 0.92, peakKw: 118, profile: "residential" },
  { customerId: "AGG_GD003_B", busId: "BUS_LV_GD003", phase: "B", meterId: "AMI_GD003_B", contractKva: 210, pf: 0.93, peakKw: 126, profile: "residential" },
  { customerId: "AGG_GD003_C", busId: "BUS_LV_GD003", phase: "C", meterId: "AMI_GD003_C", contractKva: 210, pf: 0.91, peakKw: 112, profile: "residential" },
  { customerId: "PEL_TM_INDUSTRI_1970", busId: "BUS_MV_SP05", phase: "ABC", meterId: "AMI_TM_INDUSTRI_01", contractKva: 1970, pf: 0.95, peakKw: 980, profile: "industrial" },
  { customerId: "AGG_GD004_A", busId: "BUS_LV_GD004", phase: "A", meterId: "AMI_GD004_A", contractKva: 135, pf: 0.91, peakKw: 78, profile: "residential" },
  { customerId: "AGG_GD004_B", busId: "BUS_LV_GD004", phase: "B", meterId: "AMI_GD004_B", contractKva: 130, pf: 0.92, peakKw: 74, profile: "residential" },
  { customerId: "AGG_GD004_C", busId: "BUS_LV_GD004", phase: "C", meterId: "AMI_GD004_C", contractKva: 135, pf: 0.90, peakKw: 82, profile: "residential" },
];

export function createPlnSampleCsv(): Record<SampleFilename, string> {
  const network = toCsv(NETWORK_HEADERS, NETWORK_ROWS);
  const customers = toCsv(
    ["customer_id", "bus_id", "phase", "meter_id", "contract_kva", "pf"],
    CUSTOMER_SEEDS.map((item) => ({
      customer_id: item.customerId,
      bus_id: item.busId,
      phase: item.phase,
      meter_id: item.meterId,
      contract_kva: item.contractKva,
      pf: item.pf,
    })),
  );

  const amiRows: Array<Record<string, string | number>> = [];
  const sourceRows: Array<Record<string, string | number>> = [];
  const totalP: number[] = [];
  const totalQ: number[] = [];

  for (let index = 0; index < 96; index += 1) {
    const hour = index / 4;
    let intervalP = 0;
    let intervalQ = 0;
    CUSTOMER_SEEDS.forEach((customer, customerIndex) => {
      const shape = profileFactor(customer.profile, hour);
      const ripple = 1 + 0.012 * Math.sin((index + customerIndex * 7) * 0.63) + 0.006 * Math.sin(index * 0.17 + customerIndex * 1.31);
      const pKw = Math.max(0.1, customer.peakKw * shape * ripple);
      const qKvar = pKw * Math.tan(Math.acos(customer.pf));
      const quality =
        (customer.meterId === "AMI_GD003_C" && (index === 36 || index === 37)) ||
        (customer.meterId === "AMI_TM_GEDUNG_01" && index === 58)
          ? "SUSPECT"
          : "GOOD";
      amiRows.push({
        timestamp: timestampAt(index),
        meter_id: customer.meterId,
        p_kw: pKw.toFixed(3),
        q_kvar: qKvar.toFixed(3),
        quality,
      });
      intervalP += pKw;
      intervalQ += qKvar;
    });
    totalP.push(intervalP);
    totalQ.push(intervalQ);
  }

  const peakLoad = Math.max(...totalP);
  for (let index = 0; index < 96; index += 1) {
    const loadRatio = totalP[index] / peakLoad;
    const lossEstimateKw = 5 + 0.018 * totalP[index] + 0.012 * totalP[index] * loadRatio ** 1.25;
    const sourceP = (totalP[index] + lossEstimateKw) * (1 + 0.0015 * Math.sin(index * 0.53));
    const sourceQ = (totalQ[index] + 0.16 * lossEstimateKw) * (1 + 0.001 * Math.sin(index * 0.37 + 0.4));
    const vll = 20.12 - 0.24 * loadRatio + 0.02 * Math.sin(index * 0.19);
    const sKva = Math.sqrt(sourceP ** 2 + sourceQ ** 2);
    const currentA = sKva / (Math.sqrt(3) * vll);
    const timestamp = timestampAt(index);
    sourceRows.push(
      { timestamp, asset_id: "SOURCE_GI_KTB_MERANTI", measurement_type: "P", phase: "ABC", value: sourceP.toFixed(3), unit: "kW", quality: "GOOD" },
      { timestamp, asset_id: "SOURCE_GI_KTB_MERANTI", measurement_type: "Q", phase: "ABC", value: sourceQ.toFixed(3), unit: "kvar", quality: "GOOD" },
      { timestamp, asset_id: "SOURCE_GI_KTB_MERANTI", measurement_type: "V", phase: "A", value: (vll * (1 + 0.0015 * Math.sin(index * 0.21))).toFixed(4), unit: "kV", quality: "GOOD" },
      { timestamp, asset_id: "SOURCE_GI_KTB_MERANTI", measurement_type: "V", phase: "B", value: (vll * (1 - 0.0010 * Math.sin(index * 0.23 + 0.8))).toFixed(4), unit: "kV", quality: "GOOD" },
      { timestamp, asset_id: "SOURCE_GI_KTB_MERANTI", measurement_type: "V", phase: "C", value: (vll * (1 + 0.0011 * Math.sin(index * 0.17 + 1.2))).toFixed(4), unit: "kV", quality: "GOOD" },
      { timestamp, asset_id: "SOURCE_GI_KTB_MERANTI", measurement_type: "I", phase: "A", value: (currentA * 1.018).toFixed(3), unit: "A", quality: "GOOD" },
      { timestamp, asset_id: "SOURCE_GI_KTB_MERANTI", measurement_type: "I", phase: "B", value: (currentA * 0.987).toFixed(3), unit: "A", quality: "GOOD" },
      { timestamp, asset_id: "SOURCE_GI_KTB_MERANTI", measurement_type: "I", phase: "C", value: (currentA * 0.995).toFixed(3), unit: "A", quality: "GOOD" },
    );
  }

  return {
    "network.csv": network,
    "customers.csv": customers,
    "measurements.csv": toCsv(["timestamp", "asset_id", "measurement_type", "phase", "value", "unit", "quality"], sourceRows),
    "ami.csv": toCsv(["timestamp", "meter_id", "p_kw", "q_kvar", "quality"], amiRows),
  };
}

export function createPlnSampleFiles(): File[] {
  const csv = createPlnSampleCsv();
  return SAMPLE_FILENAMES.map((name) => new File([csv[name]], name, { type: "text/csv;charset=utf-8" }));
}

export function downloadPlnSampleCsv() {
  const csv = createPlnSampleCsv();
  SAMPLE_FILENAMES.forEach((name, index) => {
    window.setTimeout(() => {
      const url = URL.createObjectURL(new Blob([csv[name]], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, index * 120);
  });
}

function networkRow(values: Partial<Record<(typeof NETWORK_HEADERS)[number], string | number>>) {
  return Object.fromEntries(NETWORK_HEADERS.map((header) => [header, values[header] ?? ""])) as Record<(typeof NETWORK_HEADERS)[number], string | number>;
}

function toCsv(headers: readonly string[], rows: Array<Record<string, string | number>>) {
  const lines = [headers.join(",")];
  rows.forEach((row) => lines.push(headers.map((header) => csvCell(row[header] ?? "")).join(",")));
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function timestampAt(index: number) {
  return `2026-08-18 ${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`;
}

function gaussian(hour: number, center: number, width: number) {
  return Math.exp(-0.5 * ((hour - center) / width) ** 2);
}

function profileFactor(profile: SampleProfile, hour: number) {
  if (profile === "residential") return 0.38 + 0.22 * gaussian(hour, 7.0, 1.6) + 0.48 * gaussian(hour, 19.2, 2.4) + 0.10 * gaussian(hour, 12.5, 3.2);
  if (profile === "commercial") return 0.30 + 0.42 / (1 + Math.exp(-(hour - 9.0) * 1.6)) - 0.28 / (1 + Math.exp(-(hour - 21.0) * 1.8)) + 0.16 * gaussian(hour, 18.0, 3.0);
  if (profile === "office") return 0.18 + 0.62 / (1 + Math.exp(-(hour - 7.2) * 1.8)) - 0.50 / (1 + Math.exp(-(hour - 18.2) * 1.8)) + 0.15 * gaussian(hour, 14.0, 2.8);
  return 0.48 + 0.32 / (1 + Math.exp(-(hour - 6.5) * 2.0)) - 0.20 / (1 + Math.exp(-(hour - 22.0) * 2.0)) + 0.06 * gaussian(hour, 13.0, 4.0);
}

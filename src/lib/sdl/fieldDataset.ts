export const FIELD_DATASET_SCHEMA = "smart-distribution-loss-field-v1" as const;
export const FIELD_INTERVALS = 96;
export const FIELD_INTERVAL_MINUTES = 15;

export type FieldElementType = "source" | "line" | "transformer";
export type FieldPhase = "A" | "B" | "C";

export interface FieldNetworkElement {
  element_id: string;
  element_type: FieldElementType;
  from_bus: string;
  to_bus: string;
  from_kv: number | null;
  to_kv: number;
  length_km: number | null;
  r_ohm_per_km: number | null;
  x_ohm_per_km: number | null;
  c_nf_per_km: number | null;
  r0_ohm_per_km: number | null;
  x0_ohm_per_km: number | null;
  c0_nf_per_km: number | null;
  max_i_ka: number | null;
  rated_kva: number | null;
  vk_percent: number | null;
  vkr_percent: number | null;
  vk0_percent: number | null;
  vkr0_percent: number | null;
  pfe_kw: number | null;
  i0_percent: number | null;
  vector_group: string;
  shift_degree: number | null;
  s_sc_max_mva: number | null;
  rx_max: number | null;
  r0x0_max: number | null;
  x0x_max: number | null;
}

export interface FieldCustomer {
  customer_id: string;
  bus_id: string;
  phase: FieldPhase;
  meter_id: string;
  contract_kva: number | null;
  pf: number | null;
}

export interface FieldMeasurement {
  timestamp: string;
  time: string;
  index: number;
  asset_id: string;
  measurement_type: string;
  phase: string;
  value: number;
  unit: string;
  quality: string;
}

export interface FieldAmiPoint {
  timestamp: string;
  time: string;
  index: number;
  meter_id: string;
  p_kw: number;
  q_kvar: number | null;
  quality: string;
}

export interface FieldDatasetV1 {
  schema: typeof FIELD_DATASET_SCHEMA;
  dataset_mode: "field_import";
  source_label: string;
  canonical_timebase: {
    intervals: 96;
    interval_minutes: 15;
    period_hours: 24;
    first_interval: "00:00";
    last_interval: "23:45";
    timezone: "local-file";
  };
  network: FieldNetworkElement[];
  customers: FieldCustomer[];
  measurements: FieldMeasurement[];
  ami: FieldAmiPoint[];
}

export interface FieldDatasetSummary {
  networkElements: number;
  sources: number;
  lines: number;
  transformers: number;
  customers: number;
  meters: number;
  amiPoints: number;
  amiExpectedPoints: number;
  amiCoveragePercent: number;
  sourcePIntervals: number;
  sourceMeasurementCoveragePercent: number;
}

export interface FieldDatasetValidationReport {
  valid: boolean;
  solverReady: boolean;
  errors: string[];
  warnings: string[];
  summary: FieldDatasetSummary;
}

export interface FieldDatasetImport {
  dataset: FieldDatasetV1 | null;
  report: FieldDatasetValidationReport;
  filenames: string[];
}

export interface FieldPhysicsSeriesPoint {
  index: number;
  time: string;
  technical_loss_kw: number;
  line_loss_kw: number;
  transformer_loss_kw: number;
  source_kw: number;
  load_kw: number;
  load_kvar: number;
  loss_rate_percent: number;
  min_voltage_pu: number;
  max_loading_percent: number;
  observed_source_kw: number | null;
}

export interface FieldDatasetResult {
  schema: "smart-distribution-loss-field-result-v1";
  dataset_schema: typeof FIELD_DATASET_SCHEMA;
  dataset_mode: "field_import";
  gate: { pass: boolean; summary: string };
  summary: {
    technical_loss_kwh: number;
    supplied_energy_kwh: number;
    load_energy_kwh: number;
    loss_rate_percent: number;
    peak_loss_kw: number;
    peak_time: string;
    min_voltage_pu: number;
    max_voltage_pu: number;
    max_loading_percent: number;
    max_line_loading_percent: number;
    max_transformer_loading_percent: number;
    source_nrmse_percent: number | null;
    source_measurement_intervals: number;
  };
  series: FieldPhysicsSeriesPoint[];
  checks: Array<{ name: string; pass: boolean; detail: string }>;
  provenance: Record<string, string>;
  runtime: Record<string, number | string | boolean | null>;
}

const REQUIRED_FILENAMES = ["network.csv", "customers.csv", "measurements.csv", "ami.csv"] as const;
const NETWORK_HEADERS = [
  "element_id", "element_type", "from_bus", "to_bus", "from_kv", "to_kv", "length_km",
  "r_ohm_per_km", "x_ohm_per_km", "c_nf_per_km", "r0_ohm_per_km", "x0_ohm_per_km",
  "c0_nf_per_km", "max_i_ka", "rated_kva", "vk_percent", "vkr_percent", "vk0_percent",
  "vkr0_percent", "pfe_kw", "i0_percent", "vector_group", "shift_degree", "s_sc_max_mva",
  "rx_max", "r0x0_max", "x0x_max",
] as const;
const CUSTOMER_HEADERS = ["customer_id", "bus_id", "phase", "meter_id", "contract_kva", "pf"] as const;
const MEASUREMENT_HEADERS = ["timestamp", "asset_id", "measurement_type", "phase", "value", "unit", "quality"] as const;
const AMI_HEADERS = ["timestamp", "meter_id", "p_kw", "q_kvar", "quality"] as const;

type CsvKey =
  | (typeof NETWORK_HEADERS)[number]
  | (typeof CUSTOMER_HEADERS)[number]
  | (typeof MEASUREMENT_HEADERS)[number]
  | (typeof AMI_HEADERS)[number];
type CsvRow = Record<CsvKey, string>;

function emptySummary(): FieldDatasetSummary {
  return {
    networkElements: 0, sources: 0, lines: 0, transformers: 0, customers: 0, meters: 0,
    amiPoints: 0, amiExpectedPoints: 0, amiCoveragePercent: 0, sourcePIntervals: 0,
    sourceMeasurementCoveragePercent: 0,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const pushValue = () => { row.push(value.trim()); value = ""; };
  const pushRow = () => { pushValue(); if (row.some((cell) => cell !== "")) rows.push(row); row = []; };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (ch === '"') {
      if (quoted && text.charAt(i + 1) === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) pushValue();
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text.charAt(i + 1) === "\n") i += 1;
      pushRow();
    } else value += ch;
  }
  if (value.length || row.length) pushRow();
  return rows;
}

function csvObjects(text: string, expectedHeaders: readonly string[], filename: string, errors: string[]): CsvRow[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const headerRow = rows[0];
  if (!headerRow) { errors.push(`${filename}: file kosong.`); return []; }
  const headers = headerRow.map((header) => header.trim().toLowerCase());
  const missing = expectedHeaders.filter((header) => !headers.includes(header));
  if (missing.length) { errors.push(`${filename}: kolom wajib hilang: ${missing.join(", ")}.`); return []; }
  return rows.slice(1).map((values) => {
    const record = Object.fromEntries([...NETWORK_HEADERS, ...CUSTOMER_HEADERS, ...MEASUREMENT_HEADERS, ...AMI_HEADERS].map((key) => [key, ""])) as CsvRow;
    headers.forEach((header, index) => {
      if (header in record) record[header as CsvKey] = values[index] ?? "";
    });
    return record;
  });
}

function numeric(value: string, field: string, context: string, errors: string[], nullable = false): number | null {
  const raw = value.trim();
  if (!raw && nullable) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) { errors.push(`${context}: ${field} harus berupa angka${nullable ? " atau kosong" : ""}.`); return null; }
  return parsed;
}

function normalizeTime(raw: string): { time: string; index: number } | null {
  const match = raw.match(/(?:T|\s|^)(\d{2}):(\d{2})(?::\d{2})?/);
  const hh = match?.[1];
  const mm = match?.[2];
  if (!hh || !mm) return null;
  const hour = Number(hh);
  const minute = Number(mm);
  if (hour > 23 || minute > 59 || minute % FIELD_INTERVAL_MINUTES !== 0) return null;
  return { time: `${hh}:${mm}`, index: hour * 4 + minute / FIELD_INTERVAL_MINUTES };
}

function parseNetwork(rows: CsvRow[], errors: string[]): FieldNetworkElement[] {
  return rows.map((row, i) => {
    const context = `network.csv baris ${i + 2}`;
    const type = row.element_type.trim().toLowerCase() as FieldElementType;
    if (!["source", "line", "transformer"].includes(type)) errors.push(`${context}: element_type harus source, line, atau transformer.`);
    return {
      element_id: row.element_id.trim(), element_type: type, from_bus: row.from_bus.trim(), to_bus: row.to_bus.trim(),
      from_kv: numeric(row.from_kv, "from_kv", context, errors, true), to_kv: numeric(row.to_kv, "to_kv", context, errors) ?? 0,
      length_km: numeric(row.length_km, "length_km", context, errors, true), r_ohm_per_km: numeric(row.r_ohm_per_km, "r_ohm_per_km", context, errors, true),
      x_ohm_per_km: numeric(row.x_ohm_per_km, "x_ohm_per_km", context, errors, true), c_nf_per_km: numeric(row.c_nf_per_km, "c_nf_per_km", context, errors, true),
      r0_ohm_per_km: numeric(row.r0_ohm_per_km, "r0_ohm_per_km", context, errors, true), x0_ohm_per_km: numeric(row.x0_ohm_per_km, "x0_ohm_per_km", context, errors, true),
      c0_nf_per_km: numeric(row.c0_nf_per_km, "c0_nf_per_km", context, errors, true), max_i_ka: numeric(row.max_i_ka, "max_i_ka", context, errors, true),
      rated_kva: numeric(row.rated_kva, "rated_kva", context, errors, true), vk_percent: numeric(row.vk_percent, "vk_percent", context, errors, true),
      vkr_percent: numeric(row.vkr_percent, "vkr_percent", context, errors, true), vk0_percent: numeric(row.vk0_percent, "vk0_percent", context, errors, true),
      vkr0_percent: numeric(row.vkr0_percent, "vkr0_percent", context, errors, true), pfe_kw: numeric(row.pfe_kw, "pfe_kw", context, errors, true),
      i0_percent: numeric(row.i0_percent, "i0_percent", context, errors, true), vector_group: row.vector_group.trim(),
      shift_degree: numeric(row.shift_degree, "shift_degree", context, errors, true), s_sc_max_mva: numeric(row.s_sc_max_mva, "s_sc_max_mva", context, errors, true),
      rx_max: numeric(row.rx_max, "rx_max", context, errors, true), r0x0_max: numeric(row.r0x0_max, "r0x0_max", context, errors, true),
      x0x_max: numeric(row.x0x_max, "x0x_max", context, errors, true),
    };
  });
}

function parseCustomers(rows: CsvRow[], errors: string[]): FieldCustomer[] {
  return rows.map((row, i) => {
    const context = `customers.csv baris ${i + 2}`;
    const phase = row.phase.trim().toUpperCase() as FieldPhase;
    if (!["A", "B", "C"].includes(phase)) errors.push(`${context}: phase harus A, B, atau C.`);
    const pf = numeric(row.pf, "pf", context, errors, true);
    if (pf != null && (pf <= 0 || pf > 1)) errors.push(`${context}: pf harus > 0 dan <= 1.`);
    return { customer_id: row.customer_id.trim(), bus_id: row.bus_id.trim(), phase, meter_id: row.meter_id.trim(), contract_kva: numeric(row.contract_kva, "contract_kva", context, errors, true), pf };
  });
}

function parseMeasurements(rows: CsvRow[], errors: string[]): FieldMeasurement[] {
  const result: FieldMeasurement[] = [];
  rows.forEach((row, i) => {
    const context = `measurements.csv baris ${i + 2}`;
    const normalized = normalizeTime(row.timestamp);
    if (!normalized) { errors.push(`${context}: timestamp harus jatuh pada grid 15 menit.`); return; }
    const value = numeric(row.value, "value", context, errors);
    if (value == null) return;
    result.push({ timestamp: row.timestamp.trim(), ...normalized, asset_id: row.asset_id.trim(), measurement_type: row.measurement_type.trim().toUpperCase(), phase: row.phase.trim().toUpperCase(), value, unit: row.unit.trim(), quality: row.quality.trim().toUpperCase() || "UNKNOWN" });
  });
  return result;
}

function parseAmi(rows: CsvRow[], errors: string[]): FieldAmiPoint[] {
  const result: FieldAmiPoint[] = [];
  rows.forEach((row, i) => {
    const context = `ami.csv baris ${i + 2}`;
    const normalized = normalizeTime(row.timestamp);
    if (!normalized) { errors.push(`${context}: timestamp harus jatuh pada grid 15 menit.`); return; }
    const p = numeric(row.p_kw, "p_kw", context, errors);
    if (p == null) return;
    result.push({ timestamp: row.timestamp.trim(), ...normalized, meter_id: row.meter_id.trim(), p_kw: p, q_kvar: numeric(row.q_kvar, "q_kvar", context, errors, true), quality: row.quality.trim().toUpperCase() || "UNKNOWN" });
  });
  return result;
}

function unique(values: string[]) { return new Set(values).size === values.length; }

export function validateFieldDataset(dataset: FieldDatasetV1): FieldDatasetValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { network, customers, measurements, ami } = dataset;
  const sources = network.filter((item) => item.element_type === "source");
  const lines = network.filter((item) => item.element_type === "line");
  const transformers = network.filter((item) => item.element_type === "transformer");

  if (!network.length) errors.push("network.csv: minimal satu elemen jaringan diperlukan.");
  if (sources.length !== 1) errors.push(`network.csv: v1 membutuhkan tepat satu source; ditemukan ${sources.length}.`);
  if (!customers.length) errors.push("customers.csv: minimal satu pelanggan diperlukan.");
  if (!unique(network.map((item) => item.element_id))) errors.push("network.csv: element_id harus unik.");
  if (!unique(customers.map((item) => item.customer_id))) errors.push("customers.csv: customer_id harus unik.");
  if (!unique(customers.map((item) => item.meter_id))) errors.push("customers.csv: meter_id harus unik pada v1.");

  const busVoltages = new Map<string, number>();
  const registerBus = (bus: string, kv: number | null, context: string) => {
    if (!bus || kv == null || !Number.isFinite(kv) || kv <= 0) return;
    const existing = busVoltages.get(bus);
    if (existing != null && Math.abs(existing - kv) > 1e-6) errors.push(`${context}: tegangan bus ${bus} konflik (${existing} vs ${kv} kV).`);
    else busVoltages.set(bus, kv);
  };

  network.forEach((item) => {
    const context = `network.csv ${item.element_id || "(tanpa id)"}`;
    if (!item.element_id) errors.push(`${context}: element_id wajib.`);
    if (!item.to_bus) errors.push(`${context}: to_bus wajib.`);
    registerBus(item.from_bus, item.from_kv, context);
    registerBus(item.to_bus, item.to_kv, context);
    if (item.element_type === "source") {
      if (item.from_bus) warnings.push(`${context}: source mengabaikan from_bus; gunakan to_bus sebagai grid bus.`);
      for (const [field, value] of [["s_sc_max_mva", item.s_sc_max_mva], ["rx_max", item.rx_max], ["r0x0_max", item.r0x0_max], ["x0x_max", item.x0x_max]] as const) if (value == null || value <= 0) errors.push(`${context}: ${field} wajib dan harus > 0 untuk runpp_3ph.`);
    }
    if (item.element_type === "line") {
      if (!item.from_bus) errors.push(`${context}: line membutuhkan from_bus.`);
      for (const [field, value] of [["length_km", item.length_km], ["r_ohm_per_km", item.r_ohm_per_km], ["x_ohm_per_km", item.x_ohm_per_km], ["r0_ohm_per_km", item.r0_ohm_per_km], ["x0_ohm_per_km", item.x0_ohm_per_km], ["max_i_ka", item.max_i_ka]] as const) if (value == null || value <= 0) errors.push(`${context}: ${field} wajib dan harus > 0.`);
    }
    if (item.element_type === "transformer") {
      if (!item.from_bus) errors.push(`${context}: transformer membutuhkan from_bus.`);
      for (const [field, value] of [["rated_kva", item.rated_kva], ["vk_percent", item.vk_percent], ["vkr_percent", item.vkr_percent], ["vk0_percent", item.vk0_percent], ["vkr0_percent", item.vkr0_percent], ["pfe_kw", item.pfe_kw], ["i0_percent", item.i0_percent]] as const) {
        if (value == null || value < 0 || (field !== "pfe_kw" && field !== "i0_percent" && value === 0)) errors.push(`${context}: ${field} wajib untuk model trafo 3-fasa.`);
      }
      if (!item.vector_group) errors.push(`${context}: vector_group wajib.`);
    }
  });

  const knownBuses = new Set(busVoltages.keys());
  customers.forEach((customer) => {
    if (!customer.customer_id) errors.push("customers.csv: customer_id tidak boleh kosong.");
    if (!customer.meter_id) errors.push(`customers.csv ${customer.customer_id}: meter_id wajib.`);
    if (!knownBuses.has(customer.bus_id)) errors.push(`customers.csv ${customer.customer_id}: bus_id ${customer.bus_id} tidak ditemukan di network.csv.`);
  });

  const meterSet = new Set(customers.map((customer) => customer.meter_id));
  ami.forEach((point) => { if (!meterSet.has(point.meter_id)) errors.push(`ami.csv: meter_id ${point.meter_id} tidak ditemukan di customers.csv.`); });
  const seenAmi = new Set<string>();
  const duplicateAmi = new Set<string>();
  ami.forEach((point) => { const key = `${point.meter_id}:${point.index}`; if (seenAmi.has(key)) duplicateAmi.add(key); seenAmi.add(key); });
  if (duplicateAmi.size) errors.push(`ami.csv: ditemukan ${duplicateAmi.size} duplikasi meter/timestamp.`);

  const missingQ = ami.filter((point) => point.q_kvar == null).length;
  if (missingQ) {
    const missingPf = customers.filter((customer) => customer.pf == null).length;
    if (missingPf) errors.push(`AMI q_kvar kosong tetapi ${missingPf} customer juga tidak memiliki PF fallback.`);
    else warnings.push(`${missingQ} titik AMI tanpa q_kvar akan diturunkan dari PF customer.`);
  }

  const amiExpectedPoints = customers.length * FIELD_INTERVALS;
  const amiCoveragePercent = amiExpectedPoints > 0 ? (ami.length / amiExpectedPoints) * 100 : 0;
  if (amiCoveragePercent < 100) warnings.push(`AMI coverage ${amiCoveragePercent.toFixed(1)}%; physics preview v1 hanya aktif pada 100% P coverage.`);
  const sourceIds = new Set(sources.map((source) => source.element_id));
  const sourcePIndices = new Set(measurements.filter((m) => sourceIds.has(m.asset_id) && m.measurement_type === "P").map((m) => m.index));
  if (sourcePIndices.size < FIELD_INTERVALS) warnings.push(`Source P measurement tersedia ${sourcePIndices.size}/96 interval; residual validation akan parsial.`);

  const summary: FieldDatasetSummary = {
    networkElements: network.length, sources: sources.length, lines: lines.length, transformers: transformers.length,
    customers: customers.length, meters: meterSet.size, amiPoints: ami.length, amiExpectedPoints, amiCoveragePercent,
    sourcePIntervals: sourcePIndices.size, sourceMeasurementCoveragePercent: (sourcePIndices.size / FIELD_INTERVALS) * 100,
  };
  const solverReady = errors.length === 0 && customers.length > 0 && Math.abs(amiCoveragePercent - 100) < 1e-9;
  return { valid: errors.length === 0, solverReady, errors, warnings, summary };
}

export async function importFieldDataset(files: FileList | File[]): Promise<FieldDatasetImport> {
  const array = Array.from(files);
  const byName = new Map(array.map((file) => [file.name.toLowerCase(), file]));
  const parseErrors: string[] = [];
  for (const required of REQUIRED_FILENAMES) if (!byName.has(required)) parseErrors.push(`File wajib belum dipilih: ${required}.`);
  if (parseErrors.length) return { dataset: null, report: { valid: false, solverReady: false, errors: parseErrors, warnings: [], summary: emptySummary() }, filenames: array.map((f) => f.name) };

  const [networkText, customerText, measurementText, amiText] = await Promise.all([
    byName.get("network.csv")!.text(), byName.get("customers.csv")!.text(), byName.get("measurements.csv")!.text(), byName.get("ami.csv")!.text(),
  ]);
  const dataset: FieldDatasetV1 = {
    schema: FIELD_DATASET_SCHEMA,
    dataset_mode: "field_import",
    source_label: "Imported Field Dataset",
    canonical_timebase: { intervals: 96, interval_minutes: 15, period_hours: 24, first_interval: "00:00", last_interval: "23:45", timezone: "local-file" },
    network: parseNetwork(csvObjects(networkText, NETWORK_HEADERS, "network.csv", parseErrors), parseErrors),
    customers: parseCustomers(csvObjects(customerText, CUSTOMER_HEADERS, "customers.csv", parseErrors), parseErrors),
    measurements: parseMeasurements(csvObjects(measurementText, MEASUREMENT_HEADERS, "measurements.csv", parseErrors), parseErrors),
    ami: parseAmi(csvObjects(amiText, AMI_HEADERS, "ami.csv", parseErrors), parseErrors),
  };
  const semantic = validateFieldDataset(dataset);
  const errors = [...parseErrors, ...semantic.errors];
  return {
    dataset,
    report: { ...semantic, valid: errors.length === 0, solverReady: errors.length === 0 && semantic.solverReady, errors },
    filenames: array.map((file) => file.name),
  };
}

export function fieldDatasetSchemaSummary() {
  return [
    { file: "network.csv", role: "Source, line, transformer, bus voltage, impedance, thermal & 3φ parameters" },
    { file: "customers.csv", role: "Customer → bus / phase / meter mapping + PF fallback" },
    { file: "measurements.csv", role: "SCADA / feeder P-Q-V-I channels for residual validation" },
    { file: "ami.csv", role: "96 × 15-minute customer P/Q interval measurements" },
  ];
}

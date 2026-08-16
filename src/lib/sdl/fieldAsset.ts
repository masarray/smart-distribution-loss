import type { OperatorDecision } from "./decision";
import type { FieldDatasetResult, FieldPhysicsSeriesPoint } from "./fieldDataset";
import type { FieldOperationalSession } from "./fieldOperational";
import type { FieldTopologySelection } from "./fieldTopology";

export interface FieldAssetSeriesPoint {
  index: number;
  time: string;
  loss_kw: number;
  loading_percent: number;
  from_vm_min_pu: number | null;
  to_vm_min_pu: number | null;
}

export interface FieldBusSeriesPoint {
  index: number;
  time: string;
  vm_min_pu: number;
  vm_max_pu: number;
  vm_avg_pu: number;
  load_kw: number;
}

export interface FieldAssetSummary {
  element_id: string;
  element_type: "line" | "transformer";
  from_bus: string;
  to_bus: string;
  loss_kwh: number;
  loss_share_percent: number;
  peak_loss_kw: number;
  peak_time: string;
  max_loading_percent: number;
  min_endpoint_voltage_pu: number;
}

export type P5FieldDatasetResult = FieldDatasetResult & {
  assets?: FieldAssetSummary[];
  asset_series?: Record<string, FieldAssetSeriesPoint[]>;
  bus_series?: Record<string, FieldBusSeriesPoint[]>;
  topology?: {
    root_bus?: string;
    bus_count?: number;
    element_count?: number;
    physics_attribution?: string;
  };
};

export interface FieldSelectedView {
  selection: FieldTopologySelection;
  title: string;
  subtitle: string;
  kind: "source" | "line" | "transformer" | "bus";
  lossKwh: number | null;
  lossSharePercent: number | null;
  peakLossKw: number | null;
  peakTime: string | null;
  maxLoadingPercent: number | null;
  minVoltagePu: number | null;
  loadEnergyKwh: number | null;
  peakLoadKw: number | null;
  totalSeries: FieldPhysicsSeriesPoint[];
  assetSeries: FieldAssetSeriesPoint[];
  busSeries: FieldBusSeriesPoint[];
  provenance: string;
}

export function hasP5AssetObservability(result: FieldDatasetResult): result is P5FieldDatasetResult {
  const candidate = result as P5FieldDatasetResult;
  return Array.isArray(candidate.assets) && Boolean(candidate.asset_series) && Boolean(candidate.bus_series);
}

export function deriveFieldSelectedView(
  session: FieldOperationalSession,
  selection: FieldTopologySelection,
): FieldSelectedView {
  const result = session.result as P5FieldDatasetResult;
  const network = session.dataset.network;

  if (selection.kind === "source") {
    const source = network.find((item) => item.element_type === "source");
    return {
      selection,
      title: source?.element_id || "Source",
      subtitle: `Sumber jaringan · ${source?.to_bus ?? "root bus"}`,
      kind: "source",
      lossKwh: result.summary.technical_loss_kwh,
      lossSharePercent: 100,
      peakLossKw: result.summary.peak_loss_kw,
      peakTime: result.summary.peak_time,
      maxLoadingPercent: result.summary.max_loading_percent,
      minVoltagePu: result.summary.min_voltage_pu,
      loadEnergyKwh: result.summary.load_energy_kwh,
      peakLoadKw: maxOrNull(result.series.map((point) => point.load_kw)),
      totalSeries: result.series,
      assetSeries: [],
      busSeries: [],
      provenance: "Total jaringan dari hasil runpp_3ph 96 interval.",
    };
  }

  if (selection.kind === "element") {
    const element = network.find((item) => item.element_id === selection.id && item.element_type !== "source");
    const summary = result.assets?.find((item) => item.element_id === selection.id);
    const series = result.asset_series?.[selection.id] ?? [];
    const kind = element?.element_type === "transformer" ? "transformer" : "line";
    return {
      selection,
      title: element?.element_id ?? selection.id,
      subtitle: `${kind === "transformer" ? "Trafo" : "Saluran"} · ${element?.from_bus ?? "?"} → ${element?.to_bus ?? "?"}`,
      kind,
      lossKwh: summary?.loss_kwh ?? null,
      lossSharePercent: summary?.loss_share_percent ?? null,
      peakLossKw: summary?.peak_loss_kw ?? null,
      peakTime: summary?.peak_time ?? null,
      maxLoadingPercent: summary?.max_loading_percent ?? maxOrNull(series.map((point) => point.loading_percent)),
      minVoltagePu: summary?.min_endpoint_voltage_pu ?? minOrNull(series.flatMap((point) => [point.from_vm_min_pu, point.to_vm_min_pu])),
      loadEnergyKwh: null,
      peakLoadKw: null,
      totalSeries: [],
      assetSeries: series,
      busSeries: [],
      provenance: "Loss langsung dari row elemen pada res_line_3ph / res_trafo_3ph; tanpa alokasi proporsional.",
    };
  }

  const bus = selection.id;
  const series = result.bus_series?.[bus] ?? [];
  const customers = session.dataset.customers.filter((customer) => customer.bus_id === bus);
  const loadEnergyKwh = series.length ? series.reduce((sum, point) => sum + point.load_kw * 0.25, 0) : null;
  return {
    selection,
    title: bus,
    subtitle: `Bus · ${customers.length} pelanggan`,
    kind: "bus",
    lossKwh: null,
    lossSharePercent: null,
    peakLossKw: null,
    peakTime: null,
    maxLoadingPercent: null,
    minVoltagePu: minOrNull(series.map((point) => point.vm_min_pu)),
    loadEnergyKwh,
    peakLoadKw: maxOrNull(series.map((point) => point.load_kw)),
    totalSeries: [],
    assetSeries: [],
    busSeries: series,
    provenance: "Tegangan bus langsung dari res_bus_3ph; beban bus merupakan jumlah AMI pelanggan yang dipetakan ke bus tersebut.",
  };
}

export function deriveFieldAssetDecision(view: FieldSelectedView, session: FieldOperationalSession): OperatorDecision {
  if (view.kind === "bus") {
    if (view.minVoltagePu != null && view.minVoltagePu < 0.9) {
      return {
        status: "ATTENTION",
        source: "quality",
        headline: "Tegangan bus perlu perhatian",
        reason: `Tegangan minimum ${view.minVoltagePu.toFixed(3)} pu berada di bawah batas operasi 0,900 pu yang digunakan cockpit.`,
        evidence: `${view.title} · ${view.minVoltagePu.toFixed(3)} pu`,
        action: "Periksa profil beban dan jaringan upstream bus ini sebelum menentukan koreksi tegangan.",
      };
    }
    return {
      status: "NORMAL",
      source: "normal",
      headline: "Profil bus dalam batas cockpit",
      reason: "Tidak ada indikasi undervoltage pada hasil 96 interval untuk bus terpilih.",
      evidence: view.minVoltagePu == null ? "Belum ada seri bus" : `Minimum ${view.minVoltagePu.toFixed(3)} pu`,
      action: "Tinjau puncak beban bus dan elemen upstream bila diperlukan untuk investigasi lebih lanjut.",
    };
  }

  if (view.kind === "line" || view.kind === "transformer") {
    if (view.maxLoadingPercent != null && view.maxLoadingPercent > 100) {
      return {
        status: "ATTENTION",
        source: "quality",
        headline: "Loading aset melewati rating",
        reason: `Loading maksimum mencapai ${view.maxLoadingPercent.toFixed(1)}%.`,
        evidence: `${view.title} · ${view.maxLoadingPercent.toFixed(1)}%`,
        action: "Verifikasi rating aset dan interval puncak sebelum menilai kebutuhan redistribusi beban atau penguatan jaringan.",
      };
    }
    if (view.minVoltagePu != null && view.minVoltagePu < 0.9) {
      return {
        status: "ATTENTION",
        source: "quality",
        headline: "Endpoint aset mengalami tegangan rendah",
        reason: `Minimum endpoint ${view.minVoltagePu.toFixed(3)} pu pada hasil aset terpilih.`,
        evidence: `${view.title} · ${view.minVoltagePu.toFixed(3)} pu`,
        action: "Periksa bus downstream dan profil loading pada interval terburuk sebelum melakukan koreksi jaringan.",
      };
    }
    return {
      status: "NORMAL",
      source: "normal",
      headline: "Aset dalam batas hasil perhitungan",
      reason: "Loading maksimum dan tegangan endpoint tidak memicu batas perhatian cockpit.",
      evidence: `${formatMaybe(view.lossKwh, "kWh susut")} · ${formatMaybe(view.maxLoadingPercent, "% loading")}`,
      action: "Gunakan kontribusi susut dan interval puncak aset ini untuk menentukan prioritas inspeksi lapangan.",
    };
  }

  return {
    status: "NORMAL",
    source: "normal",
    headline: "Data lapangan siap digunakan",
    reason: "Dataset lolos validasi, seluruh 96 interval selesai dihitung, dan pemeriksaan teknis lulus.",
    evidence: `${session.result.series.length}/96 interval · topology & attribution P5`,
    action: "Pilih line, trafo, atau bus pada SLD untuk melihat kontribusi dan kondisi aset secara spesifik.",
  };
}

function minOrNull(values: Array<number | null | undefined>) {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length ? Math.min(...finite) : null;
}

function maxOrNull(values: Array<number | null | undefined>) {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length ? Math.max(...finite) : null;
}

function formatMaybe(value: number | null, suffix: string) {
  return value == null ? "—" : `${value.toFixed(2)} ${suffix}`;
}

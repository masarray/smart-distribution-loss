import type { P5FieldDatasetResult } from "./fieldAsset";
import { deriveFieldAssetPriorities } from "./fieldIntelligence";
import type { FieldInvestigationPlan } from "./fieldInvestigation";
import type { FieldMeasurementContext, FieldMeasurementRecord } from "./fieldMeasurement";
import {
  validateFieldDataset,
  type FieldDatasetImport,
  type FieldDatasetResult,
  type FieldDatasetV1,
  type FieldNetworkElement,
} from "./fieldDataset";
import type { FieldOperationalSession } from "./fieldOperational";
import { buildFieldTopology } from "./fieldTopology";

export type FieldCorrectionParameter =
  | "length_km"
  | "r_ohm_per_km"
  | "x_ohm_per_km"
  | "r0_ohm_per_km"
  | "x0_ohm_per_km"
  | "max_i_ka"
  | "rated_kva"
  | "vk_percent"
  | "vkr_percent"
  | "vk0_percent"
  | "vkr0_percent"
  | "pfe_kw"
  | "i0_percent";

export interface FieldCorrectionDefinition {
  parameter: FieldCorrectionParameter;
  label: string;
  unit: string;
  allowZero: boolean;
}

export interface FieldCorrectionEntry {
  parameter: FieldCorrectionParameter;
  label: string;
  unit: string;
  beforeValue: number;
  proposedValue: number;
  evidence: string;
  measurementTime: string;
  measurementSide: "FROM" | "TO";
  measurementReference: string;
}

export interface FieldCorrectionDraft {
  elementId: string;
  elementType: "line" | "transformer";
  baselineActivatedAt: string;
  version: number;
  entries: FieldCorrectionEntry[];
}

export interface FieldCorrectionCandidate {
  dataset: FieldDatasetV1;
  fieldImport: FieldDatasetImport;
  topologySupported: boolean;
  topologyReason: string | null;
}

export interface FieldCorrectionComparisonMetric {
  key: string;
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  unit: string;
  digits: number;
}

export interface FieldCorrectionComparison {
  elementId: string;
  draftVersion: number;
  gatePass: boolean;
  networkMetrics: FieldCorrectionComparisonMetric[];
  assetMetrics: FieldCorrectionComparisonMetric[];
  beforePeakTime: string | null;
  afterPeakTime: string | null;
  beforeRank: number | null;
  afterRank: number | null;
}

const LINE_DEFINITIONS: FieldCorrectionDefinition[] = [
  { parameter: "max_i_ka", label: "Rating arus", unit: "kA", allowZero: false },
  { parameter: "length_km", label: "Panjang saluran", unit: "km", allowZero: false },
  { parameter: "r_ohm_per_km", label: "R urutan positif", unit: "Ω/km", allowZero: false },
  { parameter: "x_ohm_per_km", label: "X urutan positif", unit: "Ω/km", allowZero: false },
  { parameter: "r0_ohm_per_km", label: "R urutan nol", unit: "Ω/km", allowZero: false },
  { parameter: "x0_ohm_per_km", label: "X urutan nol", unit: "Ω/km", allowZero: false },
];

const TRANSFORMER_DEFINITIONS: FieldCorrectionDefinition[] = [
  { parameter: "rated_kva", label: "Rated power", unit: "kVA", allowZero: false },
  { parameter: "vk_percent", label: "uk / vk", unit: "%", allowZero: false },
  { parameter: "vkr_percent", label: "ukr / vkr", unit: "%", allowZero: false },
  { parameter: "vk0_percent", label: "vk0", unit: "%", allowZero: false },
  { parameter: "vkr0_percent", label: "vkr0", unit: "%", allowZero: false },
  { parameter: "pfe_kw", label: "No-load / iron loss", unit: "kW", allowZero: true },
  { parameter: "i0_percent", label: "No-load current", unit: "%", allowZero: true },
];

export function fieldCorrectionDefinitions(elementType: "line" | "transformer") {
  return elementType === "line" ? LINE_DEFINITIONS : TRANSFORMER_DEFINITIONS;
}

export function defaultFieldCorrectionParameter(
  elementType: "line" | "transformer",
  loadingDiscrepancy: boolean,
) {
  if (loadingDiscrepancy) return elementType === "line" ? "max_i_ka" : "rated_kva";
  return elementType === "line" ? "r_ohm_per_km" : "vk_percent";
}

export function fieldCorrectionCurrentValue(
  session: FieldOperationalSession,
  elementId: string,
  parameter: FieldCorrectionParameter,
) {
  const element = session.dataset.network.find((item) => item.element_id === elementId);
  if (!element) return null;
  return numericParameterValue(element, parameter);
}

export function fieldCorrectionInputError({
  beforeValue,
  proposedValue,
  evidence,
  verified,
  definition,
}: {
  beforeValue: number | null;
  proposedValue: number | null;
  evidence: string;
  verified: boolean;
  definition: FieldCorrectionDefinition | null;
}) {
  if (!definition || beforeValue == null) return "Parameter baseline tidak tersedia pada dataset aktif.";
  if (proposedValue == null || !Number.isFinite(proposedValue)) return "Masukkan nilai usulan yang valid.";
  if (definition.allowZero ? proposedValue < 0 : proposedValue <= 0) return `Nilai ${definition.label} tidak memenuhi domain parameter.`;
  if (Math.abs(proposedValue - beforeValue) <= Math.max(1e-12, Math.abs(beforeValue) * 1e-12)) return "Nilai usulan masih sama dengan baseline.";
  if (!evidence.trim()) return "Referensi bukti verifikasi wajib diisi.";
  if (!verified) return "Konfirmasi bahwa nilai usulan sudah diverifikasi terhadap sumber lapangan/nameplate/as-built.";
  return null;
}

export function upsertFieldCorrectionDraft(
  current: FieldCorrectionDraft | null,
  session: FieldOperationalSession,
  plan: FieldInvestigationPlan,
  context: FieldMeasurementContext,
  record: FieldMeasurementRecord | null,
  definition: FieldCorrectionDefinition,
  proposedValue: number,
  evidence: string,
): FieldCorrectionDraft {
  const beforeValue = fieldCorrectionCurrentValue(session, plan.elementId, definition.parameter);
  if (beforeValue == null) throw new Error("Parameter baseline tidak tersedia.");
  const base: FieldCorrectionDraft = current && current.baselineActivatedAt === session.activatedAt
    ? current
    : {
        elementId: plan.elementId,
        elementType: plan.elementType,
        baselineActivatedAt: session.activatedAt,
        version: 0,
        entries: [],
      };
  const entry: FieldCorrectionEntry = {
    parameter: definition.parameter,
    label: definition.label,
    unit: definition.unit,
    beforeValue,
    proposedValue,
    evidence: evidence.trim(),
    measurementTime: context.time,
    measurementSide: context.side,
    measurementReference: record?.reference.trim() ?? "",
  };
  const entries = [...base.entries.filter((item) => item.parameter !== definition.parameter), entry];
  return { ...base, version: base.version + 1, entries };
}

export function removeFieldCorrectionEntry(
  current: FieldCorrectionDraft,
  parameter: FieldCorrectionParameter,
) {
  const entries = current.entries.filter((item) => item.parameter !== parameter);
  return { ...current, version: current.version + 1, entries };
}

export function buildFieldCorrectionCandidate(
  session: FieldOperationalSession,
  draft: FieldCorrectionDraft,
): FieldCorrectionCandidate {
  const network = session.dataset.network.map((element) => {
    if (element.element_id !== draft.elementId) return { ...element };
    let corrected = { ...element };
    for (const entry of draft.entries) corrected = applyNumericParameter(corrected, entry.parameter, entry.proposedValue);
    return corrected;
  });
  const dataset: FieldDatasetV1 = {
    ...session.dataset,
    source_label: `${session.dataset.source_label || "Dataset lapangan"} · P10 kandidat v${draft.version}`,
    network,
    customers: session.dataset.customers.map((item) => ({ ...item })),
    measurements: session.dataset.measurements.map((item) => ({ ...item })),
    ami: session.dataset.ami.map((item) => ({ ...item })),
  };
  const report = validateFieldDataset(dataset);
  const topology = buildFieldTopology(dataset);
  const fieldImport: FieldDatasetImport = {
    dataset,
    report,
    filenames: [...session.filenames],
  };
  return {
    dataset,
    fieldImport,
    topologySupported: topology.supported,
    topologyReason: topology.reason ?? null,
  };
}

export function decorateFieldCorrectionResult(
  result: FieldDatasetResult,
  session: FieldOperationalSession,
  draft: FieldCorrectionDraft,
): FieldDatasetResult {
  const corrections = draft.entries
    .map((entry) => `${entry.parameter}:${entry.beforeValue}->${entry.proposedValue}`)
    .join(";");
  return {
    ...result,
    provenance: {
      ...result.provenance,
      p10_correction_version: String(draft.version),
      p10_correction_element: draft.elementId,
      p10_corrections: corrections,
      p10_baseline_activated_at: session.activatedAt,
      p10_policy: "explicit verified draft; original imported CSV not overwritten",
    },
  };
}

export function deriveFieldCorrectionComparison(
  baseline: FieldOperationalSession,
  candidateResult: FieldDatasetResult,
  draft: FieldCorrectionDraft,
): FieldCorrectionComparison {
  const before = baseline.result as P5FieldDatasetResult;
  const after = candidateResult as P5FieldDatasetResult;
  const beforeAsset = before.assets?.find((item) => item.element_id === draft.elementId) ?? null;
  const afterAsset = after.assets?.find((item) => item.element_id === draft.elementId) ?? null;
  const beforeRank = rankOf(before, draft.elementId);
  const afterRank = rankOf(after, draft.elementId);

  return {
    elementId: draft.elementId,
    draftVersion: draft.version,
    gatePass: candidateResult.gate.pass,
    networkMetrics: [
      metric("network-loss", "Susut teknis", before.summary.technical_loss_kwh, after.summary.technical_loss_kwh, "kWh/hari", 3),
      metric("network-rate", "Rasio susut", before.summary.loss_rate_percent, after.summary.loss_rate_percent, "%", 3),
      metric("network-voltage", "Tegangan minimum", before.summary.min_voltage_pu, after.summary.min_voltage_pu, "pu", 4),
      metric("network-loading", "Loading maksimum", before.summary.max_loading_percent, after.summary.max_loading_percent, "%", 2),
    ],
    assetMetrics: [
      metric("asset-loss", "Susut aset", beforeAsset?.loss_kwh ?? null, afterAsset?.loss_kwh ?? null, "kWh/hari", 4),
      metric("asset-loading", "Loading aset", beforeAsset?.max_loading_percent ?? null, afterAsset?.max_loading_percent ?? null, "%", 2),
      metric("asset-voltage", "V endpoint min", beforeAsset?.min_endpoint_voltage_pu ?? null, afterAsset?.min_endpoint_voltage_pu ?? null, "pu", 4),
      metric("asset-rank", "Ranking P7", beforeRank, afterRank, "#", 0),
    ],
    beforePeakTime: beforeAsset?.peak_time ?? before.summary.peak_time ?? null,
    afterPeakTime: afterAsset?.peak_time ?? after.summary.peak_time ?? null,
    beforeRank,
    afterRank,
  };
}

function rankOf(result: P5FieldDatasetResult, elementId: string) {
  const priority = deriveFieldAssetPriorities(result.assets ?? []).find((item) => item.elementId === elementId);
  return priority?.rank ?? null;
}

function metric(
  key: string,
  label: string,
  before: number | null,
  after: number | null,
  unit: string,
  digits: number,
): FieldCorrectionComparisonMetric {
  return {
    key,
    label,
    before,
    after,
    delta: before == null || after == null ? null : after - before,
    unit,
    digits,
  };
}

function numericParameterValue(element: FieldNetworkElement, parameter: FieldCorrectionParameter) {
  switch (parameter) {
    case "length_km": return element.length_km;
    case "r_ohm_per_km": return element.r_ohm_per_km;
    case "x_ohm_per_km": return element.x_ohm_per_km;
    case "r0_ohm_per_km": return element.r0_ohm_per_km;
    case "x0_ohm_per_km": return element.x0_ohm_per_km;
    case "max_i_ka": return element.max_i_ka;
    case "rated_kva": return element.rated_kva;
    case "vk_percent": return element.vk_percent;
    case "vkr_percent": return element.vkr_percent;
    case "vk0_percent": return element.vk0_percent;
    case "vkr0_percent": return element.vkr0_percent;
    case "pfe_kw": return element.pfe_kw;
    case "i0_percent": return element.i0_percent;
  }
}

function applyNumericParameter(
  element: FieldNetworkElement,
  parameter: FieldCorrectionParameter,
  value: number,
): FieldNetworkElement {
  switch (parameter) {
    case "length_km": return { ...element, length_km: value };
    case "r_ohm_per_km": return { ...element, r_ohm_per_km: value };
    case "x_ohm_per_km": return { ...element, x_ohm_per_km: value };
    case "r0_ohm_per_km": return { ...element, r0_ohm_per_km: value };
    case "x0_ohm_per_km": return { ...element, x0_ohm_per_km: value };
    case "max_i_ka": return { ...element, max_i_ka: value };
    case "rated_kva": return { ...element, rated_kva: value };
    case "vk_percent": return { ...element, vk_percent: value };
    case "vkr_percent": return { ...element, vkr_percent: value };
    case "vk0_percent": return { ...element, vk0_percent: value };
    case "vkr0_percent": return { ...element, vkr0_percent: value };
    case "pfe_kw": return { ...element, pfe_kw: value };
    case "i0_percent": return { ...element, i0_percent: value };
  }
}

import type { P5FieldDatasetResult } from "./fieldAsset";
import type { FieldInvestigationPlan } from "./fieldInvestigation";
import type { FieldOperationalSession } from "./fieldOperational";

export type FieldMeasurementSide = "FROM" | "TO";
export type FieldMeasurementSignalStatus = "MATCH" | "DISCREPANCY" | "MISSING" | "UNAVAILABLE";
export type FieldMeasurementStatus = "MATCH" | "DISCREPANCY" | "INCOMPLETE";

/** Cockpit reconciliation tolerances, not protection/standards limits. */
export const FIELD_LOADING_RECONCILIATION_TOLERANCE_POINTS = 10;
export const FIELD_VOLTAGE_RECONCILIATION_TOLERANCE_PERCENT = 2;

export interface FieldMeasurementRecord {
  elementId: string;
  time: string;
  side: FieldMeasurementSide;
  currentA: number | null;
  voltageKv: number | null;
  reference: string;
}

export interface FieldMeasurementContext {
  elementId: string;
  elementType: "line" | "transformer";
  time: string;
  side: FieldMeasurementSide;
  busId: string;
  nominalKv: number | null;
  ratedCurrentA: number | null;
  modelLoadingPercent: number | null;
  modelEquivalentCurrentA: number | null;
  modelVoltagePu: number | null;
  modelVoltageKv: number | null;
}

export interface FieldMeasurementSignalResult {
  status: FieldMeasurementSignalStatus;
  modelValue: number | null;
  measuredValue: number | null;
  difference: number | null;
  tolerance: number;
}

export interface FieldMeasurementReconciliation {
  status: FieldMeasurementStatus;
  loading: FieldMeasurementSignalResult;
  voltage: FieldMeasurementSignalResult;
  measuredLoadingPercent: number | null;
  measuredVoltagePu: number | null;
  summary: string;
  reviewHints: string[];
}

export function fieldMeasurementRecordKey(elementId: string, time: string, side: FieldMeasurementSide) {
  return `${elementId}|${time}|${side}`;
}

export function fieldMeasurementIntervals(session: FieldOperationalSession, elementId: string) {
  const result = session.result as P5FieldDatasetResult;
  return (result.asset_series?.[elementId] ?? []).map((point) => point.time);
}

export function deriveFieldMeasurementContext(
  session: FieldOperationalSession,
  plan: FieldInvestigationPlan | null,
  time: string,
  side: FieldMeasurementSide,
): FieldMeasurementContext | null {
  if (!plan) return null;
  const result = session.result as P5FieldDatasetResult;
  const point = (result.asset_series?.[plan.elementId] ?? []).find((item) => item.time === time);
  const element = session.dataset.network.find((item) => item.element_id === plan.elementId);
  if (!point || !element || (element.element_type !== "line" && element.element_type !== "transformer")) return null;

  const nominalKv = finiteOrNull(side === "FROM" ? element.from_kv : element.to_kv);
  const modelVoltagePu = finiteOrNull(side === "FROM" ? point.from_vm_min_pu : point.to_vm_min_pu);
  const modelLoadingPercent = finiteOrNull(point.loading_percent);
  const ratedCurrentA = deriveRatedCurrentA(element, nominalKv);

  return {
    elementId: plan.elementId,
    elementType: plan.elementType,
    time,
    side,
    busId: side === "FROM" ? plan.fromBus : plan.toBus,
    nominalKv,
    ratedCurrentA,
    modelLoadingPercent,
    modelEquivalentCurrentA: ratedCurrentA != null && modelLoadingPercent != null
      ? ratedCurrentA * modelLoadingPercent / 100
      : null,
    modelVoltagePu,
    modelVoltageKv: nominalKv != null && modelVoltagePu != null ? nominalKv * modelVoltagePu : null,
  };
}

export function reconcileFieldMeasurement(
  context: FieldMeasurementContext | null,
  record: FieldMeasurementRecord | null,
): FieldMeasurementReconciliation | null {
  if (!context) return null;

  const currentA = positiveOrNull(record?.currentA);
  const voltageKv = positiveOrNull(record?.voltageKv);
  const measuredLoadingPercent = currentA != null && context.ratedCurrentA != null && context.ratedCurrentA > 0
    ? currentA / context.ratedCurrentA * 100
    : null;
  const measuredVoltagePu = voltageKv != null && context.nominalKv != null && context.nominalKv > 0
    ? voltageKv / context.nominalKv
    : null;

  const loading = reconcileSignal(
    context.modelLoadingPercent,
    measuredLoadingPercent,
    FIELD_LOADING_RECONCILIATION_TOLERANCE_POINTS,
  );
  const voltage = reconcileSignal(
    context.modelVoltagePu == null ? null : context.modelVoltagePu * 100,
    measuredVoltagePu == null ? null : measuredVoltagePu * 100,
    FIELD_VOLTAGE_RECONCILIATION_TOLERANCE_PERCENT,
  );

  const statuses = [loading.status, voltage.status];
  const status: FieldMeasurementStatus = statuses.includes("DISCREPANCY")
    ? "DISCREPANCY"
    : statuses.every((value) => value === "MATCH")
      ? "MATCH"
      : "INCOMPLETE";

  return {
    status,
    loading,
    voltage,
    measuredLoadingPercent,
    measuredVoltagePu,
    summary: reconciliationSummary(status, loading, voltage),
    reviewHints: buildReviewHints(status, loading, voltage, context.elementType),
  };
}

function deriveRatedCurrentA(
  element: FieldOperationalSession["dataset"]["network"][number],
  nominalKv: number | null,
) {
  if (element.element_type === "line") {
    const maxKa = finiteOrNull(element.max_i_ka);
    return maxKa == null || maxKa <= 0 ? null : maxKa * 1000;
  }
  if (element.element_type === "transformer") {
    const kva = finiteOrNull(element.rated_kva);
    if (kva == null || kva <= 0 || nominalKv == null || nominalKv <= 0) return null;
    return kva / (Math.sqrt(3) * nominalKv);
  }
  return null;
}

function reconcileSignal(model: number | null, measured: number | null, tolerance: number): FieldMeasurementSignalResult {
  if (model == null) {
    return { status: "UNAVAILABLE", modelValue: null, measuredValue: measured, difference: null, tolerance };
  }
  if (measured == null) {
    return { status: "MISSING", modelValue: model, measuredValue: null, difference: null, tolerance };
  }
  const difference = measured - model;
  return {
    status: Math.abs(difference) <= tolerance ? "MATCH" : "DISCREPANCY",
    modelValue: model,
    measuredValue: measured,
    difference,
    tolerance,
  };
}

function reconciliationSummary(
  status: FieldMeasurementStatus,
  loading: FieldMeasurementSignalResult,
  voltage: FieldMeasurementSignalResult,
) {
  if (status === "MATCH") {
    return "Loading turunan dari arus ukur dan tegangan lapangan berada dalam ambang rekonsiliasi terhadap model pada interval dan sisi ukur yang sama.";
  }
  if (status === "DISCREPANCY") {
    const labels = [
      loading.status === "DISCREPANCY" ? "loading" : null,
      voltage.status === "DISCREPANCY" ? "tegangan" : null,
    ].filter((value): value is string => Boolean(value));
    return `Terdapat selisih ${labels.join(" dan ")} terhadap model. Tinjau data sumber sebelum menghitung ulang; P9 tidak mengubah parameter otomatis.`;
  }
  return "Masukkan arus dan tegangan hasil ukur pada interval dan sisi yang sama untuk menyelesaikan rekonsiliasi model vs lapangan.";
}

function buildReviewHints(
  status: FieldMeasurementStatus,
  loading: FieldMeasurementSignalResult,
  voltage: FieldMeasurementSignalResult,
  elementType: "line" | "transformer",
) {
  if (status === "MATCH") {
    return [
      "Pertahankan hasil ukur sebagai evidence verifikasi; jangan menulis ulang parameter model tanpa bukti tambahan.",
      "Lanjutkan checklist P8 dan dokumentasikan alat/titik ukur bila diperlukan.",
    ];
  }
  if (status === "INCOMPLETE") {
    return ["Lengkapi kedua sinyal pada interval dan sisi ukur yang sama agar perbandingan tidak mencampur kondisi operasi."];
  }

  const hints: string[] = [];
  if (loading.status === "DISCREPANCY") {
    hints.push(elementType === "transformer"
      ? "Tinjau rated kVA/tegangan sisi trafo, mapping beban AMI, dan alignment interval terhadap pengukuran arus."
      : "Tinjau max_i_ka/rating saluran, mapping beban AMI, dan alignment interval terhadap pengukuran arus.");
  }
  if (voltage.status === "DISCREPANCY") {
    hints.push(elementType === "transformer"
      ? "Tinjau rasio tegangan/nameplate, posisi tap yang tercatat, tegangan upstream, dan titik ukur endpoint."
      : "Tinjau tegangan sumber/upstream, parameter impedansi saluran, dan titik ukur endpoint.");
  }
  hints.push("Koreksi hanya data sumber yang terverifikasi, lalu jalankan ulang solver; hasil P9 tidak mengkalibrasi model secara otomatis.");
  return hints;
}

function finiteOrNull(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value : null;
}

function positiveOrNull(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

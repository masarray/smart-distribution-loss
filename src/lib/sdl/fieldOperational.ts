import { useSyncExternalStore } from "react";
import type { OperatorDecision } from "./decision";
import type { ConfidenceLevel, OperationalMetrics, QualityMetric } from "./operation";
import {
  FIELD_INTERVALS,
  type FieldDatasetImport,
  type FieldDatasetResult,
  type FieldDatasetV1,
  type FieldDatasetValidationReport,
} from "./fieldDataset";

export interface FieldOperationalSession {
  dataset: FieldDatasetV1;
  report: FieldDatasetValidationReport;
  result: FieldDatasetResult;
  filenames: string[];
  activatedAt: string;
}

let activeSession: FieldOperationalSession | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function subscribeFieldOperational(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFieldOperationalSession() {
  return activeSession;
}

export function useFieldOperationalSession() {
  return useSyncExternalStore(subscribeFieldOperational, getFieldOperationalSession, () => null);
}

export function createFieldOperationalSession(
  fieldImport: FieldDatasetImport | null,
  result: FieldDatasetResult | null,
): FieldOperationalSession | null {
  if (!fieldImport?.dataset || !fieldImport.report.valid || !fieldImport.report.solverReady || !result) return null;
  if (!result.gate.pass || result.series.length !== FIELD_INTERVALS) return null;
  if (result.dataset_schema !== fieldImport.dataset.schema || result.dataset_mode !== "field_import") return null;
  return {
    dataset: fieldImport.dataset,
    report: fieldImport.report,
    result,
    filenames: [...fieldImport.filenames],
    activatedAt: new Date().toISOString(),
  };
}

export function activateFieldOperational(session: FieldOperationalSession) {
  activeSession = session;
  emitChange();
}

export function clearFieldOperational() {
  if (!activeSession) return;
  activeSession = null;
  emitChange();
}

export function openDatasetManager() {
  window.dispatchEvent(new CustomEvent("sdl-open-dataset-manager"));
}

export function deriveFieldOperationalMetrics(session: FieldOperationalSession): OperationalMetrics {
  const { report, result } = session;
  const summary = report.summary;
  const solvedPercent = clampPercent((result.series.length / FIELD_INTERVALS) * 100);
  const checksPercent = result.checks.length
    ? clampPercent((result.checks.filter((check) => check.pass).length / result.checks.length) * 100)
    : 0;
  const qualityRows: QualityMetric[] = [
    { label: "Cakupan AMI", percent: clampPercent(summary.amiCoveragePercent) },
    { label: "Data sumber", percent: clampPercent(summary.sourceMeasurementCoveragePercent) },
    { label: "Interval dihitung", percent: solvedPercent },
    { label: "Pemeriksaan teknis", percent: checksPercent },
  ];
  const qualityIssueCount = qualityRows.filter((row) => row.percent < 85).length;
  const minimumQuality = Math.min(...qualityRows.map((row) => row.percent));
  const confidence: ConfidenceLevel = !result.gate.pass
    ? "REVIEW"
    : minimumQuality >= 95
      ? "HIGH"
      : minimumQuality >= 85
        ? "MEDIUM"
        : "LOW";
  const status = !result.gate.pass ? "REVIEW" : qualityIssueCount > 0 ? "ATTENTION" : "NORMAL";

  return {
    qualityLabel: "Data lapangan aktif",
    qualityRows,
    qualityIssueCount,
    confidence,
    confidenceBasis: "Berdasarkan validasi CSV, kelengkapan 96 interval, pengukuran sumber, dan pemeriksaan aliran daya 3 fasa.",
    sourceEnergyKwh: result.summary.supplied_energy_kwh,
    lossRatePercent: result.summary.loss_rate_percent,
    status,
    statusReason:
      status === "NORMAL"
        ? "Dataset valid, 96 interval selesai, dan pemeriksaan teknis lulus."
        : status === "ATTENTION"
          ? "Hasil tersedia, tetapi satu atau lebih coverage data masih perlu perhatian."
          : "Hasil lapangan belum memenuhi pemeriksaan teknis.",
  };
}

export function deriveFieldOperatorDecision(
  session: FieldOperationalSession,
  metrics: OperationalMetrics,
): OperatorDecision {
  if (!session.result.gate.pass || metrics.status === "REVIEW") {
    const failed = session.result.checks.find((check) => !check.pass);
    return {
      status: "REVIEW",
      source: "gate",
      headline: "Hasil lapangan perlu ditinjau",
      reason: failed ? fieldCheckReason(failed.name) : "Satu atau lebih pemeriksaan teknis belum lulus.",
      evidence: failed?.detail ?? session.result.gate.summary,
      action: "Periksa dataset dan parameter jaringan, lalu jalankan kembali perhitungan sebelum mengaktifkan hasil di cockpit.",
    };
  }

  const weak = [...metrics.qualityRows]
    .filter((row) => Number.isFinite(row.percent) && row.percent < 85)
    .sort((a, b) => a.percent - b.percent)[0];

  if (metrics.status === "ATTENTION" && weak) {
    return {
      status: "ATTENTION",
      source: "quality",
      headline: "Coverage data membatasi keyakinan hasil",
      reason: `${weak.label} ${formatPercent(weak.percent)} menjadi coverage terendah pada dataset aktif.`,
      evidence: `${weak.label} ${formatPercent(weak.percent)}`,
      action: fieldQualityAction(weak.label),
    };
  }

  return {
    status: "NORMAL",
    source: "normal",
    headline: "Data lapangan siap digunakan",
    reason: "Dataset lolos validasi, seluruh 96 interval selesai dihitung, dan pemeriksaan teknis lulus.",
    evidence: `AMI ${formatPercent(session.report.summary.amiCoveragePercent)} · data sumber ${formatPercent(session.report.summary.sourceMeasurementCoveragePercent)}`,
    action: "Tinjau puncak susut, tegangan minimum, dan loading maksimum sebelum menentukan tindak lanjut lapangan.",
  };
}

export function fieldSourceTitle(session: FieldOperationalSession) {
  return session.dataset.source_label?.trim() || "Dataset lapangan";
}

export function fieldSourceVoltageLabel(session: FieldOperationalSession) {
  const source = session.dataset.network.find((item) => item.element_type === "source");
  const kv = source?.to_kv ?? source?.from_kv;
  return kv != null && Number.isFinite(kv) ? `${kv.toFixed(kv >= 10 ? 0 : 1)} kV` : "Lapangan";
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function formatPercent(value: number) {
  return `${clampPercent(value).toFixed(1).replace(".", ",")}%`;
}

function fieldCheckReason(name: string) {
  const value = name.toLowerCase();
  if (value.includes("converged")) return "Sebagian interval belum berhasil diselesaikan oleh aliran daya 3 fasa.";
  if (value.includes("technical loss")) return "Nilai susut teknis belum memenuhi pemeriksaan plausibilitas.";
  if (value.includes("voltage")) return "Hasil tegangan belum memenuhi pemeriksaan numerik yang dipersyaratkan.";
  if (value.includes("balance")) return "Keseimbangan energi sumber, beban, dan susut belum konsisten.";
  return "Satu pemeriksaan teknis pada hasil lapangan belum lulus.";
}

function fieldQualityAction(label: string) {
  const value = label.toLowerCase();
  if (value.includes("ami")) return "Lengkapi interval AMI yang hilang, lalu hitung ulang dataset sebelum memakai hasil untuk tindakan lapangan.";
  if (value.includes("sumber")) return "Lengkapi pengukuran daya sumber agar hasil dapat dibandingkan dengan data feeder aktual.";
  if (value.includes("interval")) return "Pastikan seluruh 96 interval dapat dihitung sebelum menggunakan hasil untuk keputusan lapangan.";
  return "Tinjau pemeriksaan teknis yang belum lulus dan koreksi data atau parameter terkait.";
}

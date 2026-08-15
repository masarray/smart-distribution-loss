import type { AssetId } from "./derive";
import {
  PRESET_PROFILE,
  type LossSeriesPoint,
  type P3Result,
  type Preset,
  type SeriesPoint,
  type SpotDemo,
  type TmDemo,
} from "./types";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "REVIEW";
export type AnalysisStatus = "NORMAL" | "ATTENTION" | "REVIEW" | "PENDING";

export interface QualityMetric {
  label: string;
  percent: number;
  detail?: string;
}

export interface OperationalMetrics {
  qualityLabel: string;
  qualityRows: QualityMetric[];
  qualityIssueCount: number;
  confidence: ConfidenceLevel;
  confidenceBasis: string;
  sourceEnergyKwh: number | null;
  lossRatePercent: number | null;
  status: AnalysisStatus;
  statusReason: string;
}

export interface LossSeriesSummary {
  peakSmartKw: number | null;
  peakConventionalKw: number | null;
  peakTime: string | null;
  deltaAtPeakKw: number | null;
  averageSmartKw: number | null;
  worstTime: string | null;
  worstSmartKw: number | null;
  worstConventionalKw: number | null;
  worstDeltaKw: number | null;
}

function numericObservation(demo: SpotDemo | TmDemo | null, key: string, fallback = 100) {
  const raw = demo?.observability?.[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function integrateObservedEnergy(series: SeriesPoint[] | undefined) {
  if (!series?.length) return null;
  let total = 0;
  let valid = 0;
  for (const point of series) {
    const value = Number(point.observed_source_kw);
    if (!Number.isFinite(value)) continue;
    total += Math.max(value, 0) * 0.25;
    valid += 1;
  }
  return valid === 96 && total > 0 ? total : null;
}

function presetConfidence(preset: Preset): Exclude<ConfidenceLevel, "REVIEW"> {
  if (preset === "good") return "HIGH";
  if (preset === "typical") return "MEDIUM";
  return "LOW";
}

function hasFailedGate(assetId: AssetId, result: P3Result | null, spot: SpotDemo | null, tm: TmDemo | null) {
  if (assetId === "spot") return spot != null && !spot.gate.pass;
  if (assetId === "tm") return tm != null && !tm.gate.pass;
  if (assetId === "gd") return result != null && !result.gate.pass;
  return Boolean(
    (result != null && !result.gate.pass) ||
      (spot != null && !spot.gate.pass) ||
      (tm != null && !tm.gate.pass),
  );
}

function deriveStatus(
  calculated: boolean,
  failedGate: boolean,
  confidence: ConfidenceLevel,
  qualityIssueCount: number,
): Pick<OperationalMetrics, "status" | "statusReason"> {
  if (!calculated) {
    return { status: "PENDING", statusReason: "Menunggu hasil simulasi." };
  }
  if (failedGate || confidence === "REVIEW") {
    return { status: "REVIEW", statusReason: "Engineering gate memerlukan review." };
  }
  if (confidence === "LOW" || qualityIssueCount >= 2) {
    return {
      status: "ATTENTION",
      statusReason: "Hasil tersedia, tetapi kualitas input perlu perhatian.",
    };
  }
  return { status: "NORMAL", statusReason: "Gate lulus dan kualitas input memadai." };
}

export function summarizeLossSeries(
  series: Array<LossSeriesPoint | SeriesPoint> | undefined,
): LossSeriesSummary {
  const empty: LossSeriesSummary = {
    peakSmartKw: null,
    peakConventionalKw: null,
    peakTime: null,
    deltaAtPeakKw: null,
    averageSmartKw: null,
    worstTime: null,
    worstSmartKw: null,
    worstConventionalKw: null,
    worstDeltaKw: null,
  };

  if (!series?.length) return empty;

  let peak: LossSeriesPoint | SeriesPoint | null = null;
  let worst: LossSeriesPoint | SeriesPoint | null = null;
  let worstAbsDelta = -1;
  let smartTotal = 0;
  let valid = 0;

  for (const point of series) {
    const smart = Number(point.smart_loss_kw);
    const conventional = Number(point.conventional_loss_kw);
    if (!Number.isFinite(smart)) continue;

    smartTotal += smart;
    valid += 1;
    if (peak == null || smart > Number(peak.smart_loss_kw)) peak = point;

    if (Number.isFinite(conventional)) {
      const absDelta = Math.abs(smart - conventional);
      if (absDelta > worstAbsDelta) {
        worstAbsDelta = absDelta;
        worst = point;
      }
    }
  }

  if (!peak || valid === 0) return empty;

  const peakSmartKw = Number(peak.smart_loss_kw);
  const peakConventionalKw = Number(peak.conventional_loss_kw);
  const worstSmartKw = worst ? Number(worst.smart_loss_kw) : null;
  const worstConventionalKw = worst ? Number(worst.conventional_loss_kw) : null;

  return {
    peakSmartKw,
    peakConventionalKw: Number.isFinite(peakConventionalKw) ? peakConventionalKw : null,
    peakTime: peak.time,
    deltaAtPeakKw: Number.isFinite(peakConventionalKw) ? peakSmartKw - peakConventionalKw : null,
    averageSmartKw: smartTotal / valid,
    worstTime: worst?.time ?? null,
    worstSmartKw: worstSmartKw != null && Number.isFinite(worstSmartKw) ? worstSmartKw : null,
    worstConventionalKw:
      worstConventionalKw != null && Number.isFinite(worstConventionalKw) ? worstConventionalKw : null,
    worstDeltaKw:
      worstSmartKw != null &&
      worstConventionalKw != null &&
      Number.isFinite(worstSmartKw) &&
      Number.isFinite(worstConventionalKw)
        ? worstSmartKw - worstConventionalKw
        : null,
  };
}

export function deriveOperationalMetrics(
  assetId: AssetId,
  preset: Preset,
  result: P3Result | null,
  spot: SpotDemo | null,
  tm: TmDemo | null,
  smartLossKwh: number | null | undefined,
): OperationalMetrics {
  const profile = PRESET_PROFILE[preset];
  let qualityLabel = profile.label;
  let qualityRows: QualityMetric[] = [];
  let confidence: ConfidenceLevel = presetConfidence(preset);
  let confidenceBasis = "Berdasarkan coverage input preset dan engineering gate.";
  let sourceEnergyKwh: number | null = null;

  if (assetId === "spot") {
    qualityLabel = "High-observability MV reference";
    qualityRows = [
      { label: "Load P/Q", percent: numericObservation(spot, "load_pq_percent") },
      { label: "Fasa", percent: numericObservation(spot, "phase_percent") },
      { label: "Topologi", percent: numericObservation(spot, "topology_percent") },
      { label: "Timing", percent: numericObservation(spot, "timing_percent") },
    ];
    confidence = "HIGH";
    confidenceBasis = "P/Q, fasa, topologi, mapping dan timing terobservasi penuh pada skenario Referensi TM.";
    sourceEnergyKwh = integrateObservedEnergy(spot?.series);
  } else if (assetId === "tm") {
    qualityLabel = "High-observability dedicated TM";
    qualityRows = [
      { label: "Load P/Q", percent: numericObservation(tm, "load_pq_percent") },
      { label: "Fasa", percent: numericObservation(tm, "phase_percent") },
      { label: "Topologi", percent: numericObservation(tm, "topology_percent") },
      { label: "Timing", percent: numericObservation(tm, "timing_percent") },
    ];
    confidence = "HIGH";
    confidenceBasis = "Pelanggan TM memakai measurement channel dan dedicated feeder model yang independen.";
    sourceEnergyKwh = integrateObservedEnergy(tm?.series);
  } else if (assetId === "gd") {
    qualityRows = [
      { label: "AMI coverage", percent: profile.ami },
      { label: "Fasa diketahui", percent: profile.phase },
      { label: "PF diketahui", percent: profile.pf },
      { label: "Mapping benar", percent: profile.mapping },
    ];
    confidenceBasis = `${profile.label}: confidence mengikuti coverage field-like input; final gate dapat menurunkannya menjadi REVIEW.`;
    sourceEnergyKwh = integrateObservedEnergy(result?.series);
  } else {
    qualityLabel = "Mixed child data";
    qualityRows = [
      { label: "Kanal MV", percent: 100, detail: "Referensi TM + Pelanggan TM" },
      { label: "AMI GD-01", percent: profile.ami },
      { label: "Fasa GD-01", percent: profile.phase },
      { label: "Mapping GD-01", percent: profile.mapping },
    ];
    confidenceBasis = "Penyulang 20 kV mengikuti weakest-child confidence karena GD-01 membawa degraded field-like input.";
    const childEnergy = [
      integrateObservedEnergy(spot?.series),
      integrateObservedEnergy(tm?.series),
      integrateObservedEnergy(result?.series),
    ];
    sourceEnergyKwh = childEnergy.every((value) => value != null)
      ? childEnergy.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null;
  }

  const failedGate = hasFailedGate(assetId, result, spot, tm);
  if (failedGate) confidence = "REVIEW";

  const qualityIssueCount = qualityRows.filter((row) => row.percent < 85).length;
  const lossRatePercent =
    sourceEnergyKwh != null && smartLossKwh != null && Number.isFinite(smartLossKwh) && sourceEnergyKwh > 0
      ? (smartLossKwh / sourceEnergyKwh) * 100
      : null;
  const status = deriveStatus(
    smartLossKwh != null && Number.isFinite(smartLossKwh),
    failedGate,
    confidence,
    qualityIssueCount,
  );

  return {
    qualityLabel,
    qualityRows,
    qualityIssueCount,
    confidence,
    confidenceBasis,
    sourceEnergyKwh,
    lossRatePercent,
    ...status,
  };
}

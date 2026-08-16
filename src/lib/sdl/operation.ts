import type { AssetId } from "./derive";
import {
  PRESET_PROFILE,
  type CheckItem,
  type LossSeriesPoint,
  type P3Result,
  type Preset,
  type SeriesPoint,
  type SpotDemo,
  type TmDemo,
} from "./types";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "REVIEW";
export type AnalysisStatus = "NORMAL" | "ATTENTION" | "REVIEW" | "PENDING";
export type OperatorDecisionSource = "pending" | "gate" | "quality" | "normal";

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

export interface OperatorDecision {
  status: AnalysisStatus;
  source: OperatorDecisionSource;
  headline: string;
  reason: string;
  evidence: string | null;
  action: string;
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

export function deriveOperatorDecision(
  assetId: AssetId,
  metrics: OperationalMetrics,
  result: P3Result | null,
  spot: SpotDemo | null,
  tm: TmDemo | null,
): OperatorDecision {
  if (metrics.status === "PENDING") {
    return {
      status: "PENDING",
      source: "pending",
      headline: "Belum ada hasil untuk dinilai",
      reason: "Decision layer aktif setelah simulasi menghasilkan evidence untuk aset terpilih.",
      evidence: null,
      action: "Jalankan simulasi untuk membentuk rekomendasi operasional.",
    };
  }

  if (metrics.status === "REVIEW") {
    const failed = firstFailedCheck(assetId, result, spot, tm);
    if (failed) return decisionFromFailedCheck(failed.assetLabel, failed.check);

    const unresolved = firstUnresolved(assetId, result);
    if (unresolved) return decisionFromUnresolved(unresolved.parameter, unresolved.reason);

    return {
      status: "REVIEW",
      source: "gate",
      headline: "Hasil memerlukan tinjauan engineering",
      reason: "Satu atau lebih engineering gate belum memenuhi kriteria penerimaan.",
      evidence: metrics.statusReason,
      action: "Buka Detail teknis dan selesaikan pemeriksaan yang belum lulus sebelum memakai hasil untuk keputusan lapangan.",
    };
  }

  const lowQuality = [...metrics.qualityRows]
    .filter((row) => Number.isFinite(row.percent) && row.percent < 85)
    .sort((a, b) => a.percent - b.percent);

  if (metrics.status === "ATTENTION") {
    const primary = lowQuality[0] ?? metrics.qualityRows[0];
    const secondary = lowQuality[1];
    const primaryLabel = plainQualityMetricLabel(primary?.label ?? "Data input");
    const secondaryText = secondary
      ? `; ${plainQualityMetricLabel(secondary.label)} ${formatPercent(secondary.percent)}`
      : "";

    return {
      status: "ATTENTION",
      source: "quality",
      headline: "Kualitas input membatasi keyakinan hasil",
      reason: primary
        ? `${primaryLabel} ${formatPercent(primary.percent)}${secondaryText} menjadi batas utama kualitas data aset ini.`
        : "Kualitas input belum cukup kuat untuk keputusan lapangan tanpa verifikasi tambahan.",
      evidence: primary ? `${primaryLabel} ${formatPercent(primary.percent)}` : metrics.statusReason,
      action: qualityAction(primary?.label),
    };
  }

  const lowest = [...metrics.qualityRows]
    .filter((row) => Number.isFinite(row.percent))
    .sort((a, b) => a.percent - b.percent)[0];

  return {
    status: "NORMAL",
    source: "normal",
    headline: "Tidak ada isu utama pada aset ini",
    reason: "Engineering gate lulus dan kualitas input cukup untuk membaca hasil operasional.",
    evidence: lowest
      ? `Kualitas input terendah: ${plainQualityMetricLabel(lowest.label)} ${formatPercent(lowest.percent)}`
      : "Engineering gate lulus.",
    action: "Lanjutkan review profil susut dan interval puncak; buka Detail teknis hanya bila perlu verifikasi lebih dalam.",
  };
}

function firstFailedCheck(
  assetId: AssetId,
  result: P3Result | null,
  spot: SpotDemo | null,
  tm: TmDemo | null,
): { assetLabel: string; check: CheckItem } | null {
  const groups: Array<{ assetLabel: string; checks: CheckItem[] | undefined }> =
    assetId === "spot"
      ? [{ assetLabel: "Referensi TM", checks: spot?.checks }]
      : assetId === "tm"
        ? [{ assetLabel: "Pelanggan TM", checks: tm?.checks }]
        : assetId === "gd"
          ? [{ assetLabel: "GD-01", checks: result?.checks }]
          : [
              { assetLabel: "Referensi TM", checks: spot?.checks },
              { assetLabel: "Pelanggan TM", checks: tm?.checks },
              { assetLabel: "GD-01", checks: result?.checks },
            ];

  for (const group of groups) {
    const failed = group.checks?.find((check) => !check.pass);
    if (failed) return { assetLabel: group.assetLabel, check: failed };
  }
  return null;
}

function firstUnresolved(assetId: AssetId, result: P3Result | null) {
  if (assetId !== "gd" && assetId !== "feeder") return null;
  return result?.unresolved?.[0] ?? null;
}

function decisionFromFailedCheck(assetLabel: string, check: CheckItem): OperatorDecision {
  const value = check.name.toLowerCase();
  const prefix = assetLabel ? `${assetLabel}: ` : "";

  if (value.includes("converged") || value.includes("power flows")) {
    return reviewDecision(
      "Perhitungan 3 fasa belum lengkap",
      `${prefix}sebagian interval belum berhasil diselesaikan oleh model jaringan.`,
      `${assetLabel} · perhitungan interval`,
      "Periksa topologi dan parameter jaringan di Detail teknis sebelum menggunakan hasil.",
    );
  }
  if (value.includes("voltage")) {
    return reviewDecision(
      "Tegangan model perlu ditinjau",
      `${prefix}hasil tegangan belum memenuhi rentang plausibilitas engineering.`,
      `${assetLabel} · pemeriksaan tegangan`,
      "Verifikasi tegangan, rasio trafo, dan parameter jaringan sebelum melanjutkan keputusan lapangan.",
    );
  }
  if (
    value.includes("hold-out") ||
    value.includes("objective") ||
    value.includes("source-p") ||
    value.includes("phase-p") ||
    value.includes("residual") ||
    value.includes("technical-loss estimate")
  ) {
    return reviewDecision(
      "Kecocokan model belum memenuhi gate",
      `${prefix}kecocokan model terhadap data uji belum cukup kuat.`,
      `${assetLabel} · gate kecocokan model`,
      "Tinjau kualitas pengukuran dan parameter yang disesuaikan di Detail teknis sebelum memakai hasil.",
    );
  }
  if (value.includes("phase assignment")) {
    return reviewDecision(
      "Estimasi fasa perlu ditinjau",
      `${prefix}hasil estimasi fasa belum memenuhi pemeriksaan engineering.`,
      `${assetLabel} · pemeriksaan fasa`,
      "Verifikasi fasa pelanggan yang belum diketahui dan jalankan kembali simulasi.",
    );
  }
  if (value.includes("runtime") || value.includes("budget")) {
    return reviewDecision(
      "Waktu perhitungan melewati target",
      `${prefix}runtime belum memenuhi target operasional yang ditetapkan.`,
      `${assetLabel} · runtime gate`,
      "Tinjau Detail teknis dan ulangi perhitungan setelah kondisi runtime stabil.",
    );
  }
  if (value.includes("independent")) {
    return reviewDecision(
      "Pemisahan data aset perlu ditinjau",
      `${prefix}independensi sumber data belum lolos pemeriksaan.`,
      `${assetLabel} · independensi data`,
      "Periksa sumber pengukuran dan pemetaan aset sebelum memakai hasil gabungan.",
    );
  }
  if (value.includes("ground truth") || value.includes("immutable") || value.includes("verified phase") || value.includes("pf inputs")) {
    return reviewDecision(
      "Integritas data acuan perlu ditinjau",
      `${prefix}pemeriksaan terhadap data acuan atau data terverifikasi belum lulus.`,
      `${assetLabel} · integritas data`,
      "Periksa input yang seharusnya tetap dan jalankan kembali simulasi sebelum menggunakan hasil.",
    );
  }

  return reviewDecision(
    "Engineering gate belum lulus",
    `${prefix}satu pemeriksaan model masih membutuhkan tinjauan.`,
    `${assetLabel} · engineering gate`,
    "Buka Detail teknis, identifikasi pemeriksaan yang gagal, lalu koreksi data atau parameter terkait.",
  );
}

function reviewDecision(headline: string, reason: string, evidence: string, action: string): OperatorDecision {
  return { status: "REVIEW", source: "gate", headline, reason, evidence, action };
}

function decisionFromUnresolved(parameter: string, reason: string): OperatorDecision {
  const value = parameter.toLowerCase();
  if (value.includes("mapping")) {
    return reviewDecision(
      "Pemetaan pelanggan belum cukup pasti",
      "Lokasi pelanggan per cabang belum dapat ditentukan dengan keyakinan yang memadai.",
      "GD-01 · pemetaan pelanggan",
      "Verifikasi pelanggan per cabang atau lengkapi pengukuran cabang sebelum memakai hasil untuk tindakan lapangan.",
    );
  }
  if (value.includes("sr length") || value.includes("service")) {
    return reviewDecision(
      "Panjang sambungan pelanggan belum terverifikasi",
      "Data yang tersedia belum cukup untuk menentukan panjang sambungan pelanggan secara andal.",
      "GD-01 · panjang sambungan",
      "Lengkapi data panjang sambungan atau hasil survei pelanggan yang relevan.",
    );
  }
  if (value.includes("vk") || value.includes("vkr") || value.includes("transformer")) {
    return reviewDecision(
      "Parameter trafo belum cukup kuat",
      "Impedansi trafo belum dapat ditentukan dengan keyakinan yang memadai dari data saat ini.",
      "GD-01 · parameter trafo",
      "Verifikasi nameplate atau data uji trafo sebelum menggunakan hasil untuk keputusan lapangan.",
    );
  }
  return reviewDecision(
    "Parameter jaringan perlu dilengkapi",
    reason || "Masih ada parameter jaringan yang belum cukup dikenali oleh data.",
    `GD-01 · ${parameter}`,
    "Lengkapi parameter jaringan yang ditandai pada Detail teknis dan jalankan kembali simulasi.",
  );
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function plainQualityMetricLabel(label: string) {
  const labels: Record<string, string> = {
    "Load P/Q": "Beban terukur",
    Fasa: "Data fasa",
    Topologi: "Pemetaan jaringan",
    Timing: "Waktu pencatatan",
    "AMI coverage": "Meter tersedia",
    "Fasa diketahui": "Data fasa",
    "PF diketahui": "Faktor daya",
    "Mapping benar": "Pemetaan pelanggan",
    "Kanal MV": "Data pelanggan TM",
    "AMI GD-01": "Meter GD-01",
    "Fasa GD-01": "Data fasa GD-01",
    "Mapping GD-01": "Pemetaan GD-01",
  };
  return labels[label] ?? label;
}

function qualityAction(label: string | undefined) {
  const value = (label ?? "").toLowerCase();
  if (value.includes("pf")) return "Lengkapi atau verifikasi faktor daya pelanggan yang belum diketahui, lalu jalankan kembali simulasi.";
  if (value.includes("fasa")) return "Verifikasi fasa pelanggan yang belum diketahui, lalu jalankan kembali simulasi.";
  if (value.includes("ami") || value.includes("meter")) return "Lengkapi interval meter/AMI yang hilang sebelum menggunakan hasil untuk keputusan lapangan.";
  if (value.includes("mapping")) return "Verifikasi pemetaan pelanggan ke cabang yang benar sebelum menggunakan hasil untuk tindakan lapangan.";
  if (value.includes("timing")) return "Periksa sinkronisasi waktu pencatatan dan koreksi stream yang bergeser.";
  if (value.includes("topologi")) return "Verifikasi topologi jaringan dan koneksi aset sebelum menjalankan ulang simulasi.";
  if (value.includes("load") || value.includes("p/q")) return "Lengkapi pengukuran daya aktif dan reaktif pada interval yang belum terobservasi.";
  return "Perbaiki data dengan coverage terendah terlebih dahulu, lalu jalankan kembali simulasi.";
}

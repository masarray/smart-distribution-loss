import type { FieldOperationalSession } from "./fieldOperational";

export type FieldUnexplainedStatus =
  | "UNAVAILABLE"
  | "NORMAL"
  | "DATA_QUALITY_SUSPECT"
  | "UNEXPLAINED_LOSS"
  | "FIELD_INVESTIGATION_PRIORITY";

export interface FieldUnexplainedInterval {
  index: number;
  time: string;
  measuredSourceKw: number;
  meteredLoadKw: number;
  technicalLossKw: number;
  unexplainedKw: number;
  toleranceKw: number;
  exceedsPositiveTolerance: boolean;
  exceedsNegativeTolerance: boolean;
}

export interface FieldUnexplainedLossReport {
  status: FieldUnexplainedStatus;
  headline: string;
  reason: string;
  action: string;
  sourceElementId: string;
  measurementIntervals: number;
  goodMeasurementIntervals: number;
  badMeasurementIntervals: number;
  measuredSourceEnergyKwh: number;
  meteredEnergyKwh: number;
  frozenTechnicalLossKwh: number;
  fullDayTechnicalLossKwh: number;
  unexplainedEnergyKwh: number;
  positiveUnexplainedEnergyKwh: number;
  overAccountedEnergyKwh: number;
  unexplainedRatePercent: number;
  positiveUnexplainedRatePercent: number;
  positivePersistencePercent: number;
  negativePersistencePercent: number;
  dailyToleranceKwh: number;
  peakPositive: FieldUnexplainedInterval | null;
  peakNegative: FieldUnexplainedInterval | null;
  topPositiveIntervals: FieldUnexplainedInterval[];
  intervals: FieldUnexplainedInterval[];
  policy: {
    equation: "measured_source - metered_ami - frozen_technical_loss";
    calibrationAbsorption: "forbidden";
    theftConclusion: "not_proven";
    localization: "feeder_level_only";
    intervalTolerancePercent: number;
    intervalToleranceFloorKw: number;
    dailyTolerancePercent: number;
    priorityResidualPercent: number;
    priorityPersistencePercent: number;
  };
}

export const P13_INTERVAL_TOLERANCE_PERCENT = 1.0;
export const P13_INTERVAL_TOLERANCE_FLOOR_KW = 0.25;
export const P13_DAILY_TOLERANCE_PERCENT = 1.0;
export const P13_DAILY_TOLERANCE_FLOOR_KWH = 0.5;
export const P13_UNEXPLAINED_PERSISTENCE_PERCENT = 25.0;
export const P13_PRIORITY_RESIDUAL_PERCENT = 5.0;
export const P13_PRIORITY_PERSISTENCE_PERCENT = 50.0;
const INTERVAL_HOURS = 0.25;
const EXPECTED_INTERVALS = 96;

export function deriveFieldUnexplainedLoss(session: FieldOperationalSession): FieldUnexplainedLossReport {
  const source = session.dataset.network.find((item) => item.element_type === "source");
  const sourceElementId = source?.element_id ?? "";
  const qualityByIndex = sourceMeasurementQualityByIndex(session, sourceElementId);
  const intervals = session.result.series
    .filter((point) => point.observed_source_kw != null && Number.isFinite(point.observed_source_kw))
    .map((point): FieldUnexplainedInterval => {
      const measuredSourceKw = Number(point.observed_source_kw);
      const meteredLoadKw = finite(point.load_kw);
      const technicalLossKw = finite(point.technical_loss_kw);
      const unexplainedKw = measuredSourceKw - meteredLoadKw - technicalLossKw;
      const toleranceKw = Math.max(
        P13_INTERVAL_TOLERANCE_FLOOR_KW,
        Math.abs(measuredSourceKw) * P13_INTERVAL_TOLERANCE_PERCENT / 100,
      );
      return {
        index: point.index,
        time: point.time,
        measuredSourceKw,
        meteredLoadKw,
        technicalLossKw,
        unexplainedKw,
        toleranceKw,
        exceedsPositiveTolerance: unexplainedKw > toleranceKw,
        exceedsNegativeTolerance: unexplainedKw < -toleranceKw,
      };
    });

  const measurementIntervals = intervals.length;
  const goodMeasurementIntervals = intervals.filter((point) => qualityByIndex.get(point.index) === "GOOD").length;
  const badMeasurementIntervals = measurementIntervals - goodMeasurementIntervals;
  const measuredSourceEnergyKwh = energy(intervals, (point) => point.measuredSourceKw);
  const meteredEnergyKwh = energy(intervals, (point) => point.meteredLoadKw);
  const frozenTechnicalLossKwh = energy(intervals, (point) => point.technicalLossKw);
  const unexplainedEnergyKwh = energy(intervals, (point) => point.unexplainedKw);
  const positiveUnexplainedEnergyKwh = energy(intervals, (point) => Math.max(point.unexplainedKw, 0));
  const overAccountedEnergyKwh = energy(intervals, (point) => Math.max(-point.unexplainedKw, 0));
  const unexplainedRatePercent = percent(unexplainedEnergyKwh, measuredSourceEnergyKwh);
  const positiveUnexplainedRatePercent = percent(positiveUnexplainedEnergyKwh, measuredSourceEnergyKwh);
  const positiveIntervals = intervals.filter((point) => point.exceedsPositiveTolerance);
  const negativeIntervals = intervals.filter((point) => point.exceedsNegativeTolerance);
  const positivePersistencePercent = percent(positiveIntervals.length, measurementIntervals);
  const negativePersistencePercent = percent(negativeIntervals.length, measurementIntervals);
  const dailyToleranceKwh = Math.max(
    P13_DAILY_TOLERANCE_FLOOR_KWH,
    Math.abs(measuredSourceEnergyKwh) * P13_DAILY_TOLERANCE_PERCENT / 100,
  );
  const peakPositive = [...intervals].sort((a, b) => b.unexplainedKw - a.unexplainedKw)[0] ?? null;
  const peakNegative = [...intervals].sort((a, b) => a.unexplainedKw - b.unexplainedKw)[0] ?? null;
  const topPositiveIntervals = [...positiveIntervals]
    .sort((a, b) => b.unexplainedKw - a.unexplainedKw || a.index - b.index)
    .slice(0, 3);

  const classification = classify({
    measurementIntervals,
    badMeasurementIntervals,
    measuredSourceEnergyKwh,
    unexplainedEnergyKwh,
    positiveUnexplainedRatePercent,
    positivePersistencePercent,
    negativePersistencePercent,
    dailyToleranceKwh,
  });

  return {
    ...classification,
    sourceElementId,
    measurementIntervals,
    goodMeasurementIntervals,
    badMeasurementIntervals,
    measuredSourceEnergyKwh,
    meteredEnergyKwh,
    frozenTechnicalLossKwh,
    fullDayTechnicalLossKwh: finite(session.result.summary.technical_loss_kwh),
    unexplainedEnergyKwh,
    positiveUnexplainedEnergyKwh,
    overAccountedEnergyKwh,
    unexplainedRatePercent,
    positiveUnexplainedRatePercent,
    positivePersistencePercent,
    negativePersistencePercent,
    dailyToleranceKwh,
    peakPositive: peakPositive && peakPositive.unexplainedKw > 0 ? peakPositive : null,
    peakNegative: peakNegative && peakNegative.unexplainedKw < 0 ? peakNegative : null,
    topPositiveIntervals,
    intervals,
    policy: {
      equation: "measured_source - metered_ami - frozen_technical_loss",
      calibrationAbsorption: "forbidden",
      theftConclusion: "not_proven",
      localization: "feeder_level_only",
      intervalTolerancePercent: P13_INTERVAL_TOLERANCE_PERCENT,
      intervalToleranceFloorKw: P13_INTERVAL_TOLERANCE_FLOOR_KW,
      dailyTolerancePercent: P13_DAILY_TOLERANCE_PERCENT,
      priorityResidualPercent: P13_PRIORITY_RESIDUAL_PERCENT,
      priorityPersistencePercent: P13_PRIORITY_PERSISTENCE_PERCENT,
    },
  };
}

function classify(input: {
  measurementIntervals: number;
  badMeasurementIntervals: number;
  measuredSourceEnergyKwh: number;
  unexplainedEnergyKwh: number;
  positiveUnexplainedRatePercent: number;
  positivePersistencePercent: number;
  negativePersistencePercent: number;
  dailyToleranceKwh: number;
}): Pick<FieldUnexplainedLossReport, "status" | "headline" | "reason" | "action"> {
  if (input.measurementIntervals === 0) {
    return {
      status: "UNAVAILABLE",
      headline: "Residual belum dapat dihitung",
      reason: "Tidak ada pengukuran daya aktif source yang sejajar dengan interval physics.",
      action: "Lengkapi measurements.csv pada source untuk 96 interval 15 menit, lalu jalankan ulang dataset.",
    };
  }

  if (
    input.measurementIntervals !== EXPECTED_INTERVALS
    || input.badMeasurementIntervals > 0
    || input.measuredSourceEnergyKwh <= 0
    || input.unexplainedEnergyKwh < -input.dailyToleranceKwh
    || input.negativePersistencePercent >= P13_UNEXPLAINED_PERSISTENCE_PERCENT
  ) {
    return {
      status: "DATA_QUALITY_SUSPECT",
      headline: "Residual perlu verifikasi kualitas data",
      reason: input.measurementIntervals !== EXPECTED_INTERVALS
        ? `Pengukuran source hanya ${input.measurementIntervals}/${EXPECTED_INTERVALS} interval; residual harian belum lengkap.`
        : input.badMeasurementIntervals > 0
          ? `${input.badMeasurementIntervals} interval source tidak berstatus GOOD.`
          : "Energi terukur source lebih rendah daripada AMI + susut teknis secara material/persisten; periksa meter, timestamp, mapping, dan boundary sebelum interpretasi NTL.",
      action: "Validasi sinkronisasi waktu, kualitas meter source/AMI, mapping pelanggan, dan boundary pengukuran. Jangan mengoreksi residual ke technical loss.",
    };
  }

  if (
    input.unexplainedEnergyKwh > input.dailyToleranceKwh
    && input.positiveUnexplainedRatePercent >= P13_PRIORITY_RESIDUAL_PERCENT
    && input.positivePersistencePercent >= P13_PRIORITY_PERSISTENCE_PERCENT
  ) {
    return {
      status: "FIELD_INVESTIGATION_PRIORITY",
      headline: "Unexplained energy persisten · prioritas investigasi",
      reason: `Residual positif ${input.positiveUnexplainedRatePercent.toFixed(2)}% dari energi source dan melampaui tolerance pada ${input.positivePersistencePercent.toFixed(1)}% interval.`,
      action: "Pertahankan technical loss hasil physics, lalu tambah/cek boundary metering downstream untuk mempersempit lokasi residual sebelum inspeksi lapangan.",
    };
  }

  if (
    input.unexplainedEnergyKwh > input.dailyToleranceKwh
    || input.positivePersistencePercent >= P13_UNEXPLAINED_PERSISTENCE_PERCENT
  ) {
    return {
      status: "UNEXPLAINED_LOSS",
      headline: "Unexplained energy terdeteksi",
      reason: `Residual belum terjelaskan sebesar ${input.unexplainedEnergyKwh.toFixed(2)} kWh pada interval source yang tersedia.`,
      action: "Tinjau pola interval residual dan kualitas data. Perlakukan sebagai sinyal investigasi non-technical loss, bukan bukti pencurian.",
    };
  }

  return {
    status: "NORMAL",
    headline: "Residual dalam tolerance rekonsiliasi",
    reason: `Residual bersih berada dalam ±${P13_DAILY_TOLERANCE_PERCENT.toFixed(1)}% energi source (minimum ${P13_DAILY_TOLERANCE_FLOOR_KWH.toFixed(1)} kWh).`,
    action: "Lanjutkan pemantauan. Technical loss tetap berasal dari physics dan residual tidak diserap ke model.",
  };
}

function sourceMeasurementQualityByIndex(session: FieldOperationalSession, sourceElementId: string) {
  const result = new Map<number, string>();
  for (const point of session.dataset.measurements) {
    if (point.asset_id !== sourceElementId || point.measurement_type.toUpperCase() !== "P") continue;
    result.set(point.index, point.quality.toUpperCase() || "UNKNOWN");
  }
  return result;
}

function energy(points: FieldUnexplainedInterval[], selector: (point: FieldUnexplainedInterval) => number) {
  return points.reduce((total, point) => total + selector(point) * INTERVAL_HOURS, 0);
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 && Number.isFinite(numerator) && Number.isFinite(denominator)
    ? numerator / denominator * 100
    : 0;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

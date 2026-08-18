import type { FieldAuditPackageV1, FieldAuditResultSnapshot } from "./fieldAudit";
import type { FieldDatasetResult } from "./fieldDataset";

export type FieldAuditReplayStatus = "MATCH" | "DIFFERENT";

export interface FieldAuditReplayMetric {
  key: string;
  label: string;
  unit: string;
  expected: number | null;
  actual: number | null;
  delta: number | null;
  tolerance: number;
  match: boolean;
}

export interface FieldAuditReplayComparison {
  status: FieldAuditReplayStatus;
  expectedSha256: string;
  replaySha256: string;
  fingerprintMatch: boolean;
  gateMatch: boolean;
  seriesCountMatch: boolean;
  checksMatch: boolean;
  provenanceMatch: boolean;
  summaryShapeMatch: boolean;
  metrics: FieldAuditReplayMetric[];
  replay: FieldAuditResultSnapshot;
}

const NUMERIC_SUMMARY_KEYS = [
  ["technical_loss_kwh", "Susut teknis", "kWh/hari"],
  ["supplied_energy_kwh", "Energi sumber", "kWh/hari"],
  ["load_energy_kwh", "Energi beban", "kWh/hari"],
  ["loss_rate_percent", "Rasio susut", "%"],
  ["peak_loss_kw", "Susut puncak", "kW"],
  ["min_voltage_pu", "Tegangan minimum", "pu"],
  ["max_voltage_pu", "Tegangan maksimum", "pu"],
  ["max_loading_percent", "Loading maksimum", "%"],
  ["max_line_loading_percent", "Loading line maksimum", "%"],
  ["max_transformer_loading_percent", "Loading trafo maksimum", "%"],
  ["source_nrmse_percent", "Source NRMSE", "%"],
] as const;

export async function compareFieldAuditReplay(
  auditPackage: FieldAuditPackageV1,
  rawReplayResult: FieldDatasetResult,
): Promise<FieldAuditReplayComparison> {
  const replayResult = applyAcceptedCorrectionProvenance(rawReplayResult, auditPackage);
  const replay = snapshotReplayResult(replayResult);
  const accepted = auditPackage.accepted.result;
  const replaySha256 = await sha256(stableStringify(replay));
  const expectedSha256 = auditPackage.integrity.acceptedResultSha256;
  const metrics = NUMERIC_SUMMARY_KEYS.map(([key, label, unit]) =>
    metric(key, label, unit, numericSummary(accepted, key), numericSummary(replay, key)),
  );
  const gateMatch = stableStringify(replay.gate) === stableStringify(accepted.gate);
  const seriesCountMatch = replay.seriesCount === accepted.seriesCount;
  const checksMatch = stableStringify(replay.checks) === stableStringify(accepted.checks);
  const provenanceMatch = stableStringify(replay.provenance) === stableStringify(accepted.provenance);
  const summaryShapeMatch = nonNumericSummaryShape(replay) === nonNumericSummaryShape(accepted);
  const fingerprintMatch = replaySha256 === expectedSha256;

  return {
    status:
      fingerprintMatch &&
      gateMatch &&
      seriesCountMatch &&
      checksMatch &&
      provenanceMatch &&
      summaryShapeMatch &&
      metrics.every((item) => item.match)
        ? "MATCH"
        : "DIFFERENT",
    expectedSha256,
    replaySha256,
    fingerprintMatch,
    gateMatch,
    seriesCountMatch,
    checksMatch,
    provenanceMatch,
    summaryShapeMatch,
    metrics,
    replay,
  };
}

export function snapshotReplayResult(result: FieldDatasetResult): FieldAuditResultSnapshot {
  return {
    gate: clone(result.gate),
    summary: clone(result.summary),
    checks: result.checks.map((check) => ({ ...check })),
    provenance: { ...result.provenance },
    seriesCount: result.series.length,
  };
}

function applyAcceptedCorrectionProvenance(
  result: FieldDatasetResult,
  auditPackage: FieldAuditPackageV1,
): FieldDatasetResult {
  const latest = auditPackage.corrections[auditPackage.corrections.length - 1];
  if (!latest) return result;
  const corrections = latest.corrections
    .map((entry) => `${entry.parameter}:${entry.beforeValue}->${entry.proposedValue}`)
    .join(";");
  return {
    ...result,
    provenance: {
      ...result.provenance,
      p10_correction_version: String(latest.draftVersion),
      p10_correction_element: latest.elementId,
      p10_corrections: corrections,
      p10_baseline_activated_at: latest.baselineActivatedAt,
      p10_policy: "explicit verified draft; original imported CSV not overwritten",
    },
  };
}

function metric(
  key: string,
  label: string,
  unit: string,
  expected: number | null,
  actual: number | null,
): FieldAuditReplayMetric {
  if (expected == null || actual == null) {
    return {
      key,
      label,
      unit,
      expected,
      actual,
      delta: expected === actual ? 0 : null,
      tolerance: 0,
      match: expected === actual,
    };
  }
  const tolerance = Math.max(1e-9, Math.abs(expected) * 1e-9);
  const delta = actual - expected;
  return {
    key,
    label,
    unit,
    expected,
    actual,
    delta,
    tolerance,
    match: Math.abs(delta) <= tolerance,
  };
}

function numericSummary(snapshot: FieldAuditResultSnapshot, key: string) {
  const value = (snapshot.summary as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNumericSummaryShape(snapshot: FieldAuditResultSnapshot) {
  const summary = snapshot.summary as Record<string, unknown>;
  return stableStringify({
    peak_time: summary.peak_time ?? null,
    source_measurement_intervals: summary.source_measurement_intervals ?? null,
  });
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

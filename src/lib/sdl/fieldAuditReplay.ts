import { runFieldDatasetCandidate, type FieldCandidateProgress } from "./fieldCandidateRunner";
import type { FieldDatasetResult } from "./fieldDataset";
import type { FieldAuditResultSnapshot, FieldAuditVerification } from "./fieldAudit";

export type FieldAuditReplayStatus = "MATCH" | "DIFFERENT";

export interface FieldAuditReplayDelta {
  key: string;
  label: string;
  unit: string;
  accepted: number;
  replay: number;
  delta: number;
}

export interface FieldAuditReplayReport {
  status: FieldAuditReplayStatus;
  expectedSha256: string;
  actualSha256: string;
  acceptedGatePass: boolean;
  replayGatePass: boolean;
  seriesCount: number;
  deltas: FieldAuditReplayDelta[];
}

const SUMMARY_METRICS = [
  ["technical_loss_kwh", "Susut teknis", "kWh"],
  ["loss_rate_percent", "Rasio susut", "%"],
  ["min_voltage_pu", "Tegangan minimum", "pu"],
  ["max_loading_percent", "Loading maksimum", "%"],
  ["supplied_energy_kwh", "Energi suplai", "kWh"],
] as const;

export async function runFieldAuditReplay(
  verification: FieldAuditVerification,
  onProgress?: (progress: FieldCandidateProgress) => void,
): Promise<FieldAuditReplayReport> {
  if (!verification.valid || !verification.auditPackage || !verification.reconstructedDataset) {
    throw new Error("Paket harus lolos verifikasi P11 sebelum replay physics dijalankan.");
  }

  const replayResult = await runFieldDatasetCandidate(verification.reconstructedDataset, onProgress);
  const replaySnapshot = snapshotReplayResult(replayResult);
  const actualSha256 = await sha256(stableStringify(replaySnapshot));
  const expectedSha256 = verification.auditPackage.integrity.acceptedResultSha256;

  return {
    status: actualSha256 === expectedSha256 ? "MATCH" : "DIFFERENT",
    expectedSha256,
    actualSha256,
    acceptedGatePass: Boolean(verification.auditPackage.accepted.result.gate.pass),
    replayGatePass: Boolean(replaySnapshot.gate.pass),
    seriesCount: replaySnapshot.seriesCount,
    deltas: compareSummary(verification.auditPackage.accepted.result, replaySnapshot),
  };
}

function snapshotReplayResult(result: FieldDatasetResult): FieldAuditResultSnapshot {
  return {
    gate: deepClone(result.gate),
    summary: deepClone(result.summary),
    checks: result.checks.map((check) => ({ ...check })),
    provenance: { ...result.provenance },
    seriesCount: result.series.length,
  };
}

function compareSummary(accepted: FieldAuditResultSnapshot, replay: FieldAuditResultSnapshot): FieldAuditReplayDelta[] {
  const acceptedSummary = accepted.summary as unknown as Record<string, unknown>;
  const replaySummary = replay.summary as unknown as Record<string, unknown>;
  return SUMMARY_METRICS.map(([key, label, unit]) => {
    const acceptedValue = finiteNumber(acceptedSummary[key]);
    const replayValue = finiteNumber(replaySummary[key]);
    return {
      key,
      label,
      unit,
      accepted: acceptedValue,
      replay: replayValue,
      delta: replayValue - acceptedValue,
    };
  });
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

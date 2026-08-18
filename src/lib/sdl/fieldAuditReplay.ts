import { runFieldDatasetCandidate, type FieldCandidateProgress } from "./fieldCandidateRunner";
import type { FieldDatasetResult } from "./fieldDataset";
import type { FieldAuditResultSnapshot, FieldAuditVerification } from "./fieldAudit";

export type FieldAuditReplayStatus = "MATCH" | "NUMERICAL_DRIFT" | "ENGINE_DRIFT";

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
  expectedPhysicsSha256: string;
  actualPhysicsSha256: string;
  acceptedIntegritySha256: string;
  replayRawSha256: string;
  acceptedEngineSha256: string;
  replayEngineSha256: string;
  acceptedEngineIdentity: Record<string, string>;
  replayEngineIdentity: Record<string, string>;
  acceptedGatePass: boolean;
  replayGatePass: boolean;
  seriesCount: number;
  deltas: FieldAuditReplayDelta[];
}

const SUMMARY_METRICS = [
  ["technical_loss_kwh", "Susut teknis", "kWh"],
  ["supplied_energy_kwh", "Energi suplai", "kWh"],
  ["load_energy_kwh", "Energi beban", "kWh"],
  ["loss_rate_percent", "Rasio susut", "%"],
  ["peak_loss_kw", "Puncak susut", "kW"],
  ["min_voltage_pu", "Tegangan minimum", "pu"],
  ["max_voltage_pu", "Tegangan maksimum", "pu"],
  ["max_loading_percent", "Loading maksimum", "%"],
  ["max_line_loading_percent", "Loading saluran maksimum", "%"],
  ["max_transformer_loading_percent", "Loading trafo maksimum", "%"],
  ["source_nrmse_percent", "Source NRMSE", "%"],
  ["source_measurement_intervals", "Interval pengukuran source", "interval"],
] as const;

export async function runFieldAuditReplay(
  verification: FieldAuditVerification,
  onProgress?: (progress: FieldCandidateProgress) => void,
): Promise<FieldAuditReplayReport> {
  if (!verification.valid || !verification.auditPackage || !verification.reconstructedDataset) {
    throw new Error("Paket harus lolos verifikasi P11 sebelum replay physics dijalankan.");
  }

  const acceptedSnapshot = verification.auditPackage.accepted.result;
  const replayResult = await runFieldDatasetCandidate(verification.reconstructedDataset, onProgress);
  const replaySnapshot = snapshotReplayResult(replayResult);
  const acceptedEngineIdentity = engineIdentity(acceptedSnapshot);
  const replayEngineIdentity = engineIdentity(replaySnapshot);
  const [expectedPhysicsSha256, actualPhysicsSha256, replayRawSha256, acceptedEngineSha256, replayEngineSha256] = await Promise.all([
    physicsFingerprint(acceptedSnapshot),
    physicsFingerprint(replaySnapshot),
    sha256(stableStringify(replaySnapshot)),
    sha256(stableStringify(acceptedEngineIdentity)),
    sha256(stableStringify(replayEngineIdentity)),
  ]);

  const status: FieldAuditReplayStatus = actualPhysicsSha256 === expectedPhysicsSha256
    ? "MATCH"
    : acceptedEngineSha256 === replayEngineSha256
      ? "NUMERICAL_DRIFT"
      : "ENGINE_DRIFT";

  return {
    status,
    expectedPhysicsSha256,
    actualPhysicsSha256,
    acceptedIntegritySha256: verification.auditPackage.integrity.acceptedResultSha256,
    replayRawSha256,
    acceptedEngineSha256,
    replayEngineSha256,
    acceptedEngineIdentity,
    replayEngineIdentity,
    acceptedGatePass: Boolean(acceptedSnapshot.gate.pass),
    replayGatePass: Boolean(replaySnapshot.gate.pass),
    seriesCount: replaySnapshot.seriesCount,
    deltas: compareSummary(acceptedSnapshot, replaySnapshot),
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

async function physicsFingerprint(snapshot: FieldAuditResultSnapshot) {
  return sha256(stableStringify(canonicalPhysicsSnapshot(snapshot)));
}

function canonicalPhysicsSnapshot(snapshot: FieldAuditResultSnapshot) {
  return {
    gate: deepClone(snapshot.gate),
    summary: deepClone(snapshot.summary),
    checks: snapshot.checks.map((check) => ({ ...check })),
    provenance: canonicalPhysicsProvenance(snapshot.provenance),
    seriesCount: snapshot.seriesCount,
  };
}

function canonicalPhysicsProvenance(provenance: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(provenance)
      .filter(([key]) => !key.startsWith("p10_"))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * Declared engine identity only. A changed identity is classified as ENGINE_DRIFT;
 * identical identity with changed physics is NUMERICAL_DRIFT. This does not claim
 * binary/code equivalence when the engine did not publish a version/hash key.
 */
function engineIdentity(snapshot: FieldAuditResultSnapshot) {
  return Object.fromEntries(
    Object.entries(canonicalPhysicsProvenance(snapshot.provenance))
      .filter(([key]) => /(solver|engine|adapter|version|pandapower)/i.test(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function compareSummary(accepted: FieldAuditResultSnapshot, replay: FieldAuditResultSnapshot): FieldAuditReplayDelta[] {
  const acceptedSummary = accepted.summary as unknown as Record<string, unknown>;
  const replaySummary = replay.summary as unknown as Record<string, unknown>;
  return SUMMARY_METRICS.map(([key, label, unit]) => {
    const acceptedValue = nullableFiniteNumber(acceptedSummary[key]);
    const replayValue = nullableFiniteNumber(replaySummary[key]);
    const acceptedComparable = acceptedValue ?? 0;
    const replayComparable = replayValue ?? 0;
    return {
      key,
      label,
      unit,
      accepted: acceptedComparable,
      replay: replayComparable,
      delta: replayComparable - acceptedComparable,
    };
  });
}

function nullableFiniteNumber(value: unknown) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

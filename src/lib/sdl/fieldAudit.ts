import type { FieldCorrectionComparison, FieldCorrectionDraft, FieldCorrectionEntry } from "./fieldCorrection";
import type { FieldMeasurementContext, FieldMeasurementRecord, FieldMeasurementReconciliation } from "./fieldMeasurement";
import { validateFieldDataset, type FieldDatasetResult, type FieldDatasetV1, type FieldNetworkElement } from "./fieldDataset";
import type { FieldOperationalSession } from "./fieldOperational";
import { buildFieldTopology } from "./fieldTopology";

export const FIELD_CORRECTION_AUDIT_SCHEMA = "smart-distribution-loss-correction-audit-v1" as const;
export const FIELD_AUDIT_PACKAGE_SCHEMA = "smart-distribution-loss-audit-package-v1" as const;

export interface FieldAuditResultSnapshot {
  gate: FieldDatasetResult["gate"];
  summary: FieldDatasetResult["summary"];
  checks: FieldDatasetResult["checks"];
  provenance: FieldDatasetResult["provenance"];
  seriesCount: number;
}

export interface FieldCorrectionAuditEvent {
  sequence: number;
  acceptedAt: string;
  baselineActivatedAt: string;
  candidateActivatedAt: string;
  elementId: string;
  elementType: "line" | "transformer";
  draftVersion: number;
  corrections: FieldCorrectionEntry[];
  measurement: {
    context: FieldMeasurementContext;
    record: FieldMeasurementRecord | null;
    reconciliation: FieldMeasurementReconciliation;
  };
  comparison: FieldCorrectionComparison;
  candidateResult: FieldAuditResultSnapshot;
}

export interface FieldCorrectionAuditTrail {
  schema: typeof FIELD_CORRECTION_AUDIT_SCHEMA;
  root: {
    dataset: FieldDatasetV1;
    result: FieldAuditResultSnapshot;
    filenames: string[];
    activatedAt: string;
  };
  events: FieldCorrectionAuditEvent[];
}

export interface FieldAuditPackageV1 {
  schema: typeof FIELD_AUDIT_PACKAGE_SCHEMA;
  packageVersion: 1;
  exportedAt: string;
  policy: {
    sourceMutation: "never";
    packageBasis: "normalized imported dataset + accepted verified corrections";
    resultTrust: "stored result fingerprint; rerun required for independent physics reproduction";
  };
  baseline: FieldCorrectionAuditTrail["root"];
  corrections: FieldCorrectionAuditEvent[];
  accepted: {
    sourceLabel: string;
    activatedAt: string;
    filenames: string[];
    result: FieldAuditResultSnapshot;
  };
  artifacts: { correctedNetworkCsv: string };
  integrity: {
    baselineDatasetSha256: string;
    correctionManifestSha256: string;
    finalDatasetSha256: string;
    correctedNetworkSha256: string;
    acceptedResultSha256: string;
  };
}

export interface FieldAuditVerification {
  valid: boolean;
  errors: string[];
  auditPackage: FieldAuditPackageV1 | null;
  reconstructedDataset: FieldDatasetV1 | null;
  eventCount: number;
  topologySupported: boolean;
  solverReady: boolean;
}

export function createFieldCorrectionAuditTrail({ baseline, candidate, draft, comparison, context, record, reconciliation }: {
  baseline: FieldOperationalSession;
  candidate: FieldOperationalSession;
  draft: FieldCorrectionDraft;
  comparison: FieldCorrectionComparison;
  context: FieldMeasurementContext;
  record: FieldMeasurementRecord | null;
  reconciliation: FieldMeasurementReconciliation;
}): FieldCorrectionAuditTrail {
  const existing = baseline.auditTrail;
  const root = existing?.root ?? {
    dataset: deepClone(baseline.dataset),
    result: snapshotResult(baseline.result),
    filenames: [...baseline.filenames],
    activatedAt: baseline.activatedAt,
  };
  const events = existing?.events.map((event) => deepClone(event)) ?? [];
  const event: FieldCorrectionAuditEvent = {
    sequence: events.length + 1,
    acceptedAt: new Date().toISOString(),
    baselineActivatedAt: baseline.activatedAt,
    candidateActivatedAt: candidate.activatedAt,
    elementId: draft.elementId,
    elementType: draft.elementType,
    draftVersion: draft.version,
    corrections: draft.entries.map((entry) => ({ ...entry })),
    measurement: {
      context: { ...context },
      record: record ? { ...record } : null,
      reconciliation: deepClone(reconciliation),
    },
    comparison: deepClone(comparison),
    candidateResult: snapshotResult(candidate.result),
  };
  return { schema: FIELD_CORRECTION_AUDIT_SCHEMA, root: deepClone(root), events: [...events, event] };
}

export async function buildFieldAuditPackage(session: FieldOperationalSession): Promise<FieldAuditPackageV1> {
  const trail = session.auditTrail;
  if (!trail?.events.length) throw new Error("Belum ada koreksi P10 yang diadopsi untuk diekspor.");
  const reconstructed = reconstructFieldAuditDataset(trail.root.dataset, trail.events, session.dataset.source_label);
  if (stableStringify(reconstructed) !== stableStringify(session.dataset)) {
    throw new Error("Dataset aktif tidak dapat direkonstruksi hanya dari baseline dan manifest koreksi P11.");
  }
  const correctedNetworkCsv = serializeFieldNetworkCsv(session.dataset.network);
  const acceptedResult = snapshotResult(session.result);
  const [baselineDatasetSha256, correctionManifestSha256, finalDatasetSha256, correctedNetworkSha256, acceptedResultSha256] = await Promise.all([
    sha256(stableStringify(trail.root.dataset)),
    sha256(stableStringify(trail.events)),
    sha256(stableStringify(session.dataset)),
    sha256(correctedNetworkCsv),
    sha256(stableStringify(acceptedResult)),
  ]);
  return {
    schema: FIELD_AUDIT_PACKAGE_SCHEMA,
    packageVersion: 1,
    exportedAt: new Date().toISOString(),
    policy: {
      sourceMutation: "never",
      packageBasis: "normalized imported dataset + accepted verified corrections",
      resultTrust: "stored result fingerprint; rerun required for independent physics reproduction",
    },
    baseline: deepClone(trail.root),
    corrections: trail.events.map((event) => deepClone(event)),
    accepted: {
      sourceLabel: session.dataset.source_label,
      activatedAt: session.activatedAt,
      filenames: [...session.filenames],
      result: acceptedResult,
    },
    artifacts: { correctedNetworkCsv },
    integrity: { baselineDatasetSha256, correctionManifestSha256, finalDatasetSha256, correctedNetworkSha256, acceptedResultSha256 },
  };
}

export async function verifyFieldAuditPackageText(text: string): Promise<FieldAuditVerification> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return failure("File bukan JSON audit package yang valid."); }
  if (!isAuditPackage(parsed)) return failure("Schema paket audit P11 tidak dikenali.");
  const auditPackage = parsed;
  const errors: string[] = [];
  if (!auditPackage.corrections.length) errors.push("Paket tidak memiliki event koreksi yang diterima.");
  if (auditPackage.corrections.some((event, index) => event.sequence !== index + 1)) errors.push("Urutan event koreksi tidak konsisten.");
  if (auditPackage.corrections.some((event) => !event.corrections.length || event.measurement.reconciliation.status !== "DISCREPANCY")) {
    errors.push("Manifest memuat event tanpa koreksi terverifikasi atau tanpa evidence discrepancy P9.");
  }
  const reconstructed = reconstructFieldAuditDataset(auditPackage.baseline.dataset, auditPackage.corrections, auditPackage.accepted.sourceLabel);
  const report = validateFieldDataset(reconstructed);
  const topology = buildFieldTopology(reconstructed);
  const correctedNetworkCsv = serializeFieldNetworkCsv(reconstructed.network);
  const [baselineHash, correctionHash, finalHash, networkHash, acceptedResultHash] = await Promise.all([
    sha256(stableStringify(auditPackage.baseline.dataset)),
    sha256(stableStringify(auditPackage.corrections)),
    sha256(stableStringify(reconstructed)),
    sha256(correctedNetworkCsv),
    sha256(stableStringify(auditPackage.accepted.result)),
  ]);
  checkHash(errors, "baseline dataset", baselineHash, auditPackage.integrity.baselineDatasetSha256);
  checkHash(errors, "manifest koreksi", correctionHash, auditPackage.integrity.correctionManifestSha256);
  checkHash(errors, "dataset hasil rekonstruksi", finalHash, auditPackage.integrity.finalDatasetSha256);
  checkHash(errors, "network.corrected.csv", networkHash, auditPackage.integrity.correctedNetworkSha256);
  checkHash(errors, "fingerprint hasil accepted", acceptedResultHash, auditPackage.integrity.acceptedResultSha256);
  if (auditPackage.artifacts.correctedNetworkCsv !== correctedNetworkCsv) errors.push("Isi network.corrected.csv tidak cocok dengan dataset yang direkonstruksi.");
  if (!report.valid || !report.solverReady) errors.push(report.errors[0] ?? "Dataset hasil rekonstruksi tidak siap dihitung ulang.");
  if (!topology.supported) errors.push(topology.reason ?? "Topology hasil rekonstruksi tidak didukung.");
  return {
    valid: errors.length === 0,
    errors,
    auditPackage,
    reconstructedDataset: reconstructed,
    eventCount: auditPackage.corrections.length,
    topologySupported: topology.supported,
    solverReady: report.solverReady,
  };
}

export function reconstructFieldAuditDataset(root: FieldDatasetV1, events: FieldCorrectionAuditEvent[], sourceLabel: string): FieldDatasetV1 {
  let dataset = deepClone(root);
  for (const event of events) dataset = applyAuditCorrections(dataset, event.elementId, event.corrections);
  return { ...dataset, source_label: sourceLabel };
}

export function serializeFieldNetworkCsv(network: FieldNetworkElement[]) {
  const headers: Array<keyof FieldNetworkElement> = [
    "element_id", "element_type", "from_bus", "to_bus", "from_kv", "to_kv", "length_km",
    "r_ohm_per_km", "x_ohm_per_km", "c_nf_per_km", "r0_ohm_per_km", "x0_ohm_per_km",
    "c0_nf_per_km", "max_i_ka", "rated_kva", "vk_percent", "vkr_percent", "vk0_percent",
    "vkr0_percent", "pfe_kw", "i0_percent", "vector_group", "shift_degree", "s_sc_max_mva", "rx_max", "r0x0_max", "x0x_max",
  ];
  const rows = network.map((element) => headers.map((header) => csvCell(element[header])).join(","));
  return [headers.join(","), ...rows].join("\n");
}

export function fieldAuditPackageFilename(session: FieldOperationalSession) {
  const eventCount = session.auditTrail?.events.length ?? 0;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
  return `sdl-audit-${stamp}-v${eventCount}.json`;
}

export function fieldCorrectedNetworkFilename(session: FieldOperationalSession) {
  return `network.corrected.v${session.auditTrail?.events.length ?? 0}.csv`;
}

function applyAuditCorrections(dataset: FieldDatasetV1, elementId: string, entries: FieldCorrectionEntry[]): FieldDatasetV1 {
  const network = dataset.network.map((element) => {
    if (element.element_id !== elementId) return { ...element };
    const corrected = { ...element } as FieldNetworkElement & Record<string, unknown>;
    for (const entry of entries) corrected[entry.parameter] = entry.proposedValue;
    return corrected as FieldNetworkElement;
  });
  return {
    ...dataset,
    network,
    customers: dataset.customers.map((item) => ({ ...item })),
    measurements: dataset.measurements.map((item) => ({ ...item })),
    ami: dataset.ami.map((item) => ({ ...item })),
  };
}

function snapshotResult(result: FieldDatasetResult): FieldAuditResultSnapshot {
  return {
    gate: deepClone(result.gate),
    summary: deepClone(result.summary),
    checks: result.checks.map((check) => ({ ...check })),
    provenance: { ...result.provenance },
    seriesCount: result.series.length,
  };
}

function checkHash(errors: string[], label: string, actual: string, expected: string) {
  if (actual !== expected) errors.push(`Checksum ${label} tidak cocok.`);
}

function csvCell(value: unknown) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function isAuditPackage(value: unknown): value is FieldAuditPackageV1 {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FieldAuditPackageV1>;
  return item.schema === FIELD_AUDIT_PACKAGE_SCHEMA && item.packageVersion === 1 && Boolean(item.baseline?.dataset) && Array.isArray(item.corrections) && Boolean(item.accepted?.result) && Boolean(item.integrity);
}

function failure(message: string): FieldAuditVerification {
  return { valid: false, errors: [message], auditPackage: null, reconstructedDataset: null, eventCount: 0, topologySupported: false, solverReady: false };
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value: unknown) { return JSON.stringify(sortValue(value)); }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortValue(item)]));
  }
  return value;
}
function deepClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

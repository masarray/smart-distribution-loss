import { useState } from "react";
import { AlertTriangle, Download, FileArchive, FileCheck2, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildFieldAuditPackage,
  fieldAuditPackageFilename,
  fieldCorrectedNetworkFilename,
  serializeFieldNetworkCsv,
  verifyFieldAuditPackageText,
  type FieldAuditVerification,
} from "@/lib/sdl/fieldAudit";
import {
  runFieldAuditReplay,
  type FieldAuditReplayReport,
} from "@/lib/sdl/fieldAuditReplay";
import { useFieldOperationalSession } from "@/lib/sdl/fieldOperational";
import { cn } from "@/lib/utils";

type ReplayUiState = "IDLE" | "RUNNING" | "MATCH" | "DIFFERENT" | "ERROR";

export function FieldAuditPanel() {
  const session = useFieldOperationalSession();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastPackageHash, setLastPackageHash] = useState<string | null>(null);
  const [verification, setVerification] = useState<FieldAuditVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [replayState, setReplayState] = useState<ReplayUiState>("IDLE");
  const [replayReport, setReplayReport] = useState<FieldAuditReplayReport | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayProgress, setReplayProgress] = useState({ percent: 0, label: "Siap replay", detail: "" });

  const trail = session?.auditTrail;
  if (!session || !trail?.events.length) return null;

  const latest = trail.events[trail.events.length - 1] ?? null;

  const exportAudit = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const auditPackage = await buildFieldAuditPackage(session);
      downloadText(
        fieldAuditPackageFilename(session),
        JSON.stringify(auditPackage, null, 2),
        "application/json;charset=utf-8",
      );
      setLastPackageHash(auditPackage.integrity.finalDatasetSha256);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Paket audit gagal dibuat.");
    } finally {
      setExporting(false);
    }
  };

  const downloadCorrectedNetwork = () => {
    downloadText(
      fieldCorrectedNetworkFilename(session),
      serializeFieldNetworkCsv(session.dataset.network),
      "text/csv;charset=utf-8",
    );
  };

  const verifyPackage = async (file: File | null) => {
    if (!file) return;
    setVerifying(true);
    setReplayState("IDLE");
    setReplayReport(null);
    setReplayError(null);
    setReplayProgress({ percent: 0, label: "Siap replay", detail: "" });
    try {
      setVerification(await verifyFieldAuditPackageText(await file.text()));
    } finally {
      setVerifying(false);
    }
  };

  const replayPackage = async () => {
    if (!verification?.valid) return;
    setReplayState("RUNNING");
    setReplayReport(null);
    setReplayError(null);
    setReplayProgress({ percent: 0, label: "Menyiapkan replay", detail: "Dataset hasil rekonstruksi P11" });
    try {
      const report = await runFieldAuditReplay(verification, setReplayProgress);
      setReplayReport(report);
      setReplayState(report.status);
    } catch (error) {
      setReplayError(error instanceof Error ? error.message : "Replay physics gagal dijalankan.");
      setReplayState("ERROR");
    }
  };

  return (
    <div
      className="mt-3 rounded-md border border-primary/25 bg-primary/5 p-2.5"
      data-p11-audit="true"
      data-p11-event-count={trail.events.length}
      data-p11-root-activated-at={trail.root.activatedAt}
      data-p11-active-activated-at={session.activatedAt}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-primary">
            <FileArchive className="size-3.5" />
            <p className="label-xs" style={{ color: "inherit" }}>Correction package & audit trail · P11</p>
          </div>
          <p className="mt-1 text-[8.5px] leading-relaxed text-muted-foreground">
            Paket self-contained memakai dataset impor yang sudah dinormalisasi, evidence P9, manifest koreksi P10, before/after, fingerprint hasil, dan checksum SHA-256. CSV asli tidak pernah ditimpa.
          </p>
        </div>
        <span className="numeric shrink-0 rounded border border-primary/25 bg-background/40 px-1.5 py-0.5 text-[7.5px] font-bold text-primary">
          {trail.events.length} EVENT
        </span>
      </div>

      {latest && (
        <div className="mt-2 rounded-md border border-border/45 bg-background/35 p-2" data-p11-latest-event="true" data-p11-element-id={latest.elementId}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8.5px] font-semibold text-foreground">#{latest.sequence} · {latest.elementId} · draft v{latest.draftVersion}</span>
            <span className="numeric text-[7.5px] text-muted-foreground">{latest.measurement.context.time} · {latest.measurement.context.side}</span>
          </div>
          <div className="mt-1 space-y-0.5">
            {latest.corrections.map((entry) => (
              <p key={entry.parameter} className="numeric text-[8px] text-muted-foreground" data-p11-correction={entry.parameter} data-p11-before={entry.beforeValue} data-p11-after={entry.proposedValue}>
                {entry.label}: {entry.beforeValue} → {entry.proposedValue} {entry.unit}
              </p>
            ))}
          </div>
          <p className="mt-1 truncate text-[8px] text-muted-foreground" data-p11-evidence="true">Bukti: {latest.corrections[0]?.evidence ?? latest.measurement.record?.reference ?? "—"}</p>
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void exportAudit()}
          disabled={exporting}
          className="h-7 gap-1.5 bg-transparent px-2 text-[8.5px]"
          data-p11-export-package="true"
        >
          <Download className="size-3" /> {exporting ? "Menyusun…" : "Ekspor paket audit"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadCorrectedNetwork}
          className="h-7 gap-1.5 bg-transparent px-2 text-[8.5px]"
          data-p11-download-network="true"
        >
          <Download className="size-3" /> network.corrected.csv
        </Button>
      </div>

      {exportError && <p className="mt-1.5 text-[8px] leading-relaxed text-destructive" data-p11-export-error="true">{exportError}</p>}
      {lastPackageHash && (
        <p className="numeric mt-1.5 truncate text-[7.5px] text-muted-foreground" data-p11-export-hash={lastPackageHash}>
          Final dataset SHA-256 · {lastPackageHash}
        </p>
      )}

      <div className="mt-2 border-t border-border/45 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[8.5px] font-semibold text-foreground">Verifikasi paket yang diekspor</p>
            <p className="mt-0.5 text-[7.5px] text-muted-foreground">Import ulang tidak mengaktifkan atau mengubah Field Mode. P11 memeriksa manifest, checksum, rekonstruksi dataset, validation, dan topology.</p>
          </div>
          <label className="shrink-0">
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => void verifyPackage(event.target.files?.[0] ?? null)}
              data-p11-import-package="true"
            />
            <span className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-background/35 px-2 text-[8.5px] font-medium text-foreground hover:border-primary/35">
              <Upload className="size-3" /> {verifying ? "Memeriksa…" : "Import & verifikasi"}
            </span>
          </label>
        </div>

        <VerificationState verification={verification} />
        <ReplayState
          verification={verification}
          state={replayState}
          report={replayReport}
          error={replayError}
          progress={replayProgress}
          onRun={() => void replayPackage()}
        />
      </div>
    </div>
  );
}

function VerificationState({ verification }: { verification: FieldAuditVerification | null }) {
  if (!verification) return <div className="mt-2 rounded border border-border/40 bg-background/25 px-2 py-1.5 text-[8px] text-muted-foreground" data-p11-verification-status="IDLE">Belum ada paket yang diperiksa.</div>;
  if (verification.valid) {
    return (
      <div className="mt-2 rounded border border-success/25 bg-success/5 px-2 py-1.5 text-success" data-p11-verification-status="VALID" data-p11-verified-events={verification.eventCount}>
        <div className="flex items-center gap-1.5 text-[8.5px] font-semibold"><FileCheck2 className="size-3" /> PAKET VALID · {verification.eventCount} event</div>
        <p className="mt-0.5 text-[7.5px] leading-relaxed text-success/85">Checksum cocok · dataset berhasil direkonstruksi · solver-ready · topology radial didukung.</p>
      </div>
    );
  }
  return (
    <div className={cn("mt-2 rounded border border-warn/30 bg-warn/5 px-2 py-1.5 text-warn")} data-p11-verification-status="INVALID">
      <div className="flex items-center gap-1.5 text-[8.5px] font-semibold"><AlertTriangle className="size-3" /> PAKET TIDAK VALID</div>
      <p className="mt-0.5 text-[7.5px] leading-relaxed text-warn/85">{verification.errors[0] ?? "Integrity check gagal."}</p>
    </div>
  );
}

function ReplayState({
  verification,
  state,
  report,
  error,
  progress,
  onRun,
}: {
  verification: FieldAuditVerification | null;
  state: ReplayUiState;
  report: FieldAuditReplayReport | null;
  error: string | null;
  progress: { percent: number; label: string; detail: string };
  onRun: () => void;
}) {
  if (!verification?.valid) return null;

  const running = state === "RUNNING";
  const acceptedIntegrityHash = report?.acceptedIntegritySha256 ?? verification.auditPackage?.integrity.acceptedResultSha256 ?? "";
  const expectedPhysicsHash = report?.expectedPhysicsSha256 ?? "";
  const actualPhysicsHash = report?.actualPhysicsSha256 ?? "";

  return (
    <div
      className="mt-2 rounded-md border border-primary/25 bg-background/30 p-2"
      data-p12-replay="true"
      data-p12-replay-status={state}
      data-p12-accepted-integrity-hash={acceptedIntegrityHash || undefined}
      data-p12-expected-physics-hash={expectedPhysicsHash || undefined}
      data-p12-actual-physics-hash={actualPhysicsHash || undefined}
      data-p12-replay-raw-hash={report?.replayRawSha256 || undefined}
      data-p12-series-count={report?.seriesCount ?? undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-primary">
            <RefreshCw className={cn("size-3.5", running && "animate-spin")} />
            <p className="label-xs" style={{ color: "inherit" }}>Audit replay & reproducibility · P12</p>
          </div>
          <p className="mt-0.5 text-[7.5px] leading-relaxed text-muted-foreground">Menjalankan ulang dataset hasil rekonstruksi melalui Pandapower secara terisolasi. Replay tidak mengaktifkan dataset dan tidak mengubah KPI Field Mode.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRun}
          disabled={running}
          className="h-7 shrink-0 gap-1.5 bg-transparent px-2 text-[8.5px]"
          data-p12-run-replay="true"
        >
          {running ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          {running ? "Replay…" : report ? "Replay ulang" : "Jalankan replay"}
        </Button>
      </div>

      {running && (
        <div className="mt-2" data-p12-progress={Math.max(0, Math.min(100, progress.percent)).toFixed(1)}>
          <div className="flex items-center justify-between gap-2 text-[7.5px] text-muted-foreground">
            <span className="truncate">{progress.label}</span>
            <span className="numeric shrink-0">{Math.round(progress.percent)}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-linear" style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
          </div>
          {progress.detail && <p className="mt-1 truncate text-[7px] text-muted-foreground/80">{progress.detail}</p>}
        </div>
      )}

      {state === "IDLE" && <p className="mt-2 text-[8px] text-muted-foreground">Paket sudah lolos integrity check. Jalankan replay untuk membuktikan fingerprint physics dapat direproduksi. Metadata audit P10 tidak dipakai sebagai physics fingerprint.</p>}

      {state === "MATCH" && report && (
        <div className="mt-2 rounded border border-success/30 bg-success/5 px-2 py-1.5 text-success" data-p12-result="MATCH">
          <div className="flex items-center gap-1.5 text-[8.5px] font-semibold"><FileCheck2 className="size-3" /> REPLAY SESUAI · {report.seriesCount}/96 interval</div>
          <p className="mt-0.5 text-[7.5px] leading-relaxed text-success/85">Fresh Pandapower result menghasilkan canonical physics fingerprint yang sama persis: gate, seluruh summary, checks, solver provenance non-audit, dan jumlah interval cocok.</p>
          <p className="numeric mt-1 truncate text-[7px] text-success/75">Physics SHA-256 · {report.actualPhysicsSha256}</p>
          <p className="numeric mt-0.5 truncate text-[7px] text-muted-foreground">P11 integrity SHA tetap · {report.acceptedIntegritySha256}</p>
        </div>
      )}

      {state === "DIFFERENT" && report && (
        <div className="mt-2 rounded border border-warn/30 bg-warn/5 px-2 py-1.5 text-warn" data-p12-result="DIFFERENT">
          <div className="flex items-center gap-1.5 text-[8.5px] font-semibold"><AlertTriangle className="size-3" /> REPLAY BERBEDA</div>
          <p className="mt-0.5 text-[7.5px] leading-relaxed text-warn/85">Dataset lolos P11, tetapi fresh solver tidak menghasilkan canonical physics fingerprint yang sama. Tinjau solver/provenance sebelum memakai paket sebagai bukti reproduksi.</p>
          <div className="mt-1 max-h-20 space-y-0.5 overflow-auto">
            {report.deltas.map((item) => (
              <p key={item.key} className="numeric text-[7px] text-warn/80" data-p12-delta={item.key} data-p12-delta-value={item.delta}>
                {item.label}: Δ {formatDelta(item.delta)} {item.unit}
              </p>
            ))}
          </div>
        </div>
      )}

      {state === "ERROR" && <p className="mt-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[8px] text-destructive" data-p12-result="ERROR">{error ?? "Replay physics gagal."}</p>}
    </div>
  );
}

function formatDelta(value: number) {
  if (Math.abs(value) < 1e-12) return "0";
  return value.toExponential(3);
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  FileCheck2,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";
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
  compareFieldAuditReplay,
  type FieldAuditReplayComparison,
} from "@/lib/sdl/fieldAuditReplay";
import { runFieldDatasetCandidate } from "@/lib/sdl/fieldCandidateRunner";
import { useFieldOperationalSession } from "@/lib/sdl/fieldOperational";
import { cn } from "@/lib/utils";

type ReplayRunState = "idle" | "running" | "done" | "error";

export function FieldAuditPanel() {
  const session = useFieldOperationalSession();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastPackageHash, setLastPackageHash] = useState<string | null>(null);
  const [verification, setVerification] = useState<FieldAuditVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [replayRunState, setReplayRunState] = useState<ReplayRunState>("idle");
  const [replayProgress, setReplayProgress] = useState({ percent: 0, label: "Belum dijalankan", detail: "" });
  const [replayComparison, setReplayComparison] = useState<FieldAuditReplayComparison | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  const trail = session?.auditTrail;
  if (!session || !trail?.events.length) return null;

  const latest = trail.events[trail.events.length - 1] ?? null;
  const replayReady = Boolean(
    verification?.valid && verification.auditPackage && verification.reconstructedDataset,
  );

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

  const resetReplay = () => {
    setReplayRunState("idle");
    setReplayProgress({ percent: 0, label: "Belum dijalankan", detail: "" });
    setReplayComparison(null);
    setReplayError(null);
  };

  const verifyPackage = async (file: File | null) => {
    if (!file) return;
    setVerifying(true);
    resetReplay();
    try {
      setVerification(await verifyFieldAuditPackageText(await file.text()));
    } finally {
      setVerifying(false);
    }
  };

  const runReplay = async () => {
    if (
      replayRunState === "running" ||
      !verification?.valid ||
      !verification.auditPackage ||
      !verification.reconstructedDataset
    ) return;

    setReplayRunState("running");
    setReplayComparison(null);
    setReplayError(null);
    setReplayProgress({ percent: 2, label: "Menyiapkan replay", detail: "Field Mode aktif tetap tidak diubah" });
    try {
      const rawResult = await runFieldDatasetCandidate(
        verification.reconstructedDataset,
        (progress) => setReplayProgress(progress),
      );
      const comparison = await compareFieldAuditReplay(verification.auditPackage, rawResult);
      setReplayComparison(comparison);
      setReplayRunState("done");
      setReplayProgress({
        percent: 100,
        label: comparison.status === "MATCH" ? "Replay sesuai" : "Replay berbeda",
        detail: comparison.fingerprintMatch ? "Fingerprint accepted cocok" : "Fingerprint accepted tidak cocok",
      });
    } catch (error) {
      setReplayRunState("error");
      setReplayError(error instanceof Error ? error.message : "Replay physics gagal dijalankan.");
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
            <p className="mt-0.5 text-[7.5px] text-muted-foreground">Import ulang tidak mengaktifkan atau mengubah Field Mode. P11 hanya memeriksa manifest, checksum, rekonstruksi dataset, validation, dan topology.</p>
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
      </div>

      <div
        className="mt-2 border-t border-border/45 pt-2"
        data-p12-replay="true"
        data-p12-replay-status={replayRunState === "done" ? replayComparison?.status ?? "ERROR" : replayRunState.toUpperCase()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-primary">
              <RefreshCw className={cn("size-3.5", replayRunState === "running" && "animate-spin")} />
              <p className="label-xs" style={{ color: "inherit" }}>Audit replay & reproducible re-run · P12</p>
            </div>
            <p className="mt-0.5 text-[7.5px] leading-relaxed text-muted-foreground">
              Dataset hasil rekonstruksi P11 dijalankan ulang lewat Pandapower 3φ. Fresh result dibandingkan dengan accepted-result fingerprint tanpa mengaktifkan dataset replay atau mengubah KPI aktif.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runReplay()}
            disabled={!replayReady || replayRunState === "running"}
            className="h-7 shrink-0 gap-1.5 bg-transparent px-2 text-[8.5px]"
            data-p12-replay-start="true"
          >
            <RefreshCw className="size-3" /> {replayRunState === "running" ? "Replay…" : "Jalankan replay"}
          </Button>
        </div>

        <ReplayState
          runState={replayRunState}
          progress={replayProgress}
          comparison={replayComparison}
          error={replayError}
          ready={replayReady}
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
    <div className="mt-2 rounded border border-warn/30 bg-warn/5 px-2 py-1.5 text-warn" data-p11-verification-status="INVALID">
      <div className="flex items-center gap-1.5 text-[8.5px] font-semibold"><AlertTriangle className="size-3" /> PAKET TIDAK VALID</div>
      <p className="mt-0.5 text-[7.5px] leading-relaxed text-warn/85">{verification.errors[0] ?? "Integrity check gagal."}</p>
    </div>
  );
}

function ReplayState({ runState, progress, comparison, error, ready }: {
  runState: ReplayRunState;
  progress: { percent: number; label: string; detail: string };
  comparison: FieldAuditReplayComparison | null;
  error: string | null;
  ready: boolean;
}) {
  if (runState === "idle") {
    return (
      <div className="mt-2 rounded border border-border/40 bg-background/25 px-2 py-1.5 text-[8px] text-muted-foreground" data-p12-replay-state="IDLE">
        {ready ? "Paket valid siap direplay. Fresh solver run belum dijalankan." : "Import paket audit P11 yang valid untuk membuka replay physics."}
      </div>
    );
  }

  if (runState === "running") {
    const percent = Math.max(0, Math.min(100, progress.percent));
    return (
      <div className="mt-2 rounded border border-primary/25 bg-primary/5 px-2 py-1.5" data-p12-replay-state="RUNNING" data-p12-replay-percent={percent.toFixed(2)}>
        <div className="flex items-center justify-between gap-2 text-[8px]"><span className="font-semibold text-primary">{progress.label}</span><span className="numeric text-muted-foreground">{Math.round(percent)}%</span></div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-background/60"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} /></div>
        <p className="mt-1 text-[7.5px] text-muted-foreground">{progress.detail || "Pandapower 3φ menghitung ulang dataset hasil rekonstruksi."}</p>
      </div>
    );
  }

  if (runState === "error") {
    return (
      <div className="mt-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-destructive" data-p12-replay-state="ERROR">
        <div className="flex items-center gap-1.5 text-[8.5px] font-semibold"><XCircle className="size-3" /> REPLAY GAGAL</div>
        <p className="mt-0.5 text-[7.5px] leading-relaxed text-destructive/85">{error ?? "Mesin replay gagal dijalankan."}</p>
      </div>
    );
  }

  if (!comparison) return null;
  const match = comparison.status === "MATCH";
  return (
    <div
      className={cn("mt-2 rounded border px-2 py-1.5", match ? "border-success/30 bg-success/5 text-success" : "border-warn/30 bg-warn/5 text-warn")}
      data-p12-replay-state={comparison.status}
      data-p12-fingerprint-match={comparison.fingerprintMatch ? "true" : "false"}
      data-p12-expected-hash={comparison.expectedSha256}
      data-p12-replay-hash={comparison.replaySha256}
    >
      <div className="flex items-center gap-1.5 text-[8.5px] font-semibold">
        {match ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
        {match ? "REPLAY SESUAI" : "REPLAY BERBEDA"}
      </div>
      <p className="mt-0.5 text-[7.5px] leading-relaxed opacity-85">
        {match
          ? "Fresh Pandapower run mereproduksi accepted-result fingerprint P11 secara identik."
          : "Fresh Pandapower run tidak mereproduksi accepted-result fingerprint. Paket tetap utuh, tetapi hasil physics perlu ditinjau."}
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[7.5px]">
        <ReplayCheck label="Fingerprint" pass={comparison.fingerprintMatch} />
        <ReplayCheck label="Gate" pass={comparison.gateMatch} />
        <ReplayCheck label="96 interval" pass={comparison.seriesCountMatch} />
        <ReplayCheck label="Checks" pass={comparison.checksMatch} />
        <ReplayCheck label="Provenance" pass={comparison.provenanceMatch} />
        <ReplayCheck label="Summary shape" pass={comparison.summaryShapeMatch} />
      </div>
      <div className="mt-1.5 space-y-0.5">
        {comparison.metrics.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-2 rounded bg-background/25 px-1.5 py-1 text-[7px]"
            data-p12-metric={item.key}
            data-p12-metric-match={item.match ? "true" : "false"}
            data-p12-metric-expected={item.expected ?? "null"}
            data-p12-metric-actual={item.actual ?? "null"}
          >
            <span className="truncate">{item.label}</span>
            <span className="numeric shrink-0">{formatMetric(item.actual)} {item.unit}</span>
          </div>
        ))}
      </div>
      <p className="numeric mt-1.5 truncate text-[6.5px] opacity-70">Expected {comparison.expectedSha256}</p>
      <p className="numeric truncate text-[6.5px] opacity-70">Replay {comparison.replaySha256}</p>
    </div>
  );
}

function ReplayCheck({ label, pass }: { label: string; pass: boolean }) {
  return <span className={cn("rounded border px-1.5 py-1", pass ? "border-success/25 bg-success/5" : "border-warn/25 bg-warn/5")}>{label} · {pass ? "COCOK" : "BEDA"}</span>;
}

function formatMetric(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100) return value.toFixed(3);
  if (Math.abs(value) >= 1) return value.toFixed(6);
  return value.toFixed(9);
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

import { useState } from "react";
import { AlertTriangle, Download, FileArchive, FileCheck2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildFieldAuditPackage,
  fieldAuditPackageFilename,
  fieldCorrectedNetworkFilename,
  serializeFieldNetworkCsv,
  verifyFieldAuditPackageText,
  type FieldAuditVerification,
} from "@/lib/sdl/fieldAudit";
import { useFieldOperationalSession } from "@/lib/sdl/fieldOperational";
import { cn } from "@/lib/utils";

export function FieldAuditPanel() {
  const session = useFieldOperationalSession();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastPackageHash, setLastPackageHash] = useState<string | null>(null);
  const [verification, setVerification] = useState<FieldAuditVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

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
    try {
      setVerification(await verifyFieldAuditPackageText(await file.text()));
    } finally {
      setVerifying(false);
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

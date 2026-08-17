import { AlertTriangle, CheckCircle2, FlaskConical, GitCompareArrows, Play, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  FieldCorrectionComparison,
  FieldCorrectionDefinition,
  FieldCorrectionDraft,
  FieldCorrectionParameter,
} from "@/lib/sdl/fieldCorrection";
import { cn } from "@/lib/utils";

export type FieldCorrectionRunState = "idle" | "running" | "done" | "error";

interface Props {
  elementId: string;
  elementType: "line" | "transformer";
  ready: boolean;
  definitions: FieldCorrectionDefinition[];
  parameter: FieldCorrectionParameter;
  beforeValue: number | null;
  proposedValue: string;
  evidence: string;
  verified: boolean;
  inputError: string | null;
  draft: FieldCorrectionDraft | null;
  testedVersion: number | null;
  runState: FieldCorrectionRunState;
  progress: { percent: number; label: string; detail: string };
  runError: string | null;
  comparison: FieldCorrectionComparison | null;
  candidateActivatable: boolean;
  onParameterChange: (parameter: FieldCorrectionParameter) => void;
  onProposedChange: (value: string) => void;
  onEvidenceChange: (value: string) => void;
  onVerifiedChange: (value: boolean) => void;
  onSaveRevision: () => void;
  onRemoveEntry: (parameter: FieldCorrectionParameter) => void;
  onRunCandidate: () => void;
  onActivateCandidate: () => void;
  onDiscardCandidate: () => void;
}

export function FieldCorrectionPanel({
  elementId,
  elementType,
  ready,
  definitions,
  parameter,
  beforeValue,
  proposedValue,
  evidence,
  verified,
  inputError,
  draft,
  testedVersion,
  runState,
  progress,
  runError,
  comparison,
  candidateActivatable,
  onParameterChange,
  onProposedChange,
  onEvidenceChange,
  onVerifiedChange,
  onSaveRevision,
  onRemoveEntry,
  onRunCandidate,
  onActivateCandidate,
  onDiscardCandidate,
}: Props) {
  if (!ready) {
    return (
      <div className="mt-3 rounded-md border border-border/45 bg-surface-2/35 p-2.5" data-p10-correction="true" data-p10-ready="false">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <GitCompareArrows className="size-3.5" />
          <p className="label-xs" style={{ color: "inherit" }}>Koreksi terverifikasi · P10</p>
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
          P10 dibuka ketika rekonsiliasi P9 menemukan selisih. Nilai dataset tidak pernah dikoreksi otomatis.
        </p>
      </div>
    );
  }

  const definition = definitions.find((item) => item.parameter === parameter) ?? definitions[0];
  const draftVersion = draft?.version ?? 0;
  const staleCandidate = testedVersion != null && testedVersion !== draftVersion;
  const canRun = Boolean(draft?.entries.length) && runState !== "running";

  return (
    <div
      className="mt-3 rounded-md border border-primary/20 bg-primary/[0.025] p-2.5"
      data-p10-correction="true"
      data-p10-ready="true"
      data-p10-element-id={elementId}
      data-p10-element-type={elementType}
      data-p10-draft-version={draftVersion}
      data-p10-tested-version={testedVersion ?? undefined}
      data-p10-run-state={runState}
      data-p10-candidate-stale={staleCandidate ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-primary">
            <GitCompareArrows className="size-3.5" />
            <p className="label-xs" style={{ color: "inherit" }}>Koreksi terverifikasi · P10</p>
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
            Buat revisi parameter sebagai kandidat terpisah. Baseline tetap aktif sampai kandidat selesai dihitung dan dipilih secara eksplisit.
          </p>
        </div>
        <span className="numeric shrink-0 rounded border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[7.5px] font-bold text-primary" data-p10-version-badge="true">
          DRAFT v{draftVersion}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <label className="text-[8px] text-muted-foreground">
          Parameter
          <select
            value={parameter}
            onChange={(event) => onParameterChange(event.target.value as FieldCorrectionParameter)}
            className="mt-1 h-7 w-full rounded-md border border-border/55 bg-background px-2 text-[9px] text-foreground outline-none focus:border-primary/50"
            data-p10-parameter="true"
          >
            {definitions.map((item) => <option key={item.parameter} value={item.parameter}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-[8px] text-muted-foreground">
          Nilai usulan
          <div className="relative mt-1">
            <input
              type="number"
              step="any"
              min={definition?.allowZero ? 0 : undefined}
              value={proposedValue}
              onChange={(event) => onProposedChange(event.target.value)}
              className="h-7 w-full rounded-md border border-border/55 bg-background px-2 pr-12 text-[9px] text-foreground outline-none focus:border-primary/50"
              data-p10-proposed="true"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-muted-foreground">{definition?.unit}</span>
          </div>
        </label>
      </div>

      <div
        className="mt-1.5 flex items-center justify-between rounded-md border border-border/40 bg-background/30 px-2 py-1.5 text-[8px] text-muted-foreground"
        data-p10-baseline-parameter={parameter}
        data-p10-before-value={beforeValue ?? undefined}
      >
        <span>Baseline aktif · {definition?.label}</span>
        <span className="numeric font-semibold text-foreground">{formatValue(beforeValue, definition?.unit ?? "")}</span>
      </div>

      <label className="mt-1.5 block text-[8px] text-muted-foreground">
        Bukti verifikasi nilai usulan
        <input
          type="text"
          value={evidence}
          onChange={(event) => onEvidenceChange(event.target.value)}
          placeholder="mis. nameplate, as-built, hasil ukur + ID alat"
          className="mt-1 h-7 w-full rounded-md border border-border/55 bg-background px-2 text-[9px] text-foreground outline-none placeholder:text-muted-foreground/55 focus:border-primary/50"
          data-p10-evidence="true"
        />
      </label>

      <label className="mt-1.5 flex cursor-pointer items-start gap-2 rounded-md border border-border/40 bg-background/25 px-2 py-1.5 text-[8px] leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={verified}
          onChange={(event) => onVerifiedChange(event.target.checked)}
          className="mt-0.5 size-3 accent-primary"
          data-p10-verified="true"
        />
        <span><span className="font-semibold text-foreground">Sudah diverifikasi.</span> Nilai ini berasal dari bukti lapangan/nameplate/as-built dan bukan tebakan dari selisih P9.</span>
      </label>

      {inputError && <p className="mt-1.5 text-[8px] leading-relaxed text-muted-foreground" data-p10-input-hint="true">{inputError}</p>}

      <Button
        variant="outline"
        size="sm"
        className="mt-2 h-7 w-full gap-1.5 bg-transparent text-[8.5px]"
        onClick={onSaveRevision}
        disabled={Boolean(inputError)}
        data-p10-save-revision="true"
      >
        <ShieldCheck className="size-3" /> Simpan sebagai revisi v{draftVersion + 1}
      </Button>

      {!!draft?.entries.length && (
        <div className="mt-2 space-y-1" data-p10-draft-entries="true">
          {draft.entries.map((entry) => (
            <div key={entry.parameter} className="rounded-md border border-border/40 bg-background/30 px-2 py-1.5" data-p10-entry={entry.parameter}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[8.5px] font-semibold text-foreground">{entry.label}</p>
                  <p className="numeric mt-0.5 text-[8px] text-muted-foreground">{entry.beforeValue} → {entry.proposedValue} {entry.unit}</p>
                  <p className="mt-0.5 truncate text-[7.5px] text-muted-foreground">Bukti: {entry.evidence}</p>
                  <p className="numeric mt-0.5 text-[7px] text-muted-foreground/70">P9 {entry.measurementTime} · {entry.measurementSide}{entry.measurementReference ? ` · ${entry.measurementReference}` : ""}</p>
                </div>
                <button type="button" onClick={() => onRemoveEntry(entry.parameter)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Hapus ${entry.label}`} data-p10-remove-entry={entry.parameter}>
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 border-t border-border/40 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[8.5px] font-semibold text-foreground">Uji kandidat terisolasi</p>
            <p className="text-[7.5px] text-muted-foreground">Menjalankan 96 interval dengan worker yang sama; baseline cockpit tidak diganti.</p>
          </div>
          <Button size="sm" onClick={onRunCandidate} disabled={!canRun} className="h-7 shrink-0 gap-1.5 px-2 text-[8.5px]" data-p10-run-candidate="true">
            {runState === "running" ? <FlaskConical className="size-3 animate-pulse" /> : <Play className="size-3" />}
            {runState === "running" ? "Menghitung…" : `Hitung v${draftVersion}`}
          </Button>
        </div>
        {runState === "running" && (
          <div className="mt-2" data-p10-progress="true">
            <div className="flex justify-between gap-2 text-[7.5px] text-muted-foreground"><span>{progress.label}</span><span className="numeric">{Math.round(progress.percent)}%</span></div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(2, Math.min(100, progress.percent))}%` }} /></div>
            {!!progress.detail && <p className="mt-1 truncate text-[7px] text-muted-foreground/70">{progress.detail}</p>}
          </div>
        )}
        {runError && <div className="mt-2 flex items-start gap-1.5 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-[8px] text-destructive"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{runError}</div>}
        {staleCandidate && <p className="mt-1.5 text-[8px] text-warn" data-p10-stale-warning="true">Draft berubah setelah kandidat v{testedVersion} dihitung. Jalankan ulang v{draftVersion} sebelum kandidat dapat dipakai.</p>}
      </div>

      {comparison && testedVersion === draftVersion && (
        <div className="mt-2 rounded-md border border-border/45 bg-background/25 p-2" data-p10-comparison="true" data-p10-gate-pass={comparison.gatePass ? "true" : "false"}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-foreground"><GitCompareArrows className="size-3 text-primary" /><span className="text-[8.5px] font-semibold">Before → kandidat v{comparison.draftVersion}</span></div>
            <span className={cn("text-[7px] font-bold", comparison.gatePass ? "text-success" : "text-destructive")}>{comparison.gatePass ? "GATE LULUS" : "GATE GAGAL"}</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1" data-p10-network-comparison="true">
            {comparison.networkMetrics.map((metric) => <MetricDelta key={metric.key} metric={metric} />)}
          </div>
          <p className="mt-2 text-[7.5px] font-semibold text-muted-foreground">Aset {comparison.elementId}</p>
          <div className="mt-1 grid grid-cols-2 gap-1" data-p10-asset-comparison="true">
            {comparison.assetMetrics.map((metric) => <MetricDelta key={metric.key} metric={metric} />)}
          </div>
          <p className="numeric mt-1.5 text-[7.5px] text-muted-foreground" data-p10-peak-comparison="true">Interval puncak: {comparison.beforePeakTime ?? "—"} → {comparison.afterPeakTime ?? "—"}</p>

          <div className="mt-2 flex gap-1.5 border-t border-border/40 pt-2">
            <Button variant="outline" size="sm" onClick={onDiscardCandidate} className="h-7 flex-1 bg-transparent text-[8px]" data-p10-discard-candidate="true">Buang hasil kandidat</Button>
            <Button size="sm" onClick={onActivateCandidate} disabled={!candidateActivatable} className="h-7 flex-1 gap-1.5 text-[8px]" data-p10-activate-candidate="true">
              <CheckCircle2 className="size-3" /> Gunakan kandidat v{comparison.draftVersion}
            </Button>
          </div>
          <p className="mt-1.5 text-[7px] leading-relaxed text-muted-foreground/75">
            Adopsi hanya mengganti session Field Mode di memori. File CSV asli tidak ditimpa dan baseline tetap tidak berubah sampai tombol “Gunakan kandidat” ditekan.
          </p>
        </div>
      )}
    </div>
  );
}

function MetricDelta({ metric }: { metric: FieldCorrectionComparison["networkMetrics"][number] }) {
  return (
    <div className="rounded border border-border/35 bg-surface-2/35 px-1.5 py-1" data-p10-metric={metric.key} data-p10-before={metric.before ?? undefined} data-p10-after={metric.after ?? undefined}>
      <p className="text-[7px] text-muted-foreground">{metric.label}</p>
      <p className="numeric mt-0.5 text-[7.5px] text-foreground">{formatMetric(metric.before, metric.digits)} → {formatMetric(metric.after, metric.digits)} {metric.unit}</p>
      <p className="numeric text-[7px] text-muted-foreground">Δ {formatSigned(metric.delta, metric.digits)}</p>
    </div>
  );
}

function formatMetric(value: number | null, digits: number) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function formatSigned(value: number | null, digits: number) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatValue(value: number | null, unit: string) {
  return value == null || !Number.isFinite(value) ? "—" : `${value} ${unit}`;
}

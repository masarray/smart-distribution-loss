import { Check, ClipboardCheck, Clock3, Route } from "lucide-react";
import { FieldAuditPanel } from "@/components/sdl/FieldAuditPanel";
import { FieldMeasurementWorkspace } from "@/components/sdl/FieldMeasurementWorkspace";
import type { FieldInvestigationPlan } from "@/lib/sdl/fieldInvestigation";
import { cn } from "@/lib/utils";

interface Props {
  plan: FieldInvestigationPlan | null;
  completedIds: string[];
  onToggle: (id: string) => void;
}

export function FieldInvestigationPanel({ plan, completedIds, onToggle }: Props) {
  if (!plan) {
    return (
      <>
        <div className="rounded-md border border-primary/15 bg-primary/5 p-2.5" data-p8-investigation="true" data-p8-ready="false">
          <div className="flex items-center gap-1.5 text-primary">
            <ClipboardCheck className="size-3.5" />
            <p className="label-xs" style={{ color: "inherit" }}>Investigasi lapangan · P8</p>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Pilih line atau trafo pada SLD atau daftar prioritas P7 untuk membuka bukti interval, jalur terkait, dan checklist verifikasi lapangan.
          </p>
        </div>
        <FieldAuditPanel />
      </>
    );
  }

  const completed = new Set(completedIds);
  const upstreamLabel = plan.upstreamElementIds.length ? plan.upstreamElementIds.join(" → ") : "langsung dari root";
  const downstreamLabel = plan.downstreamElementIds.length
    ? `${plan.downstreamElementIds.slice(0, 4).join(" · ")}${plan.downstreamElementIds.length > 4 ? ` +${plan.downstreamElementIds.length - 4}` : ""}`
    : "tidak ada elemen lanjutan";

  return (
    <>
      <div
        className="rounded-md border border-primary/20 bg-primary/[0.035] p-2.5"
        data-p8-investigation="true"
        data-p8-ready="true"
        data-p8-element-id={plan.elementId}
        data-p8-priority-rank={plan.priorityRank ?? undefined}
        data-p8-priority-status={plan.priorityStatus ?? undefined}
        data-p8-priority-score={plan.priorityScore?.toFixed(3)}
        data-p8-dominant-factor={plan.dominantFactor}
        data-p8-anchor-time={plan.anchorTime}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-primary">
              <ClipboardCheck className="size-3.5 shrink-0" />
              <p className="label-xs" style={{ color: "inherit" }}>Investigasi lapangan · P8</p>
            </div>
            <p className="mt-1 text-[10px] font-semibold leading-snug text-foreground" data-p8-summary="true">{plan.summary}</p>
          </div>
          <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold", statusTone(plan.priorityStatus))}>
            {plan.priorityRank ? `#${plan.priorityRank} · ` : ""}{statusLabel(plan.priorityStatus)}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5" data-p8-evidence-grid="true">
          <EvidenceCard label="Susut puncak" value={plan.worstLoss ? `${plan.worstLoss.lossKw.toFixed(3)} kW` : "—"} detail={plan.worstLoss?.time ?? "—"} dataName="loss" numericValue={plan.worstLoss?.lossKw} time={plan.worstLoss?.time} />
          <EvidenceCard label="Loading maks." value={plan.worstLoading ? `${plan.worstLoading.loadingPercent.toFixed(1)}%` : "—"} detail={plan.worstLoading?.time ?? "—"} dataName="loading" numericValue={plan.worstLoading?.loadingPercent} time={plan.worstLoading?.time} />
          <EvidenceCard label="Tegangan min." value={plan.worstVoltage ? `${plan.worstVoltage.voltagePu.toFixed(3)} pu` : "—"} detail={plan.worstVoltage ? `${plan.worstVoltage.busId} · ${plan.worstVoltage.time}` : "—"} dataName="voltage" numericValue={plan.worstVoltage?.voltagePu} time={plan.worstVoltage?.time} />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1 text-[8.5px] text-muted-foreground" data-p8-score-breakdown="true">
          <ScorePart label="Susut" value={plan.scorePoints.loss} name="loss" />
          <ScorePart label="Loading" value={plan.scorePoints.loading} name="loading" />
          <ScorePart label="Tegangan" value={plan.scorePoints.voltage} name="voltage" />
        </div>

        <div className="mt-2 rounded-md border border-border/40 bg-surface-2/40 px-2 py-1.5 text-[9px] leading-relaxed text-muted-foreground" data-p8-route="true">
          <div className="flex items-center gap-1.5 text-foreground"><Route className="size-3 text-primary" /><span className="font-semibold">Jalur terkait</span></div>
          <p className="mt-1" data-p8-upstream-count={plan.upstreamElementIds.length}><span className="text-foreground">Upstream:</span> {upstreamLabel} → {plan.elementId}</p>
          <p data-p8-downstream-count={plan.downstreamElementIds.length}><span className="text-foreground">Downstream:</span> {downstreamLabel}</p>
          <p data-p8-downstream-customers={plan.downstreamCustomers}><span className="text-foreground">Cakupan:</span> {plan.downstreamBusIds.length} bus · {plan.downstreamCustomers} pelanggan downstream</p>
        </div>

        <div className="mt-2" data-p8-checklist="true">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold text-foreground"><Clock3 className="size-3 text-primary" />Checklist verifikasi</div>
            <span className="numeric text-[8.5px] text-muted-foreground" data-p8-check-progress="true">{completedIds.length}/{plan.checklist.length}</span>
          </div>
          <div className="mt-1.5 space-y-1">
            {plan.checklist.map((item) => {
              const checked = completed.has(item.id);
              return (
                <button key={item.id} type="button" aria-pressed={checked} onClick={() => onToggle(item.id)} className={cn("flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors", checked ? "border-success/30 bg-success/5" : "border-border/40 bg-surface-2/35 hover:border-primary/35")} data-p8-check-id={item.id} data-p8-check-complete={checked ? "true" : "false"}>
                  <span className={cn("mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm border", checked ? "border-success bg-success/15 text-success" : "border-border text-transparent")}><Check className="size-2.5" /></span>
                  <span className="min-w-0"><span className="block text-[9px] font-semibold leading-snug text-foreground">{item.title}</span><span className="mt-0.5 block text-[8px] leading-snug text-muted-foreground">{item.evidence}</span></span>
                </button>
              );
            })}
          </div>
        </div>

        <FieldMeasurementWorkspace plan={plan} />

        <p className="mt-1.5 text-[8px] leading-relaxed text-muted-foreground/75">
          Centang hanya setelah verifikasi lapangan. Status checklist dan evidence P9 tersimpan di memori selama Field Mode aktif dan tidak mengubah hasil physics.
        </p>
      </div>
      <FieldAuditPanel />
    </>
  );
}

function EvidenceCard({ label, value, detail, dataName, numericValue, time }: { label: string; value: string; detail: string; dataName: string; numericValue?: number | undefined; time?: string | undefined }) {
  return (
    <div className="rounded-md border border-border/40 bg-surface-2/45 px-2 py-1.5" data-p8-worst={dataName} data-p8-worst-value={numericValue == null ? undefined : numericValue.toFixed(6)} data-p8-worst-time={time}>
      <p className="text-[8px] text-muted-foreground">{label}</p>
      <p className="numeric mt-0.5 text-[9.5px] font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 truncate text-[7.5px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function ScorePart({ label, value, name }: { label: string; value: number; name: string }) {
  return <span className="rounded bg-surface-2/45 px-1.5 py-1" data-p8-score-part={name} data-p8-score-points={value.toFixed(4)}>{label} <span className="numeric text-foreground">{value.toFixed(1)}</span></span>;
}

function statusLabel(status: FieldInvestigationPlan["priorityStatus"]) {
  if (status === "CRITICAL") return "KRITIS";
  if (status === "ATTENTION") return "PERHATIAN";
  if (status === "WATCH") return "PANTAU";
  if (status === "NORMAL") return "NORMAL";
  return "ASET";
}

function statusTone(status: FieldInvestigationPlan["priorityStatus"]) {
  if (status === "CRITICAL") return "border-destructive/30 bg-destructive/5 text-destructive";
  if (status === "ATTENTION") return "border-warn/30 bg-warn/5 text-warn";
  if (status === "WATCH") return "border-primary/30 bg-primary/5 text-primary";
  return "border-success/25 bg-success/5 text-success";
}

import { AlertTriangle, CheckCircle2, Database, Ruler, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FieldInvestigationPlan } from "@/lib/sdl/fieldInvestigation";
import {
  FIELD_LOADING_RECONCILIATION_TOLERANCE_POINTS,
  FIELD_VOLTAGE_RECONCILIATION_TOLERANCE_PERCENT,
  type FieldMeasurementContext,
  type FieldMeasurementRecord,
  type FieldMeasurementReconciliation,
  type FieldMeasurementSide,
} from "@/lib/sdl/fieldMeasurement";
import { cn } from "@/lib/utils";

interface Props {
  plan: FieldInvestigationPlan | null;
  intervals: string[];
  context: FieldMeasurementContext | null;
  record: FieldMeasurementRecord | null;
  reconciliation: FieldMeasurementReconciliation | null;
  onTimeChange: (time: string) => void;
  onSideChange: (side: FieldMeasurementSide) => void;
  onRecordChange: (patch: Partial<Pick<FieldMeasurementRecord, "currentA" | "voltageKv" | "reference">>) => void;
  onOpenDataset: () => void;
}

export function FieldMeasurementPanel({
  plan,
  intervals,
  context,
  record,
  reconciliation,
  onTimeChange,
  onSideChange,
  onRecordChange,
  onOpenDataset,
}: Props) {
  if (!plan || !context || !reconciliation) {
    return (
      <div className="mt-3 rounded-md border border-border/45 bg-surface-2/35 p-2.5" data-p9-reconciliation="true" data-p9-ready="false">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Ruler className="size-3.5" />
          <p className="label-xs" style={{ color: "inherit" }}>Rekonsiliasi pengukuran · P9</p>
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
          Pilih line atau trafo untuk membandingkan hasil ukur lapangan dengan model pada interval dan sisi aset yang sama.
        </p>
      </div>
    );
  }

  const status = reconciliation.status;
  return (
    <div
      className="mt-3 rounded-md border border-border/55 bg-surface-2/30 p-2.5"
      data-p9-reconciliation="true"
      data-p9-ready="true"
      data-p9-element-id={context.elementId}
      data-p9-time={context.time}
      data-p9-side={context.side}
      data-p9-status={status}
      data-p9-model-loading={attrNumber(context.modelLoadingPercent)}
      data-p9-model-voltage-pu={attrNumber(context.modelVoltagePu)}
      data-p9-rated-current-a={attrNumber(context.ratedCurrentA)}
      data-p9-nominal-kv={attrNumber(context.nominalKv)}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-primary">
            <Ruler className="size-3.5" />
            <p className="label-xs" style={{ color: "inherit" }}>Rekonsiliasi pengukuran · P9</p>
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
            Bandingkan pengukuran aktual dengan model tanpa mengubah parameter solver secara otomatis.
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <label className="text-[8px] text-muted-foreground">
          Interval ukur
          <select
            value={context.time}
            onChange={(event) => onTimeChange(event.target.value)}
            className="mt-1 h-7 w-full rounded-md border border-border/55 bg-background px-2 text-[9px] text-foreground outline-none focus:border-primary/50"
            data-p9-time-select="true"
          >
            {intervals.map((time) => <option key={time} value={time}>{time}</option>)}
          </select>
        </label>
        <label className="text-[8px] text-muted-foreground">
          Sisi ukur
          <select
            value={context.side}
            onChange={(event) => onSideChange(event.target.value as FieldMeasurementSide)}
            className="mt-1 h-7 w-full rounded-md border border-border/55 bg-background px-2 text-[9px] text-foreground outline-none focus:border-primary/50"
            data-p9-side-select="true"
          >
            <option value="FROM">FROM · {plan.fromBus}</option>
            <option value="TO">TO · {plan.toBus}</option>
          </select>
        </label>
      </div>

      <div className="mt-2 rounded-md border border-border/40 bg-background/35 px-2 py-1.5 text-[8.5px] leading-relaxed text-muted-foreground" data-p9-model-context="true">
        <p><span className="font-medium text-foreground">Model:</span> loading {fmt(context.modelLoadingPercent, 1)}% · arus ekuiv. {fmt(context.modelEquivalentCurrentA, 1)} A · V min {fmt(context.modelVoltagePu, 3)} pu ({fmt(context.modelVoltageKv, 3)} kV)</p>
        <p className="mt-0.5"><span className="font-medium text-foreground">Basis sisi:</span> {context.busId} · nominal {fmt(context.nominalKv, 3)} kV · rating arus {fmt(context.ratedCurrentA, 1)} A</p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <MeasurementInput
          label="Arus fase maks."
          unit="A"
          value={record?.currentA ?? null}
          onValue={(value) => onRecordChange({ currentA: value })}
          dataName="current"
        />
        <MeasurementInput
          label="Tegangan minimum"
          unit="kV"
          value={record?.voltageKv ?? null}
          onValue={(value) => onRecordChange({ voltageKv: value })}
          dataName="voltage"
        />
      </div>

      <label className="mt-1.5 block text-[8px] text-muted-foreground">
        Referensi alat / titik ukur (opsional)
        <input
          type="text"
          value={record?.reference ?? ""}
          onChange={(event) => onRecordChange({ reference: event.target.value })}
          placeholder="mis. clamp meter QF-LV"
          className="mt-1 h-7 w-full rounded-md border border-border/55 bg-background px-2 text-[9px] text-foreground outline-none placeholder:text-muted-foreground/55 focus:border-primary/50"
          data-p9-reference="true"
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-1.5" data-p9-comparison="true">
        <ComparisonCard
          title="Loading"
          model={fmtPercent(reconciliation.loading.modelValue)}
          measured={fmtPercent(reconciliation.loading.measuredValue)}
          difference={formatSigned(reconciliation.loading.difference, " pp")}
          status={reconciliation.loading.status}
          dataName="loading"
        />
        <ComparisonCard
          title="Tegangan"
          model={fmtPercent(reconciliation.voltage.modelValue)}
          measured={fmtPercent(reconciliation.voltage.measuredValue)}
          difference={formatSigned(reconciliation.voltage.difference, " pp")}
          status={reconciliation.voltage.status}
          dataName="voltage"
        />
      </div>

      <div className={cn("mt-2 rounded-md border px-2 py-1.5 text-[8.5px] leading-relaxed", statusBoxTone(status))} data-p9-summary="true">
        <div className="flex items-start gap-1.5">
          {status === "MATCH" ? <CheckCircle2 className="mt-0.5 size-3 shrink-0" /> : status === "DISCREPANCY" ? <AlertTriangle className="mt-0.5 size-3 shrink-0" /> : <ShieldQuestion className="mt-0.5 size-3 shrink-0" />}
          <span>{reconciliation.summary}</span>
        </div>
      </div>

      <div className="mt-2 space-y-1" data-p9-review-hints="true">
        {reconciliation.reviewHints.map((hint) => (
          <p key={hint} className="rounded bg-background/30 px-2 py-1 text-[8px] leading-relaxed text-muted-foreground">• {hint}</p>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/40 pt-2">
        <p className="text-[7.5px] leading-relaxed text-muted-foreground">
          Ambang cockpit: ±{FIELD_LOADING_RECONCILIATION_TOLERANCE_POINTS} pp loading · ±{FIELD_VOLTAGE_RECONCILIATION_TOLERANCE_PERCENT}% nominal tegangan. Bukan setting proteksi/standar operasi.
        </p>
        {status === "DISCREPANCY" && (
          <Button variant="outline" size="sm" onClick={onOpenDataset} className="h-7 shrink-0 gap-1.5 bg-transparent px-2 text-[8.5px]" data-p9-open-dataset="true">
            <Database className="size-3" /> Tinjau dataset
          </Button>
        )}
      </div>
    </div>
  );
}

function MeasurementInput({ label, unit, value, onValue, dataName }: { label: string; unit: string; value: number | null; onValue: (value: number | null) => void; dataName: string }) {
  return (
    <label className="text-[8px] text-muted-foreground">
      {label}
      <div className="relative mt-1">
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(event) => onValue(parsePositive(event.target.value))}
          className="h-7 w-full rounded-md border border-border/55 bg-background px-2 pr-8 text-[9px] text-foreground outline-none focus:border-primary/50"
          data-p9-input={dataName}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-muted-foreground">{unit}</span>
      </div>
    </label>
  );
}

function ComparisonCard({ title, model, measured, difference, status, dataName }: { title: string; model: string; measured: string; difference: string; status: FieldMeasurementReconciliation["loading"]["status"]; dataName: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/30 p-1.5" data-p9-signal={dataName} data-p9-signal-status={status}>
      <div className="flex items-center justify-between gap-2"><span className="text-[8px] font-semibold text-foreground">{title}</span><span className={cn("text-[7px] font-bold", signalTone(status))}>{signalLabel(status)}</span></div>
      <p className="numeric mt-1 text-[8px] text-muted-foreground">model {model}</p>
      <p className="numeric text-[8px] text-muted-foreground">ukur {measured}</p>
      <p className="numeric mt-0.5 text-[8px] text-foreground">Δ {difference}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: FieldMeasurementReconciliation["status"] }) {
  return <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[7.5px] font-bold", badgeTone(status))} data-p9-status-badge="true">{status === "MATCH" ? "SESUAI" : status === "DISCREPANCY" ? "SELISIH" : "BELUM LENGKAP"}</span>;
}

function signalLabel(status: FieldMeasurementReconciliation["loading"]["status"]) {
  if (status === "MATCH") return "SESUAI";
  if (status === "DISCREPANCY") return "SELISIH";
  if (status === "UNAVAILABLE") return "N/A";
  return "BELUM";
}

function signalTone(status: FieldMeasurementReconciliation["loading"]["status"]) {
  if (status === "MATCH") return "text-success";
  if (status === "DISCREPANCY") return "text-warn";
  return "text-muted-foreground";
}

function badgeTone(status: FieldMeasurementReconciliation["status"]) {
  if (status === "MATCH") return "border-success/30 bg-success/5 text-success";
  if (status === "DISCREPANCY") return "border-warn/30 bg-warn/5 text-warn";
  return "border-border/55 bg-background/40 text-muted-foreground";
}

function statusBoxTone(status: FieldMeasurementReconciliation["status"]) {
  if (status === "MATCH") return "border-success/25 bg-success/5 text-success";
  if (status === "DISCREPANCY") return "border-warn/25 bg-warn/5 text-warn";
  return "border-border/45 bg-background/35 text-muted-foreground";
}

function parsePositive(raw: string) {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function fmt(value: number | null, digits: number) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function fmtPercent(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}%`;
}

function formatSigned(value: number | null, suffix: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function attrNumber(value: number | null) {
  return value == null || !Number.isFinite(value) ? undefined : value.toFixed(8);
}

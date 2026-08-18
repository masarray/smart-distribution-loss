import type { ReactNode } from "react";
import { AlertTriangle, Crosshair, Database, ShieldCheck, Sigma, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FieldUnexplainedLossReport } from "@/lib/sdl/fieldUnexplainedLoss";
import { cn } from "@/lib/utils";

interface Props {
  report: FieldUnexplainedLossReport;
  onOpenDataset: () => void;
}

export function FieldUnexplainedLossPanel({ report, onOpenDataset }: Props) {
  const tone = statusTone(report.status);
  const netTone = report.unexplainedEnergyKwh > report.dailyToleranceKwh
    ? "text-warn"
    : report.unexplainedEnergyKwh < -report.dailyToleranceKwh
      ? "text-destructive"
      : "text-success";

  return (
    <div
      className={cn("rounded-md border p-2.5", tone.shell)}
      data-p13-unexplained="true"
      data-p13-status={report.status}
      data-p13-measured-kwh={report.measuredSourceEnergyKwh.toFixed(9)}
      data-p13-metered-kwh={report.meteredEnergyKwh.toFixed(9)}
      data-p13-technical-kwh={report.frozenTechnicalLossKwh.toFixed(9)}
      data-p13-full-day-technical-kwh={report.fullDayTechnicalLossKwh.toFixed(9)}
      data-p13-unexplained-kwh={report.unexplainedEnergyKwh.toFixed(9)}
      data-p13-positive-unexplained-kwh={report.positiveUnexplainedEnergyKwh.toFixed(9)}
      data-p13-over-accounted-kwh={report.overAccountedEnergyKwh.toFixed(9)}
      data-p13-positive-rate={report.positiveUnexplainedRatePercent.toFixed(9)}
      data-p13-persistence={report.positivePersistencePercent.toFixed(9)}
      data-p13-measurement-intervals={report.measurementIntervals}
      data-p13-bad-measurement-intervals={report.badMeasurementIntervals}
      data-p13-theft-proof="false"
      data-p13-calibration-absorption={report.policy.calibrationAbsorption}
      data-p13-localization={report.policy.localization}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={cn("flex items-center gap-1.5", tone.text)}>
            <Sigma className="size-3.5 shrink-0" />
            <p className="label-xs" style={{ color: "inherit" }}>Unexplained energy intelligence · P13</p>
          </div>
          <p className="mt-1 text-[10px] font-semibold leading-snug text-foreground" data-p13-headline="true">{report.headline}</p>
          <p className="mt-0.5 text-[8px] leading-relaxed text-muted-foreground">{report.reason}</p>
        </div>
        <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[7.5px] font-bold", tone.badge)} data-p13-status-label="true">
          {statusLabel(report.status)}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5" data-p13-energy-balance="true">
        <Metric icon={<Zap className="size-3" />} label="Source terukur" value={formatEnergy(report.measuredSourceEnergyKwh)} detail={`${report.measurementIntervals}/96 interval`} />
        <Metric icon={<Database className="size-3" />} label="AMI terhitung" value={formatEnergy(report.meteredEnergyKwh)} detail="interval sejajar source" />
        <Metric icon={<ShieldCheck className="size-3" />} label="Technical loss" value={formatEnergy(report.frozenTechnicalLossKwh)} detail="dibekukan dari physics" />
        <Metric icon={<AlertTriangle className="size-3" />} label="Residual bersih" value={signedEnergy(report.unexplainedEnergyKwh)} detail={`tolerance ±${report.dailyToleranceKwh.toFixed(2)} kWh`} valueClass={netTone} />
      </div>

      <div className="mt-2 rounded-md border border-border/45 bg-background/35 px-2 py-1.5" data-p13-equation="true">
        <p className="text-[7.5px] font-semibold text-foreground">Energy balance yang dijaga</p>
        <p className="numeric mt-0.5 text-[7.5px] leading-relaxed text-muted-foreground">
          source terukur − AMI − technical loss physics = unexplained residual
        </p>
        <p className="mt-1 text-[7.5px] leading-relaxed text-muted-foreground">
          Residual <span className="font-semibold text-foreground">tidak boleh</span> dipakai untuk menaikkan AMI, technical loss, atau parameter jaringan secara otomatis.
        </p>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 text-[7.5px] text-muted-foreground">
        <span className="rounded bg-background/35 px-1.5 py-1">Positif <span className="numeric text-foreground">{report.positiveUnexplainedEnergyKwh.toFixed(2)} kWh</span></span>
        <span className="rounded bg-background/35 px-1.5 py-1">Persisten <span className="numeric text-foreground">{report.positivePersistencePercent.toFixed(1)}%</span></span>
        <span className="rounded bg-background/35 px-1.5 py-1">Rate <span className="numeric text-foreground">{report.positiveUnexplainedRatePercent.toFixed(2)}%</span></span>
      </div>

      {report.topPositiveIntervals.length > 0 && (
        <div className="mt-2" data-p13-top-intervals="true">
          <div className="flex items-center gap-1.5 text-[8px] font-semibold text-foreground"><Crosshair className="size-3 text-primary" />Interval residual positif terbesar</div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {report.topPositiveIntervals.map((point) => (
              <div key={point.index} className="rounded border border-border/40 bg-background/30 px-1.5 py-1" data-p13-top-time={point.time} data-p13-top-kw={point.unexplainedKw.toFixed(9)}>
                <p className="numeric text-[8px] font-semibold text-foreground">{point.time}</p>
                <p className="numeric mt-0.5 text-[7px] text-warn">+{point.unexplainedKw.toFixed(2)} kW</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 rounded-md border border-primary/15 bg-primary/[0.035] px-2 py-1.5 text-[7.5px] leading-relaxed text-muted-foreground" data-p13-safety="true">
        <p><span className="font-semibold text-foreground">Interpretasi:</span> unexplained energy adalah sinyal investigasi NTL, <span className="font-semibold text-foreground">bukan bukti pencurian</span>.</p>
        <p className="mt-0.5"><span className="font-semibold text-foreground">Lokalisasi:</span> P13 v1 hanya feeder-level. Boundary meter downstream diperlukan untuk mempersempit lokasi secara defensible.</p>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[7.5px] leading-relaxed text-muted-foreground">{report.action}</p>
        <Button variant="outline" size="sm" onClick={onOpenDataset} className="h-7 shrink-0 gap-1 bg-transparent px-2 text-[8px]" data-p13-open-dataset="true">
          <Database className="size-3" /> Data
        </Button>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, detail, valueClass }: { icon: ReactNode; label: string; value: string; detail: string; valueClass?: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/35 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[7.5px] text-muted-foreground">{icon}<span>{label}</span></div>
      <p className={cn("numeric mt-0.5 text-[9px] font-semibold text-foreground", valueClass)}>{value}</p>
      <p className="mt-0.5 truncate text-[6.8px] text-muted-foreground/80">{detail}</p>
    </div>
  );
}

function statusLabel(status: FieldUnexplainedLossReport["status"]) {
  if (status === "FIELD_INVESTIGATION_PRIORITY") return "PRIORITAS LAPANGAN";
  if (status === "UNEXPLAINED_LOSS") return "UNEXPLAINED LOSS";
  if (status === "DATA_QUALITY_SUSPECT") return "CEK DATA";
  if (status === "NORMAL") return "NORMAL";
  return "BELUM TERSEDIA";
}

function statusTone(status: FieldUnexplainedLossReport["status"]) {
  if (status === "FIELD_INVESTIGATION_PRIORITY") return { shell: "border-destructive/30 bg-destructive/[0.035]", text: "text-destructive", badge: "border-destructive/30 bg-destructive/7 text-destructive" };
  if (status === "UNEXPLAINED_LOSS") return { shell: "border-warn/30 bg-warn/[0.035]", text: "text-warn", badge: "border-warn/30 bg-warn/7 text-warn" };
  if (status === "DATA_QUALITY_SUSPECT") return { shell: "border-primary/25 bg-primary/[0.025]", text: "text-primary", badge: "border-primary/30 bg-primary/7 text-primary" };
  if (status === "NORMAL") return { shell: "border-success/25 bg-success/[0.025]", text: "text-success", badge: "border-success/30 bg-success/7 text-success" };
  return { shell: "border-border/50 bg-surface-2/30", text: "text-muted-foreground", badge: "border-border/50 bg-surface-2 text-muted-foreground" };
}

function formatEnergy(value: number) {
  return `${value.toFixed(2)} kWh`;
}

function signedEnergy(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} kWh`;
}

import { useMemo, useState, type ReactNode } from "react";
import { CircuitBoard, Database, Gauge, Percent, Play, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SingleLineDiagram } from "@/components/sdl/SingleLineDiagram";
import { LossProfileChart } from "@/components/sdl/LossProfileChart";
import { DataDrawer } from "@/components/sdl/DataDrawer";
import { DatasetManager } from "@/components/sdl/DatasetManager";
import { DetailDrawer } from "@/components/sdl/DetailDrawer";
import { OperatorDecisionStrip } from "@/components/sdl/OperatorDecisionStrip";
import { useEngine } from "@/lib/sdl/useEngine";
import { deriveAssets, fmt, type AssetId } from "@/lib/sdl/derive";
import {
  deriveOperationalMetrics,
  deriveOperatorDecision,
  summarizeLossSeries,
  type AnalysisStatus,
  type ConfidenceLevel,
} from "@/lib/sdl/operation";
import type { Preset } from "@/lib/sdl/types";
import { cn } from "@/lib/utils";

export default function App() {
  const { state, run } = useEngine();
  const [preset, setPreset] = useState<Preset>("poor");
  const [selected, setSelected] = useState<AssetId>("gd");
  const [dataDrawerOpen, setDataDrawerOpen] = useState(false);
  const [datasetManagerOpen, setDatasetManagerOpen] = useState(false);
  const [engineeringDrawerOpen, setEngineeringDrawerOpen] = useState(false);

  const assets = useMemo(
    () => deriveAssets(state.result, state.spot, state.tm),
    [state.result, state.spot, state.tm],
  );
  const active = assets.find((asset) => asset.id === selected) ?? assets[0];
  const running = state.status === "running";
  const energised = state.status === "running" || state.status === "done";

  const operational = deriveOperationalMetrics(
    selected,
    preset,
    state.result,
    state.spot,
    state.tm,
    active?.smartKwh,
  );
  const decision = deriveOperatorDecision(selected, operational, state.result, state.spot, state.tm);

  const assetMetrics = useMemo(
    () =>
      assets.map((asset) => ({
        asset,
        metric: deriveOperationalMetrics(
          asset.id,
          preset,
          state.result,
          state.spot,
          state.tm,
          asset.smartKwh,
        ),
      })),
    [assets, preset, state.result, state.spot, state.tm],
  );

  const selectedSeries = useMemo(
    () => state.result?.asset_series?.[selected] ?? [],
    [state.result, selected],
  );
  const selectedSummary = useMemo(() => summarizeLossSeries(selectedSeries), [selectedSeries]);
  const validation = validationBenefit(active?.convErr, active?.smartErr);
  const feederComponents = assets.filter((asset) => asset.id !== "feeder");
  const feederFormulaReady = feederComponents.every((asset) => asset.smartKwh != null) && active?.smartKwh != null;

  const progressTitle =
    state.status === "running"
      ? "Analisis berjalan"
      : state.status === "done"
        ? "Analisis selesai"
        : state.status === "error"
          ? "Analisis gagal"
          : "Siap menjalankan simulasi";
  const progressMeta =
    state.status === "running"
      ? `${state.intervals.done}/${state.intervals.total} interval · ${Math.round(state.progress.percent)}%`
      : state.status === "done"
        ? `${state.intervals.total} interval · hasil siap`
        : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border/70 bg-surface px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <CircuitBoard className="size-4.5" />
          </span>
          <div className="leading-tight">
            <h1 className="font-display text-sm font-semibold">Smart Distribution Loss</h1>
            <p className="label-xs">Monitoring susut distribusi</p>
          </div>
        </div>

        <nav className="ml-4 flex items-center gap-1 rounded-lg bg-surface-2 p-1" aria-label="Pilih aset">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setSelected(asset.id)}
              aria-current={selected === asset.id ? "true" : undefined}
              data-asset-selector={asset.id}
              data-selected={selected === asset.id ? "true" : "false"}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                selected === asset.id
                  ? "border-primary/35 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-surface hover:text-foreground",
              )}
            >
              {asset.short}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDatasetManagerOpen(true)}
            aria-label="Kelola dataset"
            data-action-level="secondary"
            className="hidden items-center gap-1.5 rounded-md border border-border/70 bg-transparent px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:bg-surface-2 hover:text-foreground lg:flex"
          >
            <Database className="size-3" /> Dataset
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="label-xs">Skenario data</span>
            <Select value={preset} onValueChange={(value) => setPreset(value as Preset)} disabled={running}>
              <SelectTrigger className="h-8 w-32 border-border/70 bg-surface-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Baik</SelectItem>
                <SelectItem value="typical">Cukup</SelectItem>
                <SelectItem value="poor">Terbatas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            data-action-level="primary"
            data-run-status={state.status}
            aria-busy={running}
            className="h-8 gap-1.5 px-3.5 text-xs font-semibold ring-1 ring-primary/25"
            onClick={() => run(preset)}
            disabled={running}
          >
            <Play className="size-3.5" />
            {running ? "Menghitung…" : "Jalankan simulasi"}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "relative h-8 shrink-0 border-b border-border/50 transition-colors",
          running
            ? "bg-primary/5"
            : state.status === "done"
              ? "bg-success/5"
              : state.status === "error"
                ? "bg-destructive/5"
                : "bg-surface-2/45",
        )}
        data-analysis-run-state={state.status}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="flex h-full items-center gap-3 px-4 text-[11px]">
          <span
            className={cn(
              "size-1.5 rounded-full",
              running
                ? "animate-pulse bg-primary"
                : state.status === "done"
                  ? "bg-success/75"
                  : state.status === "error"
                    ? "bg-destructive/80"
                    : "bg-muted-foreground/55",
            )}
          />
          <span
            className={cn(
              "font-medium",
              running
                ? "text-foreground"
                : state.status === "done"
                  ? "text-success"
                  : state.status === "error"
                    ? "text-destructive"
                    : "text-muted-foreground/90",
            )}
          >
            {progressTitle}
          </span>
          <span className="hidden text-muted-foreground/65 md:inline">
            Aset <span className="font-medium text-foreground/85">{active?.short}</span>
          </span>
          {progressMeta && <span className="numeric ml-auto text-muted-foreground/75">{progressMeta}</span>}
        </div>
        <div
          className={cn(
            "absolute bottom-0 left-0 h-0.5 transition-all duration-700 ease-out",
            running
              ? "bg-primary/85"
              : state.status === "done"
                ? "bg-success/30"
                : state.status === "error"
                  ? "bg-destructive/55"
                  : "bg-muted-foreground/15",
          )}
          style={{ width: `${state.progress.percent}%` }}
        />
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_336px] gap-3 p-3">
        <section className="panel flex min-h-0 flex-col p-3">
          <div>
            <p className="label-xs">Kualitas data aset</p>
            <p className="mt-0.5 font-display text-sm">{operatorQualityHeadline(operational.confidence)}</p>
          </div>

          <div className="mt-4 space-y-2.5">
            {operational.qualityRows.map((metric) => (
              <div key={metric.label}>
                <div className="flex justify-between gap-3 text-[11px]">
                  <span className="truncate text-muted-foreground">{operatorMetricLabel(metric.label)}</span>
                  <span className="numeric shrink-0">{metric.percent.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      metric.percent > 85 ? "bg-success" : metric.percent > 55 ? "bg-warn" : "bg-destructive",
                    )}
                    style={{ width: `${metric.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            data-action-level="secondary"
            className="mt-4 h-8 w-full gap-2 bg-transparent text-xs"
            onClick={() => setDataDrawerOpen(true)}
          >
            <Database className="size-3.5" />
            Lihat data
          </Button>
        </section>

        <section className="flex min-h-0 flex-col gap-3">
          <div className="panel relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute left-3 top-3 z-10">
              <p className="label-xs">Jaringan distribusi</p>
              <p className="font-display text-sm">Penyulang 20 kV → GD-01 → 3 JTR → 90 pelanggan</p>
            </div>
            <SingleLineDiagram
              selected={selected}
              onSelect={setSelected}
              energised={energised}
              intensity={running ? 0.9 : 0.5}
              gdLossKwh={state.result?.comparison.smart.loss_kwh ?? null}
              mvLossKwh={state.spot?.comparison.smart.loss_kwh ?? null}
              tmLossKwh={state.tm?.comparison.smart.loss_kwh ?? null}
            />
          </div>

          <div className="panel h-[220px] shrink-0 p-3 pb-1">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="label-xs">Profil susut · {active?.short} · 24 jam</p>
                {selectedSummary.peakSmartKw != null && selectedSummary.peakTime != null && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <span data-manager-peak="true">
                      Puncak <span className="numeric text-foreground">{selectedSummary.peakTime}</span>
                      {" · "}<span className="numeric text-foreground">{selectedSummary.peakSmartKw.toFixed(3)} kW</span>
                    </span>
                    {selectedSummary.worstTime != null && selectedSummary.worstDeltaKw != null && (
                      <span data-manager-worst-summary="true">
                        Selisih terbesar <span className="numeric text-foreground">{selectedSummary.worstTime}</span>
                        {" · "}<span className="numeric text-warn">{Math.abs(selectedSummary.worstDeltaKw).toFixed(3)} kW</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-chart-2" /> Model dasar</span>
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-chart-1" /> Smart Engine</span>
              </div>
            </div>
            <div className="mt-1 h-[166px]">
              <LossProfileChart series={selectedSeries} />
            </div>
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3" data-right-column="true">
          <div className="panel p-2.5" data-selected-asset-panel="true">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="label-xs">Aset terpilih</p>
                <p className="truncate font-display text-sm">{active?.label}</p>
              </div>
              <span className="rounded-md bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                {operatorDomainLabel(active?.domain)}
              </span>
            </div>

            <OperatorDecisionStrip decision={decision} />

            {selected === "feeder" && (
              <div className="mt-2 rounded-md border border-border/55 bg-surface-2/55 p-2" data-feeder-rollup="true">
                <span className="label-xs">Total Penyulang 20 kV</span>
                <div className="mt-1.5 space-y-1">
                  {feederComponents.map((component) => (
                    <div key={component.id} className="grid grid-cols-[minmax(0,1fr)_78px_auto] items-center gap-2 text-[10px]" data-feeder-component={component.id}>
                      <span className="truncate text-foreground">{component.short}</span>
                      <span className="truncate text-muted-foreground" data-feeder-role={component.id}>{feederRole(component.id)}</span>
                      <span className="numeric shrink-0">{fmt(component.smartKwh, 1)} kWh</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between border-t border-border/50 pt-1.5 text-[10px]">
                  <span className="font-medium text-foreground">Total</span>
                  <span className="numeric font-semibold text-primary" data-feeder-formula="true">
                    {feederFormulaReady ? `${fmt(active?.smartKwh, 1)} kWh/hari` : "—"}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Kpi
                icon={<Zap className="size-3.5" />}
                label="Smart Engine"
                value={fmt(active?.smartKwh, 2)}
                unit="kWh/hari"
                tone="primary"
                title="Estimasi susut teknis dari Smart Engine."
              />
              <Kpi
                icon={<Gauge className="size-3.5" />}
                label="Model dasar"
                value={fmt(active?.convKwh, 2)}
                unit="kWh/hari"
                tone="warn"
                title="Estimasi sebelum koreksi Smart Engine."
              />
              <Kpi
                icon={<Percent className="size-3.5" />}
                label="Rasio susut"
                value={operational.lossRatePercent == null ? "—" : `${operational.lossRatePercent.toFixed(2)}%`}
                unit="energi tersalurkan"
                tone="primary"
              />
              <Kpi
                icon={<ShieldCheck className="size-3.5" />}
                label="Validasi"
                value={validation == null ? "—" : `${validation.gainPoints >= 0 ? "+" : ""}${validation.gainPoints.toFixed(2)}`}
                unit="poin akurasi"
                tone={validation == null || validation.gainPoints >= 0 ? "success" : "warn"}
              />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                data-action-level="secondary"
                className="h-8 gap-2 bg-transparent text-xs font-semibold"
                onClick={() => setDataDrawerOpen(true)}
              >
                <Database className="size-3.5" /> Data
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-action-level="secondary"
                className="h-8 gap-2 bg-transparent text-xs font-semibold"
                onClick={() => setEngineeringDrawerOpen(true)}
              >
                <ShieldCheck className="size-3.5" /> Detail teknis
              </Button>
            </div>
          </div>

          <div className="panel min-h-0 overflow-auto p-2.5" data-asset-status-panel="true">
            <p className="label-xs mb-2">Status aset</p>
            <div className="space-y-1.5">
              {assetMetrics.map(({ asset, metric }) => {
                const selectedRow = selected === asset.id;
                const exception = isException(metric.status);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelected(asset.id)}
                    data-analysis-status={metric.status}
                    data-selected={selectedRow ? "true" : "false"}
                    className={cn(
                      "w-full rounded-md border px-2.5 py-1.5 text-left transition-colors",
                      selectedRow
                        ? "border-primary/35 bg-primary/5"
                        : exception
                          ? statusBorderClass(metric.status)
                          : "border-border/45 bg-surface-2/70 hover:border-primary/20",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
                        <i className={cn("size-1.5 shrink-0 rounded-full", statusDotClass(metric.status))} />
                        <span className="truncate">{asset.short}</span>
                      </span>
                      <span className="numeric shrink-0 text-xs">
                        {fmt(asset.smartKwh, 1)} kWh
                        {metric.lossRatePercent != null ? ` · ${metric.lossRatePercent.toFixed(2)}%` : ""}
                      </span>
                    </div>
                    <div className={cn("mt-0.5 text-[10px] font-semibold", statusTextClass(metric.status))}>{statusLabel(metric.status)}</div>
                  </button>
                );
              })}
            </div>

            {state.status === "error" && (
              <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">{state.error}</p>
            )}
            {state.status === "done" && state.result && !state.result.gate.pass && (
              <p className="mt-2 rounded-md border border-destructive/35 bg-destructive/10 p-2 text-[10.5px] text-destructive">
                Perlu tinjau · buka Detail teknis.
              </p>
            )}
          </div>
        </section>
      </main>

      <DatasetManager open={datasetManagerOpen} onOpenChange={setDatasetManagerOpen} />

      {active && (
        <>
          <DataDrawer
            open={dataDrawerOpen}
            onOpenChange={setDataDrawerOpen}
            asset={active}
            result={state.result}
            spot={state.spot}
            tm={state.tm}
            preset={preset}
          />
          <DetailDrawer
            open={engineeringDrawerOpen}
            onOpenChange={setEngineeringDrawerOpen}
            asset={active}
            result={state.result}
            spot={state.spot}
            tm={state.tm}
            stages={state.stages}
          />
        </>
      )}
    </div>
  );
}

function isException(status: AnalysisStatus) {
  return status === "ATTENTION" || status === "REVIEW";
}

function validationBenefit(conventionalError: number | null | undefined, smartError: number | null | undefined) {
  if (conventionalError == null || smartError == null || !Number.isFinite(conventionalError) || !Number.isFinite(smartError)) {
    return null;
  }
  const conventionalAccuracy = Math.max(0, 100 - Math.abs(conventionalError));
  const smartAccuracy = Math.max(0, 100 - Math.abs(smartError));
  return { conventionalAccuracy, smartAccuracy, gainPoints: smartAccuracy - conventionalAccuracy };
}

function feederRole(id: AssetId) {
  if (id === "spot") return "Data terukur";
  if (id === "tm" || id === "gd") return "Dihitung sendiri";
  return "Total";
}

function operatorQualityHeadline(level: ConfidenceLevel) {
  if (level === "HIGH") return "Data lengkap";
  if (level === "MEDIUM") return "Data cukup";
  if (level === "LOW") return "Data terbatas";
  return "Perlu tinjau";
}

function operatorMetricLabel(label: string) {
  const labels: Record<string, string> = {
    "Load P/Q": "Beban terukur",
    Fasa: "Data fasa",
    Topologi: "Pemetaan jaringan",
    Timing: "Waktu pencatatan",
    "AMI coverage": "Meter tersedia",
    "Fasa diketahui": "Data fasa",
    "PF diketahui": "Faktor daya",
    "Mapping benar": "Pemetaan pelanggan",
    "Kanal MV": "Data pelanggan TM",
    "AMI GD-01": "Meter GD-01",
    "Fasa GD-01": "Data fasa GD-01",
    "Mapping GD-01": "Pemetaan GD-01",
  };
  return labels[label] ?? label;
}

function statusLabel(status: AnalysisStatus) {
  if (status === "NORMAL") return "NORMAL";
  if (status === "ATTENTION") return "PERHATIAN";
  if (status === "REVIEW") return "TINJAU";
  return "BELUM DIHITUNG";
}

function operatorDomainLabel(domain: string | undefined) {
  if (domain === "FEEDER") return "20 kV";
  if (domain === "MV") return "TM";
  if (domain === "LV") return "TR/JTR";
  return "—";
}

function statusDotClass(status: AnalysisStatus) {
  if (status === "NORMAL") return "bg-success";
  if (status === "ATTENTION") return "bg-warn";
  if (status === "REVIEW") return "bg-destructive";
  return "bg-muted-foreground/55";
}

function statusTextClass(status: AnalysisStatus) {
  if (status === "NORMAL") return "text-success";
  if (status === "ATTENTION") return "text-warn";
  if (status === "REVIEW") return "text-destructive";
  return "text-muted-foreground";
}

function statusBorderClass(status: AnalysisStatus) {
  if (status === "REVIEW") return "border-destructive/35 bg-destructive/5 hover:border-destructive/55";
  return "border-warn/30 bg-warn/5 hover:border-warn/45";
}

function Kpi({
  icon,
  label,
  value,
  unit,
  tone,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  tone: "primary" | "warn" | "success" | "danger";
  title?: string;
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warn"
        ? "text-warn"
        : tone === "success"
          ? "text-success"
          : "text-destructive";
  return (
    <div className="rounded-md bg-surface-2 p-2.5" title={title}>
      <div className={cn("flex items-center gap-1.5", toneClass)}>
        {icon}
        <span className="label-xs" style={{ color: "inherit" }}>{label}</span>
      </div>
      <p className="numeric mt-1 text-base font-semibold leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground">{unit}</p>
    </div>
  );
}

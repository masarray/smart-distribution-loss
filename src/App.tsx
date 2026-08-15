import { useMemo, useState } from "react";
import { CircuitBoard, Database, Gauge, Percent, Play, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SingleLineDiagram } from "@/components/sdl/SingleLineDiagram";
import { LossProfileChart } from "@/components/sdl/LossProfileChart";
import { DataDrawer } from "@/components/sdl/DataDrawer";
import { DatasetManager } from "@/components/sdl/DatasetManager";
import { DetailDrawer } from "@/components/sdl/DetailDrawer";
import { useEngine } from "@/lib/sdl/useEngine";
import { deriveAssets, fmt, type AssetId } from "@/lib/sdl/derive";
import {
  deriveOperationalMetrics,
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
  const active = assets.find((a) => a.id === selected) ?? assets[0];
  const running = state.status === "running";
  const energised = state.status === "running" || state.status === "done";

  const gdLossKwh = state.result?.comparison.smart.loss_kwh ?? null;
  const mvLossKwh = state.spot?.comparison.smart.loss_kwh ?? null;
  const tmLossKwh = state.tm?.comparison.smart.loss_kwh ?? null;

  const operational = deriveOperationalMetrics(
    selected,
    preset,
    state.result,
    state.spot,
    state.tm,
    active?.smartKwh,
  );

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
  const exceptionCount = assetMetrics.filter(({ metric }) => isException(metric.status)).length;

  const progressTitle =
    state.status === "running"
      ? "Analisis berjalan"
      : state.status === "done"
        ? "Analisis selesai"
        : state.status === "error"
          ? "Analisis gagal"
          : "Siap dianalisis";
  const progressDetail =
    state.status === "running"
      ? "Memproses profil 24 jam."
      : state.status === "done"
        ? "Hasil terbaru siap digunakan."
        : state.status === "error"
          ? "Buka detail engineering untuk melihat penyebab."
          : "Pilih kualitas data lalu jalankan simulasi.";

  const selectAsset = (id: AssetId) => {
    setSelected(id);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border/70 bg-surface px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <CircuitBoard className="size-4.5" />
          </span>
          <div className="leading-tight">
            <h1 className="font-display text-sm font-semibold">Smart Distribution Loss</h1>
            <p className="label-xs">Operator View · Loss Monitoring</p>
          </div>
        </div>

        <nav className="ml-4 flex items-center gap-1 rounded-lg bg-surface-2 p-1">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => selectAsset(a.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                selected === a.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {a.short}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDatasetManagerOpen(true)}
            aria-label="Kelola dataset"
            className="hidden items-center gap-1.5 rounded-md border border-warn/25 bg-warn/5 px-2 py-1.5 text-[10px] font-semibold tracking-wider text-warn transition-colors hover:border-warn/45 hover:bg-warn/10 lg:flex"
          >
            <Database className="size-3" /> DATA · DEMO SINTETIS
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="label-xs">Kualitas data</span>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)} disabled={running}>
              <SelectTrigger className="h-8 w-36 border-border/70 bg-surface-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Baik</SelectItem>
                <SelectItem value="typical">Cukup</SelectItem>
                <SelectItem value="poor">Terbatas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => run(preset)} disabled={running}>
            <Play className="size-3.5" />
            {running ? "Menghitung…" : "Jalankan simulasi"}
          </Button>
        </div>
      </header>

      <div className="relative h-8 shrink-0 border-b border-border/50 bg-surface-2/55">
        <div className="flex h-full items-center gap-3 px-4 text-[11px]">
          <span
            className={cn(
              "size-1.5 rounded-full",
              running ? "animate-pulse bg-warn" : state.status === "done" ? "bg-success/65" : "bg-muted-foreground/65",
            )}
          />
          <span
            className={cn(
              "font-medium transition-colors",
              running ? "text-foreground" : state.status === "done" ? "text-muted-foreground/90" : "text-muted-foreground",
            )}
          >
            {progressTitle}
          </span>
          <span className="truncate text-muted-foreground/75">{progressDetail}</span>
          <span className="numeric ml-auto text-muted-foreground/75">
            {state.intervals.done}/{state.intervals.total} interval · {Math.round(state.progress.percent)}%
          </span>
        </div>
        <div
          className={cn(
            "absolute bottom-0 left-0 h-0.5 transition-all duration-500",
            running ? "bg-primary/90" : state.status === "done" ? "bg-primary/25" : "bg-muted-foreground/20",
          )}
          style={{ width: `${state.progress.percent}%` }}
        />
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_336px] gap-3 p-3">
        <section className="panel flex min-h-0 flex-col p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label-xs">Kualitas data</p>
              <p className="mt-0.5 font-display text-sm">{operatorQualityHeadline(operational.confidence)}</p>
            </div>
            <ConfidenceBadge level={operational.confidence} />
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

          <div className="mt-4 rounded-md border border-border/45 bg-surface-2/45 p-3">
            <div className="flex items-center justify-between">
              <span className="label-xs">Keandalan hasil</span>
              <span className={cn("numeric text-sm font-semibold", confidenceTextClass(operational.confidence))}>
                {confidenceLabel(operational.confidence)}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {operational.qualityIssueCount === 0
                ? "Data utama cukup untuk analisis."
                : `${operational.qualityIssueCount} bagian data perlu diperhatikan.`}
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="mt-3 h-8 w-full gap-2 text-xs"
            onClick={() => setDataDrawerOpen(true)}
          >
            <Database className="size-3.5" />
            Lihat data &amp; input
          </Button>
        </section>

        <section className="flex min-h-0 flex-col gap-3">
          <div className="panel relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute left-3 top-3 z-10">
              <p className="label-xs">Jaringan distribusi · live</p>
              <p className="font-display text-sm">Penyulang 20 kV → GD-01 → 3 JTR → 90 pelanggan</p>
            </div>
            <SingleLineDiagram
              selected={selected}
              onSelect={selectAsset}
              energised={energised}
              intensity={running ? 0.9 : 0.5}
              gdLossKwh={gdLossKwh}
              mvLossKwh={mvLossKwh}
              tmLossKwh={tmLossKwh}
            />
          </div>
          <div className="panel h-[220px] shrink-0 p-3 pb-1">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="label-xs">Profil susut · {active?.short} · 24 jam · 96 interval</p>
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
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-chart-2" /> Pembanding</span>
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-chart-1" /> Smart</span>
              </div>
            </div>
            <div className="mt-1 h-[166px]">
              <LossProfileChart series={selectedSeries} />
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-3">
          <div className="panel p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-xs">Aset terpilih</p>
                <p className="font-display text-sm">{active?.label}</p>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={cn("size-1.5 rounded-full", statusDotClass(operational.status))} />
                  <span className={statusTextClass(operational.status)}>{statusLabel(operational.status)}</span>
                  <span>· {operatorStatusReason(operational.status)}</span>
                </div>
              </div>
              <span className="rounded-md bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                {operatorDomainLabel(active?.domain)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Kpi icon={<Zap className="size-3.5" />} label="Susut teknis" value={fmt(active?.smartKwh, 2)} unit="kWh/hari" tone="primary" />
              <Kpi icon={<Gauge className="size-3.5" />} label="Pembanding" value={fmt(active?.convKwh, 2)} unit="kWh/hari" tone="warn" />
              <Kpi icon={<Percent className="size-3.5" />} label="Rasio susut" value={operational.lossRatePercent == null ? "—" : `${operational.lossRatePercent.toFixed(2)}%`} unit="dari energi tersalurkan" tone="primary" />
              <Kpi icon={<ShieldCheck className="size-3.5" />} label="Keandalan" value={confidenceLabel(operational.confidence)} unit="berdasarkan kualitas data" tone={confidenceTone(operational.confidence)} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-9 gap-2 text-xs font-semibold"
                onClick={() => setDataDrawerOpen(true)}
              >
                <Database className="size-3.5" />
                Data &amp; input
              </Button>
              <Button
                size="sm"
                className="h-9 gap-2 text-xs font-semibold"
                onClick={() => setEngineeringDrawerOpen(true)}
              >
                <ShieldCheck className="size-3.5" />
                Engineering view
              </Button>
            </div>
          </div>

          <div className="panel min-h-0 flex-1 overflow-hidden p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="label-xs">Status susut per aset</p>
              {exceptionCount > 0 && (
                <span className="rounded-md border border-warn/25 bg-warn/5 px-2 py-1 text-[9px] font-semibold text-warn" data-exception-count="true">
                  {exceptionCount} perlu perhatian
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {assetMetrics.map(({ asset: a, metric }) => {
                const selectedRow = selected === a.id;
                const exception = isException(metric.status);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => selectAsset(a.id)}
                    data-analysis-status={metric.status}
                    className={cn(
                      "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                      selectedRow
                        ? "border-primary/50 bg-primary/10"
                        : exception
                          ? statusBorderClass(metric.status)
                          : "border-border/45 bg-surface-2/70 hover:border-primary/20",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
                        <i className={cn("size-1.5 shrink-0 rounded-full", statusDotClass(metric.status))} />
                        <span className="truncate">{a.short}</span>
                      </span>
                      <span className="numeric shrink-0 text-xs">
                        {fmt(a.smartKwh, 1)} kWh
                        {metric.lossRatePercent != null ? ` · ${metric.lossRatePercent.toFixed(2)}%` : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{operatorAssetNote(metric.status)}</span>
                      <span className={cn("shrink-0 font-semibold", statusTextClass(metric.status))}>
                        {statusLabel(metric.status)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {state.status === "error" && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                {state.error}
              </p>
            )}
            {state.status === "done" && state.result && !state.result.gate.pass && (
              <p className="mt-3 rounded-md border border-destructive/35 bg-destructive/10 p-2 text-[10.5px] text-destructive">
                PERLU TINJAU · Buka Engineering View.
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

function confidenceLabel(level: ConfidenceLevel) {
  if (level === "HIGH") return "TINGGI";
  if (level === "MEDIUM") return "SEDANG";
  if (level === "LOW") return "RENDAH";
  return "TINJAU";
}

function statusLabel(status: AnalysisStatus) {
  if (status === "NORMAL") return "NORMAL";
  if (status === "ATTENTION") return "PERHATIAN";
  if (status === "REVIEW") return "TINJAU";
  return "BELUM DIHITUNG";
}

function operatorStatusReason(status: AnalysisStatus) {
  if (status === "NORMAL") return "Hasil stabil.";
  if (status === "ATTENTION") return "Kualitas data perlu perhatian.";
  if (status === "REVIEW") return "Perlu pemeriksaan engineering.";
  return "Menunggu simulasi.";
}

function operatorAssetNote(status: AnalysisStatus) {
  if (status === "NORMAL") return "Estimasi tersedia";
  if (status === "ATTENTION") return "Periksa kualitas data";
  if (status === "REVIEW") return "Perlu review engineering";
  return "Menunggu simulasi";
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

function confidenceTextClass(level: ConfidenceLevel) {
  if (level === "HIGH") return "text-success";
  if (level === "MEDIUM") return "text-warn";
  if (level === "LOW" || level === "REVIEW") return "text-destructive";
  return "text-muted-foreground";
}

function confidenceTone(level: ConfidenceLevel): "success" | "warn" | "danger" {
  if (level === "HIGH") return "success";
  if (level === "MEDIUM") return "warn";
  return "danger";
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return (
    <span className={cn("rounded-md border px-2 py-1 text-[10px] font-semibold tracking-wider", confidenceBadgeClass(level))}>
      {confidenceLabel(level)}
    </span>
  );
}

function confidenceBadgeClass(level: ConfidenceLevel) {
  if (level === "HIGH") return "border-success/30 bg-success/10 text-success";
  if (level === "MEDIUM") return "border-warn/30 bg-warn/10 text-warn";
  return "border-destructive/30 bg-destructive/10 text-destructive";
}

function Kpi({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  tone: "primary" | "warn" | "success" | "danger";
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
    <div className="rounded-md bg-surface-2 p-2.5">
      <div className={cn("flex items-center gap-1.5", toneClass)}>
        {icon}
        <span className="label-xs" style={{ color: "inherit" }}>
          {label}
        </span>
      </div>
      <p className="numeric mt-1 text-base font-semibold leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground">{unit}</p>
    </div>
  );
}

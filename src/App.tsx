import { useMemo, useState } from "react";
import { CircuitBoard, Cpu, Database, Gauge, Percent, Play, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SingleLineDiagram } from "@/components/sdl/SingleLineDiagram";
import { LossProfileChart } from "@/components/sdl/LossProfileChart";
import { DataDrawer } from "@/components/sdl/DataDrawer";
import { DetailDrawer } from "@/components/sdl/DetailDrawer";
import { useEngine } from "@/lib/sdl/useEngine";
import { deriveAssets, fmt, type AssetId } from "@/lib/sdl/derive";
import { deriveOperationalMetrics, type ConfidenceLevel } from "@/lib/sdl/operation";
import type { Preset } from "@/lib/sdl/types";
import { cn } from "@/lib/utils";

export default function App() {
  const { state, run } = useEngine();
  const [preset, setPreset] = useState<Preset>("poor");
  const [selected, setSelected] = useState<AssetId>("gd");
  const [dataDrawerOpen, setDataDrawerOpen] = useState(false);
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

  const selectAsset = (id: AssetId, openData = true) => {
    setSelected(id);
    if (openData) setDataDrawerOpen(true);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ---------- TOP BAR ---------- */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border/70 bg-surface px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
            <CircuitBoard className="size-4.5" />
          </span>
          <div className="leading-tight">
            <h1 className="font-display text-sm font-semibold">Smart Distribution Loss</h1>
            <p className="label-xs">Advanced DMS · Loss Intelligence Cockpit</p>
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
          <span className="hidden items-center gap-1.5 rounded-md border border-warn/25 bg-warn/5 px-2 py-1.5 text-[10px] font-semibold tracking-wider text-warn lg:flex">
            <Database className="size-3" /> SYNTHETIC DEMO
          </span>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="label-xs">Kualitas data</span>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)} disabled={running}>
              <SelectTrigger className="h-8 w-36 border-border/70 bg-surface-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="typical">Typical</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="hidden items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground/80 xl:flex">
            <Cpu className="size-3 text-primary/80" /> LOCAL COMPUTE · PANDAPOWER 3φ
          </span>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => run(preset)} disabled={running}>
            <Play className="size-3.5" />
            {running ? "Menghitung…" : "Jalankan simulasi"}
          </Button>
        </div>
      </header>

      {/* ---------- PROGRESS STRIP ---------- */}
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
            {state.progress.label}
          </span>
          <span className="truncate text-muted-foreground/75">{state.progress.detail}</span>
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

      {/* ---------- BODY ---------- */}
      <main className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_336px] gap-3 p-3">
        {/* LEFT: operator-facing data quality */}
        <section className="panel flex min-h-0 flex-col p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label-xs">Data quality</p>
              <p className="mt-0.5 font-display text-sm">{operational.qualityLabel}</p>
            </div>
            <ConfidenceBadge level={operational.confidence} />
          </div>

          <div className="mt-4 space-y-2.5">
            {operational.qualityRows.map((metric) => (
              <div key={metric.label}>
                <div className="flex justify-between gap-3 text-[11px]">
                  <span className="truncate text-muted-foreground">{metric.label}</span>
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
              <span className="label-xs">Confidence</span>
              <span className={cn("numeric text-sm font-semibold", confidenceTextClass(operational.confidence))}>
                {operational.confidence}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {operational.qualityIssueCount === 0
                ? "Input utama memenuhi coverage threshold."
                : `${operational.qualityIssueCount} coverage constraint perlu diperhatikan.`}
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

        {/* CENTER: SLD + chart */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="panel relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute left-3 top-3 z-10">
              <p className="label-xs">Single line diagram · live</p>
              <p className="font-display text-sm">Penyulang 20 kV → GD-01 → 3 JTR → 90 pelanggan</p>
            </div>
            <SingleLineDiagram
              selected={selected}
              onSelect={(id) => selectAsset(id)}
              energised={energised}
              intensity={running ? 0.9 : 0.5}
              gdLossKwh={gdLossKwh}
              mvLossKwh={mvLossKwh}
              tmLossKwh={tmLossKwh}
            />
          </div>
          <div className="panel h-[176px] shrink-0 p-3 pb-1">
            <div className="flex items-center justify-between">
              <p className="label-xs">Profil susut teknis GD-01 · 24 jam · 96 interval</p>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-chart-4" /> Ground truth</span>
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-chart-2" /> Konvensional</span>
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-chart-1" /> Smart engine</span>
              </div>
            </div>
            <div className="h-[132px]">
              <LossProfileChart series={state.result?.series ?? []} />
            </div>
          </div>
        </section>

        {/* RIGHT: operation KPI + asset ledger */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="panel p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-xs">Aset terpilih</p>
                <p className="font-display text-sm">{active?.label}</p>
              </div>
              <span className="rounded-md bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                {active?.domain}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Kpi icon={<Zap className="size-3.5" />} label="Susut teknis" value={fmt(active?.smartKwh, 2)} unit="kWh/hari" tone="primary" />
              <Kpi icon={<Gauge className="size-3.5" />} label="Konvensional" value={fmt(active?.convKwh, 2)} unit="kWh/hari" tone="warn" />
              <Kpi icon={<Percent className="size-3.5" />} label="Loss rate" value={operational.lossRatePercent == null ? "—" : `${operational.lossRatePercent.toFixed(2)}%`} unit="smart / supplied energy" tone="primary" />
              <Kpi icon={<ShieldCheck className="size-3.5" />} label="Confidence" value={operational.confidence} unit="input + engineering gate" tone={confidenceTone(operational.confidence)} />
            </div>

            <Button
              size="sm"
              className="mt-3 h-9 w-full gap-2 text-xs font-semibold"
              onClick={() => setEngineeringDrawerOpen(true)}
            >
              <ShieldCheck className="size-3.5" />
              Detail engineering &amp; gate
            </Button>
          </div>

          <div className="panel min-h-0 flex-1 overflow-hidden p-3">
            <p className="label-xs mb-2">Ledger susut per objek</p>
            <div className="space-y-1.5">
              {assets.map((a) => {
                const metric = deriveOperationalMetrics(a.id, preset, state.result, state.spot, state.tm, a.smartKwh);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => selectAsset(a.id)}
                    className={cn(
                      "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                      selected === a.id ? "border-primary/50 bg-primary/10" : "border-border/55 bg-surface-2/80 hover:border-primary/20",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{a.short}</span>
                      <span className="numeric text-xs">{fmt(a.smartKwh, 1)} kWh</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{a.action}</span>
                      <span className={cn("shrink-0 font-semibold", confidenceTextClass(metric.confidence))}>
                        {metric.lossRatePercent == null ? metric.confidence : `${metric.lossRatePercent.toFixed(2)}% · ${metric.confidence}`}
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
            {state.status === "done" && state.result && (
              <p className="mt-3 rounded-md border border-border/35 bg-surface-2/35 p-2 text-[10.5px] text-muted-foreground/75">
                {state.result.gate.pass ? "GATE PASS · Validasi P3 selesai." : "GATE REVIEW · Periksa detail engineering."}
              </p>
            )}
          </div>
        </section>
      </main>

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
      {level}
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

import { useMemo, useState } from "react";
import { Activity, ChevronRight, CircuitBoard, Cpu, Gauge, Play, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SingleLineDiagram } from "@/components/sdl/SingleLineDiagram";
import { LossProfileChart } from "@/components/sdl/LossProfileChart";
import { DetailDrawer } from "@/components/sdl/DetailDrawer";
import { useEngine } from "@/lib/sdl/useEngine";
import { deriveAssets, fmt, fmtSigned, type AssetId } from "@/lib/sdl/derive";
import { PRESET_PROFILE, type Preset } from "@/lib/sdl/types";
import { cn } from "@/lib/utils";


export default function App() {
  const { state, run } = useEngine();
  const [preset, setPreset] = useState<Preset>("poor");
  const [selected, setSelected] = useState<AssetId>("gd");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const assets = useMemo(() => deriveAssets(state.result, state.spot), [state.result, state.spot]);
  const active = assets.find((a) => a.id === selected) ?? assets[0];
  const profile = PRESET_PROFILE[preset];
  const running = state.status === "running";
  const energised = state.status !== "idle";

  const gdLossKwh = state.result?.comparison.smart.loss_kwh ?? null;
  const mvLossKwh = state.spot?.comparison.smart.loss_kwh ?? null;

  const improvement =
    active?.convErr != null && active?.smartErr != null
      ? Math.abs(active.convErr) - Math.abs(active.smartErr)
      : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ---------- TOP BAR ---------- */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
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
              onClick={() => setSelected(a.id)}
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
          <div className="hidden items-center gap-2 lg:flex">
            <span className="label-xs">Kualitas data</span>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)} disabled={running}>
              <SelectTrigger className="h-8 w-36 border-border bg-surface-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="typical">Typical</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground xl:flex">
            <Cpu className="size-3 text-primary" /> LOCAL COMPUTE · PANDAPOWER 3φ
          </span>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => run(preset)} disabled={running}>
            <Play className="size-3.5" />
            {running ? "Menghitung…" : "Jalankan simulasi"}
          </Button>
        </div>
      </header>

      {/* ---------- PROGRESS STRIP ---------- */}
      <div className="relative h-8 shrink-0 border-b border-border bg-surface-2/60">
        <div className="flex h-full items-center gap-3 px-4 text-[11px]">
          <span className={cn("size-1.5 rounded-full", running ? "animate-pulse bg-warn" : state.status === "done" ? "bg-success" : "bg-muted-foreground")} />
          <span className="font-medium text-foreground">{state.progress.label}</span>
          <span className="truncate text-muted-foreground">{state.progress.detail}</span>
          <span className="numeric ml-auto text-muted-foreground">
            {state.intervals.done}/{state.intervals.total} interval · {Math.round(state.progress.percent)}%
          </span>
        </div>
        <div className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-500" style={{ width: `${state.progress.percent}%` }} />
      </div>

      {/* ---------- BODY ---------- */}
      <main className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_336px] gap-3 p-3">
        {/* LEFT: observability */}
        <section className="panel flex min-h-0 flex-col gap-3 p-3">
          <div>
            <p className="label-xs">Skenario</p>
            <p className="font-display text-sm">{profile.label}</p>
          </div>
          <div className="space-y-2.5">
            {[
              { k: "AMI coverage", v: profile.ami },
              { k: "Fasa diketahui", v: profile.phase },
              { k: "PF diketahui", v: profile.pf },
              { k: "Mapping benar", v: profile.mapping },
            ].map((m) => (
              <div key={m.k}>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">{m.k}</span>
                  <span className="numeric">{m.v.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn("h-full rounded-full", m.v > 85 ? "bg-success" : m.v > 55 ? "bg-warn" : "bg-destructive")}
                    style={{ width: `${m.v}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-1 border-t border-border pt-3">
            <p className="label-xs mb-2">Pipeline smart engine</p>
            <ol className="space-y-1.5">
              {state.stages.map((s, i) => (
                <li key={s.label} className="flex items-start gap-2 text-[11px]">
                  <span
                    className={cn(
                      "numeric mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[9px]",
                      s.done ? "bg-primary/20 text-primary" : "bg-surface-2 text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-auto rounded-md bg-surface-2 p-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
            Ground truth tersembunyi selama kalibrasi dan hanya dibuka untuk validasi akhir.
          </div>
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
              onSelect={setSelected}
              energised={energised}
              intensity={running ? 0.9 : 0.5}
              gdLossKwh={gdLossKwh}
              mvLossKwh={mvLossKwh}
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

        {/* RIGHT: KPI + asset ledger */}
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
              <Kpi icon={<Zap className="size-3.5" />} label="Susut smart" value={`${fmt(active?.smartKwh, 2)}`} unit="kWh/hari" tone="primary" />
              <Kpi icon={<Gauge className="size-3.5" />} label="Konvensional" value={`${fmt(active?.convKwh, 2)}`} unit="kWh/hari" tone="warn" />
              <Kpi icon={<Activity className="size-3.5" />} label="Err. konvensional" value={fmtSigned(active?.convErr)} unit="vs truth" tone="warn" />
              <Kpi icon={<ShieldCheck className="size-3.5" />} label="Err. smart" value={fmtSigned(active?.smartErr)} unit="vs truth" tone="success" />
            </div>

            <div className="mt-3 rounded-md border border-primary/30 bg-primary/10 p-2.5">
              <p className="label-xs text-primary">Perbaikan akurasi</p>
              <p className="numeric text-xl font-semibold text-primary">
                {improvement == null ? "—" : `${improvement > 0 ? "−" : "+"}${Math.abs(improvement).toFixed(2)} pp error`}
              </p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">{active?.note}</p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="mt-3 h-8 w-full justify-between text-xs"
              onClick={() => setDrawerOpen(true)}
            >
              Detail engineering & gate
              <ChevronRight className="size-3.5" />
            </Button>
          </div>

          <div className="panel min-h-0 flex-1 overflow-hidden p-3">
            <p className="label-xs mb-2">Ledger susut per objek</p>
            <div className="space-y-1.5">
              {assets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelected(a.id)}
                  className={cn(
                    "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                    selected === a.id ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2 hover:border-primary/30",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{a.short}</span>
                    <span className="numeric text-xs">{fmt(a.smartKwh, 1)} kWh</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{a.action}</span>
                    <span className="numeric">
                      <span className="text-warn">{fmtSigned(a.convErr, 2)}</span>
                      <span className="mx-1">→</span>
                      <span className="text-success">{fmtSigned(a.smartErr, 2)}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {state.status === "error" && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                {state.error}
              </p>
            )}
            {state.status === "done" && state.result && (
              <p className="mt-3 rounded-md bg-surface-2 p-2 text-[10.5px] leading-relaxed text-muted-foreground">
                {state.result.gate.pass ? "GATE PASS · " : "GATE REVIEW · "}
                {state.result.gate.summary}
              </p>
            )}
          </div>
        </section>
      </main>

      {active && (
        <DetailDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          asset={active}
          result={state.result}
          spot={state.spot}
        />
      )}
    </div>
  );
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
  tone: "primary" | "warn" | "success";
}) {
  const toneClass =
    tone === "primary" ? "text-primary" : tone === "warn" ? "text-warn" : "text-success";
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

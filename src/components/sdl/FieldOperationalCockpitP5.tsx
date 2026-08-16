import { useMemo, useState, type ReactNode } from "react";
import {
  CircuitBoard,
  Cpu,
  Database,
  Gauge,
  Percent,
  RotateCcw,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldAssetProfileChart } from "@/components/sdl/FieldAssetProfileChart";
import { FieldTopologyDiagram } from "@/components/sdl/FieldTopologyDiagram";
import { OperatorDecisionStrip } from "@/components/sdl/OperatorDecisionStrip";
import {
  deriveFieldAssetDecision,
  deriveFieldSelectedView,
  hasP5AssetObservability,
  type P5FieldDatasetResult,
} from "@/lib/sdl/fieldAsset";
import {
  deriveFieldAssetPriorities,
  fieldPriorityHeadline,
  type FieldAssetPriority,
} from "@/lib/sdl/fieldIntelligence";
import {
  clearFieldOperational,
  deriveFieldOperationalMetrics,
  fieldSourceTitle,
  openDatasetManager,
  useFieldOperationalSession,
} from "@/lib/sdl/fieldOperational";
import { buildFieldTopology, type FieldTopologyGraph, type FieldTopologySelection } from "@/lib/sdl/fieldTopology";
import { cn } from "@/lib/utils";

export function FieldOperationalCockpitP5() {
  const session = useFieldOperationalSession();
  const [selected, setSelected] = useState<FieldTopologySelection>({ kind: "source", id: "" });
  const graph = useMemo(() => (session ? buildFieldTopology(session.dataset) : null), [session]);

  if (!session || !graph) return null;

  const sourceSelection: FieldTopologySelection = {
    kind: "source",
    id: graph.source?.element_id ?? "",
  };
  const effectiveSelected = isSelectionAvailable(selected, graph) ? selected : sourceSelection;
  const result = session.result as P5FieldDatasetResult;
  const assetObservabilityReady = hasP5AssetObservability(session.result);
  const operational = deriveFieldOperationalMetrics(session);
  const view = deriveFieldSelectedView(session, effectiveSelected);
  const decision = deriveFieldAssetDecision(view, session);
  const networkSummary = session.report.summary;
  const sourceTitle = fieldSourceTitle(session);
  const selectedElement = effectiveSelected.kind === "element"
    ? session.dataset.network.find((item) => item.element_id === effectiveSelected.id)
    : null;
  const selectedBus = effectiveSelected.kind === "bus" ? graph.buses.find((bus) => bus.id === effectiveSelected.id) : null;
  const assets = result.assets ?? [];
  const priorities = deriveFieldAssetPriorities(assets);
  const topPriorities = priorities.slice(0, 3);
  const topPriority = priorities[0] ?? null;
  const passedChecks = session.result.checks.filter((check) => check.pass).length;
  const solverLabel = String(session.result.provenance["solver"] ?? "pandapower.runpp_3ph");

  const focusPriority = (priority: FieldAssetPriority) => {
    setSelected(priority.selection);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('[data-field-focus-selected="true"]')?.click();
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex h-screen flex-col overflow-hidden bg-background" data-field-cockpit="true" data-operational-source="field" data-p5-cockpit="true" data-p6-cockpit="true" data-p7-cockpit="true">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border/70 bg-surface px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary"><CircuitBoard className="size-4.5" /></span>
          <div className="leading-tight">
            <h1 className="font-display text-sm font-semibold">Smart Distribution Loss</h1>
            <p className="label-xs">Monitoring susut distribusi</p>
          </div>
        </div>

        <div className="ml-4 flex min-w-0 items-center gap-2 rounded-lg border border-success/25 bg-success/5 px-2.5 py-1.5" data-field-source-badge="true">
          <span className="size-1.5 shrink-0 rounded-full bg-success" />
          <span className="truncate text-[11px] font-semibold text-success">DATA LAPANGAN</span>
          <span className="hidden truncate text-[10px] text-muted-foreground xl:inline">{sourceTitle}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" data-action-level="secondary" onClick={clearFieldOperational} className="hidden h-8 items-center gap-1.5 rounded-md border border-border/70 bg-transparent px-2.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:bg-surface-2 hover:text-foreground sm:flex">
            <RotateCcw className="size-3" /> Kembali demo
          </button>
          <Button size="sm" data-action-level="primary" className="h-8 gap-1.5 px-3.5 text-xs font-semibold ring-1 ring-primary/25" onClick={openDatasetManager}>
            <Database className="size-3.5" /> Kelola data lapangan
          </Button>
        </div>
      </header>

      <div className="relative h-8 shrink-0 border-b border-success/15 bg-success/5" data-field-run-state="active" aria-live="polite">
        <div className="flex h-full items-center gap-3 px-4 text-[11px]">
          <span className="size-1.5 rounded-full bg-success/80" />
          <span className="font-medium text-success">Data lapangan aktif</span>
          <span className="hidden truncate text-muted-foreground/75 md:inline">
            {networkSummary.networkElements} elemen · {graph.buses.length} bus · {networkSummary.customers} pelanggan
          </span>
          <span className="numeric ml-auto text-muted-foreground/75">{session.result.series.length}/96 interval · topology P6 · intelligence P7</span>
        </div>
        <div className="absolute bottom-0 left-0 h-0.5 w-full bg-success/30" />
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_336px] gap-3 p-3" data-field-cockpit-main="true">
        <section className="panel flex min-h-0 flex-col p-3" data-field-quality-panel="true">
          <div>
            <p className="label-xs">Kualitas data lapangan</p>
            <p className="mt-0.5 font-display text-sm">{qualityHeadline(operational.confidence)}</p>
          </div>
          <div className="mt-3 space-y-2">
            {operational.qualityRows.map((metric) => (
              <div key={metric.label}>
                <div className="flex justify-between gap-3 text-[11px]"><span className="truncate text-muted-foreground">{metric.label}</span><span className="numeric shrink-0">{metric.percent.toFixed(1)}%</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn("h-full rounded-full", metric.percent >= 95 ? "bg-success" : metric.percent >= 85 ? "bg-primary" : metric.percent >= 55 ? "bg-warn" : "bg-destructive")} style={{ width: `${metric.percent}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-border/45 pt-3" data-field-asset-intelligence="true">
            <div className="flex items-center justify-between gap-2">
              <p className="label-xs">Prioritas aset · P7</p>
              <span className="numeric text-[9px] text-muted-foreground">{priorities.length} aset</span>
            </div>
            <p className="mt-1 text-[11px] font-semibold leading-snug text-foreground" data-p7-priority-headline="true">{fieldPriorityHeadline(topPriority)}</p>
            <div className="mt-2 space-y-1.5" data-p7-priority-list="true">
              {topPriorities.map((priority) => (
                <button
                  key={priority.elementId}
                  type="button"
                  onClick={() => focusPriority(priority)}
                  className={cn(
                    "w-full rounded-md border bg-surface-2/55 px-2 py-1.5 text-left transition-colors hover:border-primary/45 hover:bg-primary/5",
                    effectiveSelected.kind === "element" && effectiveSelected.id === priority.elementId ? "border-primary/55 bg-primary/7" : "border-border/45",
                  )}
                  data-p7-priority-rank={priority.rank}
                  data-p7-priority-id={priority.elementId}
                  data-p7-priority-status={priority.status}
                  data-p7-priority-score={priority.score.toFixed(2)}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="numeric text-[9px] font-semibold text-muted-foreground">#{priority.rank}</span>
                    <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-foreground">{priority.elementId}</span>
                    <span className={cn("text-[8px] font-bold", priorityTone(priority.status))}>{priorityStatusLabel(priority.status)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{priority.reason}</span>
                  <span className="numeric mt-0.5 block text-[8.5px] text-muted-foreground/85">Skor {priority.score.toFixed(0)} · susut {priority.lossSharePercent.toFixed(1)}% · load {priority.maxLoadingPercent.toFixed(1)}% · V {priority.minVoltagePu.toFixed(3)}</span>
                </button>
              ))}
              {!topPriorities.length && <p className="rounded-md border border-border/45 bg-surface-2/45 px-2 py-2 text-[9px] text-muted-foreground">Jalankan ulang dataset untuk memperoleh attribution aset P5/P7.</p>}
            </div>
            <p className="mt-1.5 text-[8.5px] leading-relaxed text-muted-foreground/75">Skor: 45% kontribusi susut · 35% loading · 20% severity tegangan endpoint.</p>
          </div>

          <div className="mt-auto rounded-md border border-border/45 bg-surface-2/45 p-2.5 text-[10px] leading-relaxed text-muted-foreground" data-field-provenance="true">
            <p className="font-semibold text-foreground">Sumber terverifikasi</p>
            <p className="mt-1">{session.filenames.join(" · ")}</p>
            <p className="mt-1">{solverLabel} · lokal di browser · tanpa hidden truth</p>
            <p className="mt-1">Attribution: direct solver rows, bukan estimasi proporsional.</p>
          </div>

          <Button variant="outline" size="sm" data-action-level="secondary" className="mt-3 h-8 w-full gap-2 bg-transparent text-xs" onClick={openDatasetManager}>
            <Database className="size-3.5" /> Lihat dataset
          </Button>
        </section>

        <section className="flex min-h-0 flex-col gap-3">
          <div className="panel relative min-h-0 flex-1 overflow-hidden" data-field-topology-panel="true">
            <div className="absolute left-3 top-3 z-10 max-w-[58%] rounded-md bg-surface/90 pr-2">
              <p className="label-xs">Single line diagram · data lapangan</p>
              <p className="mt-0.5 truncate font-display text-sm">
                {graph.supported ? `Root ${graph.rootBusId} · ${graph.elements.length} elemen · ${graph.branchBusIds.length} cabang` : "Topology perlu ditinjau"}
              </p>
            </div>
            <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
              <span className={cn("rounded-md border px-2 py-1 text-[10px] font-semibold", graph.supported && assetObservabilityReady ? "border-success/25 bg-success/5 text-success" : "border-warn/25 bg-warn/5 text-warn")}>
                {graph.supported && assetObservabilityReady ? "TOPOLOGY LIVE" : "RENDER BLOCKED"}
              </span>
            </div>
            <div className="h-full pt-10">
              <FieldTopologyDiagram graph={graph} selected={effectiveSelected} onSelect={setSelected} assets={assets} />
            </div>
            <div className="absolute bottom-2 left-3 z-10 rounded bg-surface/90 px-2 py-1 text-[9px] text-muted-foreground" data-field-sld-suppressed="true">
              SLD demo tidak digunakan pada Field Mode · diagram dibangun dari network.csv
            </div>
          </div>

          <div className="panel h-[220px] shrink-0 p-3 pb-1" data-field-profile-panel="true">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="label-xs">Profil · {view.title} · 24 jam</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  {view.peakLossKw != null && <span>Puncak susut <span className="numeric text-foreground">{view.peakTime ?? "—"}</span> · <span className="numeric text-foreground">{view.peakLossKw.toFixed(3)} kW</span></span>}
                  {view.minVoltagePu != null && <span>V min <span className="numeric text-foreground">{view.minVoltagePu.toFixed(3)} pu</span></span>}
                  {view.maxLoadingPercent != null && <span>Loading <span className="numeric text-foreground">{view.maxLoadingPercent.toFixed(1)}%</span></span>}
                  {view.peakLoadKw != null && <span>Beban puncak <span className="numeric text-foreground">{view.peakLoadKw.toFixed(2)} kW</span></span>}
                </div>
              </div>
              <span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground">{kindLabel(view.kind)}</span>
            </div>
            <div className="mt-1 h-[166px]" data-field-loss-chart="true"><FieldAssetProfileChart view={view} /></div>
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3" data-field-right-column="true">
          <div className="panel p-2.5" data-field-selected-panel="true" data-field-selection-kind={view.kind} data-field-selection-id={view.title}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="label-xs">Aset terpilih</p><p className="truncate font-display text-sm">{view.title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{view.subtitle}</p></div>
              <span className="rounded-md bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">FIELD</span>
            </div>

            <OperatorDecisionStrip decision={decision} />

            <div className="mt-2 grid grid-cols-2 gap-2">
              {view.kind === "bus" ? (
                <>
                  <FieldKpi icon={<Gauge className="size-3.5" />} label="Tegangan minimum" value={fmt(view.minVoltagePu, 3)} unit="pu" tone={view.minVoltagePu != null && view.minVoltagePu < 0.9 ? "warn" : "success"} />
                  <FieldKpi icon={<Zap className="size-3.5" />} label="Beban puncak" value={fmt(view.peakLoadKw, 2)} unit="kW" />
                  <FieldKpi icon={<Percent className="size-3.5" />} label="Energi beban" value={fmt(view.loadEnergyKwh, 1)} unit="kWh/hari" />
                  <FieldKpi icon={<Users className="size-3.5" />} label="Pelanggan" value={`${selectedBus?.customers ?? 0}`} unit="pada bus" />
                </>
              ) : (
                <>
                  <FieldKpi icon={<Zap className="size-3.5" />} label="Susut teknis" value={fmt(view.lossKwh, 2)} unit="kWh/hari" tone="primary" />
                  <FieldKpi icon={<Percent className="size-3.5" />} label="Kontribusi" value={view.lossSharePercent == null ? "—" : `${view.lossSharePercent.toFixed(1)}%`} unit="dari total" />
                  <FieldKpi icon={<Gauge className="size-3.5" />} label="Tegangan minimum" value={fmt(view.minVoltagePu, 3)} unit="pu" tone={view.minVoltagePu != null && view.minVoltagePu < 0.9 ? "warn" : "success"} />
                  <FieldKpi icon={<Cpu className="size-3.5" />} label="Loading maksimum" value={view.maxLoadingPercent == null ? "—" : `${view.maxLoadingPercent.toFixed(1)}%`} unit={view.kind === "source" ? "jaringan" : "aset"} tone={view.maxLoadingPercent != null && view.maxLoadingPercent > 100 ? "warn" : "success"} />
                </>
              )}
            </div>
          </div>

          <div className="panel min-h-0 overflow-auto p-2.5" data-field-status-panel="true">
            <div className="flex items-center justify-between gap-3"><p className="label-xs">Detail & provenance</p><span className="numeric text-[10px] text-muted-foreground">{passedChecks}/{session.result.checks.length} cek</span></div>
            <div className="mt-2 space-y-1.5">
              <StatusRow label="Topology radial" value={graph.supported ? "VALID" : "BLOKIR"} pass={graph.supported} />
              <StatusRow label="Observability aset" value={assetObservabilityReady ? "SIAP" : "ULANGI"} pass={assetObservabilityReady} />
              <StatusRow label="Physics 3 fasa" value={`${session.result.series.length}/96`} pass={session.result.series.length === 96} />
              <StatusRow label="Attribution aset" value={assets.length ? `${assets.length} aset` : "—"} pass={assets.length > 0} />
              <StatusRow label="Prioritas P7" value={priorities.length ? `${priorities.length} diranking` : "—"} pass={priorities.length > 0} />
            </div>

            <div className="mt-3 border-t border-border/45 pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
              <p><span className="font-medium text-foreground">Dasar:</span> {view.provenance}</p>
              {selectedElement && <p className="mt-1"><span className="font-medium text-foreground">Path:</span> {selectedElement.from_bus} → {selectedElement.to_bus}</p>}
              {selectedElement?.element_type === "line" && <p className="mt-1"><span className="font-medium text-foreground">Line:</span> {fmt(selectedElement.length_km, 3)} km · R {fmt(selectedElement.r_ohm_per_km, 3)} Ω/km · rating {fmt(selectedElement.max_i_ka, 3)} kA</p>}
              {selectedElement?.element_type === "transformer" && <p className="mt-1"><span className="font-medium text-foreground">Trafo:</span> {fmt(selectedElement.rated_kva, 0)} kVA · uk {fmt(selectedElement.vk_percent, 2)}%</p>}
              {selectedBus && <p className="mt-1"><span className="font-medium text-foreground">Bus:</span> {selectedBus.kv == null ? "—" : `${fmt(selectedBus.kv, selectedBus.kv >= 10 ? 0 : 2)} kV`} · {selectedBus.meters} meter</p>}
              <p className="mt-1"><span className="font-medium text-foreground">Solver:</span> {solverLabel}</p>
              <p className="mt-1"><span className="font-medium text-foreground">Truth policy:</span> tidak ada hidden truth pada Field Mode.</p>
            </div>

            {!assetObservabilityReady && <div className="mt-3 rounded-md border border-warn/25 bg-warn/5 p-2.5 text-[10px] leading-relaxed text-warn">Hasil aktif berasal dari adapter lama. Jalankan ulang dataset untuk memperoleh observability aset terbaru.</div>}
            {!graph.supported && <div className="mt-3 rounded-md border border-warn/25 bg-warn/5 p-2.5 text-[10px] leading-relaxed text-warn">{graph.reason}</div>}
          </div>
        </section>
      </main>
    </div>
  );
}

function isSelectionAvailable(selection: FieldTopologySelection, graph: FieldTopologyGraph) {
  if (selection.kind === "source") return Boolean(graph.source && selection.id === graph.source.element_id);
  if (selection.kind === "element") return graph.elements.some((element) => element.element_id === selection.id);
  return graph.buses.some((bus) => bus.id === selection.id);
}

function qualityHeadline(level: string) {
  if (level === "HIGH") return "Data lengkap";
  if (level === "MEDIUM") return "Data cukup";
  if (level === "LOW") return "Data terbatas";
  return "Perlu tinjau";
}

function kindLabel(kind: string) {
  if (kind === "source") return "SOURCE";
  if (kind === "line") return "LINE";
  if (kind === "transformer") return "TRAFO";
  return "BUS";
}

function priorityStatusLabel(status: FieldAssetPriority["status"]) {
  if (status === "CRITICAL") return "KRITIS";
  if (status === "ATTENTION") return "PERHATIAN";
  if (status === "WATCH") return "PANTAU";
  return "NORMAL";
}

function priorityTone(status: FieldAssetPriority["status"]) {
  if (status === "CRITICAL") return "text-destructive";
  if (status === "ATTENTION") return "text-warn";
  if (status === "WATCH") return "text-primary";
  return "text-success";
}

function fmt(value: number | null | undefined, digits: number) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function FieldKpi({ icon, label, value, unit, tone = "default" }: { icon: ReactNode; label: string; value: string; unit: string; tone?: "default" | "primary" | "success" | "warn" }) {
  return (
    <div className="rounded-md border border-border/45 bg-surface-2/55 p-2">
      <div className={cn("flex items-center gap-1.5", tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : "text-muted-foreground")}>{icon}<span className="label-xs" style={{ color: "inherit" }}>{label}</span></div>
      <div className="mt-1 flex items-baseline gap-1"><span className="numeric text-sm font-semibold">{value}</span><span className="text-[9px] text-muted-foreground">{unit}</span></div>
    </div>
  );
}

function StatusRow({ label, value, pass }: { label: string; value: string; pass: boolean }) {
  return <div className="flex items-center justify-between rounded-md border border-border/40 bg-surface-2/45 px-2.5 py-2 text-[10px]"><span className="text-muted-foreground">{label}</span><span className={cn("numeric font-semibold", pass ? "text-success" : "text-warn")}>{value}</span></div>;
}

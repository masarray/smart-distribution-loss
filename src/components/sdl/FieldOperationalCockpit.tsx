import type { ReactNode } from "react";
import {
  Cable,
  CircuitBoard,
  Cpu,
  Database,
  Gauge,
  Network,
  Percent,
  RotateCcw,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLossProfileChart } from "@/components/sdl/FieldLossProfileChart";
import { OperatorDecisionStrip } from "@/components/sdl/OperatorDecisionStrip";
import {
  clearFieldOperational,
  deriveFieldOperationalMetrics,
  deriveFieldOperatorDecision,
  fieldSourceTitle,
  fieldSourceVoltageLabel,
  openDatasetManager,
  useFieldOperationalSession,
} from "@/lib/sdl/fieldOperational";
import { cn } from "@/lib/utils";

export function FieldOperationalCockpit() {
  const session = useFieldOperationalSession();
  if (!session) return null;

  const metrics = deriveFieldOperationalMetrics(session);
  const decision = deriveFieldOperatorDecision(session, metrics);
  const { result, report, dataset } = session;
  const summary = result.summary;
  const networkSummary = report.summary;
  const sourceTitle = fieldSourceTitle(session);
  const passedChecks = result.checks.filter((check) => check.pass).length;

  return (
    <div
      className="fixed inset-0 z-40 flex h-screen flex-col overflow-hidden bg-background"
      data-field-cockpit="true"
      data-operational-source="field"
    >
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

        <div className="ml-4 flex min-w-0 items-center gap-2 rounded-lg border border-success/25 bg-success/5 px-2.5 py-1.5" data-field-source-badge="true">
          <span className="size-1.5 shrink-0 rounded-full bg-success" />
          <span className="truncate text-[11px] font-semibold text-success">DATA LAPANGAN</span>
          <span className="hidden truncate text-[10px] text-muted-foreground xl:inline">{sourceTitle}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-action-level="secondary"
            onClick={clearFieldOperational}
            className="hidden h-8 items-center gap-1.5 rounded-md border border-border/70 bg-transparent px-2.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:bg-surface-2 hover:text-foreground sm:flex"
          >
            <RotateCcw className="size-3" /> Kembali demo
          </button>
          <Button
            size="sm"
            data-action-level="primary"
            className="h-8 gap-1.5 px-3.5 text-xs font-semibold ring-1 ring-primary/25"
            onClick={openDatasetManager}
          >
            <Database className="size-3.5" /> Kelola data lapangan
          </Button>
        </div>
      </header>

      <div className="relative h-8 shrink-0 border-b border-success/15 bg-success/5" data-field-run-state="active" aria-live="polite">
        <div className="flex h-full items-center gap-3 px-4 text-[11px]">
          <span className="size-1.5 rounded-full bg-success/80" />
          <span className="font-medium text-success">Data lapangan aktif</span>
          <span className="hidden truncate text-muted-foreground/75 md:inline">
            {networkSummary.networkElements} elemen jaringan · {networkSummary.customers} pelanggan
          </span>
          <span className="numeric ml-auto text-muted-foreground/75">{result.series.length}/96 interval · pemeriksaan lulus</span>
        </div>
        <div className="absolute bottom-0 left-0 h-0.5 w-full bg-success/30" />
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_336px] gap-3 p-3" data-field-cockpit-main="true">
        <section className="panel flex min-h-0 flex-col p-3" data-field-quality-panel="true">
          <div>
            <p className="label-xs">Kualitas data lapangan</p>
            <p className="mt-0.5 font-display text-sm">{qualityHeadline(metrics.confidence)}</p>
          </div>

          <div className="mt-4 space-y-2.5">
            {metrics.qualityRows.map((metric) => (
              <div key={metric.label}>
                <div className="flex justify-between gap-3 text-[11px]">
                  <span className="truncate text-muted-foreground">{metric.label}</span>
                  <span className="numeric shrink-0">{metric.percent.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      metric.percent >= 95 ? "bg-success" : metric.percent >= 85 ? "bg-primary" : metric.percent >= 55 ? "bg-warn" : "bg-destructive",
                    )}
                    style={{ width: `${metric.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto rounded-md border border-border/45 bg-surface-2/45 p-2.5 text-[10px] leading-relaxed text-muted-foreground" data-field-provenance="true">
            <p className="font-semibold text-foreground">Sumber terverifikasi</p>
            <p className="mt-1">{session.filenames.join(" · ")}</p>
            <p className="mt-1">{String(result.provenance.solver ?? "pandapower.runpp_3ph")} · lokal di browser · tanpa hidden truth</p>
          </div>

          <Button variant="outline" size="sm" data-action-level="secondary" className="mt-3 h-8 w-full gap-2 bg-transparent text-xs" onClick={openDatasetManager}>
            <Database className="size-3.5" /> Lihat dataset
          </Button>
        </section>

        <section className="flex min-h-0 flex-col gap-3">
          <div className="panel relative min-h-0 flex-1 overflow-hidden p-3" data-field-topology-summary="true">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="label-xs">Jaringan dari dataset lapangan</p>
                <p className="mt-0.5 font-display text-sm">Topologi dihitung dari kontrak CSV yang diimpor</p>
              </div>
              <span className="rounded-md border border-border/55 bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground">{fieldSourceVoltageLabel(session)}</span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 xl:grid-cols-4">
              <TopologyStat icon={<Network className="size-4" />} label="Sumber" value={`${networkSummary.sources}`} detail="source radial" />
              <TopologyStat icon={<Cable className="size-4" />} label="Saluran" value={`${networkSummary.lines}`} detail="elemen line" />
              <TopologyStat icon={<Cpu className="size-4" />} label="Trafo" value={`${networkSummary.transformers}`} detail="2-winding" />
              <TopologyStat icon={<Users className="size-4" />} label="Pelanggan" value={`${networkSummary.customers}`} detail={`${networkSummary.meters} meter`} />
            </div>

            <div className="mt-5 rounded-lg border border-primary/15 bg-primary/5 p-3" data-field-sld-suppressed="true">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">SLD demo tidak digunakan pada Field Mode</p>
                  <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
                    Cockpit tidak menggambar ulang jaringan sintetis GD-01 untuk data ini. Perhitungan memakai elemen, bus, pelanggan, dan parameter yang berasal langsung dari CSV; visual SLD baru akan ditampilkan jika renderer topology field tersedia.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border/45 pt-3 text-[11px]">
              <InfoRow label="Schema" value={dataset.schema} />
              <InfoRow label="Timebase" value="96 × 15 menit" />
              <InfoRow label="Energi sumber" value={`${summary.supplied_energy_kwh.toFixed(2)} kWh`} />
              <InfoRow label="Energi beban" value={`${summary.load_energy_kwh.toFixed(2)} kWh`} />
            </div>
          </div>

          <div className="panel h-[220px] shrink-0 p-3 pb-1" data-field-profile-panel="true">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="label-xs">Profil susut teknis · data lapangan · 24 jam</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span>Puncak <span className="numeric text-foreground">{summary.peak_time}</span> · <span className="numeric text-foreground">{summary.peak_loss_kw.toFixed(3)} kW</span></span>
                  <span>Tegangan min. <span className="numeric text-foreground">{summary.min_voltage_pu.toFixed(3)} pu</span></span>
                  <span>Loading maks. <span className="numeric text-foreground">{summary.max_loading_percent.toFixed(1)}%</span></span>
                </div>
              </div>
              <div className="flex shrink-0 gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-chart-1" /> Total</span>
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-chart-2" /> Saluran</span>
                <span className="flex items-center gap-1"><i className="size-2 rounded-full bg-warn" /> Trafo</span>
              </div>
            </div>
            <div className="mt-1 h-[166px]">
              <FieldLossProfileChart series={result.series} />
            </div>
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3" data-field-right-column="true">
          <div className="panel p-2.5" data-field-selected-panel="true">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="label-xs">Sumber operasional</p>
                <p className="truncate font-display text-sm">{sourceTitle}</p>
              </div>
              <span className="rounded-md bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">FIELD</span>
            </div>

            <OperatorDecisionStrip decision={decision} />

            <div className="mt-2 grid grid-cols-2 gap-2">
              <FieldKpi icon={<Zap className="size-3.5" />} label="Susut teknis" value={summary.technical_loss_kwh.toFixed(2)} unit="kWh/hari" tone="primary" />
              <FieldKpi icon={<Percent className="size-3.5" />} label="Rasio susut" value={`${summary.loss_rate_percent.toFixed(2)}%`} unit="energi sumber" tone="primary" />
              <FieldKpi icon={<Gauge className="size-3.5" />} label="Tegangan minimum" value={summary.min_voltage_pu.toFixed(3)} unit="pu" tone={summary.min_voltage_pu >= 0.9 ? "success" : "warn"} />
              <FieldKpi icon={<Cpu className="size-3.5" />} label="Loading maksimum" value={`${summary.max_loading_percent.toFixed(1)}%`} unit="line / trafo" tone={summary.max_loading_percent <= 100 ? "success" : "warn"} />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" data-action-level="secondary" className="h-8 gap-2 bg-transparent text-xs font-semibold" onClick={openDatasetManager}>
                <Database className="size-3.5" /> Dataset
              </Button>
              <Button variant="outline" size="sm" data-action-level="secondary" className="h-8 gap-2 bg-transparent text-xs font-semibold" onClick={clearFieldOperational}>
                <RotateCcw className="size-3.5" /> Demo
              </Button>
            </div>
          </div>

          <div className="panel min-h-0 overflow-auto p-2.5" data-field-status-panel="true">
            <div className="flex items-center justify-between gap-3">
              <p className="label-xs">Status data lapangan</p>
              <span className="numeric text-[10px] text-muted-foreground">{passedChecks}/{result.checks.length} cek</span>
            </div>
            <div className="mt-2 space-y-1.5">
              <StatusRow label="Validasi dataset" value={report.solverReady ? "SIAP" : "TINJAU"} pass={report.solverReady} />
              <StatusRow label="Perhitungan 3 fasa" value={`${result.series.length}/96`} pass={result.series.length === 96} />
              <StatusRow label="Pemeriksaan teknis" value={result.gate.pass ? "LULUS" : "TINJAU"} pass={result.gate.pass} />
              <StatusRow label="Pengukuran sumber" value={`${networkSummary.sourceMeasurementCoveragePercent.toFixed(1)}%`} pass={networkSummary.sourceMeasurementCoveragePercent >= 85} />
            </div>

            <div className="mt-3 border-t border-border/45 pt-2.5 text-[10px] leading-relaxed text-muted-foreground">
              <p><span className="font-medium text-foreground">Solver:</span> {String(result.provenance.solver ?? "pandapower.runpp_3ph")}</p>
              <p className="mt-1"><span className="font-medium text-foreground">Truth policy:</span> tidak ada hidden truth pada Field Mode.</p>
              <p className="mt-1"><span className="font-medium text-foreground">Eksekusi:</span> browser Web Worker · data tidak diunggah oleh aplikasi.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function qualityHeadline(level: string) {
  if (level === "HIGH") return "Data lengkap";
  if (level === "MEDIUM") return "Data cukup";
  if (level === "LOW") return "Data terbatas";
  return "Perlu tinjau";
}

function TopologyStat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-border/45 bg-surface-2/55 p-3">
      <div className="flex items-center gap-2 text-primary">{icon}<span className="label-xs" style={{ color: "inherit" }}>{label}</span></div>
      <p className="numeric mt-2 text-xl font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="numeric truncate text-right text-foreground">{value}</span></div>;
}

function StatusRow({ label, value, pass }: { label: string; value: string; pass: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/45 bg-surface-2/65 px-2.5 py-2 text-[11px]">
      <span className="flex min-w-0 items-center gap-2"><i className={cn("size-1.5 shrink-0 rounded-full", pass ? "bg-success" : "bg-warn")} /><span className="truncate">{label}</span></span>
      <span className={cn("numeric shrink-0 text-[10px] font-semibold", pass ? "text-success" : "text-warn")}>{value}</span>
    </div>
  );
}

function FieldKpi({ icon, label, value, unit, tone }: { icon: ReactNode; label: string; value: string; unit: string; tone: "primary" | "warn" | "success" }) {
  const toneClass = tone === "primary" ? "text-primary" : tone === "warn" ? "text-warn" : "text-success";
  return (
    <div className="rounded-md bg-surface-2 p-2.5">
      <div className={cn("flex items-center gap-1.5", toneClass)}>{icon}<span className="label-xs" style={{ color: "inherit" }}>{label}</span></div>
      <p className="numeric mt-1 text-base font-semibold leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground">{unit}</p>
    </div>
  );
}

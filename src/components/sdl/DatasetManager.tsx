import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Cpu, Database, FileCheck2, Network, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DRAWER_SHEET_CLASS,
  DrawerHeader,
  DrawerSection,
  DrawerRow,
} from "@/components/sdl/DrawerChrome";
import {
  fieldDatasetSchemaSummary,
  importFieldDataset,
  type FieldDatasetImport,
  type FieldDatasetResult,
} from "@/lib/sdl/fieldDataset";
import {
  activateFieldOperational,
  clearFieldOperational,
  createFieldOperationalSession,
  useFieldOperationalSession,
} from "@/lib/sdl/fieldOperational";
import { buildFieldTopology } from "@/lib/sdl/fieldTopology";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldRunState = "idle" | "running" | "done" | "error";

export function DatasetManager({ open, onOpenChange }: Props) {
  const workerRef = useRef<Worker | null>(null);
  const activeField = useFieldOperationalSession();
  const [fieldImport, setFieldImport] = useState<FieldDatasetImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [runState, setRunState] = useState<FieldRunState>("idle");
  const [runProgress, setRunProgress] = useState({ percent: 0, label: "Belum dijalankan", detail: "" });
  const [fieldResult, setFieldResult] = useState<FieldDatasetResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    const openManager = () => onOpenChange(true);
    window.addEventListener("sdl-open-dataset-manager", openManager);
    return () => window.removeEventListener("sdl-open-dataset-manager", openManager);
  }, [onOpenChange]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    clearFieldOperational();
    setImporting(true);
    setFieldResult(null);
    setFieldImport(null);
    setRunError(null);
    setRunState("idle");
    setRunProgress({ percent: 0, label: "Belum dijalankan", detail: "" });
    try {
      setFieldImport(await importFieldDataset(files));
    } finally {
      setImporting(false);
    }
  };

  const getWorker = () => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(`${import.meta.env.BASE_URL}field-worker.js`);
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data ?? {};
      if (data.type === "field-progress") {
        setRunProgress({
          percent: Number(data.percent) || 0,
          label: fieldProgressLabel(String(data.label ?? "")),
          detail: fieldProgressDetail(String(data.detail ?? "")),
        });
      } else if (data.type === "field-result") {
        setFieldResult(data.payload as FieldDatasetResult);
        setRunState("done");
        setRunError(null);
      } else if (data.type === "field-error") {
        setRunState("error");
        setRunError("Perhitungan data lapangan gagal. Periksa struktur dan kelengkapan dataset.");
      }
    };
    worker.onerror = () => {
      setRunState("error");
      setRunError("Mesin perhitungan data lapangan gagal dijalankan.");
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    workerRef.current = worker;
    return worker;
  };

  const runFieldPreview = () => {
    if (!fieldImport?.dataset || !fieldImport.report.solverReady || runState === "running") return;
    clearFieldOperational();
    setRunState("running");
    setRunError(null);
    setFieldResult(null);
    setRunProgress({ percent: 2, label: "Menyiapkan perhitungan", detail: "Diproses lokal di browser" });
    getWorker().postMessage({ type: "run-field-dataset", dataset: fieldImport.dataset });
  };

  const report = fieldImport?.report;
  const summary = report?.summary;
  const result = fieldResult?.summary;
  const topology = fieldImport?.dataset ? buildFieldTopology(fieldImport.dataset) : null;
  const topologyReady = Boolean(topology?.supported);
  const canActivate = Boolean(
    fieldImport?.dataset &&
    report?.valid &&
    report.solverReady &&
    topologyReady &&
    fieldResult?.gate.pass &&
    fieldResult.series.length === 96,
  );

  const activateFieldCockpit = () => {
    const session = createFieldOperationalSession(fieldImport, fieldResult);
    if (!session) {
      setRunError(topology && !topology.supported
        ? `Aktivasi cockpit ditolak. ${topology.reason ?? "Topology operasional belum didukung."}`
        : "Aktivasi cockpit ditolak. Dataset harus valid, siap dihitung, lulus pemeriksaan, dan menyelesaikan 96 interval.");
      return;
    }
    activateFieldOperational(session);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className={cn(DRAWER_SHEET_CLASS, "sm:max-w-2xl")} data-drawer="dataset-manager">
        <DrawerHeader
          icon={<Database className="size-4" />}
          title="Dataset Manager"
          description="Impor, validasi topology, hitung, lalu aktifkan data lapangan sebagai sumber cockpit."
        />

        <ScrollArea type="always" className="min-h-0 flex-1" data-drawer-scroll="dataset-manager">
          <div className="px-4 pb-3 pt-3 pr-7 sm:px-5 sm:pb-4 sm:pt-4 sm:pr-8" data-drawer-body="true">
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
              <span className="font-semibold text-foreground">Dataset lapangan v1</span>
              <span aria-hidden="true">·</span>
              <span>{activeField ? "Cockpit sedang memakai hasil lapangan yang sudah lulus." : "Cockpit tetap memakai demo sampai hasil lapangan diaktifkan."}</span>
              {activeField && <span className="rounded bg-success/10 px-1.5 py-0.5 font-semibold text-success" data-field-active-indicator="true">FIELD MODE AKTIF</span>}
            </div>

            <DrawerSection>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="label-xs">Impor dataset lapangan</p>
                  <p className="mt-1 text-sm font-medium">4 CSV · satu rentang 24 jam</p>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                    File dibaca lokal di browser. Memilih import baru akan menonaktifkan Field Mode lama agar cockpit tidak pernah menampilkan hasil yang sudah tidak sesuai dengan dataset yang sedang diperiksa.
                  </p>
                </div>
                <label className="shrink-0">
                  <input
                    className="sr-only"
                    type="file"
                    accept=".csv,text/csv"
                    multiple
                    onChange={(event) => void handleFiles(event.target.files)}
                    data-field-files="true"
                  />
                  <span className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-transparent px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-surface">
                    <Upload className="size-3.5" />
                    {importing ? "Membaca…" : "Pilih 4 CSV"}
                  </span>
                </label>
              </div>

              <div className="mt-4 grid gap-2">
                {fieldDatasetSchemaSummary().map((item) => (
                  <div key={item.file} className="grid grid-cols-[128px_1fr] gap-3 border-t border-border/35 pt-2 first:border-0 first:pt-0">
                    <span className="numeric text-xs text-foreground">{item.file}</span>
                    <span className="text-xs text-muted-foreground">{item.role}</span>
                  </div>
                ))}
              </div>
            </DrawerSection>

            {report && summary && (
              <DrawerSection className="mt-3" data-field-validation="true">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {report.solverReady ? <FileCheck2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-warn" />}
                    <div>
                      <p className="label-xs">Kesiapan data</p>
                      <p className={cn("mt-0.5 text-sm font-semibold", report.solverReady ? "text-success" : report.valid ? "text-warn" : "text-destructive")}>
                        {report.solverReady ? "SIAP DIHITUNG" : report.valid ? "VALID · DATA BELUM LENGKAP" : "PERIKSA STRUKTUR DATA"}
                      </p>
                    </div>
                  </div>
                  <span className="numeric text-[10px] text-muted-foreground">96 × 15 menit</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="Elemen jaringan" value={`${summary.networkElements}`} detail={`${summary.lines} saluran · ${summary.transformers} trafo`} />
                  <MiniStat label="Pelanggan" value={`${summary.customers}`} detail={`${summary.meters} meter`} />
                  <MiniStat label="Cakupan AMI" value={`${summary.amiCoveragePercent.toFixed(1)}%`} detail={`${summary.amiPoints}/${summary.amiExpectedPoints}`} />
                  <MiniStat label="Data sumber" value={`${summary.sourceMeasurementCoveragePercent.toFixed(1)}%`} detail={`${summary.sourcePIntervals}/96`} />
                </div>

                {topology && (
                  <div
                    className={cn("mt-3 rounded-md border p-3", topology.supported ? "border-success/25 bg-success/5" : "border-warn/30 bg-warn/5")}
                    data-field-topology-gate="true"
                    data-topology-supported={topology.supported ? "true" : "false"}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Network className={cn("size-4", topology.supported ? "text-success" : "text-warn")} />
                        <div>
                          <p className="label-xs">Topology operasional</p>
                          <p className={cn("mt-0.5 text-xs font-semibold", topology.supported ? "text-success" : "text-warn")}>
                            {topology.supported ? "RADIAL · SIAP DIAKTIFKAN" : "BLOKIR AKTIVASI"}
                          </p>
                        </div>
                      </div>
                      {topology.supported && <span className="numeric text-[10px] text-muted-foreground">depth {topology.maxDepth} · {topology.branchBusIds.length} cabang</span>}
                    </div>
                    {topology.supported ? (
                      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                        {topology.buses.length} bus · {topology.elements.length} elemen · {topology.leafBusIds.length} ujung jaringan. SLD P6 dapat dinavigasi dan difokuskan per aset.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {topology.issues.slice(0, 5).map((topologyIssue, index) => {
                          const affected = [...topologyIssue.elementIds, ...topologyIssue.busIds, ...topologyIssue.customerIds].slice(0, 8);
                          return (
                            <div
                              key={`${topologyIssue.code}-${index}`}
                              className="rounded border border-warn/20 bg-surface/45 px-2.5 py-2 text-[10px] leading-relaxed"
                              data-field-topology-issue={topologyIssue.code}
                              data-topology-elements={topologyIssue.elementIds.join(",")}
                              data-topology-buses={topologyIssue.busIds.join(",")}
                            >
                              <p className="font-medium text-warn">{topologyIssue.message}</p>
                              {!!affected.length && <p className="numeric mt-1 text-muted-foreground">Lokasi: {affected.join(" · ")}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {!!report.errors.length && (
                  <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Kesalahan</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-destructive/90">
                      {report.errors.slice(0, 8).map((error) => <li key={error}>• {error}</li>)}
                    </ul>
                  </div>
                )}
                {!!report.warnings.length && (
                  <div className="mt-3 rounded-md border border-warn/20 bg-warn/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-warn">Peringatan</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      {report.warnings.slice(0, 8).map((warning) => <li key={warning}>• {warning}</li>)}
                    </ul>
                  </div>
                )}
              </DrawerSection>
            )}

            <DrawerSection className="mt-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Cpu className="size-4 text-primary" />
                    <p className="label-xs">Perhitungan data lapangan</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Menjalankan topologi dan AMI yang diimpor dengan aliran daya 3 fasa Pandapower. Hasil hanya dapat diaktifkan jika physics lulus, 96 interval selesai, dan topology radial lolos gate operasional.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-8 shrink-0 gap-2 text-xs"
                  onClick={runFieldPreview}
                  disabled={!report?.solverReady || runState === "running"}
                  data-run-field="true"
                >
                  <Cpu className="size-3.5" />
                  {runState === "running" ? "Menghitung…" : "Jalankan uji"}
                </Button>
              </div>

              <div className="mt-3 overflow-hidden rounded-full bg-surface">
                <div className="h-1 bg-primary transition-all" style={{ width: `${runProgress.percent}%` }} />
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                <span>{runProgress.label}</span>
                <span className="truncate text-right">{runProgress.detail}</span>
              </div>

              {runError && (
                <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{runError}</p>
              )}

              {fieldResult && result && (
                <div className="mt-4" data-field-result="true">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={cn("size-4", fieldResult.gate.pass ? "text-success" : "text-warn")} />
                      <span className={cn("text-sm font-semibold", fieldResult.gate.pass ? "text-success" : "text-warn")}>
                        {fieldResult.gate.pass ? "PERHITUNGAN LULUS" : "PERLU TINJAU"}
                      </span>
                    </div>
                    <span className="numeric text-[10px] text-muted-foreground">{fieldResult.series.length}/96 interval selesai</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MiniStat label="Susut teknis" value={`${result.technical_loss_kwh.toFixed(2)} kWh`} detail={`${result.loss_rate_percent.toFixed(2)}%`} />
                    <MiniStat label="Puncak susut" value={`${result.peak_loss_kw.toFixed(3)} kW`} detail={result.peak_time} />
                    <MiniStat label="Tegangan minimum" value={`${result.min_voltage_pu.toFixed(3)} pu`} detail={`maks. ${result.max_voltage_pu.toFixed(3)} pu`} />
                    <MiniStat label="Beban maksimum" value={`${result.max_loading_percent.toFixed(1)}%`} detail={`saluran ${result.max_line_loading_percent.toFixed(1)}% · TR ${result.max_transformer_loading_percent.toFixed(1)}%`} />
                  </div>
                  <div className="mt-3">
                    <DrawerRow label="Energi tersalurkan" value={`${result.supplied_energy_kwh.toFixed(2)} kWh`} />
                    <DrawerRow label="Energi beban pelanggan" value={`${result.load_energy_kwh.toFixed(2)} kWh`} />
                    <DrawerRow label="Error relatif sumber" value={result.source_nrmse_percent == null ? "—" : `${result.source_nrmse_percent.toFixed(2)}%`} />
                  </div>

                  <div
                    className={cn(
                      "mt-3 flex items-center justify-between gap-4 rounded-md border p-3",
                      canActivate ? "border-success/25 bg-success/5" : "border-warn/25 bg-warn/5",
                    )}
                    data-field-activation="true"
                  >
                    <div className="min-w-0">
                      <p className={cn("text-xs font-semibold", canActivate ? "text-success" : "text-warn")}>
                        {canActivate ? "Siap menjadi sumber cockpit" : "Aktivasi cockpit diblokir"}
                      </p>
                      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                        {canActivate
                          ? "Cockpit akan memakai KPI, profil susut, status, rekomendasi, dan SLD langsung dari dataset lapangan ini."
                          : topology && !topology.supported
                            ? topology.reason
                            : "Perbaiki dataset atau pemeriksaan yang gagal, lalu jalankan ulang sebelum hasil dapat digunakan secara operasional."}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 shrink-0 text-xs"
                      onClick={activateFieldCockpit}
                      disabled={!canActivate}
                      data-activate-field="true"
                    >
                      Gunakan di cockpit
                    </Button>
                  </div>
                </div>
              )}
            </DrawerSection>

            {activeField && (
              <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-success/25 bg-success/5 p-3" data-field-active-control="true">
                <div>
                  <p className="text-xs font-semibold text-success">Field Mode sedang aktif</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Kembali ke demo tidak menghapus file dari sesi Dataset Manager.</p>
                </div>
                <Button variant="outline" size="sm" className="h-8 shrink-0 gap-2 bg-transparent text-xs" onClick={clearFieldOperational}>
                  <RotateCcw className="size-3.5" /> Kembali demo
                </Button>
              </div>
            )}

            <div className="mt-3 rounded-lg border border-border/45 bg-surface-2/25 p-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Batas topology saat ini:</span> cockpit operasional mengaktifkan jaringan radial yang tervalidasi. Mesh/loop, multi-parent, elemen terputus, atau pelanggan di luar jaringan tetap diblokir dan ditunjukkan lokasinya sebelum aktivasi.
            </div>
            <div className="h-1" />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-border/45 bg-surface p-2.5">
      <p className="label-xs">{label}</p>
      <p className="numeric mt-1 text-sm font-semibold">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function fieldProgressLabel(label: string) {
  const value = label.toLowerCase();
  if (value.includes("runtime") || value.includes("pyodide")) return "Menyiapkan mesin perhitungan";
  if (value.includes("network") || value.includes("topology")) return "Menyiapkan jaringan";
  if (value.includes("interval") || value.includes("physics") || value.includes("pandapower")) return "Menghitung interval";
  if (value.includes("result") || value.includes("summary")) return "Menyiapkan hasil";
  return label || "Menghitung data lapangan";
}

function fieldProgressDetail(detail: string) {
  return detail
    .replace(/browser-local/gi, "lokal di browser")
    .replace(/no upload/gi, "tanpa unggah")
    .replace(/runpp_3ph/gi, "aliran daya 3 fasa")
    .replace(/field physics/gi, "perhitungan lapangan")
    .replace(/solved/gi, "selesai")
    .trim();
}

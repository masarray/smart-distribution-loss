import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Cpu, Database, FileCheck2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  fieldDatasetSchemaSummary,
  importFieldDataset,
  type FieldDatasetImport,
  type FieldDatasetResult,
} from "@/lib/sdl/fieldDataset";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldRunState = "idle" | "running" | "done" | "error";

export function DatasetManager({ open, onOpenChange }: Props) {
  const workerRef = useRef<Worker | null>(null);
  const [fieldImport, setFieldImport] = useState<FieldDatasetImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [runState, setRunState] = useState<FieldRunState>("idle");
  const [runProgress, setRunProgress] = useState({ percent: 0, label: "Belum dijalankan", detail: "" });
  const [fieldResult, setFieldResult] = useState<FieldDatasetResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting(true);
    setFieldResult(null);
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
          label: String(data.label ?? "Field physics"),
          detail: String(data.detail ?? ""),
        });
      } else if (data.type === "field-result") {
        setFieldResult(data.payload as FieldDatasetResult);
        setRunState("done");
        setRunError(null);
      } else if (data.type === "field-error") {
        setRunState("error");
        setRunError(String(data.message ?? "Field worker error"));
      }
    };
    worker.onerror = (event) => {
      setRunState("error");
      setRunError(event.message || "Field worker gagal dijalankan.");
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    workerRef.current = worker;
    return worker;
  };

  const runFieldPreview = () => {
    if (!fieldImport?.dataset || !fieldImport.report.solverReady || runState === "running") return;
    setRunState("running");
    setRunError(null);
    setFieldResult(null);
    setRunProgress({ percent: 2, label: "Menyiapkan field runtime", detail: "Browser-local · no upload" });
    getWorker().postMessage({ type: "run-field-dataset", dataset: fieldImport.dataset });
  };

  const report = fieldImport?.report;
  const summary = report?.summary;
  const result = fieldResult?.summary;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full border-border bg-surface p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border/65 px-5 pb-4 pt-5">
          <div className="flex items-center gap-2 pr-8">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Database className="size-4" />
            </span>
            <div>
              <SheetTitle className="font-display text-lg">Dataset Manager</SheetTitle>
              <SheetDescription>Import, validasi, dan proof-run data lapangan sebelum dipakai sebagai operational source.</SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[10px] font-semibold tracking-wider text-primary">
              FIELD DATASET FOUNDATION · V1
            </span>
            <span className="rounded-md border border-warn/25 bg-warn/5 px-2 py-1 text-[10px] text-warn">
              MAIN COCKPIT MASIH SYNTHETIC VIEW
            </span>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8.5rem)] px-5 py-4">
          <section className="rounded-lg border border-border/60 bg-surface-2/45 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="label-xs">Import field dataset</p>
                <p className="mt-1 text-sm font-medium">4 CSV · satu canonical 24-hour window</p>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                  File dibaca lokal di browser. V1 memvalidasi topology, customer mapping, time alignment, AMI completeness, dan parameter 3-fasa sebelum solver boleh dijalankan.
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
                <span className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">
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
          </section>

          {report && summary && (
            <section className="mt-3 rounded-lg border border-border/60 bg-surface-2/35 p-4" data-field-validation="true">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {report.solverReady ? <FileCheck2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-warn" />}
                  <div>
                    <p className="label-xs">Schema &amp; readiness</p>
                    <p className={cn("mt-0.5 text-sm font-semibold", report.solverReady ? "text-success" : report.valid ? "text-warn" : "text-destructive")}>
                      {report.solverReady ? "SOLVER READY" : report.valid ? "VALID · DATA BELUM LENGKAP" : "SCHEMA REVIEW"}
                    </p>
                  </div>
                </div>
                <span className="numeric text-[10px] text-muted-foreground">96 × 15 min</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniStat label="Network" value={`${summary.networkElements}`} detail={`${summary.lines} line · ${summary.transformers} trafo`} />
                <MiniStat label="Customers" value={`${summary.customers}`} detail={`${summary.meters} meter`} />
                <MiniStat label="AMI P" value={`${summary.amiCoveragePercent.toFixed(1)}%`} detail={`${summary.amiPoints}/${summary.amiExpectedPoints}`} />
                <MiniStat label="Source P" value={`${summary.sourceMeasurementCoveragePercent.toFixed(1)}%`} detail={`${summary.sourcePIntervals}/96`} />
              </div>

              {!!report.errors.length && (
                <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Errors</p>
                  <ul className="mt-1.5 space-y-1 text-xs text-destructive/90">
                    {report.errors.slice(0, 8).map((error) => <li key={error}>• {error}</li>)}
                  </ul>
                </div>
              )}
              {!!report.warnings.length && (
                <div className="mt-3 rounded-md border border-warn/20 bg-warn/5 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-warn">Warnings</p>
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    {report.warnings.slice(0, 8).map((warning) => <li key={warning}>• {warning}</li>)}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="mt-3 rounded-lg border border-border/60 bg-surface-2/35 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Cpu className="size-4 text-primary" />
                  <p className="label-xs">Field physics preview</p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Menjalankan imported topology + AMI pada Pandapower <span className="numeric">runpp_3ph</span>. Tidak ada hidden truth, synthetic degradation, atau kalibrasi P3 pada jalur ini.
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
                {runState === "running" ? "Menghitung…" : "Run physics preview"}
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
                      {fieldResult.gate.summary}
                    </span>
                  </div>
                  <span className="numeric text-[10px] text-muted-foreground">{fieldResult.series.length}/96 solved</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="Technical loss" value={`${result.technical_loss_kwh.toFixed(2)} kWh`} detail={`${result.loss_rate_percent.toFixed(2)}%`} />
                  <MiniStat label="Peak loss" value={`${result.peak_loss_kw.toFixed(3)} kW`} detail={result.peak_time} />
                  <MiniStat label="Min voltage" value={`${result.min_voltage_pu.toFixed(3)} pu`} detail={`max ${result.max_voltage_pu.toFixed(3)} pu`} />
                  <MiniStat label="Max loading" value={`${result.max_loading_percent.toFixed(1)}%`} detail={`line ${result.max_line_loading_percent.toFixed(1)}% · TR ${result.max_transformer_loading_percent.toFixed(1)}%`} />
                </div>
                <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                  <div className="flex justify-between border-t border-border/35 pt-2"><span>Supplied energy</span><span className="numeric text-foreground">{result.supplied_energy_kwh.toFixed(2)} kWh</span></div>
                  <div className="flex justify-between border-t border-border/35 pt-2"><span>Customer load energy</span><span className="numeric text-foreground">{result.load_energy_kwh.toFixed(2)} kWh</span></div>
                  <div className="flex justify-between border-t border-border/35 pt-2"><span>Source residual NRMSE</span><span className="numeric text-foreground">{result.source_nrmse_percent == null ? "—" : `${result.source_nrmse_percent.toFixed(2)}%`}</span></div>
                </div>
              </div>
            )}
          </section>

          <div className="mt-3 rounded-lg border border-border/45 bg-surface-2/25 p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">M5 boundary:</span> field-v1 sudah dapat di-import, divalidasi, dinormalisasi, dan dihitung oleh Pandapower 3φ di browser. Fixed SLD cockpit belum diganti dengan topology hasil import agar UI tidak menampilkan jaringan yang berbeda dari data sebenarnya; dynamic field-topology rendering adalah langkah setelah foundation ini.
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

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X } from "lucide-react";
import { fmt, fmtSigned, type AssetLoss } from "@/lib/sdl/derive";
import type { P3Result, SpotDemo, TmDemo } from "@/lib/sdl/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetLoss;
  result: P3Result | null;
  spot: SpotDemo | null;
  tm: TmDemo | null;
  stages: { label: string; detail: string; done: boolean }[];
}

function Row({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? "numeric text-foreground" : "text-foreground"}>{v}</span>
    </div>
  );
}

export function DetailDrawer({ open, onOpenChange, asset, result, spot, tm, stages }: Props) {
  const mvDemo = asset.id === "tm" ? tm : asset.id === "spot" ? spot : null;
  const checks = mvDemo?.checks ?? (asset.domain === "MV" ? [] : (result?.checks ?? []));
  const conv = result?.comparison.conventional;
  const smart = result?.comparison.smart;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-border bg-surface sm:max-w-xl">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="font-display text-lg">Engineering View · {asset.short}</SheetTitle>
          <SheetDescription>
            Validasi model, residual, gate, parameter, dan proses teknis. {asset.note}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="loss" className="mt-4 flex h-[calc(100vh-9rem)] flex-col">
          <TabsList className="grid w-full grid-cols-5 bg-surface-2">
            <TabsTrigger value="loss">Susut</TabsTrigger>
            <TabsTrigger value="residual">Residual</TabsTrigger>
            <TabsTrigger value="gates">Gate</TabsTrigger>
            <TabsTrigger value="process">Proses</TabsTrigger>
            <TabsTrigger value="held">Held</TabsTrigger>
          </TabsList>

          <ScrollArea className="mt-3 flex-1 pr-3">
            <TabsContent value="loss" className="mt-0">
              <div className="mb-3 rounded-md border border-warn/20 bg-warn/5 p-3 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Synthetic validation only.</span> Ground Truth disembunyikan dari kalibrasi dan hanya dibuka untuk pembuktian akhir; metrik vs truth di bawah bukan KPI operasi lapangan.
              </div>
              <Row k="Susut acuan (ground truth)" v={`${fmt(asset.truthKwh, 3)} kWh/hari`} />
              <Row k="Model konvensional" v={`${fmt(asset.convKwh, 3)} kWh/hari`} />
              <Row k="Smart engine" v={`${fmt(asset.smartKwh, 3)} kWh/hari`} />
              <Row k="Error konvensional" v={fmtSigned(asset.convErr, 3)} />
              <Row k="Error smart engine" v={fmtSigned(asset.smartErr, 3)} />
              <Row k="Aksi smart engine" v={asset.action} mono={false} />
              <Row k="Kelas observabilitas" v={asset.observability} mono={false} />
              {mvDemo && (
                <>
                  {mvDemo.scenario_id && <Row k="Scenario ID" v={mvDemo.scenario_id} />}
                  {mvDemo.fingerprint && <Row k="Fingerprint" v={mvDemo.fingerprint} />}
                  <p className="mt-4 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
                    {mvDemo.smart_action.reason} Diubah: {mvDemo.smart_action.changed}. Dipertahankan: {mvDemo.smart_action.held}.
                  </p>
                </>
              )}
            </TabsContent>

            <TabsContent value="residual" className="mt-0">
              {asset.domain === "LV" || asset.domain === "FEEDER" ? (
                <>
                  <Row k="Source-P NRMSE" v={`${fmt(conv?.source_nrmse_percent, 3)}% → ${fmt(smart?.source_nrmse_percent, 3)}%`} />
                  <Row k="Phase-P RMSE" v={`${fmt(conv?.phase_rmse_kw, 4)} → ${fmt(smart?.phase_rmse_kw, 4)} kW`} />
                  <Row k="Voltage RMSE" v={`${fmt(conv?.voltage_rmse_pu, 6)} → ${fmt(smart?.voltage_rmse_pu, 6)} pu`} />
                  <Row
                    k="Hold-out objective"
                    v={`${fmt(conv?.objective_validation, 6)} → ${fmt(smart?.objective_validation, 6)}`}
                  />
                  <Row
                    k="Akurasi fasa (validasi)"
                    v={`${fmt(conv?.phase_accuracy_percent_validation_only, 2)}% → ${fmt(smart?.phase_accuracy_percent_validation_only, 2)}%`}
                  />
                  <Row k="Split kalibrasi/hold-out" v={result ? `${result.split.calibration_intervals} / ${result.split.validation_intervals} interval` : "—"} />
                </>
              ) : (
                <>
                  <Row
                    k="Source NRMSE"
                    v={`${fmt(mvDemo?.comparison.conventional.source_nrmse_percent, 4)}% → ${fmt(mvDemo?.comparison.smart.source_nrmse_percent, 4)}%`}
                  />
                  <Row
                    k="Resistansi saluran"
                    v={`${fmt(mvDemo?.comparison.conventional.line_r_ohm_per_km, 4)} → ${fmt(mvDemo?.comparison.smart.line_r_ohm_per_km, 4)} Ω/km`}
                  />
                  {mvDemo?.scenario?.intervals && (
                    <Row
                      k="Resolusi model"
                      v={`${mvDemo.scenario.intervals} interval${mvDemo.scenario.interval_minutes ? ` · ${mvDemo.scenario.interval_minutes} menit` : ""}`}
                    />
                  )}
                  {mvDemo?.scenario?.line_length_km != null && (
                    <Row k="Panjang saluran" v={`${fmt(mvDemo.scenario.line_length_km, 2)} km`} />
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="gates" className="mt-0">
              {checks.length === 0 && <p className="py-6 text-sm text-muted-foreground">Jalankan analisis untuk melihat hasil gate.</p>}
              {checks.map((c) => (
                <div key={c.name} className="flex gap-3 border-b border-border/60 py-2.5 last:border-0">
                  <span
                    className={
                      c.pass
                        ? "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success/20 text-success"
                        : "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive"
                    }
                  >
                    {c.pass ? <Check className="size-3" /> : <X className="size-3" />}
                  </span>
                  <div>
                    <p className="text-sm text-foreground">{c.name}</p>
                    <p className="numeric text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="process" className="mt-0">
              <p className="pb-3 text-xs text-muted-foreground">
                Pipeline Smart Engine dipindahkan dari cockpit operasi ke sini agar metode tetap dapat diaudit tanpa memenuhi layar utama.
              </p>
              <ol className="space-y-1.5">
                {stages.map((stage, index) => (
                  <li key={stage.label} className="flex gap-3 rounded-md border border-border/45 bg-surface-2/45 p-2.5">
                    <span
                      className={
                        stage.done
                          ? "numeric flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] text-primary"
                          : "numeric flex size-5 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] text-muted-foreground"
                      }
                    >
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm text-foreground">{stage.label}</p>
                      <p className="text-xs text-muted-foreground">{stage.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </TabsContent>

            <TabsContent value="held" className="mt-0">
              {mvDemo ? (
                <>
                  <p className="pb-3 text-xs text-muted-foreground">
                    Batas kalibrasi aset MV ini dijaga per skenario agar tidak mengambil state dari aset MV lain.
                  </p>
                  <Row k="Diubah" v={mvDemo.smart_action.changed} mono={false} />
                  <Row k="Dipertahankan" v={mvDemo.smart_action.held} mono={false} />
                </>
              ) : (
                <>
                  <p className="pb-3 text-xs text-muted-foreground">
                    Parameter yang sengaja TIDAK dikalibrasi karena tidak teridentifikasi oleh pengukuran yang tersedia —
                    batas kejujuran engine.
                  </p>
                  {(result?.unresolved ?? []).map((u) => (
                    <div key={u.parameter} className="border-b border-border/60 py-2.5 last:border-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{u.parameter}</span>
                        <span className="label-xs text-warn">{u.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{u.reason}</p>
                    </div>
                  ))}
                </>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

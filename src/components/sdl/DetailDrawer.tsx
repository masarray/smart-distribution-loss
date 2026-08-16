import { Check, ShieldCheck, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DRAWER_BODY_CLASS,
  DRAWER_SCROLL_CLASS,
  DRAWER_SHEET_CLASS,
  DRAWER_TAB_CLASS,
  DRAWER_TAB_CONTENT_CLASS,
  DRAWER_TABS_LIST_CLASS,
  DrawerHeader,
  DrawerRow,
} from "@/components/sdl/DrawerChrome";
import { fmt, fmtSigned, type AssetLoss } from "@/lib/sdl/derive";
import type { P3Result, SpotDemo, TmDemo } from "@/lib/sdl/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetLoss;
  result: P3Result | null;
  spot: SpotDemo | null;
  tm: TmDemo | null;
  stages: { label: string; detail: string; done: boolean }[];
}

const PROCESS_STAGES = [
  ["Sinkronisasi waktu", "Koreksi waktu hanya pada data yang terdeteksi bergeser."],
  ["Melengkapi data meter", "Data meter yang hilang diestimasi dari pola beban yang tersedia."],
  ["Estimasi fasa", "Fasa yang belum diketahui diestimasi dari pola daya terukur."],
  ["Acuan daya reaktif", "Data daya reaktif yang tersedia dipakai sebagai acuan jaringan."],
  ["Estimasi faktor daya", "Faktor daya yang belum diketahui disesuaikan terhadap pengukuran jaringan."],
  ["Penyesuaian parameter jaringan", "Hanya parameter yang cukup dikenali oleh data yang disesuaikan."],
  ["Perhitungan model Smart", "Model akhir dihitung kembali dengan hasil koreksi yang lolos pemeriksaan."],
] as const;

export function DetailDrawer({ open, onOpenChange, asset, result, spot, tm, stages }: Props) {
  const mvDemo = asset.id === "tm" ? tm : asset.id === "spot" ? spot : null;
  const checks = mvDemo?.checks ?? (asset.domain === "MV" ? [] : (result?.checks ?? []));
  const conv = result?.comparison.conventional;
  const smart = result?.comparison.smart;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn(DRAWER_SHEET_CLASS, "sm:max-w-xl")} data-drawer="technical">
        <DrawerHeader
          icon={<ShieldCheck className="size-4" />}
          title={<>Detail teknis · {asset.short}</>}
          description="Validasi, proses, dan batas model."
        />

        <Tabs defaultValue="loss" className={DRAWER_BODY_CLASS} data-drawer-body="true">
          <TabsList className={cn(DRAWER_TABS_LIST_CLASS, "grid-cols-5")} data-drawer-tabs="true">
            <TabsTrigger className={DRAWER_TAB_CLASS} value="loss">Susut</TabsTrigger>
            <TabsTrigger className={DRAWER_TAB_CLASS} value="residual">Kecocokan</TabsTrigger>
            <TabsTrigger className={DRAWER_TAB_CLASS} value="gates">Pemeriksaan</TabsTrigger>
            <TabsTrigger className={DRAWER_TAB_CLASS} value="process">Proses</TabsTrigger>
            <TabsTrigger className={DRAWER_TAB_CLASS} value="held">Batas data</TabsTrigger>
          </TabsList>

          <TabsContent value="loss" className={DRAWER_TAB_CONTENT_CLASS}>
            <ScrollArea type="always" className={DRAWER_SCROLL_CLASS} data-drawer-scroll="technical-loss">
              <div className="pb-3">
                <DrawerRow label="Acuan validasi" value={`${fmt(asset.truthKwh, 3)} kWh/hari`} />
                <DrawerRow label="Model dasar" value={`${fmt(asset.convKwh, 3)} kWh/hari`} />
                <DrawerRow label="Smart Engine" value={`${fmt(asset.smartKwh, 3)} kWh/hari`} />
                <DrawerRow label="Error model dasar" value={fmtSigned(asset.convErr, 3)} />
                <DrawerRow label="Error Smart Engine" value={fmtSigned(asset.smartErr, 3)} />
                <DrawerRow label="Kelengkapan data" value={userObservability(asset.observability)} mono={false} />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="residual" className={DRAWER_TAB_CONTENT_CLASS}>
            <ScrollArea type="always" className={DRAWER_SCROLL_CLASS} data-drawer-scroll="technical-fit">
              <div className="pb-3">
                {asset.domain === "LV" || asset.domain === "FEEDER" ? (
                  <>
                    <DrawerRow label="Error daya sumber" value={`${fmt(conv?.source_nrmse_percent, 3)}% → ${fmt(smart?.source_nrmse_percent, 3)}%`} />
                    <DrawerRow label="Error daya per fasa" value={`${fmt(conv?.phase_rmse_kw, 4)} → ${fmt(smart?.phase_rmse_kw, 4)} kW`} />
                    <DrawerRow label="Error tegangan" value={`${fmt(conv?.voltage_rmse_pu, 6)} → ${fmt(smart?.voltage_rmse_pu, 6)} pu`} />
                    <DrawerRow label="Skor data uji" value={`${fmt(conv?.objective_validation, 6)} → ${fmt(smart?.objective_validation, 6)}`} />
                    <DrawerRow label="Akurasi fasa" value={`${fmt(conv?.phase_accuracy_percent_validation_only, 2)}% → ${fmt(smart?.phase_accuracy_percent_validation_only, 2)}%`} />
                    <DrawerRow label="Data kalibrasi / uji" value={result ? `${result.split.calibration_intervals} / ${result.split.validation_intervals} interval` : "—"} />
                  </>
                ) : (
                  <>
                    <DrawerRow label="Error daya sumber" value={`${fmt(mvDemo?.comparison.conventional.source_nrmse_percent, 4)}% → ${fmt(mvDemo?.comparison.smart.source_nrmse_percent, 4)}%`} />
                    <DrawerRow label="Resistansi saluran" value={`${fmt(mvDemo?.comparison.conventional.line_r_ohm_per_km, 4)} → ${fmt(mvDemo?.comparison.smart.line_r_ohm_per_km, 4)} Ω/km`} />
                    {mvDemo?.scenario?.intervals && <DrawerRow label="Resolusi model" value={`${mvDemo.scenario.intervals} interval${mvDemo.scenario.interval_minutes ? ` · ${mvDemo.scenario.interval_minutes} menit` : ""}`} />}
                    {mvDemo?.scenario?.line_length_km != null && <DrawerRow label="Panjang saluran" value={`${fmt(mvDemo.scenario.line_length_km, 2)} km`} />}
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="gates" className={DRAWER_TAB_CONTENT_CLASS}>
            <ScrollArea type="always" className={DRAWER_SCROLL_CLASS} data-drawer-scroll="technical-checks">
              <div className="pb-3">
                {checks.length === 0 && <p className="py-6 text-sm text-muted-foreground">Jalankan analisis untuk melihat hasil pemeriksaan.</p>}
                {checks.map((check) => (
                  <div key={check.name} className="flex gap-3 border-b border-border/45 py-2.5 last:border-0">
                    <span className={check.pass ? "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success/20 text-success" : "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive"}>
                      {check.pass ? <Check className="size-3" /> : <X className="size-3" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{userCheckName(check.name)}</p>
                      {!check.pass && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{userCheckDetail(check.name, check.detail, check.pass)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="process" className={DRAWER_TAB_CONTENT_CLASS}>
            <ScrollArea type="always" className={DRAWER_SCROLL_CLASS} data-drawer-scroll="technical-process">
              <ol className="space-y-1.5 pb-3">
                {stages.map((stage, index) => {
                  const copy = PROCESS_STAGES[index] ?? ["Tahap perhitungan", "Tahap teknis model."];
                  return (
                    <li key={`${index}-${stage.label}`} className="flex gap-3 rounded-md border border-border/45 bg-surface-2/35 p-2.5">
                      <span className={stage.done ? "numeric flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-[10px] text-primary" : "numeric flex size-5 shrink-0 items-center justify-center rounded-full border border-border/50 bg-surface text-[10px] text-muted-foreground"}>{index + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{copy[0]}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{copy[1]}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="held" className={DRAWER_TAB_CONTENT_CLASS}>
            <ScrollArea type="always" className={DRAWER_SCROLL_CLASS} data-drawer-scroll="technical-boundaries">
              <div className="pb-3">
                {mvDemo ? (
                  <>
                    <DrawerRow label="Disesuaikan" value="Resistansi saluran" mono={false} />
                    <DrawerRow label="Tetap" value="Topologi, profil beban, fasa, dan waktu pencatatan" mono={false} />
                  </>
                ) : (
                  <>
                    {(result?.unresolved ?? []).map((item) => (
                      <div key={item.parameter} className="border-b border-border/45 py-2.5 last:border-0">
                        <p className="text-sm text-foreground">{userUnresolvedName(item.parameter)}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{userUnresolvedReason(item.parameter)}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function userObservability(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("poor") || normalized.includes("low")) return "Rendah";
  if (normalized.includes("typical") || normalized.includes("medium")) return "Sedang";
  if (normalized.includes("good") || normalized.includes("high")) return "Tinggi";
  return value;
}

function userCheckName(name: string) {
  const value = name.toLowerCase();
  if (value.includes("ground truth") || value.includes("immutable")) return "Acuan demo tidak dipakai untuk kalibrasi";
  if (value.includes("verified phase") || value.includes("pf inputs")) return "Data terverifikasi tidak diubah";
  if (value.includes("power flows converged") || value.includes("converged")) return "Seluruh interval berhasil dihitung";
  if (value.includes("hold-out") || value.includes("objective improved")) return "Kecocokan pada data uji membaik";
  if (value.includes("aggregate source") || value.includes("source-p fit")) return "Kecocokan daya sumber membaik";
  if (value.includes("phase-p fit")) return "Kecocokan daya per fasa membaik";
  if (value.includes("technical-loss estimate improved")) return "Estimasi susut membaik pada data uji";
  if (value.includes("phase assignment")) return "Estimasi fasa tidak memburuk";
  if (value.includes("voltage remains plausible") || value.includes("voltage")) return "Tegangan tetap dalam rentang wajar";
  if (value.includes("runtime") || value.includes("budget")) return "Waktu perhitungan memenuhi target";
  if (value.includes("independent")) return "Data aset tetap terpisah";
  if (value.includes("residual")) return "Selisih pengukuran membaik";
  return "Pemeriksaan model";
}

function userCheckDetail(name: string, detail: string, pass: boolean) {
  const value = name.toLowerCase();
  if (value.includes("ground truth") || value.includes("immutable")) return "Acuan hanya digunakan untuk validasi akhir.";
  if (value.includes("verified phase") || value.includes("pf inputs")) return "Hanya data yang belum diketahui yang boleh disesuaikan.";
  if (value.includes("power flows converged") || value.includes("converged")) return "Sebagian interval aliran daya 3 fasa belum berhasil diselesaikan.";
  if (value.includes("technical-loss estimate improved")) return cleanMetricDetail(detail).replace(/vs hidden truth/i, "terhadap acuan demo");
  if (value.includes("runtime") || value.includes("budget")) {
    const seconds = detail.match(/([0-9]+(?:\.[0-9]+)?)\s*s/i)?.[1];
    return seconds ? `${seconds} detik untuk 96 interval.` : "Waktu perhitungan melewati target.";
  }
  if (value.includes("aggregate source") || value.includes("source-p fit") || value.includes("phase-p fit") || value.includes("hold-out") || value.includes("phase assignment") || value.includes("voltage")) return cleanMetricDetail(detail);
  return pass ? "Pemeriksaan selesai." : "Hasil pemeriksaan perlu ditinjau.";
}

function cleanMetricDetail(detail: string) {
  return detail
    .replace(/SHA-256\s+[a-f0-9….]+/gi, "")
    .replace(/runpp_3ph/gi, "perhitungan 3 fasa")
    .replace(/NRMSE/gi, "error relatif")
    .replace(/RMSE/gi, "error")
    .replace(/hidden truth/gi, "acuan demo")
    .replace(/unseen intervals/gi, "interval uji")
    .trim();
}

function userUnresolvedName(parameter: string) {
  const value = parameter.toLowerCase();
  if (value.includes("mapping")) return "Pemetaan pelanggan per cabang";
  if (value.includes("sr length") || value.includes("service")) return "Panjang sambungan pelanggan";
  if (value.includes("vk") || value.includes("vkr") || value.includes("transformer")) return "Impedansi trafo";
  return "Parameter jaringan";
}

function userUnresolvedReason(parameter: string) {
  const value = parameter.toLowerCase();
  if (value.includes("mapping")) return "Pengukuran per cabang belum tersedia untuk memastikan lokasi pelanggan.";
  if (value.includes("sr length") || value.includes("service")) return "Pengukuran tiap pelanggan belum cukup untuk menentukan panjang sambungan secara andal.";
  if (value.includes("vk") || value.includes("vkr") || value.includes("transformer")) return "Data yang tersedia belum cukup untuk mengestimasi parameter trafo dengan andal.";
  return "Data yang tersedia belum cukup untuk menentukan parameter ini dengan andal.";
}

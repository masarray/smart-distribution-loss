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
      <span className={mono ? "numeric text-right text-foreground" : "text-right text-foreground"}>{v}</span>
    </div>
  );
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
      <SheetContent side="right" className="w-full border-border bg-surface sm:max-w-xl">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="font-display text-lg">Detail teknis · {asset.short}</SheetTitle>
          <SheetDescription>Kecocokan model, pemeriksaan, proses, dan batas perhitungan.</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="loss" className="mt-4 flex h-[calc(100vh-9rem)] flex-col">
          <TabsList className="grid w-full grid-cols-5 bg-surface-2">
            <TabsTrigger value="loss">Susut</TabsTrigger>
            <TabsTrigger value="residual">Kecocokan</TabsTrigger>
            <TabsTrigger value="gates">Pemeriksaan</TabsTrigger>
            <TabsTrigger value="process">Proses</TabsTrigger>
            <TabsTrigger value="held">Batas data</TabsTrigger>
          </TabsList>

          <ScrollArea className="mt-3 flex-1 pr-3">
            <TabsContent value="loss" className="mt-0">
              <div className="mb-3 rounded-md border border-warn/20 bg-warn/5 p-3 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">Validasi demo.</span> Acuan demo hanya digunakan untuk mengecek hasil akhir, bukan untuk kalibrasi.
              </div>
              <Row k="Acuan demo" v={`${fmt(asset.truthKwh, 3)} kWh/hari`} />
              <Row k="Model dasar" v={`${fmt(asset.convKwh, 3)} kWh/hari`} />
              <Row k="Smart Engine" v={`${fmt(asset.smartKwh, 3)} kWh/hari`} />
              <Row k="Error model dasar" v={fmtSigned(asset.convErr, 3)} />
              <Row k="Error Smart Engine" v={fmtSigned(asset.smartErr, 3)} />
              <Row k="Kelengkapan data" v={userObservability(asset.observability)} mono={false} />
            </TabsContent>

            <TabsContent value="residual" className="mt-0">
              {asset.domain === "LV" || asset.domain === "FEEDER" ? (
                <>
                  <Row k="Error daya sumber" v={`${fmt(conv?.source_nrmse_percent, 3)}% → ${fmt(smart?.source_nrmse_percent, 3)}%`} />
                  <Row k="Error daya per fasa" v={`${fmt(conv?.phase_rmse_kw, 4)} → ${fmt(smart?.phase_rmse_kw, 4)} kW`} />
                  <Row k="Error tegangan" v={`${fmt(conv?.voltage_rmse_pu, 6)} → ${fmt(smart?.voltage_rmse_pu, 6)} pu`} />
                  <Row k="Skor data uji" v={`${fmt(conv?.objective_validation, 6)} → ${fmt(smart?.objective_validation, 6)}`} />
                  <Row k="Akurasi fasa" v={`${fmt(conv?.phase_accuracy_percent_validation_only, 2)}% → ${fmt(smart?.phase_accuracy_percent_validation_only, 2)}%`} />
                  <Row k="Data kalibrasi / uji" v={result ? `${result.split.calibration_intervals} / ${result.split.validation_intervals} interval` : "—"} />
                </>
              ) : (
                <>
                  <Row k="Error daya sumber" v={`${fmt(mvDemo?.comparison.conventional.source_nrmse_percent, 4)}% → ${fmt(mvDemo?.comparison.smart.source_nrmse_percent, 4)}%`} />
                  <Row k="Resistansi saluran" v={`${fmt(mvDemo?.comparison.conventional.line_r_ohm_per_km, 4)} → ${fmt(mvDemo?.comparison.smart.line_r_ohm_per_km, 4)} Ω/km`} />
                  {mvDemo?.scenario?.intervals && <Row k="Resolusi model" v={`${mvDemo.scenario.intervals} interval${mvDemo.scenario.interval_minutes ? ` · ${mvDemo.scenario.interval_minutes} menit` : ""}`} />}
                  {mvDemo?.scenario?.line_length_km != null && <Row k="Panjang saluran" v={`${fmt(mvDemo.scenario.line_length_km, 2)} km`} />}
                </>
              )}
            </TabsContent>

            <TabsContent value="gates" className="mt-0">
              {checks.length === 0 && <p className="py-6 text-sm text-muted-foreground">Jalankan analisis untuk melihat hasil pemeriksaan.</p>}
              {checks.map((check) => (
                <div key={check.name} className="flex gap-3 border-b border-border/60 py-2.5 last:border-0">
                  <span className={check.pass ? "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success/20 text-success" : "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive"}>
                    {check.pass ? <Check className="size-3" /> : <X className="size-3" />}
                  </span>
                  <div>
                    <p className="text-sm text-foreground">{userCheckName(check.name)}</p>
                    <p className="text-xs text-muted-foreground">{userCheckDetail(check.name, check.detail, check.pass)}</p>
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="process" className="mt-0">
              <p className="pb-3 text-xs text-muted-foreground">Urutan koreksi data hingga model Smart siap dihitung.</p>
              <ol className="space-y-1.5">
                {stages.map((stage, index) => {
                  const copy = PROCESS_STAGES[index] ?? ["Tahap perhitungan", "Tahap teknis model."];
                  return (
                    <li key={`${index}-${stage.label}`} className="flex gap-3 rounded-md border border-border/45 bg-surface-2/45 p-2.5">
                      <span className={stage.done ? "numeric flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] text-primary" : "numeric flex size-5 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] text-muted-foreground"}>{index + 1}</span>
                      <div><p className="text-sm text-foreground">{copy[0]}</p><p className="text-xs text-muted-foreground">{copy[1]}</p></div>
                    </li>
                  );
                })}
              </ol>
            </TabsContent>

            <TabsContent value="held" className="mt-0">
              {mvDemo ? (
                <><p className="pb-3 text-xs text-muted-foreground">Hanya parameter yang cukup didukung pengukuran yang boleh disesuaikan.</p><Row k="Disesuaikan" v="Resistansi saluran" mono={false} /><Row k="Tetap" v="Topologi, profil beban, fasa, dan waktu pencatatan" mono={false} /></>
              ) : (
                <><p className="pb-3 text-xs text-muted-foreground">Parameter berikut tidak dihitung karena data belum cukup.</p>{(result?.unresolved ?? []).map((item) => <div key={item.parameter} className="border-b border-border/60 py-2.5 last:border-0"><p className="text-sm text-foreground">{userUnresolvedName(item.parameter)}</p><p className="mt-0.5 text-xs text-muted-foreground">{userUnresolvedReason(item.parameter)}</p></div>)}</>
              )}
            </TabsContent>
          </ScrollArea>
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
  if (value.includes("power flows converged") || value.includes("converged")) return "Seluruh interval aliran daya 3 fasa berhasil diselesaikan.";
  if (value.includes("technical-loss estimate improved")) return cleanMetricDetail(detail).replace(/vs hidden truth/i, "terhadap acuan demo");
  if (value.includes("runtime") || value.includes("budget")) {
    const seconds = detail.match(/([0-9]+(?:\.[0-9]+)?)\s*s/i)?.[1];
    return seconds ? `${seconds} detik untuk 96 interval.` : "Waktu perhitungan masih dalam target.";
  }
  if (value.includes("aggregate source") || value.includes("source-p fit") || value.includes("phase-p fit") || value.includes("hold-out") || value.includes("phase assignment") || value.includes("voltage")) return cleanMetricDetail(detail);
  return pass ? "Pemeriksaan selesai tanpa masalah." : "Hasil pemeriksaan perlu ditinjau.";
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

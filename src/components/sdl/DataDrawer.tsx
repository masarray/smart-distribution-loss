import { Database } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmt, type AssetLoss } from "@/lib/sdl/derive";
import { PRESET_PROFILE, type P3Result, type Preset, type SeriesPoint, type SpotDemo, type TmDemo } from "@/lib/sdl/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetLoss;
  result: P3Result | null;
  spot: SpotDemo | null;
  tm: TmDemo | null;
  preset: Preset;
}

function Row({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-border/45 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? "numeric max-w-[62%] text-right" : "max-w-[62%] text-right"}>{v}</span>
    </div>
  );
}

function Coverage({ label, percent, count, total }: { label: string; percent: number; count?: number; total?: number }) {
  const tone = percent >= 85 ? "bg-success" : percent >= 55 ? "bg-warn" : "bg-destructive";
  return (
    <div className="border-b border-border/45 py-2.5 last:border-0">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="numeric">{percent.toFixed(1)}%{count != null && total != null ? ` · ${count}/${total}` : ""}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}

const NETWORK: Record<AssetLoss["id"], { topology: string; rows: Array<[string, string]> }> = {
  feeder: {
    topology: "Total Penyulang 20 kV berasal dari tiga aset yang dihitung terpisah.",
    rows: [["Aset pembentuk", "Referensi TM + Pelanggan TM + GD-01"], ["Penyelarasan waktu", "96 × 15 menit"], ["Hasil", "Penjumlahan susut per aset"]],
  },
  spot: {
    topology: "20 kV → saluran 5 km → beban referensi 3 fasa.",
    rows: [["Tegangan", "20 kV"], ["Panjang saluran", "5,00 km"], ["Faktor daya model", "0,96"]],
  },
  tm: {
    topology: "20 kV → saluran 2,8 km → pelanggan TM 3 fasa.",
    rows: [["Tegangan", "20 kV"], ["Panjang saluran", "2,80 km"], ["Interval meter", "15 menit"]],
  },
  gd: {
    topology: "20 kV → trafo 400 kVA → 3 JTR → 90 pelanggan.",
    rows: [["Trafo", "400 kVA · 20/0,4 kV · Dyn"], ["Bagian 20 kV", "0,25 km"], ["JTR", "3 cabang radial"], ["Pelanggan", "90"]],
  },
};

const LINEAGE: Record<AssetLoss["id"], Array<[string, string]>> = {
  feeder: [["Hasil per aset", "Ambil susut Referensi TM, Pelanggan TM, dan GD-01."], ["Penyelarasan waktu", "Samakan waktu pada interval 15 menit."], ["Penjumlahan", "Jumlahkan susut ketiga aset per interval."], ["Total harian", "Integrasikan menjadi kWh/hari."]],
  spot: [["Profil beban", "Gunakan profil beban TM 96 × 15 menit."], ["Data terukur", "Pertahankan daya, kondisi beban, dan waktu pencatatan."], ["Model dasar", "Hitung susut awal dari parameter jaringan."], ["Koreksi Smart", "Sesuaikan resistansi saluran yang dapat dikenali."], ["Hasil", "Hitung susut per interval dan total harian."]],
  tm: [["Profil pelanggan", "Gunakan profil Pelanggan TM 96 × 15 menit."], ["Meter tersendiri", "Pengukuran tidak mengambil data Referensi TM."], ["Model dasar", "Hitung susut awal saluran 2,8 km."], ["Koreksi Smart", "Sesuaikan resistansi dari pengukuran yang tersedia."], ["Hasil", "Hitung susut per interval dan total harian."]],
  gd: [["Model jaringan", "Bangun 90 pelanggan, 3 JTR, trafo, dan profil 15 menit."], ["Kondisi data", "Terapkan kelengkapan data sesuai skenario."], ["Rekonstruksi Smart", "Lengkapi informasi yang belum diketahui."], ["Perhitungan 3 fasa", "Hitung seluruh 96 interval."], ["Hasil", "Bentuk profil susut dan total kWh/hari."]],
};

export function DataDrawer({ open, onOpenChange, asset, result, spot, tm, preset }: Props) {
  const profile = PRESET_PROFILE[preset];
  const lossSeries = result?.asset_series?.[asset.id] ?? [];
  const mvDemo = asset.id === "spot" ? spot : asset.id === "tm" ? tm : null;
  const sourceSeries: SeriesPoint[] = asset.id === "spot" ? (spot?.series ?? []) : asset.id === "tm" ? (tm?.series ?? []) : asset.id === "gd" ? (result?.series ?? []) : [];
  const network = NETWORK[asset.id];
  const calculated = lossSeries.length === 96;
  const coverageCount = (percent: number) => Math.round((percent / 100) * 90);
  const mvObs = mvDemo?.observability as Record<string, unknown> | undefined;
  const obs = (key: string) => typeof mvObs?.[key] === "number" ? Number(mvObs[key]) : 100;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden border-border bg-surface p-0 sm:max-w-2xl"
        data-drawer="data"
      >
        <SheetHeader className="shrink-0 border-b border-border/65 px-4 pb-3 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
          <div className="flex items-center gap-2 pr-8">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warn/10 text-warn"><Database className="size-4" /></span>
            <div className="min-w-0">
              <SheetTitle className="truncate font-display text-base sm:text-lg">Data · {asset.short}</SheetTitle>
              <SheetDescription className="text-xs sm:text-sm">Demo sintetis · 24 jam · interval 15 menit.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
          <TabsList className="grid h-auto min-h-9 shrink-0 grid-cols-5 bg-surface-2">
            <TabsTrigger className="px-1 text-[11px] sm:px-3 sm:text-sm" value="overview">Ringkasan</TabsTrigger>
            <TabsTrigger className="px-1 text-[11px] sm:px-3 sm:text-sm" value="measurements">Pengukuran</TabsTrigger>
            <TabsTrigger className="px-1 text-[11px] sm:px-3 sm:text-sm" value="network">Jaringan</TabsTrigger>
            <TabsTrigger className="px-1 text-[11px] sm:px-3 sm:text-sm" value="processed">Hasil</TabsTrigger>
            <TabsTrigger className="px-1 text-[11px] sm:px-3 sm:text-sm" value="lineage">Jejak data</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea type="always" className="min-h-0 flex-1 pr-3" data-drawer-scroll="overview">
              <div className="pb-3">
                <Row k="Aset" v={asset.label} mono={false} />
                <Row k="Sumber" v="Demo sintetis" mono={false} />
                <Row k="Interval" v="96 × 15 menit" />
                <Row k="Susut Smart" v={`${fmt(asset.smartKwh, 3)} kWh/hari`} />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="measurements" className="mt-3 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea type="always" className="min-h-0 flex-1 pr-3" data-drawer-scroll="measurements">
              <div className="pb-3">
                {asset.id === "gd" && <><p className="mb-2 text-xs text-muted-foreground">Skenario {presetLabel(preset)} · 90 pelanggan.</p><Coverage label="Meter tersedia" percent={profile.ami} count={coverageCount(profile.ami)} total={90} /><Coverage label="Fasa diketahui" percent={profile.phase} count={coverageCount(profile.phase)} total={90} /><Coverage label="Faktor daya diketahui" percent={profile.pf} count={coverageCount(profile.pf)} total={90} /><Coverage label="Pemetaan pelanggan benar" percent={profile.mapping} count={coverageCount(profile.mapping)} total={90} /><Row k="Pengukuran jaringan" v="Daya P/Q penyulang + tegangan LV A/B/C" mono={false} /></>}
                {(asset.id === "spot" || asset.id === "tm") && <><Coverage label="Daya aktif & reaktif" percent={obs("load_pq_percent")} /><Coverage label="Data fasa" percent={obs("phase_percent")} /><Coverage label="Topologi jaringan" percent={obs("topology_percent")} /><Coverage label="Pemetaan" percent={obs("mapping_percent")} /><Coverage label="Waktu pencatatan" percent={obs("timing_percent")} /><Row k="Interval" v={`${mvDemo?.scenario?.intervals ?? 96} × ${mvDemo?.scenario?.interval_minutes ?? 15} menit`} /></>}
                {asset.id === "feeder" && <><Row k="Referensi TM" v="Data terukur" mono={false} /><Row k="Pelanggan TM" v="Dihitung sendiri" mono={false} /><Row k="Gardu GD-01" v={`${presetLabel(preset)} · dihitung sendiri`} mono={false} /></>}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="network" className="mt-3 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea type="always" className="min-h-0 flex-1 pr-3" data-drawer-scroll="network">
              <div className="pb-3">
                <p className="mb-2 text-xs leading-relaxed text-muted-foreground">{network.topology}</p>
                {network.rows.map(([k, v]) => <Row key={k} k={k} v={v} mono={false} />)}
                {mvDemo?.scenario?.line_length_km != null && <Row k="Panjang saluran model" v={`${fmt(mvDemo.scenario.line_length_km, 2)} km`} />}
                <Row k="Mesin perhitungan" v="Pandapower · aliran daya 3 fasa" mono={false} />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="processed" className="mt-3 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col" data-processed-tab="true">
            {!calculated ? (
              <p className="py-4 text-sm text-muted-foreground">Jalankan simulasi untuk melihat hasil per interval.</p>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60" data-processed-table="true">
                <div className={sourceSeries.length ? "grid shrink-0 grid-cols-4 bg-surface-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" : "grid shrink-0 grid-cols-3 bg-surface-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"} data-processed-table-header="true">
                  <span>Waktu</span>
                  {sourceSeries.length > 0 && <span className="text-right">Beban (kW)</span>}
                  <span className="text-right">Susut dasar (kW)</span>
                  <span className="text-right">Susut Smart (kW)</span>
                </div>
                <ScrollArea type="always" className="min-h-0 flex-1" data-processed-table-scroll="true">
                  <div className="pr-3">
                    {lossSeries.map((point, index) => {
                      const source = sourceSeries[index];
                      return (
                        <div key={point.index} className={sourceSeries.length ? "grid grid-cols-4 border-t border-border/35 px-2 py-1.5 text-xs" : "grid grid-cols-3 border-t border-border/35 px-2 py-1.5 text-xs"}>
                          <span className="numeric text-muted-foreground">{point.time}</span>
                          {sourceSeries.length > 0 && <span className="numeric text-right">{fmt(source?.observed_source_kw, 2)}</span>}
                          <span className="numeric text-right text-warn">{fmt(point.conventional_loss_kw, 3)}</span>
                          <span className="numeric text-right text-primary">{fmt(point.smart_loss_kw, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          <TabsContent value="lineage" className="mt-3 min-h-0 flex-1 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea type="always" className="min-h-0 flex-1 pr-3" data-drawer-scroll="lineage">
              <div className="pb-3">
                {LINEAGE[asset.id].map(([title, detail], index) => (
                  <div key={title} className="flex gap-3 border-b border-border/40 py-3 last:border-0">
                    <span className="numeric flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-[10px] text-primary">{index + 1}</span>
                    <div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p></div>
                  </div>
                ))}
                <div className="mt-3">
                  <Row k="Mesin perhitungan" v="Pandapower · aliran daya 3 fasa" mono={false} />
                  <Row k="Acuan validasi" v="Tidak digunakan untuk kalibrasi" mono={false} />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function presetLabel(preset: Preset) {
  if (preset === "good") return "Baik";
  if (preset === "typical") return "Cukup";
  return "Terbatas";
}

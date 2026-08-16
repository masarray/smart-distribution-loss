import { Database, GitBranch, Network } from "lucide-react";
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
    topology: "Total susut Penyulang 20 kV dibentuk dari tiga aset yang dihitung terpisah.",
    rows: [["Aset pembentuk total", "Referensi TM + Pelanggan TM + GD-01"], ["Penyelarasan waktu", "96 × 15 menit"], ["Jenis hasil", "Penjumlahan susut per aset"]],
  },
  spot: {
    topology: "Jaringan 20 kV → saluran 5 km → satu beban referensi 3 fasa dengan pengukuran lengkap.",
    rows: [["Tegangan", "20 kV"], ["Panjang saluran", "5,00 km"], ["Faktor daya model", "0,96"]],
  },
  tm: {
    topology: "Jaringan 20 kV → saluran khusus 2,8 km → satu pelanggan TM 3 fasa.",
    rows: [["Tegangan", "20 kV"], ["Panjang saluran", "2,80 km"], ["Interval meter", "15 menit"]],
  },
  gd: {
    topology: "Sumber 20 kV → saluran 0,25 km → trafo 400 kVA 20/0,4 kV → 3 JTR → 90 pelanggan.",
    rows: [["Trafo", "400 kVA · 20/0,4 kV · Dyn"], ["Bagian 20 kV", "0,25 km"], ["JTR", "3 cabang radial"], ["Pelanggan", "90"]],
  },
};

const LINEAGE: Record<AssetLoss["id"], Array<[string, string]>> = {
  feeder: [["Hasil per aset", "Ambil susut Referensi TM, Pelanggan TM, dan GD-01 yang sudah dihitung."], ["Penyelarasan waktu", "Samakan waktu 00:00–23:45 pada interval 15 menit."], ["Penjumlahan per interval", "Jumlahkan susut ketiga aset pada setiap interval."], ["Total harian", "Integrasikan 96 interval menjadi kWh/hari."]],
  spot: [["Profil beban", "Gunakan profil beban TM 96 × 15 menit dengan pengukuran lengkap."], ["Data terukur", "Daya, kondisi beban, dan waktu pencatatan dipertahankan sebagai acuan."], ["Model dasar", "Hitung susut awal dari parameter jaringan dasar."], ["Koreksi Smart", "Sesuaikan hanya resistansi saluran yang dapat dikenali dari pengukuran."], ["Hasil susut", "Hitung susut tiap interval lalu total harian."]],
  tm: [["Profil pelanggan", "Gunakan profil Pelanggan TM 96 × 15 menit dan pembagian fasa tersendiri."], ["Meter tersendiri", "Pengukuran pelanggan ini tidak mengambil data dari Referensi TM."], ["Model dasar", "Hitung susut awal pada saluran khusus 2,8 km."], ["Koreksi Smart", "Sesuaikan resistansi saluran dari selisih pengukuran yang tersedia."], ["Hasil susut", "Hitung 96 interval lalu total susut harian."]],
  gd: [["Model jaringan", "Bangun 90 pelanggan, 3 JTR, trafo 400 kVA, dan profil 96 × 15 menit."], ["Kondisi data", "Terapkan kelengkapan meter, fasa, faktor daya, pemetaan, waktu, dan noise sesuai skenario data."], ["Rekonstruksi Smart", "Lengkapi hanya informasi yang belum diketahui dan pertahankan data yang sudah terverifikasi."], ["Perhitungan 3 fasa", "Hitung kondisi jaringan untuk seluruh 96 interval."], ["Hasil susut", "Bentuk profil susut dan total kWh/hari."]],
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
      <SheetContent side="left" className="w-full border-border bg-surface p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border/65 px-5 pb-4 pt-5">
          <div className="flex items-center gap-2 pr-8">
            <span className="flex size-8 items-center justify-center rounded-md bg-warn/10 text-warn"><Database className="size-4" /></span>
            <div>
              <SheetTitle className="font-display text-lg">Data · {asset.short}</SheetTitle>
              <SheetDescription>Pengukuran, model jaringan, hasil per interval, dan jejak perhitungan.</SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-md border border-warn/30 bg-warn/10 px-2 py-1 text-[10px] font-semibold tracking-wider text-warn">DEMO SINTETIS</span>
            <span className="rounded-md border border-border/60 bg-surface-2 px-2 py-1 text-[10px] text-muted-foreground">96 × 15 MENIT</span>
            <span className={calculated ? "rounded-md border border-success/30 bg-success/10 px-2 py-1 text-[10px] font-semibold text-success" : "rounded-md border border-border/60 bg-surface-2 px-2 py-1 text-[10px] text-muted-foreground"}>{calculated ? "HASIL SIAP" : "BELUM DIHITUNG"}</span>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex h-[calc(100vh-9.5rem)] flex-col px-5 pt-4">
          <TabsList className="grid w-full grid-cols-5 bg-surface-2">
            <TabsTrigger value="overview">Ringkasan</TabsTrigger>
            <TabsTrigger value="measurements">Pengukuran</TabsTrigger>
            <TabsTrigger value="network">Jaringan</TabsTrigger>
            <TabsTrigger value="processed">Hasil</TabsTrigger>
            <TabsTrigger value="lineage">Jejak data</TabsTrigger>
          </TabsList>
          <ScrollArea className="mt-3 flex-1 pr-3">
            <TabsContent value="overview" className="mt-0 pb-5">
              <div className="rounded-lg border border-border/60 bg-surface-2/55 p-3"><p className="label-xs">Dataset</p><p className="mt-1 font-display text-base">Demo sintetis</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Dataset uji yang dapat diulang; bukan data feeder PLN produksi.</p></div>
              <div className="mt-3"><Row k="Aset" v={asset.label} mono={false} /><Row k="Periode" v="24 jam" /><Row k="Interval" v="15 menit · 96 data" /><Row k="Susut Smart" v={`${fmt(asset.smartKwh, 3)} kWh/hari`} /></div>
            </TabsContent>

            <TabsContent value="measurements" className="mt-0 pb-5">
              {asset.id === "gd" && <><p className="mb-2 text-xs leading-relaxed text-muted-foreground">Kelengkapan data untuk skenario <span className="font-medium text-foreground">{presetLabel(preset)}</span> pada 90 pelanggan.</p><Coverage label="Meter tersedia" percent={profile.ami} count={coverageCount(profile.ami)} total={90} /><Coverage label="Fasa diketahui" percent={profile.phase} count={coverageCount(profile.phase)} total={90} /><Coverage label="Faktor daya diketahui" percent={profile.pf} count={coverageCount(profile.pf)} total={90} /><Coverage label="Pemetaan pelanggan benar" percent={profile.mapping} count={coverageCount(profile.mapping)} total={90} /><Row k="Pengukuran jaringan" v="Daya P/Q penyulang + tegangan LV A/B/C" mono={false} /></>}
              {(asset.id === "spot" || asset.id === "tm") && <><p className="mb-2 text-xs leading-relaxed text-muted-foreground">Pengukuran aset ini berdiri sendiri dan tersedia lengkap.</p><Coverage label="Daya aktif & reaktif" percent={obs("load_pq_percent")} /><Coverage label="Data fasa" percent={obs("phase_percent")} /><Coverage label="Topologi jaringan" percent={obs("topology_percent")} /><Coverage label="Pemetaan" percent={obs("mapping_percent")} /><Coverage label="Waktu pencatatan" percent={obs("timing_percent")} /><Row k="Interval" v={`${mvDemo?.scenario?.intervals ?? 96} × ${mvDemo?.scenario?.interval_minutes ?? 15} menit`} /></>}
              {asset.id === "feeder" && <><div className="rounded-lg border border-warn/25 bg-warn/5 p-3 text-xs leading-relaxed text-muted-foreground">Total Penyulang 20 kV pada demo ini berasal dari penjumlahan susut tiga aset yang dihitung terpisah.</div><div className="mt-3"><Row k="Referensi TM" v="Data terukur" mono={false} /><Row k="Pelanggan TM" v="Dihitung sendiri" mono={false} /><Row k="Gardu GD-01" v={`${presetLabel(preset)} · dihitung sendiri`} mono={false} /></div></>}
            </TabsContent>

            <TabsContent value="network" className="mt-0 pb-5">
              <div className="rounded-lg border border-border/60 bg-surface-2/55 p-3"><div className="flex items-center gap-2"><Network className="size-4 text-primary" /><p className="font-display text-sm">Model jaringan</p></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{network.topology}</p></div>
              <div className="mt-3">{network.rows.map(([k, v]) => <Row key={k} k={k} v={v} mono={false} />)}{mvDemo?.scenario?.line_length_km != null && <Row k="Panjang saluran model" v={`${fmt(mvDemo.scenario.line_length_km, 2)} km`} />}<Row k="Mesin perhitungan" v="Pandapower · aliran daya 3 fasa" mono={false} /></div>
            </TabsContent>

            <TabsContent value="processed" className="mt-0 pb-5">
              {!calculated ? <div className="rounded-lg border border-border/60 bg-surface-2/45 p-4 text-sm text-muted-foreground">Jalankan simulasi untuk melihat 96 interval hasil perhitungan aset ini.</div> : <><p className="text-xs leading-relaxed text-muted-foreground">Acuan demo tidak ditampilkan di sini. Tabel hanya menunjukkan data yang tersedia dan hasil model.</p><div className="mt-3 overflow-hidden rounded-lg border border-border/60"><div className={sourceSeries.length ? "grid grid-cols-4 bg-surface-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" : "grid grid-cols-3 bg-surface-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"}><span>Waktu</span>{sourceSeries.length > 0 && <span className="text-right">Beban (kW)</span>}<span className="text-right">Susut dasar (kW)</span><span className="text-right">Susut Smart (kW)</span></div><div className="max-h-[390px] overflow-y-auto">{lossSeries.map((point, index) => { const source = sourceSeries[index]; return <div key={point.index} className={sourceSeries.length ? "grid grid-cols-4 border-t border-border/35 px-2 py-1.5 text-xs" : "grid grid-cols-3 border-t border-border/35 px-2 py-1.5 text-xs"}><span className="numeric text-muted-foreground">{point.time}</span>{sourceSeries.length > 0 && <span className="numeric text-right">{fmt(source?.observed_source_kw, 2)}</span>}<span className="numeric text-right text-warn">{fmt(point.conventional_loss_kw, 3)}</span><span className="numeric text-right text-primary">{fmt(point.smart_loss_kw, 3)}</span></div>; })}</div></div></>}
            </TabsContent>

            <TabsContent value="lineage" className="mt-0 pb-5">
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3"><GitBranch className="mt-0.5 size-4 shrink-0 text-primary" /><p className="text-xs leading-relaxed text-muted-foreground">Urutan data hingga menjadi hasil susut untuk aset terpilih.</p></div>
              {LINEAGE[asset.id].map(([title, detail], index) => <div key={title} className="flex gap-3 border-b border-border/40 py-3 last:border-0"><span className="numeric flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-[10px] text-primary">{index + 1}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p></div></div>)}
              <div className="mt-4 rounded-lg border border-border/60 bg-surface-2/55 p-3"><Row k="Mesin perhitungan" v="Pandapower · aliran daya 3 fasa" mono={false} /><Row k="Acuan demo" v="Hanya digunakan untuk mengecek hasil akhir, bukan untuk kalibrasi" mono={false} /></div>
            </TabsContent>
          </ScrollArea>
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

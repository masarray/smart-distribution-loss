import { Database, GitBranch, Network, Table2 } from "lucide-react";
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
      <span className={mono ? "numeric max-w-[62%] text-right text-foreground" : "max-w-[62%] text-right text-foreground"}>{v}</span>
    </div>
  );
}

function CoverageRow({ label, percent, count, total }: { label: string; percent: number; count?: number; total?: number }) {
  return (
    <div className="border-b border-border/45 py-2.5 last:border-0">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="numeric text-foreground">{percent.toFixed(1)}%{count != null && total != null ? ` · ${count}/${total}` : ""}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={percent >= 85 ? "h-full rounded-full bg-success" : percent >= 55 ? "h-full rounded-full bg-warn" : "h-full rounded-full bg-destructive"}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

function LineageStep({ index, title, detail }: { index: number; title: string; detail: string }) {
  return (
    <div className="relative flex gap-3 pb-4 last:pb-0">
      <div className="flex flex-col items-center">
        <span className="numeric flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-[10px] text-primary">
          {index + 1}
        </span>
        <span className="mt-1 h-full w-px bg-border/55 last:hidden" />
      </div>
      <div className="pt-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

const FALLBACK_NETWORK: Record<AssetLoss["id"], { topology: string; rows: Array<[string, string]> }> = {
  feeder: {
    topology: "Loss roll-up dari tiga child asset yang masing-masing diselesaikan secara independen.",
    rows: [
      ["Child assets", "Spot MV + Pelanggan TM + GD-01"],
      ["Time alignment", "96 × 15 menit"],
      ["Electrical claim", "Loss roll-up, bukan shared source-flow model"],
    ],
  },
  spot: {
    topology: "20 kV grid → 5 km MV feeder → satu beban referensi 3-fasa bermeter penuh.",
    rows: [
      ["Tegangan", "20 kV"],
      ["Panjang saluran", "5.00 km"],
      ["PF model", "0.96"],
    ],
  },
  tm: {
    topology: "20 kV feeder → dedicated 2.8 km MV line → satu pelanggan TM asimetris 3-fasa.",
    rows: [
      ["Tegangan", "20 kV"],
      ["Panjang saluran", "2.80 km"],
      ["Resolusi meter", "15 menit"],
    ],
  },
  gd: {
    topology: "20 kV source → 0.25 km MV → TR 400 kVA 20/0.4 kV → 3 JTR → 90 pelanggan.",
    rows: [
      ["Trafo", "400 kVA · 20/0.4 kV · Dyn"],
      ["MV section", "0.25 km"],
      ["JTR", "3 radial branches"],
      ["Pelanggan", "90 · 30 per JTR"],
    ],
  },
};

const LINEAGE: Record<AssetLoss["id"], Array<[string, string]>> = {
  feeder: [
    ["Child physics results", "Ambil loss series Spot MV, Pelanggan TM, dan GD-01 yang sudah lolos gate masing-masing."],
    ["Canonical alignment", "Pastikan ketiga child asset berada pada index waktu yang sama: 00:00 sampai 23:45, 15 menit."],
    ["Interval roll-up", "Jumlahkan technical-loss kW per interval. Tidak dibuat shared source-flow fiktif."],
    ["Daily integration", "Integrasikan 96 interval menjadi kWh/hari untuk KPI feeder."],
  ],
  spot: [
    ["Synthetic reference load", "Bentuk profil P/Q 96 × 15 menit untuk kasus MV observabilitas tinggi."],
    ["Measurement channel", "Gunakan source/load states yang terukur dengan uncertainty kecil dan timing diketahui."],
    ["Conventional physics", "Hitung baseline dengan parameter line-R konvensional memakai Pandapower 3-fasa."],
    ["Bounded correction", "Kalibrasi hanya aggregate line resistance; P/Q, phase, topology, mapping, timing di-hold."],
    ["Loss result", "Jalankan kembali runpp_3ph dan bentuk loss series serta daily kWh."],
  ],
  tm: [
    ["Independent TM profile", "Bentuk profil beban 96 × 15 menit dengan P/Q dan pembagian fasa asimetris tersendiri."],
    ["Dedicated measurement", "Source meter dan load states hanya milik skenario Pelanggan TM, tidak mengambil kanal Spot MV."],
    ["Conventional physics", "Hitung dedicated 2.8 km feeder dengan line-R baseline."],
    ["Bounded calibration", "Koreksi line-R dengan source-meter residual; state terukur tetap dipertahankan."],
    ["Loss result", "Jalankan runpp_3ph 96 interval lalu integrasikan technical loss."],
  ],
  gd: [
    ["Canonical network", "Bangun model 90 pelanggan, 3 JTR, trafo 400 kVA dan profil 96 × 15 menit."],
    ["Field-like degradation", "P2 membuat missing AMI, unknown phase/PF, mapping suspect, timestamp shift dan measurement noise sesuai preset."],
    ["Smart reconstruction", "P3 hanya merekonstruksi atau mengkalibrasi state yang tidak diketahui/assumed dan menjaga state terverifikasi."],
    ["Three-phase physics", "Jalankan Pandapower runpp_3ph untuk 96 interval dengan model hasil kalibrasi."],
    ["Operational result", "Bentuk technical-loss series dan daily kWh. Hidden truth tidak dipakai sebagai input kalibrasi."],
  ],
};

export function DataDrawer({ open, onOpenChange, asset, result, spot, tm, preset }: Props) {
  const profile = PRESET_PROFILE[preset];
  const contract = result?.data_contract;
  const assetContract = contract?.assets?.[asset.id];
  const lossSeries = result?.asset_series?.[asset.id] ?? [];
  const mvDemo = asset.id === "spot" ? spot : asset.id === "tm" ? tm : null;
  const sourceSeries: SeriesPoint[] =
    asset.id === "spot" ? (spot?.series ?? []) : asset.id === "tm" ? (tm?.series ?? []) : asset.id === "gd" ? (result?.series ?? []) : [];
  const network = FALLBACK_NETWORK[asset.id];
  const calculated = lossSeries.length === 96;

  const coverageCount = (percent: number) => Math.round((percent / 100) * 90);
  const mvObs = mvDemo?.observability as Record<string, unknown> | undefined;
  const obs = (key: string) => typeof mvObs?.[key] === "number" ? Number(mvObs[key]) : 100;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full border-border bg-surface p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border/65 px-5 pb-4 pt-5">
          <div className="flex items-center gap-2 pr-8">
            <span className="flex size-8 items-center justify-center rounded-md bg-warn/10 text-warn">
              <Database className="size-4" />
            </span>
            <div>
              <SheetTitle className="font-display text-lg">Data &amp; Input · {asset.short}</SheetTitle>
              <SheetDescription>Observasi data yang masuk, diproses, dan diturunkan menjadi hasil susut.</SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-warn/30 bg-warn/10 px-2 py-1 text-[10px] font-semibold tracking-wider text-warn">
              SYNTHETIC DEMO
            </span>
            <span className="rounded-md border border-border/60 bg-surface-2 px-2 py-1 text-[10px] text-muted-foreground">
              96 × 15 MENIT
            </span>
            <span className={calculated ? "rounded-md border border-success/30 bg-success/10 px-2 py-1 text-[10px] font-semibold text-success" : "rounded-md border border-border/60 bg-surface-2 px-2 py-1 text-[10px] text-muted-foreground"}>
              {calculated ? "ENGINE RESULT READY" : "BELUM DIHITUNG"}
            </span>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex h-[calc(100vh-9.5rem)] flex-col px-5 pt-4">
          <TabsList className="grid w-full grid-cols-5 bg-surface-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="processed">Processed</TabsTrigger>
            <TabsTrigger value="lineage">Lineage</TabsTrigger>
          </TabsList>

          <ScrollArea className="mt-3 flex-1 pr-3">
            <TabsContent value="overview" className="mt-0 pb-5">
              <div className="rounded-lg border border-border/60 bg-surface-2/55 p-3">
                <p className="label-xs">Dataset</p>
                <p className="mt-1 font-display text-base">{contract?.source_label ?? "Synthetic Demo"}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Dataset deterministik untuk proof-of-concept. Ini bukan data feeder PLN aktual dan tidak boleh dibaca sebagai measurement produksi.
                </p>
              </div>
              <div className="mt-3">
                <Row k="Asset" v={asset.label} mono={false} />
                <Row k="Asset ID" v={asset.id} />
                <Row k="Source kind" v={assetContract?.source_kind ?? (asset.id === "feeder" ? "derived_rollup" : "synthetic physics case")} />
                <Row k="Period" v="24 jam" />
                <Row k="Resolution" v="15 menit" />
                <Row k="Intervals" v="96 · 00:00 → 23:45" />
                <Row k="Smart technical loss" v={`${fmt(asset.smartKwh, 3)} kWh/hari`} />
                <Row k="Scenario ID" v={assetContract?.provenance?.scenario_id ?? mvDemo?.scenario_id ?? (asset.id === "gd" ? "gd01-distribution-p3-v1" : "—")} />
                <Row k="Fingerprint" v={assetContract?.provenance?.fingerprint ?? mvDemo?.fingerprint ?? "—"} />
              </div>
            </TabsContent>

            <TabsContent value="measurements" className="mt-0 pb-5">
              {asset.id === "gd" && (
                <>
                  <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                    Coverage berikut adalah field-like input yang benar-benar dipakai oleh preset <span className="font-medium text-foreground">{profile.label}</span> pada model 90 pelanggan.
                  </p>
                  <CoverageRow label="AMI tersedia" percent={profile.ami} count={coverageCount(profile.ami)} total={90} />
                  <CoverageRow label="Fasa diketahui" percent={profile.phase} count={coverageCount(profile.phase)} total={90} />
                  <CoverageRow label="PF diketahui" percent={profile.pf} count={coverageCount(profile.pf)} total={90} />
                  <CoverageRow label="Mapping benar" percent={profile.mapping} count={coverageCount(profile.mapping)} total={90} />
                  <Row k="System measurement" v="Feeder P/Q + LV voltage A/B/C" mono={false} />
                  <Row k="Timebase" v="96 × 15 menit" />
                </>
              )}

              {(asset.id === "spot" || asset.id === "tm") && (
                <>
                  <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                    Aset MV ini memiliki measurement channel independen dan high-observability; tidak mengambil measurement dari aset MV lain.
                  </p>
                  <CoverageRow label="Load P/Q" percent={obs("load_pq_percent")} />
                  <CoverageRow label="Phase state" percent={obs("phase_percent")} />
                  <CoverageRow label="Topology" percent={obs("topology_percent")} />
                  <CoverageRow label="Mapping" percent={obs("mapping_percent")} />
                  <CoverageRow label="Timing" percent={obs("timing_percent")} />
                  <Row k="Intervals" v={`${mvDemo?.scenario?.intervals ?? 96} × ${mvDemo?.scenario?.interval_minutes ?? 15} menit`} />
                </>
              )}

              {asset.id === "feeder" && (
                <>
                  <div className="rounded-lg border border-warn/25 bg-warn/5 p-3 text-xs leading-relaxed text-muted-foreground">
                    Feeder pada POC ini adalah <span className="font-medium text-foreground">loss roll-up</span>. Tidak ada satu shared feeder-source measurement yang disintesis untuk mengklaim ketiga child case berada pada satu physical source-flow model.
                  </div>
                  <div className="mt-3 space-y-2">
                    <Row k="Spot MV" v="Independent · high observability" mono={false} />
                    <Row k="Pelanggan TM" v="Independent · high observability" mono={false} />
                    <Row k="GD-01" v={`${profile.label} · degraded field-like`} mono={false} />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="network" className="mt-0 pb-5">
              <div className="rounded-lg border border-border/60 bg-surface-2/55 p-3">
                <div className="flex items-center gap-2">
                  <Network className="size-4 text-primary" />
                  <p className="font-display text-sm">Model jaringan</p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{mvDemo?.scenario?.topology ?? network.topology}</p>
              </div>
              <div className="mt-3">
                {network.rows.map(([k, v]) => <Row key={k} k={k} v={v} mono={false} />)}
                {mvDemo?.scenario?.line_length_km != null && <Row k="Engine line length" v={`${fmt(mvDemo.scenario.line_length_km, 2)} km`} />}
                <Row k="Solver" v={assetContract?.provenance?.solver ?? String(mvDemo?.runtime?.solver ?? result?.runtime?.solver ?? "pandapower.runpp_3ph")} />
              </div>
            </TabsContent>

            <TabsContent value="processed" className="mt-0 pb-5">
              {!calculated ? (
                <div className="rounded-lg border border-border/60 bg-surface-2/45 p-4 text-sm text-muted-foreground">
                  Jalankan simulasi untuk melihat 96 interval data yang benar-benar diteruskan menjadi loss result untuk aset ini.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md bg-surface-2 p-2.5"><p className="label-xs">Intervals</p><p className="numeric mt-1 text-base">96</p></div>
                    <div className="rounded-md bg-surface-2 p-2.5"><p className="label-xs">First</p><p className="numeric mt-1 text-base">00:00</p></div>
                    <div className="rounded-md bg-surface-2 p-2.5"><p className="label-xs">Last</p><p className="numeric mt-1 text-base">23:45</p></div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Tabel ini sengaja tidak membuka hidden Ground Truth. Kolom operational hanya memperlihatkan measurement yang tersedia serta conventional/smart loss yang diproses engine.
                  </p>
                  <div className="mt-3 overflow-hidden rounded-lg border border-border/60">
                    <div className={sourceSeries.length ? "grid grid-cols-4 bg-surface-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" : "grid grid-cols-3 bg-surface-2 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"}>
                      <span>Time</span>
                      {sourceSeries.length > 0 && <span className="text-right">Observed P</span>}
                      <span className="text-right">Conv loss</span>
                      <span className="text-right">Smart loss</span>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto">
                      {lossSeries.map((point, index) => {
                        const source = sourceSeries[index];
                        return (
                          <div key={point.index} className={sourceSeries.length ? "grid grid-cols-4 border-t border-border/35 px-2 py-1.5 text-xs" : "grid grid-cols-3 border-t border-border/35 px-2 py-1.5 text-xs"}>
                            <span className="numeric text-muted-foreground">{point.time}</span>
                            {sourceSeries.length > 0 && <span className="numeric text-right">{fmt(source?.observed_source_kw, 2)} kW</span>}
                            <span className="numeric text-right text-warn">{fmt(point.conventional_loss_kw, 3)}</span>
                            <span className="numeric text-right text-primary">{fmt(point.smart_loss_kw, 3)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="lineage" className="mt-0 pb-5">
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <GitBranch className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Lineage menjawab: <span className="font-medium text-foreground">data ini datang dari mana, apa yang diubah, solver apa yang dipakai, dan bagaimana menjadi KPI loss.</span>
                </p>
              </div>
              {LINEAGE[asset.id].map(([title, detail], index) => (
                <LineageStep key={title} index={index} title={title} detail={detail} />
              ))}
              <div className="mt-4 rounded-lg border border-border/60 bg-surface-2/55 p-3">
                <div className="flex items-center gap-2">
                  <Table2 className="size-4 text-muted-foreground" />
                  <p className="label-xs">Provenance</p>
                </div>
                <div className="mt-2">
                  <Row k="Generated by" v={assetContract?.provenance?.generated_by ?? mvDemo?.provenance?.generated_by ?? "Available after analysis"} mono={false} />
                  <Row k="Solver" v={assetContract?.provenance?.solver ?? mvDemo?.provenance?.solver ?? "pandapower.runpp_3ph"} />
                  <Row k="Truth policy" v={assetContract?.provenance?.truth_policy ?? mvDemo?.provenance?.truth_policy ?? "Hidden truth is validation-only"} mono={false} />
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

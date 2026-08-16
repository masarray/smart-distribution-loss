import type { AssetId } from "./derive";
import type { AnalysisStatus, OperationalMetrics } from "./operation";
import type { CheckItem, P3Result, SpotDemo, TmDemo } from "./types";

export type OperatorDecisionSource = "pending" | "gate" | "quality" | "normal";

export interface OperatorDecision {
  status: AnalysisStatus;
  source: OperatorDecisionSource;
  headline: string;
  reason: string;
  evidence: string | null;
  action: string;
}

export function deriveOperatorDecision(
  assetId: AssetId,
  metrics: OperationalMetrics,
  result: P3Result | null,
  spot: SpotDemo | null,
  tm: TmDemo | null,
): OperatorDecision {
  if (metrics.status === "PENDING") {
    return {
      status: "PENDING",
      source: "pending",
      headline: "Belum ada hasil untuk dinilai",
      reason: "Decision layer aktif setelah simulasi menghasilkan evidence untuk aset terpilih.",
      evidence: null,
      action: "Jalankan simulasi untuk membentuk rekomendasi operasional.",
    };
  }

  if (metrics.status === "REVIEW") {
    const failed = firstFailedCheck(assetId, result, spot, tm);
    if (failed) return decisionFromFailedCheck(failed.assetLabel, failed.check);

    const unresolved = firstUnresolved(assetId, result);
    if (unresolved) return decisionFromUnresolved(unresolved.parameter, unresolved.reason);

    return {
      status: "REVIEW",
      source: "gate",
      headline: "Hasil memerlukan tinjauan engineering",
      reason: "Satu atau lebih engineering gate belum memenuhi kriteria penerimaan.",
      evidence: metrics.statusReason,
      action: "Buka Detail teknis dan selesaikan pemeriksaan yang belum lulus sebelum memakai hasil untuk keputusan lapangan.",
    };
  }

  const lowQuality = [...metrics.qualityRows]
    .filter((row) => Number.isFinite(row.percent) && row.percent < 85)
    .sort((a, b) => a.percent - b.percent);

  if (metrics.status === "ATTENTION") {
    const primary = lowQuality[0] ?? metrics.qualityRows[0];
    const secondary = lowQuality[1];
    const primaryLabel = plainQualityMetricLabel(primary?.label ?? "Data input");
    const secondaryText = secondary
      ? `; ${plainQualityMetricLabel(secondary.label)} ${formatPercent(secondary.percent)}`
      : "";

    return {
      status: "ATTENTION",
      source: "quality",
      headline: "Kualitas input membatasi keyakinan hasil",
      reason: primary
        ? `${primaryLabel} ${formatPercent(primary.percent)}${secondaryText} menjadi batas utama kualitas data aset ini.`
        : "Kualitas input belum cukup kuat untuk keputusan lapangan tanpa verifikasi tambahan.",
      evidence: primary ? `${primaryLabel} ${formatPercent(primary.percent)}` : metrics.statusReason,
      action: qualityAction(primary?.label),
    };
  }

  const lowest = [...metrics.qualityRows]
    .filter((row) => Number.isFinite(row.percent))
    .sort((a, b) => a.percent - b.percent)[0];

  return {
    status: "NORMAL",
    source: "normal",
    headline: "Tidak ada isu utama pada aset ini",
    reason: "Engineering gate lulus dan kualitas input cukup untuk membaca hasil operasional.",
    evidence: lowest
      ? `Kualitas input terendah: ${plainQualityMetricLabel(lowest.label)} ${formatPercent(lowest.percent)}`
      : "Engineering gate lulus.",
    action: "Lanjutkan review profil susut dan interval puncak; buka Detail teknis hanya bila perlu verifikasi lebih dalam.",
  };
}

function firstFailedCheck(
  assetId: AssetId,
  result: P3Result | null,
  spot: SpotDemo | null,
  tm: TmDemo | null,
): { assetLabel: string; check: CheckItem } | null {
  const groups: Array<{ assetLabel: string; checks: CheckItem[] | undefined }> =
    assetId === "spot"
      ? [{ assetLabel: "Referensi TM", checks: spot?.checks }]
      : assetId === "tm"
        ? [{ assetLabel: "Pelanggan TM", checks: tm?.checks }]
        : assetId === "gd"
          ? [{ assetLabel: "GD-01", checks: result?.checks }]
          : [
              { assetLabel: "Referensi TM", checks: spot?.checks },
              { assetLabel: "Pelanggan TM", checks: tm?.checks },
              { assetLabel: "GD-01", checks: result?.checks },
            ];

  for (const group of groups) {
    const failed = group.checks?.find((check) => !check.pass);
    if (failed) return { assetLabel: group.assetLabel, check: failed };
  }
  return null;
}

function firstUnresolved(assetId: AssetId, result: P3Result | null) {
  if (assetId !== "gd" && assetId !== "feeder") return null;
  return result?.unresolved?.[0] ?? null;
}

function decisionFromFailedCheck(assetLabel: string, check: CheckItem): OperatorDecision {
  const value = check.name.toLowerCase();
  const prefix = assetLabel ? `${assetLabel}: ` : "";

  if (value.includes("converged") || value.includes("power flows")) {
    return reviewDecision(
      "Perhitungan 3 fasa belum lengkap",
      `${prefix}sebagian interval belum berhasil diselesaikan oleh model jaringan.`,
      `${assetLabel} · perhitungan interval`,
      "Periksa topologi dan parameter jaringan di Detail teknis sebelum menggunakan hasil.",
    );
  }
  if (value.includes("voltage")) {
    return reviewDecision(
      "Tegangan model perlu ditinjau",
      `${prefix}hasil tegangan belum memenuhi rentang plausibilitas engineering.`,
      `${assetLabel} · pemeriksaan tegangan`,
      "Verifikasi tegangan, rasio trafo, dan parameter jaringan sebelum melanjutkan keputusan lapangan.",
    );
  }
  if (
    value.includes("hold-out") ||
    value.includes("objective") ||
    value.includes("source-p") ||
    value.includes("phase-p") ||
    value.includes("residual") ||
    value.includes("technical-loss estimate")
  ) {
    return reviewDecision(
      "Kecocokan model belum memenuhi gate",
      `${prefix}kecocokan model terhadap data uji belum cukup kuat.`,
      `${assetLabel} · gate kecocokan model`,
      "Tinjau kualitas pengukuran dan parameter yang disesuaikan di Detail teknis sebelum memakai hasil.",
    );
  }
  if (value.includes("phase assignment")) {
    return reviewDecision(
      "Estimasi fasa perlu ditinjau",
      `${prefix}hasil estimasi fasa belum memenuhi pemeriksaan engineering.`,
      `${assetLabel} · pemeriksaan fasa`,
      "Verifikasi fasa pelanggan yang belum diketahui dan jalankan kembali simulasi.",
    );
  }
  if (value.includes("runtime") || value.includes("budget")) {
    return reviewDecision(
      "Waktu perhitungan melewati target",
      `${prefix}runtime belum memenuhi target operasional yang ditetapkan.`,
      `${assetLabel} · runtime gate`,
      "Tinjau Detail teknis dan ulangi perhitungan setelah kondisi runtime stabil.",
    );
  }
  if (value.includes("independent")) {
    return reviewDecision(
      "Pemisahan data aset perlu ditinjau",
      `${prefix}independensi sumber data belum lolos pemeriksaan.`,
      `${assetLabel} · independensi data`,
      "Periksa sumber pengukuran dan pemetaan aset sebelum memakai hasil gabungan.",
    );
  }
  if (value.includes("ground truth") || value.includes("immutable") || value.includes("verified phase") || value.includes("pf inputs")) {
    return reviewDecision(
      "Integritas data acuan perlu ditinjau",
      `${prefix}pemeriksaan terhadap data acuan atau data terverifikasi belum lulus.`,
      `${assetLabel} · integritas data`,
      "Periksa input yang seharusnya tetap dan jalankan kembali simulasi sebelum menggunakan hasil.",
    );
  }

  return reviewDecision(
    "Engineering gate belum lulus",
    `${prefix}satu pemeriksaan model masih membutuhkan tinjauan.`,
    `${assetLabel} · engineering gate`,
    "Buka Detail teknis, identifikasi pemeriksaan yang gagal, lalu koreksi data atau parameter terkait.",
  );
}

function reviewDecision(headline: string, reason: string, evidence: string, action: string): OperatorDecision {
  return { status: "REVIEW", source: "gate", headline, reason, evidence, action };
}

function decisionFromUnresolved(parameter: string, reason: string): OperatorDecision {
  const value = parameter.toLowerCase();
  if (value.includes("mapping")) {
    return reviewDecision(
      "Pemetaan pelanggan belum cukup pasti",
      "Lokasi pelanggan per cabang belum dapat ditentukan dengan keyakinan yang memadai.",
      "GD-01 · pemetaan pelanggan",
      "Verifikasi pelanggan per cabang atau lengkapi pengukuran cabang sebelum memakai hasil untuk tindakan lapangan.",
    );
  }
  if (value.includes("sr length") || value.includes("service")) {
    return reviewDecision(
      "Panjang sambungan pelanggan belum terverifikasi",
      "Data yang tersedia belum cukup untuk menentukan panjang sambungan pelanggan secara andal.",
      "GD-01 · panjang sambungan",
      "Lengkapi data panjang sambungan atau hasil survei pelanggan yang relevan.",
    );
  }
  if (value.includes("vk") || value.includes("vkr") || value.includes("transformer")) {
    return reviewDecision(
      "Parameter trafo belum cukup kuat",
      "Impedansi trafo belum dapat ditentukan dengan keyakinan yang memadai dari data saat ini.",
      "GD-01 · parameter trafo",
      "Verifikasi nameplate atau data uji trafo sebelum menggunakan hasil untuk keputusan lapangan.",
    );
  }
  return reviewDecision(
    "Parameter jaringan perlu dilengkapi",
    reason || "Masih ada parameter jaringan yang belum cukup dikenali oleh data.",
    `GD-01 · ${parameter}`,
    "Lengkapi parameter jaringan yang ditandai pada Detail teknis dan jalankan kembali simulasi.",
  );
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function plainQualityMetricLabel(label: string) {
  const labels: Record<string, string> = {
    "Load P/Q": "Beban terukur",
    Fasa: "Data fasa",
    Topologi: "Pemetaan jaringan",
    Timing: "Waktu pencatatan",
    "AMI coverage": "Meter tersedia",
    "Fasa diketahui": "Data fasa",
    "PF diketahui": "Faktor daya",
    "Mapping benar": "Pemetaan pelanggan",
    "Kanal MV": "Data pelanggan TM",
    "AMI GD-01": "Meter GD-01",
    "Fasa GD-01": "Data fasa GD-01",
    "Mapping GD-01": "Pemetaan GD-01",
  };
  return labels[label] ?? label;
}

function qualityAction(label: string | undefined) {
  const value = (label ?? "").toLowerCase();
  if (value.includes("pf")) return "Lengkapi atau verifikasi faktor daya pelanggan yang belum diketahui, lalu jalankan kembali simulasi.";
  if (value.includes("fasa")) return "Verifikasi fasa pelanggan yang belum diketahui, lalu jalankan kembali simulasi.";
  if (value.includes("ami") || value.includes("meter")) return "Lengkapi interval meter/AMI yang hilang sebelum menggunakan hasil untuk keputusan lapangan.";
  if (value.includes("mapping")) return "Verifikasi pemetaan pelanggan ke cabang yang benar sebelum menggunakan hasil untuk tindakan lapangan.";
  if (value.includes("timing")) return "Periksa sinkronisasi waktu pencatatan dan koreksi stream yang bergeser.";
  if (value.includes("topologi")) return "Verifikasi topologi jaringan dan koneksi aset sebelum menjalankan ulang simulasi.";
  if (value.includes("load") || value.includes("p/q")) return "Lengkapi pengukuran daya aktif dan reaktif pada interval yang belum terobservasi.";
  return "Perbaiki data dengan coverage terendah terlebih dahulu, lalu jalankan kembali simulasi.";
}

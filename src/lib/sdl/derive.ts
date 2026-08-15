import type { P3Result, SpotDemo } from "./types";

export type AssetId = "feeder" | "spot" | "tm" | "gd";

export interface AssetLoss {
  id: AssetId;
  label: string;
  short: string;
  domain: "FEEDER" | "MV" | "LV";
  observability: string;
  observabilityScore: number;
  truthKwh: number | null;
  convKwh: number | null;
  smartKwh: number | null;
  convErr: number | null;
  smartErr: number | null;
  action: string;
  note: string;
}

const pctErr = (value: number, truth: number) => ((value - truth) / truth) * 100;

export const ASSET_META: Record<AssetId, { label: string; short: string; domain: AssetLoss["domain"]; note: string }> =
  {
    feeder: {
      label: "Feeder 20 kV — roll-up",
      short: "Feeder",
      domain: "FEEDER",
      note: "Agregasi aritmetik susut teknis seksi MV + gardu distribusi GD-01 pada penyulang yang sama.",
    },
    spot: {
      label: "Spot load MV",
      short: "Spot MV",
      domain: "MV",
      note: "Beban titik 20 kV dengan P/Q, fasa, topologi, dan timing terukur penuh.",
    },
    tm: {
      label: "Pelanggan TM",
      short: "Pelanggan TM",
      domain: "MV",
      note: "Titik pelanggan TM ditampilkan sebagai measurement reference. V1 belum mempunyai model susut independen untuk objek ini, sehingga hasil Spot MV tidak diduplikasi sebagai hasil pelanggan TM.",
    },
    gd: {
      label: "Gardu distribusi GD-01",
      short: "Gardu GD-01",
      domain: "LV",
      note: "Trafo 400 kVA, 3 jurusan JTR, 90 pelanggan. Observabilitas tidak sempurna — kasus yang biasanya tidak akurat.",
    },
  };

export function deriveAssets(result: P3Result | null, spot: SpotDemo | null): AssetLoss[] {
  const gdTruth = result?.comparison.truth.loss_kwh ?? null;
  const gdConv = result?.comparison.conventional.loss_kwh ?? null;
  const gdSmart = result?.comparison.smart.loss_kwh ?? null;
  const mvTruth = spot?.comparison.truth.loss_kwh ?? null;
  const mvConv = spot?.comparison.conventional.loss_kwh ?? null;
  const mvSmart = spot?.comparison.smart.loss_kwh ?? null;

  const spotAsset: AssetLoss = {
    id: "spot",
    ...ASSET_META.spot,
    observability: "Tinggi · 100% P/Q · fasa · topologi · timing",
    observabilityScore: 100,
    truthKwh: mvTruth,
    convKwh: mvConv,
    smartKwh: mvSmart,
    convErr: mvTruth && mvConv != null ? pctErr(mvConv, mvTruth) : null,
    smartErr: mvTruth && mvSmart != null ? pctErr(mvSmart, mvTruth) : null,
    action: spot?.smart_action.classification ?? "—",
  };

  const tmAsset: AssetLoss = {
    id: "tm",
    ...ASSET_META.tm,
    observability: "Tinggi · measurement reference",
    observabilityScore: 100,
    truthKwh: null,
    convKwh: null,
    smartKwh: null,
    convErr: null,
    smartErr: null,
    action: "REFERENCE ONLY",
  };

  const feederTruth = gdTruth != null && mvTruth != null ? gdTruth + mvTruth : null;
  const feederConv = gdConv != null && mvConv != null ? gdConv + mvConv : null;
  const feederSmart = gdSmart != null && mvSmart != null ? gdSmart + mvSmart : null;

  return [
    {
      id: "feeder",
      ...ASSET_META.feeder,
      observability: "Campuran MV terukur + LV terdegradasi",
      observabilityScore: 78,
      truthKwh: feederTruth,
      convKwh: feederConv,
      smartKwh: feederSmart,
      convErr: feederTruth && feederConv != null ? pctErr(feederConv, feederTruth) : null,
      smartErr: feederTruth && feederSmart != null ? pctErr(feederSmart, feederTruth) : null,
      action: "ROLL-UP",
    },
    spotAsset,
    tmAsset,
    {
      id: "gd",
      ...ASSET_META.gd,
      observability: result ? `${result.preset_label}` : "Terdegradasi",
      observabilityScore: 52,
      truthKwh: gdTruth,
      convKwh: gdConv,
      smartKwh: gdSmart,
      convErr: result?.comparison.conventional.loss_error_percent_validation_only ?? null,
      smartErr: result?.comparison.smart.loss_error_percent_validation_only ?? null,
      action: "SMART CALIBRATION",
    },
  ];
}

export const fmt = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

export const fmtSigned = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;

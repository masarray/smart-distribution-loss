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
      note: "Agregat susut MV + GD-01 pada penyulang yang sama.",
    },
    spot: {
      label: "Spot load MV",
      short: "Spot MV",
      domain: "MV",
      note: "Kasus MV dengan observabilitas penuh.",
    },
    tm: {
      label: "Pelanggan TM",
      short: "Pelanggan TM",
      domain: "MV",
      note: "Kalkulasi memakai model pelanggan TM terukur dari demo MV; feeder roll-up tetap menghitung kanal MV satu kali.",
    },
    gd: {
      label: "Gardu distribusi GD-01",
      short: "Gardu GD-01",
      domain: "LV",
      note: "Trafo 400 kVA · 3 JTR · 90 pelanggan.",
    },
  };

export function deriveAssets(result: P3Result | null, spot: SpotDemo | null): AssetLoss[] {
  const gdTruth = result?.comparison.truth.loss_kwh ?? null;
  const gdConv = result?.comparison.conventional.loss_kwh ?? null;
  const gdSmart = result?.comparison.smart.loss_kwh ?? null;
  const mvTruth = spot?.comparison.truth.loss_kwh ?? null;
  const mvConv = spot?.comparison.conventional.loss_kwh ?? null;
  const mvSmart = spot?.comparison.smart.loss_kwh ?? null;

  const mvConvErr = mvTruth && mvConv != null ? pctErr(mvConv, mvTruth) : null;
  const mvSmartErr = mvTruth && mvSmart != null ? pctErr(mvSmart, mvTruth) : null;
  const spotAction = spot?.smart_action.classification ?? "—";

  const spotAsset: AssetLoss = {
    id: "spot",
    ...ASSET_META.spot,
    observability: "Tinggi · P/Q · fasa · topologi · timing",
    observabilityScore: 100,
    truthKwh: mvTruth,
    convKwh: mvConv,
    smartKwh: mvSmart,
    convErr: mvConvErr,
    smartErr: mvSmartErr,
    action: spotAction,
  };

  const tmAsset: AssetLoss = {
    id: "tm",
    ...ASSET_META.tm,
    observability: "Tinggi · meter interval 15 menit",
    observabilityScore: 100,
    truthKwh: mvTruth,
    convKwh: mvConv,
    smartKwh: mvSmart,
    convErr: mvConvErr,
    smartErr: mvSmartErr,
    action: "METERED MV",
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

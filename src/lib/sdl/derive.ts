import type { P3Result, SpotDemo, TmDemo } from "./types";

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
      label: "Penyulang 20 kV — total",
      short: "Penyulang 20 kV",
      domain: "FEEDER",
      note: "Backbone penyulang 20 kV dari incoming GI; KPI total adalah roll-up Referensi TM + Pelanggan TM + GD-01.",
    },
    spot: {
      label: "Referensi TM — beban terukur",
      short: "Referensi TM",
      domain: "MV",
      note: "Beban referensi TM dengan observabilitas penuh, profil 15 menit, dan saluran tersendiri.",
    },
    tm: {
      label: "Pelanggan TM",
      short: "Pelanggan TM",
      domain: "MV",
      note: "Model TM independen: feeder 2.8 km, profil 15 menit, P/Q per fasa dan kalibrasi resistansi tersendiri.",
    },
    gd: {
      label: "Gardu distribusi GD-01",
      short: "Gardu GD-01",
      domain: "LV",
      note: "Trafo 400 kVA · 3 JTR · 90 pelanggan.",
    },
  };

function demoErrors(demo: SpotDemo | TmDemo | null) {
  const truth = demo?.comparison.truth.loss_kwh ?? null;
  const conv = demo?.comparison.conventional.loss_kwh ?? null;
  const smart = demo?.comparison.smart.loss_kwh ?? null;
  return {
    truth,
    conv,
    smart,
    convErr:
      demo?.comparison.conventional.loss_error_percent_validation_only ??
      (truth && conv != null ? pctErr(conv, truth) : null),
    smartErr:
      demo?.comparison.smart.loss_error_percent_validation_only ??
      (truth && smart != null ? pctErr(smart, truth) : null),
  };
}

export function deriveAssets(result: P3Result | null, spot: SpotDemo | null, tm: TmDemo | null): AssetLoss[] {
  const gdTruth = result?.comparison.truth.loss_kwh ?? null;
  const gdConv = result?.comparison.conventional.loss_kwh ?? null;
  const gdSmart = result?.comparison.smart.loss_kwh ?? null;
  const spotValues = demoErrors(spot);
  const tmValues = demoErrors(tm);

  const spotAsset: AssetLoss = {
    id: "spot",
    ...ASSET_META.spot,
    observability: "Tinggi · P/Q · fasa · topologi · timing",
    observabilityScore: 100,
    truthKwh: spotValues.truth,
    convKwh: spotValues.conv,
    smartKwh: spotValues.smart,
    convErr: spotValues.convErr,
    smartErr: spotValues.smartErr,
    action: spot?.smart_action.classification ?? "—",
  };

  const tmAsset: AssetLoss = {
    id: "tm",
    ...ASSET_META.tm,
    observability: "Tinggi · 96 interval · meter P/Q per fasa",
    observabilityScore: 100,
    truthKwh: tmValues.truth,
    convKwh: tmValues.conv,
    smartKwh: tmValues.smart,
    convErr: tmValues.convErr,
    smartErr: tmValues.smartErr,
    action: tm?.smart_action.classification ?? "—",
  };

  const feederComplete =
    gdTruth != null && gdConv != null && gdSmart != null &&
    spotValues.truth != null && spotValues.conv != null && spotValues.smart != null &&
    tmValues.truth != null && tmValues.conv != null && tmValues.smart != null;

  const feederTruth = feederComplete ? gdTruth + spotValues.truth! + tmValues.truth! : null;
  const feederConv = feederComplete ? gdConv + spotValues.conv! + tmValues.conv! : null;
  const feederSmart = feederComplete ? gdSmart + spotValues.smart! + tmValues.smart! : null;

  return [
    {
      id: "feeder",
      ...ASSET_META.feeder,
      observability: "Campuran dua kanal MV terukur + LV terdegradasi",
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

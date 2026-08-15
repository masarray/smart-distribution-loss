export type Preset = "good" | "typical" | "poor";
export type OperationalAssetId = "feeder" | "spot" | "tm" | "gd";

export interface Comparison {
  loss_kwh: number;
  loss_error_percent_validation_only: number;
  source_nrmse_percent?: number;
  phase_rmse_kw?: number;
  voltage_rmse_pu?: number;
  phase_accuracy_percent_validation_only?: number;
  objective_calibration?: number;
  objective_validation?: number;
}

export interface CheckItem {
  name: string;
  pass: boolean;
  detail: string;
}

export interface SeriesPoint {
  index: number;
  time: string;
  truth_loss_kw: number;
  conventional_loss_kw: number;
  smart_loss_kw: number;
  observed_source_kw: number;
  conventional_source_kw: number;
  smart_source_kw: number;
}

export interface LossSeriesPoint {
  index: number;
  time: string;
  truth_loss_kw: number;
  conventional_loss_kw: number;
  smart_loss_kw: number;
}

export interface AssetProvenance {
  source_type: string;
  dataset_mode: string;
  scenario_id?: string;
  fingerprint?: string;
  seed?: number | null;
  generated_by: string;
  solver: string;
  truth_policy: string;
}

export interface OperationalAssetContract {
  asset_id: OperationalAssetId;
  label: string;
  source_kind: "derived_rollup" | "independent_physics_case" | "degraded_field_like_physics_case";
  child_assets?: OperationalAssetId[];
  provenance: AssetProvenance;
}

export interface OperationalDataContract {
  schema: "smart-distribution-loss-operational-data-v1";
  dataset_mode: "synthetic_demo";
  source_label: "Synthetic Demo";
  canonical_timebase: {
    intervals: 96;
    interval_minutes: 15;
    period_hours: 24;
    first_interval: "00:00";
    last_interval: "23:45";
    timezone: string;
  };
  assets: Record<OperationalAssetId, OperationalAssetContract>;
}

export type AssetSeriesMap = Record<OperationalAssetId, LossSeriesPoint[]>;

export interface MvDemo {
  demo_kind: string;
  scenario_id?: string;
  fingerprint?: string;
  gate: { pass: boolean; summary?: string };
  scenario?: {
    name?: string;
    topology?: string;
    intervals?: number;
    interval_minutes?: number;
    line_length_km?: number;
    profile?: string;
    pf?: number;
  };
  observability?: Record<string, unknown> & { verdict?: string };
  comparison: {
    truth: { loss_kwh: number };
    conventional: Comparison & { line_r_ohm_per_km?: number };
    smart: Comparison & { line_r_ohm_per_km?: number };
  };
  series?: SeriesPoint[];
  provenance?: AssetProvenance;
  smart_action: { classification: string; changed: string; held: string; reason: string };
  checks: CheckItem[];
  runtime?: Record<string, unknown>;
}

export type SpotDemo = MvDemo;
export type TmDemo = MvDemo;

export interface P3Result {
  gate: { pass: boolean; summary: string };
  preset: Preset;
  preset_label: string;
  split: { calibration_intervals: number; validation_intervals: number; rule: string };
  comparison: {
    conventional: Comparison;
    smart: Comparison & { customer_energy_error_percent_validation_only?: number };
    truth: { loss_kwh: number };
  };
  trace?: unknown[];
  unresolved: { parameter: string; status: string; reason: string }[];
  series: SeriesPoint[];
  asset_series: AssetSeriesMap;
  data_contract: OperationalDataContract;
  checks: CheckItem[];
  runtime: Record<string, unknown>;
  versions?: Record<string, string>;
  spot_load_demo: SpotDemo;
  tm_customer_demo: TmDemo;
}

export interface StageEvent {
  index: number;
  total: number;
  label: string;
  detail: string;
}

export const PRESET_PROFILE: Record<
  Preset,
  { label: string; ami: number; phase: number; pf: number; mapping: number; verdict: string }
> = {
  good: { label: "Good field data", ami: 94.4, phase: 90, pf: 80, mapping: 98.9, verdict: "Strong" },
  typical: { label: "Typical field data", ami: 80, phase: 64.4, pf: 40, mapping: 94.4, verdict: "Imperfect" },
  poor: { label: "Poor field data", ami: 60, phase: 40, pf: 20, mapping: 90, verdict: "Weak" },
};

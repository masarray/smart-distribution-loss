export type Preset = "good" | "typical" | "poor";

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

export interface SpotDemo {
  demo_kind: string;
  gate: { pass: boolean; summary?: string };
  observability?: Record<string, unknown> & { verdict?: string };
  comparison: {
    truth: { loss_kwh: number };
    conventional: Comparison & { line_r_ohm_per_km?: number };
    smart: Comparison & { line_r_ohm_per_km?: number };
  };
  smart_action: { classification: string; changed: string; held: string; reason: string };
  checks: CheckItem[];
}

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
  checks: CheckItem[];
  runtime: Record<string, unknown>;
  versions?: Record<string, string>;
  spot_load_demo: SpotDemo;
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
  typical: { label: "Typical field data", ami: 80, phase: 65.6, pf: 40, mapping: 94.4, verdict: "Imperfect" },
  poor: { label: "Poor field data", ami: 60, phase: 40, pf: 20, mapping: 90, verdict: "Weak" },
};

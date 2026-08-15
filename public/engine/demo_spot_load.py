"""Public demo: high-observability MV reference-load loss calculation.

This case is intentionally different from the poorly observed distribution model:
- topology, load P/Q, phase state, mapping and meter timing are fully observed;
- the conventional physics model should already be accurate;
- Smart Engine is allowed only a small, measurement-supported line-R correction;
- hidden synthetic truth is used only to score finished models.

M0 normalizes this asset to the cockpit's canonical operational timebase:
96 intervals x 15 minutes over one 24-hour day.
"""
from __future__ import annotations

import json
import math
import time

import numpy as np
import pandapower as pp

SPOT_SCENARIO_ID = "spot-mv-reference-v2"
SPOT_FINGERPRINT = "20KV-SPOT-5KM-96QH-BALANCED-V2"
SPOT_INTERVAL_MINUTES = 15
SPOT_INTERVALS = 96
SPOT_INTERVAL_HOURS = SPOT_INTERVAL_MINUTES / 60.0
SPOT_SEED = 61850 + 501
SPOT_LENGTH_KM = 5.0
SPOT_TRUE_R_OHM_PER_KM = 0.205
SPOT_TRUE_X_OHM_PER_KM = 0.085
SPOT_CONVENTIONAL_R_FACTOR = 1.015
SPOT_PF = 0.96


def _f(value, default=0.0):
    try:
        value = float(value)
        return value if math.isfinite(value) else default
    except Exception:
        return default


def _time_label(index: int) -> str:
    total_minutes = int(index) * SPOT_INTERVAL_MINUTES
    return f"{total_minutes // 60:02d}:{total_minutes % 60:02d}"


def _line_loss_kw(net):
    if not len(net.res_line_3ph):
        return 0.0
    row = net.res_line_3ph.iloc[0]
    total_mw = 0.0
    found = False
    for phase in ("a", "b", "c"):
        left = f"p_{phase}_from_mw"
        right = f"p_{phase}_to_mw"
        if left in row.index and right in row.index:
            found = True
            total_mw += _f(row[left]) + _f(row[right])
    return total_mw * 1000.0 if found else 0.0


def _source_kw(net):
    if hasattr(net, "res_ext_grid_3ph") and len(net.res_ext_grid_3ph):
        row = net.res_ext_grid_3ph.iloc[0]
        return sum(_f(row.get(f"p_{phase}_mw")) for phase in ("a", "b", "c")) * 1000.0
    return 0.0


def _build_spot_network(r_ohm_per_km):
    net = pp.create_empty_network(sn_mva=10.0)
    source = pp.create_bus(net, vn_kv=20.0, name="20 kV Grid")
    customer = pp.create_bus(net, vn_kv=20.0, name="MV Reference Load")
    pp.create_ext_grid(
        net,
        source,
        vm_pu=1.0,
        s_sc_max_mva=1000.0,
        rx_max=0.1,
        x0x_max=1.0,
        r0x0_max=0.1,
        name="Grid",
    )
    pp.create_line_from_parameters(
        net,
        source,
        customer,
        length_km=SPOT_LENGTH_KM,
        r_ohm_per_km=float(r_ohm_per_km),
        x_ohm_per_km=SPOT_TRUE_X_OHM_PER_KM,
        c_nf_per_km=10.0,
        r0_ohm_per_km=float(r_ohm_per_km) * 3.0,
        x0_ohm_per_km=SPOT_TRUE_X_OHM_PER_KM * 3.0,
        c0_nf_per_km=6.0,
        max_i_ka=0.24,
        name="MV Feeder to Reference Load",
    )
    load = pp.create_asymmetric_load(
        net,
        customer,
        p_a_mw=0.2,
        p_b_mw=0.2,
        p_c_mw=0.2,
        q_a_mvar=0.05,
        q_b_mvar=0.05,
        q_c_mvar=0.05,
        type="wye",
        name="Observed MV Reference Load",
    )
    return net, customer, load


def _profile_kw():
    quarter = np.arange(SPOT_INTERVALS, dtype=float)
    hours = quarter * SPOT_INTERVAL_HOURS
    morning = 210.0 * np.exp(-0.5 * ((hours - 9.0) / 2.5) ** 2)
    afternoon = 300.0 * np.exp(-0.5 * ((hours - 15.5) / 3.2) ** 2)
    evening = 90.0 * np.exp(-0.5 * ((hours - 20.0) / 2.0) ** 2)
    ripple = 8.0 * np.sin(quarter * 2.0 * np.pi / 17.0) + 4.0 * np.sin(quarter * 2.0 * np.pi / 9.0)
    return np.maximum(540.0 + morning + afternoon + evening + ripple, 500.0)


def _apply_load(net, load_index, p_kw):
    q_kvar = float(p_kw) * math.tan(math.acos(SPOT_PF))
    for phase in ("a", "b", "c"):
        net.asymmetric_load.at[load_index, f"p_{phase}_mw"] = float(p_kw) / 3.0 / 1000.0
        net.asymmetric_load.at[load_index, f"q_{phase}_mvar"] = q_kvar / 3.0 / 1000.0
    return q_kvar


def _simulate(r_ohm_per_km, profile, measured_source_kw=None):
    net, customer_bus, load_idx = _build_spot_network(r_ohm_per_km)
    records = []
    solve_ms = []
    for i, p_kw in enumerate(profile):
        q_kvar = _apply_load(net, load_idx, p_kw)
        t0 = time.perf_counter()
        pp.runpp_3ph(
            net,
            numba=False,
            init="results" if i else "auto",
            max_iteration=30,
            tolerance_mva=1e-8,
        )
        solve_ms.append((time.perf_counter() - t0) * 1000.0)
        if not bool(net.converged):
            raise RuntimeError(f"Spot-load interval {i} did not converge")
        vrow = net.res_bus_3ph.loc[customer_bus]
        model_source = _source_kw(net)
        records.append({
            "index": i,
            "time": _time_label(i),
            "load_kw": float(p_kw),
            "load_kvar": float(q_kvar),
            "source_kw": float(model_source),
            "loss_kw": float(_line_loss_kw(net)),
            "vm_min_pu": min(_f(vrow.get(f"vm_{ph}_pu"), 1.0) for ph in ("a", "b", "c")),
            "source_residual_kw": (float(model_source) - float(measured_source_kw[i])) if measured_source_kw is not None else 0.0,
        })
    return records, solve_ms


def _rmse(values):
    values = np.asarray(values, dtype=float)
    return float(np.sqrt(np.mean(values ** 2))) if values.size else 0.0


def run_spot_load_demo():
    profile = _profile_kw()
    truth_records, truth_ms = _simulate(SPOT_TRUE_R_OHM_PER_KM, profile)

    # High-observability meter model: P/Q/timing/topology are known; only a tiny
    # deterministic source-meter uncertainty is added for realism.
    rng = np.random.default_rng(SPOT_SEED)
    source_noise = rng.uniform(-0.00005, 0.00005, SPOT_INTERVALS)
    measured_source = np.array([r["source_kw"] for r in truth_records], dtype=float) * (1.0 + source_noise)

    conventional_r = SPOT_TRUE_R_OHM_PER_KM * SPOT_CONVENTIONAL_R_FACTOR
    conventional_records, conventional_ms = _simulate(conventional_r, profile, measured_source)

    # Smart Engine: because load P/Q and topology are fully observed, the only
    # eligible correction is a bounded aggregate line-R scale.
    p = np.asarray(profile, dtype=float)
    q = p * math.tan(math.acos(SPOT_PF))
    s_va = np.sqrt(p ** 2 + q ** 2) * 1000.0
    current_a = s_va / (math.sqrt(3.0) * 20_000.0)
    measured_loss_w = np.maximum(measured_source - p, 0.0) * 1000.0
    valid = current_a > 1.0
    r_total_est = np.sum(measured_loss_w[valid] * (current_a[valid] ** 2)) / max(
        np.sum(3.0 * (current_a[valid] ** 4)), 1e-12
    )
    smart_r = float(np.clip(r_total_est / SPOT_LENGTH_KM, conventional_r * 0.94, conventional_r * 1.02))

    smart_records, smart_ms = _simulate(smart_r, profile, measured_source)

    truth_loss_kwh = sum(r["loss_kw"] * SPOT_INTERVAL_HOURS for r in truth_records)
    conventional_loss_kwh = sum(r["loss_kw"] * SPOT_INTERVAL_HOURS for r in conventional_records)
    smart_loss_kwh = sum(r["loss_kw"] * SPOT_INTERVAL_HOURS for r in smart_records)
    conventional_error = (conventional_loss_kwh - truth_loss_kwh) / truth_loss_kwh * 100.0
    smart_error = (smart_loss_kwh - truth_loss_kwh) / truth_loss_kwh * 100.0
    peak_measured = max(abs(float(x)) for x in measured_source) or 1.0
    conventional_nrmse = _rmse([r["source_residual_kw"] for r in conventional_records]) / peak_measured * 100.0
    smart_nrmse = _rmse([r["source_residual_kw"] for r in smart_records]) / peak_measured * 100.0
    min_v = min(r["vm_min_pu"] for r in smart_records)

    series = []
    for i in range(SPOT_INTERVALS):
        series.append({
            "index": i,
            "time": truth_records[i]["time"],
            "truth_loss_kw": float(truth_records[i]["loss_kw"]),
            "conventional_loss_kw": float(conventional_records[i]["loss_kw"]),
            "smart_loss_kw": float(smart_records[i]["loss_kw"]),
            "observed_source_kw": float(measured_source[i]),
            "conventional_source_kw": float(conventional_records[i]["source_kw"]),
            "smart_source_kw": float(smart_records[i]["source_kw"]),
        })

    checks = [
        {"name": "canonical 15-minute timebase", "pass": len(series) == 96 and series[-1]["time"] == "23:45", "detail": "96 x 15-minute operational intervals"},
        {"name": "spot-load physics converged", "pass": len(smart_records) == SPOT_INTERVALS, "detail": f"{SPOT_INTERVALS}/{SPOT_INTERVALS} runpp_3ph intervals"},
        {"name": "high-observability conventional model is already accurate", "pass": abs(conventional_error) < 3.0, "detail": f"loss error {conventional_error:+.3f}%"},
        {"name": "Smart Engine does not over-correct the reference load", "pass": abs(smart_error) <= abs(conventional_error) and abs(smart_error) < 2.0, "detail": f"{conventional_error:+.3f}% → {smart_error:+.3f}%"},
        {"name": "source measurement fit did not regress", "pass": smart_nrmse <= conventional_nrmse + 1e-9, "detail": f"{conventional_nrmse:.4f}% → {smart_nrmse:.4f}% NRMSE"},
        {"name": "MV voltage remains plausible", "pass": min_v > 0.95, "detail": f"minimum {min_v:.5f} pu"},
    ]
    gate_pass = all(item["pass"] for item in checks)

    return {
        "demo_kind": "spot_load",
        "scenario_id": SPOT_SCENARIO_ID,
        "fingerprint": SPOT_FINGERPRINT,
        "mode": "synthetic_proof",
        "gate": {
            "pass": gate_pass,
            "summary": "High-observability MV reference load is already accurate; Smart Engine applies only a small evidence-based correction." if gate_pass else "Reference-load proof did not meet every accuracy guard.",
        },
        "scenario": {
            "name": "Referensi TM / high-observability MV load",
            "topology": "20 kV grid → 5 km MV feeder → one fully metered 3-phase reference load",
            "intervals": SPOT_INTERVALS,
            "interval_minutes": SPOT_INTERVAL_MINUTES,
            "line_length_km": SPOT_LENGTH_KM,
            "pf": SPOT_PF,
            "profile": "deterministic quarter-hour MV reference-load profile",
        },
        "observability": {
            "load_pq_percent": 100.0,
            "phase_percent": 100.0,
            "topology_percent": 100.0,
            "mapping_percent": 100.0,
            "timing_percent": 100.0,
            "verdict": "HIGH",
        },
        "comparison": {
            "truth": {"loss_kwh": truth_loss_kwh},
            "conventional": {
                "loss_kwh": conventional_loss_kwh,
                "loss_error_percent_validation_only": conventional_error,
                "source_nrmse_percent": conventional_nrmse,
                "line_r_ohm_per_km": conventional_r,
            },
            "smart": {
                "loss_kwh": smart_loss_kwh,
                "loss_error_percent_validation_only": smart_error,
                "source_nrmse_percent": smart_nrmse,
                "line_r_ohm_per_km": smart_r,
            },
        },
        "series": series,
        "provenance": {
            "source_type": "synthetic_demo",
            "dataset_mode": "deterministic_synthetic",
            "scenario_id": SPOT_SCENARIO_ID,
            "fingerprint": SPOT_FINGERPRINT,
            "seed": SPOT_SEED,
            "generated_by": "demo_spot_load.py",
            "solver": "pandapower.runpp_3ph",
            "truth_policy": "hidden synthetic truth is validation-only; calibration receives measured source/load states",
        },
        "smart_action": {
            "classification": "MINIMAL_CORRECTION",
            "changed": "aggregate MV line resistance only",
            "held": "measured P/Q, phase, topology, mapping and timing",
            "reason": "Observability is already high, so Smart Engine preserves verified states instead of inventing corrections.",
        },
        "checks": checks,
        "runtime": {
            "truth_solver_ms": float(sum(truth_ms)),
            "conventional_solver_ms": float(sum(conventional_ms)),
            "smart_solver_ms": float(sum(smart_ms)),
            "truth_used_by_calibration": False,
            "truth_used_for_final_validation_only": True,
            "solver": "pandapower.runpp_3ph",
        },
    }


def run_spot_load_demo_json():
    return json.dumps(run_spot_load_demo(), allow_nan=False)

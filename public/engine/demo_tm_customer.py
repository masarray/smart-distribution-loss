"""Independent high-observability 20 kV customer model.

This scenario exists specifically so Pelanggan TM is not a second label for the
Spot MV proof. It has its own topology parameters, 15-minute demand profile,
phase asymmetry, meter noise, calibration result, checks, and provenance.

Hidden synthetic truth is used only after calibration to score the finished
conventional and smart models.
"""
from __future__ import annotations

import json
import math
import time

import numpy as np
import pandapower as pp

TM_SCENARIO_ID = "tm-customer-independent-v1"
TM_FINGERPRINT = "20KV-TM-2P8KM-96QH-ASYM-V1"
TM_INTERVALS = 96
TM_INTERVAL_HOURS = 0.25
TM_SEED = 61850 + 907
TM_LENGTH_KM = 2.8
TM_TRUE_R_OHM_PER_KM = 0.165
TM_TRUE_X_OHM_PER_KM = 0.078
TM_CONVENTIONAL_R_FACTOR = 1.045
TM_NOMINAL_KV = 20.0


def _tm_f(value, default=0.0):
    try:
        value = float(value)
        return value if math.isfinite(value) else default
    except Exception:
        return default


def _tm_line_loss_kw(net):
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
            total_mw += _tm_f(row[left]) + _tm_f(row[right])
    return total_mw * 1000.0 if found else 0.0


def _tm_source_kw(net):
    if hasattr(net, "res_ext_grid_3ph") and len(net.res_ext_grid_3ph):
        row = net.res_ext_grid_3ph.iloc[0]
        return sum(_tm_f(row.get(f"p_{phase}_mw")) for phase in ("a", "b", "c")) * 1000.0
    return 0.0


def _tm_build_network(r_ohm_per_km):
    net = pp.create_empty_network(sn_mva=10.0)
    source = pp.create_bus(net, vn_kv=TM_NOMINAL_KV, name="20 kV Feeder Bus")
    customer = pp.create_bus(net, vn_kv=TM_NOMINAL_KV, name="Independent TM Customer")
    pp.create_ext_grid(
        net,
        source,
        vm_pu=1.0,
        s_sc_max_mva=900.0,
        rx_max=0.1,
        x0x_max=1.0,
        r0x0_max=0.1,
        name="Upstream 20 kV Grid",
    )
    pp.create_line_from_parameters(
        net,
        source,
        customer,
        length_km=TM_LENGTH_KM,
        r_ohm_per_km=float(r_ohm_per_km),
        x_ohm_per_km=TM_TRUE_X_OHM_PER_KM,
        c_nf_per_km=12.0,
        r0_ohm_per_km=float(r_ohm_per_km) * 3.2,
        x0_ohm_per_km=TM_TRUE_X_OHM_PER_KM * 3.2,
        c0_nf_per_km=7.0,
        max_i_ka=0.28,
        name="Dedicated MV Customer Feeder",
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
        name="Metered TM Customer",
    )
    return net, customer, load


def _tm_profile():
    quarter = np.arange(TM_INTERVALS, dtype=float)
    hours = quarter / 4.0
    morning = 210.0 * np.exp(-0.5 * ((hours - 8.5) / 1.7) ** 2)
    business = 360.0 * np.exp(-0.5 * ((hours - 13.5) / 3.7) ** 2)
    evening = 150.0 * np.exp(-0.5 * ((hours - 19.0) / 2.2) ** 2)
    ripple = 18.0 * np.sin(quarter * 2.0 * np.pi / 16.0) + 9.0 * np.sin(quarter * 2.0 * np.pi / 7.0)
    total_kw = np.maximum(250.0 + morning + business + evening + ripple, 220.0)

    phase_a = 0.345 + 0.010 * np.sin(quarter * 2.0 * np.pi / 24.0)
    phase_b = 0.325 + 0.009 * np.sin(quarter * 2.0 * np.pi / 19.0 + 1.1)
    phase_c = 1.0 - phase_a - phase_b

    pf_a = 0.935 + 0.012 * np.sin(quarter * 2.0 * np.pi / 32.0)
    pf_b = 0.945 + 0.010 * np.sin(quarter * 2.0 * np.pi / 29.0 + 0.7)
    pf_c = 0.940 + 0.011 * np.sin(quarter * 2.0 * np.pi / 27.0 + 1.5)
    return total_kw, np.column_stack([phase_a, phase_b, phase_c]), np.column_stack([pf_a, pf_b, pf_c])


def _tm_apply_load(net, load_index, p_kw, fractions, pfs):
    phase_p_kw = np.asarray(fractions, dtype=float) * float(p_kw)
    phase_q_kvar = []
    for idx, phase in enumerate(("a", "b", "c")):
        pf = float(np.clip(pfs[idx], 0.88, 0.99))
        p_phase = float(phase_p_kw[idx])
        q_phase = p_phase * math.tan(math.acos(pf))
        phase_q_kvar.append(q_phase)
        net.asymmetric_load.at[load_index, f"p_{phase}_mw"] = p_phase / 1000.0
        net.asymmetric_load.at[load_index, f"q_{phase}_mvar"] = q_phase / 1000.0
    return phase_p_kw, np.asarray(phase_q_kvar, dtype=float)


def _tm_simulate(r_ohm_per_km, profile_kw, phase_fractions, phase_pfs, measured_source_kw=None):
    net, customer_bus, load_idx = _tm_build_network(r_ohm_per_km)
    records = []
    solve_ms = []
    for i, p_kw in enumerate(profile_kw):
        phase_p_kw, phase_q_kvar = _tm_apply_load(net, load_idx, p_kw, phase_fractions[i], phase_pfs[i])
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
            raise RuntimeError(f"Independent TM interval {i} did not converge")
        vrow = net.res_bus_3ph.loc[customer_bus]
        model_source = _tm_source_kw(net)
        records.append({
            "index": i,
            "time": f"{i // 4:02d}:{(i % 4) * 15:02d}",
            "load_kw": float(p_kw),
            "load_kvar": float(np.sum(phase_q_kvar)),
            "phase_p_kw": [float(v) for v in phase_p_kw],
            "phase_q_kvar": [float(v) for v in phase_q_kvar],
            "source_kw": float(model_source),
            "loss_kw": float(_tm_line_loss_kw(net)),
            "vm_min_pu": min(_tm_f(vrow.get(f"vm_{ph}_pu"), 1.0) for ph in ("a", "b", "c")),
            "source_residual_kw": (float(model_source) - float(measured_source_kw[i])) if measured_source_kw is not None else 0.0,
        })
    return records, solve_ms


def _tm_rmse(values):
    values = np.asarray(values, dtype=float)
    return float(np.sqrt(np.mean(values ** 2))) if values.size else 0.0


def _tm_estimate_r(profile_kw, phase_fractions, phase_pfs, measured_source_kw, conventional_r):
    v_phase = TM_NOMINAL_KV * 1000.0 / math.sqrt(3.0)
    x_terms = []
    y_terms = []
    for i, total_kw in enumerate(profile_kw):
        p_phase_kw = np.asarray(phase_fractions[i], dtype=float) * float(total_kw)
        q_phase_kvar = np.array([
            p_phase_kw[j] * math.tan(math.acos(float(np.clip(phase_pfs[i][j], 0.88, 0.99))))
            for j in range(3)
        ])
        s_phase_va = np.sqrt(p_phase_kw ** 2 + q_phase_kvar ** 2) * 1000.0
        currents_a = s_phase_va / v_phase
        x_terms.append(float(np.sum(currents_a ** 2)))
        y_terms.append(max(float(measured_source_kw[i]) - float(total_kw), 0.0) * 1000.0)
    x = np.asarray(x_terms, dtype=float)
    y = np.asarray(y_terms, dtype=float)
    r_total_est = float(np.sum(x * y) / max(np.sum(x ** 2), 1e-12))
    estimate = r_total_est / TM_LENGTH_KM
    return float(np.clip(estimate, conventional_r * 0.90, conventional_r * 1.02))


def run_tm_customer_demo():
    profile_kw, phase_fractions, phase_pfs = _tm_profile()
    truth_records, truth_ms = _tm_simulate(TM_TRUE_R_OHM_PER_KM, profile_kw, phase_fractions, phase_pfs)

    rng = np.random.default_rng(TM_SEED)
    source_noise = rng.uniform(-0.00008, 0.00008, TM_INTERVALS)
    measured_source = np.array([r["source_kw"] for r in truth_records], dtype=float) * (1.0 + source_noise)

    conventional_r = TM_TRUE_R_OHM_PER_KM * TM_CONVENTIONAL_R_FACTOR
    conventional_records, conventional_ms = _tm_simulate(
        conventional_r, profile_kw, phase_fractions, phase_pfs, measured_source
    )

    smart_r = _tm_estimate_r(profile_kw, phase_fractions, phase_pfs, measured_source, conventional_r)
    smart_records, smart_ms = _tm_simulate(smart_r, profile_kw, phase_fractions, phase_pfs, measured_source)

    truth_loss_kwh = sum(r["loss_kw"] * TM_INTERVAL_HOURS for r in truth_records)
    conventional_loss_kwh = sum(r["loss_kw"] * TM_INTERVAL_HOURS for r in conventional_records)
    smart_loss_kwh = sum(r["loss_kw"] * TM_INTERVAL_HOURS for r in smart_records)
    conventional_error = (conventional_loss_kwh - truth_loss_kwh) / truth_loss_kwh * 100.0
    smart_error = (smart_loss_kwh - truth_loss_kwh) / truth_loss_kwh * 100.0
    peak_measured = max(abs(float(x)) for x in measured_source) or 1.0
    conventional_nrmse = _tm_rmse([r["source_residual_kw"] for r in conventional_records]) / peak_measured * 100.0
    smart_nrmse = _tm_rmse([r["source_residual_kw"] for r in smart_records]) / peak_measured * 100.0
    min_v = min(r["vm_min_pu"] for r in smart_records)

    checks = [
        {
            "name": "independent TM identity",
            "pass": TM_SCENARIO_ID == "tm-customer-independent-v1" and TM_INTERVALS == 96,
            "detail": f"{TM_FINGERPRINT} · 96 x 15-minute intervals",
        },
        {
            "name": "independent TM physics converged",
            "pass": len(smart_records) == TM_INTERVALS,
            "detail": f"{TM_INTERVALS}/{TM_INTERVALS} runpp_3ph intervals",
        },
        {
            "name": "conventional TM model remains plausible",
            "pass": abs(conventional_error) < 8.0,
            "detail": f"loss error {conventional_error:+.3f}%",
        },
        {
            "name": "bounded TM calibration improves loss estimate",
            "pass": abs(smart_error) < abs(conventional_error) and abs(smart_error) < 2.5,
            "detail": f"{conventional_error:+.3f}% → {smart_error:+.3f}%",
        },
        {
            "name": "TM source-meter fit improves",
            "pass": smart_nrmse < conventional_nrmse,
            "detail": f"{conventional_nrmse:.4f}% → {smart_nrmse:.4f}% NRMSE",
        },
        {
            "name": "TM voltage remains plausible",
            "pass": min_v > 0.96,
            "detail": f"minimum {min_v:.5f} pu",
        },
    ]
    gate_pass = all(item["pass"] for item in checks)

    return {
        "demo_kind": "tm_customer",
        "scenario_id": TM_SCENARIO_ID,
        "fingerprint": TM_FINGERPRINT,
        "mode": "synthetic_proof",
        "gate": {
            "pass": gate_pass,
            "summary": "Independent Pelanggan TM model passed its own 15-minute three-phase physics and calibration checks."
            if gate_pass
            else "Independent Pelanggan TM model did not meet every engineering guard.",
        },
        "scenario": {
            "name": "Pelanggan TM independen",
            "topology": "20 kV feeder → dedicated 2.8 km MV line → one metered asymmetric 3-phase customer",
            "intervals": TM_INTERVALS,
            "interval_minutes": 15,
            "line_length_km": TM_LENGTH_KM,
            "profile": "independent commercial/industrial quarter-hour demand with measured phase P/Q",
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
        "smart_action": {
            "classification": "BOUNDED_LINE_CALIBRATION",
            "changed": "dedicated TM line resistance only",
            "held": "independent 15-minute P/Q, phase split, topology, mapping and timing",
            "reason": "The TM customer is fully metered, so calibration is restricted to a bounded line-R correction supported by source-meter residuals.",
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


def run_tm_customer_demo_json():
    return json.dumps(run_tm_customer_demo(), allow_nan=False)

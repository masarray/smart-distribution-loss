"""P3 — physics-informed Smart Calibration Engine v1.

Requires p0b_engine.py, p1_ground_truth.py and p2_degradation.py in the same
Pyodide namespace.

Isolation rule:
- Calibration consumes ONLY the degraded P2 customer/model view plus noisy
  system measurements.
- Hidden P1 Ground Truth is not used by any calibration stage.
- Hidden truth is accessed only in finish_p3() for synthetic validation/scoring
  after all smart decisions and 96 smart power flows are complete.
"""
from __future__ import annotations

import json
import math
import time

import numpy as np
import pandapower as pp

P3_INTERVALS = 96
P3_INTERVAL_HOURS = 0.25
P3_PF_MIN = 0.80
P3_PF_MAX = 0.99
P3_SEED = 61850 + 303

# 64 calibration / 32 hold-out validation intervals.
P3_CALIBRATION_INDICES = np.array([i for i in range(P3_INTERVALS) if i % 3 != 2], dtype=int)
P3_VALIDATION_INDICES = np.array([i for i in range(P3_INTERVALS) if i % 3 == 2], dtype=int)
P3_Q_ANCHOR_INDICES = np.array(list(range(0, P3_INTERVALS, 6)), dtype=int)

_P3_SESSION = None


def _p2_ready(preset=None):
    if _P2_SESSION is None or len(_P2_SESSION.get("records", [])) != P3_INTERVALS:
        return False
    if preset is not None and _P2_SESSION.get("preset") != str(preset).lower():
        return False
    return True


def _p3_copy_view():
    return [dict(record) for record in _P2_SESSION["view"]]


def _observed_q_measurements():
    """Return the degraded feeder-Q measurement channel prepared by P2.

    Measurement synthesis/noise belongs to the data-quality layer. P3 consumes
    only the public/degraded measurement view and does not read hidden P1 truth
    before final validation.
    """
    return np.array(
        [float(item["source_kvar"]) for item in _P2_SESSION["observed_system"]],
        dtype=float,
    )


def _customer_total(p_matrix):
    return np.sum(p_matrix, axis=0)


def _phase_customer_aggregate(p_matrix, assignment):
    result = {phase: np.zeros(P3_INTERVALS, dtype=float) for phase in PHASES}
    for row, record in enumerate(_P2_SESSION["view"]):
        phase = assignment[int(record["customer_id"])]
        result[phase] += p_matrix[row]
    return result


def _baseline_phase_overhead():
    aggregate = _phase_customer_aggregate(_P2_SESSION["p_est"], _P2_SESSION["phase_assignment"])
    overhead = {phase: np.zeros(P3_INTERVALS, dtype=float) for phase in PHASES}
    for i, record in enumerate(_P2_SESSION["records"]):
        for phase in PHASES:
            model_phase = (
                float(_P2_SESSION["observed_system"][i]["source_phase_kw"][phase])
                + float(record["phase_residual_kw"][phase])
            )
            overhead[phase][i] = model_phase - aggregate[phase][i]
    return overhead


def _baseline_p_overhead():
    total = _customer_total(_P2_SESSION["p_est"])
    return np.array(
        [float(record["conventional_source_kw"]) - total[i] for i, record in enumerate(_P2_SESSION["records"])],
        dtype=float,
    )


def _measurement_objective_from_records(records, indices):
    idx = list(map(int, indices))
    if not idx:
        return 0.0
    source_peak = max(abs(float(records[i]["observed_source_kw"])) for i in idx) or 1.0
    phase_peak = max(
        abs(float(_P2_SESSION["observed_system"][i]["source_phase_kw"][phase]))
        for i in idx for phase in PHASES
    ) or 1.0
    source_rmse = _rmse([records[i]["source_residual_kw"] for i in idx]) / source_peak
    phase_rmse = _rmse([
        records[i]["phase_residual_kw"][phase]
        for i in idx for phase in PHASES
    ]) / phase_peak
    voltage_rmse = _rmse([
        records[i]["voltage_residual_pu"][phase]
        for i in idx for phase in PHASES
    ]) / 0.01
    return float(math.sqrt(0.30 * source_rmse ** 2 + 0.45 * phase_rmse ** 2 + 0.25 * voltage_rmse ** 2))


def _proxy_phase_cost(p_matrix, assignment, indices):
    aggregate = _phase_customer_aggregate(p_matrix, assignment)
    target = _P3_SESSION["phase_target_customer_kw"]
    idx = np.asarray(indices, dtype=int)
    peak = max(
        float(np.max(np.abs(target[phase][idx]))) if idx.size else 0.0
        for phase in PHASES
    ) or 1.0
    residuals = []
    for phase in PHASES:
        residuals.extend(((aggregate[phase][idx] - target[phase][idx]) / peak).tolist())
    return float(np.mean(np.square(residuals))) if residuals else 0.0


def start_p3_session(preset="typical"):
    global _P3_SESSION
    key = str(preset or "typical").lower()
    if not _p2_ready(key):
        raise RuntimeError("P3 requires a completed P2 session for the same preset")

    started = time.perf_counter()
    p_est = np.array(_P2_SESSION["p_est"], dtype=float, copy=True)
    view = _p3_copy_view()
    assignment = dict(_P2_SESSION["phase_assignment"])
    observed_system = [
        {
            "source_kw": float(item["source_kw"]),
            "source_kvar": float(item["source_kvar"]),
            "source_phase_kw": {phase: float(item["source_phase_kw"][phase]) for phase in PHASES},
            "lv_voltage_pu": {phase: float(item["lv_voltage_pu"][phase]) for phase in PHASES},
        }
        for item in _P2_SESSION["observed_system"]
    ]
    observed_source_kvar = _observed_q_measurements()

    phase_overhead = _baseline_phase_overhead()
    phase_target = {
        phase: np.array(
            [observed_system[i]["source_phase_kw"][phase] for i in range(P3_INTERVALS)],
            dtype=float,
        ) - phase_overhead[phase]
        for phase in PHASES
    }

    _P3_SESSION = {
        "preset": key,
        "config": dict(_P2_SESSION["config"]),
        "view": view,
        "p": p_est,
        "q": np.array(_P2_SESSION["q_est"], dtype=float, copy=True),
        "assignment": assignment,
        "observed_system": observed_system,
        "observed_source_kvar": observed_source_kvar,
        "baseline_p_overhead": _baseline_p_overhead(),
        "baseline_phase_overhead": phase_overhead,
        "phase_target_customer_kw": phase_target,
        "truth_hash_before": _P2_SESSION["truth_hash_before"],
        "baseline_records": [dict(r) for r in _P2_SESSION["records"]],
        "baseline_loss_kwh": float(sum(r["conventional_loss_kw"] * P3_INTERVAL_HOURS for r in _P2_SESSION["records"])),
        "trace": [],
        "time_corrections": {},
        "missing_scale": {"residential": 1.0, "small_commercial": 1.0},
        "pf_calibrated": {},
        "pfe_kw": 0.75 * (1.0 + _P2_SESSION["config"]["trafo_pfe_error_fraction"]),
        "q_anchor_model_kvar": None,
        "q_overhead_kvar": None,
        "net": None,
        "model_meta": None,
        "records": [],
        "solve_ms": [],
        "converged": 0,
        "build_ms": (time.perf_counter() - started) * 1000.0,
    }

    baseline_cal = _measurement_objective_from_records(_P3_SESSION["baseline_records"], P3_CALIBRATION_INDICES)
    baseline_val = _measurement_objective_from_records(_P3_SESSION["baseline_records"], P3_VALIDATION_INDICES)
    _P3_SESSION["baseline_objective_cal"] = baseline_cal
    _P3_SESSION["baseline_objective_val"] = baseline_val

    return {
        "preset": key,
        "preset_label": _P2_SESSION["config"]["label"],
        "customers": P2_CUSTOMERS,
        "calibration_intervals": int(len(P3_CALIBRATION_INDICES)),
        "validation_intervals": int(len(P3_VALIDATION_INDICES)),
        "baseline_objective_calibration": baseline_cal,
        "baseline_objective_validation": baseline_val,
        "truth_hash_short": _P3_SESSION["truth_hash_before"][:16],
        "build_ms": _P3_SESSION["build_ms"],
    }


def start_p3_session_json(preset="typical"):
    return json.dumps(start_p3_session(preset), allow_nan=False)


def p3_stage_time_alignment():
    session = _P3_SESSION
    if session is None:
        raise RuntimeError("P3 session is not initialized")

    p = session["p"]
    flagged = list(_P2_SESSION["selections"]["timestamp_shift_ids"])
    total = _customer_total(p)
    obs = np.array([r["source_kw"] for r in session["observed_system"]], dtype=float)
    overhead = session["baseline_p_overhead"]
    idx = P3_CALIBRATION_INDICES

    before = _rmse((total + overhead - obs)[idx])
    corrections = {}
    for cid in sorted(flagged):
        row = cid - 1
        current = p[row].copy()
        base_without = total - current
        best_delta = 0
        best_profile = current
        best_cost = float("inf")
        for delta in (-1, 0, 1):
            candidate = np.roll(current, delta)
            residual = base_without + candidate + overhead - obs
            cost = float(np.mean(np.square(residual[idx])))
            if cost < best_cost:
                best_cost = cost
                best_delta = delta
                best_profile = candidate
        p[row] = best_profile
        total = base_without + best_profile
        corrections[cid] = best_delta

    after = _rmse((total + overhead - obs)[idx])
    session["time_corrections"] = corrections
    corrected = sum(1 for delta in corrections.values() if delta != 0)
    item = {
        "stage": "Timestamp alignment",
        "status": "CALIBRATED",
        "before": before,
        "after": after,
        "unit": "kW RMSE proxy",
        "detail": f"{corrected}/{len(flagged)} flagged AMI streams shifted by the selected ±15 min correction",
    }
    session["trace"].append(item)
    return item


def p3_stage_load_reconstruction():
    session = _P3_SESSION
    p = session["p"]
    obs = np.array([r["source_kw"] for r in session["observed_system"]], dtype=float)
    target_customer = obs - session["baseline_p_overhead"]
    idx = P3_CALIBRATION_INDICES

    missing_ids = set(_P2_SESSION["selections"]["missing_ami_ids"])
    missing_rows = [cid - 1 for cid in missing_ids]
    known_rows = [i for i in range(P2_CUSTOMERS) if i not in missing_rows]

    known_sum = np.sum(p[known_rows], axis=0) if known_rows else np.zeros(P3_INTERVALS)
    columns = []
    categories = []
    for category in ("residential", "small_commercial"):
        rows = [
            r["customer_id"] - 1 for r in session["view"]
            if r["customer_id"] in missing_ids and r["category"] == category
        ]
        if rows:
            columns.append(np.sum(p[rows], axis=0))
            categories.append(category)

    before = _rmse((_customer_total(p) - target_customer)[idx])
    if columns:
        X = np.vstack([column[idx] for column in columns]).T
        y = (target_customer - known_sum)[idx]
        coeff, *_ = np.linalg.lstsq(X, y, rcond=None)
        coeff = np.clip(coeff, 0.65, 1.35)
        for category, scale in zip(categories, coeff.tolist()):
            session["missing_scale"][category] = float(scale)
            for record in session["view"]:
                cid = int(record["customer_id"])
                if cid in missing_ids and record["category"] == category:
                    p[cid - 1] *= float(scale)

    after = _rmse((_customer_total(p) - target_customer)[idx])
    scales = " · ".join(f"{key}×{value:.3f}" for key, value in session["missing_scale"].items())
    item = {
        "stage": "Missing-AMI reconstruction",
        "status": "CALIBRATED",
        "before": before,
        "after": after,
        "unit": "kW RMSE proxy",
        "detail": f"bounded peer-profile scaling fitted on feeder P: {scales}",
    }
    session["trace"].append(item)
    return item


def p3_stage_phase_inference():
    session = _P3_SESSION
    p = session["p"]
    assignment = session["assignment"]
    unknown_ids = sorted(_P2_SESSION["selections"]["unknown_phase_ids"])
    before = math.sqrt(_proxy_phase_cost(p, assignment, P3_CALIBRATION_INDICES))

    ranked = sorted(unknown_ids, key=lambda cid: float(np.std(p[cid - 1])), reverse=True)
    sweeps = 0
    for sweep in range(5):
        changed = 0
        for cid in ranked:
            old_phase = assignment[cid]
            best_phase = old_phase
            best_cost = _proxy_phase_cost(p, assignment, P3_CALIBRATION_INDICES)
            for phase in PHASES:
                if phase == old_phase:
                    continue
                assignment[cid] = phase
                cost = _proxy_phase_cost(p, assignment, P3_CALIBRATION_INDICES)
                if cost + 1e-12 < best_cost:
                    best_cost = cost
                    best_phase = phase
            assignment[cid] = best_phase
            if best_phase != old_phase:
                changed += 1
        sweeps = sweep + 1
        if changed == 0:
            break

    after = math.sqrt(_proxy_phase_cost(p, assignment, P3_CALIBRATION_INDICES))
    unique_changed = sum(
        1 for cid in unknown_ids
        if assignment[cid] != _P2_SESSION["phase_assignment"][cid]
    )
    item = {
        "stage": "Unknown-phase inference",
        "status": "CALIBRATED",
        "before": before,
        "after": after,
        "unit": "normalized phase-P proxy",
        "detail": f"{unique_changed}/{len(unknown_ids)} unknown-phase assignments changed after {sweeps} coordinate-descent sweeps",
    }
    session["trace"].append(item)
    return item


def p3_stage_q_anchor():
    session = _P3_SESSION
    net = _P2_SESSION["net"]
    q_model = []
    t0 = time.perf_counter()
    for n, i in enumerate(P3_Q_ANCHOR_INDICES):
        _apply_p2_interval(_P2_SESSION, int(i))
        pp.runpp_3ph(
            net,
            numba=False,
            init="auto" if n == 0 else "results",
            max_iteration=30,
            tolerance_mva=1e-8,
        )
        _, source_kvar, _, _ = _source_pq(net)
        q_model.append(float(source_kvar))

    q_model = np.array(q_model, dtype=float)
    baseline_customer_q = np.sum(_P2_SESSION["q_est"], axis=0)
    anchor_overhead = q_model - baseline_customer_q[P3_Q_ANCHOR_INDICES]
    all_idx = np.arange(P3_INTERVALS, dtype=float)
    session["q_anchor_model_kvar"] = q_model
    session["q_overhead_kvar"] = np.interp(
        all_idx,
        P3_Q_ANCHOR_INDICES.astype(float),
        anchor_overhead,
    )
    baseline_q_rmse = _rmse(q_model - session["observed_source_kvar"][P3_Q_ANCHOR_INDICES])
    item = {
        "stage": "Reactive-power observability",
        "status": "MEASURED",
        "before": baseline_q_rmse,
        "after": baseline_q_rmse,
        "unit": "kvar RMSE · 16 anchor intervals",
        "detail": f"sparse physics anchors built in {(time.perf_counter() - t0):.2f} s; noisy feeder Q only, no true customer PF",
    }
    session["trace"].append(item)
    return item


def p3_stage_pf_calibration():
    session = _P3_SESSION
    p = session["p"]
    q_overhead = session["q_overhead_kvar"]
    if q_overhead is None:
        raise RuntimeError("Reactive-power anchor stage must run before PF calibration")

    unknown_pf = set(_P2_SESSION["selections"]["unknown_pf_ids"])
    q_known = np.zeros(P3_INTERVALS, dtype=float)
    features = {"residential": np.zeros(P3_INTERVALS), "small_commercial": np.zeros(P3_INTERVALS)}

    for row, record in enumerate(session["view"]):
        cid = int(record["customer_id"])
        if cid in unknown_pf:
            features[record["category"]] += p[row]
        else:
            pf = float(record["pf_observed"])
            q_known += p[row] * math.tan(math.acos(np.clip(pf, P3_PF_MIN, 1.0)))

    idx = P3_CALIBRATION_INDICES
    y = session["observed_source_kvar"] - q_overhead - q_known
    columns = []
    categories = []
    for category in ("residential", "small_commercial"):
        if np.max(features[category]) > 0:
            columns.append(features[category])
            categories.append(category)

    baseline_q = np.sum(_P2_SESSION["q_est"], axis=0) + q_overhead
    before = _rmse((baseline_q - session["observed_source_kvar"])[idx])

    tan_phi = {}
    if columns:
        X = np.vstack([column[idx] for column in columns]).T
        coeff, *_ = np.linalg.lstsq(X, y[idx], rcond=None)
        low = math.tan(math.acos(P3_PF_MAX))
        high = math.tan(math.acos(P3_PF_MIN))
        for category, raw in zip(categories, coeff.tolist()):
            tan_phi[category] = float(np.clip(raw, low, high))

    q = np.zeros_like(p)
    for row, record in enumerate(session["view"]):
        cid = int(record["customer_id"])
        if cid in unknown_pf:
            category = record["category"]
            phi = tan_phi.get(category, math.tan(math.acos(0.92 if category == "residential" else 0.90)))
            pf = 1.0 / math.sqrt(1.0 + phi ** 2)
            session["pf_calibrated"][cid] = float(pf)
            q[row] = p[row] * phi
        else:
            pf = float(record["pf_observed"])
            session["pf_calibrated"][cid] = pf
            q[row] = p[row] * math.tan(math.acos(np.clip(pf, P3_PF_MIN, 1.0)))
    session["q"] = q

    smart_q_proxy = np.sum(q, axis=0) + q_overhead
    after = _rmse((smart_q_proxy - session["observed_source_kvar"])[idx])
    group_text = []
    for category in ("residential", "small_commercial"):
        ids = [cid for cid in unknown_pf if session["view"][cid - 1]["category"] == category]
        if ids:
            avg_pf = float(np.mean([session["pf_calibrated"][cid] for cid in ids]))
            group_text.append(f"{category} PF≈{avg_pf:.3f}")
    item = {
        "stage": "Unknown-PF calibration",
        "status": "CALIBRATED",
        "before": before,
        "after": after,
        "unit": "kvar RMSE proxy",
        "detail": " · ".join(group_text) + " · bounded least squares against noisy feeder Q",
    }
    session["trace"].append(item)
    return item


def p3_stage_network_parameters():
    session = _P3_SESSION
    p_total = _customer_total(session["p"])
    obs_p = np.array([r["source_kw"] for r in session["observed_system"]], dtype=float)
    baseline_pfe = 0.75 * (1.0 + session["config"]["trafo_pfe_error_fraction"])
    conventional_loss = np.array([r["conventional_loss_kw"] for r in session["baseline_records"]], dtype=float)
    noncore = np.maximum(conventional_loss - baseline_pfe, 0.0)
    inferred_core = obs_p - p_total - noncore

    cal = P3_CALIBRATION_INDICES
    cal_load = obs_p[cal]
    cutoff = float(np.quantile(cal_load, 0.35))
    low_idx = cal[cal_load <= cutoff]
    estimate = float(np.median(inferred_core[low_idx])) if low_idx.size else baseline_pfe
    estimate = float(np.clip(estimate, 0.45, 1.10))
    session["pfe_kw"] = estimate

    item = {
        "stage": "Network-parameter calibration",
        "status": "PARTIAL",
        "before": baseline_pfe,
        "after": estimate,
        "unit": "transformer Pfe kW",
        "detail": "Pfe estimated from low-load energy balance; vk/vkr, individual SR length and suspect mapping held because current measurement set cannot identify them reliably",
    }
    session["trace"].append(item)
    return item


def p3_build_smart_network():
    session = _P3_SESSION
    net, model_meta = _build_conventional_network(session["view"], session["config"])
    if len(net.trafo):
        net.trafo.at[net.trafo.index[0], "pfe_kw"] = float(session["pfe_kw"])
    session["net"] = net
    session["model_meta"] = model_meta
    item = {
        "stage": "Physics validation model",
        "status": "READY",
        "before": None,
        "after": None,
        "unit": "",
        "detail": "separate Pandapower model built from degraded P2 view + calibrated states; no hidden topology/phase/PF substitution",
    }
    session["trace"].append(item)
    return item


def _apply_p3_interval(session, interval_index):
    net = session["net"]
    for row, record in enumerate(session["view"]):
        cid = int(record["customer_id"])
        load_idx = session["model_meta"]["load_index"][cid]
        for phase in ("a", "b", "c"):
            net.asymmetric_load.at[load_idx, f"p_{phase}_mw"] = 0.0
            net.asymmetric_load.at[load_idx, f"q_{phase}_mvar"] = 0.0
        phase = session["assignment"][cid].lower()
        net.asymmetric_load.at[load_idx, f"p_{phase}_mw"] = float(session["p"][row, interval_index]) / 1000.0
        net.asymmetric_load.at[load_idx, f"q_{phase}_mvar"] = float(session["q"][row, interval_index]) / 1000.0


def run_p3_step(interval_index):
    session = _P3_SESSION
    if session is None or session["net"] is None:
        raise RuntimeError("P3 smart network is not ready")
    i = int(interval_index)
    if not 0 <= i < P3_INTERVALS:
        raise ValueError("interval_index outside 0..95")

    _apply_p3_interval(session, i)
    t0 = time.perf_counter()
    pp.runpp_3ph(
        session["net"],
        numba=False,
        init="results" if i > 0 else "auto",
        max_iteration=30,
        tolerance_mva=1e-8,
    )
    solve_ms = (time.perf_counter() - t0) * 1000.0
    session["solve_ms"].append(solve_ms)
    if not bool(session["net"].converged):
        raise RuntimeError(f"P3 smart interval {i} did not converge")
    session["converged"] += 1

    model_source_kw, model_source_kvar, model_phase_kw, _ = _source_pq(session["net"])
    line_loss = _line_loss_breakdown_kw(session["net"])
    trafo_row = session["net"].res_trafo_3ph.iloc[0]
    trafo_loss_kw = _phase_endpoint_loss_kw(trafo_row, "hv", "lv")
    model_loss_kw = line_loss["mv"] + line_loss["jtr"] + line_loss["service"] + trafo_loss_kw

    lv = session["net"].res_bus_3ph.loc[session["model_meta"]["lv_main"]]
    model_v = {phase.upper(): _f(lv.get(f"vm_{phase}_pu")) for phase in ("a", "b", "c")}
    obs = session["observed_system"][i]

    record = {
        "index": i,
        "time": _P2_SESSION["records"][i]["time"],
        "observed_source_kw": obs["source_kw"],
        "smart_source_kw": model_source_kw,
        "observed_source_kvar": float(session["observed_source_kvar"][i]),
        "smart_source_kvar": model_source_kvar,
        "smart_loss_kw": model_loss_kw,
        "source_residual_kw": model_source_kw - obs["source_kw"],
        "source_q_residual_kvar": model_source_kvar - float(session["observed_source_kvar"][i]),
        "phase_residual_kw": {phase: model_phase_kw[phase] - obs["source_phase_kw"][phase] for phase in PHASES},
        "voltage_residual_pu": {phase: model_v[phase] - obs["lv_voltage_pu"][phase] for phase in PHASES},
        "model_voltage_pu": model_v,
        "solve_ms": solve_ms,
    }
    session["records"].append(record)
    return record


def run_p3_step_json(interval_index):
    return json.dumps(run_p3_step(interval_index), allow_nan=False)


def _smart_objective(records, indices):
    idx = list(map(int, indices))
    if not idx:
        return 0.0
    source_peak = max(abs(records[i]["observed_source_kw"]) for i in idx) or 1.0
    phase_peak = max(
        abs(_P3_SESSION["observed_system"][i]["source_phase_kw"][phase])
        for i in idx for phase in PHASES
    ) or 1.0
    source_rmse = _rmse([records[i]["source_residual_kw"] for i in idx]) / source_peak
    phase_rmse = _rmse([records[i]["phase_residual_kw"][phase] for i in idx for phase in PHASES]) / phase_peak
    voltage_rmse = _rmse([records[i]["voltage_residual_pu"][phase] for i in idx for phase in PHASES]) / 0.01
    return float(math.sqrt(0.30 * source_rmse ** 2 + 0.45 * phase_rmse ** 2 + 0.25 * voltage_rmse ** 2))


def finish_p3():
    session = _P3_SESSION
    if session is None or len(session["records"]) != P3_INTERVALS:
        raise RuntimeError("P3 expected 96 completed smart intervals")

    records = session["records"]
    baseline = session["baseline_records"]
    cal_obj = _smart_objective(records, P3_CALIBRATION_INDICES)
    val_obj = _smart_objective(records, P3_VALIDATION_INDICES)
    baseline_cal = session["baseline_objective_cal"]
    baseline_val = session["baseline_objective_val"]
    cal_improve = (baseline_cal - cal_obj) / baseline_cal * 100.0 if baseline_cal else 0.0
    val_improve = (baseline_val - val_obj) / baseline_val * 100.0 if baseline_val else 0.0

    source_rmse_kw = _rmse([r["source_residual_kw"] for r in records])
    observed_peak_kw = max(abs(r["observed_source_kw"]) for r in records) or 1.0
    source_nrmse = source_rmse_kw / observed_peak_kw * 100.0
    phase_rmse = _rmse([r["phase_residual_kw"][phase] for r in records for phase in PHASES])
    voltage_rmse = _rmse([r["voltage_residual_pu"][phase] for r in records for phase in PHASES])
    source_q_rmse = _rmse([r["source_q_residual_kvar"] for r in records])

    baseline_source_rmse = _rmse([r["source_residual_kw"] for r in baseline])
    baseline_source_peak = max(abs(r["observed_source_kw"]) for r in baseline) or 1.0
    baseline_source_nrmse = baseline_source_rmse / baseline_source_peak * 100.0
    baseline_phase_rmse = _rmse([r["phase_residual_kw"][phase] for r in baseline for phase in PHASES])
    baseline_voltage_rmse = _rmse([r["voltage_residual_pu"][phase] for r in baseline for phase in PHASES])

    # Hidden truth is used only from this point onward for synthetic validation.
    truth_hash_after = _truth_hash_now()
    truth_loss_kwh = sum(float(_P1_SESSION["records"][i]["technical_loss_kw"]) * P3_INTERVAL_HOURS for i in range(P3_INTERVALS))
    smart_loss_kwh = sum(r["smart_loss_kw"] * P3_INTERVAL_HOURS for r in records)
    baseline_loss_kwh = session["baseline_loss_kwh"]
    baseline_loss_error_pct = (baseline_loss_kwh - truth_loss_kwh) / truth_loss_kwh * 100.0 if truth_loss_kwh else 0.0
    smart_loss_error_pct = (smart_loss_kwh - truth_loss_kwh) / truth_loss_kwh * 100.0 if truth_loss_kwh else 0.0

    hidden_phase = {c.customer_id: c.phase for c in _P1_SESSION["metadata"]["customers"]}
    baseline_phase_accuracy = sum(1 for cid, phase in _P2_SESSION["phase_assignment"].items() if phase == hidden_phase[cid]) / P2_CUSTOMERS * 100.0
    smart_phase_accuracy = sum(1 for cid, phase in session["assignment"].items() if phase == hidden_phase[cid]) / P2_CUSTOMERS * 100.0

    truth_customer_kwh = float(np.sum(_P1_SESSION["customer_interval_kwh"]))
    smart_customer_kwh = float(np.sum(session["p"]) * P3_INTERVAL_HOURS)
    smart_customer_error = ((smart_customer_kwh - truth_customer_kwh) / truth_customer_kwh * 100.0) if truth_customer_kwh else 0.0

    total_solver_ms = float(sum(session["solve_ms"]))
    min_v = min(min(r["model_voltage_pu"].values()) for r in records)
    max_v = max(max(r["model_voltage_pu"].values()) for r in records)

    known_phase_ids = [int(r["customer_id"]) for r in session["view"] if r["phase_observed"] is not None]
    known_phase_preserved = all(session["assignment"][cid] == session["view"][cid - 1]["phase_observed"] for cid in known_phase_ids)
    known_pf_ids = [int(r["customer_id"]) for r in session["view"] if r["pf_observed"] is not None]
    known_pf_preserved = all(
        abs(session["pf_calibrated"].get(cid, session["view"][cid - 1]["pf_observed"]) - session["view"][cid - 1]["pf_observed"]) < 1e-12
        for cid in known_pf_ids
    )

    checks = [
        {"name": "P1 Ground Truth remained immutable", "pass": truth_hash_after == session["truth_hash_before"], "detail": f"SHA-256 {session['truth_hash_before'][:16]}…"},
        {"name": "verified phase/PF inputs were preserved", "pass": known_phase_preserved and known_pf_preserved, "detail": "only UNKNOWN/ASSUMED states were eligible for calibration"},
        {"name": "96/96 smart power flows converged", "pass": session["converged"] == P3_INTERVALS, "detail": f"{session['converged']} successful runpp_3ph solves"},
        {"name": "hold-out observable objective improved", "pass": val_obj < baseline_val, "detail": f"{baseline_val:.4f} → {val_obj:.4f} ({val_improve:+.1f}%) on 32 unseen intervals"},
        {"name": "aggregate source-P fit improved", "pass": source_nrmse <= baseline_source_nrmse, "detail": f"{baseline_source_nrmse:.2f}% → {source_nrmse:.2f}% NRMSE"},
        {"name": "phase-P fit improved", "pass": phase_rmse <= baseline_phase_rmse, "detail": f"{baseline_phase_rmse:.3f} → {phase_rmse:.3f} kW RMSE"},
        {"name": "validation-only technical-loss estimate improved", "pass": abs(smart_loss_error_pct) < abs(baseline_loss_error_pct), "detail": f"{baseline_loss_error_pct:+.2f}% → {smart_loss_error_pct:+.2f}% vs hidden truth"},
        {"name": "validation-only phase assignment did not regress", "pass": smart_phase_accuracy >= baseline_phase_accuracy, "detail": f"{baseline_phase_accuracy:.1f}% → {smart_phase_accuracy:.1f}%"},
        {"name": "smart LV voltage remains plausible", "pass": min_v > 0.85 and max_v < 1.12, "detail": f"{min_v:.4f}–{max_v:.4f} pu"},
        {"name": "P3 browser runtime budget", "pass": total_solver_ms < 60000.0, "detail": f"{total_solver_ms / 1000.0:.2f} s final smart solver time for 96 intervals"},
    ]

    comparison = {
        "conventional": {
            "loss_kwh": baseline_loss_kwh,
            "loss_error_percent_validation_only": baseline_loss_error_pct,
            "source_nrmse_percent": baseline_source_nrmse,
            "phase_rmse_kw": baseline_phase_rmse,
            "voltage_rmse_pu": baseline_voltage_rmse,
            "phase_accuracy_percent_validation_only": baseline_phase_accuracy,
            "objective_calibration": baseline_cal,
            "objective_validation": baseline_val,
        },
        "smart": {
            "loss_kwh": smart_loss_kwh,
            "loss_error_percent_validation_only": smart_loss_error_pct,
            "source_nrmse_percent": source_nrmse,
            "phase_rmse_kw": phase_rmse,
            "voltage_rmse_pu": voltage_rmse,
            "source_q_rmse_kvar": source_q_rmse,
            "phase_accuracy_percent_validation_only": smart_phase_accuracy,
            "customer_energy_error_percent_validation_only": smart_customer_error,
            "objective_calibration": cal_obj,
            "objective_validation": val_obj,
            "objective_calibration_improvement_percent": cal_improve,
            "objective_validation_improvement_percent": val_improve,
        },
        "truth": {"loss_kwh": truth_loss_kwh},
    }

    series = []
    for i, smart in enumerate(records):
        series.append({
            "index": i,
            "time": smart["time"],
            "truth_loss_kw": float(_P1_SESSION["records"][i]["technical_loss_kw"]),
            "conventional_loss_kw": float(baseline[i]["conventional_loss_kw"]),
            "smart_loss_kw": float(smart["smart_loss_kw"]),
            "observed_source_kw": float(smart["observed_source_kw"]),
            "conventional_source_kw": float(baseline[i]["conventional_source_kw"]),
            "smart_source_kw": float(smart["smart_source_kw"]),
        })

    unresolved = [
        {"parameter": "Suspect customer mapping", "status": "HELD", "reason": "No downstream branch/customer voltage/current measurement to identify branch/pole mapping uniquely."},
        {"parameter": "Individual SR length", "status": "HELD", "reason": "Only aggregate/LV-main measurements are available; per-customer resistance is not identifiable."},
        {"parameter": "Transformer vk/vkr", "status": "HELD", "reason": "P3-v1 avoids fitting weakly identifiable impedance parameters to a single LV-main voltage channel."},
    ]

    gate_pass = all(check["pass"] for check in checks)
    return {
        "gate": {
            "pass": gate_pass,
            "summary": (
                f"P3 passed: physics-informed calibration improves the {session['config']['label']} degraded model on hold-out measurements and hidden-truth validation."
                if gate_pass else
                "P3 did not yet beat every conventional baseline gate; inspect the calibration trace and validation metrics."
            ),
        },
        "preset": session["preset"],
        "preset_label": session["config"]["label"],
        "split": {"calibration_intervals": int(len(P3_CALIBRATION_INDICES)), "validation_intervals": int(len(P3_VALIDATION_INDICES)), "rule": "2 of every 3 intervals calibrate; every third interval is held out"},
        "comparison": comparison,
        "trace": session["trace"],
        "unresolved": unresolved,
        "series": series,
        "checks": checks,
        "runtime": {
            "seed": P3_SEED,
            "solver": "pandapower.runpp_3ph",
            "numba": False,
            "final_solver_total_ms": total_solver_ms,
            "final_solver_average_ms": float(np.mean(session["solve_ms"])),
            "truth_used_by_calibration": False,
            "truth_used_for_final_validation_only": True,
            "smart_engine": "staged deterministic physics-informed calibration v1",
        },
    }


def finish_p3_json():
    return json.dumps(finish_p3(), allow_nan=False)

"""P3 loss-consistency calibration extension.

Loaded after p3_smart_calibration.py.  It overrides two P3 stages:
1) missing-AMI reconstruction jointly estimates missing-load category scales and
   a constant transformer no-load-loss intercept instead of forcing all feeder-P
   mismatch into customer profiles;
2) network-parameter calibration re-estimates Pfe with an independent
   three-phase Pandapower probe using the final smart P/Q/phase state.

Calibration isolation:
- only degraded P2 model inputs + noisy P3 measurements are consumed;
- only the 64 calibration intervals are used for parameter fitting;
- the 32 hold-out intervals remain untouched until finish_p3();
- hidden P1 technical loss/customer/phase/PF truth is never read here.
"""
from __future__ import annotations

import time

import numpy as np
import pandapower as pp

P3_PFE_MIN_KW = 0.45
P3_PFE_MAX_KW = 1.10
P3_PFE_LOW_LOAD_QUANTILE = 0.40
P3_PFE_TRIM_FRACTION = 0.10
P3_MISSING_SCALE_MIN = 0.65
P3_MISSING_SCALE_MAX = 1.35


def _p3_trimmed_mean(values, trim_fraction=P3_PFE_TRIM_FRACTION):
    """Deterministic robust center for bounded meter noise / occasional outliers."""
    arr = np.asarray(values, dtype=float)
    arr = arr[np.isfinite(arr)]
    if not arr.size:
        return 0.0
    arr = np.sort(arr)
    trim = int(np.floor(arr.size * float(trim_fraction)))
    if trim > 0 and arr.size > 2 * trim:
        arr = arr[trim:-trim]
    return float(np.mean(arr))


def p3_stage_load_reconstruction():
    """Jointly reconstruct missing AMI and separate the constant-loss intercept.

    P3-v1 first subtracted a *fixed conventional loss profile* and then fitted
    only missing-load scales.  Any error in transformer core loss therefore had
    no independent degree of freedom and leaked into the reconstructed customer
    profiles.  The resulting customer profiles were then used to estimate Pfe,
    creating a circular bias.

    Here the observable feeder-P equation on calibration intervals is written as:

      P_source ~= P_known + s_res*P_missing_res + s_com*P_missing_com
                  + P_noncore_conventional + Pfe

    The category scales and constant Pfe intercept are solved together.  This is
    still only an initialization; after phase/PF calibration the separate physics
    probe in p3_stage_network_parameters() performs the final Pfe correction.
    """
    session = _P3_SESSION
    if session is None:
        raise RuntimeError("P3 session is not initialized")

    p = session["p"]
    obs = np.array([r["source_kw"] for r in session["observed_system"]], dtype=float)
    idx = np.asarray(P3_CALIBRATION_INDICES, dtype=int)

    prior_pfe = 0.75 * (1.0 + session["config"]["trafo_pfe_error_fraction"])
    conventional_loss = np.array(
        [float(r["conventional_loss_kw"]) for r in session["baseline_records"]],
        dtype=float,
    )
    conventional_noncore = np.maximum(conventional_loss - prior_pfe, 0.0)

    missing_ids = set(_P2_SESSION["selections"]["missing_ami_ids"])
    missing_rows = [cid - 1 for cid in missing_ids]
    known_rows = [i for i in range(P2_CUSTOMERS) if i not in missing_rows]
    known_sum = np.sum(p[known_rows], axis=0) if known_rows else np.zeros(P3_INTERVALS)

    columns = []
    categories = []
    category_rows = {}
    for category in ("residential", "small_commercial"):
        rows = [
            int(r["customer_id"]) - 1
            for r in session["view"]
            if int(r["customer_id"]) in missing_ids and r["category"] == category
        ]
        category_rows[category] = rows
        if rows:
            columns.append(np.sum(p[rows], axis=0))
            categories.append(category)

    old_total = _customer_total(p).copy()
    before_proxy = old_total + conventional_noncore + prior_pfe - obs
    before = _rmse(before_proxy[idx])

    # Fit missing-load multipliers plus an explicit constant core-loss intercept.
    if columns:
        X_columns = [column[idx] for column in columns]
        X_columns.append(np.ones(len(idx), dtype=float))
        X = np.vstack(X_columns).T
        y = (obs - known_sum - conventional_noncore)[idx]
        coeff, *_ = np.linalg.lstsq(X, y, rcond=None)
        raw_scales = coeff[:-1]
        raw_pfe = float(coeff[-1])
    else:
        raw_scales = np.array([], dtype=float)
        raw_pfe = prior_pfe

    for category, raw_scale in zip(categories, raw_scales.tolist()):
        scale = float(np.clip(raw_scale, P3_MISSING_SCALE_MIN, P3_MISSING_SCALE_MAX))
        session["missing_scale"][category] = scale
        for row in category_rows[category]:
            p[row] *= scale

    joint_pfe = float(np.clip(raw_pfe, P3_PFE_MIN_KW, P3_PFE_MAX_KW))
    session["pfe_kw"] = joint_pfe
    session["joint_pfe_kw"] = joint_pfe

    new_total = _customer_total(p)
    after_proxy = new_total + conventional_noncore + joint_pfe - obs
    after = _rmse(after_proxy[idx])

    scales = " · ".join(
        f"{key}×{value:.3f}" for key, value in session["missing_scale"].items()
    )
    item = {
        "stage": "Missing-AMI reconstruction",
        "status": "CALIBRATED",
        "before": before,
        "after": after,
        "unit": "kW source-balance proxy",
        "detail": (
            f"joint bounded fit: {scales} · provisional Pfe {joint_pfe:.3f} kW · "
            "constant loss is separated from customer-profile reconstruction"
        ),
    }
    session["trace"].append(item)
    return item


def _p3_apply_external_interval(net, model_meta, session, interval_index):
    """Apply already-calibrated P/Q/phase state to an independent network."""
    i = int(interval_index)
    for row, record in enumerate(session["view"]):
        cid = int(record["customer_id"])
        load_idx = model_meta["load_index"][cid]
        for phase in ("a", "b", "c"):
            net.asymmetric_load.at[load_idx, f"p_{phase}_mw"] = 0.0
            net.asymmetric_load.at[load_idx, f"q_{phase}_mvar"] = 0.0
        phase = session["assignment"][cid].lower()
        net.asymmetric_load.at[load_idx, f"p_{phase}_mw"] = float(session["p"][row, i]) / 1000.0
        net.asymmetric_load.at[load_idx, f"q_{phase}_mvar"] = float(session["q"][row, i]) / 1000.0


def _p3_pfe_probe(session, pfe_kw, indices):
    """Run independent runpp_3ph probes and return observed-model source-P residual."""
    net, meta = _build_conventional_network(session["view"], session["config"])
    net.trafo.at[net.trafo.index[0], "pfe_kw"] = float(pfe_kw)
    residuals = []
    solve_ms = []

    for n, raw_i in enumerate(indices):
        i = int(raw_i)
        _p3_apply_external_interval(net, meta, session, i)
        t0 = time.perf_counter()
        pp.runpp_3ph(
            net,
            numba=False,
            init="auto" if n == 0 else "results",
            max_iteration=30,
            tolerance_mva=1e-8,
        )
        solve_ms.append((time.perf_counter() - t0) * 1000.0)
        if not bool(net.converged):
            raise RuntimeError(f"P3 Pfe probe interval {i} did not converge")
        model_source_kw, _, _, _ = _source_pq(net)
        observed_source_kw = float(session["observed_system"][i]["source_kw"])
        residuals.append(observed_source_kw - float(model_source_kw))

    return np.asarray(residuals, dtype=float), float(sum(solve_ms))


def p3_stage_network_parameters():
    """Fine-calibrate Pfe using the current smart three-phase electrical state."""
    session = _P3_SESSION
    if session is None:
        raise RuntimeError("P3 session is not initialized")

    prior_pfe = 0.75 * (1.0 + session["config"]["trafo_pfe_error_fraction"])
    start_pfe = float(session.get("joint_pfe_kw", prior_pfe))
    cal = np.asarray(P3_CALIBRATION_INDICES, dtype=int)

    baseline_residual, probe_ms = _p3_pfe_probe(session, start_pfe, cal)
    before_rmse = _rmse(baseline_residual)

    all_delta = _p3_trimmed_mean(baseline_residual)
    observed_cal = np.array(
        [float(session["observed_system"][i]["source_kw"]) for i in cal],
        dtype=float,
    )
    cutoff = float(np.quantile(observed_cal, P3_PFE_LOW_LOAD_QUANTILE))
    low_mask = observed_cal <= cutoff
    low_delta = (
        _p3_trimmed_mean(baseline_residual[low_mask])
        if np.any(low_mask)
        else all_delta
    )

    # Most statistical weight comes from all 64 points.  The low-load term is a
    # small stabilizer against load-dependent copper-loss/model-location error.
    delta = 0.90 * all_delta + 0.10 * low_delta
    candidate = float(np.clip(start_pfe + delta, P3_PFE_MIN_KW, P3_PFE_MAX_KW))

    candidate_residual, verify_ms = _p3_pfe_probe(session, candidate, cal)
    after_rmse = _rmse(candidate_residual)
    accepted = bool(after_rmse + 1e-9 < before_rmse)
    estimate = candidate if accepted else start_pfe
    session["pfe_kw"] = float(estimate)
    session["pfe_calibration"] = {
        "prior_kw": float(prior_pfe),
        "joint_start_kw": float(start_pfe),
        "estimate_kw": float(estimate),
        "candidate_kw": float(candidate),
        "all_interval_delta_kw": float(all_delta),
        "low_load_delta_kw": float(low_delta),
        "calibration_source_rmse_before_kw": float(before_rmse),
        "calibration_source_rmse_after_kw": float(after_rmse if accepted else before_rmse),
        "probe_intervals": int(len(cal)),
        "low_load_intervals": int(np.sum(low_mask)),
        "probe_solver_ms": float(probe_ms + verify_ms),
        "accepted": accepted,
    }

    item = {
        "stage": "Network-parameter calibration",
        "status": "CALIBRATED" if accepted else "HELD",
        "before": float(prior_pfe),
        "after": float(estimate),
        "unit": "transformer Pfe kW",
        "detail": (
            f"joint start {start_pfe:.3f} kW; smart-state physics probe on {len(cal)} calibration intervals: "
            f"source-P RMSE {before_rmse:.3f}→{(after_rmse if accepted else before_rmse):.3f} kW · "
            f"all Δ{all_delta:+.3f} kW · low-load Δ{low_delta:+.3f} kW · "
            "vk/vkr, individual SR length and suspect mapping remain HELD"
        ),
    }
    session["trace"].append(item)
    return item

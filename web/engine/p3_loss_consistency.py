"""P3 loss-consistency calibration extension.

Loaded after p3_smart_calibration.py and deliberately overrides only
p3_stage_network_parameters().  Missing-AMI reconstruction therefore remains the
validated base-P3 implementation.

The transformer no-load loss Pfe is a constant additive active-power term.  For
such an intercept, the least-squares correction is the mean feeder-P residual
across the calibration set.  This extension estimates that correction from an
independent three-phase Pandapower model using the *current* smart P/Q/phase
state, and accepts each update only when a fresh runpp_3ph probe reduces the
calibration source-P RMSE.

Isolation rules:
- consumes only degraded P2 inputs, calibrated P3 states and noisy measurements;
- fits only on the 64 calibration intervals;
- never reads hidden P1 technical loss/customer/phase/PF truth;
- the 32 hold-out intervals remain untouched until finish_p3().
"""
from __future__ import annotations

import time

import numpy as np
import pandapower as pp

P3_PFE_MIN_KW = 0.45
P3_PFE_MAX_KW = 1.10
P3_PFE_MAX_STEP_KW = 0.20
P3_PFE_MAX_ITERATIONS = 3
P3_PFE_LOW_LOAD_QUANTILE = 0.40
P3_PFE_TRIM_FRACTION = 0.10


def _p3_trimmed_mean(values, trim_fraction=P3_PFE_TRIM_FRACTION):
    arr = np.asarray(values, dtype=float)
    arr = arr[np.isfinite(arr)]
    if not arr.size:
        return 0.0
    arr = np.sort(arr)
    trim = int(np.floor(arr.size * float(trim_fraction)))
    if trim > 0 and arr.size > 2 * trim:
        arr = arr[trim:-trim]
    return float(np.mean(arr))


def _p3_apply_external_interval(net, model_meta, session, interval_index):
    """Apply the calibrated P/Q/phase state to an independent network."""
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
    """Return observed-minus-model feeder-P residual from real runpp_3ph solves."""
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
    """Fit Pfe as the least-squares constant intercept of feeder-P residual."""
    session = _P3_SESSION
    if session is None:
        raise RuntimeError("P3 session is not initialized")

    prior_pfe = 0.75 * (1.0 + session["config"]["trafo_pfe_error_fraction"])
    cal = np.asarray(P3_CALIBRATION_INDICES, dtype=int)
    observed_cal = np.asarray(
        [float(session["observed_system"][i]["source_kw"]) for i in cal],
        dtype=float,
    )
    cutoff = float(np.quantile(observed_cal, P3_PFE_LOW_LOAD_QUANTILE))
    low_mask = observed_cal <= cutoff

    current_pfe = float(prior_pfe)
    residual, total_probe_ms = _p3_pfe_probe(session, current_pfe, cal)
    initial_rmse = _rmse(residual)
    current_rmse = initial_rmse
    history = []

    for iteration in range(P3_PFE_MAX_ITERATIONS):
        # For an additive constant, mean(observed-model) is the LS-optimal step.
        raw_mean_delta = float(np.mean(residual))
        bounded_delta = float(np.clip(raw_mean_delta, -P3_PFE_MAX_STEP_KW, P3_PFE_MAX_STEP_KW))
        candidate = float(np.clip(current_pfe + bounded_delta, P3_PFE_MIN_KW, P3_PFE_MAX_KW))

        trimmed_delta = _p3_trimmed_mean(residual)
        median_delta = float(np.median(residual))
        low_delta = float(np.mean(residual[low_mask])) if np.any(low_mask) else raw_mean_delta

        if abs(candidate - current_pfe) < 1e-7:
            history.append({
                "iteration": iteration + 1,
                "pfe_before_kw": current_pfe,
                "candidate_kw": candidate,
                "raw_mean_delta_kw": raw_mean_delta,
                "trimmed_delta_kw": trimmed_delta,
                "median_delta_kw": median_delta,
                "low_load_delta_kw": low_delta,
                "rmse_before_kw": current_rmse,
                "rmse_after_kw": current_rmse,
                "accepted": False,
                "reason": "converged",
            })
            break

        candidate_residual, probe_ms = _p3_pfe_probe(session, candidate, cal)
        total_probe_ms += probe_ms
        candidate_rmse = _rmse(candidate_residual)
        accepted = bool(candidate_rmse + 1e-9 < current_rmse)
        history.append({
            "iteration": iteration + 1,
            "pfe_before_kw": current_pfe,
            "candidate_kw": candidate,
            "raw_mean_delta_kw": raw_mean_delta,
            "trimmed_delta_kw": trimmed_delta,
            "median_delta_kw": median_delta,
            "low_load_delta_kw": low_delta,
            "rmse_before_kw": current_rmse,
            "rmse_after_kw": candidate_rmse,
            "accepted": accepted,
            "reason": "rmse improved" if accepted else "rmse did not improve",
        })
        if not accepted:
            break

        current_pfe = candidate
        current_rmse = candidate_rmse
        residual = candidate_residual
        if abs(raw_mean_delta) < 1e-4:
            break

    session["pfe_kw"] = float(current_pfe)
    final_raw_mean = float(np.mean(residual))
    final_trimmed = _p3_trimmed_mean(residual)
    final_median = float(np.median(residual))
    final_low = float(np.mean(residual[low_mask])) if np.any(low_mask) else final_raw_mean
    session["pfe_calibration"] = {
        "prior_kw": float(prior_pfe),
        "estimate_kw": float(current_pfe),
        "calibration_source_rmse_before_kw": float(initial_rmse),
        "calibration_source_rmse_after_kw": float(current_rmse),
        "final_raw_mean_residual_kw": final_raw_mean,
        "final_trimmed_mean_residual_kw": final_trimmed,
        "final_median_residual_kw": final_median,
        "final_low_load_mean_residual_kw": final_low,
        "probe_intervals": int(len(cal)),
        "low_load_intervals": int(np.sum(low_mask)),
        "probe_solver_ms": float(total_probe_ms),
        "iterations": history,
    }

    accepted_iterations = sum(1 for item in history if item["accepted"])
    first = history[0] if history else None
    diagnostic = (
        f"LS mean Δ{first['raw_mean_delta_kw']:+.3f} · "
        f"trimmed Δ{first['trimmed_delta_kw']:+.3f} · "
        f"median Δ{first['median_delta_kw']:+.3f} · "
        f"low-load Δ{first['low_load_delta_kw']:+.3f}"
        if first else "no correction required"
    )
    item = {
        "stage": "Network-parameter calibration",
        "status": "CALIBRATED" if accepted_iterations else "HELD",
        "before": float(prior_pfe),
        "after": float(current_pfe),
        "unit": "transformer Pfe kW",
        "detail": (
            f"all-interval least-squares intercept; {accepted_iterations} accepted physics iteration(s); "
            f"source-P RMSE {initial_rmse:.3f}→{current_rmse:.3f} kW · {diagnostic} · "
            "vk/vkr, individual SR length and suspect mapping remain HELD"
        ),
    }
    session["trace"].append(item)
    return item

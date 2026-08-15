"""P3 loss-consistency calibration extension.

This module is loaded after p3_smart_calibration.py and intentionally overrides
only p3_stage_network_parameters().  The goal is to keep the successful P/Q/
phase calibration from P3-v1 while preventing transformer no-load loss (Pfe)
from being estimated with a stale conventional-loss decomposition.

Calibration isolation:
- uses only the degraded P2 view, reconstructed P3 states and noisy feeder P;
- uses calibration intervals only (the 32 hold-out intervals stay untouched);
- never reads hidden P1 technical loss, customer truth, phase truth or PF truth.
"""
from __future__ import annotations

import numpy as np
import pandapower as pp

P3_PFE_MIN_KW = 0.45
P3_PFE_MAX_KW = 1.10
P3_PFE_LOW_LOAD_QUANTILE = 0.40
P3_PFE_TRIM_FRACTION = 0.10


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


def _p3_apply_external_interval(net, model_meta, session, interval_index):
    """Apply the already-calibrated P/Q/phase state to an independent network."""
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
    """Run an isolated physics probe and return source-P residuals.

    Residual sign is observed - model, therefore a positive robust center means
    the candidate Pfe should increase, and a negative center means it should
    decrease.  This is an actual runpp_3ph probe, not a fixed loss surrogate.
    """
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
    """Calibrate transformer Pfe against the *current* smart physics state.

    P3-v1 subtracted conventional non-core losses from a smart reconstructed
    customer load.  That mixed two different electrical states and allowed Pfe
    to absorb their mismatch.  Here we first run a separate Pandapower model
    using the already-calibrated P, Q and phase assignment.  Pfe is then the
    single constant intercept fitted to feeder-P residual on calibration data.

    The 32 hold-out intervals are not touched here; finish_p3() remains the
    independent validation gate.
    """
    session = _P3_SESSION
    if session is None:
        raise RuntimeError("P3 session is not initialized")

    baseline_pfe = 0.75 * (1.0 + session["config"]["trafo_pfe_error_fraction"])
    cal = np.asarray(P3_CALIBRATION_INDICES, dtype=int)

    # Probe the complete calibration set with the current smart P/Q/phase state.
    baseline_residual, probe_ms = _p3_pfe_probe(session, baseline_pfe, cal)
    before_rmse = _rmse(baseline_residual)

    # A constant Pfe behaves as the intercept of observed_source - modeled_source.
    # Use a trimmed mean so bounded meter noise averages out without a few large
    # residuals (e.g. unresolved mapping) dominating the estimate.
    all_delta = _p3_trimmed_mean(baseline_residual)

    # Low-load intervals are a diagnostic where I²R uncertainty is naturally
    # weaker.  They are deliberately not a separate truth-like target.
    observed_cal = np.array(
        [float(session["observed_system"][i]["source_kw"]) for i in cal],
        dtype=float,
    )
    cutoff = float(np.quantile(observed_cal, P3_PFE_LOW_LOAD_QUANTILE))
    low_mask = observed_cal <= cutoff
    low_delta = _p3_trimmed_mean(baseline_residual[low_mask]) if np.any(low_mask) else all_delta

    # Prefer the all-interval intercept for statistical precision, but softly
    # anchor it to the low-load intercept so load-dependent copper-loss mismatch
    # is not silently converted into a constant core-loss parameter.
    delta = 0.75 * all_delta + 0.25 * low_delta
    candidate = float(np.clip(baseline_pfe + delta, P3_PFE_MIN_KW, P3_PFE_MAX_KW))

    # Re-probe calibration intervals with the candidate.  Reject the update if
    # the actual three-phase physics fit does not improve; no hidden truth is
    # involved in this decision.
    candidate_residual, verify_ms = _p3_pfe_probe(session, candidate, cal)
    after_rmse = _rmse(candidate_residual)
    accepted = bool(after_rmse + 1e-9 < before_rmse)
    estimate = candidate if accepted else baseline_pfe
    session["pfe_kw"] = float(estimate)
    session["pfe_calibration"] = {
        "baseline_kw": float(baseline_pfe),
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
        "before": float(baseline_pfe),
        "after": float(estimate),
        "unit": "transformer Pfe kW",
        "detail": (
            f"smart-state physics intercept on {len(cal)} calibration intervals: "
            f"source-P RMSE {before_rmse:.3f}→{(after_rmse if accepted else before_rmse):.3f} kW · "
            f"all Δ{all_delta:+.3f} kW · low-load Δ{low_delta:+.3f} kW · "
            "vk/vkr, individual SR length and suspect mapping remain HELD"
        ),
    }
    session["trace"].append(item)
    return item

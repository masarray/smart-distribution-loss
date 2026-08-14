"""P2 — degraded observability + conventional (non-smart) model.

Requires p0b_engine.py and p1_ground_truth.py in the same Pyodide namespace.
P2 NEVER mutates P1 Ground Truth. Truth is used only by the measurement simulator
and final validation metrics; the conventional model is built exclusively from a
derived degraded view.
"""
from __future__ import annotations

import json
import math
import time

import numpy as np
import pandapower as pp

P2_SEED = 61850 + 202
P2_CUSTOMERS = 90
P2_INTERVALS = 96
P2_INTERVAL_HOURS = 0.25

P2_PRESETS = {
    "good": {
        "label": "Good",
        "unknown_phase_fraction": 0.10,
        "missing_ami_fraction": 0.05,
        "unknown_pf_fraction": 0.20,
        "wrong_mapping_fraction": 0.01,
        "timestamp_shift_fraction": 0.02,
        "service_length_error_fraction": 0.05,
        "meter_noise_fraction": 0.002,
        "voltage_noise_fraction": 0.0005,
        "trafo_pfe_error_fraction": 0.04,
        "trafo_vkr_error_fraction": 0.03,
        "trafo_vk_error_fraction": -0.02,
    },
    "typical": {
        "label": "Typical",
        "unknown_phase_fraction": 0.35,
        "missing_ami_fraction": 0.20,
        "unknown_pf_fraction": 0.60,
        "wrong_mapping_fraction": 0.05,
        "timestamp_shift_fraction": 0.10,
        "service_length_error_fraction": 0.15,
        "meter_noise_fraction": 0.005,
        "voltage_noise_fraction": 0.001,
        "trafo_pfe_error_fraction": 0.12,
        "trafo_vkr_error_fraction": 0.08,
        "trafo_vk_error_fraction": -0.05,
    },
    "poor": {
        "label": "Poor",
        "unknown_phase_fraction": 0.60,
        "missing_ami_fraction": 0.40,
        "unknown_pf_fraction": 0.80,
        "wrong_mapping_fraction": 0.10,
        "timestamp_shift_fraction": 0.20,
        "service_length_error_fraction": 0.25,
        "meter_noise_fraction": 0.010,
        "voltage_noise_fraction": 0.002,
        "trafo_pfe_error_fraction": 0.20,
        "trafo_vkr_error_fraction": 0.12,
        "trafo_vk_error_fraction": -0.08,
    },
}

_P2_SESSION = None


def _count_for_fraction(fraction: float, total: int = P2_CUSTOMERS) -> int:
    return int(math.floor(float(fraction) * total + 0.5))


def _choose_ids(rng, fraction: float):
    count = _count_for_fraction(fraction)
    if count <= 0:
        return set()
    chosen = rng.choice(np.arange(1, P2_CUSTOMERS + 1), size=count, replace=False)
    return {int(x) for x in chosen.tolist()}


def _rmse(values):
    array = np.asarray(values, dtype=float)
    array = array[np.isfinite(array)]
    return float(np.sqrt(np.mean(array ** 2))) if array.size else 0.0


def _truth_ready():
    return _P1_SESSION is not None and len(_P1_SESSION.get("records", [])) == P2_INTERVALS


def _truth_hash_now():
    session = _P1_SESSION
    descriptor = _truth_descriptor(session["metadata"], session["p"], session["q"], session["profile_meta"])
    return _hash_truth(descriptor)


def _build_degraded_view(preset: str):
    if not _truth_ready():
        raise RuntimeError("P2 requires a completed 96-interval P1 Ground Truth session")

    key = str(preset or "typical").lower()
    if key not in P2_PRESETS:
        raise ValueError(f"Unknown P2 preset: {preset}")
    cfg = dict(P2_PRESETS[key])
    rng = np.random.default_rng(P2_SEED + {"good": 1, "typical": 2, "poor": 3}[key])
    truth = _P1_SESSION
    customers = truth["metadata"]["customers"]

    unknown_phase_ids = _choose_ids(rng, cfg["unknown_phase_fraction"])
    missing_ami_ids = _choose_ids(rng, cfg["missing_ami_fraction"])
    unknown_pf_ids = _choose_ids(rng, cfg["unknown_pf_fraction"])
    wrong_mapping_ids = sorted(_choose_ids(rng, cfg["wrong_mapping_fraction"]))
    timestamp_shift_ids = _choose_ids(rng, cfg["timestamp_shift_fraction"])

    interval_kwh = np.array(truth["customer_interval_kwh"], dtype=float, copy=True)
    # AMI meter noise is bounded so the configured percentage is interpretable.
    noise = rng.uniform(-cfg["meter_noise_fraction"], cfg["meter_noise_fraction"], interval_kwh.shape)
    interval_kwh *= (1.0 + noise)

    shift_direction = {}
    for customer_id in timestamp_shift_ids:
        row = customer_id - 1
        direction = -1 if rng.random() < 0.5 else 1
        interval_kwh[row] = np.roll(interval_kwh[row], direction)
        shift_direction[customer_id] = direction

    # Wrong mapping is represented as a wrong electrical location for the customer
    # record. Measurement energy remains attached to the customer/meter ID.
    mapped_location = {c.customer_id: (c.branch, c.pole) for c in customers}
    if len(wrong_mapping_ids) >= 2:
        locations = [mapped_location[cid] for cid in wrong_mapping_ids]
        rotated = locations[1:] + locations[:1]
        for cid, location in zip(wrong_mapping_ids, rotated):
            mapped_location[cid] = location

    view_records = []
    for customer in customers:
        cid = customer.customer_id
        branch, pole = mapped_location[cid]
        length_multiplier = 1.0 + rng.uniform(
            -cfg["service_length_error_fraction"],
            cfg["service_length_error_fraction"],
        )
        view_records.append({
            "customer_id": cid,
            "category": customer.category,
            "contracted_kva": float(customer.contracted_kva),
            "model_branch": int(branch),
            "model_pole": int(pole),
            "phase_observed": None if cid in unknown_phase_ids else customer.phase,
            "pf_observed": None if cid in unknown_pf_ids else float(customer.pf),
            "service_length_model_m": float(customer.service_length_m * length_multiplier),
            "ami_available": cid not in missing_ami_ids,
            "timestamp_aligned": cid not in timestamp_shift_ids,
            "mapping_status": "SUSPECT" if cid in wrong_mapping_ids else "KNOWN",
            "phase_status": "UNKNOWN" if cid in unknown_phase_ids else "MEASURED",
            "pf_status": "ASSUMED" if cid in unknown_pf_ids else "DATABASE",
            "service_length_status": "ASSUMED",
        })

    # Remove unavailable AMI only after all measurement-side degradations are applied.
    for cid in missing_ami_ids:
        interval_kwh[cid - 1, :] = np.nan

    # Build conventional active-power profiles using ONLY the degraded view.
    p_est = np.zeros((P2_CUSTOMERS, P2_INTERVALS), dtype=float)
    category_ratio = {}
    for category in ("residential", "small_commercial"):
        usable = [
            r["customer_id"] - 1
            for r in view_records
            if r["category"] == category and r["ami_available"]
        ]
        if usable:
            ratios = []
            for row in usable:
                kva = max(view_records[row]["contracted_kva"], 0.1)
                ratios.append((interval_kwh[row] / P2_INTERVAL_HOURS) / kva)
            category_ratio[category] = np.nanmedian(np.vstack(ratios), axis=0)
        else:
            # Defensive fallback; normal presets always retain peers in both groups.
            category_ratio[category] = np.full(P2_INTERVALS, 0.25, dtype=float)

    for row, record in enumerate(view_records):
        if record["ami_available"]:
            p_est[row] = interval_kwh[row] / P2_INTERVAL_HOURS
        else:
            p_est[row] = category_ratio[record["category"]] * record["contracted_kva"]
        p_est[row] = np.clip(p_est[row], 0.0, None)

    # Non-smart phase completion: preserve known phases and greedily put each unknown
    # customer on the currently lightest estimated phase in its modeled branch.
    assigned_phase = {}
    branch_phase_kw = {
        branch: {phase: 0.0 for phase in PHASES}
        for branch in range(3)
    }
    mean_kw = np.mean(p_est, axis=1)
    for row, record in enumerate(view_records):
        if record["phase_observed"] is not None:
            phase = record["phase_observed"]
            assigned_phase[record["customer_id"]] = phase
            branch_phase_kw[record["model_branch"]][phase] += float(mean_kw[row])

    for row, record in enumerate(view_records):
        if record["phase_observed"] is None:
            branch = record["model_branch"]
            phase = min(PHASES, key=lambda p: branch_phase_kw[branch][p])
            assigned_phase[record["customer_id"]] = phase
            branch_phase_kw[branch][phase] += float(mean_kw[row])

    q_est = np.zeros_like(p_est)
    pf_est = {}
    for row, record in enumerate(view_records):
        if record["pf_observed"] is not None:
            pf = float(record["pf_observed"])
        else:
            pf = 0.92 if record["category"] == "residential" else 0.90
        pf = float(np.clip(pf, 0.80, 1.0))
        pf_est[record["customer_id"]] = pf
        q_est[row] = p_est[row] * math.tan(math.acos(pf))

    # Degraded feeder/LV measurements used by the conventional residual calculation.
    measurement_rng = np.random.default_rng(P2_SEED + 900 + {"good": 1, "typical": 2, "poor": 3}[key])
    observed_system = []
    for record in truth["records"]:
        p_noise = 1.0 + measurement_rng.uniform(-cfg["meter_noise_fraction"], cfg["meter_noise_fraction"])
        phase_noise = {
            phase: 1.0 + measurement_rng.uniform(-cfg["meter_noise_fraction"], cfg["meter_noise_fraction"])
            for phase in PHASES
        }
        voltage_noise = {
            phase: 1.0 + measurement_rng.uniform(-cfg["voltage_noise_fraction"], cfg["voltage_noise_fraction"])
            for phase in PHASES
        }
        observed_system.append({
            "source_kw": record["source_kw"] * p_noise,
            "source_phase_kw": {
                phase: record["source_phase_kw"][phase] * phase_noise[phase]
                for phase in PHASES
            },
            "lv_voltage_pu": {
                phase: record["lv_voltage_pu"][phase] * voltage_noise[phase]
                for phase in PHASES
            },
        })

    public_view = []
    for record in view_records:
        cid = record["customer_id"]
        public_view.append({
            **record,
            "assigned_phase": assigned_phase[cid],
            "pf_model": pf_est[cid],
            "ami_status": "MISSING_IMPUTED" if not record["ami_available"] else "MEASURED",
            "timestamp_status": "SHIFTED" if not record["timestamp_aligned"] else "ALIGNED",
        })

    selections = {
        "unknown_phase_ids": sorted(unknown_phase_ids),
        "missing_ami_ids": sorted(missing_ami_ids),
        "unknown_pf_ids": sorted(unknown_pf_ids),
        "wrong_mapping_ids": wrong_mapping_ids,
        "timestamp_shift_ids": sorted(timestamp_shift_ids),
    }
    return key, cfg, public_view, p_est, q_est, observed_system, selections, shift_direction


def _build_conventional_network(view_records, cfg):
    net = pp.create_empty_network(sn_mva=1.0)
    grid_bus = pp.create_bus(net, vn_kv=20.0, name="GRID 20 kV")
    trafo_hv = pp.create_bus(net, vn_kv=20.0, name="GD-01 HV")
    lv_main = pp.create_bus(net, vn_kv=0.4, name="GD-01 LV MAIN")

    pp.create_ext_grid(
        net,
        bus=grid_bus,
        vm_pu=1.0,
        s_sc_max_mva=1000.0,
        rx_max=0.1,
        r0x0_max=0.1,
        x0x_max=1.0,
        name="GRID",
    )
    _create_line(net, grid_bus, trafo_hv, 0.25, "mv", "FEEDER-TM")

    pfe = 0.75 * (1.0 + cfg["trafo_pfe_error_fraction"])
    vkr = 1.10 * (1.0 + cfg["trafo_vkr_error_fraction"])
    vk = 4.0 * (1.0 + cfg["trafo_vk_error_fraction"])
    pp.create_transformer_from_parameters(
        net,
        hv_bus=trafo_hv,
        lv_bus=lv_main,
        sn_mva=0.4,
        vn_hv_kv=20.0,
        vn_lv_kv=0.4,
        vkr_percent=vkr,
        vk_percent=vk,
        vk0_percent=vk,
        vkr0_percent=vkr,
        mag0_percent=100.0,
        mag0_rx=0.0,
        pfe_kw=pfe,
        i0_percent=0.25,
        vector_group="Dyn",
        shift_degree=150,
        si0_hv_partial=0.9,
        name="TR-GD01 400 kVA · CONVENTIONAL",
    )

    pole_buses = {}
    for branch in range(3):
        previous = lv_main
        for pole in range(10):
            bus = pp.create_bus(net, vn_kv=0.4, name=f"JTR-{branch + 1:02d}-P{pole + 1:02d}")
            segment_m = 32.0 + branch * 4.0 + (pole % 3) * 6.0
            _create_line(net, previous, bus, segment_m / 1000.0, "jtr", f"JTR-{branch + 1:02d}-SEG-{pole + 1:02d}")
            pole_buses[(branch, pole)] = bus
            previous = bus

    load_index = {}
    for record in view_records:
        cid = int(record["customer_id"])
        parent = pole_buses[(int(record["model_branch"]), int(record["model_pole"]))]
        customer_bus = pp.create_bus(net, vn_kv=0.4, name=f"MODEL-CUST-{cid:03d}")
        _create_line(
            net,
            parent,
            customer_bus,
            float(record["service_length_model_m"]) / 1000.0,
            "service",
            f"SR-{cid:03d}",
        )
        idx = pp.create_asymmetric_load(
            net,
            customer_bus,
            p_a_mw=0.0,
            q_a_mvar=0.0,
            p_b_mw=0.0,
            q_b_mvar=0.0,
            p_c_mw=0.0,
            q_c_mvar=0.0,
            type="wye",
            name=f"MODEL-LOAD-{cid:03d}",
        )
        load_index[cid] = int(idx)

    return net, {"lv_main": int(lv_main), "load_index": load_index}


def start_p2_session(preset="typical"):
    global _P2_SESSION
    if not _truth_ready():
        raise RuntimeError("P1 Ground Truth must be complete before P2")

    started = time.perf_counter()
    truth_hash_before = _truth_hash_now()
    key, cfg, view, p_est, q_est, observed_system, selections, shift_direction = _build_degraded_view(preset)
    net, model_meta = _build_conventional_network(view, cfg)

    phase_assignment = {int(r["customer_id"]): r["assigned_phase"] for r in view}
    _P2_SESSION = {
        "preset": key,
        "config": cfg,
        "view": view,
        "p_est": p_est,
        "q_est": q_est,
        "observed_system": observed_system,
        "selections": selections,
        "shift_direction": shift_direction,
        "net": net,
        "model_meta": model_meta,
        "phase_assignment": phase_assignment,
        "truth_hash_before": truth_hash_before,
        "records": [],
        "solve_ms": [],
        "converged": 0,
        "build_ms": (time.perf_counter() - started) * 1000.0,
    }

    counts = {
        "unknown_phase": len(selections["unknown_phase_ids"]),
        "missing_ami": len(selections["missing_ami_ids"]),
        "unknown_pf": len(selections["unknown_pf_ids"]),
        "wrong_mapping": len(selections["wrong_mapping_ids"]),
        "timestamp_shift": len(selections["timestamp_shift_ids"]),
    }
    return {
        "preset": key,
        "preset_label": cfg["label"],
        "customers": P2_CUSTOMERS,
        "intervals": P2_INTERVALS,
        "counts": counts,
        "truth_hash_short": truth_hash_before[:16],
        "build_ms": _P2_SESSION["build_ms"],
    }


def start_p2_session_json(preset="typical"):
    return json.dumps(start_p2_session(preset), allow_nan=False)


def _apply_p2_interval(session, interval_index):
    net = session["net"]
    for row, record in enumerate(session["view"]):
        cid = int(record["customer_id"])
        load_idx = session["model_meta"]["load_index"][cid]
        for phase in ("a", "b", "c"):
            net.asymmetric_load.at[load_idx, f"p_{phase}_mw"] = 0.0
            net.asymmetric_load.at[load_idx, f"q_{phase}_mvar"] = 0.0
        phase = session["phase_assignment"][cid].lower()
        net.asymmetric_load.at[load_idx, f"p_{phase}_mw"] = float(session["p_est"][row, interval_index]) / 1000.0
        net.asymmetric_load.at[load_idx, f"q_{phase}_mvar"] = float(session["q_est"][row, interval_index]) / 1000.0


def run_p2_step(interval_index):
    if _P2_SESSION is None:
        raise RuntimeError("P2 session is not initialized")
    i = int(interval_index)
    if not 0 <= i < P2_INTERVALS:
        raise ValueError("interval_index outside 0..95")

    session = _P2_SESSION
    net = session["net"]
    _apply_p2_interval(session, i)

    t0 = time.perf_counter()
    pp.runpp_3ph(
        net,
        numba=False,
        init="results" if i > 0 else "auto",
        max_iteration=30,
        tolerance_mva=1e-8,
    )
    solve_ms = (time.perf_counter() - t0) * 1000.0
    session["solve_ms"].append(solve_ms)
    if not bool(net.converged):
        raise RuntimeError(f"P2 conventional interval {i} did not converge")
    session["converged"] += 1

    model_source_kw, _, model_phase_kw, _ = _source_pq(net)
    line_loss = _line_loss_breakdown_kw(net)
    trafo_row = net.res_trafo_3ph.iloc[0]
    trafo_loss_kw = _phase_endpoint_loss_kw(trafo_row, "hv", "lv")
    model_loss_kw = line_loss["mv"] + line_loss["jtr"] + line_loss["service"] + trafo_loss_kw

    lv = net.res_bus_3ph.loc[session["model_meta"]["lv_main"]]
    model_v = {phase.upper(): _f(lv.get(f"vm_{phase}_pu")) for phase in ("a", "b", "c")}
    obs = session["observed_system"][i]
    truth_record = _P1_SESSION["records"][i]

    source_residual = model_source_kw - obs["source_kw"]
    phase_residual = {
        phase: model_phase_kw[phase] - obs["source_phase_kw"][phase]
        for phase in PHASES
    }
    voltage_residual = {
        phase: model_v[phase] - obs["lv_voltage_pu"][phase]
        for phase in PHASES
    }

    record = {
        "index": i,
        "time": truth_record["time"],
        "truth_source_kw": truth_record["source_kw"],
        "observed_source_kw": obs["source_kw"],
        "conventional_source_kw": model_source_kw,
        "truth_loss_kw": truth_record["technical_loss_kw"],
        "conventional_loss_kw": model_loss_kw,
        "source_residual_kw": source_residual,
        "phase_residual_kw": phase_residual,
        "voltage_residual_pu": voltage_residual,
        "model_voltage_pu": model_v,
        "solve_ms": solve_ms,
    }
    session["records"].append(record)
    return record


def run_p2_step_json(interval_index):
    return json.dumps(run_p2_step(interval_index), allow_nan=False)


def finish_p2():
    if _P2_SESSION is None:
        raise RuntimeError("P2 session is not initialized")
    session = _P2_SESSION
    records = session["records"]
    if len(records) != P2_INTERVALS:
        raise RuntimeError(f"P2 expected {P2_INTERVALS} intervals, found {len(records)}")

    truth_hash_after = _truth_hash_now()
    truth_loss_kwh = sum(r["truth_loss_kw"] * P2_INTERVAL_HOURS for r in records)
    conventional_loss_kwh = sum(r["conventional_loss_kw"] * P2_INTERVAL_HOURS for r in records)
    loss_error_kwh = conventional_loss_kwh - truth_loss_kwh
    loss_error_percent = (loss_error_kwh / truth_loss_kwh * 100.0) if truth_loss_kwh else 0.0

    source_rmse_kw = _rmse([r["source_residual_kw"] for r in records])
    observed_peak_kw = max(abs(r["observed_source_kw"]) for r in records) or 1.0
    source_nrmse_percent = source_rmse_kw / observed_peak_kw * 100.0
    phase_rmse_kw = _rmse([
        residual
        for r in records
        for residual in r["phase_residual_kw"].values()
    ])
    voltage_rmse_pu = _rmse([
        residual
        for r in records
        for residual in r["voltage_residual_pu"].values()
    ])
    loss_profile_rmse_kw = _rmse([
        r["conventional_loss_kw"] - r["truth_loss_kw"]
        for r in records
    ])

    hidden_truth_phase = {c.customer_id: c.phase for c in _P1_SESSION["metadata"]["customers"]}
    phase_correct = sum(
        1 for cid, phase in session["phase_assignment"].items()
        if phase == hidden_truth_phase[cid]
    )
    phase_accuracy_percent = phase_correct / P2_CUSTOMERS * 100.0

    truth_customer_kwh = float(np.sum(_P1_SESSION["customer_interval_kwh"]))
    conventional_customer_kwh = float(np.sum(session["p_est"]) * P2_INTERVAL_HOURS)
    customer_energy_error_percent = (
        (conventional_customer_kwh - truth_customer_kwh) / truth_customer_kwh * 100.0
        if truth_customer_kwh else 0.0
    )

    counts = {
        "unknown_phase": len(session["selections"]["unknown_phase_ids"]),
        "missing_ami": len(session["selections"]["missing_ami_ids"]),
        "unknown_pf": len(session["selections"]["unknown_pf_ids"]),
        "wrong_mapping": len(session["selections"]["wrong_mapping_ids"]),
        "timestamp_shift": len(session["selections"]["timestamp_shift_ids"]),
    }
    cfg = session["config"]
    expected = {
        "unknown_phase": _count_for_fraction(cfg["unknown_phase_fraction"]),
        "missing_ami": _count_for_fraction(cfg["missing_ami_fraction"]),
        "unknown_pf": _count_for_fraction(cfg["unknown_pf_fraction"]),
        "wrong_mapping": _count_for_fraction(cfg["wrong_mapping_fraction"]),
        "timestamp_shift": _count_for_fraction(cfg["timestamp_shift_fraction"]),
    }

    allowed_keys = {
        "customer_id", "category", "contracted_kva", "model_branch", "model_pole",
        "phase_observed", "pf_observed", "service_length_model_m", "ami_available",
        "timestamp_aligned", "mapping_status", "phase_status", "pf_status",
        "service_length_status", "assigned_phase", "pf_model", "ami_status",
        "timestamp_status",
    }
    no_truth_leak = all(set(record.keys()).issubset(allowed_keys) for record in session["view"])
    total_solver_ms = float(sum(session["solve_ms"]))
    min_model_v = min(min(r["model_voltage_pu"].values()) for r in records)
    max_model_v = max(max(r["model_voltage_pu"].values()) for r in records)
    measurable_divergence = abs(loss_error_percent) > 0.05 or source_nrmse_percent > 0.05 or phase_rmse_kw > 0.05

    checks = [
        {
            "name": "P1 Ground Truth remained immutable",
            "pass": truth_hash_after == session["truth_hash_before"],
            "detail": f"SHA-256 {session['truth_hash_before'][:16]}…",
        },
        {
            "name": "configured degradation counts applied",
            "pass": counts == expected,
            "detail": f"actual {counts}",
        },
        {
            "name": "conventional view contains no hidden-truth fields",
            "pass": no_truth_leak,
            "detail": "model input schema exposes degraded/assumed fields only",
        },
        {
            "name": "96/96 conventional power flows converged",
            "pass": session["converged"] == P2_INTERVALS,
            "detail": f"{session['converged']} successful runpp_3ph solves",
        },
        {
            "name": "degradation produces measurable model divergence",
            "pass": measurable_divergence,
            "detail": f"loss error {loss_error_percent:+.2f}% · source NRMSE {source_nrmse_percent:.2f}%",
        },
        {
            "name": "conventional customer energy remains plausible",
            "pass": abs(customer_energy_error_percent) < 20.0,
            "detail": f"daily customer-energy error {customer_energy_error_percent:+.2f}%",
        },
        {
            "name": "conventional LV voltage remains numerically plausible",
            "pass": min_model_v > 0.85 and max_model_v < 1.12,
            "detail": f"{min_model_v:.4f}–{max_model_v:.4f} pu",
        },
        {
            "name": "P2 browser runtime budget",
            "pass": total_solver_ms < 60000.0,
            "detail": f"{total_solver_ms / 1000.0:.2f} s solver time for 96 conventional intervals",
        },
    ]

    degradation_inventory = [
        {
            "item": "Unknown customer phase",
            "target": f"{cfg['unknown_phase_fraction'] * 100:.0f}%",
            "actual": f"{counts['unknown_phase']}/{P2_CUSTOMERS}",
            "model_action": "greedy branch phase balancing",
        },
        {
            "item": "Missing customer AMI",
            "target": f"{cfg['missing_ami_fraction'] * 100:.0f}%",
            "actual": f"{counts['missing_ami']}/{P2_CUSTOMERS}",
            "model_action": "peer-category profile imputation",
        },
        {
            "item": "Unknown PF",
            "target": f"{cfg['unknown_pf_fraction'] * 100:.0f}%",
            "actual": f"{counts['unknown_pf']}/{P2_CUSTOMERS}",
            "model_action": "0.92 residential / 0.90 commercial",
        },
        {
            "item": "Wrong customer mapping",
            "target": f"{cfg['wrong_mapping_fraction'] * 100:.0f}%",
            "actual": f"{counts['wrong_mapping']}/{P2_CUSTOMERS}",
            "model_action": "incorrect branch/pole association retained",
        },
        {
            "item": "Timestamp mismatch",
            "target": f"{cfg['timestamp_shift_fraction'] * 100:.0f}%",
            "actual": f"{counts['timestamp_shift']}/{P2_CUSTOMERS}",
            "model_action": "±1 interval shift retained",
        },
        {
            "item": "Service length uncertainty",
            "target": f"±{cfg['service_length_error_fraction'] * 100:.0f}%",
            "actual": "90 assumed lengths",
            "model_action": "perturbed SR length",
        },
        {
            "item": "Meter noise",
            "target": f"±{cfg['meter_noise_fraction'] * 100:.1f}%",
            "actual": "AMI + feeder P/phase P",
            "model_action": "measurement retained as observed",
        },
        {
            "item": "Transformer parameter uncertainty",
            "target": "assumed",
            "actual": f"Pfe {cfg['trafo_pfe_error_fraction']*100:+.0f}% · vkr {cfg['trafo_vkr_error_fraction']*100:+.0f}% · vk {cfg['trafo_vk_error_fraction']*100:+.0f}%",
            "model_action": "database/assumed transformer model",
        },
    ]

    sample_view = []
    for record in session["view"][:12]:
        sample_view.append({
            "customer_id": record["customer_id"],
            "branch": record["model_branch"] + 1,
            "pole": record["model_pole"] + 1,
            "phase": record["phase_observed"] or f"UNKNOWN → {record['assigned_phase']}",
            "pf": round(record["pf_observed"], 4) if record["pf_observed"] is not None else f"ASSUMED {record['pf_model']:.2f}",
            "ami": record["ami_status"],
            "mapping": record["mapping_status"],
            "timestamp": record["timestamp_status"],
        })

    summary = {
        "truth_loss_kwh": truth_loss_kwh,
        "conventional_loss_kwh": conventional_loss_kwh,
        "loss_error_kwh": loss_error_kwh,
        "loss_error_percent": loss_error_percent,
        "loss_profile_rmse_kw": loss_profile_rmse_kw,
        "source_rmse_kw": source_rmse_kw,
        "source_nrmse_percent": source_nrmse_percent,
        "phase_rmse_kw": phase_rmse_kw,
        "voltage_rmse_pu": voltage_rmse_pu,
        "truth_customer_energy_kwh": truth_customer_kwh,
        "conventional_customer_energy_kwh": conventional_customer_kwh,
        "customer_energy_error_percent": customer_energy_error_percent,
        "phase_assignment_accuracy_percent_validation_only": phase_accuracy_percent,
        "min_model_voltage_pu": min_model_v,
        "max_model_voltage_pu": max_model_v,
        "solver_total_ms": total_solver_ms,
        "solver_average_ms": float(np.mean(session["solve_ms"])),
        "solver_max_ms": float(max(session["solve_ms"])),
    }

    gate_pass = all(check["pass"] for check in checks)
    return {
        "gate": {
            "pass": gate_pass,
            "summary": (
                f"P2 passed: {session['config']['label']} data degradation creates a measurable conventional-model error without mutating Ground Truth."
                if gate_pass else
                "P2 failed one or more degradation, isolation, convergence, or plausibility checks."
            ),
        },
        "preset": session["preset"],
        "preset_label": session["config"]["label"],
        "truth_hash": session["truth_hash_before"],
        "truth_hash_short": session["truth_hash_before"][:16],
        "counts": counts,
        "coverage": {
            "phase_known_percent": (P2_CUSTOMERS - counts["unknown_phase"]) / P2_CUSTOMERS * 100.0,
            "ami_available_percent": (P2_CUSTOMERS - counts["missing_ami"]) / P2_CUSTOMERS * 100.0,
            "pf_known_percent": (P2_CUSTOMERS - counts["unknown_pf"]) / P2_CUSTOMERS * 100.0,
            "mapping_known_percent": (P2_CUSTOMERS - counts["wrong_mapping"]) / P2_CUSTOMERS * 100.0,
            "timestamp_aligned_percent": (P2_CUSTOMERS - counts["timestamp_shift"]) / P2_CUSTOMERS * 100.0,
        },
        "summary": summary,
        "degradation_inventory": degradation_inventory,
        "sample_conventional_view": sample_view,
        "series": records,
        "checks": checks,
        "runtime": {
            "seed": P2_SEED,
            "solver": "pandapower.runpp_3ph",
            "numba": False,
            "build_ms": session["build_ms"],
            "smart_calibration": False,
            "truth_used_by_conventional_model": False,
        },
    }


def finish_p2_json():
    return json.dumps(finish_p2(), allow_nan=False)

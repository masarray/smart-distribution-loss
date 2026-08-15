"""P1 — immutable synthetic Ground Truth + 24 h / 15-minute measurements.

Requires p0b_engine.py to be loaded into the same Python global namespace first.
The browser worker does that deliberately so P1 reuses the already validated
90-customer topology rather than creating a second divergent network model.
"""
from __future__ import annotations

import hashlib
import json
import math
import time

import numpy as np
import pandapower as pp

P1_INTERVAL_MINUTES = 15
P1_INTERVAL_HOURS = P1_INTERVAL_MINUTES / 60.0
P1_INTERVALS = 96
P1_SEED = 61850
P1_CUSTOMERS = 90

_P1_SESSION = None


def _profile_base(category: str, hour: float) -> float:
    """Deterministic normalized daily shape in the range ~0.1..1.0."""
    def gauss(center, width, amplitude):
        distance = min(abs(hour - center), 24.0 - abs(hour - center))
        return amplitude * math.exp(-0.5 * (distance / width) ** 2)

    if category == "small_commercial":
        # Shops / small offices: low overnight, ramp in the morning, broad daytime use.
        morning = gauss(9.0, 1.9, 0.38)
        midday = gauss(13.0, 3.2, 0.54)
        afternoon = gauss(17.0, 2.0, 0.28)
        return min(1.0, 0.12 + morning + midday + afternoon)

    # Residential: breakfast activity plus a dominant evening peak.
    morning = gauss(6.5, 1.25, 0.30)
    midday = gauss(12.5, 2.4, 0.12)
    evening = gauss(19.25, 2.0, 0.69)
    return min(1.0, 0.18 + morning + midday + evening)


def _time_label(index: int) -> str:
    total_minutes = int(index) * P1_INTERVAL_MINUTES
    return f"{total_minutes // 60:02d}:{total_minutes % 60:02d}"


def _line_loss_breakdown_kw(net):
    result = {"mv": 0.0, "jtr": 0.0, "service": 0.0}
    for idx, row in net.res_line_3ph.iterrows():
        loss_kw = _phase_endpoint_loss_kw(row, "from", "to")
        name = str(net.line.at[idx, "name"] or "")
        if name.startswith("FEEDER-TM"):
            result["mv"] += loss_kw
        elif name.startswith("JTR-"):
            result["jtr"] += loss_kw
        elif name.startswith("SR-"):
            result["service"] += loss_kw
        else:
            result["jtr"] += loss_kw
    return result


def _source_pq(net):
    p_kw = q_kvar = 0.0
    phase_p = {}
    phase_q = {}
    ext = net.res_ext_grid_3ph.iloc[0]
    for phase in ("a", "b", "c"):
        p = _f(ext.get(f"p_{phase}_mw")) * 1000.0
        q = _f(ext.get(f"q_{phase}_mvar")) * 1000.0
        phase_p[phase.upper()] = p
        phase_q[phase.upper()] = q
        p_kw += p
        q_kvar += q
    return p_kw, q_kvar, phase_p, phase_q


def _build_truth_profiles(metadata):
    customers = metadata["customers"]
    rng = np.random.default_rng(P1_SEED + 101)
    p = np.zeros((len(customers), P1_INTERVALS), dtype=float)
    q = np.zeros_like(p)
    profile_meta = []

    for row, customer in enumerate(customers):
        shift_quarters = int(rng.integers(-2, 3))
        diversity = float(rng.uniform(0.82, 1.00))
        micro_phase = float(rng.uniform(0.0, 2.0 * math.pi))
        micro_amp = float(rng.uniform(0.010, 0.035))

        for t in range(P1_INTERVALS):
            shifted = (t + shift_quarters) % P1_INTERVALS
            hour = shifted * P1_INTERVAL_HOURS
            base = _profile_base(customer.category, hour)
            micro = 1.0 + micro_amp * math.sin((2.0 * math.pi * t / P1_INTERVALS) + micro_phase)
            multiplier = float(np.clip(base * diversity * micro, 0.08, 1.0))
            p_kw = customer.demand_kw * multiplier
            q_kvar = p_kw * math.tan(math.acos(customer.pf))
            p[row, t] = p_kw
            q[row, t] = q_kvar

        profile_meta.append({
            "customer_id": customer.customer_id,
            "shift_quarters": shift_quarters,
            "diversity": diversity,
            "micro_amplitude": micro_amp,
        })

    # Ground Truth arrays must never be mutated by later model/degradation logic.
    p.setflags(write=False)
    q.setflags(write=False)
    return p, q, profile_meta


def _truth_descriptor(metadata, p_matrix, q_matrix, profile_meta):
    customers = []
    for customer in metadata["customers"]:
        customers.append({
            "customer_id": customer.customer_id,
            "branch": customer.branch,
            "pole": customer.pole,
            "phase": customer.phase,
            "category": customer.category,
            "contracted_kva": round(customer.contracted_kva, 8),
            "reference_peak_kw": round(customer.demand_kw, 8),
            "pf": round(customer.pf, 8),
            "service_length_m": round(customer.service_length_m, 8),
        })
    return {
        "schema": "smart-distribution-loss-ground-truth-v1",
        "seed": P1_SEED,
        "interval_minutes": P1_INTERVAL_MINUTES,
        "intervals": P1_INTERVALS,
        "topology": "20kV-grid>250m-MV>400kVA-Dyn>3-JTR>90-customers",
        "customers": customers,
        "profile_meta": profile_meta,
        "p_kw": np.round(p_matrix, 8).tolist(),
        "q_kvar": np.round(q_matrix, 8).tolist(),
    }


def _hash_truth(descriptor) -> str:
    canonical = json.dumps(descriptor, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def start_p1_session():
    global _P1_SESSION
    started = time.perf_counter()
    net, metadata = build_distribution_network(P1_CUSTOMERS)
    p_matrix, q_matrix, profile_meta = _build_truth_profiles(metadata)
    descriptor = _truth_descriptor(metadata, p_matrix, q_matrix, profile_meta)
    truth_hash = _hash_truth(descriptor)

    load_index_by_customer = {}
    for idx, row in net.asymmetric_load.iterrows():
        name = str(row.get("name", ""))
        if name.startswith("LOAD-"):
            load_index_by_customer[int(name.split("-")[1])] = int(idx)

    if len(load_index_by_customer) != P1_CUSTOMERS:
        raise RuntimeError(f"Expected {P1_CUSTOMERS} load indices, found {len(load_index_by_customer)}")

    _P1_SESSION = {
        "net": net,
        "metadata": metadata,
        "p": p_matrix,
        "q": q_matrix,
        "profile_meta": profile_meta,
        "descriptor": descriptor,
        "truth_hash": truth_hash,
        "load_index_by_customer": load_index_by_customer,
        "records": [],
        "solve_ms": [],
        "converged": 0,
        "customer_interval_kwh": np.zeros((P1_CUSTOMERS, P1_INTERVALS), dtype=float),
        "build_ms": (time.perf_counter() - started) * 1000.0,
    }

    return {
        "truth_hash": truth_hash,
        "truth_hash_short": truth_hash[:16],
        "customers": P1_CUSTOMERS,
        "intervals": P1_INTERVALS,
        "interval_minutes": P1_INTERVAL_MINUTES,
        "build_ms": _P1_SESSION["build_ms"],
        "seed": P1_SEED,
    }


def start_p1_session_json() -> str:
    return json.dumps(start_p1_session(), allow_nan=False)


def _apply_interval(session, interval_index: int):
    net = session["net"]
    customers = session["metadata"]["customers"]
    p_matrix = session["p"]
    q_matrix = session["q"]

    for row, customer in enumerate(customers):
        load_idx = session["load_index_by_customer"][customer.customer_id]
        phase = customer.phase.lower()
        p_kw = float(p_matrix[row, interval_index])
        q_kvar = float(q_matrix[row, interval_index])
        net.asymmetric_load.at[load_idx, f"p_{phase}_mw"] = p_kw / 1000.0
        net.asymmetric_load.at[load_idx, f"q_{phase}_mvar"] = q_kvar / 1000.0
        session["customer_interval_kwh"][row, interval_index] = p_kw * P1_INTERVAL_HOURS


def run_p1_step(interval_index: int):
    if _P1_SESSION is None:
        raise RuntimeError("P1 session is not initialized")
    if not 0 <= int(interval_index) < P1_INTERVALS:
        raise ValueError("interval_index outside 0..95")

    session = _P1_SESSION
    net = session["net"]
    metadata = session["metadata"]
    i = int(interval_index)
    _apply_interval(session, i)

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
        raise RuntimeError(f"P1 interval {_time_label(i)} did not converge")
    session["converged"] += 1

    customer_p_kw = float(np.sum(session["p"][:, i]))
    customer_q_kvar = float(np.sum(session["q"][:, i]))
    source_kw, source_kvar, source_phase_kw, source_phase_kvar = _source_pq(net)

    line_loss = _line_loss_breakdown_kw(net)
    trafo_row = net.res_trafo_3ph.iloc[0]
    trafo_loss_kw = _phase_endpoint_loss_kw(trafo_row, "hv", "lv")
    component_loss_kw = line_loss["mv"] + line_loss["jtr"] + line_loss["service"] + trafo_loss_kw
    balance_loss_kw = source_kw - customer_p_kw
    accounting_residual_kw = balance_loss_kw - component_loss_kw

    lv = net.res_bus_3ph.loc[metadata["lv_main"]]
    vm = {phase.upper(): _f(lv.get(f"vm_{phase}_pu")) for phase in ("a", "b", "c")}
    ia = {phase.upper(): _f(trafo_row.get(f"i_{phase}_lv_ka")) * 1000.0 for phase in ("a", "b", "c")}

    lv_rows = net.res_bus_3ph.loc[net.bus.vn_kv == 0.4]
    vm_all = lv_rows[["vm_a_pu", "vm_b_pu", "vm_c_pu"]].to_numpy(dtype=float)
    finite_vm = vm_all[np.isfinite(vm_all)]
    min_v = float(np.min(finite_vm)) if finite_vm.size else 0.0
    max_v = float(np.max(finite_vm)) if finite_vm.size else 0.0
    max_unbalance = float(np.nanmax(lv_rows["unbalance_percent"].to_numpy(dtype=float)))
    max_line_loading = float(np.nanmax(net.res_line_3ph["loading_percent"].to_numpy(dtype=float)))
    trafo_loading = _f(trafo_row.get("loading_percent"))

    record = {
        "index": i,
        "time": _time_label(i),
        "source_kw": source_kw,
        "source_kvar": source_kvar,
        "customer_kw": customer_p_kw,
        "customer_kvar": customer_q_kvar,
        "technical_loss_kw": component_loss_kw,
        "balance_loss_kw": balance_loss_kw,
        "accounting_residual_kw": accounting_residual_kw,
        "loss_breakdown_kw": {
            "mv": line_loss["mv"],
            "jtr": line_loss["jtr"],
            "service": line_loss["service"],
            "transformer": trafo_loss_kw,
        },
        "source_phase_kw": source_phase_kw,
        "source_phase_kvar": source_phase_kvar,
        "lv_voltage_pu": vm,
        "lv_current_a": ia,
        "min_lv_voltage_pu": min_v,
        "max_lv_voltage_pu": max_v,
        "max_unbalance_percent": max_unbalance,
        "transformer_loading_percent": trafo_loading,
        "max_line_loading_percent": max_line_loading,
        "solve_ms": solve_ms,
    }
    session["records"].append(record)
    return record


def run_p1_step_json(interval_index: int) -> str:
    return json.dumps(run_p1_step(int(interval_index)), allow_nan=False)


def _energy_sum(records, key):
    return sum(float(record[key]) * P1_INTERVAL_HOURS for record in records)


def finish_p1():
    if _P1_SESSION is None:
        raise RuntimeError("P1 session is not initialized")
    session = _P1_SESSION
    records = session["records"]
    if len(records) != P1_INTERVALS:
        raise RuntimeError(f"P1 expected {P1_INTERVALS} completed intervals, found {len(records)}")

    source_kwh = _energy_sum(records, "source_kw")
    customer_kwh = _energy_sum(records, "customer_kw")
    technical_loss_kwh = _energy_sum(records, "technical_loss_kw")
    balance_loss_kwh = _energy_sum(records, "balance_loss_kw")
    residual_kwh = balance_loss_kwh - technical_loss_kwh

    breakdown_kwh = {key: 0.0 for key in ("mv", "jtr", "service", "transformer")}
    for record in records:
        for key in breakdown_kwh:
            breakdown_kwh[key] += record["loss_breakdown_kw"][key] * P1_INTERVAL_HOURS

    peak = max(records, key=lambda x: x["source_kw"])
    minimum = min(records, key=lambda x: x["source_kw"])
    min_voltage_record = min(records, key=lambda x: x["min_lv_voltage_pu"])
    max_unbalance_record = max(records, key=lambda x: x["max_unbalance_percent"])
    max_loading_record = max(records, key=lambda x: x["transformer_loading_percent"])

    truth_hash_after = _hash_truth(_truth_descriptor(
        session["metadata"], session["p"], session["q"], session["profile_meta"]
    ))

    customers = session["metadata"]["customers"]
    category_count = {"residential": 0, "small_commercial": 0}
    phase_count = {phase: 0 for phase in PHASES}
    customer_truth = []
    ami = []
    for row, customer in enumerate(customers):
        category_count[customer.category] += 1
        phase_count[customer.phase] += 1
        customer_truth.append({
            "customer_id": customer.customer_id,
            "branch": customer.branch + 1,
            "pole": customer.pole + 1,
            "phase": customer.phase,
            "category": customer.category,
            "contracted_kva": customer.contracted_kva,
            "reference_peak_kw": customer.demand_kw,
            "pf": customer.pf,
            "service_length_m": customer.service_length_m,
        })
        ami.append({
            "customer_id": customer.customer_id,
            "phase": customer.phase,
            "category": customer.category,
            "daily_energy_kwh": float(np.sum(session["customer_interval_kwh"][row])),
            "interval_kwh": np.round(session["customer_interval_kwh"][row], 6).tolist(),
        })

    residual_pct_source = abs(residual_kwh) / source_kwh * 100.0 if source_kwh else 0.0
    loss_pct = technical_loss_kwh / source_kwh * 100.0 if source_kwh else 0.0
    runtime_total_ms = float(sum(session["solve_ms"]))
    max_solve_ms = float(max(session["solve_ms"]))
    avg_solve_ms = float(np.mean(session["solve_ms"]))

    checks = [
        {
            "name": "96/96 intervals converged",
            "pass": session["converged"] == P1_INTERVALS,
            "detail": f"{session['converged']} successful 3φ power flows",
        },
        {
            "name": "Ground Truth remained immutable",
            "pass": truth_hash_after == session["truth_hash"],
            "detail": f"SHA-256 {session['truth_hash'][:16]}…",
        },
        {
            "name": "customer AMI coverage complete",
            "pass": len(ami) == P1_CUSTOMERS and all(len(x["interval_kwh"]) == P1_INTERVALS for x in ami),
            "detail": f"{P1_CUSTOMERS} × {P1_INTERVALS} = {P1_CUSTOMERS * P1_INTERVALS} interval values",
        },
        {
            "name": "daily load profile has diversity",
            "pass": peak["source_kw"] > minimum["source_kw"] * 1.5,
            "detail": f"{minimum['source_kw']:.1f} → {peak['source_kw']:.1f} kW",
        },
        {
            "name": "component loss accounting closes",
            "pass": residual_pct_source < 0.5,
            "detail": f"residual {residual_kwh:.4f} kWh ({residual_pct_source:.4f}% of source energy)",
        },
        {
            "name": "LV voltage remains plausible",
            "pass": min_voltage_record["min_lv_voltage_pu"] > 0.90 and max(r["max_lv_voltage_pu"] for r in records) < 1.10,
            "detail": f"minimum {min_voltage_record['min_lv_voltage_pu']:.4f} pu at {min_voltage_record['time']}",
        },
        {
            "name": "transformer remains below rating",
            "pass": max_loading_record["transformer_loading_percent"] < 100.0,
            "detail": f"peak {max_loading_record['transformer_loading_percent']:.1f}% at {max_loading_record['time']}",
        },
        {
            "name": "daily browser runtime budget",
            "pass": runtime_total_ms < 60000.0,
            "detail": f"{runtime_total_ms / 1000.0:.2f} s solver time for 96 intervals",
        },
    ]

    summary = {
        "source_energy_kwh": source_kwh,
        "customer_energy_kwh": customer_kwh,
        "technical_loss_kwh": technical_loss_kwh,
        "balance_loss_kwh": balance_loss_kwh,
        "accounting_residual_kwh": residual_kwh,
        "accounting_residual_percent_source": residual_pct_source,
        "technical_loss_percent": loss_pct,
        "loss_breakdown_kwh": breakdown_kwh,
        "peak_source_kw": peak["source_kw"],
        "peak_time": peak["time"],
        "minimum_source_kw": minimum["source_kw"],
        "minimum_time": minimum["time"],
        "minimum_lv_voltage_pu": min_voltage_record["min_lv_voltage_pu"],
        "minimum_voltage_time": min_voltage_record["time"],
        "max_unbalance_percent": max_unbalance_record["max_unbalance_percent"],
        "max_unbalance_time": max_unbalance_record["time"],
        "max_transformer_loading_percent": max_loading_record["transformer_loading_percent"],
        "max_transformer_loading_time": max_loading_record["time"],
        "solver_total_ms": runtime_total_ms,
        "solver_average_ms": avg_solve_ms,
        "solver_max_ms": max_solve_ms,
    }

    measurement_inventory = [
        {"channel": "Feeder / source P,Q", "records": P1_INTERVALS, "resolution": "15 min", "status": "GROUND TRUTH"},
        {"channel": "LV bus voltage A/B/C", "records": P1_INTERVALS * 3, "resolution": "15 min", "status": "GROUND TRUTH"},
        {"channel": "Transformer LV current A/B/C", "records": P1_INTERVALS * 3, "resolution": "15 min", "status": "GROUND TRUTH"},
        {"channel": "Customer AMI interval energy", "records": P1_CUSTOMERS * P1_INTERVALS, "resolution": "15 min", "status": "GROUND TRUTH"},
        {"channel": "Customer phase / PF / service length", "records": P1_CUSTOMERS, "resolution": "static", "status": "GROUND TRUTH"},
        {"channel": "Technical-loss decomposition", "records": P1_INTERVALS * 4, "resolution": "15 min", "status": "GROUND TRUTH"},
    ]

    return {
        "gate": {
            "pass": all(item["pass"] for item in checks),
            "summary": "P1 passed: immutable 24-hour Ground Truth and synthetic measurements are ready." if all(item["pass"] for item in checks) else "P1 failed one or more Ground Truth integrity checks.",
        },
        "ground_truth": {
            "schema": "smart-distribution-loss-ground-truth-v1",
            "seed": P1_SEED,
            "truth_hash": session["truth_hash"],
            "truth_hash_short": session["truth_hash"][:16],
            "immutable": truth_hash_after == session["truth_hash"],
            "customer_count": P1_CUSTOMERS,
            "category_count": category_count,
            "phase_count": phase_count,
            "intervals": P1_INTERVALS,
            "interval_minutes": P1_INTERVAL_MINUTES,
            "topology": "20 kV → 250 m TM → 400 kVA Dyn → 3 JTR → 90 customers",
            "customers": customer_truth,
        },
        "summary": summary,
        "series": records,
        "measurements": {
            "inventory": measurement_inventory,
            "customer_ami": ami,
            "quality": "perfect / noiseless Ground Truth; degradation begins in P2",
        },
        "checks": checks,
        "runtime": {
            "build_ms": session["build_ms"],
            "solver": "pandapower.runpp_3ph",
            "numba": False,
            "interval_solves": P1_INTERVALS,
        },
    }


def finish_p1_json() -> str:
    return json.dumps(finish_p1(), allow_nan=False)

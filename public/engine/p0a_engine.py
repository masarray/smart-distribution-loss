"""P0-A browser physics feasibility gate.

This deliberately mirrors pandapower's official minimal unbalanced tutorial topology:
20 kV source -> 20/0.4 kV Dyn transformer -> 0.4 kV line -> asymmetric wye load.
It is intentionally small so browser/Pyodide compatibility can be isolated from UI complexity.
"""
from __future__ import annotations

import json
import math
import time

import numpy as np
import pandas as pd
import scipy
import networkx as nx
import pandapower as pp


def _f(value, default=0.0):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except Exception:
        return default


def _phase_endpoint_loss_kw(row, left: str, right: str) -> float:
    total_mw = 0.0
    found = False
    for phase in ("a", "b", "c"):
        left_key = f"p_{phase}_{left}_mw"
        right_key = f"p_{phase}_{right}_mw"
        if left_key in row.index and right_key in row.index:
            found = True
            total_mw += _f(row[left_key]) + _f(row[right_key])
    return total_mw * 1000.0 if found else 0.0


def _check(name: str, passed: bool, detail: str) -> dict:
    return {"name": name, "pass": bool(passed), "detail": detail}


def build_minimal_distribution_network():
    net = pp.create_empty_network(sn_mva=1.0)
    b1 = pp.create_bus(net, vn_kv=20.0, name="20 kV Source Bus")
    b2 = pp.create_bus(net, vn_kv=0.4, name="LV Transformer Bus")
    b3 = pp.create_bus(net, vn_kv=0.4, name="LV Load Bus")

    pp.create_ext_grid(
        net,
        b1,
        vm_pu=1.0,
        s_sc_max_mva=1000,
        rx_max=0.1,
        x0x_max=1.0,
        r0x0_max=0.1,
        name="Grid",
    )

    pp.create_transformer_from_parameters(
        net,
        b1,
        b2,
        sn_mva=0.63,
        vn_hv_kv=20.0,
        vn_lv_kv=0.4,
        vkr_percent=0.1,
        vk_percent=6.0,
        vk0_percent=6.0,
        vkr0_percent=0.78125,
        mag0_percent=100.0,
        mag0_rx=0.0,
        pfe_kw=0.1,
        i0_percent=0.1,
        vector_group="Dyn",
        shift_degree=150,
        si0_hv_partial=0.9,
        name="TR-01 630 kVA",
    )

    pp.create_line_from_parameters(
        net,
        b2,
        b3,
        length_km=0.1,
        r0_ohm_per_km=0.0848,
        x0_ohm_per_km=0.4649556,
        c0_nf_per_km=230.6,
        max_i_ka=0.963,
        r_ohm_per_km=0.0212,
        x_ohm_per_km=0.1162389,
        c_nf_per_km=230,
        name="JTR-01",
    )

    pp.create_asymmetric_load(
        net,
        b3,
        p_a_mw=0.25,
        p_b_mw=0.18,
        p_c_mw=0.20,
        q_a_mvar=0.0,
        q_b_mvar=0.0,
        q_c_mvar=0.0,
        type="wye",
        name="Asymmetric LV Load",
    )
    return net, b1, b2, b3


def run_p0a() -> dict:
    net, b1, b2, b3 = build_minimal_distribution_network()

    started = time.perf_counter()
    pp.runpp_3ph(net, numba=False, max_iteration=30, tolerance_mva=1e-8)
    first_solve_ms = (time.perf_counter() - started) * 1000.0

    if not bool(net.converged):
        raise RuntimeError("pandapower runpp_3ph returned without convergence")

    lv = net.res_bus_3ph.loc[b3]
    vm_a = _f(lv.get("vm_a_pu"))
    vm_b = _f(lv.get("vm_b_pu"))
    vm_c = _f(lv.get("vm_c_pu"))
    unbalance = _f(lv.get("unbalance_percent"))

    line_loss_kw = 0.0
    if len(net.res_line_3ph):
        line_loss_kw = _phase_endpoint_loss_kw(net.res_line_3ph.iloc[0], "from", "to")

    trafo_loss_kw = 0.0
    if len(net.res_trafo_3ph):
        trafo_loss_kw = _phase_endpoint_loss_kw(net.res_trafo_3ph.iloc[0], "hv", "lv")

    # Fallback total loss from source/load power balance if one result schema lacks endpoint phase columns.
    total_load_mw = 0.25 + 0.18 + 0.20
    ext_p_mw = None
    if hasattr(net, "res_ext_grid_3ph") and len(net.res_ext_grid_3ph):
        ext = net.res_ext_grid_3ph.iloc[0]
        keys = [f"p_{ph}_mw" for ph in ("a", "b", "c")]
        if all(key in ext.index for key in keys):
            ext_p_mw = sum(_f(ext[key]) for key in keys)

    endpoint_total_kw = line_loss_kw + trafo_loss_kw
    balance_total_kw = None
    if ext_p_mw is not None:
        # Pandapower ext-grid sign in the result is injection into the network in standard PF result conventions.
        balance_total_kw = (ext_p_mw - total_load_mw) * 1000.0

    total_loss_kw = endpoint_total_kw
    if total_loss_kw <= 0 and balance_total_kw is not None:
        total_loss_kw = max(0.0, balance_total_kw)

    # Repeatability / repeated simulation gate, important for later optimization loops.
    repeat_ms = []
    repeat_values = []
    for _ in range(3):
        t0 = time.perf_counter()
        pp.runpp_3ph(net, numba=False, init="results", max_iteration=30, tolerance_mva=1e-8)
        repeat_ms.append((time.perf_counter() - t0) * 1000.0)
        row = net.res_bus_3ph.loc[b3]
        repeat_values.append([_f(row["vm_a_pu"]), _f(row["vm_b_pu"]), _f(row["vm_c_pu"])])

    reference = np.array([0.977551, 1.001594, 0.974593])
    observed = np.array([vm_a, vm_b, vm_c])
    reference_delta = float(np.max(np.abs(observed - reference)))
    repeat_delta = float(np.max(np.abs(np.array(repeat_values) - observed)))

    checks = [
        _check("runpp_3ph converged", bool(net.converged), "Three-phase solver converged."),
        _check("asymmetric phase response", max(observed) - min(observed) > 0.005, f"Phase spread = {(max(observed)-min(observed)):.6f} pu"),
        _check("official-reference proximity", reference_delta < 0.005, f"Max Δ vs tutorial reference = {reference_delta:.6f} pu"),
        _check("technical loss is positive", total_loss_kw > 0.0, f"Total P loss = {total_loss_kw:.6f} kW"),
        _check("repeated solve is stable", repeat_delta < 1e-7, f"Max repeated-run Δ = {repeat_delta:.3e} pu"),
        _check("result tables available", len(net.res_bus_3ph) >= 3 and len(net.res_line_3ph) >= 1 and len(net.res_trafo_3ph) >= 1, "3φ bus/line/trafo results are populated."),
    ]

    mandatory_pass = all(item["pass"] for item in checks)

    return {
        "gate": {
            "pass": mandatory_pass,
            "summary": "All mandatory browser-physics checks passed." if mandatory_pass else "At least one mandatory browser-physics check failed; inspect diagnostics before proceeding to P0-B.",
        },
        "versions": {
            "python": __import__("sys").version.split()[0],
            "pandapower": str(pp.__version__),
            "numpy": str(np.__version__),
            "pandas": str(pd.__version__),
            "scipy": str(scipy.__version__),
            "networkx": str(nx.__version__),
        },
        "network": {
            "buses": 3,
            "transformers": 1,
            "lines": 1,
            "asymmetric_loads": 1,
            "source_kv": 20.0,
            "lv_kv": 0.4,
            "transformer_kva": 630.0,
            "load_kw": 630.0,
        },
        "electrical": {
            "vm_a_pu": vm_a,
            "vm_b_pu": vm_b,
            "vm_c_pu": vm_c,
            "lv_unbalance_percent": unbalance,
            "line_loss_kw": line_loss_kw,
            "transformer_loss_kw": trafo_loss_kw,
            "endpoint_total_loss_kw": endpoint_total_kw,
            "balance_total_loss_kw": balance_total_kw,
            "total_loss_kw": total_loss_kw,
            "reference_delta_pu": reference_delta,
            "repeat_delta_pu": repeat_delta,
        },
        "timing_ms": {
            "first_solve": first_solve_ms,
            "repeat_solve_1": repeat_ms[0],
            "repeat_solve_2": repeat_ms[1],
            "repeat_solve_3": repeat_ms[2],
            "repeat_average": sum(repeat_ms) / len(repeat_ms),
        },
        "checks": checks,
        "runtime": {
            "solver": "pandapower.runpp_3ph",
            "numba": False,
            "iterations_requested_max": 30,
        },
    }


def run_p0a_json() -> str:
    return json.dumps(run_p0a(), allow_nan=False)

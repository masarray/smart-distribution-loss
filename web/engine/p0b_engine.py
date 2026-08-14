"""P0-B browser-scale distribution benchmark.

Synthetic but physics-real network:
20 kV source -> short MV feeder -> 20/0.4 kV 400 kVA transformer ->
3 radial LV/JTR branches -> up to 90 individual single-phase customers.

The goal is not calibration yet. P0-B proves that the browser/Pyodide path
remains stable and fast enough when the network is scaled to the canonical
demo size defined in the PRD.
"""
from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass

import numpy as np
import pandapower as pp

SEED = 61850
MAX_CUSTOMERS = 90
PHASES = ("A", "B", "C")


@dataclass(frozen=True)
class CustomerSpec:
    customer_id: int
    branch: int
    pole: int
    phase: str
    category: str
    contracted_kva: float
    demand_kw: float
    demand_kvar: float
    pf: float
    service_length_m: float


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


def _customer_population(seed: int = SEED) -> list[CustomerSpec]:
    rng = np.random.default_rng(seed)
    residential_kva = np.array([0.9, 1.3, 2.2, 3.5, 4.4, 5.5, 7.7])
    residential_p = np.array([0.05, 0.18, 0.26, 0.20, 0.13, 0.10, 0.08])
    commercial_kva = np.array([5.5, 7.7, 11.0, 13.2, 16.5, 23.0])
    commercial_p = np.array([0.12, 0.18, 0.28, 0.20, 0.14, 0.08])

    customers: list[CustomerSpec] = []
    branch_seen = [0, 0, 0]

    for i in range(MAX_CUSTOMERS):
        branch = i % 3
        local_index = branch_seen[branch]
        branch_seen[branch] += 1
        pole = local_index // 3
        phase = PHASES[(local_index + branch) % 3]

        is_commercial = bool(rng.random() < 0.15)
        if is_commercial:
            category = "small_commercial"
            contracted = float(rng.choice(commercial_kva, p=commercial_p))
            demand_factor = float(rng.uniform(0.32, 0.70))
            pf = float(rng.uniform(0.86, 0.96))
        else:
            category = "residential"
            contracted = float(rng.choice(residential_kva, p=residential_p))
            demand_factor = float(rng.uniform(0.25, 0.62))
            pf = float(rng.uniform(0.88, 0.98))

        apparent_kva = contracted * demand_factor
        demand_kw = apparent_kva * pf
        demand_kvar = demand_kw * math.tan(math.acos(pf))
        service_length_m = float(rng.uniform(12.0, 38.0))

        customers.append(
            CustomerSpec(
                customer_id=i + 1,
                branch=branch,
                pole=pole,
                phase=phase,
                category=category,
                contracted_kva=contracted,
                demand_kw=demand_kw,
                demand_kvar=demand_kvar,
                pf=pf,
                service_length_m=service_length_m,
            )
        )
    return customers


CUSTOMERS = _customer_population()


def _create_line(net, from_bus, to_bus, length_km, kind, name):
    if kind == "mv":
        params = dict(
            r_ohm_per_km=0.32,
            x_ohm_per_km=0.34,
            c_nf_per_km=12.0,
            r0_ohm_per_km=0.85,
            x0_ohm_per_km=1.05,
            c0_nf_per_km=8.0,
            max_i_ka=0.30,
        )
    elif kind == "jtr":
        params = dict(
            r_ohm_per_km=0.206,
            x_ohm_per_km=0.080,
            c_nf_per_km=0.0,
            r0_ohm_per_km=0.62,
            x0_ohm_per_km=0.24,
            c0_nf_per_km=0.0,
            max_i_ka=0.28,
        )
    else:
        params = dict(
            r_ohm_per_km=0.641,
            x_ohm_per_km=0.085,
            c_nf_per_km=0.0,
            r0_ohm_per_km=1.80,
            x0_ohm_per_km=0.28,
            c0_nf_per_km=0.0,
            max_i_ka=0.10,
        )
    return pp.create_line_from_parameters(
        net,
        from_bus=from_bus,
        to_bus=to_bus,
        length_km=float(length_km),
        name=name,
        **params,
    )


def build_distribution_network(customer_count: int, seed: int = SEED):
    if not 1 <= int(customer_count) <= MAX_CUSTOMERS:
        raise ValueError(f"customer_count must be between 1 and {MAX_CUSTOMERS}")

    selected = CUSTOMERS[: int(customer_count)]
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

    pp.create_transformer_from_parameters(
        net,
        hv_bus=trafo_hv,
        lv_bus=lv_main,
        sn_mva=0.4,
        vn_hv_kv=20.0,
        vn_lv_kv=0.4,
        vkr_percent=1.10,
        vk_percent=4.0,
        vk0_percent=4.0,
        vkr0_percent=1.10,
        mag0_percent=100.0,
        mag0_rx=0.0,
        pfe_kw=0.75,
        i0_percent=0.25,
        vector_group="Dyn",
        shift_degree=150,
        si0_hv_partial=0.9,
        name="TR-GD01 400 kVA",
    )

    branch_customers = {branch: [] for branch in range(3)}
    for customer in selected:
        branch_customers[customer.branch].append(customer)

    customer_bus_by_id = {}
    active_branch_count = 0

    for branch in range(3):
        items = branch_customers[branch]
        if not items:
            continue
        active_branch_count += 1
        by_pole = {}
        for customer in items:
            by_pole.setdefault(customer.pole, []).append(customer)

        previous_bus = lv_main
        for pole in sorted(by_pole):
            pole_bus = pp.create_bus(net, vn_kv=0.4, name=f"JTR-{branch + 1:02d}-P{pole + 1:02d}")
            segment_m = 32.0 + branch * 4.0 + (pole % 3) * 6.0
            _create_line(
                net,
                previous_bus,
                pole_bus,
                segment_m / 1000.0,
                "jtr",
                f"JTR-{branch + 1:02d}-SEG-{pole + 1:02d}",
            )
            previous_bus = pole_bus

            for customer in by_pole[pole]:
                customer_bus = pp.create_bus(
                    net,
                    vn_kv=0.4,
                    name=f"CUST-{customer.customer_id:03d}-{customer.phase}",
                )
                customer_bus_by_id[customer.customer_id] = customer_bus
                _create_line(
                    net,
                    pole_bus,
                    customer_bus,
                    customer.service_length_m / 1000.0,
                    "service",
                    f"SR-{customer.customer_id:03d}",
                )

                phase_kwargs = dict(
                    p_a_mw=0.0,
                    q_a_mvar=0.0,
                    p_b_mw=0.0,
                    q_b_mvar=0.0,
                    p_c_mw=0.0,
                    q_c_mvar=0.0,
                )
                ph = customer.phase.lower()
                phase_kwargs[f"p_{ph}_mw"] = customer.demand_kw / 1000.0
                phase_kwargs[f"q_{ph}_mvar"] = customer.demand_kvar / 1000.0
                pp.create_asymmetric_load(
                    net,
                    customer_bus,
                    type="wye",
                    name=f"LOAD-{customer.customer_id:03d}",
                    **phase_kwargs,
                )

    metadata = {
        "seed": seed,
        "customer_count": len(selected),
        "active_branches": active_branch_count,
        "customer_bus_by_id": customer_bus_by_id,
        "customers": selected,
        "grid_bus": grid_bus,
        "lv_main": lv_main,
    }
    return net, metadata


def _extract_case_metrics(net, metadata, build_ms, first_solve_ms, repeat_ms, repeat_delta):
    customers = metadata["customers"]
    phase_counts = {phase: 0 for phase in PHASES}
    phase_kw = {phase: 0.0 for phase in PHASES}
    category_counts = {"residential": 0, "small_commercial": 0}
    total_kw = 0.0
    total_kvar = 0.0

    for c in customers:
        phase_counts[c.phase] += 1
        phase_kw[c.phase] += c.demand_kw
        category_counts[c.category] += 1
        total_kw += c.demand_kw
        total_kvar += c.demand_kvar

    lv_rows = net.res_bus_3ph.loc[net.bus.vn_kv == 0.4]
    vm = lv_rows[["vm_a_pu", "vm_b_pu", "vm_c_pu"]].to_numpy(dtype=float)
    finite_vm = vm[np.isfinite(vm)]
    min_vm = float(np.min(finite_vm)) if finite_vm.size else 0.0
    max_vm = float(np.max(finite_vm)) if finite_vm.size else 0.0
    max_unbalance = float(np.nanmax(lv_rows["unbalance_percent"].to_numpy(dtype=float)))

    line_loss_kw = 0.0
    for _, row in net.res_line_3ph.iterrows():
        line_loss_kw += _phase_endpoint_loss_kw(row, "from", "to")

    trafo_loss_kw = 0.0
    if len(net.res_trafo_3ph):
        trafo_loss_kw = _phase_endpoint_loss_kw(net.res_trafo_3ph.iloc[0], "hv", "lv")

    technical_loss_kw = line_loss_kw + trafo_loss_kw

    source_kw = 0.0
    if hasattr(net, "res_ext_grid_3ph") and len(net.res_ext_grid_3ph):
        ext = net.res_ext_grid_3ph.iloc[0]
        for phase in ("a", "b", "c"):
            key = f"p_{phase}_mw"
            if key in ext.index:
                source_kw += _f(ext[key]) * 1000.0

    loss_pct = technical_loss_kw / source_kw * 100.0 if source_kw > 0 else 0.0
    max_line_loading = float(np.nanmax(net.res_line_3ph["loading_percent"].to_numpy(dtype=float))) if len(net.res_line_3ph) else 0.0
    trafo_loading = float(net.res_trafo_3ph.iloc[0].get("loading_percent", 0.0)) if len(net.res_trafo_3ph) else 0.0

    return {
        "customer_count": len(customers),
        "buses": int(len(net.bus)),
        "lines": int(len(net.line)),
        "transformers": int(len(net.trafo)),
        "asymmetric_loads": int(len(net.asymmetric_load)),
        "total_load_kw": total_kw,
        "total_load_kvar": total_kvar,
        "source_kw": source_kw,
        "technical_loss_kw": technical_loss_kw,
        "line_loss_kw": line_loss_kw,
        "transformer_loss_kw": trafo_loss_kw,
        "loss_percent": loss_pct,
        "min_voltage_pu": min_vm,
        "max_voltage_pu": max_vm,
        "max_unbalance_percent": max_unbalance,
        "max_line_loading_percent": max_line_loading,
        "transformer_loading_percent": trafo_loading,
        "phase_customer_count": phase_counts,
        "phase_load_kw": phase_kw,
        "category_count": category_counts,
        "build_ms": build_ms,
        "first_solve_ms": first_solve_ms,
        "repeat_count": len(repeat_ms),
        "repeat_total_ms": float(sum(repeat_ms)),
        "repeat_average_ms": float(sum(repeat_ms) / len(repeat_ms)) if repeat_ms else 0.0,
        "repeat_min_ms": float(min(repeat_ms)) if repeat_ms else 0.0,
        "repeat_max_ms": float(max(repeat_ms)) if repeat_ms else 0.0,
        "repeat_delta_pu": repeat_delta,
        "converged": bool(net.converged),
    }


def run_p0b_case(customer_count: int, warm_repeats: int = 3) -> dict:
    build_started = time.perf_counter()
    net, metadata = build_distribution_network(customer_count)
    build_ms = (time.perf_counter() - build_started) * 1000.0

    solve_started = time.perf_counter()
    pp.runpp_3ph(net, numba=False, max_iteration=30, tolerance_mva=1e-8)
    first_solve_ms = (time.perf_counter() - solve_started) * 1000.0
    if not bool(net.converged):
        raise RuntimeError(f"P0-B {customer_count}-customer first solve did not converge")

    reference = net.res_bus_3ph[["vm_a_pu", "vm_b_pu", "vm_c_pu"]].to_numpy(dtype=float, copy=True)
    repeat_ms = []
    repeat_delta = 0.0

    for _ in range(int(warm_repeats)):
        t0 = time.perf_counter()
        pp.runpp_3ph(net, numba=False, init="results", max_iteration=30, tolerance_mva=1e-8)
        repeat_ms.append((time.perf_counter() - t0) * 1000.0)
        if not bool(net.converged):
            raise RuntimeError(f"P0-B {customer_count}-customer repeated solve did not converge")
        current = net.res_bus_3ph[["vm_a_pu", "vm_b_pu", "vm_c_pu"]].to_numpy(dtype=float, copy=False)
        delta = np.abs(current - reference)
        finite = delta[np.isfinite(delta)]
        if finite.size:
            repeat_delta = max(repeat_delta, float(np.max(finite)))

    metrics = _extract_case_metrics(net, metadata, build_ms, first_solve_ms, repeat_ms, repeat_delta)

    checks = [
        {"name": "solver converged", "pass": metrics["converged"], "detail": "runpp_3ph converged"},
        {"name": "customer population exact", "pass": metrics["asymmetric_loads"] == int(customer_count), "detail": f"{metrics['asymmetric_loads']} individual asymmetric loads"},
        {"name": "technical loss positive", "pass": metrics["technical_loss_kw"] > 0.0, "detail": f"{metrics['technical_loss_kw']:.3f} kW"},
        {"name": "repeatability stable", "pass": metrics["repeat_delta_pu"] < 1e-6, "detail": f"max Δ {metrics['repeat_delta_pu']:.3e} pu"},
    ]

    if int(customer_count) == MAX_CUSTOMERS:
        checks.extend(
            [
                {"name": "all three phases represented", "pass": all(metrics["phase_customer_count"][p] > 0 for p in PHASES), "detail": str(metrics["phase_customer_count"])},
                {"name": "LV voltage remains plausible", "pass": metrics["min_voltage_pu"] > 0.90 and metrics["max_voltage_pu"] < 1.10, "detail": f"{metrics['min_voltage_pu']:.4f}–{metrics['max_voltage_pu']:.4f} pu"},
                {"name": "transformer below thermal rating", "pass": metrics["transformer_loading_percent"] < 100.0, "detail": f"{metrics['transformer_loading_percent']:.1f}%"},
                {"name": "25-loop browser budget", "pass": metrics["repeat_total_ms"] < 60000.0, "detail": f"{metrics['repeat_total_ms']/1000.0:.2f} s for {metrics['repeat_count']} warm solves"},
            ]
        )

    return {
        "case": metrics,
        "checks": checks,
        "pass": all(item["pass"] for item in checks),
        "runtime": {
            "solver": "pandapower.runpp_3ph",
            "seed": SEED,
            "numba": False,
            "synthetic": True,
        },
    }


def run_p0b_case_json(customer_count: int, warm_repeats: int = 3) -> str:
    return json.dumps(run_p0b_case(int(customer_count), int(warm_repeats)), allow_nan=False)

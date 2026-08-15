"""M5 field-dataset physics adapter.

Consumes the normalized ``smart-distribution-loss-field-v1`` JSON contract and
runs the same Pandapower ``runpp_3ph`` solver used by the synthetic POC.

Scope of v1 is intentionally strict:
- one radial source;
- line + two-winding transformer elements;
- customer loads attached to declared buses;
- complete 96 x 15-minute customer P data for the physics preview;
- Q from AMI when present, otherwise a declared customer PF fallback.

There is no hidden Ground Truth and no synthetic degradation in this path.
Imported field measurements are used only for residual validation.
"""
from __future__ import annotations

import json
import math
import time

import numpy as np
import pandapower as pp

FIELD_SCHEMA = "smart-distribution-loss-field-v1"
INTERVALS = 96
INTERVAL_HOURS = 0.25
PHASES = ("A", "B", "C")


def _f(value, default=0.0):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except Exception:
        return default


def _phase_endpoint_loss_kw(row, left, right):
    total_mw = 0.0
    found = False
    for phase in ("a", "b", "c"):
        lk = f"p_{phase}_{left}_mw"
        rk = f"p_{phase}_{right}_mw"
        if lk in row.index and rk in row.index:
            found = True
            total_mw += _f(row[lk]) + _f(row[rk])
    return total_mw * 1000.0 if found else 0.0


def _source_kw(net):
    total = 0.0
    if hasattr(net, "res_ext_grid_3ph") and len(net.res_ext_grid_3ph):
        row = net.res_ext_grid_3ph.iloc[0]
        for phase in ("a", "b", "c"):
            total += _f(row.get(f"p_{phase}_mw", 0.0)) * 1000.0
    return total


def _technical_loss_kw(net):
    line = 0.0
    trafo = 0.0
    if hasattr(net, "res_line_3ph"):
        for _, row in net.res_line_3ph.iterrows():
            line += _phase_endpoint_loss_kw(row, "from", "to")
    if hasattr(net, "res_trafo_3ph"):
        for _, row in net.res_trafo_3ph.iterrows():
            trafo += _phase_endpoint_loss_kw(row, "hv", "lv")
    return line + trafo, line, trafo


def _voltage_bounds(net):
    if not hasattr(net, "res_bus_3ph") or not len(net.res_bus_3ph):
        return 0.0, 0.0
    values = net.res_bus_3ph[["vm_a_pu", "vm_b_pu", "vm_c_pu"]].to_numpy(dtype=float)
    finite = values[np.isfinite(values)]
    if not finite.size:
        return 0.0, 0.0
    return float(np.min(finite)), float(np.max(finite))


def _loading(net):
    line_loading = 0.0
    trafo_loading = 0.0
    if hasattr(net, "res_line_3ph") and len(net.res_line_3ph):
        values = net.res_line_3ph["loading_percent"].to_numpy(dtype=float)
        finite = values[np.isfinite(values)]
        if finite.size:
            line_loading = float(np.max(finite))
    if hasattr(net, "res_trafo_3ph") and len(net.res_trafo_3ph):
        values = net.res_trafo_3ph["loading_percent"].to_numpy(dtype=float)
        finite = values[np.isfinite(values)]
        if finite.size:
            trafo_loading = float(np.max(finite))
    return max(line_loading, trafo_loading), line_loading, trafo_loading


def _build_network(dataset):
    network = dataset["network"]
    customers = dataset["customers"]
    sources = [item for item in network if item["element_type"] == "source"]
    if len(sources) != 1:
        raise ValueError(f"field-v1 requires exactly one source, got {len(sources)}")

    rated = [float(item.get("rated_kva") or 0.0) for item in network if item["element_type"] == "transformer"]
    sn_mva = max([value / 1000.0 for value in rated if value > 0.0] + [1.0])
    net = pp.create_empty_network(sn_mva=sn_mva)

    voltage_by_bus = {}
    for item in network:
        if item.get("from_bus") and item.get("from_kv"):
            voltage_by_bus[item["from_bus"]] = float(item["from_kv"])
        if item.get("to_bus") and item.get("to_kv"):
            voltage_by_bus[item["to_bus"]] = float(item["to_kv"])
    bus_by_id = {
        bus: pp.create_bus(net, vn_kv=kv, name=bus)
        for bus, kv in voltage_by_bus.items()
    }

    source = sources[0]
    pp.create_ext_grid(
        net,
        bus=bus_by_id[source["to_bus"]],
        vm_pu=1.0,
        s_sc_max_mva=float(source["s_sc_max_mva"]),
        rx_max=float(source["rx_max"]),
        r0x0_max=float(source["r0x0_max"]),
        x0x_max=float(source["x0x_max"]),
        name=source["element_id"],
    )

    for item in network:
        kind = item["element_type"]
        if kind == "source":
            continue
        if kind == "line":
            pp.create_line_from_parameters(
                net,
                from_bus=bus_by_id[item["from_bus"]],
                to_bus=bus_by_id[item["to_bus"]],
                length_km=float(item["length_km"]),
                r_ohm_per_km=float(item["r_ohm_per_km"]),
                x_ohm_per_km=float(item["x_ohm_per_km"]),
                c_nf_per_km=float(item.get("c_nf_per_km") or 0.0),
                r0_ohm_per_km=float(item["r0_ohm_per_km"]),
                x0_ohm_per_km=float(item["x0_ohm_per_km"]),
                c0_nf_per_km=float(item.get("c0_nf_per_km") or 0.0),
                max_i_ka=float(item["max_i_ka"]),
                name=item["element_id"],
            )
        elif kind == "transformer":
            pp.create_transformer_from_parameters(
                net,
                hv_bus=bus_by_id[item["from_bus"]],
                lv_bus=bus_by_id[item["to_bus"]],
                sn_mva=float(item["rated_kva"]) / 1000.0,
                vn_hv_kv=float(item["from_kv"]),
                vn_lv_kv=float(item["to_kv"]),
                vk_percent=float(item["vk_percent"]),
                vkr_percent=float(item["vkr_percent"]),
                vk0_percent=float(item["vk0_percent"]),
                vkr0_percent=float(item["vkr0_percent"]),
                mag0_percent=100.0,
                mag0_rx=0.0,
                pfe_kw=float(item["pfe_kw"]),
                i0_percent=float(item["i0_percent"]),
                vector_group=item["vector_group"],
                shift_degree=float(item.get("shift_degree") or 0.0),
                si0_hv_partial=0.9,
                name=item["element_id"],
            )

    load_by_meter = {}
    customer_by_meter = {}
    for customer in customers:
        kwargs = {
            "p_a_mw": 0.0, "q_a_mvar": 0.0,
            "p_b_mw": 0.0, "q_b_mvar": 0.0,
            "p_c_mw": 0.0, "q_c_mvar": 0.0,
        }
        load_index = pp.create_asymmetric_load(
            net,
            bus=bus_by_id[customer["bus_id"]],
            type="wye",
            name=f"LOAD-{customer['customer_id']}",
            **kwargs,
        )
        load_by_meter[customer["meter_id"]] = int(load_index)
        customer_by_meter[customer["meter_id"]] = customer

    return net, {
        "source": source,
        "bus_by_id": bus_by_id,
        "load_by_meter": load_by_meter,
        "customer_by_meter": customer_by_meter,
    }


def _ami_lookup(dataset):
    result = {}
    for point in dataset["ami"]:
        result[(point["meter_id"], int(point["index"]))] = point
    return result


def _measurement_lookup(dataset, source_id):
    result = {}
    for point in dataset.get("measurements", []):
        if point.get("asset_id") != source_id:
            continue
        if str(point.get("measurement_type", "")).upper() != "P":
            continue
        unit = str(point.get("unit", "")).lower()
        value = float(point["value"])
        if unit == "mw":
            value *= 1000.0
        elif unit not in ("kw", ""):
            continue
        result[int(point["index"])] = value
    return result


def _set_interval_loads(net, metadata, ami, interval):
    total_kw = 0.0
    total_kvar = 0.0
    for meter_id, load_index in metadata["load_by_meter"].items():
        point = ami.get((meter_id, interval))
        if point is None:
            raise ValueError(f"missing AMI P for meter {meter_id} interval {interval}")
        p_kw = float(point["p_kw"])
        q_raw = point.get("q_kvar")
        if q_raw is None:
            pf = metadata["customer_by_meter"][meter_id].get("pf")
            if pf is None:
                raise ValueError(f"meter {meter_id} has no q_kvar and no customer PF fallback")
            pf = float(pf)
            q_kvar = p_kw * math.tan(math.acos(pf))
        else:
            q_kvar = float(q_raw)
        phase = metadata["customer_by_meter"][meter_id]["phase"].lower()
        for ph in ("a", "b", "c"):
            net.asymmetric_load.at[load_index, f"p_{ph}_mw"] = p_kw / 1000.0 if ph == phase else 0.0
            net.asymmetric_load.at[load_index, f"q_{ph}_mvar"] = q_kvar / 1000.0 if ph == phase else 0.0
        total_kw += p_kw
        total_kvar += q_kvar
    return total_kw, total_kvar


def run_field_dataset(dataset):
    started = time.perf_counter()
    if dataset.get("schema") != FIELD_SCHEMA:
        raise ValueError(f"unsupported field dataset schema: {dataset.get('schema')}")
    if int(dataset.get("canonical_timebase", {}).get("intervals", 0)) != INTERVALS:
        raise ValueError("field dataset must expose 96 canonical intervals")

    net, metadata = _build_network(dataset)
    ami = _ami_lookup(dataset)
    source_measurements = _measurement_lookup(dataset, metadata["source"]["element_id"])

    series = []
    solve_ms = []
    converged = 0
    max_loading = 0.0
    max_line_loading = 0.0
    max_trafo_loading = 0.0
    min_voltage = float("inf")
    max_voltage = 0.0
    source_residuals = []
    source_observed = []

    for i in range(INTERVALS):
        load_kw, load_kvar = _set_interval_loads(net, metadata, ami, i)
        t0 = time.perf_counter()
        pp.runpp_3ph(
            net,
            numba=False,
            init="results" if i > 0 else "auto",
            max_iteration=30,
            tolerance_mva=1e-8,
        )
        solve_ms.append((time.perf_counter() - t0) * 1000.0)
        if not bool(net.converged):
            raise RuntimeError(f"runpp_3ph did not converge at interval {i}")
        converged += 1

        source_kw = _source_kw(net)
        loss_kw, line_loss_kw, trafo_loss_kw = _technical_loss_kw(net)
        vmin, vmax = _voltage_bounds(net)
        loading, line_loading, trafo_loading = _loading(net)
        min_voltage = min(min_voltage, vmin)
        max_voltage = max(max_voltage, vmax)
        max_loading = max(max_loading, loading)
        max_line_loading = max(max_line_loading, line_loading)
        max_trafo_loading = max(max_trafo_loading, trafo_loading)

        observed = source_measurements.get(i)
        if observed is not None:
            source_observed.append(observed)
            source_residuals.append(source_kw - observed)

        series.append({
            "index": i,
            "time": f"{i // 4:02d}:{(i % 4) * 15:02d}",
            "technical_loss_kw": loss_kw,
            "line_loss_kw": line_loss_kw,
            "transformer_loss_kw": trafo_loss_kw,
            "source_kw": source_kw,
            "load_kw": load_kw,
            "load_kvar": load_kvar,
            "loss_rate_percent": loss_kw / source_kw * 100.0 if source_kw > 0.0 else 0.0,
            "min_voltage_pu": vmin,
            "max_loading_percent": loading,
            "observed_source_kw": observed,
        })

    loss_kwh = float(sum(item["technical_loss_kw"] * INTERVAL_HOURS for item in series))
    supplied_kwh = float(sum(item["source_kw"] * INTERVAL_HOURS for item in series))
    load_kwh = float(sum(item["load_kw"] * INTERVAL_HOURS for item in series))
    loss_rate = loss_kwh / supplied_kwh * 100.0 if supplied_kwh > 0.0 else 0.0
    peak = max(series, key=lambda item: item["technical_loss_kw"])

    source_nrmse = None
    if source_residuals and source_observed:
        denom = max(abs(value) for value in source_observed) or 1.0
        source_nrmse = math.sqrt(sum(value * value for value in source_residuals) / len(source_residuals)) / denom * 100.0

    checks = [
        {"name": "all intervals converged", "pass": converged == INTERVALS, "detail": f"{converged}/{INTERVALS} runpp_3ph"},
        {"name": "technical loss positive", "pass": loss_kwh > 0.0, "detail": f"{loss_kwh:.3f} kWh/day"},
        {"name": "voltage finite", "pass": math.isfinite(min_voltage) and math.isfinite(max_voltage), "detail": f"{min_voltage:.4f}-{max_voltage:.4f} pu"},
        {"name": "loss balance plausible", "pass": supplied_kwh >= load_kwh and loss_kwh < supplied_kwh, "detail": f"source {supplied_kwh:.2f} kWh, load {load_kwh:.2f} kWh"},
    ]
    gate_pass = all(item["pass"] for item in checks)

    return {
        "schema": "smart-distribution-loss-field-result-v1",
        "dataset_schema": FIELD_SCHEMA,
        "dataset_mode": "field_import",
        "gate": {
            "pass": gate_pass,
            "summary": "FIELD PHYSICS PASS" if gate_pass else "FIELD PHYSICS REVIEW",
        },
        "summary": {
            "technical_loss_kwh": loss_kwh,
            "supplied_energy_kwh": supplied_kwh,
            "load_energy_kwh": load_kwh,
            "loss_rate_percent": loss_rate,
            "peak_loss_kw": float(peak["technical_loss_kw"]),
            "peak_time": peak["time"],
            "min_voltage_pu": min_voltage,
            "max_voltage_pu": max_voltage,
            "max_loading_percent": max_loading,
            "max_line_loading_percent": max_line_loading,
            "max_transformer_loading_percent": max_trafo_loading,
            "source_nrmse_percent": source_nrmse,
            "source_measurement_intervals": len(source_residuals),
        },
        "series": series,
        "checks": checks,
        "provenance": {
            "source_type": "user_imported_field_csv",
            "truth_policy": "no hidden truth exists in field mode",
            "solver": "pandapower.runpp_3ph",
            "calibration": "none; M5 physics preview requires complete AMI P coverage",
            "transformer_zero_sequence_defaults": "mag0_percent=100, mag0_rx=0, si0_hv_partial=0.9 in field-v1 adapter",
        },
        "runtime": {
            "solver": "pandapower.runpp_3ph",
            "numba": False,
            "intervals": INTERVALS,
            "solve_total_ms": float(sum(solve_ms)),
            "solve_average_ms": float(sum(solve_ms) / len(solve_ms)),
            "elapsed_ms": (time.perf_counter() - started) * 1000.0,
        },
    }


def run_field_dataset_json(dataset_json):
    payload = json.loads(dataset_json) if isinstance(dataset_json, str) else dataset_json
    return json.dumps(run_field_dataset(payload), allow_nan=False)

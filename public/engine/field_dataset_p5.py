"""P5 field-dataset physics adapter.

Extends the M5/P4 browser-local runpp_3ph path with element- and bus-level
observability required by the real topology cockpit. The aggregate contract is
kept backward compatible; P5 only adds ``assets``, ``asset_series``,
``bus_series``, and ``topology`` fields.
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
    bus_id_by_index = {int(index): bus for bus, index in bus_by_id.items()}

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

    element_kind = {}
    for item in network:
        kind = item["element_type"]
        if kind == "source":
            continue
        if kind == "line":
            index = pp.create_line_from_parameters(
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
            element_kind[item["element_id"]] = ("line", int(index))
        elif kind == "transformer":
            index = pp.create_transformer_from_parameters(
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
            element_kind[item["element_id"]] = ("transformer", int(index))

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
        "bus_id_by_index": bus_id_by_index,
        "element_kind": element_kind,
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
    bus_load_kw = {}
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
        customer = metadata["customer_by_meter"][meter_id]
        phase = customer["phase"].lower()
        for ph in ("a", "b", "c"):
            net.asymmetric_load.at[load_index, f"p_{ph}_mw"] = p_kw / 1000.0 if ph == phase else 0.0
            net.asymmetric_load.at[load_index, f"q_{ph}_mvar"] = q_kvar / 1000.0 if ph == phase else 0.0
        bus = customer["bus_id"]
        bus_load_kw[bus] = bus_load_kw.get(bus, 0.0) + p_kw
        total_kw += p_kw
        total_kvar += q_kvar
    return total_kw, total_kvar, bus_load_kw


def _bus_snapshot(net, metadata, bus_load_kw):
    result = {}
    if not hasattr(net, "res_bus_3ph"):
        return result
    for index, row in net.res_bus_3ph.iterrows():
        bus = metadata["bus_id_by_index"].get(int(index), str(index))
        values = [_f(row.get(f"vm_{phase}_pu", float("nan")), float("nan")) for phase in ("a", "b", "c")]
        finite = [value for value in values if math.isfinite(value)]
        if finite:
            result[bus] = {
                "vm_min_pu": min(finite),
                "vm_max_pu": max(finite),
                "vm_avg_pu": sum(finite) / len(finite),
                "load_kw": float(bus_load_kw.get(bus, 0.0)),
            }
    return result


def _element_snapshot(net, dataset, metadata):
    result = {}
    by_id = {item["element_id"]: item for item in dataset["network"]}
    for element_id, (kind, index) in metadata["element_kind"].items():
        item = by_id[element_id]
        if kind == "line":
            row = net.res_line_3ph.loc[index]
            loss_kw = _phase_endpoint_loss_kw(row, "from", "to")
            loading = _f(row.get("loading_percent", 0.0))
        else:
            row = net.res_trafo_3ph.loc[index]
            loss_kw = _phase_endpoint_loss_kw(row, "hv", "lv")
            loading = _f(row.get("loading_percent", 0.0))
        result[element_id] = {
            "kind": kind,
            "from_bus": item["from_bus"],
            "to_bus": item["to_bus"],
            "loss_kw": loss_kw,
            "loading_percent": loading,
        }
    return result


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
    asset_series = {item["element_id"]: [] for item in dataset["network"] if item["element_type"] != "source"}
    bus_series = {bus: [] for bus in metadata["bus_by_id"]}
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
        load_kw, load_kvar, bus_load_kw = _set_interval_loads(net, metadata, ami, i)
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
        buses = _bus_snapshot(net, metadata, bus_load_kw)
        elements = _element_snapshot(net, dataset, metadata)
        line_loss_kw = sum(item["loss_kw"] for item in elements.values() if item["kind"] == "line")
        trafo_loss_kw = sum(item["loss_kw"] for item in elements.values() if item["kind"] == "transformer")
        loss_kw = line_loss_kw + trafo_loss_kw
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

        point = {
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
        }
        series.append(point)

        for element_id, item in elements.items():
            from_bus = buses.get(item["from_bus"], {})
            to_bus = buses.get(item["to_bus"], {})
            asset_series[element_id].append({
                "index": i,
                "time": point["time"],
                "loss_kw": item["loss_kw"],
                "loading_percent": item["loading_percent"],
                "from_vm_min_pu": from_bus.get("vm_min_pu"),
                "to_vm_min_pu": to_bus.get("vm_min_pu"),
            })
        for bus_id, item in buses.items():
            bus_series[bus_id].append({
                "index": i,
                "time": point["time"],
                **item,
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

    assets = []
    by_id = {item["element_id"]: item for item in dataset["network"]}
    for element_id, points in asset_series.items():
        item = by_id[element_id]
        loss_energy = float(sum(point["loss_kw"] * INTERVAL_HOURS for point in points))
        peak_point = max(points, key=lambda point: point["loss_kw"])
        min_endpoint_voltage = min(
            [value for point in points for value in (point.get("from_vm_min_pu"), point.get("to_vm_min_pu")) if value is not None],
            default=0.0,
        )
        assets.append({
            "element_id": element_id,
            "element_type": item["element_type"],
            "from_bus": item["from_bus"],
            "to_bus": item["to_bus"],
            "loss_kwh": loss_energy,
            "loss_share_percent": loss_energy / loss_kwh * 100.0 if loss_kwh > 0.0 else 0.0,
            "peak_loss_kw": float(peak_point["loss_kw"]),
            "peak_time": peak_point["time"],
            "max_loading_percent": max((point["loading_percent"] for point in points), default=0.0),
            "min_endpoint_voltage_pu": min_endpoint_voltage,
        })

    checks = [
        {"name": "all intervals converged", "pass": converged == INTERVALS, "detail": f"{converged}/{INTERVALS} runpp_3ph"},
        {"name": "technical loss positive", "pass": loss_kwh > 0.0, "detail": f"{loss_kwh:.3f} kWh/day"},
        {"name": "voltage finite", "pass": math.isfinite(min_voltage) and math.isfinite(max_voltage), "detail": f"{min_voltage:.4f}-{max_voltage:.4f} pu"},
        {"name": "loss balance plausible", "pass": supplied_kwh >= load_kwh and loss_kwh < supplied_kwh, "detail": f"source {supplied_kwh:.2f} kWh, load {load_kwh:.2f} kWh"},
        {"name": "asset loss attribution consistent", "pass": abs(sum(item["loss_kwh"] for item in assets) - loss_kwh) <= max(1e-7, abs(loss_kwh) * 1e-8), "detail": f"assets {sum(item['loss_kwh'] for item in assets):.6f} kWh vs total {loss_kwh:.6f} kWh"},
    ]
    gate_pass = all(item["pass"] for item in checks)

    return {
        "schema": "smart-distribution-loss-field-result-v1",
        "dataset_schema": FIELD_SCHEMA,
        "dataset_mode": "field_import",
        "gate": {"pass": gate_pass, "summary": "FIELD PHYSICS PASS" if gate_pass else "FIELD PHYSICS REVIEW"},
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
        "assets": assets,
        "asset_series": asset_series,
        "bus_series": bus_series,
        "topology": {
            "root_bus": metadata["source"]["to_bus"],
            "bus_count": len(metadata["bus_by_id"]),
            "element_count": len(dataset["network"]),
            "physics_attribution": "direct runpp_3ph result rows; no proportional allocation",
        },
        "checks": checks,
        "provenance": {
            "source_type": "user_imported_field_csv",
            "truth_policy": "no hidden truth exists in field mode",
            "solver": "pandapower.runpp_3ph",
            "field_adapter": "P5 asset/bus observability",
            "calibration": "none; field physics requires complete AMI P coverage",
            "asset_attribution": "direct res_line_3ph/res_trafo_3ph endpoint losses",
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

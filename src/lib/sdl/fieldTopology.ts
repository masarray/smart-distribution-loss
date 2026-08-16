import type { FieldDatasetV1, FieldNetworkElement } from "./fieldDataset";

export type FieldTopologySelection =
  | { kind: "source"; id: string }
  | { kind: "element"; id: string }
  | { kind: "bus"; id: string };

export interface FieldTopologyBus {
  id: string;
  kv: number | null;
  depth: number;
  customers: number;
  meters: number;
  incomingElementId: string | null;
  outgoingElementIds: string[];
}

export interface FieldTopologyGraph {
  supported: boolean;
  reason: string | null;
  source: FieldNetworkElement | null;
  rootBusId: string | null;
  buses: FieldTopologyBus[];
  elements: FieldNetworkElement[];
  reachableBusIds: string[];
  maxDepth: number;
}

export function selectionKey(selection: FieldTopologySelection) {
  return `${selection.kind}:${selection.id}`;
}

export function buildFieldTopology(dataset: FieldDatasetV1): FieldTopologyGraph {
  const source = dataset.network.find((item) => item.element_type === "source") ?? null;
  const elements = dataset.network.filter((item) => item.element_type !== "source");
  if (!source?.to_bus) return unsupported(source, elements, "Source tidak memiliki root bus yang valid.");

  const rootBusId = source.to_bus;
  const busKv = new Map<string, number | null>();
  const register = (id: string, kv: number | null) => {
    if (!id) return;
    if (!busKv.has(id)) busKv.set(id, kv);
    else if (busKv.get(id) == null && kv != null) busKv.set(id, kv);
  };
  register(rootBusId, source.to_kv ?? source.from_kv);
  for (const element of elements) {
    register(element.from_bus, element.from_kv);
    register(element.to_bus, element.to_kv);
  }

  const incoming = new Map<string, FieldNetworkElement[]>();
  const outgoing = new Map<string, FieldNetworkElement[]>();
  for (const element of elements) {
    if (!element.from_bus || !element.to_bus) return unsupported(source, elements, `Elemen ${element.element_id} memiliki bus yang tidak lengkap.`);
    const inList = incoming.get(element.to_bus) ?? [];
    inList.push(element);
    incoming.set(element.to_bus, inList);
    const outList = outgoing.get(element.from_bus) ?? [];
    outList.push(element);
    outgoing.set(element.from_bus, outList);
  }

  if ((incoming.get(rootBusId)?.length ?? 0) > 0) return unsupported(source, elements, `Root bus ${rootBusId} memiliki elemen upstream; topology radial tidak dapat dipastikan.`);
  for (const [bus, list] of incoming.entries()) {
    if (list.length > 1) return unsupported(source, elements, `Bus ${bus} memiliki lebih dari satu parent; topology mesh/loop belum didukung.`);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const depth = new Map<string, number>([[rootBusId, 0]]);
  let cycle: string | null = null;
  const walk = (bus: string) => {
    if (cycle) return;
    if (visiting.has(bus)) {
      cycle = bus;
      return;
    }
    if (visited.has(bus)) return;
    visiting.add(bus);
    const children = outgoing.get(bus) ?? [];
    for (const element of children) {
      const child = element.to_bus;
      depth.set(child, Math.max(depth.get(child) ?? 0, (depth.get(bus) ?? 0) + 1));
      walk(child);
    }
    visiting.delete(bus);
    visited.add(bus);
  };
  walk(rootBusId);
  if (cycle) return unsupported(source, elements, `Loop terdeteksi di sekitar bus ${cycle}; renderer P5 hanya mendukung topology radial.`);

  const unreachableElements = elements.filter((element) => !visited.has(element.from_bus) || !visited.has(element.to_bus));
  if (unreachableElements.length) {
    return unsupported(source, elements, `Topology terputus: ${unreachableElements.map((item) => item.element_id).slice(0, 3).join(", ")}.`);
  }

  const unreachableCustomers = dataset.customers.filter((customer) => !visited.has(customer.bus_id));
  if (unreachableCustomers.length) {
    return unsupported(source, elements, `Pelanggan pada bus ${unreachableCustomers[0]?.bus_id ?? "?"} tidak terhubung ke source.`);
  }

  const customerCounts = new Map<string, number>();
  const meterCounts = new Map<string, Set<string>>();
  for (const customer of dataset.customers) {
    customerCounts.set(customer.bus_id, (customerCounts.get(customer.bus_id) ?? 0) + 1);
    const meters = meterCounts.get(customer.bus_id) ?? new Set<string>();
    meters.add(customer.meter_id);
    meterCounts.set(customer.bus_id, meters);
  }

  const buses: FieldTopologyBus[] = [...visited]
    .map((id) => ({
      id,
      kv: busKv.get(id) ?? null,
      depth: depth.get(id) ?? 0,
      customers: customerCounts.get(id) ?? 0,
      meters: meterCounts.get(id)?.size ?? 0,
      incomingElementId: incoming.get(id)?.[0]?.element_id ?? null,
      outgoingElementIds: (outgoing.get(id) ?? []).map((item) => item.element_id),
    }))
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));

  return {
    supported: true,
    reason: null,
    source,
    rootBusId,
    buses,
    elements,
    reachableBusIds: [...visited],
    maxDepth: Math.max(0, ...buses.map((bus) => bus.depth)),
  };
}

function unsupported(source: FieldNetworkElement | null, elements: FieldNetworkElement[], reason: string): FieldTopologyGraph {
  return {
    supported: false,
    reason,
    source,
    rootBusId: source?.to_bus ?? null,
    buses: [],
    elements,
    reachableBusIds: [],
    maxDepth: 0,
  };
}

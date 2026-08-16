import type { FieldDatasetV1, FieldNetworkElement } from "./fieldDataset";

export type FieldTopologySelection =
  | { kind: "source"; id: string }
  | { kind: "element"; id: string }
  | { kind: "bus"; id: string };

export type FieldTopologyIssueCode =
  | "SOURCE_ROOT"
  | "ELEMENT_BUS"
  | "ROOT_PARENT"
  | "MULTI_PARENT"
  | "CYCLE"
  | "DISCONNECTED"
  | "UNREACHABLE_CUSTOMER";

export interface FieldTopologyIssue {
  code: FieldTopologyIssueCode;
  message: string;
  busIds: string[];
  elementIds: string[];
  customerIds: string[];
}

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
  issues: FieldTopologyIssue[];
  source: FieldNetworkElement | null;
  rootBusId: string | null;
  buses: FieldTopologyBus[];
  elements: FieldNetworkElement[];
  reachableBusIds: string[];
  leafBusIds: string[];
  branchBusIds: string[];
  maxDepth: number;
}

export interface FieldTopologyNavigation {
  upstream: FieldTopologySelection | null;
  downstream: FieldTopologySelection[];
}

export function selectionKey(selection: FieldTopologySelection) {
  return `${selection.kind}:${selection.id}`;
}

export function buildFieldTopology(dataset: FieldDatasetV1): FieldTopologyGraph {
  const source = dataset.network.find((item) => item.element_type === "source") ?? null;
  const elements = dataset.network.filter((item) => item.element_type !== "source");
  if (!source?.to_bus) {
    return unsupported(source, elements, [issue("SOURCE_ROOT", "Source tidak memiliki root bus yang valid.", [], source ? [source.element_id] : [])]);
  }

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
  const structuralIssues: FieldTopologyIssue[] = [];
  for (const element of elements) {
    if (!element.from_bus || !element.to_bus) {
      structuralIssues.push(issue(
        "ELEMENT_BUS",
        `Elemen ${element.element_id} memiliki bus yang tidak lengkap.`,
        [element.from_bus, element.to_bus].filter(Boolean),
        [element.element_id],
      ));
      continue;
    }
    const inList = incoming.get(element.to_bus) ?? [];
    inList.push(element);
    incoming.set(element.to_bus, inList);
    const outList = outgoing.get(element.from_bus) ?? [];
    outList.push(element);
    outgoing.set(element.from_bus, outList);
  }

  const rootParents = incoming.get(rootBusId) ?? [];
  if (rootParents.length) {
    structuralIssues.push(issue(
      "ROOT_PARENT",
      `Root bus ${rootBusId} memiliki elemen upstream; topology radial tidak dapat dipastikan.`,
      [rootBusId],
      rootParents.map((item) => item.element_id),
    ));
  }
  for (const [bus, list] of incoming.entries()) {
    if (list.length > 1) {
      structuralIssues.push(issue(
        "MULTI_PARENT",
        `Bus ${bus} memiliki ${list.length} parent; topology mesh/loop belum didukung untuk cockpit operasional.`,
        [bus],
        list.map((item) => item.element_id),
      ));
    }
  }
  if (structuralIssues.length) return unsupported(source, elements, structuralIssues);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const depth = new Map<string, number>([[rootBusId, 0]]);
  let cycleBus: string | null = null;
  const walk = (bus: string) => {
    if (cycleBus) return;
    if (visiting.has(bus)) {
      cycleBus = bus;
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

  const connectivityIssues: FieldTopologyIssue[] = [];
  if (cycleBus) {
    const involved = elements.filter((element) => element.from_bus === cycleBus || element.to_bus === cycleBus);
    connectivityIssues.push(issue(
      "CYCLE",
      `Loop terdeteksi di sekitar bus ${cycleBus}; topology operasional saat ini hanya mendukung jaringan radial.`,
      [cycleBus],
      involved.map((item) => item.element_id),
    ));
  }

  const unreachableElements = elements.filter((element) => !visited.has(element.from_bus) || !visited.has(element.to_bus));
  if (unreachableElements.length) {
    connectivityIssues.push(issue(
      "DISCONNECTED",
      `Topology terputus pada ${unreachableElements.length} elemen; perbaiki koneksi ke source sebelum aktivasi.`,
      [...new Set(unreachableElements.flatMap((item) => [item.from_bus, item.to_bus]).filter(Boolean))],
      unreachableElements.map((item) => item.element_id),
    ));
  }

  const unreachableCustomers = dataset.customers.filter((customer) => !visited.has(customer.bus_id));
  if (unreachableCustomers.length) {
    connectivityIssues.push(issue(
      "UNREACHABLE_CUSTOMER",
      `${unreachableCustomers.length} pelanggan berada pada bus yang tidak terhubung ke source.`,
      [...new Set(unreachableCustomers.map((customer) => customer.bus_id))],
      [],
      unreachableCustomers.map((customer) => customer.customer_id),
    ));
  }
  if (connectivityIssues.length) return unsupported(source, elements, connectivityIssues);

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

  const leafBusIds = buses.filter((bus) => bus.outgoingElementIds.length === 0).map((bus) => bus.id);
  const branchBusIds = buses.filter((bus) => bus.outgoingElementIds.length > 1).map((bus) => bus.id);

  return {
    supported: true,
    reason: null,
    issues: [],
    source,
    rootBusId,
    buses,
    elements,
    reachableBusIds: [...visited],
    leafBusIds,
    branchBusIds,
    maxDepth: Math.max(0, ...buses.map((bus) => bus.depth)),
  };
}

export function getTopologyNavigation(graph: FieldTopologyGraph, selection: FieldTopologySelection): FieldTopologyNavigation {
  if (!graph.supported || !graph.source || !graph.rootBusId) return { upstream: null, downstream: [] };

  if (selection.kind === "source") {
    return {
      upstream: null,
      downstream: [{ kind: "bus", id: graph.rootBusId }],
    };
  }

  if (selection.kind === "element") {
    const element = graph.elements.find((item) => item.element_id === selection.id);
    if (!element) return { upstream: null, downstream: [] };
    return {
      upstream: { kind: "bus", id: element.from_bus },
      downstream: [{ kind: "bus", id: element.to_bus }],
    };
  }

  const bus = graph.buses.find((item) => item.id === selection.id);
  if (!bus) return { upstream: null, downstream: [] };
  const upstream: FieldTopologySelection | null = bus.incomingElementId
    ? { kind: "element", id: bus.incomingElementId }
    : bus.id === graph.rootBusId
      ? { kind: "source", id: graph.source.element_id }
      : null;
  return {
    upstream,
    downstream: bus.outgoingElementIds.map((id) => ({ kind: "element" as const, id })),
  };
}

export function getTopologyPathElementIds(graph: FieldTopologyGraph, selection: FieldTopologySelection) {
  const path = new Set<string>();
  if (!graph.supported || !graph.rootBusId || selection.kind === "source") return path;

  const incomingByBus = new Map(graph.buses.map((bus) => [bus.id, bus.incomingElementId]));
  const elementById = new Map(graph.elements.map((element) => [element.element_id, element]));
  let cursorBus: string | null = null;

  if (selection.kind === "element") {
    const selectedElement = elementById.get(selection.id);
    if (!selectedElement) return path;
    path.add(selectedElement.element_id);
    cursorBus = selectedElement.from_bus;
  } else {
    cursorBus = selection.id;
  }

  const guard = new Set<string>();
  while (cursorBus && cursorBus !== graph.rootBusId && !guard.has(cursorBus)) {
    guard.add(cursorBus);
    const incomingId = incomingByBus.get(cursorBus);
    if (!incomingId) break;
    path.add(incomingId);
    cursorBus = elementById.get(incomingId)?.from_bus ?? null;
  }
  return path;
}

function issue(
  code: FieldTopologyIssueCode,
  message: string,
  busIds: string[] = [],
  elementIds: string[] = [],
  customerIds: string[] = [],
): FieldTopologyIssue {
  return {
    code,
    message,
    busIds: [...new Set(busIds.filter(Boolean))],
    elementIds: [...new Set(elementIds.filter(Boolean))],
    customerIds: [...new Set(customerIds.filter(Boolean))],
  };
}

function unsupported(source: FieldNetworkElement | null, elements: FieldNetworkElement[], issues: FieldTopologyIssue[]): FieldTopologyGraph {
  return {
    supported: false,
    reason: issues[0]?.message ?? "Topology belum didukung.",
    issues,
    source,
    rootBusId: source?.to_bus ?? null,
    buses: [],
    elements,
    reachableBusIds: [],
    leafBusIds: [],
    branchBusIds: [],
    maxDepth: 0,
  };
}

import type { FieldAssetSeriesPoint, P5FieldDatasetResult } from "./fieldAsset";
import type { FieldAssetPriority, FieldAssetPriorityStatus } from "./fieldIntelligence";
import type { FieldOperationalSession } from "./fieldOperational";
import type { FieldTopologyGraph, FieldTopologySelection } from "./fieldTopology";

export type FieldInvestigationFactor = "LOSS" | "LOADING" | "VOLTAGE";

export interface FieldInvestigationWorstLoss {
  time: string;
  lossKw: number;
}

export interface FieldInvestigationWorstLoading {
  time: string;
  loadingPercent: number;
}

export interface FieldInvestigationWorstVoltage {
  time: string;
  voltagePu: number;
  busId: string;
}

export interface FieldInvestigationChecklistItem {
  id: string;
  title: string;
  evidence: string;
}

export interface FieldInvestigationPlan {
  elementId: string;
  elementType: "line" | "transformer";
  fromBus: string;
  toBus: string;
  priorityRank: number | null;
  priorityStatus: FieldAssetPriorityStatus | null;
  priorityScore: number | null;
  dominantFactor: FieldInvestigationFactor;
  scorePoints: {
    loss: number;
    loading: number;
    voltage: number;
  };
  summary: string;
  anchorTime: string;
  worstLoss: FieldInvestigationWorstLoss | null;
  worstLoading: FieldInvestigationWorstLoading | null;
  worstVoltage: FieldInvestigationWorstVoltage | null;
  upstreamElementIds: string[];
  downstreamElementIds: string[];
  downstreamBusIds: string[];
  downstreamCustomers: number;
  checklist: FieldInvestigationChecklistItem[];
}

export function deriveFieldInvestigationPlan(
  session: FieldOperationalSession,
  graph: FieldTopologyGraph,
  selection: FieldTopologySelection,
  priority: FieldAssetPriority | null,
): FieldInvestigationPlan | null {
  if (selection.kind !== "element" || !graph.supported) return null;

  const result = session.result as P5FieldDatasetResult;
  const asset = result.assets?.find((item) => item.element_id === selection.id);
  const series = result.asset_series?.[selection.id] ?? [];
  const element = session.dataset.network.find((item) => item.element_id === selection.id && item.element_type !== "source");
  if (!asset || !element || !series.length || (element.element_type !== "line" && element.element_type !== "transformer")) return null;

  const worstLoss = findWorstLoss(series);
  const worstLoading = findWorstLoading(series);
  const worstVoltage = findWorstVoltage(series, asset.from_bus, asset.to_bus);
  const scorePoints = priority
    ? {
        loss: priority.lossScore * 0.45,
        loading: priority.loadingScore * 0.35,
        voltage: priority.voltageScore * 0.2,
      }
    : { loss: 0, loading: 0, voltage: 0 };
  const dominantFactor = dominant(scorePoints, asset.loss_share_percent, asset.max_loading_percent, asset.min_endpoint_voltage_pu);
  const anchorTime = dominantFactor === "LOADING"
    ? worstLoading?.time
    : dominantFactor === "VOLTAGE"
      ? worstVoltage?.time
      : worstLoss?.time;
  const resolvedAnchor = anchorTime ?? worstLoss?.time ?? worstLoading?.time ?? worstVoltage?.time ?? "—";
  const upstreamElementIds = orderedUpstreamElements(graph, selection.id, asset.from_bus);
  const downstream = collectDownstream(graph, asset.to_bus);
  const downstreamCustomers = downstream.busIds.reduce(
    (sum, busId) => sum + (graph.buses.find((bus) => bus.id === busId)?.customers ?? 0),
    0,
  );

  return {
    elementId: asset.element_id,
    elementType: asset.element_type,
    fromBus: asset.from_bus,
    toBus: asset.to_bus,
    priorityRank: priority?.rank ?? null,
    priorityStatus: priority?.status ?? null,
    priorityScore: priority?.score ?? null,
    dominantFactor,
    scorePoints,
    summary: investigationSummary(asset.element_id, priority, dominantFactor, resolvedAnchor),
    anchorTime: resolvedAnchor,
    worstLoss,
    worstLoading,
    worstVoltage,
    upstreamElementIds,
    downstreamElementIds: downstream.elementIds,
    downstreamBusIds: downstream.busIds,
    downstreamCustomers,
    checklist: buildChecklist({
      element,
      asset,
      dominantFactor,
      worstLoss,
      worstLoading,
      worstVoltage,
      downstreamCustomers,
      anchorTime: resolvedAnchor,
    }),
  };
}

function findWorstLoss(series: FieldAssetSeriesPoint[]): FieldInvestigationWorstLoss | null {
  const point = maxBy(series, (item) => item.loss_kw);
  return point ? { time: point.time, lossKw: point.loss_kw } : null;
}

function findWorstLoading(series: FieldAssetSeriesPoint[]): FieldInvestigationWorstLoading | null {
  const point = maxBy(series, (item) => item.loading_percent);
  return point ? { time: point.time, loadingPercent: point.loading_percent } : null;
}

function findWorstVoltage(series: FieldAssetSeriesPoint[], fromBus: string, toBus: string): FieldInvestigationWorstVoltage | null {
  let worst: FieldInvestigationWorstVoltage | null = null;
  for (const point of series) {
    const candidates = [
      { value: point.from_vm_min_pu, busId: fromBus },
      { value: point.to_vm_min_pu, busId: toBus },
    ];
    for (const candidate of candidates) {
      if (candidate.value == null || !Number.isFinite(candidate.value)) continue;
      if (!worst || candidate.value < worst.voltagePu) {
        worst = { time: point.time, voltagePu: candidate.value, busId: candidate.busId };
      }
    }
  }
  return worst;
}

function dominant(
  points: FieldInvestigationPlan["scorePoints"],
  lossSharePercent: number,
  loadingPercent: number,
  minVoltagePu: number,
): FieldInvestigationFactor {
  if (points.loss || points.loading || points.voltage) {
    if (points.loading > points.loss && points.loading >= points.voltage) return "LOADING";
    if (points.voltage > points.loss && points.voltage > points.loading) return "VOLTAGE";
    return "LOSS";
  }
  if (loadingPercent > 100) return "LOADING";
  if (minVoltagePu < 0.9) return "VOLTAGE";
  return lossSharePercent >= 0 ? "LOSS" : "LOADING";
}

function orderedUpstreamElements(graph: FieldTopologyGraph, selectedElementId: string, fromBus: string) {
  const elementById = new Map(graph.elements.map((element) => [element.element_id, element]));
  const incomingByBus = new Map(graph.buses.map((bus) => [bus.id, bus.incomingElementId]));
  const reverse: string[] = [];
  const guard = new Set<string>();
  let bus: string | null = fromBus;
  while (bus && bus !== graph.rootBusId && !guard.has(bus)) {
    guard.add(bus);
    const incomingId = incomingByBus.get(bus);
    if (!incomingId || incomingId === selectedElementId) break;
    reverse.push(incomingId);
    bus = elementById.get(incomingId)?.from_bus ?? null;
  }
  return reverse.reverse();
}

function collectDownstream(graph: FieldTopologyGraph, startBus: string) {
  const elementById = new Map(graph.elements.map((element) => [element.element_id, element]));
  const busById = new Map(graph.buses.map((bus) => [bus.id, bus]));
  const busIds: string[] = [];
  const elementIds: string[] = [];
  const queue = [startBus];
  const visited = new Set<string>();

  while (queue.length) {
    const busId = queue.shift();
    if (!busId || visited.has(busId)) continue;
    visited.add(busId);
    busIds.push(busId);
    const bus = busById.get(busId);
    for (const elementId of bus?.outgoingElementIds ?? []) {
      if (!elementIds.includes(elementId)) elementIds.push(elementId);
      const nextBus = elementById.get(elementId)?.to_bus;
      if (nextBus && !visited.has(nextBus)) queue.push(nextBus);
    }
  }

  return { busIds, elementIds };
}

function buildChecklist({
  element,
  asset,
  dominantFactor,
  worstLoss,
  worstLoading,
  worstVoltage,
  downstreamCustomers,
  anchorTime,
}: {
  element: FieldOperationalSession["dataset"]["network"][number];
  asset: P5FieldDatasetResult["assets"] extends Array<infer T> | undefined ? T : never;
  dominantFactor: FieldInvestigationFactor;
  worstLoss: FieldInvestigationWorstLoss | null;
  worstLoading: FieldInvestigationWorstLoading | null;
  worstVoltage: FieldInvestigationWorstVoltage | null;
  downstreamCustomers: number;
  anchorTime: string;
}): FieldInvestigationChecklistItem[] {
  const identity = element.element_type === "transformer"
    ? {
        id: "identity",
        title: "Cocokkan identitas dan nameplate trafo",
        evidence: `${element.element_id} · ${element.from_bus} → ${element.to_bus} · ${fmt(element.rated_kva, 0)} kVA · uk ${fmt(element.vk_percent, 2)}% · ${element.vector_group ?? "vector group —"}`,
      }
    : {
        id: "identity",
        title: "Cocokkan identitas dan parameter saluran",
        evidence: `${element.element_id} · ${element.from_bus} → ${element.to_bus} · ${fmt(element.length_km, 3)} km · R ${fmt(element.r_ohm_per_km, 3)} Ω/km · rating ${fmt(element.max_i_ka, 3)} kA`,
      };

  const loading: FieldInvestigationChecklistItem = {
    id: "loading",
    title: `Ukur arus tiga fasa sekitar ${worstLoading?.time ?? anchorTime}`,
    evidence: worstLoading ? `Loading model maksimum ${worstLoading.loadingPercent.toFixed(1)}% pada ${worstLoading.time}.` : "Seri loading tidak tersedia.",
  };
  const voltage: FieldInvestigationChecklistItem = {
    id: "voltage",
    title: `Ukur tegangan endpoint sekitar ${worstVoltage?.time ?? anchorTime}`,
    evidence: worstVoltage ? `Minimum ${worstVoltage.voltagePu.toFixed(3)} pu pada ${worstVoltage.busId} · ${worstVoltage.time}.` : "Seri tegangan endpoint tidak tersedia.",
  };
  const loss: FieldInvestigationChecklistItem = element.element_type === "transformer"
    ? {
        id: "loss-condition",
        title: "Verifikasi koneksi HV/LV, tap, dan parameter rugi trafo",
        evidence: `${asset.loss_share_percent.toFixed(1)}% kontribusi susut · puncak ${worstLoss?.lossKw.toFixed(3) ?? "—"} kW pada ${worstLoss?.time ?? "—"}; gunakan hasil lapangan untuk menguji data nameplate/model, bukan untuk mengasumsikan kerusakan.`,
      }
    : {
        id: "loss-condition",
        title: "Verifikasi sambungan, terminasi, panjang, dan parameter resistansi",
        evidence: `${asset.loss_share_percent.toFixed(1)}% kontribusi susut · puncak ${worstLoss?.lossKw.toFixed(3) ?? "—"} kW pada ${worstLoss?.time ?? "—"}; perbedaan lapangan harus ditelusuri ke parameter/as-built sebelum kesimpulan kondisi aset.`,
      };
  const downstream: FieldInvestigationChecklistItem = {
    id: "downstream",
    title: `Konfirmasi mapping beban downstream sekitar ${anchorTime}`,
    evidence: `${downstreamCustomers} pelanggan berada pada subtree downstream aset ini menurut topology yang diimpor.`,
  };

  const orderedSignals = dominantFactor === "LOADING"
    ? [loading, voltage, loss]
    : dominantFactor === "VOLTAGE"
      ? [voltage, loading, loss]
      : [loss, loading, voltage];
  return downstreamCustomers > 0 ? [identity, ...orderedSignals, downstream] : [identity, ...orderedSignals];
}

function investigationSummary(elementId: string, priority: FieldAssetPriority | null, factor: FieldInvestigationFactor, anchorTime: string) {
  const rank = priority ? `Prioritas #${priority.rank} (skor ${priority.score.toFixed(0)})` : "Aset terpilih";
  const factorLabel = factor === "LOSS" ? "kontribusi susut" : factor === "LOADING" ? "loading" : "tegangan endpoint";
  return `${rank}: ${elementId}. Mulai verifikasi ${factorLabel} pada interval ${anchorTime}, lalu cocokkan bukti lapangan terhadap parameter dataset.`;
}

function maxBy<T>(items: T[], value: (item: T) => number) {
  let winner: T | null = null;
  let best = -Infinity;
  for (const item of items) {
    const candidate = value(item);
    if (!Number.isFinite(candidate)) continue;
    if (candidate > best) {
      best = candidate;
      winner = item;
    }
  }
  return winner;
}

function fmt(value: number | null | undefined, digits: number) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

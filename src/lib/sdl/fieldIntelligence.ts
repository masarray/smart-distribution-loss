import type { FieldAssetSummary } from "./fieldAsset";
import type { FieldTopologySelection } from "./fieldTopology";

export type FieldAssetPriorityStatus = "CRITICAL" | "ATTENTION" | "WATCH" | "NORMAL";

export interface FieldAssetPriority {
  rank: number;
  elementId: string;
  elementType: FieldAssetSummary["element_type"];
  status: FieldAssetPriorityStatus;
  score: number;
  lossScore: number;
  loadingScore: number;
  voltageScore: number;
  lossSharePercent: number;
  maxLoadingPercent: number;
  minVoltagePu: number;
  reason: string;
  selection: FieldTopologySelection;
}

/**
 * Deterministic P7 asset-priority model.
 *
 * Inputs come only from direct P5 solver observability:
 * - per-element technical-loss contribution
 * - per-element maximum loading
 * - minimum endpoint voltage
 *
 * No synthetic topology, inferred loss allocation, hidden truth, or free-form AI
 * judgement is introduced here.
 */
export function deriveFieldAssetPriorities(assets: FieldAssetSummary[]): FieldAssetPriority[] {
  const ranked = assets.map((asset) => {
    const lossScore = clamp(asset.loss_share_percent / 0.4, 0, 100);
    const loadingScore = clamp((asset.max_loading_percent - 55) / 0.65, 0, 100);
    const voltageScore = clamp((1 - asset.min_endpoint_voltage_pu) * 1000, 0, 100);
    const score = clamp(lossScore * 0.45 + loadingScore * 0.35 + voltageScore * 0.2, 0, 100);
    const status = priorityStatus(asset, score);

    return {
      rank: 0,
      elementId: asset.element_id,
      elementType: asset.element_type,
      status,
      score,
      lossScore,
      loadingScore,
      voltageScore,
      lossSharePercent: asset.loss_share_percent,
      maxLoadingPercent: asset.max_loading_percent,
      minVoltagePu: asset.min_endpoint_voltage_pu,
      reason: priorityReason(asset, score),
      selection: { kind: "element" as const, id: asset.element_id },
    };
  });

  ranked.sort((a, b) =>
    b.score - a.score
    || b.lossSharePercent - a.lossSharePercent
    || b.maxLoadingPercent - a.maxLoadingPercent
    || a.minVoltagePu - b.minVoltagePu
    || a.elementId.localeCompare(b.elementId),
  );

  return ranked.map((item, index) => ({ ...item, rank: index + 1 }));
}

export function fieldPriorityHeadline(priority: FieldAssetPriority | null) {
  if (!priority) return "Belum ada prioritas aset";
  if (priority.status === "CRITICAL") return `${priority.elementId} perlu ditinjau segera`;
  if (priority.status === "ATTENTION") return `${priority.elementId} menjadi prioritas utama`;
  if (priority.status === "WATCH") return `${priority.elementId} perlu dipantau`;
  return `${priority.elementId} memiliki skor tertinggi`;
}

function priorityStatus(asset: FieldAssetSummary, score: number): FieldAssetPriorityStatus {
  if (asset.max_loading_percent > 100 || asset.min_endpoint_voltage_pu < 0.9) return "CRITICAL";
  if (score >= 55 || asset.max_loading_percent >= 85 || asset.min_endpoint_voltage_pu < 0.95) return "ATTENTION";
  if (score >= 30) return "WATCH";
  return "NORMAL";
}

function priorityReason(asset: FieldAssetSummary, score: number) {
  if (asset.max_loading_percent > 100) {
    return `Loading ${asset.max_loading_percent.toFixed(1)}% melewati rating aset.`;
  }
  if (asset.min_endpoint_voltage_pu < 0.9) {
    return `Endpoint minimum ${asset.min_endpoint_voltage_pu.toFixed(3)} pu berada di bawah batas cockpit.`;
  }
  if (asset.loss_share_percent >= 30) {
    return `Kontribusi susut ${asset.loss_share_percent.toFixed(1)}% paling dominan pada jaringan.`;
  }
  if (asset.max_loading_percent >= 85) {
    return `Loading maksimum ${asset.max_loading_percent.toFixed(1)}% mendekati rating aset.`;
  }
  if (asset.min_endpoint_voltage_pu < 0.95) {
    return `Endpoint minimum ${asset.min_endpoint_voltage_pu.toFixed(3)} pu perlu dipantau.`;
  }
  return `Skor prioritas ${score.toFixed(0)} dari kontribusi susut, loading, dan tegangan endpoint.`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
